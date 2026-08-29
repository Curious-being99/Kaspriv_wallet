#!/bin/bash
sed -i 's/implementation "androidx.biometric:biometric:1.1.0"/implementation "androidx.biometric:biometric:1.1.0"\n    implementation "androidx.security:security-crypto:1.1.0-alpha06"\n    implementation "com.google.code.gson:gson:2.10.1"/' android/app/build.gradle
