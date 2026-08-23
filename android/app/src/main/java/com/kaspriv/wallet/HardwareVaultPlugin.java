package com.kaspriv.wallet;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "HardwareVault")
public class HardwareVaultPlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;
    private static final int KEY_SIZE = 256;

    // Prevent unexpectedly large encrypted vault payloads.
    private static final int MAX_CIPHERTEXT_BYTES = 4096;

    // Native namespace for all KasPriv biometric keys.
    private static final String ALIAS_PREFIX = "kaspriv_vault_";

    /**
     * The decrypted secret execution handler.
     * Consumes secret synchronously in memory and returns resulting non-secret payload or secret Base64 for vault decryption.
     */
    private interface NativeSecretOperation {
        JSObject execute(byte[] secret, PluginCall call) throws Exception;
    }

    @PluginMethod
    public void checkBiometricAvailability(PluginCall call) {
        try {
            BiometricManager biometricManager =
                    BiometricManager.from(getContext());

            int status = biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG
            );

            String reason;

            switch (status) {
                case BiometricManager.BIOMETRIC_SUCCESS:
                    reason = "available";
                    break;

                case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                    reason = "no_hardware";
                    break;

                case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                    reason = "hw_unavailable";
                    break;

                case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                    reason = "not_enrolled";
                    break;

                case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                    reason = "security_update_required";
                    break;

                default:
                    reason = "unknown";
                    break;
            }

            JSObject result = new JSObject();
            result.put(
                    "available",
                    status == BiometricManager.BIOMETRIC_SUCCESS
            );
            result.put("reason", reason);

            call.resolve(result);

        } catch (Exception e) {
            call.reject("BIOMETRIC_CHECK_FAILED");
        }
    }

    @PluginMethod
    public void createBiometricKey(PluginCall call) {

        String alias = call.getString(
                "alias",
                ALIAS_PREFIX + "v1"
        );

        boolean requireStrongBox = Boolean.TRUE.equals(call.getBoolean("requireStrongBox", false));

        if (!isValidAlias(alias)) {
            call.reject("ALIAS_OUT_OF_NAMESPACE");
            return;
        }

        try {
            KeyStore keyStore =
                    KeyStore.getInstance(ANDROID_KEYSTORE);

            keyStore.load(null);

            if (keyStore.containsAlias(alias)) {
                SecretKey key = (SecretKey) keyStore.getKey(alias, null);
                JSObject infoObj = inspectKeyInfo(key);

                JSObject result = new JSObject();
                result.put("alias", alias);
                result.put("existed", true);
                result.put("isHardwareBacked", infoObj.getBoolean("isHardwareBacked"));
                result.put("securityLevel", infoObj.getString("securityLevel"));

                call.resolve(result);
                return;
            }

            if (requireStrongBox && Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                call.reject("STRONGBOX_UNAVAILABLE");
                return;
            }

            KeyGenerator keyGenerator =
                    KeyGenerator.getInstance(
                            KeyProperties.KEY_ALGORITHM_AES,
                            ANDROID_KEYSTORE
                    );

            KeyGenParameterSpec.Builder builder =
                    new KeyGenParameterSpec.Builder(
                            alias,
                            KeyProperties.PURPOSE_ENCRYPT
                                    | KeyProperties.PURPOSE_DECRYPT
                    )
                            .setBlockModes(
                                    KeyProperties.BLOCK_MODE_GCM
                            )
                            .setEncryptionPaddings(
                                    KeyProperties.ENCRYPTION_PADDING_NONE
                            )
                            .setKeySize(KEY_SIZE)
                            .setUserAuthenticationRequired(true)
                            .setInvalidatedByBiometricEnrollment(true);

            if (requireStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    builder.setIsStrongBoxBacked(true);
                } catch (Exception e) {
                    call.reject("STRONGBOX_UNAVAILABLE");
                    return;
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(
                        0,
                        KeyProperties.AUTH_BIOMETRIC_STRONG
                );
            } else {
                builder.setUserAuthenticationValidityDurationSeconds(-1);
            }

            try {
                keyGenerator.init(builder.build());
                keyGenerator.generateKey();
            } catch (Exception e) {
                if (requireStrongBox) {
                    call.reject("STRONGBOX_UNAVAILABLE");
                    return;
                } else {
                    throw e;
                }
            }

            SecretKey createdKey = (SecretKey) keyStore.getKey(alias, null);
            JSObject infoObj = inspectKeyInfo(createdKey);

            JSObject result = new JSObject();
            result.put("alias", alias);
            result.put("existed", false);
            result.put("isHardwareBacked", infoObj.getBoolean("isHardwareBacked"));
            result.put("securityLevel", infoObj.getString("securityLevel"));

            call.resolve(result);

        } catch (Exception e) {
            call.reject("CREATE_KEY_FAILED");
        }
    }

    @PluginMethod
    public void wrapSecret(PluginCall call) {
        String alias = call.getString("alias");
        String secretBase64 = call.getString("secretBase64");

        if (!isValidAlias(alias)) {
            call.reject("ALIAS_OUT_OF_NAMESPACE");
            return;
        }

        if (secretBase64 == null || secretBase64.isEmpty()) {
            call.reject("MISSING_SECRET");
            return;
        }

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY");
            return;
        }

        byte[] secret = null;
        boolean wrappedOwnershipTransferred = false;

        try {
            try {
                secret = Base64.decode(secretBase64, Base64.NO_WRAP);
            } catch (IllegalArgumentException e) {
                call.reject("INVALID_BASE64");
                return;
            }

            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);

            SecretKey key = (SecretKey) keyStore.getKey(alias, null);
            if (key == null) {
                call.reject("KEY_NOT_FOUND");
                return;
            }

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);

            BiometricPrompt.CryptoObject cryptoObject =
                    new BiometricPrompt.CryptoObject(cipher);

            NativeSecretOperation operation =
                    (ciphertext, nativeCall) -> {
                        byte[] iv = cipher.getIV();
                        JSObject ret = new JSObject();
                        ret.put("wrappedBase64", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
                        ret.put("ivBase64", Base64.encodeToString(iv, Base64.NO_WRAP));
                        return ret;
                    };

            prompt(
                    activity,
                    cryptoObject,
                    "Register KasPriv vault",
                    call,
                    secret,
                    operation
            );

            wrappedOwnershipTransferred = true;

        } catch (Exception e) {
            call.reject("WRAP_SECRET_FAILED");
        } finally {
            if (!wrappedOwnershipTransferred) {
                wipe(secret);
            }
        }
    }

    @PluginMethod
    public void hasKey(PluginCall call) {
        String alias = call.getString("alias");
        if (!isValidAlias(alias)) {
            call.reject("ALIAS_OUT_OF_NAMESPACE");
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            boolean exists = keyStore.containsAlias(alias);
            JSObject result = new JSObject();
            result.put("exists", exists);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("HAS_KEY_FAILED");
        }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        String alias = call.getString("alias");
        if (!isValidAlias(alias)) {
            call.reject("ALIAS_OUT_OF_NAMESPACE");
            return;
        }
        deleteKeystoreEntry(alias);
        call.resolve();
    }

    @PluginMethod
    public void unwrapSecret(PluginCall call) {

        String alias = call.getString("alias");
        String wrappedBase64 = call.getString("wrappedBase64");
        String ivBase64 = call.getString("ivBase64");

        if (!isValidAlias(alias)) {
            call.reject("ALIAS_OUT_OF_NAMESPACE");
            return;
        }

        if (wrappedBase64 == null || wrappedBase64.isEmpty()) {
            call.reject("MISSING_CIPHERTEXT");
            return;
        }

        if (ivBase64 == null || ivBase64.isEmpty()) {
            call.reject("MISSING_IV");
            return;
        }

        FragmentActivity activity = getActivity();

        if (activity == null) {
            call.reject("NO_ACTIVITY");
            return;
        }

        byte[] wrapped = null;
        byte[] iv = null;

        boolean wrappedOwnershipTransferred = false;

        try {

            try {
                wrapped = Base64.decode(
                        wrappedBase64,
                        Base64.NO_WRAP
                );

                iv = Base64.decode(
                        ivBase64,
                        Base64.NO_WRAP
                );

            } catch (IllegalArgumentException e) {
                call.reject("INVALID_BASE64");
                return;
            }

            if (iv.length != GCM_IV_BYTES) {
                call.reject("INVALID_IV_LENGTH");
                return;
            }

            if (wrapped.length <= GCM_TAG_BITS / 8) {
                call.reject("INVALID_CIPHERTEXT_LENGTH");
                return;
            }

            if (wrapped.length > MAX_CIPHERTEXT_BYTES) {
                call.reject("INVALID_CIPHERTEXT_LENGTH");
                return;
            }

            KeyStore keyStore =
                    KeyStore.getInstance(ANDROID_KEYSTORE);

            keyStore.load(null);

            SecretKey key =
                    (SecretKey) keyStore.getKey(alias, null);

            if (key == null) {
                call.reject("KEY_NOT_FOUND");
                return;
            }

            Cipher cipher =
                    Cipher.getInstance(TRANSFORMATION);

            cipher.init(
                    Cipher.DECRYPT_MODE,
                    key,
                    new GCMParameterSpec(
                            GCM_TAG_BITS,
                            iv
                    )
            );

            BiometricPrompt.CryptoObject cryptoObject =
                    new BiometricPrompt.CryptoObject(cipher);

            NativeSecretOperation operation =
                    (secret, nativeCall) -> {
                        JSObject ret = new JSObject();
                        ret.put("secretBase64", Base64.encodeToString(secret, Base64.NO_WRAP));
                        return ret;
                    };

            prompt(
                    activity,
                    cryptoObject,
                    "Unlock KasPriv vault",
                    call,
                    wrapped,
                    operation
            );

            wrappedOwnershipTransferred = true;

        } catch (KeyPermanentlyInvalidatedException e) {

            deleteKeystoreEntry(alias);

            call.reject(
                    "KEY_INVALIDATED_REENROLL_REQUIRED"
            );

        } catch (Exception e) {

            call.reject("UNWRAP_INIT_FAILED");

        } finally {

            wipe(iv);

            if (!wrappedOwnershipTransferred) {
                wipe(wrapped);
            }
        }
    }

    private void prompt(
            FragmentActivity activity,
            BiometricPrompt.CryptoObject cryptoObject,
            String title,
            PluginCall call,
            byte[] wrapped,
            NativeSecretOperation operation
    ) {

        Executor executor =
                ContextCompat.getMainExecutor(activity);

        AtomicBoolean settled =
                new AtomicBoolean(false);

        BiometricPrompt.PromptInfo promptInfo =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle("Biometric authentication")
                        .setNegativeButtonText("Cancel")
                        .setAllowedAuthenticators(
                                BiometricManager.Authenticators.BIOMETRIC_STRONG
                        )
                        .build();

        activity.runOnUiThread(() -> {

            BiometricPrompt biometricPrompt =
                    new BiometricPrompt(
                            activity,
                            executor,
                            new BiometricPrompt.AuthenticationCallback() {

                                @Override
                                public void onAuthenticationSucceeded(
                                        @NonNull BiometricPrompt.AuthenticationResult result
                                ) {

                                    if (!settled.compareAndSet(
                                            false,
                                            true
                                    )) {
                                        return;
                                    }

                                    byte[] secret = null;

                                    try {

                                        Cipher cipher =
                                                result.getCryptoObject()
                                                        .getCipher();

                                        if (cipher == null) {
                                            throw new IllegalStateException(
                                                    "NO_CIPHER"
                                            );
                                        }

                                        secret = cipher.doFinal(wrapped);

                                        JSObject resultObject =
                                                operation.execute(
                                                        secret,
                                                        call
                                                );

                                        call.resolve(resultObject);

                                    } catch (UnsupportedOperationException e) {

                                        call.reject(
                                                "NATIVE_SIGNER_NOT_CONFIGURED"
                                        );

                                    } catch (javax.crypto.AEADBadTagException e) {

                                        call.reject(
                                                "DECRYPT_AUTH_FAILED"
                                        );

                                    } catch (Exception e) {

                                        call.reject(
                                                "BIOMETRIC_OPERATION_FAILED"
                                        );

                                    } finally {

                                        wipe(secret);
                                        wipe(wrapped);
                                    }
                                }

                                @Override
                                public void onAuthenticationError(
                                        int errorCode,
                                        @NonNull CharSequence errString
                                ) {

                                    if (!settled.compareAndSet(
                                            false,
                                            true
                                    )) {
                                        return;
                                    }

                                    wipe(wrapped);

                                    String reason;

                                    switch (errorCode) {

                                        case BiometricPrompt.ERROR_LOCKOUT:
                                        case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                                            reason = "lockout";
                                            break;

                                        case BiometricPrompt.ERROR_HW_UNAVAILABLE:
                                            reason = "hw_unavailable";
                                            break;

                                        case BiometricPrompt.ERROR_NO_BIOMETRICS:
                                            reason = "not_enrolled";
                                            break;

                                        case BiometricPrompt.ERROR_USER_CANCELED:
                                        case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                                            reason = "user_cancelled";
                                            break;

                                        default:
                                            reason = "other";
                                            break;
                                    }

                                    JSObject error =
                                            new JSObject();

                                    error.put(
                                            "errorCode",
                                            errorCode
                                    );

                                    error.put(
                                            "reason",
                                            reason
                                    );

                                    call.reject(
                                            reason,
                                            error
                                    );
                                }

                                @Override
                                public void onAuthenticationFailed() {
                                }
                            }
                    );

            try {

                biometricPrompt.authenticate(
                        promptInfo,
                        cryptoObject
                );

            } catch (Exception e) {

                if (settled.compareAndSet(false, true)) {

                    wipe(wrapped);

                    call.reject(
                            "BIOMETRIC_PROMPT_FAILED"
                    );
                }
            }
        });
    }

    private static JSObject inspectKeyInfo(SecretKey key) {
        boolean isHardwareBacked = false;
        String securityLevel = "unknown";
        if (key != null) {
            try {
                SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), ANDROID_KEYSTORE);
                KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
                isHardwareBacked = info.isInsideSecureHardware();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    int level = info.getSecurityLevel();
                    switch (level) {
                        case KeyProperties.SECURITY_LEVEL_STRONGBOX:
                            securityLevel = "strongbox";
                            break;
                        case KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT:
                            securityLevel = "tee";
                            break;
                        case KeyProperties.SECURITY_LEVEL_SOFTWARE:
                            securityLevel = "software";
                            break;
                        default:
                            securityLevel = isHardwareBacked ? "hardware" : "software";
                            break;
                    }
                } else {
                    securityLevel = isHardwareBacked ? "tee" : "software";
                }
            } catch (Exception ignored) {}
        }
        JSObject result = new JSObject();
        result.put("isHardwareBacked", isHardwareBacked);
        result.put("securityLevel", securityLevel);
        return result;
    }

    private static boolean isValidAlias(String alias) {

        if (alias == null) {
            return false;
        }

        if (alias.isEmpty()) {
            return false;
        }

        if (!alias.startsWith(ALIAS_PREFIX)) {
            return false;
        }

        if (alias.length() > 128) {
            return false;
        }

        return true;
    }

    private static void deleteKeystoreEntry(String alias) {

        if (alias == null) {
            return;
        }

        try {

            KeyStore keyStore =
                    KeyStore.getInstance(
                            ANDROID_KEYSTORE
                    );

            keyStore.load(null);

            if (keyStore.containsAlias(alias)) {
                keyStore.deleteEntry(alias);
            }

        } catch (Exception ignored) {
        }
    }

    private static void wipe(byte[] data) {

        if (data != null) {
            Arrays.fill(data, (byte) 0);
        }
    }
}
