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

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
npx http-server -p 8080 -c-1 .
```

`-c-1` disables caching. Without it the browser holds `mod.js` for an hour and
edits appear not to take, which is confusing enough to be worth the flag.

## What it changes

Twenty-seven sections, roughly in the order they were built. The design record
for every one of them, including the reasoning and what was measured, is in
[MOD-NOTES.md](MOD-NOTES.md).

**Progression**

- Skill level caps tied to story progress, 10 through 110, rather than one flat
  ceiling.
- A geometric skill exp curve, replacing the base game's. Its own was
  super-exponential — level 109→110 alone cost 1.16e14 xp, making the top of
  the ladder unreachable by a factor of about 10¹³. Level 110 now takes roughly
  six months of steady play at 1× speed.
- Perks at 10/25/50/60/75/90/110 on every skill. 81 of 94 skills previously
  gave nothing at all between level 51 and 110.
- The dojo's "Level Advancement" ladder carried from level 30 to 110, which is
  what the instructor promises and the base game stops delivering.

**Combat**

- Enemy scaling rewritten. It is solved per spawn against your actual power —
  about 8 swings to kill, 20 to die — rather than fitted to a level. See the
  note below on why the obvious approach does not work here.
- Three areas past the base game's last: the Sunken Hollow, the Ashen Spire and
  the Long Vigil, opening in order once the golem arena is cleared.

**Skills, titles and items**

- Four new skills with paired actions, each earned from a milestone on the
  base-game skill it grows out of.
- Title ranks 1–10, derived from the level that earns the title rather than
  assigned by feel; five titles per skill; and titles that do something, worn
  or made passive by Renown.
- Selling, enemy coin drops, and effects for the skills and affinities the base
  game left inert.

**Quality of life**

- Three save slots, with a "start new save" button.
- Game speed, skill xp and coin-drop multipliers as settings boxes.
- An optional "unrestricted actions" toggle — several actions at once, started
  anywhere. Off by default; both are deliberate limits.
- Collapsible skill sections, live effect descriptions, and a title picker
  grouped by skill.

Changes are also logged in the game's own changelog, reachable from the
`changelog` button in the bottom bar.

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
npm test                                          # all 19 scripts
./tests/run.sh audit combat                       # a subset
```

They drive a real browser against a served copy of the game, so they test the
actual thing rather than a model of it. [tests/README.md](tests/README.md)
explains what each one covers. The broadest is `allareas.mjs`: every area, every
creature, both ends of every level band, ten story tiers, three skill builds —
2,490 matchups, all of which must be winnable.

**Several tests write to the save.** Export one first, or run them against a
copy of the folder.

## Layout

| | |
|---|---|
| `mod.js` | the entire mod, ~5,800 lines |
| `MOD-NOTES.md` | the design record, section by section, with the reasoning |
| `CLAUDE.md` | the constraints that are easy to violate by accident |
| `tests/` | 19 Playwright scripts |
| `index.html` | the author's game, plus one script tag |

## Credit

The game is truezhangwei's. Everything in `mod.js`, `tests/`, `MOD-NOTES.md` and
this file is a modification of it, and none of it is endorsed by the author.
