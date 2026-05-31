import { Client, Databases, ID, Permission, Query, Role, Storage } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import {
  buildNewsRecord,
  buildUserRecord,
  normalizePushPreferences,
  normalizeSubscription,
  serializeNewsDocument,
  serializeUserDocument,
  type NewsArticle,
  type UserProfile,
} from './appwriteModels';

const APPWRITE_ENDPOINT =
  process.env.APPWRITE_ENDPOINT?.trim() ||
  process.env.VITE_APPWRITE_ENDPOINT?.trim() ||
  'https://fra.cloud.appwrite.io/v1';

const APPWRITE_PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID?.trim() ||
  process.env.VITE_APPWRITE_PROJECT_ID?.trim();

const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY?.trim();
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID?.trim() || 'digivasitydb';
const APPWRITE_STORAGE_BUCKET_ID =
  process.env.APPWRITE_STORAGE_BUCKET_ID?.trim() || 'digivasity_storage';
const APPWRITE_USERS_COLLECTION_ID =
  process.env.APPWRITE_USERS_COLLECTION_ID?.trim() || 'users';
const APPWRITE_NEWS_COLLECTION_ID =
  process.env.APPWRITE_NEWS_COLLECTION_ID?.trim() || 'news';
const APPWRITE_NOTIFICATIONS_COLLECTION_ID =
  process.env.APPWRITE_NOTIFICATIONS_COLLECTION_ID?.trim() || 'notifications';

const appwriteReady =
  !!APPWRITE_ENDPOINT &&
  !!APPWRITE_PROJECT_ID &&
  !!APPWRITE_API_KEY &&
  !!APPWRITE_DATABASE_ID &&
  !!APPWRITE_STORAGE_BUCKET_ID;

const client = new Client();
if (appwriteReady) {
  client.setEndpoint(APPWRITE_ENDPOINT);
  client.setProject(APPWRITE_PROJECT_ID);
  client.setKey(APPWRITE_API_KEY);
}

const databases = new Databases(client);
const storage = new Storage(client);

let bootstrapPromise: Promise<void> | null = null;

function attributeExists(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('attribute with the requested key already exists') ||
    message.includes('Attribute with the requested key already exists') ||
    message.includes('already exists')
  );
}

function collectionExists(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('collection with the requested key already exists') ||
    message.includes('Collection with the requested key already exists') ||
    message.includes('already exists')
  );
}

async function ensureAttribute(
  collectionId: string,
  createAttribute: () => Promise<unknown>
) {
  try {
    await createAttribute();
  } catch (error) {
    if (!attributeExists(error)) {
      throw error;
    }
  }
}

async function ensureCollection(params: {
  collectionId: string;
  name: string;
  attributes: object[];
}) {
  try {
    await databases.getCollection(APPWRITE_DATABASE_ID, params.collectionId);
    return;
  } catch (error) {
    if (!collectionExists(error)) {
      throw error;
    }
  }

  await databases.createCollection({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: params.collectionId,
    name: params.name,
    enabled: true,
    documentSecurity: false,
    attributes: params.attributes,
    indexes: [],
  });
}

async function ensureBucket() {
  try {
    await storage.getBucket(APPWRITE_STORAGE_BUCKET_ID);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('bucket with the requested key not found') && !message.includes('not found')) {
      throw error;
    }
  }

  await storage.createBucket({
    bucketId: APPWRITE_STORAGE_BUCKET_ID,
    name: 'Digivasity Storage',
    enabled: true,
    fileSecurity: false,
    permissions: [],
  });
}

