import { launch, settle } from './lib/browser.mjs';

// The cultivator's road (section 38), rule by rule.
//
// Until this, roots, layers, insight, seclusion, deviation and the tribulation
// were checked by hand in a browser and nothing else -- MOD-NOTES said so. Each
// rule here is made deterministic by standing in for the game's random() for
// the length of one check.
//
//   PORT=8080 node tests/road.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

// shared set-up inside the page: fixed dice, a clean cultivation state
await p.evaluate(() => {
  window.__real = random;
  window.dice = v => { random = function () { return v; }; };
  window.undice = () => { random = window.__real; };
  window.fresh = (realm, qic) => {
    Object.assign(global.flags, { mod_realm: realm, mod_insight: 0, mod_qidev: 0, mod_seclu: 0,
                                  mod_seen: {}, mod_bthist: [], btl: false });
    skl.qic.lvl = qic; act.mod_seclu.active = false;
    you.stat_r(); allbuff(you); you.hp = you.hpmax;
  };
  giveSkExp = (function (g) { window.__gse = g; return function () {}; })(giveSkExp);
  giveAction(act.mod_qi);
});

console.log('--- Spiritual Root');
const root = await p.evaluate(() => {
  const counts = {}; const N = 6000;
  for (let i = 0; i < N; i++) { global.flags.mod_root = 0; dice(Math.random()); counts[MOD_rollRoot().n] = (counts[MOD_rollRoot().n] || 0) + 1; }
  undice();
  const total = MOD_ROOTS.reduce((s, r) => s + r.weight, 0);
  const off = MOD_ROOTS.map(r => Math.abs((counts[r.n] || 0) / N - r.weight / total));
  global.flags.mod_root = 0; dice(0.001); const once = MOD_rollRoot().n; dice(0.999); const again = MOD_rollRoot().n; undice();
  // the speed bonus goes through skl.qic.p, reconciled, never compounded
  global.flags.mod_rootxp = 1; skl.qic.p = 1; global.flags.mod_root = 5;
  MOD_applyRootBonus(); const p5 = skl.qic.p; MOD_applyRootBonus(); MOD_applyRootBonus(); const p5b = skl.qic.p;
  global.flags.mod_root = 1; MOD_applyRootBonus(); const p1 = skl.qic.p;
  // the cleansing pill: up one grade, and not past the top
  global.flags.mod_root = 2; MOD_applyRootBonus(); giveItem(item.mod_rootpill, 2);
  item.mod_rootpill.use(); const up = global.flags.mod_root;
  global.flags.mod_root = 5; const have = item.mod_rootpill.amount; item.mod_rootpill.use();
  return { maxOff: Math.max(...off), once, again, p5, p5b, p1, up, topRefused: item.mod_rootpill.amount === have && global.flags.mod_root === 5 };
});
check(root.maxOff < 0.02, `grades roll at their weights (worst off by ${(root.maxOff * 100).toFixed(1)} points)`);
check(root.once === root.again, 'a root is rolled once and never again');
check(Math.abs(root.p5 - 1.7) < 1e-9 && root.p5b === root.p5,
  `a Heavenly Root is x1.7 cultivation speed, and re-applying it does not compound (${root.p5b})`);
check(Math.abs(root.p1 - 0.85) < 1e-9, `changing grade divides the old bonus back out (${root.p1})`);
check(root.up === 3, 'a Root Cleansing Pill moves the root up one grade');
check(root.topRefused, 'and is refused, and kept, at the top grade');

console.log('\n--- the nine layers');
const layers = await p.evaluate(() => {
  const seen = [];
  for (let q = 18; q <= 29; q++) { fresh(3, q); seen.push(MOD_layer()); }
  fresh(3, 18); const t1 = MOD_realmTitle(); allbuff(you); const s1 = you.str, h1 = you.hpmax;
  fresh(3, 29); const t9 = MOD_realmTitle(); allbuff(you); const s9 = you.str, h9 = you.hpmax;
  fresh(3, 30); const wall = MOD_realmTitle();
  return { seen, t1, t9, wall, strRatio: s9 / s1, hpRatio: h9 / h1 };
});
check(layers.seen[0] === 1 && layers.seen[layers.seen.length - 1] === 9 &&
      layers.seen.every((l, i, a) => i === 0 || l >= a[i - 1]), `layers climb 1 to 9 across a realm (${layers.seen})`);
check(/1st layer \(early stage\)/.test(layers.t1) && /^Peak of/.test(layers.t9),
  `named with the genre's words (${layers.t1} ... ${layers.t9})`);
check(/^Half a step to/.test(layers.wall), `at the next threshold it is "${layers.wall}"`);
check(Math.abs(layers.strRatio - 1.16) < 0.01 && Math.abs(layers.hpRatio - 1.24) < 0.02,
  `the peak is worth x1.16 stats and x1.24 body over the first layer (${layers.strRatio.toFixed(3)}, ${layers.hpRatio.toFixed(3)})`);

