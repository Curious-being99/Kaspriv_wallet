import { blake2b } from '@noble/hashes/blake2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import { safeStringify } from '../json';
import { wipe, kaspaWasmModule, ensureKaspaRuntime } from './common';
import { addressToScriptPublicKey } from './address';
import { createP2SHRedeemScript } from './covenant';

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
  lockTime?: number
): Promise<any> {
  await ensureKaspaRuntime();

  // Try WASM first if available
  if (kaspaWasmModule && typeof kaspaWasmModule.createTransaction === 'function') {
    try {
      const formattedUtxos = utxos.map(u => ({
        address: u.address || changeAddress || toAddress,
        outpoint: {
          transactionId: u.outpoint?.transactionId || u.transactionId,
          index: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0))
        },
        utxoEntry: {
          amount: BigInt(u.utxoEntry?.amount || u.amount || 0),
          scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.utxoEntry?.scriptPublicKey || addressToScriptPublicKey(u.address || changeAddress || toAddress),
          blockDaaScore: BigInt(u.utxoEntry?.blockDaaScore || u.blockdaaScore || u.blockDaaScore || 0),
          isCoinbase: Boolean(u.utxoEntry?.isCoinbase || u.isCoinbase || false)
        }
      }));

      const outputs = [{ address: toAddress, amount: BigInt(amountSompi) }];
      const mtx = kaspaWasmModule.createTransaction(
        formattedUtxos,
        outputs,
        changeAddress || toAddress,
        BigInt(feeSompi),
        "",
        BigInt(addressType === 'P2SH' ? 2 : 1),
        1n
      );

      return { type: 'wasm', mtx, utxos: formattedUtxos, toAddress, amountSompi, changeAddress, feeSompi, addressType, redeemScriptHex, lockTime };
    } catch (err) {
      console.warn('kaspa-wasm build failed, falling back to manual:', err);
    }
  }

  // Manual construction
  const inputs: any[] = utxos.map(u => ({
    previousOutpoint: {
      transactionId: u.outpoint?.transactionId || u.transactionId || '0000000000000000000000000000000000000000000000000000000000000000',
      index: Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)),
    },
    signatureScript: '',
    sequence: 0,
    sigOpCount: 1,
    utxo: u // Keep reference for signing
  }));

  const outputs = [{
    amount: Number(amountSompi),
    scriptPublicKey: { scriptPublicKey: addressToScriptPublicKey(toAddress), version: 0 }
  }];

  const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
  const changeSompi = totalInputSompi - amountSompi - feeSompi;
  if (changeSompi > 0n && changeAddress) {
    outputs.push({
      amount: Number(changeSompi),
      scriptPublicKey: { scriptPublicKey: addressToScriptPublicKey(changeAddress), version: 0 }
    });
  }

  return { type: 'manual', inputs, outputs, utxos, lockTime: lockTime || 0, addressType, redeemScriptHex };
}

/**
 * Internal helper to sign a transaction structure with raw private key bytes.
 */
