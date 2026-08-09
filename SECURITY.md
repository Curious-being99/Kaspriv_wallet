# Security Policy - KasPriv Wallet

## Non-Custodial Security Model

KasPriv is a secure, decentralized, non-custodial cryptographic wallet built for the Kaspa network. 

- **Client-Side Key Management**: All private keys (`kprv`, `xprv`), mnemonics (seed phrases), and vault encryption keys are generated and stored exclusively on your local device (IndexedDB ) protected by your user-defined master password.
- **Zero-Knowledge Transmission**: No private keys, seed phrases, or sensitive wallet secrets are ever transmitted to any remote server or third-party service.
- **Cryptographic Isolation**: Covenants, transactions, and script signing operations occur entirely within client-side WebAssembly (`kaspa-wasm`) and secp256k1 cryptographic primitives.

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
