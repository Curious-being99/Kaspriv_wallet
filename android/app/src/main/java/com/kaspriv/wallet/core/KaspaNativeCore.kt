package com.kaspriv.wallet.core

import android.util.Log

/**
 * Pure Native JNI Bridge to rusty-kaspa.
 * This completely bypasses JavaScript, WebViews, and WASM.
 * Kotlin communicates directly with the compiled Rust binary in memory.
 */
object KaspaNativeCore {
    private const val TAG = "KaspaNativeCore"

    init {
        try {
            // This loads the compiled rusty-kaspa C/Rust library (libkaspa_android.so)
            System.loadLibrary("kaspa_android")
            Log.d(TAG, "Successfully loaded native Kaspa Rust core.")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "CRITICAL: Failed to load libkaspa_android.so. Native binaries missing.", e)
        }
    }

    // =====================================================================
    // EXTERNAL NATIVE FUNCTIONS (Implemented in Rust)
    // =====================================================================

    /**
     * Generates a high-entropy 24-word BIP39 mnemonic phrase natively.
     */
    external fun generateMnemonic(): String

    /**
     * Validates a BIP39 mnemonic phrase natively.
     */
    external fun validateMnemonic(mnemonic: String): Boolean

    /**
     * Derives a Kaspa address from a mnemonic, password, and derivation path.
     * Uses Rust's memory-safe cryptography to handle the private key derivation.
     */
    external fun deriveAddress(
        mnemonic: String,
        password: String?,
        derivationPath: String,
        isP2SH: Boolean
    ): String

    /**
     * Signs a Kaspa transaction natively.
     * The private key never leaves the Rust memory space during the signing process.
     * 
     * @param unsignedTxJson The serialized unsigned transaction
     * @param mnemonic The seed phrase
     * @param password Optional BIP39 password
     * @return The signed transaction ready for broadcast
     */
    external fun signTransaction(
        unsignedTxJson: String,
        mnemonic: String,
        password: String?
    ): String
}
