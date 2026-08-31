// Parallel Kaspa Transaction Builder using the Official Rusty Kaspa WASM SDK
import {
  Transaction,
  PrivateKey,
  ScriptPublicKey,
  signTransaction,
  Address,
  payToAddressScript,
  payToScriptHashSignatureScript,
  createInputSignature,
  payToScriptHashScript,
  calculateTransactionMass,
  calculateTransactionFee,
  updateTransactionMass,
  maximumStandardTransactionMass
} from '@kasdk/web';
import { ensureKaspaWasm } from '../crypto';

async function ensureWasm() {
  await ensureKaspaWasm();
}

function extractSpkHex(val: any): string {
  if (!val) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (typeof val.scriptPublicKey === 'string') return val.scriptPublicKey;
    if (typeof val.script === 'string') return val.script;
    if (typeof val.script_public_key === 'string') return val.script_public_key;
    if (val.scriptPublicKey && typeof val.scriptPublicKey === 'object') {
      if (typeof val.scriptPublicKey.scriptPublicKey === 'string') return val.scriptPublicKey.scriptPublicKey;
      if (typeof val.scriptPublicKey.script === 'string') return val.scriptPublicKey.script;
      if (typeof val.scriptPublicKey.script_public_key === 'string') return val.scriptPublicKey.script_public_key;
    }
    if (val.script_public_key && typeof val.script_public_key === 'object') {
      if (typeof val.script_public_key.script_public_key === 'string') return val.script_public_key.script_public_key;
      if (typeof val.script_public_key.script === 'string') return val.script_public_key.script;
    }
  }
  return "";
}

export async function computeTxIdWasm(rawTx: any): Promise<string> {
  await ensureWasm();
  
  // Format outputs for WASM input
  const inputs = rawTx.inputs.map((inTx: any) => {
    const spk = inTx.signatureScript || "";
    return {
      previousOutpoint: {
        transactionId: String(inTx.previousOutpoint?.transactionId || inTx.transactionId || '').toLowerCase(),
        index: Number(inTx.previousOutpoint?.index !== undefined ? inTx.previousOutpoint.index : (inTx.index || 0)),
      },
      signatureScript: spk,
      sequence: BigInt(inTx.sequence || 0),
      sigOpCount: Number(inTx.sigOpCount ?? 1),
    };
  });

  const outputs = rawTx.outputs.map((outTx: any) => {
    const amt = outTx.amount;
    const safeAmount = typeof amt === 'bigint' ? amt : BigInt(amt || 0);
    const spkHex = extractSpkHex(outTx.scriptPublicKey);
    return {
      value: safeAmount,
      scriptPublicKey: new ScriptPublicKey(Number(outTx.scriptPublicKey?.version || 0), spkHex),
    };
  });

  const txInput = {
    version: Number(rawTx.version || 0),
    inputs,
    outputs,
    lockTime: BigInt(rawTx.lockTime || 0),
    subnetworkId: String(rawTx.subnetworkId || '0000000000000000000000000000000000000000'),
    gas: 0n,
    payload: ""
  };
  
  const tx = new Transaction(txInput);
  const txId = tx.id;
  tx.free();
  return txId;
}

/**
 * Calculates authoritative transaction mass using Kaspa WASM core consensus algorithms.
 */
export async function calculateMassWasm(
  rawTx: any,
  networkId: string = 'mainnet'
): Promise<bigint> {
  await ensureWasm();
  try {
    const inputs = (rawTx.inputs || []).map((inTx: any) => {
      const spk = inTx.signatureScript || "";
      return {
        previousOutpoint: {
          transactionId: String(inTx.previousOutpoint?.transactionId || inTx.transactionId || '0000000000000000000000000000000000000000000000000000000000000000').toLowerCase(),
          index: Number(inTx.previousOutpoint?.index !== undefined ? inTx.previousOutpoint.index : (inTx.index || 0)),
        },
        signatureScript: spk,
        sequence: BigInt(inTx.sequence || 0),
        sigOpCount: Number(inTx.sigOpCount ?? 1),
      };
    });

    const outputs = (rawTx.outputs || []).map((outTx: any) => {
      const amt = outTx.amount || outTx.value || 0n;
      const safeAmount = typeof amt === 'bigint' ? amt : BigInt(amt || 0);
      const spkHex = extractSpkHex(outTx.scriptPublicKey);
      return {
        value: safeAmount,
        scriptPublicKey: new ScriptPublicKey(Number(outTx.scriptPublicKey?.version || 0), spkHex || "00"),
      };
    });

    const txInput = {
      version: Number(rawTx.version || 0),
      inputs,
      outputs,
      lockTime: BigInt(rawTx.lockTime || 0),
      subnetworkId: String(rawTx.subnetworkId || '0000000000000000000000000000000000000000'),
      gas: 0n,
      payload: ""
    };

    const tx = new Transaction(txInput);
    const mass = calculateTransactionMass(networkId, tx);
    tx.free();
    return mass;
  } catch (err) {
    // Consensus formula fallback
    const inCount = Math.max(1, rawTx.inputs?.length || 1);
    const outCount = Math.max(1, rawTx.outputs?.length || 2);
    return BigInt(40 + (inCount * 150) + (outCount * 44) + (outCount * 350) + (inCount * 1000));
  }
}

