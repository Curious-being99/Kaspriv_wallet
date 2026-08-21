package com.kaspriv.wallet.room;

import android.content.Context;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(entities = {WalletEntity.class, SettingEntity.class, UtxoEntity.class, TransactionEntity.class}, version = 1, exportSchema = false)
public abstract class AppDatabase extends RoomDatabase {

    private static volatile AppDatabase INSTANCE;

    public abstract WalletDao walletDao();

    public static AppDatabase getDatabase(final Context context) {
        if (INSTANCE == null) {
            synchronized (AppDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(context.getApplicationContext(),
                                    AppDatabase.class, "kaspriv_wallet_room.db")
                            .fallbackToDestructiveMigration()
                            .allowMainThreadQueries() // Allow for simple direct synchronous SQLitePlugin calls
                            .build();
                }
            }
        }
        return INSTANCE;
    }
}
