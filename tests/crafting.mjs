import { launch } from './lib/browser.mjs';

// The crafting ladder (section 35).
//
// The audit that prompted it: across all 62 base-game recipes, by output
// rarity and by whether any giveRcp call can actually hand the recipe over,
// crafting reached 2 stars in practice. The only 3-star recipe is one nothing
// can teach and 5 stars had nothing at all. This checks the ladder that fills
// that in, and re-runs the audit so the claim stays true.
//
// Two of these checks are guarding real traps rather than being thorough:
//
//   * load() resolves a saved item id back to its namespace with
//     itemgroup[(id+1)/10000<<0]. An id in the wrong block restores as the
//     wrong object, or not at all.
//   * equip() does `w.wc = global.text.wecs[w.rar][0]`, and wecs has seven
//     entries. A rarity past 6 throws at the moment you put the thing on.
//
//   PORT=8080 node tests/crafting.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the audit, re-run against the live game');
const audit = await p.evaluate(() => {
  let src = '';
  for (const sc of document.scripts) if (!sc.src) src += sc.textContent;
  const base = {}, all = {}, orphans = [];
  for (const k in rcp) {
    const r = rcp[k];
    if (!r || typeof r !== 'object' || !r.res || !r.res.length) continue;
    let star = 1;
    r.res.forEach(e => { if (e.item && (e.item.rar || 1) > star) star = e.item.rar; });
    const mine = k.indexOf('mod_') === 0;
    const reachable = mine || new RegExp('giveRcp\\(\\s*rcp\\.' + k + '\\b').test(src);
    all[star] = (all[star] || 0) + 1;
    if (!mine) { base[star] = base[star] || { n: 0, ok: 0 }; base[star].n++; if (reachable) base[star].ok++; }
    if (!reachable) orphans.push(k);
  }
  return { base, all, orphans };
});
console.log('     base game, by output stars:',
  Object.entries(audit.base).map(([s, v]) => `${s}★ ${v.ok}/${v.n}`).join('  '));
check((audit.base[3] || { ok: 0 }).ok === 0,
  'the base game still cannot teach its only 3-star recipe (Trinity)');
check(!audit.base[5], 'and it has no 5-star recipe at all');
check(audit.orphans.length >= 15,
  `${audit.orphans.length} base-game recipes have no giveRcp anywhere — reported, not wired up`);
check((audit.all[5] || 0) >= 5, `with the ladder, ${audit.all[5] || 0} recipes now make 5-star things`);
check([2, 3, 4, 5].every(s => (audit.all[s] || 0) >= 5),
  `every rung from 2 to 5 has a full set (${[2, 3, 4, 5].map(s => audit.all[s]).join('/')})`);

console.log('\n--- ids land in the block their namespace is restored from');
// itemgroup = [item, wpn, eqp, sld, acc], indexed by (id+1)/10000<<0
const ids = await p.evaluate(() => {
  const blk = id => ((id + 1) / 10000) << 0;
  const out = { bad: [], rar: [] };
  const want = { item: 0, wpn: 1, eqp: 2, sld: 3, acc: 4 };
  MOD_MATERIALS.forEach(m => { if (blk(m[1]) !== 0) out.bad.push('item ' + m[3] + ' id ' + m[1]); });
  MOD_CRAFT_TIERS.forEach(T => {
    [['wpn', wpn['mod_w' + T.t]], ['eqp', eqp['mod_a' + T.t]], ['sld', sld['mod_s' + T.t]],
     ['acc', acc['mod_c' + T.t]], ['item', item['mod_t' + T.t]]].forEach(([ns, o]) => {
      if (blk(o.id) !== want[ns]) out.bad.push(ns + ' ' + o.name + ' id ' + o.id);
      if ((o.rar || 1) > 6) out.rar.push(o.name + ' rar ' + o.rar);
    });
  });
  out.wecs = global.text.wecs.length;
  out.maxRar = Math.max(...MOD_CRAFT_TIERS.map(T => wpn['mod_w' + T.t].rar));
  return out;
});
check(ids.bad.length === 0,
  ids.bad.length ? `wrong id block: ${ids.bad.join(', ')}` : 'all 32 new things sit in their own block');
check(ids.rar.length === 0 && ids.maxRar <= ids.wecs - 1,
  `top rarity is ${ids.maxRar} against ${ids.wecs} wecs entries — equip() cannot run off the end`);

console.log('\n--- the ladder is gated, and the door is on the Village Center');
const gate = async (flags) => p.evaluate(f => {
  Object.assign(global.flags, f);
  const draw = c => { clr_chs(); c.sl();
    return [...dom.ctr_2.querySelectorAll('.chs')].map(n => ({
      t: n.textContent.trim(), lines: Math.round(n.scrollHeight / 22) })); };
  return { village: draw(chss.lsmain1).map(x => x.t), digs: draw(chss.mod_digs) };
}, flags);

let g = await gate({ mod_t_deep: false, mod_t_cata: false, trne4e1: false,
                     mod_prog: { hollow: 0, spire: 0, vigil: 0 } });