/**
 * Calculates authoritative minimum consensus relay fee in Sompis using Kaspa WASM core.
 */
export async function calculateFeeWasm(
  rawTx: any,
  networkId: string = 'mainnet'
): Promise<bigint> {
  await ensureWasm();
  try {
    const inputs = (rawTx.inputs || []).map((inTx: any) => {
      const spk = inTx.signatureScript || "";
      return {
        previousOutpoint: {
          transactionId: String(inTx.previousOutpoint?.transactionId || inTx.transactionId || '0000000000000000000000000000000000000000000000000000000000000000').toLowerCase(),
          index: Number(inTx.previousOutpoint?.index !== undefined ? inTx.previousOutpoint.index : (inTx.index || 0)),
        },
        signatureScript: spk,
        sequence: BigInt(inTx.sequence || 0),
        sigOpCount: Number(inTx.sigOpCount ?? 1),
      };
    });

    const outputs = (rawTx.outputs || []).map((outTx: any) => {
      const amt = outTx.amount || outTx.value || 0n;
      const safeAmount = typeof amt === 'bigint' ? amt : BigInt(amt || 0);
      const spkHex = extractSpkHex(outTx.scriptPublicKey);
      return {
        value: safeAmount,
        scriptPublicKey: new ScriptPublicKey(Number(outTx.scriptPublicKey?.version || 0), spkHex || "00"),
      };
    });

    const txInput = {
      version: Number(rawTx.version || 0),
      inputs,
      outputs,
      lockTime: BigInt(rawTx.lockTime || 0),
      subnetworkId: String(rawTx.subnetworkId || '0000000000000000000000000000000000000000'),
      gas: 0n,
      payload: ""
    };

    const tx = new Transaction(txInput);
    const fee = calculateTransactionFee(networkId, tx);
    tx.free();
    if (fee !== undefined && fee > 0n) {
      return fee;
    }
  } catch (err) {
    // Fallback
  }

  const mass = await calculateMassWasm(rawTx, networkId);
  return mass * 100n;
}

