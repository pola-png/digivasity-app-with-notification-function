export type SubscriptionInfo = {
  type: string;
  expiresAt: string | null;
};

export type PushPreferences = {
  transactional: boolean;
  marketing: boolean;
};

export type UserProfile = {
  uid: string;
  email: string | null;
  fullName: string;
  displayName: string;
  whatsapp?: string;
  admi: boolean;
  role: string;
  admin: boolean;
  createdAt: string;
  credits: number;
  lastCreditRefresh: string;
  subscription: SubscriptionInfo;
  pushTokens: string[];
  pushPreferences: PushPreferences;
  fcmToken?: string | null;
  pushToken?: string | null;
  lastPushToken?: string | null;
  lastPushTokenAt?: string | null;
};

export type NewsLink = {
  name: string;
  url: string;
};

export type NewsArticle = {
  id: string;
  title: string;
  summary?: string;
  excerpt?: string;
  content: string;
  imageUrl?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  authorUid?: string;
  authorName?: string;
  category?: string;
  slug?: string;
  status?: string;
  isFeatured?: boolean;
  links?: NewsLink[];
};

export function formatNewsTitle(value: string) {
  const trimmed = String(value || '').trim().replace(/^new\s+update:\s*/i, '').trim();
  return trimmed ? `New Update: ${trimmed}` : '';
}

export function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value as T;
  }

  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function normalizeSubscription(value: unknown): SubscriptionInfo {
  const parsed = parseJsonSafe<Partial<SubscriptionInfo>>(value, {});
  return {
    type: typeof parsed.type === 'string' ? parsed.type : 'none',
    expiresAt:
      typeof parsed.expiresAt === 'string'
        ? parsed.expiresAt
        : parsed.expiresAt === null
          ? null
          : null,
  };
}

export function normalizePushPreferences(value: unknown): PushPreferences {
  const parsed = parseJsonSafe<Partial<PushPreferences>>(value, {});
  return {
    transactional: parsed.transactional !== false,
    marketing: parsed.marketing !== false,
  };
}

export function normalizeStringList(value: unknown): string[] {
  const parsed = parseJsonSafe<unknown>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item: unknown): item is string => typeof item === 'string');
}

export function normalizeNewsLinks(value: unknown): NewsLink[] {
  const parsed = parseJsonSafe<unknown>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const link = item as Partial<NewsLink>;
      const name = typeof link.name === 'string' ? link.name.trim() : '';
      const url = typeof link.url === 'string' ? link.url.trim() : '';
      if (!name || !url) {
        return null;
      }

      return { name, url };
    })
    .filter((item): item is NewsLink => item !== null);
}

export function buildUserRecord(profile: Partial<UserProfile> & {
  uid: string;
  email: string | null;
  fullName: string;
  displayName?: string;
  whatsapp?: string;
  role?: string;
  admin?: boolean;
  admi?: boolean;
  createdAt?: string;
  credits?: number;
  lastCreditRefresh?: string;
  subscription?: SubscriptionInfo;
  pushTokens?: string[];
  pushPreferences?: PushPreferences;
  fcmToken?: string | null;
  pushToken?: string | null;
  lastPushToken?: string | null;
  lastPushTokenAt?: string | null;
}) {
  const subscription = profile.subscription || { type: 'none', expiresAt: null };
  const pushPreferences = profile.pushPreferences || {
    transactional: true,
    marketing: true,
  };
  const pushTokens = normalizeStringList(profile.pushTokens);

  return {
    email: profile.email,
    fullName: profile.fullName,
    displayName: profile.displayName || profile.fullName,
    ...(typeof profile.whatsapp === 'string' ? { whatsapp: profile.whatsapp } : {}),
    admi: profile.admi ?? profile.admin ?? false,
    role: profile.role || ((profile.admin ?? profile.admi) ? 'admin' : 'user'),
    admin: profile.admin ?? profile.admi ?? false,
    createdAt: profile.createdAt || new Date().toISOString(),
    credits: typeof profile.credits === 'number' ? profile.credits : 5,
    lastCreditRefresh:
      profile.lastCreditRefresh || new Date().toISOString().split('T')[0],
    subscriptionJson: JSON.stringify(subscription),
    pushTokens: JSON.stringify(pushTokens),
    pushPreferencesJson: JSON.stringify(pushPreferences),
    ...(typeof profile.fcmToken === 'string' ? { fcmToken: profile.fcmToken } : {}),
    ...(typeof profile.pushToken === 'string' ? { pushToken: profile.pushToken } : {}),
    ...(typeof profile.lastPushToken === 'string' ? { lastPushToken: profile.lastPushToken } : {}),
    ...(typeof profile.lastPushTokenAt === 'string' ? { lastPushTokenAt: profile.lastPushTokenAt } : {}),
  };
}

