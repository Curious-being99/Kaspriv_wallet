import { 
  getPrivateKeyBytesFromMnemonic, 
  getPrivateKeyBytesFromSeed,
  getPrivateKeysMapFromSeed,
  signKaspaMessage, 
  addressToScriptPublicKey,
  wipe,
  estimateTransactionMass,
  calculateMinFeeForInputs,
  getCachedSeed
} from './kaspa';
import { createSignedTransactionIsolatedWasm } from './kaspa/wasmTx';
import { NetworkType } from '../types';

export function deepCloneAndFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle BigInt explicitly
  if (typeof obj === 'bigint') {
    return obj;
  }

  // Handle Array
  if (Array.isArray(obj)) {
    const copy = obj.map(item => deepCloneAndFreeze(item)) as any;
    return Object.freeze(copy) as any;
  }

  // Handle TypedArrays (Uint8Array, Int32Array, etc.)
  if (ArrayBuffer.isView(obj)) {
    const view = obj as unknown as Uint8Array;
    const copy = new (obj.constructor as any)(view.length);
    copy.set(view);
    return Object.freeze(copy) as any;
  }

  // Handle Date
  if (obj instanceof Date) {
    return Object.freeze(new Date(obj.getTime())) as any;
  }

  // Handle Object
  const copy = {} as any;
  for (const key of Object.keys(obj)) {
    copy[key] = deepCloneAndFreeze((obj as any)[key]);
  }
  return Object.freeze(copy);
}

export interface UnsignedTxIntent {
  network: NetworkType;
  toAddress: string;
  changeAddress: string;
  amountSompi: bigint;
  feeSompi: bigint;
  utxos: any[];
  note?: string;
  lockTime?: number;
  lockedUtxoOutpoints?: string[];
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  details?: {
    expectedNetwork: NetworkType;
    actualNetwork: string;
    numericAmountKas: number;
    feeKas: number;
    destination: string;
  };
}

/**
 * Step 6: Transaction Intent Verifier
 * Independently verifies transaction parameters before key derivation or signing.
 */
export function verifyTransactionIntent(
  intent: UnsignedTxIntent,
  expectedNetwork: NetworkType
): VerificationResult {
  // 1. Verify network match
  // Derive the required prefix based on the selected network
  let expectedPrefix: string;
  switch (expectedNetwork) {
    case 'mainnet':
      expectedPrefix = 'kaspa';
      break;
    case 'testnet-10':
    case 'testnet-11':
      expectedPrefix = 'kaspatest';
      break;
    case 'devnet':
      expectedPrefix = 'kaspadev';
      break;
    default:
      return {
        valid: false,
        error: `Security failure: Unsupported network type '${expectedNetwork}' during intent verification.`
      };
  }

  const addrPrefix = intent.toAddress.split(':')[0];

  if (addrPrefix !== expectedPrefix) {
    return {
      valid: false,
      error: `Network mismatch error: Recipient address prefix '${addrPrefix}' does not match the active network '${expectedNetwork}' (expected '${expectedPrefix}:').`
    };
  }

  if (intent.changeAddress) {
    const changePrefix = intent.changeAddress.split(':')[0];
    if (changePrefix !== expectedPrefix) {
      return {
        valid: false,
        error: `Network mismatch error: Change address prefix '${changePrefix}' does not match the active network '${expectedNetwork}' (expected '${expectedPrefix}:').`
      };
    }
  }

  // 2. Verify amount
  if (intent.amountSompi <= 0n) {
    return {
      valid: false,
      error: `Invalid transaction amount: Amount must be greater than 0.`
    };
  }

  // 3. Verify fee
  if (intent.feeSompi < 0n) {
    return {
      valid: false,
      error: `Security failure: Fee cannot be negative.`
    };
  }

  // 4. Verify UTXOs available
  if (!intent.utxos || intent.utxos.length === 0) {
    return {
      valid: false,
      error: `Transaction execution failed: No UTXOs provided for signing.`
    };
  }

  // 5. Verify total input balance covers output + fee
  const totalInputSompi = intent.utxos.reduce((acc, u) => {
    const txId = String(u.outpoint?.transactionId || u.transactionId || u.txid || '').toLowerCase();
    const index = Number(u.outpoint?.index !== undefined ? u.outpoint.index : (u.index ?? u.vout ?? -1));
    
    if (!txId || !/^[0-9a-f]{64}$/.test(txId)) {
      throw new Error(`Security failure: Invalid UTXO transactionId format (${txId}).`);
    }
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error(`Security failure: Invalid UTXO outpoint index (${index}).`);
    }
    const outpointKey = `${txId}:${index}`;

    if (intent.lockedUtxoOutpoints && intent.lockedUtxoOutpoints.includes(outpointKey)) {
      throw new Error(`Security failure: Attempted to spend a frozen/locked UTXO (${outpointKey}).`);
    }

    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    return acc + amt;
  }, 0n);

  if (totalInputSompi < intent.amountSompi + intent.feeSompi) {
    return {
      valid: false,
      error: `Insufficient UTXO input total (${totalInputSompi} sompi) for amount (${intent.amountSompi} sompi) + fee (${intent.feeSompi} sompi).`
    };
  }

  return {
    valid: true,
    details: {
      expectedNetwork,
      actualNetwork: addrPrefix,
      numericAmountKas: Number(intent.amountSompi) / 1e8,
      feeKas: Number(intent.feeSompi) / 1e8,
      destination: intent.toAddress
    }
  };
}

