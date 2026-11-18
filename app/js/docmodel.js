/* docmodel.js — menyusun model dokumen modul (dipakai perender PDF & Word) */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var DM = (MRP.docmodel = {});

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var LETTER = 'ABCDEFGHIJ';

  DM.defaultTahun = function () {
    var d = new Date(), y = d.getFullYear();
    return d.getMonth() >= 7 ? y + '/' + (y + 1) : (y - 1) + '/' + y;
  };
  DM.fakultasLabel = function (f) { f = U.oneLine(f); if (!f) return ''; return /^(fakultas|pascasarjana|program pascasarjana)/i.test(f) ? f : 'Fakultas ' + f; };
  DM.prodiLabel = function (p) { p = U.oneLine(p); if (!p) return ''; return /^program studi/i.test(p) ? p : 'Program Studi ' + p; };

  function runs(text) { return U.parseInline(text); }
  function P(text, o) { return Object.assign({ t: 'p', runs: runs(text) }, o || {}); }
  function lowerFirst(s) { s = String(s || '').trim(); return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  /* markdown -> blok, paragraf isi diberi indentasi baris pertama */
  function md(src, indent) {
    return U.parseMarkdown(src).map(function (b) {
      if (b.t === 'p') { b.indent = indent !== false; if (U.hasArabic(U.runsText(b.runs))) return { t: 'arab', text: U.runsText(b.runs) }; }
      if (b.t === 'table') b.small = true;
      return b;
    });
  }

  DM.build = function (project, assets, settings) {
    var id = project.ident, rps = project.rps, opt = project.options, content = project.content || {};
    settings = settings || {};
    var mk = id.mataKuliah || rps.mataKuliah || 'Mata Kuliah';
    var meetings = rps.pertemuan.filter(function (m) { return m.jenis === 'materi'; });
    var institusi = settings.institusi || 'INSTITUT AGAMA ISLAM NEGERI (IAIN) PAREPARE';
    var kota = settings.kota || 'Parepare';
    var front = content.front || MRP.template.front(rps, id);
    var figNo = 0, tabNo = 0;
    var now = new Date();

    var doc = {
      meta: {
        title: 'Modul Pembelajaran ' + mk, mk: mk, kode: id.kode || rps.kode || '', sks: id.sks || rps.sks || '', semester: id.semester || rps.semester || '',
        prodi: DM.prodiLabel(id.prodi), fakultas: DM.fakultasLabel(id.fakultas), dosen: U.oneLine(id.dosen), tahun: U.oneLine(id.tahun) || DM.defaultTahun(),
        institusi: institusi, kota: kota, headerText: 'Modul Pembelajaran ' + mk
      },
      cover: { logo: assets.logo, showDosen: opt.coverDosen !== false },
      options: { chapterNewPage: !!opt.chapterNewPage },
      front: [], main: []
    };

    /* ---------- KATA PENGANTAR ---------- */
    var kp = md(front.kata_pengantar || '', true);
    kp.push({ t: 'sign', lines: [kota + ', ' + BULAN[now.getMonth()] + ' ' + now.getFullYear(), 'Penyusun,', '', '', doc.meta.dosen || '……………………………'] });
    doc.front.push({ id: 'kata-pengantar', title: 'KATA PENGANTAR', tocText: 'Kata Pengantar', blocks: kp });
    doc.front.push({ id: 'daftar-isi', title: 'DAFTAR ISI', tocText: 'Daftar Isi', toc: true, blocks: [] });

    /* ---------- PENDAHULUAN ---------- */
    var pend = [], sec = 0;
    var h2 = function (arr, text) { arr.push({ t: 'h2', text: LETTER[sec++] + '. ' + text }); };
    h2(pend, 'Identitas Mata Kuliah');
    tabNo++;
    var idRows = [['Nama Mata Kuliah', mk]];
    if (doc.meta.kode) idRows.push(['Kode Mata Kuliah', doc.meta.kode]);
    if (doc.meta.sks) idRows.push(['Bobot', doc.meta.sks + ' SKS']);
    if (doc.meta.semester) idRows.push(['Semester', doc.meta.semester]);
    if (rps.rumpun) idRows.push(['Rumpun Mata Kuliah', rps.rumpun]);
    idRows.push(['Program Studi', doc.meta.prodi.replace(/^program studi\s+/i, '')]);
    idRows.push(['Fakultas', doc.meta.fakultas.replace(/^fakultas\s+/i, '')]);
    if (doc.meta.dosen) idRows.push(['Dosen Pengampu', doc.meta.dosen]);
    pend.push({ t: 'table', kv: true, caption: 'Tabel ' + tabNo + '. Identitas Mata Kuliah', rows: idRows, widths: [0.32, 0.68] });

    h2(pend, 'Deskripsi Mata Kuliah');
    md(front.deskripsi || rps.deskripsi || '', true).forEach(function (b) { pend.push(b); });

    if (rps.cpl.length || rps.cpmk.length) {
      h2(pend, 'Capaian Pembelajaran');
      if (rps.cpl.length) {
        pend.push(P('Capaian Pembelajaran Lulusan (CPL) yang dibebankan pada mata kuliah ini:', { indent: false }));
        pend.push({ t: 'ul', items: rps.cpl.map(function (c) { return runs(U.oneLine(c)); }) });
      }
      if (rps.cpmk.length) {
        pend.push(P('Capaian Pembelajaran Mata Kuliah (CPMK):', { indent: false }));
        pend.push({ t: 'ul', items: rps.cpmk.map(function (c) { return runs(U.oneLine(c)); }) });
      }
    }

    h2(pend, 'Rencana Pertemuan');
    tabNo++;
    var no = 0, planRows = [];
    rps.pertemuan.forEach(function (m) {
      if (m.jenis === 'materi') { no++; planRows.push([m.minggu, 'Pertemuan ' + no + ': ' + (content.meetings && content.meetings[m.id] && content.meetings[m.id].data ? content.meetings[m.id].data.judul || m.judul : m.judul)]); }
      else planRows.push([m.minggu, m.jenis === 'uts' ? 'Ujian Tengah Semester (UTS)' : m.jenis === 'uas' ? 'Ujian Akhir Semester (UAS)' : m.judul]);
    });
    pend.push({ t: 'table', caption: 'Tabel ' + tabNo + '. Rencana Pertemuan', header: ['Minggu', 'Materi Pokok / Kegiatan'], rows: planRows, widths: [0.16, 0.84], small: true, colAlign: ['center', 'left'] });

    h2(pend, 'Petunjuk Penggunaan Modul');
    pend.push({ t: 'ol', fmt: 'decimal', items: (front.petunjuk || []).map(function (s) { return runs(s); }) });
    doc.main.push({ id: 'pendahuluan', title: 'PENDAHULUAN', tocText: 'Pendahuluan', blocks: pend });

    /* ---------- PERTEMUAN ---------- */
    meetings.forEach(function (m, i) {
      var rec = content.meetings && content.meetings[m.id];
      var c = rec && rec.data;
      if (!c) c = MRP.template.meeting(rps, m, { mataKuliah: mk, prodi: id.prodi, index: i, next: meetings[i + 1], words: DM.planWords(opt.targetPages || 32, meetings.length, opt) });
      var blocks = [], s = 0;
      var H2 = function (text) { blocks.push({ t: 'h2', text: LETTER[s++] + '. ' + text }); };
      if (c.pengantar) md(c.pengantar, true).forEach(function (b) { blocks.push(b); });

      H2('Tujuan Pembelajaran');
      blocks.push(P('Setelah mempelajari materi pertemuan ini, mahasiswa diharapkan mampu:', { indent: false }));
      blocks.push({ t: 'ol', fmt: 'decimal', items: (c.tujuan || []).map(function (t) { return runs(lowerFirst(t).replace(/[.;]$/, '') + ';'); }) });
      var lastItems = blocks[blocks.length - 1].items;
      if (lastItems.length) { var lr = lastItems[lastItems.length - 1]; lr[lr.length - 1].text = lr[lr.length - 1].text.replace(/;$/, '.'); }

      H2('Uraian Materi');
      var sub = 0;
      var h3 = function (text) { blocks.push({ t: 'h3', text: (++sub) + '. ' + text }); };
      // subjudul konsep/teori ditulis "run-in" (tebal miring di awal paragraf) agar hemat halaman
      var sections = function (list) {
        (list || []).forEach(function (x, k) {
          var bl = md(x.isi, true);
          var sj = U.oneLine(x.subjudul || '').replace(/[.:]\s*$/, '');
          if (sj && bl.length && bl[0].t === 'p') bl[0].runs.unshift({ text: sj + '. ', b: true, i: true });
          else if (sj) blocks.push({ t: 'h4', text: 'abcdefgh'[k] + '. ' + sj });
          bl.forEach(function (b) { blocks.push(b); });
        });
      };
      h3('Konsep');
      sections(c.konsep);
      var vis = c.visual;
      if (opt.visual !== false && vis && MRP.diagram.isRenderable(vis)) {
        var type = MRP.diagram.normalizeType(vis.jenis);
        var vTitle = vis.judul || (MRP.diagram.LABELS[type] + ' ' + (c.judul || m.judul));
        if (type === 'perbandingan') {
          tabNo++;
          var its = vis.item.slice(0, 4);
          var maxR = Math.max.apply(null, its.map(function (it) { return (it.rincian || []).length; }).concat([1]));
          var rows = [];
          if (its.some(function (it) { return it.keterangan; })) rows.push(its.map(function (it) { return it.keterangan || ''; }));
          for (var r = 0; r < maxR; r++) rows.push(its.map(function (it) { return (it.rincian || [])[r] || ''; }));
          blocks.push({ t: 'table', caption: 'Tabel ' + tabNo + '. ' + vTitle, header: its.map(function (it) { return it.label; }), rows: rows, small: true });
        } else if (assets.diagrams && assets.diagrams[m.id]) {
          figNo++;
          blocks.push({ t: 'figure', img: assets.diagrams[m.id], caption: 'Gambar ' + figNo + '. ' + vTitle });
        }
      }
      h3('Teori');
      sections(c.teori);
      h3('Praktik');
      var pk = c.praktik || {};
      if (pk.pengantar) md(pk.pengantar, true).forEach(function (b) { blocks.push(b); });
      if (pk.langkah && pk.langkah.length) {
        blocks.push(P('Langkah-langkah kegiatan:', { indent: false }));
        blocks.push({ t: 'ol', fmt: 'decimal', items: pk.langkah.map(function (x) { return runs(x); }) });
      }
      if (pk.contoh) blocks.push({ t: 'box', title: 'Contoh Penerapan', blocks: md(U.upperFirst(pk.contoh.replace(/^\s*(contoh( penerapan| kasus)?|studi kasus)\s*:\s*/i, '')), false) });

      if (opt.rangkuman !== false && c.rangkuman) { H2('Rangkuman'); md(c.rangkuman, true).forEach(function (b) { blocks.push(b); }); }

      H2('Panduan Tugas');
      var tg = c.tugas || {};
      var tb = [];
      if (tg.petunjuk) md(tg.petunjuk, false).forEach(function (b) { tb.push(b); });
      if (tg.langkah && tg.langkah.length) {
        tb.push(P('**Langkah:** ' + tg.langkah.map(function (x, k) { return '(' + (k + 1) + ') ' + U.oneLine(x).replace(/[.;]\s*$/, ''); }).join('; ') + '.', { indent: false }));
      }
      if (tg.luaran || tg.waktu) tb.push(P([tg.luaran ? '**Luaran:** ' + tg.luaran.replace(/\.\s*$/, '') + '.' : '', tg.waktu ? '**Waktu:** ' + tg.waktu.replace(/\.\s*$/, '') + '.' : ''].filter(Boolean).join(' '), { indent: false }));
      if (tg.penilaian && tg.penilaian.length) {
        var pen = tg.penilaian.slice(0, 5);
        tb.push(P('**Kriteria penilaian** (bobot):', { indent: false, keepNext: true }));
        tb.push({ t: 'table', rows: [pen.map(function (p) { return p.aspek + ' (' + (parseInt(p.bobot, 10) || 0) + '%)'; })], small: true, colAlign: pen.map(function () { return 'center'; }) });
      }
      blocks.push({ t: 'box', title: 'Tugas: ' + (tg.judul || ('Tugas ' + (c.judul || m.judul)).replace(/^tugas\s*:\s*/i, '')).replace(/^tugas\s*:\s*/i, ''), blocks: tb });

      if (opt.latihan !== false && c.latihan && c.latihan.length) {
        H2('Latihan');
        blocks.push({ t: 'ol', fmt: 'decimal', items: c.latihan.map(function (x) { return runs(x); }) });
      }
      // referensi per pertemuan: satu baris kutipan singkat (penulis, tahun); entri lengkap di Daftar Pustaka
      var cites = (c.referensi || []).slice(0, 3).map(DM.citeShort).filter(Boolean);
      if (cites.length) blocks.push(P('**Referensi:** ' + cites.join('; ') + '.', { indent: false, align: 'left', small: true }));

      var judul = c.judul || m.judul;
      doc.main.push({ id: 'p' + (i + 1), label: 'PERTEMUAN ' + (i + 1), title: judul, tocText: 'Pertemuan ' + (i + 1) + ': ' + judul, blocks: blocks, meetingId: m.id });
    });

    /* ---------- PENUTUP & DAFTAR PUSTAKA ---------- */
    doc.main.push({ id: 'penutup', title: 'PENUTUP', tocText: 'Penutup', blocks: md(front.penutup || '', true) });
    var pustaka = (rps.pustaka || []).slice();
    if (!pustaka.length) {
      meetings.forEach(function (m) { var rec = content.meetings && content.meetings[m.id]; ((rec && rec.data && rec.data.referensi) || []).forEach(function (r) { if (pustaka.indexOf(r) < 0) pustaka.push(r); }); });
    }
    pustaka.sort(function (a, b) { return a.localeCompare(b, 'id', { sensitivity: 'base' }); });
    doc.main.push({ id: 'daftar-pustaka', title: 'DAFTAR PUSTAKA', tocText: 'Daftar Pustaka', blocks: pustaka.length ? [{ t: 'refs', items: pustaka, numbered: false }] : [P('Daftar pustaka mengikuti RPS mata kuliah. Dosen dapat melengkapi bagian ini.', { indent: false })] });
    return doc;
  };

  /* "Koenig, H. G., & Al Shohaib, S. S. (2019). Judul…" -> "Koenig dkk. (2019)" */
  DM.citeShort = function (r) {
    var s = U.oneLine(r).replace(/^\s*(\[\d+\]|\d+[.)])\s*/, '');
    var m = s.match(/^(.{2,160}?)\(\s*(\d{4}[a-z]?|t\.?t\.?|n\.?d\.?)\s*\)/i);
    if (!m) {
      var m2 = s.match(/^([^.,]{2,60}),[^.]*?[.,]\s*(\d{4})\b/);
      if (!m2) return U.truncateWords(DM.shortRef(s).replace(/\.$/, ''), 8).replace(/…$/, '…');
      m = [null, m2[1], m2[2]];
    }
    var authors = m[1].replace(/[.,;\s]+$/, '');
    var first = authors.split(/,|&| dan /)[0].trim();
    var many = /&| dan |et al|dkk|,\s*[^,]+,\s*[^,]+/.test(authors) && authors.split(/&| dan |,/).length > 2;
    var two = !many && /&| dan /.test(authors);
    var second = two ? authors.split(/&| dan /)[1].split(',')[0].trim() : '';
    return first + (many ? ' dkk.' : two && second ? ' & ' + second : '') + ' (' + m[2] + ')';
  };

  DM.shortRef = function (r) {
    return U.oneLine(r).replace(/\s*(tersedia (di|pada)|diakses|available at|retrieved from)\b.*$/i, '').replace(/\s*(https?:\/\/|www\.)\S+/gi, '').replace(/\s*doi:\s*\S+/i, '').replace(/[\s,;]+$/, '').replace(/([^.])$/, '$1.');
  };

  /* Estimasi jumlah kata isi per pertemuan agar modul ±target halaman.
     Kalibrasi empiris (14 pertemuan, uji 2026-11-18): pada 11 pt/1,15 struktur per pertemuan
     (judul, tujuan, langkah, kotak contoh & tugas, gambar, latihan) ±1,13 halaman, uraian ±520 kata
     per halaman, bagian tetap (sampul, kata pengantar, daftar isi, pendahuluan, penutup, pustaka) ±7,5 halaman. */
  DM.planWords = function (targetPages, nMeetings, opts) {
    // dikalibrasi ulang setelah spasi baris PDF disamakan dengan Word (uji 2026-11-18):
    // pada 11 pt/1,05 struktur ±1,3 halaman per pertemuan, uraian ±600 kata per halaman, bagian tetap ±7 halaman
    opts = opts || {};
    var fixed = 7 + Math.max(0, (nMeetings - 14) * 0.05);
    var perMeetingPages = (targetPages - fixed) / Math.max(1, nMeetings);
    var structure = 1.08 + (opts.visual !== false ? 0.16 : 0) + (opts.latihan !== false ? 0.06 : 0);
    return U.clamp(Math.round(((perMeetingPages - structure) * 600) / 10) * 10, 260, 1400);
  };
})(window);
