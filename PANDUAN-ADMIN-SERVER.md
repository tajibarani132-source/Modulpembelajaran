# Panduan Admin Server Pusat

**Server Pusat** menghubungkan semua pengguna aplikasi Modul RPS ke satu server yang Anda kendalikan. Dari **Panel Admin**, Anda:

- membuat, menyetujui, menonaktifkan, dan menghapus **akun dosen**;
- menyimpan **kunci API Claude** di server sehingga dosen tidak memerlukan kunci sendiri, lalu menetapkan **model yang diizinkan** dan **kuota biaya per dosen per bulan**;
- melihat dan mengunduh semua **modul** yang disimpan dosen (proyek, PDF, Word) serta mengatur **bank modul bersama**;
- mengatur **institusi, kota, logo cover, daftar fakultas/prodi**, dan **pengumuman** untuk semua pengguna;
- memantau **pengguna yang sedang terhubung**, **pemakaian AI**, dan **log kejadian**.

Server ini juga menyajikan aplikasi web itu sendiri, sehingga dosen cukup membuka alamat server di peramban.

## 1. Kebutuhan

- Komputer/VPS/server kampus dengan **Node.js 18.17 atau lebih baru** (disarankan versi LTS terbaru).
- Koneksi internet keluar ke `api.anthropic.com` (untuk AI Claude).
- Untuk dipakai dari luar jaringan: nama domain dan **HTTPS** (lihat [PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md) bagian Server Pusat). HTTPS wajib bila aplikasi web dibuka dari alamat HTTPS atau dari APK Android.

## 2. Memasang dan menjalankan

Untuk **VPS Ubuntu/Debian**, cara termudah adalah skrip pemasang otomatis yang sekaligus menyiapkan HTTPS, layanan sistem, dan cadangan harian: lihat [PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md) bagian 5.2. Untuk mencoba di komputer sendiri:

```bash
cd server
npm install
npm start
```

Konsol menampilkan alamat aplikasi, panel admin, dan folder data, misalnya:

```
Server Pusat Modul RPS 1.0.0 berjalan di http://localhost:8090
  Aplikasi   : http://localhost:8090/
  Panel admin: http://localhost:8090/admin/
  Folder data: …/server/data
```

### Pilihan menjalankan

Setiap pilihan dapat diberikan sebagai argumen atau variabel lingkungan:

| Argumen | Variabel lingkungan | Bawaan | Keterangan |
|---|---|---|---|
| `--port` | `PORT` | `8090` | Port HTTP/HTTPS |
| `--host` | `HOST` | `0.0.0.0` | Alamat yang didengarkan (`127.0.0.1` bila di belakang proksi balik) |
| `--data` | `DATA_DIR` | `server/data` | Folder data (akun, modul, kunci, log) |
| `--app` | `APP_DIR` | `../app` | Folder aplikasi web yang disajikan |
| `--origins` | `ALLOWED_ORIGINS` | `*` | Asal (origin) yang boleh memanggil API, dipisah koma |
| `--trust-proxy` | `TRUST_PROXY` | `0` | Isi `1` bila di belakang Nginx/Caddy agar alamat IP pengguna tercatat benar |
| `--cert`, `--key` | `TLS_CERT`, `TLS_KEY` | – | Berkas sertifikat dan kunci untuk HTTPS langsung tanpa proksi balik |

Kunci API Anthropic juga dapat diberikan lewat variabel lingkungan `ANTHROPIC_API_KEY`; kunci yang diisi di panel admin lebih diutamakan.

## 3. Penyiapan pertama: membuat akun admin

Saat pertama dijalankan, server mencetak alamat sekali pakai:

```
Belum ada akun admin. Buka alamat berikut untuk membuatnya (sekali pakai):
http://localhost:8090/admin/#setup=XXXXXXXX…
```

Buka alamat itu, isi nama, nama pengguna, dan kata sandi (minimal 8 karakter), lalu **Buat akun admin**. Kode penyiapan juga tersimpan di `data/setup-token.txt` dan otomatis dihapus setelah admin dibuat. Tanpa kode ini, tidak ada orang lain yang dapat membuat akun admin.

