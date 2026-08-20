# Kaspriv Mobile Web Wallet

## Overview
The **Kaspriv Mobile Web Wallet** is a high-security, non-custodial, client-side web application designed to provide users with a seamless and fortress-hardened interface for managing Kaspa (KAS) assets and smart covenants. Built with modern web standards and WebAssembly, it ensures users maintain 100% control over their private keys with zero server reliance and strict in-memory execution.

## Key Features

* **100% Non-Custodial & Client-Side:** Private keys and seed phrases are generated and managed strictly inside your browser environment. Private data is never transmitted across network boundaries or stored unencrypted.
* **Military-Grade Encryption & Authentication:**
    * **Argon2id Key Derivation:** Uses memory-hard Argon2id (64 MiB memory, 4 iterations, 1 parallel lane) via `hash-wasm` to derive strong AES keys from user passwords, rendering GPU/ASIC brute-force attacks computationally infeasible.
    * **AES-256-GCM with AAD:** All wallet seeds and private keys are encrypted using native Web Crypto API (`window.crypto.subtle`) AES-256-GCM with 12-byte single-use random IVs and Context-Bound Additional Authenticated Data (AAD) (`KASPRIV-WALLET-v1|...`).
* **Isolated Signing Environment & Instant Memory Sanitization:**
    * **Isolated Signing (`IsolatedSigner`):** Key derivation and signature generation execute in isolated transient scopes.
    * **Cryptographic Wiping:** Secret buffers are explicitly zeroized using byte-overwriting (`wipe()`) in `finally` blocks.
* **Independent Transaction Intent Verification:**
    * Before deriving keys or signing, `verifyTransactionIntent` independently validates recipient address prefix/network match, positive output amounts, fee parameters, and input UTXO sufficiency.
* **Kaspa Protocol Integration & Tooling:** Kaspriv depends on `kaspa-wasm` (and `@kaspa/core-lib`), patches it for the browser, and configures Vite for WASM. Transaction, address, and fee logic are written to follow Kaspa protocol rules, with `@noble` / `@scure` used for signing and HD derivation in the current runtime path.
* **Modern Mobile-First UI:** Built with React 18, TypeScript, and Tailwind CSS, featuring an intuitive touch-friendly interface, real-time balance tracking, virtual keyboard option, covenant creator, and full dev console monitoring.

## Technical Stack
* **Frontend Framework:** React 18, TypeScript, Vite
* **Styling:** Tailwind CSS, Lucide React (Icons), Motion (Animations)
* **Cryptography:** Web Crypto API (`window.crypto.subtle`), `hash-wasm` (Argon2id), `@noble/secp256k1`, `@scure/bip32`, `@scure/bip39`
* **Kaspa Core & Tooling:** Kaspriv depends on `kaspa-wasm` (and `@kaspa/core-lib`), patches it for the browser, and configures Vite for WASM. Transaction, address, and fee logic are written to follow Kaspa protocol rules, with `@noble` / `@scure` used for signing and HD derivation in the current runtime path.

