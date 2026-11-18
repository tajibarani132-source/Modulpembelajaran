/* util.js — fungsi bantu umum Aplikasi Modul RPS (IAIN Parepare) */
(function (g) {
  'use strict';
  var MRP = (g.MRP = g.MRP || {});
  var U = (MRP.util = {});

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.el = function (tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k in e && typeof v !== 'string') e[k] = v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  U.uid = function () { return Math.random().toString(36).slice(2, 10); };
  U.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  U.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
  };
  U.deepClone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };

  U.roman = function (n, lower) {
    n = Math.max(1, Math.floor(n));
    var map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var out = '';
    map.forEach(function (p) { while (n >= p[0]) { out += p[1]; n -= p[0]; } });
    return lower === false ? out : out.toLowerCase();
  };
  U.romanToInt = function (s) {
    var v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; var t = 0; s = String(s || '').toUpperCase().trim();
    if (!/^[IVXLC]+$/.test(s)) return 0;
    for (var i = 0; i < s.length; i++) { var a = v[s[i]], b = v[s[i + 1]] || 0; t += a < b ? -a : a; }
    return t;
  };

  /* ---------- Teks ---------- */
  U.clean = function (s) {
    return String(s == null ? '' : s)
      .replace(/\r\n?/g, '\n')
      .replace(/[   \t]+/g, ' ')
      .replace(/[​-‍﻿­]/g, '')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };
  U.oneLine = function (s) { return U.clean(s).replace(/\s*\n\s*/g, ' ').trim(); };

  var SMALL = ['dan', 'di', 'ke', 'dari', 'yang', 'untuk', 'dalam', 'pada', 'atau', 'serta', 'dengan', 'terhadap', 'sebagai', 'oleh', 'bagi', 'tentang', 'antara', 'melalui', 'secara', 'para', 'si', 'dll', 'dsb', 'dkk', 'of', 'and', 'the', 'in', 'on', 'for', 'to'];
  U.ACRONYMS = ['IAIN', 'UIN', 'STAIN', 'SDM', 'SWOT', 'SEO', 'SEM', 'MPS', 'CVP', 'KPI', 'BKI', 'PAI', 'PBA', 'MPI', 'PGMI', 'PIAUD', 'PMI', 'IAT', 'FEBI', 'FUAD', 'UTS', 'UAS', 'RPS', 'CPL', 'CPMK', 'ZIS', 'ZISWAF', 'BAZNAS', 'LAZ', 'UPZ', 'NU', 'MUI', 'TIK', 'TI', 'ICT', 'AI', 'PR', 'CSR', 'UMKM', 'UU', 'PP', 'RI', 'NKRI', 'OJK', 'BI', 'BMT', 'BPRS', 'KUA', 'LSM', 'NGO', 'PBL', 'PJBL', 'OBE', 'MSDM', 'SOP', 'HAM', 'BUMN', 'IT', 'TV', 'ASN', 'PNS', 'DKM', 'KKN', 'PPL'];
  U.titleCase = function (s) {
    s = U.oneLine(s);
    if (!s) return s;
    var allCaps = !/[a-zà-ÿ]/.test(s) && /[A-Z]/.test(s);
    return s.split(' ').map(function (w, i) {
      if (!w) return w;
      var core = w.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, '');
      var upper = core.toUpperCase();
      if (core && U.ACRONYMS.indexOf(upper) >= 0 && (allCaps || core === upper)) return w.replace(core, upper);
      if (!allCaps && core.length >= 2 && core === upper && /[A-Z]/.test(core)) return w; // singkatan asli (SDM, ZISWAF)
      if (!allCaps && /^[A-Z][a-z]+[A-Z]/.test(core)) return w; // camel (IoT, YouTube)
      var lw = w.toLowerCase();
      if (i > 0 && SMALL.indexOf(core.toLowerCase()) >= 0) return lw;
      // huruf setelah apostrof (Da'i, Mad'u) tidak dikapitalkan
      return lw.replace(/(^|[-(\/"“[])([a-zà-ÿ])/g, function (m, p, c) { return p + c.toUpperCase(); });
    }).join(' ');
  };
  /* frasa judul -> huruf kecil untuk dipakai di tengah kalimat (singkatan & nama diri tetap) */
  var PROPER = ['islam', 'islami', 'allah', 'al-qur\'an', 'al-qur’an', 'nabi', 'muhammad', 'rasulullah', 'indonesia', 'parepare', 'arab', 'iain', 'swt.', 'saw.'];
  U.lowerPhrase = function (s) {
    return U.oneLine(s).split(' ').map(function (w) {
      var core = w.replace(/^[^A-Za-zÀ-ÿ0-9']+|[^A-Za-zÀ-ÿ0-9']+$/g, '');
      if (core.length >= 2 && core === core.toUpperCase() && /[A-Z]/.test(core)) return w;
      if (/^[A-Z][a-z]+[A-Z]/.test(core)) return w;
      if (PROPER.indexOf(core.toLowerCase()) >= 0) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return w.toLowerCase();
    }).join(' ');
  };
  U.upperFirst = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  U.countWords = function (s) { var m = String(s || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu); return m ? m.length : 0; };
  U.truncateWords = function (s, n) { var w = U.oneLine(s).split(' '); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' ') + '…'; };

  U.ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  U.hasArabic = function (s) { return U.ARABIC_RE.test(String(s || '')); };

  /* Sanitasi untuk font standar PDF (WinAnsi / cp1252) */
  var WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  var MAP = {
    'ʿ': "'", 'ʾ': "'", 'ʼ': "'", '′': "'", '″': '"', '‐': '-', '‑': '-', '‒': '-', '−': '-', '―': '—',
    '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇔': '<=>', '↑': '^', '↓': 'v',
    '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '∙': '·', '●': '•', '▪': '•', '■': '•', '◦': '-', '‣': '•', '⁃': '-',
    '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '★': '*', '☆': '*', '∞': 'tak hingga', '∑': 'Sigma', '√': 'akar',
    'α': 'alfa', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'λ': 'lambda', 'μ': 'µ', 'π': 'pi', 'σ': 'sigma', 'Δ': 'Delta', 'Σ': 'Sigma',
    '　': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': '\n', ' ': '\n', '­': '', '​': '', '﻿': ''
  };
  U.toWinAnsi = function (s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { i++; continue; } // emoji / di luar BMP
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || c === 10 || WIN_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (c === 9) { out += ' '; continue; }
      if (MAP[ch] !== undefined) { out += MAP[ch]; continue; }
      var base = ch.normalize ? ch.normalize('NFKD').replace(/[̀-ͯ]/g, '') : '';
      if (base && base !== ch && /^[\x20-\x7e\xa0-\xff]+$/.test(base)) { out += base; continue; }
    }
    return out;
  };

  /* Markdown ringan -> blok dokumen.
     Blok: {t:'p',runs} {t:'ul',items:[runs]} {t:'ol',fmt,items} {t:'table',header,rows} {t:'quote',runs} {t:'h4',text} */
  U.parseInline = function (text) {
    text = String(text == null ? '' : text);
    var runs = [];
    // tanpa lookbehind agar aman di peramban lama
    var re = /\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|(^|[\s(\[“"'‘])\*([^*\s][^*\n]*?)\*(?=$|[\s.,;:!?)\]”"'’])|(^|[\s(\[“"'‘])_([^_\s][^_\n]*?)_(?=$|[\s.,;:!?)\]”"'’])/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      var start = m.index;
      var prefix = m[3] !== undefined ? m[3] : m[5] !== undefined ? m[5] : '';
      if (start + prefix.length > last) runs.push({ text: text.slice(last, start + prefix.length) });
      if (m[1] !== undefined) runs.push({ text: m[1], b: true, i: true });
      else if (m[2] !== undefined) runs.push({ text: m[2], b: true });
      else runs.push({ text: m[4] !== undefined ? m[4] : m[6], i: true });
      last = start + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < text.length) runs.push({ text: text.slice(last) });
    return runs.filter(function (r) { return r.text; }).map(function (r) { r.text = r.text.replace(/\*\*/g, ''); return r; });
  };
  U.runsText = function (runs) { return (runs || []).map(function (r) { return r.text; }).join(''); };

  U.parseMarkdown = function (src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').split('\n');
    var blocks = [], list = null, table = null;
    function flushList() { if (list) { blocks.push(list); list = null; } }
    function flushTable() {
      if (table) {
        if (table.rows.length || table.header) {
          if (!table.header && table.rows.length > 1) table.header = table.rows.shift();
          blocks.push(table);
        }
        table = null;
      }
    }
    lines.forEach(function (raw) {
      var line = raw.trim(), m;
      if (!line) { flushList(); flushTable(); return; }
      if (/^\|.*\|$/.test(line)) {
        flushList();
        if (!table) table = { t: 'table', header: null, rows: [] };
        var cells = line.slice(1, -1).split('|').map(function (c) { return c.trim().replace(/\*\*/g, ''); });
        if (cells.every(function (c) { return /^:?-{2,}:?$/.test(c); })) {
          if (!table.header && table.rows.length === 1) table.header = table.rows.shift();
        } else table.rows.push(cells);
        return;
      }
      flushTable();
      if ((m = line.match(/^#{1,6}\s+(.*)$/))) { flushList(); blocks.push({ t: 'h4', text: m[1].replace(/\*\*/g, '').trim() }); return; }
      if ((m = line.match(/^[-*•·▪●]\s+(.*)$/))) {
        if (!list || list.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; }
        list.items.push(U.parseInline(m[1])); return;
      }
      if ((m = line.match(/^(\d{1,2})[.)]\s+(.*)$/))) {
        if (!list || list.t !== 'ol' || list.fmt !== 'decimal') { flushList(); list = { t: 'ol', fmt: 'decimal', items: [] }; }
        list.items.push(U.parseInline(m[2])); return;
      }
      if ((m = line.match(/^([a-h])[.)]\s+(.*)$/)) && (list && list.fmt === 'lowerLetter' || m[1] === 'a')) {
        if (!list || list.fmt !== 'lowerLetter') { flushList(); list = { t: 'ol', fmt: 'lowerLetter', items: [] }; }
        list.items.push(U.parseInline(m[2])); return;
      }
      if ((m = line.match(/^>\s?(.*)$/))) { flushList(); blocks.push({ t: 'quote', runs: U.parseInline(m[1]) }); return; }
      flushList();
      blocks.push({ t: 'p', runs: U.parseInline(line) });
    });
    flushList(); flushTable();
    return blocks;
  };
  U.mdToHtml = function (src) {
    return U.parseMarkdown(src).map(function (b) {
      var rh = function (runs) { return runs.map(function (r) { var t = U.esc(r.text); if (r.b) t = '<b>' + t + '</b>'; if (r.i) t = '<i>' + t + '</i>'; return t; }).join(''); };
      if (b.t === 'p') return '<p>' + rh(b.runs) + '</p>';
      if (b.t === 'quote') return '<blockquote>' + rh(b.runs) + '</blockquote>';
      if (b.t === 'h4') return '<h4>' + U.esc(b.text) + '</h4>';
      if (b.t === 'ul' || b.t === 'ol') {
        var tag = b.t === 'ul' ? 'ul' : 'ol';
        return '<' + tag + (b.fmt === 'lowerLetter' ? ' type="a"' : '') + '>' + b.items.map(function (it) { return '<li>' + rh(it) + '</li>'; }).join('') + '</' + tag + '>';
      }
      if (b.t === 'table') {
        var h = b.header ? '<tr>' + b.header.map(function (c) { return '<th>' + U.esc(c) + '</th>'; }).join('') + '</tr>' : '';
        return '<table>' + h + b.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + U.esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      }
      return '';
    }).join('');
  };

  /* ---------- Penyimpanan lokal ---------- */
  U.store = {
    get: function (k, def) { try { var v = g.localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { g.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { g.localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  };

  /* ---------- Pemuatan pustaka ---------- */
  var loaded = {};
  U.loadScript = function (src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { delete loaded[src]; rej(new Error('Gagal memuat pustaka ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  };
  U.libs = {
    pdfjs: function () {
      return U.loadScript('vendor/pdf.min.js').then(function () {
        var lib = g.pdfjsLib;
        if (!lib) throw new Error('pdf.js tidak tersedia');
        if (location.protocol === 'file:' || typeof g.Worker === 'undefined') {
          return U.loadScript('vendor/pdf.worker.min.js').then(function () { return lib; }); // mode utas utama
        }
        lib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        return lib;
      });
    },
    mammoth: function () { return U.loadScript('vendor/mammoth.browser.min.js').then(function () { return g.mammoth; }); },
    pdfmake: function () {
      return U.loadScript('vendor/pdfmake.min.js')
        .then(function () { return U.loadScript('vendor/standard-fonts/Times.js'); })
        .then(function () { return g.pdfMake; });
    },
    jszip: function () { return U.loadScript('vendor/jszip.min.js').then(function () { return g.JSZip; }); },
    anthropic: function () { return U.loadScript('vendor/anthropic-sdk.js').then(function () { return g.Anthropic; }); }
  };

  /* ---------- Berkas ---------- */
  U.readAsArrayBuffer = function (file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  };
  U.readAsDataURL = function (blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(blob); });
  };
  U.arrayBufferToBase64 = function (buf) {
    var bytes = new Uint8Array(buf), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  };
  U.blobToBase64 = function (blob) { return U.readAsDataURL(blob).then(function (d) { return String(d).split(',')[1] || ''; }); };
  U.dataUrlToBytes = function (dataUrl) {
    var b64 = String(dataUrl).split(',')[1] || '';
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  U.imageSize = function (dataUrl) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = rej; im.src = dataUrl; });
  };
  U.fetchDataUrl = function (url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(U.readAsDataURL)
      .catch(function () { // file:// tidak mengizinkan fetch -> pakai canvas
        return new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); try { res(c.toDataURL('image/png')); } catch (e) { rej(e); } };
          im.onerror = rej; im.src = url;
        });
      });
  };
  U.safeFileName = function (s) {
    return U.oneLine(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'modul';
  };
  U.isNative = function () { var c = g.Capacitor; return !!(c && c.isNativePlatform && c.isNativePlatform()); };

  U.saveBlob = function (blob, filename) {
    if (U.isNative()) {
      var P = g.Capacitor.Plugins || {};
      if (P.Filesystem) {
        return U.blobToBase64(blob).then(function (b64) {
          return P.Filesystem.writeFile({ path: filename, data: b64, directory: 'CACHE', recursive: true });
        }).then(function (res) {
          var done = function () { return { native: true, uri: res.uri }; };
          if (!P.Share) return done();
          var dialogTitle = 'Simpan atau bagikan ' + filename;
          // berkas dibagikan lewat `files` (Capacitor 4+); `url` hanya cadangan agar tidak terlampir dua kali
          return P.Share.share({ title: filename, files: [res.uri], dialogTitle: dialogTitle }).catch(function (e) {
            if (/cancel/i.test(String(e && e.message))) return null; // pengguna menutup lembar berbagi
            return P.Share.share({ title: filename, url: res.uri, dialogTitle: dialogTitle }).catch(function () { return null; });
          }).then(done);
        });
      }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return Promise.resolve({ native: false });
  };

  /* ---------- Notifikasi ---------- */
  U.toast = function (msg, type, ms) {
    var host = U.$('#toasts'); if (!host) return;
    var t = U.el('div', { class: 'toast ' + (type || ''), text: msg });
    host.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 320); }, ms || 4200);
  };

  /* JSON longgar: menerima keluaran model yang dibungkus ``` atau ada koma berlebih */
  U.parseJsonLoose = function (text) {
    var s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) { /* lanjut perbaikan */ }
    var fixed = '', inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (esc) { fixed += ch; esc = false; continue; }
        if (ch === '\\') { fixed += ch; esc = true; continue; }
        if (ch === '"') { inStr = false; fixed += ch; continue; }
        if (ch === '\n') { fixed += '\\n'; continue; }
        if (ch === '\r') continue;
        if (ch === '\t') { fixed += '\\t'; continue; }
        fixed += ch;
      } else {
        if (ch === '"') inStr = true;
        fixed += ch;
      }
    }
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  };

  U.formatBytes = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
})(window);
