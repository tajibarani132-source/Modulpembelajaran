#!/usr/bin/env node
'use strict';
/*
 * Membuat paket rilis Server Pusat untuk VPS:
 *   release/modul-rps-server-<versi>.tar.gz  (+ berkas .sha256)
 * Isi: app/ (aplikasi web), server/ (beserta node_modules produksi, tanpa data & uji),
 *      deploy/install.sh, deploy/README-VPS.md, dan panduan admin/deploy.
 * Menjalankan: node deploy/buat-paket.js   (dari folder mana saja)
 * Prasyarat  : `npm install --omit=dev` sudah dijalankan di folder server/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const version = require(path.join(ROOT, 'server', 'package.json')).version;
const name = 'modul-rps-server-' + version;

function fail(msg) { console.error('[buat-paket] GAGAL: ' + msg); process.exit(1); }
if (!fs.existsSync(path.join(ROOT, 'app', 'index.html'))) fail('app/index.html tidak ditemukan');
if (!fs.existsSync(path.join(ROOT, 'server', 'node_modules', '@anthropic-ai', 'sdk', 'package.json'))) fail('server/node_modules belum ada. Jalankan: cd server && npm install --omit=dev');

const JUNK = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
const notJunk = (src) => !JUNK.has(path.basename(src).toLowerCase()) && !/\.tmp$/i.test(src);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-paket-'));
const dest = path.join(stage, name);
try {
  fs.mkdirSync(dest);
  fs.cpSync(path.join(ROOT, 'app'), path.join(dest, 'app'), { recursive: true, filter: notJunk });
  const serverSrc = path.join(ROOT, 'server');
  fs.cpSync(serverSrc, path.join(dest, 'server'), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(serverSrc, src).split(path.sep);
      return notJunk(src) && rel[0] !== 'data' && rel[0] !== 'test';
    }
  });
  fs.mkdirSync(path.join(dest, 'deploy'));
  // skrip shell wajib berakhir-baris LF agar dapat dijalankan di Linux
  const sh = fs.readFileSync(path.join(__dirname, 'install.sh'), 'utf8').replace(/\r\n/g, '\n');
  fs.writeFileSync(path.join(dest, 'deploy', 'install.sh'), sh, { mode: 0o755 });
  fs.copyFileSync(path.join(__dirname, 'README-VPS.md'), path.join(dest, 'deploy', 'README-VPS.md'));
  ['PANDUAN-ADMIN-SERVER.md', 'PANDUAN-DEPLOY.md'].forEach((f) => {
    if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  });

  // tar dijalankan di folder staging dengan path relatif (aman untuk GNU tar maupun bsdtar Windows)
  execFileSync('tar', ['-czf', name + '.tar.gz', name], { cwd: stage, stdio: 'inherit' });
  const outDir = path.join(ROOT, 'release');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, name + '.tar.gz');
  fs.copyFileSync(path.join(stage, name + '.tar.gz'), out);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  fs.writeFileSync(out + '.sha256', sha + '  ' + name + '.tar.gz\n');
  console.log('[buat-paket] ' + path.relative(ROOT, out) + ' (' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB)');
  console.log('[buat-paket] SHA-256 ' + sha);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
