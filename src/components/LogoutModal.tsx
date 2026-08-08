import React from 'react';
import { useWallet } from '../context/WalletContext';
import { AlertTriangle, LogOut, X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const LogoutModal: React.FC = () => {
  const { isLogoutConfirmOpen, setIsLogoutConfirmOpen, confirmLogout, activeWallet } = useWallet();

  if (!isLogoutConfirmOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full  bg-[#090D12]   p-6  space-y-6 relative overflow-hidden"
        >
          {/* Top Decorative Glow */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

          {/* Close Button */}
          <button
            onClick={() => setIsLogoutConfirmOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-[#0B151E] text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-4 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-500/10 border border-rose-500/30">
              <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 tracking-tight">Confirm Log Out</h3>
              <p className="text-xs text-slate-400">Exit active session ({activeWallet?.name || 'Kaspa Wallet'})</p>
            </div>
          </div>

          {/* Warning Message Card */}
          <div className="p-4 rounded-2xl bg-[#0B151E] border border-rose-500/20 text-xs text-slate-300 space-y-2">
            <div className="font-semibold text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>Are you sure you want to log out?</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Logging out will clear your active dashboard session and return you to the main welcome page (Create or Import Wallet).
            </p>
            <p className="text-slate-400 leading-relaxed font-medium">
              Make sure you have saved your 24-word seed phrase in a safe place so you can restore your wallet anytime.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setIsLogoutConfirmOpen(false)}
              className="py-3 px-4 rounded-2xl bg-[#0B151E]  hover:border-slate-500 text-slate-300 font-bold text-xs transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmLogout}
              className="py-3 px-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-all shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out Now</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
