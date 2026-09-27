import { chromium } from 'playwright';

// The v4.3 batch of small fixes, each held to what it claims.
//
//   * the skill panel no longer rebuilds itself every second forever
//   * the three dead allbuff wrappers are gone, and the live chain is intact
//   * the Damp cellar can spawn, can be reached, and its exit goes somewhere real
//   * the four finishable titles are named and granted at their thresholds; the
//     fifth, with no evidence of intent, is left exactly as the author left it
//   * the realm is on the rank line without making the panel taller, and it is
//     the breakthrough button at a bottleneck
//   * rarity reads as text, sorts, and filters
//   * the wiki's What next page reads the save and never says a locked door is open
//
//   PORT=8080 node tests/polish.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the live allbuff chain');
const chain = await p.evaluate(() => {
  const g = giveSkExp; giveSkExp = function () {};
  let n = 0; const orig = MOD_allbuff_original;
  MOD_allbuff_original = function () { n++; return orig.apply(this, arguments); };
  let uses = 0; const qu = skl.qic.use; skl.qic.lvl = 10;
  skl.qic.use = function () { uses++; return qu.apply(this, arguments); };
  allbuff(you);
  MOD_allbuff_original = orig; skl.qic.use = qu; giveSkExp = g;
  return { gameCalls: n, qicUses: uses };
});
check(chain.gameCalls === 1, `the game's own allbuff runs once per call (${chain.gameCalls})`);
check(chain.qicUses === 1, `and a mod skill's use() once, not once per dead wrapper (${chain.qicUses})`);

console.log('\n--- the skill panel stops rebuilding itself');
const panel = await p.evaluate(async () => {
  let k = 0; for (const x in skl) { const s = skl[x]; if (k++ > 40) break;
    if (s && s.name && !s._modConverged && you.skls.indexOf(s) < 0) { s.lvl = 3; you.skls.push(s); } }
  global.flags.sklu = true; dom.ct_bt2.click();
  await new Promise(r => setTimeout(r, 1500));
  let renders = 0; const orig = renderSkl; renderSkl = function () { renders++; return orig.apply(this, arguments); };
  let added; for (const x in skl) { const s = skl[x];
    if (s && s.name && !s._modConverged && you.skls.indexOf(s) < 0) { s.lvl = 1; you.skls.push(s); added = s; break; } }
  await new Promise(r => setTimeout(r, 1300));
  const onGrow = renders;
  await new Promise(r => setTimeout(r, 4200));
  const steady = renders - onGrow;
  added.lvl = 7; await new Promise(r => setTimeout(r, 1200));
  const live = [].slice.call(dom.skcon.children).some(c => c.children[0].textContent === added.name + ' lvl: 7');
  you.skls.splice(you.skls.indexOf(added), 1); await new Promise(r => setTimeout(r, 1300));
  const shrink = dom.skcon.children.length === you.skls.length;
  renderSkl = orig; dom.ct_bt2.click();
  return { onGrow, steady, live, shrink, rows: you.skls.length + 1 };
});
check(panel.onGrow === panel.rows, `one redraw when the list grows (${panel.onGrow} rows drawn)`);
check(panel.steady === 0, `and none afterwards — was every row every second (${panel.steady} in 4s)`);
check(panel.live, 'rows still update live');
check(panel.shrink, 'and a shrink is noticed, which the game never did');

