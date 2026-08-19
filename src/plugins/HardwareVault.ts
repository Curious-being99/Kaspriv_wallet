import { registerPlugin } from '@capacitor/core';

export interface HardwareVaultPlugin {
  createBiometricKey(options: {
    alias: string;
    requireStrongBox?: boolean;
  }): Promise<{ alias: string; strongBox: boolean; existed?: boolean }>;

  wrapSecret(options: {
    alias: string;
    secretBase64: string;
  }): Promise<{ wrappedBase64: string; ivBase64: string }>;

  unwrapSecret(options: {
    alias: string;
    wrappedBase64: string;
    ivBase64: string;
  }): Promise<{ secretBase64: string }>;

  hasKey(options: { alias: string }): Promise<{ exists: boolean }>;
  deleteKey(options: { alias: string }): Promise<void>;
}

export const HardwareVault = registerPlugin<HardwareVaultPlugin>('HardwareVault');
