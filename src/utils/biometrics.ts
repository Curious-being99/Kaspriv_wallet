import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { encryptWithPassword, decryptWithPassword } from './crypto';
import { HardwareVault } from '../plugins/HardwareVault';

export interface BiometricCredentialRecord {
  credentialId: string; // base64url or native credential handle
  mode: 'prf' | 'presence' | 'keystore';
  // Only for mode === 'prf': password encrypted under PRF-derived secret or hardware-authorized key
  ciphertext?: string;
  salt?: string;
  iv?: string;
  prfSalt?: string; // base64url of salt or local key used in encryption
  createdAt: number;
  wrappedMaster?: { ciphertext: string; iv: string };
  alias?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  mode: 'prf' | 'presence' | 'keystore';
  decryptedPassword?: string;
  error?: string;
  isLegacyRecord?: boolean;
}

/**
 * Check if the current device/browser or native mobile APK container supports
 * native platform biometrics (Android BiometricPrompt, iOS Touch ID/Face ID, Windows Hello, WebAuthn).
 */
export async function isBiometricsSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;

    // 1. Check Native Biometric plugin
    try {
      const bioInfo = await BiometricAuth.checkBiometry();
      if (bioInfo?.isAvailable || (bioInfo?.biometryType && bioInfo.biometryType > BiometryType.none) || bioInfo?.deviceIsSecure) {
        return true;
      }
    } catch {}

    // 2. Check Native Android / iOS Container (Capacitor or Native Bridge)
    const isNativeContainer =
      !!(window as any).Capacitor?.isNativePlatform?.() ||
      !!(window as any).AndroidNativeBiometrics ||
      !!(window as any).webkit?.messageHandlers?.biometrics;

    if (isNativeContainer) {
      return true;
    }

    // 3. Web / PWA Platform Authenticator Check (WebAuthn)
    if (!window.isSecureContext) return false;
    if (!window.PublicKeyCredential) return false;
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    return false;
  }
}

/**
 * Helper to convert Uint8Array / ArrayBuffer to Base64URL
 */
function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Helper to convert Base64URL to Uint8Array
 */
