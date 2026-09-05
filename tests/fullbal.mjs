import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/fullbal.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,200)));
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);

const R = await p.evaluate(()=>{
  // ---------- helpers -------------------------------------------------------
  const BASE = ()=>{
    you.int_r=100; you.str_r=100; you.agl_r=100; you.spd_r=100; you.hp_r=1000; you.sat_r=1000;
    you.inta=you.stra=you.agla=you.spda=you.hpa=you.sata=0;
    you.intm=you.strm=you.aglm=you.spdm=you.hpm=you.satm=1;
    you.exp_t=1; you.mods.sbonus=0; you.mods.cpwr=1; you.stat_p=[1,1,1,1];
  };
  const setTier = (cap)=>{
    global.flags.mod_t_forest = cap>=20; global.flags.mod_t_deep = cap>=30;
    global.flags.mod_t_cata = cap>=40; global.flags.trne1e1 = cap>=50;
    global.flags.trne3e1 = cap>=60;
    global.flags.mod_prog = {hollow: cap>=75?99:0, spire: cap>=90?99:0, vigil: cap>=110?99:0};
    MOD_CAP.current = -1; return MOD_levelCap();
  };
  const clearSkills = ()=>{ for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object') continue;
    s.lvl=0; s.exp=0; if(s.mlstn) s.mlstn.forEach(m=>m.g=false); } };
  const IS_MINE = id => (id>=901&&id<=913)||(id>=1001&&id<=1100)||(id>=2001&&id<=2010)||id===2100;

  // set skills to L; `which` = 'all' | 'base' | 'mine'
  const levelTo = (L, which, fireMilestones=true)=>{
    for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object'||k==='rnwn') continue;
      const mine = IS_MINE(s.id);
      const want = which==='all' || (which==='base'&&!mine) || (which==='mine'&&mine);
      s.lvl = want ? L : 0; s.exp=0;
      if(s.mlstn) s.mlstn.forEach(m=>{ m.g=false;
        if(want && fireMilestones && m.lv<=L){ try{ m.f(); m.g=true; }catch(e){} } });
    }
  };
  const neutral = ()=>{ global.flags.inside=true; global.flags.isday=true;
    global.flags.btl=false; global.flags.iscold=false; global.flags.iswet=false;
    you.hp=you.hpmax; you.sat=you.satmax; };
  const favourable = ()=>{ global.flags.inside=false; global.flags.isday=false;
    global.flags.btl=true; global.flags.iscold=true;
    you.hp=Math.floor(you.hpmax*0.15); you.sat=0; };
  const titles = (on)=>{ Object.keys(ttl).forEach(k=>{ ttl[k].have=!!on; }); MOD_updateRenown(); };

  const measure = (cap, which, cond, withTitles)=>{
    BASE(); clearSkills(); setTier(cap); titles(withTitles);
    levelTo(cap, which);
    you.stat_r(); cond===2?favourable():neutral(); allbuff(you);
    return {str:you.str, int:you.int, hp:you.hpmax};
  };

  const enemy = (key)=>{ const e=area[key].pop[0];
    const lv=Math.round((e.lvlmin+e.lvlmax)/2);
    const c=mon_gen(e.crt); lvlup(c,lv); return {str:c.str, hp:c.hpmax, lv:c.lvl}; };

  const STAGES = [[10,'frstn1a3','Western Woods'],[20,'frstn9a1','Deep Woods'],
                  [30,'frstn2a2','Forest, far'],[40,'hmbsmnt','Catacombs era'],
                  [50,'trne2','Golem arena II'],[60,'trne4','Golem arena IV'],
                  [75,'mod_hollow','Sunken Hollow'],[90,'mod_spire','Ashen Spire'],
                  [110,'mod_vigil','Long Vigil']];

  // ---------- 1. combat -----------------------------------------------------
  const combat = STAGES.map(([cap,ak,nm])=>{
    if(!area[ak]) return {nm, missing:true};
    const N = measure(cap,'all',1,false);
    const F = measure(cap,'all',2,false);
    const T = measure(cap,'all',1,true);
    const e = enemy(ak);
    const k = s=>Math.max(1,Math.ceil(e.hp/Math.max(s.str,1)));
    const d = s=>Math.max(1,Math.ceil(s.hp/Math.max(e.str,1)));
    return {nm, cap, elv:e.lv, killN:k(N), dieN:d(N), killF:k(F), killT:k(T), dieT:d(T)};
  });

  // ---------- 2. power attribution ------------------------------------------
  const attribution = [10,40,110].map(cap=>{
    const baseOnly = measure(cap,'base',1,false);
    const mineOnly = measure(cap,'mine',1,false);
    const both     = measure(cap,'all',1,false);
    const bothT    = measure(cap,'all',1,true);
    const bothF    = measure(cap,'all',2,false);
    return {cap,
      vanillaSkills: Math.round(baseOnly.str),
      addedSkillsAlone: Math.round(mineOnly.str),
      combined: Math.round(both.str),
      plusMaxRenown: Math.round(bothT.str),
      plusConditions: Math.round(bothF.str),
      addedShare: +(((both.str - baseOnly.str)/both.str)*100).toFixed(0),
      renownAdds: +(((bothT.str/both.str)-1)*100).toFixed(0),
      conditionsAdd: +(((bothF.str/both.str)-1)*100).toFixed(0)};
  });

  // ---------- 3. xp pacing --------------------------------------------------
  BASE(); clearSkills(); setTier(110); titles(false);
  const pacing = [1,5,10,20,40].map(from=>{
    const sk = skl.bstl; sk.lvl=from; sk.exp=0; sk.expnext_t=sk.expnext();
    sk.mlstn.forEach(m=>m.g=false);
    const par = skl[MOD_PARENT_OF['bstl']]; par.lvl=0;
    let ticks=0; const target=from+1;
    while(sk.lvl<target && ticks<5e6){ giveSkExp(sk, 1); ticks++; }
    return {fromLevel:from, xpAtRate1: ticks};
  });

  // ---------- 4. economy ----------------------------------------------------
  const DFL = MOD_VAL.defaultDfl;
  const econ = ['frstn1a2','frstn9a1','hmbsmnt','mod_hollow','mod_spire','mod_vigil']
    .filter(k=>area[k]).map(k=>{
      const a=area[k]; let exp=0;
      a.pop.forEach(pop=>{
        const w = pop.c===undefined ? 1/a.pop.length : pop.c;
        let e=0; (pop.crt.drop||[]).forEach(d=>{ if(d.item) e += (d.chance||0)*MOD_itemValue(d.item)*DFL; });
        const lvl=(pop.lvlmin+pop.lvlmax)/2||1;
        e += MOD_MONEY.chance*(1+lvl*0.625);
        exp += w*e;
      });
      (a.drop||[]).forEach(d=>{ if(d.item) exp += (d.c||0)*MOD_itemValue(d.item)*DFL; });
      return {nm:(a.name||k).slice(0,20), perKill:+exp.toFixed(1)};
    });
  const prices=[]; for(const v in vendor) (vendor[v].items||[]).forEach(e=>{ if(typeof e.p==='number') prices.push(e.p); });
  prices.sort((a,b)=>a-b);

  // ---------- 5. dominance check -------------------------------------------
  BASE(); clearSkills(); setTier(110); titles(false); levelTo(110,'all');
  you.stat_r(); neutral(); allbuff(you);
  const full = you.str;
  const singles = [];
  ['kllr','brsr','cnd','scar','grit','rnwn'].forEach(key=>{
    BASE(); clearSkills(); setTier(110); titles(key==='rnwn');
    if(key!=='rnwn'){ const s=skl[key]; s.lvl=110; s.mlstn.forEach(m=>{ if(m.lv<=110){ try{m.f();m.g=true}catch(e){} } }); }
    you.stat_r(); neutral(); allbuff(you);
    singles.push({key, strFromThisAlone: Math.round(you.str)});
  });

  return {combat, attribution, pacing, econ,
          priceMedian: prices[prices.length>>1], priceMax: prices[prices.length-1],
          fullStr: Math.round(full), singles};
});

