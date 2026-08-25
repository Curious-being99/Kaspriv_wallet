import { registerPlugin } from '@capacitor/core';

export interface NativeScanResult {
  text: string;
  format?: string;
}

export interface NativeScannerPlugin {
  scan(): Promise<NativeScanResult | null>;
}

const NativeScanner = registerPlugin<NativeScannerPlugin>('NativeScanner');

export async function isNativeScannerSupported(): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
    return true;
  }
  return false;
}

export async function prepareGoogleBarcodeScanner(): Promise<void> {
  // No-op
}

export async function scanNativeQrCode(): Promise<NativeScanResult | null> {
  try {
    if (await isNativeScannerSupported()) {
      const result = await NativeScanner.scan();
      return result;
    }
  } catch (err) {
    console.warn('Native QR scanner error or cancelled:', err);
  }
  return null;
}


