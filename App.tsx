import React from 'react';
import SprayFoamCalculator from './components/SprayFoamCalculator';
import { CalculatorProvider } from './context/CalculatorContext';
import { NetworkStatus } from './components/NetworkStatus';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PWAUpdateToast } from './components/PWAUpdateToast';

function App() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 py-8">
      <NetworkStatus />
      <CalculatorProvider>
        <SprayFoamCalculator />
      </CalculatorProvider>
      <PWAInstallPrompt />
      <PWAUpdateToast />
    </div>
  );
}

export default App;
