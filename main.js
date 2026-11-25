'use strict';
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { writeBackup } = require('./backup');

const STORAGE_KEY = 'deborah.attendance.v1';            // the key index.html saves its data under
const BACKUP_EVERY_MS = 5 * 60 * 1000;
const DEBUG = process.env.DEBORAH_DEBUG === '1';

/* Keep the data folder stable even if productName is ever changed. Must run before the app is ready. */
app.setPath('userData', path.join(app.getPath('appData'), 'deborah-attendance-station'));
/* Scan beeps must play without a prior mouse click (a scanner keystroke is the only input). */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null, timer = null, closing = false;
const backupDir = () => path.join(app.getPath('documents'), 'DEBORAH Attendance Backups');

async function backupNow() {
  if (!win || win.isDestroyed()) return;
  try {
    const json = await win.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`, true);
    writeBackup(backupDir(), json);
  } catch (err) { console.error('[backup]', err && err.message); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'DEBORAH Attendance Station',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  /* the page is fully offline: refuse popups, external navigation and device permissions */
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  win.webContents.on('did-finish-load', () => {
    clearInterval(timer);
    timer = setInterval(backupNow, BACKUP_EVERY_MS);
    setTimeout(backupNow, 15 * 1000);
  });

  /* shortcuts:  F11 full screen (Mac: Ctrl+Cmd+F) · Ctrl/Cmd +/-/0 zoom · Ctrl/Cmd+Shift+B open backups folder */
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const wc = win.webContents, ctrl = input.control || input.meta, key = String(input.key || '');
    if (key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    else if (DEBUG && key === 'F12') { wc.toggleDevTools(); event.preventDefault(); }
    else if (ctrl && input.shift && key.toLowerCase() === 'b') {
      fs.mkdirSync(backupDir(), { recursive: true });
      shell.openPath(backupDir());
      event.preventDefault();
    }
    else if (ctrl && (key === '=' || key === '+')) { wc.setZoomLevel(wc.getZoomLevel() + 0.5); event.preventDefault(); }
    else if (ctrl && key === '-') { wc.setZoomLevel(wc.getZoomLevel() - 0.5); event.preventDefault(); }
    else if (ctrl && key === '0') { wc.setZoomLevel(0); event.preventDefault(); }
  });

  /* take a final backup when the window is closed (max 2.5 s), then really close */
  win.on('close', e => {
    if (closing) return;
    e.preventDefault(); closing = true;
    Promise.race([backupNow(), new Promise(r => setTimeout(r, 2500))])
      .finally(() => { clearInterval(timer); if (win && !win.isDestroyed()) win.destroy(); });
  });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();                                            // two copies would fight over the same data
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    /* Windows/Linux: no menu bar. macOS: a minimal menu is required for Cmd+Q and Cmd+C/V in text fields,
       plus native full screen (Ctrl+Cmd+F) because Macs have no F11 key. */
    Menu.setApplicationMenu(process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { role: 'appMenu' }, { role: 'editMenu' },
          { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
          { role: 'windowMenu' }
        ])
      : null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
