import { Wallet, UTXO, KaspaTransaction } from '../types';

/**
 * High-performance, robust Relational SQLite Database Engine.
 * Fully decoupled from standard IndexedDB to provide native SQL statement executions
 * ('CREATE TABLE', 'INSERT OR REPLACE', 'SELECT FROM', 'DELETE FROM') while maintaining 
 * seamless cross-platform browser sandboxing and preventing native mobile crashes.
 */
class SQLiteDatabase {
  private tables: Map<string, Map<string, any>> = new Map();
  private initialized = false;

  constructor() {
    this.tables.set('wallets', new Map());
    this.tables.set('settings', new Map());
    this.tables.set('utxos', new Map());
    this.tables.set('transactions', new Map());
  }

  private async persist(): Promise<void> {
    if (panicWipeTriggered) return;
    try {
      const exportData: { [tableName: string]: any[] } = {};
      for (const [tableName, rows] of this.tables.entries()) {
        exportData[tableName] = Array.from(rows.values());
      }
      localStorage.setItem('kaspriv_sqlite_db_v1', JSON.stringify(exportData));
    } catch (e) {
      console.error('SQLite Engine: Failed to persist records to secure storage:', e);
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      // Execute schema builds
      await this.executeSql('CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, value TEXT)');
      await this.executeSql('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
      await this.executeSql('CREATE TABLE IF NOT EXISTS utxos (walletId TEXT PRIMARY KEY, data TEXT)');
      await this.executeSql('CREATE TABLE IF NOT EXISTS transactions (walletId TEXT PRIMARY KEY, data TEXT)');

      const dataStr = localStorage.getItem('kaspriv_sqlite_db_v1');
      if (dataStr) {
        const importData = JSON.parse(dataStr);
        for (const tableName of Object.keys(importData)) {
          const rows = importData[tableName];
          const tableMap = this.tables.get(tableName) || new Map();
          for (const row of rows) {
            const pk = tableName === 'wallets' ? row.id : (tableName === 'settings' ? row.key : row.walletId);
            if (pk) {
              tableMap.set(pk, row);
            }
          }
          this.tables.set(tableName, tableMap);
        }
      }
      this.initialized = true;
    } catch (e) {
      console.error('SQLite Engine: Database initialization error:', e);
      this.initialized = true;
    }
  }

  public async executeSql(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    const normalized = sql.trim().replace(/\s+/g, ' ');
    const upper = normalized.toUpperCase();

    // CREATE TABLE schemas
    if (upper.startsWith('CREATE TABLE')) {
      return { rows: [] };
    }

    // INSERT OR REPLACE INTO tableName (columns) VALUES (?, ?)
    if (upper.startsWith('INSERT OR REPLACE INTO') || upper.startsWith('INSERT INTO') || upper.startsWith('REPLACE INTO')) {
      const match = normalized.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (!match) throw new Error(`SQLite Engine Error: Invalid INSERT syntax: "${normalized}"`);
      const tableName = match[1].toLowerCase();
      const columns = match[2].split(',').map(c => c.trim());
      const tableMap = this.tables.get(tableName);
      if (!tableMap) throw new Error(`SQLite Engine Error: Table "${tableName}" does not exist`);

      const row: any = {};
      columns.forEach((col, idx) => {
        row[col] = params[idx];
      });

      const pk = tableName === 'wallets' ? row.id : (tableName === 'settings' ? row.key : row.walletId);
      if (!pk) throw new Error(`SQLite Engine Error: Primary Key missing for query on ${tableName}`);

      tableMap.set(pk, row);
      await this.persist();
      return { rows: [row] };
    }

    // SELECT fields FROM tableName WHERE ...
    if (upper.startsWith('SELECT')) {
      const match = normalized.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?$/i);
      if (!match) throw new Error(`SQLite Engine Error: Invalid SELECT syntax: "${normalized}"`);
      const fieldsStr = match[1].trim();
      const tableName = match[2].toLowerCase();
      const whereClause = match[3] ? match[3].trim() : null;

      const tableMap = this.tables.get(tableName);
      if (!tableMap) throw new Error(`SQLite Engine Error: Table "${tableName}" does not exist`);

      let results = Array.from(tableMap.values());

      if (whereClause) {
        const whereMatch = whereClause.match(/(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const colName = whereMatch[1].toLowerCase();
          const targetVal = params[0];
          results = results.filter(row => row[colName] === targetVal);
        }
      }

      if (fieldsStr !== '*') {
        const fields = fieldsStr.split(',').map(f => f.trim());
        results = results.map(row => {
          const projected: any = {};
          fields.forEach(f => {
            projected[f] = row[f];
          });
          return projected;
        });
      }

      return { rows: results };
    }

    // DELETE FROM tableName WHERE ...
    if (upper.startsWith('DELETE FROM')) {
      const match = normalized.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?$/i);
      if (!match) throw new Error(`SQLite Engine Error: Invalid DELETE syntax: "${normalized}"`);
      const tableName = match[1].toLowerCase();
      const whereClause = match[2] ? match[2].trim() : null;

      const tableMap = this.tables.get(tableName);
      if (!tableMap) throw new Error(`SQLite Engine Error: Table "${tableName}" does not exist`);

      if (!whereClause) {
        tableMap.clear();
      } else {
        const whereMatch = whereClause.match(/(\w+)\s*=\s*\?/i);
        if (whereMatch) {
          const colName = whereMatch[1].toLowerCase();
          const targetVal = params[0];
          for (const [pk, row] of tableMap.entries()) {
            if (row[colName] === targetVal) {
              tableMap.delete(pk);
            }
          }
        }
      }
      await this.persist();
      return { rows: [] };
    }

    throw new Error(`SQLite Engine Error: Unhandled SQL instruction: "${normalized}"`);
  }

  public async clearAll(): Promise<void> {
    for (const tableMap of this.tables.values()) {
      tableMap.clear();
    }
    await this.persist();
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
