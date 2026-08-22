import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { wipe } from './common';
import { getAddressFromPublicKey } from './keys';
import {
  fetchKaspaAddressBalance,
  fetchKaspaAddressUtxos,
  fetchKaspaAddressTransactions,
  getKaspaApiUrl,
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
  primaryChangeAddress: string;
  totalBalanceSompi: bigint;
  discoveredAddresses: DiscoveredAddressInfo[];
  allUtxos: any[];
  allTransactions: any[];
}

export type PublicAddressDeriver = (
  chain: 'receive' | 'change',
  index: number,
  scriptType: 'P2PKH' | 'P2SH'
) => Promise<{ address: string; derivationPath: string }> | { address: string; derivationPath: string };

/**
 * Perform deep DAG Chain Index scanning across multiple HD paths, receive/change chains, and derivation indices.
 *
 * Fully secures seed memory, respects both P2PKH/P2SH types, and computes deduplicated UTXO-based balances.
 */
export async function scanKaspaWalletChain(
  mnemonic: string,
  passphrase?: string,
  prefix: string = 'kaspa',
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  gapLimit: number = 30,
  onProgress?: (scannedCount: number, foundCount: number, balanceSompi: bigint) => void
): Promise<ScannedWalletChainResult> {
  const seedArray = mnemonicToSeedSync(mnemonic, passphrase || '');
  
  try {
    const root = HDKey.fromMasterSeed(seedArray);
    const discoveredAddresses: DiscoveredAddressInfo[] = [];
    const allUtxosMap = new Map<string, any>();
    const allTransactionsMap = new Map<string, any>();
    let totalBalanceSompi = 0n;

    // Derive primary address and primary change address immediately (BIP44 format)
    const primaryChild = root.derive("m/44'/111111'/0'/0/0");
    const primaryAddress = getAddressFromPublicKey(primaryChild.publicKey!, addressType, prefix);

    const primaryChangeChild = root.derive("m/44'/111111'/0'/1/0");
    const primaryChangeAddress = getAddressFromPublicKey(primaryChangeChild.publicKey!, addressType, prefix);

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
        
        discoveredAddresses.push({
          address: primaryAddress,
          balanceSompi: currentBal,
          path: "m/44'/111111'/0'/0/0",
          index: 0,
          isChange: false,
          coinType: 111111,
        });

        if (utxos && Array.isArray(utxos)) {
          utxos.forEach((u: any) => {
            const outpointTxId = u.outpoint?.transactionId || u.transactionId || u.txid || '';
            const outpointIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
            const outpointKey = `${outpointTxId}:${outpointIndex}`;
            allUtxosMap.set(outpointKey, {
              ...u,
              address: primaryAddress,
              derivationPath: "m/44'/111111'/0'/0/0",
            });
          });
        }
        if (txs && Array.isArray(txs)) {
          txs.forEach((t: any) => {
            const txid = typeof t === 'string' ? t : (t.transaction_id || t.txid || t.id || '');
            if (txid) allTransactionsMap.set(txid, typeof t === 'string' ? { transaction_id: txid } : t);
          });
        }
      } catch {
        // Return primary address cleanly on network fail
      }
      if (onProgress) onProgress(1, discoveredAddresses.length, totalBalanceSompi);

      return {
        primaryAddress,
        primaryChangeAddress,
        totalBalanceSompi,
        discoveredAddresses,
        allUtxos: Array.from(allUtxosMap.values()),
        allTransactions: Array.from(allTransactionsMap.values()),
      };
    }

    // Full scanning with parallel batching for seed restoration / index scan
    const coinTypes = [111111, 972];
    let totalScanned = 0;

    // Always include primary receive and change addresses in discovered list initially
    discoveredAddresses.push({
      address: primaryAddress,
      balanceSompi: 0n,
      path: "m/44'/111111'/0'/0/0",
      index: 0,
      isChange: false,
      coinType: 111111,
    });
    discoveredAddresses.push({
      address: primaryChangeAddress,
      balanceSompi: 0n,
      path: "m/44'/111111'/0'/1/0",
      index: 0,
      isChange: true,
      coinType: 111111,
    });

    for (const coinType of coinTypes) {
      for (const isChange of [false, true]) {
        const changeVal = isChange ? 1 : 0;
        const batchSize = 3;
        let consecutiveEmptyBatches = 0;

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

          let batchHasActivity = false;

          const results = await Promise.all(
            batchItems.map(async (item) => {
              try {
                // Fetch balance, UTXOs, and transactions with individual catch blocks
                const balance = await fetchKaspaAddressBalance(item.addr).catch(() => null);
                const utxos = await fetchKaspaAddressUtxos(item.addr).catch(() => null);
                const txs = await fetchKaspaAddressTransactions(item.addr).catch(() => null);

                totalScanned++;
                if (onProgress) {
                  onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
                }
                return { item, balance, utxos, txs };
              } catch {
                totalScanned++;
                if (onProgress) {
                  onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
                }
                return { item, balance: null, utxos: null, txs: null };
              }
            })
          );

          for (const res of results) {
            const utxosSum = (res.utxos && Array.isArray(res.utxos))
              ? res.utxos.reduce((sum: bigint, u: any) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n)
              : 0n;
            const apiBal = res.balance !== null && res.balance !== undefined ? res.balance : 0n;
            const currentBal = utxosSum > apiBal ? utxosSum : apiBal;

            const hasBalance = currentBal > 0n;
            const hasUtxos = res.utxos !== null && Array.isArray(res.utxos) && res.utxos.length > 0;
            const hasTxs = res.txs !== null && Array.isArray(res.txs) && res.txs.length > 0;

            if (hasBalance || hasUtxos || hasTxs) {
              batchHasActivity = true;

              // Check if address is already in discoveredAddresses
              const existingIdx = discoveredAddresses.findIndex(d => d.address === res.item.addr);
              if (existingIdx >= 0) {
                discoveredAddresses[existingIdx].balanceSompi = currentBal;
              } else {
                discoveredAddresses.push({
                  address: res.item.addr,
                  balanceSompi: currentBal,
                  path: res.item.path,
                  index: res.item.idx,
                  isChange,
                  coinType,
                });
              }

              if (res.utxos && Array.isArray(res.utxos)) {
                res.utxos.forEach((u: any) => {
                  const outpointTxId = u.outpoint?.transactionId || u.transactionId || u.txid || '';
                  const outpointIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
                  const outpointKey = `${outpointTxId}:${outpointIndex}`;
                  
                  allUtxosMap.set(outpointKey, {
                    ...u,
                    derivationPath: res.item.path,
                    address: res.item.addr,
                  });
                });
              }

              if (res.txs && Array.isArray(res.txs)) {
                res.txs.forEach((t: any) => {
                  const txid = typeof t === 'string' ? t : (t.transaction_id || t.txid || t.id || '');
                  if (txid && !allTransactionsMap.has(txid)) {
                    allTransactionsMap.set(txid, typeof t === 'string' ? { transaction_id: txid } : t);
                  }
                });
              }
            }
          }

          // Calculate total balance from all outpoint-deduplicated UTXOs
          totalBalanceSompi = Array.from(allUtxosMap.values()).reduce(
            (sum, u) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0),
            0n
          );

          if (onProgress) {
            onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
          }

          // Delay between batches to prevent rate limiting node REST endpoints
          await new Promise((r) => setTimeout(r, 100));

          if (batchHasActivity) {
            consecutiveEmptyBatches = 0;
          } else {
            consecutiveEmptyBatches++;
            // Stop early if 10 consecutive empty batches (30 empty addresses) and reached threshold
            if (consecutiveEmptyBatches >= 10 && i >= 30) {
              break;
            }
          }
        }
      }
    }

    return {
      primaryAddress,
      primaryChangeAddress,
      totalBalanceSompi,
      discoveredAddresses,
      allUtxos: Array.from(allUtxosMap.values()),
      allTransactions: Array.from(allTransactionsMap.values()),
    };
  } finally {
    wipe(seedArray);
  }
}

