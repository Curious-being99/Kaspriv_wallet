let GLOBAL_API_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_API_URL : undefined) || 'https://api.kaspa.org') as string;
let GLOBAL_EXPLORER_URL = (((typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env.VITE_KASPA_EXPLORER_URL : undefined) || 'https://explorer.kaspa.org') as string;

export function setKaspaApiUrl(url: string) {
  GLOBAL_API_URL = url;
}

export function setKaspaExplorerUrl(url: string) {
  GLOBAL_EXPLORER_URL = url;
}

export function getKaspaApiUrl(): string {
  return GLOBAL_API_URL;
}

export function getKaspaExplorerUrl(): string {
  return GLOBAL_EXPLORER_URL;
}

let cachedPriceData: { price: number; usd24hChange?: number } | null = null;
let lastPriceFetchTime = 0;
const PRICE_CACHE_TTL = 60000;

async function fetchWithTimeout(url: string, options: any = {}, timeout = 10000) {
  // 100% Client-Side Direct Fetch (Zero server proxy overhead, maximum performance)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (directErr) {
    clearTimeout(id);
    throw directErr;
  }
}

export async function fetchKaspaPrice(): Promise<{ price: number; usd24hChange?: number } | null> {
  const now = Date.now();
  if (cachedPriceData && (now - lastPriceFetchTime < PRICE_CACHE_TTL)) {
    return cachedPriceData;
  }

  let price = 0;
  let usd24hChange = 0;

  // 1. Try CoinGecko (provides both real-time price & 24h change)
  try {
    const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true', {}, 5000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.kaspa) {
        price = Number(data.kaspa.usd) || 0;
        usd24hChange = Number(data.kaspa.usd_24h_change) || 0;
      }
    }
  } catch (err) {
    // Silent catch
  }

  // 2. Try CoinPaprika fallback if CoinGecko failed
  if (!price || !usd24hChange) {
    try {
      const res = await fetchWithTimeout('https://api.coinpaprika.com/v1/tickers/kas-kaspa', {}, 5000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.quotes && data.quotes.USD) {
          if (!price) price = Number(data.quotes.USD.price) || 0;
          if (!usd24hChange) usd24hChange = Number(data.quotes.USD.percent_change_24h) || 0;
        }
      }
    } catch (err) {
      // Silent catch
    }
  }

  // 3. Official Kaspa API price for direct node price override
  try {
    const res = await fetchWithTimeout(`${getKaspaApiUrl()}/info/price`, {}, 5000);
    if (res.ok) {
      const data = await res.json();
      if (data && data.price) {
        price = Number(data.price) || price;
      }
    }
  } catch (err) {
    // Silent catch
  }

  if (price > 0) {
    cachedPriceData = { price, usd24hChange };
    lastPriceFetchTime = now;
    return cachedPriceData;
  }

  return cachedPriceData || { price: 0.0265, usd24hChange: -1.25 };
}

const KASPA_API_ENDPOINTS = [
  'https://api.kaspa.org'
];

export async function pingKaspaNode(apiUrl: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const cleanUrl = apiUrl.replace(/\/+$/, '');
    const res = await fetchWithTimeout(`${cleanUrl}/info/virtual-chain-blue-score`, {}, 4000);
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      return { ok: true, latencyMs };
    }
    // Try health check fallback
    const resHealth = await fetchWithTimeout(`${cleanUrl}/info/health`, {}, 3000);
    if (resHealth.ok) {
      return { ok: true, latencyMs: Math.round(performance.now() - start) };
    }
    return { ok: false, latencyMs: 999, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, latencyMs: 999, error: err.message || 'Connection timeout' };
  }
}

function getKaspaApiEndpoints(): string[] {
  const customUrl = getKaspaApiUrl();
  const list = [customUrl];
  KASPA_API_ENDPOINTS.forEach(ep => {
    if (!list.includes(ep)) list.push(ep);
  });
  return list;
}

