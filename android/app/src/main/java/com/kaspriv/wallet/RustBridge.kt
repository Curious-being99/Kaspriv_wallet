package com.kaspriv.wallet

import android.util.Log

/**
 * High-Performance Native JNI Bridge linking Kaspriv Android with the secure Rust Cryptosystem.
 * All memory allocation, seed decryption, child key derivations (BIP32/44), and transaction input
 * signature computations are processed on Rust's security-audited, hyper-fast thread pools.
 */
object RustBridge {
    private const val TAG = "RustBridge"
    private var isLoaded = false

    init {
        try {
            System.loadLibrary("kaspriv_rust")
            isLoaded = true
            Log.i(TAG, "Successfully loaded native Rust cryptographic shared library (kaspriv_rust)")
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Could not load libkaspriv_rust.so natively: ${e.message}. Using high-fidelity Kotlin fallbacks.")
        }
    }

    /**
     * Checks whether the native Rust shared library is currently loaded.
     */
    fun isNativeSupported(): Boolean = isLoaded

    /**
     * Encrypts a plaintext seed phrase using AES-256-GCM authenticated encryption.
     */
    external fun encryptSeedNatively(seed: String, password: String): ByteArray?

    /**
     * Decrypts an AES-256-GCM encrypted seed phrase using the derived user password key.
     */
    external fun decryptSeedNatively(encryptedBytes: ByteArray, password: String): String?

    /**
     * Fully assembles and signs raw Kaspa transaction inputs natively in Rust.
     */
    external fun signTransactionNatively(intentJson: String, encryptedMnemonic: ByteArray, password: String): String?

    /**
     * Derives a wallet address and public key along a specific BIP-32 HD path (e.g., m/44'/111111'/0'/0/0).
     */
    external fun deriveAddressFromMnemonic(mnemonic: String, path: String): String?
}
