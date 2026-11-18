/* app.js — pengendali antarmuka Aplikasi Konversi RPS ke Modul Pembelajaran */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util, $ = U.$, $$ = U.$$;

  var PRODI = {
    'Fakultas Tarbiyah': ['Pendidikan Agama Islam', 'Pendidikan Bahasa Arab', 'Tadris Bahasa Inggris', 'Manajemen Pendidikan Islam', 'Pendidikan Guru Madrasah Ibtidaiyah', 'Pendidikan Islam Anak Usia Dini', 'Tadris Matematika', 'Tadris Biologi'],
    'Fakultas Syariah dan Ilmu Hukum Islam': ['Hukum Keluarga Islam', 'Hukum Ekonomi Syariah', 'Hukum Tata Negara', 'Hukum Pidana Islam'],
    'Fakultas Ushuluddin, Adab, dan Dakwah': ['Manajemen Dakwah', 'Komunikasi dan Penyiaran Islam', 'Bimbingan dan Konseling Islam', 'Pengembangan Masyarakat Islam', 'Ilmu Al-Qur\'an dan Tafsir', 'Jurnalistik Islam', 'Sejarah Peradaban Islam'],
    'Fakultas Ekonomi dan Bisnis Islam': ['Ekonomi Syariah', 'Perbankan Syariah', 'Manajemen Keuangan Syariah', 'Akuntansi Lembaga Keuangan Syariah', 'Manajemen Bisnis Syariah', 'Pariwisata Syariah'],
    'Pascasarjana': ['Pendidikan Agama Islam', 'Hukum Keluarga Islam', 'Ekonomi Syariah', 'Komunikasi dan Penyiaran Islam', 'Manajemen Pendidikan Islam']
  };
  var PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };

  /* ---------------- status ---------------- */
  function newProject() {
    return {
      version: 1,
      ident: { fakultas: '', prodi: '', dosen: '', semester: '', sks: '', tahun: MRP.docmodel.defaultTahun(), mataKuliah: '', kode: '' },
      rps: null,
      options: { engine: '', targetPages: 32, latihan: true, rangkuman: true, visual: true, coverDosen: true, chapterNewPage: false },
      content: { front: null, frontEngine: '', meetings: {} },
      fileName: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    };
  }
  function loadSettings() {
    var s = U.store.get('mrp.settings', {}) || {};
    return Object.assign({ apiKey: '', rememberKey: true, model: MRP.ai.DEFAULT_MODEL, effort: 'medium', localKind: 'ollama', localUrl: 'http://localhost:11434', localModel: '', localCtx: 16384, localKey: '', institusi: 'INSTITUT AGAMA ISLAM NEGERI (IAIN) PAREPARE', kota: 'Parepare', concurrency: 2, logoDataUrl: '' }, s);
  }
  var S = { project: newProject(), settings: loadSettings(), file: null, ext: null, gen: { running: false, ctrl: null, status: {} }, out: {} };
  MRP.app = S; // untuk pemeriksaan/pengujian

  var autosave = U.debounce(function () {
    var ok = U.store.set('mrp.project', S.project);
    if (!ok) U.toast('Penyimpanan otomatis gagal (memori perangkat penuh). Simpan proyek secara manual.', 'warn');
  }, 700);
  function saveSettings() {
    var s = Object.assign({}, S.settings);
    if (!s.rememberKey) s.apiKey = '';
    U.store.set('mrp.settings', s);
  }

  /* ---------------- identitas ---------------- */
  var ID_FIELDS = { inProdi: 'prodi', inDosen: 'dosen', inSemester: 'semester', inSks: 'sks', inTahun: 'tahun', inMk: 'mataKuliah', inKode: 'kode' };
  function fakultasValue() {
    var sel = $('#inFakultas').value;
    return sel === '__lain' ? U.oneLine($('#inFakultasLain').value) : sel;
  }
  function setFakultas(v) {
    var sel = $('#inFakultas');
    var norm = function (s) { return String(s || '').toLowerCase().replace(/^fakultas\s+/, '').replace(/[^a-z]/g, ''); };
    var opt = Array.prototype.find.call(sel.options, function (o) { return o.value && o.value !== '__lain' && norm(o.value) === norm(v); });
    if (opt) { sel.value = opt.value; $('#inFakultasLain').hidden = true; }
    else if (v) { sel.value = '__lain'; $('#inFakultasLain').hidden = false; $('#inFakultasLain').value = v; }
    else { sel.value = ''; $('#inFakultasLain').hidden = true; }
    updateProdiList();
  }
  function updateProdiList() {
    var list = PRODI[$('#inFakultas').value] || [].concat.apply([], Object.keys(PRODI).map(function (k) { return PRODI[k]; }));
    $('#prodiList').innerHTML = list.filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (p) { return '<option value="' + U.esc(p) + '">'; }).join('');
  }
  function identToForm() {
    var id = S.project.ident;
    setFakultas(id.fakultas);
    Object.keys(ID_FIELDS).forEach(function (k) { $('#' + k).value = id[ID_FIELDS[k]] || ''; });
  }
  function bindIdentity() {
    $('#inFakultas').addEventListener('change', function () {
      $('#inFakultasLain').hidden = this.value !== '__lain';
      if (this.value === '__lain') $('#inFakultasLain').focus();
      S.project.ident.fakultas = fakultasValue(); updateProdiList(); autosave();
    });
    $('#inFakultasLain').addEventListener('input', function () { S.project.ident.fakultas = fakultasValue(); autosave(); });
    Object.keys(ID_FIELDS).forEach(function (k) {
      $('#' + k).addEventListener('input', function () { S.project.ident[ID_FIELDS[k]] = this.value; autosave(); });
      $('#' + k).addEventListener('change', function () { S.project.ident[ID_FIELDS[k]] = this.value; autosave(); });
    });
  }
  function validateIdentity() {
    var id = S.project.ident, miss = [];
    if (!U.oneLine(id.fakultas)) miss.push(['inFakultas', 'Fakultas']);
    if (!U.oneLine(id.prodi)) miss.push(['inProdi', 'Program Studi']);
    if (!U.oneLine(id.dosen)) miss.push(['inDosen', 'Dosen Pengampu']);
    if (!U.oneLine(id.semester)) miss.push(['inSemester', 'Semester']);
    if (!U.oneLine(id.sks)) miss.push(['inSks', 'SKS']);
    if (!U.oneLine(id.mataKuliah)) miss.push(['inMk', 'Nama Mata Kuliah']);
    $$('#cardIdentitas input, #cardIdentitas select').forEach(function (e) { e.style.borderColor = ''; });
    if (miss.length) {
      miss.forEach(function (m) { $('#' + m[0]).style.borderColor = 'var(--err)'; });
      $('#cardIdentitas').scrollIntoView({ behavior: 'smooth', block: 'start' });
      U.toast('Lengkapi identitas modul: ' + miss.map(function (m) { return m[1]; }).join(', ') + '.', 'err', 6000);
      return false;
    }
    return true;
  }

  /* ---------------- unggah & analisis ---------------- */
  function setStatus(el, html, kind) {
    el.hidden = !html; el.className = 'status' + (kind ? ' ' + kind : ''); el.innerHTML = html || '';
  }
  function bindUpload() {
    var dz = $('#dropzone'), fi = $('#fileInput');
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
    fi.addEventListener('change', function () { if (fi.files[0]) handleFile(fi.files[0]); fi.value = ''; });
    $('#btnAnalyze').addEventListener('click', function () { if (S.file) analyze(); });
  }

  function handleFile(file) {
    if (S.gen.running) { U.toast('Tunggu proses pembuatan modul selesai.', 'warn'); return Promise.resolve(); }
    if (!/\.(pdf|docx?|PDF|DOCX?)$/.test(file.name) && !/pdf|word|officedocument/.test(file.type)) { U.toast('Format tidak didukung. Pilih berkas PDF atau Word.', 'err'); return Promise.resolve(); }
    S.file = file; S.ext = null;
    var ext = (file.name.split('.').pop() || '').toUpperCase();
    var info = $('#fileInfo');
    info.hidden = false;
    info.innerHTML = '<span class="tag">' + U.esc(ext) + '</span><strong>' + U.esc(file.name) + '</strong><span class="muted small">' + U.formatBytes(file.size) + '</span>';
    $('#btnAnalyze').disabled = false;
    return analyze();
  }

  function aiEngineForExtract() {
    var eng = currentEngine();
    if (eng === 'template') return null;
    return MRP.ai.engineReady(eng, S.settings).ok ? eng : null;
  }

  function analyze() {
    var st = $('#analyzeStatus');
    $('#btnAnalyze').disabled = true;
    setStatus(st, '<span class="spinner"></span>Membaca berkas…');
    return MRP.extract.readFile(S.file, function (msg) { setStatus(st, '<span class="spinner"></span>' + U.esc(msg)); })
      .then(function (ext) {
        S.ext = ext;
        var rps = MRP.parse.parse(ext);
        var useAi = $('#chkAiExtract').checked ? aiEngineForExtract() : null;
        if (ext.isScanned && !useAi) {
          setStatus(st, U.esc(ext.warnings[0]) + ' Anda juga dapat mengisi rencana pertemuan secara manual pada langkah 3.', 'warn');
        }
        if (!useAi) return { rps: rps, ext: ext, via: 'heuristik' };
        setStatus(st, '<span class="spinner"></span>AI sedang membaca RPS (' + (useAi === 'claude' ? 'Claude' : 'AI lokal') + ')… <span id="aiChars"></span>');
        var ctrl = new AbortController();
        return MRP.ai.extractRps(useAi, S.settings, ext, { signal: ctrl.signal, onProgress: function (n) { var e = $('#aiChars'); if (e) e.textContent = n + ' karakter'; } })
          .then(function (airps) {
            if (airps.pertemuan.filter(function (m) { return m.jenis === 'materi'; }).length >= 2) {
              ['mataKuliah', 'kode', 'sks', 'semester', 'deskripsi', 'fakultas', 'prodi', 'rumpun'].forEach(function (k) { if (!airps[k] && rps[k]) airps[k] = rps[k]; });
              ['cpl', 'cpmk', 'pustaka', 'bahanKajian'].forEach(function (k) { if (!airps[k].length && rps[k].length) airps[k] = rps[k]; });
              return { rps: airps, ext: ext, via: 'AI' };
            }
            rps.warnings.push('AI tidak menemukan rencana pertemuan yang lengkap; hasil pembacaan otomatis biasa dipakai.');
            return { rps: rps, ext: ext, via: 'heuristik' };
          })
          .catch(function (e) {
            rps.warnings.push('Pembacaan dengan AI gagal (' + e.message + '). Dipakai hasil pembacaan otomatis biasa.');
            return { rps: rps, ext: ext, via: 'heuristik' };
          });
      })
      .then(function (r) {
        applyRps(r.rps, r.ext);
        var n = r.rps.pertemuan.filter(function (m) { return m.jenis === 'materi'; }).length;
        var warn = (r.ext.warnings || []).concat(r.rps.warnings || []);
        setStatus(st, '✔ RPS terbaca (' + r.via + '): <b>' + U.esc(r.rps.mataKuliah || S.project.ident.mataKuliah || 'mata kuliah') + '</b>, ' + n + ' pertemuan materi.' + (warn.length ? ' Periksa catatan pada langkah 3.' : ''), n ? 'ok' : 'warn');
        $('#cardReview').hidden = false; $('#cardGenerate').hidden = false;
        setTimeout(function () { $('#cardReview').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
      })
      .catch(function (e) {
        console.error(e);
        setStatus(st, '✖ ' + U.esc(e.message || String(e)), 'err');
      })
      .then(function () { $('#btnAnalyze').disabled = !S.file; });
  }

  function applyRps(rps, ext) {
    var p = S.project;
    p.rps = rps;
    p.fileName = S.file ? S.file.name : p.fileName;
    p.content = { front: null, frontEngine: '', meetings: {} };
    p.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    S.out = {};
    var id = p.ident, filled = [];
    var setIf = function (k, v, label) { if (v && !U.oneLine(id[k])) { id[k] = v; filled.push(label); } };
    setIf('mataKuliah', rps.mataKuliah, 'Mata Kuliah');
    setIf('kode', rps.kode, 'Kode');
    setIf('sks', rps.sks, 'SKS');
    setIf('semester', rps.semester, 'Semester');
    setIf('fakultas', rps.fakultas, 'Fakultas');
    setIf('prodi', rps.prodi, 'Program Studi');
    identToForm();
    var hint = $('#identHint');
    hint.hidden = !filled.length;
    hint.textContent = filled.length ? 'Terisi otomatis dari RPS: ' + filled.join(', ') + '. Periksa kembali — isian manual adalah acuan modul. Nama dosen tetap diisi manual.' : '';
    renderReview();
    renderGenList();
    $('#cardOutput').hidden = true;
    autosave();
  }

  /* ---------------- tinjau ---------------- */
  function linesToArr(v) { return String(v || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function renderReview() {
    var r = S.project.rps;
    if (!r) return;
    $('#rvDeskripsi').value = r.deskripsi || '';
    $('#rvCpl').value = (r.cpl || []).join('\n');
    $('#rvCpmk').value = (r.cpmk || []).join('\n');
    $('#rvPustaka').value = (r.pustaka || []).join('\n');
    var w = $('#reviewWarnings');
    w.innerHTML = (r.warnings || []).concat(S.ext && S.ext.warnings ? S.ext.warnings : []).filter(function (x, i, a) { return a.indexOf(x) === i; })
      .map(function (x) { return '<div class="warn-box">⚠ ' + U.esc(x) + '</div>'; }).join('');
    renderMeetings();
  }
  function renderMeetings() {
    var r = S.project.rps, tb = $('#meetingTable tbody');
    tb.innerHTML = '';
    r.pertemuan.forEach(function (m, idx) {
      var tr = U.el('tr', { class: m.jenis === 'materi' ? '' : 'non-materi' });
      var wk = U.el('input', { value: m.minggu, 'aria-label': 'Minggu' });
      wk.addEventListener('change', function () { m.minggu = this.value.trim(); autosave(); renderGenList(); });
      var sel = U.el('select', { 'aria-label': 'Jenis' }, ['materi', 'orientasi', 'uts', 'uas'].map(function (v) {
        return U.el('option', { value: v, text: { materi: 'Materi', orientasi: 'Orientasi', uts: 'UTS', uas: 'UAS' }[v], selected: m.jenis === v });
      }));
      sel.addEventListener('change', function () { m.jenis = this.value; tr.className = m.jenis === 'materi' ? '' : 'non-materi'; updateCount(); autosave(); renderGenList(); });
      var tt = U.el('input', { value: m.judul, 'aria-label': 'Judul materi' });
      tt.addEventListener('change', function () { m.judul = this.value.trim(); autosave(); renderGenList(); });
      var sc = U.el('textarea', { rows: 2, 'aria-label': 'Sub-CPMK' });
      sc.value = U.oneLine(m.subCpmk || m.indikator || '');
      sc.addEventListener('change', function () { m.subCpmk = this.value.trim(); autosave(); });
      var del = U.el('button', { class: 'btn btn-small btn-ghost', title: 'Hapus baris', text: '✕' });
      del.addEventListener('click', function () { r.pertemuan.splice(idx, 1); delete S.project.content.meetings[m.id]; renderMeetings(); renderGenList(); autosave(); });
      [wk, sel, tt, sc, del].forEach(function (e) { tr.appendChild(U.el('td', null, e)); });
      tb.appendChild(tr);
    });
    updateCount();
  }
  function updateCount() {
    var r = S.project.rps;
    var n = r ? r.pertemuan.filter(function (m) { return m.jenis === 'materi'; }).length : 0;
    $('#meetingCount').textContent = n + ' pertemuan materi';
  }
  function bindReview() {
    var map = { rvDeskripsi: 'deskripsi', rvCpl: 'cpl', rvCpmk: 'cpmk', rvPustaka: 'pustaka' };
    Object.keys(map).forEach(function (k) {
      $('#' + k).addEventListener('change', function () {
        if (!S.project.rps) return;
        S.project.rps[map[k]] = k === 'rvDeskripsi' ? this.value.trim() : linesToArr(this.value);
        autosave();
      });
    });
    $('#btnAddMeeting').addEventListener('click', function () {
      if (!S.project.rps) S.project.rps = MRP.parse.emptyRps();
      var list = S.project.rps.pertemuan;
      var last = list.length ? parseInt(list[list.length - 1].minggu, 10) || list.length : 0;
      list.push({ id: 'm' + U.uid(), minggu: String(last + 1), jenis: 'materi', judul: '', subCpmk: '', indikator: '', kriteria: '', metode: '', materi: '', pustaka: '', bobot: '' });
      $('#cardReview').hidden = false; $('#cardGenerate').hidden = false;
      renderMeetings(); renderGenList(); autosave();
      var inputs = $$('#meetingTable tbody tr:last-child input');
      if (inputs[1]) inputs[1].focus();
    });
  }

  /* ---------------- mesin ---------------- */
  function currentEngine() {
    var e = S.project.options.engine;
    if (e) return e;
    if (S.settings.apiKey) return 'claude';
    if (S.settings.localModel) return 'local';
    return 'template';
  }
  function renderEngines() {
    var eng = currentEngine();
    $$('input[name="engine"]').forEach(function (r) { r.checked = r.value === eng; });
    $$('.engine-state').forEach(function (el) {
      var k = el.getAttribute('data-engine');
      if (k === 'template') return;
      var st = MRP.ai.engineReady(k, S.settings);
      el.textContent = st.ok ? (k === 'claude' ? 'Siap — ' + modelLabel(S.settings.model) : 'Siap — ' + S.settings.localModel) : st.msg;
      el.className = 'engine-state ' + (st.ok ? 'ok' : 'bad');
    });
  }
  function modelLabel(m) { return { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' }[m] || m; }
  function bindGenerate() {
    $$('input[name="engine"]').forEach(function (r) { r.addEventListener('change', function () { S.project.options.engine = this.value; renderEngines(); autosave(); }); });
    var rng = $('#inPages');
    rng.addEventListener('input', function () { $('#pageTargetLabel').textContent = this.value; S.project.options.targetPages = +this.value; autosave(); });
    [['optLatihan', 'latihan'], ['optRangkuman', 'rangkuman'], ['optVisual', 'visual'], ['optCoverDosen', 'coverDosen'], ['optNewPage', 'chapterNewPage']].forEach(function (p) {
      $('#' + p[0]).addEventListener('change', function () { S.project.options[p[1]] = this.checked; autosave(); });
    });
    $('#btnGenerate').addEventListener('click', function () { generate(false); });
    $('#btnStop').addEventListener('click', function () { if (S.gen.ctrl) S.gen.ctrl.abort(); S.gen.stopped = true; });
    $('#btnRetryFailed').addEventListener('click', function () { generate(true); });
    $('#btnFillTemplate').addEventListener('click', fillFailedWithTemplate);
  }
  function optionsToForm() {
    var o = S.project.options;
    $('#inPages').value = o.targetPages || 32; $('#pageTargetLabel').textContent = o.targetPages || 32;
    $('#optLatihan').checked = o.latihan !== false; $('#optRangkuman').checked = o.rangkuman !== false;
    $('#optVisual').checked = o.visual !== false; $('#optCoverDosen').checked = o.coverDosen !== false;
    $('#optNewPage').checked = !!o.chapterNewPage;
    renderEngines();
  }

  /* ---------------- daftar progres ---------------- */
  function materiMeetings() { return S.project.rps ? S.project.rps.pertemuan.filter(function (m) { return m.jenis === 'materi'; }) : []; }
  function renderGenList() {
    var ul = $('#genList');
    ul.innerHTML = '';
    var list = materiMeetings();
    list.forEach(function (m, i) {
      var rec = S.project.content.meetings[m.id];
      var st = S.gen.status[m.id] || (rec && rec.data ? { s: 'done', note: rec.engine === 'template' ? 'Template' : 'AI' } : { s: 'idle' });
      ul.appendChild(genItem(m.id, 'Pertemuan ' + (i + 1) + ': ' + ((rec && rec.data && rec.data.judul) || m.judul || '(tanpa judul)'), st, true));
    });
    if (list.length) {
      var fst = S.gen.status.__front || (S.project.content.front ? { s: 'done', note: S.project.content.frontEngine === 'template' ? 'Template' : 'AI' } : { s: 'idle' });
      ul.appendChild(genItem('__front', 'Kata pengantar, deskripsi, petunjuk & penutup', fst, false));
    }
  }
  var ICON = { idle: '○', wait: '⏳', run: '✍', done: '✔', fail: '✖' };
  function genItem(id, title, st, viewable) {
    var cls = { run: 'run', done: 'done', fail: 'fail' }[st.s] || '';
    var li = U.el('li', { class: 'gen-item ' + cls, 'data-id': id });
    li.appendChild(U.el('span', { class: 'gi-status', text: ICON[st.s] || '○' }));
    var t = U.el('div', { class: 'gi-title' }, [title, U.el('small', { text: st.note || { idle: 'Belum dibuat', wait: 'Menunggu antrean…', run: 'Sedang ditulis…', done: 'Selesai', fail: 'Gagal' }[st.s] })]);
    if (st.s === 'run') { var bar = U.el('div', { class: 'bar' }, U.el('i')); bar.firstChild.style.width = (st.pct || 3) + '%'; t.appendChild(bar); }
    li.appendChild(t);
    var acts = U.el('div', { class: 'gi-actions' });
    if (viewable && S.project.content.meetings[id] && S.project.content.meetings[id].data) acts.appendChild(U.el('button', { class: 'btn btn-small btn-ghost', text: 'Lihat', onclick: function () { viewMeeting(id); } }));
    if (!S.gen.running && id !== '__front') acts.appendChild(U.el('button', { class: 'btn btn-small btn-ghost', title: 'Buat ulang pertemuan ini', text: '↻', onclick: function () { regenOne(id); } }));
    li.appendChild(acts);
    return li;
  }
  function setGen(id, st) {
    S.gen.status[id] = st;
    var li = $('#genList li[data-id="' + id + '"]');
    if (!li) return;
    var title = li.querySelector('.gi-title').firstChild.textContent;
    if (id !== '__front') {
      var rec = S.project.content.meetings[id];
      var idx = materiMeetings().findIndex(function (m) { return m.id === id; });
      var m = materiMeetings()[idx];
      if (m) title = 'Pertemuan ' + (idx + 1) + ': ' + ((rec && rec.data && rec.data.judul) || m.judul);
    }
    li.replaceWith(genItem(id, title, st, id !== '__front'));
  }

  /* ---------------- pembuatan isi ---------------- */
  function genContext() {
    var p = S.project, list = materiMeetings();
    var ident = Object.assign({}, p.ident, { fakultas: MRP.docmodel.fakultasLabel(p.ident.fakultas), prodi: p.ident.prodi.replace(/^program studi\s+/i, '') });
    var words = MRP.docmodel.planWords(p.options.targetPages || 32, list.length, p.options);
    return { ident: ident, list: list, words: words, system: MRP.ai.systemPrompt(ident, p.rps, list) };
  }
  function addUsage(u) {
    if (!u) return;
    var us = S.project.usage;
    us.input += u.input_tokens || 0; us.output += u.output_tokens || 0;
    us.cacheRead += u.cache_read_input_tokens || 0; us.cacheWrite += u.cache_creation_input_tokens || 0;
  }
  function usageText() {
    var us = S.project.usage;
    if (!us || !(us.input + us.output)) return '';
    var pr = PRICE[S.settings.model] || PRICE['claude-opus-5-5'];
    var cost = (us.input * pr[0] + us.cacheWrite * pr[0] * 1.25 + us.cacheRead * pr[0] * 0.1 + us.output * pr[1]) / 1e6;
    return ' Pemakaian API: ' + Math.round((us.input + us.cacheRead + us.cacheWrite) / 1000) + 'K token masukan, ' + Math.round(us.output / 1000) + 'K token keluaran (perkiraan US$' + cost.toFixed(2) + ').';
  }

  function generateMeetingContent(engine, ctx, m, signal) {
    var idx = ctx.list.indexOf(m);
    if (engine === 'template') {
      return Promise.resolve({ data: MRP.template.meeting(S.project.rps, m, { mataKuliah: ctx.ident.mataKuliah, prodi: ctx.ident.prodi, index: idx, next: ctx.list[idx + 1], words: ctx.words }) });
    }
    var expected = ctx.words * 8 + 900;
    var job = { system: ctx.system, userText: MRP.ai.meetingPrompt(m, idx, ctx.list, S.project.rps, { words: ctx.words, latihan: S.project.options.latihan !== false, rangkuman: S.project.options.rangkuman !== false, visual: S.project.options.visual !== false }) };
    var attempt = function (n) {
      return MRP.ai.generateMeeting(engine, S.settings, job, {
        signal: signal,
        onProgress: function (chars) {
          var li = $('#genList li[data-id="' + m.id + '"] .bar > i');
          var pct = Math.min(96, Math.round((chars / expected) * 100));
          S.gen.status[m.id] = { s: 'run', pct: pct, note: 'Sedang ditulis… ' + pct + '%' };
          if (li) { li.style.width = pct + '%'; li.parentNode.previousSibling.textContent = 'Sedang ditulis… ' + pct + '%'; }
        }
      }).then(function (r) {
        addUsage(r.usage);
        return { data: MRP.ai.normalizeMeeting(r.data, m, S.project.rps) };
      }).catch(function (e) {
        if (e.aborted || signal.aborted || n >= 1) throw e;
        return U.sleep(2500).then(function () { return attempt(n + 1); });
      });
    };
    return attempt(0);
  }

  function runPool(items, n, fn) {
    var i = 0;
    var worker = function () {
      if (S.gen.stopped || i >= items.length) return Promise.resolve();
      var it = items[i++];
      return fn(it).then(worker, worker);
    };
    var ws = [];
    for (var k = 0; k < Math.max(1, Math.min(n, items.length)); k++) ws.push(worker());
    return Promise.all(ws);
  }

  function generate(onlyFailed, onlyIds) {
    if (S.gen.running) return;
    if (!S.project.rps) { U.toast('Unggah dan analisis RPS terlebih dahulu.', 'err'); return; }
    if (!validateIdentity()) return;
    var engine = currentEngine();
    var ready = MRP.ai.engineReady(engine, S.settings);
    if (!ready.ok) { U.toast('Mesin belum siap: ' + ready.msg + '. Buka Pengaturan atau pilih mode Template.', 'err', 6000); return; }
    var ctx = genContext();
    if (!ctx.list.length) { U.toast('Belum ada pertemuan berjenis Materi pada langkah 3.', 'err'); return; }
    var content = S.project.content;
    var todo;
    if (onlyIds) todo = ctx.list.filter(function (m) { return onlyIds.indexOf(m.id) >= 0; });
    else if (onlyFailed) todo = ctx.list.filter(function (m) { return !(content.meetings[m.id] && content.meetings[m.id].data); });
    else {
      var missing = ctx.list.filter(function (m) { return !(content.meetings[m.id] && content.meetings[m.id].data); });
      if (!missing.length) {
        if (!g.confirm('Semua pertemuan sudah memiliki isi. Buat ulang seluruh isi modul?')) { buildDocuments(); return; }
        todo = ctx.list.slice();
        content.front = null;
      } else todo = missing;
    }
    var needFront = !onlyIds && (!content.front || onlyFailed === false && !todo.length);
    S.gen.running = true; S.gen.stopped = false; S.gen.status = {};
    S.gen.ctrl = new AbortController();
    var signal = S.gen.ctrl.signal;
    todo.forEach(function (m) { S.gen.status[m.id] = { s: 'wait' }; });
    if (needFront || !content.front) S.gen.status.__front = { s: 'wait' };
    renderGenList();
    $('#btnGenerate').disabled = true; $('#btnStop').hidden = false; $('#btnRetryFailed').hidden = true; $('#btnFillTemplate').hidden = true;
    var summary = $('#genSummary');
    setStatus(summary, '<span class="spinner"></span>Menyusun isi ' + todo.length + ' pertemuan dengan ' + (engine === 'claude' ? 'AI Claude (' + modelLabel(S.settings.model) + ')' : engine === 'local' ? 'AI lokal' : 'mode Template') + ' — target ±' + ctx.words + ' kata per pertemuan…');
    var fails = 0;
    var conc = engine === 'claude' ? parseInt(S.settings.concurrency, 10) || 2 : engine === 'local' ? 1 : 4;
    var started = Date.now();
    return runPool(todo, conc, function (m) {
      setGen(m.id, { s: 'run', pct: 2 });
      return generateMeetingContent(engine, ctx, m, signal).then(function (res) {
        content.meetings[m.id] = { data: res.data, engine: engine, at: Date.now() };
        setGen(m.id, { s: 'done', note: engine === 'template' ? 'Template' : 'Selesai' });
        autosave();
      }).catch(function (e) {
        fails++;
        setGen(m.id, { s: 'fail', note: 'Gagal: ' + e.message });
      });
    }).then(function () {
      if (S.gen.stopped) return;
      if (content.front && !S.gen.status.__front) return;
      setGen('__front', { s: 'run', pct: 10 });
      if (engine === 'template') { content.front = MRP.template.front(S.project.rps, ctx.ident); content.frontEngine = 'template'; setGen('__front', { s: 'done', note: 'Template' }); return; }
      return MRP.ai.generateFront(engine, S.settings, { system: ctx.system, userText: MRP.ai.frontPrompt(ctx.ident) }, { signal: signal }).then(function (r) {
        addUsage(r.usage);
        var d = r.data || {}, tf = MRP.template.front(S.project.rps, ctx.ident);
        content.front = {
          kata_pengantar: String(d.kata_pengantar || '').trim() || tf.kata_pengantar,
          deskripsi: String(d.deskripsi || '').trim() || tf.deskripsi,
          petunjuk: Array.isArray(d.petunjuk) && d.petunjuk.length ? d.petunjuk.map(String) : tf.petunjuk,
          penutup: String(d.penutup || '').trim() || tf.penutup
        };
        content.frontEngine = engine;
        setGen('__front', { s: 'done', note: 'Selesai' });
      }).catch(function (e) {
        content.front = MRP.template.front(S.project.rps, ctx.ident); content.frontEngine = 'template';
        setGen('__front', { s: 'done', note: 'Template (AI gagal: ' + e.message + ')' });
      });
    }).then(function () {
      S.gen.running = false;
      $('#btnGenerate').disabled = false; $('#btnStop').hidden = true;
      autosave();
      var secs = Math.round((Date.now() - started) / 1000);
      var missing = ctx.list.filter(function (m) { return !(content.meetings[m.id] && content.meetings[m.id].data); });
      renderGenList();
      if (S.gen.stopped) {
        setStatus(summary, 'Dihentikan. ' + (ctx.list.length - missing.length) + ' dari ' + ctx.list.length + ' pertemuan sudah berisi.' + usageText(), 'warn');
        $('#btnRetryFailed').hidden = !missing.length; $('#btnFillTemplate').hidden = !missing.length;
        return;
      }
      if (missing.length) {
        setStatus(summary, '⚠ ' + missing.length + ' pertemuan gagal dibuat. Ulangi, atau isi dengan template lalu susun dokumen.' + usageText(), 'warn');
        $('#btnRetryFailed').hidden = false; $('#btnFillTemplate').hidden = false;
        return;
      }
      setStatus(summary, '✔ Isi modul selesai dalam ' + secs + ' detik.' + usageText(), 'ok');
      return buildDocuments();
    });
  }

  function regenOne(id) {
    if (S.gen.running) return;
    var m = materiMeetings().find(function (x) { return x.id === id; });
    if (!m) return;
    generate(false, [id]);
  }
  function fillFailedWithTemplate() {
    var ctx = genContext(), content = S.project.content;
    ctx.list.forEach(function (m, i) {
      if (!(content.meetings[m.id] && content.meetings[m.id].data)) content.meetings[m.id] = { data: MRP.template.meeting(S.project.rps, m, { mataKuliah: ctx.ident.mataKuliah, prodi: ctx.ident.prodi, index: i, next: ctx.list[i + 1], words: ctx.words }), engine: 'template', at: Date.now() };
    });
    if (!content.front) { content.front = MRP.template.front(S.project.rps, ctx.ident); content.frontEngine = 'template'; }
    S.gen.status = {};
    renderGenList(); autosave();
    $('#btnRetryFailed').hidden = true; $('#btnFillTemplate').hidden = true;
    buildDocuments();
  }

  /* ---------------- dokumen ---------------- */
  function loadLogo() {
    var src = S.settings.logoDataUrl;
    var p = src ? Promise.resolve(src) : U.fetchDataUrl('img/logo-iain.png');
    return p.then(function (d) { return U.imageSize(d).then(function (sz) { return { dataUrl: d, w: sz.w, h: sz.h }; }); }).catch(function () { return null; });
  }
  function buildDocuments() {
    if (!S.project.rps) return Promise.resolve();
    var card = $('#cardOutput'), st = $('#buildStatus');
    card.hidden = false;
    ['#btnDlPdf', '#btnDlDocx', '#btnPreviewPdf', '#btnBuild'].forEach(function (s) { $(s).disabled = true; });
    $('#previewWrap').hidden = true;
    setStatus(st, '<span class="spinner"></span>Menyiapkan gambar dan dokumen…');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var p = S.project;
    return loadLogo().then(function (logo) {
      var assets = { logo: logo, diagrams: {} };
      if (p.options.visual !== false) {
        materiMeetings().forEach(function (m) {
          var rec = p.content.meetings[m.id];
          var c = rec && rec.data;
          if (c && c.visual && MRP.diagram.isRenderable(c.visual) && MRP.diagram.normalizeType(c.visual.jenis) !== 'perbandingan') {
            try { assets.diagrams[m.id] = MRP.diagram.render(c.visual); } catch (e) { console.warn('diagram', e); }
          }
        });
      }
      var doc = MRP.docmodel.build(p, assets, S.settings);
      S.out.doc = doc;
      return MRP.pdf.render(doc, { targetPages: p.options.targetPages || 32, onStatus: function (m) { setStatus(st, '<span class="spinner"></span>' + U.esc(m)); } })
        .then(function (res) {
          S.out.pdf = res.blob; S.out.pages = res.pages; S.out.preset = res.preset; S.out.toc = res.toc; S.out.layout = res;
          setStatus(st, '<span class="spinner"></span>Membuat berkas Word…');
          return MRP.docx.build(doc, res.preset, { toc: res.toc, newPage: res.newPage });
        })
        .then(function (docx) {
          S.out.docx = docx;
          var P = S.out.preset, pages = S.out.pages;
          var spasi = String(P.lh).replace('.', ',');
          var msg = '✔ Modul siap: <b>' + pages + ' halaman</b> (A4, Times New Roman ' + String(P.fs).replace('.', ',') + ' pt, spasi ' + spasi + ').';
          var kind = 'ok';
          if (pages > 35) { msg += ' Jumlah halaman melebihi 35 — turunkan target halaman lalu buat ulang isi, atau matikan latihan/rangkuman.'; kind = 'warn'; }
          if (pages < 25) { msg += ' Jumlah halaman kurang dari 25 — naikkan target halaman lalu buat ulang isi' + (materiMeetings().length < 10 ? ' (jumlah pertemuan materi sedikit)' : '') + '.'; kind = 'warn'; }
          var tpl = materiMeetings().filter(function (m) { var r = p.content.meetings[m.id]; return !r || r.engine === 'template'; }).length;
          if (tpl) msg += ' ' + tpl + ' pertemuan memakai isi Template (tanpa AI) — lengkapi uraiannya di Word.';
          setStatus(st, msg, kind);
          ['#btnDlPdf', '#btnDlDocx', '#btnBuild'].forEach(function (s) { $(s).disabled = false; });
          $('#btnPreviewPdf').disabled = U.isNative();
        });
    }).catch(function (e) {
      console.error(e);
      setStatus(st, '✖ Gagal menyusun dokumen: ' + U.esc(e.message || String(e)), 'err');
      $('#btnBuild').disabled = false;
    });
  }
  function baseName() { return 'Modul Pembelajaran - ' + U.safeFileName(S.project.ident.mataKuliah || 'Mata Kuliah'); }
  function bindOutput() {
    $('#btnBuild').addEventListener('click', function () { buildDocuments(); });
    $('#btnDlPdf').addEventListener('click', function () { if (S.out.pdf) U.saveBlob(S.out.pdf, baseName() + '.pdf').then(savedToast); });
    $('#btnDlDocx').addEventListener('click', function () { if (S.out.docx) U.saveBlob(S.out.docx, baseName() + '.docx').then(savedToast); });
    $('#btnPreviewPdf').addEventListener('click', function () {
      var w = $('#previewWrap');
      if (!S.out.pdf) return;
      if (!w.hidden) { w.hidden = true; return; }
      if (S.out.previewUrl) URL.revokeObjectURL(S.out.previewUrl);
      S.out.previewUrl = URL.createObjectURL(S.out.pdf);
      w.innerHTML = '<iframe title="Pratinjau PDF" src="' + S.out.previewUrl + '"></iframe>';
      w.hidden = false;
    });
  }
  function savedToast(r) { U.toast(r && r.native ? 'Berkas disimpan; pilih aplikasi untuk menyimpan/membagikan.' : 'Berkas diunduh.', 'ok'); }

  /* ---------------- pratinjau isi pertemuan ---------------- */
  function viewMeeting(id) {
    var rec = S.project.content.meetings[id];
    if (!rec || !rec.data) return;
    var c = rec.data, h = '';
    var sec = function (t, body) { if (body) h += '<h3>' + U.esc(t) + '</h3>' + body; };
    if (c.pengantar) h += U.mdToHtml(c.pengantar);
    sec('Tujuan Pembelajaran', '<ol>' + (c.tujuan || []).map(function (t) { return '<li>' + U.esc(t) + '</li>'; }).join('') + '</ol>');
    sec('Konsep', (c.konsep || []).map(function (k) { return '<h4>' + U.esc(k.subjudul) + '</h4>' + U.mdToHtml(k.isi); }).join(''));
    if (S.project.options.visual !== false && c.visual && MRP.diagram.isRenderable(c.visual)) {
      try { var im = MRP.diagram.render(c.visual); if (im) h += '<p style="text-align:center"><img src="' + im.dataUrl + '" alt=""><br><i>' + U.esc(c.visual.judul || '') + '</i></p>'; } catch (e) { /* abaikan */ }
    }
    sec('Teori', (c.teori || []).map(function (k) { return '<h4>' + U.esc(k.subjudul) + '</h4>' + U.mdToHtml(k.isi); }).join(''));
    var pk = c.praktik || {};
    sec('Praktik', U.mdToHtml(pk.pengantar || '') + ((pk.langkah || []).length ? '<ol>' + pk.langkah.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ol>' : '') + (pk.contoh ? '<div class="box">' + U.mdToHtml(pk.contoh) + '</div>' : ''));
    if (c.rangkuman) sec('Rangkuman', U.mdToHtml(c.rangkuman));
    var tg = c.tugas || {};
    sec('Panduan Tugas', '<div class="box"><b>' + U.esc(tg.judul || '') + '</b>' + U.mdToHtml(tg.petunjuk || '') + '<ol>' + (tg.langkah || []).map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ol>' + (tg.luaran ? '<p><b>Luaran:</b> ' + U.esc(tg.luaran) + '</p>' : '') + ((tg.penilaian || []).length ? '<table>' + tg.penilaian.map(function (p) { return '<tr><td>' + U.esc(p.aspek) + '</td><td>' + U.esc(p.bobot) + '%</td></tr>'; }).join('') + '</table>' : '') + '</div>');
    if ((c.latihan || []).length) sec('Latihan', '<ol>' + c.latihan.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ol>');
    if ((c.referensi || []).length) sec('Referensi', '<ul>' + c.referensi.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>');
    $('#viewTitle').textContent = c.judul || 'Isi pertemuan';
    $('#viewBody').innerHTML = h;
    openModal('#viewModal');
  }

  /* ---------------- modal & pengaturan ---------------- */
  function openModal(sel) { var m = $(sel); m.hidden = false; var f = m.querySelector('input,select,button:not([data-close])'); if (f) setTimeout(function () { f.focus(); }, 50); }
  function closeModal(m) { m.hidden = true; }
  function bindModals() {
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-close')) closeModal(m); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.modal').forEach(function (m) { if (!m.hidden) closeModal(m); }); });
    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
        $$('.tab-panel').forEach(function (p) { p.hidden = p.id !== t.getAttribute('data-tab'); });
      });
    });
    $('#btnSettings').addEventListener('click', function () { settingsToForm(); openModal('#settingsModal'); });
    $('#btnToggleKey').addEventListener('click', function () { var i = $('#setApiKey'); i.type = i.type === 'password' ? 'text' : 'password'; this.textContent = i.type === 'password' ? 'Lihat' : 'Sembunyikan'; });
    $('#btnSaveSettings').addEventListener('click', function () { formToSettings(); saveSettings(); renderEngines(); applyBranding(); closeModal($('#settingsModal')); U.toast('Pengaturan disimpan.', 'ok'); });
    $('#btnTestClaude').addEventListener('click', function () { formToSettings(); testEngine('claude', '#testClaudeResult'); });
    $('#btnTestLocal').addEventListener('click', function () { formToSettings(); testEngine('local', '#testLocalResult'); });
    $('#setLocalKind').addEventListener('change', function () {
      var u = $('#setLocalUrl');
      if (this.value === 'openai' && /11434/.test(u.value)) u.value = 'http://localhost:1234/v1';
      if (this.value === 'ollama' && /1234/.test(u.value)) u.value = 'http://localhost:11434';
    });
    $('#btnLogoChange').addEventListener('click', function () { $('#logoInput').click(); });
    $('#logoInput').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      U.readAsDataURL(f).then(function (d) { S._pendingLogo = d; $('#setLogoPreview').src = d; });
      this.value = '';
    });
    $('#btnLogoReset').addEventListener('click', function () { S._pendingLogo = ''; $('#setLogoPreview').src = 'img/logo-iain.png'; });
  }
  function settingsToForm() {
    var s = S.settings;
    $('#setApiKey').value = s.apiKey || ''; $('#setRememberKey').checked = s.rememberKey !== false;
    $('#setModel').value = s.model || MRP.ai.DEFAULT_MODEL; $('#setEffort').value = s.effort || 'medium';
    $('#setLocalKind').value = s.localKind || 'ollama'; $('#setLocalUrl').value = s.localUrl || ''; $('#setLocalModel').value = s.localModel || '';
    $('#setLocalCtx').value = s.localCtx || 16384; $('#setLocalKey').value = s.localKey || '';
    $('#setInstitusi').value = s.institusi || ''; $('#setKota').value = s.kota || ''; $('#setConcurrency').value = String(s.concurrency || 2);
    S._pendingLogo = undefined;
    $('#setLogoPreview').src = s.logoDataUrl || 'img/logo-iain.png';
    $('#testClaudeResult').textContent = ''; $('#testLocalResult').textContent = '';
  }
  function formToSettings() {
    var s = S.settings;
    s.apiKey = $('#setApiKey').value.trim(); s.rememberKey = $('#setRememberKey').checked;
    s.model = $('#setModel').value; s.effort = $('#setEffort').value;
    s.localKind = $('#setLocalKind').value; s.localUrl = $('#setLocalUrl').value.trim() || (s.localKind === 'openai' ? 'http://localhost:1234/v1' : 'http://localhost:11434');
    s.localModel = $('#setLocalModel').value.trim(); s.localCtx = parseInt($('#setLocalCtx').value, 10) || 16384; s.localKey = $('#setLocalKey').value.trim();
    s.institusi = $('#setInstitusi').value.trim() || 'INSTITUT AGAMA ISLAM NEGERI (IAIN) PAREPARE';
    s.kota = $('#setKota').value.trim() || 'Parepare';
    s.concurrency = parseInt($('#setConcurrency').value, 10) || 2;
    if (S._pendingLogo !== undefined) s.logoDataUrl = S._pendingLogo;
  }
  function testEngine(engine, out) {
    var el = $(out);
    el.textContent = 'Menguji…'; el.style.color = '';
    MRP.ai.test(engine, S.settings).then(function (msg) { el.textContent = '✔ ' + msg; el.style.color = 'var(--ok)'; })
      .catch(function (e) { el.textContent = '✖ ' + e.message; el.style.color = 'var(--err)'; });
  }
  function applyBranding() {
    var src = S.settings.logoDataUrl || 'img/logo-iain.png';
    if ($('#brandLogo').getAttribute('src') !== src) $('#brandLogo').src = src;
    $('#brandInstitusi').textContent = U.titleCase(S.settings.institusi || 'Institut Agama Islam Negeri (IAIN) Parepare').replace(/\(iain\)/i, '(IAIN)');
  }

  /* ---------------- proyek ---------------- */
  function bindProject() {
    var menu = $('#projectMenu'), btn = $('#btnProject');
    btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', function () { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
    menu.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act === 'save') {
        var blob = new Blob([JSON.stringify(S.project, null, 1)], { type: 'application/json' });
        U.saveBlob(blob, 'Proyek Modul - ' + U.safeFileName(S.project.ident.mataKuliah || 'baru') + '.json').then(savedToast);
      } else if (act === 'open') $('#projectInput').click();
      else if (act === 'new') { if (g.confirm('Mulai proyek baru? Data proyek saat ini di perangkat akan diganti (simpan dulu bila perlu).')) resetProject(); }
    });
    $('#projectInput').addEventListener('change', function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      f.text().then(function (t) {
        var pj = JSON.parse(t);
        if (!pj || !pj.ident || !pj.options) throw new Error('Berkas bukan proyek aplikasi ini.');
        loadProject(pj);
        U.toast('Proyek dibuka.', 'ok');
      }).catch(function (e) { U.toast('Gagal membuka proyek: ' + e.message, 'err'); });
    });
    $('#btnDismissRestore').addEventListener('click', function () { $('#restoreBanner').hidden = true; });
    $('#btnNewFromBanner').addEventListener('click', function () { if (g.confirm('Hapus proyek yang dipulihkan dan mulai baru?')) resetProject(); });
  }
  function resetProject() {
    S.project = newProject(); S.file = null; S.ext = null; S.out = {}; S.gen.status = {};
    U.store.del('mrp.project');
    $('#fileInfo').hidden = true; $('#btnAnalyze').disabled = true;
    setStatus($('#analyzeStatus'), ''); setStatus($('#genSummary'), ''); setStatus($('#buildStatus'), '');
    ['#cardReview', '#cardGenerate', '#cardOutput', '#restoreBanner'].forEach(function (s) { $(s).hidden = true; });
    $('#identHint').hidden = true;
    identToForm(); optionsToForm(); renderGenList();
    g.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function loadProject(pj) {
    var base = newProject();
    S.project = Object.assign(base, pj, { ident: Object.assign(base.ident, pj.ident), options: Object.assign(base.options, pj.options), content: Object.assign(base.content, pj.content || {}) });
    S.out = {}; S.gen.status = {};
    identToForm(); optionsToForm();
    var has = !!S.project.rps;
    $('#cardReview').hidden = !has; $('#cardGenerate').hidden = !has; $('#cardOutput').hidden = true;
    if (has) {
      renderReview(); renderGenList();
      if (S.project.fileName) { $('#fileInfo').hidden = false; $('#fileInfo').innerHTML = '<span class="tag">RPS</span><strong>' + U.esc(S.project.fileName) + '</strong><span class="muted small">(dari proyek tersimpan)</span>'; }
      var done = materiMeetings().every(function (m) { var r = S.project.content.meetings[m.id]; return r && r.data; });
      if (done && materiMeetings().length && S.project.content.front) { $('#cardOutput').hidden = false; setStatus($('#buildStatus'), 'Isi modul tersimpan. Klik "Susun ulang dokumen" untuk membuat PDF dan Word.'); $('#btnBuild').disabled = false; }
    }
    autosave();
  }

  /* ---------------- status jaringan ---------------- */
  function netStatus() {
    var el = $('#netStatus'), on = navigator.onLine;
    el.textContent = on ? 'Online' : 'Offline';
    el.className = 'pill ' + (on ? 'pill-online' : 'pill-offline');
    renderEngines();
  }

  /* ---------------- mulai ---------------- */
  function init() {
    bindIdentity(); bindUpload(); bindReview(); bindGenerate(); bindOutput(); bindModals(); bindProject();
    applyBranding();
    var saved = U.store.get('mrp.project', null);
    if (saved && saved.ident) {
      loadProject(saved);
      if (saved.rps) $('#restoreBanner').hidden = false;
    } else { identToForm(); optionsToForm(); }
    updateProdiList();
    netStatus();
    g.addEventListener('online', netStatus); g.addEventListener('offline', netStatus);
  }

  /* API untuk pengujian otomatis */
  MRP.appApi = { handleFile: handleFile, analyze: analyze, generate: generate, buildDocuments: buildDocuments, state: S, loadProject: loadProject, resetProject: resetProject };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
