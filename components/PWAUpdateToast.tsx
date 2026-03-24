import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW registered:', r);
    },
    onRegisterError(error: any) {
      console.log('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white rounded-xl shadow-2xl border border-slate-600 px-5 py-3 flex items-center gap-4">
      <RefreshCw className="h-4 w-4 text-red-400 shrink-0" />
      <span className="text-sm">New version available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Reload
      </button>
    </div>
  );
}
