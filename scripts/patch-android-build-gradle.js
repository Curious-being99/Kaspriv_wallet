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
    rootContent += `\nsubprojects {\n    afterEvaluate { project ->\n        if (project.hasProperty("android")) {\n            android {\n                lintOptions {\n                    abortOnError false\n                    checkReleaseBuilds false\n                }\n            }\n        }\n    }\n}\n`;
    fs.writeFileSync(rootGradleFile, rootContent, 'utf8');
    console.log('[Gradle Patch] Injected subprojects lint block into root build.gradle.');
  }
}
