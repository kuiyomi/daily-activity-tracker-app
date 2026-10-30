#!/usr/bin/env node

/**
 * generate-icons.js – One-off dev script to generate app icons.
 * Generates a white Phosphor calendar glyph on full-bleed iOS-blue (#007AFF) square.
 * Uses macOS built-in QuickLook (qlmanage) and sips for rasterization with zero npm dependencies.
 *
 * Outputs:
 *   - icons/icon-180.png (Apple touch icon)
 *   - icons/icon-192.png (PWA manifest icon)
 *   - icons/icon-512.png (PWA manifest icon)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Phosphor calendar-blank path (viewBox 0 0 256 256)
const CALENDAR_PATH =
  'M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z';

// Full-bleed 512x512 SVG with centered white glyph (288x288, scale 1.125, margin 112px = safe inside maskable zone)
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#007AFF"/>
  <g transform="translate(112, 112) scale(1.125)" fill="#FFFFFF">
    <path d="${CALENDAR_PATH}"/>
  </g>
</svg>
`;

const tempSvgPath = path.join(iconsDir, 'temp-icon.svg');
fs.writeFileSync(tempSvgPath, svgContent, 'utf8');

try {
  console.log('Rendering 512x512 PNG via macOS QuickLook...');
  execSync(`qlmanage -t -s 512 -o "${iconsDir}" "${tempSvgPath}" 2>/dev/null`);

  const qlRendered = path.join(iconsDir, 'temp-icon.svg.png');
  const icon512 = path.join(iconsDir, 'icon-512.png');
  const icon192 = path.join(iconsDir, 'icon-192.png');
  const icon180 = path.join(iconsDir, 'icon-180.png');

  // Resize using macOS sips
  execSync(`sips -z 512 512 "${qlRendered}" --out "${icon512}" 2>/dev/null`);
  execSync(`sips -z 192 192 "${icon512}" --out "${icon192}" 2>/dev/null`);
  execSync(`sips -z 180 180 "${icon512}" --out "${icon180}" 2>/dev/null`);

  // Clean up temporary files
  if (fs.existsSync(tempSvgPath)) fs.unlinkSync(tempSvgPath);
  if (fs.existsSync(qlRendered)) fs.unlinkSync(qlRendered);

  console.log('✅ Generated icons successfully:');
  console.log('   - icons/icon-180.png');
  console.log('   - icons/icon-192.png');
  console.log('   - icons/icon-512.png');
} catch (err) {
  console.error('Failed to generate PNGs with native tools:', err);
  process.exit(1);
}
