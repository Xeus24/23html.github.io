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

Four dials on `MOD_ENEMY`, live in the browser console:

```js
base: 4, rate: 0.02, hpPow: 1.1, tierRate: 0.008
```

The constraint that matters: the game's exp curve is the real limiter, not the
level cap. `expnext = 50 + (lvl+1)^log(9*lvl+1)`, so level 20 costs 13.6M exp
and a passive skill reaches only ~level 14 after 1000 hours. **Tune against
levels 10–22, not against the cap.** Fitting enemies to capped skills made the
late game unwinnable; that mistake is written up in MOD-NOTES.md under
"Balance, fifth pass".

Run `npm test -- realbal` after any balance change. Healthy output is
`kill 2–10 / die 5–42`, tightening monotonically toward the endgame. If "die"
drops to 1–2 anywhere, that area is a coin flip.

## Testing

```sh
npm install && npx playwright install chromium   # once
npm test                                          # everything
./tests/run.sh audit realbal                      # a subset
```

`tests/README.md` explains what each script covers. Note that several of them
**write to the save** — export one first, or run against a copy.

Always finish a change with `node --check mod.js` (`npm run check`) plus the
relevant test script. The mod is ~3,650 lines of wrappers around a codebase
with no types and no module boundaries; the tests are the only safety net.
