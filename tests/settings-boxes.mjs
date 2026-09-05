import { chromium } from 'playwright';

// point at any local server: PORT=9000 node tests/settings-boxes.mjs
const HOST = `http://127.0.0.1:${process.env.PORT || 8080}`;
// Playwright finds its own Chromium locally; set CHROMIUM=/path/to/chrome to override
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 220)));
await p.goto(`${HOST}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(4500);

console.log('1. the three boxes exist inside the settings window, and are visible when it opens:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  const labels = inputs.map(i => i.previousSibling && i.previousSibling.textContent);
  // open the settings window the way the player does
  const before = dom.ctrwin4.style.display;
  dom.ct_bt7.click();
  const shown = dom.ctrwin4.style.display !== 'none';
  const boxes = inputs.map(i => { const r = i.getBoundingClientRect(); return r.width > 10 && r.height > 5; });
  return { count: inputs.length, labels, wasHidden: before === 'none', settingsOpened: shown, allBoxesRendered: boxes.every(Boolean) };
}, )));

console.log('\n2. typing a value applies it to the real game state:');
console.log('  ', JSON.stringify(await p.evaluate(async () => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  const set = (i, v) => { inputs[i].value = String(v); inputs[i].dispatchEvent(new Event('change')); };
  set(0, 5); set(1, 4); set(2, 0.4);
  return { skillXp: MOD.skill_xp_mult, fps: global.fps, coin: MOD_MONEY.chance };
})));

console.log('\n3. xp multiplier actually changes xp granted:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  // raise the story cap first, or a capped skill simply refuses the xp;
  // level 40 so expnext dwarfs the grant and nothing overflows into a level-up
  global.flags.mod_prog = { hollow: 99, spire: 99, vigil: 99 }; MOD_CAP.current = -1; MOD_levelCap();
  const grant = () => { const s = skl.bstl; s.lvl = 40; s.exp = 0; s.expnext_t = s.expnext(); giveSkExp(s, 10); return s.exp; };
  inputs[0].value = '1'; inputs[0].dispatchEvent(new Event('change'));
  const at1 = grant();
  inputs[0].value = '7'; inputs[0].dispatchEvent(new Event('change'));
  const at7 = grant();
  return { xpAt1x: at1, xpAt7x: at7, ratio: +(at7 / at1).toFixed(2) };
})));

console.log('\n4. bad and out-of-range input is clamped, box snaps back to the truth:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  const t = (i, v) => { inputs[i].value = String(v); inputs[i].dispatchEvent(new Event('change')); return { box: inputs[i].value }; };
  const speedOver = t(1, 9999);            // max_speed clamp
  const xpZero = t(0, 0);                  // rejected, keeps previous
  const coinOver = t(2, 5);                // >1 rejected
  const junk = (() => { inputs[0].value = ''; inputs[0].dispatchEvent(new Event('change')); return inputs[0].value; })();
  return { speedBoxAfter9999: speedOver.box, maxSpeed: MOD.max_speed, fps: global.fps,
           xpBoxAfterZero: xpZero.box, xpMult: MOD.skill_xp_mult,
           coinBoxAfter5: coinOver.box, coin: MOD_MONEY.chance, xpBoxAfterBlank: junk };
})));

console.log('\n5. Enter key applies too:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  inputs[0].value = '3';
  inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return { xpMult: MOD.skill_xp_mult, focusReleased: document.activeElement !== inputs[0] };
})));

console.log('\n6. the tick refresh does NOT clobber a box the player is typing in:');
console.log('  ', JSON.stringify(await p.evaluate(async () => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  inputs[0].focus();
  inputs[0].value = '12';                 // half-typed, not committed
  ontick(); ontick(); ontick();
  const keptWhileFocused = inputs[0].value === '12';
  inputs[0].blur();
  ontick();
  const resyncedOnBlur = inputs[0].value === String(MOD.skill_xp_mult);
  return { keptWhileFocused, resyncedOnBlur, boxNow: inputs[0].value, real: MOD.skill_xp_mult };
})));

console.log('\n7. console changes flow back into the boxes:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  setSkillXp(6); setSpeed(2); setMoneyDrops(0.25);
  ontick();
  return { xpBox: inputs[0].value, speedBox: inputs[1].value, coinBox: inputs[2].value };
})));

console.log('\n8. both multipliers persist across a reload:');
await p.evaluate(() => { setSkillXp(6.5); setSpeed(3); setMoneyDrops(0.3); });
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(4000);
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const inputs = [...dom.ctrwin4.querySelectorAll('input.mod_optn')];
  return { xpMultAfterReload: MOD.skill_xp_mult, fpsAfterReload: global.fps,
           xpBox: inputs[0].value, speedBox: inputs[1].value,
           coinAfterReload: MOD_MONEY.chance, coinBox: inputs[2].value,
           coinBonusApplied: you.mods.enmondren };
})));

console.log('\n9. the settings window still opens/closes and the rest of it is intact:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  const rows = dom.ctrwin4.querySelectorAll('.opt_c').length;
  dom.ct_bt7.click(); const open = dom.ctrwin4.style.display !== 'none';
  dom.ct_bt7.click(); const closed = dom.ctrwin4.style.display === 'none';
  return { totalSettingRows: rows, opens: open, closes: closed, lw_op: global.lw_op };
})));

console.log('\n10. a normal save/load cycle is unaffected:');
console.log('  ', JSON.stringify(await p.evaluate(() => {
  skl.bstl.lvl = 4; save();
  const before = { xp: MOD.skill_xp_mult, fps: global.fps };
  load();
  return { before, after: { xp: MOD.skill_xp_mult, fps: global.fps }, bstl: skl.bstl.lvl };
})));

await p.waitForTimeout(2500);
console.log('\npage errors:', errs.length ? errs : 'none');
await b.close();
