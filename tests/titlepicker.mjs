import { chromium } from 'playwright';

// The title picker, grouped by skill.
//
// Section 24 took the pool from 120 titles to 585, which turned the game's flat
// picker into a scroll of hundreds of rows, most superseded by the one below
// them. Titles from one skill now collapse to a single row showing the best you
// hold, with a caret to open the rest.
//
// The hook is a SECOND listener on dom.d3 rather than a replacement, because
// cloning that node would drop dom.d3.update and the tooltip the game attached
// to it. So the game builds its list and this rebuilds the contents.
//
//   PORT=8080 node tests/titlepicker.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

const open = () => p.evaluate(() => {
  if (global.flags.ttlscrnopn) MOD_closeTitlePicker();
  dom.d3.click();
  return [...dom.ttlbd.children].map(r => ({
    text: r.textContent.replace(/\s+/g, ' ').trim(),
    caret: !!(r.firstChild && /[▸▾]/.test(r.firstChild.textContent || '')),
    indented: /^ /.test(r.textContent)
  }));
});
const close = () => p.evaluate(() => MOD_closeTitlePicker());

console.log('--- with nothing but the starting titles, it stays a plain list');
let rows = await open();
check(rows.every(r => !r.caret), `no groups yet (${rows.length} plain rows)`);
await close();

console.log('\n--- level some skills, so several titles come from each');
const setup = await p.evaluate(() => {
  ['fgt', 'unc', 'srdc', 'walk', 'coldr'].forEach(k => {
    const s = skl[k]; s.lvl = 90;
    s.mlstn.forEach(m => { if (m.lv <= 90 && !m.g) { try { m.f(); m.g = true; } catch (e) {} } });
  });
  giveTitle(ttl.thr); giveTitle(ttl.wsl);
  MOD_updateRenown();
  return { held: global.titles.length };
});
rows = await open();
const groups = rows.filter(r => r.caret);
console.log(`     ${setup.held} titles held, ${rows.length} rows, ${groups.length} of them groups`);
groups.forEach(g => console.log(`       ${g.text}`));
check(rows.length < setup.held, `${setup.held} titles collapse to ${rows.length} rows`);
check(groups.length === 5, `one group per levelled skill (${groups.length})`);
check(groups.every(g => /\(\d+\)/.test(g.text)), 'each group shows how many it holds');

console.log('\n--- the group header is the best title held, not the first earned');
const best = await p.evaluate(() => {
  const held = global.titles.filter(t => MOD_TITLE_SKILL[MOD_titleKeyOf(t)] === 'fgt');
  const top = held.slice().sort((a, b) => (b.rar || 0) - (a.rar || 0))[0];
  const header = [...dom.ttlbd.children].find(r => /Fighting/.test(r.textContent));
  return { top: top.name, topRank: top.rar, header: header.textContent.replace(/\s+/g, ' ').trim(),
           heldNames: held.map(t => `${t.name}(r${t.rar})`) };
});
console.log(`     holds: ${best.heldNames.join(', ')}`);
check(best.header.includes(best.top), `header shows "${best.top}" (rank ${best.topRank})`);

console.log('\n--- base-game titles group with the generated ones');
check(best.heldNames.some(n => /^Rookie|^Fighter|^Civilian/.test(n)) &&
      best.heldNames.some(n => /of Fighting/.test(n)),
  'Fighting holds both the base game\'s titles and the generated ones');

console.log('\n--- the caret opens the group without selecting anything');
const expanded = await p.evaluate(() => {
  const before = you.title.name;
  const head = [...dom.ttlbd.children].find(r => /Fighting/.test(r.textContent));
  head.firstChild.click();
  return { before, after: you.title.name, stillOpen: global.flags.ttlscrnopn,
           rows: [...dom.ttlbd.children].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
           indented: [...dom.ttlbd.children].filter(r => /^ /.test(r.textContent)).length };
});
check(expanded.after === expanded.before, `the worn title is unchanged ("${expanded.before}")`);
check(expanded.stillOpen, 'the picker stays open');
check(expanded.indented > 0, `${expanded.indented} titles revealed, indented under the header`);
check(expanded.rows.length > rows.length, `${rows.length} rows -> ${expanded.rows.length}`);

console.log('\n--- other groups stay shut');
const others = await p.evaluate(() =>
  [...dom.ttlbd.children].filter(r => /[▸]/.test(r.firstChild?.textContent || '')).length);
check(others === 4, `the other ${others} groups are still collapsed`);

console.log('\n--- and the caret closes it again');
const recollapsed = await p.evaluate(() => {
  const head = [...dom.ttlbd.children].find(r => /Fighting/.test(r.textContent));
  head.firstChild.click();
  return [...dom.ttlbd.children].filter(r => /^ /.test(r.textContent)).length;
});
check(recollapsed === 0, 'nothing indented once collapsed');

console.log('\n--- selecting a title from inside a group works and closes the picker');
const picked = await p.evaluate(() => {
  const head = [...dom.ttlbd.children].find(r => /Fighting/.test(r.textContent));
  head.firstChild.click();                                  // expand
  const inner = [...dom.ttlbd.children].filter(r => /^ /.test(r.textContent));
  const want = inner[0].textContent.replace(/\s+/g, ' ').trim().replace(/"/g, '');
  inner[0].click();
  return { want, worn: you.title.name, open: global.flags.ttlscrnopn,
           gone: !document.getElementById('youttlc') };
});
check(picked.worn === picked.want, `wearing "${picked.worn}"`);
check(!picked.open && picked.gone, 'the picker closed');

console.log('\n--- story titles have no skill and stay as plain rows');
const loose = await p.evaluate(() => {
  MOD_closeTitlePicker(); dom.d3.click();
  const plain = [...dom.ttlbd.children]
    .filter(r => !/[▸▾]/.test(r.firstChild?.textContent || '') && !/^ /.test(r.textContent))
    .map(r => r.textContent.replace(/["\s]+/g, ' ').trim());
  MOD_closeTitlePicker();
  return plain;
});
check(loose.some(n => /Thrasher/.test(n)) && loose.some(n => /Wolf Slayer/.test(n)),
  `story titles listed loose (${loose.join(', ')})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — one row per skill showing the best title, opening to the rest on the caret.');
