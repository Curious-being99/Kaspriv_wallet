import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { Layers, X, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

export const CompoundUtxoModal: React.FC = () => {
  const { utxos, activeWallet, isCompoundOpen, setIsCompoundOpen, compoundUtxos, showToast } = useWallet();
  const [isCompounding, setIsCompounding] = useState(false);

  if (!isCompoundOpen) return null;

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
        className="w-full    bg-[#090D12]   p-6 text-slate-100 relative overflow-y-auto no-scrollbar"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#212B38]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">UTXO Compounder</h3>
          </div>
          <button
            onClick={() => setIsCompoundOpen(false)}
            className="p-2 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="p-4 rounded-2xl bg-[#090D12]  space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Current Active UTXOs</span>
              <span className="font-mono font-bold text-slate-100">{Math.max(1, utxos.length)} Fragmented Outputs</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Consolidated Output</span>
              <span className="font-mono font-bold text-[#70C7BA]">1 Consolidated UTXO</span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-[#212B38]">
              <span className="text-slate-400">Compound Network Fee</span>
              <span className="font-mono text-amber-300">0.005 KAS</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Kaspa's high block rate can generate many unspent transaction outputs (UTXOs). Compounding merges smaller outputs into a single UTXO, keeping your future transactions fast and low-fee.
          </p>

          <button
            onClick={handleExecuteCompound}
            disabled={isCompounding}
            className="w-full py-3.5 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-bold text-sm transition-all shadow-lg shadow-[#70C7BA]/20 active:scale-95 disabled:opacity-50"
          >
            {isCompounding ? 'Merging UTXOs...' : 'Compound UTXOs Now'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
