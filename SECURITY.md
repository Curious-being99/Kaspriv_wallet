# Security Policy - KasPriv Wallet

## Non-Custodial Security Model

KasPriv is a secure, decentralized, non-custodial cryptographic wallet built for the Kaspa network. 

- **Client-Side Key Management**: All private keys (`kprv`, `xprv`), mnemonics (seed phrases), and vault encryption keys are generated and stored exclusively on your local device (IndexedDB only) protected by your user-defined master password. Note that JavaScript memory wiping (clearing secrets from memory upon locking) is best-effort and inherently limited by garbage collection in pure JavaScript environments.
- **Zero-Knowledge Transmission**: No private keys, seed phrases, or sensitive wallet secrets are ever transmitted to any remote server or third-party service.
- **Cryptographic Isolation**: Covenants, transactions, and script signing operations occur entirely within client-side WebAssembly (`kaspa-wasm`) and secp256k1 cryptographic primitives. Note that the build relies on a postinstall patch script (`patch-kaspa-wasm.js`) for WebAssembly compatibility which is verified during CI/build.
- **Biometric Security Architecture (WebAuthn Gate)**: Native platform biometrics (Face ID, Touch ID, Android BiometricPrompt, Windows Hello) operate as a hardware authorization gate (`userVerification: 'required'`) via WebAuthn (`navigator.credentials`). Biometrics gate access to a high-entropy 256-bit random key (`window.crypto.getRandomValues`) wrapping the vault password in AES-256-GCM + Argon2id. Decrypted passwords reside exclusively in transient function closure memory and are never persisted in React states, DOM nodes, or storage.

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
