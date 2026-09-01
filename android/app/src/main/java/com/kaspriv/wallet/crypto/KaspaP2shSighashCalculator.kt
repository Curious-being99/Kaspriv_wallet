package com.kaspriv.wallet.crypto

import org.bouncycastle.crypto.digests.Blake2bDigest
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

object KaspaP2shSighashCalculator {

    private val SIGNING_HASH_TAG = "TransactionSigningHash".toByteArray(Charsets.UTF_8)
    private val SUB_HASH_TAG = "TransactionSigningHashECDSA".toByteArray(Charsets.UTF_8)
    const val SIGHASH_ALL: Byte = 0x01

    fun computeP2shSigHash(
        tx: KaspaRawTransaction,
        inputIndex: Int,
        utxos: List<UtxoEntry>,
        sighashType: Byte = SIGHASH_ALL
    ): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SIGNING_HASH_TAG)
        val buffer = ByteArrayOutputStream()

        // 1. Transaction Version (uint16 little endian)
        buffer.write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(tx.version.toShort()).array())

        // 2. Previous Outpoints Hash (Blake2b of all input outpoints)
        buffer.write(hashPreviousOutpoints(tx.inputs))

        // 3. Sequences Hash (Blake2b of all input sequences)
        buffer.write(hashSequences(tx.inputs))

        // 4. SigOpCounts Hash (Blake2b of all input sigOpCounts)
        buffer.write(hashSigOpCounts(tx.inputs))

        // 5. Current Input Outpoint (32-byte TXID in Little Endian + 4-byte index LE)
        val curInput = tx.inputs[inputIndex]
        buffer.write(hexToBytes(curInput.previousOutpoint.transactionId).reversedArray())
        buffer.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(curInput.previousOutpoint.index).array())

        // 6. Current Input UTXO Data: Amount (uint64 LE) + Script Version (uint16 LE 0) + SPK Length + SPK Bytes (35-byte P2SH)
        val curUtxo = utxos[inputIndex]
        val scriptPubKeyBytes = hexToBytes(curUtxo.scriptPublicKey)
        buffer.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(curUtxo.amountSompi).array())
        buffer.write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(0).array()) // Script version 0
        buffer.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(scriptPubKeyBytes.size.toLong()).array())
        buffer.write(scriptPubKeyBytes)

        // 7. Current Input Sequence & SigOpCount
        buffer.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(curInput.sequence).array())
        buffer.write(curInput.sigOpCount.toInt())

        // 8. Outputs Hash (Blake2b of all output amounts, script versions, and SPKs)
        buffer.write(hashOutputs(tx.outputs))

        // 9. LockTime (uint64 LE), Subnetwork ID (20 bytes), Gas (uint64 LE), Payload Hash
        buffer.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(tx.lockTime).array())
        buffer.write(hexToBytes(tx.subnetworkId))
        buffer.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(tx.gas).array())
        buffer.write(hashPayload(tx.payload))

        // 10. Sighash Type (1 byte)
        buffer.write(sighashType.toInt())

        val preimage = buffer.toByteArray()
        digest.update(preimage, 0, preimage.size)

        val sighash = ByteArray(32)
        digest.doFinal(sighash, 0)
        return sighash
    }

    private fun hashPreviousOutpoints(inputs: List<TransactionInput>): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SUB_HASH_TAG)
        for (input in inputs) {
            digest.update(hexToBytes(input.previousOutpoint.transactionId).reversedArray(), 0, 32)
            val idx = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(input.previousOutpoint.index).array()
            digest.update(idx, 0, 4)
        }
        val res = ByteArray(32)
        digest.doFinal(res, 0)
        return res
    }

    private fun hashSequences(inputs: List<TransactionInput>): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SUB_HASH_TAG)
        for (input in inputs) {
            val seq = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(input.sequence).array()
            digest.update(seq, 0, 8)
        }
        val res = ByteArray(32)
        digest.doFinal(res, 0)
        return res
    }

    private fun hashSigOpCounts(inputs: List<TransactionInput>): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SUB_HASH_TAG)
        for (input in inputs) {
            digest.update(input.sigOpCount)
        }
        val res = ByteArray(32)
        digest.doFinal(res, 0)
        return res
    }

    private fun hashOutputs(outputs: List<TransactionOutput>): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SUB_HASH_TAG)
        for (out in outputs) {
            val amount = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(out.amountSompi).array()
            val scriptVer = ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(0).array()
            val scriptLen = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(out.scriptPublicKey.size.toLong()).array()

            digest.update(amount, 0, 8)
            digest.update(scriptVer, 0, 2)
            digest.update(scriptLen, 0, 8)
            digest.update(out.scriptPublicKey, 0, out.scriptPublicKey.size)
        }
        val res = ByteArray(32)
        digest.doFinal(res, 0)
        return res
    }

    private fun hashPayload(payload: ByteArray): ByteArray {
        val digest = Blake2bDigest(null, 32, null, SUB_HASH_TAG)
        if (payload.isNotEmpty()) {
            digest.update(payload, 0, payload.size)
        }
        val res = ByteArray(32)
        digest.doFinal(res, 0)
        return res
    }

    fun hexToBytes(hex: String): ByteArray {
        val clean = hex.removePrefix("0x")
        val len = clean.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(clean[i], 16) shl 4) + Character.digit(clean[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }

    fun bytesToHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}
