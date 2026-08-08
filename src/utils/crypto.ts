import { argon2id } from 'hash-wasm';

/**
 * Securely overwrites a Uint8Array with zeros.
 */
function wipe(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Secure Encryption & Decryption Utilities
 * Utilizes Argon2id for key derivation and AES-GCM 256-bit for encryption/decryption.
 * Designed to encrypt/decrypt sensitive wallet seed phrases on device using the user's password.
 */

// KDF & Cipher Specification Version
export const KDF_SPEC_VERSION = 'v1.0.0-argon2id-aes256gcm';

// AAD Context Binding
export const AAD_CONTEXT = "KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC";

// Argon2id Parameters (RFC 9106 recommended parameters for memory-hard key derivation)
export const ARGON2_CONFIG = {
  version: 1,
  iterations: 4,      // 4 passes
  memorySize: 65536,  // 64 MiB (65,536 KiB)
  parallelism: 1,     // 1 thread/lane
  hashLength: 32,     // 32 bytes (256-bit AES key)
  outputType: 'binary' as const,
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encrypts a plaintext string using a key derived from a password.
 */
export async function encryptWithPassword(plaintext: string, password: string, context: string = AAD_CONTEXT): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const aadBytes = encoder.encode(context);
  
  // 1. Generate random salt (16 bytes) and IV (12-bytes)
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // 2. Derive AES-GCM 256-bit key using Argon2id
  const keyBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });
  
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  
  wipe(keyBytes);
  
  // 3. Encrypt plaintext
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes },
    aesKey,
    plaintextBytes
  );
  
  wipe(plaintextBytes);
  
  return {
    ciphertext: bytesToHex(new Uint8Array(encryptedBuffer)),
    salt: bytesToHex(salt),
    iv: bytesToHex(iv)
  };
}

/**
 * Decrypts a hex-encoded ciphertext string using a key derived from a password.
 * Throws an error if decryption fails (e.g. invalid password or wrong AAD context).
 */
export async function decryptWithPassword(ciphertextHex: string, saltHex: string, ivHex: string, password: string, context: string = AAD_CONTEXT): Promise<string> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const ciphertext = hexToBytes(ciphertextHex);
  const salt = hexToBytes(saltHex);
  const iv = hexToBytes(ivHex);
  const aadBytes = encoder.encode(context);
  
  // 1. Derive AES-GCM 256-bit key using Argon2id
  const keyBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });
  
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  
  wipe(keyBytes);
  
  // 2. Decrypt ciphertext
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes },
    aesKey,
    ciphertext
  );
  
  const decryptedArray = new Uint8Array(decryptedBuffer);
  const result = decoder.decode(decryptedArray);
  
  wipe(decryptedArray);
  
  return result;
}
