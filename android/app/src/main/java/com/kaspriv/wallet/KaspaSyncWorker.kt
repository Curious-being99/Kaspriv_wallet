package com.kaspriv.wallet

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * KaspaSyncWorker
 *
 * Decentralized, background worker for Android.
 * Runs on OS-scheduled intervals (WorkManager) even when the user has exited
 * or minimized the Kaspriv Wallet app.
 *
 * Checks on-chain transactions directly from Kaspa node endpoints,
 * detecting incoming funds and sent transactions to trigger OS Heads-Up alerts.
 */
class KaspaSyncWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "KaspaSyncWorker"
        private const val WORK_NAME = "KaspaDecentralizedSyncWork"
        private const val PREFS_NAME = "kaspriv_notification_cache"
        private const val KEY_NOTIFIED_TXIDS = "notified_txids_set"

        /**
         * Schedules periodic background sync every 15 minutes (minimum Android OS interval)
         * with network connectivity constraints.
         */
        fun schedulePeriodicSync(context: Context) {
            try {
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()

                val workRequest = PeriodicWorkRequestBuilder<KaspaSyncWorker>(
                    15, TimeUnit.MINUTES,
                    5, TimeUnit.MINUTES // Flex interval
                )
                    .setConstraints(constraints)
                    .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    workRequest
                )
                Log.d(TAG, "Decentralized background sync enqueued successfully.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule background sync: ${e.message}", e)
            }
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val db = AppDatabase.getDatabase(context)
            
            // 1. Verify if user has enabled notifications
            val notifSetting = db.settingDao().getByKey("kaspa_notifications_enabled")
            val isEnabled = notifSetting?.value?.toBooleanStrictOrNull() ?: true
            if (!isEnabled) {
                Log.d(TAG, "Notifications disabled by user in settings. Skipping background sync.")
                return@withContext Result.success()
            }

            // 2. Fetch all stored wallets from native Room DB
            val walletEntities = db.walletDao().getAll()
            if (walletEntities.isEmpty()) {
                Log.d(TAG, "No wallets found in Room DB. Skipping.")
                return@withContext Result.success()
            }

            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val notifiedSet = prefs.getStringSet(KEY_NOTIFIED_TXIDS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
            val initializedWallets = prefs.getStringSet("initialized_wallets_set", mutableSetOf())?.toMutableSet() ?: mutableSetOf()

            // Collect all owned addresses across all wallets and synchronize balance & transactions
            for (wEntity in walletEntities) {
                val ownedAddresses = extractOwnedAddresses(wEntity.value)
                if (ownedAddresses.isEmpty()) continue

                val isFirstSyncForWallet = !initializedWallets.contains(wEntity.id)

                val ownedLower = ownedAddresses.map { it.lowercase() }.toSet()
                var totalWalletSompi = 0L
                val addressBalanceMap = mutableMapOf<String, String>()
                var hasBalanceUpdate = false

                for (addr in ownedAddresses) {
                    // Fetch live address balance for flawless state sync
                    val addrBal = fetchBalanceForAddress(addr)
                    if (addrBal != null) {
                        totalWalletSompi += addrBal
                        addressBalanceMap[addr] = addrBal.toString()
                        hasBalanceUpdate = true
                    }

                    val txs = fetchRecentTransactionsForAddress(addr)
                    val now = System.currentTimeMillis()

                    for (tx in txs) {
                        val txid = tx.optString("transaction_id").ifEmpty { tx.optString("txid") }
                        if (txid.isEmpty() || notifiedSet.contains(txid)) {
                            continue
                        }

                        // On the first background sync pass for a restored or new wallet,
                        // swallow all existing historical transactions into notifiedSet quietly.
                        if (isFirstSyncForWallet) {
                            notifiedSet.add(txid)
                            continue
                        }

                        // Verify transaction age from block_time or timestamp
                        var blockTime = tx.optLong("block_time", 0L)
                        if (blockTime == 0L) {
                            blockTime = tx.optLong("timestamp", 0L)
                        }
                        if (blockTime in 1..9999999999L) {
                            blockTime *= 1000L
                        }

                        val isRecentTx = blockTime > 0 && (now - blockTime) < 900_000L // within 15 mins

                        // Ignore old historical transactions
                        if (!isRecentTx) {
                            notifiedSet.add(txid)
                            continue
                        }

                        // Determine if incoming receive funds
                        var incomingSompi = 0L
                        var isReceive = false

                        val outputs = tx.optJSONArray("outputs")
                        if (outputs != null) {
                            for (i in 0 until outputs.length()) {
                                val outObj = outputs.optJSONObject(i) ?: continue
                                val outAddr = outObj.optString("script_public_key_address").lowercase()
                                val amt = outObj.optLong("amount", 0L)
                                if (ownedLower.contains(outAddr)) {
                                    incomingSompi += amt
                                    isReceive = true
                                }
                            }
                        }

                        // Strictly notify ONLY for recent incoming receive transactions
                        if (isReceive && incomingSompi > 0) {
                            val kasAmount = incomingSompi.toDouble() / 100_000_000.0
                            val shortAddr = if (addr.length > 18) "${addr.take(10)}...${addr.takeLast(6)}" else addr
                            val formatted = String.format("%.4f", kasAmount).trimEnd('0').trimEnd('.')

                            DecentralizedNotificationPlugin.showNativeNotification(
                                context = context,
                                title = "Received Kaspa 🟢",
                                message = "+$formatted KAS received on $shortAddr",
                                txid = txid,
                                type = "receive"
                            )
                        }
                        notifiedSet.add(txid)
                    }
                }

                // If live balance was fetched, update Room DB wallet record for instantaneous synchronization
                if (hasBalanceUpdate) {
                    try {
                        val walletJson = JSONObject(wEntity.value)
                        walletJson.put("balanceSompi", totalWalletSompi.toString())
                        val addrBalObj = JSONObject()
                        for ((k, v) in addressBalanceMap) {
                            addrBalObj.put(k, v)
                        }
                        walletJson.put("addressBalances", addrBalObj)
                        db.walletDao().insert(WalletEntity(wEntity.id, walletJson.toString()))
                        Log.d(TAG, "Synchronized wallet ${wEntity.id} balance in Room DB: $totalWalletSompi sompi")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to update wallet balance in Room DB: ${e.message}")
                    }
                }
                if (isFirstSyncForWallet) {
                    initializedWallets.add(wEntity.id)
                }
            }

            // Save updated notified set & initialized wallets
            val editor = prefs.edit()
            editor.putStringSet("initialized_wallets_set", initializedWallets)
            if (notifiedSet.size > 1000) {
                val trimmed = notifiedSet.toList().takeLast(500).toSet()
                editor.putStringSet(KEY_NOTIFIED_TXIDS, trimmed)
            } else {
                editor.putStringSet(KEY_NOTIFIED_TXIDS, notifiedSet)
            }
            editor.apply()

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Error in Kaspa background sync: ${e.message}", e)
            Result.retry()
        }
    }

    private fun extractOwnedAddresses(walletJson: String): List<String> {
        val list = mutableListOf<String>()
        try {
            val json = JSONObject(walletJson)
            val receive = json.optString("receiveAddress")
            if (receive.isNotEmpty()) list.add(receive)

            val change = json.optString("changeAddress")
            if (change.isNotEmpty()) list.add(change)

            val discovered = json.optJSONArray("discoveredAddresses")
            if (discovered != null) {
                for (i in 0 until discovered.length()) {
                    val item = discovered.opt(i)
                    if (item is String && item.isNotEmpty()) {
                        list.add(item)
                    } else if (item is JSONObject) {
                        val a = item.optString("address")
                        if (a.isNotEmpty()) list.add(a)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error parsing wallet JSON: ${e.message}")
        }
        return list.distinct()
    }

    private fun fetchRecentTransactionsForAddress(address: String): List<JSONObject> {
        val endpoints = listOf(
            "https://api.kaspa.org/addresses/$address/full-transactions?limit=10&resolve_previous_outpoints=light",
            "https://api-mainnet.kaspa.org/addresses/$address/full-transactions?limit=10&resolve_previous_outpoints=light"
        )

        for (endpoint in endpoints) {
            var conn: HttpURLConnection? = null
            try {
                val url = URL(endpoint)
                conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("User-Agent", "KasprivWallet-BackgroundSync/1.2")

                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val sb = java.lang.StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        sb.append(line)
                    }
                    reader.close()

                    val resArray = JSONArray(sb.toString())
                    val txList = mutableListOf<JSONObject>()
                    for (i in 0 until resArray.length()) {
                        val obj = resArray.optJSONObject(i)
                        if (obj != null) txList.add(obj)
                    }
                    return txList
                }
            } catch (e: Exception) {
                Log.w(TAG, "Endpoint $endpoint failed: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
        return emptyList()
    }

    private fun fetchBalanceForAddress(address: String): Long? {
        val endpoints = listOf(
            "https://api.kaspa.org/addresses/$address/balance",
            "https://api-mainnet.kaspa.org/addresses/$address/balance"
        )

        for (endpoint in endpoints) {
            var conn: HttpURLConnection? = null
            try {
                val url = URL(endpoint)
                conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 6000
                conn.readTimeout = 6000
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("User-Agent", "KasprivWallet-BackgroundSync/1.2")

                if (conn.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val sb = java.lang.StringBuilder()
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        sb.append(line)
                    }
                    reader.close()

                    val json = JSONObject(sb.toString())
                    val balVal = json.optLong("balance", -1L)
                    if (balVal >= 0) {
                        return balVal
                    }
                } else if (conn.responseCode == 404 || conn.responseCode == 400) {
                    return 0L
                }
            } catch (e: Exception) {
                Log.w(TAG, "Balance endpoint $endpoint failed: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
        return null
    }
}
