/**
 * Platform Detection & Decoupling Utilities
 * Cleanly separates Native Android (Capacitor/APK), iOS, and Web/Browser runtimes.
 */

export type PlatformType = 'android' | 'ios' | 'web';

export function getPlatform(): PlatformType {
  if (typeof window === 'undefined') return 'web';

  const capacitor = (window as any).Capacitor;
  if (capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
    const platform = typeof capacitor.getPlatform === 'function' ? capacitor.getPlatform() : 'android';
    if (platform === 'ios') return 'ios';
    return 'android';
  }

  return 'web';
}

export function isNative(): boolean {
  return getPlatform() !== 'web';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

export function isWeb(): boolean {
  return getPlatform() === 'web';
}
