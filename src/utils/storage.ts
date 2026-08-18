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
        if (!db.objectStoreNames.contains(WALLET_STORE)) db.createObjectStore(WALLET_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
        if (!db.objectStoreNames.contains(UTXO_STORE)) db.createObjectStore(UTXO_STORE);
        if (!db.objectStoreNames.contains(TX_STORE)) db.createObjectStore(TX_STORE);
      },
      blocked() { dbPromise = null; },
      blocking(db) { try { db.close(); } catch {} dbPromise = null; },
      terminated() { dbPromise = null; },
    });
  }
  return dbPromise;
}

let panicWipeTriggered = false;
export function setPanicWipeTriggered(val: boolean): void { panicWipeTriggered = val; }
export function isPanicWipeTriggered(): boolean { return panicWipeTriggered; }

async function withDB<T>(operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  if (panicWipeTriggered) return undefined as unknown as T;
  let db: IDBPDatabase;
  try { db = await getDB(); }
  catch { dbPromise = null; db = await getDB(); }
  try { return await operation(db); }
  catch (err: any) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('closing') || msg.includes('closed') || msg.includes('connection') || err?.name === 'InvalidStateError') {
      dbPromise = null;
      try {
        db = await getDB();
        if (panicWipeTriggered) return undefined as unknown as T;
        return await operation(db);
      } catch { return undefined as unknown as T; }
    }
    throw err;
  }
}

export async function saveWalletToDB(wallet: Wallet): Promise<void> {
  return withDB(async (db) => {
    const sanitizedWallet = { ...wallet };
    delete sanitizedWallet.mnemonic;
    delete sanitizedWallet.passphrase;
    await db.put(WALLET_STORE, { ...sanitizedWallet, balanceSompi: wallet.balanceSompi.toString() });
  });
}

export async function getWalletsFromDB(): Promise<Wallet[]> {
  const result = await withDB(async (db) => {
    const raw = await db.getAll(WALLET_STORE);
    if (!Array.isArray(raw)) return [];
    return raw.map((w) => ({ ...w, balanceSompi: BigInt(w.balanceSompi || '0') }));
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
    await db.put(UTXO_STORE, utxos.map((u) => ({ ...u, amountSompi: u.amountSompi.toString() })), walletId);
  });
}

export async function getUtxosFromDB(walletId: string): Promise<UTXO[]> {
  const result = await withDB(async (db) => {
    const raw = await db.get(UTXO_STORE, walletId);
    if (!Array.isArray(raw)) return [];
    return raw.map((u: any) => ({ ...u, amountSompi: BigInt(u.amountSompi || '0') }));
  });
  return result || [];
}

export async function saveTransactionsToDB(walletId: string, txs: KaspaTransaction[]): Promise<void> {
  return withDB(async (db) => {
    await db.put(TX_STORE, txs.map((t) => ({ ...t, amountSompi: t.amountSompi.toString(), feeSompi: t.feeSompi.toString() })), walletId);
  });
}

export async function getTransactionsFromDB(walletId: string): Promise<KaspaTransaction[]> {
  const result = await withDB(async (db) => {
    const raw = await db.get(TX_STORE, walletId);
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({ ...t, amountSompi: BigInt(t.amountSompi || '0'), feeSompi: BigInt(t.feeSompi || '0') }));
  });
  return result || [];
}

function awaitDeleteDatabase(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) { resolve(true); return; }
    let settled = false;
    const finish = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => {
        setTimeout(() => {
          if (settled) return;
          try {
            const retry = window.indexedDB.deleteDatabase(name);
            retry.onsuccess = () => finish(true);
            retry.onerror = () => finish(false);
            retry.onblocked = () => finish(false);
          } catch { finish(false); }
        }, 250);
      };
      setTimeout(() => finish(false), 3000);
    } catch { finish(false); }
  });
}

export async function purgeAllDatabases(): Promise<void> {
  setPanicWipeTriggered(true);
  try {
    if (dbPromise) {
      const currentPromise = dbPromise;
      dbPromise = null;
      try {
        const db = await currentPromise;
        try {
          await db.clear(WALLET_STORE);
          await db.clear(SETTINGS_STORE);
          await db.clear(UTXO_STORE);
          await db.clear(TX_STORE);
        } catch {}
        try { db.close(); } catch {}
      } catch {}
    }

    if (typeof window !== 'undefined' && window.indexedDB) {
      const results = await Promise.all([
        awaitDeleteDatabase(DB_NAME),
        awaitDeleteDatabase('kaspriv_db_v1'),
        awaitDeleteDatabase('kaspriv_audit_db'),
      ]);
      if (results.some((ok) => !ok)) console.warn('Emergency database deletion did not fully confirm.');
    }

    try { window.localStorage?.clear(); } catch {}
    try { window.sessionStorage?.clear(); } catch {}

    try {
      if (window.navigator?.serviceWorker) {
        window.navigator.serviceWorker.controller?.postMessage('PANIC_WIPE');
        const registrations = await window.navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } catch {}

    try {
      if (window.caches) {
        const names = await window.caches.keys();
        await Promise.all(names.map((name) => window.caches.delete(name)));
      }
    } catch {}
  } finally {
    // Start a fresh document after destructive wipe so the in-memory panic gate
    // cannot accidentally prevent creation of a new wallet in this SPA session.
    if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  }
}

/** Verify that no persisted wallet record contains plaintext seed material. */
export async function auditWalletStorage(): Promise<{ ok: boolean; walletCount: number; plaintextSecretRecords: string[] }> {
  if (panicWipeTriggered) return { ok: false, walletCount: 0, plaintextSecretRecords: [] };
  try {
    const db = await getDB();
    const records = await db.getAll(WALLET_STORE);
    const plaintextSecretRecords: string[] = [];
    for (const record of records as any[]) {
      if (typeof record?.mnemonic === 'string' && record.mnemonic.length > 0) plaintextSecretRecords.push(`${record.id}:mnemonic`);
      if (typeof record?.passphrase === 'string' && record.passphrase.length > 0) plaintextSecretRecords.push(`${record.id}:passphrase`);
    }
    return { ok: plaintextSecretRecords.length === 0, walletCount: records.length, plaintextSecretRecords };
  } catch {
    return { ok: false, walletCount: 0, plaintextSecretRecords: [] };
  }
}

export async function saveSetting(key: string, value: any): Promise<void> { return withDB(async (db) => { await db.put(SETTINGS_STORE, value, key); }); }
export async function getSetting<T>(key: string): Promise<T | undefined> { return withDB(async (db) => db.get(SETTINGS_STORE, key)); }
export async function removeSetting(key: string): Promise<void> { return withDB(async (db) => { await db.delete(SETTINGS_STORE, key); }); }
