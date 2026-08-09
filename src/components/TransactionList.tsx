import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useVirtualKeyboard } from '../context/KeyboardContext';
import { KaspaTransaction } from '../types';
import { formatKas, shortenAddress, sompiToKas } from '../utils/kaspa';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  Clock,
  X,
  FileText,
  ShieldCheck,
  EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TransactionListProps {
  hideHeader?: boolean;
  hideAssetCard?: boolean;
  hideList?: boolean;
}

export const TransactionList: React.FC<TransactionListProps> = ({ hideHeader = false, hideAssetCard = false, hideList = false }) => {
  const { transactions, activeWallet, marketData, currency, fiatRate, showToast, currentDaaScore, isBalanceVisible, setIsBalanceVisible, setIsAssetDetailOpen } = useWallet();
  const { openKeyboard } = useVirtualKeyboard();

  const [filter, setFilter] = useState<'all' | 'receive' | 'send' | 'compound'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<KaspaTransaction | null>(null);
  const [copiedTxid, setCopiedTxid] = useState(false);

  const kasAmount = sompiToKas(activeWallet.balanceSompi);
  const fiatValue = (kasAmount * marketData.priceUsd * fiatRate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const filteredTxs = transactions.filter((tx) => {
    if (filter !== 'all' && tx.type !== filter) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        tx.txid.toLowerCase().includes(query) ||
        tx.address.toLowerCase().includes(query) ||
        (tx.note && tx.note.toLowerCase().includes(query)) ||
        (tx.addressLabel && tx.addressLabel.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const handleCopyTxid = (txid: string) => {
    navigator.clipboard.writeText(txid);
    setCopiedTxid(true);
    showToast('Transaction ID copied!', 'success');
    setTimeout(() => setCopiedTxid(false), 2000);
  };

  return (
    <div className="w-full mt-3 mb-6 space-y-4">
      {/* Asset Card matching user screenshot precisely with CoinGecko Kaspa meta icon */}
      {!hideAssetCard && (
        <div
          onClick={() => setIsAssetDetailOpen(true)}
          className="p-3.5 sm:p-4 kaspriv-card flex items-center justify-between gap-3 cursor-pointer hover:border-[#70C7BA]/60 transition-all active:scale-[0.99] group shadow-sm hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            {/* Kaspa logo asset */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#68C5B5]">
              <img
                src="/asset_logo.png"
                alt="Kaspa Logo"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.onerror = null;
                  target.src = '/assets/kas_icon.svg';
                }}
              />
            </div>
            <div>
              <div className="text-sm font-extrabold text-slate-100">
                Kaspa
              </div>
              <div className="text-xs font-semibold flex items-center gap-2 mt-0.5">
                <span className="text-slate-300 font-mono">${marketData.priceUsd.toFixed(4)}</span>
                <span className={`flex items-center gap-0.5 ${marketData.change24h >= 0 ? 'text-[#70C7BA]' : 'text-rose-400'}`}>
                  {marketData.change24h >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-[#70C7BA]" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-rose-400" />
                  )}{' '}
                  {Math.abs(marketData.change24h).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Right Balance & KAS Amount */}
          <div className="text-right">
            <div className="text-sm font-mono font-extrabold text-slate-100">
              ${isBalanceVisible ? fiatValue : '••••'}
            </div>
            <div className="text-xs font-mono text-slate-400 font-medium mt-0.5">
              KAS {isBalanceVisible ? formatKas(activeWallet.balanceSompi, 2) : '••••'}
            </div>
          </div>
        </div>
      )}

      {/* Search Bar & Filter Pills (Only on History page / when hideHeader is false) */}
      {!hideHeader && (
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search transactions by ID, address, or note..."
              value={searchQuery}
              onFocus={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
              onClick={() => openKeyboard({ value: searchQuery, onChange: setSearchQuery })}
              readOnly
              inputMode="none"
              className="w-full bg-[#131924] border border-[#212B38] rounded-2xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#70C7BA] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {(['all', 'receive', 'send', 'compound'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all shrink-0 ${
                  filter === f
                    ? 'bg-[#70C7BA] text-[#090D12] shadow-sm'
                    : 'bg-[#131924] text-slate-400 hover:text-slate-200 border border-[#212B38]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Transaction Item List (Flat Layout without Nested Cards to utilize full width) */}
      {!hideList && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Transactions</h3>
            {filteredTxs.length > 0 && (
              <span className="text-[10px] font-mono text-slate-400 font-bold bg-[#131924] border border-[#212B38]/50 px-2 py-0.5 rounded-full">
                Showing {filteredTxs.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-[#212B38]/50">
            {filteredTxs.length === 0 ? (
              <div className="text-center py-8 px-4 text-slate-400">
                <FileText className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-300">No transactions found</div>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery ? 'Try matching another search query' : 'Your Kaspa transaction history will appear here'}
                </p>
              </div>
            ) : (
              filteredTxs.map((tx) => {
                const kasVal = sompiToKas(tx.amountSompi);
                const fiatVal = (kasVal * marketData.priceUsd * fiatRate).toFixed(2);

                return (
                  <motion.div
                    key={tx.txid}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => isBalanceVisible && setSelectedTx(tx)}
                    className={`flex items-center justify-between py-3.5 px-2 transition-all group ${
                      isBalanceVisible ? 'hover:bg-[#131924]/50 cursor-pointer rounded-xl' : 'cursor-default opacity-80'
                    }`}
                  >
                  {/* Type Icon & Info */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                        tx.type === 'receive'
                          ? 'bg-[#70C7BA]/15 text-[#70C7BA]'
                          : tx.type === 'send'
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      {tx.type === 'receive' && <ArrowUpRight className="w-5 h-5" />}
                      {tx.type === 'send' && <ArrowDownLeft className="w-5 h-5" />}
                      {tx.type === 'compound' && <Layers className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span className="capitalize">{tx.type}</span>
                        {!tx.isAccepted && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 animate-pulse">
                            Pending
                          </span>
                        )}
                        {tx.addressLabel && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1C2F42] text-slate-300">
                            {tx.addressLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>{isBalanceVisible ? shortenAddress(tx.address, 10, 6) : 'kaspa:••••••••••••'}</span>
                        <span>•</span>
                        <span>{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Amount & Status */}
                  <div className="text-right">
                    <div
                      className={`text-base font-black font-mono ${
                        tx.type === 'receive'
                          ? 'text-[#70C7BA]'
                          : tx.type === 'send'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {tx.type === 'receive' ? '+' : tx.type === 'send' ? '-' : ''}
                      {isBalanceVisible ? formatKas(tx.amountSompi, 2) : '••••'} KAS
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                      {isBalanceVisible 
                        ? (tx.type === 'compound' ? `Fee ${sompiToKas(tx.feeSompi)} KAS` : `≈ $${fiatVal} ${currency}`)
                        : '≈ $••.••'
                      }
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Transaction Detail Drawer Modal */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full   bg-[#090D12]   p-6 text-slate-100 relative"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#212B38]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#70C7BA]" />
                  <h3 className="text-lg font-bold">Transaction Details</h3>
                </div>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="p-1.5 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Amount Display */}
              <div className="py-6 text-center bg-[#090D12]/60 rounded-2xl  my-4">
                <div className="text-xs uppercase text-slate-400 font-semibold mb-1">
                  Transaction Amount
                </div>
                <div
                  className={`text-3xl font-black font-mono ${
                    selectedTx.type === 'receive'
                      ? 'text-[#70C7BA]'
                      : selectedTx.type === 'send'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {selectedTx.type === 'receive' ? '+' : selectedTx.type === 'send' ? '-' : ''}
                  {formatKas(selectedTx.amountSompi, 4)} KAS
                </div>
                {selectedTx.note && (
                  <div className="mt-2 text-xs text-slate-300 italic">"{selectedTx.note}"</div>
                )}
              </div>

              {/* Detail Items Grid */}
              <div className="space-y-3 text-xs">
                {/* TxID */}
                <div className="p-3 rounded-xl bg-[#090D12] ">
                  <div className="text-slate-400 font-medium mb-1">Transaction ID (TxID)</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-200 truncate">{selectedTx.txid}</span>
                    <button
                      onClick={() => handleCopyTxid(selectedTx.txid)}
                      className="text-[#70C7BA] hover:text-white p-1"
                    >
                      {copiedTxid ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Address */}
                <div className="p-3 rounded-xl bg-[#090D12] ">
                  <div className="text-slate-400 font-medium mb-1">
                    {selectedTx.type === 'receive' ? 'From Address' : 'To Address'}
                  </div>
                  <div className="font-mono text-slate-200 break-all">{selectedTx.address}</div>
                </div>

                {/* Confirmations & DAA Score */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#090D12] ">
                    <div className="text-slate-400 mb-0.5">Block DAA Score</div>
                    <div className="font-mono font-bold text-slate-200">
                      {selectedTx.blockDaaScore > 0 
                        ? selectedTx.blockDaaScore.toLocaleString() 
                        : 'Pending'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#090D12] ">
                    <div className="text-slate-400 mb-0.5">Confirmations</div>
                    <div className="font-mono font-bold text-[#70C7BA]">
                      {selectedTx.blockDaaScore > 0 && currentDaaScore > selectedTx.blockDaaScore
                        ? `${(currentDaaScore - selectedTx.blockDaaScore).toLocaleString()} (Accepted)`
                        : '1 (Accepted)'}
                    </div>
                  </div>
                </div>

                {/* Fee & Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#090D12] ">
                    <div className="text-slate-400 mb-0.5">Network Fee</div>
                    <div className="font-mono text-slate-200">{sompiToKas(selectedTx.feeSompi)} KAS</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#090D12] ">
                    <div className="text-slate-400 mb-0.5">Timestamp</div>
                    <div className="text-slate-200">{new Date(selectedTx.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
