import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone());

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success('App ইনস্টল হয়েছে');
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === 'accepted') {
          setDeferred(null);
        }
      } catch {
        toast.error('Install prompt দেখানো যায়নি');
      }
      return;
    }
    if (isIOS()) {
      toast('iPhone/iPad এ install করতে Safari এর Share বাটন → "Add to Home Screen" এ tap করুন', {
        duration: 6000,
      });
      return;
    }
    toast('Browser এর address bar এর install icon বা menu → "Install app" থেকে install করুন', {
      duration: 6000,
    });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      className="h-8 gap-1.5"
      title="Download our app"
    >
      <Download className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Download App</span>
      <span className="sm:hidden">App</span>
    </Button>
  );
}