export async function signTransactionWithPrivateKeyBytes(
  txData: any,
  privateKeyBytes: Uint8Array
): Promise<any> {
  if (kaspaWasmModule && txData.type === 'wasm') {
    const privateKeyObj = new kaspaWasmModule.PrivateKey(privateKeyBytes);
    try {
      const signedMtx = kaspaWasmModule.signTransaction(txData.mtx, [privateKeyObj], true);
      
      if (signedMtx) {
        const jsonStr = typeof signedMtx.toJSON === 'function' ? signedMtx.toJSON() : safeStringify(signedMtx);
        const txObj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        return (txObj.tx || txObj);
      }
      throw new Error('Security failure: kaspa-wasm signing failed to produce a valid signed transaction.');
    } finally {
      if (typeof privateKeyObj.free === 'function') {
        privateKeyObj.free();
      }
    }
  }

  if (txData.type === 'wasm') {
    throw new Error('Security failure: Transaction was prepared for WASM signing but the WASM module is unavailable.');
  }

  // Manual signing logic for non-WASM data types
  const SIGHASH_KEY = new TextEncoder().encode("TransactionSigningHash");
  const hashBlake2bKeyed = (data: Uint8Array) => blake2b(data, { key: SIGHASH_KEY, dkLen: 32 });
  const writeUint16LE = (val: number) => { const b = new Uint8Array(2); b[0] = val & 0xff; b[1] = (val >> 8) & 0xff; return b; };
  const writeUint32LE = (val: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, val, true); return b; };
  const writeUint64LE = (val: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(val), true); return b; };
  const hexToBytes = (hex: string) => {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const matches = clean.match(/.{1,2}/g);
    return matches ? new Uint8Array(matches.map(b => parseInt(b, 16))) : new Uint8Array(0);
  };

  const pubKeyBytes = secp.schnorr.getPublicKey(privateKeyBytes);
  const pubKeyHex = Buffer.from(pubKeyBytes).toString('hex');

  const outpointParts: Uint8Array[] = [];
  const seqParts: Uint8Array[] = [];
  const sigOpCountParts: Uint8Array[] = [];
  txData.inputs.forEach((input: any) => {
    outpointParts.push(hexToBytes(input.previousOutpoint.transactionId));
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
    const spkBytes = hexToBytes(out.scriptPublicKey.scriptPublicKey);
    outputParts.push(writeUint64LE(amt));
    outputParts.push(writeUint16LE(0));
    outputParts.push(writeUint64LE(BigInt(spkBytes.length)));
    outputParts.push(spkBytes);
  });
  const outputsHash = hashBlake2bKeyed(concatBytes(...outputParts));
  const payloadHash = new Uint8Array(32);
  const subnetworkIdBytes = new Uint8Array(20);

  txData.inputs.forEach((input: any, i: number) => {
    const u = input.utxo;
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    const spkHex = u.utxoEntry?.scriptPublicKey?.scriptPublicKey || (typeof u.utxoEntry?.scriptPublicKey === 'string' ? u.utxoEntry.scriptPublicKey : null) || u.scriptPublicKey || addressToScriptPublicKey(u.address);
    const scriptForSighashBytes = hexToBytes(spkHex);

    const preimage = concatBytes(
      writeUint16LE(0),
      previousOutpointsHash,
      sequencesHash,
      sigOpCountsHash,
      hexToBytes(input.previousOutpoint.transactionId),
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
    const rawSig = secp.schnorr.sign(sigHash, privateKeyBytes);
    const sigWithSighash = `${Buffer.from(rawSig).toString('hex')}01`;

    const isInputP2SH = txData.addressType === 'P2SH' || Boolean(u.address && u.address.includes(':p')) || Boolean(spkHex && spkHex.startsWith('aa20'));

    if (isInputP2SH) {
      const inputRedeemScript = txData.redeemScriptHex || createP2SHRedeemScript(pubKeyHex).redeemScriptHex;
      const pushRedeemScript = (()=>{
        const bytes = hexToBytes(inputRedeemScript);
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
  lockTime?: number
): Promise<{
  transaction: any;
}> {
  if (!(privateKeyBytes instanceof Uint8Array)) {
    throw new TypeError('Private key must be provided as Uint8Array');
  }

  if (privateKeyBytes.length !== 32) {
    throw new Error('Invalid private-key length');
  }

  const privateKeyCopy = new Uint8Array(privateKeyBytes);

  try {
    const transaction = await buildKaspaTransaction(
      utxos,
      toAddress,
      amountSompi,
      changeAddress,
      feeSompi,
      addressType,
      redeemScriptHex,
      lockTime
    );

    const signedTransaction = await signTransactionWithPrivateKeyBytes(
      transaction,
      privateKeyCopy
    );

    return {
      transaction: signedTransaction
    };
  } finally {
    wipe(privateKeyCopy);
  }
}
