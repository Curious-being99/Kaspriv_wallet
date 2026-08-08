import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import {
  validateKaspaAddress,
  sompiToKas,
  formatKas,
  shortenAddress,
  generateDeterministicAddress,
} from '../utils/kaspa';
import { decryptWithPassword } from '../utils/crypto';
import {
  X,
  ArrowUpRight,
  Shield,
  AlertCircle,
  Check,
  Lock,
  ExternalLink,
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  Clipboard,
  Trash2,
  Key,
} from 'lucide-react';
import { motion } from 'motion/react';

interface SuccessTxData {
  txid: string;
  amountKas: number;
  feeKas: number;
  toAddress: string;
  fiatValue: string;
  note?: string;
  timestamp: number;
  isConfirmed?: boolean;
}

export const SendModal: React.FC = () => {
  const {
    activeWallet,
    network,
    marketData,
    currency,
    fiatRate,
    isSendOpen,
    setIsSendOpen,
    sendKaspa,
    isPasswordEnabled,
    password,
    showToast,
    transactions,
    refreshBalance,
  } = useWallet();

  const [toAddress, setToAddress] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<'low' | 'normal' | 'fast'>('normal');
  const [note, setNote] = useState('');

  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  const [isConfirmingStep, setIsConfirmingStep] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [successTx, setSuccessTx] = useState<SuccessTxData | null>(null);
  const [copiedTxid, setCopiedTxid] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  const [isPasswordDecrypting, setIsPasswordDecrypting] = useState(false);
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const [decryptedMnemonic, setDecryptedMnemonic] = useState<string | null>(null);

  // No auto-fill needed from worker; seed is decrypted on-the-fly with password
  useEffect(() => {
    if (isSendOpen && activeWallet) {
      if (!isPasswordEnabled && activeWallet.passphrase) {
        setPassphraseInput(activeWallet.passphrase);
      }
    }
  }, [isSendOpen, activeWallet, isPasswordEnabled]);

  // Handle automatic on-the-fly password verification/decryption
  useEffect(() => {
    let isMounted = true;
    if (!isSendOpen) {
      setIsPasswordCorrect(false);
      setDecryptedMnemonic(null);
      return;
    }

    if (!isPasswordEnabled) {
      setIsPasswordCorrect(true);
      return;
    }

    if (passwordInput.length < 8) {
      setIsPasswordCorrect(false);
      setDecryptedMnemonic(null);
      return;
    }

    const verifyAndDecrypt = async () => {
      setIsPasswordDecrypting(true);
      try {
        if (activeWallet?.encryptedMnemonic) {
          const decrypted = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, passwordInput);
          if (isMounted) {
            setIsPasswordCorrect(true);
            setDecryptedMnemonic(decrypted);
          }
        } else if (activeWallet?.encryptedMnemonic) {
          const decrypted = await decryptWithPassword(
            activeWallet.encryptedMnemonic.ciphertext,
            activeWallet.encryptedMnemonic.salt,
            activeWallet.encryptedMnemonic.iv,
            passwordInput
          );
          if (isMounted) {
            setIsPasswordCorrect(true);
            setDecryptedMnemonic(decrypted);
          }
        } else {
          // Fallback if no encrypted fields but password is enabled
          if (passwordInput === password) {
            setIsPasswordCorrect(true);
          } else {
            setIsPasswordCorrect(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setIsPasswordCorrect(false);
          setDecryptedMnemonic(null);
        }
      } finally {
        if (isMounted) {
          setIsPasswordDecrypting(false);
        }
      }
    };

    const timer = setTimeout(verifyAndDecrypt, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [passwordInput, isPasswordEnabled, isSendOpen, activeWallet?.id, activeWallet?.encryptedMnemonic, password]);

  const getMnemonicForSigning = async (): Promise<string | null> => {
    if (isPasswordEnabled && decryptedMnemonic) {
      return decryptedMnemonic;
    }

    if (activeWallet?.mnemonic) {
      return activeWallet.mnemonic;
    }

    if (isPasswordEnabled && activeWallet?.encryptedMnemonic && passwordInput) {
      try {
        const decrypted = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, passwordInput);
        return decrypted;
      } catch (e) {}
    }

    if (isPasswordEnabled && activeWallet?.encryptedMnemonic && passwordInput) {
      try {
        const decrypted = await decryptWithPassword(
          activeWallet.encryptedMnemonic.ciphertext,
          activeWallet.encryptedMnemonic.salt,
          activeWallet.encryptedMnemonic.iv,
          passwordInput
        );
        return decrypted;
      } catch (e) {
        return null;
      }
    }

    return null;
  };

  const getPassphraseForSigning = async (): Promise<string | undefined> => {
    if (passphraseInput) {
      return passphraseInput;
    }

    if (isPasswordEnabled && activeWallet?.encryptedPassphrase && passwordInput) {
      try {
        const decrypted = await decryptWithPassword(activeWallet.encryptedPassphrase.ciphertext, activeWallet.encryptedPassphrase.salt, activeWallet.encryptedPassphrase.iv, passwordInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");
        return decrypted || undefined;
      } catch (e) {}
    }

    if (activeWallet?.passphrase) {
      return activeWallet.passphrase;
    }

    return undefined;
  };

  const transactionsRef = useRef(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const successTxRef = useRef(successTx);
  useEffect(() => {
    successTxRef.current = successTx;
  }, [successTx]);

  const refreshBalanceRef = useRef(refreshBalance);
  useEffect(() => {
    refreshBalanceRef.current = refreshBalance;
  }, [refreshBalance]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  // Live status polling for transaction confirmation
  useEffect(() => {
    let pollInterval: any;

    if (successTx && !successTx.isConfirmed) {
      const checkStatus = () => {
        const curSuccess = successTxRef.current;
        if (!curSuccess || curSuccess.isConfirmed) return;
        const found = transactionsRef.current.find((tx) => tx.txid === curSuccess.txid);
        if (found && found.isAccepted) {
          setSuccessTx((prev) => (prev ? { ...prev, isConfirmed: true } : null));
          showToastRef.current('Transaction confirmed on-chain!', 'success');
        } else {
          refreshBalanceRef.current();
        }
      };

      checkStatus();
      pollInterval = setInterval(checkStatus, 4000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [successTx]);

  if (!isSendOpen) return null;

  const feeValuesKas = {
    low: 0.0046,
    normal: 0.005,
    fast: 0.007,
  };

  const selectedFee = feeValuesKas[feeSpeed];
  const maxBalanceKas = activeWallet ? sompiToKas(activeWallet.balanceSompi) : 0;

  const handleAddressChange = (val: string) => {
    setToAddress(val);
    if (val.trim()) {
      const res = validateKaspaAddress(val, network);
      if (!res.isValid) {
        setAddressError(res.error || 'Invalid address');
      } else {
        setAddressError(null);
      }
    } else {
      setAddressError(null);
    }
  };

  const handleMaxClick = () => {
    const maxSendable = Math.max(0, maxBalanceKas - selectedFee);
    setAmountInput(maxSendable.toString());
  };

  const numericAmount = parseFloat(amountInput) || 0;
  const fiatEquivalent = (numericAmount * marketData.priceUsd * fiatRate).toFixed(2);

  const isFormValid =
    !activeWallet?.isWatchOnly &&
    !activeWallet?.isImportedKpub &&
    toAddress.trim().length > 0 &&
    !addressError &&
    numericAmount > 0 &&
    numericAmount + selectedFee <= maxBalanceKas;

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsConfirmingStep(true);
  };

  const handleClose = () => {
    setIsSendOpen(false);
    setIsConfirmingStep(false);
    setSuccessTx(null);
    setToAddress('');
    setAmountInput('');
    setNote('');
    setPasswordInput('');
    setPassphraseInput('');
  };

  const handleCopyTxid = (txid: string) => {
    navigator.clipboard.writeText(txid);
    setCopiedTxid(true);
    showToast('Transaction ID copied!', 'success');
    setTimeout(() => setCopiedTxid(false), 2000);
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(true);
    showToast('Recipient address copied!', 'success');
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleExecuteSend = async () => {
    if (isPasswordEnabled) {
      if (passwordInput.length < 8) {
        showToast('Please enter your wallet password', 'error');
        return;
      }
      if (!isPasswordCorrect) {
        showToast('Incorrect wallet password', 'error');
        return;
      }
    }

    setIsSending(true);
    const mnemonicToUse = await getMnemonicForSigning();
    const passphraseToUse = await getPassphraseForSigning();

    if (!mnemonicToUse) {
      showToast('Wallet key not found. Please unlock or re-import the wallet.', 'error');
      setIsSending(false);
      return;
    }

    const res = await sendKaspa(toAddress, numericAmount, selectedFee, note, mnemonicToUse, passphraseToUse);
    setIsSending(false);

    // Immediately wipe sensitive states
    setPasswordInput('');
    setPassphraseInput('');

    if (res.success) {
      setSuccessTx({
        txid: res.txid || 'kaspa-txid-pending',
        amountKas: numericAmount,
        feeKas: selectedFee,
        toAddress: toAddress.trim(),
        fiatValue: fiatEquivalent,
        note: note.trim() || undefined,
        timestamp: Date.now(),
      });
      setIsConfirmingStep(false);
      setToAddress('');
      setAmountInput('');
      setNote('');
    } else {
      showToast(res.error || 'Failed to send Kaspa', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full h-full flex flex-col p-6 overflow-y-auto no-scrollbar pt-safe pb-safe"
        style={{ paddingBottom: isKeyboardOpen ? '280px' : '' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-[#212B38]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#70C7BA]/20 border border-[#70C7BA]/40 flex items-center justify-center text-[#70C7BA]">
              {successTx ? (
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-100 leading-tight">
                {successTx ? 'Transaction Success' : isConfirmingStep ? 'Seed Phrase Sign & Broadcast' : 'Send Kaspa'}
              </h3>
              <p className="text-[9px] text-slate-400">
                {successTx ? 'Broadcasted & Accepted' : isConfirmingStep ? 'In-Memory Key Signing Zone' : 'Kaspa Fast Settlement Network'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-[#1C2F42] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        {successTx ? (
          /* Step 3: Transaction Success Display */
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="space-y-2.5 py-1 mt-1"
          >
            {/* Success Badge */}
            <div className="flex flex-col items-center justify-center text-center pt-1">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-12 h-12 rounded-full bg-[#70C7BA]/20 animate-ping opacity-30" />
                <div className="w-10 h-10 rounded-xl bg-[#70C7BA]/15 border border-[#70C7BA]/40 flex items-center justify-center text-[#70C7BA] shadow-lg shadow-[#70C7BA]/20 relative z-10">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.2]" />
                </div>
              </div>
              <h3 className="text-base font-extrabold text-slate-100 mt-1.5 tracking-tight">
                Transaction Successful!
              </h3>
              <p className="text-[9px] text-[#70C7BA] font-medium flex items-center justify-center mt-0.5">
                Broadcasted to Block-DAG Network
              </p>
            </div>

            {/* Amount Summary Box */}
            <div className="p-2.5 rounded-xl bg-[#0B151E]  text-center shadow-inner">
              <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">
                Amount Transferred
              </div>
              <div className="text-xl font-black font-mono text-slate-100 tracking-tight flex items-baseline justify-center gap-1">
                <span className="text-rose-400">-</span>
                <span>{successTx.amountKas.toLocaleString('en-US', { maximumFractionDigits: 8 })}</span>
                <span className="text-xs font-extrabold text-[#70C7BA]">KAS</span>
              </div>
              <div className="text-[9px] font-semibold text-slate-400">
                ≈ ${successTx.fiatValue} {currency}
              </div>
            </div>

            {/* Detailed Transaction Breakdown */}
            <div className="p-2.5 rounded-xl bg-[#0B151E]/80  space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#273E54]">
                <span className="text-slate-400 font-medium">Recipient</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-slate-200 font-semibold truncate max-w-[120px]">
                    {shortenAddress(successTx.toAddress)}
                  </span>
                  <button
                    onClick={() => handleCopyAddress(successTx.toAddress)}
                    className="p-0.5 rounded hover:bg-[#1C2F42] text-slate-400"
                  >
                    {copiedAddr ? <Check className="w-3 h-3 text-[#70C7BA]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#273E54]">
                <span className="text-slate-400 font-medium">TxID</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-slate-200 font-semibold">
                    {shortenAddress(successTx.txid, 4, 4)}
                  </span>
                  <button
                    onClick={() => handleCopyTxid(successTx.txid)}
                    className="p-0.5 rounded hover:bg-[#1C2F42] text-slate-400"
                  >
                    {copiedTxid ? <Check className="w-3 h-3 text-[#70C7BA]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Status</span>
                <span className={`inline-flex items-center gap-1 font-bold ${successTx.isConfirmed ? 'text-emerald-400' : 'text-[#70C7BA]'}`}>
                  {!successTx.isConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] animate-pulse" />}
                  {successTx.isConfirmed && <Check className="w-3 h-3" />}
                  {successTx.isConfirmed ? 'Confirmed' : 'Mining'}
                </span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 w-full">
                <a
                  href={`https://explorer.kaspa.org/txs/${successTx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-1.5 rounded-lg bg-[#1C2F42] hover:bg-[#273E54] text-[10px] font-bold text-slate-100 flex items-center justify-center gap-1 transition-colors "
                >
                  <ExternalLink className="w-3 h-3 text-[#70C7BA]" />
                  Explorer
                </a>
                <a
                  href={`https://kaspa.stream/tx/${successTx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-1.5 rounded-lg bg-[#1C2F42] hover:bg-[#273E54] text-[10px] font-bold text-slate-100 flex items-center justify-center gap-1 transition-colors "
                >
                  <ExternalLink className="w-3 h-3 text-cyan-400" />
                  Live
                </a>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 rounded-lg bg-[#70C7BA] hover:bg-[#5eead4] text-[#0B151E] font-extrabold text-xs transition-all shadow-md shadow-[#70C7BA]/20 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        ) : !isConfirmingStep ? (
          /* Step 1: Send Form */
          <form onSubmit={handleProceedToConfirm} className="mt-3 space-y-3">
            {(activeWallet?.isWatchOnly || activeWallet?.isImportedKpub) && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-200 text-xs">Watch-Only Mode Active</p>
                  <p className="text-amber-300/90 text-[10px] mt-0.5">
                    This wallet is in Watch-Only mode. Sending Kaspa and signing transactions are disabled because no seed phrase exists for this address.
                  </p>
                </div>
              </div>
            )}
            {/* Recipient Address */}
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Recipient Kaspa Address
              </label>
              <input
                type="text"
                placeholder={`kaspa:q...`}
                value={toAddress}
                onFocus={() => openKeyboard({ value: toAddress, onChange: handleAddressChange })}
                onClick={() => openKeyboard({ value: toAddress, onChange: handleAddressChange })}
                readOnly
                inputMode="none"
                className={`w-full px-3 py-2 rounded-xl bg-[#0B151E] border ${
                  addressError ? 'border-rose-500' : 'border-[#273E54] focus:border-[#70C7BA]'
                } font-mono text-xs text-slate-100 outline-none transition-colors`}
              />

              {addressError && (
                <div className="flex items-center gap-1 text-[10px] text-rose-400 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{addressError}</span>
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  Amount
                </label>
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="text-[10px] font-mono text-[#70C7BA] hover:underline"
                >
                  Balance: {formatKas(activeWallet?.balanceSompi || 0n, 2)} KAS (Use Max)
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  step="any"
                  placeholder="0.0"
                  value={amountInput}
                  onFocus={() => openKeyboard({ value: amountInput, onChange: setAmountInput, layoutName: 'numeric' })}
                  onClick={() => openKeyboard({ value: amountInput, onChange: setAmountInput, layoutName: 'numeric' })}
                  readOnly
                  inputMode="none"
                  className="w-full pl-3 pr-14 py-2 rounded-xl bg-[#0B151E]  focus:border-[#70C7BA] font-mono text-base font-bold text-slate-100 outline-none"
                />
                <span className="absolute right-3 top-2.5 font-bold text-xs text-[#70C7BA]">KAS</span>
              </div>
              <div className="mt-0.5 text-right text-[10px] text-slate-400">
                ≈ ${fiatEquivalent} {currency}
              </div>
            </div>

            {/* Network Fee Priority */}
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Priority Fee
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['low', 'normal', 'fast'] as const).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setFeeSpeed(speed)}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-bold capitalize transition-all ${
                      feeSpeed === speed
                        ? 'bg-[#70C7BA]/15 border-[#70C7BA] text-[#70C7BA]'
                        : 'bg-[#0B151E] border-[#273E54] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>{speed === 'low' ? 'Small' : speed}</div>
                    <div className="text-[9px] font-mono opacity-80 mt-0.5">
                      {feeValuesKas[speed]} KAS
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Note / Memo (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Payment for invoice #1042"
                value={note}
                onFocus={() => openKeyboard({ value: note, onChange: setNote })}
                onClick={() => openKeyboard({ value: note, onChange: setNote })}
                readOnly
                inputMode="none"
                className="w-full px-3 py-2 rounded-xl bg-[#0B151E]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={!isFormValid}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                  isFormValid
                    ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#0B151E] shadow-[#70C7BA]/20 cursor-pointer'
                    : 'bg-[#1C2F42] text-slate-500 cursor-not-allowed'
                }`}
              >
                Proceed to Sign & Broadcast
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: In-Memory Key Signing & Broadcast Page */
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mt-3 space-y-3"
          >
            {/* Transaction Summary Card */}
            <div className="p-2.5 rounded-xl bg-[#0B151E]  space-y-1">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-400 block font-medium">Sending Amount</span>
                  <span className="font-mono font-bold text-[#70C7BA] text-[11px]">{numericAmount} KAS</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Total Deduction</span>
                  <span className="font-mono font-bold text-slate-100 text-[11px]">{(numericAmount + selectedFee).toFixed(6)} KAS</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-[#273E54] text-[10px] flex items-center justify-between gap-1.5">
                <span className="text-slate-400 font-medium shrink-0">Recipient:</span>
                <span className="font-mono text-slate-200 truncate text-[9px]">{toAddress}</span>
              </div>
            </div>

            {/* Zero-Storage Verification & Built-in Keyboard Security Policy */}
            <div className="text-[9px] text-slate-400 flex items-start gap-1.5 bg-[#090D12] p-2 rounded-xl ">
              <Lock className="w-3.5 h-3.5 text-[#70C7BA] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-slate-200">Zero-Storage Ram Engine</p>
                <p className="leading-normal">
                  Your seed phrase remains encrypted at rest. On-the-fly decryption occurs purely in ephemeral RAM to sign this transaction, then is immediately wiped.
                </p>
              </div>
            </div>

            {/* BIP39 Passphrase Input Zone */}
            <div className="p-2.5 rounded-xl bg-[#0B151E]  space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-[#70C7BA]" />
                  BIP39 Passphrase (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="text-[10px] text-[#70C7BA] hover:underline font-medium flex items-center gap-0.5 cursor-pointer"
                >
                  {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPassphrase ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphraseInput}
                onFocus={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                onClick={() => openKeyboard({ value: passphraseInput, onChange: setPassphraseInput })}
                readOnly
                inputMode="none"
                placeholder="Enter passphrase if set during creation..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#090D12]  focus:border-[#70C7BA] text-[11px] font-mono text-slate-100 outline-none transition-colors"
              />
            </div>

            {/* Wallet Password Lock if enabled */}
            {isPasswordEnabled && (
              <div className="p-2.5 rounded-xl bg-[#0B151E] space-y-1">
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
                    className="w-full px-3 py-2 rounded-lg bg-[#090D12] focus:border-[#70C7BA] text-sm text-slate-100 outline-none transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Live Verification Status Banner */}
            <div
              className={`p-2.5 rounded-xl border text-[10px] font-bold flex flex-col gap-1 ${
                isPasswordEnabled
                  ? passwordInput.length < 8
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : isPasswordDecrypting
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : isPasswordCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isPasswordEnabled ? (
                  passwordInput.length < 8 ? (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : isPasswordDecrypting ? (
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : isPasswordCorrect ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="leading-snug">
                  {isPasswordEnabled
                    ? passwordInput.length < 8
                      ? `Please enter your wallet password (min 8 chars)`
                      : isPasswordDecrypting
                      ? 'Decrypting wallet credentials in memory...'
                      : isPasswordCorrect
                      ? 'Password verified. Secure keys decrypted in RAM successfully.'
                      : 'Incorrect password. Decryption failed.'
                    : 'Unprotected mode. Secure in-memory keys ready for signing.'}
                </span>
              </div>
            </div>

            {/* Back & Broadcast Buttons */}
            <div className="flex flex-col gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleExecuteSend}
                disabled={isSending || (isPasswordEnabled && (!isPasswordCorrect || passwordInput.length < 8))}
                className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
                  !isSending && (!isPasswordEnabled || (isPasswordCorrect && passwordInput.length >= 8))
                    ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#0B151E] shadow-lg shadow-[#70C7BA]/20 cursor-pointer active:scale-[0.99]'
                    : 'bg-[#1C2F42]  text-slate-500 cursor-not-allowed shadow-none'
                }`}
              >
                {isSending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#0B151E] border-t-transparent rounded-full animate-spin" />
                    <span>Broadcasting to Kaspa DAG...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                    <span>Sign & Broadcast Transaction</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsConfirmingStep(false)}
                className="w-full py-2 rounded-xl bg-[#1C2F42] hover:bg-[#273E54] text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Back to Transaction Details
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
