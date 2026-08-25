package com.kaspriv.wallet

import androidx.activity.result.ActivityResultLauncher
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions

@CapacitorPlugin(name = "NativeScanner")
class NativeScannerPlugin : Plugin() {

    private var savedCall: PluginCall? = null
    private var scanLauncher: ActivityResultLauncher<ScanOptions>? = null

    override fun load() {
        super.load()
        scanLauncher = bridge.activity.registerForActivityResult(ScanContract()) { result: ScanIntentResult? ->
            val call = savedCall ?: return@registerForActivityResult
            if (result != null && result.contents != null) {
                val ret = JSObject()
                ret.put("text", result.contents)
                ret.put("format", result.formatName ?: "QR_CODE")
                call.resolve(ret)
            } else {
                call.resolve(null)
            }
            savedCall = null
        }
    }

    @PluginMethod
    fun scan(call: PluginCall) {
        savedCall = call
        val options = ScanOptions()
        options.setPrompt("Scan Kaspa QR Code")
        options.setBeepEnabled(true)
        options.setOrientationLocked(false)
        options.setDesiredBarcodeFormats(ScanOptions.QR_CODE)
        try {
            scanLauncher?.launch(options) ?: run {
                call.reject("Native scanner launcher not initialized")
            }
        } catch (e: Exception) {
            call.reject("Failed to launch camera scanner: ${e.message}", e)
        }
    }
}
