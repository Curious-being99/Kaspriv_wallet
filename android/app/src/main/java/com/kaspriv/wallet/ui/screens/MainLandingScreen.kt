package com.kaspriv.wallet.ui.screens

import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.ui.theme.*

@Composable
fun KaspaBlackLogoView(
    modifier: Modifier = Modifier,
    size: Dp = 80.dp,
    cornerRadius: Dp = 20.dp
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(cornerRadius))
            .background(Color(0xFF000000))
            .border(1.dp, Color(0xFF212B38), RoundedCornerShape(cornerRadius)),
        contentAlignment = Alignment.Center
    ) {
        Canvas(
            modifier = Modifier.size(size * 0.65f)
        ) {
            val scaleX = this.size.width / 512f
            val scaleY = this.size.height / 512f

            // Left Chevron (M86 100 H166 L286 256 L166 412 H86 L206 256 L86 100 Z)
            val leftChevron = Path().apply {
                moveTo(86f * scaleX, 100f * scaleY)
                lineTo(166f * scaleX, 100f * scaleY)
                lineTo(286f * scaleX, 256f * scaleY)
                lineTo(166f * scaleX, 412f * scaleY)
                lineTo(86f * scaleX, 412f * scaleY)
                lineTo(206f * scaleX, 256f * scaleY)
                close()
            }

            // Right Chevron (M226 100 H306 L426 256 L306 412 H226 L346 256 L226 100 Z)
            val rightChevron = Path().apply {
                moveTo(226f * scaleX, 100f * scaleY)
                lineTo(306f * scaleX, 100f * scaleY)
                lineTo(426f * scaleX, 256f * scaleY)
                lineTo(306f * scaleX, 412f * scaleY)
                lineTo(226f * scaleX, 412f * scaleY)
                lineTo(346f * scaleX, 256f * scaleY)
                close()
            }

            drawPath(
                path = leftChevron,
                color = Color(0xFF70C7BA)
            )
            drawPath(
                path = rightChevron,
                color = Color(0xFF70C7BA)
            )
        }
    }
}

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
        
        // Sleek Black Kaspa >> Logo (Zero Top Logo, Replaces K placeholder)
        KaspaBlackLogoView(size = 80.dp, cornerRadius = 20.dp)
        
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
