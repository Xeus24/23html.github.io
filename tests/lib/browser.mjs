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
