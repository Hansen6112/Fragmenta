#!/usr/bin/env node
/*
 * FRAGMENTA -- r1_forced_measure.js (task #49, R1 switch measurement
 * follow-up, 27 Nov).
 *
 * Neither plus3_run.js nor boss_sweep.js can measure R1's real impact:
 * both pick gear by raw-stat scoring (gearFor/gearForTierOffset's own
 * "best atk/def/health per slot"), and that scoring never once selects
 * any of the kind-B/set items R1 widens to ally, for any class, gear
 * tier, or level checked -- so dispatch never even reaches these
 * entries in either harness, on the player OR an ally, R1 on or off.
 * Same discipline the spec itself calls for on R3 ("the harness can't
 * see this, use forced test cases instead"), applied here to R1.
 *
 * This forces Kessa (the party's own standard "ally shape" every other
 * Phase 2 ally-widening proof already uses) to report carrying a fixed
 * set of R1-touched gear, via sim_common.js's setForcedPresence (a
 * harness-only hasEffect/hasSetTier override, never touching js/ --
 * same technique the Amendment 1 test-strike proof's own
 * withMockedPresence helper uses, just at the vm-sandbox level instead
 * of a page.evaluate). Runs N fights with COMBAT_UNIFY.R1 false, then
 * true, same seed, and reports the delta per class. Uses
 * gearForTierOffset's "undergeared" tier (offset -1), not gearFor's
 * plain tier -- a smoke test at the plain tier showed win rate already
 * saturated near 100% against this target with no R1-touched gear at
 * all, leaving no headroom to see any delta; undergeared is plus3_run's
 * own "harder, more informative" reconstruction choice for exactly
 * this reason.
 *
 * SCOPE, deliberately narrower than R1a's full 20-entry batch: only
 * the 4 effect ids + 5 set tiers whose own dispatch is guaranteed to
 * fire just from Kessa existing and taking hits (rollToHit.defender's
 * miss/evasion chain, calculateDamage.incoming's Blessing of Stone/
 * Shield Wall) -- NOT gated on Kessa's own AI choosing a specific
 * action or landing a specific kill. The other 11 R1a entries
 * (Siege Corps:6/Legion:6/Brace's onActionUsed grants, Keeper of
 * History's onKill heal, Fragmenta:6/Drake Hunter:6's tag-damage
 * overrides, the 4 Executioner-threshold + Opening Reach/Brace
 * upgrade-tier reversals) depend on Kessa's own action/kill pattern or
 * the specific enemy's own tags, which this harness's existing AI
 * doesn't reliably produce against Dregnar Ashvein -- their dispatch
 * correctness is already proven by this engagement's own test-strike/
 * Amendment-1-style proofs; this script measures magnitude only for
 * the reliably-exercised defensive cluster.
 *
 *   node r1_forced_measure.js --n 1000 --seed 777 --out <file.json>
 */
const fs = require("fs");
const { buildSandbox, cellSeed, pickSeed } = require("./sim_common");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const N = Number(argVal("--n", 1000));
const OUT = argVal("--out", null);
const SEED = argVal("--seed", null) != null ? Number(argVal("--seed", null)) >>> 0 : pickSeed();
console.error(`seed: ${SEED}`);

const TARGET = { spawn: "dregnar_ashvein", L: 30 }; // same target plus3_run.js uses

// The reliably-exercised defensive cluster only -- see header.
const FORCED_EFFECT_IDS = ["guardian_spirit", "guided_footsteps", "never_where_expected", "evasive_guard"];
const FORCED_SET_TIER_KEYS = [
  "River Warden:6",                      // rollToHit.defender evasion bonus
  "Regalia of the Endless Horizon:2",    // Blessing of Freedom evade (rollToHit.defender)
  "Regalia of the Eternal Heart:2",      // Blessing of Compassion, heal.incoming
  "Regalia of the Eternal Bastion:2",    // Blessing of Stone, calculateDamage.incoming
  "Legion:4",                            // Shield Wall, calculateDamage.incoming
];

function runCell(sb, cls, r1On, seed) {
  sb.seedRandom(seed);
  const COMBAT_UNIFY = sb.G("COMBAT_UNIFY");
  COMBAT_UNIFY.R1 = r1On;
  let wins = 0, allyDeaths = 0, n = 0, roundsSum = 0, playerHpSum = 0, allyHpSum = 0, allyHpCells = 0;
  for (let i = 0; i < N; i++) {
    const r = sb.runFight({
      cls, L: TARGET.L, spawn: TARGET.spawn, party: true, spawnMode: "alone",
      // gearFor's own "normal" tier saturates win rate near 100% against
      // this target (confirmed by a smoke test), leaving no headroom to
      // see any delta at all -- plus3_run.js's own "undergeared" tier
      // (offset -1) is used instead, same reconstruction judgment call
      // that file already made, for the same reason: it's the harder,
      // more informative case.
      gearFn: (L, primary) => sb.gearForTierOffset(L, primary, -1),
      // Re-arms setForcedPresence on THIS fight's own freshly-recruited
      // Kessa -- buildLegalParty rebuilds the whole party from scratch
      // every fight, so the previous fight's Kessa object is never
      // reused.
      afterParty: (s) => {
        const kessa = s.party.find((a) => a.defId === "kessa");
        sb.setForcedPresence(kessa, FORCED_EFFECT_IDS, FORCED_SET_TIER_KEYS);
      },
    });
    if (!r) continue;
    n++;
    wins += r.won ? 1 : 0;
    allyDeaths += r.allyDeaths;
    roundsSum += r.rounds;
    playerHpSum += r.playerHpFrac;
    if (r.allyHpFrac != null) { allyHpSum += r.allyHpFrac; allyHpCells++; }
  }
  return {
    n, winRate: n ? wins / n : null, allyDeathsPerFight: n ? allyDeaths / n : null,
    meanRounds: n ? roundsSum / n : null,
    meanPlayerHpPct: n ? (playerHpSum / n) * 100 : null,
    meanAllyHpPct: allyHpCells ? (allyHpSum / allyHpCells) * 100 : null,
  };
}

function main() {
  const sb = buildSandbox(false); // DAMAGE_TYPES_V2 off -- orthogonal to R1, kept fixed to bound scope
  const CLASS_IDS = sb.CLASS_IDS;

  const results = {};
  for (const cls of CLASS_IDS) {
    const seed = cellSeed(SEED, cls);
    const before = runCell(sb, cls, false, seed);
    const after = runCell(sb, cls, true, seed);
    const wrDeltaPoints = before.winRate != null && after.winRate != null ? (after.winRate - before.winRate) * 100 : null;
    results[cls] = { before, after, wrDeltaPoints, flagged: wrDeltaPoints != null && Math.abs(wrDeltaPoints) > 10 };
    console.log(`${cls.padEnd(12)} winRate ${(before.winRate * 100).toFixed(1)}% -> ${(after.winRate * 100).toFixed(1)}%  (delta ${wrDeltaPoints >= 0 ? "+" : ""}${wrDeltaPoints.toFixed(1)} pts)${results[cls].flagged ? "  *** FLAGGED >10pt ***" : ""}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(), n: N, seed: SEED, target: TARGET,
    forcedEffectIds: FORCED_EFFECT_IDS, forcedSetTierKeys: FORCED_SET_TIER_KEYS,
    results,
  };
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(payload, null, 2)); console.log(`wrote ${OUT}`); }
}

main();
