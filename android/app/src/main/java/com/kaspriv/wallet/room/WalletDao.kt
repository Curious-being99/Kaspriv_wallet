package com.kaspriv.wallet.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface WalletDao {
    
    @Query("SELECT * FROM wallets")
    fun getAllWallets(): List<WalletEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertWallet(wallet: WalletEntity)

    @Query("DELETE FROM wallets WHERE id = :id")
    fun deleteWallet(id: String)

    @Query("SELECT * FROM settings")
    fun getAllSettings(): List<SettingEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertSetting(setting: SettingEntity)

    @Query("DELETE FROM settings WHERE `key` = :key")
    fun deleteSetting(key: String)

    @Query("SELECT * FROM utxos")
    fun getAllUtxos(): List<UtxoEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertUtxo(utxo: UtxoEntity)

    @Query("SELECT * FROM transactions")
    fun getAllTransactions(): List<TransactionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertTransaction(transaction: TransactionEntity)
}
