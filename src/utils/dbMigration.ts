/**
 * Database Migration Manager for Kaspriv Wallet
 * Uses abstract migration framework logic to migrate wallet storage schemas.
 */
import { Wallet } from '../types';
import { safeStringify } from './json';

export interface MigrationState {
  version: number;
  migratedAt: number;
}

const STORAGE_KEY_WALLETS = 'kaspa_wallets';
const STORAGE_KEY_MIGRATION = 'kaspa_db_migration_state';
const CURRENT_DB_VERSION = 3;

/**
 * Helper to strip secret credentials (mnemonic & passphrase) before persisting to storage.
 */
function sanitizeWalletForStorage(w: any): any {
  const { mnemonic, passphrase, ...safeWallet } = w;
  return safeWallet;
}

export function runDatabaseMigrations(): void {
  // Logic migrated to IndexedDB upgrade callback in src/utils/storage.ts
  return;
}
