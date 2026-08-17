import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { generate24WordMnemonic, generateDeterministicAddress, getAddressFromPublicKey, cleanMnemonic, sanitizeWalletName } from '../utils/kaspa';
import { checkPassphraseStrength } from '../utils/strength';
import { X, Plus, Key, Eye, EyeOff, Copy, Check, ShieldCheck, Lock, ChevronLeft, ArrowRight, ChevronDown, Flame, ShieldAlert, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { wipeStringArray } from '../utils/crypto';

export const WalletSetupModal: React.FC = () => {
  const {
    isWalletSetupOpen,
    setIsWalletSetupOpen,
    createNewWallet,
    importSeedWallet,
    importKpubWallet,
    showToast,
    isPasswordEnabled,
    setIsLocked,
    setPassword,
    setDuressPassword,
  } = useWallet();

  const [mode, setMode] = useState<'choose' | 'create' | 'import-seed' | 'import-kpub' | 'import-address' | 'setup-password' | 'setup-duress'>('choose');
  const [step, setStep] = useState<1 | 2>(1);

  // New wallet state
  const [walletName, setWalletName] = useState('');
  const [generatedWords, setGeneratedWords] = useState<string[]>([]);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [savedBackup, setSavedBackup] = useState(false);

  // Import seed state
  const [importWordsText, setImportWordsText] = useState('');
  const [showImportSeed, setShowImportSeed] = useState(false);
  const [isMnemonicDropdownOpen, setIsMnemonicDropdownOpen] = useState(false);

  // Passphrase state
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Import Kpub state
  const [kpubInput, setKpubInput] = useState('');

  // Track Real Address state
  const [addressInput, setAddressInput] = useState('');

  // Address Type state (P2PKH vs P2SH)
  const [addressType, setAddressType] = useState<'P2PKH' | 'P2SH'>('P2PKH');

  // Password setup state
  const [setupPassword, setSetupPassword] = useState('');
  const [confirmSetupPassword, setConfirmSetupPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [setupDuressPassword, setSetupDuressPassword] = useState('');
  const [confirmSetupDuressPassword, setConfirmSetupDuressPassword] = useState('');
  const [showSetupDuressPassword, setShowSetupDuressPassword] = useState(false);
  const [activeDuressField, setActiveDuressField] = useState<'primary' | 'confirm'>('primary');
  const [pendingFlow, setPendingFlow] = useState<'create' | 'import-seed' | 'import-address' | 'import-kpub' | 'none'>('none');

  // Preview Address
  const [previewAddress, setPreviewAddress] = useState('');

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  const handleStartCreate = () => {
    const words = generate24WordMnemonic();
    setGeneratedWords(words);
    setStep(1);
    setMode('create');
  };

  const handleCopySeed = () => {
    if (generatedWords.length === 0) return;
    navigator.clipboard.writeText(generatedWords.join(' '));
    setCopiedSeed(true);
    showToast('Mnemonic copied to clipboard', 'success');
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleFinishCreate = async () => {
    if (!savedBackup) {
      showToast('Please confirm you have saved your 24-word seed phrase!', 'error');
      return;
    }
    
    setPendingFlow('create');
    setMode('setup-password');
  };

  const handleFinishImportSeed = async () => {
    const cleaned = cleanMnemonic(importWordsText);
    const words = cleaned ? cleaned.split(' ') : [];

    if (words.length !== 12 && words.length !== 24) {
      showToast('Kaspa seed phrase must be 12 or 24 words', 'error');
      return;
    }

    setPendingFlow('import-seed');
    setMode('setup-password');
  };

  const handleFinishImportKpub = async () => {
    if (!kpubInput.trim()) {
      showToast('Please enter a valid Kaspa Extended Public Key (kpub)', 'error');
      return;
    }

    setPendingFlow('import-kpub');
    setMode('setup-password');
  };

  const handleFinishImportAddress = async () => {
    const addr = addressInput.trim();
    if (!addr.includes(':')) {
      showToast('Please enter a valid Kaspa address with network prefix (e.g. kaspa:)', 'error');
      return;
    }

    setPendingFlow('import-address');
    setMode('setup-password');
  };

  const resetState = () => {
    setMode('choose');
    setStep(1);
    setWalletName('');
    setGeneratedWords([]);
    setShowSeed(false);
    setCopiedSeed(false);
    setSavedBackup(false);
    setImportWordsText('');
    setPassphraseInput('');
    setShowPassphrase(false);
    setKpubInput('');
    setAddressInput('');
    setAddressType('P2PKH');
    setPreviewAddress('');
    setSetupPassword('');
    setConfirmSetupPassword('');
    setShowSetupPassword(false);
    setSetupDuressPassword('');
    setConfirmSetupDuressPassword('');
    setShowSetupDuressPassword(false);
    setPendingFlow('none');
  };

  const updatePreview = useCallback(async (type: 'P2PKH' | 'P2SH') => {
    try {
      if (mode === 'create' && generatedWords.length > 0) {
        const addr = await generateDeterministicAddress(generatedWords.join(' '), passphraseInput || undefined, 'kaspa', type);
        setPreviewAddress(addr);
      } else if (mode === 'import-seed') {
        const cleaned = cleanMnemonic(importWordsText);
        const words = cleaned ? cleaned.split(' ') : [];
        if (words.length === 12 || words.length === 24) {
          const addr = await generateDeterministicAddress(cleaned, passphraseInput || undefined, 'kaspa', type);
          setPreviewAddress(addr);
        } else {
          setPreviewAddress('');
        }
      } else if (mode === 'import-kpub' && kpubInput.trim()) {
        const addr = getAddressFromPublicKey(kpubInput.trim(), type, 'kaspa');
        setPreviewAddress(addr);
      } else if (mode === 'import-address' && addressInput.trim()) {
        setPreviewAddress(addressInput.trim());
      } else {
        setPreviewAddress('');
      }
    } catch (e) {
      setPreviewAddress('');
    }
  }, [mode, generatedWords, importWordsText, passphraseInput, kpubInput, addressInput]);

  useEffect(() => {
    updatePreview(addressType);
  }, [mode, generatedWords, importWordsText, passphraseInput, kpubInput, addressInput, addressType, updatePreview]);

  if (!isWalletSetupOpen) return null;

  const AddressTypeSelector = () => (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        Address Standard
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAddressType('P2PKH')}
          className={`p-2.5 rounded-xl border text-left transition-all ${
            addressType === 'P2PKH'
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]'
              : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-extrabold text-[11px] mb-0.5 flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${addressType === 'P2PKH' ? 'bg-[#70C7BA]' : 'bg-slate-700'}`} />
            <span>Standard (q)</span>
          </div>
          <div className="text-[9px] text-slate-400">P2PKH Schnorr</div>
        </button>

        <button
          type="button"
          onClick={() => setAddressType('P2SH')}
          className={`p-2.5 rounded-xl border text-left transition-all ${
            addressType === 'P2SH'
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]'
              : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-extrabold text-[11px] mb-0.5 flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${addressType === 'P2SH' ? 'bg-[#70C7BA]' : 'bg-slate-700'}`} />
            <span>Secure (p)</span>
          </div>
          <div className="text-[9px] text-slate-400">P2SH Script Hash</div>
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full flex-1 flex flex-col space-y-4 p-5 pt-safe pb-safe overflow-y-auto no-scrollbar relative transition-all duration-200"
        style={{ paddingBottom: isKeyboardOpen ? '220px' : '' }}
      >
        <AnimatePresence mode="wait">
          {/* MODE: CHOOSE */}
          {mode === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#70C7BA]/15 text-[#70C7BA] flex items-center justify-center">
                    <img src="/assets/kas_icon.svg" alt="Kaspriv Logo" className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-100">Add Kaspa Wallet</span>
                </div>
                <button
                  onClick={() => {
                    setIsWalletSetupOpen(false);
                    resetState();
                  }}
                  className="p-1 rounded-lg hover:bg-[#090D12] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleStartCreate}
                  className="p-3.5 rounded-2xl bg-[#090D12]  hover:border-[#70C7BA] transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA] flex items-center justify-center font-bold">
                      <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-100">Create Wallet</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Generate 24-word seed phrase</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#70C7BA] transition-all" />
                </button>

                <button
                  onClick={() => setMode('import-seed')}
                  className="p-3.5 rounded-2xl bg-[#090D12]  hover:border-amber-400 transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                      <Key className="w-4.5 h-4.5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-100">Import Seed</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">24-word seed phrase</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-all" />
                </button>

                <button
                  onClick={() => setMode('import-address')}
                  className="p-3.5 rounded-2xl bg-[#090D12]  hover:border-emerald-400 transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      <Eye className="w-4.5 h-4.5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-100">Track Address</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Monitor public addresses</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-all" />
                </button>
              </div>
            </motion.div>
          )}

          {/* MODE: CREATE */}
          {mode === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => {
                    if (step === 2) setStep(1);
                    else setMode('choose');
                  }}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>Create Wallet</span>
                </div>
                <button
                  onClick={() => {
                    setIsWalletSetupOpen(false);
                    resetState();
                  }}
                  className="p-1 rounded-lg hover:bg-[#090D12] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {step === 1 ? (
                <div className="space-y-4">
                  <AddressTypeSelector />

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Wallet Name
                    </label>
                    <input
                      type="text"
                      placeholder="My Kaspa Wallet"
                      value={walletName}
                      onFocus={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                      onClick={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                      inputMode="none" onChange={() => {}}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      BIP39 Passphrase
                    </label>
                    <div className="relative">
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        placeholder="Enter BIP39 passphrase to secure your keys"
                        value={passphraseInput}
                        onFocus={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                        onClick={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                        inputMode="none" onChange={() => {}}
                        className="w-full px-3 pr-10 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {passphraseInput && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                          {[1, 2, 3, 4].map((step) => {
                            const result = checkPassphraseStrength(passphraseInput);
                            return (
                              <div 
                                key={step}
                                className={`h-full flex-1 transition-all duration-300 ${
                                  step <= result.score ? '' : 'bg-transparent'
                                }`}
                                style={{ backgroundColor: step <= result.score ? result.color : undefined }}
                              />
                            );
                          })}
                        </div>
                        <span 
                          className="text-[9px] font-black uppercase tracking-wider"
                          style={{ color: checkPassphraseStrength(passphraseInput).color }}
                        >
                          {checkPassphraseStrength(passphraseInput).label}
                        </span>
                      </div>
                    )}

                    <p className="text-[9px] text-slate-400 mt-1">
                      Protects keys. Re-entering this same passphrase is required to restore this exact address.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#090D12]  text-[10px] text-slate-400 space-y-1">
                    <div className="font-extrabold text-slate-200 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-[#70C7BA]" />
                      <span>Security Standard</span>
                    </div>
                    <p className="leading-relaxed">
                      Generated locally. Your keys are cryptographically signed using secure, client-side Schnorr signatures.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (generatedWords.length === 0) {
                        const words = generate24WordMnemonic();
                        setGeneratedWords(words);
                      }
                      setStep(2);
                    }}
                    className="w-full py-3 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-xs transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-1.5"
                  >
                    <span>Generate Mnemonic</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        24-Word Seed Phrase
                      </label>
                      <button
                        onClick={() => setShowSeed(!showSeed)}
                        className="text-[10px] text-[#70C7BA] font-extrabold flex items-center gap-1"
                      >
                        {showSeed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showSeed ? 'Hide' : 'Reveal'}</span>
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-[#090D12]  relative min-h-[160px] flex items-center justify-center">
                      <div className={`grid grid-cols-3 gap-1.5 w-full max-h-[200px] overflow-y-auto no-scrollbar pr-1 ${!showSeed ? 'blur-md select-none pointer-events-none' : ''}`}>
                        {generatedWords.map((word, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-[#090D12] px-2 py-1 rounded-lg text-[9px] font-mono">
                            <span className="text-slate-500 w-4">{idx + 1}.</span>
                            <span className="text-slate-200 font-bold truncate">{word}</span>
                          </div>
                        ))}
                      </div>

                      {!showSeed && (
                        <div
                          onClick={() => setShowSeed(true)}
                          className="absolute inset-0 flex items-center justify-center bg-[#090D12]/80 rounded-xl cursor-pointer text-[10px] font-extrabold text-[#70C7BA]"
                        >
                          Click to Reveal Seed Words
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleCopySeed}
                    className="w-full py-2 rounded-xl bg-[#090D12]  hover:border-[#70C7BA] text-[10px] font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-all"
                  >
                    {copiedSeed ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#70C7BA]" />}
                    <span>{copiedSeed ? 'Mnemonic Copied' : 'Copy Mnemonic'}</span>
                  </button>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#090D12]  cursor-pointer text-[10px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={savedBackup}
                      onChange={(e) => setSavedBackup(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#212B38] accent-[#70C7BA]"
                    />
                    <span className="font-medium">I have written down these 24 seed words.</span>
                  </label>

                  <button
                    onClick={handleFinishCreate}
                    disabled={!savedBackup}
                    className={`w-full py-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
                      savedBackup
                        ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] shadow-lg shadow-[#70C7BA]/20'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <span>Create & Add Wallet</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* MODE: IMPORT SEED */}
          {mode === 'import-seed' && (
            <motion.div
              key="import-seed"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setMode('choose')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#70C7BA]" />
                  <span>Import Seed</span>
                </div>
                <button
                  onClick={() => {
                    setIsWalletSetupOpen(false);
                    resetState();
                  }}
                  className="p-1 rounded-lg hover:bg-[#090D12] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <AddressTypeSelector />

              {previewAddress && (
                <div className="p-3 rounded-xl bg-[#70C7BA]/10 border border-[#70C7BA]/30 shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] font-bold text-[#70C7BA] uppercase">Live Address Preview</div>
                    <div className="px-1.5 py-0.5 rounded-md bg-[#70C7BA]/20 text-[#70C7BA] text-[8px] font-mono">
                      {addressType === 'P2PKH' ? 'Standard (q)' : 'Secure (p)'}
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-200 break-all leading-relaxed bg-black/20 p-2 rounded-lg border border-[#70C7BA]/10">
                    {previewAddress}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Wallet Label
                </label>
                <input
                  type="text"
                  placeholder="Imported Kaspa Wallet"
                  value={walletName}
                  onFocus={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  onClick={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                />
              </div>

              {/* Collapsible Drop Box for Mnemonic Seed Phrase */}
              <div className="border border-[#212B38] rounded-2xl bg-[#090D12] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsMnemonicDropdownOpen(!isMnemonicDropdownOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#0c1421] transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#70C7BA]" />
                    <div>
                      <span className="block text-[11px] font-bold text-slate-200">
                        Mnemonic Seed Phrase
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {importWordsText.trim() ? `${importWordsText.trim().split(/\s+/).length} words loaded` : 'Click to expand and enter recovery words'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {importWordsText.trim() ? (
                      <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-[#70C7BA]/10 text-[#70C7BA]">
                        Ready
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-amber-500/10 text-amber-400">
                        Required
                      </span>
                    )}
                    <motion.div
                      animate={{ rotate: isMnemonicDropdownOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </motion.div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isMnemonicDropdownOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="border-t border-[#212B38]/50 px-4 py-3.5 space-y-3 bg-black/10"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Paste your 24-word Kaspa seed phrase below:
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowImportSeed(!showImportSeed)}
                          className="text-[10px] text-[#70C7BA] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          {showImportSeed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showImportSeed ? 'Hide' : 'Reveal'}</span>
                        </button>
                      </div>

                      <div className="relative">
                        <textarea
                          rows={3}
                          value={importWordsText}
                          onFocus={() => openKeyboard({ value: importWordsText, onChange: setImportWordsText })}
                          onClick={() => openKeyboard({ value: importWordsText, onChange: setImportWordsText })}
                          inputMode="none" onChange={() => {}}
                          placeholder="abandon ability able about above absent..."
                          className={`w-full p-3 rounded-xl bg-[#090D12] focus:border-[#70C7BA] text-xs font-mono text-slate-100 outline-none transition-all resize-none no-scrollbar ${
                            !showImportSeed && importWordsText ? 'filter blur-[6px] select-none text-transparent' : ''
                          }`}
                        />
                        {!showImportSeed && importWordsText && (
                          <div
                            onClick={() => setShowImportSeed(true)}
                            className="absolute inset-0 flex items-center justify-center cursor-pointer bg-[#090D12]/50 rounded-xl"
                          >
                            <span className="text-[10px] bg-[#090D12] px-2.5 py-1 rounded-lg text-slate-300 shadow flex items-center gap-1.5">
                              <Eye className="w-3 h-3 text-[#70C7BA]" /> Click to reveal seed phrase
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  BIP39 Passphrase
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    placeholder="Enter passphrase used to secure this seed"
                    value={passphraseInput}
                    onFocus={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                    onClick={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                    inputMode="none" onChange={() => {}}
                    className="w-full px-3 pr-10 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                  >
                    {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passphraseInput && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                      {[1, 2, 3, 4].map((step) => {
                        const result = checkPassphraseStrength(passphraseInput);
                        return (
                          <div 
                            key={step}
                            className={`h-full flex-1 transition-all duration-300 ${
                              step <= result.score ? '' : 'bg-transparent'
                            }`}
                            style={{ backgroundColor: step <= result.score ? result.color : undefined }}
                          />
                        );
                      })}
                    </div>
                    <span 
                      className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: checkPassphraseStrength(passphraseInput).color }}
                    >
                      {checkPassphraseStrength(passphraseInput).label}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleFinishImportSeed}
                className="w-full py-3 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-xs transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-1.5"
              >
                <span>Restore Seed Wallet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* MODE: IMPORT ADDRESS */}
          {mode === 'import-address' && (
            <motion.div
              key="import-address"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setMode('choose')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Track Address</span>
                </div>
                <button
                  onClick={() => {
                    setIsWalletSetupOpen(false);
                    resetState();
                  }}
                  className="p-1 rounded-lg hover:bg-[#090D12] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <AddressTypeSelector />

              {previewAddress && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase">Tracked Address</div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-200 break-all leading-relaxed bg-black/20 p-2 rounded-lg border border-emerald-500/10">
                    {previewAddress}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Tracker Label
                </label>
                <input
                  type="text"
                  placeholder="Kaspa Whale Tracker"
                  value={walletName}
                  onFocus={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  onClick={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Kaspa Address (kaspa:...)
                </label>
                <input
                  type="text"
                  placeholder="kaspa:qq..."
                  value={addressInput}
                  onFocus={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                  onClick={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] font-mono text-xs text-slate-100 outline-none"
                />
              </div>

              <button
                onClick={handleFinishImportAddress}
                className="w-full py-3 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-xs transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-1.5"
              >
                <span>Track Live Address</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {mode === 'setup-password' && (
            <motion.div
              key="setup-password"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setMode(pendingFlow === 'create' ? 'create' : 'import-seed')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100">Set Security Password</div>
                <div className="w-8 h-8" />
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-[#70C7BA]/5 border border-[#70C7BA]/20 text-[10px] text-slate-300 flex items-start gap-2.5 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-[#70C7BA] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[#70C7BA]">Security Encryption Setup</p>
                    <p className="mt-0.5">
                      Create a strong password (min strength: Good). This password will be used to unlock your wallet and encrypt your seed phrase securely on this device.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupPassword ? "text" : "password"}
                        placeholder="Strong password required"
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        onFocus={() => openKeyboard({ value: setupPassword, onChange: setSetupPassword })}
                        onClick={() => openKeyboard({ value: setupPassword, onChange: setSetupPassword })}
                        inputMode="none"
                        className="w-full px-4 py-3 rounded-xl bg-[#090D12] border-2 border-[#1C2F42] focus:border-[#70C7BA] text-slate-100 outline-none text-sm transition-all pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPassword(!showSetupPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showSetupPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>

                    {setupPassword.length > 0 && (() => {
                      const strResult = checkPassphraseStrength(setupPassword);
                      return (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Strength</span>
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: strResult.color }}>
                              {strResult.label}
                            </span>
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
                          {strResult.feedback?.warning && (
                            <p className="text-[10px] text-amber-400/90 px-1 mt-1 font-medium">
                              {strResult.feedback.warning}
                            </p>
                          )}
                          {strResult.feedback?.suggestions && strResult.feedback.suggestions.length > 0 && (
                            <ul className="text-[9px] text-slate-400 px-1 list-disc list-inside space-y-0.5">
                              {strResult.feedback.suggestions.map((sug, idx) => (
                                <li key={idx}>{sug}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupPassword ? "text" : "password"}
                        placeholder="Repeat password"
                        value={confirmSetupPassword}
                        onChange={(e) => setConfirmSetupPassword(e.target.value)}
                        onFocus={() => openKeyboard({ value: confirmSetupPassword, onChange: setConfirmSetupPassword })}
                        onClick={() => openKeyboard({ value: confirmSetupPassword, onChange: setConfirmSetupPassword })}
                        inputMode="none"
                        className={`w-full px-4 py-3 rounded-xl bg-[#090D12] border-2 transition-all pr-12 ${
                          confirmSetupPassword && setupPassword !== confirmSetupPassword 
                            ? 'border-rose-500/50' 
                            : confirmSetupPassword && setupPassword === confirmSetupPassword 
                              ? 'border-emerald-500/50' 
                              : 'border-[#1C2F42] focus:border-[#70C7BA]'
                        } text-slate-100 outline-none text-sm`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPassword(!showSetupPassword)}
                        className="absolute right-4 top-3 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (checkPassphraseStrength(setupPassword).score < 3) {
                      showToast('Password is too weak. Please use a stronger password!', 'error');
                      return;
                    }
                    if (setupPassword !== confirmSetupPassword) {
                      showToast('Passwords do not match!', 'error');
                      return;
                    }
                    setMode('setup-duress');
                  }}
                  disabled={checkPassphraseStrength(setupPassword).score < 3 || confirmSetupPassword.length < 8 || setupPassword !== confirmSetupPassword}
                  className={`w-full py-4 rounded-2xl font-extrabold text-sm transition-all flex items-center justify-center gap-2 ${
                    checkPassphraseStrength(setupPassword).score >= 3 && confirmSetupPassword.length >= 8 && setupPassword === confirmSetupPassword
                      ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] shadow-[0_0_20px_rgba(112,199,186,0.3)]'
                      : 'bg-[#1C2F42] text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <span>Continue to Emergency Duress Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {mode === 'setup-duress' && (
            <motion.div
              key="setup-duress"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMode('setup-password')}
                  className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#1C2F42]/50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-400" />
                    <span>Emergency Duress Password</span>
                  </h3>
                  <p className="text-xs text-slate-400">Optional panic wipe trigger</p>
                </div>
              </div>

              <div className="px-3.5 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="text-xs text-rose-300/90 leading-tight">
                  <span className="font-bold">Panic Wipe Defense:</span> Entering this password on the lock screen immediately purges all keys and data.
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">
                    Duress Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showSetupDuressPassword ? "text" : "password"}
                      placeholder="Enter emergency duress password"
                      value={setupDuressPassword}
                      onChange={(e) => setSetupDuressPassword(e.target.value)}
                      onFocus={() => {
                        setActiveDuressField('primary');
                        openKeyboard({
                          value: setupDuressPassword,
                          onChange: (val) => setSetupDuressPassword(val),
                        });
                      }}
                      onClick={() => {
                        setActiveDuressField('primary');
                        openKeyboard({
                          value: setupDuressPassword,
                          onChange: (val) => setSetupDuressPassword(val),
                        });
                      }}
                      inputMode="none"
                      className={`w-full px-4 py-3 rounded-xl bg-[#090D12] border-2 transition-all pr-12 ${
                        setupDuressPassword && setupPassword && setupDuressPassword === setupPassword
                          ? 'border-rose-500'
                          : 'border-[#1C2F42] focus:border-rose-500'
                      } text-slate-100 outline-none text-sm`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupDuressPassword(!showSetupDuressPassword)}
                      className="absolute right-4 top-3 text-slate-400 hover:text-slate-200"
                    >
                      {showSetupDuressPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {setupDuressPassword && setupPassword && setupDuressPassword === setupPassword && (
                    <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Duress password must be completely different from your primary password!
                    </p>
                  )}
                </div>

                {setupDuressPassword && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">
                      Confirm Duress Password
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupDuressPassword ? "text" : "password"}
                        placeholder="Repeat emergency duress password"
                        value={confirmSetupDuressPassword}
                        onChange={(e) => setConfirmSetupDuressPassword(e.target.value)}
                        onFocus={() => {
                          setActiveDuressField('confirm');
                          openKeyboard({
                            value: confirmSetupDuressPassword,
                            onChange: (val) => setConfirmSetupDuressPassword(val),
                          });
                        }}
                        onClick={() => {
                          setActiveDuressField('confirm');
                          openKeyboard({
                            value: confirmSetupDuressPassword,
                            onChange: (val) => setConfirmSetupDuressPassword(val),
                          });
                        }}
                        inputMode="none"
                        className={`w-full px-4 py-3 rounded-xl bg-[#090D12] border-2 transition-all pr-12 ${
                          confirmSetupDuressPassword && setupDuressPassword !== confirmSetupDuressPassword
                            ? 'border-rose-500/50'
                            : confirmSetupDuressPassword && setupDuressPassword === confirmSetupDuressPassword
                              ? 'border-emerald-500/50'
                              : 'border-[#1C2F42] focus:border-rose-500'
                        } text-slate-100 outline-none text-sm`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupDuressPassword(!showSetupDuressPassword)}
                        className="absolute right-4 top-3 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupDuressPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (setupDuressPassword) {
                        if (setupDuressPassword === setupPassword) {
                          showToast('Duress password cannot be identical to primary password', 'error');
                          return;
                        }
                        if (setupDuressPassword !== confirmSetupDuressPassword) {
                          showToast('Duress passwords do not match!', 'error');
                          return;
                        }
                      }

                      const flow = pendingFlow;
                      const pass = setupPassword;
                      const duressPass = setupDuressPassword.trim() || undefined;
                      const name = sanitizeWalletName(walletName.trim(), flow === 'create' ? 'New Kaspa Wallet' : flow === 'import-seed' ? 'Imported Wallet' : 'Watch-Only');
                      const words = flow === 'create' ? [...generatedWords] : cleanMnemonic(importWordsText).split(' ');
                      const passInput = passphraseInput.trim() || undefined;
                      const addrType = addressType;
                      const kpub = kpubInput.trim();
                      const addr = addressInput.trim();

                      try {
                        setIsWalletSetupOpen(false);
                        resetState();

                        if (flow === 'create') {
                          await createNewWallet(name, words, passInput, addrType, pass, duressPass);
                        } else if (flow === 'import-seed') {
                          await importSeedWallet(name, words, passInput, addrType, pass, duressPass);
                        } else if (flow === 'import-address' || (flow as string) === 'import-kpub') {
                          if ((flow as string) === 'import-kpub') {
                            await importKpubWallet(name || 'Watch-Only Kpub', kpub, addrType, pass, duressPass);
                          } else {
                            await importKpubWallet(name || 'Live Address Tracker', addr, addrType, pass, duressPass);
                          }
                          await setPassword(pass);
                          if (duressPass) {
                            await setDuressPassword(duressPass);
                          }
                        }
                        setIsLocked(true);
                      } finally {
                        wipeStringArray(words);
                        setGeneratedWords([]);
                        setImportWordsText('');
                        setPassphraseInput('');
                        setSetupPassword('');
                        setConfirmSetupPassword('');
                        setSetupDuressPassword('');
                        setConfirmSetupDuressPassword('');
                      }
                    }}
                    disabled={
                      Boolean(setupDuressPassword && (
                        setupDuressPassword === setupPassword ||
                        setupDuressPassword.length < 8 ||
                        setupDuressPassword !== confirmSetupDuressPassword
                      ))
                    }
                    className={`w-full py-4 rounded-2xl font-extrabold text-sm transition-all flex items-center justify-center gap-2 ${
                      !setupDuressPassword || (setupDuressPassword !== setupPassword && setupDuressPassword.length >= 8 && setupDuressPassword === confirmSetupDuressPassword)
                        ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] shadow-[0_0_20px_rgba(112,199,186,0.3)]'
                        : 'bg-[#1C2F42] text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>{setupDuressPassword ? 'Encrypt & Finish with Duress Defense' : 'Finish Wallet Setup (Skip Duress)'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
