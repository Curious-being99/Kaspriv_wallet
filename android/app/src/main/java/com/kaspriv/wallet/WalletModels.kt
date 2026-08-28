package com.kaspriv.wallet

import com.kaspriv.wallet.model.WalletModel
import com.kaspriv.wallet.model.TransactionModel
import com.kaspriv.wallet.model.UtxoModel
import com.kaspriv.wallet.model.ContactModel
import com.kaspriv.wallet.model.MarketDataModel

typealias WalletAccount = WalletModel
typealias TransactionItem = TransactionModel
typealias UtxoEntry = UtxoModel
typealias ContactItem = ContactModel

data class SendKasModalData(
    val recipient: String,
    val amountSompi: Long,
    val note: String? = null,
    val feeTier: String = "NORMAL"
)

data class KaspaNetworkStatus(
    val isSynced: Boolean = true,
    val daaScore: Long = 88500000L,
    val blockRateBps: Double = 10.0,
    val virtualDaaScore: Long = 88500120L,
    val activeNodeUrl: String = "https://api.kaspa.org"
)
