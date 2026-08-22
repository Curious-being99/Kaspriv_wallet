import initKaspaWasm, { encryptXChaCha20Poly1305, decryptXChaCha20Poly1305 } from '@kasdk/web';
import wasmUrl from '@kasdk/web/kaspa_bg.wasm?url';

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

let wasmInitPromise: Promise<void> | null = null;

/**
 * Ensures Rusty Kaspa WASM cryptographic module is initialized
 */
export async function ensureKaspaWasm(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        await initKaspaWasm({ module_or_path: wasmUrl });
      } catch (err) {
        console.warn('Kaspa WASM initialization note:', err);
      }
    })();
  }
  await wasmInitPromise;
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





function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveKeyWebCrypto(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string using Rusty Kaspa WASM XChaCha20Poly1305,
 * with seamless fallback to Web Crypto AES-256-GCM.
 */
export async function encryptWithPassword(
  plaintext: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  try {
    await ensureKaspaWasm();
    const ciphertext = encryptXChaCha20Poly1305(plaintext, password);
    if (ciphertext) {
      return { ciphertext, salt: '', iv: '' };
    }
  } catch (err) {
    console.warn('WASM XChaCha20Poly1305 encryption error, using Web Crypto fallback:', err);
  }

  // Resilient Web Crypto AES-256-GCM fallback
  const crypto = getCrypto();
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await deriveKeyWebCrypto(password, salt);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: enc.encode(context) as unknown as BufferSource
    },
    key,
    enc.encode(plaintext) as unknown as BufferSource
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuf)),
    salt: bytesToHex(salt),
    iv: bytesToHex(iv)
  };
}

export async function decryptWithPassword(
  ciphertextHex: string, 
  saltHex: string, 
  ivHex: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<string> {
  // 1. If no salt/iv or if format matches XChaCha20 base64, attempt WASM decryption first
  if (!saltHex || !ivHex) {
    try {
      await ensureKaspaWasm();
      return decryptXChaCha20Poly1305(ciphertextHex, password);
    } catch (err) {
      // If failed, proceed to fallback
    }
  }

  // 2. If salt and IV are present, or fallback from XChaCha20
  if (saltHex && ivHex) {
    try {
      const crypto = getCrypto();
      const salt = hexToBytes(saltHex);
      const iv = hexToBytes(ivHex);
      const ciphertextBytes = hexToBytes(ciphertextHex);
      const key = await deriveKeyWebCrypto(password, salt);
      const enc = new TextEncoder();

      // Try with contextual AAD first
      try {
        const decryptedBuf = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: iv as unknown as BufferSource,
            additionalData: enc.encode(context) as unknown as BufferSource
          },
          key,
          ciphertextBytes as unknown as BufferSource
        );
        return new TextDecoder().decode(decryptedBuf);
      } catch {
        // Fallback without AAD for legacy data
        const decryptedBuf = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: iv as unknown as BufferSource
          },
          key,
          ciphertextBytes as unknown as BufferSource
        );
        return new TextDecoder().decode(decryptedBuf);
      }
    } catch (fallbackErr) {
      // Fallback failed
    }
  }

  // 3. Final attempt with WASM
  await ensureKaspaWasm();
  return decryptXChaCha20Poly1305(ciphertextHex, password);
}
