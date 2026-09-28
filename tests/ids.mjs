import { launch, settle } from './lib/browser.mjs';

// Ids are the save's primary key, and the game matches on them in loops with
// no `break`:
//
//   for (a in a6) for (b in skl) if (a6[a].id === skl[b].id) you.skls.push(skl[b])
//   for (gg in chss) if (chss[gg].id === global.lst_loc) chss[gg].sl()
//
// So a duplicate id is not a cosmetic clash, it is data corruption that
// compounds. Section 29 gave Fire Mastery id 2010, which section 11 had already
// given the Companions parent (2000 + section 10). Every save/load pushed both
// skills for both entries and the sheet DOUBLED each cycle — 1, 2, 4, 8, 16 —
// until a played-in character had a hundred of each.
//
// Nothing checked for this. It checks now, across every namespace, because the
// same mistake is available in all of them.
//
//   PORT=8080 node tests/ids.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- no two things in a namespace share an id');
const scan = await p.evaluate(() => {
  const one = (name, obj, skip) => {
    const byId = {};
    for (const k in obj) {
      const o = obj[k];
      if (!o || typeof o !== 'object' || o.id === undefined) continue;
      if (skip && skip.indexOf(o.id) !== -1) continue;
      (byId[o.id] = byId[o.id] || []).push(k);
    }
    return { ns: name, total: Object.keys(byId).length,
             dupes: Object.entries(byId).filter(([, v]) => v.length > 1)
               .map(([id, v]) => `${name} id ${id}: ${v.join(' == ')}`) };
  };
  return [
    one('skl', skl), one('ttl', ttl), one('act', act), one('abl', abl),
    one('item', item), one('wpn', wpn), one('eqp', eqp), one('sld', sld),
    one('acc', acc), one('area', area), one('creature', creature),
    one('quest', quest), one('rcp', rcp),
    // chss id -1 is the author's own marker on two unreachable dev stubs
    // (chss.tst, chss.tstauto); nothing dispatches to it, and it is not the
    // mod's to change.
    one('chss', chss, [-1])
  ];
});
scan.forEach(x => {
  check(x.dupes.length === 0,
    `${x.ns}: ${x.total} ids, ${x.dupes.length ? 'CLASH — ' + x.dupes.join('; ') : 'all distinct'}`);
});

console.log('\n--- the two that were clashing');
const fixed = await p.evaluate(() => ({
  fire: skl.mod_fire.id, companions: skl.par_10.id,
  water: skl.mod_water.id, air: skl.mod_air.id, earth: skl.mod_earth.id,
  light: skl.mod_light.id, dark: skl.mod_dark.id,
  // the cap system is keyed by id too, so the clash was also stealing the
  // Companions parent's level cap
  capOwner2010: MOD_KEY_BY_ID[2010],
  capOwnerFire: MOD_KEY_BY_ID[skl.mod_fire.id],
  hollow: chss.mod_hollow.id, tower: chss.mod_pltwr.id,
  towerDrawsItsOwnId: /lst_loc = 980/.test(String(chss.mod_pltwr.sl))
}));
check(fixed.fire !== fixed.companions,
  `Fire Mastery ${fixed.fire} and Companions Discipline ${fixed.companions} are different now`);
check(fixed.capOwner2010 === 'par_10',
  `id 2010's level cap belongs to the Companions parent again (${fixed.capOwner2010})`);
check(fixed.capOwnerFire === 'mod_fire',
  `and Fire Mastery has its own (${fixed.capOwnerFire})`);
// only fire had to move, so nobody loses a level they already earned
check([fixed.water, fixed.air, fixed.earth, fixed.light, fixed.dark].join() === '2011,2012,2013,2014,2015',
  'water through dark keep the ids they were saved under — those levels survive');
check(fixed.hollow !== fixed.tower,
  `The Sunken Hollow ${fixed.hollow} and the Pill Tower ${fixed.tower} are different now`);
check(fixed.towerDrawsItsOwnId, 'and the tower records its own id as the location');

console.log('\n--- the sheet no longer doubles across save/load');
const cycles = await p.evaluate(() => {
  const out = [];
  if (you.skls.indexOf(skl.mod_fire) < 0) you.skls.push(skl.mod_fire);
  if (you.skls.indexOf(skl.par_10) < 0) you.skls.push(skl.par_10);
  skl.mod_fire.lvl = 3; skl.par_10.lvl = 5;
  for (let i = 0; i < 5; i++) {
    const blob = save(true);
    try { load(blob); } catch (e) { return { threw: e.message }; }
    out.push({ cycle: i + 1,
      fire: you.skls.filter(s => s === skl.mod_fire).length,
      companions: you.skls.filter(s => s === skl.par_10).length,
      total: you.skls.length });
  }
  return { out, fireLvl: skl.mod_fire.lvl, parLvl: skl.par_10.lvl };
});
check(!cycles.threw, `five save/load cycles run clean (${cycles.threw || 'no throw'})`);
if (!cycles.threw) {
  const steady = cycles.out.every(c => c.fire === 1 && c.companions === 1);
  check(steady, 'one Fire Mastery and one Companions Discipline after every cycle');
  const totals = cycles.out.map(c => c.total);
  check(new Set(totals).size === 1,
    `and the sheet stays the same size (${totals.join(' -> ')})`);
  check(cycles.fireLvl === 3 && cycles.parLvl === 5,
    `both keep their own level through it (fire ${cycles.fireLvl}, companions ${cycles.parLvl})`);
  console.log('     ' + cycles.out.map(c => `#${c.cycle}: ${c.total}`).join('  '));
}

