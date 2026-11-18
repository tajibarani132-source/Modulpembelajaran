'use strict';
/* Kata sandi (scrypt), token sesi acak, dan pembatas percobaan masuk. */
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(password), salt, 64, SCRYPT, (err, key) => {
      if (err) return reject(err);
      resolve(['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$'));
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const opts = { N: +parts[1], r: +parts[2], p: +parts[3], maxmem: SCRYPT.maxmem };
    crypto.scrypt(String(password), salt, expected.length, opts, (err, key) => {
      resolve(!err && key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

/* hash pembanding untuk nama pengguna yang tidak ada (waktu respons tetap serupa) */
const DUMMY_HASH = ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, crypto.randomBytes(16).toString('base64'),
  crypto.scryptSync('bukan-sandi', crypto.randomBytes(16), 64, SCRYPT).toString('base64')].join('$');

const newToken = () => crypto.randomBytes(32).toString('base64url');
const newId = (bytes) => crypto.randomBytes(bytes || 9).toString('base64url');
const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* pembatas sederhana: maksimal `max` kejadian per `windowMs` untuk tiap kunci */
class Limiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.map = new Map(); }
  _get(key) {
    const now = Date.now();
    let e = this.map.get(key);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + this.windowMs }; this.map.set(key, e); }
    return e;
  }
  blocked(key) { return this._get(key).n >= this.max; }
  hit(key) { this._get(key).n++; }
  clear(key) { this.map.delete(key); }
  retryAfter(key) { return Math.max(1, Math.ceil((this._get(key).reset - Date.now()) / 1000)); }
  sweep() { const now = Date.now(); for (const [k, e] of this.map) if (e.reset <= now) this.map.delete(k); }
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, newToken, newId, tokenHash, safeEqual, Limiter };
