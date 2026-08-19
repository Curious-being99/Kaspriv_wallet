import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { formatKas, calculateDynamicFeeForTransaction } from '../utils/kaspa';
import { Layers, X, Zap } from 'lucide-react';
import { motion } from 'motion/react';

export const CompoundUtxoModal: React.FC = () => {
  const { utxos, activeWallet, isCompoundOpen, setIsCompoundOpen, compoundUtxos } = useWallet();
  const [isCompounding, setIsCompounding] = useState(false);

  if (!isCompoundOpen || !activeWallet) return null;

  // Filter out locked UTXOs
  const spendableUtxos = utxos.filter(
    (u) => !activeWallet.lockedUtxoOutpoints?.includes(`${u.txid}:${u.vout}`)
  );

  const utxosToCompound = spendableUtxos.slice(0, 80);
  const countToCompound = utxosToCompound.length;

  const totalInputSompi = utxosToCompound.reduce(
    (sum, u) => sum + BigInt(u.amountSompi || 0),
    0n
  );

  const addrType = activeWallet.addressType || (activeWallet.receiveAddress?.includes(':p') ? 'P2SH' : 'P2PKH');
  const feeSompi = countToCompound > 0
    ? calculateDynamicFeeForTransaction(countToCompound, 1, addrType, 25, 20000n)
    : 0n;

  const consolidatedSompi = totalInputSompi > feeSompi ? totalInputSompi - feeSompi : 0n;

  const handleExecuteCompound = async () => {
    setIsCompounding(true);
    try {
      const res = await compoundUtxos();
      if (res.success) {
        setIsCompoundOpen(false);
      }
    } finally {
      setIsCompounding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-[#090D12] border border-[#212B38] rounded-3xl p-6 text-slate-100 relative overflow-y-auto no-scrollbar shadow-2xl"
      >
        <div className="sticky top-0 bg-[#090D12] z-30 pb-4 -mt-6 -mx-6 px-6 pt-6 flex items-center justify-between border-b border-[#212B38]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="text-base font-black">UTXO Compounder</h3>
              <p className="text-[11px] text-slate-400">Optimize UTXO inputs & reduce network fees</p>
            </div>
          </div>
          <button
            onClick={() => setIsCompoundOpen(false)}
            className="p-2 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="p-4 rounded-2xl bg-[#0E131B] border border-[#1B232E] space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Inputs to Compound</span>
              <span className="font-mono font-bold text-slate-100">
                {countToCompound} Outputs {countToCompound >= 80 ? '(Max Batch)' : ''}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Input Sum</span>
              <span className="font-mono font-bold text-slate-200">
                {formatKas(totalInputSompi, 4)} KAS
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Network Relay Fee</span>
              <span className="font-mono font-bold text-amber-400">
                -{formatKas(feeSompi, 4)} KAS
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pt-2 border-t border-[#1B232E]/80">
              <span className="text-slate-300 font-bold">Consolidated Output</span>
              <span className="font-mono font-black text-sm text-[#70C7BA]">
                {formatKas(consolidatedSompi, 4)} KAS
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Kaspa's high block rate can generate many small unspent transaction outputs (UTXOs). Compounding merges up to 80 fragmented outputs into 1 clean UTXO output to keep future sends fast and low-fee.
          </p>

          <button
            onClick={handleExecuteCompound}
            disabled={isCompounding || countToCompound < 2 || consolidatedSompi <= 0n}
            className="w-full py-3.5 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-black text-sm transition-all shadow-lg shadow-[#70C7BA]/20 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isCompounding
              ? 'Merging UTXOs...'
              : countToCompound < 2
              ? 'Minimum 2 UTXOs Required'
              : `Compound ${countToCompound} UTXOs Now`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
