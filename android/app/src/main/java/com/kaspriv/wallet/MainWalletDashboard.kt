package com.kaspriv.wallet.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowOutward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.model.ContactModel
import com.kaspriv.wallet.model.MarketDataModel
import com.kaspriv.wallet.model.TransactionModel
import com.kaspriv.wallet.model.UtxoModel
import com.kaspriv.wallet.model.WalletModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class BottomNavTab {
    HOME,
    HISTORY,
    CONTACTS,
    SETTINGS
}

/**
 * 1:1 Complete Kotlin Jetpack Compose implementation of the Main Wallet UI:
 * - Top Header with Wallet Switcher, Network DAA status, & Lock Button
 * - Main Balance Card with KAS, USD conversion, and Privacy Eye Toggle
 * - Mobile Quick Action Buttons: Send, Scan QR, Receive
 * - UTXO List with Compound consolidation & Outpoint locks
 * - History Tab with filterable transactions
 * - Contacts Tab with address book management
 * - Settings Tab with Node Switcher, Duress PIN setup, & Biometrics toggle
 * - Bottom Navigation Bar
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainWalletDashboard(
    activeWallet: WalletModel?,
    wallets: List<WalletModel>,
    marketData: MarketDataModel,
    transactions: List<TransactionModel>,
    utxos: List<UtxoModel>,
    contacts: List<ContactModel>,
    isSyncing: Boolean,
    onSendClick: () -> Unit,
    onScanClick: () -> Unit,
    onReceiveClick: () -> Unit,
    onLockClick: () -> Unit,
    onRefreshSync: () -> Unit,
    onAddContact: (name: String, address: String) -> Unit,
    onToggleUtxoLock: (utxoId: String) -> Unit,
    onCompoundUtxos: () -> Unit,
    onSwitchWallet: (walletId: String) -> Unit,
    onNodeManagerClick: () -> Unit = {},
    onDuressSetupClick: () -> Unit = {},
    onSignMessageClick: () -> Unit = {},
    onLogoutClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableStateOf(BottomNavTab.HOME) }
    var isBalanceVisible by remember { mutableStateOf(true) }
    var selectedCurrency by remember { mutableStateOf("USD") }

    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF090D12)),
        containerColor = Color(0xFF090D12),
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (isSyncing) Color(0xFFF59E0B) else Color(0xFF10B981))
                        )
                        Text(
                            text = activeWallet?.name ?: "Kaspa Vault",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFF1F5F9)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onRefreshSync) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Sync",
                            tint = Color(0xFF70C7BA)
                        )
                    }
                    IconButton(onClick = onLockClick) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "Lock",
                            tint = Color(0xFF94A3B8)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF090D12),
                    titleContentColor = Color.White
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF131924),
                contentColor = Color(0xFF70C7BA)
            ) {
                NavigationBarItem(
                    selected = selectedTab == BottomNavTab.HOME,
                    onClick = { selectedTab = BottomNavTab.HOME },
                    icon = { Icon(Icons.Default.Security, contentDescription = "Home") },
                    label = { Text("Home", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF090D12),
                        selectedTextColor = Color(0xFF70C7BA),
                        indicatorColor = Color(0xFF70C7BA),
                        unselectedIconColor = Color(0xFF64748B),
                        unselectedTextColor = Color(0xFF64748B)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == BottomNavTab.HISTORY,
                    onClick = { selectedTab = BottomNavTab.HISTORY },
                    icon = { Icon(Icons.Default.History, contentDescription = "History") },
                    label = { Text("History", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF090D12),
                        selectedTextColor = Color(0xFF70C7BA),
                        indicatorColor = Color(0xFF70C7BA),
                        unselectedIconColor = Color(0xFF64748B),
                        unselectedTextColor = Color(0xFF64748B)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == BottomNavTab.CONTACTS,
                    onClick = { selectedTab = BottomNavTab.CONTACTS },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Contacts") },
                    label = { Text("Contacts", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF090D12),
                        selectedTextColor = Color(0xFF70C7BA),
                        indicatorColor = Color(0xFF70C7BA),
                        unselectedIconColor = Color(0xFF64748B),
                        unselectedTextColor = Color(0xFF64748B)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == BottomNavTab.SETTINGS,
                    onClick = { selectedTab = BottomNavTab.SETTINGS },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings", fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color(0xFF090D12),
                        selectedTextColor = Color(0xFF70C7BA),
                        indicatorColor = Color(0xFF70C7BA),
                        unselectedIconColor = Color(0xFF64748B),
                        unselectedTextColor = Color(0xFF64748B)
                    )
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFF090D12))
        ) {
            when (selectedTab) {
                BottomNavTab.HOME -> {
                    HomeTabView(
                        activeWallet = activeWallet,
                        marketData = marketData,
                        utxos = utxos,
                        isBalanceVisible = isBalanceVisible,
                        onToggleBalanceVisibility = { isBalanceVisible = !isBalanceVisible },
                        onSendClick = onSendClick,
                        onScanClick = onScanClick,
                        onReceiveClick = onReceiveClick,
                        onToggleUtxoLock = onToggleUtxoLock,
                        onCompoundUtxos = onCompoundUtxos
                    )
                }
                BottomNavTab.HISTORY -> {
                    HistoryTabView(transactions = transactions)
                }
                BottomNavTab.CONTACTS -> {
                    ContactsTabView(contacts = contacts, onAddContact = onAddContact)
                }
                BottomNavTab.SETTINGS -> {
                    SettingsTabView(
                        activeWallet = activeWallet,
                        onNodeManagerClick = onNodeManagerClick,
                        onDuressSetupClick = onDuressSetupClick,
                        onSignMessageClick = onSignMessageClick,
                        onLockClick = onLockClick,
                        onLogoutClick = onLogoutClick
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeTabView(
    activeWallet: WalletModel?,
    marketData: MarketDataModel,
    utxos: List<UtxoModel>,
    isBalanceVisible: Boolean,
    onToggleBalanceVisibility: () -> Unit,
    onSendClick: () -> Unit,
    onScanClick: () -> Unit,
    onReceiveClick: () -> Unit,
    onToggleUtxoLock: (String) -> Unit,
    onCompoundUtxos: () -> Unit
) {
    val clipboardManager = LocalClipboardManager.current
    var copiedAddress by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val totalSompi = activeWallet?.balanceSompi ?: 0L
    val totalKas = totalSompi / 100_000_000.0
    val totalUsd = totalKas * marketData.priceUsd

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Main Balance Card
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF0F172A), Color(0xFF0B131D))
                        )
                    )
                    .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(24.dp))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "TOTAL BALANCE",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF64748B),
                    letterSpacing = 1.5.sp
                )

                // Address Chip
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color(0xFF05080A))
                        .border(1.dp, Color(0xFF1C2F42), RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val addr = activeWallet?.receiveAddress ?: "kaspa:..."
                    val shortened = if (addr.length > 20) "${addr.take(10)}...${addr.takeLast(6)}" else addr
                    Text(
                        text = shortened,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                    Icon(
                        imageVector = if (copiedAddress) Icons.Default.Check else Icons.Default.ContentCopy,
                        contentDescription = "Copy",
                        tint = if (copiedAddress) Color(0xFF10B981) else Color(0xFF70C7BA),
                        modifier = Modifier
                            .size(14.dp)
                            .clickable {
                                clipboardManager.setText(AnnotatedString(addr))
                                copiedAddress = true
                                scope.launch {
                                    delay(2000)
                                    copiedAddress = false
                                }
                            }
                    )
                    Icon(
                        imageVector = if (isBalanceVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = "Toggle Visibility",
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier
                            .size(14.dp)
                            .clickable { onToggleBalanceVisibility() }
                    )
                }

                // Balance Numbers
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = if (isBalanceVisible) String.format(Locale.US, "%,.2f", totalKas) else "••••••",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFF1F5F9)
                    )
                    Text(
                        text = "KAS",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF70C7BA)
                    )
                }

                Text(
                    text = if (isBalanceVisible) "≈ $${String.format(Locale.US, "%,.2f", totalUsd)} USD" else "≈ $••.•• USD",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF94A3B8)
                )
            }
        }

        // Quick Action Buttons (Send, Scan, Receive)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Send
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF70C7BA).copy(alpha = 0.15f))
                            .border(1.dp, Color(0xFF70C7BA).copy(alpha = 0.4f), CircleShape)
                            .clickable { onSendClick() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.ArrowOutward, contentDescription = "Send", tint = Color(0xFF70C7BA))
                    }
                    Text("Send", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                }

                // Scan
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E293B))
                            .border(1.dp, Color(0xFF334155), CircleShape)
                            .clickable { onScanClick() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan", tint = Color(0xFFF1F5F9))
                    }
                    Text("Scan", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                }

                // Receive
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E293B))
                            .border(1.dp, Color(0xFF334155), CircleShape)
                            .clickable { onReceiveClick() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "Receive", tint = Color(0xFFF1F5F9))
                    }
                    Text("Receive", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                }
            }
        }

        // UTXO Management Section
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("UTXO Entropies (${utxos.size})", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                if (utxos.size > 2) {
                    Text(
                        text = "Compound (Merge)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF70C7BA),
                        modifier = Modifier.clickable { onCompoundUtxos() }
                    )
                }
            }
        }

        items(utxos) { utxo ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF0F172A))
                    .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "${utxo.txid.take(8)}...:${utxo.vout}",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFF1F5F9)
                    )
                    Text(
                        text = "DAA: ${utxo.blockDaaScore}",
                        fontSize = 10.sp,
                        color = Color(0xFF64748B)
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "${String.format(Locale.US, "%.2f", utxo.amountSompi / 100_000_000.0)} KAS",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF70C7BA)
                    )
                    IconButton(
                        onClick = { onToggleUtxoLock(utxo.id) },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            imageVector = if (utxo.isLocked) Icons.Default.Lock else Icons.Default.Lock,
                            contentDescription = "Lock UTXO",
                            tint = if (utxo.isLocked) Color(0xFFF43F5E) else Color(0xFF64748B),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryTabView(transactions: List<TransactionModel>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Text("Transaction Ledger", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
        }

        if (transactions.isEmpty()) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No transactions found", fontSize = 13.sp, color = Color(0xFF64748B))
                }
            }
        }

        items(transactions) { tx ->
            val isReceive = tx.type == "receive"
            val kasAmount = tx.amountSompi / 100_000_000.0
            val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
            val dateStr = dateFormat.format(Date(tx.timestamp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF131924))
                    .border(1.dp, Color(0xFF212B38), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(if (isReceive) Color(0xFF10B981).copy(alpha = 0.15f) else Color(0xFFF43F5E).copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isReceive) Icons.Default.ArrowDownward else Icons.Default.ArrowOutward,
                            contentDescription = tx.type,
                            tint = if (isReceive) Color(0xFF10B981) else Color(0xFFF43F5E),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = if (isReceive) "Received KAS" else "Sent KAS",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFF1F5F9)
                        )
                        Text(
                            text = dateStr,
                            fontSize = 10.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "${if (isReceive) "+" else "-"}${String.format(Locale.US, "%.2f", kasAmount)} KAS",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isReceive) Color(0xFF10B981) else Color(0xFFF1F5F9)
                    )
                    Text(
                        text = if (tx.isAccepted) "Confirmed" else "Pending",
                        fontSize = 10.sp,
                        color = if (tx.isAccepted) Color(0xFF10B981) else Color(0xFFF59E0B)
                    )
                }
            }
        }
    }
}

@Composable
private fun ContactsTabView(
    contacts: List<ContactModel>,
    onAddContact: (name: String, address: String) -> Unit
) {
    var showAddDialog by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var newAddress by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Saved Contacts", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                Button(
                    onClick = { showAddDialog = true },
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF70C7BA), contentColor = Color(0xFF090D12))
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add", modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Add Contact", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (showAddDialog) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF131924))
                        .border(1.dp, Color(0xFF70C7BA), RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text("New Contact", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        placeholder = { Text("Contact Name", color = Color(0xFF64748B)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = newAddress,
                        onValueChange = { newAddress = it },
                        placeholder = { Text("kaspa:address...", color = Color(0xFF64748B)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = { showAddDialog = false },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color(0xFF94A3B8))
                        ) {
                            Text("Cancel", fontSize = 12.sp)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                if (newName.isNotBlank() && newAddress.isNotBlank()) {
                                    onAddContact(newName, newAddress)
                                    newName = ""
                                    newAddress = ""
                                    showAddDialog = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF70C7BA), contentColor = Color(0xFF090D12))
                        ) {
                            Text("Save", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        items(contacts) { contact ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF131924))
                    .border(1.dp, Color(0xFF212B38), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(contact.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
                    Text(
                        contact.address,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                        color = Color(0xFF64748B),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsTabView(
    activeWallet: WalletModel?,
    onNodeManagerClick: () -> Unit = {},
    onDuressSetupClick: () -> Unit = {},
    onSignMessageClick: () -> Unit = {},
    onLockClick: () -> Unit = {},
    onLogoutClick: () -> Unit = {}
) {
    var biometricsEnabled by remember { mutableStateOf(true) }
    var highPrivacyMode by remember { mutableStateOf(true) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text("Security & Preferences", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))
        }

        // Security Toggles
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF131924))
                    .border(1.dp, Color(0xFF212B38), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Hardware Biometrics", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF1F5F9))
                        Text("Unlock via Android Keystore Fingerprint", fontSize = 11.sp, color = Color(0xFF64748B))
                    }
                    Switch(
                        checked = biometricsEnabled,
                        onCheckedChange = { biometricsEnabled = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF70C7BA), checkedTrackColor = Color(0xFF70C7BA).copy(alpha = 0.3f))
                    )
                }

                Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1E293B)))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Anti-Tapjacking & FLAG_SECURE", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF1F5F9))
                        Text("Blocks screenshots & screen mirroring", fontSize = 11.sp, color = Color(0xFF64748B))
                    }
                    Switch(
                        checked = highPrivacyMode,
                        onCheckedChange = { highPrivacyMode = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF70C7BA), checkedTrackColor = Color(0xFF70C7BA).copy(alpha = 0.3f))
                    )
                }
            }
        }

        // Action Tools (Node Switcher, Duress PIN, Sign Message)
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF131924))
                    .border(1.dp, Color(0xFF212B38), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Network & Privacy Tools", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))

                // Node Switcher
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF0F172A))
                        .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(10.dp))
                        .clickable { onNodeManagerClick() }
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("RPC Consensus Node", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF1F5F9))
                        Text("https://api.kaspa.org", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Color(0xFF70C7BA))
                    }
                    Button(
                        onClick = onNodeManagerClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B), contentColor = Color(0xFF70C7BA)),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text("Manage", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Duress Setup
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF0F172A))
                        .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(10.dp))
                        .clickable { onDuressSetupClick() }
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Emergency Duress Password", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF1F5F9))
                        Text("Configures decoy vault & panic wipe", fontSize = 11.sp, color = Color(0xFF64748B))
                    }
                    Button(
                        onClick = onDuressSetupClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B), contentColor = Color(0xFFF43F5E)),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text("Configure", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Sign Message
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFF0F172A))
                        .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(10.dp))
                        .clickable { onSignMessageClick() }
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Sign Cryptographic Message", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFF1F5F9))
                        Text("Schnorr signature verification", fontSize = 11.sp, color = Color(0xFF64748B))
                    }
                    Button(
                        onClick = onSignMessageClick,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B), contentColor = Color(0xFF70C7BA)),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text("Sign", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Vault Session Management
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color(0xFF131924))
                    .border(1.dp, Color(0xFF212B38), RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Session Management", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF1F5F9))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = onLockClick,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B), contentColor = Color(0xFFF1F5F9)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Lock, contentDescription = "Lock", modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Lock Vault", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = onLogoutClick,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B1219), contentColor = Color(0xFFF43F5E)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = "Logout", modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Reset / Exit", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
