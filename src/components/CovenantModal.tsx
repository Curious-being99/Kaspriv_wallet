import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { shortenAddress, sompiToKas, getKaspaExplorerUrl, getCovenantExplorerLinks, getCovenantAddressAndScript } from '../utils/kaspa';
import { decryptWithPassword } from '../utils/crypto';
import { Lock, X, Sparkles, Code2, FileCheck, Layers, ShieldAlert, ExternalLink, Trash2, RefreshCw, Activity, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { CovenantActivityTimeline } from './CovenantActivityTimeline';

export const CovenantModal: React.FC = () => {
  const {
    isCovenantOpen,
    setIsCovenantOpen,
    activeWallet,
    sendKaspa,
    showToast,
    deployedCovenants,
    addCovenant,
    claimCovenant,
    currentDaaScore,
    isPasswordEnabled,
    password,
    isSyncingCovenants,
    syncCovenantsOnChain,
  } = useWallet();

  useEffect(() => {
    if (isCovenantOpen) {
      syncCovenantsOnChain();
    }
  }, [isCovenantOpen, syncCovenantsOnChain]);

  const { openKeyboard } = useVirtualKeyboard();

  const [mainTab, setMainTab] = useState<'create' | 'activity'>('create');
  const [actionType, setActionType] = useState<'deploy' | 'write'>('deploy');
  const [covenantType, setCovenantType] = useState<'timelock' | 'deadmanswitch' | 'multisig'>('timelock');
  const [targetAddress, setTargetAddress] = useState('');
  const [amountKas, setAmountKas] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [minSigners, setMinSigners] = useState('2');
  const [providedSeed, setProvidedSeed] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isClaiming, setIsClaiming] = useState<Record<string, boolean>>({});

  // Write Form State
  const [writeType, setWriteType] = useState('Timelock Vault');
  const [writeAmount, setWriteAmount] = useState('');
  const [writeAddress, setWriteAddress] = useState('');
  const [writeTxid, setWriteTxid] = useState('');
  const [writeDaaLock, setWriteDaaLock] = useState('');
  const [writeRedeemScript, setWriteRedeemScript] = useState('');
  const [writeGenesisInputTxId, setWriteGenesisInputTxId] = useState('');
  const [writeGenesisInputIndex, setWriteGenesisInputIndex] = useState('0');
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  useEffect(() => {
    if (isCovenantOpen && activeWallet) {
      if (activeWallet.mnemonic) {
        setProvidedSeed(activeWallet.mnemonic);
      }
    } else {
      setProvidedSeed('');
      setPasswordInput('');
    }
  }, [isCovenantOpen, activeWallet]);

  const handleClaim = async (covenantId: string) => {
    setIsClaiming((prev) => ({ ...prev, [covenantId]: true }));
    const result = await claimCovenant(covenantId);
    setIsClaiming((prev) => ({ ...prev, [covenantId]: false }));
    if (!result.success) {
      showToast(result.error || 'Failed to claim covenant', 'error');
    }
  };

  const handleWriteCovenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(writeAmount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid KAS amount', 'error');
      return;
    }

    if (!writeAddress.trim()) {
      showToast('Please specify a valid Covenant script hash address', 'error');
      return;
    }

    if (!writeTxid.trim()) {
      showToast('Please specify a valid Genesis Transaction ID', 'error');
      return;
    }

    setIsSavingCustom(true);

    try {
      addCovenant({
        type: writeType,
        amount: `${parsedAmount.toFixed(2)} KAS`,
        scriptHash: writeAddress.trim(),
        txid: writeTxid.trim(),
        daaLock: parseInt(writeDaaLock) || 0,
        redeemScriptHex: writeRedeemScript.trim() || undefined,
        genesisInputTxId: writeGenesisInputTxId.trim() || undefined,
        genesisInputIndex: writeGenesisInputIndex ? parseInt(writeGenesisInputIndex) : undefined,
      });

      showToast('Covenant registered successfully in local storage!', 'success');
      setWriteAmount('');
      setWriteAddress('');
      setWriteTxid('');
      setWriteDaaLock('');
      setWriteRedeemScript('');
      setWriteGenesisInputTxId('');
      setWriteGenesisInputIndex('0');
    } catch (err: any) {
      showToast(err.message || 'Error saving custom covenant', 'error');
    } finally {
      setIsSavingCustom(false);
    }
  };

  if (!isCovenantOpen) return null;

  // Format to dd/mm/yyyy display
  const formatToDdMmYyyy = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  // Compute calculated block DAA delta based on date selection (Kaspa mainnet ~1 block/sec)
  const getCalculatedDelta = () => {
    if (!lockDate) return 0;
    const selectedTime = new Date(lockDate).getTime();
    const nowTime = Date.now();
    const deltaSeconds = Math.max(0, Math.floor((selectedTime - nowTime) / 1000));
    return deltaSeconds; // 1 block per second
  };

  const calculatedDelta = getCalculatedDelta();

  const handleCreateCovenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountKas);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid KAS amount', 'error');
      return;
    }

    const availableKas = sompiToKas(activeWallet.balanceSompi);
    if (parsedAmount > availableKas) {
      showToast('Amount exceeds available Kaspa balance', 'error');
      return;
    }

    if (covenantType === 'deadmanswitch' && !targetAddress.trim()) {
      showToast('Please specify a valid backup recipient address', 'error');
      return;
    }

    if (covenantType !== 'multisig' && !lockDate) {
      showToast('Please select a valid lock date', 'error');
      return;
    }

    if (!activeWallet.mnemonic && !providedSeed.trim()) {
      showToast('Seed phrase required to sign covenant transaction', 'info');
      return;
    }

    setIsExecuting(true);

    try {
      let seedToUse = providedSeed.trim() || activeWallet.mnemonic || '';
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
              passphraseToUse = await decryptWithPassword(activeWallet.encryptedPassphrase.ciphertext, activeWallet.encryptedPassphrase.salt, activeWallet.encryptedPassphrase.iv, activePassword, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");
            }
          } catch (err) {
            showToast('Invalid password. Decryption failed.', 'error');
            setIsExecuting(false);
            return;
          }
        }
      }

      const lockDaaScore = covenantType === 'multisig' ? currentDaaScore : currentDaaScore + calculatedDelta;

      // Derive the real on-chain P2SH covenant address and its unique redeem script
      const { address: covAddress, redeemScriptHex } = getCovenantAddressAndScript(
        seedToUse,
        passphraseToUse,
        lockDaaScore,
        covenantType
      );

      const res = await sendKaspa(
        covAddress,
        parsedAmount,
        0.005,
        `Kaspa On-Chain Covenant (${covenantType.toUpperCase()})`,
        seedToUse,
        passphraseToUse
      );

      // Wipe sensitive variables from memory
      seedToUse = '';
      passphraseToUse = '';

      setIsExecuting(false);

      if (res.success) {
        const typeLabel = covenantType === 'timelock' 
          ? 'Timelock Vault' 
          : covenantType === 'deadmanswitch' 
          ? "Dead Man's Switch" 
          : 'Multi-Sig Covenant';

        addCovenant({
          type: typeLabel,
          amount: `${parsedAmount.toFixed(2)} KAS`,
          scriptHash: covAddress,
          txid: res.txid,
          daaLock: lockDaaScore,
          redeemScriptHex, // Store redeem script for spending
          genesisInputTxId: res.inputs?.[0]?.outpoint?.transactionId || res.inputs?.[0]?.outpoint?.transaction_id || res.inputs?.[0]?.transactionId || res.inputs?.[0]?.transaction_id,
          genesisInputIndex: res.inputs?.[0]?.outpoint?.index !== undefined ? res.inputs?.[0]?.outpoint?.index : (res.inputs?.[0]?.index !== undefined ? res.inputs?.[0]?.index : 0),
        });
        showToast(`${typeLabel} deployed on Kaspa BlockDAG!`, 'success');
        setAmountKas('');
        setLockDate('');
        setTargetAddress('');
        setProvidedSeed('');
      } else {
        showToast(res.error || 'Failed to deploy covenant transaction', 'error');
      }
    } catch (err: any) {
      setIsExecuting(false);
      showToast(err.message || 'Error generating covenant address', 'error');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-[#090D12] rounded-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar border border-[#212B38]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#212B38] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#70C7BA]/25 text-[#70C7BA] flex items-center justify-center font-bold">
                <Code2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">Kaspa On-Chain Covenant</h3>
                <p className="text-[11px] text-slate-400 font-medium">Smart Script Output Restrictions</p>
              </div>
            </div>
            <button
              onClick={() => setIsCovenantOpen(false)}
              className="p-2 rounded-xl bg-[#1A2330] hover:bg-[#212B38] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Notice Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
            <p className="font-semibold text-center">Covenant page for future updates</p>
          </div>

          {/* Main View Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#1A2330]">
            <button
              type="button"
              onClick={() => setMainTab('create')}
              className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mainTab === 'create'
                  ? 'bg-[#70C7BA] text-[#090D12] shadow-sm font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Deploy & Manage</span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab('activity')}
              className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mainTab === 'activity'
                  ? 'bg-[#70C7BA] text-[#090D12] shadow-sm font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Activity Timeline</span>
            </button>
          </div>

          {mainTab === 'activity' ? (
            <CovenantActivityTimeline />
          ) : (
            <>
              {/* Deploy New vs Write Parameters switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#1A2330]">
                <button
                  type="button"
                  onClick={() => setActionType('deploy')}
                  className={`py-1.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    actionType === 'deploy'
                      ? 'bg-[#70C7BA] text-[#090D12] font-extrabold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Deploy New</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('write')}
                  className={`py-1.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    actionType === 'write'
                      ? 'bg-[#70C7BA] text-[#090D12] font-extrabold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Write Covenant</span>
                </button>
              </div>

              {actionType === 'deploy' ? (
                <>
                  {/* Covenant Type Selector */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#090D12]">
                    <button
                      type="button"
                      onClick={() => setCovenantType('timelock')}
                      className={`py-2 text-[11px] font-bold rounded-xl transition-all ${
                        covenantType === 'timelock'
                          ? 'bg-[#70C7BA] text-[#090D12]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Timelock
                    </button>
                    <button
                      type="button"
                      onClick={() => setCovenantType('deadmanswitch')}
                      className={`py-2 text-[11px] font-bold rounded-xl transition-all ${
                        covenantType === 'deadmanswitch'
                          ? 'bg-[#70C7BA] text-[#090D12]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Dead Man's
                    </button>
                    <button
                      type="button"
                      onClick={() => setCovenantType('multisig')}
                      className={`py-2 text-[11px] font-bold rounded-xl transition-all ${
                        covenantType === 'multisig'
                          ? 'bg-[#70C7BA] text-[#090D12]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Multi-Sig
                    </button>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleCreateCovenant} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">
                        KAS Amount to Lock
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={amountKas}
                          onChange={(e) => setAmountKas(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-mono"
                          required
                        />
                        <span className="absolute right-3.5 top-3 text-xs font-bold text-[#70C7BA]">KAS</span>
                      </div>
                    </div>

                    {covenantType === 'timelock' && (
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1.5">
                          Lock Duration (Target Unlock Date)
                        </label>
                        <input
                          type="date"
                          value={lockDate}
                          onChange={(e) => setLockDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-sans"
                          required
                        />
                        {lockDate && (
                          <div className="text-[10px] text-slate-400 mt-1.5 font-medium flex flex-col gap-0.5 px-1 bg-[#090D12]/40 p-2 rounded-lg /30">
                            <div>Unlock Date: <strong className="text-slate-200">{formatToDdMmYyyy(lockDate)}</strong></div>
                            <div>Real-on-chain Lock Delta: <strong className="text-[#70C7BA] font-mono">+{calculatedDelta.toLocaleString()} blocks (seconds)</strong></div>
                          </div>
                        )}
                      </div>
                    )}

                    {covenantType === 'deadmanswitch' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-bold text-slate-300 block mb-1.5">
                            Inactivity Expiration Date (Trigger Date)
                          </label>
                          <input
                            type="date"
                            value={lockDate}
                            onChange={(e) => setLockDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-sans"
                            required
                          />
                          {lockDate && (
                            <div className="text-[10px] text-slate-400 mt-1.5 font-medium flex flex-col gap-0.5 px-1 bg-[#090D12]/40 p-2 rounded-lg /30">
                              <div>Trigger Date: <strong className="text-slate-200">{formatToDdMmYyyy(lockDate)}</strong></div>
                              <div>Real-on-chain Delta: <strong className="text-[#70C7BA] font-mono">+{calculatedDelta.toLocaleString()} blocks (seconds)</strong></div>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-300 block mb-1.5">
                            Backup Recipient Address
                          </label>
                          <input
                            type="text"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12]  focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {covenantType === 'multisig' && (
                      <div>
                        <label className="text-xs font-bold text-slate-300 block mb-1.5">
                          Required Threshold Signatures (M of 3)
                        </label>
                        <div className="relative space-y-1.5">
                          <button
                            type="button"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#090D12]  hover:border-[#70C7BA] focus:border-[#70C7BA] text-xs text-slate-100 font-bold cursor-pointer transition-all"
                          >
                            <span>{minSigners} of 3 Signatures</span>
                            <svg
                              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {isDropdownOpen && (
                            <div className="rounded-2xl  bg-[#090D12] overflow-hidden  z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  setMinSigners('2');
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer border-b border-[#212B38]/50 ${
                                  minSigners === '2' ? 'bg-[#70C7BA]/5' : ''
                                }`}
                              >
                                <span className="text-slate-100 font-extrabold text-xs italic tracking-wide">2 of 3 Signatures</span>
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                  minSigners === '2' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                                }`}>
                                  {minSigners === '2' && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                                  )}
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMinSigners('3');
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer ${
                                  minSigners === '3' ? 'bg-[#70C7BA]/5' : ''
                                }`}
                              >
                                <span className="text-slate-100 font-extrabold text-xs italic tracking-wide">3 of 3 Signatures</span>
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                  minSigners === '3' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                                }`}>
                                  {minSigners === '3' && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                                  )}
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isPasswordEnabled && !activeWallet.mnemonic && (
                      <div className="mt-4 space-y-1">
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
                      type="submit"
                      disabled={true}
                      className="w-full py-3.5 rounded-2xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-2 cursor-not-allowed opacity-50 mt-4"
                    >
                      <>
                        <Code2 className="w-4 h-4 stroke-[2.5]" />
                        <span>Deploy Covenant to Kaspa DAG</span>
                      </>
                    </button>
                  </form>
                </>
              ) : (
                /* Custom Write form */
                <form onSubmit={handleWriteCovenant} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Covenant Custom Type / Label
                    </label>
                    <select
                      value={writeType}
                      onChange={(e) => setWriteType(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] text-sm text-slate-100 outline-none focus:border-[#70C7BA]"
                    >
                      <option value="Timelock Vault">Timelock Vault</option>
                      <option value="Dead Man's Switch">Dead Man's Switch</option>
                      <option value="Multi-Sig Covenant">Multi-Sig Covenant</option>
                      <option value="Escrow Covenant">Escrow Covenant</option>
                      <option value="Vault with Next of Kin">Vault with Next of Kin</option>
                      <option value="Custom Covenant">Custom Covenant</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Locked KAS Amount
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. 50.0"
                        value={writeAmount}
                        onChange={(e) => setWriteAmount(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-mono"
                        required
                      />
                      <span className="absolute right-3.5 top-3 text-xs font-bold text-[#70C7BA]">KAS</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Covenant Script Address (kaspa:p...)
                    </label>
                    <input
                      type="text"
                      placeholder="kaspa:p..."
                      value={writeAddress}
                      onChange={(e) => setWriteAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Genesis Transaction ID (TxID)
                    </label>
                    <input
                      type="text"
                      placeholder="32-byte hex string"
                      value={writeTxid}
                      onChange={(e) => setWriteTxid(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Lock Target Block Height (DAA Score) <span className="text-slate-500 font-medium">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 12345678"
                      value={writeDaaLock}
                      onChange={(e) => setWriteDaaLock(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono"
                    />
                  </div>

                  <div className="p-3 bg-[#131B24]/50 border border-[#212B38] rounded-xl space-y-3">
                    <span className="text-[11px] font-bold text-slate-400 block border-b border-[#212B38] pb-1.5 uppercase tracking-wider">
                      Advanced KIP-20 Covenant ID Computation (Optional)
                    </span>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">
                        Redeem Script (Hex)
                      </label>
                      <input
                        type="text"
                        placeholder="Redeem Script Bytes"
                        value={writeRedeemScript}
                        onChange={(e) => setWriteRedeemScript(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-[11px] text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">
                          Input Previous Outpoint TxID
                        </label>
                        <input
                          type="text"
                          placeholder="Spent UTXO transaction hash"
                          value={writeGenesisInputTxId}
                          onChange={(e) => setWriteGenesisInputTxId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-[11px] text-slate-100 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">
                          Input Index
                      </label>
                        <input
                          type="text"
                          placeholder="e.g. 0"
                          value={writeGenesisInputIndex}
                          onChange={(e) => setWriteGenesisInputIndex(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-[11px] text-slate-100 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={true}
                    className="w-full py-3.5 rounded-2xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-2 cursor-not-allowed opacity-50 mt-4"
                  >
                    <>
                      <FileCheck className="w-4 h-4 stroke-[2.5]" />
                      <span>Save and Track Covenant</span>
                    </>
                  </button>
                </form>
              )}

              {/* Active Deployed Covenants List */}
              <div className="pt-3 border-t border-[#212B38] space-y-2">
                <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Active Deployed Covenants</span>
                    <button
                      type="button"
                      onClick={() => syncCovenantsOnChain()}
                      disabled={isSyncingCovenants}
                      className="p-1 text-[#70C7BA] hover:text-[#5db3a6] transition-colors rounded-lg hover:bg-[#70C7BA]/10 flex items-center gap-1 text-[10px] cursor-pointer disabled:opacity-50"
                      title="Scan Kaspa BlockDAG for active covenants on-chain"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingCovenants ? 'animate-spin' : ''}`} />
                      <span>{isSyncingCovenants ? 'Syncing...' : 'Sync On-Chain'}</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-[#70C7BA] font-mono">{deployedCovenants.length} Active</span>
                </h4>

                <div className="space-y-2">
                  {deployedCovenants.length === 0 ? (
                    <div className="text-center py-4 /50 rounded-2xl bg-[#090D12]/35 text-xs text-slate-500 italic">
                      No active covenants deployed. Create or write one above to get started!
                    </div>
                  ) : (
                    deployedCovenants.map((cov) => {
                      const links = getCovenantExplorerLinks(cov, activeWallet?.receiveAddress || '');
                      const isUnlocked = currentDaaScore >= cov.daaLock;
                      // Estimate unlock date from DAA score (1 block/sec)
                      const secondsToUnlock = cov.daaLock - currentDaaScore;
                      const unlockDateEstimated = new Date(Date.now() + secondsToUnlock * 1000);
                      
                      return (
                        <div key={cov.id} className="p-4 rounded-2xl bg-[#0B151E] border border-[#212B38] space-y-3 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{cov.type}</div>
                              <div className="text-lg font-black text-slate-100">{cov.amount}</div>
                            </div>
                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                              isUnlocked ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {isUnlocked ? 'Ready to Claim' : 'Locked on BlockDAG'}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 py-3 border-y border-[#212B38]/50">
                            <div>
                              <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Unlock Target</div>
                              <div className="text-xs font-mono text-slate-200">{cov.daaLock.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Estimated Date</div>
                              <div className="text-xs font-bold text-slate-200">
                                {isUnlocked ? 'Past Due' : unlockDateEstimated.toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <div className="flex items-center gap-2">
                              <a
                                href={links.streamAddressUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-[#1A2330] text-slate-400 hover:text-[#70C7BA] transition-colors"
                                title="View on Explorer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => handleClaim(cov.id)}
                                className="p-1.5 rounded-lg bg-[#1A2330] text-slate-400 hover:text-rose-400 transition-colors"
                                title="Remove Tracker"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            
                            <button
                              onClick={() => handleClaim(cov.id)}
                              disabled={isClaiming[cov.id]}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                isUnlocked 
                                  ? 'bg-[#70C7BA] text-[#090D12] shadow-lg shadow-[#70C7BA]/20 active:scale-95' 
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {isClaiming[cov.id] ? 'Processing...' : (isUnlocked ? 'Claim Funds' : 'Still Locked')}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
