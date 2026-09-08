# Proto23 local mod

Set up 2026-09-04. All mod code lives in `mod.js`. The only change to the
game itself is one `<script src="mod.js">` line at the bottom of `index.html`.

## Run it

Just open `index.html` — double-click it, no server needed. It's a single
self-contained file with no ES modules, and the mod loads fine over `file://`
(verified).

## Console commands

Open DevTools (Cmd+Option+I) and use:

```js
modHelp()        // list everything below
setSpeed(3)      // game speed: ticks, skill xp and combat all scale
getSpeed()       // current speed
resetSpeed()     // back to 1x
setSkillXp(3)    // skill xp multiplier (starts at 2x)
modUnlock()      // re-grant the four new actions
```

Speed persists across reloads (stored under its own localStorage key, not in
your save file). Skill xp resets to 2x each load — change the
`skill_xp_mult` value near the top of `mod.js` to make a different default
stick.

## What the mod does

**Game speed** — a toggle rather than a fixed change; default stays 1x.
`global.fps` drives the main loop (`setTimeout(..., 1000/global.fps)`) and
combat, so raising it scales ticks, skill xp and fighting together.
Sustained actions run on their own fixed 1s timer, so `setSpeed` also re-arms
a running action at the new rate — otherwise actions would lag behind
everything else.

**Skill XP: 2x** — applied by wrapping `giveSkExp` rather than editing the
`Skill` constructor's `p` default. `p` gets restored from your save file, so a
constructor change would be silently overwritten on load. Wrapping is
save-independent and stacks multiplicatively with the in-game "+x% EXP Gain"
perks.

**Extended milestones** — the original perks stop around lv 10-15. Added tiers
at **20/25/30/40/50** to: Fighting, all ten weapon masteries, Sleep, Walking,
Meditation, Gluttony, Greed, Patience, the four crafting skills, and the three
gathering skills.

**Four new skills, each with a sustained action:**

| Skill | Type | Action | Trains |
|---|---|---|---|
| Qi Circulation | lifestyle | Circulate Qi | Qi Circulation, Meditation, Patience |
| Foraging | gathering | Forage | Foraging (+ finds herbs/mushrooms/apples) |
| Calligraphy | crafting | Practice Calligraphy | Calligraphy, Reading, Patience |
| Conditioning | physical | Endurance Drill | Conditioning, Toughness, Walking |

Each has nine milestones (lv 2 → 50). New skills only appear in the UI once
they first level up — that's the game's own behaviour, not a bug. Foraging
grants existing items only; no new items were added.

## Live skill tooltips

Hovering a skill now shows what it currently does, recomputed each time:

```
Ability to fight using swords
Slightly increases attack power when holding a sword
Attack power with a sword +100%
Next perk: lvl 25 (5 levels to go)
```

Every percentage is derived from that skill's own `use()` function and its
call site in the game, not invented. Skills whose `use()` only returns the raw
level, with the meaning decided by a caller I could not pin down, deliberately
get no effect line — they still show "Next perk".

Implementation note: the skill tooltip (`dscr` type 6) renders `what.desc` as a
plain string, unlike item and action tooltips which already accept a function.
Rather than patch the game's renderer, each skill's `desc` is redefined as a
getter, so the tooltip picks up fresh numbers on every hover.

### Continuous effects for the added skills

The four added skills originally paid out only at milestone levels, so unlike
the base-game skills they had no per-level formula — and so no honest
percentage to display. They now have one, in the game's own idiom:

| Skill | Per level | Shows as |
|---|---|---|
| Qi Circulation | INT +3% | `Mental acuity +30%` at lvl 10 |
| Calligraphy | INT +2% | `Mental acuity +16%` at lvl 8 |
| Conditioning | STR +3% | `Attack power +36%` at lvl 12 |
| Foraging | find chance +0.15% | `Forage find chance +4% per tick` at lvl 20 |

Foraging already had a real per-level effect (the find chance inside its
action); it just wasn't exposed. That number now comes from one shared
`MOD_forageChance()` so the tooltip and the action can't drift apart.

The other three hook `allbuff()`, which is what the base game uses for exactly
this — it calls `stat_r()` (resetting stats from base + flat bonuses) and then
layers skill effects on top, the same path Fighting and the weapon masteries
take. Because `stat_r()` resets first, repeated calls don't compound.

Verified: at 100 base INT/STR, Qi lvl 10 gives 130 INT and Conditioning lvl 10
gives 130 STR; three further `allbuff()` calls leave both unchanged, and
zeroing the skills returns both to 100.

Note this makes those four skills meaningfully stronger than when they only
had milestones — they now scale continuously *and* keep their nine perks.

### A base-game bug this surfaced

The Death skill's description says "Reduces energy loss on death", but the
actual formula is:

```js
this.sat *= (0.55 * (1 - skl.dth.use()))     // use() returns lvl * 0.1
```

That multiplier *shrinks* as the skill levels, reaching 0 at level 10 — so
levelling Death makes death worse, not better, and past lvl 10 you keep no
energy at all. The tooltip reports the real computed value and flags it.

This is almost certainly what the `proto23bugfix` fork was aiming at; it
rewrote the line as `0.45*(1 + skl.dth.use())`. Not changed here — say the word
and I'll fix it.

## Naturally discovered skills

Nine more skills that surface from playing normally — no action to toggle.
Play and they appear.

| Skill | Discovered by | Per level |
|---|---|---|
| Wayfaring | travelling between locations | SPD +2% |
| Battle Scars | taking damage | STR +2% |
| Footwork | dodging attacks | AGL +3% |
| Curiosity | inspecting things (tooltips) | INT +2% |
| Collecting | picking up items | INT +1.5% |
| Weatherworn | being outdoors in rain or snow | STR +1.5% |
| Nightwalking | being outdoors at night | AGL +2% |
| Lunar Attunement | outdoors under a full moon | INT +3% |
| Second Wind | acting below 25% energy | STR +2% |

At level 0 each tooltip names its trigger, so an undiscovered skill tells you
how to find it once you know it exists. `modDiscoveries()` in the console
lists all nine with current levels.

### How they work

One wrapper around `ontick()` drives the whole set. Nothing else is patched
and no new counter is created — the counter-driven ones read `global.stat.*`
values the game already maintains for its own statistics screen (`smovet`,
`dmgrt`, `dodgt`, `popt`, `igtttl`) and grant xp on the delta. The rest test
environment flags each tick (weather `frain`/`fsnow`, `isday`, `getLunarPhase()
=== 4` for the full moon, energy ratio).

`ontick()` reschedules itself with `setTimeout(...ontick()...)`, which resolves
to the wrapper, so the chain stays single — one tick, one call.

Counter deltas are capped per tick (`cap` in each entry) so one enormous event
can't dump a level's worth of xp. Verified: a single 99,999-point damage spike
grants 12 xp, not a level. The baseline also resyncs after a load, so counters
restored from a save don't read as a huge delta.

Continuous effects go through the same `allbuff()` hook as the other added
skills. Verified at 100 base AGL/SPD: Footwork lvl 10 gives 130 AGL and
Wayfaring lvl 10 gives 120 SPD, and repeated `allbuff()` calls don't compound.

## Skills now do what their text says

Every skill trained by a **condition** now only **applies** under that
condition. Second Wind said "finding something left after there is nothing
left" and then handed out strength around the clock; Nightwalking claimed
night-footing and worked at noon; Berserking promised strength found past the
point of sense and was a flat buff at full health.

The rule is simply: if it trains under a condition, it applies under that
condition. Counter-trained skills (kills, travel, items handled) stay always-on,
since those represent accumulated ability rather than a situation.

Conditional skills are worth **2x** while active, or a situational skill would
be strictly worse than an always-on one at the same level.

Tooltips state the condition and whether it is live right now:

```
Fighting on while badly hurt
Strength found past the point of sense
Attack power +5.3%  inactive — only while badly hurt
```

```
Comfort in the hours most people sleep through
Eyes and footing that suit the dark
Agility +60%  active now — only outdoors at night
```

Verified: Berserking gives 100 STR at full health, 109 at 15% health, and 100
again once healed. Nightwalking gives 100 AGL by day, 160 outdoors at night,
and 100 indoors at night. Killing Intent (counter-trained) is identical in both
states.

One flavour note was reworded rather than re-mechanised: Throwing Arm claimed
"power behind a thrown weapon" but raises general attack power, so it now says
"strength built by throwing".

### Fixed: max HP changed mid-fight

Max HP was derived from `you.str` *after* the situational skills applied.
Berserking activates below 30% health, which raised STR, which raised max HP
through `hpTrack` — so taking a hit could visibly move your maximum, and
recovering moved it back.

The allbuff hook now runs in two passes:

1. **Permanent** skills apply. Max HP is derived from the result of this pass
   only.
2. **Situational** skills layer on top and never touch max HP.

Equipment cancels out of the ratio (it is in both `strRef` and the result), so
max HP now moves only when permanent power does — a level, a milestone, an
equipment change.

Verified: with Berserking and Second Wind both at lv 30, max HP holds at 1061
across healthy → hurt and starving → recovered, while STR still swings 107 →
265 → 107. Six consecutive `allbuff()` calls mid-fight return the same maximum.

### Fixed: "trains faster" perks did nothing

Four milestone perks were written as `f: function () {}` — the label existed,
the effect never did. One on every added skill at lv 10, one at lv 50, and all
three parent-skill section perks. Exactly the same failure as the base game's
`dfl` and the dead affinities, except self-inflicted.

Now implemented, and measured:

| Perk | Effect |
|---|---|
| Skill's own lv 10 | that skill trains x1.10 |
| ...plus its lv 50 | x1.15 total |
| Parent lv 10 / 25 / 50 | every skill in that section trains x1.10 / x1.20 / x1.35 |

Verified by intercepting the xp that reaches the grant: own perk x1.10, both own
perks x1.15, all three section perks x1.35 for the skill **and** for a true
sibling under the same parent, and x1.00 for a skill in another section.

**Not** implemented as `sk.p += 0.1`, which is how the base game's equivalents
work, because `p` is restored from the save positionally *after* milestones
re-fire on load — a newly added milestone's increment would be applied and then
immediately overwritten. The bonus is instead derived from the milestone `g`
flags, which the save does carry reliably, so it cannot be clobbered.

