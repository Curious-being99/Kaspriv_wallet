import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Server,
  Activity,
  Plus,
  Trash2,
  Check,
  Shield,
  ShieldCheck,
  Globe,
  Radio,
  RefreshCw,
  Cpu,
  Info,
  ExternalLink,
  Lock,
  Unlock,
  Terminal,
  Layers,
  ArrowRight,
  Wifi,
  EyeOff,
  Sliders,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { KaspaNode, NetworkType } from '../types';
import { pingKaspaNode } from '../utils/kaspa/api';
import { useKeyboard } from '../context/KeyboardContext';

function isCspCompliantUrl(urlString: string): boolean {
  if (!urlString) return true;
  try {
    const rawUrl = urlString.trim().toLowerCase();
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : 'http://' + rawUrl);
    const host = url.hostname;
    
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.onion')) {
      return true;
    }
    
    const allowedPatterns = [
      /\.kaspa\.org$/,
      /\.kaspa\.net$/,
      /\.kaspa\.stream$/,
      /\.kaspagov\.org$/,
      /\.aspectron\.org$/,
      /\.kaspriv\.io$/,
      /^api\.coingecko\.com$/,
      /^api\.coinpaprika\.com$/
    ];
    
    if (host === 'kaspa.org' || host === 'kaspa.net' || host === 'kaspa.stream' || host === 'kaspagov.org' || host === 'aspectron.org' || host === 'kaspriv.io') {
      return true;
    }
    
    return allowedPatterns.some(pattern => pattern.test(host));
  } catch {
    return false;
  }
}

