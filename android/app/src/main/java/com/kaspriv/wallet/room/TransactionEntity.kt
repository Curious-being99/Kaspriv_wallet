package com.kaspriv.wallet.room

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey
    val walletId: String,
    val data: String? = null
)
