package com.kaspriv.wallet

import android.app.AlertDialog
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.ActivityResultLauncher
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

class NativeWalletActivity : AppCompatActivity() {

    private val TAG = "NativeWalletActivity"

    private lateinit var toolbar: androidx.appcompat.widget.Toolbar
    private lateinit var btnBackToWeb: Button
    private lateinit var walletSpinner: Spinner
    private lateinit var txtWalletAddress: TextView
    private lateinit var txtBalanceKAS: TextView
    private lateinit var txtBalanceUSD: TextView
    private lateinit var etRecipient: EditText
    private lateinit var btnScanQR: ImageButton
    private lateinit var etAmount: EditText
    private lateinit var btnMaxAmount: Button
    private lateinit var etFee: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnSignAndBroadcast: Button
    private lateinit var layoutUtxosContainer: LinearLayout

    private var scanLauncher: ActivityResultLauncher<ScanOptions>? = null
    private var db: AppDatabase? = null
    private val walletsList = mutableListOf<JSONObject>()
    private var selectedWalletId: String = ""
    private var totalBalanceSompi = 0L

    companion object {
        @Volatile
        var activeInstance: NativeWalletActivity? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_native_wallet)
        activeInstance = this

        db = AppDatabase.getDatabase(this)

        // Initialize UI Elements
        toolbar = findViewById(R.id.toolbar)
        btnBackToWeb = findViewById(R.id.btnBackToWeb)
        walletSpinner = findViewById(R.id.walletSpinner)
        txtWalletAddress = findViewById(R.id.txtWalletAddress)
        txtBalanceKAS = findViewById(R.id.txtBalanceKAS)
        txtBalanceUSD = findViewById(R.id.txtBalanceUSD)
        etRecipient = findViewById(R.id.etRecipient)
        btnScanQR = findViewById(R.id.btnScanQR)
        etAmount = findViewById(R.id.etAmount)
        btnMaxAmount = findViewById(R.id.btnMaxAmount)
        etFee = findViewById(R.id.etFee)
        etPassword = findViewById(R.id.etPassword)
        btnSignAndBroadcast = findViewById(R.id.btnSignAndBroadcast)
        layoutUtxosContainer = findViewById(R.id.layoutUtxosContainer)

        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(true)

        // Return to Web View Click Handler
        btnBackToWeb.setOnClickListener {
            finish()
        }

        // Initialize QR Scanner Launcher
        scanLauncher = registerForActivityResult(ScanContract()) { result: ScanIntentResult? ->
            if (result != null && result.contents != null) {
                etRecipient.setText(result.contents)
                Toast.makeText(this, "QR Code Scanned Successfully", Toast.LENGTH_SHORT).show()
            }
        }

        btnScanQR.setOnClickListener {
            val options = ScanOptions()
            options.setPrompt("Scan Recipient Kaspa QR Code")
            options.setBeepEnabled(true)
            options.setOrientationLocked(false)
            options.setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            scanLauncher?.launch(options)
        }

