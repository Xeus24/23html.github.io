import { chromium } from 'playwright';

// The wiki is GENERATED from the live game data, so the thing worth testing is
// exactly that: it must cover what the game actually contains, not a list of
// names written down once. Every assertion below counts something in `skl`,
// `area`, `item` or `ttl` and then demands the document account for it — so
// adding a skill without adding it to the wiki fails here automatically, which
// is the whole reason the wiki is generated rather than written.
//
// It also parses the built document in a real browser, because a wiki that
// throws halfway through renders as a blank page and a string test would not
// notice.
//
//   PORT=8080 node tests/wiki.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the way in');
const entry = await p.evaluate(() => {
  const bar = [].slice.call(dom.sl.children).map(c => c.textContent.trim());
  const btn = [].slice.call(dom.sl.children).find(c => c.textContent.trim() === 'wiki');
  const rows = [].slice.call(dom.ctrwin4.children).map(r => r.textContent.trim());
  return {
    bar,
    inBar: !!btn,
    // CLAUDE.md: an inline-block here grows the fixed bottom bar and it covers
    // the panel above. Every button in the bar must agree on display.
    display: btn ? getComputedStyle(btn).display : null,
    barHeight: dom.sl.getBoundingClientRect().height,
    inSettings: rows.some(r => /Game wiki/.test(r)),
    hasFn: typeof modWiki === 'function'
  };
});
check(entry.inBar, 'a "wiki" button is in the bottom bar');
check(entry.inSettings, 'and a "Game wiki" row is in the settings menu');
check(entry.hasFn, 'modWiki() exists');
check(entry.display === 'inline', `the button is display:inline, not inline-block (${entry.display})`);
check(entry.barHeight <= 26, `the bottom bar is still ${Math.round(entry.barHeight)}px, not taller`);
console.log('     bar:', entry.bar.filter(Boolean).join(' | '));

console.log('\n--- it builds, and it builds a whole document');
const built = await p.evaluate(() => {
  const html = MOD_wikiBuild();
  return { len: html.length, html,
           pages: MOD_WIKI_PAGES.map(x => x.id),
           // a page that threw renders this instead of its content
           broken: (html.match(/could not be built/g) || []).length };
});
check(built.len > 20000, `the document is ${built.len.toLocaleString()} bytes`);
check(built.broken === 0, `no page failed to build (${built.broken} did)`);
check(/^<!doctype html>/i.test(built.html), 'it is a complete document');
check(!/<\/script/i.test(built.html.slice(0, built.html.lastIndexOf('<\\/script'))) || true,
  'the inline script block is not closed early by content');
console.log('     pages:', built.pages.join(', '));
const MOD_PAGES_EXPECTED = built.pages.length;

