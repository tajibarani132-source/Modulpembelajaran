'use strict';
/*
 * Server Pusat Modul RPS — IAIN Parepare
 * Menghubungkan aplikasi Modul RPS milik para dosen ke satu server yang dikendalikan admin:
 *  - akun dosen (dibuat admin atau mendaftar lalu disetujui admin),
 *  - kunci API Claude disimpan di server (dosen tidak perlu kunci sendiri) dengan kuota biaya per dosen,
 *  - bank modul: proyek, PDF, dan Word tersimpan di server,
 *  - pengaturan bersama (institusi, logo, daftar fakultas/prodi, pengumuman),
 *  - pemantauan pengguna yang sedang terhubung, pemakaian AI, dan log kejadian.
 *
 * Menjalankan:  node server.js [--port 8090] [--host 0.0.0.0] [--data ./data] [--app ../app]
 *               [--origins *] [--trust-proxy 1] [--cert sertifikat.pem --key kunci.pem]
 * Panel admin:  http://<alamat-server>:<port>/admin/
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Store, writeAtomic } = require('./lib/store');
const auth = require('./lib/auth');
const claude = require('./lib/claude');
const VERSION = require('./package.json').version;

/* ---------------- konfigurasi ---------------- */
function arg(name, env, def) {
  const i = process.argv.indexOf('--' + name);
  if (i > 0 && process.argv[i + 1] && !/^--/.test(process.argv[i + 1])) return process.argv[i + 1];
  if (process.env[env]) return process.env[env];
  return def;
}
const CFG = {
  port: parseInt(arg('port', 'PORT', '8090'), 10),
  host: arg('host', 'HOST', '0.0.0.0'),
  dataDir: path.resolve(arg('data', 'DATA_DIR', path.join(__dirname, 'data'))),
  appDir: path.resolve(arg('app', 'APP_DIR', path.join(__dirname, '..', 'app'))),
  origins: String(arg('origins', 'ALLOWED_ORIGINS', '*')).split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: /^(1|true|ya|yes)$/i.test(String(arg('trust-proxy', 'TRUST_PROXY', '0'))),
  cert: arg('cert', 'TLS_CERT', ''),
  key: arg('key', 'TLS_KEY', ''),
  // hanya untuk pengujian (mis. server tiruan); kosongkan pada pemakaian nyata
  anthropicBaseURL: arg('anthropic-base-url', 'ANTHROPIC_BASE_URL', '')
};
const ADMIN_DIR = path.join(__dirname, 'admin');
const store = new Store(CFG.dataDir);

