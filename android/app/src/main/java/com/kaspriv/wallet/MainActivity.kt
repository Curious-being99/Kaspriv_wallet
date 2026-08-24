package com.kaspriv.wallet

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import com.getcapacitor.BridgeActivity
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import java.io.InputStreamReader

class MainActivity : BridgeActivity() {

    class SecurityEnvironmentBridge {
        @JavascriptInterface
        fun isDeviceRooted(): Boolean {
            return checkRootBuildTags() || checkRootPaths() || checkWhichSu()
        }

        @JavascriptInterface
        fun isFridaOrHooked(): Boolean {
            return checkFridaMemoryMaps() || checkFridaTcpPort() || checkXposedFramework()
        }

        @JavascriptInterface
        fun getCompromisedDetails(): String {
            val sb = StringBuilder()
            if (checkRootBuildTags()) sb.append("Test-Keys Build Signature; ")
            if (checkRootPaths() || checkWhichSu()) sb.append("SU Root Binary Detected; ")
            if (checkFridaMemoryMaps()) sb.append("Frida Memory Inspection Agent; ")
            if (checkFridaTcpPort()) sb.append("Frida Listening Server Port; ")
            if (checkXposedFramework()) sb.append("Xposed Hooking Framework; ")
            return sb.toString().trim()
        }

        private fun checkRootBuildTags(): Boolean {
            val buildTags = Build.TAGS
            return buildTags != null && buildTags.contains("test-keys")
        }

        private fun checkRootPaths(): Boolean {
            val paths = arrayOf(
                "/system/app/Superuser.apk",
                "/sbin/su",
                "/system/bin/su",
                "/system/xbin/su",
                "/data/local/xbin/su",
                "/data/local/bin/su",
                "/system/sd/xbin/su",
                "/system/bin/failsafe/su",
                "/data/local/su",
                "/data/adb/magisk"
            )
            for (path in paths) {
                if (File(path).exists()) return true
            }
            return false
        }

        private fun checkWhichSu(): Boolean {
            var process: Process? = null
            return try {
                process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
                val reader = BufferedReader(InputStreamReader(process.inputStream))
                reader.readLine() != null
            } catch (t: Throwable) {
                false
            } finally {
                process?.destroy()
            }
        }

        private fun checkFridaMemoryMaps(): Boolean {
            try {
                BufferedReader(FileReader("/proc/self/maps")).use { reader ->
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        val lower = line?.lowercase() ?: ""
                        if (lower.contains("frida") || lower.contains("gadget") || lower.contains("xposed")) {
                            return true
                        }
                    }
                }
            } catch (ignored: Exception) {
            }
            return false
        }

        private fun checkFridaTcpPort(): Boolean {
            try {
                BufferedReader(FileReader("/proc/net/tcp")).use { reader ->
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        if (line?.contains(":69A2") == true) { // 27042 in hex
                            return true
                        }
                    }
                }
            } catch (ignored: Exception) {
            }
            return false
        }

        private fun checkXposedFramework(): Boolean {
            try {
                throw Exception("XposedCheck")
            } catch (e: Exception) {
                for (stackTraceElement in e.stackTrace) {
                    if (stackTraceElement.className.contains("de.robv.android.xposed.XposedBridge")) {
                        return true
                    }
                }
            }
            return File("/system/framework/XposedBridge.jar").exists()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Native FLAG_SECURE Window Enforcement
        // Blocks screenshots, screen recording, and hides wallet contents in Android Recents / App Switcher
        try {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        } catch (e: Exception) {
            // Ignore if window flags cannot be applied
        }

        // Register custom local Capacitor plugins
        registerPlugin(HardwareVaultPlugin::class.java)
        registerPlugin(SQLitePlugin::class.java)

        super.onCreate(savedInstanceState)

        // Tapjacking & Overlay Obstruction Defense
        // Protect webview touches against untrusted overlays while allowing system BiometricPrompt dialogs
        try {
            val webView = bridge?.webView
            if (webView != null) {
                webView.setFilterTouchesWhenObscured(true)
                webView.addJavascriptInterface(SecurityEnvironmentBridge(), "AndroidSecurityEnvironment")
            }
        } catch (e: Exception) {
            // Ignore if web view is not available
        }
    }
}
