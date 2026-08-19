import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const ROOT_DIR = process.cwd();

// Pure Kaspa Double Chevron Vector on Deep Black Canvas (#000000 / #090D12)
// Kaspa Vibrant Turquoise: #70C7BA
const svgBlackBg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#000000" rx="100" />
  <g fill="#70C7BA">
    <path d="M86 100H166L286 256L166 412H86L206 256L86 100Z" />
    <path d="M226 100H306L426 256L306 412H226L346 256L226 100Z" />
  </g>
</svg>
`;

const svgPureTransparent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="#70C7BA">
    <path d="M86 100H166L286 256L166 412H86L206 256L86 100Z" />
    <path d="M226 100H306L426 256L306 412H226L346 256L226 100Z" />
  </g>
</svg>
`;

function renderSvgToPng(svgStr, targetPath, width = 512, height = 512) {
  const resvg = new Resvg(svgStr, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  fs.writeFileSync(targetPath, pngBuffer);
}

// 1. Render Public Web & PWA Assets
const publicAssetsDir = path.join(ROOT_DIR, 'public', 'assets');
if (!fs.existsSync(publicAssetsDir)) {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
}

fs.writeFileSync(path.join(publicAssetsDir, 'kas_icon.svg'), svgPureTransparent, 'utf8');
fs.writeFileSync(path.join(publicAssetsDir, 'kaspa-logo.svg'), svgPureTransparent, 'utf8');

renderSvgToPng(svgBlackBg, path.join(publicAssetsDir, 'kas_icon_512.png'), 512, 512);
renderSvgToPng(svgBlackBg, path.join(publicAssetsDir, 'kas_icon_192.png'), 192, 192);
renderSvgToPng(svgBlackBg, path.join(publicAssetsDir, 'kas_icon.png'), 512, 512);
renderSvgToPng(svgBlackBg, path.join(ROOT_DIR, 'public', 'asset_logo.png'), 512, 512);

console.log('[Android Icon Builder] Web & PWA assets updated to Black & Turquoise theme.');

// 2. Synchronize to Android Native Resources
const resDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(resDir)) {
  // A. Adaptive Icon Foreground Vector (108dp viewport, safe-zone scaled for Android 8+)
  const vectorForegroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#70C7BA"
        android:pathData="M28,32 H41 L58,54 L41,76 H28 L45,54 Z" />
    <path
        android:fillColor="#70C7BA"
        android:pathData="M48,32 H61 L78,54 L61,76 H48 L65,54 Z" />
</vector>
`;

  // Background Vector: Pure Black #000000
  const vectorBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#000000"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;

  // Write to both drawable/ AND drawable-v24/ (to eliminate default robot icon on Xiaomi/MIUI)
  const drawableDirs = [
    path.join(resDir, 'drawable'),
    path.join(resDir, 'drawable-v24')
  ];

  drawableDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.xml'), vectorForegroundXml, 'utf8');
    fs.writeFileSync(path.join(dir, 'ic_launcher_background.xml'), vectorBackgroundXml, 'utf8');
  });

  // B. Values Background Color: #000000
  const valuesDir = path.join(resDir, 'values');
  if (fs.existsSync(valuesDir)) {
    const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
`;
    fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), colorXml, 'utf8');
  }

  // C. Mipmap Adaptive Icon XML (API 26+)
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

  // D. Density Mipmaps PNGs for Legacy & Package Installers (Xiaomi, Samsung, Pixel)
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

    renderSvgToPng(svgBlackBg, path.join(targetDir, 'ic_launcher.png'), size, size);
    renderSvgToPng(svgBlackBg, path.join(targetDir, 'ic_launcher_round.png'), size, size);
    renderSvgToPng(svgBlackBg, path.join(targetDir, 'ic_launcher_foreground.png'), size, size);
  });

  // E. Splash Screens in drawables
  const splashDirs = [
    'drawable',
    'drawable-port-mdpi',
    'drawable-port-hdpi',
    'drawable-port-xhdpi',
    'drawable-port-xxhdpi',
    'drawable-port-xxxhdpi',
    'drawable-land-mdpi',
    'drawable-land-hdpi',
    'drawable-land-xhdpi',
    'drawable-land-xxhdpi',
    'drawable-land-xxxhdpi',
  ];

  splashDirs.forEach(dirName => {
    const splashPath = path.join(resDir, dirName, 'splash.png');
    if (fs.existsSync(path.dirname(splashPath))) {
      renderSvgToPng(svgBlackBg, splashPath, 480, 480);
    }
  });

  console.log('[Android Icon Builder] Android launch icons, drawable-v24, and installer icons updated to Black & Turquoise!');
}
