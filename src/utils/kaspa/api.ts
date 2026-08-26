import { blake2b } from '@noble/hashes/blake2.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

let GLOBAL_API_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_API_URL : undefined) || 'https://api.kaspa.org') as string;
let GLOBAL_EXPLORER_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_EXPLORER_URL : undefined) || 'https://explorer.kaspa.org') as string;

const DEFAULT_MAINNET_NODES = [
  'https://api.kaspa.org',
  'https://api.kaspa.net',
  'https://api-mainnet.kaspa.org',
  'https://api.kaspad.net',
  'https://mainnet.kaspad.net',
  'https://kaspa.aspectron.org',
  'https://kaspa-mainnet.bitcointry.com',
  'https://api-v2.kaspa.org',
];

const DEFAULT_TESTNET_NODES = [
  'https://api-testnet-10.kaspa.org',
  'https://testnet-10.kaspad.net',
  'https://api.kaspa.org',
];

export function getCandidateApiUrls(network: string = 'mainnet', preferredUrl?: string, allowFailover = false): string[] {
  const current = (preferredUrl || getKaspaApiUrl()).trim().replace(/\/+$/, '');
  const isPrivateOrCustom = 
    current.includes('.onion') ||
    current.includes('localhost') ||
    current.includes('127.0.0.1') ||
    current.includes('10.') ||
    current.includes('192.168.') ||
    (!DEFAULT_MAINNET_NODES.includes(current) && !DEFAULT_TESTNET_NODES.includes(current));

  const candidateSet = new Set<string>();
  if (current) candidateSet.add(current);

  // If it's a private/custom node and failover is NOT explicitly allowed, do not add public defaults
  if (isPrivateOrCustom && !allowFailover) {
    return Array.from(candidateSet);
  }

  const isTestnet = network.includes('testnet');
  const defaults = isTestnet ? DEFAULT_TESTNET_NODES : DEFAULT_MAINNET_NODES;

  for (const fallback of defaults) {
    if (fallback) candidateSet.add(fallback.trim().replace(/\/+$/, ''));
  }

  return Array.from(candidateSet);
}

export function setKaspaApiUrl(url: string) {
  if (!url) return;
  GLOBAL_API_URL = url.trim().replace(/\/+$/, '');
}

export function setKaspaExplorerUrl(url: string) {
  if (!url) return;
  GLOBAL_EXPLORER_URL = url.trim().replace(/\/+$/, '');
}

export function getKaspaApiUrl(): string {
  const clean = (GLOBAL_API_URL || 'https://api.kaspa.org').trim().replace(/\/+$/, '');
  return clean || 'https://api.kaspa.org';
}

export function getKaspaExplorerUrl(): string {
  const clean = (GLOBAL_EXPLORER_URL || 'https://explorer.kaspa.org').trim().replace(/\/+$/, '');
  return clean || 'https://explorer.kaspa.org';
}