Wording was also made incremental with a running total. Three milestones each
reading "trains 10/20/35% faster" looks like each replaces the last; they now
read "+10% faster", "+10% faster (20% total)", "+15% faster (35% total)".

### Per-skill fairness

Testing the above exposed a separate problem. Normalising each *stat's total*
meant individual skills were wildly unequal — with 34 STR skills and 14 AGL
skills, Berserking at lv20 gave +5.3% while Nightwalking at lv15 gave +60%.
Both are one skill; levelling either should pay comparably.

Every skill is now scaled by the same factor, keeping only the small
per-skill weights written for flavour (0.11-0.264 %/level, a 2.4x spread).
Stat totals now differ by how many skills feed them (at cap 10: STR +59%,
INT +78%, AGL +26%, SPD +11%), which is fine — INT and SPD matter less in
combat than STR.

## Selling

The base game never implemented it. `Vendor` has `items` and `stock` and no
sell path — but four vendors carry a `dfl` field (a sell-back rate of 0.2-0.3)
that is **assigned and read exactly zero times**. The hook was left in and
never wired up, like the dead affinities.

Any shop now has **Buy / Sell** tabs; the Sell tab shows the vendor's rate in
the label. Click a row to sell one. Selling trains Trading and adds a little
reputation, and Trading and reputation both improve the take, mirroring how
they already improve buying.

Items flagged `important` (quest and key items) and anything equipped are
excluded.

### Pricing 543 items when the game priced 55

The hard part: prices live on the vendor's stock entry, not on items:

```js
vendor.stvr1.items = [{item: item.cbun1, p: 6, ...}]
```

so an item in your pack has no intrinsic worth. Only 55 item objects are priced
anywhere. Values are derived in this order — earlier rules use the author's own
numbers, later ones are increasingly inferred:

| Rule | Basis | Items |
|---|---|---|
| 1 | the vendor's own price, exactly | 55 |
| 2 | sum of recipe inputs x 1.25, resolved recursively from real `rcp` data | 57 |
| 3 | `5.3 x (str+agl+int+spd+dpmax/10)` for stat-bearing equipment | 158 |
| 4 | that stype's median anchor price at rarity 1, x a rarity multiplier | 274 |

The 5.3 in rule 3 is the **median price-per-stat of the seven stat-bearing
equipment anchors** (their ratios run 3.4 to 9.6), not a guess.

Rule 4's rarity curve is the one genuinely invented part, and worth knowing
about: the anchors are 52/55 rarity-1 items, with two at rarity 0 and one at
rarity 2, so there is nothing to fit above that. The two observations (rarity 0
at ~0.22x and rarity 2 at ~12.7x of the rarity-1 median) bracket it; the curve
used (0.25 / 1 / 5 / 15 / 45 / 130) is a deliberate, more conservative choice.
It is one line in `MOD_VAL.rarMult` to retune.

`modItemValue(name)` reports any item's value and which rule produced it.

Verified: all 544 item objects resolve to a positive value; all 55 anchored
items come back at exactly the author's price; recipe values resolve
recursively with a depth guard against cycles; selling moves wealth by exactly
the quoted price and decrements the stack; selling a stack to zero removes it
and shows "Nothing here worth selling"; switching back to Buy restores the
vendor's stock list; `important` items are refused.

### The economy check, and what it found

I flagged that selling might trivialise buying. Measured, it was wrong in the
other direction:

| | Value |
|---|---|
| Sell income per kill (before) | 0.6 - 5 |
| Vendor prices | median 31, max 690 |
| Enemy coin drops | **0 by default** |

Two real problems came out of it.

**Rarity is a dead signal.** Endgame loot like Life Stone is flagged rarity 1
exactly like a mushroom, so rules 1-4 priced every drop in The Long Vigil at 16.
What actually separates them is the level of the creature that drops it and how
often — both real data in the area tables. Rule 5 uses that:

```
value = 0.8 x lvl^1.25 x (1/chance)^0.35
```

applied only when it EXCEEDS the type/rarity estimate, so it lifts endgame loot
without cheapening common early items, and never overrides a vendor's own
price. Life Stone went from 16 to 80 ("drop source (lv 40)"); Apple stays at 5
because that is the author's price.

This one is calibrated to a target income curve rather than fitted to anchors —
no anchored item appears in a drop table, so there was nothing to fit against.

**Money has no combat source.** The code for enemies dropping coin is complete
and working:

```js
if(you.mods.enmondren>0) if(random()<you.mods.enmondren){
  let aam = 1+rand(this.lvl<<0,(this.lvl/4)<<0)**(1+(this.rnk/5)<<0)*you.mods.enmondrts;
  giveWealth(rand(aam*.5<<0||1,aam*1.5<<0||1)); }
```

but `enmondren` defaults to 0, so the branch never runs — only the Ring of Greed
(+0.03) ever turned it on. Another finished mechanism left switched off, like
`dfl` and the four affinities. Now enabled at **15%**, using the author's own
amount formula, which already scales with enemy level and rank.

`you.mods` is saved, so the contribution is tracked in `global.flags` and
applied as a delta — the same pairing the affinity resistances use. A flat add
on every load would compound; clamping to a fixed value would erase the Ring of
Greed. Verified: stable across repeated ticks and two save/load cycles, and the
Ring still stacks (0.15 to 0.18, preserved through the tick).

### Resulting income curve

```
Western forest      1.4      The Sunken Hollow    5.1
Southern forest     2.5      The Ashen Spire     22.6
Your basement       3.6      The Long Vigil      16.4
```

Against a median vendor price of 31: roughly 22 kills for a mid-tier purchase
early on, dropping to 1-2 late. `modEconomy()` prints this live;
`setMoneyDrops(n)` and `modResetMoneyDrops()` tune it.

## Titles, bigger flat bonuses, and Renown

### Fifteen new titles

Ids 201-215, clear of the game's highest (107). Titles save by id, so new ones
are save-safe. Executioner, Deathless, Stormcaller, Darkmoon, Artificer,
Scholar, Insatiable, Wayfinder, Quicksilver, Farstrider, Unbending, Sage,
Circulator, Moonlit, Unspent.

### Bigger flat bonuses

Two changes, and the distinction between them matters for save safety:

**The existing milestones were made richer in place** — lv 25 gives +3 (was
+1), lv 50 gives +6 and HP +25 (was +2). Editing a milestone's `f()` leaves its
array *index* alone, so the save's index-based granted flags stay aligned.

**Twelve flagship skills got new deep tiers appended** at lv 55 / 60 / 70 / 75,
worth up to +22 to their stat plus HP and Max Energy, ending in a title:

| Skill | Title | Skill | Title |
|---|---|---|---|
| Killing Intent | Executioner | Pathfinding | Wayfinder |
| Mortality | Deathless | Reflexes | Quicksilver |
| Storm Sense | Stormcaller | Ranging | Farstrider |
| New Moon | Darkmoon | Grit | Unbending |
| Making | Artificer | Wisdom | Sage |
| Study | Scholar | Appetite | Insatiable |

Qi Circulation, Lunar Attunement and Second Wind also gain a title at lv 60.

Appended levels all sit **above** each skill's existing top milestone. The
game's perk tooltip walks the array in order and stops at the first ungranted
entry, so an out-of-order level hides everything after it — the first attempt
produced `10,25,50,15,30,40,60,75` and the audit caught it. Reordering the array
instead would have misaligned the saved flags, so ascending-append is the only
safe option.

The level gating paces these naturally: at the forest's cap of 20 only the lv-15
and lv-25 tiers are in reach; the +22s need the endgame caps.

### Renown

A skill that levels on **titles held**, not on xp. Capped at level 10 and
exempt from the story level cap.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Titles | 1 | 3 | 5 | 8 | 13 | 20 | 31 | 48 | 74 | 100 |

The first level is immediate and the gaps grow multiplicatively, so the last is
a collection project — 100 of the 123 titles now in the game.

Gives **+1.5% to all four stats per level**, so +15% at maximum — a generalist
reward for broad play rather than deep grinding.

Its level is derived, never granted, so it never passes through the xp path at
all; the cap wrapper also exempts it explicitly. "Hide maxed" judges it by its
own ceiling of 10 rather than the story cap, or it would vanish from the list
the moment it matched the current cap.

Title count is read from `ttl` rather than `global.titles.length`, because
`load()` rebuilds that array and then appends `titlese` to it, which can
double-count.

`modRenown()` shows the ladder and your progress. Verified: granting titles one
at a time steps the level at exactly 1, 3, 5, 8, 13, 20, 31, 48, 74, 100.

Re-audited after all of this: **752 perks, 752 pass**, no dead perks, no throws,
no level-order problems. Save with everything maxed is 19.3 KB.

### Renown is multiplicative

Each level multiplies every stat by 1.05, compounding, rather than adding a flat
percentage:

| Level | 1 | 2 | 5 | 10 |
|---|---|---|---|---|
| All stats | x1.05 | x1.10 | x1.28 | **x1.63** |

It applies **last** among the permanent effects, so it scales everything
permanent that came before it rather than a subtotal. Verified: a lv-60 skill
alone gives 113 STR; with Renown 10 that becomes 184, a ratio of 1.628 against
an expected 1.05^10 = 1.629.

Worst case measured — endgame with all 100 titles: it mostly buys survivability
(Long Vigil: die in 27 becomes die in 42) rather than trivialising kills.

### A Renown button

Next to "Recheck clears" in the skill panel. Reports the title ladder with your
progress, prints how many titles you hold and which are missing (full list to
the browser console, since 123 names will not fit in the message log), and
refreshes the list. `modRenown()` and `modTitles()` do the same from the console.

### "Trains faster" replaced with base-game-style perks

The lv 10 perk on each added skill read *"this skill trains +10% faster"* — a
perk about itself, which is filler next to the base game's "STR +1, New Title".
Those are now flat stats in the game's own vocabulary:

| Level | Was | Now |
|---|---|---|
| 10 | trains +10% faster | `<STAT> +1` |
| 25 | `<STAT> +3` | unchanged |
| 50 | `<STAT> +6, HP +25, trains +5% faster` | `<STAT> +6, HP +25` |

