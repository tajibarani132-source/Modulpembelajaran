#!/usr/bin/env bash
# Uji deploy/install.sh tanpa VPS sungguhan:
#  - paket rilis dibuat (deploy/buat-paket.js) lalu diekstrak ke folder sementara,
#  - perintah sistem (apt, systemd, caddy, ufw, useradd, dns, dll.) diganti tiruan yang mencatat panggilan,
#  - path sistem dialihkan ke folder uji lewat MRP_TEST_ROOT,
#  - layanan "modul-rps" dijalankan sungguhan dengan Node dari baris ExecStart unit systemd yang dihasilkan.
# Jalankan: bash deploy/test/uji-install.sh   (Linux atau Git Bash di Windows)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PASS=0; FAIL=0
check() { if eval "$2"; then PASS=$((PASS + 1)); echo "  ✔ $1"; else FAIL=$((FAIL + 1)); echo "  ✖ $1"; fi; }
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

TMP="$(mktemp -d)"
STUB="$TMP/stub"; LOG="$TMP/panggilan.log"; FS="$TMP/rootfs"
PORT=$((18500 + RANDOM % 400))
DOMAIN="modul.contoh.ac.id"
REAL_INSTALL="$(command -v install)"; REAL_CURL="$(command -v curl)"; REAL_SLEEP="$(command -v sleep)"; REAL_LN="$(command -v ln)"; REAL_CHMOD="$(command -v chmod)"
export MRP_STUB_LOG="$LOG" MRP_STUB_TMP="$TMP" REAL_INSTALL REAL_CURL REAL_SLEEP REAL_LN REAL_CHMOD DOMAIN

cleanup() {
  if [ -f "$TMP/server.pid" ]; then kill "$(cat "$TMP/server.pid")" 2>/dev/null || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

reset_fs() {
  rm -rf "$FS"
  mkdir -p "$FS/etc/apt/keyrings" "$FS/etc/apt/sources.list.d" "$FS/etc/apt/preferences.d" "$FS/usr/share/keyrings" \
    "$FS/etc/systemd/system" "$FS/etc/caddy" "$FS/var/log"
  cat >"$FS/etc/os-release" <<'EOF'
PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION="24.04.1 LTS (Noble Numbat)"
VERSION_ID="24.04"
ID=ubuntu
ID_LIKE=debian
EOF
  printf '# The Caddyfile is an easy way to configure your Caddy web server.\n:80 {\n\troot * /usr/share/caddy\n\tfile_server\n}\n' >"$FS/etc/caddy/Caddyfile"
  rm -f "$TMP/user-dibuat" "$LOG"
}

# ---------------------------------------------------------------- tiruan perintah sistem
mkdir -p "$STUB"
mk() { printf '#!/usr/bin/env bash\necho "%s $*" >>"$MRP_STUB_LOG"\n%s\n' "$1" "$2" >"$STUB/$1"; chmod +x "$STUB/$1"; }
mk id 'if [ "${1:-}" = "-u" ] && [ -z "${2:-}" ]; then echo 0; elif [ -f "$MRP_STUB_TMP/user-dibuat" ]; then echo 999; else exit 1; fi'
mk useradd 'touch "$MRP_STUB_TMP/user-dibuat"'
mk chown ':'
mk apt-get ':'
mk apt-cache 'echo "  Candidate: 18.19.1+dfsg-6ubuntu5"'
mk getent '[ -n "${STUB_DNS_KOSONG:-}" ] && exit 2; echo "203.0.113.10    STREAM ${3:-}"'
mk hostname 'echo "203.0.113.10 10.0.0.5"'
mk ss '[ -n "${STUB_PORT_SIBUK:-}" ] && echo "LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:((\"nginx\",pid=812,fd=6))"; exit 0'
mk journalctl ':'
mk caddy 'case "${1:-}" in version) echo "v2.10.2 h1:uji";; esac; exit 0'
mk ufw 'case "${1:-}" in status) echo "Status: active";; esac; exit 0'
mk gpg 'out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done; cat >"$out"'
mk sleep 'exec "$REAL_SLEEP" 0.2'
# Windows tanpa hak symlink: "ln -sfn" ditiru dengan junction direktori (perilaku mv -T sama seperti symlink)
mk ln 'if command -v cygpath >/dev/null 2>&1 && [ "${1:-}" = "-sfn" ]; then rm -rf "$3"; cmd //c mklink //J "$(cygpath -w "$3")" "$(cygpath -w "$2")" >/dev/null; else exec "$REAL_LN" "$@"; fi'
# install: buang -o/-g (pengguna sistem tidak ada di mesin uji); di Windows -m juga dibuang
# (izin berkas POSIX tidak berlaku di NTFS) lalu jalankan install asli
mk install 'win=0; command -v cygpath >/dev/null 2>&1 && win=1
a=(); while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2;; -m) if [ $win -eq 1 ]; then shift 2; else a+=("$1" "$2"); shift 2; fi;; *) a+=("$1"); shift;; esac; done
exec "$REAL_INSTALL" "${a[@]}"'
mk chmod 'command -v cygpath >/dev/null 2>&1 && exit 0; exec "$REAL_CHMOD" "$@"'
mk curl 'all=" $* "
case "$all" in
  *"http://127.0.0.1"*) exec "$REAL_CURL" "$@" ;;
  *"https://$DOMAIN"*) [ -n "${STUB_HTTPS_GAGAL:-}" ] && exit 7; exit 0 ;;
  *nodesource*|*cloudsmith*) echo "isi-tiruan"; exit 0 ;;
  *) exit 22 ;;
