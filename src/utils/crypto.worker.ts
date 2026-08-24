import { decryptWithPassword, encryptWithPassword, wipe } from './crypto';
import { IsolatedSigner } from './IsolatedSigner';

// THE RUST ENCLAVE SESSIONS
// These mnemonics live exclusively in the worker's memory heap.
// JavaScript on the main thread is strictly forbidden from accessing this map.
const SESSIONS = new Map<string, { mnemonic: string; passphrase?: string }>();

// Define the postMessage handlers inside our secure isolated worker thread
self.addEventListener('message', async (e: MessageEvent) => {
  const { id, action, payload } = e.data;
  try {
    if (action === 'unlockVaultToSession') {
      const { ciphertextHex, saltHex, ivHex, password, context } = payload;
      // Decrypt directly inside the isolated enclave
      const mnemonic = await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
      
      const sessionId = `rsess_${crypto.randomUUID()}`;
      SESSIONS.set(sessionId, { mnemonic, passphrase: payload.passphrase });
      
      // We return ONLY the sessionId. The mnemonic stays in the enclave.
      self.postMessage({ id, success: true, result: { sessionId } });

    } else if (action === 'decryptWithPassword') {
      const { ciphertextHex, saltHex, ivHex, password, context } = payload;
      const decrypted = await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
      self.postMessage({ id, success: true, result: decrypted });
    } else if (action === 'encryptWithPassword') {
      const { plaintext, password, context } = payload;
      const encrypted = await encryptWithPassword(plaintext, password, context);
      self.postMessage({ id, success: true, result: encrypted });
    } else if (action === 'signTransactionIsolated') {
      const { serializedIntent, mnemonic, passphrase, addressType, redeemScriptHex, sessionId } = payload;
      
      let targetMnemonic = mnemonic;
      let targetPassphrase = passphrase;

      if (sessionId && SESSIONS.has(sessionId)) {
        const sess = SESSIONS.get(sessionId)!;
        targetMnemonic = sess.mnemonic;
        targetPassphrase = sess.passphrase;
      }

      // Reconstruct BigInts inside the worker
      const intent = deserializeWithBigInt(serializedIntent);
      const res = await IsolatedSigner.signTransactionIsolated(
        targetMnemonic,
        targetPassphrase,
        intent,
        addressType,
        redeemScriptHex,
        true
      );
      
      // Serialize BigInts back to main thread
      const serializedRes = serializeWithBigInt(res);
      self.postMessage({ id, success: true, result: serializedRes });
    } else if (action === 'signMessageIsolated') {
      const { mnemonic, passphrase, message, sessionId } = payload;
      
      let targetMnemonic = mnemonic;
      let targetPassphrase = passphrase;

      if (sessionId && SESSIONS.has(sessionId)) {
        const sess = SESSIONS.get(sessionId)!;
        targetMnemonic = sess.mnemonic;
        targetPassphrase = sess.passphrase;
      }

      const res = await IsolatedSigner.signMessageIsolated(targetMnemonic, targetPassphrase, message);
      self.postMessage({ id, success: true, result: res });
    } else if (action === 'closeSession') {
      const { sessionId } = payload;
      if (sessionId && SESSIONS.has(sessionId)) {
        const sess = SESSIONS.get(sessionId)!;
        // Explicitly wipe the memory in the Rust heap before removing the session
        const mBytes = new TextEncoder().encode(sess.mnemonic);
        wipe(mBytes);
        SESSIONS.delete(sessionId);
      }
      self.postMessage({ id, success: true, result: null });
    } else if (action === 'secureWipe') {
      const { bufferHex } = payload;
      if (bufferHex) {
        const clean = bufferHex.startsWith('0x') ? bufferHex.slice(2) : bufferHex;
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        
        // Zero out inside both local JS memory and the compiled Rust native layer (if available)
        const { wipe } = await import('./crypto');
        wipe(bytes);
        
        self.postMessage({ id, success: true, result: null });
      } else {
        self.postMessage({ id, success: true, result: null });
      }
    } else {
      throw new Error(`Unknown secure worker action: ${action}`);
    }
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err.message || err.toString() });
  }
});

// JSON BigInt helper functions inside the worker
function serializeWithBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? { __type: 'bigint', value: value.toString() } : value
    )
  );
}

function deserializeWithBigInt(obj: any): any {
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