**The parent skills keep theirs.** "Every skill in this section trains +10%
faster" is not self-referential — it is the parent's entire function, and
replacing it with stats would both gut the section mechanic and add power creep
across ten more skills. Say the word if you want those changed too.

#### The migration this needed

A character who had already earned the old lv 10 or lv 50 perk keeps its `g`
flag set, so the new `f()` would never fire — silently losing the old effect and
never gaining the new one. `MOD_migratePerks()` re-fires exactly those perks
once per save, gated on a revision number in `global.flags`.

The ordering works out: on a fresh page it runs, sets the flag, and is then
overwritten by `load()` restoring an older save's flags — so it runs again once,
after that save's levels are in place. Verified: a lv-55 skill gains +7 (the +1
and the +6) on the first run, 0 on the second.

## Full perk audit

Every milestone perk in the game — the author's and mine — was checked
mechanically rather than by eye: snapshot the player's whole state (all flat
and multiplier stats, exp gain, growth potential, every `mods` and `res` field,
class defences, every skill's `p`, title count, active effects), fire the
perk's `f()`, diff, then restore.

**701 perks checked, 701 pass.**

| Check | Result |
|---|---|
| Mod perks that change nothing | **0** |
| Perks that throw | **0** |
| Perks with effects but no description | **0** |
| Milestone level order / duplicate levels | **0** |
| Base-game perks that change nothing | **0** |

Three perks do slightly MORE than their text says — all the author's, all
beneficial, so they under-promise rather than over-promise:

* `shdc` lv10 "HP +30, STR +2, AGL +2, New Title" also gives EXP Gain +5%
* `pet` lv5 "Energy Effectiveness +1%, New Title" also gives AGL +1
* `dth` lv10 "Survival EXP Gain +10%, New Title" also gives STR +2

Left as-is: they are the author's text, and erring generous is the safe
direction.

## Interference checks

| Risk | Result |
|---|---|
| Save size with all 183 skills maxed | 18.8 KB — 0.37% of a 5 MB budget |
| That maximal save loading back | every level and flag intact |
| Wrapped functions' return values | `skl.fgt.use()` and `skl.twoh.use()` still return numbers to `allbuff`; `stfc.use` intact |
| Anything copying skill objects (would freeze the desc getters) | none in the codebase |
| Counter baselines after loading an older save | no phantom xp burst; genuine progress still counts |
| A capped skill | refuses xp, exp stays 0, `onLevel` correctly does not fire |
| Game code gating on a skill level | 6 gates; only `skl.ntst.lvl>=12` sits above the level-10 starting cap |

`cansee()` treats Night Sight 12 as a substitute for a light source, so at the
starting cap you need an actual light in the dark until the cap reaches 15 at
training completion. A short delay, not a block.

### Two latent problems this turned up

**The `desc` getters had no setter.** `skl.X.desc = '...'` was a silent no-op in
non-strict code. Nothing in the game does that today — skill descriptions are
all set at definition time, before the getters install — but a later edit or a
second mod would have failed invisibly. A setter now replaces the base text and
keeps the computed lines.

**Three predicates are true essentially always** — playing at all
(`anyTime`), a season being in progress (`anySeason`), and being awake
(`awake`). Treating them as "situational" paid them the 2x conditional bonus
for nothing, and rendered tooltips reading *"active now — only simply by
playing"*. They now count as unconditional: normal rate, no condition line.

## Parents start at level 1 with 1 exp

### Parent skills from the start, always first in their section

The ten parents now begin at level 1 and are in the list from the first minute,
so the section structure is visible immediately instead of appearing piecemeal
as children feed them.

Skills normally only enter `you.skls` when they first level up, and the game's
`load()` does `for(let ab in skl){skl[ab].lvl=0; skl[ab].exp=0;}` before
rebuilding the list from the save — so the seed also runs from the tick. A save
made before this existed gets them added; once seeded and saved they restore
normally and the re-seed is a no-op. Verified idempotent: twenty re-seeds leave
the list at ten with no duplicates.

Row names are short (`Combat Discipline`, `Field Discipline`) because the full
name wrapped to two lines under its own header; the tooltip keeps the full name.

**Ordering.** A section's parent is always the first skill in that section,
whichever sort is active. The game's A-Z / TPE / LVL buttons call
`you.skls.sort()` inside their own inline handlers and redraw directly, so
listeners added after theirs note which button was pressed and re-apply the
section/parent ordering — the user's chosen sort still applies *within* each
section. The game only records a direction toggle, not which button, so the
mode is tracked separately.

Verified: parent first in all ten sections after A-Z, TPE, LVL and a repeat
A-Z (direction reversed), with rows still index-aligned.

## Balance

Sections 3-7 made the player far stronger than vanilla. Measured by setting
every skill to the same level in both builds:

| every skill at | STR | INT | HP |
|---|---|---|---|
| lv 10 | 2.5x | 3.7x | 1.0x |
| lv 20 | 7.0x | 12.6x | 1.1x |
| lv 30 | 22x | 51x | 1.3x |

Offence is exponential (each added skill's percentage applies to a value the
previous ones already raised); defence is nearly flat.

### Enemies scale on the same curve shape

Enemy stats grow LINEARLY in the base game's `lvlup()`. So enemy power here is
exponential in the enemy's own level — `base * (1+rate)^lvl` — not a flat
number and not a live mirror of your stats. Applied through the stat multiplier
fields (`strm`/`aglm`/`intm`/`hpm`), which `stat_r()` reapplies from base values
every call, so it is idempotent and cannot accumulate. Speed is deliberately
left alone so turn order stays fair. Exp reward scales as `M^0.5` so grinding
still pays.

Existing area level ranges were also raised x1.4, tutorial areas exempt.

### Why player HP had to change too

Enemy-side tuning alone could not work. Sweeping the enemy HP exponent:

| hpPow | skills 30 / enemy 12 | skills 50 / enemy 76 |
|---|---|---|
| 1.0 | kill 1, die 14 | kill 5, die 1 |
| 1.4 | kill 1, die 13 | kill 51, die 1 |
| 1.7 | kill 1, die 14 | kill 360, die 1 |
| 2.0 | kill 2, die 14 | kill 2277, die 1 |

"die in 1" at every setting. Across skill levels 10-30 the player's STR grows
~20x while max HP grows ~1.5x, so any enemy tough enough to survive the
player's damage necessarily one-shots the player.

Rather than cut the player's damage, max HP now follows offence on the same
curve, damped by `hpTrack` (0.85). Nothing was weakened.

### Where it landed

| Skills | Area | Enemy lv | Hits to kill | Hits to die |
|---|---|---|---|---|
| 10 | Western Woods | 10 | 4 | 49 |
| 20 | Home Basement | 20 | 5 | 30 |
| 30 | Deep Woods | 12 | 1 | 71 |
| 40 | Sunken Hollow | 35 | 3 | 26 |
| 50 | Ashen Spire | 50 | 2 | 26 |
| 60 | Long Vigil | 60 | 5 | 14 |

Deep Woods at skills 30 being trivial is correct — you have outgrown it, which
is what the new areas are for.

These are starting values from a rough model (raw STR vs max HP), not derived
optima, and they ignore crit, affinities, equipment and resistances. Tune from
the console:

```js
modBalance()               // current settings and what they mean
setEnemyScale(base, rate)  // e.g. setEnemyScale(1.5, 0.05) for an easier ride
setHpTrack(0.85)           // how strongly your max HP follows your damage
```

## New areas

Reached from the Western Woods gate — "Follow the old path deeper".

| Area | Enemy levels | Built from |
|---|---|---|
| The Sunken Hollow | 30-40 | slimes, wolves, zombies |
| The Ashen Spire | 45-58 | golems, ghosts |
| The Long Vigil | 55-68 | greater golems, corpses, unsanctioned |

All three are endless (`size = -1`), like the game's own hunting grounds, and
use creatures already in the game so there are no new bestiary entries or drop
tables to get wrong. Location ids 975-978 sit clear of the game's highest (169),
and the game restores a location on load by scanning `chss` for a matching id,
so these are found like any other.

The trailhead is linked in by wrapping `chss.frstn1main.sl` rather than editing
the game's own function.

## Progression level caps

Skills stop gaining xp at a ceiling set by how far you have got in the story.
This is the thing that keeps everything else bounded — the earlier sections made
player power exponential in skill level, and the cap turns that into a series of
finite steps instead of an open curve.

| Cap | Reached by |
|---|---|
| 10 | the beginning |
| 15 | finishing training |
| 20 | the forest |
| 30 | deep forest / hunter's lodge |
| 40 | the catacombs |
| 50 | golem arena I-II |
| 60 | golem arena III-IV |
| 75 | The Sunken Hollow |
| 90 | The Ashen Spire |
| 110 | The Long Vigil |

Every one of these is genuinely reachable — see "Balance, seventh pass" for the
exp curve that makes it so, and the enemy model fitted to it.

Tiers are read from `global.flags`, which the game saves and restores
(`global.flags = a1.e` on load), so the cap follows the **character**, not the
browser. Each tier also accepts a base-game flag as a fallback, so a character
who already cleared that content is not stuck at a low cap. When a skill hits
the ceiling it says so once, then goes quiet.

`modCaps()` in the console lists the tiers and marks which you have reached.

### Fixed: adopting the cat granted cap 40

The catacombs tier tested `global.flags.catget` and `cat_g`. Those are not the
catacombs. `catget` is set by *"The cat decided to move into your house"* —
adopting the pet cat — and `cat_g` by petting it 100 times. Both are available
early, so any character with a cat jumped straight from cap 20 to cap 40.

A name is not a definition. The catacombs are now detected by actually visiting
them (`mod_t_cata`, set by the `chss.catamn` / `chss.cata1` hooks).

Two related corrections in the same pass:

* The Hunter's Lodge was treated as "deep forest", but it is one click from the
  forest gate, so arriving there handed out cap 30 immediately. Deep forest now
  requires the forest interior (`frstn1a1`, `frstn1a3`, `frstn1a4`, `frstn2a1`,
  `frstn9a1m`) or the `frstn1a3u` discovery flag.