export function serializeUserDocument(document: any): UserProfile {
  const data = document?.data ? document.data() : document || {};
  const userId = document?.$id || document?.id || data.uid || '';
  return {
    uid: userId,
    email: typeof data.email === 'string' ? data.email : null,
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : typeof data.fullName === 'string' ? data.fullName : '',
    whatsapp: typeof data.whatsapp === 'string' ? data.whatsapp : undefined,
    admi: data.admi === true || data.admin === true,
    role: typeof data.role === 'string' ? data.role : data.admin === true || data.admi === true ? 'admin' : 'user',
    admin: data.admin === true || data.admi === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    credits: typeof data.credits === 'number' ? data.credits : Number(data.credits || 0) || 0,
    lastCreditRefresh:
      typeof data.lastCreditRefresh === 'string'
        ? data.lastCreditRefresh
        : new Date().toISOString().split('T')[0],
    subscription: normalizeSubscription(data.subscriptionJson ?? data.subscription),
    pushTokens: normalizeStringList(data.pushTokensJson ?? data.pushTokens),
    pushPreferences: normalizePushPreferences(data.pushPreferencesJson ?? data.pushPreferences),
    fcmToken: typeof data.fcmToken === 'string' ? data.fcmToken : null,
    pushToken: typeof data.pushToken === 'string' ? data.pushToken : null,
    lastPushToken: typeof data.lastPushToken === 'string' ? data.lastPushToken : null,
    lastPushTokenAt: typeof data.lastPushTokenAt === 'string' ? data.lastPushTokenAt : null,
  };
}

export function buildNewsRecord(input: Partial<NewsArticle> & {
  title: string;
  content: string;
  summary?: string;
  excerpt?: string;
  imageUrl?: string;
  category?: string;
  date?: string;
  createdBy?: string;
  authorUid?: string;
  authorName?: string;
  slug?: string;
  status?: string;
  isFeatured?: boolean;
  links?: NewsLink[];
  publishedAt?: string;
  updatedAt?: string;
}) {
  const summary = String(input.summary ?? input.excerpt ?? '').trim();
  const title = formatNewsTitle(input.title);
  const slug =
    input.slug ||
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  return {
    title,
    summary,
    excerpt: summary,
    content: String(input.content || '').trim(),
    imageUrl: String(input.imageUrl || '').trim(),
    category: String(input.category || 'news').trim(),
    slug,
    date: String(input.date || '').trim(),
    createdBy: String(input.createdBy || '').trim(),
    authorUid: String(input.authorUid || '').trim(),
    authorName: String(input.authorName || '').trim(),
    publishedAt: input.publishedAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    status: String(input.status || 'published').trim(),
    isFeatured: input.isFeatured === true,
    linksJson: JSON.stringify(Array.isArray(input.links) ? input.links : []),
  };
}

export function serializeNewsDocument(document: any): NewsArticle {
  const data = document?.data ? document.data() : document || {};
  const id = document?.$id || document?.id || data.$id || '';

  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    excerpt: typeof data.excerpt === 'string' ? data.excerpt : typeof data.summary === 'string' ? data.summary : '',
    content: typeof data.content === 'string' ? data.content : '',
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    date: typeof data.date === 'string' ? data.date : '',
    createdAt:
      typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof document?.$createdAt === 'string'
          ? document.$createdAt
          : undefined,
    updatedAt:
      typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof document?.$updatedAt === 'string'
          ? document.$updatedAt
          : undefined,
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : '',
    authorName: typeof data.authorName === 'string' ? data.authorName : '',
    category: typeof data.category === 'string' ? data.category : 'news',
    slug: typeof data.slug === 'string' ? data.slug : '',
    status: typeof data.status === 'string' ? data.status : 'published',
    isFeatured: data.isFeatured === true,
    links: normalizeNewsLinks(data.linksJson ?? data.links),
  };
}
