# Memasang Server Pusat di VPS (Ubuntu/Debian) dengan HTTPS

Paket ini berisi aplikasi web (`app/`), Server Pusat (`server/`, sudah termasuk dependensinya), dan skrip pemasang `deploy/install.sh`.

## Yang perlu disiapkan

1. **VPS** Ubuntu 22.04/24.04 atau Debian 12/13 dengan akses **root** (atau pengguna sudo). RAM 1 GB sudah cukup.
2. **Domain/subdomain**, misalnya `modul.iainpare.ac.id`, dengan **DNS record A** yang mengarah ke IP publik VPS. Untuk subdomain kampus, minta dibuatkan oleh pengelola DNS kampus.
3. **Port 80 dan 443** terbuka di firewall penyedia VPS (*security group*/*firewall* di panel penyedia). Port 80 diperlukan untuk penerbitan sertifikat Let's Encrypt.

## Langkah pemasangan

Dari komputer Anda (ganti `IP_VPS` dan nama berkas sesuai versi):

```bash
scp modul-rps-server-1.1.0.tar.gz root@IP_VPS:/root/
ssh root@IP_VPS
```

Di VPS:

```bash
tar -xzf modul-rps-server-1.1.0.tar.gz
cd modul-rps-server-1.1.0
bash deploy/install.sh --domain modul.iainpare.ac.id --email admin@iainpare.ac.id
```

Skrip memasang Node.js, layanan `modul-rps` (systemd), Caddy dengan HTTPS otomatis, aturan firewall ufw (bila aktif), dan cadangan harian. Di akhir, skrip menampilkan alamat sekali pakai seperti:

```
https://modul.iainpare.ac.id/admin/#setup=XXXXXXXX…
```

Buka alamat itu untuk **membuat akun admin**, lalu isi **kunci API Anthropic** di **Panel Admin › Pengaturan** dan klik **Uji**.

## Setelah terpasang

| Keperluan | Perintah |
|---|---|
| Status layanan | `systemctl status modul-rps` |
| Log aplikasi | `journalctl -u modul-rps -f` |
| Log HTTPS/Caddy | `journalctl -u caddy -n 50 --no-pager` |
| Mulai ulang | `systemctl restart modul-rps` |
| Cadangan manual | `systemctl start modul-rps-backup` (hasil di `/var/backups/modul-rps`) |
| Lokasi data | `/var/lib/modul-rps` |

**Memperbarui aplikasi:** unggah paket versi baru, ekstrak, lalu jalankan `bash deploy/install.sh --domain …` lagi. Data, akun, dan kunci API tetap. Tiga versi terakhir disimpan di `/opt/modul-rps/releases`.

**Kembali ke versi sebelumnya:** `ln -sfn /opt/modul-rps/releases/<versi-lama> /opt/modul-rps/current && systemctl restart modul-rps`.

## Bila ada masalah

- **"Domain … belum mengarah ke alamat IP mana pun"**: buat/perbaiki DNS record A, tunggu beberapa menit, lalu jalankan ulang.
- **HTTPS belum aktif**: pastikan port 80/443 terbuka di panel penyedia VPS, lalu periksa `journalctl -u caddy`.
- **"Port 80/443 sudah dipakai program lain"**: VPS sudah menjalankan Nginx/Apache. Hentikan program itu, atau jalankan skrip dengan `--skip-proxy` lalu tambahkan konfigurasi Nginx dari PANDUAN-DEPLOY.md bagian 5.3.
- Pilihan lain: `bash deploy/install.sh --help`.
