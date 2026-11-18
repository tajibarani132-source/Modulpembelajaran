# Panduan Pemasangan dan Distribusi (untuk Staf TI)

Dokumen ini menjelaskan cara menerbitkan aplikasi web, memasang PWA, membangun EXE Windows dan APK Android, serta memasang **Server Pusat** di server kampus/VPS.

## 1. Aplikasi web (online)

Folder `app/` adalah situs statis (HTML/CSS/JS) tanpa proses build. Pilihan penerbitan:

1. **Melalui Server Pusat (disarankan)** — Server Pusat sudah menyajikan `app/` di alamat utamanya. Lihat bagian 5.
2. **Server web kampus** — salin seluruh isi `app/` ke folder situs (Apache/Nginx/IIS). Pastikan tipe MIME `.webmanifest` = `application/manifest+json` dan `.js` = `application/javascript`.
3. **GitHub Pages** — alur `.github/workflows/deploy-pages.yml` menerbitkan `app/` setiap ada perubahan di cabang `main`. Aktifkan sekali: *Settings › Pages › Source: GitHub Actions*.
4. **Hosting statis lain** (Netlify, Cloudflare Pages, dll.) — unggah folder `app/` apa adanya.

Gunakan **HTTPS**. Tanpa HTTPS, mode offline (service worker) dan pemasangan PWA tidak aktif, dan peramban dapat memblokir koneksi ke layanan lain.

## 2. PWA (offline dari peramban)

Setelah situs dibuka sekali melalui HTTPS, berkas aplikasi tersimpan di peramban (`app/sw.js`). Pengguna dapat memasangnya:

- **Laptop (Chrome/Edge)**: ikon *Pasang* di bilah alamat, atau menu › *Pasang aplikasi*.
- **Android (Chrome)**: menu › *Tambahkan ke layar utama* / *Instal aplikasi*.

Setiap kali berkas di `app/` berubah, naikkan `VERSION` di `app/sw.js` agar perangkat pengguna mengambil versi terbaru.

## 3. Aplikasi Windows (EXE)

Prasyarat: Windows 10/11 x64 dan Node.js 18 atau lebih baru.

```bash
cd desktop
npm install
npm run dist
```

`npm run dist` menyalin `../app` ke `desktop/app`, lalu electron-builder menghasilkan di folder `dist/`:

- `Modul-RPS-IAIN-Parepare-Setup-<versi>.exe` — pemasang (pengguna dapat memilih folder; pintasan desktop dibuat),
- `Modul-RPS-IAIN-Parepare-Portable-<versi>.exe` — versi portabel tanpa pemasangan.

Untuk mencoba tanpa membangun: `npm start` di folder `desktop`.

Build memakai Electron yang sudah terpasang oleh `npm install` di `desktop/node_modules/electron/dist` (opsi `electronDist` di `desktop/package.json`), sehingga electron-builder tidak mengunduh ulang paket Electron (~110 MB) setiap kali build.

Catatan:

- EXE belum ditandatangani sertifikat *code signing*, sehingga Windows SmartScreen dapat menampilkan peringatan. Pengguna memilih **Info selengkapnya › Tetap jalankan**. Untuk distribusi luas, tandatangani EXE dengan sertifikat milik institusi.
- Aplikasi desktop berjalan sepenuhnya offline. Untuk terhubung ke Server Pusat, pengguna mengisi alamat server di **Pengaturan › Server Pusat**.

## 4. Aplikasi Android (APK)

APK dibangun di **GitHub Actions**, sehingga tidak perlu Android SDK/Java di komputer sendiri.

1. Unggah folder proyek ke repositori GitHub (privat juga bisa).
2. Buka tab **Actions › Build APK Android › Run workflow** (juga berjalan otomatis bila `app/` atau `mobile/` berubah di cabang `main`).
3. Setelah selesai, unduh artefak **modul-rps-apk** dari halaman run.
4. Pasang APK di Android: buka berkasnya dan izinkan *Instal aplikasi tidak dikenal* bila diminta.

APK **debug** cocok untuk uji coba. Untuk dibagikan ke dosen, buat APK **rilis bertanda tangan** dengan menambahkan *repository secrets* `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, dan `ANDROID_KEY_PASSWORD` (petunjuk membuat keystore ada di komentar awal `.github/workflows/build-android.yml`). Simpan keystore baik-baik: pembaruan APK wajib memakai kunci yang sama.

Alternatif tanpa GitHub: terbitkan versi web (HTTPS), lalu buka [pwabuilder.com](https://www.pwabuilder.com), masukkan alamat situs, dan unduh paket Android yang dihasilkan.

Pada Android, Server Pusat harus diakses melalui **HTTPS**.

## 5. Server Pusat

Server Pusat (`server/`) adalah aplikasi Node.js tanpa basis data terpisah: semua data disimpan sebagai berkas di satu folder data. Server ini menyajikan aplikasi web (`app/`), Panel Admin (`/admin/`), API akun/modul, dan proksi AI Claude. Panduan pemakaian panel: [PANDUAN-ADMIN-SERVER.md](PANDUAN-ADMIN-SERVER.md).

### 5.1 Uji cepat di komputer sendiri

```bash
cd server
npm install
npm start
```

Buka `http://localhost:8090/admin/#setup=…` sesuai alamat yang tercetak di konsol.

### 5.2 VPS Ubuntu/Debian dengan skrip otomatis (disarankan)

