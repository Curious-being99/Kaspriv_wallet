# Kaspriv Native Wallet (Kotlin & Rust Architecture)

Kaspriv Wallet is a high-performance, non-custodial Kaspa mobile wallet built entirely with **Native Kotlin** and **Rust**, completely independent of any JavaScript, React, or WebView frameworks.

## Architecture Overview

### 1. High-Performance Rust Cryptographic Core (`/rust`)
- **Memory Safety & Speed**: Seed generation, BIP-32/BIP-44 hierarchical deterministic (HD) private key derivation (`m/44'/111111'/0'/0/0`), and SECP256k1 ECDSA transaction input signing execute natively in Rust.
- **AES-256-GCM Vault Encryption**: Encrypts sensitive wallet mnemonics using PBKDF2-HMAC-SHA256 derived keys and authenticated AES-256-GCM encryption.
- **JNI Integration**: Bound directly to Android via high-speed Java Native Interface (JNI) routines (`libkaspriv_rust.so`).

### 2. Native Android Application (`/android`)
- **Pure Kotlin UI**: Built using native Android UI components (`NativeWalletActivity.kt`), ConstraintLayouts, Material CardViews, and RecyclerViews.
- **Local Persistence**: Powered by Android Room SQLite database for instant offline access to transaction histories, UTXOs, and wallet accounts.
- **Native QR Code Scanner**: Integrated high-speed camera scanning via ZXing for instant address payments and contact imports.
- **Real-Time Kaspa Synchronization**: Connects directly to public Kaspa REST & WebSocket nodes for real-time balance tracking, block DAA scores, and instant transaction broadcasting.

## Building and Compiling
1. **Rust Library**: Compile `kaspriv_rust` for Android target architectures (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`).
2. **Android App**: Open the `android/` directory in Android Studio or build via Gradle (`./gradlew assembleRelease`).
