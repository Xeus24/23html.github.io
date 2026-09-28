import { launch, settle } from './lib/browser.mjs';

// Skill rarity, and the convergence.
//
// Two features, one test, because they share a page and a screen.
//
// RARITY is derived: the rank of the level you have taken a skill to, through
// the same MOD_RANK_AT thresholds that rank titles. Nothing to keep in step.
//
// CONVERGENCE is the load-bearing one. Folding a skill HIDES it rather than
// removing it from you.skls, and that is not an implementation detail -- it is
// the whole reason the feature is safe:
//
//   * the game's skill panel only rebuilds when you.skls GROWS
//     (`let sklsize=you.skls.length; ... if(sklsize<you.skls.length)`), so a
//     shrink would leave orphaned rows on screen forever;
//   * giveSkExp pushes a skill back into you.skls on its next level-up, banner
//     and all, so a fold that removed it would undo itself;
//   * and the mod's allbuff wrappers walk `skl` by key, never you.skls, so a
//     folded skill goes on applying every buff it ever applied.
//
// The last point is the claim worth proving: "all of the buffs" has to be
// literally true, not re-implemented. So this measures stats across a fold.
//
//   PORT=8080 node tests/convergence.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the ten converged skills');
const conv = await p.evaluate(() => {
  const rows = [];
  for (let s = 1; s <= 10; s++) {
    const sk = MOD_CONVERGED[s];
    rows.push({
      s, id: sk.id, name: sk.name, type: sk.type,
      milestones: (sk.mlstn || []).length,
      capMapped: MOD_KEY_BY_ID[sk.id] === 'mod_conv' + s,
      grouped: MOD_PARENT_OF['mod_conv' + s] === MOD_PARENT_KEY[s],
      section: MOD_sectionOf(sk) === s
    });
  }
  // ids unique across the whole of skl
  const seen = {}, dup = [];
  for (const k in skl) { const i = skl[k].id; if (seen[i]) dup.push(i); seen[i] = k; }
  // exp and p are saved POSITIONALLY over `for..in skl`, so the aggregates must
  // sit at the END of skl or they shift every slot after them in an old save.
  const keys = Object.keys(skl);
  const convAt = keys.map((k, i) => skl[k]._modConverged ? i : -1).filter(i => i >= 0);
  const tail = convAt.length === 10 && Math.min(...convAt) === keys.length - 10;
  // an aggregate must take no titles -- section 24 skips anything without mlstn
  let titles = 0;
  for (const k in ttl) if (/^mod_t_mod_conv/.test(k)) titles++;
  return { rows, dup, tail, titles, total: keys.length };
});
conv.rows.forEach(r => console.log(`     ${r.s}  ${r.id}  ${r.name}`));
check(conv.rows.length === 10, 'one per section (10)');
check(conv.rows.every(r => r.section && r.type === r.s), 'each lands in its own section');
check(conv.dup.length === 0, `no id clashes anywhere in skl (${conv.dup.join(',') || 'none'})`);
check(conv.rows.every(r => r.capMapped), 'all ten are registered with the cap map');
check(conv.rows.every(r => r.grouped), 'and with the skill-panel grouping map');
check(conv.rows.every(r => r.milestones === 0), 'none has a perk ladder — they are not trained');
check(conv.titles === 0, `and none generates titles (${conv.titles})`);
check(conv.tail, 'all ten sit at the END of skl, where positional exp slots only append');

console.log('\n--- rarity is derived, not assigned');
const rar = await p.evaluate(() => {
  const out = MOD_RANK_AT.map(lv => { skl.fgt.lvl = lv; return MOD_skillRarityName(skl.fgt); });
  skl.fgt.lvl = 110;
  const top = { rank: MOD_skillRank(skl.fgt), viaTitle: MOD_rankForLevel(110) };
  skl.fgt.lvl = 1;
  return { names: MOD_SKILL_RAR.slice(), out, top, styles: MOD_SKILL_RAR.every((n, i) => !!MOD_rankStyle(i + 1).c) };
});
console.log('     ' + rar.out.join(' < '));
check(rar.names.length === 10, `ten rarities for the ten ranks (${rar.names.length})`);
check(rar.top.rank === rar.top.viaTitle,
  `rarity comes off MOD_rankForLevel, the same call titles use (both ${rar.top.rank})`);
check(new Set(rar.out).size === 10, 'each MOD_RANK_AT threshold lands on a different rarity');
check(rar.styles, 'and every rank has a colour to paint with');