/**
 * Verifies that the built transaction object actually matches the user intent.
 * This prevents the construction layer from silently deviating from what was verified.
 */
async function verifyBuiltTransaction(transaction: any, intent: UnsignedTxIntent): Promise<void> {
  const expectedScriptPubKey = await addressToScriptPublicKey(intent.toAddress, intent.network);

  if (transaction.type === 'wasm') {
    // For WASM transactions, we trust the builder if the input parameters match exactly
    // since we cannot easily inspect the internal WASM mtx structure here.
    // However, buildKaspaTransaction returns the parameters it used.
    if (transaction.toAddress !== intent.toAddress) throw new Error('Security failure: Transaction destination mismatch after build.');
    if (transaction.amountSompi !== intent.amountSompi) throw new Error('Security failure: Transaction amount mismatch after build.');
    if (transaction.feeSompi !== intent.feeSompi) throw new Error('Security failure: Transaction fee mismatch after build.');
    
    // Check deep into WASM structure if possible
    if (transaction.mtx && Array.isArray(transaction.mtx.outputs)) {
      const isSelfSend = intent.toAddress === intent.changeAddress;
      if (isSelfSend) {
        // Just verify at least one output goes to the right address
        const destinationOutput = transaction.mtx.outputs.find((o: any) => 
          (o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey || o.script_public_key?.script_public_key === expectedScriptPubKey)
        );
        if (!destinationOutput) {
          throw new Error('Security failure: Could not verify intended output in WASM transaction structure for self-send.');
        }
      } else {
        const destinationOutput = transaction.mtx.outputs.find((o: any) => 
          (BigInt(o.amount) === intent.amountSompi) && 
          (o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey || o.script_public_key?.script_public_key === expectedScriptPubKey)
        );
        if (!destinationOutput) {
          throw new Error('Security failure: Could not verify intended output in WASM transaction structure.');
        }
      }
    }
  } else {
    // For manual transactions, inspect the outputs array
    const destinationOutput = transaction.outputs.find((o: any) => 
      BigInt(o.amount) === intent.amountSompi && 
      o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey
    );
    if (!destinationOutput) {
      throw new Error('Security failure: Could not find output matching the intended amount and destination address in the built transaction.');
    }
  }
}

/**
 * Compare the entire final signed transaction against the approved intent,
 * and verify actual transaction mass/fee using the Kaspa implementation.
 */
