import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const SOURCE_PNG = path.join(ROOT_DIR, 'public', 'assets', 'kas_icon_512.png');
const ALTERNATE_PNG = path.join(ROOT_DIR, 'public', 'assets', 'kas_icon.png');

const resDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(resDir)) {
  console.log('[Icon Sync] Android resource directory does not exist yet. Skipping icon sync.');
  process.exit(0);
}

// 1. Write the vector foreground icon (Kaspa SVG converted to Android Vector Drawable)
const drawableDir = path.join(resDir, 'drawable');
if (!fs.existsSync(drawableDir)) {
  fs.mkdirSync(drawableDir, { recursive: true });
}

const vectorForegroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="0.14"
        android:scaleY="0.14"
        android:translateX="18.0"
        android:translateY="18.0">
        <path
            android:fillColor="#70C7BA"
            android:pathData="M120,100H200L320,256L200,412H120L240,256L120,100Z" />
        <path
            android:fillColor="#70C7BA"
            android:fillAlpha="0.6"
            android:pathData="M260,100H340L460,256L340,412H260L380,256L260,100Z" />
    </group>
</vector>
`;

const vectorBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#0B101B"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;

fs.writeFileSync(path.join(drawableDir, 'ic_launcher_foreground.xml'), vectorForegroundXml, 'utf8');
fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), vectorBackgroundXml, 'utf8');
console.log('[Icon Sync] Wrote ic_launcher_foreground.xml and ic_launcher_background.xml into res/drawable.');

// 2. Update values/ic_launcher_background.xml to dark background
const valuesDir = path.join(resDir, 'values');
if (fs.existsSync(valuesDir)) {
  const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B101B</color>
</resources>
`;
  fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), colorXml, 'utf8');
  console.log('[Icon Sync] Updated values/ic_launcher_background.xml color to #0B101B.');
}

// 3. Update mipmap-anydpi-v26 adaptive icon manifests
const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
if (!fs.existsSync(anydpiDir)) {
  fs.mkdirSync(anydpiDir, { recursive: true });
}

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
`;

fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml, 'utf8');
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf8');
console.log('[Icon Sync] Updated mipmap-anydpi-v26 adaptive-icon manifests.');

// 4. Copy PNG fallbacks across density buckets
const sourceIcon = fs.existsSync(SOURCE_PNG) ? SOURCE_PNG : ALTERNATE_PNG;
if (fs.existsSync(sourceIcon)) {
  const mipmapFolders = [
    'mipmap-mdpi',
    'mipmap-hdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
  ];

  mipmapFolders.forEach((folder) => {
    const targetDir = path.join(resDir, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const launcherPath = path.join(targetDir, 'ic_launcher.png');
    const launcherRoundPath = path.join(targetDir, 'ic_launcher_round.png');
    const launcherForegroundPath = path.join(targetDir, 'ic_launcher_foreground.png');

    fs.copyFileSync(sourceIcon, launcherPath);
    fs.copyFileSync(sourceIcon, launcherRoundPath);
    fs.copyFileSync(sourceIcon, launcherForegroundPath);
  });
  console.log('[Icon Sync] Copied PNG fallback icons into all mipmap density folders.');
}

console.log('[Icon Sync] Android launcher and install icons successfully updated with Kaspa logo!');
