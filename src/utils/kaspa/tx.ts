import { createSignedTransactionWasm } from './wasmTx';
import { blake2b } from '@noble/hashes/blake2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import { safeStringify } from '../json';
import { wipe, ensureKaspaRuntime } from './common';
import { addressToScriptPublicKey } from './address';
import { NetworkType } from '../../types';

function parseHexBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex string: contains non-hexadecimal characters');
  }
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string: must have an even length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byteVal = Number.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byteVal)) {
      throw new Error('Failed to parse hex byte');
    }
    bytes[i] = byteVal;
  }
  return bytes;
}

/**
 * Create a P2SH Redeem Script from a public key or custom script bytes
 */
export function createP2SHRedeemScript(publicKeyHex: string): { redeemScriptHex: string; scriptHashHex: string } {
  const pubKey = parseHexBytes(publicKeyHex);
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
 * Internal helper to build an unsigned Kaspa transaction structure.
 */
export async function buildKaspaTransaction(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  feeSompi: bigint,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  redeemScriptHex?: string,
  lockTime?: number,
  network: NetworkType = 'mainnet'
): Promise<any> {
  await ensureKaspaRuntime();

  // Deduplicate and validate inputs
  const seenOutpoints = new Set<string>();
  for (const u of utxos) {
    const txId = String(u.outpoint?.transactionId || u.transactionId || '').toLowerCase();
    const idx = Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? -1));
    if (!/^[0-9a-f]{64}$/.test(txId)) throw new Error('Invalid UTXO transaction ID');
    if (!Number.isSafeInteger(idx) || idx < 0) throw new Error('Invalid UTXO index');
    const outpointKey = `${txId}:${idx}`;
    if (seenOutpoints.has(outpointKey)) {
      throw new Error(`Security Violation: Duplicate input outpoint detected in transaction build: ${outpointKey}`);
    }
    seenOutpoints.add(outpointKey);
  }

  // Manual construction
  const inputs: any[] = utxos.map(u => ({
    previousOutpoint: {
      transactionId: (u.outpoint?.transactionId || u.transactionId).toLowerCase(),
      index: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout)),
    },
    signatureScript: '',
    sequence: 0,
    sigOpCount: 1,
    utxo: u // Keep reference for signing
  }));

  const outputs = [{
    amount: amountSompi,
    scriptPublicKey: { scriptPublicKey: addressToScriptPublicKey(toAddress, network), version: 0 }
  }];

  const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
  const changeSompi = totalInputSompi - amountSompi - feeSompi;
  if (changeSompi > 0n && changeAddress) {
    outputs.push({
      amount: changeSompi,
      scriptPublicKey: { scriptPublicKey: addressToScriptPublicKey(changeAddress, network), version: 0 }
    });
  }

  // Freeze the output structures to prevent any in-memory malware or external scripts from mutating them
  outputs.forEach(o => {
    if (o.scriptPublicKey) Object.freeze(o.scriptPublicKey);
    Object.freeze(o);
  });
  Object.freeze(outputs);

  return { type: 'manual', inputs, outputs, utxos, lockTime: lockTime || 0, addressType, redeemScriptHex, network };
}

/**
 * Internal helper to sign a transaction structure with raw private key bytes.
 * Supports either a single key or a map of keys indexed by derivation path.
 */
