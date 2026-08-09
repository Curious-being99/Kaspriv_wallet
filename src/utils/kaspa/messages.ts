import { blake2b } from '@noble/hashes/blake2.js';
import * as secp from '@noble/secp256k1';
import { wipe, kaspaWasmModule } from './common';

/**
 * Internal helper to sign a message with raw private key bytes.
 */
async function signMessageWithPrivateKeyBytes(
  message: string,
  privateKeyBytes: Uint8Array
): Promise<string> {
  if (kaspaWasmModule && typeof kaspaWasmModule.signMessage === 'function') {
    // Create an explicit PrivateKey object to ensure we can free it
    const privateKeyObj = new kaspaWasmModule.PrivateKey(privateKeyBytes);
    try {
      const sig = kaspaWasmModule.signMessage({
        message,
        privateKey: privateKeyObj,
      });
      if (!sig) {
        throw new Error('kaspa-wasm message signing returned no signature');
      }
      return sig;
    } finally {
      if (typeof privateKeyObj.free === 'function') {
        privateKeyObj.free();
      }
    }
  }

  // Manual fallback logic only if WASM is not available or hasn't returned yet
  const msgBytes = new TextEncoder().encode(message);
  const msgHash = blake2b(msgBytes, { dkLen: 32 });
  
  const sig = await secp.schnorr.sign(msgHash, privateKeyBytes);
  return Buffer.from(sig).toString('hex');
}

/**
 * Sign a message using Kaspa-style Schnorr signature
 */
export async function signKaspaMessage(
  message: string,
  privateKeyBytes: Uint8Array
): Promise<string> {
  if (!(privateKeyBytes instanceof Uint8Array)) {
    throw new TypeError('Private key must be provided as Uint8Array');
  }

  if (privateKeyBytes.length !== 32) {
    throw new Error('Invalid private-key length');
  }

  const keyCopy = new Uint8Array(privateKeyBytes);

  try {
    const signature = await signMessageWithPrivateKeyBytes(
      message,
      keyCopy
    );

    return signature;
  } finally {
    wipe(keyCopy);
  }
}

/**
 * Verify message signature using kaspa-wasm / Schnorr verification
 */
export function verifyKaspaMessage(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    if (kaspaWasmModule && typeof kaspaWasmModule.verifyMessage === 'function') {
      return kaspaWasmModule.verifyMessage({
        message,
        signature: signatureHex,
        publicKey: publicKeyHex,
      });
    }
  } catch (e) {
    // fallback
  }

  try {
    const msgBytes = new TextEncoder().encode(message);
    const msgHash = blake2b(msgBytes, { dkLen: 32 });
    const sigBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const pubKeyBytes = new Uint8Array(publicKeyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const xOnly = pubKeyBytes.length === 33 ? pubKeyBytes.slice(1) : pubKeyBytes;

    return secp.schnorr.verify(sigBytes, msgHash, xOnly);
  } catch (err) {
    return false;
  }
}
