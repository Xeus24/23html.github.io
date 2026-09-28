import { launch } from './lib/browser.mjs';

// The rank ladder (section 34).
//
// `you.rank()` is DERIVED from live stats every time it is displayed, so there
// is no field to award. The ladder holds the earned rank in global.flags and
// WRAPS you.rank to floor at it. The two things that can go wrong with that are
// checked here first: the wrapper must never make the number worse, and the
// flag must survive a save/load.
//
// The rest is the fights. Each duel is a protected one-creature area, so
// MOD_scaleEnemy treats it as an arena boss and anchors it to the player's
// power at spawn; section 34 then steps each rung up in LENGTH and re-asserts
// kill < die from the targets MOD_scaleEnemy stored. That re-assertion is the
// load-bearing part -- scaling both targets in opposite directions breaks the
// guarantee by rung three -- so every rung is measured at every story tier
// through the game's own dmg_calc/hit_calc.
//
//   PORT=8080 node tests/ranks.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

/* ---------------------------------------------------------------- the table */
console.log('--- ten rungs, ordered, with ids that clash with nothing');
const table = await p.evaluate(() => ({
  n: MOD_RANK_LADDER.length,
  ranks: MOD_RANK_LADDER.map(r => r.rank),
  needs: MOD_RANK_LADDER.map(r => r.need),
  lvls: MOD_RANK_LADDER.map(r => r.lvl),
  steps: MOD_RANK_LADDER.map(r => +MOD_rankStep(r.rank).toFixed(3)),
  crtIds: MOD_RANK_LADDER.map(r => creature[r.key].id),
  areaIds: MOD_RANK_LADDER.map(r => area['mod_rank' + r.rank].id),
  hallId: chss.mod_hall.id,
  // every duel must be the shape MOD_scaleEnemy reads as a boss
  boss: MOD_RANK_LADDER.every(r => { const z = area['mod_rank' + r.rank];
    return z.protected === true && z.pop.length === 1 && z.size === 1; }),
  // and z_bake must have produced a band that can actually spawn
  baked: MOD_RANK_LADDER.every(r => { const z = area['mod_rank' + r.rank];
    return z.popc && z.popc.length === 1 && isFinite(z.popc[0][1] - z.popc[0][0])
        && z.popc[0][1] - z.popc[0][0] > 0.99; }),
  rnks: MOD_RANK_LADDER.map(r => creature[r.key].rnk)
}));
const desc = (a) => a.every((v, i) => i === 0 || v < a[i - 1]);
const asc = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
check(table.n === 10, `ten challengers (${table.n})`);
check(table.ranks.join() === '10,9,8,7,6,5,4,3,2,1', `ranks run 10 down to 1 (${table.ranks.join(' ')})`);
check(asc(table.needs), `the character level each asks for rises: ${table.needs.join(' ')}`);
check(asc(table.lvls), `and so does their own level: ${table.lvls.join(' ')}`);
check(asc(table.steps), `the difficulty step rises: ${table.steps.join(' ')}`);
check(new Set(table.crtIds).size === 10 && new Set(table.areaIds).size === 10,
  'ten distinct creature ids and ten distinct area ids');
check(table.hallId === 979, `the hall has its own location id (${table.hallId})`);
check(table.boss, 'each duel is protected / one creature / size 1 — what MOD_scaleEnemy reads as a boss');
check(table.baked, 'z_bake gave each one a band covering the whole roll');
// the coin drop exponent is 1 + (rnk/5 << 0); rnk 15 would push it from 3 to 4
check(Math.max(...table.rnks) <= 14,
  `danger grades stay in the base game's top coin bucket (max rnk ${Math.max(...table.rnks)})`);

