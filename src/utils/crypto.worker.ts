import { decryptWithPassword, encryptWithPassword } from './crypto';
import { IsolatedSigner } from './IsolatedSigner';

// Define the postMessage handlers inside our secure isolated worker thread
self.addEventListener('message', async (e: MessageEvent) => {
  const { id, action, payload } = e.data;
  try {
    if (action === 'decryptWithPassword') {
      const { ciphertextHex, saltHex, ivHex, password, context } = payload;
      const decrypted = await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
      self.postMessage({ id, success: true, result: decrypted });
    } else if (action === 'encryptWithPassword') {
      const { plaintext, password, context } = payload;
      const encrypted = await encryptWithPassword(plaintext, password, context);
      self.postMessage({ id, success: true, result: encrypted });
    } else if (action === 'signTransactionIsolated') {
      const { serializedIntent, mnemonic, passphrase, addressType, redeemScriptHex } = payload;
      
      // Reconstruct BigInts inside the worker
      const intent = deserializeWithBigInt(serializedIntent);
      const res = await IsolatedSigner.signTransactionIsolated(
        intent,
        mnemonic,
        passphrase,
        addressType,
        redeemScriptHex
      );
      
      // Serialize BigInts back to main thread
      const serializedRes = serializeWithBigInt(res);
      self.postMessage({ id, success: true, result: serializedRes });
    } else if (action === 'signMessageIsolated') {
      const { mnemonic, passphrase, message } = payload;
      const res = await IsolatedSigner.signMessageIsolated(mnemonic, passphrase, message);
      self.postMessage({ id, success: true, result: res });
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
