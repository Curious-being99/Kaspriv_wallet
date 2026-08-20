import { mnemonicToSeedSync } from '@scure/bip39';
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
  primaryChangeAddress: string;
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
  const seedArray = mnemonicToSeedSync(mnemonic, passphrase || '');
  
  try {
    const root = HDKey.fromMasterSeed(seedArray);
    const discoveredAddresses: DiscoveredAddressInfo[] = [];
    const allUtxos: any[] = [];
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
        primaryChangeAddress,
        totalBalanceSompi,
        discoveredAddresses,
        allUtxos,
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
        const batchSize = 5;
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
                // Fetch balance, UTXOs, and transactions with individual catch blocks so a failure in one doesn't drop the balance
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
                  // Avoid duplicate UTXOs
                  const exists = allUtxos.some(existing => 
                    (existing.outpoint?.transactionId || existing.txid) === outpointTxId && 
                    (existing.outpoint?.index !== undefined ? existing.outpoint.index : existing.vout) === outpointIndex
                  );
                  if (!exists) {
                    allUtxos.push({
                      ...u,
                      derivationPath: res.item.path,
                      address: res.item.addr,
                    });
                  }
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

          // Calculate precise total balance from all accumulated UTXOs and address balances
          const utxoTotal = allUtxos.reduce((sum, u) => sum + BigInt(u.utxoEntry?.amount || u.amount || 0), 0n);
          const addressBalanceTotal = discoveredAddresses.reduce((sum, d) => sum + (d.balanceSompi || 0n), 0n);
          totalBalanceSompi = utxoTotal > addressBalanceTotal ? utxoTotal : addressBalanceTotal;

          if (onProgress) {
            onProgress(totalScanned, discoveredAddresses.length, totalBalanceSompi);
          }

          // Yield execution briefly to keep mobile UI responsive during scanning
          await new Promise((r) => setTimeout(r, 10));

          if (batchHasActivity) {
            consecutiveEmptyBatches = 0;
          } else {
            consecutiveEmptyBatches++;
            // Stop scanning this subchain early only after 6 consecutive empty batches (30 addresses) past index 25
            if (consecutiveEmptyBatches >= 6 && i >= 25) {
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
      allUtxos,
      allTransactions: Array.from(allTransactionsMap.values()),
    };
  } finally {
    wipe(seedArray);
  }
}