console.log('\n--- pacing: each realm against the climb to it, on the live curve');
const pace = await p.evaluate(() => MOD_REALMS.filter(r => r.n).map(r => ({
  n: r.n, name: r.name, qic: r.qic, climb: MOD_realmClimbSec(r.n) / 3600,
  total: MOD_xpToReach(r.qic) / 0.9 / 3600, need: MOD_insightNeed(r.n),
  seclu: MOD_secludeFull(r.n) / 3600, dev: MOD_devMinutes(r.n) / 60, devDays: MOD_devMinutes(r.n) / 1440,
  meditate: MOD_insightNeed(r.n) / MOD_CULT.meditateChance / 3600,
  share: MOD_CULT.wallShare, floorSec: MOD_CULT.secludeFull, floorDev: MOD_CULT.devMinutes })));
const h = x => x >= 100 ? x.toFixed(0) + 'h' : x >= 1 ? x.toFixed(1) + 'h' : Math.round(x * 60) + 'm';
console.log('     realm                       Qi   climb    from 0  insight  at the wall: meditating  in seclusion  deviation (in-game)');
pace.forEach(r => console.log(`     ${String(r.n).padStart(2)} ${r.name.padEnd(26)} ${String(r.qic).padStart(3)} ` +
  `${h(r.climb).padStart(7)} ${h(r.total).padStart(9)} ${String(r.need).padStart(8)}  ${h(r.meditate).padStart(22)} ` +
  `${h(r.seclu).padStart(13)} ${r.devDays.toFixed(1).padStart(10)} days`));
const sized = pace.filter(r => r.n >= 3);
// a wall is sized to its own climb, or to the wall below if that is bigger
check(sized.every((r, i) => r.meditate / r.climb >= r.share - 0.005 &&
    (Math.abs(r.meditate / r.climb - r.share) < 0.005 || r.need === pace[r.n - 2].need)),
  `from realm 3, meditating out a wall takes ${Math.round(pace[0].share * 100)}% of the climb to it (or matches the wall below)`);
check(sized.every(r => r.seclu * 3600 > r.floorSec && Math.abs(r.seclu / r.meditate - 1 / 3) < 0.01),
  'seclusion earns it three times as fast, and full consolidation takes that long');
check(pace.every(r => r.dev * 60 >= r.floorDev && r.dev * 60 >= r.seclu * 3600 - 1),
  'Qi Deviation lasts at least as long as the seclusion it skipped, and never under half a day');
check(pace.every((r, i) => i === 0 || r.need >= pace[i - 1].need), 'and no wall asks for less than the one below it');

console.log('\n--- insight, from the three sources and no fourth');
const ins = await p.evaluate(() => {
  const need = [1, 2, 3, 10].map(MOD_insightNeed);
  // meditating on the way up, not at a wall: nothing
  fresh(1, 1); dice(0); act.mod_qi.use(); const climbing = MOD_insight(); undice();
  fresh(0, 1);
  dice(0); act.mod_qi.use(); const med = MOD_insight(); dice(0.99); act.mod_qi.use(); const medMiss = MOD_insight(); undice();
  // a life-or-death kill: under 20% health, with the dice on your side
  const hook = callback.onDeath.hooks.find(h => h.id === 9380);
  you.hp = Math.floor(you.hpmax * 0.1); dice(0); hook.f({}, you); const brink = MOD_insight();
  you.hp = you.hpmax; hook.f({}, you); const safe = MOD_insight(); undice();
  // somewhere new, once
  const z = area.frstn1a2; const before = MOD_insight();
  try { area_init(z); } catch (e) {} const first = MOD_insight();
  try { area_init(z); } catch (e) {} const second = MOD_insight();
  try { area_init(area.nwh); } catch (e) {} const parked = MOD_insight();
  global.flags.btl = false; global.flags.civil = true;
  return { need, climbing, med, medMiss, brink, safe, newArea: first - before, again: second - first, nwh: parked - second };
});
check(ins.need[0] === 1 && ins.need[1] === 3, `the first two walls keep the old floor (${ins.need.slice(0, 2)})`);
check(ins.need[2] > 5 && ins.need[3] > ins.need[2], `from realm 3 the need is sized to the climb (${ins.need})`);
check(ins.climbing === 0, 'meditating on the way up, away from a wall, grants nothing');
check(ins.med === 1 && ins.medMiss === 1, 'at a wall meditating can grant one, and does not on a missed roll');
check(ins.brink === 2 && ins.safe === 2, 'a kill under 20% health grants one; a comfortable kill does not');
check(ins.newArea === 1 && ins.again === 0, 'the first visit to an area grants one, a second does not');
check(ins.nwh === 0, 'and the place the game parks you between fights is not a visit');

