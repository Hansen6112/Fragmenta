/*
 * FRAGMENTA — Allies
 * Primary, recruitable party members — deep, persistent companions (as
 * opposed to the temporary mercenary contracts planned for the job/board
 * system later). Each has their own threshold to earn: Kessa's is a
 * quest (engine/parser.js's maybeTalkToKessa — found at Arethon, proven
 * by winning a fight), meant as a light, tutorial-weight first recruit;
 * later additions can gate on reputation or item possession instead, per
 * the original design.
 *
 * Stats grow the same way BACKGROUNDS do (engine/state.js's
 * recomputeAllyStats): a flat mod plus Math.round(growth * (level-1)),
 * layered on the same BASE_* constants the player uses, plus whatever
 * shared-inventory gear is equipped in the ally's own equipment slots.
 * Allies don't have their own Speed-based turn slot — they act once per
 * round as a group, right at the top of it (combat.js's
 * resolveAllyActions). Death is permanent and a real threat in every
 * fight (combat.js's pickEnemyAttackTarget/killAlly) — see parser.js's
 * sanctuary/pray/rite/revive commands for the way back.
 */

const ALLY_DEFS = {
  kessa: {
    name: "Kessa Vire",
    tagline: "a wandering blade-for-hire, more loyal than she lets on",
    description:
      "She's been paid to abandon better people than you, and never has. Whatever she's actually looking for, she hasn't found it yet — but she's stopped pretending she isn't looking.",
    atkMod: 3,
    defMod: 1,
    healthMod: 6,
    accuracyMod: 2,
    agilityMod: 1,
    speedMod: 1,
    growth: { atk: 0.7, def: 0.4, health: 2.2, accuracy: 0.3, agility: 0.25, speed: 0.2 },
  },
  // Corvath Ilesse, the Grand Ovum's Champion (data/arena.js's
  // ARENA_CHAMPION, engine/arena.js's startChampionFight/
  // concludeArenaFightWon) — recruited by beating him, not by talking or
  // reputation. These numbers are deliberately kept identical to
  // ARENA_CHAMPION.allyStats there; duplicated rather than referenced
  // since data/allies.js loads before data/arena.js (see index.html).
  the_champion: {
    name: "Corvath Ilesse",
    tagline: "the Grand Ovum's Champion, eleven years undefeated",
    description:
      "Eleven years in the Ovum and not one loss on record — not because he's never been hurt, but because he's never once let hurt decide anything for him.",
    atkMod: 4,
    defMod: 2,
    healthMod: 8,
    accuracyMod: 3,
    agilityMod: 2,
    speedMod: 2,
    growth: { atk: 0.9, def: 0.5, health: 2.6, accuracy: 0.35, agility: 0.3, speed: 0.25 },
  },
};
