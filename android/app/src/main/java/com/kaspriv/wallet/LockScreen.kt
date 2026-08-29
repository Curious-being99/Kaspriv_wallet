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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallMade
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class PendingTxDetails(
    val amountKAS: String,
    val feeKAS: String,
    val toAddress: String,
    val note: String? = null
)

/**
 * 1:1 Kotlin Jetpack Compose implementation of LockScreen.tsx
 * Supports password unlocking, hardware biometrics authorization,
 * pending transaction preview & signature, and secure duress logic.
 */
@Composable
fun LockScreen(
    isLocked: Boolean,
    isBiometricsEnabled: Boolean = true,
    isPendingLogout: Boolean = false,
    pendingTx: PendingTxDetails? = null,
    onUnlockWithPassword: (String) -> Unit,
    onUnlockWithBiometrics: () -> Unit,
    onCancelPendingTx: () -> Unit = {},
    onCancelLogout: () -> Unit = {}
) {
    if (!isLocked) return

    var password by remember { mutableStateOf("") }
    var isDecrypting by remember { mutableStateOf(false) }
    var isAuthenticatingBio by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showPassword by remember { mutableStateOf(false) }

    val isPendingTx = pendingTx != null

    // Auto-prompt biometrics if enabled
    LaunchedEffect(isLocked) {
        if (isLocked && isBiometricsEnabled) {
            isAuthenticatingBio = true
            onUnlockWithBiometrics()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF090D12))
            .padding(horizontal = 24.dp, vertical = 32.dp),
        contentAlignment = Alignment.Center
    ) {
        // Decorative background gradient
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(300.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF70C7BA).copy(alpha = 0.08f), Color.Transparent)
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Icon Badge
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF1C2F42), Color(0xFF0B151E))
                        )
                    )
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isPendingTx) Icons.Default.CallMade else Icons.Default.Lock,
                    contentDescription = "Lock Status",
                    tint = Color(0xFF70C7BA),
                    modifier = Modifier.size(28.dp)
                )
            }

            // Title & Subtitle
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = when {
                        isPendingLogout -> "Unlock to Log Out"
                        isPendingTx -> "Authorize Transaction"
                        else -> "Wallet Locked"
                    },
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF1F5F9)
                )
                Text(
                    text = when {
                        isPendingLogout -> "Enter your password to authorize log out"
                        isPendingTx -> "Authenticate with password or biometrics to sign & broadcast"
                        else -> "Enter your password to continue"
                    },
                    fontSize = 12.sp,
                    color = Color(0xFF94A3B8),
                    textAlign = TextAlign.Center
                )
            }

            // Pending Tx Details Card (1:1 with LockScreen.tsx)
            if (isPendingTx && pendingTx != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF131924))
                        .border(1.dp, Color(0xFF212B38), RoundedCornerShape(12.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Amount", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF94A3B8))
                        Text("${pendingTx.amountKAS} KAS", fontSize = 14.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = Color(0xFF70C7BA))
                    }
                    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C2F42)))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Priority Fee", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text("${pendingTx.feeKAS} KAS", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Color(0xFFE2E8F0))
                    }
                    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C2F42)))
                    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("To Recipient", fontSize = 10.sp, color = Color(0xFF94A3B8))
                        Text(
                            text = pendingTx.toAddress,
                            fontSize = 9.5.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFE2E8F0),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    if (!pendingTx.note.isNullOrBlank()) {
                        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C2F42)))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Memo", fontSize = 10.sp, color = Color(0xFF94A3B8))
                            Text(pendingTx.note, fontSize = 10.sp, color = Color(0xFFCBD5E1), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }

            // Password Input Field
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = password,
                    onValueChange = {
                        password = it
                        errorMessage = null
                    },
                    placeholder = { Text("Enter password", fontSize = 14.sp, color = Color(0xFF64748B)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF0B151E),
                        unfocusedContainerColor = Color(0xFF0B151E),
                        focusedBorderColor = Color(0xFF70C7BA),
                        unfocusedBorderColor = if (errorMessage != null) Color(0xFFF43F5E) else Color(0xFF1C2F42),
                        focusedTextColor = Color(0xFFF1F5F9),
                        unfocusedTextColor = Color(0xFFF1F5F9)
                    ),
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        if (password.isNotEmpty() && !isDecrypting) {
                            isDecrypting = true
                            onUnlockWithPassword(password)
                        }
                    }),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = "Toggle password visibility",
                                tint = Color(0xFF64748B),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    },
                    singleLine = true
                )

                // Biometrics Shortcut Button
                if (isBiometricsEnabled) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !isDecrypting) {
                                isAuthenticatingBio = true
                                onUnlockWithBiometrics()
                            }
                            .padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Fingerprint,
                            contentDescription = "Biometrics",
                            tint = Color(0xFF70C7BA).copy(alpha = 0.8f),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = when {
                                isAuthenticatingBio -> "Prompting Biometrics..."
                                isPendingTx -> "Tap fingerprint to authorize & broadcast"
                                else -> "Tap fingerprint to unlock with Biometrics"
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF70C7BA).copy(alpha = 0.85f)
                        )
                    }
                }

                // Error alert
                AnimatedVisibility(visible = errorMessage != null, enter = fadeIn(), exit = fadeOut()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Error",
                            tint = Color(0xFFFB7185),
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = errorMessage ?: "",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFFFB7185)
                        )
                    }
                }
            }

            // Action Buttons
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = {
                        if (password.isNotEmpty() && !isDecrypting) {
                            isDecrypting = true
                            onUnlockWithPassword(password)
                        }
                    },
                    enabled = password.isNotEmpty() && !isDecrypting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isPendingLogout) Color(0xFFF43F5E) else Color(0xFF70C7BA),
                        contentColor = if (isPendingLogout) Color.White else Color(0xFF090D12),
                        disabledContainerColor = Color(0xFF1C2F42).copy(alpha = 0.6f),
                        disabledContentColor = Color(0xFF64748B)
                    )
                ) {
                    if (isDecrypting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color(0xFF090D12))
                    } else {
                        Row(
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = if (isPendingTx) Icons.Default.CallMade else Icons.Default.LockOpen,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = when {
                                    isPendingLogout -> "Unlock & Log Out"
                                    isPendingTx -> "Authorize & Sign Transaction"
                                    else -> "Unlock"
                                },
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                if (isPendingTx) {
                    Button(
                        onClick = onCancelPendingTx,
                        modifier = Modifier.fillMaxWidth().height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color(0xFF94A3B8))
                    ) {
                        Text("Cancel Transaction", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                if (isPendingLogout) {
                    Button(
                        onClick = onCancelLogout,
                        modifier = Modifier.fillMaxWidth().height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color(0xFF94A3B8))
                    ) {
                        Text("Cancel Log Out", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
