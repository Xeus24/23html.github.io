import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/realbal.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,200)));
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);

const R = await p.evaluate(()=>{
  const BASE = ()=>{
    you.int_r=100; you.str_r=100; you.agl_r=100; you.spd_r=100; you.hp_r=1000; you.sat_r=1000;
    you.inta=you.stra=you.agla=you.spda=you.hpa=you.sata=0;
    you.intm=you.strm=you.aglm=you.spdm=you.hpm=you.satm=1;
    you.exp_t=1; you.mods.sbonus=0; you.mods.cpwr=1; you.stat_p=[1,1,1,1];
  };
  const clearSkills = ()=>{ for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object') continue;
    s.lvl=0; s.exp=0; if(s.mlstn) s.mlstn.forEach(m=>m.g=false); } };
  const setTier = (cap)=>{
    global.flags.mod_t_forest=cap>=20; global.flags.mod_t_deep=cap>=30;
    global.flags.mod_t_cata=cap>=40; global.flags.trne1e1=cap>=50; global.flags.trne3e1=cap>=60;
    global.flags.mod_prog={hollow:cap>=75?99:0,spire:cap>=90?99:0,vigil:cap>=110?99:0};
    MOD_CAP.current=-1; return MOD_levelCap();
  };
  const titles = on=>{ Object.keys(ttl).forEach(k=>{ ttl[k].have=!!on; }); MOD_updateRenown(); };
  const neutral = ()=>{ global.flags.inside=true; global.flags.isday=true; global.flags.btl=false;
    global.flags.iscold=false; global.flags.iswet=false; you.hp=you.hpmax; you.sat=you.satmax; };

  // ---- how much xp to reach level L from 0, using the game's own curve ----
  const xpToReach = (L)=>{
    const sk = skl.bstl; let total=0;
    for(let l=0;l<L;l++){ sk.lvl=l; total += sk.expnext(); }
    return total;
  };
  // realistic ceiling: what level can a passive skill reach in N hours at 1x?
  // passive skills get roughly 0.1/tick x2 multiplier = 0.2/tick, 1 tick/sec
  const reachableIn = (hours)=>{
    const budget = hours*3600*0.2; let l=0, spent=0;
    const sk = skl.bstl;
    while(true){ sk.lvl=l; const c=sk.expnext(); if(spent+c>budget) break; spent+=c; l++; if(l>200) break; }
    return l;
  };
  const curve = [1,5,10,15,20,25].map(L=>({level:L, totalXpFromZero: Math.round(xpToReach(L))}));
  const reach = [1,10,50,200,1000].map(h=>({hours:h, level: reachableIn(h)}));

  // ---- balance at REALISTIC skill levels ---------------------------------
  const STAGES = [[10,10,'frstn1a3','Western Woods'],[20,14,'frstn9a1','Deep Woods'],
                  [40,17,'hmbsmnt','Catacombs era'],[60,19,'trne4','Golem arena IV'],
                  [75,20,'mod_hollow','Sunken Hollow'],[90,21,'mod_spire','Ashen Spire'],
                  [110,22,'mod_vigil','Long Vigil']];
  const rows = STAGES.map(([cap,skillLvl,ak,nm])=>{
    if(!area[ak]) return {nm, missing:true};
    const run = (withTitles)=>{
      BASE(); clearSkills(); setTier(cap); titles(withTitles);
      for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object'||k==='rnwn') continue;
        s.lvl=Math.min(skillLvl,cap);
        if(s.mlstn) s.mlstn.forEach(m=>{ m.g=false; if(m.lv<=s.lvl){ try{m.f();m.g=true}catch(e){} } }); }
      you.stat_r(); neutral(); allbuff(you);
      return {str:you.str, hp:you.hpmax};
    };
    const N = run(false), T = run(true);
    const e=area[ak].pop[0], lv=Math.round((e.lvlmin+e.lvlmax)/2);
    const c=mon_gen(e.crt); lvlup(c,lv);
    const k=s=>Math.max(1,Math.ceil(c.hpmax/Math.max(s.str,1)));
    const d=s=>Math.max(1,Math.ceil(s.hp/Math.max(c.str,1)));
    return {nm, cap, skillLvl:Math.min(skillLvl,cap), elv:c.lv,
            playerStr:Math.round(N.str), enemyHp:Math.round(c.hpmax),
            kill:k(N), die:d(N), killT:k(T), dieT:d(T)};
  });
  return {curve, reach, rows};
});

console.log('=========== THE REAL LIMITER: the game\'s xp curve ===========');
console.log('  total xp to reach a level from scratch:');
R.curve.forEach(c=>console.log(`     lv ${String(c.level).padStart(2)}   ${c.totalXpFromZero.toLocaleString()}`));
console.log('\n  level a passive skill can actually reach (0.2 xp/tick at 1x speed):');
R.reach.forEach(r=>console.log(`     ${String(r.hours).padStart(4)} h of play   ->  lv ${r.level}`));

console.log('\n=========== BALANCE AT ATTAINABLE SKILL LEVELS ===========');
console.log('  cap  area             skills  elv   you STR  enemy HP   kill  die    | Renown10: kill die');
R.rows.forEach(r=>{ if(r.missing) return console.log('   '+r.nm+' MISSING');
  console.log(`  ${String(r.cap).padStart(3)}  ${r.nm.padEnd(16)} ${String(r.skillLvl).padStart(4)}  ${String(r.elv).padStart(3)}  ${String(r.playerStr).padStart(8)} ${String(r.enemyHp).padStart(9)}   ${String(r.kill).padStart(4)} ${String(r.die).padStart(4)}    |    ${String(r.killT).padStart(4)} ${r.dieT}`);
});
console.log('\nerrors:', errs.length?errs:'none');
await b.close();
