#!/usr/bin/env bash
# ============================================================================
# Pemasang Server Pusat Modul RPS — IAIN Parepare
# VPS Ubuntu 22.04/24.04 atau Debian 12/13 (x86_64/arm64), dijalankan sebagai root:
#
#   bash deploy/install.sh --domain modul.contoh.ac.id [--email admin@contoh.ac.id]
#
# Langkah yang dikerjakan:
#   1. memasang Node.js (paket sistem bila >= 20, selain itu Node.js 24 LTS dari NodeSource),
#   2. memasang aplikasi ke /opt/modul-rps (data tetap di /var/lib/modul-rps),
#   3. membuat layanan systemd "modul-rps" yang hanya mendengar di 127.0.0.1,
#   4. memasang Caddy sebagai proksi balik dengan HTTPS otomatis (Let's Encrypt),
#   5. membuka port 80/443 bila firewall ufw aktif,
#   6. memasang cadangan harian folder data (14 hari terakhir disimpan),
#   7. menampilkan alamat penyiapan akun admin pertama.
# Menjalankan ulang skrip ini dengan paket versi baru = memperbarui aplikasi; data tidak berubah.
# ============================================================================
set -Eeuo pipefail

# MRP_TEST_ROOT hanya untuk uji otomatis (semua path sistem dialihkan ke folder uji)
ROOTFS="${MRP_TEST_ROOT:-}"
DOMAIN=""; EMAIL=""; PORT="8090"
APP_ROOT="$ROOTFS/opt/modul-rps"
DATA_DIR="$ROOTFS/var/lib/modul-rps"
BACKUP_DIR="$ROOTFS/var/backups/modul-rps"
UNIT_DIR="$ROOTFS/etc/systemd/system"
CADDY_DIR="$ROOTFS/etc/caddy"
SBIN_DIR="$ROOTFS/usr/local/sbin"
SVC_USER="modulrps"
SKIP_PROXY=0; SKIP_FIREWALL=0; NO_BACKUP=0; SKIP_DNS_CHECK=0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)" # akar paket: berisi app/ dan server/

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m  ✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m  ✖\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "Pemasangan berhenti di baris $LINENO (perintah: $BASH_COMMAND)."' ERR

usage() {
  cat <<'EOF'
Pemakaian: bash deploy/install.sh --domain <domain> [pilihan]

  --domain <nama>     domain/subdomain yang DNS A-nya mengarah ke IP VPS ini (wajib)
  --email <alamat>    email pemberitahuan sertifikat Let's Encrypt (disarankan)
  --port <angka>      port internal aplikasi (bawaan 8090; hanya di 127.0.0.1)
  --skip-proxy        tanpa Caddy (bila memakai Nginx/Apache sendiri sebagai proksi balik)
  --skip-firewall     jangan mengubah aturan ufw
  --no-backup         jangan memasang cadangan harian
  --skip-dns-check    lewati pemeriksaan DNS domain
  -h, --help          tampilkan bantuan ini
EOF
}

need_arg() { [ "$#" -ge 2 ] && [ -n "$2" ] || die "Pilihan $1 memerlukan nilai."; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) need_arg "$@"; DOMAIN="$2"; shift 2 ;;
    --email) need_arg "$@"; EMAIL="$2"; shift 2 ;;
    --port) need_arg "$@"; PORT="$2"; shift 2 ;;
    --skip-proxy) SKIP_PROXY=1; shift ;;
    --skip-firewall) SKIP_FIREWALL=1; shift ;;
    --no-backup) NO_BACKUP=1; shift ;;
    --skip-dns-check) SKIP_DNS_CHECK=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Pilihan tidak dikenal: $1 (lihat --help)" ;;
  esac
done

