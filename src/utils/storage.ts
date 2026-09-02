import { Wallet, UTXO, KaspaTransaction } from '../types';
import { SQLitePlugin } from '../plugins/SQLitePlugin';
import { Capacitor } from '@capacitor/core';
import { openDB, IDBPDatabase } from 'idb';

const IS_NATIVE = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.()));

let webDbPromise: Promise<IDBPDatabase> | null = null;
// ONLY initialize IndexedDB in pure browser preview mode; NEVER in native Android APK
if (!IS_NATIVE && typeof window !== 'undefined') {
  webDbPromise = openDB('kaspriv_db_v3', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('wallets')) db.createObjectStore('wallets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('utxos')) db.createObjectStore('utxos', { keyPath: 'walletId' });
      if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'walletId' });
    }
  });
}

function ensureArray<T>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    // If it's a JSON object with numbered or arbitrary keys, extract values
    return Object.values(val) as T[];
  }
  return [];
}

/**
 * High-performance, compile-safe Native Database Driver.
 * Strictly linked to Android Jetpack Room (Kotlin) with direct native bridge queries.
 * In native APK builds, Room SQLite is the ONLY storage backend.
 */
class SQLiteDatabase {
  private initialized = false;
  
  public async init(): Promise<void> {
    if (this.initialized) return;
    // Native side initialization is handled in Kotlin AppDatabase.getDatabase
    this.initialized = true;
  }

  public async saveWallet(id: string, data: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveWallet({ id, data });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('wallets', { id, value: data });
    }
  }

  public async getWallets(): Promise<{ id: string; value: string }[]> {
    if (IS_NATIVE) {
      try {
        const res = await SQLitePlugin.getWallets();
        return ensureArray<{ id: string; value: string }>(res?.wallets);
      } catch (e) {
        console.error('Failed to getWallets from native SQLite:', e);
        return [];
      }
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      return await db.getAll('wallets');
    }
    return [];
  }

  public async deleteWallet(id: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.deleteWallet({ id });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.delete('wallets', id);
      await db.delete('utxos', id);
      await db.delete('transactions', id);
    }
  }

  public async saveSetting(key: string, value: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveSetting({ key, value });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('settings', { key, value });
    }
  }

  public async getSettings(): Promise<{ key: string; value: string }[]> {
    if (IS_NATIVE) {
      try {
        const res = await SQLitePlugin.getSettings();
        return ensureArray<{ key: string; value: string }>(res?.settings);
      } catch (e) {
        console.error('Failed to getSettings from native SQLite:', e);
        return [];
      }
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      return await db.getAll('settings');
    }
    return [];
  }

  public async deleteSetting(key: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.deleteSetting({ key });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.delete('settings', key);
    }
  }

  public async saveUtxos(walletId: string, data: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveUtxo({ walletId, data });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('utxos', { walletId, data });
    }
  }

  public async getUtxos(walletId: string): Promise<{ walletId: string; data: string } | undefined> {
    if (IS_NATIVE) {
      try {
        const res = await SQLitePlugin.getUtxos();
        const list = ensureArray<{ walletId: string; data: string }>(res?.utxos);
        return list.find(u => u.walletId === walletId);
      } catch (e) {
        console.error('Failed to getUtxos from native SQLite:', e);
        return undefined;
      }
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      return await db.get('utxos', walletId);
    }
    return undefined;
  }

  public async saveTransactions(walletId: string, data: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveTransaction({ walletId, data });
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('transactions', { walletId, data });
    }
  }

  public async getTransactions(walletId: string): Promise<{ walletId: string; data: string } | undefined> {
    if (IS_NATIVE) {
      try {
        const res = await SQLitePlugin.getTransactions();
        const list = ensureArray<{ walletId: string; data: string }>(res?.transactions);
        return list.find(t => t.walletId === walletId);
      } catch (e) {
        console.error('Failed to getTransactions from native SQLite:', e);
        return undefined;
      }
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      return await db.get('transactions', walletId);
    }
    return undefined;
  }

  public async clearAll(): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.clearAll();
      return;
    }
    if (webDbPromise) {
      const db = await webDbPromise;
      await Promise.all([
        db.clear('wallets'),
        db.clear('settings'),
        db.clear('utxos'),
        db.clear('transactions')
      ]);
    }
  }
}

const sqliteDb = new SQLiteDatabase();

let panicWipeTriggered = false;
export function setPanicWipeTriggered(val: boolean): void { panicWipeTriggered = val; }
export function isPanicWipeTriggered(): boolean { return panicWipeTriggered; }

async function withSQLite<T>(operation: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  if (panicWipeTriggered) return undefined as unknown as T;
  await sqliteDb.init();
  if (panicWipeTriggered) return undefined as unknown as T;
  return await operation(sqliteDb);
}

export async function saveWalletToDB(wallet: Wallet): Promise<void> {
  return withSQLite(async (db) => {
    const sanitizedWallet = { ...wallet };
    // Hardened Invariant: Plaintext secrets MUST NEVER be written to durable storage under any circumstance
    delete sanitizedWallet.mnemonic;
    delete sanitizedWallet.passphrase;
    
    const valuePayload = JSON.stringify({
      ...sanitizedWallet,
      balanceSompi: wallet.balanceSompi.toString()
    });

    await db.saveWallet(wallet.id, valuePayload);
  });
}