console.log('\n--- and a sheet that is already damaged gets repaired');
// A save made before the fix has the duplicates IN it, so fixing the id only
// stops it getting worse. This is what actually cleans up an existing save.
const repair = await p.evaluate(() => {
  const before = you.skls.length;
  // recreate the damage exactly: the same objects, many times over
  for (let i = 0; i < 60; i++) { you.skls.push(skl.mod_fire); you.skls.push(skl.par_10); }
  you.skls.push(null);                    // and a hole, which the loader can leave
  const damaged = you.skls.length;
  const dropped = MOD_dedupeSkills('test');
  const after = you.skls.length;
  return { before, damaged, dropped, after,
    fire: you.skls.filter(s => s === skl.mod_fire).length,
    holes: you.skls.filter(s => !s).length,
    order: you.skls.length === new Set(you.skls).size };
});
check(repair.dropped === repair.damaged - repair.after,
  `${repair.dropped} rows removed (${repair.damaged} -> ${repair.after})`);
check(repair.after === repair.before,
  `back to the size it started at (${repair.before})`);
check(repair.fire === 1, 'exactly one Fire Mastery left');
check(repair.holes === 0, 'and no empty rows');
check(repair.order, 'every entry on the sheet is a distinct skill');

console.log('\n--- the repair runs on its own when a save is loaded');
const auto = await p.evaluate(() => {
  // dom.skcon is built when the skills tab is first opened, so open it — the
  // point of the check is that the panel is redrawn, and a panel that was never
  // drawn cannot show that.
  dom.ct_bt2.click();
  for (let i = 0; i < 20; i++) you.skls.push(skl.par_10);
  const damaged = you.skls.filter(s => s === skl.par_10).length;
  const blob = save(true);
  load(blob);
  return { damaged, after: you.skls.filter(s => s === skl.par_10).length,
           distinct: you.skls.length === new Set(you.skls).size,
           // the panel must be redrawn to match, or its per-row updater reads
           // fixed child indices against a list that no longer matches
           rows: dom.skcon ? dom.skcon.children.length : null,
           sheet: you.skls.length };
});
check(auto.after === 1, `${auto.damaged} duplicates before the load, ${auto.after} after`);
check(auto.distinct, 'the whole sheet is distinct');
check(auto.rows === auto.sheet,
  `and the panel was redrawn to match (${auto.rows} rows for ${auto.sheet} skills)`);

console.log('\n--- global.titles has the same shape of bug, from the other direction');
// giveTitle pushes onto BOTH global.titles and global.titlese, and load()
// rebuilds global.titles from the save BY INDEX and then appends the whole of
// titlese on top. So every title earned this session is in the array twice
// after one load. It does not compound -- the next load finds titlese empty --
// but save() writes the inflated array straight back out, and both the game's
// own title screen and the mod's grouped picker iterate it.
const titles = await p.evaluate(() => {
  // earn a batch the way the game does, so titlese fills up
  const keys = Object.keys(ttl).filter(k => ttl[k] && ttl[k].id !== 0).slice(0, 40);
  keys.forEach(k => { try { giveTitle(ttl[k], true); } catch (e) {} });
  const before = { len: global.titles.length, distinct: new Set(global.titles).size,
                   staged: global.titlese.length };
  const blob = save(true);
  load(blob);
  const after = { len: global.titles.length, distinct: new Set(global.titles).size,
                  staged: global.titlese.length };
  // and again, to show it is not merely converging on a bigger number
  const blob2 = save(true); load(blob2);
  const twice = { len: global.titles.length, distinct: new Set(global.titles).size };
  return { before, after, twice, holes: global.titles.filter(t => !t).length,
           worn: global.titles.indexOf(you.title) >= 0 };
});
check(titles.before.len === titles.before.distinct,
  `before the load, ${titles.before.len} titles and ${titles.before.distinct} distinct`);
check(titles.after.len === titles.after.distinct,
  `after it, still ${titles.after.len} for ${titles.after.distinct} distinct ` +
  `(${titles.before.staged} were staged in titlese and re-appended)`);
check(titles.twice.len === titles.twice.distinct,
  `and after a second load (${titles.twice.len} / ${titles.twice.distinct})`);
check(titles.holes === 0, 'no empty entries left behind');
check(titles.worn, 'and the worn title is still in the list the picker reads');

