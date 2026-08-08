import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ToastProps {
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  onDismiss?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 450, damping: 26 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] pointer-events-auto max-w-[85vw] sm:max-w-sm w-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F1722]/95 border border-[#213248]/80 shadow-[0_12px_40px_rgba(0,0,0,0.7)] text-slate-200 text-[11px] sm:text-xs font-semibold backdrop-blur-xl ring-1 ring-white/5"
        >
          {toast.type === 'success' && (
            <div className="p-1 rounded-lg bg-[#70C7BA]/20 text-[#70C7BA] border border-[#70C7BA]/30 flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          )}
          {toast.type === 'error' && (
            <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          )}
          {toast.type === 'info' && (
            <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex-shrink-0">
              <Info className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="leading-tight pr-1 select-none">{toast.message}</span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="ml-auto p-0.5 text-slate-400 hover:text-slate-100 transition-colors rounded-md hover:bg-slate-800/50"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

