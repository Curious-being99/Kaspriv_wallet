import { registerPlugin } from '@capacitor/core';

export interface HardwareVaultPlugin {
  checkBiometricSupport(): Promise<{ available: boolean; status: number; hasStrongBox: boolean }>;
  storeSecure(options: { alias: string; data: string }): Promise<{ iv: string; ciphertext: string }>;
  loadSecure(options: { alias: string; iv: string; ciphertext: string }): Promise<{ data: string }>;
  deleteKey(options: { alias: string }): Promise<void>;
  getHardwareSecurityLevel(): Promise<{ insideSecureHardware: boolean; isStrongBoxBacked?: boolean; error?: string }>;

  // Optional / legacy aliases for test compatibility
  createBiometricKey?(options: { alias: string; requireStrongBox?: boolean }): Promise<{ alias: string; existed?: boolean; isHardwareBacked?: boolean; securityLevel?: string }>;
  wrapSecret?(options: { alias: string; secretBase64: string }): Promise<{ wrappedBase64: string; ivBase64: string }>;
  unwrapSecret?(options: { alias: string; wrappedBase64: string; ivBase64: string }): Promise<{ secretBase64: string }>;
}

export const HardwareVault = registerPlugin<HardwareVaultPlugin>('HardwareVault');
