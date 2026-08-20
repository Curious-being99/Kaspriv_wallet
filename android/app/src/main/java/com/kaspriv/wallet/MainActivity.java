package com.kaspriv.wallet;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;

public class MainActivity extends BridgeActivity {

    public static class SecurityEnvironmentBridge {
        @JavascriptInterface
        public boolean isDeviceRooted() {
            return checkRootBuildTags() || checkRootPaths() || checkWhichSu();
        }

        @JavascriptInterface
        public boolean isFridaOrHooked() {
            return checkFridaMemoryMaps() || checkFridaTcpPort() || checkXposedFramework();
        }

        @JavascriptInterface
        public String getCompromisedDetails() {
            StringBuilder sb = new StringBuilder();
            if (checkRootBuildTags()) sb.append("Test-Keys Build Signature; ");
            if (checkRootPaths() || checkWhichSu()) sb.append("SU Root Binary Detected; ");
            if (checkFridaMemoryMaps()) sb.append("Frida Memory Inspection Agent; ");
            if (checkFridaTcpPort()) sb.append("Frida Listening Server Port; ");
            if (checkXposedFramework()) sb.append("Xposed Hooking Framework; ");
            return sb.toString().trim();
        }

        private boolean checkRootBuildTags() {
            String buildTags = Build.TAGS;
            return buildTags != null && buildTags.contains("test-keys");
        }

        private boolean checkRootPaths() {
            String[] paths = {
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
            };
            for (String path : paths) {
                if (new File(path).exists()) return true;
            }
            return false;
        }

        private boolean checkWhichSu() {
            Process process = null;
            try {
                process = Runtime.getRuntime().exec(new String[] { "/system/xbin/which", "su" });
                BufferedReader in = new BufferedReader(new InputStreamReader(process.getInputStream()));
                return in.readLine() != null;
            } catch (Throwable t) {
                return false;
            } finally {
                if (process != null) process.destroy();
            }
        }

        private boolean checkFridaMemoryMaps() {
            try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/maps"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String lower = line.toLowerCase();
                    if (lower.contains("frida") || lower.contains("gadget") || lower.contains("xposed")) {
                        return true;
                    }
                }
            } catch (Exception ignored) {}
            return false;
        }

        private boolean checkFridaTcpPort() {
            try (BufferedReader reader = new BufferedReader(new FileReader("/proc/net/tcp"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.contains(":69A2")) { // 27042 in hex
                        return true;
                    }
                }
            } catch (Exception ignored) {}
            return false;
        }

        private boolean checkXposedFramework() {
            try {
                throw new Exception("XposedCheck");
            } catch (Exception e) {
                for (StackTraceElement stackTraceElement : e.getStackTrace()) {
                    if (stackTraceElement.getClassName().contains("de.robv.android.xposed.XposedBridge")) {
                        return true;
                    }
                }
            }
            return new File("/system/framework/XposedBridge.jar").exists();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native FLAG_SECURE Window Enforcement
        // Blocks screenshots, screen recording, and hides wallet contents in Android Recents / App Switcher
        try {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        } catch (Exception e) {
            // Ignore if window flags cannot be applied
        }

        // Register custom local Capacitor plugins
        registerPlugin(HardwareVaultPlugin.class);

        super.onCreate(savedInstanceState);
        
        // Tapjacking & Overlay Obstruction Defense
        // Discards touch events if another application's window overlay obscures the wallet screen
        try {
            View rootView = getWindow().getDecorView().getRootView();
            if (rootView != null) {
                rootView.setFilterTouchesWhenObscured(true);
            }
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                webView.setFilterTouchesWhenObscured(true);
                webView.addJavascriptInterface(new SecurityEnvironmentBridge(), "AndroidSecurityEnvironment");
            }
        } catch (Exception e) {
            // Ignore if decor view is not available on older devices
        }
    }
}