* Tiers are now declared as **data** — `{cap, name, flags:[...]}` — rather than
  closures, so `modCaps()` can report exactly which flag put you on a tier, and
  the cap line's hover text names it too. That is what makes this class of
  mistake self-diagnosable instead of needing a code read.

### Fixed: the endgame tiers unlocked on arrival

The Hollow / Spire / Vigil tiers were set by the location's `sl()`, which runs
when you merely look at the place. Clicking through to The Long Vigil once
granted cap 110 outright — for an area that kills an unprepared character on
arrival.

They are now earned by fighting there, and in order:

| Cap | Needs |
|---|---|
| 75 | 10 kills in The Sunken Hollow |
| 90 | 15 kills in The Ashen Spire (after the Hollow) |
| 110 | 25 kills in The Long Vigil (after the Spire) |

Kills are counted from the game's own `akills` counter while `global.current_z`
is that area, stored in `global.flags.mod_prog` so they save with the character.
Verified: kills earned elsewhere do not count, the order cannot be skipped
(25 Vigil kills with no Hollow progress grants nothing), and progress survives
save/load.

The old visit flags (`mod_t_hollow`/`spire`/`vigil`) are no longer read, and
**Recheck clears** deletes them from a save that still carries them.

### The skill sheet header

The cap line now also shows what the next tier wants:

```
Skill cap 30  Deep forest  (0/20 maxed)
Next: cap 40 — reach The catacombs
```

**Recheck clears** button — reports every tier with the reason it is or is not
met, prints endgame kill progress, clears unearned legacy flags, and
recalculates the cap. `modClears()` and `modResetCap()` do the same from the
console.

### Fixed: the list ran under the save bar

The game hard-sets `dom.skcon` to 335px inside `.ctrwinbx`, a fixed box at
`top:53px`. Adding a control bar above the list pushed the total past the panel.
The scroll area now shrinks by whatever the bar occupies, recomputed whenever
the bar's height changes (the "Next:" line appearing or disappearing).
Verified: 335 = 61 bar + 274 list, and the list's bottom edge lands exactly on
the panel's.

### Fixed: section headers threw on every tick

Headers were inserted as each row's FIRST child. The game's per-second updater
reads `children[0]`, `children[1]` and `children[2].children[0]` of every row,
so that shifted all three and threw a TypeError once a second.

`.skwmmc` is `display:flex`, so the header now sits LAST in the DOM with
`order:-1; flex:0 0 100%` — it renders above the row while leaving
`children[0..2]` exactly where the game expects them. Verified: header is the
last child, renders above, name and xp-bar cells intact, and three seconds of
the game's updater runs clean.

## 100 more skills

All discovered by playing, same machinery as the nine before them: the game's
own `global.stat.*` counters (all 44 were checked to be incremented somewhere)
plus 37 environment predicates — weather, season, moon phase, hour of day,
health and energy thresholds, indoors/outdoors, in or out of combat.

Families: combat depth, survival, weather, celestial and time, crafting and
trade, knowledge, food and body, exploration, discipline.

Two things had to be different from the first thirteen:

**Additive, not compounding.** The 13 earlier skills each multiply in sequence,
which is what produced the runaway curve. Doing that with 100 would be absurd
(100 skills at +15% compounding is about 1.2 million x). These are summed per
stat and applied once. Rates are also normalised per stat, so a stat carried by
6 skills is not six times weaker than one carried by 46.

**Light milestones.** Giving each of the 100 the full tier package — which
includes stat *multipliers* — produced "kill in 1, die in 4271" against every
area in the game. They get three modest milestones instead (xp rate, then small
flat stats).

## Balance, third pass

Adding 100 skills broke the previous tuning, and one structural problem showed
up: enemy level is capped by area design around 60, while player damage is
driven by skill level up to 110. No level-keyed enemy curve could catch that —
`kill in 1` persisted at every rate and HP exponent tried.

So enemy power now has a **story-tier term** as well as its level term. That
tracks how far you have got, not your live stats — the same progression the
skill cap reads.

Final numbers (enemy rate 0.05, hpPow 1.6, tierRate 0.045, hpTrack 0.92):

| Cap | Area | Enemy lv | Kill in | Die in |
|---|---|---|---|---|
| 10 | Western Woods | 10 | 1 | 107 |
| 20 | Deep Woods | 12 | 3 | 50 |
| 40 | Catacombs era | 20 | 1 | 84 |
| 60 | Golem arena IV | 41 | 2 | 34 |
| 75 | Sunken Hollow | 35 | 2 | 40 |
| 90 | Ashen Spire | 50 | 3 | 17 |
| 110 | Long Vigil | 60 | 14 | 9 |

Difficulty now ramps across the story instead of staying flat. Early fights are
still fast; the endgame is genuinely dangerous. Still a rough model (raw STR vs
max HP, ignoring crit, affinities, equipment and resistances) — tune with
`setEnemyScale()`, `setHpTrack()` and `modBalance()`.

## Balance, fourth pass

Lower player power meant enemies were overtuned, so `tierRate` dropped from
0.045 to 0.02 and `hpPow` rose to 1.8.

| Cap | Area | Kill in | ...in good conditions | Die in |
|---|---|---|---|---|
| 10 | Western Woods | 2 | 2 | 59 |
| 20 | Deep Woods | 4 | 2 | 40 |
| 60 | Golem arena IV | 2 | 1 | 32 |
| 90 | Ashen Spire | 2 | 1 | 25 |
| 110 | Long Vigil | 6 | 1 | 14 |

Conditions now measurably matter: endgame kills drop from 6 hits to 1 when the
conditional skills are live, which is the point of them.

## Skill panel: sections, parents, hide-maxed

With 173 skills the flat list was unusable. The panel now has two checkboxes at
the top — **Hide maxed** and **Group by type** — and the list is split into ten
sections:

Combat Mastery, Body & Endurance, Fieldcraft, Daily Life, Crafting,
Resistances, Affinities, Gathering, Upkeep, Companions.

"Hide maxed" hides any skill already at the current story cap, so once a skill
tops out for this stage it stops taking up space until the cap rises.

### Parent skills

Each section has a parent skill (`<Section> Discipline`, 10 of them). A parent
earns 3% of everything its children earn. In return it pulls up whichever
children lag behind it: a child below the parent's level trains **5% faster per
level it is behind, capped at +100%**. So a neglected skill is cheap to bring
up once the rest of its section is developed — which is the point of having 183
of them.

Parents grant no stats. They are pure support, so they add no power creep.
`modParents()` lists them with their child counts.

### The rendering constraint

Every path in the game that draws the list does:

```js
for(m=0; m<you.skls.length; m++){ renderSkl(you.skls[m]);
  if(m===you.skls.length-1) dom.skcon.children[m].style.borderBottom=... }
```

so `dom.skcon.children[m]` is assumed to line up with `you.skls[m]`. Hidden rows
are therefore **rendered and then set to `display:none`** rather than skipped,
and section headers are inserted **inside** the row element rather than as
siblings. Skipping rows or adding sibling headers makes `children[m]` undefined
and throws. Verified: row count always equals `you.skls.length`, hidden or not.

The panel is built inside the game's own inline handler on `ct_bt2`, which
cannot be wrapped — a second listener on the same element runs after it, by
which point `dom.ctrwin3` and `dom.skcon` exist.

## Live action tooltips

`renderAct` does `addDesc(el, null, 2, a.name, a.desc())` — `desc()` is called
once, at render time, so action tooltips were a static snapshot. The four action
descriptions now report the skills they train with current level and cap, e.g.

```
Sit and guide your energy through its channels
Exp +0.4/s
Qi Circulation (lv 7/110, +0.9/tick)
Meditation (lv 0/110, +0.35/tick)
Patience (lv 0/110, +0.2/tick)
```

These refresh whenever the actions panel is reopened, which is when renderAct
runs again.

### Cost

Measured, since parents now fire on every xp grant: one grant costs 3 internal
calls (child, parent, overflow) with no runaway; a full tick of all 113
discovered skills costs 0.14 ms; `allbuff()` costs 0.057 ms per call. Negligible
even at 20x speed.

## Skill cap shown on the sheet

The skills panel header now reads e.g. `Skill cap 20  The forest  (14/61 maxed)`
and updates live from the tick hook, so a tier unlock shows immediately rather
than only when the panel is reopened.

## Effect lines for the previously blank skills

The first pass gave an effect line only to skills whose `use()` returned a value
traced to a call site, and printed nothing for the rest rather than invent a
number. Water Absorption was one of those blanks.

Going back through them properly: most of those skills DO have a real effect, it
just is not expressed through `use()` — they are read directly as `skl.<x>.lvl`
inside whatever system they belong to. Twenty now have live lines, each quoting
the formula from the line of game code that uses it:

