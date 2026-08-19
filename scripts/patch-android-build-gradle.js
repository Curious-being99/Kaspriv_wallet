import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const gradleFile = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradleFile)) {
  console.log('[Gradle Patch] android/app/build.gradle not found. Skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(gradleFile, 'utf8');

if (!content.includes('signingConfig signingConfigs.debug')) {
  content = content.replace(
    /release\s*\{/,
    'release {\n            signingConfig signingConfigs.debug'
  );
  fs.writeFileSync(gradleFile, content, 'utf8');
  console.log('[Gradle Patch] Successfully injected signingConfig signingConfigs.debug into release build type.');
} else {
  console.log('[Gradle Patch] release build type already has signingConfig configured.');
}
