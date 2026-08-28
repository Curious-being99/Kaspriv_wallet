package com.kaspriv.wallet

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

data class KaspaNodeItem(
    val url: String,
    val isDefault: Boolean = false,
    val network: String = "mainnet",
    var latencyMs: Long? = null,
    var isHealthy: Boolean = true
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NodeManagerModal(
    selectedNodeUrl: String,
    onSelectNode: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()

    var nodes by remember {
        mutableStateOf(
            listOf(
                KaspaNodeItem("https://api.kaspa.org", isDefault = true),
                KaspaNodeItem("https://kaspa.aspectron.org", isDefault = false),
                KaspaNodeItem("https://api-mainnet.kaspriv.io", isDefault = false)
            )
        )
    }

    var customNodeInput by remember { mutableStateOf("") }
    var isPinging by remember { mutableStateOf(false) }

    fun pingAllNodes() {
        isPinging = true
        coroutineScope.launch {
            val updated = nodes.map { node ->
                val start = System.currentTimeMillis()
                val success = withContext(Dispatchers.IO) {
                    try {
                        val conn = URL("${node.url}/info/virtual-selected-parent-blue-score").openConnection() as HttpURLConnection
                        conn.connectTimeout = 3000
                        conn.readTimeout = 3000
                        conn.requestMethod = "GET"
                        val code = conn.responseCode
                        code in 200..299
                    } catch (e: Exception) {
                        false
                    }
                }
                val duration = System.currentTimeMillis() - start
                node.copy(latencyMs = if (success) duration else null, isHealthy = success)
            }
            nodes = updated
            isPinging = false
        }
    }

    LaunchedEffect(Unit) {
        pingAllNodes()
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
                    .widthIn(max = 500.dp)
                    .fillMaxHeight(0.85f),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF090D12)),
                border = BorderStroke(1.dp, Color(0xFF212B38))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp)
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
                                    .background(Color(0xFF38BDF8).copy(alpha = 0.15f), RoundedCornerShape(12.dp))
                                    .border(1.dp, Color(0xFF38BDF8).copy(alpha = 0.3f), RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Dns,
                                    contentDescription = "Node RPC Manager",
                                    tint = Color(0xFF38BDF8),
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Node Cluster & RPC",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp,
                                    color = Color.White
                                )
                                Text(
                                    text = "Direct peer failover & latency manager",
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

                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "ACTIVE CLUSTER ENDPOINTS",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF64748B),
                            letterSpacing = 1.sp
                        )
                        TextButton(
                            onClick = { pingAllNodes() },
                            enabled = !isPinging,
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color(0xFF70C7BA))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Ping All", fontSize = 11.sp, color = Color(0xFF70C7BA))
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Node List
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(nodes) { node ->
                            val isSelected = node.url == selectedNodeUrl
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { onSelectNode(node.url) },
                                color = if (isSelected) Color(0xFF0F1B24) else Color(0xFF0D121B),
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) Color(0xFF70C7BA) else Color(0xFF1E293B)
                                )
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = node.url,
                                                fontSize = 13.sp,
                                                fontFamily = FontFamily.Monospace,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                color = if (isSelected) Color.White else Color(0xFFCBD5E1)
                                            )
                                            if (node.isDefault) {
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Box(
                                                    modifier = Modifier
                                                        .background(Color(0xFF334155), RoundedCornerShape(4.dp))
                                                        .padding(horizontal = 5.dp, vertical = 2.dp)
                                                ) {
                                                    Text("OFFICIAL", fontSize = 8.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(
                                                modifier = Modifier
                                                    .size(6.dp)
                                                    .background(
                                                        if (node.isHealthy) Color(0xFF10B981) else Color(0xFFEF4444),
                                                        CircleShape
                                                    )
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = if (node.latencyMs != null) "${node.latencyMs} ms" else if (node.isHealthy) "Online" else "Unreachable",
                                                fontSize = 11.sp,
                                                color = if (node.isHealthy) Color(0xFF10B981) else Color(0xFFEF4444)
                                            )
                                        }
                                    }

                                    if (isSelected) {
                                        Icon(
                                            Icons.Default.CheckCircle,
                                            contentDescription = "Selected",
                                            tint = Color(0xFF70C7BA),
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Add Custom Node
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = customNodeInput,
                            onValueChange = { customNodeInput = it },
                            placeholder = { Text("https://my-kaspa-node:16110", color = Color(0xFF475569), fontSize = 12.sp) },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF70C7BA),
                                unfocusedBorderColor = Color(0xFF1E293B),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedContainerColor = Color(0xFF0D121B),
                                unfocusedContainerColor = Color(0xFF0D121B)
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                if (customNodeInput.isNotBlank()) {
                                    val trimmed = customNodeInput.trim()
                                    if (!nodes.any { it.url == trimmed }) {
                                        nodes = nodes + KaspaNodeItem(trimmed)
                                        customNodeInput = ""
                                        pingAllNodes()
                                    }
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF38BDF8), contentColor = Color(0xFF090D12)),
                            modifier = Modifier.height(52.dp)
                        ) {
                            Text("ADD", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}
