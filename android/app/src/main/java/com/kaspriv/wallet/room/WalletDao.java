package com.kaspriv.wallet.room;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import androidx.room.RawQuery;
import androidx.sqlite.db.SupportSQLiteQuery;
import java.util.List;

@Dao
public interface WalletDao {
    
    @Query("SELECT * FROM wallets")
    List<WalletEntity> getAllWallets();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertWallet(WalletEntity wallet);

    @Query("DELETE FROM wallets WHERE id = :id")
    void deleteWallet(String id);

    @Query("SELECT * FROM settings")
    List<SettingEntity> getAllSettings();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertSetting(SettingEntity setting);

    @Query("SELECT * FROM utxos")
    List<UtxoEntity> getAllUtxos();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertUtxo(UtxoEntity utxo);

    @Query("SELECT * FROM transactions")
    List<TransactionEntity> getAllTransactions();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertTransaction(TransactionEntity transaction);

    @RawQuery
    int executeRawWrite(SupportSQLiteQuery query);
}
