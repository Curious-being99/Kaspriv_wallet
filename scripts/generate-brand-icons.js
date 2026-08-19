import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

// 1. Define the exact Kaspa double-chevron SVGs
const fullIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#FFFFFF" rx="100" />
  <g transform="translate(-14, 0)">
    <path d="M120 120H195L310 256L195 392H120L235 256L120 120Z" fill="#53C5B9" />
    <path d="M250 120H325L440 256L325 392H250L365 256L250 120Z" fill="#53C5B9" />
  </g>
</svg>
`;

const foregroundIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(-14, 0)">
    <path d="M120 120H195L310 256L195 392H120L235 256L120 120Z" fill="#53C5B9" />
    <path d="M250 120H325L440 256L325 392H250L365 256L250 120Z" fill="#53C5B9" />
  </g>
</svg>
`;

// Save SVGs to public/assets
const assetsDir = path.join(ROOT_DIR, 'public', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

fs.writeFileSync(path.join(assetsDir, 'kas_icon.svg'), fullIconSvg, 'utf8');
fs.writeFileSync(path.join(assetsDir, 'kaspa-logo.svg'), fullIconSvg, 'utf8');

// Convert to high-res PNGs using convert
const fullIconSvgPath = path.join(assetsDir, 'kas_icon.svg');
const icon512Path = path.join(assetsDir, 'kas_icon_512.png');
const icon192Path = path.join(assetsDir, 'kas_icon_192.png');
const iconMainPngPath = path.join(assetsDir, 'kas_icon.png');

try {
  execSync(`convert -background none -resize 512x512 "${fullIconSvgPath}" "${icon512Path}"`);
  execSync(`convert -background none -resize 192x192 "${fullIconSvgPath}" "${icon192Path}"`);
  execSync(`cp "${icon512Path}" "${iconMainPngPath}"`);
  console.log('[Icon Generator] Successfully rendered PNGs in public/assets/');
} catch (err) {
  console.warn('[Icon Generator] convert tool warning:', err.message);
}

// 2. Synchronize to Android Native Resources
const resDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(resDir)) {
  // A. Vector Drawable for Adaptive Foreground
  const drawableDir = path.join(resDir, 'drawable');
  if (!fs.existsSync(drawableDir)) {
    fs.mkdirSync(drawableDir, { recursive: true });
  }

  const vectorForegroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="512"
    android:viewportHeight="512">
    <group
        android:translateX="-14.0">
        <path
            android:fillColor="#53C5B9"
            android:pathData="M120,120H195L310,256L195,392H120L235,256L120,120Z" />
        <path
            android:fillColor="#53C5B9"
            android:pathData="M250,120H325L440,256L325,392H250L365,256L250,120Z" />
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
        android:fillColor="#FFFFFF"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;

  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_foreground.xml'), vectorForegroundXml, 'utf8');
  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), vectorBackgroundXml, 'utf8');

  // B. Values Background Color
  const valuesDir = path.join(resDir, 'values');
  if (fs.existsSync(valuesDir)) {
    const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), colorXml, 'utf8');
  }

  // C. Mipmap Adaptive Icon XML
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

  // D. Density Mipmaps PNGs
  const densities = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 },
  ];

  densities.forEach(({ folder, size }) => {
    const targetDir = path.join(resDir, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const launcherPath = path.join(targetDir, 'ic_launcher.png');
    const launcherRoundPath = path.join(targetDir, 'ic_launcher_round.png');
    const launcherForegroundPath = path.join(targetDir, 'ic_launcher_foreground.png');

    try {
      execSync(`convert -resize ${size}x${size} "${icon512Path}" "${launcherPath}"`);
      execSync(`convert -resize ${size}x${size} "${icon512Path}" "${launcherRoundPath}"`);
      execSync(`convert -resize ${size}x${size} "${icon512Path}" "${launcherForegroundPath}"`);
    } catch (e) {
      if (fs.existsSync(icon512Path)) {
        fs.copyFileSync(icon512Path, launcherPath);
        fs.copyFileSync(icon512Path, launcherRoundPath);
        fs.copyFileSync(icon512Path, launcherForegroundPath);
      }
    }
  });

  console.log('[Icon Generator] Android icons updated across all densities and adaptive manifests with White Background & Teal Chevrons!');
}
