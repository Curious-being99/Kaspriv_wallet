package com.kaspriv.wallet.room

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "utxos")
data class UtxoEntity(
    @PrimaryKey
    val walletId: String,
    val data: String? = null
)
