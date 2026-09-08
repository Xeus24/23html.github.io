import { chromium } from 'playwright';
import { readFileSync } from 'fs';

// Loads a real save captured from the PRE-consolidation build (100 discovered
// skills) into the CURRENT build and checks it comes back clean: no throw, no
// "SOMETHING BROKE" screen, base-game progress intact, every surviving
// discovered skill's level and milestone flags intact, merged-away skills
// simply absent. Fixture: tests/fixtures/v1-save.txt (+ .meta.json snapshot).

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const save = readFileSync(new URL('./fixtures/v1-save.txt', import.meta.url), 'utf8').trim();
const want = JSON.parse(readFileSync(new URL('./fixtures/v1-save.meta.json', import.meta.url), 'utf8'));

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate((saveStr) => {
  const out = { threw: null };
  try { load(saveStr); }
  catch (e) { out.threw = String(e).slice(0, 300); }

  // the game shows dom.error and fades it in when load() blows up
  const brokeScreen = !!(dom.error && dom.error.isConnected &&
                         Number(getComputedStyle(dom.error).opacity) > 0);

  // run the tick a few times — a mangled skl/you.skls throws here once a second
  let tickThrew = null;
  try { for (let i = 0; i < 5; i++) ontick(); }
  catch (e) { tickThrew = String(e).slice(0, 200); }

  const g = k => (skl[k] ? { lvl: skl[k].lvl, p: skl[k].p,
                             mst: skl[k].mlstn ? skl[k].mlstn.map(m => m.g) : null } : null);
  return {
    threw: out.threw, brokeScreen, tickThrew,
    skillsInObj: Object.keys(skl).length,
    discovered: you.skls.length,
    capNow: (typeof MOD_CAP !== 'undefined') ? MOD_CAP.current : null,
    fgt: g('fgt'), srdc: g('srdc'),
    kllr: g('kllr'), mrtl: g('mrtl'), stmw: g('stmw'), mkng: g('mkng'), rnge: g('rnge'),
    mergedAway: { exct: !!skl.exct, wxmn: !!skl.wxmn, bstl: !!skl.bstl, poys: !!skl.poys,
                  endr: !!skl.endr, vitl: !!skl.vitl, atrt: !!skl.atrt, hggl: !!skl.hggl }
  };
}, save);

const fail = [];
if (R.threw)            fail.push(`load() threw: ${R.threw}`);
if (R.brokeScreen)      fail.push('the game showed its "SOMETHING BROKE" error screen');
if (R.tickThrew)        fail.push(`ontick() threw after load: ${R.tickThrew}`);
if (!R.fgt || R.fgt.lvl !== want.fgtLvl) fail.push(`fgt level ${R.fgt && R.fgt.lvl} != ${want.fgtLvl} (base-game skill, must survive)`);
if (!R.fgt || Math.abs(R.fgt.p - want.fgtP) > 1e-6) fail.push(`fgt.p ${R.fgt && R.fgt.p} != ${want.fgtP} (positional a7 must still align for base skills)`);
if (!R.mrtl || R.mrtl.lvl !== want.mrtlLvl) fail.push(`mrtl level ${R.mrtl && R.mrtl.lvl} != ${want.mrtlLvl} (flagship survivor)`);
if (!R.mrtl || JSON.stringify(R.mrtl.mst) !== JSON.stringify(want.mrtlMst))
  fail.push(`mrtl milestone flags ${JSON.stringify(R.mrtl && R.mrtl.mst)} != ${JSON.stringify(want.mrtlMst)} (7-slot mst restore must not overflow or misalign)`);
if (!R.kllr || R.kllr.lvl !== want.kllrLvl) fail.push(`kllr level ${R.kllr && R.kllr.lvl} != ${want.kllrLvl}`);
if (!R.stmw || R.stmw.lvl !== want.stmwLvl) fail.push(`stmw level ${R.stmw && R.stmw.lvl} != ${want.stmwLvl} (survivor)`);
if (Object.values(R.mergedAway).some(Boolean)) fail.push(`merged-away keys still present: ${JSON.stringify(R.mergedAway)}`);
if (errs.length) fail.push(`page errors: ${JSON.stringify(errs)}`);

console.log('v1 save -> v2 build:');
console.log('  ', JSON.stringify({
  loadThrew: R.threw || false, brokeScreen: R.brokeScreen, tickThrew: R.tickThrew || false,
  skillsInObj: R.skillsInObj, discovered: R.discovered, cap: R.capNow,
  fgt: R.fgt, mrtl_lvl: R.mrtl && R.mrtl.lvl, kllr_lvl: R.kllr && R.kllr.lvl,
  mkng_lvl: R.mkng && R.mkng.lvl, stmw_lvl: R.stmw && R.stmw.lvl,
  mergedAwayGone: !Object.values(R.mergedAway).some(Boolean)
}, null, 0));

await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — v1 saves load clean under v2.');
