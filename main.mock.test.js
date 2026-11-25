'use strict';
/* Loads main.js against a mocked "electron" module (real Electron is not needed to test the wiring). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deborah-main-'));
const appData = path.join(tmp, 'appdata'), docs = path.join(tmp, 'docs');
const calls = { paths: {}, switches: [], opened: [], quit: 0, menu: 'unset', permission: null };
const appHandlers = {};
let winInstance = null, jsResult = JSON.stringify({ people: [{ code: 'A-1' }], days: {}, seq: 1002 });

class FakeWC {
  constructor() { this.h = {}; this.zoom = 0; this.openHandler = null; }
  on(e, f) { this.h[e] = f; }
  setWindowOpenHandler(f) { this.openHandler = f; }
  executeJavaScript(code) { this.lastJs = code; return Promise.resolve(jsResult); }
  getZoomLevel() { return this.zoom; } setZoomLevel(z) { this.zoom = z; }
  toggleDevTools() { this.devtools = true; }
}
class FakeWin {
  constructor(opts) { this.opts = opts; this.wc = this.webContents = new FakeWC(); this.h = {}; this.once_ = {}; this.shown = false; this.fs = false; this.destroyed = false; winInstance = this; }
  once(e, f) { this.once_[e] = f; } on(e, f) { this.h[e] = f; }
  loadFile(f) { this.loaded = f; } show() { this.shown = true; }
  setFullScreen(v) { this.fs = v; } isFullScreen() { return this.fs; }
  isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; if (this.h.closed) this.h.closed(); }
  isMinimized() { return true; } restore() { this.restored = true; } focus() { this.focused = true; }
}
const electron = {
  app: {
    setPath: (k, v) => { calls.paths[k] = v; },
    getPath: k => ({ appData, documents: docs })[k],
    commandLine: { appendSwitch: (a, b) => calls.switches.push([a, b]) },
    requestSingleInstanceLock: () => true,
    on: (e, f) => { appHandlers[e] = f; },
    whenReady: () => Promise.resolve(),
    quit: () => { calls.quit++; }
  },
  BrowserWindow: FakeWin,
  Menu: { setApplicationMenu: m => { calls.menu = m; }, buildFromTemplate: t => ({ template: t }) },
  session: { defaultSession: { setPermissionRequestHandler: f => { calls.permission = f; } } },
  shell: { openPath: p => { calls.opened.push(p); } }
};
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? electron : orig.call(this, req, ...rest); };

let t = 0; const ok = (c, m) => { assert.ok(c, m); t++; };
const key = (k, extra = {}) => { const ev = { prevented: false, preventDefault() { this.prevented = true; } }; winInstance.wc.h['before-input-event'](ev, { type: 'keyDown', key: k, ...extra }); return ev; };

(async () => {
  require('../main.js');
  await new Promise(r => setImmediate(r));                         // let whenReady().then(createWindow) run

  ok(winInstance, 'window created on ready');
  const wp = winInstance.opts.webPreferences;
  ok(wp.contextIsolation === true && wp.nodeIntegration === false && wp.sandbox === true, 'secure webPreferences');
  ok(/app[\\/]index\.html$/.test(winInstance.loaded), 'loads app/index.html: ' + winInstance.loaded);
  ok(winInstance.opts.show === false, 'window hidden until ready');
  winInstance.once_['ready-to-show'](); ok(winInstance.shown, 'shown on ready-to-show');
  ok(calls.paths.userData === path.join(appData, 'deborah-attendance-station'), 'stable userData folder');
  ok(calls.switches.some(([a, b]) => a === 'autoplay-policy' && b === 'no-user-gesture-required'), 'autoplay switch (scan beeps)');
  ok(calls.menu === null, 'no menu bar on non-macOS');
  ok(typeof calls.permission === 'function' && (() => { let v; calls.permission(null, 'media', x => { v = x; }); return v === false; })(), 'device permissions denied');

  // hardening
  ok(winInstance.wc.openHandler().action === 'deny', 'popups denied');
  let ev = { prevented: false, preventDefault() { this.prevented = true; } };
  winInstance.wc.h['will-navigate'](ev, 'https://example.com'); ok(ev.prevented, 'external navigation blocked');
  ev = { prevented: false, preventDefault() { this.prevented = true; } };
  winInstance.wc.h['will-navigate'](ev, 'file:///x/app/index.html'); ok(!ev.prevented, 'local file navigation allowed');

  // shortcuts
  ok(key('F11').prevented && winInstance.fs === true, 'F11 enters full screen'); key('F11'); ok(winInstance.fs === false, 'F11 toggles back');
  key('=', { control: true }); ok(winInstance.wc.zoom === 0.5, 'Ctrl + zooms in'); key('-', { control: true }); key('-', { control: true }); ok(winInstance.wc.zoom === -0.5, 'Ctrl - zooms out');
  key('0', { control: true }); ok(winInstance.wc.zoom === 0, 'Ctrl 0 resets zoom');
  ok(key('B', { control: true, shift: true }).prevented && calls.opened[0] === path.join(docs, 'DEBORAH Attendance Backups') && fs.existsSync(calls.opened[0]), 'Ctrl+Shift+B opens (and creates) the backups folder');
  ok(!key('a').prevented && !key('7').prevented && !key('Enter').prevented, 'scanner keystrokes are never swallowed');
  ok(!key('F12').prevented && !winInstance.wc.devtools, 'dev tools disabled unless DEBORAH_DEBUG=1');
  const up = { prevented: false, preventDefault() { this.prevented = true; } };
  winInstance.wc.h['before-input-event'](up, { type: 'keyUp', key: 'F11' }); ok(!up.prevented && winInstance.fs === false, 'key-up ignored');

  // second launch focuses the existing window
  appHandlers['second-instance'](); ok(winInstance.restored && winInstance.focused, 'second instance restores + focuses');

  // closing: final backup is taken from the page's storage, then the window really closes
  const closeEv = { prevented: false, preventDefault() { this.prevented = true; } };
  winInstance.h.close(closeEv);
  ok(closeEv.prevented, 'first close is deferred for the final backup');
  await new Promise(r => setTimeout(r, 50));
  ok(winInstance.wc.lastJs === 'localStorage.getItem("deborah.attendance.v1")', 'reads the app\'s storage key: ' + winInstance.wc.lastJs);
  const files = fs.readdirSync(path.join(docs, 'DEBORAH Attendance Backups')).filter(f => /^deborah-backup-.*\.json$/.test(f));
  ok(files.length === 1 && fs.readFileSync(path.join(docs, 'DEBORAH Attendance Backups', files[0]), 'utf8') === jsResult, 'backup file written on close');
  ok(winInstance.destroyed, 'window destroyed after backup');
  appHandlers['window-all-closed'](); ok(calls.quit === 1, 'quits when the window is closed (all platforms)');

  // ── macOS scenario: fresh load of main.js with platform = darwin
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  delete require.cache[require.resolve('../main.js')];
  calls.menu = 'unset'; winInstance = null;
  require('../main.js');
  await new Promise(r => setImmediate(r));
  const roles = (calls.menu && calls.menu.template || []).map(m => m.role || m.label);
  ok(JSON.stringify(roles) === JSON.stringify(['appMenu', 'editMenu', 'View', 'windowMenu']), 'macOS menu: app, edit (copy/paste), View, window: ' + JSON.stringify(roles));
  ok(calls.menu.template[2].submenu[0].role === 'togglefullscreen', 'macOS has native full-screen toggle (no F11 on Macs)');
  ok(winInstance && winInstance.opts.webPreferences.sandbox === true, 'macOS window created with the same secure settings');
  key('=', { meta: true }); ok(winInstance.wc.zoom === 0.5, 'Cmd + zooms in on macOS');
  ok(key('B', { meta: true, shift: true }).prevented && calls.opened.length === 2, 'Cmd+Shift+B opens backups folder on macOS');
  ok(!key('a').prevented && !key('Enter').prevented, 'scanner keystrokes still never swallowed on macOS');
  Object.defineProperty(process, 'platform', realPlatform);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`main.mock.test.js: ${t} checks passed`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