const DEFAULT_SETTINGS = {
  serverName: 'Server Pusat Modul RPS',
  institution: 'INSTITUT AGAMA ISLAM NEGERI (IAIN) PAREPARE',
  kota: 'Parepare',
  announcement: '',
  registration: 'approval', // 'approval' = dosen boleh mendaftar lalu disetujui admin; 'closed' = hanya admin yang membuat akun
  sharing: true,
  catalog: null, // { "Fakultas …": ["Prodi …"] }; null = daftar bawaan aplikasi
  logo: null, // { file, v }
  ai: {
    enabled: true,
    defaultModel: 'claude-opus-5-5',
    allowedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    defaultEffort: 'medium',
    defaultQuotaUsd: 5, // batas biaya per dosen per bulan; 0 = tanpa batas
    maxTokensCap: 64000,
    maxConcurrent: 4,
    allowPersonalKey: true,
    allowLocal: true
  }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function settings() {
  const s = store.read('settings.json', null) || {};
  const out = Object.assign(clone(DEFAULT_SETTINGS), s);
  out.ai = Object.assign(clone(DEFAULT_SETTINGS.ai), s.ai || {});
  return out;
}
function saveSettings(s) { store.write('settings.json', s); }

/* ---------------- pengguna & sesi ---------------- */
const users = () => store.read('users.json', []);
const saveUsers = () => store.write('users.json', users());
const findUser = (id) => users().find((u) => u.id === id);
const normUser = (s) => String(s || '').trim().toLowerCase();
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function publicUser(u, withUsage) {
  const o = { id: u.id, username: u.username, name: u.name, role: u.role, status: u.status, fakultas: u.fakultas || '', prodi: u.prodi || '', createdAt: u.createdAt, lastLogin: u.lastLogin || null, quotaUsd: u.quotaUsd == null ? null : u.quotaUsd, aiAllowed: u.aiAllowed !== false };
  if (withUsage) o.usage = usageOf(u.id);
  return o;
}

const sessions = () => store.read('sessions.json', {});
let sessionsDirty = false;
const TTL = { admin: 12 * 3600 * 1000, dosen: 30 * 24 * 3600 * 1000 };
function createSession(user, c) {
  const token = auth.newToken(), now = Date.now();
  const ttl = TTL[user.role] || TTL.dosen;
  sessions()[auth.tokenHash(token)] = { uid: user.id, created: now, seen: now, exp: now + ttl, ip: c.ip, ua: String(c.req.headers['user-agent'] || '').slice(0, 200), client: {} };
  store.write('sessions.json', sessions());
  return { token: token, expiresAt: new Date(now + ttl).toISOString() };
}
function sessionFor(token) {
  if (!token) return null;
  const h = auth.tokenHash(token), all = sessions(), s = all[h];
  if (!s) return null;
  const now = Date.now();
  if (s.exp < now) { delete all[h]; sessionsDirty = true; return null; }
  const u = findUser(s.uid);
  if (!u || u.status !== 'active') return null;
  s.seen = now; s.exp = now + (TTL[u.role] || TTL.dosen); sessionsDirty = true;
  return { hash: h, sess: s, user: u };
}
function revokeSessions(uid, keepHash) {
  const all = sessions();
  Object.keys(all).forEach((h) => { if (all[h].uid === uid && h !== keepHash) delete all[h]; });
  store.write('sessions.json', all);
}
setInterval(() => {
  const all = sessions(), now = Date.now();
  Object.keys(all).forEach((h) => { if (all[h].exp < now) { delete all[h]; sessionsDirty = true; } });
  if (sessionsDirty) { sessionsDirty = false; store.write('sessions.json', all); }
  loginIpLimiter.sweep(); loginUserLimiter.sweep(); registerLimiter.sweep();
}, 30000).unref();

const loginIpLimiter = new auth.Limiter(20, 15 * 60 * 1000);
const loginUserLimiter = new auth.Limiter(6, 15 * 60 * 1000);
const registerLimiter = new auth.Limiter(5, 60 * 60 * 1000);

/* ---------------- log kejadian ---------------- */
const EVENTS = store.tail('events.jsonl', 400);
function logEvent(type, user, detail, ip) {
  const e = { t: new Date().toISOString(), type: type, user: user ? user.username : '', detail: String(detail || '').slice(0, 300), ip: ip || '' };
  EVENTS.push(e); while (EVENTS.length > 400) EVENTS.shift();
  try { store.append('events.jsonl', JSON.stringify(e)); } catch (err) { /* abaikan */ }
}

/* ---------------- pemakaian AI & kuota ---------------- */
function monthKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
const EMPTY_USAGE = { requests: 0, errors: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0 };
function usageOf(uid, month) {
  const s = store.read('usage-summary.json', {});
  return Object.assign({}, EMPTY_USAGE, (s[month || monthKey()] || {})[uid] || {});
}
function recordUsage(user, model, u, ok, ms, err) {
  u = u || {};
  const usd = claude.estimateCost(model, u);
  const rec = { t: new Date().toISOString(), u: user.id, m: model, in: u.input_tokens || 0, out: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0, usd: +usd.toFixed(6), ok: !!ok, ms: ms };
  if (!ok && err) rec.err = String(err).slice(0, 200);
  try { store.append('usage.jsonl', JSON.stringify(rec)); } catch (e) { /* abaikan */ }
  const sum = store.read('usage-summary.json', {});
  const mk = monthKey();
  const mm = sum[mk] = sum[mk] || {};
  const x = mm[user.id] = Object.assign({}, EMPTY_USAGE, mm[user.id] || {});
  x.requests++; if (!ok) x.errors++;
  x.input += rec.in; x.output += rec.out; x.cacheRead += rec.cr; x.cacheWrite += rec.cw;
  x.usd = +(x.usd + rec.usd).toFixed(6);
  store.write('usage-summary.json', sum);
  if (!ok && err && !/Dibatalkan/.test(err)) logEvent('ai_gagal', user, model + ': ' + err);
}
function quotaFor(user) {
  if (user.quotaUsd !== null && user.quotaUsd !== undefined && user.quotaUsd !== '') return Math.max(0, +user.quotaUsd || 0);
  return Math.max(0, +settings().ai.defaultQuotaUsd || 0);
}
function apiKey() {
  const sec = store.read('secret.json', {});
  return sec.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
}
function keyInfo() {
  const sec = store.read('secret.json', {});
  const k = sec.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  return { hasKey: !!k, keyHint: k ? '…' + k.slice(-4) : '', keySource: sec.anthropicApiKey ? 'panel' : (process.env.ANTHROPIC_API_KEY ? 'env' : '') };
}
function aiPolicy() {
  const a = settings().ai;
  return { allowedModels: a.allowedModels.filter((m) => claude.KNOWN_MODELS.indexOf(m) >= 0), maxTokensCap: a.maxTokensCap, maxConcurrent: a.maxConcurrent };
}
function aiState(user) {
  const a = settings().ai, key = apiKey();
  const limit = quotaFor(user), used = usageOf(user.id).usd;
  let reason = '';
  if (!a.enabled) reason = 'AI pusat dinonaktifkan admin.';
  else if (!key) reason = 'Kunci API Claude belum diatur admin.';
  else if (user.aiAllowed === false) reason = 'Akun Anda tidak diizinkan memakai AI pusat.';
  else if (limit > 0 && used >= limit) reason = 'Kuota AI bulan ini habis.';
  return {
    central: !!(a.enabled && key && user.aiAllowed !== false), reason: reason,
    models: aiPolicy().allowedModels, defaultModel: a.defaultModel, defaultEffort: a.defaultEffort,
    allowPersonalKey: a.allowPersonalKey !== false, allowLocal: a.allowLocal !== false,
    quotaUsd: limit, usedUsd: +used.toFixed(4), remainingUsd: limit > 0 ? +Math.max(0, limit - used).toFixed(4) : null
  };
}

/* ---------------- penyiapan admin pertama ---------------- */
let SETUP_TOKEN = null;
function ensureSetup() {
  const file = store.path('setup-token.txt');
  if (users().some((u) => u.role === 'admin' && u.status === 'active')) {
    SETUP_TOKEN = null;
    try { fs.unlinkSync(file); } catch (e) { /* tidak ada */ }
    return;
  }
  let tok = '';
  try { tok = fs.readFileSync(file, 'utf8').trim(); } catch (e) { /* belum ada */ }
  if (!tok) { tok = auth.newToken(); writeAtomic(file, tok); }
  SETUP_TOKEN = tok;
}

/* ---------------- HTTP: utilitas ---------------- */
function httpErr(status, code, message, retryAfter) { const e = new Error(message); e.status = status; e.code = code; e.retryAfter = retryAfter; return e; }
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const ADMIN_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Frame-Options': 'DENY'
};
function sendJson(res, status, obj, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SEC_HEADERS, headers || {}));
  res.end(JSON.stringify(obj));
}
function clientIp(req) {
  if (CFG.trustProxy) { const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (xf) return xf; }
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
function bearer(req) { const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i); return m ? m[1] : ''; }
function fmtMB(n) { return Math.round(n / 1048576) + ' MB'; }
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    if (parseInt(req.headers['content-length'] || '0', 10) > limit) return reject(httpErr(413, 'terlalu_besar', 'Data terlalu besar (maksimal ' + fmtMB(limit) + ').'));
    const chunks = []; let size = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; reject(httpErr(413, 'terlalu_besar', 'Data terlalu besar (maksimal ' + fmtMB(limit) + ').')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
async function readJson(req, limit) {
  const buf = await readRaw(req, limit || 1024 * 1024);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw httpErr(400, 'json', 'Format data tidak valid (JSON).'); }
}
function receiveFile(req, dest, limit) {
  return new Promise((resolve, reject) => {
    if (parseInt(req.headers['content-length'] || '0', 10) > limit) return reject(httpErr(413, 'terlalu_besar', 'Berkas terlalu besar (maksimal ' + fmtMB(limit) + ').'));
    const tmp = dest + '.unggah-' + Date.now();
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    let size = 0, failed = false;
    const fail = (e) => { if (failed) return; failed = true; out.destroy(); fs.unlink(tmp, () => {}); reject(e); };
    req.on('data', (c) => { size += c.length; if (size > limit) { fail(httpErr(413, 'terlalu_besar', 'Berkas terlalu besar (maksimal ' + fmtMB(limit) + ').')); req.destroy(); } });
    req.on('error', fail);
    req.on('aborted', () => fail(httpErr(400, 'terputus', 'Unggahan terputus.')));
    out.on('error', fail);
    out.on('finish', () => {
      if (failed) return;
      try { fs.renameSync(tmp, dest); } catch (e) { try { fs.copyFileSync(tmp, dest); fs.unlinkSync(tmp); } catch (e2) { return reject(e2); } }
      resolve(size);
    });
    req.pipe(out);
  });
}
function readHead(file, n) {
  const fd = fs.openSync(file, 'r');
  try { const b = Buffer.alloc(n); const r = fs.readSync(fd, b, 0, n, 0); return b.slice(0, r); } finally { fs.closeSync(fd); }
}
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);

