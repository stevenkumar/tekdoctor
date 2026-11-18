import { notificationApi, extractResponseData } from '../services/api';

/**
 * Converts a URL-safe Base64 string to a Uint8Array (required for PushManager.subscribe applicationServerKey).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if Push Notifications and Service Workers are supported in the current browser.
 */
export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Gets the current notification permission status ('default' | 'granted' | 'denied' | 'unsupported').
 */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Checks if the current browser already has an active PushSubscription registered.
 */
export async function checkIsPushSubscribed(): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Requests notification permission, retrieves VAPID public key, and registers PushSubscription with server.
 */
export async function subscribeToLiveAlerts(token: string): Promise<{
  success: boolean;
  permission?: NotificationPermission;
  error?: string;
}> {
  if (!isPushNotificationSupported()) {
    return { success: false, error: 'Push notifications are not supported on this browser or platform.' };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, permission, error: 'Notification permission was denied.' };
    }

    // 2. Fetch VAPID public key
    const vapidRes = await notificationApi.getVapidPublicKey();
    const payload = extractResponseData<{ publicKey?: string }>(vapidRes, {});
    const publicKey = payload?.publicKey;
    if (!vapidRes.ok || !publicKey) {
      return { success: false, error: vapidRes.error || 'Failed to fetch server VAPID key.' };
    }
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // 3. Register or retrieve active PushSubscription from Service Worker
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any
      });
    }

    // 4. Save to backend database
    const subJSON = subscription.toJSON();
    const saveRes = await notificationApi.subscribePush(token, subJSON);

    if (!saveRes.ok) {
      return { success: false, error: saveRes.error || 'Failed to save subscription on server.' };
    }

    return { success: true, permission };
  } catch (err: any) {
    console.error('[PushSubscription] Error subscribing:', err);
    return { success: false, error: err?.message || 'Failed to register live push alerts.' };
  }
}

/**
 * Unsubscribes the user from push notifications on both the browser and the server.
 */
export async function unsubscribeFromLiveAlerts(token: string): Promise<{ success: boolean; error?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, error: 'Push notifications not supported.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await notificationApi.unsubscribePush(token, subscription.endpoint);
      await subscription.unsubscribe();
    } else {
      await notificationApi.unsubscribePush(token);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[PushSubscription] Error unsubscribing:', err);
    return { success: false, error: err?.message || 'Failed to unsubscribe.' };
  }
}
