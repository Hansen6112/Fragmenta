/*
 * FRAGMENTA — Leveling & XP
 * Levels 1-25. XP required per level increases linearly (100 * level to
 * go from that level to the next), so the climb gets meaningfully longer
 * as you go. Stat growth itself lives on GameState (recomputeStats,
 * gainXp in engine/state.js) — this file is just the formulas: how much
 * XP a level costs, and how much a kill or a job/contract is worth.
 */

const LEVEL_CAP = 25;

function xpToNextLevel(level) {
  return level * 100;
}

// Scales off the creature's own encounter level (falling back to the
// player's level for the handful of quest/job-tied creatures that skip
// the level roll entirely — see engine/combat.js startCombat) and its
// Danger Class multiplier, replacing the old flat tier-based formula.
function xpFromKill(state, creature) {
  const level = creature.level || state.level;
  return Math.round(level * 3 * dangerClassMultiplier(creature.dangerClass));
}

// Guild contracts (kind: "guild") pay out more XP than an equivalent-
// difficulty city board job, matching their bigger gold/rep rewards.
function xpFromJob(job) {
  const guildBonus = job.kind === "guild" ? 1.5 : 1;
  return Math.round(job.difficulty * 20 * guildBonus);
}
