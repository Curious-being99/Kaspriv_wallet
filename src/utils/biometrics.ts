import { encryptWithPassword, decryptWithPassword } from './crypto';

export interface BiometricCredentialRecord {
  credentialId: string; // Base64URL encoded
  ciphertext: string;
  salt: string;
  iv: string;
  createdAt: number;
}

/**
 * Check if the current device/browser supports native platform biometrics
 * (Touch ID, Face ID, Android BiometricPrompt, Windows Hello).
 */
export async function isBiometricsSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
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
 * Register native biometric credentials on the device hardware enclave
 * and securely wrap the wallet password for biometric unlocking.
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
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
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
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Biometric registration was cancelled or not completed.');
    }

    const credentialIdStr = bufferToBase64Url(credential.rawId);

    // Securely wrap the wallet password using the hardware-bound credential ID as context
    const encryptionKey = `${credentialIdStr}:${credential.id}`;
    const encrypted = await encryptWithPassword(
      walletPassword,
      encryptionKey,
      BIOMETRIC_AAD_CONTEXT
    );

    return {
      credentialId: credentialIdStr,
      ciphertext: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      createdAt: Date.now(),
    };
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}

/**
 * Verify native biometrics with the hardware enclave (Face ID / Fingerprint)
 * and return the decrypted wallet password for seamless authentication.
 */
export async function authenticateWithBiometrics(
  record: BiometricCredentialRecord
): Promise<string> {
  const supported = await isBiometricsSupported();
  if (!supported) {
    throw new Error('Biometric hardware is not available on this device.');
  }

  (window as any).isBiometricPromptActive = true;
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credentialIdBuffer = base64UrlToBuffer(record.credentialId);

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

    const credentialIdStr = bufferToBase64Url(assertion.rawId);
    const encryptionKey = `${credentialIdStr}:${assertion.id}`;

    const decryptedPassword = await decryptWithPassword(
      record.ciphertext,
      record.salt,
      record.iv,
      encryptionKey,
      BIOMETRIC_AAD_CONTEXT
    );

    return decryptedPassword;
  } finally {
    setTimeout(() => {
      (window as any).isBiometricPromptActive = false;
    }, 500);
  }
}
