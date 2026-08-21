import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { blake2b } from '@noble/hashes/blake2.js';
import { wipe } from './common';
import { encodeKaspaAddress, VERSION_P2PKH, VERSION_P2SH } from './address';

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
 * Generate a 24-word Kaspa BIP39 mnemonic seed
 */
export function generate24WordMnemonic(): string[] {
  const mnemonic = generateMnemonic(englishWordlist, 256);
  return mnemonic.split(' ');
}

/**
 * Derive a Kaspa address from a 33-byte compressed public key or 32-byte Schnorr pubkey using pure JS Bech32/checksum encoding
 */
export function getAddressFromPublicKey(
  publicKey: Uint8Array | string, 
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  prefix: string = 'kaspa'
): string {
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

  if (addressType === 'P2SH') {
    const redeemScript = new Uint8Array(34);
    redeemScript[0] = 0x20; // PUSH 32 bytes
    redeemScript.set(xOnlyPubKey, 1);
    redeemScript[33] = 0xac; // OP_CHECKSIG
    
    const scriptHash = blake2b(redeemScript, { dkLen: 32 });
    return encodeKaspaAddress(prefix, VERSION_P2SH, scriptHash);
  } else {
    return encodeKaspaAddress(prefix, VERSION_P2PKH, xOnlyPubKey);
  }
}

/**
 * Generate a real deterministic Kaspa Address based on mnemonic words
 * Supports P2PKH (default) and P2SH, with custom index, change chain, and coinType (111111 or 972)
 */
export async function generateDeterministicAddress(
  mnemonic: string, 
  passphrase?: string, 
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  index: number = 0,
  isChange: boolean = false,
  coinType: number = 111111
): Promise<string> {
  const seedArray = mnemonicToSeedSync(mnemonic, passphrase || '');
  try {
    const root = HDKey.fromMasterSeed(seedArray);
    const changeVal = isChange ? 1 : 0;
    const path = `m/44'/${coinType}'/0'/${changeVal}/${index}`;
    const child = root.derive(path);
    
    if (!child.publicKey) throw new Error('Failed to derive public key');

    return getAddressFromPublicKey(child.publicKey, addressType, prefix);
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
 * Derive the private key as raw bytes.
 *
 * The caller owns the returned buffer and MUST wipe it
 * after the signing operation.
 */
export function getPrivateKeyBytesFromMnemonic(
  mnemonic: string,
  passphrase = '',
  derivationPath = "m/44'/111111'/0'/0/0"
): Uint8Array {
  const seed = mnemonicToSeedSync(
    mnemonic,
    passphrase
  );

  try {
    const root = HDKey.fromMasterSeed(seed);
    const child = root.derive(derivationPath);

    if (!child.privateKey) {
      throw new Error(
        'Private key derivation failed'
      );
    }

    // Independent application-managed copy.
    return new Uint8Array(
      child.privateKey
    );

  } finally {
    // Remove the application-managed seed buffer.
    wipe(seed);
  }
}
