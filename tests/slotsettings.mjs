import { launch } from './lib/browser.mjs';

// Settings ride inside the save, and a browser adopts them only where it has none
// of its own. That must happen once per browser: a slot switch is another load,
// and a slot's old snapshot pulling in a setting this browser never chose would
// write the key, which every other slot then inherits.
//
//   PORT=8080 node tests/slotsettings.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await launch();
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const boot = async () => { await p.goto(`${HOST}/index.html`, { waitUntil: 'load' }); await p.waitForTimeout(3500); };
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };
const mode = () => p.evaluate(() => MOD_NUM.mode);
const seen = () => p.evaluate(() => localStorage.getItem(MOD.settingsSeenKey));

await boot();
await p.evaluate(() => localStorage.clear());
await boot();

console.log('--- a save made with a setting the browser then loses (a new browser)');
await p.evaluate(() => { setNumberFormat('sci'); save(true); });
await p.evaluate(() => { localStorage.removeItem(MOD.settingKeys.numfmt); localStorage.removeItem(MOD.settingsSeenKey); });
await boot();
check(await mode() === 'sci', 'the first load in a browser takes the setting from the save');
check(await seen() === '1', '...and marks the browser as having taken settings');

console.log('\n--- a later load (a slot switch) with a setting this browser lacks');
await p.evaluate(() => { localStorage.removeItem(MOD.settingKeys.numfmt); });
await boot();
check(await mode() !== 'sci', 'does not adopt the slot\'s snapshot again');
check(await p.evaluate(() => localStorage.getItem(MOD.settingKeys.numfmt)) === null, 'and writes no key for the other slots to inherit');

check(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
