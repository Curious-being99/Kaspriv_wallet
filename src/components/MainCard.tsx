import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { formatKas, shortenAddress, sompiToKas } from '../utils/kaspa';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

export const MainCard: React.FC = () => {
  const {
    activeWallet,
    marketData,
    currency,
    fiatRate,
    isBalanceVisible,
    setIsBalanceVisible,
  } = useWallet();

  const kasAmount = sompiToKas(activeWallet.balanceSompi);
  const fiatValue = (kasAmount * marketData.priceUsd * fiatRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mx-auto px-4 py-3"
    >
      <div>
        {/* Top Toggle Bar */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setIsBalanceVisible(!isBalanceVisible)}
            className="p-1.5 rounded-lg bg-[#090D12] text-slate-400 hover:text-[#70C7BA] transition-colors"
            title={isBalanceVisible ? "Hide Balance" : "Show Balance"}
          >
            {isBalanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Balance Display */}
        <div className="text-center mb-5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="text-[11px] uppercase tracking-wider text-[#70C7BA] font-black">
              {activeWallet.addressType || 'Total Balance'}
            </div>
            {(activeWallet.isWatchOnly || activeWallet.isImportedKpub) && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider border border-amber-500/30">
                Watch-Only
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <h1 className="text-4xl font-black text-slate-100 font-mono tracking-tight">
              {isBalanceVisible ? formatKas(activeWallet.balanceSompi, 2) : '••••••'}
            </h1>
            <span className="text-xl font-black text-[#70C7BA]">KAS</span>
          </div>

          {/* Fiat Conversion */}
          <div className="mt-1 text-slate-400 text-sm font-semibold">
            ≈ {currency === 'BTC' ? '₿' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}
            {isBalanceVisible ? fiatValue : '••.••'} {currency}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
