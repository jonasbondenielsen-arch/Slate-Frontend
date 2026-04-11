/**
 * Slate icon generator
 * Converts public/icons/icon.svg → PNG files at all required sizes
 *
 * Run:
 *   npm install
 *   npm run generate-icons
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC_SVG = path.join(__dirname, '../public/icons/icon.svg');
const OUT_DIR = path.join(__dirname, '../public/icons');

// All sizes needed for PWA + iOS + Android + Capacitor + Splash
const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512, 1024];

// Extra named files expected by specific platforms
const NAMED = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32,  name: 'favicon-32.png' },
  { size: 16,  name: 'favicon-16.png' },
  { size: 512, name: 'splash-logo.png' },
];

async function generate() {
  if (!fs.existsSync(SRC_SVG)) {
    console.error('❌  icon.svg not found at', SRC_SVG);
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const svgBuf = fs.readFileSync(SRC_SVG);

  // Numbered icon-NNN.png files
  for (const size of SIZES) {
    const outFile = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(svgBuf)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    console.log(`✅  icon-${size}.png`);
  }

  // Named aliases
  for (const { size, name } of NAMED) {
    const outFile = path.join(OUT_DIR, name);
    await sharp(svgBuf)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    console.log(`✅  ${name}  (${size}px)`);
  }

  // favicon.ico — use 32px PNG (browsers accept PNG favicons fine)
  const faviconPng = path.join(OUT_DIR, 'favicon-32.png');
  const faviconDest = path.join(__dirname, '../favicon.png');
  fs.copyFileSync(faviconPng, faviconDest);
  console.log('✅  favicon.png (32px, root)');

  console.log('\n🎉  All icons generated in', OUT_DIR);
}

generate().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
