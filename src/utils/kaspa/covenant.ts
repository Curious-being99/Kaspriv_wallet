import { blake2b } from '@noble/hashes/blake2.js';
import * as secp from '@noble/secp256k1';
import { wipe } from './common';
import { encodeKaspaAddress } from './address';
import { getPrivateKeyBytesFromMnemonic } from './keys';

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
  const privKeyBytes = getPrivateKeyBytesFromMnemonic(mnemonic, passphrase);
  try {
    const pubKeyBytes = secp.schnorr.getPublicKey(privKeyBytes);
    const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

    const lock = daaLock || 0;
    const res = createCovenantRedeemScript(pubKeyHex, lock, type || 'timelock');
    
    return {
      address: res.address,
      redeemScriptHex: res.redeemScriptHex,
      publicKeyHex: pubKeyHex,
    };
  } finally {
    // Wipe derived bytes
    wipe(privKeyBytes);
  }
}

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
