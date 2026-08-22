import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { encryptWithPassword, decryptWithPassword } from './crypto';
import { HardwareVault } from '../plugins/HardwareVault';
import { isNative } from './platform';

export interface BiometricCredentialRecord {
  credentialId: string; // native credential handle
  mode: 'keystore';
  ciphertext?: string;
  salt?: string;
  iv?: string;
  createdAt: number;
  wrappedMaster?: { ciphertext: string; iv: string };
  alias?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  mode: 'keystore';
  decryptedPassword?: string;
  error?: string;
}

export async function deleteNativeKeystoreAlias(): Promise<void> {
  try {
    if (typeof HardwareVault?.deleteKey === 'function') {
      await HardwareVault.deleteKey({ alias: 'kaspriv_biometric_keystore_alias' });
    }
    await (BiometricAuth as any).deleteCredentials?.({ server: 'kaspriv-wallet' }).catch(() => {});
    await (BiometricAuth as any).clearCredentials?.().catch(() => {});
  } catch {}
}

/**
 * Check if the current device or native mobile APK container supports
 * native platform biometrics (Android BiometricPrompt, iOS Touch ID/Face ID via hardware).
 */
export async function isBiometricsSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;

    // 1. Check Native Biometric plugin availability
    try {
      const bioInfo = await BiometricAuth.checkBiometry();
      if (bioInfo?.isAvailable || (bioInfo?.biometryType && bioInfo.biometryType > BiometryType.none) || bioInfo?.deviceIsSecure) {
        return true;
      }
    } catch {}

    // 2. Check Native Android / iOS Container (Capacitor or Native Bridge)
    const isNativeContainer =
      isNative() ||
      !!(window as any).AndroidNativeBiometrics ||
      !!(window as any).webkit?.messageHandlers?.biometrics;

    if (isNativeContainer) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

const BIOMETRIC_AAD_CONTEXT = 'KASPRIV-WALLET-v1|BIOMETRICS|VAULT';

/**
 * Register native biometric credentials strictly on the secure hardware enclave or native APK container.
 */
export async function registerBiometricUnlock(
  walletPassword: string
): Promise<BiometricCredentialRecord> {
  const supported = await isBiometricsSupported();
  if (!supported) {
    throw new Error('Platform biometrics are not supported or enabled on this device.');
  }

  (window as any).isBiometricPromptActive = true;
  try {
    const isNativeContainer =
      isNative() ||
      !!(window as any).AndroidNativeBiometrics;

    if (!isNativeContainer) {
      throw new Error('Secure biometric Keystore is only supported in the native mobile container.');
    }

    // --- Native APK / Mobile Container Path (HardwareVault BiometricPrompt) ---
    try {
      const alias = 'kaspriv_vault_v1';
      await HardwareVault.createBiometricKey({ alias, requireStrongBox: false });

      const master = new Uint8Array(32);
      crypto.getRandomValues(master);
      
      let binary = '';
      for (let i = 0; i < master.byteLength; i++) {
        binary += String.fromCharCode(master[i]);
      }
      const secretBase64 = btoa(binary);

      const { wrappedBase64, ivBase64 } = await HardwareVault.wrapSecret({
        alias,
        secretBase64,
      });

      const encrypted = await encryptWithPassword(
        walletPassword,
        secretBase64,
        BIOMETRIC_AAD_CONTEXT
      );

      master.fill(0);

      return {
        credentialId: `keystore:${alias}`,
        mode: 'keystore',
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
        createdAt: Date.now(),
        alias,
        wrappedMaster: { ciphertext: wrappedBase64, iv: ivBase64 }
      };
    } catch (err: any) {
      console.error('Secure Biometric Keystore registration failed:', err);
      throw new Error('Biometric registration failed: Your device secure hardware enclave (Android Keystore / StrongBox) is not available or rejected the request.');
    }
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}

/**
 * Authenticate with native biometrics strictly via the native hardware enclave or native APK container.
 */
export async function authenticateWithBiometrics(
  record: BiometricCredentialRecord
): Promise<BiometricAuthResult> {
  const supported = await isBiometricsSupported();
  if (!supported) {
    throw new Error('Biometric hardware is not available on this device.');
  }

  (window as any).isBiometricPromptActive = true;
  try {
    const isNativeContainer =
      record.credentialId?.startsWith('keystore:') ||
      record.credentialId?.startsWith('native-apk-') ||
      isNative() ||
      !!(window as any).AndroidNativeBiometrics;

    if (!isNativeContainer) {
      throw new Error('Secure biometric authentication is only supported in the native mobile container.');
    }

    // --- Native APK / Mobile Container Path ---
    if (record.credentialId?.startsWith('keystore:') && record.alias && record.wrappedMaster && record.ciphertext && record.salt && record.iv) {
      const { secretBase64 } = await HardwareVault.unwrapSecret({
        alias: record.alias,
        wrappedBase64: record.wrappedMaster.ciphertext,
        ivBase64: record.wrappedMaster.iv,
      });

      const decryptedPassword = await decryptWithPassword(
        record.ciphertext,
        record.salt,
        record.iv,
        secretBase64,
        BIOMETRIC_AAD_CONTEXT
      );

      return {
        success: true,
        mode: 'keystore',
        decryptedPassword,
      };
    }

    throw new Error('Insecure fallback biometric records are not allowed. Please re-register biometrics.');
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}
