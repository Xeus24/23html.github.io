import { launch } from './lib/browser.mjs';
import { summarize, withinBand, ciLine, tCrit95 } from './lib/stats.mjs';

// Does the enemy model deliver the targets it is built to?
//
// Every other balance script checks a RELATION -- kill < die, whiff 0, nothing
// unwinnable. None of them checks whether `MOD_ENEMY.kill` is actually eight
// landed swings, because a single matchup cannot tell you: crit rate reaches
// 33% and a crit is ~8x a normal swing, so one measurement of 8.2 might be the
// model working or three lucky rolls.
//
// This samples many independent spawns and puts a confidence interval on the
// result. That is a different question from `kill < die`, and it is the one
// that catches the model drifting off its own dials -- a retune that moves the
// mean without breaking the ordering is invisible to every other script here.
//
// The comparison is against the target THIS SPAWN was solved for, not against
// MOD_ENEMY.kill. A first version of this check compared to the flat dial and
// reported four failures; all four were the check being wrong. `MOD_scaleEnemy`
// computes
//
//     killT = E.kill * band^hpSpread * creatureShape(...)   clamped to [.5x, 2x]
//
// so a basement rat is legitimately a five-swing kill and a rank-5 duel is
// legitimately eighteen. The dial is the centre of a distribution of targets,
// never the target itself. What must hold is that the measurement tracks the
// target it was given -- so the statistic is the RATIO measured/target, and
// its interval has to contain 1.
//
//   PORT=8080 node tests/targets.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);
// section 8's model is what this measures, so measure it everywhere: the
// default (Fights: Original) leaves the author's areas unscaled -- fights.mjs
await p.evaluate(() => setFights('scaled'));

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the helper itself, before trusting anything it says');
// It is load-bearing for two scripts now, and the whole point of it is to stop
// a wrong number reading as a confident one.
{
  const flat = [5, 5, 5, 5, 5];
  const f = summarize(flat);
  check(f.sd === 0 && f.lo === 5 && f.hi === 5, 'no spread gives a zero-width interval, not NaN');

  // known-answer: mean 10, sd 2, n 9 -> t(8)=2.306, se=0.6667, moe=1.537
  const s9 = [];
  for (let i = 0; i < 9; i++) s9.push(10 + 2 * (i < 4 ? 1 : i > 4 ? -1 : 0) * Math.sqrt(8 / 8) * 1.06066);
  const st = summarize(s9);
  const expMoe = 2.306 * (st.sd / 3);
  check(Math.abs((st.hi - st.mean) - expMoe) < 1e-6,
    `n=9 uses t(8)=2.306, not z (margin ${(st.hi - st.mean).toFixed(4)})`);
  check(tCrit95(8) > tCrit95(30) && tCrit95(30) > tCrit95(1000),
    't shrinks as df grows, and bottoms out at the normal value');
  check(tCrit95(39) === tCrit95(30),
    'between table rows it takes the wider (lower-df) value, never the narrower');

  const band = withinBand([1.001, 0.999, 1.000, 1.002, 0.998], 1, 5);
  check(band.ok, 'a measurement sitting on target passes its equivalence band');
  const drift = withinBand([1.2, 1.2, 1.2, 1.21, 1.19], 1, 5);
  check(!drift.ok && /outside/.test(drift.why), `a 20% drift fails it (${drift.why})`);
  const noisy = withinBand([0.5, 1.5, 0.6, 1.4, 1.0], 1, 5);
  check(!noisy.ok && /too wide/.test(noisy.why),
    `and so does an interval too wide to conclude anything (${noisy.why})`);
}