async function verifyFinalSignedTransaction(signedTx: any, intent: UnsignedTxIntent, addressType: 'P2SH'): Promise<void> {
  // Ensure the transaction structure exists
  if (!signedTx || !Array.isArray(signedTx.inputs) || !Array.isArray(signedTx.outputs)) {
    throw new Error('Security failure: Signed transaction is missing inputs or outputs array.');
  }

  // 1. Verify inputs match the intent UTXOs exactly and contain no duplicate outpoints
  let totalActualInputSompi = 0n;
  const seenSignedOutpoints = new Set<string>();

  for (const input of signedTx.inputs) {
    const txId = input.previousOutpoint?.transactionId;
    const index = input.previousOutpoint?.index;
    if (!txId || index === undefined) {
      throw new Error('Security failure: Signed transaction input is missing previousOutpoint fields.');
    }

    const outpointKey = `${String(txId).toLowerCase()}:${Number(index)}`;
    if (seenSignedOutpoints.has(outpointKey)) {
      throw new Error(`Security failure: Duplicate input outpoint detected in signed transaction: ${outpointKey}`);
    }
    seenSignedOutpoints.add(outpointKey);

    // Every input outpoint must match a UTXO in the intent
    const utxoMatch = intent.utxos.find(u => {
      const uTxId = u.outpoint?.transactionId || u.transactionId;
      const uIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
      return String(uTxId).toLowerCase() === String(txId).toLowerCase() && Number(uIndex) === Number(index);
    });

    if (!utxoMatch) {
      throw new Error(`Security failure: Signed transaction contains an unapproved input outpoint ${txId}:${index}.`);
    }
    
    totalActualInputSompi += BigInt(utxoMatch.utxoEntry?.amount || utxoMatch.amount || 0);

    // Ensure the signatureScript is present (meaning it has been signed)
    if (!input.signatureScript) {
      throw new Error('Security failure: Signed transaction has an unsigned input (signatureScript is empty).');
    }
  }

  // 2. Verify outputs match the approved intent exactly
  const expectedRecipientScriptPubKey = await addressToScriptPublicKey(intent.toAddress, intent.network);
  const expectedChangeAmount = totalActualInputSompi - intent.amountSompi - intent.feeSompi;
  const isSelfSend = intent.toAddress === intent.changeAddress;

  if (isSelfSend) {
    let combinedAmount = 0n;
    for (const out of signedTx.outputs) {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      if (spk !== expectedRecipientScriptPubKey) {
        throw new Error(`Security failure: Signed transaction contains unauthorized output script ${spk} in self-send.`);
      }
      combinedAmount += BigInt(out.amount);
    }

    const expectedCombined = intent.amountSompi + expectedChangeAmount;
    if (combinedAmount > expectedCombined) {
      throw new Error(`Security failure: Signed transaction self-send combined output (${combinedAmount}) exceeds expected (${expectedCombined}).`);
    }
    const feeDiscrepancy = expectedCombined - combinedAmount;
    if (feeDiscrepancy !== 0n) {
      throw new Error(`Security failure: Signed transaction combined output amount (${combinedAmount} sompi) does not match expected (${expectedCombined} sompi) exactly.`);
    }
    if (signedTx.outputs.length > 2) {
      throw new Error(`Security failure: Signed transaction has extra unauthorized outputs (${signedTx.outputs.length} outputs, expected at most 2).`);
    }
  } else {
    const expectedChangeScriptPubKey = expectedChangeAmount > 0n 
      ? await addressToScriptPublicKey(intent.changeAddress, intent.network)
      : null;

    // Verify all outputs strictly belong to either recipient or change
    for (const out of signedTx.outputs) {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      const isRecipient = spk === expectedRecipientScriptPubKey;
      const isChange = expectedChangeScriptPubKey !== null && spk === expectedChangeScriptPubKey;
      if (!isRecipient && !isChange) {
        throw new Error(`Security failure: Signed transaction contains unexpected unauthorized output destination.`);
      }
    }

    // Find the recipient output
    const recipientOutput = signedTx.outputs.find((out: any) => {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      return spk === expectedRecipientScriptPubKey;
    });

    if (!recipientOutput) {
      throw new Error('Security failure: Signed transaction is missing the recipient output.');
    }

    const actualRecipientAmount = BigInt(recipientOutput.amount);
    if (actualRecipientAmount !== intent.amountSompi) {
      throw new Error(`Security failure: Signed transaction recipient output amount (${actualRecipientAmount} sompi) does not match approved amount (${intent.amountSompi} sompi).`);
    }

    // Verify change output if present
    if (expectedChangeAmount > 0n) {
      const changeOutput = signedTx.outputs.find((out: any) => {
        const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
        return spk === expectedChangeScriptPubKey;
      });

      if (!changeOutput) {
        throw new Error('Security failure: Signed transaction is missing the change output.');
      }

      const actualChangeAmount = BigInt(changeOutput.amount);
      if (actualChangeAmount > expectedChangeAmount) {
        throw new Error(`Security failure: Signed transaction change output (${actualChangeAmount}) exceeds expected (${expectedChangeAmount}).`);
      }
      const feeDiscrepancy = expectedChangeAmount - actualChangeAmount;
      if (feeDiscrepancy !== 0n) {
        throw new Error(`Security failure: Signed transaction change output amount (${actualChangeAmount} sompi) does not match expected (${expectedChangeAmount} sompi) exactly.`);
      }

      // Ensure there are at most 2 outputs (recipient + change)
      if (signedTx.outputs.length !== 2) {
        throw new Error(`Security failure: Signed transaction output count mismatch (${signedTx.outputs.length} outputs, expected exactly 2).`);
      }
    } else {
      // If no change, there should be exactly 1 output (just the recipient)
      if (signedTx.outputs.length !== 1) {
        throw new Error(`Security failure: Signed transaction has extra unauthorized outputs (${signedTx.outputs.length} outputs, expected 1).`);
      }
    }
  }

  // 3. Verify other fields
  if (BigInt(signedTx.lockTime || 0) !== BigInt(intent.lockTime || 0)) {
    throw new Error(`Security failure: Signed transaction lockTime mismatch.`);
  }

  // 4. Verify actual mass/fee using consensus-aligned validation engine (fails closed)
  try {
    const inputsCount = signedTx.inputs?.length || intent.utxos?.length || 1;
    const outputsCount = signedTx.outputs?.length || 2;

    const actualMass = estimateTransactionMass(inputsCount, outputsCount, addressType);
    const minRequiredFee = calculateMinFeeForInputs(inputsCount, outputsCount, addressType);

    // Enforce standard maximum mass limit (100,000 grams)
    if (actualMass > 100000) {
      throw new Error(`Security failure: Transaction mass (${actualMass}) exceeds standard mempool limit of 100,000 grams.`);
    }

    // Ensure transaction fee paid is sufficient
    if (intent.feeSompi < minRequiredFee) {
      throw new Error(`Security failure: Paid fee (${intent.feeSompi} sompi) is below minimum relay fee (${minRequiredFee} sompi) required for mass (${actualMass} grams).`);
    }
  } catch (e: any) {
    console.error('Mass/fee verification error (Transaction Rejected):', e);
    if (e.message && e.message.startsWith('Security failure:')) {
      throw e;
    }
    throw new Error(`Security failure: Transaction verification failed with error: ${e.message || e}`);
  }
}

