import { launch, settle } from './lib/browser.mjs';

// Fights: Original (section 47), against the author's own page.
//
// Two pages from one server; in the first the <script src="mod.js"> resolves
// to nothing, which IS the author's game. What this holds:
//
//   * Original is the default, and the mod's own areas stay scaled under it
//   * every creature in every one of the author's areas spawns stat for stat
//     as it does on his page -- same level ranges, same HP, STR, AGL, INT, SPD
//     and exp -- with random() seeded identically on both sides
//   * his route is winnable at the point in the story you first reach it,
//     everywhere his own game is, and the median fight is his length, not 8
//   * Raw Meat is back at his chance, and the hunter's quest still clears
//     in summer at the kill time measured here
//   * Scaled puts section 8 back everywhere, and the pacing presets carry it
//
//   PORT=8080 node tests/fights.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const errs = [];
async function boot(vanilla) {
  const p = await b.newPage();
  p.on('pageerror', e => errs.push((vanilla ? '[vanilla] ' : '[mod] ') + String(e).slice(0, 200)));
  if (vanilla) await p.route('**/mod.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await settle(p);
  return p;
}
const V = await boot(true), M = await boot(false);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the default');
const d0 = await M.evaluate(() => ({ mode: getFights(), pacing: getPacing() }));
check(d0.mode === 'original', `Fights defaults to Original (${d0.mode})`);
check(d0.pacing === 'original', `and the Original pacing preset reads as such (${d0.pacing})`);

console.log('\n--- every spawn in his areas is his');
// A seeded random() on both pages, so mon_gen and lvlup roll the same numbers.
const spawns = p => p.evaluate(() => {
  let seed = 12345;
  const keep = random;
  random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = {};
  try {
    for (const k in area) {
      const z = area[k];
      if (!z || !z.pop || !z.pop.length || k === 'nwh' || k === 'tst') continue;
      if (typeof MOD !== 'undefined' && !z._modAuthor) continue;
      z.pop.forEach((e, i) => {
        [e.lvlmin, e.lvlmax].forEach((lv, j) => {
          seed = 777 + i * 31 + j;
          global.current_z = z;
          const m = mon_gen(e.crt); lvlup(m, lv);
          out[`${k}/${i}/${j}`] = { range: [e.lvlmin, e.lvlmax], lvl: m.lvl, hpmax: m.hpmax,
            str: m.str, agl: m.agl, int: m.int, spd: m.spd, exp: m.exp };
        });
      });
    }
  } finally { random = keep; }
  return out;
});
const sv = await spawns(V), sm = await spawns(M);
const keysV = Object.keys(sv), diffs = [];
keysV.forEach(k => {
  if (!sm[k]) { diffs.push(`${k} missing in the mod`); return; }
  const a = sv[k], m = sm[k];
  for (const f of ['lvl', 'hpmax', 'str', 'agl', 'int', 'spd', 'exp']) {
    if (a[f] !== m[f]) diffs.push(`${k} ${f}: his ${a[f]}, mod ${m[f]}`);
  }
  if (a.range[0] !== m.range[0] || a.range[1] !== m.range[1]) diffs.push(`${k} range: his ${a.range}, mod ${m.range}`);
});
check(keysV.length > 30 && Object.keys(sm).length === keysV.length,
  `the same ${keysV.length} spawns exist on both pages (${Object.keys(sm).length} in the mod)`);
check(diffs.length === 0, `all of them identical: level range, level, HP, STR, AGL, INT, SPD, exp` +
  (diffs.length ? `\n        ${diffs.slice(0, 8).join('\n        ')}` : ''));

console.log('\n--- the mod\'s own areas are still scaled');
const own = await M.evaluate(() => {
  const r = {};
  ['mod_hollow', 'mod_spire', 'mod_vigil', 'mod_rank10'].forEach(k => {
    const z = area[k]; global.current_z = z;
    const m = mon_gen(z.pop[0].crt); lvlup(m, z.pop[0].lvlmin);
    r[k] = { author: !!z._modAuthor, killT: m._modKillT || 0, dieT: m._modDieT || 0 };
  });
  return r;
});
Object.keys(own).forEach(k => check(!own[k].author && own[k].killT > 0,
  `${k}: sized by section 8 (kill target ${own[k].killT.toFixed(1)})`));

console.log('\n--- his route, at the point you first reach each step');
// [name, area, character level, the mod's skill level, story tier]. The skill
// levels are earlybal's route, then each later step at its tier's cap.
const ROUTE = [
  ['Tutorial fight 1', 'trn1', 1, 0, 0], ['Tutorial fight 2', 'trn2', 2, 1, 0],
  ['Tutorial fight 3', 'trn3', 3, 2, 0], ['Training grounds', 'trn', 5, 4, 1],
  ['Damp cellar', 'clg', 5, 4, 1],
  ['W forest, first', 'frstn1a2', 6, 5, 1], ['W forest, second', 'frstn2a2', 10, 8, 1],
  ['W forest, grind', 'frstn1a3', 12, 10, 2], ['W forest, hidden', 'frstn1a4', 15, 12, 2],
  ['Your basement', 'hmbsmnt', 18, 14, 2], ['S forest', 'frstn9a1', 20, 15, 3],
  ['Golem arena I', 'trne1', 28, 30, 3], ['Golem arena II', 'trne2', 33, 40, 4],
  ['Golem arena III', 'trne3', 35, 50, 5], ['Golem arena IV', 'trne4', 40, 50, 5]
];
const measure = (p, ROUTE, isMod) => p.evaluate(({ ROUTE, isMod }) => {
  const N = 400;
  const quiet = fn => { const g = giveSkExp, c = global.flags.crti; giveSkExp = function () {};
    try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; } };
  const build = (charLvl, skillLvl, tier) => {
    you.lvl = 1; you.str_r = you.agl_r = you.int_r = you.spd_r = 1;
    you.hp_r = 39; you.hp = 39; you.sat_r = 200; you.sat = 200;
    you.stra = you.agla = you.inta = you.spda = you.hpa = you.sata = 0;
    you.strm = you.aglm = you.intm = you.spdm = you.hpm = you.satm = 1;
    you.stat_p = [1, 1, 1, 1];
    for (const k in skl) { const s = skl[k]; if (!s || typeof s !== 'object') continue;
      s.lvl = 0; s.exp = 0; if (s.mlstn) s.mlstn.forEach(m => { m.g = false; }); }
    if (isMod) {
      global.flags.mod_hpm = 1; global.flags.mod_satm = 1; global.flags.mod_realm = 0;
      global.flags.tr3_win = tier >= 1; global.flags.mod_t_forest = tier >= 2; global.flags.mod_t_deep = tier >= 3;
      global.flags.mod_t_cata = tier >= 4; global.flags.trne1e1 = tier >= 5; global.flags.trne3e1 = tier >= 6;
      MOD_CAP.current = -1;
    }
    you.stat_r();
    for (let i = 1; i < charLvl; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k]; if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = skillLvl;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false; if (m.lv <= skillLvl) { try { m.f(); m.g = true; } catch (e) {} } }); }
    global.flags.inside = true; global.flags.isday = true; global.flags.btl = false;
    global.flags.iscold = global.flags.iswet = global.flags.isdark = false;
    you.stat_r(); allbuff(you); you.hp = you.hpmax;
  };
  const mean = (a, d) => { let s = 0, z = 0; for (let i = 0; i < N; i++) { global.flags.crti = false;
      const x = Math.max(0, Math.round(abl.default.f(a, d))); s += x; if (x <= 0) z++; } return { m: s / N, z: z / N }; };
  const fight = (z, crt, lvl) => {
    global.current_z = z; const m = mon_gen(crt); lvlup(m, lvl);
    global.current_m = m; global.target = you.eqp[2]; global.t_n = 2;
    allbuff(you); allbuff(m);
    const hy = Math.max(0, Math.min(100, hit_calc(1))) / 100, hm = Math.max(0, Math.min(100, hit_calc(2))) / 100;
    let o, i; quiet(() => { o = mean(you, m); i = mean(m, you); });
    return { k: o.m * hy > 0 ? m.hpmax / (o.m * hy) : Infinity,
             d: i.m * hm > 0 ? you.hpmax / (i.m * hm) : Infinity, whiff: o.z,
             scaled: !!m._modKillT };
  };
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  return ROUTE.map(([nm, ak, cl, sl, t]) => {
    if (!area[ak]) return { nm, missing: true };
    build(cl, sl, t);
    const fs = [];
    area[ak].pop.forEach(e => { fs.push(fight(area[ak], e.crt, e.lvlmin));
      if (e.lvlmax !== e.lvlmin) fs.push(fight(area[ak], e.crt, e.lvlmax)); });
    return { nm, kill: med(fs.map(f => f.k)), die: med(fs.map(f => f.d)),
             worstKill: Math.max(...fs.map(f => f.k)), worstDie: Math.min(...fs.map(f => f.d)),
             whiff: med(fs.map(f => f.whiff)), scaled: fs.some(f => f.scaled),
             won: fs.every(f => f.k < f.d) };
  });
}, { ROUTE, isMod });