## 4. Panel Admin

Buka `https://alamat-server/admin/` dan masuk dengan akun admin. Sesi admin berakhir setelah 12 jam tidak aktif.

### Ringkasan

Jumlah akun aktif, pendaftaran yang menunggu, modul tersimpan, biaya dan jumlah permintaan AI bulan ini, **pengguna yang sedang terhubung** (beserta jenis aplikasi dan mata kuliah yang sedang dikerjakan), dan modul terbaru. Peringatan muncul bila kunci API belum diatur atau ada pendaftaran yang perlu disetujui.

### Pengguna

- **+ Tambah pengguna**: nama, nama pengguna, kata sandi awal, fakultas, prodi, peran (Dosen/Admin), kuota, dan izin AI.
- **Setujui** pendaftaran mandiri dosen (bila pendaftaran dibuka).
- **Ubah**: nama, fakultas, prodi, peran, kuota, izin memakai AI pusat.
- **Reset sandi**, **Keluarkan sesi** (memaksa keluar dari semua perangkat), **Nonaktifkan/Aktifkan**, **Hapus** (modul miliknya tetap tersimpan).
- Admin terakhir tidak dapat diturunkan, dinonaktifkan, atau dihapus.

### Bank Modul

Semua modul yang disimpan dosen: mata kuliah, dosen pengampu, pemilik akun, jumlah halaman, status berbagi, dan waktu pembaruan. Unduh **PDF**, **Word**, atau berkas **Proyek** (.json), ubah status **Bagikan/Jadikan pribadi**, atau **Hapus**.

### Pemakaian AI

Per bulan: jumlah permintaan, kegagalan, token masukan/keluaran, baca cache, **perkiraan biaya** per dosen, dan kuotanya, ditambah daftar permintaan terakhir. Perkiraan memakai tarif resmi per juta token; tagihan sebenarnya tercantum di konsol Anthropic.

### Pengaturan

