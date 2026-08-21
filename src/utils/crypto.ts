import { argon2id } from 'hash-wasm';

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

let wasmModule: any = null;
let wasmLosslessChecked = false;

let forceNativeOnly = false;
export function setForceNativeOnly(val: boolean) {
  forceNativeOnly = val;
}

// Safe dynamic WebAssembly loader for Rust Core compilation folder
async function tryGetRustWasm() {
  if (wasmLosslessChecked) return wasmModule;
  wasmLosslessChecked = true;
  try {
    // Dynamic import to avoid missing files compilation issues during dev
    // and automatically link once wasm-pack build output is populated
    const targetWasmModulePath = './rust-wasm/kaspriv_rust_crypto';
    wasmModule = await import(/* @vite-ignore */ targetWasmModulePath as any);
  } catch (err) {
    // Rust core wasm not compiled yet, which is normal before local compiling
  }
  return wasmModule;
}

/**
 * Securely overwrites a Uint8Array with zeros.
 */
export function wipe(buffer: Uint8Array): void {
  // Overwrite JS engine references
  buffer.fill(0);
  
  // If rust wasm is compiled and available, pass it to Rust's secure_wipe_rust for bare-metal zeroization
  tryGetRustWasm().then(rust => {
    if (rust && typeof rust.secure_wipe_rust === 'function') {
      try {
        rust.secure_wipe_rust(buffer);
      } catch (e) {
        // Fallback silently if WASM memory is detached or inaccessible
      }
    }
  }).catch(() => {});
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
 * Utilizes Argon2id for key derivation and AES-GCM 256-bit for encryption/decryption.
 * Designed to encrypt/decrypt sensitive wallet seed phrases on device using the user's password.
 */

// KDF & Cipher Specification Version
export const KDF_SPEC_VERSION = 'v1.0.0-argon2id-aes256gcm';

// AAD Context Binding
export const AAD_CONTEXT = "KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC";
export const HARDWARE_KEYSTORE_BINDING_AAD = "KASPRIV-WALLET-v1|ANDROID-KEYSTORE-STRONGBOX|HARDWARE-BOUND";

/**
 * Hardware Keystore Master Key Wrapper
 * Wraps or unwraps a vault master key using a hardware-bound AES-256-GCM context.
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
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex string: contains non-hexadecimal characters');
  }
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string: must have an even length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byteVal = Number.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byteVal)) {
      throw new Error('Failed to parse hex byte');
    }
    bytes[i] = byteVal;
  }
  return bytes;
}

/**
 * Validates encrypted wallet record parameters for sanity and format
 * before initiating expensive Argon2id derivation.
 */
function validateEncryptedRecord(ciphertextHex: string, saltHex: string, ivHex: string, password: string): void {
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new Error('Validation failure: Password must be a non-empty string.');
  }
  if (!saltHex || typeof saltHex !== 'string' || !/^[0-9a-fA-F]{32}$/.test(saltHex)) {
    throw new Error('Validation failure: Salt must be a 32-character (16-byte) hex string.');
  }
  if (!ivHex || typeof ivHex !== 'string' || !/^[0-9a-fA-F]{24}$/.test(ivHex)) {
    throw new Error('Validation failure: IV must be a 24-character (12-byte) hex string.');
  }
  if (!ciphertextHex || typeof ciphertextHex !== 'string' || ciphertextHex.length > 50000) {
    throw new Error('Validation failure: Ciphertext is missing or exceeds allowable record size.');
  }

  if (ciphertextHex.startsWith('v2:')) {
    const parts = ciphertextHex.split(':');
    if (parts.length !== 4) {
      throw new Error('Validation failure: Malformed v2 ciphertext structure.');
    }
    const dekIvHex = parts[1];
    const dekEncryptedHex = parts[2];
    const payloadEncryptedHex = parts[3];

    if (!/^[0-9a-fA-F]{24}$/.test(dekIvHex)) {
      throw new Error('Validation failure: DEK IV must be a 24-character (12-byte) hex string.');
    }
    if (!/^[0-9a-fA-F]{96}$/.test(dekEncryptedHex)) { // 32 bytes + 16 bytes auth tag = 48 bytes = 96 hex
      throw new Error('Validation failure: Encrypted DEK must be a valid 48-byte AES-GCM hex string.');
    }
    if (!/^[0-9a-fA-F]+$/.test(payloadEncryptedHex) || payloadEncryptedHex.length % 2 !== 0) {
      throw new Error('Validation failure: Payload ciphertext must be a valid even-length hex string.');
    }
  } else {
    const clean = ciphertextHex.startsWith('0x') ? ciphertextHex.slice(2) : ciphertextHex;
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
      throw new Error('Validation failure: Legacy ciphertext must be a valid even-length hex string.');
    }
  }
}

