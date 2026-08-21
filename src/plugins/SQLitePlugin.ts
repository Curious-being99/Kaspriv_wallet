import { registerPlugin } from '@capacitor/core';

export interface SQLitePluginInterface {
  executeSql(options: { sql: string; params: any[] }): Promise<{ rows: any[] }>;
  clearAll(): Promise<void>;
}

export const SQLitePlugin = registerPlugin<SQLitePluginInterface>('SQLitePlugin');
