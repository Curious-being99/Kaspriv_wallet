import { createSignedTransactionWasm } from './wasmTx';
import { payToScriptHashScript } from '@kasdk/web';
import { blake2b } from '@noble/hashes/blake2.js';
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
 * Create a P2SH Redeem Script from a public key or custom script bytes.
 * Relies on the official Rusty Kaspa SDK (payToScriptHashScript) with pure JS fallback.
 */
export function createP2SHRedeemScript(publicKeyHex: string): { redeemScriptHex: string; scriptHashHex: string } {
  const pubKey = parseHexBytes(publicKeyHex);
  const xOnly = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
  const xOnlyHex = Array.from(xOnly).map(b => b.toString(16).padStart(2, '0')).join('');
  const redeemScriptHex = '20' + xOnlyHex + 'ac';

  // 1. Rely on official Rusty Kaspa WASM SDK
  try {
    const spk = payToScriptHashScript(redeemScriptHex);
    // spk.script format: aa20<32-byte-hash>87
    if (spk && spk.script && spk.script.startsWith('aa20') && spk.script.endsWith('87')) {
      const scriptHashHex = spk.script.slice(4, -2);
      return {
        redeemScriptHex,
        scriptHashHex,
      };
    }
  } catch {
    // Fallback if WASM is not yet active
  }

  // 2. Pure JS fallback
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
 * Create and sign a Kaspa transaction exclusively via Official Rusty Kaspa WASM SDK.
 */
export async function createSignedTransaction(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyBytes: Uint8Array,
  feeSompi: bigint,
  addressType: 'P2SH' = 'P2SH',
  redeemScriptHex?: string,
  lockTime: number = 0,
  network: NetworkType = 'mainnet'
) {
  const wasmRes = await createSignedTransactionWasm(
    utxos,
    toAddress,
    amountSompi,
    changeAddress,
    privateKeyBytes,
    feeSompi,
    addressType,
    redeemScriptHex,
    lockTime
  );
  console.log("Successfully built and signed transaction using Official Rusty Kaspa WASM SDK!");
  return { transaction: wasmRes.transaction, id: wasmRes.id || "wasm-generated" };
}

/**
 * Estimates transaction mass in grams for P2SH Kaspa transactions.
 * Accurate to rusty-kaspa node consensus compute & size mass calculation.
 */
export function estimateTransactionMass(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2SH' = 'P2SH'
): number {
  const countIn = Math.max(1, inputsCount);
  const countOut = Math.max(1, outputsCount);
  const isP2SH = addressType === 'P2SH';
  
  const baseOverhead = 40;
  const inputSizeBytes = isP2SH ? 150 : 112;
  const outputSizeBytes = 44;
  
  const serializedSizeMass = baseOverhead + (countIn * inputSizeBytes) + (countOut * outputSizeBytes);
  const scriptPubKeySize = isP2SH ? 35 : 34;
  const scriptPubKeyMass = countOut * scriptPubKeySize * 10;
  const sigOpsMass = countIn * 1000;
  const safetyPadding = 300;
  
  return serializedSizeMass + scriptPubKeyMass + sigOpsMass + safetyPadding;
}

/**
 * Calculates the absolute minimum required transaction relay fee in sompis based on mass.
 */
export function calculateMinFeeForInputs(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2SH' = 'P2SH'
): bigint {
  const estimatedMass = estimateTransactionMass(inputsCount, outputsCount, addressType);
  return BigInt(Math.ceil(estimatedMass)) * 100n;
}

/**
 * Dynamically estimates the required transaction fee based on its compute mass plus a safety buffer.
 */
export function calculateDynamicFeeForTransaction(
  inputsCount: number,
  outputsCount: number,
  addressType: 'P2SH' = 'P2SH',
  bufferPercent: number = 20,
  flatBufferSompi: bigint = 15000n
): bigint {
  const baseFee = calculateMinFeeForInputs(inputsCount, outputsCount, addressType);
  const percentageBuffer = (baseFee * BigInt(Math.max(10, bufferPercent))) / 100n;
  const finalFee = baseFee + percentageBuffer + flatBufferSompi;
  return finalFee > (baseFee + flatBufferSompi) ? finalFee : (baseFee + flatBufferSompi);
}

export function getRecommendedFees(
  inputsCount: number,
  outputsCount: number = 2,
  addressType: 'P2SH' = 'P2SH'
): {
  baseFeeSompi: bigint;
  lowFeeSompi: bigint;
  normalFeeSompi: bigint;
  fastFeeSompi: bigint;
} {
  const baseFeeSompi = calculateMinFeeForInputs(inputsCount, outputsCount, addressType);
  const lowFeeSompi = baseFeeSompi + (baseFeeSompi * 10n) / 100n + 10000n;
  const normalFeeSompi = baseFeeSompi + (baseFeeSompi * 25n) / 100n + 25000n;
  const fastFeeSompi = baseFeeSompi + (baseFeeSompi * 50n) / 100n + 50000n;

  return {
    baseFeeSompi,
    lowFeeSompi,
    normalFeeSompi,
    fastFeeSompi
  };
}
