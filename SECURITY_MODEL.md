# Kaspriv Mobile Web Wallet Security Model & Security Audit

This document outlines the zero-trust security architecture, cryptographic primitives, isolated signing environment, IndexedDB storage safeguards, and data protection mechanisms implemented in the **Kaspriv Mobile Web Wallet**.

---

## Executive Summary & Security Assessment

> **Overall Architecture Assessment:**
> A zero-trust encrypted-at-rest mobile web wallet architecture with authenticated encryption, memory-hard password-based key derivation, context-bound ciphertext, ephemeral signing, transaction-intent validation, and untrusted persistent storage.

An internal security assessment confirms the following zero-trust constraints across the codebase:
- **Zero LocalStorage / SessionStorage Dependency**: Standard browser `localStorage` and `sessionStorage` are completely eliminated. All local application data resides strictly within IndexedDB (`idb`).
- **IndexedDB Zero-Trust Storage Guard**: The database persistence layer (`saveWalletToDB`) explicitly strips unencrypted `mnemonic` and `passphrase` credentials prior to saving any record to IndexedDB.
- **Isolated Memory Lifecycle**: Derived private-key material is kept within transient application execution scopes and is not intentionally retained in React state, global state, or persistent storage.
- **Best-Effort Memory Sanitization**: Application-managed sensitive byte buffers are explicitly overwritten with zeroes and WASM-side objects are released via `.free()` in `finally` blocks as a best-effort memory-sanitization measure.
- **Pre-Execution Intent Verification**: Transactions pass through independent intent validation before key decryption or derivation begins.

---

## 1. Cryptographic Primitives

### Key Derivation Function (KDF): Argon2id
The wallet uses **Argon2id** (via `hash-wasm`) to derive a secure cryptographic key from the user's master password. Argon2id is the RFC 9106 recommended memory-hard key derivation function, providing resistance against GPU/ASIC hardware brute-force attacks.

**Argon2id Parameters (`v1.0.0-argon2id-aes256gcm`):**
Argon2id parameters are selected based on measured derivation cost on supported devices and are versioned for future upgrades:
* **Iterations (Time Cost):** 6 passes
* **Memory Size:** 128 MiB (131,072 KiB)
* **Parallelism:** 1 lane/thread
* **Hash Length:** 32 bytes (yielding a 256-bit key for AES-256)
* **Salt:** Cryptographically secure 16-byte random salt (`window.crypto.getRandomValues`) generated per wallet.

### Symmetric Encryption: AES-256-GCM with AAD
All stored sensitive payload data (e.g. encrypted mnemonics) is protected using **AES-256 in Galois/Counter Mode (GCM)** via the native Web Crypto API (`window.crypto.subtle`).

* **Key Management:** Derived on-demand from the user's password via Argon2id. The master password itself is never saved or logged.
* **Nonce/IV Strategy:** Every AES-GCM encryption operation generates a fresh 96-bit (12-byte) cryptographically random IV; IV reuse under the same key is prohibited.
* **Context-Bound Authenticated Data (AAD):** AES-GCM provides authenticated encryption. Kaspriv binds ciphertext to context headers (e.g., `KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC`). Decryption fails if ciphertext, IV, or AAD headers are tampered with.
* **Password Authentication Model:** Authentication relies on AES-GCM decryption success/failure. The GCM authentication result effectively verifies whether the derived key/password is correct without storing a separate plaintext password verifier.

---

## 2. Zero-Trust Storage Model (IndexedDB)

### Single Persistence Engine: IndexedDB (`idb`)
* Standard web `localStorage` and `sessionStorage` are prohibited and absent from the codebase.
* All persistent wallet configurations, account metadata, and transaction histories reside in IndexedDB using the `idb` wrapper.

### Hardened Object Sanitization (`saveWalletToDB`)
To guarantee that plaintext secret seed phrases or passphrases can never leak into persistent client storage under any edge case:

