export type NetworkType = 'mainnet' | 'testnet-10' | 'devnet';

export type CurrencyType = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'BTC';

export interface Wallet {
  id: string;
  name: string;
  receiveAddress: string;
  changeAddress: string;
  mnemonic?: string; // 24-word seed phrase
  passphrase?: string; // Optional BIP39 passphrase
  encryptedMnemonic?: { ciphertext: string; salt: string; iv: string };
  encryptedPassphrase?: { ciphertext: string; salt: string; iv: string };
  kpub?: string;
  isImportedKpub?: boolean;
  isWatchOnly?: boolean;
  balanceSompi: bigint;
  createdAt: number;
  addressType?: 'P2PKH' | 'P2SH';
  discoveredAddresses?: string[];
  addressPaths?: { [address: string]: string };
  addressBalances?: { [address: string]: string };
  lockedUtxoOutpoints?: string[];
}

export interface KaspaTransaction {
  txid: string;
  type: 'receive' | 'send' | 'compound';
  amountSompi: bigint;
  feeSompi: bigint;
  address: string;
  addressLabel?: string;
  timestamp: number;
  blockDaaScore: number;
  acceptingBlockHash?: string;
  note?: string;
  isAccepted: boolean;
  confirmations: number;
  utxosUsed?: number;
}

export interface UTXO {
  id: string;
  txid: string;
  vout: number;
  amountSompi: bigint;
  address: string;
  blockDaaScore: number;
  isLocked?: boolean;
  derivationPath?: string;
}

export interface CustomNodeConfig {
  id: string;
  name: string;
  rpcUrl: string;
  apiUrl: string;
  explorerUrl: string;
  isCustom: boolean;
  network: NetworkType;
  isTorOrOnion?: boolean;
  proxyEnabled?: boolean;
}

export interface ProxyConfig {
  enabled: boolean;
  type: 'tor' | 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
  onionOnly?: boolean;
}

export interface KaspaNode {
  id: string;
  url: string;
  network: NetworkType;
  latencyMs: number;
  isOnline: boolean;
  isCustom?: boolean;
  selected?: boolean;
  name?: string;
  apiUrl?: string;
  explorerUrl?: string;
  isTorOrOnion?: boolean;
  isOnion?: boolean;
  isPrivateSelfHosted?: boolean;
  proxyRequired?: boolean;
}

export interface MarketData {
  priceUsd: number;
  priceBtc: number;
  change24h: number;
  marketCapUsd: number;
  volume24hUsd: number;
  lastUpdated: number;
}

export interface Contact {
  id: string;
  name: string;
  address: string;
  notes?: string;
  createdAt: number;
}

export interface FeeRates {
  prioritySompiPerGram: number; // Fast
  normalSompiPerGram: number;   // Normal
  lowSompiPerGram: number;      // Low priority
}


