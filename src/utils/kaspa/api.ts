let GLOBAL_API_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_API_URL : undefined) || 'https://api.kaspa.org') as string;
let GLOBAL_EXPLORER_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_EXPLORER_URL : undefined) || 'https://explorer.kaspa.org') as string;

const DEFAULT_MAINNET_NODES = [
  'https://api.kaspa.org',
  'https://api.kaspa.net',
  'https://api-mainnet.kaspa.org',
  'https://api.kaspad.net',
  'https://kaspa.aspectron.org',
];

const DEFAULT_TESTNET_NODES = [
  'https://api-testnet-10.kaspa.org',
];

export function getCandidateApiUrls(preferredUrl?: string): string[] {
  const current = (preferredUrl || getKaspaApiUrl()).trim().replace(/\/+$/, '');
  const isTestnet = current.includes('testnet');
  const defaults = isTestnet ? DEFAULT_TESTNET_NODES : DEFAULT_MAINNET_NODES;

  const candidateSet = new Set<string>();
  if (current) candidateSet.add(current);
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

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000, retries = 1): Promise<Response> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      lastError = err;
      if (attempt < retries) {
        // Small jitter backoff before retrying
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error(`Request timeout after ${timeoutMs}ms`);
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

  return cachedPriceData || { price: 0.0278, usd24hChange: 0.0 };
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

export async function fetchKaspaAddressBalance(address: string): Promise<bigint | null> {
  if (!address) return null;
  const cleanAddr = address.trim();
  const candidates = getCandidateApiUrls();

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

export async function fetchKaspaAddressUtxos(address: string): Promise<KaspaUtxo[] | null> {
  if (!address) return null;
  const cleanAddr = address.trim();
  const candidates = getCandidateApiUrls();

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

export async function fetchKaspaAddressesUtxos(addresses: string[]): Promise<KaspaUtxo[] | null> {
  if (!addresses || addresses.length === 0) return [];
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());

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
          const validUtxos = data
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
export async function broadcastKaspaTransaction(txPayload: any): Promise<{ success: boolean; txId?: string; error?: string }> {
  const candidateUrls = getCandidateApiUrls();
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
      const rawAmt = outTx?.amount;
      let safeAmount: number | string;
      if (typeof rawAmt === 'bigint') {
        safeAmount = rawAmt <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawAmt) : rawAmt.toString();
      } else if (typeof rawAmt === 'number') {
        safeAmount = Number.isSafeInteger(rawAmt) ? rawAmt : String(rawAmt);
      } else if (typeof rawAmt === 'string') {
        const parsed = Number(rawAmt);
        safeAmount = Number.isSafeInteger(parsed) ? parsed : rawAmt;
      } else {
        safeAmount = 0;
      }

      return {
        amount: safeAmount,
        scriptPublicKey: {
          version: Number(outTx?.scriptPublicKey?.version || 0),
          scriptPublicKey: String(outTx?.scriptPublicKey?.scriptPublicKey || outTx?.scriptPublicKey || '').toLowerCase()
        }
      };
    }) : [],
    lockTime: Number(rawTx?.lockTime || 0),
    subnetworkId: String(rawTx?.subnetworkId || '0000000000000000000000000000000000000000')
  };

  const bodyPayload = { transaction: formattedTx };
  let lastErrorMsg = 'Network connection failed while broadcasting transaction across all candidate endpoints';

  for (const baseUrl of candidateUrls) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      }, 10000, 0);

      const data = await res.json().catch(() => null);
      const returnedTxId = data?.transactionId || data?.txId || data?.id || data?.result;

      if (res.ok && returnedTxId) {
        console.log(`[Kaspa Node Broadcast] Successfully broadcasted transaction via ${baseUrl}: ${returnedTxId}`);
        return { success: true, txId: String(returnedTxId) };
      }

      let errorMsg = `Kaspa node broadcast rejected (HTTP ${res.status})`;
      if (data) {
        const rawErr = extractKaspaError(data);
        if (rawErr) {
          if (rawErr.toLowerCase().includes('already in mempool') || rawErr.toLowerCase().includes('already accepted')) {
            console.log(`[Kaspa Node Broadcast] Transaction already accepted in mempool via ${baseUrl}`);
            return { success: true, txId: rawTx?.inputs?.[0]?.previousOutpoint?.transactionId || 'mempool_accepted' };
          } else if (rawErr.toLowerCase().includes('orphan')) {
            errorMsg = 'Orphan transaction: UTXO pending or not yet confirmed on-chain.';
          } else if (rawErr.toLowerCase().includes('fee')) {
            errorMsg = `Fee error: ${rawErr}`;
          } else if (rawErr.toLowerCase().includes('signature')) {
            errorMsg = 'Signature verification failed: Check key derivation or script parameters.';
          } else {
            errorMsg = rawErr;
          }
        }
      }

      console.warn(`[Kaspa Node Broadcast] Endpoint ${baseUrl} returned: ${errorMsg}`);
      lastErrorMsg = errorMsg;

      // Failover to next candidate on server errors or rate limiting
      if (res.status >= 500 || res.status === 429) {
        continue;
      }

      return { success: false, error: errorMsg };
    } catch (err: any) {
      const errMsg = err.message || 'Connection error';
      console.warn(`[Kaspa Node Broadcast] Connection error on ${baseUrl}: ${errMsg}. Failing over to next node...`);
      lastErrorMsg = `Connection error on ${baseUrl}: ${errMsg}`;
    }
  }

  console.error(`[Kaspa Node Broadcast] Broadcast failed across all candidate endpoints: ${lastErrorMsg}`);
  return { success: false, error: lastErrorMsg };
}
