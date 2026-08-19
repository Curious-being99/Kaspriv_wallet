import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const gradleFile = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const variablesFile = path.join(ROOT_DIR, 'android', 'variables.gradle');

// Patch variables.gradle
if (fs.existsSync(variablesFile)) {
  let varContent = fs.readFileSync(variablesFile, 'utf8');
  if (varContent.includes('compileSdkVersion = 36') || varContent.includes('targetSdkVersion = 36')) {
    varContent = varContent.replace(/compileSdkVersion = 36/g, 'compileSdkVersion = 34');
    varContent = varContent.replace(/targetSdkVersion = 36/g, 'targetSdkVersion = 34');
    fs.writeFileSync(variablesFile, varContent, 'utf8');
    console.log('[Gradle Patch] Patched variables.gradle to SDK 34.');
  }
} else {
  console.log('[Gradle Patch] android/variables.gradle not found.');
}

if (!fs.existsSync(gradleFile)) {
  console.log('[Gradle Patch] android/app/build.gradle not found. Skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(gradleFile, 'utf8');

if (!content.includes('signingConfigs {')) {
  content = content.replace(
    /buildTypes\s*\{/,
    'signingConfigs {\n        debug {\n            storeFile file(\'debug.keystore\')\n            storePassword \'android\'\n            keyAlias \'androiddebugkey\'\n            keyPassword \'android\'\n        }\n    }\n    buildTypes {'
  );
  console.log('[Gradle Patch] Injected signingConfigs block.');
}

if (!content.includes('signingConfig signingConfigs.debug')) {
  content = content.replace(
    /release\s*\{/,
    'release {\n            signingConfig signingConfigs.debug'
  );
  console.log('[Gradle Patch] Injected signingConfig signingConfigs.debug.');
}

if (!content.includes('checkReleaseBuilds false')) {
  content = content.replace(
    /buildTypes\s*\{/,
    'lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }\n    buildTypes {'
  );
  console.log('[Gradle Patch] Injected lint block with checkReleaseBuilds false.');
}

fs.writeFileSync(gradleFile, content, 'utf8');
console.log('[Gradle Patch] Gradle file patch completed.');
