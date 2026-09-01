package com.kaspriv.wallet.crypto

data class UtxoEntry(
    val transactionId: String,
    val index: Int,
    val amountSompi: Long,
    val scriptPublicKey: String // Hex encoded 35-byte P2SH scriptPublicKey (aa20...87)
)

data class Outpoint(
    val transactionId: String,
    val index: Int
)

data class TransactionInput(
    val previousOutpoint: Outpoint,
    var signatureScript: ByteArray = ByteArray(0),
    val sequence: Long = 0L,
    val sigOpCount: Byte = 1
)

data class TransactionOutput(
    val amountSompi: Long,
    val scriptPublicKey: ByteArray
)

data class KaspaRawTransaction(
    val version: Int = 0,
    val inputs: List<TransactionInput>,
    val outputs: List<TransactionOutput>,
    val lockTime: Long = 0L,
    val subnetworkId: String = "0000000000000000000000000000000000000000",
    val gas: Long = 0L,
    val payload: ByteArray = ByteArray(0)
)