async function ensureCollectionAttributes() {
  await ensureCollection({
    collectionId: APPWRITE_USERS_COLLECTION_ID,
    name: 'Users',
    attributes: [
      { key: 'email', type: 'string', size: 255, required: false },
      { key: 'fullName', type: 'string', size: 255, required: true },
      { key: 'displayName', type: 'string', size: 255, required: true },
      { key: 'whatsapp', type: 'string', size: 64, required: false },
      { key: 'admi', type: 'boolean', required: true, default: false },
      { key: 'role', type: 'string', size: 32, required: true },
      { key: 'admin', type: 'boolean', required: true, default: false },
      { key: 'createdAt', type: 'datetime', required: true },
      { key: 'credits', type: 'integer', required: true, default: 5 },
      { key: 'lastCreditRefresh', type: 'string', size: 32, required: true },
      { key: 'subscriptionJson', type: 'string', size: 65535, required: true },
      { key: 'pushTokens', type: 'string', size: 65535, required: true },
      { key: 'pushPreferencesJson', type: 'string', size: 65535, required: true },
      { key: 'fcmToken', type: 'string', size: 512, required: false },
      { key: 'pushToken', type: 'string', size: 512, required: false },
      { key: 'lastPushToken', type: 'string', size: 512, required: false },
      { key: 'lastPushTokenAt', type: 'string', size: 64, required: false },
    ],
  });

  await ensureCollection({
    collectionId: APPWRITE_NEWS_COLLECTION_ID,
    name: 'News',
    attributes: [
      { key: 'title', type: 'string', size: 255, required: true },
      { key: 'summary', type: 'string', size: 65535, required: false },
      { key: 'excerpt', type: 'string', size: 65535, required: false },
      { key: 'content', type: 'string', size: 65535, required: true },
      { key: 'imageUrl', type: 'string', size: 1024, required: false },
      { key: 'category', type: 'string', size: 64, required: false },
      { key: 'slug', type: 'string', size: 255, required: false },
      { key: 'date', type: 'string', size: 128, required: false },
      { key: 'createdBy', type: 'string', size: 128, required: false },
      { key: 'authorUid', type: 'string', size: 128, required: false },
      { key: 'authorName', type: 'string', size: 255, required: false },
      { key: 'publishedAt', type: 'datetime', required: false },
      { key: 'updatedAt', type: 'datetime', required: false },
      { key: 'status', type: 'string', size: 32, required: false },
      { key: 'isFeatured', type: 'boolean', required: false, default: false },
      { key: 'linksJson', type: 'string', size: 65535, required: false },
    ],
  });

  await ensureCollection({
    collectionId: APPWRITE_NOTIFICATIONS_COLLECTION_ID,
    name: 'Notifications',
    attributes: [
      { key: 'title', type: 'string', size: 255, required: true },
      { key: 'message', type: 'string', size: 65535, required: false },
      { key: 'body', type: 'string', size: 65535, required: false },
      { key: 'link', type: 'string', size: 255, required: false },
      { key: 'type', type: 'string', size: 64, required: false },
      { key: 'newsId', type: 'string', size: 128, required: false },
      { key: 'createdBy', type: 'string', size: 128, required: false },
      { key: 'createdAt', type: 'datetime', required: true },
    ],
  });

  await Promise.all([
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'email', 255, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'fullName', 255, true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'displayName', 255, true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'whatsapp', 64, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createBooleanAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'admi', true, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'role', 32, true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createBooleanAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'admin', true, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createDatetimeAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'createdAt', true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createIntegerAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'credits', true, 0, 1000000, 5)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'lastCreditRefresh', 32, true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'subscriptionJson', 65535, true)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(
        APPWRITE_DATABASE_ID,
        APPWRITE_USERS_COLLECTION_ID,
        'pushTokens',
        65535,
        true
      )
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(
        APPWRITE_DATABASE_ID,
        APPWRITE_USERS_COLLECTION_ID,
        'pushPreferencesJson',
        65535,
        true
      )
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'fcmToken', 512, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'pushToken', 512, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'lastPushToken', 512, false)
    ),
    ensureAttribute(APPWRITE_USERS_COLLECTION_ID, () =>
      databases.createStringAttribute(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, 'lastPushTokenAt', 64, false)
    ),
  ]);
}

export async function bootstrapAppwrite() {
  if (!appwriteReady) {
    console.warn('Appwrite is not fully configured. Skipping Appwrite bootstrap.');
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await Promise.all([ensureCollectionAttributes(), ensureBucket()]);
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

function ensureReady() {
  if (!appwriteReady) {
    throw new Error(
      'Appwrite is not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, and APPWRITE_STORAGE_BUCKET_ID.'
    );
  }
}

export function isAppwriteConfigured() {
  return appwriteReady;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  ensureReady();
  try {
    const document = await databases.getDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, uid);
    return serializeUserDocument(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('document with the requested id was not found')) {
      return null;
    }
    throw error;
  }
}

export async function upsertUserProfile(profile: Parameters<typeof buildUserRecord>[0]): Promise<UserProfile> {
  ensureReady();
  const existing = await getUserProfile(profile.uid);
  const payload = buildUserRecord({
    ...(existing || {}),
    ...profile,
    uid: profile.uid,
    email: profile.email,
    fullName: profile.fullName,
    displayName: profile.displayName || existing?.displayName || profile.fullName,
    whatsapp: profile.whatsapp ?? existing?.whatsapp,
    admi: profile.admi ?? existing?.admi,
    role: profile.role || existing?.role || 'user',
    admin: profile.admin ?? existing?.admin,
    createdAt: profile.createdAt || existing?.createdAt,
    credits: typeof profile.credits === 'number' ? profile.credits : existing?.credits,
    lastCreditRefresh: profile.lastCreditRefresh || existing?.lastCreditRefresh,
    subscription: profile.subscription || existing?.subscription,
    pushTokens: Array.isArray(profile.pushTokens) ? profile.pushTokens : existing?.pushTokens,
    pushPreferences: profile.pushPreferences || existing?.pushPreferences,
    fcmToken: profile.fcmToken ?? existing?.fcmToken,
    pushToken: profile.pushToken ?? existing?.pushToken,
    lastPushToken: profile.lastPushToken ?? existing?.lastPushToken,
    lastPushTokenAt: profile.lastPushTokenAt ?? existing?.lastPushTokenAt,
  });
  const document = await databases.upsertDocument({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_USERS_COLLECTION_ID,
    documentId: profile.uid,
    data: payload,
  });
  return serializeUserDocument(document);
}

export async function listUsers(): Promise<UserProfile[]> {
  ensureReady();
  const documents = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, [
    Query.limit(5000),
  ]);
  return documents.documents.map((document) => serializeUserDocument(document));
}