console.log('\n--- folding costs a slip, lowest level first');
const fold = await p.evaluate(() => {
  global.flags.mod_folded = {}; global.flags.mod_slipsused = 0;
  // Upkeep: the smallest section, 3 skills
  const before = MOD_sectionFold(9);
  const none = MOD_fold(9);                       // no slips in hand
  giveItem(item.mod_slip, 2);
  const order = MOD_sectionSkills(9).slice()
    .sort((a, c) => (a.skill.lvl || 0) - (c.skill.lvl || 0)).map(e => e.key);
  const did = MOD_fold(9, 2);
  const map = MOD_foldedMap();
  return {
    before, none, did, held: MOD_slipsHeld(), used: MOD_slipsUsed(),
    after: MOD_sectionFold(9),
    tookLowestTwo: map[order[0]] === 1 && map[order[1]] === 1 && map[order[2]] !== 1,
    converged: MOD_sectionConverged(9),
    onSheet: you.skls.indexOf(MOD_CONVERGED[9]) >= 0
  };
});
check(fold.none === 0, 'folding with no slips in hand is refused');
check(fold.did === 2 && fold.after.folded === 2, `two slips folded two skills (${fold.did})`);
check(fold.held === 0 && fold.used === 2, `and both slips were spent (${fold.held} left)`);
check(fold.tookLowestTwo, 'it took the two lowest-level skills, not the first it found');
check(!fold.converged, 'a partly folded section is not converged');
check(fold.onSheet, 'the converged skill is on the sheet as soon as anything folds');

console.log('\n--- a fold never shortens you.skls');
const grow = await p.evaluate(() => {
  const before = you.skls.length;
  // Only the skills that were ON the sheet can be preserved -- a skill enters
  // you.skls the first time it levels, so most sit at level 0 and were never
  // there. The claim is that folding REMOVES nothing, not that everything is
  // present.
  const wasListed = MOD_sectionSkills(9).filter(e => you.skls.indexOf(e.skill) >= 0)
                                        .map(e => e.key);
  giveItem(item.mod_slip, 3);
  MOD_fold(9);                                   // finish Upkeep
  const after = you.skls.length;
  const keptListed = wasListed.every(k => you.skls.indexOf(skl[k]) >= 0);
  const hidden = MOD_sectionSkills(9).every(e => MOD_isFolded(e.skill));
  return { before, after, wasListed: wasListed.length, keptListed, hidden,
           converged: MOD_sectionConverged(9) };
});
check(grow.after >= grow.before,
  `you.skls did not shrink across a fold (${grow.before} -> ${grow.after})`);
check(grow.keptListed,
  `every folded skill that was on the sheet is still on it (${grow.wasListed} were) — hidden, not removed`);
check(grow.hidden, 'and every one of them reports as folded, so the panel hides the row');
check(grow.converged, 'the section is converged once the last one folds');

console.log('\n--- a folded skill keeps levelling, and the fold survives it');
const lvl = await p.evaluate(() => {
  const e = MOD_sectionSkills(9)[0];
  const was = e.skill.lvl;
  giveSkExp(e.skill, 1e7);                       // giveSkExp re-pushes on level-up
  return { was, now: e.skill.lvl, stillFolded: MOD_isFolded(e.skill),
           inList: you.skls.filter(s => s === e.skill).length };
});
check(lvl.now > lvl.was, `it still levels while folded (${lvl.was} -> ${lvl.now})`);
check(lvl.stillFolded, "and giveSkExp's re-add does not unfold it");
check(lvl.inList === 1, 'and it is in you.skls exactly once, not twice');

console.log('\n--- folding costs nothing mechanical: all of the buffs still apply');
const buffs = await p.evaluate(() => {
  global.flags.mod_folded = {};
  you.stat_r(); allbuff(you);
  const open = { str: you.str, int: you.int, agl: you.agl, spd: you.spd, hp: you.hpmax };
  // fold everything, every section
  for (let s = 1; s <= 10; s++) {
    const all = MOD_sectionSkills(s), map = MOD_foldedMap();
    all.forEach(e => { map[e.key] = 1; });
  }
  MOD_refreshConverged();
  you.stat_r(); allbuff(you);
  const folded = { str: you.str, int: you.int, agl: you.agl, spd: you.spd, hp: you.hpmax };
  const bonus = MOD_convergenceMult();
  // every stat must be exactly the open value times the convergence bonus --
  // nothing lost, nothing double-counted
  const exact = ['str', 'int', 'agl', 'spd'].every(k =>
    Math.abs(folded[k] - open[k] * bonus) < Math.max(open[k] * 1e-9, 1e-6));
  return { open, folded, bonus, exact, hpSame: folded.hp === open.hp };
});
console.log(`     STR ${buffs.open.str.toFixed(2)} -> ${buffs.folded.str.toFixed(2)} ` +
  `(convergence x${buffs.bonus.toFixed(4)})`);
