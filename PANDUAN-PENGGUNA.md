# Panduan Pengguna (Dosen)

Panduan ini menjelaskan cara membuat Modul Pembelajaran Mata Kuliah dari RPS dengan aplikasi **Konversi RPS ke Modul Pembelajaran — IAIN Parepare**. Panduan ini untuk aplikasi Android (APK) yang bekerja offline; versi Windows (EXE) memiliki tampilan dan langkah yang sama.

## Memasang aplikasi

1. Unduh berkas APK dari pengelola aplikasi (artefak **modul-rps-apk** pada GitHub Actions repositori aplikasi).
2. Buka berkas APK di ponsel. Bila diminta, izinkan **Instal aplikasi tidak dikenal** untuk aplikasi pembuka berkas (mis. Berkas/Chrome).
3. Buka aplikasi **Modul RPS IAIN Parepare**. Semua langkah berjalan di ponsel tanpa server; internet hanya diperlukan bila Anda memakai mesin AI Claude.

Untuk memperbarui, pasang APK versi baru di atas versi lama (proyek yang tersimpan tetap ada).

## Gambaran singkat

Aplikasi bekerja dalam lima langkah berurutan:

1. **Identitas Modul** — isi data modul.
2. **Unggah RPS** — pilih berkas RPS, aplikasi membacanya.
3. **Tinjau Struktur RPS** — periksa daftar pertemuan dan data RPS.
4. **Buat Modul** — pilih mesin penulis lalu buat isi tiap pertemuan.
5. **Unduh Modul** — unduh PDF dan Word.

Proyek tersimpan otomatis di perangkat. Bila Anda menutup aplikasi, proyek terakhir dipulihkan saat aplikasi dibuka kembali.

## Langkah 1 — Identitas Modul

Isi kolom bertanda bintang: **Fakultas, Program Studi, Dosen Pengampu, Semester, SKS**, dan **Nama Mata Kuliah**. Tahun Akademik dan Kode Mata Kuliah bersifat opsional.

- Isian ini menjadi acuan **cover** dan isi modul. Nama dosen pengampu dan ketua program studi yang tercantum di dalam RPS **diabaikan**.
- Bila fakultas tidak ada di daftar, pilih **Lainnya (ketik sendiri)**.
- Sebagian kolom (mata kuliah, kode, SKS, semester, fakultas, prodi) dapat terisi otomatis dari RPS bila masih kosong. Selalu periksa kembali.

## Langkah 2 — Unggah RPS

1. Seret berkas ke kotak unggah atau klik **pilih berkas**. Format: **PDF**, **Word (.docx)**, atau **.doc** lama (pembacaan terbatas). Ukuran maksimal 30 MB.
2. Aplikasi langsung membaca berkas. Centang **Gunakan AI untuk membaca RPS** agar pembacaan dibantu AI bila mesin AI tersedia (lebih akurat untuk RPS dengan tata letak tidak biasa).
3. Status di bawah kotak unggah menunjukkan mata kuliah dan jumlah pertemuan materi yang terbaca.

Catatan:

- **PDF hasil pindaian (gambar)** tidak memiliki teks. Gunakan mode AI Claude (AI dapat membaca gambar PDF) atau unggah versi .docx-nya.
- Bila tabel rencana mingguan tidak terbaca lengkap, aplikasi menyusun daftar pertemuan dari daftar Bahan Kajian dan memberi peringatan.

## Langkah 3 — Tinjau Struktur RPS

- Periksa **Deskripsi mata kuliah, CPL, CPMK,** dan **Daftar pustaka** (satu butir per baris). Isian ini dipakai di bab Pendahuluan dan Daftar Pustaka modul.
- Tabel **pertemuan** berisi kolom Minggu, Jenis, Judul materi, dan Sub-CPMK. Hanya baris berjenis **Materi** yang menjadi bab modul; **Orientasi** (kontrak kuliah), **UTS**, dan **UAS** tidak dibuatkan bab.
- Ubah judul yang kurang tepat, tambahkan baris dengan **+ Tambah pertemuan**, atau hapus baris dengan tombol ✕.

## Langkah 4 — Buat Modul

### Memilih mesin

| Mesin | Kapan dipakai | Kebutuhan |
|---|---|---|
| **Template (offline)** | Selalu tersedia tanpa internet; kerangka modul dan panduan belajar dari isi RPS | — |
| **AI Claude (perlu internet)** | Kualitas akademik terbaik | Internet dan API key Anthropic pribadi |
| **AI lokal** | Versi Windows: tanpa internet, data tidak keluar dari laptop | Ollama/LM Studio terpasang di laptop |

Keterangan di bawah setiap pilihan menunjukkan apakah mesin itu **Siap**. Tanpa internet atau tanpa API key, pilih **Template**: modul tetap tersusun lengkap 25–35 halaman, lalu uraiannya dapat dilengkapi di Word.

### Pilihan modul

- **Target halaman** (25–35, bawaan 32). Ukuran huruf dan spasi disesuaikan otomatis agar jumlah halaman masuk rentang 25–35.
- **Sertakan soal latihan**, **Sertakan rangkuman**, dan **Sertakan gambar visual** (bagan) per pertemuan.
- **Tampilkan nama dosen di cover**.
- **Setiap pertemuan dimulai di halaman baru** (bila tidak dicentang, bab mengalir dan berganti halaman hanya bila perlu).

### Membuat isi

