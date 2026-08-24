# Security Policy - KasPriv Wallet

## Non-Custodial Security Model

KasPriv is a secure, decentralized, non-custodial cryptographic wallet built for the Kaspa network. 

- **Client-Side Key Management**: All private keys (`kprv`, `xprv`), mnemonics (seed phrases), and vault encryption keys are generated and stored exclusively on your local device (IndexedDB only) protected by your user-defined master password. Password-based encryption is managed via the official Rusty Kaspa SDK (`@kasdk/web`) using XChaCha20-Poly1305 with AAD. Note that JavaScript memory wiping (clearing secrets from memory upon locking) is best-effort and inherently limited by garbage collection in pure JavaScript environments.
- **Zero-Knowledge Transmission**: No private keys, seed phrases, or sensitive wallet secrets are ever transmitted to any remote server or third-party service.
- **Cryptographic Isolation**: Covenants, transactions, and script signing operations occur client-side. Kaspriv uses the official high-performance **Rusty Kaspa WASM SDK (`@kasdk/web`)** for all core cryptographic primitives, including BIP39 mnemonic generation, 2,048-round PBKDF2 seed derivation, HD derivation (XPrv/XPub), and Schnorr signing. This ensures 100% consensus parity and direct real Kaspa node broadcasting without legacy JavaScript-bound derivation risks.
- **Biometric Security Architecture (WebAuthn Gate)**: Native platform biometrics (Face ID, Touch ID, Android BiometricPrompt, Windows Hello) operate as a hardware authorization gate (`userVerification: 'required'`) via WebAuthn (`navigator.credentials`). Biometrics gate access to the vault password. Decrypted passwords reside exclusively in transient function closure memory and are never persisted in React states, DOM nodes, or storage.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Security Vulnerability

We take the security of user funds and cryptographic keys extremely seriously. If you discover any security vulnerabilities or cryptographic flaws:

1. **Do NOT open a public GitHub issue** for sensitive security matters.
2. Please report vulnerabilities privately through GitHub's security advisory reporting feature or directly to the repository maintainers.
3. Include a detailed description of the vulnerability, steps to reproduce, and potential impact.

Thank you for helping keep KasPriv and the broader Kaspa ecosystem safe and secure!
