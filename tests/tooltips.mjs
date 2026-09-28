import { launch, settle } from './lib/browser.mjs';

// Every tooltip, rendered through the game's own dscr(), must read as text.
//
// The realm on the rank line once showed a page of program code: its text was
// a function, and addDesc only calls one when its sixth argument is true, so
// the game printed the function's source. Nothing failed, because every check
// asked what the line said, not what hovering it showed. This renders:
//
//   * every item, weapon, armour piece, shield, accessory, skill, title,
//     action and effect, the way the game draws each (dscr types 1, 6, 5, 2, 4)
//   * every tooltip the mod attaches while its own screens are drawn --
//     recorded by wrapping addDesc, then replayed through dscr
//
// and fails on anything that reads like code or a missing value: a function
// body, MOD_ names, undefined, NaN, null, Infinity, [object ...].
//
//   PORT=8080 node tests/tooltips.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

// The author's own test and placeholder effects, whose text is "dummy" and
// whose duration the game sets only when it applies them. His content; left.
const AUTHOR_PLACEHOLDERS = ['effect.test1', 'effect.bk1', 'effect.strawp'];

const r = await p.evaluate(() => {
  const BAD = /function\s*\(|=>|\breturn\b|\bvar\b|MOD_[A-Za-z]|\bundefined\b|\bNaN\b|\[object |\bnull\b|Infinity/;
  const ev = { clientX: 100, clientY: 100 };
  const out = [], errors = []; let n = 0;
  const look = (where, fn) => {
    try { empty(global.dscr); fn(); n++; }
    catch (e) { errors.push(where + ': throws ' + String(e.message || e).slice(0, 100)); return; }
    finally { global.dscr.style.display = 'none'; }
    const txt = global.dscr.textContent, m = txt.match(BAD);
    if (m) out.push({ where, hit: m[0], text: txt.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ') });
  };
  giveAction(act.mod_qi);

  const counts = {};
  [['item', item], ['wpn', wpn], ['eqp', eqp], ['sld', sld], ['acc', acc]].forEach(([nm, ns]) => {
    for (const k in ns) { const o = ns[k]; if (!o || typeof o !== 'object' || !o.name) continue;
      counts[nm] = (counts[nm] || 0) + 1; look(nm + '.' + k, () => dscr(ev, o, 1)); } });
  for (const k in skl) { const o = skl[k]; if (o && o.name) { counts.skl = (counts.skl || 0) + 1; look('skl.' + k, () => dscr(ev, o, 6)); } }
  for (const k in ttl) { const o = ttl[k]; if (o && o.name && o.name !== 'null') { counts.ttl = (counts.ttl || 0) + 1; look('ttl.' + k, () => dscr(ev, o, 5)); } }
  // renderAct: addDesc(el, null, 2, a.name, a.desc())
  for (const k in act) { const o = act[k]; if (o && o.name) { counts.act = (counts.act || 0) + 1;
    look('act.' + k, () => dscr(ev, null, 2, o.name, typeof o.desc === 'function' ? o.desc() : o.desc)); } }
  // eff_d: addDesc(icon, e, 4, e.name, e.desc)
  for (const k in effect) { const o = effect[k]; if (o && o.name) { counts.effect = (counts.effect || 0) + 1;
    look('effect.' + k, () => dscr(ev, o, 4, o.name, o.desc)); } }

  // the mod's own screens, with everything they are gated on open
  const rec = [], keep = addDesc; let at = '';
  addDesc = function (dm, what, type, ttl, dsc, f, id) {
    rec.push({ what, type, ttl, dsc, f, id, at }); return keep.apply(this, arguments); };
  try {
    Object.assign(global.flags, { trne4e1: true, mod_t_deep: true, mod_t_cata: true, dj1end: true, dj1rw6: true,
      mod_prog: { hollow: 99, spire: 99, vigil: 99 }, mod_realm: 3 });
    skl.qic.lvl = 30;
    for (const k in chss) { if (k.indexOf('mod_') !== 0 || typeof chss[k].sl !== 'function') continue;
      at = 'chss.' + k; try { chss[k].sl(); } catch (e) { errors.push(at + '.sl throws ' + String(e.message).slice(0, 80)); } }
    ['frstn1main', 'lsmain1', 't3'].forEach(k => { at = 'chss.' + k; try { chss[k].sl(); } catch (e) {} });
    at = 'the rank line'; MOD_HUD.span = null; MOD_hudRefresh(true);
  } finally { addDesc = keep; }
  rec.forEach(c => look(`${c.at} "${String(c.ttl).slice(0, 30)}"`,
    () => dscr(ev, c.what, c.type, c.ttl, c.f === true ? c.dsc() : c.dsc, c.id)));
  // and a tooltip text that is still a function would be printed as code
  const fnText = rec.filter(c => typeof c.dsc === 'function' && c.f !== true).map(c => c.at + ' "' + c.ttl + '"');
  return { out, errors, n, counts, screens: [...new Set(rec.map(c => c.at))], recorded: rec.length, fnText };
});

console.log(`rendered ${r.n} tooltips: ` + Object.keys(r.counts).map(k => `${r.counts[k]} ${k}`).join(', ') +
  `, and ${r.recorded} the mod attaches on ${r.screens.length} screens`);
const real = r.out.filter(o => AUTHOR_PLACEHOLDERS.indexOf(o.where) < 0);
r.out.filter(o => AUTHOR_PLACEHOLDERS.indexOf(o.where) >= 0).forEach(o =>
  console.log(`     (author's placeholder, left alone) ${o.where}: …${o.text}…`));
real.forEach(o => console.log(`     ${o.where} [${o.hit}] …${o.text}…`));
check(r.recorded > 15 && r.screens.length >= 8, `the mod's screens were drawn (${r.screens.join(', ')})`);
check(r.fnText.length === 0, `no tooltip is handed a function it will print (${r.fnText.join(', ') || 'none'})`);
check(r.errors.length === 0, `no tooltip throws (${r.errors.slice(0, 3).join('; ') || 'none'})`);
check(real.length === 0, `every one reads as text, with nothing missing (${real.length} do not)`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — every tooltip in the game reads as text.');
