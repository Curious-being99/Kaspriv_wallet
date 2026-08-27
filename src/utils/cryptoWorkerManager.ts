import { isAndroid } from './platform';
import { registerMainThreadDelegate, decryptWithPassword, encryptWithPassword, wipe, ensureKaspaWasm } from './crypto';
import { IsolatedSigner } from './IsolatedSigner';

// Ensure WASM is loaded for main thread operations
ensureKaspaWasm().catch(() => {});

// THE IN-MEMORY ENCLAVE SESSIONS
// These mnemonics live exclusively in an isolated module closure.
const SESSIONS = new Map<string, { mnemonic: string; passphrase?: string }>();

class CryptoWorkerManager {
  private supportState: 'supported' = 'supported';

  constructor() {
    // Register delegate so that direct calls to decryptWithPassword/encryptWithPassword can be routed if needed
    registerMainThreadDelegate((action, payload) => this.runTask(action, payload));
  }

  public isSupported(): boolean {
    return true; // We always support running natively on the main thread
  }

  public async runTask<T>(action: string, payload: any, timeoutMs = 15000): Promise<T> {
    try {
      const isAndroidAPK = isAndroid();
      const enrichedPayload = { ...payload, isAndroidAPK };

      if (action === 'unlockVaultToSession') {
        const { ciphertextHex, saltHex, ivHex, password, context } = enrichedPayload;
        const mnemonic = await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
        
        const sessionId = `rsess_${crypto.randomUUID()}`;
        SESSIONS.set(sessionId, { mnemonic, passphrase: enrichedPayload.passphrase });
        
        return { sessionId } as any as T;

      } else if (action === 'decryptWithPassword') {
        const { ciphertextHex, saltHex, ivHex, password, context } = enrichedPayload;
        const decrypted = await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
        return decrypted as any as T;

      } else if (action === 'encryptWithPassword') {
        const { plaintext, password, context } = enrichedPayload;
        const encrypted = await encryptWithPassword(plaintext, password, context);
        return encrypted as any as T;

      } else if (action === 'signTransactionIsolated') {
        const { serializedIntent, mnemonic, passphrase, addressType, redeemScriptHex, sessionId } = enrichedPayload;
        
        let targetMnemonic = mnemonic;
        let targetPassphrase = passphrase;

        if (sessionId && SESSIONS.has(sessionId)) {
          const sess = SESSIONS.get(sessionId)!;
          targetMnemonic = sess.mnemonic;
          targetPassphrase = sess.passphrase;
        }

        // We deserialize because legacy callers might still be using serializeWithBigInt before calling runTask
        const intent = deserializeWithBigInt(serializedIntent);
        const res = await IsolatedSigner.signTransactionIsolated(
          targetMnemonic,
          targetPassphrase,
          intent,
          addressType,
          redeemScriptHex,
          true
        );
        
        // Serialize back for legacy compatibility
        return serializeWithBigInt(res) as any as T;

      } else if (action === 'signMessageIsolated') {
        const { mnemonic, passphrase, message, sessionId } = enrichedPayload;
        
        let targetMnemonic = mnemonic;
        let targetPassphrase = passphrase;

        if (sessionId && SESSIONS.has(sessionId)) {
          const sess = SESSIONS.get(sessionId)!;
          targetMnemonic = sess.mnemonic;
          targetPassphrase = sess.passphrase;
        }

        const res = await IsolatedSigner.signMessageIsolated(targetMnemonic, targetPassphrase, message);
        return res as any as T;

      } else if (action === 'closeSession') {
        const { sessionId } = enrichedPayload;
        if (sessionId && SESSIONS.has(sessionId)) {
          const sess = SESSIONS.get(sessionId)!;
          const mBytes = new TextEncoder().encode(sess.mnemonic);
          wipe(mBytes);
          SESSIONS.delete(sessionId);
        }
        return null as any as T;

      } else if (action === 'secureWipe') {
        const { bufferHex } = enrichedPayload;
        if (bufferHex) {
          const clean = bufferHex.startsWith('0x') ? bufferHex.slice(2) : bufferHex;
          const bytes = new Uint8Array(clean.length / 2);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
          }
          wipe(bytes);
        }
        return null as any as T;

      } else {
        throw new Error(`Unknown secure action: ${action}`);
      }
    } catch (err: any) {
      throw new Error(err.message || err.toString());
    }
  }
}

export const cryptoWorkerManager = new CryptoWorkerManager();

// JSON BigInt helpers for secure boundary data transfers (kept for backward compatibility with existing callers)
export function serializeWithBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? { __type: 'bigint', value: value.toString() } : value
    )
  );
}

export function deserializeWithBigInt(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  return JSON.parse(
    JSON.stringify(obj),
    (key, value) => {
      if (value && typeof value === 'object' && value.__type === 'bigint') {
        return BigInt(value.value);
      }
      return value;
    }
  );
}