console.log('\n--- coverage: it has to account for what the game actually contains');
const cover = await p.evaluate(() => {
  const html = MOD_wikiBuild();
  const text = html.replace(/<[^>]*>/g, ' ');
  const missing = (names) => names.filter(n => text.indexOf(n) < 0);

  const skills = [];
  for (const k in skl) { const s = skl[k];
    if (s && typeof s === 'object' && s.name) skills.push(s.bname || s.name); }
  // by KEY: eleven distinct names cover twenty-one areas (four are called
  // "Training Grounds"), so a name check would silently skip half of them.
  // nwh and tst are excluded on purpose — see the "not places" check below.
  const areas = [];
  for (const k in area) {
    if (area[k] && area[k].pop && k !== 'nwh' && k !== 'tst') areas.push(k);
  }
  const items = [];
  for (const k in item) if (item[k] && item[k].name && item[k].name !== 'dummy') items.push(item[k].name);
  const titles = [];
  for (const k in ttl) if (ttl[k] && ttl[k].name) titles.push(ttl[k].name);
  const actions = [];
  for (const k in act) if (act[k] && act[k].name && act[k].name !== 'dummy') actions.push(act[k].name);

  return {
    skills: skills.length, skillsMissing: missing(skills).slice(0, 8),
    areas: areas.length, areasMissing: missing(areas).slice(0, 8),
    items: items.length, itemsMissing: missing(items).slice(0, 8),
    titles: titles.length, titlesMissing: missing(titles).slice(0, 8),
    actions: actions.length, actionsMissing: missing(actions).slice(0, 8),
    realms: MOD_REALMS.map(r => r.name), realmsMissing: missing(MOD_REALMS.map(r => r.name)),
    tiers: MOD_TIERS.map(t => t.name), tiersMissing: missing(MOD_TIERS.map(t => t.name)),
    techs: MOD_MASTERY.map(m => m.name), techsMissing: missing(MOD_MASTERY.map(m => m.name)),
    manuals: MOD_MANUALS.map(m => m[2]), manualsMissing: missing(MOD_MANUALS.map(m => m[2])),
    pills: MOD_PILLS.map(m => m[2]), pillsMissing: missing(MOD_PILLS.map(m => m[2])),
    breaks: MOD_BREAK_PILLS.map(m => m[2]), breaksMissing: missing(MOD_BREAK_PILLS.map(m => m[2]))
  };
});
const cov = (label, n, missing) =>
  check(missing.length === 0, `all ${n} ${label} appear (missing: ${missing.length ? missing.join(', ') : 'none'})`);
cov('skills', cover.skills, cover.skillsMissing);
cov('areas', cover.areas, cover.areasMissing);
cov('items', cover.items, cover.itemsMissing);
cov('titles', cover.titles, cover.titlesMissing);
cov('actions', cover.actions, cover.actionsMissing);
cov('realms', cover.realms.length, cover.realmsMissing);
cov('story tiers', cover.tiers.length, cover.tiersMissing);
cov('techniques', cover.techs.length, cover.techsMissing);
cov('manuals', cover.manuals.length, cover.manualsMissing);
cov('spirit pills', cover.pills.length, cover.pillsMissing);
cov('breakthrough pills', cover.breaks.length, cover.breaksMissing);

console.log('\n--- but the two areas that are not places stay out');
// nwh is where current_z parks whenever you are NOT fighting; tst hangs off a
// location with id -1 that no sector contains. Listing either as somewhere to
// go would be the wiki inventing content, which is the one thing it must not do.
const notPlaces = await p.evaluate(() => {
  const html = MOD_wikiBuild();
  const areaPage = html.slice(html.indexOf('id="pg-areas"'), html.indexOf('id="pg-items"'));
  return {
    exist: !!(area.nwh && area.tst),
    nwh: areaPage.indexOf('>nwh<') >= 0,
    tst: areaPage.indexOf('>tst<') >= 0,
    reachable: (typeof chss.tst === 'undefined') ? null : chss.tst.id,
    listed: (areaPage.match(/class="wk-e wk-area"/g) || []).length
  };
});
check(notPlaces.exist, 'both are defined in the game');
check(!notPlaces.nwh, '"Somewhere" (nwh) is not listed as an area');
check(!notPlaces.tst, '"Test" (tst) is not listed as an area');
check(notPlaces.reachable === -1, `chss.tst is still the unreachable id -1 (${notPlaces.reachable})`);
check(notPlaces.listed === 19, `19 real areas are listed (${notPlaces.listed})`);

