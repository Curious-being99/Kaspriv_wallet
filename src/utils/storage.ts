import { Wallet, UTXO, KaspaTransaction } from '../types';
import { SQLitePlugin } from '../plugins/SQLitePlugin';

/**
 * High-performance, compile-safe Relational SQLite Database Driver.
 * Strictly linked to Android Jetpack Room with direct native bridge queries.
 * All browser-level simulation, regex statement parsing, and localStorage fallbacks have been removed.
 */
class SQLiteDatabase {
  private initialized = false;

  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        // Build actual schemas inside the native Jetpack Room container
        await this.executeSql('CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, value TEXT)');
        await this.executeSql('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
        await this.executeSql('CREATE TABLE IF NOT EXISTS utxos (walletId TEXT PRIMARY KEY, data TEXT)');
        await this.executeSql('CREATE TABLE IF NOT EXISTS transactions (walletId TEXT PRIMARY KEY, data TEXT)');
      }
      this.initialized = true;
    } catch (e) {
      console.error('Native SQLite Driver: Initialization failed:', e);
      this.initialized = true;
    }
  }

  public async executeSql(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      const res = await SQLitePlugin.executeSql({ sql, params });
      return { rows: res?.rows || [] };
    }
    
    // In browser preview, return an empty set to prevent runtime crashes during manual UI testing
    return { rows: [] };
  }

  public async clearAll(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      await SQLitePlugin.clearAll();
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

    await db.executeSql(
      'INSERT OR REPLACE INTO wallets (id, value) VALUES (?, ?)',
      [wallet.id, valuePayload]
    );
  });
}

export async function getWalletsFromDB(): Promise<Wallet[]> {
  const result = await withSQLite(async (db) => {
    const res = await db.executeSql('SELECT * FROM wallets');
    if (!res.rows || !Array.isArray(res.rows)) return [];
    
    return res.rows.map((row) => {
      const w = JSON.parse(row.value);
      return { ...w, balanceSompi: BigInt(w.balanceSompi || '0') };
    });
  });
  return result || [];
}

export async function deleteWalletFromDB(id: string): Promise<void> {
  return withSQLite(async (db) => {
    await db.executeSql('DELETE FROM wallets WHERE id = ?', [id]);
    await db.executeSql('DELETE FROM utxos WHERE walletid = ?', [id]);
    await db.executeSql('DELETE FROM transactions WHERE walletid = ?', [id]);
  });
}

export async function clearAllWalletsFromDB(): Promise<void> {
  return withSQLite(async (db) => {
    await db.executeSql('DELETE FROM wallets');
    await db.executeSql('DELETE FROM settings');
    await db.executeSql('DELETE FROM utxos');
    await db.executeSql('DELETE FROM transactions');
  });
}

export async function saveUtxosToDB(walletId: string, utxos: UTXO[]): Promise<void> {
  return withSQLite(async (db) => {
    const serialized = JSON.stringify(utxos.map((u) => ({ ...u, amountSompi: u.amountSompi.toString() })));
    await db.executeSql(
      'INSERT OR REPLACE INTO utxos (walletId, data) VALUES (?, ?)',
      [walletId, serialized]
    );
  });
}

export async function getUtxosFromDB(walletId: string): Promise<UTXO[]> {
  const result = await withSQLite(async (db) => {
    const res = await db.executeSql('SELECT * FROM utxos WHERE walletId = ?', [walletId]);
    if (!res.rows || res.rows.length === 0) return [];
    const raw = JSON.parse(res.rows[0].data);
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
    await db.executeSql(
      'INSERT OR REPLACE INTO transactions (walletId, data) VALUES (?, ?)',
      [walletId, serialized]
    );
  });
}

export async function getTransactionsFromDB(walletId: string): Promise<KaspaTransaction[]> {
  const result = await withSQLite(async (db) => {
    const res = await db.executeSql('SELECT * FROM transactions WHERE walletId = ?', [walletId]);
    if (!res.rows || res.rows.length === 0) return [];
    const raw = JSON.parse(res.rows[0].data);
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
    await db.executeSql(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, serialized]
    );
  });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return withSQLite(async (db) => {
    const res = await db.executeSql('SELECT * FROM settings WHERE key = ?', [key]);
    if (!res.rows || res.rows.length === 0) return undefined;
    const data = JSON.parse(res.rows[0].value);
    return data?.value as T;
  });
}

export async function removeSetting(key: string): Promise<void> {
  return withSQLite(async (db) => {
    await db.executeSql('DELETE FROM settings WHERE key = ?', [key]);
  });
}

