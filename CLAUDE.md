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

## The bottom bar

Buttons added to `dom.sl` must match the game's own: plain `inline`, `padding:3px`,
no `display:inline-block`. An inline-block forces the line box to grow, which
made the fixed bar 32px instead of 24px and covered the bottom of the panel
above it. The bar is `position:fixed`, so any height it gains eats game screen.

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

**The skill exp curve is the author's below level 10, and the mod's above.**
The base game's `expnext = 50 + (lvl+1)^log(9*lvl+1)` is super-exponential —
109→110 alone costs ~1.2e14 xp, so the cap ladder is unclimbable by ~10¹³. But
the author only designed skills up to 15 (his 22 perk ladders end between 1 and
15, median 10), and below that his curve is fine. So section 19 is in two parts:

```js
MOD_XP = { vanillaTo: 10, total, ratio }   // levels < 10: HIS formula, exactly
                                           // from 10: his level-9 cost * ratio^n
```

`ratio` (~1.029) is **solved**, not chosen: it is whatever makes 0→110 cost the
same wall-clock time the old `50 * 1.106^lvl` curve took at its 2x multiplier.
The end is exactly as far away; the time is spread evenly instead of the old
curve's "cap 60 in under an hour, then months on the last twenty levels".

- **Why 10 and not 15.** His level 15 alone costs 823k; 95 more levels even at
  that flat price is 78M xp, 2.5x the whole budget. 10 is the highest start that
  still leaves a rising ramp. `setXpCurve({vanillaTo})` accepts 0-12.
- **The curve is installed twice — at section 19 and at the very END of mod.js.**
  It used to run once, and every skill created later kept the author's curve:
  section 29's six masteries cost 7,474,050 xp at level 20 instead of 375, so
  their ladders to 110 stopped climbing at ~20. Keep the final call last.
- **The defaults are the original's:** `MOD.skill_xp_mult` 1 (was 2) and
  `MOD_MONEY.chance` 0 (was 0.15 — the author only turns the coin drop on through
  the Coin Ring and Ring of Greed, and a 15% base made both rounding errors).
  Both are settings boxes persisted in localStorage, so a value the player set
  still wins.

`tests/vanilla.mjs` holds all of this against the author's own page — it blocks
`mod.js` so the one script tag loads nothing — and asserts every level below 10
costs exactly what HIS `expnext` returns, not a reimplementation of it.

The full ladder 10/15/20/30/40/50/60/75/90/110 is genuinely reachable, so
**model the player AT the cap** — that is what the tests do.

### Fights are the one axis that deliberately does NOT match the original

At equal progression the original's opening route is nearly free: median 1.2
swings to kill and ~25,000 to die, because its creatures are fixed and you
out-level them. The mod's enemy model exists to remove out-levelling and holds
every fight near 8.8 / 22. `tests/vanilla.mjs` prints that gap and asserts only
what must hold either way — winnable wherever the original is, never deadlier
than the deadliest fight the original lets you win. Matching it would mean
switching the scaling off in the author's areas, and the meat drop (section 36)
is tuned to the mod's kill times; treat it as a design decision, not a dial.

An earlier comparison showed the original as a wall of unwinnable fights. That
was the old skill curve: it handed the original's player far lower skills for
the same xp. Compare at equal skill levels, which the matched curve now gives.

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

### Uncertainty: `tests/lib/stats.mjs`

Every balance number here is a sample mean of something heavy-tailed, so a
point estimate cannot say whether a gap is real. `summarize()` gives a 95% CI,
`withinBand(samples, target, tolPct)` asks the question that usually matters —
is it *practically* on target — and `fightsmoke` and `targets.mjs` both use it.

- **Student's t, not z.** `fightsmoke` fights nine times per area; z at n=9 is
  ~15% too narrow. Between table rows `tCrit95` takes the lower-df (wider)
  value, never the narrower.
- **Compare against the per-spawn target, never the dial.** `MOD_ENEMY.kill` is
  the centre of a distribution: `killT = kill * band^hpSpread * creatureShape()`,
  clamped. A basement rat is legitimately a five-swing kill. Use `_modKillT` /
  `_modDieT`, which `MOD_scaleEnemy` leaves on the spawn.
- **Fold in the hit rate.** The targets count swings *including misses*, while
  `abl.default.f` returns damage per landed hit and never rolls to-hit. Miss
  this and every ratio comes back multiplied by `MOD_ENEMY.hit` — a die ratio of
  exactly 0.45 is the tell.
- **Equivalence, not significance.** At n=45 the model tracks its targets to
  ±0.1%, so "does the CI contain the target" fails on a 1% quantisation bias
  that means nothing in play. `targets.mjs` uses a ±5% band.
