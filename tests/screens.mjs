import { launch, settle } from './lib/browser.mjs';

// Late-game screen audit. A capped character with an absurdly long name draws
// every location (chss.*) the mod added, then every one of the game's own, and
// each choice line is checked for what .chs does badly: a fixed 22px row with no
// overflow rule, so a line that wraps spills over the next one. Only the mod's
// own screens can fail this; the author's offenders are listed, not judged.
//
//   PORT=8080 node tests/screens.mjs            BROWSER=webkit for Safari's engine

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const res = await p.evaluate(() => {
  you.name = 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley III';
  you.lvl = 110;
  for (const k in skl) { const s = skl[k]; if (s && typeof s === 'object' && 'lvl' in s) s.lvl = 110; }
  try { allbuff(you); you.hp = you.hpmax; } catch (e) {}
  for (const f of ['dj1rw6', 'tr1_win', 'tr2_win', 'tr3_win', 'mod_t_forest', 'mod_t_deep', 'mod_t_cata', 'trne1e1', 'trne3e1', 'trne4e1'])
    global.flags[f] = true;
  const rows = []; const threw = [];
  for (const k in chss) {
    const c = chss[k];
    if (!c || typeof c.sl !== 'function') continue;
    try { c.sl(); } catch (e) { threw.push(k); continue; }
    const box = dom.ctr_2; if (!box) continue;
    const lines = [].slice.call(box.querySelectorAll('.chs'));
    const bad = lines.filter(l => l.scrollHeight > l.clientHeight + 1 || l.scrollWidth > l.clientWidth + 1)
      .map(l => l.textContent.slice(0, 60));
    const over = box.scrollHeight > box.clientHeight + 1;
    rows.push({ k, mod: /^mod_/.test(k) || (c.id >= 970 && c.id <= 990), n: lines.length, bad, over });
  }
  return { rows, threw };
});

const mine = res.rows.filter(r => r.mod), his = res.rows.filter(r => !r.mod);
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };
console.log(`drew ${res.rows.length} screens (${mine.length} the mod's), ${res.threw.length} would not draw out of context`);
const hisBad = his.filter(r => r.bad.length);
console.log(`     the author's screens with a spilling line, left alone: ${hisBad.map(r => r.k).join(', ') || 'none'}`);
check(mine.length >= 8, `the mod's screens were drawn (${mine.map(r => r.k).join(', ')})`);
for (const r of mine) {
  check(r.bad.length === 0, `${r.k}: no line wraps or spills at cap ${r.bad.length ? JSON.stringify(r.bad) : ''}`);
}
check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
