import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { CurrencyType } from '../types';
import { decryptWithPassword, decryptMnemonicFromFragments, decryptPieces } from '../utils/crypto';
import { checkPassphraseStrength } from '../utils/strength';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import {
  Coins,
  Lock,
  FileCode,
  LogOut,
  ChevronRight,
  Wifi,
  Compass,
  Database,
  Globe,
  ShieldCheck,
  Timer,
  Cpu,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Search
} from 'lucide-react';
import { motion } from 'motion/react';

export const MobileSettingsView: React.FC = () => {
  const {
    activeWallet,
    currency,
    setCurrency,
    isPasswordEnabled,
    password,
    setPassword,
    setIsSignMessageOpen,
    openLogoutConfirm,
    showToast,
    autoLockDuration,
    setAutoLockDuration,
    lockOnExit,
    setLockOnExit,
    apiUrl,
    explorerUrl,
    scanWalletChainIndex,
    isScanningChain,
  } = useWallet();

  const [passwordForm, setPasswordForm] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [seedPasswordInput, setSeedPasswordInput] = useState('');
  const [showSeedPassword, setShowSeedPassword] = useState(false);
  const [decryptedMnemonic, setDecryptedMnemonic] = useState<string | null>(null);
  const [decryptedPassphrase, setDecryptedPassphrase] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  // Reset seed state when switching active wallet
  useEffect(() => {
    setSeedPasswordInput('');
    setDecryptedMnemonic(null);
    setDecryptedPassphrase(null);
    setShowSeed(false);
  }, [activeWallet?.id]);

  // Handle automatic on-the-fly decryption for Settings reveal
  useEffect(() => {
    if (isPasswordEnabled && !lockOnExit) {
      setLockOnExit(true);
    }
  }, [isPasswordEnabled, lockOnExit, setLockOnExit]);

  useEffect(() => {
    let isMounted = true;

    if (!isPasswordEnabled) {
      // Plaintext available directly if no password is set
      if (activeWallet?.mnemonic) {
        setDecryptedMnemonic(activeWallet.mnemonic);
        setDecryptedPassphrase(activeWallet.passphrase || null);
      }
      return;
    }

    if (seedPasswordInput.length < 8) {
      setDecryptedMnemonic(null);
      setDecryptedPassphrase(null);
      return;
    }

    const decryptSeed = async () => {
      setIsDecrypting(true);
      try {
        if (activeWallet?.encryptedMnemonicFragments) {
          const decryptedM = await decryptMnemonicFromFragments(
            activeWallet.encryptedMnemonicFragments,
            seedPasswordInput
          );
          
          let decryptedP = null;
          if (activeWallet?.encryptedPassphraseFragments) {
            const parts = await decryptPieces(activeWallet.encryptedPassphraseFragments, seedPasswordInput);
            decryptedP = parts.join('');
          } else if (activeWallet?.encryptedPassphrase) {
            decryptedP = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              seedPasswordInput
            );
          }
          
          if (isMounted) {
            setDecryptedMnemonic(decryptedM);
            setDecryptedPassphrase(decryptedP);
          }
        } else if (activeWallet?.encryptedMnemonic) {
          const decryptedM = await decryptWithPassword(
            activeWallet.encryptedMnemonic.ciphertext,
            activeWallet.encryptedMnemonic.salt,
            activeWallet.encryptedMnemonic.iv,
            seedPasswordInput
          );
          
          let decryptedP = null;
          if (activeWallet?.encryptedPassphrase) {
            decryptedP = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              seedPasswordInput
            );
          }
          
          if (isMounted) {
            setDecryptedMnemonic(decryptedM);
            setDecryptedPassphrase(decryptedP);
          }
        } else if (activeWallet?.mnemonic) {
          // Fallback if not encrypted but password is enabled
          if (seedPasswordInput === password) {
            setDecryptedMnemonic(activeWallet.mnemonic);
            setDecryptedPassphrase(activeWallet.passphrase || null);
          }
        }
      } catch (err) {
        if (isMounted) {
          setDecryptedMnemonic(null);
          setDecryptedPassphrase(null);
        }
      } finally {
        if (isMounted) {
          setIsDecrypting(false);
        }
      }
    };

    const timer = setTimeout(decryptSeed, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [seedPasswordInput, isPasswordEnabled, activeWallet, password]);

  const handleCopySeed = () => {
    if (!decryptedMnemonic) return;
    navigator.clipboard.writeText(decryptedMnemonic);
    setCopiedSeed(true);
    showToast('Seed phrase copied to clipboard', 'success');
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const currencies: CurrencyType[] = ['USD', 'EUR', 'GBP', 'BTC'];
  const autoLockOptions = [
    { label: 'ON', value: 0 },
    { label: '1m', value: 1 },
    { label: '5m', value: 5 },
    { label: '10m', value: 10 },
    { label: '30m', value: 30 },
  ];

  const handlePasswordToggle = async () => {
    if (isPasswordEnabled) {
      await setPassword(null);
      setPasswordForm('');
      showToast('Password security disabled', 'info');
    } else {
      if (passwordForm.length >= 8) {
        await setPassword(passwordForm);
        setPasswordForm('');
        showToast('Password security enabled!', 'success');
      } else {
        showToast('Password must be at least 8 characters', 'error');
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-4 py-2"
    >
      {/* 1. Connection Settings */}
      <div className="p-3.5 sm:p-5 kaspriv-card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Connection Settings</h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#70C7BA]/20 text-[#70C7BA] uppercase tracking-wider">
            Mainnet
          </span>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#090D12] ">
            <Database className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-200">Kaspa Node</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">grpcs://toccata.kaspriv.io</div>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#090D12] ">
            <Globe className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-200">REST API</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{apiUrl}</div>
              <div className="text-[9px] text-slate-500 mt-1">For transaction history and balance look up</div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#090D12] ">
            <Compass className="w-4 h-4 text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-200">Kaspa Explorer</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{explorerUrl.replace('https://', '')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Display Currency */}
      <div className="p-3.5 sm:p-5 kaspriv-card space-y-3">
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-[#70C7BA]" />
          <h3 className="text-sm font-extrabold text-slate-100">Display Currency</h3>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {currencies.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                currency === c
                  ? 'bg-[#70C7BA] text-[#090D12] border-[#70C7BA]'
                  : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:text-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Password Lock Security */}
      <div className="p-3.5 sm:p-5 kaspriv-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Password Security</h3>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isPasswordEnabled ? 'bg-[#70C7BA]/20 text-[#70C7BA]' : 'bg-slate-800 text-slate-400'}`}>
            {isPasswordEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {!isPasswordEnabled ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPasswordForm ? "text" : "password"}
                  placeholder="Enter password (min 8 chars)"
                  value={passwordForm}
                  onFocus={() => openKeyboard({ value: passwordForm, onChange: setPasswordForm })}
                  onClick={() => openKeyboard({ value: passwordForm, onChange: setPasswordForm })}
                  readOnly
                  inputMode="none"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPasswordForm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handlePasswordToggle}
                className="px-4 py-2.5 rounded-xl bg-[#70C7BA] text-[#090D12] font-bold text-xs shadow-lg shadow-[#70C7BA]/20"
              >
                Set Password
              </button>
            </div>
            
            {passwordForm.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3 h-3 ${checkPassphraseStrength(passwordForm).color}`} />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Security Level</span>
                </div>
                <span className={`text-[9px] font-extrabold ${checkPassphraseStrength(passwordForm).color}`}>
                  {checkPassphraseStrength(passwordForm).label}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full py-2.5 px-3 rounded-xl bg-[#70C7BA]/5 border border-[#70C7BA]/20 text-[#70C7BA]/60 font-bold text-xs text-center cursor-default">
            Password Protection Active
          </div>
        )}
      </div>

      {/* 3. Encrypted Seed Phrase Backup Card */}
      <div className="p-3.5 sm:p-5 kaspriv-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Seed Phrase Backup</h3>
          </div>
          <span
            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isPasswordEnabled
                ? 'bg-[#70C7BA]/20 text-[#70C7BA] border border-[#70C7BA]/40'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}
          >
            {isPasswordEnabled ? 'Encrypted (AES-GCM)' : 'Unprotected Mode'}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Your wallet seed phrase is encrypted with Argon2id + AES-256-GCM, derived from your master password, and is never stored in plaintext. It can only be decrypted locally on your device.
        </p>

        {isPasswordEnabled && !decryptedMnemonic && (
          <div className="space-y-2 pt-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
              Wallet Password
            </label>
            <p className="text-[10px] text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/30">
              ⚠️ Only reveal your seed in a private place.
            </p>
            <div className="relative">
              <input
                type={showSeedPassword ? "text" : "password"}
                placeholder="Enter wallet password"
                value={seedPasswordInput}
                onFocus={() => openKeyboard({ value: seedPasswordInput, onChange: setSeedPasswordInput })}
                onClick={() => openKeyboard({ value: seedPasswordInput, onChange: setSeedPasswordInput })}
                readOnly
                inputMode="none"
                className="w-full px-3 py-2.5 text-center text-sm rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-slate-100 outline-none transition-colors pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSeedPassword(!showSeedPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showSeedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {seedPasswordInput.length >= 8 && !decryptedMnemonic && !isDecrypting && (
              <p className="text-[10px] text-rose-400 text-center font-semibold">
                Incorrect Password. Decryption failed.
              </p>
            )}
            {isDecrypting && (
              <div className="flex items-center justify-center gap-1.5 py-1 text-[10px] text-blue-400">
                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span>Decrypting seed phrase...</span>
              </div>
            )}
          </div>
        )}

        {(!isPasswordEnabled || decryptedMnemonic) && (
          <div className="space-y-3 pt-1">
            {!showSeed ? (
              <div className="space-y-3">
                <p className="text-[11px] text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/30 font-medium leading-relaxed">
                  ⚠️ <strong>Security Warning:</strong> Only reveal your seed phrase in a private place where no cameras or people can see your screen.
                </p>
                <button
                  onClick={() => setShowSeed(true)}
                  className="w-full py-3 px-3 rounded-xl bg-[#70C7BA] text-[#090D12] font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#70C7BA]/20 hover:bg-[#5db3a6] transition-all active:scale-[0.98]"
                >
                  <Eye className="w-4 h-4" />
                  <span>Reveal 24-Word Seed Phrase</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-[#212B38]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    24-Word Seed Phrase
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopySeed}
                      className="p-1.5 rounded-lg bg-[#090D12] text-slate-300 hover:text-[#70C7BA] text-[10px] flex items-center gap-1"
                    >
                      {copiedSeed ? <Check className="w-3.5 h-3.5 text-[#70C7BA]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSeed ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => setShowSeed(false)}
                      className="p-1.5 rounded-lg bg-[#090D12] text-slate-400 hover:text-slate-200"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#090D12]  grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  {decryptedMnemonic?.split(/\s+/).map((word, idx) => (
                    <div key={idx} className="flex items-center gap-1 p-1 bg-[#090D12] rounded ">
                      <span className="text-slate-500 w-4 text-right select-none">{idx + 1}.</span>
                      <span className="text-[#70C7BA] font-bold truncate">{word}</span>
                    </div>
                  ))}
                </div>

                {decryptedPassphrase && (
                  <div className="p-2.5 rounded-xl bg-[#090D12]  text-xs">
                    <span className="text-slate-400 font-bold">Passphrase: </span>
                    <span className="text-slate-200 font-mono">{decryptedPassphrase}</span>
                  </div>
                )}

                {isPasswordEnabled && (
                  <button
                    onClick={() => {
                      setSeedPasswordInput('');
                      setDecryptedMnemonic(null);
                      setDecryptedPassphrase(null);
                      setShowSeed(false);
                    }}
                    className="w-full py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Backup View</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Auto Lock Security */}
      <div className={`p-4 sm:p-5 kaspriv-card space-y-4 transition-all duration-300 ${!isPasswordEnabled ? 'opacity-60 grayscale-[0.5]' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA]">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100">Auto Lock Security</h3>
              <p className="text-[10px] text-slate-400 font-medium">Protect session when inactive</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50">
            <div>
              <div className="text-xs font-bold text-slate-200">Lock on Exit</div>
              <div className="text-[9px] text-slate-500">Lock immediately when app is closed/minimized</div>
            </div>
            <button
              onClick={() => {
                if (!isPasswordEnabled) {
                  showToast('Enable Password first to use Auto Lock', 'info');
                  return;
                }
                setLockOnExit(!lockOnExit);
              }}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                lockOnExit ? 'bg-[#70C7BA]' : 'bg-slate-700'
              }`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                lockOnExit ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inactivity Timer</label>
              <span className="text-[10px] font-black text-[#70C7BA] uppercase">
                {autoLockDuration === 0 ? 'Immediate' : `${autoLockDuration} Minutes`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {autoLockOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (!isPasswordEnabled) {
                      showToast('Enable Password first to use Auto Lock', 'info');
                      return;
                    }
                    setAutoLockDuration(opt.value);
                  }}
                  className={`py-2.5 rounded-xl border text-[10px] font-black transition-all ${
                    autoLockDuration === opt.value && isPasswordEnabled
                      ? 'bg-[#70C7BA] text-[#090D12] border-[#70C7BA] shadow-lg shadow-[#70C7BA]/10'
                      : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-[#70C7BA]/5 border border-[#70C7BA]/10 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#70C7BA] mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-[#70C7BA]/80 leading-relaxed font-medium">
            {isPasswordEnabled 
              ? "Your wallet will automatically lock and require your password after the selected duration of inactivity or when you leave the app."
              : "Enable Password Protection above to configure these security timers."}
          </p>
        </div>
      </div>

      {/* 4. Tools & Actions */}
      <div className="p-3.5 sm:p-5 kaspriv-card space-y-2">
        <button
          onClick={scanWalletChainIndex}
          disabled={isScanningChain}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#090D12]  hover:border-[#70C7BA] text-xs text-slate-200 transition-all group disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <Search className={`w-4 h-4 text-cyan-400 ${isScanningChain ? 'animate-spin' : ''}`} />
            <div className="text-left">
              <span className="font-semibold block text-cyan-300">Scan DAG Chain Index</span>
              <span className="text-[10px] text-slate-400">Discover all HD receive/change addresses & funds</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200" />
        </button>

        <button
          onClick={() => setIsSignMessageOpen(true)}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#090D12]  hover:border-[#70C7BA] text-xs text-slate-200 transition-all group"
        >
          <div className="flex items-center gap-3">
            <FileCode className="w-4 h-4 text-[#70C7BA]" />
            <span className="font-semibold">Sign Schnorr Message</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200" />
        </button>

        <button
          onClick={openLogoutConfirm}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-xs text-rose-400 transition-all font-semibold"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4" />
            <span>Log Out Wallet Session</span>
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
