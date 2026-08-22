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
} from '../types';
import { KaspaUtxo } from '../utils/kaspa/api';
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
  setPanicWipeTriggered,
  isPanicWipeTriggered,
} from '../utils/storage';
import * as secp from '@noble/secp256k1';
import { 
  encryptWithPassword, 
  decryptWithPassword, 
  buildAadContext,
} from '../utils/crypto';
import { App as CapacitorApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  isBiometricsSupported as checkBiometricsSupported,
  registerBiometricUnlock,
  authenticateWithBiometrics,
  deleteNativeKeystoreAlias,
  BiometricCredentialRecord,
} from '../utils/biometrics';
import {
  isHapticsSupported as checkHapticsSupported,
  getHapticsEnabled,
  setHapticsEnabled as setHapticsStorage,
  triggerHaptic as executeHaptic,
  hapticSuccess,
  hapticError,
  hapticLight,
  HapticType,
} from '../utils/haptics';
import { IsolatedSigner } from '../utils/IsolatedSigner';
import { isNative } from '../utils/platform';
import { unifiedAuthService, AuthState } from '../services/unifiedAuthService';
import {
  kasToSompi,
  sompiToKas,
  formatKas,
  generateRandomKaspaAddress,
  generate24WordMnemonic,
  generateDeterministicAddress,
  getAddressFromPublicKey,
  validateKaspaAddress,
  SOMPI_PER_KAS,
  fetchKaspaPrice,
  fetchKaspaAddressBalance,
  fetchKaspaAddressUtxos,
  fetchKaspaAddressesBalances,
  fetchKaspaAddressesUtxos,
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
} from '../utils/kaspa';

export interface IndexingState {
  isIndexing: boolean;
  scannedAddresses: number;
  foundAddresses: number;
  balanceSompi: bigint;
}

