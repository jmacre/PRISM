// Generates store-ready visuals from the existing app icon foreground.
//   • icon-512.png        — Play Store icon (512×512, transparent OK)
//   • icon-1024.png       — App Store icon (1024×1024, opaque, no rounded corners)
//   • feature-1024x500.png — Play Store feature graphic
//
// Usage (from repo root):
//   node store-assets/generate-visuals.mjs
//
// Sharp is already in devDependencies, so no extra install needed.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.resolve(__dirname);

const FG_PATH = path.join(
  root,
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"
);
const ICON_FULL_PATH = path.join(
  root,
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
);

if (!fs.existsSync(FG_PATH)) {
  console.error("Missing source:", FG_PATH);
  process.exit(1);
}

// ── 1. Play Store icon — 512×512, can keep transparency ────────────────────
await sharp(ICON_FULL_PATH)
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, "icon-512.png"));
console.log("✓ icon-512.png");

// ── 2. App Store icon — 1024×1024, OPAQUE (Apple rejects transparency) ─────
// Composite the full-bleed launcher icon over a dark navy bg matching the
// app's gradient, so the gem still pops without the alpha halo.
const BG = { r: 13, g: 8, b: 32, alpha: 1 }; // matches .pa top-of-gradient
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: BG },
})
  .composite([
    {
      input: await sharp(ICON_FULL_PATH).resize(1024, 1024, { fit: "cover" }).toBuffer(),
      blend: "over",
    },
  ])
  .flatten({ background: BG })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, "icon-1024.png"));
console.log("✓ icon-1024.png");

// ── 3. Play Store feature graphic — 1024×500 ───────────────────────────────
// Layout: gem on the right, "PRISM" title + tagline on the left, all over
// the same dark-purple radial-gradient background as the in-game .pa.
const featBg = await sharp({
  create: {
    width: 1024,
    height: 500,
    channels: 4,
    background: { r: 7, g: 5, b: 14, alpha: 1 },
  },
}).png().toBuffer();

// Build a radial-gradient overlay via SVG (sharp can rasterize SVG).
const grad = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <defs>
    <radialGradient id="g1" cx="32%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#2a0a4a"/>
      <stop offset="60%" stop-color="#0d0820" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#07050e" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="78%" cy="50%" r="42%">
      <stop offset="0%" stop-color="#5b2398" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#07050e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#g1)"/>
  <rect width="1024" height="500" fill="url(#g2)"/>
</svg>
`;

// Title + tagline rendered as SVG. Tagline kept short so it stays in
// the left half of the graphic — the gem occupies x≈544+ on the right.
const text = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <defs>
    <linearGradient id="prismGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff66cc"/>
      <stop offset="35%" stop-color="#aa44ff"/>
      <stop offset="65%" stop-color="#5577ff"/>
      <stop offset="100%" stop-color="#33eebb"/>
    </linearGradient>
  </defs>
  <text x="64" y="265"
        font-family="Orbitron, Arial Black, sans-serif"
        font-weight="900"
        font-size="124"
        letter-spacing="18"
        fill="url(#prismGrad)">PRISM</text>
  <text x="64" y="320"
        font-family="Orbitron, Arial Black, sans-serif"
        font-weight="700"
        font-size="28"
        letter-spacing="5"
        fill="#cc88ff"
        opacity="0.95">MATCH. CASCADE. WIN.</text>
</svg>
`;

const gemImg = await sharp(ICON_FULL_PATH).resize(440, 440, { fit: "contain" }).toBuffer();

await sharp(featBg)
  .composite([
    { input: Buffer.from(grad), blend: "over" },
    { input: gemImg, left: 1024 - 480, top: (500 - 440) / 2, blend: "over" },
    { input: Buffer.from(text), blend: "over" },
  ])
  .flatten({ background: { r: 7, g: 5, b: 14, alpha: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, "feature-1024x500.png"));
console.log("✓ feature-1024x500.png");

console.log("\nAll generated under:", out);
