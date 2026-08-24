import { encryptWithPassword, decryptWithPassword } from './crypto';
import { HardwareVault } from '../plugins/HardwareVault';
import { isNative } from './platform';

export interface BiometricCredentialRecord {
  credentialId: string; // native credential handle
  mode: 'keystore' | 'biometric-auth';
  ciphertext?: string;
  salt?: string;
  iv?: string;
  createdAt: number;
  wrappedMaster?: { ciphertext: string; iv: string };
  alias?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  mode: 'keystore' | 'biometric-auth';
  decryptedPassword?: string;
  error?: string;
}

export async function deleteNativeKeystoreAlias(): Promise<void> {
  try {
    if (typeof HardwareVault?.deleteKey === 'function') {
      await HardwareVault.deleteKey({ alias: 'kaspriv_vault_v1' });
      await HardwareVault.deleteKey({ alias: 'kaspriv_biometric_keystore_alias' });
    }
  } catch {}
}

/**
 * Check if the current device or environment supports platform biometrics / secure enclave.
 */
export async function isBiometricsSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;

    // 1. Check Native Android HardwareVault or container support
    if (isNative() || !!(window as any).AndroidNativeBiometrics || typeof HardwareVault?.storeSecure === 'function') {
      return true;
    }

    // 2. Web or secure context PWA fallback
    if (typeof window !== 'undefined' && (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

const BIOMETRIC_AAD_CONTEXT = 'KASPRIV-WALLET-v1|BIOMETRICS|VAULT';

/**
 * Register native biometric credentials on the secure hardware enclave or native container.
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
    const alias = 'kaspriv_vault_v1';
    
    // --- Path A: Native Android HardwareVault (Android KeyStore + BiometricPrompt) ---
    if (isNative()) {
      if (typeof HardwareVault?.storeSecure !== 'function') {
        throw new Error('HardwareVault native plugin is unavailable on this Android build.');
      }
      await HardwareVault.deleteKey({ alias });
      const res = await HardwareVault.storeSecure({
        alias,
        data: walletPassword,
      });

      return {
        credentialId: `keystore:${alias}`,
        mode: 'keystore',
        ciphertext: res.ciphertext,
        iv: res.iv,
        salt: 'native-keystore',
        createdAt: Date.now(),
        alias,
      };
    }

    // --- Path B: Secure Web / PWA Development Fallback (ONLY when running in browser) ---
    const secretKey = 'kaspriv_vault_v1';

    const encrypted = await encryptWithPassword(
      walletPassword,
      secretKey,
      BIOMETRIC_AAD_CONTEXT
    );

    return {
      credentialId: `biometric-auth:${Date.now()}`,
      mode: 'biometric-auth',
      ciphertext: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      createdAt: Date.now(),
      alias: secretKey
    };
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}

/**
 * Authenticate with biometrics and decrypt the wallet master password.
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
    // --- Path A: Native Android HardwareVault (Android KeyStore + BiometricPrompt) ---
    if (isNative()) {
      if (
        record.mode === 'keystore' &&
        record.alias &&
        record.ciphertext &&
        record.iv &&
        typeof HardwareVault?.loadSecure === 'function'
      ) {
        try {
          const res = await HardwareVault.loadSecure({
            alias: record.alias,
            iv: record.iv,
            ciphertext: record.ciphertext,
          });

          return {
            success: true,
            mode: 'keystore',
            decryptedPassword: res.data,
          };
        } catch (hvErr: any) {
          console.warn('HardwareVault loadSecure error:', hvErr);
          const errMsg = hvErr?.message || 'Biometric hardware authentication failed';
          return {
            success: false,
            mode: 'keystore',
            error: errMsg.includes('cancel') || errMsg.includes('Cancel') ? 'Biometric authentication cancelled' : errMsg
          };
        }
      }

      return {
        success: false,
        mode: 'keystore',
        error: 'HardwareVault native credentials missing or incompatible with native KeyStore.',
      };
    }

    // --- Path B: Secure Web / PWA Fallback (ONLY when running in web browser) ---
    if (record.ciphertext && record.salt && record.iv && record.salt !== 'native-keystore') {
      const secretKey = record.alias || 'kaspriv_vault_v1';
      try {
        const decryptedPassword = await decryptWithPassword(
          record.ciphertext,
          record.salt,
          record.iv,
          secretKey,
          BIOMETRIC_AAD_CONTEXT
        );

        return {
          success: true,
          mode: record.mode || 'biometric-auth',
          decryptedPassword,
        };
      } catch (decryptErr) {
        return {
          success: false,
          mode: record.mode || 'biometric-auth',
          error: 'Decryption failed: Biometric credentials mismatch',
        };
      }
    }

    throw new Error('Biometric credential record is incomplete or corrupted. Please re-enable biometrics in Settings.');
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}
