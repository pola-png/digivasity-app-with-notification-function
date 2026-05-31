import { Account, Client, Databases, Functions, ID, Permission, Query, Role, Storage } from 'appwrite';
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
  import.meta.env.VITE_APPWRITE_ENDPOINT?.trim() ||
  'https://fra.cloud.appwrite.io/v1';

const APPWRITE_PROJECT_ID =
  import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim();

const APPWRITE_DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID?.trim() || 'digivasitydb';
const APPWRITE_STORAGE_BUCKET_ID =
  import.meta.env.VITE_APPWRITE_STORAGE_BUCKET_ID?.trim() || 'digivasity_storage';
const APPWRITE_USERS_COLLECTION_ID =
  import.meta.env.VITE_APPWRITE_USERS_COLLECTION_ID?.trim() || 'users';
const APPWRITE_NEWS_COLLECTION_ID =
  import.meta.env.VITE_APPWRITE_NEWS_COLLECTION_ID?.trim() || 'news';
const APPWRITE_NOTIFICATIONS_COLLECTION_ID =
  import.meta.env.VITE_APPWRITE_NOTIFICATIONS_COLLECTION_ID?.trim() || 'notifications';
const APPWRITE_NEWS_NOTIFIER_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_NEWS_NOTIFIER_FUNCTION_ID?.trim() || '';

function createClient() {
  // Browser requests should rely on the Appwrite session cookie only.
  // Mixing setJWT with the cookie-based session triggers 403 errors.
  return new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID || '');
}

function ensureConfigured() {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
    throw new Error('Appwrite is not configured. Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID.');
  }
}

function isDocumentNotFound(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typedError = error as {
    code?: number;
    type?: string;
    message?: string;
    response?: string;
  };

  const message = `${typedError.message || ''} ${typedError.response || ''}`.toLowerCase();
  return (
    typedError.code === 404 ||
    typedError.type === 'document_not_found' ||
    message.includes('document_not_found') ||
    message.includes('document with the requested id')
  );
}

function createDatabases() {
  ensureConfigured();
  const client = createClient();
  return new Databases(client);
}

function createStorage() {
  ensureConfigured();
  const client = createClient();
  return new Storage(client);
}

function createAccount() {
  ensureConfigured();
  const client = createClient();
  return new Account(client);
}

async function getUserDocument(uid: string): Promise<UserProfile | null> {
  const databases = createDatabases();
  try {
    const document = await databases.getDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, uid);
    return serializeUserDocument(document);
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function getCurrentUserProfile() {
  const account = createAccount();
  const currentUser = await account.get();
  const user = await getUserDocument(currentUser.$id);
  return { success: true as const, user };
}

export async function syncCurrentUserProfile(
  payload: Partial<UserProfile> & {
    uid: string;
    email: string | null;
    fullName: string;
    displayName?: string;
    whatsapp?: string;
  }
) {
  const databases = createDatabases();
  const existing = await getUserDocument(payload.uid);
  const next = buildUserRecord({
    ...(existing || {}),
    ...payload,
    uid: payload.uid,
    email: payload.email,
    fullName: payload.fullName,
    displayName: payload.displayName || existing?.displayName || payload.fullName,
    whatsapp: payload.whatsapp ?? existing?.whatsapp,
    admi: payload.admi ?? existing?.admi,
    role: payload.role || existing?.role || 'user',
    admin: payload.admin ?? existing?.admin,
    createdAt: payload.createdAt || existing?.createdAt,
    credits: typeof payload.credits === 'number' ? payload.credits : existing?.credits,
    lastCreditRefresh: payload.lastCreditRefresh || existing?.lastCreditRefresh,
    subscription: payload.subscription || existing?.subscription,
    pushTokens: Array.isArray(payload.pushTokens) ? payload.pushTokens : existing?.pushTokens,
    pushPreferences: payload.pushPreferences || existing?.pushPreferences,
    fcmToken: payload.fcmToken ?? existing?.fcmToken,
    pushToken: payload.pushToken ?? existing?.pushToken,
    lastPushToken: payload.lastPushToken ?? existing?.lastPushToken,
    lastPushTokenAt: payload.lastPushTokenAt ?? existing?.lastPushTokenAt,
  });

  const permissions = [
    Permission.read(Role.user(payload.uid)),
    Permission.update(Role.user(payload.uid)),
    Permission.delete(Role.user(payload.uid)),
  ];

  const document = existing
    ? await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, payload.uid, next)
    : await databases.createDocument(APPWRITE_DATABASE_ID, APPWRITE_USERS_COLLECTION_ID, payload.uid, next, permissions);

  return { success: true as const, user: serializeUserDocument(document) };
}

export async function ensureCurrentUserProfile(payload: {
  uid: string;
  email: string | null;
  fullName: string;
  displayName?: string;
  whatsapp?: string;
}) {
  return syncCurrentUserProfile(payload);
}

