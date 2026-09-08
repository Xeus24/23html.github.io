import { chromium } from 'playwright';

// Every skill must have perks all the way up the ladder it can now climb.
//
// Section 19 made level 110 genuinely reachable; section 22 filled in what is
// waiting there. Before it, 81 of 94 skills gave nothing at all between level
// 51 and 110 — the whole top half. This guards against that coming back, and
// against a perk being added at a level that breaks the save's index ordering.
//
//   PORT=8080 node tests/perkcoverage.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  const rows = [];
  for (const k in skl) {
    const s = skl[k];
    if (!s || typeof s !== 'object' || !s.name) continue;
    const lv = (s.mlstn || []).map(m => m.lv);
    rows.push({
      k, name: s.name, type: s.type, n: lv.length,
      max: lv.length ? Math.max(...lv) : 0,
      ascending: lv.every((v, i) => i === 0 || v > lv[i - 1]),
      // the biggest gap between consecutive perks, below the cap
      gap: lv.length < 2 ? (lv.length ? lv[0] : 0)
        : Math.max(lv[0], ...lv.slice(1).map((v, i) => v - lv[i])),
      blank: (s.mlstn || []).filter(m => !m.p || !String(m.p).trim()).length
    });
  }
  return { rows, caps: MOD_TIERS.map(t => t.cap), ladder: MOD_LADDER, top: MOD_CAP.max || 110 };
});

const TOP = Math.max(...R.caps);
const skipped = ['rnwn'];                      // driven by titles, not levels
const graded = R.rows.filter(r => !skipped.includes(r.k));

const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log(`cap ladder tops out at ${TOP}; perk ladder is ${R.ladder.join('/')}`);
console.log(`${R.rows.length} skills, ${graded.length} graded (skipping ${skipped.join(', ')})\n`);

const none = graded.filter(r => r.n === 0);
const short = graded.filter(r => r.max < TOP);
const badOrder = graded.filter(r => !r.ascending);
const blanks = graded.filter(r => r.blank > 0);
const gappy = graded.filter(r => r.gap > 40);

check(none.length === 0, `every graded skill has at least one perk (${none.length} without)`);
if (none.length) console.log('        ' + none.map(r => r.k).join(' '));

check(short.length === 0, `every graded skill has a perk at the top of the ladder, ${TOP} (${short.length} short)`);
if (short.length) console.log('        ' + short.map(r => `${r.k}(max ${r.max})`).join(' '));

check(badOrder.length === 0, `perk levels ascend everywhere (${badOrder.length} broken)`);
if (badOrder.length) console.log('        ' + badOrder.map(r => r.k).join(' '));

check(blanks.length === 0, `every perk has text (${blanks.length} skills with blank perks)`);
check(gappy.length === 0, `no skill has a gap over 40 levels between perks (${gappy.length} do)`);
if (gappy.length) console.log('        ' + gappy.map(r => `${r.k}(gap ${r.gap})`).join(' '));

// the cap rungs are where a new story tier lands you, so they should pay off
console.log('\n  perks available at each story cap:');
R.caps.forEach(cap => {
  const withOne = graded.filter(r => r.max >= cap).length;
  console.log(`     cap ${String(cap).padStart(3)}   ${withOne}/${graded.length} skills have a perk at or above it`);
});

console.log('\n  coverage by type:');
const byType = {};
graded.forEach(r => { (byType[r.type] = byType[r.type] || []).push(r); });
Object.keys(byType).sort((a, b) => a - b).forEach(t => {
  const g = byType[t];
  console.log(`     type ${String(t).padStart(2)}  ${String(g.length).padStart(2)} skills   ` +
    `perks ${Math.min(...g.map(r => r.n))}-${Math.max(...g.map(r => r.n))}   ` +
    `top ${Math.min(...g.map(r => r.max))}-${Math.max(...g.map(r => r.max))}`);
});

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log(`\nPASS — every skill has relevant perks all the way to ${TOP}.`);
