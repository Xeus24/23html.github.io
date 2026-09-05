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
  version: '1.0',
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


/* --- Granting the actions --------------------------------------------------
   Loading a save resets every action's `have` to false and rebuilds the list
   from the save (by id). So a save made before this mod existed comes back
   without these actions. A cheap recurring check re-grants any that are
   missing, which covers first run, loading an old save, and starting over.
   giveAction() only fires when have===false, so it won't spam.
   -------------------------------------------------------------------------- */

var MOD_ACTIONS = [act.mod_qi, act.mod_forage, act.mod_calli, act.mod_cond];

function modUnlock() {
  var granted = 0;
  for (var i = 0; i < MOD_ACTIONS.length; i++) {
    var a = MOD_ACTIONS[i];
    if (a && a.have === false) {
      try { giveAction(a); granted++; } catch (e) {
        console.warn('[mod] could not grant "' + a.name + '" yet: ' + e.message);
        return granted;
      }
    }
  }
  return granted;
}

setTimeout(function () {
  modUnlock();
  setInterval(modUnlock, 5000);
}, 2500);


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
    '  modUnlock()     re-grant the four new actions',
    '  modHelp()       this list',
    '',
    '  New skills: Qi Circulation, Foraging, Calligraphy, Conditioning',
    '  New actions: Circulate Qi, Forage, Practice Calligraphy, Endurance Drill',
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
   Sections 3-7 make the player far stronger than vanilla. Measured by setting
   every skill to the same level in both versions:

       every skill at lv 10   STR 2.5x   INT 3.7x   vanilla
       every skill at lv 20   STR 7.0x   INT 12.6x
       every skill at lv 30   STR 22x    INT 51x

   That growth is exponential, because each added skill's percentage applies
   to a value the previous ones already raised. Enemy stats, by contrast, grow
   LINEARLY in lvlup() — randf(t*stat_p, 2*t*stat_p) per level. So a flat
   enemy multiplier would be crushing early and irrelevant later.

   To keep the two curves the same SHAPE, enemy power here is exponential in
   the enemy's own level — base * (1+rate)^lvl — rather than a flat number or
   a live mirror of the player's stats:

       enemy lv 10   ~4.3x     enemy lv 28   ~17x
       enemy lv 20   ~9.3x     enemy lv 40   ~43x

   RETUNED against attainable play. The earlier values were fitted to a scenario
   where every skill sat at the story cap — which the game's own xp curve makes
   impossible. Reaching a skill level costs, from scratch:

       lv 5      716 xp        lv 15    1,151,201 xp
       lv 10  47,986 xp        lv 20   13,647,481 xp

   A passive skill earning ~0.2 xp/tick reaches lv 5 in an hour, lv 9 in fifty
   hours, and lv 14 in a thousand. So skills realistically sit between 10 and 22
   for the whole game, and the cap of 110 is never the binding constraint.

   Fitted to that instead, enemy power was cut hard: the old settings gave
   22.6M HP at enemy lv 60 against a realistic player STR of 4,557 — 4,962 hits
   to kill while dying in one. Tune with setEnemyScale(base, rate).
   =========================================================================== */

var MOD_ENEMY = {
  base: 4,        // flat multiplier at level 1
  rate: 0.02,     // compounding growth per enemy level
  expRate: 0.5,   // exp reward scales as M^expRate, so grinding keeps paying
  areaScale: 1.4, // level-range multiplier applied to existing areas
  hpPow: 1.1,     // enemy HP uses M^hpPow — the player's damage is the runaway
                  // stat, so HP needs far more weight than attack
  tierRate: 0.008 // extra growth per point of the current story cap; without it
                  // enemy level tops out around 60 by area design while player
                  // damage keeps climbing to cap 110, and everything dies in 1 hit
};

function MOD_enemyMult(lvl) {
  var byLevel = Math.pow(1 + MOD_ENEMY.rate, Math.max(Number(lvl) || 1, 1));
  // Story-tier term. This tracks how far you have got, not your live stats —
  // the same progression the skill cap reads.
  var cap = 10;
  try { cap = MOD_levelCap(); } catch (e) { /* section 10 not loaded yet */ }
  var byTier = Math.pow(1 + MOD_ENEMY.tierRate, Math.max(cap - 10, 0));
  return MOD_ENEMY.base * byLevel * byTier;
}

