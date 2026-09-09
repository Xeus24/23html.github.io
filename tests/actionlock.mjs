import { chromium } from 'playwright';

// The four added actions have to be EARNED, not handed over on load.
//
// They used to be granted 2.5s after startup and re-granted on a 5s timer, so a
// brand-new character had four unexplained abilities before leaving the
// tutorial. Three now hang off a milestone on the base-game skill they grow out
// of, the same way skl.walk level 1 grants the base game's "Run":
//
//   Toughness 4 -> Endurance Drill    Harvesting 4 -> Forage
//   Literacy  8 -> Practice Calligraphy
//
// Circulate Qi is the exception, and deliberately so. It is the way into the
// whole cultivation system, so it comes from a story beat rather than a skill
// level: clearing the dojo's Easiest, Easy and Normal dummies (tr1/2/3_win).
// That is a tick check rather than a milestone, the same way the base game
// grants act.scout from a story beat.
//
//   PORT=8080 node tests/actionlock.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

const status = () => p.evaluate(() => ({
  locked: MOD_ACTION_UNLOCKS.filter(u => u.act).map(u => ({
    action: u.act.name, have: u.act.have === true,
    skill: skl[u.skill] ? skl[u.skill].name : u.skill,
    key: u.skill, need: u.lv, at: skl[u.skill] ? skl[u.skill].lvl : -1
  })),
  inList: acts.map(a => a.name)
}));

// train a skill the way the game does, until it reaches lv
const train = (key, lv) => p.evaluate(([k, target]) => {
  const s = skl[k];
  let guard = 0;
  while (s.lvl < target && guard++ < 20000) giveSkExp(s, Math.max(s.expnext_t, 1), false);
  return s.lvl;
}, [key, lv]);

console.log('--- the requirements, and where a fresh character stands');
let st = await status();
st.locked.forEach(u => console.log(`     ${u.action.padEnd(21)} needs ${u.skill} ${u.need} (at ${u.at})`));

console.log('\n--- nothing is granted on load');
check(st.locked.every(u => !u.have), 'all four added actions start locked');
check(!st.inList.some(n => st.locked.map(x => x.action).includes(n)),
  'none of them are in the action list');

console.log('\n--- and they do not appear on their own after waiting');
await p.waitForTimeout(7000);           // the old build re-granted every 5s
st = await status();
check(st.locked.every(u => !u.have), 'still locked after 7 seconds of play');

console.log('\n--- each unlocks from its own skill, and only its own');
for (const u of st.locked) {
  const reached = await train(u.key, u.need);
  const now = await status();
  const me = now.locked.find(x => x.action === u.action);
  check(me.have, `${u.skill} reached ${reached} -> "${u.action}" unlocked`);
  check(now.inList.includes(u.action), `"${u.action}" is in the action list`);
  const others = now.locked.filter(x => x.action !== u.action && x.at < x.need);
  check(others.every(x => !x.have),
    `nothing else unlocked with it (${others.length} still below their requirement)`);
}

console.log('\n--- unlocks survive a save and load');
await p.evaluate(() => save(true));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
st = await status();
check(st.locked.every(u => u.have), 'all four are still there after reloading');
check(st.locked.every(u => st.inList.includes(u.action)), 'and all four are in the action list');

console.log('\n--- a save from before the unlock does NOT get them back for free');
await p.evaluate(() => {
  // wipe and start over: a fresh character, saved, must come back with none
  localStorage.clear();
});
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
await p.evaluate(() => save(true));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
st = await status();
check(st.locked.every(u => !u.have), 'a fresh save reloads with all four still locked');

console.log('\n--- Circulate Qi comes from the dojo, not from a skill level');
const qi = await p.evaluate(() => {
  const reset = () => { ['tr1_win','tr2_win','tr3_win'].forEach(f => { global.flags[f] = false; });
    act.mod_qi.have = false;
    const i = you.skls.indexOf(skl.qic); if (i >= 0) you.skls.splice(i, 1);
    acts = acts.filter(a => a !== act.mod_qi); };
  const st = () => ({ have: act.mod_qi.have === true, onSheet: you.skls.indexOf(skl.qic) !== -1 });
  reset(); MOD_checkQiUnlock(); const none = st();
  global.flags.tr1_win = true; MOD_checkQiUnlock(); const easiest = st();
  global.flags.tr2_win = true; MOD_checkQiUnlock(); const easy = st();
  global.flags.tr3_win = true; MOD_checkQiUnlock(); const normal = st();
  MOD_checkQiUnlock(); MOD_checkQiUnlock();
  return { none, easiest, easy, normal, copies: acts.filter(a => a === act.mod_qi).length,
           // Temperance kept a perk at the same level, so the save's index-keyed
           // milestone flags do not shift under an existing character
           rccln5: skl.rccln.mlstn.filter(m => m.lv === 5).length,
           rcclnGrantsAction: /Circulate/.test(skl.rccln.mlstn.filter(m => m.lv === 5)[0].p) };
});
check(!qi.none.have, 'locked with none of the three cleared');
check(!qi.easiest.have, 'still locked after Easiest');
check(!qi.easy.have, 'still locked after Easy');
check(qi.normal.have, 'unlocked once Normal is cleared too');
check(qi.normal.onSheet, 'and Qi Circulation appears on the skill sheet with it');
check(qi.copies === 1, `granted once, not once per tick (${qi.copies} in the action list)`);
check(qi.rccln5 === 1 && !qi.rcclnGrantsAction,
  'Temperance still has exactly one perk at level 5, now a plain one — no index shift for old saves');

console.log('\n--- the escape hatch still works');
// Lock everything first. The Qi section above leaves Circulate Qi unlocked, so
// asserting a raw count here would be measuring test order, not the function.
const granted = await p.evaluate(() => {
  MOD_ACTIONS.forEach(a => { a.have = false; });
  acts = acts.filter(a => MOD_ACTIONS.indexOf(a) === -1);
  return modUnlockAll();
});
st = await status();
const allFour = await p.evaluate(() => MOD_ACTIONS.filter(a => a.have === true).length);
check(granted === 4, `modUnlockAll() granted all four from locked (${granted})`);
check(allFour === 4, `and all four are held afterwards (${allFour})`);
check(st.locked.every(u => u.have), 'including the three that are skill-gated');

console.log('\n--- and modActions() reports honestly');
const report = await p.evaluate(() => modActions());
check(/unlocked/.test(report) && !/\[  locked \]/.test(report),
  'modActions() shows them all unlocked');
console.log(report.split('\n').map(l => '     ' + l).join('\n'));

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the added actions are earned, persist once earned, and are not handed out on load.');
