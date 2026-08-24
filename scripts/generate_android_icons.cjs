const sharp = require('sharp');
const fs = require('fs');

async function build() {
  const svgBuffer = fs.readFileSync('public/assets/kas_icon.svg');
  
  // 1. Fix Web PNGs
  await sharp(svgBuffer).resize(512, 512).toFile('public/assets/kas_icon_512.png');
  await sharp(svgBuffer).resize(192, 192).toFile('public/assets/kas_icon_192.png');
  await sharp(svgBuffer).resize(512, 512).toFile('public/assets/kas_icon.png');
  
  const sizes = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192
  };
  
  for (const [density, size] of Object.entries(sizes)) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    fs.mkdirSync(dir, { recursive: true });
    
    // Foreground (Transparent + Logo)
    await sharp(svgBuffer)
      .resize(size, size)
      .toFile(`${dir}/ic_launcher_foreground.png`);
      
    // Legacy Square (Slate 900 Background + Logo)
    await sharp({
      create: { width: size, height: size, channels: 4, background: '#0F172A' }
    })
      .composite([{ input: await sharp(svgBuffer).resize(size, size).toBuffer() }])
      .toFile(`${dir}/ic_launcher.png`);
      
    // Legacy Round (Slate 900 Circle + Logo)
    const circleSvg = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#0F172A"/></svg>`
    );
    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([
        { input: circleSvg },
        { input: await sharp(svgBuffer).resize(size, size).toBuffer() }
      ])
      .toFile(`${dir}/ic_launcher_round.png`);
  }
  
  // Splash screens
  const portW = 480, portH = 800;
  const logoPort = Math.round(portW * 0.4);
  fs.mkdirSync('android/app/src/main/res/drawable', { recursive: true });
  await sharp({
    create: { width: portW, height: portH, channels: 4, background: '#0F172A' }
  })
    .composite([{ input: await sharp(svgBuffer).resize(logoPort, logoPort).toBuffer() }])
    .toFile('android/app/src/main/res/drawable/splash.png');
    
  const landW = 800, landH = 480;
  const logoLand = Math.round(landH * 0.4);
  fs.mkdirSync('android/app/src/main/res/drawable-land-hdpi', { recursive: true });
  await sharp({
    create: { width: landW, height: landH, channels: 4, background: '#0F172A' }
  })
    .composite([{ input: await sharp(svgBuffer).resize(logoLand, logoLand).toBuffer() }])
    .toFile('android/app/src/main/res/drawable-land-hdpi/splash.png');
    
  console.log('All icons generated successfully with sharp!');
}

build().catch(console.error);