console.log('\n--- a title list that is already doubled gets repaired');
const ttlRepair = await p.evaluate(() => {
  const before = global.titles.length;
  const copy = global.titles.slice();
  copy.forEach(t => global.titles.push(t));     // exactly what load() did
  global.titles.push(null);
  const damaged = global.titles.length;
  const dropped = MOD_dedupeTitles('test');
  return { before, damaged, dropped, after: global.titles.length,
           distinct: global.titles.length === new Set(global.titles).size,
           holes: global.titles.filter(t => !t).length };
});
check(ttlRepair.dropped === ttlRepair.damaged - ttlRepair.after,
  `${ttlRepair.dropped} removed (${ttlRepair.damaged} -> ${ttlRepair.after})`);
check(ttlRepair.after === ttlRepair.before, `back to ${ttlRepair.before}`);
check(ttlRepair.distinct && ttlRepair.holes === 0, 'every entry distinct, no holes');

console.log('\n--- an item id is a CLASS as well as a namespace');
// dscr type 1 reads the category straight off the number -- Food under 3000,
// Medicine/Tool to 5000, Material/Misc to 9000, Book above -- and there is no
// field for it. Everything the mod added started at 9100+, so twenty-six items
// were labelled "Book" with a "Read: Never" line under them, ore included.
// Expectation comes from the mod's own tables, not from the ids.
const classes = await p.evaluate(() => {
  const want = {};
  MOD_MATERIALS.forEach(m => { want[m[0]] = 'Material/Misc'; });
  MOD_CRAFT_TIERS.forEach(T => { want['mod_t' + T.t] = 'Medicine/Tool'; });
  for (let i = 1; i <= 10; i++) want['mod_bp' + i] = 'Medicine/Tool';
  ['sp4', 'sp5', 'sp6', 'sp7'].forEach(k => { want[k] = 'Medicine/Tool'; });
  for (const k in item) if (/^mod_[a-z]+_manual$/.test(k)) want[k] = 'Book';
  const wrong = [], bookLine = [], foodLine = [];
  Object.keys(want).forEach(k => {
    const o = item[k];
    if (!o) { wrong.push(k + ' missing'); return; }
    const got = MOD_itemClass(o.id);
    if (got !== want[k]) wrong.push(`${o.name} (${o.id}) reads ${got}, should be ${want[k]}`);
    // the two footer lines the game hangs off the same ranges
    if (o.id >= 9000 && o.id < 10000 && want[k] !== 'Book') bookLine.push(o.name);
    if (o.id < 3000) foodLine.push(o.name);
  });
  return { n: Object.keys(want).length, wrong, bookLine, foodLine,
           // and the ranges themselves have to stay inside the namespace block
           inBlock: Object.keys(want).every(k => item[k] && item[k].id < 10000) };
});
check(classes.wrong.length === 0, classes.wrong.length
  ? `wrong class: ${classes.wrong.join('; ')}`
  : `all ${classes.n} added items read as what they are`);
check(classes.bookLine.length === 0, classes.bookLine.length
  ? `these still get a "Read:" line: ${classes.bookLine.join(', ')}`
  : 'nothing that is not a book gets the "Read:" footer');
check(classes.foodLine.length === 0, 'and nothing that is not food gets the "Tried:" footer');
check(classes.inBlock, 'every one is still under 10000, so load() resolves it to `item`');

console.log('\n--- and a save written before they moved keeps its items');
// The inventory is saved BY id and restored by matching it, so an entry whose
// id no longer exists is dropped without a word. Section 37 reads the blob
// before the game's load runs and gives those stacks back afterwards.
const migrated = await p.evaluate(() => {
  const held = o => { let n = 0; for (const k in inv) if (inv[k] && inv[k].id === o.id) n += inv[k].amount; return n; };
  const probes = [[item.mod_bp10, 3, 9129], [item.sp7, 2, 9104],
                  [item.mod_ore5, 7, 9203], [item.mod_t5, 4, 9224]];
  probes.forEach(([o, n]) => giveItem(o, n));
  const before = probes.map(([o]) => held(o));
  // rewrite the blob back to the ids 3.6 would have written
  const back = {}; probes.forEach(([o, , oldId]) => { back[o.id] = oldId; });
  const str = b64_to_utf8(save(true)).split('|');
  const a3 = JSON.parse(str[6]);
  let rewrote = 0;
  a3[0].forEach(e => { if (back[e.id] !== undefined) { e.id = back[e.id]; rewrote++; } });
  str[6] = JSON.stringify(a3);
  const oldSave = utf8_to_b64(str.join('|'));
  const seen = MOD_strandedItems(oldSave).length;
  load(oldSave);
  const after = probes.map(([o]) => held(o));
  // a current save must not double-grant on the way back
  load(save(true));
  const again = probes.map(([o]) => held(o));
  return { rewrote, seen, before, after, again,
           names: probes.map(([o]) => o.name) };
});
check(migrated.rewrote === 4 && migrated.seen === 4,
  `${migrated.seen} stacks found stranded under their old ids`);
check(migrated.after.join() === migrated.before.join(),
  `all of them came back at the right amount (${migrated.names.map((n, i) => n + ' x' + migrated.after[i]).join(', ')})`);
check(migrated.again.join() === migrated.before.join(),
  'and a current save round-trips without granting them twice');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — every id is unique, the sheet does not double, and an already-damaged one is repaired.');
