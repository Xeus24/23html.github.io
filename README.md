# proto23 — local mod

A mod for [proto23](https://github.com/23html/23html.github.io), a single-file
idle RPG by [truezhangwei](https://github.com/23html). This is a fork; the game
is the author's work and `index.html` is theirs, unchanged apart from one line.

Everything the mod does lives in **`mod.js`**, loaded by a single tag appended
to the bottom of `index.html`:

```html
<!-- local mod: remove this line to disable -->
<script src="mod.js"></script>
```

Delete that line and the game is stock again. `git checkout index.html` also
works, and is the only reason it is the sole change to that file.

## Playing it on the author's site, with nothing to download

Install [Tampermonkey](https://www.tampermonkey.net/) or
[Violentmonkey](https://violentmonkey.github.io/) in your browser — on Safari,
Tampermonkey or the free [Userscripts](https://github.com/quoid/userscripts)
extension — then open
[`userscript/proto23-mod.user.js`](https://raw.githubusercontent.com/Xeus24/23html.github.io/main/userscript/proto23-mod.user.js)
and accept the install. The next time you open
[23html.github.io](https://23html.github.io/), the whole mod runs on it, and your
save there is backed up before the mod first touches it (`modBackups()` in the
console lists the backups). The manager checks the same address for updates.

Turning the userscript off gives you the author's game back, but a save the mod
has written to keeps the mod's extra fields. Download a backup from the saves
panel first if you want to go back and forth.

**On Safari, download a backup now and then.** Safari can clear a site's stored
data when you have not visited it for a while (seven days of browsing, under its
tracking prevention), and the saves and the automatic backups both live there.
A downloaded backup file is the copy that survives it. The mod reminds you, at
most once a day, until you have downloaded one that week.

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
npx http-server -p 8080 -c-1 .
```

`-c-1` disables caching. Without it the browser holds `mod.js` for an hour and
edits appear not to take, which is confusing enough to be worth the flag.

## What it changes

Forty-eight sections, roughly in the order they were built. The design record
for every one of them, including the reasoning and what was measured, is in
[MOD-NOTES.md](MOD-NOTES.md). Version 4.7.

**Measured against the original**

The mod is checked against the author's untouched game: a test loads it twice,
once with `mod.js` blocked, and runs the same measurements on both.

- Skill exp costs **exactly what the original charges below level 10**. That is
  the range he designed — all 22 of his perk ladders end between level 1 and 15.
  From level 10 the cost rises about 3% a level, at a rate solved so level 110
  is reachable in the same time as before. His own curve cannot be kept past
  that: 109→110 alone costs about 10¹⁴ xp.
- Skill exp multiplier 1 and enemy coin drops off, the original's defaults —
  both adjustable in settings.
- **Fights in the author's areas are his**, creature for creature, so you
  out-grow them the way you do in his game. A *Fights* setting switches to
  *Scaled*, where every fight is sized to you.
- Every price the progression asks for is checked against what you can earn
  at that point with no coin drop.

**Progression**

- Skill level caps tied to story progress, 10 through 110.
- Perks at 10/25/50/60/75/90/110 on every skill.
- The dojo's "Level Advancement" ladder carried from level 30 to 110, which is
  what the instructor promises and the base game stops delivering.

**Combat and places**

- An enemy model for everything the mod adds, and for the whole game on the
  *Scaled* setting. It is solved per spawn against your measured power — about
  8 swings to kill, 20 to die — rather than fitted to a level. See the note
  below on why the obvious approach does not work here.
- Three areas past the base game's last — the Sunken Hollow, the Ashen Spire and
  the Long Vigil — opening in order once the golem arena is cleared. An entrance
  to the author's catacombs, the Pill Tower, and the Damp cellar, which he wrote
  and never connected.
- **The rank ladder.** The Power rank under your portrait is computed from your
  stats, and rank 1 was only reachable by taking every single skill to 110. The
  Hall of the First Gate adds ten named challengers, fought in order; beating
  one takes that rank, and the rank you hold floors the rank you are shown
  without ever capping it.
- **Crafting to five stars.** The base game's crafting stops at two in practice.
  Four new rungs add a full set each — weapon, armour, shield, accessory, tonic —
  from twelve gathered materials at four resource nodes that open with the story.

**Cultivation**

- **Ten realms above Mortal**, Qi Refining through Tribulation Transcendence,
  advanced by breaking through a bottleneck. Each is worth a compounding
  multiplier — up to ×6 on every stat and ×8.5 on health and energy.
- **The road between them**, modelled on the genre's own glossary: a Spiritual
  Root rolled once, nine layers to every realm, insight earned by meditating,
  by fights you nearly lost and by going somewhere new, Closed Door Training to
  consolidate and shelter an attempt, Qi Deviation for failing in the open, and
  a Heavenly Tribulation at the top. Each wall is sized to the climb to it:
  about 5% of the time it took.
- Six elemental mastery skills whose techniques fire during combat.
- Your realm sits on the rank line, and at a bottleneck it is the breakthrough
  button.

**Skills, titles and items**

- Skills of the mod's own, five earned actions, and effects for the skills and
  affinities the base game left inert.
- **Skill rarity** — ten grades, from the level you have taken a skill to —
  shown in the list and tooltips, with a sort and a filter.
- **Folding.** A Jade Slip folds a skill into its section; fold a whole section
  and it is one line. Folded skills keep every level, perk and buff.
- Title ranks 1–10, derived from the level that earns the title rather than
  assigned by feel; five titles per skill; titles that do something, worn or
  made passive by Renown; and four of the author's unfinished titles finished.
- Selling, with anything that is the only way to unlock something protected.
- Three bugs in the author's own code fixed: the Death skill made dying cost
  *more* energy as it levelled, Shield Mastery could turn your defence into
  extra damage taken, and luck never reached the crit roll.

**Quality of life**

- Three save slots, with a "start new save" button, and **automatic backups**:
  before a new version of the mod loads, every slot is copied first, and again
  once a day. The saves panel restores any of them, or downloads it as a file.
- A **Pacing** setting — *Original* (the default) or *Mod before 4.2*, the
  faster pacing and scaled fights the mod had before it was matched to the
  original, kept as a legacy option.
- **Settings travel with the save**: a new browser or device takes them from it,
  and one with settings of its own keeps those.
- Settings boxes for game speed, skill exp, coin drops and **number format** —
  short (4.56M), scientific, myriads (5.6亿) or as the original. Up to 9,999
  every format prints exactly what the original prints.
- An optional "unrestricted actions" toggle — several actions at once, started
  anywhere. Off by default; both are deliberate limits.
- Collapsible skill sections, live effect descriptions, and a title picker
  grouped by skill.
- **A wiki**, on the bottom bar and in settings. Fifteen pages covering every
  skill, area, item, title, action and realm, generated from the live game data
  each time it opens and reading your save — including a skill handbook and a
  **What next** page that says what you can do right now.

Every change is logged in `changelog/mod-changelog.html`, reachable in game from
the `changelog` button in the bottom bar. The version number next to it opens the
game's own changelog, which the mod does not touch.

## The one thing to know before changing anything

`dmg_calc` is **subtractive in both directions**: an attack does
`attacker.str − defender.str`. A defender's STR *is* their armour. So scaling an
enemy's STR raises its offence and its armour together, and once that armour
passes your STR your damage does not get small — it clamps to zero.

An earlier version of the mod did exactly that, fitted with a grid search scored
on `enemyHP / playerSTR`, a ratio that ignores the subtraction entirely.
Measured through the game's real combat math, the tutorial needed 63,000 swings
and killed you in one, and every tier from the southern forest onward was
kill-in-1 / die-in-1. Judge a fight by driving `dmg_calc` and `hit_calc`, never
by a stat ratio.

## Tests

```bash
npm install && npx playwright install chromium   # once
npm test                                          # all 42 scripts, four at a time
./tests/run.sh audit combat                       # a subset
JOBS=1 npm test                                   # one at a time, output live
BROWSER=webkit npm test                           # on Safari's engine (npx playwright install webkit)
```

They drive a real browser against a served copy of the game, so they test the
actual thing rather than a model of it. [tests/README.md](tests/README.md)
explains what each one covers. The broadest is `allareas.mjs`: every area, every
creature, both ends of every level band, ten story tiers, four skill builds —
3,720 matchups, all of which must be winnable. `vanilla.mjs` holds the mod to
the original game wherever it claims to match it, and `baseline.mjs` keeps the
numbers that define the balance in a committed file, so any change to them shows
up as a diff. `fights.mjs` holds the author's areas to his page spawn for spawn,
and `econ.mjs` holds every required price to what that stage pays.

The same suite runs on GitHub for every push and pull request, on Chromium and on
WebKit (the engine Safari is built on), along with a check that the author's
files are untouched (`tests/authorfiles.sh`).

**Several tests write to the save.** Export one first, or run them against a
copy of the folder.

## Layout

| | |
|---|---|
| `mod.js` | the entire mod, ~13,800 lines |
| `userscript/` | the mod as a userscript for the hosted game — generated, `npm run build:userscript` |
| `tools/` | the userscript build |
| `MOD-NOTES.md` | the design record, section by section, with the reasoning |
| `CLAUDE.md` | the constraints that are easy to violate by accident |
| `tests/` | 42 Playwright scripts, `lib/stats.mjs`, the balance baseline, `authorfiles.sh` |
| `.github/workflows/` | the suite on every push and pull request |
| `changelog/mod-changelog.html` | what changed, every time |
| `index.html` | the author's game, plus one script tag — the only edit to anything of his |

The checkout's `origin` is this fork; the author's repository is `upstream`.

## Credit

The game is truezhangwei's. Everything in `mod.js`, `userscript/`, `tools/`,
`tests/`, `MOD-NOTES.md` and this file is a modification of it, and none of it
is endorsed by the author. The userscript runs on the author's site in your own
browser; it changes nothing on the site itself.
