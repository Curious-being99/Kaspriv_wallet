import React from 'react';
import { useWallet } from '../context/WalletContext';
import {
  ArrowLeft,
  Zap,
  Cpu,
  Code2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AssetDetailModal: React.FC = () => {
  const {
    isAssetDetailOpen,
    setIsAssetDetailOpen,
  } = useWallet();

  if (!isAssetDetailOpen) return null;

  return (
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-50 bg-[#090D12] flex flex-col overflow-hidden">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="w-full h-full flex flex-col overflow-y-auto no-scrollbar pt-safe pb-safe max-w-3xl mx-auto px-3.5 sm:px-6 py-4 space-y-4"
        >
          {/* Top Bar Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#212B38]/60 sticky top-0 bg-[#090D12] z-20 pt-1">
            <button
              onClick={() => setIsAssetDetailOpen(false)}
              className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-[#131924] border border-[#212B38] text-slate-200 hover:text-[#70C7BA] transition-all cursor-pointer group active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-[#70C7BA] transition-colors" />
              <span className="text-xs font-bold">Back</span>
            </button>

            <div className="flex items-center gap-2.5 text-center">
              <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#090D12] border border-[#212B38]">
                <img
                  src="/asset_logo.png"
                  alt="Kaspa Logo"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src.includes('asset_logo.png')) {
                      target.src = '/assets/kaspa-transaction-icon.png';
                    } else if (target.src.includes('kaspa-transaction-icon.png')) {
                      target.src = '/assets/kaspa-logo.svg';
                    } else {
                      target.style.display = 'none';
                      if (target.parentElement) {
                        target.parentElement.innerHTML = '<span class="text-[10px] font-black text-[#70C7BA]">K</span>';
                      }
                    }
                  }}
                />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-100">
                  Kaspa (KAS)
                </h2>
                <p className="text-[10px] text-slate-400 font-medium">Protocol Overview & Documentation</p>
              </div>
            </div>

            <div className="w-16" />
          </div>

          {/* Full Write-Up Content Body */}
          <div className="space-y-5 pb-12 text-slate-200">
            {/* Lead Intro Paragraph */}
            <div className="py-2 px-1 border-b border-[#212B38]/40 leading-relaxed text-xs sm:text-sm text-slate-300">
              <p>
                <strong className="text-slate-100 font-bold">Kaspa (KAS)</strong> is a decentralized, open-source, pure proof-of-work Layer-1 cryptocurrency with native programmability. It runs on a <strong className="text-[#70C7BA] font-bold">blockDAG</strong> architecture using the GHOSTDAG consensus protocol — a scalable generalization of Bitcoin’s Nakamoto consensus that allows parallel blocks to coexist and be ordered instead of being orphaned. This delivers high throughput and near-instant transaction visibility while retaining the security and decentralization of classic proof-of-work.
              </p>
            </div>

            {/* Core Performance Section */}
            <div className="py-3 px-1 border-b border-[#212B38]/40 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[#212B38]/40">
                <Zap className="w-4 h-4 text-[#70C7BA]" />
                <h3 className="text-sm font-black text-slate-100">Core Performance</h3>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span><strong className="text-slate-100">Block rate</strong>: 10 blocks per second (0.1-second average block time).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span><strong className="text-slate-100">Confirmations</strong>: Transactions become visible almost immediately and reach practical finality in roughly 10 seconds (dominated by network latency).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span><strong className="text-slate-100">Hashing algorithm</strong>: kHeavyHash (GPU-optimized).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span><strong className="text-slate-100">Security model</strong>: Pure proof-of-work with no extra trust assumptions.</span>
                </li>
              </ul>

              <p className="text-xs sm:text-sm text-slate-300 pt-2 border-t border-[#212B38]/40 leading-relaxed">
                Kaspa was fair-launched on <strong className="text-slate-100">November 7, 2021</strong>, with <strong className="text-slate-100">no premine, no ICO, no founder or team allocation</strong>, and no central governance. Maximum supply is approximately 28.7 billion KAS, emitted through open mining under a smooth, gradual reduction schedule.
              </p>
            </div>

            {/* Programmability (Toccata) Section */}
            <div className="py-3 px-1 border-b border-[#212B38]/40 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[#212B38]/40">
                <Code2 className="w-4 h-4 text-[#70C7BA]" />
                <h3 className="text-sm font-black text-slate-100">Programmability (Toccata — Live Since June 30, 2026)</h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                The Toccata hard fork completed Kaspa’s transition into a fully programmable Layer-1. Programmability is UTXO-native rather than account-based:
              </p>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-100">Covenants</strong> — Scripts can enforce stateful rules across successive spends (full transaction introspection, covenant IDs for stable lineage, and successor validation). This enables vaults, escrows, conditional logic, multi-stage authorization, and other applications without a global shared state.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-100">Native tokens/assets</strong> — Direct issuance and management of custom tokens on L1.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-100">Zero-knowledge support</strong> — Native verification of Groth16 and RISC Zero proofs inside scripts, plus sequencing commitments for based ZK applications.
                  </span>
                </li>
              </ul>
            </div>

            {/* Developer Stack Section */}
            <div className="py-3 px-1 border-b border-[#212B38]/40 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[#212B38]/40">
                <Cpu className="w-4 h-4 text-[#70C7BA]" />
                <h3 className="text-sm font-black text-slate-100">Developer Stack</h3>
              </div>

              <ul className="space-y-3 text-xs sm:text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-100">Silverscript</strong> — The primary high-level language for writing single-contract (and coordinated multi-contract) covenants. It compiles directly to native Kaspa Script.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-slate-100">Argent</strong> — An actor-based language and compiler built on top of Silverscript for complex, stateful, multi-contract and multi-app applications. Developers express applications as communicating actors with typed state, entries, routes, and atomic transaction-wide transitions. Argent lowers cleanly into auditable Silverscript, handling routing, template commitments, Inter-Covenant Communication (ICC), and successor validation automatically. It is the intended higher-level surface for sophisticated DeFi, multi-party protocols, and applications that require several covenants to interact atomically in a single transaction.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] mt-1.5 shrink-0" />
                  <span>
                    Supporting tooling includes SDKs, runtimes for transaction construction, and pathways toward based ZK applications and future vProgs-style verifiable programs.
                  </span>
                </li>
              </ul>

              <p className="text-xs sm:text-sm text-slate-300 pt-2 border-t border-[#212B38]/40 leading-relaxed">
                Kaspa deliberately keeps the base layer lean and parallel: applications carry state in individual or families of UTXOs that can split, merge, and prove correct transitions. This preserves the blockDAG’s throughput, MEV-resistance characteristics, and pure proof-of-work security while enabling rich on-chain logic.
              </p>
            </div>

            {/* Summary Conclusion Box */}
            <div className="py-3 px-1 leading-relaxed text-xs sm:text-sm text-slate-200">
              <p>
                In short, Kaspa combines Bitcoin’s foundational principles (fair launch, proof-of-work, UTXO model, no central control) with modern high-speed settlement and a complete, UTXO-native programmability stack centered on covenants, Silverscript, and Argent.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
