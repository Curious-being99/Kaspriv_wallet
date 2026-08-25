import { registerPlugin } from '@capacitor/core';

export interface DecentralizedNotificationPlugin {
  checkPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  requestPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  notifyTransaction(options: {
    title: string;
    message: string;
    txid?: string;
    type?: 'receive' | 'broadcast';
    amount?: string;
  }): Promise<{ status: string; notificationId?: number }>;
}

export const DecentralizedNotification = registerPlugin<DecentralizedNotificationPlugin>(
  'DecentralizedNotification'
);
