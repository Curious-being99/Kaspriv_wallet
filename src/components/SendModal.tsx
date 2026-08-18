import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import {
  validateKaspaAddress,
  sompiToKas,
  kasToSompi,
  formatKas,
  shortenAddress,
  generateDeterministicAddress,
  calculateDynamicFeeForTransaction,
  calculateMinFeeForInputs,
  getRecommendedFees,
} from '../utils/kaspa';
import { decryptWithPassword, buildAadContext } from '../utils/crypto';
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
  Layers,
  ChevronDown,
  ChevronUp,
  Unlock,
  Fingerprint,
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
    isBiometricsEnabled,
    authorizeSigningWithBiometrics,
    showToast,
    transactions,
    refreshBalance,
    contacts,
    utxos,
    toggleLockUtxo,
  } = useWallet();

  const [toAddress, setToAddress] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<'low' | 'normal' | 'fast'>('normal');
  const [note, setNote] = useState('');
  const [showCoinControl, setShowCoinControl] = useState(false);
  const [selectedUtxoOutpoints, setSelectedUtxoOutpoints] = useState<string[]>([]);

  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  const [isConfirmingStep, setIsConfirmingStep] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isAuthenticatingBiometrics, setIsAuthenticatingBiometrics] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [successTx, setSuccessTx] = useState<SuccessTxData | null>(null);
  const [copiedTxid, setCopiedTxid] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  const { openKeyboard, closeKeyboard, isKeyboardOpen } = useVirtualKeyboard();

  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleAddressChange = React.useCallback((val: string) => {
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
  }, [network]);

  const handlePasswordChange = (val: string) => {
    setPasswordInput(val);
    if (passwordError) {
      setPasswordError(null);
    }
  };

  // No auto-fill needed from worker; seed is decrypted on-the-fly with password
  useEffect(() => {
    if (isSendOpen && activeWallet) {
      if (!isPasswordEnabled && activeWallet.passphrase) {
        setPassphraseInput(activeWallet.passphrase);
      }
      const prefill = localStorage.getItem('kaspriv_prefill_address');
      if (prefill) {
        handleAddressChange(prefill);
        localStorage.removeItem('kaspriv_prefill_address');
      }
    }
  }, [isSendOpen, activeWallet, isPasswordEnabled, handleAddressChange]);

  const getMnemonicForSigning = async (): Promise<string | null> => {
    if (activeWallet?.mnemonic) {
      return activeWallet.mnemonic;
    }

    if (isPasswordEnabled && activeWallet?.encryptedMnemonic && passwordInput) {
      try {
        const decrypted = await decryptWithPassword(
          activeWallet.encryptedMnemonic.ciphertext,
          activeWallet.encryptedMnemonic.salt,
          activeWallet.encryptedMnemonic.iv,
          passwordInput,
          buildAadContext('MNEMONIC', activeWallet.id)
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
        const decrypted = await decryptWithPassword(
          activeWallet.encryptedPassphrase.ciphertext,
          activeWallet.encryptedPassphrase.salt,
          activeWallet.encryptedPassphrase.iv,
          passwordInput,
          buildAadContext('PASSPHRASE', activeWallet.id)
        );
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

  // Live status polling for transaction confirmation (listens to background updates from context)
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
        }
      };

      checkStatus();
      pollInterval = setInterval(checkStatus, 4000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [successTx]);

  const addrType = activeWallet?.addressType || (activeWallet?.receiveAddress?.includes(':p') ? 'P2SH' : 'P2PKH');
  const numericAmount = parseFloat(amountInput) || 0;
  const targetSompi = kasToSompi(numericAmount);

  // Dynamically calculate how many UTXOs are needed to fund numericAmount
  const dynamicFeeInfo = useMemo(() => {
    if (!utxos || utxos.length === 0) {
      const rec = getRecommendedFees(1, 2, addrType);
      return {
        inputsCount: 1,
        fees: {
          low: Number(sompiToKas(rec.lowFeeSompi)),
          normal: Number(sompiToKas(rec.normalFeeSompi)),
          fast: Number(sompiToKas(rec.fastFeeSompi)),
        },
      };
    }

    // Sort descending by amount
    const sorted = [...utxos].sort((a, b) => {
      const amtA = BigInt(a.amountSompi || 0);
      const amtB = BigInt(b.amountSompi || 0);
      return amtB > amtA ? 1 : amtB < amtA ? -1 : 0;
    });

    let accum = 0n;
    let count = 0;
    for (const u of sorted) {
      accum += BigInt(u.amountSompi || 0);
      count++;
      const curFee = calculateDynamicFeeForTransaction(count, 2, addrType, 20, 15000n);
      if (accum >= (targetSompi + curFee) || count >= 80) {
        break;
      }
    }
    const finalCount = Math.max(1, count);
    const rec = getRecommendedFees(finalCount, 2, addrType);

    return {
      inputsCount: finalCount,
      fees: {
        low: Number(sompiToKas(rec.lowFeeSompi)),
        normal: Number(sompiToKas(rec.normalFeeSompi)),
        fast: Number(sompiToKas(rec.fastFeeSompi)),
      },
    };
  }, [utxos, targetSompi, addrType]);

  const feeValuesKas = dynamicFeeInfo.fees;
  const selectedFee = feeValuesKas[feeSpeed];
  const maxBalanceKas = activeWallet ? sompiToKas(activeWallet.balanceSompi) : 0;

  const handleMaxClick = () => {
    if (!utxos || utxos.length === 0) {
      const maxSendable = Math.max(0, maxBalanceKas - selectedFee);
      const strVal = maxSendable > 0 ? maxSendable.toFixed(8).replace(/\.?0+$/, '') : '0';
      setAmountInput(strVal);
      openKeyboard({ value: strVal, onChange: setAmountInput, layoutName: 'numeric' });
      return;
    }

    // Up to 80 UTXOs
    const usableUtxos = utxos.slice(0, 80);
    const totalUtxoSompi = usableUtxos.reduce((sum, u) => sum + BigInt(u.amountSompi || 0), 0n);
    const rec = getRecommendedFees(usableUtxos.length, 1, addrType);
    const feeSompi = feeSpeed === 'low' ? rec.lowFeeSompi : feeSpeed === 'fast' ? rec.fastFeeSompi : rec.normalFeeSompi;
    const maxSendableSompi = totalUtxoSompi > feeSompi ? totalUtxoSompi - feeSompi : 0n;
    const maxSendableKas = sompiToKas(maxSendableSompi);
    const strVal = maxSendableKas > 0 ? maxSendableKas.toString() : '0';
    setAmountInput(strVal);
    openKeyboard({ value: strVal, onChange: setAmountInput, layoutName: 'numeric' });
  };

  const fiatEquivalent = (numericAmount * marketData.priceUsd * fiatRate).toFixed(2);

  const isFormValid =
    !activeWallet?.isWatchOnly &&
    !activeWallet?.isImportedKpub &&
    toAddress.trim().length > 0 &&
    !addressError &&
    numericAmount > 0 &&
    (numericAmount + selectedFee <= maxBalanceKas + 0.00000001);

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    closeKeyboard();
    setIsConfirmingStep(true);
  };

  const handleClose = () => {
    closeKeyboard();
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

  const handleBiometricSign = async () => {
    if (isAuthenticatingBiometrics || isSending) return;
    setIsAuthenticatingBiometrics(true);
    setPasswordError(null);
    try {
      const authRes = await authorizeSigningWithBiometrics();
      if (authRes.success && authRes.decryptedPassword) {
        showToast('Biometric authorization successful!', 'success');
        
        setIsSending(true);
        setTimeout(async () => {
          let mnemonicToUse: string | null = null;
          let passphraseToUse: string | undefined = undefined;

          try {
            if (activeWallet?.encryptedMnemonic) {
              mnemonicToUse = await decryptWithPassword(
                activeWallet.encryptedMnemonic.ciphertext,
                activeWallet.encryptedMnemonic.salt,
                activeWallet.encryptedMnemonic.iv,
                authRes.decryptedPassword!,
                buildAadContext('MNEMONIC', activeWallet.id)
              );
            } else {
              mnemonicToUse = activeWallet?.mnemonic || null;
            }

            if (activeWallet?.encryptedPassphrase) {
              passphraseToUse = await decryptWithPassword(
                activeWallet.encryptedPassphrase.ciphertext,
                activeWallet.encryptedPassphrase.salt,
                activeWallet.encryptedPassphrase.iv,
                authRes.decryptedPassword!,
                buildAadContext('PASSPHRASE', activeWallet.id)
              );
            } else if (passphraseInput) {
              passphraseToUse = passphraseInput;
            } else {
              passphraseToUse = activeWallet?.passphrase || undefined;
            }

            if (!mnemonicToUse) {
              setPasswordError('Biometric decryption error: Wallet key decryption failed.');
              showToast('Biometric decryption error: Wallet key decryption failed.', 'error');
              setIsSending(false);
              return;
            }

            const res = await sendKaspa(
              toAddress,
              numericAmount,
              selectedFee,
              note,
              mnemonicToUse,
              passphraseToUse,
              selectedUtxoOutpoints.length > 0 ? selectedUtxoOutpoints : undefined
            );

            if (res.success) {
              setSuccessTx({
                txid: res.txid || 'kaspa-txid',
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
              setPasswordInput('');
              setPassphraseInput('');
              setPasswordError(null);
              showToast('Transaction successfully broadcast!', 'success');
            } else {
              showToast(res.error || 'Failed to broadcast transaction', 'error');
            }
          } catch (err: any) {
            showToast(err.message || 'Biometric authorization failed', 'error');
          } finally {
            setIsSending(false);
          }
        }, 100);

      } else if (!authRes.success && authRes.error) {
        showToast(authRes.error, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Biometric authentication failed', 'error');
    } finally {
      setIsAuthenticatingBiometrics(false);
    }
  };

  const handleExecuteSend = async () => {
    closeKeyboard();
    setPasswordError(null);

    if (isPasswordEnabled) {
      if (passwordInput.length < 8) {
        setPasswordError('Please enter your wallet password (min 8 chars)');
        showToast('Please enter your wallet password (min 8 chars)', 'error');
        return;
      }
    }

    setIsSending(true);

    setTimeout(async () => {
      let mnemonicToUse: string | null = null;
      let passphraseToUse: string | undefined = undefined;

      try {
        mnemonicToUse = await getMnemonicForSigning();
        passphraseToUse = await getPassphraseForSigning();

        if (!mnemonicToUse) {
          if (isPasswordEnabled && activeWallet?.encryptedMnemonic) {
            setPasswordError('Incorrect wallet password. Decryption failed.');
            showToast('Incorrect wallet password. Decryption failed.', 'error');
          } else {
            showToast('Wallet key not found. Please unlock or re-import the wallet.', 'error');
          }
          setIsSending(false);
          return;
        }

        const res = await sendKaspa(
          toAddress,
          numericAmount,
          selectedFee,
          note,
          mnemonicToUse,
          passphraseToUse,
          selectedUtxoOutpoints.length > 0 ? selectedUtxoOutpoints : undefined
        );

        if (res.success) {
          setSuccessTx({
            txid: res.txid || 'kaspa-txid',
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
          setPasswordInput('');
          setPassphraseInput('');
          setPasswordError(null);
        } else {
          showToast(res.error || 'Failed to send Kaspa', 'error');
        }
      } catch (err: any) {
        showToast(err?.message || 'Failed to execute transaction', 'error');
      } finally {
        setIsSending(false);
        // --------------------------------------------------------
        // ALWAYS wipe application-managed sensitive references
        // --------------------------------------------------------
        mnemonicToUse = null;
        passphraseToUse = undefined;
      }
    }, 50);
  };

  if (!isSendOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-3xl mx-auto h-full flex flex-col p-6 overflow-y-auto no-scrollbar pt-safe pb-safe"
        style={{ paddingBottom: isKeyboardOpen ? '220px' : '' }}
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
                {successTx ? 'Transaction Success' : isConfirmingStep ? 'Sign & Broadcast' : 'Send Kaspa'}
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
            <div className="p-2.5 rounded-xl bg-[#0B151E] text-center shadow-inner">
              <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">
                Amount Transferred
              </div>
              <div className="text-xl font-black font-mono text-slate-100 tracking-tight flex items-baseline justify-center gap-1">
                <span className="text-rose-400">-</span>
                <span>{successTx.amountKas.toLocaleString('en-US', { maximumFractionDigits: 8 })}</span>
                <span className="text-xs font-extrabold text-[#70C7BA]">KAS</span>
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
                    This wallet is in Watch-Only mode. Sending Kaspa and signing transactions are disabled because no private key exists for this address.
                  </p>
                </div>
              </div>
            )}
            {/* Recipient Address */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  Recipient Kaspa Address
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          const trimmed = text.trim();
                          handleAddressChange(trimmed);
                          openKeyboard({ value: trimmed, onChange: handleAddressChange });
                          showToast('Address pasted from clipboard!', 'success');
                          return;
                        }
                      }
                      openKeyboard({ value: toAddress, onChange: handleAddressChange });
                    } catch (e) {
                      openKeyboard({ value: toAddress, onChange: handleAddressChange });
                    }
                  }}
                  className="text-[10px] text-[#70C7BA] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>

              {/* Contact Selector Dropdown */}
              {contacts && contacts.length > 0 && (
                <div className="mb-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddressChange(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="w-full bg-[#0B151E] border border-[#273E54] rounded-xl px-3 py-1.5 text-[11px] text-slate-300 outline-none focus:border-[#70C7BA] cursor-pointer"
                  >
                    <option value="" disabled>Select from saved contacts...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.address}>
                        {c.name} ({shortenAddress(c.address)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <input
                type="text"
                placeholder={`kaspa:q...`}
                value={toAddress}
                onFocus={() => openKeyboard({ value: toAddress, onChange: handleAddressChange })}
                onClick={() => openKeyboard({ value: toAddress, onChange: handleAddressChange })}
                inputMode="none" onChange={() => {}}
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
                  onFocus={() => openKeyboard({ value: amountInput, onChange: setAmountInput, layoutName: 'numeric', type: 'number' })}
                  onClick={() => openKeyboard({ value: amountInput, onChange: setAmountInput, layoutName: 'numeric', type: 'number' })}
                  inputMode="none" onChange={() => {}}
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
              {dynamicFeeInfo.inputsCount > 1 && (
                <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0B151E] border border-[#273E54] text-[9px] text-slate-300 font-medium">
                  <Layers className="w-3 h-3 text-[#70C7BA] shrink-0" />
                  <span>Consolidating {dynamicFeeInfo.inputsCount} UTXOs to fund this payment</span>
                </div>
              )}
            </div>

            {/* Coin Control & UTXO Privacy Management */}
            <div className="rounded-xl border border-[#273E54] bg-[#0B151E]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCoinControl(!showCoinControl)}
                className="w-full p-2.5 flex items-center justify-between text-left hover:bg-[#1C2F42]/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#70C7BA]" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-200 block">
                      Coin Control & UTXO Privacy
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {selectedUtxoOutpoints.length > 0
                        ? `Manual Selection: ${selectedUtxoOutpoints.length} UTXO(s)`
                        : `Auto-Selection (${(utxos || []).length} available, ${(activeWallet?.lockedUtxoOutpoints || []).length} frozen)`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedUtxoOutpoints.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#70C7BA]/20 text-[#70C7BA] font-bold">
                      Custom
                    </span>
                  )}
                  {showCoinControl ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {showCoinControl && (
                <div className="p-2.5 border-t border-[#273E54] space-y-2 bg-[#090D12]">
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>Select specific UTXOs or freeze unlinked outputs:</span>
                    {selectedUtxoOutpoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedUtxoOutpoints([])}
                        className="text-[#70C7BA] hover:underline font-semibold"
                      >
                        Reset to Auto
                      </button>
                    )}
                  </div>

                  {(!utxos || utxos.length === 0) ? (
                    <p className="text-[10px] text-slate-500 italic py-1">No spendable UTXOs indexed yet.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                      {utxos.map((u) => {
                        const outpoint = `${u.txid}:${u.vout}`;
                        const isLocked = (activeWallet?.lockedUtxoOutpoints || []).includes(outpoint);
                        const isSelected = selectedUtxoOutpoints.includes(outpoint);
                        const uAmtKas = sompiToKas(u.amountSompi);

                        return (
                          <div
                            key={outpoint}
                            className={`p-2 rounded-lg border text-[10px] flex items-center justify-between gap-2 transition-all ${
                              isSelected
                                ? 'bg-[#70C7BA]/10 border-[#70C7BA]/50'
                                : isLocked
                                ? 'bg-rose-950/20 border-rose-800/30 opacity-60'
                                : 'bg-[#0B151E] border-[#273E54]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isLocked}
                                onChange={() => {
                                  setSelectedUtxoOutpoints((prev) =>
                                    prev.includes(outpoint)
                                      ? prev.filter((o) => o !== outpoint)
                                      : [...prev, outpoint]
                                  );
                                }}
                                className="accent-[#70C7BA] rounded cursor-pointer"
                              />
                              <div className="truncate">
                                <div className="font-mono text-slate-200 font-bold truncate">
                                  {shortenAddress(u.txid, 6, 4)}:{u.vout}
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono truncate">
                                  {shortenAddress(u.address, 6, 4)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold text-[#70C7BA]">
                                {uAmtKas.toFixed(4)} KAS
                              </span>
                              <button
                                type="button"
                                title={isLocked ? 'Unlock / Unfreeze UTXO' : 'Freeze UTXO (prevent auto-spending)'}
                                onClick={() => toggleLockUtxo(outpoint)}
                                className={`p-1 rounded ${
                                  isLocked
                                    ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                                    : 'bg-[#1C2F42] text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {isLocked ? <Lock className="w-3 h-3 text-rose-400" /> : <Unlock className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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
                inputMode="none" onChange={() => {}}
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
                <p className="font-bold text-slate-200">Zero-Storage RAM Engine</p>
                <p className="leading-normal">
                  Your wallet keys remain encrypted at rest. On-the-fly decryption occurs purely in ephemeral RAM to sign this transaction, then is immediately wiped.
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
                inputMode="none" onChange={() => {}}
                placeholder="Enter passphrase if set during creation..."
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#090D12]  focus:border-[#70C7BA] text-[11px] font-mono text-slate-100 outline-none transition-colors"
              />
            </div>

            {/* Wallet Password Lock if enabled */}
            {isPasswordEnabled && (
              <div className="p-2.5 rounded-xl bg-[#0B151E] space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                  Wallet Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password to sign"
                    value={passwordInput}
                    onFocus={() => openKeyboard({ value: passwordInput, onChange: handlePasswordChange })}
                    onClick={() => openKeyboard({ value: passwordInput, onChange: handlePasswordChange })}
                    inputMode="none" onChange={() => {}}
                    className={`w-full px-3 py-2 rounded-lg bg-[#090D12] ${passwordError ? 'border border-rose-500' : 'focus:border-[#70C7BA]'} text-sm text-slate-100 outline-none transition-colors pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isBiometricsEnabled && (
                  <button
                    type="button"
                    onClick={handleBiometricSign}
                    disabled={isSending || isAuthenticatingBiometrics}
                    className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer mt-1"
                  >
                    <Fingerprint className="w-3.5 h-3.5 text-[#70C7BA]" />
                    <span>Tap to unlock with Biometrics</span>
                  </button>
                )}
              </div>
            )}

            {/* Live Verification Status Banner */}
            <div
              className={`p-2.5 rounded-xl border text-[10px] font-bold flex flex-col gap-1 ${
                isPasswordEnabled
                  ? isSending
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : passwordError
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : passwordInput.length < 8
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isPasswordEnabled ? (
                  isSending ? (
                    <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : passwordError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : passwordInput.length < 8 ? (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="leading-snug">
                  {isPasswordEnabled
                    ? isSending
                      ? 'Decrypting wallet credentials in RAM & broadcasting...'
                      : passwordError
                      ? passwordError
                      : passwordInput.length < 8
                      ? 'Please enter your wallet password (min 8 chars)'
                      : 'Password entered. Click below to sign & broadcast.'
                    : 'Unprotected mode. Secure in-memory keys ready for signing.'}
                </span>
              </div>
            </div>

            {/* Back & Broadcast Buttons */}
            <div className="flex flex-col gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleExecuteSend}
                disabled={isSending || (isPasswordEnabled && passwordInput.length < 8)}
                className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
                  !isSending && (!isPasswordEnabled || passwordInput.length >= 8)
                    ? 'bg-[#70C7BA] hover:bg-[#5eead4] text-[#0B151E] shadow-lg shadow-[#70C7BA]/20 cursor-pointer active:scale-[0.99]'
                    : 'bg-[#1C2F42] text-slate-500 cursor-not-allowed shadow-none'
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
                onClick={() => {
                  closeKeyboard();
                  setIsConfirmingStep(false);
                }}
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
