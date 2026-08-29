// kaspaWalletHistory.ts
//
// KasPriv wallet:
// - Current balance
// - Current UTXOs
// - Transaction history
// - Incoming/outgoing detection
// - Balance-change calculation
// - Change-output detection
//
// Uses the official Kaspa REST API.
//
// IMPORTANT:
// This file handles PUBLIC blockchain data only.
// Never put seed phrases, private keys, passwords, or decrypted
// vault secrets into this module.

export type KaspaNetwork = 'mainnet' | 'testnet-10';

export interface KaspaUtxo {
  transactionId: string;
  index: number;
  amountSompi: bigint;
  address?: string;
  scriptPublicKey?: string;
  blockDaaScore?: number | bigint;
  isCoinbase?: boolean;
  isMature?: boolean;
}

export interface KaspaTransaction {
  transactionId: string;
  acceptingBlockBlueScore?: number | bigint;
  blockTime?: number | bigint;
  mass?: number;
  inputs: KaspaTransactionInput[];
  outputs: KaspaTransactionOutput[];
}

export interface KaspaTransactionInput {
  previousTransactionId: string;
  previousIndex: number;
  previousAmountSompi?: bigint;
  previousAddress?: string;
}

export interface KaspaTransactionOutput {
  index: number;
  amountSompi: bigint;
  address?: string;
}

export type TransactionDirection =
  | 'received'
  | 'sent'
  | 'self'
  | 'unknown';

export interface BalanceChange {
  incomingSompi: bigint;
  outgoingSompi: bigint;
  changeSompi: bigint;
  feeSompi: bigint;
  netChangeSompi: bigint;
}

export interface WalletTransaction {
  transactionId: string;
  direction: TransactionDirection;

  incomingSompi: bigint;
  outgoingSompi: bigint;
  changeSompi: bigint;
  feeSompi: bigint;
  netChangeSompi: bigint;

  outputsToWallet: KaspaTransactionOutput[];
  outputsToOthers: KaspaTransactionOutput[];

  timestamp?: number;
  acceptingBlockBlueScore?: bigint;

  confirmed: boolean;
}

export interface WalletSnapshot {
  address: string;

  balanceSompi: bigint;
  balanceKas: string;

  utxos: KaspaUtxo[];
  transactions: WalletTransaction[];

  balanceChangeSompi: bigint;
  balanceChangeKas: string;

  fetchedAt: number;
}

export interface TransactionHistoryOptions {
  limit?: number;
  cursor?: string;
}

export interface KaspaWalletHistoryOptions {
  network?: KaspaNetwork;
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
}

const SOMPI_PER_KAS = 100_000_000n;

const DEFAULT_API = 'https://api.kaspa.org';
const DEFAULT_TESTNET_API = 'https://api-tn10.kaspa.org';

/* -------------------------------------------------------------------------- */
/* Utility functions                                                           */
/* -------------------------------------------------------------------------- */

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('UNSAFE_INTEGER_VALUE');
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    return BigInt(value);
  }

  throw new Error('INVALID_INTEGER_VALUE');
}

function normalizeTransactionId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('INVALID_TRANSACTION_ID');
  }
  return value;
}

function normalizeIndex(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error('INVALID_OUTPUT_INDEX');
  }
  return n;
}

function normalizeAddress(addr: string | undefined): string {
  if (!addr) return '';
  return addr.trim().toLowerCase();
}

function isSameAddress(addrA?: string, addrB?: string): boolean {
  if (!addrA || !addrB) return false;
  const normA = normalizeAddress(addrA);
  const normB = normalizeAddress(addrB);
  if (normA === normB) return true;
  
  // Handle optional "kaspa:" / "kaspatest:" prefix matching
  const stripA = normA.replace(/^kaspa(test)?:/, '');
  const stripB = normB.replace(/^kaspa(test)?:/, '');
  return stripA === stripB;
}

