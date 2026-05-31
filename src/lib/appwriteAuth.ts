import { Account, Client, ID, OAuthProvider, type Models } from 'appwrite';

const APPWRITE_ENDPOINT =
  import.meta.env.VITE_APPWRITE_ENDPOINT?.trim() ||
  'https://fra.cloud.appwrite.io/v1';

const APPWRITE_PROJECT_ID =
  import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim();

const client = new Client();

if (APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID) {
  client.setEndpoint(APPWRITE_ENDPOINT);
  client.setProject(APPWRITE_PROJECT_ID);
}

export const account = new Account(client);

export type AppwriteAuthUser = Models.User<Models.Preferences>;

export function isAppwriteAuthConfigured() {
  return !!APPWRITE_ENDPOINT && !!APPWRITE_PROJECT_ID;
}

function ensureConfigured() {
  if (!isAppwriteAuthConfigured()) {
    throw new Error('Appwrite auth is not configured. Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID.');
  }
}

export function getAuthActionBaseUrl() {
  const configured = import.meta.env.VITE_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  throw new Error('Set VITE_APP_URL to your app deep link or public frontend URL used for Appwrite auth redirects.');
}

export function buildAuthActionUrl(mode: 'verifyEmail' | 'resetPassword') {
  const url = new URL(getAuthActionBaseUrl());
  url.searchParams.set('mode', mode);
  return url.toString();
}

export async function getCurrentSessionUser() {
  ensureConfigured();
  return account.get();
}

export async function ensureAnonymousSession() {
  ensureConfigured();

  try {
    return await account.get();
  } catch {
    return account.createAnonymousSession();
  }
}

export async function registerWithEmailPassword(params: {
  email: string;
  password: string;
  fullName: string;
}) {
  ensureConfigured();
  await logoutCurrentSession().catch(() => undefined);
  const name = params.fullName.trim() || undefined;
  await account.create(ID.unique(), params.email, params.password, name);
  await account.createEmailPasswordSession(params.email, params.password);
  return account.get();
}

export async function loginWithEmailPassword(email: string, password: string) {
  ensureConfigured();
  await logoutCurrentSession().catch(() => undefined);
  await account.createEmailPasswordSession(email, password);
  return account.get();
}

export async function logoutCurrentSession() {
  if (!isAppwriteAuthConfigured()) {
    return;
  }

  try {
    await account.deleteSession('current');
  } catch {
    // Best-effort sign out. If the session is already gone, we can ignore it.
  }
}

export async function sendEmailVerification() {
  ensureConfigured();
  return account.createVerification(buildAuthActionUrl('verifyEmail'));
}

export async function sendPasswordRecovery(email: string) {
  ensureConfigured();
  return account.createRecovery(email, buildAuthActionUrl('resetPassword'));
}

export async function completeEmailVerification(userId: string, secret: string) {
  ensureConfigured();
  return account.updateVerification(userId, secret);
}

export async function completePasswordRecovery(userId: string, secret: string, password: string) {
  ensureConfigured();
  return account.updateRecovery(userId, secret, password);
}

export async function signInWithGoogleOAuth() {
  ensureConfigured();
  return account.createOAuth2Session(
    OAuthProvider.Google,
    getAuthActionBaseUrl(),
    getAuthActionBaseUrl()
  );
}
