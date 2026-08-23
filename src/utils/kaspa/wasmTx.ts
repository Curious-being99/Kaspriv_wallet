// Parallel Kaspa Transaction Builder using the Official Rusty Kaspa WASM SDK
import initKaspaWasm, { Transaction, PrivateKey, ScriptPublicKey, signTransaction, Address, payToAddressScript } from '@kasdk/web';
import wasmUrl from '@kasdk/web/kaspa_bg.wasm?url';

let wasmInitialized = false;
async function ensureWasm() {
  if (!wasmInitialized) {
    try {
      await initKaspaWasm({ module_or_path: wasmUrl }); // Initialize the WASM module
    } catch (e) {
      // Ignore if already initialized
    }
    wasmInitialized = true;
  }
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
    const spkHex = outTx.scriptPublicKey?.scriptPublicKey || outTx.scriptPublicKey;
    return {
      value: safeAmount,
      scriptPublicKey: new ScriptPublicKey(0, spkHex),
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

export async function createSignedTransactionWasm(
  utxos: any[],
  toAddress: string,
  amountSompi: bigint,
  changeAddress: string,
  privateKeyBytes: Uint8Array,
  feeSompi: bigint,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
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
    const spkHex = u.utxoEntry?.scriptPublicKey?.scriptPublicKey || 
                   (typeof u.utxoEntry?.scriptPublicKey === 'string' ? u.utxoEntry.scriptPublicKey : null) || 
                   u.scriptPublicKey;

    return {
      previousOutpoint: {
        transactionId: u.outpoint?.transactionId || u.transactionId,
        index: u.outpoint?.index !== undefined ? u.outpoint.index : u.index
      },
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 1,
      utxo: {
        outpoint: {
          transactionId: u.outpoint?.transactionId || u.transactionId,
          index: u.outpoint?.index !== undefined ? u.outpoint.index : u.index
        },
        amount: amt,
        scriptPublicKey: new ScriptPublicKey(0, spkHex), // Assuming version 0
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
  const signedTx = signTransaction(tx, [pk], true);
  
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
        version: o.scriptPublicKey.version,
        scriptPublicKey: o.scriptPublicKey.script
      }
    })),
    lockTime: Number(finalJson.lockTime),
    subnetworkId: finalJson.subnetworkId
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
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  redeemScriptHex?: string,
  lockTime: number = 0
): Promise<any> {
  await ensureWasm();

  const pks = Object.values(keysMap).map((bytes) => {
    const pkHex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return new PrivateKey(pkHex);
  });

  const totalInputSompi = utxos.reduce((acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
  const changeSompi = totalInputSompi - BigInt(amountSompi) - BigInt(feeSompi);

  const inputs = utxos.map((u: any) => {
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    const spkHex = u.utxoEntry?.scriptPublicKey?.scriptPublicKey || 
                   (typeof u.utxoEntry?.scriptPublicKey === 'string' ? u.utxoEntry.scriptPublicKey : null) || 
                   u.scriptPublicKey;

    return {
      previousOutpoint: {
        transactionId: u.outpoint?.transactionId || u.transactionId,
        index: u.outpoint?.index !== undefined ? u.outpoint.index : u.index
      },
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 1,
      utxo: {
        outpoint: {
          transactionId: u.outpoint?.transactionId || u.transactionId,
          index: u.outpoint?.index !== undefined ? u.outpoint.index : u.index
        },
        amount: amt,
        scriptPublicKey: new ScriptPublicKey(0, spkHex),
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

  const tx = new Transaction(rawTx);
  const signedTx = signTransaction(tx, pks, true);
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
        version: o.scriptPublicKey.version,
        scriptPublicKey: o.scriptPublicKey.script
      }
    })),
    lockTime: Number(finalJson.lockTime),
    subnetworkId: finalJson.subnetworkId
  };

  return {
    transaction: formattedTx,
    id: signedTx.id,
    mass: Number(signedTx.mass || 0)
  };
}