function isAddressInList(addr?: string, list?: string | string[]): boolean {
  if (!addr || !list) return false;
  if (Array.isArray(list)) {
    return list.some(l => isSameAddress(addr, l));
  }
  return isSameAddress(addr, list);
}

export function sompiToKas(sompi: bigint): string {
  const negative = sompi < 0n;
  const absolute = negative ? -sompi : sompi;

  const whole = absolute / SOMPI_PER_KAS;
  const fraction = absolute % SOMPI_PER_KAS;

  const fractionText = fraction
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');

  const result =
    fractionText.length > 0
      ? `${whole}.${fractionText}`
      : whole.toString();

  return negative ? `-${result}` : result;
}

/* -------------------------------------------------------------------------- */
/* API client                                                                  */
/* -------------------------------------------------------------------------- */

export class KaspaWalletHistory {
  private readonly apiBaseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: KaspaWalletHistoryOptions = {}) {
    const network = options.network ?? 'mainnet';

    this.apiBaseUrl = (
      options.apiBaseUrl ??
      (network === 'mainnet' ? DEFAULT_API : DEFAULT_TESTNET_API)
    ).replace(/\/+$/, '');

    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async requestWithHeaders<T>(path: string, init?: RequestInit): Promise<{ data: T, headers: Headers }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.fetchFn(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 429) {
        if (attempt < 2) {
          const retryAfterStr = response.headers.get('Retry-After');
          const retryAfter = retryAfterStr ? parseInt(retryAfterStr, 10) : (1 << attempt);
          const delay = Math.min(Math.max(Number.isNaN(retryAfter) ? 1 : retryAfter, 1), 15);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
          continue;
        } else {
          throw new Error('KASPA_API_RATE_LIMITED');
        }
      }

      if (!response.ok) {
        throw new Error(`KASPA_API_HTTP_${response.status}`);
      }

      const data = await response.json() as T;
      return { data, headers: response.headers };
    }
    throw new Error('KASPA_API_RATE_LIMITED');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.requestWithHeaders<T>(path, init);
    return res.data;
  }

  /* ------------------------------------------------------------------------ */
  /* Active Addresses                                                          */
  /* ------------------------------------------------------------------------ */

  async getActiveAddresses(addresses: string[]): Promise<string[]> {
    if (!addresses || addresses.length === 0) return [];

    const activeList: string[] = [];
    // Process in chunks of 250 to avoid large payloads
    const chunkSize = 250;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      const data = await this.request<any[]>('/addresses/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addresses: chunk }),
      });

      if (Array.isArray(data)) {
        for (const item of data) {
          if (item?.active && item?.address) {
            activeList.push(item.address);
          }
        }
      }
    }
    
    return Array.from(new Set(activeList));
  }

  /* ------------------------------------------------------------------------ */
  /* Balance                                                                   */
  /* ------------------------------------------------------------------------ */

  async getBalance(address: string): Promise<bigint> {
    const data = await this.request<any>(
      `/addresses/${encodeURIComponent(address)}/balance`
    );

    if (data?.balance !== undefined) {
      return toBigInt(data.balance);
    }

    if (data?.amount !== undefined) {
      return toBigInt(data.amount);
    }

    throw new Error('INVALID_BALANCE_RESPONSE');
  }

  /* ------------------------------------------------------------------------ */
  /* UTXOs                                                                     */
  /* ------------------------------------------------------------------------ */

  async getUtxos(address: string): Promise<KaspaUtxo[]> {
    const data = await this.request<any>(
      `/addresses/${encodeURIComponent(address)}/utxos`
    );

    const rawUtxos = Array.isArray(data)
      ? data
      : Array.isArray(data?.utxos)
      ? data.utxos
      : [];

    return rawUtxos.map((raw: any): KaspaUtxo => {
      const outpoint = raw.outpoint ?? raw;

      return {
        transactionId: normalizeTransactionId(
          outpoint.transactionId ??
            outpoint.transaction_id ??
            raw.transactionId ??
            raw.transaction_id
        ),

        index: normalizeIndex(outpoint.index ?? raw.index),

        amountSompi: toBigInt(raw.amount ?? raw.value ?? raw.amountSompi),

        address: raw.address ?? address,

        scriptPublicKey: raw.scriptPublicKey ?? raw.script_public_key,

        blockDaaScore:
          raw.blockDaaScore !== undefined
            ? toBigInt(raw.blockDaaScore)
            : undefined,

        isCoinbase: Boolean(raw.isCoinbase),

        isMature: raw.isMature !== false,
      };
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Full transaction history                                                  */
  /* ------------------------------------------------------------------------ */

  async getTransactions(
    address: string,
    options: TransactionHistoryOptions = {}
  ): Promise<KaspaTransaction[]> {
    let before: string | undefined = options.cursor;
    const allRawTransactions: any[] = [];
    
    // Fetch up to 100 pages to prevent infinite loops, matching native implementations
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams();
      query.set('limit', '500'); // Use 500 limit for pagination efficiency like native
      query.set('resolve_previous_outpoints', 'light');
      
      if (before) {
        query.set('before', before);
      }

      const res = await this.requestWithHeaders<any>(
        `/addresses/${encodeURIComponent(address)}/full-transactions-page?${query}`
      );
      
      const data = res.data;
      const headers = res.headers;

      const rawTransactions = Array.isArray(data)
        ? data
        : Array.isArray(data?.transactions)
        ? data.transactions
        : [];
        
      allRawTransactions.push(...rawTransactions);
      
      const nextBefore = headers.get('X-Next-Page-Before');
      if (nextBefore && nextBefore !== before) {
        before = nextBefore;
      } else {
        break; // No more pages
      }
    }

    return allRawTransactions.map((tx: any): KaspaTransaction => {
      const inputs = Array.isArray(tx.inputs) ? tx.inputs : [];
      const outputs = Array.isArray(tx.outputs) ? tx.outputs : [];

      return {
        transactionId: normalizeTransactionId(
          tx.transactionId ?? tx.transaction_id ?? tx.id
        ),

        acceptingBlockBlueScore:
          tx.acceptingBlockBlueScore !== undefined
            ? toBigInt(tx.acceptingBlockBlueScore)
            : undefined,

        blockTime:
          tx.blockTime !== undefined ? toBigInt(tx.blockTime) : undefined,

        mass: tx.mass !== undefined ? Number(tx.mass) : undefined,

        inputs: inputs.map((input: any): KaspaTransactionInput => {
          const previous =
            input.previousOutpoint ??
            input.previous_outpoint ??
            input.outpoint ??
            {};

          return {
            previousTransactionId: normalizeTransactionId(
              previous.transactionId ??
                previous.transaction_id ??
                input.previousTransactionId ??
                input.previous_transaction_id
            ),

            previousIndex: normalizeIndex(
              previous.index ?? input.previousIndex ?? input.previous_index
            ),

            previousAmountSompi:
              (previous.amount ??
                input.previousAmount ??
                input.previous_amount) !== undefined
                ? toBigInt(
                    previous.amount ??
                      input.previousAmount ??
                      input.previous_amount
                  )
                : undefined,

            previousAddress:
              previous.address ??
              previous.previousOutpointAddress ??
              previous.previous_outpoint_address ??
              input.previousAddress ??
              input.previous_address ??
              input.address ??
              input.previousOutpointAddress ??
              input.previous_outpoint_address,
          };
        }),

        outputs: outputs.map((output: any, index: number): KaspaTransactionOutput => {
          return {
            index:
              output.index !== undefined
                ? normalizeIndex(output.index)
                : index,

            amountSompi: toBigInt(
              output.amount ?? output.value ?? output.amountSompi
            ),

            address:
              output.address ??
              output.scriptPublicKey?.address ??
              output.script_public_key?.address ??
              output.scriptPublicKeyAddress ??
              output.script_public_key_address,
          };
        }),
      };
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Outpoint Resolution                                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * Resolves missing previousAmountSompi and previousAddress for inputs
   * by querying referenced previous transactions from the Kaspa REST API.
   */
  async resolveMissingInputs(
    transactions: KaspaTransaction[]
  ): Promise<KaspaTransaction[]> {
    const missingTxIds = new Set<string>();

    for (const tx of transactions) {
      for (const input of tx.inputs) {
        if (
          input.previousAmountSompi === undefined ||
          !input.previousAddress
        ) {
          if (input.previousTransactionId) {
            missingTxIds.add(input.previousTransactionId);
          }
        }
      }
    }

    if (missingTxIds.size === 0) {
      return transactions;
    }

    // Limit concurrent resolution batch size for API performance
    const prevTxMap = new Map<string, any>();
    const idsToFetch = Array.from(missingTxIds).slice(0, 32); // Swift limits to 32

    if (idsToFetch.length > 0) {
      try {
        const searchResults = await this.request<any[]>('/transactions/search?resolve_previous_outpoints=light', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transactionIds: idsToFetch }),
        });
        
        if (Array.isArray(searchResults)) {
          for (const txData of searchResults) {
            const txId = txData.transactionId ?? txData.transaction_id ?? txData.id;
            if (txId) {
              prevTxMap.set(txId, txData);
            }
          }
        }
      } catch {
        // Gracefully ignore batch resolution failures
      }
    }

    return transactions.map(tx => {
      const enrichedInputs = tx.inputs.map(input => {
        if (
          (input.previousAmountSompi === undefined || !input.previousAddress) &&
          input.previousTransactionId &&
          prevTxMap.has(input.previousTransactionId)
        ) {
          const prevTx = prevTxMap.get(input.previousTransactionId);
          const prevOutputs = Array.isArray(prevTx?.outputs) ? prevTx.outputs : [];
          const matchingOutput =
            prevOutputs.find(
              (o: any) =>
                (o.index !== undefined ? Number(o.index) : -1) === input.previousIndex
            ) || prevOutputs[input.previousIndex];

          if (matchingOutput) {
            return {
              ...input,
              previousAmountSompi:
                input.previousAmountSompi ??
                ((matchingOutput.amount ?? matchingOutput.value) !== undefined
                  ? toBigInt(matchingOutput.amount ?? matchingOutput.value)
                  : undefined),
              previousAddress:
                input.previousAddress ??
                matchingOutput.address ??
                matchingOutput.scriptPublicKey?.address,
            };
          }
        }
        return input;
      });

      return {
        ...tx,
        inputs: enrichedInputs,
      };
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Transaction analysis                                                      */
  /* ------------------------------------------------------------------------ */

  analyzeTransaction(
    transaction: KaspaTransaction,
    walletAddress: string | string[]
  ): WalletTransaction {
    // 1. Separate outputs into wallet outputs and external outputs
    const outputsToWallet = transaction.outputs.filter(output =>
      isAddressInList(output.address, walletAddress)
    );

    const outputsToOthers = transaction.outputs.filter(
      output => !isAddressInList(output.address, walletAddress)
    );

    const walletOutputsSompi = outputsToWallet.reduce(
      (sum, output) => sum + output.amountSompi,
      0n
    );

    const externalOutputsSompi = outputsToOthers.reduce(
      (sum, output) => sum + output.amountSompi,
      0n
    );

    const totalOutputsSompi = transaction.outputs.reduce(
      (sum, output) => sum + output.amountSompi,
      0n
    );

    // 2. Identify inputs belonging specifically to this wallet
    const walletInputs = transaction.inputs.filter(input =>
      isAddressInList(input.previousAddress, walletAddress)
    );

    const isWalletSender = walletInputs.length > 0;

    const allInputsKnown = transaction.inputs.every(
      input => input.previousAmountSompi !== undefined
    );

    const walletInputsKnown = walletInputs.every(
      input => input.previousAmountSompi !== undefined
    );

    const totalInputsSompi = allInputsKnown
      ? transaction.inputs.reduce(
          (sum, input) => sum + (input.previousAmountSompi ?? 0n),
          0n
        )
      : 0n;

    const walletInputsSompi = walletInputsKnown
      ? walletInputs.reduce(
          (sum, input) => sum + (input.previousAmountSompi ?? 0n),
          0n
        )
      : 0n;

    // Calculate fee if all inputs are known
    const feeSompi =
      allInputsKnown && totalInputsSompi >= totalOutputsSompi
        ? totalInputsSompi - totalOutputsSompi
        : 0n;

    let direction: TransactionDirection;
    let incomingSompi = 0n;
    let outgoingSompi = 0n;
    let changeSompi = 0n;
    let netChangeSompi = 0n;

    if (isWalletSender) {
      changeSompi = walletOutputsSompi;

      if (outputsToOthers.length > 0) {
        direction = 'sent';
        if (walletInputsKnown && walletInputsSompi > 0n) {
          outgoingSompi = walletInputsSompi - changeSompi;
        } else {
          outgoingSompi = externalOutputsSompi + feeSompi;
        }
        netChangeSompi = -outgoingSompi;
      } else {
        direction = 'self';
        outgoingSompi = feeSompi;
        netChangeSompi = -feeSompi;
      }
    } else {
      const isExternalSender = transaction.inputs.some(
        input => input.previousAddress && !isAddressInList(input.previousAddress, walletAddress)
      );

      if (outputsToWallet.length > 0 || isExternalSender) {
        direction = 'received';
        incomingSompi = walletOutputsSompi;
        netChangeSompi = incomingSompi;
      } else {
        direction = 'unknown';
        incomingSompi = walletOutputsSompi;
        netChangeSompi = incomingSompi;
      }
    }

    return {
      transactionId: transaction.transactionId,
      direction,

      incomingSompi,
      outgoingSompi,
      changeSompi,
      feeSompi,
      netChangeSompi,

      outputsToWallet,
      outputsToOthers,

      timestamp:
        transaction.blockTime !== undefined
          ? Number(transaction.blockTime)
          : undefined,

      acceptingBlockBlueScore:
        transaction.acceptingBlockBlueScore !== undefined
          ? toBigInt(transaction.acceptingBlockBlueScore)
          : undefined,

      confirmed: transaction.acceptingBlockBlueScore !== undefined,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Complete wallet snapshot                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Fetches the complete wallet snapshot:
   * - Authoritative current balance directly from live UTXO set state (`getBalance`)
   * - Unspent Transaction Outputs (`getUtxos`)
   * - Transaction history with resolved input outpoints (`resolveMissingInputs`)
   * - Historical page balance delta (`balanceChangeSompi` across fetched page)
   */
  async getWalletSnapshot(
    addressOrAddresses: string | string[],
    options: TransactionHistoryOptions = {}
  ): Promise<WalletSnapshot> {
    const addresses = Array.isArray(addressOrAddresses) ? addressOrAddresses : [addressOrAddresses];
    // Check active addresses to prevent rate limits
    const activeAddresses = await this.getActiveAddresses(addresses);
    
    if (activeAddresses.length === 0) {
      return {
        address: addresses[0] ?? '',
        balanceSompi: 0n,
        balanceKas: '0',
        utxos: [],
        transactions: [],
        balanceChangeSompi: 0n,
        balanceChangeKas: '0',
        fetchedAt: Date.now(),
      };
    }

    let balanceSompi = 0n;
    const utxos: KaspaUtxo[] = [];
    const rawTransactions: KaspaTransaction[] = [];
    
    // Concurrency batching mimicking Swift TaskGroup / Kotlin coroutine batching
    const batchSize = 6;
    for (let i = 0; i < activeAddresses.length; i += batchSize) {
      const batch = activeAddresses.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (address) => {
          const [bal, u, txs] = await Promise.all([
            this.getBalance(address).catch(() => 0n),
            this.getUtxos(address).catch(() => []),
            this.getTransactions(address, options).catch(() => [])
          ]);
          return { bal, u, txs };
        })
      );
      
      for (const res of batchResults) {
        balanceSompi += res.bal;
        utxos.push(...res.u);
        rawTransactions.push(...res.txs);
      }
    }

    // Deduplicate transactions by ID to handle cross-wallet transfers cleanly
    const uniqueTxMap = new Map<string, KaspaTransaction>();
    for (const tx of rawTransactions) {
      uniqueTxMap.set(tx.transactionId, tx);
    }
    const uniqueRawTransactions = Array.from(uniqueTxMap.values());

    // Resolve any inputs missing previous outpoint amount/address metadata
    const resolvedTransactions = await this.resolveMissingInputs(uniqueRawTransactions);

    const analyzedTransactions = resolvedTransactions.map(tx =>
      this.analyzeTransaction(tx, activeAddresses)
    ).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    // Note: balanceChangeSompi is the net delta for the fetched transaction page/range,
    // NOT a replacement for the authoritative UTXO balance.
    const balanceChangeSompi = analyzedTransactions.reduce(
      (sum, tx) => sum + tx.netChangeSompi,
      0n
    );

    return {
      address: activeAddresses.length > 1 ? `${activeAddresses.length} addresses` : activeAddresses[0],
      balanceSompi,
      balanceKas: sompiToKas(balanceSompi),
      utxos,
      transactions: analyzedTransactions,
      balanceChangeSompi,
      balanceChangeKas: sompiToKas(balanceChangeSompi),
      fetchedAt: Date.now(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* UI formatting helpers                                                       */
/* -------------------------------------------------------------------------- */

export function formatBalanceChange(changeSompi: bigint): string {
  if (changeSompi > 0n) {
    return `+${sompiToKas(changeSompi)} KAS`;
  }

  if (changeSompi < 0n) {
    return `${sompiToKas(changeSompi)} KAS`;
  }

  return '0 KAS';
}

export function formatUtxo(utxo: KaspaUtxo) {
  return {
    outpoint: `${utxo.transactionId}:${utxo.index}`,
    amount: sompiToKas(utxo.amountSompi),
    amountKas: `${sompiToKas(utxo.amountSompi)} KAS`,
    address: utxo.address,
    mature: utxo.isMature !== false,
    coinbase: utxo.isCoinbase === true,
  };
}

export function formatTransaction(transaction: WalletTransaction) {
  const change = transaction.changeSompi;

  return {
    id: transaction.transactionId,
    direction: transaction.direction,
    incoming: `${sompiToKas(transaction.incomingSompi)} KAS`,
    outgoing: `${sompiToKas(transaction.outgoingSompi)} KAS`,
    change: `${sompiToKas(change)} KAS`,
    fee: `${sompiToKas(transaction.feeSompi)} KAS`,
    balanceChange: formatBalanceChange(transaction.netChangeSompi),
    confirmed: transaction.confirmed,
    timestamp: transaction.timestamp
      ? new Date(transaction.timestamp).toISOString()
      : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Simple React-friendly loader                                                */
/* -------------------------------------------------------------------------- */

export async function loadKaspaWalletData(addressOrAddresses: string | string[]): Promise<{
  balance: string;
  balanceSompi: bigint;
  utxos: ReturnType<typeof formatUtxo>[];
  transactions: ReturnType<typeof formatTransaction>[];
  totalBalanceChange: string;
}> {
  const wallet = new KaspaWalletHistory({
    network: 'mainnet',
  });

  const snapshot = await wallet.getWalletSnapshot(addressOrAddresses, {
    limit: 50,
  });

  return {
    balance: `${snapshot.balanceKas} KAS`,
    balanceSompi: snapshot.balanceSompi,
    utxos: snapshot.utxos.map(formatUtxo),
    transactions: snapshot.transactions.map(formatTransaction),
    totalBalanceChange: formatBalanceChange(snapshot.balanceChangeSompi),
  };
}
