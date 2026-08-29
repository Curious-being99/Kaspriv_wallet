package com.kaspriv.wallet.data.repository

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.kaspriv.wallet.data.models.Wallet

class WalletRepository(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "kaspriv_secure_vault",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val gson = Gson()
    private val WALLETS_KEY = "encrypted_wallets_list"
    private val ACTIVE_WALLET_ID_KEY = "active_wallet_id"

    fun getWallets(): List<Wallet> {
        val json = sharedPreferences.getString(WALLETS_KEY, null) ?: return emptyList()
        val type = object : TypeToken<List<Wallet>>() {}.type
        return gson.fromJson(json, type)
    }

    fun saveWallets(wallets: List<Wallet>) {
        val json = gson.toJson(wallets)
        sharedPreferences.edit().putString(WALLETS_KEY, json).apply()
    }

    fun addWallet(wallet: Wallet) {
        val current = getWallets().toMutableList()
        // Prevent duplicates
        if (current.none { it.id == wallet.id }) {
            current.add(wallet)
            saveWallets(current)
        }
    }

    fun getActiveWalletId(): String? {
        return sharedPreferences.getString(ACTIVE_WALLET_ID_KEY, null)
    }

    fun setActiveWalletId(id: String) {
        sharedPreferences.edit().putString(ACTIVE_WALLET_ID_KEY, id).apply()
    }

    fun clearAll() {
        sharedPreferences.edit().clear().apply()
    }
}
