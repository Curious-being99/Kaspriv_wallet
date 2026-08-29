/**
 * Unified Authentication State Service
 * 
 * Bridges authentication between LockScreen, WalletContext, biometric native modules,
 * and the main application navigation viewport.
 * Guarantees atomic unlock transitions, suppresses race-condition re-locks during
 * native biometric prompt dialogs, and explicitly clears pending lock state flags.
 */

import { 
  encryptWithPassword, 
  decryptWithPassword, 
  buildAadContext, 
  AAD_CONTEXT,
  KDF_SPEC_VERSION 
} from '../utils/crypto';

export type AuthState = 'UNINITIALIZED' | 'LOCKED' | 'AUTHENTICATING' | 'UNLOCKED';

export interface AuthStatePayload {
  state: AuthState;
  method?: 'password' | 'biometrics' | 'none';
  timestamp: number;
  error?: string | null;
}

type AuthListener = (payload: AuthStatePayload) => void;

class UnifiedAuthService {
  private currentState: AuthState = 'LOCKED';
  private lastMethod: 'password' | 'biometrics' | 'none' = 'none';
  private listeners: Set<AuthListener> = new Set();
  private pendingLockFlags: Set<string> = new Set();
  private gracePeriodUntil: number = 0;
  public readonly cipherSpec = KDF_SPEC_VERSION;

  constructor() {
    // Initialized in locked state by default
    this.currentState = 'LOCKED';
  }

  /**
   * Encrypt payload using Rust WASM ChaCha20-Poly1305 / XChaCha20Poly1305
   * via background worker bridge if available, falling back to direct WebAssembly bridge.
   */
  public async encryptChaCha20(
    plaintext: string, 
    password: string, 
    context: string = AAD_CONTEXT
  ): Promise<{ ciphertext: string; salt: string; iv: string }> {
    return await encryptWithPassword(plaintext, password, context);
  }

  /**
   * Decrypt payload using Rust WASM ChaCha20-Poly1305 / XChaCha20Poly1305.
   */
  public async decryptChaCha20(
    ciphertextHex: string,
    saltHex: string,
    ivHex: string,
    password: string,
    context: string = AAD_CONTEXT
  ): Promise<string> {
    return await decryptWithPassword(ciphertextHex, saltHex, ivHex, password, context);
  }

  /**
   * Authenticate password by attempting ChaCha20-Poly1305 decryption against canary ciphertext
   */
  public async verifyCanaryChaCha20(
    canaryCiphertext: string,
    saltHex: string,
    ivHex: string,
    password: string,
    context: string = "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY"
  ): Promise<boolean> {
    try {
      const decrypted = await this.decryptChaCha20(canaryCiphertext, saltHex, ivHex, password, context);
      return decrypted === "kaspriv-canary";
    } catch {
      return false;
    }
  }

  /**
   * Check for Emergency Duress Password using ChaCha20-Poly1305 decryption
   */
  public async verifyDuressCanaryChaCha20(
    duressCiphertext: string,
    saltHex: string,
    ivHex: string,
    password: string
  ): Promise<boolean> {
    try {
      const decrypted = await this.decryptChaCha20(
        duressCiphertext,
        saltHex,
        ivHex,
        password,
        "KASPRIV-WALLET-v1|KASPA-MAINNET|DURESS"
      );
      return decrypted === "kaspriv-duress-canary";
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to authentication state transitions
   */
  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener({
      state: this.currentState,
      method: this.lastMethod,
      timestamp: Date.now()
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(error?: string | null) {
    const payload: AuthStatePayload = {
      state: this.currentState,
      method: this.lastMethod,
      timestamp: Date.now(),
      error
    };
    this.listeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[UnifiedAuthService] Listener error:', err);
      }
    });
  }

  public getState(): AuthState {
    return this.currentState;
  }

  public isLocked(): boolean {
    return this.currentState === 'LOCKED' || this.currentState === 'AUTHENTICATING';
  }

  public isUnlocked(): boolean {
    return this.currentState === 'UNLOCKED';
  }

  /**
   * Set a temporary grace period (in ms) during which background visibility/blur events
   * will NOT trigger auto-lock (critical for native Android biometric prompts)
   */
  public setGracePeriod(durationMs: number = 5000): void {
    this.gracePeriodUntil = Date.now() + durationMs;
  }

  public isGracePeriodActive(): boolean {
    return Date.now() < this.gracePeriodUntil;
  }

  /**
   * Signal that authentication (password or biometric) has begun
   */
  public beginAuthentication(method: 'password' | 'biometrics'): void {
    this.currentState = 'AUTHENTICATING';
    this.lastMethod = method;
    // Activate grace period for biometric dialogs
    if (method === 'biometrics') {
      this.setGracePeriod(10000);
    }
    this.emit();
  }

  /**
   * Atomically transition to UNLOCKED state and explicitly purge all lock flags
   */
  public completeUnlock(method: 'password' | 'biometrics' | 'none' = 'none'): void {
    this.currentState = 'UNLOCKED';
    this.lastMethod = method;
    this.clearPendingLockFlags();
    // Maintain a brief grace period to prevent immediate re-lock from visibility transitions
    this.setGracePeriod(3000);
    this.emit();
  }

  /**
   * Transition to LOCKED state, unless grace period is active
   */
  public lock(reason?: string, force: boolean = false): boolean {
    if (!force && this.isGracePeriodActive()) {
      console.log(`[UnifiedAuthService] Lock ignored due to active grace period (reason: ${reason})`);
      return false;
    }

    this.currentState = 'LOCKED';
    this.lastMethod = 'none';
    this.emit();
    return true;
  }

  /**
   * Register a pending lock flag
   */
  public addPendingLockFlag(flag: string): void {
    this.pendingLockFlags.add(flag);
  }

  /**
   * Explicitly purge all pending lock flags
   */
  public clearPendingLockFlags(): void {
    this.pendingLockFlags.clear();
  }

  /**
   * Check if any pending lock flags exist
   */
  public hasPendingLockFlags(): boolean {
    return this.pendingLockFlags.size > 0;
  }

  /**
   * Fail current authentication attempt and return to LOCKED
   */
  public failAuthentication(error: string): void {
    this.currentState = 'LOCKED';
    this.emit(error);
  }
}

export const unifiedAuthService = new UnifiedAuthService();
export default unifiedAuthService;