Klik **Buat Modul**. Daftar pertemuan menunjukkan kemajuan tiap bab (menunggu, sedang ditulis, selesai, gagal). Beberapa pertemuan ditulis bersamaan (atur di **Pengaturan › Umum › Penulisan paralel**).

- **Hentikan** menghentikan proses; isi yang sudah selesai tetap tersimpan.
- Bila ada pertemuan gagal: klik **Ulangi yang gagal**, atau **Isi yang gagal dengan template** lalu lanjutkan.
- Tombol **Lihat** menampilkan isi satu pertemuan; tombol **↻** menulis ulang satu pertemuan.
- Untuk AI Claude, aplikasi menampilkan **perkiraan biaya** pemakaian (token dan dolar AS).

Setelah semua pertemuan selesai, dokumen PDF dan Word disusun otomatis.

## Langkah 5 — Unduh Modul

- **Unduh PDF** dan **Unduh Word (.docx)**. Di Android, pilih aplikasi untuk menyimpan atau membagikan berkas.
- **Pratinjau PDF** menampilkan PDF di dalam aplikasi (tidak tersedia di Android).
- **Susun ulang dokumen** membuat ulang PDF/Word dari isi yang sama, misalnya setelah mengubah pilihan.
- Status menampilkan jumlah halaman, ukuran huruf, dan spasi yang dipakai. Bila di luar 25–35 halaman, ikuti saran yang muncul (ubah target halaman lalu buat ulang isi, atau matikan latihan/rangkuman).

### Menyunting di Word

Berkas Word sepenuhnya dapat diedit. Setelah menambah atau mengubah judul bab, perbarui daftar isi: klik kanan pada daftar isi › **Update Field** › **Update entire table** (atau tekan **F9**).

## Menyimpan dan membuka proyek

Menu **Proyek ▾**:

- **Simpan proyek (.json)** — menyimpan seluruh pekerjaan (identitas, hasil pembacaan RPS, isi pertemuan) ke satu berkas.
- **Buka proyek…** — melanjutkan proyek dari berkas .json.
- **Mulai proyek baru** — mengosongkan proyek di perangkat ini.

## Pengaturan

- **AI Claude** — API key Anthropic (dari [platform.claude.com](https://platform.claude.com/)), pilihan model, dan tingkat penalaran. Kunci hanya disimpan di perangkat ini dan dikirim langsung ke Anthropic; biaya ditagihkan ke akun Anthropic pemilik kunci. Klik **Uji koneksi** untuk memeriksa.
- **AI Lokal** — jenis server (Ollama atau kompatibel OpenAI), alamat, nama model, dan panjang konteks. Contoh Ollama:

  ```bash
  ollama pull qwen2.5:7b
  ```

  AI lokal ditujukan untuk versi Windows yang berjalan di laptop yang sama dengan Ollama/LM Studio.
- **Umum** — nama institusi (cover), kota (kata pengantar), jumlah penulisan paralel, dan logo cover.

## Bekerja tanpa internet

- Aplikasi APK (dan EXE) selalu dapat dipakai tanpa internet: membaca RPS, menyusun isi dengan mesin **Template**, serta membuat PDF dan Word semuanya berlangsung di perangkat.
- Internet hanya diperlukan untuk mesin **AI Claude**. Label **Online/Offline** di bagian atas menunjukkan status koneksi.

## Integritas akademik

Isi yang ditulis AI adalah draf. Dosen wajib menelaah kebenaran konsep, teori, contoh, dan rujukan, menyesuaikannya dengan konteks perkuliahan, serta melengkapi sumber sebelum modul digunakan. Aplikasi hanya mencantumkan referensi yang terdapat pada daftar pustaka RPS.

## Pemecahan masalah

| Gejala | Penyebab dan solusi |
|---|---|
| "PDF ini tampaknya hasil pindaian" | PDF berupa gambar. Gunakan AI Claude untuk membaca RPS, unggah .docx, atau isi pertemuan secara manual di langkah 3. |
| Daftar pertemuan kurang tepat | Perbaiki di langkah 3, atau centang "Gunakan AI untuk membaca RPS" lalu analisis ulang. |
| Berkas .doc tidak terbaca sempurna | Simpan ulang RPS sebagai .docx di Word, lalu unggah kembali. |
| "API key belum diisi" | Isi API key di Pengaturan › AI Claude, atau pilih mesin Template. |
| "Batas penggunaan API tercapai" | Kurangi penulisan paralel di Pengaturan › Umum, tunggu sebentar, lalu klik Ulangi yang gagal. |
| Tidak dapat terhubung ke AI lokal | Pastikan Ollama/LM Studio berjalan di laptop yang sama (versi Windows) dan alamatnya benar. |
| Jumlah halaman di luar 25–35 | Ubah target halaman lalu buat ulang isi; matikan latihan/rangkuman bila terlalu panjang. Jumlah pertemuan materi yang sangat sedikit dapat membuat modul kurang dari 25 halaman. |
| Daftar isi Word belum sesuai | Klik kanan daftar isi › Update Field (F9). |
| Penyimpanan otomatis gagal | Memori aplikasi penuh. Simpan proyek manual (.json) lalu mulai proyek baru. |
| APK tidak mau terpasang | Izinkan "Instal aplikasi tidak dikenal"; bila memperbarui APK debug dan muncul konflik tanda tangan, hapus versi lama dulu (simpan proyek .json sebelumnya). |
