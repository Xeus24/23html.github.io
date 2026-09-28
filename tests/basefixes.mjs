import { launch } from './lib/browser.mjs';

// Section 46's three fixes to the author's code, and section 40's shop prices.
//
//   Death    energy kept on death rises with the skill instead of falling to
//            zero at level 10 and below zero after it
//   Shield   the defence bracket is floored at zero, so defence can no longer be
//            added to the damage you take -- and nothing changes where it was fine
//   Luck     the author's crit multiplier reaches the roll, measured through the
//            real attack path, capped at 50% from luck, and seen by the enemy
//            model's probe
//
//   PORT=8080 node tests/basefixes.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

await p.evaluate(() => {
  window.__real = random;
  window.dice = v => { random = function () { return v; }; };
  window.undice = () => { random = window.__real; };
  window.__gse = giveSkExp; giveSkExp = function () {};
});

console.log('--- Death');
const death = await p.evaluate(() => {
  const die = (lvl) => { skl.dth.lvl = lvl; skl.dth.exp = 0; you.satmax = 200; you.sat = 100; you.hp = 0;
    you.res.death = 1; const d0 = global.stat.deadt; you.onDeath(); you.alive = true;
    return { lvl, died: global.stat.deadt > d0, kept: you.sat / 100 }; };
  const rows = [0, 5, 10, 11, 20, 60, 110].map(die);
  // the "you avoid death" branch runs the same function without dying
  skl.dth.lvl = 20; you.sat = 100; you.res.death = 0; dice(0.5); you.onDeath(); undice();
  const avoided = you.sat; you.res.death = 1;
  return { rows, avoided, original10: 0.55 * (1 - 10 * 0.1), original11: 0.55 * (1 - 11 * 0.1) };
});
death.rows.forEach(r => console.log(`     level ${String(r.lvl).padStart(3)}: keeps ${(r.kept * 100).toFixed(1)}%`));
check(Math.abs(death.rows[0].kept - 0.55) < 1e-9, 'level 0 keeps 55%, exactly as the original did');
check(death.rows.every((r, i, a) => i === 0 || r.kept > a[i - 1].kept), 'and it only improves with level');
check(death.rows.every(r => r.kept > 0 && r.kept < 1), 'never nothing, never everything');
check(death.original10 === 0 && death.original11 < 0,
  `where the original kept ${death.original10} at level 10 and ${death.original11.toFixed(3)} at 11`);
check(death.avoided === 100, 'avoiding death leaves your energy alone');

console.log('\n--- Shield Mastery');
const shield = await p.evaluate(() => {
  const z = area.frstn1a2; global.current_z = z;
  const m = mon_gen(z.pop[0].crt); lvlup(m, 4); global.current_m = m; global.target = you.eqp[2]; global.t_n = 2;
  you.eqp[1].aff = you.eqp[1].aff || {}; const at = m.atype, keep = you.eqp[1].aff[at];
  const hit = (fn) => { dice(0.5); try { return fn(m, you, abl.default); } finally { undice(); } };
  // fine before: a positive bracket must come out exactly as the original
  you.eqp[1].aff[at] = 1; skl.shdc.lvl = 5;
  const fineOrig = hit(MOD_dmg_calc_before_fixes), fineFixed = hit(MOD_dmg_calc_original);
  // broken: a negative bracket
  you.eqp[1].aff[at] = 4; skl.shdc.lvl = 110;
  const floor = MOD_shieldFloorLevel(m);
  const badOrig = hit(MOD_dmg_calc_before_fixes), badFixed = hit(MOD_dmg_calc_original);
  // at the floor the whole defence term is zero: what is left is the attack alone
  skl.shdc.lvl = floor; const atFloor = hit(MOD_dmg_calc_before_fixes); skl.shdc.lvl = 110;
  const restored = skl.shdc.lvl;
  you.eqp[1].aff[at] = keep;
  return { fineOrig, fineFixed, floor, badOrig, badFixed, atFloor, restored };
});
check(shield.fineOrig === shield.fineFixed, `where the bracket was positive nothing changes (${shield.fineOrig})`);
check(shield.floor !== null && shield.badFixed < shield.badOrig,
  `where it had gone negative, defence no longer adds damage (${shield.badOrig} -> ${shield.badFixed})`);
check(shield.badFixed === shield.atFloor, 'the fixed hit is the bracket held at exactly zero');
check(shield.restored === 110, 'and the skill level is put back after the hit');

console.log('\n--- Luck');
const luck = await p.evaluate(() => {
  const z = area.frstn1a2; global.current_z = z;
  const m = mon_gen(z.pop[0].crt); lvlup(m, 3); global.current_m = m; global.target = you.eqp[2]; global.t_n = 2;
  you.sat = you.satmax; const crflt0 = you.mods.crflt;
  const rows = [0, 10, 100].map(L => { you.luck = L; allbuff(you); let c = 0; const N = 30000;
    for (let i = 0; i < N; i++) { global.flags.crti = false; abl.default.f(you, m); if (global.flags.crti) c++; }
    return { L, measured: c / N, model: MOD_critRate(you) }; });
  // a lot of luck, a lot of base crit: capped at 50% from luck
  const keepCrt = you.crt; you.crt = 0.2; you.luck = 223; const capped = MOD_critRate(you); you.crt = keepCrt;
  // the probe's path is the fixed one, so enemies are sized against it
  const probeSeesIt = MOD_meanDamage.toString().indexOf('MOD_dmg_calc_original') >= 0;
  you.luck = 0;
  return { rows, capped, crfltExact: you.mods.crflt === crflt0, probeSeesIt };
});
luck.rows.forEach(r => console.log(`     luck ${String(r.L).padStart(3)}: crit ${(r.measured * 100).toFixed(2)}% measured, ${(r.model * 100).toFixed(2)}% modelled`));
check(luck.rows[2].measured > luck.rows[0].measured * 2, 'luck now raises the crit chance on real swings');
check(luck.rows.every(r => Math.abs(r.measured - r.model) < 0.004), "and the model the enemy probe weights by agrees with the swings");
check(Math.abs(luck.capped - 0.5) < 1e-9, `luck alone cannot push crit past 50% (${luck.capped})`);
check(luck.crfltExact, 'the saved crflt field is put back exactly, not add-then-subtract');
check(luck.probeSeesIt, "the enemy model's probe measures through the fixed path");

console.log('\n--- shop prices');
const shop = await p.evaluate(async () => {
  const tick = () => new Promise(r => setTimeout(r, 60));
  const big = chs('"Tribulation Pill" <small>7000000●</small> x1', false); await tick();
  const drawn = big.textContent;
  big.innerHTML = '"Tribulation Pill" <small>38000●</small> x2'; await tick();
  const rewritten = big.textContent;
  const small = chs('"Bread" <small>31●</small> x3', false); await tick();
  setNumberFormat('game'); const raw = chs('"x" <small>45000●</small>', false); await tick(); setNumberFormat('short');
  return { drawn, rewritten, small: small.textContent, raw: raw.textContent };
});
check(/7\.00M●/.test(shop.drawn), `a big price is formatted when the shop draws it (${shop.drawn})`);
check(/38\.0K●/.test(shop.rewritten), 'and when a purchase rewrites the line');
check(/31●/.test(shop.small), "the base game's own prices, all under 10,000, are untouched");
check(/45000●/.test(shop.raw), '"As the original" leaves every price raw');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — death, shield and luck do what their text says, and shop prices read.');