/* ------------------------------------------------------------- the wrapper */
console.log('\n--- the wrapper floors the rank, and never caps it');
const wrap = await p.evaluate(() => {
  const out = {};
  const setStats = (s) => { you.stra = 0; you.strm = 1; you.agla = 0; you.aglm = 1;
    you.inta = 0; you.intm = 1; you.spda = 0; you.spdm = 1;
    you.str_r = you.agl_r = you.int_r = you.spd_r = s; you.stat_r(); };
  global.flags.mod_rank = 0;
  setStats(1);
  out.weakUnranked = you.rank();
  global.flags.mod_rank = 4;
  out.weakRanked = you.rank();          // the ladder should carry it to 4
  out.weakRaw = MOD_rawRank();
  setStats(5e9);                        // now the stats are better than rank 4
  out.strongRaw = MOD_rawRank();
  out.strongShown = you.rank();
  global.flags.mod_rank = 0;
  setStats(1);
  return out;
});
check(wrap.weakUnranked === wrap.weakRaw,
  `unranked, the shown rank is the base game's own number (${wrap.weakUnranked.toLocaleString()})`);
check(wrap.weakRanked === 4,
  `holding rank 4 with rank-${wrap.weakRaw.toLocaleString()} stats shows 4`);
check(wrap.strongShown === wrap.strongRaw && wrap.strongRaw < 4,
  `stats past rank 4 still show ${wrap.strongShown} — the floor never caps`);