let cachedPriceData: { price: number; usd24hChange?: number } | null = null;
let lastPriceFetchTime = 0;
const PRICE_CACHE_TTL = 60000;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000, retries = 1): Promise<Response> {
  // If running inside Capacitor native Android container, use CapacitorHttp for native network transport
  if (Capacitor.isNativePlatform()) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let bodyData: any = undefined;
        if (options.body) {
          try {
            bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          } catch {
            bodyData = options.body;
          }
        }

        const method = (options.method || 'GET').toUpperCase();
        const capRes = await CapacitorHttp.request({
          url,
          method,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
          },
          data: bodyData,
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        });

        const status = capRes.status || 200;
        const responseBodyStr = typeof capRes.data === 'string' ? capRes.data : JSON.stringify(capRes.data || {});

        return new Response(responseBodyStr, {
          status,
          statusText: status >= 200 && status < 300 ? 'OK' : `Error ${status}`,
          headers: new Headers({
            'Content-Type': 'application/json',
            ...(capRes.headers || {}),
          }),
        });
      } catch (err: any) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 200));
        } else {
          // Fall back to standard fetch if native plugin failed
          break;
        }
      }
    }
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      const fetchPromise = fetch(url, {
        ...options,
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  throw lastError || new Error('Network request failed');
}

export async function fetchKaspaPrice(): Promise<{ price: number; usd24hChange?: number } | null> {
  const now = Date.now();
  if (cachedPriceData && (now - lastPriceFetchTime < PRICE_CACHE_TTL)) {
    return cachedPriceData;
  }

  let price = 0;
  let usd24hChange = 0;

  // 1. Direct Kaspa API price endpoint
  try {
    const res = await fetchWithTimeout(`${getKaspaApiUrl()}/info/price`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.price === 'number' && data.price > 0) {
        price = data.price;
      }
    }
  } catch {
    // Silent catch
  }

  // 2. CoinGecko simple price fallback if direct node price unavailable
  if (!price) {
    try {
      const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true', {}, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data?.kaspa) {
          price = Number(data.kaspa.usd) || 0;
          usd24hChange = Number(data.kaspa.usd_24h_change) || 0;
        }
      }
    } catch {
      // Silent catch
    }
  }

  if (price > 0) {
    cachedPriceData = { price, usd24hChange };
    lastPriceFetchTime = now;
    return cachedPriceData;
  }

  return cachedPriceData || { price: 0.0, usd24hChange: 0.0 };
}

export async function pingKaspaNode(apiUrl: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const cleanUrl = (apiUrl || getKaspaApiUrl()).trim().replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${cleanUrl}/info/virtual-chain-blue-score`, {}, 6000);
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      return { ok: true, latencyMs };
    }
    const resBlockdag = await fetchWithTimeout(`${cleanUrl}/info/blockdag`, {}, 6000);
    if (resBlockdag.ok) {
      return { ok: true, latencyMs: Math.round(performance.now() - start) };
    }
    return { ok: false, latencyMs: 999, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, latencyMs: 999, error: err.message || 'Connection timeout' };
  }
}

export async function fetchKaspaAddressBalance(address: string, network?: string): Promise<bigint | null> {
  if (!address) return null;
  const cleanAddr = address.trim();
  const inferredNetwork = network || (cleanAddr.startsWith('kaspatest') ? 'testnet' : (cleanAddr.startsWith('kaspadev') ? 'devnet' : 'mainnet'));
  const candidates = getCandidateApiUrls(inferredNetwork);

  for (const baseUrl of candidates) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/balance`, {}, 6000, 0);
      if (res.ok) {
        const data = await res.json();
        if (data && (typeof data.balance === 'number' || typeof data.balance === 'string' || typeof data.balance === 'bigint')) {
          return BigInt(data.balance);
        }
        return 0n;
      } else if (res.status === 400 || res.status === 404) {
        return 0n;
      }
    } catch {
      // Failover to next candidate URL
    }
  }
  return null;
}

export interface KaspaUtxo {
  address?: string;
  transactionId?: string;
  index?: number;
  amount?: string | number;
  scriptPublicKey?: string | { scriptPublicKey: string; version?: number };
  outpoint?: {
    transactionId: string;
    index: number;
  };
  utxoEntry?: {
    amount: string | number;
    scriptPublicKey: {
      scriptPublicKey: string;
      version?: number;
    };
    blockDaaScore?: string | number;
    isCoinbase?: boolean;
  };
}

