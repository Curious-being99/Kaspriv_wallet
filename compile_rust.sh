#!/bin/bash
# Compiles the Rust SDK for Android architectures.

set -e

echo "============================================="
echo " Building Kaspa Rust JNI bindings for Android "
echo "============================================="

# Auto-detect ANDROID_NDK_HOME if not explicitly set
if [ -z "$ANDROID_NDK_HOME" ]; then
    if [ -n "$ANDROID_SDK_ROOT" ] && [ -d "$ANDROID_SDK_ROOT/ndk" ]; then
        NDK_DETECTED=$(ls -d "$ANDROID_SDK_ROOT"/ndk/* 2>/dev/null | sort -V | tail -n 1 || true)
        if [ -n "$NDK_DETECTED" ]; then
            export ANDROID_NDK_HOME="$NDK_DETECTED"
            echo "Auto-detected NDK at: $ANDROID_NDK_HOME"
        fi
    elif [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME/ndk" ]; then
        NDK_DETECTED=$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -n 1 || true)
        if [ -n "$NDK_DETECTED" ]; then
            export ANDROID_NDK_HOME="$NDK_DETECTED"
            echo "Auto-detected NDK at: $ANDROID_NDK_HOME"
        fi
    fi
fi

if ! command -v cargo &> /dev/null; then
    echo "Rust/cargo is not installed in the environment. Skipping native Rust JNI compilation (WASM fallback active)."
    exit 0
fi

if ! command -v cargo-ndk &> /dev/null; then
    echo "cargo-ndk is not installed. Installing..."
    cargo install cargo-ndk --locked || cargo install cargo-ndk
fi

# Ensure targets are installed
rustup target add aarch64-linux-android || true
rustup target add armv7-linux-androideabi || true
rustup target add x86_64-linux-android || true

# Build for all targets
cd android/app/src/main/rust

echo "Compiling for ARM64..."
cargo ndk -t arm64-v8a -o ../jniLibs build --release

echo "Compiling for ARMv7..."
cargo ndk -t armeabi-v7a -o ../jniLibs build --release

echo "Compiling for x86_64 (Emulator)..."
cargo ndk -t x86_64 -o ../jniLibs build --release

echo "============================================="
echo "✅ Build Complete! Native libraries (.so) have been placed in android/app/src/main/jniLibs"
echo "============================================="
