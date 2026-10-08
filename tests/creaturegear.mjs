import { launch, settle } from './lib/browser.mjs';

// Every creature held the one shared eqp.dummy, onto which the author wrote
// per-creature affinities, so all of them carried the last writer's and the
// player's fists (which are that object) leaked the player's level into every
// creature's damage. Each now has its own gear, with the values he wrote.
//
//   PORT=8080 node tests/creaturegear.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

const r = await p.evaluate(() => {
  const ks = Object.keys(creature).filter(k => creature[k].eqp);
  const shared = ks.filter(k => creature[k].eqp.some(e => e === eqp.dummy));
  const slots = new Set(); let dup = 0;
  ks.forEach(k => creature[k].eqp.forEach(e => { if (slots.has(e)) dup++; slots.add(e); }));
  const m = mon_gen(creature.bat);
  // the leak: the player's fists scale with level; no creature may feel it
  const before = JSON.stringify(ks.map(k => [creature[k].eqp[0].aff, creature[k].eqp[0].cls]));
  you.eqp[0] = eqp.dummy; you.lvl = 110;
  eqp.dummy.cls[2] = you.lvl / 4 << 0; eqp.dummy.aff[0] = you.lvl / 5 << 0;
  const after = JSON.stringify(ks.map(k => [creature[k].eqp[0].aff, creature[k].eqp[0].cls]));
  return { n: ks.length, shared: shared.length, dup, applied: MOD_CREATURE_GEAR.applied,
           bat: creature.bat.eqp[0].aff, batCls: creature.bat.eqp[0].cls,
           wolf: creature.wolf1.eqp[0].aff, spawnOwn: m.eqp[0] === creature.bat.eqp[0],
           unaffected: before === after, sharedFists: eqp.dummy.aff[0] };
});
console.log(`     ${r.n} creatures, ${r.applied} of the author's affinity lines applied`);
check(r.shared === 0, `no creature holds the shared dummy (${r.shared})`);
check(r.dup === 0, `and no two creatures share a slot (${r.dup} repeats)`);
check(r.applied >= 28, `his per-creature values were read back (${r.applied})`);
check(JSON.stringify(r.bat) === '[0,12,-10,0,0,-5,5]', `the bat has its own affinities (${JSON.stringify(r.bat)})`);
check(r.spawnOwn, 'a spawned bat carries the bat\'s gear, not a shared one');
check(r.unaffected, 'the player\'s fists scaling with level reach no creature');
check(r.sharedFists === 22, 'while the fists themselves still scale (the player keeps the original object)');
check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
