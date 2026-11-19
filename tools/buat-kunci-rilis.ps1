<#
  buat-kunci-rilis.ps1 - membuat kunci rilis (keystore) APK "Modul RPS IAIN Parepare" dan memandu
  pengisian Repository secrets GitHub yang dipakai .github/workflows/build-android.yml.

  Cara menjalankan (dari PowerShell, Command Prompt, atau Terminal):
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/buat-kunci-rilis.ps1

  - Kata sandi diketik sendiri dan tidak tampil di layar. Skrip ini tidak menyimpan, mencatat, atau
    mengirim kata sandi: kata sandi hanya diteruskan ke keytool/openssl lewat variabel lingkungan
    proses ini, lalu dihapus lagi.
  - Keystore disimpan di luar repositori (bawaan: Documents\Kunci APK Modul RPS). Berkas yang sudah
    ada TIDAK pernah ditimpa: skrip hanya memeriksa kata sandinya lalu memandu ulang pengisian secrets.
  - Membutuhkan keytool dari Java 17 atau lebih baru (JDK, Android Studio, atau IntelliJ IDEA).
    Bila tidak ada, dipakai openssl dari Git for Windows.
  - Berkas ini sengaja hanya berisi karakter ASCII agar terbaca benar oleh Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
  # Folder penyimpanan keystore; harus di luar repositori. Kosong = Documents\Kunci APK Modul RPS.
  [string]$Folder = '',
  # Alias kunci di dalam keystore (isi secret ANDROID_KEY_ALIAS).
  [string]$Alias = 'modulrps',
  # Identitas penerbit pada sertifikat. Data ini terbaca publik dari setiap APK.
  [string]$DName = 'CN=Modul RPS IAIN Parepare, OU=Prodi Manajemen Dakwah, O=IAIN Parepare, L=Parepare, C=ID',
  # Hanya memuat fungsi tanpa menjalankan langkah apa pun (untuk menguji skrip ini).
  [switch]$MuatSaja
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$NamaBerkas = 'rilis-modulrps.jks'
$VarSandi = 'MRP_SANDI_KEYSTORE_RILIS'
$PanjangMinimal = 12
$JavaMinimal = 17
# Algoritme PKCS12 yang dipatok (sama dengan bawaan Java 17-25) agar keystore pasti terbaca oleh
# Java 21 di GitHub Actions, walau keytool yang dipakai di komputer ini lebih baru.
$OpsiJava = @(
  '-J-Duser.language=en',
  '-J-Dkeystore.pkcs12.certProtectionAlgorithm=PBEWithHmacSHA256AndAES_256',
  '-J-Dkeystore.pkcs12.keyProtectionAlgorithm=PBEWithHmacSHA256AndAES_256',
  '-J-Dkeystore.pkcs12.macAlgorithm=HmacPBESHA256'
)
$script:PesanAlatTerakhir = ''
$script:ClipboardTerlindungi = $true

function Tulis([string]$Teks = '', [string]$Warna = '') {
  if ($Warna) { Write-Host $Teks -ForegroundColor $Warna } else { Write-Host $Teks }
}

# Menjalankan program luar; mengembalikan kode keluar dan seluruh keluarannya (stdout + stderr).
function Invoke-Alat([string]$Exe, [string[]]$Argumen) {
  $lama = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $keluaran = & $Exe @Argumen 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
    }
    $kode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $lama
  }
  return [pscustomobject]@{ Kode = $kode; Teks = (@($keluaran) -join [Environment]::NewLine) }
}

function Set-SandiProses([string]$Sandi) {
  # Nilai kosong justru menghapus variabel lingkungan, jadi ditolak di sini.
  if (-not $Sandi) { throw 'Kata sandi kosong.' }
  [Environment]::SetEnvironmentVariable($VarSandi, $Sandi, 'Process')
}

function Clear-SandiProses {
  [Environment]::SetEnvironmentVariable($VarSandi, $null, 'Process')
}

