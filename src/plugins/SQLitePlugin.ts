import { registerPlugin } from '@capacitor/core';

export interface SQLitePluginInterface {
  saveWallet(options: { id: string; data: string }): Promise<void>;
  getWallets(): Promise<{ wallets: { id: string; value: string }[] }>;
  deleteWallet(options: { id: string }): Promise<void>;
  
  saveSetting(options: { key: string; value: string }): Promise<void>;
  getSettings(): Promise<{ settings: { key: string; value: string }[] }>;
  deleteSetting(options: { key: string }): Promise<void>;
  
  saveUtxo(options: { walletId: string; data: string }): Promise<void>;
  getUtxos(): Promise<{ utxos: { walletId: string; data: string }[] }>;
  
  saveTransaction(options: { walletId: string; data: string }): Promise<void>;
  getTransactions(): Promise<{ transactions: { walletId: string; data: string }[] }>;
  clearAll(): Promise<void>;
}

export const SQLitePlugin = registerPlugin<SQLitePluginInterface>('SQLite');
