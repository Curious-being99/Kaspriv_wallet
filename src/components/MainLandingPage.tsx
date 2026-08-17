import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { generate24WordMnemonic, validateKaspaAddress, generateDeterministicAddress, getAddressFromPublicKey, cleanMnemonic, sanitizeWalletName } from '../utils/kaspa';
import { checkPassphraseStrength } from '../utils/strength';
import {
  Plus,
  Key,
  Eye,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
  EyeOff,
  Activity,
  ChevronLeft,
  Sparkles,
  Lock,
  Flame,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { wipeStringArray } from '../utils/crypto';

const TypewriterHeading: React.FC = () => {
  const fullText = "Welcome to Kaspriv";
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(120);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handleType = () => {
      if (!isDeleting) {
        const nextText = fullText.substring(0, displayedText.length + 1);
        setDisplayedText(nextText);

        if (nextText === fullText) {
          setTypingSpeed(2500);
          setIsDeleting(true);
        } else {
          setTypingSpeed(100 + Math.random() * 60);
        }
      } else {
        const nextText = fullText.substring(0, displayedText.length - 1);
        setDisplayedText(nextText);

        if (nextText === "") {
          setIsDeleting(false);
          setTypingSpeed(600);
        } else {
          setTypingSpeed(50 + Math.random() * 30);
        }
      }
    };

    timer = setTimeout(handleType, typingSpeed);
    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, typingSpeed]);

  const welcomePrefix = "Welcome to ";
  const hasPrefix = displayedText.startsWith(welcomePrefix);

  return (
    <h2 className="text-2xl font-serif font-bold text-slate-100 tracking-tight leading-tight min-h-[2rem] flex items-center">
      <span>
        {hasPrefix ? (
          <>
            Welcome to <span className="text-[#70C7BA]">{displayedText.substring(welcomePrefix.length)}</span>
          </>
        ) : (
          displayedText
        )}
      </span>
    </h2>
  );
};



