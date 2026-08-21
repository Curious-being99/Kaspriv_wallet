let GLOBAL_API_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_API_URL : undefined) || 'https://api.kaspa.org') as string;
let GLOBAL_EXPLORER_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_EXPLORER_URL : undefined) || 'https://explorer.kaspa.org') as string;

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

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
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
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
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
  const baseUrl = getKaspaApiUrl();
  const cleanAddr = address.trim();

  try {
    const res = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/balance`, {}, 15000);
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return 0n;
      return null;
    }
    const data = await res.json();
    if (data && (typeof data.balance === 'number' || typeof data.balance === 'string' || typeof data.balance === 'bigint')) {
      return BigInt(data.balance);
    }
    return 0n;
  } catch (err: any) {
    console.warn(`[Kaspa API] Balance fetch error for ${cleanAddr}:`, err.message || err);
    return null;
  }
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

  let txId = raw.transactionId || raw.outpoint?.transactionId;
  if (typeof txId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txId)) {
    return null;
  }

  let idxVal = raw.index !== undefined ? raw.index : raw.outpoint?.index;
  if (idxVal === undefined) return null;
  let idx = Number(idxVal);
  if (isNaN(idx) || idx < 0 || !Number.isInteger(idx)) {
    return null;
  }

  let amountVal = raw.amount !== undefined ? raw.amount : raw.utxoEntry?.amount;
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

  let spkHex = raw.scriptPublicKey || raw.utxoEntry?.scriptPublicKey?.scriptPublicKey || raw.utxoEntry?.scriptPublicKey;
  if (typeof spkHex === 'object' && spkHex !== null && typeof spkHex.scriptPublicKey === 'string') {
    spkHex = spkHex.scriptPublicKey;
  }
  if (typeof spkHex !== 'string' || !/^[0-9a-fA-F]+$/.test(spkHex)) {
    return null;
  }

  const cleanUtxo: KaspaUtxo = {
    address: typeof raw.address === 'string' ? raw.address.trim() : undefined,
    transactionId: txId.toLowerCase(),
    index: idx,
    amount: amountStr,
    scriptPublicKey: spkHex.toLowerCase(),
    outpoint: {
      transactionId: txId.toLowerCase(),
      index: idx
    },
    utxoEntry: {
      amount: amountStr,
      scriptPublicKey: {
        scriptPublicKey: spkHex.toLowerCase(),
        version: raw.utxoEntry?.scriptPublicKey?.version !== undefined ? Number(raw.utxoEntry.scriptPublicKey.version) : 0
      },
      blockDaaScore: raw.utxoEntry?.blockDaaScore !== undefined ? String(raw.utxoEntry.blockDaaScore) : undefined,
      isCoinbase: Boolean(raw.utxoEntry?.isCoinbase)
    }
  };

  return cleanUtxo;
}

export async function fetchKaspaAddressUtxos(address: string): Promise<KaspaUtxo[] | null> {
  if (!address) return null;
  const baseUrl = getKaspaApiUrl();
  const cleanAddr = address.trim();

  try {
    const res = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/utxos`, {}, 10000);
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return [];
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      const validUtxos = data
        .map(validateAndCleanUtxo)
        .filter((u): u is KaspaUtxo => u !== null);
      return validUtxos;
    }
    return [];
  } catch (err: any) {
    console.warn(`[Kaspa API] UTXOs fetch error for ${cleanAddr}:`, err.message || err);
    return null;
  }
}

export async function fetchKaspaAddressesBalances(addresses: string[]): Promise<{ [address: string]: bigint } | null> {
  if (!addresses || addresses.length === 0) return {};
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());

  try {
    let res = await fetchWithTimeout(`${baseUrl}/addresses/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: cleanAddresses }),
    }, 15000);

    if (!res.ok) {
      res = await fetchWithTimeout(`${baseUrl}/addresses/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanAddresses),
      }, 15000);
    }

    if (res.ok) {
      const data = await res.json();
      const result: { [address: string]: bigint } = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.address && item.balance !== undefined) {
            result[item.address] = BigInt(item.balance);
          }
        }
        return result;
      } else if (data && typeof data === 'object') {
        for (const [addr, bal] of Object.entries(data)) {
          if (bal !== undefined && bal !== null) {
            result[addr] = BigInt(bal as any);
          }
        }
        return result;
      }
    }
  } catch (err: any) {
    console.warn(`[Kaspa API] Bulk balances fetch error, falling back to individual calls:`, err?.message || err);
  }

  try {
    const results: { [address: string]: bigint } = {};
    const promises = cleanAddresses.map(async (addr) => {
      const bal = await fetchKaspaAddressBalance(addr);
      results[addr] = bal !== null ? bal : 0n;
    });
    await Promise.all(promises);
    return results;
  } catch (err: any) {
    console.warn(`[Kaspa API] Individual balances fallback error:`, err?.message || err);
    return null;
  }
}

