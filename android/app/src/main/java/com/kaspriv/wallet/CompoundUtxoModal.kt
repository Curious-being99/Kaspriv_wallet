package com.kaspriv.wallet

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch

@Composable
fun CompoundUtxoModal(
    activeWallet: WalletAccount,
    utxos: List<UtxoEntry>,
    onDismiss: () -> Unit,
    onExecuteCompound: suspend () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var isCompounding by remember { mutableStateOf(false) }

    val spendableUtxos = remember(utxos, activeWallet.lockedUtxos) {
        utxos.filter { !activeWallet.lockedUtxos.contains("${it.txId}:${it.outputIndex}") }
    }

    val utxosToCompound = remember(spendableUtxos) {
        spendableUtxos.take(80)
    }

    val countToCompound = utxosToCompound.size
    val totalInputSompi = remember(utxosToCompound) {
        utxosToCompound.sumOf { it.amountSompi }
    }

    // Dynamic Kaspa mass fee calculation: (inputs * 2000 + outputs * 1500)
    val feeSompi = remember(countToCompound) {
        if (countToCompound > 0) (countToCompound * 2000L + 25000L).coerceAtLeast(10000L) else 0L
    }

    val consolidatedSompi = remember(totalInputSompi, feeSompi) {
        (totalInputSompi - feeSompi).coerceAtLeast(0L)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.8f))
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 480.dp)
                    .wrapContentHeight(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF090D12)),
                border = BorderStroke(1.dp, Color(0xFF212B38))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(Color(0xFFF59E0B).copy(alpha = 0.15f), RoundedCornerShape(12.dp))
                                    .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Bolt,
                                    contentDescription = "Compound",
                                    tint = Color(0xFFF59E0B),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "UTXO Compounder",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp,
                                    color = Color.White
                                )
                                Text(
                                    text = "Merge fragmented outputs & reduce fees",
                                    fontSize = 11.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                        }
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier
                                .size(36.dp)
                                .background(Color(0xFF1E293B), CircleShape)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Stats Breakdown
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF0E131B),
                        border = BorderStroke(1.dp, Color(0xFF1B232E))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Inputs to Compound", color = Color(0xFF94A3B8), fontSize = 12.sp)
                                Text(
                                    text = "$countToCompound Outputs ${if (countToCompound >= 80) "(Max Batch)" else ""}",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Total Input Sum", color = Color(0xFF94A3B8), fontSize = 12.sp)
                                Text(
                                    text = "%.4f KAS".format(totalInputSompi / 100_000_000.0),
                                    color = Color(0xFFE2E8F0),
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Relay Mass Fee", color = Color(0xFF94A3B8), fontSize = 12.sp)
                                Text(
                                    text = "-%.6f KAS".format(feeSompi / 100_000_000.0),
                                    color = Color(0xFFF59E0B),
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp
                                )
                            }

                            HorizontalDivider(
                                color = Color(0xFF1B232E),
                                modifier = Modifier.padding(vertical = 4.dp)
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Consolidated Output", color = Color(0xFFE2E8F0), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(
                                    text = "%.4f KAS".format(consolidatedSompi / 100_000_000.0),
                                    color = Color(0xFF70C7BA),
                                    fontWeight = FontWeight.Black,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 15.sp
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Text(
                        text = "Kaspa's 10 BPS blockDAG generates numerous unspent transaction outputs. Compounding merges up to 80 fragmented UTXOs into 1 clean balance, ensuring immediate future transactions remain fast and low-fee.",
                        fontSize = 11.sp,
                        color = Color(0xFF64748B),
                        lineHeight = 16.sp
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            if (!isCompounding && countToCompound > 1) {
                                isCompounding = true
                                coroutineScope.launch {
                                    try {
                                        onExecuteCompound()
                                        onDismiss()
                                    } finally {
                                        isCompounding = false
                                    }
                                }
                            }
                        },
                        enabled = countToCompound > 1 && !isCompounding,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFF59E0B),
                            contentColor = Color(0xFF090D12),
                            disabledContainerColor = Color(0xFF1E293B),
                            disabledContentColor = Color(0xFF64748B)
                        )
                    ) {
                        if (isCompounding) {
                            CircularProgressIndicator(
                                color = Color(0xFF090D12),
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("COMPOUNDING INPUTS...", fontWeight = FontWeight.Bold)
                        } else {
                            Icon(Icons.Default.Layers, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                if (countToCompound <= 1) "NO COMPOUNDING NEEDED" else "COMPOUND $countToCompound UTXOS NOW",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