// the original's player gets the skill level the same xp buys on HIS curve
const costs = p => p.evaluate(() => { const s = skl.fgt, k = s.lvl, o = [];
  for (let l = 0; l <= 110; l++) { s.lvl = l; o.push(s.expnext()); } s.lvl = k; return o; });
const cv = await costs(V), cm = await costs(M);
const cum = a => a.reduce((acc, x) => { acc.push(acc[acc.length - 1] + x); return acc; }, [0]);
const cumV = cum(cv), cumM = cum(cm);
const toV = sl => { let l = 0; while (l + 1 < cumV.length && cumV[l + 1] <= cumM[sl]) l++; return l; };
const VR = ROUTE.map(r => [r[0], r[1], r[2], toV(r[3]), r[4]]);
const rv = await measure(V, VR, false), rm = await measure(M, ROUTE, true);

const f = x => x === Infinity ? 'never' : x >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(1);
console.log('                      skill   |   HIS kill      die  |  MOD kill      die  (worst spawn)');
rv.forEach((v, i) => {
  const m = rm[i];
  if (v.missing || m.missing) { console.log(`     ${v.nm}: no such area`); return; }
  console.log(`     ${v.nm.padEnd(17)} ${String(VR[i][3]).padStart(2)} / ${String(ROUTE[i][3]).padStart(2)} |` +
    `${f(v.kill).padStart(9)} ${f(v.die).padStart(9)}  |${f(m.kill).padStart(9)} ${f(m.die).padStart(9)}` +
    `  (${f(m.worstKill)} / ${f(m.worstDie)})`);
});
check(rm.every(m => !m.missing && !m.scaled), 'no step of his route was scaled');
const hisWon = rv.map(v => !v.missing && v.won);
check(rm.every((m, i) => !hisWon[i] || m.won),
  `every spawn is winnable wherever his whole step is (${hisWon.filter(Boolean).length} of ${rv.length} steps)`);