- **An empty stratum is topped up, never dropped.** Every stratified estimator
  (mod.js `MOD_meanDamage` and the five test copies) used to fall back to a plain
  mean when n swings rolled no crit. That does not average the crits badly — it
  DROPS them, and at cap 30 they are 30% of all damage. In the mod it sized ~5%
  of spawns ~20% weak (Tallyman p5 kill/target 0.795 → 0.968 after); in
  `allareas` it read a fight ~40% long 0.15% of the time, which across 2,790
  matchups intermittently failed the rank duels, whose margin was only 1.25
  (now `MOD_RANK_MARGIN` 1.4, since v4.3).
  They now keep sampling (up to 8n) until both strata show.
- And the crit stratification the section above demands applies here too: a
  plain sample mean put two of forty-five rank-duel spawns the wrong side of
  `kill < die` on noise alone.

### The body maximums: write the multiplier, not the total — FIXED

`hpTrack` (sections 9/10) used to **assign** `you.hpmax` at the end of the
`allbuff` wrapper. The assignment did not survive: `stat_r` recomputes hpmax as
`(hp_r + hpa) * hpm * hpe`, and the tick, `fght`, `update_d` and `allbuff`
itself all call it constantly. Measured on a cap-60 character, one `stat_r()`
took hpmax from **1,492,947 to 72,377** — a 20x collapse — and sampling every
137ms across six seconds of real play found the low number in all 43 samples.
The HP bar agreed: `hp: 2,438/10,050`.

Every balance script reads `you.hpmax` in the instant after `allbuff` while the
assignment still stands, and so does `MOD_scaleEnemy` when it sizes `_modDmg`.
So the enemy's damage was built for a character with ~18x the health the
character actually had, and all 2,790 `allareas` matchups were validating
against a number the player never held.

It now writes `you.hpm`, which IS an input to `stat_r` and therefore survives.
Three things that took a correction each:

- **`hpm` is saved** (`hpm:you.hpm` in the save object), so the mod's factor is
  tracked in `global.flags.mod_hpm` and divided back out before re-applying —
  the same delta pairing `MOD_applyMoneyDrops` uses, and for the same reason
  `you.res` once compounded on every load.
- **The recovered base is floored at 1.** Anything that resets `hpm` without
  clearing the flag — a test harness rebuilding the player, a new game keeping
  flags — otherwise recovers `1/18.86` and max HP collapses. Flooring is an
  invariant, not a guess: only milestones touch `hpm`, and they add. Without
  it `allareas` reported the player at **12 max HP** and six rank duels flipped
  to `kill > die`.
- **`Math.ceil`, not `Math.round`** — `stat_r` ceils, and the two have to agree
  to the unit or this call and the next report max HP one apart.

`stat_r()` is deliberately **not** called from inside the wrapper: the mod's
skill `use()` calls add straight into `you.str` and friends, and `stat_r` would
recompute those from `(r + a) * m * e` and wipe them. Setting `hpmax` by hand
alongside `hpm` keeps the current call right and lets the next `stat_r` reach
the same number on its own. `tests/targets.mjs` checks all of it, and fails
against the old behaviour.

**The same bug was still in the realm code**, found while extending it (v4.0).
Section 28 raised max HP *and max energy* by assigning `you.hpmax`/`you.satmax`,
and `stat_r` recomputes **both**:

```js
hpmax  = ceil((hp_r  + hpa ) * hpm  * hpe )
satmax = ceil((sat_r + sata) * satm * sate)
```

Measured on a realm-10 character: `hpmax` 332 after `allbuff` and **39** after
one `stat_r`; `satmax` 1700, then **200**. The ×8.5 the top realm advertised
lasted one call, so ten realms of body were decoration.

**Nothing writes `hpm` or `satm` any more.** Two contributors wanted the same two
fields, and two delta-trackers on one field cannot coexist — each recovers its
base by dividing out *its own* factor and finds the other's sitting inside that
base. So contributors publish a factor to **`MOD_BODY`** and `MOD_applyBody()`
writes the product, once, with one delta flag per axis (`mod_hpm`, `mod_satm`).

- To add a contributor: give it a key on `MOD_BODY.hp` / `MOD_BODY.sat`, set that
  key **every call** for `you` — to 1 when it does not apply, or last call's
  factor lingers — and never touch `hpm`, `satm`, `hpmax` or `satmax` yourself.
- `MOD_applyBody()` is **idempotent**, which is what lets more than one wrapper
  call it. Sections 28 and 38 both do. `tests/cultivation.mjs` asserts it.
- `satm` is saved (`satm:you.satm`) exactly like `hpm`, so it needs the delta
  pairing for the same reason `you.res` did.
- The recovered base is floored at 1 on both axes, for the reason above.

