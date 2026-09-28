# Proto23 local mod — design record

**Version 4.7.** All mod code lives in `mod.js` — about 13,750 lines in 48
numbered sections, plus section 0, which must stay first, and a final one that
must stay last. The only change to the
game itself is one `<script src="mod.js">` line at the bottom of `index.html`.
Set up 2026-09-04.

## How to read this file

The first part, down to the end of **"What the mod does now"**, describes the
mod as it stands. Everything after it is the **design record, in the order it
was built**: what was found, what was measured, and why each change has the
shape it has.

Those sections describe the mod *as it was when they were written*. Where a
later version changed something, a note beside the statement says so and
points to where it lives now, in this form:

> **Since v4.2:** what changed, and where to read about it.

History is kept rather than rewritten because the reasoning is the point — most
of the mod's constraints exist because something broke once, and the section
that broke is where the explanation lives. `CLAUDE.md` is the short list of
those constraints; this is the long form.

## Run it

Open `index.html` — double-click it, no server needed. It is a single
self-contained file with no ES modules, and the mod loads fine over `file://`
(verified). To serve it instead, `npx http-server -p 8080 -c-1 .` — the `-c-1`
stops the browser caching an old `mod.js`.

## Console commands

Open DevTools (Cmd+Option+I). `modHelp()` prints only the basics; this is the
full set.

```js
// where you stand
modNext()                 // what is ready now, what you are working on, what is locked
modCaps()  modClears()    // story cap, and the clears that raise it
modRealm() modRoad()      // cultivation realm, and the whole price of the next one
modRoots() modMastery()   // spiritual roots; the six elemental masteries
modDojo()  modRankLadder()// Level Advancement rungs; the Hall of the First Gate
modConverge() modRarity() // folding progress and slip prices; skill rarity
modTitles() modRenown() modPerks() modParents() modDiscoveries() modActions()

// economy and items
modEconomy()  modItemValue(item)  modItems()  modCrafting()  modMeat()  modLooseEnds()

// settings (each also has a box in the game's settings window)
setSpeed(3)  getSpeed()  resetSpeed()   // game speed, persisted
setSkillXp(1)  getSkillXp()             // skill exp multiplier, persisted; the original is 1
setMoneyDrops(0.15)  modResetMoneyDrops() // enemy coin drop chance; the original is 0
setNumberFormat('short')  modNumbers()  // 'game' | 'short' | 'sci' | 'myriad'
setFreeActions(true)  getFreeActions()  // run several actions at once
setXpCurve({vanillaTo: 10})  modXpCurve() // how many of the author's own skill levels to keep
setPacing('original')  getPacing()  modPacing() // 'original' or 'fast' (the pre-4.2 pacing)
setFights('original')  getFights()  modFights() // his areas as he wrote them, or 'scaled'

// balance, for measuring
modBalance()  setEnemyScale({kill: 8, die: 20})  getEnemyScale()  setHpTrack(0.92)

// folding, saves, documents
modFold(section)  modUnfold(section)
modSaves()  modSwitchSave(n)  modNewSave(n)  modDeleteSave(n)
modBackups()  modBackupNow()  modRestoreBackup(n)  modDownloadBackup(n)
modBaseFixes()   // the three corrections to the author's code, at your levels
modWiki()  modChangelog()  modGameChangelog()
modUnlockAll()   // grant every added action now, skipping its requirement
```

## What the mod does now

### Pacing, measured against the original

`tests/vanilla.mjs` loads the game twice — once with `mod.js` blocked, which is
the author's game exactly — and runs the same measurements on both.

- **Skill exp costs exactly what the original charges below level 10**, checked
  against the author's own `expnext` rather than a copy of it. His 22 perk
  ladders all end between level 1 and 15, so that is the range he designed.
  From level 10 the cost rises about 2.9% a level, at a ratio solved so that
  0 → 110 takes the same time it always has. His own curve cannot be kept past
  that: 109 → 110 costs ~1.2 × 10¹⁴ xp.
- **Skill exp multiplier 1 and enemy coin drops off by default** — the
  original's values. Both are settings boxes, and a value set there persists.
- **Character level** uses the game's own curve, untouched.
- **Story caps** 10 / 15 / 20 / 30 / 40 / 50 / 60 / 75 / 90 / 110, each opened
  by a story beat.
- A **Pacing** setting puts back the pre-4.2 pacing exactly, for anyone who
  preferred it: `50 × 1.106^level`, skill exp 2×, a 15% coin drop, scaled fights.
- **Fights in the author's areas are his**, spawn for spawn, by default (v4.6):
  see Combat.

### Combat

- **A Fights setting (v4.6).** On *Original*, the default, every area the author
  wrote spawns his creatures exactly as his page does — `tests/fights.mjs`
  compares all 70 — with his level ranges and his 6% Raw Meat, so you out-grow
  them as in his game. On *Scaled*, and always in the mod's own areas and rank
  duels, the model below applies.
- **Scaled: every spawn is solved against the player's measured power** — about 8
  swings to kill and 20 to die, with spread from the area's level band and the
  creature's own shape, and a margin that guarantees `kill < die`. Measured
  through the real `dmg_calc`, stratified on the crit roll, and topped up when a
  sample happens to roll no crit. Across the three matchups measured at 1,000
  spawns each, 98% landed within 4% of their target.
- That is longer than the original's early game, where you out-level fixed
  creatures and most forest fights take one swing. The model exists to remove
  out-levelling; `tests/vanilla.mjs` prints the gap.
- **Elemental techniques** proc on your swings once your channels are open.

### Places

- **The Sunken Hollow, the Ashen Spire and the Long Vigil**, past the base
  game's last area, opening in order after golem arena IV.