export async function fetchKaspaAddressesUtxos(addresses: string[]): Promise<KaspaUtxo[] | null> {
  if (!addresses || addresses.length === 0) return [];
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());

  try {
    let res = await fetchWithTimeout(`${baseUrl}/addresses/utxos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: cleanAddresses }),
    }, 15000);

    if (!res.ok) {
      res = await fetchWithTimeout(`${baseUrl}/addresses/utxos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanAddresses),
      }, 15000);
    }

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const validUtxos = data
          .map(validateAndCleanUtxo)
          .filter((u): u is KaspaUtxo => u !== null);
        return validUtxos;
      }
    }
  } catch (err: any) {
    console.warn(`[Kaspa API] Bulk UTXOs fetch error, falling back to individual calls:`, err?.message || err);
  }

  try {
    const allUtxos: KaspaUtxo[] = [];
    const promises = cleanAddresses.map(async (addr) => {
      const utxos = await fetchKaspaAddressUtxos(addr);
      if (utxos && Array.isArray(utxos)) {
        allUtxos.push(...utxos);
      }
    });
    await Promise.all(promises);
    return allUtxos;
  } catch (err: any) {
    console.warn(`[Kaspa API] Individual UTXOs fallback error:`, err?.message || err);
    return null;
  }
}

export async function fetchKaspaAddressTransactions(address: string): Promise<any[] | null> {
  if (!address) return null;
  const baseUrl = getKaspaApiUrl();
  const cleanAddr = address.trim();

  try {
    const resSimp = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/transactions?limit=20`, {}, 8000);
    if (resSimp.ok) {
      const data = await resSimp.json();
      if (Array.isArray(data)) return data;
    }

    const res = await fetchWithTimeout(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/full-transactions?limit=20&resolve_previous_outpoints=light`, {}, 10000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }

    return [];
  } catch (err: any) {
    console.warn(`[Kaspa API] Transactions fetch error for ${cleanAddr}:`, err.message || err);
    return null;
  }
}

export async function fetchKaspaCurrentDaaScore(): Promise<number | null> {
  const baseUrl = getKaspaApiUrl();
  try {
    const res = await fetchWithTimeout(`${baseUrl}/info/blockdag`, {}, 10000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.virtualSelectedParentBlueScore !== undefined) {
        return Number(data.virtualSelectedParentBlueScore);
      }
      if (data && data.virtualDaaScore !== undefined) {
        return Number(data.virtualDaaScore);
      }
    }
    const resBlue = await fetchWithTimeout(`${baseUrl}/info/virtual-chain-blue-score`, {}, 10000);
    if (resBlue.ok) {
      const data = await resBlue.json();
      if (data && data.blueScore !== undefined) {
        return Number(data.blueScore);
      } else if (typeof data === 'number') {
        return data;
      }
    }
  } catch (err: any) {
    console.warn('[Kaspa API] DAA Score fetch error:', err.message || err);
  }
  return null;
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
 * Broadcast Kaspa Transaction directly to primary Kaspa node REST endpoint
 */
export async function broadcastKaspaTransaction(txPayload: any): Promise<{ success: boolean; txId?: string; error?: string }> {
  const baseUrl = getKaspaApiUrl();
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

  try {
    const res = await fetchWithTimeout(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    }, 25000);

    const data = await res.json().catch(() => null);

    if (res.ok && data?.transactionId) {
      return { success: true, txId: data.transactionId };
    }

    let errorMsg = `Kaspa node broadcast rejected (HTTP ${res.status})`;
    if (data) {
      const rawErr = extractKaspaError(data);
      if (rawErr) {
        if (rawErr.toLowerCase().includes('orphan')) {
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

    console.error(`[Kaspa Node Broadcast] Node rejected transaction on ${baseUrl}:`, errorMsg);
    return { success: false, error: errorMsg };
  } catch (err: any) {
    const errMsg = err.message || 'Network connection failed while broadcasting transaction';
    console.error(`[Kaspa Node Broadcast] Connection error on ${baseUrl}:`, errMsg);
    return { success: false, error: errMsg };
  }
}
