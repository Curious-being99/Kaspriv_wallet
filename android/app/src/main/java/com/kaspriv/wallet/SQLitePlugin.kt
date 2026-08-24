package com.kaspriv.wallet

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

    private val db by lazy { AppDatabase.getDatabase(context) }
    private val scope = CoroutineScope(Dispatchers.IO)

    @PluginMethod
    fun saveWallet(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("ID is required")
        val data = call.getString("data") ?: return call.reject("Data is required")

        scope.launch {
            try {
                db.walletDao().insert(WalletEntity(id, data))
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
                val list = db.walletDao().getAll()
                val ret = JSObject()
                val walletList = mutableListOf<JSObject>()
                
                for (item in list) {
                    val obj = JSObject().apply {
                        put("id", item.id)
                        put("value", item.value)
                    }
                    walletList.add(obj)
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
                db.walletDao().deleteById(id)
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
                db.settingDao().insert(SettingEntity(key, value))
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
                val list = db.settingDao().getAll()
                val ret = JSObject()
                val settingsList = mutableListOf<JSObject>()
                
                for (item in list) {
                    val obj = JSObject().apply {
                        put("key", item.key)
                        put("value", item.value)
                    }
                    settingsList.add(obj)
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
                db.settingDao().deleteByKey(key)
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
                db.utxoDao().insert(UtxoEntity(walletId, data))
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
                val list = db.utxoDao().getAll()
                val ret = JSObject()
                val utxoList = mutableListOf<JSObject>()
                
                for (item in list) {
                    val obj = JSObject().apply {
                        put("walletId", item.walletId)
                        put("data", item.data)
                    }
                    utxoList.add(obj)
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
                db.transactionDao().insert(TransactionEntity(walletId, data))
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
                val list = db.transactionDao().getAll()
                val ret = JSObject()
                val txList = mutableListOf<JSObject>()
                
                for (item in list) {
                    val obj = JSObject().apply {
                        put("walletId", item.walletId)
                        put("data", item.data)
                    }
                    txList.add(obj)
                }
                ret.put("transactions", txList)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to fetch transactions: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        scope.launch {
            try {
                db.walletDao().deleteAll()
                db.settingDao().deleteAll()
                db.utxoDao().deleteAll()
                db.transactionDao().deleteAll()
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to clear Room database: ${e.message}")
            }
        }
    }
}

