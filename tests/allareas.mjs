import { chromium } from 'playwright';

// Exhaustive: EVERY area in the game, EVERY creature in it, at both ends of its
// level band, against EVERY story-tier player state, in THREE builds — the base
// game's skills alone, the mod's added skills alone, and both together.
// earlybal and combat sample a representative route; this one leaves nothing out.
//
// The three builds are the check on the added skills specifically. They are 99%
// of the player's STR by cap 110, so if the enemy model were fitted to a curve
// rather than measured off the player, the three builds would not read alike.
//
// The point of the cross product is that the enemy model anchors to the player's
// power at spawn, so `kill < die` should hold for any player standing in any
// area — including a level 1 character wandering into the Long Vigil, and a
// capped character back in the tutorial. If that is not true, the anchor leaks.
//
//   PORT=8080 node tests/allareas.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  const SAMPLES = 60;

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
  const setTier = (ti) => {
    global.flags.tr3_win = ti >= 1;
    global.flags.mod_t_forest = ti >= 2; global.flags.mod_t_deep = ti >= 3;
    global.flags.mod_t_cata = ti >= 4; global.flags.trne1e1 = ti >= 5; global.flags.trne3e1 = ti >= 6;
    global.flags.mod_prog = { hollow: ti >= 7 ? 99 : 0, spire: ti >= 8 ? 99 : 0, vigil: ti >= 9 ? 99 : 0 };
    MOD_CAP.current = -1; return MOD_levelCap();
  };
  const CHARLVL = [1, 8, 14, 20, 28, 36, 46, 60, 76, 92];
  // id ranges the mod adds: flagships, the consolidated MOD_EXTRA survivors,
  // the section-20 skills, and renown
  const IS_MINE = id => (id >= 901 && id <= 913) || (id >= 1001 && id <= 1100) ||
                        (id >= 2001 && id <= 2010) || id === 2100;
  const buildPlayer = (ti, build) => {
    freshYou(); const cap = setTier(ti);
    for (let i = 1; i < CHARLVL[ti]; i++) { try { lvlup(you, 1); } catch (e) {} }
    for (const k in skl) { const s = skl[k];
      if (!s || typeof s !== 'object' || k === 'rnwn') continue;
      const mine = IS_MINE(s.id);
      const want = build === 'all' || (build === 'base' && !mine) || (build === 'mine' && mine);
      s.lvl = want ? cap : 0;
      if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
        if (want && m.lv <= cap) { try { m.f(); m.g = true; } catch (e) {} } }); }
    you.stat_r();
    global.flags.inside = true; global.flags.isday = true; global.flags.btl = false;
    global.flags.iscold = false; global.flags.iswet = false; global.flags.isdark = false;
    you.hp = you.hpmax; you.sat = you.satmax; allbuff(you);
    return cap;
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

  // Your damage is two tight clusters, not one spread: a normal swing varies by
  // +-10%, a crit runs about 12x that at cap 110 and lands a fifth of the time.
  // A plain sample mean is therefore mostly measuring "how many crits happened",
  // and reports balance failures that are really estimator noise. Averaging the
  // two strata separately and recombining with the crit rate the game will
  // actually roll against removes that. Written out here rather than calling the
  // mod's MOD_meanDamage, so the test is not just agreeing with itself.
  const meanDamage = (att, def, n) => {
    let critN = 0, critSum = 0, plainN = 0, plainSum = 0, zeros = 0;
    for (let i = 0; i < n; i++) {
      global.flags.crti = false;
      const d = Math.max(0, Math.round(abl.default.f(att, def)));
      if (d <= 0) zeros++;
      if (global.flags.crti) { critN++; critSum += d; } else { plainN++; plainSum += d; }
    }
    const mean = (critN && plainN)
      ? (1 - MOD_critRate(att)) * (plainSum / plainN) + MOD_critRate(att) * (critSum / critN)
      : (critSum + plainSum) / n;
    return { mean, zeroPct: zeros / n * 100 };
  };

  const matchup = (z, crt, lvl) => {
    global.current_z = z;
    const hpBefore = you.hpmax;
    const m = mon_gen(crt); lvlup(m, lvl);
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
    return { name: m.name, lvl,
      kill: o > 0 ? Math.ceil(m.hpmax / o) : Infinity,
      die:  i2 > 0 ? Math.ceil(you.hpmax / i2) : Infinity,
      whiff: Math.round(z0),
      // intent vs outcome, so a failure says which side missed and by how much
      why: { killT: +(m._modKillT || 0).toFixed(1), dieT: +(m._modDieT || 0).toFixed(1),
             tgtDmg: Math.round(m._modDmg || 0), gotDmg: Math.round(i2 / Math.max(hm, 1e-9)),
             ehp: Math.round(m.hpmax), yourHp: you.hpmax,
             hpAtSpawn: m._modYourHp || 0, hpBefore: hpBefore,
             hitMon: Math.round(hm * 100) } };
  };

  const areas = Object.keys(area).filter(k => area[k] && area[k].pop && area[k].pop.length);
  const BUILDS = ['all', 'base', 'mine'];
  const out = [];
  const power = [];
  BUILDS.forEach(build => {
    for (let ti = 0; ti < 10; ti++) {
      const cap = buildPlayer(ti, build);
      power.push({ build, ti, cap, str: Math.round(you.str), hp: you.hpmax });
      areas.forEach(ak => {
        const z = area[ak];
        z.pop.forEach(e => {
          const lvls = e.lvlmax !== e.lvlmin ? [e.lvlmin, e.lvlmax] : [e.lvlmin];
          lvls.forEach(lv => {
            const r = matchup(z, e.crt, lv);
            out.push({ build, ti, cap, ak, ...r });
          });
        });
      });
    }
  });
  setTier(0);
  return { rows: out, areas: areas.length, power, builds: BUILDS,
           enemy: JSON.parse(JSON.stringify(MOD_ENEMY)) };
});

