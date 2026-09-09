import { chromium } from 'playwright';

// Cultivation realms and elemental mastery.
//
// The realm ladder is the genre's standard one (Qi Refining -> Foundation
// Establishment -> Core Formation -> ...), and the point of it is the
// BOTTLENECK: reaching the level does not advance the realm, it puts you at a
// wall that costs a pill to break. A realm you get for free is just a second
// name for a level.
//
// The masteries are the other half: six skills whose techniques actually fire
// in combat. Combat is automatic here -- fght calls battle_ai, there is no
// ability picker -- so a technique is a proc on the swing, and this checks it
// lands at the advertised rate through the real attack path.
//
//   PORT=8080 node tests/cultivation.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the ladder');
const ladder = await p.evaluate(() => ({
  realms: MOD_REALMS.map(r => `${r.n} ${r.name} (Qi ${r.qic}, x${r.mult})`),
  start: MOD_realm().name,
  pills: MOD_BREAK_PILLS.map(b => item['mod_bp' + b[0]].name),
  masteries: MOD_MASTERY.map(m => m.skill.name),
  perks: MOD_MASTERY.map(m => m.skill.mlstn.length),
  wired: MOD_MASTERY.every(m => MOD_KEY_BY_ID[m.skill.id] === m.key && !!MOD_PARENT_OF[m.key])
}));
ladder.realms.forEach(r => console.log('     ' + r));
check(ladder.start === 'Mortal', 'a new character starts Mortal');
check(ladder.pills.length === 6, `one breakthrough pill per realm (${ladder.pills.length})`);
check(ladder.masteries.length === 6, `six mastery skills (${ladder.masteries.join(', ')})`);
check(ladder.perks.every(n => n === 7), 'each has the same perk ladder every other skill got');
check(ladder.wired, 'and all six are registered with the cap and skill-panel maps');

console.log('\n--- reaching the level does NOT advance the realm');
const wall = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = 30;
  return { realm: MOD_realm().name, eligible: MOD_realmEligible().name, atWall: MOD_atBottleneck() };
});
check(wall.realm === 'Mortal' && wall.eligible !== 'Mortal',
  `Qi Circulation 30 makes ${wall.eligible} reachable but you are still ${wall.realm}`);
check(wall.atWall, 'the bottleneck is reported');

console.log('\n--- you cannot skip a realm, or break through under-levelled');
const rules = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = 30;
  const skip = MOD_breakthrough(3, { amount: 1 });      // two realms ahead
  global.flags.mod_realm = 0; skl.qic.lvl = 5;
  const under = MOD_breakthrough(1, { amount: 1 });     // needs Qi 10
  return { skip, under, realm: MOD_realm().name };
});
check(rules.skip === undefined && rules.under === undefined, 'both attempts refused');
check(rules.realm === 'Mortal', 'and the realm did not move');

console.log('\n--- breaking through costs the pill whether or not it works');
const attempt = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = 10;
  let consumed = 0, wins = 0, losses = 0;
  for (let i = 0; i < 200; i++) {
    global.flags.mod_realm = 0;
    const pill = { amount: 1 };
    const r = MOD_breakthrough(1, pill);
    if (pill.amount === 0) consumed++;
    r ? wins++ : losses++;
  }
  return { consumed, wins, losses, odds: Math.min(0.55 + 0 * 0.05, 0.95) };
});
check(attempt.consumed === 200, `the pill is spent every time (${attempt.consumed}/200)`);
check(attempt.losses > 0, `failure is possible (${attempt.losses} of 200 failed)`);
check(Math.abs(attempt.wins / 200 - attempt.odds) < 0.12,
  `success ~${Math.round(attempt.odds * 100)}% at the threshold (got ${Math.round(attempt.wins / 200 * 100)}%)`);

console.log('\n--- consolidating past the requirement improves the odds');
const odds = await p.evaluate(() => [0, 4, 8].map(over => {
  skl.qic.lvl = 10 + over;
  let wins = 0;
  for (let i = 0; i < 300; i++) { global.flags.mod_realm = 0; if (MOD_breakthrough(1, { amount: 1 })) wins++; }
  return { over, pct: Math.round(wins / 300 * 100) };
}));
odds.forEach(o => console.log(`     Qi Circulation ${10 + o.over} (+${o.over} past): ${o.pct}%`));
check(odds[2].pct > odds[0].pct, 'training past the wall makes it likelier');

