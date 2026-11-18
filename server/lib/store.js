'use strict';
/* Penyimpanan berkas JSON sederhana (tanpa basis data terpisah).
   Setiap tulis dilakukan atomik: tulis ke berkas sementara lalu ganti nama. */
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = Object.create(null);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'modules'), { recursive: true });
  }

  path(name) { return path.join(this.dir, name); }

  read(name, def) {
    if (name in this.cache) return this.cache[name];
    let value = def;
    const file = this.path(name);
    try {
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // berkas rusak: simpan salinannya agar tidak tertimpa diam-diam, lalu mulai dari nilai bawaan
        const backup = file + '.rusak-' + Date.now();
        try { fs.renameSync(file, backup); } catch (_) { /* abaikan */ }
        console.error('[penyimpanan] ' + name + ' tidak dapat dibaca (' + e.message + '); salinan disimpan di ' + backup);
      }
    }
    this.cache[name] = value;
    return value;
  }

  write(name, value) {
    this.cache[name] = value;
    writeAtomic(this.path(name), JSON.stringify(value, null, 1));
  }

  append(name, line) {
    fs.appendFileSync(this.path(name), line + '\n', { mode: 0o600 });
  }

  /* baris-baris terakhir sebuah berkas JSONL (untuk log & pemakaian) */
  tail(name, max) {
    let text = '';
    try { text = fs.readFileSync(this.path(name), 'utf8'); } catch (e) { return []; }
    const lines = text.split('\n').filter(Boolean);
    const out = [];
    for (let i = Math.max(0, lines.length - max); i < lines.length; i++) {
      try { out.push(JSON.parse(lines[i])); } catch (e) { /* baris rusak dilewati */ }
    }
    return out;
  }

  moduleDir(id) { return path.join(this.dir, 'modules', id); }
}

function writeAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // Windows: berkas tujuan kadang terkunci sesaat (antivirus/pengindeks) -> tulis langsung
    fs.writeFileSync(file, data, { mode: 0o600 });
    try { fs.unlinkSync(tmp); } catch (_) { /* abaikan */ }
  }
}

module.exports = { Store, writeAtomic };
