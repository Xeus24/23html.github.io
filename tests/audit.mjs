import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/audit.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,200)));
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);

const out = await p.evaluate(()=>{
  const SCALARS = ['stra','inta','agla','spda','hpa','sata',
                   'strm','intm','aglm','spdm','hpm','satm',
                   'exp_t','luck','karma','crt','wealth','lvl','exp'];

  function snap(){
    const s = {sc:{}, mods:{}, res:{}, stat_p:[...you.stat_p], ccls:[...you.ccls],
               p:{}, titles: global.titles.length, eff: you.eff.length};
    SCALARS.forEach(k=>s.sc[k]=you[k]);
    for(const k in you.mods) s.mods[k]=you.mods[k];
    for(const k in you.res) s.res[k]=you.res[k];
    for(const k in skl) if(skl[k] && typeof skl[k]==='object') s.p[k]=skl[k].p;
    return s;
  }
  function restore(s){
    SCALARS.forEach(k=>you[k]=s.sc[k]);
    for(const k in s.mods) you.mods[k]=s.mods[k];
    for(const k in s.res) you.res[k]=s.res[k];
    you.stat_p=[...s.stat_p]; you.ccls=[...s.ccls];
    for(const k in s.p) if(skl[k]) skl[k].p=s.p[k];
  }
  function diff(a,c){
    const d=[];
    SCALARS.forEach(k=>{ if(a.sc[k]!==c.sc[k]) d.push(k+' '+a.sc[k]+'->'+c.sc[k]); });
    for(const k in a.mods) if(a.mods[k]!==c.mods[k]) d.push('mods.'+k+' '+a.mods[k]+'->'+c.mods[k]);
    for(const k in a.res)  if(a.res[k]!==c.res[k])  d.push('res.'+k+' '+a.res[k]+'->'+c.res[k]);
    a.stat_p.forEach((v,i)=>{ if(v!==c.stat_p[i]) d.push('stat_p['+i+'] '+v+'->'+c.stat_p[i]); });
    a.ccls.forEach((v,i)=>{ if(v!==c.ccls[i]) d.push('ccls['+i+'] '+v+'->'+c.ccls[i]); });
    for(const k in a.p) if(a.p[k]!==c.p[k]) d.push('skl.'+k+'.p '+a.p[k]+'->'+c.p[k]);
    if(a.titles!==c.titles) d.push('titles +'+(c.titles-a.titles));
    if(a.eff!==c.eff) d.push('effects +'+(c.eff-a.eff));
    return d;
  }

  // mine vs the author's, by skill id
  const MINE = id => (id>=901 && id<=913) || (id>=1001 && id<=1100) || (id>=2001 && id<=2010);

  const report = {broken:[], threw:[], noText:[], undocumented:[], ok:0, total:0,
                  baseGameBroken:[], levelIssues:[], deepChecks:{}};

  for(const key in skl){
    const sk = skl[key];
    if(!sk || typeof sk!=='object' || !sk.mlstn) continue;
    const mine = MINE(sk.id);

    // milestone levels must be ascending and unique, or the save's index-based
    // "granted" flags line up with the wrong perk
    const lvls = sk.mlstn.map(m=>m.lv);
    for(let i=1;i<lvls.length;i++) if(lvls[i] <= lvls[i-1])
      report.levelIssues.push(key+' lv order '+lvls[i-1]+' then '+lvls[i]);
    if(new Set(lvls).size !== lvls.length) report.levelIssues.push(key+' duplicate levels '+lvls.join(','));

    sk.mlstn.forEach((m, idx)=>{
      report.total++;
      const before = snap();
      let threw = null;
      try { m.f(); } catch(e){ threw = e.message; }
      const after = snap();
      const d = diff(before, after);
      restore(before);

      const tag = (mine?'[mod] ':'[base] ')+key+' lv'+m.lv;
      if(threw){ report.threw.push(tag+' THREW: '+threw); return; }

      const declarative = !!(m.xpBonus || m.sectionXp);
      if(d.length===0 && !declarative){
        (mine?report.broken:report.baseGameBroken).push(tag+' :: "'+m.p+'" changes nothing');
        return;
      }
      if(d.length===0 && declarative){ report.ok++; return; }
      if(!m.p || !m.p.trim()){ report.noText.push(tag+' has effects but no text: '+d.join(', ')); return; }
      report.ok++;
      // effects on fields the text does not hint at
      const txt = m.p.toLowerCase();
      const unmentioned = d.filter(x=>{
        if(/^str/.test(x)) return !/str|strength|attack/.test(txt);
        if(/^int/.test(x)) return !/int|acuity|mental/.test(txt);
        if(/^agl/.test(x)) return !/agl|agil/.test(txt);
        if(/^spd/.test(x)) return !/spd|speed/.test(txt);
        if(/^hp/.test(x))  return !/hp|health/.test(txt);
        if(/^sat/.test(x)) return !/energy|sat/.test(txt);
        if(/^exp_t/.test(x)) return !/exp/.test(txt);
        if(/^stat_p/.test(x)) return !/growth|potential/.test(txt);
        if(/^skl\./.test(x)) return !/exp|train|faster|mastery|section/.test(txt);
        if(/^titles/.test(x)) return !/title/.test(txt);
        if(/^mods\.sbonus/.test(x)) return !/energy/.test(txt);
        if(/^mods\.cpwr/.test(x)) return !/crit/.test(txt);
        if(/^res\./.test(x)) return !/resist|damage|defen/.test(txt);
        if(/^ccls/.test(x)) return !/def/.test(txt);
        return false;
      });
      if(unmentioned.length) report.undocumented.push(tag+' :: "'+m.p+'" also does: '+unmentioned.join(', '));
    });
  }
  return report;
});

const show = (name, arr, limit=40) => {
  console.log(`\n${name}: ${arr.length}`);
  arr.slice(0,limit).forEach(x=>console.log('   '+x));
  if(arr.length>limit) console.log(`   ...and ${arr.length-limit} more`);
};
console.log(`perks checked: ${out.total}   passing: ${out.ok}`);
show('MOD PERKS THAT DO NOTHING', out.broken);
show('PERKS THAT THREW', out.threw);
show('EFFECTS WITH NO TEXT', out.noText);
show('EFFECTS THE TEXT DOES NOT MENTION', out.undocumented);
show('MILESTONE LEVEL ORDER PROBLEMS', out.levelIssues);
show('BASE-GAME PERKS THAT DO NOTHING (author\'s, not mine)', out.baseGameBroken, 15);
console.log('\npage errors:', errs.length?errs:'none');
await b.close();
