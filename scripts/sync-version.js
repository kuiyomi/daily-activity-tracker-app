#!/usr/bin/env node

/**
 * sync-version.js – Keeps package.json in sync with the single source of truth (src/version.js).
 *
 * Usage:
 *   node scripts/sync-version.js             # Updates package.json from src/version.js
 *   node scripts/sync-version.js --from-pkg  # Updates src/version.js from package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const versionJsPath = path.join(rootDir, 'src', 'version.js');
const pkgPath = path.join(rootDir, 'package.json');

const args = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (args.includes('--from-pkg')) {
  // Sync from package.json to src/version.js
  const newContent = `/**
 * src/version.js – Single source of truth for the application version.
 *
 * Plain script without export syntax so it can be loaded in classic script
 * contexts (sw.js via importScripts) and module contexts (side-effect import).
 */

self.APP_VERSION = '${pkg.version}';
`;
  fs.writeFileSync(versionJsPath, newContent, 'utf8');
  console.log(`Synced src/version.js to package.json version: ${pkg.version}`);
} else {
  // Default: Sync from src/version.js to package.json
  const versionJsContent = fs.readFileSync(versionJsPath, 'utf8');
  const match = versionJsContent.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);

  if (!match) {
    console.error('Could not find APP_VERSION in src/version.js');
    process.exit(1);
  }

  const version = match[1];
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`Updated package.json version to ${version}`);
  } else {
    console.log(`package.json is already in sync with src/version.js (${version})`);
  }
}
