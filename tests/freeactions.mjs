import { chromium } from 'playwright';

// The "Unrestricted actions" checkbox: run several sustained actions at once,
// and start them anywhere.
//
// The base game runs one action at a time, enforced twice over — activateAct
// deactivates whatever was running, and every action's activate() overwrites the
// single shared timers.actm. Both have to give way, without reimplementing
// either, and both have to come straight back when the box is unchecked.
//
//   PORT=8080 node tests/freeactions.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

// give the player every action, indoors and in a fight — the least permissive
// context the game has. The actions tab has to be opened: the game's own
// deactivateAct calls refreshAct(a.t, ...) and a.t only exists once rendered,
// which in play is guaranteed because you have to open the panel to click one.
const setup = () => p.evaluate(() => {
  modUnlockAll();
  dom.ct_bt3.click();                     // renders the action rows, setting a.t
  global.flags.inside = true; global.flags.civil = true; global.flags.btl = false;
  global.flags.sleepmode = false; global.flags.rdng = false; global.flags.work = false;
  return acts.map(a => a.name);
});
const running = () => p.evaluate(() => ({
  active: acts.filter(a => a.active === true).map(a => a.name),
  timers: acts.filter(a => a._modTimer).map(a => a.name),
  current: global.current_a.name,
  busy: global.flags.busy
}));
const start = names => p.evaluate(ns => {
  ns.forEach(n => { const a = acts.find(x => x.name === n); if (a && a.cond() === true) activateAct(a); });
}, names);

const all = await setup();
console.log('  actions available: ' + all.join(', '));

console.log('\n--- with the box unchecked, the game behaves exactly as it always did');
await p.evaluate(() => setFreeActions(false));
let condIndoors = await p.evaluate(() => ({
  run: act.demo.cond(false), drill: act.mod_cond.cond(false), forage: act.mod_forage.cond(false)
}));
check(condIndoors.run === false, 'Run still refuses indoors');
check(condIndoors.drill === false, 'Endurance Drill still refuses indoors');

await start(['Circulate Qi', 'Practice Calligraphy']);
let r = await running();
check(r.active.length === 1, `only one action runs at a time (${r.active.join(', ') || 'none'})`);
await p.evaluate(() => { acts.forEach(a => { if (a.active) deactivateAct(a); }); });

console.log('\n--- checked: conditions stop applying');
await p.evaluate(() => setFreeActions(true));
condIndoors = await p.evaluate(() => ({
  run: act.demo.cond(false), drill: act.mod_cond.cond(false), forage: act.mod_forage.cond(false)
}));
check(condIndoors.run === true && condIndoors.drill === true && condIndoors.forage === true,
  'Run, Endurance Drill and Forage all start indoors');

const inBattle = await p.evaluate(() => {
  global.flags.btl = true;
  const c = act.mod_qi.cond(false);
  global.flags.btl = false;
  return c;
});
check(inBattle === true, 'and mid-fight');

console.log('\n--- checked: several run at once, each on its own timer');
await start(['Circulate Qi', 'Practice Calligraphy', 'Endurance Drill', 'Forage']);
r = await running();
check(r.active.length === 4, `four actions active at once (${r.active.length})`);
check(r.timers.length === 4, `each holds its own interval (${r.timers.length})`);
check(new Set(await p.evaluate(() => acts.filter(a => a._modTimer).map(a => a._modTimer))).size === 4,
  'and the four intervals are distinct, not one shared slot');
check(r.busy === true, 'the game still reads as busy');

console.log('\n--- and they are all really ticking');
const before = await p.evaluate(() => ({
  qic: skl.qic.exp + skl.qic.lvl * 1000, clg: skl.clg.exp + skl.clg.lvl * 1000,
  cnd: skl.cnd.exp + skl.cnd.lvl * 1000, frg: skl.frg.exp + skl.frg.lvl * 1000
}));
await p.waitForTimeout(2600);
const after = await p.evaluate(() => ({
  qic: skl.qic.exp + skl.qic.lvl * 1000, clg: skl.clg.exp + skl.clg.lvl * 1000,
  cnd: skl.cnd.exp + skl.cnd.lvl * 1000, frg: skl.frg.exp + skl.frg.lvl * 1000
}));
['qic', 'clg', 'cnd', 'frg'].forEach(k =>
  check(after[k] > before[k], `${k} gained exp while the other three also ran`));

console.log('\n--- clicking a running action still stops just that one');
await p.evaluate(() => activateAct(acts.find(a => a.name === 'Forage')));
r = await running();
check(r.active.length === 3 && !r.active.includes('Forage'), 'Forage stopped, the other three kept going');
check(r.busy === true, 'still busy, because three are still running');

console.log('\n--- unchecking stops everything and restores one-at-a-time');
await p.evaluate(() => setFreeActions(false));
r = await running();
check(r.active.length === 0, 'everything stopped when the box was unchecked');
check(r.timers.length === 0, 'no orphan intervals left behind');
check(r.busy === false && r.current === 'dummy', 'the game is idle again');

await start(['Circulate Qi', 'Practice Calligraphy']);
r = await running();
check(r.active.length === 1, 'and only one action runs again');
await p.evaluate(() => { acts.forEach(a => { if (a.active) deactivateAct(a); }); });

console.log('\n--- the setting survives a reload');
await p.evaluate(() => setFreeActions(true));
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
check(await p.evaluate(() => getFreeActions()) === true, 'still on after reloading');
const box = await p.evaluate(() => {
  const i = MOD_SETTINGS.inputs.find(x => x.box);
  return i ? { exists: true, checked: i.el.checked, type: i.el.type } : { exists: false };
});
check(box.exists && box.type === 'checkbox', 'the settings row is a checkbox');
check(box.checked === true, 'and it shows checked');

await p.evaluate(() => setFreeActions(false));

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — several actions at once and anywhere while checked, base-game behaviour while not.');
