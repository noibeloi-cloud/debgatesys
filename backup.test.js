'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeBackup, pruneBackups, dayStamp, peopleCount } = require('../backup');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deborah-bk-'));
const data = n => JSON.stringify({ people: Array.from({ length: n }, (_, i) => ({ code: 'A-' + i })), days: {}, seq: 1 });
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
let t = 0; const ok = (c, m) => { assert.ok(c, m); t++; };

ok(dayStamp(at(2026, 3, 5)) === '2026-03-05', 'dayStamp pads month/day');
ok(peopleCount('not json') === -1 && peopleCount('{"x":1}') === -1 && peopleCount(data(3)) === 3, 'peopleCount');

let r = writeBackup(dir, data(2), at(2026, 3, 5));
ok(r.status === 'written' && path.basename(r.file) === 'deborah-backup-2026-03-05.json', 'first write');
ok(fs.readFileSync(r.file, 'utf8') === data(2), 'content stored verbatim');
ok(!fs.existsSync(r.file + '.tmp'), 'no temp file left behind');
ok(writeBackup(dir, data(2), at(2026, 3, 5)).status === 'unchanged', 'identical data is not rewritten');
ok(writeBackup(dir, data(5), at(2026, 3, 5)).status === 'written' && peopleCount(fs.readFileSync(r.file, 'utf8')) === 5, 'later same-day save refreshes the file');

ok(writeBackup(dir, data(0), at(2026, 3, 5)).status === 'skipped-empty' && peopleCount(fs.readFileSync(r.file, 'utf8')) === 5, 'empty data never replaces a good backup');
ok(writeBackup(dir, data(0), at(2026, 3, 6)).status === 'written', 'but an empty system still gets its own new-day file');
ok(writeBackup(dir, '{"broken', at(2026, 3, 7)).status === 'invalid', 'corrupt JSON rejected');
ok(writeBackup(dir, '{"nope":1}', at(2026, 3, 7)).status === 'invalid', 'JSON without people rejected');
ok(writeBackup(dir, null, at(2026, 3, 7)).status === 'no-data' && writeBackup(dir, '  ', at(2026, 3, 7)).status === 'no-data', 'null / blank = no data');
ok(!fs.existsSync(path.join(dir, 'deborah-backup-2026-03-07.json')), 'nothing written for rejected input');

// rotation: keep only the newest N daily files, leave unrelated files alone
fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
for (let d = 1; d <= 40; d++) writeBackup(dir, data(d % 3 + 1), at(2026, 4, d > 30 ? d - 30 : d) , 30);   // April, then May reuse = few new names
for (let d = 1; d <= 12; d++) writeBackup(dir, data(1), at(2026, 5, d), 30);
const names = fs.readdirSync(dir).filter(f => f.startsWith('deborah-backup-')).sort();
ok(names.length <= 30, 'never more than 30 daily files (got ' + names.length + ')');
ok(names[names.length - 1] === 'deborah-backup-2026-05-12.json', 'newest kept');
ok(!names.includes('deborah-backup-2026-03-05.json'), 'oldest pruned');
ok(fs.existsSync(path.join(dir, 'notes.txt')), 'unrelated files untouched');
pruneBackups(dir, 5);
ok(fs.readdirSync(dir).filter(f => f.startsWith('deborah-backup-')).length === 5, 'pruneBackups(keep=5)');

// the saved file is exactly what the app's Restore button accepts: raw app data with a people array
const last = JSON.parse(fs.readFileSync(path.join(dir, 'deborah-backup-2026-05-12.json'), 'utf8'));
ok(Array.isArray(last.people), 'backup is raw app data (restorable)');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`backup.test.js: ${t} checks passed`);