| Skill | Real effect (from the game's own code) |
|---|---|
| Water Absorption | `lose *= 3/(1+lvl*0.03)` — energy drain while wet, ×3 untrained, ×1 by lv 66 |
| Air Absorption | `d = 200/(1+lvl*0.05)` — lightning strike damage, 200 untrained |
| Evasion | `...+10-skl.evas.lvl` — enemy hit chance −1% per level |
| Night Sight | `hit_a*(.3+lvl*0.07)` in darkness — 30% of normal untrained, no penalty at lv 10 |
| Throwing | `500/(lvl||1)` — throw cooldown in ms |
| Cooking | `random()+lvl*0.1 >= 0.30` — success chance |
| Crafting / Patience | `5000-(crft.lvl*350 + ptnc.lvl*150)`, floor 300ms — autocraft time |
| Disassembly | `am + am*(quality*lvl)` — salvage yield |
| Perception | `2*(1+lvl*0.2)` — scouting speed |
| Hunting Sense | `drop.c/75*lvl` — added area drop chance |
| Dice | `0.3+lvl*0.03` — find chance |
| Alcohol Tolerance | `agle /= 1+(.4-lvl*.03)`, `stre *= 1+(.2+lvl*.02)` while drunk |
| Toughness | contributes `lvl*0.11` to the toughness term |
| Gluttony | `rand(100, 355*(lvl*0.2+1))` — its own xp per meal |
| Patting | grants a title at lv 10, nothing else |

### Four that genuinely do nothing

**Fire, Earth, Light and Dark Absorption appear nowhere in the game outside
their own definitions.** They are unimplemented in the base game — their
descriptions promise "minor protection from fire-based attacks" and so on, but
no code reads them. Only Water and Air of the six affinities are wired up.

Their tooltips now say so plainly rather than staying silent. They could be
given real effects, but that would be inventing mechanics rather than reporting
them, so it is left as a decision to make deliberately.

### One implementation note

`MOD_EFFECTS` is now looked up **per tooltip read** instead of captured when the
description getter is installed, so effect lines added by later sections apply
to skills wrapped earlier.

## The four dead affinities now do something

Water and Air were the only two of the six the base game wired up. The other
four now reduce damage of the kind their own descriptions already claim
protection from, routed through the game's own `you.res` table rather than a
parallel system:

| Skill | Reduces | Rate |
|---|---|---|
| Fire Absorption | burn damage | 0.8%/level |
| Earth Absorption | physical damage | 0.8%/level |
| Light Absorption | blind effects | 0.8%/level |
| Dark Absorption | curse effects | 0.8%/level |

Capped at −50%, reached around level 62.

`res` values are damage multipliers where lower is better — the base game's own
perks do exactly this (`you.res.ph -= .01` for "Damage taken −1%").

### The save trap this had to avoid

`you.res` is saved (`res:you.res` in the save object), so mutating it bakes the
reduction into the save file. Re-applying on load would stack the bonus on top
of itself, compounding every time you loaded.

So the amount applied is tracked in `global.flags`, which is saved alongside it.
On load both come back consistent and the reconciliation subtracts only the
difference. Verified across two full save/load cycles: resistances hold at
0.928 and do not drift.

`modResetAffinities()` removes everything the mod took off `you.res`, for
going back to vanilla cleanly.

## Collapsible skill groups

Click a section header to fold it. The arrow flips between ▾ and ▸, and each
header shows its skill count and how many are maxed:

```
▾ Combat Mastery (12, 3 maxed)
▸ Resistances (9)
```

Same `children[m]` constraint as before, so a collapsed section keeps its rows
in the DOM: the first row stays visible to carry the header with its own
content hidden, and the rest go to `display:none`. Row count still equals
`you.skls.length`. Verified: collapsing takes 9 visible rows to 7, all four
headers stay on screen, and expanding restores exactly 9.

This supersedes the section 11 render wrapper by re-wrapping the original
directly — stacking on top of it would have drawn every header twice.

## Balance, fifth pass — the xp curve is the real limiter

The previous passes were tuned against a scenario that cannot happen. I had
been fitting enemies to "every skill at the level cap", i.e. skills at level
110 in the endgame. The game's own experience curve makes that unreachable:

```
expnext = 50 + (lvl+1)^log(9*lvl+1)
```

Total experience to reach a level from scratch:

| level | total exp |
|---|---|
| 1  | 51 |
| 5  | 716 |
| 10 | 47,986 |
| 15 | 1,151,201 |
| 20 | 13,647,481 |
| 25 | 104,775,357 |

A passive skill earns roughly 0.2 exp per tick with this mod's 2x multiplier,
so at 1x game speed:

| hours played | level reached |
|---|---|
| 1     | 5 |
| 10    | 7 |
| 50    | 9 |
| 200   | 11 |
| 1000  | 14 |

So the level cap is a *ceiling*, not a target. Realistic play sits around
level 10 in the woods and level 20-22 by the endgame — an order of magnitude
below what I had assumed. Enemies fitted to level 110 skills were, at
attainable levels, killing the player in one to three hits everywhere past
the catacombs (Golem arena IV: kill in 227 hits, die in 3; Long Vigil: kill in
4,962, die in 1).

Retuned `MOD_ENEMY` against attainable levels instead:

```js
base:     4       // flat multiplier at level 1   (was 5)
rate:     0.02    // compounding per enemy level   (was 0.05)
hpPow:    1.1     // enemy HP uses M^hpPow         (was 1.8)
tierRate: 0.008   // extra growth per story cap    (was 0.02)
```

Verified across every tier at the skill levels players actually reach:

| cap | area | skills | your STR | enemy HP | hits to kill | hits to die | with max Renown |
|---|---|---|---|---|---|---|---|
| 10  | Western Woods  | 10 | 850  | 1,400  | 2  | 42 | 2 / 65 |
| 20  | Deep Woods     | 14 | 1,392 | 3,583 | 3  | 19 | 2 / 29 |
| 40  | Catacombs      | 17 | 2,111 | 915   | 1  | 20 | 1 / 30 |
| 60  | Golem arena IV | 19 | 2,615 | 14,266 | 6 | 11 | 4 / 18 |
| 75  | Sunken Hollow  | 20 | 3,722 | 23,330 | 7 | 7  | 4 / 11 |
| 90  | Ashen Spire    | 21 | 4,122 | 12,361 | 3 | 7  | 2 / 11 |
| 110 | Long Vigil     | 22 | 4,557 | 44,868 | 10 | 5 | 7 / 7  |

The shape is what you want from a difficulty ramp: the early woods are very
forgiving (42 hits of margin), the endgame is genuinely tight (5 hits), and
nothing is ever unwinnable. Renown at level 10 is worth roughly a 50% margin
increase, which makes it valuable without being mandatory.

If you want it harder or easier, the four numbers above are live in the
console: `MOD_ENEMY.rate = 0.03` and so on, effective on the next enemy
generated.

## Balance, sixth pass — consolidating the discovered skills

The "100 more skills" set had done its job — broad play surfaces skills — but
100 of them was more than the panel, the tooltips or a player could hold. This
pass folds them down to **10** and re-checks the curve. (It got there in
stages: a first cut to 45, then 28, then this.)

### Same effect, fewer entries

Each survivor absorbs a family of near-duplicates and takes the **sum** of the
group's per-level `pct`, so the continuous effect available per stat is
unchanged to the digit.

| stat | per-level % total | of which permanent | conditional | skills: was → now |
|---|---|---|---|---|
| STR | 5.896 | 3.014 | 2.882 | 34 → 3 |
| INT | 7.766 | 4.906 | 2.860 | 46 → 5 |
| AGL | 2.618 | 0.946 | 1.672 | 14 → 1 |
| SPD | 1.056 | 0.528 | 0.528 | 6 → 1 |

The ten: **Killing Intent** and **Mortality** carry STR-permanent; **Grit** is
all of STR-conditional; **Making**, **Study** and **Wisdom** split
INT-permanent; **Storm Sense** and **New Moon** split INT-conditional;
**Reflexes** is all of AGL; **Ranging** is all of SPD. Each row in `MOD_EXTRA`
carries a trailing `// + key, key` naming what it absorbed.

**Two compromises at this size:**

* AGL and SPD have no flagship key, so their *conditional* budget (1.672 and
  0.528 %/level) is folded into the AGL/SPD *permanent* flagship (Reflexes /
  Ranging) and applied as permanent. The per-stat total is held exactly; what
  changes is that footwork/stealth/nerve and flight/long-march now pay out
  always at ×1 rather than only-when-active at ×2 — roughly the same value over
  a session, a different feel. The perm/cond split is still exact for STR/INT.
* Only **10 of the 12 flagship** keys survive. `apet` (→ *Insatiable*) and
  `pthf` (→ *Wayfinder*) were folded into other skills, so those two lv-55→75
  title tiers are dropped from `MOD_FLAGSHIP`. The titles stay defined in `ttl`
  but are no longer earnable that way. The other ten flagships are untouched.
* `stmw` and `nwmn` had their predicates widened (`storm` → `outdoors`,
  `newmoon` → `nightOutdoors`) so their now-large budgets actually apply during
  normal play.

### The light-tier flats, doubled

`MOD_lightTiers` grants `<STAT> +N` at lv 10 / 25 / 50 — and that flat
contribution scales with the *number* of these skills, not their `pct`. At 100
skills it added up to real numbers; at 10 it barely registers. The values are
doubled (`+2 / +6 / +12`, was `+1 / +3 / +6`) to keep it in range. Even so the
player is a little weaker at attainable levels than at 100 skills, which shows
up as a slightly grindier endgame — see the table below.

### Old saves still load

The first cut renumbered the survivors 1001–1045. That is exactly the wrong
move: `load()` in `index.html` restores each skill's **level and milestone
flags by matching `id`** (`a6[a].id === skl[b].id`), so renumbering makes every
old id collide with a *different* skill — and where a v1 flagship skill (7
milestone slots) landed on a v2 three-slot skill, the flag restore ran off the
end of the array and threw, taking the whole load down to the game's
"SOMETHING BROKE" screen.

So **every survivor keeps its original v1 id** and the id list is just gappy
now (1001, 1013, 1025, 1035, 1044, 1056, 1077, 1092, 1096, 1097). A v1 save
then loads under v2 with:

* every base-game skill's level, exp, `p` and perks **exact** — those ids and
  save positions are unchanged;
* every *surviving* discovered skill's level and milestone flags **exact** —
  same id, and the milestone array is byte-identical (`MOD_lightTiers` plus,
  for flagships, the same four appended tiers);
* merged-away skills simply not restored — their `a6` entry finds no matching
  `id` and is skipped. Their progress is gone, which is the point of a merge.

The one imperfect part is `a7`, the *positional* `[exp, p]` array. It aligns
through every base skill, the four actions, the nine section-7 skills and the
ten parents — divergence only starts inside the consolidated block. Past that
point an added skill gets some other added skill's `exp` (the progress bar,
recomputed on the next xp tick) and its `p` — which is the constructor default
`1` on every mod-added skill, since the mod never writes `p` (its perks work
off milestone `g` flags, see section 8). Swapping 1 for 1 is a no-op.

`tests/savecompat.mjs` captures a real save from the 100-skill build —
including a level-60 flagship (`mrtl`, exercising the 7-slot restore) and
several merged-away skills — loads it under the current build and asserts the
load does not throw, the error screen never shows, `ontick()` survives, and
every check above holds.

`MOD.version` is `2.0` to mark the shape change; nothing enforces it in code.

The light-tier milestone flats (`STAT +1 / +3 / +6` at lv 10 / 25 / 50) now
total less simply because there are fewer skills to grant them — about +45
flat STR at a full low-cap clear instead of +100. Against 800–4,500 STR at
attainable levels that is under 1%, and it was left alone; the headline
per-level effect is what "keep the stat gains" was about, and that is exact.