console.log('=========== COMBAT (neutral conditions, no titles) ===========');
console.log('  cap  area              elv   kill  die     kill w/conditions   kill w/Renown10  die w/Renown10');
R.combat.forEach(c=>{ if(c.missing) return console.log('   '+c.nm+' MISSING');
  console.log(`  ${String(c.cap).padStart(3)}  ${c.nm.padEnd(16)} ${String(c.elv).padStart(3)}   ${String(c.killN).padStart(4)} ${String(c.dieN).padStart(4)}        ${String(c.killF).padStart(4)}              ${String(c.killT).padStart(4)}            ${c.dieT}`);
});

console.log('\n=========== WHERE THE POWER COMES FROM (STR) ===========');
R.attribution.forEach(a=>{
  console.log(`  cap ${a.cap}: vanilla skills ${a.vanillaSkills} | added skills alone ${a.addedSkillsAlone} | together ${a.combined}`);
  console.log(`          added skills are ${a.addedShare}% of total | max Renown +${a.renownAdds}% | best conditions +${a.conditionsAdd}%`);
});

console.log('\n=========== XP PACING (raw xp to gain one level) ===========');
R.pacing.forEach(x=>console.log(`  lv ${String(x.fromLevel).padStart(2)} -> ${x.fromLevel+1}:  ${x.xpAtRate1} xp`));

console.log('\n=========== ECONOMY ===========');
R.econ.forEach(e=>console.log(`  ${e.nm.padEnd(22)} ${String(e.perKill).padStart(6)} per kill`));
console.log(`  vendor prices: median ${R.priceMedian}, max ${R.priceMax}`);

console.log('\n=========== DOMINANCE (one skill at lv110, alone, vs 100 base STR) ===========');
R.singles.forEach(s=>console.log(`  ${s.key.padEnd(6)} ${String(s.strFromThisAlone).padStart(6)}`));
console.log(`  all skills together: ${R.fullStr}`);
console.log('\nerrors:', errs.length?errs:'none');
await b.close();
