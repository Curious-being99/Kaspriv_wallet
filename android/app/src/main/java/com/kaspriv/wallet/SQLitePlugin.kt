package com.kaspriv.wallet

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "SQLite")
class SQLitePlugin : Plugin() {

    private class DatabaseHelper(context: Context) :
        SQLiteOpenHelper(context, "kaspriv_wallet_native.db", null, 1) {

        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS wallets (" +
                    "id TEXT PRIMARY KEY NOT NULL, " +
                    "value TEXT" +
                ")"
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS settings (" +
                    "key TEXT PRIMARY KEY NOT NULL, " +
                    "value TEXT" +
                ")"
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS utxos (" +
                    "walletId TEXT PRIMARY KEY NOT NULL, " +
                    "data TEXT" +
                ")"
            )
            db.execSQL(
                "CREATE TABLE IF NOT EXISTS transactions (" +
                    "walletId TEXT PRIMARY KEY NOT NULL, " +
                    "data TEXT" +
                ")"
            )
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            db.execSQL("DROP TABLE IF EXISTS wallets")
            db.execSQL("DROP TABLE IF EXISTS settings")
            db.execSQL("DROP TABLE IF EXISTS utxos")
            db.execSQL("DROP TABLE IF EXISTS transactions")
            onCreate(db)
        }
    }

    private val dbHelper by lazy { DatabaseHelper(context) }
    private val scope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun saveWallet(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("ID is required")
        val data = call.getString("data") ?: return call.reject("Data is required")

        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                val values = ContentValues().apply {
                    put("id", id)
                    put("value", data)
                }
                db.insertWithOnConflict("wallets", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to save wallet: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getWallets(call: PluginCall) {
        scope.launch {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.rawQuery("SELECT id, value FROM wallets", null)
                val ret = JSObject()
                val walletList = mutableListOf<JSObject>()
                
                cursor.use {
                    while (it.moveToNext()) {
                        val obj = JSObject().apply {
                            put("id", it.getString(0))
                            put("value", it.getString(1))
                        }
                        walletList.add(obj)
                    }
                }
                ret.put("wallets", walletList)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to fetch wallets: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun deleteWallet(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("ID is required")
        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                db.delete("wallets", "id = ?", arrayOf(id))
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to delete wallet: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun saveSetting(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("Key is required")
        val value = call.getString("value") ?: return call.reject("Value is required")

        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                val values = ContentValues().apply {
                    put("key", key)
                    put("value", value)
                }
                db.insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to save setting: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getSettings(call: PluginCall) {
        scope.launch {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.rawQuery("SELECT key, value FROM settings", null)
                val ret = JSObject()
                val settingsList = mutableListOf<JSObject>()
                
                cursor.use {
                    while (it.moveToNext()) {
                        val obj = JSObject().apply {
                            put("key", it.getString(0))
                            put("value", it.getString(1))
                        }
                        settingsList.add(obj)
                    }
                }
                ret.put("settings", settingsList)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to fetch settings: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun deleteSetting(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("Key is required")
        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                db.delete("settings", "key = ?", arrayOf(key))
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to delete setting: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun saveUtxo(call: PluginCall) {
        val walletId = call.getString("walletId") ?: return call.reject("Wallet ID is required")
        val data = call.getString("data") ?: return call.reject("Data is required")

        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                val values = ContentValues().apply {
                    put("walletId", walletId)
                    put("data", data)
                }
                db.insertWithOnConflict("utxos", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to save UTXO: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getUtxos(call: PluginCall) {
        scope.launch {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.rawQuery("SELECT walletId, data FROM utxos", null)
                val ret = JSObject()
                val utxoList = mutableListOf<JSObject>()
                
                cursor.use {
                    while (it.moveToNext()) {
                        val obj = JSObject().apply {
                            put("walletId", it.getString(0))
                            put("data", it.getString(1))
                        }
                        utxoList.add(obj)
                    }
                }
                ret.put("utxos", utxoList)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to fetch UTXOs: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun saveTransaction(call: PluginCall) {
        val walletId = call.getString("walletId") ?: return call.reject("Wallet ID is required")
        val data = call.getString("data") ?: return call.reject("Data is required")

        scope.launch {
            try {
                val db = dbHelper.writableDatabase
                val values = ContentValues().apply {
                    put("walletId", walletId)
                    put("data", data)
                }
                db.insertWithOnConflict("transactions", null, values, SQLiteDatabase.CONFLICT_REPLACE)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to save transaction: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getTransactions(call: PluginCall) {
        scope.launch {
            try {
                val db = dbHelper.readableDatabase
                val cursor = db.rawQuery("SELECT walletId, data FROM transactions", null)
                val ret = JSObject()
                val txList = mutableListOf<JSObject>()
                
                cursor.use {
                    while (it.moveToNext()) {
                        val obj = JSObject().apply {
                            put("walletId", it.getString(0))
                            put("data", it.getString(1))
                        }
                        txList.add(obj)
                    }
                }
                ret.put("transactions", txList)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to fetch transactions: ${e.message}")
            }
        }
    }
}
