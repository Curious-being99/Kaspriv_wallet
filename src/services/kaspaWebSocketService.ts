// src/services/kaspaWebSocketService.ts
//
// KasPriv Wallet: Real-Time Kaspa WebSocket Service
//
// Provides instant real-time detection for incoming/outgoing Kaspa transactions
// and UTXO changes across all wallet addresses without waiting for HTTP polling.

import { getKaspaApiUrl } from '../utils/kaspa/api';

type WebSocketEventCallback = (eventData?: any) => void;

class KaspaWebSocketManager {
  private ws: WebSocket | null = null;
  private addresses: Set<string> = new Set();
  private callbacks: Set<WebSocketEventCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isExplicitlyClosed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private getWssUrls(): string[] {
    const currentApi = getKaspaApiUrl().toLowerCase();
    const isTestnet = currentApi.includes('testnet') || currentApi.includes('tn10');

    if (isTestnet) {
      return [
        'wss://api-tn10.kaspa.org/ws',
        'wss://api-testnet-10.kaspa.org/ws',
      ];
    }

    return [
      'wss://api.kaspa.org/ws',
      'wss://api.kaspa.net/ws',
      'wss://api-v2.kaspa.org/ws',
      'wss://mainnet.kaspad.net/ws',
    ];
  }

  public subscribe(addresses: string[], callback: WebSocketEventCallback): () => void {
    addresses.forEach(addr => {
      if (addr && addr.trim()) {
        this.addresses.add(addr.trim().toLowerCase());
      }
    });

    this.callbacks.add(callback);

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.isExplicitlyClosed = false;
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscriptions();
    }

    // Return cleanup unsubscribe handler
    return () => {
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) {
        this.disconnect();
      }
    };
  }

  public updateAddresses(addresses: string[]) {
    this.addresses.clear();
    addresses.forEach(addr => {
      if (addr && addr.trim()) {
        this.addresses.add(addr.trim().toLowerCase());
      }
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscriptions();
    }
  }

  private connect(urlIndex = 0) {
    if (this.isExplicitlyClosed) return;

    const urls = this.getWssUrls();
    const wsUrl = urls[urlIndex % urls.length];

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Kaspa WSS] Connected to ${wsUrl}`);
        this.sendSubscriptions();

        // Keep-alive ping every 25 seconds
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping' }));
            } catch {}
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Any UTXO, block, or transaction message triggers callbacks
          this.notifyCallbacks(data);
        } catch {
          // If plain message, notify anyway
          this.notifyCallbacks();
        }
      };

      this.ws.onerror = (err) => {
        console.warn(`[Kaspa WSS] Error on ${wsUrl}:`, err);
      };

      this.ws.onclose = () => {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (!this.isExplicitlyClosed) {
          // Reconnect with next candidate URL after 3 seconds
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.connect(urlIndex + 1);
          }, 3000);
        }
      };
    } catch (e) {
      console.warn('[Kaspa WSS] Connection attempt failed:', e);
      if (!this.isExplicitlyClosed) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connect(urlIndex + 1);
        }, 3000);
      }
    }
  }

  private sendSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const addressList = Array.from(this.addresses);
    if (addressList.length === 0) return;

    try {
      // Send subscription messages in common formats supported by Kaspa nodes & APIs
      this.ws.send(
        JSON.stringify({
          command: 'subscribe',
          type: 'utxos-changed',
          addresses: addressList,
        })
      );

      this.ws.send(
        JSON.stringify({
          id: Date.now(),
          method: 'subscribeUtxosChangesRequest',
          params: { addresses: addressList },
        })
      );
    } catch (e) {
      console.warn('[Kaspa WSS] Failed to send subscription:', e);
    }
  }

  private notifyCallbacks(data?: any) {
    this.callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error('[Kaspa WSS] Callback error:', err);
      }
    });
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}

export const kaspaWebSocketManager = new KaspaWebSocketManager();
