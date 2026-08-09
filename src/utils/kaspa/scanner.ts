import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import { wipe } from './common';
import { getAddressFromPublicKey } from './keys';
import {
  fetchKaspaAddressBalance,
  fetchKaspaAddressUtxos,
  fetchKaspaAddressTransactions,
} from './api';

export interface DiscoveredAddressInfo {
  address: string;
  balanceSompi: bigint;
  path: string;
  index: number;
  isChange: boolean;
  coinType: number;
}

export interface ScannedWalletChainResult {
  primaryAddress: string;
  totalBalanceSompi: bigint;
  discoveredAddresses: DiscoveredAddressInfo[];
  allUtxos: any[];
  allTransactions: any[];
}

/**
 * Perform deep DAG Chain Index scanning across multiple HD paths, receive/change chains, and derivation indices.
 * Finds all funded addresses, collects active UTXOs, and merges transaction history.
 */
export async function scanKaspaWalletChain(
  mnemonic: string,
  passphrase?: string,
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  gapLimit: number = 20,
  onProgress?: (scannedCount: number, foundCount: number, balanceSompi: bigint) => void
): Promise<ScannedWalletChainResult> {
  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || '');
  const seedArray = new Uint8Array(seed);
  
  try {
    const root = HDKey.fromMasterSeed(seedArray);
    const discoveredAddresses: DiscoveredAddressInfo[] = [];
    const allUtxos: any[] = [];
    const allTransactionsMap = new Map<string, any>();
    let totalBalanceSompi = 0n;

    // Derive primary address immediately
    const primaryChild = root.derive("m/44'/111111'/0'/0/0");
    const primaryAddress = getAddressFromPublicKey(primaryChild.publicKey!, addressType, prefix);

    // Quick mode for brand new wallet creation (gapLimit <= 1)
    if (gapLimit <= 1) {
      if (onProgress) onProgress(1, 0, 0n);
      try {
        const [balance, utxos, txs] = await Promise.all([
          fetchKaspaAddressBalance(primaryAddress),
          fetchKaspaAddressUtxos(primaryAddress),
          fetchKaspaAddressTransactions(primaryAddress),
        ]);
        const currentBal = balance || 0n;
        totalBalanceSompi = currentBal;
        if (currentBal > 0n || (utxos && utxos.length > 0) || (txs && txs.length > 0)) {
          discoveredAddresses.push({
            address: primaryAddress,
            balanceSompi: currentBal,
            path: "m/44'/111111'/0'/0/0",
            index: 0,
            isChange: false,
            coinType: 111111,
          });
          if (utxos && Array.isArray(utxos)) {
            utxos.forEach((u: any) => allUtxos.push({ ...u, address: primaryAddress, derivationPath: "m/44'/111111'/0'/0/0" }));
          }
          if (txs && Array.isArray(txs)) {
            txs.forEach((t: any) => {
              const txid = t.transaction_id || t.txid;
              if (txid) allTransactionsMap.set(txid, t);
            });
          }
        }
      } catch {
        // Return primary address cleanly on network fail
      }
      if (onProgress) onProgress(1, discoveredAddresses.length, totalBalanceSompi);

      return {
        primaryAddress,
        totalBalanceSompi,
        discoveredAddresses,
        allUtxos,
        allTransactions: Array.from(allTransactionsMap.values()),
      };
    }

    // Full scanning with parallel batching for seed restoration / index scan
    const coinTypes = [111111, 972];
    let totalScanned = 0;

    for (const coinType of coinTypes) {
      for (const isChange of [false, true]) {
        const changeVal = isChange ? 1 : 0;
        const batchSize = 4;

        for (let i = 0; i < gapLimit; i += batchSize) {
          const batchIndices = Array.from({ length: Math.min(batchSize, gapLimit - i) }, (_, idx) => i + idx);
          
          const batchItems = batchIndices.map((idx) => {
            const path = `m/44'/${coinType}'/0'/${changeVal}/${idx}`;
            try {
              const child = root.derive(path);
              if (!child || !child.publicKey) return null;
              const addr = getAddressFromPublicKey(child.publicKey, addressType, prefix);
              return { idx, path, addr };
            } catch {
              return null;
            }
          }).filter(Boolean) as { idx: number; path: string; addr: string }[];

          if (batchItems.length === 0) break;

          const results = await Promise.all(
            batchItems.map(async (item) => {
              try {
                const [balance, utxos, txs] = await Promise.all([
                  fetchKaspaAddressBalance(item.addr),
                  fetchKaspaAddressUtxos(item.addr),
                  fetchKaspaAddressTransactions(item.addr),
                ]);
                return { item, balance, utxos, txs };
              } catch {
                return { item, balance: null, utxos: null, txs: null };
              }
            })
          );

          let batchHasActivity = false;

          for (const res of results) {
            totalScanned++;
            const hasBalance = res.balance !== null && res.balance > 0n;
            const hasUtxos = res.utxos !== null && Array.isArray(res.utxos) && res.utxos.length > 0;
            const hasTxs = res.txs !== null && Array.isArray(res.txs) && res.txs.length > 0;

            if (hasBalance || hasUtxos || hasTxs) {
              batchHasActivity = true;
              const currentBal = res.balance || 0n;
              totalBalanceSompi += currentBal;

              discoveredAddresses.push({
                address: res.item.addr,
                balanceSompi: currentBal,
                path: res.item.path,
                index: res.item.idx,
                isChange,
                coinType,
              });

              if (res.utxos && Array.isArray(res.utxos)) {
                res.utxos.forEach((u: any) => {
                  allUtxos.push({
                    ...u,
                    derivationPath: res.item.path,
                    address: res.item.addr,
                  });
                });
              }

              if (res.txs && Array.isArray(res.txs)) {
                res.txs.forEach((t: any) => {
                  const txid = t.transaction_id || t.txid;
                  if (txid && !allTransactionsMap.has(txid)) {
                    allTransactionsMap.set(txid, t);
                  }
                });
              }
            }
          }

          if (onProgress) {
            onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
          }

          // If this entire batch of 4 paths has no activity and we're past index 0, stop scanning this subchain early
          if (!batchHasActivity && i >= 4) {
            break;
          }
        }
      }
    }

    return {
      primaryAddress,
      totalBalanceSompi,
      discoveredAddresses,
      allUtxos,
      allTransactions: Array.from(allTransactionsMap.values()),
    };
  } finally {
    wipe(seedArray);
  }
}
