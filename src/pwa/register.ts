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
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const reg = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
      updateViaCache: 'none',
    });

    const applyWaitingWorker = () => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    };

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    applyWaitingWorker();
    await reg.update();

    window.addEventListener('focus', () => { reg.update().then(applyWaitingWorker).catch(() => {}); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().then(applyWaitingWorker).catch(() => {});
    });
  } catch (e) {
    console.warn('SW registration failed', e);
  }
}
