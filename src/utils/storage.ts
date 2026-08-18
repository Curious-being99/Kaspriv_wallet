import { openDB, IDBPDatabase } from 'idb';
import { Wallet, UTXO, KaspaTransaction } from '../types';

const DB_NAME = 'kaspriv_db_v2';
const WALLET_STORE = 'wallets';
const SETTINGS_STORE = 'settings';
const UTXO_STORE = 'utxos';
const TX_STORE = 'transactions';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WALLET_STORE)) {
          db.createObjectStore(WALLET_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
        if (!db.objectStoreNames.contains(UTXO_STORE)) {
          db.createObjectStore(UTXO_STORE);
        }
        if (!db.objectStoreNames.contains(TX_STORE)) {
          db.createObjectStore(TX_STORE);
        }
      },
      blocked() {
        dbPromise = null;
      },
      blocking(db) {
        try {
          db.close();
        } catch {}
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

let panicWipeTriggered = false;

export function setPanicWipeTriggered(val: boolean): void {
  panicWipeTriggered = val;
}

export function isPanicWipeTriggered(): boolean {
  return panicWipeTriggered;
}

async function withDB<T>(operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  if (panicWipeTriggered) {
    console.warn('Storage operation blocked: Panic/Duress wipe is in progress.');
    return undefined as unknown as T;
  }

  let db: IDBPDatabase;
  try {
    db = await getDB();
  } catch {
    dbPromise = null;
    db = await getDB();
  }

  try {
    return await operation(db);
  } catch (err: any) {
    const errStr = String(err?.message || err || '');
    if (
      errStr.includes('closing') ||
      errStr.includes('closed') ||
      errStr.includes('connection') ||
      err?.name === 'InvalidStateError'
    ) {
      console.warn('IndexedDB connection closed or closing. Re-opening database connection...');
      dbPromise = null;
      try {
        db = await getDB();
        return await operation(db);
      } catch (retryErr) {
        console.warn('IndexedDB operation retry failed:', retryErr);
        return undefined as unknown as T;
      }
    }
    throw err;
  }
}

export async function saveWalletToDB(wallet: Wallet): Promise<void> {
  return withDB(async (db) => {
    // Zero-Trust IDB Guard: Ensure plaintext seeds or passphrases are never written to IDB
    const sanitizedWallet = { ...wallet };
    delete sanitizedWallet.mnemonic;
    delete sanitizedWallet.passphrase;

    await db.put(WALLET_STORE, {
      ...sanitizedWallet,
      balanceSompi: wallet.balanceSompi.toString(), // Convert BigInt to string for DB storage
    });
  });
}

export async function getWalletsFromDB(): Promise<Wallet[]> {
  const result = await withDB(async (db) => {
    const rawWallets = await db.getAll(WALLET_STORE);
    if (!Array.isArray(rawWallets)) return [];
    return rawWallets.map((w) => ({
      ...w,
      balanceSompi: BigInt(w.balanceSompi || '0'),
    }));
  });
  return result || [];
}

export async function deleteWalletFromDB(id: string): Promise<void> {
  return withDB(async (db) => {
    await db.delete(WALLET_STORE, id);
    await db.delete(UTXO_STORE, id);
    await db.delete(TX_STORE, id);
  });
}

export async function clearAllWalletsFromDB(): Promise<void> {
  return withDB(async (db) => {
    await db.clear(WALLET_STORE);
    await db.clear(SETTINGS_STORE);
    await db.clear(UTXO_STORE);
    await db.clear(TX_STORE);
  });
}

export async function saveUtxosToDB(walletId: string, utxos: UTXO[]): Promise<void> {
  return withDB(async (db) => {
    const serializable = utxos.map((u) => ({
      ...u,
      amountSompi: u.amountSompi.toString(),
    }));
    await db.put(UTXO_STORE, serializable, walletId);
  });
}

export async function getUtxosFromDB(walletId: string): Promise<UTXO[]> {
  const result = await withDB(async (db) => {
    const raw = await db.get(UTXO_STORE, walletId);
    if (!Array.isArray(raw)) return [];
    return raw.map((u: any) => ({
      ...u,
      amountSompi: BigInt(u.amountSompi || '0'),
    }));
  });
  return result || [];
}

export async function saveTransactionsToDB(walletId: string, txs: KaspaTransaction[]): Promise<void> {
  return withDB(async (db) => {
    const serializable = txs.map((t) => ({
      ...t,
      amountSompi: t.amountSompi.toString(),
      feeSompi: t.feeSompi.toString(),
    }));
    await db.put(TX_STORE, serializable, walletId);
  });
}

export async function getTransactionsFromDB(walletId: string): Promise<KaspaTransaction[]> {
  const result = await withDB(async (db) => {
    const raw = await db.get(TX_STORE, walletId);
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({
      ...t,
      amountSompi: BigInt(t.amountSompi || '0'),
      feeSompi: BigInt(t.feeSompi || '0'),
    }));
  });
  return result || [];
}

function awaitDeleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve();
      return;
    }
    try {
      const request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => {
        console.warn(`Database deletion blocked for ${name}`);
        resolve();
      };
      // 2-second safety fallback timeout
      setTimeout(resolve, 2000);
    } catch {
      resolve();
    }
  });
}

/**
 * Emergency Panic Wipe:
 * Closes connections, drops all IndexedDB object stores/databases,
 * and purges all local storage and session storage data.
 */
export async function purgeAllDatabases(): Promise<void> {
  try {
    if (dbPromise) {
      const currentPromise = dbPromise;
      dbPromise = null;
      const db = await currentPromise;
      try {
        await db.clear(WALLET_STORE);
        await db.clear(SETTINGS_STORE);
        await db.clear(UTXO_STORE);
        await db.clear(TX_STORE);
      } catch {}
      try {
        db.close();
      } catch {}
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      await Promise.all([
        awaitDeleteDatabase(DB_NAME),
        awaitDeleteDatabase('kaspriv_db_v1'),
        awaitDeleteDatabase('kaspriv_audit_db'),
      ]);
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch {}

  // Post a panic message to any active Service Worker and unregister them
  try {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.serviceWorker) {
      if (window.navigator.serviceWorker.controller) {
        window.navigator.serviceWorker.controller.postMessage('PANIC_WIPE');
      }
      const registrations = await window.navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
  } catch {}

  // Delete all items inside Cache Storage
  try {
    if (typeof window !== 'undefined' && window.caches) {
      const cacheNames = await window.caches.keys();
      for (const cacheName of cacheNames) {
        await window.caches.delete(cacheName);
      }
    }
  } catch {}
}

export async function saveSetting(key: string, value: any): Promise<void> {
  return withDB(async (db) => {
    await db.put(SETTINGS_STORE, value, key);
  });
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return withDB(async (db) => {
    return db.get(SETTINGS_STORE, key);
  });
}

export async function removeSetting(key: string): Promise<void> {
  return withDB(async (db) => {
    await db.delete(SETTINGS_STORE, key);
  });
}