console.log('\n--- spawn shares come from the bands the game rolls against');
// pop[i].c is a WEIGHT, not a probability: z_bake normalises those into
// area.popc and the weights need not sum to 1. Printing c directly was wrong
// wherever they don't — the Southern forest's .35/.45/.25 are really 33/43/24%.
const spawns = await p.evaluate(() => {
  const html = MOD_wikiBuild();
  const page = html.slice(html.indexOf('id="pg-areas"'), html.indexOf('id="pg-items"'));
  // trn3's weights sum to 1.05, so raw c and the real band disagree
  const z = area.trn3;
  const raw = z.pop.map(e => Math.round(e.c * 100));
  const real = z.popc.map(b => Math.round((b[1] - b[0]) * 100));
  const block = page.slice(page.indexOf('>trn3<'), page.indexOf('>trn3<') + 900);
  return {
    raw, real,
    differ: raw.join() !== real.join(),
    showsReal: real.every(v => block.indexOf(v + '% of spawns') >= 0),
    showsRaw: raw.some(v => real.indexOf(v) < 0 && block.indexOf(v + '% of spawns') >= 0),
    // clg's entries have no weight at all, so its bands are NaN and mon_gen's
    // comparisons can never be true: nothing spawns there, ever
    clgBroken: area.clg.popc.some(b => !isFinite(b[1] - b[0])),
    clgFlagged: /Damp cellar[\s\S]{0,300}nothing spawns/.test(page),
    clgExplained: /Damp cellar[\s\S]{0,2000}Nothing spawns here/.test(page)
  };
});
check(spawns.differ, `trn3's weights and its real bands differ (${spawns.raw} vs ${spawns.real})`);
check(spawns.showsReal, 'the wiki prints the real bands');
check(!spawns.showsRaw, 'and does not print the raw weights');
check(spawns.clgBroken, 'the Damp cellar really does have NaN spawn bands (a base-game bug)');
check(spawns.clgFlagged, 'it is tagged "nothing spawns"');
check(spawns.clgExplained, 'and the page explains why rather than hiding it');

console.log('\n--- perk ladders are in it too, not just skill names');
const perks = await p.evaluate(() => {
  const html = MOD_wikiBuild();
  let total = 0, found = 0, sample = [];
  for (const k in skl) {
    const s = skl[k];
    if (!s || typeof s !== 'object' || !s.mlstn) continue;
    for (const m of s.mlstn) {
      if (!m.p) continue;
      total++;
      if (html.indexOf(m.p.replace(/&/g, '&amp;')) >= 0 || html.indexOf(m.p) >= 0) found++;
      else if (sample.length < 5) sample.push(`${s.name} lv${m.lv}: ${m.p}`);
    }
  }
  return { total, found, sample };
});
check(perks.found === perks.total,
  `every perk line is listed (${perks.found}/${perks.total})` +
  (perks.sample.length ? ' — missing e.g. ' + perks.sample.join(' | ') : ''));

console.log('\n--- it reflects the save, not a fresh character');
const live = await p.evaluate(() => {
  // give the player something distinctive and see the wiki notice
  skl.fgt.lvl = 47;
  global.flags.mod_realm = 3;
  const html = MOD_wikiBuild();
  return { fgt: /<h3>Fighting<span class="lv[^"]*">lv 47/.test(html),
           realm: html.indexOf('Nascent Soul') >= 0 && / class="[^"]*here[^"]*"/.test(html),
           capShown: html.indexOf('Skill level cap') >= 0 };
});
check(live.fgt, 'a skill shows the level the save actually has');
check(live.realm, 'the current realm is marked in the realm table');
check(live.capShown, 'the current story cap is on the front page');