export function validateAndCleanUtxo(raw: any): KaspaUtxo | null {
  if (!raw || typeof raw !== 'object') return null;

  let txId = raw.transactionId || raw.txid || raw.outpoint?.transactionId;
  if (typeof txId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txId)) {
    return null;
  }

  let idxVal = raw.index !== undefined ? raw.index : (raw.vout !== undefined ? raw.vout : raw.outpoint?.index);
  if (idxVal === undefined) return null;
  let idx = Number(idxVal);
  if (isNaN(idx) || idx < 0 || !Number.isInteger(idx)) {
    return null;
  }

  let amountVal = raw.amount !== undefined ? raw.amount : (raw.amountSompi !== undefined ? raw.amountSompi : raw.utxoEntry?.amount);
  if (amountVal === undefined) return null;
  let amountStr = String(amountVal);
  if (!/^\d+$/.test(amountStr)) {
    return null;
  }
  try {
    BigInt(amountStr);
  } catch {
    return null;
  }

  let spkHex = raw.scriptPublicKey || raw.utxoEntry?.scriptPublicKey?.scriptPublicKey || raw.utxoEntry?.scriptPublicKey || '';
  if (typeof spkHex === 'object' && spkHex !== null && typeof spkHex.scriptPublicKey === 'string') {
    spkHex = spkHex.scriptPublicKey;
  }
  if (typeof spkHex !== 'string' || !/^[0-9a-fA-F]+$/.test(spkHex)) {
    spkHex = '';
  }

  const cleanUtxo: KaspaUtxo = {
    address: typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : undefined,
    transactionId: txId.toLowerCase(),
    index: idx,
    amount: amountStr,
    scriptPublicKey: spkHex ? spkHex.toLowerCase() : '',
    outpoint: {
      transactionId: txId.toLowerCase(),
      index: idx
    },
    utxoEntry: {
      amount: amountStr,
      scriptPublicKey: {
        scriptPublicKey: spkHex ? spkHex.toLowerCase() : '',
        version: raw.utxoEntry?.scriptPublicKey?.version !== undefined ? Number(raw.utxoEntry.scriptPublicKey.version) : 0
      },
      blockDaaScore: raw.utxoEntry?.blockDaaScore !== undefined ? String(raw.utxoEntry.blockDaaScore) : (raw.blockDaaScore !== undefined ? String(raw.blockDaaScore) : undefined),
      isCoinbase: Boolean(raw.utxoEntry?.isCoinbase || raw.isCoinbase)
    }
  };

  return cleanUtxo;
}

