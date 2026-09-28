import { launch, settle } from './lib/browser.mjs';

// Section 48 and the small v4.7 changes around it, each held to its claim:
//
//   * the Qi Settling Pill costs the breakthrough pill of the realm you are at
//     the wall of (never under 5,200), in the listing and in rows already stocked
//   * the rank line shows the wall's insight, have/need
//   * an update says so in the log once; a first install says where things are
//   * Safari, and only Safari, is reminded to download a backup, once a day at
//     most, and not after a recent download
//   * the mod's settings travel inside the save to a browser that has none, and
//     never overwrite one the browser already has
//   * under the userscript, an untested game version is said in the game
//   * the mod's number boxes carry no spinner, the wiki names a real monospace,
//     and the old pacing preset is labelled legacy
//
//   PORT=8080 node tests/small.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const errs = [];
const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function open(opts) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts || {}));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await settle(p);
  return { ctx, p };
}
const log = p => p.evaluate(() => dom.mscont ? dom.mscont.textContent : '');

console.log('--- the Qi Settling Pill follows the realm');
const { ctx: c1, p } = await open();
const settleR = await p.evaluate(() => {
  const at = (realm) => { global.flags.mod_realm = realm; return MOD_settlePrice(); };
  const prices = { r0: at(0), r3: at(3), r7: at(7), r9: at(9) };
  const want = { r3: MOD_shopPrice(item.mod_bp4), r7: MOD_shopPrice(item.mod_bp8), r9: MOD_shopPrice(item.mod_bp10) };
  const listing = vendor.pha1.items.find(e => e.item === item.mod_settlepill);
  global.flags.mod_realm = 7; const listed = listing.p;
  vendor.pha1.stock.push([item.mod_settlepill, 1, 5200]); ontick();
  const row = vendor.pha1.stock.find(r => r[0] === item.mod_settlepill)[2];
  global.flags.mod_realm = 0;
  return { prices, want, listed, row };
});
check(settleR.prices.r0 === 5200, `before any realm it is the old 5,200 (${settleR.prices.r0})`);
check(settleR.prices.r3 === Math.max(5200, settleR.want.r3) && settleR.prices.r7 === settleR.want.r7 &&
      settleR.prices.r9 === settleR.want.r9,
  `at a wall it costs that realm's breakthrough pill (${settleR.prices.r3}, ${settleR.prices.r7}, ${settleR.prices.r9})`);
check(settleR.listed === settleR.want.r7 && settleR.row === settleR.want.r7,
  'the listing restocks at that price, and a row already on the shelf is repriced on the tick');

console.log('\n--- the rank line shows the wall');
const hud = await p.evaluate(() => {
  giveAction(act.mod_qi); global.flags.mod_realm = 3; skl.qic.lvl = 30; global.flags.mod_insight = 40;
  const t = MOD_hudRealmText(), need = MOD_insightNeed(4);
  global.flags.mod_insight = 999999; const capped = MOD_hudRealmText();
  global.flags.mod_realm = 0; skl.qic.lvl = 0; global.flags.mod_insight = 0;
  return { t, need, capped, ascii: /^[\x20-\x7e½]*$/.test(t) };
});
check(hud.t.indexOf('40/' + hud.need) >= 0, `at a wall it reads "${hud.t}"`);
check(hud.capped.indexOf(hud.need + '/' + hud.need) >= 0, 'and never shows more than the wall asks for');
check(hud.ascii, 'in ASCII (plus ½), which is what keeps the line inside the panel');

console.log('\n--- an update is said once, in the log');
await p.evaluate(() => { localStorage.setItem('p23_mod_lastver', '4.6'); save(); });
await p.reload({ waitUntil: 'load' }); await settle(p, 3);
const upd = await log(p);
await p.reload({ waitUntil: 'load' }); await settle(p, 3);
const again = await log(p);
const ver = await p.evaluate(() => MOD.version);
check(new RegExp('updated, v4\\.6 to v' + ver.replace('.', '\\.')).test(upd), 'after an update the log says from what, to what');
check(!/updated, v/.test(again), 'and the next load does not say it again');
const fresh = await open();
check(/proto23 mod v/.test(await log(fresh.p)), 'a first install says where the wiki and the commands are');
await fresh.ctx.close();

console.log('\n--- Safari, and only Safari, is reminded to download a backup');
const saf = await open({ userAgent: SAFARI });
const s1 = await saf.p.evaluate(() => {
  save(); localStorage.removeItem('p23_mod_safari_nag'); localStorage.removeItem('p23_mod_lastdownload');
  const isSafari = MOD_isSafari(), due = MOD_safariBackupDue();
  MOD_smallNotes(); const said = /Safari can clear/.test(dom.mscont.textContent);
  const dueAgain = MOD_safariBackupDue();
  localStorage.removeItem('p23_mod_safari_nag'); localStorage.setItem('p23_mod_lastdownload', String(Date.now()));
  const afterDownload = MOD_safariBackupDue();
  return { isSafari, due, said, dueAgain, afterDownload };
});
check(s1.isSafari && s1.due && s1.said, 'Safari with a save and no recent download is told, with the saves panel a click away');
check(!s1.dueAgain, 'not twice in a day');
check(!s1.afterDownload, 'and not after a recent download');
await saf.ctx.close();
const chr = await open({ userAgent: CHROME });
check(!(await chr.p.evaluate(() => { save(); return MOD_isSafari() || MOD_safariBackupDue(); })),
  'Chrome is not Safari, though its user agent says "Safari" too');
await chr.ctx.close();

console.log('\n--- the mod\'s settings travel inside the save');
const src = await open();
const blob = await src.p.evaluate(() => { setNumberFormat('sci'); setFights('scaled'); setSkillXp(3); return save(); });
await src.ctx.close();
const dst = await open();
const took = await dst.p.evaluate((blob) => { load(blob); return { fmt: MOD_NUM.mode, fights: getFights(), xp: MOD.skill_xp_mult }; }, blob);
check(took.fmt === 'sci' && took.fights === 'scaled' && took.xp === 3,
  `a browser with no settings takes them from the save (${took.fmt}, ${took.fights}, ${took.xp}x)`);
await dst.ctx.close();
const own = await open();
const kept = await own.p.evaluate((blob) => { setNumberFormat('myriad'); load(blob); return MOD_NUM.mode; }, blob);
check(kept === 'myriad', `and one that has its own keeps it (${kept})`);
await own.ctx.close();

console.log('\n--- the userscript says so when the game is newer');
const us = await p.evaluate(() => {
  window.MOD_USERSCRIPT = { builtFor: global.ver - 1, version: MOD.version };
  MOD_smallNotes(); const said = dom.mscont.textContent;
  delete window.MOD_USERSCRIPT;
  return { said: /the mod was tested on v/.test(said) };
});
check(us.said, 'an untested game version is said in the game, not only in the console');

console.log('\n--- small visuals, and the legacy preset');
const vis = await p.evaluate(() => {
  const css = document.getElementById('p23-mod-css');
  let html = ''; const keep = window.open;
  window.open = () => ({ document: { open() {}, write(s) { html += s; }, close() {} }, focus() {} });
  try { modWiki(); } catch (e) {} finally { window.open = keep; }
  return { css: !!css && /spin-button/.test(css.textContent), menlo: /Menlo/.test(html),
           legacy: /\(legacy\)/.test(modPacing()) };
});
check(vis.css, "the mod's number boxes carry no spinner");
check(vis.menlo, 'the wiki names a real monospace before the generic one');
check(vis.legacy, 'the Mod before 4.2 preset is labelled legacy');
await c1.close();

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the small things each do what they say.');
