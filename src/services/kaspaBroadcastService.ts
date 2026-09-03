// src/services/kaspaBroadcastService.ts
//
// KasPriv Wallet: Kaspa Transaction Broadcast & Acceptance Tracking Service
//
// Responsibilities:
// - Manages high-reliability multi-node failover for transaction broadcasting.
// - Performs local validation before dispatch to avoid node penalty thresholds.
// - Supports Mainnet (api.kaspa.org) and Testnet-10 (api-tn10.kaspa.org).
// - Implements the BroadcastStatus machine for rich visual pipeline state.
// - Performs polling-based GHOSTDAG block acceptance tracking.

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getCandidateApiUrls } from '../utils/kaspa/api';
import { computeTxIdWasm } from '../utils/kaspa/wasmTx';

export type TransactionState =
  | 'building'
  | 'signing'
  | 'broadcasting'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'network_error';

export interface TransactionStatus {
  transactionId: string;
  state: TransactionState;
  acceptingBlockHash?: string;
  acceptingBlockDaaScore?: bigint;
  errorCode?: string;
}

export type BroadcastStatus = TransactionState | 'invalid_transaction';

export interface BroadcastResult {
  status: BroadcastStatus;
  txId?: string;
  error?: string;
  endpointUsed?: string;
}

export interface AcceptanceStatus {
  isAccepted: boolean;
  acceptingBlockHash?: string;
  acceptingBlockDaaScore?: bigint;
  confirmations: number;
}

/**
 * Validates strict structural, cryptographic, integer, script, duplicate, and boundary rules
 * of the signed transaction client-side before broadcast to prevent node penalties or mempool rejections.
 */
export function validateTransactionClientSide(txPayload: any): { valid: boolean; reason?: string } {
  const tx = txPayload?.transaction || txPayload;
  if (!tx || typeof tx !== 'object') {
    return { valid: false, reason: 'Empty or invalid transaction payload' };
  }

  if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
    return { valid: false, reason: 'Transaction must contain at least one input outpoint' };
  }

  if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) {
    return { valid: false, reason: 'Transaction must contain at least one output destination' };
  }

  // Enforce input size limits (e.g. Kaspa standard max mass / input limits)
  if (tx.inputs.length > 500) {
    return { valid: false, reason: `Transaction inputs count (${tx.inputs.length}) exceeds safety limit of 500` };
  }

  if (tx.outputs.length > 100) {
    return { valid: false, reason: `Transaction outputs count (${tx.outputs.length}) exceeds safety limit of 100` };
  }

  // Validate version & lockTime integers
  if (tx.version !== undefined) {
    const v = Number(tx.version);
    if (!Number.isInteger(v) || v < 0) {
      return { valid: false, reason: 'Transaction version must be a non-negative integer' };
    }
  }

  const seenOutpoints = new Set<string>();

  // Validate inputs, signatures, and duplicate prevention
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    if (!input || typeof input !== 'object') {
      return { valid: false, reason: `Input index ${i} is malformed` };
    }

    const prevOutpoint = input.previousOutpoint;
    if (!prevOutpoint || typeof prevOutpoint !== 'object') {
      return { valid: false, reason: `Input index ${i} is missing a valid previousOutpoint` };
    }

    const txId = String(prevOutpoint.transactionId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txId)) {
      return { valid: false, reason: `Input index ${i} has an invalid previousOutpoint transactionId (expected 64-char hex)` };
    }

    const outIndex = Number(prevOutpoint.index);
    if (!Number.isInteger(outIndex) || outIndex < 0 || outIndex > 4294967295) {
      return { valid: false, reason: `Input index ${i} has an invalid previousOutpoint index (must be uint32)` };
    }

    const outpointKey = `${txId}:${outIndex}`;
    if (seenOutpoints.has(outpointKey)) {
      return { valid: false, reason: `Duplicate input outpoint detected: ${outpointKey}` };
    }
    seenOutpoints.add(outpointKey);

    const sigScript = String(input.signatureScript || '').trim();
    if (!sigScript || sigScript.length < 10 || !/^[0-9a-fA-F]+$/.test(sigScript)) {
      return { valid: false, reason: `Input index ${i} has an invalid or missing signatureScript (expected hex)` };
    }

    if (input.sigOpCount !== undefined) {
      const sigOps = Number(input.sigOpCount);
      if (!Number.isInteger(sigOps) || sigOps < 1) {
        return { valid: false, reason: `Input index ${i} has an invalid sigOpCount (must be positive integer)` };
      }
    }
  }

  const MAX_KASPA_SOMPI = 290000000000000000n; // 29 Billion KAS in Sompi safety ceiling

  // Ensure output amounts and scriptPublicKeys are strictly valid
  for (let i = 0; i < tx.outputs.length; i++) {
    const out = tx.outputs[i];
    if (!out || typeof out !== 'object') {
      return { valid: false, reason: `Output index ${i} is malformed` };
    }

    const rawAmt = out.amount;
    let amt: bigint;
    try {
      amt = typeof rawAmt === 'bigint' ? rawAmt : BigInt(rawAmt);
    } catch {
      return { valid: false, reason: `Output index ${i} has an unparseable amount value` };
    }

    if (amt <= 0n) {
      return { valid: false, reason: `Output index ${i} has a zero or negative spending amount` };
    }

    if (amt > MAX_KASPA_SOMPI) {
      return { valid: false, reason: `Output index ${i} amount exceeds maximum Kaspa supply bounds` };
    }

    const spkObj = out.scriptPublicKey;
    if (!spkObj || typeof spkObj !== 'object') {
      return { valid: false, reason: `Output index ${i} is missing scriptPublicKey` };
    }

    const spkHex = String(spkObj.scriptPublicKey || '').trim();
    if (!spkHex || !/^[0-9a-fA-F]+$/.test(spkHex)) {
      return { valid: false, reason: `Output index ${i} has an invalid scriptPublicKey hex string` };
    }

    if (spkObj.version !== undefined) {
      const v = Number(spkObj.version);
      if (!Number.isInteger(v) || v < 0) {
        return { valid: false, reason: `Output index ${i} scriptPublicKey version must be non-negative integer` };
      }
    }
  }

  return { valid: true };
}

