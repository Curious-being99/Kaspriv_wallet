import { Mnemonic, XPrv, payToScriptHashScript, addressFromScriptPublicKey } from '@kasdk/web';
import { ensureKaspaWasm } from '../crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import { wipe } from './common';
import { encodeKaspaAddress, VERSION_P2SH } from './address';

/**
 * Extract and clean BIP39 words from any formatted user input (numbered lists, capitalization, commas, etc.)
 */
export function cleanMnemonic(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * Sanitize and enforce clean, safe wallet names
 */
export function sanitizeWalletName(name: string, defaultFallback = 'Kaspa Wallet'): string {
  if (!name || typeof name !== 'string') return defaultFallback;
  let cleaned = name.trim().replace(/[\r\n\t]/g, ' ');

  // If the name contains multiple words that look like seed phrase concatenation or is over 25 chars
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 4 || cleaned.length > 25) {
    const knownPrefixes = ['Primary Wallet', 'Restored Wallet', 'Kaspa Wallet', 'New Kaspa Wallet', 'Imported Wallet', 'Watch-Only Wallet', 'Address Tracker'];
    for (const prefix of knownPrefixes) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        return prefix;
      }
    }
    if (words.length >= 1 && words[0].length <= 16) {
      if (words.length >= 2 && words[1].length <= 16 && (words[0] + ' ' + words[1]).length <= 20) {
        return `${words[0]} ${words[1]}`;
      }
      return words[0];
    }
    return defaultFallback;
  }

  return cleaned || defaultFallback;
}

/**
 * Generate a 24-word Kaspa BIP39 mnemonic seed using WASM
 */
export async function generate24WordMnemonic(): Promise<string[]> {
  await ensureKaspaWasm();
  try {
    const m = Mnemonic.random(24);
    const phrase = m.phrase || m.toString();
    if (!phrase) {
      throw new Error('Mnemonic generated but phrase is empty');
    }
    const words = phrase.trim().split(/\s+/);
    m.free();
    return words;
  } catch (err: any) {
    console.error('Mnemonic.random failed:', err);
    throw err;
  }
}

/**
 * Derive a Kaspa address from a 33-byte compressed public key or 32-byte Schnorr pubkey.
 * Utilizes exclusively the official Rusty Kaspa SDK (payToScriptHashScript + addressFromScriptPublicKey).
 */
export async function getAddressFromPublicKey(
  publicKey: Uint8Array | string, 
  addressType: 'P2SH' = 'P2SH',
  prefix: string = 'kaspa'
): Promise<string> {
  await ensureKaspaWasm();
  let pubKey: Uint8Array;
  if (typeof publicKey === 'string') {
    const clean = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
      throw new Error('Invalid public key hex string');
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byteVal = Number.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
      if (Number.isNaN(byteVal)) {
        throw new Error('Failed to parse public key hex byte');
      }
      bytes[i] = byteVal;
    }
    pubKey = bytes;
  } else {
    pubKey = publicKey;
  }

  const xOnlyPubKey = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
  const xOnlyHex = Array.from(xOnlyPubKey).map(b => b.toString(16).padStart(2, '0')).join('');
  const redeemScriptHex = '20' + xOnlyHex + 'ac';

  // Map prefix to standard Kaspa SDK network type parameter
  const cleanPrefix = prefix.replace(':', '').toLowerCase();
  let networkTypeStr = 'mainnet';
  if (cleanPrefix.includes('test')) {
    networkTypeStr = 'testnet-10';
  } else if (cleanPrefix.includes('dev')) {
    networkTypeStr = 'devnet';
  } else if (cleanPrefix.includes('sim')) {
    networkTypeStr = 'simnet';
  }

  // Rely on official Rusty Kaspa WASM SDK
  try {
    const spk = payToScriptHashScript(redeemScriptHex);
    const addr = addressFromScriptPublicKey(spk, networkTypeStr);
    if (addr) {
      return addr.toString();
    }
    throw new Error('Failed to derive address from SDK');
  } catch (err: any) {
    throw new Error(`Official Kaspa SDK failed or is not initialized: ${err.message || err}`);
  }
}

// Volatile, in-memory cache for seed derivation (BIP39 Seed Cache)
let lastMnemonic = '';
let lastPassphrase = '';
let lastSeedHex = '';

