package com.kaspriv.wallet;

import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
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
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "HardwareVault")
public class HardwareVaultPlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int KEY_SIZE = 256;

    @PluginMethod
    public void createBiometricKey(PluginCall call) {
        String alias = call.getString("alias", "kaspriv_vault_v1");
        boolean requireStrongBox = Boolean.TRUE.equals(call.getBoolean("requireStrongBox", false));

        try {
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(alias)) {
                JSObject ret = new JSObject();
                ret.put("alias", alias);
                ret.put("strongBox", false);
                ret.put("existed", true);
                call.resolve(ret);
                return;
            }

            KeyGenerator keyGenerator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);

            KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(KEY_SIZE)
                    .setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(
                        0, // require auth every use
                        KeyProperties.AUTH_BIOMETRIC_STRONG
                );
            } else {
                builder.setUserAuthenticationValidityDurationSeconds(-1);
            }

            boolean strongBox = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    builder.setIsStrongBoxBacked(true);
                    keyGenerator.init(builder.build());
                    keyGenerator.generateKey();
                    strongBox = true;
                } catch (Exception e) {
                    if (requireStrongBox) {
                        call.reject("StrongBox required but unavailable: " + e.getMessage());
                        return;
                    }
                    // Retry without StrongBox (TEE-backed Keystore)
                    KeyGenParameterSpec.Builder fallback = new KeyGenParameterSpec.Builder(
                            alias,
                            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
                    )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .setKeySize(KEY_SIZE)
                            .setUserAuthenticationRequired(true)
                            .setInvalidatedByBiometricEnrollment(true);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        fallback.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
                    } else {
                        fallback.setUserAuthenticationValidityDurationSeconds(-1);
                    }
                    keyGenerator.init(fallback.build());
                    keyGenerator.generateKey();
                }
            } else {
                keyGenerator.init(builder.build());
                keyGenerator.generateKey();
            }

            JSObject ret = new JSObject();
            ret.put("alias", alias);
            ret.put("strongBox", strongBox);
            ret.put("existed", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("createBiometricKey failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void hasKey(PluginCall call) {
        String alias = call.getString("alias", "kaspriv_vault_v1");
        try {
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            JSObject ret = new JSObject();
            ret.put("exists", ks.containsAlias(alias));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        String alias = call.getString("alias", "kaspriv_vault_v1");
        try {
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(alias)) {
                ks.deleteEntry(alias);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void wrapSecret(PluginCall call) {
        String alias = call.getString("alias");
        String secretBase64 = call.getString("secretBase64");
        if (alias == null || secretBase64 == null) {
            call.reject("alias and secretBase64 required");
            return;
        }

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        try {
            byte[] secret = Base64.decode(secretBase64, Base64.NO_WRAP);
            SecretKey key = getSecretKey(alias);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);

            BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(cipher);
            prompt(activity, cryptoObject, "Authorize KasPriv vault", call, true, secret, null, null);
        } catch (Exception e) {
            call.reject("wrapSecret init failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void unwrapSecret(PluginCall call) {
        String alias = call.getString("alias");
        String wrappedBase64 = call.getString("wrappedBase64");
        String ivBase64 = call.getString("ivBase64");
        if (alias == null || wrappedBase64 == null || ivBase64 == null) {
            call.reject("alias, wrappedBase64, ivBase64 required");
            return;
        }

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        try {
            byte[] wrapped = Base64.decode(wrappedBase64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivBase64, Base64.NO_WRAP);
            SecretKey key = getSecretKey(alias);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));

            BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(cipher);
            prompt(activity, cryptoObject, "Unlock KasPriv vault", call, false, null, wrapped, iv);
        } catch (Exception e) {
            call.reject("unwrapSecret init failed: " + e.getMessage(), e);
        }
    }

    private SecretKey getSecretKey(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        return (SecretKey) ks.getKey(alias, null);
    }

    private void prompt(
            FragmentActivity activity,
            BiometricPrompt.CryptoObject cryptoObject,
            String title,
            PluginCall call,
            boolean encrypt,
            byte[] secretOrNull,
            byte[] wrappedOrNull,
            byte[] ivOrNull
    ) {
        Executor executor = ContextCompat.getMainExecutor(activity);

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle("Biometric strong authentication")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build();

        activity.runOnUiThread(() -> {
            BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(
                                @NonNull BiometricPrompt.AuthenticationResult result) {
                            try {
                                Cipher cipher = result.getCryptoObject() != null
                                        ? result.getCryptoObject().getCipher()
                                        : null;
                                if (cipher == null) {
                                    call.reject("No cipher after biometric success");
                                    return;
                                }

                                if (encrypt) {
                                    byte[] iv = cipher.getIV();
                                    byte[] wrapped = cipher.doFinal(secretOrNull);
                                    // best-effort clear
                                    if (secretOrNull != null) {
                                        java.util.Arrays.fill(secretOrNull, (byte) 0);
                                    }
                                    JSObject ret = new JSObject();
                                    ret.put("wrappedBase64",
                                            Base64.encodeToString(wrapped, Base64.NO_WRAP));
                                    ret.put("ivBase64",
                                            Base64.encodeToString(iv, Base64.NO_WRAP));
                                    call.resolve(ret);
                                } else {
                                    byte[] secret = cipher.doFinal(wrappedOrNull);
                                    JSObject ret = new JSObject();
                                    ret.put("secretBase64",
                                            Base64.encodeToString(secret, Base64.NO_WRAP));
                                    java.util.Arrays.fill(secret, (byte) 0);
                                    call.resolve(ret);
                                }
                            } catch (Exception e) {
                                call.reject("Crypto operation failed: " + e.getMessage(), e);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            call.reject("Biometric error: " + errString);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            // User can retry; do not reject yet
                        }
                    });

            biometricPrompt.authenticate(promptInfo, cryptoObject);
        });
    }
}
