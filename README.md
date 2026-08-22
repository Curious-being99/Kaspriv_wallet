# Kaspriv Mobile Web Wallet

> **Architectural Summary:**
> A zero-trust encrypted-at-rest mobile/ web wallet architecture with authenticated encryption, memory-hard password-based key derivation, context-bound ciphertext, ephemeral signing, transaction-intent validation, and untrusted persistent storage.

---

## Overview

The **Kaspriv Mobile Web Wallet** is a high-security, non-custodial, client-side application designed to provide users with a robust interface for managing Kaspa (KAS) assets. Kaspriv utilizes the official Rusty Kaspa SDK for standardized, high-performance cryptographic encryption and decryption, alongside industry-standard primitives for Schnorr signing, HD derivation, and Bech32 address calculation. Transaction, address, and fee logic strictly follow Kaspa protocol rules, guaranteeing absolute self-custody with zero server-side private key storage and strict in-memory execution boundaries.

---

## Core Security & Architecture

### 1. Zero-Trust Storage Model
* **No Plaintext Persistence:** Standard browser `localStorage` and `sessionStorage` are completely bypassed. All local state resides strictly in IndexedDB (`idb`) with cryptographic encryption at rest.
* **Storage Guard:** The database persistence layer automatically strips unencrypted mnemonics and passphrases prior to saving wallet records.

### 2. Standardized Cryptographic Encryption (Rusty Kaspa SDK)
The wallet leverages the official **Rusty Kaspa SDK (`@kasdk/web`)** for all password-based encryption and decryption tasks, aligning with the core Kaspa protocol implementation.

* **Symmetric Encryption: XChaCha20-Poly1305 with AAD**
  All stored sensitive payload data (e.g., encrypted mnemonics) is protected using **XChaCha20-Poly1305**, providing high-performance, community-vetted authenticated encryption.

* **Password Authentication & Context Binding:**
  * **Key Derivation:** Password-based key derivation is managed internally by the SDK. The master password itself is never saved or logged.
  * **Context-Bound Authenticated Data (AAD):** Ciphertexts are cryptographically bound to context headers (e.g., `KASPRIV_ENCRYPTION_V1`), preventing ciphertext and context swapping attacks.
  * **Authentication Model:** Password authentication relies on the success/failure of the SDK's `decryptXChaCha20Poly1305` function.

### 3. Ephemeral Signing & Memory Sanitization
* **Isolated Execution:** Key derivation, address re-generation, and Schnorr signing execute within isolated transient helper routines (`IsolatedSigner`).
* **Transient Scope Guard:** Derived private-key material exists solely within transient execution scopes and is not intentionally retained in React state, global state, or persistent storage.
* **Best-Effort Memory Sanitization**: Application-managed sensitive byte buffers are explicitly overwritten with zeroes (`wipe()`) in `finally` blocks.

### 4. Transaction-Intent Verification & Cryptographic Binding
Before password verification, seed decryption, or private key derivation occurs, transaction parameters pass through independent verification:
1. **Independent Intent Parsing:** User-intended parameters (network, recipient, amount, fee) are validated independently of raw transaction construction.
2. **Cryptographic & Structural Linking:** Ensures the transaction displayed to the user is cryptographically and structurally linked to the transaction being signed.
3. **Comprehensive Checklist:** Validates network prefix, input sufficiency, change output validity, and exact transaction structure.

---

## Technical Architecture Flow

```
[ User Intent ]
       ↓
[ Independent Intent & Transaction Verification ]
       ↓
[ Password Input ]
       ↓
[ Official Rusty Kaspa SDK (XChaCha20-Poly1305 + AAD) ]
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
* IndexedDB storage extraction (data encrypted at rest with XChaCha20-Poly1305).
* Plaintext credential persistence.
* Ciphertext modification or context swapping (protected by AAD).
* Incorrect network context or malformed transaction parameters (caught by intent verifier).
* Accidental private-key retention in React state or global variables.
* Offline password guessing (resisted by memory-hard key derivation implemented within the Rusty Kaspa SDK).

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
* **Cryptography & Signing:** Rusty Kaspa SDK (`@kasdk/web`), `@noble/secp256k1`, `@scure/bip32`, `@scure/bip39`, `@noble/hashes`
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
