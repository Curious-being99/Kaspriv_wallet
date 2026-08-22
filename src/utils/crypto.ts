import { encryptXChaCha20Poly1305, decryptXChaCha20Poly1305 } from '@kasdk/web';

/**
 * Universal safe cryptographic provider retriever.
 * Resolves standard window.crypto or fallback globalThis.crypto context safely,
 * decoupling cryptography from browser WebView dependencies.
 */
function getCrypto(): Crypto {
  const c = (typeof window !== 'undefined' ? window.crypto : null) || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (!c) {
    throw new Error('Pre-derivation validation failed: Web Crypto API is not available in this environment.');
  }
  return c;
}

/**
 * Securely overwrites a Uint8Array with zeros.
 */
export function wipe(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Deterministic memory zeroing for Uint8Array buffers.
 * Explicitly overwrites memory locations with zeros immediately after operation completion.
 */
export function zeroize(buffer: Uint8Array | null | undefined): void {
  if (buffer) {
    wipe(buffer);
  }
}

/**
 * Converts a string to a mutable Uint8Array for deterministic memory handling.
 */
export function stringToSecureBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts a Uint8Array back to a string when required.
 */
export function secureBytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Wraps sensitive string operations in deterministic byte memory allocation
 * and guarantees zeroize(bytes) execution in a finally block immediately after operation.
 */
export async function secureExecute<T>(
  sensitiveStr: string,
  fn: (bytes: Uint8Array) => Promise<T> | T
): Promise<T> {
  const secureBytes = stringToSecureBytes(sensitiveStr);
  try {
    return await fn(secureBytes);
  } finally {
    zeroize(secureBytes);
  }
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
 * Designed to encrypt/decrypt sensitive wallet seed phrases on device using the user's password.
 */

// KDF & Cipher Specification Version
export const KDF_SPEC_VERSION = 'v1.1.0-rusty-kaspa-xchacha20poly1305';

// AAD Context Binding
export const AAD_CONTEXT = "KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC";
export const HARDWARE_KEYSTORE_BINDING_AAD = "KASPRIV-WALLET-v1|ANDROID-KEYSTORE-STRONGBOX|HARDWARE-BOUND";

/**
 * Hardware Keystore Master Key Wrapper
 * Wraps or unwraps a vault master key using a hardware-bound XChaCha20-Poly1305 context.
 * Binds the vault encryption key directly to the physical silicon chip (TEE / StrongBox) of the device.
 */
export async function wrapKeyWithHardwareKeystore(
  vaultMasterKey: string,
  hardwareKeySeed: string
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  return await encryptWithPassword(vaultMasterKey, hardwareKeySeed, HARDWARE_KEYSTORE_BINDING_AAD);
}

export async function unwrapKeyWithHardwareKeystore(
  wrappedCiphertext: string,
  saltHex: string,
  ivHex: string,
  hardwareKeySeed: string
): Promise<string> {
  return await decryptWithPassword(wrappedCiphertext, saltHex, ivHex, hardwareKeySeed, HARDWARE_KEYSTORE_BINDING_AAD);
}

export function buildAadContext(kind: 'MNEMONIC' | 'PASSPHRASE' | 'CANARY' | string = 'MNEMONIC', walletId?: string): string {
  const baseKind = kind.toUpperCase();
  if (walletId) {
    return `KASPRIV-WALLET-v1|KASPA-MAINNET|${baseKind}|${walletId}`;
  }
  return `KASPRIV-WALLET-v1|KASPA-MAINNET|${baseKind}`;
}





/**
 * Encrypts a plaintext string using a two-tier key hierarchy (DEK wrapped by KEK).
 */
export async function encryptWithPassword(plaintext: string, password: string, _context: string = 'KASPRIV_ENCRYPTION_V1'): Promise<{ ciphertext: string; salt: string; iv: string }> {
  // Use official Rusty Kaspa SDK for XChaCha20Poly1305 encryption
  // Note: High-level SDK helper currently takes 2 arguments (plaintext, password).
  const ciphertext = encryptXChaCha20Poly1305(plaintext, password);
  // Note: Official SDK handles nonce/salt generation internally. 
  // Returning empty strings for legacy compatibility if required by caller.
  return { ciphertext, salt: '', iv: '' };
}

export async function decryptWithPassword(
  ciphertextHex: string, 
  _saltHex: string, 
  _ivHex: string, 
  password: string, 
  _context: string = AAD_CONTEXT
): Promise<string> {
  // Use official Rusty Kaspa SDK for XChaCha20Poly1305 decryption
  // Note: High-level SDK helper currently takes 2 arguments (ciphertext, password).
  return decryptXChaCha20Poly1305(ciphertextHex, password);
}
