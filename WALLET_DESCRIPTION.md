# Kaspriv Mobile Web Wallet

## Overview
The **Kaspriv Mobile Web Wallet** is a high-security, non-custodial, client-side web application designed to provide users with a seamless and fortress-hardened interface for managing Kaspa (KAS) assets and smart covenants. Built with modern web standards and WebAssembly, it ensures users maintain 100% control over their private keys with zero server reliance and strict in-memory execution.

## Key Features

* **100% Non-Custodial & Client-Side:** Private keys and seed phrases are generated and managed strictly inside your browser environment. Private data is never transmitted across network boundaries or stored unencrypted.
* **Military-Grade Encryption & Authentication:**
    * **Rusty Kaspa SDK Encryption:** Uses the official Rusty Kaspa SDK (`@kasdk/web`) for XChaCha20-Poly1305 encryption with AAD to protect wallet seeds and private keys, ensuring standardization with the core Kaspa protocol.
* **Isolated Signing Environment & Instant Memory Sanitization:**
    * **Isolated Signing (`IsolatedSigner`):** Key derivation and signature generation execute in isolated transient scopes.
    * **Cryptographic Wiping:** Secret buffers are explicitly zeroized using byte-overwriting (`wipe()`) in `finally` blocks.
* **Independent Transaction Intent Verification:**
    * Before deriving keys or signing, `verifyTransactionIntent` independently validates recipient address prefix/network match, positive output amounts, fee parameters, and input UTXO sufficiency.
* **Kaspa Protocol Integration & Tooling:** Kaspriv utilizes the official high-performance **Rusty Kaspa WASM SDK (`@kasdk/web`)** for Schnorr signing, HD key derivation (XPrv/XPub), BIP39 seed generation, and 2,048-round PBKDF2 derivation. All transaction, address, and fee logic are governed by the authoritative Rust core, ensuring 100% consensus parity and eliminating reliance on legacy JavaScript-bound derivation paths.
* **Modern Mobile-First UI:** Built with React 18, TypeScript, and Tailwind CSS, featuring an intuitive touch-friendly interface, real-time balance tracking, virtual keyboard option, covenant creator, and full dev console monitoring.

## Technical Stack
* **Frontend Framework:** React 18, TypeScript, Vite
* **Styling:** Tailwind CSS, Lucide React (Icons), Motion (Animations)
* **Cryptography:** Web Crypto API, `hash-wasm` (Argon2id), **Rusty Kaspa WASM SDK (`@kasdk/web`)**, `@noble/hashes`
* **Kaspa Core & Protocol:** Authoritative Rust/WASM signing and derivation engine, direct real Kaspa node REST/RPC integration.