Note that `mod.js:1862` assigns `you.hpmax` in a **dead wrapper** — sections 6, 7
and 19 each re-anchor to `MOD_allbuff_original`, so only section 10's and section
28's wrappers are in the live chain. Measured: the game's `allbuff` runs once per
call, and `skl.qic.use()` once. Left in place with the others; don't "fix" it
expecting an effect.

## How big numbers are written (section 40)

The mod's numbers are enormous next to the original's, which READS like a balance
problem but is not one — section 8 scales enemies to the player, so a fight is
the same length at STR 50 or 5,000,000. A `Number format` settings row (and
`setNumberFormat()`) picks `game` / `short` / `sci` / `myriad`, default `short`.

- **Up to 9,999 every mode prints exactly what the original prints** — commas
  where he used `format3`, bare where he used `Math.round`. The threshold is his:
  `printDamageNumber` does `if(ddmg>9999) formatw(ddmg);` and **discards the
  result**, so his damage log never compacted anything. The wrapper hands it an
  already-formatted string, which makes his `>9999` test false (NaN).
- `myriad` (万 10⁴, 亿 10⁸ …) is his notation: `m_update` draws the wallet with a
  10⁸ coin, `㊧`, over 10⁴ groups.
- `game` mode is the original byte for byte, bugs included — past 10²¹ his
  `format3` inserts commas into exponential notation (`7,.7e,+47`).
- Every site is wrapped, not replaced: `formatw`, `update_db`, `update_m`, the
  three bars, `dom.d6.update` (after section 34's gold held-rank paint, which it
  leaves alone), `m_update`, `printDamageNumber`. Choose decimals AFTER rounding
  (`MOD_sigFig`) or 99,996 prints as "100.0K".

## The screen: the rank line, the skill panel, and What next (sections 42-43)

- **The player panel is a fixed 310px box and it is full** (307px used). Never
  give it a new line. The realm lives at the end of the rank line (`dom.d6`),
  nowrap + ellipsis, as ONE persistent span re-appended after each
  `dom.d6.update` rewrite (so its tooltip listeners survive). At a bottleneck the
  span is the breakthrough button and calls `MOD_breakthrough` unchanged.
- **ASCII only on that line.** The game's font is MS Gothic; where it is missing,
  a symbol like ▲ or ⚠ falls back to a font with a taller line box — measured,
  ▲ grew the line 1px and ⚠ 6px, pushing the panel past 310px. `½` is safe.
  `tests/polish.mjs` asserts the longest possible line keeps panel height.
- **The skill panel's per-second updater is the mod's now.** The game's captures
  `sklsize` once and never updates it, so after the list first grows it rebuilt
  every row every second forever (265 redraws in 5s at 53 rows), and it never
  noticed a shrink. `MOD_skillUpdater` replaces it in the same `timers.sklupdate`
  slot the game clears on close, keeps the row update line for line, and redraws
  on any change of length.
- Rarity filter and sort go through section 13's hide branch and
  `MOD_skillCmp`, like everything else in that panel.
- **`dom.ch_1` is not the first line of a screen.** `chs()` reassigns it on every
  call, so it holds the LAST line drawn. To test which screen is up, read
  `dom.ctr_2.children[0]`.
- **What next** (`MOD_whatNext`, wiki page `next`, console `modNext()`) calls the
  same gate each system uses — `MOD_tierFlag`, `MOD_atBottleneck`,
  `MOD_hollowCleared`, the crafting tiers' `gate()` — and never restates a
  threshold. A new progression track should add a line there.

## Content gating

- The three added areas (Sunken Hollow / Ashen Spire / Long Vigil) are hidden
  until `global.flags.trne4e1` — golem arena IV cleared, the base game's last
  normal area — and then open in order on the same kill counts that drive their
  caps. `tests/areagate.mjs` guards this.
- **The catacombs are reachable now** (section 30). All 26 rooms are the
  author's; the mod adds only the Village Center entrance, which is where their
  own exit already led. Gated on `mod_t_deep` **for a reason**: entering sets
  `mod_t_cata`, the cap-40 rung, so an ungated door would hand a fresh character
  cap 40 straight out of the tutorial, past the forest's 20 and the deep
  forest's 30. Any new area that sets a tier flag needs the same care.
- **The Pill Tower** is `chss.mod_pltwr`, deliberately not `chss.pltwr1` — the
  author wrote that choice on the Village Center and commented it out, and the
  two must not collide if they ever finish theirs.
- `chs(txt, true, ...)` calls `clr_chs()` and wipes everything already drawn for
  that location. Only the *first* line of an `sl()` may pass `true`; every later
  line, including greyed-out hints, must pass `false`.

## Cultivation

