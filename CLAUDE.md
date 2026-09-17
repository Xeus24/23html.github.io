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

### Known and unfixed: the player's real max HP is not the one the tests measure

Found while building the rank ladder, **not fixed** — it is a separate piece of
work and it touches the whole balance model.

Section 9/10's `hpTrack` raises `you.hpmax` at the end of the `allbuff`
wrapper. But `allbuff` opens with `who.stat_r()`, and `stat_r` recomputes
`hpmax` from `(hp_r+hpa)*hpm*hpe` — so the raised value survives only until the
next `stat_r`, which the tick, `fght`, `update_d` and `allbuff` itself all call
constantly. Sampled 43 times across six seconds of real ticking on a cap-60
character, `you.hpmax` was **10,050 every single time**; the hpTrack value,
184,754, never appeared. The HP bar agrees: `hp: 2,438/10,050`.

Every balance script measures `you.hpmax` immediately after `allbuff`, so they
all see 184,754. `MOD_scaleEnemy` does too, and sizes `_modDmg` against it. So
the enemy's damage is built for a character with ~18x the health the character
actually has, and the divergence grows with skill level — it is ~1x early and
worst in the endgame. All 2,790 `allareas` matchups are validating against a
number the player never holds.

The fix is the one `MOD_scaleEnemy` already documents for enemies: **write the
multiplier, not the total** — set `you.hpm` (which `stat_r` reapplies from the
base every time) rather than assigning `you.hpmax`. Check first whether `hpm`
is in the save, or the bonus will compound on load like `you.res` did.

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
  tags it "unfinished", the same call `area.clg` gets. The author left five:
  `ttl.ddcd` (name and desc are the literal string `"null"`) and the blank
  `shpt2` / `shpt3` / `mone3`. None is granted by anything.
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
  test, the same call `area.clg` gets. Renaming his content is not the mod's
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
  `id -1` and is in no sector. `area.clg` **is** listed and flagged — its `pop`
  entries carry no weight, so its bands are NaN and nothing can ever spawn
  there. That is the author's unfinished content, reported rather than fixed.
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