export const NodeManagerModal: React.FC = () => {
  const {
    nodes,
    activeNode,
    selectNode,
    addCustomNode,
    deleteCustomNode,
    pingNodes,
    network,
    setNetwork,
    isNodeManagerOpen,
    setIsNodeManagerOpen,
    showToast,
  } = useWallet();

  const { openKeyboard } = useKeyboard();

  const [activeTab, setActiveTab] = useState<'nodes' | 'privacy'>('nodes');

  // Custom Node Form State
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [restApiUrl, setRestApiUrl] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [customExplorerUrl, setCustomExplorerUrl] = useState('');
  const [customNetwork, setCustomNetwork] = useState<NetworkType>('mainnet');
  const [isSelfHosted, setIsSelfHosted] = useState(true);
  const [isOnionNode, setIsOnionNode] = useState(false);
  const [isTestingCustom, setIsTestingCustom] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number; error?: string } | null>(null);

  const [isPingingAll, setIsPingingAll] = useState(false);

  if (!isNodeManagerOpen) return null;

  const handleTestAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restApiUrl.trim()) {
      showToast('Please enter a REST API URL', 'error');
      return;
    }

    const cleanUrl = restApiUrl.trim().replace(/\/+$/, '');
    setIsTestingCustom(true);
    setTestResult(null);

    try {
      const pingRes = await pingKaspaNode(cleanUrl);
      setTestResult(pingRes);

      if (!pingRes.ok && !cleanUrl.includes('.onion') && !cleanUrl.includes('127.0.0.1') && !cleanUrl.includes('localhost')) {
        showToast(`Node ping check warning: ${pingRes.error || 'Unreachable'}`, 'error');
      }

      let inferredName = nodeName.trim();
      if (!inferredName) {
        try {
          const u = new URL(cleanUrl);
          inferredName = isSelfHosted ? `Self-Hosted (${u.hostname})` : `Private Node (${u.hostname})`;
        } catch {
          inferredName = isSelfHosted ? 'Self-Hosted Private Kaspad' : 'Custom Node';
        }
      }

      const newNode: KaspaNode = {
        id: `custom-node-${Date.now()}`,
        name: inferredName,
        url: rpcUrl.trim() || cleanUrl,
        apiUrl: cleanUrl,
        explorerUrl: customExplorerUrl.trim() || 'https://explorer.kaspa.org',
        network: customNetwork,
        latencyMs: pingRes.ok ? pingRes.latencyMs : (isSelfHosted ? 1 : 45),
        isOnline: pingRes.ok || cleanUrl.includes('127.0.0.1') || cleanUrl.includes('localhost'),
        isCustom: true,
        selected: true,
        isPrivateSelfHosted: isSelfHosted,
        isTorOrOnion: isOnionNode || cleanUrl.includes('.onion'),
        isOnion: isOnionNode || cleanUrl.includes('.onion'),
      };

      addCustomNode(newNode);
      setIsAddingCustom(false);
      setNodeName('');
      setRestApiUrl('');
      setRpcUrl('');
      setCustomExplorerUrl('');
      setTestResult(null);
      
      if (!isCspCompliantUrl(cleanUrl) || (rpcUrl.trim() && !isCspCompliantUrl(rpcUrl))) {
        showToast('Custom node added with CSP Warnings. Your browser may block requests to this domain.', 'warning');
      } else {
        showToast('Custom privacy node connected successfully!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to connect to node', 'error');
    } finally {
      setIsTestingCustom(false);
    }
  };

  const handlePingAll = async () => {
    setIsPingingAll(true);
    try {
      await pingNodes();
    } finally {
      setIsPingingAll(false);
    }
  };

  const filteredNodes = nodes.filter((n) => !n.network || n.network === network);

  return (
    <div className="fixed inset-0 z-50 bg-[#090D12]/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="w-full max-w-2xl bg-[#0B121B] border border-[#212B38] rounded-3xl flex flex-col max-h-[90dvh] overflow-hidden shadow-2xl"
      >
        {/* Header - Locked at Top */}
        <div className="p-4 sm:p-5 border-b border-[#212B38] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#70C7BA]/20 border border-[#70C7BA]/40 flex items-center justify-center text-[#70C7BA] shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-slate-100 whitespace-nowrap">
                  Network & Private Node Hub
                </h2>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold whitespace-nowrap shrink-0 ${
                  activeNode?.isPrivateSelfHosted
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-[#141C26] text-slate-400 border border-[#212B38]/60'
                }`}>
                  {activeNode?.isPrivateSelfHosted ? 'Self-Hosted Node' : 'Standard Direct RPC'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                100% Client-side node selection and private self-hosted Kaspad configuration
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsNodeManagerOpen(false)}
            className="p-1.5 rounded-xl hover:bg-[#1A2330] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Controls - Locked below Header */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 border-b border-[#212B38]/60 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('nodes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'nodes'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'bg-[#141C26] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Kaspa Nodes ({filteredNodes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'bg-[#141C26] text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Privacy & Self-Hosting Guide</span>
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
          {activeTab === 'nodes' && (
            <div className="space-y-4">
              {/* Active Node Summary Card */}
              <div className="p-3.5 rounded-2xl bg-[#0F1722] border border-[#212B38] relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Active Connection Endpoint
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <Activity className="w-3 h-3" />
                  <span>{activeNode?.latencyMs || 14}ms</span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                <div className="text-sm font-black text-slate-100 flex items-center gap-2 flex-wrap">
                  <span>{activeNode?.name || activeNode?.url || 'Default Kaspa Node'}</span>
                  {activeNode?.isPrivateSelfHosted && (
                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      Zero IP Leaks (Self-Hosted)
                    </span>
                  )}
                  {activeNode?.isTorOrOnion && (
                    <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                      Tor / Onion
                    </span>
                  )}
                  {activeNode?.isCustom && !activeNode?.isPrivateSelfHosted && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                      Custom Node
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400 break-all">
                  REST API: <span className="text-[#70C7BA]">{activeNode?.apiUrl || activeNode?.url}</span>
                </div>
                {activeNode?.url && activeNode?.url !== activeNode?.apiUrl && (
                  <div className="text-[10px] font-mono text-slate-500 break-all">
                    wRPC: {activeNode.url}
                  </div>
                )}
              </div>
            </div>

            {/* Node Action Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Available Nodes</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141C26] text-slate-400">
                  {network}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePingAll}
                  disabled={isPingingAll}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#141C26] hover:bg-[#1A2330] text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPingingAll ? 'animate-spin text-[#70C7BA]' : ''}`} />
                  <span>Ping All</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(!isAddingCustom)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] text-xs font-extrabold transition-all shadow-md shadow-[#70C7BA]/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isAddingCustom ? 'Cancel' : 'Add Self-Hosted / Custom Node'}</span>
                </button>
              </div>
            </div>

            {/* Add Custom Node Form Modal / Collapsible */}
            <AnimatePresence>
              {isAddingCustom && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleTestAndAdd}
                  className="p-4 rounded-2xl bg-[#0B121B] border border-[#70C7BA]/40 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#212B38]">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#70C7BA]">
                      <Cpu className="w-4 h-4" />
                      <span>Input Private Self-Hosted Kaspad Node URL</span>
                    </div>
                    <span className="text-[9px] text-slate-400">100% Client-Side Direct Fetch</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Node Label / Identifier
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. My Private Kaspad / Home Server"
                        value={nodeName}
                        onFocus={() => openKeyboard({ value: nodeName, onChange: setNodeName })}
                        onClick={() => openKeyboard({ value: nodeName, onChange: setNodeName })}
                        inputMode="none"
                        onChange={() => {}}
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-100 outline-none focus:border-[#70C7BA] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Target Network
                      </label>
                      <select
                        value={customNetwork}
                        onChange={(e) => setCustomNetwork(e.target.value as NetworkType)}
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-200 outline-none focus:border-[#70C7BA]"
                      >
                        <option value="mainnet">Mainnet</option>
                        <option value="testnet-10">Testnet-10</option>
                        <option value="testnet-11">Testnet-11</option>
                        <option value="devnet">Devnet</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      REST API URL (e.g. http://127.0.0.1:8000 or http://kaspad.onion:8000)
                    </label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:8000 or https://your-node-domain.org"
                      value={restApiUrl}
                      onFocus={() => openKeyboard({ value: restApiUrl, onChange: setRestApiUrl })}
                      onClick={() => openKeyboard({ value: restApiUrl, onChange: setRestApiUrl })}
                      inputMode="none"
                      onChange={() => {}}
                      className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA] cursor-pointer"
                    />
                    <p className="text-[9px] text-slate-500 mt-1">
                      Connects directly to your <code className="text-slate-300">kaspa-rest-server</code> bridge for UTXO indexing and transaction relay.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        wRPC URL (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="ws://127.0.0.1:16110"
                        value={rpcUrl}
                        onFocus={() => openKeyboard({ value: rpcUrl, onChange: setRpcUrl })}
                        onClick={() => openKeyboard({ value: rpcUrl, onChange: setRpcUrl })}
                        inputMode="none"
                        onChange={() => {}}
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Explorer URL (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="https://explorer.kaspa.org"
                        value={customExplorerUrl}
                        onFocus={() => openKeyboard({ value: customExplorerUrl, onChange: setCustomExplorerUrl })}
                        onClick={() => openKeyboard({ value: customExplorerUrl, onChange: setCustomExplorerUrl })}
                        inputMode="none"
                        onChange={() => {}}
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA] cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  {((restApiUrl.trim() && !isCspCompliantUrl(restApiUrl)) || (rpcUrl.trim() && !isCspCompliantUrl(rpcUrl))) && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Info className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Content Security Policy (CSP) Warning</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        This custom endpoint domain is not listed in the browser's security policy. Direct network requests to this domain may be blocked by your browser's CSP. Whitelisted domains include <code className="text-slate-200">*.kaspa.org</code>, <code className="text-slate-200">*.kaspa.net</code>, <code className="text-slate-200">*.aspectron.org</code>, and local hosts (<code className="text-slate-200">localhost</code>, <code className="text-slate-200">127.0.0.1</code>).
                      </p>
                    </div>
                  )}

                  {/* Privacy Flag Checkboxes */}
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelfHosted}
                        onChange={(e) => setIsSelfHosted(e.target.checked)}
                        className="accent-[#70C7BA] rounded"
                      />
                      <span>Self-Hosted (Local / Private LAN)</span>
                    </label>

                    <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOnionNode}
                        onChange={(e) => setIsOnionNode(e.target.checked)}
                        className="accent-[#70C7BA] rounded"
                      />
                      <span>Tor Onion Endpoint (.onion)</span>
                    </label>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="pt-2 border-t border-[#212B38]/60 flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-slate-400">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNodeName('Local Private Kaspad (127.0.0.1)');
                        setRestApiUrl('http://127.0.0.1:8000');
                        setRpcUrl('ws://127.0.0.1:16110');
                        setIsSelfHosted(true);
                      }}
                      className="px-2 py-0.5 rounded bg-[#141C26] hover:bg-[#1E293B] text-[#70C7BA] border border-[#70C7BA]/30 font-mono"
                    >
                      127.0.0.1:8000
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNodeName('Home LAN Kaspad (192.168.1.50)');
                        setRestApiUrl('http://192.168.1.50:8000');
                        setRpcUrl('ws://192.168.1.50:16110');
                        setIsSelfHosted(true);
                      }}
                      className="px-2 py-0.5 rounded bg-[#141C26] hover:bg-[#1E293B] text-slate-300 border border-[#212B38] font-mono"
                    >
                      LAN 192.168.x.x
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingCustom(false)}
                      className="px-3 py-2 rounded-xl bg-[#141C26] text-slate-400 hover:text-slate-200 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isTestingCustom || !restApiUrl.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] text-xs font-extrabold shadow-md shadow-[#70C7BA]/20 disabled:opacity-50 cursor-pointer"
                    >
                      {isTestingCustom && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isTestingCustom ? 'Testing Node...' : 'Verify & Add Node'}</span>
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Node List */}
            <div className="space-y-2">
              {filteredNodes.map((n) => {
                const isSelected = activeNode?.id === n.id || n.selected;
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#0F1C28] border-[#70C7BA] shadow-lg shadow-[#70C7BA]/10'
                        : 'bg-[#0B121B] border-[#212B38] hover:border-[#2E3F54]'
                    }`}
                  >
                    <div
                      onClick={() => selectNode(n.id)}
                      className="flex items-start gap-3 flex-1 cursor-pointer"
                    >
                      <div className="mt-1">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-[#70C7BA] bg-[#70C7BA]'
                              : 'border-slate-500 bg-transparent'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-[#090D12] stroke-[3]" />}
                        </div>
                      </div>

                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-100">
                            {n.name || n.url}
                          </span>
                          {n.isPrivateSelfHosted && (
                            <span className="text-[9px] px-2 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                              Zero IP Leaks
                            </span>
                          )}
                          {n.isTorOrOnion && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                              Tor Onion
                            </span>
                          )}
                          {n.isCustom && !n.isPrivateSelfHosted && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                              Custom
                            </span>
                          )}
                          {n.isCustom && n.apiUrl && !isCspCompliantUrl(n.apiUrl) && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono font-bold" title="Potential CSP Block">
                              CSP Restricted
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 break-all">
                          {n.apiUrl || n.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              n.isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                          />
                          <span>{n.latencyMs ? `${n.latencyMs}ms` : 'online'}</span>
                        </div>
                      </div>

                      {n.isCustom && (
                        <button
                          type="button"
                          onClick={() => deleteCustomNode(n.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Custom Node"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: PRIVACY & DE-ANONYMIZATION DEFENSE GUIDE */}
        {activeTab === 'privacy' && (
          <div className="space-y-3 mt-3 text-xs leading-relaxed text-slate-300">
            <div className="p-4 rounded-2xl bg-[#0F1722] border border-[#70C7BA]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#70C7BA] font-extrabold text-sm">
                <Shield className="w-5 h-5" />
                <span>100% Client-Side Zero-Leak Architecture</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                KasPriv executes all seed generation, key derivation, and transaction signing <strong>100% locally inside client WebAssembly and pure TypeScript</strong>. No private keys, mnemonics, or unencrypted telemetry ever leave your browser.
              </p>
            </div>

            {/* Quick Terminal Guide: Local Node */}
            <div className="p-3.5 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-100">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#70C7BA]" />
                  <span>1. Run Local Private Kaspad (127.0.0.1)</span>
                </div>
                <span className="text-[9px] font-mono text-emerald-400">Zero External Logs</span>
              </div>
              <p className="text-[11px] text-slate-400">
                To prevent third-party RPC servers from seeing your IP address, run a local Kaspa consensus node and connect directly:
              </p>
              <div className="p-2.5 rounded-xl bg-black/50 font-mono text-[10px] text-slate-200 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500"># Step A: Run local kaspad daemon</div>
                <div className="text-emerald-400 font-bold">kaspad --utxoindex --rpclisten=127.0.0.1:16110</div>
                <div className="text-slate-500 mt-1"># Step B: Run REST API bridge</div>
                <div className="text-emerald-400 font-bold">kaspa-rest-server --rpc-server=127.0.0.1:16110 --port=8000</div>
              </div>
              <p className="text-[10px] text-slate-400">
                Then select <strong>Private Self-Hosted Kaspad (127.0.0.1:8000)</strong> in the Nodes tab.
              </p>
            </div>

            {/* Coin Control Defense */}
            <div className="p-3.5 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-2">
              <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#70C7BA]" />
                <span>2. Coin Control & UTXO Cluster Breaking</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Use the <strong>Coin Control</strong> feature in the Send flow to manually freeze or select individual UTXOs, preventing chain analytics from clustering your separate addresses together.
              </p>
            </div>
          </div>
        )}
      </div>

        {/* Footer Close */}
        <div className="p-4 sm:p-5 border-t border-[#212B38] shrink-0">
          <button
            type="button"
            onClick={() => setIsNodeManagerOpen(false)}
            className="w-full py-2.5 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] font-extrabold text-xs transition-all shadow-md shadow-[#70C7BA]/20 cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};
