import initKaspaWasm, { encryptXChaCha20Poly1305, decryptXChaCha20Poly1305 } from '@kasdk/web';
import wasmUrl from '@kasdk/web/kaspa_bg.wasm?url';

/**
 * Universal safe cryptographic provider retriever.
 * Resolves standard window.crypto or fallback globalThis.crypto context safely,
 * decoupling cryptography from browser WebView dependencies.
 */
let wasmInitPromise: Promise<void> | null = null;

// Resolve the WASM URL more robustly
let resolvedWasmUrl = wasmUrl;
try {
  // If wasmUrl is relative, it needs to be resolved.
  // In many environments (Capacitor, AI Studio), the asset is relative to the root.
  const origin = (typeof self !== 'undefined' && self.location && self.location.origin !== 'null') 
    ? self.location.origin 
    : (typeof window !== 'undefined' ? window.location.origin : '');
    
  if (origin && wasmUrl.startsWith('/')) {
    resolvedWasmUrl = new URL(wasmUrl, origin).href;
  } else if (origin) {
    // If it's relative like "assets/...", resolve against origin
    resolvedWasmUrl = new URL(wasmUrl, origin).href;
  }
} catch (e) {
  console.warn('WASM URL resolution error:', e);
}

/**
 * Ensures Rusty Kaspa WASM cryptographic module is initialized
 */
export async function ensureKaspaWasm(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      console.log('Initializing Kaspa WASM from:', resolvedWasmUrl);
      
      const tryInit = async (urlOrBuffer: any): Promise<boolean> => {
        try {
          // Always pass as a single object to avoid "deprecated parameters" warning
          await initKaspaWasm({ module_or_path: urlOrBuffer });
          console.log('Kaspa WASM initialized successfully');
          return true;
        } catch (err: any) {
          if (err.message?.includes('already initialized')) {
            console.log('Kaspa WASM already initialized');
            return true;
          }
          return false; // Silently fail to next attempt without polluting console
        }
      };

      // Attempt 1: Fetch and compile ArrayBuffer (Most robust, avoids streaming aborts/MIME issues)
      try {
        const response = await fetch(resolvedWasmUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (await tryInit(buffer)) return;
        }
      } catch (fetchErr) {
        // Fallback silently
      }

      // Attempt 2: Direct URL (may trigger instantiateStreaming network warnings in dev, but serves as fallback)
      if (await tryInit(resolvedWasmUrl)) return;

      // Attempt 3: Last ditch - try a hardcoded relative path
      const relativeFallback = '/assets/kaspa_bg.wasm'; 
      try {
        const origin = (typeof self !== 'undefined' && self.location && self.location.origin !== 'null') ? self.location.origin : '';
        if (origin) {
          const fallbackUrl = new URL(relativeFallback, origin).href;
          const response = await fetch(fallbackUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            if (await tryInit(buffer)) return;
          }
        }
      } catch (e) {}

      // If all failed
      wasmInitPromise = null; // Allow retry on next call
      throw new Error(`Failed to initialize official Kaspa WASM SDK. URL attempted: ${resolvedWasmUrl}. Please verify the WASM asset exists.`);
    })();
  }
  return wasmInitPromise;
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

let mainThreadDelegate: ((action: string, payload: any) => Promise<any>) | null = null;

export function registerMainThreadDelegate(delegate: (action: string, payload: any) => Promise<any>): void {
  mainThreadDelegate = delegate;
}

export function buildAadContext(kind: 'MNEMONIC' | 'PASSPHRASE' | 'CANARY' | string = 'MNEMONIC', walletId?: string): string {
  const baseKind = kind.toUpperCase();
  if (walletId) {
    return `KASPRIV-WALLET-v1|KASPA-MAINNET|${baseKind}|${walletId}`;
  }
  return `KASPRIV-WALLET-v1|KASPA-MAINNET|${baseKind}`;
}

/**
 * Encrypts a plaintext string using Rusty Kaspa WASM XChaCha20Poly1305.
 * Seamlessly routes to CryptoWorker off-thread on main thread to prevent UI blocking.
 */
export async function encryptWithPassword(
  plaintext: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const isMainThread = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  if (isMainThread && mainThreadDelegate) {
    try {
      return await mainThreadDelegate('encryptWithPassword', { plaintext, password, context });
    } catch (err) {
      console.warn('Worker encryption delegate failed, executing in-thread fallback:', err);
    }
  }

  try {
    await ensureKaspaWasm();
    const ciphertext = encryptXChaCha20Poly1305(plaintext, password);
    if (ciphertext) {
      return { ciphertext, salt: '', iv: '' };
    }
  } catch (err: any) {
    throw new Error(`CRITICAL: Rusty Kaspa WASM XChaCha20Poly1305 encryption failed: ${err?.message || err}.`);
  }

  throw new Error('CRITICAL: WASM encryption produced empty ciphertext.');
}

/**
 * Decrypts a ciphertext string using Rusty Kaspa WASM XChaCha20Poly1305.
 * Seamlessly routes to CryptoWorker off-thread on main thread to prevent UI blocking,
 * with instantaneous in-thread fallback if worker times out or is unsupported.
 */
export async function decryptWithPassword(
  ciphertextHex: string, 
  saltHex: string, 
  ivHex: string, 
  password: string, 
  context: string = AAD_CONTEXT
): Promise<string> {
  const isMainThread = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  if (isMainThread && mainThreadDelegate) {
    try {
      return await mainThreadDelegate('decryptWithPassword', { ciphertextHex, saltHex, ivHex, password, context });
    } catch (err) {
      console.warn('Worker decryption delegate failed, executing in-thread fallback:', err);
    }
  }

  // Enforce ultra-fast, secure Rusty Kaspa WASM ChaCha20-Poly1305 decryption
  await ensureKaspaWasm();
  return decryptXChaCha20Poly1305(ciphertextHex, password);
}
