package com.kaspriv.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kaspriv.wallet.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SendScreen(
    balanceKas: String,
    onBack: () -> Unit
) {
    var recipientAddress by remember { mutableStateOf("") }
    var amountKas by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Send Kaspa", color = Slate100, fontSize = 18.sp) },
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
            // Balance Context
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Available Balance",
                    color = Slate400,
                    fontSize = 14.sp
                )
                Text(
                    text = "$balanceKas KAS",
                    color = KaspaTeal,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Recipient Field
            Text(
                text = "Recipient Address",
                color = Slate100,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = recipientAddress,
                onValueChange = { recipientAddress = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("kaspa:...", color = Slate500) },
                colors = OutlinedTextFieldDefaults.colors(
                    unfocusedBorderColor = Slate800,
                    focusedBorderColor = KaspaTeal,
                    unfocusedContainerColor = DarkBgCard,
                    focusedContainerColor = DarkBgCard,
                    unfocusedTextColor = Slate100,
                    focusedTextColor = Slate100
                ),
                shape = RoundedCornerShape(12.dp),
                trailingIcon = {
                    IconButton(onClick = { /* Launch Scanner */ }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan", tint = KaspaTeal)
                    }
                }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Amount Field
            Text(
                text = "Amount (KAS)",
                color = Slate100,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = amountKas,
                onValueChange = { amountKas = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("0.00", color = Slate500) },
                colors = OutlinedTextFieldDefaults.colors(
                    unfocusedBorderColor = Slate800,
                    focusedBorderColor = KaspaTeal,
                    unfocusedContainerColor = DarkBgCard,
                    focusedContainerColor = DarkBgCard,
                    unfocusedTextColor = Slate100,
                    focusedTextColor = Slate100
                ),
                shape = RoundedCornerShape(12.dp),
                trailingIcon = {
                    TextButton(onClick = { amountKas = balanceKas }) {
                        Text("MAX", color = KaspaTeal, fontWeight = FontWeight.Bold)
                    }
                }
            )

            Spacer(modifier = Modifier.weight(1f))

            // Review Button
            Button(
                onClick = { /* Continue to Review */ },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = KaspaTeal,
                    contentColor = DarkBgBase
                ),
                enabled = recipientAddress.isNotBlank() && amountKas.isNotBlank()
            ) {
                Icon(Icons.Default.ArrowUpward, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Review Transaction",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
