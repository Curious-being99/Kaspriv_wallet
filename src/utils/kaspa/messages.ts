import { blake2b } from '@noble/hashes/blake2.js';
import * as secp from '@noble/secp256k1';
import { wipe } from './common';

/**
 * Internal helper to sign a message with raw private key bytes.
 */
async function signMessageWithPrivateKeyBytes(
  message: string,
  privateKeyBytes: Uint8Array
): Promise<string> {
  // Manual logic using pure high-speed JS cryptographic primitives
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
 * Verify message signature using pure JavaScript Schnorr verification (@noble/secp256k1)
 */
export function verifyKaspaMessage(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const parseHex = (hex: string) => {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) throw new Error('Invalid hex');
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    };

    const msgBytes = new TextEncoder().encode(message);
    const msgHash = blake2b(msgBytes, { dkLen: 32 });
    const sigBytes = parseHex(signatureHex);
    const pubKeyBytes = parseHex(publicKeyHex);
    const xOnly = pubKeyBytes.length === 33 ? pubKeyBytes.slice(1) : pubKeyBytes;

    return secp.schnorr.verify(sigBytes, msgHash, xOnly);
  } catch (err) {
    return false;
  }
}