# Menggabungkan jalur sebagai teks biasa. Join-Path di PowerShell 5.1 gagal bila drive-nya tidak ada.
function Join-Jalur([string]$Dasar, [string]$Sisa) {
  return ($Dasar.TrimEnd('\', '/') + '\' + $Sisa.TrimStart('\', '/'))
}

# Versi mayor dan vendor runtime Java tempat keytool berada (dari berkas 'release', atau -J-version).
function Get-VersiJava([string]$Keytool) {
  $hasil = [pscustomobject]@{ Mayor = 0; Vendor = '' }
  $root = Split-Path (Split-Path $Keytool -Parent) -Parent
  $rel = Join-Jalur $root 'release'
  if (Test-Path -LiteralPath $rel) {
    $teks = (Get-Content -LiteralPath $rel -ErrorAction SilentlyContinue) -join "`n"
    if ($teks -match '(?m)^IMPLEMENTOR="?([^"\r\n]*)') { $hasil.Vendor = $Matches[1] }
    if ($teks -match '(?m)^JAVA_VERSION="?([0-9]+)(?:\.([0-9]+))?') {
      $mayor = [int]$Matches[1]
      if ($mayor -eq 1 -and $Matches.ContainsKey(2)) { $mayor = [int]$Matches[2] }
      $hasil.Mayor = $mayor
      return $hasil
    }
  }
  $h = Invoke-Alat $Keytool @('-J-version')
  if ($h.Teks -match 'IBM J9') { $hasil.Vendor = 'IBM' }
  if ($h.Teks -match 'version "([0-9]+)(?:\.([0-9]+))?') {
    $mayor = [int]$Matches[1]
    if ($mayor -eq 1 -and $Matches.ContainsKey(2)) { $mayor = [int]$Matches[2] }
    $hasil.Mayor = $mayor
  }
  return $hasil
}

# Mencari keytool: JAVA_HOME, PATH, JDK terpasang, runtime IDE, lalu runtime Java bawaan aplikasi lain.
# Runtime IBM dan Java di bawah versi minimal dilewati. Pola yang bermasalah (mis. drive tidak ada)
# cukup dilewati, tidak menghentikan skrip.
function Find-Keytool {
  $pf = $env:ProgramFiles
  $pf86 = ${env:ProgramFiles(x86)}
  $pola = New-Object System.Collections.Generic.List[object]
  if ($env:JAVA_HOME) {
    $jh = $env:JAVA_HOME.Trim().Trim('"').TrimEnd(';').Trim()
    if ($jh) { $pola.Add(@((Join-Jalur $jh 'bin\keytool.exe'), 1)) }
  }
  foreach ($c in @(Get-Command keytool.exe -All -ErrorAction SilentlyContinue)) { $pola.Add(@($c.Source, 2)) }
  if ($pf) {
    foreach ($p in @('Eclipse Adoptium\*\bin', 'Java\*\bin', 'Microsoft\jdk-*\bin', 'Zulu\*\bin',
        'Amazon Corretto\*\bin', 'BellSoft\*\bin', 'OpenJDK\*\bin')) {
      $pola.Add(@((Join-Jalur $pf "$p\keytool.exe"), 3))
    }
    foreach ($p in @('Android\Android Studio*\jbr\bin', 'JetBrains\*\jbr\bin')) {
      $pola.Add(@((Join-Jalur $pf "$p\keytool.exe"), 4))
    }
  }
  if ($env:USERPROFILE) { $pola.Add(@((Join-Jalur $env:USERPROFILE '.jdks\*\bin\keytool.exe'), 3)) }
  if ($env:LOCALAPPDATA) { $pola.Add(@((Join-Jalur $env:LOCALAPPDATA 'Programs\*\jbr\bin\keytool.exe'), 4)) }
  foreach ($akar in @($pf, $pf86)) {
    if (-not $akar) { continue }
    foreach ($p in @('*\jre\bin', '*\*\jre\bin', '*\jbr\bin')) { $pola.Add(@((Join-Jalur $akar "$p\keytool.exe"), 5)) }
  }

  $lihat = @{}
  $kandidat = New-Object System.Collections.Generic.List[object]
  foreach ($item in $pola) {
    $cocok = @()
    try { $cocok = @(Resolve-Path -Path $item[0] -ErrorAction SilentlyContinue) } catch { $cocok = @() }
    foreach ($r in $cocok) {
      $jalur = $r.ProviderPath
      $kunci = $jalur.ToLowerInvariant()
      if ($lihat.ContainsKey($kunci)) { continue }
      $lihat[$kunci] = $true
      try { $v = Get-VersiJava $jalur } catch { continue }
      if ($v.Vendor -match 'IBM') { continue }
      if ($v.Mayor -lt $JavaMinimal) { continue }
      $kandidat.Add([pscustomobject]@{ Jalur = $jalur; Mayor = $v.Mayor; Prioritas = $item[1] })
    }
  }
  return ($kandidat | Sort-Object -Property @{ Expression = 'Prioritas'; Ascending = $true }, @{ Expression = 'Mayor'; Descending = $true } | Select-Object -First 1)
}

function Find-OpenSsl {
  if ($env:ProgramFiles) {
    foreach ($p in @('Git\mingw64\bin\openssl.exe', 'Git\usr\bin\openssl.exe')) {
      $jalur = Join-Jalur $env:ProgramFiles $p
      if (Test-Path -LiteralPath $jalur) { return $jalur }
    }
  }
  $c = Get-Command openssl.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  return $null
}

# "CN=a, OU=b, C=ID" -> "/CN=a/OU=b/C=ID" untuk opsi -subj openssl.
function ConvertTo-SubjekOpenSsl([string]$Penerbit) {
  $hasil = ''
  foreach ($bagian in [regex]::Split($Penerbit.Trim(), ',\s*(?=[A-Za-z][A-Za-z0-9.]*\s*=)')) {
    $i = $bagian.IndexOf('=')
    if ($i -lt 1) { throw "Format DName tidak dikenali: $Penerbit" }
    $k = $bagian.Substring(0, $i).Trim()
    $v = $bagian.Substring($i + 1).Trim().Replace('\', '\\').Replace('/', '\/').Replace('+', '\+')
    $hasil += "/$k=$v"
  }
  return $hasil
}

function Assert-BelumAda([string]$Jalur) {
  if (Test-Path -LiteralPath $Jalur) { throw "Berkas sudah ada dan tidak akan ditimpa: $Jalur" }
}

function New-KeystoreKeytool([string]$Keytool, [string]$Jalur, [string]$AliasKunci, [string]$Penerbit) {
  Assert-BelumAda $Jalur
  $argumen = @($OpsiJava) + @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $Jalur,
    '-alias', $AliasKunci, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
    '-dname', $Penerbit, '-storepass:env', $VarSandi, '-keypass:env', $VarSandi)
  $h = Invoke-Alat $Keytool $argumen
  if ($h.Kode -ne 0 -or -not (Test-Path -LiteralPath $Jalur)) {
    Remove-Item -LiteralPath $Jalur -Force -ErrorAction SilentlyContinue
    throw "keytool gagal membuat keystore:`n$($h.Teks)"
  }
}

function New-KeystoreOpenSsl([string]$OpenSsl, [string]$Jalur, [string]$AliasKunci, [string]$Penerbit) {
  Assert-BelumAda $Jalur
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('mrp-kunci-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $kunci = Join-Path $tmp 'kunci.pem'
    $sert = Join-Path $tmp 'sert.pem'
    $h = Invoke-Alat $OpenSsl @('req', '-x509', '-newkey', 'rsa:4096', '-sha256', '-days', '10000',
      '-subj', (ConvertTo-SubjekOpenSsl $Penerbit), '-keyout', $kunci, '-out', $sert,
      '-passout', "env:$VarSandi")
    if ($h.Kode -ne 0) { throw "openssl gagal membuat kunci:`n$($h.Teks)" }
    $h = Invoke-Alat $OpenSsl @('pkcs12', '-export', '-inkey', $kunci, '-in', $sert, '-name', $AliasKunci,
      '-out', $Jalur, '-passin', "env:$VarSandi", '-passout', "env:$VarSandi",
      '-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC', '-macalg', 'sha256', '-iter', '10000')
    if ($h.Kode -ne 0 -or -not (Test-Path -LiteralPath $Jalur)) {
      Remove-Item -LiteralPath $Jalur -Force -ErrorAction SilentlyContinue
      throw "openssl gagal membuat keystore:`n$($h.Teks)"
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# SHA-256 sertifikat (heksadesimal kecil tanpa titik dua, sama dengan format apksigner), atau $null
# bila gagal; keluaran alat terakhir disimpan di $script:PesanAlatTerakhir untuk menjelaskan sebabnya.
function Get-SidikJari([string]$Alat, [string]$Jenis, [string]$Jalur, [string]$AliasKunci) {
  $script:PesanAlatTerakhir = ''
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('mrp-sert-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $der = Join-Path $tmp 'sert.der'
    if ($Jenis -eq 'keytool') {
      $h = Invoke-Alat $Alat @('-J-Duser.language=en', '-exportcert', '-keystore', $Jalur, '-alias', $AliasKunci,
        '-storepass:env', $VarSandi, '-file', $der)
    } else {
      $pem = Join-Path $tmp 'sert.pem'
      $h = Invoke-Alat $Alat @('pkcs12', '-in', $Jalur, '-nokeys', '-clcerts', '-passin', "env:$VarSandi", '-out', $pem)
      if ($h.Kode -eq 0) {
        if ((Get-Content -LiteralPath $pem -Raw) -notmatch "(?im)^\s*friendlyName:\s*$([regex]::Escape($AliasKunci))\s*$") {
          $script:PesanAlatTerakhir = "Alias $AliasKunci does not exist"
          return $null
        }
        $h = Invoke-Alat $Alat @('x509', '-in', $pem, '-outform', 'DER', '-out', $der)
      }
    }
    if ($h.Kode -ne 0 -or -not (Test-Path -LiteralPath $der)) {
      $script:PesanAlatTerakhir = $h.Teks
      return $null
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash([IO.File]::ReadAllBytes($der)) } finally { $sha.Dispose() }
    return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Menggolongkan kegagalan membaca keystore: 'sandi', 'alias', atau 'rusak'.
function Get-AlasanGagal([string]$Pesan) {
  if ($Pesan -match '(?i)alias \S+ does not exist') { return 'alias' }
  if ($Pesan -match '(?i)password was incorrect|keystore password|integrity|mac verify|invalid password|bad decrypt') { return 'sandi' }
  return 'rusak'
}

function Get-BarisTerakhir([string]$Teks) {
  $baris = @($Teks -split "`r?`n" | Where-Object { $_.Trim() })
  if ($baris.Count -eq 0) { return '(tanpa keterangan)' }
  return $baris[-1].Trim()
}

function Read-SandiTersembunyi([string]$Prompt) {
  $aman = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($aman)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $aman.Dispose()
  }
}

# Mengembalikan pesan masalah, atau $null bila kata sandi layak.
function Test-SandiLayak([string]$Sandi) {
  if ($Sandi.Length -lt $PanjangMinimal) { return "Kata sandi terlalu pendek (minimal $PanjangMinimal karakter)." }
  if ($Sandi -cne $Sandi.Trim()) { return 'Kata sandi tidak boleh diawali atau diakhiri spasi.' }
  if ($Sandi -cnotmatch '^[\x20-\x7E]+$') { return 'Gunakan huruf, angka, spasi, dan tanda baca biasa (tanpa huruf beraksen atau emoji).' }
  return $null
}

function Read-SandiBaru {
  for ($coba = 1; $coba -le 3; $coba++) {
    $s1 = Read-SandiTersembunyi "Buat kata sandi keystore (minimal $PanjangMinimal karakter)"
    $masalah = Test-SandiLayak $s1
    if ($masalah) { Tulis "  $masalah" Yellow; continue }
    $s2 = Read-SandiTersembunyi 'Ketik ulang kata sandi'
    if ($s1 -cne $s2) { Tulis '  Kedua kata sandi tidak sama. Ulangi.' Yellow; continue }
    return $s1
  }
  throw 'Kata sandi belum ditetapkan setelah 3 kali percobaan. Jalankan skrip ini lagi.'
}

function Read-YaTidak([string]$Prompt, [bool]$Bawaan = $true) {
  $saran = '[y/N]'
  if ($Bawaan) { $saran = '[Y/n]' }
  $jawab = Read-Host -Prompt "$Prompt $saran"
  if ([string]::IsNullOrWhiteSpace($jawab)) { return $Bawaan }
  return ($jawab.Trim() -match '^(y|ya|yes)$')
}

function Get-UrlSecrets([string]$RepoRoot) {
  $url = ''
  try {
    $h = Invoke-Alat 'git' @('-C', $RepoRoot, 'remote', 'get-url', 'origin')
    if ($h.Kode -eq 0) { $url = $h.Teks.Trim() }
  } catch {
    $url = ''
  }
  if ($url -match 'github\.com[:/]+([^/\s]+)/([^/\s]+?)(\.git)?/?$') {
    return "https://github.com/$($Matches[1])/$($Matches[2])/settings/secrets/actions"
  }
  return $null
}

# Menyalin teks ke clipboard dan menandainya agar tidak masuk Riwayat Clipboard (Win+V) dan tidak
# disinkronkan ke perangkat lain (format clipboard Windows: CanIncludeInClipboardHistory dan
# CanUploadToCloudClipboard bernilai DWORD 0, ditambah ExcludeClipboardContentFromMonitorProcessing).
# Mengembalikan $true bila penandaan berhasil; bila gagal, dipakai Set-Clipboard biasa dan $false.
function Copy-KeClipboard([string]$Teks) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $data = New-Object System.Windows.Forms.DataObject
    $data.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $Teks)
    foreach ($format in @('ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard')) {
      $data.SetData($format, (New-Object System.IO.MemoryStream (, [byte[]](0, 0, 0, 0))))
    }
    [System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
    return $true
  } catch {
    $script:ClipboardTerlindungi = $false
  }
  try {
    Set-Clipboard -Value $Teks
  } catch {
    throw "Clipboard tidak bisa dipakai ($($_.Exception.Message)). Jalankan skrip ini dari jendela PowerShell biasa."
  }
  return $false
}

function Clear-KeClipboard {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::Clear()
  } catch {
    try { cmd.exe /c 'echo off | clip' } catch { }
  }
}

function Write-BacaSaya([string]$Folder, [string]$AliasKunci, [string]$Sidik, [string]$Alat, [string]$Penerbit) {
  $isi = @(
    'KUNCI RILIS APK "Modul RPS IAIN Parepare"',
    '',
    "Berkas keystore : $NamaBerkas (PKCS12)",
    "Alias kunci     : $AliasKunci",
    "SHA-256 sertif. : $Sidik",
    "Penerbit        : $Penerbit",
    "Dibuat          : $(Get-Date -Format 'yyyy-MM-dd HH:mm') dengan $Alat",
    '',
    'Kata sandi TIDAK disimpan di berkas ini. Simpan di pengelola kata sandi atau catatan yang aman.',
    '',
    'PENTING',
    '- Setiap pembaruan APK wajib ditandatangani kunci ini. Bila keystore DAN secrets GitHub-nya hilang,',
    '  pembaruan tidak bisa dipasang di atas aplikasi lama (dosen harus menghapus aplikasi dulu).',
    '- Selama secrets di GitHub tidak dihapus atau diubah, APK tetap ditandatangani dengan benar walau',
    '  salinan di komputer ini hilang. Jangan hapus atau timpa secrets itu.',
    '- Simpan salinan folder ini di tempat lain (mis. flashdisk), terpisah dari kata sandinya.',
    '- Di komputer lain, salin folder ini ke Documents lebih dulu; jangan membuat kunci baru.',
    '- Jangan unggah berkas keystore ke GitHub, surel, atau grup obrolan.',
    '- Pengisian secrets GitHub dapat diulang kapan saja dengan menjalankan lagi tools/buat-kunci-rilis.ps1.',
    '- Bila kunci memang harus diganti, ikuti bagian "Kunci baru (darurat)" di PANDUAN-DEPLOY.md.'
  )
  Set-Content -LiteralPath (Join-Path $Folder 'BACA-SAYA.txt') -Value $isi -Encoding UTF8
}

if ($MuatSaja) { return }

# ---------------------------------------------------------------------------------------------------

try {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
  if (-not $Folder) { $Folder = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Kunci APK Modul RPS' }
  $Folder = [IO.Path]::GetFullPath($Folder)
  $Jalur = Join-Path $Folder $NamaBerkas

  Tulis ''
  Tulis '=== Kunci rilis APK "Modul RPS IAIN Parepare" ===' Cyan

  $akarRepo = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\') + '\'
  if (($Folder.TrimEnd('\') + '\').StartsWith($akarRepo, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Folder keystore ($Folder) berada di dalam repositori. Pilih folder lain dengan -Folder."
  }
  if ($Alias -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
    throw 'Alias hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung.'
  }
  if ((-not $DName.Trim()) -or $DName.Contains('"')) {
    throw 'DName tidak boleh kosong atau memuat tanda petik ganda (").'
  }

  $keytool = Find-Keytool
  if ($keytool) {
    $alat = $keytool.Jalur
    $jenis = 'keytool'
    $namaAlat = "keytool Java $($keytool.Mayor)"
  } else {
    $alat = Find-OpenSsl
    $jenis = 'openssl'
    $namaAlat = 'openssl'
    if (-not $alat) { throw "keytool (Java $JavaMinimal+) maupun openssl tidak ditemukan. Pasang Git for Windows atau JDK, lalu ulangi." }
  }
  Tulis "Alat   : $namaAlat ($alat)"
  Tulis "Berkas : $Jalur"

  $sidik = $null
  try {
    if (-not (Test-Path -LiteralPath $Jalur)) {
      Tulis ''
      Tulis 'Belum ada keystore di folder ini.' Yellow
      Tulis 'Bila Anda SUDAH pernah membuat kunci rilis (mis. di komputer lain), JANGAN membuat kunci baru:'
      Tulis 'salin dulu folder kunci lama ke lokasi di atas, lalu jalankan skrip ini lagi. Kunci baru'
      Tulis 'membuat pembaruan ditolak di ponsel dosen yang sudah memasang aplikasinya.'
      if (-not (Read-YaTidak 'Buat kunci rilis BARU sekarang?' $false)) { throw 'Dibatalkan; tidak ada yang dibuat.' }
      Tulis ''
      Tulis 'Identitas pada sertifikat (terbaca publik dari setiap APK):'
      Tulis "  $DName"
      Tulis ''
      Tulis 'Kata sandi melindungi keystore. Pakai frasa panjang yang mudah Anda ingat, mis. 3-4 kata.'
      Tulis 'Kata sandi tidak tampil saat diketik, dan TIDAK bisa dipulihkan bila lupa.'
      $sandi = Read-SandiBaru
      Set-SandiProses $sandi
      $sandi = $null
      New-Item -ItemType Directory -Path $Folder -Force | Out-Null
      Tulis 'Membuat keystore (RSA 4096 bit, berlaku 10000 hari)...'
      if ($jenis -eq 'keytool') {
        New-KeystoreKeytool $alat $Jalur $Alias $DName
      } else {
        New-KeystoreOpenSsl $alat $Jalur $Alias $DName
      }
      $sidik = Get-SidikJari $alat $jenis $Jalur $Alias
      if (-not $sidik) { throw "Keystore dibuat tetapi tidak bisa dibaca ulang ($(Get-BarisTerakhir $script:PesanAlatTerakhir)). Ganti nama berkas $Jalur lalu ulangi." }
      Write-BacaSaya $Folder $Alias $sidik $namaAlat $DName
      Tulis 'Keystore berhasil dibuat.' Green
    } else {
      Tulis ''
      Tulis 'Keystore sudah ada dan TIDAK akan ditimpa. Masukkan kata sandinya untuk memeriksa.' Yellow
      for ($coba = 1; ($coba -le 3) -and (-not $sidik); $coba++) {
        $sandi = Read-SandiTersembunyi 'Kata sandi keystore'
        if (-not $sandi) { Tulis '  Kata sandi kosong.' Yellow; continue }
        Set-SandiProses $sandi
        $sandi = $null
        $sidik = Get-SidikJari $alat $jenis $Jalur $Alias
        if ($sidik) { break }
        $alasan = Get-AlasanGagal $script:PesanAlatTerakhir
        if ($alasan -eq 'alias') { throw "Alias '$Alias' tidak ada di keystore ini. Jalankan lagi dengan -Alias <alias yang benar>." }
        if ($alasan -eq 'rusak') {
          throw "Keystore tidak bisa dibaca ($(Get-BarisTerakhir $script:PesanAlatTerakhir)). Bila berkasnya rusak, ganti namanya (jangan dihapus), lalu jalankan skrip ini lagi."
        }
        Tulis '  Kata sandi salah.' Yellow
      }
      if (-not $sidik) {
        throw ('Kata sandi keystore tidak cocok setelah 3 kali percobaan. Bila Anda yakin kata sandinya benar, ' +
          'berkasnya mungkin rusak: coba salinan cadangan (mis. dari flashdisk) dengan -Folder. ' +
          'Jangan hapus keystore ini dan jangan ubah secrets GitHub yang sudah berfungsi.')
      }
    }
  } finally {
    Clear-SandiProses
  }

  Tulis ''
  Tulis "Sidik jari sertifikat (SHA-256): $sidik" Green
  Tulis '  Sidik jari ini akan tercantum di catatan rilis GitHub; cocokkan untuk memastikan APK memakai kunci ini.'

  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Jalur))
  $url = Get-UrlSecrets $RepoRoot
  Tulis ''
  Tulis '=== Isi Repository secrets di GitHub ===' Cyan
  if ($url) {
    Tulis "Halaman: $url"
  } else {
    Tulis 'Buka repositori di GitHub > Settings > Secrets and variables > Actions.'
  }
  Tulis 'Untuk tiap secret: klik "New repository secret", isi Name dan Secret, lalu klik "Add secret".'
  Tulis 'Bila secret dengan nama itu sudah ada, klik ikon pensil di sampingnya lalu ganti isinya (Update secret).'
  if ($url -and (Read-YaTidak 'Buka halaman itu di browser sekarang?' $true)) { Start-Process $url }

  Tulis ''
  # Uji penandaan clipboard dengan alias (bukan rahasia) sebelum isi keystore disalin.
  if (-not (Copy-KeClipboard $Alias)) {
    Tulis 'Peringatan: clipboard tidak bisa ditandai privat. Isi keystore yang disalin bisa masuk' Yellow
    Tulis 'Riwayat Clipboard (Win+V) dan ikut tersinkron ke perangkat lain bila fitur itu aktif.' Yellow
    if (-not (Read-YaTidak 'Tetap lanjut dengan clipboard biasa?' $false)) { throw 'Dibatalkan sebelum isi keystore disalin.' }
  }
  try {
    [void](Copy-KeClipboard $b64)
    Tulis '1) Name   : ANDROID_KEYSTORE_BASE64'
    Tulis "   Secret : tempel dengan Ctrl+V (isi keystore, $($b64.Length) karakter, sudah disalin ke clipboard)"
    [void](Read-Host -Prompt '   Tekan Enter bila sudah')
    [void](Copy-KeClipboard $Alias)
    Tulis '2) Name   : ANDROID_KEY_ALIAS'
    Tulis "   Secret : $Alias (sudah disalin ke clipboard)"
    [void](Read-Host -Prompt '   Tekan Enter bila sudah')
  } finally {
    # Selalu dikosongkan, juga bila skrip dihentikan dengan Ctrl+C di tengah langkah ini.
    Clear-KeClipboard
  }
  Tulis '3) Name   : ANDROID_KEYSTORE_PASSWORD'
  Tulis '   Secret : ketik sendiri kata sandi keystore tadi (clipboard sudah dikosongkan)'
  [void](Read-Host -Prompt '   Tekan Enter bila sudah')
  Tulis ''
  Tulis 'Secret ANDROID_KEY_PASSWORD tidak diperlukan: keystore ini memakai satu kata sandi.'
  Tulis 'Bila secret itu sudah pernah dibuat, hapus (ikon tempat sampah) agar tidak dipakai.'
  if ($script:ClipboardTerlindungi) {
    Tulis 'Isi clipboard tadi ditandai agar tidak masuk Riwayat Clipboard (Win+V) maupun sinkronisasi.'
  } else {
    Tulis 'Bila Riwayat Clipboard (Win+V) aktif, hapus entri isi keystore tadi dari riwayat.'
  }

  Tulis ''
  Tulis '=== Cadangkan kunci ini ===' Cyan
  Tulis "Folder: $Folder"
  if ($env:OneDrive -and $Folder.StartsWith($env:OneDrive, [StringComparison]::OrdinalIgnoreCase)) {
    Tulis '  Folder ini ikut tersinkron ke OneDrive (cadangan daring).'
  }
  Tulis '  Simpan satu salinan lagi di flashdisk, dan simpan kata sandinya di tempat terpisah.'
  if (Read-YaTidak 'Buka folder keystore sekarang?' $true) { Invoke-Item -LiteralPath $Folder }
  Tulis ''
  Tulis 'Selesai. Build berikutnya di cabang main akan menghasilkan APK rilis bertanda tangan.' Green
  Tulis 'Build berjalan otomatis saat ada push ke main yang mengubah app/ atau mobile/; bila tidak ada,'
  Tulis 'jalankan dari GitHub: Actions > Build APK Android > Run workflow.'
} catch {
  Tulis ''
  Tulis ('GAGAL: ' + $_.Exception.Message) Red
  exit 1
}
