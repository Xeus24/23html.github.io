import { chromium } from 'playwright';

// The marketplace was unreachable, and the mod is what made it so.
//
// The base game's chain: finish at the dojo (dj1end) -> a Paper Boy turns up at
// the Village Center at 40% a visit with a "Pamphlet" -> read it for three
// hours -> mkplc1u opens the door. Exactly ONE item in the game sets that flag,
// and pmfspmkm1 — set when the Pamphlet is GIVEN, not when it is read — retires
// the Paper Boy permanently.
//
// Section 15 added selling and nothing marked the Pamphlet a key item. Sell it
// at the food stand, outside the marketplace, before reading it, and the
// marketplace, its three shops, the guard-duty quest and the realm 2-5
// breakthrough pills are gone for good.
//
//   PORT=8080 node tests/marketplace.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the chain is exactly as fragile as it looks');
const chain = await p.evaluate(() => {
  let setters = 0;
  for (const k in item) { try { if (/mkplc1u/.test(String(item[k].use))) setters++; } catch (e) {} }
  return {
    setters,
    // the Herbalist stocks realms 2-5, so it is downstream of all of this
    pillsBehindIt: vendor.pha1.items.filter(x => /mod_bp/.test(
      Object.keys(item).find(k => item[k] === x.item) || '')).length
  };
});
check(chain.setters === 1, `exactly one item in the game opens the marketplace (${chain.setters})`);
check(chain.pillsBehindIt > 0,
  `and ${chain.pillsBehindIt} breakthrough pills are sold behind it`);

console.log('\n--- A. the Pamphlet is no longer merchandise');
const keys = await p.evaluate(() => ({
  pamphlet: MOD_sellable(Object.assign(item.shppmf, { amount: 1 })),
  protectedItems: Object.keys(MOD_KEY_ITEMS),
  flags: MOD_KEY_ITEMS['item.shppmf'],
  // a Smoke Bomb sets smkactv, which the game DOES clear — transient state,
  // not a key item, and it must stay sellable
  smokeBomb: MOD_sellable(Object.assign(item.smkbmb, { amount: 3 })),
  smokeIsKey: !!MOD_KEY_ITEMS['item.smkbmb'],
  // ordinary goods are unaffected
  apple: MOD_sellable(Object.assign(item.appl, { amount: 5 }))
}));
check(!keys.pamphlet, 'the Pamphlet cannot be sold');
check(keys.apple, 'an apple still can');
check(keys.smokeBomb && !keys.smokeIsKey,
  'a Smoke Bomb still can — it sets a flag the game clears, so it is state, not a key');
check(keys.flags && keys.flags.indexOf('mkplc1u') >= 0,
  `the Pamphlet is protected because of ${(keys.flags || []).join(', ')}`);
check(keys.protectedItems.length >= 5,
  `${keys.protectedItems.length} key items found by scanning the game itself`);
console.log('     ' + keys.protectedItems.join(', '));

console.log('\n--- B. a save already in the hole gets out');
const rescue = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  const click = (re) => { const el = [].slice.call(dom.ctr_2.children)
    .find(c => re.test(c.textContent)); if (el) { el.click(); return true; } return false; };
  // the "?" choice is its own line and nothing else. A loose /\?/ matches the
  // Paper Boy's own sentence, which ends in one.
  const clickExact = (t) => { const el = [].slice.call(dom.ctr_2.children)
    .find(c => c.textContent.trim() === t); if (el) { el.click(); return true; } return false; };
  const visitsUntil = (re, n) => { for (let i = 0; i < n; i++) {
    chss.lsmain1.sl(); if (texts().some(t => re.test(t))) return i + 1; } return null; };

  // put the game in exactly the broken state: handed a Pamphlet, then lost it
  global.flags.dj1end = true;
  global.flags.mkplc1u = false;
  global.flags.pmfspmkm1 = true;
  item.shppmf.amount = 0;

  const first = visitsUntil(/Paper Boy/, 100);
  const screen = texts();
  const took = clickExact('?');
  const got = item.shppmf.amount;

  // and once you hold one again, he stops
  const whileHolding = visitsUntil(/Paper Boy/, 60);

  // Finish the read the way the game's own timer does. chss.trd.sl computes
  // cmax off Literacy and sets rdng, and the timer clears rdng before calling
  // use() — canRead() refuses while it is set, so skipping that step would test
  // nothing but the guard.
  global.flags.mkplc1u = false;
  item.shppmf.data.timep = 0;
  chss.trd.sl(item.shppmf);
  const cmax = item.shppmf.cmax;
  clearInterval(timers.rdng); clearInterval(timers.rdngdots);
  global.flags.rdng = false;
  item.shppmf.data.timep = cmax;
  item.shppmf.use();
  const opened = global.flags.mkplc1u === true;

  chss.lsmain1.sl();
  const listed = texts().some(t => /"=> Visit Marketplace"$/.test(t));
  let inside = null;
  if (listed) { click(/"=> Visit Marketplace"$/); inside = texts(); }
  return { first, screen, took, got, whileHolding, cmax, opened, listed, inside };
});
check(rescue.first !== null, `the Paper Boy comes back (visit ${rescue.first})`);
check(rescue.took, 'the "?" choice is there to take');
check(rescue.got === 1, 'and hands over another Pamphlet');
check(rescue.whileHolding === null,
  'he stops once you are holding one (60 visits, no repeat)');
