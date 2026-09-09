# proto23 mod — working notes for Claude

## What this is

A mod for a single-file idle RPG. The game is `index.html`: 837 KB, ~14,800
lines, **not minified**, every global declared with `var` at top level, no
strict mode. That is what makes the mod possible.

`mod.js` is the entire mod, loaded by one appended script tag at the very
bottom of `index.html`:

```html
<!-- local mod: remove this line to disable -->
<script src="mod.js"></script>
```

Because it loads last and shares global scope, it can read and wrap anything
the game defines. That single tag is the **only** change to `index.html` —
keep it that way, so `git checkout index.html` is always a clean undo.

`MOD-NOTES.md` is the full design record, section by section, with the
reasoning behind each decision and what was tested. Read the relevant section
before changing anything in that area.

## How to change things

Wrap, don't edit. The pattern used throughout:

```js
var MOD_thing_original = thing;
thing = function () {
  var r = MOD_thing_original.apply(this, arguments);
  /* extra behaviour */
  return r;                      // always preserve the return value
};
```

Preserving the return matters: `allbuff` does `let dm = skl.fgt.use()` and
adds the result to stats, so a wrapper that swallows a return silently
changes the game's math.

## Save format constraints — read before adding content

The game's save/load is positional in places, which means some things are
append-only. Getting this wrong corrupts existing saves.

- **Milestone "granted" flags are stored by array index.** Milestones must be
  appended, never inserted or reordered, and their levels must stay ascending.
  `tests/audit.mjs` checks this.
- **Skill `exp` and `p` are stored positionally** over `for..in skl`. New
  skills go at the **end** of `skl`, which happens naturally since `mod.js`
  runs after the game script.
- **Actions are stored by id**, so those are safe to add anywhere.
- On load, milestones re-fire **before** `p` is restored. So a perk must never
  do `sk.p += 0.1` — the restore would wipe it. Use a declarative flag on the
  milestone (`xpBonus`, `sectionXp`) read at point of use instead.
- `you.res` and `you.mods` are saved. Any mutation of them needs delta
  tracking in `global.flags` or it compounds on every load. See
  `MOD_applyMoneyDrops` for the pattern.

## DOM constraints in the skill panel

The game's per-second updater reads fixed child indices **within** each skill
row: `children[0]`, `children[1]`, `children[2].children[0]`. So:

- `dom.skcon.children[m]` must stay aligned with `you.skls[m]`.
- Never insert an element as a row's first child. Section headers are appended
  **last** with `order:-1; flex:0 0 100%` — `.skwmmc` is `display:flex`, so
  that puts them visually first without shifting indices.

## Balance

Enemy dials on `MOD_ENEMY`, live in the browser console:

```js
kill: 8, die: 20, hit: 0.45, margin: 1.5,
hpSpread: 0.6, atkSpread: 0.3, bossKill: 2.0, bossDie: 0.7, armor: 1.0
```

**The skill exp curve is the mod's, not the game's.** The base game's
`expnext = 50 + (lvl+1)^log(9*lvl+1)` is super-exponential — 109→110 alone costs
1.16e14 xp, so the cap ladder was unclimbable by a factor of ~10¹³. Section 19
replaces it, per skill instance, with

```js
MOD_XP = { base: 50, ratio: 1.106 }   // expnext = base * ratio^lvl
```

tuned so a steadily-ticking skill reaches **level 110 in about six months** at
1x. Only skills are re-curved; `you.expnext` (character level) is left alone.
The full ladder 10/15/20/30/40/50/60/75/90/110 is genuinely reachable, so
**model the player AT the cap** — that is what the tests do.

### The enemy model, and why it looks the way it does

`dmg_calc` is **subtractive in both directions**: an attack does
`attacker.str - defender.str` (plus weapon, plus 1, plus crits). The defender's
STR *is* their armour. Four consequences, all load-bearing:

* **Never scale enemy `strm`.** Raising it raises offence and armour together,
  and once armour passes the attacker's STR the damage does not get small, it
  clamps to **zero**. `MOD_ENEMY.armor` exists so this stays visible; leave it
  at 1. The same applies to `aglm`, which is the denominator of `hit_calc(1)`.
* **Never judge a fight by a stat ratio.** `enemyHP/playerSTR` and
  `playerHP/enemySTR` both ignore the subtraction and read several times off.
  That proxy is what hid a tutorial fight needing 63,000 swings and a whole
  ladder of `kill 1 / die 1`. Measure through `dmg_calc` and `hit_calc`.
