import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const gradleFile = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradleFile)) {
  console.log('[Gradle Patch] android/app/build.gradle not found. Skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(gradleFile, 'utf8');

if (!content.includes('signingConfigs {')) {
  content = content.replace(
    /buildTypes\s*\{/,
    'signingConfigs {\n        debug {\n            storeFile file("${System.getProperty(\'user.home\')}/.android/debug.keystore")\n            storePassword \'android\'\n            keyAlias \'androiddebugkey\'\n            keyPassword \'android\'\n        }\n    }\n    buildTypes {'
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
