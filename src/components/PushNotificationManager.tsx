import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './AppwriteProvider';
import {
  DigivasityPush,
  dispatchPushOpen,
  isNativePushSupported,
  PushNotificationPayload,
  toAppView,
} from '../lib/pushNotifications';
import {
  getOrCreateWebPushToken,
  removePushTokenForUser,
  registerDevicePushSubscription,
  syncPushTokenForUser,
} from '../lib/webPush';

function normalizePayload(payload: PushNotificationPayload): PushNotificationPayload {
  return {
    ...payload,
    data: payload.data || {},
  };
}

async function addTokenToUser(token: string) {
  await syncPushTokenForUser(token);
}

async function removeTokenFromUser(token: string) {
  await removePushTokenForUser(token);
}

export const PushNotificationManager: React.FC = () => {
  const { user, isAuthReady } = useAuth();
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const syncedTokenRef = useRef<string | null>(null);
  const subscribedTokenRef = useRef<string | null>(null);
  const listenersReadyRef = useRef(false);
  const webBootstrapUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativePushSupported() || listenersReadyRef.current) {
      return;
    }

    listenersReadyRef.current = true;
    let isMounted = true;
    const listenerRemovers: Array<() => Promise<void>> = [];

    const bootstrapPush = async () => {
      try {
        await DigivasityPush.requestNotificationPermission().catch(() => undefined);
      } catch {
        // Permission checks are best-effort; token fetch can still proceed on older devices.
      }

      try {
        const { token } = await DigivasityPush.getToken();
        if (isMounted && token) {
          setDeviceToken(token);
        }
      } catch {
        // Ignore token bootstrap errors and wait for the native service to emit later.
      }

      try {
        const launch = await DigivasityPush.getLaunchNotification();
        if (launch.notification) {
          dispatchPushOpen(normalizePayload(launch.notification));
          await DigivasityPush.clearLaunchNotification().catch(() => undefined);
        }
      } catch {
        // No stored launch notification is fine.
      }

      try {
        const tokenListener = await DigivasityPush.addListener('pushTokenReceived', ({ token }) => {
          if (token) {
            setDeviceToken(token);
          }
        });
        listenerRemovers.push(tokenListener.remove);
      } catch {
        // Listener registration is best-effort.
      }

      try {
        const actionListener = await DigivasityPush.addListener(
          'pushNotificationActionPerformed',
          ({ notification }) => {
            dispatchPushOpen(normalizePayload(notification));
          }
        );
        listenerRemovers.push(actionListener.remove);
      } catch {
        // Listener registration is best-effort.
      }
    };

    void bootstrapPush();

    return () => {
      isMounted = false;
      void Promise.all(listenerRemovers.map((remove) => remove())).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (isNativePushSupported()) {
      return;
    }

    if (webBootstrapUserRef.current === 'bootstrapped') {
      return;
    }

    webBootstrapUserRef.current = 'bootstrapped';
    let isMounted = true;

    const bootstrapWebPush = async () => {
      const token = await getOrCreateWebPushToken();
      if (isMounted && token) {
        setDeviceToken(token);
      }
    };

    void bootstrapWebPush();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const syncToken = async () => {
      if (!deviceToken) {
        return;
      }

      if (subscribedTokenRef.current !== deviceToken) {
        subscribedTokenRef.current = deviceToken;
      }

      if (!isAuthReady) {
        return;
      }

      if (!user?.$id) {
        try {
          await registerDevicePushSubscription(deviceToken);
          syncedTokenRef.current = deviceToken;
        } catch (error) {
          console.warn('Failed to register device push subscription before login:', error);
        }
        return;
      }

      const previousUserId = syncedUserIdRef.current;
      const previousToken = syncedTokenRef.current;

      if (previousUserId && previousToken && (previousUserId !== user.$id || previousToken !== deviceToken)) {
        try {
          await removeTokenFromUser(previousToken);
        } catch (error) {
          console.warn('Cleanup of stale token mapping failed:', error);
        }
      }

      try {
        await addTokenToUser(deviceToken);
        syncedUserIdRef.current = user.$id;
        syncedTokenRef.current = deviceToken;
      } catch (error) {
        console.warn('Failed to register active token mapping with Appwrite:', error);
      }
    };

    void syncToken();
  }, [deviceToken, isAuthReady, user?.$id]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<PushNotificationPayload>).detail;
      const view = toAppView(detail);
      if (view) {
        window.dispatchEvent(
          new CustomEvent('digivasity:push-route', {
            detail: { view, payload: detail },
          })
        );
      } else {
        window.__digivasityPendingPushOpen = null;
      }
    };

    window.addEventListener('digivasity:push-open', handleOpen);
    return () => window.removeEventListener('digivasity:push-open', handleOpen);
  }, []);

  return null;
};
