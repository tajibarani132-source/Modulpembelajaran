// Server pengembangan & pengujian (BUKAN bagian aplikasi yang didistribusikan).
//  - menyajikan folder app/ di http://localhost:8080/
//  - /samples/  -> folder contoh RPS (folder induk "Modul Pembelajaran MD")
//  - POST /__save?name=x -> menyimpan berkas hasil uji ke tools/out/
//  - /fake-anthropic/v1/... dan /fake-ollama/api/... -> API tiruan untuk menguji jalur AI tanpa biaya
// Jalankan: node tools/serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname, '..', 'app');
const SAMPLES = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc': 'application/msword', '.txt': 'text/plain; charset=utf-8' };

function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); }
function readBody(req) { return new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); }); }
function serveFile(res, base, rel) {
  const p = path.resolve(base, '.' + decodeURIComponent(rel));
  if (!p.startsWith(base)) return send(res, 403, 'forbidden');
  fs.stat(p, (err, st) => {
    if (err) return send(res, 404, 'not found');
    const file = st.isDirectory() ? path.join(p, 'index.html') : p;
    fs.readFile(file, (e, data) => {
      if (e) return send(res, 404, 'not found');
      send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}

/* ---------- teks tiruan berbahasa Indonesia ---------- */
const SENT = [
  'Pemahaman tentang {t} menuntut kejelasan definisi, unsur pembentuk, dan ruang lingkupnya agar tidak terjadi kekeliruan dalam penerapan.',
  'Secara konseptual, {t} dapat dipahami sebagai rangkaian gagasan yang saling berkaitan dan diarahkan untuk mencapai tujuan tertentu.',
  'Para ahli memandang {t} sebagai proses yang melibatkan unsur manusia, nilai, sumber daya, dan lingkungan sosial yang melingkupinya.',
  'Dalam konteks lembaga dakwah, {t} berkaitan erat dengan cara pengelola merencanakan, melaksanakan, dan mengevaluasi programnya.',
  'Kajian teoretis menunjukkan bahwa keberhasilan {t} dipengaruhi oleh kejelasan tujuan, kapasitas pelaku, dan dukungan sistem organisasi.',
  'Perspektif Islam menekankan bahwa setiap aktivitas, termasuk {t}, harus dilandasi niat yang ikhlas, amanah, dan berorientasi pada kemaslahatan.',
  'Mahasiswa perlu membandingkan berbagai pandangan tentang {t} untuk menemukan persamaan, perbedaan, serta relevansinya dengan kondisi saat ini.',
  'Penerapan {t} di lapangan memerlukan kepekaan terhadap karakteristik sasaran, budaya setempat, dan perkembangan teknologi informasi.',
  'Oleh karena itu, analisis terhadap {t} tidak cukup berhenti pada tataran konsep, tetapi harus dikaitkan dengan praktik yang nyata.',
  'Berbagai penelitian menegaskan pentingnya evaluasi berkelanjutan agar pelaksanaan {t} tetap relevan dan memberikan manfaat yang terukur.'
];
function words(t, n, seed) { const out = []; let c = 0, i = seed || 0; while (c < n) { const s = SENT[i++ % SENT.length].replace(/\{t\}/g, t); out.push(s); c += s.split(' ').length; } return out.join(' '); }
function paras(t, n, seed) { const half = Math.max(30, Math.round(n / 2)); return words(t, half, seed) + '\n\n' + words(t, n - half, seed + 3); }

function fakeMeeting(text) {
  const tm = text.match(/judul materi: "([^"]+)"/); const t = (tm ? tm[1] : 'materi pertemuan').toLowerCase();
  const nm = text.match(/±(\d+) kata \(toleransi/); const N = nm ? +nm[1] : 600;
  const seed = t.length;
  const jenis = ['peta_konsep', 'alur', 'siklus', 'hierarki', 'piramida', 'kuadran', 'garis_waktu', 'perbandingan'][seed % 8];
  return {
    judul: tm ? tm[1] : 'Materi Pertemuan',
    pengantar: words(t, Math.round(N * 0.07), seed),
    tujuan: ['Menjelaskan konsep dasar ' + t, 'Menganalisis teori yang berkaitan dengan ' + t, 'Menerapkan ' + t + ' dalam konteks lembaga dakwah'],
    konsep: [{ subjudul: 'Pengertian ' + t, isi: paras(t, Math.round(N * 0.15), seed + 1) }, { subjudul: 'Unsur dan Ruang Lingkup', isi: paras(t, Math.round(N * 0.15), seed + 2) + '\n\n- butir **penting** pertama\n- butir kedua dengan *istilah asing*' }],
    teori: [{ subjudul: 'Teori Utama', isi: paras(t, Math.round(N * 0.14), seed + 4) }, { subjudul: 'Perspektif Keislaman', isi: paras(t, Math.round(N * 0.14), seed + 5) }],
    praktik: { pengantar: words(t, Math.round(N * 0.06), seed + 6), langkah: ['Identifikasi masalah', 'Kumpulkan data lapangan', 'Analisis dengan konsep', 'Rumuskan rekomendasi'], contoh: words(t, Math.round(N * 0.09), seed + 7) },
    visual: { jenis, judul: 'Bagan ' + t, pusat: t, item: [1, 2, 3, 4].map((k) => ({ label: (jenis === 'garis_waktu' ? (2000 + k * 5) + '' : 'Aspek ' + k), keterangan: 'Keterangan singkat aspek ' + k + ' dalam ' + t, rincian: ['rincian a', 'rincian b'] })) },
    rangkuman: words(t, Math.round(N * 0.06), seed + 8),
    tugas: { judul: 'Analisis Kasus ' + t, petunjuk: words(t, 30, seed + 9), langkah: ['Baca materi', 'Pilih kasus', 'Analisis', 'Tulis laporan'], luaran: 'Laporan 3–5 halaman', waktu: '1 minggu', penilaian: [{ aspek: 'Ketepatan konsep', bobot: 40 }, { aspek: 'Kedalaman analisis', bobot: 40 }, { aspek: 'Sistematika', bobot: 20 }] },
    latihan: ['Jelaskan ' + t + '!', 'Analisislah unsur ' + t + '!', 'Berikan contoh penerapan ' + t + '!', 'Bandingkan dua teori tentang ' + t + '!'],
    referensi: []
  };
}
function fakeRps() {
  const topics = ['Pengantar Psikologi Dakwah', 'Peran Dai', 'Kejiwaan Mad\'u', 'Metode Dakwah', 'Psikologi Komunikasi', 'Kecerdasan Kenabian', 'Strategi Kontemporer', 'Religiositas', 'Kesejahteraan Sosial', 'Kepribadian Mad\'u', 'Pendidikan Dakwah', 'Evaluasi Dakwah', 'Studi Kasus', 'Rekomendasi Program'];
  const weeks = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  const per = topics.map((t, i) => ({ minggu: String(weeks[i]), jenis: 'materi', judul: t, sub_cpmk: 'Mahasiswa mampu menjelaskan ' + t.toLowerCase(), indikator: 'Ketepatan menjelaskan', kriteria: 'Rubrik', metode: 'Ceramah, diskusi', penugasan: 'Tugas individu', materi: t, pustaka: '1,2', bobot: '5' }));
  per.splice(7, 0, { minggu: '8', jenis: 'uts', judul: 'UTS', sub_cpmk: '', indikator: '', kriteria: '', metode: '', penugasan: '', materi: '', pustaka: '', bobot: '20' });
  per.push({ minggu: '16', jenis: 'uas', judul: 'UAS', sub_cpmk: '', indikator: '', kriteria: '', metode: '', penugasan: '', materi: '', pustaka: '', bobot: '25' });
  return { mata_kuliah: 'Psikologi Dakwah (uji AI)', kode: 'DAC242122', sks: '2', semester: '4', rumpun: 'MKK', fakultas: 'Fakultas Ushuluddin, Adab, dan Dakwah', prodi: 'Manajemen Dakwah', deskripsi: 'Deskripsi uji.', cpl: ['CPL-1: uji'], cpmk: ['CPMK-1: uji'], sub_cpmk: [], bahan_kajian: topics, pustaka: ['Affandi, M. (2017). Psikologi Dakwah.', 'Salim, A. (2017). Peran dan fungsi dai.'], pertemuan: per };
}
function fakeFront() { return { kata_pengantar: words('modul ini', 70, 1) + '\n\n' + words('modul ini', 70, 4), deskripsi: words('mata kuliah ini', 120, 2), petunjuk: ['Baca tujuan', 'Pelajari materi', 'Kerjakan tugas', 'Jawab latihan', 'Baca referensi'], penutup: words('modul ini', 110, 6) }; }

function sse(res, event, data) { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
async function fakeAnthropic(req, res, body) {
  const j = JSON.parse(body.toString('utf8') || '{}');
  const log = { at: new Date().toISOString(), url: req.url, headers: { 'anthropic-version': req.headers['anthropic-version'], 'anthropic-beta': req.headers['anthropic-beta'], 'browser-access': req.headers['anthropic-dangerous-direct-browser-access'], 'x-api-key': req.headers['x-api-key'] ? '(ada)' : '(tidak ada)' }, params: Object.assign({}, j, { messages: '(' + (j.messages || []).length + ' pesan)', system: '(' + JSON.stringify(j.system || '').length + ' kar)' }), schemaKeys: j.output_config && j.output_config.format && Object.keys(j.output_config.format.schema.properties || {}) };
  fs.appendFileSync(path.join(OUT, 'requests.log'), JSON.stringify(log) + '\n');
  const userText = JSON.stringify(j.messages || []);
  const sys = JSON.stringify(j.system || '');
  let obj;
  if (/kata_pengantar/.test(userText)) obj = fakeFront();
  else if (/asisten akademik yang teliti/.test(sys)) obj = fakeRps();
  else obj = fakeMeeting(userText.replace(/\\"/g, '"'));
  const text = JSON.stringify(obj);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'request-id': 'req_fake' });
  sse(res, 'message_start', { type: 'message_start', message: { id: 'msg_fake', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
  sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < text.length; i += 400) {
    sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 400) } });
    await new Promise((r) => setTimeout(r, 15));
  }
  sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 });
  sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.round(text.length / 3.2) } });
  sse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}
