'use strict';
/* Uji asap Server Pusat: menjalankan server pada folder data sementara dengan layanan Claude tiruan
   (tidak ada panggilan ke Anthropic sungguhan), lalu menguji alur utama ujung ke ujung.
   Jalankan: node test/smoke.js */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Anthropic } = require('@anthropic-ai/sdk');

const FAKE_KEY = 'uji-tiruan-bukan-kunci-asli-0000';
let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) { pass++; console.log('  ✔ ' + name); } else { fail++; console.log('  ✖ ' + name + (extra ? ' — ' + extra : '')); } }

/* ---------- layanan Claude tiruan ---------- */
const seen = [];
function fakeAnthropic() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        // SDK 1.4.0 mengirim kunci sebagai "Authorization: Bearer"; versi lama memakai x-api-key
        const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (key !== FAKE_KEY) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'kunci salah' } })); }
        if (req.method === 'GET' && /^\/v1\/models\//.test(req.url)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: decodeURIComponent(req.url.split('/').pop()), type: 'model', display_name: 'Model Tiruan', created_at: '2026-01-01T00:00:00Z' }));
        }
        const j = JSON.parse(body || '{}');
        seen.push({ url: req.url, beta: req.headers['anthropic-beta'] || '', body: j });
        const msg = { id: 'msg_tiruan', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
        const text = '{"ok":true}';
        if (!j.stream) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(Object.assign({}, msg, { content: [{ type: 'text', text: text }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } })));
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const ev = (t, d) => res.write('event: ' + t + '\ndata: ' + JSON.stringify(d) + '\n\n');
        ev('message_start', { type: 'message_start', message: msg });
        ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text } });
        ev('content_block_stop', { type: 'content_block_stop', index: 0 });
        ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } });
        ev('message_stop', { type: 'message_stop' });
        res.end();
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* ---------- pembantu HTTP ---------- */
let BASE = '';
function req(method, p, body, token, extraHeaders, raw) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + p);
    const headers = Object.assign({}, extraHeaders || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    let data = null;
    if (raw) { data = raw; headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream'; }
    else if (body !== undefined) { data = Buffer.from(JSON.stringify(body)); headers['Content-Type'] = 'application/json'; }
    if (data) headers['Content-Length'] = data.length;
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method, headers: headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json: json, buf: buf });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const fake = await fakeAnthropic();
  const fakeBase = 'http://127.0.0.1:' + fake.address().port;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-server-uji-'));
  const port = 18000 + Math.floor(Math.random() * 2000);
  BASE = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', String(port), '--host', '127.0.0.1', '--data', dataDir, '--anthropic-base-url', fakeBase], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function wait() { if (/berjalan di/.test(out)) return resolve(); if (Date.now() - t0 > 15000) return reject(new Error('server tidak mulai: ' + out)); setTimeout(wait, 100); })();
  });
  const setupToken = (out.match(/#setup=([A-Za-z0-9_-]+)/) || [])[1];
  try {
    console.log('Publik & penyiapan');
    let r = await req('GET', '/api/config');
    ok(r.status === 200 && r.json.server === 'modul-rps' && r.json.setupRequired === true, 'config: perlu penyiapan');
    ok(!!setupToken, 'kode penyiapan dicetak di konsol');
    r = await req('POST', '/api/setup', { setupToken: 'salah', username: 'admin', name: 'Admin', password: 'rahasia-panjang-1' });
    ok(r.status === 403, 'penyiapan dengan kode salah ditolak');
    r = await req('POST', '/api/setup', { setupToken: setupToken, username: 'admin', name: 'Admin Prodi', password: 'rahasia-panjang-1' });
    ok(r.status === 200 && r.json.token && r.json.user.role === 'admin', 'admin pertama dibuat');
    const adminTok = r.json.token;
    r = await req('POST', '/api/setup', { setupToken: setupToken, username: 'admin2', name: 'X', password: 'rahasia-panjang-1' });
    ok(r.status === 409, 'penyiapan tidak dapat diulang');
    r = await req('GET', '/');
    ok(r.status === 200 && /Konversi RPS/.test(r.buf.toString()), 'aplikasi web disajikan di /');
    r = await req('GET', '/admin/');
    ok(r.status === 200 && /Panel Admin/.test(r.buf.toString()) && /script-src 'self'/.test(r.headers['content-security-policy'] || ''), 'panel admin disajikan dengan CSP');
    r = await req('GET', '/..%2f..%2fserver%2fserver.js');
    ok(r.status === 404, 'penelusuran path ditolak');
    r = await req('GET', '/admin/..%2fserver.js');
    ok(r.status === 404, 'penelusuran path admin ditolak');
    r = await req('OPTIONS', '/api/me', undefined, null, { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization, x-api-key, anthropic-version' });
    ok(r.status === 204 && r.headers['access-control-allow-origin'] === '*' && /x-api-key/.test(r.headers['access-control-allow-headers'] || ''), 'CORS preflight untuk aplikasi desktop/Android');

    console.log('Pengguna');
    r = await req('POST', '/api/admin/users', { username: 'dosen1', name: 'Dosen Satu', password: 'sandi-dosen-1', prodi: 'Manajemen Dakwah' }, adminTok);
    ok(r.status === 200 && r.json.user.status === 'active', 'admin membuat akun dosen');
    const dosen1 = r.json.user;
    r = await req('POST', '/api/admin/users', { username: 'dosen1', name: 'Ganda', password: 'sandi-dosen-1' }, adminTok);
    ok(r.status === 409, 'nama pengguna ganda ditolak');
    r = await req('POST', '/api/auth/login', { username: 'dosen1', password: 'salah-sandi' });
    ok(r.status === 401, 'sandi salah ditolak');
    r = await req('POST', '/api/auth/login', { username: 'Dosen1', password: 'sandi-dosen-1' });
    ok(r.status === 200 && r.json.token, 'dosen masuk (nama pengguna tidak peka huruf besar)');
    const dTok = r.json.token;
    r = await req('GET', '/api/admin/users', undefined, dTok);
    ok(r.status === 403, 'dosen tidak dapat membuka API admin');
    r = await req('GET', '/api/me', undefined, dTok);
    ok(r.status === 200 && r.json.ai.central === false && /Kunci API/.test(r.json.ai.reason), 'me: AI pusat belum aktif tanpa kunci');
    r = await req('POST', '/api/auth/register', { username: 'dosen2', name: 'Dosen Dua', password: 'sandi-dosen-2', prodi: 'KPI' });
    ok(r.status === 200 && r.json.pending, 'pendaftaran mandiri menunggu persetujuan');
    r = await req('POST', '/api/auth/login', { username: 'dosen2', password: 'sandi-dosen-2' });
    ok(r.status === 403 && /persetujuan/.test(r.json.error.message), 'akun menunggu belum dapat masuk');
    const users = (await req('GET', '/api/admin/users', undefined, adminTok)).json.users;
    const d2 = users.find((u) => u.username === 'dosen2');
    r = await req('PATCH', '/api/admin/users/' + d2.id, { status: 'active' }, adminTok);
    ok(r.status === 200 && r.json.user.status === 'active', 'admin menyetujui pendaftaran');
    r = await req('POST', '/api/auth/login', { username: 'dosen2', password: 'sandi-dosen-2' });
    const d2Tok = r.json && r.json.token;
    ok(r.status === 200 && d2Tok, 'akun yang disetujui dapat masuk');
    r = await req('PATCH', '/api/admin/users/' + r.json.user.id, { role: 'dosen' }, adminTok);
    const me = (await req('GET', '/api/me', undefined, adminTok)).json.user;
    r = await req('PATCH', '/api/admin/users/' + me.id, { role: 'dosen' }, adminTok);
    ok(r.status === 400, 'admin terakhir tidak dapat diturunkan');

    console.log('Proksi Claude');
    const sdk = (tok) => new Anthropic({ apiKey: tok, baseURL: BASE + '/api/ai', maxRetries: 0 });
    let err = null;
    try { await sdk(dTok).messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'halo' }] }); } catch (e) { err = e; }
    ok(err && err.status === 403 && /Kunci API Claude belum diatur/.test(err.message), 'tanpa kunci server: ditolak dengan pesan jelas');
    r = await req('PUT', '/api/admin/apikey', { key: FAKE_KEY }, adminTok);
    ok(r.status === 200 && r.json.hasKey && r.json.keyHint === '…' + FAKE_KEY.slice(-4), 'admin menyimpan kunci (ditampilkan tersamar)');
    r = await req('GET', '/api/admin/settings', undefined, adminTok);
    ok(r.status === 200 && JSON.stringify(r.json).indexOf(FAKE_KEY) < 0, 'kunci tidak pernah dikirim balik');
    r = await req('POST', '/api/admin/apikey/test', undefined, adminTok);
    ok(r.status === 200 && r.json.ok, 'uji kunci dari panel admin');
    const stream = sdk(dTok).beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 32000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } } }, system: [{ type: 'text', text: 'sistem', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'halo' }], betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    let chars = 0;
    stream.on('text', (d) => { chars += d.length; });
    const fin = await stream.finalMessage();
    ok(fin.stop_reason === 'end_turn' && fin.content[0].text === '{"ok":true}' && chars > 0, 'streaming SDK → server pusat → Claude (tiruan) berhasil');
    const last = seen[seen.length - 1];
    ok(last && last.beta.indexOf('server-side-fallback-2026-07-01') >= 0 && last.body.fallbacks === 'default', 'beta fallback & fallbacks diteruskan');
    ok(last && last.body.metadata && last.body.metadata.user_id === 'mrp-' + dosen1.id && !('temperature' in last.body), 'metadata pengguna ditambahkan tanpa data pribadi');
    err = null;
    try { await sdk(dTok).messages.create({ model: 'claude-opus-5-5', max_tokens: 100, tools: [{ name: 'x', input_schema: { type: 'object' } }], messages: [{ role: 'user', content: 'halo' }] }); } catch (e) { err = e; }
    ok(err && err.status === 400, 'parameter tools diblokir');
    r = await req('PUT', '/api/admin/settings', { ai: { allowedModels: ['claude-haiku-5-5'] } }, adminTok);
    err = null;
    try { await sdk(dTok).messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'halo' }] }); } catch (e) { err = e; }
    ok(err && err.status === 403 && /tidak diizinkan/.test(err.message), 'model yang tidak diizinkan ditolak');
    const m2 = await sdk(dTok).messages.create({ model: 'claude-haiku-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'halo' }] });
    ok(m2.content[0].text === '{"ok":true}', 'permintaan non-streaming');
    r = await req('PUT', '/api/admin/settings', { ai: { allowedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] } }, adminTok);
    r = await req('GET', '/api/me', undefined, dTok);
    ok(r.json.ai.central === true && r.json.ai.usedUsd > 0, 'pemakaian tercatat (US$' + (r.json.ai.usedUsd || 0) + ')');
    r = await req('PATCH', '/api/admin/users/' + dosen1.id, { quotaUsd: 0.001 }, adminTok);
    err = null;
    try { await sdk(dTok).messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'halo' }] }); } catch (e) { err = e; }
    ok(err && err.status === 403 && /Kuota AI bulan ini habis/.test(err.message), 'kuota bulanan ditegakkan');
    r = await req('GET', '/api/admin/usage', undefined, adminTok);
    ok(r.status === 200 && r.json.perUser.length >= 1 && r.json.recent.length >= 2, 'laporan pemakaian untuk admin');
    err = null;
    try { await sdk('token-palsu').messages.create({ model: 'claude-opus-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'halo' }] }); } catch (e) { err = e; }
    ok(err && err.status === 401, 'token palsu ditolak oleh proksi');
    const mdl = await sdk(d2Tok).models.retrieve('claude-sonnet-5-5');
    ok(mdl && mdl.display_name === 'Model Tiruan', 'uji koneksi model melalui proksi');

    console.log('Bank modul');
    const project = { version: 1, ident: { mataKuliah: 'Manajemen Dakwah', prodi: 'Manajemen Dakwah', dosen: 'Dosen Satu' }, options: { targetPages: 32 }, content: { meetings: {} } };
    r = await req('POST', '/api/modules', { meta: { mataKuliah: 'Manajemen Dakwah', prodi: 'Manajemen Dakwah', dosen: 'Dosen Satu', pages: 31 }, project: project }, dTok);
    ok(r.status === 200 && r.json.module.id, 'modul baru disimpan');
    const mid = r.json.module.id;
    r = await req('PUT', '/api/modules/' + mid + '/files/module.pdf', undefined, dTok, { 'Content-Type': 'application/pdf' }, Buffer.from('bukan pdf'));
    ok(r.status === 400, 'berkas PDF palsu ditolak');
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 32), Buffer.from('\n%%EOF')]);
    r = await req('PUT', '/api/modules/' + mid + '/files/module.pdf', undefined, dTok, { 'Content-Type': 'application/pdf' }, pdf);
    ok(r.status === 200 && r.json.module.files['module.pdf'].size === pdf.length, 'PDF modul diunggah');
    r = await req('GET', '/api/modules/' + mid + '/files/module.pdf', undefined, dTok);
    ok(r.status === 200 && r.buf.equals(pdf) && /attachment/.test(r.headers['content-disposition'] || ''), 'PDF modul diunduh utuh');
    r = await req('GET', '/api/modules/' + mid, undefined, d2Tok);
    ok(r.status === 404, 'modul pribadi tidak terlihat oleh dosen lain');
    r = await req('PUT', '/api/modules/' + mid, { visibility: 'shared' }, dTok);
    r = await req('GET', '/api/modules?scope=shared', undefined, d2Tok);
    ok(r.status === 200 && r.json.modules.some((m) => m.id === mid), 'modul yang dibagikan terlihat di bank modul');
    r = await req('DELETE', '/api/modules/' + mid, undefined, d2Tok);
    ok(r.status === 404, 'dosen lain tidak dapat menghapus modul');
    r = await req('GET', '/api/modules?scope=all', undefined, adminTok);
    ok(r.status === 200 && r.json.modules.length === 1, 'admin melihat semua modul');
    r = await req('GET', '/api/modules/' + mid, undefined, dTok);
    ok(r.status === 200 && r.json.project && r.json.project.ident.mataKuliah === 'Manajemen Dakwah', 'proyek dapat dibuka kembali');

    console.log('Pengaturan, logo, sesi');
    r = await req('PUT', '/api/admin/settings', { announcement: 'Uji pengumuman', catalog: { 'Fakultas Ushuluddin, Adab, dan Dakwah': ['Manajemen Dakwah', 'KPI'] } }, adminTok);
    r = await req('POST', '/api/heartbeat', { app: 'web', version: '1.1.0', page: 'generate', project: 'Manajemen Dakwah' }, dTok);
    ok(r.status === 200 && r.json.announcement === 'Uji pengumuman', 'detak jantung + pengumuman');
    r = await req('GET', '/api/admin/online', undefined, adminTok);
    ok(r.status === 200 && r.json.online.some((o) => o.user.username === 'dosen1' && o.client.project === 'Manajemen Dakwah'), 'admin melihat pengguna yang terhubung');
    r = await req('PUT', '/api/admin/logo', undefined, adminTok, { 'Content-Type': 'image/png' }, Buffer.from('bukan gambar'));
    ok(r.status === 400, 'logo tidak valid ditolak');
    const png = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'img', 'favicon-64.png'));
    r = await req('PUT', '/api/admin/logo', undefined, adminTok, { 'Content-Type': 'image/png' }, png);
    ok(r.status === 200 && r.json.logo, 'logo pusat diunggah');
    r = await req('GET', '/api/assets/logo');
    ok(r.status === 200 && r.buf.equals(png), 'logo pusat dapat diambil aplikasi');
    r = await req('POST', '/api/admin/users/' + dosen1.id + '/logout', undefined, adminTok);
    r = await req('GET', '/api/me', undefined, dTok);
    ok(r.status === 401, 'admin dapat mengakhiri sesi dosen');
    let blocked = false;
    for (let i = 0; i < 8; i++) { r = await req('POST', '/api/auth/login', { username: 'dosen2', password: 'tebakan-' + i }); if (r.status === 429) { blocked = true; break; } }
    ok(blocked, 'percobaan masuk berulang dibatasi');
    r = await req('GET', '/api/admin/events', undefined, adminTok);
    ok(r.status === 200 && r.json.events.some((e) => e.type === 'login_gagal'), 'log kejadian tercatat');
    const files = fs.readdirSync(dataDir);
    ok(files.indexOf('secret.json') >= 0 && files.indexOf('setup-token.txt') < 0, 'kunci tersimpan di folder data; kode penyiapan dihapus');
  } catch (e) {
    fail++; console.log('  ✖ galat tak terduga: ' + (e && e.stack || e));
  } finally {
    await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    await new Promise((resolve) => fake.close(resolve));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* abaikan */ }
  }
  console.log('\nHasil: ' + pass + ' lulus, ' + fail + ' gagal');
  process.exitCode = fail ? 1 : 0;
})();
