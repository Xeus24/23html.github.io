import { launch } from './lib/browser.mjs';
import fs from 'node:fs';

// Balance baselines: the numbers that define the game's balance, written to
// tests/baselines/balance.json and compared on every run, so a change that
// shifts balance shows up as a diff in git instead of passing silently.
//
// Only numbers that are identical run to run go in: the skill curve, the dials,
// the realm and tribulation costs, prices, and each area's per-spawn fight
// targets (_modKillT / _modDieT), which come from the level band and the
// creature's shape rather than from any dice. A target that differs between two
// spawns of the same creature is left out and counted, not recorded -- a
// baseline that flaps is worse than none.
//
//   PORT=8080 node tests/baseline.mjs            compare
//   UPDATE=1 PORT=8080 node tests/baseline.mjs   accept the current numbers
//
// The player for the fight targets is allareas.mjs's own, lifted from that file
// so the two cannot describe different characters.

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const FILE = new URL('./baselines/balance.json', import.meta.url);
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);
// section 8's model is what this measures, so measure it everywhere: the
// default (Fights: Original) leaves the author's areas unscaled -- fights.mjs
const fightsDefault = await p.evaluate(() => getFights());
await p.evaluate(() => setFights('scaled'));

const aa = fs.readFileSync(new URL('./allareas.mjs', import.meta.url), 'utf8');
const helpers = aa.slice(aa.indexOf('  const freshYou = () => {'), aa.indexOf('  // dmg_calc grants skill exp'));
if (!helpers.includes('buildPlayer')) { console.error('could not lift buildPlayer from allareas.mjs'); process.exit(1); }

const now = await p.evaluate(`(() => {
${helpers}
  const sig = x => (typeof x === 'number' && isFinite(x)) ? +x.toPrecision(5) : x;
  const out = {};
  const put = (k, v) => { out[k] = sig(v); };

  [1, 5, 9, 10, 15, 30, 60, 90, 109].forEach(l => put('curve.cost.lv' + l, MOD_expnextFor(l)));
  MOD_TIERS.forEach(t => put('curve.total.cap' + t.cap, MOD_xpToReach(t.cap)));
  put('curve.ratio', MOD_XP.ratio); put('curve.vanillaTo', MOD_XP.vanillaTo);
  put('rate.skill_xp_mult', MOD.skill_xp_mult); put('rate.coin_drop', MOD_MONEY.chance);

  Object.keys(MOD_ENEMY).forEach(k => { if (typeof MOD_ENEMY[k] === 'number') put('enemy.' + k, MOD_ENEMY[k]); });
  put('rank.margin', MOD_RANK_MARGIN); put('rank.step', MOD_RANK_STEP);
  put('luck.cap', MOD_LUCK_CAP); put('conv.sectionBonus', MOD_CONV.sectionBonus);

  MOD_REALMS.forEach(r => { if (!r.n) return;
    put('realm' + r.n + '.qic', r.qic); put('realm' + r.n + '.mult', r.mult); put('realm' + r.n + '.hp', r.hp);
    put('realm' + r.n + '.insight', MOD_insightNeed(r.n));
    put('realm' + r.n + '.seclusionSec', MOD_secludeFull(r.n));
    put('realm' + r.n + '.deviationMin', MOD_devMinutes(r.n));
    if (r.n >= MOD_CULT.tribFrom) put('realm' + r.n + '.tribulation', MOD_tribulationCost(r.n)); });
  Object.keys(MOD_CULT).forEach(k => { if (typeof MOD_CULT[k] === 'number') put('cult.' + k, MOD_CULT[k]); });

  const keep = global.flags.mod_slipsused;
  [0, 10, 50].forEach(u => { global.flags.mod_slipsused = u; put('price.slip.used' + u, MOD_slipPrice()); });
  global.flags.mod_slipsused = keep;
  for (const k in item) { const it = item[k]; if (k.indexOf('mod_') === 0 && it && typeof it.v === 'number') put('value.' + k, it.v); }
  const stock = (vk) => { const v = vendor[vk]; if (!v || !v.items) return;
    v.items.forEach(s => { if (s.item && s.item.id && typeof s.p === 'number') put('shop.' + vk + '.' + s.item.id, s.p); }); };
  stock('pha1'); stock('mod_pltwr');
  put('meat.chance', MOD_MEAT.chance);
  // the meat each fight setting drops (the default setting is read before
  // this script switches to Scaled, below the page load)
  put('meat.killSecOriginal', MOD_MEAT.killSecOriginal);
  MOD_MEAT_DROPS.forEach((d, i) => { put('meat.drop' + i + '.author', d._modChance0); put('meat.drop' + i + '.scaled', d.chance); });

  // per-spawn fight targets: every area's first creature, three story tiers
  const quietG = giveSkExp; giveSkExp = function () {};
  let unstable = 0;
  const areas = Object.keys(area).filter(k => area[k] && area[k].pop && area[k].pop.length && k !== 'nwh' && k !== 'tst');
  [0, 5, 9].forEach(ti => {
    buildPlayer(ti, 'all');
    areas.forEach(ak => {
      const z = area[ak], e = z.pop[0]; global.current_z = z;
      const a = mon_gen(e.crt); lvlup(a, e.lvlmin);
      const c = mon_gen(e.crt); lvlup(c, e.lvlmin);
      if (!(a._modKillT > 0)) return;
      if (sig(a._modKillT) !== sig(c._modKillT) || sig(a._modDieT) !== sig(c._modDieT)) { unstable++; return; }
      put('target.t' + ti + '.' + ak + '.kill', a._modKillT);
      put('target.t' + ti + '.' + ak + '.die', a._modDieT);
    });
  });
  giveSkExp = quietG;
  return { values: out, unstable };
})()`);

now.values['fights.default'] = fightsDefault;

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };
const keys = Object.keys(now.values).sort();
console.log(`${keys.length} numbers recorded; ${now.unstable} per-spawn targets left out as unstable`);

if (process.env.UPDATE || !fs.existsSync(FILE)) {
  const sorted = {}; keys.forEach(k => { sorted[k] = now.values[k]; });
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`\nwrote ${FILE.pathname} — commit it; the diff is the balance change`);
} else {
  const was = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const changed = [], added = [], gone = [];
  keys.forEach(k => { if (!(k in was)) added.push(k); else if (was[k] !== now.values[k]) changed.push(`${k}: ${was[k]} -> ${now.values[k]}`); });
  Object.keys(was).forEach(k => { if (!(k in now.values)) gone.push(k); });
  changed.slice(0, 40).forEach(c => console.log('     changed  ' + c));
  added.slice(0, 20).forEach(c => console.log('     new      ' + c));
  gone.slice(0, 20).forEach(c => console.log('     gone     ' + c));
  check(changed.length === 0 && added.length === 0 && gone.length === 0,
    `the balance matches the committed baseline (${changed.length} changed, ${added.length} new, ${gone.length} gone)` +
    (changed.length + added.length + gone.length ? ' — if intended, run with UPDATE=1 and commit the file' : ''));
}
check(now.unstable < keys.length / 10, `almost every target is stable enough to record (${now.unstable} not)`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the balance is what the baseline says it is.');