### The curve did not move

`realbal` several times over, at each stage, at the skill levels players
actually reach (medians; RNG noise is roughly ±30%):

| cap | area | 100 skills k/d | 28 skills k/d | 10 skills k/d |
|---|---|---|---|---|
| 10  | Western Woods  | 2 / 39 | 2 / 35 | 2 / 45 |
| 20  | Deep Woods     | 4 / 22 | 3 / 20 | 5 / 21 |
| 40  | Catacombs era  | 2 / 22 | 2 / 28 | 2 / 23 |
| 60  | Golem arena IV | 7 / 10 | 7 / 11 | 8 / 10 |
| 75  | Sunken Hollow  | 4 / 9  | 6 / 7  | 6 / 7  |
| 90  | Ashen Spire    | 5 / 7  | 5 / 7  | 6 / 9  |
| 110 | Long Vigil     | 9 / 5  | 9 / 6  | 13 / 6 |

The continuous effect is balance-neutral by construction — each survivor's
`pct` is the exact sum of what it absorbed, so the aggregate at a given skill
level is identical. What drifts is the flat contribution: with only 3 STR
skills instead of 34, the `MOD_lightTiers` `+N` milestones add far less, so the
player is ~4–6% weaker at attainable levels. That is why the 10-skill endgame
is grindier — `kill 13` at the Long Vigil against `kill 9` before. Everywhere
else stays in the healthy band (`die` never below 5, no coin-flips); the
endgame is slower, not unwinnable.

`sweep5` over `rate` × `hpPow`, plus a `tierRate` sweep, both put the current
`MOD_ENEMY` (`base 4, rate 0.02, hpPow 1.1, tierRate 0.008`) at the best point
for those targets. Loosening `tierRate` only pulls the deliberately-tight
endgame (die 5 at the Vigil is by design) further from intent. **No dial was
changed.**

### Tests

Four scripts used a single mod skill (`bstl`, then `exmn`) as their slow-skill
stand-in for the xp curve; each round of merging swallowed it. It now points at
`skl.wsdm` — a flagship, so it can never be merged away — in `realbal`,
`fullbal`, `audit2` and `settings-boxes`.

New script `savecompat.mjs` (with a captured fixture under `tests/fixtures/`)
loads a pre-consolidation save into the current build — see "Old saves still
load" above.

Full suite green: audit 474/474, audit2 structural checks pass, the three
balance scripts, the economy and settings-box checks, and `savecompat` all
clean. A live character (level 29) loaded under the 28-skill build with every
level, perk and title intact, its skill list down from 103 to 87; the 10-skill
build takes it further, to the low 70s.

## Balance, seventh pass — a reachable level 110

### The finding: the cap ladder was fiction

`tests/capreach.mjs` (new) measures the game's own exp curve against the xp a
skill actually receives through the mod's grant path. Under the base game's

    expnext = round(50 + (lvl+1) ^ ln(9*lvl+1))

the ladder above ~20 could never be climbed:

| cap | total xp to reach it | at 1x | at 20x speed |
|---|---|---|---|
| 10  | 47,986   | 0.1 h | — |
| 20  | 1.36e7   | 1.6 days | 1.9 h |
| 40  | 1.08e10  | 3.4 years | 62 days |
| 60  | 8.47e11  | 268 years | 13 years |
| 110 | **1.08e15** | **343,000 years** | **17,200 years** |

…and that is with the *fastest* skill in the mod. The curve is
super-exponential: the single step 109 → 110 costs 1.16e14 xp, more than every
level beneath it combined. No multiplier reaches that — a 1000x xp boost still
leaves the top cap 17 years out. The first attempt at a fix shrank the ladder to
10..22 to match what was attainable; that is preserved in `epow` (below) but was
then superseded by fixing the curve itself.

### The fix: a geometric curve

Skills are re-curved in section 19 to

    expnext = round(base * ratio ^ lvl)      // MOD_XP: base 50, ratio 1.106

`ratio` is set so a steadily-ticking skill reaches level 110 in about six months
of real time at 1x. Only skills are re-curved; `you.expnext` (character level) is
the base game's own progression and is untouched. Because the base game assigns
`expnext` inside the `Skill` constructor rather than on a prototype, the override
is installed per instance over `skl` at load, and `expnext_t` is recomputed.

Measured time for each skill to reach 110, at its own xp rate:

| skill | xp/tick | to 110 @1x | @20x |
|---|---|---|---|
| Mortality | 100.0 | 3.5 days | 4.3 h |
| Study | 32.0 | 11 days | 13 h |
| Killing Intent / Wisdom | 14.4 | 25 days | 1.2 days |
| New Moon | 2.4 | **4.9 months** | 7.4 days |
| Storm Sense | 1.8 | **6.5 months** | 9.9 days |
| Grit | 1.6 | **7.3 months** | 11 days |

The counter-driven skills are quoted at their per-tick cap, which needs sustained
maximal activity; the three predicate-driven ones tick steadily on their own and
bracket the six-month target. The shape puts most of the climb in the last two
tiers — cap 60 arrives in under an hour of that budget, cap 90 at 11 h, and the
final stretch to 110 is the rest of the six months.

`modXpCurve()` prints the ladder; `setXpCurve(ratio, base)` retunes it live.

### Monsters had to be re-derived, not re-dialled

With 110 genuinely reachable, `tests/tierfit.mjs` (new) measures the player at
each tier with every skill sitting at that tier's cap:

| cap | STR | max HP |
|---|---|---|
| 10  | 651 | 2,920 |
| 40  | 46,017 | 20,600 |
| 110 | 3,878,659 | 198,303 |

**STR grows 5,958x across the ladder; max HP only 68x.** The old enemy model
multiplied STR/AGL/INT by one `M` and HP by `M^hpPow` — a single curve with a
fixed exponent, which cannot track two curves that far apart. Every cell of the
sweep failed somewhere: tune it so the endgame stops one-shotting you and the
early game becomes unkillable, tune it back and the reverse.

> **Superseded by the eighth pass.** Everything from here to the end of this
> section describes a model that was replaced. It was fitted against the ratios
> `enemyHP/playerSTR` and `playerHP/enemySTR`, and those proxies ignore the fact
> that `dmg_calc` subtracts the defender's STR — so the numbers below do not
> describe fights that were actually happening. Kept as the record of how the
> mistake was made.

So the offence and HP sides got **independent per-tier rates**:

| dial | drives | fitted to |
|---|---|---|
| `strTier` 0.024 | enemy STR / AGL / INT | the player's max HP growth |
| `hpTier` 0.076 | enemy max HP | the player's STR growth |

`hpTier` is the larger by roughly the ratio of those two growth curves, which is
why one exponent could never do it. Both are per point of `epow` — the tier's own
exponent, never the cap number, so the ladder stays independent of difficulty.
`base` rose 4 → 12 and `hpPow` sits at 1.0, since the tier dimension is now
`hpTier`'s job. Grid-searched over `base` x `strTier` x `hpTier` against a
fitness score wanting `kill` in [3,12] and `die` in [8,25] at every tier.

### Where it landed

Skills at the cap, neutral conditions, no titles:

| cap | area | kill / die | with conditions | with Renown 10 |
|---|---|---|---|---|
| 10  | Western Woods  |  3 / 18 | 2 | 2 / 28 |
| 20  | Deep Woods     |  6 / 10 | 2 | 4 / 16 |
| 40  | Catacombs era  |  1 / 21 | 1 | 1 / 33 |
| 60  | Golem arena IV |  3 / 16 | 1 | 2 / 24 |
| 75  | Sunken Hollow  |  4 / 12 | 1 | 2 / 19 |
| 90  | Ashen Spire    |  4 / 16 | 1 | 3 / 25 |
| 110 | Long Vigil     | 13 / 10 | 1 | 8 / 16 |

The column that matters is `die`: **10–22 at every tier**, across a ladder where
the player's damage multiplies by nearly six thousand. That is what "monsters
stay on par" means in practice — the fights keep their shape while both sides'
absolute numbers run away together.

`kill` sags to 1–4 in the middle. Those are areas whose enemy *level* is low for
the tier by the base game's own design (Forest-far at level 7, the Catacombs at
20) — places you have outgrown, which earlier passes already treat as correct.
The tier-appropriate endgame is a real fight at 13 hits, and the conditional
skills still pay for themselves by cutting it hard.

## The catacombs are unreachable in the base game

`mod_t_cata` gates the cap-40 rung, and it is set by hooking `chss.catamn` /
`chss.cata1`. Those hooks can never fire, because **there is no way into the
catacombs**.

The content is all there: `catamn` ("Catacombs, The Entryway") plus `cata1` to
`cata25` — 26 written locations with their own ambient text table
(`global.text.catasound`), ghouls whose bestiary entry says "Ghouls lurk in the
Catacombs", and an exit back to the Village Center. What is missing is the way
in. Grepping the whole game for `catamn` returns exactly three hits: its own
definition, its own `sl()`, and one `smove(chss.catamn)` from *inside* `cata1`
going back to the entryway. Every `smove(chss.cata*)` in the file sits between
lines 12917 and 13223 — that is, inside the catacombs themselves. Nothing
outside links in, and there is no dynamic `chss['cata'+n]` lookup either.

So it is finished-but-unwired content, the same category as the `dfl` sell-back
rates, the four dead affinities and `enmondren` — all of which this mod switched
on. The catacombs are the one such thing still dark.

Consequence for the ladder: the cap-40 tier can never be earned, so it is simply
skipped — golem arena I-II sets cap 50 on its own and `MOD_levelCap()` takes the
highest tier met. Nothing is blocked, but that rung is decorative. Wiring an
entrance (one `chs()` on the Village Center, the same trick the Old Path
trailhead uses) would light up 26 locations and the missing rung; not done
unprompted, because it adds a route the base game never offered.

## The added areas wait for the base game to finish

The Sunken Hollow, The Ashen Spire and The Long Vigil used to hang off the
Western Woods gate from the first minute, and the trailhead listed all three at
once. Level caps were earned by fighting there, but the *doors* were open long
before the areas were survivable.

Now the whole branch is gated on the base game being done:

