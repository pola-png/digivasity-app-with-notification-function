import express from "express";
import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { isAdminUserLike, isAllowlistedAdminEmail } from "./src/lib/admin";
import {
  bootstrapAppwrite,
  createNews,
  createNewsNotification,
  deleteNews,
  getNews,
  getUserProfile,
  listNews,
  listUsers,
  removeUserPushToken,
  syncUserPushToken,
  updateNews,
  upsertUserProfile,
  uploadNewsImage,
} from "./src/lib/appwriteBackend";
import { Client as AppwriteClient, Account } from "node-appwrite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";

function getGeminiClient() {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini backend is not configured. Set GEMINI_API_KEY on the server.");
  }

  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function sendTextStream(res: express.Response, text: string) {
  res.write(text);
}

async function streamGeminiPrompt(res: express.Response, contents: string) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
  });

  for await (const chunk of response) {
    if (chunk.text) {
      sendTextStream(res, chunk.text);
    }
  }
}

function getRequestJwt(req: express.Request) {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing authorization token");
  }
  return match[1];
}

function getAppwriteAuthClient(jwt: string) {
  const endpoint = process.env.APPWRITE_ENDPOINT?.trim() || process.env.VITE_APPWRITE_ENDPOINT?.trim() || "https://fra.cloud.appwrite.io/v1";
  const projectId = process.env.APPWRITE_PROJECT_ID?.trim() || process.env.VITE_APPWRITE_PROJECT_ID?.trim();

  if (!endpoint || !projectId) {
    throw new Error("Appwrite is not configured");
  }

  return new AppwriteClient()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setJWT(jwt);
}

async function getAuthenticatedAccount(req: express.Request) {
  const jwt = getRequestJwt(req);
  const client = getAppwriteAuthClient(jwt);
  const account = new Account(client);
  const currentUser = await account.get();
  const existingProfile = await getUserProfile(currentUser.$id);
  const profile = await upsertUserProfile({
    ...(existingProfile || {}),
    uid: currentUser.$id,
    email: currentUser.email || null,
    fullName: currentUser.name || existingProfile?.fullName || currentUser.email || "",
    displayName: currentUser.name || existingProfile?.displayName || currentUser.email || "",
    whatsapp: existingProfile?.whatsapp,
  });

  return {
    jwt,
    account,
    currentUser,
    profile,
  };
}

async function verifyAdminRequest(req: express.Request) {
  const auth = await getAuthenticatedAccount(req);
  const isAdmin = isAdminUserLike({
    role: auth.profile.role,
    admin: auth.profile.admin,
    email: auth.currentUser.email,
    emailVerified: auth.currentUser.emailVerification,
  }) || isAllowlistedAdminEmail(auth.currentUser.email);

  if (isAdmin) {
    return { uid: auth.currentUser.$id, user: auth.profile, account: auth.currentUser };
  }

  throw new Error("Forbidden");
}

