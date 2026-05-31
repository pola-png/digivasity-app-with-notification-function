import { Capacitor, registerPlugin } from '@capacitor/core';

export type PushCategory = 'transactional' | 'marketing';

export type PushView =
  | 'home'
  | 'universities'
  | 'pof'
  | 'visa'
  | 'resume'
  | 'chat'
  | 'news'
  | 'blog'
  | 'privacy'
  | 'terms'
  | 'contact';

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  category?: PushCategory;
  view?: PushView;
  deepLink?: string;
  postId?: string;
  data?: Record<string, string>;
}

export interface PushTokenResult {
  token: string;
}

export interface PushPermissionResult {
  granted: boolean;
  status?: string;
}

export interface PushLaunchResult {
  notification: PushNotificationPayload | null;
}

export interface PushActionResult {
  notification: PushNotificationPayload;
}

export interface DigivasityPushPlugin {
  requestNotificationPermission(): Promise<PushPermissionResult>;
  getToken(): Promise<PushTokenResult>;
  getLaunchNotification(): Promise<PushLaunchResult>;
  clearLaunchNotification(): Promise<void>;
  showLocalNotification(notification: PushNotificationPayload): Promise<void>;
  addListener(
    eventName: 'pushTokenReceived',
    listenerFunc: (event: PushTokenResult) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'pushNotificationActionPerformed',
    listenerFunc: (event: PushActionResult) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const DigivasityPush = registerPlugin<DigivasityPushPlugin>('DigivasityPush');

export const isNativePushSupported = () => Capacitor.getPlatform() === 'android';

export function normalizePushView(view: string | null | undefined): PushView | null {
  if (!view) {
    return null;
  }

  if (view === 'news') {
    return 'blog';
  }

  return isKnownView(view) ? view : null;
}

export function toAppView(payload: PushNotificationPayload | null | undefined): PushView | null {
  if (!payload) return null;

  if (payload.view) {
    return normalizePushView(payload.view);
  }

  if (payload.deepLink) {
    try {
      const url = new URL(payload.deepLink);
      const view = url.searchParams.get('view');
      if (view && isKnownView(view)) {
        return normalizePushView(view as PushView);
      }
    } catch {
      return null;
    }
  }

  if (payload.data?.view && isKnownView(payload.data.view)) {
    return normalizePushView(payload.data.view as PushView);
  }

  return null;
}

function isKnownView(value: string): value is PushView {
  return (
    value === 'home' ||
    value === 'universities' ||
    value === 'pof' ||
    value === 'visa' ||
    value === 'resume' ||
    value === 'chat' ||
    value === 'news' ||
    value === 'blog' ||
    value === 'privacy' ||
    value === 'terms' ||
    value === 'contact'
  );
}

export function dispatchPushOpen(payload: PushNotificationPayload) {
  window.__digivasityPendingPushOpen = payload;
  window.dispatchEvent(
    new CustomEvent<PushNotificationPayload>('digivasity:push-open', {
      detail: payload,
    })
  );
}

export function consumePendingPushOpen() {
  const payload = window.__digivasityPendingPushOpen || null;
  window.__digivasityPendingPushOpen = null;
  return payload;
}

declare global {
  interface Window {
    __digivasityPendingPushOpen?: PushNotificationPayload | null;
  }
}