Realms are **derived from `MOD_RANK_AT`** — the same thresholds title ranks use
— so realm N is the level that earns a rank N title. Never restate the levels;
retuning the ranks must move the realms with them. `tests/cultivation.mjs`
asserts the alignment.

**Every breakthrough pill must have a source.** The ladder shipped once with
none of them obtainable — the items existed and nothing gave, dropped or sold
them, so realms were console-only. Realm 1 comes from the instructor at the Qi
unlock, 2-5 from `vendor.pha1` (the Herbalist), 6-10 from the dojo's
continuation rungs. `tests/cultivation.mjs` fails if any realm's pill is
orphaned. Realm 1 must not come from the marketplace: that is gated behind the
Paper Boy at 40% a visit, and realm 1 opens long before it.

Realms live in `global.flags.mod_realm` and the bonus is applied **in
`allbuff`** — never written into `you.stra`/`strm`, or it would compound on
every load. Reaching a Qi Circulation level does not advance the realm; it opens
a bottleneck that costs a breakthrough pill and can fail.

Elemental techniques are a **proc inside a wrapped `you.battle_ai`**, because
combat is automatic and there is no ability picker. They use `stt: 2` so they
route through the INT branch of `dmg_calc`. The wrapper must keep swallowing
errors and falling through to the ordinary attack — a bug in a proc must never
cost a swing.

**A skill created after section 10/11 is invisible to their maps.** Register it:
`MOD_KEY_BY_ID[sk.id] = key` (cap system) and
`MOD_PARENT_OF[key] = MOD_PARENT_KEY[MOD_sectionOf(sk)]` (panel grouping).
Nothing errors if you forget — the skill just silently loses its cap and its
section.

## The dojo

`chss.t3.sl` is a long `else` chain with several one-time screens inside it —
the first skillbook choice, the accessory gift, the named-manual choice — plus
a **"Level Advancement"** ladder drawn by an anonymous handler nested inside it.
Read all of it before adding anything: a first attempt at extending the dojo
missed both Level Advancement and the second grade of skillbook that already
existed.

Section 27 continues that ladder from 35 to 110 in fives, as its own lobby entry
gated on `dj1rw6` (the nested handler cannot be appended to). Spirit pills are
sized against `4*lvl^3 + lvl^2`, the character exp curve — a level at 110 costs
5.3M, so the base game's best pill is worth 0.3% of one.

## Titles

Rank (`rar`) runs **1-10 and is derived from the level that earns the title**
(`MOD_RANK_AT`), never hand-assigned — the base game gave rank 3 at skill level
8. Every skill grants five titles, at levels 25/50/75/90/110, folded into the
milestone already at that level (a second milestone at the same level is a
duplicate the save cannot tell apart by index).

- A title's exp bonus writes to `skl.<x>.p`, which **is saved and is restored
  after milestones fire**. Never set it from milestone code; it is reconciled on
  the tick against `global.flags.mod_ttlxp`, like section 13 does for `you.res`.
- Colours come from `MOD_RANK_COLOUR` (ten ranks). The game's own rank 7
  tooltip branch **throws** — it sets `this.dl`, undefined in a type 5 call —
  so `dscr` is wrapped to park the rank at 1 (a branch-less value) and paint
  the label afterwards. Do not remove that wrapper.
- Only the **worn** title applies, until renown level N makes rank ≤ N passive.
  Base-game `talent`s are a separate, already-permanent mechanism — don't
  conflate them.

### How a title finds its group

`MOD_TITLE_SKILL` attributes a title to a skill in four passes, each derived
from something already stated — never a per-title table:

1. `MOD_SKILL_TITLES` — the generated five per skill know their own skill.
2. `MOD_FLAGSHIP` — section 17 already pairs the skill with the title it
   grants. Read the pairing; the milestone closure captures the row in a
   variable, so pass 3's source scan cannot see a literal to match.
3. Scanning each milestone's `f` source for a `giveTitle(ttl.x)` /
   `MOD_title('x')` literal.
