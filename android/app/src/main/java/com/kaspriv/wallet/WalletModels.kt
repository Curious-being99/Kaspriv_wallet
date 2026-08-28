package com.kaspriv.wallet.model

data class WalletModel(
    val id: String,
    val name: String,
    val receiveAddress: String,
    val changeAddress: String,
    val mnemonic: String? = null,
    val passphrase: String? = null,
    val kpub: String? = null,
    val isImportedKpub: Boolean = false,
    val isWatchOnly: Boolean = false,
    val balanceSompi: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val addressType: String = "P2PK",
    val discoveredAddresses: List<String> = emptyList(),
    val lockedUtxoOutpoints: List<String> = emptyList()
)

data class TransactionModel(
    val txid: String,
    val type: String, // "receive", "send", "compound"
    val amountSompi: Long,
    val feeSompi: Long,
    val address: String,
    val addressLabel: String? = null,
    val timestamp: Long,
    val blockDaaScore: Long,
    val acceptingBlockHash: String? = null,
    val note: String? = null,
    val isAccepted: Boolean = true,
    val confirmations: Int = 1
)

data class UtxoModel(
    val id: String,
    val txid: String,
    val vout: Int,
    val amountSompi: Long,
    val address: String,
    val blockDaaScore: Long,
    val isLocked: Boolean = false,
    val isCoinbase: Boolean = false
)

data class MarketDataModel(
    val priceUsd: Double = 0.12,
    val priceBtc: Double = 0.0000018,
    val change24h: Double = 2.45,
    val marketCapUsd: Double = 3100000000.0,
    val volume24hUsd: Double = 45000000.0,
    val lastUpdated: Long = System.currentTimeMillis()
)

data class ContactModel(
    val id: String,
    val name: String,
    val address: String,
    val notes: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)
