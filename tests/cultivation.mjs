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
  count: MOD_REALMS.length - 1,
  realms: MOD_REALMS.map(r => `${r.n} ${r.name} (Qi ${r.qic}, x${r.mult})`),
  // the realms are DERIVED from MOD_RANK_AT, so realm N must be the level that
  // earns a rank N title, and each realm's own title must land at rank N.
  // Asserting it here is what stops the two ladders drifting apart later.
  aligned: MOD_REALMS.slice(1).every(r =>
    r.qic === MOD_RANK_AT[r.n - 1] &&
    MOD_rankForLevel(r.qic) === r.n &&
    ttl['mod_realm' + r.n] && ttl['mod_realm' + r.n].rar === r.n &&
    !!item['mod_bp' + r.n]),
  ranks: MOD_RANK_AT,
  start: MOD_realm().name,
  pills: MOD_BREAK_PILLS.map(b => item['mod_bp' + b[0]].name),
  masteries: MOD_MASTERY.map(m => m.skill.name),
  perks: MOD_MASTERY.map(m => m.skill.mlstn.length),
  wired: MOD_MASTERY.every(m => MOD_KEY_BY_ID[m.skill.id] === m.key && !!MOD_PARENT_OF[m.key])
}));
ladder.realms.forEach(r => console.log('     ' + r));
const MOD_REALM_COUNT = ladder.count;
const MOD_REALMS_NAME3 = ladder.realms[3];
check(ladder.count === ladder.ranks.length,
  `one realm per title rank (${ladder.count} realms, ${ladder.ranks.length} ranks)`);
check(ladder.aligned,
  'realm N sits at the level that earns a rank N title, and its own title is rank N');
check(ladder.start === 'Mortal', 'a new character starts Mortal');
check(ladder.pills.length === MOD_REALM_COUNT, `one breakthrough pill per realm (${ladder.pills.length})`);
check(ladder.masteries.length === 6, `six mastery skills (${ladder.masteries.join(', ')})`);
check(ladder.perks.every(n => n === 7), 'each has the same perk ladder every other skill got');
check(ladder.wired, 'and all six are registered with the cap and skill-panel maps');

console.log('\n--- every breakthrough pill has a source in the game');
// The realm system shipped once with none of them obtainable: the ten pills
// existed as items and nothing gave, dropped or sold them, so the whole ladder
// was console-only. The test called MOD_breakthrough directly and never asked
// where a pill came from — the gap a test that mocks its inputs leaves open.
const sources = await p.evaluate(() => {
  const src = {};
  for (let n = 1; n <= MOD_REALMS.length - 1; n++) src[n] = [];
  // the instructor, on the Qi unlock
  if (/mod_bp1/.test(String(MOD_checkQiUnlock))) src[1].push('dojo (Qi unlock)');
  // the Herbalist's stock list
  (vendor.pha1.items || []).forEach(e => {
    const m = /^mod_bp(\d+)$/.exec(Object.keys(item).find(k => item[k] === e.item) || '');
    if (m) src[+m[1]].push('Herbalist ' + e.p + 'c');
  });
  // the dojo's continuation rungs
  MOD_DOJO_RUNGS.forEach(r => { if (r.realmPill) src[r.realmPill].push('dojo lv ' + r.lv); });
  return { src, spirit: (vendor.pha1.items || [])
    .filter(e => [item.sp4, item.sp5, item.sp6, item.sp7].indexOf(e.item) !== -1)
    .map(e => e.item.name) };
});
Object.keys(sources.src).forEach(n =>
  console.log(`     realm ${String(n).padStart(2)}  ${sources.src[n].join(', ') || 'NOWHERE'}`));
const orphans = Object.keys(sources.src).filter(n => !sources.src[n].length);
check(orphans.length === 0,
  `every realm's pill is obtainable in play (${orphans.length ? 'orphaned: ' + orphans.join(',') : 'all ' + Object.keys(sources.src).length})`);
check(sources.src[1].some(s => /dojo/.test(s)),
  'realm 1 comes from the dojo, not the marketplace — the marketplace is gated behind a 40% encounter');
check(sources.spirit.length >= 2, `the Herbalist also stocks the new spirit pills (${sources.spirit.join(', ')})`);

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
  // read the requirements rather than hardcoding them: the thresholds come from
  // MOD_RANK_AT and change whenever the title ranks are retuned
  const two = MOD_REALMS[2];
  global.flags.mod_realm = 0; skl.qic.lvl = 999;
  const skip = MOD_breakthrough(3, { amount: 1 });          // realm 3 from realm 0
  global.flags.mod_realm = 1; skl.qic.lvl = two.qic - 1;    // one short of realm 2
  const under = MOD_breakthrough(2, { amount: 1 });
  return { skip, under, realm: MOD_realm().name, needed: two.qic };
});
check(rules.skip === undefined, 'skipping a realm is refused');
check(rules.under === undefined, `breaking through one level short of Qi ${rules.needed} is refused`);
check(rules.realm !== MOD_REALMS_NAME3, 'and the realm did not move');

console.log('\n--- breaking through costs the pill whether or not it works');
const attempt = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = MOD_REALMS[1].qic;   // exactly at the wall
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
  skl.qic.lvl = MOD_REALMS[1].qic + over;
  let wins = 0;
  for (let i = 0; i < 300; i++) { global.flags.mod_realm = 0; if (MOD_breakthrough(1, { amount: 1 })) wins++; }
  return { over, pct: Math.round(wins / 300 * 100) };
}));
odds.forEach(o => console.log(`     +${o.over} past the requirement: ${o.pct}%`));
check(odds[2].pct > odds[0].pct, 'training past the wall makes it likelier');

console.log('\n--- a realm is worth something, and does not compound over reloads');
const worth = await p.evaluate(() => {
  global.flags.mod_realm = 0; skl.qic.lvl = 1;
  you.stat_r(); allbuff(you);
  const mortal = { str: you.str, hp: you.hpmax };
  global.flags.mod_realm = 3;
  you.stat_r(); allbuff(you);
  const core = { str: you.str, hp: you.hpmax };
  for (let i = 0; i < 20; i++) allbuff(you);          // many refreshes
  const after = { str: you.str, hp: you.hpmax };
  return { name: MOD_REALMS[3].name, want: MOD_REALMS[3].mult,
           strX: +(core.str / mortal.str).toFixed(2), hpX: +(core.hp / mortal.hp).toFixed(2),
           top: MOD_REALMS[MOD_REALMS.length - 1].mult,
           stable: Math.abs(after.str - core.str) < 1e-6 && after.hp === core.hp };
});
check(Math.abs(worth.strX - worth.want) < 0.06,
  `${worth.name} is worth the x${worth.want} it advertises (measured x${worth.strX} STR, x${worth.hpX} HP)`);
check(worth.top >= 5, `and the top realm is worth x${worth.top}`);
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
