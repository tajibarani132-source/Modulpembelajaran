/* docx.js — perender Microsoft Word (.docx, OOXML) yang dapat diedit */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var DX = (MRP.docx = {});
  var TW_CM = 567, PAGE_W = 11906, PAGE_H = 16838, NAVY = '1B3A6B';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rPr(o) {
    o = o || {};
    var x = '';
    if (o.font) x += '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '"/>';
    if (o.b) x += '<w:b/><w:bCs/>';
    if (o.i) x += '<w:i/><w:iCs/>';
    if (o.color) x += '<w:color w:val="' + o.color + '"/>';
    if (o.sz) x += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
    if (o.spacing) x += '<w:spacing w:val="' + o.spacing + '"/>';
    if (o.rtl) x += '<w:rtl/>';
    return x ? '<w:rPr>' + x + '</w:rPr>' : '';
  }
  function run(text, o) {
    var rp = rPr(o);
    return String(text == null ? '' : text).split('\n').map(function (part, i) {
      return (i ? '<w:r>' + rp + '<w:br/></w:r>' : '') + '<w:r>' + rp + '<w:t xml:space="preserve">' + esc(part) + '</w:t></w:r>';
    }).join('');
  }
  function runs(rs, base) {
    return (rs || []).map(function (r) { return run(r.text, Object.assign({}, base || {}, { b: r.b || (base && base.b), i: r.i || (base && base.i) })); }).join('');
  }
  function p(content, ppr) { return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (content || '') + '</w:p>'; }
  function style(id) { return '<w:pStyle w:val="' + id + '"/>'; }

  function Writer(doc, P, layout) {
    layout = layout || {};
    this.doc = doc; this.P = P;
    this.toc = layout.toc || {};
    this.newPage = layout.newPage || null; // dari tata letak PDF: bab mana yang dimulai di halaman baru
    this.ml = Math.round(P.m[0] * TW_CM); this.mt = Math.round(P.m[1] * TW_CM);
    this.mr = Math.round(P.m[2] * TW_CM); this.mb = Math.round(P.m[3] * TW_CM);
    this.cw = PAGE_W - this.ml - this.mr;
    this.ch = PAGE_H - this.mt - this.mb;
    this.media = []; this.nums = []; this.bm = 0; this.drawId = 0;
  }
  Writer.prototype.image = function (img, wPt, maxHPt, align, alt) {
    var w = wPt, h = (wPt * img.h) / img.w;
    if (maxHPt && h > maxHPt) { h = maxHPt; w = (h * img.w) / img.h; }
    var idx = this.media.length + 1, rid = 'rIdImg' + idx;
    this.media.push({ name: 'image' + idx + '.png', rid: rid, dataUrl: img.dataUrl });
    var cx = Math.round(w * 12700), cy = Math.round(h * 12700), id = ++this.drawId;
    var drawing = '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Gambar ' + id + '" descr="' + esc(alt || '') + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="image' + idx + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    return drawing;
  };
  Writer.prototype.numId = function (kind) {
    this.nums.push(kind);
    return this.nums.length;
  };

  Writer.prototype.table = function (b, innerTw) {
    var P = this.P, cols = b.header ? b.header.length : (b.rows[0] || []).length;
    if (!cols) return '';
    var total = innerTw || this.cw;
    var widths = b.widths && b.widths.length === cols ? b.widths.map(function (r) { return Math.round(total * r); }) : Array(cols).fill(Math.round(total / cols));
    var sz = Math.round((b.small ? P.fs - 1.5 : P.fs - 0.5) * 2);
    var border = function (c, s) { return '<w:top w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/><w:left w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/><w:bottom w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/><w:right w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/><w:insideH w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/><w:insideV w:val="single" w:sz="' + s + '" w:space="0" w:color="' + c + '"/>'; };
    var x = '';
    if (b.caption) x += p(run(b.caption), style('Caption') + '<w:keepNext/>');
    x += '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' + border('7F8FA6', 4) + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>';
    widths.forEach(function (w) { x += '<w:gridCol w:w="' + w + '"/>'; });
    x += '</w:tblGrid>';
    var cell = function (text, ci, head, bold) {
      var jc = head ? 'center' : (b.colAlign && b.colAlign[ci]) || 'left';
      return '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/>' + (head ? '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F2"/>' : '') + '</w:tcPr>' +
        p(run(text, { b: head || bold || (b.kv && ci === 0), sz: sz }), style('TableText') + '<w:jc w:val="' + jc + '"/>') + '</w:tc>';
    };
    if (b.header) x += '<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' + b.header.map(function (h, ci) { return cell(h, ci, true); }).join('') + '</w:tr>';
    b.rows.forEach(function (r, ri) {
      x += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
      for (var ci = 0; ci < cols; ci++) x += cell(r[ci] == null ? '' : r[ci], ci, false, b.lastBold && ri === b.rows.length - 1);
      x += '</w:tr>';
    });
    x += '</w:tbl>';
    x += p('', '<w:spacing w:before="0" w:after="' + (P.after * 20) + '" w:line="120" w:lineRule="auto"/>');
    return x;
  };

  Writer.prototype.blocks = function (blocks, inBox, innerTw) {
    var self = this, P = this.P, out = '';
    var cw = innerTw || this.cw;
    (blocks || []).forEach(function (b) {
      switch (b.t) {
        case 'p':
          out += p(runs(b.runs, b.small ? { sz: Math.round((P.fs - 1) * 2) } : null), (inBox ? style('BoxText') : '') + (b.keepNext ? '<w:keepNext/>' : '') + (b.indent && !inBox ? '<w:ind w:firstLine="567"/>' : '') + (b.align ? '<w:jc w:val="' + (b.align === 'justify' ? 'both' : b.align) + '"/>' : ''));
          break;
        case 'quote':
          out += p(runs(b.runs, { i: true }), '<w:ind w:left="454" w:right="454"/>');
          break;
        case 'h2': out += p(run(b.text), style('Heading2')); break;
        case 'h3': out += p(run(b.text), style('Heading3')); break;
        case 'h4': out += p(run(b.text), style('Heading4')); break;
        case 'ul':
        case 'ol': {
          var kind = b.t === 'ul' ? 'bullet' : b.fmt === 'lowerLetter' ? 'alpha' : 'decimal';
          var nid = self.numId(kind);
          b.items.forEach(function (it, k) {
            out += p(runs(it), style('ListParagraph') + '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + nid + '"/></w:numPr>' + (k === b.items.length - 1 ? '<w:spacing w:after="' + (P.after * 20) + '"/>' : ''));
          });
          break;
        }
        case 'table': out += self.table(b, cw); break;
        case 'figure': {
          var wPt = (cw / 20) * P.img;
          out += p(self.image(b.img, wPt, (self.ch / 20) * 0.25, 'center', b.caption), '<w:keepNext/><w:jc w:val="center"/><w:spacing w:before="80" w:after="40" w:line="240" w:lineRule="auto"/>');
          out += p(run(b.caption), style('Caption'));
          break;
        }
        case 'box': {
          var inner = cw - 2 * 180 - 40;
          var content = p(run(b.title, { b: true, color: NAVY }), style('BoxText') + '<w:keepNext/>') + self.blocks(b.blocks, true, inner);
          if (!/<\/w:p>$/.test(content)) content += p('', style('BoxText'));
          out += '<w:tbl><w:tblPr><w:tblW w:w="' + cw + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' +
            ['top', 'left', 'bottom', 'right'].map(function (s) { return '<w:' + s + ' w:val="single" w:sz="8" w:space="0" w:color="' + NAVY + '"/>'; }).join('') +
            '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
            '<w:tblGrid><w:gridCol w:w="' + cw + '"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F6FB"/></w:tcPr>' + content + '</w:tc></w:tr></w:tbl>';
          out += p('', '<w:spacing w:before="0" w:after="' + (P.after * 20) + '" w:line="120" w:lineRule="auto"/>');
          break;
        }
        case 'refs':
          b.items.forEach(function (r) { out += p(run(r), style('Reference')); });
          break;
        case 'sign':
          b.lines.forEach(function (l, i) { out += p(run(l), '<w:ind w:left="' + Math.round(cw * 0.55) + '"/><w:jc w:val="left"/><w:spacing w:before="' + (i === 0 ? P.fs * 20 : 0) + '" w:after="0"/>' + (i < b.lines.length - 1 ? '<w:keepNext/>' : '')); });
          break;
        case 'arab':
          out += p(run(b.text, { rtl: true, font: 'Traditional Arabic', sz: Math.round(P.fs * 3) }), '<w:bidi/><w:jc w:val="right"/>');
          break;
        default: break;
      }
    });
    return out;
  };

  Writer.prototype.chapterHead = function (ch, first, isMain) {
    var P = this.P, x = '';
    var bid = ++this.bm, name = '_Toc' + (1000000 + bid);
    var tcText = String(ch.tocText || ch.title).replace(/"/g, "'");
    var tc = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TC "' + esc(tcText) + '" \\l 1 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
    ch._bm = name;
    var newPage = !first && (!isMain || !this.newPage || this.newPage[ch.id] !== false);
    var brk = newPage ? '<w:pageBreakBefore/>' : '';
    if (!first && !newPage) {
      // bab mengalir (tidak di halaman baru): garis pemisah di atas label bab
      brk = '<w:pBdr><w:top w:val="single" w:sz="12" w:space="6" w:color="' + NAVY + '"/></w:pBdr><w:spacing w:before="' + Math.round(P.fs * 1.4 * 20) + '"/>';
    }
    if (ch.label) {
      x += p('<w:bookmarkStart w:id="' + bid + '" w:name="' + name + '"/>' + run(ch.label) + tc + '<w:bookmarkEnd w:id="' + bid + '"/>', style('ChapterLabel') + brk);
      x += p(run(String(ch.title).toUpperCase()), style('Heading1'));
    } else {
      x += p('<w:bookmarkStart w:id="' + bid + '" w:name="' + name + '"/>' + run(ch.title) + tc + '<w:bookmarkEnd w:id="' + bid + '"/>', style('Heading1') + brk);
    }
    return x;
  };

  Writer.prototype.tocField = function () {
    var self = this, all = this.doc.front.concat(this.doc.main), x = '';
    all.forEach(function (ch, i) {
      var label = self.toc[ch.id] || '';
      var head = i === 0 ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\f \\l "1-1" \\h \\z </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '';
      var link = '<w:hyperlink w:anchor="' + ch._bm + '" w:history="1">' + run(ch.tocText || ch.title) + '<w:r><w:tab/></w:r>' +
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF ' + ch._bm + ' \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run(label) + '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>';
      x += p(head + link, style('TOC1') + '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="' + self.cw + '"/></w:tabs>');
    });
    x += p('<w:r><w:fldChar w:fldCharType="end"/></w:r>', '<w:spacing w:after="0"/>');
    return x;
  };

  Writer.prototype.cover = function () {
    var d = this.doc, m = d.meta, x = '', P = this.P;
    var g1 = run('MODUL PEMBELAJARAN', { b: true, sz: 40, color: NAVY, spacing: 24 }) + '<w:r><w:br/></w:r>' + run('MATA KULIAH', { sz: 24, spacing: 20 }) + '<w:r><w:br/></w:r>' +
      run(m.mk.toUpperCase(), { b: true, sz: 44 });
    var meta = [];
    if (m.kode) meta.push('Kode MK: ' + m.kode);
    if (m.sks) meta.push(m.sks + ' SKS');
    if (m.semester) meta.push('Semester ' + m.semester);
    if (meta.length) g1 += '<w:r><w:br/></w:r>' + run(meta.join('   |   '), { sz: 24 });
    x += p(g1, '<w:jc w:val="center"/><w:spacing w:before="240" w:after="0" w:line="300" w:lineRule="auto"/>');
    if (d.cover.logo) {
      var lw = 140, lh = (lw * d.cover.logo.h) / d.cover.logo.w;
      if (lh > 190) { lh = 190; lw = (lh * d.cover.logo.w) / d.cover.logo.h; }
      x += p(this.image(d.cover.logo, lw, lh, 'center', 'Logo IAIN Parepare'), '<w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>');
    }
    if (d.cover.showDosen && m.dosen) x += p(run('Disusun oleh:', { sz: 24 }) + '<w:r><w:br/></w:r>' + run(m.dosen, { b: true, sz: 28 }), '<w:jc w:val="center"/><w:spacing w:after="0" w:line="300" w:lineRule="auto"/>');
    var bottom = [];
    if (m.prodi) bottom.push(m.prodi.toUpperCase());
    if (m.fakultas) bottom.push(m.fakultas.toUpperCase());
    bottom.push(m.institusi.toUpperCase());
    var g4 = bottom.map(function (t) { return run(t, { b: true, sz: 26 }); }).join('<w:r><w:br/></w:r>');
    g4 += '<w:r><w:br/></w:r>' + run(/\//.test(m.tahun) ? 'TAHUN AKADEMIK ' + m.tahun : m.tahun, { sz: 24 });
    x += p(g4, '<w:jc w:val="center"/><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>');
    x += p('', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:sectPr>' + this.sectPr({ cover: true }) + '</w:sectPr>');
    return x;
  };

  Writer.prototype.sectPr = function (o) {
    var x = '';
    if (o.header) x += '<w:headerReference w:type="default" r:id="' + o.header + '"/>';
    if (o.footer) x += '<w:footerReference w:type="default" r:id="' + o.footer + '"/>';
    x += '<w:type w:val="nextPage"/><w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '"/>';
    x += '<w:pgMar w:top="' + this.mt + '" w:right="' + this.mr + '" w:bottom="' + this.mb + '" w:left="' + this.ml + '" w:header="' + Math.round(this.mt * 0.45) + '" w:footer="' + Math.round(this.mb * 0.4) + '" w:gutter="0"/>';
    if (o.cover) {
      x += '<w:pgBorders w:offsetFrom="page">' + ['top', 'left', 'bottom', 'right'].map(function (s) { return '<w:' + s + ' w:val="thickThinSmallGap" w:sz="24" w:space="24" w:color="' + NAVY + '"/>'; }).join('') + '</w:pgBorders>';
    }
    if (o.fmt) x += '<w:pgNumType w:fmt="' + o.fmt + '" w:start="1"/>';
    x += '<w:cols w:space="708"/>';
    if (o.cover) x += '<w:vAlign w:val="both"/>';
    x += '<w:docGrid w:linePitch="360"/>';
    return x;
  };

  Writer.prototype.document = function () {
    var self = this, d = this.doc, body = '';
    body += this.cover();
    // tetapkan bookmark lebih dulu agar daftar isi dapat merujuknya
    var frontXml = d.front.map(function (ch, i) { return { ch: ch, head: self.chapterHead(ch, i === 0, false) }; });
    var mainXml = d.main.map(function (ch, i) { return { ch: ch, head: self.chapterHead(ch, i === 0, true) }; });
    frontXml.forEach(function (f, i) {
      body += f.head;
      body += f.ch.toc ? self.tocField() : self.blocks(f.ch.blocks);
      if (i === frontXml.length - 1) body += p('', '<w:spacing w:after="0"/><w:sectPr>' + self.sectPr({ footer: 'rIdFtr1', fmt: 'lowerRoman' }) + '</w:sectPr>');
    });
    mainXml.forEach(function (f) { body += f.head + self.blocks(f.ch.blocks); });
    body += '<w:sectPr>' + this.sectPr({ header: 'rIdHdr1', footer: 'rIdFtr2', fmt: 'decimal' }) + '</w:sectPr>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<w:body>' + body + '</w:body></w:document>';
  };

  Writer.prototype.styles = function () {
    var P = this.P, sz = Math.round(P.fs * 2), line = Math.round(P.lh * 240), after = Math.round(P.after * 20);
    var st = function (type, id, name, ppr, rpr, extra) {
      return '<w:style w:type="' + type + '" w:styleId="' + id + '"><w:name w:val="' + name + '"/>' + (extra || '') + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '</w:style>';
    };
    var based = '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:val="id-ID" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="' + after + '" w:line="' + line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      st('paragraph', 'Normal', 'Normal', '<w:jc w:val="both"/>', '', '<w:qFormat/>').replace('<w:style w:type="paragraph" w:styleId="Normal">', '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">') +
      st('paragraph', 'Heading1', 'heading 1', '<w:keepNext/><w:keepLines/><w:spacing w:before="0" w:after="' + Math.round(P.fs * 1.2 * 20) + '" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', '<w:b/><w:bCs/><w:sz w:val="' + Math.round((P.fs + 2) * 2) + '"/><w:szCs w:val="' + Math.round((P.fs + 2) * 2) + '"/>', based) +
      st('paragraph', 'Heading2', 'heading 2', '<w:keepNext/><w:keepLines/><w:spacing w:before="' + Math.round(P.fs * 0.55 * 20) + '" w:after="' + Math.round(P.fs * 0.25 * 20) + '"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/>', '<w:b/><w:bCs/>', based) +
      st('paragraph', 'Heading3', 'heading 3', '<w:keepNext/><w:keepLines/><w:spacing w:before="' + Math.round(P.fs * 0.35 * 20) + '" w:after="' + Math.round(P.fs * 0.2 * 20) + '"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/>', '<w:b/><w:bCs/>', based) +
      st('paragraph', 'Heading4', 'heading 4', '<w:keepNext/><w:keepLines/><w:spacing w:before="' + Math.round(P.fs * 0.25 * 20) + '" w:after="' + Math.round(P.fs * 0.15 * 20) + '"/><w:jc w:val="left"/><w:outlineLvl w:val="3"/>', '<w:b/><w:bCs/><w:i/><w:iCs/>', based) +
      st('paragraph', 'ChapterLabel', 'Label Bab', '<w:keepNext/><w:spacing w:before="0" w:after="40" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>', '<w:b/><w:bCs/><w:color w:val="' + NAVY + '"/><w:sz w:val="' + Math.round((P.fs + 1) * 2) + '"/><w:szCs w:val="' + Math.round((P.fs + 1) * 2) + '"/>', '<w:basedOn w:val="Normal"/><w:next w:val="Heading1"/><w:qFormat/>') +
      st('paragraph', 'Caption', 'caption', '<w:spacing w:before="40" w:after="' + (after + 40) + '" w:line="264" w:lineRule="auto"/><w:jc w:val="center"/>', '<w:sz w:val="' + Math.round((P.fs - 1.5) * 2) + '"/><w:szCs w:val="' + Math.round((P.fs - 1.5) * 2) + '"/>', based) +
      st('paragraph', 'TableText', 'Teks Tabel', '<w:spacing w:before="0" w:after="0" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/>', '', '<w:basedOn w:val="Normal"/><w:qFormat/>') +
      st('paragraph', 'BoxText', 'Teks Kotak', '<w:spacing w:before="0" w:after="' + Math.round(after * 0.7) + '"/><w:jc w:val="both"/>', '', '<w:basedOn w:val="Normal"/><w:qFormat/>') +
      st('paragraph', 'ListParagraph', 'List Paragraph', '<w:spacing w:after="' + Math.max(20, Math.round(after / 3)) + '"/><w:ind w:left="567" w:hanging="340"/><w:jc w:val="both"/>', '', '<w:basedOn w:val="Normal"/><w:qFormat/>') +
      st('paragraph', 'Reference', 'Daftar Pustaka', '<w:spacing w:after="' + Math.max(40, after - 40) + '"/><w:ind w:left="425" w:hanging="425"/><w:jc w:val="left"/>', '', '<w:basedOn w:val="Normal"/><w:qFormat/>') +
      st('paragraph', 'TOC1', 'toc 1', '<w:spacing w:before="0" w:after="' + Math.round(P.fs * 2.4) + '"/><w:jc w:val="left"/>', '', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>') +
      st('paragraph', 'Header', 'header', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '', '<w:basedOn w:val="Normal"/>') +
      st('paragraph', 'Footer', 'footer', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/>', '', '<w:basedOn w:val="Normal"/>') +
      '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
      '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/></w:rPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
  };

  Writer.prototype.numbering = function () {
    var lvl = function (fmt, text, font) {
      return '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="340"/></w:pPr>' + (font ? '<w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '"/></w:rPr>' : '') + '</w:lvl>';
    };
    var abs = '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>' + lvl('bullet', '•', 'Times New Roman') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>' + lvl('decimal', '%1.') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/>' + lvl('lowerLetter', '%1.') + '</w:abstractNum>';
    var nums = this.nums.map(function (k, i) {
      var a = k === 'bullet' ? 0 : k === 'alpha' ? 2 : 1;
      return '<w:num w:numId="' + (i + 1) + '"><w:abstractNumId w:val="' + a + '"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + abs + nums + '</w:numbering>';
  };

  var NS_HF = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  Writer.prototype.header = function () {
    var m = this.doc.meta, sz = Math.round((this.P.fs - 3) * 2);
    var left = m.institusi.replace(/INSTITUT AGAMA ISLAM NEGERI \(IAIN\)/i, 'IAIN');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS_HF + '>' +
      p(run(left, { sz: sz, color: '555555' }) + '<w:r><w:tab/></w:r>' + run(m.headerText, { i: true, sz: sz, color: '333333' }),
        style('Header') + '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="' + NAVY + '"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="' + this.cw + '"/></w:tabs><w:jc w:val="left"/>') + '</w:hdr>';
  };
  Writer.prototype.footer = function () {
    var sz = Math.round((this.P.fs - 1) * 2);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS_HF + '>' +
      p('<w:r>' + rPr({ sz: sz }) + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + rPr({ sz: sz }) + '<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>' + rPr({ sz: sz }) + '<w:fldChar w:fldCharType="separate"/></w:r>' + run('1', { sz: sz }) + '<w:r>' + rPr({ sz: sz }) + '<w:fldChar w:fldCharType="end"/></w:r>', style('Footer')) + '</w:ftr>';
  };

  DX.build = function (doc, preset, layout) {
    var P = preset || MRP.pdf.PRESETS[0];
    var w = new Writer(doc, P, layout);
    return U.libs.jszip().then(function (JSZip) {
      var documentXml = w.document();
      var zip = new JSZip();
      var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
        '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
      zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
      zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + esc(doc.meta.title) + '</dc:title><dc:subject>' + esc('Modul Pembelajaran ' + doc.meta.mk) + '</dc:subject><dc:creator>' + esc(doc.meta.dosen || 'IAIN Parepare') + '</dc:creator>' +
        '<cp:keywords>modul pembelajaran; RPS; IAIN Parepare</cp:keywords><cp:lastModifiedBy>' + esc(doc.meta.dosen || 'IAIN Parepare') + '</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>');
      zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Aplikasi Modul RPS IAIN Parepare</Application></Properties>');
      zip.file('word/document.xml', documentXml);
      zip.file('word/styles.xml', w.styles());
      zip.file('word/numbering.xml', w.numbering());
      zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="id-ID"/></w:settings>');
      zip.file('word/header1.xml', w.header());
      zip.file('word/footer1.xml', w.footer());
      zip.file('word/footer2.xml', w.footer());
      var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
        '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
        '<Relationship Id="rIdHdr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
        '<Relationship Id="rIdFtr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
        '<Relationship Id="rIdFtr2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>';
      w.media.forEach(function (m) {
        zip.file('word/media/' + m.name, U.dataUrlToBytes(m.dataUrl));
        rels += '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>';
      });
      rels += '</Relationships>';
      zip.file('word/_rels/document.xml.rels', rels);
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    });
  };
})(window);