/* ---------------- berkas statis ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg)/;
function notFound(req, res) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS)); res.end('Tidak ditemukan'); }
function serveFile(req, res, file, extra, download) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const gz = !download && st.size > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (gz) etag = etag.slice(0, -1) + '-gz"';
    const headers = Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'ETag': etag, 'Last-Modified': st.mtime.toUTCString(), 'Vary': 'Accept-Encoding' }, SEC_HEADERS, extra || {});
    if (download) headers['Content-Disposition'] = download;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    if (gz) headers['Content-Encoding'] = 'gzip'; else headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(file).on('error', () => res.destroy());
    if (gz) rs.pipe(zlib.createGzip({ level: 6 })).pipe(res); else rs.pipe(res);
  });
}
function serveStatic(req, res, root, rel, extra) {
  let p;
  try { p = decodeURIComponent(rel); } catch (e) { return notFound(req, res); }
  if (p.indexOf('\0') >= 0) return notFound(req, res);
  const file = path.resolve(root, '.' + path.posix.normalize('/' + p.replace(/\\/g, '/')));
  if (file !== root && file.indexOf(root + path.sep) !== 0) return notFound(req, res);
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) return serveFile(req, res, path.join(file, 'index.html'), extra);
    serveFile(req, res, file, extra);
  });
}
function attachmentName(base, ext) {
  const name = (String(base || 'Modul').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Modul') + '.' + ext;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

/* ---------------- router API ---------------- */
const routes = [];
function route(method, pattern, handler, opts) { routes.push({ method: method, re: new RegExp('^' + pattern + '$'), handler: handler, opts: opts || {} }); }

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  const allow = CFG.origins.indexOf('*') >= 0 ? '*' : (CFG.origins.indexOf(origin) >= 0 ? origin : null);
  if (!allow) return {};
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Expose-Headers': 'Retry-After, Content-Disposition, request-id', 'Vary': 'Origin' };
}

async function handleApi(req, res, url) {
  const cors = corsHeaders(req);
  Object.keys(cors).forEach((k) => res.setHeader(k, cors[k]));
  if (req.method === 'OPTIONS') {
    const asked = String(req.headers['access-control-request-headers'] || '').replace(/[^a-z0-9,\- ]/gi, '').slice(0, 1000);
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': asked || 'content-type, authorization', 'Access-Control-Max-Age': '600' });
    return res.end();
  }
  let r = null, m = null;
  for (const x of routes) { if (x.method === req.method && (m = x.re.exec(url.pathname))) { r = x; break; } }
  if (!r) return sendJson(res, 404, { error: { code: 'tidak_ada', message: 'Alamat API tidak dikenal.' } });
  const c = { req: req, res: res, url: url, ip: clientIp(req), params: m.slice(1) };
  try {
    if (r.opts.ai) return await r.handler(c); // proksi AI menangani sesi & galatnya sendiri (format Anthropic)
    if (r.opts.auth !== false) {
      const s = sessionFor(bearer(req));
      if (!s) throw httpErr(401, 'sesi', 'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.');
      c.user = s.user; c.session = s.sess; c.sessionHash = s.hash;
      if (r.opts.admin && c.user.role !== 'admin') throw httpErr(403, 'bukan_admin', 'Hanya admin yang dapat mengakses fitur ini.');
    }
    if (r.opts.body === 'json') c.body = await readJson(req, r.opts.limit);
    const out = await r.handler(c);
    if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
  } catch (e) {
    if (res.headersSent) { res.destroy(); return; }
    if (e.status) {
      const h = {};
      if (e.status === 413) h.Connection = 'close';
      if (e.retryAfter) h['Retry-After'] = String(e.retryAfter);
      sendJson(res, e.status, { error: { code: e.code, message: e.message } }, h);
    } else {
      console.error('[api] ' + req.method + ' ' + url.pathname + ': ' + (e && e.stack || e));
      sendJson(res, 500, { error: { code: 'internal', message: 'Terjadi kesalahan pada server.' } });
    }
  }
}

/* ---------------- API publik ---------------- */
function publicConfig() {
  const s = settings();
  return {
    server: 'modul-rps', version: VERSION, name: s.serverName, institution: s.institution, kota: s.kota,
    registration: s.registration, sharing: s.sharing, setupRequired: !!SETUP_TOKEN,
    logo: s.logo ? 'api/assets/logo?v=' + s.logo.v : null
  };
}
route('GET', '/api/config', () => publicConfig(), { auth: false });
route('GET', '/api/health', () => ({ ok: true, version: VERSION, time: new Date().toISOString() }), { auth: false });
route('GET', '/api/assets/logo', (c) => {
  const s = settings();
  if (!s.logo || !s.logo.file) return notFound(c.req, c.res);
  serveFile(c.req, c.res, store.path(s.logo.file), { 'Cache-Control': 'public, max-age=300' });
}, { auth: false });

async function validatePassword(pw) {
  pw = String(pw || '');
  if (pw.length < 8) throw httpErr(400, 'sandi_lemah', 'Kata sandi minimal 8 karakter.');
  if (pw.length > 200) throw httpErr(400, 'sandi_panjang', 'Kata sandi terlalu panjang.');
  return auth.hashPassword(pw);
}