export async function getWalletsFromDB(): Promise<Wallet[]> {
  const result = await withSQLite(async (db) => {
    const wallets = await db.getWallets();
    if (!Array.isArray(wallets)) return [];
    return wallets.map((row) => {
      try {
        if (!row || !row.value) return null;
        const w = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        return { ...w, balanceSompi: BigInt(w?.balanceSompi || '0') };
      } catch (e) {
        console.error('Error parsing wallet row from DB:', e);
        return null;
      }
    }).filter(Boolean) as Wallet[];
  });
  return result || [];
}

export async function deleteWalletFromDB(id: string): Promise<void> {
  return withSQLite(async (db) => {
    await db.deleteWallet(id);
  });
}

export async function clearAllWalletsFromDB(): Promise<void> {
  return withSQLite(async (db) => {
    await db.clearAll();
  });
}

export async function saveUtxosToDB(walletId: string, utxos: UTXO[]): Promise<void> {
  return withSQLite(async (db) => {
    const serialized = JSON.stringify(utxos.map((u) => ({ ...u, amountSompi: u.amountSompi.toString() })));
    await db.saveUtxos(walletId, serialized);
  });
}

export async function getUtxosFromDB(walletId: string): Promise<UTXO[]> {
  const result = await withSQLite(async (db) => {
    const row = await db.getUtxos(walletId);
    if (!row || !row.data) return [];
    try {
      const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (!Array.isArray(raw)) return [];
      return raw.map((u: any) => ({ ...u, amountSompi: BigInt(u?.amountSompi || '0') }));
    } catch (e) {
      console.error('Error parsing UTXOs row from DB:', e);
      return [];
    }
  });
  return result || [];
}

export async function saveTransactionsToDB(walletId: string, txs: KaspaTransaction[]): Promise<void> {
  return withSQLite(async (db) => {
    const serialized = JSON.stringify(
      txs.map((t) => ({ ...t, amountSompi: t.amountSompi.toString(), feeSompi: t.feeSompi.toString() }))
    );
    await db.saveTransactions(walletId, serialized);
  });
}

export async function getTransactionsFromDB(walletId: string): Promise<KaspaTransaction[]> {
  const result = await withSQLite(async (db) => {
    const row = await db.getTransactions(walletId);
    if (!row || !row.data) return [];
    try {
      const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (!Array.isArray(raw)) return [];
      return raw.map((t: any) => ({ ...t, amountSompi: BigInt(t?.amountSompi || '0'), feeSompi: BigInt(t?.feeSompi || '0') }));
    } catch (e) {
      console.error('Error parsing transactions row from DB:', e);
      return [];
    }
  });
  return result || [];
}

export async function purgeAllDatabases(): Promise<void> {
  setPanicWipeTriggered(true);
  try {
    await sqliteDb.clearAll();

    // Trigger full deletion of IndexedDB legacy databases too for an absolute wipe
    const awaitDeleteDatabase = (name: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        if (typeof window === 'undefined' || !window.indexedDB) { resolve(true); return; }
        try {
          const request = window.indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
          request.onblocked = () => resolve(false);
        } catch { resolve(false); }
      });
    };

    await Promise.all([
      awaitDeleteDatabase('kaspriv_db_v2'),
      awaitDeleteDatabase('kaspriv_db_v1'),
      awaitDeleteDatabase('kaspriv_audit_db'),
    ]);

    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}

    try {
      if (typeof window !== 'undefined' && window.navigator?.serviceWorker) {
        window.navigator.serviceWorker.controller?.postMessage('PANIC_WIPE');
        const registrations = await window.navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } catch {}

    try {
      if (typeof window !== 'undefined' && window.caches) {
        const names = await window.caches.keys();
        await Promise.all(names.map((name) => window.caches.delete(name)));
      }
    } catch {}
  } finally {
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  }
}

export async function auditWalletStorage(): Promise<{ ok: boolean; walletCount: number; plaintextSecretRecords: string[] }> {
  if (panicWipeTriggered) return { ok: false, walletCount: 0, plaintextSecretRecords: [] };
  try {
    const wallets = await getWalletsFromDB();
    if (panicWipeTriggered) return { ok: false, walletCount: 0, plaintextSecretRecords: [] };
    const plaintextSecretRecords: string[] = [];
    for (const record of wallets) {
      if (typeof record?.mnemonic === 'string' && record.mnemonic.length > 0) plaintextSecretRecords.push(`${record.id}:mnemonic`);
      if (typeof record?.passphrase === 'string' && record.passphrase.length > 0) plaintextSecretRecords.push(`${record.id}:passphrase`);
    }
    return { ok: plaintextSecretRecords.length === 0, walletCount: wallets.length, plaintextSecretRecords };
  } catch {
    return { ok: false, walletCount: 0, plaintextSecretRecords: [] };
  }
}

export async function saveSetting(key: string, value: any): Promise<void> {
  return withSQLite(async (db) => {
    const serialized = JSON.stringify({ value });
    await db.saveSetting(key, serialized);
  });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return withSQLite(async (db) => {
    const settings = await db.getSettings();
    if (!Array.isArray(settings)) return undefined;
    const row = settings.find(s => s?.key === key);
    if (!row || !row.value) return undefined;
    try {
      const data = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return (data && typeof data === 'object' && 'value' in data) ? (data.value as T) : (data as T);
    } catch (e) {
      console.error(`Error parsing setting ${key} from DB:`, e);
      return undefined;
    }
  });
}

export async function removeSetting(key: string): Promise<void> {
  return withSQLite(async (db) => {
    await db.deleteSetting(key);
  });
}

