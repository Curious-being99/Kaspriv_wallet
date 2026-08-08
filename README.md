# Kaspriv Secure mobile web wallet

## Overview
The Kaspriv Secure mobile web wallet is a non-custodial, client-side web application designed to provide users with a seamless and highly secure interface for managing their Kaspa (KAS) assets. Built with modern web technologies, it ensures that users maintain complete control over their private keys and funds while interacting directly with the Kaspa blockDAG network.

## Key Features

*   **100% Non-Custodial:** Your keys, your crypto. The wallet generates and manages your 24-word seed phrase entirely locally on your device. Private keys and seed phrases never leave your browser and are never transmitted to any external server.
*   **Military-Grade Security:**
    *   **Argon2id Key Derivation:** Utilizes a memory-hard function (64 MiB memory, 4 iterations, 1 parallel lane) selected with reference to RFC 9106 and constrained for the target Android environment to derive encryption keys from your password, making brute-force attacks computationally prohibitive.
    *   **AES-256-GCM Encryption:** All sensitive wallet data is encrypted using authenticated AES-256-GCM via the browser's native Web Crypto API. Nonces/IVs are randomly generated and strictly single-use. Furthermore, it leverages Additional Authenticated Data (AAD) to ensure ciphertext context integrity.
    *   **In-Memory Sanitization:** Sensitive application-managed buffers (keys, plaintexts) are explicitly zeroized immediately after use; runtime-managed copies remain outside the application's direct memory-control boundary.
*   **Native Kaspa Network Integration:** Powered by `kaspa-wasm` and `@kaspa/core-lib`, the wallet delivers high-performance, native-level transaction construction, Schnorr signing, and address derivation (P2PKH and P2SH) natively in the browser.
*   **Modern, Responsive UI:** Built with React and Tailwind CSS, offering a clean, intuitive, and mobile-friendly interface. It features real-time balance fetching, a streamlined full-view transaction history, and an accessible layout for both desktop and mobile users.
*   **Zero-Trust Storage Model:** The application treats the browser's local storage (IndexedDB/LocalStorage) as compromised by default, ensuring your wallet remains impenetrable without the master password.

## Technical Stack
*   **Frontend Framework:** React 18, TypeScript, Vite
*   **Styling:** Tailwind CSS, Lucide React (Icons)
*   **Cryptography:** Web Crypto API (`window.crypto.subtle`), `hash-wasm` (Argon2id)
*   **Kaspa Core Tooling:** `kaspa-wasm`, `@kaspa/core-lib`
