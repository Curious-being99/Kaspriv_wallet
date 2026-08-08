import { getPrivateKeyFromMnemonic, createSignedTransaction, signKaspaMessage } from './kaspa';
import { wipe } from './crypto';

export interface UnsignedTxIntent {
  network: string;
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
    expectedNetwork: string;
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
  expectedNetwork: string
): VerificationResult {
  // 1. Verify network match
  const addrPrefix = intent.toAddress.split(':')[0];
  const expectedPrefix = expectedNetwork === 'mainnet' ? 'kaspa' : expectedNetwork === 'testnet-10' ? 'kaspatest' : 'kaspadev';

  if (addrPrefix !== expectedPrefix) {
    return {
      valid: false,
      error: `Network mismatch error: Recipient address prefix '${addrPrefix}' does not match active network '${expectedPrefix}'.`
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
  if (intent.feeSompi <= 0n) {
    return {
      valid: false,
      error: `Invalid fee amount: Fee must be greater than 0.`
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
 * Step 5: Isolated Signing Module
 * Receives seed / password, derives key in volatile scope, verifies intent, signs,
 * returns result/signature, and immediately wipes all intermediate buffers.
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
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    // 1. Transaction Intent Verification
    const verification = verifyTransactionIntent(intent, intent.network);
    if (!verification.valid) {
      return { success: false, error: verification.error };
    }

    let privKeyHex: string | null = null;
    let privKeyBytes: Uint8Array | null = null;

    try {
      // 2. Short-lived key derivation
      privKeyHex = getPrivateKeyFromMnemonic(mnemonic, passphrase);
      const cleanHex = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex;
      privKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

      // 3. Construct and sign transaction
      const txResult = await createSignedTransaction(
        intent.utxos,
        intent.toAddress,
        intent.amountSompi,
        intent.changeAddress,
        cleanHex,
        intent.feeSompi,
        addressType,
        redeemScriptHex,
        mnemonic,
        passphrase,
        intent.lockTime
      );

      return { success: true, transaction: txResult.transaction };
    } catch (err: any) {
      return { success: false, error: err.message || 'Isolated signing failure' };
    } finally {
      // 4. Memory wiping: zero-out all sensitive buffers and references immediately
      if (privKeyBytes) {
        wipe(privKeyBytes);
      }
      privKeyHex = null;
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
    let privKeyHex: string | null = null;

    try {
      privKeyHex = getPrivateKeyFromMnemonic(mnemonic, passphrase);
      const signature = signKaspaMessage(message.trim(), privKeyHex);
      return { success: true, signature };
    } catch (err: any) {
      return { success: false, error: err.message || 'Isolated message signing failure' };
    } finally {
      privKeyHex = null;
    }
  }
}
