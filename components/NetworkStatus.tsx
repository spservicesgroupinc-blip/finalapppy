import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowBack(true);
        setTimeout(() => setShowBack(false), 3000);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (isOnline && !showBack) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        isOnline ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
      }`}
    >
      {isOnline ? (
        <span>Back online</span>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You are offline — cached data is available</span>
        </>
      )}
    </div>
  );
}