const R = await p.evaluate(() => {
  // dmg_calc grants skill exp and sets the crit flag; sampling it without
  // parking those levels the player mid-measurement.
  const quiet = (fn) => { const g = giveSkExp, c = global.flags.crti;
    giveSkExp = function () {};
    try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; } };

  /* Damage is two tight clusters, not one spread: a normal swing varies by
     ~10%, a crit runs several times that and lands a third of the time at the
     cap. A plain sample mean is therefore mostly measuring "how many crits
     happened", which is the estimator CLAUDE.md warns about -- and using one
     here put two of forty-five rank-duel spawns the wrong side of kill < die
     on noise alone. Averaging the strata separately and recombining with the
     crit rate the game will actually roll removes it. Same shape as
     allareas.mjs, written out rather than calling MOD_meanDamage so the test
     is not merely agreeing with the thing it measures. */
  // Tops up until both strata show -- a zero-crit sample used to fall back to a
  // plain mean that DROPS the crits (~30% of damage), reading a fight ~40% long.
  // Same fix as mod.js MOD_meanDamage and allareas.mjs.
  const meanDamage = (att, def, n) => {
    let critN = 0, critSum = 0, plainN = 0, plainSum = 0, i = 0;
    const rate = MOD_critRate(att);
    for (; i < n * 8; i++) {
      if (i >= n && (critN >= 2 || rate <= 0) && plainN >= 2) break;
      global.flags.crti = false;
      const d = Math.max(0, Math.round(abl.default.f(att, def)));
      if (global.flags.crti) { critN++; critSum += d; } else { plainN++; plainSum += d; }
    }
    return (critN && plainN)
      ? (1 - rate) * (plainSum / plainN) + rate * (critSum / critN)
      : (critSum + plainSum) / i;
  };

  const freshYou = () => {
    you.lvl = 1; you.str_r = 1; you.agl_r = 1; you.int_r = 1; you.spd_r = 1;
    you.hp_r = 39; you.hpmax = 39; you.hp = 39;
    you.sat_r = 200; you.satmax = 200; you.sat = 200;
    you.stra = you.agla = you.inta = you.spda = you.hpa = you.sata = 0;
    you.strm = you.aglm = you.intm = you.spdm = you.hpm = you.satm = 1;
    you.stat_p = [1, 1, 1, 1]; you.mods.sbonus = 0; you.mods.cpwr = 1;
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object') continue;
      s.lvl = 0; s.exp = 0; if (s.mlstn) s.mlstn.forEach(m => { m.g = false; }); }
    you.stat_r();
  };
  const setTier = (ti) => {
    global.flags.tr3_win = ti >= 1;
    global.flags.mod_t_forest = ti >= 2; global.flags.mod_t_deep = ti >= 3;
    global.flags.mod_t_cata = ti >= 4; global.flags.trne1e1 = ti >= 5; global.flags.trne3e1 = ti >= 6;
    global.flags.mod_prog = { hollow: ti >= 7 ? 99 : 0, spire: ti >= 8 ? 99 : 0, vigil: ti >= 9 ? 99 : 0 };
    MOD_CAP.current = -1; return MOD_levelCap();
  };
  const buildPlayer = (ti, charLvl) => {
    freshYou(); const cap = setTier(ti);
    for (let i = 1; i < charLvl; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = cap;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (m.lv <= cap) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r();
    global.flags.inside = true; global.flags.isday = true; global.flags.btl = false;
    global.flags.iscold = false; global.flags.iswet = false; global.flags.isdark = false;
    you.hp = you.hpmax; you.sat = you.satmax; allbuff(you);
    return cap;
  };

  // one spawn -> landed swings to kill it, and landed swings for it to kill you
  const sampleSpawn = (z) => {
    global.current_z = z;
    const e = z.pop[(Math.random() * z.pop.length) << 0];
    const lvl = Math.round((e.lvlmin + e.lvlmax) / 2);
    const m = mon_gen(e.crt); lvlup(m, lvl);
    global.current_m = m; try { update_m(); } catch (err) {}
    global.target = you.eqp[2]; global.t_n = 2;
    allbuff(you); allbuff(m);
    /* `killT` and `dieT` count SWINGS, misses included -- MOD_scaleEnemy sets
       enemy HP to `yourDamagePerHit * yourHitRate * killT`. abl.default.f
       returns damage per LANDED hit and never rolls to-hit, so the hit rate
       has to be folded in here or every ratio comes out multiplied by it.
       A first version skipped this and every die ratio came back at exactly
       0.45 -- which is MOD_ENEMY.hit, the tell. Same shape as allareas.mjs. */
    const hy = Math.max(0, Math.min(100, hit_calc(1))) / 100;
    const hm = Math.max(0, Math.min(100, hit_calc(2))) / 100;
    let perOut = 0, perIn = 0;
    quiet(() => {
      perOut = meanDamage(you, m, 200) * hy;
      perIn = meanDamage(m, you, 200) * hm;
    });
    const kill = perOut > 0 ? m.hpmax / perOut : null;
    const die = perIn > 0 ? you.hpmax / perIn : null;
    /* the targets MOD_scaleEnemy solved for THIS spawn and left on it */
    return { kill, die, killT: m._modKillT || null, dieT: m._modDieT || null,
             killRatio: (kill && m._modKillT) ? kill / m._modKillT : null,
             dieRatio: (die && m._modDieT) ? die / m._modDieT : null,
             ordered: (kill !== null && die !== null) ? kill < die : null };
  };

  const SPAWNS = 45;
  const rows = [];
  // ordinary areas at three points on the ladder, plus a rank duel, which is
  // the one place the mod deliberately overrides the base targets
  [['frstn1a2', 1, 12], ['hmbsmnt', 3, 30], ['mod_vigil', 9, 110],
   ['mod_rank5', 9, 110]].forEach(([ak, ti, lv]) => {
    if (!area[ak]) return;
    buildPlayer(ti, lv);
    const kills = [], dies = [], killR = [], dieR = [];
    let ordered = 0, seen = 0;
    for (let i = 0; i < SPAWNS; i++) {
      const s = sampleSpawn(area[ak]);
      if (s.kill !== null) kills.push(s.kill);
      if (s.die !== null) dies.push(s.die);
      if (s.killRatio !== null) killR.push(s.killRatio);
      if (s.dieRatio !== null) dieR.push(s.dieRatio);
      if (s.ordered !== null) { seen++; if (s.ordered) ordered++; }
    }
    rows.push({ ak, name: area[ak].name, kills, dies, killR, dieR, ordered, seen });
  });
  return { rows, dial: { kill: MOD_ENEMY.kill, die: MOD_ENEMY.die,
                         bossKill: MOD_ENEMY.bossKill, bossDie: MOD_ENEMY.bossDie,
                         margin: MOD_ENEMY.margin } };
});

