import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useKeyboard } from '../context/KeyboardContext';
import { sanitizeWalletName } from '../utils/kaspa';
import { ChevronDown, Check, Plus, Lock, Edit2, Wallet as WalletIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Header: React.FC = () => {
  const {
    activeWallet,
    wallets,
    setActiveWalletId,
    renameWallet,
    setIsWalletSetupOpen,
    isPasswordEnabled,
    lockWallet,
    isSyncing,
  } = useWallet();

  const { openKeyboard } = useKeyboard();

  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(activeWallet.name);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      renameWallet(activeWallet.id, nameInput);
      setIsEditingName(false);
    }
  };

  return (
    <header 
      className="fixed top-0 left-0 w-full px-4 pb-2 bg-[#090D12] z-50 flex justify-center"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}
    >
      <div className="w-full max-w-3xl flex items-center justify-between relative">
        {/* App Logo & Wallet Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsWalletMenuOpen(!isWalletMenuOpen)}
            className="flex items-center gap-2 py-1 text-left transition-all group"
          >
            <img src="/assets/kas_icon.svg" alt="Kaspriv Logo" className="w-6 h-6 object-contain flex-shrink-0" />
            <div>
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-sm font-extrabold text-slate-100 tracking-tight leading-none max-w-[180px] sm:max-w-xs truncate">
                  {sanitizeWalletName(activeWallet.name)}
                </h1>
                {isSyncing && (
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-[#70C7BA]"
                  />
                )}
                {activeWallet.isImportedKpub && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono shrink-0">
                    Watch
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${isWalletMenuOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </button>

          {/* Wallet Selector Dropdown */}
          <AnimatePresence>
            {isWalletMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="absolute left-0 mt-2 w-72 bg-[#090D12]  rounded-2xl  z-40 p-2 overflow-hidden"
              >
                <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Wallets</span>
                  <button
                    onClick={() => {
                      setNameInput(activeWallet.name);
                      setIsEditingName(!isEditingName);
                    }}
                    className="text-[10px] text-[#70C7BA] hover:underline flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Rename</span>
                  </button>
                </div>

                {/* Inline Rename Box */}
                {isEditingName && (
                  <form onSubmit={handleSaveName} className="p-2 mb-2 bg-[#090D12] rounded-xl  flex gap-1.5">
                    <input
                      type="text"
                      value={nameInput}
                      onFocus={() => openKeyboard({ value: nameInput, onChange: setNameInput })}
                      onClick={() => openKeyboard({ value: nameInput, onChange: setNameInput })}
                      inputMode="none"
                      onChange={() => {}}
                      placeholder="Wallet name"
                      className="w-full px-2 py-1 text-xs bg-transparent text-slate-100 outline-none font-medium cursor-pointer"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-[#70C7BA] text-[#090D12] rounded-lg text-xs font-bold"
                    >
                      Save
                    </button>
                  </form>
                )}

                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setActiveWalletId(w.id);
                        setIsWalletMenuOpen(false);
                        setIsEditingName(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                        w.id === activeWallet.id
                          ? 'bg-[#70C7BA]/15 text-[#70C7BA] border border-[#70C7BA]/30'
                          : 'text-slate-200 hover:bg-[#1A2330]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2 truncate max-w-[180px]">
                          {sanitizeWalletName(w.name)}
                          {w.isImportedKpub && (
                            <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded shrink-0">Watch</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {w.receiveAddress.slice(0, 14)}...
                        </div>
                      </div>
                      {w.id === activeWallet.id && <Check className="w-4 h-4 text-[#70C7BA]" />}
                    </button>
                  ))}
                </div>

                <div className="mt-2 pt-2 border-t border-[#212B38]">
                  <button
                    onClick={() => {
                      setIsWalletMenuOpen(false);
                      setIsWalletSetupOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#1A2330] hover:bg-[#212B38] text-xs font-bold text-[#70C7BA] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add / Import Wallet</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Lock Button */}
        <div className="flex items-center gap-3">
          {isPasswordEnabled && (
            <button
              onClick={lockWallet}
              className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              title="Lock Wallet"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export const HistoryHeader: React.FC = () => {
  const { transactions, activeWallet } = useWallet();

  return (
    <header 
      className="fixed top-0 left-0 w-full px-4 pb-2 bg-[#090D12] z-50 flex justify-center"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}
    >
      <div className="w-full max-w-3xl flex items-center justify-between relative">
        <div className="flex items-center gap-2 py-1">
          <h1 className="text-sm font-extrabold text-slate-100 tracking-tight leading-none">
            Activity & Transactions
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#70C7BA]/10 text-[#70C7BA] font-bold border border-[#70C7BA]/30">
            {transactions.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeWallet?.isImportedKpub && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
              Watch Only
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

export const ContactsHeader: React.FC = () => {
  const { contacts } = useWallet();

  return (
    <header 
      className="fixed top-0 left-0 w-full px-4 pb-2 bg-[#090D12] z-50 flex justify-center"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}
    >
      <div className="w-full max-w-3xl flex items-center justify-between relative">
        <div className="flex items-center gap-2 py-1">
          <h1 className="text-sm font-extrabold text-slate-100 tracking-tight leading-none">
            Address Book
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#70C7BA]/10 text-[#70C7BA] font-bold border border-[#70C7BA]/30">
            {contacts.length}
          </span>
        </div>

        <div className="flex items-center gap-2" />
      </div>
    </header>
  );
};

export const SettingsHeader: React.FC = () => {
  return (
    <header 
      className="fixed top-0 left-0 w-full px-4 pb-2 bg-[#090D12] z-50 flex justify-center"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}
    >
      <div className="w-full max-w-3xl flex items-center justify-between relative">
        <div className="flex items-center gap-2 py-1">
          <h1 className="text-sm font-extrabold text-slate-100 tracking-tight leading-none">
            Settings & Security
          </h1>
        </div>

        <div className="flex items-center gap-2" />
      </div>
    </header>
  );
};

