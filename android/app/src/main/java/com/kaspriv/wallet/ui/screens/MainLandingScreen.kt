package com.kaspriv.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.ui.theme.*

@Composable
fun MainLandingScreen(
    onCreateWallet: () -> Unit,
    onImportSeed: () -> Unit,
    onWatchAddress: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBgBase)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.weight(1f))
        
        // Logo / Branding Placeholder
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(KaspaTeal.copy(alpha = 0.1f), RoundedCornerShape(20.dp))
                .border(1.dp, KaspaTeal.copy(alpha = 0.3f), RoundedCornerShape(20.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text("K", color = KaspaTeal, fontSize = 40.sp, fontWeight = FontWeight.Bold)
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Welcome to Kaspriv",
            color = Slate100,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = "Private & Decentralized Kaspa Wallet",
            color = Slate400,
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 8.dp)
        )
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Buttons
        ActionButton(
            icon = Icons.Default.Add,
            title = "Create New Wallet",
            subtitle = "Generate a new 24-word seed phrase",
            onClick = onCreateWallet,
            isPrimary = true
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        ActionButton(
            icon = Icons.Default.Download,
            title = "Import Seed Phrase",
            subtitle = "Restore an existing Kaspa wallet",
            onClick = onImportSeed
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        ActionButton(
            icon = Icons.Default.Visibility,
            title = "Watch-Only Address",
            subtitle = "Track balance without private keys",
            onClick = onWatchAddress
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Footer
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(KaspaTeal)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text("Kaspa BlockDAG Network", color = Slate500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("Schnorr Security", color = Slate500, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun ActionButton(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    isPrimary: Boolean = false
) {
    val bgColor = if (isPrimary) KaspaTeal else DarkBgCard
    val contentColor = if (isPrimary) DarkBgBase else Slate100
    val borderColor = if (isPrimary) Color.Transparent else DarkBgBorder
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor)
            .border(1.dp, borderColor, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (isPrimary) DarkBgBase.copy(alpha = 0.2f) else DarkBgElevated),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isPrimary) DarkBgBase else KaspaTeal,
                modifier = Modifier.size(20.dp)
            )
        }
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Column {
            Text(
                text = title,
                color = contentColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = subtitle,
                color = if (isPrimary) DarkBgBase.copy(alpha = 0.7f) else Slate400,
                fontSize = 12.sp
            )
        }
    }
}
