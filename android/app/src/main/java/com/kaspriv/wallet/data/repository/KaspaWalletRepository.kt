package com.kaspriv.wallet.data.repository

import androidx.room.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

enum class TxStatus { PENDING, ACCEPTED, REJECTED }
enum class TxDirection { INCOMING, OUTGOING }

@Entity(tableName = "kaspa_wallets")
data class KaspaWalletEntity(
    @PrimaryKey val walletId: String,
    val name: String,
    val receiveAddress: String,
    val changeAddress: String,
    val balanceSompi: Long = 0L,
    val lastUpdated: Long = System.currentTimeMillis()
)

@Entity(tableName = "kaspa_transactions")
data class KaspaTransactionEntity(
    @PrimaryKey val txId: String,
    val walletId: String,
    val peerAddress: String,
    val amountSompi: Long,
    val feeSompi: Long = 0L,
    val isIncoming: Boolean,
    val status: String = "ACCEPTED",
    val timestamp: Long = System.currentTimeMillis()
)

@Dao
interface KaspaWalletDao {
    @Query("SELECT * FROM kaspa_wallets WHERE walletId = :walletId")
    fun getWalletFlow(walletId: String): Flow<KaspaWalletEntity?>

    @Query("SELECT * FROM kaspa_transactions WHERE walletId = :walletId ORDER BY timestamp DESC")
    fun getTransactionsFlow(walletId: String): Flow<List<KaspaTransactionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateWallet(wallet: KaspaWalletEntity)

    @Query("UPDATE kaspa_wallets SET balanceSompi = :balanceSompi, lastUpdated = :timestamp WHERE walletId = :walletId")
    suspend fun updateBalance(walletId: String, balanceSompi: Long, timestamp: Long = System.currentTimeMillis())

    @Query("UPDATE kaspa_wallets SET balanceSompi = MAX(0, balanceSompi - :deductionSompi), lastUpdated = :timestamp WHERE walletId = :walletId")
    suspend fun deductBalanceOptimistic(walletId: String, deductionSompi: Long, timestamp: Long = System.currentTimeMillis())

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(tx: KaspaTransactionEntity)

    @Query("UPDATE kaspa_transactions SET status = :status WHERE txId = :txId")
    suspend fun updateTxStatus(txId: String, status: String)
}

interface KaspaRpcApi {
    suspend fun getBalance(address: String): Long
    suspend fun getBalance(addresses: List<String>): Long
    suspend fun submitTransaction(fromAddress: String, toAddress: String, amountSompi: Long, feeSompi: Long): String
}

class KaspaWalletRepository(
    private val walletDao: KaspaWalletDao,
    private val kaspaRpcApi: KaspaRpcApi
) {
    fun observeWallet(walletId: String): Flow<KaspaWalletEntity?> = walletDao.getWalletFlow(walletId)
    fun observeTransactions(walletId: String): Flow<List<KaspaTransactionEntity>> = walletDao.getTransactionsFlow(walletId)

    // 1. Fetch live balance from Kaspa Node RPC and persist in local Room DB
    suspend fun refreshBalance(walletId: String, address: String): Result<Long> = runCatching {
        val nodeBalanceSompi = kaspaRpcApi.getBalance(address)
        walletDao.updateBalance(walletId, nodeBalanceSompi)
        nodeBalanceSompi
    }

    suspend fun refreshBalanceMulti(walletId: String, addresses: List<String>): Result<Long> = runCatching {
        val nodeBalanceSompi = kaspaRpcApi.getBalance(addresses)
        walletDao.updateBalance(walletId, nodeBalanceSompi)
        nodeBalanceSompi
    }

    // 2. Persistent Send Flow: Broadcasts TX, stores record, applies optimistic deduction & syncs
    suspend fun sendKaspa(
        walletId: String,
        fromAddress: String,
        toAddress: String,
        amountSompi: Long,
        feeSompi: Long = 10_000L,
        allAddresses: List<String> = listOf(fromAddress)
    ): Result<String> = runCatching {
        // Broadcast to Kaspa node
        val txId = kaspaRpcApi.submitTransaction(fromAddress, toAddress, amountSompi, feeSompi)

        // Save transaction locally in Room
        walletDao.insertTransaction(
            KaspaTransactionEntity(
                txId = txId,
                walletId = walletId,
                peerAddress = toAddress,
                amountSompi = amountSompi,
                feeSompi = feeSompi,
                isIncoming = false,
                status = "ACCEPTED",
                timestamp = System.currentTimeMillis()
            )
        )

        // Optimistically deduct amount + fee from Room DB so UI updates instantly
        walletDao.deductBalanceOptimistic(walletId, amountSompi + feeSompi)

        // Delay for DAG block inclusion then synchronize authoritative balance from node
        delay(1200L)
        refreshBalanceMulti(walletId, allAddresses)

        txId
    }

    // 3. Persistent Receive Flow: Records incoming payment & synchronizes node balance
    suspend fun handleIncomingTransaction(
        walletId: String,
        walletAddress: String,
        fromSender: String,
        amountSompi: Long,
        txId: String,
        allAddresses: List<String> = listOf(walletAddress)
    ): Result<Unit> = runCatching {
        walletDao.insertTransaction(
            KaspaTransactionEntity(
                txId = txId,
                walletId = walletId,
                peerAddress = fromSender,
                amountSompi = amountSompi,
                feeSompi = 0L,
                isIncoming = true,
                status = "ACCEPTED",
                timestamp = System.currentTimeMillis()
            )
        )
        // Refresh balance to reflect DAG block inclusion
        refreshBalanceMulti(walletId, allAddresses)
    }
}
