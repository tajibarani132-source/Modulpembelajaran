'use strict';
/*
 * Menyalin aplikasi web statis (../app) ke desktop/app sebelum aplikasi
 * desktop dijalankan (npm start) atau dibangun (npm run dist).
 * Hanya memakai modul bawaan Node (fs, path).
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..', 'app');
const DEST = path.resolve(__dirname, '..', 'app');

// Berkas sistem yang tidak perlu ikut dikemas.
const SKIP_ANYWHERE = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
// Berkas/folder alat bantu di akar app/ yang akan mengacaukan electron-builder
// (app/package.json membuat electron-builder menganggap app/ sebagai folder aplikasi).
const SKIP_AT_ROOT = new Set(['package.json', 'package-lock.json', 'node_modules']);

function fail(message) {
  console.error('[copy-app] GAGAL: ' + message);
  process.exit(1);
}

if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  fail('index.html tidak ditemukan di ' + SRC);
}
if (path.basename(DEST) !== 'app' || DEST === SRC) {
  fail('Folder tujuan tidak valid: ' + DEST);
}

fs.rmSync(DEST, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.cpSync(SRC, DEST, {
  recursive: true,
  filter(source) {
    const name = path.basename(source).toLowerCase();
    if (SKIP_ANYWHERE.has(name)) return false;
    if (path.dirname(source) === SRC && SKIP_AT_ROOT.has(name)) return false;
    return true;
  }
});

let files = 0;
let bytes = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else { files += 1; bytes += fs.statSync(full).size; }
  }
})(DEST);

console.log('[copy-app] ' + files + ' berkas (' + (bytes / 1048576).toFixed(1) + ' MB) disalin dari ' + SRC + ' ke ' + DEST);
