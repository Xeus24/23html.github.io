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
| `earlybal.mjs` | **The first hours.** Walks the actual opening route — tutorial, forest, cellar, basement — with a genuinely fresh character levelled by the game's own `lvlup`, against every enemy at both ends of its level band. Fails if any matchup is a loss (`kill >= die`), a slog (over 60 swings) or a whiff-fest. `BASELINE=1` turns the mod's enemy scaling off — but only that: the player keeps every perk the mod adds, so it is not the original game. `vanilla.mjs` is the real comparison. |
| `combat.mjs` | **The whole ladder, same math.** Every tier from the tutorial to cap 110, every creature in each area at both ends of its band. Fails if anything kills you in under 5 swings or takes over 60. Both scripts drive the game's own `dmg_calc` and `hit_calc` — never the `enemyHP/playerSTR` ratio, which ignores the subtraction and reads several times off. |
| `allareas.mjs` | **The exhaustive one.** Every area in the game (31), every creature in each, at both ends of its level band, against all ten story-tier player states, in four skill builds (base game's skills alone / the mod's added skills alone / both / both with every section folded, so the ×1.34 convergence bonus is covered too) — 3,720 matchups. The three builds are the check on the added skills specifically: they are 99% of player STR by cap 110, so if the model were fitted to a curve rather than measured off the player, the builds would not read alike. The point of the cross product is that the enemy model anchors to the player's power at spawn, so `kill < die` must hold for *any* player in *any* area, including a level 1 character wandering into the Long Vigil and a capped one back in the tutorial. If it fails only at the extremes, the anchor is leaking. The two legitimate trivial cases it reports are `nwh` (holds `creature.default`, id 0, which `MOD_scaleEnemy` deliberately skips) and a lv 1 dummy in the free practice yard. |
| `fightsmoke.mjs` | End-to-end: real battles through the game's own `attack()`, nine per area, so the wrapper is exercised with the miss roll, the dodge check, the per-swing `allbuff` and death handling rather than by calling `dmg_calc` directly. Fails if a fight is lost, never resolves, or turns into a slog. Note that it re-asserts `global.flags.btl` every swing — the page's own game loop will otherwise drop you out of battle state and the duel stalls silently. |
| `fullbal.mjs` | Wider version: combat under neutral *and* favourable conditions, where player power comes from (vanilla skills vs. added ones vs. Renown vs. situational buffs), exp pacing, per-kill economy, and a dominance check for whether any single skill carries everything. |
| `titles.mjs` | Title ranks and what wearing one does: every skill grants at least four, all ten ranks populated, every rank 10 earned at level 110, nothing rank 3+ earned below level 18 (the base game had eight — Runner at 10, Rookie at 15), renown 10 near-completion, a title inert until worn or until renown covers its rank, and — the one that matters — the exp bonus writes to `skl.<x>.p` which IS saved, so it is checked against stacking over thirty ticks and across a reload. |
| `ids.mjs` | That no two things in a namespace share an id, across all fourteen of them. Ids are the save's primary key and the game matches them in loops with no `break`, so a duplicate is corruption that compounds: Fire Mastery and the Companions parent both had 2010, and the skill sheet doubled on every save/load. Also that five save/load cycles do not grow the sheet, and that a deliberately damaged one is repaired. |
| `marketplace.mjs` | That the marketplace can be reached and cannot be locked out. The "Pamphlet" is the only thing in the game that opens it and the Paper Boy retires the moment it is handed over, so selling it — which the mod's own selling allowed — took the marketplace, its shops, a quest and the realm 2-5 pills away for good. Checks that key items are unsellable and ordinary goods are not, that a stuck save recovers, that a fresh character still meets the Paper Boy exactly once, and that every added choice line fits in a 22px row. |
| `wiki.mjs` | The wiki: that it covers what the game actually contains — every skill, area, item, title, action, realm, technique, manual and pill, plus all 974 perk lines — counted from `skl`/`area`/`item`/`ttl` rather than listed, so adding content without adding it to the wiki fails here on its own. Also that it reflects the save, that the spawn shares come from `area.popc` (the bands `mon_gen` rolls against) rather than the raw weights, that the two areas which are not places stay out, that the Damp cellar has real spawn bands now and an area with none would still be tagged "nothing spawns" (it strips a live area's weights to prove it), that no group is a wall of entries, that search opens the groups it matches inside, that a page which throws does not take the rest down, and that clicking the bottom-bar button really opens a working tab. |
| `places.mjs` | The catacombs entrance and the Pill Tower: both gated and the Village Center's own choices untouched, the catacombs gate sitting on the rung below their cap so the ladder keeps its order (forest 20 → deep 30 → catacombs 40), all 26 of the author's rooms reachable with none written by the mod, `mod_t_cata` finally firing, the tower drawing and stocking without colliding with the author's own `chss.pltwr1`, and the spirit vein giving once a day and scaling with the realm. |
| `cultivation.mjs` | Realms and elemental mastery: a new character is Mortal, reaching the Qi Circulation level puts you at a bottleneck rather than advancing you, realms cannot be skipped or entered under-levelled, the pill is spent on failure as well as success, consolidating past the requirement improves the odds, a realm is worth a real multiplier and does not compound over repeated `allbuff` calls, no technique fires below Qi Refining, and techniques reach the real attack path at the advertised rate through the INT branch of `dmg_calc`. Also checks a throwing proc never costs you the swing. Since v4.0 a breakthrough also costs insight and a failure in the open causes Qi Deviation, so the attempt loops grant insight and clear deviation to keep measuring the roll alone. The road's own rules — roots, layers, insight sources, seclusion, tribulation — have **no dedicated test yet**. |
| `dojo.mjs` | The Level Advancement ladder past level 30: pills sized against what a level actually costs (`4*lvl^3 + lvl^2`, so 5.3M at level 110 — the game's best pill is 0.3% of one), the continuation hidden until the base six rungs are claimed and off every one-time screen, the base lobby left intact, one rung at a time in order and gated on level, claiming pays coin and pills, the 50/75/100 rungs offer a manual choice and are not claimed until one is picked, and the ladder stops at 110. |
| `titlepicker.mjs` | The picker groups by skill: many titles collapse to few rows, the header is the best held rather than the first earned, base-game titles group with the generated ones, the caret opens and closes without selecting, other groups stay shut, selecting from inside a group wears it and closes the window, and story titles stay loose. |
| `perkcoverage.mjs` | Every skill has perks all the way up the ladder it can now climb: none without perks, none topping out below the highest story cap, levels ascending everywhere (the save keys "granted" flags by array index), no perk text blank, and no gap over 40 levels. Before section 22, 81 of 94 skills gave nothing between level 51 and 110. |
| `actionlock.mjs` | The added actions are earned, not handed over on load: locked on a fresh character, still locked after seven seconds (the old build re-granted every five), each unlocked by its own skill milestone and no other, surviving a save/load, and absent again from a fresh save. The count is derived from `MOD_ACTIONS`, so the fifth — Closed Door Training — is covered without a literal. |
| `freeactions.mjs` | The "Unrestricted actions" checkbox: conditions bypassed and several sustained actions running at once on separate intervals while checked, base-game behaviour while unchecked, everything stopped and no orphan intervals when it is turned back off, and the setting persisted. Note it opens the actions tab first — the game's own `deactivateAct` calls `refreshAct(a.t, ...)`, and `a.t` only exists once the panel has rendered. |
| `saveslots.mjs` | The three save slots, driven through the real UI and the real `save()`/`load()`: slots stay independent, switching preserves the slot you leave, "start new save" does not touch the others, deleting one leaves the rest and the mod's settings alone, and a pre-slot save is adopted rather than orphaned. It clears `localStorage` and reloads the page repeatedly, so run it against a copy if you value what is in the browser profile. |
| `econ.mjs` | Item value model and coin income per kill against vendor prices. |
| `settings-boxes.mjs` | The settings-menu number boxes: render, apply, clamp, Enter-to-commit, don't clobber a focused box, mirror console changes, persist across reload, leave the rest of the settings window alone. |
| `areagate.mjs` | The three added areas stay hidden until golem arena IV (the base game's last normal area) is cleared, then open in order — Hollow, then Spire after 10 Hollow kills, then Vigil after 15 Spire kills — and the level caps track the doors exactly. |
| `ranks.mjs` | The rank ladder. `you.rank()` is derived from live stats, so the earned rank lives in `global.flags` and `you.rank` is wrapped to floor at it — checked that the wrapper floors and never caps, and that the held rank survives a save/load (`load()` restores fields into the You instance rather than replacing it, which is what makes the wrapper safe). Then the hall: exactly one rung offered at a time, the level gate, beaten rungs shown rather than re-offered, no line wrapping a 22px row, and the entrance sitting above the trailhead's `"<=` line. Finally all 100 matchups — 10 rungs x 10 story tiers — must hold `kill < die` with zero whiffs through the real `dmg_calc`, and the per-rung step must still leave the margin re-asserted. |
| `crafting.mjs` | The 2★-5★ ladder, and the audit that prompted it re-run live — the base game must still be unable to teach its only 3★ recipe, and must still have no 5★ one. Two of its checks guard real traps rather than being thorough: every new id must land in the block `load()` restores its namespace from (`itemgroup[(id+1)/10000<<0]`), and no rarity may exceed 6, because `equip()` does `global.text.wecs[w.rar][0]` and that table has seven entries. Then the gating (nothing before the deep forest, one node per story rung), the 22px choice rows, the Gather action refusing to run away from a node and teaching exactly its own rung, all twenty recipes making their output, the chain being a chain (the 3★ blade cannot be made before the 2★ one exists), every piece equipping, the economy pointing at crafting rather than at selling ore, and a save/load keeping materials, gear and blueprints. |
| `names.mjs` | Two things that break quietly. **Names**: ids are checked by `ids.mjs`, but the player never sees an id — section 4 shipped `skl.frg` named "Foraging" when the base game already had `skl.hvt` under that name, which is two identical skill rows *and* ten identically named titles, since section 24 derives a title's name from its skill's. Nothing errored. The author's own repeats (Chashu Ramen, Bandage, Blue Slime, Nameless, and the nine Training Grounds) are listed and allowed; anything the mod adds fails. **The hunter's quest**: `quest.hnt1` wants ten Raw Meat *held at once* and Raw Meat rots on a daily timer, so the stock converges rather than accumulating. The mod never touched the drop table but made a rabbit take ten swings instead of one, which put summer out of reach. Asserts the steady state clears the requirement in every meat area in every season, and that the raise did not turn meat into an income. |
| `targets.mjs` | **Does the enemy model deliver its own dials?** Every other balance script checks a *relation* — `kill < die`, whiff 0, nothing unwinnable — and none of them checks whether `MOD_ENEMY.kill` is actually being hit, because a single matchup can't tell you: crit rate reaches 33% and a crit is ~8x a normal swing. This samples 45 independent spawns per area and puts a **confidence interval** on the result, comparing against the target *that spawn was solved for* (`_modKillT` / `_modDieT`), not the flat dial — `killT = kill * band^hpSpread * creatureShape(...)`, so a basement rat is legitimately a five-swing kill. The statistic is the ratio measured/target, and the check is practical equivalence (the whole interval inside ±5%) rather than "contains 1.0", because at n=45 the model tracks to ±0.1% and a 1% quantisation bias would fail a significance test while meaning nothing in play. Also unit-tests `lib/stats.mjs` before trusting it. Catches the model drifting off its dials without breaking the ordering, which is invisible to every other script here. |
| `convergence.mjs` | Skill rarity and folding. Rarity comes off `MOD_rankForLevel`, the same call titles use, and every threshold lands on a different grade. The ten converged skills are unique, registered with the cap and panel maps, carry no perks and no titles, and sit at the **end** of `skl`, where positional exp slots only append. Folding costs one slip each, lowest level first, and — the claim that matters — **never shortens `you.skls`**: every stat after folding all hundred is exactly its unfolded value times the convergence bonus, a folded skill keeps levelling without being unfolded by `giveSkExp`'s re-add, the bonus does not compound over 200 refreshes or a reload, and the Slip Archive's lines fit a 22px row. |
| `vanilla.mjs` | **The mod against the original game.** Loads the page twice, once with `mod.js` blocked — the author's game exactly — and runs the same code in both. Asserts the character exp curve is identical, every skill level below `MOD_XP.vanillaTo` costs exactly what **his** `expnext` returns (read from his page, not re-derived), level 110 is exactly as far away as before, every trainable skill is on the mod's curve, and the skill exp multiplier and coin drop ship at his values. Fights are **measured, not matched**: it prints the gap on the opening route and asserts only that the mod is winnable wherever the original is and never deadlier than the deadliest fight the original lets you win. |
| `polish.mjs` | The v4.3 fixes, each held to its claim: the live `allbuff` chain runs the game's own once; the skill panel redraws once when its list changes and not every second after; the Damp cellar spawns, is posted only after the tutorial, pays once and returns you to the board; the four finished titles land at their exact thresholds and `ttl.ddcd` is untouched; the realm on the rank line appears only once cultivation begins, breaks through when clicked, refuses without a pill, and in its longest form keeps the player panel at its original height; rarity is named in the tooltip, sorts, and filters; and the What next page follows Start here and reads locked where the game is locked. |
| `backups.mjs` | Save backups. The snapshot sits before section 1 in `mod.js`, so a later section that throws cannot stop it; a first load with no save backs up nothing; a version change backs up **exactly** the blob the game is about to read, once; restoring brings the old character back after a reload and backs up the present first; three are kept, newest surviving; and a full `localStorage` skips quietly while costing at most the backup being replaced. Clears and reloads the page repeatedly. |
| `pacing.mjs` | The two pacing presets are exact — Original is the author's cost below level 10 with 1x exp and no coin drop; Mod before 4.2 is `50 x 1.106^level` at every level, masteries included, with 2x and 15% — the choice survives a reload, changing a box reads as Custom, the wiki describes the curve actually in use, and the settings row is there. |
| `capreach.mjs` | Whether a skill can actually **reach** the story cap: the game's exp curve per tier against the xp a skill really receives through the mod's grant path, in hours at 1x and at max game speed. Run it after touching the cap ladder or any xp rate. |
| `savecompat.mjs` | A save captured from the pre-v2 build (100 discovered skills, `tests/fixtures/v1-save.txt`) loads under the current build without throwing or tripping the "SOMETHING BROKE" screen; base-game progress, and every *surviving* discovered skill's level and milestone flags, come back intact; merged-away skills are simply absent. |

## `tests/lib/stats.mjs`

The one piece of shared code in this directory. Every balance number here is a
sample mean of something heavy-tailed, and until this the scripts reported
point estimates — `fightsmoke` medians nine duels, `allareas` prints one number
per matchup — with nothing to say how much of a gap was real.

- `summarize(samples)` → n, mean, sd, se, 95% CI, and `wide` when the margin
  exceeds 25% of the mean.
- `withinBand(samples, target, tolPct)` → practical equivalence. Fails two
  ways, by real deviation **or** by an interval too wide to conclude anything,
  and says which. Usually what you want over `hitsTarget`.
- `hitsTarget(samples, target)` → whether the interval covers the target.
  Sharper, but with a tight enough sample it always fails.

**Student's t, not the normal approximation.** `fightsmoke` fights nine times
per area; at n=9 the z-interval is ~15% too narrow, which is the one direction
that turns noise into a confident wrong answer. Critical values are a small
embedded table — between rows it takes the **lower-df** (wider) value, never
the narrower. There is no Python and no stats package in this repo, and adding
one to compute `mean ± t·sd/√n` would be a dependency, not an improvement.

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
- **An empty crit stratum is topped up, never dropped.** Every stratified
  estimator here keeps sampling (up to 8n) until both a crit and a plain hit
  have shown. The old fallback to a plain mean left the crits out entirely —
  30% of damage at cap 30 — and read a fight ~40% long 0.15% of the time, which
  is what used to fail the thin-margin rank duels in `allareas` at random. A new
  balance script should copy the current `meanDamage`, not an old one.

The dials are live on `MOD_ENEMY` in the browser console — `kill`, `die`,
`hit`, `hpSpread`, `atkSpread`, `margin`, `bossKill`, `bossDie` — and take
effect on the next spawn, so you can sweep by hand without an edit-reload
cycle. `setEnemyScale({kill: 12, die: 24})` takes any subset.

## Serving during development

`tests/run.sh` starts `http-server` **with** `-c-1`, so a browser is never
handed a `mod.js` from before the edit you are testing. It did not always:
without the flag http-server sends `max-age=3600`, and that surfaced once as
an `allareas` failure that would not reproduce when the script was re-run on
its own. A flaky safety net is worse than a failing one. If you serve the
folder by hand for a manual look, pass `-c-1` yourself.

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