function serializeNewsDocument(doc: any) {
  const data = doc.data() || {};
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null;
  const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null;

  return {
    id: doc.id,
    title: data.title || "",
    excerpt: data.excerpt || data.summary || "",
    summary: data.summary || data.excerpt || "",
    content: data.content || "",
    imageUrl: data.imageUrl || "",
    date: data.date || "",
    createdAt,
    updatedAt,
    createdBy: data.createdBy || "",
    authorUid: data.authorUid || "",
    authorName: data.authorName || "",
    category: data.category || "news",
    slug: data.slug || "",
    status: data.status || "published",
    links: Array.isArray(data.links) ? data.links : [],
  };
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = Number(process.env.PORT) || 3000;
  const allowedOrigin = process.env.APP_PUBLIC_ORIGIN || process.env.VITE_APP_ORIGIN || "*";

  try {
    await bootstrapAppwrite();
    console.log("Appwrite backend ready");
  } catch (error) {
    console.warn("Appwrite bootstrap failed:", error);
  }

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Push-Secret");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.get("/__/auth/handler", (req, res, next) => {
    const url = new URL(req.originalUrl, `http://${req.headers.host || "localhost"}`);
    const mode = url.searchParams.get("mode");
    if (mode !== "verifyEmail") {
      return next();
    }

    res.redirect(302, `/${url.search}${url.hash}`);
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join_room", (room) => {
      socket.join(room);
      console.log(`User ${socket.id} joined room: ${room}`);
    });

    socket.on("send_message", (data) => {
      // Broadcast to everyone in the room
      io.to(data.room).emit("receive_message", {
        id: Math.random().toString(36).substr(2, 9),
        text: data.text,
        sender: data.sender,
        role: data.role,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { message, systemInstruction } = req.body || {};
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Missing message" });
      }

      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Transfer-Encoding", "chunked");

      const instruction =
        typeof systemInstruction === "string" && systemInstruction.trim()
          ? systemInstruction.trim()
          : "You are Digivasity AI, a helpful overseas education advisor.";
      const fullMessage = `System Instruction: ${instruction}\n\nUser Message: ${message.trim()}`;
      await streamGeminiPrompt(res, fullMessage);
      return res.end();
    } catch (error) {
      console.error("Gemini chat error:", error);
      const message = error instanceof Error ? error.message : "Unable to process Gemini request";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/gemini/universities", async (req, res) => {
    try {
      const profile = req.body || {};
      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Transfer-Encoding", "chunked");

      const prompt = `
        Find universities and courses for a student with the following profile:
        - Country of Residence: ${profile.residence}
        - Target Country for Study: ${profile.targetCountry}
        - Highest Academic Qualification: ${profile.qualification}
        - BSc CGPA: ${profile.cgpa}
        - English Test Score: ${profile.englishScore}
        - Course of Interest: ${profile.course}
        - Program of Interest: ${profile.program}

        Provide a shortlisted list of 3-5 universities in ${profile.targetCountry} that the student qualifies for. 

        CRITICAL: Prioritize universities with the CHEAPEST tuition fees available in ${profile.targetCountry} for this course.

        For each entry, include:
        1. University & Course Name
        2. Tuition Fees (Local & ${profile.residence} currency)
        3. Available Intakes (2026/2027)
        4. Application Status (Open/Closed/Opening Soon)
        5. Specific Scholarships

        FORMATTING: Use clear headings and bullet points. Double newline between entries.
      `;
      await streamGeminiPrompt(res, prompt);
      return res.end();
    } catch (error) {
      console.error("Gemini universities error:", error);
      const message = error instanceof Error ? error.message : "Unable to process Gemini request";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/gemini/pof", async (req, res) => {
    try {
      const data = req.body || {};
      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Transfer-Encoding", "chunked");

      const prompt = `
        Calculate Proof of Funds (POF) for:
        - Residence: ${data.residence}
        - Target: ${data.targetCountry}
        - University: ${data.university}
        - Program: ${data.program}
        - Dependants: ${data.dependants}

        Provide:
        1. Tuition Fees (1st year)
        2. Living Expenses (Student + ${data.dependants} dependants)
        3. Total Required POF
        4. Recommended Total (includes 10% buffer for currency fluctuation)
        5. Brief breakdown of visa financial rules for ${data.targetCountry}.

        CRITICAL: Show the "Recommended Total" clearly in ${data.residence} currency.
      `;
      await streamGeminiPrompt(res, prompt);
      return res.end();
    } catch (error) {
      console.error("Gemini POF error:", error);
      const message = error instanceof Error ? error.message : "Unable to process Gemini request";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/gemini/visa", async (req, res) => {
    try {
      const data = req.body || {};
      res.status(200);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Transfer-Encoding", "chunked");

      const prompt = `
        Visa guide for ${data.nationality} student going to ${data.destination} for ${data.program}:

        Provide:
        1. Step-by-step checklist.
        2. Total cost (fees + health surcharge) in ${data.nationality} currency.
        3. Processing time & Approval rates.
        4. Top 3 tips to avoid rejection.
      `;
      await streamGeminiPrompt(res, prompt);
      return res.end();
    } catch (error) {
      console.error("Gemini visa error:", error);
      const message = error instanceof Error ? error.message : "Unable to process Gemini request";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    const { transaction_id, planId } = req.body;
    if (!transaction_id || !planId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const auth = await getAuthenticatedAccount(req);
      const verifyRes = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      const data = await verifyRes.json() as any;

      if (data.status !== "success" || data.data.status !== "successful") {
        return res.status(400).json({ error: "Payment verification failed" });
      }

      const uid = auth.currentUser.$id;
      const existingUser: any = auth.profile || {
        uid,
        email: auth.currentUser.email || null,
        fullName: auth.currentUser.name || '',
        displayName: auth.currentUser.name || '',
        admi: false,
        role: 'user',
        admin: false,
        createdAt: new Date().toISOString(),
        credits: 5,
        lastCreditRefresh: new Date().toISOString().split('T')[0],
        subscription: { type: 'none', expiresAt: null },
        pushTokens: [],
        pushPreferences: { transactional: true, marketing: true },
      };

      if (planId === "basic") {
        await upsertUserProfile({
          ...existingUser,
          credits: (existingUser.credits || 0) + 5,
        });
      } else {
        const days = planId === "unlimited_3" ? 3 : 7;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        await upsertUserProfile({
          ...existingUser,
          subscription: {
            type: planId === "unlimited_3" ? "3days" : "7days",
            expiresAt: expiresAt.toISOString(),
          },
        });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("Payment verification error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/user/me", async (req, res) => {
    try {
      const auth = await getAuthenticatedAccount(req);
      return res.json({ success: true, user: auth.profile });
    } catch (error) {
      console.error("Load user profile error:", error);
      const message = error instanceof Error ? error.message : "Unable to load user profile";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.put("/api/user/me", async (req, res) => {
    try {
      const auth = await getAuthenticatedAccount(req);
      const payload = req.body || {};
      const email = typeof payload.email === "string" ? payload.email : auth.currentUser.email || null;
      const fullName = typeof payload.fullName === "string" ? payload.fullName : auth.currentUser.name || '';
      const existing: any = auth.profile || null;
      const shouldBeAdmin =
        !!existing?.admin ||
        existing?.role === 'admin' ||
        isAdminUserLike({ role: payload.role, admin: payload.admin, email, emailVerified: auth.currentUser.emailVerification }) ||
        isAllowlistedAdminEmail(email);

      const saved: any = await upsertUserProfile({
        ...(existing || {
          uid: auth.currentUser.$id,
          email,
          fullName,
          displayName: fullName,
          createdAt: new Date().toISOString(),
          credits: 5,
          lastCreditRefresh: new Date().toISOString().split('T')[0],
          subscription: { type: 'none', expiresAt: null },
          pushTokens: [],
          pushPreferences: { transactional: true, marketing: true },
        }),
        uid: auth.currentUser.$id,
        email,
        fullName,
        displayName: payload.displayName || fullName,
        whatsapp: typeof payload.whatsapp === "string" ? payload.whatsapp : existing?.whatsapp,
        admi: shouldBeAdmin,
        role: shouldBeAdmin ? 'admin' : (payload.role || existing?.role || 'user'),
        admin: shouldBeAdmin,
        subscription: payload.subscription || existing?.subscription || { type: 'none', expiresAt: null },
        pushTokens: Array.isArray(payload.pushTokens) ? payload.pushTokens : existing?.pushTokens || [],
        pushPreferences: payload.pushPreferences || existing?.pushPreferences || {
          transactional: true,
          marketing: true,
        },
      });

      return res.json({ success: true, user: saved });
    } catch (error) {
      console.error("Update user profile error:", error);
      const message = error instanceof Error ? error.message : "Unable to update user profile";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.post("/api/user/me/push-token", async (req, res) => {
    try {
      const auth = await getAuthenticatedAccount(req);
      const { token } = req.body || {};
      if (typeof token !== "string" || !token.trim()) {
        return res.status(400).json({ error: "Missing token" });
      }

      await syncUserPushToken(auth.currentUser.$id, token.trim());
      return res.json({ success: true });
    } catch (error) {
      console.error("Push token sync error:", error);
      const message = error instanceof Error ? error.message : "Unable to sync push token";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.delete("/api/user/me/push-token", async (req, res) => {
    try {
      const auth = await getAuthenticatedAccount(req);
      const { token } = req.body || {};
      if (typeof token !== "string" || !token.trim()) {
        return res.status(400).json({ error: "Missing token" });
      }

      await removeUserPushToken(auth.currentUser.$id, token.trim());
      return res.json({ success: true });
    } catch (error) {
      console.error("Push token removal error:", error);
      const message = error instanceof Error ? error.message : "Unable to remove push token";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.get("/api/news", async (req, res) => {
    try {
      const news = await listNews();
      return res.json({ success: true, news });
    } catch (error) {
      console.error("News feed error:", error);
      const message = error instanceof Error ? error.message : "Unable to load news";
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/news/:newsId", async (req, res) => {
    try {
      const news = await getNews(req.params.newsId);
      return res.json({ success: true, news });
    } catch (error) {
      console.error("News detail error:", error);
      const message = error instanceof Error ? error.message : "Unable to load news";
      return res.status(500).json({ error: message });
    }
  });

  const publishNewsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const admin = await verifyAdminRequest(req);
      const { title, summary, body, excerpt, content, imageUrl, category = "news", links, date } = req.body || {};

      if (!title || !content) {
        return res.status(400).json({ error: "Missing title or content" });
      }

      const news = await createNews({
        title,
        summary: String(summary ?? body ?? excerpt ?? "").trim(),
        content: String(content).trim(),
        imageUrl: imageUrl ? String(imageUrl).trim() : "",
        category: String(category || "news").trim(),
        date: String(date || "").trim() || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        createdBy: admin.uid,
        authorUid: admin.uid,
        authorName: admin.user.fullName || admin.user.email || "Admin",
        status: "published",
        isFeatured: false,
        links: Array.isArray(links) ? links : [],
      });

      await createNewsNotification({
        title: news.title,
        message: news.summary || news.title,
        body: news.summary || news.content || news.title,
        link: "news",
        type: "news",
        newsId: news.id,
        createdBy: admin.uid,
      });

      return res.json({
        success: true,
        id: news.id,
        news,
      });
    } catch (error) {
      console.error("News publish error:", error);
      const message = error instanceof Error ? error.message : "Unable to publish news";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  };

  app.post("/api/admin/news", publishNewsHandler);
  app.post("/api/admin/news/publish", publishNewsHandler);

  app.get("/api/admin/news", async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const news = await listNews();
      return res.json({
        success: true,
        news,
      });
    } catch (error) {
      console.error("News list error:", error);
      const message = error instanceof Error ? error.message : "Unable to load news";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.post("/api/admin/news/image", async (req, res) => {
    try {
      await verifyAdminRequest(req);
      const { base64, fileName, mimeType } = req.body || {};
      if (typeof base64 !== "string" || !base64.trim() || typeof fileName !== "string" || !fileName.trim()) {
        return res.status(400).json({ error: "Missing image payload" });
      }

      const result = await uploadNewsImage({
        base64: base64.trim(),
        fileName: fileName.trim(),
        mimeType: typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : "image/jpeg",
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("News image upload error:", error);
      const message = error instanceof Error ? error.message : "Unable to upload image";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.patch("/api/admin/news/:newsId", async (req, res) => {
    try {
      const admin = await verifyAdminRequest(req);
      const newsId = req.params.newsId;
      const { title, summary, body, excerpt, content, imageUrl, category = "news", links, date } = req.body || {};

      if (!title || !content) {
        return res.status(400).json({ error: "Missing title or content" });
      }

      const news = await updateNews(newsId, {
        title: String(title).trim(),
        summary: String(summary ?? body ?? excerpt ?? "").trim(),
        content: String(content).trim(),
        imageUrl: imageUrl !== undefined ? String(imageUrl).trim() : undefined,
        category: String(category || "news").trim(),
        date: String(date || "").trim(),
        authorUid: admin.uid,
        authorName: admin.user.fullName || admin.user.email || "Admin",
        status: "published",
        links: Array.isArray(links) ? links : undefined,
      });

      return res.json({ success: true, id: newsId, news });
    } catch (error) {
      console.error("News update error:", error);
      const message = error instanceof Error ? error.message : "Unable to update news";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  app.delete("/api/admin/news/:newsId", async (req, res) => {
    try {
      await verifyAdminRequest(req);
      await deleteNews(req.params.newsId);
      return res.json({ success: true, id: req.params.newsId });
    } catch (error) {
      console.error("News delete error:", error);
      const message = error instanceof Error ? error.message : "Unable to delete news";
      return res.status(message === "Forbidden" ? 403 : 500).json({ error: message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
