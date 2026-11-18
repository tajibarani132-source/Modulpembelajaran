# Panduan Membangun dan Mendistribusikan Aplikasi

Aplikasi didistribusikan sebagai **APK Android** yang bekerja offline. Versi **EXE Windows** dengan isi yang sama dapat dibangun bila diperlukan. Isi aplikasi berada di folder `app/` (HTML/CSS/JS tanpa proses build) dan dipakai oleh kedua bentuk tersebut.

## 1. APK Android (GitHub Actions)

APK dibangun di **GitHub Actions**, sehingga tidak perlu Android SDK atau Java di komputer sendiri. Repositori aplikasi: [tajibarani132-source/Modulpembelajaran](https://github.com/tajibarani132-source/Modulpembelajaran).

1. Setiap *push* ke cabang `main` yang mengubah `app/` atau `mobile/` menjalankan alur **Build APK Android** secara otomatis. Alur juga dapat dijalankan manual: tab **Actions › Build APK Android › Run workflow**.
2. Setelah build berhasil (±2–5 menit), job **Terbitkan APK di GitHub Releases** membuat rilis baru (tag `v<versi>`) berisi berkas `Modul-RPS-IAIN-Parepare.apk`. Tautan berikut selalu mengarah ke APK terbaru dan dapat dibuka siapa saja tanpa login:

   https://github.com/tajibarani132-source/Modulpembelajaran/releases/latest/download/Modul-RPS-IAIN-Parepare.apk

3. Bagikan tautan itu ke dosen. Di ponsel, buka tautan, buka berkas APK yang terunduh, lalu izinkan *Instal aplikasi tidak dikenal* bila diminta.

APK juga tetap tersedia sebagai artefak **modul-rps-apk** (zip, perlu login GitHub) di halaman run selama 30 hari.

### Kunci debug

APK debug ditandatangani kunci debug yang dibuat sekali, lalu disimpan di cache GitHub Actions. Karena itu, pembaruan APK debug dapat dipasang menimpa versi lama. Sidik jari (SHA-256) kunci tersebut tampil sebagai anotasi **Sidik jari APK debug** di setiap run. Selama sidik jarinya sama, pembaruan bisa langsung dipasang.

Keterbatasannya:
- Cache yang 7 hari tidak dipakai dihapus GitHub. Setelah itu kunci berganti, sehingga aplikasi lama harus dihapus dulu sebelum versi baru dipasang.
- Cache repositori publik dapat dibaca oleh workflow *pull request* dari fork, jadi kunci debug tidak bersifat rahasia.

### APK rilis bertanda tangan

APK **debug** cocok untuk uji coba. Untuk dibagikan ke banyak dosen, buat APK **rilis bertanda tangan** dengan menambahkan *repository secrets* di **Settings › Secrets and variables › Actions**:

| Secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | berkas keystore (.jks/.p12) dalam base64 |
| `ANDROID_KEYSTORE_PASSWORD` | kata sandi keystore |
| `ANDROID_KEY_ALIAS` | alias kunci di dalam keystore |
| `ANDROID_KEY_PASSWORD` | kata sandi kunci |

Petunjuk membuat keystore ada di komentar awal `.github/workflows/build-android.yml`. Simpan keystore baik-baik: setiap pembaruan APK wajib ditandatangani dengan kunci yang sama. Bila semua *secrets* ada, artefak berisi APK rilis di samping APK debug.

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