const lostHis = rv.filter((v, i) => !hisWon[i]).map(v => v.nm);
console.log(`     his own game loses at least one spawn on: ${lostHis.join(', ') || 'none'}`);
check(rm.slice(3).every(m => m.won),
  'and past the tutorial every step is winnable at arrival, spawn by spawn');
const medOf = a => { const x = a.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
const mk = medOf(rm.map(m => m.kill)), vk = medOf(rv.map(v => v.kill));
check(mk <= Math.max(vk * 1.5, 2),
  `the median fight is his length, not section 8's: ${mk.toFixed(1)} swings (his ${vk.toFixed(1)})`);

console.log('\n--- fights you nearly lost: where the third insight source lives');
// Insight comes from a kill made under 20% health (section 38). A fight costs
// kill/die of your health, so with no rest between them the brink is
// ceil(0.8 / (kill/die)) fights away. On Original his areas cost almost nothing
// at arrival -- that source is where fights are hard: the mod's own areas and
// the rank duels, or an area of his you walk into early. The wall never needs
// it: MOD_insightNeed is sized to meditation alone.
const toBrink = (k, d) => (d === Infinity || !(k > 0)) ? Infinity : Math.max(1, Math.ceil(0.8 / Math.min(k / d, 1)));
const his = rm.slice(3).map(m => toBrink(m.kill, m.die));
const ours = Object.keys(own).map(k => ({ k, n: toBrink(own[k].killT, own[k].dieT) }));
console.log(`     his route past the tutorial, fights to the brink with no rest: ${his.map(f).join(', ')}`);
console.log(`     the mod's own areas: ${ours.map(o => o.k + ' ' + f(o.n)).join(', ')}`);
check(his.every(n => n > 10), 'on Original his areas are not near-death fights at arrival, as in his game');
// The step from his last area to the first of the mod's: not a wall, but a cliff.
// At arrival his arena IV is finished in under a swing; the Hollow is sized to
// you at ~9. What must hold is that the Hollow stays winnable with room to spare.
const lastHis = rm[rm.length - 1], hol = own.mod_hollow;
console.log(`     the step: his last area ${lastHis.kill.toFixed(1)} swings to kill, the Hollow ${hol.killT.toFixed(1)} (to die ${hol.dieT.toFixed(1)})`);
check(hol.dieT >= hol.killT * 1.5, `the Hollow is winnable with margin at arrival (kill ${hol.killT.toFixed(1)}, die ${hol.dieT.toFixed(1)})`);
check(ours.every(o => o.n <= 6), 'the mod\'s own areas bring you to the brink within a handful of fights, so the source is live there');
const wallOk = await M.evaluate(() => MOD_REALMS.filter(r => r.n).every(r =>
  MOD_secludeFull(r.n) * MOD_CULT.secludeChance >= MOD_insightNeed(r.n) - 0.5));   // whole seconds
check(wallOk, 'and every wall can be met by sitting alone, so no wall waits on it');

console.log('\n--- Raw Meat and the hunter\'s quest');
const meat = await M.evaluate(() => {
  const z = area.frstn1a2;
  let share = 0, perSpawn = 0, rabbit = null;
  z.pop.forEach((e, i) => { (e.crt.drop || []).forEach(d => {
    if (d.item !== item.rwmt1) return;
    const w = z.popc[i][1] - z.popc[i][0]; share += w; perSpawn += w * d.chance; rabbit = d.chance; }); });
  return { share, perSpawn, rabbit, chance0: MOD_MEAT_DROPS.map(d => [d._modChance0, d.chance]),
           killSec: MOD_MEAT.killSecOriginal, target: MOD_MEAT.target, need: MOD_MEAT.need,
           summer: MOD_meatSteadyState(perSpawn, 1, 0.5) };
});
check(meat.chance0.every(([a, c]) => a === c), `every Raw Meat drop is at the author's chance (${meat.chance0.map(x => x[1]).join(', ')})`);
const rabbitSwings = rm[5].worstKill;
check(rabbitSwings + 1 <= meat.killSec,
  `a kill at the quest takes at most ${f(rabbitSwings)} swings, inside the ${meat.killSec}s the meat model assumes`);
check(meat.summer >= meat.target,
  `summer steady state ${meat.summer.toFixed(1)} held at once, against ${meat.need} needed and a target of ${meat.target}`);

console.log('\n--- Scaled, and the presets');
const sc = await M.evaluate(() => {
  const out = {};
  setFights('scaled');
  const z = area.frstn1a2, e = z.pop[0]; global.current_z = z;
  const m = mon_gen(e.crt); lvlup(m, e.lvlmin);
  out.scaled = { killT: m._modKillT || 0, range: [e.lvlmin, e.lvlmax], orig: e._modLv0,
                 meat: MOD_MEAT_DROPS.every(d => d.chance >= MOD_MEAT.chance), stored: localStorage.getItem(MOD_FIGHTS.key) };
  setFights('original');
  out.back = { range: [e.lvlmin, e.lvlmax] };
  setPacing('fast'); out.fast = getFights(); out.fastPacing = getPacing();
  setPacing('original'); out.orig = getFights(); out.origPacing = getPacing();
  setFights('scaled'); out.custom = getPacing(); setFights('original');
  return out;
});
check(sc.scaled.killT > 0, `Scaled sizes his creatures again (kill target ${sc.scaled.killT.toFixed(1)})`);
check(sc.scaled.range[0] > sc.scaled.orig[0] && sc.back.range[0] === sc.scaled.orig[0],
  `and raises his level ranges (${sc.scaled.orig} -> ${sc.scaled.range}), which Original puts back (${sc.back.range})`);
check(sc.scaled.meat, 'Raw Meat goes back to the scaled model\'s rate');
check(sc.scaled.stored === 'scaled', 'the choice is stored');
check(sc.fast === 'scaled' && sc.fastPacing === 'fast', 'the "Mod before 4.2" preset selects Scaled');
check(sc.orig === 'original' && sc.origPacing === 'original', 'the Original preset selects Original');
check(sc.custom === 'custom', 'and changing Fights on its own reads as Custom');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — with Fights on Original the author\'s areas are his, spawn for spawn, and still winnable where you meet them.');
