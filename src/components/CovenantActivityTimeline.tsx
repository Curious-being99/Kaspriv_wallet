import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import {
  fetchKaspaAddressTransactions,
  shortenAddress,
  sompiToKas,
  getCovenantExplorerLinks,
} from '../utils/kaspa';
import {
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Zap,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';

export interface CovenantActivityItem {
  id: string;
  covenantId?: string;
  covenantAddress: string;
  covenantType: string;
  eventType: 'lock' | 'release' | 'trigger' | 'status';
  title: string;
  description: string;
  amountKas?: number;
  txid?: string;
  blockDaaScore?: number;
  timestamp: number;
  status: 'completed' | 'ready' | 'pending';
}

export const CovenantActivityTimeline: React.FC = () => {
  const { deployedCovenants, activeWallet, currentDaaScore, clearAllCovenants } = useWallet();

  const [activities, setActivities] = useState<CovenantActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'lock' | 'release' | 'trigger'>('all');

  const fetchTimelineData = useCallback(async () => {
    setIsLoading(true);
    const items: CovenantActivityItem[] = [];

    try {
      const receiveAddr = activeWallet?.receiveAddress || '';
      const covenantAddrs = Array.from(
        new Set(deployedCovenants.map((c) => c.scriptHash).filter(Boolean))
      );

      // Scan transactions for each covenant address on-chain
      for (const cov of deployedCovenants) {
        const addr = cov.scriptHash;
        let txs: any[] | null = null;
        if (addr) {
          txs = await fetchKaspaAddressTransactions(addr);
        }

        let foundOnChainTx = false;

        if (txs && Array.isArray(txs) && txs.length > 0) {
          txs.forEach((tx: any) => {
            foundOnChainTx = true;
            const txid = tx.transaction_id || tx.txid || cov.txid || '';
            const blockDaaScore = Number(tx.block_daa_score || tx.blockDaaScore || cov.daaLock);
            const blockTime = Number(tx.block_time || tx.blockTime || cov.timestamp || Date.now());

            const outputs = tx.outputs || [];
            const inputs = tx.inputs || [];

            // Check if output is sending to covenant address (Locking event)
            const lockOutput = outputs.find(
              (o: any) => (o.script_public_key_address || o.address) === addr
            );

            if (lockOutput) {
              const amountSompi = BigInt(lockOutput.amount || 0);
              const amountKas = sompiToKas(amountSompi);

              items.push({
                id: `lock-${txid}-${addr.slice(-6)}`,
                covenantId: cov.id,
                covenantAddress: addr,
                covenantType: cov.type || 'Kaspa Covenant',
                eventType: 'lock',
                title: 'Covenant Lock Funded',
                description: `Locked KAS on Kaspa BlockDAG (DAA Score: ${blockDaaScore.toLocaleString()})`,
                amountKas: amountKas > 0 ? amountKas : parseFloat(cov.amount) || 0,
                txid,
                blockDaaScore,
                timestamp: blockTime > 0 ? blockTime : cov.timestamp,
                status: 'completed',
              });
            }

            // Check if inputs spent from covenant address (Release/Claim event)
            const releaseInput = inputs.find(
              (i: any) => (i.previous_outpoint_address || i.address) === addr
            );

            if (releaseInput) {
              const amountSompi = BigInt(releaseInput.amount || 0);
              const amountKas = sompiToKas(amountSompi);

              items.push({
                id: `release-${txid}-${addr.slice(-6)}`,
                covenantId: cov.id,
                covenantAddress: addr,
                covenantType: cov.type || 'Kaspa Covenant',
                eventType: 'release',
                title: 'Covenant Release Triggered',
                description: `Covenant funds swept/claimed on-chain`,
                amountKas: amountKas > 0 ? amountKas : parseFloat(cov.amount) || 0,
                txid,
                blockDaaScore,
                timestamp: blockTime > 0 ? blockTime : cov.timestamp,
                status: 'completed',
              });
            }
          });
        }

        // Fallback or add current lock status item if no on-chain tx parsed
        if (!foundOnChainTx) {
          const isMatured = currentDaaScore >= cov.daaLock;
          const parsedKas = parseFloat(cov.amount) || 0;

          items.push({
            id: `init-${cov.id}`,
            covenantId: cov.id,
            covenantAddress: addr,
            covenantType: cov.type || 'Kaspa Covenant',
            eventType: 'lock',
            title: 'Covenant Deployed & Active',
            description: `On-chain covenant lock active at DAA score ${cov.daaLock.toLocaleString()}`,
            amountKas: parsedKas,
            txid: cov.txid,
            blockDaaScore: cov.daaLock,
            timestamp: cov.timestamp || Date.now(),
            status: 'completed',
          });

          if (isMatured) {
            items.push({
              id: `ready-${cov.id}`,
              covenantId: cov.id,
              covenantAddress: addr,
              covenantType: cov.type || 'Kaspa Covenant',
              eventType: 'trigger',
              title: cov.type?.includes('Dead Man')
                ? 'Dead-Man Inactivity Trigger Met'
                : 'Timelock Maturity Reached',
              description: `Block DAA score (${currentDaaScore.toLocaleString()}) >= Lock score (${cov.daaLock.toLocaleString()}). Ready for claim!`,
              amountKas: parsedKas,
              blockDaaScore: currentDaaScore,
              timestamp: Date.now(),
              status: 'ready',
            });
          }
        } else {
          // Check current maturity status for active covenants
          if (currentDaaScore >= cov.daaLock) {
            items.push({
              id: `ready-${cov.id}`,
              covenantId: cov.id,
              covenantAddress: addr,
              covenantType: cov.type || 'Kaspa Covenant',
              eventType: 'trigger',
              title: cov.type?.includes('Dead Man')
                ? 'Dead-Man Inactivity Trigger Met'
                : 'Unlock Threshold Reached',
              description: `Current DAA score (${currentDaaScore.toLocaleString()}) has reached unlock threshold (${cov.daaLock.toLocaleString()}).`,
              amountKas: parseFloat(cov.amount) || 0,
              blockDaaScore: currentDaaScore,
              timestamp: Date.now(),
              status: 'ready',
            });
          }
        }
      }

      // Deduplicate items by ID
      const uniqueMap = new Map<string, CovenantActivityItem>();
      items.forEach((item) => uniqueMap.set(item.id, item));
      const sorted = Array.from(uniqueMap.values()).sort((a, b) => b.timestamp - a.timestamp);

      setActivities(sorted);
    } catch (err) {
      console.warn('Failed to load covenant activity timeline:', err);
    } finally {
      setIsLoading(false);
    }
  }, [deployedCovenants, activeWallet, currentDaaScore]);

  useEffect(() => {
    fetchTimelineData();
  }, [fetchTimelineData]);

  const filteredActivities = activities.filter((act) => {
    if (filter === 'lock') return act.eventType === 'lock';
    if (filter === 'release') return act.eventType === 'release';
    if (filter === 'trigger') return act.eventType === 'trigger' || act.eventType === 'status';
    return true;
  });

  const getEventIcon = (type: CovenantActivityItem['eventType'], status: CovenantActivityItem['status']) => {
    if (status === 'ready') return <Zap className="w-4 h-4 text-amber-400" />;
    switch (type) {
      case 'lock':
        return <ArrowDownLeft className="w-4 h-4 text-cyan-400" />;
      case 'release':
        return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
      case 'trigger':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'status':
        return <Shield className="w-4 h-4 text-[#70C7BA]" />;
      default:
        return <Activity className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getEventBadgeClass = (type: CovenantActivityItem['eventType'], status: CovenantActivityItem['status']) => {
    if (status === 'ready') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    switch (type) {
      case 'lock':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'release':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'trigger':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      default:
        return 'bg-[#70C7BA]/15 text-[#70C7BA] border-[#70C7BA]/30';
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return 'Recent';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3.5 pt-1">
      {/* Top Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1">
        <div className="flex items-center gap-1.5 bg-[#090D12] p-1 rounded-xl">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({activities.length})
          </button>
          <button
            onClick={() => setFilter('lock')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'lock'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Locks
          </button>
          <button
            onClick={() => setFilter('trigger')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'trigger'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Triggers
          </button>
          <button
            onClick={() => setFilter('release')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'release'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Releases
          </button>
        </div>

        <button
          type="button"
          onClick={() => fetchTimelineData()}
          disabled={isLoading}
          className="p-1.5 text-[#70C7BA] hover:text-[#5db3a6] transition-colors rounded-lg bg-[#090D12] flex items-center gap-1 text-[11px] cursor-pointer disabled:opacity-50"
          title="Refresh Covenant Activity from Kaspa REST API"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="font-semibold">{isLoading ? 'Fetching...' : 'Sync Activity'}</span>
        </button>
      </div>

      {/* Timeline Content */}
      {isLoading && activities.length === 0 ? (
        <div className="text-center py-8 bg-[#090D12]/40 rounded-2xl space-y-2">
          <RefreshCw className="w-5 h-5 text-[#70C7BA] animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Fetching covenant activity from Kaspa API...</p>
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="text-center py-8 bg-[#090D12]/30 rounded-2xl space-y-1.5">
          <Clock className="w-6 h-6 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">No covenant operations logged yet.</p>
          <p className="text-[10px] text-slate-500">
            Deploy a covenant above or trigger a release to view real-time timeline events.
          </p>
        </div>
      ) : (
        <div className="relative pl-4 space-y-3.5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#212B38]">
          {filteredActivities.map((act) => {
            const links = getCovenantExplorerLinks(
              { scriptHash: act.covenantAddress, txid: act.txid },
              activeWallet?.receiveAddress || ''
            );

            return (
              <motion.div
                key={act.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative bg-[#090D12] p-3.5 rounded-2xl space-y-2 border border-[#212B38]/50"
              >
                {/* Node icon marker */}
                <div className="absolute -left-4 top-3.5 w-4 h-4 rounded-full bg-[#090D12] border-2 border-[#212B38] flex items-center justify-center translate-x-[-50%]">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      act.status === 'ready'
                        ? 'bg-amber-400'
                        : act.eventType === 'lock'
                        ? 'bg-cyan-400'
                        : act.eventType === 'release'
                        ? 'bg-emerald-400'
                        : 'bg-[#70C7BA]'
                    }`}
                  />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="p-1 rounded-lg bg-[#1A2330]">
                      {getEventIcon(act.eventType, act.status)}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <span>{act.title}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${getEventBadgeClass(
                            act.eventType,
                            act.status
                          )}`}
                        >
                          {act.covenantType}
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{act.description}</p>
                    </div>
                  </div>

                  {act.amountKas !== undefined && act.amountKas > 0 && (
                    <span className="text-xs font-extrabold font-mono text-[#70C7BA] whitespace-nowrap">
                      {act.amountKas.toFixed(2)} KAS
                    </span>
                  )}
                </div>

                {/* Details & Explorer Links */}
                <div className="pt-2 border-t border-[#212B38]/40 flex items-center justify-between text-[10px] text-slate-400 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span>{formatDate(act.timestamp)}</span>
                    {act.blockDaaScore && (
                      <span className="text-slate-500 font-mono">
                        DAA: {act.blockDaaScore.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {links.streamAddressUrl && (
                      <a
                        href={links.streamAddressUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                        title="View Covenant Address on kaspa.stream"
                      >
                        <span>{shortenAddress(act.covenantAddress, 8, 4)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}

                    {links.streamTxUrl && (
                      <a
                        href={links.streamTxUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-colors cursor-pointer"
                        title="View Transaction on kaspa.stream"
                      >
                        <span>Tx: {shortenAddress(act.txid || '', 6, 4)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
