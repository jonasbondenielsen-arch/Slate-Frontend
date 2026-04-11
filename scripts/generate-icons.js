/**
 * Slate icon generator — PNG source edition
 *
 * Source: public/icons/source-logo.png
 *   → Contains S-symbol (top/centre) + "SLATE" text (bottom-left)
 *   → White/light background
 *
 * Steps:
 *   1. Load source PNG
 *   2. Detect top-region (S-circle only, crop away SLATE text)
 *   3. Trim whitespace tightly
 *   4. Composite white symbol onto #2C2C2A square background
 *   5. Export all icon sizes
 *
 * Run:
 *   npm install      (only needed once)
 *   npm run generate-icons
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SRC   = path.join(__dirname, '../public/icons/source-logo.png');
const OUT   = path.join(__dirname, '../public/icons');
const BG    = { r: 44, g: 44, b: 42, alpha: 1 };   // #2C2C2A
const PAD   = 0.16;                                  // 16 % padding around symbol

const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512, 1024];
const NAMED = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32,  name: 'favicon-32.png' },
  { size: 16,  name: 'favicon-16.png' },
  { size: 512, name: 'splash-logo.png' },
];

async function buildBase() {
  if (!fs.existsSync(SRC)) {
    console.error('\n❌  source-logo.png ikke fundet i public/icons/');
    console.error('    Gem logo-filen som:');
    console.error('    C:\\Users\\Jonas Bonde\\Desktop\\slate-frontend\\public\\icons\\source-logo.png\n');
    process.exit(1);
  }

  // ── 1. Get metadata ──────────────────────────────────────────────────────
  const meta = await sharp(SRC).metadata();
  const { width, height } = meta;
  console.log(`📐  Kilde: ${width}×${height}px`);

  // ── 2. Crop: take top 72 % of image to cut off "SLATE" text ─────────────
  //    The S-circle sits in the upper portion; the text is at the very bottom.
  const cropHeight = Math.round(height * 0.72);
  const cropped = await sharp(SRC)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .toBuffer();

  // ── 3. Convert to greyscale, threshold → pure black/white, then invert ──
  //    White bg → transparent, black S → white (so it pops on dark bg)
  const greyed = await sharp(cropped)
    .greyscale()
    .normalise()
    .toBuffer();

  // ── 4. Make white bg transparent via negate+threshold trick ─────────────
  //    We use sharp's flatten-then-negate approach:
  //    - flatten to white bg  (ensure no alpha artefacts)
  //    - negate  (S becomes white, bg becomes black)
  //    - then use black as the "alpha channel" via ensureAlpha + linear
  const negated = await sharp(greyed)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .negate()          // S = white on black bg
    .toBuffer();

  // ── 5. Trim to tight bounds around symbol ───────────────────────────────
  const trimmed = await sharp(negated)
    .trim({ background: { r: 0, g: 0, b: 0 }, threshold: 10 })
    .toBuffer();

  const trimMeta = await sharp(trimmed).metadata();
  const symW = trimMeta.width;
  const symH = trimMeta.height;
  const symMax = Math.max(symW, symH);
  console.log(`✂️   Symbol efter trim: ${symW}×${symH}px`);

  // ── 6. Build 1024px master: symbol centred on dark square ───────────────
  const MASTER = 1024;
  const padPx  = Math.round(MASTER * PAD);
  const fitTo  = MASTER - padPx * 2;

  // Scale symbol to fit within fitTo × fitTo
  const scaledSym = await sharp(trimmed)
    .resize(fitTo, fitTo, { fit: 'inside', kernel: 'lanczos3' })
    .toBuffer();

  const scaledMeta = await sharp(scaledSym).metadata();
  const offX = Math.round((MASTER - scaledMeta.width)  / 2);
  const offY = Math.round((MASTER - scaledMeta.height) / 2);

  // Create dark square background
  const bg = await sharp({
    create: { width: MASTER, height: MASTER, channels: 4, background: BG }
  }).png().toBuffer();

  // Composite: symbol is white-on-black; use "screen" blend or just overlay
  // We need to tint the symbol to white and composite over dark bg.
  // Strategy: since symbol is white on black, use it directly — the white areas
  // become the visible S, the black areas match the dark bg.
  const master = await sharp(bg)
    .composite([{
      input: scaledSym,
      left: offX,
      top: offY,
      blend: 'screen'    // white + dark bg = white symbol visible
    }])
    .png()
    .toBuffer();

  return master;
}

async function generate() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const master = await buildBase();
  console.log('🎨  Master 1024px bygget\n');

  // ── Numbered sizes ───────────────────────────────────────────────────────
  for (const size of SIZES) {
    const out = path.join(OUT, `icon-${size}.png`);
    await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
    console.log(`✅  icon-${size}.png`);
  }

  // ── Named aliases ────────────────────────────────────────────────────────
  for (const { size, name } of NAMED) {
    const out = path.join(OUT, name);
    await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
    console.log(`✅  ${name}  (${size}px)`);
  }

  // ── Root favicon.png ─────────────────────────────────────────────────────
  const favDest = path.join(__dirname, '../favicon.png');
  await sharp(master).resize(32, 32).png({ compressionLevel: 9 }).toFile(favDest);
  console.log('✅  favicon.png  (32px, root)');

  console.log('\n🎉  Alle ikoner gemt i', OUT);
  console.log('    Commit og push når du er klar.\n');
}

generate().catch(err => {
  console.error('\n❌  Fejl:', err.message);
  process.exit(1);
});
