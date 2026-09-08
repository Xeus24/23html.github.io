import { chromium } from 'playwright';

// The three added areas must not exist until the base game's last normal area
// (golem arena IV, flag trne4e1) is cleared, and then must open in order on the
// same kill counts that govern their level caps.
//   PORT=8080 node tests/areagate.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  // render a location's choices and return their text
  const draw = (chsObj) => {
    try { chsObj.sl(); } catch (e) { return ['THREW: ' + e]; }
    return [...dom.ctr_2.querySelectorAll('.chs')].map(n => n.textContent.trim());
  };
  const has = (list, needle) => list.some(t => t.indexOf(needle) >= 0);

  const setProg = (h, s, v) => { global.flags.mod_prog = { hollow: h, spire: s, vigil: v }; };
  const out = {};

  // --- 1. before the golem arena is finished -------------------------------
  global.flags.trne4e1 = false; setProg(0, 0, 0);
  let gate = draw(chss.frstn1main);
  out.beforeArena = { trailheadShown: has(gate, 'old path deeper') };

  // --- 2. arena cleared: trailhead appears, only the Hollow is open --------
  global.flags.trne4e1 = true; setProg(0, 0, 0);
  gate = draw(chss.frstn1main);
  let hub = draw(chss.mod_gate);
  out.arenaCleared = {
    trailheadShown: has(gate, 'old path deeper'),
    hollow: has(hub, 'The Sunken Hollow'),
    spire:  has(hub, '=> The Ashen Spire'),
    vigil:  has(hub, '=> The Long Vigil'),
    hint:   has(hub, 'choked with fallen rock')
  };

  // --- 3. Hollow cleared: Spire opens, Vigil still shut -------------------
  setProg(MOD_REQ_HOLLOW, 0, 0);
  hub = draw(chss.mod_gate);
  out.hollowCleared = {
    spire: has(hub, '=> The Ashen Spire'),
    vigil: has(hub, '=> The Long Vigil'),
    hint:  has(hub, 'still shut to you')
  };

  // --- 4. Spire cleared: Vigil opens --------------------------------------
  setProg(MOD_REQ_HOLLOW, MOD_REQ_SPIRE, 0);
  hub = draw(chss.mod_gate);
  out.spireCleared = { vigil: has(hub, '=> The Long Vigil') };

  // --- 5. the caps agree with the doors ------------------------------------
  const capAt = (h, s, v) => { setProg(h, s, v); MOD_CAP.current = -1; return MOD_levelCap(); };
  out.caps = {
    noneCleared:   capAt(0, 0, 0),
    hollowCleared: capAt(MOD_REQ_HOLLOW, 0, 0),
    spireCleared:  capAt(MOD_REQ_HOLLOW, MOD_REQ_SPIRE, 0),
    vigilCleared:  capAt(MOD_REQ_HOLLOW, MOD_REQ_SPIRE, MOD_REQ_VIGIL)
  };
  out.reqs = { hollow: MOD_REQ_HOLLOW, spire: MOD_REQ_SPIRE, vigil: MOD_REQ_VIGIL };
  return out;
});

console.log(JSON.stringify(R, null, 1));

const fail = [];
if (R.beforeArena.trailheadShown) fail.push('trailhead is visible before golem arena IV is cleared');
if (!R.arenaCleared.trailheadShown) fail.push('trailhead does not appear after clearing golem arena IV');
if (!R.arenaCleared.hollow) fail.push('the Sunken Hollow is not offered once the trailhead is open');
if (R.arenaCleared.spire) fail.push('the Ashen Spire is reachable before the Hollow is cleared');
if (R.arenaCleared.vigil) fail.push('the Long Vigil is reachable before the Hollow is cleared');
if (!R.arenaCleared.hint) fail.push('no progress hint shown for the locked Spire');
if (!R.hollowCleared.spire) fail.push('the Ashen Spire does not open after clearing the Hollow');
if (R.hollowCleared.vigil) fail.push('the Long Vigil is reachable before the Spire is cleared');
if (!R.spireCleared.vigil) fail.push('the Long Vigil does not open after clearing the Spire');
if (R.caps.noneCleared >= 75) fail.push(`cap ${R.caps.noneCleared} granted with nothing cleared`);
if (R.caps.hollowCleared !== 75) fail.push(`cap after Hollow is ${R.caps.hollowCleared}, expected 75`);
if (R.caps.spireCleared !== 90) fail.push(`cap after Spire is ${R.caps.spireCleared}, expected 90`);
if (R.caps.vigilCleared !== 110) fail.push(`cap after Vigil is ${R.caps.vigilCleared}, expected 110`);
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));

await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — added areas stay hidden until the base game is finished, then open in order.');
