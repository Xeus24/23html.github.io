import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/audit2.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,200)));
await p.goto(`${HOST}/index.html`, {waitUntil:'load'});
await p.waitForTimeout(4500);

console.log('1. save size with 183 skills (localStorage limit ~5MB):');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  global.flags.mod_prog={hollow:99,spire:99,vigil:99}; MOD_levelCap();
  for(const k in skl){ const s=skl[k]; if(!s||typeof s!=='object') continue;
    s.lvl=60; if(s.mlstn) s.mlstn.forEach(m=>{ if(m.lv<=60) m.g=true; });
    if(you.skls.indexOf(s)===-1) you.skls.push(s); }
  save();
  const str = localStorage.getItem('v0.3')||'';
  return {skills: you.skls.length, saveBytes: str.length,
          asKB: +(str.length/1024).toFixed(1), pctOf5MB: +((str.length/(5*1024*1024))*100).toFixed(2)};
})));

console.log('\n2. that maximal save loads back cleanly:');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  const before = {skills: you.skls.length, srdc: skl.srdc.lvl, wsdm: skl.wsdm.lvl, par: skl.par_1.lvl};
  load();
  return {before, after:{skills: you.skls.length, srdc: skl.srdc.lvl, wsdm: skl.wsdm.lvl, par: skl.par_1.lvl},
          intact: you.skls.length===before.skills && skl.srdc.lvl===before.srdc && skl.wsdm.lvl===before.wsdm};
})));

console.log('\n3. wrapped functions still return what the game expects:');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  // allbuff reads `let dm = skl.fgt.use()` and adds it to str/int
  skl.fgt.lvl=10; you.str_r=100; you.stat_r();
  const fgtUse = skl.fgt.use();
  // stfc is called by name in a switch; twoh in allbuff
  const stfcOk = typeof skl.stfc.use === 'function';
  const twohUse = skl.twoh.use();
  // my own skills' use() is only ever called by my own allbuff pass
  const mineReturns = skl.qic.use();
  return {fgtUseReturns: typeof fgtUse, fgtValue: Math.round(fgtUse),
          twohUseReturns: typeof twohUse, stfcStillFunction: stfcOk,
          myUseReturns: typeof mineReturns};
})));

console.log('\n4. skill desc is a getter — does an assignment silently vanish?');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  const d = Object.getOwnPropertyDescriptor(skl.srdc,'desc');
  let assigned = null;
  try { skl.srdc.desc = 'TEST'; assigned = String(skl.srdc.desc).indexOf('TEST')>-1; }
  catch(e){ assigned = 'threw: '+e.message; }
  return {hasGetter: !!d.get, hasSetter: !!d.set, assignmentTookEffect: assigned};
})));

console.log('\n5. does anything copy skill objects (which would freeze the getter)?');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  const src = (document.documentElement.innerHTML.match(/copy\(sk[a-z]*/g)||[]);
  return {copyCallsOnSkills: src.slice(0,5), count: src.length};
})));

console.log('\n6. counter baselines resync after a load (no phantom xp burst):');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  skl.wayf.lvl=1; skl.wayf.exp=0;
  global.stat.smovet = 500; MOD_discoverTick();      // establish baseline high
  save();
  global.stat.smovet = 5;                            // load an older, lower state
  const expBefore = skl.wayf.exp;
  MOD_discoverTick(); MOD_discoverTick();
  const expAfter = skl.wayf.exp;
  global.stat.smovet = 20;                           // then genuine progress
  MOD_discoverTick();
  return {noBurstOnLowerCounter: expAfter===expBefore,
          grantsAfterResync: skl.wayf.exp > expAfter};
})));

console.log('\n7. capped skills still fire onLevel side effects correctly:');
console.log('  ', JSON.stringify(await p.evaluate(()=>{
  global.flags = {}; MOD_CAP.current=-1; const cap = MOD_levelCap();
  skl.trad.lvl = cap; skl.trad.exp = 0;
  let recshopCalls = 0; const orig = window.recshop;
  window.recshop = function(){ recshopCalls++; return orig.apply(this,arguments); };
  giveSkExp(skl.trad, 1e6);
  window.recshop = orig;
  return {cap, tradStayedAt: skl.trad.lvl, expStayedZero: skl.trad.exp===0, recshopCalls};
})));

console.log('\npage errors:', errs.length?errs:'none');
await b.close();
