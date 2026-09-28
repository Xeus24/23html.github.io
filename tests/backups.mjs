import { launch, settle as settlePage } from './lib/browser.mjs';
import fs from 'node:fs';

// Save backups (sections 0 and 44).
//
// The first time a new version of the mod loads it copies every save before
// the game has read one. That copy has to be made FIRST in mod.js: an update
// that breaks is exactly when it is wanted, and a section that throws stops
// every line after it while the game still loads and autosaves.
//
// Clears and rewrites localStorage and reloads the page repeatedly -- run it in
// the fresh profile the runner gives it, not against a browser you play in.
//
//   PORT=8080 node tests/backups.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
p.on('dialog', d => d.accept());
const settle = () => settlePage(p);
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' }); await settle();

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- it runs first');
const src = fs.readFileSync(new URL('../mod.js', import.meta.url), 'utf8');
const at = src.indexOf('A BACKUP OF YOUR SAVE BEFORE AN UPDATE LOADS');
check(at > 0 && at < src.indexOf('1. SPEED CONTROL'),
  'the snapshot comes before section 1, so nothing that throws can stop it');

console.log('\n--- nothing to back up, nothing backed up');
const first = await p.evaluate(() => ({ n: MOD_backupList().length, ver: localStorage.getItem(MOD.backup_ver), v: MOD.version }));
check(first.n === 0, `a first load with no save makes no backup (${first.n})`);
check(first.ver === first.v, 'and records the version it has seen');

console.log('\n--- a new version backs up the save it is about to load');
const blob = await p.evaluate(() => { you.name = 'Alpha'; save(); localStorage.setItem(MOD.backup_ver, '4.2');
  return localStorage.getItem('v0.3'); });
await p.reload({ waitUntil: 'load' }); await settle();
const after = await p.evaluate(() => { const l = MOD_backupList().filter(b => b.n <= MOD.backup_count);
  const daily = MOD_backupRead(MOD.backup_daily);
  return { n: l.length, reason: l[0] && l[0].rec.reason, live: l[0] && l[0].rec.live, num: l[0] && l[0].n,
           ver: localStorage.getItem(MOD.backup_ver), daily: daily && daily.reason, dailyLive: daily && daily.live }; });
check(after.n === 1, `one version backup made (${after.n})`);
check(after.live === blob, 'holding exactly the save the game was about to read');
check(/from v4\.2/.test(after.reason || ''), `and saying why (${after.reason})`);
check(after.daily === 'daily' && after.dailyLive === blob, 'and the first daily backup, in its own place');
await p.reload({ waitUntil: 'load' }); await settle();
const again = await p.evaluate(() => ({ n: MOD_backupList().filter(b => b.n <= MOD.backup_count).length,
                                        dailyT: MOD_backupRead(MOD.backup_daily).t }));
check(again.n === 1, `the same version does not back up again (${again.n})`);

console.log('\n--- the daily backup');
await p.evaluate(() => { const r = MOD_backupRead(MOD.backup_daily); r.t = Date.now() - 2 * 86400000;
  localStorage.setItem(MOD.backup_key + MOD.backup_daily, JSON.stringify(r)); });
await p.reload({ waitUntil: 'load' }); await settle();
const d1 = await p.evaluate(() => MOD_backupRead(MOD.backup_daily).t);
await p.reload({ waitUntil: 'load' }); await settle();
const d2 = await p.evaluate(() => MOD_backupRead(MOD.backup_daily).t);
check(Date.now() - d1 < 60000, 'a day-old daily backup is replaced on the next load');
check(d2 === d1, 'and not again the same day');

console.log('\n--- restoring puts the character back, and can be undone');
await p.evaluate(() => { you.name = 'Beta'; save(); });
await p.evaluate(n => { setTimeout(() => MOD_restoreBackup(n), 0); }, after.num);
await p.waitForTimeout(800); await p.waitForLoadState('load'); await settle();
const restored = await p.evaluate(() => {
  const undo = MOD_backupList().find(b => /before restoring/.test(b.rec.reason));
  return { name: you.name, undo: !!undo, undoWho: undo ? MOD_backupWho(undo.rec) : '' };
});
check(restored.name === 'Alpha', `the backup's character is back (${restored.name})`);
check(restored.undo && /Beta/.test(restored.undoWho), `and the one it replaced was backed up first (${restored.undoWho})`);

console.log('\n--- three kept, oldest replaced');
const rot = await p.evaluate(() => {
  const dailyBefore = MOD_backupRead(MOD.backup_daily).seq;
  for (let i = 0; i < 5; i++) MOD_makeBackup('rotation ' + i);
  const l = MOD_backupList();
  return { reasons: l.filter(b => b.n <= MOD.backup_count).map(b => b.rec.reason),
           dailyKept: MOD_backupRead(MOD.backup_daily).seq === dailyBefore };
});
check(rot.dailyKept, 'rotation never touches the daily backup');
check(rot.reasons.length === 3, `${rot.reasons.length} backups kept`);
check(rot.reasons.includes('rotation 4') && !rot.reasons.includes('rotation 0'), `the newest survive (${rot.reasons.join(' / ')})`);

console.log('\n--- no room is not an error');
const full = await p.evaluate(() => {
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (String(k).indexOf('p23_backup_') === 0) throw new Error('QuotaExceededError');
    return real.apply(this, arguments);
  };
  let n, threw = false;
  const before = MOD_backupList().length;
  try { n = MOD_makeBackup('no room'); } catch (e) { threw = true; }
  Storage.prototype.setItem = real;
  return { n, threw, before, after: MOD_backupList().length };
});
check(!full.threw && full.n === 0, 'a full localStorage skips the backup quietly');
check(full.before - 1 <= full.after && full.after >= 2,
  `and costs at most the one it was replacing (${full.before} -> ${full.after}); it once deleted them all`);

console.log('\n--- a backup as a file, and back');
const dl = p.waitForEvent('download');
const want = await p.evaluate(() => { const b = MOD_backupList()[0]; MOD_downloadBackup(b.n); return b.rec.live; });
const file = await dl;
const text = await (await import('node:fs')).promises.readFile(await file.path(), 'utf8');
let parsed = null; try { parsed = JSON.parse(text); } catch (e) {}
check(/^proto23-backup-\d{4}-\d\d-\d\d-v[\d.]+\.json$/.test(file.suggestedFilename()), `downloads as ${file.suggestedFilename()}`);
check(parsed && parsed.live === want, 'holding the save itself');
await p.evaluate(() => { MOD_pickBackupFile(); });
await p.setInputFiles('#mod_backup_file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
await p.waitForTimeout(400);
const loaded = await p.evaluate(w => MOD_backupList().some(b => /from a file/.test(b.rec.reason) && b.rec.live === w), want);
check(loaded, 'and a downloaded file loads back into the list, ready to restore');
const junk = await p.evaluate(() => MOD_loadBackupText('{"hello":1}'));
check(junk === 0, 'a file that is not a backup is refused');

console.log('\n--- the panel');
const panel = await p.evaluate(() => { MOD_toggleSlotPanel(true);
  const t = MOD_SLOTUI.panel.textContent;
  const restores = [].slice.call(MOD_SLOTUI.panel.querySelectorAll('span')).filter(s => s.textContent === 'restore').length;
  MOD_toggleSlotPanel(false);
  return { hasList: /Backups/.test(t) && /back up now/.test(t), restores, n: MOD_backupList().length }; });
check(panel.hasList, 'the saves panel lists the backups');
check(panel.restores === panel.n, `with a restore button for each (${panel.restores})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — a new version backs up every save first, and a backup can be put back.');
