/*
 * FRAGMENTA — Elemental Abilities
 * One signature Knowledge-gated ability per element — the mage parallel
 * to the fighter's Feint/Decoy/Ambush/Disarm, and REPLACES that tactics
 * menu entirely for mage-flagged characters rather than stacking on top
 * of it (a mage's toolkit is built around their element, not a generic
 * skillset). At level 15, opening a second element (see engine/state.js
 * gainXp) unlocks that element's ability too, not just attack flavor.
 *
 * This is still v1 scope: one ability each, single Knowledge threshold,
 * no elemental synergy (planned for later once this has been played).
 * Resolution logic lives in engine/combat.js (useElementAbility).
 */

const ELEMENT_ABILITIES = {
  fire: {
    name: "Ignite",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A burning strike that keeps dealing damage for several turns after.",
  },
  water: {
    name: "Torrent",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A crushing strike of compressed water that also mends your wounds.",
  },
  earth: {
    name: "Stoneskin",
    knowledgeReq: 10,
    cooldown: 4,
    description: "Harden your body against all harm, magical or physical, for several turns.",
  },
  lightning: {
    name: "Flurry",
    knowledgeReq: 10,
    cooldown: 3,
    description: "Two strikes faster than the eye can follow.",
  },
  acid: {
    name: "Corrode",
    knowledgeReq: 10,
    cooldown: 2,
    description: "Dissolve your target's defenses permanently — once per target, per fight.",
  },
  force: {
    name: "Concuss",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A blow that knocks the fight out of them — they lose their next action.",
  },
  transportation: {
    name: "Blink",
    knowledgeReq: 10,
    cooldown: 2,
    description: "Teleport in for a free strike, no opening required, no cooldown-limited window.",
  },
  air: {
    name: "Windcut",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A cutting blade of compressed air that leaves you harder to hit for a few turns.",
  },
};

// Verb names mapped back to element ids, for command routing.
const ELEMENT_VERB_TO_KEY = Object.fromEntries(
  Object.entries(ELEMENT_ABILITIES).map(([key, a]) => [a.name.toLowerCase(), key])
);
