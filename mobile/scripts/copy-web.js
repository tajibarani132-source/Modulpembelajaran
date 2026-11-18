#!/usr/bin/env node
/*
 * copy-web.js — menyalin aplikasi web (folder ../app) ke mobile/www
 * sebagai isi web (webDir) aplikasi Android Capacitor.
 *
 * Langkah: hapus mobile/www lama, lalu salin seluruh isi ../app ke mobile/www.
 * Jalankan dari mana saja:  node scripts/copy-web.js   (atau: npm run copy-web)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MOBILE_DIR = path.resolve(__dirname, '..');
const SRC = path.resolve(MOBILE_DIR, '..', 'app');
const DEST = path.join(MOBILE_DIR, 'www');

function gagal(pesan) {
  console.error('[copy-web] GAGAL: ' + pesan);
  process.exit(1);
}

// Pengaman: folder tujuan harus tepat mobile/www agar tidak menghapus folder lain.
if (path.dirname(DEST) !== MOBILE_DIR || path.basename(DEST) !== 'www') {
  gagal('folder tujuan tidak valid: ' + DEST);
}
if (!fs.existsSync(path.join(SRC, 'index.html'))) {
  gagal('aplikasi web tidak ditemukan (berkas ' + path.join(SRC, 'index.html') + ' tidak ada).');
}

// 1) Hapus www lama
fs.rmSync(DEST, { recursive: true, force: true });

// 2) Salin ../app -> www (tanpa berkas sistem/sementara)
const ABAIKAN = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
fs.cpSync(SRC, DEST, {
  recursive: true,
  filter: (src) => !ABAIKAN.has(path.basename(src)) && !path.basename(src).endsWith('~')
});

// 3) Ringkasan
let jumlah = 0;
let ukuran = 0;
(function hitung(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) hitung(p);
    else { jumlah += 1; ukuran += fs.statSync(p).size; }
  }
})(DEST);

if (!fs.existsSync(path.join(DEST, 'index.html'))) gagal('index.html tidak tersalin ke ' + DEST);
console.log('[copy-web] ' + jumlah + ' berkas (' + (ukuran / 1048576).toFixed(1) + ' MB) disalin dari ' + SRC + ' ke ' + DEST);
