import { chromium } from 'playwright';

// The dojo's Level Advancement ladder, carried to character level 110.
//
// The game already has the ladder and the instructor already promises it
// continues -- "After every 5 levels you reach, come here and receive your
// share!" -- and then it stops at level 30, which is a third of the way through
// the mod's progression. This checks the sixteen rungs that finish it, the
// spirit pills sized to what a level actually costs up there, and the manual
// choice at 50/75/100.
//
//   PORT=8080 node tests/dojo.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

// put the player in the ordinary lobby state, past everything the base game gates on
const lobby = (lvl, extra) => p.evaluate(([l, ex]) => {
  Object.assign(global.flags, {
    nbtfail: false, dj1end: true, trnex1: true, trnex2: true,
    trne4e1: true, trne4e1b: true, dj1rw6: true
  }, ex || {});
  you.lvl = l;
  try { chss.t3.sl(); } catch (e) { return ['THREW: ' + e.message]; }
  return [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
}, [lvl, extra]);

const click = (text) => p.evaluate(t => {
  const el = [...dom.ctr_2.querySelectorAll('.chs')].find(n => n.textContent.includes(t));
  if (!el) return ['NOT FOUND: ' + t];
  el.click();
  return [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
}, text);

console.log('--- the pills are sized against what a level actually costs');
const pills = await p.evaluate(() => {
  const cost = l => 4 * l ** 3 + l ** 2;
  return { rows: MOD_PILLS.map(x => ({ name: item[x[0]].name, exp: x[3],
             at50: +(x[3] / cost(50)).toFixed(2), at110: +(x[3] / cost(110)).toFixed(2) })),
           base: [500, 2500, 15000].map(e => +(e / cost(110)).toFixed(4)),
           cost110: cost(110) };
});
pills.rows.forEach(r => console.log(`     ${r.name.padEnd(26)} ${String(r.exp).padStart(9)} exp   ` +
  `${String(r.at50).padStart(5)} levels at 50   ${String(r.at110).padStart(5)} at 110`));
console.log(`     (a level at 110 costs ${pills.cost110.toLocaleString()}; the game's best pill is ${pills.base[2]} of one)`);
check(pills.rows[pills.rows.length - 1].at110 > 1, 'the top pill is worth more than a level at 110');
check(pills.rows[0].at50 < 1, 'the first new pill is not worth a level at 50 — it is a step, not a jump');

console.log('\n--- the continuation does not appear before the base ladder is done');
let rows = await lobby(50, { dj1rw6: false });
check(!rows.some(r => /continued/.test(r)), 'hidden until the base six rungs are claimed');
rows = await lobby(50, { dj1end: false });
check(!rows.some(r => /continued/.test(r)), 'and not on the first-skillbook screen');
rows = await lobby(50, { nbtfail: true });
check(!rows.some(r => /continued/.test(r)), 'nor on the "beaten up by a dummy" screen');

console.log('\n--- and the base lobby is left intact');
rows = await lobby(50);
check(rows.some(r => /infoboard/i.test(r)), 'the infoboard is still there');
check(rows.some(r => /Level Advancement"/.test(r)), 'the game\'s own Level Advancement is still there');
check(rows.some(r => /continued/.test(r)), 'and the continuation sits alongside it');

console.log('\n--- one rung at a time, in order, gated on level');
let adv = await click('continued');
check(adv.some(r => /Level 35 reward/.test(r)), 'at level 50, the next unclaimed rung is 35');
await p.evaluate(() => { global.flags.mod_djrw35 = true; });
adv = await (async () => { await lobby(50); return click('continued'); })();
check(adv.some(r => /Level 40 reward/.test(r)), 'claiming 35 moves it to 40');

await p.evaluate(() => { for (let l = 40; l <= 110; l += 5) global.flags['mod_djrw' + l] = false; });
await lobby(36);
adv = await click('continued');
check(adv.some(r => /Next: level 40/.test(r)), 'at level 36 it says to come back at 40');

console.log('\n--- claiming pays out');
const paid = await p.evaluate(async () => {
  Object.assign(global.flags, { nbtfail: false, dj1end: true, trnex1: true, trnex2: true,
    trne4e1: true, trne4e1b: true, dj1rw6: true });
  for (let l = 35; l <= 110; l += 5) global.flags['mod_djrw' + l] = l < 40;
  you.lvl = 45; you.wealth = 0;
  const before = inv.filter(i => i.id === item.sp4.id).reduce((a, i) => a + (i.amount || 1), 0);
  chss.t3.sl();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /continued/.test(n.textContent)).click();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /Level 40 reward/.test(n.textContent)).click();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /Accept/.test(n.textContent)).click();
  const after = inv.filter(i => i.id === item.sp4.id).reduce((a, i) => a + (i.amount || 1), 0);
  return { coin: you.wealth, pillsGained: after - before, flag: !!global.flags.mod_djrw40 };
});
check(paid.coin > 0, `coin paid (${paid.coin})`);
check(paid.pillsGained >= 2, `spirit pills given (${paid.pillsGained})`);
check(paid.flag, 'the rung is marked claimed');

console.log('\n--- the level 50 rung offers a manual, the way the first skillbook choice does');
const manual = await p.evaluate(() => {
  Object.assign(global.flags, { nbtfail: false, dj1end: true, trnex1: true, trnex2: true,
    trne4e1: true, trne4e1b: true, dj1rw6: true });
  for (let l = 35; l <= 110; l += 5) global.flags['mod_djrw' + l] = l < 50;
  you.lvl = 55;
  chss.t3.sl();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /continued/.test(n.textContent)).click();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /Level 50 reward/.test(n.textContent)).click();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /Accept/.test(n.textContent)).click();
  const offered = [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  const claimedBefore = !!global.flags.mod_djrw50;
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /Sword Saint/.test(n.textContent)).click();
  return { offered, claimedBefore, claimedAfter: !!global.flags.mod_djrw50,
           got: inv.some(i => i.id === item.mod_srdc_manual.id),
           rate: MOD_MANUAL_RATE };
});
console.log('     offered: ' + manual.offered.filter(o => /Manual/.test(o)).join(', '));
check(manual.offered.filter(o => /Manual/.test(o)).length === 6, 'six manuals offered, one per weapon');
check(!manual.claimedBefore, 'the rung is not claimed until a manual is picked');
check(manual.claimedAfter && manual.got, `picking one gives it and claims the rung (+${Math.round(manual.rate*100)}% exp)`);

console.log('\n--- the ladder runs to 110 and then stops');
const end = await p.evaluate(() => {
  Object.assign(global.flags, { nbtfail: false, dj1end: true, trnex1: true, trnex2: true,
    trne4e1: true, trne4e1b: true, dj1rw6: true });
  for (let l = 35; l <= 110; l += 5) global.flags['mod_djrw' + l] = true;
  you.lvl = 110;
  chss.t3.sl();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /continued/.test(n.textContent)).click();
  return { rungs: MOD_DOJO_RUNGS.length, top: MOD_DOJO_RUNGS[MOD_DOJO_RUNGS.length - 1].lv,
           text: [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim()) };
});
check(end.rungs === 16 && end.top === 110, `${end.rungs} rungs, 35 through ${end.top}, in fives`);
check(end.text.some(t => /Nothing further/.test(t)), 'and it says so when there is nothing left');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the instructor keeps his promise all the way to 110.');
