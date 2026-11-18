# Aplikasi Konversi RPS ke Modul Pembelajaran — IAIN Parepare

Aplikasi ini mengubah **Rencana Pembelajaran Semester (RPS)** berformat PDF atau Microsoft Word menjadi **Modul Pembelajaran Mata Kuliah** siap pakai. Hasilnya berupa berkas **PDF** dan **Word (.docx) yang dapat diedit**, dengan cover memuat nama Fakultas, Program Studi, Mata Kuliah, dan logo IAIN Parepare. Panjang modul otomatis disesuaikan menjadi **25–35 halaman**.

Aplikasi dipakai sebagai **aplikasi Android (APK) yang bekerja offline**: seluruh pembacaan RPS dan penyusunan modul berlangsung di perangkat, tanpa server. Versi **Windows (EXE)** dengan fitur yang sama juga tersedia bila diperlukan.

## Fitur utama

| Bagian | Isi |
|---|---|
| Identitas modul | Fakultas, Program Studi, Dosen Pengampu, Semester, SKS, Tahun Akademik, Mata Kuliah, Kode. Diisi manual dan menjadi acuan cover serta isi; nama dosen/ketua prodi yang tertulis di RPS diabaikan. |
| Unggah RPS | PDF berteks, Word `.docx`, dan `.doc` (terbatas). Maksimal 30 MB. PDF hasil pindaian (gambar) memerlukan mesin AI Claude. |
| Pembacaan RPS | Otomatis membaca identitas mata kuliah, CPL, CPMK, deskripsi, bahan kajian, pustaka, dan tabel rencana mingguan (termasuk UTS/UAS). Hasilnya dapat ditinjau dan diedit. |
| Isi tiap pertemuan | Tujuan pembelajaran, konsep, teori, praktik (dengan contoh), bagan/visual yang relevan, rangkuman, panduan tugas beserta kriteria penilaian, latihan, dan referensi dari pustaka RPS. Bahasa akademik. |
| Dokumen | Cover, kata pengantar, daftar isi, pendahuluan (deskripsi, CPL/CPMK, petunjuk), bab per pertemuan, penutup, daftar pustaka. PDF + Word (daftar isi Word dapat diperbarui). |
| Penyimpanan | Proyek tersimpan otomatis di perangkat dan dapat disimpan/dibuka sebagai berkas `.json`. |

## Mesin penulis isi

1. **Template (offline)** — selalu tersedia tanpa internet; menyusun kerangka modul dan panduan belajar dari isi RPS.
2. **AI Claude (opsional, perlu internet)** — kualitas akademik terbaik. Memakai API key Anthropic milik dosen sendiri (diisi di Pengaturan). Model bawaan **Claude Opus 5.5** (pilihan: Sonnet 5.5, Haiku 5.5). Fitur *server-side fallback* Anthropic aktif untuk Opus/Sonnet 5.5, sehingga permintaan yang ditolak pengaman model dialihkan otomatis ke model cadangan.
3. **AI lokal (opsional, versi Windows)** — Ollama atau LM Studio yang berjalan di komputer sendiri.

Isi yang dihasilkan AI **wajib ditelaah dan disunting dosen** sebelum dipakai dalam perkuliahan.

## Mulai cepat

- **Dosen**: dari ponsel, buka [tautan unduh APK terbaru](https://github.com/tajibarani132-source/Modulpembelajaran/releases/latest/download/Modul-RPS-IAIN-Parepare.apk), pasang, lalu ikuti lima langkah di layar. Lihat [PANDUAN-PENGGUNA.md](PANDUAN-PENGGUNA.md).
- **Membangun APK/EXE**: APK dibangun otomatis oleh GitHub Actions di repositori [tajibarani132-source/Modulpembelajaran](https://github.com/tajibarani132-source/Modulpembelajaran). Lihat [PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md).

## Struktur folder

```
app/        Isi aplikasi (HTML/CSS/JS tanpa build) — dipakai APK dan EXE
  js/       util, extract (baca PDF/Word), parse (urai RPS), diagram, template,
            ai, docmodel, pdf, docx, app (antarmuka)
  vendor/   pdf.js, mammoth, pdfmake (+ font Times), JSZip, SDK Anthropic (bundel)
mobile/     Proyek Capacitor untuk APK Android (dibangun di GitHub Actions)
desktop/    Pembungkus Electron untuk EXE Windows (opsional)
.github/    Alur kerja GitHub Actions: build APK Android
tools/      Alat pengembang: build vendor, server uji lokal (khusus pengembangan)
dist/       Hasil build EXE (tidak disimpan di repositori)
```

## Lisensi pustaka pihak ketiga

| Pustaka | Versi | Lisensi |
|---|---|---|
| pdf.js (`pdfjs-dist`) | 3.11.174 | Apache-2.0 |
| mammoth | 1.13.0 | BSD-2-Clause |
| pdfmake | 0.2.23 | MIT |
| JSZip | 3.10.1 | MIT atau GPL-3.0 (dipakai di bawah MIT) |
| Anthropic TypeScript SDK (`@anthropic-ai/sdk`) | 1.4.0 | Apache-2.0 |
| Capacitor (`@capacitor/*`) | 8.x | MIT |
| Electron | 45.2.2 | MIT |
| electron-builder | 26.18.1 | MIT |

Sumber dan sidik SHA-256 berkas vendor tercatat di `app/vendor/VERSIONS.txt`.

## Privasi

- Berkas RPS dan modul diproses serta disimpan di perangkat pengguna; aplikasi tidak memakai server.
- Isi RPS hanya dikirim ke layanan AI bila dosen memilih mesin AI Claude (langsung ke Anthropic) atau AI lokal.
- API key Anthropic hanya disimpan di perangkat pengguna.
