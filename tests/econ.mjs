import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/econ.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);
const r = await p.evaluate(()=>{
  const DFL = 0.25;
  // expected sell income per kill, from the real drop tables
  function perKill(a){
    let exp = 0;
    for (const pop of a.pop){
      const c = pop.crt; const w = pop.c === undefined ? 1/a.pop.length : pop.c;
      let e = 0;
      for (const d of (c.drop||[])) if (d.item) e += (d.chance||0) * MOD_itemValue(d.item) * DFL;
      exp += w * e;
    }
    for (const d of (a.drop||[])) if (d.item) exp += (d.c||0) * MOD_itemValue(d.item) * DFL;
    return exp;
  }
  const areas = ['frstn1a2','frstn1a3','frstn9a1','hmbsmnt','mod_hollow','mod_spire','mod_vigil']
    .filter(k=>area[k]).map(k=>({name:area[k].name||k, key:k, perKill:+perKill(area[k]).toFixed(2)}));

  // what things cost to buy
  const prices=[];
  for (const v in vendor) for (const e of (vendor[v].items||[])) if (typeof e.p==='number') prices.push(e.p);
  prices.sort((x,y)=>x-y);
  const med = prices[prices.length>>1];

  // highest-value single items you can actually loot in the endgame areas
  const loot=[];
  for (const k of ['mod_vigil','mod_spire']) if(area[k]) for(const pop of area[k].pop)
    for(const d of (pop.crt.drop||[])) if(d.item) loot.push([d.item.name, MOD_itemValue(d.item), d.chance]);
  loot.sort((a,b)=>b[1]-a[1]);

  return {areas, buyPrices:{count:prices.length, median:med, max:prices[prices.length-1]},
          topEndgameLoot: loot.slice(0,4),
          enemyMoneyDefault: you.mods.enmondren};
});
console.log('expected SELL income per kill (using each area\'s real drop table):');
r.areas.forEach(a=>console.log('   '+a.name.padEnd(22)+String(a.perKill).padStart(8)));
console.log('\nvendor buy prices: n='+r.buyPrices.count+'  median='+r.buyPrices.median+'  max='+r.buyPrices.max);
console.log('enemy money drop chance by default: '+r.enemyMoneyDefault);
console.log('\nhighest-value endgame loot:', JSON.stringify(r.topEndgameLoot));
await b.close();
