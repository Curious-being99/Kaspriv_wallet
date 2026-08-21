package com.kaspriv.wallet.room;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "utxos")
public class UtxoEntity {
    @PrimaryKey
    @NonNull
    public String walletId;
    
    public String data;

    public UtxoEntity() {}

    public UtxoEntity(@NonNull String walletId, String data) {
        this.walletId = walletId;
        this.data = data;
    }
}