4. **The author's numbered tiers**, keyed `<skill><n>` — `tghs1/2/3`,
   `srd3/srd4`, `dth4`, `rtr1`, `axc3`. Most are granted by nothing at all, so
   pass 3 cannot see them. **The trailing digit is load-bearing**: without it
   the stem of `ttl.thr` ("Thrasher", for smashing the dojo's equipment) is
   `thr`, which is `skl.thr`, Throwing. Only the numbered convention is safe to
   read this way, and an ambiguous stem prefix is left alone.

What no skill claims is bucketed by the same digit-stripped stem into
**ladders** — `kill1..5`, `geti1..4`, `ttsttl1..4`, `mod_realm1..10` and so on.
Membership is derived; `MOD_TITLE_FAMILY` holds only a *label per family*, with
the lowest-ranked member's name as the fallback. A family of one is not a
family — it falls back to a plain row. The picker and the wiki's title page
both read this, so they cannot drift apart.

- The picker **skips** a title with no usable name; the wiki **keeps** it and
  tags it "unfinished". The author left five. Section 41 finished the four
  whose intent is in his code — `shpt2`/`shpt3` at the 5,000 / 10,000
  purchases his commented-out checks name, `mone2`/`mone3` at 10 / 100 gold
  (his checks were placeholders at `GOLD`, his other ladders step 5-10x). The
  new checks are pushed onto his own `global.shptchk` / `global.monchk`, so
  they run at his call sites. **`ttl.ddcd` is left alone on purpose**: name
  and desc are `"null"` and nothing says what it was for. It is NOT the
  missing first rung of the stay-home ladder — that exists as `ttl.neet`.
- `tests/wiki.mjs` caps the tallest page at 6,000px, which is why the ladders
  nest under one "Ladders of their own" group rather than sitting beside the
  skills — eleven more top-level summaries cost ~530px on the page that is
  already the tallest.

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

**`changelog/mod-changelog.html` gets an entry for EVERY change**, including
ones that are not gameplay — a README, a build script, repo housekeeping. Mark
those as such rather than leaving them out; the rule is literal on purpose, so
there is never a judgement call about what counts. Newest first.

That file is the mod's own. **`changelog/changelog.html` is the AUTHOR'S and must
stay byte-identical to `origin/main`** — the mod's entries used to be prepended
to it, and were moved out precisely so the single script tag in `index.html` is
the only change the mod makes to anything of his. Verify before committing:

```
git diff origin/main -- changelog/changelog.html    # must be empty
```

In game the `changelog` button opens the mod's file; the version number opens
his.

## The rank ladder

`you.rank()` is the base game's **Power rank** — the number under the portrait,
lowest is strongest. It is **derived from live stats on every read**, not
stored, so there is no field to award. Rank 1 is reachable on stats alone, but
only with **every** skill at 110: measured, the whole of ranks 1-10 lives inside
the last fifteen skill levels (at 108 across the board you are still rank 3),
after a game in which the number is an unreadable ten-digit blob.

Section 34 adds a second way to hold one. Ten challengers in the Hall of the
First Gate, off the Old Path trailhead.

- **The rank is a flag, and `you.rank` is wrapped to floor at it.** Never write
  it into a stat — `you.res` and `skl.p` are the cautionary tales. It floors,
  never caps: hold rank 6 with rank-900 stats and it shows 6; pass it and it
  shows the better number. `you = new You()` runs once at game init and `load()`
  restores fields into that instance rather than replacing it, which is the only
  reason the wrapper survives a load. `tests/ranks.mjs` asserts both directions.
- **Difficulty steps into fight length, and the margin is re-derived.** Each
  duel is a `protected` one-creature `size 1` area, which is exactly what
  `MOD_scaleEnemy` reads as an arena boss, so it is already anchored to the
  player. `MOD_scaleRankDuel` then reads back the `_modKillT`/`_modDieT` it
  stored, multiplies the length, and **re-asserts `kill < die` itself**. Do not
  "just make it harder" by scaling both targets in opposite directions: margin
  1.5 over step^1.5 is already under 1.2 by a step of 1.16, so the guarantee is
  gone by rung three.
- **Challenger `rnk` stays ≤ 14.** That is the monster danger grade, not the
  ladder rank — the coin drop is `rand(lvl, lvl/4) ** (1 + rnk/5 << 0)`, so
  rnk 15 pushes the exponent from 3 to 4 and multiplies an endgame drop by a
  hundred. The base game's toughest creature sits at rnk 10, in the same bucket.
- Areas 981-990, creatures 990-999, the hall at `chss.mod_hall` 979. Adding a
  rung means adding a row to `MOD_RANK_LADDER`; the hall, the wiki page and
  `modRankLadder()` are all drawn from it.

## Crafting

The base game's crafting stops at two stars in practice. Measured across all 62
recipes, by output rarity and by whether any `giveRcp` call can hand the recipe
over: 35/43 reachable at 1★, 7/17 at 2★, **0/1 at 3★** (the only one is
`rcp.trr`, Trinity), 1/1 at 4★ (the Clover Pin), nothing at 5★. **Nineteen
recipes have no `giveRcp` anywhere** — defined, priced, complete, unteachable.
Reported in the wiki, not wired up: which the author gated and which he forgot
is his call.

Section 35 adds four rungs, 2★ to 5★, each a full set (weapon, body armour,
shield, accessory, tonic) from twelve gathered materials along three lines, at
four nodes behind one door on the Village Center. Each rung consumes the rung
below it.

- **Ids are blocked by namespace and `load()` depends on it.** A saved item id
  resolves through `itemgroup[(id+1)/10000<<0]`, `itemgroup` being
  `[item, wpn, eqp, sld, acc]`. An id in the wrong block restores as the wrong
  object or not at all. Items 9200+, weapons 10101+, armour 20101+, shields
  30101+, accessories 40101+.
- **`rar` must not exceed 6.** `equip()` does
  `w.wc = global.text.wecs[w.rar][0]` and `wecs` has seven entries, so a 7★
  anything throws the moment it is worn.
- **Armour `str` is nearly decorative.** `stat_r` adds only `eqp[0].str` (the
  weapon) into `str_d`; `int`/`agl`/`spd` are summed over every slot. Armour
  `str` shows in the DEF tooltips and nowhere in `dmg_calc`.
- **Re-index the value model after adding recipes.** Section 15 builds
  `MOD_VAL.madeBy` in an IIFE at load. Without the re-index at the end of
  section 35, new gear falls past rule 2 (price from inputs) to rule 3 (price
  from stats) — a 5★ sword came out at 1,161 while each of the eight ingots it
  eats came out at 13,000. Clear `MOD_VAL.cache` too.
- **Materials are anchored, not derived.** Rule 4 would price them
  `stypeBase[5] * rarMult[5]` = 3,250 each, because `rarMult` is calibrated
  against equipment rarity. `MOD_CRAFT.matValue` sets 6/18/54/162, sized so
  gathering at the cap pays about six coin a second after the 25% sell rate
  against roughly one a second from endgame combat.
- Nodes set **no tier flag** — they are gathering locations, not fight areas.
  See the catacombs note above for why that matters.

## Ids are the save's primary key

**No two things in a namespace may share an id, and nothing enforced this until
`tests/ids.mjs`.** The game matches ids in loops with no `break`:

```js
for (a in a6) for (b in skl) if (a6[a].id === skl[b].id) you.skls.push(skl[b])
for (gg in chss) if (chss[gg].id === global.lst_loc) chss[gg].sl()
```

So a duplicate is not a clash, it is corruption that compounds. Section 29 gave
Fire Mastery `2010 + 0`; section 11 had already given the Companions parent
`2000 + 10`. Every save/load pushed both skills for both entries and the sheet
**doubled each cycle** — 1, 2, 4, 8, 16 — until a played-in character had a
hundred of each. `MOD_KEY_BY_ID` is id-keyed too, so the clash also silently
took the Companions parent's level cap.

- **An `item` id is a CLASS as well as a namespace.** `dscr` type 1 reads the
  category straight off the number, and there is no field for it —
  `< 3000` Food (plus a "Tried:" footer), `3000-4999` Medicine/Tool,
  `5000-8999` Material/Misc, `>= 9000` Book (plus a "Read:" footer). `stype` is
  **not** it: the author's stype 4 spans Food, Medicine and Book. Everything the
  mod added started at 9100+, so twenty-six items — ore, hides, essences, every
  pill — were labelled "Book" with a "Read: Never" line under them. Pick from
  `MOD_ITEM_IDS`; `tests/ids.mjs` checks the class against the mod's own tables.
- **Moving an item id costs the player what they were holding.** The inventory
  saves `{id, am, data}` and restores by matching id, so an entry whose id no
  longer exists is dropped without a word. Section 37 reads the blob *before*
  the game's load runs, notes what the moved ids were carrying, and gives it
  back afterwards. It never rewrites the save — a migration that fails is
  better than a load that does.
- Ranges in use: parents `2000+section` (2001-2010), masteries 2011-2016,
  Renown 2100. Mod locations 975-980. **Check `tests/ids.mjs` before picking.**
- Prefer an explicit table to arithmetic when two schemes could ever meet:
  `MOD_ELEM_IDS` lists the six rather than computing them, and says why fire is
  out of line.
- Changing an id loses that skill's saved level, so move the *newest* claimant.
- `MOD_dedupeSkills` (section 33) prunes `you.skls` on load. It repairs damage
  already written into saves; it is not a licence to leave a duplicate id.
- **`global.titles` has the same shape of bug, from the other direction.**
  `giveTitle` pushes each title onto *both* `global.titles` and
  `global.titlese`, and `load()` rebuilds `global.titles` from the save by index
  and then appends the whole of `titlese` on top — so everything earned that
  session lands in the array twice (241 titles measured as 481 after one load,
  241 distinct). It does not compound, but `save()` writes the inflated array
  back out, and both the game's title screen and the mod's picker iterate it.
  `MOD_dedupeTitles` repairs it on load, by identity. **Do not "fix" it at the
  source** — `titlese` is the author's mechanism. Anything the mod adds that
  reads `global.titles` should still prefer counting from `ttl`, as
  `MOD_titleCount` does.

## Skill rarity and convergence (section 39)

**Rarity is derived:** `MOD_skillRank(sk)` is `MOD_rankForLevel(sk.lvl)` — the
rank of the level the player has taken it to, against `MOD_RANK_AT`, painted
with `MOD_RANK_COLOUR`. Never hand-assign a rarity to a skill.

The colour goes on the row's `children[0]` **style**, never into the name. The
game's per-second updater rewrites `children[0].innerHTML` every tick, which
wipes markup but leaves the element's own inline style alone. Names are a
primary key and must stay plain.

**Folding HIDES a skill; it must never remove it from `you.skls`.** A Jade Slip
marks the skill in `global.flags.mod_folded` and section 13's `renderSkl`
wrapper hides the row through the same branch that hides collapsed groups and
maxed skills. Shortening `you.skls` instead breaks three things at once:

- the game's panel only redraws when the list **grows**
  (`let sklsize=you.skls.length; ... if(sklsize<you.skls.length)`), and
  `sklsize` is never updated, so a shrink leaves orphaned rows displayed forever;
- `giveSkExp` pushes a skill back on its next level-up
  (`if(!scanbyid(you.skls,skl.id)) you.skls.push(skl)`), with a "New Skill
  Unlocked!" banner, so a removal undoes itself;
- `you.skls` is saved by id.

The only splice is in `MOD_unfold`, for the converged skill itself, and it is
followed immediately by `MOD_redrawSkills()`.

This works **because `you.skls` was only ever the display list.** The mod's
allbuff wrappers walk `skl` by key; the game's own `allbuff` names `skl.fgt` and
`skl.twoh` directly; most base-game skills pay out through milestones already
written into stats. So a folded skill keeps applying every buff it applied.
`tests/convergence.mjs` proves it: every stat after folding all hundred is
exactly the unfolded value times `MOD_convergenceMult()`.

- The ten converged skills (ids 2201-2210, `skl.mod_conv1..10`) are created
  **unconditionally at load**, because `a7` saves exp and `p` positionally over
  `for..in skl`. One that appeared only when you first folded would shift every
  slot after it. The test asserts they sit at the end of `skl`.
- They are **aggregates**: no milestones, never take exp, `use()` returns 0 (the
  folded skills still apply their own buffs, so anything here double-counts).
  No milestones means section 24 generates no titles for them, and
  `perkcoverage.mjs` skips anything with `_modConverged`, as it skips Renown.
- A converged skill's displayed level is the **best** folded level in its
  section, so it stays inside the story cap and `MOD_UI.hideMaxed` still works.
- The convergence bonus is a stat multiplier applied in allbuff, deliberately
  **not** a body factor — it never touches `MOD_BODY`.
- `removeItem(obj, flag)` takes a **flag**, not an amount — passing a count drops
  the whole stack. Stackable items sit in `inv` once and carry their own
  `amount`; there is no `you.inv`. Decrement `amount`, then `removeItem` only an
  emptied stack, as the game does at `index.html:8893`.

## Names are the other primary key

Ids are the save's key; **names are the player's**, and nothing checked them
until `tests/names.mjs`. Section 4 shipped `skl.frg` named "Foraging" when the
base game already had `skl.hvt` under that name. Two identical rows in the skill
panel, and **ten identically named titles**, because section 24 derives a
title's name from its skill's. Nothing errored. It is `skl.frg` = **Wildcraft**
now; the key and id are untouched, because names are not saved and ids are.

- Check a new name against every namespace, and against the **whole inventory
  bag** — `item`, `wpn`, `eqp`, `sld` and `acc` share one list, so a repeat
  across them reads as badly as one inside a single namespace.
- Stay in the author's register. His are plain single words — Foraging,
  Harvesting, Topography, Elusion, Temperance, Gluttony, Famine. Not
  invented-fantasy, not compound.
- The author's own repeats (Chashu Ramen, Bandage, Blue Slime, Nameless, and
  the nine areas called Training Grounds) are **listed and left alone** in the
  test. Renaming his content is not the mod's
  business; shipping a clash of our own is.