export async function fetchKaspaAddressBalance(address: string): Promise<bigint | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(`${ep}/addresses/${encodeURIComponent(address.trim())}/balance`, {}, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && (typeof data.balance === 'number' || typeof data.balance === 'string')) {
        return BigInt(data.balance);
      }
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaAddressUtxos(address: string): Promise<any[] | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(`${ep}/addresses/${encodeURIComponent(address.trim())}/utxos`, {}, 8000);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaAddressTransactions(address: string): Promise<any[] | null> {
  if (!address) return null;
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    // Try full-transactions first
    try {
      const res = await fetchWithTimeout(`${ep}/addresses/${encodeURIComponent(address.trim())}/full-transactions?limit=50&resolve_previous_outpoints=light`, {}, 10000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      // try fallback below
    }

    // Fallback to simpler transactions endpoint if full-transactions failed
    try {
      const res = await fetchWithTimeout(`${ep}/addresses/${encodeURIComponent(address.trim())}/transactions?limit=50`, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
}

export async function fetchKaspaCurrentDaaScore(): Promise<number | null> {
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(`${ep}/info/blockdag`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.virtualSelectedParentBlueScore !== undefined) {
          return Number(data.virtualSelectedParentBlueScore);
        }
      }
    } catch (err) {
      // try fallback/next
    }

    try {
      const res = await fetchWithTimeout(`${ep}/info/virtual-chain-blue-score`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.blueScore !== undefined) {
          return Number(data.blueScore);
        } else if (typeof data === 'number') {
          return data;
        } else if (typeof data === 'string') {
          const num = Number(data);
          if (!isNaN(num)) return num;
        }
      }
    } catch (err) {
      // try next
    }
  }
  return null;
}

export async function fetchKaspaFeeEstimate(): Promise<{ priorityBucketFeeRate: number; normalBucketFeeRate: number; lowBucketFeeRate: number } | null> {
  const endpoints = getKaspaApiEndpoints();

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(`${ep}/info/fee-estimate`, {}, 5000);
      if (!res.ok) continue;
      const data = await res.json();
      return {
        priorityBucketFeeRate: Number(data.priorityBucketFeeRate) || 1,
        normalBucketFeeRate: Number(data.normalBucketFeeRate) || 1,
        lowBucketFeeRate: Number(data.lowBucketFeeRate) || 1,
      };
    } catch (err) {
      // try next endpoint
    }
  }
  return null;
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
 * Broadcast Kaspa Transaction across multiple public node endpoints
 */
export async function broadcastKaspaTransaction(txPayload: any): Promise<{ success: boolean; txId?: string; error?: string }> {
  const endpoints = getKaspaApiEndpoints();
  let lastError = 'Broadcast failed across Kaspa nodes';

  const rawTx = txPayload?.transaction || txPayload;
  
  const formattedTx = {
    version: Number(rawTx?.version || 0),
    inputs: Array.isArray(rawTx?.inputs) ? rawTx.inputs.map((inTx: any) => ({
      previousOutpoint: {
        transactionId: String(inTx?.previousOutpoint?.transactionId || inTx?.transactionId || ''),
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
          scriptPublicKey: String(outTx?.scriptPublicKey?.scriptPublicKey || outTx?.scriptPublicKey || '')
        }
      };
    }) : [],
    lockTime: Number(rawTx?.lockTime || 0),
    subnetworkId: String(rawTx?.subnetworkId || '0000000000000000000000000000000000000000')
  };

  const bodyPayload = { transaction: formattedTx };

  for (const ep of endpoints) {
    try {
      const res = await fetchWithTimeout(`${ep}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      }, 15000);

      const data = await res.json().catch(() => null);

      if (res.ok && data?.transactionId) {
        return { success: true, txId: data.transactionId };
      }

      if (data) {
        const rawErr = extractKaspaError(data);
        if (rawErr) {
          if (rawErr.toLowerCase().includes('orphan')) {
            lastError = 'Orphan transaction: UTXO pending or not yet on-chain.';
          } else if (rawErr.toLowerCase().includes('fee')) {
            lastError = `Fee too low: ${rawErr}`;
          } else if (rawErr.toLowerCase().includes('signature')) {
            lastError = 'Signature verification failed: Check seed phrase or script parameters.';
          } else {
            lastError = rawErr;
          }
        } else {
          lastError = `Node rejected transaction (HTTP ${res.status})`;
        }
      } else {
        lastError = `Kaspa node endpoint ${ep} returned HTTP ${res.status}`;
      }

      if (res.status === 400 || res.status === 422) {
        console.error(`[Kaspa Node Broadcast] Node rejected transaction with ${res.status} Bad Request: ${lastError}`);
        break;
      }
    } catch (err: any) {
      console.error(`[Kaspa Node Broadcast] Connection error on ${ep}:`, err.message || err);
      lastError = err.message || 'Network connectivity error connecting to node';
    }
  }

  console.error('[Kaspa Node Broadcast] Final Broadcast Failure:', lastError);
  return { success: false, error: lastError };
}
