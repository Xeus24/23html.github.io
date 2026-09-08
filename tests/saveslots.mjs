import { chromium } from 'playwright';

// Three save slots, driven through the real UI and the real save()/load().
//
// The whole mechanism rests on one thing: the game reads and writes exactly one
// localStorage key ("v0.3") and does so on the load event, so a slot switch is
// "put the right blob in that key, then reload". These checks are therefore
// mostly about localStorage state and page reloads, not about DOM cosmetics.
//
//   PORT=8080 node tests/saveslots.mjs

const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));

const boot = async () => {
  await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
};
const keys = () => p.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = (localStorage.getItem(k) || '').length;
  }
  return out;
});
const state = () => p.evaluate(() => ({
  active: MOD_activeSlot(),
  name: you.name, lvl: you.lvl,
  slots: [1, 2, 3].map(n => MOD_slotInfo(n)),
  live: (localStorage.getItem('v0.3') || '').length,
  panelExists: !!MOD_SLOTUI.panel,
  barButtons: [...dom.sl.querySelectorAll('span')].map(s => s.textContent.trim())
}));

const fail = [];
const check = (cond, what) => { if (!cond) fail.push(what); console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}`); };

await boot();
await p.evaluate(() => localStorage.clear());
await boot();

console.log('--- a fresh browser, nothing saved yet');
let s = await state();
check(s.active === 1, 'starts on slot 1');
check(s.slots.every(x => x.empty), 'all three slots read as empty');
check(s.panelExists, 'the saves panel exists');
check(s.barButtons.includes('saves'), 'a "saves" button is in the save bar');
check(s.barButtons.includes('new save'), 'a "new save" button is in the save bar');
check(s.barButtons.includes('delete this save'), '"delete the save" is rebound to "delete this save"');

console.log('\n--- save in slot 1, with a name we can recognise');
await p.evaluate(() => { you.name = 'SlotOne'; you.lvl = 11; save(true); });
s = await state();
check(!s.slots[0].empty, 'slot 1 is now in use');
check(s.slots[0].name === 'SlotOne' && s.slots[0].lvl === 11, 'slot 1 shows the right name and level');
check(s.slots[1].empty && s.slots[2].empty, 'slots 2 and 3 are untouched');
check(s.live > 0, 'the game\'s own key still holds the live save');

console.log('\n--- "new save" starts a fresh character in the first free slot');
await p.evaluate(() => MOD_newSave(2));
await p.waitForTimeout(3500);
s = await state();
check(s.active === 2, 'now playing slot 2');
check(s.name !== 'SlotOne', `slot 2 is a fresh character (name is "${s.name}")`);
check(!s.slots[0].empty && s.slots[0].name === 'SlotOne', 'slot 1 survived intact');

console.log('\n--- save slot 2, then switch back to slot 1');
await p.evaluate(() => { you.name = 'SlotTwo'; you.lvl = 22; save(true); });
await p.evaluate(() => MOD_switchSlot(1));
await p.waitForTimeout(3500);
s = await state();
check(s.active === 1, 'back on slot 1');
check(s.name === 'SlotOne' && s.lvl === 11, 'slot 1 loaded the right character');
check(s.slots[1].name === 'SlotTwo' && s.slots[1].lvl === 22, 'slot 2 kept its own character');

console.log('\n--- and forward to slot 2 again, to prove the switch is not one-way');
await p.evaluate(() => MOD_switchSlot(2));
await p.waitForTimeout(3500);
s = await state();
check(s.active === 2 && s.name === 'SlotTwo', 'slot 2 loaded back');

console.log('\n--- third slot, so all three hold different characters at once');
await p.evaluate(() => MOD_newSave(3));
await p.waitForTimeout(3500);
await p.evaluate(() => { you.name = 'SlotThree'; you.lvl = 33; save(true); });
s = await state();
const names = s.slots.map(x => x.name);
check(names[0] === 'SlotOne' && names[1] === 'SlotTwo' && names[2] === 'SlotThree',
  `all three saves coexist: ${names.join(', ')}`);

console.log('\n--- deleting a slot you are not in leaves the rest alone');
await p.evaluate(() => { window.confirm = () => true; MOD_deleteSlot(1); });
await p.waitForTimeout(300);
s = await state();
check(s.slots[0].empty, 'slot 1 is empty');
check(s.active === 3 && s.name === 'SlotThree', 'still playing slot 3, undisturbed');
check(!s.slots[1].empty, 'slot 2 still there');

console.log('\n--- the mod\'s own settings survive a save deletion');
await p.evaluate(() => { setSkillXp(4); window.confirm = () => true; });
const before = await keys();
await p.evaluate(() => { window.confirm = () => true; MOD_deleteSlot(3); });
await p.waitForTimeout(3500);
const after = await keys();
check(before['p23_mod_skillxp'] !== undefined && after['p23_mod_skillxp'] !== undefined,
  'the skill-xp setting is still in storage after deleting the save you were playing');
s = await state();
check(s.slots[2].empty, 'slot 3 is empty after deleting it');
check(!s.slots[1].empty && s.slots[1].name === 'SlotTwo', 'slot 2 STILL survived');

console.log('\n--- an existing pre-slot save is adopted, not orphaned');
await p.evaluate(() => {
  const blob = localStorage.getItem('p23_slot_2');
  localStorage.clear();
  localStorage.setItem('v0.3', blob);        // as if the mod had never run
});
await boot();
s = await state();
check(s.active === 1, 'adopted into slot 1');
check(!s.slots[0].empty && s.slots[0].name === 'SlotTwo', 'the old character is playable, not lost');
check(s.name === 'SlotTwo', 'and it is what actually loaded');

console.log('\nerrors:', errs.length ? errs : 'none');
if (errs.length) fail.push('page errors: ' + JSON.stringify(errs));
await b.close();
if (fail.length) { console.error('\nFAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS — three independent saves, switching, starting fresh, and deleting all behave.');