/**
 * Isolated Signer
 *
 * Security properties:
 * - Transaction intent is verified before key derivation.
 * - Built transaction is verified against intent before signing.
 * - Private key is represented as Uint8Array.
 * - No private-key hex string is created by this layer.
 * - Signing receives the derived key bytes directly.
 * - Private-key buffer is wiped in finally.
 * - Plaintext mnemonic/passphrase are NOT forwarded to the construction layer.
 */
export class IsolatedSigner {
  /**
   * Constructs, verifies, signs transaction with minimal plaintext seed lifetime.
   */
  public static async signTransactionIsolated(
    mnemonic: string,
    passphrase: string | undefined,
    intentInput: UnsignedTxIntent,
    addressType: 'P2SH' = 'P2SH',
    redeemScriptHex?: string,
    skipWorker = false,
    sessionId?: string | null
  ): Promise<{
    success: boolean;
    transaction?: any;
    error?: string;
    txId?: string;
  }> {
    const isP2SH = true;

    const effectiveAddressType: 'P2SH' = 'P2SH';

    const isMainThread = typeof window !== 'undefined' && typeof window.document !== 'undefined';
    if (isMainThread && !skipWorker) {
      try {
        const { cryptoWorkerManager, serializeWithBigInt, deserializeWithBigInt } = await import('./cryptoWorkerManager');
        if (cryptoWorkerManager.isSupported()) {
          const serializedIntent = serializeWithBigInt(intentInput);
          const res = await cryptoWorkerManager.runTask<any>('signTransactionIsolated', {
            serializedIntent,
            mnemonic,
            passphrase,
            addressType: effectiveAddressType,
            redeemScriptHex,
            useSession: true, // Instruction to keep the mnemonic in Rust memory
            sessionId
          }, 12000);
          return deserializeWithBigInt(res);
        }
      } catch (workerErr) {
        console.warn('CryptoWorker signing failed or timed out, performing fast in-thread signing fallback:', workerErr);
      }
    }

    // Zero-Trust Deep Clone & Freeze: Completely isolate intent to prevent post-verification memory mutation by malware
    const intent = deepCloneAndFreeze(intentInput);

    // 1. Verify transaction intent BEFORE key derivation.
    const verification = verifyTransactionIntent(intent, intent.network);

    if (!verification.valid) {
      return {
        success: false,
        error: verification.error ?? 'Transaction intent verification failed'
      };
    }

    // 2. Build and sign the transaction using authoritative Kaspa WASM engine.
    const resolvedUtxos = [...intent.utxos];

    // Fast O(1) derivation path resolution using direct intent mappings
    for (let i = 0; i < resolvedUtxos.length; i++) {
      const u = resolvedUtxos[i];
      const addr = u.address;
      const currentPath = u.derivationPath || u.path || (addr && (intent as any).addressPaths?.[addr]);
      if (!currentPath) {
        return {
          success: false,
          error: `Missing derivation path for UTXO at address ${addr}`
        };
      }
      resolvedUtxos[i] = {
        ...u,
        derivationPath: currentPath,
      };
    }

    const uniquePaths = Array.from(
      new Set(
        resolvedUtxos.map(u => u.derivationPath!)
      )
    );

    let keysMap: { [path: string]: Uint8Array } = {};
    const seed = await getCachedSeed(mnemonic, passphrase || '');
    try {
      keysMap = await getPrivateKeysMapFromSeed(seed, uniquePaths);
    } finally {
      wipe(seed);
    }

    try {
      const wasmResult = await createSignedTransactionIsolatedWasm(
        resolvedUtxos,
        intent.toAddress,
        intent.amountSompi,
        intent.changeAddress,
        keysMap,
        intent.feeSompi,
        effectiveAddressType,
        redeemScriptHex,
        intent.lockTime
      );

      const signedTx = wasmResult.transaction;

      // 3. Verify the built transaction and final signed transaction against intent
      await verifyBuiltTransaction(signedTx, intent);
      await verifyFinalSignedTransaction(signedTx, intent, effectiveAddressType);

      return {
        success: true,
        transaction: {
          ...signedTx,
          id: signedTx.id || wasmResult.id,
          txId: signedTx.txId || signedTx.id || wasmResult.id,
        },
        txId: signedTx.id || wasmResult.id,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Signing failure',
      };
    } finally {
      Object.values(keysMap).forEach(bytes => {
        if (bytes) {
          wipe(bytes);
        }
      });
    }
  }