// How far off target still counts as on target. Five percent of a swing is
// below anything a player could notice, and well above the model's own
// quantisation -- enemy HP is rounded, hpm is clamped.
const TOL = 5;

console.log(`--- dials: kill ${R.dial.kill}, die ${R.dial.die}, ` +
  `boss x${R.dial.bossKill}/x${R.dial.bossDie}, margin ${R.dial.margin}\n`);
console.log('  area              measured kill      vs its own target (ratio, 95% CI)');

R.rows.forEach(r => {
  const raw = summarize(r.kills);
  const st = withinBand(r.killR, 1, TOL);
  console.log(`  ${r.name.slice(0, 16).padEnd(16)}  ${ciLine(raw, ' sw').padEnd(30)} ${ciLine(st)}`);
  check(st.ok, `${r.name}: measured kill tracks the target it was solved for (${st.why})`);
  check(!st.wide, `${r.name}: the interval is tight enough to mean something (±${st.moePct.toFixed(1)}%)`);
});

console.log('\n--- and the damage the wrapper delivers tracks the die target');
R.rows.forEach(r => {
  const st = withinBand(r.dieR, 1, TOL);
  console.log(`  ${r.name.slice(0, 16).padEnd(16)}  ${ciLine(st)}`);
  check(st.ok, `${r.name}: incoming damage tracks its die target (${st.why})`);
});

