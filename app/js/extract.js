/* extract.js — membaca berkas RPS (PDF, DOCX, DOC) menjadi struktur teks */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var X = (MRP.extract = {});

  function magic(buf) {
    var b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
    return '';
  }

  X.readFile = function (file, onStatus) {
    var name = file.name || 'rps';
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('Ukuran berkas melebihi 30 MB.'));
    return U.readAsArrayBuffer(file).then(function (buf) {
      var m = magic(buf);
      var p;
      if (m === 'pdf') p = readPdf(buf, onStatus);
      else if (m === 'zip') p = readDocx(buf, onStatus);
      else if (m === 'ole') p = readDoc(buf, onStatus);
      else if (ext === 'pdf') p = readPdf(buf, onStatus);
      else if (ext === 'docx') p = readDocx(buf, onStatus);
      else return Promise.reject(new Error('Format berkas tidak dikenali. Gunakan PDF atau Microsoft Word (.docx/.doc).'));
      return p.then(function (r) { r.name = name; r.size = file.size; return r; });
    });
  };

  /* ================= PDF ================= */
  function readPdf(buf, onStatus) {
    onStatus && onStatus('Memuat pembaca PDF…');
    var base64 = buf.byteLength <= 24 * 1024 * 1024 ? U.arrayBufferToBase64(buf) : '';
    var lib = null;
    return U.libs.pdfjs().then(function (pdfjsLib) {
      lib = pdfjsLib;
      return pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    }).then(function (doc) {
      var pages = [];
      var seq = Promise.resolve();
      for (var p = 1; p <= doc.numPages; p++) {
        (function (pn) {
          seq = seq.then(function () {
            onStatus && onStatus('Membaca halaman ' + pn + ' dari ' + doc.numPages + '…');
            return doc.getPage(pn).then(function (page) {
              var vp = page.getViewport({ scale: 1 });
              return page.getTextContent().then(function (tc) {
                var items = [];
                tc.items.forEach(function (it) {
                  if (!it || typeof it.str !== 'string') return;
                  // karakter kendali (tanda centang/butir dari font simbol sering terbaca U+0000) dibuang;
                  // butir font Symbol/Wingdings di area Private Use diganti tanda butir biasa
                  var s = it.str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
                    .replace(/[]/g, '•').replace(/[]/g, '✓')
                    .replace(/[-]/g, '').replace(/\s+/g, ' ');
                  if (!s.trim()) return;
                  var pt = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
                  var h = Math.abs(it.height || it.transform[3] || 10);
                  items.push({ s: s, x: pt[0], y: pt[1], w: Math.abs(it.width || s.length * h * 0.5), h: h, bold: /bold|black|heavy/i.test(it.fontName || '') });
                });
                var pageData = { n: pn, width: vp.width, height: vp.height, lines: groupLines(items), rules: { v: [], h: [] } };
                // garis tabel (vektor) -> batas kolom/baris yang pasti untuk tabel RPS
                return page.getOperatorList().then(function (ol) {
                  try { pageData.rules = extractRules(ol, lib.OPS, vp); } catch (e) { console.warn('garis tabel', e); }
                }).catch(function () { /* tanpa garis tabel */ }).then(function () {
                  pages.push(pageData);
                  page.cleanup && page.cleanup();
                });
              });
            });
          });
        })(p);
      }
      return seq.then(function () {
        markRunning(pages);
        var chars = 0;
        pages.forEach(function (pg) { pg.lines.forEach(function (l) { chars += l.text.length; }); });
        var res = { kind: 'pdf', pages: pages, numPages: doc.numPages, pdfBase64: base64, warnings: [], blocks: null };
        res.isScanned = chars < Math.max(150, 40 * doc.numPages);
        if (res.isScanned) res.warnings.push('PDF ini tampaknya hasil pindaian (gambar) sehingga teksnya tidak dapat dibaca langsung. Gunakan mode AI Claude (membaca gambar PDF) atau unggah versi .docx.');
        res.text = pdfText(pages);
        doc.destroy && doc.destroy();
        return res;
      });
    });
  }

  function median(arr) { if (!arr.length) return 0; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

  /* Mengambil garis tabel dari operator list pdf.js 3.x: persegi tipis yang diisi, garis yang di-stroke,
     dan tepi persegi yang di-stroke. Hasil dalam koordinat viewport (y ke bawah). */
  function mulM(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function applyM(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function extractRules(ol, OPS, vp) {
    var ctm = [1, 0, 0, 1, 0, 0], stack = [], pending = [], v = [], h = [];
    var strokeOps = {}, fillOps = {};
    [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].forEach(function (o) { if (o != null) strokeOps[o] = 1; });
    [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].forEach(function (o) { if (o != null) fillOps[o] = 1; });
    function toVp(px, py) { return vp.convertToViewportPoint(px, py); }
    function addSeg(a, b) {
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      if (x1 - x0 <= 2.5 && y1 - y0 >= 6) v.push({ x: (x0 + x1) / 2, y0: y0, y1: y1 });
      else if (y1 - y0 <= 2.5 && x1 - x0 >= 6) h.push({ y: (y0 + y1) / 2, x0: x0, x1: x1 });
    }
    var fa = ol.fnArray, aa = ol.argsArray;
    for (var i = 0; i < fa.length; i++) {
      var fn = fa[i], args = aa[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mulM(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (args && args[0] && args[0].length === 6) ctm = mulM(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.constructPath) {
        var ops = args[0], co = args[1], ci = 0, cur = null;
        for (var k = 0; k < ops.length; k++) {
          var op = ops[k];
          if (op === OPS.rectangle) {
            var x = co[ci], y = co[ci + 1], w = co[ci + 2], hh = co[ci + 3]; ci += 4;
            pending.push({ rect: true, a: toVp.apply(null, applyM(ctm, x, y)), b: toVp.apply(null, applyM(ctm, x + w, y + hh)) });
          } else if (op === OPS.moveTo) { cur = applyM(ctm, co[ci], co[ci + 1]); ci += 2; }
          else if (op === OPS.lineTo) {
            var p2 = applyM(ctm, co[ci], co[ci + 1]); ci += 2;
            if (cur) pending.push({ rect: false, a: toVp(cur[0], cur[1]), b: toVp(p2[0], p2[1]) });
            cur = p2;
          } else if (op === OPS.curveTo) ci += 6;
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) ci += 4;
        }
      } else if (strokeOps[fn] || fillOps[fn]) {
        var stroked = !!strokeOps[fn];
        pending.forEach(function (pt) {
          if (!pt.rect) { addSeg(pt.a, pt.b); return; }
          var x0 = Math.min(pt.a[0], pt.b[0]), x1 = Math.max(pt.a[0], pt.b[0]), y0 = Math.min(pt.a[1], pt.b[1]), y1 = Math.max(pt.a[1], pt.b[1]);
          if (x1 - x0 <= 2.5 || y1 - y0 <= 2.5) addSeg([x0, y0], [x1, y1]); // persegi tipis = garis
          else if (stroked) { addSeg([x0, y0], [x0, y1]); addSeg([x1, y0], [x1, y1]); addSeg([x0, y0], [x1, y0]); addSeg([x0, y1], [x1, y1]); }
        });
        pending = [];
      } else if (fn === OPS.endPath) pending = [];
    }
    return { v: mergeSegs(v, 'x', 'y0', 'y1'), h: mergeSegs(h, 'y', 'x0', 'x1') };
  }
  function mergeSegs(list, k, a, b) {
    list.sort(function (p, q) { return p[k] - q[k] || p[a] - q[a]; });
    var res = [];
    list.forEach(function (s) {
      var last = res[res.length - 1];
      if (last && Math.abs(last[k] - s[k]) <= 1.2 && s[a] <= last[b] + 2.5) last[b] = Math.max(last[b], s[b]);
      else { var o = {}; o[k] = s[k]; o[a] = s[a]; o[b] = s[b]; res.push(o); }
    });
    return res;
  }

  function groupLines(items) {
    items.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var mh = median(items.map(function (i) { return i.h; })) || 10;
    var tol = Math.max(2, mh * 0.45);
    var lines = [];
    items.forEach(function (it) {
      var last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      // gabungkan potongan yang bersambung menjadi segmen
      var segs = [];
      l.items.forEach(function (it) {
        var s = segs[segs.length - 1];
        var gap = s ? it.x - (s.x + s.w) : 999;
        // celah > ~0,8 pt = batas kata (potongan satu kata dari pdf.js berjarak < 0,6 pt)
        var sp = Math.max(0.8, it.h * 0.08);
        if (s && gap < Math.max(10, it.h * 1.1)) {
          s.s += (gap > sp && !/\s$/.test(s.s) && !/^\s/.test(it.s) ? ' ' : '') + it.s;
          s.w = it.x + it.w - s.x;
          s.bold = s.bold && it.bold;
        } else segs.push({ s: it.s, x: it.x, w: it.w, h: it.h, bold: it.bold });
      });
      segs.forEach(function (s) { s.s = s.s.replace(/\s+/g, ' ').trim(); });
      l.segs = segs.filter(function (s) { return s.s; });
      l.text = l.segs.map(function (s) { return s.s; }).join('  ');
      l.x = l.segs.length ? l.segs[0].x : 0;
    });
    return lines.filter(function (l) { return l.segs.length; });
  }

  /* Header/footer berulang dan nomor halaman ditandai `running` agar tidak ikut diurai.
     Angka tunggal di tepi halaman hanya dianggap nomor halaman bila berada di luar tabel dan
     selisihnya dengan nomor halaman PDF tetap di beberapa halaman (nomor minggu di baris
     pertama tabel tidak boleh terbuang). */
  function markRunning(pages) {
    if (pages.length < 3) return;
    var counts = {};
    var norm = function (t) { return t.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase(); };
    var PAGENUM = /^((halaman|hal\.?|page)\s*)?#(\s*(dari|\/|of)\s*#)?$/;
    var edge = function (pg, l) { return !(l.y > pg.height * 0.16 && l.y < pg.height * 0.88); };
    var inTable = function (pg, l) {
      var vs = (pg.rules && pg.rules.v) || [], y = l.y - 4;
      var x0 = l.x, x1 = l.segs.length ? l.segs[l.segs.length - 1].x + l.segs[l.segs.length - 1].w : l.x;
      var span = function (v) { return v.y0 - 3 <= y && v.y1 + 3 >= y; };
      return vs.some(function (v) { return v.x < x0 && span(v); }) && vs.some(function (v) { return v.x > x1 && span(v); });
    };
    pages.forEach(function (pg) {
      var seen = {};
      pg.lines.forEach(function (l) {
        if (!edge(pg, l)) return;
        var k = norm(l.text); if (PAGENUM.test(k) || seen[k]) return; seen[k] = 1;
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    var groups = {}, cands = [];
    pages.forEach(function (pg) {
      pg.lines.forEach(function (l) {
        if (!edge(pg, l)) return;
        var k = norm(l.text);
        if (!PAGENUM.test(k)) { if (counts[k] >= Math.max(3, pages.length * 0.6)) l.running = true; return; }
        if (inTable(pg, l)) return;
        var v = parseInt((l.text.match(/\d+/) || ['0'])[0], 10);
        var key = (v - pg.n) + (l.y < pg.height / 2 ? 't' : 'b');
        (groups[key] = groups[key] || []).push(l.x);
        cands.push({ l: l, key: key, word: /[a-z]/i.test(l.text) });
      });
    });
    var need = Math.max(2, Math.min(3, Math.ceil(pages.length * 0.3)));
    cands.forEach(function (c) {
      var xs = groups[c.key];
      if (c.word || (xs.length >= need && Math.max.apply(null, xs) - Math.min.apply(null, xs) <= 60)) c.l.running = true;
    });
  }

  function pdfText(pages) {
    var out = [];
    pages.forEach(function (pg) {
      out.push('--- Halaman ' + pg.n + ' ---');
      pg.lines.forEach(function (l) {
        if (l.running) return;
        out.push(l.segs.map(function (s) { return s.s; }).join(' | '));
      });
    });
    return out.join('\n');
  }

  /* ================= DOCX (mammoth) ================= */
  function readDocx(buf, onStatus) {
    onStatus && onStatus('Memuat pembaca Word…');
    return U.libs.mammoth().then(function (mammoth) {
      onStatus && onStatus('Membaca dokumen Word…');
      return mammoth.convertToHtml({ arrayBuffer: buf }, { includeDefaultStyleMap: true, ignoreEmptyParagraphs: false });
    }).then(function (r) {
      var dom = new DOMParser().parseFromString('<!doctype html><html><body>' + r.value + '</body></html>', 'text/html');
      var blocks = [];
      walkBlocks(dom.body, blocks);
      var res = { kind: 'docx', blocks: blocks, warnings: [], pages: null };
      res.text = blocksText(blocks);
      if (res.text.replace(/\s/g, '').length < 100) res.warnings.push('Dokumen Word hampir tidak berisi teks yang dapat dibaca.');
      return res;
    });
  }

  function nodeText(node) {
    var parts = [];
    (function walk(n) {
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) { parts.push(c.nodeValue); return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName.toLowerCase();
        if (tag === 'br') { parts.push('\n'); return; }
        if (tag === 'table') {
          parts.push('\n');
          Array.prototype.forEach.call(c.rows, function (tr) {
            parts.push(Array.prototype.map.call(tr.cells, function (td) { return U.oneLine(nodeText(td)); }).join(' | ') + '\n');
          });
          return;
        }
        var block = /^(p|div|li|h[1-6]|tr|ul|ol)$/.test(tag);
        if (block) parts.push('\n');
        if (tag === 'li') parts.push('- ');
        walk(c);
        if (block) parts.push('\n');
      });
    })(node);
    return U.clean(parts.join(''));
  }

  function tableGrid(tbl) {
    var grid = [];
    Array.prototype.forEach.call(tbl.rows, function (tr, r) {
      grid[r] = grid[r] || [];
      var c = 0;
      Array.prototype.forEach.call(tr.cells, function (td) {
        while (grid[r][c]) c++;
        var rs = Math.max(1, parseInt(td.getAttribute('rowspan') || '1', 10) || 1);
        var cs = Math.max(1, parseInt(td.getAttribute('colspan') || '1', 10) || 1);
        var text = nodeText(td);
        for (var i = 0; i < rs; i++) {
          for (var j = 0; j < cs; j++) {
            grid[r + i] = grid[r + i] || [];
            grid[r + i][c + j] = { t: i === 0 && j === 0 ? text : '', v: text, o: i === 0 && j === 0, cs: cs, rs: rs, vm: i > 0, hm: j > 0 };
          }
        }
        c += cs;
      });
    });
    var w = 0; grid.forEach(function (row) { w = Math.max(w, row.length); });
    return grid.map(function (row) {
      var out = [];
      for (var i = 0; i < w; i++) out.push(row[i] || { t: '', v: '', o: true, cs: 1, rs: 1 });
      return out;
    });
  }

  function walkBlocks(root, blocks) {
    Array.prototype.forEach.call(root.children, function (el) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'table') { blocks.push({ type: 'table', rows: tableGrid(el) }); return; }
      if (tag === 'ul' || tag === 'ol') {
        Array.prototype.forEach.call(el.children, function (li) { var t = nodeText(li); if (t) blocks.push({ type: 'p', text: t, list: true }); });
        return;
      }
      if (/^(p|h[1-6])$/.test(tag)) { blocks.push({ type: 'p', text: nodeText(el), heading: tag[0] === 'h' }); return; }
      if (el.children.length) walkBlocks(el, blocks);
      else { var t = U.clean(el.textContent); if (t) blocks.push({ type: 'p', text: t }); }
    });
  }

  function blocksText(blocks) {
    var out = [], tn = 0;
    blocks.forEach(function (b) {
      if (b.type === 'p') { if (b.text) out.push(b.text); return; }
      tn++;
      out.push('[TABEL ' + tn + ']');
      b.rows.forEach(function (row) {
        var cells = [];
        row.forEach(function (c) { if (c.o) cells.push(U.oneLine(c.t).replace(/\|/g, '/')); });
        if (cells.join('').trim()) out.push('| ' + cells.join(' | ') + ' |');
      });
      out.push('[/TABEL ' + tn + ']');
    });
    return out.join('\n');
  }

  /* ================= DOC (Word 97-2003, terbatas) ================= */
  function readDoc(buf) {
    try {
      var text = docText(buf);
      var lines = text.split('\n').map(function (l) { return U.oneLine(l); }).filter(Boolean);
      var blocks = lines.map(function (l) { return { type: 'p', text: l, docRow: /\s\|\s/.test(l) }; });
      return Promise.resolve({ kind: 'doc', blocks: blocks, text: lines.join('\n'), warnings: ['Format .doc lama dibaca secara terbatas (struktur tabel tidak sempurna). Untuk hasil terbaik simpan ulang sebagai .docx atau gunakan AI.'] });
    } catch (e) {
      return Promise.reject(new Error('Berkas .doc tidak dapat dibaca (' + e.message + '). Simpan ulang sebagai .docx lalu unggah kembali.'));
    }
  }

  function docText(buf) {
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);
    var secShift = dv.getUint16(0x1e, true), miniShift = dv.getUint16(0x20, true);
    var secSize = 1 << secShift, miniSize = 1 << miniShift;
    var nFat = dv.getUint32(0x2c, true), dirStart = dv.getUint32(0x30, true);
    var miniCutoff = dv.getUint32(0x38, true), miniFatStart = dv.getUint32(0x3c, true);
    var difatStart = dv.getUint32(0x44, true);
    var secOff = function (s) { return (s + 1) * secSize; };
    var fatSecs = [];
    for (var i = 0; i < 109 && fatSecs.length < nFat; i++) { var s0 = dv.getUint32(0x4c + i * 4, true); if (s0 < 0xfffffffa) fatSecs.push(s0); }
    var ds = difatStart, guard = 0;
    while (ds < 0xfffffffa && fatSecs.length < nFat && guard++ < 10000) {
      for (var k = 0; k < secSize / 4 - 1 && fatSecs.length < nFat; k++) { var sv = dv.getUint32(secOff(ds) + k * 4, true); if (sv < 0xfffffffa) fatSecs.push(sv); }
      ds = dv.getUint32(secOff(ds) + secSize - 4, true);
    }
    var fat = [];
    fatSecs.forEach(function (fs) { for (var j = 0; j < secSize / 4; j++) fat.push(dv.getUint32(secOff(fs) + j * 4, true)); });
    function chain(start, table) { var out = [], s = start, n = 0; while (s < 0xfffffffa && n++ < 1e6) { out.push(s); s = table[s]; } return out; }
    function readChain(start, size) {
      var secs = chain(start, fat), out = new Uint8Array(secs.length * secSize);
      secs.forEach(function (s, idx) { out.set(u8.subarray(secOff(s), secOff(s) + secSize), idx * secSize); });
      return size != null ? out.subarray(0, size) : out;
    }
    var dir = readChain(dirStart);
    var entries = [];
    for (var off = 0; off + 128 <= dir.length; off += 128) {
      var nl = dir[off + 0x40] | (dir[off + 0x41] << 8);
      var name = '';
      for (var c = 0; c < Math.max(0, nl - 2); c += 2) name += String.fromCharCode(dir[off + c] | (dir[off + c + 1] << 8));
      var dvd = new DataView(dir.buffer, dir.byteOffset + off, 128);
      entries.push({ name: name, type: dir[off + 0x42], start: dvd.getUint32(0x74, true), size: dvd.getUint32(0x78, true) });
    }
    var root = entries[0];
    var miniStream = root ? readChain(root.start, root.size) : new Uint8Array(0);
    var miniFat = [];
    if (miniFatStart < 0xfffffffa) {
      var mf = readChain(miniFatStart);
      var mdv = new DataView(mf.buffer, mf.byteOffset, mf.length);
      for (var q = 0; q + 4 <= mf.length; q += 4) miniFat.push(mdv.getUint32(q, true));
    }
    function stream(nm) {
      var e = entries.find(function (x) { return x.name === nm && x.type === 2; });
      if (!e) return null;
      if (e.size < miniCutoff) {
        var secs = chain(e.start, miniFat), out = new Uint8Array(secs.length * miniSize);
        secs.forEach(function (s, idx) { out.set(miniStream.subarray(s * miniSize, s * miniSize + miniSize), idx * miniSize); });
        return out.subarray(0, e.size);
      }
      return readChain(e.start, e.size);
    }
    var wd = stream('WordDocument');
    if (!wd) throw new Error('stream WordDocument tidak ditemukan');
    var wdv = new DataView(wd.buffer, wd.byteOffset, wd.length);
    if (wdv.getUint16(0, true) !== 0xa5ec) throw new Error('bukan dokumen Word 97-2003');
    var flags = wdv.getUint16(0x0a, true);
    if (flags & 0x0100) throw new Error('dokumen terenkripsi');
    var tbl = stream(flags & 0x0200 ? '1Table' : '0Table');
    if (!tbl) throw new Error('stream tabel tidak ditemukan');
    var csw = wdv.getUint16(32, true);
    var lwOff = 32 + 2 + csw * 2;
    var cslw = wdv.getUint16(lwOff, true);
    var ccpText = wdv.getInt32(lwOff + 2 + 3 * 4, true);
    var fcBase = lwOff + 2 + cslw * 4 + 2;
    var fcClx = wdv.getUint32(fcBase + 33 * 8, true), lcbClx = wdv.getUint32(fcBase + 33 * 8 + 4, true);
    var tdv = new DataView(tbl.buffer, tbl.byteOffset, tbl.length);
    var pos = fcClx, end = fcClx + lcbClx;
    while (pos < end && tbl[pos] === 0x01) pos += 3 + tdv.getInt16(pos + 1, true);
    if (tbl[pos] !== 0x02) throw new Error('tabel potongan teks tidak ditemukan');
    var lcb = tdv.getUint32(pos + 1, true), plc = pos + 5;
    var n = Math.floor((lcb - 4) / 12);
    var text = '';
    for (var p = 0; p < n; p++) {
      var cpS = tdv.getUint32(plc + p * 4, true), cpE = tdv.getUint32(plc + (p + 1) * 4, true);
      if (cpS >= ccpText) break;
      cpE = Math.min(cpE, ccpText);
      var pcd = plc + (n + 1) * 4 + p * 8;
      var fcv = tdv.getUint32(pcd + 2, true);
      var compressed = (fcv & 0x40000000) !== 0, fc = fcv & 0x3fffffff;
      var len = cpE - cpS;
      if (compressed) {
        var st = fc / 2;
        for (var a = 0; a < len; a++) { var by = wd[st + a]; text += String.fromCharCode(by >= 0x80 && by <= 0x9f ? cp1252(by) : by); }
      } else {
        for (var b2 = 0; b2 < len; b2++) text += String.fromCharCode(wd[fc + b2 * 2] | (wd[fc + b2 * 2 + 1] << 8));
      }
    }
    // bersihkan kode field, tanda sel/baris tabel
    var out = '', depth = 0, inInstr = [], prev7 = false;
    for (var t = 0; t < text.length; t++) {
      var ch = text[t], cc = text.charCodeAt(t);
      if (cc === 0x13) { depth++; inInstr.push(true); continue; }
      if (cc === 0x14) { if (inInstr.length) inInstr[inInstr.length - 1] = false; continue; }
      if (cc === 0x15) { depth = Math.max(0, depth - 1); inInstr.pop(); continue; }
      if (inInstr.length && inInstr[inInstr.length - 1]) continue;
      if (cc === 0x07) { out += prev7 ? '\n' : ' | '; prev7 = true; continue; }
      prev7 = false;
      if (cc === 0x0d || cc === 0x0b || cc === 0x0c) { out += '\n'; continue; }
      if (cc < 0x20 && cc !== 0x09) continue;
      out += ch;
    }
    return out.replace(/ \| \n/g, '\n');
  }
  function cp1252(b) {
    var m = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
    return m[b] || b;
  }
})(window);
