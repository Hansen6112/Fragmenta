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
};
