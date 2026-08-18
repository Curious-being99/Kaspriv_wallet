import React, { useState, useEffect } from 'react';
import { EyeOff, Eye, ShieldCheck } from 'lucide-react';

export const PrivacyShield: React.FC = () => {
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [shieldReason, setShieldReason] = useState<'screenshot' | 'blur'>('screenshot');

  useEffect(() => {
    const handleBlur = () => {
      // Ignore blur events caused by browser native biometric overlays
      if ((window as any).isBiometricPromptActive) {
        return;
      }
      setIsShieldActive(true);
      setShieldReason('blur');
    };

    const handleFocus = () => {
      setIsShieldActive(false);
    };

    const handleVisibilityChange = () => {
      if ((window as any).isBiometricPromptActive) {
        return;
      }
      if (document.hidden) {
        setIsShieldActive(true);
        setShieldReason('blur');
      } else {
        setIsShieldActive(false);
      }
    };

    const handleScreenshotKey = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
      const isWinSnippet = e.shiftKey && (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 's');
      const isPrintShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p';

      if (isPrintScreen || isMacScreenshot || isWinSnippet || isPrintShortcut) {
        setIsShieldActive(true);
        setShieldReason('screenshot');
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleScreenshotKey, true);
    window.addEventListener('keyup', handleScreenshotKey, true);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleScreenshotKey, true);
      window.removeEventListener('keyup', handleScreenshotKey, true);
    };
  }, []);

  if (!isShieldActive) return null;

  return (
    <>
      <style>{`
        @media print {
          body {
            display: none !important;
          }
        }
      `}</style>
      <div 
        onClick={() => setIsShieldActive(false)}
        className="fixed inset-0 z-[99999] bg-[#090D12]/98 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer"
      >
        <div className="w-16 h-16 rounded-3xl bg-[#131924] border border-[#212B38] flex items-center justify-center mb-4 shadow-2xl">
          <EyeOff className="w-8 h-8 text-[#70C7BA]" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-100 mb-2">Privacy Shield Active</h2>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-6">
          {shieldReason === 'screenshot' 
            ? 'Screenshot attempt detected. Sensitive wallet data has been obscured for your protection.'
            : 'Wallet display is paused while unfocused to protect your balances and keys.'}
        </p>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsShieldActive(false);
          }}
          className="px-5 py-2.5 rounded-xl bg-[#70C7BA] text-[#090D12] text-xs font-extrabold flex items-center gap-2 hover:bg-[#5db3a6] transition-all shadow-lg active:scale-95"
        >
          <Eye className="w-4 h-4" />
          <span>Resume Wallet View</span>
        </button>

        <p className="mt-4 text-[10px] text-slate-500 flex items-center gap-1 font-mono">
          <ShieldCheck className="w-3 h-3 text-[#70C7BA]" />
          <span>Tap anywhere to unlock display</span>
        </p>
      </div>
    </>
  );
};