interface WalletContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
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
    amountKas: number | string,
    feeKas: number | string,
    note?: string,
    providedSeedPhrase?: string,
    providedPassphrase?: string,
    selectedUtxoOutpoints?: string[]
  ) => Promise<{ success: boolean; txid?: string; error?: string }>;
  compoundUtxos: (providedSeedPhrase?: string) => Promise<{ success: boolean; txid?: string; countMerged?: number }>;
  toggleLockUtxo: (outpoint: string) => void;

  // Network & Private Nodes
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  nodes: KaspaNode[];
  activeNode: KaspaNode;
  selectNode: (nodeId: string) => void;
  addCustomNode: (nodeOrUrl: string | KaspaNode, network?: NetworkType, name?: string, apiUrl?: string, explorerUrl?: string) => void;
  deleteCustomNode: (nodeId: string) => void;
  pingNodes: () => Promise<void>;

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
  authState: AuthState;
  clearPendingLockFlags: () => void;
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
  isBiometricsSupported: boolean;
  isBiometricsEnabled: boolean;
  enableBiometrics: (password: string) => Promise<boolean>;
  disableBiometrics: () => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  authorizeSigningWithBiometrics: () => Promise<{ success: boolean; decryptedPassword?: string; error?: string }>;

  // UI Modal States
  isSendOpen: boolean;
  setIsSendOpen: (open: boolean) => void;
  isScanOpen: boolean;
  setIsScanOpen: (open: boolean) => void;
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
  refreshBalance: (options?: { force?: boolean }) => Promise<void>;
  scanWalletChainIndex: () => Promise<void>;
  generateNewReceiveAddress: () => Promise<string | null>;
  switchReceiveAddress: (addr: string) => void;
  isScanningChain: boolean;
  isBalanceVisible: boolean;
  setIsBalanceVisible: (visible: boolean) => void;

  // Haptic Feedback
  isHapticsSupported: boolean;
  isHapticsEnabled: boolean;
  setIsHapticsEnabled: (enabled: boolean) => void;
  triggerHaptic: (type?: HapticType) => boolean;

  // Custom Endpoints
  apiUrl: string;
  setApiUrl: (url: string) => void;
  explorerUrl: string;
  setExplorerUrl: (url: string) => void;

  // Notifications
  isNotificationsEnabled: boolean;
  setIsNotificationsEnabled: (enabled: boolean) => void;

  dismissToast: () => void;
  toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
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
  },
  {
    id: 'node-community-mirror',
    name: 'Kaspa Community REST (api.kaspa.net)',
    url: 'grpcs://api.kaspa.net',
    apiUrl: 'https://api.kaspa.net',
    explorerUrl: 'https://explorer.kaspa.org',
    network: 'mainnet',
    latencyMs: 18,
    isOnline: true,
    selected: false,
  },
  {
    id: 'node-mainnet-ha',
    name: 'Kaspa High-Availability REST (api-mainnet.kaspa.org)',
    url: 'grpcs://api-mainnet.kaspa.org',
    apiUrl: 'https://api-mainnet.kaspa.org',
    explorerUrl: 'https://explorer.kaspa.org',
    network: 'mainnet',
    latencyMs: 22,
    isOnline: true,
    selected: false,
  },
  {
    id: 'node-kaspad-net',
    name: 'Kaspad Primary REST (api.kaspad.net)',
    url: 'grpcs://api.kaspad.net',
    apiUrl: 'https://api.kaspad.net',
    explorerUrl: 'https://explorer.kaspa.org',
    network: 'mainnet',
    latencyMs: 25,
    isOnline: true,
    selected: false,
  },
  {
    id: 'node-aspectron',
    name: 'Aspectron Kaspa REST (kaspa.aspectron.org)',
    url: 'grpcs://kaspa.aspectron.org',
    apiUrl: 'https://kaspa.aspectron.org',
    explorerUrl: 'https://explorer.kaspa.org',
    network: 'mainnet',
    latencyMs: 28,
    isOnline: true,
    selected: false,
  },
  {
    id: 'node-testnet-10',
    name: 'Kaspa Testnet 10 REST',
    url: 'grpcs://api-testnet-10.kaspa.org',
    apiUrl: 'https://api-testnet-10.kaspa.org',
    explorerUrl: 'https://explorer-testnet.kaspa.org',
    network: 'testnet-10',
    latencyMs: 35,
    isOnline: true,
    selected: false,
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
      setPanicWipeTriggered(false);
      try {
        // Pre-load and initialize Kaspa WASM runtime on application startup
        await ensureKaspaRuntime();

        await runDatabaseMigrations();

        // Request local notification permissions on app startup if native
        try {
          if (isNative()) {
            const permStatus = await LocalNotifications.checkPermissions();
            if (permStatus.display !== 'granted') {
              await LocalNotifications.requestPermissions();
            }
          }
        } catch (e) {
          // Ignore web platform notification unsupported errors
        }
        
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

        const bioSupported = await checkBiometricsSupported();
        setIsBiometricsSupported(bioSupported);
        const bioRecord = await getSetting<BiometricCredentialRecord>('wallet_biometric_credential');
        const bioEnabled = await getSetting<boolean>('wallet_biometrics_enabled');
        if (bioSupported && (bioEnabled || bioRecord?.credentialId) && (passwordEnabled || canary)) {
          setIsBiometricsEnabled(true);
        }

        const loggedOut = await getSetting<boolean>('kaspa_is_logged_out');
        if (loggedOut !== undefined) setIsLoggedOut(loggedOut);

        if (savedWallets.length > 0 && !loggedOut) {
          if (passwordEnabled || canary) {
            setIsPasswordEnabled(true);
            setIsLocked(true);
            unifiedAuthService.lock('startup', true);
          } else {
            setIsLocked(false);
            unifiedAuthService.completeUnlock('none');
          }
        } else {
          // No wallets exist (no create, import, or watch-only exists) -> do NOT lock
          setIsLocked(false);
          unifiedAuthService.completeUnlock('none');
        }

        const lockDuration = await getSetting<number>('auto_lock_duration');
        if (lockDuration) setAutoLockDuration(lockDuration);

        const savedLockOnExit = await getSetting<boolean>('lock_on_exit');
        if (savedLockOnExit !== undefined) setLockOnExit(savedLockOnExit);

        const savedNotifications = await getSetting<boolean>('kaspa_notifications_enabled');
        if (savedNotifications !== undefined) setIsNotificationsEnabledState(savedNotifications);

        const savedCustomNodes = await getSetting<KaspaNode[]>('kaspa_custom_nodes');
        const savedSelectedNodeId = await getSetting<string>('kaspa_selected_node_id');

        let mergedNodes = INITIAL_NODES;
        if (savedCustomNodes && Array.isArray(savedCustomNodes) && savedCustomNodes.length > 0) {
          const customList = savedCustomNodes.filter(cn => {
            const isLegacyNodeId = cn.id === 'node-kaspagov' || cn.id === 'node-aspectron';
            if (isLegacyNodeId || INITIAL_NODES.some(inNode => inNode.id === cn.id)) return false;

            if (!cn.apiUrl) return true;

            try {
              const { hostname } = new URL(cn.apiUrl);
              const lowerHost = hostname.toLowerCase();
              const isKaspagovHost =
                lowerHost === 'api.kaspagov.org' || lowerHost.endsWith('.api.kaspagov.org');
              return !isKaspagovHost;
            } catch {
              return true;
            }
          });
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

        const activeLoadedNode = mergedNodes.find(n => n.selected) || mergedNodes[0];

        let savedApiUrl = await getSetting<string>('kaspa_api_url') || activeLoadedNode?.apiUrl;
        let shouldResetApiUrl = !savedApiUrl;
        if (savedApiUrl) {
          try {
            const parsedApiUrl = new URL(savedApiUrl);
            const hostname = parsedApiUrl.hostname.toLowerCase();
            const hostLabels = hostname.split('.');
            shouldResetApiUrl =
              hostname === 'api.kaspagov.org' ||
              hostLabels.includes('testnet') ||
              hostLabels.includes('devnet');
          } catch {
            shouldResetApiUrl = true;
          }
        }
        if (shouldResetApiUrl) {
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
      if (isPanicWipeTriggered()) return;
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
    if (activeWalletId && !isPanicWipeTriggered()) {
      saveSetting('kaspa_active_wallet_id', activeWalletId);
    }
  }, [activeWalletId]);

  const [transactions, setTransactions] = useState<KaspaTransaction[]>([]);
  const transactionsRef = React.useRef(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const knownTxidsRef = React.useRef<Record<string, Set<string>>>({});
  const walletFirstFetchDone = React.useRef<Record<string, boolean>>({});
  const isAppActiveRef = React.useRef(true);

  const triggerNativeNotification = React.useCallback(async (title: string, body: string) => {
    if (!isNotificationsEnabledRef.current) return;
    try {
      if (isNative()) {
        const hasPerm = await LocalNotifications.checkPermissions();
        if (hasPerm.display === 'granted') {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: Math.floor(Math.random() * 1000000),
                sound: 'beep.wav',
              }
            ]
          });
        } else {
          await LocalNotifications.requestPermissions();
        }
      } else {
        // Web / PWA browser notification support when out of app / backgrounded
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
          } else if (Notification.permission !== 'denied') {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
              new Notification(title, { body, icon: '/favicon.ico' });
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to trigger notification:', err);
    }
  }, []);

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
  const [isBiometricsSupported, setIsBiometricsSupported] = useState<boolean>(false);
  const [isBiometricsEnabled, setIsBiometricsEnabled] = useState<boolean>(false);
  const [password, setPasswordState] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [authState, setAuthState] = useState<AuthState>(unifiedAuthService.getState());
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [lockOnExit, setLockOnExit] = useState<boolean>(true);

  // Sync with UnifiedAuthService state
  useEffect(() => {
    const unsub = unifiedAuthService.subscribe((payload) => {
      setAuthState(payload.state);
      if (payload.state === 'UNLOCKED') {
        setIsLocked(false);
      } else if (payload.state === 'LOCKED') {
        setIsLocked(true);
      }
    });
    return unsub;
  }, []);

  const clearPendingLockFlags = React.useCallback(() => {
    unifiedAuthService.clearPendingLockFlags();
  }, []);

  // Auto-lock timer logic with unified grace period awareness
  useEffect(() => {
    if (!isPasswordEnabled || isLocked || wallets.length === 0) return;

    let timeoutId: any;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (autoLockDuration > 0) {
        timeoutId = setTimeout(() => {
          if (!unifiedAuthService.isGracePeriodActive()) {
            lockWalletRef.current();
          }
        }, autoLockDuration * 60 * 1000);
      }
    };

    const handleVisibilityChange = () => {
      if (lockOnExit && document.visibilityState === 'hidden') {
        if (unifiedAuthService.isGracePeriodActive()) {
          return;
        }
        setTimeout(() => {
          if (document.visibilityState === 'hidden' && !unifiedAuthService.isGracePeriodActive()) {
            lockWalletRef.current();
          }
        }, 2000); // 2 second delay
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetTimer();

    let capAppListener: any = null;

    if (lockOnExit) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      CapacitorApp.addListener('appStateChange', (state) => {
        if (!state.isActive && !unifiedAuthService.isGracePeriodActive()) {
          lockWalletRef.current();
        }
      }).then((handle) => {
        capAppListener = handle;
      }).catch(() => {});
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
      if (capAppListener) {
        capAppListener.remove();
      }
    };
  }, [isPasswordEnabled, autoLockDuration, lockOnExit, isLocked, wallets.length]);

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
    setIsScanOpen(false);
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
    
    // If no wallets remain, do NOT lock
    setIsLocked(false);
    unifiedAuthService.completeUnlock('none');
    setPasswordState(null);
    showToast('Logged out. All wallet data cleared successfully.', 'info');
  };

  // Modals
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isWalletSetupOpen, setIsWalletSetupOpen] = useState(false);
  const [isCompoundOpen, setIsCompoundOpen] = useState(false);
  const [isSignMessageOpen, setIsSignMessageOpen] = useState(false);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const [isNodeManagerOpen, setIsNodeManagerOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'history' | 'contacts' | 'settings'>('home');
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);

  // Haptic feedback state
  const [isHapticsSupported] = useState<boolean>(() => checkHapticsSupported());
  const [isHapticsEnabledState, setIsHapticsEnabledState] = useState<boolean>(() => getHapticsEnabled());

  // Notifications state
  const [isNotificationsEnabledState, setIsNotificationsEnabledState] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('kaspa_notifications_enabled');
      return val !== null ? JSON.parse(val) : true;
    } catch {
      return true;
    }
  });

  const isNotificationsEnabledRef = React.useRef(isNotificationsEnabledState);
  useEffect(() => {
    isNotificationsEnabledRef.current = isNotificationsEnabledState;
  }, [isNotificationsEnabledState]);

  const setIsNotificationsEnabled = React.useCallback((enabled: boolean) => {
    setIsNotificationsEnabledState(enabled);
    try {
      localStorage.setItem('kaspa_notifications_enabled', JSON.stringify(enabled));
    } catch {}
    saveSetting('kaspa_notifications_enabled', enabled).catch(() => {});
  }, []);


  const setIsHapticsEnabled = React.useCallback((enabled: boolean) => {
    setIsHapticsEnabledState(enabled);
    setHapticsStorage(enabled);
    if (enabled) {
      executeHaptic('medium');
    }
  }, []);

  const triggerHaptic = React.useCallback((type?: HapticType) => {
    return executeHaptic(type);
  }, []);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });

    // Tactile haptic feedback for notifications
    if (type === 'success') {
      hapticSuccess();
    } else if (type === 'error') {
      hapticError();
    } else {
      hapticLight();
    }

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

  const spentUtxoTimestampsRef = React.useRef<Record<string, number>>({});

  const localPendingTxsRef = React.useRef(localPendingTxs);
  useEffect(() => {
    localPendingTxsRef.current = localPendingTxs;
  }, [localPendingTxs]);

  const [localPendingChangeUtxos, setLocalPendingChangeUtxos] = useState<(UTXO & { timestamp: number })[]>([]);
  const localPendingChangeUtxosRef = React.useRef(localPendingChangeUtxos);
  useEffect(() => {
    localPendingChangeUtxosRef.current = localPendingChangeUtxos;
  }, [localPendingChangeUtxos]);

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

  const lockWallet = React.useCallback((force: boolean = false) => {
    if (wallets.length === 0) return; // Do NOT lock if no wallet exists (no create, import, or watch-only)
    if (isPasswordEnabled) {
      if (!unifiedAuthService.lock('user_or_event', force)) {
        return;
      }
      setPasswordState(null);  // clear active password from memory
      setIsLocked(true);
      setWallets((prevWallets) =>
        prevWallets.map((w) => {
          if (w.mnemonic) {
            // zeroize string reference if possible
            w.mnemonic = undefined;
          }
          if (w.passphrase) {
            w.passphrase = undefined;
          }
          return {
            ...w,
            mnemonic: undefined,
            passphrase: undefined,
          };
        })
      );
      showToast('Wallet locked & memory zeroized', 'info');
    }
  }, [isPasswordEnabled, showToast, wallets.length]);

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
  const consecutiveFailuresRef = useRef(0);
  const lastRefreshTimeRef = useRef(0);

  const scheduleJitteredPostTxRefreshes = React.useCallback((refreshFn: (options?: { force?: boolean }) => Promise<void>) => {
    // Jittered post-transaction refresh delays to avoid API rate limiting bursts
    const delays = [
      2000 + Math.random() * 1000,   // ~2.0s - 3.0s
      7000 + Math.random() * 2000,   // ~7.0s - 9.0s
      18000 + Math.random() * 4000,  // ~18.0s - 22.0s
    ];
    delays.forEach(delay => {
      setTimeout(() => {
        refreshFn({ force: true });
      }, Math.round(delay));
    });
  }, []);

  const refreshBalance = React.useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (isRefreshingBalance.current) return;
    // Throttle non-forced calls if triggered within 2000ms
    if (!options?.force && now - lastRefreshTimeRef.current < 2000) return;

    isRefreshingBalance.current = true;
    lastRefreshTimeRef.current = now;

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

        // 1. Fetch live balances, UTXOs and transactions
        let balances: (bigint | null)[] = [];
        let utxosResults: (KaspaUtxo[] | null)[] = [];
        let txResults: (any[] | null)[] = [];
        let bulkSuccess = false;

        try {
          const bulkBalances: { [address: string]: bigint | null } = {};
          const bulkUtxos: KaspaUtxo[] = [];
          
          // Query in batches of 20 addresses
          const bulkChunkSize = 20;
          let failedBulk = false;

          for (let i = 0; i < addressesToFetch.length; i += bulkChunkSize) {
            const chunk = addressesToFetch.slice(i, i + bulkChunkSize);
            const [chunkBalances, chunkUtxos] = await Promise.all([
              fetchKaspaAddressesBalances(chunk),
              fetchKaspaAddressesUtxos(chunk),
            ]);

            if (chunkBalances === null || chunkUtxos === null) {
              failedBulk = true;
              break;
            }

            // Merge balances
            Object.assign(bulkBalances, chunkBalances);
            // Merge UTXOs
            bulkUtxos.push(...chunkUtxos);
          }

          if (!failedBulk) {
            // Bulk calls succeeded! Map results 1-to-1 with addressesToFetch with case-insensitive normalization
            const normBalances: { [normAddr: string]: bigint | null } = {};
            Object.entries(bulkBalances).forEach(([k, v]) => {
              normBalances[k.trim().toLowerCase()] = v;
            });
            balances = addressesToFetch.map(addr => {
              const norm = addr.trim().toLowerCase();
              return normBalances[norm] !== undefined ? normBalances[norm] : null;
            });

            const normMap = new Map<string, string>();
            addressesToFetch.forEach(addr => normMap.set(addr.trim().toLowerCase(), addr));

            const utxosByAddress: { [address: string]: KaspaUtxo[] } = {};
            addressesToFetch.forEach(addr => { utxosByAddress[addr] = []; });

            bulkUtxos.forEach(u => {
              const uNorm = u.address ? u.address.trim().toLowerCase() : '';
              const origAddr = normMap.get(uNorm);
              if (origAddr && utxosByAddress[origAddr]) {
                utxosByAddress[origAddr].push({ ...u, address: origAddr });
              } else if (addressesToFetch.length === 1) {
                utxosByAddress[addressesToFetch[0]].push({ ...u, address: addressesToFetch[0] });
              }
            });
            utxosResults = addressesToFetch.map(addr => utxosByAddress[addr]);

            // Fetch transaction records for primary, active, or discovered addresses in sequential/batched chunks
            txResults = [];
            const txBatchSize = 2;
            for (let i = 0; i < addressesToFetch.length; i += txBatchSize) {
              const chunk = addressesToFetch.slice(i, i + txBatchSize);
              const chunkIdxs = Array.from({ length: chunk.length }, (_, k) => i + k);

              const chunkTxs = await Promise.all(
                chunk.map((addr, idx) => {
                  const globalIdx = chunkIdxs[idx];
                  const isPrimary = addr === wallet.receiveAddress;
                  const hasBal = balances[globalIdx] !== null && balances[globalIdx]! > 0n;
                  const hasUtxos = utxosResults[globalIdx] !== null && Array.isArray(utxosResults[globalIdx]) && utxosResults[globalIdx]!.length > 0;
                  const isDiscovered = wallet.discoveredAddresses?.includes(addr);
                  const isLowIndex = globalIdx < 4; // Always fetch for first few receive & change addresses
                  if (isPrimary || hasBal || hasUtxos || isDiscovered || isLowIndex) {
                    return fetchKaspaAddressTransactions(addr);
                  }
                  return Promise.resolve([]);
                })
              );
              txResults.push(...chunkTxs);

              if (i + txBatchSize < addressesToFetch.length) {
                await new Promise(r => setTimeout(r, 120));
              }
            }

            bulkSuccess = true;
          }
        } catch {
          // Bulk fetch failed or unsupported, fallback gracefully
        }

        // 2. Fallback to individual sequential/batched chunks if bulk POST failed/unsupported
        if (!bulkSuccess) {
          const batchSize = 3;
          balances = [];
          utxosResults = [];
          txResults = [];

          for (let i = 0; i < addressesToFetch.length; i += batchSize) {
            const chunk = addressesToFetch.slice(i, i + batchSize);
            const [chunkBalances, chunkUtxos] = await Promise.all([
              Promise.all(chunk.map(addr => fetchKaspaAddressBalance(addr))),
              Promise.all(chunk.map(addr => fetchKaspaAddressUtxos(addr))),
            ]);

            // Fetch transaction records for primary receive address, discovered addresses, or active balance/UTXOs
            const chunkTxs = await Promise.all(
              chunk.map((addr, idx) => {
                const globalIdx = i + idx;
                const isPrimary = addr === wallet.receiveAddress;
                const hasBal = chunkBalances[idx] !== null && chunkBalances[idx]! > 0n;
                const hasUtxos = chunkUtxos[idx] !== null && Array.isArray(chunkUtxos[idx]) && chunkUtxos[idx]!.length > 0;
                const isDiscovered = wallet.discoveredAddresses?.includes(addr);
                const isLowIndex = globalIdx < 4;
                if (isPrimary || hasBal || hasUtxos || isDiscovered || isLowIndex) {
                  return fetchKaspaAddressTransactions(addr);
                }
                return Promise.resolve([]);
              })
            );

            balances.push(...chunkBalances);
            utxosResults.push(...chunkUtxos);
            txResults.push(...chunkTxs);

            // 120ms delay between chunks to respect rate limits
            if (i + batchSize < addressesToFetch.length) {
              await new Promise(r => setTimeout(r, 120));
            }
          }
        }

        const hasValidUtxoResponse = utxosResults.some(res => Array.isArray(res));
        const hasValidBalanceResponse = (balances as (bigint | null)[]).some(bal => bal !== null);
        const allAddressResponsesFailed = !hasValidUtxoResponse && !hasValidBalanceResponse;

        // If all network calls failed (e.g. offline, rate limited or API down), retain existing cached UTXOs and balance
        if (allAddressResponsesFailed) {
          consecutiveFailuresRef.current += 1;
          return;
        }

        consecutiveFailuresRef.current = 0;

        const totalLiveBalance = (balances as (bigint | null)[]).reduce<bigint>((sum, bal) => sum + (bal !== null && bal !== undefined ? bal : 0n), 0n);

        // Assemble UTXOs for all addresses
        const allMergedUtxos: UTXO[] = [];
        utxosResults.forEach((liveUtxosData, addrIdx) => {
          const address = addressesToFetch[addrIdx];
          if (liveUtxosData && Array.isArray(liveUtxosData)) {
            liveUtxosData.forEach((u: any, idx: number) => {
              const devPath = wallet.addressPaths?.[address];
              allMergedUtxos.push({
                id: `utxo-live-${u.outpoint?.transactionId || u.transaction_id || u.txid || idx}-${idx}`,
                txid: u.outpoint?.transactionId || u.transaction_id || u.txid || '',
                vout: u.outpoint?.index !== undefined ? Number(u.outpoint.index) : (u.index !== undefined ? Number(u.index) : (u.vout ?? 0)),
                amountSompi: BigInt(u.utxoEntry?.amount || u.amount || u.amountSompi || 0),
                address,
                blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.block_daa_score || u.blockDaaScore || 0),
                derivationPath: devPath,
              });
            });
          } else {
            // Preserve cached UTXOs for this address if UTXO network call failed/returned null
            const normA = address.trim().toLowerCase();
            const existingAddressUtxos = utxosRef.current.filter(u => u.address && u.address.trim().toLowerCase() === normA);
            allMergedUtxos.push(...existingAddressUtxos);
          }
        });

        // Inject local pending change UTXOs that haven't been picked up/returned by the API yet
        const now = Date.now();
        const liveOutpointKeys = new Set(allMergedUtxos.map(u => `${u.txid}:${u.vout}`));
        const stillPendingChange: (UTXO & { timestamp: number })[] = [];

        localPendingChangeUtxosRef.current.forEach((pending) => {
          const key = `${pending.txid}:${pending.vout}`;
          const isExpired = (now - pending.timestamp) > 15000;
          if (liveOutpointKeys.has(key)) {
            // Already officially in the live UTXO set! No need to track anymore
          } else if (isExpired) {
            // Expired after 15 seconds (safety cleanup), drop it
          } else {
            // Not yet returned by node, keep tracking and merge into UTXO outputs list
            stillPendingChange.push(pending);
            allMergedUtxos.push(pending);
          }
        });
        setLocalPendingChangeUtxos(stillPendingChange);

        // Filter out locally spent UTXOs to prevent balance and UTXO flickering while node updates
        const spentSet = new Set(spentUtxoOutpointsRef.current);
        const filteredUtxos = allMergedUtxos.filter((u) => {
          const outpoint = `${u.txid}:${u.vout}`;
          return !spentSet.has(outpoint);
        });

        // Update UTXOs: if response was valid or we have UTXOs, save them. Never wipe if requests errored.
        const allAddressesValid = utxosResults.every(res => Array.isArray(res));
        if (filteredUtxos.length > 0 || allAddressesValid) {
          setUtxos(filteredUtxos);
          try {
            saveUtxosToDB(wallet.id, filteredUtxos);
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.removeItem(`kaspriv_utxos_cache_${wallet.id}`);
            }
          } catch (e) {
            console.warn('Failed to cache UTXOs to IndexedDB:', e);
          }
        }

        // Calculate verified live spendable balance from actual unspent UTXO set
        const utxoSum = filteredUtxos.reduce((sum, u) => sum + u.amountSompi, 0n);
        let verifiedBalance = wallet.balanceSompi;
        if (utxoSum > 0n) {
          verifiedBalance = utxoSum;
        } else if (totalLiveBalance > 0n && spentUtxoOutpointsRef.current.length === 0) {
          verifiedBalance = totalLiveBalance;
        } else if (allAddressesValid && (balances as (bigint | null)[]).every(b => b !== null)) {
          // Only drop to 0 if all address queries affirmatively completed with 0 without network errors
          verifiedBalance = utxoSum;
        } else {
          // Retain existing balance if any query failed
          verifiedBalance = wallet.balanceSompi;
        }

        const updatedBalances: { [address: string]: string } = {};
        addressesToFetch.forEach((addr, idx) => {
          const normAddr = addr.trim().toLowerCase();
          const addrUtxos = filteredUtxos.filter(u => u.address && u.address.trim().toLowerCase() === normAddr);
          const addrUtxoSum = addrUtxos.reduce((s, u) => s + u.amountSompi, 0n);
          const liveAddrBal = balances[idx];
          const prevAddrBal = wallet.addressBalances?.[addr] || '0';

          let calculatedBal = 0n;
          if (addrUtxoSum > 0n) {
            calculatedBal = addrUtxoSum;
          } else if (liveAddrBal !== null && liveAddrBal !== undefined) {
            calculatedBal = liveAddrBal;
          } else {
            // Keep previous balance if this address request failed
            try {
              calculatedBal = BigInt(prevAddrBal);
            } catch {
              calculatedBal = 0n;
            }
          }
          updatedBalances[addr] = calculatedBal.toString();
        });

        setWallets((prev: Wallet[]) =>
          prev.map((w): Wallet => (w.id === wallet.id ? { 
            ...w, 
            balanceSompi: verifiedBalance,
            addressBalances: updatedBalances
          } : w))
        );

        // Clean up spentUtxoOutpoints: keep only outpoints that the API node still mistakenly returns,
        // or that were spent within the last 15 seconds (safety margin for load-balanced/lagging nodes)
        setSpentUtxoOutpoints((prev) => prev.filter(op => {
          const spentTime = spentUtxoTimestampsRef.current[op] || 0;
          const isRecentlySpent = (now - spentTime) < 15000;
          return liveOutpointKeys.has(op) || isRecentlySpent;
        }));

        // Process transactions for all addresses and merge them
        const rawTxsList: any[] = [];
        txResults.forEach((liveTxsData) => {
          if (liveTxsData && Array.isArray(liveTxsData)) {
            rawTxsList.push(...liveTxsData);
          }
        });

        const allMergedTxs = parseRawKaspaTransactions(rawTxsList, addressesToFetch, wallet.receiveAddress);

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
        if (combinedTxs.length > 0) {
          saveTransactionsToDB(wallet.id, combinedTxs).catch(err => {
            console.warn('Failed to cache transactions to DB in refreshBalance:', err);
          });
        }

        // Check for new incoming or outgoing transactions and trigger native notifications
        if (wallet && wallet.id) {
          const walletId = wallet.id;
          if (!knownTxidsRef.current[walletId]) {
            knownTxidsRef.current[walletId] = new Set();
          }

          const existingSet = knownTxidsRef.current[walletId];
          const isFirstFetchForWallet = !walletFirstFetchDone.current[walletId];

          if (isFirstFetchForWallet) {
            // First live fetch for this wallet (e.g. fresh wallet or import)
            // Just populate the known transaction IDs without notifications so we don't spam history
            allMergedTxs.forEach((tx) => {
              if (tx && tx.txid) {
                existingSet.add(tx.txid);
              }
            });
            walletFirstFetchDone.current[walletId] = true;
          } else {
            // Subsequent fetches: any transaction not in existingSet is NEW!
            allMergedTxs.forEach((tx) => {
              if (tx && tx.txid && !existingSet.has(tx.txid)) {
                existingSet.add(tx.txid);

                // Format amount
                const formattedAmt = sompiToKas(tx.amountSompi).toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 8,
                });

                if (tx.type === 'receive') {
                  triggerNativeNotification(
                    'Received Kaspa 🟢',
                    `+${formattedAmt} KAS received in your wallet`
                  );
                } else if (tx.type === 'send') {
                  triggerNativeNotification(
                    'Sent Kaspa 🔴',
                    `-${formattedAmt} KAS sent from your wallet`
                  );
                }
              }
            });
          }
        }

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
  }, [refreshDaaScore, password, triggerNativeNotification]);

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
          setTransactions(cachedTxs || []);
          if (cachedTxs && cachedTxs.length > 0) {
            if (!knownTxidsRef.current[activeWalletId]) {
              knownTxidsRef.current[activeWalletId] = new Set(cachedTxs.map(tx => tx.txid));
              walletFirstFetchDone.current[activeWalletId] = true;
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load cached transactions from IndexedDB:', e);
        if (isMounted) setTransactions([]);
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
          } else {
            // Keep existing in-memory UTXOs if set during scan/import, preventing wipeout
            setUtxos((prevUtxos) => (prevUtxos && prevUtxos.length > 0 ? prevUtxos : []));
          }
        }
      } catch (e) {
        console.warn('Failed to load cached UTXOs from IndexedDB:', e);
      }
      // Trigger fresh network synchronization as long as wallet is unlocked
      if (!isLocked) {
        isRefreshingBalance.current = false;
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

  // Unified Jittered Polling Manager with exponential backoff on node errors
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const scheduleNextPoll = () => {
      if (!isMounted) return;

      // Base polling interval: 30 seconds when active foreground, 60 seconds when backgrounded
      const isForeground = isAppActiveRef.current && (typeof document === 'undefined' || !document.hidden);
      const baseIntervalMs = isForeground ? 30000 : 60000;

      // Exponential backoff if consecutive node errors occur (up to 4x multiplier)
      const failures = consecutiveFailuresRef.current;
      const backoffMultiplier = failures > 0 ? Math.min(Math.pow(1.5, failures), 4) : 1;

      // ±25% randomized jitter to reduce server request synchronization and rate-limit bursts
      const targetInterval = baseIntervalMs * backoffMultiplier;
      const jitterAmount = (Math.random() * 2 - 1) * (targetInterval * 0.25);
      const delayMs = Math.max(5000, Math.round(targetInterval + jitterAmount));

      timerId = setTimeout(async () => {
        if (isMounted && !isLocked && activeWalletId) {
          isRefreshingBalance.current = false;
          await refreshBalanceRef.current();
        }
        scheduleNextPoll();
      }, delayMs);
    };

    if (!isLocked && activeWalletId) {
      refreshBalanceRef.current();
    }

    scheduleNextPoll();

    const priceInterval = setInterval(() => refreshPrice(), 45000); // 45s price refresh
    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      clearInterval(priceInterval);
    };
  }, [refreshPrice, isLocked, activeWalletId]);

  // Native & Web Notifications Background Listener
  useEffect(() => {
    const handleStateChange = (state: { isActive: boolean }) => {
      isAppActiveRef.current = state.isActive;
      console.log('[Notifications Service] Active State changed:', state.isActive);
      if (!isLocked && activeWalletId) {
        // Throttled refresh on state change (minimum 4 seconds since last refresh)
        if (Date.now() - lastRefreshTimeRef.current >= 4000) {
          isRefreshingBalance.current = false;
          refreshBalanceRef.current();
        }
      }
    };

    const handleVisibilityChange = () => {
      const active = !document.hidden;
      isAppActiveRef.current = active;
      if (active && !isLocked && activeWalletId) {
        if (Date.now() - lastRefreshTimeRef.current >= 4000) {
          isRefreshingBalance.current = false;
          refreshBalanceRef.current();
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const listenerPromise = CapacitorApp.addListener('appStateChange', handleStateChange);

    return () => {
      listenerPromise.then(h => h.remove()).catch(() => {});
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isLocked, activeWalletId]);

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
        setPasswordState(null);
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

      setWallets((prev) => [...prev, newW]);
      setActiveWalletIdState(newW.id);
      setIsLoggedOut(false);
      try {
        await saveWalletToDB(newW);
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}

      if (password) {
        await setPassword(password, [newW]);
        setIsLocked(true);
        setPasswordState(null);
        unifiedAuthService.lock('creation', true);
      } else {
        setIsLocked(false);
        unifiedAuthService.completeUnlock('none');
      }

      if (duressPassword) {
        await setDuressPassword(duressPassword);
      }

      setActiveBottomTab('home');

      isRefreshingBalance.current = false;
      showToast(`Created wallet '${newW.name}'`, 'success');
      setTimeout(() => { refreshBalance(); }, 100);
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
      if (!tx) return;
      const txid = typeof tx === 'string' ? tx : (tx.transaction_id || tx.txid || tx.id || '');
      if (!txid || seenTxids.has(txid)) return;
      seenTxids.add(txid);

      const outputs = Array.isArray(tx.outputs) ? tx.outputs : [];
      const inputs = Array.isArray(tx.inputs) ? tx.inputs : [];

      const hasOurAddressInOutputs = outputs.some((out: any) => {
        const outAddr = out.script_public_key_address || out.address;
        return belongsToUs(outAddr);
      });

      const hasOurAddressInInputs = inputs.some((inp: any) => 
        belongsToUs(inp.previous_outpoint_address) || belongsToUs(inp.address)
      );

      const isOut = hasOurAddressInInputs || (outputs.length > 0 && !hasOurAddressInOutputs);
      
      let amountSompi = 0n;
      if (isOut) {
        amountSompi = outputs.reduce((acc: bigint, out: any) => {
          const outAddr = out.script_public_key_address || out.address;
          if (!belongsToUs(outAddr)) {
            return acc + BigInt(out.amount || out.value || 0);
          }
          return acc;
        }, 0n);
      } else {
        amountSompi = outputs.reduce((acc: bigint, out: any) => {
          const outAddr = out.script_public_key_address || out.address;
          if (belongsToUs(outAddr)) {
            return acc + BigInt(out.amount || out.value || 0);
          }
          return acc;
        }, 0n);
      }

      // Fallback if outputs/inputs weren't resolved or amount was 0 but direct amount field exists
      if (amountSompi === 0n && (tx.amount || tx.value || tx.amountSompi)) {
        try {
          amountSompi = BigInt(tx.amount || tx.value || tx.amountSompi || 0);
        } catch {}
      }

      const sumInputs: bigint = inputs.reduce((acc: bigint, inp: any) => 
        acc + BigInt(inp.previous_outpoint_amount || inp.amount || inp.value || 0), 0n);
      const sumOutputs: bigint = outputs.reduce((acc: bigint, out: any) => 
        acc + BigInt(out.amount || out.value || 0), 0n);
      const feeSompi: bigint = (sumInputs > sumOutputs) ? (sumInputs - sumOutputs) : BigInt(tx.fee || tx.feeSompi || 0);

      const firstTargetOutput = outputs.find((out: any) => {
        const outAddr = out.script_public_key_address || out.address;
        return isOut ? !belongsToUs(outAddr) : belongsToUs(outAddr);
      });
      
      const txAddress: string = firstTargetOutput?.script_public_key_address || 
                               firstTargetOutput?.address || 
                               (isOut ? (inputs[0]?.previous_outpoint_address || inputs[0]?.address || defaultAddress) : defaultAddress);

      const txType = isOut ? (amountSompi === 0n ? 'compound' : 'send') : 'receive';

      let rawTime = Number(tx.block_time || tx.blockTime || tx.timestamp || Date.now());
      if (rawTime > 0 && rawTime < 10000000000) {
        rawTime *= 1000;
      }
      if (!rawTime || isNaN(rawTime)) rawTime = Date.now();

      allMergedTxs.push({
        txid,
        type: txType,
        amountSompi,
        feeSompi,
        address: txAddress,
        timestamp: rawTime,
        blockDaaScore: Number(tx.block_daa_score || tx.blockDaaScore || tx.accepting_block_blue_score || tx.accepting_block_daa_score || 0),
        note: tx.note || (txType === 'compound' ? 'Compounded UTXOs' : (isOut ? 'Sent Kaspa' : 'Received Kaspa')),
        isAccepted: Boolean(tx.is_accepted ?? tx.isAccepted ?? true),
        confirmations: tx.confirmations || 1,
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
        50,
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
        mStr, passphrase, prefix, addressType, 50,
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
        setPasswordState(null);
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
        await saveWalletToDB(newW);
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}

      if (password) {
        await setPassword(password, [newW]);
        setIsLocked(true);
        setPasswordState(null);
        unifiedAuthService.lock('creation', true);
      } else {
        setIsLocked(false);
        unifiedAuthService.completeUnlock('none');
      }

      if (duressPassword) {
        await setDuressPassword(duressPassword);
      }
      
      setActiveBottomTab('home');

      isRefreshingBalance.current = false;
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
      const trimmedAddr = kpubOrAddress.trim();
      const validation = validateKaspaAddress(trimmedAddr, network);
      if (!validation.isValid) {
        showToast('Invalid public key/address — import cancelled.', 'error');
        throw new Error('Invalid public key/address — import cancelled.');
      }
      targetAddress = trimmedAddr;
    } else {
      try {
        // Try to derive from kpub/pubkey hex
        targetAddress = getAddressFromPublicKey(kpubOrAddress.trim(), addressType, prefix);
      } catch (e) {
        showToast('Invalid public key/address — import cancelled.', 'error');
        throw new Error('Invalid public key/address — import cancelled.');
      }
    }

    let initialBal: bigint | null = null;
    let initialUtxos: UTXO[] = [];
    try {
      const [balRes, utxosRes] = await Promise.all([
        fetchKaspaAddressBalance(targetAddress),
        fetchKaspaAddressUtxos(targetAddress)
      ]);
      initialBal = balRes;
      if (utxosRes && Array.isArray(utxosRes)) {
        initialUtxos = utxosRes.map((u: any, idx: number) => ({
          id: `utxo-${u.outpoint?.transactionId || u.transaction_id || idx}-${idx}`,
          txid: u.outpoint?.transactionId || u.transaction_id || '',
          vout: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)),
          amountSompi: BigInt(u.utxoEntry?.amount || u.amount || 0),
          address: targetAddress,
          blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.block_daa_score || 0),
        }));
      }
    } catch (e) {
      console.warn('Initial fetch for watch-only address failed:', e);
    }

    const utxoSum = initialUtxos.reduce((sum, u) => sum + u.amountSompi, 0n);
    const finalBal = initialBal !== null ? initialBal : utxoSum;

    const newW: Wallet = {
      id: `w-kpub-${Date.now()}`,
      name: sanitizeWalletName(name, 'Watch-Only Wallet'),
      receiveAddress: targetAddress,
      changeAddress: targetAddress,
      kpub: isDirectAddress ? undefined : kpubOrAddress,
      isImportedKpub: true,
      isWatchOnly: true,
      balanceSompi: finalBal,
      createdAt: Date.now(),
      addressType,
      discoveredAddresses: [targetAddress],
      addressPaths: { [targetAddress]: "m/44'/111111'/0'/0/0" },
      addressBalances: { [targetAddress]: finalBal.toString() },
    };

    setUtxos(initialUtxos);
    setWallets((prev) => [...prev, newW]);
    setActiveWalletIdState(newW.id);
    setIsLoggedOut(false);

    try {
      await saveUtxosToDB(newW.id, initialUtxos);
      await saveWalletToDB(newW);
      await saveSetting('kaspa_is_logged_out', false);
    } catch (e) {}

    if (password) {
      await setPassword(password, [newW]);
      setIsLocked(true);
      setPasswordState(null);
      unifiedAuthService.lock('creation', true);
    } else {
      setIsLocked(false);
      unifiedAuthService.completeUnlock('none');
    }
    if (duressPassword) {
      await setDuressPassword(duressPassword);
    }

    setActiveBottomTab('home');

    isRefreshingBalance.current = false;
    showToast(`Imported Watch-Only Kaspa Address / Kpub`, 'success');
    setTimeout(() => { refreshBalance(); }, 100);
    return newW;
  };

  const sendKaspa = async (
    toAddress: string,
    amountKas: number | string,
    feeKas: number | string,
    note?: string,
    providedSeedPhrase?: string,
    providedPassphrase?: string,
    selectedUtxoOutpoints?: string[]
  ): Promise<{ success: boolean; txid?: string; error?: string; inputs?: any[] }> => {
    if (!activeWallet) return { success: false, error: 'No active wallet selected' };
    
    let seedToUse: string | null = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic || null;
    let passphraseToUse: string | null | undefined = providedPassphrase !== undefined ? providedPassphrase : activeWallet.passphrase;

    let activePassword = password;

    if (isBiometricsEnabled && !providedSeedPhrase) {
      const authRes = await authorizeSigningWithBiometrics();
      if (!authRes.success) {
        return { success: false, error: authRes.error || 'Biometric authentication required.' };
      }
      if (authRes.decryptedPassword) {
        activePassword = authRes.decryptedPassword;
        if (!password) {
          await unlockWallet(authRes.decryptedPassword);
        }
      }
    }

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
      const effectiveFeeKas = Math.max(Number(feeKas) || 0, minFeeKas);

      let amountSompi = kasToSompi(amountKas);
      const feeSompi = kasToSompi(effectiveFeeKas);
      let totalSompiNeeded = amountSompi + feeSompi;

      if (activeWallet.balanceSompi < totalSompiNeeded && (!selectedUtxoOutpoints || selectedUtxoOutpoints.length === 0)) {
        // If user specified an amount close to or equal to their balance (e.g. 0.01 KAS with 0.01 balance), auto-deduct fee from amount
        if (activeWallet.balanceSompi >= feeSompi && Number(amountKas) >= sompiToKas(activeWallet.balanceSompi) * 0.95) {
          amountSompi = activeWallet.balanceSompi - feeSompi;
          totalSompiNeeded = activeWallet.balanceSompi;
        } else {
          const err = `Insufficient balance. Required: ${sompiToKas(totalSompiNeeded).toFixed(4)} KAS, Available: ${sompiToKas(activeWallet.balanceSompi)} KAS`;
          console.error('[Send Transaction] Balance check failed:', err);
          return { success: false, error: err };
        }
      }

      // 1. Fetch real UTXOs for all discovered addresses in batches
      const addressesToFetch = activeWallet.discoveredAddresses && activeWallet.discoveredAddresses.length > 0
        ? activeWallet.discoveredAddresses
        : [activeWallet.receiveAddress];
      
      const utxosResults: (KaspaUtxo[] | null)[] = [];
      const batchSize = 4;
      for (let i = 0; i < addressesToFetch.length; i += batchSize) {
        const chunk = addressesToFetch.slice(i, i + batchSize);
        const chunkResults = await Promise.all(chunk.map(addr => fetchKaspaAddressUtxos(addr)));
        utxosResults.push(...chunkResults);
        if (i + batchSize < addressesToFetch.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      
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
        } else {
          // Fall back to cached UTXOs for this address if network query failed
          const cachedAddressUtxos = utxosRef.current.filter(u => u.address === address);
          cachedAddressUtxos.forEach((cu) => {
            utxosResponse.push({
              txid: cu.txid,
              vout: cu.vout,
              amount: cu.amountSompi.toString(),
              address: cu.address,
              blockDaaScore: cu.blockDaaScore,
              derivationPath: cu.derivationPath,
              outpoint: { transactionId: cu.txid, index: cu.vout },
              utxoEntry: { amount: cu.amountSompi.toString(), blockDaaScore: cu.blockDaaScore },
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

        // If manual Coin Control selection is used, only include matching selected outpoints, and reject if frozen/locked
        if (manualSelectedSet) {
          if (!manualSelectedSet.has(outpoint)) return false;
          if (lockedSet.has(outpoint)) return false;
          return true;
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
        if (accumulatedSum > finalFeeSompi && (Number(amountKas) >= sompiToKas(activeWallet.balanceSompi) * 0.85 || accumulatedSum >= amountSompi)) {
          finalAmountSompi = accumulatedSum - finalFeeSompi;
          totalNeededWithBump = accumulatedSum;
          console.warn(`[Fee Scaling] Adjusted sendable amount to ${sompiToKas(finalAmountSompi)} KAS to safely cover network relay fee of ${sompiToKas(finalFeeSompi)} KAS for ${selectedUtxos.length} UTXOs.`);
        } else {
          const err = `Insufficient spendable balance across selected UTXOs. Available: ${sompiToKas(accumulatedSum)} KAS (in ${selectedUtxos.length} UTXOs), Needed: ${sompiToKas(totalNeededWithBump)} KAS (${amountKas} KAS + ${sompiToKas(finalFeeSompi)} KAS network relay fee).`;
          console.error('[Send Transaction] UTXO accumulation failed:', err);
          return { success: false, error: err };
        }
      }

      // Privacy & UTXO Integrity: Use next sequential unused change address and persist derivation path
      let effectiveChangeAddress = activeWallet.changeAddress;
      let effectiveChangePath = activeWallet.addressPaths?.[effectiveChangeAddress] || '';

      if (seedToUse) {
        try {
          const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
          const paths = activeWallet.addressPaths || {};
          const allDiscovered = activeWallet.discoveredAddresses || [activeWallet.receiveAddress];

          const changeAddressesList = allDiscovered
            .filter((addr) => {
              const p = paths[addr] || '';
              return p.includes('/1/');
            })
            .map((addr) => {
              const p = paths[addr] || '';
              const parts = p.split('/');
              const idx = parseInt(parts[parts.length - 1] || '0', 10);
              return { addr, idx, path: p };
            })
            .sort((a, b) => a.idx - b.idx);

          // Find the highest existing change index
          const maxIdx = changeAddressesList.reduce((max, item) => Math.max(max, item.idx), -1);
          const nextIdx = maxIdx + 1;
          const nextDerivationPath = `m/44'/111111'/0'/1/${nextIdx}`;

          const freshChangeAddress = await generateDeterministicAddress(
            seedToUse,
            passphraseToUse || undefined,
            prefix,
            addrType,
            nextIdx,
            true
          );

          effectiveChangeAddress = freshChangeAddress;
          effectiveChangePath = nextDerivationPath;

          // Reliably persist the newly derived change address and its derivation path in wallet state
          setWallets((prev) =>
            prev.map((w) => {
              if (w.id === activeWallet.id) {
                const updatedDiscovered = w.discoveredAddresses ? [...w.discoveredAddresses] : [];
                if (!updatedDiscovered.includes(freshChangeAddress)) {
                  updatedDiscovered.push(freshChangeAddress);
                }
                const updatedPaths = { ...w.addressPaths, [freshChangeAddress]: nextDerivationPath };
                return {
                  ...w,
                  discoveredAddresses: updatedDiscovered,
                  addressPaths: updatedPaths,
                  changeAddress: freshChangeAddress,
                };
              }
              return w;
            })
          );
        } catch {
          effectiveChangeAddress = activeWallet.changeAddress || activeWallet.receiveAddress;
          effectiveChangePath = activeWallet.addressPaths?.[effectiveChangeAddress] || "m/44'/111111'/0'/1/0";
        }
      } else if (!effectiveChangeAddress) {
        effectiveChangeAddress = activeWallet.receiveAddress;
        effectiveChangePath = activeWallet.addressPaths?.[effectiveChangeAddress] || "m/44'/111111'/0'/0/0";
      }

      // 2. Build Unsigned Intent & Execute via IsolatedSigner
      const intent = {
        network,
        toAddress,
        changeAddress: effectiveChangeAddress || activeWallet.receiveAddress,
        amountSompi: finalAmountSompi,
        feeSompi: finalFeeSompi,
        utxos: selectedUtxos,
        note,
        lockedUtxoOutpoints: activeWallet.lockedUtxoOutpoints || []
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
        const broadcastResult = await broadcastKaspaTransaction(signerResult.transaction, network);

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
          const nowSpent = Date.now();
          spentOutpoints.forEach(op => {
            spentUtxoTimestampsRef.current[op] = nowSpent;
          });
          setSpentUtxoOutpoints((prev) => [...prev, ...spentOutpoints]);

          // Compute and inject the pending change UTXO locally
          const totalInputSompi = selectedUtxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
          const changeSompi = totalInputSompi - finalAmountSompi - finalFeeSompi;

          if (changeSompi > 0n) {
            const pendingChange: UTXO & { timestamp: number } = {
              id: `utxo-pending-${broadcastResult.txId!}-change`,
              txid: broadcastResult.txId!,
              vout: 1, // Change output is at output index 1 in buildKaspaTransaction
              amountSompi: changeSompi,
              address: effectiveChangeAddress || activeWallet.receiveAddress,
              blockDaaScore: 0,
              derivationPath: effectiveChangePath || activeWallet.addressPaths?.[effectiveChangeAddress || activeWallet.receiveAddress] || "m/44'/111111'/0'/1/0",
              timestamp: nowSpent,
            };
            setLocalPendingChangeUtxos((prev) => [...prev, pendingChange]);
          }

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
          setUtxos((prev) => {
            const unspent = prev.filter((u) => !spentOutpoints.includes(`${u.txid}:${u.vout}`));
            if (changeSompi > 0n) {
              const pendingChange: UTXO = {
                id: `utxo-pending-${broadcastResult.txId!}-change`,
                txid: broadcastResult.txId!,
                vout: 1,
                amountSompi: changeSompi,
                address: effectiveChangeAddress || activeWallet.receiveAddress,
                blockDaaScore: 0,
                derivationPath: effectiveChangePath || activeWallet.addressPaths?.[effectiveChangeAddress || activeWallet.receiveAddress] || "m/44'/111111'/0'/1/0",
              };
              const updated = [...unspent, pendingChange];
              saveUtxosToDB(activeWallet.id, updated).catch(() => {});
              return updated;
            }
            saveUtxosToDB(activeWallet.id, unspent).catch(() => {});
            return unspent;
          });

          // Schedule jittered post-transaction refreshes to avoid rate-limit bursts while indexing on-chain
          scheduleJitteredPostTxRefreshes(refreshBalance);
          
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

    let activePassword = password;

    if (isBiometricsEnabled && !providedSeedPhrase) {
      const authRes = await authorizeSigningWithBiometrics();
      if (!authRes.success) {
        showToast(authRes.error || 'Biometric authentication required.', 'error');
        return { success: false };
      }
      if (authRes.decryptedPassword) {
        activePassword = authRes.decryptedPassword;
        if (!password) {
          await unlockWallet(authRes.decryptedPassword);
        }
      }
    }

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
          
          if (activeWallet.encryptedPassphrase) {
            passphraseToUse = await decryptWithPassword(
              activeWallet.encryptedPassphrase.ciphertext,
              activeWallet.encryptedPassphrase.salt,
              activeWallet.encryptedPassphrase.iv,
              activePassword,
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
      // 1. Fetch real UTXOs for all discovered addresses in batches
      const addressesToFetch = activeWallet.discoveredAddresses && activeWallet.discoveredAddresses.length > 0
        ? activeWallet.discoveredAddresses
        : [activeWallet.receiveAddress];

      const utxosResults: (KaspaUtxo[] | null)[] = [];
      const batchSize = 4;
      for (let i = 0; i < addressesToFetch.length; i += batchSize) {
        const chunk = addressesToFetch.slice(i, i + batchSize);
        const chunkResults = await Promise.all(chunk.map(addr => fetchKaspaAddressUtxos(addr)));
        utxosResults.push(...chunkResults);
        if (i + batchSize < addressesToFetch.length) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
      
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
        } else {
          // Fall back to cached UTXOs for this address if network query failed
          const cachedAddressUtxos = utxosRef.current.filter(u => u.address === address);
          cachedAddressUtxos.forEach((cu) => {
            utxosResponse.push({
              txid: cu.txid,
              vout: cu.vout,
              amount: cu.amountSompi.toString(),
              address: cu.address,
              blockDaaScore: cu.blockDaaScore,
              derivationPath: cu.derivationPath,
              outpoint: { transactionId: cu.txid, index: cu.vout },
              utxoEntry: { amount: cu.amountSompi.toString(), blockDaaScore: cu.blockDaaScore },
            });
          });
        }
      });

      // Filter out UTXOs that are in our spentUtxoOutpoints or locked/frozen
      const activeSpentSet = new Set(spentUtxoOutpoints);
      const lockedSet = new Set(activeWallet.lockedUtxoOutpoints || []);
      const filteredUtxos = utxosResponse.filter((u: any) => {
        const txid = u.outpoint?.transactionId || u.transaction_id || u.txid || '';
        const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);
        const outpoint = `${txid}:${vout}`;
        if (activeSpentSet.has(outpoint)) return false;
        if (lockedSet.has(outpoint)) return false;
        return true;
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
        lockedUtxoOutpoints: activeWallet.lockedUtxoOutpoints || []
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

        const broadcastResult = await broadcastKaspaTransaction(signerResult.transaction, network);
        
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
          const nowSpent = Date.now();
          spentOutpoints.forEach(op => {
            spentUtxoTimestampsRef.current[op] = nowSpent;
          });
          setSpentUtxoOutpoints((prev) => [...prev, ...spentOutpoints]);

          // Compute and inject the pending compounding output UTXO locally
          if (amountToSelf > 0n) {
            const pendingChange: UTXO & { timestamp: number } = {
              id: `utxo-pending-${broadcastResult.txId!}-change`,
              txid: broadcastResult.txId!,
              vout: 0, // Compound transaction destination output is index 0
              amountSompi: amountToSelf,
              address: activeWallet.receiveAddress,
              blockDaaScore: 0,
              derivationPath: activeWallet.addressPaths?.[activeWallet.receiveAddress] || "m/44'/111111'/0'/0/0",
              timestamp: nowSpent,
            };
            setLocalPendingChangeUtxos((prev) => [...prev, pendingChange]);
          }

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
          setUtxos((prev) => {
            const unspent = prev.filter((u) => !spentOutpoints.includes(`${u.txid}:${u.vout}`));
            if (amountToSelf > 0n) {
              const pendingChange: UTXO = {
                id: `utxo-pending-${broadcastResult.txId!}-change`,
                txid: broadcastResult.txId!,
                vout: 0,
                amountSompi: amountToSelf,
                address: activeWallet.receiveAddress,
                blockDaaScore: 0,
                derivationPath: activeWallet.addressPaths?.[activeWallet.receiveAddress] || "m/44'/111111'/0'/0/0",
              };
              const updated = [...unspent, pendingChange];
              saveUtxosToDB(activeWallet.id, updated).catch(() => {});
              return updated;
            }
            saveUtxosToDB(activeWallet.id, unspent).catch(() => {});
            return unspent;
          });

          // Schedule jittered post-transaction refreshes to avoid rate-limit bursts while indexing on-chain
          scheduleJitteredPostTxRefreshes(refreshBalance);
          
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

  const setPassword = async (password: string | null, customWalletsList?: Wallet[]) => {
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
        const existingWallets = wallets.length > 0 ? wallets : await getWalletsFromDB();
        let targetList = [...existingWallets];
        if (customWalletsList && customWalletsList.length > 0) {
          for (const cw of customWalletsList) {
            const idx = targetList.findIndex(w => w.id === cw.id);
            if (idx >= 0) {
              targetList[idx] = cw;
            } else {
              targetList.push(cw);
            }
          }
        }
        if (targetList.length === 0 && customWalletsList) {
          targetList = customWalletsList;
        }

        const updatedWallets = await Promise.all(targetList.map(async (w) => {
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
          
          const updatedW = {
            ...w,
            mnemonic: undefined,
            passphrase: undefined,
            encryptedMnemonic,
            encryptedPassphrase
          };

          try {
            await saveWalletToDB(updatedW);
          } catch (e) {
            console.error('Failed to persist encrypted wallet to DB:', e);
          }

          return updatedW;
        }));
        setWallets(updatedWallets);
        showToast('Password security enabled & wallets encrypted', 'success');
      } catch (err) {
        showToast('Password enabled, but error encrypting existing keys', 'error');
      }
        } else {
      const activePassword = password;
      setIsPasswordEnabled(false);
      setIsBiometricsEnabled(false);
      setPasswordState(null);
      await saveSetting('wallet_password_enabled', false);
      await removeSetting('wallet_password_canary');
      await removeSetting('wallet_biometric_credential');
      await saveSetting('wallet_biometrics_enabled', false);
      await deleteNativeKeystoreAlias();
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
          
          const updatedW = {
            ...w,
            mnemonic: decryptedMnemonic,
            passphrase: decryptedPassphrase,
            encryptedMnemonic: undefined,
            encryptedPassphrase: undefined
          };

          try {
            await saveWalletToDB(updatedW);
          } catch (e) {
            console.error('Failed to persist decrypted wallet to DB:', e);
          }

          return updatedW;
        }));
        setWallets(updatedWallets);
      } else {
        const updatedWallets = wallets.map(w => {
          const updatedW = {
            ...w,
            encryptedPassphrase: undefined,
            encryptedMnemonic: undefined
          };
          try {
            saveWalletToDB(updatedW);
          } catch (e) {}
          return updatedW;
        });
        setWallets(updatedWallets);
      }
      showToast('Password security disabled', 'info');
    }
  };

  const setDuressPassword = async (duressPassword: string | null) => {
    if (duressPassword && duressPassword.trim().length >= 8) {
      const cleanDuress = duressPassword.trim();
      
      // Enforce: Duress password must NOT be identical to main wallet password
      if (password && cleanDuress === password.trim()) {
        showToast('Emergency Duress Password cannot be identical to main password', 'error');
        return;
      }
      
      const mainCanary = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_password_canary') || await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_pin_canary');
      if (mainCanary) {
        try {
          const dec = await decryptWithPassword(mainCanary.ciphertext, mainCanary.salt, mainCanary.iv, cleanDuress, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");
          if (dec === "kaspriv-canary") {
            showToast('Emergency Duress Password cannot be identical to main password', 'error');
            return;
          }
        } catch {
          // Pass: duress password is unique
        }
      }

      try {
        const canaryObj = await encryptWithPassword(
          "kaspriv-duress-canary",
          cleanDuress,
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
    // 1. Instantly trip the global abort gate for all storage read/write operations
    setPanicWipeTriggered(true);

    setIsSendOpen(false);
    setIsScanOpen(false);
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
    setIsBiometricsEnabled(false);

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
        const isDuress = await unifiedAuthService.verifyDuressCanaryChaCha20(
          duressCanary.ciphertext,
          duressCanary.salt,
          duressCanary.iv,
          cleanInput
        );
        if (isDuress) {
          // DURESS PASSWORD DETECTED -> INSTANT SECURE PURGE & LOGOUT
          await executePanicWipe();
          return false;
        }
      }
    } catch (err) {
      console.error('Error during duress check:', err);
    }

    // 2. Normal Password Verification via ChaCha20-Poly1305 bridge
    let passwordValid = false;
    const canaryObj = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_password_canary') || await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_pin_canary');
    
    if (canaryObj) {
      passwordValid = await unifiedAuthService.verifyCanaryChaCha20(
        canaryObj.ciphertext,
        canaryObj.salt,
        canaryObj.iv,
        cleanInput,
        "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY"
      );
      if (!passwordValid) {
        return false;
      }
    } else {
      // Fallback for wallets without canary (legacy)
      const firstW = wallets.find(w => w.encryptedMnemonic);
      if (firstW) {
        try {
          if (firstW.encryptedMnemonic) {
            await unifiedAuthService.decryptChaCha20(
              firstW.encryptedMnemonic.ciphertext, 
              firstW.encryptedMnemonic.salt, 
              firstW.encryptedMnemonic.iv, 
              cleanInput, 
              buildAadContext('MNEMONIC', firstW.id)
            );
          }
          passwordValid = true;
        } catch (err) {
          return false;
        }
      } else {
        // If no wallets and no canary, we consider it "unlocked" for now
        passwordValid = true;
      }
    }

    if (passwordValid) {
      unifiedAuthService.completeUnlock('password');
      setPasswordState(cleanInput);
      setIsLocked(false);
      setIsLoggedOut(false);
      setIsWalletSetupOpen(false);
      try {
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}

      // Atomic Bridge: Ensure we have loaded wallets from DB into memory
      let currentWallets = wallets;
      if (!currentWallets || currentWallets.length === 0) {
        try {
          const savedWallets = await getWalletsFromDB();
          if (savedWallets && savedWallets.length > 0) {
            setWallets(savedWallets);
            currentWallets = savedWallets;
          }
        } catch (e) {}
      }

      // Ensure active wallet ID is set
      const currentActiveId = activeWalletId || (currentWallets && currentWallets.length > 0 ? currentWallets[0].id : '');
      if (currentActiveId) {
        setActiveWalletIdState(currentActiveId);
        try {
          await saveSetting('kaspa_active_wallet_id', currentActiveId);
        } catch (e) {}
      }
      
      // Ensure the navigation stack points to the main wallet viewport
      setActiveBottomTab('home');

      // Atomic Bridge: Ensure we refresh the wallet data immediately after unlocking
      setTimeout(() => {
        refreshBalance({ force: true });
      }, 0);

      showToast('Wallet unlocked', 'success');
      return true;
    }
    unifiedAuthService.failAuthentication('Incorrect password');
    return false;
  };

  const enableBiometrics = async (enteredPassword: string): Promise<boolean> => {
    const cleanPass = enteredPassword.trim();
    if (!cleanPass) {
      showToast('Password is required to enable biometrics', 'error');
      return false;
    }

    try {
      const canaryObj = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_password_canary') || await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_pin_canary');
      if (canaryObj) {
        const decryptedCanary = await decryptWithPassword(
          canaryObj.ciphertext,
          canaryObj.salt,
          canaryObj.iv,
          cleanPass,
          "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY"
        );
        if (decryptedCanary !== "kaspriv-canary") {
          showToast('Incorrect password', 'error');
          return false;
        }
      }

      const bioRecord = await registerBiometricUnlock(cleanPass);
      await saveSetting('wallet_biometric_credential', bioRecord);
      await saveSetting('wallet_biometrics_enabled', true);
      setIsBiometricsEnabled(true);
      if (bioRecord.mode === 'keystore' || bioRecord.credentialId?.startsWith('keystore:')) {
        showToast('Native Biometric Hardware Authentication enabled!', 'success');
      } else if (bioRecord.mode === 'prf') {
        showToast('Native Biometric Authentication enabled (Hardware PRF Mode)!', 'success');
      } else {
        showToast('Native Biometric Authentication enabled!', 'success');
      }
      return true;
    } catch (err: any) {
      console.error('Biometric registration error:', err);
      const msg = err.message || 'Failed to register biometrics';
      showToast(msg, 'error');
      return false;
    }
  };

  const disableBiometrics = async () => {
    try {
      await removeSetting('wallet_biometric_credential');
      await saveSetting('wallet_biometrics_enabled', false);
      await deleteNativeKeystoreAlias();
      setIsBiometricsEnabled(false);
      showToast('Biometric authentication disabled', 'info');
    } catch (err) {
      console.error('Failed to disable biometrics:', err);
    }
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    try {
      unifiedAuthService.beginAuthentication('biometrics');
      const bioRecord = await getSetting<BiometricCredentialRecord>('wallet_biometric_credential');
      if (!bioRecord) {
        unifiedAuthService.failAuthentication('Biometric credentials not found');
        showToast('Biometric credentials not found', 'error');
        return false;
      }

      const authRes = await authenticateWithBiometrics(bioRecord);
      if (!authRes.success) {
        unifiedAuthService.failAuthentication(authRes.error || 'Biometric authentication failed');
        return false;
      }

      if (authRes.decryptedPassword) {
        const ok = await unlockWallet(authRes.decryptedPassword);
        if (ok) {
          unifiedAuthService.completeUnlock('biometrics');
        }
        return ok;
      }
      unifiedAuthService.failAuthentication('Biometric authentication failed');
      return false;
    } catch (err: any) {
      const isExpectedCancellation =
        err?.name === 'NotAllowedError' ||
        err?.name === 'AbortError' ||
        err?.name === 'InvalidStateError' ||
        err?.message?.toLowerCase().includes('cancelled') ||
        err?.message?.toLowerCase().includes('canceled') ||
        err?.message?.toLowerCase().includes('timed out') ||
        err?.message?.toLowerCase().includes('not allowed');

      unifiedAuthService.failAuthentication(err?.message || 'Biometric verification failed');

      if (!isExpectedCancellation) {
        console.warn('Biometric unlock notice:', err?.message || err);
        showToast(err.message || 'Biometric verification failed', 'error');
      }
      return false;
    }
  };

  const authorizeSigningWithBiometrics = async (): Promise<{ success: boolean; decryptedPassword?: string; error?: string }> => {
    if (!isBiometricsEnabled) {
      return { success: true };
    }
    try {
      const bioRecord = await getSetting<BiometricCredentialRecord>('wallet_biometric_credential');
      if (!bioRecord) {
        return { success: false, error: 'Biometric credentials not configured on this device.' };
      }
      const authRes = await authenticateWithBiometrics(bioRecord);
      if (!authRes.success) {
        return { success: false, error: authRes.error || 'Biometric authentication failed or was cancelled.' };
      }

      if (authRes.decryptedPassword) {
        return { success: true, decryptedPassword: authRes.decryptedPassword };
      }

      return { success: false, error: 'Hardware biometric vault failed to release decryption key.' };
    } catch (err: any) {
      const isExpectedCancellation =
        err?.name === 'NotAllowedError' ||
        err?.name === 'AbortError' ||
        err?.name === 'InvalidStateError' ||
        err?.message?.toLowerCase().includes('cancelled') ||
        err?.message?.toLowerCase().includes('canceled') ||
        err?.message?.toLowerCase().includes('timed out') ||
        err?.message?.toLowerCase().includes('not allowed');

      if (!isExpectedCancellation) {
        console.warn('Biometric signing authorization failed:', err);
      }
      return { success: false, error: err?.message || 'Biometric authentication failed or was cancelled.' };
    }
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
        currency,
        setCurrency,
        marketData,
        fiatRate,
        isInitializing,
        isPasswordEnabled,
        password,
        isLocked,
        setIsLocked,
        authState,
        clearPendingLockFlags,
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
        isBiometricsSupported,
        isBiometricsEnabled,
        enableBiometrics,
        disableBiometrics,
        unlockWithBiometrics,
        authorizeSigningWithBiometrics,
        isHapticsSupported,
        isHapticsEnabled: isHapticsEnabledState,
        setIsHapticsEnabled,
        triggerHaptic,
        isNotificationsEnabled: isNotificationsEnabledState,
        setIsNotificationsEnabled,
        isSendOpen,
        setIsSendOpen,
        isScanOpen,
        setIsScanOpen,
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