async function fakeOllama(req, res, body) {
  const j = JSON.parse(body.toString('utf8') || '{}');
  fs.appendFileSync(path.join(OUT, 'requests.log'), JSON.stringify({ at: new Date().toISOString(), url: req.url, model: j.model, options: j.options, formatType: typeof j.format }) + '\n');
  const all = JSON.stringify(j.messages || []);
  const obj = /kata_pengantar/.test(all) ? fakeFront() : /asisten akademik yang teliti/.test(all) ? fakeRps() : fakeMeeting(all.replace(/\\"/g, '"'));
  const text = JSON.stringify(obj);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  for (let i = 0; i < text.length; i += 300) { res.write(JSON.stringify({ model: j.model, message: { role: 'assistant', content: text.slice(i, i + 300) }, done: false }) + '\n'); await new Promise((r) => setTimeout(r, 10)); }
  res.end(JSON.stringify({ model: j.model, done: true }) + '\n');
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/__save') {
      const name = path.basename(url.searchParams.get('name') || 'hasil.bin');
      fs.writeFileSync(path.join(OUT, name), await readBody(req));
      return send(res, 200, 'ok ' + name);
    }
    if (url.pathname.startsWith('/fake-anthropic/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && /\/v1\/models\//.test(url.pathname)) return send(res, 200, JSON.stringify({ type: 'model', id: url.pathname.split('/').pop(), display_name: 'Claude (tiruan)', created_at: '2026-01-01T00:00:00Z' }), 'application/json');
      if (req.method === 'POST' && /\/v1\/messages/.test(url.pathname)) return fakeAnthropic(req, res, await readBody(req));
      return send(res, 404, '{}', 'application/json');
    }
    if (url.pathname.startsWith('/fake-ollama/')) {
      if (url.pathname.endsWith('/api/tags')) return send(res, 200, JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }), 'application/json');
      if (url.pathname.endsWith('/api/chat')) return fakeOllama(req, res, await readBody(req));
      return send(res, 404, '{}');
    }
    // contoh RPS & pembantu uji juga boleh diambil dari Server Pusat lokal (port lain) saat pengujian
    if (url.pathname.startsWith('/samples/') || url.pathname.startsWith('/out/')) res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname.startsWith('/samples/')) return serveFile(res, SAMPLES, url.pathname.slice('/samples'.length));
    if (url.pathname.startsWith('/out/')) return serveFile(res, OUT, url.pathname.slice('/out'.length));
    return serveFile(res, ROOT, url.pathname === '/' ? '/index.html' : url.pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, String(e && e.stack || e));
  }
}).listen(PORT, () => console.log('Server uji berjalan di http://localhost:' + PORT));
