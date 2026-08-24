package com.kaspriv.wallet

import android.content.Context
import androidx.room.*

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
interface AppDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveWallet(wallet: WalletEntity)
    
    @Query("SELECT * FROM wallets")
    suspend fun getWallets(): List<WalletEntity>
    
    @Query("DELETE FROM wallets WHERE id = :id")
    suspend fun deleteWallet(id: String)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSetting(setting: SettingEntity)
    
    @Query("SELECT * FROM settings")
    suspend fun getSettings(): List<SettingEntity>
    
    @Query("DELETE FROM settings WHERE key = :key")
    suspend fun deleteSetting(key: String)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveUtxo(utxo: UtxoEntity)
    
    @Query("SELECT * FROM utxos")
    suspend fun getUtxos(): List<UtxoEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveTransaction(tx: TransactionEntity)
    
    @Query("SELECT * FROM transactions")
    suspend fun getTransactions(): List<TransactionEntity>
}

@Database(entities = [WalletEntity::class, SettingEntity::class, UtxoEntity::class, TransactionEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun appDao(): AppDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "kaspriv_wallet_db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
