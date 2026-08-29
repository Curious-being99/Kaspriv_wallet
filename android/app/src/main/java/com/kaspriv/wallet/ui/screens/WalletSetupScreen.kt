package com.kaspriv.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.core.KaspaNativeCore
import com.kaspriv.wallet.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletSetupScreen(
    onBack: () -> Unit,
    onComplete: (mnemonic: String, derivedAddress: String) -> Unit
) {
    var generatedMnemonic by remember { mutableStateOf<String?>(null) }
    var isGenerating by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    // Generate mnemonic natively on mount
    LaunchedEffect(Unit) {
        isGenerating = true
        // Offload JNI call to IO dispatcher to prevent UI thread blocking
        generatedMnemonic = withContext(Dispatchers.IO) {
            try {
                KaspaNativeCore.generateMnemonic()
            } catch (e: Exception) {
                // If the .so binary isn't compiled yet, fallback or show error
                "Native Rust library not yet compiled. (Requires NDK build)"
            }
        }
        isGenerating = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Secure Setup", color = Slate100, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Slate400)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DarkBgBase
                )
            )
        },
        containerColor = DarkBgBase
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp)
        ) {
            Text(
                text = "Your Recovery Phrase",
                color = Slate100,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Write down these 24 words in exact order. This is generated directly in memory using the native Rust Kaspa core. No JavaScript engines are involved.",
                color = Slate400,
                fontSize = 14.sp
            )
            
            Spacer(modifier = Modifier.height(32.dp))

            if (isGenerating) {
                CircularProgressIndicator(color = KaspaTeal, modifier = Modifier.align(Alignment.CenterHorizontally))
            } else {
                // Seed Phrase Display Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkBgCard, RoundedCornerShape(16.dp))
                        .padding(20.dp)
                ) {
                    Text(
                        text = generatedMnemonic ?: "Error generating seed.",
                        color = KaspaTeal,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium,
                        lineHeight = 28.sp
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Warning Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Rose500.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Warning, contentDescription = null, tint = Rose500)
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Never share this phrase. Anyone with these words can steal your Kaspa.",
                    color = Rose500,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Confirm Button
            Button(
                onClick = { 
                    generatedMnemonic?.let { 
                        // Pure Native Call - NO simulation. 
                        // This strictly requires libkaspa_android.so to be compiled and present.
                        val derivedAddress = KaspaNativeCore.deriveAddress(it, null, "m/44'/111111'/0'/0/0", true)
                        onComplete(it, derivedAddress) 
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = KaspaTeal,
                    contentColor = DarkBgBase
                )
            ) {
                Text("I've Saved It Securely", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
