import { launch } from './lib/browser.mjs';
import { readFileSync } from 'node:fs';
import { buildUserscript, OUT } from '../tools/build-userscript.mjs';

// The userscript (tools/build-userscript.mjs): the mod on the author's hosted
// game, with no local copy.
//
// The hosted game is his page exactly, which is what this serves with mod.js
// blocked. A userscript manager runs a document-end script at DOMContentLoaded,
// so that is when this runs the committed .user.js. Then:
//
//   * the committed file is what the build makes from the current mod.js
//   * the whole mod is live in the page's global scope -- console commands,
//     sections to the last -- and a save made under it loads back under it
//   * the parts that read the game's source (key items) read the same source
//     they read locally, not the mod's own injected copy
//   * the changelog button opens the embedded changelog
//   * on a page that already has the mod, the userscript does nothing
//
//   PORT=8080 node tests/userscript.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const fail = [];
const check = (c, what) => { if (!c) fail.push(what); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${what}`); };

console.log('--- the committed userscript is current');
const built = buildUserscript();
let committed = '';
try { committed = readFileSync(OUT, 'utf8'); } catch (e) {}
check(committed === built, 'userscript/proto23-mod.user.js matches mod.js (npm run build:userscript)');
const header = committed.split('// ==/UserScript==')[0];
check(/@match\s+https:\/\/23html\.github\.io\//.test(header) && /@run-at\s+document-end/.test(header) &&
      /@grant\s+none/.test(header), 'it matches the hosted game, at document-end, with no special grants');

const b = await launch();
const errs = [];
const ctx = await b.newContext();
async function page(hosted, withScript) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push((hosted ? '[hosted] ' : '[local] ') + String(e).slice(0, 200)));
  if (hosted) await p.route('**/mod.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  if (withScript) {
    await p.addInitScript({ content:
      'document.addEventListener("DOMContentLoaded", function () {\n' + committed + '\n});' });
  }
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(4500);
  return p;
}

console.log('\n--- on the hosted game');
const H = await page(true, true);
const live = await H.evaluate(() => ({
  version: typeof MOD !== 'undefined' ? MOD.version : null,
  injected: document.querySelectorAll('script[data-p23-mod]').length,
  commands: ['modHelp', 'modWiki', 'modFights', 'setPacing', 'modBackups', 'modRoad'].filter(f => typeof window[f] !== 'function'),
  last: typeof MOD_XP === 'object' && skl.fgt.expnext() === MOD_expnextFor(skl.fgt.lvl),
  sec47: typeof getFights === 'function' && getFights(),
  conv: !!(skl.mod_conv1),
  keys: JSON.stringify(MOD_KEY_ITEMS)
}));
check(live.version && live.injected === 1, `the mod is live (v${live.version}), injected once`);
check(live.commands.length === 0, `its console commands are page globals (missing: ${live.commands.join(', ') || 'none'})`);
check(live.last && live.sec47 === 'original' && live.conv, 'and it ran to the last section');

const local = await page(false, false);
const localKeys = await local.evaluate(() => JSON.stringify(MOD_KEY_ITEMS));
check(live.keys === localKeys && live.keys.length > 10,
  'the key items it protects are read from the game alone, the same as locally');

const cl = await H.evaluate(async () => {
  let opened = null; const keep = window.open;
  window.open = (u) => { opened = u; return null; };
  try { modChangelog(); } finally { window.open = keep; }
  const text = opened && opened.startsWith('blob:') ? await (await fetch(opened)).text() : '';
  return { opened, hasVersion: text.indexOf(MOD.version) >= 0 && /<html/i.test(text) };
});
check(cl.hasVersion, `the changelog button opens the embedded changelog (${String(cl.opened).slice(0, 20)}...)`);

console.log('\n--- a save made under it loads under it');
await H.evaluate(() => { global.flags.mod_realm = 3; global.flags.mod_insight = 17; save(); });
await H.reload({ waitUntil: 'load' });
await H.waitForTimeout(4500);
const back = await H.evaluate(() => ({ realm: global.flags.mod_realm, insight: global.flags.mod_insight,
  mod: typeof MOD !== 'undefined', backups: MOD_backupList().length }));
check(back.mod && back.realm === 3 && back.insight === 17, `realm ${back.realm}, insight ${back.insight} after a reload`);
check(back.backups >= 1, `and the save was backed up the first time the mod saw it (${back.backups})`);

console.log('\n--- on a page that already has the mod');
const L = await page(false, true);
const twice = await L.evaluate(() => ({ injected: document.querySelectorAll('script[data-p23-mod]').length,
  version: MOD.version }));
check(twice.injected === 0, 'the userscript stands aside');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — the userscript runs the whole mod on the hosted game.');
