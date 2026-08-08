import { 
  getPrivateKeyBytesFromMnemonic, 
  buildKaspaTransaction, 
  signTransactionWithPrivateKeyBytes, 
  signKaspaMessage, 
  addressToScriptPublicKeyHex,
  wipe 
} from './kaspa';
import { NetworkType } from '../types';

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
      const expectedScriptPubKey = addressToScriptPublicKeyHex(intent.toAddress);
      const destinationOutput = transaction.mtx.outputs.find((o: any) => 
        (BigInt(o.amount) === intent.amountSompi) && 
        (o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey || o.script_public_key?.script_public_key === expectedScriptPubKey)
      );
      if (!destinationOutput) {
        throw new Error('Security failure: Could not verify intended output in WASM transaction structure.');
      }
    }
  } else {
    // For manual transactions, we can inspect the outputs array
    const expectedScriptPubKey = addressToScriptPublicKeyHex(intent.toAddress);
    const destinationOutput = transaction.outputs.find((o: any) => 
      o.amount === Number(intent.amountSompi) && 
      o.scriptPublicKey?.scriptPublicKey === expectedScriptPubKey
    );
    if (!destinationOutput) {
      throw new Error('Security failure: Could not find output matching the intended amount and destination address in the built transaction.');
    }
    // Note: We could also verify the scriptPublicKey matches the toAddress here.
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
    intent: UnsignedTxIntent,
    addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
    redeemScriptHex?: string
  ): Promise<{
    success: boolean;
    transaction?: any;
    error?: string;
  }> {
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

    // 4. Sign the transaction in a protected scope.
    let privKeyBytes: Uint8Array | null = null;
    try {
      privKeyBytes = getPrivateKeyBytesFromMnemonic(mnemonic, passphrase);

      const signedTx = await signTransactionWithPrivateKeyBytes(
        transaction,
        privKeyBytes
      );

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
      if (privKeyBytes) {
        wipe(privKeyBytes);
        privKeyBytes = null;
      }
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
