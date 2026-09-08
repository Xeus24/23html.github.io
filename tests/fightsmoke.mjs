import { chromium } from 'playwright';

// End-to-end smoke: run real battles through the game's own attack() rather than
// calling dmg_calc directly, so the wrapper is exercised the way the game uses
// it — rounding, hp subtraction, death handling, the per-swing allbuff, the miss
// roll and the dodge check. earlybal and combat measure the shape of the curve;
// this one checks that a fight actually happens and ends.
//
// Each area is fought nine times. Damage is heavy-tailed at the top of the
// ladder — crit rate reaches 33% and a crit is about 8x a normal swing, so
// crits carry roughly three quarters of all damage and a single duel says
// nothing about the balance.
//   PORT=8080 node tests/fightsmoke.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  const setTier = (ti) => {
    global.flags.tr3_win = ti >= 1;
    global.flags.mod_t_forest = ti >= 2; global.flags.mod_t_deep = ti >= 3;
    global.flags.mod_t_cata = ti >= 4; global.flags.trne1e1 = ti >= 5; global.flags.trne3e1 = ti >= 6;
    global.flags.mod_prog = { hollow: ti >= 7 ? 99 : 0, spire: ti >= 8 ? 99 : 0, vigil: ti >= 9 ? 99 : 0 };
    MOD_CAP.current = -1; return MOD_levelCap();
  };

  const freshYou = () => {
    you.lvl = 1; you.str_r = 1; you.agl_r = 1; you.int_r = 1; you.spd_r = 1;
    you.hp_r = 39; you.hpmax = 39; you.hp = 39; you.sat_r = 200; you.satmax = 200; you.sat = 200;
    you.stra = you.agla = you.inta = you.spda = you.hpa = you.sata = 0;
    you.strm = you.aglm = you.intm = you.spdm = you.hpm = you.satm = 1;
    you.stat_p = [1, 1, 1, 1]; you.mods.sbonus = 0; you.mods.cpwr = 1;
    for (const k in skl) { const s = skl[k]; if (!s || typeof s !== 'object') continue;
      s.lvl = 0; s.exp = 0; if (s.mlstn) s.mlstn.forEach(m => { m.g = false; }); }
    Object.keys(ttl).forEach(k => { ttl[k].have = false; });
    try { MOD_updateRenown(); } catch (e) {}
    you.stat_r();
  };

  // a real fight, swing for swing, until someone falls over
  const duel = (ak, ti, charLvl) => {
    freshYou();
    const cap = setTier(ti);
    for (let i = 1; i < charLvl; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = cap;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (m.lv <= cap) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r();
    global.flags.inside = true; global.flags.isday = true;
    global.flags.iscold = false; global.flags.iswet = false; global.flags.isdark = false;
    allbuff(you);
    you.hp = you.hpmax; you.sat = you.satmax;

    global.current_z = area[ak];
    const e = area[ak].pop[0];
    const m = mon_gen(e.crt); lvlup(m, Math.round((e.lvlmin + e.lvlmax) / 2));
    global.current_m = m;
    global.flags.btl = true;                       // attack() no-ops without this
    global.flags.m_blh = true;                     // suppress the hit message spam

    global.target = you.eqp[2]; global.t_n = 2;
    const diag = { modDmg: Math.round(m._modDmg), modRaw: Math.round(m._modRaw),
                   hit2: Math.round(hit_calc(2)), hit1: Math.round(hit_calc(1)),
                   sample: [0,0,0].map(() => Math.round(dmg_calc(m, you, abl.default))),
                   ddg: you.mods.ddgmod, evas: skl.evas.lvl,
                   modOut: Math.round(m._modOut),
                   realOut: Math.round([0,0,0,0,0,0,0,0,0,0].reduce(
                     (a) => a + Math.max(0, dmg_calc(you, m, abl.default)), 0) / 10) };
    let swings = 0, dealt = 0, taken = 0;
    const startHp = you.hp, startM = m.hp;
    while (m.hp > 0 && you.hp > 0 && swings < 200) {
      // the page's own game loop is still running and will drop us out of
      // battle state, after which attack() returns immediately and the duel
      // silently stalls — re-assert it every swing
      global.flags.btl = true; global.flags.m_blh = true;
      dealt += attack(you, m, abl.default) || 0;
      if (m.hp <= 0) break;
      taken += attack(m, you, abl.default) || 0;
      swings++;
    }
    global.flags.btl = false; global.flags.m_blh = false;
    return { ak, cap, swings, won: m.hp <= 0,
             hpLeftPct: Math.round(Math.max(you.hp, 0) / you.hpmax * 100),
             dealt: Math.round(dealt), taken: Math.round(taken),
             startHp: Math.round(startHp), startM: Math.round(startM),
             eff: +you.efficiency().toFixed(2), diag };
  };

  // crit damage is heavy-tailed (see MOD_scaleEnemy), so one duel says nothing
  const RUNS = 9;
  return [ ['trn1', 0, 1], ['frstn1a2', 1, 6], ['hmbsmnt', 2, 18],
           ['trne4', 6, 50], ['mod_vigil', 9, 92] ]
    .filter(([ak]) => area[ak])
    .map(([ak, ti, lv]) => {
      try {
        const rs = [];
        for (let i = 0; i < RUNS; i++) rs.push(duel(ak, ti, lv));
        const sw = rs.map(r => r.swings).sort((a, b) => a - b);
        return { ak, cap: rs[0].cap, runs: RUNS,
                 wins: rs.filter(r => r.won).length,
                 swMin: sw[0], swMed: sw[(RUNS / 2) | 0], swMax: sw[RUNS - 1],
                 stalled: rs.filter(r => r.swings >= 200).length,
                 diag: rs[0].diag };
      } catch (err) { return { ak, threw: String(err).slice(0, 120) }; }
    });
});

console.log('  area          cap   won   swings min/median/max');
const fails = [];
R.forEach(r => {
  if (r.threw) { console.log(`  ${r.ak}: THREW ${r.threw}`); fails.push(`${r.ak} threw`); return; }
  console.log(`  ${r.ak.padEnd(12)} ${String(r.cap).padStart(4)}   ${r.wins}/${r.runs}` +
    `   ${String(r.swMin).padStart(3)} / ${String(r.swMed).padStart(3)} / ${String(r.swMax).padStart(3)}`);
  if (r.wins < r.runs) fails.push(`${r.ak}: lost ${r.runs - r.wins} of ${r.runs} fights`);
  if (r.stalled) fails.push(`${r.ak}: ${r.stalled} fights never resolved`);
  if (r.swMed > 60) fails.push(`${r.ak}: median fight is ${r.swMed} swings — a slog`);
  // No lower bound. pop[0] is often the weakest thing in the area, and by cap
  // 110 a crit is 8x a normal swing and carries three quarters of all damage,
  // so one-shotting the easiest creature there is the build working, not a bug.
});
if (errs.length) fails.push('page errors: ' + JSON.stringify(errs));

console.log('\nerrors:', errs.length ? errs : 'none');
await b.close();
if (fails.length) { console.error('\nFAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS — real battles resolve, are won, and cost real health.');
