import { NetworkType } from '../../types';

// Kaspa address version constants
export const VERSION_P2PKH = 0x00;
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
 * version: 0x00 for P2PKH, 0x08 for P2SH
 */
export function encodeKaspaAddress(prefix: string, version: number, payload: Uint8Array): string {
  const words = convertBits([version, ...payload], 8, 5, true);
  const hrpActual = prefix.replace(':', '');
  const checksumWords = [...hrpExpand(hrpActual), ...words.map(w => BigInt(w)), 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
  const checksum = polyMod(checksumWords);
  
  let result = hrpActual + ':';
  for (const w of words) {
    result += CHARSET[w];
  }
  
  // 40-bit checksum is 8 characters in 5-bit groups
  for (let i = 0; i < 8; i++) {
    const shift = BigInt(5 * (7 - i));
    const charIdx = Number((checksum >> shift) & 0x1fn);
    result += CHARSET[charIdx];
  }
  
  return result;
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
 * Validate Kaspa Address based on network prefix
 */
export function validateKaspaAddress(address: string, network: NetworkType = 'mainnet'): { isValid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Address is required' };
  }

  let trimmed = address.trim();

  let expectedPrefix = 'kaspa:';
  if (network === 'testnet-10') expectedPrefix = 'kaspatest:';
  if (network === 'devnet') expectedPrefix = 'kaspadev:';

  if (!trimmed.includes(':')) {
    trimmed = `${expectedPrefix}${trimmed}`;
  }

  const lower = trimmed.toLowerCase();
  const validPrefixes = ['kaspa:', 'kaspatest:', 'kaspadev:'];
  const hasValidPrefix = validPrefixes.some(p => lower.startsWith(p));

  if (!hasValidPrefix) {
    return { isValid: false, error: `Address must start with 'kaspa:', 'kaspatest:', or 'kaspadev:'` };
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || !parts[1] || parts[1].length < 35 || parts[1].length > 100) {
    return { isValid: false, error: 'Invalid Kaspa address length' };
  }

  const hrpActual = parts[0].toLowerCase();
  const payload = parts[1];
  const firstChar = payload[0].toLowerCase();
  if (!['q', 'p', 'z'].includes(firstChar)) {
    return { isValid: false, error: "Invalid Kaspa address format (must start with 'q' or 'p')" };
  }

  const validBech32Chars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i;
  if (!validBech32Chars.test(payload)) {
    return { isValid: false, error: 'Address contains invalid characters' };
  }

  // Convert characters to 5-bit values
  const words: number[] = [];
  for (let i = 0; i < payload.length; i++) {
    const idx = CHARSET.indexOf(payload[i].toLowerCase());
    if (idx === -1) {
      return { isValid: false, error: 'Address contains invalid characters' };
    }
    words.push(idx);
  }

  // Checksum is 8 characters
  if (words.length < 8) {
    return { isValid: false, error: 'Address is too short' };
  }

  // Verify polynomial checksum
  const checksumWords = [...hrpExpand(hrpActual), ...words.map(w => BigInt(w))];
  const remainder = polyMod(checksumWords);
  if (remainder !== 0n) {
    return { isValid: false, error: 'Address checksum verification failed' };
  }

  // Verify version byte and payload size
  const dataWords = words.slice(0, words.length - 8);
  const bytes = convertBits(dataWords, 5, 8, false);
  if (bytes.length === 0) {
    return { isValid: false, error: 'Invalid address data encoding' };
  }

  const version = bytes[0];
  if (version !== VERSION_P2PKH && version !== VERSION_P2SH) {
    return { isValid: false, error: `Unsupported address version 0x${version.toString(16)}` };
  }

  const pubkeyHashLength = bytes.length - 1;
  // Standard Kaspa addresses have a 32-byte public key hash or script hash.
  if (pubkeyHashLength !== 32) {
    return { isValid: false, error: `Invalid payload length (${pubkeyHashLength} bytes, expected 32)` };
  }

  return { isValid: true };
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
 * Helper to convert a Kaspa address into a scriptPublicKey bytes
 */
export function addressToScriptPublicKeyBytes(address: string): Uint8Array {
  if (!address) return new Uint8Array(0);
  const trimmed = address.trim();

  // If already hex
  if (/^[0-9a-fA-F]{64,80}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // Extract payload after prefix
  const parts = trimmed.split(':');
  const payloadStr = parts.length > 1 ? parts[1] : parts[0];

  const words: number[] = [];
  for (let i = 0; i < payloadStr.length; i++) {
    const idx = CHARSET.indexOf(payloadStr[i].toLowerCase());
    if (idx !== -1) words.push(idx);
  }

  if (words.length < 8) return new Uint8Array(0);
  // Remove 8 checksum words
  const dataWords = words.slice(0, words.length - 8);
  const bytes = convertBits(dataWords, 5, 8, false);

  if (bytes.length < 33) return new Uint8Array(0);
  const version = bytes[0];
  const payload = bytes.slice(1);

  // P2PKH (version 0x00): 20 + [32 bytes pubkey hash] + ac
  if (version === VERSION_P2PKH) {
    const script = new Uint8Array(34);
    script[0] = 0x20;
    script.set(payload, 1);
    script[33] = 0xAC;
    return script;
  }
  // P2SH (version 0x08): aa + 20 + [32 bytes script hash] + 87
  if (version === 0x08) {
    const script = new Uint8Array(35);
    script[0] = 0xAA;
    script[1] = 0x20;
    script.set(payload, 2);
    script[34] = 0x87;
    return script;
  }

  const script = new Uint8Array(34);
  script[0] = 0x20;
  script.set(payload, 1);
  script[33] = 0xAC;
  return script;
}

/**
 * Helper to convert a Kaspa address into a scriptPublicKey hex string
 */
export function addressToScriptPublicKey(address: string): string {
  return Buffer.from(addressToScriptPublicKeyBytes(address)).toString('hex');
}

/**
 * Generate random Kaspa Address
 */
export function generateRandomKaspaAddress(prefix: string = 'kaspa:'): string {
  const payload = new Uint8Array(32);
  crypto.getRandomValues(payload);
  return encodeKaspaAddress(prefix.replace(':', ''), VERSION_P2PKH, payload);
}
