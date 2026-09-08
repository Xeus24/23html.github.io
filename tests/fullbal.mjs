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
  const setTier = (ti)=>{
    global.flags.mod_t_forest = ti>=2; global.flags.mod_t_deep = ti>=3;
    global.flags.mod_t_cata = ti>=4; global.flags.trne1e1 = ti>=5;
    global.flags.trne3e1 = ti>=6;
    global.flags.mod_prog = {hollow: ti>=7?99:0, spire: ti>=8?99:0, vigil: ti>=9?99:0};
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

  const measure = (ti, which, cond, withTitles)=>{
    BASE(); clearSkills(); const cap = setTier(ti); titles(withTitles);
    levelTo(cap, which);          // "every skill at the cap" — now an attainable state
    you.stat_r(); cond===2?favourable():neutral(); allbuff(you);
    return {str:you.str, int:you.int, hp:you.hpmax};
  };

  // Real combat math, not the enemyHP/playerSTR ratio this used to use. That
  // proxy ignores dmg_calc's subtraction and reads several times off — see the
  // header of tests/combat.mjs.
  const enemy = (key)=>{ const e=area[key].pop[0];
    const lv=Math.round((e.lvlmin+e.lvlmax)/2);
    global.current_z = area[key];
    const c=mon_gen(e.crt); lvlup(c,lv); return c; };
  // dmg_calc grants skill exp (seye on a crit, the affinity skills on incoming
  // damage) and can set the crit flag. Sampling it thousands of times would
  // level the player mid-sweep and quietly invalidate everything measured after
  // — the mod's own MOD_scaleEnemy parks these for the same reason.
  const quiet = (fn) => {
    const g = giveSkExp, c = global.flags.crti;
    giveSkExp = function () {};
    try { return fn(); } finally { giveSkExp = g; global.flags.crti = c; }
  };

  const fight = (c)=>{
    global.current_m = c; global.target = you.eqp[2]; global.t_n = 2;
    allbuff(you); allbuff(c);
    const hy = Math.max(0,Math.min(100,hit_calc(1)))/100;
    const hm = Math.max(0,Math.min(100,hit_calc(2)))/100;
    let o=0,i2=0; const N=120;
    quiet(()=>{ for(let i=0;i<N;i++){ o+=Math.max(0,Math.round(abl.default.f(you,c)));
                                      i2+=Math.max(0,Math.round(abl.default.f(c,you))); } });
    o=o/N*hy; i2=i2/N*hm;
    return { kill: o>0?Math.ceil(c.hpmax/o):Infinity,
             die:  i2>0?Math.ceil(you.hpmax/i2):Infinity };
  };

  const STAGES = [[0,'frstn1a3','Western Woods'],[2,'frstn9a1','Deep Woods'],
                  [3,'frstn2a2','Forest, far'],[4,'hmbsmnt','Catacombs era'],
                  [5,'trne2','Golem arena II'],[6,'trne4','Golem arena IV'],
                  [7,'mod_hollow','Sunken Hollow'],[8,'mod_spire','Ashen Spire'],
                  [9,'mod_vigil','Long Vigil']];

  // ---------- 1. combat -----------------------------------------------------
  const combat = STAGES.map(([ti,ak,nm])=>{
    if(!area[ak]) return {nm, missing:true};
    const cap = setTier(ti);
    const N = measure(ti,'all',1,false);
    const F = measure(ti,'all',2,false);
    const T = measure(ti,'all',1,true);
    // measure() leaves `you` in the state it built, so re-run it before each
    // fight rather than reusing one enemy against three different players
    const rerun = (which,pw,tt)=>{ measure(ti,which,pw,tt); return fight(enemy(ak)); };
    const rN = rerun('all',1,false), rF = rerun('all',2,false), rT = rerun('all',1,true);
    const elv = enemy(ak).lvl;
    return {nm, cap, elv, killN:rN.kill, dieN:rN.die,
            killF:rF.kill, killT:rT.kill, dieT:rT.die};
  });

  // ---------- 2. power attribution ------------------------------------------
  const attribution = [0,4,9].map(ti=>{
    const cap = setTier(ti);
    const baseOnly = measure(ti,'base',1,false);
    const mineOnly = measure(ti,'mine',1,false);
    const both     = measure(ti,'all',1,false);
    const bothT    = measure(ti,'all',1,true);
    const bothF    = measure(ti,'all',2,false);
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
  BASE(); clearSkills(); setTier(9); titles(false);
  const pacing = [1,5,10,20,40].map(from=>{
    const sk = skl.wsdm; sk.lvl=from; sk.exp=0; sk.expnext_t=sk.expnext();
    sk.mlstn.forEach(m=>m.g=false);
    const par = skl[MOD_PARENT_OF['wsdm']]; par.lvl=0;
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
  BASE(); clearSkills(); const TOP = setTier(9); titles(false); levelTo(TOP,'all');
  you.stat_r(); neutral(); allbuff(you);
  const full = you.str;
  const singles = [];
  ['kllr','rflx','cnd','scar','grit','rnwn'].forEach(key=>{
    BASE(); clearSkills(); setTier(9); titles(key==='rnwn');
    if(key!=='rnwn'){ const s=skl[key]; if(!s) { singles.push({key, strFromThisAlone: null}); return; }
      s.lvl=TOP; s.mlstn.forEach(m=>{ if(m.lv<=TOP){ try{m.f();m.g=true}catch(e){} } }); }
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

console.log('\n=========== DOMINANCE (one skill alone at the top cap, vs 100 base STR) ===========');
R.singles.forEach(s=>console.log(`  ${s.key.padEnd(6)} ${String(s.strFromThisAlone).padStart(6)}`));
console.log(`  all skills together: ${R.fullStr}`);
console.log('\nerrors:', errs.length?errs:'none');
await b.close();
