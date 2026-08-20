import { 
  getPrivateKeyBytesFromMnemonic, 
  buildKaspaTransaction, 
  signTransactionWithPrivateKeyBytes, 
  signKaspaMessage, 
  addressToScriptPublicKey,
  wipe,
  estimateTransactionMass,
  calculateMinFeeForInputs
} from './kaspa';
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

  // Handle Uint8Array or other TypedArrays
  if (obj instanceof Uint8Array) {
    const copy = new Uint8Array(obj);
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
function verifyBuiltTransaction(transaction: any, intent: UnsignedTxIntent): void {
  if (transaction.type === 'wasm') {
    // For WASM transactions, we trust the builder if the input parameters match exactly
    // since we cannot easily inspect the internal WASM mtx structure here.
    // However, buildKaspaTransaction returns the parameters it used.
    if (transaction.toAddress !== intent.toAddress) throw new Error('Security failure: Transaction destination mismatch after build.');
    if (transaction.amountSompi !== intent.amountSompi) throw new Error('Security failure: Transaction amount mismatch after build.');
    if (transaction.feeSompi !== intent.feeSompi) throw new Error('Security failure: Transaction fee mismatch after build.');
    
    // Check deep into WASM structure if possible
    if (transaction.mtx && Array.isArray(transaction.mtx.outputs)) {
      const expectedScriptPubKey = addressToScriptPublicKey(intent.toAddress);
      
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
    // For manual transactions, we can inspect the outputs array
    const expectedScriptPubKey = addressToScriptPublicKey(intent.toAddress);
    const destinationOutput = transaction.outputs.find((o: any) => 
      BigInt(o.amount) === intent.amountSompi && 
      o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey
    );
    if (!destinationOutput) {
      throw new Error('Security failure: Could not find output matching the intended amount and destination address in the built transaction.');
    }
    // Note: We could also verify the scriptPublicKey matches the toAddress here.
  }
}

/**
 * Compare the entire final signed transaction against the approved intent,
 * and verify actual transaction mass/fee using the Kaspa implementation.
 */
async function verifyFinalSignedTransaction(signedTx: any, intent: UnsignedTxIntent): Promise<void> {
  // Ensure the transaction structure exists
  if (!signedTx || !Array.isArray(signedTx.inputs) || !Array.isArray(signedTx.outputs)) {
    throw new Error('Security failure: Signed transaction is missing inputs or outputs array.');
  }

  // 1. Verify inputs match the intent UTXOs exactly (allow subset if WASM builder optimized it)
  let totalActualInputSompi = 0n;
  for (const input of signedTx.inputs) {
    const txId = input.previousOutpoint?.transactionId;
    const index = input.previousOutpoint?.index;
    if (!txId || index === undefined) {
      throw new Error('Security failure: Signed transaction input is missing previousOutpoint fields.');
    }

    // Every input outpoint must match a UTXO in the intent
    const utxoMatch = intent.utxos.find(u => {
      const uTxId = u.outpoint?.transactionId || u.transactionId;
      const uIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
      return String(uTxId) === String(txId) && Number(uIndex) === Number(index);
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
  const expectedScriptPubKey = addressToScriptPublicKey(intent.toAddress);
  const expectedChangeAmount = totalActualInputSompi - intent.amountSompi - intent.feeSompi;
  const isSelfSend = intent.toAddress === intent.changeAddress;

  if (isSelfSend) {
    let combinedAmount = 0n;
    for (const out of signedTx.outputs) {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      if (spk === expectedScriptPubKey) {
        combinedAmount += BigInt(out.amount);
      }
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
    // Find the recipient output
    const recipientOutput = signedTx.outputs.find((out: any) => {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      return spk === expectedScriptPubKey;
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
      const expectedChangeScriptPubKey = addressToScriptPublicKey(intent.changeAddress);
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
      if (signedTx.outputs.length > 2) {
        throw new Error(`Security failure: Signed transaction has extra unauthorized outputs (${signedTx.outputs.length} outputs, expected at most 2).`);
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
    const addressType = intent.toAddress.includes('kaspa:p') ? 'P2SH' : 'P2PKH';

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
    addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
    redeemScriptHex?: string
  ): Promise<{
    success: boolean;
    transaction?: any;
    error?: string;
  }> {
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

    // 2. Build the transaction structure.
    let transaction: any;
    try {
      transaction = await buildKaspaTransaction(
        intent.utxos,
        intent.toAddress,
        intent.amountSompi,
        intent.changeAddress,
        intent.feeSompi,
        addressType,
        redeemScriptHex,
        intent.lockTime
      );

      // 3. Verify the built transaction actually matches the intent.
      verifyBuiltTransaction(transaction, intent);
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Transaction construction failed'
      };
    }

    // 4. Sign the transaction in a protected scope by deriving keys for each unique UTXO path.
    const uniquePaths = Array.from(
      new Set(
        intent.utxos.map(u => u.derivationPath || u.path || "m/44'/111111'/0'/0/0")
      )
    );

    const keysMap: { [path: string]: Uint8Array } = {};
    try {
      for (const path of uniquePaths) {
        keysMap[path] = getPrivateKeyBytesFromMnemonic(mnemonic, passphrase, path);
      }

      const signedTx = await signTransactionWithPrivateKeyBytes(
        transaction,
        keysMap
      );

      // Verify the FINAL signed transaction structure, parameters, mass and fees against the intent before returning
      await verifyFinalSignedTransaction(signedTx, intent);

      return {
        success: true,
        transaction: signedTx,
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
    message: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    let privKeyBytes: Uint8Array | null = null;

    try {
      // ------------------------------------------------------
      // Derive private key
      // ------------------------------------------------------
      privKeyBytes = getPrivateKeyBytesFromMnemonic(mnemonic, passphrase);
      
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
