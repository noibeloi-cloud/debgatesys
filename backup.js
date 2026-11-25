'use strict';
/* Daily snapshot backups of the attendance data (pure Node, no Electron dependency so it can be unit-tested). */
const fs = require('fs');
const path = require('path');

const KEEP_FILES = 30;                                   // one file per day, newest 30 kept
const NAME_RE = /^deborah-backup-(\d{4}-\d{2}-\d{2})\.json$/;
const pad = n => String(n).padStart(2, '0');
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function peopleCount(json) {                             // -1 = not valid attendance data
  try { const d = JSON.parse(json); return Array.isArray(d && d.people) ? d.people.length : -1; }
  catch (_) { return -1; }
}

function pruneBackups(dir, keep = KEEP_FILES) {
  const files = fs.readdirSync(dir).filter(f => NAME_RE.test(f)).sort();   // oldest first (ISO dates sort correctly)
  files.slice(0, Math.max(0, files.length - keep)).forEach(f => fs.unlinkSync(path.join(dir, f)));
}

/* Writes/refreshes today's snapshot. The file can be loaded with the app's "Restore" button.
   Never replaces a snapshot that has people in it with an empty one (e.g. after "Empty system"). */
function writeBackup(dir, json, now = new Date(), keep = KEEP_FILES) {
  if (typeof json !== 'string' || !json.trim()) return { status: 'no-data' };
  const n = peopleCount(json);
  if (n < 0) return { status: 'invalid' };
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `deborah-backup-${dayStamp(now)}.json`);
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file, 'utf8');
    if (old === json) return { status: 'unchanged', file };
    if (n === 0 && peopleCount(old) > 0) return { status: 'skipped-empty', file };
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, file);                              // atomic replace: a crash never leaves a half-written backup
  pruneBackups(dir, keep);
  return { status: 'written', file };
}

module.exports = { writeBackup, pruneBackups, dayStamp, peopleCount, KEEP_FILES };
