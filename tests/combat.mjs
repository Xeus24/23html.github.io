import { chromium } from 'playwright';

// The whole story ladder, measured through the game's OWN combat math.
//
// realbal/tierfit judge a fight by the ratio enemyHP/playerSTR and playerHP/enemySTR.
// That proxy is wrong, because dmg_calc is SUBTRACTIVE: an attack does
//     attacker.str  -  defender.str  (+ weapon, +1, crits)
// so the defender's STR is armour. Multiplying an enemy's STR raises its offence
// AND its armour at the same time, and once the armour term passes the attacker's
// STR the damage does not get small, it goes to zero. This script drives dmg_calc
// and hit_calc directly and reports what actually happens.
//
//   PORT=8080 node tests/combat.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  const SAMPLES = 200;

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
  const setTier = (ti) => {
    global.flags.tr3_win = ti >= 1;
    global.flags.mod_t_forest = ti >= 2; global.flags.mod_t_deep = ti >= 3;
    global.flags.mod_t_cata = ti >= 4; global.flags.trne1e1 = ti >= 5; global.flags.trne3e1 = ti >= 6;
    global.flags.mod_prog = { hollow: ti >= 7 ? 99 : 0, spire: ti >= 8 ? 99 : 0, vigil: ti >= 9 ? 99 : 0 };
    MOD_CAP.current = -1; return MOD_levelCap();
  };
  // a player who has actually played to that tier: character level from the game's
  // own lvlup, skills sitting at the tier cap
  const buildPlayer = (ti, charLvl) => {
    freshYou(); const cap = setTier(ti);
    for (let i = 1; i < charLvl; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      s.lvl = cap;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (m.lv <= cap) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r(); neutral(); allbuff(you);
    return { cap, str: you.str, hp: you.hpmax, agl: you.agl };
  };

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
    global.current_m = m; try { update_m(); } catch (e) {}
    global.target = you.eqp[2]; global.t_n = 2;
    allbuff(you); allbuff(m);
    const hitYou = Math.max(0, Math.min(100, hit_calc(1))) / 100;
    const hitMon = Math.max(0, Math.min(100, hit_calc(2))) / 100;
    let dOut = 0, dIn = 0, zOut = 0, zIn = 0;
    quiet(() => {
      for (let i = 0; i < SAMPLES; i++) {
        const a = Math.max(0, Math.round(abl.default.f(you, m))); if (a <= 0) zOut++; dOut += a;
        const d = Math.max(0, Math.round(abl.default.f(m, you))); if (d <= 0) zIn++;  dIn += d;
      }
    });
    dOut /= SAMPLES; dIn /= SAMPLES;
    const oOut = dOut * hitYou, oIn = dIn * hitMon;
    return { name: m.name, lvl,
      ehp: Math.round(m.hpmax), estr: Math.round(m.str),
      hitYou: Math.round(hitYou * 100), hitMon: Math.round(hitMon * 100),
      dOut: +dOut.toFixed(1), dIn: +dIn.toFixed(1),
      whiffOut: Math.round(zOut / SAMPLES * 100), whiffIn: Math.round(zIn / SAMPLES * 100),
      kill: oOut > 0 ? Math.ceil(m.hpmax / oOut) : Infinity,
      die:  oIn  > 0 ? Math.ceil(you.hpmax / oIn) : Infinity };
  };

  // tier index, representative area, the character level a player plausibly has there
  const LADDER = [
    [0, 'trn1',       1,  'Tutorial'],
    [0, 'frstn1a2',   6,  'Western forest'],
    [1, 'frstn1a3',   12, 'W forest grind'],
    [2, 'hmbsmnt',    18, 'Basement'],
    [3, 'frstn9a1',   24, 'Southern forest'],
    [4, 'trne1',      32, 'Golem arena I'],
    [5, 'trne2',      40, 'Golem arena II'],
    [6, 'trne4',      50, 'Golem arena IV'],
    [7, 'mod_hollow', 62, 'Sunken Hollow'],
    [8, 'mod_spire',  76, 'Ashen Spire'],
    [9, 'mod_vigil',  92, 'Long Vigil']
  ];

  // every creature in the area, at both ends of its level band — one pop[0]
  // sample hides exactly the spread this model is supposed to produce
  const rows = LADDER.map(([ti, ak, charLvl, nm]) => {
    if (!area[ak]) return { nm, ak, missing: true };
    const P = buildPlayer(ti, charLvl);
    const fs = [];
    area[ak].pop.forEach(e => {
      fs.push(matchup(area[ak], e.crt, e.lvlmin));
      if (e.lvlmax !== e.lvlmin) fs.push(matchup(area[ak], e.crt, e.lvlmax));
    });
    return { nm, ak, ti, cap: P.cap, charLvl,
             pstr: Math.round(P.str), php: Math.round(P.hp), fs };
  });

  setTier(0);
  return { rows, enemy: JSON.parse(JSON.stringify(MOD_ENEMY)) };
});

const pad = (s, n) => String(s).padStart(n);
const inf = v => (v === Infinity ? 'never' : String(v));

console.log(`targets: kill ${R.enemy.kill}, die ${R.enemy.die}, enemy hit rate ${R.enemy.hit}, ` +
  `spread hp^${R.enemy.hpSpread} atk^${R.enemy.atkSpread}`);
console.log('\n  kill = swings to kill it, die = swings until it kills you (both include miss chance)');
console.log('  whiff = share of LANDED hits that deal zero, because the defender\'s STR ate the damage\n');
console.log('  tier area              cap  clv    you STR    you HP  | n  |  kill lo-hi   |   die lo-hi   | worst matchup');
const fails = [];
R.rows.forEach(r => {
  if (r.missing) { console.log(`   ${r.nm}: MISSING (${r.ak})`); return; }
  const ks = r.fs.map(f => f.kill), ds = r.fs.map(f => f.die);
  const kmin = Math.min(...ks), kmax = Math.max(...ks);
  const dmin = Math.min(...ds), dmax = Math.max(...ds);
  const worst = r.fs.reduce((a, f) => (f.die < a.die ? f : a), r.fs[0]);
  const bad = dmin <= 4 || kmax > 60 || r.fs.some(f => f.whiffOut > 25);
  console.log(`  ${bad ? '!!' : '  '}${pad(r.ti, 2)} ${r.nm.padEnd(17)} ${pad(r.cap, 3)} ${pad(r.charLvl, 4)} ` +
    `${pad(r.pstr.toLocaleString(), 10)} ${pad(r.php.toLocaleString(), 9)}  | ${pad(r.fs.length, 2)} | ` +
    `${pad(inf(kmin) + '-' + inf(kmax), 12)}  | ${pad(inf(dmin) + '-' + inf(dmax), 12)}  | ` +
    `${worst.name.slice(0, 14).padEnd(14)} lv${pad(worst.lvl, 3)} kill ${inf(worst.kill)} die ${inf(worst.die)} whiff ${worst.whiffOut}%`);
  if (bad) fails.push(`${r.nm}: kill ${kmin}-${kmax}, die ${dmin}-${dmax}`);
});
console.log('\nerrors:', errs.length ? errs : 'none');
await b.close();

if (fails.length) {
  console.error('\nFAIL — these are coin flips or slogs:\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('PASS — every tier is a real fight: nothing kills in under 5 swings, nothing takes over 60.');
