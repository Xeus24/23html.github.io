import { launch } from './lib/browser.mjs';

// The mod against the original game, measured.
//
// Two pages from the same server. In one, the single <script src="mod.js">
// resolves to an empty file, which IS the author's game exactly -- the tag is
// the only change the mod makes to anything of his. The same measurement code
// runs in both, and nothing it calls may be a MOD_* function, because the
// original has none.
//
// What this asserts is where the mod MATCHES the original, and where it is
// allowed to differ it says why:
//
//   * character exp curve          identical, level for level
//   * skill costs below vanillaTo  identical to the author's own expnext --
//                                  read from HIS page, not re-derived here
//   * skill multiplier, coin drop  the original's defaults
//   * fights, Original (default)   MATCHED, spawn for spawn: tests/fights.mjs
//   * fights, Scaled               MEASURED, NOT MATCHED. The original has no
//                                  fixed pacing: its creatures are fixed and
//                                  you out-level them, so at equal progression
//                                  its forest takes one or two swings and
//                                  almost never hurts you. The mod's enemy
//                                  model exists to remove exactly that, and
//                                  holds every fight near 8 swings / 20 to die.
//                                  That is a deliberate difference, so this
//                                  prints the gap and asserts only the bounds
//                                  that must hold either way: the mod is
//                                  winnable wherever the original is, and never
//                                  deadlier than the deadliest fight the
//                                  original lets you win.
//
// An earlier version of this comparison reported the original as a wall of
// unwinnable fights. That was the mod's old skill curve talking: it gave the
// original's player far lower skills for the same xp. With the curves matched
// below level 10 both players get the same levels, and the picture inverts.
//
//   PORT=8080 node tests/vanilla.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const errs = [];
async function boot(vanilla) {
  const p = await b.newPage();
  p.on('pageerror', e => errs.push((vanilla ? '[vanilla] ' : '[mod] ') + String(e).slice(0, 200)));
  if (vanilla) await p.route('**/mod.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  return p;
}
const V = await boot(true), M = await boot(false);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the vanilla page really is vanilla');
const isV = await V.evaluate(() => ({ mod: typeof MOD !== 'undefined', ex: typeof MOD_expnextFor }));
check(!isV.mod && isV.ex === 'undefined', 'no MOD_* anything in the original page');

console.log('\n--- character level: untouched');
const charCurve = p => p.evaluate(() => { const k = you.lvl, o = [];
  for (let l = 1; l <= 80; l++) { you.lvl = l; o.push(you.expnext()); } you.lvl = k; return o; });
const cv = await charCurve(V), cm = await charCurve(M);
check(cv.every((x, i) => x === cm[i]), `character exp curve identical for levels 1-80`);

console.log('\n--- skills: the author\'s own cost, where the author designed');
const skillCosts = p => p.evaluate(() => { const s = skl.fgt, k = s.lvl, o = [];
  for (let l = 0; l <= 110; l++) { s.lvl = l; o.push(s.expnext()); } s.lvl = k; return o; });
const sv = await skillCosts(V), sm = await skillCosts(M);
const curve = await M.evaluate(() => ({ vanillaTo: MOD_XP.vanillaTo, ratio: MOD_XP.ratio,
  total: MOD_XP.total, to110: MOD_xpToReach(110),
  legacy: MOD_XP_LEGACY.base * (Math.pow(MOD_XP_LEGACY.ratio, 110) - 1) / (MOD_XP_LEGACY.ratio - 1) / MOD_XP_LEGACY.mult }));
const perkTops = await V.evaluate(() => { const t = [];
  for (const k in skl) { const s = skl[k]; if (s && s.mlstn && s.mlstn.length) t.push(Math.max(...s.mlstn.map(m => m.lv))); }
  return t.sort((a, b) => a - b); });
const designedTo = perkTops[perkTops.length - 1];
const median = perkTops[perkTops.length >> 1];
console.log(`     the author put perks on ${perkTops.length} skills; they end at level ${perkTops[0]}-${designedTo} (median ${median})`);
[1, 5, 9, 10, 15, 30, 60, 109].forEach(l =>
  console.log(`     lv ${String(l).padStart(3)}   original ${sv[l].toLocaleString().padStart(20)}   mod ${sm[l].toLocaleString().padStart(10)}`));
const exact = sv.slice(0, curve.vanillaTo).every((x, i) => x === sm[i]);
check(exact, `every level below ${curve.vanillaTo} costs exactly the original's (checked against HIS page)`);
check(curve.vanillaTo >= median && curve.vanillaTo <= designedTo,
  `and that covers the middle of his design range (${curve.vanillaTo}, between his median ${median} and his last perk ${designedTo})`);
check(sm[curve.vanillaTo] >= sm[curve.vanillaTo - 1],
  `no step down where his curve hands over (${sm[curve.vanillaTo - 1]} -> ${sm[curve.vanillaTo]})`);
check(sm.slice(curve.vanillaTo).every((x, i, a) => i === 0 || x >= a[i - 1]),
  'and it only climbs from there');
check(Math.abs(curve.to110 - curve.legacy) <= 2,
  `level 110 is exactly as far as it always was (${Math.round(curve.to110).toLocaleString()} xp at 1x)`);

const offCurve = await M.evaluate(() => { const off = [];
  for (const k in skl) { const s = skl[k]; if (!s || typeof s.expnext !== 'function' || s._modConverged) continue;
    const keep = s.lvl; s.lvl = 20; if (s.expnext() !== MOD_expnextFor(20)) off.push(s.name); s.lvl = keep; }
  return off; });
check(offCurve.length === 0,
  `every trainable skill is on the curve, including ones made after section 19 (${offCurve.join(', ') || 'none left behind'})`);

console.log('\n--- the settings ship at the original\'s values');
const dv = await V.evaluate(() => ({ enmondren: you.mods.enmondren }));
const dm = await M.evaluate(() => ({ enmondren: you.mods.enmondren, xp: MOD.skill_xp_mult, coin: MOD_MONEY.chance }));
check(dm.xp === 1, `skill exp multiplier 1, as in the original (${dm.xp})`);
check(dm.coin === 0 && dm.enmondren === dv.enmondren,
  `enemy coin drop off, as in the original (${dm.enmondren} vs ${dv.enmondren})`);

console.log('\n--- fights on the opening route, the original beside the mod on Scaled');
// Fights: Original is the author's spawns exactly, and fights.mjs holds that.
// What is left to measure here is how far the scaled model sits from him.
await M.evaluate(() => setFights('scaled'));
const measure = (p, ROUTE, isMod) => p.evaluate(({ ROUTE, isMod }) => {
  const N = 500;
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
             d: i.m * hm > 0 ? you.hpmax / (i.m * hm) : Infinity, whiff: o.z };
  };
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  return ROUTE.map(([nm, ak, cl, sl, t]) => {
    if (!area[ak]) return { nm, missing: true };
    build(cl, sl, t);
    const fs = [];
    area[ak].pop.forEach(e => { fs.push(fight(area[ak], e.crt, e.lvlmin));
      if (e.lvlmax !== e.lvlmin) fs.push(fight(area[ak], e.crt, e.lvlmax)); });
    return { nm, kill: med(fs.map(f => f.k)), die: med(fs.map(f => f.d)), whiff: med(fs.map(f => f.whiff)) };
  });
}, { ROUTE, isMod });

