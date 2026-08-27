import React, { useState, useMemo } from 'react';
import { useWallet } from '../context/WalletContext';
import { formatKas, shortenAddress, sompiToKas } from '../utils/kaspa';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

export const MainCard: React.FC = () => {
  const {
    activeWallet,
    wallets,
    marketData,
    currency,
    fiatRate,
    isBalanceVisible,
    setIsBalanceVisible,
    utxos,
    currentDaaScore,
  } = useWallet();

  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Calculate spendable and pending balances dynamically based on 5 confirmations requirement
  const { spendableSompi, pendingSompi } = useMemo(() => {
    if (!activeWallet) {
      return { spendableSompi: 0n, pendingSompi: 0n };
    }
    if (!utxos) {
      return { spendableSompi: activeWallet.balanceSompi, pendingSompi: 0n };
    }

    let spendable = 0n;
    let pending = 0n;

    for (const u of utxos) {
      const amount = u.amountSompi;
      
      // If it is our own change address UTXO, it is immediately spendable
      if (activeWallet.changeAddress && u.address?.trim().toLowerCase() === activeWallet.changeAddress.trim().toLowerCase()) {
        spendable += amount;
        continue;
      }

      const confs = currentDaaScore - Number(u.blockDaaScore || 0);

      if (u.isCoinbase) {
        if (confs >= 100) {
          spendable += amount;
        } else {
          pending += amount;
        }
      } else {
        if (confs >= 1) {
          spendable += amount;
        } else {
          pending += amount;
        }
      }
    }

    return { spendableSompi: spendable, pendingSompi: pending };
  }, [utxos, currentDaaScore, activeWallet]);

  if (!activeWallet || activeWallet.id === 'dummy') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-xl mx-auto rounded-3xl border border-slate-800 bg-slate-900/40 p-12 backdrop-blur-md flex flex-col items-center justify-center space-y-4"
      >
        <div className="w-10 h-10 border-4 border-[#70C7BA]/20 border-t-[#70C7BA] rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {wallets.length > 0 ? 'Decrypting Session...' : 'Preparing Secure Vault...'}
        </p>
      </motion.div>
    );
  }

  const spendableKas = sompiToKas(spendableSompi);
  const totalSompi = spendableSompi + pendingSompi;
  const totalKas = sompiToKas(totalSompi);

  const totalFiatValue = (totalKas * marketData.priceUsd * fiatRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const availableFiatValue = (spendableKas * marketData.priceUsd * fiatRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const pendingKas = sompiToKas(pendingSompi);
  const pendingFiatValue = (pendingKas * marketData.priceUsd * fiatRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xl mx-auto rounded-3xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#70C7BA]/5 rounded-full filter blur-3xl -mr-20 -mt-20 pointer-events-none" />

      <div className="flex flex-col items-center text-center relative z-10">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
          Total Balance
        </div>

        <div className="flex flex-col items-center mt-2 w-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xs text-slate-400 font-semibold bg-slate-950/60 px-3.5 py-1.5 rounded-full border border-slate-800">
              {shortenAddress(activeWallet.receiveAddress)}
            </span>
            <button
              onClick={() => handleCopy(activeWallet.receiveAddress)}
              className="p-2 rounded-xl bg-slate-950/40 border border-slate-800 hover:bg-slate-950 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {copiedText === activeWallet.receiveAddress ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} />
              )}
            </button>
            <button
              onClick={() => setIsBalanceVisible(!isBalanceVisible)}
              className="p-2 rounded-xl bg-slate-950/40 border border-slate-800 hover:bg-slate-950 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {isBalanceVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <h1 className="text-4xl font-black text-slate-100 font-mono tracking-tight">
              {isBalanceVisible ? formatKas(totalSompi, 2) : '••••••'}
            </h1>
            <span className="text-xl font-black text-[#70C7BA]">KAS</span>
          </div>

          {/* Fiat Conversion */}
          <div className="mt-1 text-slate-400 text-sm font-semibold">
            ≈ {currency === 'BTC' ? '₿' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}
            {isBalanceVisible ? totalFiatValue : '••.••'} {currency}
          </div>

          {/* Horizontal Split Metric Panel */}
          <div className="w-full border-t border-slate-800/50 mt-6 pt-5" />

          <div className="grid grid-cols-2 gap-4 w-full">
            {/* Available Column */}
            <div className="text-center border-r border-slate-800/40">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Available
              </div>
              <div className="font-mono font-bold text-[#70C7BA] text-lg">
                {isBalanceVisible ? formatKas(spendableSompi, 2) : '••••••'} <span className="text-xs text-[#70C7BA]/70">KAS</span>
              </div>
              <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                ≈ {currency === 'BTC' ? '₿' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}{isBalanceVisible ? availableFiatValue : '••.••'}
              </div>
            </div>

            {/* Pending Column */}
            <div className="text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Pending
              </div>
              <div className={`font-mono font-bold text-lg ${pendingSompi > 0n ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
                {isBalanceVisible ? formatKas(pendingSompi, 2) : '••••••'} <span className="text-xs text-slate-500/70">KAS</span>
              </div>
              <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                ≈ {currency === 'BTC' ? '₿' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}{isBalanceVisible ? pendingFiatValue : '••.••'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
