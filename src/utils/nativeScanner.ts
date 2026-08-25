import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { isNative } from './platform';

export interface NativeScanResult {
  text: string;
  format?: string;
}

/**
 * Checks if native hardware camera scanning is supported on this device/environment.
 */
export async function isNativeScannerSupported(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { supported } = await BarcodeScanner.isSupported();
    return !!supported;
  } catch (err) {
    console.warn('Native scanner support check failed:', err);
    return false;
  }
}

/**
 * Prepares Android Google Barcode Scanner module if needed.
 */
export async function prepareGoogleBarcodeScanner(): Promise<void> {
  if (!isNative()) return;
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    }
  } catch (e) {
    console.warn('Google barcode scanner module check/install warning:', e);
  }
}

/**
 * Launches the native OS camera scanner directly (Google Barcode Scanner / Native Camera on Android/iOS).
 * This uses the device hardware camera rather than a browser viewport.
 * Returns null if the user canceled the scan.
 */
export async function scanNativeQrCode(): Promise<NativeScanResult | null> {
  if (!isNative()) {
    return null;
  }

  // 1. Ensure camera permissions
  const status = await BarcodeScanner.checkPermissions();
  if (status.camera !== 'granted') {
    const requestStatus = await BarcodeScanner.requestPermissions();
    if (requestStatus.camera !== 'granted') {
      throw new Error('Camera permission denied by user.');
    }
  }

  // 2. Prepare Google Barcode Scanner Module on Android
  await prepareGoogleBarcodeScanner();

  // 3. Trigger native hardware camera scanner
  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode],
  });

  if (barcodes && barcodes.length > 0) {
    const scanned = barcodes[0];
    const text = scanned.rawValue || scanned.displayValue || '';
    if (text) {
      return {
        text,
        format: scanned.format,
      };
    }
  }

  return null;
}