function base64UrlToBuffer(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const BIOMETRIC_AAD_CONTEXT = 'KASPRIV-WALLET-v1|BIOMETRICS|VAULT';

/**
 * Register native biometric credentials on the device hardware enclave or native APK container.
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
      !!(window as any).Capacitor?.isNativePlatform?.() ||
      !!(window as any).AndroidNativeBiometrics;

    // --- 1. Native APK / Mobile Container Path (HardwareVault BiometricPrompt) ---
    if (isNativeContainer) {
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
        console.warn('HardwareVault registration failed, falling back to legacy APK prf:', err);
        
        // Fallback to legacy APK prf path (requires standard BiometricAuth)
        await BiometricAuth.authenticate({
          reason: 'Authorize KasPriv Vault biometric unlock',
          cancelTitle: 'Cancel',
          allowDeviceCredential: false,
          androidTitle: 'KasPriv Vault Biometrics',
          androidSubtitle: 'Scan fingerprint or face to register',
        });

        const localKeyBytes = new Uint8Array(32);
        crypto.getRandomValues(localKeyBytes);
        const localKeyStr = bufferToBase64Url(localKeyBytes);

        const encrypted = await encryptWithPassword(
          walletPassword,
          localKeyStr,
          BIOMETRIC_AAD_CONTEXT
        );

        const randomId = new Uint8Array(16);
        crypto.getRandomValues(randomId);

        return {
          credentialId: `native-apk-fallback-${bufferToBase64Url(randomId)}`,
          mode: 'prf',
          ciphertext: encrypted.ciphertext,
          salt: encrypted.salt,
          iv: encrypted.iv,
          prfSalt: localKeyStr,
          createdAt: Date.now(),
        };
      }
    }

    // --- 2. Web / PWA WebAuthn Path ---
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const prfSalt = new Uint8Array(32);
    crypto.getRandomValues(prfSalt);
    const prfSaltBase64Url = bufferToBase64Url(prfSalt);

    const publicKeyCredentialCreationOptions: any = {
      challenge,
      rp: {
        name: 'KasPriv Wallet',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: 'KasPriv Vault',
        displayName: 'KasPriv User',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
      extensions: {
        prf: {
          eval: {
            first: prfSalt,
          },
        },
      },
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Biometric registration was cancelled or not completed.');
    }

    const credentialIdStr = bufferToBase64Url(credential.rawId);
    const extResults = credential.getClientExtensionResults() as any;

    let prfSecretBuffer: ArrayBuffer | undefined = extResults?.prf?.results?.first;

    if (!prfSecretBuffer && extResults?.prf?.enabled) {
      try {
        const getOptions: any = {
          challenge: new Uint8Array(32),
          rpId: window.location.hostname,
          allowCredentials: [
            {
              id: credential.rawId,
              type: 'public-key',
              transports: ['internal'],
            },
          ],
          userVerification: 'required',
          timeout: 60000,
          extensions: {
            prf: {
              eval: {
                first: prfSalt,
              },
            },
          },
        };
        const assertion = (await navigator.credentials.get({
          publicKey: getOptions,
        })) as PublicKeyCredential | null;
        const assertionExt = assertion?.getClientExtensionResults() as any;
        prfSecretBuffer = assertionExt?.prf?.results?.first;
      } catch (e) {
        // Fallback to presence mode
      }
    }

    if (prfSecretBuffer) {
      const prfSecretKey = bufferToBase64Url(prfSecretBuffer);
      const encrypted = await encryptWithPassword(
        walletPassword,
        prfSecretKey,
        BIOMETRIC_AAD_CONTEXT
      );

      return {
        credentialId: credentialIdStr,
        mode: 'prf',
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
        prfSalt: prfSaltBase64Url,
        createdAt: Date.now(),
      };
    }

    return {
      credentialId: credentialIdStr,
      mode: 'presence',
      createdAt: Date.now(),
    };
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}

/**
 * Authenticate with native biometrics via hardware enclave or native APK container.
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
      record.credentialId?.startsWith('native-apk-') ||
      !!(window as any).Capacitor?.isNativePlatform?.() ||
      !!(window as any).AndroidNativeBiometrics;

    // --- 1. Native APK / Mobile Container Path ---
    if (isNativeContainer) {
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

      await BiometricAuth.authenticate({
        reason: 'Unlock KasPriv Vault',
        cancelTitle: 'Cancel',
        allowDeviceCredential: false,
        androidTitle: 'KasPriv Vault Biometrics',
        androidSubtitle: 'Scan fingerprint or face to unlock',
      });

      if (record.ciphertext && record.salt && record.iv && record.prfSalt) {
        const decryptedPassword = await decryptWithPassword(
          record.ciphertext,
          record.salt,
          record.iv,
          record.prfSalt,
          BIOMETRIC_AAD_CONTEXT
        );
        return {
          success: true,
          mode: 'prf',
          decryptedPassword,
        };
      }

      return {
        success: true,
        mode: 'presence',
      };
    }

    // --- 2. Web / PWA WebAuthn Path ---
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const credentialIdBuffer = base64UrlToBuffer(record.credentialId);

    if (!record.mode && (record as any).unlockKey && record.ciphertext && record.salt && record.iv) {
      const decryptedPassword = await decryptWithPassword(
        record.ciphertext,
        record.salt,
        record.iv,
        (record as any).unlockKey,
        BIOMETRIC_AAD_CONTEXT
      );
      return {
        success: true,
        mode: 'prf',
        decryptedPassword,
        isLegacyRecord: true,
      };
    }

    if (record.mode === 'prf' && record.prfSalt && record.ciphertext && record.salt && record.iv) {
      const prfSaltBytes = base64UrlToBuffer(record.prfSalt);

      const publicKeyCredentialRequestOptions: any = {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            id: credentialIdBuffer,
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
        extensions: {
          prf: {
            eval: {
              first: prfSaltBytes,
            },
          },
        },
      };

      const assertion = (await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error('Biometric authentication failed or was cancelled.');
      }

      const extResults = assertion.getClientExtensionResults() as any;
      const prfBuffer = extResults?.prf?.results?.first;

      if (prfBuffer) {
        const prfSecretKey = bufferToBase64Url(prfBuffer);
        const decryptedPassword = await decryptWithPassword(
          record.ciphertext,
          record.salt,
          record.iv,
          prfSecretKey,
          BIOMETRIC_AAD_CONTEXT
        );

        return {
          success: true,
          mode: 'prf',
          decryptedPassword,
        };
      }
    }

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          id: credentialIdBuffer,
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric authentication failed or was cancelled.');
    }

    return {
      success: true,
      mode: 'presence',
    };
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}

