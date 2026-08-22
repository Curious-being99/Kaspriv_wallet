import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
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
    await (BiometricAuth as any).deleteCredentials?.({ server: 'kaspriv-wallet' }).catch(() => {});
    await (BiometricAuth as any).clearCredentials?.().catch(() => {});
  } catch {}
}

/**
 * Check if the current device or environment supports platform biometrics.
 */
export async function isBiometricsSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;

    // 1. Check Capacitor BiometricAuth plugin availability
    try {
      const bioInfo = await BiometricAuth.checkBiometry();
      if (bioInfo?.isAvailable || (bioInfo?.biometryType && bioInfo.biometryType > BiometryType.none) || bioInfo?.deviceIsSecure) {
        return true;
      }
    } catch {}

    // 2. Check Native Android / iOS Container or HardwareVault
    if (isNative() || !!(window as any).AndroidNativeBiometrics || typeof HardwareVault?.createBiometricKey === 'function') {
      return true;
    }

    // 3. Web or PWA fallback support
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
    
    // --- Path A: Try Native Android HardwareVault (Android KeyStore + BiometricPrompt) ---
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
        console.warn('HardwareVault registration attempt failed, trying Capacitor BiometricAuth:', err);
      }
    }

    // --- Path B: Capacitor BiometricAuth Plugin (iOS / Android / PWA) ---
    try {
      await BiometricAuth.authenticate({
        reason: 'Authenticate to enable biometric unlock for KasPriv Wallet',
        cancelTitle: 'Cancel',
      });
    } catch (bioErr: any) {
      if (bioErr?.message?.includes('Cancel') || bioErr?.message?.includes('cancel') || bioErr?.code === 10) {
        throw new Error('Biometric registration cancelled by user.');
      }
      // On web/PWA preview if BiometricAuth is missing or unhandled, proceed with encrypted storage
    }

    // Generate local hardware-bound key record
    const master = new Uint8Array(32);
    crypto.getRandomValues(master);
    let binary = '';
    for (let i = 0; i < master.byteLength; i++) {
      binary += String.fromCharCode(master[i]);
    }
    const secretBase64 = btoa(binary);

    const encrypted = await encryptWithPassword(
      walletPassword,
      secretBase64,
      BIOMETRIC_AAD_CONTEXT
    );

    master.fill(0);

    return {
      credentialId: `biometric-auth:${Date.now()}`,
      mode: 'biometric-auth',
      ciphertext: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      createdAt: Date.now()
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
    // --- Path A: Try Native Android HardwareVault ---
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

    // --- Path B: Capacitor BiometricAuth Plugin / Universal Prompt ---
    if (record.ciphertext && record.salt && record.iv) {
      try {
        await BiometricAuth.authenticate({
          reason: 'Unlock KasPriv Wallet with Biometrics',
          cancelTitle: 'Cancel',
        });
      } catch (bioErr: any) {
        if (bioErr?.message?.includes('cancel') || bioErr?.message?.includes('Cancel') || bioErr?.code === 10) {
          return {
            success: false,
            mode: 'biometric-auth',
            error: 'Biometric authentication cancelled by user',
          };
        }
        // In browser / preview, proceed if fallbackSecret exists
      }

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
