package com.kaspriv.wallet

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Native FLAG_SECURE Window Enforcement to protect seed phrases and private keys
        try {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        } catch (e: Exception) {
            // Ignore
        }

        // Register custom native plugins with Capacitor Bridge
        registerPlugin(SQLitePlugin::class.java)
        registerPlugin(HardwareVaultPlugin::class.java)
        registerPlugin(NativeScannerPlugin::class.java)
        registerPlugin(DecentralizedNotificationPlugin::class.java)

        super.onCreate(savedInstanceState)

        // Schedule decentralized background on-chain transaction monitoring
        try {
            KaspaSyncWorker.schedulePeriodicSync(this)
        } catch (e: Exception) {
            // Ignore
        }
    }
}
