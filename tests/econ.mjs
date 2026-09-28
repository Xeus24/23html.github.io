import { launch, settle } from './lib/browser.mjs';

// The economy with the original's coin drop (none), measured against what the
// ladder asks you to pay.
//
// Income per hour is measured at every story tier from the sources actually
// open there -- fighting in each area (the real swings a kill takes, through
// dmg_calc, for a player at that tier's cap, with the area's real drop table
// sold at the shops' rate) and gathering at each resource node -- and the best
// one is taken. Then every price the progression REQUIRES is held to one rule:
//
//     no required price costs more than 10% of the climb it gates,
//     counted in hours of the best income open when you get there
//
// (or one hour of it, where the climb is shorter than ten). A realm pill gates
// the Circulate Qi climb from the realm below. The Jade Slips gate nothing, so
// all hundred of them together are held to 10% of everything the game pays
// from the moment the Archive opens.
//
// Optional purchases -- the spirit pills and the Root Cleansing Pill -- are held
// to a day of that income from the tier where each becomes worth buying. The Qi
// Settling Pill costs the breakthrough pill it follows (section 48), so it is
// held with them.
//
// The rule is held on the Original preset, the default: his fights, no coin
// drop. "Mod before 4.2" (scaled fights, a 15% coin drop, and the old curve,
// whose early climbs are an hour long) is printed for comparison and not held
// to it -- it is kept exactly as it was, prices included.
//
//   PORT=8080 node tests/econ.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const errs = [];
const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

