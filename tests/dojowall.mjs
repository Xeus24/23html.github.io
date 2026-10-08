import { launch, settle } from './lib/browser.mjs';

// The dojo's realm 6-10 pills come at character levels; the walls are Circulate
// Qi levels. Stuck at a wall without the pill, the instructor gives it once, and
// the level reward for that realm does not give a second.
//
//   PORT=8080 node tests/dojowall.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await settle(p);
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

const r = await p.evaluate(() => {
  const out = {};
  // stand at the realm-6 wall: Circulate Qi at the level that earns rank 6, realm 5 held
  const qi = skl.mod_qi || Object.values(skl).find(s => s && /Qi Circulation/i.test(s.name));
  out.hasQi = !!qi;
  global.flags.mod_realm = 5;
  qi.lvl = MOD_RANK_AT[5];
  out.atWall = MOD_atBottleneck();
  out.eligible = MOD_realmEligible().n;
  out.offer6 = MOD_wallPillOffer();
  const before = item.mod_bp6.amount || 0;
  out.claimed = MOD_claimWallPill();
  out.second = MOD_wallPillOffer();
  out.third = MOD_claimWallPill();
  // not at a wall, or a realm the dojo does not carry: no offer
  global.flags.mod_realm = 0; qi.lvl = 1;
  out.idle = MOD_wallPillOffer();
  global.flags.mod_realm = 1; qi.lvl = MOD_RANK_AT[2];
  out.lowRealm = MOD_wallPillOffer();
  return out;
});
console.log(r);
check(r.hasQi, 'found the Qi Circulation skill');
check(r.atWall && r.eligible === 6, `at the realm 6 wall (${r.eligible})`);
check(r.offer6 === 6, 'the instructor offers the realm 6 pill');
check(r.claimed === true, 'and hands it over');
check(r.second === 0 && r.third === false, 'once only');
check(r.idle === 0, 'no offer when you are not at a wall');
check(r.lowRealm === 0, 'none for walls the village herbalist already covers');
check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
