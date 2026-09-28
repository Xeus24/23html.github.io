import { launch, settle as settlePage } from './lib/browser.mjs';

// Pacing presets (section 45): Original, the default since v4.2, and "Mod before
// 4.2". Each must be EXACT -- the whole point of a preset is that it is not an
// approximation someone has to trust -- and the choice must survive a reload,
// because the curve itself has no persistence of its own.
//
//   PORT=8080 node tests/pacing.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const settle = () => settlePage(p);
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' }); await settle();

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

const state = () => p.evaluate(() => {
  const s = skl.fgt, k = s.lvl, cost = l => { s.lvl = l; const c = s.expnext(); s.lvl = k; return c; };
  const author = l => Math.round(50 + Math.pow(l + 1, Math.log(9 * l + 1)));
  const legacy = l => Math.round(50 * Math.pow(1.106, l));
  const sel = [].slice.call(document.querySelectorAll('select.mod_optn')).find(x => x.querySelector('option[value="fast"]'));
  return { pacing: getPacing(), xp: MOD.skill_xp_mult, coin: MOD_MONEY.chance, row: !!sel,
           authorBelow10: [0, 3, 6, 9].every(l => cost(l) === author(l)),
           legacyAll: [0, 5, 30, 80, 109].every(l => cost(l) === legacy(l)),
           mastery: skl.mod_fire ? (() => { const m = skl.mod_fire, mk = m.lvl; m.lvl = 30; const c = m.expnext(); m.lvl = mk; return c === cost(30); })() : true };
});

console.log('--- Original, by default');
let s = await state();
check(s.pacing === 'original', `a fresh game reads Original (${s.pacing})`);
check(s.authorBelow10 && s.xp === 1 && s.coin === 0, "the author's cost below level 10, 1x exp, no coin drop");
check(s.row, 'there is a Pacing row in settings');

console.log('\n--- Mod before 4.2, exactly');
await p.evaluate(() => setPacing('fast'));
s = await state();
check(s.pacing === 'fast', `it reads Mod before 4.2 (${s.pacing})`);
check(s.legacyAll, 'every level costs exactly 50 x 1.106^level, the old curve');
check(s.xp === 2 && s.coin === 0.15, `2x exp and a 15% coin drop (${s.xp}, ${s.coin})`);
check(s.mastery, 'and the masteries are on it too');
const wiki = await p.evaluate(() => /Mod before 4\.2/.test(MOD_wikiBuild()));
check(wiki, 'the wiki describes the curve in use, not the default');

console.log('\n--- the choice survives a reload');
await p.reload({ waitUntil: 'load' }); await settle();
s = await state();
check(s.pacing === 'fast' && s.legacyAll, `still Mod before 4.2 after reloading (${s.pacing})`);

console.log('\n--- changing a box yourself reads as Custom');
await p.evaluate(() => setSkillXp(3));
s = await state();
check(s.pacing === 'custom', `skill exp 3x is Custom (${s.pacing})`);

console.log('\n--- and back');
await p.evaluate(() => setPacing('original'));
await p.reload({ waitUntil: 'load' }); await settle();
s = await state();
check(s.pacing === 'original' && s.authorBelow10 && s.xp === 1 && s.coin === 0,
  `Original again, and still after a reload (${s.pacing})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — each pacing preset is exact, and the choice persists.');
