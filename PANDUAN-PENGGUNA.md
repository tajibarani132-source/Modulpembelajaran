# Panduan Pengguna (Dosen)

Panduan ini menjelaskan cara membuat Modul Pembelajaran Mata Kuliah dari RPS dengan aplikasi **Konversi RPS ke Modul Pembelajaran — IAIN Parepare**. Panduan ini untuk aplikasi Android (APK) yang bekerja offline; versi Windows (EXE) memiliki tampilan dan langkah yang sama.

## Memasang aplikasi

1. Dari ponsel, buka tautan unduh APK terbaru: https://github.com/tajibarani132-source/Modulpembelajaran/releases/latest/download/Modul-RPS-IAIN-Parepare.apk (tanpa login). Daftar semua versi ada di halaman [Releases](https://github.com/tajibarani132-source/Modulpembelajaran/releases).
2. Buka berkas APK di ponsel. Bila diminta, izinkan **Instal aplikasi tidak dikenal** untuk aplikasi pembuka berkas (mis. Berkas/Chrome). Di ponsel Samsung yang baru, matikan dulu **Auto Blocker** (Setelan › Keamanan dan privasi) bila pemasangan diblokir.
3. Buka aplikasi **Modul RPS IAIN Parepare**. Semua langkah berjalan di ponsel tanpa server dan tanpa internet.

Aplikasi dapat dipasang di Android 7.0 atau yang lebih baru. Untuk memperbarui, pasang APK versi baru di atas versi lama: akun dan proyek yang tersimpan tetap ada. Bila Android menolak pemasangan (mis. *Aplikasi tidak terinstal* atau *paket bentrok dengan paket yang ada*), lihat baris terakhir tabel **Pemecahan masalah**. Hal ini biasanya hanya terjadi sekali, saat beralih dari versi uji ke versi rilis.

## Masuk ke aplikasi (login)

- **Tampilan login**: aplikasi dibuka dengan ruangan gelap dan sebuah lampu berdiri. Sesaat kemudian lampu menyala sendiri dan kartu login muncul di bawah cahayanya. Anda juga dapat mengetuk **tali lampu**, atau menariknya ke bawah, untuk menyalakannya lebih cepat. Ketuk atau tarik sekali lagi untuk memadamkan; kartu login ikut tersembunyi sampai lampu dinyalakan kembali. Bila perangkat diatur untuk mengurangi animasi, lampu langsung menyala tanpa animasi.
- **Pertama kali dibuka**, aplikasi meminta Anda **membuat akun**: username (3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung) dan kata sandi (minimal 8 karakter). Akun hanya tersimpan di perangkat itu; setiap HP atau laptop memiliki akunnya sendiri.
- **Setiap kali aplikasi dibuka**, masukkan username dan kata sandi. Login berlaku sampai aplikasi ditutup. Huruf besar/kecil pada username tidak dibedakan.
- Setelah 5 kali salah, aplikasi meminta Anda menunggu 30 detik sebelum mencoba lagi.
- **Keluar**: tombol di kanan atas (ikon pintu), atau **Pengaturan › Akun › Keluar dari aplikasi**.
- **Ubah kata sandi**: **Pengaturan › Akun**, isi kata sandi saat ini dan kata sandi baru.
- **Lupa kata sandi**: aplikasi tidak memakai server, jadi kata sandi tidak dapat dipulihkan. Ketuk **Lupa kata sandi?** di halaman login untuk mengatur ulang: akun **beserta proyek dan pengaturan** di perangkat itu dihapus, lalu Anda membuat akun baru. Berkas PDF, Word, dan proyek (.json) yang sudah disimpan di luar aplikasi tidak ikut terhapus. Karena itu, simpan proyek penting sebagai berkas .json secara berkala.

Login adalah gerbang masuk aplikasi agar orang lain yang meminjam perangkat tidak dapat membuka pekerjaan Anda; data di dalam perangkat tidak dienkripsi.

## Gambaran singkat

Aplikasi bekerja dalam lima langkah berurutan:

1. **Identitas Modul** — isi data modul.
2. **Unggah RPS** — pilih berkas RPS, aplikasi membacanya.
3. **Tinjau Struktur RPS** — periksa daftar pertemuan dan data RPS.
4. **Buat Modul** — pilih mesin penulis lalu buat isi tiap pertemuan.
5. **Unduh Modul** — unduh PDF dan Word.

Proyek tersimpan otomatis di perangkat. Bila Anda menutup aplikasi, proyek terakhir dipulihkan setelah Anda login kembali.

## Langkah 1 — Identitas Modul