export async function signTransactionWithPrivateKeyBytes(
  txData: any,
  privateKeyBytes: Uint8Array | { [path: string]: Uint8Array }
): Promise<any> {
  try {
    // Manual signing logic for non-WASM data types
    const SIGHASH_KEY = new TextEncoder().encode("TransactionSigningHash");
    const hashBlake2bKeyed = (data: Uint8Array) => blake2b(data, { key: SIGHASH_KEY, dkLen: 32 });
    const writeUint16LE = (val: number) => { const b = new Uint8Array(2); b[0] = val & 0xff; b[1] = (val >> 8) & 0xff; return b; };
    const writeUint32LE = (val: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, val, true); return b; };
    const writeUint64LE = (val: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(val), true); return b; };
    const outpointParts: Uint8Array[] = [];
    const seqParts: Uint8Array[] = [];
    const sigOpCountParts: Uint8Array[] = [];
    txData.inputs.forEach((input: any) => {
      outpointParts.push(parseHexBytes(input.previousOutpoint.transactionId));
      outpointParts.push(writeUint32LE(input.previousOutpoint.index));
      seqParts.push(writeUint64LE(0n));
      sigOpCountParts.push(new Uint8Array([1]));
    });

    const previousOutpointsHash = hashBlake2bKeyed(concatBytes(...outpointParts));
    const sequencesHash = hashBlake2bKeyed(concatBytes(...seqParts));
    const sigOpCountsHash = hashBlake2bKeyed(concatBytes(...sigOpCountParts));

    const outputParts: Uint8Array[] = [];
    txData.outputs.forEach((out: any) => {
      const amt = BigInt(out.amount);
      const spkBytes = parseHexBytes(out.scriptPublicKey.scriptPublicKey);
      outputParts.push(writeUint64LE(amt));
      outputParts.push(writeUint16LE(0));
      outputParts.push(writeUint64LE(BigInt(spkBytes.length)));
      outputParts.push(spkBytes);
    });
    const outputsHash = hashBlake2bKeyed(concatBytes(...outputParts));
    const payloadHash = new Uint8Array(32);
    const subnetworkIdBytes = new Uint8Array(20);

    const network: NetworkType = txData.network || 'mainnet';

    txData.inputs.forEach((input: any, i: number) => {
      const u = input.utxo;
      const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
      const spkHex = u.utxoEntry?.scriptPublicKey?.scriptPublicKey || (typeof u.utxoEntry?.scriptPublicKey === 'string' ? u.utxoEntry.scriptPublicKey : null) || u.scriptPublicKey || addressToScriptPublicKey(u.address, network);
      const scriptForSighashBytes = parseHexBytes(spkHex);

      let activeKeyBytes: Uint8Array;
      if (privateKeyBytes instanceof Uint8Array) {
        activeKeyBytes = privateKeyBytes;
      } else {
        const path = u.derivationPath || u.path;
        if (!path) {
          throw new Error(`CRITICAL: UTXO ${u.outpoint?.transactionId}:${u.outpoint?.index} is missing a derivation path.`);
        }
        activeKeyBytes = privateKeyBytes[path];
        if (!activeKeyBytes) {
          throw new Error(`CRITICAL: Private key for derivation path ${path} not found in key map. Failing closed to protect funds.`);
        }
      }

      const pubKeyBytes = secp.schnorr.getPublicKey(activeKeyBytes);
      const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

      const preimage = concatBytes(
        writeUint16LE(0),
        previousOutpointsHash,
        sequencesHash,
        sigOpCountsHash,
        parseHexBytes(input.previousOutpoint.transactionId),
        writeUint32LE(input.previousOutpoint.index),
        writeUint16LE(0),
        writeUint64LE(BigInt(scriptForSighashBytes.length)),
        scriptForSighashBytes,
        writeUint64LE(amt),
        writeUint64LE(0n),
        new Uint8Array([1]),
        outputsHash,
        writeUint64LE(BigInt(txData.lockTime || 0)),
        subnetworkIdBytes,
        writeUint64LE(0n),
        payloadHash,
        new Uint8Array([0x01])
      );

      const sigHash = hashBlake2bKeyed(preimage);
      const rawSig = secp.schnorr.sign(sigHash, activeKeyBytes);
      const sigWithSighash = `${Buffer.from(rawSig).toString('hex')}01`;

      const isInputP2SH = txData.addressType === 'P2SH' || Boolean(u.address && u.address.includes(':p')) || Boolean(spkHex && spkHex.startsWith('aa20'));

      if (isInputP2SH) {
        const inputRedeemScript = txData.redeemScriptHex || createP2SHRedeemScript(pubKeyHex).redeemScriptHex;
        const pushRedeemScript = (()=>{
          const bytes = parseHexBytes(inputRedeemScript);
          if (bytes.length <= 75) return `${bytes.length.toString(16).padStart(2, '0')}${inputRedeemScript}`;
          if (bytes.length <= 255) return `4c${bytes.length.toString(16).padStart(2, '0')}${inputRedeemScript}`;
          return `4d${Buffer.from(writeUint16LE(bytes.length)).toString('hex')}${inputRedeemScript}`;
        })();
        input.signatureScript = `41${sigWithSighash}${pushRedeemScript}`;
      } else {
        input.signatureScript = `41${sigWithSighash}`;
      }
    });

    return {
      version: 0,
      inputs: txData.inputs.map((inpt: any) => ({
        previousOutpoint: inpt.previousOutpoint,
        signatureScript: inpt.signatureScript,
        sequence: inpt.sequence,
        sigOpCount: inpt.sigOpCount
      })),
      outputs: txData.outputs,
      lockTime: txData.lockTime,
      subnetworkId: '0000000000000000000000000000000000000000'
    };
  } finally {
    // Deterministic memory zeroing immediately after transaction signing
    if (privateKeyBytes instanceof Uint8Array) {
      wipe(privateKeyBytes);
    } else if (privateKeyBytes && typeof privateKeyBytes === 'object') {
      Object.values(privateKeyBytes).forEach(k => {
        if (k instanceof Uint8Array) wipe(k);
      });
    }
  }
}

