# Panduan Membangun dan Mendistribusikan Aplikasi

Aplikasi didistribusikan sebagai **APK Android** yang bekerja offline. Versi **EXE Windows** dengan isi yang sama dapat dibangun bila diperlukan. Isi aplikasi berada di folder `app/` (HTML/CSS/JS tanpa proses build) dan dipakai oleh kedua bentuk tersebut.

## 1. APK Android (GitHub Actions)

APK dibangun di **GitHub Actions**, sehingga tidak perlu Android SDK atau Java di komputer sendiri. Repositori aplikasi: [tajibarani132-source/Modulpembelajaran](https://github.com/tajibarani132-source/Modulpembelajaran).

1. Setiap *push* ke cabang `main` yang mengubah `app/` atau `mobile/` menjalankan alur **Build APK Android** secara otomatis. Alur juga dapat dijalankan manual: tab **Actions › Build APK Android › Run workflow**.
2. Setelah build berhasil (±2–5 menit), job **Terbitkan APK di GitHub Releases** membuat rilis baru (tag `v<versi>`) berisi berkas `Modul-RPS-IAIN-Parepare.apk`. Tautan berikut selalu mengarah ke APK terbaru dan dapat dibuka siapa saja tanpa login:

   https://github.com/tajibarani132-source/Modulpembelajaran/releases/latest/download/Modul-RPS-IAIN-Parepare.apk

3. Bagikan tautan itu ke dosen. Di ponsel, buka tautan, buka berkas APK yang terunduh, lalu izinkan *Instal aplikasi tidak dikenal* bila diminta.

APK juga tersedia sebagai artefak di halaman run selama 30 hari (zip, perlu login GitHub). Artefak **modul-rps-apk** berisi APK debug. Artefak **modul-rps-apk-rilis** berisi APK rilis bertanda tangan dan hanya ada bila *secrets* penandatanganan sudah diisi. Artefak **modul-rps-apk-belum-bertanda-tangan** hanya perantara antar-job (7 hari) dan tidak bisa dipasang; jangan dibagikan.

### Kunci debug

APK debug ditandatangani kunci debug yang dibuat sekali, lalu disimpan di cache GitHub Actions. Karena itu, pembaruan APK debug dapat dipasang menimpa versi lama. Sidik jari (SHA-256) kunci tersebut tampil sebagai anotasi **Sidik jari APK debug** di setiap run. Selama sidik jarinya sama, pembaruan bisa langsung dipasang.

Keterbatasannya:
- Cache yang 7 hari tidak dipakai dihapus GitHub. Setelah itu kunci berganti, sehingga aplikasi lama harus dihapus dulu sebelum versi baru dipasang.
- Cache repositori publik dapat dibaca oleh workflow *pull request* dari fork, jadi kunci debug tidak bersifat rahasia.

### APK rilis bertanda tangan

APK **debug** cocok untuk uji coba. Untuk dibagikan ke banyak dosen, gunakan APK **rilis bertanda tangan**. Kuncinya Anda buat dan simpan sendiri, lalu dititipkan ke GitHub sebagai *secrets* yang tidak bisa dibaca dari luar. Karena kuncinya tetap, setiap pembaruan bisa dipasang di atas versi lama.

1. Di komputer Windows, jalankan dari folder repositori:

   ```bash
   powershell -NoProfile -ExecutionPolicy Bypass -File tools/buat-kunci-rilis.ps1
   ```

   Skrip membuat keystore `rilis-modulrps.jks` di folder **Documents\Kunci APK Modul RPS** (di luar repositori) dan menampilkan sidik jari (SHA-256) sertifikatnya. Kata sandi Anda ketik sendiri; skrip tidak menyimpan maupun mengirimnya. Bila keystore sudah ada, skrip tidak menimpanya dan hanya memandu ulang pengisian *secrets*.
2. Skrip lalu memandu pengisian *repository secrets* di **Settings › Secrets and variables › Actions › New repository secret**:

   | Secret | Isi |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | isi berkas keystore dalam base64 (disalin skrip ke clipboard) |
   | `ANDROID_KEYSTORE_PASSWORD` | kata sandi keystore |
   | `ANDROID_KEY_ALIAS` | alias kunci, yaitu `modulrps` |
   | `ANDROID_KEY_PASSWORD` | opsional, hanya bila kata sandi kunci berbeda dari kata sandi keystore |

3. Jalankan build: *push* ke `main` yang mengubah `app/` atau `mobile/`, atau **Actions › Build APK Android › Run workflow**. Rilis berikutnya berisi APK rilis bertanda tangan.
4. Cocokkan sidik jari: catatan rilis (baris *Sidik jari sertifikat penanda tangan*), anotasi **Sidik jari APK rilis** di halaman run, dan `BACA-SAYA.txt` di folder kunci harus menunjukkan SHA-256 yang sama. Bila berbeda, *secrets* berasal dari keystore lain: jangan bagikan tautannya dulu.

Nilai *secret* dikirim ke setiap runner yang merujuknya, walau hanya untuk dibandingkan. Karena itu job **Build APK**, yang menjalankan kode pihak ketiga dari npm dan Gradle, sama sekali tidak merujuk *secrets*. Keberadaan *secrets* diperiksa job kecil **Periksa secrets penandatanganan**. APK rilis dibangun tanpa tanda tangan, lalu ditandatangani job **Tanda tangani APK rilis** di runner baru yang hanya memakai JDK dan `apksigner`.

Yang perlu diperhatikan:

- **Peralihan sekali saja.** Kunci APK rilis berbeda dari kunci APK debug. Dosen yang sudah memasang versi debug perlu menyimpan proyek (.json) ke luar aplikasi (pada lembar berbagi pilih mis. Google Drive), menghapus aplikasi lama, memasang versi rilis, lalu membuka kembali proyeknya dan mengisi ulang API key. Setelah itu pembaruan bisa langsung dipasang. Paling mudah, beralihlah ke APK rilis sebelum aplikasi dibagikan.
- **Cadangkan keystore dan kata sandinya** di tempat yang terpisah. Selama *secrets* di GitHub tidak dihapus atau diubah, APK tetap ditandatangani dengan benar walau salinan lokal hilang, jadi jangan hapus *secrets* itu. Di komputer lain, salin folder kunci ke Documents lebih dulu; jangan membuat kunci baru.
- **Pengaman otomatis.** Bila *secrets* hanya terisi sebagian, run gagal sebelum build dan menyebut *secret* yang kurang. Setelah APK rilis pernah terbit, job rilis menolak menerbitkan APK debug, sehingga tautan unduh tidak berganti ke APK berkunci lain. Job rilis juga menolak APK rilis yang kuncinya berbeda dari rilis sebelumnya. Run lama yang dijalankan ulang tetap diterbitkan, tetapi tidak dijadikan rilis terbaru (*Latest*), karena nomor versinya lebih kecil.
- Keystore juga bisa dibuat manual dengan `keytool -genkeypair -v -storetype PKCS12 -keystore rilis-modulrps.jks -alias modulrps -keyalg RSA -keysize 4096 -validity 10000`.

Pesan untuk dosen (contoh, kirim bersama tautan unduh):

> Unduh aplikasi Modul RPS IAIN Parepare dari tautan berikut lewat ponsel Android, buka berkasnya, lalu izinkan *Instal aplikasi tidak dikenal* bila diminta. Bila sebelumnya sudah memasang versi uji dan pemasangan ditolak, simpan proyek (.json) ke Google Drive lebih dulu, hapus aplikasi lama, lalu pasang lagi.

#### Bila build rilis gagal

Selama build rilis gagal, tidak ada yang diterbitkan: tautan unduh tetap mengarah ke APK sebelumnya. Perbaiki penyebabnya sesuai judul galat di halaman run, lalu jalankan ulang dari menu **Re-run jobs** di halaman run tersebut dengan cara di kolom terakhir:

| Judul galat | Perbaikan | Jalankan ulang |
|---|---|---|
| Secrets penandatanganan tidak lengkap | Tambahkan *secret* yang disebut di pesan. | Re-run failed jobs |
| ANDROID_KEYSTORE_BASE64 tidak sah | Jalankan lagi `tools/buat-kunci-rilis.ps1` (keystore tidak ditimpa), lalu perbarui *secret* itu lewat ikon pensil. | Re-run failed jobs (dalam 7 hari) |
| Keystore rilis tidak bisa dibuka | Perbarui `ANDROID_KEYSTORE_PASSWORD` lewat ikon pensil; ketik ulang kata sandinya dengan teliti. | Re-run failed jobs (dalam 7 hari) |
| Alias kunci tidak ditemukan | Isi `ANDROID_KEY_ALIAS` dengan `modulrps`. | Re-run failed jobs (dalam 7 hari) |
| APK rilis gagal ditandatangani | Hapus *secret* `ANDROID_KEY_PASSWORD` bila ada. | Re-run failed jobs (dalam 7 hari) |
| APK debug tidak diterbitkan | *Secrets* penandatanganan hilang; isi lagi ketiganya dari keystore yang sama. | Re-run all jobs |
| Kunci rilis berbeda dari rilis sebelumnya | *Secrets* berasal dari keystore lain. Isi ulang dari keystore lama (lihat `BACA-SAYA.txt`). Hanya bila memang sengaja, ikuti *Kunci baru (darurat)*. | Re-run all jobs (setelah membuat `KUNCI_RILIS_BARU`: Re-run failed jobs) |
| Sidik jari APK rilis tidak terbaca | Gangguan alat; jangan mengganti kunci. Bila berulang, hubungi pengembang. | Re-run all jobs |
| APK tidak ditemukan, atau APK rilis mentah tidak sesuai | Gangguan internal. Bila berulang, hubungi pengembang. | Re-run all jobs |

*Re-run failed jobs* hanya menjalankan ulang job yang gagal beserta job sesudahnya, sedangkan job yang berhasil memakai hasil lamanya. Karena itu, galat di job rilis yang diperbaiki dengan mengisi ulang *secrets* harus dijalankan dengan *Re-run all jobs*. Setelah lewat 7 hari, pakai juga *Re-run all jobs*. Cara lain yang selalu bisa dipakai: **Actions › Build APK Android › Run workflow**.

#### Kunci baru (darurat)

Ganti kunci hanya bila keystore dan *secrets*-nya benar-benar hilang atau bocor. Setiap dosen harus menghapus aplikasi lama sekali.

1. Ganti nama folder kunci lama (jangan dihapus), lalu jalankan `tools/buat-kunci-rilis.ps1` dan jawab **y** untuk membuat kunci baru.
2. Perbarui ketiga *secrets* lewat ikon pensil.
3. Di **Settings › Secrets and variables › Actions**, tab **Variables**, buat *repository variable* `KUNCI_RILIS_BARU` berisi sidik jari SHA-256 kunci baru (dari `BACA-SAYA.txt`). Tanpa variabel ini, job rilis menolak kunci yang berganti.
4. Jalankan build. Catatan rilisnya memuat petunjuk menghapus aplikasi lama sekali; beri tahu juga para dosen.

### Struktur proyek Android

- `mobile/` berisi proyek Capacitor 8 (`capacitor.config.json`, ikon di `mobile/assets/`).
- `mobile/scripts/copy-web.js` menyalin `app/` ke `mobile/www` sebelum build; folder `mobile/android` dibuat otomatis oleh alur kerja.
- Nomor versi APK = versi di `mobile/package.json` ditambah nomor run (mis. `1.2.0.5`).

## 2. EXE Windows (opsional)

Prasyarat: Windows 10/11 x64 dan Node.js 18 atau lebih baru.

```bash
cd desktop
npm install
npm run dist
```

`npm run dist` menyalin `../app` ke `desktop/app`, lalu electron-builder menghasilkan di folder `dist/`:

- `Modul-RPS-IAIN-Parepare-Setup-<versi>.exe` — pemasang,
- `Modul-RPS-IAIN-Parepare-Portable-<versi>.exe` — versi portabel tanpa pemasangan.

Build memakai Electron yang sudah terpasang oleh `npm install` (opsi `electronDist` di `desktop/package.json`), sehingga tidak mengunduh ulang paket Electron. EXE belum ditandatangani sertifikat *code signing*, sehingga Windows SmartScreen dapat menampilkan peringatan (**Info selengkapnya › Tetap jalankan**).

## 3. Memperbarui pustaka vendor

Berkas di `app/vendor/` tercatat di `app/vendor/VERSIONS.txt` (sumber dan SHA-256). Bundel SDK Anthropic dan metrik font Times dibangun ulang dengan:

```bash
cd tools
npm install
node build-vendor.js
```

Pakai versi paket yang sudah terbit cukup lama (kebijakan proyek: minimal 14 hari) dan uji ulang aplikasi setelah memperbarui.

## 4. Alat pengembang

- `node tools/serve.js 8080` — **khusus pengembangan/pengujian** di komputer sendiri: menyajikan `app/` dan contoh RPS, serta API Claude/Ollama **tiruan** untuk menguji jalur AI tanpa biaya.
- Setelah mengubah `app/`, lakukan *commit* dan *push* ke `main` agar APK baru terbangun otomatis.