/**
 * Perform secure, fully isolated BIP44 Chain Index scan using only public key derivation inputs.
 * Excludes private keys and seed phrases from memory entirely.
 */
export async function scanKaspaWalletChainPublic(
  deriver: PublicAddressDeriver,
  addressType: 'P2PKH' | 'P2SH' = 'P2PKH',
  gapLimit: number = 30,
  onProgress?: (scannedCount: number, foundCount: number, balanceSompi: bigint) => void
): Promise<{
  totalBalanceSompi: bigint;
  discoveredAddresses: DiscoveredAddressInfo[];
  allUtxos: any[];
  allTransactions: any[];
}> {
  const discoveredAddresses: DiscoveredAddressInfo[] = [];
  const allUtxosMap = new Map<string, any>();
  const allTransactionsMap = new Map<string, any>();
  let totalBalanceSompi = 0n;
  let totalScanned = 0;

  for (const isChange of [false, true]) {
    const chainType = isChange ? 'change' : 'receive';
    const batchSize = 3;
    let consecutiveEmptyBatches = 0;

    for (let i = 0; i < gapLimit; i += batchSize) {
      const batchIndices = Array.from({ length: Math.min(batchSize, gapLimit - i) }, (_, idx) => i + idx);

      const batchItems = await Promise.all(
        batchIndices.map(async (idx) => {
          try {
            const derived = await deriver(chainType, idx, addressType);
            return { idx, path: derived.derivationPath, addr: derived.address };
          } catch {
            return null;
          }
        })
      );

      const activeBatchItems = batchItems.filter(Boolean) as { idx: number; path: string; addr: string }[];
      if (activeBatchItems.length === 0) break;

      let batchHasActivity = false;

      const results = await Promise.all(
        activeBatchItems.map(async (item) => {
          try {
            const balance = await fetchKaspaAddressBalance(item.addr).catch(() => null);
            const utxos = await fetchKaspaAddressUtxos(item.addr).catch(() => null);
            const txs = await fetchKaspaAddressTransactions(item.addr).catch(() => null);

            totalScanned++;
            return { item, balance, utxos, txs };
          } catch {
            totalScanned++;
            return { item, balance: null, utxos: null, txs: null };
          }
        })
      );

      for (const res of results) {
        const utxosSum = (res.utxos && Array.isArray(res.utxos))
          ? res.utxos.reduce((sum: bigint, u: any) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n)
          : 0n;
        const apiBal = res.balance !== null && res.balance !== undefined ? res.balance : 0n;
        const currentBal = utxosSum > apiBal ? utxosSum : apiBal;

        const hasBalance = currentBal > 0n;
        const hasUtxos = res.utxos !== null && Array.isArray(res.utxos) && res.utxos.length > 0;
        const hasTxs = res.txs !== null && Array.isArray(res.txs) && res.txs.length > 0;

        if (hasBalance || hasUtxos || hasTxs) {
          batchHasActivity = true;

          const existingIdx = discoveredAddresses.findIndex(d => d.address === res.item.addr);
          if (existingIdx >= 0) {
            discoveredAddresses[existingIdx].balanceSompi = currentBal;
          } else {
            discoveredAddresses.push({
              address: res.item.addr,
              balanceSompi: currentBal,
              path: res.item.path,
              index: res.item.idx,
              isChange,
              coinType: 111111,
            });
          }

          if (res.utxos && Array.isArray(res.utxos)) {
            res.utxos.forEach((u: any) => {
              const outpointTxId = u.outpoint?.transactionId || u.transactionId || u.txid || '';
              const outpointIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
              const outpointKey = `${outpointTxId}:${outpointIndex}`;

              allUtxosMap.set(outpointKey, {
                ...u,
                derivationPath: res.item.path,
                address: res.item.addr,
              });
            });
          }

          if (res.txs && Array.isArray(res.txs)) {
            res.txs.forEach((t: any) => {
              const txid = typeof t === 'string' ? t : (t.transaction_id || t.txid || t.id || '');
              if (txid && !allTransactionsMap.has(txid)) {
                allTransactionsMap.set(txid, typeof t === 'string' ? { transaction_id: txid } : t);
              }
            });
          }
        }
      }

      totalBalanceSompi = Array.from(allUtxosMap.values()).reduce(
        (sum, u) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0),
        0n
      );

      if (onProgress) {
        onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
      }

      await new Promise((r) => setTimeout(r, 100));

      if (batchHasActivity) {
        consecutiveEmptyBatches = 0;
      } else {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= 10 && i >= 30) {
          break;
        }
      }
    }
  }

  return {
    totalBalanceSompi,
    discoveredAddresses,
    allUtxos: Array.from(allUtxosMap.values()),
    allTransactions: Array.from(allTransactionsMap.values()),
  };
}
