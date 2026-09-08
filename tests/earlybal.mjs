import { chromium } from 'playwright';

// EARLY GAME balance. Every other balance script models the player sitting AT a
// story cap; this one walks the first few hours instead, when the character is
// level 1-20 with barely-levelled skills and no equipment worth the name.
//
// It does not use the str-vs-hp ratio the later scripts use, because that proxy
// is wrong down here: dmg_calc is SUBTRACTIVE (the defender's STR comes off the
// attacker's damage), so at small numbers an enemy multiplier does not make a
// fight slower, it makes it impossible. This drives the game's own dmg_calc and
// hit_calc instead and reports real swings-to-kill / swings-to-die.
//
//   PORT=8080 node tests/earlybal.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate((BASELINE) => {
  const SAMPLES = 300;

  // BASELINE=1 turns the mod's enemy scaling off entirely so the same harness
  // can print what the base game's own numbers look like at the same levels.
  // lvlup resolves MOD_scaleEnemy by name at call time, so this takes effect.
  if (BASELINE) { MOD_scaleEnemy = function () {}; }

  // ---- a genuinely fresh character, then levelled the way the game levels it --
  const freshYou = () => {
    you.lvl = 1;
    you.str_r = 1; you.agl_r = 1; you.int_r = 1; you.spd_r = 1;
    you.hp_r = 39; you.hpmax = 39; you.hp = 39;
    you.sat_r = 200; you.satmax = 200; you.sat = 200;
    you.stra = you.agla = you.inta = you.spda = you.hpa = you.sata = 0;
    you.strm = you.aglm = you.intm = you.spdm = you.hpm = you.satm = 1;
    you.stat_p = [1, 1, 1, 1];
    you.mods.sbonus = 0; you.mods.cpwr = 1;
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object') continue;
      s.lvl = 0; s.exp = 0; if (s.mlstn) s.mlstn.forEach(m => { m.g = false; }); }
    Object.keys(ttl).forEach(k => { ttl[k].have = false; });
    try { MOD_updateRenown(); } catch (e) {}
    you.stat_r();
  };

  const neutral = () => {
    global.flags.inside = true; global.flags.isday = true; global.flags.btl = false;
    global.flags.iscold = false; global.flags.iswet = false; global.flags.isdark = false;
    you.hp = you.hpmax; you.sat = you.satmax;
  };

  // character level via the game's own lvlup, averaged so one lucky roll does
  // not decide the verdict
  const buildPlayer = (charLvl, skillLvl, tierIdx) => {
    freshYou();
    global.flags.tr3_win    = tierIdx >= 1;
    global.flags.mod_t_forest = tierIdx >= 2;
    global.flags.mod_t_deep = tierIdx >= 3;
    global.flags.mod_t_cata = tierIdx >= 4;
    global.flags.trne1e1    = tierIdx >= 5;
    global.flags.trne3e1    = tierIdx >= 6;
    global.flags.mod_prog   = { hollow: 0, spire: 0, vigil: 0 };
    MOD_CAP.current = -1;
    const cap = MOD_levelCap();
    for (let i = 1; i < charLvl; i++) { try { lvlup(you, 1); } catch (e) {} }
    const lv = Math.min(skillLvl, cap);
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = lv;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (m.lv <= lv) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r(); neutral(); allbuff(you);
    return { cap, skillLvl: lv, str: you.str, hp: you.hpmax, agl: you.agl, spd: you.spd };
  };

  // ---- one matchup, measured through the game's real combat math -------------
  // dmg_calc grants skill exp (seye on a crit, the affinity skills on incoming
  // damage) and can set the crit flag. Sampling it thousands of times would
  // level the player mid-sweep and quietly invalidate everything measured after
  // — the mod's own MOD_scaleEnemy parks these for the same reason.
  const quiet = (fn) => {
    const g = giveSkExp, c = global.flags.crti;
    giveSkExp = function () {};
    try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; }
  };

  // global.current_z is the anchor MOD_scaleEnemy measures a spawn against,
  // so it has to be the area the creature is coming out of
  const matchup = (z, crt, lvl) => {
    global.current_z = z;
    const m = mon_gen(crt); lvlup(m, lvl);
    global.current_m = m; update_m && update_m();
    global.target = you.eqp[2]; global.t_n = 2;
    allbuff(you); allbuff(m);

    const hitYou = Math.max(0, Math.min(100, hit_calc(1))) / 100;   // you -> it
    const hitMon = Math.max(0, Math.min(100, hit_calc(2))) / 100;   // it -> you

    let dOut = 0, dIn = 0, zeroOut = 0;
    quiet(() => {
      for (let i = 0; i < SAMPLES; i++) {
        const a = Math.max(0, Math.round(abl.default.f(you, m)));
        if (a <= 0) zeroOut++;
        dOut += a;
        dIn += Math.max(0, Math.round(abl.default.f(m, you)));
      }
    });
    dOut /= SAMPLES; dIn /= SAMPLES;

    const dpsOut = dOut * hitYou, dpsIn = dIn * hitMon;
    return {
      name: m.name, lvl,
      ehp: Math.round(m.hpmax), estr: Math.round(m.str),
      hitYou: +(hitYou * 100).toFixed(0), hitMon: +(hitMon * 100).toFixed(0),
      dOut: +dOut.toFixed(2), dIn: +dIn.toFixed(2),
      whiff: +(zeroOut / SAMPLES * 100).toFixed(0),      // % of landed hits that do nothing
      swingsToKill: dpsOut > 0 ? Math.ceil(m.hpmax / dpsOut) : Infinity,
      swingsToDie:  dpsIn  > 0 ? Math.ceil(you.hpmax / dpsIn) : Infinity,
      spdRatio: +(you.spd / Math.max(m.spd, 0.01)).toFixed(2)
    };
  };

  // ---- the actual opening route, in the order a new character walks it -------
  const ROUTE = [
    ['Tutorial fight 1',   'trn1',     1,  0, 0],
    ['Tutorial fight 2',   'trn2',     2,  1, 0],
    ['Tutorial fight 3',   'trn3',     3,  2, 0],
    ['Training grounds',   'trn',      5,  4, 1],
    ['W forest, first',    'frstn1a2', 6,  5, 1],
    ['Damp cellar',        'clg',      8,  6, 1],
    ['W forest, second',   'frstn2a2', 10, 8, 1],
    ['W forest, grind',    'frstn1a3', 12, 10, 2],
    ['W forest, hidden',   'frstn1a4', 15, 12, 2],
    ['Your basement',      'hmbsmnt',  18, 14, 2],
    ['S forest',           'frstn9a1', 20, 15, 3]
  ];

  const rows = ROUTE.map(([nm, ak, charLvl, skillLvl, ti]) => {
    if (!area[ak]) return { nm, ak, missing: true };
    const P = buildPlayer(charLvl, skillLvl, ti);
    const fights = area[ak].pop.map(e => {
      const lo = matchup(area[ak], e.crt, e.lvlmin);
      const hi = e.lvlmax !== e.lvlmin ? matchup(area[ak], e.crt, e.lvlmax) : null;
      return { w: e.c, lo, hi };
    });
    return { nm, ak, charLvl, player: P, fights };
  });

  // ---- how long to the first skill levels, on the mod's curve ---------------
  const firstLevels = [1, 3, 5, 10].map(L => {
    let t = 0; const s = skl.wsdm; const keep = s.lvl;
    for (let l = 0; l < L; l++) { s.lvl = l; t += s.expnext(); }
    s.lvl = keep;
    return { L, xp: Math.round(t), minsAt02: +(t / 0.2 / 60).toFixed(1) };
  });

  // report the multiplier as a brand-new character sees it, not as the last row left it
  global.flags.tr3_win = global.flags.mod_t_forest = global.flags.mod_t_deep =
    global.flags.mod_t_cata = global.flags.trne1e1 = global.flags.trne3e1 = false;
  MOD_CAP.current = -1; MOD_levelCap();

  return { rows, firstLevels,
           enemy: JSON.parse(JSON.stringify(MOD_ENEMY)) };
}, process.env.BASELINE ? 1 : 0);