* The **trailhead itself** is not drawn on the Western Woods gate until
  `global.flags.trne4e1` — golem arena IV cleared, the deepest normal content
  the base game has. The dojo chain gates arenas I → II → III → IV on each
  other and `area.trne4.onEnd` sets the flag and grants a title, so it is a real
  end-of-content marker rather than a flag that happens to be lying around.
* Inside the trailhead the three open **in order**, on the same kill counts that
  already govern their caps: the Hollow immediately, the Spire after 10 kills in
  the Hollow, the Vigil after 15 in the Spire. An area and its cap now unlock at
  the same moment instead of the area being walkable far ahead of it.
* While an area is shut the trailhead says so and shows progress
  ("choked with fallen rock (3/10 cleared in The Sunken Hollow)").

One trap worth recording: those hint lines must be `chs(text, false, 'grey')`,
not `true`. `chs(txt, true)` calls `clr_chs()` — it is the "first line of a
location" form — so passing `true` silently wiped every choice drawn above it,
including the Hollow. `tests/areagate.mjs` caught it immediately.

`tests/areagate.mjs` drives the real `sl()` handlers and reads the rendered
choices: trailhead hidden before the arena, shown after, only the Hollow
offered, Spire after the Hollow, Vigil after the Spire, and the caps
(60 → 75 → 90 → 110) tracking the doors exactly.

## Balance, eighth pass — the enemy model was scaling the wrong fields

Checking the early game turned up a tutorial that could not be won, and pulling
that thread found the whole ladder was broken in the same way.

### What was measured

The first fight of the game, through the game's own `dmg_calc` and `hit_calc`:

| | player | straw dummy |
|---|---|---|
| STR | 1 | 24 |
| HP | 39 | 225 |

Player hit chance 12%. **99% of the hits that landed dealt zero damage.** 63,000
swings to kill it; it killed the player in 1. With the mod's scaling switched
off the same fight reads **15 swings to kill, 15 to die** — the base game's own,
perfectly reasonable opener.

Then the rest of the ladder, skills sitting at each tier's cap:

```
 tier area              you STR    enemy STR      kill    die
    0 Tutorial              265           26         1  never
    1 W forest grind        686          231         4  never
    3 Southern forest     9,966        1,052         1      1
    6 Golem arena IV    370,119        3,379         1      1
    9 Long Vigil      4,123,672       25,014         1      1
```

Tier 3 onward was a mutual one-shot: whoever swung first won.

### Why

`dmg_calc` is subtractive in both directions:

```
you hit it :  (your STR * eff + weapon) * affinity  -  its STR   + 1
it hits you:   its STR * affinity  -  (your STR * eff + armour)
```

The defender's STR **is** their armour. The old model multiplied `strm` (and
`aglm`, and `intm`) by one number and `hpm` by another. Multiplying an enemy's
STR raises its offence and its armour together, and the moment its armour passes
your STR your damage does not get small, it clamps to zero. `aglm` fails the
same way from the other side: it is the denominator of `hit_calc(1)`, so scaling
it drops your hit chance exactly as fast as it raises theirs.

The `die: 10–22` in the seventh-pass notes came from the ratio
`playerHP / enemySTR`. That proxy ignores the subtraction, the affinity and
class multipliers, and the crit path; real incoming damage ran 10–20× higher.
The `base × strTier × hpTier` grid search had been optimising a number that did
not correspond to a fight.

Also worth recording: `MOD_AREA_EXEMPT` exempts the tutorial areas from the
level-range scaling, with a comment about not walling off the early game. It
never did that — `MOD_scaleEnemy` runs from `lvlup` regardless of area, so the
dummies got the full 12× stat multiplier anyway.

### Three fields, three questions

A fight is three things, and they now have three fields with no crosstalk:

| question | field |
|---|---|
| how long it takes to kill | `hpm` |
| how fast it kills you | `_modDmg`, applied in the `dmg_calc` wrapper |
| how often either side lands | `aglm`, solved for a target hit rate |

Enemy STR is left at its base-game value (`MOD_ENEMY.armor`, which exists so
that stays visible). Threat is delivered without touching armour.

### Nothing is replicated, everything is measured

The first attempt replicated both branches of `dmg_calc` so a spawn could be
solved analytically. Two things killed it.

It is **ill-conditioned**. Enemy damage is `attack − your defence`, and late on
your defence dwarfs the damage the subtraction is meant to leave behind — STR
4.1M against a target of 56k. A 2% error in the replica is a 150% error in the
result.

And the base game's defence term **goes negative**. Its last multiplier is

```
(100 - (eqp[1].aff[atype]*5*(1+shdc/20) + target.cls[ctype]*5*(1+shdc/20)))/100
```

`shdc` at level 110 makes that bracket 6.5, and `eqp.dummy` — the single item
object every unequipped slot *and every monster in the game* shares — has your
unarmed progression written into it by `lvlup` (`aff[0] = you.lvl/5`,
`cls[2] = you.lvl/4`). At character level 92 the multiplier is **−12.3**, so
your defence is *added* to the enemy's damage. A level 59 golem with 57 STR hit
for 190 million. No attack-stat dial can correct for a term of the wrong sign.

That same shared object is why enemies carry a hidden ~2.1× multiplier on their
own attacks by character level 20, which the first analytic version also missed.

So nothing is replicated. Each spawn runs the game's real `dmg_calc` a handful
of times in both directions and is scaled against what came out. `MOD_probe`
parks the side effects while that happens: `dmg_calc` grants skill xp, sets the
crit flag and jiggles a DOM node, none of which may fire because a monster
walked into the room. `giveSkExp` is swapped locally rather than flag-guarded,
because other sections wrap it too and this must not depend on load order.

The wrapper then treats the game's raw number as a **shape, not a magnitude**:
divide by a slow EMA of what this creature has been doing, multiply by the
target. The game's variance and its crits survive; the sign and size of the raw
number stop mattering. Zeros are excluded from the average — early on the raw
number is zero on most swings, and letting those in drags the mean to nothing,
after which every landed hit reads as a huge ratio and clips against the ceiling.
A ratio with a moving denominator is also biased upward, so the shape is damped
toward 1 by 0.6 before use.

**The honest cost:** your defensive stats no longer change how hard you are hit.
Targeting a fixed number of swings-to-die already implied that — more armour
would only have meant a bigger enemy attack — and the base game's defence math
is not usable at these skill levels regardless. Offence is untouched: enemy HP
is set from your real measured damage, so hitting harder still kills faster.

### Anchored to the player, shaped by the area

The targets are ratios, solved per spawn against the player's current power
rather than fitted to a level. That is not a preference: within tier 0 alone the
player goes from STR 1 to STR ~265, a 265× swing, and no fixed multiplier
survives it.

Variety comes from two places. Each spawn is measured against the mean level of
the population it came from, so a lv 24 bat in a 14–24 basement is genuinely
harder than a lv 14 one. And each creature keeps its own `stat_p` character —
the base game's per-creature growth rates, the one thing that says a wolf hits
harder than a slime. The HP side gets a wide band (0.6–1.8) and the damage side
a narrow one (0.75–1.35) on purpose: a tanky creature with triple HP reads as
character, the same spread on damage decides whether a fight is survivable. The
golems have low `stat_p[1]` in particular, and an unclamped damage band left
every arena boss and most of the endgame hitting at 0.6×.

Two things were found only by measuring:

**The dials have to be two-sided.** Flooring every multiplier at 1, so nothing
could come out weaker than vanilla, sounded safe and was not. A lv 3 straw dummy
has 21 HP and 4 STR; a lv 2 character with 4 STR does 1 damage a swing against
it. 21 swings to kill while dying in 15 — and the floor was what prevented the
fix. Accuracy needed the same treatment: flooring `aglm` had early enemies
landing 60% of their swings against a 39 HP character instead of the 45% asked
for.

**Band and identity compound in the same direction.** Both push the top of a
level range toward more HP *and* more damage, so at the top of a wide band they
multiply into a fight lost by construction — kill 19, die 12 for a lv 12 rabbit
in a 5–12 area. `MOD_ENEMY.margin` is the floor under that: whatever the spread
does, killing always takes meaningfully fewer swings than dying.

Arena bosses get their own pair of factors. A protected, size-1, one-creature
area is one of the four golem trials; left to the general rules they came out as
the softest fights in the game, since a single-enemy area gets no level spread
to make up for the golems' low `stat_p[1]`.

### Where it lands

Targets `kill: 8, die: 20, hit: 0.45, margin: 1.7`. Every tier from the tutorial
to cap 110, every creature in each area at both ends of its level band:

```
 tier area              kill lo-hi    die lo-hi
    0 Tutorial               8-8         22-22
    0 Western forest        5-12         18-27
    1 W forest grind        6-12         17-25
    2 Basement               5-7         16-20
    3 Southern forest       4-13         16-17
    4 Golem arena I        12-12         19-19
    6 Golem arena IV         9-9         19-19
    7 Sunken Hollow         4-12         16-20
    9 Long Vigil             4-9         18-28
```

Whiff is 0% everywhere. The opening route with a genuinely fresh character —
levelled by the game's own `lvlup`, no titles, nothing equipped — is winnable at
every step, with the first tutorial fight at kill 12–13 against die 14–15, which
is within a swing of the base game's own 15/15.

### Tests

`tests/earlybal.mjs` walks the opening route and fails on any matchup that is a
loss (`kill >= die`), a slog (over 60 swings), or a whiff-fest. `BASELINE=1`
disables the mod's scaling so the base game's numbers come through the same
harness — which is how the original claim was verified rather than assumed.
`tests/combat.mjs` does the whole ladder the same way.

### Does it hold for the whole game?

`tests/allareas.mjs` answers that rather than assuming it: every area (21),
every creature in each, both ends of its level band, against all ten story-tier
player states, in three skill builds — the base game's skills alone, the mod's
added skills alone, and both together. **2,490 matchups, all winnable.**

The three builds are the check on the added skills specifically. They are 99% of
the player's STR by cap 110 (73 / 63 / 265 at cap 10; 22,929 / 68,793 /
4,105,291 at cap 110), so if the enemy model were fitted to a curve rather than
measured off the player, the builds could not possibly read alike. They do:
kill 1-21, die 14 to never, in all three. The cross product is the point —
the model anchors to the player's power at spawn, so `kill < die` has to hold
for any player in any area, a level 1 character wandering into the Long Vigil
included. Failures concentrated at the extremes would mean the anchor was
leaking.

