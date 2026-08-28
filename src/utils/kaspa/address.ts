import { NetworkType } from '../../types';
import { Address, payToAddressScript, ScriptPublicKey, addressFromScriptPublicKey } from '@kasdk/web';
import { ensureKaspaWasm } from '../crypto';

// Kaspa address version constants
export const VERSION_P2SH = 0x08;

// Kaspa Bech32 implementation
export const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export function convertBits(data: Uint8Array | number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const res: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      res.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) {
      res.push((acc << (to - bits)) & maxv);
    }
  } else {
    // Bech32 canonical bit alignment rules
    if (bits >= from) {
      throw new Error('Invalid padding in convertBits: excess alignment bits');
    }
    if ((acc & ((1 << bits) - 1)) !== 0) {
      throw new Error('Non-zero padding bits in convertBits: non-canonical address encoding');
    }
  }
  return res;
}

export function polyMod(values: bigint[]): bigint {
  let chk = 1n;
  const generator = [
    [0x98f2bc8e61n, 1n],
    [0x79b76d99e2n, 2n],
    [0xf33e5fb3c4n, 4n],
    [0xae2eabe2a8n, 8n],
    [0x1e4f43e470n, 16n],
  ];
  for (const v of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ v;
    for (const [g, b] of generator) {
      if (top & b) chk ^= g;
    }
  }
  return chk ^ 1n;
}

export function hrpExpand(hrp: string): bigint[] {
  const res: bigint[] = [];
  for (let i = 0; i < hrp.length; i++) {
    res.push(BigInt(hrp.charCodeAt(i) & 0x1f));
  }
  res.push(0n);
  return res;
}

/**
 * Encode a Kaspa address
 * version: 0x08 for P2SH
 */
export function encodeKaspaAddress(prefix: string, version: number, payload: Uint8Array): string {
  // Rely on official Rusty Kaspa WASM SDK for encoding
  try {
    // Note: The SDK typically handles this via ScriptPublicKey or existing Address objects.
    // For raw payload encoding, we ensure the SDK is initialized.
    const networkTypeStr = prefix.includes('test') ? 'testnet-10' : prefix.includes('dev') ? 'devnet' : 'mainnet';
    
    // Create a script from payload (P2SH version 0x08)
    const script = new Uint8Array(payload.length + 3);
    script[0] = 0xAA;
    script[1] = 0x20;
    script.set(payload, 2);
    script[payload.length + 2] = 0x87;
    
    const hex = Array.from(script).map(b => b.toString(16).padStart(2, '0')).join('');
    const spk = new ScriptPublicKey(0, hex);
    const addr = addressFromScriptPublicKey(spk, networkTypeStr);
    if (!addr) {
      throw new Error('Failed to derive address from script');
    }
    return addr.toString();
  } catch (err: any) {
    // Fallback to manual if SDK is not ready, though we prefer SDK
    const words = convertBits([version, ...payload], 8, 5, true);
    const hrpActual = prefix.replace(':', '');
    const checksumWords = [...hrpExpand(hrpActual), ...words.map(w => BigInt(w)), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
    const checksum = polyMod(checksumWords);
    
    let result = hrpActual + ':';
    for (const w of words) {
      result += CHARSET[w];
    }
    
    for (let i = 0; i < 8; i++) {
      const shift = BigInt(5 * (7 - i));
      const charIdx = Number((checksum >> shift) & 0x1fn);
      result += CHARSET[charIdx];
    }
    
    return result;
  }
}

/**
 * Shorten address for UI rendering: kaspa:qrm3v...9a8f
 */
export function shortenAddress(address: string, leadChars: number = 10, tailChars: number = 6): string {
  if (!address) return '';
  if (address.length <= leadChars + tailChars) return address;
  return `${address.slice(0, leadChars)}...${address.slice(-tailChars)}`;
}

/**
 * Validate Kaspa Address based on network prefix using the official Rusty Kaspa SDK
 */
export async function validateKaspaAddress(address: string, network: NetworkType = 'mainnet'): Promise<{ isValid: boolean; error?: string }> {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Address is required' };
  }

  const trimmed = address.trim();

  try {
    // Ensure the Rust-based WASM SDK is initialized before attempting to use its classes
    // Import dynamically to avoid top-level issues if necessary, but here we just wait for the promise
    const { ensureKaspaWasm } = await import('../crypto');
    await ensureKaspaWasm();

    // Use the official Rust-based Address class for validation
    const addr = new Address(trimmed);
    
    // Verify prefix matches network context
    const expectedPrefix = getAddressPrefix(network);
    const actualPrefix = trimmed.split(':')[0].toLowerCase();
    
    if (actualPrefix !== expectedPrefix) {
      return { isValid: false, error: `Invalid network prefix. Expected ${expectedPrefix}, got ${actualPrefix}` };
    }

    return { isValid: true };
  } catch (err: any) {
    // Handle the specific WASM "not initialized" error gracefully
    if (err.message?.includes('__wbindgen') || err.message?.includes('initialized')) {
       return { isValid: false, error: 'Initializing security module... please wait.' };
    }
    // Detailed error reporting from the Rust core
    return { isValid: false, error: err.message || 'Invalid Kaspa address format' };
  }
}

