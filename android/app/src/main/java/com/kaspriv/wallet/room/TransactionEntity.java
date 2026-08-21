package com.kaspriv.wallet.room;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "transactions")
public class TransactionEntity {
    @PrimaryKey
    @NonNull
    public String walletId;
    
    public String data;

    public TransactionEntity() {}

    public TransactionEntity(@NonNull String walletId, String data) {
        this.walletId = walletId;
        this.data = data;
    }
}
