/* parse.js — parser heuristik RPS (tanpa AI) */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var P = (MRP.parse = {});

  P.emptyRps = function () {
    return { mataKuliah: '', kode: '', sks: '', semester: '', rumpun: '', fakultas: '', prodi: '', deskripsi: '', cpl: [], cpmk: [], subCpmk: [], bahanKajian: [], pustaka: [], pertemuan: [], sumber: '', warnings: [] };
  };

  var LBL = {
    mataKuliah: /^(nama\s+)?mata\s*kuliah(?!\s*(syarat|prasyarat|pilihan\b|wajib\b|ini\b|tersebut\b|yang\b))(\s*\(\s*mk\s*\))?(\s*\(\s*(indonesia|ind)\s*\))?\s*[:：]?\s*/i,
    kode: /^kode(?!\s*dok)(\s*mata\s*kuliah|\s*mk)?\s*[:：]?\s*/i,
    rumpun: /^rumpun(\s*mata\s*kuliah|\s*mk)?\s*[:：]?\s*/i,
    sks: /^(bobot\s*\(?\s*sks\s*\)?|bobot|total\s*sks|beban\s*(studi|sks))\s*[:：]?\s*/i,
    semester: /^semester\s*[:：]?\s*/i,
    deskripsi: /^deskripsi(\s+singkat)?(\s+mata\s*kuliah|\s+mk)?(\s*\(\s*ind(onesia)?\s*\))?\s*[:：]?\s*/i,
    bahan: /^(bahan\s*kajian(\s*[:：]?\s*materi\s*pembelajaran)?|materi\s*pembelajaran|pokok\s*bahasan|materi\s*pokok)\s*[:：]?\s*/i,
    pustaka: /^(pustaka|referensi|daftar\s*pustaka|daftar\s*referensi|sumber\s*(belajar|referensi)|literatur)\s*[:：]?\s*/i
  };
  var ANY_LABEL = /^(nama\s+)?mata\s*kuliah\s*(\(|:|$|syarat|prasyarat)|^kode\s*(mata|mk|:|$)|^rumpun|^bobot|^sks\b|^semester\s*(:|$)|^tgl|^tanggal\s*(penyusunan|:)|^deskripsi|^bahan\s*kajian|^materi\s*pembelajaran\s*(:|$|\[)|^pustaka|^referensi\s*(:|$)|^otorisasi|^pengembang|^koordinator|^ketua\b|^ka\.?\s*prodi|^dosen\s*(pengampu|pengembang)|^capaian\s*pembelajaran|^cpl\b|^cpmk\b|^sub[\s-]*cpmk|^media\s*(pembelajaran|ajar)|^prasyarat|^unit\s*pengampu|^versi\s*rps|^jenis\s*mk|^jam\s*perkuliahan|^tujuan\s*(mata\s*kuliah|pembelajaran)|^berlaku\s*sejak|^total\s*(sks|persentase)|^team\s*teaching|^tim\s*(pengajar|dosen)/i;

  /* ---------- utilitas teks ---------- */
  function firstLine(s) { return String(s || '').split('\n')[0].trim(); }
  function restLines(s) { return String(s || '').split('\n').slice(1).join('\n').trim(); }
  function isLabel(s) { return ANY_LABEL.test(U.oneLine(s)); }
  function stripNum(s) { return String(s || '').replace(/^\s*(\(?\d{1,2}[.)]|\[\d{1,2}\]|[-•·▪*]|[a-z][.)])\s+/i, '').trim(); }
  /* nilai "label: nilai" hanya diterima bila ada titik dua (mencegah "Mata kuliah ini memaparkan…") */
  function inlineValue(text, re) {
    var m = String(text || '').match(re);
    if (!m) return '';
    var rest = text.slice(m[0].length).trim();
    var colon = /[:：]\s*$/.test(m[0]) || /^[:：]/.test(rest);
    rest = rest.replace(/^[:：]\s*/, '');
    return colon && rest && !isLabel(rest) ? rest : '';
  }
  function validFor(k, v) {
    v = U.oneLine(v);
    if (!v || isLabel(v)) return false;
    if (/^[.…\-_\s]+$/.test(v)) return false;
    if (k === 'kode') return /\d/.test(v) && v.length <= 24 && v.split(' ').length <= 3;
    if (k === 'sks') return /^\s*\d/.test(v) && v.length <= 20;
    if (k === 'semester') return v.length <= 24 && /^\s*(\d{1,2}\b|[IVX]{1,4}\b|ganjil|genap|satu|dua|tiga|empat|lima|enam|tujuh|delapan)/i.test(v);
    if (k === 'mataKuliah') return v.length <= 90 && U.countWords(v) <= 12 && !/^(ini|tersebut|yang)\b/i.test(v);
    return v.length <= 120;
  }

  P.normSks = function (v) { var m = String(v || '').match(/(\d+(?:[.,]\d+)?)/); return m ? m[1].replace(',', '.') : ''; };
  P.normSemester = function (v) {
    var s = U.oneLine(v);
    var m = s.match(/\b(\d{1,2})\b/);
    if (m && +m[1] >= 1 && +m[1] <= 14) return U.roman(+m[1], false);
    m = s.match(/\b([IVX]{1,4})\b/);
    if (m && U.romanToInt(m[1])) return m[1].toUpperCase();
    var words = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8 };
    m = s.toLowerCase().match(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan)\b/);
    return m ? U.roman(words[m[1]], false) : '';
  };

  P.parseWeek = function (s) {
    s = U.oneLine(s).replace(/^\(|\)$/g, '');
    s = s.replace(/^(minggu|pertemuan|pert\.?|mg|sesi|week)\s*(ke)?[\s\-:.]*/i, '').replace(/^ke[\s\-:]*/i, '');
    var m = s.match(/^(\d{1,2})\s*(?:[-–—~]|s\.?\s*\/?\s*d\.?|sampai|hingga|&|dan|,)\s*(\d{1,2})\b/i);
    if (m && +m[2] > +m[1]) return { from: +m[1], to: +m[2], label: m[1] + '-' + m[2] };
    m = s.match(/^(\d{1,2})(?![\d.,]*\s*%)\b/);
    if (m && +m[1] >= 1 && +m[1] <= 20) return { from: +m[1], to: +m[1], label: m[1] };
    m = s.match(/^([IVX]{1,5})$/);
    if (m && U.romanToInt(m[1])) { var r = U.romanToInt(m[1]); return { from: r, to: r, label: String(r) }; }
    return null;
  };

  var VERBS = 'menjelaskan|menguraikan|memahami|mengidentifikasi|menganalisis|menganalisa|mendeskripsikan|mendefinisikan|menerapkan|menyusun|merancang|mengembangkan|membandingkan|mengevaluasi|merumuskan|mempraktikkan|mempraktekkan|mengaplikasikan|mengelola|mengkaji|menelaah|melakukan|melaksanakan|membuat|memilih|menggunakan|menentukan|melayani|mendesain|mengimplementasikan|mengintegrasikan|mengenal|mengetahui|menyebutkan|menunjukkan|menginterpretasikan|mengkritisi|mengkonstruksi|mengorganisasikan|merencanakan|menilai|mengukur|menyimpulkan|mendiskusikan|mempresentasikan|merefleksikan|menyajikan|menguasai|menceritakan|memetakan|mengklasifikasikan|mengategorikan|bertanggung jawab dalam';
  var VERB_RE = new RegExp('^(' + VERBS + ')\\s+((dan|serta)\\s+(' + VERBS + ')\\s+)?(tentang\\s+|mengenai\\s+|konsep\\s+tentang\\s+)?', 'i');
  var STUDENT_RE = new RegExp('^mahasiswa\\s+(?=(' + VERBS + ')\\b)', 'i');
  // kata kerja di tengah judul ("… dan merefleksikan capaian") -> bentuk nomina
  var NOMINAL = { mempresentasikan: 'presentasi', merefleksikan: 'refleksi', menganalisis: 'analisis', menganalisa: 'analisis', mengevaluasi: 'evaluasi', mengidentifikasi: 'identifikasi', menerapkan: 'penerapan', mengembangkan: 'pengembangan', melaksanakan: 'pelaksanaan', melakukan: 'pelaksanaan', menyusun: 'penyusunan', merancang: 'perancangan', merencanakan: 'perencanaan', mengelola: 'pengelolaan', mengimplementasikan: 'implementasi', mengaplikasikan: 'aplikasi', mendesain: 'desain', menilai: 'penilaian', mengukur: 'pengukuran', membandingkan: 'perbandingan', merumuskan: 'perumusan', mempraktikkan: 'praktik', mempraktekkan: 'praktik', menyajikan: 'penyajian', mengintegrasikan: 'integrasi', mengkaji: 'kajian', memetakan: 'pemetaan', menjelaskan: '', memahami: '', menguraikan: '', mendeskripsikan: '', mengetahui: '', mengenal: '', menyebutkan: '' };

  function joinList(parts) {
    return parts.length <= 2 ? parts.join(' dan ') : parts.slice(0, -1).join(', ') + ', dan ' + parts[parts.length - 1];
  }
  /* Daftar bernomor dalam satu sel: "1. A 2. B 3. C" / "a. A b. B" (butir pertama boleh tanpa nomor
     bila nomornya sudah terpotong). Hanya penomoran berurutan yang diterima. */
  function splitInlineList(t) {
    var re = /(^|\s)(\d{1,2}|[a-h])[.)]\s+(?=\S)/g, m, seq = [], want = null;
    while ((m = re.exec(t))) {
      var k = m[2], isNum = /\d/.test(k), v = isNum ? +k : k.charCodeAt(0) - 96;
      var at = m.index + m[1].length;
      if (!seq.length) {
        var head = t.slice(0, at);
        if (v === 1 || (v === 2 && U.countWords(head) >= 2 && /[A-Za-z]{3}/.test(head))) { seq.push({ i: at, end: re.lastIndex, v: v }); want = { num: isNum, next: v + 1 }; }
        continue;
      }
      if (isNum === want.num && v === want.next) { seq.push({ i: at, end: re.lastIndex, v: v }); want.next++; }
    }
    if (seq.length < 2 && !(seq.length === 1 && seq[0].v === 2)) return null;
    var pre = t.slice(0, seq[0].i).trim();
    var items = seq.map(function (s, i) { return t.slice(s.end, i + 1 < seq.length ? seq[i + 1].i : t.length).trim(); });
    if (seq[0].v === 2) { items.unshift(pre); pre = ''; }
    return { pre: pre, items: items };
  }
  /* Judul dari subtopik bernomor: awalan bersama ("Pengertian manajemen, organisasi, dan …"),
     akhiran bersama ("Bentuk dan Sejarah … Organisasi Kelembagaan Islam"), atau butir pertama. */
  function listTitle(pre, items) {
    var clean = function (x) { return String(x || '').replace(/^[,;.:\s]+|[,;.:\s]+$/g, '').trim(); };
    pre = clean(pre);
    if (pre && U.countWords(pre) >= 2 && /[A-Za-z]{3}/.test(pre)) return pre; // "Perencanaan SDM: 1. … 2. …"
    var its = items.map(clean).filter(function (x) { return /[A-Za-z]{2}/.test(x); });
    if (its.length <= 1) return its[0] || pre;
    var W = its.map(function (x) { return x.split(/\s+/); });
    var lc = function (w) { return String(w || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var p = 0;
    while (p < W[0].length - 1 && p < W[1].length - 1 && lc(W[0][p]) === lc(W[1][p])) p++;
    if (p >= 2) return W[0].slice(0, p).join(' ');
    if (p === 1) {
      var k = 1;
      while (k < its.length && k < 3 && W[k].length > 1 && lc(W[k][0]) === lc(W[0][0])) k++;
      var joined = W[0][0] + ' ' + joinList(W.slice(0, k).map(function (w) { return w.slice(1).join(' '); }));
      if (U.countWords(joined) <= 10) return joined;
      return its[0];
    }
    var s = 0;
    while (s < W[0].length - 1 && s < W[1].length - 1 && lc(W[0][W[0].length - 1 - s]) === lc(W[1][W[1].length - 1 - s])) s++;
    if (s >= 2) {
      var t2 = W[0].slice(0, W[0].length - s).join(' ') + ' dan ' + W[1].slice(0, W[1].length - s).join(' ') + ' ' + W[0].slice(W[0].length - s).join(' ');
      if (U.countWords(t2) <= 10) return t2;
    }
    if (U.countWords(its[0]) < 3 && U.countWords(its[0] + ' ' + its[1]) <= 8) return its[0] + ' dan ' + its[1];
    return its[0];
  }

  P.cleanTitle = function (s, maxWords) {
    var t = U.oneLine(s), fromList = false;
    t = t.split(/\s+[-–]\s+(?=(?:ketepatan|kemampuan|mampu|mahasiswa)\b)/i)[0]; // indikator kedua dst.
    // rujukan dalam kurung siku ([Asmuni, 2019]); bila di tengah, ia memisahkan dua topik
    t = t.replace(/\s*\[[^\]]*(\]|$)\s*/g, ' \u0001 ').replace(/^[\s\u0001]+|[\s\u0001]+$/g, '');
    t = t.replace(/\s*\b(ref\.?|referensi|pustaka|sumber)\s*(utama|pendukung)?\s*[:：].*$/i, '').trim();
    t = t.replace(/\((sub[\s-]*)?c[mp]{2,3}k[^)]*\)/gi, ' ').replace(/\(\s*cpl[^)]*\)/gi, ' ').replace(/\(\s*llo[^)]*\)/gi, ' ').trim();
    t = t.replace(/\s*:\s*(dosen|ketua|koordinator|pengampu|tim\s+dosen)\b.*$/i, ''); // label sel lain yang ikut terbaca
    t = t.replace(/^[-•·▪*]+\s*/, '');
    t = t.replace(/^(cpmk[\s-]*\d+\s*[,;:]?\s*)?(sub[\s-]*cpmk[\s-]*\d+\s*[:.,]?\s*)?/i, '').trim();
    t = t.replace(/^\s*(materi\s*(pembelajaran)?|indikator|topik|pokok bahasan)\s*[:：]\s*/i, '');
    // subtopik bernomor "2.1 Perencanaan SDM 2.2 …" -> ambil butir pertama
    if (/^\d{1,2}\.\d{1,2}\.?\s/.test(t) || /\s\d{1,2}\.\d{1,2}\.?\s/.test(t)) {
      var parts = t.split(/\s*\b\d{1,2}\.\d{1,2}\.?(?=\s|[A-Za-z])\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length) t = parts[0];
    } else {
      var lst = splitInlineList(t.replace(/\u0001/g, ' '));
      if (lst) { t = listTitle(lst.pre, lst.items); fromList = true; }
    }
    // beberapa topik yang dipisahkan rujukan: "Konsep literasi dakwah [..] Moderasi beragama [..]"
    if (t.indexOf('\u0001') >= 0) {
      var tops = t.split('\u0001').map(function (x) { return x.replace(/^[,;.:\s]+|[,;.:\s]+$/g, '').trim(); }).filter(function (x) { return /[A-Za-z]{3}/.test(x) && !/^(ref\.?|referensi|pustaka|sumber)\b/i.test(x); });
      var multi = tops.length >= 2 ? joinList(tops.slice(0, 3)) : (tops[0] || '');
      t = tops.length >= 2 && U.countWords(multi) <= 10 ? multi : (tops[0] || '');
    }
    t = t.replace(STUDENT_RE, '');
    t = t.replace(/^(mahasiswa\s+)?(mampu|dapat|diharapkan\s+mampu|diharapkan\s+dapat)\s+/i, '');
    t = t.replace(/^(ketepatan|kemampuan|ketetapan|kesesuaian|kecermatan|kebenaran)\s+(dalam\s+)?/i, '');
    t = t.replace(VERB_RE, '');
    t = t.replace(/(,\s*|\s+(?:dan|serta|&)\s+)([A-Za-z]+)(\s+)/g, function (all, sep, word, sp) {
      var k = word.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(NOMINAL, k)) return all;
      return NOMINAL[k] ? sep + NOMINAL[k] + sp : sep;
    });
    t = t.replace(/^(penjabaran|pemahaman|pembahasan|penjelasan|uraian)\s+(tentang|mengenai|terhadap)?\s*/i, '');
    t = t.replace(/^(kajian|pengkajian)\s+(tentang|mengenai|terhadap)\s+/i, '');
    t = t.replace(/^(tentang|mengenai)\s+/i, '');
    t = t.replace(/\s+(dengan|secara)\s+(tepat|benar|baik|komprehensif|mandiri|kritis|sistematis|jelas|rinci|runtut|efektif|efisien|kreatif|inovatif|logis|cermat|bertanggung\s*jawab)\b.*$/i, '');
    // "Pengertian, Tahapan Analisis Jabatan" / "Definisi Seleksi" -> topik intinya
    if (!fromList && /^(pengertian|definisi|defenisi)\b[,\s]+\S+/i.test(t) && U.countWords(t) >= 2) t = t.replace(/^(pengertian|definisi|defenisi)\b[,\s]*(dan\s+)?/i, '');
    t = t.replace(/\s+\d{1,3}\s*%?$/, ''); // angka bobot yang ikut terbaca di akhir
    t = t.split(/\s*(?:\.\s|;\s|\.$|;$)/)[0];
    t = t.replace(/[,:;.\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
    var w = t.split(/\s+/);
    if (w.length > (maxWords || 12)) t = w.slice(0, maxWords || 12).join(' ').replace(/[,;:]$/, '');
    return U.titleCase(t);
  };

  function splitMateri(materi) {
    var t = U.clean(materi);
    var pustaka = '';
    var mm = t.match(/(?:^|\n|\.\s*|\s)(referensi|pustaka|sumber|literatur|ref\.?(?:\s*(?:utama|pendukung))?)\s*[:：]\s*([\s\S]*)$/i);
    if (mm) { pustaka = U.oneLine(mm[2]); t = t.slice(0, mm.index).trim(); }
    t = t.replace(/^\s*materi\s*(pembelajaran)?\s*[:：]\s*/i, '').trim();
    var lines = t.split('\n').map(function (l) { return stripNum(l); }).filter(Boolean);
    return { text: lines.join('\n'), lines: lines, pustaka: pustaka };
  }

  // judul umum yang kurang bermakna sebagai judul bab -> pakai rumusan Sub-CPMK bila ada
  var GENERIC_TITLE = /^(gambaran\s+umum(\s+(mata\s+kuliah|perkuliahan))?|pengantar(\s+(umum|perkuliahan|mata\s+kuliah))?|pendahuluan|kontrak\s+(kuliah|perkuliahan))$/i;
  var STOPW = { dan: 1, di: 1, ke: 1, dari: 1, yang: 1, untuk: 1, dalam: 1, pada: 1, atau: 1, dengan: 1, bagi: 1, serta: 1 };
  var ACRO_EXP = { sdm: ['sumber', 'daya', 'manusia'], k3: ['keselamatan', 'kesehatan', 'kerja'], phk: ['pemutusan', 'hubungan', 'kerja'], zis: ['zakat', 'infak', 'sedekah'] };
  /* apakah semua kata inti `small` muncul di `big` (kata berimbuhan/ejaan beda dicocokkan dari 4 huruf awal) */
  function containsWords(big, small) {
    var norm = function (w) { return w.toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var B = String(big).split(/\s+/).map(norm).filter(Boolean);
    var has = function (w) { return B.some(function (b) { return b === w || (w.length >= 5 && b.length >= 5 && b.slice(0, 4) === w.slice(0, 4)); }); };
    return String(small).split(/\s+/).map(norm).filter(function (w) { return w && !STOPW[w]; }).every(function (w) {
      return has(w) || (ACRO_EXP[w] && ACRO_EXP[w].every(has));
    });
  }

  function ampDan(s) { return String(s || '').replace(/\s+&\s*|\s*&\s+/g, ' dan '); }

  P.deriveTitle = function (m) {
    var sp = splitMateri(m.materi || '');
    var cand = sp.lines[0] || '';
    if (cand && sp.lines.length > 1 && U.countWords(cand) <= 2 && /[:]$/.test(cand)) cand = sp.lines[1];
    // subtopik bernomor yang masing-masing satu baris (sel Word): judul disusun dari beberapa butir
    var rawLines = String(m.materi || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var marked = rawLines.filter(function (l) { return /^(\d{1,2}|[a-h])[.)]\s+\S/.test(l); });
    if (marked.length >= 2 && /^(\d{1,2}|[a-h])[.)]\s/.test(rawLines[0])) cand = marked.join(' ');
    if (/^\s*(pustaka|referensi)?\s*[:：]?\s*[\d,\s;]*$/i.test(cand) || U.countWords(cand) < 1) cand = '';
    var t = cand ? P.cleanTitle(cand) : '';
    if (!t || U.countWords(t) < 1) t = P.cleanTitle(m.subCpmk || '') || P.cleanTitle(m.indikator || '');
    // judul sangat singkat/umum -> rumusan Sub-CPMK yang memuat topik yang sama lebih informatif
    var subT = m.subCpmk ? P.cleanTitle(ampDan(m.subCpmk), 10) : '';
    if (t && subT && U.countWords(subT) >= 2 && U.countWords(subT) <= 10 && !/^(uts|uas)\b/i.test(subT)) {
      if (GENERIC_TITLE.test(t)) return subT;
      // tanpa anak kalimat "yang …" (mis. "… yang Efektif") agar judul tetap berupa topik
      if (U.countWords(t) <= 2 && U.countWords(subT) > U.countWords(t) && !/\byang\b/i.test(subT) && containsWords(subT, t)) return subT;
    }
    return t;
  };

  P.classify = function (m, courseName) {
    var fields = [m.materi, m.subCpmk, m.indikator, m.judul].map(function (x) { return U.oneLine(x).toLowerCase(); });
    var any = fields.join(' | ');
    var weekFrom = parseInt(m.minggu, 10);
    var startsWith = function (re) { return fields.some(function (f) { return re.test(f); }); };
    // sel ujian sering digabung melintasi beberapa kolom (mis. "UJIAN TENGAH SEMESTER" di kolom kriteria)
    if (!U.oneLine(m.materi) && !U.oneLine(m.subCpmk)) {
      var wide = [m.kriteria, m.metode, m.indikator].map(function (x) { return U.oneLine(x).toLowerCase(); }).join(' | ');
      if (weekFrom >= 7 && weekFrom <= 10 && /\b(uts|ets|pts)\b|(ujian|evaluasi|penilaian)\s+tengah\s+semester/.test(wide)) return 'uts';
      if (weekFrom >= 14 && /\b(uas|eas|pas)\b|(ujian|evaluasi|penilaian)\s+akhir\s+semester/.test(wide)) return 'uas';
    }
    if (startsWith(/^(uts|ets|pts)\b/) || /ujian tengah|evaluasi tengah|penilaian tengah|tengah semester|mid[\s-]?(semester|test)|midterm/.test(any)) return 'uts';
    if (startsWith(/^(uas|eas|pas)\b/) || /ujian akhir|evaluasi akhir|penilaian akhir|akhir semester|final (test|exam)/.test(any)) return 'uas';
    if (/seluruh materi|semua materi/.test(any)) { if (weekFrom === 8) return 'uts'; if (weekFrom >= 15) return 'uas'; }
    // "Ujian"/"Evaluasi" saja pada minggu 8 atau 16
    if (startsWith(/^(ujian|evaluasi|penilaian|tes|test|exam)\b/) && !/materi\s+\w+/.test(fields[0])) { if (weekFrom === 8) return 'uts'; if (weekFrom >= 16) return 'uas'; }
    var mat = U.oneLine(m.materi || m.judul || '');
    // materi berupa RPS/kontrak itu sendiri -> pertemuan orientasi
    if (/^\s*(materi\s*(pembelajaran)?\s*[:：]\s*)?(rps|kontrak\s*(kuliah|perkuliahan|belajar)|review\s*rps|penjelasan\s*rps|pengenalan\s*rps|orientasi\s*perkuliahan)\b/i.test(mat)) return 'orientasi';
    if (/kontrak\s*(kuliah|perkuliahan|belajar)|review\s*rps|^rps\b|penjelasan\s*rps|orientasi\s*perkuliahan|gambaran\s*umum\s*perkuliahan|pengenalan\s*rps/i.test(any)) {
      var rest = mat.toLowerCase();
      if (courseName) rest = rest.split(courseName.toLowerCase()).join(' ');
      rest = rest.replace(/pengantar\s+(umum|perkuliahan|mata\s+kuliah)/g, ' ');
      rest = rest.replace(/kontrak|perkuliahan|kuliah|belajar|review|rps|penjelasan|pengenalan|orientasi|silabus|mata|dan|serta|tentang|gambaran|umum|rencana|pembelajaran|semester|pustaka|referensi|[\d,.:;\/()\-]/g, ' ');
      if (rest.replace(/\s+/g, '').length < 4) return 'orientasi';
    }
    return 'materi';
  };

  function finalizeMeetings(list, rps) {
    var out = [];
    list.forEach(function (m) {
      m.materi = U.clean(m.materi); m.subCpmk = U.clean(m.subCpmk); m.indikator = U.clean(m.indikator);
      m.kriteria = U.clean(m.kriteria); m.metode = U.clean(m.metode); m.bobot = U.oneLine(m.bobot);
      var sp = splitMateri(m.materi);
      if (sp.pustaka && !m.pustaka) m.pustaka = sp.pustaka;
      m.pustaka = U.oneLine(m.pustaka || '');
      if (!m.judul) m.judul = P.deriveTitle(m);
      m.jenis = m.jenis || P.classify(m, rps.mataKuliah);
      if (m.jenis === 'uts') m.judul = 'Ujian Tengah Semester (UTS)';
      if (m.jenis === 'uas') m.judul = 'Ujian Akhir Semester (UAS)';
      if (m.jenis === 'orientasi' && !m.judul) m.judul = 'Kontrak Perkuliahan';
      if (!m.judul) m.judul = 'Materi Minggu ' + m.minggu;
      m.id = m.id || 'm' + U.uid();
      var hasContent = (m.materi + m.subCpmk + m.indikator + m.judul).replace(/\W/g, '').length > 3;
      if (hasContent) out.push(m);
    });
    out.sort(function (a, b) { return (parseInt(a.minggu, 10) || 99) - (parseInt(b.minggu, 10) || 99); });
    // judul ganda (Sub-CPMK sama untuk beberapa minggu) -> turunkan dari indikator, atau beri penanda lanjutan
    var seen = {};
    out.forEach(function (m) {
      if (m.jenis !== 'materi') return;
      var key = m.judul.toLowerCase();
      if (seen[key]) {
        // pembeda: rumusan Sub-CPMK/capaian minggu itu, sisa materi, lalu indikator (bukan daftar soft/hard skill)
        var behav = /\b(soft|hard)\s*skills?\b/i.test(m.indikator || '');
        var ind1 = behav ? '' : String(m.indikator || '').split(/\n|\s+[-•]\s+|;\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return U.countWords(x) >= 2; })[0] || '';
        var alts = [P.cleanTitle(ind1), P.cleanTitle(splitMateri(m.materi).lines.slice(1).join(' ') || ''), P.cleanTitle(ampDan(m.subCpmk), 10)];
        var alt = alts.filter(function (a) { return a && U.countWords(a) >= 2 && !seen[a.toLowerCase()] && !/^(uts|uas)\b/i.test(a); })[0];
        if (alt) m.judul = alt;
        else m.judul = m.judul + ' (Lanjutan ' + (seen[key] + 1) + ')';
      }
      seen[key] = (seen[key] || 0) + 1;
      seen[m.judul.toLowerCase()] = seen[m.judul.toLowerCase()] || 1;
    });
    return out;
  }

  function newMeeting(week) {
    return { id: '', minggu: week ? week.label : '', jenis: '', judul: '', subCpmk: '', indikator: '', kriteria: '', metode: '', materi: '', pustaka: '', bobot: '' };
  }
  function appendField(m, key, text) {
    text = U.clean(text);
    if (!text) return;
    if (!m[key]) m[key] = text;
    else if (m[key].indexOf(text) < 0) m[key] += '\n' + text;
  }

  /* ---------- peran kolom tabel mingguan ---------- */
  P.roleOf = function (header) {
    var h = U.oneLine(header).toLowerCase();
    if (!h) return '';
    if (/^\(?\d+\)?$/.test(h)) return '';
    if (/^(mg|minggu|pert(emuan)?|sesi|week)\b|^ke\s*-?$|^no\.?$/.test(h)) return 'minggu';
    if (/materi|bahan\s*kajian|pokok\s*bahasan|topik/.test(h)) return 'materi';
    if (/indikator/.test(h)) return 'indikator';
    if (/kriteria|teknik\s*penilaian|bentuk\s*penilaian|instrumen/.test(h)) return 'kriteria';
    if (/sub[\s-]*cpmk|kemampuan\s*akhir|kemampuan\s*yang|cpmk|capaian/.test(h)) return 'subCpmk';
    if (/bentuk\s*pembelajaran|metode|penugasan|luring|daring|offline|online|pengalaman\s*belajar|model\s*pembelajaran|strategi|aktivitas/.test(h)) return 'metode';
    if (/pustaka|referensi|sumber/.test(h)) return 'pustaka';
    if (/bobot|%|persen/.test(h)) return 'bobot';
    if (/waktu|alokasi/.test(h)) return 'waktu';
    if (/^penilaian$/.test(h)) return '';
    return '';
  };

  /* ================= DOCX / DOC (tabel) ================= */
  function cellsOf(row) { return row.map(function (c) { return c.o ? c.t : ''; }); }

  function findLabelValue(tables, re, key) {
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].rows;
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          var cell = rows[r][c]; if (!cell.o) continue;
          var fl = firstLine(cell.t);
          if (!re.test(fl)) continue;
          var iv = inlineValue(fl, re);
          if (iv && validFor(key, iv)) return iv;
          // sisa teks setelah label tanpa titik dua = kalimat biasa, bukan label
          if (fl.replace(re, '').replace(/[:：\s]/g, '').length > 2) continue;
          var rest = restLines(cell.t);
          if (rest && validFor(key, rest)) return rest;
          for (var c2 = c + cell.cs; c2 < rows[r].length; c2++) {
            var right = rows[r][c2];
            if (!right.o) continue;
            if (right.t && validFor(key, right.t)) return right.t;
            break;
          }
          if (rows[r + 1] && rows[r + 1][c]) {
            var below = rows[r + 1][c].v || '';
            if (validFor(key, below)) return below;
          }
        }
      }
    }
    return '';
  }

  function sectionValue(tables, blocks, re) {
    // nilai berupa teks panjang di sel kanan label, atau paragraf setelah label
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].rows;
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          var cell = rows[r][c]; if (!cell.o) continue;
          if (!re.test(firstLine(cell.t))) continue;
          var rest = U.clean(cell.t.replace(re, ''));
          var vals = [];
          for (var c2 = c + cell.cs; c2 < rows[r].length; c2++) if (rows[r][c2].o && rows[r][c2].t) vals.push(rows[r][c2].t);
          var v = vals.join('\n') || rest;
          if (v && v.length > 3) return v;
        }
      }
    }
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type !== 'p' || !re.test(firstLine(b.text))) continue;
      var collected = [], inl = U.clean(b.text.replace(re, ''));
      if (inl) collected.push(inl);
      for (var j = i + 1; j < blocks.length && collected.length < 60; j++) {
        if (blocks[j].type !== 'p') break;
        if (isLabel(blocks[j].text) && !blocks[j].list) break;
        collected.push(blocks[j].text);
      }
      if (collected.length) return collected.join('\n');
    }
    return '';
  }

  function listItems(text, minLen) {
    return U.clean(text).split('\n').map(function (l) { return stripNum(l).replace(/^(utama|pendukung|tambahan)\s*[:：]\s*/i, ''); })
      .filter(function (l) { return l && l.length >= (minLen || 3) && !/^(utama|pendukung|tambahan)\s*[:：]?$/i.test(l); });
  }

  function capaian(tables, rps) {
    var codeRe = {
      cpl: /^(cpl[\s-]*(prodi)?[\s-]*\d+|s\s?\d{1,2}|p\s?\d{1,2}|ku\s?\d{1,2}|kk\s?\d{1,2}|plo[\s-]*\d+)\b/i,
      cpmk: /^(cpmk|clo)[\s-]*\d+/i,
      sub: /^(sub[\s-]*cpmk|llo)[\s-]*\d+/i
    };
    tables.forEach(function (t) {
      if (t.weekly) return;
      t.rows.forEach(function (row) {
        var rawCells = cellsOf(row).filter(function (c) { return U.oneLine(c); });
        var cells = rawCells.map(U.oneLine);
        if (cells.length < 1) return;
        cells.forEach(function (txt, idx) {
          var next = cells[idx + 1] || '';
          var nextRaw = rawCells[idx + 1] || '';
          [['sub', 'subCpmk'], ['cpmk', 'cpmk'], ['cpl', 'cpl']].forEach(function (pair) {
            var re = codeRe[pair[0]];
            if (pair[0] === 'cpmk' && codeRe.sub.test(txt)) return;
            var m = txt.match(re);
            if (!m) return;
            var body = txt.slice(m[0].length).replace(/^\s*[:.\-–]\s*/, '').trim();
            if (!body && next && next.length > 15 && !codeRe.cpl.test(next) && !/^v$/i.test(next)) body = next;
            if (body.length > 15) {
              var item = m[0].replace(/\s+/g, '').toUpperCase().replace(/^SUB-?CPMK/, 'Sub-CPMK') + ': ' + body;
              if (rps[pair[1]].indexOf(item) < 0) rps[pair[1]].push(item);
            }
          });
          // label umum "CPMK" dengan isi berbentuk "CPMK-1: ...; CPMK-2: ..."
          if (/^(cpmk|cpl)$/i.test(txt) && next && next.length > 15) {
            var key = /^cpl$/i.test(txt) ? 'cpl' : 'cpmk';
            // butir bisa dipisah baris/poin ("- Mampu …(CPMK-1)") atau diawali kode ("CPMK-1: …")
            var parts = String(nextRaw).split(/\n+|(?:^|\s)[-•▪]\s+(?=[A-Z])/).map(U.oneLine).filter(function (s) { return s.length > 15; });
            if (parts.length < 2) parts = next.split(/(?=\b(?:CPMK|CPL)[\s-]*\d+\s*[:.])/).map(function (s) { return s.trim(); }).filter(Boolean);
            parts.forEach(function (s) {
              s = s.replace(/^[-•▪]\s*/, '');
              if (rps[key].indexOf(s) < 0) rps[key].push(s);
            });
          }
        });
      });
    });
  }

  function weeklyFromTable(t, rps) {
    var rows = t.rows;
    for (var h = 0; h < Math.min(6, rows.length); h++) {
      var hdr = rows[h].map(function (c) { return c.v || ''; });
      var roles = hdr.map(P.roleOf);
      if (roles.indexOf('materi') < 0 && roles.indexOf('subCpmk') < 0) continue;
      var weekCol = roles.indexOf('minggu');
      if (weekCol < 0) { if (/minggu|mg|pert|sesi/i.test(hdr[0])) weekCol = 0; else continue; }
      // gabungkan baris header lanjutan (sub-header) dan lewati baris penomoran (1)(2)…
      var start = h + 1;
      while (start < rows.length) {
        var vals = rows[start].map(function (c) { return U.oneLine(c.t); });
        var nonEmpty = vals.filter(Boolean);
        var isNumbering = nonEmpty.length >= 3 && nonEmpty.every(function (v) { return /^\(?\d{1,2}\)?$/.test(v); }) && /^\(/.test(nonEmpty[0]);
        var isSubHeader = !P.parseWeek(rows[start][weekCol].t || '') && nonEmpty.length && nonEmpty.every(function (v) { return v.length < 40; }) && nonEmpty.some(function (v) { return P.roleOf(v); });
        if (isNumbering) { start++; continue; }
        if (isSubHeader) {
          rows[start].forEach(function (c, i) { var sub = U.oneLine(c.t); if (sub) { hdr[i] = (hdr[i] ? hdr[i] + ' ' : '') + sub; roles[i] = P.roleOf(sub) || P.roleOf(hdr[i]); } });
          start++; continue;
        }
        break;
      }
      roles = hdr.map(function (x, i) { return roles[i] || P.roleOf(x); });
      if (roles.indexOf('materi') < 0) {
        // header tanpa "materi": pakai kolom subCpmk sebagai sumber judul
        if (roles.indexOf('subCpmk') < 0) continue;
      }
      var meetings = [], cur = null;
      for (var r = start; r < rows.length; r++) {
        var row = rows[r];
        var weekCell = row[weekCol] || { t: '', v: '' };
        var wk = P.parseWeek(weekCell.o ? weekCell.t : '');
        var originCells = row.filter(function (c) { return c.o && U.oneLine(c.t); });
        if (!originCells.length) continue;
        var rowText = originCells.map(function (c) { return c.t; }).join(' ');
        if (/^(total|jumlah)\b/i.test(U.oneLine(rowText))) continue;
        if (wk) { cur = newMeeting(wk); meetings.push(cur); }
        else if (!cur) continue;
        else if (weekCell.vm) { /* lanjutan minggu yang sama (sel digabung) */ }
        // baris dengan satu sel lebar (mis. "Kontrak Perkuliahan", "Evaluasi Tengah Semester")
        var wide = originCells.filter(function (c) { return c !== weekCell && c.cs >= 3; });
        if (wide.length === 1 && originCells.length <= 2) { appendField(cur, 'materi', wide[0].t); continue; }
        row.forEach(function (c, ci) {
          if (ci === weekCol || !c.o) return;
          var role = roles[ci];
          if (!role || role === 'minggu' || role === 'waktu') return;
          if (c.cs > 1) {
            // sel yang melebar melintasi beberapa kolom: masukkan ke peran pertama yang bermakna
            for (var k = ci; k < ci + c.cs; k++) if (roles[k] && roles[k] !== 'minggu') { role = roles[k]; break; }
          }
          appendField(cur, role, c.t);
        });
      }
      if (meetings.length >= 2) return meetings;
    }
    return null;
  }

  function parseTables(ext, rps) {
    var blocks = ext.blocks || [];
    var tables = blocks.filter(function (b) { return b.type === 'table'; });
    if (ext.kind === 'doc') tables = docPseudoTables(blocks);

    ['mataKuliah', 'kode', 'rumpun', 'sks', 'semester'].forEach(function (k) {
      var v = findLabelValue(tables, LBL[k], k);
      if (!v) {
        for (var i = 0; i < blocks.length; i++) {
          if (blocks[i].type !== 'p') continue;
          var iv = inlineValue(firstLine(blocks[i].text), LBL[k]);
          if (iv && validFor(k, iv)) { v = iv; break; }
        }
      }
      rps[k] = U.oneLine(v);
    });
    rps.deskripsi = U.clean(sectionValue(tables, blocks, LBL.deskripsi));
    rps.bahanKajian = listItems(sectionValue(tables, blocks, LBL.bahan), 4).slice(0, 30);
    rps.pustaka = listItems(sectionValue(tables, blocks, LBL.pustaka), 15).slice(0, 60);

    var weekly = null;
    for (var i = 0; i < tables.length && !weekly; i++) {
      var w = weeklyFromTable(tables[i], rps);
      if (w) { tables[i].weekly = true; weekly = w; }
    }
    capaian(tables, rps);
    if (weekly) { rps.pertemuan = weekly; rps.sumber = 'tabel'; }
    findFakultasProdi(ext.text || '', rps);
  }

  function docPseudoTables(blocks) {
    var tables = [], cur = null;
    blocks.forEach(function (b) {
      if (b.type === 'p' && b.docRow) {
        var cells = b.text.split(/\s\|\s/).map(function (s) { return s.trim(); });
        if (!cur) { cur = { type: 'table', rows: [] }; tables.push(cur); }
        cur.rows.push(cells.map(function (t) { return { t: t, v: t, o: true, cs: 1, rs: 1 }; }));
      } else cur = null;
    });
    tables.forEach(function (t) {
      var w = 0; t.rows.forEach(function (r) { w = Math.max(w, r.length); });
      t.rows.forEach(function (r) { while (r.length < w) r.push({ t: '', v: '', o: true, cs: 1, rs: 1 }); });
    });
    return tables;
  }

  function findFakultasProdi(text, rps) {
    var t = String(text || '');
    var m = t.match(/FAKULTAS\s+([A-Za-z ,&]+?)(?:\s*\||\n|\s{2,}|\s+(PRO(GRAM|DI)|S[123]|D[34]|JURUSAN)\b|$)/i);
    if (m && !/^(ini|tersebut)\b/i.test(m[1])) rps.fakultas = 'Fakultas ' + U.titleCase(m[1].replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim());
    var re = /(^|[^A-Za-z])(PROGRAM\s+STUDI|PRODI)\s*[:：]?\s*([A-Za-z ]{4,60}?)(?=\s*\||\n|\s{2,}|$)/gi, mm;
    while ((mm = re.exec(t))) {
      var before = t.slice(Math.max(0, mm.index - 14), mm.index + mm[1].length).toLowerCase();
      var val = mm[3].trim();
      if (/ketua|ka\.?\s*$|kaprodi|koordinator|sekretaris/.test(before)) continue; // "Ketua PRODI" di area tanda tangan
      if (/^(tanda|ttd|ketua|yang|dan|di|pada)\b/i.test(val)) continue;
      rps.prodi = U.titleCase(val);
      break;
    }
    if (!rps.prodi) { var s1 = t.match(/\bS1\s+([A-Z][A-Z ]{4,50})(?:\n|\||$)/); if (s1) rps.prodi = U.titleCase(s1[1].trim()); }
    // kop lama: "JURUSAN MANAJEMEN DAKWAH" tanpa label Program Studi
    if (!rps.prodi) { var jr = t.match(/\bJURUSAN\s+([A-Z][A-Z ]{3,50}?)(?:\s*\||\n|\s{2,}|$)/); if (jr) rps.prodi = U.titleCase(jr[1].trim()); }
  }

  /* ================= PDF (baris + posisi x) ================= */
  function pdfLines(ext) {
    var out = [];
    (ext.pages || []).forEach(function (pg) {
      pg.lines.forEach(function (l) {
        if (l.running) return;
        var items = (l.items || []).filter(function (it) { return it.s && it.s.trim(); });
        out.push({ page: pg.n, pw: pg.width, ph: pg.height, y: l.y, x: l.x, h: items.length ? items[0].h : 10, segs: l.segs, items: items, text: l.text });
      });
    });
    return out;
  }

  /* Label identitas bisa terlipat beberapa baris di kolom yang sama ("NAMA MATA" / "KULIAH:",
     "BOBOT" / "(SKS):"). Kembalikan teks label gabungan + indeks baris terakhirnya. */
  function stackedLabel(lines, i, seg) {
    var text = seg.s, last = i, out = [{ text: text, last: i }];
    for (var j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      if (lines[j].page !== lines[i].page || lines[j].y - lines[last].y > 16) break;
      var nx = lines[j].segs.find(function (v) { return Math.abs(v.x - seg.x) < 8; });
      if (!nx || U.countWords(nx.s) > 3) break;
      text += ' ' + nx.s; last = j;
      out.push({ text: text, last: j });
      if (/[:：]\s*$/.test(nx.s)) break;
    }
    return out.reverse(); // yang terpanjang dulu
  }

  function pdfIdentity(lines, rps) {
    var keys = ['mataKuliah', 'kode', 'rumpun', 'sks', 'semester'];
    keys.forEach(function (k) {
      if (rps[k]) return;
      for (var i = 0; i < lines.length && !rps[k]; i++) {
        if (lines[i].page > 3) break; // identitas selalu di halaman awal
        var segs = lines[i].segs;
        for (var s = 0; s < segs.length; s++) {
          var seg = segs[s];
          var cand = stackedLabel(lines, i, seg).find(function (c) { return LBL[k].test(c.text) && c.text.replace(LBL[k], '').replace(/[:：\s]/g, '').length <= 2; });
          if (!cand) {
            if (!LBL[k].test(seg.s)) continue;
            var inline = inlineValue(seg.s, LBL[k]);
            if (inline && validFor(k, inline)) { rps[k] = inline; break; }
            continue; // kalimat biasa ("Mata kuliah ini memaparkan…"), bukan label
          }
          if (k === 'mataKuliah' && /\(\s*(inggris|eng)/i.test(cand.text)) continue;
          if (k === 'sks' && /tatap muka|praktikum|praktik|simulasi/i.test(cand.text)) continue;
          var right = segs[s + 1];
          if (cand.last === i && right && validFor(k, right.s) && !isLabel(right.s) && right.x - (seg.x + seg.w) < 120 && k !== 'mataKuliah' && !LBL.semester.test(right.s)) { rps[k] = right.s; break; }
          // nilai di baris bawah label, dalam rentang kolom label
          var x0 = seg.x - 8, x1 = seg.x + Math.max(seg.w, 70);
          var nextLabel = segs[s + 1];
          if (nextLabel) x1 = Math.min(x1, nextLabel.x - 2);
          for (var j = cand.last + 1; j < Math.min(lines.length, cand.last + 4); j++) {
            if (lines[j].page !== lines[i].page) break;
            var hit = lines[j].segs.find(function (v) { return v.x < x1 && v.x + v.w > x0; });
            if (hit && validFor(k, hit.s)) {
              var val = hit.s, lastJ = j;
              // nilai (nama MK) yang terlipat ke baris berikutnya pada kolom yang sama
              while (k === 'mataKuliah' && lines[lastJ + 1] && lines[lastJ + 1].page === lines[j].page && lines[lastJ + 1].y - lines[lastJ].y < 18) {
                var nx = lines[lastJ + 1].segs.find(function (v) { return v.x < x1 && v.x + v.w > x0; });
                if (!nx || isLabel(nx.s) || U.countWords(val + ' ' + nx.s) > 10 || /^[A-Z ]{4,}[:：]?$/.test(nx.s) && /[a-z]/.test(val)) break;
                val += ' ' + nx.s; lastJ++;
              }
              rps[k] = val; break;
            }
            if (hit && !/^[A-Z(][A-Z()\s]*[:：]?$/.test(hit.s)) break; // isi lain (bukan potongan label)
          }
          if (rps[k]) break;
        }
      }
      rps[k] = U.oneLine(rps[k]);
    });
  }

  var LABEL_FRAG = /^[\/(]?\s*(singkat|mata|kuliah|mk|materi|pembelajaran|pokok|pembahasan|bahasan|kajian|utama|pendukung|lulusan|keilmuan|\(?(cpmk|cpl|clo|plo|llo|sub-?cpmk)\)?)(\s+(mata|kuliah|mk|pembelajaran|pembahasan|bahasan|\(?(cpmk|cpl|clo|plo|mk)\)?))*\s*[:：\/]?\s*(\/\s*(clo|plo|llo))?\s*$/i;
  function pdfSection(lines, re) {
    for (var i = 0; i < lines.length; i++) {
      var first = lines[i].segs[0];
      // label boleh terpecah beberapa baris di kolom kiri (mis. "Bahan" / "Kajian:"), kadang diselingi
      // baris yang hanya berisi nilai ("Capaian" / "Pembelajaran" … "Lulusan (CPL)")
      var labelText = first.s, k = i, labelX = first.x;
      for (var look = i + 1; !re.test(labelText) && look < lines.length && look - i <= 5; look++) {
        if (lines[look].page !== lines[i].page || lines[look].y - lines[k].y > 30) break;
        var nf = lines[look].segs[0];
        if (Math.abs(nf.x - labelX) > 12) continue;
        labelText += ' ' + nf.s; k = look;
      }
      if (!re.test(labelText)) continue;
      if (/minggu|sesi|mg\s*ke|indikator/i.test(lines[i].text)) continue; // header tabel mingguan
      var vals = [], seenValue = false, valX = null;
      for (var j = i; j < lines.length && j < i + 120; j++) {
        var ln = lines[j];
        var left = ln.segs[0];
        // tabel mingguan/judul tabel berikutnya = bagian sudah selesai
        if (j > k && (ln.segs.some(function (s) { return /^(mg|minggu|sesi|pertemuan)\b/i.test(s.s) && U.countWords(s.s) <= 3; }) || /^(rencana\s+(kegiatan|pembelajaran|evaluasi|penilaian|perkuliahan)|rancangan\s+pembelajaran|jadwal\s+perkuliahan)\b/i.test(left.s))) break;
        // teks yang mulai jauh di kiri kolom nilai (bukan di kolom label) = tata letak lain (tabel)
        if (j > k && valX != null && left.x < valX - 40 && left.x > labelX + 30) break;
        // potongan lanjutan label di kolom kiri ("KULIAH:", "BAHASAN", "Singkat MK", "Materi" / "pembelajaran",
        // "/Pokok" / "Pembahasan") bukan awal bagian baru
        var labelFrag = j > k && j - k <= 2 && Math.abs(left.x - labelX) <= 8 && U.countWords(left.s) <= 3 &&
          (/[:：]\s*$/.test(left.s) || /^[A-Z\/()]+$/.test(left.s.replace(/\s/g, '')) && !isLabel(left.s) || LABEL_FRAG.test(left.s));
        if (labelFrag) k = j;
        if (j > k && Math.abs(left.x - labelX) <= 8 && seenValue) break;
        if (j > k && Math.abs(left.x - labelX) <= 8 && isLabel(left.s)) break;
        var vs = ln.segs.filter(function (s) { return s.x > labelX + 30; });
        if (j <= k) vs = vs.filter(function (s) { return !re.test(s.s); });
        if (vs.length) { vals.push(vs.map(function (s) { return s.s; }).join(' ')); seenValue = true; if (valX == null || vs[0].x < valX) valX = vs[0].x; }
        else if (!vs.length && seenValue && j > k && ln.segs.length && ln.segs[0].x <= labelX + 30) break;
      }
      if (vals.length) return vals;
    }
    return [];
  }

  /* Daftar rujukan tanpa nomor: satu rujukan per baris yang diawali nama penulis dan memuat tahun;
     baris tanpa tahun dianggap lanjutan rujukan sebelumnya. */
  function splitRefs(lines) {
    var out = [];
    lines.forEach(function (l) {
      var t = U.oneLine(l);
      if (!t) return;
      if (/^\(?\d{1,2}[.)]\s/.test(t)) return; // berpenomoran: sudah ditangani mergeNumbered
      var starts = /^[A-Z][^\s]*/.test(t) && /\b(19|20)\d{2}\b/.test(t.slice(0, 90));
      if (starts || !out.length) out.push(t);
      else out[out.length - 1] += ' ' + t;
    });
    return out.filter(function (s) { return s.length > 15 && /\b(19|20)\d{2}\b/.test(s); });
  }

  function mergeNumbered(lines) {
    var items = [];
    lines.forEach(function (l) {
      var t = U.oneLine(l);
      if (!t) return;
      if (/^\(?\d{1,2}[.)]?$/.test(t)) { items.push(''); return; } // nomor sendirian di satu baris (cetakan SIAKAD)
      if (/^\(?\d{1,2}[.)]\s*/.test(t) || /^[-•·▪]\s+/.test(t) || !items.length) items.push(stripNum(t).replace(/^\(?\d{1,2}[.)]\s*/, ''));
      else items[items.length - 1] = (items[items.length - 1] + ' ' + t).trim();
    });
    return items.map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 2 && !/^bagian\s+(\w+)\s*[:：]/i.test(s); });
  }

  var CODE_G = /\b(cpl|cpmk|clo|sub[\s-]*cpmk)[\s-]*\d+/gi;
  /* lines = baris SEBELUM tabel mingguan (kode di tabel mingguan/lampiran penilaian bukan definisi) */
  function pdfCapaian(lines, rps) {
    var res = [
      ['subCpmk', /^(sub[\s-]*cpmk|llo)[\s-]*\d+/i],
      ['cpmk', /^(cpmk|clo)[\s-]*\d+/i],
      ['cpl', /^(cpl[\s-]*(prodi)?[\s-]*\d+|s\s?\d{1,2}|p\s?\d{1,2}|ku\s?\d{1,2}|kk\s?\d{1,2})\b/i]
    ];
    var cur = null;
    var findHit = function (segs) {
      for (var s = 0; s < segs.length; s++) {
        for (var r = 0; r < res.length; r++) {
          var m = segs[s].s.match(res[r][1]);
          if (m && !(r === 1 && res[0][1].test(segs[s].s))) {
            var after = segs[s].s.slice(m[0].length);
            if (/^\s*\)/.test(after)) continue; // "(Sub-" / "CPMK-4)": rujukan kode yang terlipat, bukan definisi
            var body = (after + ' ' + segs.slice(s + 1).map(function (x) { return x.s; }).join(' ')).replace(/^\s*[:.\-–]\s*/, '').trim();
            return { key: res[r][0], code: m[0].replace(/\s+/g, ''), body: body, x: segs[s + 1] ? segs[s + 1].x : segs[s].x };
          }
        }
      }
      return null;
    };
    lines.forEach(function (ln) {
      var segs = ln.segs;
      // kode bisa menempel pada potongan label di segmen yang sama ("Pembelajaran CPL-6") -> periksa juga per item
      var hit = findHit(segs) || (ln.items && ln.items.length > segs.length ? findHit(ln.items) : null);
      if (hit) {
        if (/^(sub[\s-]*cpmk|cpmk)/i.test(hit.code) && /(^|\s)(v|✓|√)(\s|$)/i.test(hit.body) && hit.body.length < 25) { cur = null; return; }
        // baris matriks/pemetaan: beberapa kode tanpa kalimat ("CPMK-1 CPMK-2 CPMK-3", "CPL-5 CPL-9 Bobot (%)")
        var codes = (hit.body.match(CODE_G) || []).length;
        if (codes >= 3 || (codes >= 1 && U.countWords(hit.body.replace(CODE_G, '').replace(/[^A-Za-z\s]/g, ' ')) < 4)) { cur = null; return; }
        cur = { key: hit.key, text: hit.code + ': ' + hit.body, code: hit.code.toLowerCase().replace(/[^a-z0-9]/g, ''), x: hit.x };
        rps[hit.key].push(cur);
      } else if (cur && segs[0] && segs[0].x >= cur.x - 25 && ln.text.length > 3 && !isLabel(ln.text)) {
        cur.text += ' ' + segs.map(function (x) { return x.s; }).join(' ');
      } else cur = null;
    });
    ['cpl', 'cpmk', 'subCpmk'].forEach(function (k) {
      var seen = {}, seenCode = {};
      rps[k] = rps[k].filter(function (o) {
        if (typeof o === 'string') return true;
        var t = U.oneLine(o.text), body = t.replace(/^[^:]*:\s*/, '');
        // definisi berupa kalimat (min. 4 kata), satu per kode ("S1: Manajemen Dakwah" dari kop bukan CPL)
        if (seen[t.slice(0, 40)] || (o.code && seenCode[o.code]) || U.countWords(body.replace(CODE_G, '')) < 4) return false;
        seen[t.slice(0, 40)] = 1; if (o.code) seenCode[o.code] = 1;
        return true;
      }).map(function (o) { return typeof o === 'string' ? o : U.oneLine(o.text); });
    });
    // CPMK berbentuk daftar bernomor dengan kode di akhir kalimat ("1. Mampu … (CPMK-1)")
    if (rps.cpmk.length < 2) {
      var tc = trailingCodeItems(lines);
      var sec = mergeNumbered(pdfSection(lines, /^(rumusan\s+cpmk|capaian\s+pembelajaran\s+mata\s+kuliah(\s*\(cpmk\))?|cpmk\s*$)/i))
        .filter(function (t) { return U.countWords(t) >= 5 && /\b(mampu|dapat|memahami|menjelaskan|menganalisis|mengidentifikasi|menerapkan|mendesain|menyusun|memiliki)\b/i.test(t); });
      // butir berkode lebih andal; daftar bagian dipakai bila memuat lebih banyak butir
      var best = sec.length > tc.length ? sec : tc;
      if (best.length > rps.cpmk.length) rps.cpmk = best.slice(0, 12);
    }
    // CPL tanpa kode, dikelompokkan Sikap / Pengetahuan / Keterampilan Umum / Khusus
    if (!rps.cpl.length) {
      var raw = pdfSection(lines, /^(capaian\s+pembelajaran\s+lulusan|cpl(\s*-?\s*prodi)?\s*(\(|:|$))/i);
      var items = [], open = false;
      raw.forEach(function (v) {
        var t = U.oneLine(v);
        if (!t) return;
        var head = t.match(/^(sikap|pengetahuan|keterampilan|ketrampilan)(\s+(umum|khusus))?\s*(?:[:：]\s*(.*))?$/i);
        if (head) { t = head[4] || ''; open = false; if (!t) return; }
        if (/^(\(?\d{1,2}[.)]|[a-z][.)]|[-•·▪])\s*/i.test(t) || !open) { items.push(stripNum(t).replace(/^\(?\d{1,2}[.)]\s*/, '')); open = true; }
        else items[items.length - 1] += ' ' + t;
      });
      rps.cpl = items.map(U.oneLine).filter(function (t) { return U.countWords(t) >= 5; }).slice(0, 20);
    }
  }

  /* Butir bernomor "1. Mampu … (CPMK-1)" yang bisa terlipat ke baris/halaman berikutnya. */
  function trailingCodeItems(lines) {
    var out = [], buf = null, seen = {};
    lines.forEach(function (ln) {
      var segs = ln.segs, mi = -1;
      for (var s = 0; s < segs.length; s++) if (/^\d{1,2}[.)](\s|$)/.test(segs[s].s)) { mi = s; break; }
      if (mi >= 0) buf = { x: segs[mi].x, text: segs.slice(mi).map(function (x) { return x.s; }).join(' ').replace(/^\d{1,2}[.)]\s*/, '') };
      else if (buf) {
        var vs = segs.filter(function (x) { return x.x >= buf.x - 4; });
        if (!vs.length || isLabel(vs[0].s)) { buf = null; return; }
        buf.text += ' ' + vs.map(function (x) { return x.s; }).join(' ');
      }
      if (!buf) return;
      var m = buf.text.match(/\(\s*(?:cpmk|clo)[\s-]*(\d{1,2})\s*\)\s*[.;,]?\s*$/i);
      if (m) {
        var txt = U.oneLine(buf.text.slice(0, m.index));
        if (!seen[m[1]] && U.countWords(txt) >= 4) { seen[m[1]] = 1; out.push('CPMK-' + m[1] + ': ' + txt); }
        buf = null;
      } else if (U.countWords(buf.text) > 90) buf = null;
    });
    return out;
  }

  /* baris penomoran kolom "(1) (2) …" — kadang bercampur kata ("Luring (5)"), terpecah per huruf,
     atau berupa angka polos "1 2 3 4 5 6 7 8" */
  function isNumberingLine(ln) {
    var toks = (ln.text.match(/\(\s*\d{1,2}\s*\)/g) || []).length;
    if (toks < 3) return isBareNumbering(ln);
    return ln.text.replace(/\(\s*\d{1,2}\s*\)/g, '').replace(/luring|daring|offline|online/gi, '').replace(/[()\s]/g, '').length <= 12;
  }
  function isBareNumbering(ln) {
    var t = String(ln.text || '').trim().split(/\s+/);
    if (t.length < 4) return false;
    for (var i = 0; i < t.length; i++) if (t[i] !== String(i + 1)) return false;
    return true;
  }
  function cleanNumbering(ln) {
    return ln.segs.length >= 3 && (ln.segs.every(function (s) { return /^\(\d{1,2}\)$/.test(s.s); }) || (isBareNumbering(ln) && ln.segs.length >= 4 && ln.segs.every(function (s) { return /^\d{1,2}$/.test(s.s); })));
  }

  /* ---------- tabel mingguan berbasis garis tabel (paling andal untuk PDF ekspor Word) ---------- */
  function dedupeNums(xs, tol) {
    xs = xs.slice().sort(function (a, b) { return a - b; });
    var out = [];
    xs.forEach(function (x) { if (!out.length || x - out[out.length - 1] > tol) out.push(x); });
    return out;
  }
  function colByLeft(cols, x) { for (var i = 0; i < cols.length; i++) if (x >= cols[i].l - 2 && x < cols[i].r - 1) return cols[i]; return null; }
  /* kosakata dokumen (dipakai untuk menyambung kata yang terpotong tanpa tanda hubung di kolom sempit) */
  var VOCAB = {};
  function buildVocab(lines) {
    var v = {};
    lines.forEach(function (l) { (String(l.text || '').toLowerCase().match(/[a-z]{4,}/g) || []).forEach(function (w) { v[w] = (v[w] || 0) + 1; }); });
    return v;
  }
  var WRAP_SUFFIX = /^(an|kan|nya|ban)$/;
  function wrapJoin(out, s) {
    var a = (out.match(/([A-Za-z]+)\s*$/) || [])[1], b = (s.match(/^\s*([a-z]+)/) || [])[1];
    if (!a || !b || !/[a-z]$/.test(a) || a.length < 3) return false;
    if (VOCAB[(a + b).toLowerCase()] && !VOCAB[b]) return true; // "org" + "anisasi"
    return a.length >= 6 && WRAP_SUFFIX.test(b); // "pertanggungjawab" + "an"
  }
  function itemsText(items) {
    var out = '', prev = null;
    items.forEach(function (it) {
      var s = it.s.replace(/\s+/g, ' ');
      if (!prev) out = s;
      else if (Math.abs(prev.y - it.y) < 3 && it.x - (prev.x + prev.w) < 0.8) out += s; // potongan kata yang bersentuhan
      else if (Math.abs(prev.y - it.y) >= 3 && wrapJoin(out, s)) out = out.replace(/\s+$/, '') + s.replace(/^\s+/, '');
      else out += ' ' + s;
      prev = it;
    });
    return out.replace(/\s+/g, ' ').replace(/(\w)\s+-\s+(\w)/g, '$1-$2').trim();
  }
  function insideTable(pg, y, left, right) {
    return (pg.rules.v || []).some(function (v) { return (Math.abs(v.x - left) < 3 || Math.abs(v.x - right) < 3) && v.y0 - 3 <= y && v.y1 + 3 >= y; });
  }

  function pdfTableByRules(lines, pageMap, dataStart, block) {
    var first = lines[dataStart];
    if (!first) return null;
    var pg0 = pageMap[first.page];
    if (!pg0 || !pg0.rules || pg0.rules.v.length < 4) return null;
    var probeY = first.y - first.h * 0.35;
    var xs = dedupeNums(pg0.rules.v.filter(function (v) { return v.y0 - 2 <= probeY && v.y1 + 2 >= probeY; }).map(function (v) { return v.x; }), 3);
    if (xs.length < 4) return null;
    var cols = [];
    for (var i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] > 8) cols.push({ l: xs[i], r: xs[i + 1], h: '' });
    if (cols.length < 3) return null;
    var left = cols[0].l, right = cols[cols.length - 1].r;
    block.forEach(function (l) {
      (l.items && l.items.length ? l.items : l.segs).forEach(function (it) {
        var cx = it.x + Math.min(it.w, 200) / 2;
        var c = cols.find(function (cc) { return cx >= cc.l && cx < cc.r; });
        if (c) c.h += ' ' + it.s;
      });
    });
    cols.forEach(function (c) { c.role = P.roleOf(c.h); });
    if (!cols[0].role) cols[0].role = 'minggu';
    var weekCol = cols.find(function (c) { return c.role === 'minggu'; }) || cols[0];
    var colXs = cols.map(function (c) { return c.l; }).concat([right]);

    // kelompokkan baris teks per halaman ke dalam pita baris (di antara garis horizontal selebar tabel)
    var rows = []; // {lines:[...]} berurutan
    var pageNums = [];
    lines.forEach(function (l, idx) { if (idx >= dataStart && pageNums.indexOf(l.page) < 0) pageNums.push(l.page); });
    for (var pi = 0; pi < pageNums.length; pi++) {
      var pn = pageNums[pi], pg = pageMap[pn];
      if (!pg) break;
      if (pi > 0) {
        if (pg.width !== pg0.width) break; // orientasi berubah: tabel sudah selesai
        var pv = dedupeNums(pg.rules.v.map(function (v) { return v.x; }), 2);
        var match = colXs.filter(function (x) { return pv.some(function (px) { return Math.abs(px - x) < 3; }); }).length;
        if (match < Math.ceil(colXs.length * 0.6)) break;
      }
      var hs = dedupeNums(pg.rules.h.filter(function (hr) { return hr.x0 <= left + 12 && hr.x1 >= right - 12; }).map(function (hr) { return hr.y; }), 2);
      var bands = {};
      var ended = false;
      lines.forEach(function (l, idx) {
        if (l.page !== pn || idx < dataStart || ended || isNumberingLine(l)) return;
        var mid = l.y - l.h * 0.35;
        if (!insideTable(pg, mid, left, right)) {
          if (hs.length && mid > hs[hs.length - 1]) ended = true; // teks di bawah tabel
          return;
        }
        var b = 0; while (b < hs.length && hs[b] < mid) b++;
        (bands[b] = bands[b] || []).push(l);
      });
      Object.keys(bands).map(Number).sort(function (a, b) { return a - b; }).forEach(function (b) { rows.push({ page: pn, lines: bands[b] }); });
      if (ended) break;
    }

    var meetings = [], cur = null, lastFrom = 0, done = false;
    rows.forEach(function (row) {
      if (done) return;
      // satu pita bisa memuat beberapa minggu bila garis antarbaris tidak digambar
      var parts = splitByAnchors(row.lines, weekCol, cols);
      parts.forEach(function (part) {
        if (done) return;
        var cells = {};
        part.forEach(function (l) {
          l.items.forEach(function (it) {
            var c = colByLeft(cols, it.x);
            if (!c) return;
            (cells[cols.indexOf(c)] = cells[cols.indexOf(c)] || []).push(it);
          });
        });
        var wkText = itemsText(cells[cols.indexOf(weekCol)] || []);
        var wk = wkText && !/^\(/.test(wkText) ? P.parseWeek(wkText) : null;
        if (wk) {
          if (wk.from < lastFrom || wk.from > 20) { done = true; return; }
          if (!(cur && cur.minggu === wk.label)) { cur = newMeeting(wk); meetings.push(cur); }
          lastFrom = wk.from;
        }
        if (!cur) return;
        cols.forEach(function (c, ci) {
          if (c === weekCol || !c.role || c.role === 'minggu' || c.role === 'waktu' || !cells[ci]) return;
          appendField(cur, c.role, itemsText(cells[ci]));
        });
        if (wk && wk.to >= 16) done = true;
      });
    });
    return meetings.length >= 2 ? meetings : null;
  }

  /* Pisahkan baris-baris teks menjadi baris tabel per jangkar nomor minggu.
     Batas diletakkan pada celah vertikal terbesar sebelum jangkar (nomor minggu bisa berada di tengah sel). */
  function splitByAnchors(ls, weekCol, cols) {
    var anchors = [], prevT = '', prevI = -1;
    ls.forEach(function (l, i) {
      var its = l.items.filter(function (it) { return colByLeft(cols, it.x) === weekCol; });
      var t = itemsText(its);
      if (!t || /^\(/.test(t) || !P.parseWeek(t)) return;
      // "11-" lalu "12" di baris berikutnya = satu label minggu "11-12"
      if (prevI >= 0 && /[-–]\s*$/.test(prevT) && /^\d{1,2}$/.test(t) && ls[prevI].page === l.page && l.y - ls[prevI].y < 1.9 * (l.h || 10)) { prevT = t; return; }
      anchors.push(i); prevT = t; prevI = i;
    });
    if (anchors.length <= 1) return [ls];
    var cuts = [0];
    for (var a = 1; a < anchors.length; a++) {
      var lo = anchors[a - 1] + 1, hi = anchors[a], best = hi, bestGap = -1;
      for (var k = lo; k <= hi; k++) {
        var gap = ls[k].page === ls[k - 1].page ? ls[k].y - ls[k - 1].y : 999;
        if (gap > bestGap + 0.5) { bestGap = gap; best = k; }
      }
      cuts.push(best);
    }
    var parts = [];
    for (var c = 0; c < cuts.length; c++) parts.push(ls.slice(cuts[c], cuts[c + 1]));
    return parts.filter(function (p) { return p.length; });
  }

  function pdfWeekly(lines, pageMap) {
    for (var i = 0; i < lines.length; i++) {
      var wkSeg = lines[i].segs.find(function (s) { return /^(mg|minggu|pert(emuan)?|sesi|week)\b/i.test(s.s); });
      if (!wkSeg) continue;
      // teks header bisa berada di atas baris "Mg" (mis. "Materi Pembelajaran" pada baris sebelumnya)
      var block = [];
      for (var a = Math.max(0, i - 4); a < i; a++) {
        var la = lines[a];
        if (la.page === lines[i].page && lines[i].y - la.y <= 40 && !P.parseWeek(la.segs[0].s)) block.push(la);
      }
      block.push(lines[i]);
      var j = i + 1, numbering = null;
      while (j < lines.length && j < i + 14) {
        var ln = lines[j], f = ln.segs[0];
        if (isNumberingLine(ln)) {
          // header berakhir di baris penomoran kolom; sisa token "(6)" di baris berikutnya ikut dilewati
          if (!numbering && cleanNumbering(ln)) numbering = ln;
          j++;
          while (j < lines.length && /^(\(\s*\d{1,2}\s*\)\s*)+$/.test(lines[j].text.trim())) j++;
          break;
        }
        if (f && Math.abs(f.x - wkSeg.x) < 45 && P.parseWeek(f.s) && !/^\(/.test(f.s)) break;
        if (ln.page !== lines[i].page || ln.y - lines[j - 1].y > 40) break;
        block.push(ln); j++;
      }
      var headerText = block.map(function (b) { return b.text; }).join(' ');
      if (!/materi|bahan\s*kajian|pokok\s*bahasan/i.test(headerText)) continue;
      var headerIdx = lines.indexOf(block[0]);
      // 1) garis tabel vektor (PDF ekspor Word / cetakan SIAKAD)
      var byRules = pageMap ? pdfTableByRules(lines, pageMap, j, block) : null;
      if (byRules && byRules.length >= 2) return { meetings: byRules, header: headerIdx };
      // 2) cadangan: kolom dari teks header + posisi awal teks data
      var cols = numbering ? colsFromNumbering(numbering, block, lines, j) : colsFromHeader(block);
      if (!cols || cols.length < 3) continue;
      refineCols(cols, lines.slice(j, j + 90));
      var meetings = pdfRows(lines, j, cols, block);
      if (meetings.length >= 2) return { meetings: meetings, header: headerIdx };
    }
    return null;
  }

  /* Batas kolom disempurnakan dari posisi awal teks data (teks sel rata kiri):
     awal teks yang jatuh di antara dua pusat kolom menandai tepi kiri kolom kanan. */
  function refineCols(cols, dataLines) {
    var starts = [];
    dataLines.forEach(function (l) { if (!isNumberingLine(l)) l.segs.forEach(function (s) { starts.push(s.x); }); });
    for (var i = 0; i < cols.length - 1; i++) {
      var c1 = cols[i].c, c2 = cols[i + 1].c;
      if (c1 == null || c2 == null) continue;
      var between = starts.filter(function (x) { return x > c1 + 2 && x < c2 - 2; });
      if (between.length) {
        var mn = Math.min.apply(null, between) - 2;
        if (mn > c1) { cols[i].r = mn; cols[i + 1].l = mn; }
      }
    }
  }

  function colsFromNumbering(numLine, block, lines, dataStart) {
    var centers = numLine.segs.map(function (s) { return s.x + s.w / 2; }).sort(function (a, b) { return a - b; });
    var minX = Infinity;
    block.concat(lines.slice(dataStart, dataStart + 40)).forEach(function (l) { if (l.page === numLine.page) l.segs.forEach(function (s) { minX = Math.min(minX, s.x); }); });
    var b = [Math.min(minX - 4, centers[0] - 8)];
    for (var i = 0; i < centers.length; i++) {
      var nb = 2 * centers[i] - b[i];
      if (i + 1 < centers.length && (nb <= centers[i] || nb >= centers[i + 1])) nb = (centers[i] + centers[i + 1]) / 2;
      b.push(nb);
    }
    var cols = centers.map(function (c, i) { return { l: i === 0 ? -1e9 : b[i], r: i === centers.length - 1 ? 1e9 : b[i + 1], h: '', c: c }; });
    block.forEach(function (l) { l.segs.forEach(function (s) { var c = colAt(cols, s.x + Math.min(s.w, 30) / 2); if (c) c.h += ' ' + s.s; }); });
    cols.forEach(function (c) { c.role = P.roleOf(c.h); });
    if (!cols[0].role) cols[0].role = 'minggu';
    return cols;
  }

  function colsFromHeader(block) {
    var segs = [];
    block.forEach(function (l, li) { l.segs.forEach(function (s) { segs.push({ s: s.s, l: s.x, r: s.x + s.w, li: li }); }); });
    // header yang membentang di atas >=2 sub-header diperlakukan sebagai awalan
    segs.forEach(function (a) {
      var under = segs.filter(function (b) { return b.li > a.li && b.l >= a.l - 6 && b.r <= a.r + 6 && b !== a; });
      var distinct = 0, lastR = -1e9;
      under.sort(function (x, y) { return x.l - y.l; }).forEach(function (b) { if (b.l > lastR + 2) { distinct++; lastR = b.r; } });
      a.span = distinct >= 2;
    });
    var base = segs.filter(function (s) { return !s.span; }).sort(function (a, b) { return a.l - b.l; });
    var clusters = [];
    base.forEach(function (s) {
      var c = clusters[clusters.length - 1];
      if (c && s.l <= c.r + 3) { c.r = Math.max(c.r, s.r); c.h += ' ' + s.s; }
      else clusters.push({ l: s.l, r: s.r, h: s.s });
    });
    segs.filter(function (s) { return s.span; }).forEach(function (a) {
      clusters.forEach(function (c) { if (c.l >= a.l - 6 && c.r <= a.r + 6) c.h = a.s + ' ' + c.h; });
    });
    var cols = clusters.map(function (c, i) {
      var left = i === 0 ? -1e9 : (clusters[i - 1].r + c.l) / 2;
      var right = i === clusters.length - 1 ? 1e9 : (c.r + clusters[i + 1].l) / 2;
      return { l: left, r: right, h: c.h, role: P.roleOf(c.h), c: (c.l + c.r) / 2 };
    });
    if (cols.length && !cols[0].role) cols[0].role = 'minggu';
    return cols;
  }

  function colAt(cols, x) { for (var i = 0; i < cols.length; i++) if (x >= cols[i].l && x < cols[i].r) return cols[i]; return null; }

  function pdfRows(lines, start, cols, headerBlock) {
    var weekCol = cols.find(function (c) { return c.role === 'minggu'; }) || cols[0];
    var headerSig = headerBlock.map(function (b) { return b.text; });
    var headerSegs = {};
    headerBlock.forEach(function (b) { b.segs.forEach(function (s) { headerSegs[s.s.toLowerCase()] = 1; }); });
    var meetings = [], cur = null, lastFrom = 0, seenFinal = false;
    for (var i = start; i < lines.length; i++) {
      var ln = lines[i];
      if (headerSig.indexOf(ln.text) >= 0) continue; // header berulang di halaman baru
      if (isNumberingLine(ln)) continue;
      var f = ln.segs[0];
      var wk = f && colAt(cols, f.x + Math.min(f.w, 20) / 2) === weekCol && !/^\(/.test(f.s) ? P.parseWeek(f.s) : null;
      if (!wk && ln.segs.length >= 2 && ln.segs.filter(function (s) { return headerSegs[s.s.toLowerCase()]; }).length >= Math.max(2, ln.segs.length - 1)) continue; // header tabel diulang di halaman lanjutan
      if (!wk && /^(rencana\s*evaluasi|rencana\s*penilaian|catatan|keterangan|daftar\s*(pustaka|referensi)|rubrik|instrumen|lampiran|bobot\s*penilaian|metode\s*evaluasi|komponen\s*(penilaian|evaluasi)|tabel\s|kisi|soal\b|portofolio|peta\s*cpl|penilaian\s*tugas|standar\b|no\.?\s+standar|disahkan|mengetahui|menyetujui|ditetapkan|dekan\b|ketua\s+(program|prodi|jurusan)|tanda\s*tangan|parepare\s*,)/i.test(ln.text)) break;
      if (meetings.length && i > start && lines[i - 1].page === ln.page && ln.y - lines[i - 1].y > 160) break;
      if (wk) {
        // nomor minggu mundur / melompat jauh = tabel lain (mis. rubrik penilaian) sudah dimulai
        if (wk.from < lastFrom || wk.from > 20 || (seenFinal && wk.from <= lastFrom)) break;
        if (cur && cur.minggu === wk.label) { /* baris lanjutan minggu yang sama */ }
        else { cur = newMeeting(wk); cur._cols = {}; meetings.push(cur); }
        lastFrom = wk.from;
        if (wk.to >= 16) seenFinal = true;
      }
      if (!cur) continue;
      ln.segs.forEach(function (s, si) {
        if (si === 0 && wk) return;
        var c = colAt(cols, s.x + Math.min(s.w, 24) / 2);
        if (!c || c === weekCol) return;
        var role = c.role || '';
        if (!role) return;
        cur._cols[role] = (cur._cols[role] ? cur._cols[role] + ' ' : '') + s.s;
      });
    }
    meetings.forEach(function (m) {
      Object.keys(m._cols).forEach(function (k) { if (k !== 'waktu') appendField(m, k, m._cols[k]); });
      delete m._cols;
    });
    return meetings;
  }

  function parsePdf(ext, rps) {
    var lines = pdfLines(ext);
    VOCAB = buildVocab(lines);
    pdfIdentity(lines, rps);
    rps.deskripsi = U.clean(pdfSection(lines, LBL.deskripsi).join(' '));
    rps.bahanKajian = mergeNumbered(pdfSection(lines, LBL.bahan)).slice(0, 30);
    var pusRaw = pdfSection(lines, LBL.pustaka);
    rps.pustaka = mergeNumbered(pusRaw).filter(function (s) { return s.length > 15; }).slice(0, 60);
    if (rps.pustaka.length <= 1) { var perLine = splitRefs(pusRaw); if (perLine.length > rps.pustaka.length) rps.pustaka = perLine.slice(0, 60); }
    var pageMap = {};
    (ext.pages || []).forEach(function (pg) { pageMap[pg.n] = pg; });
    var weekly = pdfWeekly(lines, pageMap);
    // CPL/CPMK didefinisikan sebelum tabel mingguan; kode di tabel/lampiran sesudahnya hanya rujukan
    pdfCapaian(weekly && weekly.header > 0 ? lines.slice(0, weekly.header) : lines, rps);
    if (weekly) { rps.pertemuan = weekly.meetings; rps.sumber = 'tabel'; }
    // kop dokumen (sering berulang di tiap halaman) tetap dipakai untuk fakultas/prodi
    var head = [];
    (ext.pages || []).slice(0, 2).forEach(function (pg) { pg.lines.slice(0, 40).forEach(function (l) { head.push(l.text); }); });
    findFakultasProdi(head.join('\n'), rps);
  }

  /* ================= cadangan dari bahan kajian ================= */
  function fromBahanKajian(rps) {
    var topics = rps.bahanKajian.filter(function (t) { return !/^(uts|uas|ujian|evaluasi tengah|evaluasi akhir)/i.test(t); });
    var weeks = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    var list = topics.map(function (t, i) {
      var m = newMeeting({ label: String(weeks[i] || (16 + i - weeks.length)) });
      m.materi = t; m.judul = P.cleanTitle(t);
      return m;
    });
    list.push(Object.assign(newMeeting({ label: '8' }), { jenis: 'uts' }));
    list.push(Object.assign(newMeeting({ label: '16' }), { jenis: 'uas' }));
    return list;
  }

  /* ================= API ================= */
  P.parse = function (ext) {
    var rps = P.emptyRps();
    try {
      if (ext.kind === 'pdf') parsePdf(ext, rps);
      else parseTables(ext, rps);
    } catch (e) {
      console.error(e);
      rps.warnings.push('Sebagian struktur RPS gagal dibaca otomatis: ' + e.message);
    }
    rps.sks = P.normSks(rps.sks);
    rps.semester = P.normSemester(rps.semester);
    rps.mataKuliah = U.titleCase(rps.mataKuliah.replace(/\s*\(.*?\)\s*$/, ''));
    rps.kode = rps.kode.replace(/[^\w.\-\/ ]/g, '').trim();
    if (/^[.…\s]*$/.test(rps.kode)) rps.kode = '';
    rps.pertemuan = finalizeMeetings(rps.pertemuan || [], rps);
    var materiCount = rps.pertemuan.filter(function (m) { return m.jenis === 'materi'; }).length;
    if (materiCount < 3 && rps.bahanKajian.length >= 3) {
      rps.pertemuan = finalizeMeetings(fromBahanKajian(rps), rps);
      rps.sumber = 'bahan-kajian';
      rps.warnings.push('Rencana mingguan pada RPS tidak terbaca lengkap; daftar pertemuan disusun dari Bahan Kajian/Materi Pembelajaran. Periksa nomor minggu dan judulnya.');
    }
    if (!rps.pertemuan.length) {
      rps.sumber = 'kosong';
      rps.warnings.push('Rencana pertemuan tidak ditemukan. Tambahkan pertemuan secara manual atau gunakan AI untuk membaca RPS.');
    }
    if (!rps.mataKuliah) rps.warnings.push('Nama mata kuliah tidak terbaca; isi pada bagian Identitas Modul.');
    return rps;
  };

  /* Normalisasi hasil ekstraksi AI ke bentuk rps */
  P.fromAi = function (d) {
    var rps = P.emptyRps();
    if (!d || typeof d !== 'object') return rps;
    rps.mataKuliah = U.titleCase(d.mata_kuliah || '');
    rps.kode = U.oneLine(d.kode || '');
    rps.sks = P.normSks(d.sks);
    rps.semester = P.normSemester(d.semester);
    rps.rumpun = U.oneLine(d.rumpun || '');
    rps.fakultas = U.oneLine(d.fakultas || '');
    rps.prodi = U.oneLine(d.prodi || '');
    rps.deskripsi = U.clean(d.deskripsi || '');
    rps.cpl = (d.cpl || []).map(U.oneLine).filter(Boolean);
    rps.cpmk = (d.cpmk || []).map(U.oneLine).filter(Boolean);
    rps.subCpmk = (d.sub_cpmk || []).map(U.oneLine).filter(Boolean);
    rps.bahanKajian = (d.bahan_kajian || []).map(U.oneLine).filter(Boolean);
    rps.pustaka = (d.pustaka || []).map(U.oneLine).filter(Boolean);
    rps.pertemuan = finalizeMeetings((d.pertemuan || []).map(function (p) {
      return {
        id: '', minggu: U.oneLine(p.minggu || ''), jenis: ['materi', 'uts', 'uas', 'orientasi'].indexOf(p.jenis) >= 0 ? p.jenis : '',
        judul: U.oneLine(p.judul || ''), subCpmk: p.sub_cpmk || '', indikator: p.indikator || '', kriteria: p.kriteria || '',
        metode: [p.metode, p.penugasan].filter(Boolean).join('\n'), materi: p.materi || '', pustaka: p.pustaka || '', bobot: p.bobot || ''
      };
    }), rps);
    rps.sumber = 'ai';
    return rps;
  };
})(window);
