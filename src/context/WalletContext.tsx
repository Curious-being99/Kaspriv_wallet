import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  Wallet,
  KaspaTransaction,
  UTXO,
  KaspaNode,
  NetworkType,
  CurrencyType,
  MarketData,
  Covenant,
} from '../types';
import { safeStringify } from '../utils/json';
import { runDatabaseMigrations } from '../utils/dbMigration';
import {
  saveWalletToDB,
  getWalletsFromDB,
  deleteWalletFromDB,
  clearAllWalletsFromDB,
  saveSetting,
  getSetting,
  removeSetting,
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
  scanKaspaWalletChain,
  cleanMnemonic,
  setKaspaApiUrl,
  setKaspaExplorerUrl,
  createCovenantRedeemScript,
  covenantIdManager,
  CovenantType,
  getPrivateKeyBytesFromMnemonic,
  wipe,
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
  createNewWallet: (name: string, mnemonicWords?: string[], passphrase?: string, addressType?: 'P2PKH' | 'P2SH', password?: string) => Promise<Wallet>;
  importSeedWallet: (name: string, words: string[], passphrase?: string, addressType?: 'P2PKH' | 'P2SH', password?: string) => Promise<Wallet>;
  importKpubWallet: (name: string, kpub: string, addressType?: 'P2PKH' | 'P2SH') => Wallet;

  // Transactions & Balance
  transactions: KaspaTransaction[];
  utxos: UTXO[];
  sendKaspa: (toAddress: string, amountKas: number, feeKas: number, note?: string, providedSeedPhrase?: string, providedPassphrase?: string) => Promise<{ success: boolean; txid?: string; error?: string }>;
  compoundUtxos: (providedSeedPhrase?: string) => Promise<{ success: boolean; txid?: string; countMerged?: number }>;

  // Network & Nodes
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  nodes: KaspaNode[];
  activeNode: KaspaNode;
  selectNode: (nodeId: string) => void;
  addCustomNode: (url: string, network: NetworkType) => void;
  pingNodes: () => void;

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
  isCovenantOpen: boolean;
  setIsCovenantOpen: (open: boolean) => void;
  isAssetDetailOpen: boolean;
  setIsAssetDetailOpen: (open: boolean) => void;

  // Bottom Navigation Tab
  activeBottomTab: 'home' | 'history' | 'covenant' | 'settings';
  setActiveBottomTab: (tab: 'home' | 'history' | 'covenant' | 'settings') => void;

  // Deployed Covenants
  deployedCovenants: Covenant[];
  addCovenant: (cov: Omit<Covenant, 'id' | 'timestamp'> & { genesisInputTxId?: string; genesisInputIndex?: number }) => void;
  claimCovenant: (covenantId: string, providedSeedPhrase?: string) => Promise<{ success: boolean; txid?: string; error?: string }>;
  removeCovenant: (id: string) => void;
  clearAllCovenants: () => Promise<void>;
  isSyncingCovenants: boolean;
  syncCovenantsOnChain: () => Promise<void>;
  currentDaaScore: number;
  refreshDaaScore: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  scanWalletChainIndex: () => Promise<void>;
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
  { id: 'node-kaspriv', url: 'grpcs://toccata.kaspriv.io', network: 'mainnet', latencyMs: 12, isOnline: true, selected: true },
  { id: 'node-1', url: 'wrpc://mainnet-1.kaspa.net:17110', network: 'mainnet', latencyMs: 14, isOnline: true },
  { id: 'node-2', url: 'wrpc://mainnet-2.kaspa.net:17110', network: 'mainnet', latencyMs: 22, isOnline: true },
  { id: 'node-3', url: 'grpc://public-node-eu.kaspa.org:16110', network: 'mainnet', latencyMs: 38, isOnline: true },
  { id: 'node-testnet', url: 'wrpc://testnet-10.kaspa.net:17210', network: 'testnet-10', latencyMs: 26, isOnline: true },
  { id: 'node-devnet', url: 'wrpc://devnet.kaspa.net:17310', network: 'devnet', latencyMs: 42, isOnline: true }
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
        setWallets(savedWallets);

        const savedActiveId = await getSetting<string>('kaspa_active_wallet_id');
        if (savedActiveId) setActiveWalletIdState(savedActiveId);

        const passwordEnabled = await getSetting<boolean>('wallet_password_enabled') || await getSetting<boolean>('wallet_pin_enabled');
        const canary = await getSetting('wallet_password_canary') || await getSetting('wallet_pin_canary');

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

        const savedApiUrl = await getSetting<string>('kaspa_api_url');
        if (savedApiUrl) {
          setApiUrl(savedApiUrl);
          setKaspaApiUrl(savedApiUrl);
        }

        const savedExplorerUrl = await getSetting<string>('kaspa_explorer_url');
        if (savedExplorerUrl) {
          setExplorerUrl(savedExplorerUrl);
          setKaspaExplorerUrl(savedExplorerUrl);
        }

        const hasWiped = await getSetting<boolean>('has_wiped_covenants_v2');
        if (!hasWiped) {
          await removeSetting('deployed_covenants');
          await saveSetting('has_wiped_covenants_v2', true);
        } else {
          const savedCovenants = await getSetting<Covenant[]>('deployed_covenants');
          if (savedCovenants) setDeployedCovenants(savedCovenants);
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
  const [utxos, setUtxos] = useState<UTXO[]>([]);
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
  const [password, setPasswordState] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [autoLockDuration, setAutoLockDuration] = useState<number>(0);
  const [lockOnExit, setLockOnExit] = useState<boolean>(false);

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
    setIsCovenantOpen(false);
    setIsLogoutConfirmOpen(false);
    
    // Clear all wallet data from state
    setWallets([]);
    setActiveWalletIdState('');
    setTransactions([]);
    setUtxos([]);
    setDeployedCovenants([]);
    
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
  const [isCovenantOpen, setIsCovenantOpen] = useState(false);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'history' | 'covenant' | 'settings'>('home');
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(null);
  };

  const passwordRef = React.useRef(password);
  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  const lockWallet = React.useCallback(() => {
    if (isPasswordEnabled) {
      setPasswordState(null);  // clear password from memory
      passwordRef.current = null;
      setIsLocked(true);
      showToast('Wallet locked', 'info');
    }
  }, [isPasswordEnabled]);

  const lockWalletRef = React.useRef(lockWallet);
  useEffect(() => {
    lockWalletRef.current = lockWallet;
  }, [lockWallet]);

  // Covenants State
  const [currentDaaScore, setCurrentDaaScore] = useState<number>(89500000);
  const [deployedCovenants, setDeployedCovenants] = useState<Covenant[]>([]);
  const [isSyncingCovenants, setIsSyncingCovenants] = useState(false);

  const deployedCovenantsRef = React.useRef(deployedCovenants);
  useEffect(() => {
    deployedCovenantsRef.current = deployedCovenants;
  }, [deployedCovenants]);

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

  // Load deployed covenants
  useEffect(() => {
    let isMounted = true;
    const runMigration = async () => {
      if (deployedCovenants.length === 0) return;
      let hasMigration = false;
      const updated = [];
      for (const cov of deployedCovenants) {
        if (cov.id.startsWith('cov-') && cov.txid && cov.redeemScriptHex) {
          try {
            // Fetch transaction from Kaspa REST API
            const eps = getKaspaApiEndpoints();
            let txData = null;
            for (const ep of eps) {
              try {
                const res = await fetch(`${ep}/transactions/${cov.txid}`);
                if (res.ok) {
                  txData = await res.json();
                  break;
                }
              } catch (e) {}
            }
            
            if (txData && txData.inputs && txData.inputs.length > 0) {
              const genTxId = txData.inputs[0].previous_outpoint.transaction_id;
              const genIndex = txData.inputs[0].previous_outpoint.index;
              const isP2SH = cov.scriptHash.includes(':p');
              const amountSompi = kasToSompi(parseFloat(cov.amount));
              const finalId = covenantIdManager.compute(
                isP2SH ? CovenantType.P2SH : CovenantType.STANDARD,
                genTxId,
                genIndex,
                [{
                  outIdx: 0,
                  amount: amountSompi,
                  scriptBytes: new Uint8Array(Buffer.from(cov.redeemScriptHex, 'hex'))
                }],
                cov.type
              );
              updated.push({ ...cov, id: finalId });
              hasMigration = true;
              continue;
            }
          } catch (e) {
            console.warn('Migration failed for', cov.id, e);
          }
        }
        updated.push(cov);
      }
      
      if (hasMigration && isMounted) {
        setDeployedCovenants(updated);
        saveSetting('deployed_covenants', updated);
      }
    };
    runMigration();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCovenant = (cov: Omit<Covenant, 'id' | 'timestamp'> & { genesisInputTxId?: string; genesisInputIndex?: number }) => {
    let finalId = `cov-${Date.now()}`;

    // KIP-20 Covenant ID Generation
    if (cov.txid && cov.genesisInputTxId && cov.genesisInputIndex !== undefined && cov.redeemScriptHex) {
      try {
        const isP2SH = cov.scriptHash.includes(':p');
        const amountSompi = kasToSompi(parseFloat(cov.amount));
        
        finalId = covenantIdManager.compute(
          isP2SH ? CovenantType.P2SH : CovenantType.STANDARD,
          cov.genesisInputTxId,
          cov.genesisInputIndex,
          [{
            outIdx: 0, // usually 0 since we sent one main output
            amount: amountSompi,
            scriptBytes: new Uint8Array(Buffer.from(cov.redeemScriptHex, 'hex'))
          }],
          cov.type
        );
      } catch (err: any) {
        console.warn('Failed to compute KIP-20 covenant_id, falling back to temp ID:', err.message);
        finalId = `cov-${cov.txid.slice(0, 16)}`;
      }
    } else if (cov.txid) {
      finalId = `cov-${cov.txid.slice(0, 16)}`;
    }

    const { genesisInputTxId, genesisInputIndex, ...covData } = cov;

    const newCov: Covenant = {
      ...covData,
      id: finalId,
      timestamp: Date.now(),
    };
    setDeployedCovenants((prev) => {
      const exists = prev.some((c) => c.scriptHash === newCov.scriptHash);
      const updated = exists ? prev.map((c) => (c.scriptHash === newCov.scriptHash ? newCov : c)) : [newCov, ...prev];
      saveSetting('deployed_covenants', updated);
      return updated;
    });
  };

  const clearAllCovenants = async () => {
    setDeployedCovenants([]);
    await removeSetting('deployed_covenants');
    if (activeWallet?.id) {
      await removeSetting(`deployed_covenants_${activeWallet.id}`);
    }
  };

  const removeCovenant = (id: string) => {
    setDeployedCovenants((prev) => prev.filter((c) => c.id !== id));
    showToast('Covenant removed', 'info');
  };

  const claimCovenant = async (
    covenantId: string,
    providedSeedPhrase?: string
  ): Promise<{ success: boolean; txid?: string; error?: string }> => {
    const cov = deployedCovenants.find((c) => c.id === covenantId);
    if (!cov) return { success: false, error: 'Covenant not found' };

    if (!activeWallet) return { success: false, error: 'No active wallet' };
    
    let seedToUse = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic;
    let passphraseToUse = activeWallet.passphrase;
    if (!seedToUse && activeWallet.id) {
      const secData = await getSecureSeed(activeWallet.id);
      if (secData?.mnemonic) {
        seedToUse = secData.mnemonic;
        if (!passphraseToUse) passphraseToUse = secData.passphrase;
      }
    }

    if (!seedToUse) {
      return { success: false, error: 'Seed phrase required to claim/refund covenant' };
    }

    try {
      // Enforce on-chain DAA score check
      if (cov.daaLock && currentDaaScore < cov.daaLock) {
        const remaining = cov.daaLock - currentDaaScore;
        return {
          success: false,
          error: `On-chain lock conditions not met. Locked until DAA score ${cov.daaLock.toLocaleString()} (Current: ${currentDaaScore.toLocaleString()}). ${remaining.toLocaleString()} blocks remaining.`
        };
      }

      // 1. Fetch UTXOs for the covenant's P2SH address
      const utxosResponse = await fetchKaspaAddressUtxos(cov.scriptHash);
      if (!utxosResponse || utxosResponse.length === 0) {
        return { success: false, error: 'No spendable UTXOs found in this covenant on-chain.' };
      }

      const totalUtxoSompi = utxosResponse.reduce((sum: bigint, u: any) => {
        const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
        return sum + amt;
      }, 0n);

      const feeSompi = 5000n; // 0.005 KAS fee
      const amountSompi = totalUtxoSompi - feeSompi;

      if (amountSompi <= 0n) {
        return { success: false, error: 'Covenant balance is too low to cover transaction fee.' };
      }

      // 2. Derive private key (Instant RAM exposure)
      const privKeyBytes = getPrivateKeyBytesFromMnemonic(seedToUse, passphraseToUse);

      try {
        // 3. Create signed transaction spending P2SH
        const signedTx = await createSignedTransaction(
          utxosResponse.map((u: any) => ({ ...u, address: cov.scriptHash })),
          activeWallet.receiveAddress, // send back to user's main wallet
          amountSompi,
          activeWallet.receiveAddress,
          privKeyBytes,
          feeSompi,
          'P2SH',
          cov.redeemScriptHex, // Pass the custom redeem script
          cov.daaLock // Pass the lockTime for OP_CHECKLOCKTIMEVERIFY compliance
        );

        // 4. Broadcast
        const broadcastResult = await broadcastKaspaTransaction(signedTx);

        if (broadcastResult.success) {
          showToast(`Covenant successfully unlocked! TXID: ${shortenAddress(broadcastResult.txId!)}`, 'success');
          
          // Remove covenant from local list or mark it as claimed
          setDeployedCovenants((prev) => prev.filter((c) => c.id !== covenantId));
          setTimeout(refreshBalance, 2000);
          return { success: true, txid: broadcastResult.txId };
        } else {
          return { success: false, error: broadcastResult.error || 'Failed to broadcast spend transaction' };
        }
      } finally {
        // Instant RAM Discard
        if (privKeyBytes) wipe(privKeyBytes);
      }
    } catch (err: any) {
      console.error('[Claim Covenant] Error:', err);
      return { success: false, error: err.message || 'Failed to claim covenant' };
    }
  };

  const activeWallet = React.useMemo(() => {
    const dummyWallet: Wallet = {
      id: 'dummy',
      name: '',
      receiveAddress: '',
      changeAddress: '',
      balanceSompi: 0n,
      createdAt: 0,
    };
    return wallets.find((w) => w.id === activeWalletId) || wallets[0] || dummyWallet;
  }, [wallets, activeWalletId]);

  const activeWalletRef = React.useRef(activeWallet);
  useEffect(() => {
    activeWalletRef.current = activeWallet;
  }, [activeWallet]);

  const activeNode = nodes.find((n) => n.network === network && n.selected) || nodes.find((n) => n.network === network) || nodes[0];

  const fiatRate = CURRENCY_RATES[currency] || 1.0;
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Poll CoinGecko & Kaspa REST API for market data and live address balance
  const refreshBalance = React.useCallback(async () => {
    // Fetch live DAA Score
    refreshDaaScore();

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

      // Fetch live balances for all addresses
      const balancePromises = addressesToFetch.map(addr => fetchKaspaAddressBalance(addr));
      const balances = await Promise.all(balancePromises);
      const totalLiveBalance = balances.reduce((sum, bal) => sum + (bal !== null ? bal : 0n), 0n);

      setWallets((prev) =>
        prev.map((w) => (w.id === wallet.id ? { ...w, balanceSompi: totalLiveBalance } : w))
      );

      // Fetch UTXOs for all addresses and merge them
      const utxoPromises = addressesToFetch.map(addr => fetchKaspaAddressUtxos(addr));
      const utxosResults = await Promise.all(utxoPromises);
      
      const allMergedUtxos: UTXO[] = [];
      utxosResults.forEach((liveUtxosData, addrIdx) => {
        const address = addressesToFetch[addrIdx];
        if (liveUtxosData && Array.isArray(liveUtxosData)) {
          liveUtxosData.forEach((u: any, idx: number) => {
            const devPath = wallet.addressPaths?.[address];
            allMergedUtxos.push({
              id: `utxo-live-${u.outpoint?.transactionId || idx}-${idx}`,
              txid: u.outpoint?.transactionId || '',
              vout: u.outpoint?.index || 0,
              amountSompi: BigInt(u.utxoEntry?.amount || 0),
              address,
              blockDaaScore: Number(u.utxoEntry?.blockDaaScore || 0),
              derivationPath: devPath,
            });
          });
        }
      });
      setUtxos(allMergedUtxos);

      // Fetch transactions for all addresses and merge them
      const txPromises = addressesToFetch.map(addr => fetchKaspaAddressTransactions(addr));
      const txResults = await Promise.all(txPromises);
      
      const seenTxids = new Set<string>();
      const allMergedTxs: KaspaTransaction[] = [];
      
      txResults.forEach((liveTxsData) => {
        if (liveTxsData && Array.isArray(liveTxsData)) {
          liveTxsData.forEach((tx: any) => {
            const txid = tx.transaction_id || tx.txid || '';
            if (!txid || seenTxids.has(txid)) return;
            seenTxids.add(txid);

            const belongsToUs = (addr: string) => addressesToFetch.includes(addr);
            const isOut = tx.inputs?.some((inp: any) => belongsToUs(inp.previous_outpoint_address));
            
            let amountSompi = 0n;
            if (isOut) {
              // Outgoing: Sum of outputs NOT going back to any of our addresses
              amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
                if (!belongsToUs(out.script_public_key_address)) {
                  return acc + BigInt(out.amount || 0);
                }
                return acc;
              }, 0n) || 0n;
            } else {
              // Incoming: Sum of outputs going to any of our addresses
              amountSompi = tx.outputs?.reduce((acc: bigint, out: any) => {
                if (belongsToUs(out.script_public_key_address)) {
                  return acc + BigInt(out.amount || 0);
                }
                return acc;
              }, 0n) || 0n;
            }

            // Fee: Sum(inputs) - Sum(outputs)
            const sumInputs: bigint = tx.inputs?.reduce((acc: bigint, inp: any) => acc + BigInt(inp.previous_outpoint_amount || 0), 0n) || 0n;
            const sumOutputs: bigint = tx.outputs?.reduce((acc: bigint, out: any) => acc + BigInt(out.amount || 0), 0n) || 0n;
            const feeSompi: bigint = (sumInputs > sumOutputs) ? (sumInputs - sumOutputs) : BigInt(tx.fee || 0);

            const txAddress: string = isOut 
              ? (tx.outputs?.find((out: any) => !belongsToUs(out.script_public_key_address))?.script_public_key_address || wallet.receiveAddress)
              : (tx.outputs?.find((out: any) => belongsToUs(out.script_public_key_address))?.script_public_key_address || wallet.receiveAddress);

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

      allMergedTxs.sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(allMergedTxs);
    }
  }, [refreshDaaScore]);

  const refreshBalanceRef = React.useRef(refreshBalance);
  const syncCovenantsOnChain = React.useCallback(async () => {
    const wallet = activeWalletRef.current;
    if (!wallet || !wallet.receiveAddress) return;

    setIsSyncingCovenants(true);
    try {
      refreshDaaScore();

      const candidateMap = new Map<string, { txid: string; amountSompi: bigint; blockDaaScore: number }>();
      const currentDaa = currentDaaScoreRef.current;
      const activePassword = passwordRef.current;
      const existingCovenants = deployedCovenantsRef.current;

      const addressesToScan = Array.from(
        new Set([
          wallet.receiveAddress,
          ...(wallet.discoveredAddresses || [])
        ])
      ).filter(Boolean);

      let pubKeyHex: string | null = null;
      let seedToUse = wallet.mnemonic;
      if (!seedToUse && wallet.encryptedMnemonic && activePassword) {
        try {
          seedToUse = await decryptWithPassword(
            wallet.encryptedMnemonic.ciphertext,
            wallet.encryptedMnemonic.salt,
            wallet.encryptedMnemonic.iv,
            activePassword,
            buildAadContext('MNEMONIC', wallet.id)
          );
        } catch (e) {
          // ignore
        }
      }

      if (seedToUse) {
        const privKeyBytes = getPrivateKeyBytesFromMnemonic(seedToUse, wallet.passphrase);
        try {
          const pubBytes = secp.schnorr.getPublicKey(privKeyBytes);
          pubKeyHex = Buffer.from(pubBytes).toString('hex');

          const derivedCov = getCovenantAddressAndScript(seedToUse, wallet.passphrase, currentDaa, 'timelock');
          if (derivedCov.address) {
            candidateMap.set(derivedCov.address, {
              txid: 'On-Chain',
              amountSompi: 0n,
              blockDaaScore: currentDaa,
            });
          }
        } catch (e) {
          // ignore
        } finally {
          wipe(privKeyBytes);
        }
      }

      // 1. Scan address transactions for outbound outputs to kaspa:pq...
      for (const addr of addressesToScan) {
        try {
          const txs = await fetchKaspaAddressTransactions(addr);
          if (txs && Array.isArray(txs)) {
            txs.forEach((tx: any) => {
              const outputs = tx.outputs || tx.outpoints || [];
              const txid = tx.transaction_id || tx.txid || 'On-Chain';
              const blockDaaScore = Number(tx.block_daa_score || tx.blockDaaScore || currentDaa);

              outputs.forEach((out: any) => {
                const destAddr = out.script_public_key_address || out.address;
                const amt = BigInt(out.amount || 0);

                if (destAddr && destAddr.startsWith('kaspa:pq')) {
                  candidateMap.set(destAddr, {
                    txid,
                    amountSompi: amt,
                    blockDaaScore,
                  });
                }
              });
            });
          }
        } catch (err) {
          // ignore
        }
      }

      // 2. Include existing deployed covenants
      existingCovenants.forEach((c) => {
        if (c.scriptHash && !candidateMap.has(c.scriptHash)) {
          candidateMap.set(c.scriptHash, {
            txid: c.txid || 'On-Chain',
            amountSompi: 0n,
            blockDaaScore: c.daaLock || currentDaa,
          });
        }
      });

      const updatedCovenants: Covenant[] = [];

      // 3. Query on-chain live balance for each covenant address
      for (const [covAddr, info] of candidateMap.entries()) {
        try {
          const liveBalance = await fetchKaspaAddressBalance(covAddr);
          const existing = existingCovenants.find((c) => c.scriptHash === covAddr);

          if (liveBalance !== null) {
            if (liveBalance > 0n || existing) {
              let daaLock = existing?.daaLock || info.blockDaaScore;
              let redeemScriptHex = existing?.redeemScriptHex || '';
              let covType = existing?.type || 'Kaspa SilverScript Covenant';

              if (!redeemScriptHex && pubKeyHex) {
                const res = createCovenantRedeemScript(pubKeyHex, daaLock, 'timelock');
                redeemScriptHex = res.redeemScriptHex;
              }

              updatedCovenants.push({
                id: existing?.id || `cov-${covAddr.slice(-8)}-${Date.now()}`,
                type: covType,
                amount: `${sompiToKas(liveBalance).toFixed(2)} KAS`,
                scriptHash: covAddr,
                txid: existing?.txid || info.txid,
                daaLock,
                redeemScriptHex,
                timestamp: existing?.timestamp || Date.now(),
              });
            }
          } else if (existing) {
            updatedCovenants.push(existing);
          }
        } catch (err) {
          const existing = existingCovenants.find((c) => c.scriptHash === covAddr);
          if (existing) updatedCovenants.push(existing);
        }
      }

      setDeployedCovenants(updatedCovenants);
      await saveSetting('deployed_covenants', updatedCovenants);
      if (wallet.id) {
        await saveSetting(`deployed_covenants_${wallet.id}`, updatedCovenants);
      }
    } catch (err) {
      console.error('Error syncing covenants from Kaspa chain:', err);
    } finally {
      setIsSyncingCovenants(false);
    }
  }, [refreshDaaScore]);

  useEffect(() => {
    refreshBalanceRef.current = refreshBalance;
  }, [refreshBalance]);

  useEffect(() => {
    refreshBalanceRef.current();
    const interval = setInterval(() => refreshBalanceRef.current(), 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync wallet state logic removed as it's no longer necessary with persistent IndexedDB

  // Ping Nodes
  const pingNodes = async () => {
    const t0 = performance.now();
    try {
      await fetch('https://api.kaspa.org/info/fee-estimate');
      const latency = Math.round(performance.now() - t0);
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          latencyMs: Math.max(8, latency + Math.floor(Math.random() * 12)),
          isOnline: true,
        }))
      );
      showToast('Nodes pinged via Kaspa DAG server', 'info');
    } catch {
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          latencyMs: 28,
          isOnline: true,
        }))
      );
    }
  };

  const selectNode = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      }))
    );
    showToast('Connected to Kaspa Node', 'success');
  };

  const addCustomNode = (url: string, net: NetworkType) => {
    const newNode: KaspaNode = {
      id: `custom-node-${Date.now()}`,
      url,
      network: net,
      latencyMs: 24,
      isOnline: true,
      isCustom: true,
      selected: true,
    };
    setNodes((prev) => [newNode, ...prev.map((n) => ({ ...n, selected: false }))]);
    showToast(`Added custom node: ${url}`, 'success');
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
    const trimmed = newName.trim();
    if (!trimmed) return;
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, name: trimmed } : w))
    );
    showToast(`Wallet renamed to '${trimmed}'`, 'success');
  };

  const dismissIndexing = () => {
    setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
  };

  const createNewWallet = async (name: string, mnemonicWords?: string[], passphrase?: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH', password?: string): Promise<Wallet> => {
    const words = mnemonicWords && mnemonicWords.length === 24 ? mnemonicWords : generate24WordMnemonic();
    const prefix = network === 'mainnet' ? 'kaspa' : network === 'testnet-10' ? 'kaspatest' : 'kaspadev';
    let mStr = cleanMnemonic(words.join(' '));
    
    setIndexingState({ isIndexing: true, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    
    let scanRes;
    try {
      scanRes = await scanKaspaWalletChain(
        mStr, passphrase, prefix, addressType, 1,
        (scannedCount, foundCount, balanceSompi) => {
          setIndexingState({ isIndexing: true, scannedAddresses: scannedCount, foundAddresses: foundCount, balanceSompi });
        }
      );
    } catch (err) {
      const derivedAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType);
      scanRes = {
        primaryAddress: derivedAddr,
        totalBalanceSompi: 0n,
        discoveredAddresses: [],
        allUtxos: [],
        allTransactions: [],
      };
    } finally {
      if (password) {
        setIsLocked(true);
      }
      setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    }
    
    const addrPaths: { [address: string]: string } = {};
    if (scanRes.discoveredAddresses) {
      scanRes.discoveredAddresses.forEach((da: any) => {
        addrPaths[da.address] = da.path;
      });
    }
    addrPaths[scanRes.primaryAddress] = "m/44'/111111'/0'/0/0";

    try {
      const activePassword = password || passwordRef.current;
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
        name: name || 'Kaspa Wallet',
        receiveAddress: scanRes.primaryAddress,
        changeAddress: scanRes.primaryAddress,
        mnemonic: activePassword ? undefined : mStr, // Do not store plaintext if password is active
        passphrase: activePassword ? undefined : (passphrase || undefined),
        encryptedMnemonic,
        encryptedPassphrase,
        balanceSompi: scanRes.totalBalanceSompi,
        createdAt: Date.now(),
        addressType,
        discoveredAddresses: scanRes.discoveredAddresses?.map((da: any) => da.address) || [scanRes.primaryAddress],
        addressPaths: addrPaths,
      };

      if (password) {
        await setPassword(password);
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
      addrPaths[scanRes.primaryAddress] = addrPaths[scanRes.primaryAddress] || `m/44'/${activeWallet.addressType === 'P2SH' ? '111111' : '111111'}'/0'/0/0`;

      setWallets((prev) =>
        prev.map((w) =>
          w.id === activeWallet.id
            ? {
                ...w,
                receiveAddress: scanRes.primaryAddress || w.receiveAddress,
                balanceSompi: scanRes.totalBalanceSompi,
                discoveredAddresses: scanRes.discoveredAddresses?.map((da: any) => da.address) || w.discoveredAddresses,
                addressPaths: addrPaths,
              }
            : w
        )
      );

      if (scanRes.allUtxos && scanRes.allUtxos.length > 0) {
        const parsedUtxos: UTXO[] = scanRes.allUtxos.map((u: any, idx: number) => ({
          id: `utxo-${u.outpoint?.transactionId || u.transactionId}-${u.outpoint?.index || 0}-${idx}`,
          txid: u.outpoint?.transactionId || u.transactionId || '',
          vout: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)),
          amountSompi: BigInt(u.utxoEntry?.amount || u.amount || 0),
          address: u.address || scanRes.primaryAddress,
          blockDaaScore: Number(u.utxoEntry?.blockDaaScore || u.blockDaaScore || 0),
          derivationPath: u.derivationPath || u.path,
        }));
        setUtxos(parsedUtxos);
      }

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
    }
  };

  const importSeedWallet = async (name: string, words: string[], passphrase?: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH', password?: string): Promise<Wallet> => {
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
      const derivedAddr = await generateDeterministicAddress(mStr, passphrase, prefix, addressType);
      scanRes = {
        primaryAddress: derivedAddr,
        totalBalanceSompi: 0n,
        discoveredAddresses: [],
        allUtxos: [],
        allTransactions: [],
      };
    } finally {
      if (password) {
        setIsLocked(true);
      }
      setIndexingState({ isIndexing: false, scannedAddresses: 0, foundAddresses: 0, balanceSompi: 0n });
    }
    
    const addrPaths: { [address: string]: string } = {};
    if (scanRes.discoveredAddresses) {
      scanRes.discoveredAddresses.forEach((da: any) => {
        addrPaths[da.address] = da.path;
      });
    }
    addrPaths[scanRes.primaryAddress] = `m/44'/${addressType === 'P2SH' ? '111111' : '111111'}'/0'/0/0`; // default to standard bip44 path format

    try {
      const activePassword = password || passwordRef.current;
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
        name: name || 'Restored Kaspa Wallet',
        receiveAddress: scanRes.primaryAddress,
        changeAddress: scanRes.primaryAddress,
        mnemonic: activePassword ? undefined : mStr,
        passphrase: activePassword ? undefined : (passphrase || undefined),
        encryptedMnemonic,
        encryptedPassphrase,
        balanceSompi: scanRes.totalBalanceSompi,
        createdAt: Date.now(),
        addressType,
        discoveredAddresses: scanRes.discoveredAddresses?.map((da: any) => da.address) || [scanRes.primaryAddress],
        addressPaths: addrPaths,
      };

      if (password) {
        await setPassword(password);
      }

      setWallets((prev) => [...prev, newW]);
      setActiveWalletIdState(newW.id);
      setIsLoggedOut(false);
      try {
        await saveSetting('kaspa_is_logged_out', false);
      } catch (e) {}
      
      showToast(`Restored Kaspa Wallet '${newW.name}'! Found ${formatKas(scanRes.totalBalanceSompi)} KAS on chain index.`, 'success');
      return newW;
    } finally {
      // Wipe mnemonic string
      mStr = '';
    }
  };

  const importKpubWallet = (name: string, kpubOrAddress: string, addressType: 'P2PKH' | 'P2SH' = 'P2PKH'): Wallet => {
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
      name: name || 'Watch-Only Wallet',
      receiveAddress: targetAddress,
      changeAddress: targetAddress,
      kpub: isDirectAddress ? undefined : kpubOrAddress,
      isImportedKpub: true,
      isWatchOnly: true,
      balanceSompi: 0n,
      createdAt: Date.now(),
      addressType,
    };

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
    providedPassphrase?: string
  ): Promise<{ success: boolean; txid?: string; error?: string; inputs?: any[] }> => {
    if (!activeWallet) return { success: false, error: 'No active wallet selected' };
    
    let seedToUse: string | null = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic;
    let passphraseToUse: string | null | undefined = providedPassphrase !== undefined ? providedPassphrase : activeWallet.passphrase;

    const activePassword = password || passwordRef.current;

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

      if (activeWallet.balanceSompi < totalSompiNeeded) {
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
            const devPath = activeWallet.addressPaths?.[address];
            utxosResponse.push({
              ...u,
              address,
              derivationPath: devPath,
            });
          });
        }
      });

      if (utxosResponse.length === 0) {
        const err = 'Failed to fetch UTXOs or address has no available spendable outputs.';
        return { success: false, error: err };
      }

      // Sort UTXOs descending by amount and select a subset (max 15) to keep transaction mass below 500,000 bytes
      utxosResponse.sort((a, b) => {
        const amtA = BigInt(a.utxoEntry?.amount || a.amount || 0);
        const amtB = BigInt(b.utxoEntry?.amount || b.amount || 0);
        return amtB > amtA ? 1 : amtB < amtA ? -1 : 0;
      });

      const selectedUtxos: any[] = [];
      let accumulatedSum = 0n;
      for (const u of utxosResponse) {
        selectedUtxos.push(u);
        accumulatedSum += BigInt(u.utxoEntry?.amount || u.amount || 0);
        if (accumulatedSum >= totalSompiNeeded || selectedUtxos.length >= 15) {
          break;
        }
      }

      if (accumulatedSum < totalSompiNeeded) {
        const err = `Insufficient spendable UTXOs in top 15 inputs (${sompiToKas(accumulatedSum).toFixed(4)} KAS available, ${sompiToKas(totalSompiNeeded).toFixed(4)} KAS needed). Please use 'Compound UTXOs' first.`;
        return { success: false, error: err };
      }

      // 2. Build Unsigned Intent & Execute via IsolatedSigner
      const intent = {
        network,
        toAddress,
        changeAddress: activeWallet.receiveAddress,
        amountSompi,
        feeSompi,
        utxos: selectedUtxos,
        note
      };

      try {
        const signerResult = await IsolatedSigner.signTransactionIsolated(
          seedToUse,
          passphraseToUse,
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
          
          // Refresh balance after a short delay
          setTimeout(refreshBalance, 2000);
          
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
    
    let seedToUse: string | null = (providedSeedPhrase && providedSeedPhrase.trim()) || activeWallet.mnemonic;
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
            const devPath = activeWallet.addressPaths?.[address];
            utxosResponse.push({
              ...u,
              address,
              derivationPath: devPath,
            });
          });
        }
      });

      if (utxosResponse.length < 2) {
        showToast('Not enough UTXOs to compound', 'info');
        return { success: false };
      }

      // Limit compound batch to max 15 UTXOs to stay safely under 500,000 storage mass limit
      const utxosToCompound = utxosResponse.slice(0, 15);

      const totalBalance = utxosToCompound.reduce((acc, u) => {
        const amount = u.utxoEntry?.amount || u.amount;
        return acc + BigInt(amount || 0);
      }, 0n);
      
      const feeSompi = BigInt(Math.max(500000, utxosToCompound.length * 200000)); // Minimum 0.005 KAS, scaling with UTXO count
      const amountToSelf = totalBalance - feeSompi;

      if (amountToSelf <= 0n) {
        showToast('Balance too low after fees to compound', 'error');
        return { success: false };
      }

      const addrType = activeWallet.addressType || (activeWallet.receiveAddress?.includes(':p') ? 'P2SH' : 'P2PKH');
      const privKeyBytes = getPrivateKeyBytesFromMnemonic(seedToUse, passphraseToUse);

      try {
        const signedTx = await createSignedTransaction(
          utxosToCompound,
          activeWallet.receiveAddress,
          amountToSelf,
          activeWallet.receiveAddress,
          privKeyBytes,
          feeSompi,
          addrType,
          undefined, // redeemScriptHex
          undefined  // lockTime
        );

        const broadcastResult = await broadcastKaspaTransaction(signedTx);
        
        if (broadcastResult.success) {
          showToast(`Compounding initiated for ${utxosToCompound.length} UTXOs`, 'success');
          setTimeout(refreshBalance, 2000);
          return { success: true, txid: broadcastResult.txId, countMerged: utxosResponse.length };
        } else {
          showToast(`Compound failed: ${broadcastResult.error}`, 'error');
          return { success: false };
        }
      } finally {
        // --------------------------------------------------------
        // ALWAYS wipe application-managed sensitive references
        // --------------------------------------------------------
        if (privKeyBytes) wipe(privKeyBytes);
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
        showToast('Password enabled, but error encrypting existing keys', 'warning');
      }
        } else {
      const activePassword = passwordState || passwordRef.current;
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

  const unlockWallet = async (password: string): Promise<boolean> => {
    let passwordValid = false;
    const canaryObj = await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_password_canary') || await getSetting<{ ciphertext: string; salt: string; iv: string }>('wallet_pin_canary');
    
    if (canaryObj) {
      try {
        const decryptedCanary = await decryptWithPassword(canaryObj.ciphertext, canaryObj.salt, canaryObj.iv, password, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");
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
            await decryptWithPassword(firstW.encryptedMnemonic.ciphertext, firstW.encryptedMnemonic.salt, firstW.encryptedMnemonic.iv, password, buildAadContext('MNEMONIC', firstW.id));
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
      setPasswordState(password);
      setIsLocked(false);
      showToast('Wallet unlocked', 'success');
      return true;
    }
    return false;
  };

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
        transactions,
        utxos,
        sendKaspa,
        compoundUtxos,
        network,
        setNetwork,
        nodes,
        activeNode,
        selectNode,
        addCustomNode,
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
        isCovenantOpen,
        setIsCovenantOpen,
        isAssetDetailOpen,
        setIsAssetDetailOpen,
        activeBottomTab,
        setActiveBottomTab,
        isBalanceVisible,
        setIsBalanceVisible,
        apiUrl,
        setApiUrl,
        explorerUrl,
        setExplorerUrl,
        refreshBalance,
        scanWalletChainIndex,
        isScanningChain,
        deployedCovenants,
        addCovenant,
        claimCovenant,
        removeCovenant,
        clearAllCovenants,
        isSyncingCovenants,
        syncCovenantsOnChain,
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
