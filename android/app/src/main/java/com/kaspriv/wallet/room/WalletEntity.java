package com.kaspriv.wallet.room;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "wallets")
public class WalletEntity {
    @PrimaryKey
    @NonNull
    public String id;
    
    public String value;

    public WalletEntity() {}

    public WalletEntity(@NonNull String id, String value) {
        this.id = id;
        this.value = value;
    }
}
