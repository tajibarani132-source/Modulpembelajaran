/* login.js — halaman login lokal Aplikasi Modul RPS (IAIN Parepare)
 *
 * Aplikasi ini offline tanpa server, jadi akun dibuat sendiri oleh pengguna di perangkat ini saat
 * aplikasi pertama kali dibuka. Kata sandi tidak pernah disimpan: yang disimpan hanya garam acak dan
 * hash PBKDF2-SHA-256 (Web Crypto). Login berlaku sampai aplikasi ditutup (sessionStorage).
 * Lupa kata sandi = atur ulang, yang menghapus akun beserta proyek dan pengaturan di perangkat ini,
 * sehingga data yang tersimpan tidak dapat dibuka tanpa kata sandi.
 * Catatan: ini gerbang masuk aplikasi, bukan enkripsi data. */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util, $ = U.$;
  var L = (MRP.login = {});

  var KUNCI_AKUN = 'mrp.akun', KUNCI_GAGAL = 'mrp.akun.gagal', KUNCI_SESI = 'mrp.sesi';
  var ITERASI = 200000, SANDI_MIN = 8, BATAS_GAGAL = 5, JEDA_DETIK = 30;
  var POLA_NAMA = /^[A-Za-z0-9._-]{3,32}$/;
  var siapCb = null, sudahMasuk = false, sibuk = false, terpasang = false;

  /* ---------------- kriptografi ---------------- */
  function kriptoAda() { return !!(g.crypto && g.crypto.subtle && g.crypto.getRandomValues && g.TextEncoder); }
  function keB64(buf) { return U.arrayBufferToBase64(buf); }
  function dariB64(s) { var b = atob(s), out = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
  function acak(n) { return g.crypto.getRandomValues(new Uint8Array(n)); }
  function turunkan(sandi, garam, iterasi) {
    var bahan = new g.TextEncoder().encode(String(sandi).normalize('NFC'));
    return g.crypto.subtle.importKey('raw', bahan, 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return g.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: garam, iterations: iterasi }, k, 256); })
      .then(keB64);
  }
  function samaPersis(a, b) {
    a = String(a); b = String(b);
    var beda = a.length ^ b.length;
    for (var i = 0; i < Math.min(a.length, b.length); i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return beda === 0;
  }

  /* ---------------- akun ---------------- */
  L.akun = function () {
    var a = U.store.get(KUNCI_AKUN, null);
    return a && a.nama && a.garam && a.hash && a.tanda ? a : null;
  };
  function simpanAkun(nama, sandi, lama) {
    var garam = acak(16);
    return turunkan(sandi, garam, ITERASI).then(function (h) {
      var kini = new Date().toISOString();
      var akun = {
        v: 1, nama: nama, garam: keB64(garam), hash: h, iterasi: ITERASI, alg: 'PBKDF2-SHA-256',
        tanda: keB64(acak(12)), dibuat: (lama && lama.dibuat) || kini, diubah: kini
      };
      if (!U.store.set(KUNCI_AKUN, akun)) throw new Error('Akun tidak dapat disimpan: memori perangkat penuh.');
      return akun;
    });
  }
  function cocok(akun, nama, sandi) {
    return turunkan(sandi, dariB64(akun.garam), akun.iterasi || ITERASI).then(function (h) {
      var namaOk = String(akun.nama).toLowerCase() === String(nama).trim().toLowerCase();
      return samaPersis(h, akun.hash) && namaOk;
    });
  }
  function periksaNama(n) { return POLA_NAMA.test(n) ? '' : 'Username 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung (tanpa spasi).'; }
  function periksaSandi(a, b) {
    if (String(a).length < SANDI_MIN) return 'Kata sandi minimal ' + SANDI_MIN + ' karakter.';
    if (a !== b) return 'Kedua kata sandi tidak sama.';
    return '';
  }

  /* ---------------- sesi & batas percobaan ---------------- */
  function sesiAktif(akun) { try { return !!akun && g.sessionStorage.getItem(KUNCI_SESI) === akun.tanda; } catch (e) { return false; } }
  function mulaiSesi(akun) { try { g.sessionStorage.setItem(KUNCI_SESI, akun.tanda); } catch (e) { /* tetap masuk selama halaman terbuka */ } }
  function akhiriSesi() { try { g.sessionStorage.removeItem(KUNCI_SESI); } catch (e) { /* abaikan */ } }
  function bacaGagal() { var x = U.store.get(KUNCI_GAGAL, null) || {}; return { n: x.n || 0, sampai: x.sampai || 0 }; }
  function catatGagal() {
    var x = bacaGagal();
    x.n += 1;
    if (x.n >= BATAS_GAGAL) { x.n = 0; x.sampai = Date.now() + JEDA_DETIK * 1000; }
    U.store.set(KUNCI_GAGAL, x);
    return x;
  }
  function hapusDataLokal() {
    try {
      var hapus = [];
      for (var i = 0; i < g.localStorage.length; i++) { var k = g.localStorage.key(i); if (k && k.indexOf('mrp.') === 0) hapus.push(k); }
      hapus.forEach(function (k) { g.localStorage.removeItem(k); });
    } catch (e) { /* abaikan */ }
  }

  /* ---------------- tampilan ---------------- */
  function pesan(sel, teks) { var el = $(sel); el.textContent = teks || ''; el.hidden = !teks; }
  function tombol(sel, mati, label) { var b = $(sel); b.disabled = !!mati; if (label) b.textContent = label; }
  function tampilkan(mode) {
    $('#loginScreen').hidden = false;
    document.body.classList.add('terkunci');
    $('#formMasuk').hidden = mode !== 'masuk';
    $('#formDaftar').hidden = mode !== 'daftar';
    pesan('#msgMasuk', ''); pesan('#msgDaftar', '');
    ['#inMasukSandi', '#inDaftarSandi', '#inDaftarSandi2'].forEach(function (s) { $(s).value = ''; });
    var akun = L.akun();
    if (mode === 'masuk' && akun && !$('#inMasukNama').value) $('#inMasukNama').value = akun.nama;
    var fokus = mode === 'masuk' ? ($('#inMasukNama').value ? '#inMasukSandi' : '#inMasukNama') : '#inDaftarNama';
    setTimeout(function () { var f = $(fokus); if (f) f.focus(); }, 50);
  }
  function terapkanMerek() {
    var s = U.store.get('mrp.settings', {}) || {};
    if (s.logoDataUrl) $('#loginLogo').src = s.logoDataUrl;
    if (s.institusi) $('#loginInstitusi').textContent = U.titleCase(s.institusi).replace(/\(iain\)/i, '(IAIN)');
  }
  function tampilGalat(teks) {
    $('#formMasuk').hidden = true; $('#formDaftar').hidden = true;
    pesan('#loginGalat', teks);
  }

  function masuk(akun) {
    mulaiSesi(akun);
    U.store.del(KUNCI_GAGAL);
    ['#inMasukSandi', '#inDaftarSandi', '#inDaftarSandi2'].forEach(function (s) { $(s).value = ''; });
    $('#loginScreen').hidden = true;
    document.body.classList.remove('terkunci');
    if (!sudahMasuk) { sudahMasuk = true; if (siapCb) siapCb(); }
  }

  function kirimMasuk() {
    if (sibuk) return;
    var akun = L.akun();
    if (!akun) { tampilkan('daftar'); return; }
    var sisa = Math.ceil((bacaGagal().sampai - Date.now()) / 1000);
    // Jam perangkat yang mundur (mis. baru dibetulkan) tidak boleh membuat jeda lebih lama dari JEDA_DETIK.
    if (sisa > JEDA_DETIK) { U.store.del(KUNCI_GAGAL); sisa = 0; }
    if (sisa > 0) { pesan('#msgMasuk', 'Terlalu banyak percobaan. Coba lagi dalam ' + sisa + ' detik.'); return; }
    var nama = $('#inMasukNama').value, sandi = $('#inMasukSandi').value;
    if (!nama.trim() || !sandi) { pesan('#msgMasuk', 'Isi username dan kata sandi.'); return; }
    sibuk = true; tombol('#btnMasuk', true, 'Memeriksa…'); pesan('#msgMasuk', '');
    cocok(akun, nama, sandi).then(function (ok) {
      if (ok) { masuk(akun); return; }
      var x = catatGagal();
      pesan('#msgMasuk', x.sampai > Date.now() ? 'Username atau kata sandi salah. Terlalu banyak percobaan; tunggu ' + JEDA_DETIK + ' detik.' : 'Username atau kata sandi salah.');
      $('#inMasukSandi').value = ''; $('#inMasukSandi').focus();
    }).catch(function (e) { pesan('#msgMasuk', 'Gagal memeriksa kata sandi: ' + e.message); })
      .then(function () { sibuk = false; tombol('#btnMasuk', false, 'Masuk'); });
  }

  function kirimDaftar() {
    if (sibuk) return;
    if (L.akun()) { tampilkan('masuk'); return; }
    var nama = $('#inDaftarNama').value.trim(), s1 = $('#inDaftarSandi').value, s2 = $('#inDaftarSandi2').value;
    var salah = periksaNama(nama) || periksaSandi(s1, s2);
    if (salah) { pesan('#msgDaftar', salah); return; }
    sibuk = true; tombol('#btnDaftar', true, 'Menyimpan…'); pesan('#msgDaftar', '');
    simpanAkun(nama, s1, null).then(function (akun) {
      masuk(akun);
      U.toast('Akun "' + nama + '" dibuat. Ingat kata sandinya: tanpa server, kata sandi yang terlupa tidak dapat dipulihkan.', 'ok', 8000);
    }).catch(function (e) { pesan('#msgDaftar', e.message); })
      .then(function () { sibuk = false; tombol('#btnDaftar', false, 'Buat akun dan masuk'); });
  }

  function aturUlang() {
    var ok = g.confirm('Kata sandi tidak dapat dipulihkan karena aplikasi ini tidak memakai server.\n\n' +
      'Atur ulang akan MENGHAPUS akun beserta proyek dan pengaturan yang tersimpan di aplikasi ini pada perangkat ini. ' +
      'Berkas PDF, Word, dan proyek (.json) yang sudah disimpan di luar aplikasi tidak ikut terhapus.\n\nLanjutkan?');
    if (!ok) return;
    hapusDataLokal();
    akhiriSesi();
    $('#inMasukNama').value = '';
    $('#loginLogo').src = 'img/logo-iain.png';
    tampilkan('daftar');
    U.toast('Aplikasi diatur ulang. Silakan buat akun baru.', 'ok');
  }

  /* ---------------- akun di Pengaturan ---------------- */
  function hasil(el, teks, ok) { el.textContent = teks; el.style.color = ok === true ? 'var(--ok)' : ok === false ? 'var(--err)' : ''; }
  L.isiPengaturan = function () {
    var akun = L.akun();
    $('#akunNama').textContent = akun ? akun.nama : '-';
    ['#setSandiLama', '#setSandiBaru', '#setSandiBaru2'].forEach(function (s) { $(s).value = ''; });
    hasil($('#ubahSandiResult'), '', null);
  };
  function ubahSandi() {
    var akun = L.akun(), out = $('#ubahSandiResult');
    if (!akun || sibuk) return;
    var lama = $('#setSandiLama').value, b1 = $('#setSandiBaru').value, b2 = $('#setSandiBaru2').value;
    var salah = !lama ? 'Isi kata sandi saat ini.' : periksaSandi(b1, b2);
    if (salah) { hasil(out, '✖ ' + salah, false); return; }
    sibuk = true; hasil(out, 'Memeriksa dan menyimpan…', null); $('#btnUbahSandi').disabled = true;
    cocok(akun, akun.nama, lama).then(function (ok) {
      if (!ok) throw new Error('Kata sandi saat ini salah.');
      return simpanAkun(akun.nama, b1, akun);
    }).then(function (baru) {
      mulaiSesi(baru);
      ['#setSandiLama', '#setSandiBaru', '#setSandiBaru2'].forEach(function (s) { $(s).value = ''; });
      hasil(out, '✔ Kata sandi diubah.', true);
    }).catch(function (e) { hasil(out, '✖ ' + e.message, false); })
      .then(function () { sibuk = false; $('#btnUbahSandi').disabled = false; });
  }

  L.keluar = function () {
    if (sibuk) { U.toast('Tunggu sampai proses kata sandi selesai, lalu keluar.', 'warn'); return; }
    var app = MRP.app;
    if (app && app.gen && app.gen.running && !g.confirm('Pembuatan modul sedang berjalan dan akan dihentikan. Tetap keluar?')) return;
    if (MRP.appApi && MRP.appApi.simpanSekarang) MRP.appApi.simpanSekarang();
    akhiriSesi();
    g.location.reload();
  };

  function pasang() {
    if (terpasang) return;
    terpasang = true;
    $('#formMasuk').addEventListener('submit', function (e) { e.preventDefault(); kirimMasuk(); });
    $('#formDaftar').addEventListener('submit', function (e) { e.preventDefault(); kirimDaftar(); });
    $('#btnLupa').addEventListener('click', aturUlang);
    U.$$('[data-lihat]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = $('#' + b.getAttribute('data-lihat'));
        i.type = i.type === 'password' ? 'text' : 'password';
        b.textContent = i.type === 'password' ? 'Lihat' : 'Sembunyikan';
      });
    });
    $('#btnUbahSandi').addEventListener('click', ubahSandi);
    U.$$('[data-keluar]').forEach(function (b) { b.addEventListener('click', L.keluar); });
  }

  /* Dipanggil app.js: onMasuk dijalankan sekali setelah pengguna berhasil masuk. */
  L.mulai = function (onMasuk) {
    siapCb = onMasuk;
    var jalan = function () {
      pasang();
      terapkanMerek();
      if (!kriptoAda()) {
        tampilGalat('Perangkat ini belum mendukung penyimpanan kata sandi yang aman. Perbarui Google Chrome atau Android System WebView lewat Play Store, lalu buka aplikasi lagi.');
        return;
      }
      var akun = L.akun();
      if (akun && sesiAktif(akun)) { masuk(akun); return; }
      tampilkan(akun ? 'masuk' : 'daftar');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', jalan); else jalan();
  };
})(window);
