# Kaspriv Mobile Web Wallet

> **Architectural Summary:**
> A zero-trust encrypted-at-rest mobile/ web wallet architecture with authenticated encryption, memory-hard password-based key derivation, context-bound ciphertext, ephemeral signing, transaction-intent validation, and untrusted persistent storage.

---

## Overview

The **Kaspriv Mobile Web Wallet** is a high-security, non-custodial, client-side web application designed to provide users with a secure, responsive, and robust interface for managing Kaspa (KAS) assets. Kaspriv uses pure JavaScript and TypeScript cryptographic primitives (`@noble/secp256k1`, `@scure/bip32`, `@scure/bip39`, and `@noble/hashes`) for Schnorr signing, HD derivation, and Bech32 address calculation. Transaction, address, and fee logic follow Kaspa protocol rules directly with real node broadcast, guaranteeing absolute self-custody with zero server-side private key storage and strict in-memory execution boundaries.

---

## Core Security & Architecture

### 1. Zero-Trust Storage Model
* **No Plaintext Persistence:** Standard browser `localStorage` and `sessionStorage` are completely bypassed. All local state resides strictly in IndexedDB (`idb`) with cryptographic encryption at rest.
* **Storage Guard:** The database persistence layer automatically strips unencrypted mnemonics and passphrases prior to saving wallet records.

### 2. Memory-Hard Key Derivation (Argon2id)
* Uses **Argon2id** (via `hash-wasm`), the RFC 9106 recommended memory-hard key derivation function, providing robust resistance against GPU/ASIC hardware brute-force attacks.
* **Parameters (`v1.0.0-argon2id-aes256gcm`):** 6 iterations, 128 MiB memory cost (131,072 KiB), 1 parallelism thread, versioned for future upgrades.

### 3. Authenticated Encryption (AES-256-GCM + AAD)
* **Native Web Crypto:** Encrypts sensitive payloads using browser-native C++ implementations (`window.crypto.subtle`).
* **Fresh IVs:** Every encryption operation generates a fresh 96-bit cryptographically random IV; IV reuse under the same key is strictly prohibited.
* **Context-Bound Authenticated Data (AAD):** Ciphertexts are cryptographically bound to context headers (e.g., `KASPRIV-WALLET-v1|KASPA-MAINNET|MNEMONIC`), preventing ciphertext and context swapping attacks.

### 4. Ephemeral Signing & Memory Sanitization
* **Isolated Execution:** Key derivation, address re-generation, and Schnorr signing execute within isolated transient helper routines (`IsolatedSigner`).
* **Transient Scope Guard:** Derived private-key material exists solely within transient execution scopes and is not intentionally retained in React state, global state, or persistent storage.
* **Best-Effort Memory Sanitization**: Application-managed sensitive byte buffers are explicitly overwritten with zeroes (`wipe()`) in `finally` blocks.

### 5. Transaction-Intent Verification & Cryptographic Binding
Before password verification, seed decryption, or private key derivation occurs, transaction parameters pass through independent verification:
1. **Independent Intent Parsing:** User-intended parameters (network, recipient, amount, fee) are validated independently of raw transaction construction.
2. **Cryptographic & Structural Linking:** Ensures the transaction displayed to the user is cryptographically and structurally linked to the transaction being signed.
3. **Comprehensive Checklist:** Validates network prefix, input sufficiency (`sum(inputs) >= amount + fee`), change output validity, and exact transaction structure.

---

## Technical Architecture Flow

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
[ Derive Signing Key & Kaspa Schnorr Signing ] (Executed via @noble/secp256k1)
       ↓
[ Signature Only Returned ]
       ↓
[ Zero Application Buffers ] (Sensitive byte buffers overwritten with zeroes)
       ↓
[ Broadcast ] (Submit signed transaction to Kaspa P2P Network)
```

---

## Threat Model

### Protected (Assuming Wallet Application is Uncompromised)
* IndexedDB storage extraction (data encrypted at rest with AES-256-GCM).
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

## Technology Stack
* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
* **Animations:** Motion (`motion/react`)
* **Icons:** Lucide React
* **Cryptography & Signing:** Web Crypto API (`window.crypto.subtle`), `hash-wasm` (Argon2id), `@noble/secp256k1`, `@scure/bip32`, `@scure/bip39`, `@noble/hashes`
* **Kaspa Core & Protocol:** Pure JavaScript / TypeScript signing engine and Bech32 address encoder, `@kaspa/core-lib`, direct real Kaspa node REST/RPC integration. Transaction, address, and fee logic follow Kaspa protocol rules with high-performance client-side Schnorr signing.

---

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
