// Generates extension icons (play/pause glyph on the popup's purple gradient).
// Run: npm run icons
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");

const svg = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="128" y2="128">
      <stop offset="0" stop-color="#4f7cff"/>
      <stop offset="1" stop-color="#8a5cff"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="36" fill="url(#g)"/>
  <path d="M 22 42 L 58 64 L 22 86 Z" fill="#fff"/>
  <rect x="66" y="42" width="8" height="44" rx="4" fill="#fff"/>
  <rect x="80" y="42" width="8" height="44" rx="4" fill="#fff"/>
  <!-- "!" — we control the player, forcefully -->
  <rect x="98" y="42" width="9" height="30" rx="4.5" fill="#fff"/>
  <circle cx="102.5" cy="81.5" r="5.5" fill="#fff"/>
</svg>
`;

const sizes = [16, 32, 48, 128];

await mkdir(outDir, { recursive: true });
await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(svg), { density: (72 * size) / 128 })
      .resize(size, size)
      .png()
      .toFile(resolve(outDir, `icon${size}.png`))
  )
);

console.log(`Generated ${sizes.map((s) => `icon${s}.png`).join(", ")} in public/icons/`);
