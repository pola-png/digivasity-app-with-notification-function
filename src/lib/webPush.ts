import { Client, ID, Messaging } from 'appwrite';
import app from './fcm';
import { account, ensureAnonymousSession, isAppwriteAuthConfigured } from './appwriteAuth';
import { syncCurrentUserPushToken, removeCurrentUserPushToken } from './appwriteClient';

const WEB_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY?.trim();
const APPWRITE_PUSH_TARGET_ID_KEY = 'digivasity:push-target-id';
const DEVICE_PUSH_TOKEN_KEY = 'digivasity:device-push-token';
const APPWRITE_PUSH_TOPIC_ID = 'news-updates';

function createMessagingClient() {
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT?.trim() || 'https://fra.cloud.appwrite.io/v1';
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID?.trim();
  return new Client().setEndpoint(endpoint).setProject(projectId || '');
}

function getStoredPushTargetId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(APPWRITE_PUSH_TARGET_ID_KEY);
}

function setStoredPushTargetId(targetId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(APPWRITE_PUSH_TARGET_ID_KEY, targetId);
}

function clearStoredPushTargetId() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(APPWRITE_PUSH_TARGET_ID_KEY);
}

function setStoredDevicePushToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DEVICE_PUSH_TOKEN_KEY, token);
}

async function ensureAppwriteSessionForPush() {
  if (!isAppwriteAuthConfigured()) {
    return false;
  }

  try {
    await ensureAnonymousSession();
    return true;
  } catch (error) {
    console.warn('Failed to create or reuse an Appwrite session for push registration:', error);
    return false;
  }
}

async function registerAppwritePushTarget(token: string) {
  if (!token || !isAppwriteAuthConfigured()) {
    return null;
  }

  const sessionReady = await ensureAppwriteSessionForPush();
  if (!sessionReady) {
    return null;
  }

  const storedTargetId = getStoredPushTargetId();
  const targetId = storedTargetId || ID.unique();
  try {
    const target = storedTargetId
      ? await account.updatePushTarget({ targetId, identifier: token })
      : await account.createPushTarget({ targetId, identifier: token });
    const resolvedTargetId = (target as any).$id || (target as any).id || targetId;
    setStoredPushTargetId(resolvedTargetId);
    return resolvedTargetId;
  } catch (error) {
    if (storedTargetId) {
      try {
        clearStoredPushTargetId();
        const retryTargetId = ID.unique();
        const createdTarget = await account.createPushTarget({ targetId: retryTargetId, identifier: token });
        const resolvedTargetId = (createdTarget as any).$id || (createdTarget as any).id || retryTargetId;
        setStoredPushTargetId(resolvedTargetId);
        return resolvedTargetId;
      } catch (retryError) {
        console.warn('Failed to recreate Appwrite push target:', retryError);
      }
    }

    console.warn('Failed to register Appwrite push target:', error);
    return null;
  }
}

async function subscribeAppwriteTargetToTopic(targetId: string, topicId = APPWRITE_PUSH_TOPIC_ID) {
  if (!targetId || !isAppwriteAuthConfigured()) {
    return;
  }

  const messaging = new Messaging(createMessagingClient());
  try {
    await messaging.createSubscriber({
      topicId,
      subscriberId: targetId,
      targetId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes('already exists')) {
      throw error;
    }
  }
}

export async function registerDevicePushSubscription(token: string) {
  if (!token) {
    return null;
  }

  setStoredDevicePushToken(token);
  const targetId = await registerAppwritePushTarget(token);
  if (targetId) {
    try {
      await subscribeAppwriteTargetToTopic(targetId, APPWRITE_PUSH_TOPIC_ID);
    } catch (error) {
      console.warn('Failed to subscribe Appwrite push target to topic:', error);
    }
  }

  return targetId;
}

export async function getOrCreateWebPushToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!WEB_VAPID_KEY) {
    return null;
  }

  try {
    if (Notification.permission === 'denied') {
      return null;
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') {
      return null;
    }

    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);

    return await getToken(messaging, {
      vapidKey: WEB_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    console.warn('Web push token registration failed:', error);
    return null;
  }
}

export async function syncPushTokenForUser(token: string) {
  await registerDevicePushSubscription(token);
  try {
    await syncCurrentUserPushToken(token);
  } catch (error) {
    console.warn('Failed to sync push token to the signed-in user profile:', error);
  }
}

export async function subscribePushTokenToTopic(token: string, topic = 'news-updates') {
  if (!token || !topic) {
    return;
  }
  const targetId = await registerDevicePushSubscription(token);
  if (targetId) {
    await subscribeAppwriteTargetToTopic(targetId, topic);
  }
}

export async function removePushTokenForUser(token: string) {
  await removeCurrentUserPushToken(token);
}