/* ---------------------------------------------------------------- the hall */
console.log('\n--- the hall offers exactly one rung at a time');
const hall = (flags, lvl) => p.evaluate(([f, l]) => {
  Object.assign(global.flags, f);
  if (l) you.lvl = l;
  try { chss.mod_hall.sl(); } catch (e) { return ['THREW: ' + e.message]; }
  return [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
}, [flags, lvl]);

let lines = await hall({ mod_rank: 0 }, 1);
let challenges = lines.filter(t => /^"Challenge/.test(t));
check(challenges.length === 0, 'a level 1 character is offered no challenge at all');
check(lines.some(t => /needs level 60/.test(t)), 'it says what rank 10 wants instead');

lines = await hall({ mod_rank: 0 }, 60);
challenges = lines.filter(t => /^"Challenge/.test(t));
check(challenges.length === 1 && /Ket the Doorkeeper/.test(challenges[0]),
  `at level 60 exactly one rung is open, and it is rank 10 (${challenges[0]})`);

lines = await hall({ mod_rank: 10 }, 110);
challenges = lines.filter(t => /^"Challenge/.test(t));
check(challenges.length === 1 && /Brother Vey/.test(challenges[0]),
  'holding rank 10 opens rank 9 and nothing further down');
check(lines.some(t => /^Rank 10 — Ket/.test(t)), 'and rank 10 is shown as taken, not offered again');

lines = await hall({ mod_rank: 1 }, 110);
check(lines.filter(t => /^"Challenge/.test(t)).length === 0, 'holding rank 1 offers no more fights');
check(lines.some(t => /no eleventh name/.test(t)), 'the board says so');

console.log('\n--- and every line fits a 22px row');
// .chs is height:22px with no overflow rule, so a line that wraps spills over
// the next one and off the panel. Roughly 55 characters fit at 550px.
// Counted the way tests/marketplace.mjs counts it: scrollHeight over the 22px
// line box, so a row that wrapped reports two lines even when the element
// itself was not allowed to grow.
const widest = await p.evaluate(() => {
  const rows = [];
  const draw = (flags, lvl) => { Object.assign(global.flags, flags); you.lvl = lvl;
    chss.mod_hall.sl();
    [...dom.ctr_2.querySelectorAll('.chs')].forEach(n => rows.push({
      t: n.textContent.trim(), chars: n.textContent.trim().length,
      lines: Math.round(n.scrollHeight / 22) })); };
  draw({ mod_rank: 0 }, 1);     // the locked line
  draw({ mod_rank: 0 }, 60);    // a challenge
  draw({ mod_rank: 3 }, 110);   // held lines, and a challenge near the top
  draw({ mod_rank: 1 }, 110);   // the end of the board
  return rows;
});
const wrapped = widest.filter(r => r.lines > 1);
const longest = widest.reduce((a, r) => r.chars > a.chars ? r : a, { chars: 0, t: '' });
check(wrapped.length === 0, wrapped.length
  ? `these wrap: ${wrapped.map(r => `"${r.t}" (${r.chars} chars)`).join(', ')}`
  : `none of the ${widest.length} rows drawn wraps to a second line`);
check(longest.chars <= 55, `longest line is ${longest.chars} chars — "${longest.t}"`);

/* ------------------------------------------------------------ the entrance */
console.log('\n--- reached from the Old Path trailhead');
const gate = await p.evaluate(() => {
  try { chss.mod_gate.sl(); } catch (e) { return { threw: e.message }; }
  const t = [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  return { lines: t,
    hall: t.findIndex(x => /Hall of the First Gate/.test(x)),
    back: t.findIndex(x => /^"<=/.test(x)),
    hollow: t.some(x => /Sunken Hollow/.test(x)) };
});
check(!gate.threw, 'the trailhead still draws' + (gate.threw ? ': ' + gate.threw : ''));
check(gate.hall >= 0, 'the hall entrance is on it');
check(gate.hollow, "and the trailhead's own choices survived the wrap");
check(gate.hall >= 0 && gate.back >= 0 && gate.hall < gate.back,
  'the entrance sits above the "<= Back" line, not below it');

/* ------------------------------------------------------------ winning once */
console.log('\n--- winning a rung writes the rank, pays out, and sticks');
const won = await p.evaluate(() => {
  global.flags.mod_rank = 0;
  you.lvl = 60; you.exp = 0;
  const w0 = you.wealth, e0 = you.exp;
  const r = MOD_rungByRank(10);
  r.area.onEnd();                       // what the last kill in the duel calls
  const afterFirst = MOD_heldRank();
  // a rung you already beat must not be able to make the rank worse
  MOD_rungByRank(10).area.onEnd();
  const stillTen = MOD_heldRank();
  global.flags.mod_rank = 4;
  MOD_rungByRank(10).area.onEnd();      // rank 10 while holding 4
  const notWorse = MOD_heldRank();
  global.flags.mod_rank = afterFirst;
  return { afterFirst, stillTen, notWorse,
    paidWealth: you.wealth > w0, paidExp: you.exp > e0 || you.lvl > 60,
    reward: MOD_rankReward(r) };
});
check(won.afterFirst === 10, `beating rank 10 takes rank 10 (held: ${won.afterFirst})`);
check(won.stillTen === 10, 'beating it again changes nothing');
check(won.notWorse === 4, 'and it cannot demote you from a better rank you already hold');
check(won.paidWealth && won.paidExp,
  `it pays ${won.reward.exp.toLocaleString()} exp and ${won.reward.wealth.toLocaleString()} coin`);

console.log('\n--- the held rank survives a save/load');
const roundTrip = await p.evaluate(() => {
  global.flags.mod_rank = 6;
  const blob = save();
  global.flags.mod_rank = 0;
  load(blob);
  const after = MOD_heldRank();
  const shown = you.rank();
  global.flags.mod_rank = 0;
  return { after, shown, wrapperIntact: /MOD_heldRank/.test(String(you.rank)) };
});
check(roundTrip.after === 6, `rank 6 came back off the save (${roundTrip.after})`);
check(roundTrip.wrapperIntact,
  'and you.rank is still wrapped — load() restores fields into the You instance, it does not replace it');

/* --------------------------------------------------- every rung is winnable */
console.log('\n--- every rung, at every story tier, through the real combat math');
const R = await p.evaluate(() => {
  const SAMPLES = 200;
  const CHARLVL = [5, 12, 20, 30, 40, 55, 70, 85, 100, 110];

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
  const buildPlayer = (ti) => {
    freshYou(); const cap = setTier(ti);
    for (let i = 1; i < CHARLVL[ti]; i++) { try { lvlup(you, 1); } catch (e) {} }
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

  // dmg_calc grants skill exp and sets the crit flag; sampling it without
  // parking those levels the player mid-measurement.
  const quiet = (fn) => { const g = giveSkExp, c = global.flags.crti;
    giveSkExp = function () {};
    try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; } };

  // Tops up until both strata show -- a zero-crit sample used to fall back to a
  // plain mean that DROPS the crits (~30% of damage), reading a fight ~40% long.
  // Same fix as mod.js MOD_meanDamage and allareas.mjs.
  const meanDamage = (att, def, n) => {
    let critN = 0, critSum = 0, plainN = 0, plainSum = 0, zeros = 0, i = 0;
    const rate = MOD_critRate(att);
    for (; i < n * 8; i++) {
      if (i >= n && (critN >= 2 || rate <= 0) && plainN >= 2) break;
      global.flags.crti = false;
      const d = Math.max(0, Math.round(abl.default.f(att, def)));
      if (d <= 0) zeros++;
      if (global.flags.crti) { critN++; critSum += d; } else { plainN++; plainSum += d; }
    }
    return { mean: (critN && plainN)
      ? (1 - rate) * (plainSum / plainN) + rate * (critSum / critN)
      : (critSum + plainSum) / i,
      zeroPct: zeros / i * 100 };
  };

  const rows = [];
  for (let ti = 0; ti < 10; ti++) {
    const cap = buildPlayer(ti);
    MOD_RANK_LADDER.forEach(r => {
      const z = r.area;
      global.current_z = z;
      const m = mon_gen(r.creature); lvlup(m, r.lvl);
      global.current_m = m; try { update_m(); } catch (e) {}
      global.target = you.eqp[2]; global.t_n = 2;
      allbuff(you); allbuff(m);
      const hy = Math.max(0, Math.min(100, hit_calc(1))) / 100;
      const hm = Math.max(0, Math.min(100, hit_calc(2))) / 100;
      let o = 0, i2 = 0, z0 = 0;
      quiet(() => {
        const out = meanDamage(you, m, SAMPLES);
        const inc = meanDamage(m, you, SAMPLES);
        o = out.mean * hy; i2 = inc.mean * hm; z0 = out.zeroPct;
      });
      rows.push({ ti, cap, rank: r.rank, name: m.name,
        kill: o > 0 ? Math.ceil(m.hpmax / o) : Infinity,
        die: i2 > 0 ? Math.ceil(you.hpmax / i2) : Infinity,
        whiff: Math.round(z0),
        killT: +(m._modKillT || 0).toFixed(1), dieT: +(m._modDieT || 0).toFixed(1) });
    });
  }
  return rows;
});

const bad = R.filter(r => !(r.kill < r.die));
const whiffy = R.filter(r => r.whiff > 0);
console.log('  tier  cap   rank  challenger                  kill   die   killT  dieT');
[0, 4, 9].forEach(ti => R.filter(r => r.ti === ti).forEach(r => {
  console.log(`  ${String(r.ti).padStart(4)}  ${String(r.cap).padStart(3)}   ${String(r.rank).padStart(4)}  ` +
    `${r.name.padEnd(26)} ${String(r.kill).padStart(5)} ${String(r.die).padStart(5)}  ` +
    `${String(r.killT).padStart(5)} ${String(r.dieT).padStart(5)}`);
}));
check(R.length === 100, `${R.length} matchups measured (10 rungs x 10 tiers)`);
check(bad.length === 0, bad.length ? `kill < die FAILS in ${bad.length}: ` +
  bad.slice(0, 4).map(r => `t${r.ti} rank ${r.rank} kill ${r.kill}/die ${r.die}`).join('; ')
  : 'kill < die at every rung, at every tier');
check(whiffy.length === 0, whiffy.length
  ? `${whiffy.length} matchups land zero-damage hits` : 'no matchup eats damage (whiff 0 everywhere)');

console.log('\n--- the rungs really do step up');
const byRank = (n) => R.filter(r => r.rank === n);
const meanKillT = (n) => byRank(n).reduce((a, r) => a + r.killT, 0) / byRank(n).length;
const t10 = meanKillT(10), t1 = meanKillT(1);
console.log(`     mean kill target — rank 10: ${t10.toFixed(1)} swings, rank 1: ${t1.toFixed(1)}`);
check(t1 > t10 * 1.4, `the rank 1 duel is ${(t1 / t10).toFixed(2)}x the length of the rank 10 one`);
const marginOk = R.every(r => r.dieT >= r.killT * 1.2);
check(marginOk, 'and the kill<die margin is re-asserted on every stepped rung');

await b.close();
if (errs.length) { console.log('\npage errors:'); errs.slice(0, 5).forEach(e => console.log('  ' + e)); }
console.log(fail.length ? `\nFAILED (${fail.length}):\n  ${fail.join('\n  ')}` : '\nall good');
process.exit(fail.length || errs.length ? 1 : 0);
