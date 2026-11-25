# DEBORAH Attendance Station — desktop app (Windows + macOS)

The offline barcode attendance system, packaged as an installable desktop program (Electron).
All attendance logic lives in `app/index.html`; `main.js` only provides the window, full-screen mode and automatic backups.
The same code runs on **Windows 10/11** and **macOS** (Intel and Apple Silicon).

## 1. Get the installers — pick ONE route

### Route A — GitHub builds both for you (no Mac needed)  ← recommended
1. Create a free account at github.com and a new repository; upload this whole folder to it.
2. Open the repository's **Actions** tab → **Build desktop apps** → **Run workflow**.
3. Wait about 5–10 minutes, open the finished run, and download from **Artifacts**:
   - `installers-windows-latest` → `DEBORAH Attendance Station-Setup-1.0.0.exe` (installer) and `…-Portable-1.0.0.exe` (no install, runs from a USB stick)
   - `installers-macos-latest` → `…-1.0.0-mac-x64.dmg` (Intel Macs) and `…-1.0.0-mac-arm64.dmg` (Apple Silicon: M1/M2/M3/M4)

### Route B — build on your own computer
1. Install **Node.js (LTS)** from https://nodejs.org
2. In a terminal inside this folder:
   ```
   npm install --save-dev electron electron-builder
   npm start              # try it
   npm run dist:win       # on Windows  -> dist/*.exe
   npm run dist:mac       # on a Mac    -> dist/*.dmg
   ```
   Windows installers must be built on Windows and Mac installers on a Mac (Route A avoids this).

Before building, put your name in `"author"` in `package.json`.

## 2. First launch — "unknown developer" warnings (the installers are unsigned)

Signing removes these warnings but needs paid certificates (Apple Developer Program, Windows code-signing). For a capstone, just click through once:

- **Windows:** SmartScreen says "Windows protected your PC" → **More info → Run anyway**.
- **macOS:** open the `.dmg`, drag the app to **Applications**, then **right-click the app → Open → Open**.
  If macOS says the app is "damaged" or can't be opened (common on Apple Silicon for downloaded unsigned apps), run this once in Terminal, then open it normally:
  ```
  xattr -cr "/Applications/DEBORAH Attendance Station.app"
  ```
- **macOS, first backup:** macOS may ask to allow the app to access your Documents folder — choose **Allow**, so backups can be saved.
- **macOS, USB scanner:** the first time you plug the scanner in, macOS may open "Keyboard Setup Assistant". Just close it — the scanner works as a normal keyboard.

## 3. Using it at the entrance

- Plug in the USB barcode scanner (keyboard-wedge mode, **Code 39 enabled**, Enter suffix) and keep the **Station** tab open. Scans work without clicking anything.
- Set operating hours and auto check-out under **⏱ Time limits** in the footer (default: auto check-out at 18:00).
- Only one copy can run at a time; launching it again brings the existing window forward.

| Action | Windows | macOS |
|---|---|---|
| Full screen | `F11` | `Ctrl` `Cmd` `F` |
| Zoom in / out / reset | `Ctrl` `+` / `-` / `0` | `Cmd` `+` / `-` / `0` |
| Open backups folder | `Ctrl` `Shift` `B` | `Cmd` `Shift` `B` |

## 4. Your data and backups

- Data lives on this computer inside the app's own profile folder and is kept between launches and updates.
- **Automatic backups:** every 5 minutes and when the window is closed, a snapshot is saved to  
  Windows: `Documents\DEBORAH Attendance Backups` · macOS: `~/Documents/DEBORAH Attendance Backups`  
  as `deborah-backup-YYYY-MM-DD.json`. One file per day, newest 30 days kept. A snapshot that has people in it is never overwritten by an empty one.
- **Restoring / moving between computers (Windows ⇄ Mac, or from the old browser version):** in the app, footer → **Restore**, then choose a backup file. The app's own "Backup JSON" export works too.
- Copy the backups folder to a USB drive or cloud storage regularly — a backup on the same computer does not help if that computer fails.

## 5. Updating

Replace `app/index.html` with the new version, raise `"version"` in `package.json`, and rebuild (Route A or B). Data is not touched by updates.

## 6. Project layout

```
main.js                  Electron main process (window, shortcuts, backups, hardening, macOS menu)
backup.js                daily backup + rotation logic (unit-tested)
app/index.html           the attendance system (single file, no internet needed)
build/                   app icons (png for macOS/Linux, ico for Windows)
test/                    npm test → backup logic + main-process wiring on Windows and macOS (mocked Electron)
.github/workflows/       one-click build of both installers on GitHub
```

Developer extra: set the environment variable `DEBORAH_DEBUG=1` to enable `F12` developer tools.
