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

Tested: a save made in the **unmodded** game loads in the modded game with
every level, stat and perk flag identical, old perks still granted, new tiers
correctly withheld until you reach those levels, and the new skills sitting at
level 0 ready to train.

## Undo

- Disable the mod: delete the `<script src="mod.js">` line from `index.html`
- Revert `index.html`: `git checkout index.html`
- The mod adds nothing to your save that the base game chokes on, but export a
  save before big experiments anyway