```typescript
export async function saveWalletToDB(wallet: Wallet) {
  const db = await getDB();
  // Zero-Trust IDB Guard: Ensure plaintext seeds or passphrases are never written to IDB
  const sanitizedWallet = { ...wallet };
  delete sanitizedWallet.mnemonic;
  delete sanitizedWallet.passphrase;

  await db.put(WALLET_STORE, {
    ...sanitizedWallet,
    balanceSompi: wallet.balanceSompi.toString(),
  });
}
```

* **Hot Wallets**: Store only the AES-256-GCM ciphertext (`encryptedMnemonic`), salt, IV, and public address context.
* **Watch-Only Wallets**: Store only public addresses or extended public keys (`kpub`), with send/sign capabilities permanently disabled in both UI and core logic.

---

## 3. Isolated Signing & Transaction Intent Verification

### Ephemeral Execution Scope (`IsolatedSigner`)
To eliminate private key leaks across component render cycles or long-lived state variables:

1. **Transient Execution**: Key derivation, address re-generation, and Schnorr signing execute inside isolated helper routines (`IsolatedSigner.signTransactionIsolated` & `IsolatedSigner.signMessageIsolated`).
2. **Transient Scope Guard**: Derived private-key material is kept within transient application execution scopes and is not intentionally retained in React state, global state, or persistent storage.
3. **Strict Memory Sanitization & Wiping (`wipe()` and `.free()`)**:
   ```typescript
   function wipe(buffer: Uint8Array) {
     if (buffer) buffer.fill(0);
   }
   ```
   * **Byte Buffers & Wiping**: Application-managed sensitive byte buffers are explicitly overwritten with zeroes in `finally` blocks as a best-effort memory-sanitization measure. All components involved in transaction creation and signing actively scrub private buffers, leaving absolutely no plaintext hex residuals in storage or browser memory.
   * **WASM Objects**: For cryptographic operations using `kaspa-wasm`, explicit `PrivateKey` objects are created from byte buffers and released using `.free()` in `finally` blocks. This returns the native allocation to the WASM allocator; the application treats this as a best-effort release of the native representation.
   * **Zero Hex-Back Storage**: Plaintext private keys, derived hex values, or seed words are never stored back, cached in state, or logged. The context only yields final signature outputs, securely purging the underlying cryptographic parameters immediately after signing.

### Hardened Lock Wallet & Memory Purge Mechanism
The wallet-lock routine goes far beyond a superficial React state flag (`isLocked(true)`). To ensure that active credentials cannot linger in memory or be extracted via client inspection:

1. **Active Reference Nullification**: When the auto-lock triggers or the user manually locks the wallet, the active master password is fully purged (`setPasswordState(null)` and the underlying mutable reference `passwordRef.current` is cleared).
2. **Plaintext Credential Eviction**: All decrypted wallet states, seed phrases, and passphrases are evicted from the active state, forcing the application back to an encrypted-at-rest state.
3. **No React Memory Leaks**: Decrypted material is strictly localized to functional execution frames. The locking mechanism leaves zero persistent traces of raw keys, seeds, or active derivation passphrases in active variables, so the browser's garbage collector can reclaim the allocations immediately.

### Transaction Intent Verifier & Cryptographic Binding
Before password verification, seed decryption, or private key derivation occurs, transaction parameters pass through independent verification:

1. **Intent Generation & Independent Parsing**: The user's intended transaction parameters (network, recipient, amount, fee) are verified independently of the raw transaction construction layer.
2. **Cryptographic / Structural Linking**: The thing being displayed to the user and the thing being signed are cryptographically and structurally linked, preventing a malicious transaction-building layer from passing benign parameters while producing a different transaction.
3. **Verification Checklist**: Validates network prefix, input sums vs output + fee, change output validity, and exact transaction structure before any decryption or key derivation is invoked.

---

## 4. Environment, WASM, & Elliptic Dependency Security

