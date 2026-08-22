import { argon2id } from 'hash-wasm';

/**
 * High-performance cryptographic engine module for kaspriv-rust-crypto (WASM bridge / native wrapper)
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function secure_wipe_rust(buffer: Uint8Array): void {
  if (buffer && buffer instanceof Uint8Array) {
    buffer.fill(0);
  }
}

export async function derive_key_argon2id(password: string, saltHex: string, mCost: number, tCost: number, pCost: number): Promise<string> {
  const salt = hexToBytes(saltHex);
  const hash = await argon2id({
    password,
    salt,
    parallelism: pCost,
    iterations: tCost,
    memorySize: mCost,
    hashLength: 32,
    outputType: 'binary'
  });
  return bytesToHex(hash);
}

export async function encrypt_with_password_rust(plaintext: string, password: string, context: string): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  
  // 1. Derive KEK via Argon2id (128 MiB, 6 iterations, 1 parallelism)
  const kekHex = await derive_key_argon2id(password, saltHex, 131072, 6, 1);
  const kekBytes = hexToBytes(kekHex);

  // 2. Derive Context Key using HMAC-SHA256 (or HKDF concept)
  const enc = new TextEncoder();
  const contextBytes = enc.encode(context);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    kekBytes as any,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const derivedKeyBytes = new Uint8Array(await crypto.subtle.sign('HMAC', baseKey, contextBytes as any));
  const aesKeyBytes = derivedKeyBytes.slice(0, 32);

  // 3. Encrypt Plaintext with AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes as any,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    cryptoKey,
    enc.encode(plaintext) as any
  );

  // Securely wipe intermediate sensitive keys
  secure_wipe_rust(kekBytes);
  secure_wipe_rust(derivedKeyBytes);
  secure_wipe_rust(aesKeyBytes);

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    salt: saltHex,
    iv: bytesToHex(iv)
  };
}

export async function decrypt_with_password_rust(ciphertextHex: string, password: string, saltHex: string, ivHex: string, context: string): Promise<string> {
  const salt = hexToBytes(saltHex);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);

  // 1. Derive KEK via Argon2id
  const kekHex = await derive_key_argon2id(password, saltHex, 131072, 6, 1);
  const kekBytes = hexToBytes(kekHex);

  // 2. Derive Context Key
  const enc = new TextEncoder();
  const contextBytes = enc.encode(context);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    kekBytes as any,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const derivedKeyBytes = new Uint8Array(await crypto.subtle.sign('HMAC', baseKey, contextBytes as any));
  const aesKeyBytes = derivedKeyBytes.slice(0, 32);

  // 3. Decrypt with AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes as any,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    cryptoKey,
    ciphertext as any
  );

  // Securely wipe intermediate sensitive keys
  secure_wipe_rust(kekBytes);
  secure_wipe_rust(derivedKeyBytes);
  secure_wipe_rust(aesKeyBytes);

  return new TextDecoder().decode(decryptedBuffer);
}
