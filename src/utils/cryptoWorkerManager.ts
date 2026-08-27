import MyWorker from './crypto.worker?worker';
import { isAndroid } from './platform';
import { registerMainThreadDelegate } from './crypto';

interface WorkerTask {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

class CryptoWorkerManager {
  private worker: Worker | null = null;
  private tasks: Map<string, WorkerTask> = new Map();
  private nextTaskId = 0;
  private supportState: 'unknown' | 'supported' | 'unsupported' = 'unknown';

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.supportState = 'unsupported';
      return;
    }
    try {
      // Instantiate standard Vite Worker
      this.worker = new MyWorker();
      
      this.worker.addEventListener('message', (e: MessageEvent) => {
        const { id, success, result, error } = e.data;
        const task = this.tasks.get(id);
        if (task) {
          this.tasks.delete(id);
          if (success) {
            task.resolve(result);
          } else {
            task.reject(new Error(error));
          }
        }
      });

      this.worker.addEventListener('error', (err) => {
        console.warn('CryptoWorkerManager: Worker thread runtime error:', err);
        // Reject all pending tasks so main thread does not hang
        for (const [id, task] of this.tasks.entries()) {
          task.reject(new Error(`Worker error: ${err.message || 'Unknown runtime error'}`));
        }
        this.tasks.clear();
      });

      this.supportState = 'supported';
      
      // Register delegate so that direct calls to decryptWithPassword/encryptWithPassword run off-thread automatically
      registerMainThreadDelegate((action, payload) => this.runTask(action, payload));
    } catch (e) {
      console.warn('CryptoWorkerManager: Failed to initialize background worker thread, using main thread fallback:', e);
      this.supportState = 'unsupported';
      this.worker = null;
    }
  }

  public isSupported(): boolean {
    return this.supportState === 'supported' && this.worker !== null;
  }

  public runTask<T>(action: string, payload: any, timeoutMs = 15000): Promise<T> {
    if (!this.isSupported() || !this.worker) {
      return Promise.reject(new Error('Worker is not supported or initialized.'));
    }

    return new Promise<T>((resolve, reject) => {
      const id = `${Date.now()}-${this.nextTaskId++}`;
      
      const timer = setTimeout(() => {
        if (this.tasks.has(id)) {
          this.tasks.delete(id);
          reject(new Error(`Worker task '${action}' timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.tasks.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      
      const isAndroidAPK = isAndroid();
      const enrichedPayload = { ...payload, isAndroidAPK };
      
      this.worker!.postMessage({ id, action, payload: enrichedPayload });
    });
  }
}

export const cryptoWorkerManager = new CryptoWorkerManager();

// JSON BigInt helpers for secure boundary data transfers
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
