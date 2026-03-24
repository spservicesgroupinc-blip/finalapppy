import React, { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

type Platform = 'chrome' | 'ios' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isInStandaloneMode =
    ('standalone' in navigator && (navigator as any).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isInStandaloneMode) return null;
  if (isIOS) return 'ios';
  return 'chrome';
}

export function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed')) return;

    const detected = detectPlatform();
    if (!detected) return;

    if (detected === 'ios') {
      setTimeout(() => setPlatform('ios'), 3000);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('chrome');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setPlatform(null);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', '1');
    setPlatform(null);
    setDismissed(true);
  };

  if (!platform || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-800 text-white rounded-xl shadow-2xl border border-slate-600 p-4">
      <div className="flex items-start gap-3">
        <div className="bg-red-600 rounded-lg p-2 shrink-0">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install RFE Foam Pro</p>
          {platform === 'ios' ? (
            <p className="text-xs text-slate-300 mt-1">
              Tap the <Share className="inline h-3 w-3" /> Share button, then{' '}
              <strong>"Add to Home Screen"</strong> to install.
            </p>
          ) : (
            <p className="text-xs text-slate-300 mt-1">
              Install for fast offline access, desktop icon, and app experience.
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white shrink-0 -mt-1"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {platform === 'chrome' && (
        <button
          onClick={handleInstall}
          className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Install App
        </button>
      )}
    </div>
  );
}