esac'
# systemctl: "restart modul-rps" menjalankan server dari baris ExecStart unit yang dibuat skrip
mk systemctl 'unit="$MRP_TEST_ROOT/etc/systemd/system/modul-rps.service"
case "$*" in
  "restart modul-rps")
    [ -f "$MRP_STUB_TMP/server.pid" ] && kill "$(cat "$MRP_STUB_TMP/server.pid")" 2>/dev/null && sleep 1
    line="$(grep "^ExecStart=" "$unit")"; args="${line#*server.js }"; js="$(printf "%s" "$line" | grep -oE "[^ ]*server/server[.]js")"
    # shellcheck disable=SC2086
    nohup node "$js" $args >"$MRP_STUB_TMP/server.log" 2>&1 &
    echo $! >"$MRP_STUB_TMP/server.pid" ;;
  "is-active --quiet caddy") exit 1 ;;
esac
exit 0'

run_install() { # $@ = argumen untuk install.sh ; keluaran di $TMP/keluaran.txt, status di $RC
  ( export PATH="$STUB:$PATH" MRP_TEST_ROOT="$(winpath "$FS")"; bash "$PKG/deploy/install.sh" "$@" ) >"$TMP/keluaran.txt" 2>&1
  RC=$?
}

# ---------------------------------------------------------------- paket
echo "Membuat dan mengekstrak paket rilis"
(cd "$ROOT" && node deploy/buat-paket.js) || { echo "  ✖ buat-paket.js gagal"; exit 1; }
VER="$(node -p 'require(process.argv[1]).version' "$(winpath "$ROOT/server/package.json")")"
(cd "$TMP" && tar -xzf "$ROOT/release/modul-rps-server-$VER.tar.gz") || { echo "  ✖ ekstrak gagal"; exit 1; }
PKG="$TMP/modul-rps-server-$VER"
check "paket berisi app, server+node_modules, install.sh, panduan" '[ -f "$PKG/app/index.html" ] && [ -d "$PKG/server/node_modules/@anthropic-ai/sdk" ] && [ -f "$PKG/deploy/install.sh" ] && [ -f "$PKG/PANDUAN-ADMIN-SERVER.md" ]'
check "paket tanpa data uji dan folder test" '[ ! -e "$PKG/server/data" ] && [ ! -e "$PKG/server/test" ]'
check "install.sh berakhir-baris LF" '! grep -q $'"'"'\r'"'"' "$PKG/deploy/install.sh"'
check "sintaks install.sh valid" 'bash -n "$PKG/deploy/install.sh"'

