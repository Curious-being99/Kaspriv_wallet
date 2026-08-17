import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  Wallet,
  KaspaTransaction,
  UTXO,
  KaspaNode,
  NetworkType,
  CurrencyType,
  MarketData,
  Contact,
  ProxyConfig,
} from '../types';
import { safeStringify } from '../utils/json';
import { runDatabaseMigrations } from '../utils/dbMigration';
import {
  saveWalletToDB,
  getWalletsFromDB,
  deleteWalletFromDB,
  clearAllWalletsFromDB,
  purgeAllDatabases,
  saveSetting,
  getSetting,
  removeSetting,
  saveUtxosToDB,
  getUtxosFromDB,
  saveTransactionsToDB,
  getTransactionsFromDB,
} from '../utils/storage';
import * as secp from '@noble/secp256k1';
import { 
  encryptWithPassword, 
  decryptWithPassword, 
  buildAadContext,
} from '../utils/crypto';
import { IsolatedSigner } from '../utils/IsolatedSigner';
import {
  kasToSompi,
  sompiToKas,
  formatKas,
  generateRandomKaspaAddress,
  generate24WordMnemonic,
  generateDeterministicAddress,
  getAddressFromPublicKey,
  SOMPI_PER_KAS,
  fetchKaspaPrice,
  fetchKaspaAddressBalance,
  fetchKaspaAddressUtxos,
  fetchKaspaAddressTransactions,
  fetchKaspaFeeEstimate,
  fetchKaspaCurrentDaaScore,
  broadcastKaspaTransaction,
  shortenAddress,
  createSignedTransaction,
  ensureKaspaRuntime,
  sanitizeWalletName,
  scanKaspaWalletChain,
  cleanMnemonic,
  setKaspaApiUrl,
  setKaspaExplorerUrl,
  getPrivateKeyBytesFromMnemonic,
  wipe,
  calculateMinFeeForInputs,
  estimateTransactionMass,
  calculateDynamicFeeForTransaction,
  pingKaspaNode,
  setProxyConfig as setGlobalProxyConfig,
  getProxyConfig as getGlobalProxyConfig,
  testTorOrProxyConnection,
} from '../utils/kaspa';

export interface IndexingState {
  isIndexing: boolean;
  scannedAddresses: number;
  foundAddresses: number;
  balanceSompi: bigint;
}

interface WalletContextType {
  // Wallet State
  indexingState: IndexingState;
  dismissIndexing: () => void;
  wallets: Wallet[];
  activeWallet: Wallet;
  setActiveWalletId: (id: string) => void;
  renameWallet: (walletId: string, newName: string) => void;
  createNewWallet: (name: string, mnemonicWords?: string[], passphrase?: string, addressType?: 'P2PKH' | 'P2SH', password?: string, duressPassword?: string) => Promise<Wallet>;
  importSeedWallet: (name: string, words: string[], passphrase?: string, addressType?: 'P2PKH' | 'P2SH', password?: string, duressPassword?: string) => Promise<Wallet>;
  importKpubWallet: (name: string, kpub: string, addressType?: 'P2PKH' | 'P2SH', password?: string, duressPassword?: string) => Promise<Wallet>;

  // Transactions & Balance
  transactions: KaspaTransaction[];
  utxos: UTXO[];
  sendKaspa: (
    toAddress: string,
    amountKas: number,
    feeKas: number,
    note?: string,
    providedSeedPhrase?: string,
    providedPassphrase?: string,
    selectedUtxoOutpoints?: string[]
  ) => Promise<{ success: boolean; txid?: string; error?: string }>;
  compoundUtxos: (providedSeedPhrase?: string) => Promise<{ success: boolean; txid?: string; countMerged?: number }>;
  toggleLockUtxo: (outpoint: string) => void;

  // Network, Private Nodes & Tor/SOCKS5 Proxy
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  nodes: KaspaNode[];
  activeNode: KaspaNode;
  selectNode: (nodeId: string) => void;
  addCustomNode: (nodeOrUrl: string | KaspaNode, network?: NetworkType, name?: string, apiUrl?: string, explorerUrl?: string) => void;
  deleteCustomNode: (nodeId: string) => void;
  pingNodes: () => Promise<void>;
  proxyConfig: ProxyConfig;
  updateProxyConfig: (config: Partial<ProxyConfig>) => void;
  toggleProxy: (enabled?: boolean) => void;
  testProxyConnection: (config?: ProxyConfig) => Promise<{ ok: boolean; message: string; latencyMs?: number }>;

  // Currency & Market Data
  currency: CurrencyType;
  setCurrency: (c: CurrencyType) => void;
  marketData: MarketData;
  fiatRate: number; // Multiplier against USD

  // Security & Lock
  isInitializing: boolean;
  isPasswordEnabled: boolean;
  password: string | null;
  isLocked: boolean;
  setIsLocked: (val: boolean) => void;
  autoLockDuration: number;
  setAutoLockDuration: (val: number) => void;
  lockOnExit: boolean;
  setLockOnExit: (val: boolean) => void;
  isLoggedOut: boolean;
  setIsLoggedOut: (val: boolean) => void;
  isLogoutConfirmOpen: boolean;
  setIsLogoutConfirmOpen: (open: boolean) => void;
  openLogoutConfirm: () => void;
  confirmLogout: () => void;
  logoutWallet: () => void;
  setPassword: (password: string | null) => void;
  unlockWallet: (password: string) => Promise<boolean>;
  lockWallet: () => void;
  isDuressEnabled: boolean;
  setDuressPassword: (duressPassword: string | null) => Promise<void>;
  executePanicWipe: () => Promise<void>;

  // UI Modal States
  isSendOpen: boolean;
  setIsSendOpen: (open: boolean) => void;
  isReceiveOpen: boolean;
  setIsReceiveOpen: (open: boolean) => void;
  isWalletSetupOpen: boolean;
  setIsWalletSetupOpen: (open: boolean) => void;
  isCompoundOpen: boolean;
  setIsCompoundOpen: (open: boolean) => void;
  isSignMessageOpen: boolean;
  setIsSignMessageOpen: (open: boolean) => void;
  isAssetDetailOpen: boolean;
  setIsAssetDetailOpen: (open: boolean) => void;
  isNodeManagerOpen: boolean;
  setIsNodeManagerOpen: (open: boolean) => void;

  // Bottom Navigation Tab
  activeBottomTab: 'home' | 'history' | 'contacts' | 'settings';
  setActiveBottomTab: (tab: 'home' | 'history' | 'contacts' | 'settings') => void;

  // Contacts
  contacts: Contact[];
  addContact: (name: string, address: string, notes?: string) => void;
  updateContact: (id: string, name: string, address: string, notes?: string) => void;
  deleteContact: (id: string) => void;

  currentDaaScore: number;
  refreshDaaScore: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  scanWalletChainIndex: () => Promise<void>;
  generateNewReceiveAddress: () => Promise<string | null>;
  switchReceiveAddress: (addr: string) => void;
  isScanningChain: boolean;
  isBalanceVisible: boolean;
  setIsBalanceVisible: (visible: boolean) => void;

  // Custom Endpoints
  apiUrl: string;
  setApiUrl: (url: string) => void;
  explorerUrl: string;
  setExplorerUrl: (url: string) => void;

  // Notification Toast
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: () => void;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const CURRENCY_RATES: Record<CurrencyType, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 154.2,
  BTC: 0.00000178,
};

const INITIAL_NODES: KaspaNode[] = [
  {
    id: 'node-official-cloud',
    name: 'Kaspa Official Cloud REST (api.kaspa.org)',
    url: 'grpcs://toccata.kaspium.io',
    apiUrl: 'https://api.kaspa.org',
    explorerUrl: 'https://explorer.kaspa.org',
    network: 'mainnet',
    latencyMs: 12,
    isOnline: true,
    selected: true,
  }
];