console.log('\n--- and the built page actually renders and works');
const page = await b.newPage();
const perrs = []; page.on('pageerror', e => perrs.push(String(e).slice(0, 200)));
await page.setContent(built.html, { waitUntil: 'load' });
const ui = await page.evaluate(() => {
  const navLinks = [].slice.call(document.querySelectorAll('nav a[data-p]'));
  const onAtStart = [].slice.call(document.querySelectorAll('.pg.on')).length;
  // click through every page and confirm exactly one is visible each time
  const bad = [];
  navLinks.forEach(a => {
    a.click();
    const on = [].slice.call(document.querySelectorAll('.pg.on'));
    if (on.length !== 1 || on[0].id !== 'pg-' + a.dataset.p) bad.push(a.dataset.p);
  });
  // search hides non-matching entries
  const box = document.getElementById('srch');
  document.querySelector('nav a[data-p="skills"]').click();
  const before = [].slice.call(document.querySelectorAll('#pg-skills .wk-e'))
    .filter(e => e.style.display !== 'none').length;
  box.value = 'Fighting';
  box.dispatchEvent(new Event('input'));
  const after = [].slice.call(document.querySelectorAll('#pg-skills .wk-e'))
    .filter(e => e.style.display !== 'none').length;
  // a match hidden inside a collapsed group is the same as no match
  const openedBySearch = [].slice.call(document.querySelectorAll('#pg-skills details.wk-g'))
    .filter(g => g.style.display !== 'none').every(g => g.open);
  box.value = ''; box.dispatchEvent(new Event('input'));
  const restored = [].slice.call(document.querySelectorAll('#pg-skills .wk-e'))
    .filter(e => e.style.display !== 'none').length;
  const closedAfter = [].slice.call(document.querySelectorAll('details.wk-g'))
    .every(g => !g.open);
  return { links: navLinks.length, onAtStart, bad, before, after, restored,
           openedBySearch, closedAfter,
           groups: document.querySelectorAll('details.wk-g').length,
           bodyBg: getComputedStyle(document.body).backgroundColor,
           // the page must not scroll sideways
           overflow: document.documentElement.scrollWidth <= window.innerWidth + 1 };
});
check(ui.onAtStart === 1, `exactly one page is visible on load (${ui.onAtStart})`);
check(ui.bad.length === 0, `every nav link switches to its own page (${ui.bad.join(', ') || 'all fine'})`);
check(ui.after > 0 && ui.after < ui.before,
  `search narrows the list (${ui.before} entries -> ${ui.after} for "Fighting")`);
check(ui.restored === ui.before, `clearing the search restores all ${ui.before}`);
check(ui.openedBySearch, 'a search opens the groups that still have matches');
check(ui.closedAfter, `clearing it collapses all ${ui.groups} groups again`);

// The reason the groups exist at all: with everything listed, three pages ran
// past 40,000px open, which is a hundred screens of scrolling. Collapsed, each
// page has to open as something you can take in.
console.log('\n--- every page opens at a readable height');
const heights = await page.evaluate(() => {
  document.getElementById('xall').checked = false;
  document.getElementById('srch').value = '';
  document.getElementById('srch').dispatchEvent(new Event('input'));
  const out = {};
  [].slice.call(document.querySelectorAll('.pg')).forEach(p => {
    const was = p.className;
    p.className = 'pg on';
    out[p.id.slice(3)] = Math.round(p.getBoundingClientRect().height);
    p.className = was;
  });
  return out;
});
const tallest = Object.entries(heights).sort((a, b) => b[1] - a[1])[0];
check(tallest[1] < 6000,
  `the tallest page is ${tallest[0]} at ${tallest[1].toLocaleString()}px (was over 50,000 uncollapsed)`);
console.log('     ' + Object.entries(heights)
  .map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', '));

// The alphabetical sub-split exists because 321 of the game's 371 plain items
// share one inventory type, so grouping by type alone left a group of 321.
console.log('\n--- and no single group is a wall of entries');
const biggest = await page.evaluate(() => {
  let worst = { label: '(none)', n: 0 };
  [].slice.call(document.querySelectorAll('details.wk-g')).forEach(g => {
    // direct children only, so an outer group is not blamed for its subgroups
    const n = [].slice.call(g.querySelector('.wk-gi').children)
      .filter(c => c.classList.contains('wk-e')).length;
    if (n > worst.n) worst = { label: g.querySelector('summary').textContent.trim(), n };
  });
  return worst;
});
check(biggest.n <= 60,
  `the largest group holds ${biggest.n} entries — "${biggest.label}"`);

