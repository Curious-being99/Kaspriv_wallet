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
    <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col items-center justify-center p-6">
      <div className="w-full  flex flex-col items-center text-center space-y-12 relative z-10">
        {/* Title & Subtitle */}
        <div>
          <h2 className="text-3xl font-black text-slate-100 tracking-tight">
            Indexing DAG Chain
          </h2>
          <p className="text-base text-slate-400 font-medium mt-2">
            Scanning HD derivation paths in real-time...
          </p>
        </div>

        {/* Running Balance */}
        <div className="w-full flex flex-col items-center">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">
            Discovered Balance
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black text-white font-mono tracking-tighter">
              {formatKas(indexingState.balanceSompi, 2)}
            </span>
            <span className="text-2xl font-bold text-slate-400">KAS</span>
          </div>
        </div>

        {/* Stats */}
        <div className="w-full grid grid-cols-2 gap-8 mt-4 pt-8 border-t border-[#131924]">
          <div className="flex flex-col items-center justify-center">
            <span className="text-4xl font-mono font-bold text-slate-200">
              {indexingState.scannedAddresses}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-2 flex items-center gap-1.5">
              <Hash className="w-3 h-3" /> Addresses Scanned
            </span>
          </div>

          <div className="flex flex-col items-center justify-center">
            <span className="text-4xl font-mono font-bold text-slate-200">
              {indexingState.foundAddresses}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Funded Addresses
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium pt-4">
          <Server className="w-4 h-4" />
          <span>Checking Receive & Change chains</span>
        </div>
      </div>
    </div>
  );
};

