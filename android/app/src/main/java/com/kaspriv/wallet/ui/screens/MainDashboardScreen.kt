package com.kaspriv.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.ui.components.MainCard
import com.kaspriv.wallet.ui.components.ActionShortcuts
import com.kaspriv.wallet.ui.theme.*

import androidx.compose.runtime.collectAsState
import com.kaspriv.wallet.ui.viewmodels.WalletViewModel

@Composable
fun MainDashboardScreen(
    viewModel: WalletViewModel
) {
    var activeTab by remember { mutableStateOf("home") }
    var showSendScreen by remember { mutableStateOf(false) }
    var showReceiveScreen by remember { mutableStateOf(false) }
    
    val activeWallet by viewModel.activeWallet.collectAsState()
    
    // Safely fallback if the state isn't loaded yet
    val receiveAddress = activeWallet?.receiveAddress ?: "Loading..."
    val balanceKas = viewModel.formatKas(activeWallet?.balanceSompi ?: 0L)
    val fiatValue = viewModel.calculateFiat(activeWallet?.balanceSompi ?: 0L)
    val currencySymbol = "$"

    if (showSendScreen) {
        SendScreen(balanceKas = balanceKas, onBack = { showSendScreen = false })
        return
    }

    if (showReceiveScreen) {
        ReceiveScreen(receiveAddress = receiveAddress, onBack = { showReceiveScreen = false })
        return
    }

    Scaffold(
        bottomBar = {
            MobileBottomNav(
                activeTab = activeTab,
                onTabSelected = { activeTab = it }
            )
        },
        containerColor = DarkBgBase
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when (activeTab) {
                "home" -> {
                    MainCard(
                        receiveAddress = receiveAddress,
                        balanceKas = balanceKas,
                        fiatValue = fiatValue,
                        currencySymbol = currencySymbol
                    )
                    
                    ActionShortcuts(
                        onSend = { showSendScreen = true },
                        onScan = {},
                        onReceive = { showReceiveScreen = true }
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Recent Activity", color = Slate100, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text("See All", color = KaspaTeal, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }

                    Spacer(modifier = Modifier.weight(1f))
                }
                "history" -> {
                    HistoryScreen()
                }
                "contacts" -> {
                    ContactsScreen()
                }
                "settings" -> {
                    SettingsScreen()
                }
            }
        }
    }
}

@Composable
fun MobileBottomNav(
    activeTab: String,
    onTabSelected: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF090D12))
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically
    ) {
        BottomNavItem("home", "Wallet", Icons.Default.Wallet, activeTab, onTabSelected)
        BottomNavItem("history", "History", Icons.Default.History, activeTab, onTabSelected)
        BottomNavItem("contacts", "Contacts", Icons.Default.People, activeTab, onTabSelected)
        BottomNavItem("settings", "Settings", Icons.Default.Settings, activeTab, onTabSelected)
    }
}

@Composable
fun BottomNavItem(
    id: String,
    label: String,
    icon: ImageVector,
    activeTab: String,
    onClick: (String) -> Unit
) {
    val isActive = activeTab == id
    val color = if (isActive) KaspaTeal else Slate400
    
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick(id) }
            .padding(vertical = 4.dp, horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = color,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = label,
            color = color,
            fontSize = 10.sp,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.SemiBold
        )
    }
}