check(buffs.exact,
  'every stat is exactly its unfolded value times the convergence bonus — no buff was lost');
check(buffs.bonus > 1, `converging all ten sections is worth something (x${buffs.bonus.toFixed(4)})`);
check(buffs.hpSame, 'and convergence deliberately leaves the body alone');

console.log('\n--- the bonus does not compound over refreshes or reloads');
const stable = await p.evaluate(() => {
  you.stat_r(); allbuff(you);
  const one = you.str;
  for (let i = 0; i < 200; i++) allbuff(you);
  const many = you.str;
  const bonusBefore = MOD_convergenceMult();
  const blob = save();
  let threw = '';
  try { load(blob); } catch (e) { threw = String(e).slice(0, 120); }
  MOD_refreshConverged();
  you.stat_r(); allbuff(you);
  // The claim is about the BONUS, not about you.str: load() re-fires every
  // milestone and re-seeds the parent skills, so the absolute stat legitimately
  // moves for reasons that have nothing to do with convergence. What must not
  // happen is the multiplier itself growing across a reload -- the way you.res
  // once did -- and that is what this measures.
  return { one, many, threw, bonusBefore, bonusAfter: MOD_convergenceMult(),
           foldedKept: Object.keys(MOD_foldedMap()).length };
});
check(Math.abs(stable.many - stable.one) < Math.max(stable.one * 1e-9, 1e-6),
  `200 allbuff refreshes do not stack it (drift ${(stable.many - stable.one).toExponential(1)})`);
check(!stable.threw, `save/load round-trips (${stable.threw || 'clean'})`);
check(stable.foldedKept > 0, `the folded state survives a reload (${stable.foldedKept} skills)`);
check(stable.bonusAfter === stable.bonusBefore,
  `the bonus is the same size after the reload, not doubled ` +
  `(x${stable.bonusBefore.toFixed(4)} -> x${stable.bonusAfter.toFixed(4)})`);

console.log('\n--- unfolding puts it all back');
const undo = await p.evaluate(() => {
  const n = MOD_unfold(9);
  return { n, left: MOD_sectionFold(9), anyFolded: MOD_sectionSkills(9).some(e => MOD_isFolded(e.skill)),
           offSheet: you.skls.indexOf(MOD_CONVERGED[9]) === -1 };
});
check(undo.n > 0 && undo.left.folded === 0, `unfold restores the section (${undo.n} skills)`);
check(!undo.anyFolded, 'and nothing there reports as folded any more');
check(undo.offSheet, 'the converged skill leaves the sheet with it');

console.log('\n--- the Archive, and the slip economy');
const shop = await p.evaluate(() => {
  global.flags.mod_slipsused = 0;
  const p0 = MOD_slipPrice();
  global.flags.mod_slipsused = 40;
  const p40 = MOD_slipPrice();
  global.flags.mod_slipsused = 100000;
  const capped = MOD_slipPrice();
  global.flags.mod_slipsused = 0;
  // the screen draws, and its choice lines fit the 22px row
  global.flags.dj1rw6 = true; global.flags.dj1end = true;
  chss.mod_slips.sl();
  const rows = [].slice.call(dom.ctr_2.children).map(c => c.textContent.trim());
  const tall = [].slice.call(dom.ctr_2.children)
    .filter(c => c.className && /chs/.test(c.className))
    .map(c => Math.round(c.scrollHeight / 22)).filter(n => n > 1).length;
  return { p0, p40, capped, cap: MOD_CONV.slipCap, rows,
           longest: Math.max(...rows.map(r => r.length)), tall,
           id: chss.mod_slips.id, item: { id: item.mod_slip.id, cls: MOD_itemClass(item.mod_slip.id) } };
});
shop.rows.forEach(r => console.log(`     "${r}"`));
check(shop.p40 > shop.p0, `the slip price climbs with use (${shop.p0} -> ${shop.p40})`);
check(shop.capped === shop.cap, `and stops at the cap (${shop.capped})`);
check(shop.longest < 55, `no choice line is long enough to wrap (longest ${shop.longest} chars)`);
check(shop.tall === 0, `and none of them actually wraps its 22px row (${shop.tall} do)`);
check(shop.item.cls === 'Material/Misc',
  `a Jade Slip is a tool, and its id says so (${shop.item.id} -> ${shop.item.cls})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — rarity is derived, and folding hides a skill without costing it anything.');
