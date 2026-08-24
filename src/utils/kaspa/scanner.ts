import { XPrv } from '@kasdk/web';
import { wipe } from './common';
import { getAddressFromPublicKey, getCachedSeed } from './keys';
import {
  fetchKaspaAddressBalance,
  fetchKaspaAddressUtxos,
  fetchKaspaAddressesBalances,
  fetchKaspaAddressesUtxos,
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
  primaryChangeAddress: string;
  totalBalanceSompi: bigint;
  discoveredAddresses: DiscoveredAddressInfo[];
  allUtxos: any[];
  allTransactions: any[];
}

export type PublicAddressDeriver = (
  chain: 'receive' | 'change',
  index: number,
  scriptType: 'P2SH'
) => Promise<{ address: string; derivationPath: string }> | { address: string; derivationPath: string };

/**
 * Perform deep DAG Chain Index scanning across multiple HD paths, receive/change chains, and derivation indices.
 *
 * Fully secures seed memory, respects P2SH types, and computes deduplicated UTXO-based balances.
 */
export async function scanKaspaWalletChain(
  mnemonic: string,
  passphrase?: string,
  prefix: string = 'kaspa',
  addressType: 'P2SH' = 'P2SH',
  gapLimit: number = 50,
  onProgress?: (scannedCount: number, foundCount: number, balanceSompi: bigint) => void
): Promise<ScannedWalletChainResult> {
  const seedArray = await getCachedSeed(mnemonic, passphrase || '');
  const seedHex = Array.from(seedArray).map(b => b.toString(16).padStart(2, '0')).join('');
  
  try {
    const root = new XPrv(seedHex);
    const discoveredAddresses: DiscoveredAddressInfo[] = [];
    const allUtxosMap = new Map<string, any>();
    const allTransactionsMap = new Map<string, any>();
    let totalBalanceSompi = 0n;

    const hexToBytes = (hex: string): Uint8Array => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    };

    // Derive primary address and primary change address immediately (BIP44 format)
    const primaryChild = root.derivePath("m/44'/111111'/0'/0/0");
    const primaryXPub = primaryChild.toXPub();
    const primaryPK = primaryXPub.toPublicKey();
    const primaryAddress = getAddressFromPublicKey(hexToBytes(primaryPK.toString()), addressType, prefix);
    primaryPK.free();
    primaryXPub.free();
    primaryChild.free();

    const primaryChangeChild = root.derivePath("m/44'/111111'/0'/1/0");
    const primaryChangeXPub = primaryChangeChild.toXPub();
    const primaryChangePK = primaryChangeXPub.toPublicKey();
    const primaryChangeAddress = getAddressFromPublicKey(hexToBytes(primaryChangePK.toString()), addressType, prefix);
    primaryChangePK.free();
    primaryChangeXPub.free();
    primaryChangeChild.free();

    // Quick mode for brand new wallet creation (gapLimit <= 1)
    if (gapLimit <= 1) {
      if (onProgress) onProgress(1, 0, 0n);
      try {
        const [balance, utxos, txs] = await Promise.all([
          fetchKaspaAddressBalance(primaryAddress),
          fetchKaspaAddressUtxos(primaryAddress),
          fetchKaspaAddressTransactions(primaryAddress),
        ]);
        const utxoSum = (utxos && Array.isArray(utxos))
          ? utxos.reduce((acc: bigint, u: any) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n)
          : 0n;
        const currentBal = (balance !== null && balance > utxoSum) ? balance : utxoSum;
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

    const calculateCurrentTotalBalance = (): bigint => {
      const addrBalSum = discoveredAddresses.reduce((acc, d) => acc + (d.balanceSompi || 0n), 0n);
      const utxoBalSum = Array.from(allUtxosMap.values()).reduce(
        (acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0),
        0n
      );
      return utxoBalSum > addrBalSum ? utxoBalSum : addrBalSum;
    };

    for (const coinType of coinTypes) {
      for (const isChange of [false, true]) {
        const changeVal = isChange ? 1 : 0;
        const batchSize = 5;
        let consecutiveEmptyBatches = 0;

        for (let i = 0; i < gapLimit; i += batchSize) {
          const batchIndices = Array.from({ length: Math.min(batchSize, gapLimit - i) }, (_, idx) => i + idx);
          
          const batchItems = batchIndices.map((idx) => {
            const path = `m/44'/${coinType}'/0'/${changeVal}/${idx}`;
            try {
              const child = root.derivePath(path);
              const xpub = child.toXPub();
              const pk = xpub.toPublicKey();
              const addr = getAddressFromPublicKey(hexToBytes(pk.toString()), addressType, prefix);
              pk.free();
              xpub.free();
              child.free();
              return { idx, path, addr };
            } catch {
              return null;
            }
          }).filter(Boolean) as { idx: number; path: string; addr: string }[];

          if (batchItems.length === 0) break;

          const batchAddrs = batchItems.map(item => item.addr);
          let batchHasActivity = false;

          // 1. Fetch bulk balances and bulk UTXOs for this batch
          const [bulkBalancesRes, bulkUtxosRes] = await Promise.all([
            fetchKaspaAddressesBalances(batchAddrs).catch(() => null),
            fetchKaspaAddressesUtxos(batchAddrs).catch(() => null),
          ]);

          const utxosByAddress = new Map<string, any[]>();
          if (bulkUtxosRes && Array.isArray(bulkUtxosRes)) {
            bulkUtxosRes.forEach((u: any) => {
              const uAddr = u.address || (batchAddrs.length === 1 ? batchAddrs[0] : '');
              if (uAddr) {
                const list = utxosByAddress.get(uAddr) || [];
                list.push(u);
                utxosByAddress.set(uAddr, list);
              }
            });
          }

          for (const item of batchItems) {
            totalScanned++;
            
            // Get balance for this address
            let addrBal: bigint = 0n;
            if (bulkBalancesRes && bulkBalancesRes[item.addr] !== undefined && bulkBalancesRes[item.addr] !== null) {
              addrBal = bulkBalancesRes[item.addr]!;
            } else {
              // Fallback single address balance fetch
              const singleBal = await fetchKaspaAddressBalance(item.addr).catch(() => null);
              if (singleBal !== null) addrBal = singleBal;
            }

            // Get UTXOs for this address
            let addrUtxos: any[] = utxosByAddress.get(item.addr) || [];
            if (addrUtxos.length === 0 && addrBal > 0n) {
              // Fallback single address utxo query if balance exists
              const singleUtxos = await fetchKaspaAddressUtxos(item.addr).catch(() => null);
              if (singleUtxos && Array.isArray(singleUtxos)) {
                addrUtxos = singleUtxos;
              }
            }

            const utxosSum = addrUtxos.reduce(
              (sum: bigint, u: any) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0),
              0n
            );
            const currentBal = utxosSum > addrBal ? utxosSum : addrBal;

            if (currentBal > 0n || addrUtxos.length > 0) {
              batchHasActivity = true;

              // Check if address is already in discoveredAddresses
              const existingIdx = discoveredAddresses.findIndex(d => d.address === item.addr);
              if (existingIdx >= 0) {
                discoveredAddresses[existingIdx].balanceSompi = currentBal;
              } else {
                discoveredAddresses.push({
                  address: item.addr,
                  balanceSompi: currentBal,
                  path: item.path,
                  index: item.idx,
                  isChange,
                  coinType,
                });
              }

              addrUtxos.forEach((u: any) => {
                const outpointTxId = u.outpoint?.transactionId || u.transactionId || u.txid || '';
                const outpointIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
                const outpointKey = `${outpointTxId}:${outpointIndex}`;
                
                allUtxosMap.set(outpointKey, {
                  ...u,
                  derivationPath: item.path,
                  address: item.addr,
                });
              });

              // Fetch transactions only for active addresses to avoid flooding the node
              fetchKaspaAddressTransactions(item.addr).then(txs => {
                if (txs && Array.isArray(txs)) {
                  txs.forEach((t: any) => {
                    const txid = typeof t === 'string' ? t : (t.transaction_id || t.txid || t.id || '');
                    if (txid && !allTransactionsMap.has(txid)) {
                      allTransactionsMap.set(txid, typeof t === 'string' ? { transaction_id: txid } : t);
                    }
                  });
                }
              }).catch(() => {});
            }
          }

          totalBalanceSompi = calculateCurrentTotalBalance();

          if (onProgress) {
            const activeCount = discoveredAddresses.filter(d => d.balanceSompi > 0n).length || discoveredAddresses.length;
            onProgress(totalScanned, activeCount, totalBalanceSompi);
          }

          // Spacing between batches
          await new Promise((r) => setTimeout(r, 60));

          if (batchHasActivity) {
            consecutiveEmptyBatches = 0;
          } else {
            consecutiveEmptyBatches++;
            // Stop early if 10 consecutive empty batches (50 empty addresses) and reached at least 30 addresses
            if (consecutiveEmptyBatches >= 10 && i >= 30) {
              break;
            }
          }
        }
      }
    }

    totalBalanceSompi = calculateCurrentTotalBalance();
    root.free();

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
  addressType: 'P2SH' = 'P2SH',
  gapLimit: number = 50,
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

  const calculateCurrentTotalBalance = (): bigint => {
    const addrBalSum = discoveredAddresses.reduce((acc, d) => acc + (d.balanceSompi || 0n), 0n);
    const utxoBalSum = Array.from(allUtxosMap.values()).reduce(
      (acc, u) => acc + BigInt(u.utxoEntry?.amount || u.amount || 0),
      0n
    );
    return utxoBalSum > addrBalSum ? utxoBalSum : addrBalSum;
  };

  for (const isChange of [false, true]) {
    const chainType = isChange ? 'change' : 'receive';
    const batchSize = 5;
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

      const batchAddrs = activeBatchItems.map(item => item.addr);
      let batchHasActivity = false;

      const [bulkBalancesRes, bulkUtxosRes] = await Promise.all([
        fetchKaspaAddressesBalances(batchAddrs).catch(() => null),
        fetchKaspaAddressesUtxos(batchAddrs).catch(() => null),
      ]);

      const utxosByAddress = new Map<string, any[]>();
      if (bulkUtxosRes && Array.isArray(bulkUtxosRes)) {
        bulkUtxosRes.forEach((u: any) => {
          const uAddr = u.address || (batchAddrs.length === 1 ? batchAddrs[0] : '');
          if (uAddr) {
            const list = utxosByAddress.get(uAddr) || [];
            list.push(u);
            utxosByAddress.set(uAddr, list);
          }
        });
      }

      for (const item of activeBatchItems) {
        totalScanned++;

        let addrBal: bigint = 0n;
        if (bulkBalancesRes && bulkBalancesRes[item.addr] !== undefined && bulkBalancesRes[item.addr] !== null) {
          addrBal = bulkBalancesRes[item.addr]!;
        } else {
          const singleBal = await fetchKaspaAddressBalance(item.addr).catch(() => null);
          if (singleBal !== null) addrBal = singleBal;
        }

        let addrUtxos: any[] = utxosByAddress.get(item.addr) || [];
        if (addrUtxos.length === 0 && addrBal > 0n) {
          const singleUtxos = await fetchKaspaAddressUtxos(item.addr).catch(() => null);
          if (singleUtxos && Array.isArray(singleUtxos)) {
            addrUtxos = singleUtxos;
          }
        }

        const utxosSum = addrUtxos.reduce(
          (sum: bigint, u: any) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0),
          0n
        );
        const currentBal = utxosSum > addrBal ? utxosSum : addrBal;

        if (currentBal > 0n || addrUtxos.length > 0) {
          batchHasActivity = true;

          const existingIdx = discoveredAddresses.findIndex(d => d.address === item.addr);
          if (existingIdx >= 0) {
            discoveredAddresses[existingIdx].balanceSompi = currentBal;
          } else {
            discoveredAddresses.push({
              address: item.addr,
              balanceSompi: currentBal,
              path: item.path,
              index: item.idx,
              isChange,
              coinType: 111111,
            });
          }

          addrUtxos.forEach((u: any) => {
            const outpointTxId = u.outpoint?.transactionId || u.transactionId || u.txid || '';
            const outpointIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
            const outpointKey = `${outpointTxId}:${outpointIndex}`;

            allUtxosMap.set(outpointKey, {
              ...u,
              derivationPath: item.path,
              address: item.addr,
            });
          });

          fetchKaspaAddressTransactions(item.addr).then(txs => {
            if (txs && Array.isArray(txs)) {
              txs.forEach((t: any) => {
                const txid = typeof t === 'string' ? t : (t.transaction_id || t.txid || t.id || '');
                if (txid && !allTransactionsMap.has(txid)) {
                  allTransactionsMap.set(txid, typeof t === 'string' ? { transaction_id: txid } : t);
                }
              });
            }
          }).catch(() => {});
        }
      }

      totalBalanceSompi = calculateCurrentTotalBalance();

      if (onProgress) {
        const activeCount = discoveredAddresses.filter(d => d.balanceSompi > 0n).length || discoveredAddresses.length;
        onProgress(totalScanned, activeCount, totalBalanceSompi);
      }

      await new Promise((r) => setTimeout(r, 60));

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

  totalBalanceSompi = calculateCurrentTotalBalance();

  return {
    totalBalanceSompi,
    discoveredAddresses,
    allUtxos: Array.from(allUtxosMap.values()),
    allTransactions: Array.from(allTransactionsMap.values()),
  };
}