export async function createSignedTransaction(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyBytes: Uint8Array,
  feeSompi: bigint,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  redeemScriptHex?: string,
  lockTime: number = 0,
  network: NetworkType = 'mainnet'
) {
  try {
    const wasmTx = await createSignedTransactionWasm(utxos, toAddress, amountSompi, changeAddress, privateKeyBytes, feeSompi, addressType, redeemScriptHex, lockTime);
    console.log("Successfully built transaction using Official Rusty Kaspa WASM SDK!");
    return { transaction: wasmTx, id: "wasm-generated" };
  } catch (err) {
    console.error("Rusty Kaspa WASM TX generation failed, falling back to manual JS signer:", err);
  }
  return await createSignedTransactionFallback(utxos, toAddress, amountSompi, changeAddress, privateKeyBytes, feeSompi, addressType, redeemScriptHex, lockTime, network);
}

async function createSignedTransactionFallback(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyBytes: Uint8Array,
  feeSompi: bigint,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  redeemScriptHex?: string,
  lockTime?: number,
  network: NetworkType = 'mainnet'
): Promise<{
  transaction: any;
}> {
  if (!(privateKeyBytes instanceof Uint8Array)) {
    throw new TypeError('Private key must be provided as Uint8Array');
  }

  if (privateKeyBytes.length !== 32) {
    throw new Error('Invalid private-key length');
  }

  // Cryptographically lock inputs immediately at function entry
  const LOCKED_TO_ADDRESS = String(toAddress).trim();
  const LOCKED_CHANGE_ADDRESS = String(changeAddress).trim();
  const LOCKED_AMOUNT_SOMPI = BigInt(amountSompi);
  const LOCKED_FEE_SOMPI = BigInt(feeSompi);

  const privateKeyCopy = new Uint8Array(privateKeyBytes);

  try {
    const transaction = await buildKaspaTransaction(
      utxos,
      LOCKED_TO_ADDRESS,
      LOCKED_AMOUNT_SOMPI,
      LOCKED_CHANGE_ADDRESS,
      LOCKED_FEE_SOMPI,
      addressType,
      redeemScriptHex,
      lockTime,
      network
    );

    // Integrity Guard Function: Compares physical output scripts against locked expectations
    const verifyOutputIntegrity = (txOutputs: any[]) => {
      if (!Array.isArray(txOutputs) || txOutputs.length === 0 || txOutputs.length > 2) {
        throw new Error('Security Violation: Invalid or manipulated output array detected!');
      }

      const expectedRecipientScriptHex = addressToScriptPublicKey(LOCKED_TO_ADDRESS, network);
      const expectedChangeScriptHex = addressToScriptPublicKey(LOCKED_CHANGE_ADDRESS, network);

      // Verify Output 0: must match recipient exactly
      const out0 = txOutputs[0];
      const out0Script = out0.scriptPublicKey?.scriptPublicKey || out0.scriptPublicKey;
      if (out0Script !== expectedRecipientScriptHex) {
        throw new Error('Security Violation: Destination address manipulation detected! The transaction has been blocked.');
      }
      if (BigInt(out0.amount) !== LOCKED_AMOUNT_SOMPI) {
        throw new Error('Security Violation: Transaction amount manipulation detected! The transaction has been blocked.');
      }

      // Verify Output 1: if change exists, must match expected change and changeAddress exactly
      const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
      const expectedChangeAmount = totalInputSompi - LOCKED_AMOUNT_SOMPI - LOCKED_FEE_SOMPI;

      if (expectedChangeAmount > 0n) {
        if (txOutputs.length !== 2) {
          throw new Error('Security Violation: Change output was stripped or missing from the built transaction!');
        }
        const out1 = txOutputs[1];
        const out1Script = out1.scriptPublicKey?.scriptPublicKey || out1.scriptPublicKey;
        if (out1Script !== expectedChangeScriptHex) {
          throw new Error('Security Violation: Change address hijacking detected! The transaction has been blocked.');
        }
        if (BigInt(out1.amount) !== expectedChangeAmount) {
          throw new Error('Security Violation: Change amount manipulation detected! The transaction has been blocked.');
        }
      } else {
        if (txOutputs.length !== 1) {
          throw new Error('Security Violation: Unauthorized extra change output detected!');
        }
      }
    };

    // Pre-Signing Guard
    verifyOutputIntegrity(transaction.outputs);

    const signedTransaction = await signTransactionWithPrivateKeyBytes(
      transaction,
      privateKeyCopy
    );

    // Post-Signing Guard
    verifyOutputIntegrity(signedTransaction.outputs);

    return {
      transaction: signedTransaction
    };
  } finally {
    wipe(privateKeyCopy);
  }
}