        // Max Amount Calculation Click Handler
        btnMaxAmount.setOnClickListener {
            if (totalBalanceSompi <= 0L) {
                Toast.makeText(this, "No spendable balance in this wallet", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val feeKAS = etFee.text.toString().toDoubleOrNull() ?: 0.0001
            val totalKAS = totalBalanceSompi.toDouble() / 100_000_000.0
            val sendableKAS = totalKAS - feeKAS
            if (sendableKAS <= 0.0) {
                etAmount.setText("0.0")
            } else {
                etAmount.setText(String.format("%.8f", sendableKAS))
            }
        }

        // Spinner Selection Handler
        walletSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (position >= 0 && position < walletsList.size) {
                    val wallet = walletsList[position]
                    selectedWalletId = wallet.optString("id", "")
                    updateWalletUI(wallet)
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        // Sign & Broadcast Click Handler
        btnSignAndBroadcast.setOnClickListener {
            executeSignAndBroadcastFlow()
        }

        // Load active wallets from Room
        loadWalletsFromDb()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (activeInstance == this) {
            activeInstance = null
        }
    }

    private fun loadWalletsFromDb() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val walletsEntities = db?.walletDao()?.getAll() ?: emptyList()
                val parsed = mutableListOf<JSONObject>()
                val spinnerNames = mutableListOf<String>()

                for (entity in walletsEntities) {
                    try {
                        val json = JSONObject(entity.value)
                        parsed.add(json)
                        val name = json.optString("name", "Unnamed Wallet")
                        val network = json.optString("network", "mainnet")
                        spinnerNames.add("$name ($network)")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing wallet entity: ${e.message}")
                    }
                }

                withContext(Dispatchers.Main) {
                    walletsList.clear()
                    walletsList.addAll(parsed)

                    if (spinnerNames.isNotEmpty()) {
                        val adapter = ArrayAdapter(this@NativeWalletActivity, android.R.layout.simple_spinner_dropdown_item, spinnerNames)
                        walletSpinner.adapter = adapter
                    } else {
                        txtWalletAddress.text = "No wallets imported. Please set up a wallet in the Web View first."
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load wallets: ${e.message}")
            }
        }
    }

    private fun updateWalletUI(wallet: JSONObject) {
        val addresses = wallet.optJSONArray("addresses")
        var recAddress = "No Address"
        if (addresses != null && addresses.length() > 0) {
            for (i in 0 until addresses.length()) {
                val addrObj = addresses.optJSONObject(i)
                if (addrObj != null && addrObj.optString("type") == "receive") {
                    recAddress = addrObj.optString("address", recAddress)
                    break
                }
            }
        }
        txtWalletAddress.text = recAddress

        // Load UTXOs from Room DB
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val utxoEntity = db?.utxoDao()?.getByWalletId(selectedWalletId)
                val utxoList = mutableListOf<JSONObject>()
                var totalSompi = 0L

                if (utxoEntity != null) {
                    val arr = JSONArray(utxoEntity.data)
                    for (i in 0 until arr.length()) {
                        val u = arr.optJSONObject(i)
                        if (u != null) {
                            utxoList.add(u)
                            // Parse amount from utxoEntry or root
                            val entry = u.optJSONObject("utxoEntry")
                            val amt = entry?.optLong("amount") ?: u.optLong("amount", 0L)
                            totalSompi += amt
                        }
                    }
                }

                totalBalanceSompi = totalSompi
                val balanceKAS = totalSompi.toDouble() / 100_000_000.0

                withContext(Dispatchers.Main) {
                    txtBalanceKAS.text = String.format("%.4f KAS", balanceKAS)
                    txtBalanceUSD.text = String.format("$%.2f USD", balanceKAS * 0.142) // Estimated live ticker mapping

                    renderUtxosList(utxoList)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load UTXOs for wallet ${wallet.optString("id")}: ${e.message}")
            }
        }
    }

    private fun renderUtxosList(utxos: List<JSONObject>) {
        layoutUtxosContainer.removeAllViews()

        if (utxos.isEmpty()) {
            val emptyTxt = TextView(this)
            emptyTxt.text = "No UTXOs currently cached in local DB. Scan or poll in Web View."
            emptyTxt.setTextColor(0xFF888888.toInt())
            emptyTxt.setPadding(8, 8, 8, 8)
            layoutUtxosContainer.addView(emptyTxt)
            return
        }

        for (u in utxos) {
            val card = FrameLayout(this)
            val params = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            params.setMargins(0, 0, 0, 12)
            card.layoutParams = params
            card.setBackgroundResource(android.R.drawable.dialog_holo_light_frame)
            card.setPadding(16, 16, 16, 16)

            val layout = LinearLayout(this)
            layout.orientation = LinearLayout.VERTICAL

            val entry = u.optJSONObject("utxoEntry")
            val amtSompi = entry?.optLong("amount") ?: u.optLong("amount", 0L)
            val txid = u.optString("transactionId") ?: u.optString("txid", "Unknown Tx")
            val vout = u.optInt("vout") ?: u.optInt("index", 0)

            val txtTx = TextView(this)
            txtTx.text = "TxID: ${txid.take(16)}...:$vout"
            txtTx.textSize = 12sp
            txtTx.setTextColor(0xFF333333.toInt())

            val txtAmt = TextView(this)
            val kasAmt = amtSompi.toDouble() / 100_000_000.0
            txtAmt.text = "${String.format("%.8f", kasAmt)} KAS"
            txtAmt.textSize = 14sp
            txtAmt.textStyle = android.graphics.Typeface.BOLD
            txtAmt.setTextColor(0xFF111111.toInt())

            layout.addView(txtAmt)
            layout.addView(txtTx)
            card.addView(layout)

            layoutUtxosContainer.addView(card)
        }
    }

