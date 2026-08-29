package com.kaspriv.wallet.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.ui.theme.KaspaTeal
import com.kaspriv.wallet.ui.theme.Slate100

@Composable
fun ActionShortcuts(
    onSend: () -> Unit,
    onScan: () -> Unit,
    onReceive: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Send Button
        ActionItem(
            icon = Icons.Default.ArrowUpward,
            label = "Send",
            isPrimary = true,
            onClick = onSend
        )
        
        Spacer(modifier = Modifier.width(32.dp))
        
        // Scan Button
        ActionItem(
            icon = Icons.Default.QrCodeScanner,
            label = "Scan",
            isPrimary = false,
            onClick = onScan
        )
        
        Spacer(modifier = Modifier.width(32.dp))
        
        // Receive Button
        ActionItem(
            icon = Icons.Default.ArrowDownward,
            label = "Receive",
            isPrimary = true,
            onClick = onReceive
        )
    }
}

@Composable
private fun ActionItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isPrimary: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = KaspaTeal,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            color = if (isPrimary) KaspaTeal else Slate100,
            fontSize = 14.sp,
            fontWeight = FontWeight.ExtraBold
        )
    }
}