echo "Pemasangan pertama"
reset_fs
run_install --domain Modul.Contoh.AC.id --email admin@contoh.ac.id --port "$PORT"
check "skrip selesai tanpa galat (status $RC)" '[ "$RC" -eq 0 ]'
[ "$RC" -eq 0 ] || tail -25 "$TMP/keluaran.txt"
U="$FS/etc/systemd/system/modul-rps.service"
check "unit systemd: hanya 127.0.0.1, port, folder data, trust-proxy" 'grep -q -- "--host 127.0.0.1 --port $PORT --data .*var/lib/modul-rps --app .*current/app --trust-proxy 1" "$U"'
check "unit systemd: pengerasan keamanan" 'grep -q "^ProtectSystem=strict" "$U" && grep -q "^NoNewPrivileges=true" "$U" && grep -q "^ReadWritePaths=.*var/lib/modul-rps" "$U"'
check "Caddyfile bawaan diganti dengan import (salinan disimpan)" '[ "$(cat "$FS/etc/caddy/Caddyfile")" = "import /etc/caddy/modul-rps.caddy" ] && ls "$FS"/etc/caddy/Caddyfile.bawaan-* >/dev/null 2>&1'
S="$FS/etc/caddy/modul-rps.caddy"
check "situs Caddy: domain (huruf kecil), email TLS, proksi, streaming, batas unggah" 'grep -q "^modul.contoh.ac.id {" "$S" && grep -q "tls admin@contoh.ac.id" "$S" && grep -q "reverse_proxy 127.0.0.1:$PORT" "$S" && grep -q "flush_interval -1" "$S" && grep -q "max_size 100MB" "$S"'
check "firewall ufw: port 80 dan 443 dibuka" 'grep -q "ufw allow 80/tcp" "$LOG" && grep -q "ufw allow 443/tcp" "$LOG"'
check "pengguna sistem modulrps dibuat" 'grep -q "useradd --system" "$LOG"'
check "layanan Node berjalan dari unit yang dibuat (api/health)" '"$REAL_CURL" -fsS "http://127.0.0.1:$PORT/api/health" | grep -q "\"ok\":true"'
check "aplikasi web disajikan dari rilis terpasang" '"$REAL_CURL" -fsS "http://127.0.0.1:$PORT/" | grep -q "Konversi RPS"'
TOKEN="$(cat "$FS/var/lib/modul-rps/setup-token.txt" 2>/dev/null)"
check "alamat penyiapan admin HTTPS ditampilkan" '[ -n "$TOKEN" ] && grep -q "https://modul.contoh.ac.id/admin/#setup=$TOKEN" "$TMP/keluaran.txt"'
check "HTTPS terverifikasi" 'grep -q "aktif dengan sertifikat yang sah" "$TMP/keluaran.txt"'
check "cadangan harian: skrip, service, dan timer" '[ -f "$FS/usr/local/sbin/modul-rps-backup" ] && head -1 "$FS/usr/local/sbin/modul-rps-backup" | grep -q "^#!/bin/sh" && grep -q "^ExecStart=/usr/local/sbin/modul-rps-backup /var/lib/modul-rps /var/backups/modul-rps 14" "$FS/etc/systemd/system/modul-rps-backup.service" && grep -q "enable --now modul-rps-backup.timer" "$LOG"'
PATH="$STUB:$PATH" sh "$FS/usr/local/sbin/modul-rps-backup" "$FS/var/lib/modul-rps" "$FS/var/backups/modul-rps" 14
check "skrip cadangan menghasilkan arsip data" 'ls "$FS"/var/backups/modul-rps/data-*.tar.gz >/dev/null 2>&1'