## The hunter's quest, and anything else on a rot timer

`quest.hnt1` wants **ten Raw Meat held at once**, and `item.rwmt1.rot` is
`[.25,.45,.1,.2]`: `planner.chkrot` runs once an in-game day, adds
`randf(rot[0],rot[1])` divided by a season modifier (**0.5 in summer — twice as
fast**, 2.5 in winter), and at `rottil >= 1` destroys
`amount * randf(rot[2],rot[3]) + 1`. So a perishable stock **converges** rather
than accumulating:

```
A = (gain_per_day * days_between_rot - 1) / lossFraction
```

The mod never touched the drop table. It made a rabbit take ten swings instead
of one (`MOD_ENEMY.kill` targets eight landed swings; a quest-stage rabbit went
from 93 HP to 3,574), and ten times less meat an hour against an unchanged rot
clock dropped the summer steady state to **4 against the 10 required**. Feasible
in three seasons and impossible in the fourth is a bug, not a difficulty choice.

Section 36 raises the drop 6% → 18%, solved backwards from a steady state of 25
in the worst season and the first hunting area, and applies it to **every**
creature carrying `rwmt1` found by scanning the drop tables rather than by
naming the rabbit and the wolf. `MOD_meatSteadyState()` is the shared formula;
`modMeat()` prints the table. **Any change to kill times has to re-check this** —
it is the one quest whose difficulty is set by the clock rather than by the
fight.

