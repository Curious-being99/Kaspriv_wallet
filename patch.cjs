const fs = require('fs');
let code = fs.readFileSync('src/utils/storage.ts', 'utf8');

const replacement = `import { Wallet, UTXO, KaspaTransaction } from '../types';
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
 * High-performance, compile-safe Relational SQLite Database Driver.
 * Strictly linked to Android Jetpack Room with direct native bridge queries.
 * Seamless IDB fallback for web preview persistence.
 */
class SQLiteDatabase {
  private initialized = false;
  
  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      if (IS_NATIVE) {
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
    if (IS_NATIVE) {
      const res = await SQLitePlugin.executeSql({ sql, params });
      return { rows: res?.rows || [] };
    }
    
    // Web Fallback implementation using IDB
    if (!webDbPromise) return { rows: [] };
    try {
      const db = await webDbPromise;
      if (sql.startsWith('INSERT OR REPLACE INTO')) {
        const tableMatch = sql.match(/INTO\\s+(\\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const keyName = table === 'settings' ? 'key' : (table === 'wallets' ? 'id' : 'walletId');
          const dataName = (table === 'settings' || table === 'wallets') ? 'value' : 'data';
          await db.put(table, { [keyName]: params[0], [dataName]: params[1] });
        }
      } else if (sql.startsWith('SELECT * FROM')) {
        const tableMatch = sql.match(/FROM\\s+(\\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const whereMatch = sql.match(/WHERE\\s+(\\w+)\\s*=/i);
          if (whereMatch) {
            const val = await db.get(table, params[0]);
            return { rows: val ? [val] : [] };
          } else {
            const all = await db.getAll(table);
            return { rows: all };
          }
        }
      } else if (sql.startsWith('DELETE FROM')) {
        const tableMatch = sql.match(/FROM\\s+(\\w+)/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const whereMatch = sql.match(/WHERE\\s+(\\w+)\\s*=/i);
          if (whereMatch) {
            await db.delete(table, params[0]);
          } else {
            await db.clear(table);
          }
        }
      }
    } catch (e) {
      console.warn('IDB fallback error:', e);
    }
    return { rows: [] };
  }

  public async clearAll(): Promise<void> {
    if (IS_NATIVE) {
      await SQLitePlugin.clearAll();
    } else if (webDbPromise) {
      try {
        const db = await webDbPromise;
        await Promise.all([
          db.clear('wallets'),
          db.clear('settings'),
          db.clear('utxos'),
          db.clear('transactions')
        ]);
      } catch (e) {}
    }
  }
}
`;

code = code.replace(/import \{ Wallet, UTXO, KaspaTransaction \} from '\.\.\/types';[\s\S]*?class SQLiteDatabase \{[\s\S]*?public async clearAll\(\): Promise<void> \{[\s\S]*?\}[\s\S]*?\}/, replacement);
fs.writeFileSync('src/utils/storage.ts', code);
