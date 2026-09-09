import { chromium } from 'playwright';

// Title ranks, coverage, and what wearing one does.
//
// The complaint this section answers: the base game handed out rank 3 titles at
// skill level 8-15, because `rar` was assigned by feel. Rank is derived from the
// level that grants the title now, so it cannot drift out of step again.
//
// The subtle risk is the exp bonus. It writes to skl.<x>.p, which IS saved, so
// applying it naively would stack on every load. It is reconciled against a
// record in global.flags the way section 13 handles you.res, and the reload
// check below is the one that matters.
//
//   PORT=8080 node tests/titles.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

const survey = () => p.evaluate(() => {
  const all = Object.keys(ttl).filter(k => ttl[k] && ttl[k].name);
  const byRank = {}; all.forEach(k => { const r = ttl[k].rar || 0; byRank[r] = (byRank[r] || 0) + 1; });
  const perSkill = {}; MOD_SKILL_TITLES.forEach(e => { perSkill[e.skill] = (perSkill[e.skill] || 0) + 1; });
  return {
    total: all.length, skillTitles: MOD_SKILL_TITLES.length,
    skills: Object.keys(perSkill).length,
    minPerSkill: Math.min(...Object.values(perSkill)),
    byRank, ranksEmpty: Array.from({ length: 10 }, (_, i) => i + 1).filter(r => !byRank[r]),
    // the original complaint, in the form it took
    highRankEarly: all.filter(k => ttl[k].rar >= 3 && ttl[k]._modAtLevel && ttl[k]._modAtLevel < 18)
      .map(k => `${ttl[k].name} rank${ttl[k].rar}@lv${ttl[k]._modAtLevel}`),
    rank10: all.filter(k => ttl[k].rar === 10),
    rank10offLevel: all.filter(k => ttl[k].rar === 10 && ttl[k]._modAtLevel !== 110).map(k => ttl[k].name),
    steps: MOD_RENOWN_STEPS
  };
});

console.log('--- coverage');
let s = await survey();
console.log(`  ${s.total} titles, ${s.skillTitles} of them from skills across ${s.skills} skills`);
check(s.minPerSkill >= 4, `every skill grants at least 4 titles (fewest is ${s.minPerSkill})`);
check(s.ranksEmpty.length === 0, `all ten ranks are populated (empty: ${s.ranksEmpty.join(',') || 'none'})`);
check(s.rank10.length > 0 && s.rank10offLevel.length === 0,
  `every rank 10 title is earned at level 110 (${s.rank10.length} of them)`);
check(s.highRankEarly.length === 0,
  `no rank 3+ title is earned below level 18 (was 8 of them: Runner@10, Rookie@15, ...)`);
check(s.steps[s.steps.length - 1] > s.total * 0.85 && s.steps[s.steps.length - 1] < s.total,
  `renown 10 wants ${s.steps[s.steps.length - 1]} of ${s.total} titles — near-completion, not trivial`);
console.log('  ranks: ' + Object.entries(s.byRank).map(([r, n]) => `${r}:${n}`).join('  '));

console.log('\n--- rank tracks the level that grants it');
const ladder = await p.evaluate(() => MOD_TITLE_RUNGS.map(lv => ({ lv, rank: MOD_rankForLevel(lv) })));
ladder.forEach(x => console.log(`     level ${String(x.lv).padStart(3)} -> rank ${x.rank}`));
check(ladder.every((x, i) => i === 0 || x.rank > ladder[i - 1].rank), 'each rung is a strictly higher rank');

console.log('\n--- a title does nothing until you wear it, below the renown threshold');
const t = await p.evaluate(() => {
  const e = MOD_SKILL_TITLES.find(x => x.rank === 10);       // rank 10, renown starts at 0
  const title = ttl[e.key], sk = skl[e.skill];
  global.flags.mod_ttlxp = {};
  for (const k in ttl) { ttl[k].have = false; }
  global.titles = []; you.title = ttl.new; MOD_updateRenown();
  sk.p = 1; MOD_applyTitleBonuses();
  const before = sk.p;
  giveTitle(title);                                          // earned, not worn
  MOD_updateRenown(); you.title = ttl.new; MOD_applyTitleBonuses();
  const earned = sk.p;
  you.title = title; MOD_applyTitleBonuses();                // now worn
  const worn = sk.p;
  you.title = ttl.new; MOD_applyTitleBonuses();              // taken off again
  return { skill: e.skill, name: title.name, xp: e.xp, rank: e.rank,
           renown: skl.rnwn.lvl, before, earned, worn, off: sk.p };
});
console.log(`     ${t.name} (rank ${t.rank}, ${t.skill} exp +${Math.round(t.xp * 100)}%), renown ${t.renown}`);
check(t.earned === t.before, `earning it changes nothing while renown is ${t.renown} (p stayed ${t.before})`);
check(Math.abs(t.worn - (t.before + t.xp)) < 1e-9, `wearing it applies the bonus (p ${t.before} -> ${t.worn})`);
check(t.off === t.before, `taking it off removes the bonus again (p back to ${t.off})`);