# ---------------------------------------------------------------- pemeriksaan
info "Memeriksa prasyarat"
[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root, misalnya: sudo bash deploy/install.sh --domain …"
[ -f "$SRC/app/index.html" ] && [ -f "$SRC/server/server.js" ] || die "Isi paket tidak lengkap: app/ dan server/ harus berada di $SRC"
[ -d "$SRC/server/node_modules/@anthropic-ai/sdk" ] || die "Dependensi server tidak ada di paket (server/node_modules). Buat paket dengan deploy/buat-paket.js."
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
if [ "$SKIP_PROXY" -eq 0 ]; then
  [ -n "$DOMAIN" ] || { usage; die "Domain wajib diisi (--domain)."; }
  [[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || die "Domain tidak valid: $DOMAIN"
fi
if [ -n "$EMAIL" ]; then [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Email tidak valid: $EMAIL"; fi
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || die "Port harus 1024–65535."
[ -r "$ROOTFS/etc/os-release" ] || die "Sistem operasi tidak dikenali (/etc/os-release tidak ada)."
# shellcheck disable=SC1091
. "$ROOTFS/etc/os-release"
case " ${ID:-} ${ID_LIKE:-} " in
  *" debian "* | *" ubuntu "*) ok "Sistem: ${PRETTY_NAME:-$ID}" ;;
  *) die "Skrip ini untuk Ubuntu/Debian. Sistem ini: ${PRETTY_NAME:-tidak diketahui}. Lihat PANDUAN-DEPLOY.md untuk pemasangan manual." ;;
esac
command -v systemctl >/dev/null 2>&1 || die "systemd tidak tersedia."

if [ "$SKIP_PROXY" -eq 0 ] && [ "$SKIP_DNS_CHECK" -eq 0 ]; then
  resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  [ -n "${resolved// /}" ] || die "Domain $DOMAIN belum mengarah ke alamat IP mana pun. Buat DNS record A ke IP publik VPS ini, tunggu beberapa menit, lalu jalankan ulang (atau pakai --skip-dns-check)."
  local_ips=" $(hostname -I 2>/dev/null || true) "
  match=0
  for ip in $resolved; do case "$local_ips" in *" $ip "*) match=1 ;; esac; done
  if [ "$match" -eq 1 ]; then ok "DNS $DOMAIN → $resolved"
  else warn "DNS $DOMAIN → $resolved, sedangkan alamat di VPS ini:$local_ips. Pada VPS ber-NAT (mis. AWS/GCP) ini wajar; bila tidak, perbaiki DNS agar sertifikat HTTPS dapat terbit."
  fi
fi

if [ "$SKIP_PROXY" -eq 0 ] && command -v ss >/dev/null 2>&1; then
  busy="$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v '"caddy"' || true)"
  [ -z "$busy" ] || die "Port 80/443 sudah dipakai program lain:
$busy
Hentikan program itu, atau jalankan dengan --skip-proxy lalu atur proksi balik sendiri (lihat PANDUAN-DEPLOY.md bagian 5.3)."
fi

# ---------------------------------------------------------------- paket dasar & Node.js
export DEBIAN_FRONTEND=noninteractive
info "Memasang paket dasar"
apt-get update -y -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg tar >/dev/null
ok "ca-certificates, curl, gnupg, tar"

node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>18||(a===18&&b>=17)?0:1)' 2>/dev/null
}
info "Memeriksa Node.js"
if ! node_ok; then
  cand="$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/{print $2}')"
  cand="${cand#*:}"; major="${cand%%.*}"
  if [[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -ge 20 ]; then
    apt-get install -y -qq nodejs >/dev/null
  else
    # repositori resmi NodeSource (bertanda tangan), Node.js 24 LTS
    install -d -m 0755 "$ROOTFS/etc/apt/keyrings"
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o "$ROOTFS/etc/apt/keyrings/nodesource.gpg"
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" >"$ROOTFS/etc/apt/sources.list.d/nodesource.list"
    printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' >"$ROOTFS/etc/apt/preferences.d/nodejs"
    apt-get update -y -qq
    apt-get install -y -qq nodejs >/dev/null || die "Gagal memasang Node.js dari NodeSource. Hapus paket nodejs/libnode lama (apt remove nodejs libnode-dev), lalu jalankan ulang."
  fi
fi
node_ok || die "Node.js 18.17 atau lebih baru diperlukan."
NODE_BIN="$(command -v node)"
ok "Node.js $(node -v) ($NODE_BIN)"

# ---------------------------------------------------------------- aplikasi
info "Memasang aplikasi"
VERSION="$(node -p 'require(process.argv[1]).version' "$SRC/server/package.json")"
id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" "$DATA_DIR"
install -d -m 0755 "$APP_ROOT" "$APP_ROOT/releases"
REL="$APP_ROOT/releases/$VERSION-$(date +%Y%m%d%H%M%S)"
mkdir -p "$REL"
cp -a "$SRC/app" "$SRC/server" "$REL/"
rm -rf "$REL/server/data" "$REL/server/test"
chown -R root:root "$REL"
find "$REL" -type d -exec chmod 0755 {} +
find "$REL" -type f -exec chmod 0644 {} +
ln -sfn "$REL" "$APP_ROOT/current.baru"
mv -Tf "$APP_ROOT/current.baru" "$APP_ROOT/current"
# simpan 3 rilis terakhir untuk kembali ke versi sebelumnya bila perlu
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +4 | cut -d' ' -f2- | while read -r old; do rm -rf "$old"; done
ok "Versi $VERSION di $REL"

info "Membuat layanan systemd modul-rps"
cat >"$UNIT_DIR/modul-rps.service" <<EOF
[Unit]
Description=Server Pusat Modul RPS (IAIN Parepare)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$APP_ROOT/current/server
ExecStart=$NODE_BIN $APP_ROOT/current/server/server.js --host 127.0.0.1 --port $PORT --data $DATA_DIR --app $APP_ROOT/current/app --trust-proxy 1
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable modul-rps >/dev/null 2>&1
systemctl restart modul-rps
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
if ! curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  journalctl -u modul-rps -n 40 --no-pager || true
  die "Layanan modul-rps tidak merespons di 127.0.0.1:$PORT (lihat log di atas)."
fi
ok "Layanan berjalan di 127.0.0.1:$PORT"

# ---------------------------------------------------------------- Caddy (HTTPS otomatis)
HTTPS_OK=0
if [ "$SKIP_PROXY" -eq 0 ]; then
  info "Memasang Caddy (HTTPS otomatis)"
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1 || true
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o "$ROOTFS/usr/share/keyrings/caddy-stable-archive-keyring.gpg"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >"$ROOTFS/etc/apt/sources.list.d/caddy-stable.list"
    chmod o+r "$ROOTFS/usr/share/keyrings/caddy-stable-archive-keyring.gpg" "$ROOTFS/etc/apt/sources.list.d/caddy-stable.list"
    apt-get update -y -qq
    apt-get install -y -qq caddy >/dev/null
  fi
  ok "Caddy $(caddy version 2>/dev/null | awk '{print $1}')"
  install -d -m 0755 "$CADDY_DIR"
  SITE="$CADDY_DIR/modul-rps.caddy"
  {
    echo "# Server Pusat Modul RPS — dibuat oleh deploy/install.sh"
    echo "$DOMAIN {"
    [ -n "$EMAIL" ] && printf '\ttls %s\n' "$EMAIL"
    printf '\trequest_body {\n\t\tmax_size 100MB\n\t}\n'
    printf '\treverse_proxy 127.0.0.1:%s {\n\t\tflush_interval -1\n\t}\n' "$PORT"
    printf '\theader {\n\t\tStrict-Transport-Security "max-age=31536000"\n\t\t-Server\n\t}\n'
    printf '\tlog {\n\t\toutput file /var/log/caddy/modul-rps.log {\n\t\t\troll_size 10MiB\n\t\t\troll_keep 5\n\t\t}\n\t}\n'
    echo "}"
  } >"$SITE"
  CF="$CADDY_DIR/Caddyfile"
  IMPORT_LINE="import /etc/caddy/modul-rps.caddy"
  if [ ! -s "$CF" ] || grep -q 'The Caddyfile is an easy way to configure your Caddy web server' "$CF"; then
    # Caddyfile bawaan paket (halaman contoh di :80) diganti; salinannya disimpan
    [ -f "$CF" ] && cp "$CF" "$CF.bawaan-$(date +%Y%m%d%H%M%S)"
    printf '%s\n' "$IMPORT_LINE" >"$CF"
  elif ! grep -qF "$IMPORT_LINE" "$CF"; then
    cp "$CF" "$CF.sebelum-modul-rps-$(date +%Y%m%d%H%M%S)"
    printf '\n%s\n' "$IMPORT_LINE" >>"$CF"
  fi
  install -d -m 0755 -o caddy -g caddy "$ROOTFS/var/log/caddy" 2>/dev/null || install -d -m 0755 "$ROOTFS/var/log/caddy"
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || {
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
    die "Konfigurasi Caddy tidak valid (lihat pesan di atas)."
  }
  systemctl enable caddy >/dev/null 2>&1
  if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl restart caddy; fi
  ok "Caddy melayani https://$DOMAIN"

  if [ "$SKIP_FIREWALL" -eq 0 ] && command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
    ok "Firewall ufw: port 80 dan 443 dibuka"
  fi

  info "Menunggu sertifikat HTTPS (dapat memakan waktu hingga 1–2 menit)"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 10 "https://$DOMAIN/api/health" >/dev/null 2>&1; then HTTPS_OK=1; break; fi
    sleep 4
  done
  if [ "$HTTPS_OK" -eq 1 ]; then ok "https://$DOMAIN aktif dengan sertifikat yang sah"
  else
    warn "https://$DOMAIN belum dapat diakses dari VPS ini. Penyebab umum: DNS belum mengarah ke VPS, port 80/443 ditutup firewall penyedia VPS (security group), atau batas penerbitan Let's Encrypt. Periksa: journalctl -u caddy -n 50 --no-pager"
  fi
fi

# ---------------------------------------------------------------- cadangan harian
if [ "$NO_BACKUP" -eq 0 ]; then
  info "Memasang cadangan harian data"
  install -d -m 0755 "$SBIN_DIR"
  cat >"$SBIN_DIR/modul-rps-backup" <<'EOF'
#!/bin/sh
# Cadangan folder data Server Pusat Modul RPS (dipanggil oleh modul-rps-backup.timer)
set -eu
DATA_DIR="${1:-/var/lib/modul-rps}"
BACKUP_DIR="${2:-/var/backups/modul-rps}"
KEEP_DAYS="${3:-14}"
install -d -m 0700 "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/data-$(date +%Y%m%d-%H%M).tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
find "$BACKUP_DIR" -name 'data-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
EOF
  chmod 0755 "$SBIN_DIR/modul-rps-backup"
  cat >"$UNIT_DIR/modul-rps-backup.service" <<EOF
[Unit]
Description=Cadangan data Server Pusat Modul RPS

[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/local/sbin/modul-rps-backup ${DATA_DIR#"$ROOTFS"} ${BACKUP_DIR#"$ROOTFS"} 14
EOF
  cat >"$UNIT_DIR/modul-rps-backup.timer" <<'EOF'
[Unit]
Description=Cadangan harian data Server Pusat Modul RPS

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now modul-rps-backup.timer >/dev/null 2>&1
  ok "Cadangan harian pukul ±02.30 ke ${BACKUP_DIR#"$ROOTFS"} (14 hari terakhir)"
fi

# ---------------------------------------------------------------- ringkasan
echo
info "Selesai — Server Pusat Modul RPS $VERSION"
if [ "$SKIP_PROXY" -eq 0 ]; then BASE="https://$DOMAIN"; else BASE="http://127.0.0.1:$PORT (atur proksi balik HTTPS sendiri)"; fi
echo "  Aplikasi    : $BASE/"
echo "  Panel admin : $BASE/admin/"
if [ -s "$DATA_DIR/setup-token.txt" ]; then
  echo
  echo "  Buat akun admin pertama (sekali pakai) dengan membuka:"
  echo "  ${BASE%% *}/admin/#setup=$(cat "$DATA_DIR/setup-token.txt")"
fi
echo
echo "  Langkah berikutnya: buat akun admin, lalu isi kunci API Anthropic di Panel Admin › Pengaturan."
echo "  Log layanan     : journalctl -u modul-rps -f"
echo "  Data            : ${DATA_DIR#"$ROOTFS"}   (cadangan: ${BACKUP_DIR#"$ROOTFS"})"
echo "  Memperbarui     : unggah paket versi baru, ekstrak, lalu jalankan skrip ini lagi."