    private fun executeSignAndBroadcastFlow() {
        val recipient = etRecipient.text.toString().trim()
        val amountStr = etAmount.text.toString().trim()
        val feeStr = etFee.text.toString().trim()
        val password = etPassword.text.toString()

        if (recipient.isEmpty()) {
            Toast.makeText(this, "Recipient Address is required", Toast.LENGTH_SHORT).show()
            return
        }
        if (amountStr.isEmpty() || amountStr.toDoubleOrNull() ?: 0.0 <= 0.0) {
            Toast.makeText(this, "Please enter a valid amount greater than 0", Toast.LENGTH_SHORT).show()
            return
        }
        if (password.isEmpty()) {
            Toast.makeText(this, "Wallet Vault Password is required to decrypt & sign", Toast.LENGTH_SHORT).show()
            return
        }

        // Construct evaluation script to trigger main-thread WASM Signing & Broadcasting in the secure WebView
        val amountKAS = amountStr.toDouble()
        val amountSompi = (amountKAS * 100_000_000.0).toLong()
        val feeKAS = feeStr.toDoubleOrNull() ?: 0.0001
        val feeSompi = (feeKAS * 100_000_000.0).toLong()

        // Disable elements to prevent duplicate clicks
        btnSignAndBroadcast.isEnabled = false
        btnSignAndBroadcast.text = "Signing & Broadcasting via WASM..."

        MainActivity.activeInstance?.runOnUiThread {
            try {
                // Evaluates the javascript command in the main Capacitor Activity context
                val jsExpr = """
                    window.dispatchEvent(new CustomEvent('nativeSignAndBroadcast', {
                        detail: {
                            walletId: '$selectedWalletId',
                            toAddress: '$recipient',
                            amountSompi: '$amountSompi',
                            feeSompi: '$feeSompi',
                            password: '$password'
                        }
                    }));
                """.trimIndent()
                MainActivity.activeInstance?.bridge?.webView?.evaluateJavascript(jsExpr, null)
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@NativeWalletActivity, "Bridge communication error: ${e.message}", Toast.LENGTH_LONG).show()
                    btnSignAndBroadcast.isEnabled = true
                    btnSignAndBroadcast.text = "Sign & Broadcast Transaction"
                }
            }
        }
    }

    fun onTransactionResult(success: Boolean, txId: String?, error: String?) {
        runOnUiThread {
            btnSignAndBroadcast.isEnabled = true
            btnSignAndBroadcast.text = "Sign & Broadcast Transaction"
            etPassword.setText("")

            if (success && txId != null) {
                AlertDialog.Builder(this)
                    .setTitle("Transaction Broadcasted!")
                    .setMessage("Successfully signed and broadcasted transaction!\n\nTxID: $txId\n\nThe transaction is now executing on the Kaspa ledger.")
                    .setPositiveButton("View in Explorer") { _, _ ->
                        // Dynamically look up explorer URL from settings if possible, or fall back to default
                        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
                        intent.data = android.net.Uri.parse("https://explorer.kaspa.org/txs/$txId")
                        startActivity(intent)
                    }
                    .setNegativeButton("Dismiss", null)
                    .show()

                // Reload local wallets to refresh UTXO balances immediately
                loadWalletsFromDb()
            } else {
                AlertDialog.Builder(this)
                    .setTitle("Transaction Failed")
                    .setMessage(error ?: "Unknown error occurred during WebAssembly transaction assembly.")
                    .setPositiveButton("OK", null)
                    .show()
            }
        }
    }
}

// Extension to facilitate sizing properties programmatically
private val Int.sp: Float
    get() = this.toFloat()
