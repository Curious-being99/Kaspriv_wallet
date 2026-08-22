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
  
  // Kaspa RPC expects 'amount' instead of 'value', and nested scriptPublicKey
  return {
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
}