console.log('\n--- and the player actually HAS the max HP the model assumes');
// The die target is `you.hpmax / (dieT * hit)`, so the whole model rests on
// hpmax being real. It was not: hpTrack used to ASSIGN you.hpmax, and stat_r
// recomputes it from (hp_r + hpa) * hpm * hpe on the very next call -- which
// the tick, fght, update_d and allbuff itself all make constantly. Every script
// here read it in the instant after allbuff while the assignment still stood,
// so 2,790 matchups validated against a number the player never held.
const hp = await p.evaluate(() => {
  const build = () => {
    Object.assign(global.flags, { tr3_win: true, mod_t_forest: true, mod_t_deep: true,
      mod_t_cata: true, trne1e1: true, trne3e1: true });
    MOD_CAP.current = -1; const cap = MOD_levelCap();
    for (let i = 1; i < 70; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = Math.min(cap, 60);
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (m.lv <= s.lvl) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r(); allbuff(you);
  };
  build();
  const afterAllbuff = Math.round(you.hpmax);
  you.stat_r();                                 // the call that used to wipe it
  const afterStatR = Math.round(you.hpmax);
  // many bare stat_r calls, the way a running game makes them
  for (let i = 0; i < 200; i++) you.stat_r();
  const after200 = Math.round(you.hpmax);

  // the base is recovered by dividing the stored factor back out, and anything
  // that resets hpm without clearing the flag would make that division wrong --
  // it is floored at 1, which is an invariant: only milestones touch hpm, and
  // they add
  let minHpm = Infinity, minMax = Infinity;
  for (let i = 0; i < 30; i++) { you.hpm = 1; allbuff(you);
    minHpm = Math.min(minHpm, you.hpm); minMax = Math.min(minMax, you.hpmax); }

  // and it must not compound: the factor is stored, not multiplied in again
  build();
  const one = you.hpm;
  for (let i = 0; i < 5000; i++) allbuff(you);
  const many = you.hpm;
  return { afterAllbuff, afterStatR, after200, minHpm, minMax,
           drift: Math.abs(many - one) / one,
           storedFactor: global.flags.mod_hpm };
});
console.log(`     after allbuff ${hp.afterAllbuff.toLocaleString()}, after stat_r ` +
  `${hp.afterStatR.toLocaleString()}, after 200 more ${hp.after200.toLocaleString()}`);
check(hp.afterStatR === hp.afterAllbuff,
  'max HP survives the stat_r that used to wipe it');
check(hp.after200 === hp.afterAllbuff,
  'and two hundred more of them');
check(typeof hp.storedFactor === 'number' && hp.storedFactor > 1,
  `the multiplier is stored in global.flags.mod_hpm (${
    typeof hp.storedFactor === 'number' ? hp.storedFactor.toFixed(2) + 'x' : 'ABSENT — hpmax is being written as a total again'
  })`);
check(hp.minHpm >= 1,
  `hpm never drops below the game's own value, whatever resets it (min ${hp.minHpm.toFixed(2)})`);
check(hp.drift < 1e-9,
  `5,000 allbuff calls do not compound it (drift ${hp.drift.toExponential(1)})`);

console.log('\n--- kill < die, on every spawn, not just on the aggregate');
// Aggregating first would conflate spawn-to-spawn spread with measurement
// noise: two different spawns can measure kill 8.6 and die 8.3 while each one
// individually holds. The guarantee is per spawn, so check it per spawn.
R.rows.forEach(r => {
  console.log(`  ${r.name.slice(0, 16).padEnd(16)}  ${r.ordered}/${r.seen} spawns`);
  check(r.ordered === r.seen,
    `${r.name}: kill < die on all ${r.seen} spawns` +
    (r.ordered === r.seen ? '' : ` (failed on ${r.seen - r.ordered})`));
});

// What `die` does and does not prove, stated rather than implied: both the
// target and the measurement divide by you.hpmax, and that is the number
// CLAUDE.md records as not being the one the player actually holds. So this
// checks the wrapper delivers the damage it intends -- it does not prove the
// fight feels right in play.
console.log('\n  note: `die` is measured against the same you.hpmax the model targets,');
console.log('        so it checks internal consistency, not what play feels like.');
console.log('        See "Known and unfixed" in CLAUDE.md.');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the enemy model lands on its own dials, with the interval to prove it.');
