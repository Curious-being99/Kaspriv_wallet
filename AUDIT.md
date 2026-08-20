# KasPriv Wallet Security Audit Report

This document records the comprehensive security review, vulnerability assessment, and cryptographic hardening implemented in the **KasPriv Wallet** codebase. 

Special thanks and appreciation go to **[@KodinglsFun](https://x.com/KodinglsFun)** for their incredible code review, detailed vulnerability disclosure, and collaborative efforts to secure this wallet application.

---

## Executive Summary

- **Audit Period:** August 2026
- **Reviewer Credit:** [@KodinglsFun](https://x.com/KodinglsFun) (Code Reviewer)
- **Status:** **ALL FINDINGS RESOLVED & FULLY MITIGATED**
- **Core Focus:** Hardware enclave integrity, cryptographic boundaries, strict input parser sanitization, zero-tolerance monetary calculations, and deep-freeze in-memory mutation defense.

The audit successfully identified several subtle cryptographic and software design vectors. Over successive iterations, these vulnerabilities were completely neutralized. The application has been hardened into a zero-trust non-custodial environment.

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

---

## Cryptographic Security Verification

All mitigations have been merged into the main application branch and thoroughly tested.

| Module | Verification Target | Test Outcome |
| :--- | :--- | :--- |
| `src/utils/crypto.ts` | Strict Hex Decoder Validation | **PASS** (Odd-length & non-hex characters rejected) |
| `src/utils/kaspa/address.ts` | Canonical Bit-Alignment & Strict Colons | **PASS** (Zero padding checked; colons and prefixes validated) |
| `src/utils/kaspa/units.ts` | Monetary Decimal & BigInt Precision | **PASS** (Zero float rounding error leaks detected) |
| `src/utils/IsolatedSigner.ts` | Zero-Tolerance Transaction Verification | **PASS** (Fee mismatches and nested-intent mutations blocked) |
| `src/utils/biometrics.ts` | Secure StrongBox/Keystore Enforcement | **PASS** (Fallback pathways blocked and unauthenticated templates rejected) |
| `src/utils/kaspa/api.ts` | UTXO REST Payload Sanitization | **PASS** (Malformed structures discarded from network endpoints) |

---

## Acknowledgement & Community Impact

The security posture of **KasPriv Wallet** has been substantially elevated due to the diligence, expertise, and guidance of **[@KodinglsFun](https://x.com/KodinglsFun)**. 

Open-source peer review is the cornerstone of trust in decentralized finance. By identifying these nuanced security edges and collaborating on their resolutions, [@KodinglsFun](https://x.com/KodinglsFun) has directly contributed to the safety and long-term robustness of the entire KasPriv ecosystem.

**Thank you, [@KodinglsFun](https://x.com/KodinglsFun)!** 🚀