console.log('\n--- the Damp cellar');
const cellar = await p.evaluate(() => {
  const bands = area.clg.popc.map(b => b[1] - b[0]);
  global.flags.tr3_win = false; chss.mbrd.sl();
  const hidden = ![].slice.call(dom.ctr_2.children).some(c => /Notice #1/.test(c.textContent));
  global.flags.tr3_win = true; chss.mbrd.sl();
  const notice = [].slice.call(dom.ctr_2.children).find(c => /Notice #1/.test(c.textContent));
  const beforeBack = notice && notice.nextElementSibling && /^"<=/.test(notice.nextElementSibling.textContent.trim());
  global.flags.q1lwn = false; const w0 = you.wealth;
  area.clg.onEnd(); const w1 = you.wealth; area.clg.onEnd(); const w2 = you.wealth;
  return { bands, hidden, notice: !!notice, beforeBack, reached: chss.mod_cellar && chss.mod_cellar.id === 973,
           pays: [w1 - w0, w2 - w1], flag: global.flags.q1lwn, ids: Object.keys(chss).filter(k => chss[k] && chss[k].id === 973).length };
});
check(cellar.bands.every(w => isFinite(w) && w > 0), `it has real spawn bands (${cellar.bands.map(w => w.toFixed(2))})`);
check(cellar.hidden, 'the job is not posted before the dojo has taught you to fight');
check(cellar.notice && cellar.beforeBack, 'and afterwards it is Notice #1, above the way back');
check(cellar.reached && cellar.ids === 1, 'it leads to a real location, with an id nothing else uses');
check(cellar.pays[0] > 0 && cellar.pays[1] === 0, `the first clear pays once (${cellar.pays})`);
check(cellar.flag === true, "and sets the author's own q1lwn flag");

console.log('\n--- the unfinished titles');
const titles = await p.evaluate(() => {
  const named = ['shpt2', 'shpt3', 'mone2', 'mone3'].map(k => ({ k, name: ttl[k].name, desc: ttl[k].desc }));
  ['shpt2', 'shpt3', 'mone2', 'mone3'].forEach(k => { ttl[k].have = false; });
  const grant = (stat, v) => { global.stat[stat] = v; for (const f of global.shptchk) f(); for (const f of global.monchk) f(); };
  grant('buyt', 4999); const s0 = ttl.shpt2.have;
  grant('buyt', 5000); const s1 = ttl.shpt2.have, s1b = ttl.shpt3.have;
  grant('buyt', 10000); const s2 = ttl.shpt3.have;
  global.stat.moneyg = GOLD * 10 - 1; for (const f of global.monchk) f(); const m0 = ttl.mone2.have;
  global.stat.moneyg = GOLD * 10; for (const f of global.monchk) f(); const m1 = ttl.mone2.have, m1b = ttl.mone3.have;
  global.stat.moneyg = GOLD * 100; for (const f of global.monchk) f(); const m2 = ttl.mone3.have;
  return { named, shop: [s0, s1, s1b, s2], money: [m0, m1, m1b, m2], ddcd: ttl.ddcd.name };
});
check(titles.named.every(t => t.name && t.name.trim() && t.desc && t.desc.trim()),
  `all four have a name and a description (${titles.named.map(t => t.name).join(', ')})`);
check(JSON.stringify(titles.shop) === '[false,true,false,true]', 'the shopper titles land at exactly 5,000 and 10,000');
check(JSON.stringify(titles.money) === '[false,true,false,true]', 'the money titles at exactly 10 and 100 gold');
check(titles.ddcd === 'null', 'ttl.ddcd is left as the author left it — nothing says what it was for');

console.log('\n--- the realm on the rank line');
const hud = await p.evaluate(() => {
  global.flags.aw_u = true; dom.d0.style.display = '';
  const h = () => Math.round(dom.d6.getBoundingClientRect().height);
  const panelH = () => dom.d1.scrollHeight;
  act.mod_qi.have = false; MOD_hudRefresh(true);
  const fresh = dom.d6.textContent, h0 = h(), p0 = panelH();
  giveAction(act.mod_qi);
  global.flags.mod_realm = 3; skl.qic.lvl = 24; dom.d6.update(); const layered = dom.d6.textContent;
  global.flags.mod_realm = 9; skl.qic.lvl = 110; global.flags.mod_qidev = time.minute + 500; dom.d6.update();
  const longest = { h: h(), p: panelH() };
  global.flags.mod_qidev = 0; global.flags.mod_realm = 3; skl.qic.lvl = 30; dom.d6.update();
  const wall = dom.d6.textContent;
  global.flags.mod_insight = 99; global.flags.btl = false; const before = MOD_realm().n; let tries = 0;
  while (MOD_realm().n === before && tries < 15) { giveItem(item.mod_bp4, 1); global.flags.mod_qidev = 0;
    global.flags.mod_insight = 99; MOD_HUD.span.click(); tries++; }
  const after = MOD_realm().n;
  // with no pill, the click refuses and costs nothing
  global.flags.mod_realm = 4; skl.qic.lvl = 45; item.mod_bp5.amount = 0; item.mod_bp5.have = false;
  const ins = MOD_insight(); MOD_HUD.span.click();
  return { fresh, h0, p0, layered, longest, wall, before, after, noPill: MOD_realm().n === 4 && MOD_insight() === ins };
});
check(!/·/.test(hud.fresh), 'nothing is shown before cultivation begins');
check(/Core Formation 5\/9/.test(hud.layered), `it shows the realm and layer (${hud.layered})`);
check(hud.longest.h === hud.h0 && hud.longest.p === hud.p0,
  `the longest possible line keeps the rank line and the panel the same height (${hud.longest.h}px, ${hud.longest.p}px)`);
check(/½ step to Nascent Soul/.test(hud.wall), 'at a bottleneck it says so');
check(hud.after === hud.before + 1, `and clicking it breaks through (realm ${hud.before} -> ${hud.after})`);
check(hud.noPill, 'without the pill the click refuses and spends nothing');

console.log('\n--- rarity you can read');
const rar = await p.evaluate(async () => {
  skl.fgt.lvl = 60; dscr({ clientX: 100, clientY: 100 }, skl.fgt, 6);
  const tip = global.dscr.textContent; global.dscr.style.display = 'none';
  global.flags.sklu = true; dom.ct_bt2.click(); await new Promise(r => setTimeout(r, 600));
  const hasRow = /Sort by rarity/.test(document.getElementById('mod_skill_controls').textContent);
  MOD_UI.group = false; MOD_UI.sort = 'rarity'; MOD_UI.sortDesc = false; MOD_redrawSkills();
  const ranks = you.skls.map(MOD_skillRank);
  const sorted = ranks.every((r, i) => i === 0 || r <= ranks[i - 1]);
  MOD_UI.minRar = 6; MOD_redrawSkills();
  const rows = [].slice.call(dom.skcon.children);
  const vis = you.skls.filter((s, i) => rows[i] && rows[i].style.display !== 'none');
  const filtered = vis.length > 0 && vis.every(s => MOD_skillRank(s) >= 6) &&
                   you.skls.filter(s => MOD_skillRank(s) >= 6).length === vis.length;
  MOD_UI.minRar = 1; MOD_UI.group = true; MOD_UI.sort = 'lvl'; MOD_redrawSkills(); dom.ct_bt2.click();
  return { tip: /Expert — rarity 6 of 10/.test(tip), hasRow, sorted, filtered, visible: vis.length };
});
check(rar.tip, 'the skill tooltip names the rarity, not just colours it');
check(rar.hasRow, 'the skill panel has the rarity row');
check(rar.sorted, 'sort by rarity puts the rarest first');
check(rar.filtered, `"Masterful and up" shows exactly those (${rar.visible})`);

console.log('\n--- What next');
const next = await p.evaluate(() => {
  const nav = MOD_WIKI_PAGES.map(x => x.id);
  // A LOCKED line must never claim a door is open: compare against the game's own gates.
  global.flags.trne4e1 = false;
  const rows = MOD_whatNext();
  const late = rows.find(r => r.track === 'Late areas');
  global.flags.dj1rw6 = false;
  const conv = MOD_whatNext().find(r => r.track === 'Convergence');
  const html = MOD_wikiBuild();
  return { afterStart: nav.indexOf('next') === nav.indexOf('start') + 1,
           lateLocked: late && late.state === 'locked', convLocked: conv && conv.state === 'locked',
           order: rows.map(r => r.state).join(','), rendered: /id="pg-next"/.test(html) };
});
check(next.afterStart, 'it sits straight after Start here');
check(next.rendered, 'and renders in the wiki');
check(next.lateLocked, 'late areas read locked when the game has them locked');
check(next.convLocked, 'convergence reads locked while the Slip Archive is');
check(/^(ready,)*(working,)*(locked,?)*$/.test(next.order + ','), `ready lines first (${next.order})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the v4.3 fixes each do what they say.');
