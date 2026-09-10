import { chromium } from 'playwright';

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
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

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

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — every id is unique, the sheet does not double, and an already-damaged one is repaired.');
