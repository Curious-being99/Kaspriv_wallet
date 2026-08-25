export interface NativeScanResult {
  text: string;
  format?: string;
}

export async function isNativeScannerSupported(): Promise<boolean> {
  return false;
}

export async function prepareGoogleBarcodeScanner(): Promise<void> {
  // No-op: external Google barcode scanner module removed in favor of in-app wallet camera viewport
}

export async function scanNativeQrCode(): Promise<NativeScanResult | null> {
  return null;
}