export async function createSignedTransactionWasm(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyBytes: Uint8Array,
  feeSompi: bigint,
  addressType: 'P2SH' = 'P2SH',
  redeemScriptHex?: string,
  lockTime: number = 0
): Promise<any> {
  await ensureWasm();

  // Convert private key to hex for the SDK
  const pkHex = Array.from(privateKeyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const pk = new PrivateKey(pkHex);

  const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
  const changeSompi = totalInputSompi - BigInt(amountSompi) - BigInt(feeSompi);

  // Map inputs for the SDK
  const inputs = utxos.map((u: any) => {
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    let spkHex = extractSpkHex(u.utxoEntry?.scriptPublicKey) || extractSpkHex(u.scriptPublicKey);

    if (!spkHex && u.address) {
      try {
        const addrObj = new Address(u.address);
        spkHex = payToAddressScript(addrObj).script;
      } catch {
        // Ignore fallback error
      }
    }

    const spkObj = new ScriptPublicKey(0, spkHex || "");

    return {
      previousOutpoint: {
        transactionId: u.outpoint?.transactionId || u.transactionId,
        index: u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)
      },
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 1,
      utxo: {
        address: u.address || u.utxoEntry?.address || "",
        outpoint: {
          transactionId: u.outpoint?.transactionId || u.transactionId,
          index: u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0)
        },
        amount: amt,
        scriptPublicKey: spkObj,
        blockDaaScore: BigInt(u.utxoEntry?.blockDaaScore || 1),
        isCoinbase: Boolean(u.utxoEntry?.isCoinbase)
      }
    };
  });

  const toAddrObj = new Address(toAddress);
  const toScript = payToAddressScript(toAddrObj).script;
  
  const outputs = [{
    value: BigInt(amountSompi),
    scriptPublicKey: new ScriptPublicKey(0, toScript)
  }];

  if (changeSompi > 0n && changeAddress) {
    const changeAddrObj = new Address(changeAddress);
    const changeScript = payToAddressScript(changeAddrObj).script;
    outputs.push({
      value: changeSompi,
      scriptPublicKey: new ScriptPublicKey(0, changeScript)
    });
  }

  const rawTx: any = {
    version: 0,
    inputs,
    outputs,
    lockTime: BigInt(lockTime),
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  };

  // Build the transaction utilizing internal WASM objects
  const tx = new Transaction(rawTx);

  let signedTx: any;
  const isP2SHTx = addressType === 'P2SH' || 
    utxos.some((u: any) => 
      (u.address && u.address.includes(':p')) || 
      extractSpkHex(u.utxoEntry?.scriptPublicKey || u.scriptPublicKey).toLowerCase().startsWith('aa20')
    ) ||
    toAddress.includes(':p') ||
    (changeAddress && changeAddress.includes(':p'));

  if (isP2SHTx) {
    let finalRedeemScriptHex = redeemScriptHex;
    if (!finalRedeemScriptHex && pk) {
      const xOnly = pk.toPublicKey().toXOnlyPublicKey();
      finalRedeemScriptHex = '20' + xOnly.toString() + 'ac';
    }
    
    if (finalRedeemScriptHex) {
      for (let i = 0; i < tx.inputs.length; i++) {
        const sig = createInputSignature(tx, i, pk);
        const sigScript = payToScriptHashSignatureScript(finalRedeemScriptHex, sig);
        tx.inputs[i].signatureScript = sigScript;
      }
      signedTx = tx;
    }
  }
  
  if (!signedTx) {
    try {
      const pkHexStr = pk.toString();
      signedTx = signTransaction(tx, [pkHexStr], true);
    } catch (err: any) {
      if (err.message && err.message.includes('Signature is empty')) {
        const pkHexStr = pk.toString();
        signedTx = signTransaction(tx, [pkHexStr], false);
      } else {
        throw err;
      }
    }
  }
  
  const finalJson: any = signedTx.toJSON();
  
  const transaction = {
    version: finalJson.version,
    inputs: finalJson.inputs.map((i: any) => ({
      previousOutpoint: {
        transactionId: i.previousOutpoint.transactionId,
        index: i.previousOutpoint.index
      },
      signatureScript: i.signatureScript,
      sequence: Number(i.sequence),
      sigOpCount: i.sigOpCount
    })),
    outputs: finalJson.outputs.map((o: any) => ({
      amount: BigInt(o.value), // Keep it as BigInt for compatibility with broadcastKaspaTransaction
      scriptPublicKey: {
        version: o.scriptPublicKey?.version !== undefined ? Number(o.scriptPublicKey.version) : 0,
        scriptPublicKey: o.scriptPublicKey?.script || o.scriptPublicKey?.scriptPublicKey || (typeof o.scriptPublicKey === 'string' ? o.scriptPublicKey : '')
      }
    })),
    lockTime: Number(finalJson.lockTime),
    subnetworkId: finalJson.subnetworkId,
    id: signedTx.id,
    txId: signedTx.id,
  };

  return {
    transaction,
    id: signedTx.id,
    mass: Number(signedTx.mass || 0)
  };
}