export async function syncCurrentUserPushToken(token: string) {
  const account = createAccount();
  const user = await account.get();
  const current = (await getUserDocument(user.$id)) || {
    uid: user.$id,
    email: user.email || null,
    fullName: user.name || '',
    displayName: user.name || '',
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

  const tokens = Array.from(new Set([...(current.pushTokens || []), token].filter(Boolean)));
  return syncCurrentUserProfile({
    ...current,
    pushTokens: tokens,
    fcmToken: token,
    pushToken: token,
    lastPushToken: token,
    lastPushTokenAt: new Date().toISOString(),
  });
}

export async function triggerNewsNotificationPush(payload: {
  title: string;
  body: string;
  newsId: string;
  slug?: string;
}) {
  if (!APPWRITE_NEWS_NOTIFIER_FUNCTION_ID) {
    throw new Error('Appwrite news notifier function is not configured. Set VITE_APPWRITE_NEWS_NOTIFIER_FUNCTION_ID.');
  }

  const functions = new Functions(createClient());
  return functions.createExecution({
    functionId: APPWRITE_NEWS_NOTIFIER_FUNCTION_ID,
    body: JSON.stringify({
      topic: 'news-updates',
      ...payload,
    }),
    async: true,
  });
}

export async function removeCurrentUserPushToken(token: string) {
  const account = createAccount();
  const user = await account.get();
  const current = await getUserDocument(user.$id);
  if (!current) {
    return { success: true as const };
  }

  return syncCurrentUserProfile({
    ...current,
    pushTokens: (current.pushTokens || []).filter((entry) => entry !== token),
  });
}

export async function listPublicNews() {
  const databases = createDatabases();
  const documents = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, [
    Query.orderDesc('$createdAt'),
    Query.limit(200),
  ]);
  return { success: true as const, news: documents.documents.map((document) => serializeNewsDocument(document)) };
}

export async function getPublicNews(newsId: string) {
  const databases = createDatabases();
  try {
    const document = await databases.getDocument(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, newsId);
    return { success: true as const, news: serializeNewsDocument(document) };
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return { success: true as const, news: null };
    }
    throw error;
  }
}

export async function publishAdminNews(
  payload: {
    title: string;
    summary?: string;
    content: string;
    imageUrl?: string;
  }
) {
  const databases = createDatabases();
  const account = createAccount();
  const currentUser = await account.get();
  const existing = buildNewsRecord({
    title: payload.title,
    content: payload.content,
    summary: payload.summary,
    imageUrl: payload.imageUrl,
    createdBy: currentUser.$id,
    authorUid: currentUser.$id,
    authorName: currentUser.name || currentUser.email || 'Admin',
    status: 'published',
  });

  const document = await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_NEWS_COLLECTION_ID,
    ID.unique(),
    existing,
    [
      Permission.read(Role.any()),
      Permission.update(Role.user(currentUser.$id)),
      Permission.delete(Role.user(currentUser.$id)),
    ]
  );

  const news = serializeNewsDocument(document);
  const notificationRecord = await createNewsNotification({
    title: news.title,
    message: news.summary || news.title,
    body: news.content || news.summary || news.title,
    link: `news/${news.id}`,
    type: 'news',
    newsId: news.id,
    createdBy: currentUser.$id,
  });

  let notificationDispatch: { success: boolean; message?: string } = { success: true };
  try {
    await triggerNewsNotificationPush({
      title: news.title,
      body: news.summary || news.title,
      newsId: news.id,
      slug: news.slug || '',
    });
  } catch (error) {
    notificationDispatch = {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to trigger news notification push',
    };
  }

  return {
    success: true as const,
    id: document.$id,
    news,
    notificationRecord,
    notificationDispatch,
  };
}

export async function updateAdminNews(
  newsId: string,
  payload: {
    title: string;
    summary?: string;
    content: string;
    imageUrl?: string;
  }
) {
  const databases = createDatabases();
  const account = createAccount();
  const currentUser = await account.get();
  const existing = await getPublicNews(newsId);
  const currentNews = existing.news;
  if (!currentNews) {
    throw new Error('News post not found');
  }

  const next = buildNewsRecord({
    ...currentNews,
    title: payload.title,
    content: payload.content,
    summary: payload.summary,
    imageUrl: payload.imageUrl,
    authorUid: currentUser.$id,
    authorName: currentUser.name || currentUser.email || 'Admin',
    updatedAt: new Date().toISOString(),
  });

  const document = await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, newsId, next);
  return { success: true as const, id: newsId, news: serializeNewsDocument(document) };
}

export async function deleteAdminNews(newsId: string) {
  const databases = createDatabases();
  await databases.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_NEWS_COLLECTION_ID, newsId);
  return { success: true as const, id: newsId };
}

export async function uploadAdminNewsImage(
  payload: {
    base64: string;
    fileName: string;
    mimeType: string;
  }
) {
  const storage = createStorage();
  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const file = new File([bytes], payload.fileName, { type: payload.mimeType || 'image/jpeg' });
  const uploaded = await storage.createFile({
    bucketId: APPWRITE_STORAGE_BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any())],
  });

  return {
    success: true as const,
    fileId: uploaded.$id,
    name: uploaded.name,
    url: storage.getFileView(APPWRITE_STORAGE_BUCKET_ID, uploaded.$id),
  };
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
  const databases = createDatabases();
  const permissions = params.createdBy
    ? [
        Permission.read(Role.any()),
        Permission.update(Role.user(params.createdBy)),
        Permission.delete(Role.user(params.createdBy)),
      ]
    : [Permission.read(Role.any())];

  return databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_NOTIFICATIONS_COLLECTION_ID,
    ID.unique(),
    {
      title: params.title,
      message: params.message,
      body: params.body,
      link: params.link || '',
      type: params.type || 'news',
      newsId: params.newsId || '',
      createdBy: params.createdBy || '',
      createdAt: new Date().toISOString(),
    },
    permissions
  );
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
