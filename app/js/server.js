/* server.js — koneksi (opsional) ke Server Pusat Modul RPS.
   Bila terhubung: AI Claude memakai kunci milik server (dengan kuota dari admin), modul tersimpan
   di bank modul server, dan pengaturan bersama (institusi, logo, daftar fakultas/prodi,
   pengumuman) diambil dari server. Tanpa server, aplikasi tetap bekerja seperti biasa. */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var SV = (MRP.server = {});
  var KEY = 'mrp.server';
  SV.APP_VERSION = '1.1.0';
  var st = Object.assign({ url: '', token: '', autoSave: true }, U.store.get(KEY, {}) || {});
  var me = null, subs = [], hbTimer = null, logoCache = null, activity = { page: '', project: '' };

  function save() { U.store.set(KEY, { url: st.url, token: st.token, autoSave: st.autoSave }); }
  function emit() { subs.forEach(function (fn) { try { fn(SV); } catch (e) { console.warn('server', e); } }); }
  SV.onChange = function (fn) { subs.push(fn); };
  SV.url = function () { return st.url; };
  SV.base = function () { return String(st.url || '').replace(/\/+$/, ''); };
  SV.token = function () { return st.token; };
  SV.me = function () { return me; };
  SV.configured = function () { return !!st.url; };
  SV.connected = function () { return !!(st.token && me && me.user); };
  SV.aiCentral = function () { return SV.connected() && !!(me.ai && me.ai.central); };
  SV.autoSave = function (v) { if (v !== undefined) { st.autoSave = !!v; save(); } return st.autoSave !== false; };
  SV.platform = function () { return U.isNative() ? 'android' : (/Electron/i.test(navigator.userAgent) ? 'desktop' : 'web'); };

  function normUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = (/^(localhost|127\.|192\.168\.|10\.)/.test(u) ? 'http://' : 'https://') + u;
    try { var x = new URL(u); if (!/^https?:$/.test(x.protocol)) return ''; return (x.origin + x.pathname).replace(/\/+$/, ''); } catch (e) { return ''; }
  }
  SV.normUrl = normUrl;

  function api(method, path, body, opts) {
    opts = opts || {};
    var base = opts.base || SV.base();
    if (!base) return Promise.reject(new Error('Alamat server pusat belum diatur.'));
    var tok = opts.token !== undefined ? opts.token : st.token;
    var h = {};
    if (tok) h.Authorization = 'Bearer ' + tok;
    var init = { method: method, headers: h, cache: 'no-store' };
    if (opts.raw) { init.body = opts.raw; h['Content-Type'] = opts.type || 'application/octet-stream'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    if (location.protocol === 'https:' && /^http:/.test(base)) return Promise.reject(new Error('Aplikasi dibuka melalui HTTPS sehingga tidak dapat menghubungi server pusat ber-HTTP. Gunakan alamat https:// untuk server pusat.'));
    return fetch(base + '/api/' + path, init).catch(function () {
      throw new Error('Server pusat tidak dapat dihubungi (' + base + '). Periksa alamat dan koneksi internet.');
    }).then(function (r) {
      if (opts.blob) {
        if (r.ok) return r.blob();
        return r.json().catch(function () { return null; }).then(function (j) { throw new Error((j && j.error && j.error.message) || ('Server pusat: kesalahan ' + r.status)); });
      }
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (r.status === 401 && tok && path.indexOf('auth/') !== 0) SV.expire();
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || ('Server pusat: kesalahan ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  SV.api = api;

  SV.probe = function (url) {
    var base = normUrl(url);
    if (!base) return Promise.reject(new Error('Alamat server tidak valid. Contoh: https://modul.iainpare.ac.id'));
    return api('GET', 'config', undefined, { base: base, token: '' }).then(function (c) {
      if (!c || c.server !== 'modul-rps') throw new Error('Alamat tersebut bukan Server Pusat Modul RPS.');
      c.base = base;
      return c;
    });
  };
  /* aplikasi yang dibuka dari server pusat itu sendiri langsung mengenali alamatnya */
  SV.detect = function () {
    if (st.url || !/^https?:$/.test(location.protocol) || U.isNative()) return Promise.resolve(st.url);
    var base = new URL('.', location.href).href.replace(/\/+$/, '');
    return fetch(base + '/api/config', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c && c.server === 'modul-rps') { st.url = base; save(); emit(); } return st.url; })
      .catch(function () { return st.url; });
  };
  SV.publicConfig = function () { return st.url ? SV.probe(st.url) : Promise.resolve(null); };

  SV.login = function (url, username, password) {
    return SV.probe(url).then(function (c) {
      return api('POST', 'auth/login', { username: username, password: password, client: SV.platform() }, { base: c.base, token: '' }).then(function (r) {
        st.url = c.base; st.token = r.token; logoCache = null; save();
        return SV.refresh();
      });
    });
  };
  SV.register = function (url, data) {
    return SV.probe(url).then(function (c) { return api('POST', 'auth/register', data, { base: c.base, token: '' }); });
  };
  SV.logout = function () {
    var p = st.token ? api('POST', 'auth/logout').catch(function () { /* abaikan */ }) : Promise.resolve();
    return p.then(function () { st.token = ''; me = null; logoCache = null; save(); stopHeartbeat(); emit(); });
  };
  SV.forget = function () { return SV.logout().then(function () { st.url = ''; save(); emit(); }); };
  SV.expire = function () {
    if (!st.token) return;
    st.token = ''; me = null; save(); stopHeartbeat(); emit();
    U.toast('Sesi server pusat berakhir. Masuk kembali di Pengaturan › Server Pusat.', 'warn', 7000);
  };
  SV.refresh = function () {
    if (!st.token || !st.url) { me = null; emit(); return Promise.resolve(null); }
    return api('GET', 'me').then(function (r) { me = r; startHeartbeat(); emit(); return r; })
      .catch(function (e) { emit(); throw e; });
  };
  SV.changePassword = function (oldPassword, newPassword) { return api('POST', 'me/password', { oldPassword: oldPassword, newPassword: newPassword }); };

  /* detak jantung: admin melihat siapa yang sedang memakai aplikasi; pengumuman & kuota ikut diperbarui */
  SV.setActivity = function (page, project) { activity.page = page || activity.page; if (project !== undefined) activity.project = project; };
  function beat() {
    if (!SV.connected() || (document.visibilityState && document.visibilityState !== 'visible')) return;
    api('POST', 'heartbeat', { app: SV.platform(), version: SV.APP_VERSION, page: activity.page, project: activity.project }).then(function (r) {
      if (!me) return;
      var changed = JSON.stringify(me.ai) !== JSON.stringify(r.ai) || (me.server && me.server.announcement) !== r.announcement;
      me.ai = r.ai; if (me.server) me.server.announcement = r.announcement;
      if (changed) emit();
    }).catch(function () { /* offline sesaat: dicoba lagi */ });
  }
  function startHeartbeat() { if (!hbTimer) { hbTimer = setInterval(beat, 60000); setTimeout(beat, 1500); } }
  function stopHeartbeat() { clearInterval(hbTimer); hbTimer = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') beat(); });

  /* model yang dipakai lewat server pusat harus termasuk daftar yang diizinkan admin */
  SV.pickModel = function (model) {
    if (!SV.aiCentral()) return model;
    var list = me.ai.models || [];
    return list.indexOf(model) >= 0 ? model : (me.ai.defaultModel || list[0] || model);
  };

  SV.logoDataUrl = function () {
    if (!SV.connected() || !me.logo) return Promise.resolve(null);
    if (logoCache && logoCache.src === me.logo) return Promise.resolve(logoCache.data);
    return fetch(SV.base() + '/' + me.logo, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('logo'); return r.blob(); })
      .then(U.readAsDataURL).then(function (d) { logoCache = { src: me.logo, data: d }; return d; })
      .catch(function () { return null; });
  };

  /* ---------- bank modul ---------- */
  SV.listModules = function (scope) { return api('GET', 'modules?scope=' + encodeURIComponent(scope || 'mine')).then(function (r) { return r.modules || []; }); };
  SV.getModule = function (id) { return api('GET', 'modules/' + encodeURIComponent(id)); };
  SV.setVisibility = function (id, vis) { return api('PUT', 'modules/' + encodeURIComponent(id), { visibility: vis }); };
  SV.deleteModule = function (id) { return api('DELETE', 'modules/' + encodeURIComponent(id)); };
  SV.downloadFile = function (id, name) { return api('GET', 'modules/' + encodeURIComponent(id) + '/files/' + name, undefined, { blob: true }); };
  /* simpan proyek + PDF + Word; mengembalikan meta modul (id disimpan di proyek agar pembaruan menimpa entri yang sama) */
  SV.saveModule = function (project, meta, files) {
    var id = project.serverId;
    var body = { project: project, meta: meta };
    var p = id
      ? api('PUT', 'modules/' + encodeURIComponent(id), body).catch(function (e) { if (e.status === 404) return api('POST', 'modules', body); throw e; })
      : api('POST', 'modules', body);
    return p.then(function (r) {
      var mod = r.module;
      var chain = Promise.resolve(mod);
      (files || []).forEach(function (f) {
        if (!f.blob) return;
        chain = chain.then(function () { return api('PUT', 'modules/' + encodeURIComponent(mod.id) + '/files/' + f.name, undefined, { raw: f.blob, type: f.type }); }).then(function (x) { mod = x.module; return mod; });
      });
      return chain;
    });
  };
})(window);