- **The catacombs** (the author's 26 rooms, given an entrance), **the Pill
  Tower**, **the Hall of the First Gate** (the rank ladder), **the Diggings**
  (four crafting nodes), **the Slip Archive** (on the dojo lobby) and **the Damp
  cellar** (Notice #1 on the Message Board — the author's area, given weights,
  a way in and a way out).

### Skills

- Around a hundred skills: the base game's, plus the mod's — Qi Circulation,
  Wildcraft, Calligraphy and Conditioning; the discovered skills; ten section
  parents; six elemental masteries; Renown; and ten converged skills.
- **Perks at 10/25/50/60/75/90/110 on every skill**, and a live tooltip on each
  saying what it currently does.
- **Rarity** — ten grades, Novice to Transcendent — derived from the level you
  have taken a skill to. Coloured in the list, named in the tooltip, sortable
  and filterable.
- **Folding**: a Jade Slip folds a skill into its section. Fold a whole section
  and it is one line. Folded skills keep every level, perk and buff; a fully
  folded section is worth ×1.03 on every stat, ×1.34 with all ten.
- **Five added actions**, each earned: Endurance Drill (Toughness 4), Forage
  (Harvesting 4), Practice Calligraphy (Literacy 8), Circulate Qi (the dojo's
  three tutorial fights) and Closed Door Training (your first bottleneck).
  Running several at once is an opt-in setting.

### Cultivation

- **Ten realms above Mortal**, Qi Refining to Tribulation Transcendence, on the
  same level thresholds as title ranks. Up to ×6 on every stat and ×8.5 on the
  body.
- **The road between them**: a Spiritual Root rolled once; nine layers to every
  realm; insight earned by meditating, by fights you nearly lost and by going
  somewhere new; Closed Door Training, which consolidates and shelters a
  breakthrough; Qi Deviation for failing in the open; a Heavenly Tribulation
  for the top three realms. Modelled on Wuxiaworld's general glossary of the
  genre's terms.
- **Each wall is sized to the climb to it** (v4.6): about 5% of the Circulate Qi
  time it took — 60 insight at realm 3, 1,580 at realm 10 — earned only at the
  wall, three times faster in seclusion.
- Every breakthrough pill has a source: the instructor, the Herbalist, the
  dojo's Level Advancement rungs to 110, the Pill Tower.
- **Your realm is on the rank line**, and at a bottleneck it is the
  breakthrough button.

### Titles and rank

- Title ranks 1–10 derived from the level that earns them; five titles per
  skill; the worn title applies, and Renown makes lower ranks passive. The
  picker and the wiki group titles by skill and into ladders.
- Four of the author's unfinished titles finished from the intent in his code.
- **The rank ladder**: ten challengers, beaten in order; the rank you hold
  floors the Power rank under your portrait without capping it.

### Crafting and money

- **Crafting to five stars**: twenty items and twelve materials on four rungs,
  each consuming the one below.
- **Selling** at 25% of value, with key items — anything that is the only way
  to unlock something — protected. The marketplace cannot be locked out.
- Raw meat drops at the author's 6% on Original fights and 18% on Scaled, so
  the hunter's quest is feasible in every season either way.
- **Every price the ladder requires is checked against income** (v4.6): no more
  than 10% of the climb it gates, in hours of the best income open at that point
  with no coin drop. The Pill Tower's top three pills were cut to pass.

### Three corrections to the author's code

- **Death** now reduces energy lost on death, as its text says — it used to
  take all of it by level 10 and go negative after.
- **Shield Mastery** can no longer turn your defence into extra damage taken.
- **Luck** reaches the crit roll, as the author wrote it to, up to 50% from luck.

### On the screen

- **Number formats**: Short (4.56M), Scientific, Myriads (5.6亿) or as the
  original. Up to 9,999 every format prints exactly what the original prints.
- **A wiki** of fifteen pages, generated from the live game data every time it
  opens and reading your save — including a Skill handbook and a What next page.
- The skill panel groups, collapses, hides maxed skills, and no longer rebuilds
  itself every second.
- Three save slots, **backed up automatically before a new version loads and
  once a day** — restorable from the saves panel, and downloadable as a file so a
  save survives clearing the browser — a labelled changelog
  button, and settings for skill exp, game speed, coin drops, number format,
  pacing and fights.
- **A userscript** (v4.6) runs the whole mod on the author's hosted game, with no
  local copy.

### Tests

Forty Playwright scripts drive a real browser at a real copy of the game,
four at a time, in about 75 seconds — and on GitHub for every push and
pull request, beside a check that the author's two files are still his.
The numbers that define the balance are committed in
`tests/baselines/balance.json`, so any change to them is a diff.
The broadest, `allareas`, fights every creature in every area at both ends of
its level band, at ten story tiers, in four skill builds — 3,720 matchups, all
of which must be winnable. See `tests/README.md`.

---

# The design record

What follows is in the order it was built.

## The first version

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

> **Since v4.2:** the multiplier ships at **1**, the original's value. The
> wrapper and the settings box are unchanged. See "Measured against the
> original game".

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

> **Since v3.x:** the mod's "Foraging" (`skl.frg`) is named **Wildcraft** — the
> base game already had a Foraging. See "Two names for one skill". The actions
> are now earned rather than granted; see "The added actions are earned now"
> and "Circulate Qi comes from the dojo".

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

> **Since v3.x:** "Foraging" in this table is the mod's `skl.frg`, now named
> **Wildcraft** — see "Two names for one skill".

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

> **Fixed in v4.5**, and worse than this said: from level 11 the multiplier goes
> below zero and so does your energy. See "Three bugs in the author's code".

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

> **Since v4.2:** the chance ships at **0**, the original's value — the author only
> turns the drop on through the Coin Ring and the Ring of Greed, and a 15% base
> made both of them rounding errors. The delta tracking and the settings box are
> unchanged. See "Measured against the original game".

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

> **Since v4.2:** the curve is the author's own formula below level 10, then a
> ratio (~1.029) solved so 0 → 110 takes the same time as this one did at its 2x
> multiplier. The cap-60-in-an-hour shape described above is gone — the time is
> spread evenly. `setXpCurve({vanillaTo: n})` replaces `setXpCurve(ratio, base)`.
> See "Measured against the original game".

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

## Two places, both of which the game was already pointing at

The mod had spent a lot of sections adding systems and none adding world. These
are the two places the game itself had already gestured at.

### The catacombs, finished and unreachable

26 locations exist, fully written, with their own ambient text table and a
bestiary entry for the ghouls that says they live there. `grep catamn` returns
three hits: its definition, its own handler, and one `smove(chss.catamn)` from
*inside* `cata1` going back. Nothing links in. Its own exit leads to the Village
Center, which is where the entrance was always meant to be.

So the entrance is one `chs()` there — the same trick the Old Path trailhead
uses. **Not a word of the content is the mod's**; the entrance is the whole
change, and `tests/places.mjs` asserts that (`mod_cata*` keys: zero).

It has to be gated, and not for flavour. Visiting sets `mod_t_cata`, which is
the cap-40 rung in `MOD_TIERS` — the rung that has been dead all along precisely
because nothing could reach it. An open door would hand a fresh character cap 40
straight out of the tutorial, past the forest's 20 and the deep forest's 30.
Gated on `mod_t_deep`, the rung below it, so the ladder keeps its order:

    forest 20  ->  deep forest 30  ->  catacombs 40  ->  golem arena 50

That is the general rule for any new area that sets a tier flag, and it is now
in CLAUDE.md.

### The Pill Tower, which the author started

On the Village Center, in the author's own file:

```js
//  chs('"=> Visit Pill Tower"',false).addEventListener('click',()=>{
//    smove(chss.pltwr1);
//  });
```

The choice was written and commented away; `chss.pltwr1` was never built. An
alchemists' tower is exactly what a cultivation game wants and exactly what this
mod was missing, so this builds it rather than inventing a different shopfront —
completing their intention instead of imposing mine.

It is `chss.mod_pltwr`, **not** `chss.pltwr1`: if the author ever finishes
theirs, the two must not collide. The test checks `chss.pltwr1` is still
undefined.

It carries its own vendor with the grades a village herbalist cannot source
(realms 6-10, plus the Sublime and Transcendent Spirit Pills), and a spirit
vein you can sit in once a day for Qi Circulation exp that scales with your
realm — somewhere for cultivation to *go*, which the ladder otherwise entirely
lacked. Gated on having a realm at all: they do not let mortals past the door,
which is the genre's own snobbery and gives the realm ladder a presence in the
world rather than only on the character sheet.

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

> **Since v4.3:** 31 areas and a fourth build with every section folded —
> **3,720 matchups**.

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

## Titles: rank, coverage, and finally an effect

Three problems, all confirmed by measurement before touching anything.

**Rank meant nothing.** `rar` ran 0-5 and was assigned by feel, so the game gave
out rank 3 titles at skill level 8: Runner at Walking 10, Rookie at Fighting 15,
Dissector at Disassembly 8. Eight of them, all early.

**There were too few.** 120 titles across 93 skills, and 73 of those come from
story events rather than skills, so most skills granted none at all.

**They did almost nothing.** Four titles in the whole game carry a `talent`.
The rest are flavour: the "SELECT YOUR TITLE" window sets `you.title`, which is
the name printed beside your level and nothing else.

### Rank is derived now

| rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| level | 1 | 8 | 18 | 30 | 45 | 58 | 70 | 82 | 90 | 110 |

For the 47 titles a skill milestone grants, the level is read out of the
milestone itself — `f.toString()` is scanned for a `giveTitle` call — so this
stays correct if a grant ever moves. The other 73 come from story events with no
level to read, so the author's 0-5 is stretched over the ranks the skill rungs
leave free (1, 2, 4, 6, 8). Nothing story-granted reaches 9 or 10, which is the
point: those two mean level 90 and level 110 and nothing else.

### Five per skill

Every skill grants a title at 25, 50, 75, 90 and 110 — ranks 3, 5, 7, 9, 10 —
levels every skill has milestones for after section 22. 465 new titles, pool
120 → 585, and all ten ranks populated.

The grant is folded into the milestone already at that level rather than added
beside it: two milestones at one level would be a duplicate the save cannot tell
apart by index, and `tests/audit.mjs` rejects it.

Names are formulaic — a noun chosen by skill type, then the skill: *Veteran of
Fighting*, *Bastion of Cold Resistance*, *Grandmaster of Cooking*. With 465
generated, legible and consistent beats individually crafted. They are nouns
specifically because the form is "X of Y" and an adjective reads as a mistake;
the first draft produced "Peerless of Fighting".

### What they do, and what wearing one is for

Each raises its own skill's exp rate — 5% at rank 3 up to 30% at rank 10 — in
the spirit of the few the base game bothered to give a talent.

That is `skl.<x>.p`, and it is emphatically **not** set from milestone code:
skill xp multipliers are restored from the save *after* milestones fire, so the
write would be lost on the very load that granted it. It is reconciled on the
tick against a record in `global.flags`, the same shape as section 13's handling
of `you.res`. `tests/titles.mjs` checks it against stacking over thirty ticks
and across a reload, which is the failure mode that pattern exists to prevent.

**Base-game talents were already permanent** — `giveTitle` fires `talent()` once
and sets `tget`; they never needed selecting, and clicking a title only ever
changed the displayed name. These new bonuses are the opposite by default: only
the title you are *wearing* applies, which gives the selection window a reason
to exist for the first time.

Renown then buys that away. At renown level N every title of rank N or lower
applies permanently, worn or not, so renown 10 makes the whole collection
passive. The worn title always applies whatever its rank. Renown's own
thresholds were rescaled to the larger pool — level 10 wants 550 titles rather
than 100 — so it is a real collection project rather than something finished
early, and it is now load-bearing rather than decorative.

## Cultivation, and elements you can actually use

proto23 is already a cultivation game in its furniture — Qi Circulation, spirit
pills "made from condensed Ki", a dojo, meridians in the skill text — without
the thing the genre is actually about: a realm you advance through, a wall that
stops you, and a breakthrough that costs something.

### The ladder is a genre convention, not a borrowing

Qi Refining → Foundation Establishment → Core Formation → Nascent Soul → Spirit
Severing → Soul Transformation → Void Refinement → Body Integration → Great
Ascension → Tribulation Transcendence. That ladder, the dantian, meridians,
bottlenecks and tribulations are shared across hundreds of works and belong to
no one; they are
what makes a thing read as xianxia. Nothing here is lifted from any particular
novel — no names, no settings, no text — which is both the legal answer and the
right one, since borrowed specifics would sit badly against proto23's own world.

### Scaled off the title ranks, not restated

The ten realms sit on `MOD_RANK_AT` — the same thresholds section 24 derives
title ranks from — and are **derived from it rather than listed again**. Realm 3
is exactly the Qi Circulation level that earns a rank 3 title, and each realm's
own title falls out at its own rank without being told to. Retune the rank
thresholds and the realms follow; there is no second copy to forget.

`tests/cultivation.mjs` asserts that alignment directly (`r.qic ===
MOD_RANK_AT[r.n-1]`, `MOD_rankForLevel(r.qic) === r.n`, and the realm title's
own `rar`), which is what stops the two ladders drifting the next time either is
touched. The test's other assertions read the thresholds out of `MOD_REALMS`
too — the first version hardcoded "realm 1 needs Qi 10" and broke the moment the
ladder was rescaled, which is the same staleness in miniature.

### Where the pills come from, and the hole where that used to be

The realm system shipped with **no way to obtain a single breakthrough pill.**
All ten existed as items; nothing gave, dropped or sold them. The whole ladder —
the thing sections 28 and 29 both hang off — was reachable only from the
console.

`tests/cultivation.mjs` passed throughout, because it called `MOD_breakthrough`
directly with `{ amount: 1 }` as the pill. It tested the mechanism and never
asked where the input came from. That is the specific blind spot of a test that
supplies its own inputs, and the fix is a test that asks the world instead: it
now walks the Herbalist's stock list, the dojo's rungs and the Qi-unlock path,
and fails if any realm's pill is orphaned.

Three sources, matching how far along the realm is:

| realm | source |
|---|---|
| 1 | the instructor, when the dojo finishes teaching you |
| 2-5 | the Herbalist, 900 to 38,000 copper |
| 6-10 | the dojo's Level Advancement rungs at 45, 60, 75, 90, 105 |

The Herbalist rather than a new alchemist shopfront: it is already the
marketplace's plants-and-medicine vendor, already stocks `sp1`/`sp2`/`sp3`, and
xianxia alchemy is herbalism with qi. Appending to `vendor.pha1.items` uses the
game's own restock and purchase machinery, so there is no second screen to keep
in step.

Realm 1 is deliberately **not** from the Herbalist. The marketplace is gated
behind reading a flyer the Paper Boy hands you at 40% per Village Center visit,
and only after `dj1end` — while realm 1 opens at Qi Circulation 1. Sourcing the
first pill there would have put the entire ladder behind a random encounter.

Save-safe by inspection: vendor stock is stored by item id and restored by
scanning `itemgroup[(id+1)/10000|0]`, which for the 912x ids is `item`, where
these are defined. Verified end to end — the pill appears in real restocked
stock, survives the round trip, and advances the realm when used.

### The bottleneck is the whole point

Reaching the Qi Circulation level does **not** advance the realm. It puts you at
a wall, and breaking through costs a pill you had to find or buy. A realm you
get for free is just a second name for a level.

The attempt can fail, and failure spends the pill anyway. Odds start at 55% at
the threshold and improve 5% per level trained past it, capping at 95% — the
genre's "consolidate before you push" advice, made mechanical. A failure drops
you to 1 HP but never kills: the game has a real death system
(`global.stat.deadt`, the `ndthextr` title) and a breakthrough should not
interact with it silently.

Each realm multiplies every stat and widens the body, up to ×6 at Ascendant.
The numbers are deliberately large, and safe to make large because section 8's
enemy model measures the player rather than assuming a curve — a jump is
absorbed as tougher enemies rather than as a broken game.

> **Correction:** the ×6 realm is realm 10, **Tribulation Transcendence** — there
> is no "Ascendant". **Since v4.0** the body half of that multiplier actually
> holds; before, it was undone by the next `stat_r` — see "A realm's body
> multiplier did nothing". The road between realms is in "The cultivator's road".

The bonus is applied **in `allbuff`**, never written into `you.stra` and
friends, so it cannot compound across loads. `tests/cultivation.mjs` runs twenty
consecutive `allbuff` calls and checks the number does not move.

### Elements you can use

The six Absorption skills were purely defensive — trained by being hit by an
element, reducing what it does to you, with no way to use one. Six Mastery
skills pair with them.

Combat is automatic (`fght` calls `battle_ai`; there is no per-turn ability
picker to hang a spell button on), so a technique is a **proc**: `you.battle_ai`
is wrapped and each swing has a chance to come out as a technique instead of a
weapon blow, at `0.006 × mastery level + 0.02 × realm`, capped at 45% so a
weapon never becomes decoration.

The technique is an `Ability` with `stt: 2` and `aff` set to its element, which
routes it through the **INT branch** of `dmg_calc` — scaling with INT, with
`you.aff[element]`, and against the target's elemental defence rather than with
STR and a weapon. A genuinely different attack, not a reskinned one.

Nothing fires at Mortal. You cannot throw fire before your channels are open,
which is the genre's rule and also a reason for the realm to matter in combat
rather than only on the character sheet.

Two things worth keeping: the wrapped `battle_ai` swallows any error from the
proc and falls through to the ordinary attack, so a bug there can never cost you
a swing (the test forces `MOD_pickTechnique` to throw and checks all 20 swings
still land). And the six skills had to be **registered with the maps sections 10
and 11 built before they existed** — `MOD_KEY_BY_ID` for the cap system,
`MOD_PARENT_OF` for the panel grouping. `rnwn` needed the same in section 17.
A skill created late is invisible to those maps, and nothing complains.

## The dojo's Level Advancement, carried to 110

The dojo already has a reward ladder and the instructor already promises it
continues — *"After every 5 levels you reach, come here and receive your
share!"* — and then it stops at level 30:

| flag | level | reward |
|---|---|---|
| dj1rw1 | 5 | 25 coin, Low-grade Spirit Pill ×5 |
| dj1rw2 | 10 | 100 coin, Mid-grade ×2 |
| dj1rw3 | 15 | 200 coin, High-grade ×1, gear |
| dj1rw4 | 20 | 300 coin, a weapon |
| dj1rw5 | 25 | 350 coin, an accessory |
| dj1rw6 | 30 | 400 coin, food |

Character level at the mod's endgame is around 92, so the promise went unkept
for the last eighty levels. Sixteen more rungs finish it, 35 through 110 in
fives, sequential the way the base six are.

**The pills had to be rebuilt first.** Character exp per level is
`4*lvl^3 + lvl^2` — 5,336,100 for one level at 110, against a best-in-game pill
worth 15,000. The ladder would have been handing out rounding errors (0.3% of a
level). Four grades continue the author's own progression at roughly his ratio:
Superior 100,000, Refined 600,000, Sublime 3,500,000, Transcendent 20,000,000 —
the last worth 3.7 levels at 110, the first not even a fifth of one at 50.

**A third grade of skillbook** at +30%, offered as a *choice* at the 50, 75 and
100 rungs — the same shape as the one the instructor gives the first time you
clear the dummies, which is the moment the request pointed at. Named in the
author's register (Sword Saint, Nightblade, Headsman, Dragoon, Earthbreaker,
Iron Body) rather than "Master Skillbook (Swords)", because the grade below is
already called "Bladesman Manual".

These write `skl.<x>.p += rate` exactly as the base books do, which coexists
with section 24's title bonuses because that reconciler only ever adds and
removes its own tracked delta, never assigns.

### What the first draft got wrong

I built a ladder of new golem trials before reading far enough into
`chss.t3.sl`, and only found "Level Advancement" — and the second grade of
skillbook that already existed — when a probe printed a lobby screen full of
manuals I had not written. The trials were thrown away. The lesson is the same
one the catacombs and the dead affinities taught: **read the whole handler
before adding a parallel one.** This game hides finished systems inside long
`else` chains.

The continuation is its own lobby entry rather than an extension of the
original's screen, because the base rungs are drawn by an anonymous click
handler created inside `sl()` — there is no way to append to that without
replacing the whole function. It appears only once `dj1rw6` is set, so the two
never show at once.

## Title colours, and a base-game crash the new ranks woke up

The game already colours a title by rank, in the type 5 branch of `dscr()`:
grey 0, cyan 2, lime 3, yellow 4, orange 5, purple 6. Two problems, neither of
which could show up until section 24 started using the upper ranks.

**Rank 7 threw.** Its branch sets `this.dl.style` where every other branch sets
`this.label.style`. `this.dl` is assigned in the type 6 and 7 branches of the
same function, so in a type 5 call it is undefined, and the tooltip dies
half-built — the name placed, the description never. The base game topped out at
rank 5, so the branch had never once run in the game's life. There are now 93
titles at rank 7.

**Ranks 1, 8, 9 and 10 had no branch**, so 220 titles rendered with no colour at
all, including every rank 10.

