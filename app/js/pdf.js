/* pdf.js — perender PDF (pdfmake 0.2, font standar Times) + penyesuaian halaman otomatis */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var PDF = (MRP.pdf = {});
  var CM = 28.3465, PAGE_W = 595.28, PAGE_H = 841.89;
  var NAVY = '#1B3A6B', GOLD = '#C9A227';

  /* Preset tipografi: dari paling longgar ke paling rapat. m = [kiri, atas, kanan, bawah] (cm) */
  PDF.PRESETS = [
    { fs: 12, lh: 1.5, after: 6, m: [3, 2.5, 2.5, 2.5], img: 0.86 },
    { fs: 12, lh: 1.4, after: 6, m: [3, 2.5, 2.5, 2.5], img: 0.85 },
    { fs: 12, lh: 1.3, after: 5, m: [3, 2.5, 2.5, 2.5], img: 0.84 },
    { fs: 12, lh: 1.2, after: 5, m: [2.75, 2.5, 2.25, 2.25], img: 0.82 },
    { fs: 12, lh: 1.15, after: 4, m: [2.5, 2.25, 2, 2], img: 0.8 },
    { fs: 11.5, lh: 1.15, after: 4, m: [2.5, 2.25, 2, 2], img: 0.78 },
    { fs: 11, lh: 1.15, after: 4, m: [2.5, 2, 2, 2], img: 0.76 },
    { fs: 11, lh: 1.05, after: 3, m: [2.25, 2, 2, 2], img: 0.74 },
    { fs: 10.5, lh: 1.0, after: 3, m: [2, 2, 2, 2], img: 0.72 }
  ];
  PDF.CHAPTER_BREAK_RATIO = 0.72; // bab baru pindah halaman bila judulnya jatuh di bawah 72% tinggi halaman
  // pdfmake mengukur baris Times = (ascender - descender) = 0,9 em, sedangkan Word memakai 1,149 em untuk
  // Times New Roman (spasi tunggal). Semua lineHeight dikalikan faktor ini agar tata letak PDF = Word.
  PDF.LH_FACTOR = 1.149 / 0.9;
  var LHF = PDF.LH_FACTOR;

  function san(s) { return U.toWinAnsi(s); }
  function runsNodes(runs) {
    return (runs || []).map(function (r) { return { text: san(r.text), bold: !!r.b, italics: !!r.i }; });
  }

  /* ---------- lebar teks (metrik AFM) untuk titik-titik daftar isi ---------- */
  var AFMW = null;
  function afm() {
    if (AFMW) return AFMW;
    AFMW = {};
    ['Times-Roman', 'Times-Bold'].forEach(function (name) {
      var txt = (g.__TIMES_AFM__ || {})['data/' + name + '.afm'] || '', map = {};
      txt.split('\n').forEach(function (line) {
        var m = line.match(/^C\s+(-?\d+)\s*;\s*WX\s+(\d+)/);
        if (m && +m[1] >= 32 && +m[1] < 127) map[+m[1]] = +m[2];
      });
      AFMW[name] = map;
    });
    return AFMW;
  }
  function textW(s, size, bold) {
    var map = afm()[bold ? 'Times-Bold' : 'Times-Roman'], w = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); w += map[c] || (c === 39 ? 180 : 520); }
    return (w / 1000) * size;
  }
  function wrapW(text, maxW, size, bold) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (textW(t, size, bold) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } });
    if (cur) lines.push(cur);
    return lines;
  }

  /* ---------- konversi blok ---------- */
  function Ctx(P, fast) {
    this.P = P; this.fast = fast;
    this.ml = P.m[0] * CM; this.mt = P.m[1] * CM; this.mr = P.m[2] * CM; this.mb = P.m[3] * CM;
    this.cw = PAGE_W - this.ml - this.mr; this.ch = PAGE_H - this.mt - this.mb;
  }

  function imageNode(ctx, img, width, maxH, align) {
    var w = width, h = (w * img.h) / img.w;
    if (maxH && h > maxH) { h = maxH; w = (h * img.w) / img.h; }
    if (ctx.fast) {
      var x = align === 'center' ? (ctx.cw - w) / 2 : 0;
      return { canvas: [{ type: 'rect', x: x, y: 0, w: w, h: h, lineWidth: 0.5, lineColor: '#cccccc' }] };
    }
    return { image: img.dataUrl, width: w, height: h, alignment: align || 'center' };
  }

  var GRID = {
    hLineWidth: function () { return 0.6; }, vLineWidth: function () { return 0.6; },
    hLineColor: function () { return '#7F8FA6'; }, vLineColor: function () { return '#7F8FA6'; },
    paddingLeft: function () { return 5; }, paddingRight: function () { return 5; },
    paddingTop: function () { return 2.5; }, paddingBottom: function () { return 2.5; },
    fillColor: function (i, node) { return node.table.headerRows && i < node.table.headerRows ? '#DCE6F2' : null; }
  };
  var BOX = {
    hLineWidth: function () { return 1; }, vLineWidth: function () { return 1; },
    hLineColor: function () { return NAVY; }, vLineColor: function () { return NAVY; },
    paddingLeft: function () { return 8; }, paddingRight: function () { return 8; },
    paddingTop: function () { return 5; }, paddingBottom: function () { return 3; },
    fillColor: function () { return '#F3F6FB'; }
  };
  var NOB = {
    hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
    paddingLeft: function () { return 0; }, paddingRight: function () { return 0; },
    paddingTop: function () { return 1.2; }, paddingBottom: function () { return 1.2; }
  };

  function tableNode(ctx, b, innerW) {
    var P = ctx.P, fs = b.small ? P.fs - 1.5 : P.fs - 0.5;
    var cols = b.header ? b.header.length : (b.rows[0] || []).length;
    if (!cols) return null;
    var avail = (innerW || ctx.cw) - cols * 10 - 1;
    var widths = b.widths && b.widths.length === cols ? b.widths.map(function (r) { return avail * r; }) : Array(cols).fill('*');
    var body = [];
    var cell = function (t, ci, head, bold) {
      return { text: san(t), bold: !!head || !!bold || (b.kv && ci === 0), fontSize: fs, lineHeight: 1.08 * LHF, alignment: head ? 'center' : (b.colAlign && b.colAlign[ci]) || 'left' };
    };
    if (b.header) body.push(b.header.map(function (h, ci) { return cell(h, ci, true); }));
    b.rows.forEach(function (r, ri) {
      var row = [];
      for (var ci = 0; ci < cols; ci++) row.push(cell(r[ci] == null ? '' : r[ci], ci, false, b.lastBold && ri === b.rows.length - 1));
      body.push(row);
    });
    var out = [];
    if (b.caption) out.push({ text: san(b.caption), style: 'caption', margin: [0, 2, 0, 3] });
    out.push({ table: { headerRows: b.header ? 1 : 0, widths: widths, body: body, dontBreakRows: true }, layout: GRID, margin: [0, 0, 0, P.after + 3] });
    return { stack: out };
  }

  function blockNodes(ctx, blocks, innerW) {
    var P = ctx.P, out = [];
    var cw = innerW || ctx.cw;
    var holdHeading = null;
    (blocks || []).forEach(function (b, idx) {
      // judul yang langsung diikuti kotak/tabel digabung (tak terpisah halaman) — tabel pdfmake bisa
      // "mulai" di dasar halaman sehingga aturan keep-with-next biasa tidak berlaku
      var next = blocks[idx + 1];
      if (/^h[234]$/.test(b.t) && next && (next.t === 'box' || next.t === 'table') && !(next.t === 'box' && next.blocks.length > 10) && !(next.t === 'table' && next.rows.length > 20)) {
        holdHeading = { text: san(b.text), style: b.t };
        return;
      }
      var before = out.length;
      emit(b);
      if (holdHeading) {
        var made = out.splice(before);
        out.push({ stack: [holdHeading].concat(made), unbreakable: true });
        holdHeading = null;
      }
    });
    return out;

    function emit(b) {
      switch (b.t) {
        case 'p':
          out.push({ text: runsNodes(b.runs), margin: [0, 0, 0, P.after], leadingIndent: b.indent ? 1.0 * CM : 0, alignment: b.align || 'justify', fontSize: b.small ? P.fs - 1 : undefined, headlineLevel: b.keepNext ? 5 : undefined });
          break;
        case 'quote':
          out.push({ text: runsNodes(b.runs), italics: true, margin: [CM * 0.8, 0, CM * 0.8, P.after] });
          break;
        case 'h2': out.push({ text: san(b.text), style: 'h2', headlineLevel: 2 }); break;
        case 'h3': out.push({ text: san(b.text), style: 'h3', headlineLevel: 3 }); break;
        case 'h4': out.push({ text: san(b.text), style: 'h4', headlineLevel: 4 }); break;
        case 'ul':
        case 'ol': {
          var items = b.items.map(function (it) { return { text: runsNodes(it), margin: [0, 0, 0, Math.max(1, P.after / 3)], alignment: 'justify' }; });
          var node = b.t === 'ul' ? { ul: items } : { ol: items, type: b.fmt === 'lowerLetter' ? 'lower-alpha' : 'decimal' };
          node.margin = [CM * 0.55, 0, 0, P.after];
          out.push(node);
          break;
        }
        case 'table': { var tn = tableNode(ctx, b, cw); if (tn) out.push(tn); break; }
        case 'figure': {
          var wd = cw * P.img;
          out.push({ stack: [imageNode(ctx, b.img, wd, ctx.ch * 0.25, 'center'), { text: san(b.caption), style: 'caption' }], unbreakable: true, margin: [0, 4, 0, P.after] });
          break;
        }
        case 'box': {
          var inner = cw - 20;
          var stack = [{ text: san(b.title), bold: true, color: NAVY, margin: [0, 0, 0, 3], alignment: 'left' }].concat(blockNodes(ctx, b.blocks, inner));
          out.push({ table: { widths: ['*'], body: [[{ stack: stack }]] }, layout: BOX, margin: [0, 2, 0, P.after + 4] });
          break;
        }
        case 'refs':
          b.items.forEach(function (r) { out.push({ text: san(r), margin: [CM * 0.75, 0, 0, Math.max(2, P.after - 2)], leadingIndent: -CM * 0.75, alignment: 'left' }); });
          break;
        case 'sign':
          out.push({ stack: b.lines.map(function (l) { return { text: san(l) || ' ', alignment: 'left' }; }), margin: [cw * 0.55, P.fs, 0, 0], unbreakable: true });
          break;
        case 'arab': {
          if (ctx.fast) { var est = MRP.diagram.renderArabic(b.text, cw, P.fs * 1.6); out.push(imageNode(ctx, est, cw, null, 'right')); }
          else { var im = MRP.diagram.renderArabic(b.text, cw, P.fs * 1.6); out.push(Object.assign(imageNode(ctx, im, cw, null, 'right'), { margin: [0, 2, 0, P.after] })); }
          break;
        }
        default: break;
      }
    }
  }

  function tocNode(ctx, doc, info) {
    var P = ctx.P, numW = 30, maxW = ctx.cw - numW - 8;
    var entries = doc.front.concat(doc.main).map(function (ch) { return { id: ch.id, text: san(ch.tocText || ch.title) }; });
    var body = entries.map(function (e) {
      var lines = wrapW(e.text, maxW - 30, P.fs, false);
      var last = lines.pop();
      var dotW = textW('.', P.fs, false);
      var n = Math.max(3, Math.floor((maxW - textW(last + ' ', P.fs, false)) / dotW) - 3);
      var stack = lines.map(function (l) { return { text: l, alignment: 'left' }; });
      stack.push({ text: last + ' ' + new Array(n + 1).join('.'), alignment: 'left', noWrap: true });
      var label = info.toc ? info.toc[e.id] || '' : '00';
      return [{ stack: stack }, { text: label, alignment: 'right' }];
    });
    return { table: { widths: [ctx.cw - numW, numW], body: body }, layout: NOB, margin: [0, 4, 0, 0] };
  }

  function coverNodes(ctx, doc) {
    var m = doc.meta, out = [];
    out.push({ text: 'MODUL PEMBELAJARAN', fontSize: 20, bold: true, color: NAVY, alignment: 'center', characterSpacing: 1.2, margin: [0, 34, 0, 6] });
    out.push({ text: 'MATA KULIAH', fontSize: 12, alignment: 'center', characterSpacing: 1, margin: [0, 0, 0, 6] });
    out.push({ text: san(m.mk.toUpperCase()), fontSize: 22, bold: true, alignment: 'center', lineHeight: 1.0 * LHF, margin: [0, 0, 0, 10] });
    var meta = [];
    if (m.kode) meta.push('Kode MK: ' + m.kode);
    if (m.sks) meta.push(m.sks + ' SKS');
    if (m.semester) meta.push('Semester ' + m.semester);
    if (meta.length) out.push({ text: san(meta.join('   |   ')), fontSize: 12, alignment: 'center' });
    if (doc.cover.logo) {
      var lw = 140, lh = (lw * doc.cover.logo.h) / doc.cover.logo.w;
      if (lh > 190) { lh = 190; lw = (lh * doc.cover.logo.w) / doc.cover.logo.h; }
      out.push(Object.assign(imageNode(ctx, doc.cover.logo, lw, lh, 'center'), { margin: [0, 44, 0, 40] }));
    }
    if (doc.cover.showDosen && m.dosen) {
      out.push({ text: 'Disusun oleh:', fontSize: 12, alignment: 'center' });
      out.push({ text: san(m.dosen), fontSize: 14, bold: true, alignment: 'center', margin: [0, 4, 0, 0] });
    }
    var bottom = [];
    if (m.prodi) bottom.push(m.prodi.toUpperCase());
    if (m.fakultas) bottom.push(m.fakultas.toUpperCase());
    bottom.push(m.institusi.toUpperCase());
    bottom.push(/\//.test(m.tahun) ? 'TAHUN AKADEMIK ' + m.tahun : m.tahun);
    out.push({
      stack: bottom.map(function (t, i) { return { text: san(t), fontSize: i === bottom.length - 1 ? 12 : 13, bold: i < bottom.length - 1, alignment: 'center', lineHeight: 1.0 * LHF, margin: [0, i === bottom.length - 1 ? 4 : 0, 0, 0] }; }),
      absolutePosition: { x: ctx.ml, y: PAGE_H - ctx.mb - 18 - bottom.length * 17 }
    });
    return out;
  }

  /* Catatan pdfmake 0.2: pageBreakBefore TIDAK dipanggil untuk node ber-pageBreak,
     sehingga id penanda bab diletakkan pada node teks anak (tanpa pageBreak). */
  function build(doc, P, info, fast) {
    var ctx = new Ctx(P, fast);
    var content = coverNodes(ctx, doc);
    var newPageAll = !!(doc.options && doc.options.chapterNewPage);
    doc.front.forEach(function (ch) {
      content.push({ stack: [{ text: san(ch.title), style: 'chapTitle', id: 'ch-' + ch.id }], pageBreak: 'before', margin: [0, 0, 0, P.fs * 1.3] });
      if (ch.toc) content.push(tocNode(ctx, doc, info));
      else blockNodes(ctx, ch.blocks).forEach(function (n) { content.push(n); });
    });
    doc.main.forEach(function (ch, i) {
      var forced = newPageAll || !ch.label || i === 0; // Pendahuluan, Penutup, Daftar Pustaka selalu di halaman baru
      var head = [];
      if (!forced) head.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.cw, y2: 0, lineWidth: 1.4, lineColor: NAVY }], margin: [0, 0, 0, 6] });
      if (ch.label) head.push({ text: san(ch.label), style: 'chapLabel' });
      head.push({ text: san(ch.title.toUpperCase()), style: 'chapTitle' });
      var node = { stack: head, margin: [0, forced ? 0 : P.fs * 1.2, 0, P.fs * 1.2], unbreakable: true };
      if (forced) {
        node.pageBreak = 'before';
        head[0].id = 'ch-' + ch.id; // node anak dilaporkan ke pageBreakBefore
        (info.forced = info.forced || {})['ch-' + ch.id] = true;
      } else {
        node.id = 'ch-' + ch.id; // seluruh blok judul (garis + label + judul) dipindah bersama
        node.headlineLevel = 1;
      }
      content.push(node);
      blockNodes(ctx, ch.blocks).forEach(function (n) { content.push(n); });
    });
    info.pos = {}; info.breaks = {}; info.vr = {};
    return {
      pageSize: 'A4',
      pageMargins: [ctx.ml, ctx.mt, ctx.mr, ctx.mb],
      info: { title: san(doc.meta.title), author: san(doc.meta.dosen || doc.meta.institusi), subject: san('Modul Pembelajaran ' + doc.meta.mk + ' - ' + doc.meta.prodi), creator: 'Aplikasi Modul RPS IAIN Parepare', producer: 'pdfmake' },
      defaultStyle: { font: 'Times', fontSize: P.fs, lineHeight: P.lh * LHF, alignment: 'justify' },
      styles: {
        chapLabel: { fontSize: P.fs + 1, bold: true, alignment: 'center', color: NAVY, margin: [0, 0, 0, 2] },
        chapTitle: { fontSize: P.fs + 2, bold: true, alignment: 'center', lineHeight: 1.15 * LHF },
        h2: { fontSize: P.fs, bold: true, alignment: 'left', margin: [0, P.fs * 0.55, 0, P.fs * 0.25] },
        h3: { fontSize: P.fs, bold: true, alignment: 'left', margin: [0, P.fs * 0.35, 0, P.fs * 0.2] },
        h4: { fontSize: P.fs, bold: true, italics: true, alignment: 'left', margin: [0, P.fs * 0.25, 0, P.fs * 0.15] },
        caption: { fontSize: P.fs - 1.5, alignment: 'center', lineHeight: 1.1 * LHF, margin: [0, 3, 0, 2] }
      },
      content: content,
      background: function (cur, size) {
        if (cur !== 1) return null;
        return { canvas: [
          { type: 'rect', x: 26, y: 26, w: size.width - 52, h: size.height - 52, lineWidth: 2.6, lineColor: NAVY },
          { type: 'rect', x: 32, y: 32, w: size.width - 64, h: size.height - 64, lineWidth: 0.9, lineColor: GOLD }
        ] };
      },
      header: function (cur) {
        if (!info.mainStart || cur < info.mainStart) return null;
        return {
          margin: [ctx.ml, Math.max(14, ctx.mt * 0.45), ctx.mr, 0],
          stack: [
            { columns: [{ text: san(doc.meta.institusi.replace(/INSTITUT AGAMA ISLAM NEGERI \(IAIN\)/i, 'IAIN')), fontSize: P.fs - 3, color: '#555555', alignment: 'left' }, { text: san(doc.meta.headerText), fontSize: P.fs - 3, italics: true, color: '#333333', alignment: 'right' }] },
            { canvas: [{ type: 'line', x1: 0, y1: 3, x2: ctx.cw, y2: 3, lineWidth: 0.6, lineColor: NAVY }] }
          ]
        };
      },
      footer: function (cur, total) {
        info.totalPages = total;
        if (cur === 1) return null;
        var label = info.mainStart && cur >= info.mainStart ? String(cur - info.mainStart + 1) : U.roman(cur - 1);
        return { text: label, alignment: 'center', fontSize: P.fs - 1, margin: [0, Math.max(10, ctx.mb * 0.35), 0, 0] };
      },
      pageBreakBefore: function (node, following, nextPage) {
        var sp = node.startPosition;
        var brk = false;
        if (node.headlineLevel === 1 && node.id && sp && !(info.forced && info.forced[node.id])) {
          // bab mengalir: pindah halaman bila judul jatuh terlalu bawah
          brk = sp.verticalRatio > PDF.CHAPTER_BREAK_RATIO && following.length > 0;
        } else if (node.headlineLevel >= 2) {
          // judul subbagian jangan tertinggal sendirian di dasar halaman
          brk = following.length === 0 && nextPage.length > 0;
        }
        if (node.id && sp) {
          info.pos[node.id] = brk ? sp.pageNumber + 1 : sp.pageNumber;
          info.vr[node.id] = brk ? 0 : sp.verticalRatio;
          if (brk) info.breaks[node.id] = true;
        }
        return brk;
      }
    };
  }

  function pass(pdfMake, doc, P, info, fast) {
    var dd = build(doc, P, info, fast);
    return new Promise(function (resolve, reject) {
      try { pdfMake.createPdf(dd).getBlob(function (blob) { resolve(blob); }); } catch (e) { reject(e); }
    });
  }

  function tocLabels(doc, info) {
    var pos = info.pos || {};
    var mainStart = pos['ch-' + doc.main[0].id];
    var toc = {}, newPage = {};
    doc.front.forEach(function (ch) { var p = pos['ch-' + ch.id]; if (p) toc[ch.id] = U.roman(p - 1); });
    doc.main.forEach(function (ch) {
      var k = 'ch-' + ch.id, p = pos[k];
      if (p) toc[ch.id] = String(p - mainStart + 1);
      newPage[ch.id] = !!((info.forced && info.forced[k]) || (info.breaks && info.breaks[k]));
    });
    return { mainStart: mainStart, toc: toc, newPage: newPage };
  }

  /* render(doc, {targetPages, min, max, onStatus, presetIndex}) */
  PDF.render = function (doc, opts) {
    opts = opts || {};
    var target = opts.targetPages || 30, max = opts.max || 35, min = opts.min || 25;
    var status = opts.onStatus || function () {};
    doc.options = doc.options || {};
    var userNewPage = !!doc.options.chapterNewPage;
    var pdfMake, counts = {};
    function count(i) {
      if (counts[i] != null) return Promise.resolve(counts[i]);
      status('Mengukur tata letak (varian ' + (i + 1) + (doc.options.chapterNewPage ? ', bab di halaman baru' : '') + ')…');
      var info = {};
      return pass(pdfMake, doc, PDF.PRESETS[i], info, true).then(function () { counts[i] = info.totalPages; return counts[i]; });
    }
    // cari preset paling longgar yang jumlah halamannya <= target, lalu pilih yang paling dekat ke target
    function search() {
      var lo = 0, hi = PDF.PRESETS.length - 1;
      return count(lo).then(function (c0) {
        if (c0 <= target) return lo;
        return count(hi).then(function (ch) {
          if (ch > target) return hi;
          function step() {
            if (hi - lo <= 1) return counts[lo] <= max && counts[lo] - target < target - counts[hi] ? lo : hi;
            var mid = (lo + hi) >> 1;
            return count(mid).then(function (cm) { if (cm <= target) hi = mid; else lo = mid; return step(); });
          }
          return step();
        });
      });
    }
    return U.libs.pdfmake().then(function (pm) {
      pdfMake = pm;
      if (opts.presetIndex != null) return opts.presetIndex;
      return search().then(function (best) {
        // isi terlalu sedikit: coba setiap pertemuan dimulai di halaman baru (tanpa menambah isi semu)
        if (counts[best] >= min || userNewPage) return best;
        var first = { best: best, pages: counts[best], counts: counts };
        doc.options.chapterNewPage = true; counts = {};
        return search().then(function (best2) {
          var p2 = counts[best2];
          var better = p2 <= max && Math.abs(p2 - target) < Math.abs(first.pages - target);
          if (better) return best2;
          doc.options.chapterNewPage = false; counts = first.counts;
          return first.best;
        });
      });
    }).then(function (best) {
      var P = PDF.PRESETS[best];
      var info1 = {};
      status('Menghitung nomor halaman daftar isi…');
      return pass(pdfMake, doc, P, info1, true).then(function () {
        var t = tocLabels(doc, info1);
        var info2 = { toc: t.toc, mainStart: t.mainStart };
        status('Membuat berkas PDF…');
        return pass(pdfMake, doc, P, info2, false).then(function (blob) {
          var t2 = tocLabels(doc, info2);
          var same = Object.keys(t.toc).every(function (k) { return t.toc[k] === t2.toc[k]; });
          if (!same) console.warn('Nomor halaman daftar isi bergeser antara lintasan ukur dan lintasan akhir', t.toc, t2.toc);
          return { blob: blob, pages: info2.totalPages || info1.totalPages, preset: P, presetIndex: best, toc: t2.toc, newPage: t2.newPage, mainStart: t2.mainStart, frontPages: t2.mainStart - 1, counts: counts, tocStable: same, chapterNewPage: !!doc.options.chapterNewPage };
        });
      });
    });
  };
})(window);
