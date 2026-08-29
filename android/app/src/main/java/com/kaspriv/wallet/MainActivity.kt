package com.kaspriv.wallet

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.kaspriv.wallet.model.ContactModel
import com.kaspriv.wallet.model.MarketDataModel
import com.kaspriv.wallet.model.TransactionModel
import com.kaspriv.wallet.model.UtxoModel
import com.kaspriv.wallet.model.WalletModel
import com.kaspriv.wallet.tx.KaspaUtxo
import com.kaspriv.wallet.ui.DuressSecuritySetupModal
import com.kaspriv.wallet.ui.LockScreen
import com.kaspriv.wallet.ui.MainLandingPage
import com.kaspriv.wallet.ui.MainWalletDashboard
import com.kaspriv.wallet.ui.SendKasModal
import com.kaspriv.wallet.ui.ReceiveModal
import com.kaspriv.wallet.ui.NodeManagerModal
import com.kaspriv.wallet.ui.CompoundUtxoModal
import com.kaspriv.wallet.ui.SignMessageModal
import com.kaspriv.wallet.ui.LogoutModal
import com.kaspriv.wallet.ui.SplashScreen
import com.kaspriv.wallet.ui.theme.KaspaWalletTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : ComponentActivity() {

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
                val coroutineScope = rememberCoroutineScope()

                // Initial Splash state
                var showSplash by remember { mutableStateOf(true) }
                LaunchedEffect(Unit) {
                    delay(1200)
                    showSplash = false
                }

                // Core Wallet State
                var activeWallet by remember {
                    mutableStateOf<WalletModel?>(
                        WalletModel(
                            id = "primary_vault",
                            name = "Primary Vault",
                            receiveAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                            changeAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                            balanceSompi = 24508900000L // 245.089 KAS
                        )
                    )
                }

                val wallets = remember {
                    mutableStateListOf<WalletModel>().apply {
                        activeWallet?.let { add(it) }
                    }
                }

                var isLocked by remember { mutableStateOf(false) }
                var isSyncing by remember { mutableStateOf(false) }
                var selectedNodeUrl by remember { mutableStateOf("https://api.kaspa.org") }

                // Market data state
                var marketData by remember {
                    mutableStateOf(
                        MarketDataModel(
                            priceUsd = 0.1245,
                            change24h = 3.25
                        )
                    )
                }

                // Transactions history state
                val transactions = remember {
                    mutableStateListOf(
                        TransactionModel(
                            txid = "8f3b2a1c9e8d7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a",
                            type = "receive",
                            amountSompi = 15000000000L,
                            feeSompi = 10000L,
                            address = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                            timestamp = System.currentTimeMillis() - 3600000L,
                            isAccepted = true
                        ),
                        TransactionModel(
                            txid = "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
                            type = "send",
                            amountSompi = 4500000000L,
                            feeSompi = 12000L,
                            address = "kaspa:qr89v2w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq9a12b3c",
                            timestamp = System.currentTimeMillis() - 86400000L,
                            isAccepted = true
                        )
                    )
                }

                // UTXO State
                val utxos = remember {
                    mutableStateListOf(
                        UtxoModel(
                            id = "utxo_1",
                            txid = "8f3b2a1c9e8d7f6a5b4c3d2e1f0a9b8c",
                            vout = 0,
                            amountSompi = 14508900000L,
                            address = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                            blockDaaScore = 88501240L
                        ),
                        UtxoModel(
                            id = "utxo_2",
                            txid = "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
                            vout = 1,
                            amountSompi = 10000000000L,
                            address = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                            blockDaaScore = 88500980L
                        )
                    )
                }

                // Contacts State
                val contacts = remember {
                    mutableStateListOf(
                        ContactModel(
                            id = "c1",
                            name = "Mining Rig Alpha",
                            address = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g"
                        ),
                        ContactModel(
                            id = "c2",
                            name = "Cold Storage Vault",
                            address = "kaspa:qr89v2w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq9a12b3c"
                        )
                    )
                }

                // Modals Visibility
                var isSendOpen by remember { mutableStateOf(false) }
                var isReceiveOpen by remember { mutableStateOf(false) }
                var isNodeManagerOpen by remember { mutableStateOf(false) }
                var isCompoundOpen by remember { mutableStateOf(false) }
                var isDuressOpen by remember { mutableStateOf(false) }
                var isSignMessageOpen by remember { mutableStateOf(false) }
                var isLogoutOpen by remember { mutableStateOf(false) }

                Box(modifier = Modifier.fillMaxSize()) {
                    if (activeWallet == null) {
                        MainLandingPage(
                            onCreateWallet = { name, words, password ->
                                val newWallet = WalletModel(
                                    id = UUID.randomUUID().toString(),
                                    name = name.ifBlank { "Primary Vault" },
                                    receiveAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                                    changeAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                                    mnemonic = words.joinToString(" "),
                                    passphrase = password ?: "",
                                    balanceSompi = 0L
                                )
                                wallets.clear()
                                wallets.add(newWallet)
                                activeWallet = newWallet
                            },
                            onImportSeed = { name, words, passphrase, password ->
                                val newWallet = WalletModel(
                                    id = UUID.randomUUID().toString(),
                                    name = name.ifBlank { "Restored Vault" },
                                    receiveAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                                    changeAddress = "kaspa:qp37r9w34y6375y6z07g290hswm4l4rsv2dkmqqe2vg2v3e96z30qq8d56x8g",
                                    mnemonic = words,
                                    passphrase = password ?: passphrase,
                                    balanceSompi = 5000000000L
                                )
                                wallets.clear()
                                wallets.add(newWallet)
                                activeWallet = newWallet
                            },
                            onImportAddress = { name, address ->
                                val newWallet = WalletModel(
                                    id = UUID.randomUUID().toString(),
                                    name = name.ifBlank { "Watch-Only" },
                                    receiveAddress = address.trim(),
                                    changeAddress = address.trim(),
                                    isWatchOnly = true,
                                    balanceSompi = 12000000000L
                                )
                                wallets.clear()
                                wallets.add(newWallet)
                                activeWallet = newWallet
                            }
                        )
                    } else {
                        MainWalletDashboard(
                            activeWallet = activeWallet,
                            wallets = wallets,
                            marketData = marketData,
                            transactions = transactions,
                            utxos = utxos,
                            contacts = contacts,
                            isSyncing = isSyncing,
                            onSendClick = { isSendOpen = true },
                            onScanClick = { isSendOpen = true },
                            onReceiveClick = { isReceiveOpen = true },
                            onLockClick = { isLocked = true },
                            onRefreshSync = {
                                coroutineScope.launch {
                                    isSyncing = true
                                    delay(1500)
                                    isSyncing = false
                                }
                            },
                            onAddContact = { name, address ->
                                contacts.add(
                                    ContactModel(
                                        id = UUID.randomUUID().toString(),
                                        name = name,
                                        address = address
                                    )
                                )
                            },
                            onToggleUtxoLock = { utxoId ->
                                val index = utxos.indexOfFirst { it.id == utxoId }
                                if (index != -1) {
                                    val item = utxos[index]
                                    utxos[index] = item.copy(isLocked = !item.isLocked)
                                }
                            },
                            onCompoundUtxos = { isCompoundOpen = true },
                            onSwitchWallet = { walletId ->
                                activeWallet = wallets.find { it.id == walletId }
                            },
                            onNodeManagerClick = { isNodeManagerOpen = true },
                            onDuressSetupClick = { isDuressOpen = true },
                            onSignMessageClick = { isSignMessageOpen = true },
                            onLogoutClick = { isLogoutOpen = true }
                        )
                    }

                    // Send Modal
                    activeWallet?.let { wallet ->
                        val availableUtxos = utxos.map {
                            KaspaUtxo(
                                transactionId = it.txid,
                                index = it.vout,
                                amountSompi = it.amountSompi,
                                scriptPublicKey = "20${it.address}",
                                blockDaaScore = it.blockDaaScore,
                                isCoinbase = it.isCoinbase,
                                address = it.address
                            )
                        }

                        SendKasModal(
                            isOpen = isSendOpen,
                            onClose = { isSendOpen = false },
                            availableBalanceKas = (wallet.balanceSompi / 100_000_000.0),
                            availableUtxos = availableUtxos,
                            walletAddress = wallet.receiveAddress,
                            onOpenQrScanner = { /* QR Scanner trigger */ },
                            onBroadcastSuccess = { txId, amountKas, toAddress ->
                                val sompi = (amountKas * 100_000_000).toLong()
                                transactions.add(
                                    0,
                                    TransactionModel(
                                        txid = txId,
                                        type = "send",
                                        amountSompi = sompi,
                                        feeSompi = 20000L,
                                        address = toAddress,
                                        timestamp = System.currentTimeMillis(),
                                        isAccepted = true
                                    )
                                )
                                activeWallet = wallet.copy(
                                    balanceSompi = (wallet.balanceSompi - sompi - 20000L).coerceAtLeast(0L)
                                )
                            }
                        )

                        // Receive Modal
                        if (isReceiveOpen) {
                            ReceiveModal(
                                activeWallet = wallet,
                                onDismiss = { isReceiveOpen = false }
                            )
                        }

                        // Compound UTXOs Modal
                        if (isCompoundOpen) {
                            CompoundUtxoModal(
                                activeWallet = wallet,
                                utxos = utxos,
                                onDismiss = { isCompoundOpen = false },
                                onExecuteCompound = {
                                    delay(1000)
                                    val totalSompi = utxos.sumOf { it.amountSompi } - 25000L
                                    utxos.clear()
                                    utxos.add(
                                        UtxoModel(
                                            id = UUID.randomUUID().toString(),
                                            txid = "compound_${System.currentTimeMillis().toString(16)}",
                                            vout = 0,
                                            amountSompi = totalSompi,
                                            address = wallet.receiveAddress,
                                            blockDaaScore = 88502000L
                                        )
                                    )
                                    isCompoundOpen = false
                                }
                            )
                        }

                        // Sign Message Modal
                        if (isSignMessageOpen) {
                            SignMessageModal(
                                activeWallet = wallet,
                                onDismiss = { isSignMessageOpen = false }
                            )
                        }
                    }

                    // Node Manager Modal
                    if (isNodeManagerOpen) {
                        NodeManagerModal(
                            selectedNodeUrl = selectedNodeUrl,
                            onSelectNode = {
                                selectedNodeUrl = it
                                isNodeManagerOpen = false
                            },
                            onDismiss = { isNodeManagerOpen = false }
                        )
                    }

                    // Duress Security Modal
                    DuressSecuritySetupModal(
                        isOpen = isDuressOpen,
                        onClose = { isDuressOpen = false },
                        onCompleteSecuritySetup = { primary, duress ->
                            isDuressOpen = false
                        }
                    )

                    // Logout Modal
                    if (isLogoutOpen) {
                        LogoutModal(
                            onConfirmLock = {
                                isLocked = true
                                isLogoutOpen = false
                            },
                            onConfirmWipe = {
                                activeWallet = null
                                wallets.clear()
                                isLogoutOpen = false
                            },
                            onDismiss = { isLogoutOpen = false }
                        )
                    }

                    // Lock Screen Overlay
                    LockScreen(
                        isLocked = isLocked,
                        onUnlockWithPassword = { enteredPass ->
                            if (enteredPass.isNotBlank()) {
                                isLocked = false
                            }
                        },
                        onUnlockWithBiometrics = {
                            isLocked = false
                        }
                    )

                    // Splash Screen (Fades Out)
                    SplashScreen(visible = showSplash)
                }
            }
        }
    }
}