Rather than patch a switch inside a 200-line function that builds six different
tooltip layouts, the title's rank is parked at 1 for the duration of the call —
a value the switch has no branch for, and so cannot throw on — and the label is
coloured afterwards from a full ten-rank table. The author's five colours are
kept exactly where they were; the ramp only extends past where they stopped.
The tooltip also states the rank and the level it was earned at, which is worth
saying now that rank means a level rather than a mood.

The picker rows use the same table, which is the point of having it: with five
titles per skill, rank is the thing you are reading. That took the colour slot
away from marking which title is worn, so worn is now weight plus a background
tint — not a glyph, because the caret already owns the one that would read best
and two triangles in one column are unreadable. `tests/titlepicker.mjs` caught
that collision on the first run.

## The title picker, grouped by skill

585 titles in a 300px column is a scroll of hundreds of near-identical rows,
most superseded by the one below them. Titles from one skill now collapse to a
single row showing the best held, with a caret to open the rest; story titles
have no skill to group under and stay as plain rows below.

The hook is worth recording. The game's picker is built by an anonymous listener
on `dom.d3`, so it cannot be removed, and cloning the node — the trick used for
`sl_kill` and the version number — would drop `dom.d3.update` and the `addDesc`
tooltip the game attached to it. So this adds a **second** listener instead:
listeners fire in the order they were added, so the game builds `dom.ttlbd` and
this rebuilds its contents immediately after, before a frame is drawn.

Grouping needs to know which skill a title belongs to. The 465 generated ones
say so themselves. For the base game's, the milestone that grants the title is
found by scanning `f` source for a `giveTitle` call — the same trick section 24
uses to date them — so Civilian, Trained Civilian, Fighter and Rookie group
under Fighting alongside the generated five rather than being stranded in the
loose list.

## Perks for the top half of the ladder

Section 19 made level 110 reachable. Nothing was waiting up there. Measured
across all 94 skills:

| | skills |
|---|---|
| no milestones at all | 25 |
| nothing past level 10 | 12 |
| nothing past level 50 (the mod's own tiers stop there) | 44 |
| something past 50 | 13, and only 10 go past 60 |

**81 of 94 skills gave nothing between level 51 and 110** — the entire top half
of a ladder the seventh pass had just spent its effort making real.

One rule, applied everywhere: every skill gets the rungs it does not already
have, from `10, 25, 50, 60, 75, 90, 110`, appended at every level strictly above
its current highest milestone. Uniform, no per-skill list, and always ascending
— which the save format requires, since "granted" flags are keyed by array index
and `tests/audit.mjs` fails on a broken order. A skill topping out at 50 gains
four perks, one already at 75 gains two, one with none gains all seven. 447
perks across 93 skills; Renown is skipped, being driven by titles rather than
levels.

The rungs are the cap ladder's own, so reaching a new story cap and pushing a
skill into it pay off together.

What each perk *does* comes from the skill's type, so the reward is relevant
rather than uniform: resistances reduce their own damage type through
`you.res`, absorptions raise their own element's defence through `you.caff`,
combat gives STR and critical damage, mental gives INT and EXP, gathering gives
energy, and so on. Harvesting needed a special case — the base game types it 0
where every other gathering skill is 8.

Two things deliberately avoided.

**`skl.<x>.p` is never touched.** Skill xp multipliers are restored from the
save *after* milestones fire (`load()` handles them at the line following the
milestone replay), so a newly added perk raising one would have its work
overwritten on the very load that first granted it — and `g` would be true
forever after, so it would never fire again. Stats are restored *before*
milestones, which is why everything else here is safe. This is the hazard
CLAUDE.md warns about, met in practice for the first time.

**Absorption perks use `you.caff`, not `you.res`.** Section 13 already drives
four of those skills continuously off `you.res`, reconciled through
`global.flags.mod_aff`; a milestone writing to the same table would fight that
reconciliation every load.

`tests/perkcoverage.mjs` guards the result: nothing without perks, nothing
topping out below the highest cap, ascending everywhere, no blank text, no gap
over 40 levels. The audit went from 478 perks to 932, all passing.

### Two things the balance suite caught afterwards

**Critical damage had to be pulled back to a quarter.** `you.mods.cpwr` is
shared by all 13 combat skills and compounds across all seven rungs, so giving
it the same multiplier as everything else took it from 1.2 to **13.0** by cap
110 — a crit worth 23x a normal swing, landing a fifth of the time, with a mean
five times the median. That is a coin flip dressed as a build. At a quarter the
multiplier it sits at 6.7, a crit is 12x, and the strength side carries the
growth instead.

**The balance harnesses needed the same estimator the mod uses.** Three of 2,490
matchups failed with the by-now familiar signature — `die` exact to the unit,
`kill` about twice its target — because `allareas`, `combat` and `earlybal` were
still taking a plain sample mean of a distribution whose tail had just got
heavier. They now stratify on the crit roll the same way `MOD_meanDamage` does,
written out in each rather than calling the mod's copy, so the test is not
merely agreeing with itself. Six clean runs of all 2,490 afterwards.

**And `savecompat` was asserting the wrong invariant.** It compared `mrtl`'s
milestone flags against a hardcoded seven-element array, so it failed the moment
the ladder legitimately appended two more. What matters is that saved flags
restore into the slots they were saved from and that appended perks sit after
them, ungranted unless the level already earns them — which is what it checks
now, and what will survive the next perk added.

## A hundred Fire Masteries

Reported as "why do i have like 100 fire mastery skills and companion
discipline", and the two skills named were the whole diagnosis:

```
skl.par_10   "Companions Discipline"   id 2000 + 10   (section 11)
skl.mod_fire "Fire Mastery"            id 2010 +  0   (section 29)
```

Both 2010. Two numbering schemes, each sensible alone, that met at exactly one
value.

An id is the save's key for a skill, and the game's loader matches on it in a
loop with **no `break`**:

```js
for (let a in a6) for (let b in skl) if (a6[a].id === skl[b].id) {
  you.skls.push(skl[b]); ...
}
```

So one shared id pushes *both* skills for *both* saved entries. The next save
writes all four. Measured over four cycles:

| save/load | Fire Mastery rows | Companions rows | sheet |
|---|---|---|---|
| 1 | 2 | 2 | 14 |
| 2 | 4 | 4 | 18 |
| 3 | 8 | 8 | 26 |
| 4 | 16 | 16 | 42 |

It doubles. Seven cycles is 128 of each, which is what the player saw.

`MOD_KEY_BY_ID` is id-keyed too, so `MOD_KEY_BY_ID[2010]` resolved to
`mod_fire` and the Companions parent had quietly lost its level cap as well.

**Only Fire Mastery moved** — 2010 to 2016. Water through dark keep 2011-2015,
the ids they were saved under, so nobody loses those levels; the Companions
parent gets 2010 and its cap back; and the one genuinely ambiguous value goes
to the skill that claimed it first. The six are now an explicit table rather
than `2010 + i`, because arithmetic is what made two schemes collide.

### Fixing the id only stops it getting worse

The duplicates are *in* the save. `a6` still holds a hundred entries, so they
come back on every load until something removes them. `MOD_dedupeSkills`
(section 33) prunes `you.skls` by object identity after load and redraws the
panel. A deliberately damaged save — 138 rows — comes back as 12 through a real
page reload, with every level intact.

Not limited to the two skills that collided. It repairs the damage rather than
the cause, and it is worth keeping: the panel's per-second updater reads fixed
child indices against `you.skls`, so a duplicated row is not merely cosmetic.

### The same mistake, already made twice more

Scanning every namespace for duplicates turned up one more of the mod's own:
`chss.mod_hollow` and `chss.mod_pltwr` both had location id **976**, from MOD
2.9. `global.lst_loc` is restored by the same kind of break-less scan, so both
locations would have drawn. The tower is 980 now.

(`chss.tst` and `chss.tstauto` share `id -1`. That is the author's marker on two
unreachable dev stubs, nothing dispatches to it, and it is not the mod's to
change — so the test skips it explicitly rather than silently.)

`tests/ids.mjs` now checks all fourteen namespaces. Nothing checked before,
which is why it shipped.

## Getting into the marketplace

Reported as "make it so that i can enter the marketplace bc right now it seems
like i cant". It was unreachable, and the mod is what made it so.

The base game's chain: finish at the dojo (`dj1end`), then a Paper Boy turns up
at the village center at 40% a visit and hands you a `"Pamphlet"`, then you read
it for three hours and `mkplc1u` opens the door. Two things about that chain
matter:

* **Exactly one item in the game sets `mkplc1u`.** There is no second route.
* **`pmfspmkm1` is set when the Pamphlet is *given*, not when it is read**, and
  it retires the Paper Boy permanently.

Section 15 added selling. Nothing marked the Pamphlet a key item, so it could be
sold at the food stand — outside the marketplace, before ever being read — and
that takes the marketplace, the Grocery, the General Store, the Herbalist, the
guard-duty quest and, because the Herbalist stocks the realm 2-5 breakthrough
pills, most of the cultivation ladder. Permanently. Reproduced in a test before
touching anything: sell it, then 500 village-center visits with no Paper Boy and
no door.

### Key items, derived rather than listed

The game is one inline `<script>`, so its own source is readable at runtime
through `document.scripts`. That makes the rule exact instead of a list someone
has to maintain:

> A flag the game never sets back to `false` is a one-way unlock. An item whose
> `use` or `onGet` sets one is the only copy of something.

Six items qualify — the Pamphlet, the Woven Wallet, the Bestiary, the Rotten
Illustration, the Property Deed and the Empty Journal. A Smoke Bomb sets
`smkactv`, which the game *does* clear, so it is transient state rather than a
key and stays sellable. That distinction is the reason for deriving it: a
blanket "sets a flag" rule would have wrongly protected the bomb.

### Getting an already-stuck save out

The author's condition is `pmfspmkm1 !== true` — "have you ever been handed
one" — so once you have, he is finished with you whatever became of it. The
condition that matches the intent is "do you have one", and the outer
`!mkplc1u` already covers having read it.

Drawn from the wrapper, and deliberately only in the case the original has given
up on (`pmfspmkm1` already true), so the two can never both fire and a fresh
character still meets him exactly once through the author's own code.

### An invisible gate is what caused the report

"It seems like I can't" is the real bug. The village center simply omitted the
line, with nothing to say the marketplace existed or what would open it. It now
says which of the three things is missing, with the sentence in a tooltip. The
Herbalist inside gets the same treatment — it is behind Yamato's delivery job, a
real quest, but an unlisted one, and it is where the mod sells realm 2-5 pills.

Two layout constraints found while doing it:

* **`.chs` is `height:22px` with no overflow rule.** A choice that wraps does not
  make its row taller; it spills into the next one and off the bottom of the
  panel. The first draft's 87-character hint did exactly that. Every added line
  is now under 50 characters and the test measures `scrollHeight` to prove it.
* **`chs()` appends**, so a wrapper's line lands under the location's `"<=
  Return"`. All 85 of the game's back-choices start with `"<=`, so
  `MOD_chsAboveBack()` puts the line above the first of them, and falls back to
  appending where a location has none (the village center is a hub).

## A wiki, generated rather than written

Section 31. A `wiki` button on the bottom bar and a "Game wiki" row in
settings, both opening an eleven-page reference in a tab of its own.

The whole design is one decision: **it is generated from the live game data
every time it is opened.** A hand-written wiki for 100 skills, 595 titles, 371
items and 19 areas would be wrong within a week, and wrong in the worst way — a
reference nobody can trust is worse than no reference. Reading `skl`, `item`,
`area`, `ttl`, `act` and the mod's own tables means the page cannot disagree
with the game, including changes made from the console mid-session.

It also reads the **save**, so it doubles as a progress sheet: your level in
every skill, which perks you have taken, which titles you hold, your realm and
what the next one costs. Everything you have not reached is still listed. It is
a wiki, not a fog-of-war map.

Two things it deliberately does not do:

* **It does not open inside the game.** The panel is a fixed layout with a fixed
  bottom bar; a reference wants a sidebar and a wide table.
* **It does not fetch anything.** The document is a string written into the new
  window, so it works from `file://`, from a subdirectory and from a server root
  alike — the same reason `MOD_url` exists for the changelog.

`modWiki()` returns the HTML as well as opening it, so the tests can assert on
the document without driving a popup.

### Collapsing was not a nicety

The first build listed everything flat. Measured, three of the eleven pages
were over 40,000 pixels tall — Items 53,723, Titles 46,890, Skills 40,538. That
is a hundred screens of scrolling, which is functionally the same as not having
the content. Groups became `<details>`, collapsed by default:

| page | flat | collapsed |
|---|---|---|
| Items | 53,723px | 495px |
| Titles | 46,890px | 5,826px |
| Skills | 40,538px | 591px |

Skills now opens as its ten sections on one screen. `<details>` rather than a
click handler because it works with JavaScript off, it is keyboard-reachable for
free, and the browser can be asked to reach inside it.

Two consequences that had to be handled:

* **Search must open the groups it matches inside.** A match hidden in a
  collapsed group reads as no match at all, which is worse than having no
  search.
* **A group can still be a wall.** 321 of the game's 371 plain items share one
  inventory type, so grouping by type alone left a group of 321. Anything past
  `MOD_WIKI_ALPHA_AT` gets an alphabetical sub-split, and the story titles — the
  one title group with no skill to divide them — split by rank instead, since
  that is the axis they are already sorted on. The test asserts no group holds
  more than 60 entries, and it caught the story-titles group at 83 after I had
  already fixed Items.

The item groups use the game's **own** inventory tabs (`isort`: ALL/WPN/EQP/USE/
OTHER) rather than new categories, so a group here is a tab there. Names are
filed under their first *alphanumeric* character — several items are literally
quoted, the master's manuals among them, and filing `"Sword Saint Manual"` under
a quotation mark helps nobody.

