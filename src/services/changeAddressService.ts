// src/services/changeAddressService.ts
//
// KasPriv Wallet: Kaspa Change Address Derivation & Lifecycle Management
//
// Derivation Scheme:
// - Purpose: 44' (BIP44 standard HD hierarchy)
// - Coin Type: 111111' (Kaspa registered SLIP-0044)
// - Account: 0' (Primary account)
// - Chain: 0 (External / Receive), 1 (Internal / Change)
// - Path Structure: m / 44' / 111111' / 0' / 1 / {index}
//
// Lifecycle Pipeline:
// 1. Select UTXOs -> 2. Select Recipient -> 3. Reserve Change Index -> 
// 4. Derive Change Address (or XPub public derivation) -> 5. Calculate Mass & Fee -> 
// 6. Calculate Change (enforcing minimum spendable threshold) -> 7. Build TX -> 
// 8. Sign in Isolated Boundary -> 9. Broadcast -> 10. Confirm & Mark Index Used.

import { XPrv } from '@kasdk/web';
import { getAddressFromPublicKey, getCachedSeed, hexToBytes } from '../utils/kaspa/keys';
import { wipe } from '../utils/kaspa/common';

export const KASPA_PURPOSE = 44;
export const KASPA_COIN_TYPE = 111111;
export const KASPA_ACCOUNT = 0;
export const RECEIVE_CHAIN = 0;
export const CHANGE_CHAIN = 1;

/** Kaspa baseline minimum non-dust threshold in Sompis (0.00000546 KAS) */
export const DEFAULT_KASPA_DUST_THRESHOLD_SOMPI = 546n;

export interface ChangeAddressInfo {
  address: string;
  index: number;
  derivationPath: string;
  isChange: true;
  coinType: number;
}

export interface ChangeCalculationResult {
  hasChange: boolean;
  changeSompi: bigint;
  feeSompi: bigint;
  absorbedDustToFee: boolean;
  changeOutput?: {
    address: string;
    amountSompi: bigint;
  };
}

/**
 * Derives a deterministic Kaspa Change Address from a BIP39 mnemonic phrase.
 * Path: m / 44' / 111111' / 0' / 1 / {index}
 */
export async function deriveChangeAddress(
  mnemonic: string,
  index: number = 0,
  passphrase: string = '',
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  coinType: number = KASPA_COIN_TYPE,
  account: number = KASPA_ACCOUNT
): Promise<ChangeAddressInfo> {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error('INVALID_CHANGE_INDEX');
  }

  const seedArray = await getCachedSeed(mnemonic, passphrase);
  const seedHex = Array.from(seedArray).map(b => b.toString(16).padStart(2, '0')).join('');

  try {
    const root = new XPrv(seedHex);
    const derivationPath = `m/44'/${coinType}'/${account}'/${CHANGE_CHAIN}/${index}`;
    const child = root.derivePath(derivationPath);

    const pk = child.toPrivateKey();
    const pubKey = pk.toPublicKey();
    const address = getAddressFromPublicKey(hexToBytes(pubKey.toString()), addressType, prefix);

    pk.free();
    pubKey.free();
    child.free();
    root.free();

    return {
      address,
      index,
      derivationPath,
      isChange: true,
      coinType,
    };
  } finally {
    wipe(seedArray);
  }
}

/**
 * Derives a Change Address strictly from a Public Key (without touching private keys/seeds).
 */
export function deriveChangeAddressFromPublicKey(
  publicKey: Uint8Array,
  index: number,
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  coinType: number = KASPA_COIN_TYPE,
  account: number = KASPA_ACCOUNT
): ChangeAddressInfo {
  const address = getAddressFromPublicKey(publicKey, addressType, prefix);
  const derivationPath = `m/44'/${coinType}'/${account}'/${CHANGE_CHAIN}/${index}`;

  return {
    address,
    index,
    derivationPath,
    isChange: true,
    coinType,
  };
}

/* -------------------------------------------------------------------------- */
/* Change Index Reservation & Allocation Manager                             */
/* -------------------------------------------------------------------------- */

class ChangeIndexManager {
  private reservedIndexes = new Set<number>();
  private usedIndexes = new Set<number>();

