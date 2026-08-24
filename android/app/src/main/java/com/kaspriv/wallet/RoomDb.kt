package com.kaspriv.wallet

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Android Jetpack Room Database Architecture for Kaspriv Wallet.
 * Provides high-performance, strongly-typed persistence for wallets,
 * application settings, UTXOs, and transaction histories.
 */

@Entity(tableName = "wallets")
data class WalletEntity(
    @PrimaryKey val id: String,
    val value: String
)

@Entity(tableName = "settings")
data class SettingEntity(
    @PrimaryKey val key: String,
    val value: String
)

@Entity(tableName = "utxos")
data class UtxoEntity(
    @PrimaryKey val walletId: String,
    val data: String
)

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val walletId: String,
    val data: String
)

@Dao
interface WalletDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(wallet: WalletEntity)

    @Query("SELECT * FROM wallets")
    suspend fun getAll(): List<WalletEntity>

    @Query("SELECT * FROM wallets WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): WalletEntity?

    @Query("DELETE FROM wallets WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM wallets")
    suspend fun deleteAll()
}

@Dao
interface SettingDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(setting: SettingEntity)

    @Query("SELECT * FROM settings")
    suspend fun getAll(): List<SettingEntity>

    @Query("SELECT * FROM settings WHERE `key` = :key LIMIT 1")
    suspend fun getByKey(key: String): SettingEntity?

    @Query("DELETE FROM settings WHERE `key` = :key")
    suspend fun deleteByKey(key: String)

    @Query("DELETE FROM settings")
    suspend fun deleteAll()
}

@Dao
interface UtxoDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(utxo: UtxoEntity)

    @Query("SELECT * FROM utxos")
    suspend fun getAll(): List<UtxoEntity>

    @Query("SELECT * FROM utxos WHERE walletId = :walletId LIMIT 1")
    suspend fun getByWalletId(walletId: String): UtxoEntity?

    @Query("DELETE FROM utxos WHERE walletId = :walletId")
    suspend fun deleteByWalletId(walletId: String)

    @Query("DELETE FROM utxos")
    suspend fun deleteAll()
}

@Dao
interface TransactionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity)

    @Query("SELECT * FROM transactions")
    suspend fun getAll(): List<TransactionEntity>

    @Query("SELECT * FROM transactions WHERE walletId = :walletId LIMIT 1")
    suspend fun getByWalletId(walletId: String): TransactionEntity?

    @Query("DELETE FROM transactions WHERE walletId = :walletId")
    suspend fun deleteByWalletId(walletId: String)

    @Query("DELETE FROM transactions")
    suspend fun deleteAll()
}

@Database(
    entities = [
        WalletEntity::class,
        SettingEntity::class,
        UtxoEntity::class,
        TransactionEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun walletDao(): WalletDao
    abstract fun settingDao(): SettingDao
    abstract fun utxoDao(): UtxoDao
    abstract fun transactionDao(): TransactionDao

    companion object {
        private const val DATABASE_NAME = "kaspriv_wallet_native.db"

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