### Generating it surfaced two things writing it would not have

**Spawn chances were not what `pop[i].c` says.** The first draft printed those
weights as percentages. They are not percentages: `z_bake` normalises them into
`area.popc`, a list of `[lo,hi]` bands that `mon_gen` rolls a uniform random
against, and the weights do not have to sum to 1. The Southern forest's
`.35/.45/.25` sum to 1.05 and are really 33/43/24%. The wiki reads the bands.

**Nothing can ever spawn in the Damp cellar.** Its two `pop` entries carry no
`c` at all, so `z_bake` computes `1 - NaN` and both bands come out `[NaN, NaN]`.
Every comparison in the spawn loop is then false, so no creature can be chosen —
and the area has `size: 33`, meaning a quest that needs 33 kills there could
never finish. Nothing in the game travels to `area.clg` either; like
`chss.pltwr1`, it is an unfinished idea of the author's.

Left as it is and **reported in the wiki** rather than quietly fixed. The mod's
job here is to describe the game, and an area you cannot fight in is a fact
about the game worth stating. The flag is derived from the bands, not hard-coded
against the key, so it stays true if the data changes.

Two areas are excluded outright, on the test of whether you can get to them:
`area.nwh` ("Somewhere") is where `current_z` parks whenever you are *not* in a
fight — `mon_gen` skips it explicitly with `area.id !== 101` — and `area.tst`
("Test") is reached only from `chss.tst`, which has `id -1` and is in no sector.
Those are machinery. `area.clg` is content, so it is listed with its flag.

> **Since v4.3:** the Damp cellar is fixed — weights, an entrance (Notice #1 on the
> Message Board) and a real exit; its original exit led to screens that do not
> exist. The flag stays, derived from the bands, and `tests/wiki.mjs` strips a
> live area's weights to prove it still fires. See "Small fixes (v4.3)".

### Tested

`tests/wiki.mjs`, 57 checks. The coverage assertions **count from the game**
rather than from a written list: every skill in `skl`, every area in `area`,
every item in `item`, `wpn`, `eqp`, `sld` and `acc`, every title in `ttl`, every
action, realm, technique, manual and pill, and all 974 perk lines. Adding a
skill without adding it to the wiki therefore fails the suite on its own, which
is the property that makes generating it worth more than writing it.

The built document is then parsed in a real browser — a page that throws
halfway renders blank, and a string test would not notice — and the last check
clicks the actual bottom-bar button and asserts a real tab comes up with a
working page in it.

## The rank ladder, and whether rank 1 was ever reachable

The question was "can you actually get to rank 1?", and answering it first
meant working out which rank was meant. The game has three unrelated things
called rank:

* **`you.rank()`** — the Power rank under the portrait, tooltip *"Your power
  position in this realm. The lower the number the stronger you are."* This is
  the one.
* **`mon.rnk` + `global.text.eranks`** — the monster danger grades, `???` / `G`
  / … / `SSS++`, forty of them. A different ladder entirely.
* **Title rarity `rar` 1-10** — the mod's own, derived from `MOD_RANK_AT`.

### It is derived, not stored

From the `You` constructor:

```
rank = ceil( 5e13 * sqrt((agl+str+int+spd/lvl) * 512 / (luck*.1+1))
             / (agl+str+weapon+spd+int)^2 )
```

Recomputed every time `dom.d6.update` asks, which the global tick does once a
second. There is no field. It falls as roughly the stat scale to the power
−1.5 — ten times the stats is about thirty times the rank — and `ceil` floors
it at 1, so rank 1 is a destination rather than an asymptote.

### Measured

Built the character the way the balance scripts do — every skill at the tier
cap, every milestone fired, character level driven through the game's own
`lvlup` — and read `you.rank()` at each rung:

| tier | char lv | cap | STR | rank |
|---|---|---|---|---|
| 0 | 5 | 10 | 578 | 21,617,349,975 |
| 3 | 30 | 30 | 87,641 | 17,143,237 |
| 5 | 55 | 50 | 3.4e6 | 65,544 |
| 7 | 85 | 75 | 1.1e8 | 258 |
| 8 | 100 | 90 | 5.3e8 | 20 |
| 9 | 110 | 110 | 2.8e9 | 1–2 |

and holding everything else at the top while sweeping skill level: 90 → rank
18, 95 → 11, 100 → 7, 105 → 4, 108 → 3, 110 → 1. Cultivation confirms it is
not tight — realm 0 already reaches rank 1 at cap 110, and realm 10 takes STR
to 1.7e10, six times more than rank 1 needs.

**So the answer is yes, and that was the problem.** Rank 1 is reachable, but
only by a completionist max of every skill, and all ten ranks live inside the
last fifteen skill levels after a whole game in which the number is an
unreadable ten-digit blob. It is earned by a spreadsheet, not by anything that
happens in the world.

### The Hall of the First Gate

Ten named challengers, rank 10 down to rank 1, off the Old Path trailhead —
the same endgame branch as the Sunken Hollow, so it inherits the `trne4e1`
gate. Strictly ordered: rank N opens only when rank N+1 has been taken, and
each rung also wants a character level (60, 65, 70 … 100, 110), so the ten
fights span the endgame rather than being one evening. Character level is the
right spine for it: it is the game's own headline progression, it is slow, and
section 27 already prices it to 110.

### Awarding a rank you cannot write

Because the rank is derived, "giving" one means keeping it in `global.flags`
(saved, like `mod_realm`) and **wrapping `you.rank`** to return the better of
the two. It floors, never caps:

```
held 6, stats say 900  ->  6      the ladder carries you
held 6, stats say 2    ->  2      your own power has passed it
```

Nothing is written into a stat, so there is no delta to track and nothing
compounds on load — the trap `you.res` and `skl.p` both fell into. The wrapper
is safe because `you = new You()` runs once at game init and `load()` restores
fields *into* that instance rather than replacing it; `tests/ranks.mjs`
asserts that explicitly, since it is the assumption the whole design rests on.

`dom.d6.update` is wrapped too, only to paint a held rank gold — "I took this"
should not look the same as "my stats drifted here".

### Why the rungs get longer rather than deadlier

Each duel is a `protected`, one-creature, `size 1` area, which is exactly the
shape `MOD_scaleEnemy` already reads as an arena boss — so every rung is
anchored to the player's power at the moment they walk in, and cannot be
out-geared or walled off. On top of that each rung takes a ~7% step, and the
step goes into **fight length**.

The obvious version — scale the kill target up and the die target down — does
not survive ten rungs. The effective margin is `1.5 / step^1.5`, which is
already under 1.2 at a step of 1.16. So `MOD_scaleRankDuel` reads back the
`_modKillT` / `_modDieT` that `MOD_scaleEnemy` left on the spawn, applies the
step, and **re-asserts `kill < die` from those numbers** rather than hoping the
arithmetic worked out. Measured: the rank 1 duel runs 1.77× the length of the
rank 10 one, and all 100 rung × tier matchups hold the guarantee with zero
whiffs.

One number is deliberately conservative. The challengers' `rnk` — the monster
danger grade, not the ladder rank — stops at 14. The base game's coin drop is
`rand(lvl, lvl/4) ** (1 + rnk/5 << 0)`, so rnk 15 would push that exponent
from 3 to 4 and multiply an endgame drop by a hundred. `creature.kksh`, the
toughest thing the author shipped, sits at rnk 10 in the same bucket.

Losing costs nothing but the walk back: a rank you have not taken cannot be
taken off you, and a rank you have taken is never lost. Winning pays 15% of a
character level at the level the rung asked for, which is worth taking and
cannot skip you up the ladder it gates.

## "Why is Cured Hide class Book?"

Because an `item` id is two schemes at once, and the mod only knew about one.

The namespace block is the one it knew: `load()` resolves a saved id with
`itemgroup[(id+1)/10000<<0]`, so an `item` has to sit under 10000. The second
is the **class**, which `dscr` type 1 reads straight off the number:

```
id < 3000          Food           + a "Tried: yes/never" footer
3000 <= id < 5000  Medicine/Tool
5000 <= id < 9000  Material/Misc
id >= 9000         Book           + a "Read: yes/never" footer
```

There is no field for it, and `stype` is not a proxy — the author's stype 4
spans Food, Medicine and Book. So every item the mod ever added, having been
parked at 9100+ to stay clear of his maxima, came out as a **Book**:

| items | was | should be |
|---|---|---|
| 12 crafting materials | 9200-9211 | Material/Misc |
| 4 tonics | 9221-9224 | Medicine/Tool |
| 10 breakthrough pills | 9120-9129 | Medicine/Tool |
| 4 spirit pills (sp4-sp7) | 9101-9104 | Medicine/Tool |
| 6 skillbook manuals | 9110-9115 | Book — correct |

Twenty-six wrong out of thirty-two, each with a spurious "Read: Never" under
it. Only the manuals, which really are books, were right by accident.

They are moved: tonics 4201-4204, breakthrough pills 4210-4219, spirit pills
4220-4223, materials 5200-5211, manuals where they were. `MOD_ITEM_IDS` holds
the ranges with the table above written out beside them, so the next addition
picks from it rather than from "what is free above the author's max".

### Moving them was not free

The inventory is saved **by id**:

```js
a3[0].push({ id: inv[obj].id, am: inv[obj].amount, data: inv[obj].data })
```

and restored by matching it, so an entry whose id no longer exists is dropped
silently. A save from 3.6 would have lost whatever it held of all twenty-six —
and a Tribulation Pill is seven million coin at the Pill Tower. Losing one to a
cosmetic fix is a bad trade.

Section 37 migrates instead. It reads the blob **before** the game's load runs
(that is what clears and rebuilds `inv`), parses a copy of `str.split('|')[6]`,
notes which moved ids were carrying what, lets the original load run untouched,
and gives those stacks back afterwards under the new ids. The save is never
rewritten, and any surprise in the blob makes it do nothing at all — a
migration that fails is better than a load that fails.

`tests/ids.mjs` covers both halves: the class of every added item, checked
against the mod's own tables rather than against the ids, and a round trip
through a blob deliberately rewritten back to 3.6's ids, which must come back
holding exactly what it went in with and must not double-grant on the next
save.

## Two names for one skill, and a quest the mod quietly broke

### "Foraging" was already taken

Ids are the save's key and `tests/ids.mjs` guards them. Names are the
*player's* key and nothing guarded those. Section 4 added `skl.frg` named
**Foraging** — and the base game already had `skl.hvt` under exactly that name.

The result was two identical rows in the skill panel, and **ten identically
named titles**: section 24 builds a title's name from its skill's, so
`mod_t_hvt_25` and `mod_t_frg_25` both came out "Gleaner of Foraging", five
rungs each. Nothing errored, and the grouped picker happily drew both.

Renamed to **Wildcraft**. The key and the id are untouched — names are not
saved, ids are, so the rename costs nobody a level. "Wildcraft" rather than
something invented: the author's register is plain single words (Foraging,
Harvesting, Topography, Elusion, Temperance, Gluttony, Famine), and the skill is
about reading the wild rather than harvesting it, which is what separates it
from his two.

Swept the rest at the same time. Everything else the mod names — 140 things
across eleven namespaces — is unique, including across the **whole inventory
bag**, since `item`, `wpn`, `eqp`, `sld` and `acc` share one list and a repeat
across them reads as badly as one inside a single namespace.

The author's own repeats are listed and left alone, the same call `area.clg`
got: "Chashu Ramen" (`rmn1`/`ramen3`), "Bandage" (`item.bdgh`/`eqp.brc`), "Blue
Slime" (`slm1`/`slm5`), "Nameless" (`ttsttl2`/`hstr4`), and the nine areas all
called "Training Grounds".

### The hunter's quest stopped being completable in summer

`quest.hnt1` wants **ten Raw Meat held at once**. Raw Meat rots:

```js
item.rwmt1.rot = [.25, .45, .1, .2]
```

`planner.chkrot` runs once an in-game day, adds `randf(rot[0], rot[1])` to
`rottil` **divided by a season modifier** — 0.5 in summer, which makes it go off
twice as fast, 2.5 in winter — and at `rottil >= 1` destroys
`amount * randf(rot[2], rot[3]) + 1` pieces. So a perishable stock does not
accumulate, it **converges**:

```
A = (gain_per_day * days_between_rot - 1) / lossFraction
```

The mod never touched the drop table. What it changed is how long a rabbit
takes to kill. `MOD_ENEMY.kill` targets eight landed swings for an average
spawn, and measured at the point the quest is offered — character level 8, cap
15, first Western forest hunting area — a Wild Rabbit has **3,574 HP against the
base game's 93**. A swing does ~357, so one that died in a single hit now takes
ten (`fightsmoke` medians the same area at seven).

Ten times the kill time is ten times less meat an hour against an unchanged rot
clock. At the original 6%, taking a conservative fifteen seconds an end-to-end
kill:

| season | rot every | steady state |
|---|---|---|
| normal | 2.9 days | 15.6 — scrapes it |
| summer | 1.4 days | **4.3 — cannot reach ten** |
| winter | 7.1 days | 51 — fine |

Completable in three seasons and impossible in the fourth is a bug, not a
difficulty choice, and it is the mod's: vanilla kill times put summer
comfortably clear.

Section 36 solves the drop rate backwards from the requirement rather than
picking one — aim for a steady state of 25 in the worst season and the first
area, so the player holds twice what the quest asks and is not racing the clock:

```
A = 25 in summer -> loss per cycle 0.15*25 + 1 = 4.75
over a 1.43-day cycle                          = 3.32 meat/day
over 96 kills/day                              = 3.46% per kill
through a 20% rabbit share                     = 17.3% per drop
```

Rounded to **18%**, applied to every creature carrying `rwmt1` — found by
scanning the drop tables, not by naming the rabbit and the wolf, so a third one
added later moves with them. Worst case is now 26 against 10 needed, and a kill
in the first hunting area yields 0.28 coin of meat, so it is not an income
either. `tests/names.mjs` fails at the old 6% and passes at 18%.

> **Since v4.6** this holds on Fights: Scaled only. On Original, the default,
> the fights are the author's again and so is his 6%; at his kill times it gives
> the same 26 in the worst summer. `names.mjs` checks both.

## Crafting stopped at two stars

The question was whether anything above one star can be crafted. Measured
across all 62 recipes, twice: by the rarity of what they produce, and by
whether any `giveRcp` call anywhere in the game can actually hand the recipe
over.

| stars | recipes | reachable |
|---|---|---|
| 1★ | 43 | 35 |
| 2★ | 17 | 7 |
| 3★ | 1 | **0** |
| 4★ | 1 | 1 |
| 5★ | 0 | 0 |

So the literal answer is yes, narrowly — seven reachable recipes make 2★ things
and one makes a 4★ accessory. But the 3★ tier is a single recipe (`rcp.trr`,
Trinity) that nothing can teach, 5★ is empty, and the one 4★ result is a Clover
Pin you get for holding seven clovers. Crafting effectively stops at two stars.

The same pass turned up a larger base-game finding: **nineteen of the 62
recipes have no `giveRcp` anywhere** — `test`, `trr`, `lnch1/2/3`, `orgs`,
`ffsh1/2`, `fnori`, `cbun1`, `sshl`, `hpck`, `steak`, `cnmnb`, `brth`, `eggsp`,
`crmchd`, `msoop`, `jln4`. Defined, priced, complete, unteachable. Left alone
and reported in the wiki, like `area.clg` and the unfinished titles: which of
them were meant to be gated and which were forgotten is not the mod's call.

### The ladder

Four rungs, 2★ through 5★, each a full set — weapon, body armour, shield,
accessory, tonic — twenty craftable things from twelve materials along three
lines (ore, weave, essence), gathered at four nodes that open with the story.
Each rung eats the rung below it, so it is a ladder rather than four unrelated
shopping lists, and the numbers step about ×1.7 a rung: the 4★ blade lands next
to the base game's own best (`wpn.scspt3`, "Fate Cutters", str 108) and the 5★
one goes clearly past it, since that tier has nothing else to sit beside.

Nodes hang off one door on the Village Center — the same shape as the catacombs
entrance and the Pill Tower — gated on `mod_t_deep`, then one node per story
rung. They set **no tier flag**: a gathering location that hands out a level cap
on arrival is the catacombs bug again.

Gathering is an action, not a location choice, so it reuses the tested
machinery — `MOD_startAction`/`MOD_stopAction`, the `sdrate` cost, and the
unrestricted-actions swap. The yield comes from the location rather than the
action, so one action serves all four nodes, and it trains Mining, Geology and
Foraging: three skills the base game defines and then barely uses. The first
material out of a seam teaches that rung's five blueprints, the way the base
game teaches `rcp.wfar` once you are holding three wolf fangs.

### Three things that had to be got right

**Ids are blocked by namespace, and the save depends on it.** `load()` resolves
a saved item id with `itemgroup[(id+1)/10000<<0]`, `itemgroup` being
`[item, wpn, eqp, sld, acc]`. An id in the wrong block comes back as the wrong
object, or not at all. Items 9200+, weapons 10101+, armour 20101+, shields
30101+, accessories 40101+, all clear of the base game's maxima.

**Rarity cannot exceed 6.** `equip()` does `w.wc = global.text.wecs[w.rar][0]`
and `wecs` has seven entries, so a 7★ anything throws at the moment you put it
on. Five is the top here, and index 5 is the same red/orange band `dscr` uses
for 5★ stars.

**The value model had to be re-indexed.** Section 15 builds `MOD_VAL.madeBy` in
an IIFE at load, long before any of this existed. Without re-indexing, every new
piece fell past rule 2 (price from what it is made of) to rule 3 (price from its
stats), and the first measurement came out backwards: a 5★ sword at 1,161 while
each of the eight ingots it eats priced at 13,000. Selling the raw material paid
ninety times better than using it.

The ingots were wrong too. Rule 4 prices an unplaceable item as
`stypeBase[stype] * rarMult[rar]`, and `rarMult[5]` is 130 — calibrated against
*equipment* rarity, which a lump of ore is not. They are anchored instead
(`MOD_CRAFT.matValue`, 6/18/54/162), sized against what the endgame already
pays: `modEconomy()` puts the Ashen Spire at ~23 coin a kill and a kill at
roughly twenty swings, so combat is about one coin a second. Gathering at the
cap, sold at the 25% the shops give, comes to about six — better, as a dedicated
activity with no loot and no exp attached, without being a printing press. The
gather rate came down with it, from 55% a tick to 14%.

Measured after: a finished blade is worth more than its inputs at every rung
(60 vs 48, 278 vs 222, 1,023 vs 818, 3,506 vs 2,805), which is the point.

## Grouping the titles that had no group

The picker groups by skill, and after the last audit it was worth asking what
it was *not* grouping. Measured: 595 titles, 512 attributed to a skill, **83 in
a flat list** at the bottom — which is the wall of rows the grouping existed to
remove, just smaller.

Reading the 83, almost none of them were really one-offs.

### Two more attributions, both derived

**The flagship titles.** `MOD_FLAGSHIP` (section 17) already pairs a skill with
the title it grants — `['kllr', ..., 'exct']`. The existing pass scanned each
milestone's `f` source for a `giveTitle(ttl.x)` literal, and these milestones
are built from the table, so the closure holds a variable and the scan sees
nothing. Reading `MOD_FLAGSHIP` directly attributes 10.

**The author's numbered tiers.** Around thirty titles are keyed `<skill><n>` —
`tghs1/2/3` (Scarred, Thickskinned, Brute) under Toughness, `srd3/srd4` under
Swordsmanship, `dth4` (Carcass) under Death, `rtr1` (Coward) under Retreating,
`axc3`, `hmr3`. **Most of them are granted by nothing at all** — `giveTitle`
never mentions them anywhere in the game's source. They are unfinished tiers,
like `area.clg`, and they group correctly whether or not they are ever earned.
That pass attributes 9 more.

The trailing digit in that rule is not decoration. `ttl.thr` is "Thrasher", for
smashing the dojo's equipment; its bare stem is `thr`, which is `skl.thr`,
Throwing. A stem match without the digit files it under a skill it has nothing
to do with. Only the author's numbered convention is safe to read this way, and
an ambiguous prefix (`sld` matches no skill; `lnc` matches none) is left alone
rather than guessed at.

### The ladders

That still left 63, and 40 of them were ladders of their own:

| stem | titles | |
|---|---|---|
| `mod_realm` | 10 | the cultivation realms |
| `kill` | 5 | Pest Control → Sentinel |
| `geti` | 4 | Collector → Treasure Hunter |
| `ttsttl` | 4 | titles collected |
| `hstr` | 4 | punch power |
| `neet` | 3 | Hikikomori → Hermit |
| `sld` | 3 | Protector → Bastion |
| `jbs` | 3 | Errand Boy → Hired Hand |
| `eat`, `mone`, `shpt` | 2+ | |

They share a key stem exactly the way the numbered skill tiers do, so
**membership is derived** — bucket by the digit-stripped stem, and any stem with
two or more members becomes a collapsed group like a skill's.

`MOD_TITLE_FAMILY` holds one *label per family*, not one per title. A human name
for "the ttsttl ladder" cannot be read off anything, and eleven labels is a
different thing from 83 mappings. A stem with no label falls back to the name of
its lowest-ranked member, which is how these ladders introduce themselves in
play anyway.

A skill group's header is self-describing — "Titan of Toughness". A ladder's is
not: "Nameless (4)" could be the punch-power ladder or the title-count one. So
the ladders carry their label on the row, dim and right-aligned before the
count, rather than only in the caret's tooltip.

Result: **595 titles held renders as 126 collapsed rows**, and the flat tail is
down from 83 to 23 genuine one-offs — Nobody, Initiate, Thrasher, Wolf Slayer,
Quartermaster, Glass Bones, Safehouse and the like, which really are story
titles with nothing to group under.

### The wiki uses the same derivation

Its title page had the same shape of problem, solved worse: everything without a
skill went under "From the story", split into rank buckets. It now takes the
same families, nested one level down under "Ladders of their own" — eleven more
*top-level* summaries cost about 530px on what is already the tallest page in
the wiki, and `tests/wiki.mjs` caps it at 6,000. It reads the mod's own tables,
so the picker and the wiki cannot drift apart.

### Five unfinished titles, found on the way

`ttl.ddcd` carries the literal string `"null"` as both name and description, and
`shpt2`, `shpt3` and `mone3` have empty ones. None is granted by anything, so
none can be earned. The picker **skips** them — a blank row, or one reading
"null", is not worth risking over one condition. The wiki **keeps** them and
tags them "unfinished", which is the same call `area.clg` got: a reader looking
for why a title never appears is better served by the row than by its absence.

> **Since v4.3:** four are finished from the intent in the author's code —
> Second- and First-Rate Shopper at 5,000 and 10,000 purchases, Peasant and
> Merchant at 10 and 100 gold. `ttl.ddcd` is left as it is. See "Small fixes
> (v4.3)".

## The title list was doubling too

Found by auditing after the rank ladder went in, not reported by anyone.

`giveTitle` puts every earned title on two arrays:

```js
global.titles.push(title); if (title.id !== 0) global.titlese.push(title);
```

and `load()` rebuilds `global.titles` from the save **by index**, then appends
all of `titlese`:

```js
for (ttlid ...) global.titles[ttlid] = ttl[obj];
for (obj in global.titlese) global.titles.push(global.titlese[obj]);
global.titlese = [];
```

Everything earned in the session is therefore in the rebuilt array already and
appended again. Measured on a character holding 241 titles: **241 before a
load, 481 after, 241 distinct.** It does not compound — the next load finds
`titlese` empty — but one load is enough, and `save()` writes the inflated
array straight back out.

Reproduced in the UI: with seven titles held, "Safehouse" rendered twice in the
picker after one save/load.

It is a base-game bug, and it was there before the mod. The mod is what makes
it loud — vanilla hands out around a hundred titles and section 24 grants five
per skill. Section 17 already dodged it once: `MOD_titleCount` counts from
`ttl` rather than `global.titles.length` "because load() rebuilds that array
and appends `titlese` to it, which can double-count". That note was right about
the cause and stopped at working around it for renown.

`MOD_dedupeTitles` (section 33) repairs it properly, the same way and for the
same reason as `MOD_dedupeSkills`: `global.titles` holds references to the
objects in `ttl`, so the same object twice is always wrong whatever put it
there. Deliberately not fixed at the source — `titlese` is the author's
mechanism and the mod has no business changing what it means.

`tests/ids.mjs` covers it: distinct before a load, after one, after two, no
holes, the worn title still in the list the picker reads, and an already-doubled
list repaired. Confirmed the checks fail without the fix (85 entries for 43
distinct).

### What else the audit looked at, and found clean

All 75 locations draw without throwing (`chss.trd` is the author's reading
screen and needs a book argument — not a location). No choice row wraps its
22px line anywhere. All twelve wiki pages build, with no horizontal overflow at
375, 768 or 1200px. No id clashes in any namespace. No interval leaks over
fifteen seconds at 20x. `acts`, `you.skls`, `furn` and `qsts` all stay distinct
across repeated save/load cycles, and `you.res` / `skl.p` perturb once on the
load after milestones re-fire and are reconciled back by the next tick, with no
drift after that.

## hpTrack's max HP was transient — fixed

Turned up while testing the rank duels end to end through `attack()` rather
than through a damage sample. Recorded here because it invalidates a number
every balance script in the repo relies on, and because it is a separate job.