console.log('\n--- Closed Door Training');
const sec = await p.evaluate(() => {
  fresh(1, 1); const noWall = act.mod_seclu.cond(false);
  fresh(0, 1); const atWall = act.mod_seclu.cond(false);
  for (let i = 0; i < 450; i++) act.mod_seclu.use();
  const half = MOD_consolidation();
  for (let i = 0; i < 900; i++) act.mod_seclu.use();
  const full = MOD_consolidation();
  // a failure from inside seclusion costs the pill and nothing else
  global.flags.mod_insight = 50; act.mod_seclu.active = true; giveItem(item.mod_bp1, 1);
  dice(0.999); const r = MOD_breakthrough(1, item.mod_bp1); undice();
  const sheltered = { r, deviated: MOD_deviated(), realm: MOD_realm().n };
  act.mod_seclu.active = false;
  return { noWall, atWall, half, full, sheltered };
});
check(!sec.noWall && sec.atWall, 'it only starts at a wall');
check(Math.abs(sec.half - 0.5) < 1e-9 && sec.full === 1, `it consolidates, to a ceiling (${sec.half}, ${sec.full})`);
check(sec.sheltered.r === false && !sec.sheltered.deviated && sec.sheltered.realm === 0,
  'a failure from inside it cannot cause Qi Deviation');

console.log('\n--- Qi Deviation');
const dev = await p.evaluate(() => {
  fresh(2, 18); allbuff(you); const s0 = you.str, h0 = you.hpmax;
  global.flags.mod_insight = MOD_insightNeed(3); giveItem(item.mod_bp3, 1);
  dice(0.999); MOD_breakthrough(3, item.mod_bp3); undice();
  const on = MOD_deviated(); allbuff(you); const s1 = you.str, h1 = you.hpmax;
  const lasts = global.flags.mod_qidev - time.minute, want = MOD_devMinutes(3);
  giveItem(item.mod_bp3, 1); const refused = MOD_breakthrough(3, item.mod_bp3);
  const hpAfter = you.hp;
  // it survives a save and load
  const blob = save(); load(blob); const afterLoad = MOD_deviated();
  // it clears by the clock on the tick, or by a pill
  global.flags.mod_qidev = time.minute - 1; try { ontick(); } catch (e) {}
  const byTime = !MOD_deviated() && global.flags.mod_qidev === 0;
  MOD_enterDeviation('test'); giveItem(item.mod_settlepill, 1); item.mod_settlepill.use();
  return { on, lasts, want, statRatio: s1 / s0, bodyRatio: h1 / h0, refused, afterLoad, byTime, byPill: !MOD_deviated() };
});
check(dev.on, 'failing in the open causes it');
check(dev.lasts === dev.want && dev.want > 720, `for as long as that realm's seclusion (${dev.lasts} in-game minutes)`);
check(Math.abs(dev.statRatio - 0.55) < 0.01 && Math.abs(dev.bodyRatio - 0.70) < 0.02,
  `stats x0.55, body x0.70 (${dev.statRatio.toFixed(3)}, ${dev.bodyRatio.toFixed(3)})`);
check(dev.refused === false, 'no second attempt while it lasts');
check(dev.afterLoad, 'it survives a save and load');
check(dev.byTime && dev.byPill, 'and clears with time, or at once with a Qi Settling Pill');

console.log('\n--- Heavenly Tribulation');
const trib = await p.evaluate(() => {
  const cost = [8, 9, 10].map(n => MOD_tribulationCost(n));
  fresh(7, MOD_REALMS[8].qic); global.flags.mod_insight = MOD_insightNeed(8); giveItem(item.mod_bp8, 1);
  dice(0); const ok = MOD_breakthrough(8, item.mod_bp8); undice();
  const survived = { ok, realm: MOD_realm().n };
  fresh(7, MOD_REALMS[8].qic); global.flags.mod_insight = MOD_insightNeed(8); giveItem(item.mod_bp8, 1);
  you.hp = Math.floor(you.hpmax * 0.4);
  dice(0); const lost = MOD_breakthrough(8, item.mod_bp8); undice();
  return { cost, survived, fell: { lost, realm: MOD_realm().n, hp: you.hp, deviated: MOD_deviated() },
           history: MOD_breakthroughHistory().map(e => e.outcome) };
});
check(trib.cost.map(c => Math.round(c * 100)).join() === '55,70,85', `it costs 55/70/85% of max HP (${trib.cost})`);
check(trib.survived.ok === true && trib.survived.realm === 8, 'walking in healthy, you come through it');
check(trib.fell.lost === false && trib.fell.realm === 7, 'walking in hurt, the realm does not open');
check(trib.fell.hp >= 1 && trib.fell.deviated, 'and it leaves you deviated at 1 HP, never dead');
check(trib.history.join() === 'tribulation', `the attempt is in the history (${trib.history})`);

console.log('\n--- the history keeps twenty');
const hist = await p.evaluate(() => {
  global.flags.mod_bthist = [];
  for (let i = 0; i < 30; i++) MOD_logBreakthrough({ t: i, to: 1, odds: 50, sheltered: false }, 'failed');
  const h = MOD_breakthroughHistory();
  return { n: h.length, first: h[0].t, last: h[h.length - 1].t };
});
check(hist.n === 20 && hist.first === 10 && hist.last === 29, `the newest twenty are kept (${hist.n}, ${hist.first}..${hist.last})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — every rule of the road holds.');
