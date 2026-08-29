package com.kaspriv.wallet.data.models

data class Wallet(
    val id: String,
    val name: String,
    val encryptedSeed: String?, // Null if watch-only
    val receiveAddress: String,
    val isWatchOnly: Boolean,
    val balanceSompi: Long = 0,
    val addressPaths: Map<String, String> = emptyMap()
)