/**
 * Generate a Kaspa URI (kaspa:address?amount=100&note=Coffee)
 */
export function createKaspaUri(address: string, amountKas?: number, note?: string): string {
  let uri = address;
  const params = new URLSearchParams();

  if (amountKas && amountKas > 0) {
    params.append('amount', amountKas.toString());
  }
  if (note && note.trim()) {
    params.append('note', note.trim());
  }

  const queryString = params.toString();
  if (queryString) {
    uri += `?${queryString}`;
  }

  return uri;
}

/**
 * Parse Kaspa URI
 */
export function parseKaspaUri(uriString: string): { address: string; amountKas?: number; note?: string } {
  try {
    const trimmed = uriString.trim();
    if (trimmed.includes('?')) {
      const [addrPart, queryPart] = trimmed.split('?');
      const params = new URLSearchParams(queryPart);
      const amount = params.get('amount') ? parseFloat(params.get('amount')!) : undefined;
      const note = params.get('note') || undefined;
      return { address: addrPart, amountKas: amount, note };
    }
    return { address: trimmed };
  } catch {
    return { address: uriString };
  }
}

/**
 * Helper to convert a Kaspa address into a scriptPublicKey bytes.
 * Relies exclusively on the official Rusty Kaspa SDK (payToAddressScript).
 */
export async function addressToScriptPublicKeyBytes(address: string, network: NetworkType = 'mainnet'): Promise<Uint8Array> {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required');
  }
  const trimmed = address.trim();

  // Ensure WASM is ready before using SDK classes
  await ensureKaspaWasm();

  // Rely on official Rusty Kaspa SDK (payToAddressScript)
  try {
    const addrObj = new Address(trimmed);
    const scriptObj = payToAddressScript(addrObj);
    if (scriptObj && scriptObj.script) {
      const hex = scriptObj.script;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    throw new Error('Failed to generate script from address');
  } catch (err: any) {
    throw new Error(`Official Kaspa SDK failed or is not initialized: ${err.message || err}`);
  }
}

export function addressToScriptPublicKeyBytes_DEPRECATED_FALLBACK(address: string, network: NetworkType = 'mainnet'): Uint8Array {
  // This part was removed to ensure only official SDK is used.
  throw new Error("Pure JS fallback is disabled.");
}

async function addressToScriptPublicKeyBytes_INTERNAL(address: string, network: NetworkType = 'mainnet'): Promise<Uint8Array> {
  const trimmed = address.trim();
  const validation = await validateKaspaAddress(trimmed, network);
  if (!validation.isValid) {
    throw new Error(`Invalid address or network mismatch: ${validation.error || 'validation failed'}`);
  }

  const parts = trimmed.split(':');
  const payloadStr = parts[1];

  const words: number[] = [];
  for (let i = 0; i < payloadStr.length; i++) {
    const idx = CHARSET.indexOf(payloadStr[i].toLowerCase());
    if (idx !== -1) words.push(idx);
  }

  const dataWords = words.slice(0, words.length - 8);
  const bytes = convertBits(dataWords, 5, 8, false);

  const version = bytes[0];
  const payload = bytes.slice(1);

  // P2SH (version 0x08): aa + 20 + [32 bytes script hash] + 87
  if (version === 0x08) {
    const script = new Uint8Array(35);
    script[0] = 0xAA;
    script[1] = 0x20;
    script.set(payload, 2);
    script[34] = 0x87;
    return script;
  }

  // P2PK Schnorr (version 0x00): 20 + [32 bytes pubkey] + ac
  if (version === 0x00) {
    const script = new Uint8Array(34);
    script[0] = 0x20;
    script.set(payload, 1);
    script[33] = 0xAC;
    return script;
  }

  // P2PK ECDSA (version 0x01): 21 + [33 bytes pubkey] + ac
  if (version === 0x01) {
    const script = new Uint8Array(35);
    script[0] = 0x21;
    script.set(payload, 1);
    script[34] = 0xAC;
    return script;
  }

  throw new Error(`Unsupported address version 0x${version.toString(16)}`);
}

/**
 * Helper to convert a Kaspa address into a scriptPublicKey hex string
 */
export async function addressToScriptPublicKey(address: string, network: NetworkType = 'mainnet'): Promise<string> {
  const bytes = await addressToScriptPublicKeyBytes(address, network);
  return Buffer.from(bytes).toString('hex');
}

/**
 * Generate random Kaspa Address
 */
export function generateRandomKaspaAddress(prefix: string = 'kaspa:'): string {
  const payload = new Uint8Array(32);
  crypto.getRandomValues(payload);
  return encodeKaspaAddress(prefix.replace(':', ''), VERSION_P2SH, payload);
}

export function getAddressPrefix(network: NetworkType): string {
  if (network === 'mainnet') return 'kaspa';
  if (network === 'devnet') return 'kaspadev';
  return 'kaspatest';
}
