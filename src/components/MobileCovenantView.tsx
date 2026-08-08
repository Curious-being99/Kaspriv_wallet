import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { shortenAddress, sompiToKas, getKaspaExplorerUrl, getCovenantExplorerLinks, getCovenantAddressAndScript, addressToScriptPublicKeyHex, kasToSompi, covenantIdManager, CovenantType } from '../utils/kaspa';
import { Buffer } from 'buffer';
import { Lock, Code2, FileCheck, Layers, ShieldAlert, ExternalLink, Trash2, RefreshCw, Activity, Sparkles, FileText, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { CovenantActivityTimeline } from './CovenantActivityTimeline';

export const MobileCovenantView: React.FC = () => {
  const {
    activeWallet,
    sendKaspa,
    showToast,
    deployedCovenants,
    addCovenant,
    claimCovenant,
    currentDaaScore,
    isSyncingCovenants,
    syncCovenantsOnChain,
  } = useWallet();
  const { openKeyboard } = useVirtualKeyboard();

  useEffect(() => {
    const timer = setTimeout(() => {
      syncCovenantsOnChain();
    }, 50);
    return () => clearTimeout(timer);
  }, [syncCovenantsOnChain]);

  const [mainTab, setMainTab] = useState<'create' | 'activity'>('create');
  const [actionType, setActionType] = useState<'deploy' | 'write'>('deploy');
  const [covenantType, setCovenantType] = useState<'timelock' | 'deadmanswitch' | 'multisig' | 'vault-next-of-kin' | 'standard'>('timelock');
  const [covenantId, setCovenantId] = useState('');
  const [targetAddress, setTargetAddress] = useState('');
  const [ownerPubKey, setOwnerPubKey] = useState('');
  const [heirPubKey, setHeirPubKey] = useState('');
  const [amountKas, setAmountKas] = useState('');
  const [lockDate, setLockDate] = useState('');
  const [minSigners, setMinSigners] = useState('2');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCovenantTypeDropdownOpen, setIsCovenantTypeDropdownOpen] = useState(false);
  const [isWriteTypeDropdownOpen, setIsWriteTypeDropdownOpen] = useState(false);
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
    let innerScript = new Uint8Array(0);
    const amountSompi = kasToSompi(parseFloat(amountKas) || 0);

    if (covenantType === 'vault-next-of-kin' && ownerPubKey && heirPubKey && amountKas) {
        // Parse hex strings into Uint8Arrays
        try {
          const ownerPubKeyBytes = Buffer.from(ownerPubKey, 'hex');
          const heirPubKeyBytes = Buffer.from(heirPubKey, 'hex');
          
          if (ownerPubKeyBytes.length === 32 && heirPubKeyBytes.length === 32) {
             innerScript = covenantIdManager.buildNextOfKinInnerScript(ownerPubKeyBytes, heirPubKeyBytes, 86400);
          }
        } catch (e) {
          console.error('Invalid public key hex:', e);
        }
    } else if (covenantType === 'standard' && ownerPubKey && amountKas) {
        // P2PK script is just: PUSH <pubkey> OP_CHECKSIG
        // This is simplified, for CovenantID calculation we need the scriptPubKey.
        // Assuming ownerPubKey is the pubkey
        const ownerPubKeyBytes = Buffer.from(ownerPubKey, 'hex');
        const script = new Uint8Array(34);
        script[0] = 0x20;
        script.set(ownerPubKeyBytes, 1);
        script[33] = 0xac;
        
        innerScript = script;
    } else if (covenantType === 'timelock' && amountKas) {
        innerScript = covenantIdManager.buildTimelockInnerScript(new Uint8Array(32), 86400);
    } else if (covenantType === 'deadmanswitch' && amountKas) {
        innerScript = covenantIdManager.buildDeadmansSwitchInnerScript(new Uint8Array(32), new Uint8Array(32), 86400);
    } else if (covenantType === 'multisig' && amountKas) {
        innerScript = covenantIdManager.buildMultisigInnerScript([new Uint8Array(32)], 2);
    }

    if (innerScript.length > 0 && amountSompi > 0n) {
      try {
        const cid = covenantIdManager.compute(
          CovenantType.P2SH,
          '0000000000000000000000000000000000000000000000000000000000000000', // txId
          0, // inputIndex
          [{ outIdx: 0, amount: amountSompi, scriptBytes: innerScript }]
        );
        setCovenantId(cid.slice(0, 16) + '...');
      } catch (e) {
        console.error('Failed to compute covenant ID:', e);
        setCovenantId('');
      }
    } else {
      setCovenantId('');
    }
  }, [covenantType, ownerPubKey, heirPubKey, amountKas]);

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

    setIsExecuting(true);

    try {
      const seedToUse = activeWallet.mnemonic || '';
      const lockDaaScore = covenantType === 'multisig' ? currentDaaScore : currentDaaScore + calculatedDelta;

      // Derive the real on-chain P2SH covenant address and its unique redeem script
      const { address: covAddress, redeemScriptHex } = getCovenantAddressAndScript(
        seedToUse,
        activeWallet.passphrase,
        lockDaaScore,
        covenantType
      );

      const res = await sendKaspa(
        covAddress,
        parsedAmount,
        0.005,
        `Kaspa On-Chain Covenant (${covenantType.toUpperCase()})`,
        seedToUse
      );

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
      } else {
        showToast(res.error || 'Failed to deploy covenant transaction', 'error');
      }
    } catch (err: any) {
      setIsExecuting(false);
      showToast(err.message || 'Error generating covenant address', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full space-y-4 py-2"
    >
      {/* 1. Header & Status Overview */}
      <div className="py-3.5 px-1 border-b border-[#212B38]/40 space-y-4">
        {/* Notice Banner */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
          <p className="font-semibold text-center">Covenant page for future updates</p>
        </div>

        <div className="flex items-center justify-between border-b border-[#212B38]/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#70C7BA]/25 text-[#70C7BA] flex items-center justify-center font-bold">
              <Code2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-100">Kaspa On-Chain Covenant</h3>
              <p className="text-[11px] text-slate-400 font-medium">Smart Script Output Restrictions</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-[#70C7BA]/20 text-[#70C7BA] uppercase tracking-wider font-mono">
            DAA SCORE: {currentDaaScore.toLocaleString()}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Covenants are smart contracts implemented natively on the Kaspa ledger using script output restrictions.
          Funds locked inside a covenant can only be spent or released if specific on-chain consensus rules (like temporal lock, multi-sig signatures, or inactivity thresholds) are successfully met.
        </p>
      </div>

      {/* 2. On-Chain Covenant Deployer */}
      <div className="py-3.5 px-1 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#70C7BA]" />
          <h3 className="text-sm font-extrabold text-slate-100">Deploy New Covenant</h3>
        </div>

        {/* Covenant Type Selector Dropdown */}
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">
            Covenant Type
          </label>
          <div className="relative space-y-1.5">
            <button
              type="button"
              onClick={() => setIsCovenantTypeDropdownOpen(!isCovenantTypeDropdownOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] hover:border-[#70C7BA] focus:border-[#70C7BA] text-xs text-slate-100 font-bold cursor-pointer transition-all"
            >
              <span>
                {covenantType === 'timelock'
                  ? 'Timelock Vault'
                  : covenantType === 'deadmanswitch'
                  ? "Dead Man's Switch"
                  : covenantType === 'vault-next-of-kin'
                  ? 'Next of Kin'
                  : 'Multi-Sig Covenant'}
              </span>
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isCovenantTypeDropdownOpen ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {isCovenantTypeDropdownOpen && (
              <div className="rounded-2xl border border-[#212B38] bg-[#090D12] overflow-hidden z-10 absolute left-0 right-0 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setCovenantType('timelock');
                    setIsCovenantTypeDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer border-b border-[#212B38]/50 ${
                    covenantType === 'timelock' ? 'bg-[#70C7BA]/5' : ''
                  }`}
                >
                  <span className="text-slate-100 font-extrabold text-xs tracking-wide">Timelock Vault</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    covenantType === 'timelock' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                  }`}>
                    {covenantType === 'timelock' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantType('deadmanswitch');
                    setIsCovenantTypeDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer border-b border-[#212B38]/50 ${
                    covenantType === 'deadmanswitch' ? 'bg-[#70C7BA]/5' : ''
                  }`}
                >
                  <span className="text-slate-100 font-extrabold text-xs tracking-wide">Dead Man's Switch</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    covenantType === 'deadmanswitch' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                  }`}>
                    {covenantType === 'deadmanswitch' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantType('vault-next-of-kin');
                    setIsCovenantTypeDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    covenantType === 'vault-next-of-kin' ? 'bg-[#70C7BA]/5' : ''
                  }`}
                >
                  <span className="text-slate-100 font-extrabold text-xs tracking-wide">Next of Kin</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    covenantType === 'vault-next-of-kin' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                  }`}>
                    {covenantType === 'vault-next-of-kin' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantType('multisig');
                    setIsCovenantTypeDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    covenantType === 'multisig' ? 'bg-[#70C7BA]/5' : ''
                  }`}
                >
                  <span className="text-slate-100 font-extrabold text-xs tracking-wide">Multi-Sig Covenant</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    covenantType === 'multisig' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                  }`}>
                    {covenantType === 'multisig' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCovenantType('standard');
                    setIsCovenantTypeDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    covenantType === 'standard' ? 'bg-[#70C7BA]/5' : ''
                  }`}
                >
                  <span className="text-slate-100 font-extrabold text-xs tracking-wide">Standard Wallet</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    covenantType === 'standard' ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                  }`}>
                    {covenantType === 'standard' && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
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
                inputMode="none"
                value={amountKas}
                onFocus={() => openKeyboard({ value: amountKas, onChange: setAmountKas, type: 'numeric' })}
                onChange={(e) => setAmountKas(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-mono"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-sans"
                required
              />
              {lockDate && (
                <div className="text-[10px] text-slate-400 mt-1.5 font-medium flex flex-col gap-0.5 px-1 bg-[#090D12]/40 p-2 rounded-lg border border-[#212B38]/30">
                  <div>Unlock Date: <strong className="text-slate-200">{formatToDdMmYyyy(lockDate)}</strong></div>
                  <div>Real-on-chain Lock Delta: <strong className="text-[#70C7BA] font-mono">+{calculatedDelta.toLocaleString()} blocks (seconds)</strong></div>
                </div>
              )}
            </div>
          )}

          {covenantType === 'vault-next-of-kin' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Owner Public Key (Hex)</label>
                <input type="text" inputMode="none" value={ownerPubKey} onFocus={() => openKeyboard({ value: ownerPubKey, onChange: setOwnerPubKey })} onChange={(e) => setOwnerPubKey(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Heir Public Key (Hex)</label>
                <input type="text" inputMode="none" value={heirPubKey} onFocus={() => openKeyboard({ value: heirPubKey, onChange: setHeirPubKey })} onChange={(e) => setHeirPubKey(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Lock Duration (Target Unlock Date)</label>
                <input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-sans" required />
              </div>
              <div className="p-3 rounded-xl bg-[#090D12] border border-[#212B38]">
                <label className="text-xs font-bold text-slate-400 block mb-1">Covenant ID (Real)</label>
                <div className="font-mono text-xs text-[#70C7BA] break-all">
                  {covenantId || 'Pending inputs...'}
                </div>
              </div>
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-sm text-slate-100 outline-none font-sans"
                  required
                />
                {lockDate && (
                  <div className="text-[10px] text-slate-400 mt-1.5 font-medium flex flex-col gap-0.5 px-1 bg-[#090D12]/40 p-2 rounded-lg border border-[#212B38]/30">
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
                  inputMode="none"
                  value={targetAddress}
                  onFocus={() => openKeyboard({ value: targetAddress, onChange: setTargetAddress })}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-xs text-slate-100 outline-none font-mono"
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
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] hover:border-[#70C7BA] focus:border-[#70C7BA] text-xs text-slate-100 font-bold cursor-pointer transition-all"
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
                  <div className="rounded-2xl border border-[#212B38] bg-[#090D12] overflow-hidden z-10">
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

          <button
            type="submit"
            disabled={true}
            className="w-full py-3.5 rounded-2xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
          >
            <>
              <Code2 className="w-4 h-4 stroke-[2.5]" />
              <span>Deploy Covenant to Kaspa DAG</span>
            </>
          </button>
        </form>
      </div>

      {/* 3. Track Custom Covenant */}
      <div className="py-3.5 px-1 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#70C7BA]" />
          <h3 className="text-sm font-extrabold text-slate-100">Track Custom Covenant</h3>
        </div>

        <form onSubmit={handleWriteCovenant} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Covenant Custom Type / Label
            </label>
            <div className="relative space-y-1.5">
              <button
                type="button"
                onClick={() => setIsWriteTypeDropdownOpen(!isWriteTypeDropdownOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#090D12] border border-[#212B38] hover:border-[#70C7BA] focus:border-[#70C7BA] text-xs text-slate-100 font-bold cursor-pointer transition-all"
              >
                <span>{writeType}</span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isWriteTypeDropdownOpen ? 'rotate-180' : ''}`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {isWriteTypeDropdownOpen && (
                <div className="rounded-2xl border border-[#212B38] bg-[#090D12] overflow-hidden z-10 absolute left-0 right-0 shadow-xl max-h-60 overflow-y-auto no-scrollbar">
                  {[
                    'Timelock Vault',
                    "Dead Man's Switch",
                    'Multi-Sig Covenant',
                    'Escrow Covenant',
                    'Next of Kin',
                    'Standard Wallet',
                    'Custom Covenant',
                  ].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setWriteType(t);
                        setIsWriteTypeDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3.5 hover:bg-[#090D12]/80 flex items-center justify-between text-left transition-colors cursor-pointer border-b border-[#212B38]/50 last:border-b-0 ${
                        writeType === t ? 'bg-[#70C7BA]/5' : ''
                      }`}
                    >
                      <span className="text-slate-100 font-extrabold text-xs tracking-wide">{t}</span>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        writeType === t ? 'border-[#70C7BA] bg-[#70C7BA]/10' : 'border-slate-600'
                      }`}>
                        {writeType === t && (
                          <div className="w-2.5 h-2.5 rounded-full bg-[#70C7BA]" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">
              Locked KAS Amount
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="none"
                placeholder="e.g. 50.0"
                value={writeAmount}
                onFocus={() => openKeyboard({ value: writeAmount, onChange: setWriteAmount, type: 'numeric' })}
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
              inputMode="none"
              placeholder="kaspa:p..."
              value={writeAddress}
              onFocus={() => openKeyboard({ value: writeAddress, onChange: setWriteAddress })}
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
              inputMode="none"
              placeholder="32-byte hex string"
              value={writeTxid}
              onFocus={() => openKeyboard({ value: writeTxid, onChange: setWriteTxid })}
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
              inputMode="none"
              placeholder="e.g. 12345678"
              value={writeDaaLock}
              onFocus={() => openKeyboard({ value: writeDaaLock, onChange: setWriteDaaLock, type: 'numeric' })}
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
                inputMode="none"
                placeholder="Redeem Script Bytes"
                value={writeRedeemScript}
                onFocus={() => openKeyboard({ value: writeRedeemScript, onChange: setWriteRedeemScript })}
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
                  inputMode="none"
                  placeholder="Spent UTXO transaction hash"
                  value={writeGenesisInputTxId}
                  onFocus={() => openKeyboard({ value: writeGenesisInputTxId, onChange: setWriteGenesisInputTxId })}
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
                  inputMode="none"
                  placeholder="e.g. 0"
                  value={writeGenesisInputIndex}
                  onFocus={() => openKeyboard({ value: writeGenesisInputIndex, onChange: setWriteGenesisInputIndex, type: 'numeric' })}
                  onChange={(e) => setWriteGenesisInputIndex(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#090D12] border border-[#212B38] focus:border-[#70C7BA] text-[11px] text-slate-100 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={true}
            className="w-full py-3.5 rounded-2xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
          >
            <>
              <FileCheck className="w-4 h-4 stroke-[2.5]" />
              <span>Save and Track Covenant</span>
            </>
          </button>
        </form>
      </div>

      {/* 4. Active Deployed Covenants */}
      <div className="py-3.5 px-1 border-b border-[#212B38]/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#70C7BA]" />
            <h3 className="text-sm font-extrabold text-slate-100">Active Deployed Covenants</h3>
          </div>
          <button
            type="button"
            onClick={() => syncCovenantsOnChain()}
            disabled={isSyncingCovenants}
            className="px-3 py-1 text-[#70C7BA] hover:text-[#5db3a6] transition-colors rounded-full bg-[#70C7BA]/10 flex items-center gap-1 text-[10px] cursor-pointer disabled:opacity-50 font-bold border border-[#70C7BA]/25"
            title="Scan Kaspa BlockDAG for active covenants on-chain"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingCovenants ? 'animate-spin' : ''}`} />
            <span>{isSyncingCovenants ? 'Syncing...' : 'Sync On-Chain'}</span>
          </button>
        </div>

        <div className="space-y-3">
          {deployedCovenants.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 italic">
              No active covenants deployed. Create or write one above to get started!
            </div>
          ) : (
            deployedCovenants.map((cov) => {
              const links = getCovenantExplorerLinks(cov, activeWallet?.receiveAddress || '');
              return (
                <div key={cov.id} className="p-3.5 rounded-2xl bg-[#090D12] border border-[#212B38]/60 text-xs space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-100">{cov.type}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#70C7BA] font-mono">{cov.amount}</span>
                      <button
                        onClick={() => handleClaim(cov.id)}
                        disabled={isClaiming[cov.id]}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete covenant from chain (Claim/Refund)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-[#090D12]/60 p-2 rounded-lg border border-[#212B38]/50">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <span className={`${currentDaaScore >= cov.daaLock ? 'text-[#70C7BA]' : 'text-amber-400'} font-bold`}>
                      {currentDaaScore >= cov.daaLock ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>

                  {/* Dedicated kaspa.stream Explorer Links */}
                  <div className="flex items-center gap-2 text-[10px] flex-wrap pt-0.5">
                    <span className="text-slate-500 font-medium">Covenant Address:</span>
                    <a
                      href={links.streamAddressUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                      title="View Covenant Address on kaspa.stream"
                    >
                      <span>{shortenAddress(links.address, 10, 6)}</span>
                      <ExternalLink className="w-3 h-3 text-cyan-400" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] flex-wrap">
                    <span className="text-slate-500 font-medium">Covenant ID:</span>
                    <span className="text-emerald-400 font-mono" title={cov.id.replace('cov-', '')}>{shortenAddress(cov.id.replace('cov-', ''), 10, 6)}</span>
                  </div>
                  {links.txid && (
                    <div className="flex items-center gap-2 text-[10px] flex-wrap">
                      <span className="text-slate-500 font-medium">Genesis Tx:</span>
                      <a
                        href={links.streamTxUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                        title="View Genesis Transaction on kaspa.stream"
                      >
                        <span>{shortenAddress(links.txid, 10, 6)}</span>
                        <ExternalLink className="w-3 h-3 text-cyan-400" />
                      </a>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2.5 border-t border-[#212B38]/50 mt-1.5 flex-wrap gap-2">
                    <span>Lock Score: {cov.daaLock.toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleClaim(cov.id)}
                        disabled={isClaiming[cov.id]}
                        className="px-2.5 py-1 rounded-lg bg-[#70C7BA]/10 hover:bg-[#70C7BA]/20 disabled:opacity-50 text-[#70C7BA] font-extrabold text-[9px] uppercase tracking-wide transition-all cursor-pointer border border-[#70C7BA]/20"
                      >
                        {isClaiming[cov.id] ? 'Reclaiming...' : 'Claim / Unlock'}
                      </button>
                      <span className="text-[#70C7BA] flex items-center gap-1 font-bold">
                        <FileCheck className="w-3.5 h-3.5" /> On-Chain
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Covenant Activity Timeline */}
      <div className="py-3.5 px-1 space-y-4 mb-8">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#70C7BA]" />
          <h3 className="text-sm font-extrabold text-slate-100">Covenant Activity Timeline</h3>
        </div>
        <CovenantActivityTimeline />
      </div>
    </motion.div>
  );
};
