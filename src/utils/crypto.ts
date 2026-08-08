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
export async function encryptWithPassword(plaintext: string, password: string): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  
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
    { name: 'AES-GCM', iv },
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
 * Encrypts a list of strings (pieces) using a key derived from a password.
 * Derives the key once and uses it for all pieces with unique IVs.
 */
export async function encryptPieces(pieces: string[], password: string): Promise<{ ciphertext: string; salt: string; iv: string; order: number }[]> {
  const encoder = new TextEncoder();
  
  // 1. Generate one salt for the entire set to derive one master key
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
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

  // 3. Prepare pieces with order index and shuffle
  const piecesWithOrder = pieces.map((data, order) => ({ data, order }));
  
  // Cryptographically secure shuffle
  for (let i = piecesWithOrder.length - 1; i > 0; i--) {
    const j = window.crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [piecesWithOrder[i], piecesWithOrder[j]] = [piecesWithOrder[j], piecesWithOrder[i]];
  }

  // 4. Encrypt each piece
  return Promise.all(piecesWithOrder.map(async (piece) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = encoder.encode(piece.data);
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintextBytes
    );

    return {
      ciphertext: bytesToHex(new Uint8Array(encryptedBuffer)),
      salt: bytesToHex(salt),
      iv: bytesToHex(iv),
      order: piece.order
    };
  }));
}

/**
 * Decrypts a list of encrypted pieces and joins them.
 */
export async function decryptPieces(pieces: { ciphertext: string; salt: string; iv: string; order?: number }[], password: string): Promise<string[]> {
  if (pieces.length === 0) return [];
  
  const decoder = new TextDecoder();
  
  // 1. All pieces share the same salt (derived from the first one)
  const salt = hexToBytes(pieces[0].salt);
  
  // 2. Derive the master key once
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

  // 3. Sort pieces by order (default to index if order missing)
  const sortedPieces = [...pieces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // 4. Decrypt each piece
  return Promise.all(sortedPieces.map(async (p) => {
    const ciphertext = hexToBytes(p.ciphertext);
    const iv = hexToBytes(p.iv);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );
    
    const decryptedArray = new Uint8Array(decryptedBuffer);
    const result = decoder.decode(decryptedArray);
    
    // Wipe decrypted data
    wipe(decryptedArray);
    
    return result;
  }));
}

/**
 * Decrypts a hex-encoded ciphertext string using a key derived from a password.
 * Throws an error if decryption fails (e.g. invalid password).
 */
export async function decryptWithPassword(ciphertextHex: string, saltHex: string, ivHex: string, password: string): Promise<string> {
  const decoder = new TextDecoder();
  const ciphertext = hexToBytes(ciphertextHex);
  const salt = hexToBytes(saltHex);
  const iv = hexToBytes(ivHex);
  
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
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );
  
  const decryptedArray = new Uint8Array(decryptedBuffer);
  const result = decoder.decode(decryptedArray);
  
  wipe(decryptedArray);
  
  return result;
}

/**
 * Splits a mnemonic string into encrypted fragments.
 */
export async function encryptMnemonicToFragments(mnemonic: string, password: string): Promise<{ ciphertext: string; salt: string; iv: string }[]> {
  const words = mnemonic.trim().split(/\s+/);
  // Split into 3 parts
  const partSize = Math.ceil(words.length / 3);
  const parts = [
    words.slice(0, partSize).join(' '),
    words.slice(partSize, partSize * 2).join(' '),
    words.slice(partSize * 2).join(' ')
  ].filter(p => p.length > 0);
  
  return encryptPieces(parts, password);
}

/**
 * Decrypts and joins mnemonic fragments.
 */
export async function decryptMnemonicFromFragments(fragments: { ciphertext: string; salt: string; iv: string }[], password: string): Promise<string> {
  const parts = await decryptPieces(fragments, password);
  return parts.join(' ');
}
