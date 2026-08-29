#!/bin/bash
# Compiles the Rust SDK for Android architectures.

set -e

echo "============================================="
echo " Building Kaspa Rust JNI bindings for Android "
echo "============================================="

if ! command -v cargo &> /dev/null; then
    echo "Rust is not installed. Please install Rust via rustup (https://rustup.rs/)."
    exit 1
fi

if ! command -v cargo-ndk &> /dev/null; then
    echo "cargo-ndk is not installed. Installing..."
    cargo install cargo-ndk
fi

# Ensure targets are installed
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add x86_64-linux-android

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
