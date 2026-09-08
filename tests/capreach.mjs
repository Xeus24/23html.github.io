import { chromium } from 'playwright';

// Can a skill actually REACH the story cap? Measures the game's own exp curve
// against the xp a skill really receives per tick through the mod's grant path
// (skill_xp_mult, parent pull, milestone xpBonus), for each cap tier.
//   PORT=8080 node tests/capreach.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

const R = await p.evaluate(() => {
  const probe = skl.wsdm;                       // a plain counter-driven added skill

  // ---- total xp to reach level L from 0, using the game's own curve --------
  const totalTo = (L) => { let t = 0; const s = probe; const keep = s.lvl;
    for (let l = 0; l < L; l++) { s.lvl = l; t += s.expnext(); }
    s.lvl = keep; return t; };

  // ---- what does a skill ACTUALLY receive per tick? -----------------------
  // intercept the uncapped grant so we see post-multiplier, post-parent xp
  let got = 0;
  const realGrant = MOD_giveSkExp_uncapped;
  MOD_giveSkExp_uncapped = function (sk, exp, res) { if (sk === probe) got += exp; return realGrant(sk, exp, res); };
  const perTick = (nominal) => { got = 0; probe.lvl = 5; giveSkExp(probe, nominal); return got; };
  const measured = { nominal_1: perTick(1), nominal_0_2: perTick(0.2) };
  MOD_giveSkExp_uncapped = realGrant;

  // rates actually used by the mod's own tick, per skill archetype
  const rates = MOD_EXTRA.map(d => ({
    key: d.key, name: d.name,
    perGrant: d.xp,                       // xp per counter-delta or per tick
    driver: d.counter ? ('counter ' + d.counter + (d.cap ? ' (cap ' + d.cap + '/tick)' : '')) : ('pred ' + d.pred)
  }));

  // effective xp per second for a *well-played* skill: predicate skills fire
  // every tick; counter skills fire on their per-tick cap when you are active.
  const eff = MOD_EXTRA.map(d => {
    const perEvent = d.xp * MOD.skill_xp_mult;
    const best = d.counter ? perEvent * (d.cap || 1) : perEvent;   // optimistic
    return { key: d.key, bestPerTick: best };
  });

  const curve = MOD_TIERS.map(t => ({ cap: t.cap, name: t.name, totalXp: totalTo(t.cap) }));

  return { curve, measured, rates, eff,
           xpMult: MOD.skill_xp_mult, maxSpeed: MOD.max_speed,
           singleLevelAt: [10, 20, 30, 50, 80, 109].map(l => {
             const keep = probe.lvl; probe.lvl = l; const c = probe.expnext(); probe.lvl = keep;
             return { fromLevel: l, cost: c }; }) };
});

const fmt = n => n >= 1e6 ? n.toExponential(2) : Math.round(n).toLocaleString();
const hours = s => s / 3600;
const human = h => h < 24 ? h.toFixed(1) + ' h'
  : h < 24 * 365 ? (h / 24).toFixed(1) + ' days'
  : (h / 24 / 365).toExponential(2) + ' years';

console.log(`skill xp multiplier: ${R.xpMult}x   max game speed: ${R.maxSpeed}x`);
console.log(`grant path check: nominal 1.0 xp arrives as ${R.measured.nominal_1}; nominal 0.2 arrives as ${R.measured.nominal_0_2}`);

console.log('\n=========== COST OF A SINGLE LEVEL ===========');
R.singleLevelAt.forEach(s => console.log(`  lv ${String(s.fromLevel).padStart(3)} -> ${String(s.fromLevel + 1).padStart(3)}   ${fmt(s.cost)} xp`));

console.log('\n=========== TOTAL XP TO REACH EACH CAP, AND TIME TO GET THERE ===========');
console.log('  (best-case xp/tick per skill, 1 tick/s; "at 20x" = max game speed)');
console.log('  cap        total xp        best xp/s     time @1x            time @20x');
const best = Math.max(...R.eff.map(e => e.bestPerTick));
R.curve.forEach(c => {
  const t1 = hours(c.totalXp / best), t20 = hours(c.totalXp / (best * R.maxSpeed));
  console.log(`  ${String(c.cap).padStart(3)}   ${fmt(c.totalXp).padStart(14)}   ${best.toFixed(2).padStart(10)}   ${human(t1).padStart(14)}   ${human(t20).padStart(14)}   ${c.name}`);
});

console.log('\n=========== TIME FOR EACH SKILL TO REACH LEVEL 110 ===========');
const to110 = R.curve[R.curve.length - 1].totalXp;
console.log('  skill   xp/tick        @1x            @20x');
R.eff.sort((a, b) => b.bestPerTick - a.bestPerTick).forEach(e => {
  const h1 = hours(to110 / e.bestPerTick), h20 = h1 / R.maxSpeed;
  const mo = h => (h / 24 / 30.44).toFixed(1) + ' mo';
  console.log(`  ${e.key.padEnd(6)} ${e.bestPerTick.toFixed(2).padStart(8)}   ${human(h1).padStart(12)} (${mo(h1).padStart(7)})   ${human(h20).padStart(12)}`);
});

console.log('\nerrors:', errs.length ? errs : 'none');
await b.close();