`hpTrack` (section 9, carried into section 10's consolidated `allbuff`) sets

```js
you.hpmax = Math.round(hpRef * Math.pow(ratio, MOD_PLAYER.hpTrack));
```

at the end of the wrapper. `allbuff` begins with `who.stat_r()`, and `stat_r`
recomputes `hpmax` from `(hp_r+hpa)*hpm*hpe`. So the assignment is overwritten
by the very next `stat_r` — and the tick, `fght`, `update_d`, `update_m` and
`allbuff` itself all call it constantly.

Measured on a cap-60 character with every skill at the cap, sampling
`you.hpmax` every 137 ms across six seconds of the page's real game loop: **43
samples, all 10,050.** The hpTrack value of 184,754 appeared in none of them,
and the game's own HP bar read `hp: 2,438/10,050`.

The balance scripts never caught it because they read `you.hpmax` in the
instant after `allbuff`, when the raised value is still standing.
`MOD_scaleEnemy` reads it at the same moment and sets `_modDmg` from it, so the
enemy's damage is sized for roughly eighteen times the health the character
actually has. It is harmless early — `ratio` is near 1 until the mod's skills
have levels — and worst at the top of the ladder, which is exactly where the
rank ladder sits.

The fix is the one `MOD_scaleEnemy`'s own header already spells out for
enemies: write the **multiplier**, not the total. `you.hpm` is what `stat_r`
reapplies from the base on every call, so setting that is idempotent and
survives. Two things to check before doing it: whether `hpm` is in the save
(if it is, it needs the delta treatment `you.res` gets in section 13, or it
compounds on load), and what happens to `allareas` once the player really has
the health its 2,790 matchups have always assumed.

A first attempt at a narrower fix — restoring `you.hp` after the wrapper so the
game's clamp ran against the final `hpmax` rather than the unbuffed one — was
written and reverted. It is correct as far as it goes, but `hpmax` reverts on
the next `stat_r` regardless, so it fixes a symptom and leaves the cause.

### The fix

`hpm` is an input to `stat_r`, so writing that instead of `hpmax` survives.
Measured on a cap-60 character: before, one `stat_r()` took hpmax from
1,492,947 to 72,377; after, both read 780,407, and so do two hundred more
`stat_r` calls.

Three corrections were needed on the way, each caught by measurement rather
than by reading:

1. **`hpm` is saved.** `hpm:you.hpm` is in the save object, so multiplying it
   in again each load would compound exactly the way `you.res` once did. The
   mod's factor is stored in `global.flags.mod_hpm` and divided back out first
   — the `MOD_applyMoneyDrops` pairing.
2. **The recovered base needs a floor.** `freshYou()` in the test harness
   resets `you.hpm = 1` without clearing the flag, so the division recovered
   `1/18.86 = 0.053` and max HP collapsed to **12**. `allareas` caught it
   immediately: six rank-duel matchups flipped to `kill > die`. Flooring the
   base at 1 is an invariant, not a patch — only milestones touch `hpm`, and
   they only add.
3. **`Math.ceil`, not `Math.round`.** `stat_r` ceils. One unit apart is enough
   for the durability check to fail, which is how it was found.

`stat_r()` is not called from inside the wrapper. The mod's own skill `use()`
calls add straight into `you.str`, and `stat_r` would recompute those from
`(r + a) * m * e` and wipe them — so the wrapper sets `hpmax` by hand alongside
`hpm`, and the next `stat_r` reaches the same number on its own.

What this changes in play: the character now actually has the health every
balance script has always assumed. Enemy damage is unchanged — `MOD_scaleEnemy`
was already sizing against the buffed number — so fights stop being roughly
eighteen times deadlier than the model intended, worst at the cap. All 2,790
`allareas` matchups still pass, because they were measuring the right number
all along; it was play that had the wrong one.

> **Since v4.0:** the realm code had the same bug, and fixing both led to
> `MOD_BODY` — see "A realm's body multiplier did nothing". hpTrack no longer
> writes `hpm` itself; it publishes a factor there.


## The cultivator's road (v4.0)

Section 38. Asked for: use sources such as Wuxiaworld for where the story should
go and how it should progress.

### What the sources say

Two kinds of source were read, and they answer different questions.

**Wuxiaworld's "General Glossary of Terms"** is the genre's own reference for
its vocabulary, and it describes, by name, the machinery the mod was missing.
Its entry on bottlenecks says a cultivator may need new insight, a medicinal
pill, or harsher training to break one. The mod had exactly one of those three
— the pill — which is why a bottleneck was a shopping trip rather than a wall.
The glossary also covers the Spiritual Root (innate talent, tested, sometimes
rare), the nine layers of a stage and the words Early, Middle, Late and Peak,
seclusion as the way to push through a bottleneck without being disturbed at the
crucial moment, the internal demons waiting there, Qi Deviation as what failing
does to you, the impurities a body expels on the way up, and the Heavenly
Tribulation that answers a cultivator's progress.

The notes here and the comments in section 38 paraphrase and cite it. The
first version of section 38's comments quoted several of its entries at length;
those passages should be paraphrased too.

**The book structure of two long works on the same site** — *I Shall Seal the
Heavens* and *A Will Eternal*, both by Er Gen — answers the other question,
where a story goes. Read off their book titles, both follow the same shape: one
sect, then a wider region, then the world, then a domain of your own, then
above it. proto23 already owns the first and the last of those — the dojo is a
sect in all but name, and the Hall of the First Gate is the regional ranking
tournament the middle books turn on. The rungs still missing (disciple grades,
a sect contribution currency, a secret realm) are recorded here as where the
story goes next, not built.

### What was built

Each is a mechanic on objects that already existed; no new areas.

| Piece | What it does |
|---|---|
| Spiritual Root | Five grades by purity, rolled once when the dojo finishes with you. The worst costs 15% cultivation speed, not access; a Root Cleansing Pill moves you up a grade. |
| Nine layers | Derived from Qi Circulation between this realm's threshold and the next, so breaking through lands you at layer 1 on its own. "Half a step to" is the genre's name for what the mod called a bottleneck. |
| Insight | From meditating, from a kill made under 20% health, and from the first visit to an area — the three sources the glossary names, and no fourth. Spent whether or not the attempt works. |
| Closed Door Training | A fifth action, which only starts at a wall. Fifteen minutes is worth +30% on the attempt, and a failure from inside it cannot cause Qi Deviation. |
| Qi Deviation | Failing in the open: half an in-game day at ×0.55 stats and ×0.70 body, no second attempt, cleared by time or a Qi Settling Pill. Never kills. |
| Heavenly Tribulation | Realms 8-10 answer a successful breakthrough with 3/5/7 bolts costing 55/70/85% of max HP. Realm 10 had been named Tribulation Transcendence with no tribulation in it. |

The root's speed bonus goes through `skl.qic.p`, which is saved and restored
after milestones, so it is reconciled on the tick against `global.flags.mod_rootxp`
rather than set once. Qi Deviation is timed on `time.minute`, the game's own
saved clock, so it expires on schedule across reloads.

**Tested since v4.5** by `tests/road.mjs`, rule by rule. Until then the root,
layers, insight, deviation and tribulation had been verified only by hand.

> **Since v4.6** the insight, the fifteen minutes and the half day are sized to
> each realm's climb instead, and meditation earns insight only at a wall — they
> were set when realms 3-6 took minutes, and on the matched curve they take days.
> See "Fights as he wrote them, walls sized to the climb, prices you can pay".


## A realm's body multiplier did nothing (v4.0)

Found while extending section 28. The realm wrapper raised max HP and max energy
by assigning `you.hpmax` and `you.satmax` — the same mistake v3.9 fixed for
hpTrack — and `stat_r` recomputes **both** from their inputs. Measured on a
realm-10 character: max HP 332 after `allbuff` and 39 after one `stat_r`; max
energy 1,700, then 200. The ×8.5 the top realm advertised lasted one call.

Two contributors now wanted the same two inputs, `hpm` and `satm`, and a second
delta tracker beside hpTrack's cannot work: each recovers its base by dividing
out its own factor, and each would find the other's factor sitting inside that
base. So **nothing writes `hpm` or `satm` any more**. Contributors publish a
factor to `MOD_BODY`, and `MOD_applyBody()` writes the product once, with one
delta flag per axis (`mod_hpm`, `mod_satm`). It is idempotent, which is what
lets more than one wrapper call it.

Verified: max HP and energy survive `stat_r`, 200 further calls move nothing,
and a Mortal character is untouched. `satmax` does not compound either — the
worry that it would turned out wrong, because `stat_r` rebuilds it too.

One more thing found on the way: a third hpTrack site at the old section 9 still
assigned `hpmax`, but it was in a wrapper that never ran — sections 6, 7 and 9
each re-anchored on the game's own `allbuff`. Measured, the game's `allbuff` ran
once per call. Those dead wrappers were removed in v4.3.


## Skill rarity, and folding a section into one skill (v4.1)

Section 39. Asked for: items that merge skills to clean up the list, ending in
one skill per section that does everything its section did; rarities for
skills; and a skill handbook in the wiki.

### Rarity

The rank of the level you have taken a skill to — `MOD_rankForLevel(sk.lvl)`,
the same thresholds and ten colours titles use — named Novice through
Transcendent. Derived rather than assigned, because a hand-picked rarity per
skill would be a hundred more numbers to keep in step with a ladder that moves,
and would say nothing about your character.

The colour goes on the row's name element's *style*. The game's per-second
updater rewrites that element's `innerHTML` every second, which would wipe any
markup in the name, but it never touches the element's own style.

### Folding hides; it never removes

A Jade Slip — the glossary's object for storing knowledge and handing it on —
folds one skill into its section, lowest level first. The obvious
implementation, taking the skill out of `you.skls`, breaks three things at once:

- the game's panel only redraws when the list **grows**, so a removed row stays
  on screen;
- `giveSkExp` pushes a skill back onto the list at its next level-up, banner and
  all, so the fold undoes itself;
- `you.skls` is saved by id.

So folding marks the skill in `global.flags.mod_folded` and the panel hides the
row, through the same branch that already hides collapsed groups and maxed
skills. This works because `you.skls` was only ever the display list: the mod's
buffs are applied from `skl` by key, and most base-game skills pay out through
milestones already written into stats. **"All of the buffs" is therefore
literally true rather than re-implemented.** `tests/convergence.mjs` proves it:
every stat after folding all hundred skills is exactly its unfolded value times
the convergence bonus.

The ten converged skills (ids 2201-2210) are created at load whether or not
anything is folded, because skill exp is saved positionally over `skl` — one
that appeared only when first needed would shift every slot after it. They are
aggregates: no perks, never trained, showing the best level in their section.
The bonus is ×1.03 per fully folded section, compounding, with a proportional
share for a partial one.

Two bugs caught before shipping: `removeItem(obj, flag)` takes a flag, not an
amount, so passing a count dropped the whole stack of slips; and there is no
`you.inv` — a stackable item sits in `inv` once and carries its own `amount`.

The **Skill handbook** is a wiki page beside the skills list: the rarity scale,
what folds into what, and what the slips cost.


## Measured against the original game (v4.2)

Asked for: check everything is exactly as balanced as the original game, and
perhaps new ways of writing huge numbers so it looks balanced.

### How

`tests/vanilla.mjs` loads the game twice. In one page the single script tag
resolves to an empty file, which *is* the author's game; the same measurement
code runs in both, and none of it may call anything the mod defines. (The older
`BASELINE=1` switch in `earlybal` only turns off enemy scaling — the player
still has every mod perk — so it was never a real baseline.)

### What matched, what did not, and what changed

| | Before | Now |
|---|---|---|
| Character level curve | identical | identical |
| Skill cost below level 10 | 12× faster at level 5, 364× at 10 | exactly the author's |
| Skill exp multiplier | 2 | 1, the original's |
| Enemy coin drops | 15% | off, the original's |
| Time to skill 110 | ~six months for a steady skill | unchanged |

The author designed skills up to level 15 — every one of his 22 perk ladders
ends between level 1 and 15, median 10 — and inside that range the mod's old
geometric curve was 100 to 1,000 times faster. The curve is now his exact
formula below level 10, then rises at a ratio solved by bisection so the whole
climb to 110 costs the same wall-clock time as before. Level 15 could not be
matched: his level 15 alone costs 823,099 xp, and 95 more levels even at that
flat price would be two and a half times the budget.

The coin drop is the author's own mechanism, switched on only by the Coin Ring
(+1%) and the Ring of Greed (+3%); under a 15% base both rings were rounding
errors.

**Fights were measured and deliberately not matched.** At equal skill levels
the original's opening route is almost free — median 1.2 swings to kill and
about 25,000 to die — because you out-level its fixed creatures. The mod's
enemy model exists to remove that. An earlier comparison in the same pass showed
the original as a wall of unwinnable fights; that was the old skill curve
handing the original's player far lower skills for the same xp, and it inverted
once the curves matched. The test prints the gap and asserts only what must hold
either way: winnable wherever the original is, and never deadlier than the
deadliest fight the original lets you win.

> **Since v4.6** they are matched by default: Fights: Original leaves the
> author's areas as he wrote them, and this gap is the Scaled setting's. See
> "Fights as he wrote them, walls sized to the climb, prices you can pay".

### Bugs found on the way

- **The six masteries were on the author's curve.** Section 19 installed the
  curve over the skills that existed when it ran, and section 29 creates the
  masteries later — so their level 20 cost 7,474,050 xp instead of 375, and
  their perks to 110 were unreachable. The curve is now installed again at the
  very end of `mod.js`.
- **A damage sample with no crit dropped the crits.** Every stratified estimator
  fell back to a plain mean when its sample rolled no crit — not averaging the
  crits badly but leaving them out, and at cap 30 they are 30% of all damage. In
  the mod about one spawn in twenty came out ~20% weak; in the tests a fight read
  ~40% long 0.15% of the time, which across thousands of matchups is what had
  been intermittently failing the thinnest-margin rank duels. Empty strata are
  now topped up, in the mod and in all five test copies. On the Tallyman duel the
  1st percentile of kill/target went from 0.775 to 0.959.

### How big numbers are written

Section 40. The mod's numbers are enormous next to the original's, and that
reads like a balance problem without being one — enemies scale to the player,
so a fight is the same length at STR 50 or 5,000,000. A setting picks Short,
Scientific, Myriads or "as the original".

Two things set its shape, both from the author's own code. His damage log calls
his compactor for anything over 9,999 and then discards the result, so no damage
number was ever compacted — that is where he wanted compaction to start, and in
every format a number up to 9,999 prints exactly as the original prints it. And
his wallet already counts in 10⁸ coins over groups of 10⁴, which is the myriad
system (万, 亿), so Myriads is his notation carried to the rest of the screen.
"As the original" is his output byte for byte, including his formatter putting
commas inside exponential notation past 10²¹.


## Small fixes, and two that were not needed (v4.3)

Chosen from a list of improvements.

- **The realm on the rank line.** The player panel is a fixed 310px box with
  307px already used, so nothing gets a new line; the realm shares the rank line
  and is the breakthrough button at a bottleneck. It has to be plain ASCII: the
  game's font is MS Gothic, and where it is missing a ▲ fell back to a font 1px
  taller and a ⚠ to one 6px taller, each pushing the panel past its box.
- **A What next page in the wiki**, reading the save and built on each system's
  own gate, so it cannot call a locked door open.
- **Rarity you can read**: named in the skill tooltip, with a sort and a filter.
- **The skill panel rebuilt every row every second**, forever, once the list had
  grown with the panel open — the game stores the list's size once and never
  updates it. 265 redraws in five seconds at 53 rows. The mod's own updater
  replaces it, redraws once per change, and notices a shrink too.
- **The Damp cellar** had no spawn weights, no way in, and an exit into two
  screens that were never written (`chss.q1lwn`, `chss.q1l`). It is Notice #1 on
  the Message Board now — an inference from those names ("quest 1"); the rest is
  the author's.
- **Four unfinished titles finished**: the shopper ladder at the 5,000 and 10,000
  purchases his commented-out code names, and the money ladder at 10 and 100
  gold. The fifth, `ttl.ddcd`, is named "null" with nothing to say what it was
  for, and is left alone.
- Rank-duel margin 1.25 → 1.4; `allareas` gains a fully folded build (3,720
  matchups); three dead `allbuff` wrappers removed.

Two items on that list turned out to be wrong. **Tutorial fight 1** loses only in
the original's raw numbers; in the modded game it was already winnable. And the
**marketplace lockout** had already been fixed in section 32 — every link in the
chain was audited again (the dojo, the Paper Boy, the Pamphlet, reading it, the
door, the Herbalist behind it) and none can be lost for good.


## Repository housekeeping: which remote is which

Not gameplay. The checkout's remotes were renamed so the desktop app's move to
the cloud could push somewhere writable:

```
origin     https://github.com/Xeus24/23html.github.io.git   the fork — pushes go here
upstream   https://github.com/23html/23html.github.io.git   the author's game
```

`main` tracks `origin/main`. The author's changelog check therefore compares
against **`upstream/main`** now:

```
git diff upstream/main -- changelog/changelog.html    # must be empty
```


## Backups before an update, and a pacing setting (v4.4)

### Backups

v4.2 changed how fast skills level on saves people were already playing. A
change like that can always be undone in code; it cannot be undone in a save the
new version has already written over. So the first time a new version of the
mod loads, it copies the live save and all three slots into `p23_backup_1..3`
before the game has read anything.

**It is section 0, the first code in `mod.js`, and depends on nothing below it.**
An update that breaks is exactly when the backup is wanted, and a section that
throws stops every line after it — while the game, which does not depend on the
mod, goes on loading and then autosaving. So the copy is made before any of that
code has a chance to fail, using plain key literals because section 20's
constants do not exist yet. The test asserts the placement.

Three are kept, the oldest replaced first — oldest by a sequence number, because
backups made in the same millisecond tie on the clock, which the test found.

The test also found a real bug before it shipped. When a backup did not fit, the
first version cleared every other backup to make room, retried, and — if the
retry failed too — had thrown them all away for nothing. It now frees only the
space of the backup it was replacing, which it was about to overwrite anyway.
**A failed backup must never cost an older one.**

Restoring (section 44, in the saves panel) puts every slot back, because that is
what a backup holds and a half-restored set of slots is a state that never
existed. It saves the current slot and backs up the present first — never over
the backup being restored — so a restore can be undone, then reloads, since the
game reads its save only at startup. It restores saves, not the mod's code.

One consequence for anyone changing the mod: **bump `MOD.version` for any change
a save could notice**, or the backup that would protect it is never made.

### Pacing

v4.2 made the mod's earlier pacing a matter of three console commands. Section 45
makes it one setting:

| Preset | Skill cost | Skill exp | Coin drop |
|---|---|---|---|
| Original (default) | the author's below level 10, then a solved ~2.9% ramp | 1x | 0 |
| Mod before 4.2 | `50 × 1.106^level`, exactly | 2x | 15% |

"Exactly" needed one addition: `MOD_XP.fixedRatio`, which skips the ratio solve.
With `vanillaTo` 0 the curve's anchor makes level 0 cost 50, so a fixed 1.106
reproduces the old curve to the unit — the test checks levels 0 to 109. Level 110
is the same distance away in both presets, and fights are identical, because the
enemy model never changed between them.

The exp and coin boxes already persisted on their own keys, so a preset simply
sets them. The curve had no persistence, so the chosen preset is stored and its
curve re-applied at load. Changing a box afterwards reads as **Custom** rather
than silently claiming a preset that no longer holds.


## Small things found by using it (v4.7)

Twelve items off one list, all small. Section 48 holds the new code; the rest
are edits where the problem was.

- **The Qi Settling Pill was a loophole.** 4.6 made Qi Deviation last as long as
  the seclusion it skipped — 91 in-game days at realm 10 — and the pill that ends
  it still cost 5,200, ten minutes of late income. It now costs the breakthrough
  pill of the realm at the wall (never under 5,200), so failing in the open costs
  a second pill. Vendor stock copies a price at restock, so the listing reads it
  through a getter and rows already on the shelf are repriced on the tick.
- **Near-death insight on Original fights**, measured rather than guessed
  (`tests/fights.mjs`). At arrival his areas take thousands of fights to bring
  you under 20% health — his design, you out-grow them. The mod's own areas and
  the rank duels do it in two to five. No wall depends on it: each can be met by
  sitting alone. Left as it is, and the wiki now says where it happens.
- **Every tooltip is checked** (`tests/tooltips.mjs`): 1,367 rendered through the
  game's own `dscr`, plus the 22 the mod attaches on its screens. It would have
  caught the realm tooltip that printed its own source.
- **Settings travel inside the save.** Written into `global.flags.mod_settings` on
  save, and taken on load only where the browser has no setting of its own.
- **Notes in the log**: after an update, once; on a first install, where the
  wiki and commands are; on Safari, a reminder to download a backup at most once
  a day and not after a download; under the userscript, an untested game version.
- **The rank line shows the wall**: `½ step to Nascent Soul >> 40/104`.
- **Small visuals**: no spinner arrows on the mod's number boxes (they sat on the
  digits in Safari), and Menlo/Consolas before the generic monospace in the wiki,
  since Safari's Courier is wider than Chrome's.
