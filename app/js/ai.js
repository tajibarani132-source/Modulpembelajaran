/* ai.js — mesin AI: Claude (Anthropic SDK resmi) dan AI lokal (Ollama / kompatibel OpenAI) */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var AI = (MRP.ai = {});

  AI.DEFAULT_MODEL = 'claude-opus-5-5';
  var FALLBACK_BETA = 'server-side-fallback-2026-07-01';

  /* ---------------- skema keluaran ---------------- */
  var S = { type: 'string' };
  var SA = { type: 'array', items: { type: 'string' } };
  function obj(props) { return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props }; }

  AI.MEETING_SCHEMA = obj({
    judul: S,
    pengantar: S,
    tujuan: SA,
    konsep: { type: 'array', items: obj({ subjudul: S, isi: S }) },
    teori: { type: 'array', items: obj({ subjudul: S, isi: S }) },
    praktik: obj({ pengantar: S, langkah: SA, contoh: S }),
    visual: obj({
      jenis: { type: 'string', enum: ['peta_konsep', 'alur', 'siklus', 'hierarki', 'piramida', 'kuadran', 'garis_waktu', 'perbandingan', 'tidak_ada'] },
      judul: S, pusat: S,
      item: { type: 'array', items: obj({ label: S, keterangan: S, rincian: SA }) }
    }),
    rangkuman: S,
    tugas: obj({ judul: S, petunjuk: S, langkah: SA, luaran: S, waktu: S, penilaian: { type: 'array', items: obj({ aspek: S, bobot: { type: 'integer' } }) } }),
    latihan: SA,
    referensi: SA
  });

  AI.RPS_SCHEMA = obj({
    mata_kuliah: S, kode: S, sks: S, semester: S, rumpun: S, fakultas: S, prodi: S, deskripsi: S,
    cpl: SA, cpmk: SA, sub_cpmk: SA, bahan_kajian: SA, pustaka: SA,
    pertemuan: {
      type: 'array', items: obj({
        minggu: S, jenis: { type: 'string', enum: ['materi', 'orientasi', 'uts', 'uas'] }, judul: S,
        sub_cpmk: S, indikator: S, kriteria: S, metode: S, penugasan: S, materi: S, pustaka: S, bobot: S
      })
    }
  });

  AI.FRONT_SCHEMA = obj({ kata_pengantar: S, deskripsi: S, petunjuk: SA, penutup: S });

  /* ---------------- prompt ---------------- */
  var WRITER_RULES = [
    'Anda adalah penulis modul pembelajaran perguruan tinggi di Institut Agama Islam Negeri (IAIN) Parepare. Tugas Anda menyusun isi Modul Pembelajaran Mata Kuliah berdasarkan Rencana Pembelajaran Semester (RPS).',
    '',
    'Ketentuan penulisan:',
    '1. Gunakan bahasa Indonesia akademik yang baku (EYD), lugas, runtut, dan mudah dipahami mahasiswa S1. Hindari gaya percakapan dan kalimat promosi.',
    '2. Setiap pertemuan memuat konsep, teori, praktik, dan panduan tugas yang selaras dengan Sub-CPMK, indikator, metode, dan materi pada RPS.',
    '3. Konsep berisi definisi, unsur, ruang lingkup, dan istilah kunci. Teori berisi teori, model, atau pandangan ahli yang relevan beserta analisis singkat dan kaitannya dengan bidang program studi. Praktik berisi penerapan nyata dalam konteks program studi (lembaga, masyarakat, atau organisasi di Indonesia) dengan langkah yang jelas.',
    '4. Integrasikan nilai-nilai keislaman secara proporsional bila relevan, misalnya dengan merujuk makna ayat Al-Qur\'an (sebut nama surah dan nomor ayat) atau hadis (sebut perawinya). Jangan menulis aksara Arab; gunakan ejaan Indonesia baku untuk istilah serapan (Al-Qur\'an, hadis, fikih).',
    '5. Kejujuran akademik: jangan mengarang kutipan langsung, nomor halaman, data statistik, tahun terbit, atau judul buku. Sebut hanya tokoh dan teori yang benar-benar dikenal luas. Bagian referensi hanya boleh berisi pustaka yang tercantum pada daftar pustaka RPS (salin persis).',
    '6. Abaikan nama dosen, pengembang RPS, koordinator, atau ketua program studi yang tercantum di RPS; jangan menyebut nama orang tersebut.',
    '7. Format teks di dalam setiap isian: paragraf dipisahkan satu baris kosong; daftar butir diawali "- "; daftar bernomor diawali "1. "; cetak tebal dengan **...**; cetak miring istilah asing dengan *...*. Tabel sederhana boleh memakai format | kolom | kolom |. Jangan memakai judul atau heading (#) di dalam isian.',
    '8. Patuhi target jumlah kata agar keseluruhan modul berjumlah 25–35 halaman A4.',
    '9. Visual: pilih satu bagan yang paling membantu memahami materi — peta_konsep (konsep dan cabangnya), alur (tahapan berurutan), siklus (proses berulang), hierarki (struktur/klasifikasi), piramida (tingkatan), kuadran (matriks 2x2, misalnya SWOT), garis_waktu (kronologi; label = waktu, keterangan = peristiwa), atau perbandingan (2–4 hal yang dibandingkan). Isi 3–6 item; label maksimal 6 kata; keterangan maksimal 15 kata; rincian maksimal 3 butir pendek. Gunakan "tidak_ada" hanya bila bagan sama sekali tidak relevan.'
  ].join('\n');

  AI.courseContext = function (ident, rps, meetings) {
    var lines = ['KONTEKS MATA KULIAH', 'Institusi: Institut Agama Islam Negeri (IAIN) Parepare'];
    if (ident.fakultas) lines.push('Fakultas: ' + ident.fakultas);
    if (ident.prodi) lines.push('Program Studi: ' + ident.prodi);
    lines.push('Mata kuliah: ' + (ident.mataKuliah || rps.mataKuliah) + (ident.kode ? ' (kode ' + ident.kode + ')' : '') + (ident.sks ? ', ' + ident.sks + ' SKS' : '') + (ident.semester ? ', semester ' + ident.semester : ''));
    if (rps.deskripsi) lines.push('Deskripsi: ' + U.oneLine(rps.deskripsi));
    if (rps.cpl.length) { lines.push('CPL:'); rps.cpl.forEach(function (c) { lines.push('- ' + U.oneLine(c)); }); }
    if (rps.cpmk.length) { lines.push('CPMK:'); rps.cpmk.forEach(function (c) { lines.push('- ' + U.oneLine(c)); }); }
    lines.push('Daftar pertemuan materi:');
    meetings.forEach(function (m, i) { lines.push((i + 1) + '. [Minggu ' + m.minggu + '] ' + m.judul); });
    if (rps.pustaka.length) { lines.push('Daftar pustaka RPS:'); rps.pustaka.forEach(function (p, i) { lines.push('[' + (i + 1) + '] ' + U.oneLine(p)); }); }
    else lines.push('Daftar pustaka RPS: (tidak tersedia — kosongkan bagian referensi)');
    return lines.join('\n');
  };

  AI.wordPlan = function (words) {
    var w = Math.max(250, Math.round(words));
    var pct = function (p) { return Math.round((w * p) / 10) * 10; };
    return { total: w, pengantar: pct(0.07), konsep: pct(0.3), teori: pct(0.28), praktik: pct(0.17), rangkuman: pct(0.06), tugas: pct(0.12) };
  };

  AI.meetingPrompt = function (m, idx, list, rps, opts) {
    var plan = AI.wordPlan(opts.words);
    var prev = list[idx - 1], next = list[idx + 1];
    var nLat = opts.latihan ? 3 : 0;
    var d = [
      'Tulis isi modul untuk Pertemuan ' + (idx + 1) + ' (minggu ' + m.minggu + ' pada RPS) dengan judul materi: "' + m.judul + '".',
      '',
      'Data RPS pertemuan ini:',
      '- Sub-CPMK: ' + (U.oneLine(m.subCpmk) || '-'),
      '- Indikator: ' + (U.oneLine(m.indikator) || '-'),
      '- Kriteria & bentuk penilaian: ' + (U.oneLine(m.kriteria) || '-'),
      '- Bentuk/metode pembelajaran & penugasan: ' + (U.oneLine(m.metode) || '-'),
      '- Materi pada RPS: ' + (U.oneLine(m.materi) || m.judul),
      '- Pustaka terkait: ' + (U.oneLine(m.pustaka) || '-'),
      '',
      'Urutan materi: ' + (prev ? 'pertemuan sebelumnya "' + prev.judul + '"' : 'ini pertemuan materi pertama') + '; ' + (next ? 'pertemuan berikutnya "' + next.judul + '"' : 'ini pertemuan materi terakhir') + '. Hindari mengulang materi pertemuan lain.',
      '',
      'Ketentuan panjang: seluruh isian ±' + plan.total + ' kata (toleransi 10%).',
      '- judul: judul materi yang ringkas dan akademik (boleh merapikan judul di atas)',
      '- pengantar: 1 paragraf (±' + plan.pengantar + ' kata)',
      '- tujuan: 3 butir tujuan pembelajaran, diawali kata kerja operasional',
      '- konsep: ' + (plan.total >= 700 ? '2–3' : '2') + ' subbagian, total ±' + plan.konsep + ' kata',
      '- teori: ' + (plan.total >= 700 ? '2–3' : '2') + ' subbagian, total ±' + plan.teori + ' kata',
      '- praktik: pengantar 1 paragraf, 4–5 langkah singkat, dan satu contoh atau studi kasus singkat (total ±' + plan.praktik + ' kata)',
      '- visual: ' + (opts.visual ? 'satu bagan yang paling membantu memahami materi pertemuan ini' : 'isi jenis "tidak_ada" dan item kosong'),
      '- rangkuman: ' + (opts.rangkuman ? '1 paragraf (±' + plan.rangkuman + ' kata)' : 'string kosong'),
      '- tugas: judul, petunjuk 1–2 kalimat, 4 langkah, luaran, alokasi waktu, dan 3–4 aspek penilaian dengan bobot berjumlah 100 (±' + plan.tugas + ' kata)',
      '- latihan: ' + (nLat ? nLat + ' soal uraian yang mengukur tujuan pembelajaran' : 'array kosong'),
      '- referensi: 1–2 pustaka dari daftar pustaka RPS yang paling relevan (salin persis); kosongkan bila tidak ada'
    ];
    return d.join('\n');
  };

  AI.frontPrompt = function (ident) {
    return [
      'Susun bagian pendahuluan dan penutup modul untuk mata kuliah ' + ident.mataKuliah + ':',
      '- kata_pengantar: 3 paragraf (±200 kata) dari sudut pandang penyusun modul; diawali puji syukur kepada Allah Swt. dan selawat kepada Nabi Muhammad saw.; jelaskan bahwa modul disusun berdasarkan RPS dan berisi konsep, teori, praktik, panduan tugas, serta latihan; akhiri dengan harapan dan permohonan saran. Jangan menyebut nama orang dan jangan menulis tempat/tanggal/tanda tangan.',
      '- deskripsi: 1–2 paragraf (±150 kata) deskripsi mata kuliah yang dirapikan dari RPS.',
      '- petunjuk: 5–6 butir petunjuk penggunaan modul bagi mahasiswa.',
      '- penutup: 2 paragraf (±130 kata).'
    ].join('\n');
  };

  var EXTRACT_RULES = [
    'Ekstrak struktur RPS (Rencana Pembelajaran Semester) berikut ke JSON sesuai skema. Ketentuan:',
    '- Ambil identitas mata kuliah (nama, kode, SKS, semester, rumpun, fakultas, program studi), deskripsi, CPL, CPMK, Sub-CPMK, bahan kajian, dan daftar pustaka (satu entri per pustaka).',
    '- JANGAN mengambil nama orang (dosen pengampu, pengembang RPS, koordinator, ketua prodi, pencetak dokumen).',
    '- pertemuan: satu entri per baris minggu pada rencana mingguan, berurutan. Rentang minggu (mis. 14-15) cukup satu entri dengan minggu "14-15".',
    '- Ambil rencana mingguan HANYA dari tabel rencana pembelajaran mingguan (kolom Minggu/Mg Ke-/Sesi Ke-, Sub-CPMK, Indikator, Kriteria, Metode, Materi, Bobot). Abaikan tabel lain yang mirip: rencana evaluasi/penilaian, rubrik, portofolio, peta CPL, lampiran proyek, glosarium/catatan.',
    '- Nomor minggu bisa berada di tengah sel (bukan di baris pertama) dan satu minggu bisa memiliki beberapa sub-baris; gabungkan isinya dalam satu entri.',
    '- jenis: "uts" untuk ujian/evaluasi/penilaian tengah semester; "uas" untuk ujian/evaluasi/penilaian akhir semester; "orientasi" hanya bila seluruh isi minggu itu berupa kontrak kuliah/penjelasan RPS tanpa materi substantif; selain itu "materi" (topik seperti "Orientasi Karyawan" tetap materi).',
    '- judul: judul materi ringkas (3–10 kata, huruf kapital di awal kata sesuai EYD; kata tugas seperti dan/di/ke/dari/yang/untuk/dalam ditulis kecil; singkatan tetap kapital) yang menamai topik utama minggu itu dari kolom materi/bahan kajian. Bila materi berisi daftar subtopik bernomor, beri judul topik utamanya (bukan subtopik pertama). Buang rujukan seperti "[Penulis, 2019]" atau "Pustaka: 1,2". Bila kolom materi kosong, turunkan dari Sub-CPMK atau indikator.',
    '- Bila rencana mingguan tidak ada atau tidak lengkap, susun pertemuan dari daftar bahan kajian/materi pembelajaran secara berurutan (UTS minggu 8, UAS minggu 16).',
    '- Salin teks lainnya apa adanya (spasi boleh dirapikan). Isi string kosong atau array kosong bila tidak ada.'
  ].join('\n');

  /* ---------------- Claude ---------------- */
  function central() { return !!(MRP.server && MRP.server.aiCentral()); }
  function claudeClient(settings) {
    var A = g.Anthropic;
    var opts = { apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 3, timeout: 15 * 60 * 1000 };
    if (central()) {
      // lewat Server Pusat: token sesi menggantikan API key; kunci Anthropic hanya ada di server
      opts.baseURL = MRP.server.base() + '/api/ai';
      opts.apiKey = MRP.server.token();
    } else if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      var dev = U.store.get('mrp.devBaseURL', ''); // hanya untuk pengujian di server pengembangan lokal
      if (dev) opts.baseURL = dev;
    }
    return new A(opts);
  }
  function modelOf(settings) {
    var m = settings.model || AI.DEFAULT_MODEL;
    return central() ? MRP.server.pickModel(m) : m;
  }
  AI.modelOf = modelOf;
  function supportsFallback(model) { return /^claude-(opus|sonnet)-5-5|^claude-opus-5$|^claude-fable/.test(model); }

  AI.friendlyError = function (e) {
    var A = g.Anthropic || {};
    var msg = (e && (e.error && e.error.error && e.error.error.message)) || (e && e.message) || String(e);
    if (A.APIUserAbortError && e instanceof A.APIUserAbortError) return 'Dibatalkan.';
    // pesan dari Server Pusat (kuota habis, model tidak diizinkan, sesi berakhir, …) ditampilkan apa adanya
    if (/\[Server Pusat\]/.test(msg)) {
      if (A.AuthenticationError && e instanceof A.AuthenticationError && MRP.server) MRP.server.expire();
      return msg.replace(/^[\s\S]*?\[Server Pusat\]\s*/, 'Server pusat: ');
    }
    if (central() && A.APIConnectionError && e instanceof A.APIConnectionError && !(A.APIConnectionTimeoutError && e instanceof A.APIConnectionTimeoutError)) return 'Tidak dapat terhubung ke server pusat. Periksa koneksi internet.';
    if (e && e.name === 'AbortError') return 'Dibatalkan.';
    if (A.AuthenticationError && e instanceof A.AuthenticationError) return 'API key Anthropic tidak valid atau kedaluwarsa. Periksa di Pengaturan.';
    if (A.PermissionDeniedError && e instanceof A.PermissionDeniedError) return 'API key tidak memiliki izin untuk model ini.';
    if (A.NotFoundError && e instanceof A.NotFoundError) return 'Model tidak ditemukan. Pilih model lain di Pengaturan.';
    if (A.RateLimitError && e instanceof A.RateLimitError) return 'Batas penggunaan API tercapai. Kurangi penulisan paralel di Pengaturan atau coba lagi beberapa saat.';
    if (A.BadRequestError && e instanceof A.BadRequestError) return 'Permintaan ditolak API: ' + msg;
    if (A.InternalServerError && e instanceof A.InternalServerError) return 'Server AI sedang sibuk atau bermasalah. Coba lagi.';
    if (A.APIConnectionTimeoutError && e instanceof A.APIConnectionTimeoutError) return 'Koneksi ke server AI habis waktu.';
    if (A.APIConnectionError && e instanceof A.APIConnectionError) return 'Tidak dapat terhubung ke server AI. Periksa koneksi internet.';
    if (A.APIError && e instanceof A.APIError) return 'Kesalahan API (' + e.status + '): ' + msg;
    return msg;
  };

  function callClaude(settings, p) {
    return U.libs.anthropic().then(function () {
      var client = claudeClient(settings);
      var model = modelOf(settings);
      var params = {
        model: model,
        max_tokens: p.maxTokens || 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: settings.effort || 'medium', format: { type: 'json_schema', schema: p.schema } },
        system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: p.content }]
      };
      var stream = supportsFallback(model)
        ? client.beta.messages.stream(Object.assign({}, params, { betas: [FALLBACK_BETA], fallbacks: 'default' }), { signal: p.signal })
        : client.messages.stream(params, { signal: p.signal });
      var chars = 0;
      stream.on('text', function (delta) { chars += delta.length; if (p.onProgress) p.onProgress(chars); });
      return stream.finalMessage().then(function (msg) {
        if (msg.stop_reason === 'refusal') {
          var cat = msg.stop_details && msg.stop_details.category ? ' (' + msg.stop_details.category + ')' : '';
          throw new Error('Model menolak permintaan ini' + cat + '. Ubah judul/materi lalu coba lagi.');
        }
        if (msg.stop_reason === 'max_tokens') throw new Error('Keluaran AI terpotong (batas token). Coba lagi atau turunkan target halaman.');
        var text = msg.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        return { data: U.parseJsonLoose(text), usage: msg.usage, model: msg.model };
      });
    }).catch(function (e) { var err = new Error(AI.friendlyError(e)); err.cause = e; err.aborted = /Dibatalkan/.test(err.message); throw err; });
  }

  /* ---------------- AI lokal ---------------- */
  function localBase(settings) { return String(settings.localUrl || 'http://localhost:11434').replace(/\/+$/, ''); }
  function readStream(res, onLine) {
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { if (buf.trim()) onLine(buf); return; }
        buf += dec.decode(r.value, { stream: true });
        var parts = buf.split('\n'); buf = parts.pop();
        parts.forEach(function (l) { if (l.trim()) onLine(l); });
        return pump();
      });
    }
    return pump();
  }
  function schemaHint(schema) { return '\n\nKembalikan HANYA objek JSON valid yang mengikuti skema berikut (tanpa penjelasan lain):\n' + JSON.stringify(schema); }

  function callOllama(settings, p, useSchema) {
    var text = '', chars = 0;
    var body = {
      model: settings.localModel || 'qwen2.5:7b',
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.userText + schemaHint(p.schema) }],
      stream: true,
      format: useSchema === false ? 'json' : p.schema,
      options: { num_ctx: parseInt(settings.localCtx, 10) || 16384, temperature: 0.4 },
      keep_alive: '15m'
    };
    return fetch(localBase(settings) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: p.signal })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) {
          if (useSchema !== false && /format|schema/i.test(t)) return callOllama(settings, p, false);
          throw new Error('Ollama (' + res.status + '): ' + t.slice(0, 200));
        });
        return readStream(res, function (line) {
          var o; try { o = JSON.parse(line); } catch (e) { return; }
          if (o.error) throw new Error('Ollama: ' + o.error);
          if (o.message && o.message.content) { text += o.message.content; chars += o.message.content.length; if (p.onProgress) p.onProgress(chars); }
        }).then(function () { return { data: U.parseJsonLoose(text) }; });
      });
  }

  function callOpenAI(settings, p, mode) {
    mode = mode || 'schema';
    var base = localBase(settings);
    if (!/\/v1$/.test(base)) base += '/v1';
    var body = {
      model: settings.localModel || 'local-model',
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.userText + schemaHint(p.schema) }],
      stream: true,
      temperature: 0.4
    };
    if (mode === 'schema') body.response_format = { type: 'json_schema', json_schema: { name: 'keluaran', schema: p.schema, strict: false } };
    else if (mode === 'object') body.response_format = { type: 'json_object' };
    var headers = { 'Content-Type': 'application/json' };
    if (settings.localKey) headers.Authorization = 'Bearer ' + settings.localKey;
    var text = '';
    return fetch(base + '/chat/completions', { method: 'POST', headers: headers, body: JSON.stringify(body), signal: p.signal })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) {
          if (res.status === 400 && mode === 'schema') return callOpenAI(settings, p, 'object');
          if (res.status === 400 && mode === 'object') return callOpenAI(settings, p, 'none');
          throw new Error('Server AI lokal (' + res.status + '): ' + t.slice(0, 200));
        });
        return readStream(res, function (line) {
          var l = line.trim();
          if (l.indexOf('data:') !== 0) return;
          l = l.slice(5).trim();
          if (l === '[DONE]') return;
          var o; try { o = JSON.parse(l); } catch (e) { return; }
          var d = o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content;
          if (d) { text += d; if (p.onProgress) p.onProgress(text.length); }
        }).then(function () { return { data: U.parseJsonLoose(text) }; });
      });
  }

  function callLocal(settings, p) {
    var fn = settings.localKind === 'openai' ? callOpenAI : callOllama;
    return fn(settings, p).catch(function (e) {
      if (e && e.name === 'AbortError') { var a = new Error('Dibatalkan.'); a.aborted = true; throw a; }
      if (e instanceof TypeError) throw new Error('Tidak dapat terhubung ke server AI lokal di ' + localBase(settings) + '. Pastikan Ollama/LM Studio berjalan' + (location.protocol === 'https:' ? ' dan izinkan asal web ini (OLLAMA_ORIGINS=*)' : '') + '.');
      throw e;
    });
  }

  /* ---------------- API publik ---------------- */
  AI.engineReady = function (engine, settings) {
    if (engine === 'template') return { ok: true };
    var sv = MRP.server, me = sv && sv.connected() ? sv.me() : null;
    if (engine === 'claude') {
      if (!navigator.onLine) return { ok: false, msg: 'Perangkat sedang offline' };
      if (me && me.ai) {
        if (me.ai.central) return me.ai.reason ? { ok: false, msg: 'Server pusat: ' + me.ai.reason } : { ok: true, central: true };
        if (!me.ai.allowPersonalKey) return { ok: false, msg: 'Server pusat: ' + (me.ai.reason || 'AI pusat belum tersedia') };
      }
      if (!settings.apiKey) return { ok: false, msg: 'API key belum diisi (Pengaturan)' };
      return { ok: true };
    }
    if (engine === 'local') {
      if (me && me.ai && me.ai.allowLocal === false) return { ok: false, msg: 'Dinonaktifkan admin server pusat' };
      if (!settings.localModel) return { ok: false, msg: 'Model AI lokal belum diatur (Pengaturan)' };
      return { ok: true };
    }
    return { ok: false, msg: 'Mesin tidak dikenal' };
  };

  AI.test = function (engine, settings) {
    if (engine === 'claude') {
      return U.libs.anthropic().then(function () {
        return claudeClient(settings).models.retrieve(modelOf(settings));
      }).then(function (m) { return 'Terhubung' + (central() ? ' melalui server pusat' : '') + ': ' + (m.display_name || m.id); })
        .catch(function (e) { throw new Error(AI.friendlyError(e)); });
    }
    var base = localBase(settings);
    if (settings.localKind === 'openai') {
      var u = (/\/v1$/.test(base) ? base : base + '/v1') + '/models';
      var h = settings.localKey ? { Authorization: 'Bearer ' + settings.localKey } : {};
      return fetch(u, { headers: h }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { var ids = (j.data || []).map(function (x) { return x.id; }); return 'Terhubung. Model: ' + (ids.slice(0, 5).join(', ') || '(tidak ada)'); })
        .catch(function (e) { throw new Error('Gagal terhubung ke ' + u + ': ' + e.message); });
    }
    return fetch(base + '/api/tags').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var names = (j.models || []).map(function (x) { return x.name; });
        var want = settings.localModel || '';
        var has = names.some(function (n) { return n === want || n.split(':')[0] === want; });
        return 'Terhubung ke Ollama. ' + (want ? (has ? 'Model "' + want + '" tersedia.' : 'Model "' + want + '" BELUM diunduh (jalankan: ollama pull ' + want + ').') : '') + (names.length ? ' Model terpasang: ' + names.slice(0, 6).join(', ') : '');
      })
      .catch(function (e) { throw new Error('Gagal terhubung ke Ollama di ' + base + ' (' + e.message + '). Pastikan Ollama berjalan.'); });
  };

  AI.extractRps = function (engine, settings, ext, opts) {
    opts = opts || {};
    var system = 'Anda adalah asisten akademik yang teliti dalam membaca dokumen RPS perguruan tinggi Indonesia.';
    if (engine === 'claude') {
      var content = [];
      if (ext.kind === 'pdf' && ext.pdfBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ext.pdfBase64 } });
      else content.push({ type: 'text', text: 'TEKS RPS (tabel ditulis sebagai baris | sel | sel |):\n\n' + ext.text });
      content.push({ type: 'text', text: EXTRACT_RULES });
      return callClaude(settings, { system: system, content: content, schema: AI.RPS_SCHEMA, maxTokens: 32000, signal: opts.signal, onProgress: opts.onProgress })
        .then(function (r) { return MRP.parse.fromAi(r.data); });
    }
    var maxChars = Math.max(8000, ((parseInt(settings.localCtx, 10) || 16384) - 5000) * 3);
    var txt = ext.text.length > maxChars ? ext.text.slice(0, maxChars) : ext.text;
    return callLocal(settings, { system: system, userText: EXTRACT_RULES + '\n\nTEKS RPS:\n' + txt, schema: AI.RPS_SCHEMA, signal: opts.signal, onProgress: opts.onProgress })
      .then(function (r) { return MRP.parse.fromAi(r.data); });
  };

  AI.generateMeeting = function (engine, settings, job, opts) {
    // job: {system, userText}
    if (engine === 'claude') {
      return callClaude(settings, { system: job.system, content: [{ type: 'text', text: job.userText }], schema: AI.MEETING_SCHEMA, maxTokens: 32000, signal: opts.signal, onProgress: opts.onProgress })
        .then(function (r) { return { data: r.data, usage: r.usage, model: r.model }; });
    }
    return callLocal(settings, { system: job.system, userText: job.userText, schema: AI.MEETING_SCHEMA, signal: opts.signal, onProgress: opts.onProgress });
  };

  AI.generateFront = function (engine, settings, job, opts) {
    if (engine === 'claude') {
      return callClaude(settings, { system: job.system, content: [{ type: 'text', text: job.userText }], schema: AI.FRONT_SCHEMA, maxTokens: 16000, signal: opts.signal, onProgress: opts.onProgress });
    }
    return callLocal(settings, { system: job.system, userText: job.userText, schema: AI.FRONT_SCHEMA, signal: opts.signal, onProgress: opts.onProgress });
  };

  AI.systemPrompt = function (ident, rps, meetings) {
    return WRITER_RULES + '\n\n' + AI.courseContext(ident, rps, meetings);
  };

  /* Normalisasi + validasi isi pertemuan dari AI */
  function arr(x) { return Array.isArray(x) ? x : x ? [x] : []; }
  function str(x) { return typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim(); }
  function normKey(s) { return String(s || '').toLowerCase().replace(/https?:\S+/g, '').replace(/[^a-z0-9]/g, ''); }

  AI.matchRefs = function (refs, pustaka) {
    if (!pustaka || !pustaka.length) return [];
    var keys = pustaka.map(function (p) { return { p: p, k: normKey(p) }; });
    var out = [];
    refs.forEach(function (r) {
      var nk = normKey(r);
      if (nk.length < 8) return;
      var hit = keys.find(function (o) { return o.k && (o.k.indexOf(nk.slice(0, 28)) >= 0 || nk.indexOf(o.k.slice(0, 28)) >= 0); });
      if (!hit) {
        var ay = String(r).match(/^([A-Za-zÀ-ÿ'’\-]+).*?\((\d{4})/);
        if (ay) hit = keys.find(function (o) { return o.p.toLowerCase().indexOf(ay[1].toLowerCase()) === 0 && o.p.indexOf(ay[2]) >= 0; });
      }
      if (hit && out.indexOf(hit.p) < 0) out.push(hit.p);
    });
    return out;
  };

  AI.normalizeMeeting = function (d, m, rps) {
    d = d && typeof d === 'object' ? d : {};
    var sec = function (x) { return arr(x).map(function (s) { return { subjudul: str(s && s.subjudul), isi: str(s && s.isi) }; }).filter(function (s) { return s.isi; }); };
    var pr = d.praktik || {}, tg = d.tugas || {}, vs = d.visual && typeof d.visual === 'object' ? d.visual : null;
    var out = {
      judul: str(d.judul) || m.judul,
      pengantar: str(d.pengantar),
      tujuan: arr(d.tujuan).map(str).filter(Boolean),
      konsep: sec(d.konsep),
      teori: sec(d.teori),
      praktik: { pengantar: str(pr.pengantar), langkah: arr(pr.langkah).map(str).filter(Boolean), contoh: str(pr.contoh) },
      visual: vs ? { jenis: str(vs.jenis), judul: str(vs.judul), pusat: str(vs.pusat), item: arr(vs.item).map(function (it) { it = it || {}; return { label: str(it.label), keterangan: str(it.keterangan), rincian: arr(it.rincian).map(str).filter(Boolean) }; }).filter(function (it) { return it.label || it.keterangan; }) } : null,
      rangkuman: str(d.rangkuman),
      tugas: {
        judul: str(tg.judul), petunjuk: str(tg.petunjuk), langkah: arr(tg.langkah).map(str).filter(Boolean), luaran: str(tg.luaran), waktu: str(tg.waktu),
        penilaian: arr(tg.penilaian).map(function (p) { p = p || {}; return { aspek: str(p.aspek), bobot: parseInt(p.bobot, 10) || 0 }; }).filter(function (p) { return p.aspek; })
      },
      latihan: arr(d.latihan).map(str).filter(Boolean),
      referensi: AI.matchRefs(arr(d.referensi).map(str).filter(Boolean), rps && rps.pustaka)
    };
    if (!out.konsep.length && !out.teori.length) throw new Error('Keluaran AI tidak lengkap (konsep/teori kosong).');
    if (out.judul.length > 140) out.judul = MRP.parse.cleanTitle(out.judul, 14);
    return out;
  };
})(window);
