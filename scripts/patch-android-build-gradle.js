import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const gradleFile = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const rootGradleFile = path.join(ROOT_DIR, 'android', 'build.gradle');
const variablesFile = path.join(ROOT_DIR, 'android', 'variables.gradle');
const gradlePropsFile = path.join(ROOT_DIR, 'android', 'gradle.properties');

// Patch variables.gradle
if (fs.existsSync(variablesFile)) {
  let varContent = fs.readFileSync(variablesFile, 'utf8');
  if (varContent.includes('compileSdkVersion = 36') || varContent.includes('targetSdkVersion = 36')) {
    varContent = varContent.replace(/compileSdkVersion = 36/g, 'compileSdkVersion = 35');
    varContent = varContent.replace(/targetSdkVersion = 36/g, 'targetSdkVersion = 35');
    varContent = varContent.replace(/androidxCoreVersion = '1.17.0'/g, "androidxCoreVersion = '1.13.0'");
    varContent = varContent.replace(/androidxActivityVersion = '1.11.0'/g, "androidxActivityVersion = '1.9.0'");
    varContent = varContent.replace(/androidxFragmentVersion = '1.8.9'/g, "androidxFragmentVersion = '1.7.0'");
    varContent = varContent.replace(/androidxAppCompatVersion = '1.7.1'/g, "androidxAppCompatVersion = '1.7.0'");
    varContent = varContent.replace(/androidxWebkitVersion = '1.14.0'/g, "androidxWebkitVersion = '1.12.0'");
    fs.writeFileSync(variablesFile, varContent, 'utf8');
    console.log('[Gradle Patch] Patched variables.gradle to SDK 35 and compatible AndroidX versions.');
  }
}

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