export async function syncUserPushToken(uid: string, token: string) {
  ensureReady();
  const user = (await getUserProfile(uid)) || {
    uid,
    email: null,
    fullName: '',
    displayName: '',
    admi: false,
    role: 'user',
    admin: false,
    createdAt: new Date().toISOString(),
    credits: 5,
    lastCreditRefresh: new Date().toISOString().split('T')[0],
    subscription: normalizeSubscription({}),
    pushTokens: [],
    pushPreferences: normalizePushPreferences({}),
  };

  const tokens = Array.from(new Set([...(user.pushTokens || []), token].filter(Boolean)));
  return upsertUserProfile({
    ...user,
    pushTokens: tokens,
    fcmToken: token,
    pushToken: token,
    lastPushToken: token,
    lastPushTokenAt: new Date().toISOString(),
  });
}

export async function removeUserPushToken(uid: string, token: string) {
  ensureReady();
  const user = await getUserProfile(uid);
  if (!user) {
    return null;
  }

  return upsertUserProfile({
    ...user,
    pushTokens: (user.pushTokens || []).filter((entry) => entry !== token),
  });
}

export async function listNews(): Promise<NewsArticle[]> {
  ensureReady();
  const documents = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, [
    Query.orderDesc('$createdAt'),
    Query.limit(200),
  ]);
  return documents.documents.map((document) => serializeNewsDocument(document));
}

export async function getNews(newsId: string): Promise<NewsArticle | null> {
  ensureReady();
  try {
    const document = await databases.getDocument(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, newsId);
    return serializeNewsDocument(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('document with the requested id was not found')) {
      return null;
    }
    throw error;
  }
}

export async function createNews(article: Omit<NewsArticle, 'id'>) {
  ensureReady();
  const payload = buildNewsRecord(article);
  const document = await databases.createDocument({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_NEWS_COLLECTION_ID,
    documentId: ID.unique(),
    data: payload,
  });
  return serializeNewsDocument(document);
}

export async function updateNews(newsId: string, article: Partial<NewsArticle> & { title: string; content: string }) {
  ensureReady();
  const existing = await getNews(newsId);
  if (!existing) {
    throw new Error('News post not found');
  }

  const payload = buildNewsRecord({
    ...existing,
    ...article,
    title: article.title || existing.title,
    content: article.content || existing.content,
    summary: article.summary ?? existing.summary,
    excerpt: article.excerpt ?? existing.excerpt,
    imageUrl: article.imageUrl ?? existing.imageUrl,
    category: article.category ?? existing.category,
    date: article.date ?? existing.date,
    createdBy: existing.createdBy,
    authorUid: existing.authorUid,
    authorName: existing.authorName,
    slug: existing.slug,
    status: article.status ?? existing.status,
    isFeatured: article.isFeatured ?? existing.isFeatured,
    links: article.links ?? existing.links,
    publishedAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const document = await databases.updateDocument({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_NEWS_COLLECTION_ID,
    documentId: newsId,
    data: payload,
  });
  return serializeNewsDocument(document);
}

export async function deleteNews(newsId: string) {
  ensureReady();
  await databases.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, newsId);
}

export async function createNewsNotification(params: {
  title: string;
  message: string;
  body: string;
  link?: string;
  type?: string;
  newsId?: string;
  createdBy?: string;
}) {
  ensureReady();
  return databases.createDocument({
    databaseId: APPWRITE_DATABASE_ID,
    collectionId: APPWRITE_NOTIFICATIONS_COLLECTION_ID,
    documentId: ID.unique(),
    data: {
      title: params.title,
      message: params.message,
      body: params.body,
      link: params.link || '',
      type: params.type || 'news',
      newsId: params.newsId || '',
      createdBy: params.createdBy || '',
      createdAt: new Date().toISOString(),
    },
  });
}

export async function uploadNewsImage(params: {
  base64: string;
  fileName: string;
  mimeType: string;
}) {
  ensureReady();
  const buffer = Buffer.from(params.base64, 'base64');
  const file = InputFile.fromBuffer(buffer, params.fileName);
  const uploaded = await storage.createFile({
    bucketId: APPWRITE_STORAGE_BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any())],
  });
  return {
    fileId: uploaded.$id,
    name: uploaded.name,
    url: storage.getFileView(APPWRITE_STORAGE_BUCKET_ID, uploaded.$id),
  };
}

export function getAppwriteIds() {
  return {
    databaseId: APPWRITE_DATABASE_ID,
    storageBucketId: APPWRITE_STORAGE_BUCKET_ID,
    usersCollectionId: APPWRITE_USERS_COLLECTION_ID,
    newsCollectionId: APPWRITE_NEWS_COLLECTION_ID,
    notificationsCollectionId: APPWRITE_NOTIFICATIONS_COLLECTION_ID,
  };
}
