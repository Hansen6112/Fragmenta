/*
 * FRAGMENTA — Allies
 * Primary, recruitable party members — deep, persistent companions (as
 * opposed to the temporary mercenary contracts planned for the job/board
 * system later). This is Phase 1 of that system: the party-combat
 * mechanic itself (stances, shared-inventory gear, folding allies into the
 * fight) built and tested against ONE hardcoded ally, before the real
 * recruitment gates (reputation/quest/item thresholds) exist to unlock
 * her — see engine/parser.js's 'recruit' command, which is a stand-in
 * test hook for now, not the real gate.
 *
 * Stats grow the same way BACKGROUNDS do (engine/state.js's
 * recomputeAllyStats): a flat mod plus Math.round(growth * (level-1)),
 * layered on the same BASE_* constants the player uses, plus whatever
 * shared-inventory gear is equipped in the ally's own equipment slots.
 * Allies don't have their own Speed-based turn slot yet — they act once
 * per round as a group, right at the top of it (see combat.js's
 * resolveAllyActions) — and enemies don't target them yet either;
 * permanent death, being downed, and the home-base/revival system are
 * Phase 2.
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