/* Scaling goes through the stat MULTIPLIER fields (strm/aglm/intm/hpm), which
   stat_r() reapplies from the base values every call — so this is idempotent
   and cannot accumulate if lvlup runs more than once on the same creature.
   No creature template in the game overrides those fields (checked), so
   assigning them outright is safe.

   HP needs the multiplier rather than a direct write: lvlup sets a non-player's
   hp straight from hp_r, and stat_r() would then recompute hpmax and leave the
   creature at a fraction of its health. */
function MOD_scaleEnemy(p) {
  if (!p || typeof you === 'undefined') return;
  if (p.id === you.id || p.id === 0) return;      // skip the player and creature.default

  var M = MOD_enemyMult(p.lvl);
  p.strm = M; p.aglm = M; p.intm = M;             // spd deliberately left alone,
  p.hpm = Math.pow(M, MOD_ENEMY.hpPow);           // so turn order stays fair
  p.stat_r();
  p.hp = p.hpmax;                                 // spawn at full health, as lvlup does

  var F = Math.pow(M, MOD_ENEMY.expRate);
  var prevF = p._modExpF || 1;
  p.exp = Math.max(1, Math.round((p.exp / prevF) * F));
  p._modExpF = F;
}

var MOD_lvlup_original = lvlup;

lvlup = function (p, t) {
  MOD_lvlup_original(p, t);
  try { MOD_scaleEnemy(p); } catch (e) { /* never break a spawn */ }
};

function setEnemyScale(base, rate) {
  if (base !== undefined && isFinite(Number(base)) && Number(base) > 0) MOD_ENEMY.base = Number(base);
  if (rate !== undefined && isFinite(Number(rate)) && Number(rate) >= 0) MOD_ENEMY.rate = Number(rate);
  var m = MOD_ENEMY;
  var line = 'Enemy scale: base ' + m.base + ', ' + (m.rate * 100).toFixed(1) + '%/level' +
             '  →  lv10 ' + MOD_enemyMult(10).toFixed(1) + 'x' +
             ', lv20 ' + MOD_enemyMult(20).toFixed(1) + 'x' +
             ', lv40 ' + MOD_enemyMult(40).toFixed(1) + 'x';
  console.log('[mod] ' + line);
  if (typeof msg === 'function') msg('Enemy scaling updated', 'gold');
  return line;
}

function getEnemyScale() { return { base: MOD_ENEMY.base, rate: MOD_ENEMY.rate }; }


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
  chs('"=> The Ashen Spire"', false, 'orange').addEventListener('click', function () {
    msg('Around level 45-58. Well past the golem arena.', 'orange');
    smove(chss.mod_spire);
  });
  chs('"=> The Long Vigil"', false, 'red').addEventListener('click', function () {
    msg('Around level 55-68. This will kill an unprepared character.', 'red');
    smove(chss.mod_vigil);
  });
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
    chs('"=> Follow the old path deeper"', false, 'yellow').addEventListener('click', function () {
      smove(chss.mod_gate);
    });
  };
})();


function modBalance() {
  var rows = [
    'Enemy scaling: base ' + MOD_ENEMY.base + ', ' + (MOD_ENEMY.rate * 100).toFixed(1) + '% per enemy level',
    '  lv 10  ' + MOD_enemyMult(10).toFixed(1) + 'x      lv 40  ' + MOD_enemyMult(40).toFixed(1) + 'x',
    '  lv 20  ' + MOD_enemyMult(20).toFixed(1) + 'x      lv 60  ' + MOD_enemyMult(60).toFixed(1) + 'x',
    '  lv 30  ' + MOD_enemyMult(30).toFixed(1) + 'x      lv 90  ' + MOD_enemyMult(90).toFixed(1) + 'x',
    '',
    'Existing area level ranges raised x' + MOD_ENEMY.areaScale + ' (tutorial exempt)',
    'New areas: The Sunken Hollow (30-40), The Ashen Spire (45-58), The Long Vigil (55-68)',
    'Reach them from the Western Woods gate: "Follow the old path deeper"',
    '',
    'Tune: setEnemyScale(base, rate)   e.g. setEnemyScale(1.5, 0.06) for an easier ride'
  ].join('\n');
  console.log(rows);
  return rows;
}