check(!g.village.some(t => /Diggings/.test(t)), 'no Diggings before the deep forest');
check(g.digs.filter(r => /^"=>/.test(r.t)).length === 0, 'and every node inside is sealed');
check(g.digs.some(r => /sealed/.test(r.t)), 'each says so rather than being omitted');

g = await gate({ mod_t_deep: true });
check(g.village.some(t => /Diggings/.test(t)), 'the door opens with the catacombs rung');
check(g.village.some(t => /Enter Dojo/.test(t)) && g.village.some(t => /Message Board/.test(t)),
  "and the Village Center's own choices are untouched");
check(g.digs.filter(r => /^"=>/.test(r.t)).length === 1, 'exactly the 2-star node is open');

g = await gate({ mod_t_cata: true, trne4e1: true, mod_prog: { hollow: 99, spire: 99, vigil: 99 } });
check(g.digs.filter(r => /^"=>/.test(r.t)).length === 4, 'all four once the story is done');

console.log('\n--- and every line fits a 22px row');
const rows = await p.evaluate(() => {
  const out = [];
  const draw = c => { clr_chs(); c.sl();
    [...dom.ctr_2.querySelectorAll('.chs')].forEach(n => out.push({
      t: n.textContent.trim(), chars: n.textContent.trim().length,
      lines: Math.round(n.scrollHeight / 22) })); };
  Object.assign(global.flags, { mod_t_deep: true, mod_t_cata: false, trne4e1: false,
    mod_prog: { hollow: 0, spire: 0, vigil: 0 } });
  draw(chss.mod_digs);
  Object.assign(global.flags, { mod_t_cata: true, trne4e1: true,
    mod_prog: { hollow: 99, spire: 99, vigil: 99 } });
  draw(chss.mod_digs);
  MOD_CRAFT_TIERS.forEach(T => draw(chss['mod_node' + T.t]));
  return out;
});
const wrapped = rows.filter(r => r.lines > 1);
const longest = rows.reduce((a, r) => r.chars > a.chars ? r : a, { chars: 0, t: '' });
check(wrapped.length === 0, wrapped.length
  ? `these wrap: ${wrapped.map(r => `"${r.t}"`).join(', ')}`
  : `none of the ${rows.length} rows drawn wraps to a second line`);
check(longest.chars <= 55, `longest is ${longest.chars} chars — "${longest.t}"`);

console.log('\n--- gathering: only at a node, and it teaches the rung it belongs to');
const gather = await p.evaluate(() => {
  const out = {};
  global.lst_loc = 101;                       // the village
  out.condAway = act.mod_gather.cond(false);
  global.lst_loc = chss.mod_node3.id;
  out.condAtNode = act.mod_gather.cond(false);
  out.here = MOD_nodeHere() && MOD_nodeHere().t;
  skl.mng.lvl = 0; skl.glg.lvl = 0; skl.hvt.lvl = 0;
  out.chanceRaw = MOD_gatherChance();
  skl.mng.lvl = 110; skl.glg.lvl = 110; skl.hvt.lvl = 110;
  out.chanceMax = MOD_gatherChance();
  const known = () => MOD_CRAFT_RECIPES.filter(e => e.recipe.have).map(e => e.key);
  out.before = known();
  for (let i = 0; i < 300; i++) act.mod_gather.use();
  out.after = known();
  out.mats3 = ['ore', 'weave', 'ess'].map(l => MOD_MAT[l + 3].amount);
  out.mats5 = ['ore', 'weave', 'ess'].map(l => MOD_MAT[l + 5].amount);
  return out;
});
check(gather.condAway === false, 'the action refuses to run away from a node');
check(gather.condAtNode === true, 'and runs at one');
check(gather.chanceMax > gather.chanceRaw && gather.chanceMax <= 0.2,
  `find chance runs ${Math.round(gather.chanceRaw * 100)}% → ${Math.round(gather.chanceMax * 100)}% with the three skills`);
check(gather.mats3.every(n => n > 0), `the 3-star node yields all three of its lines (${gather.mats3.join('/')})`);
check(gather.mats5.every(n => n === 0), 'and none of another rung\'s');
check(gather.after.length - gather.before.length === 5,
  `the first find taught that rung's five blueprints (${gather.after.length - gather.before.length})`);

console.log('\n--- all twenty recipes make what they say, and the ladder chains');
const made = await p.evaluate(() => {
  MOD_MATERIALS.forEach(m => { try { giveItem(item[m[0]], 80); } catch (e) {} });
  [2, 3, 4, 5].forEach(t => MOD_learnTier(t));
  const out = { ok: [], bad: [], chain: null };
  // the 3-star weapon must be unmakeable until the 2-star one exists
  const held = o => { for (const k in inv) if (inv[k] && inv[k].id === o.id) return true; return false; };
  const test3 = make(rcp.mod_w3, true);
  out.chain = { needsPrev: rcp.mod_w3.rec.some(c => c.item === wpn.mod_w2),
                blockedNow: !rcp.mod_w3.rec.every((c, i) => test3.z[i] >= c.amount || test3.b[i] === true),
                haveW2: held(wpn.mod_w2) };
  [2, 3, 4, 5].forEach(t => ['w', 'a', 's', 'c', 't'].forEach(k => {
    const r = rcp['mod_' + k + t];
    try { make(r); out.ok.push(r.name); } catch (e) { out.bad.push(r.name + ': ' + e.message); }
  }));
  return out;
});
check(made.chain.needsPrev, 'the 3-star blade lists the 2-star blade as an ingredient');
check(made.chain.blockedNow && !made.chain.haveW2,
  'and cannot be made before you have one');
check(made.bad.length === 0,
  made.bad.length ? `these threw: ${made.bad.join('; ')}` : `all ${made.ok.length} recipes made their output`);

console.log('\n--- and every piece can actually be worn');
const worn = await p.evaluate(() => {
  const out = [];
  [2, 3, 4, 5].forEach(t => {
    [['wpn', 'mod_w'], ['eqp', 'mod_a'], ['sld', 'mod_s'], ['acc', 'mod_c']].forEach(([ns, pre]) => {
      const o = window[ns][pre + t];
      let held = null;
      for (const k in inv) if (inv[k] && inv[k].id === o.id) { held = inv[k]; break; }
      if (!held) { try { held = giveItem(o, 1); } catch (e) { out.push({ n: o.name, r: 'no copy' }); return; } }
      try { equip(held); out.push({ n: o.name, r: you.eqp[o.slot - 1].id === o.id ? 'ok' : 'not worn' }); }
      catch (e) { out.push({ n: o.name, r: 'THREW ' + e.message }); }
    });
  });
  return out;
});
check(worn.every(w => w.r === 'ok'),
  worn.filter(w => w.r !== 'ok').length
    ? `these did not: ${worn.filter(w => w.r !== 'ok').map(w => w.n + ' ' + w.r).join(', ')}`
    : `all ${worn.length} pieces equip, 5-star included`);

console.log('\n--- the economy points at crafting rather than at selling the ore');
const econ = await p.evaluate(() => {
  const rows = MOD_CRAFT_TIERS.map(T => {
    const r = rcp['mod_w' + T.t];
    const inputs = r.rec.reduce((a, c) => a + MOD_itemValue(c.item) * c.amount, 0);
    return { star: T.star, inputs: Math.round(inputs),
             out: Math.round(MOD_itemValue(wpn['mod_w' + T.t])),
             mat: Math.round(MOD_itemValue(MOD_MAT['ore' + T.t])) };
  });
  skl.mng.lvl = skl.glg.lvl = skl.hvt.lvl = 110;
  const top = MOD_CRAFT_TIERS[MOD_CRAFT_TIERS.length - 1];
  const avg = ['ore', 'weave', 'ess'].reduce((a, l) => a + MOD_itemValue(MOD_MAT[l + top.t]), 0) / 3;
  return { rows, gatherPerSec: avg * MOD_gatherChance() };
});
econ.rows.forEach(r => console.log(
  `     ${r.star}★  material ${String(r.mat).padStart(5)}   inputs ${String(r.inputs).padStart(6)}   blade ${String(r.out).padStart(6)}`));
check(econ.rows.every(r => r.out > r.inputs),
  'a finished blade is worth more than the pile it was made from, at every rung');
check(econ.gatherPerSec < 60,
  `gathering the top rung pays ~${Math.round(econ.gatherPerSec)}/s gross, ~${Math.round(econ.gatherPerSec * 0.25)}/s sold ` +
  `(endgame combat is ~1/s, so it is better but not a press)`);

console.log('\n--- materials and gear survive a save/load');
const round = await p.evaluate(() => {
  const before = { ore5: MOD_MAT.ore5.amount,
                   blade: (() => { let n = 0; for (const k in inv) if (inv[k] && inv[k].id === wpn.mod_w5.id) n++; return n; })(),
                   worn: you.eqp[0].id };
  const blob = save(true); load(blob);
  const after = { ore5: MOD_MAT.ore5.amount,
                  blade: (() => { let n = 0; for (const k in inv) if (inv[k] && inv[k].id === wpn.mod_w5.id) n++; return n; })(),
                  worn: you.eqp[0].id };
  return { before, after, recipesKept: MOD_CRAFT_RECIPES.filter(e => e.recipe.have).length };
});
check(round.after.ore5 === round.before.ore5,
  `the 5-star ore came back (${round.before.ore5} → ${round.after.ore5})`);
check(round.after.blade === round.before.blade,
  `and the blade with it (${round.before.blade} → ${round.after.blade})`);
check(round.after.worn === round.before.worn, 'still wearing what it was wearing');
check(round.recipesKept === 20, `all ${round.recipesKept} blueprints kept`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the ladder runs 2★ to 5★, is gated, gathered, craftable, wearable and saved.');
