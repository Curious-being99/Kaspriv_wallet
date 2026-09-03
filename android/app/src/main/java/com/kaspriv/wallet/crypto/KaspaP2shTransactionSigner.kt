package com.kaspriv.wallet.crypto

import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.signers.BIP340Signer
import java.math.BigInteger

object KaspaP2shTransactionSigner {

    /**
     * Signs all P2SH inputs in a transaction
     */
    fun signP2shTransaction(
        rawTx: KaspaRawTransaction,
        selectedUtxos: List<UtxoEntry>,
        derivedP2shKeys: List<P2shDerivedKey>
    ): KaspaRawTransaction {
        require(rawTx.inputs.size == selectedUtxos.size) { "Inputs and UTXOs count mismatch" }
        require(rawTx.inputs.size == derivedP2shKeys.size) { "Inputs and DerivedKeys count mismatch" }

        for (i in rawTx.inputs.indices) {
            val keyInfo = derivedP2shKeys[i]

            // 1. Calculate P2SH Blake2b Sighash
            val sigHash = KaspaP2shSighashCalculator.computeP2shSigHash(
                tx = rawTx,
                inputIndex = i,
                utxos = selectedUtxos,
                sighashType = KaspaP2shSighashCalculator.SIGHASH_ALL
            )

            // 2. Compute 64-byte BIP340 Schnorr signature
            val schnorrSig = signBip340Schnorr(sigHash, keyInfo.privateKeyBytes)

            // 3. Append SIGHASH_ALL (0x01) -> 65 bytes total
            val sigWithHashType = schnorrSig + byteArrayOf(KaspaP2shSighashCalculator.SIGHASH_ALL)

            // 4. Construct P2SH Signature Script:
            // [Push 65 bytes (0x41)] + [65 bytes sigWithHashType] + [Push 34 bytes (0x22)] + [34-byte RedeemScript]
            val redeemScript = keyInfo.redeemScriptBytes
            val sigScript = byteArrayOf(sigWithHashType.size.toByte()) +
                    sigWithHashType +
                    byteArrayOf(redeemScript.size.toByte()) +
                    redeemScript

            rawTx.inputs[i].signatureScript = sigScript
        }

        return rawTx
    }

    private fun signBip340Schnorr(messageHash: ByteArray, privateKeyBytes: ByteArray): ByteArray {
        val domain = org.bouncycastle.crypto.ec.CustomNamedCurves.getByName("secp256k1")
        val privKeyParams = ECPrivateKeyParameters(BigInteger(1, privateKeyBytes), domain)

        val signer = BIP340Signer()
        signer.init(true, privKeyParams)
        signer.update(messageHash, 0, messageHash.size)

        return signer.generateSignature() // 64 bytes
    }
}
