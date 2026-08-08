import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { getPrivateKeyFromMnemonic, signKaspaMessage } from '../utils/kaspa';
import { decryptWithPassword } from '../utils/crypto';
import { X, FileCode, Check, Copy, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { useVirtualKeyboard } from '../context/KeyboardContext';

export const SignMessageModal: React.FC = () => {
  const { activeWallet, isSignMessageOpen, setIsSignMessageOpen, showToast, isPasswordEnabled, password } = useWallet();
  const { openKeyboard } = useVirtualKeyboard();

  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [copied, setCopied] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isSignMessageOpen) return null;

  const handleSign = async () => {
    if (!message.trim()) return;
    if (activeWallet.isImportedKpub) {
      showToast('Watch-Only wallet cannot sign messages', 'error');
      return;
    }

    let seedToUse = activeWallet.mnemonic;
    let passphraseToUse = activeWallet.passphrase;

    // Handle decryption if seed is encrypted at rest
    if (!seedToUse && activeWallet.encryptedMnemonic) {
      const activePassword = passwordInput || password;
      if (activePassword) {
        try {
          seedToUse = await decryptWithPassword(
            activeWallet.encryptedMnemonic.ciphertext,
            activeWallet.encryptedMnemonic.salt,
            activeWallet.encryptedMnemonic.iv,
            activePassword
          );
          
          if (activeWallet.encryptedPassphrase) {
            passphraseToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              activePassword
            );
          }
        } catch (err) {
          showToast('Invalid password. Decryption failed.', 'error');
          return;
        }
      }
    }

    if (!seedToUse) {
      showToast('Wallet seed required to sign message', 'error');
      return;
    }

    try {
      let privKeyHex: string | null = getPrivateKeyFromMnemonic(seedToUse, passphraseToUse);
      const realSig = signKaspaMessage(message.trim(), privKeyHex);
      
      // Short exposure & instant memory discard of raw private key string
      privKeyHex = null;
      
      // Wipe seed from memory
      seedToUse = '';
      passphraseToUse = '';

      setSignature(realSig);
      showToast('Message signed with Kaspa Schnorr signature', 'success');
    } catch (err: any) {
      showToast('Failed to sign message', 'error');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(signature);
    setCopied(true);
    showToast('Signature copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full    bg-[#090D12]   p-6 text-slate-100 relative overflow-y-auto no-scrollbar"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#273E54]">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-lg font-bold">Sign Message</h3>
          </div>
          <button
            onClick={() => setIsSignMessageOpen(false)}
            className="p-2 rounded-xl hover:bg-[#1C2F42] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Signing Address
            </label>
            <div className="p-3 rounded-xl bg-[#0B151E]  font-mono text-xs text-[#70C7BA] break-all">
              {activeWallet.receiveAddress}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
              Message to Sign
            </label>
            <textarea
              rows={3}
              placeholder="Enter custom message string to sign with Kaspa private key..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#0B151E]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
            />
          </div>

          {signature && (
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Cryptographic Signature
              </label>
              <div className="p-3 rounded-xl bg-[#0B151E]  font-mono text-[11px] text-amber-300 break-all relative">
                {signature}
                <button
                  onClick={handleCopy}
                  className="absolute right-2 top-2 p-1 text-[#70C7BA] hover:text-white"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {isPasswordEnabled && !activeWallet.mnemonic && (
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                Wallet Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password to sign"
                  value={passwordInput}
                  onFocus={() => openKeyboard({ value: passwordInput, onChange: setPasswordInput })}
                  onClick={() => openKeyboard({ value: passwordInput, onChange: setPasswordInput })}
                  readOnly
                  inputMode="none"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0B151E]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleSign}
            disabled={!message.trim() || (isPasswordEnabled && !activeWallet.mnemonic && passwordInput.length < 8)}
            className="w-full py-3 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#0B151E] font-bold text-sm transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            Sign Message
          </button>
        </div>
      </motion.div>
    </div>
  );
};
