package com.kaspriv.wallet

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * KaspaBootReceiver
 *
 * Restarts decentralized background on-chain transaction monitoring
 * whenever the user's Android phone boots up or restarts.
 */
class KaspaBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null) return
        val action = intent?.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.d("KaspaBootReceiver", "Boot completed detected ($action). Rescheduling Kaspa background sync.")
            KaspaSyncWorker.schedulePeriodicSync(context)
        }
    }
}
