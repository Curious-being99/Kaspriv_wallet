# Kaspriv Mobile Web Wallet Security Model & Security Audit

This document outlines the zero-trust security architecture, cryptographic primitives, isolated signing environment, IndexedDB storage safeguards, and data protection mechanisms implemented in the **Kaspriv Mobile Web Wallet**.

---

## Executive Summary & Security Audit

An internal security audit confirms the following zero-trust constraints across the codebase:

- **Zero LocalStorage / SessionStorage Dependency**: Standard browser `localStorage` and `sessionStorage` are completely eliminated. All local application data resides strictly within IndexedDB (`idb`).
- **IndexedDB Zero-Trust Storage Guard**: The database persistence layer (`saveWalletToDB`) explicitly strips unencrypted `mnemonic` and `passphrase` credentials prior to saving any record to IndexedDB.
- **Isolated Memory Lifecycle**: Private keys and seed phrases are never stored in React state, component trees, or global context. Key derivation occurs on-demand inside transient execution scopes.
- **Explicit Memory Zeroization**: All sensitive byte arrays (`Uint8Array`) containing key material, seed phrases, or decrypted buffers are wiped using `.fill(0)` inside `finally` blocks immediately after signing operations.
- **Pre-Execution Intent Verification**: Transactions pass through independent intent validation before key decryption or derivation begins.

---

## 1. Cryptographic Primitives

### Key Derivation Function (KDF): Argon2id
The wallet uses **Argon2id** (via `hash-wasm`) to derive a secure cryptographic key from the user's master password. Argon2id is the RFC 9106 recommended memory-hard key derivation function, providing resistance against GPU/ASIC hardware brute-force attacks.

**Argon2id Parameters (`v1.0.0-argon2id-aes256gcm`):**
* **Iterations (Time Cost):** 4 passes
* **Memory Size:** 64 MiB (65,536 KiB)
* **Parallelism:** 1 lane/thread
* **Hash Length:** 32 bytes (yielding a 256-bit key for AES-256)
* **Salt:** Cryptographically secure 16-byte random salt (`window.crypto.getRandomValues`) generated per wallet.

### Symmetric Encryption: AES-256-GCM with AAD
All stored sensitive payload data (e.g. encrypted mnemonics) is protected using **AES-256 in Galois/Counter Mode (GCM)** via the native Web Crypto API (`window.crypto.subtle`).

* **Key Management:** Derived on-demand from the user's password via Argon2id. The master password itself is never saved or logged.
* **Nonce/IV:** A unique, fresh 12-byte random Initialization Vector (IV) is generated for every encryption call.
* **Context-Bound Authenticated Data (AAD):** AES-GCM provides authenticated encryption. Kaspriv binds ciphertext to context headers (e.g., `KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC`). Decryption fails if ciphertext, IV, or AAD headers are tampered with.

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
    balanceSompi: wallet.balanceSompi.toString(), // Convert BigInt to string for DB storage
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
2. **No Persistent Private Key State**: Derived private keys exist solely within function-scoped stack frames.
3. **Strict Memory Zeroization (`wipe()`)**:
   ```typescript
   function wipe(buffer: Uint8Array) {
     if (buffer) buffer.fill(0);
   }
   ```
   All key bytes, seed buffers, and decrypted byte arrays are zeroized in `finally` blocks immediately upon signature calculation or error thrown.

### Transaction Intent Verifier (`verifyTransactionIntent`)
Before password verification, seed decryption, or private key derivation occurs, transaction parameters pass through `verifyTransactionIntent`:

1. **Network Prefix Matching**: Validates target recipient address prefix (`kaspa:`, `kaspatest:`, `kaspadev:`) strictly matches active network context.
2. **Positive Value & Fee Sanity**: Ensures transfer amounts and fees are strictly positive (`> 0n` sompi).
3. **Input Set Sufficiency**: Verifies UTXO inputs are present and `sum(inputs) >= amount + fee`.
4. **Early Rejection**: Any violation aborts processing before sensitive decryption or key derivation is attempted.

---

## 4. Environment & WASM Security

* **WebAssembly Sandboxing**: High-performance cryptographic operations (Argon2id and Kaspa core transaction operations via `kaspa-wasm`) execute in WASM execution sandboxes.
* **Native Web Crypto**: AES-256-GCM encryption/decryption is performed by browser-native C++ implementations via `window.crypto.subtle`.

---

## Architectural Flow Summary

```
[ User Input ] -> [ Password Verification ] 
       |
[ Intent Verifier ] -> Check Network, Amount, Fee, UTXO Inputs
       |
[ Argon2id KDF ] -> Derive 256-bit AES Key from Password + Salt
       |
[ AES-256-GCM ] -> Decrypt Mnemonic Payload inside IsolatedSigner
       |
[ Schnorr Signer ] -> Generate Signature in WASM Scope
       |
[ Memory Wipe ] -> Explicitly zeroize (Uint8Array.fill(0)) key material in finally block
       |
[ Broadcast ] -> Submit signed transaction to Kaspa P2P Network
```


