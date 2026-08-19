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

const sourceIcon = fs.existsSync(SOURCE_PNG) ? SOURCE_PNG : ALTERNATE_PNG;

if (!fs.existsSync(sourceIcon)) {
  console.error('[Icon Sync] Source logo icon not found at:', sourceIcon);
  process.exit(0);
}

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

  console.log(`[Icon Sync] Copied logo to ${folder}`);
});

console.log('[Icon Sync] Android launcher and install icons successfully updated with main logo!');
