import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/sweep5.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);
const R = await p.evaluate(()=>{
  const BASE = ()=>{
    you.int_r=100; you.str_r=100; you.agl_r=100; you.spd_r=100; you.hp_r=1000; you.sat_r=1000;
    you.inta=you.stra=you.agla=you.spda=you.hpa=you.sata=0;
    you.intm=you.strm=you.aglm=you.spdm=you.hpm=you.satm=1;
    you.exp_t=1; you.mods.sbonus=0; you.mods.cpwr=1; you.stat_p=[1,1,1,1];
  };
  const clear = ()=>{ for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object') continue;
    s.lvl=0; s.exp=0; if(s.mlstn) s.mlstn.forEach(m=>m.g=false); } };
  const tier = cap=>{ global.flags.mod_t_forest=cap>=20; global.flags.mod_t_deep=cap>=30;
    global.flags.mod_t_cata=cap>=40; global.flags.trne1e1=cap>=50; global.flags.trne3e1=cap>=60;
    global.flags.mod_prog={hollow:cap>=75?99:0,spire:cap>=90?99:0,vigil:cap>=110?99:0};
    MOD_CAP.current=-1; return MOD_levelCap(); };
  const neutral = ()=>{ global.flags.inside=true; global.flags.isday=true; global.flags.btl=false;
    global.flags.iscold=false; global.flags.iswet=false; you.hp=you.hpmax; you.sat=you.satmax; };

  // attainable skill levels, from the xp curve: ~lv10 early, ~lv22 by the endgame
  const STAGES = [[10,10,'frstn1a3'],[20,14,'frstn9a1'],[40,17,'hmbsmnt'],
                  [60,19,'trne4'],[75,20,'mod_hollow'],[90,21,'mod_spire'],[110,22,'mod_vigil']];

  const player = (cap, lvl)=>{
    BASE(); clear(); tier(cap);
    Object.keys(ttl).forEach(k=>{ ttl[k].have=false; }); MOD_updateRenown();
    for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object'||k==='rnwn') continue;
      s.lvl=Math.min(lvl,cap);
      if(s.mlstn) s.mlstn.forEach(m=>{ m.g=false; if(m.lv<=s.lvl){ try{m.f();m.g=true}catch(e){} } }); }
    you.stat_r(); neutral(); allbuff(you);
    return {str:you.str, hp:you.hpmax};
  };

  const out = {};
  [0.02,0.03,0.04].forEach(rate=>{
    [0.9,1.1,1.3].forEach(hp=>{
      MOD_ENEMY.rate=rate; MOD_ENEMY.hpPow=hp; MOD_ENEMY.tierRate=0.008;
      out[`r${rate} hp${hp}`] = STAGES.map(([cap,lvl,ak])=>{
        if(!area[ak]) return '?';
        const P = player(cap,lvl);
        const e=area[ak].pop[0], lv=Math.round((e.lvlmin+e.lvlmax)/2);
        const c=mon_gen(e.crt); lvlup(c,lv);
        const k=Math.max(1,Math.ceil(c.hpmax/Math.max(P.str,1)));
        const d=Math.max(1,Math.ceil(P.hp/Math.max(c.str,1)));
        return `${cap}:${k}/${d}`;
      }).join('  ');
    });
  });
  MOD_ENEMY.rate=0.05; MOD_ENEMY.hpPow=1.8; MOD_ENEMY.tierRate=0.02;
  return out;
});
console.log('format cap:hitsToKill/hitsToDie   (want roughly 3-8 kill, 8-25 die)');
for(const [k,v] of Object.entries(R)) console.log(k.padEnd(12), v);
await b.close();
