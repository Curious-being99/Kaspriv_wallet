import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { CurrencyType } from '../types';
import { decryptWithPassword, buildAadContext } from '../utils/crypto';
import { checkPassphraseStrength } from '../utils/strength';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { SecurityVerifier } from './SecurityVerifier';
import {
  Coins,
  Lock,
  FileCode,
  LogOut,
  ChevronRight,
  Wifi,
  Compass,
  Globe,
  ShieldCheck,
  Timer,
  Cpu,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileText,
  ChevronDown,
  ChevronUp,
  Github,
  Flame,
  ShieldAlert,
  AlertTriangle,
  Fingerprint,
  Vibrate,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const MobileSettingsView: React.FC = () => {
  const {
    activeWallet,
    currency,
    setCurrency,
    isPasswordEnabled,
    isDuressEnabled,
    isBiometricsSupported,
    isBiometricsEnabled,
    enableBiometrics,
    disableBiometrics,
    isHapticsSupported,
    isHapticsEnabled,
    setIsHapticsEnabled,
    triggerHaptic,
    password,
    setPassword,
    setDuressPassword,
    setIsSignMessageOpen,
    setIsNodeManagerOpen,
    openLogoutConfirm,
    showToast,
    autoLockDuration,
    setAutoLockDuration,
    lockOnExit,
    setLockOnExit,
    apiUrl,
    explorerUrl,
    activeNode,
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
  const [showTerms, setShowTerms] = useState(false);
  const [showSecurityVerifier, setShowSecurityVerifier] = useState(false);
  const [isSetPasswordDropdownOpen, setIsSetPasswordDropdownOpen] = useState(false);
  const [isVerifyPasswordDropdownOpen, setIsVerifyPasswordDropdownOpen] = useState(false);
  const [isDuressDropdownOpen, setIsDuressDropdownOpen] = useState(false);

  // Duress Password in Settings
  const [newDuressInput, setNewDuressInput] = useState('');
  const [confirmDuressInput, setConfirmDuressInput] = useState('');
  const [showDuressInput, setShowDuressInput] = useState(false);

  // Biometric authentication state
  const [bioPasswordInput, setBioPasswordInput] = useState('');
  const [showBioPassword, setShowBioPassword] = useState(false);
  const [isBioDropdownOpen, setIsBioDropdownOpen] = useState(false);
  const [isEnablingBio, setIsEnablingBio] = useState(false);

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  // Reset seed state when switching active wallet
  useEffect(() => {
    setSeedPasswordInput('');
    setDecryptedMnemonic(null);
    setDecryptedPassphrase(null);
    setShowSeed(false);
  }, [activeWallet?.id]);

  useEffect(() => {
    if (!isPasswordEnabled) {
      // Plaintext available directly if no password is set
      if (activeWallet?.mnemonic) {
        setDecryptedMnemonic(activeWallet.mnemonic);
        setDecryptedPassphrase(activeWallet.passphrase || null);
      }
      return;
    }
  }, [isPasswordEnabled, activeWallet]);

  const [seedPasswordError, setSeedPasswordError] = useState<string | null>(null);

  const handleVerifySeedPassword = async () => {
    if (seedPasswordInput.length < 8) {
      setSeedPasswordError('Password must be at least 8 characters');
      return;
    }

    setSeedPasswordError(null);
    setIsDecrypting(true);

    try {
      if (activeWallet?.encryptedMnemonic) {
        const decryptedM = await decryptWithPassword(
          activeWallet.encryptedMnemonic.ciphertext,
          activeWallet.encryptedMnemonic.salt,
          activeWallet.encryptedMnemonic.iv,
          seedPasswordInput,
          buildAadContext('MNEMONIC', activeWallet.id)
        );
        
        let decryptedP = null;
        if (activeWallet?.encryptedPassphrase) {
          decryptedP = await decryptWithPassword(
            activeWallet.encryptedPassphrase.ciphertext,
            activeWallet.encryptedPassphrase.salt,
            activeWallet.encryptedPassphrase.iv,
            seedPasswordInput,
            buildAadContext('PASSPHRASE', activeWallet.id)
          );
        }
        
        setDecryptedMnemonic(decryptedM);
        setDecryptedPassphrase(decryptedP);
      } else if (activeWallet?.mnemonic) {
        if (seedPasswordInput === password) {
          setDecryptedMnemonic(activeWallet.mnemonic);
          setDecryptedPassphrase(activeWallet.passphrase || null);
        } else {
          setSeedPasswordError('Incorrect Password. Decryption failed.');
        }
      }
    } catch (err) {
      setDecryptedMnemonic(null);
      setDecryptedPassphrase(null);
      setSeedPasswordError('Incorrect Password. Decryption failed.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCopySeed = () => {
    if (!decryptedMnemonic) return;
    navigator.clipboard.writeText(decryptedMnemonic);
    setCopiedSeed(true);
    showToast('Seed phrase copied to clipboard', 'success');
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const currencies: CurrencyType[] = ['USD', 'EUR', 'GBP', 'BTC'];
  const autoLockOptions = [
    { label: 'In', value: 0 },
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
      className="w-full space-y-4"
    >
      {/* 1. Connection Settings & Privacy Nodes */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Network & Private Nodes</h3>
          </div>
          <button
            onClick={() => setIsNodeManagerOpen(true)}
            className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-[#70C7BA]/20 hover:bg-[#70C7BA]/30 text-[#70C7BA] border border-[#70C7BA]/40 uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>Manage Nodes</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. Display Currency */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-3">
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



      {/* 3. Encrypted Seed Phrase Backup Card */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Seed Phrase Backup</h3>
          </div>
        </div>



        {isPasswordEnabled && !decryptedMnemonic && (
          <div className="border border-[#212B38] rounded-2xl bg-[#090D12] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsVerifyPasswordDropdownOpen(!isVerifyPasswordDropdownOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#0c1421] transition-all"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#70C7BA]" />
                <div>
                  <span className="block text-[11px] font-bold text-slate-200">
                    Verify Password to Unlock
                  </span>
                  <span className="text-[9px] text-slate-400">
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-amber-500/10 text-amber-400">
                </span>
                <motion.div
                  animate={{ rotate: isVerifyPasswordDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </motion.div>
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isVerifyPasswordDropdownOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="border-t border-[#212B38]/50 px-4 py-3.5 space-y-3 bg-black/10"
                >
                  <p className="text-[10px] text-amber-400">
                    ⚠️ Only reveal your seed in a private place where no cameras or screens can record it.
                  </p>
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showSeedPassword ? "text" : "password"}
                        placeholder="Enter wallet password"
                        value={seedPasswordInput}
                        onFocus={() => openKeyboard({ value: seedPasswordInput, onChange: (val) => { setSeedPasswordInput(val); if (seedPasswordError) setSeedPasswordError(null); } })}
                        onClick={() => openKeyboard({ value: seedPasswordInput, onChange: (val) => { setSeedPasswordInput(val); if (seedPasswordError) setSeedPasswordError(null); } })}
                        inputMode="none" onChange={() => {}}
                        className={`w-full px-3 py-2.5 text-center text-xs rounded-xl bg-[#090D12] ${seedPasswordError ? 'border-rose-500' : 'focus:border-[#70C7BA]'} text-slate-100 outline-none transition-colors pr-10 border border-[#212B38]`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSeedPassword(!showSeedPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showSeedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {seedPasswordError && (
                      <p className="text-[10px] text-rose-400 text-center font-semibold">
                        {seedPasswordError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleVerifySeedPassword}
                      disabled={isDecrypting || seedPasswordInput.length < 8}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        !isDecrypting && seedPasswordInput.length >= 8
                          ? 'bg-[#70C7BA] text-[#090D12] hover:bg-[#5eead4] shadow-md shadow-[#70C7BA]/20 cursor-pointer active:scale-[0.99]'
                          : 'bg-[#1A2330] text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isDecrypting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-[#090D12] border-t-transparent rounded-full animate-spin" />
                          <span>Decrypting Seed...</span>
                        </>
                      ) : (
                        <span>Verify & Unlock Seed</span>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {(!isPasswordEnabled || decryptedMnemonic) && (
          <div className="space-y-3 pt-1">
            {!showSeed ? (
              <div className="space-y-3">
                <p className="text-[11px] text-amber-400 font-medium leading-relaxed">
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

      {/* 4. Native Biometric Authentication (Face ID / Fingerprint) */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA]">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100">Native Biometric Unlock</h3>
              <p className="text-[10px] text-slate-400">Touch ID, Face ID & Hardware Enclave</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
            isBiometricsEnabled
              ? 'bg-[#70C7BA]/20 text-[#70C7BA] border border-[#70C7BA]/30'
              : 'bg-slate-800 text-slate-500'
          }`}>
            {isBiometricsEnabled ? 'Active' : isBiometricsSupported ? 'Available' : 'Unsupported'}
          </span>
        </div>

        <div className="space-y-3">
          {!isPasswordEnabled ? (
            <div className="p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50 text-[10px] text-amber-400/90 leading-relaxed">
              ⚠️ Set a wallet master password first to enable biometric hardware encryption.
            </div>
          ) : !isBiometricsSupported ? (
            <div className="p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50 text-[10px] text-slate-400 leading-relaxed">
              Platform biometric authenticator (WebAuthn) is not available or supported in this browser context.
            </div>
          ) : isBiometricsEnabled ? (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#70C7BA]" />
                  <span>Biometrics Enabled</span>
                </div>
                <div className="text-[9px] text-slate-400">
                  Unlocking via Face ID / Fingerprint sensor is active
                </div>
              </div>
              <button
                type="button"
                onClick={disableBiometrics}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
              >
                Disable
              </button>
            </div>
          ) : (
            <div className="border border-[#212B38] rounded-2xl bg-[#090D12] overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const next = !isBioDropdownOpen;
                  setIsBioDropdownOpen(next);
                  if (next) {
                    openKeyboard({ value: bioPasswordInput, onChange: (val) => setBioPasswordInput(val) });
                  } else {
                    closeKeyboard();
                  }
                }}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#0c1421] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-[#70C7BA]" />
                  <div>
                    <span className="block text-[11px] font-bold text-slate-200">
                      Enable Biometric Unlock
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Use Touch ID / Face ID instead of typing your password
                    </span>
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: isBioDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {isBioDropdownOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="border-t border-[#212B38]/50 px-4 py-3.5 space-y-3 bg-black/10"
                  >
                    <p className="text-[10px] text-slate-300">
                      Enter your current wallet password to register this device's biometric security chip.
                    </p>
                    <div className="relative">
                      <input
                        type={showBioPassword ? "text" : "password"}
                        placeholder="Current Wallet Password"
                        value={bioPasswordInput}
                        onFocus={() => openKeyboard({ value: bioPasswordInput, onChange: (val) => setBioPasswordInput(val) })}
                        onClick={() => openKeyboard({ value: bioPasswordInput, onChange: (val) => setBioPasswordInput(val) })}
                        onChange={(e) => {
                          setBioPasswordInput(e.target.value);
                          openKeyboard({ value: e.target.value, onChange: (val) => setBioPasswordInput(val) });
                        }}
                        inputMode="none"
                        className="w-full px-3 py-2.5 text-xs rounded-xl bg-[#090D12] focus:border-[#70C7BA] text-slate-100 outline-none pr-10 border border-[#212B38]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBioPassword(!showBioPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showBioPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={bioPasswordInput.length < 8 || isEnablingBio}
                      onClick={async () => {
                        setIsEnablingBio(true);
                        closeKeyboard();
                        const success = await enableBiometrics(bioPasswordInput);
                        setIsEnablingBio(false);
                        if (success) {
                          setBioPasswordInput('');
                          setIsBioDropdownOpen(false);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#70C7BA] text-[#090D12] text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-[#70C7BA]/20 hover:bg-[#5eb5a8] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    >
                      {isEnablingBio ? (
                        <div className="w-4 h-4 border-2 border-[#090D12]/30 border-t-[#090D12] rounded-full animate-spin" />
                      ) : (
                        <Fingerprint className="w-4 h-4" />
                      )}
                      <span>{isEnablingBio ? 'Prompting Biometrics...' : 'Register Device Biometrics'}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* 5. Auto Lock Security */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA]">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100">Auto Lock Security</h3>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">Lock on Exit</span>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                  lockOnExit ? 'bg-[#70C7BA]/20 text-[#70C7BA]' : 'bg-slate-800 text-slate-400'
                }`}>
                  {lockOnExit ? 'On' : 'Off'}
                </span>
              </div>
              <div className="text-[9px] text-slate-500">
                {lockOnExit ? 'Lock immediately when app is closed/minimized' : 'Lock on exit is disabled'}
              </div>
            </div>
            <button
              onClick={() => setLockOnExit(!lockOnExit)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
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
                  onClick={() => setAutoLockDuration(opt.value)}
                  className={`py-2.5 rounded-xl border text-[10px] font-black transition-all cursor-pointer ${
                    autoLockDuration === opt.value
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
      </div>

      {/* 6. Haptic Feedback (Vibration) */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA]">
              <Vibrate className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100">Haptic Feedback</h3>
              <p className="text-[10px] text-slate-400">Tactile button and keyboard vibration</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
            isHapticsEnabled
              ? 'bg-[#70C7BA]/20 text-[#70C7BA] border border-[#70C7BA]/30'
              : 'bg-slate-800 text-slate-500'
          }`}>
            {isHapticsEnabled ? 'Active' : isHapticsSupported ? 'Disabled' : 'Unsupported'}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#090D12] border border-[#212B38]/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">Button & Key Vibration</span>
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                  isHapticsEnabled ? 'bg-[#70C7BA]/20 text-[#70C7BA]' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isHapticsEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <div className="text-[9px] text-slate-500">
                Provides subtle vibration when tapping buttons, keys, and alerts
              </div>
            </div>
            <button
              onClick={() => setIsHapticsEnabled(!isHapticsEnabled)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                isHapticsEnabled ? 'bg-[#70C7BA]' : 'bg-slate-700'
              }`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                isHapticsEnabled ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>

          {isHapticsEnabled && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  showToast('Light tap haptic triggered', 'info');
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-[#090D12] border border-[#212B38] text-slate-300 hover:text-slate-100 text-[11px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Test Light Tap</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  showToast('Success pattern triggered', 'success');
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-[#70C7BA]/10 border border-[#70C7BA]/30 text-[#70C7BA] hover:bg-[#70C7BA]/20 text-[11px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <span>Test Success Pulse</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Emergency Duress Password / Panic Wipe */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100">Emergency Duress Password</h3>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
            isDuressEnabled ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-500'
          }`}>
            {isDuressEnabled ? 'Armed' : 'Disabled'}
          </span>
        </div>

        <div className="border border-[#212B38] rounded-2xl bg-[#090D12] overflow-hidden">
          <button
            type="button"
            onClick={() => {
              const nextState = !isDuressDropdownOpen;
              setIsDuressDropdownOpen(nextState);
              if (nextState) {
                openKeyboard({ value: newDuressInput, onChange: (val) => setNewDuressInput(val) });
              } else {
                closeKeyboard();
              }
            }}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#0c1421] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <div>
                <span className="block text-[11px] font-bold text-slate-200">
                  {isDuressEnabled ? 'Manage Duress Password' : 'Set Emergency Duress Password'}
                </span>
                <span className="text-[9px] text-slate-500">
                  {isDuressEnabled ? 'Wipe trigger active on lock screen' : 'Configure panic wipe password'}
                </span>
              </div>
            </div>
            <motion.div
              animate={{ rotate: isDuressDropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {isDuressDropdownOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="border-t border-[#212B38]/50 px-4 py-3.5 space-y-3 bg-black/10"
              >
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] text-slate-300 leading-relaxed space-y-1">
                  <p className="text-rose-400 font-bold">Panic Wipe Trigger:</p>
                  <p>
                    Entering this password on the lock screen will immediately overwrite and wipe all wallets, keys, and local databases, and return to the landing page with zero residual trace.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="relative">
                    <input
                      type={showDuressInput ? "text" : "password"}
                      placeholder="New Duress Password (min 8 chars)"
                      value={newDuressInput}
                      onFocus={() => openKeyboard({ value: newDuressInput, onChange: (val) => setNewDuressInput(val) })}
                      onClick={() => openKeyboard({ value: newDuressInput, onChange: (val) => setNewDuressInput(val) })}
                      onChange={(e) => {
                        setNewDuressInput(e.target.value);
                        openKeyboard({ value: e.target.value, onChange: (val) => setNewDuressInput(val) });
                      }}
                      inputMode="none"
                      className="w-full px-3 py-2.5 text-xs rounded-xl bg-[#090D12] focus:border-rose-400 text-slate-100 outline-none pr-10 border border-[#212B38]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDuressInput(!showDuressInput)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showDuressInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {newDuressInput.length > 0 && (() => {
                    const strResult = checkPassphraseStrength(newDuressInput);
                    return (
                      <div className="px-1 space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-bold">
                          <span className="text-slate-500 uppercase tracking-widest">Strength</span>
                          <span style={{ color: strResult.color }}>{strResult.label}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                          {[1, 2, 3, 4].map((step) => (
                            <div 
                              key={step}
                              className={`h-full flex-1 transition-all duration-300 ${
                                step <= strResult.score ? '' : 'bg-transparent'
                              }`}
                              style={{ backgroundColor: step <= strResult.score ? strResult.color : undefined }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="relative">
                    <input
                      type={showDuressInput ? "text" : "password"}
                      placeholder="Confirm Duress Password"
                      value={confirmDuressInput}
                      onFocus={() => openKeyboard({ value: confirmDuressInput, onChange: (val) => setConfirmDuressInput(val) })}
                      onClick={() => openKeyboard({ value: confirmDuressInput, onChange: (val) => setConfirmDuressInput(val) })}
                      onChange={(e) => {
                        setConfirmDuressInput(e.target.value);
                        openKeyboard({ value: e.target.value, onChange: (val) => setConfirmDuressInput(val) });
                      }}
                      inputMode="none"
                      className="w-full px-3 py-2.5 text-xs rounded-xl bg-[#090D12] focus:border-rose-400 text-slate-100 outline-none pr-10 border border-[#212B38]"
                    />
                  </div>

                  {newDuressInput && password && newDuressInput === password && (
                    <p className="text-[10px] text-rose-400 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Duress password must not match your primary password!</span>
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (newDuressInput.length < 8) {
                          showToast('Duress password must be at least 8 characters', 'error');
                          return;
                        }
                        if (password && newDuressInput === password) {
                          showToast('Duress password must differ from primary password', 'error');
                          return;
                        }
                        if (newDuressInput !== confirmDuressInput) {
                          showToast('Duress passwords do not match', 'error');
                          return;
                        }
                        closeKeyboard();
                        await setDuressPassword(newDuressInput);
                        setNewDuressInput('');
                        setConfirmDuressInput('');
                        setIsDuressDropdownOpen(false);
                      }}
                      disabled={
                        newDuressInput.length < 8 ||
                        (Boolean(password) && newDuressInput === password) ||
                        newDuressInput !== confirmDuressInput
                      }
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        newDuressInput.length >= 8 &&
                        (!password || newDuressInput !== password) &&
                        newDuressInput === confirmDuressInput
                          ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>{isDuressEnabled ? 'Update Duress Password' : 'Save Duress Password'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Tools & Actions */}
      <div className="py-3.5 px-4 border-b border-[#212B38]/40 space-y-2">
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
          onClick={() => setShowSecurityVerifier(!showSecurityVerifier)}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#090D12] hover:border-[#70C7BA] text-xs text-slate-200 transition-all group"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400 group-hover:animate-pulse" />
            <div className="text-left">
              <span className="font-semibold block text-emerald-300">Zero-Trust & Wipe Verifier</span>
            </div>
          </div>
          {showSecurityVerifier ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showSecurityVerifier && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-1.5 pb-2 overflow-hidden"
          >
            <SecurityVerifier />
          </motion.div>
        )}

        <button
          onClick={openLogoutConfirm}
          className="w-full flex items-center gap-3 p-3 text-xs text-rose-400 hover:text-rose-300 transition-all font-semibold"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>

      {/* 5. GitHub & Terms */}
      <div className="py-3.5 px-4 space-y-2 mb-2">
        <a
          href="https://github.com/Curious-being99/Kaspriv_wallet"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#090D12] hover:border-[#70C7BA] border border-[#212B38]/50 text-xs text-slate-200 transition-all group"
        >
          <div className="flex items-center gap-3">
            <Github className="w-4 h-4 text-slate-400 group-hover:text-[#70C7BA] transition-colors" />
            <div className="flex flex-col text-left">
              <span className="font-semibold text-slate-200 group-hover:text-[#70C7BA] transition-colors">Open Source</span>
              <span className="text-[10px] text-slate-400">View repository on GitHub</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-200" />
        </a>

        <button
          onClick={() => setShowTerms(!showTerms)}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#090D12] hover:border-[#70C7BA] text-xs text-slate-200 transition-all group"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-slate-400 group-hover:text-[#70C7BA] transition-colors" />
            <span className="font-semibold text-slate-300">Terms and Conditions</span>
          </div>
          {showTerms ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
        {showTerms && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="p-4 rounded-2xl bg-[#090D12] border border-[#212B38]/50 text-[10px] text-slate-400 space-y-3 leading-relaxed"
          >
            <h4 className="text-xs font-bold text-slate-200 mb-2">Kaspriv Wallet Terms</h4>
            <p>
              By using this non-custodial wallet, you acknowledge and agree to the following terms:
            </p>
            <p className="mt-2 text-rose-400/80">
              Never share your seed phrase, password, or passphrase with anyone.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
