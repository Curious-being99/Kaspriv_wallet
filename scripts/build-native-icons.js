import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

const ROOT_DIR = process.cwd();

// Pure Kaspa Double Chevron Vector (Centered on 512x512 canvas)
// Kaspa Official Turquoise: #70C7BA
const svgWithWhiteBg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#FFFFFF" rx="100" />
  <g fill="#70C7BA">
    <path d="M86 100H166L286 256L166 412H86L206 256L86 100Z" />
    <path d="M226 100H306L426 256L306 412H226L346 256L226 100Z" />
  </g>
</svg>
`;

const svgPureVector = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
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

// 1. Write Public Web Assets
const publicAssetsDir = path.join(ROOT_DIR, 'public', 'assets');
if (!fs.existsSync(publicAssetsDir)) {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
}

fs.writeFileSync(path.join(publicAssetsDir, 'kas_icon.svg'), svgWithWhiteBg, 'utf8');
fs.writeFileSync(path.join(publicAssetsDir, 'kaspa-logo.svg'), svgWithWhiteBg, 'utf8');

renderSvgToPng(svgWithWhiteBg, path.join(publicAssetsDir, 'kas_icon_512.png'), 512, 512);
renderSvgToPng(svgWithWhiteBg, path.join(publicAssetsDir, 'kas_icon_192.png'), 192, 192);
renderSvgToPng(svgWithWhiteBg, path.join(publicAssetsDir, 'kas_icon.png'), 512, 512);
renderSvgToPng(svgWithWhiteBg, path.join(ROOT_DIR, 'public', 'asset_logo.png'), 512, 512);

console.log('[Native Icon Builder] Rendered crisp pixel-perfect PWA & Web PNG icons from SVG.');

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

    renderSvgToPng(svgWithWhiteBg, path.join(targetDir, 'ic_launcher.png'), size, size);
    renderSvgToPng(svgWithWhiteBg, path.join(targetDir, 'ic_launcher_round.png'), size, size);
    renderSvgToPng(svgWithWhiteBg, path.join(targetDir, 'ic_launcher_foreground.png'), size, size);
  });

  console.log('[Native Icon Builder] Android launcher and install icons updated with exact Kaspa PWA vector logo across all density buckets!');
}
