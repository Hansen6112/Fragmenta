/*
 * FRAGMENTA — Tactical Skills
 * Knowledge-gated combat actions, unlocked automatically as Knowledge
 * grows (see engine/leveling.js background growth profiles — no manual
 * allocation). Thresholds are calibrated against the real level-25
 * Knowledge ranges: Scout ~21, Novitiate ~20, Mercenary ~17, Legionary
 * ~14, Clan Warrior ~12, Bruise ~13 — so the top tier (Disarm) is a
 * genuine stretch only a couple of builds ever reach.
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