console.log('[mod] enemy scaling active — ' + MOD_enemyMult(20).toFixed(1) + 'x at enemy lv 20. modBalance() for details.');


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
   100 more, all discovered by playing — same machinery as section 7, reading
   the game's own `global.stat.*` counters and environment state. All 44 of
   those counters were checked to be incremented somewhere in the game.

   Their continuous effects are summed per stat and applied ONCE, additively.
   The 13 skills from sections 4 and 7 each multiply in sequence, which is what
   produced the runaway curve; doing that with 100 skills would be absurd
   (100 skills at +15% compounding is ~1.2 million x). Per-level rates are also
   normalised per stat, so a stat carried by 6 skills is not six times weaker
   than one carried by 46.
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
var MOD_TIERS = [
  { cap: 10,  name: 'The beginning',      flags: [] },
  { cap: 15,  name: 'Training complete',  flags: ['tr3_win', 'trnex1', 'trnex2'] },
  { cap: 20,  name: 'The forest',         flags: ['mod_t_forest'] },
  { cap: 30,  name: 'Deep forest',        flags: ['mod_t_deep', 'frstn1a3u'] },
  { cap: 40,  name: 'The catacombs',      flags: ['mod_t_cata'] },
  { cap: 50,  name: 'Golem arena I-II',   flags: ['trne1e1', 'trne2e1'] },
  { cap: 60,  name: 'Golem arena III-IV', flags: ['trne3e1', 'trne4e1'] },
  // The endgame areas are NOT unlocked by walking in. Clicking through to The
  // Long Vigil once granted cap 110 outright, which is absurd for a place that
  // kills an unprepared character on arrival. Each now needs kills earned
  // there, and each needs the one before it, so the order cannot be skipped.
  { cap: 75,  name: 'The Sunken Hollow',  flags: [],
    needText: MOD_REQ_HOLLOW + ' kills in The Sunken Hollow',
    test: function () {
      return MOD_prog('hollow') >= MOD_REQ_HOLLOW
        ? MOD_prog('hollow') + '/' + MOD_REQ_HOLLOW + ' kills in The Sunken Hollow' : null;
    } },
  { cap: 90,  name: 'The Ashen Spire',    flags: [],
    needText: MOD_REQ_SPIRE + ' kills in The Ashen Spire (after the Hollow)',
    test: function () {
      return (MOD_prog('hollow') >= MOD_REQ_HOLLOW && MOD_prog('spire') >= MOD_REQ_SPIRE)
        ? MOD_prog('spire') + '/' + MOD_REQ_SPIRE + ' kills in The Ashen Spire' : null;
    } },
  { cap: 110, name: 'The Long Vigil',     flags: [],
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

var MOD_CAP = { current: 10, name: 'The beginning', why: '(start)', warned: {}, lastAnnounced: 0 };

function MOD_levelCap() {
  var cap = MOD_TIERS[0].cap, name = MOD_TIERS[0].name, why = '(start)';
  for (var i = 0; i < MOD_TIERS.length; i++) {
    try {
      var f = MOD_tierFlag(MOD_TIERS[i]);
      if (f && MOD_TIERS[i].cap > cap) { cap = MOD_TIERS[i].cap; name = MOD_TIERS[i].name; why = f; }
    } catch (e) { /* a missing flag is just a tier not reached */ }
  }
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

/* --- the 100 skills ------------------------------------------------------- */

var MOD_EXTRA = [
  {key:'kllr', id:1001, type:1, name:"Killing Intent", desc:"Practice at ending fights quickly", note:"Sharpens the finishing blow", stat:'str', pct:0.22, counter:'akills', xp:1.2, cap:6},
  {key:'exct', id:1002, type:1, name:"Execution", desc:"Bringing something down in a single strike", note:"Rewards decisive openings", stat:'str', pct:0.22, counter:'onesht', xp:6, cap:3},
  {key:'atrt', id:1003, type:1, name:"Attrition", desc:"Damage traded over long fights", note:"Strength that comes from grinding it out", stat:'str', pct:0.176, counter:'dmgdt', xp:0.05, cap:60},
  {key:'whff', id:1004, type:1, name:"Whiffing", desc:"Swings that met nothing at all", note:"Even a miss teaches the arm something", stat:'str', pct:0.132, counter:'misst', xp:1.5, cap:6},
  {key:'thrw', id:1005, type:1, name:"Throwing Arm", desc:"Objects sent at things that deserved it", note:"Power behind a thrown weapon", stat:'str', pct:0.198, counter:'thrt', xp:2, cap:6},
  {key:'indr', id:1006, type:3, name:"Indirect Means", desc:"Kills that were not landed by hand", note:"Letting circumstance do the work", stat:'str', pct:0.198, counter:'indkill', xp:3, cap:4},
  {key:'bldl', id:1007, type:6, name:"Bloodletting", desc:"Wounds that kept on bleeding", note:"Familiarity with open wounds", stat:'str', pct:0.176, counter:'bloodt', xp:0.6, cap:10},
  {key:'brsr', id:1008, type:2, name:"Berserking", desc:"Fighting on while badly hurt", note:"Strength found past the point of sense", stat:'str', pct:0.22, pred:'lowHp', xp:0.16},
  {key:'stnd', id:1009, type:2, name:"Last Stand", desc:"Still upright when you should not be", note:"Refusal, made into a habit", stat:'str', pct:0.22, pred:'lowHpBattle', xp:0.25},
  {key:'mmnt', id:1010, type:1, name:"Momentum", desc:"Strikes that followed one another", note:"Chained aggression", stat:'str', pct:0.176, pred:'inBattle', xp:0.08},
  {key:'grip', id:1011, type:2, name:"Grip Strength", desc:"Holding on when it would be easier not to", note:"Hands that do not let go", stat:'str', pct:0.198, counter:'athme', xp:0.05, cap:40},
  {key:'hvyl', id:1012, type:8, name:"Heavy Labour", desc:"Work that asked for the whole body", note:"Raw physical output", stat:'str', pct:0.198, counter:'athmec', xp:0.05, cap:40},
  {key:'mrtl', id:1013, type:2, name:"Mortality", desc:"Understanding gained the hardest way", note:"What dying teaches, if you come back", stat:'str', pct:0.264, counter:'deadt', xp:25, cap:2},
  {key:'clse', id:1014, type:2, name:"Close Calls", desc:"Fights survived by a margin", note:"Nerve under a real threat", stat:'str', pct:0.22, counter:'die_p', xp:12, cap:3},
  {key:'frst', id:1015, type:6, name:"Frostbitten", desc:"Time spent too cold for comfort", note:"Tolerance built in the cold", stat:'str', pct:0.154, counter:'coldnt', xp:0.5, cap:10},
  {key:'shvr', id:1016, type:6, name:"Shivering", desc:"Enduring genuinely cold weather", note:"The body learns to hold its heat", stat:'str', pct:0.132, pred:'cold', xp:0.12},
  {key:'sokd', id:1017, type:6, name:"Soaked", desc:"Being thoroughly wet and carrying on", note:"Discomfort stopped registering", stat:'str', pct:0.132, pred:'wet', xp:0.12},
  {key:'hngr', id:1018, type:4, name:"Hunger Pangs", desc:"Acting on an empty stomach", note:"Function without fuel", stat:'str', pct:0.176, pred:'starving', xp:0.2},
  {key:'rtns', id:1019, type:4, name:"Rationing", desc:"Operating on very little energy", note:"Economy of effort", stat:'str', pct:0.154, pred:'lowEnergy', xp:0.12},
  {key:'rcvr', id:1020, type:2, name:"Recovery", desc:"Returning to full health again and again", note:"The body gets better at mending", stat:'str', pct:0.176, pred:'healthy', xp:0.06},
  {key:'wtch', id:1021, type:4, name:"Keeping Watch", desc:"Staying alert when nothing happens", note:"Patience with an edge on it", stat:'str', pct:0.132, pred:'peaceful', xp:0.05},
  {key:'endr', id:1022, type:2, name:"Endurance", desc:"Sheer accumulated time on your feet", note:"Stamina that only time builds", stat:'str', pct:0.132, pred:'awake', xp:0.04},
  {key:'rnwk', id:1023, type:4, name:"Rainwalking", desc:"Moving well on wet ground", note:"Footing in the rain", stat:'agl', pct:0.176, pred:'rain', xp:0.12},
  {key:'snwk', id:1024, type:4, name:"Snowtreading", desc:"Moving well through snow", note:"Footing in snow", stat:'agl', pct:0.176, pred:'snow', xp:0.12},
  {key:'stmw', id:1025, type:4, name:"Storm Sense", desc:"Being out in genuinely bad weather", note:"Reading a sky that means it", stat:'int', pct:0.198, pred:'storm', xp:0.18},
  {key:'fgnv', id:1026, type:3, name:"Fog Navigation", desc:"Finding your way with nothing to see by", note:"Orientation without landmarks", stat:'int', pct:0.198, pred:'fog', xp:0.16},
  {key:'sncl', id:1027, type:4, name:"Sun Discipline", desc:"Long hours under an open sky", note:"Working through the heat", stat:'str', pct:0.132, pred:'clearDay', xp:0.08},
  {key:'nsky', id:1028, type:4, name:"Night Sky", desc:"Hours spent under stars", note:"Orientation by what is above", stat:'int', pct:0.176, pred:'clearNight', xp:0.12},
  {key:'sprg', id:1029, type:7, name:"Spring Sense", desc:"A full season of new growth", note:"Attunement to spring", stat:'int', pct:0.154, pred:'spring', xp:0.06},
  {key:'smmr', id:1030, type:7, name:"Summer Sense", desc:"A full season of long light", note:"Attunement to summer", stat:'str', pct:0.154, pred:'summer', xp:0.06},
  {key:'atmn', id:1031, type:7, name:"Autumn Sense", desc:"A full season of turning leaves", note:"Attunement to autumn", stat:'agl', pct:0.154, pred:'autumn', xp:0.06},
  {key:'wntr', id:1032, type:7, name:"Winter Sense", desc:"A full season of hard ground", note:"Attunement to winter", stat:'int', pct:0.154, pred:'winter', xp:0.06},
  {key:'wthl', id:1033, type:4, name:"Weatherlore", desc:"Watching the sky change over time", note:"Prediction from long observation", stat:'int', pct:0.154, pred:'outdoors', xp:0.04},
  {key:'exps', id:1034, type:6, name:"Exposure", desc:"Time outdoors in anything at all", note:"Weathered, in the literal sense", stat:'str', pct:0.132, pred:'outdoorsRough', xp:0.1},
  {key:'nwmn', id:1035, type:7, name:"New Moon", desc:"The dark of the month", note:"Something clarifies when the moon is gone", stat:'int', pct:0.22, pred:'newmoon', xp:0.3},
  {key:'wxmn', id:1036, type:7, name:"Waxing Moon", desc:"The moon on its way up", note:"Rising tides of whatever this is", stat:'int', pct:0.176, pred:'waxing', xp:0.16},
  {key:'wnmn', id:1037, type:7, name:"Waning Moon", desc:"The moon on its way down", note:"Letting go, on a schedule", stat:'int', pct:0.176, pred:'waning', xp:0.16},
  {key:'dwnr', id:1038, type:4, name:"Dawn Rising", desc:"Being awake as light returns", note:"The hour before everyone else", stat:'int', pct:0.198, pred:'dawn', xp:0.28},
  {key:'dusk', id:1039, type:4, name:"Duskfall", desc:"Being out as the light goes", note:"The hour after everyone else", stat:'agl', pct:0.198, pred:'dusk', xp:0.28},
  {key:'vgil', id:1040, type:4, name:"Vigil", desc:"Staying awake through the night", note:"Sleep deliberately not taken", stat:'int', pct:0.198, pred:'deepNight', xp:0.2},
  {key:'rest', id:1041, type:4, name:"Deep Rest", desc:"Sleep, accumulated", note:"Restoration as a practice", stat:'int', pct:0.132, counter:'timeslp', xp:0.03, cap:40},
  {key:'clck', id:1042, type:4, name:"Body Clock", desc:"A sense of how much time has passed", note:"Time, tracked without a clock", stat:'int', pct:0.11, counter:'tick', xp:0.006, cap:3},
  {key:'smsn', id:1043, type:4, name:"Seasoned", desc:"Living through the turning year", note:"Perspective that needs a full cycle", stat:'int', pct:0.132, pred:'anySeason', xp:0.03},
  {key:'mkng', id:1044, type:5, name:"Making", desc:"Things brought into being by hand", note:"Fluency with tools", stat:'int', pct:0.198, counter:'crftt', xp:2, cap:6},
  {key:'brew', id:1045, type:5, name:"Brewing", desc:"Potions prepared and handled", note:"Familiarity with volatile things", stat:'int', pct:0.198, counter:'potnst', xp:2.5, cap:6},
  {key:'hggl', id:1046, type:3, name:"Haggling", desc:"Prices argued down", note:"Reading what a thing is worth", stat:'int', pct:0.198, counter:'buyt', xp:1.5, cap:8},
  {key:'thft', id:1047, type:3, name:"Sleight", desc:"Value that moved quietly", note:"Quick hands around goods", stat:'agl', pct:0.198, counter:'shppnt', xp:1.5, cap:8},
  {key:'acct', id:1048, type:3, name:"Accounting", desc:"Money coming in", note:"Keeping track of what you have", stat:'int', pct:0.132, counter:'moneyg', xp:0.02, cap:60},
  {key:'spnd', id:1049, type:3, name:"Spending", desc:"Money going out", note:"Knowing what parting with it costs", stat:'int', pct:0.132, counter:'moneysp', xp:0.02, cap:60},
  {key:'invt', id:1050, type:9, name:"Inventory", desc:"Sorting and handling what you carry", note:"Order imposed on a full pack", stat:'int', pct:0.154, counter:'ivtntdj', xp:1, cap:8},
  {key:'slvg', id:1051, type:9, name:"Salvage", desc:"Taking things apart for parts", note:"Seeing components instead of objects", stat:'int', pct:0.198, counter:'dsst', xp:2, cap:6},
  {key:'uphl', id:1052, type:9, name:"Upkeep", desc:"Maintaining what you own", note:"Nothing breaks that you look after", stat:'int', pct:0.154, counter:'pts', xp:0.4, cap:10},
  {key:'prov', id:1053, type:5, name:"Provisioning", desc:"Stockpiling what you will need", note:"Forethought about supplies", stat:'int', pct:0.154, counter:'gsvs', xp:1.5, cap:6},
  {key:'lgts', id:1054, type:9, name:"Lightkeeping", desc:"Keeping a light going", note:"Small vigilances that add up", stat:'int', pct:0.132, counter:'lgtstk', xp:1, cap:8},
  {key:'jrny', id:1055, type:3, name:"Journeywork", desc:"Work done for other people", note:"Competence that others rely on", stat:'int', pct:0.176, counter:'jcom', xp:3, cap:4},
  {key:'stdy', id:1056, type:4, name:"Study", desc:"Books worked through to the end", note:"Sustained attention on a page", stat:'int', pct:0.22, counter:'rdttl', xp:4, cap:4},
  {key:'pgtn', id:1057, type:4, name:"Page Turning", desc:"Raw hours spent reading", note:"Reading speed built by volume", stat:'int', pct:0.132, counter:'rdgtttl', xp:0.05, cap:40},
  {key:'exmn', id:1058, type:4, name:"Examination", desc:"Things looked at properly", note:"Detail noticed on purpose", stat:'int', pct:0.132, counter:'dsct', xp:0.4, cap:12},
  {key:'bstl', id:1059, type:3, name:"Bestiary Lore", desc:"Creatures catalogued", note:"Knowing what you are looking at", stat:'int', pct:0.198, counter:'cat_c', xp:2.5, cap:6},
  {key:'qstl', id:1060, type:4, name:"Questing", desc:"Undertakings seen through", note:"Follow-through as a discipline", stat:'int', pct:0.242, counter:'qstc', xp:8, cap:3},
  {key:'cntm', id:1061, type:4, name:"Contemplation", desc:"Time spent deliberately still", note:"Thought without a task attached", stat:'int', pct:0.176, counter:'medst', xp:0.4, cap:12},
  {key:'nmrc', id:1062, type:4, name:"Reckoning", desc:"Experience accumulated overall", note:"A sense of your own progress", stat:'int', pct:0.11, counter:'exptotl', xp:0.008, cap:80},
  {key:'brdt', id:1063, type:4, name:"Breadth", desc:"Skills raised across the board", note:"Range rather than depth", stat:'int', pct:0.176, counter:'slvs', xp:1.5, cap:6},
  {key:'rcll', id:1064, type:4, name:"Recall", desc:"Holding many things in mind", note:"Memory under load", stat:'int', pct:0.154, pred:'peaceful', xp:0.04},
  {key:'insh', id:1065, type:4, name:"Insight", desc:"Understanding arriving unbidden", note:"The pieces landing at once", stat:'int', pct:0.176, pred:'indoorsCalm', xp:0.08},
  {key:'apet', id:1066, type:4, name:"Appetite", desc:"Meals eaten, in quantity", note:"A body that takes on fuel well", stat:'str', pct:0.154, counter:'foodt', xp:1.2, cap:8},
  {key:'plte', id:1067, type:4, name:"Palate", desc:"Variety in what you have eaten", note:"Discrimination built by tasting", stat:'int', pct:0.154, counter:'fooda', xp:0.06, cap:40},
  {key:'gutt', id:1068, type:6, name:"Constitution", desc:"Handling food that fought back", note:"A stomach that forgives", stat:'str', pct:0.176, counter:'foodb', xp:1, cap:8},
  {key:'curi2', id:1069, type:4, name:"Tasting", desc:"Willingness to try the unfamiliar", note:"Nerve at the table", stat:'int', pct:0.176, counter:'ftried', xp:3, cap:4},
  {key:'temp', id:1070, type:4, name:"Temperance", desc:"Eating without overdoing it", note:"Restraint around plenty", stat:'int', pct:0.154, counter:'foodal', xp:0.8, cap:10},
  {key:'sate', id:1071, type:4, name:"Satiety", desc:"Operating comfortably fed", note:"Steady output on a full stomach", stat:'str', pct:0.132, pred:'fullEnergy', xp:0.06},
  {key:'brth2', id:1072, type:4, name:"Breathing", desc:"Deliberate control of the breath", note:"The base every other practice sits on", stat:'int', pct:0.176, pred:'peaceful', xp:0.05},
  {key:'post', id:1073, type:2, name:"Posture", desc:"Holding yourself well for hours", note:"Alignment that stops costing effort", stat:'agl', pct:0.154, pred:'awake', xp:0.04},
  {key:'cnda', id:1074, type:6, name:"Acclimation", desc:"Adjusting to wherever you are", note:"The body stops complaining", stat:'str', pct:0.132, pred:'outdoors', xp:0.05},
  {key:'hyst', id:1075, type:6, name:"Hardiness", desc:"Long exposure to unpleasant conditions", note:"Tolerance, broadly", stat:'str', pct:0.154, pred:'outdoorsRough', xp:0.08},
  {key:'pthf', id:1076, type:3, name:"Pathfinding", desc:"Routes worked out on the ground", note:"Choosing well between two ways", stat:'int', pct:0.198, counter:'smovet', xp:1.5, cap:5},
  {key:'rnge', id:1077, type:3, name:"Ranging", desc:"Ground covered far from home", note:"Comfort at a distance", stat:'spd', pct:0.198, counter:'plst', xp:1.2, cap:8},
  {key:'dlvg', id:1078, type:3, name:"Delving", desc:"Time spent underground", note:"Composure below the surface", stat:'agl', pct:0.198, pred:'indoorsDark', xp:0.14},
  {key:'clmb', id:1079, type:3, name:"Scrambling", desc:"Ground that needed hands as well as feet", note:"Movement over broken terrain", stat:'agl', pct:0.198, pred:'outdoors', xp:0.06},
  {key:'trck', id:1080, type:3, name:"Tracking", desc:"Following what passed before you", note:"Reading sign on the ground", stat:'int', pct:0.176, pred:'outdoorsDay', xp:0.07},
  {key:'stlk', id:1081, type:3, name:"Stalking", desc:"Closing distance without being noticed", note:"Approach as a skill", stat:'agl', pct:0.198, pred:'nightOutdoors', xp:0.1},
  {key:'flgt', id:1082, type:3, name:"Flight", desc:"Getting away when getting away was right", note:"Knowing when not to fight", stat:'spd', pct:0.198, pred:'lowHpBattle', xp:0.15},
  {key:'lngm', id:1083, type:4, name:"Long March", desc:"Distance covered without stopping", note:"Pace that can be held all day", stat:'spd', pct:0.154, pred:'outdoors', xp:0.05},
  {key:'shrt', id:1084, type:3, name:"Shortcuts", desc:"Ways found that others miss", note:"Efficiency of route", stat:'spd', pct:0.176, counter:'smovet', xp:1, cap:5},
  {key:'mppg', id:1085, type:3, name:"Mapping", desc:"Building a picture of where things are", note:"Space held in the head", stat:'int', pct:0.176, counter:'plst', xp:1, cap:8},
  {key:'thrs', id:1086, type:3, name:"Threshold", desc:"Crossing into somewhere new", note:"The moment of entering", stat:'agl', pct:0.176, counter:'smovet', xp:0.8, cap:5},
  {key:'rtne', id:1087, type:4, name:"Routine", desc:"Doing the same thing reliably", note:"Consistency as its own skill", stat:'int', pct:0.132, pred:'anyTime', xp:0.03},
  {key:'foci', id:1088, type:4, name:"Focus", desc:"Attention held on one thing", note:"Not being pulled away", stat:'int', pct:0.176, pred:'busyWork', xp:0.1},
  {key:'advr', id:1089, type:2, name:"Adversity", desc:"Time spent in real difficulty", note:"What hard conditions leave behind", stat:'str', pct:0.176, pred:'anyHardship', xp:0.1},
  {key:'rslv', id:1090, type:2, name:"Resolve", desc:"Continuing after setbacks", note:"Persistence, measured", stat:'str', pct:0.198, counter:'deadt', xp:15, cap:2},
  {key:'nrve', id:1091, type:2, name:"Nerve", desc:"Staying functional under threat", note:"Fear that stopped being decisive", stat:'agl', pct:0.198, pred:'inBattle', xp:0.07},
  {key:'rflx', id:1092, type:3, name:"Reflexes", desc:"Reacting before thinking", note:"Speed of response", stat:'agl', pct:0.22, counter:'dodgt', xp:1.5, cap:5},
  {key:'prcs', id:1093, type:1, name:"Precision", desc:"Doing it exactly right", note:"Accuracy over force", stat:'agl', pct:0.198, counter:'dmgdt', xp:0.04, cap:60},
  {key:'pace', id:1094, type:4, name:"Pacing", desc:"Spending effort at the right rate", note:"Neither rushing nor dawdling", stat:'spd', pct:0.154, pred:'awake', xp:0.04},
  {key:'lgcy', id:1095, type:4, name:"Legacy", desc:"Everything, accumulated", note:"What a long life amounts to", stat:'int', pct:0.154, counter:'exptotl', xp:0.006, cap:80},
  {key:'wsdm', id:1096, type:4, name:"Wisdom", desc:"Judgement built from all of it", note:"The part that cannot be rushed", stat:'int', pct:0.176, counter:'slvs', xp:1.2, cap:6},
  {key:'grit', id:1097, type:2, name:"Grit", desc:"Continuing when it stopped being fun", note:"Plain stubbornness", stat:'str', pct:0.198, pred:'anyHardship', xp:0.08},
  {key:'poys', id:1098, type:3, name:"Poise", desc:"Composure that holds up", note:"Balance under pressure", stat:'agl', pct:0.176, pred:'inBattle', xp:0.06},
  {key:'vitl', id:1099, type:2, name:"Vitality", desc:"General good condition", note:"Baseline health, improved", stat:'str', pct:0.154, pred:'healthy', xp:0.05},
  {key:'alac', id:1100, type:3, name:"Alacrity", desc:"Readiness to move at once", note:"No delay between decision and action", stat:'spd', pct:0.176, pred:'peaceful', xp:0.04},
];

/* Milestones for these 100 are deliberately light. Giving each of them the
   full tier package from MOD_tiers2 — which includes stat MULTIPLIERS — put
   the player at "kill in 1, die in 4271" against every area in the game.
   These grant the skill's own xp rate and a small flat stat instead, so 100
   skills add up to something bounded. */
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
    // migration below.
    { lv: 10, f: function () { you[A] += 1; you.stat_r(); }, g: false, rev2: true, p: L + " +1" },
    { lv: 25, f: function () { you[A] += 3; you.stat_r(); }, g: false, p: L + " +3" },
    { lv: 50, f: function () { you[A] += 6; you.hpa += 25; you.stat_r(); }, g: false, rev2: true,
      p: L + " +6, HP +25" }
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
     3. the 100 additive skills, one application per stat
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
   With 173 skills the flat list is unusable. This adds:
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
  ['apet', 'stra', 'sata', 'STR', 'Max Energy', 'inst'],
  ['pthf', 'inta', 'spda', 'INT', 'SPD', 'wayf2'],
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

       lv    1   2   3   4    5    6    7    8    9   10
       titles 1   3   5   8   13   20   31   48   74  100

   Capped at 10 and exempt from the story level cap — it never passes through
   giveSkExp, its level is derived. Title count is taken from `ttl` rather than
   `global.titles.length`, because load() rebuilds that array and appends
   `titlese` to it, which can double-count.
   ------------------------------------------------------------------------- */

var MOD_RENOWN_STEPS = [1, 3, 5, 8, 13, 20, 31, 48, 74, 100];
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
function modTitles() {
  var held = [], missing = [];
  for (var k in ttl) {
    var t = ttl[k];
    if (!t || !t.name) continue;
    (t.have === true ? held : missing).push({ name: t.name, rar: t.rar || 0 });
  }
  var byRar = function (a, b) { return (b.rar - a.rar) || (a.name < b.name ? -1 : 1); };
  held.sort(byRar); missing.sort(byRar);
  var out = ['Titles: ' + held.length + ' held, ' + missing.length + ' remaining', '',
             'Held: ' + (held.map(function (t) { return t.name; }).join(', ') || '(none)'), '',
             'Missing: ' + (missing.map(function (t) { return t.name; }).join(', ') || '(none)')].join('\n');
  console.log(out);
  if (typeof msg === 'function') {
    msg(held.length + ' titles held, ' + missing.length + ' remaining', 'gold');
    msg('Full list printed to the browser console (F12)', 'grey');
  }
  return out;
}

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
      if (document.activeElement === s.el) continue;
      var v = String(s.get());
      if (s.el.value !== v) s.el.value = v;
    }
  } catch (e) {}
};

console.log('[mod] settings menu: skill xp, game speed and coin drop boxes added');