async function run(preset) {
  const p = await b.newPage();
  p.on('pageerror', e => errs.push(`[${preset}] ` + String(e).slice(0, 200)));
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await settle(p);
  const R = await p.evaluate((preset) => {
    setPacing(preset);
    const SAMPLES = 60;
    const freshYou = () => {
      you.lvl = 1; you.str_r = 1; you.agl_r = 1; you.int_r = 1; you.spd_r = 1;
      you.hp_r = 39; you.hpmax = 39; you.hp = 39; you.sat_r = 200; you.satmax = 200; you.sat = 200;
      you.stra = you.agla = you.inta = you.spda = you.hpa = you.sata = 0;
      you.strm = you.aglm = you.intm = you.spdm = you.hpm = you.satm = 1;
      you.stat_p = [1, 1, 1, 1]; you.mods.sbonus = 0; you.mods.cpwr = 1;
      for (const k in skl) { const s = skl[k]; if (!s || typeof s !== 'object') continue;
        s.lvl = 0; s.exp = 0; if (s.mlstn) s.mlstn.forEach(m => { m.g = false; }); }
      global.flags.mod_hpm = 1; global.flags.mod_satm = 1; global.flags.mod_realm = 0;
      you.stat_r();
    };
    const setTier = (ti) => {
      global.flags.tr3_win = ti >= 1;
      global.flags.mod_t_forest = ti >= 2; global.flags.mod_t_deep = ti >= 3;
      global.flags.mod_t_cata = ti >= 4; global.flags.trne1e1 = ti >= 5; global.flags.trne3e1 = ti >= 6;
      global.flags.trne4e1 = ti >= 6;
      global.flags.mod_prog = { hollow: ti >= 7 ? 99 : 0, spire: ti >= 8 ? 99 : 0, vigil: ti >= 9 ? 99 : 0 };
      MOD_CAP.current = -1; return MOD_levelCap();
    };
    const CHARLVL = [1, 8, 14, 20, 28, 36, 46, 60, 76, 92];
    const buildPlayer = (ti) => {
      freshYou(); const cap = setTier(ti);
      for (let i = 1; i < CHARLVL[ti]; i++) { try { lvlup(you, 1); } catch (e) {} }
      for (const k in skl) { const s = skl[k];
        if (!s || typeof s !== 'object' || k === 'rnwn') continue;
        s.lvl = cap;
        if (s.mlstn) s.mlstn.forEach(m => { m.g = false;
          if (m.lv <= cap) { try { m.f(); m.g = true; } catch (e) {} } }); }
      you.stat_r();
      global.flags.inside = true; global.flags.isday = true; global.flags.btl = false;
      global.flags.iscold = global.flags.iswet = global.flags.isdark = false;
      you.hp = you.hpmax; you.sat = you.satmax; allbuff(you);
      return cap;
    };
    const quiet = (fn) => { const g = giveSkExp, c = global.flags.crti; giveSkExp = function () {};
      try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; } };
    const mean = (a, d) => { let s = 0; for (let i = 0; i < SAMPLES; i++) { global.flags.crti = false;
      s += Math.max(0, Math.round(abl.default.f(a, d))); } return s / SAMPLES; };

    // The author's coin drop, averaged over its own rand() -- zero on Original.
    const coinPerKill = (m) => {
      const ch = you.mods.enmondren; if (!(ch > 0)) return 0;
      const lo = m.lvl << 0, hi = (m.lvl / 4) << 0, ex = (1 + m.rnk / 5) << 0;
      let s = 0; for (let v = Math.min(lo, hi); v <= Math.max(lo, hi); v++) s += 1 + v ** ex * you.mods.enmondrts;
      return ch * s / (Math.abs(lo - hi) + 1);
    };
    // One exchange a tick (index.html's ontick drives fght once a second), a
    // kill never shorter than a tick, and the next spawn on the next one.
    // Time spent getting your health back is charged as the share of it the
    // fight took: a kill at kill/die of 0.4 costs 40% more time.
    const areaIncome = (ak) => {
      const z = area[ak]; let perKill = 0, ticks = 0, wsum = 0;
      z.pop.forEach((e, i) => {
        const w = z.popc && z.popc[i] ? z.popc[i][1] - z.popc[i][0] : 1 / z.pop.length;
        const lv = Math.round((e.lvlmin + e.lvlmax) / 2);
        global.current_z = z; const m = mon_gen(e.crt); lvlup(m, lv);
        global.current_m = m; global.target = you.eqp[2]; global.t_n = 2;
        allbuff(you); allbuff(m);
        const hy = Math.max(0, Math.min(100, hit_calc(1))) / 100, hm = Math.max(0, Math.min(100, hit_calc(2))) / 100;
        let o, inc; quiet(() => { o = mean(you, m); inc = mean(m, you); });
        const kill = o * hy > 0 ? m.hpmax / (o * hy) : Infinity;
        const die = inc * hm > 0 ? you.hpmax / (inc * hm) : Infinity;
        const t = Math.max(1, Math.ceil(kill)) * (1 + Math.min(kill / die, 1)) + 1;
        let sell = 0; (e.crt.drop || []).forEach(d => { if (d.item) sell += (d.chance || 0) * MOD_sellPrice(d.item); });
        perKill += w * (sell + coinPerKill(m)); ticks += w * t; wsum += w;
      });
      (z.drop || []).forEach(d => { if (d.item) perKill += wsum * (d.c || 0) * MOD_sellPrice(d.item); });
      return { perKill: perKill / wsum, sec: ticks / wsum, perHour: perKill / wsum * 3600 / (ticks / wsum) };
    };
    // where each source first opens, by tier index (MOD_TIERS)
    const AREAS = { trn: 1, frstn1a2: 1, frstn2a2: 1, frstn1a3: 2, hmbsmnt: 2, frstn9a1: 3,
                    mod_hollow: 6, mod_spire: 7, mod_vigil: 8 };
    const NODES = { 2: 3, 3: 4, 4: 6, 5: 9 };           // node rung -> tier its gate opens at
    const tiers = [];
    for (let ti = 0; ti < 10; ti++) {
      const cap = buildPlayer(ti);
      const src = [];
      Object.keys(AREAS).forEach(ak => { if (AREAS[ak] <= ti && area[ak]) {
        const r = areaIncome(ak); src.push({ what: area[ak].name + ' (' + ak + ')', perHour: r.perHour, sec: r.sec, perKill: r.perKill }); } });
      Object.keys(NODES).forEach(t => { if (NODES[t] <= ti) {
        const ch = MOD_gatherChance();
        const per = [MOD_MAT['ore' + t], MOD_MAT['weave' + t], MOD_MAT['ess' + t]].map(it => MOD_sellPrice(it));
        const avg = per.reduce((a, x) => a + x, 0) / per.length;
        src.push({ what: MOD_craftTier(+t).node + ' (gathering)', perHour: ch * avg * 3600 }); } });
      src.sort((x, y) => y.perHour - x.perHour);
      tiers.push({ ti, cap, best: src[0] || { what: 'nothing', perHour: 0 }, src });
    }
    // realm climbs on the live curve, at Circulate Qi's own 0.9 a second
    const realms = MOD_REALMS.filter(r => r.n >= 2).map(r => {
      const prev = MOD_REALMS[r.n - 1];
      const hours = (MOD_xpToReach(r.qic) - MOD_xpToReach(prev.qic)) / 0.9 / 3600;
      // Neither shop is inside the dojo: the Herbalist is in the marketplace and
      // the Pill Tower on the Village Center, so a pill is bought at tier 1 at
      // the earliest, whatever tier its Qi Circulation level opens in.
      const ti = Math.max(MOD_TIERS.findIndex(t => t.cap >= r.qic), 1);
      const shops = [];
      [vendor.pha1, vendor.mod_pltwr].forEach(v => (v.items || []).forEach(e => {
        if (e.item === item['mod_bp' + r.n]) shops.push({ shop: v === vendor.pha1 ? 'Herbalist' : 'Pill Tower', p: e.p }); }));
      return { n: r.n, name: r.name, hours, ti, shops };
    });
    // the Archive opens with dj1rw6, the character level 30 rung: tier 4 here
    let slips = 0; for (let i = 0; i < 100; i++) slips += Math.min(Math.round(MOD_CONV.slipBase * Math.pow(MOD_CONV.slipStep, i)), MOD_CONV.slipCap);
    setTier(0);
    // Things you may buy rather than must: the spirit pills and the Root
    // Cleansing Pill. A spirit pill matters from the tier whose character level
    // costs at least what it grants (before that it is more than a whole level
    // and nobody needs it); the root pill from tier 1, when the root is rolled.
    const lvlCost = l => 4 * l ** 3 + l ** 2;
    const tierFor = exp => { for (let ti = 0; ti < CHARLVL.length; ti++) if (lvlCost(CHARLVL[ti]) >= exp) return ti; return CHARLVL.length - 1; };
    const optional = [];
    [vendor.pha1, vendor.mod_pltwr].forEach(v => (v.items || []).forEach(e => {
      const pill = MOD_PILLS.find(pp => item[pp[0]] === e.item);
      if (pill) optional.push({ name: e.item.name, p: e.p, ti: tierFor(pill[3]), why: `grants ${pill[3].toLocaleString()} exp` });
      else if (e.item === item.mod_rootpill) optional.push({ name: e.item.name, p: e.p, ti: 1, why: 'the root is rolled at tier 1' });
    }));
    return { tiers, realms, slips, slipsFrom: 4, optional, fights: getFights(), coin: MOD_MONEY.chance };
  }, preset);
  await p.close();
  return R;
}

