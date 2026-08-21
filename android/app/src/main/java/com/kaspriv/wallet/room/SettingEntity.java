package com.kaspriv.wallet.room;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "settings")
public class SettingEntity {
    @PrimaryKey
    @NonNull
    public String key;
    
    public String value;

    public SettingEntity() {}

    public SettingEntity(@NonNull String key, String value) {
        this.key = key;
        this.value = value;
    }
}
