package com.kaspriv.wallet.room

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "wallets")
data class WalletEntity(
    @PrimaryKey
    val id: String,
    val value: String? = null
)