/**
 * Returns preferred API URLs for the requested network prefix.
 * Maps 'testnet-10' cleanly to 'https://api-tn10.kaspa.org'
 */
export function getBroadcastEndpoints(network: string): string[] {
  const normNet = (network || 'mainnet').toLowerCase();
  const isTestnet = normNet.includes('testnet') || normNet === 'tn10';

  if (isTestnet) {
    return [
      'https://api-tn10.kaspa.org',
    ];
  }

  // Strict Mainnet endpoints: Filter out any URL containing testnet or tn10 keywords
  const candidateUrls = getCandidateApiUrls('mainnet');
  return candidateUrls.filter(url => {
    const l = url.toLowerCase();
    return !l.includes('testnet') && !l.includes('tn10');
  });
}

/**
 * Broadcasts a verified, signed transaction payload directly to the Kaspa REST mempool API.
 * 
 * If a previous endpoint timed out, we check if the transaction was already submitted
 * using `knownTxId` (if available) before sending a redundant POST request.
 */
export async function broadcastKaspaTransactionService(
  txPayload: any,
  network: string = 'mainnet',
  knownTxId?: string
): Promise<BroadcastResult> {
  // 1. Client-Side Integrity Check
  const localVal = validateTransactionClientSide(txPayload);
  if (!localVal.valid) {
    return {
      status: 'invalid_transaction',
      error: localVal.reason || 'Client validation failed',
    };
  }

  const endpoints = getBroadcastEndpoints(network);
  const rawTx = txPayload?.transaction || txPayload;

  // 2. Authoritative Local TXID Calculation using Kaspa WASM core
  let localTxId = '';
  try {
    localTxId = await computeTxIdWasm(rawTx);
  } catch (e) {
    console.warn('WASM computeTxIdWasm error, attempting payload txId verification:', e);
  }

  if (!localTxId) {
    localTxId = knownTxId || txPayload?.txId || txPayload?.id || rawTx?.txId || rawTx?.id || rawTx?.transactionId || '';
  }

  localTxId = String(localTxId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(localTxId)) {
    return {
      status: 'invalid_transaction',
      error: `Invalid local transaction ID (${localTxId || 'empty'}). Transaction cannot be verified.`,
    };
  }

  // Normalize formatting for BigInt JSON parsing
  const formattedTx = {
    version: Number(rawTx.version || 0),
    inputs: rawTx.inputs.map((inTx: any) => ({
      previousOutpoint: {
        transactionId: String(inTx.previousOutpoint?.transactionId || '').toLowerCase(),
        index: Number(inTx.previousOutpoint?.index ?? 0),
      },
      signatureScript: String(inTx.signatureScript || ''),
      sequence: Number(inTx.sequence || 0),
      sigOpCount: Number(inTx.sigOpCount ?? 1),
    })),
    outputs: rawTx.outputs.map((outTx: any) => {
      const amt = outTx.amount;
      const safeAmount = typeof amt === 'bigint' ? amt : BigInt(amt);
      return {
        amount: safeAmount,
        scriptPublicKey: {
          version: Number(outTx.scriptPublicKey?.version || 0),
          scriptPublicKey: String(outTx.scriptPublicKey?.scriptPublicKey || '').toLowerCase(),
        },
      };
    }),
    lockTime: Number(rawTx.lockTime || 0),
    subnetworkId: String(rawTx.subnetworkId || '0000000000000000000000000000000000000000'),
  };

  const bodyPayload = { transaction: formattedTx };
  const serializedBody = JSON.parse(JSON.stringify(bodyPayload, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

  let lastErrorMsg = 'Endpoints offline or unresponsive';

  // Fast broadcast helper for a single endpoint with strict local TXID verification
  const sendToNode = async (baseUrl: string): Promise<BroadcastResult | null> => {
    const pathsToTry = ['/transactions', '/submit_transaction'];
    
    for (const subPath of pathsToTry) {
      try {
        let status = 0;
        let data: any = null;

        if (Capacitor.isNativePlatform()) {
          const capRes = await CapacitorHttp.request({
            url: `${baseUrl}${subPath}`,
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            data: serializedBody,
            connectTimeout: 12000,
            readTimeout: 15000,
          });
          status = capRes.status || 200;
          data = typeof capRes.data === 'string' ? JSON.parse(capRes.data || '{}') : capRes.data;
        } else {
          const res = await fetch(`${baseUrl}${subPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serializedBody),
            signal: AbortSignal.timeout(15000),
          });
          status = res.status;
          data = await res.json().catch(() => null);
        }

        if (status === 404 && subPath === '/transactions') {
          // Endpoint might be using /submit_transaction, try next path
          continue;
        }

        const returnedTxId = data?.transactionId || data?.txId || data?.id || data?.result || data?.tx_id || (typeof data === 'string' && /^[0-9a-fA-F]{64}$/.test(data.trim()) ? data.trim() : undefined);

        if (status >= 200 && status < 300) {
          const finalTxId = returnedTxId ? String(returnedTxId).trim().toLowerCase() : localTxId;

          return {
            status: 'submitted',
            txId: finalTxId,
            endpointUsed: baseUrl,
          };
        }

        const nodeError = String(data?.message || data?.error || data?.detail || '').trim();
        const lowerErr = nodeError.toLowerCase();

        // If the transaction was already accepted into the mempool (e.g. by another node in parallel race), treat as successful submission
        if (lowerErr.includes('already in mempool') || lowerErr.includes('already accepted')) {
          return {
            status: 'submitted',
            txId: localTxId,
            endpointUsed: baseUrl,
          };
        }

        if (status === 400 || status === 422) {
          return {
            status: 'rejected',
            error: `Mempool Rejected: ${nodeError || 'Node rejected rule validation'}`,
            endpointUsed: baseUrl,
          };
        }

        if (nodeError) {
          lastErrorMsg = nodeError;
        }
        
        // If status was anything other than 404, the endpoint replied with an explicit status, do not overwrite with fallback subPath
        if (status !== 404) {
          break;
        }
        return null;
      } catch (e: any) {
        if (e?.message) {
          lastErrorMsg = e.message;
        }
        return null;
      }
    }
    return null;
  };

  // Ultra-Fast Zero-Delay Multi-Node Broadcast Dispatch
  // If there's only 1 endpoint, await it directly.
  if (endpoints.length === 1) {
    const singleRes = await sendToNode(endpoints[0]);
    if (singleRes) return singleRes;
    return {
      status: 'network_error',
      error: `Broadcast failed: ${lastErrorMsg}`,
    };
  }

  // Multi-endpoint race:
  // Start primary endpoint. If primary fails or is sluggish (>350ms),
  // immediately race fallbacks and resolve on the very FIRST successful node response.
  let fallbackLaunched = false;
  let fallbackTimer: any = null;

  const runFallbacks = (): Promise<BroadcastResult | null> => {
    if (fallbackLaunched) return Promise.resolve(null);
    fallbackLaunched = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    return new Promise<BroadcastResult | null>((resolve) => {
      let resolved = false;
      let pendingCount = endpoints.length - 1;
      let definitiveReject: BroadcastResult | null = null;

      for (let i = 1; i < endpoints.length; i++) {
        sendToNode(endpoints[i]).then((res) => {
          if (resolved) return;
          if (res && (res.status === 'submitted' || res.status === 'accepted')) {
            resolved = true;
            resolve(res);
            return;
          }
          if (res && res.status === 'rejected' && !definitiveReject) {
            definitiveReject = res;
          }
          pendingCount--;
          if (pendingCount <= 0 && !resolved) {
            resolved = true;
            resolve(definitiveReject);
          }
        }).catch(() => {
          if (resolved) return;
          pendingCount--;
          if (pendingCount <= 0 && !resolved) {
            resolved = true;
            resolve(definitiveReject);
          }
        });
      }
    });
  };

  const primaryPromise = sendToNode(endpoints[0]);

  // Delayed fallback race trigger if primary is sluggish (>350ms)
  const fallbackRace = new Promise<BroadcastResult | null>((resolve) => {
    fallbackTimer = setTimeout(() => {
      runFallbacks().then(resolve);
    }, 350);
  });

  // If primary finishes fast and succeeds, cancel fallback timer. If primary fails fast, trigger fallbacks immediately!
  primaryPromise.then((res) => {
    if (res && (res.status === 'submitted' || res.status === 'accepted')) {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    } else {
      runFallbacks();
    }
  }).catch(() => {
    runFallbacks();
  });

  const fastestResult = await Promise.race([primaryPromise, fallbackRace]);
  if (fastestResult && (fastestResult.status === 'submitted' || fastestResult.status === 'accepted')) {
    return fastestResult;
  }

  const primaryResult = await primaryPromise;
  if (primaryResult && (primaryResult.status === 'submitted' || primaryResult.status === 'accepted')) {
    return primaryResult;
  }

  const fallbackResult = await runFallbacks();
  if (fallbackResult) {
    return fallbackResult;
  }

  if (primaryResult) {
    return primaryResult;
  }

  return {
    status: 'network_error',
    error: `Broadcast failed: ${lastErrorMsg}`,
  };
}

/**
 * Queries acceptance/confirmation status and DAG metadata of a given Transaction ID.
 */
export async function fetchTransactionAcceptanceStatus(
  txId: string,
  network: string = 'mainnet'
): Promise<AcceptanceStatus> {
  const endpoints = getBroadcastEndpoints(network);
  let lastError: any = null;

  for (const baseUrl of endpoints) {
    try {
      let status = 0;
      let data: any = null;

      if (Capacitor.isNativePlatform()) {
        const capRes = await CapacitorHttp.request({
          url: `${baseUrl}/transactions/${txId}?include_payload=false`,
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          connectTimeout: 4000,
          readTimeout: 4000,
        });
        status = capRes.status || 200;
        data = typeof capRes.data === 'string' ? JSON.parse(capRes.data || '{}') : capRes.data;
      } else {
        const res = await fetch(`${baseUrl}/transactions/${txId}?include_payload=false`, {
          signal: AbortSignal.timeout(4000)
        });
        status = res.status;
        data = await res.json().catch(() => null);
      }

      if (status === 404) {
        // Transaction not found in node's database yet
        return { isAccepted: false, confirmations: 0 };
      }

      if (status < 200 || status >= 300 || !data) {
        continue;
      }

      const isAccepted = Boolean(data.isAccepted || data.is_accepted || data.acceptingBlockHash || data.accepting_block_hash);
      const acceptingBlockHash = data.acceptingBlockHash || data.accepting_block_hash || undefined;
      const acceptingBlockDaaScore = data.acceptingBlockDaaScore !== undefined ? BigInt(data.acceptingBlockDaaScore) : undefined;
      const confirmations = data.confirmations !== undefined ? Number(data.confirmations) : (isAccepted ? 1 : 0);

      return {
        isAccepted,
        acceptingBlockHash,
        acceptingBlockDaaScore,
        confirmations,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All node status check endpoints timed out');
}

/**
 * Creates an acceptance observer polling status at jittered intervals.
 * Automatically halts when accepted on-chain.
 */
export function pollTransactionAcceptance(
  txId: string,
  network: string,
  onStatusChange: (status: BroadcastStatus, details?: AcceptanceStatus) => void,
  intervalMs = 4000,
  maxAttempts = 15
): () => void {
  let attempts = 0;
  let timerId: any = null;
  let isCancelled = false;

  const check = async () => {
    if (isCancelled) return;
    attempts++;

    try {
      const status = await fetchTransactionAcceptanceStatus(txId, network);
      if (status.isAccepted) {
        onStatusChange('accepted', status);
        return; // Success, halt polling
      }
    } catch {
      // Gracefully bypass transient API polling failures
    }

    if (attempts >= maxAttempts) {
      onStatusChange('submitted'); // Remain in submitted/mempool state
      return;
    }

    timerId = setTimeout(check, intervalMs);
  };

  // Launch initial checks
  timerId = setTimeout(check, 1000);

  // Return cancel handle
  return () => {
    isCancelled = true;
    if (timerId) clearTimeout(timerId);
  };
}