## Choice lines have a fixed height

`.chs` is `height:22px` with no overflow rule, so a choice that wraps does not
grow its row — it spills over the next one and off the bottom of the panel.
Roughly 55 characters fit. Keep an added line under 50 and put the sentence in
`addDesc(node, null, 2, title, text)`, which is what the game does. Use
`MOD_chsAboveBack()` so the line lands above the location's `"<= Return"`; all
85 of the game's back-choices start with `"<=`.

## Selling and key items

Section 15 added selling, which the base game does not have, so **the mod owns
the question of what must never be sold.** `MOD_KEY_ITEMS` (section 32) derives
it: the game is one inline `<script>`, so its source is readable at runtime
through `document.scripts`; a flag the game never sets back to `false` is a
one-way unlock, and an item that sets one is the only copy of something.

This shipped broken — the "Pamphlet" is the only thing in the game that opens
the marketplace, and selling it took the marketplace, its three shops, a quest
and the realm 2-5 breakthrough pills away permanently. Add a source of selling
and re-check this.

## The wiki

Section 31. The `wiki` button on the bottom bar and the settings row both call
`modWiki()`, which builds a complete HTML document as a string and writes it
into `window.open('', '_blank')`.

**It is generated from the live game data, and that is the point.** It reads
`skl`, `area`, `item`, `ttl`, `act` and the mod's own tables, so it cannot
disagree with the game. Never hand-write content into a page builder that could
be read off an object instead — `tests/wiki.mjs` counts coverage from the game
rather than from a list, so a skill added without a wiki entry fails the suite
on its own, and that only works while the pages stay derived.

