/* ===========================================================================
   Proto23 — local mod
   ---------------------------------------------------------------------------
   Loaded as a plain <script> AFTER the game's own script, so it shares the
   same global scope (the game declares everything with `var` at top level).

   Contents:
     1. Speed control      — setSpeed(n) / getSpeed(), persisted
     2. Skill XP multiplier — 2x by default, setSkillXp(n) to change
     3. Extended milestones — perks past the original lv ~15 ceiling
     4. New skills + actions — Qi Circulation, Foraging, Calligraphy,
                               Conditioning, each with a sustained action

   SAVE COMPATIBILITY — why things are done the way they are:
     * The game saves milestone "already granted" flags BY ARRAY INDEX
       (save: `mst[m] = mlstn[m].g`). So milestones are only ever APPENDED,
       never inserted. Inserting would shift the indices and silently mark
       the wrong perks as granted.
     * On load the game re-fires any milestone whose level is <= your current
       skill level and isn't flagged granted. So appended milestones are
       awarded retroactively on an existing save. That's by design here.
     * The game saves each skill's exp and `p` POSITIONALLY over `for..in skl`.
       New skills are therefore added at the END of the `skl` object, which is
       what happens naturally since this file runs after the game script.
     * Actions are saved by id, not position, so new actions are safe.

   To disable everything: remove the <script src="mod.js"> line from
   index.html. Nothing else in the game was modified.
   =========================================================================== */

console.log('[mod] loading');

var MOD = {
  version: '3.0',    // v2.0: the ~100 "discovered by playing" skills consolidated
                     // to 10; per-stat effect budget unchanged. Survivors keep
                     // their v1 id, so v1 saves still LOAD — merged-away skills
                     // just don't restore. See "Balance, sixth pass" in
                     // MOD-NOTES for the save-compat analysis.
                     // v2.1: enemy scaling rewritten. It was multiplying the
                     // wrong fields — enemy STR is armour in dmg_calc, so
                     // scaling it clamped your damage to zero. Save format
                     // untouched. See "Balance, eighth pass".
                     // v2.2: three save slots, the added actions are earned
                     // rather than given, an unrestricted-actions toggle, and
                     // perks filled in across the whole level ladder.
                     // v2.3: title ranks 1-10 derived from the level that earns
                     // them, five titles per skill, and titles that actually do
                     // something — worn, or passive once renown covers the rank.
                     // v2.4: the dojo's Level Advancement ladder carried to
                     // character level 110, with spirit pills and skillbooks
                     // scaled to match.
                     // v2.5: the mod's changelog split into its own file, so
                     // the script tag is the only edit to the author's files.
                     // v2.6: cultivation realms with breakthroughs, and six
                     // elemental mastery skills whose techniques fire in combat.
                     // v2.7: Circulate Qi unlocked by the dojo's tutorial fights
                     // rather than by Temperance 5.
                     // v2.8: breakthrough pills given a source — they had none,
                     // so the realm ladder was unreachable in play.
                     // v2.9: the catacombs wired up (26 of the author's rooms,
                     // previously unreachable) and the Pill Tower built.
                     // Changes are listed in changelog/changelog.html.
  speed_key: 'p23_mod_speed',
  skill_xp_mult: 2,     // change with setSkillXp(n)
  max_speed: 20
};


/* ===========================================================================
   1. SPEED CONTROL
   ---------------------------------------------------------------------------
   The main loop is self-rescheduling:
       setTimeout(function(){update();ontick();}, 1000/global.fps)
   and combat uses the same divisor. So raising global.fps speeds up ticks,
   skill xp, and combat together. Default is 1.

   Sustained actions run on their own fixed 1000ms timer (timers.actm), so
   setSpeed also re-arms a running action at the new rate — otherwise actions
   would stay at 1/sec while everything else sped up.
   =========================================================================== */

function setSpeed(n) {
  n = Number(n);
  if (!isFinite(n) || n <= 0) {
    console.warn('[mod] setSpeed: pass a positive number, e.g. setSpeed(3)');
    return getSpeed();
  }
  if (n > MOD.max_speed) {
    console.warn('[mod] setSpeed: capping at ' + MOD.max_speed + 'x');
    n = MOD.max_speed;
  }

  global.fps = n;

  try { localStorage.setItem(MOD.speed_key, String(n)); } catch (e) { /* private mode */ }

  // Re-arm a running sustained action so it matches the new speed.
  try {
    if (typeof global.current_a !== 'undefined' &&
        global.current_a && global.current_a.active &&
        global.current_a !== act.default) {
      clearInterval(timers.actm);
      timers.actm = setInterval(function () { global.current_a.use(); }, 1000 / global.fps);
    }
  } catch (e) {
    console.warn('[mod] could not re-arm action timer: ' + e.message);
  }

  if (typeof msg === 'function') msg('Game speed: ' + n + 'x', 'gold');
  console.log('[mod] speed = ' + n + 'x');
  return n;
}

function getSpeed() { return global.fps; }

function resetSpeed() { return setSpeed(1); }

// Restore the saved speed. Applied before the loop's first tick because this
// file runs at the end of the game script's own execution.
(function () {
  try {
    var saved = localStorage.getItem(MOD.speed_key);
    if (saved) {
      var v = Number(saved);
      if (isFinite(v) && v > 0) global.fps = Math.min(v, MOD.max_speed);
    }
  } catch (e) { /* ignore */ }
})();


/* ===========================================================================
   2. SKILL XP MULTIPLIER
   ---------------------------------------------------------------------------
   Original: giveSkExp(skl, exp, res) { exp = res===false ? exp : exp*skl.p; ... }

   `skl.p` is restored from the save file, so editing the Skill constructor's
   default `p` would be overwritten on load. Wrapping the function instead
   keeps the multiplier save-independent and stacks multiplicatively with the
   in-game "+x% EXP Gain" perks.

   The original recurses as giveSkExp(skl, extra, false) to carry level-up
   overflow. res===false means "already multiplied", so the wrapper correctly
   skips those and never double-counts.
   =========================================================================== */

var MOD_giveSkExp_original = giveSkExp;

giveSkExp = function (sk, exp, res) {
  if (res !== false) exp = exp * MOD.skill_xp_mult;
  return MOD_giveSkExp_original(sk, exp, res);
};

function setSkillXp(n) {
  n = Number(n);
  if (!isFinite(n) || n <= 0) {
    console.warn('[mod] setSkillXp: pass a positive number, e.g. setSkillXp(2)');
    return MOD.skill_xp_mult;
  }
  MOD.skill_xp_mult = n;
  if (typeof msg === 'function') msg('Skill EXP gain: ' + n + 'x', 'gold');
  console.log('[mod] skill xp = ' + n + 'x');
  return n;
}

function getSkillXp() { return MOD.skill_xp_mult; }


/* ===========================================================================
   3. EXTENDED MILESTONES
   ---------------------------------------------------------------------------
   Most skills stop granting perks around lv 10-15. These add tiers at
   20/25/30/40/50.

   Stat fields used here are the ones the game's own stat_r() reads:
     you.stra / inta / agla / spda / hpa / sata   flat additive bonuses
     you.strm / intm / aglm / spdm / hpm / satm   multipliers (default 1)
     you.exp_t                                    global exp gain
     you.stat_p[0..3]                             growth potential: HP/STR/AGL/INT
     you.mods.sbonus                              energy effectiveness
     you.mods.cpwr                                critical damage
     skl.<x>.p                                    that skill's xp multiplier
   Every entry calls you.stat_r() after touching stats, as the originals do.
   =========================================================================== */

function MOD_addMilestones(sk, list) {
  if (!sk) return false;
  if (!sk.mlstn) sk.mlstn = [];
  for (var i = 0; i < list.length; i++) sk.mlstn.push(list[i]);
  return true;
}

// Fresh objects per call — `g` is mutated per skill, so arrays must not be shared.
function MOD_masteryTiers() {
  return [
    { lv: 20, f: function () { you.stra += 3; you.stat_r(); }, g: false,
      p: "STR +3" },
    { lv: 25, f: function () { you.agla += 3; you.exp_t += 0.05; you.stat_r(); }, g: false,
      p: "AGL +3, EXP Gain +5%" },
    { lv: 30, f: function () { you.stra += 4; you.mods.cpwr += 0.15; you.stat_r(); }, g: false,
      p: "STR +4, Critical Damage +15%" },
    { lv: 40, f: function () { you.stra += 6; you.agla += 4; you.stat_p[1] += 0.08; you.stat_r(); }, g: false,
      p: "STR +6, AGL +4, STR Growth Potential +8%" },
    { lv: 50, f: function () { you.strm += 0.10; you.exp_t += 0.10; skl.fgt.p += 0.15; you.stat_r(); }, g: false,
      p: "STR Multiplier +10%, EXP Gain +10%, Fighting EXP Gain +15%" }
  ];
}

// --- weapon masteries -------------------------------------------------------
['unc', 'srdc', 'knfc', 'axc', 'plrmc', 'hmrc', 'stfc', 'shdc', 'bwc', 'twoh']
  .forEach(function (key) { MOD_addMilestones(skl[key], MOD_masteryTiers()); });

// --- Fighting: the parent skill, so a stronger curve ------------------------
MOD_addMilestones(skl.fgt, [
  { lv: 20, f: function () { you.stra += 4; you.exp_t += 0.08; you.stat_r(); }, g: false,
    p: "STR +4, EXP Gain +8%" },
  { lv: 25, f: function () {
      ['unc','srdc','knfc','axc','plrmc','stfc','bwc','hmrc'].forEach(function(k){ if(skl[k]) skl[k].p += 0.15; });
      you.stat_r();
    }, g: false, p: "All Masteries EXP Gain +15%" },
  { lv: 30, f: function () { you.stra += 5; you.hpa += 100; you.mods.sbonus += 0.03; you.stat_r(); }, g: false,
    p: "STR +5, HP +100, Energy Effectiveness +3%" },
  { lv: 40, f: function () { you.stra += 8; you.agla += 6; you.stat_p[1] += 0.10; you.stat_p[0] += 0.10; you.stat_r(); }, g: false,
    p: "STR +8, AGL +6, STR & HP Growth Potential +10%" },
  { lv: 50, f: function () {
      you.strm += 0.15; you.hpm += 0.10; you.exp_t += 0.15;
      ['unc','srdc','knfc','axc','plrmc','stfc','bwc','hmrc'].forEach(function(k){ if(skl[k]) skl[k].p += 0.25; });
      you.stat_r();
    }, g: false, p: "STR Multiplier +15%, HP Multiplier +10%, EXP Gain +15%, All Masteries EXP Gain +25%" }
]);

// --- lifestyle / daily skills ----------------------------------------------
MOD_addMilestones(skl.sleep, [
  { lv: 20, f: function () { you.hpa += 150; you.stat_r(); }, g: false, p: "HP +150" },
  { lv: 25, f: function () { you.sata += 150; you.mods.sbonus += 0.04; you.stat_r(); }, g: false,
    p: "Max Energy +150, Energy Effectiveness +4%" },
  { lv: 30, f: function () { you.hpa += 200; you.exp_t += 0.05; you.stat_r(); }, g: false,
    p: "HP +200, EXP Gain +5%" },
  { lv: 40, f: function () { you.hpm += 0.10; you.stat_p[0] += 0.12; you.stat_r(); }, g: false,
    p: "HP Multiplier +10%, HP Growth Potential +12%" },
  { lv: 50, f: function () { you.hpm += 0.15; you.satm += 0.15; you.exp_t += 0.10; you.stat_r(); }, g: false,
    p: "HP & Max Energy Multipliers +15%, EXP Gain +10%" }
]);

MOD_addMilestones(skl.walk, [
  { lv: 20, f: function () { you.spda += 2; you.agla += 2; you.stat_r(); }, g: false, p: "SPD +2, AGL +2" },
  { lv: 25, f: function () { you.agla += 4; you.exp_t += 0.04; you.stat_r(); }, g: false,
    p: "AGL +4, EXP Gain +4%" },
  { lv: 30, f: function () { you.spda += 3; you.stat_p[2] += 0.08; you.stat_r(); }, g: false,
    p: "SPD +3, AGL Growth Potential +8%" },
  { lv: 40, f: function () { you.aglm += 0.10; you.mods.sbonus += 0.04; you.stat_r(); }, g: false,
    p: "AGL Multiplier +10%, Energy Effectiveness +4%" },
  { lv: 50, f: function () { you.spdm += 0.15; you.aglm += 0.10; you.exp_t += 0.10; you.stat_r(); }, g: false,
    p: "SPD Multiplier +15%, AGL Multiplier +10%, EXP Gain +10%" }
]);

MOD_addMilestones(skl.mdt, [
  { lv: 20, f: function () { you.inta += 4; you.stat_r(); }, g: false, p: "INT +4" },
  { lv: 25, f: function () { you.inta += 5; you.exp_t += 0.06; you.stat_r(); }, g: false,
    p: "INT +5, EXP Gain +6%" },
  { lv: 30, f: function () { you.inta += 6; you.stat_p[3] += 0.10; you.stat_r(); }, g: false,
    p: "INT +6, INT Growth Potential +10%" },
  { lv: 40, f: function () { you.intm += 0.12; if (skl.ptnc) skl.ptnc.p += 0.20; you.stat_r(); }, g: false,
    p: "INT Multiplier +12%, Patience EXP Gain +20%" },
  { lv: 50, f: function () { you.intm += 0.18; you.exp_t += 0.12; you.stat_r(); }, g: false,
    p: "INT Multiplier +18%, EXP Gain +12%" }
]);

MOD_addMilestones(skl.glt, [
  { lv: 20, f: function () { you.sata += 200; you.stat_r(); }, g: false, p: "Max Energy +200" },
  { lv: 25, f: function () { you.hpa += 100; you.sata += 200; you.stat_r(); }, g: false,
    p: "HP +100, Max Energy +200" },
  { lv: 30, f: function () { you.satm += 0.10; you.mods.sbonus += 0.05; you.stat_r(); }, g: false,
    p: "Max Energy Multiplier +10%, Energy Effectiveness +5%" },
  { lv: 40, f: function () { you.hpm += 0.10; you.satm += 0.12; you.stat_r(); }, g: false,
    p: "HP Multiplier +10%, Max Energy Multiplier +12%" },
  { lv: 50, f: function () { you.satm += 0.20; you.stat_p[0] += 0.15; you.exp_t += 0.08; you.stat_r(); }, g: false,
    p: "Max Energy Multiplier +20%, HP Growth Potential +15%, EXP Gain +8%" }
]);

MOD_addMilestones(skl.gred, [
  { lv: 20, f: function () { you.inta += 3; you.exp_t += 0.04; you.stat_r(); }, g: false,
    p: "INT +3, EXP Gain +4%" },
  { lv: 25, f: function () { if (skl.trad) skl.trad.p += 0.20; you.inta += 3; you.stat_r(); }, g: false,
    p: "INT +3, Trading EXP Gain +20%" },
  { lv: 30, f: function () { you.inta += 5; you.exp_t += 0.06; you.stat_r(); }, g: false,
    p: "INT +5, EXP Gain +6%" },
  { lv: 40, f: function () { you.intm += 0.10; you.stat_p[3] += 0.08; you.stat_r(); }, g: false,
    p: "INT Multiplier +10%, INT Growth Potential +8%" },
  { lv: 50, f: function () { you.intm += 0.15; you.exp_t += 0.12; you.stat_r(); }, g: false,
    p: "INT Multiplier +15%, EXP Gain +12%" }
]);

MOD_addMilestones(skl.ptnc, [
  { lv: 20, f: function () { if (skl.mdt) skl.mdt.p += 0.25; you.inta += 2; you.stat_r(); }, g: false,
    p: "INT +2, Meditation EXP Gain +25%" },
  { lv: 25, f: function () { you.exp_t += 0.06; you.inta += 3; you.stat_r(); }, g: false,
    p: "INT +3, EXP Gain +6%" },
  { lv: 30, f: function () { if (skl.mdt) skl.mdt.p += 0.30; you.stat_p[3] += 0.08; you.stat_r(); }, g: false,
    p: "Meditation EXP Gain +30%, INT Growth Potential +8%" },
  { lv: 40, f: function () { you.intm += 0.10; you.exp_t += 0.08; you.stat_r(); }, g: false,
    p: "INT Multiplier +10%, EXP Gain +8%" },
  { lv: 50, f: function () { you.intm += 0.15; you.exp_t += 0.15; you.stat_r(); }, g: false,
    p: "INT Multiplier +15%, EXP Gain +15%" }
]);

// --- crafting ---------------------------------------------------------------
['cook', 'crft', 'alch', 'tlrng'].forEach(function (key) {
  MOD_addMilestones(skl[key], [
    { lv: 20, f: function () { you.inta += 3; you.stat_r(); }, g: false, p: "INT +3" },
    { lv: 25, f: function () { you.inta += 3; you.exp_t += 0.05; you.stat_r(); }, g: false,
      p: "INT +3, EXP Gain +5%" },
    { lv: 30, f: function () { you.inta += 4; you.stat_p[3] += 0.08; you.stat_r(); }, g: false,
      p: "INT +4, INT Growth Potential +8%" },
    { lv: 40, f: function () { you.intm += 0.10; you.exp_t += 0.08; you.stat_r(); }, g: false,
      p: "INT Multiplier +10%, EXP Gain +8%" },
    { lv: 50, f: function () { you.intm += 0.15; you.exp_t += 0.12; you.stat_r(); }, g: false,
      p: "INT Multiplier +15%, EXP Gain +12%" }
  ]);
});

// --- gathering --------------------------------------------------------------
['hvt', 'glg', 'mng'].forEach(function (key) {
  MOD_addMilestones(skl[key], [
    { lv: 20, f: function () { you.stra += 2; you.stat_r(); }, g: false, p: "STR +2" },
    { lv: 25, f: function () { you.stra += 2; you.sata += 100; you.stat_r(); }, g: false,
      p: "STR +2, Max Energy +100" },
    { lv: 30, f: function () { you.stra += 3; you.exp_t += 0.05; you.stat_r(); }, g: false,
      p: "STR +3, EXP Gain +5%" },
    { lv: 40, f: function () { you.strm += 0.08; you.mods.sbonus += 0.04; you.stat_r(); }, g: false,
      p: "STR Multiplier +8%, Energy Effectiveness +4%" },
    { lv: 50, f: function () { you.strm += 0.12; you.exp_t += 0.10; you.stat_r(); }, g: false,
      p: "STR Multiplier +12%, EXP Gain +10%" }
  ]);
});


/* ===========================================================================
   4. NEW SKILLS + ACTIONS
   ---------------------------------------------------------------------------
   Four skills filling gaps in the original taxonomy:
     Qi Circulation (type 4)  the game is cultivation-inspired but had no qi skill
     Foraging       (type 8)  gathering had mining/harvesting but no wild foraging
     Calligraphy    (type 5)  crafting had no writing, despite books and Reading
     Conditioning   (type 2)  sits with Toughness as a pure physical-training skill

   Skills appear in the UI the first time they level, which is the game's own
   behaviour (giveSkExp pushes to you.skls on level up).

   Each skill is paired with a sustained action. Only one sustained action can
   run at a time — the game uses a single shared timer (timers.actm).
   =========================================================================== */

var MOD_SKILL_TIERS = function (statA, statM, potIdx, label, labelM) {
  return [
    { lv: 2,  f: function () { you[statA] += 1; you.stat_r(); }, g: false, p: label + " +1" },
    { lv: 5,  f: function () { you[statA] += 2; you.exp_t += 0.02; you.stat_r(); }, g: false,
      p: label + " +2, EXP Gain +2%" },
    { lv: 10, f: function () { you[statA] += 3; you.mods.sbonus += 0.02; you.stat_r(); }, g: false,
      p: label + " +3, Energy Effectiveness +2%" },
    { lv: 15, f: function () { you[statA] += 4; you.exp_t += 0.05; you.stat_r(); }, g: false,
      p: label + " +4, EXP Gain +5%" },
    { lv: 20, f: function () { you[statA] += 5; you.stat_p[potIdx] += 0.08; you.stat_r(); }, g: false,
      p: label + " +5, " + label + " Growth Potential +8%" },
    { lv: 25, f: function () { you[statM] += 0.08; you.exp_t += 0.06; you.stat_r(); }, g: false,
      p: labelM + " +8%, EXP Gain +6%" },
    { lv: 30, f: function () { you[statA] += 8; you.mods.sbonus += 0.04; you.stat_r(); }, g: false,
      p: label + " +8, Energy Effectiveness +4%" },
    { lv: 40, f: function () { you[statM] += 0.12; you.stat_p[potIdx] += 0.10; you.stat_r(); }, g: false,
      p: labelM + " +12%, " + label + " Growth Potential +10%" },
    { lv: 50, f: function () { you[statM] += 0.18; you.exp_t += 0.15; you.stat_r(); }, g: false,
      p: labelM + " +18%, EXP Gain +15%" }
  ];
};

var MOD_SEP = (typeof dom !== 'undefined' && dom.dseparator) ? dom.dseparator : '<br>';

// --- Qi Circulation ---------------------------------------------------------
skl.qic = new Skill(); skl.qic.id = 901; skl.qic.type = 4;
skl.qic.name = 'Qi Circulation';
skl.qic.desc = 'Guiding internal energy along its meridians' + MOD_SEP +
  '<small style="color:darkorange">Sharpens mental acuity and energy efficiency</small>';
skl.qic.mlstn = MOD_SKILL_TIERS('inta', 'intm', 3, 'INT', 'INT Multiplier');

// --- Foraging ---------------------------------------------------------------
skl.frg = new Skill(); skl.frg.id = 902; skl.frg.type = 8;
skl.frg.name = 'Foraging';
skl.frg.desc = 'An eye for what grows wild and what of it is edible' + MOD_SEP +
  '<small style="color:darkorange">Better yields when searching the wilds</small>';
skl.frg.mlstn = MOD_SKILL_TIERS('inta', 'intm', 3, 'INT', 'INT Multiplier');

// --- Calligraphy ------------------------------------------------------------
skl.clg = new Skill(); skl.clg.id = 903; skl.clg.type = 5;
skl.clg.name = 'Calligraphy';
skl.clg.desc = 'Control of brush and ink, and the patience it demands' + MOD_SEP +
  '<small style="color:darkorange">Steadies the hand and the mind</small>';
skl.clg.mlstn = MOD_SKILL_TIERS('inta', 'intm', 3, 'INT', 'INT Multiplier');

// --- Conditioning -----------------------------------------------------------
skl.cnd = new Skill(); skl.cnd.id = 904; skl.cnd.type = 2;
skl.cnd.name = 'Conditioning';
skl.cnd.bname = 'Physical Conditioning';
skl.cnd.desc = 'Hard-won physical resilience' + MOD_SEP +
  '<small style="color:darkorange">Raises strength and stamina</small>';
skl.cnd.mlstn = MOD_SKILL_TIERS('stra', 'strm', 1, 'STR', 'STR Multiplier');


/* --- Actions ---------------------------------------------------------------
   Shared shape, modelled on the game's own act.demo ("Run"):
     type 1     = sustained (toggle on, ticks until toggled off)
     cond(l)    = may it run here? l===false means "don't print a reason"
     activate() = claim the shared action timer, apply any effects
     use()      = one tick of work
     deactivate() = release the timer, undo effects
   -------------------------------------------------------------------------- */

function MOD_startAction(self, ms) {
  self.active = true;
  clearInterval(timers.actm);
  timers.actm = setInterval(function () { self.use(); }, (ms || 1000) / (global.fps || 1));
}

function MOD_stopAction(self, text) {
  msg(text || 'You stop', 'skyblue');
  clearInterval(timers.actm);
  self.active = false;
}

// Quiet conditions: not mid-fight, not asleep, not reading, not working.
function MOD_baseCond(l, reason) {
  if (!global.flags.btl && global.flags.civil && !global.flags.sleepmode &&
      !global.flags.rdng && !global.flags.work) return true;
  if (l !== false) msg(reason || 'You\'re too occupied with something else', 'red');
  return false;
}

// --- Circulate Qi -----------------------------------------------------------
act.mod_qi = new Action(); act.mod_qi.id = 901; act.mod_qi.type = 1;
act.mod_qi.name = 'Circulate Qi';
act.mod_qi.desc = function () {
  return 'Sit and guide your energy through its channels' + MOD_SEP +
    '<span style="color:pink">Exp +0.4/s</span><br>' +
    '<span style="color:skyblue">Trains Qi Circulation and Meditation</span>';
};
act.mod_qi.cond = function (l) {
  return MOD_baseCond(l, 'You cannot settle enough to circulate your qi right now');
};
act.mod_qi.use = function () {
  giveExp(0.4, true, true);
  giveSkExp(skl.qic, 0.9);
  if (skl.mdt) giveSkExp(skl.mdt, 0.35);
  if (skl.ptnc) giveSkExp(skl.ptnc, 0.2);
};
act.mod_qi.activate = function () {
  msg('You settle and begin circulating your qi', 'plum');
  MOD_startAction(this);
};
act.mod_qi.deactivate = function () {
  MOD_stopAction(this, 'Your qi settles');
};

// --- Forage -----------------------------------------------------------------
act.mod_forage = new Action(); act.mod_forage.id = 902; act.mod_forage.type = 1;
act.mod_forage.name = 'Forage';
act.mod_forage.desc = function () {
  return 'Search the area for anything edible or useful' + MOD_SEP +
    '<span style="color:pink">Exp +0.4/s</span><br>' +
    '<span style="color:skyblue">Trains Foraging</span><br>' +
    '<span style="color:crimson">Energy Consumption +0.05/s</span>';
};
act.mod_forage.cond = function (l) {
  if (global.flags.inside) {
    if (l !== false) msg('There is nothing to forage indoors', 'red');
    return false;
  }
  if (global.flags.isdark && typeof cansee === 'function' && !cansee()) {
    if (l !== false) msg('It is too dark to find anything', 'red');
    return false;
  }
  return MOD_baseCond(l, 'This isn\'t the place to go rooting around');
};
act.mod_forage.use = function () {
  giveExp(0.4, true, true);
  giveSkExp(skl.frg, 1.0);

  // Find rate scales with the skill; items are existing ones, nothing new added.
  var chance = MOD_forageChance(skl.frg.lvl);
  if (random() < chance) {
    var pool = [item.hrb1, item.mshr, item.appl, item.stthbm2].filter(Boolean);
    if (pool.length) {
      var found = pool[(random() * pool.length) << 0];
      msg('You find something growing nearby', 'springgreen');
      giveItem(found, 1);
    }
  }
};
act.mod_forage.activate = function () {
  msg('You start searching the undergrowth', 'springgreen');
  you.mods.sdrate += 0.05;
  MOD_startAction(this);
};
act.mod_forage.deactivate = function () {
  you.mods.sdrate -= 0.05;
  MOD_stopAction(this, 'You stop searching');
};

// --- Practice Calligraphy ---------------------------------------------------
act.mod_calli = new Action(); act.mod_calli.id = 903; act.mod_calli.type = 1;
act.mod_calli.name = 'Practice Calligraphy';
act.mod_calli.desc = function () {
  return 'Grind ink and work through your strokes' + MOD_SEP +
    '<span style="color:pink">Exp +0.5/s</span><br>' +
    '<span style="color:skyblue">Trains Calligraphy and Patience</span>';
};
act.mod_calli.cond = function (l) {
  if (global.flags.isdark && typeof cansee === 'function' && !cansee()) {
    if (l !== false) msg('You cannot see your own brushwork', 'red');
    return false;
  }
  return MOD_baseCond(l, 'Not somewhere you can lay out ink and paper');
};
act.mod_calli.use = function () {
  giveExp(0.5, true, true);
  giveSkExp(skl.clg, 0.85);
  if (skl.rdg) giveSkExp(skl.rdg, 0.3);
  if (skl.ptnc) giveSkExp(skl.ptnc, 0.3);
};
act.mod_calli.activate = function () {
  msg('You grind ink and take up the brush', 'khaki');
  MOD_startAction(this);
};
act.mod_calli.deactivate = function () {
  MOD_stopAction(this, 'You set the brush down');
};

// --- Endurance Drill --------------------------------------------------------
act.mod_cond = new Action(); act.mod_cond.id = 904; act.mod_cond.type = 1;
act.mod_cond.name = 'Endurance Drill';
act.mod_cond.desc = function () {
  return 'Work your body to its limit and past it' + MOD_SEP +
    '<span style="color:pink">Exp +0.6/s</span><br>' +
    '<span style="color:skyblue">Trains Conditioning, Toughness and Walking</span><br>' +
    '<span style="color:crimson">Energy Consumption +0.15/s</span>';
};
act.mod_cond.cond = function (l) {
  if (global.flags.inside) {
    if (l !== false) msg('Not enough room in here for that', 'red');
    return false;
  }
  return MOD_baseCond(l, 'This isn\'t the place to drill');
};
act.mod_cond.use = function () {
  giveExp(0.6, true, true);
  // Rewards eating first, the same way act.demo ("Run") does.
  if (you.sat > 0) {
    giveSkExp(skl.cnd, 1.2);
    if (skl.tghs) giveSkExp(skl.tghs, 0.4);
    if (skl.walk) giveSkExp(skl.walk, 0.5);
  } else {
    giveSkExp(skl.cnd, 0.4);
  }
};
act.mod_cond.activate = function () {
  msg('You begin drilling', 'orange');
  you.mods.sdrate += 0.15 * you.mods.runerg;
  MOD_startAction(this);
};
act.mod_cond.deactivate = function () {
  you.mods.sdrate -= 0.15 * you.mods.runerg;
  MOD_stopAction(this, 'You stop, breathing hard');
};


/* --- Earning the actions ---------------------------------------------------
   These used to be handed over 2.5 seconds after load and re-granted on a
   timer, so a brand-new character had four unexplained abilities before
   leaving the tutorial. They are now earned, through the game's own mechanism:
   `skl.walk` level 1 is what grants the base game's "Run", from a milestone.

   Each action hangs off the base-game skill it grows out of, so the thing you
   were already doing is what teaches it:

     Toughness  4   Endurance Drill       taking hits teaches you to condition
     Harvesting 4   Forage                gathering teaches you to search
     Temperance 5   Circulate Qi          letting go teaches you to hold
     Literacy   8   Practice Calligraphy  read before you write

   All four skills are trained by ordinary play — Toughness by being hit while
   a slot is unarmoured, Harvesting by area drops, Temperance by discarding
   possessions, Literacy by reading. None had milestones of its own past
   level 5, so these append in ascending order and the save's index-keyed
   "granted" flags stay lined up (tests/audit.mjs enforces that).

   Why a milestone rather than a tick that watches for the condition: the
   requirement then shows up in the skill panel as a perk like any other, the
   game announces it in its own words, and load ordering is already solved —
   milestones re-fire before the action list is rebuilt from the save, so a
   replayed grant is overwritten by the saved list a moment later.

   The perks carry a small stat bonus as well, because a perk in this game
   always does something, and an entry that only granted an action would read
   as a blank line in the panel.
   -------------------------------------------------------------------------- */

var MOD_ACTIONS = [act.mod_qi, act.mod_forage, act.mod_calli, act.mod_cond];

var MOD_ACTION_UNLOCKS = [
  { skill: 'tghs',  lv: 4, act: act.mod_cond,
    f: function () { you.stra += 1; you.stat_r(); },
    p: 'STR +1, unlocks the action "Endurance Drill"' },
  { skill: 'hst',   lv: 4, act: act.mod_forage,
    f: function () { you.inta += 1; you.stat_r(); },
    p: 'INT +1, unlocks the action "Forage"' },
  /* Circulate Qi used to hang off Temperance 5 like the others. It is the way
     into the whole cultivation system now — realms are levelled through it —
     and gating that behind a skill you train by throwing possessions away was
     obscure. It is granted by finishing the dojo's three tutorial fights
     instead; see MOD_QI_UNLOCK below. Temperance keeps a perk at the same
     level so the save's index-keyed milestone flags do not shift. */
  { skill: 'rccln', lv: 5, act: null,
    f: function () { you.inta += 1; you.mods.sbonus += 0.02; you.stat_r(); },
    p: 'INT +1, Energy Effectiveness +2%' },
  { skill: 'rdg',   lv: 8, act: act.mod_calli,
    f: function () { you.inta += 2; you.stat_r(); },
    p: 'INT +2, unlocks the action "Practice Calligraphy"' }
];

MOD_ACTION_UNLOCKS.forEach(function (u) {
  var sk = skl[u.skill];
  if (!sk) { console.warn('[mod] no skill ' + u.skill); return; }
  if (!u.act) {                                  // a plain perk, no action
    MOD_addMilestones(sk, [{ lv: u.lv, g: false, p: u.p, f: u.f }]);
    return;
  }
  MOD_addMilestones(sk, [{
    lv: u.lv, g: false, p: u.p,
    f: function () { u.f(); try { giveAction(u.act); } catch (e) {} }
  }]);
});

/* --- Circulate Qi, from the dojo's tutorial fights ------------------------
   The difficulty select offers "Easiest", "Easy" and "Normal" — areas trn1,
   trn2 and trn3, which set tr1_win, tr2_win and tr3_win. Clearing all three is
   the moment the dojo has finished teaching you to fight, which is the right
   moment to hand over the thing the rest of the mod's cultivation hangs off.

   A tick check rather than a milestone, because the condition is three story
   flags rather than a skill level — the same way the base game grants
   act.scout from a story beat rather than a perk. The flags only ever go from
   false to true, so this is one-way, and giveAction is a no-op once you have
   it.

   The skill itself is revealed at the same time. The game only shows a skill
   once it first levels, which would leave you holding an action whose skill is
   nowhere on the sheet. */
var MOD_QI_UNLOCK = ['tr1_win', 'tr2_win', 'tr3_win'];

function MOD_qiUnlocked() {
  for (var i = 0; i < MOD_QI_UNLOCK.length; i++) {
    if (global.flags[MOD_QI_UNLOCK[i]] !== true) return false;
  }
  return true;
}

function MOD_checkQiUnlock() {
  try {
    if (!MOD_qiUnlocked()) return;
    if (act.mod_qi.have !== true) {
      giveAction(act.mod_qi);
      msg('The forms settle into something you can feel moving.', 'plum');
      /* And the first breakthrough pill. Realm 1 opens at Qi Circulation 1,
         long before the marketplace does — the Paper Boy who starts that chain
         only appears after the dojo, at 40% a visit — so leaving the first
         pill to the Herbalist would gate the entire ladder behind a random
         encounter. The instructor hands it over here, which is the right beat
         anyway. */
      try {
        if (item.mod_bp1 && !global.flags.mod_firstpill) {
          giveItem(item.mod_bp1, 1);
          global.flags.mod_firstpill = true;
          msg('Instructor: Take this. When you can feel it moving, swallow it.', 'gold');
        }
      } catch (e) {}
    }
    if (skl.qic && you.skls && you.skls.indexOf(skl.qic) === -1) {
      you.skls.push(skl.qic);
      if (!global.flags.sklu) { global.flags.sklu = true; dom.ct_bt2.innerHTML = 'skills'; }
    }
  } catch (e) { /* never break a tick over an unlock */ }
}

var MOD_ontick_before_qi = ontick;
ontick = function () {
  MOD_ontick_before_qi();
  MOD_checkQiUnlock();
};

/* Where the four stand, and what is still needed. */
function modActions() {
  var lines = ['Added actions:'];
  MOD_ACTION_UNLOCKS.forEach(function (u) {
    if (!u.act) return;
    var sk = skl[u.skill];
    var have = u.act.have === true;
    lines.push('  ' + (have ? '[unlocked] ' : '[  locked ] ') + u.act.name +
      (have ? '' : '  —  ' + (sk ? sk.name + ' ' + sk.lvl + '/' + u.lv : u.skill + ' ' + u.lv)));
  });
  var qi = act.mod_qi.have === true;
  lines.push('  ' + (qi ? '[unlocked] ' : '[  locked ] ') + act.mod_qi.name +
    (qi ? '' : '  —  clear the dojo\'s Easiest, Easy and Normal dummies (' +
      MOD_QI_UNLOCK.filter(function (f) { return global.flags[f] === true; }).length +
      '/3 done)'));
  lines.push('modUnlockAll() grants them regardless, if you would rather not wait.');
  var out = lines.join('\n');
  console.log(out);
  return out;
}

/* Deliberate escape hatch, not part of progression. */
function modUnlockAll() {
  var granted = 0;
  for (var i = 0; i < MOD_ACTIONS.length; i++) {
    var a = MOD_ACTIONS[i];
    if (a && a.have === false) {
      try { giveAction(a); granted++; }
      catch (e) { console.warn('[mod] could not grant "' + a.name + '": ' + e.message); }
    }
  }
  return granted;
}


/* ===========================================================================
   Console reference
   =========================================================================== */

function modHelp() {
  var lines = [
    'Proto23 mod v' + MOD.version,
    '',
    '  setSpeed(n)     game speed, e.g. setSpeed(3). Current: ' + getSpeed() + 'x',
    '  resetSpeed()    back to 1x',
    '  setSkillXp(n)   skill xp multiplier. Current: ' + getSkillXp() + 'x',
    '  modActions()    the four added actions and what unlocks each',
    '  modUnlockAll()  grant them all now, skipping the requirements',
    '  modHelp()       this list',
    '',
    '  New skills: Qi Circulation, Foraging, Calligraphy, Conditioning',
    '  New actions: Circulate Qi, Forage, Practice Calligraphy, Endurance Drill',
    '               each earned from a skill perk — see modActions()',
    '  Speed persists across reloads. Skill xp resets to ' + MOD.skill_xp_mult + 'x.'
  ].join('\n');
  console.log(lines);
  return lines;
}

console.log('[mod] loaded — speed ' + getSpeed() + 'x, skill xp ' + MOD.skill_xp_mult + 'x. Type modHelp() for commands.');


/* ===========================================================================
   5. LIVE SKILL EFFECT DESCRIPTIONS
   ---------------------------------------------------------------------------
   The skill tooltip (dscr type 6) renders `what.desc` as a plain string —
   unlike item and action tooltips, it has no function-desc support. Rather
   than patch the game's renderer, each skill's `desc` becomes a getter, so
   the tooltip picks up freshly computed numbers every time it's opened.

   Every percentage below is derived from that skill's actual `use()` function
   and its call site in the game — not invented. Skills whose `use()` just
   returns the raw level, with the meaning decided by a caller I could not
   pin down, deliberately get no effect line; they still get "Next perk".
   =========================================================================== */

function MOD_pct(n) {
  n = Math.round(n * 100) / 100;
  return (n >= 0 ? '+' : '') + n + '%';
}
function MOD_x(n) { return '×' + (Math.round(n * 1000) / 1000); }

var MOD_EFFECTS = {
  // --- attack scalers: use() does you.str += you.str/100*(lvl*N) ------------
  fgt:   function (s) { return 'Attack power ' + MOD_pct(s.lvl * 2); },
  unc:   function (s) { return 'Attack power unarmed ' + MOD_pct(s.lvl * 6); },
  srdc:  function (s) { return 'Attack power with a sword ' + MOD_pct(s.lvl * 5); },
  knfc:  function (s) { return 'Attack power with a knife ' + MOD_pct(s.lvl * 5); },
  axc:   function (s) { return 'Attack power with an axe ' + MOD_pct(s.lvl * 5); },
  plrmc: function (s) { return 'Attack power with a polearm ' + MOD_pct(s.lvl * 5); },
  hmrc:  function (s) { return 'Attack power with a blunt weapon ' + MOD_pct(s.lvl * 5); },
  bwc:   function (s) { return 'Attack power with a bow ' + MOD_pct(s.lvl * 5); },
  twoh:  function (s) { return 'Attack power two-handed ' + MOD_pct(s.lvl * 1.25); },
  stfc:  function (s) { return 'Mental acuity with a staff/wand ' + MOD_pct(s.lvl * 5); },
  shdc:  function (s) { return 'Attack power ' + MOD_pct(s.lvl * 5) +
                               ', Mental acuity ' + MOD_pct(s.lvl * 3); },

  // --- verified against their call sites ------------------------------------
  seye:  function (s) { return 'Critical rate ' + MOD_pct(s.lvl * 0.3); },
  war:   function (s) { return 'Critical damage ' + MOD_pct(s.lvl * 0.5); },
  painr: function (s) { return 'Physical damage taken ' + MOD_pct(-(s.lvl * 0.4)); },
  stel:  function (s) { return 'Loot find chance ' + MOD_x(s.lvl * 0.05); },
  trad:  function (s) { return 'Buying prices ' + MOD_pct(-(s.lvl * 0.5)); },
  dngs:  function (s) { return 'Damage avoided ' + MOD_pct(s.lvl * (s.lvl > 25 ? 1 : 2)); },
  sleep: function (s) { return 'Rest recovery ' + MOD_x(5 * s.lvl) + ' per unit slept'; },

  fdpnr: function (s) {
    var r = Math.min(s.lvl * 5, 100);
    return 'Food poison damage ' + MOD_pct(-r) + (r >= 100 ? ' (immune)' : '');
  },
  fmn:   function (s) {
    var r = Math.min(s.lvl, 60);
    return 'Hunger penalty reduced ' + MOD_pct(r) + (r >= 60 ? ' (capped)' : '');
  },

  // These use Math.ceil(1 - lvl*0.01), so they are a hard cutoff at lvl 100
  // rather than a gradual reduction. Described as what they actually are.
  poisr: function (s) {
    return s.lvl >= 100 ? 'Poison damage fully negated'
                        : 'Negates poison damage at lvl 100 — ' + Math.min(s.lvl, 100) + '% of the way';
  },
  bledr: function (s) {
    return s.lvl >= 100 ? 'Bleed damage fully negated'
                        : 'Negates bleed damage at lvl 100 — ' + Math.min(s.lvl, 100) + '% of the way';
  },

  // Base-game formula is `sat *= 0.55*(1 - lvl*0.1)`, which DROPS as the skill
  // levels and hits zero at lvl 10. Reported as computed rather than dressed up.
  dth:   function (s) {
    var m = 0.55 * (1 - s.lvl * 0.1);
    return 'Energy kept on death ' + MOD_x(Math.max(m, 0)) +
           (s.lvl >= 10 ? ' <span style="color:tomato">(base-game formula bottoms out at lvl 10)</span>' : '');
  },

  // --- skills added by this mod (see section 6 for the use() formulas) ------
  qic:   function (s) { return 'Mental acuity ' + MOD_pct(s.lvl * 3); },
  clg:   function (s) { return 'Mental acuity ' + MOD_pct(s.lvl * 2); },
  cnd:   function (s) { return 'Attack power ' + MOD_pct(s.lvl * 3); },
  frg:   function (s) {
    return 'Forage find chance ' + MOD_pct(MOD_forageChance(s.lvl) * 100) + ' per tick';
  }
};

function MOD_nextPerk(sk) {
  if (!sk.mlstn || !sk.mlstn.length) return '';
  var next = null;
  for (var i = 0; i < sk.mlstn.length; i++) {
    var m = sk.mlstn[i];
    if (m.lv > sk.lvl && (next === null || m.lv < next.lv)) next = m;
  }
  if (!next) return '<small style="color:#7cf">All perks unlocked</small>';
  var away = next.lv - sk.lvl;
  return '<small style="color:#7cf">Next perk: lvl ' + next.lv +
         ' (' + away + ' level' + (away === 1 ? '' : 's') + ' to go)</small>';
}

function MOD_installLiveDesc() {
  var count = 0;
  Object.keys(skl).forEach(function (key) {
    var sk = skl[key];
    if (!sk || typeof sk !== 'object') return;

    if (sk._modDescInstalled) return;          // idempotent: sections 8-10 re-run this
    var base = sk.desc;
    if (typeof base === 'function') return;   // leave any function desc alone
    sk._modDescInstalled = true;

    try {
      Object.defineProperty(sk, 'desc', {
        configurable: true,
        enumerable: true,
        /* A getter with no setter makes `sk.desc = '...'` a silent no-op in
           non-strict code. Nothing in the game does that today — skill
           descriptions are all set at definition time, before these install —
           but a future edit or a second mod would fail invisibly. The setter
           replaces the base text and keeps the computed lines. */
        set: function (v) { base = v; },
        get: function () {
          var lines = [];
          var eff = MOD_EFFECTS[key];   // looked up per read, so effect lines
          if (eff) {                    // added later still take effect
            try {
              var t = eff(sk);
              if (t) lines.push('<small style="color:gold">' + t + '</small>');
            } catch (e) { /* never let a tooltip throw */ }
          }
          var np = MOD_nextPerk(sk);
          if (np) lines.push(np);
          return lines.length ? (base + MOD_SEP + lines.join('<br>')) : base;
        }
      });
      count++;
    } catch (e) {
      console.warn('[mod] live desc failed for ' + key + ': ' + e.message);
    }
  });
  return count;
}


/* ===========================================================================
   6. CONTINUOUS EFFECTS FOR THE ADDED SKILLS
   ---------------------------------------------------------------------------
   Originally these four paid out only at milestone levels, so unlike the
   base-game skills they had no per-level formula — and therefore no honest
   percentage to show. This gives them one, in the game's own idiom.

   The hook is allbuff(), which the game uses for exactly this:

       function allbuff(who){
         who.stat_r();                       // resets stats from base + flats
         ...
         let dm = skl.fgt.use(); ...         // then layers skill effects on top
       }

   Because stat_r() resets first, effects applied here recompute cleanly every
   call rather than compounding. Same path Fighting and the weapon masteries
   already use.
   =========================================================================== */

skl.qic.use = function () { you.int += you.int / 100 * (this.lvl * 3); };
skl.clg.use = function () { you.int += you.int / 100 * (this.lvl * 2); };
skl.cnd.use = function () { you.str += you.str / 100 * (this.lvl * 3); };

// Foraging already had a real per-level effect — the find chance inside
// act.mod_forage.use(). Shared here so the tooltip and the action can't drift.
function MOD_forageChance(lvl) { return 0.010 + (lvl * 0.0015); }

var MOD_allbuff_original = allbuff;

allbuff = function (who) {
  MOD_allbuff_original(who);
  try {
    if (who && typeof you !== 'undefined' && who.id === you.id) {
      if (skl.qic.lvl) skl.qic.use();
      if (skl.clg.lvl) skl.clg.use();
      if (skl.cnd.lvl) skl.cnd.use();
    }
  } catch (e) { /* never break a stat refresh */ }
};


/* ===========================================================================
   7. NATURALLY DISCOVERED SKILLS
   ---------------------------------------------------------------------------
   Nine skills that surface from things you already do — travelling, taking
   hits, dodging, inspecting things, picking things up, being out in bad
   weather or at night, or running on an empty stomach. No action to toggle:
   play normally and they appear.

   The whole set is driven by ONE wrapper around ontick(), reading counters
   the game already maintains (global.stat.*) plus environment flags. Nothing
   else in the game is patched, and no counter is created — these are the same
   numbers the game's own statistics screen uses.

   ontick() reschedules itself with `setTimeout(...ontick()...)`, which
   resolves to this wrapper, so the chain stays single — one tick, one call.
   =========================================================================== */

// Same shape as MOD_SKILL_TIERS but lets the growth-potential line name a
// different stat than the one being raised (stat_p has no SPD slot).
function MOD_tiers2(statA, statM, label, labelM, potIdx, potLabel) {
  potLabel = potLabel || label;
  return [
    { lv: 2,  f: function () { you[statA] += 1; you.stat_r(); }, g: false, p: label + " +1" },
    { lv: 5,  f: function () { you[statA] += 2; you.exp_t += 0.02; you.stat_r(); }, g: false,
      p: label + " +2, EXP Gain +2%" },
    { lv: 10, f: function () { you[statA] += 3; you.mods.sbonus += 0.02; you.stat_r(); }, g: false,
      p: label + " +3, Energy Effectiveness +2%" },
    { lv: 15, f: function () { you[statA] += 4; you.exp_t += 0.05; you.stat_r(); }, g: false,
      p: label + " +4, EXP Gain +5%" },
    { lv: 20, f: function () { you[statA] += 5; you.stat_p[potIdx] += 0.08; you.stat_r(); }, g: false,
      p: label + " +5, " + potLabel + " Growth Potential +8%" },
    { lv: 25, f: function () { you[statM] += 0.08; you.exp_t += 0.06; you.stat_r(); }, g: false,
      p: labelM + " +8%, EXP Gain +6%" },
    { lv: 30, f: function () { you[statA] += 8; you.mods.sbonus += 0.04; you.stat_r(); }, g: false,
      p: label + " +8, Energy Effectiveness +4%" },
    { lv: 40, f: function () { you[statM] += 0.12; you.stat_p[potIdx] += 0.10; you.stat_r(); }, g: false,
      p: labelM + " +12%, " + potLabel + " Growth Potential +10%" },
    { lv: 50, f: function () { you[statM] += 0.18; you.exp_t += 0.15; you.stat_r(); }, g: false,
      p: labelM + " +18%, EXP Gain +15%" }
  ];
}

/* Each entry is one skill.
     stat/pct  the continuous per-level effect, applied via the allbuff hook
     counter   a global.stat.* counter — xp is granted per unit it rises
     cap       ceiling on one tick's delta, so a single huge event (a big hit)
               can't dump a level's worth of xp at once
     when()    alternative trigger: xp granted each tick the predicate holds  */
var MOD_DISCOVERED = [
  { key: 'wayf', id: 905, type: 4, name: 'Wayfaring',
    desc: 'A sense for roads walked and ground covered',
    note: 'Quickens the step',
    stat: 'spd', statA: 'spda', statM: 'spdm', pct: 2, potIdx: 2, potLabel: 'AGL',
    label: 'Movement speed', labelStat: 'SPD', labelM: 'SPD Multiplier',
    counter: 'smovet', xp: 3, cap: 5 },

  { key: 'scar', id: 906, type: 2, name: 'Battle Scars',
    desc: 'Every wound taken leaves something behind',
    note: 'Hardens the body against what already hurt it',
    stat: 'str', statA: 'stra', statM: 'strm', pct: 2, potIdx: 1,
    label: 'Attack power', labelStat: 'STR', labelM: 'STR Multiplier',
    counter: 'dmgrt', xp: 0.15, cap: 40 },

  { key: 'ftwk', id: 907, type: 3, name: 'Footwork',
    desc: 'Weight on the right foot at the right moment',
    note: 'Sharpens evasion and positioning',
    stat: 'agl', statA: 'agla', statM: 'aglm', pct: 3, potIdx: 2,
    label: 'Agility', labelStat: 'AGL', labelM: 'AGL Multiplier',
    counter: 'dodgt', xp: 2, cap: 5 },

  { key: 'curi', id: 908, type: 4, name: 'Curiosity',
    desc: 'The habit of looking closer at things',
    note: 'A mind kept busy stays sharp',
    stat: 'int', statA: 'inta', statM: 'intm', pct: 2, potIdx: 3,
    label: 'Mental acuity', labelStat: 'INT', labelM: 'INT Multiplier',
    counter: 'popt', xp: 0.4, cap: 12 },

  { key: 'coll', id: 909, type: 4, name: 'Collecting',
    desc: 'An eye for what is worth carrying home',
    note: 'Judgement sharpened by handling many things',
    stat: 'int', statA: 'inta', statM: 'intm', pct: 1.5, potIdx: 3,
    label: 'Mental acuity', labelStat: 'INT', labelM: 'INT Multiplier',
    counter: 'igtttl', xp: 1.5, cap: 20 },

  { key: 'wthrn', id: 910, type: 6, name: 'Weatherworn',
    desc: 'Rain, snow and wind stopped bothering you a while ago',
    note: 'Endurance earned outdoors in poor weather',
    stat: 'str', statA: 'stra', statM: 'strm', pct: 1.5, potIdx: 1,
    label: 'Attack power', labelStat: 'STR', labelM: 'STR Multiplier',
    xp: 0.12,
    when: function () {
      return !global.flags.inside && typeof w_manager !== 'undefined' &&
             w_manager.curr && (w_manager.curr.frain === true || w_manager.curr.fsnow === true);
    },
    hint: 'outdoors in rain or snow' },

  { key: 'noct', id: 911, type: 4, name: 'Nightwalking',
    desc: 'Comfort in the hours most people sleep through',
    note: 'Eyes and footing that suit the dark',
    stat: 'agl', statA: 'agla', statM: 'aglm', pct: 2, potIdx: 2,
    label: 'Agility', labelStat: 'AGL', labelM: 'AGL Multiplier',
    xp: 0.1,
    when: function () { return !global.flags.inside && global.flags.isday === false; },
    hint: 'outdoors at night' },

  { key: 'lunr', id: 912, type: 7, name: 'Lunar Attunement',
    desc: 'Something in you answers when the moon is full',
    note: 'Clarity drawn down from a full moon',
    stat: 'int', statA: 'inta', statM: 'intm', pct: 3, potIdx: 3,
    label: 'Mental acuity', labelStat: 'INT', labelM: 'INT Multiplier',
    xp: 0.35,
    when: function () {
      return !global.flags.inside && global.flags.isday === false &&
             typeof getLunarPhase === 'function' && getLunarPhase() === 4;
    },
    hint: 'outdoors under a full moon' },

  { key: 'swnd', id: 913, type: 2, name: 'Second Wind',
    desc: 'Finding something left after there is nothing left',
    note: 'Grit that shows up once the tank is empty',
    stat: 'str', statA: 'stra', statM: 'strm', pct: 2, potIdx: 1,
    label: 'Attack power', labelStat: 'STR', labelM: 'STR Multiplier',
    xp: 0.15,
    when: function () { return you.satmax > 0 && (you.sat / you.satmax) < 0.25; },
    hint: 'acting below 25% energy' }
];

// --- build the skills -------------------------------------------------------
MOD_DISCOVERED.forEach(function (d) {
  var sk = new Skill();
  sk.id = d.id;
  sk.type = d.type;
  sk.name = d.name;
  sk.desc = d.desc + MOD_SEP + '<small style="color:darkorange">' + d.note + '</small>';
  sk.mlstn = MOD_tiers2(d.statA, d.statM, d.labelStat, d.labelM, d.potIdx, d.potLabel);
  sk.use = function () {
    var pct = d.pct * (d.when ? MOD_COND_BONUS : 1);
    you[d.stat] += you[d.stat] / 100 * (this.lvl * pct);
  };
  skl[d.key] = sk;

  MOD_EFFECTS[d.key] = function (s) {
    var cond = !!d.when;
    var pct = d.pct * (cond ? MOD_COND_BONUS : 1);
    var active = !cond || MOD_condMet(d.when);
    var line = d.label + ' ' + MOD_pct(s.lvl * pct);
    if (cond) {
      line += ' <small style="color:' + (active ? 'lime' : 'grey') + '">' +
              (active ? 'active now' : 'inactive') + ' \u2014 only ' + (d.hint || 'in certain conditions') +
              '</small>';
    }
    if (s.lvl === 0 && d.hint) {
      line += '<br><small style="color:#9a9">Trains ' + d.hint + '</small>';
    }
    return line;
  };
});

// --- continuous effects, same allbuff hook as section 6 ---------------------
var MOD_allbuff_before_discovered = allbuff;

allbuff = function (who) {
  MOD_allbuff_before_discovered(who);
  try {
    if (who && typeof you !== 'undefined' && who.id === you.id) {
      for (var i = 0; i < MOD_DISCOVERED.length; i++) {
        var sk = skl[MOD_DISCOVERED[i].key];
        if (sk && sk.lvl) sk.use();
      }
    }
  } catch (e) { /* never break a stat refresh */ }
};

// --- the single tick hook that grants the xp --------------------------------
var MOD_seen = {};

function MOD_discoverTick() {
  for (var i = 0; i < MOD_DISCOVERED.length; i++) {
    var d = MOD_DISCOVERED[i], sk = skl[d.key];
    if (!sk) continue;

    if (d.counter) {
      var now = Number(global.stat[d.counter]) || 0;
      var prev = MOD_seen[d.key];
      if (prev === undefined) { MOD_seen[d.key] = now; continue; }  // first tick: baseline only
      if (now > prev) {
        var delta = now - prev;
        if (d.cap && delta > d.cap) delta = d.cap;
        giveSkExp(sk, d.xp * delta);
      }
      MOD_seen[d.key] = now;                 // also resyncs after a load resets counters
    } else if (d.when) {
      if (d.when()) giveSkExp(sk, d.xp);
    }
  }
}

var MOD_ontick_original = ontick;

ontick = function () {
  MOD_ontick_original();
  try { MOD_discoverTick(); } catch (e) { /* a tick must never die */ }
};

function modDiscoveries() {
  var rows = MOD_DISCOVERED.map(function (d) {
    var sk = skl[d.key];
    return '  ' + d.name.padEnd(18) + 'lvl ' + String(sk.lvl).padStart(3) +
           '   ' + (d.hint || 'from ' + d.counter);
  });
  var out = 'Naturally discovered skills:\n' + rows.join('\n');
  console.log(out);
  return out;
}

console.log('[mod] ' + MOD_DISCOVERED.length + ' naturally discovered skills registered');


console.log('[mod] live skill descriptions installed on ' + MOD_installLiveDesc() + ' skills');


/* ===========================================================================
   8. ENEMY SCALING AND NEW CONTENT
   ---------------------------------------------------------------------------
   Sections 3-7 make the player far stronger than vanilla, and the added skill
   curve lets every skill reach the story cap, so player power runs away by a
   factor of thousands across the ladder while lvlup() grows enemies linearly.
   Something has to close that gap. Getting it right depends entirely on which
   enemy FIELD you scale, so read this before touching any of it.

   --- why the obvious model does not work ----------------------------------

   dmg_calc (index.html) is SUBTRACTIVE in both directions:

       you hit it :  (your STR * eff + weapon) * affinity  -  its STR   + 1
       it hits you:   its STR * affinity  -  (your STR * eff + armour)

   The defender's STR IS their armour. So multiplying an enemy's STR raises its
   offence and its armour together, and the moment its armour passes your STR
   your damage does not get small, it clamps to ZERO. AGL has the same problem
   from the other end: it is the denominator of hit_calc(1), so scaling it drops
   your hit chance as fast as it raises theirs.

   The mod used to multiply strm/aglm/intm by one number and hpm by another,
   fitted with a grid search scored on enemyHP/playerSTR and playerHP/enemySTR.
   Both of those proxies ignore the subtraction, and measured through the game's
   real math (tests/combat.mjs, tests/earlybal.mjs) the result was:

       tutorial fight 1   99% of landed hits dealt 0 damage, ~63,000 swings to
                          kill a straw dummy, and it killed you in 1
       tier 3 onward      kill 1 / die 1 at every single tier - whoever swung
                          first won

   Not a tuning miss. The fields were wrong.

   --- what is scaled now ---------------------------------------------------

   Three things a fight can be, three separate fields, no crosstalk:

       how long it takes to kill     ->  hpm            (enemy max HP)
       how fast it kills you         ->  _modAtk        (see the dmg_calc wrap)
       how often either side lands   ->  aglm           (solved for a hit rate)

   Enemy STR stays at its base-game value (MOD_ENEMY.armor), because that field
   is armour and touching it is what broke everything. Threat is delivered
   instead by _modAtk, which the dmg_calc wrapper below applies to the attacker's
   STR/INT for the duration of one attack roll only — offence without armour.

   --- anchored to the player, shaped by the area ---------------------------

   The targets are ratios (kill in N swings, die in M), not absolute curves, so
   the dials are solved per spawn against the player's current power rather than
   fitted to a level. That is deliberate: within tier 0 alone the player goes
   from STR 1 to STR ~265, a 265x swing, and no fixed multiplier survives that.

   Variety still comes from the area: each enemy is placed against the mean
   level of the population it spawned from, so a lv 24 bat in a 14-24 basement
   is genuinely harder than a lv 14 one, and each creature keeps its own stat_p
   character on top of that.

   The dials are two-sided. Flooring them at the base game's values sounds safe
   and is not: it leaves pockets where the base game's own subtractive damage
   has already made a fight unwinnable, and the floor prevents the fix. An enemy
   can come out below its vanilla stats when your damage is small enough that
   vanilla HP would take 21 swings.

   Tune with setEnemyScale({kill: 12, die: 30}) and see modBalance().
   =========================================================================== */

var MOD_ENEMY = {
  kill:       8,   // target landed swings to kill an average enemy of your area
  die:       20,   // target swings for that enemy to kill you
  hit:     0.45,   // target share of the enemy's swings that land on you
  hpSpread: 0.6,   // within an area, HP scales as (lvl / area mean lvl)^this
  atkSpread: 0.3,  // ... and attack as the same ratio ^this
  margin:   1.7,   // no spawn may be closer than this to a fight you cannot win
  armor:    1.0,   // enemy STR left at base-game value x this. This is ARMOUR:
                   // it is subtracted from your damage. Raising it does not make
                   // fights longer, it makes them unwinnable. Leave it at 1.
  bossKill: 2.0,   // a one-creature arena takes this much longer to clear...
  bossDie:  0.7,   // ...and hits this much harder while you do it
  expRate:  0.5,   // exp reward scales as hpm^this
  areaScale: 1.4   // level-range multiplier applied to existing areas
};

var MOD_ENEMY_MAX = 1e12;   // sanity clamp, so one odd spawn cannot make Infinity

function MOD_fin(v, d) { v = Number(v); return isFinite(v) ? v : d; }
function MOD_clampMul(v) {
  if (!isFinite(v) || v < 1) return 1;
  return v > MOD_ENEMY_MAX ? MOD_ENEMY_MAX : v;
}

/* --- measuring rather than replicating -------------------------------------
   An earlier version of this section replicated the two branches of dmg_calc so
   a spawn could be solved analytically. That does not survive contact with the
   real formula. Two things break it:

   * It is ill-conditioned. Enemy damage is `attack - your defence`, and late on
     your defence dwarfs the damage the subtraction is supposed to leave behind
     (STR ~4.1M against a target of ~56k), so a 2% error in the replica is a
     150% error in the result.

   * The base game's defence term goes NEGATIVE. Its last multiplier is
         (100 - (eqp[1].aff[atype]*5*(1+shdc/20) + target.cls[ctype]*5*(1+shdc/20)))/100
     and with shdc at level 110 that bracket is 6.5, while `eqp.dummy` — the one
     item object every unequipped slot and every monster shares — has had your
     unarmed progression written into it by lvlup (`aff[0] = you.lvl/5`,
     `cls[2] = you.lvl/4`). At character level 92 the multiplier is -12.3, so
     your "defence" is added to the enemy's damage instead of subtracted, and a
     lv 59 golem with 57 STR hits for 190 million. No attack-stat dial can
     correct for a term of the wrong sign.

   So nothing is replicated. Each spawn runs the game's own dmg_calc a handful of
   times, in both directions, and is scaled against what actually came out.
   MOD_probe parks the side effects while that happens: dmg_calc grants skill xp,
   sets the crit flag and jiggles a DOM node, none of which may fire because a
   monster walked into the room. giveSkExp is swapped locally rather than
   flag-guarded because other sections wrap it too, and this must not depend on
   which order they loaded in.
   -------------------------------------------------------------------------- */

function MOD_probe(fn) {
  var keepG = giveSkExp, keepCrti = global.flags.crti;
  var keepM = global.current_m, keepT = global.target;
  var keepD = (typeof dom !== 'undefined') ? dom.d1m : null;
  giveSkExp = function () {};
  if (keepD) dom.d1m = { style: {} };
  try { return fn(); }
  catch (e) { return null; }
  finally {
    giveSkExp = keepG; global.flags.crti = keepCrti;
    global.current_m = keepM; global.target = keepT;
    if (keepD) dom.d1m = keepD;
  }
}

/* The crit chance dmg_calc rolls against, reproduced exactly. Note that the
   `b` multiplier (you.luck/25+1) never reaches ctr_r: both branches that set it
   declare it with `let` inside their own block, so the outer b stays 1. */
function MOD_critRate(att) {
  var sat = you.satmax > 0 ? you.sat / you.satmax : 1;
  var k = 2 - (sat + MOD_fin(you.mods.sbonus, 0)) * 2;
  var crt = MOD_fin(att.crt, 0);
  var eye = (att.id === you.id && skl.seye) ? MOD_fin(skl.seye.use(), 0) : 0;
  return Math.min(Math.max(crt * k + crt + eye + MOD_fin(you.mods.crflt, 0), 0), 1);
}

/* Mean damage per landed hit — stratified on the crit roll.

   A plain sample mean is a bad estimator here. The distribution is two tight
   clusters, not one spread: a normal swing varies by randf(.9,1.1), a crit runs
   about 8x that by cap 110 (cpwr 4.6 compounding with 1 + skl.war.use()), and
   the crit rate reaches a third. Nearly all the variance of the sample mean is
   therefore just how many crits happened to land, and enemy HP is set directly
   from this number with nothing downstream to correct it — an overestimate is a
   proportionally longer fight. One in ~25,000 spawns came out at 2x.

   So each stratum is averaged on its own and recombined with the crit rate the
   game will actually roll against, which is known rather than sampled. That
   removes the dominant variance term outright. `crti` is dmg_calc's own crit
   flag; it sets it but never clears it, so clearing it per call reads it back. */
function MOD_meanDamage(att, def, n) {
  var critN = 0, critSum = 0, plainN = 0, plainSum = 0, keepCrti = global.flags.crti;
  for (var i = 0; i < n; i++) {
    global.flags.crti = false;
    var d = Math.max(MOD_fin(MOD_dmg_calc_original(att, def, abl.default), 0), 0);
    if (global.flags.crti) { critN++; critSum += d; } else { plainN++; plainSum += d; }
  }
  global.flags.crti = keepCrti;
  if (!critN || !plainN) return (critSum + plainSum) / n;   // one stratum never showed
  var p = MOD_critRate(att);
  return (1 - p) * (plainSum / plainN) + p * (critSum / critN);
}

/* Mean enemy level of a population — the anchor a spawn is measured against, so
   the high end of an area's level band stays harder than the low end. Cached on
   the area object; the areaScale pass below has already run by then. */
function MOD_areaMeanLvl(z) {
  if (!z || !z.pop || !z.pop.length) return 0;
  if (z._modMeanLvl) return z._modMeanLvl;
  var t = 0, n = 0;
  z.pop.forEach(function (e) {
    var w = MOD_fin(e.c, 1);
    t += ((MOD_fin(e.lvlmin, 1) + MOD_fin(e.lvlmax, 1)) / 2) * w;
    n += w;
  });
  z._modMeanLvl = (n > 0) ? (t / n) : 0;
  return z._modMeanLvl;
}

/* Creature identity. Everything else here is normalised against the player, so
   without this a bat and a golem of the same level would be interchangeable.
   stat_p is the base game's own per-creature growth rate — [hp, str, agl, int] —
   and it is the one thing that says a wolf hits harder than a slime.

   The HP side gets a wide band and the damage side a narrow one, on purpose: a
   tanky creature having three times the HP of a flimsy one reads as character,
   whereas the same spread on damage decides whether a fight is survivable. The
   golems in particular have low stat_p[1], so an unclamped damage band left
   every arena boss and most of the endgame hitting at 0.6x. */
function MOD_creatureShape(p, i, lo, hi) {
  var v = (p.stat_p && isFinite(p.stat_p[i])) ? Number(p.stat_p[i]) : 0.9;
  return Math.min(Math.max(v / 0.9, lo), hi);
}

/* Scaling goes through the stat MULTIPLIER fields, which stat_r() reapplies
   from the base values on every call — so this is idempotent and cannot
   accumulate if lvlup runs more than once on the same creature. No creature
   template in the game overrides those fields (checked).

   HP needs the multiplier rather than a direct write: lvlup sets a non-player's
   hp straight from hp_r, and stat_r() would then recompute hpmax and leave the
   creature at a fraction of its health. */
function MOD_scaleEnemy(p) {
  if (!p || typeof you === 'undefined') return;
  if (p.id === you.id || p.id === 0) return;      // skip the player and creature.default

  var E = MOD_ENEMY;

  // where this spawn sits inside its own area's level band
  var ref = MOD_areaMeanLvl(typeof global !== 'undefined' ? global.current_z : null);
  var band = (ref > 0) ? Math.max(p.lvl, 1) / ref : 1;
  band = Math.min(Math.max(band, 0.4), 2.5);

  // A protected area holding exactly one creature is an arena boss (the four
  // golem trials). Left alone they came out as the softest fights in the game:
  // golems have low stat_p[1], so the identity factor floors their damage while
  // their single-enemy areas get no level spread to make up for it.
  var z = (typeof global !== 'undefined') ? global.current_z : null;
  var boss = !!(z && z.protected === true && z.pop && z.pop.length === 1 && z.size === 1);

  // ---- accuracy: enemy AGL is the only free term in hit_calc(2) ------------
  var eqpAgl = 0;
  for (var i = 0; i < you.eqp.length; i++) eqpAgl += you.eqp[i].agl;
  var evas = skl.evas ? skl.evas.lvl : 0;
  var wantAgl = Math.max((E.hit * 100 - 10 + evas), 1) / 100 *
                ((you.spd + you.agl + eqpAgl / 2) * you.efficiency());
  // this one is allowed below 1: accuracy is a dial we are solving outright, and
  // flooring it at the base game's value made early enemies land 60% of swings
  // against a 39 HP character instead of the 45% asked for
  var agl = wantAgl / Math.max(p.agl_r + p.agla, 1);
  p.aglm = isFinite(agl) ? Math.min(Math.max(agl, 0.05), MOD_ENEMY_MAX) : 1;

  // ---- armour: left at the base game's value, on purpose ------------------
  // An enemy's STR is SUBTRACTED from your damage. Scaling it does not make a
  // fight longer, it makes your damage clamp to zero. See the section header.
  p.strm = E.armor; p.intm = E.armor;
  p.hpm = 1;
  p.stat_r();

  // ---- what actually happens when these two hit each other ----------------
  var seen = MOD_probe(function () {
    global.current_m = p;
    global.target = you.eqp[2];
    // attack() re-buffs both sides before every swing, so buff them here too —
    // otherwise the mean measured at spawn is not the mean seen in the fight,
    // and the shape ratio in the wrapper comes out biased.
    allbuff(you); allbuff(p);
    return {
      // 32 samples is plenty now that MOD_meanDamage strata on the crit roll;
      // it was 64 with a plain sample mean and still drifted.
      out:  MOD_meanDamage(you, p, 32),                      // your damage per landed hit
      in:   MOD_meanDamage(p, you, 10),                      // theirs, unscaled
      hit:  Math.min(Math.max(MOD_fin(hit_calc(1), 100), 5), 100) / 100
    };
  }) || { out: 0, in: 0, hit: 1 };

  // ---- the two targets, and the guarantee between them --------------------
  // band and stat_p both push the top of a level range in the SAME direction —
  // more HP and more damage — so at the top of a wide band they compound into a
  // fight that is lost by construction (kill 19, die 12 for a lv 12 rabbit in a
  // 5-12 area). The margin is the floor under that: whatever the spread does,
  // killing it always takes meaningfully fewer swings than dying to it.
  var killT = E.kill * Math.pow(band, E.hpSpread) *
              MOD_creatureShape(p, 0, 0.6, 1.8) * (boss ? E.bossKill : 1);
  // Bound it before the margin reads it. band and stat_p multiply, and at the
  // top of a wide band with a tanky creature they reached 2.5x the target — a
  // 20-swing chip-fest, and a margin computed off that number then has to make
  // the enemy nearly harmless to compensate. Bosses are the deliberate
  // exception and get their own ceiling.
  var kcap = E.kill * (boss ? E.bossKill * 1.5 : 2);
  killT = Math.min(Math.max(killT, E.kill * 0.5), kcap);
  var dieT  = E.die / Math.pow(band, E.atkSpread) /
              MOD_creatureShape(p, 1, 0.75, 1.35) * (boss ? E.bossDie : 1);
  // The guarantee. Both estimates carry sampling noise from a heavy-tailed
  // damage distribution, so the headroom is deliberately more than the ~1.2 the
  // arithmetic alone would need.
  dieT = Math.max(dieT, killT * E.margin);

  // ---- fight length -------------------------------------------------------
  var wantHp = Math.max(seen.out, 1) * seen.hit * killT;
  // Two-sided, like the accuracy dial. An earlier version floored every
  // multiplier at 1 so nothing could come out weaker than the base game made
  // it, and that produced unwinnable pockets: a lv 3 straw dummy has 21 HP and
  // 4 STR, and a lv 2 character with 4 STR does 1 damage a swing against it —
  // 21 swings to kill while dying in 15. The target is the point. If your
  // damage is small enough that base-game HP is already too much, the HP comes
  // down.
  var hpm = wantHp / Math.max(p.hp_r + p.hpa, 1);
  p.hpm = isFinite(hpm) ? Math.min(Math.max(hpm, 0.05), MOD_ENEMY_MAX) : 1;
  p.stat_r();
  p.hp = p.hpmax;                                 // spawn at full health, as lvlup does

  // ---- threat -------------------------------------------------------------
  // The damage it should land, and what the game's own math produced for it, so
  // the wrapper below can map one onto the other while keeping the shape.
  p._modDmg = Math.max(you.hpmax / Math.max(dieT * E.hit, 0.01), 1);
  p._modRaw = seen.in;
  p._modOut = seen.out;   // what your swing measured as, kept for the balance tests
  p._modKillT = killT;    // the two targets this spawn was built to, so the
  p._modDieT = dieT;      // balance tests can report intent against outcome
  p._modYourHp = you.hpmax;   // and the max HP the die target was derived from

  // exp tracks how much tougher this thing actually is than the base game made it
  var F = Math.pow(Math.max(p.hpm, 1), E.expRate);
  var prevF = p._modExpF || 1;
  p.exp = Math.max(1, Math.round((p.exp / prevF) * F));
  p._modExpF = F;
}

/* --- the enemy's damage, rescaled onto its target --------------------------
   Every ability routes through dmg_calc by name (abl.default.f and friends all
   call dmg_calc(x, y, this)), so wrapping the global covers all of them.

   The raw number is kept as a SHAPE, not a magnitude: dividing by the mean that
   MOD_scaleEnemy measured at spawn leaves the game's own variance and its crits
   (which land around 2x the mean) intact, and multiplying by the target puts the
   average where it belongs. Working from a ratio is what makes this survive the
   negative-defence blowup described above — the sign and size of the raw number
   stop mattering, only its spread does.

   The honest cost: your defensive stats no longer change how hard you are hit.
   Targeting a fixed number of swings-to-die already implied that (more armour
   would just have meant a bigger enemy attack), and the base game's defence math
   is not usable at these skill levels anyway. Offence is untouched — enemy HP is
   set from your real damage, so hitting harder still kills things faster.
   -------------------------------------------------------------------------- */
var MOD_dmg_calc_original = dmg_calc;

dmg_calc = function (att, def, atk) {
  var r = MOD_dmg_calc_original(att, def, atk);
  if (!att || typeof you === 'undefined' || att.id === you.id) return r;
  if (!def || def.id !== you.id) return r;

  var tgt = att._modDmg;
  if (!(tgt > 0)) return r;

  // The mean is kept as a slow EMA rather than frozen at spawn. The spawn probe
  // cannot see everything a live fight does — effects landing, gear wearing,
  // buffs re-applied per swing — and a mean that drifts biases every later hit
  // in the same direction. Comparing against a lagging average keeps the
  // variance while letting the level self-correct within a few swings.
  // Zeros carry no shape and must not enter the average. Early on the raw number
  // is zero on most swings — a lv 1 dummy cannot get through 265 STR — and
  // letting those through drags the mean to nothing, after which every landed
  // hit reads as a huge ratio and clips against the ceiling. When there is no
  // usable signal the target is used directly, with the game's own +-10% jitter.
  var raw = MOD_fin(r, 0);
  var shape;
  if (raw > 0 && att._modRaw > 0) {
    shape = raw / att._modRaw;
    att._modRaw = att._modRaw * 0.9 + raw * 0.1;
  } else {
    if (raw > 0) att._modRaw = raw;
    shape = 0.9 + Math.random() * 0.2;
  }
  // A ratio whose denominator moves is biased upward (E[x/m] > E[x]/E[m]), and
  // the game's crit tail is heavy enough that the raw spread would land the
  // average well above target. Damping toward 1 keeps the texture and drops the
  // bias with it; the clamp is the last resort behind that.
  shape = 1 + (shape - 1) * 0.6;
  return Math.min(Math.max(tgt * shape, tgt * 0.5), tgt * 2);
};

var MOD_lvlup_original = lvlup;

lvlup = function (p, t) {
  MOD_lvlup_original(p, t);
  try { MOD_scaleEnemy(p); } catch (e) { /* never break a spawn */ }
};

/* setEnemyScale({kill: 12, die: 10, hit: 0.5}) — any subset. The old positional
   (base, rate) form is gone with the model it belonged to. */
function setEnemyScale(opts) {
  if (opts && typeof opts === 'object') {
    ['kill', 'die', 'hit', 'hpSpread', 'atkSpread', 'armor', 'expRate'].forEach(function (k) {
      if (opts[k] !== undefined && isFinite(Number(opts[k]))) MOD_ENEMY[k] = Number(opts[k]);
    });
  }
  var m = MOD_ENEMY;
  var line = 'Enemy targets: kill in ' + m.kill + ' swings, die in ' + m.die +
             ', they land ' + Math.round(m.hit * 100) + '% of theirs';
  console.log('[mod] ' + line);
  if (typeof msg === 'function') msg('Enemy scaling updated', 'gold');
  return line;
}

function getEnemyScale() { return JSON.parse(JSON.stringify(MOD_ENEMY)); }


/* --- Existing areas made harder --------------------------------------------
   Raises the enemy level range of every area, on top of the per-level scaling
   above. The tutorial areas are exempt — the difficulty-select dummies and the
   opening fight are how a new character learns the systems, and making those
   lethal would wall off the early game.
   -------------------------------------------------------------------------- */

var MOD_AREA_EXEMPT = { nwh: 1, trn: 1, trnf: 1, trn1: 1, trn2: 1, trn3: 1, tst: 1 };

(function () {
  var touched = 0;
  Object.keys(area).forEach(function (key) {
    if (MOD_AREA_EXEMPT[key]) return;
    var a = area[key];
    if (!a || !a.pop || !a.pop.length) return;
    a.pop.forEach(function (e) {
      if (typeof e.lvlmin === 'number') e.lvlmin = Math.max(1, Math.ceil(e.lvlmin * MOD_ENEMY.areaScale));
      if (typeof e.lvlmax === 'number') e.lvlmax = Math.max(e.lvlmin, Math.ceil(e.lvlmax * MOD_ENEMY.areaScale));
    });
    touched++;
  });
  console.log('[mod] level ranges raised in ' + touched + ' existing areas (x' + MOD_ENEMY.areaScale + ')');
})();


/* --- New high-level areas --------------------------------------------------
   Three zones past anything in the base game, which tops out around level 28
   (the golem4 arena). Built from creatures already in the game, so no new
   bestiary entries or drop tables to get wrong.

   Reached from the Western Woods gate via a new trailhead. Level ranges here
   are written as final values — the areaScale pass above has already run, so
   these are not multiplied again.
   -------------------------------------------------------------------------- */

var MOD_FORAGE_DROPS = [item.hrb1, item.mshr, item.appl, item.stthbm2].filter(Boolean);

area.mod_hollow = new Area(); area.mod_hollow.id = 970;
area.mod_hollow.name = 'The Sunken Hollow';
area.mod_hollow.pop = [
  { crt: creature.slm5,  lvlmin: 30, lvlmax: 38, c: .40 },
  { crt: creature.wolf1, lvlmin: 32, lvlmax: 40, c: .35 },
  { crt: creature.zomb1, lvlmin: 30, lvlmax: 36, c: .25 }
];
area.mod_hollow.size = -1;                       // -1 = endless, as the hunting grounds use
area.mod_hollow.drop = MOD_FORAGE_DROPS.map(function (it) { return { item: it, c: .03 }; });
z_bake(area.mod_hollow);

area.mod_spire = new Area(); area.mod_spire.id = 971;
area.mod_spire.name = 'The Ashen Spire';
area.mod_spire.pop = [
  { crt: creature.golem3, lvlmin: 45, lvlmax: 52, c: .40 },
  { crt: creature.golem4, lvlmin: 48, lvlmax: 58, c: .30 },
  { crt: creature.ght,    lvlmin: 45, lvlmax: 55, c: .30 }
];
area.mod_spire.size = -1;
area.mod_spire.drop = MOD_FORAGE_DROPS.map(function (it) { return { item: it, c: .05 }; });
z_bake(area.mod_spire);

area.mod_vigil = new Area(); area.mod_vigil.id = 972;
area.mod_vigil.name = 'The Long Vigil';
area.mod_vigil.pop = [
  { crt: creature.golem4, lvlmin: 55, lvlmax: 62, c: .35 },
  { crt: creature.dcrps1, lvlmin: 58, lvlmax: 66, c: .35 },
  { crt: creature.unsctn, lvlmin: 60, lvlmax: 68, c: .30 }
];
area.mod_vigil.size = -1;
area.mod_vigil.drop = MOD_FORAGE_DROPS.map(function (it) { return { item: it, c: .08 }; });
z_bake(area.mod_vigil);


/* --- Locations for them ----------------------------------------------------
   Same shape as the game's own combat locations: sl() draws the choices,
   onEnter() starts the fight. Ids 975+ sit clear of the game's highest (169),
   and the game restores a location on load by scanning chss for a matching id,
   so these are found like any other.
   -------------------------------------------------------------------------- */

function MOD_makeFightLocation(key, id, locName, flavour, areaObj, backTo) {
  var c = new Chs();
  c.id = id;
  c.sl = function () {
    global.flags.inside = false;
    d_loc(locName);
    global.lst_loc = id;
    chs(flavour, true);
    chs('"<= Turn back"', false).addEventListener('click', function () { smove(chss[backTo]); });
  };
  c.onEnter = function () { area_init(areaObj); };
  chss[key] = c;
  return c;
}

/* --- when the added areas are allowed to exist at all ----------------------
   These sit past everything the base game has, so they stay invisible until
   the base game is finished. `trne4e1` is golem arena IV cleared — the deepest
   normal content there is (the dojo chain gates I -> II -> III -> IV on each
   other, and area.trne4.onEnd sets the flag and grants a title). Before that
   the trailhead is not drawn on the Western Woods gate at all.

   Inside the trailhead the three unlock in order, on the same kill counts that
   already govern their level caps — so an area and its cap open together
   rather than the area being walkable long before it is survivable. */
function MOD_endgameOpen() {
  try { return global.flags.trne4e1 === true; } catch (e) { return false; }
}
function MOD_hollowCleared() { return MOD_prog('hollow') >= MOD_REQ_HOLLOW; }
function MOD_spireCleared()  { return MOD_hollowCleared() && MOD_prog('spire') >= MOD_REQ_SPIRE; }

chss.mod_gate = new Chs(); chss.mod_gate.id = 975;
chss.mod_gate.sl = function () {
  global.flags.inside = false;
  d_loc('The Old Path, Trailhead');
  global.lst_loc = 975;
  chs('An overgrown path runs on past the gate. Whatever keeps the woods quiet does not reach out here.', true);
  chs('"=> The Sunken Hollow"', false, 'yellow').addEventListener('click', function () {
    msg('Around level 30-40. Harder than anything in the woods.', 'orange');
    smove(chss.mod_hollow);
  });
  if (MOD_hollowCleared()) {
    chs('"=> The Ashen Spire"', false, 'orange').addEventListener('click', function () {
      msg('Around level 45-58. Well past the golem arena.', 'orange');
      smove(chss.mod_spire);
    });
  } else {
    // false, not true: `chs(txt, true)` calls clr_chs() and would wipe the
    // choices already drawn above it
    chs('The path forks upward, but the way is choked with fallen rock. (' +
        MOD_prog('hollow') + '/' + MOD_REQ_HOLLOW + ' cleared in The Sunken Hollow)', false, 'grey');
  }
  if (MOD_spireCleared()) {
    chs('"=> The Long Vigil"', false, 'red').addEventListener('click', function () {
      msg('Around level 55-68. This will kill an unprepared character.', 'red');
      smove(chss.mod_vigil);
    });
  } else if (MOD_hollowCleared()) {
    chs('Something further out is still shut to you. (' +
        MOD_prog('spire') + '/' + MOD_REQ_SPIRE + ' cleared in The Ashen Spire)', false, 'grey');
  }
  chs('"<= Back to the gate"', false).addEventListener('click', function () { smove(chss.frstn1main); });
};

MOD_makeFightLocation('mod_hollow', 976, 'The Sunken Hollow',
  'The ground gives underfoot. Something moves in the standing water.',
  area.mod_hollow, 'mod_gate');

MOD_makeFightLocation('mod_spire', 977, 'The Ashen Spire',
  'Grey grit covers everything. The stone up here remembers being hotter.',
  area.mod_spire, 'mod_gate');

MOD_makeFightLocation('mod_vigil', 978, 'The Long Vigil',
  'Nothing has moved here in a long time. That is not the same as nothing being here.',
  area.mod_vigil, 'mod_gate');

/* Link the trailhead into the existing Western Woods gate by wrapping its
   sl(), rather than editing the game's function. */
(function () {
  var origSl = chss.frstn1main.sl;
  chss.frstn1main.sl = function () {
    origSl.apply(this, arguments);
    if (!MOD_endgameOpen()) return;      // nothing until the golem arena is done
    chs('"=> Follow the old path deeper"', false, 'yellow').addEventListener('click', function () {
      smove(chss.mod_gate);
    });
  };
})();


function modBalance() {
  var rows = [
    'Enemy scaling is solved per spawn against your current power, not fitted',
    'to a level, and nothing is ever scaled below what the base game made it.',
    '  kill an average enemy of your area in ~' + MOD_ENEMY.kill + ' landed swings',
    '  it kills you in ~' + MOD_ENEMY.die + ', landing ' + Math.round(MOD_ENEMY.hit * 100) + '% of its swings',
    '  the high end of an area\'s level band is harder than the low end',
    '  (HP ^' + MOD_ENEMY.hpSpread + ', attack ^' + MOD_ENEMY.atkSpread + ' of lvl / area mean lvl)',
    '',
    'Existing area level ranges raised x' + MOD_ENEMY.areaScale + ' (tutorial exempt)',
    'New areas: The Sunken Hollow (30-40), The Ashen Spire (45-58), The Long Vigil (55-68)',
    'Locked until golem arena IV is cleared, then from the Western Woods gate:',
    '  "Follow the old path deeper" -> Hollow -> (10 kills) Spire -> (15 kills) Vigil',
    '',
    'Tune: setEnemyScale({kill: 14, die: 20})   for an easier ride'
  ].join('\n');
  console.log(rows);
  return rows;
}

console.log('[mod] enemy scaling active — kill in ~' + MOD_ENEMY.kill +
            ', die in ~' + MOD_ENEMY.die + '. modBalance() for details.');


/* ===========================================================================
   9. PLAYER SURVIVABILITY — making the two curves actually meet
   ---------------------------------------------------------------------------
   Sweeping the enemy HP exponent showed enemy-side tuning alone cannot work:

     hpPow   skills 30 / enemy 12      skills 50 / enemy 76
     1.0     kill in 1,  die in 14     kill in 5,    die in 1
     1.4     kill in 1,  die in 13     kill in 51,   die in 1
     1.7     kill in 1,  die in 14     kill in 360,  die in 1
     2.0     kill in 2,  die in 14     kill in 2277, die in 1

   "die in 1" at every setting. The reason is on the player's side, not the
   enemy's: across skill levels 10 to 30 the player's STR grows about 20x
   (665 -> 13763) while max HP grows about 1.5x (1522 -> 2337). Offence is
   exponential, defence is nearly flat. Any enemy tough enough to survive the
   player's damage necessarily one-shots the player.

   So defence is scaled to follow offence, rather than the player's damage
   being cut. Nothing here weakens the character — it raises max HP by the same
   curve the added skills raise damage, damped by hpTrack so combat still has
   teeth.

   This also replaces the two nested allbuff wrappers from sections 6 and 7
   with a single one, so the pre-effect STR can be read at the right moment.
   Those wrappers are left defined but are no longer in the call chain.
   =========================================================================== */

var MOD_PLAYER = {
  hpTrack: 0.92   // max HP follows offence as ratio^hpTrack; 1 = exactly, 0 = not at all
};

allbuff = function (who) {
  MOD_allbuff_original(who);                      // the game's own, from section 6

  try {
    if (!who || typeof you === 'undefined' || who.id !== you.id) return;

    var strRef = you.str, hpRef = you.hpmax;      // after the game's effects, before ours

    if (skl.qic.lvl) skl.qic.use();               // section 4 skills
    if (skl.clg.lvl) skl.clg.use();
    if (skl.cnd.lvl) skl.cnd.use();
    for (var i = 0; i < MOD_DISCOVERED.length; i++) {   // section 7 skills
      var sk = skl[MOD_DISCOVERED[i].key];
      if (sk && sk.lvl) sk.use();
    }

    if (strRef > 0 && you.str > strRef) {
      var ratio = you.str / strRef;
      you.hpmax = Math.round(hpRef * Math.pow(ratio, MOD_PLAYER.hpTrack));
      if (you.hp > you.hpmax) you.hp = you.hpmax;
    }
  } catch (e) { /* never break a stat refresh */ }
};

function setHpTrack(n) {
  n = Number(n);
  if (!isFinite(n) || n < 0 || n > 1.5) {
    console.warn('[mod] setHpTrack: pass 0 to 1.5 (0 = HP does not follow offence, 1 = follows exactly)');
    return MOD_PLAYER.hpTrack;
  }
  MOD_PLAYER.hpTrack = n;
  try { allbuff(you); } catch (e) {}
  console.log('[mod] hpTrack = ' + n);
  return n;
}

console.log('[mod] player HP now tracks offence (hpTrack ' + MOD_PLAYER.hpTrack + ')');


/* ===========================================================================
   10. PROGRESSION LEVEL CAPS  +  100 MORE SKILLS
   ---------------------------------------------------------------------------
   A. THE CAP
   Skills stop gaining xp at a ceiling set by how far you have got in the
   story. This is what keeps the whole thing bounded: the earlier sections made
   player power exponential in skill level, and a cap turns that into a series
   of finite steps instead of an open curve.

   Tiers are read from `global.flags`, which the game saves and restores
   (`global.flags = a1.e` on load), so the cap follows the save rather than the
   browser. Each tier also has a base-game flag as a fallback, so a character
   who already cleared that content is not stuck at a low cap.

   B. THE SKILLS
   A set discovered by playing — same machinery as section 7, reading the
   game's own `global.stat.*` counters and environment state. All 44 of those
   counters were checked to be incremented somewhere in the game. Originally
   100; consolidated in v2 to 10 that each carry a family's worth of effect,
   with the per-stat totals held exactly (see "Balance, sixth pass" in
   MOD-NOTES).

   Their continuous effects are summed per stat and applied ONCE, additively.
   The 13 skills from sections 4 and 7 each multiply in sequence, which is what
   produced the runaway curve; doing that with a hundred of them would be
   absurd (100 skills at +15% compounding is ~1.2 million x). Per-level rates
   are also normalised per stat, so a stat carried by 6 skills is not six times
   weaker than one carried by many.
   =========================================================================== */

/* --- tiers ---------------------------------------------------------------- */

/* --- endgame progress -----------------------------------------------------
   Kills earned inside each new area, counted from the game's own akills
   counter while global.current_z is that area. Stored in global.flags so it
   saves with the character, like the tier flags themselves.
   -------------------------------------------------------------------------- */

var MOD_REQ_HOLLOW = 10, MOD_REQ_SPIRE = 15, MOD_REQ_VIGIL = 25;

var MOD_AREA_BY_ID = { 970: 'hollow', 971: 'spire', 972: 'vigil' };

function MOD_prog(k) {
  try { return Number((global.flags.mod_prog || {})[k]) || 0; } catch (e) { return 0; }
}

var MOD_lastAkills = null;

function MOD_progTick() {
  try {
    if (!global.flags.mod_prog) global.flags.mod_prog = { hollow: 0, spire: 0, vigil: 0 };
    var now = Number(global.stat.akills) || 0;
    if (MOD_lastAkills === null) { MOD_lastAkills = now; return; }  // baseline; also resyncs after a load
    if (now > MOD_lastAkills) {
      var z = global.current_z;
      var key = z && MOD_AREA_BY_ID[z.id];
      if (key) {
        global.flags.mod_prog[key] = MOD_prog(key) + (now - MOD_lastAkills);
        MOD_levelCap();
      }
    }
    MOD_lastAkills = now;
  } catch (e) { /* never break a tick over a counter */ }
}

/* Each tier lists the save flags that unlock it — any one is enough. Keeping
   them as data rather than closures means modCaps() can report exactly WHICH
   flag put you on a tier, which is how the `catget` mistake below was found.

   Do not guess at a flag's meaning from its name. `catget` sounds like the
   catacombs; it is actually set by "The cat decided to move into your house",
   i.e. adopting the pet cat, and `cat_g` is petting it 100 times. Both were
   in the catacombs tier and were pushing new characters straight to cap 40.
   The catacombs are detected by visiting them instead (mod_t_cata, set by the
   chss.catamn / chss.cata1 hooks at the bottom of this section). */
/* Caps are the levels a skill can actually REACH, not decorative ceilings.
   Under the game's own exp curve the 10..110 ladder was fiction:
   `expnext = 50 + (lvl+1)^ln(9*lvl+1)` is super-exponential, so lv109->110
   alone costs 1.16e14 xp — 17,200 years at max game speed and the best xp
   rate in the mod. Section 19 replaces that curve with a geometric one tuned
   so a steadily-ticking skill reaches 110 in about six months at 1x, which is
   what makes the full ladder real. Measured per tier by `tests/capreach.mjs`.

   `epow` is a per-tier progression exponent, kept as its own field rather than
   derived from the cap so the ladder can be rescaled without a difficulty
   change riding along. The enemy model no longer reads it (it anchors to the
   player instead — see section 8), but modCaps() and the tests still do. */
var MOD_TIERS = [
  { cap:  10, epow:   0, name: 'The beginning',      flags: [] },
  { cap:  15, epow:   5, name: 'Training complete',  flags: ['tr3_win', 'trnex1', 'trnex2'] },
  { cap:  20, epow:  10, name: 'The forest',         flags: ['mod_t_forest'] },
  { cap:  30, epow:  20, name: 'Deep forest',        flags: ['mod_t_deep', 'frstn1a3u'] },
  { cap:  40, epow:  30, name: 'The catacombs',      flags: ['mod_t_cata'] },
  { cap:  50, epow:  40, name: 'Golem arena I-II',   flags: ['trne1e1', 'trne2e1'] },
  { cap:  60, epow:  50, name: 'Golem arena III-IV', flags: ['trne3e1', 'trne4e1'] },
  // The endgame areas are NOT unlocked by walking in. Clicking through to The
  // Long Vigil once granted cap 110 outright, which is absurd for a place that
  // kills an unprepared character on arrival. Each now needs kills earned
  // there, and each needs the one before it, so the order cannot be skipped.
  { cap:  75, epow:  65, name: 'The Sunken Hollow',  flags: [],
    needText: MOD_REQ_HOLLOW + ' kills in The Sunken Hollow',
    test: function () {
      return MOD_prog('hollow') >= MOD_REQ_HOLLOW
        ? MOD_prog('hollow') + '/' + MOD_REQ_HOLLOW + ' kills in The Sunken Hollow' : null;
    } },
  { cap:  90, epow:  80, name: 'The Ashen Spire',    flags: [],
    needText: MOD_REQ_SPIRE + ' kills in The Ashen Spire (after the Hollow)',
    test: function () {
      return (MOD_prog('hollow') >= MOD_REQ_HOLLOW && MOD_prog('spire') >= MOD_REQ_SPIRE)
        ? MOD_prog('spire') + '/' + MOD_REQ_SPIRE + ' kills in The Ashen Spire' : null;
    } },
  { cap: 110, epow: 100, name: 'The Long Vigil',     flags: [],
    needText: MOD_REQ_VIGIL + ' kills in The Long Vigil (after the Spire)',
    test: function () {
      return (MOD_prog('spire') >= MOD_REQ_SPIRE && MOD_prog('vigil') >= MOD_REQ_VIGIL)
        ? MOD_prog('vigil') + '/' + MOD_REQ_VIGIL + ' kills in The Long Vigil' : null;
    } }
];

function MOD_tierFlag(t) {
  if (t.test) { try { return t.test() || null; } catch (e) { return null; } }
  for (var i = 0; i < t.flags.length; i++) if (global.flags[t.flags[i]]) return t.flags[i];
  return t.flags.length === 0 ? '(start)' : null;
}

var MOD_CAP = { current: MOD_TIERS[0].cap, epow: MOD_TIERS[0].epow,
                name: 'The beginning', why: '(start)', warned: {}, lastAnnounced: 0 };

function MOD_levelCap() {
  var cap = MOD_TIERS[0].cap, name = MOD_TIERS[0].name, why = '(start)',
      epow = MOD_TIERS[0].epow;
  for (var i = 0; i < MOD_TIERS.length; i++) {
    try {
      var f = MOD_tierFlag(MOD_TIERS[i]);
      if (f && MOD_TIERS[i].cap > cap) {
        cap = MOD_TIERS[i].cap; name = MOD_TIERS[i].name; why = f;
        epow = MOD_TIERS[i].epow;
      }
    } catch (e) { /* a missing flag is just a tier not reached */ }
  }
  MOD_CAP.epow = epow;                 // progression exponent; see MOD_TIERS
  if (cap !== MOD_CAP.current) {
    MOD_CAP.current = cap; MOD_CAP.name = name; MOD_CAP.why = why; MOD_CAP.warned = {};
    if (cap > MOD_CAP.lastAnnounced) {
      MOD_CAP.lastAnnounced = cap;
      if (typeof msg === 'function') {
        msg('Skill cap raised to ' + cap + ' — ' + name, 'lime');
      }
    }
  }
  MOD_CAP.why = why;
  return cap;
}

/* Enforcement. Wraps the section 2 multiplier wrapper, so the cap is checked
   before any xp is scaled or granted. The base game's own level-up overflow
   recursion passes res===false and is blocked here too, so a skill cannot
   step past the cap part way through a level-up. */
var MOD_giveSkExp_uncapped = giveSkExp;

giveSkExp = function (sk, exp, res) {
  try {
    if (sk && sk.id === 2100) return MOD_giveSkExp_uncapped(sk, exp, res);   // Renown is cap-exempt
    if (sk && typeof sk.lvl === 'number' && sk.lvl >= MOD_levelCap()) {
      if (!MOD_CAP.warned[sk.id]) {
        MOD_CAP.warned[sk.id] = true;
        if (typeof msg === 'function') {
          msg('<span style="color:grey">' + (sk.bname || sk.name) + ' is at the cap for this point in the story (' +
              MOD_CAP.current + ')</span>', 'grey');
        }
      }
      return;
    }
  } catch (e) { /* if the cap check fails, fall through and grant normally */ }
  return MOD_giveSkExp_uncapped(sk, exp, res);
};

function modCaps() {
  var cur = MOD_levelCap();
  var lines = ['Skill level cap: ' + cur + '  (' + MOD_CAP.name + ')',
               'Set by flag: ' + MOD_CAP.why, ''];
  MOD_TIERS.forEach(function (t) {
    var f = null; try { f = MOD_tierFlag(t); } catch (e) {}
    lines.push('  ' + (f ? '[x]' : '[ ]') + ' cap ' + String(t.cap).padStart(3) + '   ' +
               t.name.padEnd(20) + (f ? 'via ' + f : 'needs ' + (t.needText || t.flags.join(' or ') || '-')));
  });
  lines.push('', 'The cap rises as you reach new places. It is read from the save,');
  lines.push('so it follows the character, not the browser.');
  var out = lines.join('\n');
  console.log(out);
  return out;
}

/* --- predicates the skills below trigger on ------------------------------- */

function MOD_wflag(f) {
  try { return !!(w_manager && w_manager.curr && w_manager.curr[f] === true); } catch (e) { return false; }
}
function MOD_wid(ids) {
  try { return !!(w_manager && w_manager.curr && ids.indexOf(w_manager.curr.id) !== -1); } catch (e) { return false; }
}
function MOD_hpFrac() { return you.hpmax > 0 ? you.hp / you.hpmax : 1; }
function MOD_satFrac() { return you.satmax > 0 ? you.sat / you.satmax : 1; }

var MOD_PRED = {
  anyTime:      function () { return true; },
  anySeason:    function () { return true; },
  awake:        function () { return !global.flags.sleepmode; },
  peaceful:     function () { return !global.flags.btl && !global.flags.sleepmode; },
  inBattle:     function () { return global.flags.btl === true; },
  outdoors:     function () { return !global.flags.inside; },
  indoorsCalm:  function () { return !!global.flags.inside && !global.flags.btl; },
  indoorsDark:  function () { return !!global.flags.inside && global.flags.isdark === true; },
  outdoorsDay:  function () { return !global.flags.inside && global.flags.isday === true; },
  nightOutdoors:function () { return !global.flags.inside && global.flags.isday === false; },

  rain:         function () { return !global.flags.inside && MOD_wflag('frain'); },
  snow:         function () { return !global.flags.inside && MOD_wflag('fsnow'); },
  storm:        function () { return !global.flags.inside && MOD_wid([102, 104, 105]); },
  fog:          function () { return !global.flags.inside && MOD_wid([108, 109]); },
  clearDay:     function () { return !global.flags.inside && global.flags.isday === true  && MOD_wid([100, 111]); },
  clearNight:   function () { return !global.flags.inside && global.flags.isday === false && MOD_wid([100, 111]); },
  outdoorsRough:function () { return !global.flags.inside && (MOD_wflag('frain') || MOD_wflag('fsnow') || global.flags.iscold === true); },
  cold:         function () { return global.flags.iscold === true; },
  wet:          function () { return global.flags.iswet === true; },

  spring:       function () { return getSeason() === 1; },
  summer:       function () { return getSeason() === 2; },
  autumn:       function () { return getSeason() === 3; },
  winter:       function () { return getSeason() === 4; },

  newmoon:      function () { return !global.flags.inside && global.flags.isday === false && getLunarPhase() === 0; },
  waxing:       function () { var p = getLunarPhase(); return !global.flags.inside && global.flags.isday === false && p >= 1 && p <= 3; },
  waning:       function () { var p = getLunarPhase(); return !global.flags.inside && global.flags.isday === false && p >= 5 && p <= 7; },

  dawn:         function () { var h = getHour(); return h >= 5 && h < 7 && !global.flags.sleepmode; },
  dusk:         function () { var h = getHour(); return h >= 20 && h < 22 && !global.flags.sleepmode; },
  deepNight:    function () { var h = getHour(); return (h >= 23 || h < 4) && !global.flags.sleepmode; },

  lowHp:        function () { return MOD_hpFrac() < 0.30; },
  lowHpBattle:  function () { return global.flags.btl === true && MOD_hpFrac() < 0.35; },
  healthy:      function () { return MOD_hpFrac() > 0.90; },
  lowEnergy:    function () { return MOD_satFrac() < 0.25; },
  fullEnergy:   function () { return MOD_satFrac() > 0.90; },
  starving:     function () { return you.sat <= 0; },
  anyHardship:  function () { return MOD_hpFrac() < 0.40 || MOD_satFrac() < 0.20 || global.flags.iscold === true; },
  busyWork:     function () { return global.flags.work === true || global.flags.rdng === true ||
                                     !!(global.current_a && global.current_a.active === true); }
};

/* --- the discovered-by-playing skills ----------------------------------------
   Originally 100 (ids 1001-1100). Consolidated in v2 to 10: each family of
   near-duplicate skills (the many weather/season/moon/combat/trade entries)
   collapsed to one survivor whose `pct` is the SUM of the group's, so the
   per-stat effect budget is byte-for-byte the same. The 12 "flagship" keys
   (see MOD_FLAGSHIP) are all retained. A trailing `// + key, key` on a row
   lists what it absorbed.

   Each survivor KEEPS its original v1 id (so the id list is now gappy). That
   is deliberate for save compatibility: the game restores skill level and
   milestone flags by matching `id` (index.html load(), `a6[a].id===skl[b].id`),
   so a v1 save loads under v2 with every surviving skill's level and perks
   intact — a merged-away id simply finds no match and is skipped. The only
   casualty is the positional `exp`/`p` array (`a7`), which drifts for the
   added skills past this point; `p` is the constructor default 1 on every one
   of them (the mod never writes it), so that swap is a no-op, and `exp` is
   just the progress bar, recomputed on the next xp tick. Full accounting:
   "Balance, sixth pass" in MOD-NOTES.md.
   ------------------------------------------------------------------------- */

var MOD_EXTRA = [
  {key:'kllr', id:1001, type:1, name:"Killing Intent", desc:"Ending fights, and everything that goes into it", note:"Damage dealt, wounds worn, and raw physical work", stat:'str', pct:2.332, counter:'akills', xp:1.2, cap:6},  // + exct, whff, thrw, indr, atrt, bldl, frst, grip, hvyl, endr, apet, gutt
  {key:'mrtl', id:1013, type:2, name:"Mortality", desc:"Understanding gained the hardest way", note:"What dying teaches, if you come back", stat:'str', pct:0.682, counter:'deadt', xp:25, cap:2},  // + clse, rslv
  {key:'stmw', id:1025, type:4, name:"Storm Sense", desc:"Reading a sky, a season and the ground underfoot", note:"Attention paid to weather, stars and sign, out in the open", stat:'int', pct:1.892, pred:'outdoors', xp:0.9},  // + fgnv, wthl, trck, nsky, sprg, wntr, foci, insh, brth2, rcll
  {key:'nwmn', id:1035, type:7, name:"New Moon", desc:"The turning month and the hours after dark", note:"Something clarifies at night, whatever the moon is doing", stat:'int', pct:0.968, pred:'nightOutdoors', xp:1.2},  // + wxmn, wnmn, vgil, dwnr
  {key:'mkng', id:1044, type:5, name:"Making", desc:"Things brought into being, bought, sold and kept", note:"Fluency with tools, goods and what they are worth", stat:'int', pct:1.826, counter:'crftt', xp:2, cap:6},  // + brew, prov, lgts, hggl, acct, spnd, jrny, uphl, invt, slvg
  {key:'stdy', id:1056, type:4, name:"Study", desc:"Everything worked through to the end of the page", note:"Reading, examining, cataloguing, tasting, seeing it through", stat:'int', pct:1.87, counter:'rdttl', xp:4, cap:4},  // + pgtn, exmn, bstl, curi2, plte, temp, qstl, brdt, cntm, nmrc
  {key:'rnge', id:1077, type:3, name:"Ranging", desc:"Ground covered, and getting across it well", note:"Distance, pace and a clean way out when one is needed", stat:'spd', pct:1.056, counter:'plst', xp:1.2, cap:8},  // + shrt, pace, flgt, lngm, alac
  {key:'rflx', id:1092, type:3, name:"Reflexes", desc:"Moving right, before the thought finishes arriving", note:"Reaction, footing, stealth and nerve, rolled into one", stat:'agl', pct:2.618, counter:'dodgt', xp:1.5, cap:5},  // + prcs, thrs, thft, post, rnwk, snwk, atmn, dusk, dlvg, clmb, stlk, nrve, poys
  {key:'wsdm', id:1096, type:4, name:"Wisdom", desc:"The long view: time, rest, seasons and ground covered", note:"Judgement that only accumulates, and cannot be rushed", stat:'int', pct:1.21, counter:'slvs', xp:1.2, cap:6},  // + rest, clck, smsn, rtne, lgcy, pthf, mppg
  {key:'grit', id:1097, type:2, name:"Grit", desc:"Continuing when the conditions are against you", note:"Cold, wet, hungry, hurt, outdoors or out of options", stat:'str', pct:2.882, pred:'anyHardship', xp:0.8},  // + advr, brsr, stnd, mmnt, shvr, sokd, cnda, hyst, sncl, smmr, hngr, rtns, rcvr, wtch, vitl, sate, exps
];

/* Milestones for these are deliberately light. Giving each of them the full
   tier package from MOD_tiers2 — which includes stat MULTIPLIERS — put the
   player at "kill in 1, die in 4271" against every area in the game. These
   grant the skill's own xp rate and a small flat stat instead, so the set
   adds up to something bounded. */
/* The "trains faster" perks carry an `xpBonus` that MOD_selfXpBonus reads from
   the granted milestones. They are deliberately NOT implemented as
   `sk.p += 0.1` the way the base game's equivalents are: `p` is restored from
   the save positionally AFTER milestones re-fire on load, so a newly added
   milestone's increment would be applied and then immediately overwritten.
   Deriving the bonus from the `g` flags — which the save does carry reliably —
   cannot be clobbered.

   Wording is incremental and states the running total, because three
   milestones each saying "trains N% faster" reads as though it replaces the
   last rather than adding to it. */
function MOD_lightTiers(stat) {
  var A = stat + 'a';
  var L = { str: 'STR', int: 'INT', agl: 'AGL', spd: 'SPD' }[stat];
  return [
    // Was "this skill trains +10% faster" — a perk about itself, which reads as
    // filler next to the base game's perks. Replaced with a flat stat in the
    // game's own vocabulary. `rev2` marks the ones that changed, for the
    // migration below. Values were +1/+3/+6 at 100 skills; doubled at the
    // 10-skill consolidation so the flat contribution (which scales with the
    // *number* of these skills) stays in the same range.
    { lv: 10, f: function () { you[A] += 2; you.stat_r(); }, g: false, rev2: true, p: L + " +2" },
    { lv: 25, f: function () { you[A] += 6; you.stat_r(); }, g: false, p: L + " +6" },
    { lv: 50, f: function () { you[A] += 12; you.hpa += 25; you.stat_r(); }, g: false, rev2: true,
      p: L + " +12, HP +25" }
  ];
}

/* Sum of the xpBonus on a skill's own granted milestones. */
function MOD_selfXpBonus(sk) {
  var b = 1;
  if (!sk || !sk.mlstn) return b;
  for (var i = 0; i < sk.mlstn.length; i++) {
    var m = sk.mlstn[i];
    if (m.g === true && m.xpBonus) b += m.xpBonus;
  }
  return b;
}

/* Sum of the sectionXp on the granted milestones of this skill's parent. */
function MOD_sectionXpBonus(sk) {
  var b = 1;
  try {
    var pk = MOD_PARENT_OF[MOD_keyOf(sk)];
    if (!pk) return b;
    var par = skl[pk];
    if (!par || !par.mlstn) return b;
    for (var i = 0; i < par.mlstn.length; i++) {
      var m = par.mlstn[i];
      if (m.g === true && m.sectionXp) b += m.sectionXp;
    }
  } catch (e) {}
  return b;
}

var MOD_EXTRA_STATS = ['str', 'int', 'agl', 'spd'];

MOD_EXTRA.forEach(function (d) {
  var sk = new Skill();
  sk.id = d.id; sk.type = d.type; sk.name = d.name;
  sk.desc = d.desc + MOD_SEP + '<small style="color:darkorange">' + d.note + '</small>';
  sk.mlstn = MOD_lightTiers(d.stat);
  skl[d.key] = sk;

  MOD_EFFECTS[d.key] = function (s) {
    var label = { str: 'Attack power', int: 'Mental acuity', agl: 'Agility', spd: 'Movement speed' }[d.stat];
    var cond = MOD_isConditional(d.pred);
    var pct = d.pct * (cond ? MOD_COND_BONUS : 1);
    var active = !cond || MOD_predMet(d.pred);
    var hint = d.pred ? (MOD_PRED_HINT[d.pred] || d.pred) : null;

    var line = label + ' ' + MOD_pct(s.lvl * pct);
    if (cond) {
      line += ' <small style="color:' + (active ? 'lime' : 'grey') + '">' +
              (active ? 'active now' : 'inactive') + ' \u2014 only ' + hint + '</small>';
    }
    if (s.lvl === 0) {
      line += '<br><small style="color:#9a9">Trains ' + (hint || 'through ' + d.counter) + '</small>';
    }
    return line;
  };
});

var MOD_PRED_HINT = {
  outdoors: 'outdoors', nightOutdoors: 'outdoors at night', outdoorsDay: 'outdoors by day',
  indoorsCalm: 'indoors, out of combat', indoorsDark: 'in dark interiors',
  rain: 'outdoors in rain', snow: 'outdoors in snow', storm: 'outdoors in a storm',
  fog: 'in fog or mist', clearDay: 'under a clear day sky', clearNight: 'under a clear night sky',
  outdoorsRough: 'outdoors in rough conditions', cold: 'while cold', wet: 'while wet',
  spring: 'in spring', summer: 'in summer', autumn: 'in autumn', winter: 'in winter',
  newmoon: 'outdoors under a new moon', waxing: 'outdoors under a waxing moon',
  waning: 'outdoors under a waning moon',
  dawn: 'awake at dawn', dusk: 'awake at dusk', deepNight: 'awake in the small hours',
  lowHp: 'while badly hurt', lowHpBattle: 'fighting while badly hurt', healthy: 'while in good health',
  lowEnergy: 'on low energy', fullEnergy: 'while well fed', starving: 'while starving',
  anyHardship: 'in hard conditions', inBattle: 'in combat', peaceful: 'out of combat',
  awake: 'while awake', anyTime: 'simply by playing', anySeason: 'as seasons pass',
  busyWork: 'while working, reading or mid-action'
};

/* --- xp for them, on the same tick hook ----------------------------------- */

var MOD_seenExtra = {};

function MOD_extraTick() {
  var cap = MOD_levelCap();
  for (var i = 0; i < MOD_EXTRA.length; i++) {
    var d = MOD_EXTRA[i], sk = skl[d.key];
    if (!sk || sk.lvl >= cap) continue;
    if (d.counter) {
      var now = Number(global.stat[d.counter]) || 0;
      var prev = MOD_seenExtra[d.key];
      if (prev === undefined) { MOD_seenExtra[d.key] = now; continue; }
      if (now > prev) {
        var delta = now - prev;
        if (d.cap && delta > d.cap) delta = d.cap;
        giveSkExp(sk, d.xp * delta);
      }
      MOD_seenExtra[d.key] = now;
    } else if (d.pred) {
      var f = MOD_PRED[d.pred];
      if (f && f()) giveSkExp(sk, d.xp);
    }
  }
}

var MOD_ontick_before_extra = ontick;

ontick = function () {
  MOD_ontick_before_extra();
  try { MOD_extraTick(); } catch (e) { /* a tick must never die */ }
  try { if (typeof MOD_updateCapLine === 'function') MOD_updateCapLine(); } catch (e) {}
};

/* --- continuous effects: summed per stat, applied once --------------------
   This supersedes the section 9 wrapper. Order inside:
     1. the game's own allbuff
     2. the 13 multiplying skills from sections 4 and 7 (unchanged)
     3. the additive discovered-by-playing skills, one application per stat
     4. max HP tracks the resulting offence, as section 9 established
   -------------------------------------------------------------------------- */

/* Three predicates are true essentially all the time: playing at all, a season
   being in progress, and being awake. Treating those as "situational" paid them
   the MOD_COND_BONUS 2x for nothing and produced tooltips reading "active now
   — only simply by playing". They count as unconditional. */
var MOD_ALWAYS = { anyTime: 1, anySeason: 1, awake: 1 };

function MOD_isConditional(pred) {
  return !!pred && !MOD_ALWAYS[pred];
}

var MOD_COND_BONUS = 2;

function MOD_predMet(name) {
  try { var f = MOD_PRED[name]; return !!(f && f()); } catch (e) { return false; }
}
function MOD_condMet(fn) {
  try { return !!fn(); } catch (e) { return false; }
}

allbuff = function (who) {
  MOD_allbuff_original(who);

  try {
    if (!who || typeof you === 'undefined' || who.id !== you.id) return;

    var strRef = you.str, hpRef = you.hpmax;
    var i, j, k, dd, sk, d, s2, st;

    /* Two passes, and the order matters.

       PERMANENT first — skills that always apply. Max HP is derived from the
       result of this pass only.

       Then SITUATIONAL. A skill that TRAINS under a condition only APPLIES
       under it: Second Wind said "finding something left after there is nothing
       left" and handed out strength around the clock; Nightwalking claimed
       night-footing and worked at noon. Conditional skills are worth
       MOD_COND_BONUS x more while active, since they are situational.

       Keeping max HP off the situational total fixes a bug where it changed
       mid-fight: Berserking activates below 30% health, which raised STR, which
       raised max HP through hpTrack — so taking a hit could visibly move your
       maximum. Max HP now only moves when permanent power does (a level, a
       milestone, an equipment change). */

    var addPerm = { str: 0, int: 0, agl: 0, spd: 0 };
    var addCond = { str: 0, int: 0, agl: 0, spd: 0 };

    if (skl.qic.lvl) skl.qic.use();
    if (skl.clg.lvl) skl.clg.use();
    if (skl.cnd.lvl) skl.cnd.use();
    for (i = 0; i < MOD_DISCOVERED.length; i++) {
      dd = MOD_DISCOVERED[i]; sk = skl[dd.key];
      if (!sk || !sk.lvl || dd.when) continue;          // permanent only
      sk.use();
    }

    for (j = 0; j < MOD_EXTRA.length; j++) {
      d = MOD_EXTRA[j]; s2 = skl[d.key];
      if (!s2 || !s2.lvl) continue;
      if (MOD_isConditional(d.pred)) {
        if (MOD_predMet(d.pred)) addCond[d.stat] += s2.lvl * d.pct * MOD_COND_BONUS;
      } else {
        addPerm[d.stat] += s2.lvl * d.pct;
      }
    }
    for (k = 0; k < MOD_EXTRA_STATS.length; k++) {
      st = MOD_EXTRA_STATS[k];
      if (addPerm[st] > 0) you[st] += you[st] / 100 * addPerm[st];
    }

    /* Renown last among the permanent effects: being a multiplier, it should
       scale everything permanent that came before it rather than a subtotal. */
    if (skl.rnwn && skl.rnwn.lvl) skl.rnwn.use();

    // Max HP, from permanent offence only — stable through a fight.
    if (strRef > 0 && you.str > strRef) {
      var ratio = you.str / strRef;
      you.hpmax = Math.round(hpRef * Math.pow(ratio, MOD_PLAYER.hpTrack));
      if (you.hp > you.hpmax) you.hp = you.hpmax;
    }

    // Situational effects layer on top and never touch max HP.
    for (i = 0; i < MOD_DISCOVERED.length; i++) {
      dd = MOD_DISCOVERED[i]; sk = skl[dd.key];
      if (!sk || !sk.lvl || !dd.when) continue;
      if (!MOD_condMet(dd.when)) continue;
      sk.use();
    }
    for (k = 0; k < MOD_EXTRA_STATS.length; k++) {
      st = MOD_EXTRA_STATS[k];
      if (addCond[st] > 0) you[st] += you[st] / 100 * addCond[st];
    }
  } catch (e) { /* never break a stat refresh */ }
};

/* --- tier flags, set on arrival ------------------------------------------- */

function MOD_markTier(flag) {
  if (!global.flags[flag]) { global.flags[flag] = true; MOD_levelCap(); }
}

(function () {
  function hook(chsKey, flag) {
    var c = chss[chsKey];
    if (!c) return;
    var orig = c.sl;
    c.sl = function () { MOD_markTier(flag); return orig.apply(this, arguments); };
  }
  hook('frstn1main', 'mod_t_forest');
  // Inside the forest proper. The Hunter's Lodge (frstn1b1) is deliberately
  // NOT here — it is one click from the forest gate, so treating it as deep
  // forest handed out cap 30 on arrival.
  hook('frstn1a1',   'mod_t_deep');
  hook('frstn1a3',   'mod_t_deep');
  hook('frstn1a4',   'mod_t_deep');
  hook('frstn2a1',   'mod_t_deep');
  hook('frstn9a1m',  'mod_t_deep');
  hook('catamn',     'mod_t_cata');
  hook('cata1',      'mod_t_cata');
  // No hooks for the three new areas — those tiers are earned by fighting
  // there, not by arriving. See the tier tests above.
})();

MOD_levelCap();
console.log('[mod] ' + MOD_EXTRA.length + ' additional skills registered; skill cap ' +
            MOD_CAP.current + ' (' + MOD_CAP.name + '). modCaps() for the tier list.');

// Sections 8-10 created skills after the first pass, so run the live-description
// installer again. It is idempotent (see the _modDescInstalled guard), so the
// skills already wrapped are left alone rather than double-wrapped.
console.log('[mod] live descriptions extended to ' + MOD_installLiveDesc() + ' more skills');


/* ===========================================================================
   11. SKILL PANEL: SECTIONS, PARENT SKILLS, HIDE-MAXED
   ---------------------------------------------------------------------------
   With ~95 skills the flat list is unusable. This adds:
     * section headers, grouped by the skill's type
     * a parent skill per section, which boosts xp for its lower-level children
     * checkboxes to hide skills already at the story cap, and to group

   Rendering note: every path in the game that draws the list does
       for(m=0; m<you.skls.length; m++){ renderSkl(you.skls[m]);
         if(m===you.skls.length-1) dom.skcon.children[m].style.borderBottom=... }
   so `dom.skcon.children[m]` is assumed to line up with `you.skls[m]`. Hidden
   rows are therefore rendered and then set to display:none rather than skipped,
   and section headers are inserted INSIDE the row element rather than as
   siblings. Both keep that indexing intact — skipping or adding siblings makes
   `children[m]` undefined and throws.
   =========================================================================== */

var MOD_SECTIONS = {
  1:  'Combat Mastery',
  2:  'Body & Endurance',
  3:  'Fieldcraft',
  4:  'Daily Life',
  5:  'Crafting',
  6:  'Resistances',
  7:  'Affinities',
  8:  'Gathering',
  9:  'Upkeep',
  10: 'Companions'
};

var MOD_SECTION_SHORT = {
  1: 'Combat', 2: 'Body',    3: 'Field',  4: 'Life',   5: 'Craft',
  6: 'Resist', 7: 'Affinity', 8: 'Gather', 9: 'Upkeep', 10: 'Companion'
};

function MOD_sectionOf(sk) {
  var t = sk && sk.type;
  return MOD_SECTIONS[t] ? t : 4;      // anything unexpected lands in Daily Life
}

/* --- parent skills --------------------------------------------------------
   One per section. A parent gains a small share of everything its children
   earn, and in return it pulls its lagging children along: a child below the
   parent's level trains faster, scaled by how far behind it is. That makes a
   neglected skill cheap to bring up once the rest of its section is developed,
   which is the whole point of having 173 of them.

   Parents grant no stats — they are pure support, so they add no power creep.
   -------------------------------------------------------------------------- */

/* The section bonus read straight off a parent, for its own tooltip. */
function MOD_sectionXpBonus_forParent(par) {
  var b = 1;
  if (!par || !par.mlstn) return b;
  for (var i = 0; i < par.mlstn.length; i++) {
    if (par.mlstn[i].g === true && par.mlstn[i].sectionXp) b += par.mlstn[i].sectionXp;
  }
  return b;
}

var MOD_PARENT_KEY = {};      // section id -> parent skill key
var MOD_PARENT_OF  = {};      // child skill key -> parent skill key

var MOD_PARENT = {
  feed: 0.03,      // share of a child's xp that reaches its parent
  perLevel: 0.05,  // child xp bonus per level it lags the parent
  maxGap: 20       // ...capped here, so at most +100%
};

Object.keys(MOD_SECTIONS).forEach(function (t, i) {
  var key = 'par_' + t;
  var sk = new Skill();
  sk.id = 2000 + Number(t);
  sk.type = Number(t);
  // Short name for the row (it already sits under its section header, so the
  // full name would just wrap to two lines); full name in the tooltip.
  sk.name = MOD_SECTION_SHORT[t] + ' Discipline';
  sk.bname = MOD_SECTIONS[t] + ' Discipline';
  sk.desc = 'Overall command of ' + MOD_SECTIONS[t].toLowerCase() + MOD_SEP +
    '<small style="color:darkorange">Pulls along the skills in this section that lag behind it</small>';
  sk.mlstn = [
    { lv: 10, f: function () {}, g: false, sectionXp: 0.10,
      p: "Every skill in this section trains +10% faster" },
    { lv: 25, f: function () {}, g: false, sectionXp: 0.10,
      p: "Section trains +10% faster (20% total)" },
    { lv: 50, f: function () {}, g: false, sectionXp: 0.15,
      p: "Section trains +15% faster (35% total)" }
  ];
  skl[key] = sk;
  MOD_PARENT_KEY[t] = key;

  MOD_EFFECTS[key] = function (s) {
    var sect = (MOD_sectionXpBonus_forParent(s) - 1) * 100;
    return 'Children below lv ' + s.lvl + ' train up to ' +
           MOD_pct(Math.min(s.lvl, MOD_PARENT.maxGap) * MOD_PARENT.perLevel * 100) + ' faster' +
           (sect > 0 ? '<br>Whole section trains ' + MOD_pct(sect) + ' faster' : '');
  };
});

// Map every existing skill to its section's parent. Parents map to nothing,
// so they cannot feed themselves.
(function () {
  Object.keys(skl).forEach(function (k) {
    var sk = skl[k];
    if (!sk || typeof sk !== 'object') return;
    if (k.indexOf('par_') === 0) return;
    MOD_PARENT_OF[k] = MOD_PARENT_KEY[MOD_sectionOf(sk)];
  });
})();

function MOD_parentBonus(sk) {
  var pk = MOD_PARENT_OF[MOD_keyOf(sk)];
  if (!pk) return 1;
  var par = skl[pk];
  if (!par || par.lvl <= sk.lvl) return 1;
  var gap = Math.min(par.lvl - sk.lvl, MOD_PARENT.maxGap);
  return 1 + gap * MOD_PARENT.perLevel;
}

// skl is keyed by name, and skills do not carry their own key, so build a
// reverse index once rather than scanning on every xp grant.
var MOD_KEY_BY_ID = {};
(function () {
  Object.keys(skl).forEach(function (k) {
    var sk = skl[k];
    if (sk && typeof sk === 'object' && sk.id !== undefined) MOD_KEY_BY_ID[sk.id] = k;
  });
})();
function MOD_keyOf(sk) { return sk && MOD_KEY_BY_ID[sk.id]; }

var MOD_giveSkExp_noparent = giveSkExp;
var MOD_feeding = false;

giveSkExp = function (sk, exp, res) {
  // res===false is the base game's own level-up overflow recursion; it must not
  // be multiplied again or feed the parent a second time.
  if (res !== false && sk && !MOD_feeding) {
    try {
      // the skill's own "trains faster" perks, and its section's
      exp = exp * MOD_selfXpBonus(sk) * MOD_sectionXpBonus(sk);

      var pk = MOD_PARENT_OF[MOD_keyOf(sk)];
      if (pk) {
        exp = exp * MOD_parentBonus(sk);
        MOD_feeding = true;
        try { MOD_giveSkExp_noparent(skl[pk], exp * MOD_PARENT.feed); }
        finally { MOD_feeding = false; }
      }
    } catch (e) { /* fall through and grant normally */ }
  }
  return MOD_giveSkExp_noparent(sk, exp, res);
};

function modParents() {
  var lines = ['Parent skills — each boosts the lagging skills in its section:', ''];
  Object.keys(MOD_SECTIONS).forEach(function (t) {
    var par = skl[MOD_PARENT_KEY[t]];
    var kids = Object.keys(MOD_PARENT_OF).filter(function (k) { return MOD_PARENT_OF[k] === MOD_PARENT_KEY[t]; });
    lines.push('  ' + MOD_SECTIONS[t].padEnd(18) + 'lv ' + String(par.lvl).padStart(3) +
               '   ' + String(kids.length).padStart(3) + ' skills');
  });
  lines.push('', 'A child below its parent trains ' + (MOD_PARENT.perLevel * 100) + '% faster per level behind,');
  lines.push('up to +' + (MOD_PARENT.maxGap * MOD_PARENT.perLevel * 100) + '%. Parents earn ' +
             (MOD_PARENT.feed * 100) + '% of what their children earn.');
  var out = lines.join('\n');
  console.log(out);
  return out;
}

/* --- list rendering: headers and hiding ----------------------------------- */

var MOD_UI = { hideMaxed: false, group: true, lastSection: null, sort: 'lvl', sortDesc: false };

var MOD_renderSkl_original = renderSkl;

renderSkl = function (sk) {
  // A fresh pass starts with an empty container; reset the header tracker.
  try { if (dom.skcon && dom.skcon.children.length === 0) MOD_UI.lastSection = null; } catch (e) {}

  var r = MOD_renderSkl_original(sk);

  try {
    var el = dom.skcon && dom.skcon.lastElementChild;
    if (!el) return r;

    if (MOD_UI.hideMaxed && sk.lvl >= MOD_levelCap()) {
      el.style.display = 'none';        // hidden, not skipped — keeps children[m] aligned
      return r;
    }
    el.style.display = '';

    if (MOD_UI.group) {
      var sec = MOD_sectionOf(sk);
      if (sec !== MOD_UI.lastSection) {
        MOD_UI.lastSection = sec;
        var h = document.createElement('div');
        h.innerHTML = MOD_SECTIONS[sec];
        h.style.cssText = 'padding:3px 6px;margin:2px 0 1px 0;font-size:.85em;letter-spacing:1px;' +
                          'color:#8cf;background:#050730;border-top:1px solid #46a;text-align:left;';
        el.insertBefore(h, el.firstChild);   // inside the row, not a sibling
      }
    }
  } catch (e) { /* a list that draws is better than one that throws */ }

  return r;
};

function MOD_isParent(sk) {
  return !!(sk && sk.id >= 2001 && sk.id <= 2010);
}

/* Ordering. A section's parent always comes first in that section, whichever
   sort is active — the parent is the section's heading skill, so it reads
   wrong anywhere else. Within a section the user's chosen sort still applies;
   MOD_UI.sort tracks which of the game's A-Z / TPE / LVL buttons was last
   pressed, because the game only records a direction toggle, not which one. */
function MOD_skillCmp(a, b) {
  if (MOD_UI.group) {
    var sa = MOD_sectionOf(a), sb = MOD_sectionOf(b);
    if (sa !== sb) return sa - sb;
    var pa = MOD_isParent(a) ? 0 : 1, pb = MOD_isParent(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
  }
  var dir = MOD_UI.sortDesc ? -1 : 1;
  switch (MOD_UI.sort) {
    case 'name': return dir * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    case 'type': return dir * (((a.type || 0) - (b.type || 0)) || ((a.id || 0) - (b.id || 0)));
    default:     return dir * ((b.lvl - a.lvl) || (a.name < b.name ? -1 : 1));
  }
}

function MOD_redrawSkills() {
  try {
    if (!dom.skcon) return;
    you.skls.sort(MOD_skillCmp);
    empty(dom.skcon);
    MOD_UI.lastSection = null;
    for (var m = 0; m < you.skls.length; m++) renderSkl(you.skls[m]);
    MOD_fitSkcon();
  } catch (e) { console.warn('[mod] redraw failed: ' + e.message); }
}

/* --- the checkboxes -------------------------------------------------------
   The panel is built inside the game's own inline click handler on ct_bt2,
   which cannot be wrapped. A second listener on the same element runs after
   it, by which point dom.ctrwin3 and dom.skcon exist.
   -------------------------------------------------------------------------- */

/* The cap line above the list. Refreshed from the tick hook so it follows a
   tier unlock immediately, rather than only when the panel is reopened. */
/* What the next tier wants, shown under the cap so progress toward it is
   visible rather than something you have to go looking for. */
/* The game hard-sets dom.skcon to 335px inside `.ctrwinbx`, a fixed box at
   top:53px. Adding a control bar above the list pushed the total past the
   panel, so the list ran on underneath the save bar. Shrink the scroll area by
   whatever the bar occupies — and recompute it whenever the bar's height can
   change, which is when the "Next: cap ..." line appears or disappears. */
/* --- progress check / cap recalculation ------------------------------------
   Recomputes the cap from what the save can actually evidence, and reports
   each tier with the reason it is or is not met.

   It also drops mod_t_hollow / mod_t_spire / mod_t_vigil. Those were set by
   merely visiting the endgame areas, which is the bug that handed out cap 110
   for one click. The tiers no longer read them, but a save carrying them is
   carrying a record of something that was never earned, so they are cleared.
   -------------------------------------------------------------------------- */

var MOD_LEGACY_FLAGS = ['mod_t_hollow', 'mod_t_spire', 'mod_t_vigil'];

function modClears(quiet) {
  var cap = MOD_levelCap();
  var lines = [];
  var log = function (text, colour) {
    lines.push(text);
    if (!quiet && typeof msg === 'function') msg(text, colour);
  };

  log('=== Progress check ===', 'gold');
  MOD_TIERS.forEach(function (t) {
    var f = null; try { f = MOD_tierFlag(t); } catch (e) {}
    log((f ? '\u2714 ' : '\u2718 ') + 'cap ' + t.cap + ' \u2014 ' + t.name +
        (f ? '  [' + f + ']' : '  needs ' + (t.needText || t.flags.join(' or ') || '-')),
        f ? 'lime' : 'grey');
  });

  var pr = global.flags.mod_prog || {};
  log('Endgame kills \u2014 Hollow ' + (Number(pr.hollow) || 0) + '/' + MOD_REQ_HOLLOW +
      ', Spire ' + (Number(pr.spire) || 0) + '/' + MOD_REQ_SPIRE +
      ', Vigil ' + (Number(pr.vigil) || 0) + '/' + MOD_REQ_VIGIL, 'skyblue');
  log('Skill cap: ' + cap + ' (' + MOD_CAP.name + ')', 'gold');

  var out = lines.join('\n');
  console.log(out);
  return out;
}

function modResetCap() {
  var cleared = [];
  MOD_LEGACY_FLAGS.forEach(function (f) {
    if (global.flags[f]) { delete global.flags[f]; cleared.push(f); }
  });
  MOD_CAP.lastAnnounced = 0;
  MOD_CAP.current = -1;                 // force a recompute, and let it announce again
  var cap = MOD_levelCap();
  MOD_CAP.warned = {};
  try { MOD_updateCapLine(); } catch (e) {}
  try { MOD_redrawSkills(); } catch (e) {}
  if (typeof msg === 'function') {
    msg('Skill cap recalculated: ' + cap + ' (' + MOD_CAP.name + ')', 'gold');
    if (cleared.length) msg('Cleared unearned flags: ' + cleared.join(', '), 'grey');
  }
  console.log('[mod] cap recalculated to ' + cap + (cleared.length ? '; cleared ' + cleared.join(', ') : ''));
  return cap;
}

function MOD_fitSkcon() {
  try {
    var bar = document.getElementById('mod_skill_controls');
    if (!bar || !dom.skcon || !MOD_UI.baseSkconH) return;
    var h = MOD_UI.baseSkconH - bar.offsetHeight;
    dom.skcon.style.height = Math.max(120, h) + 'px';
  } catch (e) { /* cosmetic */ }
}

function MOD_nextTierLine() {
  try {
    var cap = MOD_CAP.current, next = null;
    for (var i = 0; i < MOD_TIERS.length; i++) {
      var t = MOD_TIERS[i];
      if (t.cap > cap && (next === null || t.cap < next.cap) && !MOD_tierFlag(t)) next = t;
    }
    if (!next) return '';
    var want = next.needText || (next.flags.length ? 'reach ' + next.name : '');
    if (!want) return '';
    return '<br><small style="color:#68a">Next: cap ' + next.cap + ' — ' + want + '</small>';
  } catch (e) { return ''; }
}

function MOD_updateCapLine() {
  try {
    var el = document.getElementById('mod_cap_line');
    if (!el) return;
    var cap = MOD_levelCap();
    var atCap = 0;
    for (var i = 0; i < you.skls.length; i++) if (you.skls[i].lvl >= MOD_skillCeiling(you.skls[i])) atCap++;
    el.innerHTML =
      'Skill cap <span style="color:gold;font-weight:bold">' + cap + '</span>' +
      ' <span style="color:#7cf">' + MOD_CAP.name + '</span>' +
      (you.skls.length ? ' <small style="color:grey">(' + atCap + '/' + you.skls.length + ' maxed)</small>' : '') +
      MOD_nextTierLine();
    el.title = 'Set by: ' + MOD_CAP.why + ' — run modCaps() for the full tier list';
    MOD_fitSkcon();
  } catch (e) { /* the label is cosmetic; never let it break a tick */ }
}

function MOD_skillControls() {
  try {
    if (!dom.ctrwin3 || !dom.skcon) return;
    if (document.getElementById('mod_skill_controls')) return;   // already there this pass

    var bar = document.createElement('div');
    bar.id = 'mod_skill_controls';
    bar.style.cssText = 'padding:3px;font-size:.82em;color:#9bd;background:#050730;';

    // Current cap, front and centre — it is the thing that decides whether a
    // skill can still move, so it belongs above the list rather than in a
    // console command.
    var capLine = document.createElement('div');
    capLine.id = 'mod_cap_line';
    capLine.style.cssText = 'text-align:center;padding:1px 0 3px 0;';
    bar.appendChild(capLine);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;align-items:center;justify-content:center;';

    function box(labelText, initial, onChange) {
      var wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = initial;
      cb.style.cssText = 'cursor:pointer;margin:0;';
      cb.addEventListener('change', function () { onChange(cb.checked); });
      var sp = document.createElement('span');
      sp.innerHTML = labelText;
      wrap.appendChild(cb); wrap.appendChild(sp);
      return wrap;
    }

    row.appendChild(box('Hide maxed', MOD_UI.hideMaxed, function (v) {
      MOD_UI.hideMaxed = v; MOD_redrawSkills();
    }));
    row.appendChild(box('Group by type', MOD_UI.group, function (v) {
      MOD_UI.group = v; MOD_redrawSkills();
    }));

    var btn = document.createElement('div');
    btn.innerHTML = 'Recheck clears';
    btn.style.cssText = 'cursor:pointer;border:1px solid #46a;padding:0 6px;border-radius:2px;' +
                        'color:#cfe;user-select:none;';
    btn.addEventListener('mouseenter', function () { btn.style.background = '#0b1040'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = 'transparent'; });
    btn.addEventListener('click', function () { modClears(); modResetCap(); });
    row.appendChild(btn);

    var rbtn = document.createElement('div');
    rbtn.innerHTML = 'Renown';
    rbtn.style.cssText = 'cursor:pointer;border:1px solid #46a;padding:0 6px;border-radius:2px;' +
                         'color:#cfe;user-select:none;';
    rbtn.addEventListener('mouseenter', function () { rbtn.style.background = '#0b1040'; });
    rbtn.addEventListener('mouseleave', function () { rbtn.style.background = 'transparent'; });
    rbtn.addEventListener('click', function () { modRenown(); modTitles(); MOD_redrawSkills(); });
    row.appendChild(rbtn);

    bar.appendChild(row);

    // captured before the bar goes in, on a freshly rebuilt panel
    MOD_UI.baseSkconH = parseInt(dom.skcon.style.height, 10) || dom.skcon.offsetHeight || 335;

    dom.ctrwin3.insertBefore(bar, dom.skcon);

    /* The game's sort buttons call you.skls.sort() inside their own inline
       handlers and redraw directly. Listeners added here run after those, so
       note which button it was and re-apply the section/parent ordering. */
    var SORTS = { 'A-Z': 'name', 'TPE': 'type', 'LVL': 'lvl' };
    Array.prototype.forEach.call(dom.ctrwin3.querySelectorAll('.bts_b'), function (btn) {
      var mode = SORTS[(btn.innerHTML || '').trim()];
      if (!mode) return;
      btn.addEventListener('click', function () {
        if (MOD_UI.sort === mode) MOD_UI.sortDesc = !MOD_UI.sortDesc;
        else { MOD_UI.sort = mode; MOD_UI.sortDesc = false; }
        setTimeout(MOD_redrawSkills, 0);
      });
    });

    MOD_updateCapLine();
    MOD_fitSkcon();
    MOD_redrawSkills();
  } catch (e) { console.warn('[mod] skill controls failed: ' + e.message); }
}

if (dom.ct_bt2 && dom.ct_bt2.addEventListener) {
  dom.ct_bt2.addEventListener('click', function () { setTimeout(MOD_skillControls, 0); });
}

/* --- live action tooltips -------------------------------------------------
   renderAct does `addDesc(el, null, 2, a.name, a.desc())` — desc() is called
   once, at render time, so an action's tooltip is a snapshot. Making desc()
   report current skill levels means it refreshes every time the actions panel
   is opened, which is when renderAct runs again.
   -------------------------------------------------------------------------- */

function MOD_trainLine(pairs) {
  var cap = MOD_levelCap();
  return pairs.map(function (p) {
    var sk = skl[p[0]];
    if (!sk) return '';
    var at = sk.lvl >= cap ? '<span style="color:grey">at cap</span>'
                           : 'lv ' + sk.lvl + '/' + cap;
    return '<span style="color:skyblue">' + (sk.bname || sk.name) + '</span> ' +
           '<small>(' + at + ', +' + p[1] + '/tick)</small>';
  }).filter(Boolean).join('<br>');
}

act.mod_qi.desc = function () {
  return 'Sit and guide your energy through its channels' + MOD_SEP +
    '<span style="color:pink">Exp +0.4/s</span><br>' +
    MOD_trainLine([['qic', 0.9], ['mdt', 0.35], ['ptnc', 0.2]]);
};
act.mod_forage.desc = function () {
  return 'Search the area for anything edible or useful' + MOD_SEP +
    '<span style="color:pink">Exp +0.4/s</span><br>' +
    MOD_trainLine([['frg', 1.0]]) +
    '<br><small style="color:springgreen">Find chance ' +
    MOD_pct(MOD_forageChance(skl.frg.lvl) * 100) + ' per tick</small>' +
    '<br><span style="color:crimson">Energy Consumption +0.05/s</span>';
};
act.mod_calli.desc = function () {
  return 'Grind ink and work through your strokes' + MOD_SEP +
    '<span style="color:pink">Exp +0.5/s</span><br>' +
    MOD_trainLine([['clg', 0.85], ['rdg', 0.3], ['ptnc', 0.3]]);
};
act.mod_cond.desc = function () {
  return 'Work your body to its limit and past it' + MOD_SEP +
    '<span style="color:pink">Exp +0.6/s</span><br>' +
    MOD_trainLine([['cnd', 1.2], ['tghs', 0.4], ['walk', 0.5]]) +
    '<br><span style="color:crimson">Energy Consumption +0.15/s</span>' +
    '<br><small style="color:grey">Trains at full rate only while fed</small>';
};

console.log('[mod] live descriptions on parent skills: ' + MOD_installLiveDesc());
console.log('[mod] ' + Object.keys(MOD_SECTIONS).length + ' sections with parent skills; ' +
            'skill panel has Hide maxed / Group by type. modParents() for details.');


/* ===========================================================================
   12. EFFECT LINES FOR THE SKILLS THAT WERE LEFT BLANK
   ---------------------------------------------------------------------------
   Section 5 gave an effect line only to skills whose `use()` produced a value
   I had traced to a call site, and printed nothing for the rest rather than
   invent a number. Water Absorption was one of the blanks.

   Going back through them properly, most of those skills DO have a real
   effect — it just is not expressed through `use()`. They are read directly as
   `skl.<x>.lvl` inside whatever system they belong to. Each formula below is
   quoted from the line in the game that uses it.

   Four genuinely do nothing: Fire, Earth, Light and Dark Absorption appear
   nowhere in the game outside their own definitions. They are unimplemented in
   the base game, and their tooltips now say so rather than staying silent.
   =========================================================================== */

function MOD_num(n, dp) {
  var f = Math.pow(10, dp === undefined ? 2 : dp);
  return Math.round(n * f) / f;
}

// --- the affinities -------------------------------------------------------
// `if(global.flags.iswet===true) lose*=(3/(1+(skl.abw.lvl*.03)))`
MOD_EFFECTS.abw = function (s) {
  var m = 3 / (1 + s.lvl * 0.03);
  return 'Energy drain while wet ×' + MOD_num(m) +
         ' <small style="color:grey">(×3 untrained, ×1 at lv 66)</small>';
};

// `let d = (200/(1+skl.aba.lvl*.05))<<0;`  — damage from a lightning strike
MOD_EFFECTS.aba = function (s) {
  return 'Lightning strike damage ' + Math.floor(200 / (1 + s.lvl * 0.05)) +
         ' <small style="color:grey">(200 untrained)</small>';
};

['abf', 'abe', 'abl', 'abd'].forEach(function (k) {
  MOD_EFFECTS[k] = function () {
    return '<span style="color:grey">No effect — unimplemented in the base game</span>';
  };
});

// --- combat ---------------------------------------------------------------
// `...*100+10-skl.evas.lvl`  — subtracted from the enemy's hit chance
MOD_EFFECTS.evas = function (s) { return 'Enemy hit chance ' + MOD_pct(-s.lvl); };

// `Math.round(hit_a*(drk?(.3+skl.ntst.lvl*.07):1))`
MOD_EFFECTS.ntst = function (s) {
  var f = Math.min(0.3 + s.lvl * 0.07, 1);
  return 'Hit chance in darkness ' + Math.round(f * 100) + '% of normal' +
         (f >= 1 ? ' <small style="color:grey">(no penalty)</small>' : '');
};

// `(1+skl.unc.lvl*.1+skl.fgt.lvl*.08+skl.tghs.lvl*.11)`
MOD_EFFECTS.tghs = function (s) { return 'Contributes ' + MOD_pct(s.lvl * 11) + ' to the toughness term'; };

// `setTimeout(()=>{this.disabled=false},(500/(skl.thr.lvl||1)))`
MOD_EFFECTS.thr = function (s) {
  return 'Throw cooldown ' + Math.round(500 / (s.lvl || 1)) + 'ms' +
         ' <small style="color:grey">(500ms untrained)</small>';
};

// --- craft and utility ----------------------------------------------------
// `let tm = (5000-(skl.crft.lvl*350+skl.ptnc.lvl*150)<300?300:...)`
MOD_EFFECTS.crft = function (s) {
  return 'Crafting time −' + Math.min(s.lvl * 350, 4700) + 'ms' +
         ' <small style="color:grey">(from 5000ms, floor 300ms)</small>';
};
MOD_EFFECTS.ptnc = function (s) {
  return 'Crafting time −' + Math.min(s.lvl * 150, 4700) + 'ms' +
         ' <small style="color:grey">(stacks with Crafting)</small>';
};

// `let rn = random()+skl.cook.lvl*.1; if(rn>=.30) giveItem(...)`
MOD_EFFECTS.cook = function (s) {
  return 'Cooking success ' + Math.min(Math.round((0.7 + s.lvl * 0.1) * 100), 100) + '%';
};

// `am = (am+am*(obj.dss[a].q*skl.dssmb.lvl))<<0`
MOD_EFFECTS.dssmb = function (s) { return 'Salvage yield ×(1 + quality × ' + s.lvl + ')'; };

// `chs.data.scout+=2*(1+skl.scout.lvl*.2)`
MOD_EFFECTS.scout = function (s) { return 'Scouting speed ' + MOD_pct(s.lvl * 20); };

// `(global.current_z.drop[obj].c/75*skl.hst.lvl)` added to the drop roll
MOD_EFFECTS.hst = function (s) { return 'Area drop chance +' + MOD_num(s.lvl / 75 * 100, 2) + '% of base'; };

// `if(random()<=(.3+skl.dice.lvl*.03))`
MOD_EFFECTS.dice = function (s) {
  return 'Find chance ' + Math.min(Math.round((0.3 + s.lvl * 0.03) * 100), 100) + '%';
};

// `you.agle/=1+(.4-skl.drka.lvl*.03); you.stre*=1+(.2+skl.drka.lvl*.02)`
MOD_EFFECTS.drka = function (s) {
  var pen = Math.max(0.4 - s.lvl * 0.03, 0);
  return 'While drunk: AGL penalty ' + Math.round(pen * 100) + '%' +
         (pen <= 0 ? ' <small style="color:grey">(none)</small>' : '') +
         ', STR ' + MOD_pct((0.2 + s.lvl * 0.02) * 100);
};

// `giveSkExp(skl.glt,rand(100,(355*(skl.glt.lvl*.2+1))))` — its own xp per meal
MOD_EFFECTS.glt = function (s) {
  return 'Trains up to ' + Math.round(355 * (s.lvl * 0.2 + 1)) + ' per meal' +
         ' <small style="color:grey">(355 untrained)</small>';
};

MOD_EFFECTS.pet = function (s) {
  return s.lvl >= 10 ? 'Title earned at lv 10'
                     : '<span style="color:grey">Grants a title at lv 10 — no other effect in the base game</span>';
};

console.log('[mod] effect lines added for ' +
  ['abw','aba','abf','abe','abl','abd','evas','ntst','tghs','thr','crft','ptnc','cook','dssmb','scout','hst','dice','drka','glt','pet'].length +
  ' previously blank skills');


/* ===========================================================================
   13. AFFINITY EFFECTS  +  COLLAPSIBLE SKILL GROUPS
   ---------------------------------------------------------------------------
   A. The four dead affinities get real effects.

   Water and Air were the only two of the six the base game wired up. The other
   four are given effects in the same spirit — each reduces damage of the kind
   its description already claims protection from — routed through the game's
   own `you.res` table rather than a parallel system:

       dmg = dmg * def.res.ph * pn        // res values are damage MULTIPLIERS
       you.res.ph -= .01                  // ...so lower is better; this is how
                                          //    the base game's own perks do it

   `you.res` is saved (`res:you.res` in the save object), so mutating it bakes
   the reduction into the save. The amount applied is therefore tracked in
   `global.flags`, which is saved alongside it — on load both come back
   consistent and the reconciliation subtracts only the difference. Without
   that pairing the bonus would be reapplied on top of itself every load.
   =========================================================================== */

var MOD_AFF = {
  abf: { res: 'burn',     label: 'Burn damage' },
  abe: { res: 'ph',       label: 'Physical damage' },
  abl: { res: 'blind',    label: 'Blind effects' },
  abd: { res: 'curse',    label: 'Curse effects' }
};

var MOD_AFF_RATE = 0.008;   // damage reduction per level
var MOD_AFF_MAX  = 0.50;    // ...capped at 50%, reached around level 62

function MOD_affWant(sk) {
  return Math.min((sk ? sk.lvl : 0) * MOD_AFF_RATE, MOD_AFF_MAX);
}

function MOD_applyAffinities() {
  try {
    if (typeof you === 'undefined' || !you.res) return;
    if (!global.flags.mod_aff) global.flags.mod_aff = {};
    var applied = global.flags.mod_aff;

    Object.keys(MOD_AFF).forEach(function (k) {
      var resKey = MOD_AFF[k].res;
      var want = MOD_affWant(skl[k]);
      var have = Number(applied[resKey]) || 0;
      if (want !== have) {
        you.res[resKey] -= (want - have);   // apply only the difference
        applied[resKey] = want;
      }
    });
  } catch (e) { /* never break a tick over a resistance */ }
}

// Undo everything this mod took off `you.res`, for going back to vanilla.
function modResetAffinities() {
  try {
    var applied = global.flags.mod_aff || {};
    Object.keys(applied).forEach(function (resKey) {
      you.res[resKey] += Number(applied[resKey]) || 0;
    });
    global.flags.mod_aff = {};
    console.log('[mod] affinity resistance bonuses removed from you.res');
    return true;
  } catch (e) { console.warn('[mod] ' + e.message); return false; }
}

Object.keys(MOD_AFF).forEach(function (k) {
  MOD_EFFECTS[k] = function (s) {
    var r = MOD_affWant(s);
    return MOD_AFF[k].label + ' ' + MOD_pct(-r * 100) +
           (r >= MOD_AFF_MAX ? ' <small style="color:grey">(capped)</small>'
                             : ' <small style="color:grey">(max −' + (MOD_AFF_MAX * 100) + '% at lv ' +
                               Math.ceil(MOD_AFF_MAX / MOD_AFF_RATE) + ')</small>');
  };
});

var MOD_ontick_before_aff = ontick;
ontick = function () {
  MOD_ontick_before_aff();
  try { MOD_applyAffinities(); } catch (e) {}
  try { MOD_progTick(); } catch (e) {}
};

MOD_applyAffinities();


/* ===========================================================================
   B. Collapsible groups.
   ---------------------------------------------------------------------------
   Clicking a section header folds that section away. This supersedes the
   section 11 renderSkl wrapper — it re-wraps MOD_renderSkl_original directly
   rather than stacking on top of it, which would draw every header twice.

   The children[m] constraint from section 11 still applies, so a collapsed
   section keeps its rows in the DOM: the first row of the section stays
   visible to carry the header and has its own content hidden, and the rest are
   set to display:none. Row count still equals you.skls.length.
   =========================================================================== */

MOD_UI.collapsed = {};

/* A skill's own ceiling. Everything obeys the story cap except Renown, which
   is capped at its own maximum instead. */
function MOD_skillCeiling(sk) {
  if (sk && sk.id === 2100) return (typeof MOD_RENOWN_MAX === 'number') ? MOD_RENOWN_MAX : 10;
  return MOD_levelCap();
}

function MOD_sectionHeader(sec) {
  var cap = MOD_levelCap(), total = 0, maxed = 0;
  for (var i = 0; i < you.skls.length; i++) {
    if (MOD_sectionOf(you.skls[i]) === sec) { total++; if (you.skls[i].lvl >= MOD_skillCeiling(you.skls[i])) maxed++; }
  }
  var collapsed = !!MOD_UI.collapsed[sec];

  var h = document.createElement('div');
  h.setAttribute('data-mod-header', '1');
  // .skwmmc is display:flex, so order:-1 with a full-width basis puts this
  // visually ABOVE the row while it sits LAST in the DOM. That matters: the
  // game's per-second updater reads children[0], children[1] and
  // children[2].children[0] of each row, so nothing may be inserted before
  // them. Prepending the header shifted all three and threw on every tick.
  h.style.cssText = 'order:-1;flex:0 0 100%;padding:3px 6px;margin:2px 0 1px 0;' +
                    'font-size:.85em;letter-spacing:1px;' +
                    'color:#8cf;background:#050730;border-top:1px solid #46a;text-align:left;' +
                    'cursor:pointer;user-select:none;';
  h.innerHTML =
    '<span style="display:inline-block;width:12px;color:#7cf">' + (collapsed ? '&#9656;' : '&#9662;') + '</span>' +
    MOD_SECTIONS[sec] +
    ' <small style="color:grey;letter-spacing:0">(' + total +
      (maxed ? ', ' + maxed + ' maxed' : '') + ')</small>';

  h.addEventListener('click', function (ev) {
    ev.stopPropagation();
    MOD_UI.collapsed[sec] = !MOD_UI.collapsed[sec];
    MOD_redrawSkills();
  });
  return h;
}

renderSkl = function (sk) {
  try { if (dom.skcon && dom.skcon.children.length === 0) MOD_UI.lastSection = null; } catch (e) {}

  var r = MOD_renderSkl_original(sk);

  try {
    var el = dom.skcon && dom.skcon.lastElementChild;
    if (!el) return r;
    el.style.display = '';

    var sec = MOD_sectionOf(sk);
    var header = null;
    if (MOD_UI.group && sec !== MOD_UI.lastSection) {
      MOD_UI.lastSection = sec;
      header = MOD_sectionHeader(sec);
      el.style.flexWrap = 'wrap';
      el.appendChild(header);          // last child; children[0..2] stay put
    }

    var collapsed = MOD_UI.group && !!MOD_UI.collapsed[sec];
    // Renown ignores the story cap and tops out at its own maximum, so judging
    // it by MOD_levelCap() would hide it the moment it passed the current cap.
    var ceiling = MOD_skillCeiling(sk);
    var maxedOut  = MOD_UI.hideMaxed && sk.lvl >= ceiling;

    if (collapsed || maxedOut) {
      if (header) {
        // keep this row as a bare header: hide its own cells, drop its chrome
        for (var i = 0; i < el.children.length; i++) {
          if (el.children[i] !== header) el.children[i].style.display = 'none';
        }
        el.style.border = 'none';
        el.style.background = 'transparent';
        el.style.padding = '0';
      } else {
        el.style.display = 'none';
      }
    }
  } catch (e) { /* a list that draws beats one that throws */ }

  return r;
};

console.log('[mod] four dead affinities now have effects; skill groups are collapsible');


/* ===========================================================================
   14. PARENT SKILLS PRESENT FROM THE START
   ---------------------------------------------------------------------------
   Skills only appear in the list once they first level up (giveSkExp pushes
   them into you.skls), so the ten parents were invisible until their children
   had fed them enough. Seeding them at level 1 puts the section structure on
   the sheet from the first minute.

   Re-seeded from the tick as well as at load, because the game's load() does
   `for(let ab in skl){skl[ab].lvl=0; skl[ab].exp=0;}` and then rebuilds
   you.skls from the save — so a save made before this existed comes back
   without them. Once seeded and saved they restore normally, and the re-seed
   becomes a no-op.
   =========================================================================== */

function MOD_seedParents() {
  var added = 0;
  try {
    if (typeof you === 'undefined' || !you.skls) return 0;

    Object.keys(MOD_PARENT_KEY).forEach(function (t) {
      var sk = skl[MOD_PARENT_KEY[t]];
      if (!sk) return;
      if (sk.lvl < 1) {
        sk.lvl = 1;
        sk.exp = 1;
        sk.expnext_t = sk.expnext();
      }
      if (you.skls.indexOf(sk) === -1) { you.skls.push(sk); added++; }
    });

    // Reveal the skills tab, the same way the game does on a first skill.
    if (added && !global.flags.sklu) {
      try { dom.ct_bt2.innerHTML = 'skills'; global.flags.sklu = true; } catch (e) {}
    }
  } catch (e) { /* never break a tick over the seed */ }
  return added;
}

var MOD_ontick_before_seed = ontick;
ontick = function () {
  MOD_ontick_before_seed();
  try { MOD_seedParents(); } catch (e) {}
};

console.log('[mod] parent skills seeded at level 1: ' + MOD_seedParents() + ' added');


/* ===========================================================================
   15. SELLING
   ---------------------------------------------------------------------------
   The base game never implemented it. `Vendor` has `items` and `stock` and no
   sell path, but four vendors carry a `dfl` field — a sell-back rate of 0.2 to
   0.3 — that is assigned and read exactly zero times. The hook was left in and
   never wired up, like the dead affinities.

   The hard part is that prices live on the VENDOR'S stock entry, not on items:

       vendor.stvr1.items = [{item: item.cbun1, p: 6, ...}]

   so an item in your pack has no intrinsic worth. Only 55 of 543 item objects
   are priced anywhere in the game. Values for the rest are derived, in this
   order of preference — earlier rules use the author's own numbers, later ones
   are increasingly inferred:

     1. Vendor-priced        the author's price, exactly (55 items)
     2. Craftable            sum of its recipe inputs x 1.25, resolved
                             recursively from real rcp data
     3. Equipment with stats 5.3 x (str+agl+int+spd+dpmax/10). The 5.3 is the
                             MEDIAN price-per-stat of the 7 stat-bearing
                             equipment anchors (their ratios run 3.4 to 9.6)
     4. Anything else        that stype's median anchor price at rarity 1,
                             times a rarity multiplier

   Rule 4's rarity curve is the one genuinely invented part: the anchors are
   52/55 rarity-1 items, with two at rarity 0 and one at rarity 2, so there is
   nothing to fit above that. The two observations (rar 0 ~0.22x, rar 2 ~12.7x
   of the rarity-1 median) bracket it; the curve below is a deliberate, more
   conservative choice, and it is one line to retune.
   =========================================================================== */

var MOD_VAL = {
  anchors: {},        // item id -> the author's own price
  madeBy: {},         // item id -> a recipe that produces it
  dropFrom: {},       // item id -> {lvl, chance} of the easiest source
  cache: {},
  craftMargin: 1.25,
  statRate: 5.3,      // median price-per-stat across the equipment anchors
  rarMult:   { 0: 0.25, 1: 1, 2: 5, 3: 15, 4: 45, 5: 130 },
  stypeBase: { 1: 100, 2: 2, 3: 70, 4: 16, 5: 25 },   // rarity-1 medians per stype
  defaultDfl: 0.25
};

/* Records the EASIEST way to get an item: the lowest enemy level that drops it
   and the best chance at that. Both feed rule 5 below. */
function MOD_noteDrop(id, lvl, chance) {
  if (id === undefined) return;
  var c = typeof chance === 'number' && chance > 0 ? chance : 0.01;
  var cur = MOD_VAL.dropFrom[id];
  if (!cur) { MOD_VAL.dropFrom[id] = { lvl: lvl, chance: c }; return; }
  if (lvl < cur.lvl) cur.lvl = lvl;
  if (c > cur.chance) cur.chance = c;
}

/* Rule 5: value from where a thing drops. Scales with the level of the weakest
   creature that yields it and inversely with how often. Applied only when it
   EXCEEDS the type/rarity estimate, so it lifts endgame loot without cheapening
   common early items — and never overrides a vendor's own price.

   Calibrated to a target income curve rather than fitted to anchors (no anchored
   item appears in a drop table): roughly 1-3 per kill in the early forest rising
   to 30-60 in the endgame areas, against vendor prices with a median of 31. */
var MOD_DROP_RATE = 0.8, MOD_DROP_LVL_POW = 1.25, MOD_DROP_SCARCITY_POW = 0.35;

function MOD_dropValue(id) {
  var d = MOD_VAL.dropFrom[id];
  if (!d) return 0;
  return MOD_DROP_RATE *
         Math.pow(Math.max(d.lvl, 1), MOD_DROP_LVL_POW) *
         Math.pow(1 / Math.min(Math.max(d.chance, 0.001), 1), MOD_DROP_SCARCITY_POW);
}

(function () {
  var priced = 0;
  for (var v in vendor) {
    var list = vendor[v] && vendor[v].items;
    if (!list) continue;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.item || typeof e.p !== 'number') continue;
      var id = e.item.id;
      // a vendor may mark it up; take the lowest price any vendor asks
      if (MOD_VAL.anchors[id] === undefined || e.p < MOD_VAL.anchors[id]) {
        MOD_VAL.anchors[id] = e.p;
      }
      priced++;
    }
  }
  /* Rarity turns out to be a dead signal here: endgame loot like Life Stone is
     flagged rarity 1 exactly like a mushroom, so rules 1-4 priced every drop in
     The Long Vigil at 16. What DOES separate them is the level of the creature
     that drops it, and how often. Both are real data in the area tables. */
  for (var a in area) {
    var ar = area[a];
    if (!ar || !ar.pop) continue;
    var areaMin = Infinity;
    for (var q = 0; q < ar.pop.length; q++) {
      if (typeof ar.pop[q].lvlmin === 'number') areaMin = Math.min(areaMin, ar.pop[q].lvlmin);
    }
    for (var q2 = 0; q2 < ar.pop.length; q2++) {
      var pop = ar.pop[q2];
      var lvl = typeof pop.lvlmin === 'number' ? pop.lvlmin : 1;
      var drops = pop.crt && pop.crt.drop;
      for (var d = 0; drops && d < drops.length; d++) {
        var dr = drops[d];
        if (!dr || !dr.item) continue;
        MOD_noteDrop(dr.item.id, lvl, dr.chance);
      }
    }
    for (var d2 = 0; ar.drop && d2 < ar.drop.length; d2++) {
      var ad = ar.drop[d2];
      if (!ad || !ad.item) continue;
      MOD_noteDrop(ad.item.id, areaMin === Infinity ? 1 : areaMin, ad.c);
    }
  }

  for (var r in rcp) {
    var recipe = rcp[r];
    if (!recipe || !recipe.res || !recipe.rec) continue;
    for (var j = 0; j < recipe.res.length; j++) {
      var out = recipe.res[j];
      if (out && out.item && MOD_VAL.madeBy[out.item.id] === undefined) {
        MOD_VAL.madeBy[out.item.id] = recipe;
      }
    }
  }
  console.log('[mod] value model: ' + Object.keys(MOD_VAL.anchors).length +
              ' vendor-priced items, ' + Object.keys(MOD_VAL.madeBy).length + ' craftable');
})();

function MOD_itemValue(it, depth) {
  if (!it || it.id === undefined) return 1;
  depth = depth || 0;
  if (MOD_VAL.cache[it.id] !== undefined) return MOD_VAL.cache[it.id];
  if (depth > 6) return 1;
  MOD_VAL.cache[it.id] = 1;          // provisional, so a recipe cycle terminates

  var v = 0;
  try {
    if (MOD_VAL.anchors[it.id] !== undefined) {
      v = MOD_VAL.anchors[it.id];                                  // rule 1
    } else {
      var recipe = MOD_VAL.madeBy[it.id];
      if (recipe) {                                                // rule 2
        var sum = 0, k;
        for (k = 0; k < recipe.rec.length; k++) {
          var inp = recipe.rec[k];
          if (inp && inp.item) sum += MOD_itemValue(inp.item, depth + 1) * (inp.amount || 1);
        }
        var outAmt = 1;
        for (k = 0; k < recipe.res.length; k++) {
          if (recipe.res[k] && recipe.res[k].item && recipe.res[k].item.id === it.id) {
            outAmt = recipe.res[k].amount || 1;
          }
        }
        v = sum * MOD_VAL.craftMargin / Math.max(outAmt, 1);
      }

      if (!v && it.slot !== undefined) {                           // rule 3
        var stats = (it.str || 0) + (it.agl || 0) + (it.int || 0) + (it.spd || 0) +
                    ((it.dpmax || 0) / 10);
        if (stats > 0) v = stats * MOD_VAL.statRate;
      }

      if (!v) {                                                    // rule 4
        var base = MOD_VAL.stypeBase[it.stype];
        if (base === undefined) base = 16;
        var mult = MOD_VAL.rarMult[it.rar];
        if (mult === undefined) mult = 1;
        v = base * mult;
      }

      var dv = MOD_dropValue(it.id);                               // rule 5
      if (dv > v) v = dv;
    }
  } catch (e) { v = 1; }

  v = Math.max(1, Math.round(v));
  MOD_VAL.cache[it.id] = v;
  return v;
}

/* Sell price. `dfl` is the author's own field; Trading and reputation improve
   the take, mirroring how they improve buying. */
function MOD_sellPrice(it, vnd) {
  var dfl = (vnd && typeof vnd.dfl === 'number') ? vnd.dfl : MOD_VAL.defaultDfl;
  var trad = 0, rep = 0;
  try { trad = skl.trad.use() || 0; } catch (e) {}
  try { rep = Math.sqrt(Math.max(vnd.data.rep, 0)) * 0.004; } catch (e) {}
  return Math.max(1, Math.ceil(MOD_itemValue(it) * dfl * (1 + trad + rep)));
}

function MOD_sellable(it) {
  if (!it || it.important) return false;              // quest and key items stay
  try { if (it.slot !== undefined && wearing(it)) return false; } catch (e) {}
  if (it.slot === undefined && !(it.amount > 0)) return false;
  return true;
}

function MOD_sellOne(it, vnd) {
  var price = MOD_sellPrice(it, vnd);
  var name = it.name;
  try {
    if (it.slot !== undefined) {
      removeItem(it);
    } else {
      it.amount--;
      if (it.amount <= 0) { try { removeItem(it); } catch (e) {} }
    }
  } catch (e) { /* removeItem touches dom.inv_con, which may not be drawn */ }

  giveWealth(price, false);
  try { giveSkExp(skl.trad, 1 + price * 0.02); } catch (e) {}
  try { if (vnd && vnd.data) vnd.data.rep += 0.05; } catch (e) {}
  msg('Sold ' + name + ' for ' + price, 'gold');
  MOD_renderSell(vnd);
}

/* --- the Buy / Sell tabs --------------------------------------------------
   The shop panel is built inside a switch case in the game's own code, so it
   cannot be wrapped. Instead the tick checks for an open shop (global.menuo
   === 4) and injects the tabs once, the same approach used for the skill
   panel controls.
   -------------------------------------------------------------------------- */

var MOD_SHOP = { tab: 'buy' };

/* Both renderers can be reached from a sale, which may happen with no shop
   panel drawn (a console call, or a shop closed mid-sale), so they check for
   the container rather than assuming it. */
function MOD_shopOpen() {
  return global.menuo === 4 && !!dom.ch_1h;
}

function MOD_renderBuy(vnd) {
  if (!MOD_shopOpen() || !vnd) return;
  empty(dom.ch_1h);
  for (var it in vnd.stock) rendershopitem(dom.ch_1h, vnd.stock[it], vnd);
}

function MOD_renderSell(vnd) {
  if (!MOD_shopOpen() || !vnd) return;
  empty(dom.ch_1h);
  var any = 0;
  for (var i = 0; i < inv.length; i++) {
    var it = inv[i];
    if (!MOD_sellable(it)) continue;
    any++;
    (function (item) {
      var price = MOD_sellPrice(item, vnd);
      var row = addElement(dom.ch_1h, 'div', null, 'bst_entr');
      row.style.cssText = 'background-color:rgb(10,30,54);display:flex;cursor:pointer;padding:2px;';
      try { addDesc(row, item); } catch (e) {}

      var left = addElement(row, 'div');
      left.style.cssText = 'width:70%;text-align:left;padding-left:4px;';
      left.innerHTML = item.name +
        (item.slot === undefined && item.amount > 1
          ? ' <small style="color:grey">x' + item.amount + '</small>' : '');

      var right = addElement(row, 'div');
      right.style.cssText = 'width:30%;text-align:right;padding-right:6px;color:gold;';
      right.innerHTML = price;

      row.addEventListener('mouseenter', function () { row.style.background = 'rgb(20,50,84)'; });
      row.addEventListener('mouseleave', function () { row.style.background = 'rgb(10,30,54)'; });
      row.addEventListener('click', function () { MOD_sellOne(item, vnd); });
    })(it);
  }
  if (!any) {
    var none = addElement(dom.ch_1h, 'div');
    none.style.cssText = 'padding:8px;color:grey;text-align:center;';
    none.innerHTML = 'Nothing here worth selling';
  }
}

function MOD_shopUI() {
  try {
    if (global.menuo !== 4 || !dom.ch_1 || !dom.ch_1h) return;
    if (document.getElementById('mod_shop_tabs')) return;
    var vnd = global.shprf;
    if (!vnd) return;

    var tabs = document.createElement('div');
    tabs.id = 'mod_shop_tabs';
    tabs.style.cssText = 'display:flex;border-bottom:1px #44c solid;font-size:.9em;';

    function tab(label, key) {
      var t = document.createElement('div');
      t.innerHTML = label;
      t.style.cssText = 'flex:1;text-align:center;padding:2px;cursor:pointer;user-select:none;';
      var paint = function () {
        t.style.background = MOD_SHOP.tab === key ? 'rgb(20,50,84)' : 'transparent';
        t.style.color = MOD_SHOP.tab === key ? '#cfe' : '#89a';
      };
      paint();
      t.addEventListener('click', function () {
        MOD_SHOP.tab = key;
        Array.prototype.forEach.call(tabs.children, function (c) { if (c._paint) c._paint(); });
        if (key === 'buy') MOD_renderBuy(vnd); else MOD_renderSell(vnd);
      });
      t._paint = paint;
      return t;
    }

    tabs.appendChild(tab('Buy', 'buy'));
    tabs.appendChild(tab('Sell &nbsp;<small style="color:grey">' +
      Math.round((typeof vnd.dfl === 'number' ? vnd.dfl : MOD_VAL.defaultDfl) * 100) +
      '%</small>', 'sell'));

    dom.ch_1.insertBefore(tabs, dom.ch_1h);
    if (MOD_SHOP.tab === 'sell') MOD_renderSell(vnd);
  } catch (e) { console.warn('[mod] shop tabs failed: ' + e.message); }
}

var MOD_ontick_before_shop = ontick;
ontick = function () {
  MOD_ontick_before_shop();
  try { MOD_shopUI(); } catch (e) {}
};

function modItemValue(name) {
  var groups = [item, wpn, eqp, acc, sld];
  for (var g = 0; g < groups.length; g++) {
    for (var k in groups[g]) {
      var it = groups[g][k];
      if (!it || !it.name) continue;
      if (k === name || it.name.toLowerCase() === String(name).toLowerCase()) {
        var src = MOD_VAL.anchors[it.id] !== undefined ? 'vendor price'
                : MOD_VAL.madeBy[it.id] ? 'recipe inputs'
                : (it.slot !== undefined && ((it.str||0)+(it.agl||0)+(it.int||0)+(it.spd||0)+(it.dpmax||0)) > 0) ? 'equipment stats'
                : MOD_VAL.dropFrom[it.id] && MOD_dropValue(it.id) > (MOD_VAL.stypeBase[it.stype] || 16) * (MOD_VAL.rarMult[it.rar] === undefined ? 1 : MOD_VAL.rarMult[it.rar]) ? 'drop source (lv ' + MOD_VAL.dropFrom[it.id].lvl + ')'
                : 'rarity/type estimate';
        var out = it.name + ': value ' + MOD_itemValue(it) + '  (' + src + ')' +
                  '  sells for ~' + Math.ceil(MOD_itemValue(it) * MOD_VAL.defaultDfl);
        console.log(out);
        return out;
      }
    }
  }
  return 'no item matching "' + name + '"';
}

console.log('[mod] selling enabled — Buy/Sell tabs in any shop. modItemValue(name) to inspect a price.');


/* ===========================================================================
   16. ENEMY MONEY DROPS
   ---------------------------------------------------------------------------
   Measuring the sell economy turned up the real problem: money has no combat
   source. The code for enemies dropping coin is complete and working —

       if(you.mods.enmondren>0) if(random()<you.mods.enmondren){
         let aam = 1+rand(this.lvl<<0,(this.lvl/4)<<0)**(1+(this.rnk/5)<<0)*you.mods.enmondrts;
         giveWealth(rand(aam*.5<<0||1,aam*1.5<<0||1)); }

   — but `enmondren` defaults to 0, so the branch never runs. Only one
   accessory (Ring of Greed, +0.03) ever turns it on. Another finished
   mechanism left switched off, like `dfl` and the four affinities.

   Enabled at a modest rate. The amount is the author's own formula, which
   already scales with enemy level and rank, so higher areas pay more without
   any new maths.

   `you.mods` is saved, so the contribution is tracked in global.flags and
   applied as a delta — the same pairing the affinity resistances use. Adding a
   flat amount on every load would compound, and clamping to a fixed value
   would erase the Ring of Greed's bonus.
   =========================================================================== */

var MOD_MONEY = { chance: 0.15 };

function MOD_applyMoneyDrops() {
  try {
    if (typeof you === 'undefined' || !you.mods) return;
    var want = MOD_MONEY.chance;
    var have = Number(global.flags.mod_money) || 0;
    if (want !== have) {
      you.mods.enmondren += (want - have);
      global.flags.mod_money = want;
    }
  } catch (e) { /* never break a tick over a drop rate */ }
}

function setMoneyDrops(n) {
  n = Number(n);
  if (!isFinite(n) || n < 0 || n > 1) {
    console.warn('[mod] setMoneyDrops: pass a chance between 0 and 1, e.g. setMoneyDrops(0.15)');
    return MOD_MONEY.chance;
  }
  MOD_MONEY.chance = n;
  MOD_applyMoneyDrops();
  console.log('[mod] enemy money drop chance = ' + n);
  if (typeof msg === 'function') msg('Enemy coin drop chance: ' + Math.round(n * 100) + '%', 'gold');
  return n;
}

/* Undo it, for going back to vanilla. Sets the target to 0 as well, or the
   next tick's reconciliation would simply put the bonus back. */
function modResetMoneyDrops() {
  try {
    MOD_MONEY.chance = 0;
    var have = Number(global.flags.mod_money) || 0;
    if (have) { you.mods.enmondren -= have; global.flags.mod_money = 0; }
    console.log('[mod] enemy money drops returned to the base-game default (setMoneyDrops(0.15) to restore)');
    return true;
  } catch (e) { return false; }
}

var MOD_ontick_before_money = ontick;
ontick = function () {
  MOD_ontick_before_money();
  try { MOD_applyMoneyDrops(); } catch (e) {}
};

MOD_applyMoneyDrops();

function modEconomy() {
  var DFL = MOD_VAL.defaultDfl;
  function perKill(a) {
    var exp = 0, i, j;
    for (i = 0; i < a.pop.length; i++) {
      var pop = a.pop[i];
      var w = pop.c === undefined ? 1 / a.pop.length : pop.c;
      var e = 0, drops = pop.crt && pop.crt.drop;
      for (j = 0; drops && j < drops.length; j++) {
        if (drops[j].item) e += (drops[j].chance || 0) * MOD_itemValue(drops[j].item) * DFL;
      }
      // the author's own coin formula, averaged
      var lvl = (pop.lvlmin + pop.lvlmax) / 2 || 1;
      var coin = MOD_MONEY.chance * ((1 + (lvl * 0.625)) * 1);
      exp += w * (e + coin);
    }
    for (j = 0; a.drop && j < a.drop.length; j++) {
      if (a.drop[j].item) exp += (a.drop[j].c || 0) * MOD_itemValue(a.drop[j].item) * DFL;
    }
    return exp;
  }
  var lines = ['Expected income per kill (loot sold at ' + Math.round(DFL * 100) + '% + coin drops):', ''];
  ['frstn1a2', 'frstn1a3', 'frstn9a1', 'hmbsmnt', 'mod_hollow', 'mod_spire', 'mod_vigil'].forEach(function (k) {
    if (!area[k]) return;
    lines.push('  ' + (area[k].name || k).slice(0, 26).padEnd(28) + perKill(area[k]).toFixed(1));
  });
  lines.push('', 'Vendor prices: median 31, max 690. Coin drop chance ' +
             Math.round(MOD_MONEY.chance * 100) + '% (base game: 0%).');
  var out = lines.join('\n');
  console.log(out);
  return out;
}

console.log('[mod] enemy coin drops enabled at ' + Math.round(MOD_MONEY.chance * 100) +
            '% (base game: 0%). modEconomy() for the income curve.');


/* ===========================================================================
   17. TITLES, BIGGER FLAT BONUSES, AND RENOWN
   ---------------------------------------------------------------------------
   A. Fifteen new titles (ids 201-215, clear of the game's highest at 107;
      titles save by id, so new ones are save-safe).

   B. Twelve "flagship" skills get an extended flat-bonus tier on top of the
      light set they already had, ending in a title. These are APPENDED —
      milestone "granted" flags are saved by array index, so inserting would
      shift them onto the wrong perks.

      The bonuses are gated deep (lv 15 to 75) so the level cap paces them: at
      the forest's cap of 20 only the lv-15 tier is reachable, worth +2 each;
      the big numbers need the endgame caps.

   C. Renown — a skill that levels on how many TITLES you hold rather than on
      xp, capped at level 10 and exempt from the story level cap.
   =========================================================================== */

/* --- A. the titles ------------------------------------------------------- */

var MOD_TITLES = [
  ['exct',  201, 'Executioner',  'Ends fights before they become fights', 4],
  ['dthl',  202, 'Deathless',    'Has been dead often enough to stop finding it remarkable', 5],
  ['stmc',  203, 'Stormcaller',  'Stood outside in weather that emptied the roads', 4],
  ['drkm',  204, 'Darkmoon',     'Clearest of mind when there is no moon at all', 4],
  ['artf',  205, 'Artificer',    'Has made more things than most people own', 3],
  ['schl',  206, 'Scholar',      'Read it all, and remembered most of it', 3],
  ['inst',  207, 'Insatiable',   'Has never once been described as a light eater', 3],
  ['wayf2', 208, 'Wayfinder',    'Knows the way, including the ways nobody uses', 3],
  ['qksl',  209, 'Quicksilver',  'Moves before the thought finishes arriving', 4],
  ['frst2', 210, 'Farstrider',   'Measured in days walked rather than miles', 3],
  ['unbn',  211, 'Unbending',    'Continued long past the point of good sense', 4],
  ['sage',  212, 'Sage',         'Has stopped needing to be told things twice', 5],
  ['circ',  213, 'Circulator',   'Moves qi the way water finds its channel', 4],
  ['mnlt',  214, 'Moonlit',      'Something in them answers a full moon', 5],
  ['unsp',  215, 'Unspent',      'Always has one more in reserve', 4]
];

MOD_TITLES.forEach(function (t) {
  var ti = new Title(t[1]);
  ti.name = t[2];
  ti.desc = t[3];
  ti.rar = t[4];
  ttl['mod_' + t[0]] = ti;
});

function MOD_title(key) { return ttl['mod_' + key]; }

/* --- B. extended flat bonuses on flagship skills -------------------------
   Appended to whatever the skill already has. `stat` is the skill's own stat,
   `second` a thematic secondary.
   ------------------------------------------------------------------------- */

var MOD_FLAGSHIP = [
  ['kllr', 'stra', 'agla', 'STR', 'AGL', 'exct'],
  ['mrtl', 'stra', 'hpa',  'STR', 'HP',  'dthl'],
  ['stmw', 'inta', 'stra', 'INT', 'STR', 'stmc'],
  ['nwmn', 'inta', 'agla', 'INT', 'AGL', 'drkm'],
  ['mkng', 'inta', 'spda', 'INT', 'SPD', 'artf'],
  ['stdy', 'inta', 'inta', 'INT', 'INT', 'schl'],
  // 'apet' (-> Insatiable) and 'pthf' (-> Wayfinder) were folded into other
  // skills at the 10-skill consolidation, so their flagship tiers are dropped.
  // The two titles stay defined in `ttl` but are no longer earnable this way.
  ['rflx', 'agla', 'spda', 'AGL', 'SPD', 'qksl'],
  ['rnge', 'spda', 'agla', 'SPD', 'AGL', 'frst2'],
  ['grit', 'stra', 'hpa',  'STR', 'HP',  'unbn'],
  ['wsdm', 'inta', 'inta', 'INT', 'INT', 'sage']
];

MOD_FLAGSHIP.forEach(function (f) {
  var key = f[0], A = f[1], B = f[2], LA = f[3], LB = f[4], titleKey = f[5];
  var sk = skl[key];
  if (!sk) { console.warn('[mod] flagship skill missing: ' + key); return; }
  /* Appended, so every level here must sit ABOVE the skill's existing top
     milestone (50). The game's perk tooltip walks the array in order and stops
     at the first ungranted entry, so an out-of-order level hides everything
     after it — and reordering the array instead would misalign the save's
     index-based granted flags. */
  MOD_addMilestones(sk, [
    { lv: 55, f: function () { you[A] += 8; you[B] += 3; you.stat_r(); }, g: false,
      p: LA + " +8, " + LB + " +3" },
    { lv: 60, f: function () { you[A] += 11; you.hpa += 60; you.stat_r(); }, g: false,
      p: LA + " +11, HP +60" },
    { lv: 70, f: function () { you[A] += 15; you.sata += 120; you.stat_r(); }, g: false,
      p: LA + " +15, Max Energy +120" },
    { lv: 75, f: function () { you[A] += 22; you.stat_r(); giveTitle(MOD_title(titleKey)); }, g: false,
      p: LA + " +22, title \"" + MOD_title(titleKey).name + "\"" }
  ]);
});

// A few of the earlier skills get a title at depth too.
[['qic', 'circ'], ['lunr', 'mnlt'], ['swnd', 'unsp']].forEach(function (pair) {
  var sk = skl[pair[0]];
  if (!sk) return;
  MOD_addMilestones(sk, [
    { lv: 60, f: function () { giveTitle(MOD_title(pair[1])); }, g: false,
      p: 'Title "' + MOD_title(pair[1]).name + '"' }
  ]);
});

/* --- C. Renown -----------------------------------------------------------
   Levels on titles held, not xp. Thresholds start at a single title and grow
   multiplicatively, so the first level is immediate and the last is a
   collection project:

       lv     1   2   3   4    5    6    7    8    9   10
       titles  2  12  30  60  105  160  230  320  430  550

   Capped at 10 and exempt from the story level cap — it never passes through
   giveSkExp, its level is derived. Its level is also what decides how many
   title ranks apply passively; see section 24. Title count is taken from `ttl` rather than
   `global.titles.length`, because load() rebuilds that array and appends
   `titlese` to it, which can double-count.
   ------------------------------------------------------------------------- */

/* RESCALED in section 24. The pool went from 120 titles to ~492 when every
   skill started granting four, so thresholds fitted to 120 would have put
   renown 10 within the first fifth of the collection. These are set against
   the new total, with level 10 still meaning near-completion — and renown now
   also decides which title ranks apply without being worn, so the curve is
   load-bearing rather than decorative. */
var MOD_RENOWN_STEPS = [2, 12, 30, 60, 105, 160, 230, 320, 430, 550];
var MOD_RENOWN_MAX = MOD_RENOWN_STEPS.length;
/* Multiplicative rather than additive: each level multiplies every stat by
   (1 + rate) instead of adding a flat percentage of the running total. Level 10
   is x(1.05^10) = x1.63 rather than +15%. Justified by what it costs — level 10
   wants 100 of the game's 123 titles, which is near-completion. */
var MOD_RENOWN_RATE = 0.05;   // per level, compounding

function MOD_renownMult(lvl) {
  return Math.pow(1 + MOD_RENOWN_RATE, Math.max(Number(lvl) || 0, 0));
}

function MOD_titleCount() {
  var n = 0;
  try { for (var k in ttl) if (ttl[k] && ttl[k].have === true) n++; } catch (e) {}
  return n;
}

skl.rnwn = new Skill();
skl.rnwn.id = 2100;
skl.rnwn.type = 4;
skl.rnwn.name = 'Renown';
skl.rnwn.desc = 'How widely your name travels' + MOD_SEP +
  '<small style="color:darkorange">Grows with the titles you hold, not with practice</small>';
skl.rnwn.mlstn = [];           // its own reward is the continuous bonus
skl.rnwn.use = function () {
  var m = MOD_renownMult(this.lvl);
  you.str *= m; you.int *= m; you.agl *= m; you.spd *= m;
};

MOD_EFFECTS.rnwn = function (s) {
  var have = MOD_titleCount();
  var next = s.lvl < MOD_RENOWN_MAX ? MOD_RENOWN_STEPS[s.lvl] : null;
  var m = MOD_renownMult(s.lvl);
  return 'All stats ' + MOD_x(m) +
    ' <small style="color:grey">(' + MOD_pct(MOD_RENOWN_RATE * 100) + ' per level, compounding)</small>' +
    '<br><small style="color:#7cf">' + have + ' titles held' +
    (next ? ' — ' + (next - have) + ' more for lv ' + (s.lvl + 1) + ' (' + next + ')'
          : ' — maximum level') + '</small>' +
    '<br><small style="color:grey">Ignores the story level cap</small>';
};

function MOD_updateRenown() {
  try {
    var sk = skl.rnwn, have = MOD_titleCount(), lvl = 0;
    for (var i = 0; i < MOD_RENOWN_STEPS.length; i++) if (have >= MOD_RENOWN_STEPS[i]) lvl = i + 1;
    sk.lvl = lvl;
    // fill the game's xp bar with progress toward the next threshold
    var from = lvl > 0 ? MOD_RENOWN_STEPS[lvl - 1] : 0;
    var to = lvl < MOD_RENOWN_MAX ? MOD_RENOWN_STEPS[lvl] : from;
    sk.exp = Math.max(0, have - from);
    sk.expnext_t = Math.max(1, to - from);
    if (typeof you !== 'undefined' && you.skls && you.skls.indexOf(sk) === -1) you.skls.push(sk);
  } catch (e) { /* never break a tick over a display value */ }
}

// register it with the section/parent machinery, which ran before this section
MOD_KEY_BY_ID[skl.rnwn.id] = 'rnwn';
MOD_PARENT_OF.rnwn = MOD_PARENT_KEY[MOD_sectionOf(skl.rnwn)];
MOD_TITLES.forEach(function () {});   // no-op, keeps the list referenced for clarity

var MOD_ontick_before_renown = ontick;
ontick = function () {
  MOD_ontick_before_renown();
  try { MOD_updateRenown(); } catch (e) {}
};

MOD_updateRenown();

function modRenown(quiet) {
  MOD_updateRenown();
  var have = MOD_titleCount(), lvl = skl.rnwn.lvl;
  var lines = [];
  var log = function (text, colour) {
    lines.push(text);
    if (!quiet && typeof msg === 'function') msg(text, colour);
  };

  log('=== Renown ===', 'gold');
  log(have + ' titles held \u2014 level ' + lvl + '/' + MOD_RENOWN_MAX +
      ', all stats ' + MOD_x(MOD_renownMult(lvl)), 'gold');
  MOD_RENOWN_STEPS.forEach(function (t, i) {
    var got = have >= t;
    log((got ? '\u2714 ' : '\u2718 ') + 'lv ' + (i + 1) + ' \u2014 ' + t + ' titles' +
        (got ? '' : '  (' + (t - have) + ' to go)'), got ? 'lime' : 'grey');
  });
  if (lvl >= MOD_RENOWN_MAX) log('Maximum Renown reached.', 'lime');
  log('Renown ignores the story level cap.', 'skyblue');

  var out = lines.join('\n');
  console.log(out);
  return out;
}

/* The titles you are missing, so the ladder is actionable rather than just a
   number. Ordered by rarity, since rarer ones are the interesting ones. */
/* --- one-time migration ---------------------------------------------------
   The lv 10 and lv 50 perks on the added skills changed from an xp-rate bonus
   to flat stats. A character who had already earned them keeps a `g` flag set,
   so the new `f()` would never fire — they would silently lose the old effect
   and never gain the new one. Re-fire those perks once per save.

   Gated on a revision number kept in global.flags, which is saved. On a fresh
   page this runs, sets the flag, and is then overwritten by load() restoring an
   older save's flags — which is exactly right: it runs again once, after that
   save's levels are in place.
   -------------------------------------------------------------------------- */

var MOD_PERK_REV = 2;

function MOD_migratePerks() {
  try {
    if (Number(global.flags.mod_perk_rev) >= MOD_PERK_REV) return 0;
    var fired = 0;
    MOD_EXTRA.forEach(function (d) {
      var sk = skl[d.key];
      if (!sk || !sk.mlstn) return;
      sk.mlstn.forEach(function (m) {
        if (m.rev2 && m.g === true && sk.lvl >= m.lv) { try { m.f(); fired++; } catch (e) {} }
      });
    });
    global.flags.mod_perk_rev = MOD_PERK_REV;
    if (fired && typeof msg === 'function') {
      msg('Re-applied ' + fired + ' changed skill perks', 'grey');
    }
    if (fired) console.log('[mod] migration: re-fired ' + fired + ' changed perks');
    return fired;
  } catch (e) { return 0; }
}

var MOD_ontick_before_migrate = ontick;
ontick = function () {
  MOD_ontick_before_migrate();
  try { MOD_migratePerks(); } catch (e) {}
};

MOD_migratePerks();

console.log('[mod] live descriptions extended to Renown: ' + MOD_installLiveDesc());

console.log('[mod] ' + MOD_TITLES.length + ' new titles, ' + MOD_FLAGSHIP.length +
            ' flagship skills extended, Renown added (lv ' + skl.rnwn.lvl + '). modRenown() for details.');


/* ===========================================================================
   18. SETTINGS PANEL CONTROLS
   ---------------------------------------------------------------------------
   Number boxes for the two multipliers, in the settings menu, matching the
   game's own row pattern:

       addElement(dom.ctrwin4,'div',null,'opt_c')   // the row
         addElement(row,'div',null,'opt_t')         // label
         addElement(row,'input',null,'opt_v')       // control

   ctrwin4 is built once at startup rather than rebuilt on each open, so these
   rows are appended once here rather than injected from the tick.

   Skill xp now persists like speed already did — a settings box that forgets
   its value on reload is worse than no box.
   =========================================================================== */

MOD.xp_key = 'p23_mod_skillxp';
MOD.coin_key = 'p23_mod_coindrop';

(function () {
  try {
    var saved = localStorage.getItem(MOD.xp_key);
    if (saved !== null) {
      var v = Number(saved);
      if (isFinite(v) && v > 0) MOD.skill_xp_mult = v;
    }
    var c = localStorage.getItem(MOD.coin_key);
    if (c !== null) {
      var cv = Number(c);
      if (isFinite(cv) && cv >= 0 && cv <= 1) MOD_MONEY.chance = cv;
    }
  } catch (e) { /* private mode */ }
})();

var MOD_setSkillXp_base = setSkillXp;
setSkillXp = function (n) {
  var applied = MOD_setSkillXp_base(n);
  try { localStorage.setItem(MOD.xp_key, String(applied)); } catch (e) {}
  return applied;
};

var MOD_setMoneyDrops_base = setMoneyDrops;
setMoneyDrops = function (n) {
  var applied = MOD_setMoneyDrops_base(n);
  try { localStorage.setItem(MOD.coin_key, String(applied)); } catch (e) {}
  return applied;
};

var MOD_SETTINGS = { inputs: [] };

function MOD_settingsRow(label, get, set, hint, step) {
  try {
    var row = addElement(dom.ctrwin4, 'div', null, 'opt_c');
    var lab = addElement(row, 'div', null, 'opt_t');
    lab.innerHTML = label;

    // mod_optn marks it as one of ours — the settings window already contains a
    // number input of the game's own (the message log limit).
    var inp = addElement(row, 'input', null, 'opt_v mod_optn');
    inp.type = 'number';
    inp.step = step || '0.5';
    inp.min = '0';
    inp.value = get();
    // the game's dark theme gives inputs no styling of their own
    inp.style.cssText = 'width:64px;text-align:center;background:transparent;color:inherit;' +
                        'border:1px solid #46a;font-family:inherit;';

    var apply = function () {
      var v = Number(inp.value);
      if (!isFinite(v)) { inp.value = get(); return; }
      var applied = set(v);          // the setter clamps and returns the real value
      inp.value = applied;
    };
    inp.addEventListener('change', apply);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { apply(); inp.blur(); }
    });

    if (hint) { try { addDesc(row, null, 2, label, hint); } catch (e) {} }

    MOD_SETTINGS.inputs.push({ el: inp, get: get });
    return inp;
  } catch (e) { console.warn('[mod] settings row "' + label + '" failed: ' + e.message); }
}

MOD_settingsRow('Skill EXP multiplier',
  function () { return MOD.skill_xp_mult; },
  function (v) { return setSkillXp(v); },
  'Multiplies all skill experience gain.<br>Base game is 1; this mod ships 2.<br>Persists across reloads.',
  '0.5');

MOD_settingsRow('Game speed',
  function () { return getSpeed(); },
  function (v) { return setSpeed(v); },
  'Ticks per second. Scales skill training, combat and time together.<br>' +
  'Base game is 1. Capped at ' + MOD.max_speed + '.<br>Persists across reloads.',
  '1');

MOD_settingsRow('Enemy coin drop chance',
  function () { return MOD_MONEY.chance; },
  function (v) { return setMoneyDrops(v); },
  'Chance an enemy drops coin. The base game leaves this at 0,<br>' +
  'which is why nothing paid out; this mod ships 0.15.',
  '0.05');

/* Keep the boxes in step with console changes, but never while one is focused —
   overwriting a half-typed number is maddening. */
var MOD_ontick_before_settings = ontick;
ontick = function () {
  MOD_ontick_before_settings();
  try {
    for (var i = 0; i < MOD_SETTINGS.inputs.length; i++) {
      var s = MOD_SETTINGS.inputs[i];
      if (s.box) continue;                       // checkboxes sync in section 21
      if (document.activeElement === s.el) continue;
      var v = String(s.get());
      if (s.el.value !== v) s.el.value = v;
    }
  } catch (e) {}
};

console.log('[mod] settings menu: skill xp, game speed and coin drop boxes added');


/* ===========================================================================
   19. THE SKILL EXP CURVE
   ---------------------------------------------------------------------------
   The base game's per-skill curve is

       expnext = round(50 + (lvl+1) ^ ln(9*lvl+1))

   which is super-exponential: 109 -> 110 alone costs 1.16e14 xp, more than
   every level beneath it combined, so the top of the cap ladder was 17,000
   years away at max game speed (measured in tests/capreach.mjs). No xp
   multiplier reaches that — the curve itself has to change.

   Replaced with a plain geometric curve:

       expnext = round(base * ratio ^ lvl)

   `ratio` is set so a skill earning ~2 xp/tick reaches level 110 in about six
   months of real time at 1x. The shape puts most of that time in the last two
   tiers (a day to cap 60, 24 days to cap 90, ~6 months to 110) while the early
   caps arrive in minutes — which is right, because early on it is the story
   flags that gate you, not the xp.

   Only SKILLS are re-curved. `you.expnext` (character level) is the base
   game's own progression and is left alone.
   =========================================================================== */

var MOD_XP = { base: 50, ratio: 1.106 };

function MOD_expnextFor(lvl) {
  return Math.round(MOD_XP.base * Math.pow(MOD_XP.ratio, Math.max(Number(lvl) || 0, 0)));
}

/* Total xp to climb from 0 to L, for the console helpers and the tests. */
function MOD_xpToReach(L) {
  var r = MOD_XP.ratio;
  return Math.round(MOD_XP.base * (Math.pow(r, L) - 1) / (r - 1));
}

function MOD_installXpCurve() {
  var n = 0;
  for (var k in skl) {
    var s = skl[k];
    if (!s || typeof s !== 'object' || typeof s.expnext !== 'function') continue;
    // per-instance, because the base game assigns expnext inside the Skill
    // constructor rather than on a prototype
    s.expnext = function () { return MOD_expnextFor(this.lvl); };
    s.expnext_t = s.expnext();
    n++;
  }
  return n;
}

function setXpCurve(ratio, base) {
  if (ratio !== undefined) {
    ratio = Number(ratio);
    if (!isFinite(ratio) || ratio <= 1) { console.warn('[mod] setXpCurve: ratio must be > 1'); return MOD_XP; }
    MOD_XP.ratio = ratio;
  }
  if (base !== undefined) {
    base = Number(base);
    if (isFinite(base) && base > 0) MOD_XP.base = base;
  }
  MOD_installXpCurve();
  console.log('[mod] xp curve: ' + MOD_XP.base + ' x ' + MOD_XP.ratio + '^lvl; ' +
              'total to 110 = ' + MOD_xpToReach(110).toLocaleString());
  return MOD_XP;
}

function modXpCurve() {
  var lines = ['Skill exp curve: expnext = ' + MOD_XP.base + ' x ' + MOD_XP.ratio + '^lvl', ''];
  var caps = [];
  for (var i = 0; i < MOD_TIERS.length; i++) caps.push(MOD_TIERS[i]);
  lines.push('  cap   total xp     at 2 xp/tick');
  caps.forEach(function (t) {
    var x = MOD_xpToReach(t.cap), d = x / 2 / 86400;
    lines.push('  ' + String(t.cap).padStart(3) + '   ' + String(x.toLocaleString()).padStart(12) +
               '   ' + (d < 1 ? (d * 24).toFixed(1) + ' h' : d.toFixed(1) + ' days').padStart(10) +
               '   ' + t.name);
  });
  var out = lines.join('\n');
  console.log(out);
  if (typeof msg === 'function') msg('Skill exp curve printed to the console', 'gold');
  return out;
}

console.log('[mod] skill exp curve replaced on ' + MOD_installXpCurve() +
            ' skills (' + MOD_XP.base + ' x ' + MOD_XP.ratio + '^lvl); ' +
            'level 110 costs ' + MOD_xpToReach(110).toLocaleString() + ' xp. modXpCurve() for the ladder.');


/* ===========================================================================
   20. SAVE SLOTS
   ---------------------------------------------------------------------------
   Three independent saves, and a way to start a fresh character without
   destroying the one you have.

   The game stores exactly one save, under the localStorage key "v0.3", and
   both save() and load() reach for that key directly. Renaming it per slot
   would mean editing them, so instead **"v0.3" always holds whichever slot is
   live** and each slot keeps a mirror alongside it:

       v0.3               the live save — the game's own key, untouched
       p23_slot_N         a copy of slot N, N in 1..3
       p23_slotmeta_N     name / level / timestamp, for the panel
       p23_slot_active    which slot is live

   save() is wrapped to mirror into the active slot, so the copy is refreshed
   every time the game saves by any route (button, autosave, an area's own
   save call). Switching or starting a new game writes v0.3 and reloads the
   page: the game reads its save once, from the load event, and has no notion
   of unloading one.

   Boot only adopts, never overwrites. If a slot mirror is missing, the
   existing v0.3 becomes slot 1 — so an existing character is picked up rather
   than orphaned. v0.3 is otherwise left alone, because it is the live truth
   and a mirror can only ever be the same or staler.

   The game's own "delete the save" button called localStorage.clear(), which
   would take all three slots and the mod's settings with it. It is rebound
   here to delete just the slot you are in.
   =========================================================================== */

MOD.game_key   = 'v0.3';            // the game's own save key — never renamed
MOD.slot_key   = 'p23_slot_active';
MOD.slot_data  = 'p23_slot_';
MOD.slot_meta  = 'p23_slotmeta_';
MOD.slot_count = 3;

function MOD_lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function MOD_lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function MOD_lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

function MOD_activeSlot() {
  var n = Number(MOD_lsGet(MOD.slot_key));
  return (n >= 1 && n <= MOD.slot_count) ? n : 1;
}

function MOD_slotBlob(n) { return MOD_lsGet(MOD.slot_data + n); }

/* Name and level straight out of the blob. The save is base64 of
   pipe-separated segments and the first one is the player object, so this
   needs no bookkeeping of its own and cannot go stale. Used when a slot has
   no metadata — a save made before this section existed, for instance. */
function MOD_slotFromBlob(blob) {
  try {
    var yu = JSON.parse(b64_to_utf8(blob).split('|')[0]);
    return { name: yu.name, lvl: yu.lvl };
  } catch (e) { return null; }
}

function MOD_slotInfo(n) {
  var blob = MOD_slotBlob(n);
  if (!blob) return { n: n, empty: true };
  var meta = null;
  try { meta = JSON.parse(MOD_lsGet(MOD.slot_meta + n)); } catch (e) {}
  if (!meta || !meta.name) meta = MOD_slotFromBlob(blob) || {};
  return {
    n: n, empty: false,
    name: meta.name || '?', lvl: meta.lvl,
    cap: meta.cap, saved: meta.saved || '',
    kb: Math.round(blob.length / 1024 * 10) / 10
  };
}

function MOD_writeSlotMeta(n) {
  try {
    MOD_lsSet(MOD.slot_meta + n, JSON.stringify({
      name: you.name, lvl: you.lvl,
      cap: (typeof MOD_CAP !== 'undefined') ? MOD_CAP.current : null,
      saved: global.lst_sve || '', ver: MOD.version
    }));
  } catch (e) {}
}

/* Mirror on every save, whatever called it. save() returns the blob it wrote,
   which is what the export button reads, so the return has to survive. */
var MOD_save_original = save;

save = function (lvr) {
  var str = MOD_save_original(lvr);
  try {
    if (str) {
      var n = MOD_activeSlot();
      MOD_lsSet(MOD.slot_data + n, str);
      MOD_writeSlotMeta(n);
    }
  } catch (e) { /* a failed mirror must never break saving */ }
  return str;
};

/* Adopt-only. See the header: overwriting v0.3 from a mirror could only ever
   lose progress, so boot fills in a missing mirror and nothing else. */
(function () {
  var active = MOD_activeSlot();
  MOD_lsSet(MOD.slot_key, String(active));
  var live = MOD_lsGet(MOD.game_key);
  if (live && !MOD_slotBlob(active)) {
    MOD_lsSet(MOD.slot_data + active, live);
    var info = MOD_slotFromBlob(live);
    if (info) {
      MOD_lsSet(MOD.slot_meta + active, JSON.stringify({
        name: info.name, lvl: info.lvl, saved: '(adopted)', ver: MOD.version
      }));
    }
    console.log('[mod] existing save adopted as slot ' + active);
  }
})();

/* Save the slot we are leaving before touching anything. If that fails the
   move is abandoned rather than trading a live character for a silent loss. */
function MOD_parkCurrent() {
  try { save(true); return true; }
  catch (e) {
    console.error('[mod] could not save the current slot, staying put: ' + e.message);
    if (typeof msg === 'function') msg('Could not save this slot — staying here', 'crimson');
    return false;
  }
}

function MOD_switchSlot(n) {
  n = Number(n);
  if (!(n >= 1 && n <= MOD.slot_count)) return;
  if (n === MOD_activeSlot()) { if (typeof msg === 'function') msg('Already on save ' + n, 'grey'); return; }
  if (!MOD_parkCurrent()) return;

  var blob = MOD_slotBlob(n);
  if (blob) MOD_lsSet(MOD.game_key, blob); else MOD_lsDel(MOD.game_key);
  MOD_lsSet(MOD.slot_key, String(n));
  location.reload();
}

/* A new character in slot n. The game builds a fresh world at startup and has
   no reset of its own, so this clears the slot and reloads into it. */
function MOD_newSave(n) {
  n = Number(n);
  if (!(n >= 1 && n <= MOD.slot_count)) return;
  var info = MOD_slotInfo(n);
  if (!info.empty) {
    var who = info.name + (info.lvl ? ', level ' + info.lvl : '') +
              (info.saved ? ', saved ' + info.saved : '');
    if (!confirm('Save ' + n + ' holds ' + who + '.\n\nStart a new character there? ' +
                 'That save is deleted and cannot be recovered.')) return;
  }
  if (!MOD_parkCurrent()) return;

  MOD_lsDel(MOD.slot_data + n);
  MOD_lsDel(MOD.slot_meta + n);
  MOD_lsDel(MOD.game_key);
  MOD_lsSet(MOD.slot_key, String(n));
  location.reload();
}

function MOD_deleteSlot(n) {
  n = Number(n);
  var info = MOD_slotInfo(n);
  if (info.empty) return;
  var who = info.name + (info.lvl ? ', level ' + info.lvl : '');
  if (!confirm('Delete save ' + n + ' (' + who + ')?\n\nThis cannot be undone.')) return;

  MOD_lsDel(MOD.slot_data + n);
  MOD_lsDel(MOD.slot_meta + n);
  if (n === MOD_activeSlot()) { MOD_lsDel(MOD.game_key); location.reload(); return; }
  MOD_renderSlots();
  if (typeof msg === 'function') msg('Save ' + n + ' deleted', 'grey');
}

/* The first free slot, or 0 when all three are in use. */
function MOD_firstEmptySlot() {
  for (var i = 1; i <= MOD.slot_count; i++) if (MOD_slotInfo(i).empty) return i;
  return 0;
}


/* --- the panel --------------------------------------------------------------
   Plain DOM above the save bar, in the bar's own light palette (#dededd on a
   dark page). The bar's buttons are spans of class 'sl', so the panel's are
   too and inherit the same hover.
   -------------------------------------------------------------------------- */

var MOD_SLOTUI = { panel: null, rows: null };

function MOD_slotButton(parent, label, title, onClick) {
  var b = addElement(parent, 'span', null, 'sl');
  b.innerHTML = label;
  b.style.cssText = 'display:inline-block;width:auto;padding:2px 7px;margin-left:4px;cursor:pointer;';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function MOD_renderSlots() {
  var p = MOD_SLOTUI.panel;
  if (!p) return;
  empty(p);

  var head = addElement(p, 'div');
  head.style.cssText = 'padding:2px 4px 5px;font-size:.95em;';
  head.innerHTML = '<b>Saves</b> &nbsp;<span style="opacity:.7">' +
    'the game keeps one save; these are three, swapped in and out. ' +
    'Switching saves the slot you are leaving first, then reloads.</span>';

  var active = MOD_activeSlot();

  for (var i = 1; i <= MOD.slot_count; i++) {
    (function (n) {
      var info = MOD_slotInfo(n);
      var row = addElement(p, 'div');
      row.style.cssText = 'display:flex;align-items:center;padding:3px 4px;' +
        'border-top:1px solid #b5b5b4;' + (n === active ? 'background-color:#c8d4e8;' : '');

      var label = addElement(row, 'div');
      label.style.cssText = 'flex:1 1 auto;text-align:left;';
      var txt = '<b>Save ' + n + '</b>' + (n === active ? ' <i>(playing)</i>' : '') + ' &nbsp; ';
      if (info.empty) {
        txt += '<span style="opacity:.6">empty</span>';
      } else {
        txt += MOD_escape(info.name) + ' &nbsp; level ' + (info.lvl === undefined ? '?' : info.lvl);
        if (info.cap) txt += ' &nbsp; cap ' + info.cap;
        if (info.saved) txt += ' &nbsp; <span style="opacity:.6">' + MOD_escape(info.saved) + '</span>';
      }
      label.innerHTML = txt;

      var acts = addElement(row, 'div');
      acts.style.cssText = 'flex:0 0 auto;';

      if (info.empty) {
        MOD_slotButton(acts, 'start new save', 'Begin a new character in this slot', function () { MOD_newSave(n); });
      } else {
        if (n !== active) {
          MOD_slotButton(acts, 'play', 'Switch to this save', function () { MOD_switchSlot(n); });
        }
        MOD_slotButton(acts, 'new save', 'Replace this save with a new character', function () { MOD_newSave(n); });
        MOD_slotButton(acts, 'delete', 'Delete this save', function () { MOD_deleteSlot(n); });
      }
    })(i);
  }
}

function MOD_escape(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function MOD_toggleSlotPanel(force) {
  var p = MOD_SLOTUI.panel;
  if (!p) return;
  var show = (force === undefined) ? (p.style.display === 'none') : !!force;
  p.style.display = show ? 'block' : 'none';
  if (show) MOD_renderSlots();
}

(function () {
  try {
    var p = addElement(document.body, 'div', null, 'noselect');
    p.style.cssText = 'position:fixed;left:5px;bottom:32px;z-index:10001;display:none;' +
      'background-color:#dededd;color:#000;border:1px solid #333;padding:5px;' +
      'font-size:.75em;min-width:430px;box-shadow:0 2px 8px rgba(0,0,0,.5);';
    MOD_SLOTUI.panel = p;

    // Buttons go before the "Last save:" text, which is free-flowing; the rest
    // of the bar is positioned from the right and would be overlapped.
    var saves = addElement(dom.sl, 'span', null, 'sl');
    saves.innerHTML = 'saves';
    saves.style.cssText = 'width:auto;padding:3px;cursor:pointer;';
    saves.title = 'Three save slots';
    saves.addEventListener('click', function () { MOD_toggleSlotPanel(); });

    var fresh = addElement(dom.sl, 'span', null, 'sl');
    fresh.innerHTML = 'new save';
    fresh.style.cssText = 'width:auto;padding:3px;cursor:pointer;';
    fresh.title = 'Start a new character in a free slot';
    fresh.addEventListener('click', function () {
      var free = MOD_firstEmptySlot();
      if (free) { MOD_newSave(free); return; }
      // Nothing free: show what is there and let them choose what to replace,
      // rather than picking a save to destroy on their behalf.
      MOD_toggleSlotPanel(true);
      if (typeof msg === 'function') msg('All three saves are in use — pick one to replace', 'gold');
    });

    dom.sl.insertBefore(saves, dom.sl_extra);
    dom.sl.insertBefore(fresh, dom.sl_extra);

    /* Rebind "delete the save". The game's handler is localStorage.clear(),
       which would take all three slots and the mod's settings with it;
       replacing the node is the only way to drop an anonymous listener. */
    if (dom.sl_kill && dom.sl_kill.parentNode) {
      var kill = dom.sl_kill.cloneNode(true);
      kill.innerHTML = 'delete this save';
      dom.sl_kill.parentNode.replaceChild(kill, dom.sl_kill);
      dom.sl_kill = kill;
      kill.addEventListener('click', function () { MOD_deleteSlot(MOD_activeSlot()); });
    }

    // The bar's ">>" hides dom.sl; the panel is a sibling and would be left
    // floating over the game on its own.
    if (dom.sl_h) dom.sl_h.addEventListener('click', function () { MOD_toggleSlotPanel(false); });

    console.log('[mod] save slots ready — ' + MOD.slot_count + ' slots, playing slot ' + MOD_activeSlot());
  } catch (e) {
    console.warn('[mod] save slot UI failed: ' + e.message);
  }
})();

/* Console equivalents, for when the bar is hidden. */
function modSaves() {
  var lines = ['Save slots (playing ' + MOD_activeSlot() + '):'];
  for (var i = 1; i <= MOD.slot_count; i++) {
    var s = MOD_slotInfo(i);
    lines.push('  ' + i + (i === MOD_activeSlot() ? ' *' : '  ') + '  ' +
      (s.empty ? 'empty' : (s.name + ', level ' + s.lvl +
        (s.saved ? ', ' + s.saved : '') + ', ' + s.kb + ' KB')));
  }
  lines.push('modSwitchSave(n) / modNewSave(n) / modDeleteSave(n)');
  var out = lines.join('\n');
  console.log(out);
  return out;
}
function modSwitchSave(n) { MOD_switchSlot(n); }
function modNewSave(n) { MOD_newSave(n); }
function modDeleteSave(n) { MOD_deleteSlot(n); }


/* ===========================================================================
   21. UNRESTRICTED ACTIONS (opt-in)
   ---------------------------------------------------------------------------
   One settings checkbox that does two things: lets sustained actions run at
   the same time, and lets them start anywhere.

   Both are off by default, because both are deliberate limits in the base
   game. It is one shared timer and one `global.current_a` on purpose, and
   every action's cond() is a designed restriction — Run refuses indoors,
   Forage refuses in the dark. This is a comfort switch, not a fix.

   --- how the game runs an action -------------------------------------------

       activateAct(a)   global.current_a.deactivate(); a.activate();
                        global.current_a = a
       a.activate()     clearInterval(timers.actm);
                        timers.actm = setInterval(() => this.use(), 1000)

   So starting a second action stops the first, in two separate ways: the
   explicit deactivate, and the shared `timers.actm` slot being overwritten.

   --- what this does instead ------------------------------------------------

   Rather than reimplement any of it, each action's own activate/deactivate is
   wrapped and the timer SLOT is swapped around the call:

       activate:    park whatever is in timers.actm, null the slot so the
                    action's own clearInterval is a no-op, let it run and set
                    timers.actm to its interval, move that onto the action,
                    put the parked value back
       deactivate:  put the action's own interval into the slot first, so the
                    action's own clearInterval stops the right one

   That works for the base game's Run and Investigate as written, and for the
   mod's four, because all six use exactly the same clearInterval/setInterval
   shape. Nothing about the timer handling is duplicated or guessed at.

   Toggling an action off is the other half. The click handler reads

       if(a.cond()===true && a.id!==global.current_a.id) activateAct(a)
       else if(a.id===global.current_a.id) deactivateAct(global.current_a)

   so only the most recent action can be clicked off. With conditions bypassed
   the first branch always wins, so activateAct treats a click on an action
   that is already running as "stop it" — which makes every row toggle again.
   =========================================================================== */

MOD.free_key = 'p23_mod_freeactions';

var MOD_FREE = {
  on: false,
  maxErrors: 5      // an action whose tick keeps throwing is stopped, not spammed
};

(function () {
  try {
    var v = localStorage.getItem(MOD.free_key);
    if (v !== null) MOD_FREE.on = (v === '1' || v === 'true');
  } catch (e) { /* private mode */ }
})();

/* Every action the game has, plus any granted later. Wrapping is done once per
   action and is inert while the switch is off. */
function MOD_wrapAction(a) {
  if (!a || a._modWrapped) return;
  a._modWrapped = true;

  var origCond = a.cond, origAct = a.activate, origDeact = a.deactivate, origUse = a.use;

  a.cond = function (l) {
    if (MOD_FREE.on) return true;
    return origCond.apply(this, arguments);
  };

  a.activate = function () {
    if (!MOD_FREE.on) return origAct.apply(this, arguments);
    var parked = timers.actm;
    timers.actm = null;                      // its clearInterval becomes a no-op
    try { origAct.apply(this, arguments); }
    finally {
      this._modTimer = timers.actm;          // whatever interval it just started
      timers.actm = parked;
    }
    this.active = true;
    this._modErrors = 0;
  };

  a.deactivate = function () {
    if (!MOD_FREE.on) return origDeact.apply(this, arguments);
    var parked = timers.actm;
    timers.actm = this._modTimer || null;    // so its clearInterval stops its own
    try { origDeact.apply(this, arguments); }
    finally {
      if (this._modTimer) clearInterval(this._modTimer);
      this._modTimer = null;
      timers.actm = parked;
    }
    this.active = false;
  };

  /* A tick running somewhere the action was never meant to run can throw —
     Investigate reads global.current_l, which is not always what it expects.
     Left alone that would fire every second forever. */
  a.use = function () {
    if (!MOD_FREE.on) return origUse.apply(this, arguments);
    try { return origUse.apply(this, arguments); }
    catch (e) {
      this._modErrors = (this._modErrors || 0) + 1;
      if (this._modErrors >= MOD_FREE.maxErrors) {
        console.warn('[mod] "' + this.name + '" kept failing here, stopping it: ' + e.message);
        if (typeof msg === 'function') msg('You cannot keep that up here', 'red');
        try { MOD_stopOne(this); } catch (e2) {}
      }
    }
  };
}

function MOD_wrapAllActions() {
  for (var k in act) MOD_wrapAction(act[k]);
}
MOD_wrapAllActions();

// Anything granted later — the four earned in section 4, Investigate from the
// basement — gets wrapped as it arrives.
var MOD_giveAction_original = giveAction;
giveAction = function (a) {
  MOD_wrapAction(a);
  return MOD_giveAction_original(a);
};

/* Stop one action and hand "current" to whatever else is still running, so the
   busy flag and the actions-tab highlight stay honest. */
function MOD_stopOne(a) {
  try { a.deactivate(); } catch (e) { a.active = false; }
  a.active = false;
  var live = [];
  for (var i = 0; i < acts.length; i++) if (acts[i] && acts[i].active === true) live.push(acts[i]);
  if (live.length) {
    global.current_a = live[live.length - 1];
  } else {
    global.current_a = act.default;
    global.flags.busy = false;
    if (dom.ct_bt3) dom.ct_bt3.style.backgroundColor = 'inherit';
  }
  try { for (var j in acts) if (acts[j].t) refreshAct(acts[j].t, acts[j]); } catch (e) {}
}

var MOD_activateAct_original = activateAct;
var MOD_deactivateAct_original = deactivateAct;

activateAct = function (actn) {
  if (!MOD_FREE.on) return MOD_activateAct_original(actn);
  // The click handler can no longer reach the "stop it" branch for anything but
  // the most recent action, so a click on a running one lands here instead.
  if (actn && actn.active === true) { MOD_stopOne(actn); return; }
  actn.activate();                          // note: no deactivate of current_a
  global.current_a = actn;
  global.flags.busy = true;
  if (dom.ct_bt3) dom.ct_bt3.style.backgroundColor = 'darkslategray';
};

deactivateAct = function (actn) {
  if (!MOD_FREE.on) return MOD_deactivateAct_original(actn);
  MOD_stopOne(actn);
};

/* load() rebuilds the action list and sets every active flag to false, which
   would strand any interval this section is holding. */
var MOD_load_before_free = load;
load = function (dt) {
  try { MOD_stopAllActions(true); } catch (e) {}
  return MOD_load_before_free.apply(this, arguments);
};

function MOD_stopAllActions(silent) {
  for (var k in act) {
    var a = act[k];
    if (!a) continue;
    if (a._modTimer) { clearInterval(a._modTimer); a._modTimer = null; }
    if (!silent && a.active) { try { a.deactivate(); } catch (e) {} }
    a.active = false;
  }
  global.current_a = act.default;
  global.flags.busy = false;
  if (dom.ct_bt3) dom.ct_bt3.style.backgroundColor = 'inherit';
}

/* Turning the switch off has to leave the game in a state it understands:
   one action at most, on the shared timer. Everything is stopped rather than
   guessing which one to keep. */
function setFreeActions(on) {
  var want = !!on;
  if (want !== MOD_FREE.on) {
    var running = 0;
    for (var i = 0; i < acts.length; i++) if (acts[i] && acts[i].active === true) running++;
    if (running) MOD_stopAllActions(false);
    MOD_FREE.on = want;
  }
  try { localStorage.setItem(MOD.free_key, want ? '1' : '0'); } catch (e) {}
  try { for (var j in acts) if (acts[j].t) refreshAct(acts[j].t, acts[j]); } catch (e) {}
  var line = 'Unrestricted actions: ' + (want ? 'on — run several at once, anywhere' : 'off');
  console.log('[mod] ' + line);
  if (typeof msg === 'function') msg(line, want ? 'gold' : 'skyblue');
  return want;
}

function getFreeActions() { return MOD_FREE.on; }


/* --- the checkbox ----------------------------------------------------------
   Same row shape as the number boxes in section 18.
   -------------------------------------------------------------------------- */

function MOD_settingsCheckbox(label, get, set, hint) {
  try {
    var row = addElement(dom.ctrwin4, 'div', null, 'opt_c');
    var lab = addElement(row, 'div', null, 'opt_t');
    lab.innerHTML = label;

    var inp = addElement(row, 'input', null, 'opt_v mod_optn');
    inp.type = 'checkbox';
    inp.checked = !!get();
    inp.style.cssText = 'width:auto;text-align:left;background:transparent;' +
                        'border:1px solid #46a;cursor:pointer;';
    inp.addEventListener('change', function () { inp.checked = !!set(inp.checked); });

    if (hint) { try { addDesc(row, null, 2, label, hint); } catch (e) {} }

    MOD_SETTINGS.inputs.push({ el: inp, get: get, box: true });
    return inp;
  } catch (e) { console.warn('[mod] settings checkbox "' + label + '" failed: ' + e.message); }
}

MOD_settingsCheckbox('Unrestricted actions',
  function () { return MOD_FREE.on; },
  function (v) { return setFreeActions(v); },
  'Run several actions at once, and start them anywhere —<br>' +
  'in a fight, indoors, in the dark, while working.<br>' +
  'Both are limits the base game means to impose, so this is off by default.<br>' +
  'Turning it back off stops everything that is running.<br>' +
  'Persists across reloads.');

/* The tick sync in section 18 assumes .value; checkboxes need .checked. */
var MOD_ontick_before_free = ontick;
ontick = function () {
  MOD_ontick_before_free();
  try {
    for (var i = 0; i < MOD_SETTINGS.inputs.length; i++) {
      var s = MOD_SETTINGS.inputs[i];
      if (!s.box || document.activeElement === s.el) continue;
      var v = !!s.get();
      if (s.el.checked !== v) s.el.checked = v;
    }
  } catch (e) {}
};

console.log('[mod] unrestricted actions ' + (MOD_FREE.on ? 'ON' : 'off') +
            ' — settings checkbox, or setFreeActions(true/false)');


/* ===========================================================================
   22. PERKS FOR THE TOP HALF OF THE LADDER
   ---------------------------------------------------------------------------
   Section 19 made level 110 reachable. Nothing was waiting up there.

   Measured across all 94 skills before this section:

       25 skills   no milestones at all
       12 skills   nothing past level 10
       44 skills   nothing past level 50   (the mod's own tiers stop there)
       13 skills   something past 50, and only 10 of those go past 60

   So 81 of 94 skills gave nothing at all between 51 and 110 — the entire top
   half of a ladder the seventh pass had just spent its effort making real.

   --- one rule, applied everywhere ------------------------------------------

   Every skill gets the ladder rungs it does not already have:

       10, 25, 50, 60, 75, 90, 110

   appended at every level strictly above its current highest milestone. That
   is uniform, needs no per-skill list, and is always ascending — which the
   save format requires, since "granted" flags are stored by array index and
   `tests/audit.mjs` fails the build if the order breaks. A skill topping out
   at 50 gains four perks; one already reaching 75 gains two; one with none
   gains the whole ladder.

   The rungs are the cap ladder's own (60/75/90/110 are four of its tiers), so
   reaching a new story cap and pushing a skill into it pay off together.

   --- relevant, not uniform -------------------------------------------------

   What each perk DOES comes from the skill's own type, so a resistance skill
   gets resistance and an absorption skill gets elemental defence rather than
   everything getting the same stat:

       1 combat      STR and critical damage
       2 physical    STR and max HP
       3 agility     AGL
       4 mental      INT and EXP gain
       5 crafting    INT and energy efficiency
       6 resistance  its own damage type, off you.res, plus max HP
       7 absorption  its own element, off you.caff, plus INT
       0 gathering   Harvesting alone, typed 0 by the base game
       8 gathering   STR, max energy, energy efficiency
       9 upkeep      INT and energy efficiency
      10 social      luck and EXP gain

   Two things deliberately avoided:

   `skl.<x>.p` is never touched. Skill xp multipliers are restored from the
   save AFTER milestones fire, so a newly added perk that raised one would have
   its work overwritten on the very load that first granted it, and `g` would
   then be true forever. Stats are restored BEFORE milestones, which is why
   everything else here is safe.

   Absorption perks use `you.caff` rather than `you.res`. Section 13 already
   drives four of those skills continuously off `you.res`, reconciled through
   `global.flags.mod_aff`; writing to the same table from a milestone would
   fight that reconciliation.
   =========================================================================== */

var MOD_LADDER = [10, 25, 50, 60, 75, 90, 110];

// per-rung magnitudes, index-matched to MOD_LADDER
var MOD_RUNG = {
  flat: [1, 3, 6, 8, 11, 14, 18],
  mult: [0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20],
  expt: [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10],
  res:  [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.09],
  aff:  [1, 1, 2, 2, 3, 3, 4]
};

// type 6: which damage or status each resistance skill actually resists
var MOD_RES_OF = {
  poisr: ['poison', 'Poison'], bledr: ['bleed', 'Bleeding'],
  crptr: ['curse', 'Curse'],   coldr: ['frost', 'Frost'],
  painr: ['ph', 'Physical'],   wthrn: ['burn', 'Burn']
};

// type 7: the affinity index each absorption skill covers, from dmg_calc's
// own switch (1 air, 2 earth, 3 fire, 4 water, 5 light, 6 dark)
var MOD_AFF_OF = {
  aba: [1, 'Air'], abe: [2, 'Earth'], abf: [3, 'Fire'],
  abw: [4, 'Water'], abl: [5, 'Light'], abd: [6, 'Dark'],
  lunr: [5, 'Light'], nwmn: [6, 'Dark']
};

var MOD_pctTxt = function (v) { return Math.round(v * 100) + '%'; };

/* Build one rung for one skill. Returns null when the type has nothing
   sensible to give, so the caller can skip rather than invent something. */
function MOD_ladderPerk(key, sk, i) {
  var F = MOD_RUNG.flat[i], M = MOD_RUNG.mult[i],
      X = MOD_RUNG.expt[i], R = MOD_RUNG.res[i], A = MOD_RUNG.aff[i];
  var lv = MOD_LADDER[i];

  switch (sk.type) {
    // Critical damage gets a QUARTER of the multiplier the other stats get.
    // cpwr is shared by 13 combat skills and compounds across all seven rungs,
    // so at full value it ran 1.2 -> 13.0 by cap 110, which made a crit 23x a
    // normal swing: one swing in five carrying most of the damage, and a mean
    // five times the median. The strength side carries the growth instead.
    case 1: return { lv: lv, g: false,
      p: 'STR +' + F + ', STR Multiplier +' + MOD_pctTxt(M * 1.25) + ', Critical Damage +' + MOD_pctTxt(M / 4),
      f: function () { you.stra += F; you.strm += M * 1.25; you.mods.cpwr += M / 4; you.stat_r(); } };

    case 2: return { lv: lv, g: false,
      p: 'STR +' + F + ', HP +' + (F * 20) + ', STR Multiplier +' + MOD_pctTxt(M / 2),
      f: function () { you.stra += F; you.hpa += F * 20; you.strm += M / 2; you.stat_r(); } };

    case 3: return { lv: lv, g: false,
      p: 'AGL +' + F + ', AGL Multiplier +' + MOD_pctTxt(M),
      f: function () { you.agla += F; you.aglm += M; you.stat_r(); } };

    case 4: return { lv: lv, g: false,
      p: 'INT +' + F + ', INT Multiplier +' + MOD_pctTxt(M) + ', EXP Gain +' + MOD_pctTxt(X),
      f: function () { you.inta += F; you.intm += M; you.exp_t += X; you.stat_r(); } };

    case 5: return { lv: lv, g: false,
      p: 'INT +' + F + ', Energy Effectiveness +' + MOD_pctTxt(M / 2),
      f: function () { you.inta += F; you.mods.sbonus += M / 2; you.stat_r(); } };

    case 6: {
      var r = MOD_RES_OF[key];
      if (!r) return { lv: lv, g: false,
        p: 'HP +' + (F * 15) + ', Max Energy +' + (F * 15),
        f: function () { you.hpa += F * 15; you.sata += F * 15; you.stat_r(); } };
      return { lv: lv, g: false,
        p: r[1] + ' damage taken −' + MOD_pctTxt(R) + ', HP +' + (F * 10),
        f: function () {
          you.res[r[0]] = Math.max(you.res[r[0]] - R, 0.05);   // res is a damage multiplier
          you.hpa += F * 10; you.stat_r();
        } };
    }

    case 7: {
      var a = MOD_AFF_OF[key];
      if (!a) return { lv: lv, g: false,
        p: 'INT +' + F + ', INT Multiplier +' + MOD_pctTxt(M / 2),
        f: function () { you.inta += F; you.intm += M / 2; you.stat_r(); } };
      return { lv: lv, g: false,
        p: a[1] + ' elemental defence +' + A + ', INT +' + F,
        f: function () { you.caff[a[0]] += A; you.inta += F; you.stat_r(); } };
    }

    // type 0 is Harvesting alone — the base game's odd one out, and a gathering
    // skill in everything but its type number
    case 0:
    case 8: return { lv: lv, g: false,
      p: 'STR +' + F + ', Max Energy +' + (F * 25) + ', Energy Effectiveness +' + MOD_pctTxt(M / 2),
      f: function () { you.stra += F; you.sata += F * 25; you.mods.sbonus += M / 2; you.stat_r(); } };

    case 9: return { lv: lv, g: false,
      p: 'INT +' + F + ', Energy Effectiveness +' + MOD_pctTxt(M / 2) + ', EXP Gain +' + MOD_pctTxt(X),
      f: function () { you.inta += F; you.mods.sbonus += M / 2; you.exp_t += X; you.stat_r(); } };

    case 10: return { lv: lv, g: false,
      p: 'Luck +' + Math.max(Math.round(F / 2), 1) + ', EXP Gain +' + MOD_pctTxt(X),
      f: function () { you.luck += Math.max(Math.round(F / 2), 1); you.exp_t += X; you.stat_r(); } };

    default: return null;
  }
}

(function () {
  var skills = 0, perks = 0;
  for (var key in skl) {
    var sk = skl[key];
    if (!sk || typeof sk !== 'object' || !sk.name) continue;
    if (key === 'rnwn') continue;                 // Renown is driven by titles, not levels

    var have = (sk.mlstn || []).map(function (m) { return m.lv; });
    var top = have.length ? Math.max.apply(null, have) : 0;

    var add = [];
    for (var i = 0; i < MOD_LADDER.length; i++) {
      if (MOD_LADDER[i] <= top) continue;         // append only, always ascending
      var perk = MOD_ladderPerk(key, sk, i);
      if (perk) add.push(perk);
    }
    if (!add.length) continue;
    MOD_addMilestones(sk, add);
    skills++; perks += add.length;
  }
  console.log('[mod] ' + perks + ' perks added across ' + skills +
              ' skills, filling levels up to ' + MOD_LADDER[MOD_LADDER.length - 1]);
})();

/* What a given skill still has ahead of it. */
function modPerks(key) {
  var sk = skl[key];
  if (!sk) { console.log('no such skill: ' + key); return ''; }
  var lines = [sk.name + ' (lv ' + sk.lvl + ') — ' + (sk.mlstn || []).length + ' perks:'];
  (sk.mlstn || []).forEach(function (m) {
    lines.push('  lv ' + String(m.lv).padStart(3) + (m.g ? '  *  ' : '     ') + m.p);
  });
  var out = lines.join('\n');
  console.log(out);
  return out;
}


/* ===========================================================================
   23. CHANGELOG ACCESS
   ---------------------------------------------------------------------------
   Two changelogs, two ways in.

       version number  ->  changelog/changelog.html      the game's, the author's
       "changelog"     ->  changelog/mod-changelog.html  this mod's

   The mod's entries used to be prepended to the author's file, above his own.
   They are in their own file now: the only thing the mod changes in anything
   of his is the single script tag in index.html, which was always the point.

   The version number is rebound rather than left alone because the game's own
   handler is `window.open('/changelog/changelog.html')` — an absolute path from
   the SERVER ROOT, so it only resolves when the game is served from the root of
   a host. From a file:// URL or any subdirectory it 404s, which is how a local
   copy usually gets opened. It now resolves against document.baseURI and goes
   to the same place it always did. Replacing the node is the only way to drop
   the game's anonymous listener.

   The labelled button exists because nothing about "v470" says "click me".
   =========================================================================== */

MOD.changelog = 'changelog/mod-changelog.html';
MOD.changelog_game = 'changelog/changelog.html';

/* Relative to the document, so it works from file://, from a subdirectory and
   from a server root alike. */
function MOD_url(rel) {
  try { return new URL(rel, document.baseURI).href; }
  catch (e) { return '/' + rel; }
}

function modChangelog() {
  var url = MOD_url(MOD.changelog);
  try { window.open(url, '_blank'); } catch (e) {}
  console.log('[mod] mod changelog: ' + url);
  return url;
}

function modGameChangelog() {
  var url = MOD_url(MOD.changelog_game);
  try { window.open(url, '_blank'); } catch (e) {}
  console.log('[mod] game changelog: ' + url);
  return url;
}

(function () {
  try {
    var btn = addElement(dom.sl, 'span', null, 'sl');
    btn.innerHTML = 'changelog';
    btn.style.cssText = 'width:auto;padding:3px;cursor:pointer;';
    btn.title = "What this mod changed (the version number opens the game's own)";
    btn.addEventListener('click', modChangelog);
    dom.sl.insertBefore(btn, dom.sl_extra);

    if (dom.vrs && dom.vrs.parentNode) {
      var v = dom.vrs.cloneNode(true);
      dom.vrs.parentNode.replaceChild(v, dom.vrs);
      dom.vrs = v;
      v.title = "The game's changelog";
      v.addEventListener('click', modGameChangelog);
    }
    console.log('[mod] changelog button -> ' + MOD_url(MOD.changelog));
  } catch (e) {
    console.warn('[mod] changelog button failed: ' + e.message);
  }
})();


/* ===========================================================================
   24. TITLE RANKS, A TITLE PER SKILL TIER, AND WHAT THEY DO
   ---------------------------------------------------------------------------
   Three problems with titles as they stood.

   RANK MEANT NOTHING. `rar` ran 0-5 and was assigned by feel, so the game
   handed out rank 3 titles at skill level 8: Runner at Walking 10, Rookie at
   Fighting 15, Dissector at Disassembly 8. Eight of them, all early.

   THERE WERE TOO FEW. 120 titles across 93 skills, and 73 of those come from
   story events rather than skills, so most skills granted none at all.

   THEY DID ALMOST NOTHING. Four titles in the entire game carry a `talent`
   (Walker, Jogger, and two others). The rest are pure flavour: the "SELECT
   YOUR TITLE" window sets `you.title`, which is the name printed next to your
   level and nothing else.

   --- rank is derived now, not assigned ------------------------------------

   A title's rank comes from the level at which it can first be earned:

       rank   1   2   3   4   5   6   7   8   9  10
       level  1   8  18  30  45  58  70  82  90  110

   Rank 10 therefore means level 110 and nothing else does. For the 47 titles
   granted by a skill milestone the level is read straight out of the milestone
   itself — `f.toString()` is scanned for a `giveTitle` call, so this stays
   correct if a grant moves. The other 73 come from story events with no level
   to read, so their author-assigned 0-5 is stretched onto the new scale
   instead; that keeps the author's ordering and keeps ranks 9 and 10 meaning
   "level 110", which is the point.

   --- five per skill --------------------------------------------------------

   Every skill grants a title at levels 25, 50, 75, 90 and 110 — ranks 3, 5, 7,
   9 and 10 — which every skill has milestones for after section 22. 465 new
   titles.
   The grant is folded into the existing milestone at that level rather than
   added as a new one, because two milestones at the same level would collide:
   the save keys "granted" flags by array index and `tests/audit.mjs` rejects
   duplicate levels.

   Names are formulaic — a rank word chosen by skill type, then the skill.
   With 372 of them generated, legible and consistent beats individually
   crafted, and pretending otherwise would just make them hard to tell apart.

   --- and they do something -------------------------------------------------

   Each granted title raises its own skill's exp rate, in the spirit of the
   handful the base game bothered to give a talent. That is `skl.<x>.p`, which
   is restored from the save AFTER milestones fire — so it is emphatically NOT
   set from milestone code. It is reconciled on the tick against a record of
   what has already been applied, exactly the way section 13 handles `you.res`.

   --- what "wearing" a title is for ----------------------------------------

   Base-game talents were already permanent the moment the title was earned;
   they never needed selecting. These new bonuses are the opposite by default:
   only the title you are WEARING applies, which finally gives the selection
   window a reason to exist.

   Renown then buys that away. At renown level N, every title of rank N or
   lower applies permanently whether worn or not, so renown 10 makes the whole
   collection passive. The worn title always applies regardless of its rank.
   =========================================================================== */

/* --- A. rank ------------------------------------------------------------- */

/* Tuned so the five rungs a skill grants at land on distinct ranks — 25 -> 3,
   50 -> 5, 75 -> 7, 90 -> 9, 110 -> 10 — and so the story titles stretched onto
   this scale fill 1, 2, 4, 6 and 8 between them. Every rank is populated; an
   empty rank would read as a missing tier rather than a design. */
var MOD_RANK_AT = [1, 8, 18, 30, 45, 58, 70, 82, 90, 110];   // min level per rank
var MOD_RANK_MAX = MOD_RANK_AT.length;

function MOD_rankForLevel(lv) {
  var r = 1;
  for (var i = 0; i < MOD_RANK_AT.length; i++) if (lv >= MOD_RANK_AT[i]) r = i + 1;
  return r;
}

/* Which level grants which title, read out of the milestones themselves. */
function MOD_titleGrantLevels() {
  var at = {};
  for (var k in skl) {
    var s = skl[k];
    if (!s || typeof s !== 'object' || !s.mlstn) continue;
    for (var i = 0; i < s.mlstn.length; i++) {
      var m = s.mlstn[i], src;
      try { src = String(m.f); } catch (e) { continue; }
      if (src.indexOf('giveTitle') < 0) continue;
      var hits = src.match(/ttl\.[A-Za-z0-9_]+|MOD_title\(['"][A-Za-z0-9_]+['"]\)/g) || [];
      for (var j = 0; j < hits.length; j++) {
        var key = hits[j].indexOf('MOD_title') === 0
          ? 'mod_' + hits[j].match(/['"]([A-Za-z0-9_]+)['"]/)[1]
          : hits[j].slice(4);
        if (!at[key] || at[key] > m.lv) at[key] = m.lv;
      }
    }
  }
  return at;
}

function MOD_rerankTitles() {
  var at = MOD_titleGrantLevels(), fromLevel = 0, stretched = 0;
  for (var k in ttl) {
    var t = ttl[k];
    if (!t || !t.name) continue;
    if (t._modRanked) continue;
    if (at[k] !== undefined) {
      t.rar = MOD_rankForLevel(at[k]);
      t._modAtLevel = at[k];
      fromLevel++;
    } else {
      // no level to read: stretch the author's 0-5 onto 1-10, leaving 9 and 10
      // to mean "earned at level 110"
      // 0->1 1->2 2->4 3->5 4->6 5->8: spreads the author's six grades over the
      // ranks the skill rungs leave free, and never reaches 9 or 10, which mean
      // "level 90" and "level 110"
      var STRETCH = [1, 2, 4, 5, 6, 8];
      t.rar = STRETCH[Math.min(Math.max(Math.round(Number(t.rar) || 1), 0), 5)];
      stretched++;
    }
    t._modRanked = true;
  }
  return { fromLevel: fromLevel, stretched: stretched };
}

/* --- B. four titles per skill -------------------------------------------- */

var MOD_TITLE_RUNGS = [25, 50, 75, 90, 110];

// rank words by skill type, one per rung
/* Nouns, all of them: the title renders as "<word> of <skill>", so an
   adjective reads as a mistake ("Peerless of Fighting"). */
var MOD_RANK_WORDS = {
  0:  ['Gleaner', 'Forager', 'Provider', 'Steward', 'Warden'],
  1:  ['Recruit', 'Veteran', 'Warmaster', 'Champion', 'Paragon'],
  2:  ['Trainee', 'Stalwart', 'Ironside', 'Bulwark', 'Titan'],
  3:  ['Sprinter', 'Shade', 'Phantom', 'Zephyr', 'Ghost'],
  4:  ['Student', 'Scholar', 'Sage', 'Luminary', 'Oracle'],
  5:  ['Apprentice', 'Journeyman', 'Master', 'Artisan', 'Grandmaster'],
  6:  ['Ward', 'Bulwark', 'Bastion', 'Aegis', 'Immortal'],
  7:  ['Adept', 'Channeler', 'Conduit', 'Avatar', 'Ascendant'],
  8:  ['Gleaner', 'Forager', 'Provider', 'Steward', 'Warden'],
  9:  ['Hand', 'Keeper', 'Custodian', 'Curator', 'Archivist'],
  10: ['Face', 'Notable', 'Luminary', 'Legend', 'Myth']
};

// exp bonus the title gives its own skill, per rung
var MOD_TITLE_XP = [0.05, 0.10, 0.15, 0.20, 0.30];

var MOD_SKILL_TITLES = [];        // {key, skill, rung, rank, xp}
var MOD_TITLE_ID_BASE = 3000;     // clear of the game's 107 and the mod's 201-215

(function () {
  var id = MOD_TITLE_ID_BASE, made = 0, wrapped = 0;

  for (var key in skl) {
    var sk = skl[key];
    if (!sk || typeof sk !== 'object' || !sk.name || key === 'rnwn') continue;
    if (!sk.mlstn || !sk.mlstn.length) continue;

    var words = MOD_RANK_WORDS[sk.type] || MOD_RANK_WORDS[4];
    var label = sk.bname || sk.name;

    for (var r = 0; r < MOD_TITLE_RUNGS.length; r++) {
      var want = MOD_TITLE_RUNGS[r];
      var idx = -1;
      for (var i = 0; i < sk.mlstn.length; i++) if (sk.mlstn[i].lv === want) { idx = i; break; }
      if (idx < 0) continue;                       // skill has no milestone there

      var t = new Title(id++);
      t.name = words[r] + ' of ' + label;
      t.rar = MOD_rankForLevel(want);
      t.desc = 'Earned by taking ' + label + ' to level ' + want + '.';
      t.tdesc = label + ' exp +' + Math.round(MOD_TITLE_XP[r] * 100) + '%';
      t._modRanked = true;
      t._modAtLevel = want;
      var tKey = 'mod_t_' + key + '_' + want;
      ttl[tKey] = t;

      MOD_SKILL_TITLES.push({ key: tKey, skill: key, rung: want,
                              rank: t.rar, xp: MOD_TITLE_XP[r] });
      made++;

      /* Fold the grant into the milestone already at that level. A second
         milestone at the same level would be a duplicate the save cannot tell
         apart by index. */
      (function (m, title) {
        var inner = m.f;
        m.f = function () { inner.call(this); try { giveTitle(title); } catch (e) {} };
        m.p = (m.p ? m.p + ', ' : '') + 'title "' + title.name + '"';
      })(sk.mlstn[idx], t);
      wrapped++;
    }
  }
  console.log('[mod] ' + made + ' skill titles created across ' + wrapped + ' milestones');
})();

var MOD_RERANK = MOD_rerankTitles();
console.log('[mod] title ranks rescaled to 1-' + MOD_RANK_MAX + ' — ' +
            MOD_RERANK.fromLevel + ' from the level that grants them, ' +
            MOD_RERANK.stretched + ' stretched from the author\'s scale');


/* --- C. what the titles do ------------------------------------------------
   Reconciled on the tick rather than applied when the title is earned.
   `skl.<x>.p` is saved and is restored AFTER milestones fire, so a milestone
   that wrote to it would lose the write on the very load that granted it.
   Tracking what has been applied in `global.flags` — which is saved alongside
   — means the difference is all that is ever added, on any load, in any order.
   Same shape as MOD_applyAffinities in section 13.
   ------------------------------------------------------------------------- */

function MOD_permanentRank() {
  try { return Math.max(Number(skl.rnwn.lvl) || 0, 0); } catch (e) { return 0; }
}

/* Does this title's bonus apply right now? Worn always counts; otherwise the
   title's rank has to be within what renown has made passive. */
function MOD_titleActive(entry) {
  var t = ttl[entry.key];
  if (!t || t.have !== true) return false;
  try { if (you.title && you.title.id === t.id) return true; } catch (e) {}
  return entry.rank <= MOD_permanentRank();
}

function MOD_applyTitleBonuses() {
  try {
    if (typeof you === 'undefined' || !global.flags) return;
    if (!global.flags.mod_ttlxp) global.flags.mod_ttlxp = {};
    var applied = global.flags.mod_ttlxp;

    // what each skill's p SHOULD be carrying from titles right now
    var want = {};
    for (var i = 0; i < MOD_SKILL_TITLES.length; i++) {
      var e = MOD_SKILL_TITLES[i];
      if (!MOD_titleActive(e)) continue;
      want[e.skill] = (want[e.skill] || 0) + e.xp;
    }
    // every skill that has one, so a bonus that stops applying is taken back
    for (var j = 0; j < MOD_SKILL_TITLES.length; j++) {
      var key = MOD_SKILL_TITLES[j].skill;
      if (want[key] === undefined) want[key] = 0;
    }

    for (var k in want) {
      var sk = skl[k];
      if (!sk) continue;
      var have = Number(applied[k]) || 0;
      if (want[k] === have) continue;
      sk.p = Math.max((Number(sk.p) || 1) + (want[k] - have), 0.05);
      applied[k] = want[k];
    }
  } catch (e) { /* never break a tick over an exp multiplier */ }
}

// Undo everything this section put on skill xp rates, for going back.
function modResetTitleBonuses() {
  try {
    var applied = (global.flags && global.flags.mod_ttlxp) || {};
    for (var k in applied) {
      var sk = skl[k];
      if (sk && applied[k]) sk.p = Math.max((Number(sk.p) || 1) - applied[k], 0.05);
    }
    global.flags.mod_ttlxp = {};
    console.log('[mod] title exp bonuses removed');
    return true;
  } catch (e) { return false; }
}

var MOD_ontick_before_titles = ontick;
ontick = function () {
  MOD_ontick_before_titles();
  try { MOD_applyTitleBonuses(); } catch (e) {}
};

/* Selecting a title changes which bonus is live, so reconcile immediately
   rather than waiting up to a second for the next tick. */
var MOD_giveTitle_before_bonus = giveTitle;
giveTitle = function (t, lv) {
  var r = MOD_giveTitle_before_bonus(t, lv);
  try { MOD_updateRenown(); MOD_applyTitleBonuses(); } catch (e) {}
  return r;
};

if (dom.d3) {
  dom.d3.addEventListener('click', function () {
    // the game builds the picker on this same click; reconcile after it closes
    setTimeout(function () { try { MOD_applyTitleBonuses(); } catch (e) {} }, 50);
  });
}

MOD_applyTitleBonuses();


/* --- D. console ----------------------------------------------------------- */

function modTitles(rankFilter) {
  var rows = [], k, t;
  for (k in ttl) {
    t = ttl[k];
    if (!t || !t.name) continue;
    if (rankFilter !== undefined && t.rar !== Number(rankFilter)) continue;
    rows.push({ rank: t.rar || 1, name: t.name, have: t.have === true,
                lv: t._modAtLevel });
  }
  rows.sort(function (a, b) { return a.rank - b.rank || a.name.localeCompare(b.name); });

  var held = rows.filter(function (r) { return r.have; }).length;
  var lines = ['Titles: ' + held + ' of ' + rows.length + ' held. ' +
               'Renown ' + MOD_permanentRank() + ' — ranks up to ' + MOD_permanentRank() +
               ' apply without wearing them.'];
  var byRank = {};
  rows.forEach(function (r) { byRank[r.rank] = byRank[r.rank] || { n: 0, have: 0 };
    byRank[r.rank].n++; if (r.have) byRank[r.rank].have++; });
  for (var r = 1; r <= MOD_RANK_MAX; r++) {
    var b = byRank[r] || { n: 0, have: 0 };
    lines.push('  rank ' + String(r).padStart(2) + ' (lv ' + String(MOD_RANK_AT[r - 1]).padStart(3) + '+)   ' +
               String(b.have).padStart(3) + ' / ' + String(b.n).padStart(3) + ' held' +
               (r <= MOD_permanentRank() ? '   <- passive' : ''));
  }
  lines.push('modTitles(n) lists one rank in full.');
  if (typeof msg === 'function') {
    msg(held + ' of ' + rows.length + ' titles held', 'gold');
    msg('Ranks up to ' + MOD_permanentRank() + ' apply without wearing them', 'grey');
    msg('Full breakdown printed to the browser console (F12)', 'grey');
  }
  if (rankFilter !== undefined) {
    lines.push('');
    rows.forEach(function (r) {
      lines.push('  ' + (r.have ? '[x] ' : '[ ] ') + r.name +
                 (r.lv ? '  (lv ' + r.lv + ')' : ''));
    });
  }
  var out = lines.join('\n');
  console.log(out);
  return out;
}


/* ===========================================================================
   25. THE TITLE PICKER, GROUPED BY SKILL
   ---------------------------------------------------------------------------
   Section 24 took the pool from 120 titles to 585. The game's picker is a flat
   list of every title held, in a 300px column — at five titles per skill that
   is a scroll of hundreds of near-identical rows, most of them superseded by
   the one below them.

   So titles that come from the same skill collapse into one row showing the
   best you hold, with a caret to open the rest:

       > Warmaster of Fighting            (5)
       > Bastion of Cold Resistance       (3)
         Thrasher
         Wolf Slayer

   Titles the game hands out for story events have no skill to group under and
   stay as plain rows, listed after the groups.

   --- how it hooks in -------------------------------------------------------

   The game's picker is built by an anonymous listener on dom.d3, so it cannot
   be removed. Rather than clone the node — which would drop `dom.d3.update`
   and the addDesc tooltip the game attached to it — this adds a SECOND
   listener. Listeners fire in the order they were added, so the game builds
   dom.ttlbd first and this rebuilds its contents immediately after, before a
   frame is ever drawn. Everything the game set up around it is untouched.

   --- which skill a title belongs to ---------------------------------------

   For the 465 generated ones, MOD_SKILL_TITLES already says. For the base
   game's, the milestone that grants the title is found by scanning `f`
   source for a giveTitle call — the same trick section 24 uses to date them —
   so "Civilian", "Trained Civilian", "Fighter" and "Rookie" group under
   Fighting alongside the generated five, rather than being stranded.
   =========================================================================== */

/* title key -> skill key, for everything that can be attributed to a skill */
var MOD_TITLE_SKILL = (function () {
  var map = {};
  // generated titles know their own skill
  for (var i = 0; i < MOD_SKILL_TITLES.length; i++) {
    map[MOD_SKILL_TITLES[i].key] = MOD_SKILL_TITLES[i].skill;
  }
  // the base game's, by reading the milestone that grants them
  for (var k in skl) {
    var s = skl[k];
    if (!s || typeof s !== 'object' || !s.mlstn) continue;
    for (var j = 0; j < s.mlstn.length; j++) {
      var src;
      try { src = String(s.mlstn[j].f); } catch (e) { continue; }
      if (src.indexOf('giveTitle') < 0) continue;
      var hits = src.match(/ttl\.[A-Za-z0-9_]+|MOD_title\(['"][A-Za-z0-9_]+['"]\)/g) || [];
      for (var h = 0; h < hits.length; h++) {
        var key = hits[h].indexOf('MOD_title') === 0
          ? 'mod_' + hits[h].match(/['"]([A-Za-z0-9_]+)['"]/)[1]
          : hits[h].slice(4);
        if (map[key] === undefined) map[key] = k;
      }
    }
  }
  return map;
})();

function MOD_titleKeyOf(title) {
  for (var k in ttl) if (ttl[k] === title) return k;
  return null;
}

var MOD_TTL_OPEN = {};        // which groups the player has expanded, this session

function MOD_closeTitlePicker() {
  try {
    empty(dom.ttlcont);
    document.body.removeChild(dom.ttlcont);
    empty(global.dscr); global.dscr.style.display = 'none';
  } catch (e) {}
  global.flags.ttlscrnopn = false;
}

function MOD_selectTitle(title) {
  you.title = title;
  dom.d3.innerHTML = ' lvl:' + you.lvl + ' \'' + you.title.name + '\'';
  MOD_closeTitlePicker();
  try { MOD_applyTitleBonuses(); } catch (e) {}   // worn title decides the bonus
}

/* One clickable title row, matching the game's own. The rank colour comes from
   section 26, which loads after this — fine, because nothing here runs until
   the player opens the picker. */
function MOD_titleRow(parent, title, indent) {
  var row = addElement(parent, 'div', null, 'youttl');
  var worn = false;
  try { worn = you.title && you.title.id === title.id; } catch (e) {}
  row.innerHTML = (indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : '') + '"' + title.name + '"' +
    (title.talent ? " <span style='color:yellow;text-shadow:0px 0px 5px orange'>*</span>" : '');
  try { MOD_paintTitle(row, title); } catch (e) {}
  // The colour slot now carries rank, so "worn" is shown by weight and a tint
  // instead. Not a glyph: the caret already owns the one that would read best,
  // and a second triangle in the same column is unreadable.
  if (worn) { row.style.fontWeight = 'bold'; row.style.backgroundColor = 'rgba(255,255,255,.10)'; }
  try { addDesc(row, title, 5); } catch (e) {}
  row.addEventListener('click', function () { MOD_selectTitle(title); });
  return row;
}

function MOD_renderTitlePicker() {
  var body = dom.ttlbd;
  if (!body || body._modGrouped) return;
  body._modGrouped = true;
  empty(body);

  // held titles, split into skill groups and loose ones
  var groups = {}, loose = [];
  for (var i = 0; i < global.titles.length; i++) {
    var t = global.titles[i];
    if (!t || !t.name) continue;
    var key = MOD_titleKeyOf(t);
    var skillKey = key ? MOD_TITLE_SKILL[key] : null;
    if (skillKey && skl[skillKey]) {
      (groups[skillKey] = groups[skillKey] || []).push(t);
    } else {
      loose.push(t);
    }
  }

  var names = Object.keys(groups).sort(function (a, b) {
    var an = skl[a].bname || skl[a].name, bn = skl[b].bname || skl[b].name;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  names.forEach(function (skillKey) {
    var held = groups[skillKey];
    // best first: rank, then the level it was earned at
    held.sort(function (a, b) {
      return (b.rar || 0) - (a.rar || 0) || (b._modAtLevel || 0) - (a._modAtLevel || 0);
    });

    if (held.length === 1) { MOD_titleRow(body, held[0], false); return; }

    var open = !!MOD_TTL_OPEN[skillKey];
    var head = addElement(body, 'div', null, 'youttl');
    head.style.display = 'flex';
    head.style.alignItems = 'center';

    var caret = addElement(head, 'span');
    caret.innerHTML = open ? '&#9662;' : '&#9656;';      // down / right
    caret.style.cssText = 'flex:0 0 18px;cursor:pointer;color:#8ab;';
    caret.title = held.length + ' titles from ' + (skl[skillKey].bname || skl[skillKey].name);

    var label = addElement(head, 'span');
    label.style.cssText = 'flex:1 1 auto;cursor:pointer;';
    var best = held[0], wornHere = false;
    try { wornHere = you.title && held.some(function (x) { return x.id === you.title.id; }); } catch (e) {}
    label.innerHTML = '"' + best.name + '"' +
      (best.talent ? " <span style='color:yellow;text-shadow:0px 0px 5px orange'>*</span>" : '');
    try { MOD_paintTitle(label, best); } catch (e) {}
    if (wornHere) { label.style.fontWeight = 'bold'; head.style.backgroundColor = 'rgba(255,255,255,.10)'; }

    var count = addElement(head, 'span');
    count.innerHTML = '(' + held.length + ')';
    count.style.cssText = 'flex:0 0 auto;color:#7a8a9a;padding-right:4px;';

    try { addDesc(label, best, 5); } catch (e) {}
    label.addEventListener('click', function () { MOD_selectTitle(best); });

    // the caret toggles without selecting, so re-render in place
    caret.addEventListener('click', function (ev) {
      ev.stopPropagation();
      MOD_TTL_OPEN[skillKey] = !MOD_TTL_OPEN[skillKey];
      body._modGrouped = false;
      MOD_renderTitlePicker();
    });

    if (open) for (var n = 1; n < held.length; n++) MOD_titleRow(body, held[n], true);
  });

  loose.sort(function (a, b) { return (b.rar || 0) - (a.rar || 0); });
  loose.forEach(function (t) { MOD_titleRow(body, t, false); });

  if (!global.titles.length) {
    var none = addElement(body, 'div', null, 'youttl');
    none.innerHTML = '<span style="color:grey">no titles yet</span>';
  }
}

/* Second listener on dom.d3 — see the header. Fires after the game has built
   the window, so dom.ttlbd is there to be rebuilt. */
if (dom.d3) {
  dom.d3.addEventListener('click', function () {
    try { MOD_renderTitlePicker(); } catch (e) {
      console.warn('[mod] grouped title picker failed, the game\'s own list stands: ' + e.message);
    }
  });
}

console.log('[mod] title picker groups by skill — ' +
            Object.keys(MOD_TITLE_SKILL).length + ' titles attributed to a skill');


/* ===========================================================================
   26. TITLE COLOURS FOR TEN RANKS
   ---------------------------------------------------------------------------
   The game already colours a title by rank, in the type 5 branch of dscr():

       rar 0 grey   2 cyan   3 lime   4 yellow   5 orange   6 purple

   with two problems that only became problems when section 24 started using
   the upper ranks.

   RANK 7 THROWS. Its branch sets `this.dl.style`, where every other branch
   sets `this.label.style`. `this.dl` is assigned in the type 6 and 7 branches
   of the same function, so in a type 5 call it is undefined and the tooltip
   dies half-built — the name is placed, the description never is. The base
   game topped out at rank 5, so the branch had never once run. There are now
   93 titles at rank 7.

   RANKS 1, 8, 9 AND 10 HAVE NO BRANCH, so 220 titles render with no colour at
   all, including every rank 10 in the game.

   Rather than patch the switch — it is inside a 200-line function that builds
   six different tooltip layouts — the title's rank is parked at 1 for the
   duration of the call, which is a value the switch has no branch for and so
   cannot throw on, and the label is coloured afterwards from the full ten-rank
   palette. The author's five colours are kept exactly where they are; the ramp
   only extends past where they stopped.

   The picker rows are coloured from the same table, which is the point of
   having it: with five titles per skill, rank is the thing you are reading.
   =========================================================================== */

/* index 1..10. The first six are the author's own, kept as they were, except
   purple which is lifted for legibility on the picker's dark blue. */
var MOD_RANK_COLOUR = {
  1:  { c: '#c3ccd6', s: '' },
  2:  { c: 'cyan',    s: '0px 0px 1px blue' },
  3:  { c: 'lime',    s: '0px 0px 2px lime' },
  4:  { c: 'yellow',  s: '0px 0px 3px orange' },
  5:  { c: 'orange',  s: '0px 0px 2px crimson,0px 0px 5px red' },
  6:  { c: '#c07bff', s: '1px 1px 1px black,0px 0px 3px purple' },
  7:  { c: '#ff5fb0', s: '0px 0px 2px #ff1e88,0px 0px 6px #7a0040' },
  8:  { c: '#ff3b3b', s: '0px 0px 3px #ff0000,0px 0px 7px #4a0000' },
  9:  { c: '#ffd24a', s: '0px 0px 3px #ffae00,0px 0px 8px #6b3b00' },
  10: { c: '#ffffff', s: '0px 0px 2px #fff,0px 0px 6px #6cf,0px 0px 12px #f6c' }
};

function MOD_rankStyle(rank) {
  return MOD_RANK_COLOUR[Math.min(Math.max(Number(rank) || 1, 1), 10)] || MOD_RANK_COLOUR[1];
}

/* Paint an element as a title of that rank. */
function MOD_paintTitle(el, title) {
  if (!el || !title) return el;
  var st = MOD_rankStyle(title.rar);
  el.style.color = st.c;
  el.style.textShadow = st.s;
  return el;
}

/* --- the tooltip ---------------------------------------------------------- */

var MOD_dscr_original = dscr;

dscr = function (c, what, type, ttlFlag, dsc, id) {
  if (type !== 5) return MOD_dscr_original.apply(this, arguments);

  var t = (ttlFlag === true) ? you.title : what;
  var keep = t ? t.rar : undefined;
  // 1 is the rank the game's switch has no branch for: no styling, no throw
  if (t) t.rar = 1;
  var r;
  try { r = MOD_dscr_original.apply(this, arguments); }
  finally { if (t) t.rar = keep; }

  try {
    if (t) {
      var label = global.dscr.querySelector('#d_l');
      if (label) MOD_paintTitle(label, t);
      // rank is worth stating now that it means a level rather than a mood
      var line = addElement(global.dscr, 'div', null, 'd_t');
      var lv = t._modAtLevel;
      line.innerHTML = '<small style="color:' + MOD_rankStyle(t.rar).c + '">Rank ' +
        (t.rar || 1) + '</small>' +
        (lv ? '<small style="color:grey"> — earned at level ' + lv + '</small>' : '');
    }
  } catch (e) { /* a tooltip must never break a hover */ }
  return r;
};

console.log('[mod] title colours extended to ten ranks (the game\'s rank 7 branch threw)');


/* ===========================================================================
   27. THE DOJO'S LEVEL ADVANCEMENT, CARRIED TO 110
   ---------------------------------------------------------------------------
   The dojo already has a reward ladder, and the instructor already promises it
   continues: "After every 5 levels you reach, come here and receive your
   share!" It then stops at level 30.

       dj1rw1  lv 5    25 coin, Low-grade Spirit Pill x5
       dj1rw2  lv 10  100 coin, Mid-grade x2
       dj1rw3  lv 15  200 coin, High-grade x1, gear
       dj1rw4  lv 20  300 coin, a weapon
       dj1rw5  lv 25  350 coin, an accessory
       dj1rw6  lv 30  400 coin, food

   Character level at the mod's endgame is around 92, so the instructor's
   promise goes unkept for the last eighty levels. This adds the sixteen rungs
   that finish it, 35 through 110, in fives.

   --- the pills had to be rebuilt first ------------------------------------

   Character exp per level is `4*lvl^3 + lvl^2`. At level 110 that is 5,336,100
   for one level, and the game's best pill is worth 15,000 — 0.3% of it. The
   ladder would have been handing out rounding errors. Four grades continue the
   author's own progression at roughly his own ratio:

       Superior       100,000     1/5 of a level at 50,  1/50 at 110
       Refined        600,000     1.2 levels at 50
       Sublime      3,500,000     2/3 of a level at 110
       Transcendent 20,000,000    3.7 levels at 110

   --- and a third grade of skillbook ---------------------------------------

   The base game has two: the Practitioner Skillbooks the instructor offers the
   first time you clear the dummies (+5%), and the named manuals after golem IV
   (+15%). A third at +30% is offered as a CHOICE at the level 50, 75 and 100
   rungs — the same shape as that first one, since that is the moment the
   request pointed at.

   These write `skl.<x>.p += rate` exactly as the base books do. That coexists
   with section 24's title bonuses because the reconciler there only ever adds
   and removes its own tracked delta, never assigns.

   --- why a separate lobby entry -------------------------------------------

   The base rungs are drawn by an anonymous click handler created inside
   chss.t3.sl, so there is no way to append to that screen without replacing
   the whole of sl(). The continuation is its own lobby entry instead, which
   appears only once dj1rw6 is set, so the two never overlap and the original
   is untouched.
   =========================================================================== */

/* --- A. spirit pills ------------------------------------------------------ */

var MOD_PILLS = [
  ['sp4', 9101, 'Superior Spirit Pill',      100000,
   'A pill refined from properly cultivated ki, the kind a sect issues rather than sells.'],
  ['sp5', 9102, 'Refined Spirit Pill',       600000,
   'Dense enough that the ki has to be guided rather than simply swallowed.'],
  ['sp6', 9103, 'Sublime Spirit Pill',      3500000,
   'The work of an alchemist who has stopped making mistakes. Rare enough to be spoken of.'],
  ['sp7', 9104, 'Transcendent Spirit Pill', 20000000,
   'Closer to a condensed lifetime of training than to medicine.']
];

MOD_PILLS.forEach(function (p, i) {
  var key = p[0], id = p[1], name = p[2], exp = p[3], flavour = p[4];
  var it = new Item(); it.id = id;
  it.name = name;
  it.rar = 3 + i;
  it.desc = flavour + dom.dseparator +
    '<span style="color:orange"> Grants +' + exp.toLocaleString() + ' EXP </span>';
  it.stype = 4;
  it.v = Math.max(Math.round(exp / 400), 1);
  it.use = function () {
    giveExp(exp, true, true, true);
    global.stat.plst++; global.stat.medst++;
    this.amount--;
  };
  item[key] = it;
});

/* --- B. a third grade of skillbook ----------------------------------------
   Shape copied from item.skl1a, including the reading flow through chss.trd.
   Named in the author's own register rather than "Master Skillbook (Swords)",
   since the grade below is "Bladesman Manual".
   ------------------------------------------------------------------------- */

var MOD_MANUALS = [
  ['srdc',  9110, 'Sword Saint Manual',  'the sword as the only thing in the world'],
  ['knfc',  9111, 'Nightblade Manual',   'the knife you never see'],
  ['axc',   9112, 'Headsman Manual',     'the axe, and where it is meant to land'],
  ['plrmc', 9113, 'Dragoon Manual',      'the spear held against a charge'],
  ['hmrc',  9114, 'Earthbreaker Manual', 'the hammer, and what it does to ground'],
  ['unc',   9115, 'Iron Body Manual',    'the body as the weapon it always was']
];
var MOD_MANUAL_RATE = 0.30;

var MOD_MANUAL_ITEMS = [];

MOD_MANUALS.forEach(function (m) {
  var skillKey = m[0], id = m[1], name = m[2], flavour = m[3];
  var sk = skl[skillKey];
  if (!sk) { console.warn('[mod] no skill ' + skillKey + ' for ' + name); return; }
  var it = new Item(); it.id = id;
  it.name = '"' + name + '"';
  it.rar = 4;
  it.desc = 'A master\'s own notes on ' + flavour + '. Most of it is in the margins.' +
    dom.dseparator + '<span style="color:deeppink">' + sk.name + ' EXP gain +' +
    Math.round(MOD_MANUAL_RATE * 100) + '%</span>';
  it.stype = 4;
  it.data.time = HOUR * 30;
  it.use = function () {
    if (!canRead()) return;
    if (this.data.timep >= this.cmax) {
      this.amount--;
      giveSkExp(sk, 9000);
      sk.p += MOD_MANUAL_RATE;
      this.data.read = false; this.data.finished = true;
      giveItem(item.bookgen);
    } else chss.trd.sl(this);
  };
  item['mod_' + skillKey + '_manual'] = it;
  MOD_MANUAL_ITEMS.push(it);
});

/* --- C. the rungs ---------------------------------------------------------
   Every five levels from 35 to 110, sequential the way the base six are, each
   needing the one before it. Coin and pills grow with the rung; a manual
   choice lands at 50, 75 and 100.
   ------------------------------------------------------------------------- */

function MOD_rungReward(lv) {
  if (lv <= 45) return { pill: 'sp4', n: lv <= 40 ? 2 : 3, coin: 400 + (lv - 30) * 20 };
  if (lv <= 70) return { pill: 'sp5', n: lv <= 60 ? 2 : 3, coin: 700 + (lv - 45) * 30 };
  if (lv <= 95) return { pill: 'sp6', n: lv <= 85 ? 2 : 3, coin: 1500 + (lv - 70) * 60 };
  return { pill: 'sp7', n: lv >= 110 ? 3 : 2, coin: 3000 + (lv - 95) * 100 };
}

/* Realms 6-10 are past what a village herbalist can source, so the dojo
   carries them. Spread over the continuation rungs rather than clustered, so
   each one is a reason to come back. */
var MOD_RUNG_REALM = { 45: 6, 60: 7, 75: 8, 90: 9, 105: 10 };

var MOD_DOJO_RUNGS = [];
for (var MOD_rl = 35; MOD_rl <= 110; MOD_rl += 5) {
  var rw = MOD_rungReward(MOD_rl);
  MOD_DOJO_RUNGS.push({
    lv: MOD_rl, flag: 'mod_djrw' + MOD_rl,
    pill: rw.pill, n: rw.n, coin: rw.coin,
    realmPill: MOD_RUNG_REALM[MOD_rl] || null,
    manual: (MOD_rl === 50 || MOD_rl === 75 || MOD_rl === 100)
  });
}

var MOD_RUNG_LINES = {
  35:  'Still here. Most of the people you started with are not.',
  50:  'Halfway to something. I have seen two disciples get this far.',
  75:  'You have outgrown what this hall was built to teach. Take the rest anyway.',
  100: 'I have nothing left to correct. I am giving you this because I said I would.',
  110: 'You walked in here unable to hit a straw dummy. Go on, then.'
};

/* Draw the continuation ladder. Only the first unclaimed rung you qualify for
   is offered, which is how the base six behave. */
function MOD_dojoAdvancement() {
  clr_chs();
  chs('"Instructor: You are still owed for every five levels. I keep my word, ' +
      'though I did not expect to keep it this long."', true);

  var next = null, i;
  for (i = 0; i < MOD_DOJO_RUNGS.length; i++) {
    if (!global.flags[MOD_DOJO_RUNGS[i].flag]) { next = MOD_DOJO_RUNGS[i]; break; }
  }

  if (!next) {
    chs('<span style="color:grey">Nothing further is owed. There is nothing further.</span>', false, 'grey');
  } else if (you.lvl < next.lv) {
    chs('<span style="color:grey">Next: level ' + next.lv + ' (you are ' + you.lvl + ')</span>',
        false, 'grey');
  } else {
    chs('"Level ' + next.lv + ' reward"', false, next.lv >= 100 ? 'gold' : 'royalblue')
      .addEventListener('click', function () {
        chs('"Instructor: ' + (MOD_RUNG_LINES[next.lv] || 'Good. Keep going.') + '"', true);
        chs('"Accept"', false, 'lime').addEventListener('click', function () {
          giveWealth(next.coin);
          giveItem(item[next.pill], next.n);
          if (next.realmPill && item['mod_bp' + next.realmPill]) {
            giveItem(item['mod_bp' + next.realmPill], 1);
            msg('Instructor: And this. I am not going to pretend I know where it came from.', 'gold');
          }
          if (next.manual) { MOD_dojoManualChoice(next); return; }
          global.flags[next.flag] = true;
          smove(chss.t3, false);
        });
      });
  }

  chs('"<= Back"', false).addEventListener('click', function () { smove(chss.t3, false); });
}

/* The manual choice, in the shape of the instructor's first skillbook offer. */
function MOD_dojoManualChoice(rung) {
  clr_chs();
  chs('"Instructor: And pick one of these. You have earned the reading time."', true, 'yellow');
  MOD_MANUAL_ITEMS.forEach(function (bk) {
    chs(bk.name, false).addEventListener('click', function () {
      giveItem(bk);
      global.flags[rung.flag] = true;
      smove(chss.t3, false);
    });
  });
  if (!MOD_MANUAL_ITEMS.length) {
    chs('"..."', false).addEventListener('click', function () {
      global.flags[rung.flag] = true; smove(chss.t3, false);
    });
  }
}

/* --- D. hanging it off the lobby ------------------------------------------
   chss.t3.sl draws several different screens; this belongs only on the
   ordinary lobby one, so the guard repeats the conditions the game's own
   `else` branch runs under. Every chs() here passes false — chs(txt, true)
   calls clr_chs() and would wipe the lobby that was just drawn.
   ------------------------------------------------------------------------- */

var MOD_t3_original_sl = chss.t3.sl;

chss.t3.sl = function () {
  MOD_t3_original_sl.apply(this, arguments);
  try {
    if (global.flags.nbtfail) return;                                    // the scolding
    if (!global.flags.dj1end) return;                                    // first skillbook choice
    if (global.flags.trnex1 === true && !global.flags.trnex2) return;    // the accessory gift
    if (global.flags.trne4e1 && !global.flags.trne4e1b) return;          // the named-manual choice
    if (!global.flags.dj1rw6) return;                                    // the base six come first

    chs('"Level Advancement (continued)"', false, 'orange')
      .addEventListener('click', function () { MOD_dojoAdvancement(); });
  } catch (e) {
    console.warn('[mod] dojo advancement failed to draw: ' + e.message);
  }
};

function modDojo() {
  var lines = ['Dojo level advancement (you are level ' + you.lvl + '):'];
  lines.push('  base rungs 5-30: ' + (global.flags.dj1rw6 ? 'complete' : 'not finished'));
  MOD_DOJO_RUNGS.forEach(function (r) {
    var done = !!global.flags[r.flag];
    lines.push('  ' + (done ? '[done] ' : (you.lvl >= r.lv ? '[open] ' : '[    ] ')) +
      'lv ' + String(r.lv).padStart(3) + '   ' + String(r.coin).padStart(5) + ' coin, ' +
      item[r.pill].name + ' x' + r.n + (r.manual ? ', a manual of your choice' : '') +
      (r.realmPill ? ', ' + item['mod_bp' + r.realmPill].name : ''));
  });
  var out = lines.join('\n');
  console.log(out);
  return out;
}

console.log('[mod] dojo advancement extended to level ' +
            MOD_DOJO_RUNGS[MOD_DOJO_RUNGS.length - 1].lv + ' (' + MOD_DOJO_RUNGS.length +
            ' rungs), ' + MOD_PILLS.length + ' spirit pill grades, ' +
            MOD_MANUAL_ITEMS.length + ' master manuals. modDojo() for the ladder.');


/* ===========================================================================
   28. CULTIVATION REALMS
   ---------------------------------------------------------------------------
   proto23 is already a cultivation game in its furniture — Qi Circulation,
   spirit pills "made from condensed Ki", a dojo, meridians in the skill text —
   without ever having the thing that genre is actually about: a realm you
   advance through, a bottleneck that stops you, and a breakthrough that costs
   something.

   The ladder is the genre's extended one — a convention rather than any
   particular author's invention, which is why every xianxia uses some version
   of it. Ten stages, and the thresholds are NOT written out here: they are
   MOD_RANK_AT, the same levels section 24 derives title ranks from. Realm 3 is
   exactly the Qi Circulation level that earns a rank 3 title, and each realm's
   own title lands at its own rank without being told to.

       0  Mortal                      —
       1  Qi Refining                 Qi Circulation 1
       2  Foundation Establishment                   8
       3  Core Formation                            18
       4  Nascent Soul                              30
       5  Spirit Severing                           45
       6  Soul Transformation                       58
       7  Void Refinement                           70
       8  Body Integration                          82
       9  Great Ascension                           90
      10  Tribulation Transcendence                110

   Deriving rather than restating means the two ladders cannot drift: retune
   MOD_RANK_AT and the realms follow.

   --- the bottleneck is the point ------------------------------------------

   Reaching the level does NOT advance the realm. It puts you AT a bottleneck,
   and breaking through costs a pill you have to have found or bought. That is
   the whole shape of the genre: the wall, the resource, the attempt. Without
   it a realm is just a second name for a level.

   A failed attempt costs the pill and drops you to 1 HP but never kills — the
   game has a death system with real consequences (`global.stat.deadt`, the
   `ndthextr` title) and a breakthrough should not silently interact with it.

   --- what a realm is worth -------------------------------------------------

   Each realm multiplies every stat, compounding, and widens what your body can
   hold: max HP and max energy scale with it too. The numbers are deliberately
   large — this is the axis the genre cares about, and section 8's enemy model
   measures the player rather than assuming a curve, so a big jump is absorbed
   as tougher enemies rather than as a broken game.

   Stored in `global.flags.mod_realm`, which is saved. The bonus is applied
   through allbuff like every other multiplier, never written into `you.stra`
   and friends, so it cannot compound across loads.
   =========================================================================== */

/* One realm per title rank, at the same thresholds — DERIVED from MOD_RANK_AT
   rather than restated, so the two ladders cannot drift apart. Realm 3 is
   exactly the Qi Circulation level that earns a rank 3 title, and each realm's
   own title comes out at its own rank without being told to.

   The ten-stage ladder is the genre's extended one, the same way the six-stage
   version was: shared across hundreds of works, invented by none of them. */
var MOD_REALM_DATA = [
  ['Qi Refining',              1.10, 1.20, 'Qi moves where you tell it to, mostly.'],
  ['Foundation Establishment', 1.30, 1.50, 'The channels are yours now, and they hold what you put in them.'],
  ['Core Formation',           1.55, 1.90, 'Something in your dantian has condensed and turned, and it does not stop turning.'],
  ['Nascent Soul',             1.85, 2.40, 'There is a second you in there, small and awake.'],
  ['Spirit Severing',          2.20, 3.00, 'You have cut something loose that most people carry their whole lives.'],
  ['Soul Transformation',      2.65, 3.80, 'The body has stopped being the part of you that matters.'],
  ['Void Refinement',          3.15, 4.70, 'You have started refining the space the qi moves through, rather than the qi.'],
  ['Body Integration',         3.80, 5.80, 'Flesh and spirit stop being two things you have to reconcile.'],
  ['Great Ascension',          4.80, 7.00, 'There is very little left above you, and it knows your name now.'],
  ['Tribulation Transcendence',6.00, 8.50, 'You are still standing in the same village. Nothing else is the same.']
];

var MOD_REALMS = [{ n: 0, name: 'Mortal', qic: 0, mult: 1, hp: 1,
                    desc: 'You breathe. That is all it is, for now.' }];

MOD_REALM_DATA.forEach(function (r, i) {
  MOD_REALMS.push({
    n: i + 1,
    name: r[0],
    qic: MOD_RANK_AT[i],        // the level that earns a rank i+1 title
    mult: r[1],
    hp: r[2],
    desc: r[3]
  });
});

MOD.realm_flag = 'mod_realm';

function MOD_realm() {
  var n = Number(global.flags[MOD.realm_flag]) || 0;
  return MOD_REALMS[Math.min(Math.max(n, 0), MOD_REALMS.length - 1)];
}

/* The realm you could reach, if you had the pill and the nerve. */
function MOD_realmEligible() {
  var lv = skl.qic ? skl.qic.lvl : 0, best = 0;
  for (var i = 0; i < MOD_REALMS.length; i++) if (lv >= MOD_REALMS[i].qic) best = i;
  return MOD_REALMS[best];
}

function MOD_atBottleneck() {
  return MOD_realmEligible().n > MOD_realm().n;
}

/* --- the breakthrough pills ----------------------------------------------
   One per realm above Mortal. Deliberately not craftable and not cheap: the
   resource is the obstacle, and a breakthrough you can buy in bulk is not a
   bottleneck.
   ------------------------------------------------------------------------- */

var MOD_PILL_NAMES = [
  ['Qi Gathering Pill',       'Coarse, bitter, and enough to force the first channels open.'],
  ['Foundation Pill',         'Sets what you have built, so it stops moving when you do.'],
  ['Core Condensing Pill',    'Meant to be swallowed whole. It is not meant to be pleasant.'],
  ['Soul Nascence Pill',      'Alchemists argue about whether making this one is permitted.'],
  ['Severing Pill',           'Whatever it cuts away does not grow back.'],
  ['Transformation Pill',     'The recipe is older than the village and shorter than a sentence.'],
  ['Void Refining Pill',      'It is not clear that this one is made of anything.'],
  ['Integration Pill',        'Taken by people who have already decided.'],
  ['Great Ascension Pill',    'Nobody sells these. They are given, or they are taken.'],
  ['Tribulation Pill',        'There is no record of who made the first one, or of what became of them.']
];

var MOD_BREAK_PILLS = MOD_PILL_NAMES.map(function (p, i) {
  return [i + 1, 9120 + i, p[0], p[1]];
});

MOD_BREAK_PILLS.forEach(function (b) {
  var realm = b[0], id = b[1], name = b[2], flavour = b[3];
  var it = new Item(); it.id = id;
  it.name = name;
  it.rar = Math.min(realm, 10);
  it.desc = flavour + dom.dseparator +
    '<span style="color:hotpink">Breaks through to ' + MOD_REALMS[realm].name + '</span><br>' +
    '<small style="color:grey">Needs Qi Circulation ' + MOD_REALMS[realm].qic +
    ' and the realm below it</small>';
  it.stype = 4;
  it.v = Math.round(150 * Math.pow(2.6, realm));
  it.use = function () { MOD_breakthrough(realm, this); };
  item['mod_bp' + realm] = it;
});

/* --- where the pills come from -------------------------------------------
   Shipped without this and the whole realm ladder was unreachable in normal
   play: the ten pills existed as items and nothing gave, dropped or sold them.
   The test called MOD_breakthrough directly and never asked where a pill came
   from, which is exactly the gap a test that mocks its inputs leaves open.

   Three sources, matching how far along each realm is:

     realm 1        the instructor, when the dojo finishes teaching you
     realms 2-5     the Herbalist, who already sells spirit pills
     realms 6-10    the dojo's Level Advancement rungs

   The Herbalist rather than a new alchemist shopfront: it is the marketplace's
   plants-and-medicine vendor, it already stocks sp1/sp2/sp3, and xianxia
   alchemy is herbalism with qi. Appending to `vendor.pha1.items` uses the
   game's own restock and purchase machinery — no new screen to keep in step.

   Save-safe: vendor stock is stored by item id and restored by scanning
   `itemgroup[(id+1)/10000|0]`, which for 912x is `item`, where these live.
   -------------------------------------------------------------------------- */

(function () {
  try {
    if (!vendor.pha1 || !vendor.pha1.items) return;
    // realms 2-5. Rarer and dearer the higher it goes; the top half is not
    // something a village herbalist can get hold of.
    [[2, 900, 0.55, 1, 2],
     [3, 3200, 0.40, 1, 2],
     [4, 11000, 0.25, 1, 1],
     [5, 38000, 0.12, 1, 1]].forEach(function (r) {
      var it = item['mod_bp' + r[0]];
      if (it) vendor.pha1.items.push({ item: it, p: r[1], c: r[2], min: r[3], max: r[4] });
    });
    // and the two spirit pill grades above the ones already on the shelf
    [[item.sp4, 2600, 0.5, 1, 3], [item.sp5, 14000, 0.3, 1, 2]].forEach(function (r) {
      if (r[0]) vendor.pha1.items.push({ item: r[0], p: r[1], c: r[2], min: r[3], max: r[4] });
    });
    console.log('[mod] Herbalist stocks breakthrough pills for realms 2-5');
  } catch (e) { console.warn('[mod] could not stock the Herbalist: ' + e.message); }
})();

/* --- the attempt ---------------------------------------------------------- */

function MOD_breakthrough(realm, pill) {
  var here = MOD_realm(), want = MOD_REALMS[realm];
  if (!want) return;

  if (realm !== here.n + 1) {
    msg(realm <= here.n ? 'You are already past that' : 'There is a realm between you and that one', 'red');
    return;
  }
  if (skl.qic.lvl < want.qic) {
    msg('Your qi is too thin for it — Qi Circulation ' + want.qic +
        ' (you are ' + skl.qic.lvl + ')', 'red');
    return;
  }
  if (global.flags.btl) { msg('Not in the middle of a fight', 'red'); return; }

  if (pill) pill.amount--;

  /* The attempt itself. Failure is possible and costs the pill, because a
     breakthrough you cannot fail is an inventory transaction. The odds improve
     with how far past the requirement you are — the genre's "consolidate first"
     advice, made mechanical. */
  var over = skl.qic.lvl - want.qic;
  var odds = Math.min(0.55 + over * 0.05, 0.95);
  if (random() > odds) {
    msg('The qi turns back on you. ' + want.name + ' does not open.', 'crimson');
    msg('You lose the pill, and most of what you had left.', 'grey');
    you.hp = 1;
    you.stat_r();
    return false;
  }

  global.flags[MOD.realm_flag] = realm;
  you.stat_r();
  try { allbuff(you); } catch (e) {}

  msg('— ' + want.name + ' —', 'gold');
  msg(want.desc, 'plum');
  try { if (ttl['mod_realm' + realm]) giveTitle(ttl['mod_realm' + realm]); } catch (e) {}
  try { MOD_updateRenown(); } catch (e) {}
  return true;
}

/* A title per realm, so the ladder shows in the places titles already show.
   Ranked by the Qi Circulation level each needs, the way section 24 ranks
   everything else. */
MOD_REALMS.forEach(function (r) {
  if (!r.n) return;
  var t = new Title(3900 + r.n);
  t.name = r.name;
  t.desc = r.desc;
  t.rar = MOD_rankForLevel(r.qic);
  t._modRanked = true;
  t._modAtLevel = r.qic;
  ttl['mod_realm' + r.n] = t;
});

/* --- the bonus ------------------------------------------------------------
   Applied in allbuff, never written into the stat fields, so it cannot
   accumulate across loads the way a milestone bonus would.
   ------------------------------------------------------------------------- */

var MOD_allbuff_before_realm = allbuff;

allbuff = function (who) {
  MOD_allbuff_before_realm(who);
  try {
    if (!who || typeof you === 'undefined' || who.id !== you.id) return;
    var r = MOD_realm();
    if (r.n === 0) return;
    you.str *= r.mult; you.int *= r.mult; you.agl *= r.mult; you.spd *= r.mult;
    you.hpmax = Math.round(you.hpmax * r.hp);
    you.satmax = Math.round(you.satmax * r.hp);
    if (you.hp > you.hpmax) you.hp = you.hpmax;
  } catch (e) { /* never break a stat refresh */ }
};

function modRealm() {
  var here = MOD_realm(), next = MOD_REALMS[here.n + 1];
  var lines = ['Realm: ' + here.name + (here.n ? '  (all stats x' + here.mult +
               ', body x' + here.hp + ')' : ''), ''];
  MOD_REALMS.forEach(function (r) {
    var mark = r.n === here.n ? ' <- you' :
               (r.n === here.n + 1 && skl.qic.lvl >= r.qic ? ' <- open, needs ' + item['mod_bp' + r.n].name : '');
    lines.push('  ' + (r.n <= here.n ? '[x] ' : '[ ] ') + String(r.n) + '  ' +
      r.name.padEnd(26) + ' Qi Circulation ' + String(r.qic).padStart(3) + mark);
  });
  lines.push('', 'Qi Circulation is at ' + (skl.qic ? skl.qic.lvl : 0) + '.');
  if (next && skl.qic.lvl >= next.qic) {
    var over = skl.qic.lvl - next.qic;
    lines.push('You are at a bottleneck. Breaking through succeeds ' +
      Math.round(Math.min(0.55 + over * 0.05, 0.95) * 100) + '% of the time at this level;' +
      ' train Qi Circulation past ' + next.qic + ' to improve it.');
  }
  var out = lines.join('\n');
  console.log(out);
  return out;
}

console.log('[mod] cultivation realms: ' + (MOD_REALMS.length - 1) + ' above mortal, ' +
            'currently ' + MOD_realm().name + '. modRealm() for the ladder.');


/* ===========================================================================
   29. ELEMENTAL MASTERY
   ---------------------------------------------------------------------------
   The game has six Absorption skills — Fire, Water, Air, Earth, Light, Dark —
   and they are entirely defensive: they train when you are hit by that element
   and reduce what it does to you. There is no way to USE an element. For a
   game with meridians in its skill descriptions that is a conspicuous hole.

   Six Mastery skills fill it, one per element, each paired with the Absorption
   it shares a channel with.

   --- how a technique lands ------------------------------------------------

   Combat is automatic — `fght` calls `battle_ai`, there is no per-turn ability
   picker to hang a spell button on. So a technique is a PROC: `you.battle_ai`
   is wrapped, and each swing has a chance to come out as a technique instead
   of a weapon blow.

   That chance is the mastery level and the realm together, and it is capped
   well under 1 so a weapon never becomes decoration.

   The technique itself is an `Ability` with `stt: 2` and `aff` set to its
   element, which routes it through the INT branch of dmg_calc — so it scales
   with INT, with `you.aff[element]`, and with the elemental defence of what
   you are hitting, rather than with STR and your weapon. It is a genuinely
   different attack, not a reskinned one.

   --- gated on the realm ---------------------------------------------------

   Nothing procs at Mortal. You cannot throw fire before your channels are
   open, which is both the genre's rule and a reason for section 28 to matter
   in combat rather than only on the character sheet.
   =========================================================================== */

/* element index as dmg_calc's own switch uses it:
   1 air, 2 earth, 3 fire, 4 water, 5 light, 6 dark */
var MOD_ELEMENTS = [
  ['fire',  'Fire Mastery',  3, 'abf', 2001, 'Lantern Splitting Palm',
   'Heat with somewhere to be', 'orangered'],
  ['water', 'Water Mastery', 4, 'abw', 2002, 'Still Water Draw',
   'Water does not hurry and does not stop', 'deepskyblue'],
  ['air',   'Air Mastery',   1, 'aba', 2003, 'Hollow Gale',
   'The space a blow travels through, turned against it', 'lightcyan'],
  ['earth', 'Earth Mastery', 2, 'abe', 2004, 'Settling Weight',
   'Everything is heavier than it wants to be', 'sandybrown'],
  ['light', 'Light Mastery', 5, 'abl', 2005, 'Noon Without Shade',
   'Light with nothing merciful in it', 'lightyellow'],
  ['dark',  'Dark Mastery',  6, 'abd', 2006, 'Lamp Going Out',
   'What is left when the light is taken away', 'mediumpurple']
];

var MOD_MASTERY = [];      // {key, skill, elem, techKey}

MOD_ELEMENTS.forEach(function (e, i) {
  var key = e[0], label = e[1], elem = e[2], absorb = e[3],
      id = e[4], techName = e[5], flavour = e[6], colour = e[7];

  var sk = new Skill();
  sk.id = 2010 + i;                       // clear of the mod's other ranges
  sk.type = 7;                            // the absorptions' own type
  sk.name = label;
  sk.desc = flavour + MOD_SEP +
    '<small style="color:' + colour + '">Your strikes sometimes become "' + techName + '"</small>';
  sk.mlstn = [];                          // section 22 fills the ladder in below
  skl['mod_' + key] = sk;

  var tech = new Ability(id);
  tech.name = techName;
  tech.stt = 2;                           // INT branch of dmg_calc
  tech.aff = elem;
  tech.atrg = ' <span style="color:' + colour + '">' + techName + '</span> -> ';
  abl['mod_' + key] = tech;

  MOD_MASTERY.push({ key: 'mod_' + key, skill: sk, elem: elem, tech: tech,
                     absorb: absorb, colour: colour, name: techName });
});

/* Give the six the same perk ladder every other skill got in section 22, so
   they are not the only skills in the game with nothing to reach for. */
MOD_MASTERY.forEach(function (m) {
  var add = [];
  for (var i = 0; i < MOD_LADDER.length; i++) {
    var perk = MOD_ladderPerk(m.key, m.skill, i);
    if (perk) add.push(perk);
  }
  if (add.length) MOD_addMilestones(m.skill, add);
});

/* Register the six with the machinery sections 10 and 11 built before they
   existed — the id->key map the cap system reads, and the section/parent
   grouping the skill panel draws from. `rnwn` needed exactly this in section 17
   for the same reason: a skill created after those maps are built is invisible
   to them. */
MOD_MASTERY.forEach(function (m) {
  try {
    MOD_KEY_BY_ID[m.skill.id] = m.key;
    MOD_PARENT_OF[m.key] = MOD_PARENT_KEY[MOD_sectionOf(m.skill)];
  } catch (e) { console.warn('[mod] could not register ' + m.key + ': ' + e.message); }
});

/* --- the proc -------------------------------------------------------------
   Chance rises with the mastery and with the realm, and is capped so a weapon
   always matters. Ties go to the highest-levelled mastery rather than to
   whichever happens to be first in the list.
   ------------------------------------------------------------------------- */

var MOD_TECH = {
  perLevel: 0.006,     // per mastery level
  perRealm: 0.012,     // per realm above Mortal — 10 realms now, not 6
  cap: 0.45,           // no single element ever exceeds this
  power: 1.15          // techniques hit slightly above a plain swing
};

function MOD_techChance(m) {
  var realm = MOD_realm().n;
  if (realm < 1) return 0;                            // channels are not open
  if (!m.skill.lvl) return 0;
  return Math.min(m.skill.lvl * MOD_TECH.perLevel + realm * MOD_TECH.perRealm, MOD_TECH.cap);
}

/* Pick a technique for this swing, or null for an ordinary attack. */
function MOD_pickTechnique() {
  var best = null, bestChance = 0;
  for (var i = 0; i < MOD_MASTERY.length; i++) {
    var c = MOD_techChance(MOD_MASTERY[i]);
    if (c <= 0) continue;
    if (random() < c && c > bestChance) { best = MOD_MASTERY[i]; bestChance = c; }
  }
  return best;
}

var MOD_battle_ai_original = you.battle_ai;

you.battle_ai = function (x, y, z) {
  try {
    var m = MOD_pickTechnique();
    if (m) {
      giveSkExp(m.skill, 1.2);
      if (skl[m.absorb]) giveSkExp(skl[m.absorb], 0.3);   // the paired channel
      if (skl.qic) giveSkExp(skl.qic, 0.4);
      return attack(x, y, m.tech, MOD_TECH.power);
    }
  } catch (e) { /* a failed proc must never cost you the swing */ }
  return MOD_battle_ai_original.call(this, x, y, z);
};

/* Live effect lines, the way section 5 does for everything else. */
MOD_MASTERY.forEach(function (m) {
  MOD_EFFECTS[m.key] = function (s) {
    var c = MOD_techChance(m);
    if (MOD_realm().n < 1) {
      return '<span style="color:grey">Your channels are closed — no technique will fire ' +
             'until Qi Refining</span>';
    }
    return '"' + m.name + '" fires on ' + Math.round(c * 100) + '% of your strikes' +
      ' <small style="color:grey">(' + Math.round(MOD_TECH.cap * 100) + '% cap)</small>' +
      '<br><small style="color:' + m.colour + '">Scales with INT and ' +
      (skl[m.absorb] ? skl[m.absorb].name : 'its element') + ', not with your weapon</small>';
  };
});

function modMastery() {
  var realm = MOD_realm();
  var lines = ['Elemental mastery (realm: ' + realm.name + '):'];
  if (realm.n < 1) lines.push('  Nothing fires below Qi Refining.');
  MOD_MASTERY.forEach(function (m) {
    lines.push('  ' + m.skill.name.padEnd(16) + ' lv ' + String(m.skill.lvl).padStart(3) +
      '   "' + m.name + '"'.padEnd(24) +
      '  ' + Math.round(MOD_techChance(m) * 100) + '% of strikes');
  });
  var out = lines.join('\n');
  console.log(out);
  return out;
}

console.log('[mod] elemental mastery: ' + MOD_MASTERY.length +
            ' skills with techniques that fire in combat. modMastery() for the rates.');


/* ===========================================================================
   30. TWO PLACES
   ---------------------------------------------------------------------------
   The mod had added systems and no world. This adds the two places the game
   itself was already pointing at.

   --- the catacombs, which were finished and unreachable -------------------

   26 locations exist, fully written, with their own ambient text table and a
   bestiary entry for the ghouls that says they live there. Nothing links in:
   `grep catamn` returns its definition, its own handler, and one
   `smove(chss.catamn)` from INSIDE cata1 going back. Its own exit leads to the
   Village Center, which is where the entrance was always meant to be.

   So the entrance is one `chs()` on the Village Center — the same trick the
   Old Path trailhead uses. Nothing here is written by the mod; it opens the
   author's own rooms.

   It has to be GATED, though, and not for flavour. Visiting sets `mod_t_cata`,
   which is the cap-40 rung in MOD_TIERS — the rung that has been dead all
   along because nothing could reach it. Open the door to a fresh character and
   they take cap 40 straight out of the tutorial, past the forest's 20 and the
   deep forest's 30. Gated on `mod_t_deep` instead, so the ladder keeps its
   order: forest 20 -> deep forest 30 -> catacombs 40 -> arena 50.

   --- the Pill Tower, which the author started and commented out -----------

   On the Village Center, in the author's own file:

       //  chs('"=> Visit Pill Tower"',false).addEventListener('click',()=>{
       //    smove(chss.pltwr1);
       //  });

   The choice was written and commented away; `chss.pltwr1` was never built.
   An alchemists' tower is exactly what a cultivation game wants and exactly
   what this mod was missing, so this builds it rather than inventing a
   different shopfront.

   The location is `chss.mod_pltwr`, not `chss.pltwr1` — if the author ever
   finishes theirs, the two must not collide.

   Gated on having a realm: they do not let mortals past the door. That gives
   the realm ladder somewhere to be visible in the world rather than only on
   the character sheet, and it is the genre's own snobbery.
   =========================================================================== */

/* --- A. the catacombs entrance -------------------------------------------- */

MOD.cata_gate = 'mod_t_deep';       // cap 30 — see the header for why

var MOD_lsmain1_original_sl = chss.lsmain1.sl;

chss.lsmain1.sl = function () {
  MOD_lsmain1_original_sl.apply(this, arguments);
  try {
    /* Every chs() here passes false. chs(txt, true) calls clr_chs() and would
       wipe the Village Center that was just drawn. */
    if (global.flags[MOD.cata_gate] === true) {
      chs('"=> Enter the Catacombs"', false, 'darkgrey').addEventListener('click', function () {
        smove(chss.catamn);
      });
    }
    if (MOD_realm().n >= 1) {
      chs('"=> Visit the Pill Tower"', false, 'plum').addEventListener('click', function () {
        smove(chss.mod_pltwr);
      });
    }
  } catch (e) {
    console.warn('[mod] village center additions failed: ' + e.message);
  }
};

/* --- B. the Pill Tower ---------------------------------------------------- */

/* Its own vendor: the grades a village herbalist cannot source. Same shape as
   the game's own vendors, so restock and the purchase screen work unchanged. */
vendor.mod_pltwr = new Vendor();
vendor.mod_pltwr.name = 'Pill Tower';
vendor.mod_pltwr.infl = 1;
vendor.mod_pltwr.dfl = 0.25;
vendor.mod_pltwr.timeorig = 3;                 // restocks every three days
vendor.mod_pltwr.data = { time: 3, rep: 0 };
vendor.mod_pltwr.items = [
  { item: item.mod_bp6,  p: 120000,  c: 0.45, min: 1, max: 1 },
  { item: item.mod_bp7,  p: 340000,  c: 0.30, min: 1, max: 1 },
  { item: item.mod_bp8,  p: 900000,  c: 0.20, min: 1, max: 1 },
  { item: item.mod_bp9,  p: 2400000, c: 0.12, min: 1, max: 1 },
  { item: item.mod_bp10, p: 7000000, c: 0.06, min: 1, max: 1 },
  { item: item.sp6,      p: 90000,   c: 0.5,  min: 1, max: 2 },
  { item: item.sp7,      p: 480000,  c: 0.3,  min: 1, max: 1 }
].filter(function (e) { return !!e.item; });
restock(vendor.mod_pltwr);

/* The spirit vein. Somewhere for cultivation to GO — the realm ladder was
   otherwise entirely a character-sheet affair. Once a day, because a place you
   can sit in forever is just a faster version of the action you already have.
   The day is read off `time.day`, which the game already advances. */
MOD.vein_flag = 'mod_vein_day';

function MOD_veinReady() {
  return Number(global.flags[MOD.vein_flag] || -1) !== Number(time.day);
}

function MOD_veinExp() {
  // scales with the realm, so it stays worth the walk
  return Math.round(60 * Math.pow(1.9, MOD_realm().n));
}

chss.mod_pltwr = new Chs(); chss.mod_pltwr.id = 976;

chss.mod_pltwr.sl = function () {
  global.flags.inside = true;
  d_loc('Pill Tower');
  global.lst_loc = 976;

  var realm = MOD_realm();
  chs('The air inside is thick enough to lean on. Somewhere above, something is being ' +
      'refined that the attendants will not name.', true);
  chs('<span style="color:grey">Attendant: ' + realm.name + '. You may go up as far as the ' +
      'second floor.</span>', false, 'grey');

  chs('"Purchase"', false, 'orange').addEventListener('click', function () {
    chs_spec(4, vendor.mod_pltwr);
    chs('"<= Return"', false, '', '', null, null, null, true).addEventListener('click', function () {
      smove(chss.mod_pltwr, false);
    });
  });

  if (MOD_veinReady()) {
    chs('"Sit in the spirit vein"', false, 'plum').addEventListener('click', function () {
      var gain = MOD_veinExp();
      global.flags[MOD.vein_flag] = time.day;
      try { giveSkExp(skl.qic, gain); } catch (e) {}
      chs('You sit where the floor is warmest and stop doing anything else.', true, 'plum');
      chs('<span style="color:#7cf">Qi Circulation +' + gain.toLocaleString() +
          ' exp. The vein will not give again today.</span>', false);
      chs('"<= Stand up"', false).addEventListener('click', function () {
        smove(chss.mod_pltwr, false);
      });
    });
  } else {
    chs('<span style="color:grey">The vein is spent for today</span>', false, 'grey');
  }

  chs('"<= Leave"', false).addEventListener('click', function () {
    smove(chss.lsmain1);
  });
};

try { addtosector(sector.vmain1, chss.mod_pltwr); } catch (e) { /* sector optional */ }

console.log('[mod] catacombs entrance (gated on ' + MOD.cata_gate +
            ') and the Pill Tower added to the Village Center');


/* ===========================================================================
   31. THE WIKI
   ---------------------------------------------------------------------------
   A reference for the game, opened from the bottom bar and from the settings
   menu, in a tab of its own.

   It is GENERATED FROM THE LIVE GAME DATA, every time it is opened, and that
   is the whole design. A hand-written wiki for 200-odd skills, 500-odd titles,
   50 areas and 11 realms would be wrong within a week — and wrong in the worst
   way, since a reference nobody can trust is worse than none. Reading `skl`,
   `item`, `area`, `ttl`, `act` and the mod's own tables means the page cannot
   disagree with the game: if a number changes here, the wiki changes with it,
   including changes made from the console mid-session.

   It also reads the SAVE, so it doubles as a progress sheet — your level in
   every skill, which perks you have taken, which titles you hold, what your
   realm is and what the next one costs. The parts you have not reached are
   still listed: this is a wiki, not a fog-of-war map.

   Two things it deliberately does not do:

     * It does not open inside the game. The panel is ~700px of a fixed layout
       with a fixed bottom bar; a reference wants a sidebar and a wide table.
     * It does not fetch anything. The document is built as a string and written
       into the new window, so it works from file://, from a subdirectory and
       from a server root alike — the same reason MOD_url exists for the
       changelog.

   `modWiki()` returns the HTML rather than only opening it, so tests can assert
   on the document without driving a popup.
   =========================================================================== */

var MOD_WIKI = {
  title: 'proto23 — wiki',
  /* Nothing in here is user input: every string comes from the game file or
     from this mod. The one real hazard of building a document as a string is a
     literal </script> inside content closing the block early, so that is the
     one thing scrubbed. */
  safe: function (h) {
    return String(h === undefined || h === null ? '' : h).replace(/<\/script/gi, '<\\/script');
  }
};

/* Descriptions carry real HTML (coloured spans, the game's separator div), so
   they are passed through rather than escaped — but the separator becomes a
   rule, since a wiki row is not a tooltip. */
function MOD_wikiDesc(d) {
  var s;
  try { s = (typeof d === 'function') ? d() : d; } catch (e) { s = ''; }
  if (!s) return '';
  s = String(s).split('<div class="dseparator">　</div>').join('<br>');
  return MOD_WIKI.safe(s);
}

function MOD_wikiNum(n) {
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

/* An effect line at a level the player has not reached yet. The effect
   functions read the skill they are handed, so the level is borrowed and put
   back; anything that throws simply gets no projection. */
function MOD_wikiEffectAt(key, sk, lvl) {
  var eff = MOD_EFFECTS[key];
  if (!eff) return '';
  var was = sk.lvl, out = '';
  try { sk.lvl = lvl; out = eff(sk) || ''; }
  catch (e) { out = ''; }
  finally { sk.lvl = was; }
  return MOD_WIKI.safe(out);
}

/* --- page builders --------------------------------------------------------
   Each returns the inner HTML of one page. `wk-e` marks a searchable entry and
   `wk-g` a group that hides itself when all its entries are filtered out.
   ------------------------------------------------------------------------- */

var MOD_WIKI_PAGES = [];

function MOD_wikiPage(id, label, build) {
  MOD_WIKI_PAGES.push({ id: id, label: label, build: build });
}

/* A collapsible group.

   Not decoration: with every skill, item and title listed, three of the eleven
   pages ran past 40,000 pixels — a hundred screens of scrolling, which is the
   same as not having the content at all. Collapsed, each of those pages opens
   as an index you can read in one screen and expand where you want.

   <details> rather than a click handler, so it still works with JavaScript off,
   the browser's own find can be made to reach inside it, and the summary is
   keyboard-reachable for free. `level` is the heading level for the summary,
   since a group is sometimes a section of a page and sometimes a subsection. */
function MOD_wikiGroup(heading, count, inner, level) {
  var hn = 'h' + (level || 2);
  return '<details class="wk-g"><summary><' + hn + '>' + heading +
    (count !== null && count !== undefined
      ? ' <span class="dim">(' + count + ')</span>' : '') +
    '</' + hn + '></summary><div class="wk-gi">' + inner + '</div></details>';
}

/* --- 1. orientation ------------------------------------------------------- */
MOD_wikiPage('start', 'Start here', function () {
  var cap = MOD_levelCap();
  var realm = MOD_realm();
  var h = '<h1>proto23</h1>' +
    '<p class="lede">An idle RPG by truezhangwei, plus a mod. You train skills by ' +
    'doing things, the things you can do open up as the story does, and none of ' +
    'it is in a hurry.</p>' +

    '<div class="wk-now"><h3>Where you are right now</h3><table>' +
    '<tr><td>Character level</td><td>' + MOD_wikiNum(you.lvl) + '</td></tr>' +
    '<tr><td>Skill level cap</td><td>' + cap + ' <span class="dim">— ' +
      MOD_WIKI.safe(MOD_CAP.name) + '</span></td></tr>' +
    '<tr><td>Cultivation realm</td><td>' + MOD_WIKI.safe(realm.name) +
      ' <span class="dim">(' + realm.n + ' of ' + (MOD_REALMS.length - 1) + ')</span></td></tr>' +
    '<tr><td>Titles held</td><td>' + MOD_titleCount() + ' <span class="dim">— renown ' +
      (skl.rnwn ? skl.rnwn.lvl : 0) + '</span></td></tr>' +
    '<tr><td>Coin</td><td>' + MOD_wikiNum(you.wealth || 0) + '</td></tr>' +
    '</table></div>' +

    '<h2>The four things worth knowing early</h2>' +
    '<dl>' +
    '<dt>Your skill levels are capped by the story, not by grinding.</dt>' +
    '<dd>The cap starts at 10 and ends at 110, and it moves when you reach a new ' +
    'place — not when you earn enough experience. If a skill has stopped ' +
    'levelling, you are not doing it wrong; you need to go somewhere. See ' +
    '<a href="#progress">Progression</a>.</dd>' +

    '<dt>Armour is subtraction, so levels matter more than they look.</dt>' +
    '<dd>A hit does the attacker\'s STR minus the defender\'s STR. That means a ' +
    'small gap in strength is a large gap in damage, and a big enough one takes ' +
    'your damage to nothing at all rather than merely reducing it. See ' +
    '<a href="#mechanics">Mechanics</a>.</dd>' +

    '<dt>Most skills have a parent that pulls them along.</dt>' +
    '<dd>Every section has a parent skill that earns a share of everything its ' +
    'children do, and any child lagging behind the parent trains faster — up to ' +
    'twice as fast at ' + MOD_PARENT.maxGap + ' levels behind. A neglected skill is ' +
    'cheap to bring up later, which is the only reason having this many is ' +
    'workable.</dd>' +

    '<dt>Cultivation is a second ladder, and it is not automatic.</dt>' +
    '<dd>Circulating qi levels a skill; the skill does not raise your realm. ' +
    'Reaching the level opens a bottleneck, and breaking through it costs a pill ' +
    'and can fail. See <a href="#cultivation">Cultivation</a>.</dd>' +
    '</dl>' +

    '<h2>What is the mod and what is the game</h2>' +
    '<p>The game is <code>index.html</code> and it is entirely truezhangwei\'s ' +
    'work. Everything in <code>mod.js</code> is a modification of it and is not ' +
    'endorsed by the author. Pages here mark added content with ' +
    '<span class="tag mod">mod</span> where the distinction matters. The full ' +
    'list of changes is in the changelog, on the bottom bar.</p>';
  return h;
});

/* --- 2. progression ------------------------------------------------------- */
MOD_wikiPage('progress', 'Progression', function () {
  var cap = MOD_levelCap();
  var h = '<h1>Progression</h1>' +
    '<p class="lede">Skill levels are capped by how far the story has gone. Ten ' +
    'rungs, 10 through 110. The cap applies to every skill at once; Renown is ' +
    'the single exception, since it is counted rather than trained.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Cap</th><th>Stage</th>' +
    '<th>What opens it</th><th></th></tr></thead><tbody>';

  MOD_TIERS.forEach(function (t) {
    var got = null;
    try { got = MOD_tierFlag(t); } catch (e) {}
    var here = (t.cap === cap);
    var need = t.needText ? t.needText
      : (t.flags.length ? t.flags.join(' or ') : 'the start of the game');
    h += '<tr class="wk-e' + (got ? ' done' : '') + (here ? ' here' : '') + '">' +
      '<td class="num">' + t.cap + '</td>' +
      '<td>' + MOD_WIKI.safe(t.name) + '</td>' +
      '<td class="dim">' + MOD_WIKI.safe(need) + '</td>' +
      '<td>' + (here ? '<span class="tag here">you are here</span>'
                     : got ? '<span class="tag done">reached</span>' : '') + '</td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>The experience curve</h2>' +
    '<p>The mod replaces the game\'s skill curve, which was super-exponential — ' +
    'level 109 to 110 alone cost 1.16&times;10<sup>14</sup> experience, so the top ' +
    'of the ladder was unreachable by a factor of about ten trillion. It is now ' +
    'geometric:</p>' +
    '<pre>next level = ' + MOD_XP.base + ' &times; ' + MOD_XP.ratio + '<sup>level</sup></pre>' +
    '<p>tuned so a skill that ticks steadily reaches 110 in roughly six months at ' +
    '1&times; speed. Character level uses the game\'s own curve, untouched.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Level</th><th>Experience for the next</th>' +
    '</tr></thead><tbody>';
  [1, 10, 25, 50, 60, 75, 90, 109].forEach(function (l) {
    h += '<tr><td class="num">' + l + '</td><td class="num">' +
      MOD_wikiNum(MOD_XP.base * Math.pow(MOD_XP.ratio, l)) + '</td></tr>';
  });
  h += '</tbody></table>';
  return h;
});

/* --- 3. skills ------------------------------------------------------------ */
MOD_wikiPage('skills', 'Skills', function () {
  var cap = MOD_levelCap();
  var bySection = {};
  var keys = [];
  for (var k in skl) {
    var s = skl[k];
    if (!s || typeof s !== 'object' || !s.name) continue;
    keys.push(k);
  }
  keys.forEach(function (k) {
    var s = skl[k];
    var sec = MOD_sectionOf(s);
    (bySection[sec] = bySection[sec] || []).push(k);
  });

  var h = '<h1>Skills</h1>' +
    '<p class="lede">' + keys.length + ' skills in ' +
    Object.keys(MOD_SECTIONS).length + ' sections. Every one has perks at ' +
    MOD_LADDER.join(', ') + ', and every one that has milestones grants titles at ' +
    MOD_TITLE_RUNGS.join(', ') + '. Levels and ticks below are yours.</p>';

  Object.keys(MOD_SECTIONS).forEach(function (sec) {
    var list = bySection[sec];
    if (!list || !list.length) return;
    var parentKey = MOD_PARENT_KEY[sec];
    var g = '';
    if (parentKey && skl[parentKey]) {
      g += '<p class="dim">Parent skill: <b>' +
        MOD_WIKI.safe(skl[parentKey].bname || skl[parentKey].name) +
        '</b> — earns ' + Math.round(MOD_PARENT.feed * 100) +
        '% of what its children earn, and speeds up any child that lags behind it.</p>';
    }
    list.sort(function (a, b) { return skl[a].name < skl[b].name ? -1 : 1; });
    list.forEach(function (k) {
      var s = skl[k];
      var lvl = Number(s.lvl) || 0;
      g += '<div class="wk-e wk-skill">' +
        '<h3>' + MOD_WIKI.safe(s.bname || s.name) +
        (s.bname ? ' <span class="dim">(' + MOD_WIKI.safe(s.name) + ')</span>' : '') +
        '<span class="lv' + (lvl >= cap ? ' capped' : '') + '">lv ' + lvl +
        (lvl >= cap ? ' — at the cap' : '') + '</span></h3>' +
        '<div class="desc">' + MOD_wikiDesc(s.desc) + '</div>';

      var at110 = MOD_wikiEffectAt(k, s, 110);
      if (at110) g += '<div class="proj">At level 110: ' + at110 + '</div>';

      if (s.mlstn && s.mlstn.length) {
        g += '<table class="wk-perks"><tbody>';
        s.mlstn.forEach(function (m) {
          g += '<tr class="' + (m.g === true ? 'done' : '') + '">' +
            '<td class="num">' + m.lv + '</td>' +
            '<td>' + MOD_WIKI.safe(m.p || '—') + '</td>' +
            '<td class="tick">' + (m.g === true ? '&#10003;' : '') + '</td></tr>';
        });
        g += '</tbody></table>';
      }
      g += '</div>';
    });
    h += MOD_wikiGroup(MOD_WIKI.safe(MOD_SECTIONS[sec]), list.length, g, 2);
  });
  return h;
});

/* --- 4. cultivation ------------------------------------------------------- */
MOD_wikiPage('cultivation', 'Cultivation', function () {
  var now = MOD_realm();
  var elig = 0;
  try { elig = MOD_realmEligible().n; } catch (e) {}
  var qic = skl.qic ? skl.qic.lvl : 0;

  var h = '<h1>Cultivation</h1>' +
    '<p class="lede">Ten realms above Mortal. Circulating qi levels the Qi ' +
    'Circulation skill; the skill does not advance the realm. Reaching the level ' +
    'opens a bottleneck, and breaking through it costs a pill and can fail — the ' +
    'pill is spent either way.</p>' +
    '<div class="wk-now"><h3>Where you are</h3><table>' +
    '<tr><td>Realm</td><td>' + MOD_WIKI.safe(now.name) + '</td></tr>' +
    '<tr><td>Qi Circulation</td><td>level ' + qic + '</td></tr>' +
    '<tr><td>Bottleneck open</td><td>' +
      (elig > now.n ? 'yes — ' + MOD_WIKI.safe(MOD_REALMS[now.n + 1].name) +
        ' is within reach' : 'no') + '</td></tr>' +
    '</table></div>' +
    '<p>Realm thresholds are the same levels that earn a title rank, so realm N ' +
    'is the level at which a rank N title arrives. Every realm multiplies all ' +
    'stats and health, and the multipliers do not stack with each other — the ' +
    'realm you are in is the one that applies.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Realm</th><th>Name</th><th>Qi Circ.</th>' +
    '<th>Stats</th><th>Health</th><th>Pill</th></tr></thead><tbody>';

  MOD_REALMS.forEach(function (r) {
    var pill = r.n >= 1 ? item['mod_bp' + r.n] : null;
    h += '<tr class="wk-e' + (r.n <= now.n ? ' done' : '') +
      (r.n === now.n ? ' here' : '') + '">' +
      '<td class="num">' + r.n + '</td>' +
      '<td><b>' + MOD_WIKI.safe(r.name) + '</b><div class="dim flav">' +
        MOD_WIKI.safe(r.desc) + '</div></td>' +
      '<td class="num">' + r.qic + '</td>' +
      '<td class="num">&times;' + r.mult + '</td>' +
      '<td class="num">&times;' + r.hp + '</td>' +
      '<td>' + (pill ? MOD_WIKI.safe(pill.name) : '<span class="dim">—</span>') +
      '</td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>Where the pills come from</h2>' +
    '<p>Every breakthrough pill has a source in normal play. None of them are ' +
    'craftable, and none are cheap — a bottleneck you can buy in bulk is not a ' +
    'bottleneck.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Realms</th><th>Source</th></tr></thead><tbody>' +
    '<tr class="wk-e"><td class="num">1</td><td>The dojo instructor, when qi ' +
      'circulation is first taught</td></tr>' +
    '<tr class="wk-e"><td class="num">2–5</td><td>The Herbalist in the village ' +
      '(<code>vendor.pha1</code>), restocked</td></tr>' +
    '<tr class="wk-e"><td class="num">6–10</td><td>The dojo\'s Level Advancement ' +
      'ladder, and the Pill Tower</td></tr>' +
    '</tbody></table>' +
    '<p class="note">Realm 1 is deliberately <i>not</i> sold at the marketplace: ' +
    'the marketplace is behind a 40%-a-visit chance encounter, and realm 1 opens ' +
    'long before that is reliable.</p>' +

    '<h2>Breaking through</h2>' +
    '<p>The odds improve the further past the threshold you are, and cap short of ' +
    'certain. A failure costs the pill and nothing else.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Levels past the threshold</th>' +
    '<th>Chance</th></tr></thead><tbody>';
  [0, 2, 4, 6, 8].forEach(function (o) {
    h += '<tr><td class="num">+' + o + '</td><td class="num">' +
      Math.round(Math.min(0.55 + o * 0.05, 0.95) * 100) + '%</td></tr>';
  });
  h += '</tbody></table>';
  return h;
});

/* --- 5. elemental mastery ------------------------------------------------- */
MOD_wikiPage('mastery', 'Elemental mastery', function () {
  var h = '<h1>Elemental mastery <span class="tag mod">mod</span></h1>' +
    '<p class="lede">Six masteries, each with a technique that fires on its own ' +
    'during a fight. Combat is automatic and there is no ability picker, so a ' +
    'technique is a chance on each of your swings to become something else — one ' +
    'that scales with INT and the element rather than with your weapon.</p>' +
    '<p>Nothing fires while you are still Mortal: the channels have to be open ' +
    'first. Chance is ' + (MOD_TECH.perLevel * 100).toFixed(1) + '% per mastery ' +
    'level plus ' + (MOD_TECH.perRealm * 100).toFixed(1) + '% per realm, capped at ' +
    Math.round(MOD_TECH.cap * 100) + '%; a technique lands for &times;' +
    MOD_TECH.power + ' of a normal strike.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Mastery</th><th>Technique</th>' +
    '<th>Level</th><th>Chance now</th></tr></thead><tbody>';

  var realm = 0;
  try { realm = MOD_realm().n; } catch (e) {}
  MOD_MASTERY.forEach(function (m) {
    var lvl = Number(m.skill.lvl) || 0;
    var ch = realm < 1 ? 0
      : Math.min(lvl * MOD_TECH.perLevel + realm * MOD_TECH.perRealm, MOD_TECH.cap);
    h += '<tr class="wk-e"><td><b style="color:' + m.colour + '">' +
      MOD_WIKI.safe(m.skill.name) + '</b></td>' +
      '<td style="color:' + m.colour + '">' + MOD_WIKI.safe(m.name) + '</td>' +
      '<td class="num">' + lvl + '</td>' +
      '<td class="num">' + (realm < 1 ? '<span class="dim">Mortal</span>'
                                      : (ch * 100).toFixed(1) + '%') + '</td></tr>';
  });
  h += '</tbody></table>';
  return h;
});

/* --- 6. titles ------------------------------------------------------------ */
MOD_wikiPage('titles', 'Titles', function () {
  var perm = MOD_permanentRank();
  var held = MOD_titleCount();
  var total = 0; for (var kk in ttl) if (ttl[kk] && ttl[kk].name) total++;

  var h = '<h1>Titles</h1>' +
    '<p class="lede">A title\'s rank runs 1 to 10 and is derived from the level ' +
    'that earns it, so a rank is a statement about where in the game you are. ' +
    'Only the title you are wearing applies — until renown makes the lower ranks ' +
    'permanent.</p>' +
    '<div class="wk-now"><h3>Where you are</h3><table>' +
    '<tr><td>Titles held</td><td>' + held + ' of ' + total + '</td></tr>' +
    '<tr><td>Renown level</td><td>' + (skl.rnwn ? skl.rnwn.lvl : 0) +
      ' of ' + MOD_RENOWN_MAX + '</td></tr>' +
    '<tr><td>Ranks that apply without wearing</td><td>' +
      (perm >= 1 ? '1–' + perm : 'none yet') + '</td></tr>' +
    '</table></div>' +

    '<h2>Ranks</h2><table class="wk-tbl"><thead><tr><th>Rank</th>' +
    '<th>Earned from level</th><th>Colour</th></tr></thead><tbody>';
  MOD_RANK_AT.forEach(function (lv, i) {
    var st = MOD_rankStyle(i + 1);
    h += '<tr><td class="num">' + (i + 1) + '</td><td class="num">' + lv + '</td>' +
      '<td><span style="color:' + st.c + ';text-shadow:' + st.s +
      '">' + '&#9679;&#9679;&#9679;' + '</span></td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>Renown</h2>' +
    '<p>Renown is not trained. It counts the titles you hold, and each level ' +
    'multiplies every stat by ' + (1 + MOD_RENOWN_RATE) + ' — compounding, so ' +
    'level ' + MOD_RENOWN_MAX + ' is &times;' +
    (Math.round(MOD_renownMult(MOD_RENOWN_MAX) * 1000) / 1000) + '. At renown N, ' +
    'every title of rank N or below applies permanently.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Renown</th><th>Titles needed</th>' +
    '<th>All stats</th><th>Passive ranks</th></tr></thead><tbody>';
  MOD_RENOWN_STEPS.forEach(function (n, i) {
    h += '<tr class="' + (held >= n ? 'done' : '') + '"><td class="num">' + (i + 1) +
      '</td><td class="num">' + n + '</td><td class="num">&times;' +
      (Math.round(MOD_renownMult(i + 1) * 1000) / 1000) + '</td>' +
      '<td class="num">1–' + (i + 1) + '</td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>Every title</h2>' +
    '<p class="dim">Grouped by the skill that grants it. Titles with no skill of ' +
    'their own come from the story.</p>';

  var groups = {}, loose = [];
  for (var k in ttl) {
    var t = ttl[k];
    if (!t || !t.name) continue;
    var sk = MOD_TITLE_SKILL[k];
    if (sk && skl[sk]) (groups[sk] = groups[sk] || []).push(k); else loose.push(k);
  }
  var order = Object.keys(groups).sort(function (a, b) {
    return skl[a].name < skl[b].name ? -1 : 1;
  });

  var row = function (k) {
    var t = ttl[k];
    var st = MOD_rankStyle(t.rar);
    var gen = null;
    for (var i = 0; i < MOD_SKILL_TITLES.length; i++) {
      if (MOD_SKILL_TITLES[i].key === k) { gen = MOD_SKILL_TITLES[i]; break; }
    }
    return '<div class="wk-e wk-title' + (t.have === true ? ' done' : '') + '">' +
      '<span class="tname" style="color:' + st.c + ';text-shadow:' + st.s + '">' +
      MOD_WIKI.safe(t.name) + '</span>' +
      '<span class="rank">rank ' + (t.rar || 1) + '</span>' +
      (gen ? '<span class="tag mod">lv ' + gen.rung + ' &middot; +' +
        Math.round(gen.xp * 100) + '% ' + MOD_WIKI.safe(skl[gen.skill].name) +
        ' exp</span>' : '') +
      (t.have === true ? '<span class="tag done">held</span>' : '') +
      '<div class="desc dim">' + MOD_wikiDesc(t.desc) + '</div></div>';
  };

  var byRank = function (a, b) { return (ttl[a].rar || 1) - (ttl[b].rar || 1); };
  order.forEach(function (sk) {
    groups[sk].sort(byRank);
    h += MOD_wikiGroup(MOD_WIKI.safe(skl[sk].bname || skl[sk].name),
      groups[sk].length, groups[sk].map(row).join(''), 3);
  });
  if (loose.length) {
    loose.sort(byRank);
    /* The story titles are the one group with no skill to divide them, and
       there are enough of them to need dividing. Rank rather than the alphabet:
       it is the axis they are already sorted on, and the one a reader cares
       about — a rank is a statement about where in the game a title comes from. */
    var inner;
    if (loose.length <= MOD_WIKI_ALPHA_AT) {
      inner = loose.map(row).join('');
    } else {
      var byRankNo = {};
      loose.forEach(function (k) {
        var r = Math.min(Math.max(Number(ttl[k].rar) || 1, 1), 10);
        (byRankNo[r] = byRankNo[r] || []).push(k);
      });
      inner = '';
      Object.keys(byRankNo).sort(function (a, b) { return a - b; }).forEach(function (r) {
        var st = MOD_rankStyle(r);
        inner += MOD_wikiGroup('<span style="color:' + st.c + ';text-shadow:' +
          st.s + '">Rank ' + r + '</span>', byRankNo[r].length,
          byRankNo[r].map(row).join(''), 4);
      });
    }
    h += MOD_wikiGroup('From the story', loose.length, inner, 3);
  }
  return h;
});

/* --- 7. areas ------------------------------------------------------------- */
MOD_wikiPage('areas', 'Areas & enemies', function () {
  var h = '<h1>Areas &amp; enemies</h1>' +
    '<p class="lede">Every area, what lives in it and at what levels, and what it ' +
    'drops. Enemy strength is not read off these levels — see the note below the ' +
    'table.</p>';

  /* Two of the game's 21 areas are not places and listing them misleads:
       nwh  "Somewhere" — where global.current_z parks whenever you are NOT in
             a fight, populated by creature.default ("Nothing").
       tst  "Test" — reached only from chss.tst, which has id -1 and is in no
             sector, so nothing in the game can travel there.
     The test for "is this a place" is whether you can get to it, and neither
     can be. Everything else is listed whether or not you have been. */
  var MOD_WIKI_NOT_PLACES = { nwh: 1, tst: 1 };

  var keys = [];
  for (var k in area) {
    if (area[k] && area[k].pop && !MOD_WIKI_NOT_PLACES[k]) keys.push(k);
  }
  /* Ordered by the middle of the level band, which is the closest thing the
     game has to a difficulty order. */
  keys.sort(function (a, b) {
    var mid = function (z) {
      if (!z.pop.length) return 0;
      var s = 0; z.pop.forEach(function (e) { s += (e.lvlmin + e.lvlmax) / 2; });
      return s / z.pop.length;
    };
    return mid(area[a]) - mid(area[b]);
  });

  keys.forEach(function (k) {
    var z = area[k];
    /* An area whose baked bands are not finite can never spawn anything — see
       the note rendered under its table. Derived rather than listed by name, so
       it stays true if the game changes. */
    var broken = !z.popc || z.popc.length !== z.pop.length ||
      z.popc.some(function (band) { return !band || !isFinite(band[1] - band[0]); });
    h += '<div class="wk-e wk-area"><h3>' + MOD_WIKI.safe(z.name) +
      ' <span class="dim">' + k + '</span>' +
      (broken ? '<span class="tag warn">nothing spawns</span>' : '') +
      '<span class="lv">' + (z.size === -1 ? 'endless' : z.size + ' to clear') +
      '</span></h3>';
    if (z.pop.length) {
      /* The spawn share is NOT pop[i].c. z_bake normalises those weights into
         area.popc — a list of [lo,hi] bands that mon_gen rolls a uniform
         random against — and the weights do not have to sum to 1, so they are
         off wherever they don't. The Southern forest's .35/.45/.25 are really
         33/43/24%. Read the bands the game actually rolls against. */
      var bands = z.popc || [];
      h += '<table class="wk-perks wk-pop"><tbody>';
      z.pop.forEach(function (e, i) {
        var c = e.crt || {};
        var band = bands[i];
        var share = band ? band[1] - band[0] : NaN;
        h += '<tr><td>' + MOD_WIKI.safe(c.name || '?') + '</td>' +
          '<td class="num">lv ' + e.lvlmin +
            (e.lvlmax !== e.lvlmin ? '–' + e.lvlmax : '') + '</td>' +
          '<td class="num dim">' + (isFinite(share)
            ? Math.round(share * 100) + '% of spawns'
            : '—') + '</td></tr>';
      });
      h += '</tbody></table>';
      if (broken) {
        h += '<div class="note">Nothing spawns here. The area\'s entries carry ' +
          'no spawn weight, so the table the game rolls against comes out as ' +
          'NaN and no creature can ever match it. A bug in the base game, left ' +
          'as it is — nothing in the game travels to this area either.</div>';
      }
    }
    if (z.drop && z.drop.length) {
      var d = z.drop.map(function (x) {
        return MOD_WIKI.safe((x.item && x.item.name) || '?') +
          ' <span class="dim">' + ((x.c || 0) * 100).toFixed(2) + '%</span>';
      }).join(', ');
      h += '<div class="desc"><b>Drops:</b> ' + d + '</div>';
    }
    h += '</div>';
  });

  h += '<h2>How hard an enemy is</h2>' +
    '<p>Enemies are not fitted to a level. Each spawn is solved against your ' +
    'actual power at the moment it appears, aiming at roughly ' + MOD_ENEMY.kill +
    ' swings to kill it and ' + MOD_ENEMY.die + ' before it kills you, with a ' +
    'guaranteed margin between the two so a fight is never a coin flip. Variety ' +
    'comes from the area\'s level band and each creature\'s own stat weighting, ' +
    'not from difficulty scaling.</p>' +
    '<p>The reason for that: within the first stage alone you go from 1 STR to ' +
    'around 265, so anything anchored to a level is either trivial at the end of ' +
    'a stage or impossible at the start of one.</p>';
  return h;
});

/* --- 8. items -------------------------------------------------------------
   The one place where "list everything" needs help: 321 of the game's 371
   plain items are the same inventory type, so grouping by type alone leaves a
   single group of 321. Anything past MOD_WIKI_ALPHA_AT gets an alphabetical
   sub-split as well — the oldest index pattern there is, and derived rather
   than invented, which a hand-made taxonomy would not be.
   ------------------------------------------------------------------------- */

var MOD_WIKI_ALPHA_AT = 60;

/* The game's own inventory tabs (isort): ALL / WPN / EQP / USE / OTHER. Using
   its categories rather than new ones means a group here is a tab there. */
var MOD_WIKI_STYPE = { 2: 'Weapons', 3: 'Equipment', 4: 'Usable', 5: 'Other' };

function MOD_wikiItemRow(it) {
  var val = it.v !== undefined ? it.v : (it.val !== undefined ? it.val : null);
  return '<div class="wk-e wk-item' + (it.have === true ? ' done' : '') + '">' +
    '<h3>' + MOD_WIKI.safe(it.name) +
    (it.rar > 1 ? '<span class="rank">rarity ' + it.rar + '</span>' : '') +
    (val !== null ? '<span class="lv">' + MOD_wikiNum(val) + ' coin</span>' : '') +
    (it.amount > 0 ? '<span class="tag done">&times;' + it.amount + '</span>' : '') +
    '</h3><div class="desc">' + MOD_wikiDesc(it.desc) + '</div></div>';
}

/* The letter a name files under. Several items are quoted — the master's
   manuals are literally named "Sword Saint Manual" — and filing those under a
   quotation mark is no use to anyone looking for S. */
function MOD_wikiLetter(name) {
  var m = String(name || '').replace(/^[^0-9A-Za-z]+/, '');
  return (m.charAt(0) || '?').toUpperCase();
}

function MOD_wikiByLetter(a, b) {
  var x = MOD_wikiLetter(a.name) + String(a.name || '').toLowerCase();
  var y = MOD_wikiLetter(b.name) + String(b.name || '').toLowerCase();
  return x < y ? -1 : (x > y ? 1 : 0);
}

/* Flat below the threshold, alphabetically sub-grouped above it. Ranges are cut
   from the entries actually present, so they stay even as content is added. */
function MOD_wikiAlpha(entries, render, level) {
  if (entries.length <= MOD_WIKI_ALPHA_AT) return entries.map(render).join('');
  var per = Math.ceil(entries.length / Math.ceil(entries.length / 40));
  var out = '';
  for (var i = 0; i < entries.length; i += per) {
    var chunk = entries.slice(i, i + per);
    var first = MOD_wikiLetter(chunk[0].name);
    var last = MOD_wikiLetter(chunk[chunk.length - 1].name);
    out += MOD_wikiGroup(first === last ? first : first + '–' + last,
      chunk.length, chunk.map(render).join(''), level || 4);
  }
  return out;
}

MOD_wikiPage('items', 'Items', function () {
  var h = '<h1>Items</h1>' +
    '<p class="lede">Everything the game defines, whether or not you have seen ' +
    'it. Grouped the way your inventory groups it. Values are the base sell ' +
    'price where the game gives one.</p>';

  /* item[] first, split by the inventory tab it appears under. */
  var buckets = {};
  for (var k in item) {
    var it = item[k];
    if (!it || !it.name || it.name === 'dummy') continue;
    var lab = MOD_WIKI_STYPE[it.stype] || 'Uncategorised';
    (buckets[lab] = buckets[lab] || []).push(it);
  }
  ['Usable', 'Other', 'Weapons', 'Equipment', 'Uncategorised'].forEach(function (lab) {
    var list = buckets[lab];
    if (!list || !list.length) return;
    list.sort(MOD_wikiByLetter);
    h += MOD_wikiGroup(lab, list.length,
      MOD_wikiAlpha(list, MOD_wikiItemRow, 4), 2);
  });

  /* and the equipment objects, which live in their own globals */
  [['Weapons', wpn], ['Armour', eqp], ['Shields', sld], ['Accessories', acc]]
    .forEach(function (g) {
      var list = [];
      for (var kk in g[1]) {
        if (g[1][kk] && g[1][kk].name && g[1][kk].name !== 'dummy') list.push(g[1][kk]);
      }
      if (!list.length) return;
      list.sort(MOD_wikiByLetter);
      h += MOD_wikiGroup(g[0], list.length,
        MOD_wikiAlpha(list, MOD_wikiItemRow, 4), 2);
    });
  return h;
});

/* --- 9. actions ----------------------------------------------------------- */
MOD_wikiPage('actions', 'Actions', function () {
  var unlock = {};
  MOD_ACTION_UNLOCKS.forEach(function (u) {
    if (u.act) unlock[u.act.id] = (skl[u.skill] ? skl[u.skill].name : u.skill) +
      ' level ' + u.lv;
  });
  if (typeof act.mod_qi !== 'undefined') {
    unlock[act.mod_qi.id] = 'clearing the dojo\'s Easiest, Easy and Normal fights';
  }

  var h = '<h1>Actions</h1>' +
    '<p class="lede">What you can be doing. One at a time, and only where the ' +
    'action makes sense — unless "Unrestricted actions" is ticked in settings, ' +
    'which lets several run at once anywhere. Both limits are deliberate; the ' +
    'switch is there because they are not to everyone\'s taste.</p>';

  var keys = [];
  for (var k in act) if (act[k] && act[k].name && act[k].name !== 'dummy') keys.push(k);
  keys.sort(function (a, b) { return act[a].name < act[b].name ? -1 : 1; });

  keys.forEach(function (k) {
    var a = act[k];
    var how = unlock[a.id];
    h += '<div class="wk-e wk-item' + (a.have === true ? ' done' : '') + '">' +
      '<h3>' + MOD_WIKI.safe(a.name) +
      (a.have === true ? '<span class="tag done">unlocked</span>'
                       : '<span class="tag">locked</span>') +
      (how ? '<span class="tag mod">from ' + MOD_WIKI.safe(how) + '</span>' : '') +
      '</h3><div class="desc">' + MOD_wikiDesc(a.desc) + '</div></div>';
  });
  return h;
});

/* --- 10. the dojo --------------------------------------------------------- */
MOD_wikiPage('dojo', 'The dojo', function () {
  var h = '<h1>The dojo</h1>' +
    '<p class="lede">The instructor promises a reward every five levels. The base ' +
    'game stops delivering at 30; the mod carries the same ladder to 110, on the ' +
    'same terms.</p>' +
    '<p>Only the lowest rung you have not claimed is offered, which is how the ' +
    'first six behave. Rewards are sized against the character experience curve ' +
    '(4&times;level<sup>3</sup> + level<sup>2</sup>) — a level at 110 costs 5.3 ' +
    'million, which is why the base game\'s best pill is worth 0.3% of one there.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Level</th><th>Reward</th><th>Coin</th>' +
    '<th>Also</th><th></th></tr></thead><tbody>';

  MOD_DOJO_RUNGS.forEach(function (r) {
    var pill = item[r.pill];
    var extra = [];
    if (r.realmPill) extra.push('breakthrough pill for realm ' + r.realmPill);
    if (r.manual) extra.push('a choice of master\'s manual');
    h += '<tr class="wk-e' + (global.flags[r.flag] ? ' done' : '') + '">' +
      '<td class="num">' + r.lv + '</td>' +
      '<td>' + (pill ? MOD_WIKI.safe(pill.name) + ' &times;' + r.n
                     : '<span class="dim">—</span>') + '</td>' +
      '<td class="num">' + MOD_wikiNum(r.coin) + '</td>' +
      '<td class="dim">' + (extra.join(', ') || '—') + '</td>' +
      '<td>' + (global.flags[r.flag] ? '<span class="tag done">claimed</span>' : '') +
      '</td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>Spirit pills</h2>' +
    '<p>Character experience in a bottle. The four the mod adds continue the ' +
    'game\'s own series up to the new curve.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Pill</th><th>Experience</th>' +
    '</tr></thead><tbody>';
  MOD_PILLS.forEach(function (p) {
    h += '<tr class="wk-e"><td>' + MOD_WIKI.safe(p[2]) + '</td><td class="num">' +
      p[3].toLocaleString() + '</td></tr>';
  });
  h += '</tbody></table>' +

    '<h2>Master\'s manuals</h2>' +
    '<p>A third grade of skillbook, offered at levels 50, 75 and 100 as a choice ' +
    'the same way the first one was. Each is worth +' +
    Math.round(MOD_MANUAL_RATE * 100) + '% experience in its skill, permanently.</p>' +
    '<table class="wk-tbl"><thead><tr><th>Manual</th><th>Skill</th>' +
    '</tr></thead><tbody>';
  MOD_MANUALS.forEach(function (m) {
    h += '<tr class="wk-e"><td>' + MOD_WIKI.safe(m[2]) + '</td><td>' +
      MOD_WIKI.safe(skl[m[0]] ? (skl[m[0]].bname || skl[m[0]].name) : m[0]) +
      '</td></tr>';
  });
  h += '</tbody></table>';
  return h;
});

/* --- 11. mechanics -------------------------------------------------------- */
MOD_wikiPage('mechanics', 'Mechanics', function () {
  return '<h1>Mechanics</h1>' +

    '<h2>Damage is subtractive, in both directions</h2>' +
    '<p>A hit does the attacker\'s strength minus the defender\'s strength, plus ' +
    'the weapon, plus one, before criticals. A defender\'s STR <i>is</i> their ' +
    'armour — there is no separate armour stat doing that job.</p>' +
    '<p>Two consequences worth carrying around:</p>' +
    '<ul>' +
    '<li><b>Damage does not taper, it stops.</b> Once a defender\'s STR passes ' +
    'yours, your hits do not get small; they land for nothing. Progress against ' +
    'something too strong is not slow, it is zero.</li>' +
    '<li><b>A stat ratio tells you nothing.</b> Comparing your HP to an enemy\'s ' +
    'strength ignores the subtraction entirely and reads several times off in ' +
    'either direction.</li>' +
    '</ul>' +
    '<p class="note">This is also the reason enemies are never scaled by raising ' +
    'their strength: it would raise their offence and their armour together, and ' +
    'the second effect arrives first.</p>' +

    '<h2>Criticals carry the late game</h2>' +
    '<p>Critical rate reaches about a third at the top of the ladder and a ' +
    'critical is roughly eight times a normal swing, so around three quarters of ' +
    'all damage done at that point is critical damage. Anything that raises ' +
    'critical rate or critical damage is worth more than it looks; Sharp Eye and ' +
    'War are the two that do.</p>' +

    '<h2>Hit chance</h2>' +
    '<p>Landing a hit is a contest of agility. It is a ratio rather than a ' +
    'subtraction, so agility behaves more gently than strength does — falling ' +
    'behind on it costs you accuracy, not everything.</p>' +

    '<h2>Skill sections and parents</h2>' +
    '<p>Each of the ' + Object.keys(MOD_SECTIONS).length + ' sections has a parent ' +
    'skill. A parent earns ' + Math.round(MOD_PARENT.feed * 100) + '% of everything ' +
    'its children earn and grants no stats of its own. In return, a child below ' +
    'the parent\'s level trains ' + Math.round(MOD_PARENT.perLevel * 100) +
    '% faster per level of lag, up to ' + MOD_PARENT.maxGap + ' levels behind. ' +
    'Bringing one section up makes every skill in it cheaper to catch up.</p>' +

    '<h2>Saving</h2>' +
    '<p>Three slots, switched from the bottom bar. The game builds its world once ' +
    'at startup and cannot unload a save, so switching slots or starting a new ' +
    'game reloads the page. Exporting a save before running anything unusual is ' +
    'always the safe move.</p>';
});

/* --- the document ---------------------------------------------------------
   One string, no fetches, no dependencies: this has to work from file:// as
   readily as from a server.
   ------------------------------------------------------------------------- */

function MOD_wikiCss() {
  return [
    ':root{color-scheme:dark}',
    '*{box-sizing:border-box}',
    'body{margin:0;background:#060a1c;color:#dfe6f5;font:14px/1.6 "MS Gothic",' +
      '"MS Mincho",monospace;display:flex;min-height:100vh}',
    'a{color:#7cb0ff}',
    'nav{width:210px;flex:0 0 210px;background:#081040;border-right:1px solid #46a;' +
      'position:sticky;top:0;height:100vh;overflow:auto;padding:14px 0}',
    'nav h2{font-size:13px;color:#9fb4d8;margin:0 0 10px 14px;letter-spacing:1px}',
    'nav a{display:block;padding:6px 14px;text-decoration:none;color:#cfe0ff;' +
      'border-left:3px solid transparent}',
    'nav a:hover{background:#154080}',
    'nav a.on{background:#123070;border-left-color:#7cb0ff;color:#fff}',
    'nav .srch{margin:0 10px 12px;width:calc(100% - 20px);background:#050a20;' +
      'color:#dfe6f5;border:1px solid #46a;padding:5px;font:inherit}',
    'nav .xall{display:block;margin:12px 10px 0;color:#8296b8;font-size:12px;' +
      'cursor:pointer;user-select:none}',
    'nav .xall input{vertical-align:-1px;margin-right:4px}',
    'details.wk-g{border:1px solid #17224a;background:#0a1130;margin:8px 0}',
    'details.wk-g>summary{cursor:pointer;padding:7px 12px;list-style:none;' +
      'background:#0d1740}',
    'details.wk-g>summary:hover{background:#154080}',
    'details.wk-g>summary::-webkit-details-marker{display:none}',
    // a caret drawn rather than borrowed, so it is the same in every browser
    'details.wk-g>summary::before{content:"\\25B8";color:#7cb0ff;' +
      'display:inline-block;width:1em;transition:transform .12s}',
    'details.wk-g[open]>summary::before{transform:rotate(90deg)}',
    'details.wk-g>summary h2,details.wk-g>summary h3{display:inline;margin:0;' +
      'font-size:15px;color:#fff}',
    '.wk-gi{padding:2px 12px 10px}',
    'details.wk-g details.wk-g>summary h4{display:inline;margin:0;font-size:13px;' +
      'color:#cfe0ff;font-weight:normal}',
    'details.wk-g details.wk-g>summary{padding:5px 10px;background:#0b1435}',
    'main{flex:1;min-width:0;padding:22px 30px 80px;max-width:1000px}',
    'h1{font-size:26px;margin:0 0 6px;color:#fff;border-bottom:1px solid #46a;' +
      'padding-bottom:8px}',
    'h2{font-size:19px;color:#bcd4ff;margin:30px 0 8px}',
    'h3{font-size:15px;color:#fff;margin:0 0 4px}',
    'p.lede{color:#a8bcdc;margin:0 0 18px}',
    '.dim{color:#8296b8;font-weight:normal}',
    '.flav{font-size:12px;font-style:italic}',
    '.note{background:#0b1638;border-left:3px solid #46a;padding:8px 12px;' +
      'color:#a8bcdc;margin:14px 0}',
    'code,pre{background:#0b1638;border:1px solid #24356e;padding:1px 5px;' +
      'color:#9fd0ff}',
    'pre{padding:10px;overflow-x:auto}',
    'dl dt{color:#fff;margin-top:14px}',
    'dl dd{margin:2px 0 0 0;color:#a8bcdc}',
    'ul{color:#a8bcdc}',
    'table.wk-tbl{border-collapse:collapse;width:100%;margin:10px 0;' +
      'display:block;overflow-x:auto}',
    'table.wk-tbl th{text-align:left;color:#9fb4d8;font-weight:normal;' +
      'border-bottom:1px solid #46a;padding:5px 9px;white-space:nowrap}',
    'table.wk-tbl td{border-bottom:1px solid #17224a;padding:5px 9px;' +
      'vertical-align:top}',
    'table.wk-tbl tr.done td{color:#cfe0ff}',
    'table.wk-tbl tr.here{background:#123070}',
    '.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.wk-e{border:1px solid #17224a;background:#081040;padding:9px 12px;' +
      'margin:7px 0;border-radius:2px}',
    'tr.wk-e{border:0;background:none}',
    '.wk-e.done{border-color:#2a4a8c}',
    '.wk-e h3{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}',
    '.lv{margin-left:auto;font-size:12px;color:#8296b8;font-weight:normal}',
    '.lv.capped{color:#ffd24a}',
    '.rank{font-size:12px;color:#8296b8;font-weight:normal}',
    '.desc{color:#a8bcdc;font-size:13px}',
    '.proj{color:#ffd24a;font-size:12px;margin-top:3px}',
    '.tag{font-size:11px;border:1px solid #46a;color:#9fb4d8;padding:0 5px;' +
      'border-radius:2px;font-weight:normal}',
    '.tag.mod{border-color:#7a4ea8;color:#c07bff}',
    '.tag.done{border-color:#2e7d4f;color:#6fdc9a}',
    '.tag.here{border-color:#ffd24a;color:#ffd24a}',
    '.tag.warn{border-color:#a8562e;color:#ff9a5c}',
    'table.wk-perks{border-collapse:collapse;margin:6px 0 0;width:100%}',
    'table.wk-perks td{padding:2px 8px 2px 0;font-size:12px;color:#8296b8;' +
      'border-bottom:1px solid #101a3c}',
    'table.wk-perks tr.done td{color:#cfe0ff}',
    'table.wk-perks td.tick{color:#6fdc9a;width:1em;text-align:right}',
    // fixed columns so the level bands line up between one area and the next
    'table.wk-pop{table-layout:fixed}',
    'table.wk-pop td:first-child{width:60%}',
    'table.wk-pop td:nth-child(2){width:20%}',
    '.wk-title .tname{font-weight:bold}',
    '.wk-now{background:#0b1638;border:1px solid #24356e;padding:10px 14px;' +
      'margin:0 0 18px;display:inline-block;min-width:320px}',
    '.wk-now h3{color:#9fb4d8;font-weight:normal;font-size:13px;' +
      'letter-spacing:1px;margin-bottom:6px}',
    '.wk-now td{padding:2px 16px 2px 0}',
    '.wk-now td:last-child{color:#fff;text-align:right}',
    '.pg{display:none}.pg.on{display:block}',
    'footer{color:#5a6c8c;font-size:12px;border-top:1px solid #17224a;' +
      'margin-top:40px;padding-top:12px}',
    '@media(max-width:760px){body{display:block}nav{width:auto;height:auto;' +
      'position:static;flex:none}main{padding:16px}}'
  ].join('\n');
}

/* Filtering, page switching and the hash. Small enough to inline, and inlining
   it is the point — the document has to stand on its own. */
function MOD_wikiJs() {
  return [
    'var pages=[].slice.call(document.querySelectorAll(".pg"));',
    'var links=[].slice.call(document.querySelectorAll("nav a[data-p]"));',
    'function show(id){',
    '  var found=false;',
    '  pages.forEach(function(p){var on=p.id==="pg-"+id;if(on)found=true;',
    '    p.className="pg"+(on?" on":"")});',
    '  if(!found&&pages.length){pages[0].className="pg on";id=pages[0].id.slice(3)}',
    '  links.forEach(function(a){a.className=a.dataset.p===id?"on":""});',
    '  window.scrollTo(0,0);return id;}',
    'links.forEach(function(a){a.addEventListener("click",function(e){',
    '  e.preventDefault();location.hash=a.dataset.p;show(a.dataset.p)})});',
    'window.addEventListener("hashchange",function(){show(location.hash.slice(1))});',
    'show(location.hash.slice(1)||"start");',
    // Search filters entries, hides groups left with none, and OPENS the groups
    // that still have some — a match hidden inside a collapsed group reads as
    // no match at all, which is worse than not having search.
    'var box=document.getElementById("srch");',
    'var xall=document.getElementById("xall");',
    'var groups=[].slice.call(document.querySelectorAll("details.wk-g"));',
    'function filter(){',
    '  var q=box.value.trim().toLowerCase();',
    '  pages.forEach(function(p){',
    '    [].slice.call(p.querySelectorAll(".wk-e")).forEach(function(e){',
    '      e.style.display=(!q||e.textContent.toLowerCase().indexOf(q)>=0)?"":"none"})});',
    '  groups.forEach(function(g){',
    '    var any=[].slice.call(g.querySelectorAll(".wk-e")).some(function(e){',
    '      return e.style.display!=="none"});',
    '    g.style.display=any?"":"none";',
    '    g.open=xall.checked||(!!q&&any)}); }',
    'box.addEventListener("input",filter);',
    'box.addEventListener("keydown",function(e){if(e.key==="Escape"){box.value="";filter()}});',
    // Everything is collapsed by default because three of these pages run past
    // 40,000px open. This is the way back to one long document, which is what
    // the browser's own find needs.
    'xall.addEventListener("change",filter);'
  ].join('\n');
}

function MOD_wikiBuild() {
  var nav = '', body = '';
  MOD_WIKI_PAGES.forEach(function (pg) {
    nav += '<a href="#' + pg.id + '" data-p="' + pg.id + '">' +
      MOD_WIKI.safe(pg.label) + '</a>';
    var inner;
    /* One page throwing must not take the wiki down with it — the page says so
       and the rest still renders. */
    try { inner = pg.build(); }
    catch (e) {
      inner = '<h1>' + MOD_WIKI.safe(pg.label) + '</h1><p class="note">This page ' +
        'could not be built: ' + MOD_WIKI.safe(e.message) + '</p>';
      console.warn('[mod] wiki page "' + pg.id + '" failed: ' + e.message);
    }
    body += '<div class="pg" id="pg-' + pg.id + '">' + inner + '</div>';
  });

  var stamp = new Date().toLocaleString();
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + MOD_WIKI.safe(MOD_WIKI.title) + '</title>' +
    '<style>' + MOD_wikiCss() + '</style></head><body>' +
    '<nav><h2>WIKI</h2>' +
    '<input id="srch" class="srch" type="search" placeholder="search this page" ' +
    'autocomplete="off">' + nav +
    '<label class="xall"><input type="checkbox" id="xall">expand every group</label>' +
    '</nav>' +
    '<main>' + body +
    '<footer>Generated from the running game at ' + MOD_WIKI.safe(stamp) +
    ' — mod ' + MOD_WIKI.safe(MOD.version) + '. Everything here is read from the ' +
    'live data, including your own save, so it cannot fall out of step with the ' +
    'game. The game is truezhangwei\'s; the mod is not endorsed by the author.' +
    '</footer></main>' +
    '<script>' + MOD_wikiJs() + '<\/script></body></html>';
}

/* Returns the HTML either way, so this is testable without a popup. */
function modWiki() {
  var html;
  try { html = MOD_wikiBuild(); }
  catch (e) { console.warn('[mod] wiki failed: ' + e.message); return null; }

  var w = null;
  try { w = window.open('', '_blank'); } catch (e) {}
  if (w && w.document) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      try { w.focus(); } catch (e) {}
    } catch (e) { console.warn('[mod] wiki write failed: ' + e.message); }
  } else {
    /* Blocked. Say so where the player is looking rather than only in the
       console — a button that silently does nothing reads as broken. */
    try { msg('The wiki opens in a new tab — allow pop-ups for this page', 'gold'); }
    catch (e) {}
    console.warn('[mod] wiki: window.open was blocked');
  }
  return html;
}

(function () {
  try {
    var btn = addElement(dom.sl, 'span', null, 'sl');
    btn.innerHTML = 'wiki';
    /* Plain inline with 3px padding, like the game's own — an inline-block here
       grows the fixed bottom bar and it eats the panel above it. */
    btn.style.cssText = 'width:auto;padding:3px;cursor:pointer;';
    btn.title = 'A reference for skills, areas, items, titles and cultivation, ' +
                'built from the running game';
    btn.addEventListener('click', function () { modWiki(); });
    dom.sl.insertBefore(btn, dom.sl_extra);
    console.log('[mod] wiki button added — modWiki() opens it, ' +
      MOD_WIKI_PAGES.length + ' pages');
  } catch (e) {
    console.warn('[mod] wiki button failed: ' + e.message);
  }
})();

/* And in the settings menu, since that is the other place a player looks. */
(function () {
  try {
    var row = addElement(dom.ctrwin4, 'div', null, 'opt_c');
    var lab = addElement(row, 'div', null, 'opt_t');
    lab.innerHTML = 'Game wiki';
    var b = addElement(row, 'div', null, 'opt_v');
    b.innerHTML = '[ open ]';
    b.style.cssText = 'cursor:pointer;text-align:center;';
    b.addEventListener('click', function () { modWiki(); });
    try {
      addDesc(row, null, 2, 'Game wiki',
        'Opens a reference in a new tab: every skill, area, item, title,<br>' +
        'action and realm, generated from the running game.<br>' +
        'It reads your save too, so it shows what you have reached.');
    } catch (e) {}
  } catch (e) {
    console.warn('[mod] wiki settings row failed: ' + e.message);
  }
})();
