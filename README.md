# Aplikasi Konversi RPS ke Modul Pembelajaran — IAIN Parepare

Aplikasi ini mengubah **Rencana Pembelajaran Semester (RPS)** berformat PDF atau Microsoft Word menjadi **Modul Pembelajaran Mata Kuliah** siap pakai. Hasilnya berupa berkas **PDF** dan **Word (.docx) yang dapat diedit**, dengan cover memuat nama Fakultas, Program Studi, Mata Kuliah, dan logo IAIN Parepare. Panjang modul otomatis disesuaikan menjadi **25–35 halaman**.

Aplikasi dapat dipakai:

- **online** melalui situs web,
- **offline** sebagai PWA (dipasang dari peramban),
- sebagai **aplikasi Windows (EXE)**,
- sebagai **aplikasi Android (APK)**,
- dan dapat **terhubung ke satu Server Pusat** yang dikendalikan admin.

## Fitur utama

| Bagian | Isi |
|---|---|
| Identitas modul | Fakultas, Program Studi, Dosen Pengampu, Semester, SKS, Tahun Akademik, Mata Kuliah, Kode. Diisi manual dan menjadi acuan cover serta isi; nama dosen/ketua prodi yang tertulis di RPS diabaikan. |
| Unggah RPS | PDF (berteks; PDF hasil pindaian perlu AI Claude), Word `.docx`, dan `.doc` (terbatas). Maksimal 30 MB. |
| Pembacaan RPS | Otomatis membaca identitas mata kuliah, CPL, CPMK, deskripsi, bahan kajian, pustaka, dan tabel rencana mingguan (termasuk UTS/UAS). Opsional dibantu AI. Hasilnya dapat ditinjau dan diedit. |
| Isi tiap pertemuan | Tujuan pembelajaran, konsep, teori, praktik (dengan contoh), bagan/visual yang relevan, rangkuman, panduan tugas beserta kriteria penilaian, latihan, dan referensi dari pustaka RPS. Bahasa akademik. |
| Dokumen | Cover, kata pengantar, daftar isi, pendahuluan (deskripsi, CPL/CPMK, petunjuk), bab per pertemuan, penutup, daftar pustaka. PDF + Word (daftar isi Word dapat diperbarui). |
| Server Pusat (opsional) | Akun dosen, kunci API Claude disimpan di server dengan kuota per dosen, bank modul bersama, pengaturan bersama (institusi, logo, daftar fakultas/prodi, pengumuman), dan pemantauan pengguna yang terhubung. |

## Mesin penulis isi

1. **AI Claude (online)** — kualitas akademik terbaik. Model bawaan **Claude Opus 5.5** (pilihan lain: Sonnet 5.5, Haiku 5.5). Memakai API key Anthropic milik dosen, **atau** kunci milik Server Pusat bila aplikasi terhubung ke server. Fitur *server-side fallback* Anthropic diaktifkan untuk Opus/Sonnet 5.5 sehingga permintaan yang ditolak pengaman model otomatis dialihkan ke model cadangan.
2. **AI lokal (offline di laptop)** — Ollama atau LM Studio/server kompatibel OpenAI di komputer sendiri.
3. **Template (offline)** — tanpa AI; menyusun kerangka modul dan panduan belajar dari isi RPS.

Isi yang dihasilkan AI **wajib ditelaah dan disunting dosen** sebelum dipakai dalam perkuliahan.

## Mulai cepat

**Dosen** — buka alamat web yang dibagikan admin, atau pasang EXE/APK, lalu ikuti lima langkah di layar. Lihat [PANDUAN-PENGGUNA.md](PANDUAN-PENGGUNA.md).

**Admin Server Pusat** — di komputer/server yang memiliki Node.js 18.17 atau lebih baru:

```bash
cd server
npm install
npm start
```

Lalu buka alamat yang tercetak di konsol (`/admin/#setup=…`) untuk membuat akun admin pertama. Lihat [PANDUAN-ADMIN-SERVER.md](PANDUAN-ADMIN-SERVER.md).

**Pasang di VPS Ubuntu/Debian dengan HTTPS otomatis** — buat paket lalu jalankan skrip pemasang di VPS:

```bash
node deploy/buat-paket.js
```

```bash
bash deploy/install.sh --domain modul.kampus.ac.id --email admin@kampus.ac.id
```

Rinciannya di [PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md) bagian 5.2.

**Staf TI** — hosting web, PWA, pembuatan EXE dan APK, serta pemasangan Server Pusat di VPS/server kampus: [PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md).

## Struktur folder

```
app/        Aplikasi web statis (HTML/CSS/JS tanpa build) — dipakai web, PWA, EXE, dan APK
  js/       util, server (koneksi Server Pusat), extract (baca PDF/Word), parse (urai RPS),
            diagram, template, ai, docmodel, pdf, docx, app (antarmuka)
  vendor/   pdf.js, mammoth, pdfmake (+ font Times), JSZip, SDK Anthropic (bundel)
server/     Server Pusat (Node.js): API, proksi Claude, bank modul, panel admin (server/admin)
desktop/    Pembungkus Electron untuk EXE Windows
mobile/     Proyek Capacitor untuk APK Android (dibangun di GitHub Actions)
deploy/     Paket rilis & skrip pemasang VPS (Node.js, systemd, Caddy HTTPS, cadangan harian)
release/    Paket rilis hasil deploy/buat-paket.js (tidak perlu disimpan di repositori)
.github/    Alur kerja GitHub Actions: build APK dan publikasi GitHub Pages
tools/      Alat pengembang: build vendor, server uji lokal (khusus pengembangan)
dist/       Hasil build EXE (tidak perlu disimpan di repositori)
```

## Lisensi pustaka pihak ketiga

| Pustaka | Versi | Lisensi |
|---|---|---|
| pdf.js (`pdfjs-dist`) | 3.11.174 | Apache-2.0 |
| mammoth | 1.13.0 | BSD-2-Clause |
| pdfmake | 0.2.23 | MIT |
| JSZip | 3.10.1 | MIT atau GPL-3.0 (dipakai di bawah MIT) |
| Anthropic TypeScript SDK (`@anthropic-ai/sdk`) | 1.4.0 | Apache-2.0 |
| Electron | 45.2.2 | MIT |
| electron-builder | 26.18.1 | MIT |
| Capacitor (`@capacitor/*`) | 8.x | MIT |

Sumber dan sidik SHA-256 berkas vendor tercatat di `app/vendor/VERSIONS.txt`.

## Privasi

- Berkas RPS diproses di perangkat pengguna. Isi RPS hanya dikirim ke layanan AI yang dipilih pengguna (Anthropic, AI lokal, atau Server Pusat yang meneruskannya ke Anthropic).
- API key pribadi hanya disimpan di perangkat pengguna. Kunci Server Pusat hanya disimpan di server dan tidak pernah dikirim ke perangkat dosen.
- Server Pusat menyimpan akun, modul yang disimpan dosen, catatan pemakaian AI, dan log kejadian di folder datanya sendiri.