check(rescue.cmax > 0, `the read is a real one (${Math.round(rescue.cmax)} minutes at this Literacy)`);
check(rescue.opened, 'reading it opens the marketplace');
check(rescue.listed, 'the Village Center lists it');
check(rescue.inside && rescue.inside.some(t => /marketplace feels busy/.test(t)),
  'and you can walk in');
console.log('     ' + (rescue.inside || []).join(' | '));

console.log('\n--- a fresh character still meets him once, through the game\'s own code');
const fresh = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  global.flags.mkplc1u = false;
  global.flags.pmfspmkm1 = false;     // never met him
  global.flags.dj1end = true;
  item.shppmf.amount = 0;
  let sightings = 0, wording = new Set();
  for (let i = 0; i < 200; i++) {
    chss.lsmain1.sl();
    const t = texts().find(x => /Paper Boy/.test(x));
    if (t) { sightings++; wording.add(t); global.flags.pmfspmkm1 = true; item.shppmf.amount = 1; break; }
  }
  return { sightings, wording: [...wording] };
});
check(fresh.sightings === 1, `he appears once, not twice (${fresh.sightings})`);
check(fresh.wording[0] && /this is for you/.test(fresh.wording[0]),
  `and it is the author's own line ("${fresh.wording[0]}")`);

console.log('\n--- and before the dojo he does not turn up at all');
const early = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  global.flags.mkplc1u = false; global.flags.dj1end = false;
  global.flags.pmfspmkm1 = true; item.shppmf.amount = 0;
  let saw = false;
  for (let i = 0; i < 200; i++) { chss.lsmain1.sl();
    if (texts().some(t => /Paper Boy/.test(t))) { saw = true; break; } }
  return saw;
});
check(!early, 'the dojo still comes first');

console.log('\n--- C. and the gate is visible instead of silent');
const hints = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  const seen = {};
  // before the dojo
  global.flags.mkplc1u = false; global.flags.dj1end = false;
  global.flags.pmfspmkm1 = false; item.shppmf.amount = 0;
  chss.lsmain1.sl();
  seen.beforeDojo = texts().find(t => /Visit Marketplace/.test(t)) || null;
  // holding an unread Pamphlet
  global.flags.dj1end = true; global.flags.pmfspmkm1 = true; item.shppmf.amount = 1;
  chss.lsmain1.sl();
  seen.holding = texts().find(t => /Visit Marketplace/.test(t)) || null;
  // open: the hint must be gone and the real choice there
  global.flags.mkplc1u = true;
  chss.lsmain1.sl();
  const lines = texts().filter(t => /Visit Marketplace/.test(t));
  seen.open = lines;
  // the Herbalist hint, inside
  global.flags.phai1udt = false;
  chss.mrktvg1.sl();
  seen.herbLocked = texts().find(t => /Herbalist/.test(t)) || null;
  global.flags.phai1udt = true;
  chss.mrktvg1.sl();
  seen.herbOpen = texts().filter(t => /Herbalist/.test(t));
  return seen;
});
check(/dojo/.test(hints.beforeDojo || ''),
  `before the dojo it says so ("${hints.beforeDojo}")`);
check(/Pamphlet/.test(hints.holding || ''),
  `holding one unread it says so ("${hints.holding}")`);
check(hints.open.length === 1 && !/—/.test(hints.open[0]),
  `once open there is one line and no hint (${JSON.stringify(hints.open)})`);
check(/side street|shown the way/.test(hints.herbLocked || ''),
  `the Herbalist hint appears while locked ("${hints.herbLocked}")`);
check(hints.herbOpen.length === 1 && !/side street/.test(hints.herbOpen[0]),
  `and goes away once it is open (${JSON.stringify(hints.herbOpen)})`);

