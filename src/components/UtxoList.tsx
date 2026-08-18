import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { shortenAddress, sompiToKas, formatKas, sompiToKasString } from '../utils/kaspa';
import {
  Layers,
  Search,
  ExternalLink,
  Copy,
  Lock,
  Unlock,
  RefreshCw,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const UtxoList: React.FC = () => {
  const {
    utxos,
    activeWallet,
    refreshBalance,
    toggleLockUtxo,
    setIsCompoundOpen,
    showToast,
    explorerUrl,
  } = useWallet();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'spendable' | 'frozen'>('all');
  const [sortBy, setSortBy] = useState<'amount-desc' | 'amount-asc' | 'score-desc'>('amount-desc');
  const [expandedUtxoId, setExpandedUtxoId] = useState<string | null>(null);
  const [, setCopiedText] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!activeWallet) {
    return null;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
      showToast('UTXOs refreshed successfully', 'success');
    } catch {
      showToast('Failed to refresh UTXOs', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    showToast(`${label} copied!`, 'success');
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Filter & Search logic
  const filteredUtxos = utxos.filter((u) => {
    const outpoint = `${u.txid}:${u.vout}`;
    const isLocked = activeWallet.lockedUtxoOutpoints?.includes(outpoint) || false;

    // Filter type
    if (filter === 'spendable' && isLocked) return false;
    if (filter === 'frozen' && !isLocked) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const kasStr = sompiToKasString(u.amountSompi);
      const formattedKasStr = formatKas(u.amountSompi, 8);
      return (
        u.txid.toLowerCase().includes(q) ||
        u.address.toLowerCase().includes(q) ||
        kasStr.includes(q) ||
        formattedKasStr.includes(q)
      );
    }
    return true;
  });

  // Sort logic
  const sortedUtxos = [...filteredUtxos].sort((a, b) => {
    if (sortBy === 'amount-desc') {
      return b.amountSompi > a.amountSompi ? 1 : b.amountSompi < a.amountSompi ? -1 : 0;
    }
    if (sortBy === 'amount-asc') {
      return a.amountSompi > b.amountSompi ? 1 : a.amountSompi < b.amountSompi ? -1 : 0;
    }
    if (sortBy === 'score-desc') {
      return (b.blockDaaScore || 0) - (a.blockDaaScore || 0);
    }
    return 0;
  });

  // Calculate metrics
  const totalUtxosCount = utxos.length;
  const frozenUtxosCount = utxos.filter((u) =>
    activeWallet.lockedUtxoOutpoints?.includes(`${u.txid}:${u.vout}`)
  ).length;
  const spendableUtxosCount = totalUtxosCount - frozenUtxosCount;

  const totalSumSompi = utxos.reduce((sum, u) => sum + BigInt(u.amountSompi || 0), 0n);
  const frozenSumSompi = utxos
    .filter((u) => activeWallet.lockedUtxoOutpoints?.includes(`${u.txid}:${u.vout}`))
    .reduce((sum, u) => sum + BigInt(u.amountSompi || 0), 0n);
  const spendableSumSompi = totalSumSompi - frozenSumSompi;

  return (
    <div className="w-full mt-4 space-y-4">
      {/* 1. Header Action Row */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#70C7BA]" />
            <span>UTXO Outputs</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Manage individual unspent transaction outputs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalUtxosCount > 1 && (
            <button
              onClick={() => setIsCompoundOpen(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-[#70C7BA] bg-[#70C7BA]/10 hover:bg-[#70C7BA]/20 border border-[#70C7BA]/20 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
              title="Compound UTXOs to reduce fees"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Compound</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-xl bg-[#131924] border border-[#212B38] text-slate-400 hover:text-white transition-all cursor-pointer ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            title="Refresh UTXOs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Interactive Stat & Filter Cards */}
      <div className="grid grid-cols-3 gap-2 px-1">
        <button
          onClick={() => setFilter('all')}
          className={`py-2.5 px-3 rounded-2xl text-left transition-all cursor-pointer border ${
            filter === 'all'
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]'
              : 'bg-[#0E131B] border-[#1B232E]/60 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">All ({totalUtxosCount})</div>
          <div className={`text-xs font-mono font-black mt-0.5 truncate ${filter === 'all' ? 'text-[#70C7BA]' : 'text-slate-200'}`}>
            {formatKas(totalSumSompi, 2)} <span className="text-[9px] opacity-70">KAS</span>
          </div>
        </button>

        <button
          onClick={() => setFilter('spendable')}
          className={`py-2.5 px-3 rounded-2xl text-left transition-all cursor-pointer border ${
            filter === 'spendable'
              ? 'bg-[#70C7BA]/10 border-[#70C7BA] text-[#70C7BA]'
              : 'bg-[#0E131B] border-[#1B232E]/60 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Spendable ({spendableUtxosCount})</div>
          <div className="text-xs font-mono font-black text-[#70C7BA] mt-0.5 truncate">
            {formatKas(spendableSumSompi, 2)} <span className="text-[9px] opacity-70">KAS</span>
          </div>
        </button>

        <button
          onClick={() => setFilter('frozen')}
          className={`py-2.5 px-3 rounded-2xl text-left transition-all cursor-pointer border ${
            filter === 'frozen'
              ? 'bg-rose-500/10 border-rose-500 text-rose-400'
              : 'bg-[#0E131B] border-[#1B232E]/60 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Frozen ({frozenUtxosCount})</div>
          <div className="text-xs font-mono font-black text-rose-400 mt-0.5 truncate">
            {formatKas(frozenSumSompi, 2)} <span className="text-[9px] opacity-70">KAS</span>
          </div>
        </button>
      </div>

      {/* 3. Search & Sort Controls */}
      <div className="space-y-2 px-1">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TXID, address, or KAS amount..."
              className="w-full bg-[#0E131B] border border-[#1B232E] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#70C7BA]/50 transition-colors"
            />
          </div>

          {/* Sort Selector */}
          <div className="relative">
            <button
              onClick={() => {
                const nextSort = sortBy === 'amount-desc' ? 'amount-asc' : sortBy === 'amount-asc' ? 'score-desc' : 'amount-desc';
                setSortBy(nextSort);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0E131B] border border-[#1B232E] text-slate-400 hover:text-slate-200 text-xs font-bold transition-all cursor-pointer"
              title="Toggle UTXO Sorting"
            >
              <ArrowUpDown className="w-3 h-3 text-[#70C7BA]" />
              <span className="text-[11px]">
                {sortBy === 'amount-desc' ? 'Highest' : sortBy === 'amount-asc' ? 'Lowest' : 'Newest'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. UTXO List Content */}
      <div className="divide-y divide-[#1B232E]/60 border-t border-b border-[#1B232E]/50">
        {sortedUtxos.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-400">
            <Layers className="w-9 h-9 text-slate-600 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-300">No outputs found</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {searchQuery ? 'Try matching another search query' : 'Unspent transaction outputs will show here'}
            </p>
          </div>
        ) : (
          sortedUtxos.map((u) => {
            const outpoint = `${u.txid}:${u.vout}`;
            const isLocked = activeWallet.lockedUtxoOutpoints?.includes(outpoint) || false;
            const isExpanded = expandedUtxoId === outpoint;

            return (
              <div key={outpoint} className="py-3 transition-colors hover:bg-[#131924]/20">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3 px-1">
                  <div
                    onClick={() => setExpandedUtxoId(isExpanded ? null : outpoint)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer"
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${isLocked ? 'bg-rose-500/10 text-rose-400' : 'bg-[#70C7BA]/10 text-[#70C7BA]'}`}>
                      {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-slate-200 truncate">
                          {shortenAddress(u.txid, 6, 4)}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-[#1B232E] text-slate-400 rounded">
                          #{u.vout}
                        </span>
                        {u.blockDaaScore === 0 && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded uppercase tracking-wider animate-pulse">
                            Unconfirmed
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                        {shortenAddress(u.address, 12, 10)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="font-mono text-xs font-black text-slate-100">
                        {formatKas(u.amountSompi, 4)}
                      </div>
                      <div className="text-[10px] font-bold text-[#70C7BA] mt-0.5">KAS</div>
                    </div>

                    <button
                      onClick={() => toggleLockUtxo(outpoint)}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        isLocked
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-[#1C2F42]/80 text-slate-400 hover:text-slate-200'
                      }`}
                      title={isLocked ? 'Unlock / Unfreeze output' : 'Freeze output'}
                    >
                      {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => setExpandedUtxoId(isExpanded ? null : outpoint)}
                      className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details list */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3.5 mx-1 p-3 bg-[#0E131B] rounded-2xl border border-[#1B232E]/60 space-y-2.5 text-xs">
                        <div>
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Outpoint Transaction ID</div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="font-mono text-slate-300 break-all select-all select-none">
                              {u.txid}
                            </span>
                            <button
                              onClick={() => handleCopy(u.txid, 'Transaction ID')}
                              className="p-1 text-slate-400 hover:text-white shrink-0"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-1.5 border-t border-[#1B232E]/50">
                          <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Output Index</div>
                            <div className="font-mono text-slate-300 mt-0.5">#{u.vout}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Block DAA Score</div>
                            <div className="font-mono text-slate-300 mt-0.5">
                              {u.blockDaaScore > 0 ? u.blockDaaScore.toLocaleString() : 'Pending'}
                            </div>
                          </div>
                        </div>

                        {u.derivationPath && (
                          <div className="pt-1.5 border-t border-[#1B232E]/50">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">HD Derivation Path</div>
                            <div className="font-mono text-[#70C7BA] mt-0.5">{u.derivationPath}</div>
                          </div>
                        )}

                        <div className="pt-1.5 border-t border-[#1B232E]/50">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Address</div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="font-mono text-slate-300 truncate">
                              {u.address}
                            </span>
                            <button
                              onClick={() => handleCopy(u.address, 'Address')}
                              className="p-1 text-slate-400 hover:text-white shrink-0"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <a
                            href={`${explorerUrl}/txs/${u.txid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#70C7BA] hover:underline"
                          >
                            <span>Open in Explorer</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Helpful tip on compounding */}
      <div className="flex items-start gap-2 px-1 text-[10px] text-slate-400 leading-normal">
        <Info className="w-3.5 h-3.5 shrink-0 text-[#70C7BA] mt-0.5" />
        <p>
          Having too many small UTXO outputs increases network relay fees. Use the <strong className="text-slate-300 font-bold">Compound</strong> function to merge them securely into a single high-value output.
        </p>
      </div>
    </div>
  );
};
