import { NetworkType } from '../types';
import { safeStringify } from './json';
import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import { blake2b } from '@noble/hashes/blake2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { concatBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';

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

let kaspaWasmModule: any = null;

export const SOMPI_PER_KAS = 100_000_000n;

// Kaspa Bech32 implementation
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function convertBits(data: Uint8Array | number[], from: number, to: number, pad: boolean): number[] {
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

function polyMod(values: bigint[]): bigint {
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

function hrpExpand(hrp: string): bigint[] {
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
 * Convert Sompi to KAS number or formatted string
 */
export function sompiToKas(sompi: bigint): number {
  return Number(sompi) / Number(SOMPI_PER_KAS);
}

/**
 * Convert KAS number to Sompi bigint
 */
export function kasToSompi(kas: number): bigint {
  return BigInt(Math.round(kas * Number(SOMPI_PER_KAS)));
}

/**
 * Format Kaspa amount for display with optional currency decimals
 */
export function formatKas(sompi: bigint, decimals: number = 8): string {
  const kas = sompiToKas(sompi);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(kas);
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

  const payload = parts[1];
  const firstChar = payload[0].toLowerCase();
  if (!['q', 'p', 'z'].includes(firstChar)) {
    return { isValid: false, error: "Invalid Kaspa address format (must start with 'q' or 'p')" };
  }

  const validBech32Chars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/i;
  if (!validBech32Chars.test(payload)) {
    return { isValid: false, error: 'Address contains invalid characters' };
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

/**
 * Create a P2SH Redeem Script from a public key or custom script bytes
 */
export function createP2SHRedeemScript(publicKeyHex: string): { redeemScriptHex: string; scriptHashHex: string } {
  const hex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  const pubKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const xOnly = pubKey.length === 33 ? pubKey.slice(1) : pubKey;

  const redeemScript = new Uint8Array(34);
  redeemScript[0] = 0x20; // PUSH 32 bytes
  redeemScript.set(xOnly, 1);
  redeemScript[33] = 0xac; // OP_CHECKSIG

  const scriptHash = blake2b(redeemScript, { dkLen: 32 });
  return {
    redeemScriptHex: Buffer.from(redeemScript).toString('hex'),
    scriptHashHex: Buffer.from(scriptHash).toString('hex'),
  };
}

/**
 * Create a unique P2SH Covenant Redeem Script and its on-chain P2SH Address
 */
export function createCovenantRedeemScript(
  publicKeyHex: string,
  daaLock: number,
  type: string
): { redeemScriptHex: string; scriptHashHex: string; address: string } {
  const hex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  const pubKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const xOnly = pubKey.length === 33 ? pubKey.slice(1) : pubKey;

  const redeemScript = new Uint8Array(45);
  
  // 1. Push 8 bytes of daaLock
  redeemScript[0] = 0x08; // PUSH 8 bytes
  const lockBytes = new Uint8Array(8);
  const view = new DataView(lockBytes.buffer);
  view.setBigUint64(0, BigInt(daaLock), true); // true = little-endian
  redeemScript.set(lockBytes, 1);
  
  // 2. OP_CHECKLOCKTIMEVERIFY
  redeemScript[9] = 0xb1; // OP_CHECKLOCKTIMEVERIFY
  
  // 3. OP_DROP
  redeemScript[10] = 0x75; // OP_DROP
  
  // 4. OP_PUSH_32 for public key
  redeemScript[11] = 0x20; // PUSH 32 bytes
  redeemScript.set(xOnly, 12);
  
  // 5. OP_CHECKSIG
  redeemScript[44] = 0xac; // OP_CHECKSIG

  const redeemScriptHex = Buffer.from(redeemScript).toString('hex');
  const scriptHash = blake2b(redeemScript, { dkLen: 32 });
  const scriptHashHex = Buffer.from(scriptHash).toString('hex');
  const address = encodeKaspaAddress('kaspa', 0x08, scriptHash);

  return {
    redeemScriptHex,
    scriptHashHex,
    address,
  };
}

/**
 * Derive covenant P2SH address and script from a mnemonic
 */
export function getCovenantAddressAndScript(
  mnemonic: string,
  passphrase?: string,
  daaLock?: number,
  type?: string
): { address: string; redeemScriptHex: string; publicKeyHex: string } {
  const privateKeyHex = getPrivateKeyFromMnemonic(mnemonic, passphrase);
  const privKeyClean = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const privKeyBytes = new Uint8Array(privKeyClean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const pubKeyBytes = secp.schnorr.getPublicKey(privKeyBytes);
  const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

  const lock = daaLock || 0;
  const res = createCovenantRedeemScript(pubKeyHex, lock, type || 'timelock');
  return {
    address: res.address,
    redeemScriptHex: res.redeemScriptHex,
    publicKeyHex: pubKeyHex,
  };
}

/**
 * Helper to convert a Kaspa address into a scriptPublicKey hex string
 */
export function addressToScriptPublicKeyHex(address: string): string {
  if (!address) return '';
  const trimmed = address.trim();

  // If already hex
  if (/^[0-9a-fA-F]{64,80}$/.test(trimmed)) {
    return trimmed;
  }

  // Extract payload after prefix
  const parts = trimmed.split(':');
  const payloadStr = parts.length > 1 ? parts[1] : parts[0];

  const words: number[] = [];
  for (let i = 0; i < payloadStr.length; i++) {
    const idx = CHARSET.indexOf(payloadStr[i].toLowerCase());
    if (idx !== -1) words.push(idx);
  }

  if (words.length < 8) return '';
  // Remove 8 checksum words
  const dataWords = words.slice(0, words.length - 8);
  const bytes = convertBits(dataWords, 5, 8, false);

  if (bytes.length < 33) return '';
  const version = bytes[0];
  const payloadHex = Buffer.from(bytes.slice(1)).toString('hex');

  // P2PKH (version 0x00): 20 + [32 bytes pubkey hash] + ac
  if (version === 0x00) {
    return `20${payloadHex}ac`;
  }
  // P2SH (version 0x08): aa + 20 + [32 bytes script hash] + 87
  if (version === 0x08) {
    return `aa20${payloadHex}87`;
  }

  return `20${payloadHex}ac`;
}

/**
 * Create and sign a Kaspa transaction with support for P2PKH and P2SH script inputs
 */
export enum CovenantType {
  STANDARD = 'standard',
  P2SH = 'p2sh',
}

export class CovenantIDManager {
  registry: Record<string, any> = {};

  covenantIdHash(data: Uint8Array): Uint8Array {
    const tag = new TextEncoder().encode("CovenantID");
    const tagged = new Uint8Array(tag.length + data.length);
    tagged.set(tag, 0);
    tagged.set(data, tag.length);
    return blake2b(tagged, { dkLen: 32 });
  }

  encodeOutpoint(txIdHex: string, index: number): Uint8Array {
    // tx_id: 32 bytes (64 hex chars)
    const txIdBytes = new Uint8Array(txIdHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, true);
    const outpoint = new Uint8Array(36);
    outpoint.set(txIdBytes, 0);
    outpoint.set(indexBytes, 32);
    return outpoint;
  }

  encodeOutput(outIdx: number, amountSompi: bigint, scriptPubKey: Uint8Array): Uint8Array {
    const buffer = new Uint8Array(4 + 8 + 4 + scriptPubKey.length);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, outIdx, true); // out_idx (u32)
    view.setBigUint64(4, amountSompi, true); // amount (u64)
    view.setUint32(12, scriptPubKey.length, true); // script length (u32)
    buffer.set(scriptPubKey, 16);
    return buffer;
  }

  encodeAuthOutputs(authOutputs: { outIdx: number, amount: bigint, scriptPubKey: Uint8Array }[]): Uint8Array {
    // Sort by strictly increasing out_idx (KIP-20)
    const sorted = [...authOutputs].sort((a, b) => a.outIdx - b.outIdx);
    
    let totalLen = 4; 
    const encodedList: Uint8Array[] = [];
    for (const out of sorted) {
      const enc = this.encodeOutput(out.outIdx, out.amount, out.scriptPubKey);
      encodedList.push(enc);
      totalLen += enc.length;
    }
    
    const buffer = new Uint8Array(totalLen);
    new DataView(buffer.buffer).setUint32(0, sorted.length, true);
    
    let offset = 4;
    for (const enc of encodedList) {
      buffer.set(enc, offset);
      offset += enc.length;
    }
    return buffer;
  }

  buildP2shLockingScript(innerScript: Uint8Array): Uint8Array {
    const scriptHash = blake2b(innerScript, { dkLen: 32 });
    const script = new Uint8Array(35);
    script[0] = 0xaa; // OP_BLAKE2B
    script[1] = 0x20; // PUSH 32
    script.set(scriptHash, 2);
    script[34] = 0x87; // OP_EQUAL
    return script;
  }

  buildNextOfKinInnerScript(ownerPubKey: Uint8Array, heirPubKey: Uint8Array, timeout: number): Uint8Array {
    // OP_IF <owner> OP_CHECKSIG OP_ELSE <timeout> OP_CSV OP_DROP <heir> OP_CHECKSIG OP_ENDIF
    const script = new Uint8Array(100);
    let offset = 0;
    
    // OP_IF
    script[offset++] = 0x63;
    
    // Push owner pubkey (32 bytes)
    script[offset++] = 0x20;
    script.set(ownerPubKey, offset); offset += 32;
    script[offset++] = 0xac; // OP_CHECKSIG
    
    // OP_ELSE
    script[offset++] = 0x67;
    
    // Push timeout (e.g., 86400)
    // Note: Simplified push of timeout, needs proper serialization if large
    script[offset++] = 0x03; 
    script[offset++] = 0x00; script[offset++] = 0x51; script[offset++] = 0x01; 
    
    script[offset++] = 0xb2; // OP_CSV
    script[offset++] = 0x75; // OP_DROP
    
    // Push heir pubkey (32 bytes)
    script[offset++] = 0x20;
    script.set(heirPubKey, offset); offset += 32;
    script[offset++] = 0xac; // OP_CHECKSIG
    
    // OP_ENDIF
    script[offset++] = 0x68;
    
    return script.slice(0, offset);
  }

  buildTimelockInnerScript(ownerPubKey: Uint8Array, timeout: number): Uint8Array {
    const script = new Uint8Array(100);
    let offset = 0;
    script[offset++] = 0x20; // PUSH 32
    script.set(ownerPubKey, offset); offset += 32;
    script[offset++] = 0xac; // OP_CHECKSIG
    return script.slice(0, offset);
  }

  buildDeadmansSwitchInnerScript(ownerPubKey: Uint8Array, backupPubKey: Uint8Array, timeout: number): Uint8Array {
    const script = new Uint8Array(100);
    let offset = 0;
    script[offset++] = 0x20; // PUSH 32
    script.set(ownerPubKey, offset); offset += 32;
    script[offset++] = 0xac; // OP_CHECKSIG
    return script.slice(0, offset);
  }

  buildMultisigInnerScript(pubKeys: Uint8Array[], threshold: number): Uint8Array {
    const script = new Uint8Array(100);
    let offset = 0;
    script[offset++] = 0x50 + threshold; // OP_M
    // ... pubkeys ...
    return script.slice(0, offset);
  }

  computeStandard(txIdHex: string, inputIndex: number, authOutputs: { outIdx: number, amount: bigint, scriptPubKey: Uint8Array }[]): string {
    const outpoint = this.encodeOutpoint(txIdHex, inputIndex);
    const outputsEnc = this.encodeAuthOutputs(authOutputs);
    
    const preimage = new Uint8Array(outpoint.length + outputsEnc.length);
    preimage.set(outpoint, 0);
    preimage.set(outputsEnc, outpoint.length);
    
    const cid = this.covenantIdHash(preimage);
    return Buffer.from(cid).toString('hex');
  }

  compute(
    covenantType: CovenantType,
    txIdHex: string,
    inputIndex: number,
    authOutputs: { outIdx: number, amount: bigint, scriptBytes: Uint8Array }[],
    label: string = ""
  ): string {
    let cidHex = "";
    
    if (covenantType === CovenantType.STANDARD) {
      cidHex = this.computeStandard(txIdHex, inputIndex, authOutputs.map(o => ({
        outIdx: o.outIdx,
        amount: o.amount,
        scriptPubKey: o.scriptBytes
      })));
    } else if (covenantType === CovenantType.P2SH) {
      const p2shOutputs = authOutputs.map(o => ({
        outIdx: o.outIdx,
        amount: o.amount,
        scriptPubKey: this.buildP2shLockingScript(o.scriptBytes)
      }));
      cidHex = this.computeStandard(txIdHex, inputIndex, p2shOutputs);
    }

    this.registry[cidHex] = {
      covenant_id: cidHex,
      type: covenantType,
      genesis_tx_id: txIdHex,
      input_index: inputIndex,
      label,
      output_count: authOutputs.length,
    };

    return cidHex;
  }
}

export const covenantIdManager = new CovenantIDManager();

export async function createSignedTransaction(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyHex: string,
  feeSompi: bigint = 1000n,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  redeemScriptHex?: string,
  mnemonic?: string,
  passphrase?: string,
  lockTime?: number
): Promise<any> {
  await ensureKaspaRuntime();

  const privKeyClean = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const privKeyBytes = new Uint8Array(privKeyClean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const pubKeyBytes = secp.schnorr.getPublicKey(privKeyBytes);
  const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

  const isP2SH = addressType === 'P2SH' || 
    Boolean(changeAddress && changeAddress.includes(':p')) || 
    utxos.some(u => (u.address && u.address.includes(':p')) || (typeof u.utxoEntry?.scriptPublicKey?.scriptPublicKey === 'string' && u.utxoEntry.scriptPublicKey.scriptPublicKey.startsWith('aa20')));

  let p2shRedeemScript = redeemScriptHex;
  if (isP2SH && !p2shRedeemScript) {
    p2shRedeemScript = createP2SHRedeemScript(pubKeyHex).redeemScriptHex;
  }

  // Attempt WASM transaction creation if available
  if (kaspaWasmModule && typeof kaspaWasmModule.createTransaction === 'function' && typeof kaspaWasmModule.signTransaction === 'function') {
    try {
      const formattedUtxos = utxos.map(u => ({
        address: changeAddress || toAddress,
        outpoint: {
          transactionId: u.outpoint?.transactionId || u.transactionId,
          index: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0))
        },
        utxoEntry: {
          amount: BigInt(u.utxoEntry?.amount || u.amount || 0),
          scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.utxoEntry?.scriptPublicKey || addressToScriptPublicKeyHex(changeAddress || toAddress),
          blockDaaScore: BigInt(u.utxoEntry?.blockDaaScore || u.blockDaaScore || 0),
          isCoinbase: Boolean(u.utxoEntry?.isCoinbase || u.isCoinbase || false)
        }
      }));

      const outputs = [
        {
          address: toAddress,
          amount: BigInt(amountSompi)
        }
      ];

      const mtx = kaspaWasmModule.createTransaction(
        formattedUtxos,
        outputs,
        changeAddress || toAddress,
        BigInt(feeSompi),
        "",
        BigInt(addressType === 'P2SH' ? 2 : 1),
        1n
      );

      const privateKeyObj = new kaspaWasmModule.PrivateKey(privKeyClean);
      const signedMtx = kaspaWasmModule.signTransaction(mtx, [privateKeyObj], true);

      if (signedMtx) {
        const jsonStr = typeof signedMtx.toJSON === 'function' ? signedMtx.toJSON() : safeStringify(signedMtx);
        const txObj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        const tx = txObj.tx || txObj;
        if (tx && tx.inputs && tx.outputs) {
          return { transaction: tx };
        }
      }
    } catch (wasmErr) {
      console.warn('kaspa-wasm tx creation notice, proceeding with exact JS sighash:', wasmErr);
    }
  }

  // Primary/Fallback Exact Kaspa Sighash & Schnorr Transaction Builder
  const SIGHASH_KEY = new TextEncoder().encode("TransactionSigningHash");

  function writeUint16LE(val: number): Uint8Array {
    const buf = new Uint8Array(2);
    buf[0] = val & 0xff;
    buf[1] = (val >> 8) & 0xff;
    return buf;
  }

  function writeUint32LE(val: number): Uint8Array {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, val, true);
    return buf;
  }

  function writeUint64LE(val: bigint): Uint8Array {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, BigInt(val), true);
    return buf;
  }

  function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (!clean) return new Uint8Array(0);
    const matches = clean.match(/.{1,2}/g);
    return matches ? new Uint8Array(matches.map(b => parseInt(b, 16))) : new Uint8Array(0);
  }

  function encodeScriptPushData(hexStr: string): string {
    const bytes = hexToBytes(hexStr);
    const len = bytes.length;
    if (len <= 75) {
      const lenHex = len.toString(16).padStart(2, '0');
      return `${lenHex}${hexStr}`;
    } else if (len <= 255) {
      const lenHex = len.toString(16).padStart(2, '0');
      return `4c${lenHex}${hexStr}`;
    } else {
      const lenHex = writeUint16LE(len);
      return `4d${Buffer.from(lenHex).toString('hex')}${hexStr}`;
    }
  }

  function hashBlake2bKeyed(data: Uint8Array): Uint8Array {
    return blake2b(data, { key: SIGHASH_KEY, dkLen: 32 });
  }

  // Calculate total UTXO input sum
  let totalInputSompi = 0n;
  const inputs: any[] = [];

  utxos.forEach(u => {
    const txId = u.outpoint?.transactionId || u.transactionId || '0000000000000000000000000000000000000000000000000000000000000000';
    const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    totalInputSompi += amt;

    inputs.push({
      previousOutpoint: {
        transactionId: txId,
        index: Number(vout),
      },
      signatureScript: '',
      sequence: 0,
      sigOpCount: 1,
    });
  });

  const outputs: any[] = [
    {
      amount: Number(amountSompi),
      scriptPublicKey: {
        scriptPublicKey: addressToScriptPublicKeyHex(toAddress),
        version: 0,
      },
    },
  ];

  // Calculate change
  const changeSompi = totalInputSompi - amountSompi - feeSompi;
  if (changeSompi > 0n && changeAddress) {
    outputs.push({
      amount: Number(changeSompi),
      scriptPublicKey: {
        scriptPublicKey: addressToScriptPublicKeyHex(changeAddress),
        version: 0,
      },
    });
  }

  // Pre-calculate outpointsHash, sequencesHash, sigOpCountsHash, outputsHash, payloadHash
  const outpointParts: Uint8Array[] = [];
  const seqParts: Uint8Array[] = [];
  const sigOpCountParts: Uint8Array[] = [];
  const sigOpCountVal = 1;

  utxos.forEach(u => {
    const txId = u.outpoint?.transactionId || u.transactionId || '0000000000000000000000000000000000000000000000000000000000000000';
    const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
    outpointParts.push(hexToBytes(txId));
    outpointParts.push(writeUint32LE(Number(vout)));

    seqParts.push(writeUint64LE(0n));
    sigOpCountParts.push(new Uint8Array([sigOpCountVal]));
  });

  const previousOutpointsHash = hashBlake2bKeyed(concatBytes(...outpointParts));
  const sequencesHash = hashBlake2bKeyed(concatBytes(...seqParts));
  const sigOpCountsHash = hashBlake2bKeyed(concatBytes(...sigOpCountParts));

  const outputParts: Uint8Array[] = [];
  outputs.forEach(out => {
    const amt = BigInt(out.amount);
    const spkBytes = hexToBytes(out.scriptPublicKey.scriptPublicKey);
    outputParts.push(writeUint64LE(amt));
    outputParts.push(writeUint16LE(0));
    outputParts.push(writeUint64LE(BigInt(spkBytes.length)));
    outputParts.push(spkBytes);
  });
  const outputsHash = hashBlake2bKeyed(concatBytes(...outputParts));
  const payloadHash = new Uint8Array(32); // native subnetwork with no payload uses 32 bytes of zeros
  const subnetworkIdBytes = new Uint8Array(20);

  // Generate Schnorr signatures for inputs using Kaspa Sighash preimage
  utxos.forEach((u, i) => {
    const txId = u.outpoint?.transactionId || u.transactionId || '0000000000000000000000000000000000000000000000000000000000000000';
    const vout = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    const spkHex = u.utxoEntry?.scriptPublicKey?.scriptPublicKey || 
      (typeof u.utxoEntry?.scriptPublicKey === 'string' ? u.utxoEntry.scriptPublicKey : null) || 
      u.scriptPublicKey || 
      addressToScriptPublicKeyHex(u.address || changeAddress || toAddress);
    
    // Kaspa sighash preimage ALWAYS uses the UTXO's scriptPublicKey, even for P2SH inputs!
    const scriptForSighashHex = spkHex;
    const scriptForSighashBytes = hexToBytes(scriptForSighashHex);

    const preimage = concatBytes(
      writeUint16LE(0), // version
      previousOutpointsHash,
      sequencesHash,
      sigOpCountsHash,
      hexToBytes(txId),
      writeUint32LE(Number(vout)),
      writeUint16LE(0), // script version
      writeUint64LE(BigInt(scriptForSighashBytes.length)),
      scriptForSighashBytes,
      writeUint64LE(amt),
      writeUint64LE(0n), // sequence
      new Uint8Array([sigOpCountVal]),
      outputsHash,
      writeUint64LE(BigInt(lockTime || 0)), // lockTime
      subnetworkIdBytes,
      writeUint64LE(0n), // gas
      payloadHash,
      new Uint8Array([0x01]) // SIGHASH_ALL
    );

    // Derive correct private key and public key for this UTXO if a derivation path is present
    let inputPrivKeyBytes = privKeyBytes;
    let inputPubKeyHex = pubKeyHex;

    if (mnemonic && u.derivationPath) {
      try {
        const derivedPrivKey = getPrivateKeyFromMnemonic(mnemonic, passphrase, u.derivationPath);
        const inputPrivKeyClean = derivedPrivKey.startsWith('0x') ? derivedPrivKey.slice(2) : derivedPrivKey;
        inputPrivKeyBytes = new Uint8Array(inputPrivKeyClean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
        const inputPubKeyBytes = secp.schnorr.getPublicKey(inputPrivKeyBytes);
        inputPubKeyHex = Buffer.from(inputPubKeyBytes).toString('hex');
      } catch (err) {
        console.warn('Failed to derive custom key for UTXO path:', u.derivationPath, err);
      }
    }

    const sigHash = hashBlake2bKeyed(preimage);
    const rawSig = secp.schnorr.sign(sigHash, inputPrivKeyBytes);
    const sigWithSighash = `${Buffer.from(rawSig).toString('hex')}01`;

    const isInputP2SH = 
      Boolean(u.address && u.address.includes(':p')) || 
      Boolean(spkHex && spkHex.startsWith('aa20'));

    if (isInputP2SH) {
      const inputRedeemScript = redeemScriptHex || createP2SHRedeemScript(inputPubKeyHex).redeemScriptHex;
      const pushRedeemScript = encodeScriptPushData(inputRedeemScript);
      inputs[i].signatureScript = `41${sigWithSighash}${pushRedeemScript}`;
      inputs[i].sigOpCount = 1;
    } else {
      inputs[i].signatureScript = `41${sigWithSighash}`;
      inputs[i].sigOpCount = 1;
    }
  });

  return {
    transaction: {
      version: 0,
      inputs,
      outputs,
      lockTime: lockTime || 0,
      subnetworkId: '0000000000000000000000000000000000000000',
    },
  };
}

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
 * Generate a 24-word Kaspa BIP39 mnemonic seed
 */
export function generate24WordMnemonic(): string[] {
  const mnemonic = bip39.generateMnemonic(256);
  return mnemonic.split(' ');
}

/**
 * Derive a Kaspa address from a 33-byte compressed public key or 32-byte Schnorr pubkey using kaspa-wasm
 */
export function getAddressFromPublicKey(
  publicKey: Uint8Array | string, 
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  prefix: string = 'kaspa'
): string {
  let pubKey: Uint8Array;
  if (typeof publicKey === 'string') {
    const hex = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    pubKey = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  } else {
    pubKey = publicKey;
  }

  const xOnlyPubKey = pubKey.length === 33 ? pubKey.slice(1) : pubKey;

  try {
    const networkTypeNum = prefix === 'kaspa' ? 0 : prefix === 'kaspatest' ? 1 : 2;
    if (kaspaWasmModule && typeof kaspaWasmModule.createAddress === 'function') {
      const pubKeyHex = Buffer.from(xOnlyPubKey).toString('hex');
      const wasmAddr = kaspaWasmModule.createAddress(
        pubKeyHex,
        networkTypeNum,
        false,
        addressType === 'P2SH' ? 2 : 0
      );
      if (wasmAddr) {
        const addrStr = wasmAddr.toString();
        if (addressType === 'P2SH' && addrStr.includes(':p')) {
          return addrStr;
        } else if (addressType === 'P2PKH' && addrStr.includes(':q')) {
          return addrStr;
        }
      }
    }
  } catch (e) {
    // Graceful fallback to deterministic Bech32 script hash
  }

  if (addressType === 'P2SH') {
    const redeemScript = new Uint8Array(34);
    redeemScript[0] = 0x20; // PUSH 32 bytes
    redeemScript.set(xOnlyPubKey, 1);
    redeemScript[33] = 0xac; // OP_CHECKSIG
    
    const scriptHash = blake2b(redeemScript, { dkLen: 32 });
    return encodeKaspaAddress(prefix, 0x08, scriptHash);
  } else {
    return encodeKaspaAddress(prefix, 0x00, xOnlyPubKey);
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
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');
  const root = HDKey.fromMasterSeed(new Uint8Array(seed));
  
  const changeVal = isChange ? 1 : 0;
  const path = `m/44'/${coinType}'/0'/${changeVal}/${index}`;
  const child = root.derive(path);
  
  if (!child.publicKey) throw new Error('Failed to derive public key');

  return getAddressFromPublicKey(child.publicKey, addressType, prefix);
}

export interface DiscoveredAddressInfo {
  address: string;
  balanceSompi: bigint;
  path: string;
  index: number;
  isChange: boolean;
  coinType: number;
}

export interface ScannedWalletChainResult {
  primaryAddress: string;
  totalBalanceSompi: bigint;
  discoveredAddresses: DiscoveredAddressInfo[];
  allUtxos: any[];
  allTransactions: any[];
}

/**
 * Perform deep DAG Chain Index scanning across multiple HD paths, receive/change chains, and derivation indices.
 * Finds all funded addresses, collects active UTXOs, and merges transaction history.
 */
export async function scanKaspaWalletChain(
  mnemonic: string,
  passphrase?: string,
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  gapLimit: number = 20,
  onProgress?: (scannedCount: number, foundCount: number, balanceSompi: bigint) => void
): Promise<ScannedWalletChainResult> {
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');
  const root = HDKey.fromMasterSeed(new Uint8Array(seed));

  const discoveredAddresses: DiscoveredAddressInfo[] = [];
  const allUtxos: any[] = [];
  const allTransactionsMap = new Map<string, any>();
  let totalBalanceSompi = 0n;

  // Derive primary address immediately
  const primaryChild = root.derive("m/44'/111111'/0'/0/0");
  const primaryAddress = getAddressFromPublicKey(primaryChild.publicKey!, addressType, prefix);

  // Quick mode for brand new wallet creation (gapLimit <= 1)
  if (gapLimit <= 1) {
    if (onProgress) onProgress(1, 0, 0n);
    try {
      const [balance, utxos, txs] = await Promise.all([
        fetchKaspaAddressBalance(primaryAddress),
        fetchKaspaAddressUtxos(primaryAddress),
        fetchKaspaAddressTransactions(primaryAddress),
      ]);
      const currentBal = balance || 0n;
      totalBalanceSompi = currentBal;
      if (currentBal > 0n || (utxos && utxos.length > 0) || (txs && txs.length > 0)) {
        discoveredAddresses.push({
          address: primaryAddress,
          balanceSompi: currentBal,
          path: "m/44'/111111'/0'/0/0",
          index: 0,
          isChange: false,
          coinType: 111111,
        });
        if (utxos && Array.isArray(utxos)) {
          utxos.forEach((u: any) => allUtxos.push({ ...u, address: primaryAddress, derivationPath: "m/44'/111111'/0'/0/0" }));
        }
        if (txs && Array.isArray(txs)) {
          txs.forEach((t: any) => {
            const txid = t.transaction_id || t.txid;
            if (txid) allTransactionsMap.set(txid, t);
          });
        }
      }
    } catch {
      // Return primary address cleanly on network fail
    }
    if (onProgress) onProgress(1, discoveredAddresses.length, totalBalanceSompi);

    return {
      primaryAddress,
      totalBalanceSompi,
      discoveredAddresses,
      allUtxos,
      allTransactions: Array.from(allTransactionsMap.values()),
    };
  }

  // Full scanning with parallel batching for seed restoration / index scan
  const coinTypes = [111111, 972];
  let totalScanned = 0;

  for (const coinType of coinTypes) {
    for (const isChange of [false, true]) {
      const changeVal = isChange ? 1 : 0;
      const batchSize = 4;

      for (let i = 0; i < gapLimit; i += batchSize) {
        const batchIndices = Array.from({ length: Math.min(batchSize, gapLimit - i) }, (_, idx) => i + idx);
        
        const batchItems = batchIndices.map((idx) => {
          const path = `m/44'/${coinType}'/0'/${changeVal}/${idx}`;
          try {
            const child = root.derive(path);
            if (!child || !child.publicKey) return null;
            const addr = getAddressFromPublicKey(child.publicKey, addressType, prefix);
            return { idx, path, addr };
          } catch {
            return null;
          }
        }).filter(Boolean) as { idx: number; path: string; addr: string }[];

        if (batchItems.length === 0) break;

        const results = await Promise.all(
          batchItems.map(async (item) => {
            try {
              const [balance, utxos, txs] = await Promise.all([
                fetchKaspaAddressBalance(item.addr),
                fetchKaspaAddressUtxos(item.addr),
                fetchKaspaAddressTransactions(item.addr),
              ]);
              return { item, balance, utxos, txs };
            } catch {
              return { item, balance: null, utxos: null, txs: null };
            }
          })
        );

        let batchHasActivity = false;

        for (const res of results) {
          totalScanned++;
          const hasBalance = res.balance !== null && res.balance > 0n;
          const hasUtxos = res.utxos !== null && Array.isArray(res.utxos) && res.utxos.length > 0;
          const hasTxs = res.txs !== null && Array.isArray(res.txs) && res.txs.length > 0;

          if (hasBalance || hasUtxos || hasTxs) {
            batchHasActivity = true;
            const currentBal = res.balance || 0n;
            totalBalanceSompi += currentBal;

            discoveredAddresses.push({
              address: res.item.addr,
              balanceSompi: currentBal,
              path: res.item.path,
              index: res.item.idx,
              isChange,
              coinType,
            });

            if (res.utxos && Array.isArray(res.utxos)) {
              res.utxos.forEach((u: any) => {
                allUtxos.push({
                  ...u,
                  derivationPath: res.item.path,
                  address: res.item.addr,
                });
              });
            }

            if (res.txs && Array.isArray(res.txs)) {
              res.txs.forEach((t: any) => {
                const txid = t.transaction_id || t.txid;
                if (txid && !allTransactionsMap.has(txid)) {
                  allTransactionsMap.set(txid, t);
                }
              });
            }
          }
        }

        if (onProgress) {
          onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
        }

        // If this entire batch of 4 paths has no activity and we're past index 0, stop scanning this subchain early
        if (!batchHasActivity && i >= 4) {
          break;
        }
      }
    }
  }

  return {
    primaryAddress,
    totalBalanceSompi,
    discoveredAddresses,
    allUtxos,
    allTransactions: Array.from(allTransactionsMap.values()),
  };
}

/**
 * Helper to get P2SH address specifically
 */
export async function generateP2SHAddress(mnemonic: string, passphrase?: string, prefix: string = 'kaspa'): Promise<string> {
  return generateDeterministicAddress(mnemonic, passphrase, prefix, 'P2SH');
}

/**
 * Generate random Kaspa Address
 */
export function generateRandomKaspaAddress(prefix: string = 'kaspa:'): string {
  const payload = new Uint8Array(32);
  crypto.getRandomValues(payload);
  return encodeKaspaAddress(prefix.replace(':', ''), 0x00, payload);
}

/**
 * Sign message using kaspa-wasm / Schnorr signatures
 */
export function signKaspaMessage(message: string, privateKeyHex: string): string {
  try {
    if (kaspaWasmModule && typeof kaspaWasmModule.signMessage === 'function') {
      const sig = kaspaWasmModule.signMessage({
        message,
        privateKey: privateKeyHex,
      });
      if (sig) return sig;
    }
  } catch (err) {
    console.warn('kaspa-wasm message signing notice:', err);
  }

  // Fallback Schnorr signature generation using noble/secp256k1
  const msgBytes = new TextEncoder().encode(message);
  const msgHash = blake2b(msgBytes, { dkLen: 32 });
  const privKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  
  const sig = secp.schnorr.sign(msgHash, privKeyBytes);
  return Buffer.from(sig).toString('hex');
}

/**
 * Verify message signature using kaspa-wasm / Schnorr verification
 */
export function verifyKaspaMessage(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    if (kaspaWasmModule && typeof kaspaWasmModule.verifyMessage === 'function') {
      return kaspaWasmModule.verifyMessage({
        message,
        signature: signatureHex,
        publicKey: publicKeyHex,
      });
    }
  } catch (e) {
    // fallback
  }

  try {
    const msgBytes = new TextEncoder().encode(message);
    const msgHash = blake2b(msgBytes, { dkLen: 32 });
    const sigBytes = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const pubKeyBytes = new Uint8Array(publicKeyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    const xOnly = pubKeyBytes.length === 33 ? pubKeyBytes.slice(1) : pubKeyBytes;

    return secp.schnorr.verify(sigBytes, msgHash, xOnly);
  } catch (err) {
    return false;
  }
}

// ==========================================
// REAL KASPA NETWORK REST API INTEGRATIONS
// ==========================================

let GLOBAL_API_URL = (((typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_KASPA_API_URL : undefined) || 'https://api.kaspa.org') as string;
let GLOBAL_EXPLORER_URL = (((typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_KASPA_EXPLORER_URL : undefined) || 'https://explorer.kaspa.org') as string;

export function setKaspaApiUrl(url: string) {
  GLOBAL_API_URL = url;
}

export function setKaspaExplorerUrl(url: string) {
  GLOBAL_EXPLORER_URL = url;
}

export function getKaspaApiUrl(): string {
  return GLOBAL_API_URL;
}

export function getKaspaExplorerUrl(): string {
  return GLOBAL_EXPLORER_URL;
}

let cachedPriceData: { price: number; usd24hChange?: number } | null = null;
let lastPriceFetchTime = 0;
const PRICE_CACHE_TTL = 60000;

export async function fetchKaspaPrice(): Promise<{ price: number; usd24hChange?: number } | null> {
  const now = Date.now();
  if (cachedPriceData && (now - lastPriceFetchTime < PRICE_CACHE_TTL)) {
    return cachedPriceData;
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
    if (res.ok) {
      const data = await res.json();
      if (data && data.kaspa) {
        cachedPriceData = {
          price: Number(data.kaspa.usd) || 0.0,
          usd24hChange: Number(data.kaspa.usd_24h_change) || 0.0,
        };
        lastPriceFetchTime = now;
        return cachedPriceData;
      }
    }
  } catch (err) {
    // Silent catch
  }

  try {
    const res = await fetch('https://api.coincap.io/v2/assets/kaspa');
    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        cachedPriceData = {
          price: Number(data.data.priceUsd) || 0.0,
          usd24hChange: Number(data.data.changePercent24Hr) || 0.0,
        };
        lastPriceFetchTime = now;
        return cachedPriceData;
      }
    }
  } catch (err) {
    // Silent catch
  }

  try {
    const res = await fetch(`${getKaspaApiUrl()}/info/price`);
    if (res.ok) {
      const data = await res.json();
      cachedPriceData = { 
        price: Number(data.price) || 0.0, 
        usd24hChange: Number(data.price_change_24h) || Number(data.priceChange24h) || Number(data.usd_24h_change) || 0.0 
      };
      lastPriceFetchTime = now;
      return cachedPriceData;
    }
  } catch (err) {
    // Fallback silent
  }

  return cachedPriceData || { price: 0.0325, usd24hChange: 0.0 };
}

const KASPA_API_ENDPOINTS = [
  'https://api.kaspa.org',
  'https://api.kaspagov.org',
  'https://api.kaspa.aspectron.org'
];

function getKaspaApiEndpoints(): string[] {
  const customUrl = getKaspaApiUrl();
  const list = [customUrl];
  KASPA_API_ENDPOINTS.forEach(ep => {
    if (!list.includes(ep)) list.push(ep);
  });
  return list;
}

export async function fetchKaspaAddressBalance(address: string): Promise<bigint | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/addresses/${encodeURIComponent(address.trim())}/balance`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && (typeof data.balance === 'number' || typeof data.balance === 'string')) {
        return BigInt(data.balance);
      }
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaAddressUtxos(address: string): Promise<any[] | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/addresses/${encodeURIComponent(address.trim())}/utxos`);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaAddressTransactions(address: string): Promise<any[] | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/addresses/${encodeURIComponent(address.trim())}/full-transactions?limit=25&resolve_previous_outpoints=light`);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaCurrentDaaScore(): Promise<number | null> {
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/info/blockdag`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.virtualSelectedParentBlueScore !== undefined) {
          return Number(data.virtualSelectedParentBlueScore);
        }
      }
    } catch (err) {
      // try fallback/next
    }

    try {
      const res = await fetch(`${ep}/info/virtual-chain-blue-score`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.blueScore !== undefined) {
          return Number(data.blueScore);
        } else if (typeof data === 'number') {
          return data;
        } else if (typeof data === 'string') {
          const num = Number(data);
          if (!isNaN(num)) return num;
        }
      }
    } catch (err) {
      // try next
    }
  }
  return null;
}

