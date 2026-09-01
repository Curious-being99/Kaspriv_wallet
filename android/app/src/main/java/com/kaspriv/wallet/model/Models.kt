package com.kaspriv.wallet.model

data class WalletModel(
    val id: String = "primary_wallet",
    val name: String = "KasPriv Primary",
    val receiveAddress: String = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
    val changeAddress: String = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
    val mnemonic: String = "",
    val passphrase: String = "",
    val kpub: String? = null,
    val isImportedKpub: Boolean = false,
    val isWatchOnly: Boolean = false,
    val balanceSompi: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val addressType: String = "P2SH",
    val discoveredAddresses: List<String> = emptyList(),
    val lockedUtxoOutpoints: List<String> = emptyList(),
    val lockedUtxos: List<String> = emptyList()
) {
    val address: String get() = receiveAddress
}

data class TransactionModel(
    val txid: String,
    val type: String = "receive", // "receive", "send", "compound"
    val amountSompi: Long,
    val feeSompi: Long = 10000L,
    val address: String,
    val addressLabel: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val blockDaaScore: Long = 88500000L,
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
    val blockDaaScore: Long = 88500000L,
    val isLocked: Boolean = false,
    val isCoinbase: Boolean = false
) {
    val txId: String get() = txid
    val outputIndex: Int get() = vout
}

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
