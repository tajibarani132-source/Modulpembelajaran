/* admin.js — Panel Admin Server Pusat Modul RPS */
(function () {
  'use strict';
  var API = '../api/';
  var TK = 'mrp.admin.token';
  var token = '';
  try { token = sessionStorage.getItem(TK) || localStorage.getItem(TK) || ''; } catch (e) { token = ''; }
  var me = null, cfg = null, data = { users: [], modules: [], settings: null, models: [] };
  var refreshTimer = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) { n = Number(n) || 0; return 'US$' + n.toFixed(n > 0 && n < 1 ? 4 : 2); }
  function num(n) { return (Number(n) || 0).toLocaleString('id-ID'); }
  function when(iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d)) return '-';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function ago(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return s + ' dtk lalu';
    if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
    return when(iso);
  }
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, kind === 'err' ? 7000 : 3500);
  }
  function setToken(t, remember) {
    token = t || '';
    try {
      sessionStorage.removeItem(TK); localStorage.removeItem(TK);
      if (token) (remember ? localStorage : sessionStorage).setItem(TK, token);
    } catch (e) { /* penyimpanan peramban tidak tersedia */ }
  }

  function api(method, path, body, raw) {
    var h = {};
    if (token) h.Authorization = 'Bearer ' + token;
    var opt = { method: method, headers: h, cache: 'no-store' };
    if (raw) { opt.body = raw; h['Content-Type'] = raw.type || 'application/octet-stream'; }
    else if (body !== undefined) { opt.body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    return fetch(API + path, opt).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (r.status === 401 && path.indexOf('auth/') !== 0 && path !== 'setup') { setToken(''); showLogin('Sesi berakhir. Silakan masuk kembali.'); }
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ('Kesalahan HTTP ' + r.status));
        return j;
      });
    });
  }
  function download(path, fallbackName) {
    return fetch(API + path, { headers: { Authorization: 'Bearer ' + token } }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.error && j.error.message) || 'Gagal mengunduh'); });
      var cd = r.headers.get('Content-Disposition') || '';
      var m = cd.match(/filename\*=UTF-8''([^;]+)/i);
      var name = m ? decodeURIComponent(m[1]) : fallbackName;
      return r.blob().then(function (b) {
        var u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* dialog formulir sederhana: fields = [{id, label, type, value, options, placeholder}] */
  function dialog(title, fields, okLabel) {
    return new Promise(function (resolve) {
      var box = $('#dlg'), body = $('#dlgBody');
      $('#dlgTitle').textContent = title;
      $('#dlgOk').textContent = okLabel || 'Simpan';
      body.innerHTML = fields.map(function (f) {
        if (f.type === 'checkbox') return '<label class="check"><input type="checkbox" data-f="' + esc(f.id) + '"' + (f.value ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
        if (f.type === 'select') return '<label class="field"><span>' + esc(f.label) + '</span><select data-f="' + esc(f.id) + '">' + f.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === f.value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
        if (f.type === 'note') return '<p class="muted small">' + esc(f.label) + '</p>';
        return '<label class="field"><span>' + esc(f.label) + '</span><input data-f="' + esc(f.id) + '" type="' + (f.type || 'text') + '" value="' + esc(f.value == null ? '' : f.value) + '" placeholder="' + esc(f.placeholder || '') + '"' + (f.required ? ' required' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') + ' autocomplete="off"></label>';
      }).join('');
      box.hidden = false;
      var first = body.querySelector('input,select'); if (first) setTimeout(function () { first.focus(); }, 30);
      function done(v) { box.hidden = true; $('#dlgForm').onsubmit = null; $('#dlgCancel').onclick = null; resolve(v); }
      $('#dlgCancel').onclick = function () { done(null); };
      $('#dlgForm').onsubmit = function (e) {
        e.preventDefault();
        var out = {};
        $$('[data-f]', body).forEach(function (el) { out[el.getAttribute('data-f')] = el.type === 'checkbox' ? el.checked : el.value; });
        done(out);
      };
    });
  }

  /* ---------------- tampilan ---------------- */
  function show(id) {
    ['#viewLogin', '#viewSetup', '#viewApp'].forEach(function (v) { $(v).hidden = v !== id; });
    $('#btnLogout').hidden = id !== '#viewApp';
  }
  function showLogin(msg) {
    clearInterval(refreshTimer);
    $('#who').textContent = '';
    show('#viewLogin');
    $('#loginMsg').textContent = msg || '';
    setTimeout(function () { $('#loginUser').focus(); }, 30);
  }
  function setBrand() {
    if (!cfg) return;
    $('#srvName').textContent = cfg.name + ' · versi ' + cfg.version;
    document.title = 'Panel Admin — ' + cfg.name;
    var logo = $('#brandLogo');
    logo.onerror = function () { logo.onerror = null; logo.src = '../img/logo-iain.png'; };
    if (cfg.logo) logo.src = '../' + cfg.logo;
  }

  function boot() {
    api('GET', 'config').then(function (c) {
      cfg = c; setBrand();
      var m = location.hash.match(/setup=([A-Za-z0-9_-]+)/);
      if (c.setupRequired) {
        show('#viewSetup');
        if (m) $('#setupToken').value = m[1];
        return;
      }
      if (!token) return showLogin();
      return api('GET', 'me').then(function (r) {
        if (r.user.role !== 'admin') { setToken(''); return showLogin('Akun ini bukan admin.'); }
        enterApp(r.user);
      }).catch(function () { showLogin(); });
    }).catch(function (e) { showLogin('Server tidak dapat dihubungi: ' + e.message); });
  }
  function enterApp(user) {
    me = user;
    $('#who').textContent = user.name + ' (' + user.username + ')';
    show('#viewApp');
    if (location.hash) history.replaceState(null, '', location.pathname);
    openTab('ringkasan');
    clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.visibilityState === 'visible' && !$('#tab-ringkasan').hidden) loadSummary();
    }, 30000);
  }

  $('#formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#loginMsg').textContent = '';
    api('POST', 'auth/login', { username: $('#loginUser').value, password: $('#loginPass').value, client: 'admin' }).then(function (r) {
      if (r.user.role !== 'admin') { $('#loginMsg').textContent = 'Akun ini bukan admin. Dosen masuk melalui aplikasi.'; setToken(r.token); api('POST', 'auth/logout').catch(function () {}); setToken(''); return; }
      setToken(r.token, $('#loginRemember').checked);
      $('#loginPass').value = '';
      enterApp(r.user);
    }).catch(function (err) { $('#loginMsg').textContent = err.message; });
  });
  $('#formSetup').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#setupMsg').textContent = '';
    if ($('#setupPass').value !== $('#setupPass2').value) { $('#setupMsg').textContent = 'Kedua kata sandi tidak sama.'; return; }
    api('POST', 'setup', { name: $('#setupName').value, username: $('#setupUser').value, password: $('#setupPass').value, setupToken: $('#setupToken').value.trim() }).then(function (r) {
      setToken(r.token, false); cfg.setupRequired = false;
      toast('Akun admin dibuat. Selamat datang!', 'ok');
      enterApp(r.user);
    }).catch(function (err) { $('#setupMsg').textContent = err.message; });
  });
  $('#btnLogout').addEventListener('click', function () {
    api('POST', 'auth/logout').catch(function () {}).then(function () { setToken(''); showLogin('Anda telah keluar.'); });
  });

  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { openTab(t.getAttribute('data-tab')); }); });
  function openTab(name) {
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    $$('.panel').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
    ({ ringkasan: loadSummary, pengguna: loadUsers, modul: loadModules, pemakaian: loadUsage, pengaturan: loadSettings, log: loadLog })[name]();
  }

  /* ---------------- ringkasan ---------------- */
  function loadSummary() {
    api('GET', 'admin/summary').then(function (s) {
      var st = [
        [s.users.active, 'Akun aktif'], [s.users.pending, 'Menunggu persetujuan'], [s.modules, 'Modul tersimpan'],
        [usd(s.usage.usd), 'Biaya AI ' + s.month], [num(s.usage.requests), 'Permintaan AI ' + s.month], [s.online.length, 'Sedang terhubung']
      ];
      $('#stats').innerHTML = st.map(function (x) { return '<div class="stat"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
      var bp = $('#badgePending'); bp.hidden = !s.users.pending; bp.textContent = s.users.pending;
      var warn = [];
      if (!s.ai) warn.push('AI pusat sedang nonaktif.');
      else if (!s.key.hasKey) warn.push('Kunci API Claude belum diatur — dosen belum dapat memakai AI pusat. Atur di tab Pengaturan.');
      if (s.users.pending) warn.push(s.users.pending + ' pendaftaran dosen menunggu persetujuan (tab Pengguna).');
      $('#keyWarn').hidden = !warn.length; $('#keyWarn').textContent = warn.join(' ');
      $('#onlineList').innerHTML = s.online.length ? '<table class="tbl"><tr><th>Pengguna</th><th>Aplikasi</th><th>Sedang</th><th>Aktif</th></tr>' + s.online.map(function (o) {
        var cl = o.client || {};
        return '<tr><td>' + esc(o.user.name) + '<div class="muted small">' + esc(o.user.username) + (o.user.prodi ? ' · ' + esc(o.user.prodi) : '') + '</div></td><td>' + esc(cl.app || '-') + (cl.version ? ' ' + esc(cl.version) : '') + '</td><td>' + esc(cl.project || cl.page || '-') + '</td><td class="small">' + esc(ago(o.seen)) + '</td></tr>';
      }).join('') + '</table>' : '<div class="empty">Tidak ada pengguna yang terhubung saat ini.</div>';
      $('#recentModules').innerHTML = s.recentModules.length ? '<table class="tbl"><tr><th>Mata kuliah</th><th>Dosen</th><th>Diperbarui</th></tr>' + s.recentModules.map(function (m) {
        return '<tr><td>' + esc(m.mataKuliah || '(tanpa judul)') + '<div class="muted small">' + esc(m.prodi || '') + '</div></td><td>' + esc(m.dosen || m.ownerName) + '</td><td class="small">' + esc(when(m.updatedAt)) + '</td></tr>';
      }).join('') + '</table>' : '<div class="empty">Belum ada modul tersimpan.</div>';
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* ---------------- pengguna ---------------- */
  var STATUS = { active: ['Aktif', 'ok'], pending: ['Menunggu', 'warn'], disabled: ['Nonaktif', 'off'] };
  function loadUsers() {
    api('GET', 'admin/users').then(function (r) { data.users = r.users; renderUsers(); }).catch(function (e) { toast(e.message, 'err'); });
  }
  function renderUsers() {
    var f = $('#userFilter').value, q = $('#userSearch').value.trim().toLowerCase();
    var list = data.users.filter(function (u) {
      if (f && u.status !== f) return false;
      return !q || (u.name + ' ' + u.username + ' ' + u.prodi + ' ' + u.fakultas).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name); });
    var pend = data.users.filter(function (u) { return u.status === 'pending'; }).length;
    var bp = $('#badgePending'); bp.hidden = !pend; bp.textContent = pend;
    $('#userTable').innerHTML = '<tr><th>Nama</th><th>Peran</th><th>Status</th><th>Prodi</th><th class="num">Kuota</th><th class="num">Pemakaian bulan ini</th><th>Masuk terakhir</th><th>Tindakan</th></tr>' +
      (list.length ? list.map(function (u) {
        var s = STATUS[u.status] || [u.status, ''];
        var quota = u.quotaUsd == null ? '<span class="muted">bawaan</span>' : (u.quotaUsd === 0 ? 'tanpa batas' : usd(u.quotaUsd));
        var acts = [];
        if (u.status === 'pending') acts.push(['approve', 'Setujui', 'btn-primary']);
        if (u.status === 'active' && u.id !== me.id) acts.push(['disable', 'Nonaktifkan', '']);
        if (u.status === 'disabled') acts.push(['enable', 'Aktifkan', '']);
        acts.push(['edit', 'Ubah', ''], ['pass', 'Reset sandi', '']);
        if (u.status === 'active') acts.push(['kick', 'Keluarkan sesi', '']);
        if (u.id !== me.id) acts.push(['del', 'Hapus', 'danger']);
        return '<tr><td><b>' + esc(u.name) + '</b><div class="muted small">' + esc(u.username) + '</div></td><td>' + (u.role === 'admin' ? '<span class="chip">Admin</span>' : 'Dosen') + '</td><td><span class="chip ' + s[1] + '">' + s[0] + '</span>' + (u.aiAllowed ? '' : '<div class="small muted">AI diblokir</div>') + '</td><td class="small">' + esc(u.prodi || '-') + (u.fakultas ? '<div class="muted">' + esc(u.fakultas) + '</div>' : '') + '</td><td class="num small">' + quota + '</td><td class="num small">' + usd(u.usage.usd) + '<div class="muted">' + num(u.usage.requests) + ' permintaan</div></td><td class="small">' + esc(when(u.lastLogin)) + '</td><td><div class="acts">' +
          acts.map(function (a) { return '<button class="btn btn-small ' + a[2] + '" data-act="' + a[0] + '" data-id="' + esc(u.id) + '">' + a[1] + '</button>'; }).join('') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">Tidak ada pengguna.</td></tr>');
  }
  $('#userFilter').addEventListener('change', renderUsers);
  $('#userSearch').addEventListener('input', renderUsers);
  $('#userTable').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var u = data.users.find(function (x) { return x.id === b.getAttribute('data-id'); }); if (!u) return;
    var act = b.getAttribute('data-act');
    var patch = function (body, msg) { return api('PATCH', 'admin/users/' + u.id, body).then(function () { toast(msg, 'ok'); loadUsers(); }).catch(function (er) { toast(er.message, 'err'); }); };
    if (act === 'approve') patch({ status: 'active' }, 'Akun ' + u.username + ' disetujui.');
    else if (act === 'disable') { if (confirm('Nonaktifkan akun ' + u.name + '? Sesi yang sedang berjalan akan diakhiri.')) patch({ status: 'disabled' }, 'Akun dinonaktifkan.'); }
    else if (act === 'enable') patch({ status: 'active' }, 'Akun diaktifkan.');
    else if (act === 'kick') api('POST', 'admin/users/' + u.id + '/logout').then(function () { toast('Semua sesi ' + u.username + ' diakhiri.', 'ok'); }).catch(function (er) { toast(er.message, 'err'); });
    else if (act === 'del') {
      if (!confirm('Hapus akun ' + u.name + ' (' + u.username + ')? Modul miliknya tetap tersimpan di bank modul. Tindakan ini tidak dapat dibatalkan.')) return;
      api('DELETE', 'admin/users/' + u.id).then(function () { toast('Akun dihapus.', 'ok'); loadUsers(); }).catch(function (er) { toast(er.message, 'err'); });
    } else if (act === 'pass') {
      dialog('Reset kata sandi: ' + u.username, [{ id: 'password', label: 'Kata sandi baru (min. 8 karakter)', type: 'text', required: true }, { type: 'note', label: 'Sampaikan kata sandi ini kepada pengguna secara langsung. Semua sesinya akan diakhiri.' }], 'Reset').then(function (v) {
        if (!v) return;
        api('POST', 'admin/users/' + u.id + '/password', { password: v.password }).then(function () { toast('Kata sandi direset.', 'ok'); }).catch(function (er) { toast(er.message, 'err'); });
      });
    } else if (act === 'edit') {
      dialog('Ubah pengguna: ' + u.username, [
        { id: 'name', label: 'Nama lengkap', value: u.name, required: true },
        { id: 'fakultas', label: 'Fakultas', value: u.fakultas },
        { id: 'prodi', label: 'Program studi', value: u.prodi },
        { id: 'role', label: 'Peran', type: 'select', value: u.role, options: [['dosen', 'Dosen'], ['admin', 'Admin']] },
        { id: 'quotaUsd', label: 'Kuota AI per bulan (US$) — kosong = bawaan, 0 = tanpa batas', type: 'number', min: 0, step: '0.5', value: u.quotaUsd == null ? '' : u.quotaUsd },
        { id: 'aiAllowed', label: 'Izinkan memakai AI pusat', type: 'checkbox', value: u.aiAllowed }
      ]).then(function (v) { if (v) patch(v, 'Data pengguna disimpan.'); });
    }
  });
  $('#btnAddUser').addEventListener('click', function () {
    dialog('Tambah pengguna', [
      { id: 'name', label: 'Nama lengkap', required: true },
      { id: 'username', label: 'Nama pengguna (huruf kecil/angka/titik)', required: true, placeholder: 'mis. ahmad.dosen' },
      { id: 'password', label: 'Kata sandi awal (min. 8 karakter)', required: true },
      { id: 'fakultas', label: 'Fakultas' },
      { id: 'prodi', label: 'Program studi' },
      { id: 'role', label: 'Peran', type: 'select', value: 'dosen', options: [['dosen', 'Dosen'], ['admin', 'Admin']] },
      { id: 'quotaUsd', label: 'Kuota AI per bulan (US$) — kosong = bawaan, 0 = tanpa batas', type: 'number', min: 0, step: '0.5' },
      { id: 'aiAllowed', label: 'Izinkan memakai AI pusat', type: 'checkbox', value: true }
    ], 'Tambah').then(function (v) {
      if (!v) return;
      api('POST', 'admin/users', v).then(function () { toast('Pengguna ' + v.username + ' dibuat.', 'ok'); loadUsers(); }).catch(function (er) { toast(er.message, 'err'); });
    });
  });

  /* ---------------- bank modul ---------------- */
  function loadModules() {
    api('GET', 'modules?scope=all').then(function (r) { data.modules = r.modules; renderModules(); }).catch(function (e) { toast(e.message, 'err'); });
  }
  function renderModules() {
    var q = $('#modSearch').value.trim().toLowerCase();
    var list = data.modules.filter(function (m) { return !q || [m.mataKuliah, m.dosen, m.ownerName, m.prodi, m.kode].join(' ').toLowerCase().indexOf(q) >= 0; });
    $('#modTable').innerHTML = '<tr><th>Mata kuliah</th><th>Dosen pengampu</th><th>Pemilik akun</th><th class="num">Halaman</th><th>Berbagi</th><th>Diperbarui</th><th>Unduh / tindakan</th></tr>' +
      (list.length ? list.map(function (m) {
        var f = m.files || {};
        return '<tr><td><b>' + esc(m.mataKuliah || '(tanpa judul)') + '</b><div class="muted small">' + esc([m.kode, m.prodi, m.semester ? 'Smt ' + m.semester : '', m.sks ? m.sks + ' SKS' : ''].filter(Boolean).join(' · ')) + '</div></td><td class="small">' + esc(m.dosen || '-') + '</td><td class="small">' + esc(m.ownerName) + '<div class="muted">' + esc(m.ownerUsername) + '</div></td><td class="num">' + esc(m.pages || '-') + '</td><td>' + (m.visibility === 'shared' ? '<span class="chip ok">Dibagikan</span>' : '<span class="chip">Pribadi</span>') + '</td><td class="small">' + esc(when(m.updatedAt)) + '</td><td><div class="acts">' +
          (f['module.pdf'] ? '<button class="btn btn-small" data-act="pdf" data-id="' + esc(m.id) + '">PDF</button>' : '') +
          (f['module.docx'] ? '<button class="btn btn-small" data-act="docx" data-id="' + esc(m.id) + '">Word</button>' : '') +
          (m.hasProject ? '<button class="btn btn-small" data-act="proj" data-id="' + esc(m.id) + '">Proyek</button>' : '') +
          '<button class="btn btn-small" data-act="share" data-id="' + esc(m.id) + '">' + (m.visibility === 'shared' ? 'Jadikan pribadi' : 'Bagikan') + '</button>' +
          '<button class="btn btn-small danger" data-act="del" data-id="' + esc(m.id) + '">Hapus</button></div></td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">Belum ada modul.</td></tr>');
  }
  $('#modSearch').addEventListener('input', renderModules);
  $('#modTable').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var m = data.modules.find(function (x) { return x.id === b.getAttribute('data-id'); }); if (!m) return;
    var act = b.getAttribute('data-act');
    if (act === 'pdf') download('modules/' + m.id + '/files/module.pdf', 'Modul.pdf');
    else if (act === 'docx') download('modules/' + m.id + '/files/module.docx', 'Modul.docx');
    else if (act === 'proj') download('modules/' + m.id + '/files/project.json', 'Proyek.json');
    else if (act === 'share') api('PUT', 'modules/' + m.id, { visibility: m.visibility === 'shared' ? 'private' : 'shared' }).then(function () { loadModules(); }).catch(function (er) { toast(er.message, 'err'); });
    else if (act === 'del') {
      if (!confirm('Hapus modul "' + (m.mataKuliah || '') + '" milik ' + m.ownerName + ' beserta berkas PDF/Word-nya? Tindakan ini tidak dapat dibatalkan.')) return;
      api('DELETE', 'modules/' + m.id).then(function () { toast('Modul dihapus.', 'ok'); loadModules(); }).catch(function (er) { toast(er.message, 'err'); });
    }
  });

  /* ---------------- pemakaian AI ---------------- */
  function loadUsage(month) {
    api('GET', 'admin/usage' + (month ? '?month=' + encodeURIComponent(month) : '')).then(function (r) {
      var sel = $('#usageMonth');
      var months = r.months.indexOf(r.month) < 0 ? [r.month].concat(r.months) : r.months;
      sel.innerHTML = months.map(function (m) { return '<option' + (m === r.month ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('');
      var tot = { requests: 0, errors: 0, input: 0, output: 0, cacheRead: 0, usd: 0 };
      r.perUser.forEach(function (u) { Object.keys(tot).forEach(function (k) { tot[k] += u[k] || 0; }); });
      $('#usageTable').innerHTML = '<tr><th>Pengguna</th><th class="num">Permintaan</th><th class="num">Gagal</th><th class="num">Token masuk</th><th class="num">Token keluar</th><th class="num">Baca cache</th><th class="num">Perkiraan biaya</th><th class="num">Kuota</th></tr>' +
        (r.perUser.length ? r.perUser.map(function (u) {
          return '<tr><td>' + esc(u.name) + '<div class="muted small">' + esc(u.username) + '</div></td><td class="num">' + num(u.requests) + '</td><td class="num">' + num(u.errors) + '</td><td class="num">' + num(u.input) + '</td><td class="num">' + num(u.output) + '</td><td class="num">' + num(u.cacheRead) + '</td><td class="num"><b>' + usd(u.usd) + '</b></td><td class="num small">' + (u.quotaUsd ? usd(u.quotaUsd) : 'tanpa batas') + '</td></tr>';
        }).join('') + '<tr><td><b>Jumlah</b></td><td class="num"><b>' + num(tot.requests) + '</b></td><td class="num">' + num(tot.errors) + '</td><td class="num">' + num(tot.input) + '</td><td class="num">' + num(tot.output) + '</td><td class="num">' + num(tot.cacheRead) + '</td><td class="num"><b>' + usd(tot.usd) + '</b></td><td></td></tr>' : '<tr><td colspan="8" class="empty">Belum ada pemakaian pada bulan ini.</td></tr>');
      $('#recentTable').innerHTML = '<tr><th>Waktu</th><th>Pengguna</th><th>Model</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Biaya</th><th class="num">Durasi</th><th>Status</th></tr>' +
        (r.recent.length ? r.recent.map(function (x) {
          return '<tr><td class="small">' + esc(when(x.t)) + '</td><td class="small">' + esc(x.username) + '</td><td class="small">' + esc(x.m) + '</td><td class="num">' + num(x.in + x.cr + x.cw) + '</td><td class="num">' + num(x.out) + '</td><td class="num">' + usd(x.usd) + '</td><td class="num small">' + Math.round((x.ms || 0) / 1000) + ' dtk</td><td class="small">' + (x.ok ? '<span class="chip ok">Berhasil</span>' : '<span class="chip off">Gagal</span><div class="muted">' + esc(x.err || '') + '</div>') + '</td></tr>';
        }).join('') : '<tr><td colspan="8" class="empty">Belum ada permintaan.</td></tr>');
    }).catch(function (e) { toast(e.message, 'err'); });
  }
  $('#usageMonth').addEventListener('change', function () { loadUsage(this.value); });

  /* ---------------- pengaturan ---------------- */
  function catalogToText(cat) {
    if (!cat) return '';
    return Object.keys(cat).map(function (f) { return f + ': ' + (cat[f] || []).join('; '); }).join('\n');
  }
  function textToCatalog(t) {
    var out = {};
    String(t || '').split('\n').forEach(function (line) {
      var i = line.indexOf(':'); if (i < 0) return;
      var f = line.slice(0, i).trim(); if (!f) return;
      out[f] = line.slice(i + 1).split(';').map(function (p) { return p.trim(); }).filter(Boolean);
    });
    return Object.keys(out).length ? out : null;
  }
  function keyState(k) {
    $('#keyState').innerHTML = k.hasKey ? '<span class="chip ok">Tersimpan ' + esc(k.keyHint) + '</span>' + (k.keySource === 'env' ? ' <span class="muted">(dari variabel lingkungan ANTHROPIC_API_KEY)</span>' : '') : '<span class="chip off">Belum diatur</span>';
    $('#btnDelKey').hidden = k.keySource !== 'panel';
  }
  function loadSettings() {
    api('GET', 'admin/settings').then(function (r) {
      var s = r.settings; data.settings = s; data.models = r.models;
      $('#sName').value = s.serverName; $('#sInst').value = s.institution; $('#sKota').value = s.kota;
      $('#sReg').value = s.registration; $('#sAnn').value = s.announcement || ''; $('#sShare').checked = !!s.sharing;
      var a = s.ai;
      $('#aEnabled').checked = !!a.enabled;
      $('#aModels').innerHTML = r.models.map(function (m) { return '<label class="check"><input type="checkbox" value="' + esc(m.id) + '"' + (a.allowedModels.indexOf(m.id) >= 0 ? ' checked' : '') + '> ' + esc(m.name) + ' <span class="muted small">' + esc(m.id) + '</span></label>'; }).join('');
      $('#aDefModel').innerHTML = r.models.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === a.defaultModel ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('');
      $('#aEffort').value = a.defaultEffort; $('#aQuota').value = a.defaultQuotaUsd; $('#aMaxTok').value = a.maxTokensCap; $('#aConc').value = a.maxConcurrent;
      $('#aPersonal').checked = a.allowPersonalKey !== false; $('#aLocal').checked = a.allowLocal !== false;
      $('#sCatalog').value = catalogToText(s.catalog);
      $('#logoPreview').src = s.logo ? '../api/assets/logo?v=' + s.logo.v : '../img/logo-iain.png';
      keyState(r); $('#keyTestMsg').textContent = ''; $('#saveMsg').textContent = '';
    }).catch(function (e) { toast(e.message, 'err'); });
  }
  $('#formSettings').addEventListener('submit', function (e) {
    e.preventDefault();
    var models = $$('#aModels input:checked').map(function (i) { return i.value; });
    if (!models.length) { toast('Pilih minimal satu model.', 'err'); return; }
    var body = {
      serverName: $('#sName').value, institution: $('#sInst').value, kota: $('#sKota').value, registration: $('#sReg').value,
      announcement: $('#sAnn').value, sharing: $('#sShare').checked, catalog: textToCatalog($('#sCatalog').value),
      ai: { enabled: $('#aEnabled').checked, allowedModels: models, defaultModel: $('#aDefModel').value, defaultEffort: $('#aEffort').value, defaultQuotaUsd: $('#aQuota').value, maxTokensCap: $('#aMaxTok').value, maxConcurrent: $('#aConc').value, allowPersonalKey: $('#aPersonal').checked, allowLocal: $('#aLocal').checked }
    };
    api('PUT', 'admin/settings', body).then(function () {
      toast('Pengaturan disimpan.', 'ok'); $('#saveMsg').textContent = '✔ Tersimpan ' + new Date().toLocaleTimeString('id-ID');
      return api('GET', 'config').then(function (c) { cfg = c; setBrand(); });
    }).catch(function (er) { toast(er.message, 'err'); });
  });
  $('#btnSaveKey').addEventListener('click', function () {
    var k = $('#aKey').value.trim(); if (!k) { toast('Isi kunci API terlebih dahulu.', 'err'); return; }
    api('PUT', 'admin/apikey', { key: k }).then(function (r) { $('#aKey').value = ''; keyState(r); toast('Kunci API disimpan di server.', 'ok'); }).catch(function (er) { toast(er.message, 'err'); });
  });
  $('#btnDelKey').addEventListener('click', function () {
    if (!confirm('Hapus kunci API dari server? Dosen tidak dapat memakai AI pusat sampai kunci baru diisi.')) return;
    api('DELETE', 'admin/apikey').then(function (r) { keyState(r); toast('Kunci API dihapus.', 'ok'); }).catch(function (er) { toast(er.message, 'err'); });
  });
  $('#btnTestKey').addEventListener('click', function () {
    var el = $('#keyTestMsg'); el.textContent = 'Menguji…'; el.className = 'small';
    api('POST', 'admin/apikey/test').then(function (r) { el.textContent = (r.ok ? '✔ ' : '✖ ') + r.message; el.className = 'small ' + (r.ok ? 'ok' : 'err'); })
      .catch(function (er) { el.textContent = '✖ ' + er.message; el.className = 'small err'; });
  });
  $('#btnLogo').addEventListener('click', function () { $('#logoFile').click(); });
  $('#logoFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    if (f.size > 2 * 1048576) { toast('Ukuran logo maksimal 2 MB.', 'err'); return; }
    api('PUT', 'admin/logo', undefined, f).then(function (r) { $('#logoPreview').src = '../' + r.logo; toast('Logo diperbarui.', 'ok'); return api('GET', 'config').then(function (c) { cfg = c; setBrand(); }); })
      .catch(function (er) { toast(er.message, 'err'); });
  });
  $('#btnLogoDel').addEventListener('click', function () {
    api('DELETE', 'admin/logo').then(function () { $('#logoPreview').src = '../img/logo-iain.png'; toast('Logo bawaan dipakai kembali.', 'ok'); return api('GET', 'config').then(function (c) { cfg = c; setBrand(); }); })
      .catch(function (er) { toast(er.message, 'err'); });
  });

  /* ---------------- log ---------------- */
  var EVT = { login: 'Masuk', login_gagal: 'Gagal masuk', daftar: 'Pendaftaran', admin_dibuat: 'Admin dibuat', pengguna_baru: 'Pengguna dibuat', pengguna_ubah: 'Pengguna diubah', pengguna_hapus: 'Pengguna dihapus', reset_sandi: 'Reset sandi', paksa_keluar: 'Sesi diakhiri', ganti_sandi: 'Ganti sandi', modul_baru: 'Modul baru', modul_hapus: 'Modul dihapus', pengaturan: 'Pengaturan', kunci_api: 'Kunci API', logo: 'Logo', ai_gagal: 'AI gagal' };
  function loadLog() {
    api('GET', 'admin/events').then(function (r) {
      $('#logTable').innerHTML = '<tr><th>Waktu</th><th>Kejadian</th><th>Pengguna</th><th>Keterangan</th><th>IP</th></tr>' +
        (r.events.length ? r.events.map(function (e) {
          return '<tr><td class="small">' + esc(when(e.t)) + '</td><td>' + esc(EVT[e.type] || e.type) + '</td><td class="small">' + esc(e.user || '-') + '</td><td class="small">' + esc(e.detail) + '</td><td class="small muted">' + esc(e.ip) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="empty">Belum ada kejadian.</td></tr>');
    }).catch(function (e) { toast(e.message, 'err'); });
  }
  $('#btnReloadLog').addEventListener('click', loadLog);

  boot();
})();
