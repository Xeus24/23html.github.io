import { launch, settle } from './lib/browser.mjs';

// A hidden tab throttles the game's chained setTimeout loop to once a minute, so
// the mod replays the missed ticks (and the running action's seconds) when the
// loop next runs. Combat is never replayed. Time away is faked by moving the
// loop's "last tick" back, which is what a throttled tab looks like from inside.
//
//   PORT=8080 node tests/catchup.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

// Run one tick by hand after pretending `away` seconds went by.
const away = (sec, opts = {}) => p.evaluate(({ sec, opts }) => {
  const a = { active: true, uses: 0, use() { this.uses++; } };
  const keep = global.current_a;
  if (opts.action) global.current_a = a;
  const t0 = time.minute;
  MOD_CATCHUP.running = false;
  MOD_CATCHUP.last = Date.now() - sec * 1000;
  if (opts.battle) global.flags.btl = true;
  ontick();
  const out = { dMin: time.minute - t0, uses: a.uses, replayed: MOD_CATCHUP.replayed };
  global.current_a = keep; global.flags.btl = false;
  return out;
}, { sec, opts });

console.log('--- a normal tick replays nothing');
let r = await away(1);
check(r.dMin === 1, `one second away is one tick (${r.dMin})`);

console.log('\n--- ten minutes away');
r = await away(600, { action: true });
check(r.dMin >= 599 && r.dMin <= 601, `the clock moves the ten minutes (${r.dMin} ticks)`);
check(r.uses >= 598 && r.uses <= 600, `and the running action gets its seconds (${r.uses})`);

console.log('\n--- capped');
r = await away(86400);
check(r.dMin <= 3601, `a day away replays the cap, an hour, not a day (${r.dMin})`);

console.log('\n--- never replays combat');
r = await away(600, { action: true, battle: true });
check(r.uses === 0 && r.dMin > 500, `in a fight the world moves (${r.dMin}) but the action is not replayed (${r.uses})`);

console.log('\n--- off');
await p.evaluate(() => setCatchUp(0));
r = await away(600);
check(r.dMin === 1, `setCatchUp(0) turns it off (${r.dMin})`);
check(await p.evaluate(() => localStorage.getItem('p23_mod_catchup')) === '0', 'and it persists');
check(await p.evaluate(() => MOD_settingsSnapshot().catchup) === 0, 'and travels in the save');
await p.evaluate(() => setCatchUp(3600));

check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
