// Guarded PWA registration wrapper.
// Only registers /sw.js in production, outside iframes/preview hosts.

const SW_URL = '/sw.js';

function shouldRegister(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.top !== window.self) return false;

  const host = window.location.hostname;
  if (host.startsWith('id-preview--') || host.startsWith('preview--')) return false;
  if (host === 'lovableproject.com' || host.endsWith('.lovableproject.com')) return false;
  if (host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com')) return false;
  if (host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')) return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('sw') === 'off') return false;

  return true;
}

async function unregisterMatching() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (url.endsWith(SW_URL)) {
        await reg.unregister();
      }
    }
  } catch {}
}

export async function registerPWA() {
  if (!shouldRegister()) {
    await unregisterMatching();
    return;
  }
  try {
    // গুরুত্বপূর্ণ: app চালু অবস্থায় (বা minimize থেকে ফিরে আসার সময়) কখনোই
    // জোর করে reload করা হবে না — তাতে form-এ লেখা data হারিয়ে যায়।
    // নতুন version পাওয়া গেলে সেটা পরের বার app পুরোপুরি বন্ধ করে খুললে active হবে।
    const reg = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      updateViaCache: 'none',
    });

    // কোনো page নিয়ন্ত্রণে না থাকলে (একদম fresh start) সঙ্গে সঙ্গে নতুন worker activate করা নিরাপদ।
    if (!navigator.serviceWorker.controller && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Background-এ শুধু update check — কোনো skipWaiting/reload নয়।
    reg.update().catch(() => {});
  } catch (e) {
    console.warn('SW registration failed', e);
  }
}
