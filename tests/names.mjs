import { launch, settle } from './lib/browser.mjs';

// Two things the mod can break quietly:
//
//   NAMES. Ids are checked by tests/ids.mjs, but the player never sees an id.
//   Section 4 shipped `skl.frg` named "Foraging" when the base game already had
//   `skl.hvt` under that name — two identical rows in the skill panel, and TEN
//   identically named titles, because section 24 derives a title's name from
//   its skill's. Nothing errored.
//
//   THE HUNTER'S QUEST. quest.hnt1 wants ten Raw Meat held at once, and Raw
//   Meat rots on a daily timer. The mod never touched the drop table, but it
//   made a rabbit take ten swings instead of one, and ten times less meat an
//   hour against an unchanged rot clock put summer out of reach entirely.
//
//   PORT=8080 node tests/names.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

// The author's own repeats. Listed so they are reported rather than fixed —
// the same call area.clg and the unfinished titles got. Renaming his content
// is not the mod's business; shipping a clash of our own is.
const AUTHORS = {
  'item:Chashu Ramen': 'rmn1 / ramen3',
  'ttl:Nameless': 'ttsttl2 / hstr4',
  'creature:Blue Slime': 'slm1 / slm5',
  'bag:Chashu Ramen': 'item.rmn1 / item.ramen3',
  'bag:Bandage': 'item.bdgh / eqp.brc'
};

console.log('--- no two things in a namespace share a name');
const names = await p.evaluate(() => {
  let src = '';
  for (const sc of document.scripts) if (!sc.src) src += sc.textContent;
  // "the author's" = defined in his inline script; the mod's key convention is
  // not reliable on its own (skl.frg, skl.qic and friends carry no prefix)
  const authored = {};
  ['skl', 'ttl', 'act', 'item', 'wpn', 'eqp', 'sld', 'acc', 'rcp', 'area', 'creature', 'chss']
    .forEach(ns => {
      authored[ns] = new Set();
      const re = new RegExp(ns + '\\.([A-Za-z0-9_]+) *= *new ', 'g');
      let m; while ((m = re.exec(src))) authored[ns].add(m[1]);
    });
  const out = { within: [], bag: [], mine: 0 };
  Object.keys(authored).forEach(ns => {
    const by = {};
    for (const k in window[ns]) {
      const o = window[ns][k];
      if (!o || typeof o !== 'object' || !o.name) continue;
      (by[o.name] = by[o.name] || []).push(k);
    }
    Object.entries(by).filter(([, v]) => v.length > 1).forEach(([n, v]) => {
      out.within.push({ ns, name: n, keys: v,
        allAuthors: v.every(k => authored[ns].has(k)) });
    });
  });
  // item / wpn / eqp / sld / acc all land in one bag, so a name repeated across
  // them reads exactly as badly as one repeated inside one
  const bag = {};
  ['item', 'wpn', 'eqp', 'sld', 'acc'].forEach(ns => {
    for (const k in window[ns]) {
      const o = window[ns][k];
      if (!o || typeof o !== 'object' || !o.name) continue;
      (bag[o.name] = bag[o.name] || []).push({ ns, k, mine: !authored[ns].has(k) });
    }
  });
  Object.entries(bag).filter(([, v]) => v.length > 1).forEach(([n, v]) => {
    out.bag.push({ name: n, where: v.map(x => x.ns + '.' + x.k),
      allAuthors: v.every(x => !x.mine) });
  });
  ['item', 'wpn', 'eqp', 'sld', 'acc', 'rcp', 'chss', 'act', 'creature', 'area', 'skl']
    .forEach(ns => { for (const k in window[ns])
      if (!authored[ns].has(k) && window[ns][k] && window[ns][k].name) out.mine++; });
  return out;
});

// area is the deliberate exception: nine "Training Grounds" and three "Western
// forest hunting area" are the author's, and the wiki already says eleven names
// cover twenty-one areas.
const within = names.within.filter(d => d.ns !== 'area');
const ours = within.filter(d => !d.allAuthors || !AUTHORS[d.ns + ':' + d.name]);
const theirs = within.filter(d => d.allAuthors && AUTHORS[d.ns + ':' + d.name]);
theirs.forEach(d => console.log(`     (author's, reported not fixed) ${d.ns}: "${d.name}" — ${d.keys.join(', ')}`));
check(ours.length === 0, ours.length
  ? `the mod added a clash: ${ours.map(d => `${d.ns} "${d.name}" (${d.keys.join(', ')})`).join('; ')}`
  : `${names.mine} things the mod names, none of them colliding inside its namespace`);

console.log('\n--- and nothing is named twice across the one inventory bag');
const bagOurs = names.bag.filter(d => !d.allAuthors || !AUTHORS['bag:' + d.name]);
names.bag.filter(d => d.allAuthors && AUTHORS['bag:' + d.name])
  .forEach(d => console.log(`     (author's) "${d.name}" — ${d.where.join(', ')}`));
check(bagOurs.length === 0, bagOurs.length
  ? `the mod added a bag clash: ${bagOurs.map(d => `"${d.name}" ${d.where.join(', ')}`).join('; ')}`
  : 'no added item, weapon, armour, shield or accessory repeats a name');

