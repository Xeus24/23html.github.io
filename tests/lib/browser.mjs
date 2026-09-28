// Which browser engine the scripts drive. Chromium by default; BROWSER=webkit
// runs the same checks on Safari's engine, BROWSER=firefox on Gecko.
//
//   BROWSER=webkit ./tests/run.sh
//
// Playwright's WebKit is the engine Safari is built on, not Safari itself, but
// it is what catches Safari's differences in JS, layout and storage.
import * as playwright from 'playwright';

const name = process.env.BROWSER || 'chromium';
if (!playwright[name]) throw new Error(`BROWSER=${name}: use chromium, webkit or firefox`);
export const engine = playwright[name];
export const engineName = name;

// CHROMIUM=/path/to/chrome only means something to Chromium
export function launch() {
  return engine.launch(name === 'chromium' && process.env.CHROMIUM
    ? { executablePath: process.env.CHROMIUM } : {});
}

// The page is ready once the game has ticked twice after loading: the save is
// read by then (the window 'load' listener runs before the goto resolves) and
// everything the mod does on its first ticks has happened. Counted from here,
// not from zero, because a loaded save carries its own global.stat.tick. This
// replaced a flat 4.5-second wait in every script; ticks are a second each.
export async function settle(page, ticks = 2) {
  await page.waitForFunction(() => typeof global === 'object' && global.stat && typeof global.stat.tick === 'number',
    null, { timeout: 20000 });
  await page.evaluate((n) => new Promise(res => {
    const start = global.stat.tick;
    const iv = setInterval(() => { if (global.stat.tick - start >= n) { clearInterval(iv); res(); } }, 25);
  }), ticks);
}
