import { launch, settle } from './lib/browser.mjs';

// Fifteen of the author's dishes had no giveRcp anywhere. They are taught by
// Cooking level, simplest first, on the tick when the level changes.
//
//   PORT=8080 node tests/dishes.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

const r = await p.evaluate(() => {
  const keys = MOD_DISHES.map(d => d.key);
  const lvs = MOD_DISHES.map(d => d.lv);
  const asc = lvs.every((v, i) => i === 0 || v >= lvs[i - 1]);
  MOD_DISHES.forEach(d => { d.recipe.have = false; });
  const first = MOD_DISHES[0], last = MOD_DISHES[MOD_DISHES.length - 1];
  skl.cook.lvl = first.lv - 1; MOD_teachDishes();
  const before = MOD_DISHES.filter(d => d.recipe.have).length;
  skl.cook.lvl = first.lv; MOD_teachDishes();
  const atFirst = MOD_DISHES.filter(d => d.recipe.have).map(d => d.key);
  skl.cook.lvl = 110; MOD_teachDishes();
  const all = MOD_DISHES.every(d => d.recipe.have);
  const before2 = global.rec_d.length; MOD_teachDishes();
  const idem = global.rec_d.length === before2;
  // through the real tick, as the game runs it
  MOD_DISHES.forEach(d => { d.recipe.have = false; }); skl.cook.lvl = 0; MOD_dishLv = -1; ontick();
  const t0 = MOD_DISHES.filter(d => d.recipe.have).length;
  skl.cook.lvl = 110; ontick();
  const viaTick = MOD_DISHES.every(d => d.recipe.have);
  return { n: keys.length, keys, lvs, asc, before, atFirst, firstKey: first.key, all, idem, t0, viaTick,
           lastLv: last.lv, firstLv: first.lv, noMod: keys.every(k => !/^mod_/.test(k)) };
});
console.log(`     ${r.n} dishes, levels ${r.lvs.join(' ')}`);
check(r.n === 15, `all fifteen found (${r.n}: ${r.keys.join(', ')})`);
check(!r.keys.includes('test') && !r.keys.includes('trr') && !r.keys.includes('jln4') && !r.keys.includes('sshl'), 'the placeholder and the accessories are left alone');
check(r.asc && r.firstLv >= 6 && r.lastLv <= 44, `taught in order across cooking ${r.firstLv}-${r.lastLv}`);
check(r.before === 0, 'nothing is taught before its level');
check(r.atFirst.includes(r.firstKey), 'a dish is taught at its level');
check(r.all, 'every dish is taught by the top');
check(r.idem, 'teaching again hands out nothing twice');
check(r.t0 === 0 && r.viaTick, 'and the real tick does it when the level changes');
check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