// earlybal's route: [name, area, character level, the mod's skill level, story tier]
const ROUTE = [
  ['Tutorial fight 1', 'trn1', 1, 0, 0], ['Tutorial fight 2', 'trn2', 2, 1, 0],
  ['Tutorial fight 3', 'trn3', 3, 2, 0], ['Training grounds', 'trn', 5, 4, 1],
  ['W forest, first', 'frstn1a2', 6, 5, 1], ['W forest, second', 'frstn2a2', 10, 8, 1],
  ['W forest, grind', 'frstn1a3', 12, 10, 2], ['W forest, hidden', 'frstn1a4', 15, 12, 2],
  ['Your basement', 'hmbsmnt', 18, 14, 2], ['S forest', 'frstn9a1', 20, 15, 3]
];
// The original's player gets the skill level the SAME skill xp buys on the
// original's curve -- character level is on an identical curve, so it carries
// straight over. (No equipment on either side: the route builder gives none.)
const cumV = sv.reduce((acc, x) => { acc.push(acc[acc.length - 1] + x); return acc; }, [0]);
const cumM = sm.reduce((acc, x) => { acc.push(acc[acc.length - 1] + x); return acc; }, [0]);
const toV = sl => { let l = 0; while (l + 1 < cumV.length && cumV[l + 1] <= cumM[sl]) l++; return l; };
const VR = ROUTE.map(r => [r[0], r[1], r[2], toV(r[3]), r[4]]);
const rv = await measure(V, VR, false), rm = await measure(M, ROUTE, true);

const f = x => x === Infinity ? 'never' : x >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(1);
console.log('                     skill    |  ORIGINAL kill      die   |   MOD kill   die');
rv.forEach((v, i) => {
  if (v.missing) return;
  console.log(`     ${v.nm.padEnd(17)} ${String(VR[i][3]).padStart(2)} / ${String(ROUTE[i][3]).padStart(2)} |`,
    f(v.kill).padStart(12), f(v.die).padStart(9), ' |', f(rm[i].kill).padStart(9), f(rm[i].die).padStart(6));
});
// "winnable": you kill it before it kills you, and your hits mostly land damage
const won = rv.filter(v => !v.missing && v.kill < v.die && v.whiff < 0.5);
const killEnv = [Math.min(...won.map(v => v.kill)), Math.max(...won.map(v => v.kill))];
const dieFloor = Math.min(...won.map(v => v.die));
const lost = rv.filter(v => !v.missing && !(v.kill < v.die && v.whiff < 0.5)).map(v => v.nm);
console.log(`     the original is winnable on ${won.length} of ${rv.length} steps; ` +
  `not on: ${lost.join(', ') || 'none'}`);
console.log(`     its winnable fights take ${killEnv[0].toFixed(1)}-${killEnv[1].toFixed(1)} swings to kill, ` +
  `and the deadliest lets you survive ${dieFloor.toFixed(1)}`);
const modOk = rm.filter(m => !m.missing);
check(modOk.every(m => m.kill < m.die), 'the mod is winnable on every step of the route');
check(won.every(v => { const m = rm[rv.indexOf(v)]; return m && m.kill < m.die; }),
  `winnable everywhere the original is (${won.length} steps)`);
const medOf = a => { const x = a.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
const mk = medOf(modOk.map(m => m.kill)), vk = medOf(won.map(v => v.kill));
const md = medOf(modOk.map(m => m.die)),  vd = medOf(won.map(v => v.die));
console.log(`     THE GAP, not asserted: median fight ${mk.toFixed(1)} swings in the mod vs ` +
  `${vk.toFixed(1)} in the original (x${(mk / vk).toFixed(1)} longer);`);
console.log(`     median swings to die ${md.toFixed(1)} vs ${Math.round(vd).toLocaleString()} ` +
  `(the original's early game barely fights back)`);
check(modOk.every(m => m.die >= dieFloor),
  `and none is deadlier than the deadliest the original lets you win ` +
  `(mod's closest ${Math.min(...modOk.map(m => m.die)).toFixed(1)})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — skills and settings match the original; Scaled fights differ by design, and the gap is printed above.');
