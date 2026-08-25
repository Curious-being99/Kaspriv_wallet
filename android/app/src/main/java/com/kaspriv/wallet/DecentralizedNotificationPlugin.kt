package com.kaspriv.wallet

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.concurrent.ConcurrentHashMap

/**
 * Decentralized Native Android Transaction Notification Plugin
 *
 * Provides real-time OS-level Heads-Up transaction alerts directly from on-chain RPC / node events.
 * 100% decentralized: Zero Google Play Services tracking, Zero Firebase Cloud Messaging (FCM), Zero 3rd-party servers.
 */
@CapacitorPlugin(
    name = "DecentralizedNotification",
    permissions = [
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        )
    ]
)
class DecentralizedNotificationPlugin : Plugin() {

    companion object {
        const val CHANNEL_ID = "kaspa_decentralized_tx"
        const val CHANNEL_NAME = "Kaspa On-Chain Activity"
        const val CHANNEL_DESC = "Real-time pop-up alerts for received and broadcast Kaspa transactions"

        // In-memory deduplication cache: TxID -> Timestamp
        private val notifiedTxs = ConcurrentHashMap<String, Long>()

        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val importance = NotificationManager.IMPORTANCE_HIGH
                val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                    description = CHANNEL_DESC
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 200, 100, 200)
                    enableLights(true)
                    setShowBadge(true)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                }
                val notificationManager: NotificationManager? =
                    context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                notificationManager?.createNotificationChannel(channel)
            }
        }

        fun showNativeNotification(
            context: Context,
            title: String,
            message: String,
            txid: String = "",
            type: String = "receive"
        ): Int {
            // Deduplication: prevent repeated notifications for the same txid within 10 minutes
            val now = System.currentTimeMillis()
            if (txid.isNotEmpty()) {
                val lastNotified = notifiedTxs[txid]
                if (lastNotified != null && now - lastNotified < 600000) {
                    return -1 // Deduplicated
                }
                notifiedTxs[txid] = now
            }

            // Periodic cache eviction
            if (notifiedTxs.size > 500) {
                notifiedTxs.entries.removeIf { now - it.value > 600000 }
            }

            createNotificationChannel(context)

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("txid", txid)
                putExtra("type", type)
            }

            val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            val requestCode = if (txid.isNotEmpty()) (txid.hashCode() and 0x7FFFFFFF) else (now.toInt() and 0x7FFFFFFF)
            val pendingIntent = PendingIntent.getActivity(context, requestCode, intent, pendingFlags)

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setVibrate(longArrayOf(0, 200, 100, 200))
                .setDefaults(NotificationCompat.DEFAULT_ALL)

            val notificationId = requestCode
            val notificationManager = NotificationManagerCompat.from(context)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    notificationManager.notify(notificationId, builder.build())
                }
            } else {
                notificationManager.notify(notificationId, builder.build())
            }

            return notificationId
        }
    }

    override fun load() {
        super.load()
        createNotificationChannel(context)
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            val ret = JSObject()
            ret.put("display", if (granted) "granted" else "prompt")
            call.resolve(ret)
        } else {
            val ret = JSObject()
            ret.put("display", "granted")
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                val ret = JSObject()
                ret.put("display", "granted")
                call.resolve(ret)
            } else {
                requestPermissionForAlias("notifications", call, "permissionCallback")
            }
        } else {
            val ret = JSObject()
            ret.put("display", "granted")
            call.resolve(ret)
        }
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            val ret = JSObject()
            ret.put("display", "granted")
            call.resolve(ret)
        } else {
            val ret = JSObject()
            ret.put("display", "denied")
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun notifyTransaction(call: PluginCall) {
        val title = call.getString("title") ?: "Kaspa Transaction"
        val message = call.getString("message") ?: "New transaction activity detected"
        val txid = call.getString("txid") ?: ""
        val type = call.getString("type") ?: "receive" // "receive" or "broadcast"

        try {
            val notificationId = showNativeNotification(context, title, message, txid, type)
            val ret = JSObject()
            if (notificationId == -1) {
                ret.put("status", "deduplicated")
            } else {
                ret.put("status", "success")
                ret.put("notificationId", notificationId)
            }
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to trigger decentralized notification: ${e.message}", e)
        }
    }
}
