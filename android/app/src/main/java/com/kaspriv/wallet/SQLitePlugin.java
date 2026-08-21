package com.kaspriv.wallet;

import android.database.Cursor;
import androidx.sqlite.db.SupportSQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kaspriv.wallet.room.AppDatabase;
import org.json.JSONArray;

@CapacitorPlugin(name = "SQLitePlugin")
public class SQLitePlugin extends Plugin {

    private AppDatabase roomDb;

    @Override
    public void load() {
        // Initialize Room Database Singleton Instance
        roomDb = AppDatabase.getDatabase(getContext());
    }

    @PluginMethod
    public void executeSql(PluginCall call) {
        String sql = call.getString("sql");
        JSONArray paramsArray = call.getArray("params");

        if (sql == null) {
            call.reject("SQL query is required");
            return;
        }

        SupportSQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = roomDb.getOpenHelper().getWritableDatabase();
            String upper = sql.trim().toUpperCase();

            // Convert JSONArray params to Object[] for SupportSQLiteDatabase
            Object[] bindArgs = new Object[0];
            if (paramsArray != null && paramsArray.length() > 0) {
                bindArgs = new Object[paramsArray.length()];
                for (int i = 0; i < paramsArray.length(); i++) {
                    bindArgs[i] = paramsArray.opt(i);
                }
            }

            if (upper.startsWith("SELECT")) {
                cursor = db.query(sql, bindArgs);
                JSArray rows = new JSArray();
                int columnCount = cursor.getColumnCount();

                while (cursor.moveToNext()) {
                    JSObject row = new JSObject();
                    for (int i = 0; i < columnCount; i++) {
                        String columnName = cursor.getColumnName(i);
                        int type = cursor.getType(i);
                        switch (type) {
                            case Cursor.FIELD_TYPE_NULL:
                                row.put(columnName, null);
                                break;
                            case Cursor.FIELD_TYPE_INTEGER:
                                row.put(columnName, cursor.getLong(i));
                                break;
                            case Cursor.FIELD_TYPE_FLOAT:
                                row.put(columnName, cursor.getDouble(i));
                                break;
                            case Cursor.FIELD_TYPE_STRING:
                                row.put(columnName, cursor.getString(i));
                                break;
                            case Cursor.FIELD_TYPE_BLOB:
                                byte[] blob = cursor.getBlob(i);
                                String base64 = android.util.Base64.encodeToString(blob, android.util.Base64.NO_WRAP);
                                row.put(columnName, base64);
                                break;
                        }
                    }
                    rows.put(row);
                }

                JSObject result = new JSObject();
                result.put("rows", rows);
                call.resolve(result);
            } else {
                // Non-query statement
                if (bindArgs.length > 0) {
                    db.execSQL(sql, bindArgs);
                } else {
                    db.execSQL(sql);
                }
                JSObject result = new JSObject();
                result.put("rows", new JSArray());
                call.resolve(result);
            }
        } catch (Exception e) {
            call.reject("Room SQLite native error: " + e.getMessage(), e);
        } finally {
            if (cursor != null) {
                try { cursor.close(); } catch (Exception ignored) {}
            }
        }
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        try {
            // Using Room clearAllTables
            roomDb.clearAllTables();
            call.resolve();
        } catch (Exception e) {
            call.reject("Room SQLite native clear failed: " + e.getMessage(), e);
        }
    }
}