export const MainLandingPage: React.FC = () => {
  const {
    isLoggedOut,
    setIsLoggedOut,
    wallets,
    createNewWallet,
    importKpubWallet,
    importSeedWallet,
    marketData,
    currency,
    fiatRate,
    showToast,
    isPasswordEnabled,
    setIsLocked,
    setPassword,
    indexingState,
  } = useWallet();

  const [activeTab, setActiveTab] = useState<'home' | 'create' | 'import-seed' | 'import-address' | 'setup-password' | 'setup-duress'>('home');

  // Create Wallet State - pre-filled real values instead of placeholders
  const [walletName, setWalletName] = useState('Primary Wallet');
  const [createdWords, setCreatedWords] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [savedBackup, setSavedBackup] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  // Import Seed State - starts empty
  const [importWordsText, setImportWordsText] = useState('');
  const [showImportSeed, setShowImportSeed] = useState(false);

  // Passphrase State
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Import Address / Kpub State - pre-filled real address to track
  const [addressInput, setAddressInput] = useState('');
  const [addressType, setAddressType] = useState<'P2PKH' | 'P2SH'>('P2PKH');
  const [previewAddress, setPreviewAddress] = useState('');

  // Password Setup State
  const [setupPassword, setSetupPassword] = useState('');
  const [confirmSetupPassword, setConfirmSetupPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  // Duress Password Setup State
  const [setupDuressPassword, setSetupDuressPassword] = useState('');
  const [confirmSetupDuressPassword, setConfirmSetupDuressPassword] = useState('');
  const [showSetupDuressPassword, setShowSetupDuressPassword] = useState(false);
  const [activeDuressField, setActiveDuressField] = useState<'primary' | 'confirm'>('primary');

  const [pendingFlow, setPendingFlow] = useState<'create' | 'import-seed' | 'import-address' | 'none'>('none');

  // Handlers
  const resetState = () => {
    setActiveTab('home');
    setWalletName('Primary Wallet');
    setCreatedWords([]);
    setStep(1);
    setSavedBackup(false);
    setShowSeed(false);
    setImportWordsText('');
    setPassphraseInput('');
    setShowPassphrase(false);
    setAddressType('P2PKH');
    setPreviewAddress('');
    setAddressInput('');
    setSetupPassword('');
    setConfirmSetupPassword('');
    setSetupDuressPassword('');
    setConfirmSetupDuressPassword('');
    setPendingFlow('none');
  };

  const handleStartCreate = () => {
    const words = generate24WordMnemonic();
    setCreatedWords(words);
    setStep(2);
  };

  const handleCopySeed = () => {
    navigator.clipboard.writeText(createdWords.join(' '));
    setCopiedSeed(true);
    showToast('24-Word Mnemonic copied to clipboard!', 'success');
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleFinishCreate = async () => {
    if (!savedBackup) {
      showToast('Please confirm you have backed up your 24-word seed phrase', 'error');
      return;
    }
    
    setPendingFlow('create');
    setActiveTab('setup-password');
  };

  const handleFinishImportSeed = async () => {
    const cleaned = cleanMnemonic(importWordsText);
    const words = cleaned ? cleaned.split(' ') : [];
    if (words.length !== 12 && words.length !== 24) {
      showToast('Please enter valid 12 or 24 seed words separated by spaces', 'error');
      return;
    }

    setPendingFlow('import-seed');
    setActiveTab('setup-password');
  };

  const handleFinishImportAddress = () => {
    const addr = addressInput.trim();
    const res = validateKaspaAddress(addr, addr.startsWith('kaspatest:') ? 'testnet-10' : addr.startsWith('kaspadev:') ? 'devnet' : 'mainnet');
    
    if (!res.isValid) {
      showToast(res.error || 'Invalid Kaspa address format', 'error');
      return;
    }

    setPendingFlow('import-address');
    setActiveTab('setup-password');
  };

  const updatePreview = React.useCallback(async (type: 'P2PKH' | 'P2SH') => {
    try {
      if (activeTab === 'create' && createdWords.length > 0) {
        const addr = await generateDeterministicAddress(createdWords.join(' '), passphraseInput || undefined, 'kaspa', type);
        setPreviewAddress(addr);
      } else if (activeTab === 'import-seed') {
        const cleaned = cleanMnemonic(importWordsText);
        const words = cleaned ? cleaned.split(' ') : [];
        if (words.length === 12 || words.length === 24) {
          const addr = await generateDeterministicAddress(cleaned, passphraseInput || undefined, 'kaspa', type);
          setPreviewAddress(addr);
        } else {
          setPreviewAddress('');
        }
      } else if (activeTab === 'import-address' && addressInput.trim()) {
        // Direct address tracker preview
        setPreviewAddress(addressInput.trim());
      } else {
        setPreviewAddress('');
      }
    } catch (e) {
      setPreviewAddress('');
    }
  }, [activeTab, createdWords, importWordsText, passphraseInput, addressInput]);

  React.useEffect(() => {
    if (isLoggedOut) {
      resetState();
    }
  }, [isLoggedOut]);

  React.useEffect(() => {
    updatePreview(addressType);
  }, [activeTab, createdWords, importWordsText, passphraseInput, addressInput, addressType, updatePreview]);

  // Auto-activate Virtual Keyboard when entering setup tabs
  React.useEffect(() => {
    if (activeTab === 'setup-duress') {
      setActiveDuressField('primary');
      openKeyboard({
        value: setupDuressPassword,
        onChange: (val) => setSetupDuressPassword(val),
      });
    } else if (activeTab === 'setup-password') {
      openKeyboard({
        value: setupPassword,
        onChange: (val) => setSetupPassword(val),
      });
    } else if (activeTab === 'home') {
      closeKeyboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!isLoggedOut && (wallets.length > 0 || indexingState?.isIndexing)) return null;

  const AddressTypeSelector = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Address Standard
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => setAddressType('P2PKH')}
          className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
            addressType === 'P2PKH' 
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]' 
              : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold text-xs mb-1 flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${addressType === 'P2PKH' ? 'bg-[#70C7BA]' : 'bg-slate-700'}`} />
            Standard (q)
          </div>
        </button>
        <button
          onClick={() => setAddressType('P2SH')}
          className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${
            addressType === 'P2SH' 
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]' 
              : 'bg-[#090D12] border-[#212B38] text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold text-xs mb-1 flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${addressType === 'P2SH' ? 'bg-[#70C7BA]' : 'bg-slate-700'}`} />
            P2SH Privacy
          </div>
        </button>
      </div>
    </div>
  );

  const handleTabChange = (tab: 'home' | 'create' | 'import-seed' | 'import-address' | 'setup-password') => {
    setActiveTab(tab);
    if (tab === 'create') {
      const words = generate24WordMnemonic();
      setCreatedWords(words);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col justify-between overflow-hidden selection:bg-[#70C7BA]/30 selection:text-[#70C7BA]">
      {/* Top Header */}
      <AnimatePresence>
        {activeTab === 'home' && (
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full px-5 py-4 flex items-center justify-between bg-[#090D12] flex-shrink-0"
          >
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('home')}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
                <img src="/assets/kas_icon.svg" alt="Kaspriv Logo" className="w-6 h-6" />
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <main 
        className={`flex-1 w-full flex flex-col overflow-y-auto no-scrollbar transition-all duration-200 ${activeTab === 'home' ? 'px-5 py-6' : 'sm:px-5 sm:py-6'}`}
        style={{ paddingBottom: isKeyboardOpen ? '220px' : undefined }}
      >
        <AnimatePresence mode="wait">
          {/* TAB: HOME */}
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full space-y-6 text-center"
            >
              <div className="space-y-2 w-full text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#090D12]  text-[10px] text-[#70C7BA] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#70C7BA]" />
                  <span>On-Chain Cryptographic</span>
                </div>
                <TypewriterHeading />
                <p className="text-xs font-serif font-bold text-slate-300 leading-relaxed tracking-wide">
                  Zero-trust and verified signing.
                </p>
              </div>

              {/* Main Action Stack - Perfectly vertical with zero side overflow */}
              <div className="flex flex-col gap-3 w-full">
                {/* 1. Create New Wallet */}
                <button
                  onClick={() => handleTabChange('create')}
                  className="p-4 rounded-2xl bg-[#090D12]  hover:border-[#70C7BA] transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#70C7BA]/10 text-[#70C7BA] flex items-center justify-center font-bold">
                      <Plus className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-100">Create Wallet</h3>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#70C7BA] transition-all" />
                </button>

                {/* 2. Import Seed Phrase */}
                <button
                  onClick={() => handleTabChange('import-seed')}
                  className="p-4 rounded-2xl bg-[#090D12]  hover:border-amber-400 transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                      <Key className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-100">Import Seed</h3>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-all" />
                </button>

                {/* 3. Track Real Kaspa Address */}
                <button
                  onClick={() => handleTabChange('import-address')}
                  className="p-4 rounded-2xl bg-[#090D12]  hover:border-emerald-400 transition-all group flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      <Eye className="w-5 h-5 stroke-[2.5]" />
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

          {/* TAB: CREATE WALLET */}
          {activeTab === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full   w-full flex-1 space-y-4 text-left overflow-y-auto no-scrollbar pt-safe pb-safe"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => {
                    if (step === 2) setStep(1);
                    else setActiveTab('home');
                  }}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <span>Create Wallet</span>
                </div>
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
                    onClick={handleStartCreate}
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
                        {createdWords.map((word, idx) => (
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
                    <span>Open Wallet Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: IMPORT SEED */}
          {activeTab === 'import-seed' && (
            <motion.div
              key="import-seed"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full   w-full flex-1 space-y-4 text-left overflow-y-auto no-scrollbar pt-safe pb-safe"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setActiveTab('home')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#70C7BA]" />
                  <span>Import Seed</span>
                </div>
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
                  value={walletName}
                  onFocus={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  onClick={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Mnemonic Recovery Words
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowImportSeed(!showImportSeed)}
                    className="text-[10px] text-[#70C7BA] hover:underline flex items-center gap-1 font-bold cursor-pointer"
                  >
                    {showImportSeed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3.5 h-3.5" />}
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
                    className={`w-full p-3 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs font-mono text-slate-100 outline-none transition-all resize-none ${
                      !showImportSeed && importWordsText ? 'filter blur-[6px] select-none text-transparent' : ''
                    }`}
                  />
                  {!showImportSeed && importWordsText && (
                    <div
                      onClick={() => setShowImportSeed(true)}
                      className="absolute inset-0 flex items-center justify-center cursor-pointer bg-[#090D12]/50 rounded-xl"
                    >
                      <span className="text-[10px] bg-[#090D12]  px-2.5 py-1 rounded-lg text-slate-300 shadow flex items-center gap-1.5">
                        <Eye className="w-3 h-3 text-[#70C7BA]" /> Click to reveal seed phrase
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  BIP39 Passphrase
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    placeholder="Enter the passphrase used to secure this seed"
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
                <span>Restore Wallet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* TAB: TRACK ADDRESS */}
          {activeTab === 'import-address' && (
            <motion.div
              key="import-address"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full   w-full flex-1 space-y-4 text-left overflow-y-auto no-scrollbar pt-safe pb-safe"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setActiveTab('home')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Track Address</span>
                </div>
              </div>

              {previewAddress && (
                <div className="p-3 rounded-xl bg-[#70C7BA]/10 border border-[#70C7BA]/30 shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] font-bold text-[#70C7BA] uppercase">Live Address Preview</div>
                    <div className="px-1.5 py-0.5 rounded-md bg-[#70C7BA]/20 text-[#70C7BA] text-[8px] font-mono">
                      Tracked Address
                    </div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-200 break-all leading-relaxed bg-black/20 p-2 rounded-lg border border-[#70C7BA]/10">
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
                  value={walletName}
                  onFocus={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  onClick={() => openKeyboard({ value: walletName, onChange: setWalletName })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-emerald-400 text-xs text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Live Kaspa Address
                </label>
                <input
                  type="text"
                  value={addressInput}
                  onFocus={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                  onClick={() => openKeyboard({ value: addressInput, onChange: setAddressInput })}
                  inputMode="none" onChange={() => {}}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090D12]  focus:border-emerald-400 font-mono text-[10px] text-slate-100 outline-none"
                />
              </div>

              <button
                onClick={handleFinishImportAddress}
                className="w-full py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#090D12] font-extrabold text-xs transition-all shadow-lg shadow-emerald-400/20 flex items-center justify-center gap-1.5"
              >
                <span>Track Address</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
          {/* TAB: SETUP PASSWORD */}
          {activeTab === 'setup-password' && (
            <motion.div
              key="setup-password"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full   w-full flex-1 space-y-4 text-left overflow-y-auto no-scrollbar pt-safe pb-safe"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => setActiveTab(pendingFlow === 'create' ? 'create' : pendingFlow === 'import-seed' ? 'import-seed' : 'import-address')}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#70C7BA]" />
                  <span>Security Password Setup</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-[#090D12]  text-[10px] text-slate-400 space-y-1.5">
                  <p className="font-extrabold text-slate-200">Device Encryption Required</p>
                  <p className="leading-relaxed">
                    Choose a secure password (min 8 characters) to encrypt your wallet seed on this device. You will need this password to unlock the app and sign transactions.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Create Password
                    </label>
                    <div className="relative">
                      <input
                        type={showSetupPassword ? "text" : "password"}
                        placeholder="Strong password required"
                        value={setupPassword}
                        onFocus={() => openKeyboard({ value: setupPassword, onChange: setSetupPassword })}
                        onClick={() => openKeyboard({ value: setupPassword, onChange: setSetupPassword })}
                        inputMode="none" onChange={() => {}}
                        className="w-full px-3 pr-10 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPassword(!showSetupPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {setupPassword.length > 0 && (() => {
                      const strResult = checkPassphraseStrength(setupPassword);
                      return (
                        <div className="mt-2 space-y-1">
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
                        onFocus={() => openKeyboard({ value: confirmSetupPassword, onChange: setConfirmSetupPassword })}
                        onClick={() => openKeyboard({ value: confirmSetupPassword, onChange: setConfirmSetupPassword })}
                        inputMode="none" onChange={() => {}}
                        className="w-full px-3 pr-10 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPassword(!showSetupPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (checkPassphraseStrength(setupPassword).score < 3) {
                      showToast('Password must be at least 8 characters', 'error');
                      return;
                    }
                    if (setupPassword !== confirmSetupPassword) {
                      showToast('Passwords do not match', 'error');
                      return;
                    }
                    setActiveTab('setup-duress');
                  }}
                  disabled={checkPassphraseStrength(setupPassword).score < 3 || confirmSetupPassword.length < 8 || setupPassword !== confirmSetupPassword}
                  className={`w-full py-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    checkPassphraseStrength(setupPassword).score >= 3 && confirmSetupPassword.length >= 8 && setupPassword === confirmSetupPassword
                      ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] shadow-lg shadow-[#70C7BA]/20 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>Continue to Emergency Duress Setup</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* TAB: SETUP DURESS PASSWORD (FULL VIEW) */}
          {activeTab === 'setup-duress' && (
            <motion.div
              key="setup-duress"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full flex-1 space-y-4 text-left overflow-y-auto no-scrollbar pt-safe pb-safe"
            >
              <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
                <button
                  onClick={() => {
                    closeKeyboard();
                    setActiveTab('setup-password');
                  }}
                  className="p-1.5 rounded-xl bg-[#090D12] text-slate-400 hover:text-slate-100 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  <span>Emergency Duress Password</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <p className="text-[11px] text-rose-300/90 leading-tight">
                    <strong className="text-rose-300">Panic Wipe Defense:</strong> Entering this password on the lock screen instantly wipes the wallet with zero trace.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Secondary Duress Password
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        type={showSetupDuressPassword ? "text" : "password"}
                        placeholder="Choose a distinct panic password (min 8 chars)"
                        value={setupDuressPassword}
                        onFocus={() => {
                          setActiveDuressField('primary');
                          openKeyboard({ value: setupDuressPassword, onChange: (val) => setSetupDuressPassword(val) });
                        }}
                        onClick={() => {
                          setActiveDuressField('primary');
                          openKeyboard({ value: setupDuressPassword, onChange: (val) => setSetupDuressPassword(val) });
                        }}
                        onChange={(e) => {
                          setSetupDuressPassword(e.target.value);
                          openKeyboard({ value: e.target.value, onChange: (val) => setSetupDuressPassword(val) });
                        }}
                        inputMode="none"
                        className={`w-full px-3.5 pr-10 py-2.5 rounded-xl bg-[#090D12] border-2 transition-all ${
                          activeDuressField === 'primary' && isKeyboardOpen
                            ? 'border-rose-500 ring-2 ring-rose-500/20'
                            : setupDuressPassword && setupDuressPassword === setupPassword
                              ? 'border-rose-500/60'
                              : 'border-[#212B38] focus:border-rose-400'
                        } text-sm text-slate-100 outline-none`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupDuressPassword(!showSetupDuressPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupDuressPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {setupDuressPassword.length > 0 && (() => {
                      const strResult = checkPassphraseStrength(setupDuressPassword);
                      return (
                        <div className="mt-1.5 space-y-1">
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
                        </div>
                      );
                    })()}

                    {setupDuressPassword && setupDuressPassword === setupPassword && (
                      <p className="text-[10px] text-rose-400 px-1 mt-1 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Duress password must be different from your primary password!</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between px-1 mb-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Confirm Duress Password
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        type={showSetupDuressPassword ? "text" : "password"}
                        placeholder="Repeat duress password"
                        value={confirmSetupDuressPassword}
                        onFocus={() => {
                          setActiveDuressField('confirm');
                          openKeyboard({ value: confirmSetupDuressPassword, onChange: (val) => setConfirmSetupDuressPassword(val) });
                        }}
                        onClick={() => {
                          setActiveDuressField('confirm');
                          openKeyboard({ value: confirmSetupDuressPassword, onChange: (val) => setConfirmSetupDuressPassword(val) });
                        }}
                        onChange={(e) => {
                          setConfirmSetupDuressPassword(e.target.value);
                          openKeyboard({ value: e.target.value, onChange: (val) => setConfirmSetupDuressPassword(val) });
                        }}
                        inputMode="none"
                        className={`w-full px-3.5 pr-10 py-2.5 rounded-xl bg-[#090D12] border-2 transition-all ${
                          activeDuressField === 'confirm' && isKeyboardOpen
                            ? 'border-rose-500 ring-2 ring-rose-500/20'
                            : confirmSetupDuressPassword && confirmSetupDuressPassword !== setupDuressPassword
                              ? 'border-rose-500/60'
                              : confirmSetupDuressPassword && confirmSetupDuressPassword === setupDuressPassword
                                ? 'border-emerald-500/60'
                                : 'border-[#212B38] focus:border-rose-400'
                        } text-sm text-slate-100 outline-none`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupDuressPassword(!showSetupDuressPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      >
                        {showSetupDuressPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Primary Action: Enable Duress Password */}
                <button
                  onClick={async () => {
                    if (setupDuressPassword.length < 8) {
                      showToast('Duress password must be at least 8 characters', 'error');
                      return;
                    }
                    if (setupDuressPassword === setupPassword) {
                      showToast('Duress password must be different from primary password', 'error');
                      return;
                    }
                    if (setupDuressPassword !== confirmSetupDuressPassword) {
                      showToast('Duress passwords do not match', 'error');
                      return;
                    }

                    closeKeyboard();
                    const flow = pendingFlow;
                    const pass = setupPassword;
                    const duressPass = setupDuressPassword.trim();
                    const name = sanitizeWalletName(walletName.trim(), flow === 'create' ? 'Primary Wallet' : flow === 'import-seed' ? 'Restored Wallet' : 'Address Tracker');
                    const words = flow === 'create' ? [...createdWords] : cleanMnemonic(importWordsText).split(' ');
                    const passInput = passphraseInput.trim() || undefined;
                    const addrType = addressType;
                    const addr = addressInput.trim();

                    try {
                      resetState();
                      setIsLoggedOut(false);

                      if (flow === 'create') {
                        await createNewWallet(name, words, passInput, addrType, pass, duressPass);
                      } else if (flow === 'import-seed') {
                        await importSeedWallet(name, words, passInput, addrType, pass, duressPass);
                      } else if (flow === 'import-address') {
                        await importKpubWallet(name, addr, addrType, pass, duressPass);
                      }
                      
                      setIsLocked(true);
                      setIsLoggedOut(false);
                    } finally {
                      wipeStringArray(words);
                      setCreatedWords([]);
                      setImportWordsText('');
                      setPassphraseInput('');
                      setSetupPassword('');
                      setConfirmSetupPassword('');
                      setSetupDuressPassword('');
                      setConfirmSetupDuressPassword('');
                    }
                  }}
                  disabled={
                    setupDuressPassword.length < 8 ||
                    setupDuressPassword === setupPassword ||
                    setupDuressPassword !== confirmSetupDuressPassword
                  }
                  className={`w-full py-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
                    setupDuressPassword.length >= 8 &&
                    setupDuressPassword !== setupPassword &&
                    setupDuressPassword === confirmSetupDuressPassword
                      ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Configure Duress & Complete Setup</span>
                </button>

                {/* Secondary Action: Skip Duress Setup */}
                <button
                  onClick={async () => {
                    closeKeyboard();
                    const flow = pendingFlow;
                    const pass = setupPassword;
                    const name = sanitizeWalletName(walletName.trim(), flow === 'create' ? 'Primary Wallet' : flow === 'import-seed' ? 'Restored Wallet' : 'Address Tracker');
                    const words = flow === 'create' ? [...createdWords] : cleanMnemonic(importWordsText).split(' ');
                    const passInput = passphraseInput.trim() || undefined;
                    const addrType = addressType;
                    const addr = addressInput.trim();

                    try {
                      resetState();
                      setIsLoggedOut(false);

                      if (flow === 'create') {
                        await createNewWallet(name, words, passInput, addrType, pass);
                      } else if (flow === 'import-seed') {
                        await importSeedWallet(name, words, passInput, addrType, pass);
                      } else if (flow === 'import-address') {
                        await importKpubWallet(name, addr, addrType, pass);
                      }
                      
                      setIsLocked(true);
                      setIsLoggedOut(false);
                    } finally {
                      wipeStringArray(words);
                      setCreatedWords([]);
                      setImportWordsText('');
                      setPassphraseInput('');
                      setSetupPassword('');
                      setConfirmSetupPassword('');
                      setSetupDuressPassword('');
                      setConfirmSetupDuressPassword('');
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-[#212B38] text-slate-400 hover:text-slate-200 text-xs font-semibold hover:bg-white/5 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Skip / Finish Without Duress Password</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <AnimatePresence>
        {activeTab === 'home' && (
          <motion.footer 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full bg-[#090D12] pt-3 pb-[max(1.75rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] px-5"
          >
            <div className="w-full flex items-center justify-between gap-2 text-[10px] text-slate-500 font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA]" />
                <span>Kaspa BlockDAG Network</span>
              </div>
              <span>•</span>
              <span>Schnorr Security</span>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
};
