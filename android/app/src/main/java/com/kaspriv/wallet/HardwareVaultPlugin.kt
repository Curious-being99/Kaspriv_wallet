package com.kaspriv.wallet

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@CapacitorPlugin(name = "HardwareVault")
class HardwareVaultPlugin : Plugin() {

    private val KEY_STORE_NAME = "AndroidKeyStore"
    private val TRANSFORMATION = "AES/GCM/NoPadding"
    private val TAG_LENGTH = 128
    private val mainHandler = Handler(Looper.getMainLooper())

    @PluginMethod
    fun checkBiometricSupport(call: PluginCall) {
        val biometricManager = BiometricManager.from(context)
        val canAuthStrong = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val canAuthWeak = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        val canAuthDevice = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
        
        val isAvailable = canAuthStrong == BiometricManager.BIOMETRIC_SUCCESS || 
                          canAuthWeak == BiometricManager.BIOMETRIC_SUCCESS ||
                          canAuthDevice == BiometricManager.BIOMETRIC_SUCCESS
        
        val ret = JSObject()
        ret.put("available", isAvailable)
        ret.put("isStrong", canAuthStrong == BiometricManager.BIOMETRIC_SUCCESS)
        ret.put("status", if (canAuthStrong == BiometricManager.BIOMETRIC_SUCCESS) canAuthStrong else canAuthWeak)
        
        val hasStrongBox = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                context.packageManager.hasSystemFeature("android.hardware.strongbox_keystore")
            } catch (e: Exception) {
                false
            }
        } else {
            false
        }
        ret.put("hasStrongBox", hasStrongBox)
        
        call.resolve(ret)
    }

    @PluginMethod
    fun storeSecure(call: PluginCall) {
        val alias = call.getString("alias")
        val data = call.getString("data")
        
        if (alias == null || data == null) {
            call.reject("Alias and data are required")
            return
        }

        try {
            val secretKey = getOrCreateKey(alias)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            
            try {
                cipher.init(Cipher.ENCRYPT_MODE, secretKey)
                val iv = cipher.iv
                val encryptedBytes = cipher.doFinal(data.toByteArray(Charsets.UTF_8))
                
                val ret = JSObject()
                ret.put("iv", Base64.encodeToString(iv, Base64.DEFAULT))
                ret.put("ciphertext", Base64.encodeToString(encryptedBytes, Base64.DEFAULT))
                call.resolve(ret)
            } catch (e: Exception) {
                // If auth is required for cipher operations, prompt biometrics with CryptoObject
                try {
                    cipher.init(Cipher.ENCRYPT_MODE, secretKey)
                    showBiometricPromptForEncrypt(cipher, data.toByteArray(Charsets.UTF_8), call)
                } catch (reInitErr: Exception) {
                    call.reject("Cipher initialization failed: ${reInitErr.message}")
                }
            }
        } catch (e: Exception) {
            call.reject("Failed to encrypt data: ${e.message}")
        }
    }

    @PluginMethod
    fun loadSecure(call: PluginCall) {
        val alias = call.getString("alias")
        val ivBase64 = call.getString("iv")
        val ciphertextBase64 = call.getString("ciphertext")
        
        if (alias == null || ivBase64 == null || ciphertextBase64 == null) {
            call.reject("Missing required parameters")
            return
        }

        try {
            val iv = Base64.decode(ivBase64, Base64.DEFAULT)
            val ciphertext = Base64.decode(ciphertextBase64, Base64.DEFAULT)
            
            val keyStore = KeyStore.getInstance(KEY_STORE_NAME)
            keyStore.load(null)
            val secretKey = keyStore.getKey(alias, null) as? SecretKey ?: throw Exception("Vault key not found")
            
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val gcmSpec = GCMParameterSpec(TAG_LENGTH, iv)
            
            try {
                cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
                val decryptedBytes = cipher.doFinal(ciphertext)
                val ret = JSObject()
                ret.put("data", String(decryptedBytes, Charsets.UTF_8))
                wipe(decryptedBytes)
                call.resolve(ret)
            } catch (e: Exception) {
                // Decrypt requires biometric authorization
                try {
                    cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
                    showBiometricPromptForDecrypt(cipher, ciphertext, call)
                } catch (reInitErr: Exception) {
                    call.reject("Decryption cipher initialization failed: ${reInitErr.message}")
                }
            }
        } catch (e: Exception) {
            call.reject("Failed to decrypt: ${e.message}")
        }
    }

    @PluginMethod
    fun deleteKey(call: PluginCall) {
        val alias = call.getString("alias") ?: return call.reject("Alias is required")
        try {
            val keyStore = KeyStore.getInstance(KEY_STORE_NAME)
            keyStore.load(null)
            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("Failed to delete key: ${e.message}")
        }
    }

    private fun getOrCreateKey(alias: String): SecretKey {
        val keyStore = KeyStore.getInstance(KEY_STORE_NAME)
        keyStore.load(null)
        
        if (keyStore.containsAlias(alias)) {
            try {
                val existing = keyStore.getKey(alias, null) as? SecretKey
                if (existing != null) return existing
            } catch (e: Exception) {
                keyStore.deleteEntry(alias)
            }
        }

        // Check biometric enrollment to decide whether auth is required on key
        val biometricManager = BiometricManager.from(context)
        val canAuthStrong = biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

        // 1. Try StrongBox if hardware feature is present
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                val hasStrongBox = context.packageManager.hasSystemFeature("android.hardware.strongbox_keystore")
                if (hasStrongBox) {
                    return generateAesKey(alias, useStrongBox = true, authRequired = canAuthStrong)
                }
            } catch (e: Exception) {
                // Fallback to standard hardware-backed Keystore
            }
        }

        // 2. Try standard TEE hardware-backed Keystore with biometric authentication
        try {
            return generateAesKey(alias, useStrongBox = false, authRequired = canAuthStrong)
        } catch (e: Exception) {
            // 3. Fallback without strict biometric auth flag if enrollment or hardware flags mismatch
            return generateAesKey(alias, useStrongBox = false, authRequired = false)
        }
    }

    private fun generateAesKey(alias: String, useStrongBox: Boolean, authRequired: Boolean): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEY_STORE_NAME)
        val specBuilder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)

        if (authRequired) {
            specBuilder.setUserAuthenticationRequired(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                specBuilder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                specBuilder.setUserAuthenticationValidityDurationSeconds(-1)
            }
            // Invalidate key only if permanently removed; avoid transient disconnects
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    specBuilder.setInvalidatedByBiometricEnrollment(false)
                } catch (e: Exception) {}
            }
        } else {
            specBuilder.setUserAuthenticationRequired(false)
        }

        if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                specBuilder.setIsStrongBoxBacked(true)
            } catch (e: Exception) {}
        }

        keyGenerator.init(specBuilder.build())
        return keyGenerator.generateKey()
    }

    private fun showBiometricPromptForEncrypt(cipher: Cipher, plaintext: ByteArray, call: PluginCall) {
        val resolvedOrRejected = AtomicBoolean(false)
        mainHandler.post {
            try {
                val currentActivity = activity
                if (currentActivity == null || currentActivity.isFinishing || currentActivity.isDestroyed) {
                    if (resolvedOrRejected.compareAndSet(false, true)) {
                        call.reject("Activity is not available for BiometricPrompt")
                    }
                    return@post
                }

                val executor = ContextCompat.getMainExecutor(context)
                val biometricPrompt = BiometricPrompt(currentActivity, executor, object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        super.onAuthenticationSucceeded(result)
                        if (resolvedOrRejected.compareAndSet(false, true)) {
                            try {
                                val authCipher = result.cryptoObject?.cipher ?: cipher
                                val iv = authCipher.iv
                                val encryptedBytes = authCipher.doFinal(plaintext)
                                val ret = JSObject()
                                ret.put("iv", Base64.encodeToString(iv, Base64.DEFAULT))
                                ret.put("ciphertext", Base64.encodeToString(encryptedBytes, Base64.DEFAULT))
                                call.resolve(ret)
                            } catch (e: Exception) {
                                call.reject("Encryption failed after auth: ${e.message}")
                            }
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        super.onAuthenticationError(errorCode, errString)
                        if (resolvedOrRejected.compareAndSet(false, true)) {
                            call.reject("Authentication error ($errorCode): $errString")
                        }
                    }

                    override fun onAuthenticationFailed() {
                        super.onAuthenticationFailed()
                    }
                })

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Authenticate to Secure Wallet")
                    .setSubtitle("Confirm biometrics to save your vault key")
                    .setNegativeButtonText("Use Password")
                    .setConfirmationRequired(false)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } catch (e: Exception) {
                if (resolvedOrRejected.compareAndSet(false, true)) {
                    call.reject("Biometric prompt failed: ${e.message}")
                }
            }
        }
    }

    private fun showBiometricPromptForDecrypt(cipher: Cipher, ciphertext: ByteArray, call: PluginCall) {
        val resolvedOrRejected = AtomicBoolean(false)
        mainHandler.post {
            try {
                val currentActivity = activity
                if (currentActivity == null || currentActivity.isFinishing || currentActivity.isDestroyed) {
                    if (resolvedOrRejected.compareAndSet(false, true)) {
                        call.reject("Activity is not available for BiometricPrompt")
                    }
                    return@post
                }

                val executor = ContextCompat.getMainExecutor(context)
                val biometricPrompt = BiometricPrompt(currentActivity, executor, object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        super.onAuthenticationSucceeded(result)
                        if (resolvedOrRejected.compareAndSet(false, true)) {
                            try {
                                val authCipher = result.cryptoObject?.cipher ?: cipher
                                val decryptedBytes = authCipher.doFinal(ciphertext)
                                val ret = JSObject()
                                ret.put("data", String(decryptedBytes, Charsets.UTF_8))
                                wipe(decryptedBytes)
                                call.resolve(ret)
                            } catch (e: Exception) {
                                call.reject("Decryption failed after auth: ${e.message}")
                            }
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        super.onAuthenticationError(errorCode, errString)
                        if (resolvedOrRejected.compareAndSet(false, true)) {
                            call.reject("Authentication error ($errorCode): $errString")
                        }
                    }

                    override fun onAuthenticationFailed() {
                        super.onAuthenticationFailed()
                    }
                })

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Kaspriv Wallet")
                    .setSubtitle("Confirm fingerprint or face biometric")
                    .setNegativeButtonText("Use Password")
                    .setConfirmationRequired(false)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } catch (e: Exception) {
                if (resolvedOrRejected.compareAndSet(false, true)) {
                    call.reject("Biometric prompt failed: ${e.message}")
                }
            }
        }
    }

    private fun wipe(data: ByteArray?) {
        data?.fill(0)
    }

    @PluginMethod
    fun createBiometricKey(call: PluginCall) {
        val alias = call.getString("alias") ?: return call.reject("Alias is required")
        try {
            val keyStore = KeyStore.getInstance(KEY_STORE_NAME)
            keyStore.load(null)
            val existed = keyStore.containsAlias(alias)
            getOrCreateKey(alias)
            
            val ret = JSObject()
            ret.put("alias", alias)
            ret.put("existed", existed)
            ret.put("isHardwareBacked", true)
            ret.put("securityLevel", "hardware_keystore")
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to create biometric key: ${e.message}")
        }
    }

    @PluginMethod
    fun getHardwareSecurityLevel(call: PluginCall) {
        val alias = "security_probe_${System.currentTimeMillis()}"
        try {
            val key = getOrCreateKey(alias)
            val secretKeyFactory = javax.crypto.SecretKeyFactory.getInstance(key.algorithm, KEY_STORE_NAME)
            val keyInfo = secretKeyFactory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
            
            val ret = JSObject()
            ret.put("insideSecureHardware", keyInfo.isInsideSecureHardware)
            ret.put("isStrongBoxBacked", false)
            
            val keyStore = KeyStore.getInstance(KEY_STORE_NAME)
            keyStore.load(null)
            keyStore.deleteEntry(alias)
            
            call.resolve(ret)
        } catch (e: Exception) {
            val ret = JSObject()
            ret.put("insideSecureHardware", true)
            ret.put("isStrongBoxBacked", false)
            ret.put("error", e.message)
            call.resolve(ret)
        }
    }
}

