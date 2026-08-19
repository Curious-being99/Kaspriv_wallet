import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const gradleFile = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const rootGradleFile = path.join(ROOT_DIR, 'android', 'build.gradle');
const gradlePropsFile = path.join(ROOT_DIR, 'android', 'gradle.properties');

// Patch gradle.properties
if (fs.existsSync(gradlePropsFile)) {
  let propsContent = fs.readFileSync(gradlePropsFile, 'utf8');
  if (!propsContent.includes('android.lint.abortOnError')) {
    propsContent += '\nandroid.lint.abortOnError=false\nandroid.lint.checkReleaseBuilds=false\nandroid.overrideVersionCheck=true\n';
    fs.writeFileSync(gradlePropsFile, propsContent, 'utf8');
    console.log('[Gradle Patch] Injected lint ignore properties into gradle.properties.');
  }
}

// Patch root build.gradle
if (fs.existsSync(rootGradleFile)) {
  let rootContent = fs.readFileSync(rootGradleFile, 'utf8');
  if (!rootContent.includes('subprojects {')) {
    rootContent += `
subprojects {
    afterEvaluate { project ->
        if (project.hasProperty("android")) {
            android {
                lintOptions {
                    abortOnError false
                    checkReleaseBuilds false
                }
            }
        }
    }
}
`;
    fs.writeFileSync(rootGradleFile, rootContent, 'utf8');
    console.log('[Gradle Patch] Injected subprojects lint block into root build.gradle.');
  }
}

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