export async function fetchKaspaAddressUtxos(address: string, network?: string): Promise<KaspaUtxo[] | null> {
  if (!address) return null;
  const cleanAddr = address.trim();
  const inferredNetwork = network || (cleanAddr.startsWith('kaspatest') ? 'testnet' : (cleanAddr.startsWith('kaspadev') ? 'devnet' : 'mainnet'));
  const candidates = getCandidateApiUrls(inferredNetwork);

  for (const baseUrl of candidates) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/utxos`, {}, 6000, 0);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const validUtxos = data
            .map(u => validateAndCleanUtxo({ ...u, address: u.address || cleanAddr }))
            .filter((u): u is KaspaUtxo => u !== null);
          return validUtxos;
        }
        return [];
      } else if (res.status === 400 || res.status === 404) {
        return [];
      }
    } catch {
      // Failover to next candidate URL
    }
  }
  return null;
}

// Rate limit & bulk endpoint capability cache
let bulkBalancesSupported: boolean | null = null;
let bulkUtxosSupported: boolean | null = null;
let cachedDaaScore: number | null = null;
let lastDaaScoreFetchTime = 0;
const DAA_SCORE_CACHE_TTL = 20000;

export function resetNodeCapabilities() {
  bulkBalancesSupported = null;
  bulkUtxosSupported = null;
}

export async function fetchKaspaAddressesBalances(addresses: string[]): Promise<{ [address: string]: bigint | null } | null> {
  if (!addresses || addresses.length === 0) return {};
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());

  // 1. Try bulk POST endpoint only if not previously marked unsupported
  if (bulkBalancesSupported !== false) {
    try {
      let res = await fetchWithTimeout(`${baseUrl}/addresses/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: cleanAddresses }),
      }, 6000, 0);

      if (!res.ok) {
        res = await fetchWithTimeout(`${baseUrl}/addresses/balances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanAddresses),
        }, 6000, 0);
      }

      if (res.ok) {
        const data = await res.json();
        const result: { [address: string]: bigint | null } = {};
        if (Array.isArray(data)) {
          bulkBalancesSupported = true;
          for (const item of data) {
            if (item && item.address && item.balance !== undefined) {
              result[item.address] = BigInt(item.balance);
            }
          }
          return result;
        } else if (data && typeof data === 'object') {
          bulkBalancesSupported = true;
          for (const [addr, bal] of Object.entries(data)) {
            if (bal !== undefined && bal !== null) {
              result[addr] = BigInt(bal as any);
            }
          }
          return result;
        }
      } else {
        bulkBalancesSupported = false;
      }
    } catch {
      bulkBalancesSupported = false;
    }
  }

  // 2. Sequential batched fallback respecting rate limits (3 addresses per batch with 120ms spacing)
  try {
    const results: { [address: string]: bigint | null } = {};
    const batchSize = 3;
    let anySuccess = false;

    for (let i = 0; i < cleanAddresses.length; i += batchSize) {
      const batch = cleanAddresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (addr) => {
          const bal = await fetchKaspaAddressBalance(addr);
          return { addr, bal };
        })
      );

      for (const { addr, bal } of batchResults) {
        results[addr] = bal;
        if (bal !== null) anySuccess = true;
      }

      if (i + batchSize < cleanAddresses.length) {
        await new Promise(r => setTimeout(r, 120));
      }
    }

    // If every single query failed, return null to signal a network error (preserves wallet state)
    if (!anySuccess && cleanAddresses.length > 0) {
      return null;
    }

    return results;
  } catch {
    return null;
  }
}

export async function fetchKaspaAddressesUtxos(addresses: string[], network?: string): Promise<KaspaUtxo[] | null> {
  if (!addresses || addresses.length === 0) return [];
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());
  const inferredNetwork = network || (cleanAddresses[0]?.startsWith('kaspatest') ? 'testnet' : (cleanAddresses[0]?.startsWith('kaspadev') ? 'devnet' : 'mainnet'));
  const candidates = getCandidateApiUrls(inferredNetwork);

  // 1. Try bulk POST endpoint only if not previously marked unsupported
  if (bulkUtxosSupported !== false) {
    try {
      let res = await fetchWithTimeout(`${baseUrl}/addresses/utxos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: cleanAddresses }),
      }, 6000, 0);

      if (!res.ok) {
        res = await fetchWithTimeout(`${baseUrl}/addresses/utxos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanAddresses),
        }, 6000, 0);
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          bulkUtxosSupported = true;
          
          // Support both flat array of UTXOs and grouped [{ address, utxos: [] }] formats
          const flattened = data.reduce((acc: any[], item: any) => {
            if (item && item.utxos && Array.isArray(item.utxos)) {
              return acc.concat(item.utxos.map((u: any) => ({ ...u, address: item.address || u.address })));
            }
            return acc.concat(item);
          }, []);

          const validUtxos = flattened
            .map(u => {
              const fallbackAddr = cleanAddresses.length === 1 ? cleanAddresses[0] : undefined;
              return validateAndCleanUtxo({ ...u, address: u.address || fallbackAddr });
            })
            .filter((u): u is KaspaUtxo => u !== null);
          return validUtxos;
        }
      } else {
        bulkUtxosSupported = false;
      }
    } catch {
      bulkUtxosSupported = false;
    }
  }

  // 2. Sequential batched fallback respecting rate limits (3 addresses per batch with 120ms spacing)
  try {
    const allUtxos: KaspaUtxo[] = [];
    const batchSize = 3;
    let anySuccess = false;

    for (let i = 0; i < cleanAddresses.length; i += batchSize) {
      const batch = cleanAddresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (addr) => {
          const utxos = await fetchKaspaAddressUtxos(addr);
          return { addr, utxos };
        })
      );

      for (const { utxos } of batchResults) {
        if (utxos !== null) {
          anySuccess = true;
          if (Array.isArray(utxos)) {
            allUtxos.push(...utxos);
          }
        }
      }

      if (i + batchSize < cleanAddresses.length) {
        await new Promise(r => setTimeout(r, 120));
      }
    }

    if (!anySuccess && cleanAddresses.length > 0) {
      return null;
    }

    return allUtxos;
  } catch {
    return null;
  }
}

export async function fetchKaspaTransaction(txid: string): Promise<any | null> {
  if (!txid) return null;
  const baseUrl = getKaspaApiUrl();
  const cleanTxid = txid.trim();

  try {
    const res = await fetchWithTimeout(`${baseUrl}/transactions/${encodeURIComponent(cleanTxid)}?inputs=true&outputs=true&resolve_previous_outpoints=light`, {}, 8000, 1);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch {}
  return null;
}

export async function fetchKaspaAddressTransactions(address: string, limit = 50): Promise<any[] | null> {
  if (!address) return null;
  const baseUrl = getKaspaApiUrl();
  const cleanAddr = address.trim();

  try {
    // 1. Try full-transactions endpoint first (includes inputs, outputs, resolved previous addresses, and fees)
    const fullUrls = [
      `${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/full-transactions?limit=${limit}&resolve_previous_outpoints=light`,
      `${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/full-transactions-page?limit=${limit}&resolve_previous_outpoints=light`,
      `${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/full-transactions?limit=${limit}`,
    ];

    for (const url of fullUrls) {
      try {
        const res = await fetchWithTimeout(url, {}, 8000, 1);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
          if (data && Array.isArray(data.transactions)) return data.transactions;
          if (data && Array.isArray(data.entries)) return data.entries;
          if (data && Array.isArray(data.result)) return data.result;
        } else if (res.status === 400 || res.status === 404) {
          return [];
        }
      } catch {}
    }

    // 2. Fallback to basic /transactions endpoint
    try {
      const resSimp = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/transactions?limit=${limit}`, {}, 8000, 1);
      if (resSimp.ok) {
        const data = await resSimp.json();
        let rawList: any[] = [];
        if (Array.isArray(data)) rawList = data;
        else if (data && Array.isArray(data.transactions)) rawList = data.transactions;
        else if (data && Array.isArray(data.entries)) rawList = data.entries;

        if (rawList.length > 0) {
          const hasOutputs = rawList.some((t: any) => t && (t.outputs || t.inputs));
          if (!hasOutputs) {
            const detailed = await Promise.all(
              rawList.slice(0, 15).map(async (item: any) => {
                const txid = typeof item === 'string' ? item : (item.transaction_id || item.txid || '');
                if (!txid) return item;
                const details = await fetchKaspaTransaction(txid);
                return details || item;
              })
            );
            return detailed.filter(Boolean);
          }
          return rawList;
        }
        return [];
      } else if (resSimp.status === 400 || resSimp.status === 404) {
        return [];
      }
    } catch {}

    return [];
  } catch {
    return null;
  }
}

export async function fetchKaspaCurrentDaaScore(): Promise<number | null> {
  const now = Date.now();
  if (cachedDaaScore !== null && (now - lastDaaScoreFetchTime < DAA_SCORE_CACHE_TTL)) {
    return cachedDaaScore;
  }

  const baseUrl = getKaspaApiUrl();
  try {
    const res = await fetchWithTimeout(`${baseUrl}/info/blockdag`, {}, 8000, 0);
    if (res.ok) {
      const data = await res.json();
      if (data && data.virtualSelectedParentBlueScore !== undefined) {
        const score = Number(data.virtualSelectedParentBlueScore);
        if (!isNaN(score) && score > 0) {
          cachedDaaScore = score;
          lastDaaScoreFetchTime = now;
          return score;
        }
      }
      if (data && data.virtualDaaScore !== undefined) {
        const score = Number(data.virtualDaaScore);
        if (!isNaN(score) && score > 0) {
          cachedDaaScore = score;
          lastDaaScoreFetchTime = now;
          return score;
        }
      }
    }
    const resBlue = await fetchWithTimeout(`${baseUrl}/info/virtual-chain-blue-score`, {}, 8000, 0);
    if (resBlue.ok) {
      const data = await resBlue.json();
      if (data && data.blueScore !== undefined) {
        const score = Number(data.blueScore);
        if (!isNaN(score) && score > 0) {
          cachedDaaScore = score;
          lastDaaScoreFetchTime = now;
          return score;
        }
      } else if (typeof data === 'number' && !isNaN(data) && data > 0) {
        cachedDaaScore = data;
        lastDaaScoreFetchTime = now;
        return data;
      }
    }
  } catch {
    // Silent catch - retain cached DAA score on network hiccups
  }
  return cachedDaaScore;
}

export async function fetchKaspaFeeEstimate(): Promise<{ priorityBucketFeeRate: number; normalBucketFeeRate: number; lowBucketFeeRate: number } | null> {
  const baseUrl = getKaspaApiUrl();
  try {
    const res = await fetchWithTimeout(`${baseUrl}/info/fee-estimate`, {}, 10000);
    if (!res.ok) return null;
    const data = await res.json();
    
    const priorityRate = Number(data?.priorityBucket?.feerate || data?.priorityBucketFeeRate || 100);
    const normalRate = Number(data?.normalBuckets?.[0]?.feerate || data?.normalBucketFeeRate || 100);
    const lowRate = Number(data?.lowBuckets?.[0]?.feerate || data?.lowBucketFeeRate || 100);

    return {
      priorityBucketFeeRate: isNaN(priorityRate) ? 100 : priorityRate,
      normalBucketFeeRate: isNaN(normalRate) ? 100 : normalRate,
      lowBucketFeeRate: isNaN(lowRate) ? 100 : lowRate,
    };
  } catch (err: any) {
    console.warn('[Kaspa API] Fee estimate fetch error:', err.message || err);
    return null;
  }
}

function extractKaspaError(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d: any) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
          const msg = d.msg || d.message || JSON.stringify(d);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(d);
      })
      .join('; ');
  }
  if (typeof data.error === 'object' && data.error !== null) {
    return data.error.message || data.error.detail || JSON.stringify(data.error);
  }
  if (typeof data.message === 'object' && data.message !== null) {
    return data.message.detail || data.message.msg || JSON.stringify(data.message);
  }
  return JSON.stringify(data);
}

