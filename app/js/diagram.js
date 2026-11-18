/* diagram.js — menggambar visual materi (bagan) ke canvas -> PNG */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var D = (MRP.diagram = {});

  var FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
  var ACC = ['#1B3A6B', '#2E7D32', '#A87900', '#B71C1C', '#5E35B1', '#00796B', '#455A64', '#AD1457'];
  var FILL = ['#E9EFF8', '#E8F5E9', '#FFF5D6', '#FDECEA', '#EFE9F8', '#E0F2F1', '#ECEFF1', '#FCE4EC'];
  // Lebar logis 720 px agar teks bagan tetap terbaca (≈8–9 pt) setelah dicetak selebar ±13 cm
  var INK = '#1F2937', MUTED = '#4B5563', W = 720, SCALE = 2.4, M = 18;

  D.TYPES = ['peta_konsep', 'alur', 'siklus', 'hierarki', 'piramida', 'kuadran', 'garis_waktu', 'perbandingan'];
  D.LABELS = { peta_konsep: 'Peta konsep', alur: 'Alur', siklus: 'Siklus', hierarki: 'Hierarki', piramida: 'Piramida', kuadran: 'Matriks', garis_waktu: 'Garis waktu', perbandingan: 'Perbandingan' };

  function font(ctx, size, weight) { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; }
  function wrap(ctx, text, maxW) {
    text = U.oneLine(text);
    if (!text) return [];
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) { cur = test; return; }
      if (cur) lines.push(cur);
      if (ctx.measureText(w).width > maxW) {
        var part = '';
        for (var i = 0; i < w.length; i++) {
          if (ctx.measureText(part + w[i] + '-').width > maxW) { lines.push(part + '-'); part = ''; }
          part += w[i];
        }
        cur = part;
      } else cur = w;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function textBlock(ctx, text, maxW, size, weight, lh) {
    font(ctx, size, weight);
    var lines = wrap(ctx, text, maxW);
    return { lines: lines, h: lines.length * size * (lh || 1.28), size: size, weight: weight || 400, lh: lh || 1.28 };
  }
  function drawBlock(ctx, blk, x, y, color, align, maxW) {
    font(ctx, blk.size, blk.weight);
    ctx.fillStyle = color || INK;
    ctx.textBaseline = 'top';
    blk.lines.forEach(function (ln, i) {
      var tx = x;
      if (align === 'center') tx = x + (maxW - ctx.measureText(ln).width) / 2;
      else if (align === 'right') tx = x + maxW - ctx.measureText(ln).width;
      ctx.fillText(ln, tx, y + i * blk.size * blk.lh + blk.size * (blk.lh - 1) / 2);
    });
  }
  function bullets(ctx, items, maxW, size) {
    var out = [], h = 0;
    (items || []).forEach(function (it) {
      var b = textBlock(ctx, it, maxW - 14, size, 400, 1.25);
      if (b.lines.length) { out.push(b); h += b.h + 3; }
    });
    return { items: out, h: h };
  }
  function drawBullets(ctx, bl, x, y, color) {
    var cy = y;
    bl.items.forEach(function (b) {
      ctx.fillStyle = color || MUTED;
      ctx.beginPath(); ctx.arc(x + 4, cy + b.size * 0.62, 2.6, 0, Math.PI * 2); ctx.fill();
      drawBlock(ctx, b, x + 14, cy, MUTED);
      cy += b.h + 3;
    });
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function box(ctx, x, y, w, h, fill, stroke, r, lw) {
    rr(ctx, x, y, w, h, r == null ? 10 : r);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = lw || 1.6; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function arrowHead(ctx, x, y, ang, color, size) {
    size = size || 11;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(ang - 0.42), y - size * Math.sin(ang - 0.42));
    ctx.lineTo(x - size * Math.cos(ang + 0.42), y - size * Math.sin(ang + 0.42));
    ctx.closePath(); ctx.fill();
  }
  function arrow(ctx, x1, y1, x2, y2, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2.2;
    var ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 8 * Math.cos(ang), y2 - 8 * Math.sin(ang)); ctx.stroke();
    arrowHead(ctx, x2, y2, ang, color);
  }

  function items(spec, max) {
    return (spec.item || []).filter(function (it) { return it && U.oneLine(it.label || it.keterangan || ''); }).slice(0, max || 8).map(function (it) {
      return {
        label: U.truncateWords(it.label || it.keterangan || '', 9),
        ket: U.truncateWords(it.keterangan || '', 22),
        rincian: (it.rincian || []).map(function (r) { return U.truncateWords(r, 14); }).filter(Boolean).slice(0, 4),
        waktu: U.oneLine(it.waktu || '')
      };
    });
  }

  /* ---------- tata letak tiap jenis ---------- */
  function layoutPeta(ctx, spec) {
    var its = items(spec, 6);
    var colW = Math.round(W * 0.33), centerW = Math.round(W * 0.24);
    var leftX = M, rightX = W - M - colW, centerX = (W - centerW) / 2;
    var nodes = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, colW - 26, 17, 700);
      var det = bullets(ctx, it.rincian.length ? it.rincian : it.ket ? [it.ket] : [], colW - 26, 15);
      return { it: it, lab: lab, det: det, h: 14 + lab.h + (det.h ? det.h + 6 : 0) + 12, side: i % 2 === 0 ? 'R' : 'L', i: i };
    });
    var sideH = { L: 0, R: 0 };
    nodes.forEach(function (n) { sideH[n.side] += n.h + 18; });
    var cTxt = textBlock(ctx, spec.pusat || spec.judul || 'Konsep', centerW - 28, 20, 700);
    var cH = cTxt.h + 30;
    var H = Math.max(sideH.L, sideH.R, cH + 40) + M * 2;
    var cY = (H - cH) / 2;
    var yy = { L: (H - sideH.L + 18) / 2, R: (H - sideH.R + 18) / 2 };
    nodes.forEach(function (n) { n.x = n.side === 'R' ? rightX : leftX; n.y = yy[n.side]; yy[n.side] += n.h + 18; });
    return {
      h: H, draw: function (c) {
        nodes.forEach(function (n) {
          var col = ACC[n.i % ACC.length];
          var sx = n.side === 'R' ? centerX + centerW : centerX, sy = cY + cH / 2;
          var ex = n.side === 'R' ? n.x : n.x + colW, ey = n.y + n.h / 2;
          c.strokeStyle = col; c.lineWidth = 2.4;
          c.beginPath(); c.moveTo(sx, sy);
          var mx = (sx + ex) / 2;
          c.bezierCurveTo(mx, sy, mx, ey, ex, ey); c.stroke();
          c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 4, 0, Math.PI * 2); c.fill();
        });
        box(c, centerX, cY, centerW, cH, ACC[0], null, 14);
        drawBlock(c, cTxt, centerX + 14, cY + 15, '#FFFFFF', 'center', centerW - 28);
        nodes.forEach(function (n) {
          var col = ACC[n.i % ACC.length];
          box(c, n.x, n.y, colW, n.h, FILL[n.i % FILL.length], col, 10);
          c.fillStyle = col; rr(c, n.x, n.y, 6, n.h, 3); c.fill();
          drawBlock(c, n.lab, n.x + 16, n.y + 12, col);
          if (n.det.h) drawBullets(c, n.det, n.x + 16, n.y + 12 + n.lab.h + 6, col);
        });
      }
    };
  }

  function layoutAlur(ctx, spec) {
    var its = items(spec, 8);
    var n = its.length, per = n <= 4 ? n : n <= 6 ? 3 : 4, gap = 44;
    var bw = (W - 2 * M - (per - 1) * gap) / per;
    var nodes = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, bw - 24, 16.5, 700);
      var ket = textBlock(ctx, it.ket || it.rincian.join('; '), bw - 24, 14, 400, 1.25);
      return { it: it, lab: lab, ket: ket, h: 46 + lab.h + (ket.lines.length ? ket.h + 6 : 0) + 10, i: i };
    });
    var rows = [];
    for (var i = 0; i < n; i += per) rows.push(nodes.slice(i, i + per));
    var y = M, rowGap = 46;
    rows.forEach(function (row, ri) {
      var rh = Math.max.apply(null, row.map(function (x) { return x.h; }));
      var offset = row.length < per ? ((per - row.length) * (bw + gap)) / 2 : 0;
      row.forEach(function (nd, ci) { nd.x = M + offset + ci * (bw + gap); nd.y = y; nd.hh = rh; nd.row = ri; });
      y += rh + rowGap;
    });
    var H = y - rowGap + M;
    return {
      h: H, draw: function (c) {
        rows.forEach(function (row, ri) {
          row.forEach(function (nd, ci) {
            if (ci < row.length - 1) arrow(c, nd.x + bw + 4, nd.y + nd.hh / 2, nd.x + bw + gap - 4, nd.y + nd.hh / 2, '#7A8699', 2.4);
          });
          if (ri < rows.length - 1) {
            var last = row[row.length - 1], first = rows[ri + 1][0];
            var x1 = last.x + bw / 2, y1 = last.y + last.hh, x2 = first.x + bw / 2, y2 = first.y;
            var midY = y1 + (y2 - y1) / 2;
            c.strokeStyle = '#7A8699'; c.lineWidth = 2.4;
            c.beginPath(); c.moveTo(x1, y1 + 4); c.lineTo(x1, midY); c.lineTo(x2, midY); c.lineTo(x2, y2 - 8); c.stroke();
            arrowHead(c, x2, y2 - 2, Math.PI / 2, '#7A8699');
          }
        });
        nodes.forEach(function (nd) {
          var col = ACC[nd.i % ACC.length];
          box(c, nd.x, nd.y, bw, nd.hh, FILL[nd.i % FILL.length], col, 12);
          c.fillStyle = col; c.beginPath(); c.arc(nd.x + 26, nd.y + 24, 15, 0, Math.PI * 2); c.fill();
          font(c, 15, 700); c.fillStyle = '#fff'; c.textBaseline = 'middle';
          var num = String(nd.i + 1); c.fillText(num, nd.x + 26 - c.measureText(num).width / 2, nd.y + 25);
          drawBlock(c, nd.lab, nd.x + 12, nd.y + 46, col);
          if (nd.ket.lines.length) drawBlock(c, nd.ket, nd.x + 12, nd.y + 46 + nd.lab.h + 6, MUTED);
        });
      }
    };
  }

  function layoutSiklus(ctx, spec) {
    var its = items(spec, 6);
    var n = Math.max(3, its.length), bw = n <= 4 ? 200 : 172;
    var nodes = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, bw - 22, 16.5, 700);
      var ket = textBlock(ctx, it.ket || it.rincian.join('; '), bw - 22, 14.5, 400, 1.22);
      return { lab: lab, ket: ket, h: 18 + lab.h + (ket.lines.length ? ket.h + 4 : 0) + 8, i: i };
    });
    var maxH = Math.max.apply(null, nodes.map(function (x) { return x.h; }));
    var R = n <= 4 ? 168 : 190;
    var H = 2 * R + maxH + 2 * M;
    var cx = W / 2, cy = H / 2;
    nodes.forEach(function (nd, i) {
      var a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length;
      nd.a = a; nd.cx = cx + R * Math.cos(a); nd.cy = cy + R * Math.sin(a) * 0.86;
      nd.x = nd.cx - bw / 2; nd.y = nd.cy - nd.h / 2;
    });
    var center = spec.pusat ? textBlock(ctx, spec.pusat, 124, 15.5, 700) : null;
    return {
      h: H, draw: function (c) {
        var cnt = nodes.length;
        for (var i = 0; i < cnt; i++) {
          var a1 = nodes[i].a, a2 = nodes[(i + 1) % cnt].a;
          if (a2 <= a1) a2 += Math.PI * 2;
          var span = a2 - a1, pad = Math.min(span * 0.32, (bw * 0.55) / R);
          var s = a1 + pad, e = a2 - pad;
          c.strokeStyle = '#7A8699'; c.lineWidth = 2.6;
          c.beginPath();
          for (var t = 0; t <= 30; t++) {
            var ang = s + ((e - s) * t) / 30;
            var px = cx + R * Math.cos(ang), py = cy + R * Math.sin(ang) * 0.86;
            if (t === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.stroke();
          var ex = cx + R * Math.cos(e), ey = cy + R * Math.sin(e) * 0.86;
          var bx = cx + R * Math.cos(e - 0.04), by = cy + R * Math.sin(e - 0.04) * 0.86;
          arrowHead(c, ex, ey, Math.atan2(ey - by, ex - bx), '#7A8699', 13);
        }
        if (center) {
          c.fillStyle = FILL[0]; c.strokeStyle = ACC[0]; c.lineWidth = 2;
          c.beginPath(); c.arc(cx, cy, 74, 0, Math.PI * 2); c.fill(); c.stroke();
          drawBlock(c, center, cx - 62, cy - center.h / 2, ACC[0], 'center', 124);
        }
        nodes.forEach(function (nd) {
          var col = ACC[nd.i % ACC.length];
          box(c, nd.x, nd.y, bw, nd.h, '#FFFFFF', col, 12, 2);
          c.fillStyle = col; rr(c, nd.x, nd.y, bw, 8, 4); c.fill();
          drawBlock(c, nd.lab, nd.x + 11, nd.y + 14, col, 'center', bw - 22);
          if (nd.ket.lines.length) drawBlock(c, nd.ket, nd.x + 11, nd.y + 14 + nd.lab.h + 4, MUTED, 'center', bw - 22);
        });
      }
    };
  }

  function layoutHierarki(ctx, spec) {
    var its = items(spec, 6);
    var n = its.length, per = n <= 4 ? n : 3, gap = 20;
    var bw = (W - 2 * M - (per - 1) * gap) / per;
    var root = textBlock(ctx, spec.pusat || spec.judul || 'Konsep', 300, 18, 700);
    var rootW = Math.min(340, Math.max(200, Math.max.apply(null, root.lines.map(function (l) { font(ctx, 18, 700); return ctx.measureText(l).width; })) + 40));
    var rootH = root.h + 26;
    var nodes = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, bw - 22, 16, 700);
      var det = bullets(ctx, it.rincian.length ? it.rincian : it.ket ? [it.ket] : [], bw - 22, 14.5);
      return { lab: lab, det: det, h: 12 + lab.h + (det.h ? det.h + 6 : 0) + 10, i: i };
    });
    var rows = [];
    for (var i = 0; i < n; i += per) rows.push(nodes.slice(i, i + per));
    var y = M + rootH + 46;
    rows.forEach(function (row) {
      var rh = Math.max.apply(null, row.map(function (x) { return x.h; }));
      var total = row.length * bw + (row.length - 1) * gap, x0 = (W - total) / 2;
      row.forEach(function (nd, ci) { nd.x = x0 + ci * (bw + gap); nd.y = y; nd.hh = rh; });
      row.busY = y - 22; y += rh + 48;
    });
    var H = y - 48 + M;
    return {
      h: H, draw: function (c) {
        var rx = (W - rootW) / 2;
        c.strokeStyle = '#7A8699'; c.lineWidth = 2.2;
        var trunkBottom = rows.length ? rows[rows.length - 1].busY : M + rootH;
        c.beginPath(); c.moveTo(W / 2, M + rootH); c.lineTo(W / 2, trunkBottom); c.stroke();
        rows.forEach(function (row) {
          var xs = row.map(function (nd) { return nd.x + bw / 2; });
          c.beginPath(); c.moveTo(Math.min(xs[0], W / 2), row.busY); c.lineTo(Math.max(xs[xs.length - 1], W / 2), row.busY); c.stroke();
          xs.forEach(function (x) { c.beginPath(); c.moveTo(x, row.busY); c.lineTo(x, row.busY + 14); c.stroke(); arrowHead(c, x, row.busY + 22, Math.PI / 2, '#7A8699', 10); });
        });
        box(c, rx, M, rootW, rootH, ACC[0], null, 12);
        drawBlock(c, root, rx + 20, M + 13, '#FFFFFF', 'center', rootW - 40);
        nodes.forEach(function (nd) {
          var col = ACC[(nd.i + 1) % ACC.length];
          box(c, nd.x, nd.y, bw, nd.hh, FILL[(nd.i + 1) % FILL.length], col, 10);
          drawBlock(c, nd.lab, nd.x + 11, nd.y + 12, col, 'center', bw - 22);
          if (nd.det.h) drawBullets(c, nd.det, nd.x + 11, nd.y + 12 + nd.lab.h + 6, col);
        });
      }
    };
  }

  function layoutPiramida(ctx, spec) {
    var its = items(spec, 6);
    var n = its.length, baseW = 340, minW = 124, px = M + 4, textX = px + baseW + 26, textW = W - textX - M;
    var levels = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, minW + ((baseW - minW) * (i + 0.5)) / n - 36, 15.5, 700);
      var ket = textBlock(ctx, it.ket || it.rincian.join('; '), textW, 14.5, 400, 1.25);
      return { lab: lab, ket: ket, h: Math.max(lab.h + 22, ket.h + 10, 58), i: i };
    });
    var H = M * 2 + levels.reduce(function (a, l) { return a + l.h + 4; }, 0);
    return {
      h: H, draw: function (c) {
        var y = M, cxp = px + baseW / 2;
        levels.forEach(function (lv) {
          var tw = minW + ((baseW - minW) * lv.i) / n, bw2 = minW + ((baseW - minW) * (lv.i + 1)) / n;
          var shade = lv.i / Math.max(1, n - 1);
          var col = mix('#1B3A6B', '#7FA4D6', shade);
          c.fillStyle = col;
          c.beginPath(); c.moveTo(cxp - tw / 2, y); c.lineTo(cxp + tw / 2, y); c.lineTo(cxp + bw2 / 2, y + lv.h); c.lineTo(cxp - bw2 / 2, y + lv.h); c.closePath(); c.fill();
          var midW = (tw + bw2) / 2 - 40;
          drawBlock(c, lv.lab, cxp - midW / 2, y + (lv.h - lv.lab.h) / 2, shade > 0.55 ? '#0F2547' : '#FFFFFF', 'center', midW);
          c.strokeStyle = '#B8C2D1'; c.lineWidth = 1.4; c.setLineDash([4, 4]);
          c.beginPath(); c.moveTo(cxp + bw2 / 2 - (bw2 - tw) / 4 + 4, y + lv.h / 2); c.lineTo(textX - 8, y + lv.h / 2); c.stroke(); c.setLineDash([]);
          if (lv.ket.lines.length) drawBlock(c, lv.ket, textX, y + (lv.h - lv.ket.h) / 2, INK);
          y += lv.h + 4;
        });
      }
    };
  }
  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return 'rgb(' + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(',') + ')';
  }

  function layoutKuadran(ctx, spec) {
    var its = items(spec, 6);
    var gap = 18, bw = (W - 2 * M - gap) / 2;
    var cells = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, bw - 24, 16.5, 700);
      var det = bullets(ctx, it.rincian.length ? it.rincian : it.ket ? [it.ket] : [], bw - 26, 14);
      return { lab: lab, det: det, hh: lab.h + 16, h: lab.h + 16 + det.h + 18, i: i };
    });
    var y = M, rows = [];
    for (var i = 0; i < cells.length; i += 2) {
      var pair = cells.slice(i, i + 2), rh = Math.max.apply(null, pair.map(function (x) { return x.h; }));
      pair.forEach(function (cl, ci) { cl.x = M + ci * (bw + gap); cl.y = y; cl.rh = rh; });
      if (pair.length === 1) pair[0].x = (W - bw) / 2;
      rows.push(pair); y += rh + gap;
    }
    var H = y - gap + M;
    var center = cells.length === 4 && spec.pusat ? textBlock(ctx, spec.pusat, 120, 15, 700) : null;
    return {
      h: H, draw: function (c) {
        cells.forEach(function (cl) {
          var col = ACC[cl.i % ACC.length];
          box(c, cl.x, cl.y, bw, cl.rh, FILL[cl.i % FILL.length], col, 12);
          c.save(); rr(c, cl.x, cl.y, bw, cl.hh, 12); c.clip(); c.fillStyle = col; c.fillRect(cl.x, cl.y, bw, cl.hh); c.restore();
          drawBlock(c, cl.lab, cl.x + 12, cl.y + 8, '#FFFFFF', 'center', bw - 24);
          if (cl.det.h) drawBullets(c, cl.det, cl.x + 14, cl.y + cl.hh + 10, col);
        });
        if (center) {
          var cxp = W / 2, cyp = M + rows[0][0].rh + gap / 2;
          c.fillStyle = '#FFFFFF'; c.strokeStyle = ACC[0]; c.lineWidth = 2.4;
          c.beginPath(); c.arc(cxp, cyp, 62, 0, Math.PI * 2); c.fill(); c.stroke();
          drawBlock(c, center, cxp - 60, cyp - center.h / 2, ACC[0], 'center', 120);
        }
      }
    };
  }

  function layoutWaktu(ctx, spec) {
    var its = items(spec, 8);
    var n = its.length;
    if (n <= 5) {
      var span = (W - 2 * M) / n, tw = span - 14;
      var evs = its.map(function (it, i) {
        var wt = textBlock(ctx, it.waktu || it.label, tw, 16, 700);
        var lab = textBlock(ctx, it.waktu ? it.label : it.ket, tw, 14, 600, 1.22);
        var ket = it.waktu && it.ket ? textBlock(ctx, it.ket, tw, 13, 400, 1.22) : null;
        return { wt: wt, lab: lab, ket: ket, h: wt.h + lab.h + (ket ? ket.h + 4 : 0) + 10, i: i, up: i % 2 === 0 };
      });
      var upH = Math.max.apply(null, evs.filter(function (e) { return e.up; }).map(function (e) { return e.h; }).concat([0]));
      var dnH = Math.max.apply(null, evs.filter(function (e) { return !e.up; }).map(function (e) { return e.h; }).concat([0]));
      var lineY = M + upH + 30, H = lineY + 30 + dnH + M;
      return {
        h: H, draw: function (c) {
          c.strokeStyle = ACC[0]; c.lineWidth = 4; c.beginPath(); c.moveTo(M, lineY); c.lineTo(W - M - 10, lineY); c.stroke();
          arrowHead(c, W - M, lineY, 0, ACC[0], 16);
          evs.forEach(function (e) {
            var cx = M + span * e.i + span / 2, col = ACC[e.i % ACC.length];
            c.fillStyle = '#fff'; c.strokeStyle = col; c.lineWidth = 3.5; c.beginPath(); c.arc(cx, lineY, 10, 0, Math.PI * 2); c.fill(); c.stroke();
            var ty = e.up ? lineY - 22 - e.h : lineY + 22;
            c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx, e.up ? lineY - 12 : lineY + 12); c.lineTo(cx, e.up ? lineY - 20 : lineY + 20); c.stroke();
            var x0 = cx - tw / 2;
            drawBlock(c, e.wt, x0, ty, col, 'center', tw);
            drawBlock(c, e.lab, x0, ty + e.wt.h + 2, INK, 'center', tw);
            if (e.ket) drawBlock(c, e.ket, x0, ty + e.wt.h + e.lab.h + 6, MUTED, 'center', tw);
          });
        }
      };
    }
    var lx = 140, txtX = 166, txtW = W - txtX - M;
    var rows = its.map(function (it, i) {
      var wt = textBlock(ctx, it.waktu || String(i + 1), lx - M - 22, 15.5, 700);
      var lab = textBlock(ctx, it.waktu ? it.label : it.ket || it.label, txtW, 15, 700);
      var ket = it.ket && it.waktu ? textBlock(ctx, it.ket, txtW, 13.5, 400, 1.22) : null;
      return { wt: wt, lab: lab, ket: ket, h: Math.max(wt.h, lab.h + (ket ? ket.h + 3 : 0)) + 16, i: i };
    });
    var H2 = M * 2 + rows.reduce(function (a, r) { return a + r.h; }, 0);
    return {
      h: H2, draw: function (c) {
        c.strokeStyle = ACC[0]; c.lineWidth = 4; c.beginPath(); c.moveTo(lx, M); c.lineTo(lx, H2 - M); c.stroke();
        var y = M;
        rows.forEach(function (r) {
          var col = ACC[r.i % ACC.length];
          c.fillStyle = '#fff'; c.strokeStyle = col; c.lineWidth = 3.5; c.beginPath(); c.arc(lx, y + 12, 9, 0, Math.PI * 2); c.fill(); c.stroke();
          drawBlock(c, r.wt, M, y + 2, col, 'right', lx - M - 22);
          drawBlock(c, r.lab, txtX, y + 2, INK);
          if (r.ket) drawBlock(c, r.ket, txtX, y + 4 + r.lab.h, MUTED);
          y += r.h;
        });
      }
    };
  }

  function layoutKolom(ctx, spec) {
    var its = items(spec, 4);
    var n = Math.max(1, its.length), gap = 16, bw = (W - 2 * M - (n - 1) * gap) / n;
    var cols = its.map(function (it, i) {
      var lab = textBlock(ctx, it.label, bw - 22, 16.5, 700);
      var det = bullets(ctx, it.rincian.length ? it.rincian : it.ket ? [it.ket] : [], bw - 24, 14);
      return { lab: lab, det: det, hh: lab.h + 16, i: i };
    });
    var H = M * 2 + Math.max.apply(null, cols.map(function (c) { return c.hh + c.det.h + 20; }));
    return {
      h: H, draw: function (c) {
        cols.forEach(function (cl) {
          var x = M + cl.i * (bw + gap), col = ACC[cl.i % ACC.length];
          box(c, x, M, bw, H - 2 * M, FILL[cl.i % FILL.length], col, 12);
          c.save(); rr(c, x, M, bw, cl.hh, 12); c.clip(); c.fillStyle = col; c.fillRect(x, M, bw, cl.hh); c.restore();
          drawBlock(c, cl.lab, x + 11, M + 8, '#fff', 'center', bw - 22);
          drawBullets(c, cl.det, x + 12, M + cl.hh + 10, col);
        });
      }
    };
  }

  var LAYOUTS = { peta_konsep: layoutPeta, alur: layoutAlur, siklus: layoutSiklus, hierarki: layoutHierarki, piramida: layoutPiramida, kuadran: layoutKuadran, garis_waktu: layoutWaktu, perbandingan: layoutKolom };

  D.normalizeType = function (t) {
    t = String(t || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (LAYOUTS[t]) return t;
    if (/peta|mind|konsep/.test(t)) return 'peta_konsep';
    if (/alur|proses|flow|tahap|langkah/.test(t)) return 'alur';
    if (/siklus|cycle|daur/.test(t)) return 'siklus';
    if (/hierarki|struktur|tree|organisasi/.test(t)) return 'hierarki';
    if (/piramida|pyramid|tingkat/.test(t)) return 'piramida';
    if (/kuadran|matriks|swot|matrix/.test(t)) return 'kuadran';
    if (/waktu|timeline|sejarah|kronologi/.test(t)) return 'garis_waktu';
    if (/banding|compare|tabel/.test(t)) return 'perbandingan';
    return t === 'tidak_ada' || t === 'none' || !t ? '' : 'peta_konsep';
  };

  D.isRenderable = function (spec) {
    if (!spec) return false;
    var t = D.normalizeType(spec.jenis);
    var n = items(spec, 8).length;
    return !!t && n >= (t === 'perbandingan' ? 2 : 2);
  };

  /* render(spec) -> {dataUrl, w, h} | null */
  D.render = function (spec, opts) {
    if (!D.isRenderable(spec)) return null;
    opts = opts || {};
    var type = D.normalizeType(spec.jenis);
    var scale = opts.scale || SCALE;
    var meas = document.createElement('canvas').getContext('2d');
    var lay = LAYOUTS[type](meas, spec);
    var h = Math.ceil(lay.h);
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(h * scale);
    var c = cv.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, h);
    c.lineJoin = 'round'; c.lineCap = 'round';
    lay.draw(c);
    return { dataUrl: cv.toDataURL('image/png'), w: W, h: h, type: type };
  };

  /* Teks Arab -> gambar (untuk PDF dengan font standar) */
  D.renderArabic = function (text, widthPt, sizePt) {
    var scale = 3, w = Math.round(widthPt), size = sizePt || 18;
    var meas = document.createElement('canvas').getContext('2d');
    var f = size + 'px "Traditional Arabic", "Amiri", "Noto Naskh Arabic", "Arial", serif';
    meas.font = f;
    var words = U.oneLine(text).split(' '), lines = [], cur = '';
    words.forEach(function (wd) { var t = cur ? cur + ' ' + wd : wd; if (meas.measureText(t).width > w - 8 && cur) { lines.push(cur); cur = wd; } else cur = t; });
    if (cur) lines.push(cur);
    var lh = size * 1.7, h = Math.ceil(lines.length * lh + 6);
    var cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    var c = cv.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.font = f; c.fillStyle = '#111'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.textAlign = 'right';
    lines.forEach(function (ln, i) { c.fillText(ln, w - 4, 3 + i * lh + lh / 2); });
    return { dataUrl: cv.toDataURL('image/png'), w: w, h: h };
  };
})(window);