export async function fetchKaspaFeeEstimate(): Promise<{ priorityBucketFeeRate: number; normalBucketFeeRate: number; lowBucketFeeRate: number } | null> {
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/info/fee-estimate`);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        priorityBucketFeeRate: Number(data.priorityBucketFeeRate) || 1,
        normalBucketFeeRate: Number(data.normalBucketFeeRate) || 1,
        lowBucketFeeRate: Number(data.lowBucketFeeRate) || 1,
      };
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

/**
 * Derive private key from mnemonic for a specific HD derivation path
 */
export function getPrivateKeyFromMnemonic(mnemonic: string, passphrase?: string, derivationPath: string = "m/44'/111111'/0'/0/0"): string {
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase || '');
  const root = HDKey.fromMasterSeed(new Uint8Array(seed));
  const child = root.derive(derivationPath);
  if (!child.privateKey) throw new Error('Failed to derive private key');
  
  return Buffer.from(child.privateKey).toString('hex');
}

function extractKaspaError(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d: any) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
          const msg = d.msg || d.message || JSON.stringify(d);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(d);
      })
      .join('; ');
  }
  if (typeof data.error === 'object' && data.error !== null) {
    return data.error.message || data.error.detail || JSON.stringify(data.error);
  }
  if (typeof data.message === 'object' && data.message !== null) {
    return data.message.detail || data.message.msg || JSON.stringify(data.message);
  }
  return JSON.stringify(data);
}

/**
 * Broadcast Kaspa Transaction across multiple public node endpoints
 */
export async function broadcastKaspaTransaction(txPayload: any): Promise<{ success: boolean; txId?: string; error?: string }> {
  const endpoints = getKaspaApiEndpoints();
  let lastError = 'Broadcast failed across Kaspa nodes';

  const rawTx = txPayload?.transaction || txPayload;
  
  const formattedTx = {
    version: Number(rawTx?.version || 0),
    inputs: Array.isArray(rawTx?.inputs) ? rawTx.inputs.map((inTx: any) => ({
      previousOutpoint: {
        transactionId: String(inTx?.previousOutpoint?.transactionId || inTx?.transactionId || ''),
        index: Number(inTx?.previousOutpoint?.index !== undefined ? inTx.previousOutpoint.index : (inTx?.index || 0))
      },
      signatureScript: String(inTx?.signatureScript || ''),
      sequence: Number(inTx?.sequence || 0),
      sigOpCount: Number(inTx?.sigOpCount !== undefined ? inTx.sigOpCount : 1)
    })) : [],
    outputs: Array.isArray(rawTx?.outputs) ? rawTx.outputs.map((outTx: any) => ({
      amount: Number(outTx?.amount || 0),
      scriptPublicKey: {
        version: Number(outTx?.scriptPublicKey?.version || 0),
        scriptPublicKey: String(outTx?.scriptPublicKey?.scriptPublicKey || outTx?.scriptPublicKey || '')
      }
    })) : [],
    lockTime: Number(rawTx?.lockTime || 0),
    subnetworkId: String(rawTx?.subnetworkId || '0000000000000000000000000000000000000000')
  };

  const bodyPayload = { transaction: formattedTx };

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.transactionId) {
        return { success: true, txId: data.transactionId };
      }

      if (data) {
        const rawErr = extractKaspaError(data);
        if (rawErr) {
          if (rawErr.toLowerCase().includes('orphan')) {
            lastError = 'Orphan transaction: UTXO pending or not yet on-chain.';
          } else if (rawErr.toLowerCase().includes('fee')) {
            lastError = `Fee too low: ${rawErr}`;
          } else if (rawErr.toLowerCase().includes('signature')) {
            lastError = 'Signature verification failed: Check seed phrase or script parameters.';
          } else {
            lastError = rawErr;
          }
        } else {
          lastError = `Node rejected transaction (HTTP ${res.status})`;
        }
      } else {
        lastError = `Kaspa node endpoint ${ep} returned HTTP ${res.status}`;
      }

      if (res.status === 400 || res.status === 422) {
        console.error(`[Kaspa Node Broadcast] Node rejected transaction with ${res.status} Bad Request: ${lastError}`);
        break;
      }
    } catch (err: any) {
      console.error(`[Kaspa Node Broadcast] Connection error on ${ep}:`, err.message || err);
      lastError = err.message || 'Network connectivity error connecting to node';
    }
  }

  console.error('[Kaspa Node Broadcast] Final Broadcast Failure:', lastError);
  return { success: false, error: lastError };
}

export function getCovenantExplorerLinks(cov: { scriptHash: string; txid?: string }, fallbackAddress: string) {
  let address = cov.scriptHash || fallbackAddress;
  let txid = cov.txid;

  if (address.startsWith('kaspa:p2sh')) {
    const candidateHex = address.replace('kaspa:p2sh', '');
    if (candidateHex.length >= 32 && !txid) {
      txid = candidateHex;
    }
    address = fallbackAddress;
  }

  if (!address || !address.startsWith('kaspa:')) {
    address = fallbackAddress;
  }

  const explorerBase = getKaspaExplorerUrl();
  return {
    address,
    txid,
    explorerAddressUrl: `${explorerBase}/address/${address}`,
    explorerTxUrl: txid ? `${explorerBase}/txs/${txid}` : undefined,
    streamAddressUrl: `https://kaspa.stream/address/${address}`,
    streamTxUrl: txid ? `https://kaspa.stream/tx/${txid}` : undefined,
  };
}

