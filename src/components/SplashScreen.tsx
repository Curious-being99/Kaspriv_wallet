import React from 'react';
import { motion } from 'motion/react';

export const SplashScreen: React.FC = () => {
  // Detect if running in standalone PWA mode (homescreen launch)
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );

  return (
    <div className="fixed inset-0 z-[100000] bg-[#090D12] flex flex-col items-center justify-center p-6 select-none animate-none">
      <motion.div
        // For standalone, start fully visible to seamlessly transition from the native PWA launch screen
        initial={isStandalone ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col items-center justify-center"
      >
        <div className="relative flex items-center justify-center">
          {/* Double Chevron Logo matching kas_icon.svg exactly */}
          <svg className="w-48 h-48" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M120 100H200L320 256L200 412H120L240 256L120 100Z" fill="#70C7BA" />
            <path d="M260 100H340L460 256L340 412H260L380 256L260 100Z" fill="#70C7BA" fillOpacity="0.6" />
          </svg>
        </div>
      </motion.div>
    </div>
  );
};
