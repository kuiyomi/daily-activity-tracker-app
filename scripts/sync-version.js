#!/usr/bin/env node

/**
 * sync-version.js – Keeps package.json, manifest.webmanifest, and sw.js in sync with the single source of truth (src/version.js).
 *
 * Usage:
 *   node scripts/sync-version.js             # Updates package.json, manifest, and sw.js from src/version.js
 *   node scripts/sync-version.js --from-pkg  # Updates src/version.js and sw.js from package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const versionJsPath = path.join(rootDir, 'src', 'version.js');
const pkgPath = path.join(rootDir, 'package.json');
const manifestPath = path.join(rootDir, 'manifest.webmanifest');
const swPath = path.join(rootDir, 'sw.js');

const args = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function syncSwFile(version) {
  if (!fs.existsSync(swPath)) return;
  const swContent = fs.readFileSync(swPath, 'utf8');
  const swVersionMatch = swContent.match(/const\s+SW_VERSION\s*=\s*['"]([^'"]+)['"];/);

  if (swVersionMatch && swVersionMatch[1] !== version) {
    const updatedSw = swContent.replace(
      /const\s+SW_VERSION\s*=\s*['"][^'"]+['"];/,
      `const SW_VERSION = '${version}';`
    );
    fs.writeFileSync(swPath, updatedSw, 'utf8');
    console.log(`Updated sw.js SW_VERSION to ${version}`);
  } else if (!swVersionMatch) {
    console.warn('Warning: Could not find const SW_VERSION in sw.js');
  } else {
    console.log(`sw.js is already in sync with SW_VERSION (${version})`);
  }
}

if (args.includes('--from-pkg')) {
  // Sync from package.json to src/version.js and sw.js
  const existingContent = fs.existsSync(versionJsPath) ? fs.readFileSync(versionJsPath, 'utf8') : '';
  const appNameMatch = existingContent.match(/APP_NAME\s*=\s*['"]([^'"]+)['"]/);
  const appName = appNameMatch ? appNameMatch[1] : 'Agenda';

  const newContent = `/**
 * src/version.js – Single source of truth for the application version and identity.
 *
 * Plain script without export syntax so it can be loaded in classic script
 * contexts (sw.js via importScripts) and module contexts (side-effect import).
 */

self.APP_VERSION = '${pkg.version}';
self.APP_NAME = '${appName}';
`;
  fs.writeFileSync(versionJsPath, newContent, 'utf8');
  console.log(`Synced src/version.js to package.json version: ${pkg.version}`);
  syncSwFile(pkg.version);
} else {
  // Default: Sync from src/version.js to package.json, manifest.webmanifest, and sw.js
  const versionJsContent = fs.readFileSync(versionJsPath, 'utf8');
  const versionMatch = versionJsContent.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const nameMatch = versionJsContent.match(/APP_NAME\s*=\s*['"]([^'"]+)['"]/);

  if (!versionMatch) {
    console.error('Could not find APP_VERSION in src/version.js');
    process.exit(1);
  }

  const version = versionMatch[1];
  const appName = nameMatch ? nameMatch[1] : 'Agenda';

  // Sync package.json
  let pkgChanged = false;
  if (pkg.version !== version) {
    pkg.version = version;
    pkgChanged = true;
  }
  if (pkgChanged) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`Updated package.json version to ${version}`);
  } else {
    console.log(`package.json is already in sync with src/version.js (${version})`);
  }

  // Sync manifest.webmanifest
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== appName || manifest.short_name !== appName) {
      manifest.name = appName;
      manifest.short_name = appName;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      console.log(`Updated manifest.webmanifest name and short_name to ${appName}`);
    } else {
      console.log(`manifest.webmanifest is already in sync with APP_NAME (${appName})`);
    }
  }

  // Sync sw.js (stamps SW_VERSION directly into sw.js)
  syncSwFile(version);
}
