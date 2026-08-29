# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# Keep Capacitor and Wallet plugins
-keep class com.getcapacitor.** { *; }
-keep class com.kaspriv.wallet.** { *; }

# Google Tink & AndroidX Security Crypto
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.protobuf.**

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# Keep Room Database
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.**

# WorkManager
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
-keep class * extends androidx.work.CoroutineWorker { *; }
-dontwarn androidx.work.**

# Dontwarn for optional/external native dependencies
-dontwarn net.zetetic.database.sqlcipher.**
-dontwarn org.apache.commons.io.**
-dontwarn org.json.**
-dontwarn org.sol4k.**
-dontwarn okio.**
-dontwarn okhttp3.**

# Keep WebKit Javascript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn sun.misc.Unsafe