echo "Pembaruan (menjalankan ulang skrip)"
sleep 1
run_install --domain modul.contoh.ac.id --email admin@contoh.ac.id --port "$PORT"
check "pembaruan selesai tanpa galat (status $RC)" '[ "$RC" -eq 0 ]'
[ "$RC" -eq 0 ] || tail -25 "$TMP/keluaran.txt"
check "dua rilis tersimpan; data dan kode penyiapan tetap" '[ "$(find "$FS/opt/modul-rps/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 2 ] && [ "$(cat "$FS/var/lib/modul-rps/setup-token.txt")" = "$TOKEN" ]'
check "Caddyfile tidak menggandakan import" '[ "$(grep -c "import /etc/caddy/modul-rps.caddy" "$FS/etc/caddy/Caddyfile")" -eq 1 ]'
check "layanan tetap sehat setelah pembaruan" '"$REAL_CURL" -fsS "http://127.0.0.1:$PORT/api/health" | grep -q "\"ok\":true"'

echo "Caddyfile yang sudah berisi situs lain"
printf 'situs-lain.contoh.id {\n\trespond "halo"\n}\n' >"$FS/etc/caddy/Caddyfile"
run_install --domain modul.contoh.ac.id --port "$PORT" --no-backup
check "situs lain dipertahankan dan import ditambahkan" '[ "$RC" -eq 0 ] && grep -q "situs-lain.contoh.id" "$FS/etc/caddy/Caddyfile" && grep -q "^import /etc/caddy/modul-rps.caddy" "$FS/etc/caddy/Caddyfile"'
check "tanpa --email tidak ada baris tls" '! grep -q "tls " "$FS/etc/caddy/modul-rps.caddy"'

echo "Kondisi yang harus ditolak"
reset_fs
run_install --port "$PORT"
check "tanpa --domain ditolak" '[ "$RC" -ne 0 ] && grep -q "Domain wajib" "$TMP/keluaran.txt"'
run_install --domain bukan_domain
check "domain tidak valid ditolak" '[ "$RC" -ne 0 ] && grep -q "Domain tidak valid" "$TMP/keluaran.txt"'
STUB_DNS_KOSONG=1 run_install --domain modul.contoh.ac.id
check "DNS belum mengarah: berhenti dengan petunjuk" '[ "$RC" -ne 0 ] && grep -q "belum mengarah" "$TMP/keluaran.txt"'
STUB_PORT_SIBUK=1 run_install --domain modul.contoh.ac.id
check "port 80/443 dipakai Nginx: berhenti dengan petunjuk" '[ "$RC" -ne 0 ] && grep -q "sudah dipakai program lain" "$TMP/keluaran.txt" && grep -q "nginx" "$TMP/keluaran.txt"'
sed -i 's/^ID=ubuntu/ID=fedora/; s/^ID_LIKE=debian/ID_LIKE=rhel/' "$FS/etc/os-release"
run_install --domain modul.contoh.ac.id
check "sistem selain Ubuntu/Debian ditolak" '[ "$RC" -ne 0 ] && grep -q "untuk Ubuntu/Debian" "$TMP/keluaran.txt"'
check "tidak ada yang terpasang saat ditolak" '[ ! -e "$FS/opt/modul-rps" ] && [ ! -e "$FS/etc/systemd/system/modul-rps.service" ]'

echo "Mode --skip-proxy (Nginx sendiri)"
reset_fs
run_install --skip-proxy --port "$PORT" --no-backup
check "tanpa Caddy: layanan lokal saja" '[ "$RC" -eq 0 ] && [ ! -e "$FS/etc/caddy/modul-rps.caddy" ] && grep -q "http://127.0.0.1:$PORT" "$TMP/keluaran.txt"'
STUB_HTTPS_GAGAL=1 run_install --domain modul.contoh.ac.id --port "$PORT" --no-backup
check "HTTPS belum aktif: peringatan, bukan kegagalan" '[ "$RC" -eq 0 ] && grep -q "belum dapat diakses" "$TMP/keluaran.txt"'

echo
echo "Hasil: $PASS lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
