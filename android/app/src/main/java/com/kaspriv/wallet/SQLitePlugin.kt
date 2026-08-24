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

    private val scope = CoroutineScope(Dispatchers.IO)
    private val db by lazy { AppDatabase.getDatabase(context) }
    private val dao by lazy { db.appDao() }

    @PluginMethod
    fun saveWallet(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("ID is required")
        val data = call.getString("data") ?: return call.reject("Data is required")
        
        scope.launch {
            try {
                dao.saveWallet(WalletEntity(id, data))
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
                val wallets = dao.getWallets()
                val ret = JSObject()
                val walletList = mutableListOf<JSObject>()
                
                wallets.forEach {
                    val obj = JSObject().apply {
                        put("id", it.id)
                        put("value", it.value)
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
                dao.deleteWallet(id)
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
                dao.saveSetting(SettingEntity(key, value))
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
                val settings = dao.getSettings()
                val ret = JSObject()
                val settingsList = mutableListOf<JSObject>()
                
                settings.forEach {
                    val obj = JSObject().apply {
                        put("key", it.key)
                        put("value", it.value)
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
                dao.deleteSetting(key)
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
                dao.saveUtxo(UtxoEntity(walletId, data))
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
                val utxos = dao.getUtxos()
                val ret = JSObject()
                val utxoList = mutableListOf<JSObject>()
                
                utxos.forEach {
                    val obj = JSObject().apply {
                        put("walletId", it.walletId)
                        put("data", it.data)
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
                dao.saveTransaction(TransactionEntity(walletId, data))
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
                val txs = dao.getTransactions()
                val ret = JSObject()
                val txList = mutableListOf<JSObject>()
                
                txs.forEach {
                    val obj = JSObject().apply {
                        put("walletId", it.walletId)
                        put("data", it.data)
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
}