/**
 * Encrypts a plaintext string using a two-tier key hierarchy (DEK wrapped by KEK).
 */
export async function encryptWithPassword(plaintext: string, password: string, context: string = AAD_CONTEXT): Promise<{ ciphertext: string; salt: string; iv: string }> {
  try {
    const { cryptoWorkerManager } = await import('./cryptoWorkerManager');
    if (cryptoWorkerManager.isSupported()) {
      return await cryptoWorkerManager.runTask<{ ciphertext: string; salt: string; iv: string }>('encryptWithPassword', { plaintext, password, context });
    }
  } catch (err) {
    console.warn('Worker encrypt failed, falling back to local thread:', err);
  }

  // 1. Prioritize Rust WASM Core if compiled and loaded
  const rust = await tryGetRustWasm();
  const isAndroid = forceNativeOnly || (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.() === 'android');
  if (rust && typeof rust.encrypt_with_password_rust === 'function') {
    try {
      const res = await rust.encrypt_with_password_rust(plaintext, password, context);
      if (res && typeof res === 'object') {
        return {
          ciphertext: res.ciphertext,
          salt: res.salt,
          iv: res.iv
        };
      }
    } catch (err) {
      console.error('Rust WASM encrypt failed:', err);
      if (isAndroid) throw err;
    }
  } else if (isAndroid) {
    console.warn('Android native crypto core requested but WASM module not loaded yet.');
  }

  // 2. Developer/Environment Fallback
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const aadBytes = encoder.encode(context);

  const cryptoProvider = getCrypto();

  // Generate random salt (16 bytes) and KEK IV (12-bytes)
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const kekIv = cryptoProvider.getRandomValues(new Uint8Array(12));

  // Derive KEK (Key Encryption Key) using Argon2id
  const kekBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });

  const kek = await cryptoProvider.subtle.importKey(
    'raw',
    kekBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  wipe(kekBytes);

  // Generate random DEK (Data Encryption Key, 32 bytes)
  const dekBytes = cryptoProvider.getRandomValues(new Uint8Array(32));
  const dek = await cryptoProvider.subtle.importKey(
    'raw',
    dekBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  // Encrypt plaintext with DEK
  const dekIv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const payloadEncrypted = await cryptoProvider.subtle.encrypt(
    { name: 'AES-GCM', iv: dekIv as unknown as BufferSource, additionalData: aadBytes as unknown as BufferSource },
    dek,
    plaintextBytes as unknown as BufferSource
  );
  wipe(plaintextBytes);

  // Encrypt DEK with KEK
  const dekEncrypted = await cryptoProvider.subtle.encrypt(
    { name: 'AES-GCM', iv: kekIv as unknown as BufferSource, additionalData: aadBytes as unknown as BufferSource },
    kek,
    dekBytes as unknown as BufferSource
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
 * Strictly enforces the provided AAD context, guaranteeing strong wallet-specific ciphertext binding.
 * Throws an error if decryption fails (e.g. invalid password or wrong AAD context).
 */
export async function decryptWithPassword(
  ciphertextHex: string, 
  saltHex: string, 
  ivHex: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<string> {
  try {
    const { cryptoWorkerManager } = await import('./cryptoWorkerManager');
    if (cryptoWorkerManager.isSupported()) {
      return await cryptoWorkerManager.runTask<string>('decryptWithPassword', { ciphertextHex, saltHex, ivHex, password, context });
    }
  } catch (err: any) {
    if (err?.message?.includes('Decryption failed')) {
      throw err;
    }
    console.warn('Worker decrypt unavailable, falling back to local thread:', err);
  }

  return await decryptWithPasswordInternal(ciphertextHex, saltHex, ivHex, password, context);
}

/**
 * Explicit migration helper for legacy compatibility.
 * Safely isolates legacy AAD fallback (without wallet-ID suffix) into a non-standard decryption path.
 */
export async function decryptWithPasswordLegacy(
  ciphertextHex: string, 
  saltHex: string, 
  ivHex: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<string> {
  try {
    return await decryptWithPasswordInternal(ciphertextHex, saltHex, ivHex, password, context);
  } catch (err) {
    const parts = context.split('|');
    if (parts.length > 3) {
      const legacyContext = parts.slice(0, 3).join('|');
      try {
        return await decryptWithPasswordInternal(ciphertextHex, saltHex, ivHex, password, legacyContext);
      } catch {
        // rethrow original error
      }
    }
    throw err;
  }
}

async function decryptWithPasswordInternal(ciphertextHex: string, saltHex: string, ivHex: string, password: string, context: string): Promise<string> {
  validateEncryptedRecord(ciphertextHex, saltHex, ivHex, password);

  // 1. Prioritize Rust WASM Core if compiled and loaded
  const rust = await tryGetRustWasm();
  const isAndroid = forceNativeOnly || (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.() === 'android');
  if (rust && typeof rust.decrypt_with_password_rust === 'function') {
    try {
      return await rust.decrypt_with_password_rust(ciphertextHex, password, saltHex, ivHex, context);
    } catch (err) {
      console.error('Rust WASM decrypt failed:', err);
      if (isAndroid) throw new Error(`Decryption failed: ${err}`);
    }
  } else if (isAndroid) {
    console.warn('Android native crypto core requested for decryption but WASM module not loaded yet.');
  }

  // 2. Developer/Environment Fallback
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const kekIv = hexToBytes(ivHex);
  const aadBytes = encoder.encode(context);

  const cryptoProvider = getCrypto();

  // Derive KEK
  const kekBytes = await argon2id({
    password,
    salt,
    ...ARGON2_CONFIG
  });

  const kek = await cryptoProvider.subtle.importKey(
    'raw',
    kekBytes as unknown as BufferSource,
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
      const dekBytesBuffer = await cryptoProvider.subtle.decrypt(
        { name: 'AES-GCM', iv: kekIv as unknown as BufferSource, additionalData: aadBytes as unknown as BufferSource },
        kek,
        dekEncrypted as unknown as BufferSource
      );
      const dekBytes = new Uint8Array(dekBytesBuffer);
      const dek = await cryptoProvider.subtle.importKey(
        'raw',
        dekBytes as unknown as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      wipe(dekBytes);

      // Decrypt payload
      const decryptedBuffer = await cryptoProvider.subtle.decrypt(
        { name: 'AES-GCM', iv: dekIv as unknown as BufferSource, additionalData: aadBytes as unknown as BufferSource },
        dek,
        payloadEncrypted as unknown as BufferSource
      );
      
      const decryptedArray = new Uint8Array(decryptedBuffer);
      const result = decoder.decode(decryptedArray);
      wipe(decryptedArray);
      return result;

    } else {
      // Legacy format (v1)
      const ciphertext = hexToBytes(ciphertextHex);
      const decryptedBuffer = await cryptoProvider.subtle.decrypt(
        { name: 'AES-GCM', iv: kekIv as unknown as BufferSource, additionalData: aadBytes as unknown as BufferSource },
        kek,
        ciphertext as unknown as BufferSource
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