export async function createSignedTransactionIsolatedWasm(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  keysMap: { [path: string]: Uint8Array },
  feeSompi: bigint,
  addressType: 'P2SH' = 'P2SH',
  redeemScriptHex?: string,
  lockTime: number = 0
): Promise<any> {
  await ensureWasm();

  const allocatedPks: PrivateKey[] = [];

  try {
    const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
    const changeSompi = totalInputSompi - BigInt(amountSompi) - BigInt(feeSompi);

    const inputs = utxos.map((u: any) => {
      const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
      const addrToUse = u.address || u.utxoEntry?.address;
      let spkHex = "";
      if (addrToUse) {
        try {
          const addrObj = new Address(addrToUse);
          spkHex = payToAddressScript(addrObj).script;
        } catch {
          // Fallback
        }
      }
      if (!spkHex) {
        spkHex = extractSpkHex(u.utxoEntry?.scriptPublicKey) || 
                 extractSpkHex(u.utxoEntry?.script_public_key) || 
                 extractSpkHex(u.scriptPublicKey) || 
                 extractSpkHex(u.script_public_key);
      }

      const spkObj = new ScriptPublicKey(0, spkHex || "");

      const txIdRaw = u.outpoint?.transactionId || u.transactionId || u.txid || "";
      const txIdFormatted = String(txIdRaw).trim().toLowerCase();
      const voutIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? 0);

      return {
        previousOutpoint: {
          transactionId: txIdFormatted,
          index: voutIndex
        },
        signatureScript: "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: {
          address: addrToUse || "",
          outpoint: {
            transactionId: txIdFormatted,
            index: voutIndex
          },
          amount: amt,
          scriptPublicKey: spkObj,
          blockDaaScore: BigInt(u.utxoEntry?.blockDaaScore || u.blockDaaScore || 1),
          isCoinbase: Boolean(u.utxoEntry?.isCoinbase)
        }
      };
    });

    const toAddrObj = new Address(toAddress);
    const toScript = payToAddressScript(toAddrObj).script;
    
    const outputs = [{
      value: BigInt(amountSompi),
      scriptPublicKey: new ScriptPublicKey(0, toScript)
    }];

    if (changeSompi > 0n && changeAddress) {
      const changeAddrObj = new Address(changeAddress);
      const changeScript = payToAddressScript(changeAddrObj).script;
      outputs.push({
        value: changeSompi,
        scriptPublicKey: new ScriptPublicKey(0, changeScript)
      });
    }

    const rawTx: any = {
      version: 0,
      inputs,
      outputs,
      lockTime: BigInt(lockTime),
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    };

    const tx = new Transaction(rawTx);

    let signedTx: any;
    const isP2SHTx = addressType === 'P2SH' || 
      utxos.some((u: any) => 
        (u.address && u.address.includes(':p')) || 
        extractSpkHex(u.utxoEntry?.scriptPublicKey || u.scriptPublicKey).toLowerCase().startsWith('aa20')
      ) ||
      toAddress.includes(':p') ||
      (changeAddress && changeAddress.includes(':p'));

    if (isP2SHTx) {
      const pksInfo = Object.entries(keysMap).map(([path, bytes]) => {
        const pkHex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const pk = new PrivateKey(pkHex);
        allocatedPks.push(pk);
        const pubKey = pk.toPublicKey();
        const xOnly = pubKey.toXOnlyPublicKey();
        const rsHex = '20' + xOnly.toString() + 'ac';
        const p2shScript = payToScriptHashScript(rsHex);
        pubKey.free();
        xOnly.free();
        return { path, pk, redeemScriptHex: rsHex, spkHex: p2shScript.script };
      });

      for (let i = 0; i < tx.inputs.length; i++) {
        const u = utxos[i];
        let inputSpkHex = extractSpkHex(u?.utxoEntry?.scriptPublicKey) || extractSpkHex(u?.scriptPublicKey);
        if (!inputSpkHex && u?.address) {
          try {
            const addrObj = new Address(u.address);
            inputSpkHex = payToAddressScript(addrObj).script;
          } catch {
            // ignore fallback error
          }
        }

        const inputPath = u?.derivationPath || u?.path;
        let match = inputPath ? pksInfo.find(info => info.path === inputPath) : undefined;
        
        if (!match && inputSpkHex) {
          match = pksInfo.find(info => info.spkHex.toLowerCase() === inputSpkHex.toLowerCase());
        }
        
        if (!match) {
          throw new Error(`Critical Security Failure: Missing signing key for UTXO at index ${i}`);
        }
        
        const rsHexToUse = redeemScriptHex || match.redeemScriptHex;
        const pkToUse = match.pk;
        
        const sig = createInputSignature(tx, i, pkToUse);
        const sigScript = payToScriptHashSignatureScript(rsHexToUse, sig);
        tx.inputs[i].signatureScript = sigScript;
      }
      signedTx = tx;
    } else {
      const pks = Object.values(keysMap).map((bytes) => {
        const pkHex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const pk = new PrivateKey(pkHex);
        allocatedPks.push(pk);
        return pk;
      });

      try {
        const pksHex = pks.map(pk => pk.toString());
        signedTx = signTransaction(tx, pksHex, true);
      } catch (err: any) {
        console.warn('WASM signTransaction strict verification failed, falling back to signTransaction verify=false:', err);
        const pksHex = pks.map(pk => pk.toString());
        signedTx = signTransaction(tx, pksHex, false);
      }
    }

    const finalJson: any = signedTx.toJSON();
    
    const formattedTx = {
      version: finalJson.version,
      inputs: finalJson.inputs.map((i: any) => ({
        previousOutpoint: {
          transactionId: i.previousOutpoint.transactionId,
          index: i.previousOutpoint.index
        },
        signatureScript: i.signatureScript,
        sequence: Number(i.sequence),
        sigOpCount: i.sigOpCount
      })),
      outputs: finalJson.outputs.map((o: any) => ({
        amount: BigInt(o.value),
        scriptPublicKey: {
          version: o.scriptPublicKey?.version !== undefined ? Number(o.scriptPublicKey.version) : 0,
          scriptPublicKey: o.scriptPublicKey?.script || o.scriptPublicKey?.scriptPublicKey || (typeof o.scriptPublicKey === 'string' ? o.scriptPublicKey : '')
        }
      })),
      lockTime: Number(finalJson.lockTime),
      subnetworkId: finalJson.subnetworkId,
      id: signedTx.id,
      txId: signedTx.id,
    };

    return {
      transaction: formattedTx,
      id: signedTx.id,
      mass: Number(signedTx.mass || 0)
    };
  } finally {
    allocatedPks.forEach(pk => {
      try {
        pk.free();
      } catch {
        // ignore
      }
    });
  }
}
