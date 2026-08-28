package com.kaspriv.wallet.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * 1:1 Kotlin Jetpack Compose implementation of Duress & Primary Security Password Setup
 * from src/components/WalletSetupModal.tsx ('setup-password' & 'setup-duress' flows)
 * 
 * Features:
 * - Primary Encryption Password with real-time strength meter & warning feedback
 * - Emergency Duress Password (Optional Panic Wipe Trigger)
 * - Strict collision checks: Duress password MUST NEVER equal Primary password
 * - Instant purge defense mechanism on lock screen
 */

enum class SecurityStep {
    PRIMARY_PASSWORD,
    DURESS_PASSWORD
}

data class PasswordStrength(
    val score: Int, // 1 to 4
    val label: String,
    val color: Color,
    val feedback: String? = null
)

fun evaluatePasswordStrength(password: String): PasswordStrength {
    if (password.isEmpty()) return PasswordStrength(0, "Empty", Color.Gray)
    var score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (password.any { it.isDigit() } && password.any { it.isLetter() }) score++
    if (password.any { !it.isLetterOrDigit() }) score++

    return when (score) {
        1 -> PasswordStrength(1, "Weak", Color(0xFFEF4444), "Add uppercase, numbers, and symbols")
        2 -> PasswordStrength(2, "Fair", Color(0xFFF59E0B), "Consider making it longer than 10 chars")
        3 -> PasswordStrength(3, "Good", Color(0xFF38BDF8), null)
        else -> PasswordStrength(4, "Strong", Color(0xFF34D399), null)
    }
}