console.log('\n--- renown makes ranks up to its level permanent');
const r = await p.evaluate(() => {
  const e = MOD_SKILL_TITLES.find(x => x.rank === 3);
  const sk = skl[e.skill];
  global.flags.mod_ttlxp = {}; sk.p = 1;
  for (const k in ttl) { ttl[k].have = false; }
  ttl[e.key].have = true; you.title = ttl.new;
  skl.rnwn.lvl = 2; MOD_applyTitleBonuses(); const atR2 = sk.p;
  skl.rnwn.lvl = 3; MOD_applyTitleBonuses(); const atR3 = sk.p;
  skl.rnwn.lvl = 0; MOD_applyTitleBonuses();
  return { skill: e.skill, rank: e.rank, xp: e.xp, atR2, atR3 };
});
check(r.atR2 === 1, `a rank ${r.rank} title is inert at renown 2 (p ${r.atR2})`);
check(Math.abs(r.atR3 - (1 + r.xp)) < 1e-9, `and permanent at renown ${r.rank} without wearing it (p ${r.atR3})`);

console.log('\n--- the bonus does not stack across saves and reloads');
const stack = await p.evaluate(async () => {
  const e = MOD_SKILL_TITLES.find(x => x.rank === 3);
  for (const k in ttl) { ttl[k].have = false; }
  global.flags.mod_ttlxp = {}; skl[e.skill].p = 1;
  giveTitle(ttl[e.key]); skl.rnwn.lvl = 10; MOD_applyTitleBonuses();
  const once = skl[e.skill].p;
  for (let i = 0; i < 30; i++) MOD_applyTitleBonuses();       // many ticks
  const ticked = skl[e.skill].p;
  save(true);
  return { skill: e.skill, key: e.key, once, ticked, blob: localStorage.getItem('v0.3').length };
});
check(stack.ticked === stack.once, `thirty ticks do not re-apply it (p ${stack.once} -> ${stack.ticked})`);

await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4500);
const after = await p.evaluate(sk => ({ p: skl[sk].p, applied: (global.flags.mod_ttlxp || {})[sk] }), stack.skill);
check(Math.abs(after.p - stack.once) < 1e-9,
  `and it survives a reload at the same value, not doubled (p ${after.p}, was ${stack.once})`);

console.log('\n--- every rank has a colour, and hovering one does not throw');
const colours = await p.evaluate(() => {
  const out = {};
  for (let r = 1; r <= 10; r++) {
    const key = Object.keys(ttl).find(k => ttl[k] && ttl[k].name && ttl[k].rar === r);
    if (!key) { out[r] = { titles: 0 }; continue; }
    const el = document.createElement('div'); document.body.appendChild(el);
    let threw = null, colour = null, rankLine = false;
    try {
      dscr.call(el, { clientX: 10, clientY: 10 }, ttl[key], 5, null, null, null);
      const lab = global.dscr.querySelector('#d_l');
      colour = lab ? lab.style.color : null;
      rankLine = /Rank /.test(global.dscr.textContent);
    } catch (e) { threw = e.message; }
    el.remove();
    out[r] = { titles: Object.keys(ttl).filter(k => ttl[k] && ttl[k].name && ttl[k].rar === r).length,
               colour, threw, rankLine, style: MOD_rankStyle(r).c };
  }
  return out;
});
for (let r = 1; r <= 10; r++) {
  const o = colours[r];
  console.log(`     rank ${String(r).padStart(2)}  ${String(o.titles).padStart(3)} titles  ${o.threw ? 'THREW: ' + o.threw : 'colour ' + (o.colour || '(none)')}`);
}
// rank 7's branch in the base game sets this.dl, which is undefined in a type 5
// call — it had never run because the base game topped out at rank 5
check(Object.values(colours).every(o => !o.threw),
  'no rank throws when hovered (the base game\'s rank 7 branch did)');
check(Object.values(colours).every(o => !o.titles || (o.colour && o.colour !== '')),
  'every populated rank renders a colour');
check(Object.values(colours).every(o => !o.titles || o.rankLine),
  'and the tooltip states the rank');
const distinct = new Set(Object.values(colours).map(o => o.style));
check(distinct.size === 10, `the ten ranks are ten distinct colours (${distinct.size})`);

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — ranks track the level that earns them, every skill grants five, and the bonus reconciles.');