Isi kolom bertanda bintang: **Fakultas, Program Studi, Dosen Pengampu, Semester, SKS**, dan **Nama Mata Kuliah**. Tahun Akademik dan Kode Mata Kuliah bersifat opsional.

- Isian ini menjadi acuan **cover** dan isi modul. Nama dosen pengampu dan ketua program studi yang tercantum di dalam RPS **diabaikan**.
- Bila fakultas tidak ada di daftar, pilih **Lainnya (ketik sendiri)**.
- Sebagian kolom (mata kuliah, kode, SKS, semester, fakultas, prodi) dapat terisi otomatis dari RPS bila masih kosong. Selalu periksa kembali.

## Langkah 2 — Unggah RPS

1. Seret berkas ke kotak unggah atau klik **pilih berkas**. Format: **PDF**, **Word (.docx)**, atau **.doc** lama (pembacaan terbatas). Ukuran maksimal 30 MB.
2. Aplikasi langsung membaca berkas. Bila AI lokal sudah diatur (versi Windows), centang **Gunakan AI lokal untuk membaca RPS** agar pembacaan lebih akurat untuk RPS dengan tata letak tidak biasa.
3. Status di bawah kotak unggah menunjukkan mata kuliah dan jumlah pertemuan materi yang terbaca.

Catatan:

- **PDF hasil pindaian (gambar)** tidak memiliki teks sehingga tidak dapat dibaca. Unggah versi .docx-nya atau PDF berteks (mis. dicetak ulang dari SIAKAD), atau isi pertemuan secara manual di langkah 3.
- Bila tabel rencana mingguan tidak terbaca lengkap, aplikasi menyusun daftar pertemuan dari daftar Bahan Kajian dan memberi peringatan.

## Langkah 3 — Tinjau Struktur RPS

- Periksa **Deskripsi mata kuliah, CPL, CPMK,** dan **Daftar pustaka** (satu butir per baris). Isian ini dipakai di bab Pendahuluan dan Daftar Pustaka modul.
- Tabel **pertemuan** berisi kolom Minggu, Jenis, Judul materi, dan Sub-CPMK. Hanya baris berjenis **Materi** yang menjadi bab modul; **Orientasi** (kontrak kuliah), **UTS**, dan **UAS** tidak dibuatkan bab.
- Ubah judul yang kurang tepat, tambahkan baris dengan **+ Tambah pertemuan**, atau hapus baris dengan tombol ✕.

## Langkah 4 — Buat Modul

### Memilih mesin

| Mesin | Kapan dipakai | Kebutuhan |
|---|---|---|
| **Template (offline)** | Selalu tersedia; kerangka modul dan panduan belajar dari isi RPS | — |
| **AI lokal** | Versi Windows: uraian ditulis AI di laptop sendiri, tanpa internet, data tidak keluar dari laptop | Ollama/LM Studio terpasang di laptop |

Keterangan di bawah setiap pilihan menunjukkan apakah mesin itu **Siap**. Bila AI lokal tidak tersedia (misalnya di ponsel), pilih **Template**: modul tetap tersusun lengkap, lalu uraiannya dapat dilengkapi di Word.

### Pilihan modul

- **Target halaman** (25–50, bawaan 32). Ukuran huruf dan spasi disesuaikan otomatis agar jumlah halaman mendekati target. Bila isinya tidak cukup panjang (mis. mesin Template dengan sedikit pertemuan), hasilnya bisa lebih pendek dan aplikasi memberi saran.
- **Sertakan soal latihan**, **Sertakan rangkuman**, dan **Sertakan gambar visual** (bagan) per pertemuan.
- **Tampilkan nama dosen di cover**.
- **Setiap pertemuan dimulai di halaman baru** (bila tidak dicentang, bab mengalir dan berganti halaman hanya bila perlu).

### Membuat isi

Klik **Buat Modul**. Daftar pertemuan menunjukkan kemajuan tiap bab (menunggu, sedang ditulis, selesai, gagal).

- **Hentikan** menghentikan proses; isi yang sudah selesai tetap tersimpan.
- Bila ada pertemuan gagal: klik **Ulangi yang gagal**, atau **Isi yang gagal dengan template** lalu lanjutkan.
- Tombol **Lihat** menampilkan isi satu pertemuan; tombol **↻** menulis ulang satu pertemuan.

Setelah semua pertemuan selesai, dokumen PDF dan Word disusun otomatis.

## Langkah 5 — Unduh Modul