* **Nothing is replicated, everything is measured.** The base game's defence
  term goes *negative* at high skill levels (`shdc` at 110 makes its last
  multiplier −12.3, so your defence is added to the enemy's damage), and it is
  ill-conditioned besides. Each spawn runs the real `dmg_calc` a few times in
  both directions inside `MOD_probe` — which parks `giveSkExp`, the crit flag
  and the DOM node it jiggles — and scales against what actually came out.
* **The dials are two-sided.** Flooring every multiplier at 1 so nothing is
  weaker than vanilla leaves pockets the base game itself made unwinnable.

Scaling is anchored to the player's power at spawn, not fitted to a level,
because within tier 0 alone the player goes from STR 1 to STR ~265. Variety
comes from the area's level band and each creature's own `stat_p`, and
`margin` guarantees `kill < die` however those compound.

Damage is heavy-tailed at the top of the ladder: crit rate reaches 33% and a
crit is about 8x a normal swing, so crits carry roughly three quarters of all
damage. `MOD_meanDamage` therefore strata on the crit roll rather than taking a
plain sample mean — the variance of a plain mean is almost entirely "how many
crits landed", and enemy HP comes straight off that number. `fightsmoke` fights
nine times per area and reports a median for the same reason.

**Any script that samples `dmg_calc` must park `giveSkExp` first** (`quiet()` in
the test scripts, `MOD_probe` in the mod). `dmg_calc` grants skill exp, so
sampling it levels the player mid-measurement.

Run `./tests/run.sh earlybal combat fightsmoke` after any balance change,
`allareas` (all 2,490 matchups: every area x every creature x every tier x
three skill builds) before calling one finished, and `capreach` after touching the curve or any xp rate.
What matters:

- **`kill < die` at every matchup** — every balance script fails on this.
- **`whiff%` at 0** — anything above means damage is being eaten.
- `epow` on `MOD_TIERS` no longer feeds difficulty (the player anchor replaced
  it) but `modCaps()` and the tests still read it. Tests select a tier by
  **index** (`setTier(9)`), not by cap number.

## Content gating

- The three added areas (Sunken Hollow / Ashen Spire / Long Vigil) are hidden
  until `global.flags.trne4e1` — golem arena IV cleared, the base game's last
  normal area — and then open in order on the same kill counts that drive their
  caps. `tests/areagate.mjs` guards this.
- **The catacombs are unreachable in the base game.** All 26 locations exist but
  nothing links into `chss.catamn`, so `mod_t_cata` can never fire and the cap-40
  rung is dead (harmlessly — arena I-II grants cap 50 anyway). See MOD-NOTES.
- `chs(txt, true, ...)` calls `clr_chs()` and wipes everything already drawn for
  that location. Only the *first* line of an `sl()` may pass `true`; every later
  line, including greyed-out hints, must pass `false`.

## Titles

Rank (`rar`) runs **1-10 and is derived from the level that earns the title**
(`MOD_RANK_AT`), never hand-assigned — the base game gave rank 3 at skill level
8. Every skill grants five titles, at levels 25/50/75/90/110, folded into the
milestone already at that level (a second milestone at the same level is a
duplicate the save cannot tell apart by index).

- A title's exp bonus writes to `skl.<x>.p`, which **is saved and is restored
  after milestones fire**. Never set it from milestone code; it is reconciled on
  the tick against `global.flags.mod_ttlxp`, like section 13 does for `you.res`.
- Only the **worn** title applies, until renown level N makes rank ≤ N passive.
  Base-game `talent`s are a separate, already-permanent mechanism — don't
  conflate them.

## Perks and the changelog

Every skill has perks at `10/25/50/60/75/90/110` (section 22). New ones are
**appended above the skill's current highest level** — never inserted — because
"granted" flags are stored by array index. `tests/perkcoverage.mjs` fails if any
skill tops out below the highest story cap.

- A perk must never touch `skl.<x>.p`. Skill xp multipliers are restored from
  the save *after* milestones fire, so the bonus is overwritten on the load that
  first grants it and `g` is true forever after. Stats restore *before*
  milestones, so those are safe.
- Absorption perks use `you.caff`, not `you.res` — section 13 already drives
  `you.res` continuously for those skills and reconciles it through
  `global.flags.mod_aff`.

**`changelog/changelog.html` gets an entry for every change.** The mod's block
sits at the top under a gold header, newest first, above the base game's own
entries. It is reachable in game from the `changelog` button in the bottom bar.
This and the one script tag in `index.html` are the only files outside the mod's
own that it touches.

## Actions

The mod adds four actions. They are **earned**, from milestones on base-game
skills, the same way `skl.walk` lv 1 grants the base game's "Run":
Toughness 4 → Endurance Drill, Harvesting 4 → Forage, Temperance 5 → Circulate
Qi, Literacy 8 → Practice Calligraphy. Do not go back to granting them on a
timer.

- Milestone flags are stored **by array index**, so a gating milestone must be
  appended and levels must stay ascending. Section 3 already appended level-50
  milestones to Walking, Meditation, Foraging, Patience, Fighting and Sleeping,
  so those skills cannot take a low-level gate at all.
- `tests/audit.mjs` counts `acts.length` as player state, so a perk that only
  grants an action still registers as doing something.

`MOD_FREE` / the "Unrestricted actions" checkbox lets several run at once and
ignores every `cond()`. It works by swapping the shared `timers.actm` slot
around each action's own activate/deactivate rather than reimplementing them —
see section 21 before touching it. Turning it off stops everything.

## Save slots

The game has one save, at localStorage `"v0.3"`, read once from a `window` load
listener. Section 20 keeps that key holding whichever of three slots is live and
mirrors each slot beside it (`p23_slot_N`), wrapping `save()` to refresh the
mirror. Switching or starting a new game writes `"v0.3"` and reloads — the game
builds its world at startup and cannot unload a save.

- **Boot adopts, never overwrites.** A missing mirror is filled from `"v0.3"`;
  the live key is never written from a mirror, which could only be staler.
- `save()`'s return value is the blob and the export button reads it, so the
  wrapper must pass it through.
- The base game's "delete the save" was `localStorage.clear()` — it is rebound
  to the active slot only, by cloning the node to drop the anonymous listener.

## Testing

```sh
npm install && npx playwright install chromium   # once
npm test                                          # everything
./tests/run.sh audit combat                       # a subset
```

`tests/README.md` explains what each script covers. Note that several of them
**write to the save** — export one first, or run against a copy.

Always finish a change with `node --check mod.js` (`npm run check`) plus the
relevant test script. The mod is ~3,650 lines of wrappers around a codebase
with no types and no module boundaries; the tests are the only safety net.