export async function getCachedSeed(mnemonic: string, passphrase = ''): Promise<Uint8Array> {
  const cleanMnemonicStr = mnemonic.trim();
  const cleanPassphraseStr = passphrase;

  if (lastSeedHex && lastMnemonic === cleanMnemonicStr && lastPassphrase === cleanPassphraseStr) {
    return hexToBytes(lastSeedHex);
  }

  await ensureKaspaWasm();

  // Perform high-performance WASM derivation (PBKDF2-HMAC-SHA512 2,048 rounds in Rust)
  const m = new Mnemonic(cleanMnemonicStr);
  const newSeedHex = m.toSeed(cleanPassphraseStr);
  m.free();

  lastMnemonic = cleanMnemonicStr;
  lastPassphrase = cleanPassphraseStr;
  lastSeedHex = newSeedHex;

  return hexToBytes(newSeedHex);
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate a real deterministic Kaspa Address based on mnemonic words
 * Supports P2SH, with custom index, change chain, and coinType (111111)
 */
export async function generateDeterministicAddress(
  mnemonic: string, 
  passphrase?: string, 
  prefix: string = 'kaspa',
  addressType: 'P2SH' = 'P2SH',
  index: number = 0,
  isChange: boolean = false,
  coinType: number = 111111
): Promise<string> {
  const seedArray = await getCachedSeed(mnemonic, passphrase || '');
  const seedHex = Array.from(seedArray).map(b => b.toString(16).padStart(2, '0')).join('');
  
  try {
    const xprv = new XPrv(seedHex);
    const changeVal = isChange ? 1 : 0;
    const path = `m/44'/${coinType}'/0'/${changeVal}/${index}`;
    const child = xprv.derivePath(path);
    const pk = child.toPrivateKey();
    const pubKey = pk.toPublicKey();
    const pubKeyBytes = hexToBytes(pubKey.toString());

    const addr = await getAddressFromPublicKey(pubKeyBytes, addressType, prefix);
    
    pk.free();
    pubKey.free();
    child.free();
    xprv.free();
    
    return addr;
  } finally {
    wipe(seedArray);
  }
}

/**
 * Helper to get P2SH address specifically
 */
export async function generateP2SHAddress(mnemonic: string, passphrase?: string, prefix: string = 'kaspa'): Promise<string> {
  return generateDeterministicAddress(mnemonic, passphrase, prefix, 'P2SH');
}

/**
 * Derive multiple private keys as raw bytes from a pre-computed master seed in a single pass.
 */
export async function getPrivateKeysMapFromSeed(
  seed: Uint8Array,
  derivationPaths: string[]
): Promise<{ [path: string]: Uint8Array }> {
  await ensureKaspaWasm();
  const seedHex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
  const xprv = new XPrv(seedHex);
  const keysMap: { [path: string]: Uint8Array } = {};

  for (const path of derivationPaths) {
    try {
      const child = xprv.derivePath(path);
      const pk = child.toPrivateKey();
      keysMap[path] = hexToBytes(pk.toString());
      pk.free();
      child.free();
    } catch (e) {
      console.warn(`Failed to derive key at path ${path}:`, e);
    }
  }
  xprv.free();
  return keysMap;
}

/**
 * Derive the private key as raw bytes from a pre-computed master seed.
 * 
 * The caller owns the returned buffer and MUST wipe it
 * after the signing operation.
 */
export async function getPrivateKeyBytesFromSeed(
  seed: Uint8Array,
  derivationPath = "m/44'/111111'/0'/0/0"
): Promise<Uint8Array> {
  await ensureKaspaWasm();
  const seedHex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
  const xprv = new XPrv(seedHex);
  const child = xprv.derivePath(derivationPath);
  const pk = child.toPrivateKey();
  const pkBytes = hexToBytes(pk.toString());

  pk.free();
  child.free();
  xprv.free();

  return pkBytes;
}

/**
 * Derive the private key as raw bytes.
 *
 * The caller owns the returned buffer and MUST wipe it
 * after the signing operation.
 */
export async function getPrivateKeyBytesFromMnemonic(
  mnemonic: string,
  passphrase = '',
  derivationPath = "m/44'/111111'/0'/0/0"
): Promise<Uint8Array> {
  const seed = await getCachedSeed(
    mnemonic,
    passphrase
  );

  try {
    return await getPrivateKeyBytesFromSeed(seed, derivationPath);
  } finally {
    // Remove the application-managed seed buffer.
    wipe(seed);
  }
}