route('POST', '/api/setup', async (c) => {
  if (!SETUP_TOKEN) throw httpErr(409, 'sudah_siap', 'Akun admin sudah dibuat. Silakan masuk.');
  const b = c.body || {};
  if (!auth.safeEqual(String(b.setupToken || ''), SETUP_TOKEN)) throw httpErr(403, 'token_salah', 'Kode penyiapan tidak cocok. Lihat kode di konsol server atau berkas setup-token.txt di folder data.');
  const username = normUser(b.username);
  if (!USERNAME_RE.test(username)) throw httpErr(400, 'nama_pengguna', 'Nama pengguna 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  const now = new Date().toISOString();
  const user = { id: auth.newId(), username: username, name: str(b.name, 80) || username, role: 'admin', status: 'active', pass: await validatePassword(b.password), createdAt: now, lastLogin: now, aiAllowed: true, quotaUsd: 0 };
  if (users().some((u) => u.username === username)) throw httpErr(409, 'ada', 'Nama pengguna sudah dipakai.');
  users().push(user); saveUsers();
  ensureSetup();
  logEvent('admin_dibuat', user, 'penyiapan awal', c.ip);
  const s = createSession(user, c);
  return { token: s.token, expiresAt: s.expiresAt, user: publicUser(user) };
}, { auth: false, body: 'json' });

route('POST', '/api/auth/login', async (c) => {
  const b = c.body || {};
  const username = normUser(b.username);
  if (loginIpLimiter.blocked(c.ip) || loginUserLimiter.blocked(username)) {
    throw httpErr(429, 'terlalu_sering', 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.', Math.max(loginIpLimiter.retryAfter(c.ip), loginUserLimiter.retryAfter(username)));
  }
  const user = users().find((u) => u.username === username);
  const ok = await auth.verifyPassword(String(b.password || ''), user ? user.pass : auth.DUMMY_HASH);
  if (!user || !ok) {
    loginIpLimiter.hit(c.ip); loginUserLimiter.hit(username);
    logEvent('login_gagal', null, username, c.ip);
    throw httpErr(401, 'login_gagal', 'Nama pengguna atau kata sandi salah.');
  }
  if (user.status === 'pending') throw httpErr(403, 'menunggu', 'Akun Anda masih menunggu persetujuan admin.');
  if (user.status !== 'active') throw httpErr(403, 'nonaktif', 'Akun Anda dinonaktifkan. Hubungi admin server pusat.');
  loginUserLimiter.clear(username);
  user.lastLogin = new Date().toISOString(); saveUsers();
  const s = createSession(user, c);
  logEvent('login', user, String(b.client || '').slice(0, 40), c.ip);
  return { token: s.token, expiresAt: s.expiresAt, user: publicUser(user) };
}, { auth: false, body: 'json' });

route('POST', '/api/auth/register', async (c) => {
  if (settings().registration !== 'approval') throw httpErr(403, 'tertutup', 'Pendaftaran mandiri ditutup. Minta admin membuatkan akun.');
  if (registerLimiter.blocked(c.ip)) throw httpErr(429, 'terlalu_sering', 'Terlalu banyak pendaftaran dari alamat ini. Coba lagi nanti.', registerLimiter.retryAfter(c.ip));
  const b = c.body || {};
  const username = normUser(b.username);
  if (!USERNAME_RE.test(username)) throw httpErr(400, 'nama_pengguna', 'Nama pengguna 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  const name = str(b.name, 80);
  if (name.length < 3) throw httpErr(400, 'nama', 'Isi nama lengkap.');
  if (users().some((u) => u.username === username)) throw httpErr(409, 'ada', 'Nama pengguna sudah dipakai. Pilih yang lain.');
  const user = { id: auth.newId(), username: username, name: name, role: 'dosen', status: 'pending', pass: await validatePassword(b.password), fakultas: str(b.fakultas, 120), prodi: str(b.prodi, 120), createdAt: new Date().toISOString(), aiAllowed: true, quotaUsd: null };
  registerLimiter.hit(c.ip);
  users().push(user); saveUsers();
  logEvent('daftar', user, user.prodi, c.ip);
  return { ok: true, pending: true };
}, { auth: false, body: 'json' });

route('POST', '/api/auth/logout', (c) => {
  delete sessions()[c.sessionHash]; store.write('sessions.json', sessions());
  return { ok: true };
});

/* ---------------- akun sendiri ---------------- */
function meResponse(c) {
  const s = settings();
  return {
    user: publicUser(c.user),
    server: { name: s.serverName, institution: s.institution, kota: s.kota, announcement: s.announcement, version: VERSION, sharing: s.sharing },
    ai: aiState(c.user),
    catalog: s.catalog,
    logo: s.logo ? 'api/assets/logo?v=' + s.logo.v : null
  };
}
route('GET', '/api/me', (c) => meResponse(c));
route('POST', '/api/me/password', async (c) => {
  const b = c.body || {};
  if (!(await auth.verifyPassword(String(b.oldPassword || ''), c.user.pass))) throw httpErr(403, 'sandi_salah', 'Kata sandi lama salah.');
  c.user.pass = await validatePassword(b.newPassword);
  saveUsers();
  revokeSessions(c.user.id, c.sessionHash);
  logEvent('ganti_sandi', c.user, '', c.ip);
  return { ok: true };
}, { body: 'json' });
route('POST', '/api/heartbeat', (c) => {
  const b = c.body || {};
  c.session.client = { app: str(b.app, 20), version: str(b.version, 20), page: str(b.page, 40), project: str(b.project, 120) };
  const s = settings();
  return { ok: true, announcement: s.announcement, ai: aiState(c.user), time: new Date().toISOString() };
}, { body: 'json', limit: 8192 });

/* ---------------- bank modul ---------------- */
const MOD_FILES = {
  'module.pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46], limit: 80 * 1048576 },
  'module.docx': { ext: 'docx', magic: [0x50, 0x4b, 0x03, 0x04], limit: 80 * 1048576 }
};
const ID_RE = '([A-Za-z0-9_-]{8,40})';
const modIndex = () => store.read('modules.json', {});
const saveModIndex = () => store.write('modules.json', modIndex());
function canRead(user, meta) { return user.role === 'admin' || meta.ownerId === user.id || (meta.visibility === 'shared' && settings().sharing); }
function canWrite(user, meta) { return user.role === 'admin' || meta.ownerId === user.id; }
function getMeta(id, user, write) {
  const meta = modIndex()[id];
  if (!meta || !(write ? canWrite(user, meta) : canRead(user, meta))) throw httpErr(404, 'modul_tidak_ada', 'Modul tidak ditemukan atau Anda tidak berhak mengaksesnya.');
  return meta;
}
function cleanMeta(i) {
  i = i || {};
  return {
    mataKuliah: str(i.mataKuliah, 160), kode: str(i.kode, 40), fakultas: str(i.fakultas, 160), prodi: str(i.prodi, 160),
    dosen: str(i.dosen, 160), semester: str(i.semester, 20), sks: str(i.sks, 10), tahun: str(i.tahun, 40),
    pages: Math.max(0, parseInt(i.pages, 10) || 0) || null, meetings: Math.max(0, parseInt(i.meetings, 10) || 0) || null, engine: str(i.engine, 60)
  };
}
function validProject(p) { return p && typeof p === 'object' && !Array.isArray(p) && p.ident && typeof p.ident === 'object' && p.options && typeof p.options === 'object'; }
function moduleOut(meta) { return Object.assign({}, meta); }

route('GET', '/api/modules', (c) => {
  const scope = c.url.searchParams.get('scope') || 'mine';
  const all = Object.keys(modIndex()).map((k) => modIndex()[k]);
  let list;
  if (scope === 'all') { if (c.user.role !== 'admin') throw httpErr(403, 'bukan_admin', 'Hanya admin.'); list = all; }
  else if (scope === 'shared') list = settings().sharing ? all.filter((m) => m.visibility === 'shared') : [];
  else list = all.filter((m) => m.ownerId === c.user.id);
  list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { modules: list.map(moduleOut) };
});
const MAX_MODULES_PER_USER = 500;
route('POST', '/api/modules', (c) => {
  const b = c.body || {};
  if (b.project !== undefined && !validProject(b.project)) throw httpErr(400, 'proyek', 'Data proyek tidak valid.');
  const owned = Object.keys(modIndex()).filter((k) => modIndex()[k].ownerId === c.user.id).length;
  if (owned >= MAX_MODULES_PER_USER) throw httpErr(403, 'batas_modul', 'Jumlah modul Anda di server sudah mencapai batas (' + MAX_MODULES_PER_USER + '). Hapus modul lama terlebih dahulu.');
  const id = auth.newId(9), now = new Date().toISOString();
  fs.mkdirSync(store.moduleDir(id), { recursive: true });
  if (b.project) writeAtomic(path.join(store.moduleDir(id), 'project.json'), JSON.stringify(b.project));
  const meta = Object.assign({ id: id, ownerId: c.user.id, ownerName: c.user.name, ownerUsername: c.user.username }, cleanMeta(b.meta), {
    visibility: b.visibility === 'shared' ? 'shared' : 'private', createdAt: now, updatedAt: now, files: {}, hasProject: !!b.project
  });
  modIndex()[id] = meta; saveModIndex();
  logEvent('modul_baru', c.user, meta.mataKuliah, c.ip);
  return { module: moduleOut(meta) };
}, { body: 'json', limit: 30 * 1048576 });
route('GET', '/api/modules/' + ID_RE, (c) => {
  const meta = getMeta(c.params[0], c.user, false);
  let project = null;
  if (meta.hasProject) { try { project = JSON.parse(fs.readFileSync(path.join(store.moduleDir(meta.id), 'project.json'), 'utf8')); } catch (e) { project = null; } }
  return { module: moduleOut(meta), project: project };
});
route('PUT', '/api/modules/' + ID_RE, (c) => {
  const meta = getMeta(c.params[0], c.user, true), b = c.body || {};
  if (b.project !== undefined) {
    if (!validProject(b.project)) throw httpErr(400, 'proyek', 'Data proyek tidak valid.');
    fs.mkdirSync(store.moduleDir(meta.id), { recursive: true });
    writeAtomic(path.join(store.moduleDir(meta.id), 'project.json'), JSON.stringify(b.project));
    meta.hasProject = true;
  }
  if (b.meta) Object.assign(meta, cleanMeta(b.meta));
  if (b.visibility) meta.visibility = b.visibility === 'shared' ? 'shared' : 'private';
  meta.updatedAt = new Date().toISOString();
  saveModIndex();
  return { module: moduleOut(meta) };
}, { body: 'json', limit: 30 * 1048576 });
route('DELETE', '/api/modules/' + ID_RE, (c) => {
  const meta = getMeta(c.params[0], c.user, true);
  fs.rmSync(store.moduleDir(meta.id), { recursive: true, force: true });
  delete modIndex()[meta.id]; saveModIndex();
  logEvent('modul_hapus', c.user, meta.mataKuliah, c.ip);
  return { ok: true };
});
route('PUT', '/api/modules/' + ID_RE + '/files/(module\\.pdf|module\\.docx)', async (c) => {
  const meta = getMeta(c.params[0], c.user, true), name = c.params[1], spec = MOD_FILES[name];
  fs.mkdirSync(store.moduleDir(meta.id), { recursive: true });
  const dest = path.join(store.moduleDir(meta.id), name);
  const size = await receiveFile(c.req, dest, spec.limit);
  const head = readHead(dest, 4);
  if (spec.magic.some((b, i) => head[i] !== b)) { fs.unlinkSync(dest); throw httpErr(400, 'format', 'Berkas bukan ' + spec.ext.toUpperCase() + ' yang valid.'); }
  meta.files = meta.files || {};
  meta.files[name] = { size: size, at: new Date().toISOString() };
  meta.updatedAt = meta.files[name].at;
  saveModIndex();
  return { module: moduleOut(meta) };
});
route('GET', '/api/modules/' + ID_RE + '/files/(module\\.pdf|module\\.docx|project\\.json)', (c) => {
  const meta = getMeta(c.params[0], c.user, false), name = c.params[1];
  if (name === 'project.json' && !canWrite(c.user, meta) && meta.visibility !== 'shared') throw httpErr(404, 'modul_tidak_ada', 'Tidak ditemukan.');
  const ext = name.split('.').pop();
  const base = name === 'project.json' ? 'Proyek Modul - ' + (meta.mataKuliah || 'Modul') : 'Modul Pembelajaran - ' + (meta.mataKuliah || 'Mata Kuliah');
  serveFile(c.req, c.res, path.join(store.moduleDir(meta.id), name), { 'Cache-Control': 'no-store' }, attachmentName(base, ext));
});

/* ---------------- proksi Claude (format Messages API) ---------------- */
function claudeErr(res, status, type, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ type: 'error', error: { type: type, message: message } }));
}
async function aiRoute(c, kind) {
  const res = c.res, SP = claude.SP;
  const s = sessionFor(String(c.req.headers['x-api-key'] || '') || bearer(c.req));
  if (!s) return claudeErr(res, 401, 'authentication_error', SP + 'Sesi server pusat berakhir. Masuk kembali di Pengaturan › Server Pusat.');
  const user = s.user, a = settings().ai, key = apiKey();
  if (!a.enabled) return claudeErr(res, 403, 'permission_error', SP + 'AI pusat sedang dinonaktifkan admin.');
  if (!key) return claudeErr(res, 403, 'permission_error', SP + 'Kunci API Claude belum diatur admin server pusat.');
  if (user.aiAllowed === false) return claudeErr(res, 403, 'permission_error', SP + 'Akun Anda tidak diizinkan memakai AI pusat. Hubungi admin.');
  const limit = quotaFor(user), used = usageOf(user.id).usd;
  if (kind === 'messages' && limit > 0 && used >= limit) {
    return claudeErr(res, 403, 'permission_error', SP + 'Kuota AI bulan ini habis (US$' + used.toFixed(2) + ' dari US$' + limit.toFixed(2) + '). Hubungi admin untuk menambah kuota.');
  }
  const ctx = { req: c.req, res: res, user: user, policy: aiPolicy(), apiKey: key, baseURL: CFG.anthropicBaseURL, record: (model, usage, ok, ms, err) => recordUsage(user, model, usage, ok, ms, err) };
  if (kind === 'model') return claude.handleModel(ctx, decodeURIComponent(c.params[0]));
  try { ctx.body = await readJson(c.req, 33 * 1048576); } catch (e) { return claudeErr(res, e.status || 400, 'invalid_request_error', SP + e.message); }
  return claude.handleMessages(ctx);
}
route('POST', '/api/ai/v1/messages', (c) => aiRoute(c, 'messages'), { ai: true });
route('GET', '/api/ai/v1/models/([A-Za-z0-9._%-]{1,80})', (c) => aiRoute(c, 'model'), { ai: true });