- **The old pacing preset is labelled legacy** and not held to the economy rule;
  **the spirit pills and the Root Cleansing Pill** are, at a day of income from
  the tier where each is worth buying — all five already passed.
- **Tests wait for two ticks, not 4.5 seconds**, which took the suite from 97 to
  about 75 seconds.

## Fights as he wrote them, walls sized to the climb, prices you can pay (v4.6)

Five things from the list: match the original's fight pacing in his areas,
re-check the economy with the coin drop off, re-check cultivation pacing on the
matched curve, run the tests on GitHub, and play the mod on the hosted game.
The sixth — a faster `allareas` — turned out not to need doing.

### Fights: Original

The mod's enemy model was built to remove out-levelling, and it does. But the
original's pacing *is* out-levelling: at equal progression his forest takes a
swing or so a kill and barely fights back. Since 4.2 the mod's defaults are his
wherever they can be, and fights were the one place left where they were not.

Section 47 adds a setting, and Original is the default. It is two hooks into
section 8, not a second model:

- `MOD_scaleEnemy` returns at once when the spawn's area is one of his — marked
  `_modAuthor` on every area that exists before section 8 adds any.
- `MOD_applyAreaLevels()` swaps each population's level range between his
  (`_modLv0`) and section 8's ×1.4 (`_modLvS`). The value model reads `_modLvS`
  either way, so no price moves when the setting does.

Raw Meat goes back to his 6% on Original. The 18% of section 36 was solved
backwards from the scaled kill time of fifteen seconds; his is under two, so
five seconds is still conservative, and 6% at five seconds is the same steady
state as 18% at fifteen — 26 held in the worst summer against ten needed.

The mod's own areas stay scaled. There is no original of the Hollow, the Spire,
the Vigil or the rank duels to match, and the ladder needs the targets the
model leaves on a spawn. *Scaled* is section 8 everywhere, as before, and the
*Mod before 4.2* pacing preset now selects it.

`tests/fights.mjs` holds it against his page, not against a description of it.
Every one of the 70 spawns in his areas — level range, level, HP, STR, AGL,
INT, SPD, exp — comes out identical on both pages with `random()` seeded the
same way. On his route, at the point you first reach each step, every step past
the tutorial is winnable spawn by spawn, and the median fight is no longer than
his. He loses Tutorial fight 1 at skill 0, and so does Original: that is his.

Every balance script measures section 8, so each now switches to Scaled first.
Without that, on the default, `allareas` would be measuring his creatures
against a capped player and calling it the model.

### The economy with no coin drop

With the author's coin formula on at 15% — the mod's default until 4.2 — the
top of the game paid about lvl³ a drop, and the Pill Tower was priced for it.
With it off, `tests/econ.mjs` measures what each stage actually pays: fighting
each area open there (the real swings a kill takes through `dmg_calc`, the drop
table sold at 25%, time to recover the health it cost) and gathering at each
node, best one taken. From a character at each tier's cap: about 2,000 an hour
in the forest, 4,000 by the basement, 9,000–10,000 once Ashfall Quarry opens,
32,000 at the Deep Vein.

The rule it holds every required price to: **no more than 10% of the climb it
gates, in hours of that income.** A realm pill gates the Circulate Qi climb from
the realm below. On that rule the Herbalist's four pills cost half an hour to
nine hours, and all hundred Jade Slips come to about 4% of what the game pays
after the Archive opens — both already fine. The Pill Tower was not:

| pill | budget | was | hours of income | now |
|---|---|---|---|---|
| realm 8 | 657K | 900K | 89 | 540K |
| realm 9 | 583K | 2.4M | 238 | 560K |
| realm 10 | 6.97M | 7M | 220 | 6.5M |

Realm 9's budget is below realm 8's because its climb (Qi Circulation 82 → 90)
is shorter; 540K and 560K both sit under their own and keep the ladder rising.
The dojo still gives one pill per realm for 6-10; the tower is where a second
one comes from after a failure.

### Cultivation on the matched curve

`tests/road.mjs` now prints the realms against the climb, on the live curve at
Circulate Qi's 0.9 a second:

| realm | Qi | climb | from 0 |
|---|---|---|---|
| 2 Foundation | 8 | 3 h | 3 h |
| 3 Core Formation | 18 | 84 h | 87 h |
| 5 Spirit Severing | 45 | 268 h | 500 h |
| 8 Body Integration | 82 | 652 h | 1,960 h |
| 10 Tribulation Transcendence | 110 | 2,195 h | 4,733 h |

The realms themselves were right: they follow the curve, which was matched to
the author's in 4.2, and the whole ladder is the six months at 1x it always was.
What was wrong was everything sized in minutes around them. Realm 3's wall
asked for five insights and fifteen minutes of seclusion at the end of an
84-hour climb; worse, the Circulate Qi that did the climbing also rolled for
insight the whole way, so a player arrived with a thousand and the wall cost
nothing.

- **Meditation only earns insight at a wall.** Fights you nearly lost and new
  ground still count anywhere.
- **The wall is 5% of the climb to it** (`wallShare`), at the meditation rate:
  realm 3 asks for 60, realm 10 for 1,580. The old 1, 3, 5 … stays as a floor,
  so realms 1 and 2 are unchanged, and no wall is smaller than the one below.
- **Full consolidation takes as long as seclusion takes to earn that insight**
  on average — 1.4 hours at realm 3, 37 at realm 10 — so sitting it out
  finishes both together.
- **Qi Deviation lasts as long as the seclusion you skipped** — 3.5 in-game
  days at realm 3, 91 at realm 10 — never under the old half day. Pushing in the
  open costs what doing it properly would have.

All four are derived from the curve and the realm ladder in code, never
written as numbers.

### Tests on GitHub, and the author's files

`.github/workflows/tests.yml` runs on every push and pull request: `npm run
check`, `tests/authorfiles.sh`, then the suite. `authorfiles.sh` is the rule
that used to be a line in CLAUDE.md, made a check — his changelog byte for byte,
and `index.html` his plus exactly the three added lines — against his repository,
fetched read-only when there is no `upstream` remote.

### allareas, and the suite

Listed as the slowest script by far. Timed: seven seconds, four and a half of
them the page-settling wait every script pays. Whatever made it slow went with
an earlier fix. The suite as a whole was worth speeding up, so `run.sh` now runs
four scripts at once — every script launches its own browser, a fresh profile,
so the ones that write saves cannot collide — and prints seconds per script. All
38: about 1½ minutes, from 5½.

### The userscript

`tools/build-userscript.mjs` wraps `mod.js` and the mod's changelog into
`userscript/proto23-mod.user.js`, for Tampermonkey or Violentmonkey, matching
`https://23html.github.io/`.

A manager runs a script inside a function of its own, which would make every
`var` in mod.js local — the console commands, and everything the game reaches by
name, would disappear. So the userscript does not run the mod; at document-end
(DOMContentLoaded: after the game's inline script, before the `load` listener
reads the save) it appends mod.js to the page as an inline `<script>`, which runs
in the page's global scope exactly as the tag does locally. That made one real
change to mod.js: two places read the game's own source from `document.scripts`,
and would have read the injected mod as part of it. Both go through
`MOD_gameSource()` now, which skips the tag the userscript marks.