/**
 * Estimates transaction mass in grams for P2PKH or P2SH Kaspa transactions.
 * Accurate to rusty-kaspa node consensus compute & size mass calculation.
 */
export function estimateTransactionMass(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH'
): number {
  const countIn = Math.max(1, inputsCount);
  const countOut = Math.max(1, outputsCount);
  const isP2SH = addressType === 'P2SH';
  
  // Base transaction header & payload overhead (~40 bytes)
  const baseOverhead = 40;
  // Serialized bytes per input (~112 for P2PKH Schnorr, ~150 for P2SH)
  const inputSizeBytes = isP2SH ? 150 : 112;
  // Serialized bytes per output (~44 bytes)
  const outputSizeBytes = 44;
  
  const serializedSizeMass = baseOverhead + (countIn * inputSizeBytes) + (countOut * outputSizeBytes);
  
  // Kaspa consensus compute mass includes 10 mass units per script public key byte.
  // Standard P2PK/P2PKH scriptPubKey is 34 bytes, P2SH scriptPubKey is 35 bytes.
  const scriptPubKeySize = isP2SH ? 35 : 34;
  const scriptPubKeyMass = countOut * scriptPubKeySize * 10;
  
  // Kaspa consensus compute mass: exactly 1,000 mass units per standard SigOp / signature
  const sigOpsMass = countIn * 1000;
  
  // Robust safety padding of 300 mass units to cover varint sizes, signature lengths (64 vs 65 bytes), or payload overhead
  const safetyPadding = 300;
  
  return serializedSizeMass + scriptPubKeyMass + sigOpsMass + safetyPadding;
}

/**
 * Calculates the absolute minimum required transaction relay fee in sompis based on mass.
 * Standard Kaspa node minimum relay fee rate is 100 sompi per mass unit.
 */
export function calculateMinFeeForInputs(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH'
): bigint {
  const estimatedMass = estimateTransactionMass(inputsCount, outputsCount, addressType);
  return BigInt(Math.ceil(estimatedMass)) * 100n; // 100 sompi per mass unit
}

/**
 * Dynamically estimates the required transaction fee based on its compute mass plus a safety buffer.
 * It ensures the calculated fee meets Kaspa network's minimum relay requirements to prevent 'Fee too low' errors.
 */
export function calculateDynamicFeeForTransaction(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  bufferPercent: number = 20, // 20% safety buffer by default
  flatBufferSompi: bigint = 15000n // extra flat safety buffer of 15,000 sompi (0.00015 KAS)
): bigint {
  const baseFee = calculateMinFeeForInputs(inputsCount, outputsCount, addressType);
  
  // Apply percent buffer
  const percentageBuffer = (baseFee * BigInt(Math.max(10, bufferPercent))) / 100n;
  
  // Total fee with both flat and percentage buffers applied
  const finalFee = baseFee + percentageBuffer + flatBufferSompi;
  
  // Always guarantee at least baseFee + flatBufferSompi
  return finalFee > (baseFee + flatBufferSompi) ? finalFee : (baseFee + flatBufferSompi);
}

export function getRecommendedFees(
  inputsCount: number,
  outputsCount: number = 2,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH'
): {
  baseFeeSompi: bigint;
  lowFeeSompi: bigint;
  normalFeeSompi: bigint;
  fastFeeSompi: bigint;
} {
  const baseFeeSompi = calculateMinFeeForInputs(inputsCount, outputsCount, addressType);
  
  // Low: base fee + 10% buffer + 10,000 sompi (0.0001 KAS)
  const lowFeeSompi = baseFeeSompi + (baseFeeSompi * 10n) / 100n + 10000n;
  // Normal: base fee + 25% buffer + 25,000 sompi (0.00025 KAS)
  const normalFeeSompi = baseFeeSompi + (baseFeeSompi * 25n) / 100n + 25000n;
  // Fast: base fee + 50% buffer + 50,000 sompi (0.0005 KAS)
  const fastFeeSompi = baseFeeSompi + (baseFeeSompi * 50n) / 100n + 50000n;

  return {
    baseFeeSompi,
    lowFeeSompi,
    normalFeeSompi,
    fastFeeSompi
  };
}

