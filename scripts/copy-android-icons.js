import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const ROOT_DIR = process.cwd();
const svgSourcePath = path.join(ROOT_DIR, 'public', 'assets', 'kas_icon.svg');

if (!fs.existsSync(svgSourcePath)) {
  console.error(`Source SVG not found at ${svgSourcePath}`);
  process.exit(1);
}

// Pure transparent vector from public/assets/kas_icon.svg
const svgTransparent = fs.readFileSync(svgSourcePath, 'utf8');

// Dark themed icon (#090D12 background with #70C7BA chevrons, NO WHITE!)
const svgDarkThemed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#090D12" />
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

// 1. Render Public Web & PWA Assets with Dark #090D12 Canvas (Zero White)
const publicAssetsDir = path.join(ROOT_DIR, 'public', 'assets');
renderSvgToPng(svgDarkThemed, path.join(publicAssetsDir, 'kas_icon_512.png'), 512, 512);
renderSvgToPng(svgDarkThemed, path.join(publicAssetsDir, 'kas_icon_192.png'), 192, 192);
renderSvgToPng(svgDarkThemed, path.join(publicAssetsDir, 'kas_icon.png'), 512, 512);
renderSvgToPng(svgTransparent, path.join(ROOT_DIR, 'public', 'asset_logo.png'), 512, 512);

console.log('[Icon Sync] Rendered dark-themed (#090D12) PWA & Web PNG icons without white background.');

// 2. Synchronize to Android Native Resources
const resDir = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');
if (fs.existsSync(resDir)) {
  // A. Native Vector Foreground for Android Adaptive Icon
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
    <path
        android:fillColor="#70C7BA"
        android:pathData="M86,100H166L286,256L166,412H86L206,256L86,100Z" />
    <path
        android:fillColor="#70C7BA"
        android:pathData="M226,100H306L426,256L306,412H226L346,256L226,100Z" />
</vector>
`;

  // Background: Pure dark #090D12 (Zero White)
  const vectorBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#090D12"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`;

  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_foreground.xml'), vectorForegroundXml, 'utf8');
  fs.writeFileSync(path.join(drawableDir, 'ic_launcher_background.xml'), vectorBackgroundXml, 'utf8');

  // B. Values Background Color: #090D12
  const valuesDir = path.join(resDir, 'values');
  if (fs.existsSync(valuesDir)) {
    const colorXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#090D12</color>
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

  // D. Density Mipmaps PNGs (Rendered on dark #090D12 canvas)
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

    renderSvgToPng(svgDarkThemed, path.join(targetDir, 'ic_launcher.png'), size, size);
    renderSvgToPng(svgDarkThemed, path.join(targetDir, 'ic_launcher_round.png'), size, size);
    renderSvgToPng(svgTransparent, path.join(targetDir, 'ic_launcher_foreground.png'), size, size);
  });

  console.log('[Icon Sync] Android launcher and install icons updated with dark #090D12 theme (no white).');
}