/**
 * Broadcast Kaspa Transaction directly to candidate Kaspa REST endpoints with failover
 */
export async function broadcastKaspaTransaction(txPayload: any, network: string = 'mainnet'): Promise<{ success: boolean; txId?: string; error?: string }> {
  const candidateUrls = getCandidateApiUrls(network);
  const rawTx = txPayload?.transaction || txPayload;
  
  const formattedTx = {
    version: Number(rawTx?.version || 0),
    inputs: Array.isArray(rawTx?.inputs) ? rawTx.inputs.map((inTx: any) => ({
      previousOutpoint: {
        transactionId: String(inTx?.previousOutpoint?.transactionId || inTx?.transactionId || '').toLowerCase(),
        index: Number(inTx?.previousOutpoint?.index !== undefined ? inTx.previousOutpoint.index : (inTx?.index || 0))
      },
      signatureScript: String(inTx?.signatureScript || ''),
      sequence: Number(inTx?.sequence || 0),
      sigOpCount: Number(inTx?.sigOpCount !== undefined ? inTx.sigOpCount : 1)
    })) : [],
    outputs: Array.isArray(rawTx?.outputs) ? rawTx.outputs.map((outTx: any) => {
      const rawAmt = outTx?.amount !== undefined ? outTx.amount : (outTx?.value !== undefined ? outTx.value : 0);
      let safeAmountNum: number;
      if (typeof rawAmt === 'bigint') {
        safeAmountNum = Number(rawAmt);
      } else if (typeof rawAmt === 'number') {
        safeAmountNum = Math.floor(rawAmt);
      } else if (typeof rawAmt === 'string') {
        safeAmountNum = parseInt(rawAmt, 10) || 0;
      } else {
        safeAmountNum = 0;
      }

      return {
        amount: safeAmountNum,
        scriptPublicKey: {
          version: Number(outTx?.scriptPublicKey?.version || 0),
          scriptPublicKey: String(outTx?.scriptPublicKey?.scriptPublicKey || outTx?.scriptPublicKey?.script || outTx?.scriptPublicKey || '').toLowerCase()
        }
      };
    }) : [],
    lockTime: Number(rawTx?.lockTime || 0),
    subnetworkId: String(rawTx?.subnetworkId || '0000000000000000000000000000000000000000')
  };

  const bodyPayload = { transaction: formattedTx };
  const jsonBody = JSON.stringify(bodyPayload, (_, v) => typeof v === 'bigint' ? v.toString() : v);

  // Helper to attempt a single endpoint broadcast with tight timeout
  const attemptEndpoint = async (endpoint: string): Promise<{ success: boolean; txId?: string; error?: string }> => {
    const pathsToTry = ['/transactions', '/submit_transaction'];

    for (const apiPath of pathsToTry) {
      try {
        const res = await fetchWithTimeout(`${endpoint}${apiPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonBody,
        }, 4500, 0);

        const data = await res.json().catch(() => null);
        const returnedTxId = data?.transactionId || data?.txId || data?.id || data?.result || (typeof data === 'string' && /^[0-9a-fA-F]{64}$/.test(data.trim()) ? data.trim() : undefined);

        if (res.ok && returnedTxId) {
          console.log(`[Kaspa Node Broadcast] Successfully broadcasted transaction via ${endpoint}${apiPath}: ${returnedTxId}`);
          return { success: true, txId: String(returnedTxId) };
        }

        if (data) {
          const rawErr = extractKaspaError(data);
          if (rawErr) {
            const lowerErr = rawErr.toLowerCase();
            if (lowerErr.includes('already in mempool') || lowerErr.includes('already accepted')) {
              console.log(`[Kaspa Node Broadcast] Transaction already accepted in mempool via ${endpoint}`);
              return { success: true, txId: 'mempool_accepted' };
            } else if (lowerErr.includes('orphan')) {
              return { success: false, error: 'Orphan transaction: UTXO pending or not yet confirmed on-chain.' };
            } else if (lowerErr.includes('fee')) {
              return { success: false, error: `Fee error: ${rawErr}` };
            } else if (lowerErr.includes('signature')) {
              return { success: false, error: 'Signature verification failed: Check key derivation or script parameters.' };
            }
            // If not a 404, this endpoint responded with an actual Kaspa validation error
            if (res.status !== 404) {
              return { success: false, error: rawErr };
            }
          }
        }

        if (res.status !== 404) {
          return { success: false, error: `HTTP ${res.status}` };
        }
      } catch (err: any) {
        if (apiPath === pathsToTry[pathsToTry.length - 1]) {
          return { success: false, error: err?.message || 'Connection timeout' };
        }
      }
    }

    return { success: false, error: `HTTP 404 on ${endpoint}` };
  };

  // Concurrent Multi-Endpoint Racing Broadcast:
  // Fire requests simultaneously across all available endpoints with a race to resolve on the very first successful submission
  const broadcastPromises = candidateUrls.map((endpoint) => attemptEndpoint(endpoint));

  try {
    // Return immediately as soon as ANY node confirms the transaction
    const winner = await new Promise<{ success: boolean; txId?: string; error?: string }>((resolve) => {
      let pendingCount = broadcastPromises.length;
      let lastFailure = 'Failed to broadcast transaction to Kaspa network';

      broadcastPromises.forEach(p => {
        p.then(res => {
          if (res.success) {
            resolve(res);
          } else {
            if (res.error && !res.error.includes('Failed to fetch') && !res.error.includes('timeout')) {
              lastFailure = res.error;
            }
            pendingCount--;
            if (pendingCount === 0) {
              resolve({ success: false, error: lastFailure });
            }
          }
        }).catch(err => {
          pendingCount--;
          if (pendingCount === 0) {
            resolve({ success: false, error: err?.message || lastFailure });
          }
        });
      });
    });

    if (winner.success) {
      return winner;
    }
    console.error(`[Kaspa Node Broadcast] All candidate endpoints failed. Last error: ${winner.error}`);
    return winner;
  } catch (err: any) {
    console.error(`[Kaspa Node Broadcast] Exception during concurrent broadcast:`, err);
    return { success: false, error: err?.message || 'Broadcast failed' };
  }
}