* **WebAssembly Sandboxing**: High-performance cryptographic operations (Argon2id and Kaspa core transaction operations via `kaspa-wasm`) execute in WASM execution sandboxes.
* **Native Web Crypto**: AES-256-GCM encryption/decryption is performed by browser-native C++ implementations via `window.crypto.subtle`.
* **kaspa-wasm Postinstall Patch & Upstream Monitoring**:
  * **Patch Mechanism**: `package.json` includes a `postinstall` script (`sed -i ...`) that rewrites Node-centric `util` destructuring (`TextDecoder`, `TextEncoder`) in `node_modules/kaspa-wasm/kaspa_wasm.js` to use `globalThis.TextDecoder` and `globalThis.TextEncoder`.
  * **Fragility Note**: This string-substitution patch is inherently fragile—it depends on exact line patterns in `kaspa_wasm.js` and GNU `sed` CLI availability.
  * **Upstream Strategy**: Monitor `kaspa-wasm` upstream releases for native Web/ESM environment support, and verify postinstall execution integrity whenever updating `kaspa-wasm` or toolchain packages.
* **Elliptic / Supply-Chain Posture**:
  * Kaspriv does not use `elliptic` for transaction signing. Kaspa Schnorr signing is performed through the Kaspa WASM/Rust implementation. Therefore, the application's signing path does not depend on `elliptic`'s ECDSA implementation.
  * The transitive dependency should nevertheless be removed, upgraded, or isolated where practical to reduce supply-chain attack surface.

---

## 5. Web Application Hardening & Supply-Chain Security

For a mobile web wallet, JavaScript supply-chain integrity and runtime hardening are first-class security boundaries:
* **Strict Content Security Policy (CSP)**: Enforces a strict runtime policy directly in `index.html` allowing WebAssembly compilation (`'wasm-unsafe-eval'`), local assets (`'self'`), and strictly explicitly permitted Kaspa RPC nodes/APIs. Prevents inline script injection (`object-src 'none'`) and strictly eliminates external tracking or Google domains.
* **Minimal Third-Party JavaScript**: Keeps dependency footprint lean and audited.
* **Lockfile Integrity**: Cryptographic package lockfiles (`package-lock.json`) enforced across builds.
* **Automated Vulnerability Scanning**: Dependabot/Renovate-style dependency update monitoring.
* **Subresource Integrity (SRI)** & Trusted Types where practical.

---

## 6. Threat Model

### Protected (Assuming Wallet Application is Uncompromised)
* IndexedDB storage extraction (data is encrypted at rest with AES-256-GCM).
* Plaintext credential persistence.
* Ciphertext modification or context swapping (protected by AAD).
* Incorrect network context or malformed transaction parameters (caught by intent verifier).
* Accidental private-key retention in React state or global variables.
* Offline password guessing (resisted by Argon2id memory-hard hashing and random salts).

### Not Guaranteed (Out of Scope)
* Compromised operating system or rooted/fully compromised physical device.
* Malicious JavaScript executing directly in the trusted wallet origin.
* Compromised third-party dependencies or build pipeline.
* Stolen master password.
* Screen/input capture (keyloggers or malware on device).
* Malicious browser/runtime environment.
* Memory forensics performed against a compromised physical runtime or OS memory dump.

---

## Architectural Flow Summary

```
[ User Intent ]
       ↓
[ Independent Intent & Transaction Verification ] (Validates network, inputs, outputs, amounts, fee, change, structure)
       ↓
[ Password Input ]
       ↓
[ Argon2id KDF ] (Memory-hard derivation of 256-bit AES Key)
       ↓
[ AES-256-GCM + AAD Validation ] (Decrypt mnemonic inside isolated scope)
       ↓
[ Derive Signing Key & Kaspa Schnorr Signing ] (Executed via Kaspa WASM core)
       ↓
[ Signature Only Returned ]
       ↓
[ Zero Application Buffers & Release WASM Memory ] (Sensitive byte buffers overwritten with zeroes; WASM objects released via .free() in finally blocks)
       ↓
[ Broadcast ] (Submit signed transaction to Kaspa P2P Network)
```