Three things only the exhaustive run found, and the first was in the harness.

**The tests were leveling the player while measuring it.** `dmg_calc` grants
skill exp — `seye` on a crit, the affinity skills on incoming damage — and the
sweep calls it tens of thousands of times. Across 830 matchups that drift was
enough to move max HP 2.5x between a spawn and the measurement of the same
matchup, which read as a balance failure (`die` collapsing to 5) and was not.
`MOD_scaleEnemy` already parks `giveSkExp` for exactly this reason; the scripts
now do the same through a `quiet()` helper. Worth remembering before writing any
new probe against this game.

`killT` needed a ceiling. `band` and `stat_p` multiply, and at the top of a wide
band with a tanky creature they reached 2.5x the target — a 20-swing chip-fest —
and the margin computed off that number then had to make the enemy nearly
harmless to compensate.

And the **kill side needed a better estimator, not more samples.** With the guarantee
in place, one matchup in about a thousand still came out a loss, and
instrumenting a failing case (`_modKillT` / `_modDieT` are on the creature for
exactly this) separated the two cleanly: `dieT` 17.8 against a realised die of
18, ratio 1.000 — the damage wrapper is exact — while `killT` 9.43 came out as a
realised kill of 19. Enemy HP is set directly from a sampled mean and nothing
downstream corrects it, so a 2x overestimate is a 2x longer fight. The incoming
side self-corrects through the wrapper's moving average; the outgoing side does
not.

Raising the sample count 24 -> 64 only moved the failure rate to about one spawn
in 25,000, because the estimator was wrong rather than short. The distribution
is not one spread, it is two tight clusters — a normal swing varies by
randf(.9,1.1), a crit runs ~8x that — and nearly all the variance of a sample
mean is just how many crits happened to land. So `MOD_meanDamage` now strata on
the crit roll and recombines with the crit rate the game will actually use,
which is known rather than sampled (`MOD_critRate` reproduces `ctr_r`; note the
`b` multiplier never reaches it, since both branches that set it shadow it with
a `let`). `dmg_calc` sets its `crti` flag and never clears it, so clearing it per
call reads back which stratum a sample fell in.

That removed the dominant variance term outright, at half the samples: 32, down
from 64. Twelve consecutive clean runs of all 2,490 afterwards — about 30,000
matchups — and the three golem arenas now land on kill 10 / die 19 exactly.

The two matchups that stay trivial are legitimate: `nwh` ("Somewhere") holds
`creature.default`, id 0, which `MOD_scaleEnemy` deliberately skips, and a lv 1
straw dummy in the free practice yard is meant to be free practice.

### End to end

`tests/fightsmoke.mjs` is the end-to-end check the other two cannot be: nine
real battles per area through the game's own `attack()`, so the wrapper meets
the miss roll, the dodge check, the per-swing `allbuff` and death handling
rather than being called directly. Two things came out of writing it.

The page's own game loop keeps running during a headless duel and drops you out
of battle state, after which `attack()` returns immediately and the fight stalls
silently at the swing cap — it looked exactly like a balance failure. The test
re-asserts `global.flags.btl` every swing.

And **damage is heavy-tailed at the top of the ladder**, which is why the test
fights nine times and reports a median. Measured at cap 110 over 4,000 swings:
crit rate 33% (`seye`), crit multiplier about 8x (`cpwr` 4.6 and
`1 + skl.war.use()` compounding inside `dmg_calc`), median swing 159M against a
mean of 479M. Crits carry roughly three quarters of all damage. Two consequences
worth knowing: the 24-sample probe in `MOD_scaleEnemy` is estimating a mean with
a fat tail, which is why it is 24 and not 10; and one-shotting the weakest
creature in an endgame area with a crit is the build working, not a bug, so the
smoke test asserts no lower bound on fight length.

`realbal.mjs`, `tierfit.mjs` and `sweep5.mjs` were deleted. All three measured
the stat-ratio proxy or swept dials that no longer exist; keeping them would
have meant a suite that reports confidently on a model the mod no longer has.
`fullbal.mjs` kept its player-side attribution and had its combat columns moved
onto the real math.

## Three save slots

The game keeps exactly one save. `save()` writes localStorage `"v0.3"` and
`load()` reads it, both by name, and `load()` runs once from a `window` load
listener — there is no unload, no reset, and no notion of a second file.

Rather than edit either function, **`"v0.3"` always holds whichever slot is
live**, with a mirror beside it:

```
v0.3               the live save — the game's own key, untouched
p23_slot_N         a copy of slot N, N in 1..3
p23_slotmeta_N     name / level / cap / timestamp, for the panel
p23_slot_active    which slot is live
```

`save()` is wrapped to mirror into the active slot, so the copy refreshes on
every save by any route — the button, the 30-second autosave, an area's own
save call. The wrapper returns the blob unchanged, because that return is what
the export button reads.

Switching writes `v0.3` and reloads the page. That is not laziness: the game
builds its whole world at startup and reads the save once, so there is nothing
to unload. "Start new save" is the same move with the slot cleared first — the
game then finds no save and starts a fresh character, which is the only reset
it has.

Two decisions worth keeping:

**Boot adopts, never overwrites.** If the active slot has no mirror but `v0.3`
exists, that save becomes slot 1 — so a character from before this section
existed is picked up rather than orphaned. `v0.3` is otherwise left alone. A
mirror can only ever be the same age or staler than the live key, so
overwriting from it could only lose progress.

**Nothing destructive happens without the target in front of you.** Starting a
new save over a used slot, or deleting one, names the character and level in the
confirm. Leaving a slot saves it first, and if that save throws the move is
abandoned rather than trading a live character for a silent loss.

The game's own "delete the save" button called `localStorage.clear()`, which
would take all three slots and the mod's settings with it. It is rebound to
delete just the slot you are in — the game attached its handler anonymously, so
the node is cloned and replaced, which is the only way to drop it.

Slot metadata is written on save, but the panel falls back to reading the name
and level out of the blob itself when it is missing: the save is base64 of
pipe-separated segments and the first is the player object, so a slot from an
older build still shows who is in it.

`tests/saveslots.mjs` drives the real UI and the real `save()`/`load()` through
the whole cycle — three characters coexisting, switching both directions,
starting fresh without touching the others, deleting a slot you are not in,
and adopting a pre-slot save. Console equivalents are `modSaves()`,
`modSwitchSave(n)`, `modNewSave(n)`, `modDeleteSave(n)`.

## Settings menu: multiplier boxes

The skill exp and speed multipliers were console-only (`setSkillXp(3)`,
`setSpeed(4)`). They now have number boxes in the game's own settings window,
alongside the base game's options.

Three rows, appended to `dom.ctrwin4` using the game's own `opt_c` / `opt_t` /
`opt_v` row classes so they look native:

| box | range | ships at |
|---|---|---|
| Skill EXP multiplier   | any positive number | 2 |
| Game speed             | 0 to `MOD.max_speed` (20) | 1 |
| Enemy coin drop chance | 0 to 1 | 0.15 |

Details that matter:

* Typing a value and pressing Enter, or clicking away, applies it. The box
  then shows the value that was **actually applied** — the setters clamp, so
  typing 9999 into the speed box leaves 20 in it, and a rejected value (0 or
  blank for a multiplier) snaps back to the current one.
* Values are read back from the live state once per tick, so a change made in
  the console shows up in the box. That refresh **skips a box you are
  currently focused on**, so it can never overwrite a half-typed number.
* All three persist in `localStorage` across reloads, independent of your save
  file. Skill exp and coin drop chance got persistence in this pass to match
  the speed control, which already had it.
* Each row has a hover tooltip via the game's own `addDesc`.
* The rows are appended once at startup, because `ctrwin4` is built once
  rather than rebuilt on each open.
* The inputs carry a `mod_optn` class. The settings window already contains a
  number input of the game's own (the message log limit), so a bare
  `input[type=number]` selector picks up the wrong one.

Ten checks pass: the boxes render and are visible when the window opens,
typed values reach the real game state, the exp multiplier measurably changes
exp granted (7x in gives exactly 7x out), bad and out-of-range input is
clamped, Enter commits, the tick refresh leaves a focused box alone, console
changes flow back into the boxes, all three values survive a reload, the
settings window still opens and closes with the rest of its options intact,
and a normal save/load cycle is unaffected. No page errors.

## Save compatibility

This drove most of the design, and all of it is verified by test:

* The game saves milestone "granted" flags **by array index**. So milestones
  are only ever **appended**, never inserted — inserting would shift indices
  and silently mark the wrong perks as granted.
* On load the game re-fires any milestone at or below your current skill level
  that isn't flagged granted, so appended milestones are awarded
  retroactively on an existing save. That's intended here.
* The game saves each skill's exp and `p` **positionally** over `for..in skl`.
  New skills are therefore added at the **end** of the `skl` object, which
  happens naturally because `mod.js` runs after the game script.
* Actions are saved by id, not position, so new actions are safe.
* Loading a save resets every action's `have` flag, so a pre-mod save comes
  back without the new actions. A cheap 5s check re-grants any that are
  missing. `giveAction` only fires when `have===false`, so it doesn't spam.
* Skill **level and milestone flags** load by matching `id`, not position — so
  a skill can be *removed* without corrupting others, as long as no surviving
  skill reuses a departed id. The v2 consolidation relies on this: survivors
  keep their original ids, merged-away ids just find no match. See "Balance,
  sixth pass".

Tested: a save made in the **unmodded** game loads in the modded game with
every level, stat and perk flag identical, old perks still granted, new tiers
correctly withheld until you reach those levels, and the new skills sitting at
level 0 ready to train. `savecompat.mjs` extends this to a **v1-mod** save
(100 discovered skills) loading under **v2** (10): clean load, no error
screen, every surviving skill intact.

## Undo

- Disable the mod: delete the `<script src="mod.js">` line from `index.html`
- Revert `index.html`: `git checkout index.html`
- The mod adds nothing to your save that the base game chokes on, but export a
  save before big experiments anyway
