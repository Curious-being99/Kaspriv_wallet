package com.kaspriv.wallet

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.kaspriv.wallet.ui.theme.KaspaWalletTheme
import com.kaspriv.wallet.ui.screens.MainLandingScreen
import com.kaspriv.wallet.ui.screens.MainDashboardScreen
import com.kaspriv.wallet.ui.screens.WalletSetupScreen
import com.kaspriv.wallet.ui.viewmodels.WalletViewModel

class MainActivity : ComponentActivity() {
    
    private val walletViewModel: WalletViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Native FLAG_SECURE Window Enforcement
        try {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        } catch (e: Exception) {
            // Ignore
        }

        super.onCreate(savedInstanceState)
        
        // Schedule decentralized background on-chain transaction monitoring
        try {
            KaspaSyncWorker.schedulePeriodicSync(this)
        } catch (e: Exception) {
            // Ignore
        }

        setContent {
            KaspaWalletTheme {
                val activeWallet by walletViewModel.activeWallet.collectAsState()
                
                // If we have an active wallet, default to dashboard. Else landing.
                var currentRoute by remember { 
                    mutableStateOf(if (activeWallet != null) "dashboard" else "landing") 
                }

                when (currentRoute) {
                    "landing" -> {
                        MainLandingScreen(
                            onCreateWallet = { currentRoute = "setup" },
                            onImportSeed = {},
                            onWatchAddress = {}
                        )
                    }
                    "setup" -> {
                        WalletSetupScreen(
                            onBack = { currentRoute = "landing" },
                            onComplete = { mnemonic, derivedAddress ->
                                // Encrypt mnemonic locally before saving (placeholder encryption for now)
                                walletViewModel.createNewWallet(
                                    name = "Primary Wallet",
                                    encryptedSeed = mnemonic, // In production, AES encrypt this
                                    receiveAddress = derivedAddress
                                )
                                currentRoute = "dashboard"
                            }
                        )
                    }
                    "dashboard" -> {
                        MainDashboardScreen(walletViewModel)
                    }
                }
            }
        }
    }
}