const pad = (s, n) => String(s).padStart(n);
const inf = v => (v === Infinity ? 'never' : String(v));

console.log(`${R.areas} areas, ${R.rows.length} matchups`);
console.log('(every area x every creature x both ends of its band x 10 player states x 3 skill builds)');
console.log(`targets: kill ${R.enemy.kill}, die ${R.enemy.die}, margin ${R.enemy.margin}`);

// how far apart the three builds actually are, so "the model does not care" is
// a claim about players who really are orders of magnitude apart
console.log('\n  player STR by build — the added skills are most of it:');
console.log('   cap  |  base game only  |  added only  |  together  | added share');
[0, 4, 9].forEach(ti => {
  const g = b => R.power.find(x => x.build === b && x.ti === ti);
  const a = g('all'), bs = g('base'), mn = g('mine');
  console.log(`  ${String(a.cap).padStart(4)}  | ${String(bs.str.toLocaleString()).padStart(16)}` +
    ` | ${String(mn.str.toLocaleString()).padStart(12)} | ${String(a.str.toLocaleString()).padStart(10)}` +
    ` | ${Math.round((1 - bs.str / a.str) * 100)}%`);
});

const fails = [];
R.builds.forEach(build => {
console.log(`\n  === build: ${build} ===`);
console.log('  player  cap  |  matchups |  kill lo-hi  |  die lo-hi  | worst (lowest die/kill ratio)');
for (let ti = 0; ti < 10; ti++) {
  const rs = R.rows.filter(r => r.ti === ti && r.build === build);
  if (!rs.length) continue;
  const ks = rs.map(r => r.kill), ds = rs.map(r => r.die);
  const ratio = r => (r.die === Infinity ? Infinity : r.die / r.kill);
  const worst = rs.reduce((a, r) => (ratio(r) < ratio(a) ? r : a), rs[0]);
  const badRows = rs.filter(r => r.kill > r.die || r.whiff > 25 || r.kill > 60);
  console.log(`  tier ${ti}  ${pad(rs[0].cap, 3)}  |  ${pad(rs.length, 8)} |` +
    ` ${pad(Math.min(...ks) + '-' + inf(Math.max(...ks)), 11)}  |` +
    ` ${pad(Math.min(...ds) + '-' + inf(Math.max(...ds)), 10)}  |` +
    ` ${worst.ak}/${worst.name.slice(0, 12)} lv${worst.lvl} kill ${inf(worst.kill)} die ${inf(worst.die)}` +
    (badRows.length ? `   <-- ${badRows.length} BAD` : ''));
  badRows.forEach(r => fails.push(
    `[${r.build}] tier ${ti} (cap ${r.cap}) in ${r.ak}: ${r.name} lv${r.lvl} — kill ${inf(r.kill)}, die ${inf(r.die)}, whiff ${r.whiff}%\n` +
    `      intended killT ${r.why.killT} dieT ${r.why.dieT} | damage target ${r.why.tgtDmg.toLocaleString()} got ${r.why.gotDmg.toLocaleString()}` +
    ` | enemy HP ${r.why.ehp.toLocaleString()} | it lands ${r.why.hitMon}%\n` +
    `      your max HP: ${r.why.hpBefore.toLocaleString()} before spawn -> ${Math.round(r.why.hpAtSpawn).toLocaleString()} when the target was set -> ${r.why.yourHp.toLocaleString()} when measured`));
}
});

// what the trivial end looks like — kill 1 means one swing
// creature.default is the "no monster" placeholder, id 0, which MOD_scaleEnemy
// skips on purpose — worth showing what an UNSCALED creature does to a capped
// player, since that is the base game's own math with nothing in the way
const dflt = R.rows.filter(r => r.ak === 'nwh' && r.build === 'all');
console.log('\n  the one unscaled creature (creature.default, id 0 — deliberately skipped):');
[0, 5, 9].forEach(ti => { const r = dflt.find(x => x.ti === ti);
  if (r) console.log(`     tier ${ti} (cap ${r.cap}): kill ${inf(r.kill)}, die ${inf(r.die)}`); });

const triv = R.rows.filter(r => r.kill <= 2);
const byArea = {};
triv.forEach(r => { byArea[r.ak] = (byArea[r.ak] || 0) + 1; });
console.log('\n  matchups killable in <=2 swings, by area:');
Object.keys(byArea).sort((a, b) => byArea[b] - byArea[a]).forEach(k =>
  console.log(`     ${k.padEnd(12)} ${byArea[k]}   e.g. ${triv.find(r => r.ak === k).name} lv${triv.find(r => r.ak === k).lvl} at tier ${triv.find(r => r.ak === k).ti}`));

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fails.push('page errors');
await b.close();
if (fails.length) {
  console.error(`\nFAIL — ${fails.length} of ${R.rows.length} matchups are losses, slogs or whiff-fests:`);
  console.error(' - ' + fails.slice(0, 40).join('\n - '));
  if (fails.length > 40) console.error(` ... and ${fails.length - 40} more`);
  process.exit(1);
}
console.log(`PASS — all ${R.rows.length} matchups across all ${R.areas} areas are winnable at every story tier, in all three skill builds.`);
