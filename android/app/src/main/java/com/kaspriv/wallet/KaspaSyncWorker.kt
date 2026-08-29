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

                // Check which addresses are actually active to prevent rate limits
                val activeAddresses = fetchActiveAddresses(db, ownedAddresses)
                val isFirstSyncForWallet = !initializedWallets.contains(wEntity.id)

                val ownedLower = ownedAddresses.map { it.lowercase() }.toSet()
                var totalWalletSompi = 0L
                val addressBalanceMap = mutableMapOf<String, String>()
                var hasBalanceUpdate = false

                // Process active addresses and synchronize balances & transactions
                for (addr in activeAddresses) {
                    val addrBal: Long? = fetchBalanceForAddress(db, addr)
                    val txs: List<JSONObject> = fetchRecentTransactionsForAddress(db, addr)
                    
                    if (addrBal != null) {
                        val balanceSompi: Long = addrBal.toLong()
                        totalWalletSompi = totalWalletSompi + balanceSompi
                        addressBalanceMap[addr] = balanceSompi.toString()
                        hasBalanceUpdate = true
                    }

                    val now = System.currentTimeMillis()

                    for (tx in txs) {
                        val txid = tx.optString("transaction_id", "").ifEmpty { tx.optString("txid", "") }
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
                            var blockTime = if (tx.has("block_time")) tx.getLong("block_time") else 0L
                            if (blockTime == 0L) {
                                blockTime = if (tx.has("timestamp")) tx.getLong("timestamp") else 0L
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

                            val outputs: JSONArray? = tx.optJSONArray("outputs")
                            if (outputs != null) {
                                for (i in 0 until outputs.length()) {
                                    val outObj: JSONObject? = outputs.optJSONObject(i)
                                    if (outObj == null) {
                                        continue
                                    }
                                    val outAddr: String =
                                        outObj.optString("script_public_key_address", "").lowercase()
                                    val amountSompi: Long =
                                        outObj.optLong("amount", 0L)
                                    if (ownedLower.contains(outAddr)) {
                                        incomingSompi += amountSompi
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
                                    title = "Received Kaspa \uD83DFE2",
                                    message = "+$formatted KAS received on $shortAddr",
                                    txid = txid,
                                    type = "receive"
                                )
                            }
                            notifiedSet.add(txid)
                        }
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

    private suspend fun getApiUrlFromDb(db: AppDatabase): String {
        return try {
            val setting = db.settingDao().getByKey("kaspa_api_url")
            if (setting != null) {
                val json = JSONObject(setting.value)
                val url = json.optString("value")
                if (url.isNotEmpty()) {
                    return url.trim().removeSuffix("/")
                }
            }
            "https://api.kaspa.org"
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load kaspa_api_url from DB, falling back to default: ${e.message}")
            "https://api.kaspa.org"
        }
    }

    private suspend fun fetchRecentTransactionsForAddress(db: AppDatabase, address: String): List<JSONObject> {
        val primaryApi = getApiUrlFromDb(db)
        val allTx = mutableListOf<JSONObject>()
        var before: String? = null

        for (page in 0 until 100) {
            val endpoints = mutableListOf<String>()
            val queryParams = if (before != null) "limit=500&resolve_previous_outpoints=light&before=$before" else "limit=500&resolve_previous_outpoints=light"
            
            endpoints.add("$primaryApi/addresses/$address/full-transactions-page?$queryParams")
            if (primaryApi != "https://api.kaspa.org") {
                endpoints.add("https://api.kaspa.org/addresses/$address/full-transactions-page?$queryParams")
            }
            endpoints.add("https://api-mainnet.kaspa.org/addresses/$address/full-transactions-page?$queryParams")

            var pageSuccess = false
            for (endpoint in endpoints.distinct()) {
                for (attempt in 0..2) {
                    var conn: HttpURLConnection? = null
                    try {
                        val url = URL(endpoint)
                        conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "GET"
                        conn.connectTimeout = 8000
                        conn.readTimeout = 8000
                        conn.setRequestProperty("Accept", "application/json")
                        conn.setRequestProperty("User-Agent", "KasprivWallet-BackgroundSync/1.2")

                        if (conn.responseCode == 429) {
                            if (attempt < 2) {
                                val retryAfterStr = conn.getHeaderField("Retry-After")
                                val retryAfter = retryAfterStr?.toLongOrNull() ?: (1L shl attempt)
                                val delay = minOf(maxOf(retryAfter, 1L), 15L)
                                kotlinx.coroutines.delay(delay * 1000)
                                continue
                            } else {
                                break
                            }
                        }

                        if (conn.responseCode in 200..299) {
                            val reader = BufferedReader(InputStreamReader(conn.inputStream))
                            val sb = java.lang.StringBuilder()
                            var line: String?
                            while (reader.readLine().also { line = it } != null) {
                                sb.append(line)
                            }
                            reader.close()

                            val resArray = JSONArray(sb.toString())
                            for (i in 0 until resArray.length()) {
                                val obj = resArray.optJSONObject(i)
                                if (obj != null) allTx.add(obj)
                            }
                            
                            val nextBefore = conn.getHeaderField("X-Next-Page-Before")
                            if (!nextBefore.isNullOrEmpty() && nextBefore != before) {
                                before = nextBefore
                                pageSuccess = true
                            } else {
                                // No more pages
                                return allTx
                            }
                            break // Break attempt loop
                        } else {
                            break // Non-429 error, try next endpoint
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Endpoint $endpoint failed: ${e.message}")
                        break
                    } finally {
                        conn?.disconnect()
                    }
                }
                if (pageSuccess) break // Break endpoint loop, continue to next page
            }
            if (!pageSuccess) {
                // If we failed to fetch a page from all endpoints, return what we have
                break
            }
        }
        return allTx
    }

    private suspend fun fetchActiveAddresses(db: AppDatabase, addresses: List<String>): List<String> {
        val primaryApi = getApiUrlFromDb(db)
        val activeList = mutableListOf<String>()
        
        // Chunk requests to avoid payload size issues
        val chunks = addresses.chunked(250)
        for (chunk in chunks) {
            val jsonPayload = JSONObject().apply {
                put("addresses", JSONArray(chunk))
            }.toString()

            val endpoints = mutableListOf("$primaryApi/addresses/active")
            if (primaryApi != "https://api.kaspa.org") {
                endpoints.add("https://api.kaspa.org/addresses/active")
            }
            endpoints.add("https://api-mainnet.kaspa.org/addresses/active")

            for (endpoint in endpoints.distinct()) {
                var success = false
                for (attempt in 0..2) {
                    var conn: HttpURLConnection? = null
                    try {
                        val url = URL(endpoint)
                        conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.connectTimeout = 8000
                        conn.readTimeout = 8000
                        conn.setRequestProperty("Accept", "application/json")
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.setRequestProperty("User-Agent", "KasprivWallet-BackgroundSync/1.2")
                        conn.doOutput = true

                        conn.outputStream.use { os ->
                            val input = jsonPayload.toByteArray(Charsets.UTF_8)
                            os.write(input, 0, input.size)
                        }

                        if (conn.responseCode == 429) {
                            if (attempt < 2) {
                                val retryAfterStr = conn.getHeaderField("Retry-After")
                                val retryAfter = retryAfterStr?.toLongOrNull() ?: (1L shl attempt)
                                val delay = minOf(maxOf(retryAfter, 1L), 15L)
                                kotlinx.coroutines.delay(delay * 1000)
                                continue
                            } else {
                                break
                            }
                        }

                        if (conn.responseCode in 200..299) {
                            val reader = BufferedReader(InputStreamReader(conn.inputStream))
                            val sb = java.lang.StringBuilder()
                            var line: String?
                            while (reader.readLine().also { line = it } != null) {
                                sb.append(line)
                            }
                            reader.close()

                            val resArray = JSONArray(sb.toString())
                            for (i in 0 until resArray.length()) {
                                val obj = resArray.optJSONObject(i)
                                if (obj?.optBoolean("active") == true) {
                                    val addr = obj.optString("address")
                                    if (addr.isNotEmpty()) activeList.add(addr)
                                }
                            }
                            success = true
                            break
                        } else {
                            break // Try next endpoint
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Endpoint $endpoint failed: ${e.message}")
                        break
                    } finally {
                        conn?.disconnect()
                    }
                }
                if (success) break
            }
        }
        return activeList.distinct()
    }

    private suspend fun fetchBalanceForAddress(db: AppDatabase, address: String): Long? {
        val primaryApi = getApiUrlFromDb(db)
        val endpoints = mutableListOf(
            "$primaryApi/addresses/$address/balance"
        )
        if (primaryApi != "https://api.kaspa.org") {
            endpoints.add("https://api.kaspa.org/addresses/$address/balance")
        }
        endpoints.add("https://api-mainnet.kaspa.org/addresses/$address/balance")

        for (endpoint in endpoints.distinct()) {
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
                    val balVal = if (json.has("balance")) json.getLong("balance") else -1L
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