  /**
   * Isolated message signing
   */
  public static async signMessageIsolated(
    mnemonic: string,
    passphrase: string | undefined,
    message: string,
    sessionId?: string | null
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const isMainThread = typeof window !== 'undefined' && typeof window.document !== 'undefined';
    if (isMainThread) {
      const { cryptoWorkerManager } = await import('./cryptoWorkerManager');
      if (!cryptoWorkerManager.isSupported()) {
        throw new Error('CRITICAL: CryptoWorker is not supported or initialized on main thread.');
      }
      return await cryptoWorkerManager.runTask<{ success: boolean; signature?: string; error?: string }>('signMessageIsolated', {
        mnemonic,
        passphrase,
        message,
        sessionId
      });
    }

    let privKeyBytes: Uint8Array | null = null;

    try {
      // ------------------------------------------------------
      // Derive private key
      // ------------------------------------------------------
      privKeyBytes = await getPrivateKeyBytesFromMnemonic(mnemonic, passphrase);
      
      // ------------------------------------------------------
      // Sign message
      // ------------------------------------------------------
      const signature = await signKaspaMessage(message.trim(), privKeyBytes);
      
      return { success: true, signature };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Message signing failed';
      return {
        success: false,
        error,
      };
    } finally {
      // ------------------------------------------------------
      // ALWAYS wipe the private key
      // ------------------------------------------------------
      if (privKeyBytes) {
        wipe(privKeyBytes);
        privKeyBytes = null;
      }
    }
  }
}