// .chs is height:22px with no overflow rule, so a choice that wraps spills out
// of its row and under the next one. Every line the mod adds has to fit on one.
console.log('\n--- every added line fits on one row');
const fit = await p.evaluate(() => {
  const out = [];
  const measure = (label) => {
    [].slice.call(dom.ctr_2.children).forEach(c => {
      if (!c.className || c.className.indexOf('chs') < 0) return;
      const t = c.textContent.trim();
      if (!/Marketplace|Herbalist|Catacombs|Pill Tower/.test(t)) return;
      // one line's height for this class, taken from a row known to be short
      out.push({ where: label, chars: t.length,
                 lines: Math.round(c.scrollHeight / 22), text: t });
    });
  };
  global.flags.mkplc1u = false; global.flags.dj1end = false;
  chss.lsmain1.sl(); measure('before dojo');
  global.flags.dj1end = true; global.flags.pmfspmkm1 = true; item.shppmf.amount = 1;
  chss.lsmain1.sl(); measure('holding one');
  // The third wording only draws when the 40% Paper Boy roll misses, so render
  // it directly rather than rolling for it — a variant that is measured only
  // sometimes is not measured.
  item.shppmf.amount = 0;
  const third = MOD_marketBlockedBy();
  const probe = chs('<span style="color:grey">"=> Visit Marketplace" — ' +
    third.short + '</span>', false);
  out.push({ where: 'no idea', chars: probe.textContent.trim().length,
             lines: Math.round(probe.scrollHeight / 22),
             text: probe.textContent.trim() });
  global.flags.mkplc1u = true; global.flags.phai1udt = false;
  chss.mrktvg1.sl(); measure('marketplace');
  const rowH = dom.ctr_2.querySelector('.chs') ?
    Math.round(dom.ctr_2.querySelector('.chs').getBoundingClientRect().height) : null;
  return { rows: out, rowH };
});
const overflow = fit.rows.filter(r => r.lines > 1);
check(overflow.length === 0,
  `no added choice wraps (${overflow.map(r => r.where + ': ' + r.chars + ' chars').join(', ') || 'all fit'})`);
fit.rows.forEach(r => console.log(`     ${String(r.chars).padStart(3)} chars  ${r.text}`));

console.log('\n--- with the sentence in the tooltip instead');
const tips = await p.evaluate(() => {
  global.flags.mkplc1u = false; global.flags.dj1end = true;
  global.flags.pmfspmkm1 = true; item.shppmf.amount = 1;
  const why = MOD_marketBlockedBy();
  return { short: why.short, long: why.long,
           shortFits: why.short.length <= 30, longer: why.long.length > why.short.length };
});
check(tips.shortFits, `the line stays short ("${tips.short}", ${tips.short.length} chars)`);
check(tips.longer, `and the tooltip carries the explanation (${tips.long.length} chars)`);

console.log('\n--- and it sits above the way out, not below it');
// chs() appends, so a wrapper's line lands under the location's "<= Return".
// All 85 of the game's back-choices start with `"<=`, so that is what the hint
// is placed above.
const order = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  global.flags.mkplc1u = true; global.flags.phai1udt = false;
  chss.mrktvg1.sl();
  const t = texts();
  const hint = t.findIndex(x => /not been shown the way/.test(x));
  const back = t.findIndex(x => /^"<=/.test(x));
  // the Village Center is a hub with no back line — the hint just appends there
  global.flags.mkplc1u = false; global.flags.dj1end = false;
  chss.lsmain1.sl();
  const vc = texts();
  return { hint, back, lines: t,
           hubHasNoBack: !vc.some(x => /^"<=/.test(x)),
           hubShowsHint: vc.some(x => /Visit Marketplace/.test(x)) };
});
check(order.hint >= 0 && order.back >= 0 && order.hint < order.back,
  `the Herbalist hint is above "Return" (hint at ${order.hint}, return at ${order.back})`);
check(order.hubHasNoBack && order.hubShowsHint,
  'and the Village Center, which has no back line, still shows its hint');
console.log('     ' + order.lines.join(' | '));

console.log('\n--- the Village Center is otherwise untouched');
const untouched = await p.evaluate(() => {
  const texts = () => [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  global.flags.mkplc1u = true;
  chss.lsmain1.sl();
  const t = texts();
  return {
    board: t.some(x => /Message Board/.test(x)),
    dojo: t.some(x => /Enter Dojo/.test(x)),
    home: t.some(x => /Go home/.test(x)),
    market: t.some(x => /Visit Marketplace/.test(x)),
    first: t[0]
  };
});
check(untouched.board && untouched.dojo && untouched.home,
  'the board, the dojo and home are all still there');
check(/surroundings|feel/i.test(untouched.first),
  `and the location's own opening line is still first ("${untouched.first}")`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the marketplace is reachable, cannot be locked out by selling, and says why when it is shut.');