  /**
   * Calculates the next available change index considering used blockchain state
   * and currently reserved change indexes in unbroadcast pending transactions.
   */
  getNextUnusedIndex(
    addressPaths: Record<string, string> | undefined,
    usedAddresses: Set<string>
  ): number {
    let highestIndex = -1;

    if (addressPaths) {
      for (const [address, path] of Object.entries(addressPaths)) {
        // Path format: m/44'/111111'/0'/1/index
        const match = path.match(/m\/44'\/\d+'\/\d+'\/1\/(\d+)/);
        if (match) {
          const idx = Number.parseInt(match[1], 10);
          if (!Number.isNaN(idx)) {
            const isUsed =
              usedAddresses.has(address) ||
              usedAddresses.has(address.toLowerCase()) ||
              usedAddresses.has(address.replace(/^(kaspa|kaspatest|kaspadev):/i, ''));
            if (isUsed) {
              this.usedIndexes.add(idx);
            }
            highestIndex = Math.max(highestIndex, idx);
          }
        }
      }
    }

    let candidate = highestIndex + 1;
    while (this.reservedIndexes.has(candidate) || this.usedIndexes.has(candidate)) {
      candidate++;
    }

    return candidate;
  }

  /**
   * Locks/reserves a change index during transaction building.
   */
  reserveIndex(index: number): void {
    this.reservedIndexes.add(index);
  }

  /**
   * Releases a reserved change index if a transaction build or broadcast fails.
   */
  releaseIndex(index: number): void {
    this.reservedIndexes.delete(index);
  }

  /**
   * Marks a change index as confirmed and permanently used.
   */
  markIndexUsed(index: number): void {
    this.reservedIndexes.delete(index);
    this.usedIndexes.add(index);
  }

  /** Resets state (e.g. when changing active wallet context) */
  reset(): void {
    this.reservedIndexes.clear();
    this.usedIndexes.clear();
  }
}

export const changeIndexManager = new ChangeIndexManager();

/**
 * Finds the next unused change address index.
 */
export function getNextUnusedChangeIndex(
  addressPaths: Record<string, string> | undefined,
  usedAddresses: Set<string>
): number {
  return changeIndexManager.getNextUnusedIndex(addressPaths, usedAddresses);
}

/**
 * Calculates transaction change output enforcing dynamic minimum spendable dust thresholds.
 *
 * Rules:
 * - If remainingSompi >= minimumSpendableSompi (default 546 Sompi or mass-adjusted output min):
 *   Create a change output to changeAddress.
 * - If 0 < remainingSompi < minimumSpendableSompi:
 *   Absorb remaining change into fee to avoid network dust rejection.
 * - If remainingSompi < 0: Throw INSUFFICIENT_FUNDS.
 */
export function calculateChangeOutput(
  totalInputSompi: bigint,
  targetAmountSompi: bigint,
  estimatedFeeSompi: bigint,
  changeAddress: string,
  minimumSpendableSompi: bigint = DEFAULT_KASPA_DUST_THRESHOLD_SOMPI
): ChangeCalculationResult {
  const remainingSompi = totalInputSompi - targetAmountSompi - estimatedFeeSompi;

  if (remainingSompi < 0n) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  if (remainingSompi === 0n) {
    return {
      hasChange: false,
      changeSompi: 0n,
      feeSompi: estimatedFeeSompi,
      absorbedDustToFee: false,
    };
  }

  if (remainingSompi >= minimumSpendableSompi) {
    return {
      hasChange: true,
      changeSompi: remainingSompi,
      feeSompi: estimatedFeeSompi,
      absorbedDustToFee: false,
      changeOutput: {
        address: changeAddress,
        amountSompi: remainingSompi,
      },
    };
  } else {
    // Absorbing dust into transaction fee
    const adjustedFee = estimatedFeeSompi + remainingSompi;
    return {
      hasChange: false,
      changeSompi: 0n,
      feeSompi: adjustedFee,
      absorbedDustToFee: true,
    };
  }
}

/**
 * Helper to normalize Kaspa addresses for prefix-insensitive comparison.
 */
function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/^(kaspa|kaspatest|kaspadev):/i, '');
}

/**
 * Verifies if an address (P2PKH or P2SH) belongs to a wallet's internal change chain (/1/).
 */
export function isChangeAddress(
  address: string,
  addressPaths?: Record<string, string>
): boolean {
  if (!address || !addressPaths) return false;

  const target = normalizeAddress(address);

  for (const [addr, path] of Object.entries(addressPaths)) {
    if (normalizeAddress(addr) === target) {
      return path.includes("/1/");
    }
  }

  return false;
}

/**
 * Generates a batch of change addresses up to `count`.
 */
export async function generateChangeAddressBatch(
  mnemonic: string,
  startIndex: number = 0,
  count: number = 5,
  passphrase: string = '',
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH'
): Promise<ChangeAddressInfo[]> {
  const addresses: ChangeAddressInfo[] = [];

  for (let i = 0; i < count; i++) {
    const info = await deriveChangeAddress(
      mnemonic,
      startIndex + i,
      passphrase,
      prefix,
      addressType
    );
    addresses.push(info);
  }

  return addresses;
}