const pad = (s, n) => String(s).padStart(n);
const inf = v => (v === null || v === Infinity ? '  never' : pad(v, 6));

console.log(`targets: kill ${R.enemy.kill}, die ${R.enemy.die}, enemy hit rate ${R.enemy.hit}, ` +
  `spread hp^${R.enemy.hpSpread} atk^${R.enemy.atkSpread}, areaScale ${R.enemy.areaScale}`);

console.log('\n=========== FIRST SKILL LEVELS ===========');
R.firstLevels.forEach(f => console.log(`  lv ${pad(f.L, 2)}   ${pad(f.xp.toLocaleString(), 8)} xp   ~${f.minsAt02} min at 0.2 xp/s`));

console.log('\n=========== THE OPENING ROUTE ===========');
console.log('  each row is one enemy type at the bottom and top of its level range');
console.log('  swings = expected attacks including miss chance; whiff% = landed hits that deal 0\n');

const fails = [];
R.rows.forEach(r => {
  if (r.missing) { console.log(`  ${r.nm}: AREA MISSING (${r.ak})`); return; }
  console.log(`  ${r.nm}  —  char lv ${r.charLvl}, skills ${r.player.skillLvl}/${r.player.cap}, ` +
              `STR ${Math.round(r.player.str)}, HP ${Math.round(r.player.hp)}`);
  console.log('        enemy                lv    eHP   eSTR   hit%  dmg    whiff   kill    die');
  r.fights.forEach(f => {
    [f.lo, f.hi].forEach(x => {
      if (!x) return;
      // The fight has to be winnable: both sides swing at roughly the same rate
      // early on, so kill > die means the dummy wins. An exact tie is allowed —
      // at tutorial scale these are single-digit integers coming out of a
      // Math.ceil, and the base game's own opening fight is 15 against 15.
      const bad = x.swingsToKill === Infinity || x.swingsToKill > 60 ||
                  x.swingsToDie <= 3 || x.swingsToKill > x.swingsToDie || x.whiff > 25;
      console.log(`     ${bad ? '!!' : '  '} ${x.name.padEnd(18)} ${pad(x.lvl, 4)} ${pad(x.ehp, 6)} ${pad(x.estr, 6)}` +
                  `  ${pad(x.hitYou, 4)} ${pad(x.dOut.toFixed(1), 6)} ${pad(x.whiff + '%', 6)} ${inf(x.swingsToKill)} ${inf(x.swingsToDie)}`);
      if (bad) fails.push(`${r.nm}: ${x.name} lv${x.lvl} — kill ${x.swingsToKill}, die ${x.swingsToDie}, whiff ${x.whiff}%`);
    });
  });
  console.log('');
});

console.log('errors:', errs.length ? errs : 'none');
await b.close();

if (fails.length) {
  console.error('UNPLAYABLE OR NEAR-UNPLAYABLE MATCHUPS:\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS — the opening route is winnable at every step.');