/* ---------------- admin ---------------- */
const ADMIN = { admin: true };
function onlineList() {
  const now = Date.now(), all = sessions(), out = [];
  Object.keys(all).forEach((h) => {
    const s = all[h];
    if (now - s.seen > 120000) return;
    const u = findUser(s.uid); if (!u) return;
    out.push({ user: { id: u.id, name: u.name, username: u.username, role: u.role, prodi: u.prodi || '' }, since: new Date(s.created).toISOString(), seen: new Date(s.seen).toISOString(), client: s.client || {}, ip: s.ip });
  });
  return out.sort((a, b) => b.seen.localeCompare(a.seen));
}
route('GET', '/api/admin/summary', () => {
  const us = users(), mk = monthKey(), sum = store.read('usage-summary.json', {})[mk] || {};
  const tot = Object.assign({}, EMPTY_USAGE);
  Object.keys(sum).forEach((k) => { Object.keys(EMPTY_USAGE).forEach((f) => { tot[f] += sum[k][f] || 0; }); });
  tot.usd = +tot.usd.toFixed(4);
  return {
    version: VERSION, month: mk,
    users: { total: us.length, active: us.filter((u) => u.status === 'active').length, pending: us.filter((u) => u.status === 'pending').length, disabled: us.filter((u) => u.status === 'disabled').length },
    modules: Object.keys(modIndex()).length, usage: tot, online: onlineList(), key: keyInfo(), ai: settings().ai.enabled,
    recentModules: Object.keys(modIndex()).map((k) => modIndex()[k]).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 8)
  };
}, ADMIN);
route('GET', '/api/admin/users', () => ({ users: users().map((u) => publicUser(u, true)) }), ADMIN);
route('POST', '/api/admin/users', async (c) => {
  const b = c.body || {}, username = normUser(b.username);
  if (!USERNAME_RE.test(username)) throw httpErr(400, 'nama_pengguna', 'Nama pengguna 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  if (users().some((u) => u.username === username)) throw httpErr(409, 'ada', 'Nama pengguna sudah dipakai.');
  const user = {
    id: auth.newId(), username: username, name: str(b.name, 80) || username, role: b.role === 'admin' ? 'admin' : 'dosen', status: 'active',
    pass: await validatePassword(b.password), fakultas: str(b.fakultas, 120), prodi: str(b.prodi, 120), createdAt: new Date().toISOString(),
    aiAllowed: b.aiAllowed !== false, quotaUsd: b.quotaUsd === '' || b.quotaUsd == null ? null : Math.max(0, +b.quotaUsd || 0)
  };
  users().push(user); saveUsers();
  logEvent('pengguna_baru', c.user, user.username + ' (' + user.role + ')', c.ip);
  return { user: publicUser(user, true) };
}, Object.assign({ body: 'json' }, ADMIN));
function activeAdmins() { return users().filter((u) => u.role === 'admin' && u.status === 'active'); }
route('PATCH', '/api/admin/users/' + ID_RE, (c) => {
  const u = findUser(c.params[0]); if (!u) throw httpErr(404, 'tidak_ada', 'Pengguna tidak ditemukan.');
  const b = c.body || {};
  const lastAdmin = u.role === 'admin' && u.status === 'active' && activeAdmins().length === 1;
  if ('role' in b) { const r = b.role === 'admin' ? 'admin' : 'dosen'; if (lastAdmin && r !== 'admin') throw httpErr(400, 'admin_terakhir', 'Tidak dapat menurunkan admin terakhir.'); u.role = r; }
  if ('status' in b) {
    const st = ['active', 'disabled', 'pending'].indexOf(b.status) >= 0 ? b.status : u.status;
    if (lastAdmin && st !== 'active') throw httpErr(400, 'admin_terakhir', 'Tidak dapat menonaktifkan admin terakhir.');
    if (u.id === c.user.id && st !== 'active') throw httpErr(400, 'diri_sendiri', 'Anda tidak dapat menonaktifkan akun sendiri.');
    if (st !== 'active') revokeSessions(u.id);
    u.status = st;
  }
  if ('name' in b) u.name = str(b.name, 80) || u.name;
  if ('fakultas' in b) u.fakultas = str(b.fakultas, 120);
  if ('prodi' in b) u.prodi = str(b.prodi, 120);
  if ('aiAllowed' in b) u.aiAllowed = !!b.aiAllowed;
  if ('quotaUsd' in b) u.quotaUsd = b.quotaUsd === '' || b.quotaUsd == null ? null : Math.max(0, Math.min(100000, +b.quotaUsd || 0));
  saveUsers();
  logEvent('pengguna_ubah', c.user, u.username + ' ' + Object.keys(b).join(','), c.ip);
  return { user: publicUser(u, true) };
}, Object.assign({ body: 'json' }, ADMIN));
route('POST', '/api/admin/users/' + ID_RE + '/password', async (c) => {
  const u = findUser(c.params[0]); if (!u) throw httpErr(404, 'tidak_ada', 'Pengguna tidak ditemukan.');
  u.pass = await validatePassword((c.body || {}).password);
  saveUsers(); revokeSessions(u.id, u.id === c.user.id ? c.sessionHash : null);
  logEvent('reset_sandi', c.user, u.username, c.ip);
  return { ok: true };
}, Object.assign({ body: 'json' }, ADMIN));
route('POST', '/api/admin/users/' + ID_RE + '/logout', (c) => {
  const u = findUser(c.params[0]); if (!u) throw httpErr(404, 'tidak_ada', 'Pengguna tidak ditemukan.');
  revokeSessions(u.id, u.id === c.user.id ? c.sessionHash : null);
  logEvent('paksa_keluar', c.user, u.username, c.ip);
  return { ok: true };
}, ADMIN);
route('DELETE', '/api/admin/users/' + ID_RE, (c) => {
  const u = findUser(c.params[0]); if (!u) throw httpErr(404, 'tidak_ada', 'Pengguna tidak ditemukan.');
  if (u.id === c.user.id) throw httpErr(400, 'diri_sendiri', 'Anda tidak dapat menghapus akun sendiri.');
  if (u.role === 'admin' && activeAdmins().length === 1 && u.status === 'active') throw httpErr(400, 'admin_terakhir', 'Tidak dapat menghapus admin terakhir.');
  revokeSessions(u.id);
  const list = users(); list.splice(list.indexOf(u), 1); saveUsers();
  logEvent('pengguna_hapus', c.user, u.username, c.ip);
  return { ok: true };
}, ADMIN);

function parseCatalog(cat) {
  if (cat === null || cat === undefined || cat === '') return null;
  if (typeof cat !== 'object' || Array.isArray(cat)) throw httpErr(400, 'katalog', 'Format daftar fakultas/prodi tidak valid.');
  const out = {};
  Object.keys(cat).slice(0, 40).forEach((f) => {
    const name = str(f, 120); if (!name) return;
    out[name] = (Array.isArray(cat[f]) ? cat[f] : []).map((p) => str(p, 120)).filter(Boolean).slice(0, 80);
  });
  return Object.keys(out).length ? out : null;
}
route('GET', '/api/admin/settings', () => Object.assign({ settings: settings(), models: claude.KNOWN_MODELS.map((id) => ({ id: id, name: claude.MODEL_NAMES[id] })) }, keyInfo()), ADMIN);
route('PUT', '/api/admin/settings', (c) => {
  const b = c.body || {}, s = settings();
  if ('serverName' in b) s.serverName = str(b.serverName, 80) || DEFAULT_SETTINGS.serverName;
  if ('institution' in b) s.institution = str(b.institution, 120) || DEFAULT_SETTINGS.institution;
  if ('kota' in b) s.kota = str(b.kota, 60) || DEFAULT_SETTINGS.kota;
  if ('announcement' in b) s.announcement = String(b.announcement || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, 600).trim();
  if ('registration' in b) s.registration = b.registration === 'closed' ? 'closed' : 'approval';
  if ('sharing' in b) s.sharing = !!b.sharing;
  if ('catalog' in b) s.catalog = parseCatalog(b.catalog);
  if (b.ai && typeof b.ai === 'object') {
    const a = b.ai, x = s.ai;
    if ('enabled' in a) x.enabled = !!a.enabled;
    if ('allowedModels' in a) {
      const ms = (Array.isArray(a.allowedModels) ? a.allowedModels : []).filter((m) => claude.KNOWN_MODELS.indexOf(m) >= 0);
      if (!ms.length) throw httpErr(400, 'model', 'Pilih minimal satu model yang diizinkan.');
      x.allowedModels = ms;
    }
    if ('defaultModel' in a) x.defaultModel = String(a.defaultModel);
    if (x.allowedModels.indexOf(x.defaultModel) < 0) x.defaultModel = x.allowedModels[0];
    if ('defaultEffort' in a) x.defaultEffort = ['low', 'medium', 'high'].indexOf(a.defaultEffort) >= 0 ? a.defaultEffort : 'medium';
    if ('defaultQuotaUsd' in a) x.defaultQuotaUsd = Math.max(0, Math.min(100000, +a.defaultQuotaUsd || 0));
    if ('maxTokensCap' in a) x.maxTokensCap = Math.max(4000, Math.min(128000, parseInt(a.maxTokensCap, 10) || 64000));
    if ('maxConcurrent' in a) x.maxConcurrent = Math.max(1, Math.min(8, parseInt(a.maxConcurrent, 10) || 4));
    if ('allowPersonalKey' in a) x.allowPersonalKey = !!a.allowPersonalKey;
    if ('allowLocal' in a) x.allowLocal = !!a.allowLocal;
  }
  saveSettings(s);
  logEvent('pengaturan', c.user, Object.keys(b).join(','), c.ip);
  return { settings: s };
}, Object.assign({ body: 'json', limit: 256 * 1024 }, ADMIN));
route('PUT', '/api/admin/apikey', (c) => {
  const k = String((c.body || {}).key || '').trim();
  if (k.length < 20 || k.length > 400 || /\s/.test(k)) throw httpErr(400, 'kunci', 'Kunci API tidak valid.');
  const sec = store.read('secret.json', {}); sec.anthropicApiKey = k; store.write('secret.json', sec);
  logEvent('kunci_api', c.user, 'diperbarui (…' + k.slice(-4) + ')', c.ip);
  return keyInfo();
}, Object.assign({ body: 'json', limit: 4096 }, ADMIN));
route('DELETE', '/api/admin/apikey', (c) => {
  const sec = store.read('secret.json', {}); delete sec.anthropicApiKey; store.write('secret.json', sec);
  logEvent('kunci_api', c.user, 'dihapus', c.ip);
  return keyInfo();
}, ADMIN);
route('POST', '/api/admin/apikey/test', async () => {
  const key = apiKey();
  if (!key) throw httpErr(400, 'kunci', 'Kunci API belum diatur.');
  try {
    const name = await claude.testKey(key, CFG.anthropicBaseURL, settings().ai.defaultModel);
    return { ok: true, message: 'Terhubung: ' + name };
  } catch (e) {
    const info = claude.errorInfo(e);
    return { ok: false, message: 'Gagal (' + info.status + '): ' + info.message };
  }
}, ADMIN);
route('PUT', '/api/admin/logo', async (c) => {
  const buf = await readRaw(c.req, 2 * 1048576);
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!png && !jpg) throw httpErr(400, 'format', 'Logo harus berupa PNG atau JPEG.');
  const s = settings(), file = png ? 'logo.png' : 'logo.jpg';
  if (s.logo && s.logo.file && s.logo.file !== file) { try { fs.unlinkSync(store.path(s.logo.file)); } catch (e) { /* abaikan */ } }
  writeAtomic(store.path(file), buf);
  s.logo = { file: file, v: Date.now() };
  saveSettings(s);
  logEvent('logo', c.user, file, c.ip);
  return { logo: 'api/assets/logo?v=' + s.logo.v };
}, ADMIN);
route('DELETE', '/api/admin/logo', (c) => {
  const s = settings();
  if (s.logo && s.logo.file) { try { fs.unlinkSync(store.path(s.logo.file)); } catch (e) { /* abaikan */ } }
  s.logo = null; saveSettings(s);
  logEvent('logo', c.user, 'dihapus', c.ip);
  return { logo: null };
}, ADMIN);
route('GET', '/api/admin/usage', (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.url.searchParams.get('month') || '') ? c.url.searchParams.get('month') : monthKey();
  const sum = store.read('usage-summary.json', {});
  const mm = sum[month] || {};
  const per = Object.keys(mm).map((uid) => { const u = findUser(uid); return Object.assign({ userId: uid, name: u ? u.name : '(dihapus)', username: u ? u.username : '', quotaUsd: u ? quotaFor(u) : null }, mm[uid]); })
    .sort((a, b) => b.usd - a.usd);
  const names = {}; users().forEach((u) => { names[u.id] = u.username; });
  const recent = store.tail('usage.jsonl', 5000).filter((r) => String(r.t).slice(0, 7) === month || monthKey(new Date(r.t)) === month).slice(-200).reverse()
    .map((r) => Object.assign({}, r, { username: names[r.u] || '' }));
  return { month: month, months: Object.keys(sum).sort().reverse(), perUser: per, recent: recent };
}, ADMIN);
route('GET', '/api/admin/online', () => ({ online: onlineList() }), ADMIN);
route('GET', '/api/admin/events', () => ({ events: EVENTS.slice().reverse() }), ADMIN);

