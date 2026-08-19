import { encryptWithPassword, decryptWithPassword } from './crypto';

export interface BiometricCredentialRecord {
  credentialId: string; // base64url or native credential handle
  mode: 'prf' | 'presence';
  // Only for mode === 'prf': password encrypted under PRF-derived secret
  ciphertext?: string;
  salt?: string;
  iv?: string;
  prfSalt?: string; // base64url of fixed or random salt used in prf.eval.first
  createdAt: number;
  // FORBIDDEN: unlockKey or any recoverable KEK in plaintext
}

export interface BiometricAuthResult {
  success: boolean;
  mode: 'prf' | 'presence';
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

    // 1. Check Native Android / iOS APK Container (Capacitor or Native Bridge)
    const isNativeContainer =
      !!(window as any).Capacitor?.isNativePlatform?.() ||
      !!(window as any).AndroidNativeBiometrics ||
      !!(window as any).webkit?.messageHandlers?.biometrics;

    if (isNativeContainer) {
      if ((window as any).Capacitor?.Plugins?.NativeBiometric) {
        try {
          const res = await (window as any).Capacitor.Plugins.NativeBiometric.isAvailable();
          return !!res?.isAvailable;
        } catch {
          return true;
        }
      }
      return true;
    }

    // 2. Web / PWA Platform Authenticator Check (WebAuthn)
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

    // --- Native APK / Mobile Container Path ---
    if (isNativeContainer) {
      if ((window as any).Capacitor?.Plugins?.NativeBiometric) {
        await (window as any).Capacitor.Plugins.NativeBiometric.verifyIdentity({
          reason: 'Authorize KasPriv Wallet Biometric Key',
          title: 'KasPriv Vault Biometrics',
          subtitle: 'Verify identity to enable native unlock',
        });
      }
      const randomId = new Uint8Array(16);
      crypto.getRandomValues(randomId);
      return {
        credentialId: `native-apk-${bufferToBase64Url(randomId)}`,
        mode: 'presence',
        createdAt: Date.now(),
      };
    }

    // --- Web / PWA WebAuthn Path ---
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
      record.credentialId.startsWith('native-apk-') ||
      !!(window as any).Capacitor?.isNativePlatform?.() ||
      !!(window as any).AndroidNativeBiometrics;

    // --- Native APK / Mobile Container Path ---
    if (isNativeContainer) {
      if ((window as any).Capacitor?.Plugins?.NativeBiometric) {
        await (window as any).Capacitor.Plugins.NativeBiometric.verifyIdentity({
          reason: 'Unlock KasPriv Vault',
          title: 'KasPriv Biometrics',
          subtitle: 'Touch sensor or use Face ID to unlock',
        });
      }
      return {
        success: true,
        mode: 'presence',
      };
    }

    // --- Web / PWA WebAuthn Path ---
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