1. Buat paket rilis di komputer pengembang (folder `server/` harus sudah `npm install`):

   ```bash
   node deploy/buat-paket.js
   ```

   Hasilnya `release/modul-rps-server-<versi>.tar.gz` (berisi aplikasi web, server beserta dependensinya, dan skrip pemasang) dan berkas `.sha256`.
2. Arahkan **DNS record A** domain/subdomain ke IP publik VPS, dan buka port **80** dan **443** di firewall penyedia VPS.
3. Unggah dan pasang (sebagai root):

   ```bash
   scp release/modul-rps-server-1.1.0.tar.gz root@IP_VPS:/root/
   ssh root@IP_VPS
   tar -xzf modul-rps-server-1.1.0.tar.gz && cd modul-rps-server-1.1.0
   bash deploy/install.sh --domain modul.kampus.ac.id --email admin@kampus.ac.id
   ```

Skrip `deploy/install.sh` memasang Node.js 24 LTS (dari repositori resmi NodeSource bila paket sistem terlalu lama), layanan systemd `modul-rps` yang hanya mendengar di `127.0.0.1`, **Caddy dengan HTTPS otomatis** (Let's Encrypt), membuka port 80/443 bila ufw aktif, memasang **cadangan harian** data ke `/var/backups/modul-rps` (14 hari), lalu menampilkan alamat penyiapan admin. Menjalankan ulang skrip dengan paket baru memperbarui aplikasi tanpa mengubah data; tiga versi terakhir disimpan di `/opt/modul-rps/releases`. Petunjuk ringkas ada di `deploy/README-VPS.md` di dalam paket, dan semua pilihan dapat dilihat dengan `bash deploy/install.sh --help`.

Skrip ini diuji dengan `bash deploy/test/uji-install.sh` (perintah sistem ditiru, server dijalankan sungguhan).

### 5.3 Server Linux manual (systemd + Nginx + HTTPS)

1. Pasang Node.js LTS, lalu salin folder `app/` dan `server/` ke, misalnya, `/opt/modul-rps/`.
2. Buat akun sistem dan folder data:

   ```bash
   sudo useradd --system --home /opt/modul-rps --shell /usr/sbin/nologin modulrps
   sudo mkdir -p /var/lib/modul-rps && sudo chown modulrps: /var/lib/modul-rps && sudo chmod 700 /var/lib/modul-rps
   cd /opt/modul-rps/server && sudo npm install --omit=dev
   ```

3. Buat layanan `/etc/systemd/system/modul-rps.service`:

   ```ini
   [Unit]
   Description=Server Pusat Modul RPS
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=modulrps
   WorkingDirectory=/opt/modul-rps/server
   ExecStart=/usr/bin/node server.js --host 127.0.0.1 --port 8090 --data /var/lib/modul-rps --trust-proxy 1
   Restart=on-failure
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now modul-rps
   sudo journalctl -u modul-rps -n 30   # menampilkan alamat penyiapan admin pertama
   ```

4. Nginx sebagai proksi balik (streaming AI tidak boleh di-*buffer*; unggahan modul dapat mencapai puluhan MB):

   ```nginx
   server {
       server_name modul.kampus.ac.id;
       client_max_body_size 100m;
       location / {
           proxy_pass http://127.0.0.1:8090;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_http_version 1.1;
           proxy_buffering off;
           proxy_read_timeout 1200s;
           proxy_send_timeout 1200s;
       }
   }
   ```

   Aktifkan HTTPS, misalnya dengan `sudo certbot --nginx -d modul.kampus.ac.id`.

   Alternatif **Caddy** (HTTPS otomatis):

   ```
   modul.kampus.ac.id {
       request_body {
           max_size 100MB
       }
       reverse_proxy 127.0.0.1:8090 {
           flush_interval -1
       }
   }
   ```

### 5.4 Server Windows

Jalankan `node server.js --port 8090 --data D:\modul-rps-data` dari folder `server`. Agar berjalan otomatis sebagai layanan, gunakan pengelola layanan seperti NSSM atau *Task Scheduler* (pemicu *At startup*), buka port di Windows Firewall, dan gunakan proksi balik (IIS ARR/Caddy) atau `--cert`/`--key` untuk HTTPS.

### 5.5 Pemeliharaan

- **Cadangan**: salin folder data secara berkala (lihat PANDUAN-ADMIN-SERVER.md bagian 7).
- **Pembaruan aplikasi**: ganti isi `app/` dan `server/` dengan versi baru (folder data jangan ditimpa), jalankan `npm install --omit=dev` di `server/`, lalu mulai ulang layanan.
- **Uji otomatis**: `cd server && npm test` menjalankan uji ujung-ke-ujung memakai layanan Claude tiruan (tanpa biaya, tanpa internet).

## 6. Memperbarui pustaka vendor

Berkas di `app/vendor/` tercatat di `app/vendor/VERSIONS.txt` (sumber dan SHA-256). Bundel SDK Anthropic dan metrik font Times dibangun ulang dengan:

```bash
cd tools
npm install
node build-vendor.js
```

Pakai versi paket yang sudah terbit cukup lama (kebijakan proyek: minimal 14 hari) dan uji ulang aplikasi setelah memperbarui.

## 7. Alat pengembang

- `node tools/serve.js 8080` — **khusus pengembangan/pengujian**: menyajikan `app/` dan contoh RPS, serta API Claude/Ollama **tiruan** untuk menguji jalur AI tanpa biaya. Jangan dipakai untuk produksi. Pada `localhost`, service worker hanya aktif bila alamat diberi `?sw=1`.
- `server/test/smoke.js` — uji Server Pusat (lihat 5.5).