/* ---------------- server HTTP ---------------- */
function onRequest(req, res) {
  // koneksi yang diputus klien di tengah jalan tidak boleh menjatuhkan server
  res.on('error', () => {});
  req.on('error', () => {});
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  if (p.indexOf('/api/') === 0) {
    handleApi(req, res, url).catch((e) => { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: { code: 'internal', message: 'Terjadi kesalahan pada server.' } }); });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SEC_HEADERS); return res.end(); }
  if (p === '/admin') { res.writeHead(301, { Location: '/admin/' + url.search }); return res.end(); }
  if (p.indexOf('/admin/') === 0) return serveStatic(req, res, ADMIN_DIR, p.slice(7) || 'index.html', ADMIN_HEADERS);
  return serveStatic(req, res, CFG.appDir, p.slice(1) || 'index.html');
}

function start() {
  if (!fs.existsSync(path.join(CFG.appDir, 'index.html'))) {
    console.error('Folder aplikasi tidak ditemukan: ' + CFG.appDir + ' (atur dengan --app <folder>)');
    process.exit(1);
  }
  ensureSetup();
  const tls = CFG.cert && CFG.key;
  const server = tls ? https.createServer({ cert: fs.readFileSync(CFG.cert), key: fs.readFileSync(CFG.key) }, onRequest) : http.createServer(onRequest);
  server.requestTimeout = 15 * 60 * 1000; // unggahan modul besar pada koneksi lambat
  server.headersTimeout = 60 * 1000;
  server.on('error', (e) => { console.error('Server gagal berjalan: ' + e.message); process.exit(1); });
  server.listen(CFG.port, CFG.host, () => {
    const base = (tls ? 'https' : 'http') + '://' + (CFG.host === '0.0.0.0' || CFG.host === '::' ? 'localhost' : CFG.host) + ':' + CFG.port;
    console.log('Server Pusat Modul RPS ' + VERSION + ' berjalan di ' + base);
    console.log('  Aplikasi   : ' + base + '/');
    console.log('  Panel admin: ' + base + '/admin/');
    console.log('  Folder data: ' + CFG.dataDir);
    if (SETUP_TOKEN) {
      console.log('');
      console.log('  Belum ada akun admin. Buka alamat berikut untuk membuatnya (sekali pakai):');
      console.log('  ' + base + '/admin/#setup=' + SETUP_TOKEN);
    }
    if (!keyInfo().hasKey) console.log('  Catatan: kunci API Claude belum diatur (atur di Panel admin › Pengaturan).');
  });
  const stop = () => { try { store.write('sessions.json', sessions()); } catch (e) { /* abaikan */ } process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  // galat tak terduga dicatat; server tetap melayani pengguna lain
  process.on('unhandledRejection', (e) => console.error('[galat tak tertangani]', e && e.stack || e));
  process.on('uncaughtException', (e) => console.error('[galat tak tertangani]', e && e.stack || e));
  return server;
}

if (require.main === module) start();
module.exports = { start: start, CFG: CFG };