- **Unduh PDF** dan **Unduh Word (.docx)**. Di Android, pilih aplikasi untuk menyimpan atau membagikan berkas.
- **Pratinjau PDF** menampilkan PDF di dalam aplikasi (tidak tersedia di Android).
- **Susun ulang dokumen** membuat ulang PDF/Word dari isi yang sama, misalnya setelah mengubah pilihan.
- Status menampilkan jumlah halaman, ukuran huruf, dan spasi yang dipakai. Bila hasilnya jauh dari target (lebih dari ±10%, minimal ±3 halaman), ikuti saran yang muncul (ubah target halaman lalu buat ulang isi, atau matikan latihan/rangkuman).

### Menyunting di Word

Berkas Word sepenuhnya dapat diedit. Setelah menambah atau mengubah judul bab, perbarui daftar isi: klik kanan pada daftar isi › **Update Field** › **Update entire table** (atau tekan **F9**).

## Menyimpan dan membuka proyek

Menu **Proyek ▾**:

- **Simpan proyek (.json)** — menyimpan seluruh pekerjaan (identitas, hasil pembacaan RPS, isi pertemuan) ke satu berkas.
- **Buka proyek…** — melanjutkan proyek dari berkas .json.
- **Mulai proyek baru** — mengosongkan proyek di perangkat ini.

## Pengaturan

- **AI Lokal** — jenis server (Ollama atau kompatibel OpenAI), alamat, nama model, dan panjang konteks. Contoh Ollama:

  ```bash
  ollama pull qwen2.5:7b
  ```

  AI lokal ditujukan untuk versi Windows yang berjalan di laptop yang sama dengan Ollama/LM Studio.
- **Umum** — nama institusi (cover), kota (kata pengantar), dan logo cover.
- **Akun** — username yang sedang masuk, ubah kata sandi, dan keluar dari aplikasi.

## Bekerja tanpa internet

Aplikasi APK (dan EXE) tidak memerlukan internet: login, membaca RPS, menyusun isi dengan mesin **Template** atau **AI lokal**, serta membuat PDF dan Word semuanya berlangsung di perangkat.

## Integritas akademik

Isi yang ditulis AI adalah draf. Dosen wajib menelaah kebenaran konsep, teori, contoh, dan rujukan, menyesuaikannya dengan konteks perkuliahan, serta melengkapi sumber sebelum modul digunakan. Aplikasi hanya mencantumkan referensi yang terdapat pada daftar pustaka RPS.

## Pemecahan masalah

| Gejala | Penyebab dan solusi |
|---|---|
| Lupa kata sandi | Ketuk **Lupa kata sandi?** di halaman login. Akun, proyek, dan pengaturan di perangkat ini dihapus; buat akun baru, lalu buka proyek dari berkas .json bila ada. |
| "Terlalu banyak percobaan" | Kata sandi salah 5 kali. Tunggu 30 detik, lalu coba lagi. |
| "PDF ini tampaknya hasil pindaian" | PDF berupa gambar. Unggah .docx atau PDF berteks, atau isi pertemuan secara manual di langkah 3. |
| Daftar pertemuan kurang tepat | Perbaiki di langkah 3, atau (bila AI lokal tersedia) centang "Gunakan AI lokal untuk membaca RPS" lalu analisis ulang. |
| Berkas .doc tidak terbaca sempurna | Simpan ulang RPS sebagai .docx di Word, lalu unggah kembali. |
| Tidak dapat terhubung ke AI lokal | Pastikan Ollama/LM Studio berjalan di laptop yang sama (versi Windows) dan alamatnya benar. |
| Jumlah halaman jauh dari target | Ubah target halaman lalu buat ulang isi; matikan latihan/rangkuman bila terlalu panjang. Jumlah pertemuan materi yang sangat sedikit, atau isi Template, dapat membuat modul lebih pendek dari target. |
| Daftar isi Word belum sesuai | Klik kanan daftar isi › Update Field (F9). |
| Penyimpanan otomatis gagal | Memori aplikasi penuh. Simpan proyek manual (.json) lalu mulai proyek baru. |
| APK tidak mau terpasang | Izinkan "Instal aplikasi tidak dikenal" (di Samsung baru, matikan juga Auto Blocker). Bila Android menolak karena paket bentrok atau tanda tangan berbeda (mis. saat beralih dari versi uji/debug ke versi rilis): ketuk **Simpan proyek (.json)** lalu pada lembar berbagi pilih Google Drive atau aplikasi berkas, dan pastikan berkasnya tersimpan di luar aplikasi. Setelah itu hapus aplikasi lama, pasang APK baru, buat akun baru (akun lama ikut terhapus), lalu buka proyeknya lewat **Buka proyek…**. Menghapus aplikasi juga menghapus akun, proyek, dan pengaturan yang belum disimpan ke luar. |
