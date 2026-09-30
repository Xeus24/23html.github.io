import { launch, settle } from './lib/browser.mjs';

// Skill rarity is colour, and colour alone fails colour-blind players. Each row's
// name carries a grade number (rank 2 and up) drawn by CSS from an attribute, so
// the game's per-second innerHTML rewrite of the name cannot remove it and the
// name text stays plain.
//
//   PORT=8080 node tests/grademark.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);
const r = await p.evaluate(async () => {
  const sk = you.skls.find(s => s.lvl >= 0 && !s._modConverged && !s._modParent) || you.skls[0];
  const tick = () => new Promise(r => setTimeout(r, 1300));
  dom.ct_bt2.click(); MOD_redrawSkills(); MOD_repaintSkillRows();
  const idx = you.skls.indexOf(sk);
  const el = () => dom.skcon.children[idx].children[0];
  sk.lvl = 1; MOD_repaintSkillRows(); const low = el().getAttribute('data-mod-grade');
  sk.lvl = 110; MOD_repaintSkillRows();
  const high = el().getAttribute('data-mod-grade'), want = String(MOD_skillRank(sk));
  const before = el().textContent;
  await tick();                       // the game's updater rewrites the name
  const after = { attr: el().getAttribute('data-mod-grade'), text: el().textContent };
  const pseudo = getComputedStyle(el(), '::after').content;
  return { low, high, want, before, after, pseudo };
});
console.log(r);
check(r.low === null, 'rank 1 shows no marker');
check(r.high === r.want && +r.want > 1, `a level 110 skill carries its rank (${r.want})`);
check(r.after.attr === r.want, 'the marker survives the game\'s per-second rewrite');
check(/lvl: 110$/.test(r.after.text), 'the name text itself has no marker in it');
check(r.pseudo.includes(r.want), 'CSS draws it');
check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
