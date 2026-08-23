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
  }
  if (!propsContent.includes('add-opens')) {
    propsContent += '\norg.gradle.jvmargs=-Xmx2048m --add-opens=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED\n';
  }
  fs.writeFileSync(gradlePropsFile, propsContent, 'utf8');
  console.log('[Gradle Patch] Patched gradle.properties with jvmargs and lint properties.');
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

// Patch android/app/build.gradle for compileOptions and Room dependencies
if (fs.existsSync(gradleFile)) {
  let appGradle = fs.readFileSync(gradleFile, 'utf8');
  let modified = false;

  if (!appGradle.includes('compileOptions')) {
    appGradle = appGradle.replace(
      /buildTypes\s*\{/,
      `compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
    buildTypes {`
    );
    modified = true;
  }

  if (!appGradle.includes('room-runtime')) {
    appGradle = appGradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    // Jetpack Room native database storage dependencies\n    def room_version = "2.6.1"\n    implementation "androidx.room:room-runtime:$room_version"\n    annotationProcessor "androidx.room:room-compiler:$room_version"\n`
    );
    modified = true;
  }

  if (!appGradle.includes('room.incremental')) {
    appGradle = appGradle.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        javaCompileOptions {\n            annotationProcessorOptions {\n                arguments += ["room.incremental":"false"]\n            }\n        }\n`
    );
    modified = true;
  }

  if (!appGradle.includes('compilerArgs') && !appGradle.includes('forkOptions')) {
    appGradle += `\n\ntasks.withType(JavaCompile).configureEach {\n    options.fork = true\n    options.forkOptions.jvmArgs = [\n        '--add-opens=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED',\n        '--add-opens=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED'\n    ]\n}\n`;
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(gradleFile, appGradle, 'utf8');
    console.log('[Gradle Patch] Patched android/app/build.gradle with compileOptions, Room dependencies, and compilerArgs.');
  }
}