console.log('\n--- the one that shipped: Foraging was taken');
const forage = await p.evaluate(() => ({
  hvt: skl.hvt.name, frg: skl.frg.name, frgId: skl.frg.id,
  // section 24 builds a title's name from its skill's, so a skill-name clash
  // is a ten-title clash
  titleClash: (() => {
    const by = {};
    for (const k in ttl) { const t = ttl[k];
      if (!t || !t.name) continue; (by[t.name] = by[t.name] || []).push(k); }
    return Object.entries(by).filter(([, v]) => v.length > 1 &&
      v.some(k => k.indexOf('mod_t_') === 0)).map(([n]) => n);
  })()
}));
check(forage.hvt !== forage.frg,
  `the author keeps "${forage.hvt}", the mod's skill is "${forage.frg}"`);
check(forage.frgId === 902,
  `and its id is unchanged (${forage.frgId}) — names are not saved, ids are`);
check(forage.titleClash.length === 0, forage.titleClash.length
  ? `generated titles still collide: ${forage.titleClash.join(', ')}`
  : 'no two generated titles share a name');

console.log('\n--- the hunter\'s quest is completable, in every season');
// quest.hnt1 wants ten Raw Meat HELD AT ONCE, and it rots, so the stock
// converges rather than accumulating. Read the requirement and the rot row off
// the game rather than restating either.
// Both fight settings (section 47): on Scaled the drop is raised to make up
// for the mod's kill times; on Original the fights and the drop are his.
for (const mode of ['scaled', 'original']) {
const meat = await p.evaluate((mode) => {
  setFights(mode);
  const need = (() => {
    const src = String(quest.hnt1.info || quest.hnt1.desc || '');
    const m = src.match(/(\d+)/);
    return m ? Number(m[1]) : 10;
  })();
  const rows = [];
  for (const k in area) {
    const z = area[k];
    if (!z || !z.pop || !z.popc) continue;
    let share = 0, chance = 0;
    z.pop.forEach((e, i) => {
      const d = (e.crt && e.crt.drop || []).find(x => x.item === item.rwmt1);
      if (!d) return;
      const band = z.popc[i];
      if (band) { share += band[1] - band[0]; chance = d.chance; }
    });
    if (share <= 0) continue;                    // a for..in body: continue, not return
    rows.push({ area: k, name: z.name, share, chance,
      normal: MOD_meatSteadyState(share, chance, 1),
      summer: MOD_meatSteadyState(share, chance, 0.5),
      winter: MOD_meatSteadyState(share, chance, 2.5) });
  }
  return { need, rows, rot: item.rwmt1.rot,
           killSec: mode === 'original' ? MOD_MEAT.killSecOriginal : MOD_MEAT.killSec,
           chance: MOD_MEAT.chance,
           // the sources are found by scanning, not named
           carriers: Object.keys(creature)
             .filter(k => (creature[k].drop || []).some(d => d.item === item.rwmt1))
             .map(k => { const d = creature[k].drop.find(d => d.item === item.rwmt1);
               return { k, c: d.chance, author: d._modChance0 }; }) };
}, mode);
console.log(`     Fights: ${mode}. ${meat.need} needed at once; rot ${JSON.stringify(meat.rot)}; ` +
  `${meat.killSec}s a kill assumed; drop ${meat.carriers.map(c => Math.round(c.c * 100) + '%').join('/')}`);
meat.rows.forEach(r => console.log(
  `     ${r.name.padEnd(30)} ${(r.share * 100).toFixed(0).padStart(3)}% meat spawns  ` +
  `normal ${Math.round(r.normal).toString().padStart(4)}  summer ${Math.round(r.summer).toString().padStart(4)}  winter ${Math.round(r.winter).toString().padStart(4)}`));
check(meat.rows.length > 0, `[${mode}] ${meat.rows.length} areas can yield Raw Meat`);
const worstArea = meat.rows.reduce((a, r) => r.summer < a.summer ? r : a);
check(worstArea.summer >= meat.need,
  `[${mode}] the worst case — ${worstArea.name}, in summer — holds ${Math.round(worstArea.summer)} against ${meat.need} needed`);
check(meat.rows.every(r => r.normal >= meat.need && r.summer >= meat.need && r.winter >= meat.need),
  `[${mode}] every meat area clears the requirement in every season`);
if (mode === 'scaled') {
  check(meat.carriers.length >= 2 && meat.carriers.every(c => c.c >= meat.chance),
    `[${mode}] every creature that drops it was raised together (${meat.carriers.map(c => c.k).join(', ')})`);
} else {
  check(meat.carriers.length >= 2 && meat.carriers.every(c => c.c === c.author),
    `[${mode}] every creature that drops it is back at the author's chance (${meat.carriers.map(c => c.k).join(', ')})`);
}
}

console.log('\n--- and the raise did not turn meat into an income');
const income = await p.evaluate(() => {
  const perKill = 0.20 * MOD_MEAT.chance;      // first hunting area's rabbit share
  return { perKill, coin: perKill * MOD_itemValue(item.rwmt1) * 0.25,
           value: MOD_itemValue(item.rwmt1) };
});
check(income.coin < 1,
  `a kill in the first hunting area yields ${income.coin.toFixed(2)} coin of meat ` +
  `(it is worth ${Math.round(income.value)}, sold at 25%)`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — nothing the mod names collides, and the hunter\'s quest survives its kill times.');
