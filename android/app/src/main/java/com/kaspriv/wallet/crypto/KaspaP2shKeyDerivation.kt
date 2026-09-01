package com.kaspriv.wallet.crypto

import org.bouncycastle.crypto.digests.Blake2bDigest
import org.bouncycastle.math.ec.ECPoint
import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class P2shDerivedKey(
    val privateKeyBytes: ByteArray,
    val xOnlyPublicKeyBytes: ByteArray,
    val redeemScriptBytes: ByteArray,
    val scriptPublicKeyBytes: ByteArray,
    val path: String
)

object KaspaP2shKeyDerivation {

    private const val COIN_TYPE_KASPA = 111111

    /**
     * Derives a P2SH Key and its corresponding Redeem Script along BIP44
     * Path: m/44'/111111'/account'/change/addressIndex
     */
    fun deriveP2shKey(
        seedBytes: ByteArray,
        accountIndex: Int = 0,
        isChange: Boolean = false,
        addressIndex: Int = 0
    ): P2shDerivedKey {
        val changeVal = if (isChange) 1 else 0
        val path = "m/44'/$COIN_TYPE_KASPA'/$accountIndex'/$changeVal/$addressIndex"

        // 1. Master Key Generation (HMAC-SHA512 with "Bitcoin seed")
        var (key, chainCode) = getMasterKey(seedBytes)

        // 2. Derive path indices: 44', 111111', account', change, index
        val segments = intArrayOf(
            44 or (1 shl 31),
            COIN_TYPE_KASPA or (1 shl 31),
            accountIndex or (1 shl 31),
            changeVal,
            addressIndex
        )

        for (index in segments) {
            val (k, c) = deriveChildKey(key, chainCode, index)
            key = k
            chainCode = c
        }

        // 3. Extract 32-byte X-Only Public Key (Schnorr secp256k1)
        val xOnlyPubKey = getXOnlyPublicKey(key)

        // 4. Construct P2SH Redeem Script: 0x20 [32-byte X-Only PubKey] 0xac (OP_CHECKSIG) -> 34 bytes
        val redeemScript = byteArrayOf(0x20.toByte()) + xOnlyPubKey + byteArrayOf(0xac.toByte())

        // 5. Construct P2SH ScriptPublicKey: 0xaa 0x20 [32-byte Blake2b hash of redeem script] 0x87 -> 35 bytes
        val scriptHash = computeBlake2b256(redeemScript)
        val scriptPublicKey = byteArrayOf(0xaa.toByte(), 0x20.toByte()) + scriptHash + byteArrayOf(0x87.toByte())

        return P2shDerivedKey(
            privateKeyBytes = key,
            xOnlyPublicKeyBytes = xOnlyPubKey,
            redeemScriptBytes = redeemScript,
            scriptPublicKeyBytes = scriptPublicKey,
            path = path
        )
    }

    private fun getMasterKey(seed: ByteArray): Pair<ByteArray, ByteArray> {
        val hmac = Mac.getInstance("HmacSHA512")
        hmac.init(SecretKeySpec("Bitcoin seed".toByteArray(Charsets.UTF_8), "HmacSHA512"))
        val i = hmac.doFinal(seed)
        return Pair(i.copyOfRange(0, 32), i.copyOfRange(32, 64))
    }

    private fun deriveChildKey(parentKey: ByteArray, parentChainCode: ByteArray, index: Int): Pair<ByteArray, ByteArray> {
        val isHardened = (index and (1 shl 31)) != 0
        val hmac = Mac.getInstance("HmacSHA512")
        hmac.init(SecretKeySpec(parentChainCode, "HmacSHA512"))

        val data = if (isHardened) {
            byteArrayOf(0x00) + parentKey + ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(index).array()
        } else {
            val pub = getCompressedPublicKey(parentKey)
            pub + ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(index).array()
        }

        val i = hmac.doFinal(data)
        val il = i.copyOfRange(0, 32)
        val ir = i.copyOfRange(32, 64)

        val domain = org.bouncycastle.crypto.ec.CustomNamedCurves.getByName("secp256k1")
        val k = BigInteger(1, il).add(BigInteger(1, parentKey)).mod(domain.n)
        val derivedKey = k.toByteArray().takeLast(32).toByteArray().padStart(32)

        return Pair(derivedKey, ir)
    }

    private fun getCompressedPublicKey(privateKey: ByteArray): ByteArray {
        val domain = org.bouncycastle.crypto.ec.CustomNamedCurves.getByName("secp256k1")
        val q: ECPoint = domain.g.multiply(BigInteger(1, privateKey)).normalize()
        return q.getEncoded(true)
    }

    private fun getXOnlyPublicKey(privateKey: ByteArray): ByteArray {
        val comp = getCompressedPublicKey(privateKey)
        return comp.copyOfRange(1, 33) // 32-byte X coordinate
    }

    private fun computeBlake2b256(data: ByteArray): ByteArray {
        val digest = Blake2bDigest(32)
        digest.update(data, 0, data.size)
        val out = ByteArray(32)
        digest.doFinal(out, 0)
        return out
    }

    private fun ByteArray.padStart(length: Int): ByteArray {
        if (this.size >= length) return this
        return ByteArray(length - this.size) + this
    }
}
