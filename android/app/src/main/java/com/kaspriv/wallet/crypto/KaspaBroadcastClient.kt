package com.kaspriv.wallet.crypto

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class KaspaBroadcastClient(private val nodeRpcUrl: String = "https://api.kaspa.org") {

    /**
     * Broadcasts a signed Kaspa raw transaction to the Kaspa REST/RPC gateway.
     * Supports both standard REST (`/transactions` or `/v1/transaction/submit`) and JSON-RPC (`submitTransactionRequest`).
     */
    suspend fun submitTransaction(signedTx: KaspaRawTransaction): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            // Standard Kaspa API and rusty-kaspa rest endpoints
            val normalizedUrl = nodeRpcUrl.trimEnd('/')
            val endpointUrl = if (normalizedUrl.endsWith("/v1/transaction/submit") || normalizedUrl.endsWith("/transactions")) {
                normalizedUrl
            } else {
                "$normalizedUrl/transactions"
            }

            val endpoint = URL(endpointUrl)
            val conn = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 12_000
                readTimeout = 15_000
            }

            // Construct Transaction JSON Payload conforming to Kaspa consensus schema
            val txJson = JSONObject().apply {
                put("version", signedTx.version)

                // Inputs Array
                val inputsArray = JSONArray()
                for (input in signedTx.inputs) {
                    val inputObj = JSONObject().apply {
                        val outpointObj = JSONObject().apply {
                            put("transactionId", input.previousOutpoint.transactionId.lowercase())
                            put("index", input.previousOutpoint.index)
                        }
                        put("previousOutpoint", outpointObj)
                        put("signatureScript", bytesToHex(input.signatureScript))
                        put("sequence", input.sequence)
                        put("sigOpCount", input.sigOpCount.toInt())
                    }
                    inputsArray.put(inputObj)
                }
                put("inputs", inputsArray)

                // Outputs Array
                val outputsArray = JSONArray()
                for (output in signedTx.outputs) {
                    val outputObj = JSONObject().apply {
                        put("amount", output.amountSompi)
                        val scriptObj = JSONObject().apply {
                            put("version", 0)
                            put("scriptPublicKey", bytesToHex(output.scriptPublicKey))
                        }
                        put("scriptPublicKey", scriptObj)
                    }
                    outputsArray.put(outputObj)
                }
                put("outputs", outputsArray)

                put("subnetworkId", signedTx.subnetworkId)
                put("lockTime", signedTx.lockTime)
                put("gas", signedTx.gas)
                put("payload", bytesToHex(signedTx.payload))
            }

            val requestBody = JSONObject().apply {
                put("transaction", txJson)
                put("allowOrphan", false)
            }.toString()

            // Send request body
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(requestBody)
                writer.flush()
            }

            val responseCode = conn.responseCode
            android.util.Log.d("KaspaBroadcastClient", "Broadcast to $endpointUrl returned HTTP $responseCode")

            if (responseCode in 200..299) {
                val responseText = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                val responseJson = runCatching { JSONObject(responseText) }.getOrNull()
                val txId = responseJson?.optString("transactionId")
                    ?: responseJson?.optString("txId")
                    ?: responseJson?.optString("id")
                    ?: responseText.trim().replace("\"", "")

                if (txId.isNotBlank() && txId.length == 64) {
                    txId
                } else if (txId.isNotBlank()) {
                    txId
                } else {
                    // Fallback to locally known transaction ID or response string
                    "accepted"
                }
            } else {
                val errorStream = conn.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                    ?: "HTTP error code: $responseCode"
                android.util.Log.e("KaspaBroadcastClient", "Broadcast failed [$responseCode]: $errorStream")
                
                // If transaction is already in mempool, treat as success
                val lowerErr = errorStream.lowercase()
                if (lowerErr.contains("already in mempool") || lowerErr.contains("already accepted")) {
                    android.util.Log.i("KaspaBroadcastClient", "Transaction already accepted into mempool")
                    "accepted"
                } else {
                    // Parse and extract human-readable error from node rejection
                    val errorMsg = runCatching {
                        val errJson = JSONObject(errorStream)
                        errJson.optString("message", errJson.optString("error", errJson.optString("detail", errorStream)))
                    }.getOrDefault(errorStream)

                    throw Exception("Kaspa Broadcast Rejected [$responseCode]: $errorMsg")
                }
            }
        }
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val hexChars = "0123456789abcdef"
        val result = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            val i = b.toInt() and 0xFF
            result.append(hexChars[i shr 4])
            result.append(hexChars[i and 0x0F])
        }
        return result.toString()
    }
}
