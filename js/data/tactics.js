/*
 * FRAGMENTA — Tactical Skills
 * Knowledge-gated combat actions, unlocked automatically as Knowledge
 * grows (see data/classes.js's PLAYER_GROWTH_BASE/CLASSES growth
 * multipliers — no manual allocation). Warrior and Scout are the only
 * Classes with usesTactics: true (engine/combat.js's classHasTactics) —
 * Mage/Bruise use Elemental abilities instead, and Apothecary uses its
 * own separate ability below (APOTHECARY_ABILITY), never these four.
 *
 * Each tactic's limiter is enforced in engine/combat.js:
 *  - feint:  2-turn cooldown after use
 *  - decoy:  3-turn cooldown after use
 *  - ambush: usable only as the opening move of a fight, once — no
 *            cooldown, since it simply can't recur once the moment's
 *            passed
 *  - disarm: 2-turn cooldown, AND can only ever land once against a
 *            given target within that fight (cooldown expiring doesn't
 *            let you reapply it to the same creature)
 */

const TACTICS = {
  feint: {
    name: "Feint",
    knowledgeReq: 5,
    cooldown: 2,
    description: "Sacrifice this turn's attack to guarantee your next strike lands hard. The enemy still gets its counter this turn.",
  },
  decoy: {
    name: "Decoy",
    knowledgeReq: 12,
    cooldown: 3,
    description: "Draw the enemy's attack into a decoy — you take no retaliation this turn, and still attack normally.",
  },
  ambush: {
    name: "Ambush",
    knowledgeReq: 12,
    cooldown: null, // limiter is "opening move only," not a cooldown
    description: "A free opening strike — usable only before you've taken any other action this fight. Bonus damage, no counter.",
  },
  disarm: {
    name: "Disarm",
    knowledgeReq: 18,
    cooldown: 2,
    description: "Knock the fight out of your opponent, reducing their attack for the rest of the encounter. Lands once per target, ever, in a fight.",
  },
};

function unlockedTactics(state) {
  return Object.keys(TACTICS).filter((id) => state.knowledge >= TACTICS[id].knowledgeReq);
}

// Apothecary's own Knowledge-gated ability — a stub (see data/origins.js's
// header on the deferred crafting subsystem): one buff, not a growing
// list like Tactics/Elemental abilities get. Separate from TACTICS since
// unlockedTactics()/the tactics status display assume every entry there
// belongs to a Warrior/Scout-style build; kept here rather than a new file
// since it's a single entry with the exact same shape.
const APOTHECARY_ABILITY = {
  fortify: {
    name: "Fortify",
    knowledgeReq: 8,
    cooldown: 3,
    description: "Brace yourself with a surge of applied know-how — +Defense (scales with Knowledge) for 3 turns. The enemy still gets its counter this turn.",
  },
};
