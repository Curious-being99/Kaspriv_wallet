package com.kaspriv.wallet.ui.viewmodels

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.kaspriv.wallet.data.models.Wallet
import com.kaspriv.wallet.data.repository.WalletRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URL
import java.util.UUID

class WalletViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = WalletRepository(application)

    private val _wallets = MutableStateFlow<List<Wallet>>(emptyList())
    val wallets: StateFlow<List<Wallet>> = _wallets.asStateFlow()

    private val _activeWallet = MutableStateFlow<Wallet?>(null)
    val activeWallet: StateFlow<Wallet?> = _activeWallet.asStateFlow()

    // Real-time market state
    private val _fiatRate = MutableStateFlow(0.0) // USD per KAS
    val fiatRate: StateFlow<Double> = _fiatRate.asStateFlow()

    init {
        loadWallets()
        fetchFiatRate()
    }

    private fun fetchFiatRate() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val response = URL("https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd").readText()
                val json = JSONObject(response)
                val price = json.getJSONObject("kaspa").getDouble("usd")
                _fiatRate.value = price
            } catch (e: Exception) {
                Log.e("WalletViewModel", "Failed to fetch Kaspa price", e)
            }
        }
    }

    private fun loadWallets() {
        val storedWallets = repository.getWallets()
        _wallets.value = storedWallets
        
        val activeId = repository.getActiveWalletId()
        _activeWallet.value = storedWallets.find { it.id == activeId } ?: storedWallets.firstOrNull()
    }

    fun createNewWallet(name: String, encryptedSeed: String, receiveAddress: String) {
        val newWallet = Wallet(
            id = UUID.randomUUID().toString(),
            name = name,
            encryptedSeed = encryptedSeed,
            receiveAddress = receiveAddress,
            isWatchOnly = false
        )
        
        repository.addWallet(newWallet)
        repository.setActiveWalletId(newWallet.id)
        loadWallets()
    }

    fun switchWallet(id: String) {
        repository.setActiveWalletId(id)
        loadWallets()
    }

    fun formatKas(sompi: Long): String {
        return String.format("%.2f", sompi / 100000000.0)
    }

    fun calculateFiat(sompi: Long): String {
        val kas = sompi / 100000000.0
        return String.format("%.2f", kas * _fiatRate.value)
    }
}