const INITIAL_MARKET_DATA: MarketData = {
  priceUsd: 0.0325,
  priceBtc: 0.00000035,
  change24h: 0.0,
  marketCapUsd: 850000000,
  volume24hUsd: 45000000,
  lastUpdated: Date.now(),
};

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  const hasInitRun = useRef(false);

  // Load all app state from IndexedDB on mount
  useEffect(() => {
    if (hasInitRun.current) return;
    hasInitRun.current = true;

    const initApp = async () => {
      try {
        // Pre-load and initialize Kaspa WASM runtime on application startup
        await ensureKaspaRuntime();

        await runDatabaseMigrations();
        
        const savedWallets = await getWalletsFromDB();
        const cleanedWallets = savedWallets.map(w => {
          const cleanName = sanitizeWalletName(w.name, 'Kaspa Wallet');
          if (cleanName !== w.name) {
            const updated = { ...w, name: cleanName };
            saveWalletToDB(updated);
            return updated;
          }
          return w;
        });
        setWallets(cleanedWallets);

        const savedActiveId = await getSetting<string>('kaspa_active_wallet_id');
        if (savedActiveId) setActiveWalletIdState(savedActiveId);

        const passwordEnabled = await getSetting<boolean>('wallet_password_enabled') || await getSetting<boolean>('wallet_pin_enabled');
        const canary = await getSetting('wallet_password_canary') || await getSetting('wallet_pin_canary');
        const duressEnabled = await getSetting<boolean>('wallet_duress_enabled');
        const duressCanary = await getSetting('wallet_duress_canary');
        if (duressEnabled || duressCanary) {
          setIsDuressEnabled(true);
        }

        const loggedOut = await getSetting<boolean>('kaspa_is_logged_out');
        if (loggedOut !== undefined) setIsLoggedOut(loggedOut);

        if (savedWallets.length > 0 && !loggedOut) {
          if (passwordEnabled || canary) {
            setIsPasswordEnabled(true);
            setIsLocked(true);
          }
        }

        const lockDuration = await getSetting<number>('auto_lock_duration');
        if (lockDuration) setAutoLockDuration(lockDuration);

        const savedLockOnExit = await getSetting<boolean>('lock_on_exit');
        if (savedLockOnExit !== undefined) setLockOnExit(savedLockOnExit);

        const savedCustomNodes = await getSetting<KaspaNode[]>('kaspa_custom_nodes');
        const savedSelectedNodeId = await getSetting<string>('kaspa_selected_node_id');

        let mergedNodes = INITIAL_NODES;
        if (savedCustomNodes && Array.isArray(savedCustomNodes) && savedCustomNodes.length > 0) {
          const customList = savedCustomNodes.filter(cn => 
            !INITIAL_NODES.some(inNode => inNode.id === cn.id) &&
            cn.id !== 'node-kaspagov' &&
            cn.id !== 'node-aspectron' &&
            (!cn.apiUrl || (!cn.apiUrl.includes('api.kaspagov.org') && !cn.apiUrl.includes('api.kaspa.aspectron.org')))
          );
          mergedNodes = [...customList, ...INITIAL_NODES];
        }

        let selectedNodeId = savedSelectedNodeId;
        if (selectedNodeId === 'node-kaspagov' || selectedNodeId === 'node-aspectron' || selectedNodeId === 'node-testnet' || selectedNodeId === 'node-devnet') {
          selectedNodeId = 'node-official-cloud';
        }

        if (selectedNodeId) {
          mergedNodes = mergedNodes.map(n => ({ ...n, selected: n.id === selectedNodeId }));
        }

        setNodes(mergedNodes);

        const savedProxyConfig = await getSetting<ProxyConfig>('kaspa_proxy_config');
        if (savedProxyConfig) {
          setProxyConfigState(savedProxyConfig);
          setGlobalProxyConfig(savedProxyConfig);
        }

        const activeLoadedNode = mergedNodes.find(n => n.selected) || mergedNodes[0];

        let savedApiUrl = await getSetting<string>('kaspa_api_url') || activeLoadedNode?.apiUrl;
        if (!savedApiUrl || savedApiUrl.includes('api.kaspagov.org') || savedApiUrl.includes('api.kaspa.aspectron.org') || savedApiUrl.includes('testnet') || savedApiUrl.includes('devnet')) {
          savedApiUrl = 'https://api.kaspa.org';
        }
        if (savedApiUrl) {
          setApiUrl(savedApiUrl);
          setKaspaApiUrl(savedApiUrl);
        }

        let savedExplorerUrl = await getSetting<string>('kaspa_explorer_url') || activeLoadedNode?.explorerUrl;
        if (savedExplorerUrl) {
          setExplorerUrl(savedExplorerUrl);
          setKaspaExplorerUrl(savedExplorerUrl);
        }
      } catch (err) {
        console.error('Failed to initialize app from IndexedDB:', err);
      } finally {
        const isStandalone = typeof window !== 'undefined' && (
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes('android-app://')
        );
        const delay = isStandalone ? 0 : 800;
        setTimeout(() => {
          setIsInitializing(false);
        }, delay);
      }
    };
    initApp();
  }, []);

  const [activeWalletId, setActiveWalletIdState] = useState<string>('');

  // Save wallets to IndexedDB whenever they change (Encryption at Rest)
  useEffect(() => {
    const persistWallets = async () => {
      try {
        for (const wallet of wallets) {
          const toSave = { ...wallet };
          if (toSave.encryptedMnemonic) {
            delete toSave.mnemonic;
            delete toSave.passphrase;
          }
          await saveWalletToDB(toSave);
        }
      } catch (e) {
        console.warn('Failed to save wallets to IndexedDB:', e);
      }
    };
    if (wallets.length > 0) {
      persistWallets();
    }
  }, [wallets]);

  // Save active wallet ID to settings
  useEffect(() => {
    if (activeWalletId) {
      saveSetting('kaspa_active_wallet_id', activeWalletId);
    }
  }, [activeWalletId]);

  const [transactions, setTransactions] = useState<KaspaTransaction[]>([]);
  const transactionsRef = React.useRef(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const utxosRef = React.useRef(utxos);
  useEffect(() => {
    utxosRef.current = utxos;
  }, [utxos]);
  const [isScanningChain, setIsScanningChain] = useState<boolean>(false);
  const [indexingState, setIndexingState] = useState<IndexingState>({
    isIndexing: false,
    scannedAddresses: 0,
    foundAddresses: 0,
    balanceSompi: 0n,
  });

  const [network, setNetwork] = useState<NetworkType>('mainnet');
  const [nodes, setNodes] = useState<KaspaNode[]>(INITIAL_NODES);
  const [currency, setCurrency] = useState<CurrencyType>('USD');
  const [marketData, setMarketData] = useState<MarketData>(INITIAL_MARKET_DATA);
  const [apiUrl, setApiUrl] = useState<string>('https://api.kaspa.org');
  const [explorerUrl, setExplorerUrl] = useState<string>('https://explorer.kaspa.org');

  // Security & Logout
  const [isPasswordEnabled, setIsPasswordEnabled] = useState<boolean>(false);
  const [isDuressEnabled, setIsDuressEnabled] = useState<boolean>(false);
  const [password, setPasswordState] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [lockOnExit, setLockOnExit] = useState<boolean>(true);

  // Auto-lock timer logic
  useEffect(() => {
    if (!isPasswordEnabled || isLocked) return;

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (autoLockDuration > 0) {
        timeoutId = setTimeout(() => {
          lockWalletRef.current();
        }, autoLockDuration * 60 * 1000);
      }
    };

    const handleVisibilityChange = () => {
      if (lockOnExit && document.visibilityState === 'hidden') {
        setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            lockWalletRef.current();
          }
        }, 2000); // 2 second delay
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetTimer();

    if (lockOnExit) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPasswordEnabled, autoLockDuration, lockOnExit, isLocked]);

  // Settings persistence effects
  useEffect(() => {
    saveSetting('auto_lock_duration', autoLockDuration);
  }, [autoLockDuration]);

  useEffect(() => {
    saveSetting('lock_on_exit', lockOnExit);
  }, [lockOnExit]);

  useEffect(() => {
    saveSetting('kaspa_api_url', apiUrl);
    setKaspaApiUrl(apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    saveSetting('kaspa_explorer_url', explorerUrl);
    setKaspaExplorerUrl(explorerUrl);
  }, [explorerUrl]);

  const [isLoggedOut, setIsLoggedOut] = useState<boolean>(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);

  const openLogoutConfirm = () => {
    setIsLogoutConfirmOpen(true);
  };

  const logoutWallet = () => {
    openLogoutConfirm();
  };

  const confirmLogout = async () => {
    setIsSendOpen(false);
    setIsReceiveOpen(false);
    setIsWalletSetupOpen(false);
    setIsCompoundOpen(false);
    setIsSignMessageOpen(false);
    setIsLogoutConfirmOpen(false);
    
    // Clear all wallet data from state
    setWallets([]);
    setActiveWalletIdState('');
    setTransactions([]);
    setUtxos([]);
    
    setIsLoggedOut(true);
    try {
      await saveSetting('kaspa_is_logged_out', true);
      await clearAllWalletsFromDB();
    } catch (e) {}
    
    if (isPasswordEnabled) {
      setIsLocked(true);
      setPasswordState(null);
    }
    showToast('Logged out. All wallet data cleared successfully.', 'info');
  };

  // Modals
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isWalletSetupOpen, setIsWalletSetupOpen] = useState(false);
  const [isCompoundOpen, setIsCompoundOpen] = useState(false);
  const [isSignMessageOpen, setIsSignMessageOpen] = useState(false);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const [isNodeManagerOpen, setIsNodeManagerOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'history' | 'contacts' | 'settings'>('home');
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);

  // Tor / SOCKS5 Proxy Configuration
  const [proxyConfig, setProxyConfigState] = useState<ProxyConfig>({
    enabled: false,
    type: 'tor',
    host: '127.0.0.1',
    port: 9050,
    onionOnly: false,
  });

  const updateProxyConfig = (updated: Partial<ProxyConfig>) => {
    setProxyConfigState((prev) => {
      const next = { ...prev, ...updated };
      setGlobalProxyConfig(next);
      saveSetting('kaspa_proxy_config', next);
      return next;
    });
    showToast(`Proxy settings updated (${updated.type || proxyConfig.type}://${updated.host || proxyConfig.host}:${updated.port || proxyConfig.port})`, 'info');
  };

  const toggleProxy = (enabled?: boolean) => {
    const nextVal = enabled !== undefined ? enabled : !proxyConfig.enabled;
    updateProxyConfig({ enabled: nextVal });
    showToast(
      nextVal
        ? `Tor / SOCKS5 Proxy enabled (${proxyConfig.host}:${proxyConfig.port})`
        : 'Direct connection restored (Proxy disabled)',
      nextVal ? 'success' : 'info'
    );
  };

  const testProxyConnection = async (config?: ProxyConfig) => {
    const target = config || proxyConfig;
    return await testTorOrProxyConnection(target);
  };

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Local pending transactions and spent UTXOs to prevent balance and list flickering during node syncing
  const [localPendingTxs, setLocalPendingTxs] = useState<KaspaTransaction[]>([]);
  const [spentUtxoOutpoints, setSpentUtxoOutpoints] = useState<string[]>([]);
  
  const spentUtxoOutpointsRef = React.useRef(spentUtxoOutpoints);
  useEffect(() => {
    spentUtxoOutpointsRef.current = spentUtxoOutpoints;
  }, [spentUtxoOutpoints]);

  const localPendingTxsRef = React.useRef(localPendingTxs);
  useEffect(() => {
    localPendingTxsRef.current = localPendingTxs;
  }, [localPendingTxs]);

  // Switching wallets and state restoring logic is handled below refreshBalance

  // Contacts Index Storage
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await getSetting<Contact[]>('kaspriv_contacts_v1');
        if (saved && Array.isArray(saved)) {
          setContacts(saved.filter((c: Contact) => c.id !== '1' && c.id !== '2' && !c.address.includes('exampletreasury')));
        } else if (typeof window !== 'undefined' && window.localStorage) {
          const lsSaved = localStorage.getItem('kaspriv_contacts_v1');
          if (lsSaved) {
            const parsed = JSON.parse(lsSaved);
            const filtered = parsed.filter((c: Contact) => c.id !== '1' && c.id !== '2' && !c.address.includes('exampletreasury'));
            setContacts(filtered);
            await saveSetting('kaspriv_contacts_v1', filtered);
            localStorage.removeItem('kaspriv_contacts_v1');
          }
        }
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    if (contacts.length > 0) {
      saveSetting('kaspriv_contacts_v1', contacts).catch(() => {});
    }
  }, [contacts]);

  const addContact = React.useCallback((name: string, address: string, notes?: string) => {
    const newContact: Contact = {
      id: 'contact_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: name.trim(),
      address: address.trim(),
      notes: notes?.trim() || '',
      createdAt: Date.now()
    };
    setContacts(prev => [newContact, ...prev]);
    showToast('Contact saved successfully', 'success');
  }, [showToast]);

  const updateContact = React.useCallback((id: string, name: string, address: string, notes?: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, name: name.trim(), address: address.trim(), notes: notes?.trim() || '' } : c));
    showToast('Contact updated successfully', 'success');
  }, [showToast]);

  const deleteContact = React.useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    showToast('Contact deleted', 'info');
  }, [showToast]);

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  };

  const lockWallet = React.useCallback(() => {
    if (isPasswordEnabled) {
      setPasswordState(null);  // clear password from memory
      setIsLocked(true);
      showToast('Wallet locked', 'info');
    }
  }, [isPasswordEnabled, showToast]);

  const lockWalletRef = React.useRef(lockWallet);
  useEffect(() => {
    lockWalletRef.current = lockWallet;
  }, [lockWallet]);

  // On-chain DAA Score
  const [currentDaaScore, setCurrentDaaScore] = useState<number>(89500000);

  const currentDaaScoreRef = React.useRef(currentDaaScore);
  useEffect(() => {
    currentDaaScoreRef.current = currentDaaScore;
  }, [currentDaaScore]);

  const refreshDaaScore = React.useCallback(async () => {
    try {
      const liveDaa = await fetchKaspaCurrentDaaScore();
      if (liveDaa && liveDaa > 0) {
        setCurrentDaaScore(liveDaa);
      }
    } catch (err) {
      // Failed to fetch live DAA score
    }
  }, []);

  const activeWallet = React.useMemo(() => {
    const dummyWallet: Wallet = {
      id: 'dummy',
      name: '',
      receiveAddress: '',
      changeAddress: '',
      balanceSompi: 0n,
      createdAt: 0,
    };
    const wallet = wallets.find((w) => w.id === activeWalletId) || wallets[0] || dummyWallet;
    if (wallet.id === 'dummy') return wallet;

    return wallet;
  }, [wallets, activeWalletId]);

  const activeWalletRef = React.useRef(activeWallet);
  useEffect(() => {
    activeWalletRef.current = activeWallet;
  }, [activeWallet]);

  const networkRef = React.useRef(network);
  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  const activeNode = nodes.find((n) => n.network === network && n.selected) || nodes.find((n) => n.network === network) || nodes[0];

  const fiatRate = CURRENCY_RATES[currency] || 1.0;
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Poll CoinGecko & Kaspa REST API for market data and live address balance
  const isRefreshingBalance = useRef(false);

  const refreshBalance = React.useCallback(async () => {
    if (isRefreshingBalance.current) return;
    isRefreshingBalance.current = true;

    try {
      // Fetch live DAA Score
      await refreshDaaScore();

      // 1. Live Kaspa price
      const kaspaPriceData = await fetchKaspaPrice();
      if (kaspaPriceData) {
        setMarketData((prev) => ({
          ...prev,
          priceUsd: kaspaPriceData.price,
          change24h: kaspaPriceData.usd24hChange ?? prev.change24h,
          lastUpdated: Date.now(),
        }));
      }

      // 2. Live Kaspa address balance & UTXOs from api.kaspa.org
      const wallet = activeWalletRef.current;
      if (wallet && wallet.receiveAddress) {
        const addressesToFetch = wallet.discoveredAddresses && wallet.discoveredAddresses.length > 0
          ? wallet.discoveredAddresses
          : [wallet.receiveAddress];

        // 1. Fetch live balances and UTXOs in parallel for all addresses
        const [balances, utxosResults, txResults] = await Promise.all([
          Promise.all(addressesToFetch.map(addr => fetchKaspaAddressBalance(addr))),
          Promise.all(addressesToFetch.map(addr => fetchKaspaAddressUtxos(addr))),
          Promise.all(addressesToFetch.map(addr => fetchKaspaAddressTransactions(addr))),
        ]);

        const totalLiveBalance = (balances as (bigint | null)[]).reduce<bigint>((sum, bal) => sum + (bal !== null && bal !== undefined ? bal : 0n), 0n);

        // Assemble UTXOs for all addresses
        const allMergedUtxos: UTXO[] = [];
        utxosResults.forEach((liveUtxosData, addrIdx) => {
          const address = addressesToFetch[addrIdx];
          if (liveUtxosData && Array.isArray(liveUtxosData)) {
            liveUtxosData.forEach((u: any, idx: number) => {
              const devPath = wallet.addressPaths?.[address];
              allMergedUtxos.push({
                id: `utxo-live-${u.outpoint?.transactionId || u.transaction_id || idx}-${idx}`,
                txid: u.outpoint?.transactionId || u.transaction_id || '',
                vout: u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0),
                amountSompi: BigInt(u.utxoEntry?.amount || u.amount || 0),
                address,
                blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.block_daa_score || 0),
                derivationPath: devPath,
              });
            });
          }
        });

        // Filter out locally spent UTXOs to prevent balance and UTXO flickering while node updates
        const spentSet = new Set(spentUtxoOutpointsRef.current);
        const filteredUtxos = allMergedUtxos.filter((u) => {
          const outpoint = `${u.txid}:${u.vout}`;
          return !spentSet.has(outpoint);
        });
        setUtxos(filteredUtxos);
        try {
          saveUtxosToDB(wallet.id, filteredUtxos);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(`kaspriv_utxos_cache_${wallet.id}`);
          }
        } catch (e) {
          console.warn('Failed to cache UTXOs to IndexedDB:', e);
        }

        // Calculate verified live spendable balance from actual unspent UTXO set
        const utxoSum = filteredUtxos.reduce((sum, u) => sum + u.amountSompi, 0n);
        const verifiedBalance = (allMergedUtxos.length > 0 || spentUtxoOutpointsRef.current.length > 0)
          ? utxoSum
          : totalLiveBalance;

        const updatedBalances: { [address: string]: string } = {};
        addressesToFetch.forEach((addr, idx) => {
          const addrUtxos = filteredUtxos.filter(u => u.address === addr);
          const addrUtxoSum = addrUtxos.reduce((s, u) => s + u.amountSompi, 0n);
          updatedBalances[addr] = ((allMergedUtxos.length > 0 || spentUtxoOutpointsRef.current.length > 0)
            ? addrUtxoSum
            : (balances[idx] || 0n)
          ).toString();
        });

        setWallets((prev: Wallet[]) =>
          prev.map((w): Wallet => (w.id === wallet.id ? { 
            ...w, 
            balanceSompi: verifiedBalance,
            addressBalances: updatedBalances
          } : w))
        );

        // Clean up spentUtxoOutpoints: keep only outpoints that the API node still mistakenly returns
        const liveOutpointKeys = new Set(allMergedUtxos.map(u => `${u.txid}:${u.vout}`));
        setSpentUtxoOutpoints((prev) => prev.filter(op => liveOutpointKeys.has(op)));

        // Process transactions for all addresses and merge them
        
        const seenTxids = new Set<string>();
        const allMergedTxs: KaspaTransaction[] = [];
        
        txResults.forEach((liveTxsData) => {
          if (liveTxsData && Array.isArray(liveTxsData)) {
            liveTxsData.forEach((tx: any) => {
              const txid = tx.transaction_id || tx.txid || '';
              if (!txid || seenTxids.has(txid)) return;
              seenTxids.add(txid);

              const belongsToUs = (addr: string) => {
                if (!addr) return false;
                const normalized = addr.trim().toLowerCase();
                return addressesToFetch.some(a => a.trim().toLowerCase() === normalized);
              };

              const hasOurAddressInOutputs = tx.outputs?.some((out: any) => {
                const outAddr = out.script_public_key_address || out.address;
                return belongsToUs(outAddr);
              });

              const hasOurAddressInInputs = tx.inputs?.some((inp: any) => 
                belongsToUs(inp.previous_outpoint_address) || belongsToUs(inp.address)
              );

              // If we have an input, it's outgoing. 
              // If we don't have input info (fallback API), but we don't find our address in any output,
              // then it must be outgoing (since the API returned it for our address).
              const isOut = hasOurAddressInInputs || (tx.outputs && tx.outputs.length > 0 && !hasOurAddressInOutputs);
              
              let amountSompi = 0n;
              if (isOut) {
                // Outgoing: Sum of outputs NOT going back to any of our addresses
                amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
                  const outAddr = out.script_public_key_address || out.address;
                  if (!belongsToUs(outAddr)) {
                    return acc + BigInt(out.amount || 0);
                  }
                  return acc;
                }, 0n) || 0n;
              } else {
                // Incoming: Sum of outputs going to any of our addresses
                amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
                  const outAddr = out.script_public_key_address || out.address;
                  if (belongsToUs(outAddr)) {
                    return acc + BigInt(out.amount || 0);
                  }
                  return acc;
                }, 0n) || 0n;
              }

              // Fee calculation
              const sumInputs: bigint = tx.inputs?.reduce((acc: bigint, inp: any) => 
                acc + BigInt(inp.previous_outpoint_amount || inp.amount || 0), 0n) || 0n;
              const sumOutputs: bigint = tx.outputs?.reduce((acc: bigint, out: any) => 
                acc + BigInt(out.amount || 0), 0n) || 0n;
              const feeSompi: bigint = (sumInputs > sumOutputs) ? (sumInputs - sumOutputs) : BigInt(tx.fee || 0);

              const firstTargetOutput = tx.outputs?.find((out: any) => {
                const outAddr = out.script_public_key_address || out.address;
                return isOut ? !belongsToUs(outAddr) : belongsToUs(outAddr);
              });
              
              const txAddress: string = firstTargetOutput?.script_public_key_address || 
                                       firstTargetOutput?.address || 
                                       wallet.receiveAddress;

              const txType = isOut ? (amountSompi === 0n ? 'compound' : 'send') : 'receive';

              allMergedTxs.push({
                txid,
                type: txType,
                amountSompi,
                feeSompi,
                address: txAddress,
                timestamp: tx.block_time ? Number(tx.block_time) : Date.now(),
                blockDaaScore: Number(tx.block_daa_score || tx.accepting_block_blue_score || tx.accepting_block_daa_score || 0),
                note: txType === 'compound' ? 'Compounded UTXOs' : (isOut ? 'Sent Kaspa' : 'Received Kaspa'),
                isAccepted: Boolean(tx.is_accepted ?? true),
                confirmations: 1,
              });
            });
          }
        });

        // Merge newly fetched live transactions with existing transactions so history discovered during import or scan is never lost
        const existingTxs = transactionsRef.current || [];
        const txMap = new Map<string, KaspaTransaction>();

        // 1. Existing transactions (from scan or DB)
        existingTxs.forEach((tx) => {
          if (tx && tx.txid) {
            txMap.set(tx.txid, tx);
          }
        });

        // 2. Overwrite / update with newly fetched live transactions
        allMergedTxs.forEach((tx) => {
          if (tx && tx.txid) {
            txMap.set(tx.txid, tx);
          }
        });

        // 3. Include local pending transactions
        localPendingTxsRef.current.forEach((ptx) => {
          if (ptx && ptx.txid && !txMap.has(ptx.txid)) {
            txMap.set(ptx.txid, ptx);
          }
        });

        const combinedTxs = Array.from(txMap.values());
        combinedTxs.sort((a, b) => b.timestamp - a.timestamp);

        setTransactions(combinedTxs);
        try {
          saveTransactionsToDB(wallet.id, combinedTxs);
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(`kaspriv_tx_cache_${wallet.id}`);
          }
        } catch (e) {
          console.warn('Failed to cache transactions to IndexedDB:', e);
        }

        // Synchronize pending transactions: remove any that are now in allMergedTxs
        const fetchedTxids = new Set(allMergedTxs.map((tx) => tx.txid));
        setLocalPendingTxs((prev) => prev.filter((ptx) => !fetchedTxids.has(ptx.txid)));

      // Perform Automatic Receive Address Rotation if needed
      // Check if the current receive address has received any funds
      const currentReceiveAddress = wallet.receiveAddress;
      const currentBalance = BigInt(updatedBalances[currentReceiveAddress] || '0');
      const hasPositiveBalance = currentBalance > 0n;

      const currentAddrIdx = addressesToFetch.indexOf(currentReceiveAddress);
      let hasTxHistory = false;
      if (currentAddrIdx !== -1) {
        const currentAddrTxs = txResults[currentAddrIdx];
        if (currentAddrTxs && Array.isArray(currentAddrTxs) && currentAddrTxs.length > 0) {
          // Verify that this address actually received funds (was present in transaction outputs)
          hasTxHistory = currentAddrTxs.some((tx: any) => {
            return tx.outputs?.some((out: any) => out.script_public_key_address === currentReceiveAddress);
          });
        }
      }

      const isCurrentUsed = hasPositiveBalance || hasTxHistory;

      // Check change address usage for rotation
      const currentChangeAddress = wallet.changeAddress;
      const currentChangeBalance = BigInt(updatedBalances[currentChangeAddress] || '0');
      const hasChangePositiveBalance = currentChangeBalance > 0n;
      const currentChangeAddrIdx = addressesToFetch.indexOf(currentChangeAddress);
      let hasChangeTxHistory = false;
      if (currentChangeAddrIdx !== -1) {
        const currentChangeAddrTxs = txResults[currentChangeAddrIdx];
        if (currentChangeAddrTxs && Array.isArray(currentChangeAddrTxs) && currentChangeAddrTxs.length > 0) {
          hasChangeTxHistory = currentChangeAddrTxs.some((tx: any) => {
            const outputs = tx.outputs || [];
            return outputs.some((out: any) => (out.script_public_key_address || out.address) === currentChangeAddress);
          });
        }
      }
      const isChangeCurrentUsed = hasChangePositiveBalance || hasChangeTxHistory;

      if (isCurrentUsed || isChangeCurrentUsed) {
        const paths = wallet.addressPaths || {};
        const allDiscovered = wallet.discoveredAddresses || [];

        // 1. Handle Receive Address Rotation
        if (isCurrentUsed) {
          const receiveAddressesList = allDiscovered
            .filter((addr) => {
              const p = paths[addr] || '';
              return !p.includes('/1/');
            })
            .map((addr) => {
              const p = paths[addr] || '';
              const parts = p.split('/');
              const idx = parseInt(parts[parts.length - 1] || '0', 10);
              return { addr, idx };
            })
            .sort((a, b) => a.idx - b.idx);

          const firstUnusedRecv = receiveAddressesList.find((item) => {
            const bal = BigInt(updatedBalances[item.addr] || '0');
            if (bal > 0n) return false;

            const addrIdx = addressesToFetch.indexOf(item.addr);
            if (addrIdx !== -1) {
              const addrTxs = txResults[addrIdx];
              if (addrTxs && Array.isArray(addrTxs) && addrTxs.length > 0) {
                const receivedAny = addrTxs.some((tx: any) =>
                  (tx.outputs || []).some((out: any) => (out.script_public_key_address || out.address) === item.addr)
                );
                if (receivedAny) return false;
              }
            }
            return true;
          });

          if (firstUnusedRecv) {
            setWallets((prev) =>
              prev.map((w) =>
                w.id === wallet.id
                  ? { ...w, receiveAddress: firstUnusedRecv.addr }
                  : w
              )
            );
            console.log(`[Auto-Rotation] Rotated receive address to ${firstUnusedRecv.addr}`);
          } else {
            // Derive new receive if all pre-derived are used
            let seedToUse = wallet.mnemonic;
            let passToUse = wallet.passphrase;
            const activePassword = password;
            
            if (!seedToUse && wallet.encryptedMnemonic && activePassword) {
              try {
                seedToUse = await decryptWithPassword(
                  wallet.encryptedMnemonic.ciphertext,
                  wallet.encryptedMnemonic.salt,
                  wallet.encryptedMnemonic.iv,
                  activePassword,
                  buildAadContext('MNEMONIC', wallet.id)
                );
                if (wallet.encryptedPassphrase) {
                  passToUse = await decryptWithPassword(
                    wallet.encryptedPassphrase.ciphertext,
                    wallet.encryptedPassphrase.salt,
                    wallet.encryptedPassphrase.iv,
                    activePassword,
                    buildAadContext('PASSPHRASE', wallet.id)
                  );
                }
              } catch (err) {}
            }

            if (seedToUse) {
              const maxIdx = receiveAddressesList.reduce((max, item) => Math.max(max, item.idx), 0);
              const nextIdx = maxIdx + 1;
              const networkType = wallet.addressType || 'P2PKH';
              const prefix = networkRef.current === 'mainnet' ? 'kaspa' : networkRef.current === 'testnet-10' ? 'kaspatest' : 'kaspadev';
              const nextPath = `m/44'/111111'/0'/0/${nextIdx}`;
              
              try {
                const newAddr = await generateDeterministicAddress(seedToUse, passToUse || undefined, prefix, networkType, nextIdx, false);
                setWallets((prev) =>
                  prev.map((w) => {
                    if (w.id === wallet.id) {
                      const updatedDiscovered = w.discoveredAddresses ? [...w.discoveredAddresses] : [];
                      if (!updatedDiscovered.includes(newAddr)) updatedDiscovered.push(newAddr);
                      return {
                        ...w,
                        discoveredAddresses: updatedDiscovered,
                        addressPaths: { ...w.addressPaths, [newAddr]: nextPath },
                        addressBalances: { ...w.addressBalances, [newAddr]: '0' },
                        receiveAddress: newAddr,
                      };
                    }
                    return w;
                  })
                );
              } catch (err) {}
            }
          }
        }

        // 2. Handle Change Address Rotation
        if (isChangeCurrentUsed) {
          const changeAddressesList = allDiscovered
            .filter((addr) => {
              const p = paths[addr] || '';
              return p.includes('/1/');
            })
            .map((addr) => {
              const p = paths[addr] || '';
              const parts = p.split('/');
              const idx = parseInt(parts[parts.length - 1] || '0', 10);
              return { addr, idx };
            })
            .sort((a, b) => a.idx - b.idx);

          const firstUnusedChange = changeAddressesList.find((item) => {
            const bal = BigInt(updatedBalances[item.addr] || '0');
            if (bal > 0n) return false;

            const addrIdx = addressesToFetch.indexOf(item.addr);
            if (addrIdx !== -1) {
              const addrTxs = txResults[addrIdx];
              if (addrTxs && Array.isArray(addrTxs) && addrTxs.length > 0) {
                const receivedAny = addrTxs.some((tx: any) =>
                  (tx.outputs || []).some((out: any) => (out.script_public_key_address || out.address) === item.addr)
                );
                if (receivedAny) return false;
              }
            }
            return true;
          });

          if (firstUnusedChange) {
            setWallets((prev) =>
              prev.map((w) =>
                w.id === wallet.id
                  ? { ...w, changeAddress: firstUnusedChange.addr }
                  : w
              )
            );
            console.log(`[Auto-Rotation] Rotated change address to ${firstUnusedChange.addr}`);
          } else {
            // Derive new change address if needed
            let seedToUse = wallet.mnemonic;
            let passToUse = wallet.passphrase;
            const activePassword = password;
            
            if (!seedToUse && wallet.encryptedMnemonic && activePassword) {
              try {
                seedToUse = await decryptWithPassword(
                  wallet.encryptedMnemonic.ciphertext,
                  wallet.encryptedMnemonic.salt,
                  wallet.encryptedMnemonic.iv,
                  activePassword,
                  buildAadContext('MNEMONIC', wallet.id)
                );
                if (wallet.encryptedPassphrase) {
                  passToUse = await decryptWithPassword(
                    wallet.encryptedPassphrase.ciphertext,
                    wallet.encryptedPassphrase.salt,
                    wallet.encryptedPassphrase.iv,
                    activePassword,
                    buildAadContext('PASSPHRASE', wallet.id)
                  );
                }
              } catch (err) {}
            }

            if (seedToUse) {
              const maxIdx = changeAddressesList.reduce((max, item) => Math.max(max, item.idx), 0);
              const nextIdx = maxIdx + 1;
              const networkType = wallet.addressType || 'P2PKH';
              const prefix = networkRef.current === 'mainnet' ? 'kaspa' : networkRef.current === 'testnet-10' ? 'kaspatest' : 'kaspadev';
              const nextPath = `m/44'/111111'/0'/1/${nextIdx}`;
              
              try {
                const newAddr = await generateDeterministicAddress(seedToUse, passToUse || undefined, prefix, networkType, nextIdx, true);
                setWallets((prev) =>
                  prev.map((w) => {
                    if (w.id === wallet.id) {
                      const updatedDiscovered = w.discoveredAddresses ? [...w.discoveredAddresses] : [];
                      if (!updatedDiscovered.includes(newAddr)) updatedDiscovered.push(newAddr);
                      return {
                        ...w,
                        discoveredAddresses: updatedDiscovered,
                        addressPaths: { ...w.addressPaths, [newAddr]: nextPath },
                        addressBalances: { ...w.addressBalances, [newAddr]: '0' },
                        changeAddress: newAddr,
                      };
                    }
                    return w;
                  })
                );
              } catch (err) {}
            }
          }
        }
      }
      }
    } finally {
      isRefreshingBalance.current = false;
    }
  }, [refreshDaaScore, password]);

  // Clear pending states and load cached transactions/UTXOs from IndexedDB instantly when switching wallets or unlocking
  useEffect(() => {
    if (!activeWalletId) return;

    setLocalPendingTxs([]);
    setSpentUtxoOutpoints([]);

    let isMounted = true;

    (async () => {
      // Load cached transactions from IndexedDB
      try {
        let cachedTxs = await getTransactionsFromDB(activeWalletId);
        // Fallback migration from localStorage if IDB has no cached txs yet
        if ((!cachedTxs || cachedTxs.length === 0) && typeof window !== 'undefined' && window.localStorage) {
          const cachedTxsStr = localStorage.getItem(`kaspriv_tx_cache_${activeWalletId}`);
          if (cachedTxsStr) {
            try {
              const parsed = JSON.parse(cachedTxsStr);
              cachedTxs = parsed.map((tx: any) => ({
                ...tx,
                amountSompi: BigInt(tx.amountSompi || '0'),
                feeSompi: BigInt(tx.feeSompi || '0'),
              }));
              await saveTransactionsToDB(activeWalletId, cachedTxs);
              localStorage.removeItem(`kaspriv_tx_cache_${activeWalletId}`);
            } catch (e) {}
          }
        }
        if (isMounted) {
          if (cachedTxs && cachedTxs.length > 0) {
            setTransactions(cachedTxs);
          } else if (transactionsRef.current.length === 0) {
            setTransactions([]);
          }
        }
      } catch (e) {
        console.warn('Failed to load cached transactions from IndexedDB:', e);
        if (isMounted && transactionsRef.current.length === 0) setTransactions([]);
      }

      // Load cached UTXOs from IndexedDB
      try {
        let cachedUtxos = await getUtxosFromDB(activeWalletId);
        // Fallback migration from localStorage if IDB has no cached UTXOs yet
        if ((!cachedUtxos || cachedUtxos.length === 0) && typeof window !== 'undefined' && window.localStorage) {
          const cachedUtxosStr = localStorage.getItem(`kaspriv_utxos_cache_${activeWalletId}`);
          if (cachedUtxosStr) {
            try {
              const parsed = JSON.parse(cachedUtxosStr);
              cachedUtxos = parsed.map((u: any) => ({
                ...u,
                amountSompi: BigInt(u.amountSompi || '0'),
              }));
              await saveUtxosToDB(activeWalletId, cachedUtxos);
              localStorage.removeItem(`kaspriv_utxos_cache_${activeWalletId}`);
            } catch (e) {}
          }
        }
        if (isMounted) {
          if (cachedUtxos && cachedUtxos.length > 0) {
            setUtxos(cachedUtxos);
          } else if (utxosRef.current.length === 0) {
            setUtxos([]);
          }
        }
      } catch (e) {
        console.warn('Failed to load cached UTXOs from IndexedDB:', e);
        if (isMounted && utxosRef.current.length === 0) setUtxos([]);
      }
      // Trigger fresh network synchronization as long as wallet is unlocked
      if (!isLocked) {
        refreshBalance();
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeWalletId, isLocked, refreshBalance]);

  const refreshBalanceRef = React.useRef(refreshBalance);


  useEffect(() => {
    refreshBalanceRef.current = refreshBalance;
  }, [refreshBalance]);

  const refreshPrice = React.useCallback(async () => {
    try {
      const kaspaPriceData = await fetchKaspaPrice();
      if (kaspaPriceData) {
        setMarketData((prev) => ({
          ...prev,
          priceUsd: kaspaPriceData.price,
          change24h: kaspaPriceData.usd24hChange ?? prev.change24h,
          lastUpdated: Date.now(),
        }));
      }
    } catch (err) {
      console.error('[Price-Sync] Failed to fetch price:', err);
    }
  }, []);

  useEffect(() => {
    refreshBalanceRef.current();
    // Background polling interval removed for balance as per user request
    // But we keep price polling for real-time asset value updates
    const priceInterval = setInterval(() => refreshPrice(), 30000); // 30s price refresh
    return () => clearInterval(priceInterval);
  }, [refreshPrice]);

  // Auto-sync wallet state logic removed as it's no longer necessary with persistent IndexedDB

  // Ping Nodes
  const pingNodes = async () => {
    try {
      const updated = await Promise.all(
        nodes.map(async (node) => {
          const checkUrl = node.apiUrl || (node.url.startsWith('http') ? node.url : 'https://api.kaspa.org');
          const res = await pingKaspaNode(checkUrl);
          return {
            ...node,
            latencyMs: res.ok ? res.latencyMs : (node.latencyMs || 45),
            isOnline: res.ok,
          };
        })
      );
      setNodes(updated);
      showToast('Nodes pinged and health updated', 'info');
    } catch {
      showToast('Completed node ping test', 'info');
    }
  };

  const selectNode = (nodeId: string) => {
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      }))
    );

    if (targetNode.apiUrl) {
      setApiUrl(targetNode.apiUrl);
      setKaspaApiUrl(targetNode.apiUrl);
      saveSetting('kaspa_api_url', targetNode.apiUrl);
    }

    if (targetNode.explorerUrl) {
      setExplorerUrl(targetNode.explorerUrl);
      setKaspaExplorerUrl(targetNode.explorerUrl);
      saveSetting('kaspa_explorer_url', targetNode.explorerUrl);
    }

    saveSetting('kaspa_selected_node_id', nodeId);

    // Refresh balance and address state immediately with new node
    setTimeout(() => {
      refreshBalanceRef.current();
    }, 100);

    showToast(`Connected to ${targetNode.name || targetNode.url}`, 'success');
  };

  const addCustomNode = (
    nodeOrUrl: string | KaspaNode,
    net: NetworkType = 'mainnet',
    name?: string,
    customApiUrl?: string,
    customExpUrl?: string
  ) => {
    let newNode: KaspaNode;
    if (typeof nodeOrUrl === 'object' && nodeOrUrl !== null) {
      newNode = {
        ...nodeOrUrl,
        isCustom: true,
        selected: true,
      };
    } else {
      newNode = {
        id: `custom-node-${Date.now()}`,
        name: name || `Custom Node (${nodeOrUrl})`,
        url: nodeOrUrl,
        apiUrl: customApiUrl || nodeOrUrl,
        explorerUrl: customExpUrl || 'https://explorer.kaspa.org',
        network: net,
        latencyMs: 18,
        isOnline: true,
        isCustom: true,
        selected: true,
      };
    }

    setNodes((prev) => {
      const updated = [newNode, ...prev.map((n) => ({ ...n, selected: false }))];
      const customOnly = updated.filter((n) => n.isCustom);
      saveSetting('kaspa_custom_nodes', customOnly);
      saveSetting('kaspa_selected_node_id', newNode.id);
      return updated;
    });

    if (newNode.apiUrl) {
      setApiUrl(newNode.apiUrl);
      setKaspaApiUrl(newNode.apiUrl);
      saveSetting('kaspa_api_url', newNode.apiUrl);
    }

    if (newNode.explorerUrl) {
      setExplorerUrl(newNode.explorerUrl);
      setKaspaExplorerUrl(newNode.explorerUrl);
      saveSetting('kaspa_explorer_url', newNode.explorerUrl);
    }

    showToast(`Added and connected to ${newNode.name || newNode.url}`, 'success');
  };

  const deleteCustomNode = (nodeId: string) => {
    setNodes((prev) => {
      const nodeToDelete = prev.find((n) => n.id === nodeId);
      const remaining = prev.filter((n) => n.id !== nodeId);
      if (nodeToDelete?.selected && remaining.length > 0) {
        remaining[0].selected = true;
        if (remaining[0].apiUrl) {
          setApiUrl(remaining[0].apiUrl);
          setKaspaApiUrl(remaining[0].apiUrl);
        }
      }
      const customOnly = remaining.filter((n) => n.isCustom);
      saveSetting('kaspa_custom_nodes', customOnly);
      return remaining;
    });
    showToast('Custom node removed', 'info');
  };

  const toggleLockUtxo = (outpoint: string) => {
    const curWallet = activeWalletRef.current;
    if (!curWallet || !curWallet.id || curWallet.id === 'dummy') return;

    const currentLocked = curWallet.lockedUtxoOutpoints || [];
    const exists = currentLocked.includes(outpoint);
    const updatedLocked = exists
      ? currentLocked.filter((o) => o !== outpoint)
      : [...currentLocked, outpoint];

    setWallets((prev) =>
      prev.map((w) => (w.id === curWallet.id ? { ...w, lockedUtxoOutpoints: updatedLocked } : w))
    );

    showToast(exists ? 'UTXO unlocked' : 'UTXO locked / frozen (excluded from auto-spend)', 'info');
  };

  const setActiveWalletId = (id: string) => {
    setActiveWalletIdState(id);
    setIsLoggedOut(false);
    try {
      saveSetting('kaspa_is_logged_out', false);
    } catch (e) {}
    showToast(`Switched to wallet`, 'info');
  };

  const renameWallet = (walletId: string, newName: string) => {
    const trimmed = sanitizeWalletName(newName.trim(), 'Kaspa Wallet');
    if (!trimmed) return;
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, name: trimmed } : w))
    );
    showToast(`Wallet renamed to '${trimmed}'`, 'success');
  };

  const dismissIndexing = () => {
    setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
  };

  const createNewWallet = async (name: string, mnemonicWords?: string[], passphrase?: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH', password?: string, duressPassword?: string): Promise<Wallet> => {
    const words = mnemonicWords && mnemonicWords.length === 24 ? mnemonicWords : generate24WordMnemonic();
    const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
    let mStr = cleanMnemonic(words.join(' '));
    
    let scanRes;
    try {
      scanRes = await scanKaspaWalletChain(
        mStr, passphrase, prefix, addressType, 1
      );
    } catch (err) {
      const derivedAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, false);
      const derivedChangeAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, true);
      scanRes = {
        primaryAddress: derivedAddr,
        primaryChangeAddress: derivedChangeAddr,
        totalBalanceSompi: 0n,
        discoveredAddresses: [],
        allUtxos: [],
        allTransactions: [],
      };
    } finally {
      if (password) {
        setIsPasswordEnabled(true);
        setPasswordState(password);
        setIsLocked(true);
      }
      setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    }
    
    const addrPaths: { [address: string]: string } = {};
    const initialBalances: { [address: string]: string } = {};
    const discoveredAddressesList: string[] = [];

    if (scanRes.discoveredAddresses) {
      scanRes.discoveredAddresses.forEach((da: any) => {
        addrPaths[da.address] = da.path;
        initialBalances[da.address] = (da.balanceSompi || 0n).toString();
        if (!discoveredAddressesList.includes(da.address)) {
          discoveredAddressesList.push(da.address);
        }
      });
    }

    // Pre-derive a pool of 10 receive addresses (index 0 to 9) to support offline/locked auto-rotation
    for (let idx = 0; idx < 10; idx++) {
      const path = `m/44'/111111'/0'/0/${idx}`;
      const addr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, idx, false);
      addrPaths[addr] = path;
      initialBalances[addr] = initialBalances[addr] || '0';
      if (!discoveredAddressesList.includes(addr)) {
        discoveredAddressesList.push(addr);
      }
    }

    // Pre-derive 5 change addresses (index 0 to 4)
    for (let idx = 0; idx < 5; idx++) {
      const path = `m/44'/111111'/0'/1/${idx}`;
      const addr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, idx, true);
      addrPaths[addr] = path;
      initialBalances[addr] = initialBalances[addr] || '0';
      if (!discoveredAddressesList.includes(addr)) {
        discoveredAddressesList.push(addr);
      }
    }

    const changeAddr = scanRes.primaryChangeAddress || (await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, true));

    try {
      const activePassword = password;
      let encryptedMnemonic;
      let encryptedPassphrase;
      
      const walletId = `w-${Date.now()}`;
      if (activePassword) {
        encryptedMnemonic = await encryptWithPassword(mStr, activePassword, buildAadContext('MNEMONIC', walletId));
        if (passphrase) {
          encryptedPassphrase = await encryptWithPassword(passphrase, activePassword, buildAadContext('PASSPHRASE', walletId));
        }
      }

      const newW: Wallet = {
        id: walletId,
        name: sanitizeWalletName(name, 'Primary Wallet'),
        receiveAddress: scanRes.primaryAddress,
        changeAddress: changeAddr || scanRes.primaryAddress,
        mnemonic: activePassword ? undefined : mStr, // Do not store plaintext if password is active
        passphrase: activePassword ? undefined : (passphrase || undefined),
        encryptedMnemonic,
        encryptedPassphrase,
        balanceSompi: scanRes.totalBalanceSompi,
        createdAt: Date.now(),
        addressType,
        discoveredAddresses: discoveredAddressesList,
        addressPaths: addrPaths,
        addressBalances: initialBalances,
      };

      if (password) {
        await setPassword(password);
        setIsLocked(true);
        setPasswordState(null);
      }

      if (duressPassword) {
        await setDuressPassword(duressPassword);
      }

      setWallets((prev) => [...prev, newW]);
      setActiveWalletIdState(newW.id);
      setIsLoggedOut(false);
      try {
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}
      showToast(`Created wallet '${newW.name}'`, 'success');
      return newW;
    } finally {
      // Wipe mnemonic string from memory
      mStr = '';
    }
  };

  const parseRawKaspaTransactions = (rawTxsData: any[], addressesToMatch: string[], defaultAddress = ''): KaspaTransaction[] => {
    if (!rawTxsData || !Array.isArray(rawTxsData)) return [];
    const seenTxids = new Set<string>();
    const allMergedTxs: KaspaTransaction[] = [];
    const normalizedAddresses = new Set(addressesToMatch.map(a => a.trim().toLowerCase()));

    const belongsToUs = (addr: string) => {
      if (!addr) return false;
      return normalizedAddresses.has(addr.trim().toLowerCase());
    };

    rawTxsData.forEach((tx: any) => {
      const txid = tx.transaction_id || tx.txid || '';
      if (!txid || seenTxids.has(txid)) return;
      seenTxids.add(txid);

      const hasOurAddressInOutputs = tx.outputs?.some((out: any) => {
        const outAddr = out.script_public_key_address || out.address;
        return belongsToUs(outAddr);
      });

      const hasOurAddressInInputs = tx.inputs?.some((inp: any) => 
        belongsToUs(inp.previous_outpoint_address) || belongsToUs(inp.address)
      );

      const isOut = hasOurAddressInInputs || (tx.outputs && tx.outputs.length > 0 && !hasOurAddressInOutputs);
      
      let amountSompi = 0n;
      if (isOut) {
        amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
          const outAddr = out.script_public_key_address || out.address;
          if (!belongsToUs(outAddr)) {
            return acc + BigInt(out.amount || 0);
          }
          return acc;
        }, 0n) || 0n;
      } else {
        amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
          const outAddr = out.script_public_key_address || out.address;
          if (belongsToUs(outAddr)) {
            return acc + BigInt(out.amount || 0);
          }
          return acc;
        }, 0n) || 0n;
      }

      const sumInputs: bigint = tx.inputs?.reduce((acc: bigint, inp: any) => 
        acc + BigInt(inp.previous_outpoint_amount || inp.amount || 0), 0n) || 0n;
      const sumOutputs: bigint = tx.outputs?.reduce((acc: bigint, out: any) => 
        acc + BigInt(out.amount || 0), 0n) || 0n;
      const feeSompi: bigint = (sumInputs > sumOutputs) ? (sumInputs - sumOutputs) : BigInt(tx.fee || 0);

      const firstTargetOutput = tx.outputs?.find((out: any) => {
        const outAddr = out.script_public_key_address || out.address;
        return isOut ? !belongsToUs(outAddr) : belongsToUs(outAddr);
      });
      
      const txAddress: string = firstTargetOutput?.script_public_key_address || 
                               firstTargetOutput?.address || 
                               defaultAddress;

      const txType = isOut ? (amountSompi === 0n ? 'compound' : 'send') : 'receive';

      allMergedTxs.push({
        txid,
        type: txType,
        amountSompi,
        feeSompi,
        address: txAddress,
        timestamp: tx.block_time ? Number(tx.block_time) : Date.now(),
        blockDaaScore: Number(tx.block_daa_score || tx.accepting_block_blue_score || tx.accepting_block_daa_score || 0),
        note: txType === 'compound' ? 'Compounded UTXOs' : (isOut ? 'Sent Kaspa' : 'Received Kaspa'),
        isAccepted: Boolean(tx.is_accepted ?? true),
        confirmations: 1,
      });
    });

    allMergedTxs.sort((a, b) => b.timestamp - a.timestamp);
    return allMergedTxs;
  };

  const scanWalletChainIndex = async (): Promise<void> => {
    if (!activeWallet) {
      showToast('No active wallet selected', 'error');
      return;
    }

    let seedToUse = activeWallet.mnemonic;
    let passToUse = activeWallet.passphrase;

    // Handle decryption if seed is encrypted at rest
    if (!seedToUse && (activeWallet.encryptedMnemonic)) {
      if (password) {
        try {
          if (activeWallet.encryptedMnemonic) {
            seedToUse = await decryptWithPassword(
              activeWallet.encryptedMnemonic.ciphertext,
              activeWallet.encryptedMnemonic.salt,
              activeWallet.encryptedMnemonic.iv,
              password,
              buildAadContext('MNEMONIC', activeWallet.id)
            );
          }
          
          if (activeWallet.encryptedPassphrase) {
            passToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              password,
              buildAadContext('PASSPHRASE', activeWallet.id)
            );
          }
        } catch (err) {
          showToast('Invalid Security Password. Decryption failed.', 'error');
          return;
        }
      }
    }

    if (!seedToUse) {
      showToast('Chain index scan requires a seed phrase.', 'error');
      return;
    }

    setIsScanningChain(true);
    setIndexingState({ isIndexing: true, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });

    try {
      const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
      const scanRes = await scanKaspaWalletChain(
        seedToUse,
        passToUse,
        prefix,
        activeWallet.addressType || 'P2PKH',
        20,
        (scannedCount, foundCount, balanceSompi) => {
          setIndexingState({ isIndexing: true, scannedAddresses: scannedCount, foundAddresses: foundCount, balanceSompi });
        }
      );

      const addrPaths: { [address: string]: string } = { ...activeWallet.addressPaths };
      if (scanRes.discoveredAddresses) {
        scanRes.discoveredAddresses.forEach((da: any) => {
          addrPaths[da.address] = da.path;
        });
      }
      const changeAddr = scanRes.primaryChangeAddress || (seedToUse ? await generateDeterministicAddress(seedToUse, passToUse, prefix, activeWallet.addressType || 'P2PKH', 0, true) : activeWallet.changeAddress);

      addrPaths[scanRes.primaryAddress] = addrPaths[scanRes.primaryAddress] || `m/44'/${activeWallet.addressType === 'P2SH' ? '111111' : '111111'}'/0'/0/0`;
      if (changeAddr) {
        addrPaths[changeAddr] = addrPaths[changeAddr] || `m/44'/${activeWallet.addressType === 'P2SH' ? '111111' : '111111'}'/0'/1/0`;
      }

      const updatedBalances: { [address: string]: string } = { ...activeWallet.addressBalances };
      if (scanRes.discoveredAddresses) {
        scanRes.discoveredAddresses.forEach((da: any) => {
          updatedBalances[da.address] = (da.balanceSompi || 0n).toString();
        });
      }
      updatedBalances[scanRes.primaryAddress] = updatedBalances[scanRes.primaryAddress] || '0';
      if (changeAddr) {
        updatedBalances[changeAddr] = updatedBalances[changeAddr] || '0';
      }

      const updatedDiscoveredAddrs = Array.from(new Set([
        ...(activeWallet.discoveredAddresses || []),
        ...(scanRes.discoveredAddresses?.map((da: any) => da.address) || []),
        scanRes.primaryAddress,
        changeAddr
      ])).filter(Boolean);

      setWallets((prev) =>
        prev.map((w) =>
          w.id === activeWallet.id
            ? {
                ...w,
                receiveAddress: scanRes.primaryAddress || w.receiveAddress,
                changeAddress: changeAddr || w.changeAddress || w.receiveAddress,
                balanceSompi: scanRes.totalBalanceSompi,
                discoveredAddresses: updatedDiscoveredAddrs,
                addressPaths: addrPaths,
                addressBalances: updatedBalances,
              }
            : w
        )
      );

      // Parse and set UTXOs
      const parsedUtxos: UTXO[] = (scanRes.allUtxos || []).map((u: any, idx: number) => ({
        id: `utxo-${u.outpoint?.transactionId || u.transactionId || u.txid || idx}-${u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)}-${idx}`,
        txid: u.outpoint?.transactionId || u.transactionId || u.txid || '',
        vout: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)),
        amountSompi: BigInt(u.utxoEntry?.amount || u.amount || 0),
        address: u.address || scanRes.primaryAddress,
        blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.blockDaaScore || 0),
        derivationPath: u.derivationPath || u.path,
      }));
      setUtxos(parsedUtxos);
      try {
        await saveUtxosToDB(activeWallet.id, parsedUtxos);
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(`kaspriv_utxos_cache_${activeWallet.id}`);
        }
      } catch (e) {}

      // Parse and set Transactions
      const parsedTxs = parseRawKaspaTransactions(scanRes.allTransactions || [], updatedDiscoveredAddrs, scanRes.primaryAddress);
      setTransactions(parsedTxs);
      try {
        await saveTransactionsToDB(activeWallet.id, parsedTxs);
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(`kaspriv_tx_cache_${activeWallet.id}`);
        }
      } catch (e) {}

      showToast(
        `Chain index scan complete! Found ${formatKas(scanRes.totalBalanceSompi)} KAS.`,
        'success'
      );
    } catch (err: any) {
      console.error('Chain index scan failed:', err);
      showToast(`Chain scan notice: ${err.message || err}`, 'error');
    } finally {
      // Wipe decrypted seed if password was active
      if (password && seedToUse !== activeWallet.mnemonic) {
        seedToUse = '';
        passToUse = '';
      }
      setIsScanningChain(false);
      setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
      refreshBalance();
    }
  };

  const importSeedWallet = async (name: string, words: string[], passphrase?: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH', password?: string, duressPassword?: string): Promise<Wallet> => {
    const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
    let mStr = cleanMnemonic(words.join(' '));
    const cleanedWords = mStr.split(' ');
    
    setIndexingState({ isIndexing: true, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    
    let scanRes;
    try {
      scanRes = await scanKaspaWalletChain(
        mStr, passphrase, prefix, addressType, 20,
        (scannedCount, foundCount, balanceSompi) => {
          setIndexingState({ isIndexing: true, scannedAddresses: scannedCount, foundAddresses: foundCount, balanceSompi });
        }
      );
    } catch (err) {
      const derivedAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, false);
      const derivedChangeAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, true);
      scanRes = {
        primaryAddress: derivedAddr,
        primaryChangeAddress: derivedChangeAddr,
        totalBalanceSompi: 0n,
        discoveredAddresses: [],
        allUtxos: [],
        allTransactions: [],
      };
    } finally {
      if (password) {
        setIsPasswordEnabled(true);
        setPasswordState(password);
        setIsLocked(true);
      }
      setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    }
    
    const addrPaths: { [address: string]: string } = {};
    const initialBalances: { [address: string]: string } = {};
    const discoveredAddressesList: string[] = [];

    if (scanRes.discoveredAddresses) {
      scanRes.discoveredAddresses.forEach((da: any) => {
        addrPaths[da.address] = da.path;
        initialBalances[da.address] = (da.balanceSompi || 0n).toString();
        if (!discoveredAddressesList.includes(da.address)) {
          discoveredAddressesList.push(da.address);
        }
      });
    }

    // Pre-derive a pool of 10 receive addresses (index 0 to 9) to support offline/locked auto-rotation
    for (let idx = 0; idx < 10; idx++) {
      const path = `m/44'/${addressType === 'P2SH' ? '111111' : '111111'}'/0'/0/${idx}`;
      const addr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, idx, false);
      addrPaths[addr] = path;
      initialBalances[addr] = initialBalances[addr] || '0';
      if (!discoveredAddressesList.includes(addr)) {
        discoveredAddressesList.push(addr);
      }
    }

    // Pre-derive 5 change addresses (index 0 to 4)
    for (let idx = 0; idx < 5; idx++) {
      const path = `m/44'/${addressType === 'P2SH' ? '111111' : '111111'}'/0'/1/${idx}`;
      const addr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType, idx, true);
      addrPaths[addr] = path;
      initialBalances[addr] = initialBalances[addr] || '0';
      if (!discoveredAddressesList.includes(addr)) {
        discoveredAddressesList.push(addr);
      }
    }

    const changeAddr = scanRes.primaryChangeAddress || (await generateDeterministicAddress(mStr, passphrase, prefix, addressType, 0, true));

    try {
      const activePassword = password;
      let encryptedMnemonic;
      let encryptedPassphrase;
      const walletId = `w-seed-${Date.now()}`;
      if (activePassword) {
        encryptedMnemonic = await encryptWithPassword(mStr, activePassword, buildAadContext('MNEMONIC', walletId));
        if (passphrase) {
          encryptedPassphrase = await encryptWithPassword(passphrase, activePassword, buildAadContext('PASSPHRASE', walletId));
        }
      }

      const newW: Wallet = {
        id: walletId,
        name: sanitizeWalletName(name, 'Restored Kaspa Wallet'),
        receiveAddress: scanRes.primaryAddress,
        changeAddress: changeAddr || scanRes.primaryAddress,
        mnemonic: activePassword ? undefined : mStr,
        passphrase: activePassword ? undefined : (passphrase || undefined),
        encryptedMnemonic,
        encryptedPassphrase,
        balanceSompi: scanRes.totalBalanceSompi,
        createdAt: Date.now(),
        addressType,
        discoveredAddresses: discoveredAddressesList,
        addressPaths: addrPaths,
        addressBalances: initialBalances,
      };

      if (password) {
        await setPassword(password);
        setIsLocked(true);
        setPasswordState(null);
      }

      if (duressPassword) {
        await setDuressPassword(duressPassword);
      }

      // Parse UTXOs
      const parsedUtxos: UTXO[] = (scanRes.allUtxos || []).map((u: any, idx: number) => ({
        id: `utxo-${u.outpoint?.transactionId || u.transactionId || u.txid || idx}-${u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)}-${idx}`,
        txid: u.outpoint?.transactionId || u.transactionId || u.txid || '',
        vout: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)),
        amountSompi: BigInt(u.utxoEntry?.amount || u.amount || 0),
        address: u.address || scanRes.primaryAddress,
        blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.blockDaaScore || 0),
        derivationPath: u.derivationPath || u.path,
      }));
      setUtxos(parsedUtxos);
      try {
        await saveUtxosToDB(newW.id, parsedUtxos);
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(`kaspriv_utxos_cache_${newW.id}`);
        }
      } catch (e) {}

      // Parse Transactions
      const parsedTxs = parseRawKaspaTransactions(scanRes.allTransactions || [], discoveredAddressesList, scanRes.primaryAddress);
      setTransactions(parsedTxs);
      try {
        await saveTransactionsToDB(newW.id, parsedTxs);
        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.removeItem(`kaspriv_tx_cache_${newW.id}`);
        }
      } catch (e) {}

      setWallets((prev) => [...prev, newW]);
      setActiveWalletIdState(newW.id);
      setIsLoggedOut(false);
      try {
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}
      
      showToast(`Restored Kaspa Wallet '${newW.name}'! Found ${formatKas(scanRes.totalBalanceSompi)} KAS on chain index.`, 'success');
      setTimeout(() => { refreshBalance(); }, 100);
      return newW;
    } finally {
      // Wipe mnemonic string
      mStr = '';
    }
  };

  const importKpubWallet = async (name: string, kpubOrAddress: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH', password?: string, duressPassword?: string): Promise<Wallet> => {
    const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
    const isDirectAddress = kpubOrAddress.includes(':') || kpubOrAddress.length > 50; // Simple heuristic
    
    let targetAddress: string;
    if (isDirectAddress && kpubOrAddress.includes(':')) {
      targetAddress = kpubOrAddress;
    } else {
      try {
        // Try to derive from kpub/pubkey hex
        targetAddress = getAddressFromPublicKey(kpubOrAddress, addressType, prefix);
      } catch (e) {
        // Fallback or random for demo
        targetAddress = generateRandomKaspaAddress(prefix + ':');
      }
    }

    const newW: Wallet = {
      id: `w-kpub-${Date.now()}`,
      name: sanitizeWalletName(name, 'Watch-Only Wallet'),
      receiveAddress: targetAddress,
      changeAddress: targetAddress,
      kpub: isDirectAddress ? undefined : kpubOrAddress,
      isImportedKpub: true,
      isWatchOnly: true,
      balanceSompi: 0n,
      createdAt: Date.now(),
      addressType,
    };

    if (password) {
      await setPassword(password);
      setIsLocked(true);
      setPasswordState(null);
    }
    if (duressPassword) {
      await setDuressPassword(duressPassword);
    }

    setWallets((prev) => [...prev, newW]);
    setActiveWalletIdState(newW.id);
    setIsLoggedOut(false);
    try {
      saveSetting('kaspa_is_logged_out', false);
    } catch (e) {}
    showToast(`Imported Watch-Only Kaspa Address / Kpub`, 'success');
    return newW;
  };

  const sendKaspa = async (
    toAddress: string,
    amountKas: number,
    feeKas: number,
    note?: string,
    providedSeedPhrase?: string,
    providedPassphrase?: string,
    selectedUtxoOutpoints?: string[]
  ): Promise<{ success: boolean; txid?: string; error?: string; inputs?: any[] }> => {
    if (!activeWallet) return { success: false, error: 'No active wallet selected' };
    
    let seedToUse: string | null = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic || null;
    let passphraseToUse: string | null | undefined = providedPassphrase !== undefined ? providedPassphrase : activeWallet.passphrase;

    const activePassword = password;

    // Handle decryption if seed is encrypted at rest
    if (!seedToUse && (activeWallet.encryptedMnemonic)) {
      if (activePassword) {
        try {
          if (activeWallet.encryptedMnemonic) {
            seedToUse = await decryptWithPassword(
              activeWallet.encryptedMnemonic.ciphertext,
              activeWallet.encryptedMnemonic.salt,
              activeWallet.encryptedMnemonic.iv,
              activePassword,
              buildAadContext('MNEMONIC', activeWallet.id)
            );
          }
          
          if (providedPassphrase === undefined && activeWallet.encryptedPassphrase) {
            passphraseToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              activePassword,
              buildAadContext('PASSPHRASE', activeWallet.id)
            );
          }
        } catch (err) {
          return { success: false, error: 'Invalid Security Password. Could not decrypt wallet credentials.' };
        }
      } else {
        return { success: false, error: 'Wallet is locked. Please unlock the wallet first.' };
      }
    }

    // Determine address standard (P2PKH or P2SH)
    const addrType = activeWallet.addressType || (activeWallet.receiveAddress?.includes(':p') ? 'P2SH' : 'P2PKH');

    try {
      // Ensure minimum fee for node compute mass
      const minFeeKas = addrType === 'P2SH' || activeWallet.receiveAddress?.includes(':p') ? 0.001 : 0.0001;
      const effectiveFeeKas = Math.max(feeKas, minFeeKas);

      let amountSompi = kasToSompi(amountKas);
      const feeSompi = kasToSompi(effectiveFeeKas);
      let totalSompiNeeded = amountSompi + feeSompi;

      if (activeWallet.balanceSompi < totalSompiNeeded && (!selectedUtxoOutpoints || selectedUtxoOutpoints.length === 0)) {
        // If user specified an amount close to or equal to their balance (e.g. 0.01 KAS with 0.01 balance), auto-deduct fee from amount
        if (activeWallet.balanceSompi >= feeSompi && amountKas >= sompiToKas(activeWallet.balanceSompi) * 0.95) {
          amountSompi = activeWallet.balanceSompi - feeSompi;
          totalSompiNeeded = activeWallet.balanceSompi;
        } else {
          const err = `Insufficient balance. Required: ${sompiToKas(totalSompiNeeded).toFixed(4)} KAS, Available: ${sompiToKas(activeWallet.balanceSompi)} KAS`;
          console.error('[Send Transaction] Balance check failed:', err);
          return { success: false, error: err };
        }
      }

      // 1. Fetch real UTXOs for all discovered addresses
      const addressesToFetch = activeWallet.discoveredAddresses && activeWallet.discoveredAddresses.length > 0
        ? activeWallet.discoveredAddresses
        : [activeWallet.receiveAddress];
      
      const utxoPromises = addressesToFetch.map(addr => fetchKaspaAddressUtxos(addr));
      const utxosResults = await Promise.all(utxoPromises);
      
      const utxosResponse: any[] = [];
      utxosResults.forEach((liveUtxosData, addrIdx) => {
        const address = addressesToFetch[addrIdx];
        if (liveUtxosData && Array.isArray(liveUtxosData)) {
          liveUtxosData.forEach((u: any) => {
            // Priority: addressPaths[address] -> u.derivationPath -> computed path
            let devPath = activeWallet.addressPaths?.[address] || u.derivationPath;
            if (!devPath) {
              if (address === activeWallet.receiveAddress) {
                devPath = "m/44'/111111'/0'/0/0";
              } else if (address === activeWallet.changeAddress) {
                devPath = "m/44'/111111'/0'/1/0";
              } else {
                devPath = `m/44'/111111'/0'/0/${addrIdx}`;
              }
            }
            utxosResponse.push({
              ...u,
              address,
              derivationPath: devPath,
            });
          });
        }
      });

      // Filter out spent UTXOs and optionally locked UTXOs
      const activeSpentSet = new Set(spentUtxoOutpoints);
      const lockedSet = new Set(activeWallet.lockedUtxoOutpoints || []);
      const manualSelectionActive = selectedUtxoOutpoints && selectedUtxoOutpoints.length > 0;
      const manualSelectedSet = manualSelectionActive ? new Set(selectedUtxoOutpoints) : null;

      const filteredUtxos = utxosResponse.filter((u: any) => {
        const txid = u.outpoint?.transactionId || u.transaction_id || u.txid || '';
        const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);
        const outpoint = `${txid}:${vout}`;

        // Never spend already broadcasted/pending outpoints
        if (activeSpentSet.has(outpoint)) return false;

        // If manual Coin Control selection is used, only include matching selected outpoints
        if (manualSelectedSet) {
          return manualSelectedSet.has(outpoint);
        }

        // Otherwise in auto-selection, skip frozen/locked UTXOs
        if (lockedSet.has(outpoint)) return false;

        return true;
      });

      if (filteredUtxos.length === 0) {
        const err = manualSelectionActive
          ? 'Selected UTXOs are unavailable or already spent.'
          : 'Failed to fetch UTXOs or address has no available spendable outputs (some UTXOs may be frozen or pending).';
        return { success: false, error: err };
      }

      // Sort UTXOs descending by amount
      filteredUtxos.sort((a, b) => {
        const amtA = BigInt(a.utxoEntry?.amount || a.amount || 0);
        const amtB = BigInt(b.utxoEntry?.amount || b.amount || 0);
        return amtB > amtA ? 1 : amtB < amtA ? -1 : 0;
      });

      // Kaspa standard mempool max transaction mass is 100,000 grams (~84 P2PKH inputs limit)
      const MAX_INPUTS_PER_TX = 80;
      const outputsCount = 2; // 1 recipient output + 1 change output

      const selectedUtxos: any[] = [];
      let accumulatedSum = 0n;
      let finalFeeSompi = feeSompi;

      if (manualSelectionActive) {
        // Use all manually selected UTXOs
        for (const u of filteredUtxos) {
          selectedUtxos.push(u);
          accumulatedSum += BigInt(u.utxoEntry?.amount || u.amount || 0);
        }
        const dynamicMinFee = calculateDynamicFeeForTransaction(selectedUtxos.length, outputsCount, addrType, 25, 20000n);
        finalFeeSompi = feeSompi > dynamicMinFee ? feeSompi : dynamicMinFee;
      } else {
        for (const u of filteredUtxos) {
          selectedUtxos.push(u);
          accumulatedSum += BigInt(u.utxoEntry?.amount || u.amount || 0);

          // Dynamically compute the required consensus relay fee with safety buffer for the current input count
          const dynamicMinFee = calculateDynamicFeeForTransaction(selectedUtxos.length, outputsCount, addrType, 25, 20000n);
          finalFeeSompi = feeSompi > dynamicMinFee ? feeSompi : dynamicMinFee;

          // If we have accumulated enough sompi to cover amount + dynamic fee, we have sufficient UTXOs
          if (accumulatedSum >= (amountSompi + finalFeeSompi)) {
            break;
          }

          if (selectedUtxos.length >= MAX_INPUTS_PER_TX) {
            break;
          }
        }
      }

      // Re-verify minimum consensus relay fee for final selected input count
      const absoluteMinFee = calculateDynamicFeeForTransaction(selectedUtxos.length, outputsCount, addrType, 25, 20000n);
      if (finalFeeSompi < absoluteMinFee) {
        finalFeeSompi = absoluteMinFee;
      }

      let finalAmountSompi = amountSompi;
      let totalNeededWithBump = finalAmountSompi + finalFeeSompi;

      // If user specified Max send or balance is just short of the fee, adjust final amount
      if (accumulatedSum < totalNeededWithBump) {
        if (accumulatedSum > finalFeeSompi && (amountKas >= sompiToKas(activeWallet.balanceSompi) * 0.85 || accumulatedSum >= amountSompi)) {
          finalAmountSompi = accumulatedSum - finalFeeSompi;
          totalNeededWithBump = accumulatedSum;
          console.warn(`[Fee Scaling] Adjusted sendable amount to ${sompiToKas(finalAmountSompi)} KAS to safely cover network relay fee of ${sompiToKas(finalFeeSompi)} KAS for ${selectedUtxos.length} UTXOs.`);
        } else {
          const err = `Insufficient spendable balance across selected UTXOs. Available: ${sompiToKas(accumulatedSum)} KAS (in ${selectedUtxos.length} UTXOs), Needed: ${sompiToKas(totalNeededWithBump)} KAS (${amountKas} KAS + ${sompiToKas(finalFeeSompi)} KAS network relay fee).`;
          console.error('[Send Transaction] UTXO accumulation failed:', err);
          return { success: false, error: err };
        }
      }

      // Privacy Defenses: Derive fresh change address index to defeat address clustering heuristics
      let effectiveChangeAddress = activeWallet.changeAddress;
      if (seedToUse) {
        try {
          const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
          // Rotate change index deterministically based on transaction count
          const changeIndex = (transactions.length || 0) % 5;
          effectiveChangeAddress = await generateDeterministicAddress(
            seedToUse,
            passphraseToUse || undefined,
            prefix,
            addrType,
            changeIndex,
            true
          );
        } catch {
          effectiveChangeAddress = activeWallet.changeAddress || activeWallet.receiveAddress;
        }
      } else if (!effectiveChangeAddress) {
        effectiveChangeAddress = activeWallet.receiveAddress;
      }

      // 2. Build Unsigned Intent & Execute via IsolatedSigner
      const intent = {
        network,
        toAddress,
        changeAddress: effectiveChangeAddress || activeWallet.receiveAddress,
        amountSompi: finalAmountSompi,
        feeSompi: finalFeeSompi,
        utxos: selectedUtxos,
        note
      };

      if (!seedToUse) {
        return { success: false, error: 'No wallet seed phrase available for signing' };
      }

      try {
        const signerResult = await IsolatedSigner.signTransactionIsolated(
          seedToUse,
          passphraseToUse || undefined,
          intent,
          addrType
        );

        if (!signerResult.success || !signerResult.transaction) {
          return { success: false, error: signerResult.error || 'Failed to construct or sign transaction.' };
        }

        // 3. Broadcast
        const broadcastResult = await broadcastKaspaTransaction(signerResult.transaction);

        if (broadcastResult.success) {
          showToast(`Transaction sent! TXID: ${shortenAddress(broadcastResult.txId!)}`, 'success');
          
          // 1. Record broadcasted transaction in local state
          const newPendingTx: KaspaTransaction = {
            txid: broadcastResult.txId!,
            type: 'send',
            amountSompi: finalAmountSompi,
            feeSompi: finalFeeSompi,
            address: toAddress,
            timestamp: Date.now(),
            blockDaaScore: 1,
            note: note || 'Sent Kaspa',
            isAccepted: true,
            confirmations: 1,
          };
          setLocalPendingTxs((prev) => [newPendingTx, ...prev]);
          setTransactions((prev) => [newPendingTx, ...prev.filter(t => t.txid !== newPendingTx.txid)]);

          // 2. Add outpoints of spent UTXOs to local spent list
          const spentOutpoints = selectedUtxos.map((u: any) => {
            const txid = u.outpoint?.transactionId || u.transaction_id || u.txid || '';
            const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);
            return `${txid}:${vout}`;
          });
          setSpentUtxoOutpoints((prev) => [...prev, ...spentOutpoints]);

          // 3. Instantly deduct spent balance and filter UTXOs for reactive UI
          const totalDeductionSompi = finalAmountSompi + finalFeeSompi;
          setWallets((prev) =>
            prev.map((w) => {
              if (w.id === activeWallet.id) {
                const newBal = w.balanceSompi > totalDeductionSompi ? w.balanceSompi - totalDeductionSompi : 0n;
                return { ...w, balanceSompi: newBal };
              }
              return w;
            })
          );
          setUtxos((prev) => prev.filter((u) => !spentOutpoints.includes(`${u.txid}:${u.vout}`)));

          // Refresh balance after short delay, and multiple polls in case API indices take a few seconds
          setTimeout(refreshBalance, 1500);
          setTimeout(refreshBalance, 4000);
          setTimeout(refreshBalance, 8000);
          setTimeout(refreshBalance, 15000);
          
          return { success: true, txid: broadcastResult.txId, inputs: selectedUtxos };
        } else {
          return { success: false, error: broadcastResult.error || 'Failed to broadcast transaction' };
        }
      } finally {
        // --------------------------------------------------------
        // ALWAYS wipe application-managed sensitive references
        // --------------------------------------------------------
        seedToUse = null;
        passphraseToUse = null;
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Transaction construction failed' };
    }
  };

  const compoundUtxos = async (providedSeedPhrase?: string): Promise<{ success: boolean; txid?: string; countMerged?: number }> => {
    if (!activeWallet) return { success: false };
    
    let seedToUse: string | null = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic || null;
    let passphraseToUse: string | null | undefined = activeWallet.passphrase;

    // Handle decryption if seed is encrypted at rest
    if (!seedToUse && (activeWallet.encryptedMnemonic)) {
      if (password) {
        try {
          if (activeWallet.encryptedMnemonic) {
            seedToUse = await decryptWithPassword(
              activeWallet.encryptedMnemonic.ciphertext,
              activeWallet.encryptedMnemonic.salt,
              activeWallet.encryptedMnemonic.iv,
              password,
              buildAadContext('MNEMONIC', activeWallet.id)
            );
          }
          
          if (activeWallet.encryptedPassphrase) {
            passphraseToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              password,
              buildAadContext('PASSPHRASE', activeWallet.id)
            );
          }
        } catch (err) {
          showToast('Failed to decrypt wallet for compounding', 'error');
          return { success: false };
        }
      }
    }

    if (!seedToUse) {
      showToast('Compounding requires wallet seed phrase', 'error');
      return { success: false };
    }

    try {
      // 1. Fetch real UTXOs for all discovered addresses
      const addressesToFetch = activeWallet.discoveredAddresses && activeWallet.discoveredAddresses.length > 0
        ? activeWallet.discoveredAddresses
        : [activeWallet.receiveAddress];

      const utxoPromises = addressesToFetch.map(addr => fetchKaspaAddressUtxos(addr));
      const utxosResults = await Promise.all(utxoPromises);
      
      const utxosResponse: any[] = [];
      utxosResults.forEach((liveUtxosData, addrIdx) => {
        const address = addressesToFetch[addrIdx];
        if (liveUtxosData && Array.isArray(liveUtxosData)) {
          liveUtxosData.forEach((u: any) => {
            const devPath = activeWallet.addressPaths?.[address] || `m/44'/111111'/0'/0/${addrIdx}`;
            utxosResponse.push({
              ...u,
              address,
              derivationPath: devPath,
            });
          });
        }
      });

      // Filter out UTXOs that are in our spentUtxoOutpoints
      const activeSpentSet = new Set(spentUtxoOutpoints);
      const filteredUtxos = utxosResponse.filter((u: any) => {
        const txid = u.outpoint?.transactionId || u.transaction_id || u.txid || '';
        const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);
        const outpoint = `${txid}:${vout}`;
        return !activeSpentSet.has(outpoint);
      });

      if (filteredUtxos.length < 2) {
        showToast('Not enough spendable UTXOs to compound (some may be locked in pending transactions)', 'info');
        return { success: false };
      }

      // Limit compound batch to max 80 UTXOs to stay safely under 100,000 mass limit
      const utxosToCompound = filteredUtxos.slice(0, 80);

      const totalBalance = utxosToCompound.reduce((acc, u) => {
        const amount = u.utxoEntry?.amount || u.amount;
        return acc + BigInt(amount || 0);
      }, 0n);
      
      const addrType = activeWallet.addressType || (activeWallet.receiveAddress?.includes(':p') ? 'P2SH' : 'P2PKH');
      
      const minRequiredFeeSompi = calculateDynamicFeeForTransaction(utxosToCompound.length, 1, addrType, 25, 20000n);
      const feeSompi = minRequiredFeeSompi;

      const amountToSelf = totalBalance - feeSompi;

      if (amountToSelf <= 0n) {
        showToast('Balance too low after network fees to compound', 'error');
        return { success: false };
      }

      // Build intent and sign via IsolatedSigner to properly sign UTXOs across multiple derivation paths
      const compoundIntent = {
        network,
        toAddress: activeWallet.receiveAddress,
        changeAddress: activeWallet.receiveAddress,
        amountSompi: amountToSelf,
        feeSompi: feeSompi,
        utxos: utxosToCompound,
        note: 'Compounded UTXOs',
      };

      try {
        const signerResult = await IsolatedSigner.signTransactionIsolated(
          seedToUse,
          passphraseToUse,
          compoundIntent,
          addrType
        );

        if (!signerResult.success || !signerResult.transaction) {
          showToast(signerResult.error || 'Failed to sign compound transaction', 'error');
          return { success: false };
        }

        const broadcastResult = await broadcastKaspaTransaction(signerResult.transaction);
        
        if (broadcastResult.success) {
          showToast(`Compounding initiated for ${utxosToCompound.length} UTXOs!`, 'success');
          
          // 1. Record broadcasted transaction in local state
          const newPendingTx: KaspaTransaction = {
            txid: broadcastResult.txId!,
            type: 'compound',
            amountSompi: 0n, // Net transfer is 0 except for fees
            feeSompi: feeSompi,
            address: activeWallet.receiveAddress,
            timestamp: Date.now(),
            blockDaaScore: 1,
            note: 'Compounded UTXOs',
            isAccepted: true,
            confirmations: 1,
          };
          setLocalPendingTxs((prev) => [newPendingTx, ...prev]);
          setTransactions((prev) => [newPendingTx, ...prev.filter(t => t.txid !== newPendingTx.txid)]);

          // 2. Add outpoints of spent UTXOs to local spent list
          const spentOutpoints = utxosToCompound.map((u: any) => {
            const txid = u.outpoint?.transactionId || u.transaction_id || u.txid || '';
            const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);
            return `${txid}:${vout}`;
          });
          setSpentUtxoOutpoints((prev) => [...prev, ...spentOutpoints]);

          // 3. Instantly deduct compound fee from wallets and filter UTXOs
          setWallets((prev) =>
            prev.map((w) => {
              if (w.id === activeWallet.id) {
                const newBal = w.balanceSompi > feeSompi ? w.balanceSompi - feeSompi : 0n;
                return { ...w, balanceSompi: newBal };
              }
              return w;
            })
          );
          setUtxos((prev) => prev.filter((u) => !spentOutpoints.includes(`${u.txid}:${u.vout}`)));

          // Refresh balance after short delay, and multiple polls in case API indices take a few seconds
          setTimeout(refreshBalance, 1500);
          setTimeout(refreshBalance, 4000);
          setTimeout(refreshBalance, 8000);
          setTimeout(refreshBalance, 15000);
          
          return { success: true, txid: broadcastResult.txId, countMerged: utxosToCompound.length };
        } else {
          showToast(`Compound failed: ${broadcastResult.error}`, 'error');
          return { success: false };
        }
      } finally {
        // --------------------------------------------------------
        // ALWAYS wipe application-managed sensitive references
        // --------------------------------------------------------
        seedToUse = null;
        passphraseToUse = null;
      }
    } catch (err: any) {
      console.error('Compound error:', err);
      showToast(`Compounding error: ${err.message}`, 'error');
      return { success: false };
    }
  };

  const setPassword = async (password: string | null) => {
    if (password) {
      setIsPasswordEnabled(true);
      setPasswordState(password);
      await saveSetting('wallet_password_enabled', true);
      
      try {
        const canaryObj = await encryptWithPassword("kaspriv-canary", password, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");
        await saveSetting('wallet_password_canary', canaryObj);
      } catch (err) {
        console.error('Failed to save password canary:', err);
      }
      
      try {
        const updatedWallets = await Promise.all(wallets.map(async (w) => {
          let encryptedMnemonic = w.encryptedMnemonic;
          let encryptedPassphrase = w.encryptedPassphrase;
          
          const seedToUse = w.mnemonic;
          const passToUse = w.passphrase;
          
          if (seedToUse) {
            encryptedMnemonic = await encryptWithPassword(seedToUse, password, buildAadContext('MNEMONIC', w.id));
            if (passToUse) {
              encryptedPassphrase = await encryptWithPassword(passToUse, password, buildAadContext('PASSPHRASE', w.id));
            }
          }
          
          return {
            ...w,
            mnemonic: undefined,
            passphrase: undefined,
            encryptedMnemonic,
            encryptedPassphrase
          };
        }));
        setWallets(updatedWallets);
        showToast('Password security enabled & wallets encrypted', 'success');
      } catch (err) {
        showToast('Password enabled, but error encrypting existing keys', 'error');
      }
        } else {
      const activePassword = password;
      setIsPasswordEnabled(false);
      setPasswordState(null);
      await saveSetting('wallet_password_enabled', false);
      await removeSetting('wallet_password_canary');
      setIsLocked(false);
      
      if (activePassword) {
        const updatedWallets = await Promise.all(wallets.map(async (w) => {
          let decryptedMnemonic = w.mnemonic;
          let decryptedPassphrase = w.passphrase;
          
          if (!decryptedMnemonic && w.encryptedMnemonic) {
            try {
              decryptedMnemonic = await decryptWithPassword(w.encryptedMnemonic.ciphertext, w.encryptedMnemonic.salt, w.encryptedMnemonic.iv, activePassword, buildAadContext('MNEMONIC', w.id));
            } catch (e) {
              // ignore
            }
          }
          
          if (!decryptedPassphrase && w.encryptedPassphrase) {
            try {
              decryptedPassphrase = await decryptWithPassword(w.encryptedPassphrase.ciphertext, w.encryptedPassphrase.salt, w.encryptedPassphrase.iv, activePassword, buildAadContext('PASSPHRASE', w.id));
            } catch (e) {
              // ignore
            }
          }
          
          return {
            ...w,
            mnemonic: decryptedMnemonic,
            passphrase: decryptedPassphrase,
            encryptedMnemonic: undefined,
            encryptedPassphrase: undefined
          };
        }));
        setWallets(updatedWallets);
      } else {
        setWallets(prev => prev.map(w => ({
          ...w,
          encryptedPassphrase: undefined,
          encryptedMnemonic: undefined
        })));
      }
      showToast('Password security disabled', 'info');
    }
  };

  const setDuressPassword = async (duressPassword: string | null) => {
    if (duressPassword && duressPassword.trim().length >= 8) {
      try {
        const canaryObj = await encryptWithPassword(
          "kaspriv-duress-canary",
          duressPassword.trim(),
          "KASPRIV-WALLET-v1|KASPA-MAINNET|DURESS"
        );
        await saveSetting('wallet_duress_canary', canaryObj);
        await saveSetting('wallet_duress_enabled', true);
        setIsDuressEnabled(true);
        showToast('Emergency Duress Password enabled', 'success');
      } catch (err) {
        console.error('Failed to save duress password canary:', err);
        showToast('Failed to configure Duress password', 'error');
      }
    } else {
      await removeSetting('wallet_duress_canary');
      await saveSetting('wallet_duress_enabled', false);
      setIsDuressEnabled(false);
      showToast('Emergency Duress Password removed', 'info');
    }
  };

  const executePanicWipe = async () => {
    setIsSendOpen(false);
    setIsReceiveOpen(false);
    setIsWalletSetupOpen(false);
    setIsCompoundOpen(false);
    setIsSignMessageOpen(false);
    setIsAssetDetailOpen(false);
    setIsNodeManagerOpen(false);
    setIsLogoutConfirmOpen(false);

    // Wipe in-memory wallet sensitive fields
    wallets.forEach((w) => {
      if (w.mnemonic) w.mnemonic = '';
      if (w.passphrase) w.passphrase = '';
    });

    // Purge state
    setWallets([]);
    setActiveWalletIdState('');
    setTransactions([]);
    setUtxos([]);
    setContacts([]);
    setPasswordState(null);
    setIsPasswordEnabled(false);
    setIsDuressEnabled(false);

    // Zero-trace purge of IndexedDB and Web Storage
    try {
      await purgeAllDatabases();
    } catch (e) {
      console.error('Panic wipe purge error:', e);
    }

    setIsLocked(false);
    setIsLoggedOut(true);
  };

  const unlockWallet = async (enteredPassword: string): Promise<boolean> => {
    const cleanInput = enteredPassword.trim();
    if (!cleanInput) return false;

    // 1. Check if the entered password matches the Emergency Duress Password
    try {
      const duressCanary = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_duress_canary');
      if (duressCanary) {
        try {
          const decryptedDuress = await decryptWithPassword(
            duressCanary.ciphertext,
            duressCanary.salt,
            duressCanary.iv,
            cleanInput,
            "KASPRIV-WALLET-v1|KASPA-MAINNET|DURESS"
          );
          if (decryptedDuress === "kaspriv-duress-canary") {
            // DURESS PASSWORD DETECTED -> INSTANT SECURE PURGE & LOGOUT TO LANDING PAGE
            await executePanicWipe();
            return true;
          }
        } catch {
          // Not duress password, proceed to normal password check
        }
      }
    } catch (err) {
      console.error('Error during duress check:', err);
    }

    // 2. Normal Password Verification
    let passwordValid = false;
    const canaryObj = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_password_canary') || await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_pin_canary');
    
    if (canaryObj) {
      try {
        const decryptedCanary = await decryptWithPassword(canaryObj.ciphertext, canaryObj.salt, canaryObj.iv, cleanInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");
        if (decryptedCanary === "kaspriv-canary") {
          passwordValid = true;
        }
      } catch (err) {
        return false;
      }
    } else {
      // Fallback for wallets without canary (legacy)
      const firstW = wallets.find(w => w.encryptedMnemonic);
      if (firstW) {
        try {
          if (firstW.encryptedMnemonic) {
            await decryptWithPassword(firstW.encryptedMnemonic.ciphertext, firstW.encryptedMnemonic.salt, firstW.encryptedMnemonic.iv, cleanInput, buildAadContext('MNEMONIC', firstW.id));
          }
          passwordValid = true;
        } catch (err) {
          return false;
        }
      } else {
        // If no wallets and no canary, we consider it "unlocked" for now (shouldn't happen)
        passwordValid = true;
      }
    }

    if (passwordValid) {
      setPasswordState(cleanInput);
      setIsLocked(false);
      showToast('Wallet unlocked', 'success');
      return true;
    }
    return false;
  };

  const generateNewReceiveAddress = React.useCallback(async (): Promise<string | null> => {
    if (!activeWallet) return null;
    let seedToUse = activeWallet.mnemonic;
    let passToUse = activeWallet.passphrase;

    if (!seedToUse && activeWallet.encryptedMnemonic) {
      if (password) {
        try {
          seedToUse = await decryptWithPassword(
            activeWallet.encryptedMnemonic.ciphertext,
            activeWallet.encryptedMnemonic.salt,
            activeWallet.encryptedMnemonic.iv,
            password,
            buildAadContext('MNEMONIC', activeWallet.id)
          );
          if (activeWallet.encryptedPassphrase) {
            passToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              password,
              buildAadContext('PASSPHRASE', activeWallet.id)
            );
          }
        } catch {
          showToast('Failed to decrypt wallet. Please unlock your wallet.', 'error');
          return null;
        }
      } else {
        showToast('Please unlock your wallet first.', 'error');
        return null;
      }
    }

    if (!seedToUse) {
      showToast('Seed phrase required to derive new address.', 'error');
      return null;
    }

    const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
    const addressType = activeWallet.addressType || 'P2PKH';

    let maxRecvIdx = 0;
    const paths = activeWallet.addressPaths || {};
    Object.entries(paths).forEach(([addr, path]) => {
      if (path.includes("/0/")) {
        const parts = path.split('/');
        const idx = parseInt(parts[parts.length - 1] || '0', 10);
        if (idx > maxRecvIdx) {
          maxRecvIdx = idx;
        }
      }
    });

    const nextIdx = maxRecvIdx + 1;
    const path = `m/44'/111111'/0'/0/${nextIdx}`;
    const newAddr = await generateDeterministicAddress(seedToUse, passToUse || undefined, prefix, addressType, nextIdx, false);

    setWallets((prev) =>
      prev.map((w) => {
        if (w.id === activeWallet.id) {
          const updatedDiscovered = w.discoveredAddresses ? [...w.discoveredAddresses] : [w.receiveAddress];
          if (!updatedDiscovered.includes(newAddr)) {
            updatedDiscovered.push(newAddr);
          }
          const updatedPaths = { ...w.addressPaths, [newAddr]: path };
          const updatedBalances = { ...w.addressBalances, [newAddr]: '0' };
          return {
            ...w,
            discoveredAddresses: updatedDiscovered,
            addressPaths: updatedPaths,
            addressBalances: updatedBalances,
            receiveAddress: newAddr,
          };
        }
        return w;
      })
    );

    showToast('New receive address generated successfully!', 'success');
    return newAddr;
  }, [activeWallet, password, network, showToast]);

  const switchReceiveAddress = React.useCallback((addr: string) => {
    if (!activeWallet) return;
    setWallets((prev) =>
      prev.map((w) =>
        w.id === activeWallet.id
          ? { ...w, receiveAddress: addr }
          : w
      )
    );
    showToast('Receive address updated!', 'success');
  }, [activeWallet, showToast]);

  // Combine official fetched transactions with active local pending transactions (avoiding duplicates)
  const combinedTransactions = React.useMemo(() => {
    const officialTxids = new Set(transactions.map((tx) => tx.txid));
    const activePending = localPendingTxs.filter((tx) => !officialTxids.has(tx.txid));
    return [...activePending, ...transactions];
  }, [transactions, localPendingTxs]);

  return (
    <WalletContext.Provider
      value={{
        indexingState,
        dismissIndexing,
        wallets,
        activeWallet,
        setActiveWalletId,
        renameWallet,
        createNewWallet,
        importSeedWallet,
        importKpubWallet,
        transactions: combinedTransactions,
        utxos,
        sendKaspa,
        compoundUtxos,
        toggleLockUtxo,
        network,
        setNetwork,
        nodes,
        activeNode,
        selectNode,
        addCustomNode,
        deleteCustomNode,
        pingNodes,
        proxyConfig,
        updateProxyConfig,
        toggleProxy,
        testProxyConnection,
        currency,
        setCurrency,
        marketData,
        fiatRate,
        isInitializing,
        isPasswordEnabled,
        password,
        isLocked,
        setIsLocked,
        autoLockDuration,
        setAutoLockDuration,
        lockOnExit,
        setLockOnExit,
        isLoggedOut,
        setIsLoggedOut,
        isLogoutConfirmOpen,
        setIsLogoutConfirmOpen,
        openLogoutConfirm,
        confirmLogout,
        logoutWallet,
        setPassword,
        unlockWallet,
        lockWallet,
        isDuressEnabled,
        setDuressPassword,
        executePanicWipe,
        isSendOpen,
        setIsSendOpen,
        isReceiveOpen,
        setIsReceiveOpen,
        isWalletSetupOpen,
        setIsWalletSetupOpen,
        isCompoundOpen,
        setIsCompoundOpen,
        isSignMessageOpen,
        setIsSignMessageOpen,
        isAssetDetailOpen,
        setIsAssetDetailOpen,
        isNodeManagerOpen,
        setIsNodeManagerOpen,
        activeBottomTab,
        setActiveBottomTab,
        contacts,
        addContact,
        updateContact,
        deleteContact,
        isBalanceVisible,
        setIsBalanceVisible,
        apiUrl,
        setApiUrl,
        explorerUrl,
        setExplorerUrl,
        refreshBalance,
        scanWalletChainIndex,
        generateNewReceiveAddress,
        switchReceiveAddress,
        isScanningChain,
        currentDaaScore,
        refreshDaaScore,
        showToast,
        dismissToast,
        toast,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
};
