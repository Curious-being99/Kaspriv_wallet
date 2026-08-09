import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { concatBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';

/**
 * Best-effort zeroization of application-managed byte buffers.
 */
export function wipe(
  buffer: Uint8Array | null | undefined
): void {
  if (buffer) {
    buffer.fill(0);
  }
}

// Polyfill global TextDecoder/TextEncoder for WASM environment
if (typeof globalThis !== 'undefined') {
  if (!globalThis.TextDecoder && typeof window !== 'undefined') {
    globalThis.TextDecoder = window.TextDecoder;
  }
  if (!globalThis.TextEncoder && typeof window !== 'undefined') {
    globalThis.TextEncoder = window.TextEncoder;
  }
}

// Configure @noble/secp256k1 hashes for Schnorr and ECDSA operations
try {
  if (secp && secp.hashes) {
    secp.hashes.sha256 = (msg: Uint8Array) => sha256(msg);
    secp.hashes.hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]) => hmac(sha256, key, concatBytes(...msgs));
  }
} catch (e) {
  console.warn('Failed to configure secp256k1 hashes:', e);
}

export let kaspaWasmModule: any = null;

export const SOMPI_PER_KAS = 100_000_000n;

let isKaspaInit = false;

export async function ensureKaspaRuntime() {
  if (isKaspaInit) return;
  try {
    if (!kaspaWasmModule) {
      try {
        kaspaWasmModule = await import('kaspa-wasm');
      } catch (e) {
        console.warn('kaspa-wasm notice:', e);
      }
    }
    if (kaspaWasmModule && typeof kaspaWasmModule.initConsolePanicHook === 'function') {
      try {
        kaspaWasmModule.initConsolePanicHook();
      } catch (e) {}
    }
    isKaspaInit = true;
  } catch (err) {
    isKaspaInit = true;
  }
}
