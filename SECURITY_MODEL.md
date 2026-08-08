# Kaspriv Wallet Security Model

This document outlines the security architecture, cryptographic primitives, and data protection mechanisms implemented in the Kaspa Wallet.

## 1. Cryptographic Primitives

### Key Derivation Function (KDF): Argon2id
The wallet uses **Argon2id** (via `hash-wasm`) to derive a secure cryptographic key from the user's master password. Argon2id is the current industry standard and RFC 9106 recommendation for memory-hard key derivation, providing strong resistance against GPU and ASIC brute-force attacks.

**Argon2id Parameters (`v1.0.0-argon2id-aes256gcm`):**
*   **Iterations (Time Cost):** 4 passes
*   **Memory Size:** 64 MiB (65,536 KiB)
*   **Parallelism:** 1 lane/thread
*   **Hash Length:** 32 bytes (yielding a 256-bit key for AES)
*   **Salt:** A unique, cryptographically secure 16-byte random salt is generated for key derivation.

### Symmetric Encryption: AES-256-GCM
All sensitive data (e.g., mnemonic seed phrases) is encrypted using **AES-256 in Galois/Counter Mode (GCM)** via the native Web Crypto API (`window.crypto.subtle`).

*   **Key:** Derived from the user's password using the Argon2id parameters defined above. The password is *never* used directly as an encryption key.
*   **Nonce/IV:** A cryptographically secure, fresh 12-byte random Initialization Vector (IV) is generated for *every single encryption operation*. Nonces are never reused.
*   **Authentication:** AES-GCM provides authenticated encryption. The GCM authentication tag is automatically verified during decryption. If the ciphertext or IV has been tampered with, decryption fails securely, preventing chosen-ciphertext attacks.

## 2. Data Storage and Obfuscation

### Fragmented Mnemonic Storage
To mitigate the risk of data extraction from untrusted storage environments (like browser IndexedDB or LocalStorage), the wallet employs a fragmented storage mechanism for the seed phrase.

1.  **Splitting:** The 24-word mnemonic is split into three distinct fragments (parts).
2.  **Shuffling:** The fragments are cryptographically shuffled so their storage order does not match their logical order.
3.  **Unique Encryption:** While all fragments share the same Argon2id-derived master key, *each fragment is encrypted with its own unique 12-byte random IV*.
4.  **Verification:** Each fragment retains a cryptographic order index, ensuring the mnemonic can only be reconstructed if the decryption is fully authenticated and successful.

### Untrusted Storage Model
The wallet treats the underlying storage (IndexedDB) as entirely untrusted. Even if an attacker gains full read access to the local database file, they will only retrieve:
*   Hex-encoded AES-GCM ciphertext fragments
*   Random 16-byte Argon2id salts
*   Random 12-byte AES-GCM IVs

Without the user's master password, the memory-hard Argon2id derivation makes offline brute-forcing computationally prohibitive.

## 3. In-Memory Protection

### Zeroing Sensitive Buffers
While JavaScript's garbage collector makes absolute memory wiping challenging, the wallet implements best-effort memory sanitization.

*   **Cryptographic Wiping:** A custom `wipe()` function (`Uint8Array.fill(0)`) is invoked immediately after sensitive operations.
*   **Cleared Targets:** 
    *   Derived Argon2id key material (`keyBytes`)
    *   Plaintext mnemonic arrays (`plaintextBytes`)
    *   Decrypted data buffers (`decryptedArray`)
*   **Lifecycle:** These buffers are zeroed out synchronously before the function returns or the promise resolves, minimizing the window in which plaintext secrets reside in memory.

## 4. Execution Environment Security

*   **WebAssembly (WASM):** Heavy cryptographic operations (Argon2id hashing, Kaspa core operations via `kaspa-wasm`) run within WebAssembly sandboxes, reducing the risk of side-channel leaks typical of pure JavaScript implementations.
*   **Web Crypto API:** AES-GCM operations utilize the browser's native, highly optimized, and audited `crypto.subtle` API, ensuring that key material (once imported into the `CryptoKey` object) is managed securely by the browser engine and cannot be exported back to JavaScript.

## Summary

The wallet's security model assumes the host device may be compromised at the storage layer. By combining **Argon2id** (for robust key derivation), **AES-256-GCM** (for authenticated encryption), **fragmented and shuffled storage**, and **in-memory wiping**, the wallet ensures that the user's seed phrase remains secure at rest and is only briefly exposed in memory during active, authenticated use.
