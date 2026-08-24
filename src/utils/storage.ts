import { Wallet, UTXO, KaspaTransaction } from '../types';
import { SQLitePlugin } from '../plugins/SQLitePlugin';
import { openDB, IDBPDatabase } from 'idb';

const IS_NATIVE = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
let webDbPromise: Promise<IDBPDatabase> | null = null;
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

/**
 * High-performance, compile-safe Native Database Driver.
 * Strictly linked to Android Jetpack Room (Kotlin) with direct native bridge queries.
 * Seamless IDB fallback for web preview persistence.
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
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('wallets', { id, value: data });
    }
  }

  public async getWallets(): Promise<{ id: string; value: string }[]> {
    if (IS_NATIVE) {
      const res = await SQLitePlugin.getWallets();
      return res.wallets || [];
    } else if (webDbPromise) {
      const db = await webDbPromise;
      return await db.getAll('wallets');
    }
    return [];
  }

  public async deleteWallet(id: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.deleteWallet({ id });
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.delete('wallets', id);
      await db.delete('utxos', id);
      await db.delete('transactions', id);
    }
  }

  public async saveSetting(key: string, value: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveSetting({ key, value });
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('settings', { key, value });
    }
  }

  public async getSettings(): Promise<{ key: string; value: string }[]> {
    if (IS_NATIVE) {
      const res = await SQLitePlugin.getSettings();
      return res.settings || [];
    } else if (webDbPromise) {
      const db = await webDbPromise;
      return await db.getAll('settings');
    }
    return [];
  }

  public async deleteSetting(key: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.deleteSetting({ key });
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.delete('settings', key);
    }
  }

  public async saveUtxos(walletId: string, data: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveUtxo({ walletId, data });
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('utxos', { walletId, data });
    }
  }

  public async getUtxos(walletId: string): Promise<{ walletId: string; data: string } | undefined> {
    if (IS_NATIVE) {
      const res = await SQLitePlugin.getUtxos();
      return res.utxos.find(u => u.walletId === walletId);
    } else if (webDbPromise) {
      const db = await webDbPromise;
      return await db.get('utxos', walletId);
    }
    return undefined;
  }

  public async saveTransactions(walletId: string, data: string): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.saveTransaction({ walletId, data });
    } else if (webDbPromise) {
      const db = await webDbPromise;
      await db.put('transactions', { walletId, data });
    }
  }

  public async getTransactions(walletId: string): Promise<{ walletId: string; data: string } | undefined> {
    if (IS_NATIVE) {
      const res = await SQLitePlugin.getTransactions();
      return res.transactions.find(t => t.walletId === walletId);
    } else if (webDbPromise) {
      const db = await webDbPromise;
      return await db.get('transactions', walletId);
    }
    return undefined;
  }

  public async clearAll(): Promise<void> {
    if (IS_NATIVE) {
      // In Kotlin, we use destructive migration or manual delete.
      // For simplicity, we'll implement individual deletes if needed or a clearAll method.
      const wallets = await this.getWallets();
      for (const w of wallets) await this.deleteWallet(w.id);
    } else if (webDbPromise) {
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
    return wallets.map((row) => {
      const w = JSON.parse(row.value);
      return { ...w, balanceSompi: BigInt(w.balanceSompi || '0') };
    });
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
    if (!row) return [];
    const raw = JSON.parse(row.data);
    if (!Array.isArray(raw)) return [];
    return raw.map((u: any) => ({ ...u, amountSompi: BigInt(u.amountSompi || '0') }));
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
    if (!row) return [];
    const raw = JSON.parse(row.data);
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({ ...t, amountSompi: BigInt(t.amountSompi || '0'), feeSompi: BigInt(t.feeSompi || '0') }));
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
    const row = settings.find(s => s.key === key);
    if (!row) return undefined;
    const data = JSON.parse(row.value);
    return data?.value as T;
  });
}

export async function removeSetting(key: string): Promise<void> {
  return withSQLite(async (db) => {
    await db.deleteSetting(key);
  });
}

