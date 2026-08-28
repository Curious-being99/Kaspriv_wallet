package com.kaspriv.wallet.crypto

import org.json.JSONObject

/**
 * 1:1 JNI Connector to the compiled Rust kaspriv_core native library.
 * Provides fallback pure-Kotlin implementations if libkaspriv_core.so is not bundled.
 */
object NativeKaspaCore {

    private var isNativeLoaded = false

    init {
        try {
            System.loadLibrary("kaspriv_core")
            isNativeLoaded = true
        } catch (e: UnsatisfiedLinkError) {
            isNativeLoaded = false
        }
    }

    fun isLoaded(): Boolean = isNativeLoaded

    /**
     * Native JNI method to calculate Kaspa transaction mass
     */
    external fun calculateMass(
        inputsCount: Int,
        outputsCount: Int,
        isP2SH: Boolean,
        payloadLen: Int
    ): Long

    /**
     * Native JNI method to build & sign transaction payload
     */
    external fun buildAndSignTx(paramsJson: String): String

    /**
     * Native JNI method to derive Schnorr public key
     */
    external fun deriveSchnorrPublicKey(privateKeyHex: String): String

    /**
     * Native JNI method for lightweight single-pass Schnorr signing (no double-SHA)
     */
    external fun signMessageLightweight(privateKeyHex: String, messageUtf8: String): String

    /**
     * Safe wrapper that delegates to native Rust if available, or pure Kotlin fallback
     */
    fun computeMass(inputsCount: Int, outputsCount: Int, isP2SH: Boolean = false, payloadLen: Int = 0): Long {
        return if (isNativeLoaded) {
            try {
                calculateMass(inputsCount, outputsCount, isP2SH, payloadLen)
            } catch (e: Exception) {
                fallbackMass(inputsCount, outputsCount, isP2SH, payloadLen)
            }
        } else {
            fallbackMass(inputsCount, outputsCount, isP2SH, payloadLen)
        }
    }

    private fun fallbackMass(inputsCount: Int, outputsCount: Int, isP2SH: Boolean, payloadLen: Int): Long {
        val inCount = if (inputsCount <= 0) 1 else inputsCount
        val outCount = if (outputsCount <= 0) 1 else outputsCount
        val base = 40L
        val inSize = if (isP2SH) 150L else 112L
        val outSize = 44L
        val serializedMass = base + (inCount * inSize) + (outCount * outSize) + payloadLen
        val spkMass = outCount * (if (isP2SH) 35L else 34L) * 10L
        val sigOpsMass = inCount * 1000L
        val buffer = 300L
        return serializedMass + spkMass + sigOpsMass + buffer
    }
}
