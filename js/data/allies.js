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
  // Hadrian Voric, the Grand Ovum's Champion (data/hadrian.js,
  // engine/arena.js's startHadrianDuel/concludeArenaFightWon) —
  // recruited by beating him, not by talking or reputation. Mods are
  // derived from HADRIAN.startingStats (data/hadrian.js loads before
  // this file — see index.html): target stat minus engine/state.js's
  // BASE_* constant, same relationship recomputeAllyStats itself uses.
  // The BASE_* numbers are duplicated here (5/2/20/3/3/5/5/5) rather
  // than referencing engine/state.js's real constants, since data files
  // load before engine files (index.html) and those constants don't
  // exist yet at this point in load order.
  hadrian: {
    name: HADRIAN.name,
    tagline: HADRIAN.tagline,
    description: HADRIAN.description,
    atkMod: HADRIAN.startingStats.atk - 5,
    defMod: HADRIAN.startingStats.def - 2,
    healthMod: HADRIAN.startingStats.health - 20,
    accuracyMod: HADRIAN.startingStats.accuracy - 5,
    agilityMod: HADRIAN.startingStats.agility - 5,
    speedMod: HADRIAN.startingStats.speed - 5,
    magicMod: HADRIAN.startingStats.magic - 3,
    knowledgeMod: HADRIAN.startingStats.knowledge - 3,
    growth: HADRIAN.growth,
    // Arrives already wearing his own gear (Section 7.6) rather than
    // needing the player to 'give' it to him — see recruitAlly.
    startingEquipment: HADRIAN.startingEquipment,
    // Companion Ability Engine (engine/companion.js) reads this to run
    // his real kit instead of the generic 3-stance ally action — Kessa
    // has no abilityKit, so she's entirely unaffected by any of this.
    abilityKit: { actives: HADRIAN.actives, passives: HADRIAN.passives, vulnerability: HADRIAN.vulnerability },
  },
};
