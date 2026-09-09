import { chromium } from 'playwright';

// The two places the game was already pointing at.
//
// The catacombs: 26 locations, fully written by the author, with their own
// ambient text and a bestiary entry naming them -- and nothing linking in. The
// entrance is one chs() on the Village Center, which is where its own exit
// already leads.
//
// The Pill Tower: the author wrote the Village Center choice and commented it
// out; chss.pltwr1 was never built. This builds it as chss.mod_pltwr, so the
// two cannot collide if they ever finish theirs.
//
//   PORT=8080 node tests/places.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

const village = (flags) => p.evaluate(f => {
  Object.assign(global.flags, f);
  try { chss.lsmain1.sl(); } catch (e) { return ['THREW: ' + e.message]; }
  return [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
}, flags);

console.log('--- both are gated, and the Village Center is left intact');
let v = await village({ mod_t_deep: false, mod_realm: 0 });
check(!v.some(t => /Catacombs/.test(t)), 'no catacombs before the deep forest');
check(!v.some(t => /Pill Tower/.test(t)), 'no Pill Tower while still Mortal');
check(v.some(t => /Enter Dojo/.test(t)) && v.some(t => /Message Board/.test(t)),
  "the game's own choices are all still there");

v = await village({ mod_t_deep: true });
check(v.some(t => /Enter the Catacombs/.test(t)), 'the catacombs open once the deep forest is done');
check(!v.some(t => /Pill Tower/.test(t)), 'the tower still does not');

v = await village({ mod_realm: 2 });
check(v.some(t => /Pill Tower/.test(t)), 'and the tower opens once you have a realm');

console.log('\n--- the gate exists to keep the cap ladder in order');
const caps = await p.evaluate(() => {
  const at = (f) => { Object.assign(global.flags, { mod_t_forest: false, mod_t_deep: false,
    frstn1a3u: false, mod_t_cata: false, trne1e1: false, trne3e1: false, tr3_win: false },
    f); MOD_CAP.current = -1; return MOD_levelCap(); };
  return { fresh: at({}), forest: at({ mod_t_forest: true }),
           deep: at({ mod_t_forest: true, mod_t_deep: true }),
           cata: at({ mod_t_forest: true, mod_t_deep: true, mod_t_cata: true }),
           gate: MOD.cata_gate };
});
console.log(`     fresh ${caps.fresh} -> forest ${caps.forest} -> deep ${caps.deep} -> catacombs ${caps.cata}`);
check(caps.gate === 'mod_t_deep', `gated on ${caps.gate}, the rung below it`);
check(caps.cata > caps.deep && caps.deep > caps.forest,
  'so the catacombs rung comes after the ones below it, not straight out of the tutorial');

console.log('\n--- the catacombs themselves are the author\'s, and they work');
const cata = await p.evaluate(() => {
  global.flags.mod_t_cata = false;
  try { chss.catamn.sl(); } catch (e) { return { threw: e.message }; }
  const rows = [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  // count how many catacomb rooms exist and how many the mod wrote (none)
  const rooms = Object.keys(chss).filter(k => /^cata/.test(k)).length;
  return { rows, rooms, tierSet: global.flags.mod_t_cata === true,
           modWrote: Object.keys(chss).filter(k => /^mod_cata/.test(k)).length };
});
check(!cata.threw, 'the entryway draws');
check(cata.rows.some(t => /Move North/.test(t)) && cata.rows.some(t => /Exit/.test(t)),
  'with its own exits');
check(cata.rooms >= 26, `${cata.rooms} catacomb rooms now reachable`);
check(cata.modWrote === 0, 'none of them written by the mod — the entrance is the whole change');
check(cata.tierSet, 'and visiting sets mod_t_cata, so the cap-40 rung is finally live');

console.log('\n--- the Pill Tower');
const tower = await p.evaluate(() => {
  global.flags.mod_realm = 2;
  try { chss.mod_pltwr.sl(); } catch (e) { return { threw: e.message }; }
  const rows = [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  let tries = 0, everything = new Set();
  while (tries++ < 400) { restock(vendor.mod_pltwr);
    vendor.mod_pltwr.stock.forEach(s => everything.add(s[0].name)); }
  return { rows, stocks: [...everything], clash: typeof chss.pltwr1,
           id: chss.mod_pltwr.id };
});
check(!tower.threw, 'the tower draws');
check(tower.rows.some(t => /Purchase/.test(t)), 'it sells');
check(tower.rows.some(t => /spirit vein/.test(t)), 'it has the spirit vein');
check(tower.rows.some(t => /Leave/.test(t)), 'and a way out');
check(tower.clash === 'undefined', "it does not collide with the author's own chss.pltwr1");
console.log('     stocks: ' + tower.stocks.join(', '));
check(tower.stocks.length >= 5, `${tower.stocks.length} distinct wares over 400 restocks`);

console.log('\n--- the vein gives once a day');
const vein = await p.evaluate(() => {
  global.flags.mod_vein_day = -1; global.flags.mod_realm = 2;
  const before = skl.qic.exp + skl.qic.lvl * 1e6;
  chss.mod_pltwr.sl();
  [...dom.ctr_2.querySelectorAll('.chs')].find(n => /spirit vein/.test(n.textContent)).click();
  const after = skl.qic.exp + skl.qic.lvl * 1e6;
  chss.mod_pltwr.sl();
  const second = [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  // and it scales with the realm, so it stays worth the walk
  global.flags.mod_realm = 1; const low = MOD_veinExp();
  global.flags.mod_realm = 9; const high = MOD_veinExp();
  return { gained: after > before, spent: second.some(t => /spent for today/.test(t)),
           offeredAgain: second.some(t => /Sit in the spirit vein/.test(t)), low, high };
});
check(vein.gained, 'sitting in it trains Qi Circulation');
check(vein.spent && !vein.offeredAgain, 'and it is spent for the rest of the day');
check(vein.high > vein.low * 10, `it scales with the realm (${vein.low} at realm 1, ${vein.high.toLocaleString()} at 9)`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the catacombs are reachable and the Pill Tower exists.');
