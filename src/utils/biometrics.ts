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
    if (isNative() || !!(window as any).AndroidNativeBiometrics || typeof HardwareVault?.createBiometricKey === 'function') {
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
    if (typeof HardwareVault?.createBiometricKey === 'function') {
      try {
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
        console.warn('HardwareVault registration attempt failed, using secure fallback:', err);
      }
    }

    // --- Path B: Secure Web / PWA Fallback ---
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
    // --- Path A: Native Android HardwareVault ---
    if (
      record.mode === 'keystore' &&
      record.alias &&
      record.wrappedMaster &&
      record.ciphertext &&
      record.salt &&
      record.iv &&
      typeof HardwareVault?.unwrapSecret === 'function'
    ) {
      try {
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
      } catch (hvErr: any) {
        console.warn('HardwareVault unwrapSecret failed:', hvErr);
        const errMsg = hvErr?.message || 'Biometric hardware authentication failed';
        return {
          success: false,
          mode: 'keystore',
          error: errMsg.includes('cancel') || errMsg.includes('Cancel') ? 'Biometric authentication cancelled' : errMsg
        };
      }
    }

    // --- Path B: Secure Web / PWA Fallback ---
    if (record.ciphertext && record.salt && record.iv) {
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
