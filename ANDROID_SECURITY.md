# Android SQLite (Room) Security Audit & Confirmation

This document confirms the security architecture of the Kaspriv Wallet's Android persistent storage layer.

## 1. Data-At-Rest Protection Strategy

The application utilizes a **Multi-Layered Security Architecture** to protect user data stored in the local SQLite database (Room).

### A. Zero-Knowledge Sanitization
Before any wallet record is persisted to the SQLite `wallets` table, it undergoes a mandatory **Sanitization Pass** (`src/utils/storage.ts`):
- **Plaintext Deletion**: The `mnemonic` and `passphrase` fields are explicitly deleted from the JavaScript object before serialization.
- **Payload Verification**: Only the `encryptedMnemonic` and `encryptedPassphrase` (encrypted via Rust WASM) are allowed to reach the database.

### B. Consensus-Level Encryption
All sensitive cryptographic material is encrypted using **Authenticated Encryption with Associated Data (AEAD)**:
- **Cipher**: XChaCha20-Poly1305.
- **Engine**: Rusty Kaspa WASM core (authoritative).
- **Binding**: The encryption salt and IV are unique per-wallet and stored alongside the ciphertext.

### C. Hardware-Bound Master Secret (Biometrics)
When Biometric Unlock is enabled:
- The **Master Vault Key** is wrapped using a key bound to the device's **TEE (Trusted Execution Environment)** or **StrongBox (Hardware Security Module)**.
- The raw master key never touches persistent storage in plaintext.

## 2. SQLite (Room) Implementation Audit

### File Location & Sandbox
- **Database Name**: `kaspriv_wallet_room.db`
- **Location**: `/data/data/com.kaspriv.wallet/databases/`
- **Isolation**: Standard Android UID-based sandbox prevents other applications from reading or writing to the database file.

### Schema Security
The database schema consists of four tables:
1. `wallets`: Stores public metadata (name, address, balances) and **encrypted** secrets.
2. `settings`: Stores non-sensitive application preferences.
3. `utxos`: Stores local UTXO cache.
4. `transactions`: Stores local transaction history cache.

**Finding**: No plaintext private keys, seed phrases, or master passwords exist anywhere in the SQLite schema.

## 3. Vulnerability Mitigation Matrix

| Potential Threat | Mitigation | Effectiveness |
| :--- | :--- | :--- |
| **Root Access (File Extraction)** | Even if the `.db` file is extracted, the `wallets` table only contains encrypted blobs. Decryption requires the user's Master Password (KDF-protected) or the hardware-bound Biometric key. | **High** |
| **Malicious App (Sandbox Escape)** | Relies on Android OS isolation. Application-level encryption ensures that even a partial read yields no usable secrets. | **High** |
| **SQL Injection** | All queries use parameterized statements (`?` placeholders) via the `SupportSQLiteDatabase` interface in `SQLitePlugin.java`. | **Critical** |
| **Data Corruption** | Uses Jetpack Room with ACID-compliant transactions and atomic `INSERT OR REPLACE` operations. | **High** |

## 4. Confirmation of Security Posture

The Kaspriv Wallet's use of Android Room SQLite is **Confirmed Secure** based on the following:
1. **Authoritative Enclave**: Sensitive computation happens in Rust WASM, not JavaScript.
2. **Sanitized Persistence**: Plaintext secrets are purged before storage.
3. **Hardware Binding**: Master secrets are anchored to the physical silicon of the mobile device.

*Audited and confirmed by Kaspriv Security Engineering.*
