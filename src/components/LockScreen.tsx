import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { unifiedAuthService } from '../services/unifiedAuthService';
import { Lock, Unlock, ShieldAlert, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hapticSuccess, hapticError, hapticMedium } from '../utils/haptics';

export const LockScreen: React.FC = () => {
  const {
    unlockWallet,
    setIsLocked,
    isLocked,
    wallets,
    isBiometricsEnabled,
    unlockWithBiometrics,
    setActiveBottomTab,
    clearPendingLockFlags,
    isPendingLogout,
    setIsPendingLogout,
    confirmLogout,
    indexingState,
  } = useWallet();
  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();
  const [password, setPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isAuthenticatingBiometrics, setIsAuthenticatingBiometrics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Auto-trigger Biometrics if enabled, or Virtual Keyboard when LockScreen is shown
  useEffect(() => {
    let bioTimer: any;
    if (isLocked && !indexingState?.isIndexing && wallets.length > 0) {
      setPassword('');
      setError(null);
      if (isBiometricsEnabled) {
        // Debounce slightly to ensure Android Activity window has full focus
        bioTimer = setTimeout(() => {
          handleBiometricUnlock(false);
        }, 150);
      } else {
        openKeyboard({
          value: '',
          onChange: (val) => {
            setPassword(val);
            setError(null);
          },
        });
      }
    } else {
      setPassword('');
      closeKeyboard();
    }
    return () => {
      if (bioTimer) clearTimeout(bioTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, wallets.length, isBiometricsEnabled, indexingState?.isIndexing]);

  if (!isLocked || (indexingState && indexingState.isIndexing) || wallets.length === 0) return null;

  const handleBiometricUnlock = async (isManualTrigger: boolean = false) => {
    if (isDecrypting) return;
    if (isAuthenticatingBiometrics && !isManualTrigger) return;
    hapticMedium();
    setIsAuthenticatingBiometrics(true);
    setError(null);
    try {
      const success = await unlockWithBiometrics();
      if (success) {
        hapticSuccess();
        clearPendingLockFlags();
        unifiedAuthService.completeUnlock('biometrics');
        setIsLocked(false);
        closeKeyboard();
        if (isPendingLogout) {
          setIsPendingLogout(false);
          await confirmLogout();
        } else {
          setActiveBottomTab('home');
        }
      } else {
        hapticError();
        setError('Biometric authentication failed or was cancelled');
      }
    } catch (err: any) {
      hapticError();
      setError(err?.message || 'Biometric authentication failed');
    } finally {
      setIsAuthenticatingBiometrics(false);
    }
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) return;

    setIsDecrypting(true);
    setError(null);

    try {
      const success = await unlockWallet(password);
      if (success) {
        hapticSuccess();
        clearPendingLockFlags();
        unifiedAuthService.completeUnlock('password');
        setIsLocked(false);
        closeKeyboard();
        if (isPendingLogout) {
          setIsPendingLogout(false);
          await confirmLogout();
        } else {
          setActiveBottomTab('home');
        }
      } else {
        hapticError();
        setError('Incorrect password');
      }
    } catch (err) {
      hapticError();
      setError('An error occurred');
    } finally {
      setIsDecrypting(false);
      setPassword('');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-[#05080A] flex flex-col items-center px-6 overflow-hidden transition-all duration-300 justify-center"
      style={{ 
        paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 2.5rem), 3.5rem)',
        paddingBottom: isKeyboardOpen ? '230px' : 'max(2rem, env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className={`w-full max-w-sm flex flex-col items-center transition-all duration-300 ${
        isKeyboardOpen ? 'gap-3 mb-0' : 'gap-6 mb-0'
      }`}>
        <motion.div
          animate={{ scale: isKeyboardOpen ? 0.8 : 1 }}
          className="relative"
        >
          <div
            className={`rounded-3xl bg-gradient-to-br from-[#1C2F42] to-[#0B151E] flex items-center justify-center border border-white/5 shadow-2xl transition-all duration-300 ${
              isKeyboardOpen ? 'w-12 h-12' : 'w-16 h-16'
            }`}
          >
            <Lock className={`text-[#70C7BA] transition-all duration-300 ${
              isKeyboardOpen ? 'w-5 h-5' : 'w-7 h-7'
            }`} />
          </div>
        </motion.div>

        <div className="text-center space-y-1">
          <h2 className={`font-bold text-slate-100 tracking-tight transition-all duration-300 ${
            isKeyboardOpen ? 'text-lg' : 'text-xl'
          }`}>
            {isPendingLogout ? 'Unlock to Log Out' : 'Wallet Locked'}
          </h2>
          <p className="text-xs text-slate-400">
            {isPendingLogout ? 'Enter your password to authorize log out' : 'Enter your password to continue'}
          </p>
        </div>

        <form onSubmit={handleUnlock} className={`w-full transition-all duration-300 ${isKeyboardOpen ? 'space-y-3' : 'space-y-4'}`}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onFocus={() => openKeyboard({ value: password, onChange: (val) => { setPassword(val); setError(null); } })}
                  onClick={() => openKeyboard({ value: password, onChange: (val) => { setPassword(val); setError(null); } })}
                  inputMode="none"
                  onChange={() => {}}
                  className={`w-full px-4 py-3 rounded-xl bg-[#0B151E] border-2 transition-all text-center text-sm ${
                    error ? 'border-rose-500/50' : 'border-[#1C2F42] focus:border-[#70C7BA]'
                  } text-slate-100 outline-none cursor-pointer pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {isBiometricsEnabled && (
                <button
                  type="button"
                  onClick={() => handleBiometricUnlock(true)}
                  disabled={isDecrypting}
                  title="Prompt Biometrics"
                  className="p-3 text-[#70C7BA]/80 hover:text-[#70C7BA] transition-all cursor-pointer disabled:opacity-50 active:scale-95 flex items-center justify-center shrink-0 relative group"
                >
                  {isAuthenticatingBiometrics ? (
                    <div className="w-5 h-5 border-2 border-[#70C7BA]/30 border-t-[#70C7BA] rounded-full animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5 text-[#70C7BA] animate-pulse" />
                  )}
                </button>
              )}
            </div>

            {isBiometricsEnabled && (
              <button
                type="button"
                onClick={() => handleBiometricUnlock(true)}
                disabled={isDecrypting}
                className="w-full py-1.5 text-[#70C7BA]/80 hover:text-[#70C7BA] text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Fingerprint className="w-4 h-4 text-[#70C7BA]/80" />
                <span>{isAuthenticatingBiometrics ? 'Prompting Biometrics...' : 'Tap fingerprint icon to unlock with Biometrics'}</span>
              </button>
            )}
            
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center justify-center gap-1.5 text-rose-400 text-[10px] font-medium"
                >
                  <ShieldAlert className="w-3 h-3" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={!password || isDecrypting}
              className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer ${
                isPendingLogout
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-[#70C7BA] text-[#090D12] hover:bg-[#5eb5a8]'
              }`}
            >
              {isDecrypting ? (
                <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>{isPendingLogout ? 'Unlock & Log Out' : 'Unlock'}</span>
                </>
              )}
            </button>

            {isPendingLogout && (
              <button
                type="button"
                onClick={() => {
                  setIsPendingLogout(false);
                  setIsLocked(false);
                  closeKeyboard();
                }}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel Log Out
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-[#70C7BA]/5 to-transparent pointer-events-none" />
    </div>
  );
};