const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
for (const preset of ['original', 'fast']) {
  const R = await run(preset);
  console.log(`\n=== pacing '${preset}': fights ${R.fights}, coin drop ${Math.round(R.coin * 100)}%`);
  console.log('   tier  cap  best income an hour, and where');
  R.tiers.forEach(t => console.log(`   ${String(t.ti).padStart(4)}  ${String(t.cap).padStart(3)}  ${fmt(t.best.perHour).padStart(8)}  ${t.best.what}` +
    (t.best.sec ? ` (${t.best.sec.toFixed(1)}s a kill, ${t.best.perKill.toFixed(1)} a kill)` : '')));
  console.log('   realm pill                      climb    budget     price   hours of income');
  R.realms.forEach(r => {
    const inc = R.tiers[r.ti].best.perHour;
    const budget = Math.max(r.hours * 0.10, 1) * inc;
    r.shops.forEach(s => {
      const hrs = s.p / inc;
      console.log(`   ${String(r.n).padStart(2)} ${r.name.padEnd(26)} ${(r.hours.toFixed(0) + 'h').padStart(6)}  ${fmt(budget).padStart(8)}  ${fmt(s.p).padStart(8)}  ${hrs.toFixed(1)}h (${s.shop})`);
      if (preset === 'original') check(s.p <= budget, `[${preset}] realm ${r.n} pill at the ${s.shop}: ${fmt(s.p)} is ${hrs.toFixed(1)}h of income, ` +
        `inside 10% of a ${r.hours.toFixed(0)}h climb`);
    });
    if (!r.shops.length) console.log(`   ${String(r.n).padStart(2)} ${r.name.padEnd(26)} (not sold)`);
  });
  // everything the game pays from the Archive opening to the top: each realm's
  // climb at the income of the tier it opens in
  let pays = 0; R.realms.forEach(r => { if (r.ti >= R.slipsFrom) pays += r.hours * R.tiers[r.ti].best.perHour; });
  console.log(`   all 100 Jade Slips: ${fmt(R.slips)}, against ${fmt(pays)} earned from the Archive to the cap`);
  console.log('   optional                          price   from tier   hours of income');
  R.optional.forEach(o => {
    const hrs = o.p / R.tiers[o.ti].best.perHour;
    console.log(`   ${o.name.padEnd(30)} ${fmt(o.p).padStart(8)}   ${String(o.ti).padStart(9)}   ${hrs.toFixed(1)}h  (${o.why})`);
    if (preset === 'original') check(hrs <= 24, `[${preset}] ${o.name}: ${fmt(o.p)} is ${hrs.toFixed(1)}h of income when it becomes worth buying, inside a day`);
  });
  if (preset === 'original') check(R.slips <= pays * 0.10, `[${preset}] folding every skill is ${(R.slips / pays * 100).toFixed(1)}% of that, inside 10%`);
}

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors');
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — on Original pacing every price the ladder requires is inside 10% of the climb it gates.');