The changelog is embedded, because the author's site has no
`changelog/mod-changelog.html`. The file is generated and committed, so it can be
installed from its raw URL; `tests/userscript.mjs` and `npm run check` fail when
it is stale.

### Safari

Asked for next: make it work well on Safari. Playwright drives WebKit, the engine
Safari is built on, so every test script now takes `BROWSER=webkit`, and CI runs
the whole suite on both engines. All 38 passed on WebKit the first time, and
`mod.js` has nothing older Safari cannot parse — it is almost entirely ES5. What
WebKit found was in how the page looks, and none of it could have shown up in
headless Chromium:

- **Every skill row wrapped.** Its three cells are 32%, 170px and 197px, which
  fit the panel's 550px with under a pixel to spare. WebKit's scrollbar takes
  eight, and on a row carrying a section header (flex-wrap, so the header can sit
  above) the exp bar dropped to a second line: rows 78px tall instead of 30, and
  a sideways scrollbar, because the header's 100% did not count its padding. The
  bar column now takes the space left (`flex:1 1 0`) and the header is
  border-box. Chromium set to always show scrollbars had the same bug.
- **The mod's dropdowns were grey macOS buttons** on the dark settings panel —
  Safari ignores a `<select>`'s background unless its native look is turned off.
  `MOD_styleSelect()` does that for all four and draws the caret back in.
- **Clicking a section header selected its text**, since Safari still wants
  `-webkit-user-select`.

And one that is not Safari's alone, found measuring it: the skill panel's
per-second updater rewrote three cells on every row every second, hidden or
not, changed or not. 110 rows: 329 DOM changes and 3.8ms a second on WebKit
(2.3 on Chromium). It writes only what changed now — two changes and 0.3ms when
one skill moves.

One Safari behaviour the code cannot fix: its tracking prevention can clear a
site's stored data after seven days of browsing without a visit, which takes the
saves and the automatic backups together. The README tells Safari players to
download a backup now and then.

## Three bugs in the author's code, and a second batch of small things (v4.5)

### Death, Shield Mastery and Luck

All three were found long before they were fixed, and each is one line inside a
long function of the author's, so each is corrected from outside it.

**Death.** The game multiplies your energy on death by `0.55 × (1 − level × 0.1)`.
That is 55% at level 0, nothing at level 10, and below zero from level 11 — so
your energy went negative. The replacement is `1 − 0.45 / (1 + level × 0.1)`: 55%
at level 0, exactly as before, then 78% at 10 and 96% at 110, always improving
and never reaching 100%. The death is detected by `global.stat.deadt` rising,
because the "You avoid death" branch runs the same function without dying.

**Shield Mastery.** The last bracket of the enemy's damage multiplies your whole
defence by `(100 − (shieldAff + targetCls × ta) × 5 × (1 + level/20)) / 100`. At
level 110 that `(1 + level/20)` is 6.5, the bracket goes negative, and defence is
added to the hit. Every other bracket in the line is `100 + …`, so a sign typo is
likely — but that is a guess about intent, so the bracket is only floored at
zero: defence can fall to nothing, never below. It is done by holding the skill's
level, for one call, where the bracket is exactly zero. The test checks that a
hit where the bracket was positive comes out identical to before.

**Luck.** `dmg_calc` declares `let b = you.luck/25 + 1` inside the player's own
block, so the crit roll outside it reads the outer `b`, always 1. The author's
range is small — luck moves by one to four on a handful of events, so his
multiplier tops out near ×1.4 — but this mod's perks grant luck on every social
skill, and at cap 110 a character holds 132–223 of it. Through his formula that
is a crit on every swing. So his formula is used exactly, capped at a 50% crit
chance from luck: in his range the cap never binds, and at the top a crit stays a
roll. It is applied by rebinding `MOD_dmg_calc_original`, the variable section 8's
probe and incoming-damage wrapper call through, so enemies are sized against the
player with luck included; a wrapper outside it would have let the player
out-damage every target. Measured crit frequency on real swings matches the
model the probe weights by, at luck 0, 10 and 100.

### The rest

- **Breakthrough history** — the last twenty attempts, their odds, where they
  were made and how each ended, on the What next page and in `modRoad()`.
- **Backups once a day** as well as on each update, in a fourth place of their
  own so a quiet week cannot push out the update backups; and **as a file** —
  download any backup, load one back — because clearing the browser's storage
  takes the backups with it.
- **Shop prices** follow the number format. The game writes a stock line once
  through `chs()` and again from inside its own closures after every purchase,
  which cannot be wrapped, so one observer on the choices panel reformats a
  five-digit-or-more number directly before the coin mark, and nothing else.
- **`tests/road.mjs`** checks every rule of the cultivation road, with the dice
  fixed per check. **`tests/basefixes.mjs`** holds the three fixes and the shop
  prices. **`tests/baseline.mjs`** records the numbers that define the balance in
  `tests/baselines/balance.json` and fails on any change; a one-point change to
  the kill dial shows as `enemy.kill: 8 -> 9` and every fight target it moves.


## A changelog you can actually reach

The game has a changelog and already links to it — the version number in the
bottom bar is clickable. Two problems. Nothing about "v470" says "click me",
and the handler is `window.open('/changelog/changelog.html')`, an absolute path
from the *server root*, so it only resolves when the game is served from the
root of a host. From a file:// URL or any subdirectory it 404s, which is how a
local copy usually gets opened.

So there is a labelled `changelog` button in the bar now, and the path is
resolved against `document.baseURI` instead. The version number still works —
its handler is rebound by replacing the node, the game having attached it
anonymously.

The mod's entries live in **`changelog/mod-changelog.html`**, its own file.

They did not start there. The first version prepended them to
`changelog/changelog.html`, above the author's, under a gold header — which
worked, and read well, and meant the mod was editing a file that was not its
own. Splitting them out restores the property the whole design rests on: **the
single script tag in `index.html` is the only change the mod makes to anything
of the author's.** `git diff upstream/main -- changelog/changelog.html` comes back
empty, and CLAUDE.md says to check that before committing.

> **Since the remotes were renamed:** this was `origin/main` when written;
> `origin` is now the fork, so the check is against `upstream/main`. See
> "Repository housekeeping".

The mod's file pins a white background, because the author's sets no colours and
his palette — blue dates, black-backed headers — assumes a white page, so a
browser in dark mode renders half of it unreadable. His file is left with that
problem rather than edited to fix it; it is his to fix.

**Every change from here on gets an entry there.** That is the point of it.

## Circulate Qi comes from the dojo

Three of the four added actions hang off a milestone on a base-game skill.
Circulate Qi did too — Temperance 5 — and that was wrong once section 28 made it
the way into the cultivation system: realms are levelled through Qi Circulation,
and Temperance is trained by throwing your possessions away. An obscure gate on
the most important thing in the mod.

It is granted by clearing the dojo's three tutorial fights instead — the
difficulty select's "Easiest", "Easy" and "Normal", which set `tr1_win`,
`tr2_win` and `tr3_win`. That is the moment the dojo has finished teaching you
to fight, which is the right moment to hand over what the rest hangs off.

A **tick check rather than a milestone**, because the condition is three story
flags rather than a skill level — the same way the base game grants `act.scout`
from a story beat rather than a perk. The flags only go false→true, so it is
one-way, and `giveAction` is a no-op once you hold it.

The skill itself is revealed at the same time. The game only shows a skill once
it first levels, which would otherwise leave you holding an action whose skill
is nowhere on the sheet.

**Temperance keeps a perk at level 5**, now a plain one. Removing the milestone
would have shifted every later index in `skl.rccln.mlstn`, and those indices are
what the save keys its "granted" flags to.

## The bottom bar was covering the panel

The mod's three bar buttons were `display:inline-block`; the game's own are
plain `inline`. Both render 22px tall, but only an inline-block contributes its
full box to the line box — so `#sl` went from 24px to 32px, and since it is
`position:fixed` at `bottom:0`, those 8px came straight off the game screen and
covered the bottom of the panel above it.

Measured rather than guessed: hiding just the three buttons took the bar from
32px back to 24px. Matching the game's own styling fixes it; the check is that
the bar's height is identical with the buttons shown and hidden.

## The added actions are earned now

The four actions this mod adds — Circulate Qi, Forage, Practice Calligraphy,
Endurance Drill — used to be granted 2.5 seconds after load and re-granted on a
5-second timer. A brand-new character therefore had four unexplained abilities
before leaving the tutorial, and the timer existed only to paper over the fact
that loading a save resets every action's `have` to false before rebuilding the
list from the save.

> **Since then:** Circulate Qi moved off Temperance to the dojo's three tutorial
> fights ("Circulate Qi comes from the dojo"), so the Temperance row below is
> history — Temperance 5 is a plain perk now. **Since v4.0** there is a fifth
> action, Closed Door Training, earned at your first cultivation bottleneck.

They are now earned, through the game's own mechanism. `skl.walk` level 1 is
what grants the base game's "Run", from a milestone; `act.scout` comes from a
story beat in the basement. So each added action hangs off a milestone on the
base-game skill it grows out of:

| Skill | Level | Action | Why that skill |
|---|---|---|---|
| Toughness | 4 | Endurance Drill | taking hits teaches you to condition |
| Harvesting | 4 | Forage | gathering teaches you to search |
| Temperance | 5 | Circulate Qi | letting go teaches you to hold |
| Literacy | 8 | Practice Calligraphy | read before you write |

All four are trained by ordinary play: Toughness when you are hit with a slot
unarmoured, Harvesting from area drops, Temperance by discarding possessions,
Literacy by reading.

**Which skills could be used was constrained.** Milestone "granted" flags are
stored by array index, so entries must be appended and their levels must stay
ascending — `tests/audit.mjs` enforces both. Section 3 had already appended
20/25/30/40/50 to Walking, Meditation, Foraging, Patience, Fighting and
Sleeping, so appending anything below 50 to those is impossible, and inserting
at the front would shift every index and re-fire perks the player already had.
Meditation was the obvious thematic home for Circulate Qi and is exactly one of
the blocked ones; Temperance, which had no milestones at all, turned out to be a
better fit anyway.

**Why a milestone rather than a tick watching for the condition.** The
requirement then lives in the skill panel like any other perk, the game
announces it in its own words, and the load ordering is already solved:
milestones re-fire before the action list is rebuilt from the save, so a
replayed grant is harmlessly overwritten a moment later. A save from before the
action was earned simply comes back without it.

Each perk carries a small stat bonus as well, because a perk in this game always
does something and an entry that only granted an action would read as a blank
line in the panel.

`tests/audit.mjs` needed teaching about this: its `snap()` did not track `acts`,
so a perk that granted an action and nothing else counted as doing nothing. With
`acts.length` added it also surfaces a genuine base-game text gap — `walk lv1`
says "AGL +1" and quietly grants Run as well.

## Unrestricted actions, opt-in

One settings checkbox that lets sustained actions run simultaneously and start
anywhere. Off by default: both are deliberate limits, not oversights.

The game enforces one-at-a-time twice over. `activateAct` deactivates whatever
was running, and every action's `activate()` does
`clearInterval(timers.actm); timers.actm = setInterval(...)` — a single shared
slot. Both have to give way.

Nothing is reimplemented. Each action's own `activate`/`deactivate` is wrapped
and the timer **slot** is swapped around the call:

- activate: park whatever is in `timers.actm`, null the slot so the action's own
  `clearInterval` is a no-op, let it run and set `timers.actm` to its interval,
  move that onto the action, put the parked value back.
- deactivate: put the action's own interval into the slot first, so the action's
  own `clearInterval` stops the right one.

That works unmodified for the base game's Run and Investigate as well as the
mod's four, because all six use exactly that shape.

Toggling off is the other half. The click handler reads

```js
if(a.cond()===true && a.id!==global.current_a.id) activateAct(a)
else if(a.id===global.current_a.id) deactivateAct(global.current_a)
```

so only the most recently started action can be clicked off — and with
conditions bypassed the first branch always wins. `activateAct` therefore treats
a click on an already-running action as "stop it", which makes every row a
toggle again.

Turning the box back off stops everything rather than guessing which action to
keep, because the game only understands one.

Two things guarded: a tick running somewhere it was never meant to can throw
(Investigate reads `global.current_l`), and left alone that would fire every
second forever — so `use()` is wrapped and an action that fails five times is
stopped with a message. And `load()` is wrapped to clear the per-action
intervals first, since it sets every `active` flag to false and would otherwise
strand them.

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

> **Since v4.2:** the skill exp box ships at **1** and the coin drop at **0** — the
> original's values. **Since v4.2** there is a fourth row, Number format, a
> select rather than a number box.

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
  *(Superseded: the actions are earned now, and the timer is gone — see "The
  added actions are earned now".)*
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
- Put back the pre-v4.2 pacing: `setXpCurve({vanillaTo: 0})` gives a pure
  geometric curve that reaches 110 in the same time the old one did — the old
  shipped `50 × 1.106^lvl` at a 2x multiplier, and this is the same time budget
  at 1x, so do **not** also set the multiplier to 2 or it runs twice as fast as
  it ever did. `setMoneyDrops(0.15)` puts back the old coin drop. The curve
  setting lasts until the next reload
- Show numbers as the original does: `setNumberFormat('game')`
