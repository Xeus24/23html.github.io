import { readFileSync, readdirSync } from 'node:fs';

// The docs state numbers that drift: how many sections, how many scripts, which
// version, how long the suite takes. This reads each from the source and fails
// on a doc that disagrees. No browser; runs in a second.
//
//   node tests/docs.mjs

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const mod = read('mod.js'), readme = read('README.md'), treadme = read('tests/README.md');
const claude = read('CLAUDE.md'), notes = read('MOD-NOTES.md'), runsh = read('tests/run.sh');
const fail = [];
const check = (c, w) => { if (!c) fail.push(w); console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${w}`); };

const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
const words = n => n < 20 ? ONES[n] : Object.keys(TENS).find(k => TENS[k] === n - n % 10) + (n % 10 ? '-' + ONES[n % 10] : '');
const cap = s => s[0].toUpperCase() + s.slice(1);

// sections: the highest "N. TITLE" header in mod.js
const secs = [...mod.matchAll(/^   (\d{1,2})\. [A-Z]/gm)].map(m => +m[1]);
const nSec = Math.max(...secs);
check(readme.includes(cap(words(nSec)) + ' sections'), `README says ${words(nSec)} sections (mod.js has headers up to ${nSec})`);

// version
const ver = mod.match(/version: '([\d.]+)'/)[1];
check(new RegExp('Version ' + ver.replace(/\./g, '\\.') + '\\.').test(readme), `README names version ${ver}`);
check(notes.includes('v' + ver) || notes.includes(ver), `MOD-NOTES mentions ${ver}`);

// scripts
const files = readdirSync(new URL('../tests/', import.meta.url)).filter(f => f.endsWith('.mjs')).map(f => f.replace('.mjs', ''));
const listed = [...runsh.matchAll(/TESTS=\(([^)]*)\)/g)].pop()[1].trim().split(/\s+/);
const missing = files.filter(f => !listed.includes(f)), ghost = listed.filter(f => !files.includes(f));
check(!missing.length && !ghost.length, `run.sh lists every script (unlisted: ${missing}; no file: ${ghost})`);
for (const [doc, re] of [[readme, /all (\d+) scripts/], [readme, /(\d+) Playwright scripts/], [treadme, /All (\d+) take/]]) {
  const m = doc.match(re);
  check(m && +m[1] === listed.length, `"${m && m[0]}" matches the ${listed.length} scripts run`);
}

// the suite's duration: every "about N seconds" agrees, and none says it another way
const secsClaims = [...[readme, treadme, claude, notes].join('\n').matchAll(/about (\d+) seconds/g)].map(m => +m[1]);
check(new Set(secsClaims).size <= 1, `every "about N seconds" agrees (${[...new Set(secsClaims)]})`);
check(!/minute and a half/.test(claude + notes + readme + treadme), 'no doc gives the suite time as "a minute and a half"');

console.log(fail.length ? `\nFAILED (${fail.length})` : '\nall passed');
process.exit(fail.length ? 1 : 0);
