# Regression suite for the proto23 mod

These are the checks the mod was built against. They drive a real headless
browser at a real copy of the game, so they catch the things that actually
went wrong during development — save-format breakage, perks that silently do
nothing, DOM rows drifting out of alignment, balance regressions.

## One-time setup

```sh
cd ~/Sites/proto23
npm install                 # playwright + http-server
npx playwright install chromium
```

## Running

Start a server in the game folder, then run whichever check you want:

```sh
npx http-server -p 8080 -s .        # leave this running in one terminal
node tests/audit.mjs                # in another
```

Or let the runner handle the server for you:

```sh
./tests/run.sh                      # everything
./tests/run.sh audit realbal        # just those two
```

Both honour `PORT` (default 8080), and `CHROMIUM=/path/to/chrome` if you want
a specific binary instead of Playwright's own.

## What each one checks

| script | what it tells you |
|---|---|
| `audit.mjs` | Every milestone perk in the game: does it actually change player state, does it throw, does its text match what it does, are its levels in ascending order. Ascending order matters because the save file stores "granted" flags by array index. Expect **752 checked, 752 passing**, 3 known base-game perks that do slightly more than their text says, 0 problems of mine. |
| `audit2.mjs` | Structural safety. Save size with every skill maxed (should be ~19 KB, well under the 5 MB localStorage limit), that such a save reloads intact, that wrapped functions still return what the game expects, that the `desc` getter has a working setter, that discovery-counter baselines resync after a load instead of dumping a burst of exp, and that capped skills refuse exp without firing side effects. |
| `realbal.mjs` | **The one to run after any balance change.** Prints the exp curve, how far a passive skill can actually get in a given number of hours, and then hits-to-kill / hits-to-die per area at the skill levels players genuinely reach. Currently kill in 1–10, die in 5–42. If "die" ever hits 1–2, the game is unwinnable there. |
| `fullbal.mjs` | Wider version: combat under neutral *and* favourable conditions, where player power comes from (vanilla skills vs. added ones vs. Renown vs. situational buffs), exp pacing, per-kill economy, and a dominance check for whether any single skill carries everything. |
| `sweep5.mjs` | Grid search over `MOD_ENEMY.rate` and `hpPow`. Use it when retuning to see the whole tradeoff space at once instead of guessing. |
| `econ.mjs` | Item value model and coin income per kill against vendor prices. |
| `settings-boxes.mjs` | The settings-menu number boxes: render, apply, clamp, Enter-to-commit, don't clobber a focused box, mirror console changes, persist across reload, leave the rest of the settings window alone. |

## Reading the balance output

`realbal.mjs` prints `kill / die` — hits you need to land, and hits you can
take. Healthy targets:

- **die** should never fall below about 4. At 1–2 the area is a coin flip.
- **kill** above roughly 15 means grinding; below 2 means the area is trivial.
- The ramp should tighten monotonically from the woods to the endgame.

The four dials are live on `MOD_ENEMY` in the browser console — `base`, `rate`,
`hpPow`, `tierRate` — so you can sweep by hand without an edit-reload cycle.

## A caution

`audit2.mjs` and several others **write to your save** (they max skills, call
`save()`, call `load()`). Export a save first, or run them against a copy of
the folder. They were written as throwaway development checks, not as a suite
that politely restores what it found.
