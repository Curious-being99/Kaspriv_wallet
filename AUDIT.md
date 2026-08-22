# KasPriv Wallet Security Audit Report

This document records the comprehensive security review, vulnerability assessment, and cryptographic hardening implemented in the **KasPriv Wallet** codebase. 

Special thanks and appreciation go to **[@KodinglsFun](https://x.com/KodinglsFun)** for their incredible code review, detailed vulnerability disclosure, and collaborative efforts to secure this wallet application.

---

## Executive Summary

- **Audit Period:** August 2026
- **Reviewer Credit:** [@KodinglsFun](https://x.com/KodinglsFun) (Code Reviewer)
- **Status:** **ACTIVE SECURITY HARDENING & REVIEW IN PROGRESS**
- **Core Focus:** Hardware enclave integrity, cryptographic boundaries, strict input parser sanitization, zero-tolerance monetary calculations, deterministic change derivation, testnet isolation, and deep-freeze in-memory mutation defense.

The audit successfully identified key cryptographic and software design vectors. Over successive iterations, significant vulnerabilities have been neutralized, and rigorous protections have been integrated across transaction construction, key derivation, and state persistence. Additional hardening and test automation are tracked transparently in this report.

---

## Detailed Vulnerability Analysis & Mitigations

### 1. Insecure Biometric Fallback & Cleartext Key Storage
* **Severity:** **Critical**
* **Finding:** When hardware-bound key wrapping (Android Keystore / StrongBox) was unavailable on a device, the registration routine fell back to generating a local key pair and saving encryption material (`prfSalt` and raw fallback data) in plaintext locally. This created a potential offline recovery vector or unauthenticated credential access pathway if local storage was compromised.
* **Mitigation:**
  - **Removed Fallbacks:** Completely deleted the software-based registration fallback pathway from the native biometric flow.
  - **Enforce Hardware Enclave:** The biometric auth path now strictly requires hardware-backed `keystore:` credential IDs. If the Android Keystore/StrongBox is unavailable or rejects the request, registration aborts securely:
    ```typescript
    throw new Error('Biometric registration failed: Your device secure hardware enclave (Android Keystore / StrongBox) is not available or rejected the request.');
    ```
  - **Strict Validation:** Legacy `unlockKey` and software decryption parameters are blocked, forcing all biometric authorization through strict WebAuthn/Enclave verification.

---

### 2. Non-Canonical Bech32 Bit-Alignment (Bit-Level Security)
* **Severity:** **High**
* **Finding:** The 5-to-8 bit conversion loop (`convertBits`) used for Kaspa address payload decoding did not enforce Bech32 canonical bit-alignment rules. Under certain conditions, permissive handling of leftover trailing padding bits allowed invalid address variations or non-canonical addresses to decode without throwing errors.
* **Mitigation:**
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

### 3. Permissive Address Parsing & Network Prefix Bypass
* **Severity:** **High**
* **Finding:** The address validator allowed parsed addresses to omit prefixes or contain multiple colons, automatically appending prefixes or matching testnet prefixes on mainnet. This introduced risks of cross-network coin transfers or invalid address-to-script conversions.
* **Mitigation:**
  - **Single Colon Constraint:** Restructured `validateKaspaAddress` to enforce a strict exactly-one-colon rule, rejecting any address containing multiple colons or none:
    ```typescript
    const parts = trimmed.split(':');
    if (parts.length !== 2) {
      return { isValid: false, error: 'Address must contain exactly one colon' };
    }
    ```
  - **Strict Prefix Mapping:** The validator strictly maps the parsed Human-Readable Prefix (HRP) against the selected active network configuration (`kaspa` for mainnet, `kaspatest` for testnet-10/testnet-11, and `kaspadev` for devnet). Any mismatch fails immediately.

---

### 4. Zero-Trust Script Conversion (Pre-flight Failures)
* **Severity:** **Medium**
* **Finding:** The helper function `addressToScriptPublicKeyBytes()` historically extracted script bytes without first performing a full checksum and network validation, meaning invalid addresses could result in incorrect script generation.
* **Mitigation:**
  - **Mandatory Pre-flight validation:** Every address parsing sequence inside the script-generator is now preceded by a full, non-throwing validation assertion that raises an error upon validation failure:
    ```typescript
    const validation = validateKaspaAddress(trimmed, network);
    if (!validation.isValid) {
      throw new Error(`Invalid address or network mismatch: ${validation.error || 'validation failed'}`);
    }
    ```

---

### 5. Loose Change Discrepancy Limits in Signer
* **Severity:** **High**
* **Finding:** The isolated transaction signing routine allowed a loose fee discrepancy limit of up to `200,000` sompis. Under compromised scenario conditions, this allowed small amounts of user funds to be siphoned during transaction output adjustments.
* **Mitigation:**
  - **Zero-Sompi Tolerance:** Reduced the allowable fee mismatch limits to exactly `0` (zero) sompis. Change outputs and self-send combined destinations must calculate exactly down to the single sompi.
  - **Output Array Capping:** Transactions are strictly capped at 2 outputs maximum (the intended recipient and the local change address). Any extraneous unauthorized outputs trigger an immediate signing halt.

---

### 6. Mutability of Pre-Verification Transaction Intents
* **Severity:** **Medium-High**
* **Finding:** When a transaction was passed to the `signTransactionIsolated` signing routine, standard JavaScript objects were passed by reference. While a shallow `Object.freeze` was performed on the intent root, nested parameters like UTXO outpoints or amount strings remained mutable. This created a window for memory-resident malware or hostile web scripts to alter transaction outputs *after* intent validation but *before* signature generation.
* **Mitigation:**
  - **Deep Clone and Deep Freeze:** Implemented a recursive `deepCloneAndFreeze` helper utility to isolate signing data completely:
    ```typescript
    export function deepCloneAndFreeze<T>(obj: T): T {
      if (obj === null || typeof obj !== 'object') return obj;
      if (typeof obj === 'bigint') return obj;
      if (Array.isArray(obj)) {
        const copy = obj.map(item => deepCloneAndFreeze(item)) as any;
        return Object.freeze(copy) as any;
      }
      if (obj instanceof Uint8Array) {
        const copy = new Uint8Array(obj);
        return Object.freeze(copy) as any;
      }
      if (obj instanceof Date) {
        return Object.freeze(new Date(obj.getTime())) as any;
      }
      const copy = {} as any;
      for (const key of Object.keys(obj)) {
        copy[key] = deepCloneAndFreeze((obj as any)[key]);
      }
      return Object.freeze(copy);
    }
    ```
  - **Full Intent Locking:** Applied this deep lock globally inside the isolated signer before any transaction logic occurs.

---

### 7. Permissive Hexadecimal Decoders
* **Severity:** **Medium**
* **Finding:** Utility hex decoders (`hexToBytes`) in several places lacked standard sanity checks, parsing odd-length values or skipping non-hexadecimal characters silently. This could result in corrupted script hashes or incorrect cryptographic keys.
* **Mitigation:**
  - **Hardened Character Validation:** Hardened all hex conversion algorithms with a strict regex check (`/^[0-9a-fA-F]*$/`) and verified even-length constraints before parsing:
    ```typescript
    if (!/^[0-9a-fA-F]*$/.test(clean)) {
      throw new Error('Invalid hex string: contains non-hexadecimal characters');
    }
    if (clean.length % 2 !== 0) {
      throw new Error('Invalid hex string: must have an even length');
    }
    ```

---

### 8. Untrusted Node UTXO Payload Injection
* **Severity:** **High**
* **Finding:** UTXO arrays fetched from external public APIs were fed directly into transaction selection routines. A malicious, compromised, or spoofed API endpoint could inject modified data structures or incorrect amount formats to cause calculation mismatches in-app.
* **Mitigation:**
  - **Automated Schema Sanitization:** Created a strict `validateAndCleanUtxo` sanitizer utility in `src/utils/kaspa/api.ts` that enforces rigid data format types (such as exact 64-character hex TXID, integer indexes, string/numeric amounts matching `BigInt` formats, and pure-hex scriptPublicKeys).
  - **Safe Array Construction:** All raw REST payloads are processed through this validation mapping, safely filtering out and discarding any compromised or malformed data structures before they can reach the application's core logic.

### 8. Untrusted Node UTXO Payload Injection
* **Severity:** **High**
* **Finding:** UTXO arrays fetched from external public APIs were fed directly into transaction selection routines. A malicious, compromised, or spoofed API endpoint could inject modified data structures or incorrect amount formats to cause calculation mismatches in-app.
* **Mitigation:**
  - **Automated Schema Sanitization:** Created a strict `validateAndCleanUtxo` sanitizer utility in `src/utils/kaspa/api.ts` that enforces rigid data format types (such as exact 64-character hex TXID, integer indexes, string/numeric amounts matching `BigInt` formats, and pure-hex scriptPublicKeys).
  - **Safe Array Construction:** All raw REST payloads are processed through this validation mapping, safely filtering out and discarding any compromised or malformed data structures before they can reach the application's core logic.

---

### 9. Deterministic Change Address Derivation & Derivation Path Persistence
* **Severity:** **High**
* **Finding:** Change address generation previously cycled across a small modulo ring of 5 static indexes (`% 5`), lacked reliable derivation path persistence on newly generated addresses, and used a hardcoded `/1/0` fallback for pending change UTXOs. This presented a significant risk of address reuse, temporarily unspendable change outputs, and UTXO sync desynchronization.
* **Mitigation:**
  - **Sequential Fresh Change Derivation:** Shifted from static modulo indexing to incremental derivation (`m/44'/111111'/0'/1/{maxIdx + 1}`) ensuring fresh change addresses for every spend.
  - **Path Persistence:** Newly derived change addresses and their exact derivation paths are reliably persisted into the wallet's `addressPaths` and `discoveredAddresses` state upon generation.
  - **Dynamic Pending Change Pathing:** Pending change UTXOs dynamically inherit the exact derivation path of the generated change address, completely eliminating hardcoded `/1/0` fallback paths.

---

### 10. Multi-Network Address-to-Script Construction
* **Severity:** **Medium-High**
* **Finding:** Several internal address-to-script helper calls omitted the active network parameter and defaulted to mainnet prefix encoding, causing script generation failures or malformed transaction scripts on Testnet-10, Testnet-11, and Devnet.
* **Mitigation:**
  - **Network Propagation:** Passed the active `network` configuration across `buildKaspaTransaction`, `createSignedTransaction`, and `IsolatedSigner`'s `verifyBuiltTransaction` and `verifyFinalSignedTransaction`.
  - **Strict Multi-Network Script Public Keys:** Address-to-script conversions now consistently validate against the expected network prefix before generating output scripts.

---

### 11. Duplicate Input Outpoint Rejection & Exact Authorized Output Matching
* **Severity:** **High**
* **Finding:** Input outpoints were not strictly deduplicated during manual transaction construction, and output validation did not explicitly reject unexpected non-recipient/non-change outputs.
* **Mitigation:**
  - **Input Outpoint Deduplication:** Added strict set-based uniqueness validation for input outpoints (`${txid}:${index}`) during transaction construction and pre-broadcast verification.
  - **Strict Authorized Output Whitelisting:** Output arrays are strictly validated to ensure every output matches either the intended recipient or authorized change destination script, blocking unauthorized outputs or fee-siphoning scripts.

---

### 12. Floating-Point Monetary Inaccuracies & Encrypted Record Pre-Validation
* **Severity:** **Medium**
* **Finding:** `kasToSompi` previously performed `Math.round(kas * Number(SOMPI_PER_KAS))` on numeric inputs, exposing calculations to IEEE-754 precision errors. In addition, encrypted wallet records were fed directly to Argon2id without upfront format and length validation.
* **Mitigation:**
  - **Zero Floating-Point Conversion:** Replaced all float math with string-based decimal splitting and exact `BigInt` scaling.
  - **Pre-Argon2 Validation:** Added `validateEncryptedRecord` in `src/utils/crypto.ts` to validate ciphertext formats, salt/IV lengths, and boundaries prior to executing memory-hard key derivation.

---

### 13. Official Rusty Kaspa WASM SDK Migration
* **Severity:** **Architectural Improvement (Security/Robustness)**
* **Finding:** Transaction serialization, signing, and byte-handling were previously managed by custom manual JavaScript implementations, which, while hardened, lacked the authoritative consensus serialization logic found in the official Kaspa Rust codebase.
* **Mitigation:**
  - **Adopted Official SDK:** Integrated the official `@kasdk/web` (Rusty Kaspa) WASM SDK for transaction building and signing.
  - **Shadow Migration Strategy:** Implemented a parallel "shadow" signing engine in `src/utils/kaspa/tx.ts`. All transaction signing requests now attempt to use the official Rust engine as the primary path, providing superior serialization integrity.
  - **Robust Fail-Safe:** Retained the previous, rigorously hardened JavaScript signing engine as an immutable emergency fallback. If the WASM runtime fails to initialize or sign, the engine silently falls back to the manual signer, ensuring funds remain accessible.
  - **Build Integrity:** Configured the production build pipeline to correctly bundle the 11.5MB WASM binary, optimizing it for both web and APK deployment without introducing performance bottlenecks.

---

### 14. Proprietary Rust Native Security Core (`kaspriv_rust_crypto`)
* **Severity:** **Security Foundation (Proprietary Boundary)**
* **Finding:** The application relies on a custom Rust-based cryptographic module (`kaspriv_rust_crypto`) for sensitive operations. While robust, its distinct role as the primary vault for encryption, biometric binding, and memory management was not explicitly cataloged in the hardening audit.
* **Mitigation:**
  - **Vault Integrity:** Confirmed that all high-performance encryption/decryption of wallet credentials and private keys is handled within this native layer, keeping sensitive material outside the JavaScript runtime where possible.
  - **Memory Zeroization Audit:** Verified the `secure_wipe_rust` interface, ensuring that sensitive memory buffers are zeroized with atomic operations immediately after key material extraction or decryption cycles.
  - **Biometric Binding:** Audited the implementation of biometric authentication, ensuring that the native layer correctly interfaces with Android hardware-backed Keystore/StrongBox to prevent credential recovery without hardware enclave verification.
  - **Boundary Enforcement:** Defined strict FFI boundaries between the Web/WASM runtime and the Native core to prevent leakage of unencrypted secrets into the higher-level application state.

---


| Module | Hardening Target | Status | Notes |
| :--- | :--- | :--- | :--- |
| `src/utils/crypto.ts` | Strict Hex & Record Format Validation | **ACTIVE / MITIGATED** | Odd-length/non-hex rejected; pre-Argon2 sanity validation active |
| `src/utils/kaspa/address.ts` | Canonical Bit-Alignment & Strict Colons | **ACTIVE / MITIGATED** | Zero padding verified; network prefixes strictly validated |
| `src/utils/kaspa/units.ts` | Zero-Float String Decimal & BigInt Precision | **ACTIVE / MITIGATED** | Direct string splitting; no IEEE-754 rounding operations |
| `src/utils/IsolatedSigner.ts` | Zero-Tolerance Intent & Output Verification | **ACTIVE / MITIGATED** | Network-aware scripts, duplicate input rejection, deep freeze |
| `src/utils/kaspa/tx.ts` | Multi-Network Script Construction & Parsing | **ACTIVE / MITIGATED** | Byte-level hex parsing; network propagated to all script builders |
| `src/context/WalletContext.tsx` | Sequential Change Derivation & Path Binding | **ACTIVE / MITIGATED** | Sequential change indexes; exact derivation paths bound to pending UTXOs |
| `src/utils/biometrics.ts` | Secure StrongBox/Keystore Enforcement | **ACTIVE / MITIGATED** | Software fallback removed; hardware enclave required |
| `src/utils/kaspa/api.ts` | UTXO REST Payload Sanitization | **ACTIVE / MITIGATED** | Strict schema validation before passing into selection |

---

## Technical Honesty Notes & Implementation Disclosures

1. **Kaspa Authoritative SDK Migration:**
   - While manual transaction construction, sighash calculation, and verification have been rigorously hardened with strict validation, we recognize the long-term benefits of standardizing consensus-sensitive logic with the authoritative Kaspa SDK. Migration and integration of official SDK components remains an active architectural priority.

2. **Automated Security & Fuzzing Test Suite:**
   - Development of an expanded automated property-based, fuzzing, and security regression test suite is ongoing to continuously assert parser invariants, address boundaries, and sighash consistency across versions.

3. **Native Android vs. Web Biometrics:**
   - The "no fallback" biometric enforcement strictly requires Android Keystore / StrongBox hardware backing for native builds. On web builds, WebAuthn PRF and user presence assertions are leveraged.

4. **Hardware Key Wrapping Enclave Realities:**
   - Hardware key wrapping is bound by the native mobile hardware security module (StrongBox/TEE). Software helpers provide authenticated context binding with Argon2id and AES-GCM.

---

## Acknowledgement & Community Impact

The security posture of **KasPriv Wallet** has been substantially elevated due to the diligence, expertise, and guidance of **[@KodinglsFun](https://x.com/KodinglsFun)**. 

Open-source peer review is the cornerstone of trust in decentralized finance. By identifying these nuanced security edges and collaborating on their resolutions, [@KodinglsFun](https://x.com/KodinglsFun) has directly contributed to the safety and long-term robustness of the entire KasPriv ecosystem.

**Thank you, [@KodinglsFun](https://x.com/KodinglsFun)!** 🚀
