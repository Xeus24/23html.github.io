/* Uncertainty for the balance scripts.
   ---------------------------------------------------------------------------
   Every balance number in this suite is a sample mean of something
   heavy-tailed. `MOD_ENEMY.kill` targets eight landed swings; a run that
   measures 8.19 might be the model working or might be three extra crits.
   Until now nothing said which, because the scripts report point estimates:
   `fightsmoke` medians nine duels, `allareas` prints one number per matchup.

   A confidence interval is the missing half. It says how much of the gap
   between the measurement and the target is real.

   --- why Student's t and not the normal approximation ---------------------

   `fightsmoke` fights NINE times per area. At n=9 the z-interval is roughly
   15% too narrow, which is exactly the direction that turns noise into a
   confident wrong answer. The critical values below are two-tailed 95% by
   degrees of freedom, with the normal value as the limit — small enough to
   embed, and the alternative is a dependency this repo does not have (there
   is no Python and no stats package here; see MOD-NOTES on why the third-party
   skill was not vendored for this).
   ------------------------------------------------------------------------- */

const T95 = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
  15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080,
  22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048,
  29: 2.045, 30: 2.042, 40: 2.021, 50: 2.009, 60: 2.000, 80: 1.990, 100: 1.984,
  120: 1.980
};

/* Two-tailed 95% critical value for `df` degrees of freedom.

   t SHRINKS as df grows, so between tabulated rows this takes the value for
   the largest tabulated df at or below the real one — the LARGER critical
   value, and therefore the wider interval. Reaching for the next row up
   (df 39 -> the df 40 row) would quietly narrow the interval past what the
   table justifies, which is the one direction that turns noise into a
   confident wrong answer. */
export function tCrit95(df) {
  if (!isFinite(df) || df < 1) return T95[1];
  if (T95[df] !== undefined) return T95[df];
  const rows = Object.keys(T95).map(Number).sort((a, b) => a - b);
  let best = T95[1];
  for (const r of rows) { if (r <= df) best = T95[r]; else break; }
  return df > 120 ? 1.960 : best;
}

/* mean, sd, standard error and a 95% CI for a list of measurements.
   n < 2 has no spread to report, so the interval is the point itself and
   `wide` is true — a caller that treats that as precision is wrong. */
export function summarize(samples) {
  const s = samples.filter(x => typeof x === 'number' && isFinite(x));
  const n = s.length;
  if (!n) return { n: 0, mean: NaN, sd: NaN, se: NaN, lo: NaN, hi: NaN, moePct: NaN, wide: true };
  const mean = s.reduce((a, x) => a + x, 0) / n;
  if (n < 2) return { n, mean, sd: 0, se: 0, lo: mean, hi: mean, moePct: Infinity, wide: true };
  const sd = Math.sqrt(s.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const moe = tCrit95(n - 1) * se;
  return { n, mean, sd, se, lo: mean - moe, hi: mean + moe,
           moePct: mean !== 0 ? (moe / Math.abs(mean)) * 100 : Infinity,
           wide: mean !== 0 && (moe / Math.abs(mean)) > 0.25 };
}

/* Does the measurement agree with the target it was built to hit?
   `true` means the 95% interval covers the target — the model is delivering
   what it intends, within noise. `false` is a real deviation, not a bad run. */
export function hitsTarget(samples, target) {
  const st = summarize(samples);
  if (!st.n) return { ...st, target, hit: false, why: 'no samples' };
  const hit = target >= st.lo && target <= st.hi;
  return { ...st, target, hit,
           why: hit ? 'target inside the 95% CI'
                    : `target ${target} is outside [${st.lo.toFixed(2)}, ${st.hi.toFixed(2)}]` };
}

/* Practical equivalence, which is usually the question actually being asked.

   `hitsTarget` asks "is the measurement statistically distinguishable from the
   target?" -- and with a tight enough sample the answer is always yes. Measured
   at n=45 the enemy model tracks its targets to within ±0.1%, so a harmless 1%
   quantisation bias fails a contains-the-target test while meaning nothing in
   play. Nobody can feel two percent of a swing.

   This asks the useful question instead: does the whole interval sit inside
   target ± tol? That is a TOST-shaped check -- it can fail two ways, by real
   deviation OR by an interval too wide to conclude anything, and the message
   says which. */
export function withinBand(samples, target, tolPct) {
  const st = summarize(samples);
  const tol = Math.abs(target) * (tolPct / 100);
  const lo = target - tol, hi = target + tol;
  if (!st.n) return { ...st, target, tolPct, ok: false, why: 'no samples' };
  const ok = st.lo >= lo && st.hi <= hi;
  const drifted = st.mean < lo || st.mean > hi;
  return { ...st, target, tolPct, ok,
    why: ok ? `inside ±${tolPct}% of ${target}`
       : drifted ? `mean ${st.mean.toFixed(3)} is outside ±${tolPct}% of ${target}`
       : `interval [${st.lo.toFixed(3)}, ${st.hi.toFixed(3)}] is too wide to sit inside ±${tolPct}%` };
}

/* One line for a report table. */
export function ciLine(st, unit) {
  if (!st.n) return 'no samples';
  if (st.n < 2) return `${st.mean.toFixed(2)}${unit || ''} (n=1, no interval)`;
  return `${st.mean.toFixed(2)} [${st.lo.toFixed(2)}, ${st.hi.toFixed(2)}]${unit || ''}` +
         ` ±${st.moePct.toFixed(1)}%`;
}
