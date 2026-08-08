import { openDB, IDBPDatabase } from 'idb';
import { Wallet } from '../types';

const DB_NAME = 'kaspriv_db';
const WALLET_STORE = 'wallets';
const SETTINGS_STORE = 'settings';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(WALLET_STORE)) {
          db.createObjectStore(WALLET_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveWalletToDB(wallet: Wallet) {
  const db = await getDB();
  // Zero-Trust IDB Guard: Ensure plaintext seeds or passphrases are never written to IDB
  const sanitizedWallet = { ...wallet };
  delete sanitizedWallet.mnemonic;
  delete sanitizedWallet.passphrase;

  await db.put(WALLET_STORE, {
    ...sanitizedWallet,
    balanceSompi: wallet.balanceSompi.toString(), // Convert BigInt to string for DB storage
  });
}

export async function getWalletsFromDB(): Promise<Wallet[]> {
  const db = await getDB();
  const rawWallets = await db.getAll(WALLET_STORE);
  return rawWallets.map((w) => ({
    ...w,
    balanceSompi: BigInt(w.balanceSompi),
  }));
}

export async function deleteWalletFromDB(id: string) {
  const db = await getDB();
  await db.delete(WALLET_STORE, id);
}

export async function clearAllWalletsFromDB() {
  const db = await getDB();
  await db.clear(WALLET_STORE);
  await db.clear(SETTINGS_STORE);
}

export async function saveSetting(key: string, value: any) {
  const db = await getDB();
  await db.put(SETTINGS_STORE, value, key);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(SETTINGS_STORE, key);
}

export async function removeSetting(key: string) {
  const db = await getDB();
  await db.delete(SETTINGS_STORE, key);
}
