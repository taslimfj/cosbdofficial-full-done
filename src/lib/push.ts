import { supabase } from '@/integrations/supabase/client';

// VAPID public key — safe to expose in the browser.
const VAPID_PUBLIC_KEY = 'BAxQpqKsiIYcU3SqO1CxF8iyoCf7J6BJXdu1xZcvAbHbbPiTNBvOFzLfm441AdU34j_xUBtL7YFqHLSzZWD2TdM';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('SW register failed', e);
    return null;
  }
}

export async function enablePushForCurrentUser(userId: string): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const reg = await registerSW();
  if (!reg) return 'unsupported';

  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint || sub.endpoint;
  const p256dh = json.keys?.p256dh || arrayBufToBase64(sub.getKey('p256dh'));
  const auth = json.keys?.auth || arrayBufToBase64(sub.getKey('auth'));

  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' });

  return 'granted';
}

/** Silent attempt — only re-uses existing permission; no prompt. */
export async function silentSyncPush(userId: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  await enablePushForCurrentUser(userId);
}