- `MOD_wikiGroup()` for anything list-shaped. With everything listed, three
  pages ran past 40,000px; groups collapse by default and the tallest is now
  5,800. Anything past `MOD_WIKI_ALPHA_AT` gets an alphabetical sub-split.
- **Spawn shares come from `area.popc`, not `pop[i].c`.** `z_bake` normalises
  those weights into the `[lo,hi]` bands `mon_gen` rolls against, and they do
  not have to sum to 1 — the Southern forest's .35/.45/.25 are really 33/43/24%.
- `area.nwh` and `area.tst` are excluded: the first is where `current_z` parks
  whenever you are not fighting, the second hangs off `chss.tst`, which has
  `id -1` and is in no sector. The flag for an area whose `pop` carries no
  weight (NaN bands, nothing can spawn) is **derived from `popc`** and stays:
  `tests/wiki.mjs` strips a live area's weights to prove it still fires.
  `area.clg`, the Damp cellar, was that area — section 41 gave it weights, an
  entrance (Notice #1 on the Message Board, `chss.mod_cellar` 973) and a real
  exit. Its original `onEnd` moved to `chss.q1lwn`/`q1l`, which do not exist.
  The placement is an inference from those names ("quest 1"); everything else
  is his.
- A page builder that throws is caught and says so in place; it must not take
  the document down.
- No fetches, no CDN, no dependencies. It has to work from `file://`.

## Actions

The mod adds four actions. They are **earned**, not granted on a timer. Three
come from milestones on the base-game skill they grow out of, the same way
`skl.walk` lv 1 grants "Run": Toughness 4 → Endurance Drill, Harvesting 4 →
Forage, Literacy 8 → Practice Calligraphy.

**Circulate Qi is the exception**: it comes from clearing the dojo's three
tutorial fights (`tr1_win`/`tr2_win`/`tr3_win` — Easiest, Easy, Normal), checked
on the tick, because the condition is story flags rather than a skill level. It
is the way into the whole cultivation system, so gating it behind Temperance —
a skill trained by discarding possessions — was obscure. Temperance keeps a
plain perk at level 5 so the save's index-keyed milestone flags do not shift.

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
