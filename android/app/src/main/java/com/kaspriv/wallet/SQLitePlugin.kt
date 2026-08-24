package com.kaspriv.wallet

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.kaspriv.wallet.room.AppDatabase
import com.kaspriv.wallet.room.WalletEntity
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
                val wallet = WalletEntity(
                    id = id,
                    value = data
                )
                db.walletDao().insertWallet(wallet)
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
                val wallets = db.walletDao().getAllWallets()
                val ret = JSObject()
                val walletList = wallets.map { wallet ->
                    JSObject().apply {
                        put("id", wallet.id)
                        put("value", wallet.value)
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
                db.walletDao().deleteWallet(id)
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
                val setting = SettingEntity(key = key, value = value)
                db.walletDao().insertSetting(setting)
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
                val settings = db.walletDao().getAllSettings()
                val ret = JSObject()
                val settingsList = settings.map { setting ->
                    JSObject().apply {
                        put("key", setting.key)
                        put("value", setting.value)
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
                db.walletDao().deleteSetting(key)
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
                val utxo = UtxoEntity(walletId = walletId, data = data)
                db.walletDao().insertUtxo(utxo)
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
                val utxos = db.walletDao().getAllUtxos()
                val ret = JSObject()
                val utxoList = utxos.map { utxo ->
                    JSObject().apply {
                        put("walletId", utxo.walletId)
                        put("data", utxo.data)
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
                val tx = TransactionEntity(walletId = walletId, data = data)
                db.walletDao().insertTransaction(tx)
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
                val txs = db.walletDao().getAllTransactions()
                val ret = JSObject()
                val txList = txs.map { tx ->
                    JSObject().apply {
                        put("walletId", tx.walletId)
                        put("data", tx.data)
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
