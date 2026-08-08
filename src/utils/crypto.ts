import { argon2id } from 'hash-wasm';

/**
 * Securely overwrites a Uint8Array with zeros.
 */
export function wipe(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Best-effort clearing of an array containing
 * sensitive string values such as mnemonic words.
 */
export function wipeStringArray(values: string[] | null | undefined): void {
  if (values) {
    values.fill('');
  }
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

// Argon2id Parameters (Strong security parameters for memory-hard key derivation)
export const ARGON2_CONFIG = {
  version: 1,
  iterations: 6,      // Adjusted to 6 passes as per user request
  memorySize: 131072, // 128 MiB (131,072 KiB)
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
 * Encrypts a plaintext string using a two-tier key hierarchy (DEK wrapped by KEK).
 */
export async function encryptWithPassword(plaintext: string, password: string, context: string = AAD_CONTEXT): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const aadBytes = encoder.encode(context);

  // 1. Generate random salt (16 bytes) and KEK IV (12-bytes)
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const kekIv = window.crypto.getRandomValues(new Uint8Array(12));

  // 2. Derive KEK (Key Encryption Key) using Argon2id
  const kekBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });

  const kek = await window.crypto.subtle.importKey(
    'raw',
    kekBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  wipe(kekBytes);

  // 3. Generate random DEK (Data Encryption Key, 32 bytes)
  const dekBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const dek = await window.crypto.subtle.importKey(
    'raw',
    dekBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  // 4. Encrypt plaintext with DEK
  const dekIv = window.crypto.getRandomValues(new Uint8Array(12));
  const payloadEncrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: dekIv, additionalData: aadBytes },
    dek,
    plaintextBytes
  );
  wipe(plaintextBytes);

  // 5. Encrypt DEK with KEK
  const dekEncrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: kekIv, additionalData: aadBytes },
    kek,
    dekBytes
  );
  wipe(dekBytes);

  // Format: v2:dekIvHex:dekEncryptedHex:payloadEncryptedHex
  const combinedCiphertext = `v2:${bytesToHex(dekIv)}:${bytesToHex(new Uint8Array(dekEncrypted))}:${bytesToHex(new Uint8Array(payloadEncrypted))}`;

  return {
    ciphertext: combinedCiphertext,
    salt: bytesToHex(salt),
    iv: bytesToHex(kekIv)
  };
}

/**
 * Decrypts a hex-encoded ciphertext string using a key derived from a password.
 * Throws an error if decryption fails (e.g. invalid password or wrong AAD context).
 */
export async function decryptWithPassword(ciphertextHex: string, saltHex: string, ivHex: string, password: string, context: string = AAD_CONTEXT): Promise<string> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const kekIv = hexToBytes(ivHex);
  const aadBytes = encoder.encode(context);

  // 1. Derive KEK
  const kekBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });

  const kek = await window.crypto.subtle.importKey(
    'raw',
    kekBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  wipe(kekBytes);

  try {
    if (ciphertextHex.startsWith('v2:')) {
      const parts = ciphertextHex.split(':');
      if (parts.length !== 4) throw new Error("Malformed ciphertext");
      const dekIv = hexToBytes(parts[1]);
      const dekEncrypted = hexToBytes(parts[2]);
      const payloadEncrypted = hexToBytes(parts[3]);

      // Unwrap DEK
      const dekBytesBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: kekIv, additionalData: aadBytes },
        kek,
        dekEncrypted
      );
      const dekBytes = new Uint8Array(dekBytesBuffer);
      const dek = await window.crypto.subtle.importKey(
        'raw',
        dekBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      wipe(dekBytes);

      // Decrypt payload
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: dekIv, additionalData: aadBytes },
        dek,
        payloadEncrypted
      );
      
      const decryptedArray = new Uint8Array(decryptedBuffer);
      const result = decoder.decode(decryptedArray);
      wipe(decryptedArray);
      return result;

    } else {
      // Legacy format (v1)
      const ciphertext = hexToBytes(ciphertextHex);
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: kekIv, additionalData: aadBytes },
        kek,
        ciphertext
      );
      const decryptedArray = new Uint8Array(decryptedBuffer);
      const result = decoder.decode(decryptedArray);
      wipe(decryptedArray);
      return result;
    }
  } catch (err) {
    // Fail closed: Do not attempt recovery, throw error immediately
    throw new Error(`Decryption failed. Invalid password, tampered data, or wrong context.`);
  }
}
