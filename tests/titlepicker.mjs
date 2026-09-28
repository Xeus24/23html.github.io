import { launch } from './lib/browser.mjs';

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
const b = await launch();
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
// One per levelled skill, plus any ladder that has filled up on the way —
// levelling five skills to 90 hands out enough titles to earn the "titles
// collected" ones, and those group too. Derived rather than a fixed count, so
// the check does not have to be retuned every time the setup earns one more.
const skillGroups = await p.evaluate(() => {
  const held = {};
  for (const k in ttl) { if (!ttl[k].have) continue;
    const sk = MOD_TITLE_SKILL[k]; if (sk && skl[sk]) held[sk] = (held[sk] || 0) + 1; }
  return Object.keys(held).filter(k => held[k] > 1).length;
});
const ladderGroups = groups.filter(g => /\)$/.test(g.text) && !/ of /.test(g.text));
check(groups.length >= skillGroups,
  `a group for each of the ${skillGroups} skills holding more than one title (${groups.length} total)`);
check(groups.every(g => /\(\d+\)/.test(g.text)), 'each group shows how many it holds');

console.log('\n--- titles that belong to no skill still group, by their own ladder');
const fam = await p.evaluate(() => {
  const out = {};
  for (const k in ttl) { const t = ttl[k];
    if (!t || !t.name || t.name === 'null') continue;
    if (MOD_TITLE_SKILL[k] !== undefined) continue;
    const stem = MOD_titleStem(k); if (!stem) continue;
    (out[stem] = out[stem] || []).push(t.name); }
  const fams = Object.entries(out).filter(([, v]) => v.length > 1);
  return { fams: fams.length,
           titles: fams.reduce((a, [, v]) => a + v.length, 0),
           labels: fams.map(([st, v]) => MOD_titleFamilyLabel(st, v.map(n => ({ name: n })))),
           singles: Object.entries(out).filter(([, v]) => v.length === 1).length,
           // every ladder the mod names must still exist in ttl
           orphanLabels: Object.keys(MOD_TITLE_FAMILY).filter(st => !out[st]) };
});
console.log(`     ${fam.fams} ladders covering ${fam.titles} titles: ${fam.labels.join(', ')}`);
check(fam.fams >= 8, `${fam.fams} non-skill ladders are grouped`);
check(fam.titles >= 35, `${fam.titles} titles that used to be a flat list are now in them`);
check(fam.labels.every(l => l && !/^[a-z_]+$/.test(l)),
  'every ladder has a readable label, not a key stem');
check(fam.orphanLabels.length === 0,
  `no label names a ladder that does not exist${fam.orphanLabels.length ? ': ' + fam.orphanLabels.join(', ') : ''}`);
check(ladderGroups.length >= 1,
  `and one of them shows up in this picker (${ladderGroups.map(g => g.text).join(', ') || 'none'})`);
// the guard that keeps ttl.thr ("Thrasher", for smashing dojo equipment) out of
// skl.thr (Throwing): only the author's numbered tiers are read by stem
const stemGuard = await p.evaluate(() => ({
  thrasher: MOD_TITLE_SKILL.thr === undefined || MOD_TITLE_SKILL.thr !== 'thr',
  toughness: MOD_TITLE_SKILL.tghs1 === 'tghs',
  sword: MOD_TITLE_SKILL.srd3 === 'srdc',
  death: MOD_TITLE_SKILL.dth4 === 'dth'
}));
check(stemGuard.thrasher, '"Thrasher" is not filed under Throwing on a bare stem match');
check(stemGuard.toughness && stemGuard.sword && stemGuard.death,
  'but tghs1/srd3/dth4 are read as the numbered tiers they are');

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
check(others === groups.length - 1,
  `the other ${others} of ${groups.length} groups are still collapsed`);

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
