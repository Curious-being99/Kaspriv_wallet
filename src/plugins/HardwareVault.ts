import { registerPlugin } from '@capacitor/core';

export interface HardwareVaultPlugin {
  checkBiometricAvailability(): Promise<{ available: boolean; reason: string }>;

  createBiometricKey(options: {
    alias: string;
    requireStrongBox?: boolean;
  }): Promise<{
    alias: string;
    existed?: boolean;
    isHardwareBacked?: boolean;
    securityLevel?: string;
  }>;

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