@Composable
fun DuressSecuritySetupModal(
    isOpen: Boolean,
    onClose: () -> Unit,
    onCompleteSecuritySetup: (primaryPassword: String, duressPassword: String?) -> Unit
) {
    if (!isOpen) return

    var currentStep by remember { mutableStateOf(SecurityStep.PRIMARY_PASSWORD) }
    
    // Primary password states
    var primaryPassword by remember { mutableStateOf("") }
    var confirmPrimaryPassword by remember { mutableStateOf("") }
    var showPrimaryPassword by remember { mutableStateOf(false) }

    // Duress password states
    var duressPassword by remember { mutableStateOf("") }
    var confirmDuressPassword by remember { mutableStateOf("") }
    var showDuressPassword by remember { mutableStateOf(false) }

    var errorMessage by remember { mutableStateOf<String?>(null) }

    val primaryStrength = evaluatePasswordStrength(primaryPassword)
    val isPrimaryValid = primaryStrength.score >= 2 && 
            primaryPassword.length >= 8 && 
            primaryPassword == confirmPrimaryPassword

    val isDuressCollision = duressPassword.isNotEmpty() && duressPassword == primaryPassword
    val isDuressValid = duressPassword.isEmpty() || (
            !isDuressCollision &&
            duressPassword.length >= 8 &&
            duressPassword == confirmDuressPassword
    )

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.75f))
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.92f)
                    .wrapContentHeight()
                    .clickable(enabled = false) {},
                shape = RoundedCornerShape(24.dp),
                color = CardDarkBg,
                border = BorderStroke(1.dp, CardBorderColor)
            ) {
                Column(
                    modifier = Modifier
                        .padding(24.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (currentStep == SecurityStep.DURESS_PASSWORD) {
                                IconButton(onClick = { currentStep = SecurityStep.PRIMARY_PASSWORD }) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                        contentDescription = "Back",
                                        tint = SlateGrayText
                                    )
                                }
                            }
                            Text(
                                text = if (currentStep == SecurityStep.PRIMARY_PASSWORD) "Set Security Password" else "Emergency Duress Password",
                                color = Color.White,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        IconButton(onClick = onClose) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                                tint = SlateGrayText
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    if (currentStep == SecurityStep.PRIMARY_PASSWORD) {
                        // PRIMARY PASSWORD SETUP
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            // Banner
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(PrimaryTeal.copy(alpha = 0.08f))
                                    .border(1.dp, PrimaryTeal.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                    .padding(12.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Shield,
                                    contentDescription = null,
                                    tint = PrimaryTeal,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "Security Encryption Setup",
                                        color = PrimaryTeal,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Create a strong password to encrypt and unlock your seed phrase securely on this device.",
                                        color = SlateGrayText,
                                        fontSize = 11.sp,
                                        lineHeight = 15.sp
                                    )
                                }
                            }

                            // Password Input
                            Column {
                                Text(
                                    text = "NEW PASSWORD",
                                    color = SlateGrayText,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                OutlinedTextField(
                                    value = primaryPassword,
                                    onValueChange = { primaryPassword = it },
                                    modifier = Modifier.fillMaxWidth(),
                                    placeholder = { Text("Strong password required", color = Color(0xFF475569)) },
                                    visualTransformation = if (showPrimaryPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                    trailingIcon = {
                                        IconButton(onClick = { showPrimaryPassword = !showPrimaryPassword }) {
                                            Icon(
                                                imageVector = if (showPrimaryPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                                contentDescription = null,
                                                tint = SlateGrayText
                                            )
                                        }
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = DarkCanvasBg,
                                        unfocusedContainerColor = DarkCanvasBg,
                                        focusedBorderColor = PrimaryTeal,
                                        unfocusedBorderColor = CardBorderColor,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    )
                                )

                                if (primaryPassword.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(text = "Strength", color = SlateGrayText, fontSize = 10.sp)
                                        Text(
                                            text = primaryStrength.label.uppercase(),
                                            color = primaryStrength.color,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Black
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        (1..4).forEach { step ->
                                            Box(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .height(4.dp)
                                                    .clip(RoundedCornerShape(2.dp))
                                                    .background(if (step <= primaryStrength.score) primaryStrength.color else Color(0xFF1E293B))
                                            )
                                        }
                                    }
                                }
                            }

                            // Confirm Password Input
                            Column {
                                Text(
                                    text = "CONFIRM PASSWORD",
                                    color = SlateGrayText,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                OutlinedTextField(
                                    value = confirmPrimaryPassword,
                                    onValueChange = { confirmPrimaryPassword = it },
                                    modifier = Modifier.fillMaxWidth(),
                                    placeholder = { Text("Repeat password", color = Color(0xFF475569)) },
                                    visualTransformation = if (showPrimaryPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = DarkCanvasBg,
                                        unfocusedContainerColor = DarkCanvasBg,
                                        focusedBorderColor = if (confirmPrimaryPassword.isNotEmpty() && confirmPrimaryPassword != primaryPassword) Color(0xFFEF4444) else PrimaryTeal,
                                        unfocusedBorderColor = if (confirmPrimaryPassword.isNotEmpty() && confirmPrimaryPassword != primaryPassword) Color(0xFFEF4444).copy(alpha = 0.5f) else CardBorderColor,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    )
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Button(
                                onClick = { currentStep = SecurityStep.DURESS_PASSWORD },
                                enabled = isPrimaryValid,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PrimaryTeal,
                                    contentColor = DarkCanvasBg,
                                    disabledContainerColor = CardBorderColor,
                                    disabledContentColor = SlateGrayText
                                )
                            ) {
                                Text("Continue to Emergency Duress Setup", fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(imageVector = Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                        }
                    } else {
                        // EMERGENCY DURESS PASSWORD SETUP
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            // Panic Wipe Warning Banner
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFFEF4444).copy(alpha = 0.1f))
                                    .border(1.dp, Color(0xFFEF4444).copy(alpha = 0.25f), RoundedCornerShape(12.dp))
                                    .padding(12.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Icon(
                                    imageVector = Icons.Default.LocalFireDepartment,
                                    contentDescription = null,
                                    tint = Color(0xFFF87171),
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "Panic Wipe Defense (Optional)",
                                        color = Color(0xFFF87171),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "Entering this password on the lock screen immediately and irreversibly purges all local keys and wallet data.",
                                        color = Color(0xFFFCA5A5),
                                        fontSize = 11.sp,
                                        lineHeight = 15.sp
                                    )
                                }
                            }

                            // Duress Password Input
                            Column {
                                Text(
                                    text = "DURESS PASSWORD (OPTIONAL)",
                                    color = SlateGrayText,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                OutlinedTextField(
                                    value = duressPassword,
                                    onValueChange = { duressPassword = it },
                                    modifier = Modifier.fillMaxWidth(),
                                    placeholder = { Text("Enter emergency duress password", color = Color(0xFF475569)) },
                                    visualTransformation = if (showDuressPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                    trailingIcon = {
                                        IconButton(onClick = { showDuressPassword = !showDuressPassword }) {
                                            Icon(
                                                imageVector = if (showDuressPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                                contentDescription = null,
                                                tint = SlateGrayText
                                            )
                                        }
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = DarkCanvasBg,
                                        unfocusedContainerColor = DarkCanvasBg,
                                        focusedBorderColor = if (isDuressCollision) Color(0xFFEF4444) else Color(0xFFF87171),
                                        unfocusedBorderColor = if (isDuressCollision) Color(0xFFEF4444) else CardBorderColor,
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    )
                                )

                                if (isDuressCollision) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = "Duress password must be completely different from your primary password!",
                                        color = Color(0xFFF87171),
                                        fontSize = 11.sp
                                    )
                                }
                            }

                            // Confirm Duress Password
                            if (duressPassword.isNotEmpty()) {
                                Column {
                                    Text(
                                        text = "CONFIRM DURESS PASSWORD",
                                        color = SlateGrayText,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 1.sp
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedTextField(
                                        value = confirmDuressPassword,
                                        onValueChange = { confirmDuressPassword = it },
                                        modifier = Modifier.fillMaxWidth(),
                                        placeholder = { Text("Repeat emergency duress password", color = Color(0xFF475569)) },
                                        visualTransformation = if (showDuressPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                        shape = RoundedCornerShape(12.dp),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedContainerColor = DarkCanvasBg,
                                            unfocusedContainerColor = DarkCanvasBg,
                                            focusedBorderColor = if (confirmDuressPassword.isNotEmpty() && confirmDuressPassword != duressPassword) Color(0xFFEF4444) else Color(0xFFF87171),
                                            unfocusedBorderColor = CardBorderColor,
                                            focusedTextColor = Color.White,
                                            unfocusedTextColor = Color.White
                                        )
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Button(
                                onClick = {
                                    val finalDuress = if (duressPassword.isNotBlank()) duressPassword.trim() else null
                                    onCompleteSecuritySetup(primaryPassword.trim(), finalDuress)
                                    onClose()
                                },
                                enabled = isDuressValid,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (duressPassword.isNotEmpty()) Color(0xFFF87171) else PrimaryTeal,
                                    contentColor = DarkCanvasBg,
                                    disabledContainerColor = CardBorderColor,
                                    disabledContentColor = SlateGrayText
                                )
                            ) {
                                Icon(
                                    imageVector = if (duressPassword.isNotEmpty()) Icons.Default.DeleteSweep else Icons.Default.Lock,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (duressPassword.isNotEmpty()) "Encrypt & Finish with Duress Defense" else "Finish Wallet Setup (Skip Duress)",
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