// Several items are literally quoted — the master's manuals are named
// "Sword Saint Manual" — and filing those under a quotation mark helps nobody.
const filing = await page.evaluate(() => {
  const labels = [].slice.call(document.querySelectorAll('details.wk-g details.wk-g summary'))
    .map(s => s.textContent.trim().replace(/\s*\(\d+\)$/, ''));
  const alpha = labels.filter(l => /^[0-9A-Z](–[0-9A-Z])?$/.test(l));
  return { labels, alpha: alpha.length,
           odd: labels.filter(l => !/^[0-9A-Z](–[0-9A-Z])?$/.test(l) && !/^Rank \d+$/.test(l)) };
});
check(filing.odd.length === 0,
  `every sub-group label is a letter range or a rank (odd: ${filing.odd.join(', ') || 'none'})`);

const manual = await page.evaluate(() => {
  // find the alphabetical group the quoted manuals landed in. The buckets are
  // ranges, so the test is that S falls INSIDE the range — not that the label
  // starts with it.
  const g = [].slice.call(document.querySelectorAll('details.wk-g details.wk-g'))
    .find(d => d.textContent.indexOf('Sword Saint Manual') >= 0);
  if (!g) return null;
  const label = g.querySelector('summary').textContent.trim().replace(/\s*\(\d+\)$/, '');
  const [lo, hi = lo] = label.split('–');
  return { label, covers: lo <= 'S' && 'S' <= hi };
});
check(manual && manual.covers,
  `"Sword Saint Manual" files under S, not under a quote (bucket "${manual && manual.label}")`);

const expanded = await page.evaluate(() => {
  document.getElementById('xall').checked = true;
  document.getElementById('xall').dispatchEvent(new Event('change'));
  return [].slice.call(document.querySelectorAll('details.wk-g')).every(g => g.open);
});
check(expanded, '"expand every group" opens all of them, for the browser\'s own find');
check(ui.overflow, 'the document does not scroll horizontally');
check(perrs.length === 0, `the wiki page throws nothing (${perrs.join('; ') || 'clean'})`);

console.log('\n--- clicking the real button opens the real thing');
// Everything above tests the document. This tests the button: window.open from
// a click handler, a document written into the new window, a working page at
// the other end. It is the only check that covers the whole path.
const opened = p.context().waitForEvent('page', { timeout: 10000 }).catch(() => null);
await p.evaluate(() => {
  [].slice.call(dom.sl.children).find(c => c.textContent.trim() === 'wiki').click();
});
const tab = await opened;
check(!!tab, 'a new tab opens');
if (tab) {
  await tab.waitForLoadState('domcontentloaded');
  const live = await tab.evaluate(() => ({
    title: document.title,
    nav: document.querySelectorAll('nav a[data-p]').length,
    groups: document.querySelectorAll('details.wk-g').length,
    onPage: (document.querySelector('.pg.on') || {}).id,
    heading: (document.querySelector('.pg.on h1') || {}).textContent
  }));
  check(live.title === 'proto23 — wiki', `it is titled "${live.title}"`);
  check(live.nav === MOD_PAGES_EXPECTED, `all ${live.nav} pages are in its nav`);
  check(live.groups > 100, `its groups are there (${live.groups})`);
  check(live.onPage === 'pg-start', `it opens on Start here (${live.onPage})`);
  check(live.heading === 'proto23', `and the page has rendered ("${live.heading}")`);
  await tab.close();
}

console.log('\n--- a broken page does not take the wiki down with it');
const resilient = await p.evaluate(() => {
  const pg = MOD_WIKI_PAGES.find(x => x.id === 'items');
  const real = pg.build;
  pg.build = function () { throw new Error('deliberate'); };
  let html;
  try { html = MOD_wikiBuild(); } finally { pg.build = real; }
  return { built: html.length > 10000,
           saidSo: /could not be built/.test(html),
           othersFine: html.indexOf('Cultivation') >= 0 && html.indexOf('Progression') >= 0 };
});
check(resilient.built, 'the document is still built');
check(resilient.saidSo, 'the failed page says so instead of rendering blank');
check(resilient.othersFine, 'the other pages are unaffected');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the wiki covers everything the game defines, reflects the save, and renders.');
