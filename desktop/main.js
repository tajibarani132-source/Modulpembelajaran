'use strict';
/*
 * Modul RPS IAIN Parepare - proses utama aplikasi desktop (Electron).
 *
 * Memuat aplikasi web statis dari folder app/ (berjalan luring/offline).
 * Tanpa pembaruan otomatis, tanpa telemetri, dan tanpa memuat konten jarak jauh:
 * tautan http(s) dibuka di peramban bawaan, bukan di dalam jendela aplikasi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');

const APP_ID = 'id.ac.iainpare.modulrps';
const WINDOW_TITLE = 'Modul RPS — IAIN Parepare';
const APP_DIR = path.join(__dirname, 'app');
const INDEX_HTML = path.join(APP_DIR, 'index.html');
const ICON_PATH = path.join(__dirname, 'icon.png');

// Izin peramban yang boleh diberikan; selain ini (kamera, mikrofon, lokasi, dll.) ditolak.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

let mainWindow = null;

/** Apakah URL menunjuk berkas di dalam folder app/ (aplikasi itu sendiri)? */
function isAppUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    const target = path.normalize(fileURLToPath(parsed)).toLowerCase();
    const root = path.normalize(APP_DIR).toLowerCase();
    return target === root || target.startsWith(root + path.sep);
  } catch (err) {
    return false;
  }
}

/** Buka tautan http(s)/mailto di aplikasi bawaan sistem; skema lain diabaikan. */
function openExternalSafely(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      shell.openExternal(parsed.toString()).catch(() => {});
    }
  } catch (err) {
    /* URL tidak valid: abaikan */
  }
}

function showAbout() {
  const options = {
    type: 'info',
    title: 'Tentang',
    message: 'Modul RPS IAIN Parepare',
    detail: [
      'Versi ' + app.getVersion(),
      '',
      'Aplikasi untuk mengonversi RPS (Rencana Pembelajaran Semester) menjadi Modul Pembelajaran dalam format PDF dan Word.',
      'Institut Agama Islam Negeri (IAIN) Parepare.',
      '',
      'Electron ' + process.versions.electron + ' · Chromium ' + process.versions.chrome
    ].join('\n'),
    buttons: ['Tutup'],
    noLink: true
  };
  if (mainWindow) dialog.showMessageBox(mainWindow, options);
  else dialog.showMessageBox(options);
}

function buildMenu() {
  const template = [
    {
      label: 'Berkas',
      submenu: [{ label: 'Keluar', role: 'quit' }]
    },
    {
      label: 'Tampilan',
      submenu: [
        { label: 'Muat ulang', role: 'reload' },
        { type: 'separator' },
        { label: 'Perbesar', role: 'zoomIn' },
        { label: 'Perkecil', role: 'zoomOut' },
        { label: 'Ukuran normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Layar penuh', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Bantuan',
      submenu: [{ label: 'Tentang', click: showAbout }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Setiap unduhan (PDF, Word, berkas proyek) selalu memunculkan dialog Simpan. */
function setupDownloads(ses) {
  ses.on('will-download', (_event, item) => {
    const fileName = item.getFilename() || 'Modul Pembelajaran';
    const ext = path.extname(fileName).toLowerCase();
    const filters = [];
    if (ext === '.pdf') filters.push({ name: 'Dokumen PDF', extensions: ['pdf'] });
    else if (ext === '.docx') filters.push({ name: 'Dokumen Word', extensions: ['docx'] });
    else if (ext === '.json') filters.push({ name: 'Berkas proyek modul', extensions: ['json'] });
    filters.push({ name: 'Semua berkas', extensions: ['*'] });

    item.setSaveDialogOptions({
      title: 'Simpan berkas',
      buttonLabel: 'Simpan',
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters
    });

    item.once('done', (_e, state) => {
      if (state === 'interrupted') {
        dialog.showErrorBox('Gagal menyimpan berkas', 'Berkas "' + fileName + '" tidak dapat disimpan. Coba lagi atau pilih folder lain.');
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: WINDOW_TITLE,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: '#F3F5F9',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      plugins: true // penampil PDF bawaan untuk pratinjau PDF di dalam aplikasi
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Judul jendela tetap "Modul RPS — IAIN Parepare" walaupun judul halaman berubah.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  const contents = mainWindow.webContents;

  // Menu klik kanan sederhana untuk kolom isian (mis. menempel kunci API) dan teks terpilih.
  contents.on('context-menu', (_event, params) => {
    const can = params.editFlags || {};
    let template = null;
    if (params.isEditable) {
      template = [
        { label: 'Batalkan', role: 'undo', enabled: !!can.canUndo },
        { label: 'Ulangi', role: 'redo', enabled: !!can.canRedo },
        { type: 'separator' },
        { label: 'Potong', role: 'cut', enabled: !!can.canCut },
        { label: 'Salin', role: 'copy', enabled: !!can.canCopy },
        { label: 'Tempel', role: 'paste', enabled: !!can.canPaste },
        { type: 'separator' },
        { label: 'Pilih semua', role: 'selectAll', enabled: !!can.canSelectAll }
      ];
    } else if (params.selectionText && params.selectionText.trim()) {
      template = [{ label: 'Salin', role: 'copy' }];
    }
    if (template && mainWindow) Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });

  // Jendela utama tidak boleh berpindah dari aplikasi; tautan luar dibuka di peramban.
  contents.on('will-navigate', (event, url) => {
    const target = (event && event.url) || url;
    if (isAppUrl(target)) return;
    event.preventDefault();
    openExternalSafely(target);
  });

  // Bingkai (iframe) juga tidak boleh memuat situs web; pratinjau PDF (blob:) tetap diizinkan.
  contents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return;
    if (/^(https?|mailto):/i.test(details.url || '')) {
      details.preventDefault();
      openExternalSafely(details.url);
    }
  });

  // Ctrl+= dan Ctrl+Numpad(+/-) untuk memperbesar/memperkecil tampilan.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    let delta = 0;
    if (input.code === 'NumpadAdd' || (input.key === '=' && !input.shift)) delta = 0.5;
    else if (input.code === 'NumpadSubtract') delta = -0.5;
    if (!delta) return;
    event.preventDefault();
    contents.setZoomLevel(Math.max(-3, Math.min(5, contents.getZoomLevel() + delta)));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(INDEX_HTML);
}

if (!app.requestSingleInstanceLock()) {
  // Aplikasi sudah berjalan: jendela yang ada akan difokuskan oleh instans pertama.
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Berlaku untuk semua isi web (termasuk penampil PDF): jendela baru tidak dibuka di aplikasi.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url);
      return { action: 'deny' };
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    });
    setupDownloads(ses);
    buildMenu();
    createWindow();
  });
}
