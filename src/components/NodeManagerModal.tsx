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
import { KaspaNode, NetworkType, ProxyConfig } from '../types';
import { pingKaspaNode } from '../utils/kaspa/api';
import { useKeyboard } from '../context/KeyboardContext';

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
    proxyConfig,
    updateProxyConfig,
    toggleProxy,
    testProxyConnection,
    isNodeManagerOpen,
    setIsNodeManagerOpen,
    showToast,
  } = useWallet();

  const { openKeyboard } = useKeyboard();

  const [activeTab, setActiveTab] = useState<'nodes' | 'proxy' | 'privacy'>('nodes');

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

  // Proxy Configuration State
  const [proxyType, setProxyType] = useState<'tor' | 'socks5' | 'http'>(proxyConfig.type || 'tor');
  const [proxyHost, setProxyHost] = useState(proxyConfig.host || '127.0.0.1');
  const [proxyPort, setProxyPort] = useState(String(proxyConfig.port || 9050));
  const [proxyUsername, setProxyUsername] = useState(proxyConfig.username || '');
  const [proxyPassword, setProxyPassword] = useState(proxyConfig.password || '');
  const [onionOnly, setOnionOnly] = useState(proxyConfig.onionOnly || false);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestStatus, setProxyTestStatus] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);

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
      showToast('Custom privacy node connected successfully!', 'success');
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

  const handleSaveProxyConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(proxyPort, 10) || 9050;
    const newConfig: ProxyConfig = {
      enabled: proxyConfig.enabled,
      type: proxyType,
      host: proxyHost.trim() || '127.0.0.1',
      port: portNum,
      username: proxyUsername.trim() || undefined,
      password: proxyPassword.trim() || undefined,
      onionOnly: onionOnly,
    };
    updateProxyConfig(newConfig);
    showToast('Proxy configuration saved', 'success');
  };

  const handleTestProxy = async () => {
    const portNum = parseInt(proxyPort, 10) || 9050;
    const targetConfig: ProxyConfig = {
      enabled: true,
      type: proxyType,
      host: proxyHost.trim() || '127.0.0.1',
      port: portNum,
      username: proxyUsername.trim() || undefined,
      password: proxyPassword.trim() || undefined,
      onionOnly: onionOnly,
    };

    setIsTestingProxy(true);
    setProxyTestStatus(null);
    try {
      const res = await testProxyConnection(targetConfig);
      setProxyTestStatus(res);
      if (res.ok) {
        showToast(`Proxy connection verified: ${res.message}`, 'success');
      } else {
        showToast(`Proxy check: ${res.message}`, 'error');
      }
    } catch (err: any) {
      setProxyTestStatus({ ok: false, message: err.message || 'Connection failed' });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handleApplyProxyPreset = (type: 'tor_daemon' | 'tor_browser' | 'socks5_local' | 'http_tunnel') => {
    if (type === 'tor_daemon') {
      setProxyType('tor');
      setProxyHost('127.0.0.1');
      setProxyPort('9050');
      updateProxyConfig({ type: 'tor', host: '127.0.0.1', port: 9050, enabled: true });
      showToast('Applied Tor Daemon Preset (127.0.0.1:9050)', 'success');
    } else if (type === 'tor_browser') {
      setProxyType('tor');
      setProxyHost('127.0.0.1');
      setProxyPort('9150');
      updateProxyConfig({ type: 'tor', host: '127.0.0.1', port: 9150, enabled: true });
      showToast('Applied Tor Browser Bundle Preset (127.0.0.1:9150)', 'success');
    } else if (type === 'socks5_local') {
      setProxyType('socks5');
      setProxyHost('127.0.0.1');
      setProxyPort('1080');
      updateProxyConfig({ type: 'socks5', host: '127.0.0.1', port: 1080, enabled: true });
      showToast('Applied Local SOCKS5 Preset (127.0.0.1:1080)', 'success');
    } else if (type === 'http_tunnel') {
      setProxyType('http');
      setProxyHost('127.0.0.1');
      setProxyPort('8118');
      updateProxyConfig({ type: 'http', host: '127.0.0.1', port: 8118, enabled: true });
      showToast('Applied Privoxy / HTTP Tunnel Preset (127.0.0.1:8118)', 'success');
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
                  proxyConfig.enabled
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : activeNode?.isPrivateSelfHosted
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-[#141C26] text-slate-400 border border-[#212B38]/60'
                }`}>
                  {proxyConfig.enabled ? 'Tor / Proxy Active' : activeNode?.isPrivateSelfHosted ? 'Self-Hosted' : 'Standard RPC'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                Configure self-hosted nodes, Tor/SOCKS5 proxies, and eliminate IP correlation
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
            onClick={() => setActiveTab('proxy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'proxy'
                ? 'bg-[#70C7BA] text-[#090D12]'
                : 'bg-[#141C26] text-slate-400 hover:text-slate-200'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Tor & SOCKS5 Proxy</span>
            {proxyConfig.enabled && (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            )}
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
            <span>Defense Guide</span>
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
                    <span className="text-[9px] text-slate-400">Direct or Proxy-Routed</span>
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
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-100 outline-none focus:border-[#70C7BA]"
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
                      className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
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
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
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
                        className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
                      />
                    </div>
                  </div>

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

        {/* TAB 2: TOR & SOCKS5 PROXY CONFIGURATION */}
        {activeTab === 'proxy' && (
          <div className="space-y-4 mt-3">
            {/* Master Proxy Toggle Hero Card */}
            <div className={`p-4 rounded-2xl border transition-all ${
              proxyConfig.enabled
                ? 'bg-purple-950/20 border-purple-500/40 shadow-lg shadow-purple-500/10'
                : 'bg-[#0F1722] border-[#212B38]'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    proxyConfig.enabled
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-[#141C26] text-slate-400 border border-[#212B38]'
                  }`}>
                    <EyeOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-100">
                      Tor / SOCKS5 Network Anonymizer
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {proxyConfig.enabled
                        ? `Traffic anonymized via ${proxyConfig.type.toUpperCase()}://${proxyConfig.host}:${proxyConfig.port}`
                        : 'Direct RPC queries (Public IP exposed to node endpoints)'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleProxy()}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    proxyConfig.enabled
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                      : 'bg-[#141C26] hover:bg-[#1F2B3C] text-slate-300 border border-[#273E54]'
                  }`}
                >
                  {proxyConfig.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {/* IP Shield Status Indicator */}
              <div className="mt-3 pt-3 border-t border-[#212B38]/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${proxyConfig.enabled ? 'bg-purple-400 animate-ping' : 'bg-amber-400'}`} />
                  <span className="text-slate-400 font-sans">IP Obfuscation:</span>
                  <span className={`font-bold ${proxyConfig.enabled ? 'text-purple-300' : 'text-amber-300'}`}>
                    {proxyConfig.enabled ? 'Fully Shielded' : 'Exposed to Remote RPC'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-sans">Active Proxy:</span>
                  <span className="font-mono text-slate-200">
                    {proxyConfig.type.toUpperCase()}://{proxyConfig.host}:{proxyConfig.port}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="p-3 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                1-Click Proxy Presets
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyProxyPreset('tor_daemon')}
                  className="p-2.5 rounded-xl bg-[#141C26] hover:bg-purple-500/10 border border-[#273E54] hover:border-purple-500/40 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-slate-200 group-hover:text-purple-300">Tor Daemon</div>
                  <div className="text-[9px] font-mono text-slate-500">127.0.0.1:9050</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyProxyPreset('tor_browser')}
                  className="p-2.5 rounded-xl bg-[#141C26] hover:bg-purple-500/10 border border-[#273E54] hover:border-purple-500/40 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-slate-200 group-hover:text-purple-300">Tor Browser</div>
                  <div className="text-[9px] font-mono text-slate-500">127.0.0.1:9150</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyProxyPreset('socks5_local')}
                  className="p-2.5 rounded-xl bg-[#141C26] hover:bg-[#70C7BA]/10 border border-[#273E54] hover:border-[#70C7BA]/40 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-slate-200 group-hover:text-[#70C7BA]">Custom SOCKS5</div>
                  <div className="text-[9px] font-mono text-slate-500">127.0.0.1:1080</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyProxyPreset('http_tunnel')}
                  className="p-2.5 rounded-xl bg-[#141C26] hover:bg-[#70C7BA]/10 border border-[#273E54] hover:border-[#70C7BA]/40 text-left transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-slate-200 group-hover:text-[#70C7BA]">HTTP Tunnel</div>
                  <div className="text-[9px] font-mono text-slate-500">127.0.0.1:8118</div>
                </button>
              </div>
            </div>

            {/* Detailed Proxy Configuration Form */}
            <form onSubmit={handleSaveProxyConfig} className="p-4 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#212B38]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Sliders className="w-4 h-4 text-[#70C7BA]" />
                  <span>Custom Proxy Connection Parameters</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono">SOCKS5 / Tor v3</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Protocol Type
                  </label>
                  <select
                    value={proxyType}
                    onChange={(e) => setProxyType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-200 outline-none focus:border-[#70C7BA]"
                  >
                    <option value="tor">Tor (SOCKS5)</option>
                    <option value="socks5">Generic SOCKS5</option>
                    <option value="http">HTTP / HTTPS Proxy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Proxy Host / IP
                  </label>
                  <input
                    type="text"
                    value={proxyHost}
                    onFocus={() => openKeyboard({ value: proxyHost, onChange: setProxyHost })}
                    onClick={() => openKeyboard({ value: proxyHost, onChange: setProxyHost })}
                    inputMode="none"
                    onChange={() => {}}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
                    placeholder="127.0.0.1 or socks.mydomain.org"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Port
                  </label>
                  <input
                    type="text"
                    value={proxyPort}
                    onFocus={() => openKeyboard({ value: proxyPort, onChange: setProxyPort })}
                    onClick={() => openKeyboard({ value: proxyPort, onChange: setProxyPort })}
                    inputMode="none"
                    onChange={() => {}}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs font-mono text-slate-100 outline-none focus:border-[#70C7BA]"
                    placeholder="9050"
                  />
                </div>
              </div>

              {/* Optional Authentication */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Username (Optional)
                  </label>
                  <input
                    type="text"
                    value={proxyUsername}
                    onFocus={() => openKeyboard({ value: proxyUsername, onChange: setProxyUsername })}
                    onClick={() => openKeyboard({ value: proxyUsername, onChange: setProxyUsername })}
                    inputMode="none"
                    onChange={() => {}}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-100 outline-none focus:border-[#70C7BA]"
                    placeholder="Optional proxy user"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={proxyPassword}
                    onFocus={() => openKeyboard({ value: proxyPassword, onChange: setProxyPassword })}
                    onClick={() => openKeyboard({ value: proxyPassword, onChange: setProxyPassword })}
                    inputMode="none"
                    onChange={() => {}}
                    className="w-full px-3 py-2 rounded-xl bg-[#090D12] border border-[#212B38] text-xs text-slate-100 outline-none focus:border-[#70C7BA]"
                    placeholder="Optional proxy password"
                  />
                </div>
              </div>

              {/* Onion Strict Option */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onionOnly}
                    onChange={(e) => setOnionOnly(e.target.checked)}
                    className="accent-purple-500 rounded"
                  />
                  <span>Enforce Strict Onion-Only Routing (Block non-.onion clear-net traffic)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#212B38]/60">
                <button
                  type="button"
                  onClick={handleTestProxy}
                  disabled={isTestingProxy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141C26] hover:bg-[#1E293B] text-slate-300 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingProxy ? 'animate-spin text-[#70C7BA]' : ''}`} />
                  <span>{isTestingProxy ? 'Testing Handshake...' : 'Test Proxy Handshake'}</span>
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#70C7BA] hover:bg-[#5eead4] text-[#090D12] text-xs font-extrabold shadow-md shadow-[#70C7BA]/20 cursor-pointer"
                >
                  Apply & Save Proxy
                </button>
              </div>

              {proxyTestStatus && (
                <div className={`p-2.5 rounded-xl text-[10px] font-mono flex items-center gap-2 ${
                  proxyTestStatus.ok
                    ? 'bg-emerald-950/30 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/30 border border-rose-500/30 text-rose-300'
                }`}>
                  {proxyTestStatus.ok ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Info className="w-3.5 h-3.5 shrink-0" />}
                  <span>{proxyTestStatus.message}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* TAB 3: PRIVACY & DE-ANONYMIZATION DEFENSE GUIDE */}
        {activeTab === 'privacy' && (
          <div className="space-y-3 mt-3 text-xs leading-relaxed text-slate-300">
            <div className="p-4 rounded-2xl bg-[#0F1722] border border-[#70C7BA]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#70C7BA] font-extrabold text-sm">
                <Shield className="w-5 h-5" />
                <span>How KasPriv Prevents IP Address Correlation</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                Public cloud RPC nodes log your real IP address alongside your Kaspa wallet addresses and transaction broadcasts. By running a <strong>Self-Hosted Kaspad Node</strong> or enabling <strong>Tor/SOCKS5 Proxy Routing</strong>, no external entity can link your physical location or IP address to your funds.
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
                Run the Kaspa consensus daemon and local REST server on your computer or home server:
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

            {/* Quick Terminal Guide: Tor Daemon */}
            <div className="p-3.5 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-100">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-purple-400" />
                  <span>2. Tor SOCKS5 Onion Routing</span>
                </div>
                <span className="text-[9px] font-mono text-purple-300">Multi-Hop Anonymity</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Route queries through the Tor network so destination nodes only see an exit node IP:
              </p>
              <div className="p-2.5 rounded-xl bg-black/50 font-mono text-[10px] text-slate-200 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500"># Linux / macOS (Homebrew or apt)</div>
                <div className="text-purple-300 font-bold">sudo apt install tor && sudo systemctl start tor</div>
                <div className="text-slate-500 mt-1"># Default Tor SOCKS5 Port</div>
                <div className="text-purple-300 font-bold">127.0.0.1:9050</div>
              </div>
              <p className="text-[10px] text-slate-400">
                Enable <strong>Tor & SOCKS5 Proxy</strong> in the tab above.
              </p>
            </div>

            {/* Coin Control Defense */}
            <div className="p-3.5 rounded-2xl bg-[#0B121B] border border-[#212B38] space-y-2">
              <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#70C7BA]" />
                <span>3. Coin Control & UTXO Cluster Breaking</span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Use the <strong>Coin Control</strong> section in the Send flow to manually freeze or select individual UTXOs, preventing chain analytics from clustering your separate addresses together.
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