console.log('\n--- a realm is worth something, and does not compound over reloads');
const worth = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = 10;
  you.stat_r(); allbuff(you);
  const mortal = { str: you.str, hp: you.hpmax };
  global.flags.mod_realm = 3;
  you.stat_r(); allbuff(you);
  const core = { str: you.str, hp: you.hpmax };
  for (let i = 0; i < 20; i++) allbuff(you);          // many refreshes
  const after = { str: you.str, hp: you.hpmax };
  return { strX: +(core.str / mortal.str).toFixed(2), hpX: +(core.hp / mortal.hp).toFixed(2),
           stable: Math.abs(after.str - core.str) < 1e-6 && after.hp === core.hp };
});
check(worth.strX > 1.9, `Core Formation is worth x${worth.strX} STR and x${worth.hpX} HP`);
check(worth.stable, 'twenty allbuff refreshes do not stack it');

console.log('\n--- no technique fires below Qi Refining');
const closed = await p.evaluate(() => {
  global.flags.mod_realm = 0;
  MOD_MASTERY.forEach(m => { m.skill.lvl = 60; });
  return { chances: MOD_MASTERY.map(m => MOD_techChance(m)), desc: MOD_EFFECTS.mod_fire(skl.mod_fire) };
});
check(closed.chances.every(c => c === 0), 'every technique is inert at Mortal');
check(/channels are closed/.test(closed.desc), 'and the skill says why');

console.log('\n--- techniques fire in real combat at the advertised rate');
const combat = await p.evaluate(() => {
  global.flags.mod_realm = 2;
  MOD_MASTERY.forEach(m => { m.skill.lvl = 0; });
  skl.mod_fire.lvl = 40;
  const expected = MOD_techChance(MOD_MASTERY[0]);
  global.current_z = area.frstn1a2;
  const e = area.frstn1a2.pop[0];
  const mon = mon_gen(e.crt); lvlup(mon, 5);
  global.current_m = mon; global.target = you.eqp[2];
  global.flags.m_blh = true;
  let procs = 0, swings = 0;
  const orig = attack;
  attack = function (x, y, atk, pow) {
    swings++;
    if (atk && atk.id >= 2001 && atk.id <= 2006) procs++;
    return orig(x, y, atk, pow);
  };
  for (let i = 0; i < 600; i++) {
    mon.hp = mon.hpmax; you.hp = you.hpmax; global.flags.btl = true;
    you.battle_ai(you, mon);
  }
  attack = orig; global.flags.btl = false; global.flags.m_blh = false;
  return { swings, procs, rate: procs / swings, expected,
           statType: abl.mod_fire.stt, element: abl.mod_fire.aff };
});
console.log(`     ${combat.procs} of ${combat.swings} swings became a technique ` +
  `(${Math.round(combat.rate * 100)}%, advertised ${Math.round(combat.expected * 100)}%)`);
check(combat.procs > 0, 'techniques actually reach the real attack path');
check(Math.abs(combat.rate - combat.expected) < 0.07, 'at close to the advertised rate');
check(combat.statType === 2, 'and route through the INT branch of dmg_calc, not the weapon one');

console.log('\n--- a swing is never lost to a broken proc');
const safe = await p.evaluate(() => {
  const orig = MOD_pickTechnique;
  MOD_pickTechnique = function () { throw new Error('deliberate'); };
  const mon = mon_gen(area.frstn1a2.pop[0].crt); lvlup(mon, 5);
  global.current_m = mon; global.target = you.eqp[2];
  global.flags.btl = true; global.flags.m_blh = true;
  let landed = 0;
  for (let i = 0; i < 20; i++) { mon.hp = mon.hpmax; if (you.battle_ai(you, mon) !== undefined) landed++; }
  MOD_pickTechnique = orig; global.flags.btl = false; global.flags.m_blh = false;
  return landed;
});
check(safe === 20, `all 20 swings still landed with the proc throwing (${safe})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — realms gate on a bottleneck that costs something, and techniques land in combat.');
