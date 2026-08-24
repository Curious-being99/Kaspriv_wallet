# KasPriv Wallet Security Audit Report

This document records the comprehensive security review, vulnerability assessment, cryptographic hardening, and audit resolutions implemented in the **KasPriv Wallet** codebase. 

Special thanks and appreciation go to **[@KodinglsFun](https://x.com/KodinglsFun)** for their rigorous code review, detailed vulnerability disclosures, and collaborative efforts to secure this wallet application.

---

## Executive Summary

- **Audit Period:** August 2026
- **Reviewer Credit:** [@KodinglsFun](https://x.com/KodinglsFun) (Code Reviewer)
- **Status:** **ALL AUDIT FINDINGS RESOLVED & HARDENED**
- **Core Focus:** Hardware enclave integrity, cryptographic boundaries, authoritative consensus WASM migration, zero-tolerance monetary precision, fail-closed release signing, testnet-11 parity, and deep immutability guarantees.

The security audit identified crucial cryptographic, platform, and software design vectors. Through methodical refactoring and rigorous hardening, all identified vulnerabilities, edge cases, and fallback risks have been completely neutralized. All manual JavaScript transaction serialization, sighash, and mass calculation paths have been purged in favor of the authoritative Rusty Kaspa WASM SDK.

---

## Detailed Vulnerability Analysis & Resolutions

### 1. Insecure Biometric Fallback & HardwareVault Hardening
* **Severity:** **Critical**
* **Finding:** 
  1. Software-based fallback pathways previously generated software key pairs when hardware enclaves were unavailable, persisting fallback encryption artifacts locally.
  2. In Android native builds, `KeyProperties.AUTH_BIOMETRIC_WEAK` was improperly referenced, `wrapSecret()` called cipher operations without an explicit `BiometricPrompt.CryptoObject`, and fallback encryption used random secrets unavailable during unlock.
* **Resolution:**
  - **Purged Software Fallbacks:** Completely removed software key generation and unauthenticated local fallbacks.
  - **Strict Biometric Strong Enforcement:** `HardwareVaultPlugin.java` strictly enforces `BiometricManager.Authenticators.BIOMETRIC_STRONG` and `KeyProperties.AUTH_BIOMETRIC_STRONG`. All occurrences of `BIOMETRIC_WEAK` have been removed.
  - **Mandatory CryptoObject Binding:** Both `wrapSecret()` and `unwrapSecret()` bind directly to `new BiometricPrompt.CryptoObject(cipher)`. Keys configured with `setUserAuthenticationRequired(true)` cannot be used without genuine hardware biometric authentication.
  - **GCM Hardware Enclave:** Enforces `KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT` with `KeyProperties.BLOCK_MODE_GCM` and `KeyProperties.ENCRYPTION_PADDING_NONE`.

---

### 2. Authoritative WASM-Only Signer & Transaction Builder
* **Severity:** **Critical**
* **Finding:** The production signer historically used a custom manual JavaScript transaction serialization, sighash calculation, and Schnorr signing path (`buildKaspaTransaction`, `signTransactionWithPrivateKeyBytes`, and `createSignedTransactionFallback`). This introduced risks of consensus divergences, mass calculation mismatches, or serialization discrepancies against Rusty Kaspa nodes.
* **Resolution:**
  - **Purged Legacy JS Signer:** Completely removed `buildKaspaTransaction`, `signTransactionWithPrivateKeyBytes`, and `createSignedTransactionFallback` from `src/utils/kaspa/tx.ts`.
  - **Authoritative WASM Execution:** All transaction construction, script signing, sighash computation, and mass estimation now execute exclusively through the official `@kasdk/web` Rusty Kaspa WASM module (`createSignedTransactionWasm` / `createSignedTransactionIsolatedWasm`).
  - **Zero Fallback Bypass:** If WASM transaction building or signing fails, the operation immediately halts and throws an explicit error, preventing any silent fallback to unvetted logic.

---

### 3. Non-Canonical Bech32 Bit-Alignment (Bit-Level Security)
* **Severity:** **High**
* **Finding:** The 5-to-8 bit conversion loop (`convertBits`) used for Kaspa address payload decoding did not enforce Bech32 canonical bit-alignment rules. Permissive handling of leftover trailing padding bits allowed invalid address variations or non-canonical addresses to decode without throwing errors.
* **Resolution:**
  - **Zero-Leftover Check:** Implemented strict check boundaries requiring that when padding is disabled (`pad = false`), any excess alignment bits must be strictly less than the source bit width (`5`), and any trailing alignment bits must be strictly zero:
    ```typescript
    } else {
      // Bech32 canonical bit alignment rules
      if (bits >= from) {
        throw new Error('Invalid padding in convertBits: excess alignment bits');
      }
      if ((acc & ((1 << bits) - 1)) !== 0) {
        throw new Error('Non-zero padding bits in convertBits: non-canonical address encoding');
      }
    }
    ```

---

### 4. Permissive Address Parsing & Network Prefix Bypass
* **Severity:** **High**
* **Finding:** The address validator allowed parsed addresses to omit prefixes, contain multiple colons, or accept raw script hex bypasses inside `addressToScriptPublicKeyBytes()`.
* **Resolution:**
  - **Single Colon Constraint:** Restructured `validateKaspaAddress` to enforce a strict exactly-one-colon rule, rejecting any address containing multiple colons or none:
    ```typescript
    const parts = trimmed.split(':');
    if (parts.length !== 2) {
      return { isValid: false, error: 'Address must contain exactly one colon' };
    }
    ```
  - **Strict Prefix Mapping:** The validator strictly maps the parsed Human-Readable Prefix (HRP) against the active network configuration (`kaspa` for mainnet, `kaspatest` for testnet-10/testnet-11, and `kaspadev` for devnet).
  - **Raw-Script Bypass Eliminated:** `addressToScriptPublicKeyBytes()` strictly rejects raw hex strings and mandates valid Bech32 address validation matching the active network.

---

### 5. Authoritative Local TXID Validation on Broadcast
* **Severity:** **High**
* **Finding:** Broadcast routines previously trusted the transaction ID returned by external nodes, and the "already accepted in mempool" scenario returned `"unknown"`, which was then propagated into local wallet state.
* **Resolution:**
  - **Local WASM TXID Computation:** In `kaspaBroadcastService.ts`, the cryptographic transaction ID is derived locally prior to broadcast using `computeTxIdWasm(rawTx)`.
  - **Authoritative Enforcement:** Node responses are validated against the locally computed TXID. If a node returns an inconsistent TXID or `"unknown"`, the authoritative local WASM TXID is enforced, guaranteeing state consistency.

---

### 6. Fail-Closed Release Signatures
* **Severity:** **High**
* **Finding:** Android release builds historically fell back to a debug keystore when production signing secrets were unavailable, creating a risk where CI workflows could publish a debug-signed build as an official release.
* **Resolution:**
  - **Gradle Fail-Closed:** `android/app/build.gradle` explicitly throws a `GradleException` if production keystore files, passwords, or aliases are missing during a release build.
  - **CI Workflow Enforcement:** `.github/workflows/build-apk.yml` asserts the presence of release credentials and fails immediately (`exit 1`) if missing, completely preventing fallback to debug signing.

---

### 7. Strict Seed Encryption & No Silent Downgrade
* **Severity:** **High**
* **Finding:** Vault encryption previously contained a fallback to Web Crypto (PBKDF2-SHA256 / AES-GCM) if the WASM path failed, and AAD context was not consistently enforced across all encryption attempts.
* **Resolution:**
  - **No Downgrade Policy:** `encryptWithPassword` in `src/utils/crypto.ts` requires the Rusty Kaspa WASM XChaCha20-Poly1305 engine. If WASM encryption fails, it throws a non-recoverable error and halts execution.
  - **Strict AAD Binding:** Encryption is bound with Associated Authenticated Data (AAD) to ensure ciphertext integrity and prevent cross-wallet tampering.

---

### 8. Strict KAS Decimal Precision Enforcement
* **Severity:** **Medium-High**
* **Finding:** `kasToSompi` in `units.ts` previously rounded or truncated fractional inputs, allowing numbers with more than 8 decimal places (sub-sompi) to be silently accepted with lost precision.
* **Resolution:**
  - **Zero Sub-Sompi Acceptance:** `kasToSompi` inspects the fractional string component and throws an explicit error (`"Kaspa amounts cannot exceed 8 decimal places (sompi precision limit)"`) if any non-zero digit exists beyond 8 decimal places.
  - **Exact String/BigInt Math:** All conversions operate strictly via string parsing and `BigInt` scaling without floating-point arithmetic.

---

### 9. Consistent Multi-Network & Testnet-11 Support
* **Severity:** **Medium**
* **Finding:** `testnet-11` was defined in `NetworkType`, but isolated signer intent verification and certain address prefix paths mapped it inconsistently or rejected it.
* **Resolution:**
  - **Full Network Parity:** Added explicit `testnet-11` handling across `NetworkType`, address validation (`kaspatest:`), signer intent verification in `IsolatedSigner.ts`, and node RPC routing.

---

### 10. Deep Immutability & TypedArray Isolation
* **Severity:** **Medium-High**
* **Finding:** In-memory signing objects were protected by shallow freezes, and TypedArrays (`Uint8Array`) passed into `deepCloneAndFreeze` retained references to their underlying mutable `ArrayBuffer`.
* **Resolution:**
  - **ArrayBufferView Deep Cloning:** `deepCloneAndFreeze` explicitly detects `ArrayBuffer.isView(obj)`, instantiates a fresh TypedArray copy, copies the buffer bytes, and freezes the copy:
    ```typescript
    if (ArrayBuffer.isView(obj)) {
      const view = obj as unknown as Uint8Array;
      const copy = new (obj.constructor as any)(view.length);
      copy.set(view);
      return Object.freeze(copy) as any;
    }
    ```
  - **Intent Freezing:** The isolated signer deep-freezes all input intents before processing.

---

### 11. Deterministic Change Address Derivation & Derivation Path Binding
* **Severity:** **High**
* **Finding:** Change address generation previously cycled across a small modulo ring of 5 static indexes (`% 5`), lacked reliable derivation path persistence on newly generated addresses, and used a hardcoded `/1/0` fallback for pending change UTXOs.
* **Resolution:**
  - **Sequential Fresh Change Derivation:** Shifted to incremental derivation (`m/44'/111111'/0'/1/{maxIdx + 1}`) ensuring fresh change addresses for every spend.
  - **Path Persistence:** Newly derived change addresses and their exact derivation paths are reliably persisted into `addressPaths` and `discoveredAddresses`.
  - **Dynamic Pending Change Pathing:** Pending change UTXOs dynamically inherit the exact derivation path of the generated change address, eliminating hardcoded fallback paths.

---

### 12. Automated Security Regression Suite
* **Severity:** **Assurance & Quality**
* **Finding:** Lack of automated security assertions for parser invariants, sub-sompi precision, and intent boundaries.
* **Resolution:**
  - **Automated Regression Suite (`src/utils/securityTest.ts`):** Implemented automated tests covering:
    - Intent verification rejecting invalid address formats and networks.
    - Testnet-11 intent verification.
    - Sub-sompi decimal rejection (>8 decimal places).
    - Address parser raw-script bypass rejection.
    - TypedArray deep-freeze immutability.
    - Client-side transaction structural validation (negative amounts, empty inputs).
    - Local 64-character hex WASM TXID generation.

---

### 13. High-Performance WASM-Only Mnemonic & Seed Derivation
* **Severity:** **High**
* **Finding:** Mnemonic generation and PBKDF2-HMAC-SHA512 seed derivation (2,048 rounds) were handled in JavaScript via `@scure/bip39`. This was significantly slower than native execution and introduced a non-authoritative JavaScript dependency into the core derivation path.
* **Resolution:**
  - **Purged Legacy JS Derivation:** Completely removed `@scure/bip39`, `@scure/bip32`, and `@scure/base`.
  - **Authoritative WASM Mnemonic Core:** Migrated all mnemonic generation, seed derivation, and HD path derivation (XPrv/XPub) to the official `@kasdk/web` Rusty Kaspa WASM core.
  - **Single-Derivation Cache:** Implemented a thread-safe `lastSeedHex` cache to ensure the 2,048-round PBKDF2 derivation only occurs once per session/mnemonic, providing near-instant address derivation for subsequent calls.

---

## Security Hardening Matrix

| Module | Hardening Target | Status | Verification & Resolution Notes |
| :--- | :--- | :--- | :--- |
| `src/utils/kaspa/tx.ts` | Authoritative WASM-Only Signer | **RESOLVED** | Legacy JS serialization, sighash, and fallback paths completely purged. |
| `android/.../HardwareVaultPlugin.java` | Biometric Strong & CryptoObject Binding | **RESOLVED** | `BIOMETRIC_STRONG` strictly enforced; `CryptoObject` bound to `wrapSecret` & `unwrapSecret`. |
| `src/services/kaspaBroadcastService.ts` | Authoritative Local TXID Calculation | **RESOLVED** | `computeTxIdWasm` computes TXID locally; node responses verified against local hash. |
| `android/app/build.gradle` | Fail-Closed Release Signatures | **RESOLVED** | Throws `GradleException` on missing release keystore; no debug fallback. |
| `.github/workflows/build-apk.yml` | CI Release Signing Enforcement | **RESOLVED** | Fails closed (`exit 1`) if production signing credentials are absent. |
| `src/utils/crypto.ts` | Strict Seed Encryption & No Downgrade | **RESOLVED** | WASM XChaCha20-Poly1305 required; fails closed on error; no Web Crypto fallback. |
| `src/utils/kaspa/units.ts` | Strict KAS Decimal Precision | **RESOLVED** | Rejects >8 decimal places with explicit error; zero IEEE-754 floating-point math. |
| `src/utils/kaspa/address.ts` | Canonical Bech32 & Script Sanitization | **RESOLVED** | Canonical bit alignment, exactly-one-colon rule, raw-script bypass rejected. |
| `src/utils/IsolatedSigner.ts` | Zero-Tolerance Intent & Deep Freeze | **RESOLVED** | Testnet-11 support, TypedArray buffer isolation, zero fee discrepancy tolerance. |
| `src/context/WalletContext.tsx` | Sequential Change Derivation & Path Binding | **RESOLVED** | Fresh sequential change derivation; dynamic derivation paths bound to pending UTXOs. |
| `src/utils/kaspa/api.ts` | UTXO REST Payload Sanitization | **RESOLVED** | Strict schema validation before passing into selection routines. |
| `src/utils/securityTest.ts` | Automated Security Regression Suite | **RESOLVED** | Automated tests for intent verification, precision limits, raw-script rejection, and WASM TXID. |

---

## Acknowledgement & Community Impact

The security posture of **KasPriv Wallet** has been substantially elevated due to the diligence, expertise, and guidance of **[@KodinglsFun](https://x.com/KodinglsFun)**. 

Open-source peer review is the cornerstone of trust in decentralized finance. By identifying these nuanced security edges and collaborating on their resolutions, [@KodinglsFun](https://x.com/KodinglsFun) has directly contributed to the safety, robustness, and cryptographic integrity of the entire KasPriv ecosystem.

**Thank you, [@KodinglsFun](https://x.com/KodinglsFun)!** 🚀