- **Umum**: nama server, nama institusi (cover modul), kota (kata pengantar), **pendaftaran** (dosen mendaftar sendiri lalu disetujui admin, atau tertutup), **pengumuman** untuk semua pengguna, dan izin **berbagi modul**.
- **AI Claude terpusat**:
  - **Kunci API Anthropic** — buat di [platform.claude.com](https://platform.claude.com/), tempel, **Simpan kunci**, lalu **Uji**. Kunci hanya disimpan di folder data server dan ditampilkan tersamar (`…abcd`). Seluruh biaya ditagihkan ke akun Anthropic pemilik kunci.
  - **Model yang diizinkan** dan **model bawaan** (Claude Opus 5.5, Sonnet 5.5, Haiku 5.5).
  - **Batas biaya per dosen per bulan** (US$; 0 = tanpa batas). Batas khusus per dosen dapat diatur di tab Pengguna.
  - **Batas token keluaran per permintaan** dan **permintaan bersamaan per dosen**.
  - Izinkan dosen memakai **kunci API pribadi** bila AI pusat tidak tersedia, dan izinkan **AI lokal**.
- **Daftar fakultas dan program studi**: satu baris per fakultas, `Nama Fakultas: Prodi A; Prodi B`. Kosongkan untuk memakai daftar bawaan aplikasi.
- **Logo cover modul**: PNG/JPEG maksimal 2 MB; menjadi logo bawaan cover semua dosen yang terhubung (dosen tetap dapat memilih logo sendiri).

### Log

Kejadian penting: masuk dan gagal masuk (dengan alamat IP), pendaftaran, perubahan pengguna, reset sandi, modul baru/dihapus, perubahan pengaturan, kunci API, logo, dan kegagalan AI.

## 5. Cara kerja AI melalui server

Aplikasi dosen yang terhubung mengirim permintaan AI ke `…/api/ai/v1/messages` di server Anda dengan token sesi dosen. Server:

1. memeriksa sesi, izin AI, dan **kuota** dosen;
2. hanya meneruskan parameter yang dipakai aplikasi (model, pesan, sistem, penalaran, format keluaran) dan **menolak** parameter lain seperti *tools*;
3. membatasi model sesuai daftar yang diizinkan dan token keluaran sesuai batas;
4. meneruskan ke Anthropic memakai **kunci server** melalui SDK resmi Anthropic (streaming), termasuk fitur *server-side fallback* untuk Opus/Sonnet 5.5;
5. mencatat pemakaian token dan perkiraan biaya per dosen.

Kunci Anthropic tidak pernah dikirim ke perangkat dosen.

## 6. Keamanan

- Gunakan **HTTPS** untuk akses dari internet (proksi balik Nginx/Caddy atau `--cert/--key`).
- Kata sandi disimpan sebagai hash *scrypt*; token sesi disimpan sebagai hash. Percobaan masuk berulang dibatasi otomatis.
- Lindungi **folder data**: berisi `secret.json` (kunci API), akun, sesi, dan modul. Batasi hak akses folder itu hanya untuk akun yang menjalankan server.
- Gunakan kata sandi admin yang kuat dan unik; cabut akun yang tidak dipakai.
- Panel admin memakai *Content-Security-Policy* ketat; jangan menyajikannya lewat domain yang juga memuat konten pihak lain.
- Perbarui Node.js secara berkala.

## 7. Cadangan dan pemulihan

Seluruh data ada di satu folder (bawaan `server/data`):

| Berkas/folder | Isi |
|---|---|
| `users.json` | akun dan hash kata sandi |
| `settings.json` | pengaturan server |
| `secret.json` | kunci API Anthropic |
| `sessions.json` | sesi aktif |
| `modules.json`, `modules/` | daftar dan berkas modul (proyek, PDF, Word) |
| `usage.jsonl`, `usage-summary.json` | catatan dan ringkasan pemakaian AI |
| `events.jsonl` | log kejadian |
| `logo.png`/`logo.jpg` | logo cover dari admin |

**Cadangkan** dengan menyalin folder itu (sebaiknya saat server berhenti, atau setiap hari dengan alat cadangan server). **Pulihkan** dengan menyalinnya kembali lalu menjalankan server dengan `--data` menunjuk folder tersebut.

## 8. Menghubungkan aplikasi

- **Web**: dosen cukup membuka alamat server (mis. `https://modul.kampus.ac.id/`); aplikasi mengenali server secara otomatis.
- **EXE Windows dan APK Android**: buka **Pengaturan › Server Pusat**, isi alamat server (HTTPS), lalu masuk.
- Situs web lain yang menyajikan aplikasi (mis. GitHub Pages) juga dapat terhubung dengan mengisi alamat server. Batasi asal yang diizinkan dengan `--origins` bila perlu.

## 9. Pemecahan masalah

| Gejala | Solusi |
|---|---|
| Dosen melihat "Kunci API Claude belum diatur admin" | Isi kunci di Pengaturan › AI Claude terpusat, lalu **Uji**. |
| Uji kunci gagal (401) | Kunci salah atau dicabut; buat kunci baru di platform.claude.com. |
| Uji kunci gagal (koneksi) | Server tidak dapat menghubungi `api.anthropic.com`; periksa internet/firewall/proksi keluar. |
| Dosen terkena "Kuota AI bulan ini habis" | Naikkan kuota dosen di tab Pengguna (Ubah) atau batas bawaan di Pengaturan. Kuota dihitung per bulan kalender. |
| Aplikasi web HTTPS tidak dapat terhubung ke server | Server harus diakses dengan HTTPS juga (peramban memblokir HTTP dari halaman HTTPS). |
| Lupa kata sandi admin | Admin lain dapat mereset. Bila tidak ada admin lain: hentikan server, salin cadangan `users.json`, hapus entri admin tersebut dari `users.json`, lalu jalankan server; bila tidak tersisa admin aktif, server mencetak alamat penyiapan baru. |
| Port sudah dipakai | Jalankan dengan `--port` lain. |
