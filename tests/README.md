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
./tests/run.sh audit combat         # just those two
```

Both honour `PORT` (default 8080), and `CHROMIUM=/path/to/chrome` if you want
a specific binary instead of Playwright's own.

## What each one checks

| script | what it tells you |
|---|---|
| `audit.mjs` | Every milestone perk in the game: does it actually change player state, does it throw, does its text match what it does, are its levels in ascending order. Ascending order matters because the save file stores "granted" flags by array index. Expect **474 checked, 474 passing**, 3 known base-game perks that do slightly more than their text says, 0 problems of mine. |
| `audit2.mjs` | Structural safety. Save size with every skill maxed (should be ~16 KB, well under the 5 MB localStorage limit), that such a save reloads intact, that wrapped functions still return what the game expects, that the `desc` getter has a working setter, that discovery-counter baselines resync after a load instead of dumping a burst of exp, and that capped skills refuse exp without firing side effects. |
| `earlybal.mjs` | **The first hours.** Walks the actual opening route — tutorial, forest, cellar, basement — with a genuinely fresh character levelled by the game's own `lvlup`, against every enemy at both ends of its level band. Fails if any matchup is a loss (`kill >= die`), a slog (over 60 swings) or a whiff-fest. `BASELINE=1` turns the mod's enemy scaling off so you can see the base game's numbers through the same harness. |
| `combat.mjs` | **The whole ladder, same math.** Every tier from the tutorial to cap 110, every creature in each area at both ends of its band. Fails if anything kills you in under 5 swings or takes over 60. Both scripts drive the game's own `dmg_calc` and `hit_calc` — never the `enemyHP/playerSTR` ratio, which ignores the subtraction and reads several times off. |
| `allareas.mjs` | **The exhaustive one.** Every area in the game (21), every creature in each, at both ends of its level band, against all ten story-tier player states, in three skill builds (base game's skills alone / the mod's added skills alone / both) — 2,490 matchups. The three builds are the check on the added skills specifically: they are 99% of player STR by cap 110, so if the model were fitted to a curve rather than measured off the player, the builds would not read alike. The point of the cross product is that the enemy model anchors to the player's power at spawn, so `kill < die` must hold for *any* player in *any* area, including a level 1 character wandering into the Long Vigil and a capped one back in the tutorial. If it fails only at the extremes, the anchor is leaking. The two legitimate trivial cases it reports are `nwh` (holds `creature.default`, id 0, which `MOD_scaleEnemy` deliberately skips) and a lv 1 dummy in the free practice yard. |
| `fightsmoke.mjs` | End-to-end: real battles through the game's own `attack()`, nine per area, so the wrapper is exercised with the miss roll, the dodge check, the per-swing `allbuff` and death handling rather than by calling `dmg_calc` directly. Fails if a fight is lost, never resolves, or turns into a slog. Note that it re-asserts `global.flags.btl` every swing — the page's own game loop will otherwise drop you out of battle state and the duel stalls silently. |
| `fullbal.mjs` | Wider version: combat under neutral *and* favourable conditions, where player power comes from (vanilla skills vs. added ones vs. Renown vs. situational buffs), exp pacing, per-kill economy, and a dominance check for whether any single skill carries everything. |
| `econ.mjs` | Item value model and coin income per kill against vendor prices. |
| `settings-boxes.mjs` | The settings-menu number boxes: render, apply, clamp, Enter-to-commit, don't clobber a focused box, mirror console changes, persist across reload, leave the rest of the settings window alone. |
| `areagate.mjs` | The three added areas stay hidden until golem arena IV (the base game's last normal area) is cleared, then open in order — Hollow, then Spire after 10 Hollow kills, then Vigil after 15 Spire kills — and the level caps track the doors exactly. |
| `capreach.mjs` | Whether a skill can actually **reach** the story cap: the game's exp curve per tier against the xp a skill really receives through the mod's grant path, in hours at 1x and at max game speed. Run it after touching the cap ladder or any xp rate. |
| `savecompat.mjs` | A save captured from the pre-v2 build (100 discovered skills, `tests/fixtures/v1-save.txt`) loads under the current build without throwing or tripping the "SOMETHING BROKE" screen; base-game progress, and every *surviving* discovered skill's level and milestone flags, come back intact; merged-away skills are simply absent. |

## Reading the balance output

Both balance scripts print `kill / die` — swings you need to land, and swings
you can take, each already including miss chance. The enemy model solves for
these directly, so they should sit near `MOD_ENEMY.kill` and `MOD_ENEMY.die`
with spread from the area's level band and each creature's own `stat_p`:

- **kill < die** at every single matchup. The model guarantees a `margin`
  between them; if this is ever violated, something bypassed `MOD_scaleEnemy`.
- **whiff%** must stay at 0. Anything above means the defender's STR is eating
  the attacker's damage — the failure mode the old model died of.
- Wide `kill` spread within a row is intended: that is the level band and
  creature identity doing their job.

The dials are live on `MOD_ENEMY` in the browser console — `kill`, `die`,
`hit`, `hpSpread`, `atkSpread`, `margin`, `bossKill`, `bossDie` — and take
effect on the next spawn, so you can sweep by hand without an edit-reload
cycle. `setEnemyScale({kill: 12, die: 24})` takes any subset.

## A caution

`audit2.mjs` and several others **write to your save** (they max skills, call
`save()`, call `load()`). Export a save first, or run them against a copy of
the folder. They were written as throwaway development checks, not as a suite
that politely restores what it found.

The balance scripts park `giveSkExp` while they sample (`quiet()` in each).
`dmg_calc` grants skill exp — `seye` on a crit, the affinity skills on incoming
damage — and sampling it tens of thousands of times will otherwise level the
player mid-sweep and quietly invalidate everything measured afterwards. That bug
looked exactly like a balance failure: `die` collapsing to 5 in one build, with
max HP dropping 2.5x between the spawn and the measurement. If you write a new
balance script, do the same thing. `MOD_scaleEnemy` parks them for this reason
too.
