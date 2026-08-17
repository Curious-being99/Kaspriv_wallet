import React from 'react';
import { useWallet } from '../context/WalletContext';
import { Server, Hash, Activity } from 'lucide-react';
import { formatKas } from '../utils/kaspa';

export const IndexingOverlay: React.FC = () => {
  const { indexingState, isLocked } = useWallet();

  if (!indexingState || !indexingState.isIndexing || isLocked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#05080A] flex flex-col items-center justify-between p-6 sm:p-10 select-none pointer-events-auto overflow-y-auto">
      <div className="w-full max-w-md mx-auto my-auto flex flex-col items-center text-center space-y-8 py-6">
        {/* Title & Subtitle */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#70C7BA]/10 text-[#70C7BA] text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-[#70C7BA] animate-pulse" />
            Live BlockDAG Syncing
          </div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
            Scanning Kaspa Chain
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Checking real on-chain balances across HD derivation paths...
          </p>
        </div>

        {/* Discovered Balance */}
        <div className="w-full bg-[#080C10] p-4 rounded-2xl border border-[#16212E] flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-1">
            Discovered On-Chain Balance
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white font-mono tracking-tighter">
              {formatKas(indexingState.balanceSompi, 2)}
            </span>
            <span className="text-lg font-bold text-[#70C7BA]">KAS</span>
          </div>
        </div>

        {/* Address Stats */}
        <div className="w-full grid grid-cols-2 gap-4">
          <div className="bg-[#080C10] p-4 rounded-2xl border border-[#16212E] flex flex-col items-center">
            <span className="text-2xl font-mono font-bold text-slate-100">
              {indexingState.scannedAddresses}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1 flex items-center gap-1">
              <Hash className="w-3 h-3 text-[#70C7BA]" /> Addresses Scanned
            </span>
          </div>

          <div className="bg-[#080C10] p-4 rounded-2xl border border-[#16212E] flex flex-col items-center">
            <span className="text-2xl font-mono font-bold text-emerald-400">
              {indexingState.foundAddresses}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" /> Active Addresses
            </span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="w-full pt-2">
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 font-medium">
            <Server className="w-3.5 h-3.5 text-[#70C7BA] animate-spin" />
            <span>Connected to api.kaspa.org — Please wait until scan completes</span>
          </div>
        </div>
      </div>
    </div>
  );
};
