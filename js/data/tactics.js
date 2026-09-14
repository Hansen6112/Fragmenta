/*
 * FRAGMENTA — Tactical Skills
 * Knowledge-gated combat actions, unlocked automatically as Knowledge
 * grows (see data/classes.js's PLAYER_GROWTH_BASE/CLASSES growth
 * multipliers — no manual allocation). Warrior and Scout are the only
 * Classes with usesTactics: true (engine/combat.js's classHasTactics) —
 * Mage/Bruise use Elemental abilities instead, and Apothecary uses its
 * own separate kit below (APOTHECARY_ABILITIES), never these four.
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

// Apothecary's own Knowledge-gated kit — six abilities, all castable on
// yourself or a living ally (engine/combat.js's useApothecaryAbility).
// Separate from TACTICS since unlockedTactics()/the tactics status display
// assume every entry there belongs to a Warrior/Scout-style build.
// `stat` is null for Field Triage (a cleanse, not a stat buff). `allyStat`
// is only set where the ally-cast targets a different stat than the
// self-cast one — Fleet Step's Speed has no ally consumer at all (allies
// have no speed-based turn order in this engine), so cast on an ally it
// grants Agility instead, for survivability rather than a no-op.
const APOTHECARY_ABILITIES = {
  rousing_tonic: {
    name: "Rousing Tonic",
    knowledgeReq: 6,
    cooldown: 3,
    stat: "atk",
    description: "A bitter draught that quickens the blood — +Attack (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
  },
  field_triage: {
    name: "Field Triage",
    knowledgeReq: 9,
    cooldown: 4,
    stat: null,
    cleanse: true,
    description: "Fast, practiced hands clear whatever's clinging to you or an ally, mid-fight — cleanses all active statuses on the target.",
  },
  fortify: {
    name: "Fortify",
    knowledgeReq: 11,
    cooldown: 3,
    stat: "def",
    description: "Brace yourself or an ally with a surge of applied know-how — +Defense (scales with Knowledge) for 3 turns.",
  },
  clear_focus: {
    name: "Clear Focus",
    knowledgeReq: 13,
    cooldown: 3,
    stat: "acc",
    description: "Steady the hands and sharpen the eye — +Accuracy (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
  },
  fleet_step: {
    name: "Fleet Step",
    knowledgeReq: 16,
    cooldown: 3,
    stat: "spd",
    allyStat: "agi",
    description: "A tonic that lightens the feet — +Speed (scales with Knowledge) for 3 turns cast on yourself, or +Agility cast on an ally, who has no use for the former.",
  },
  steady_grip: {
    name: "Steady Grip",
    knowledgeReq: 15,
    cooldown: 3,
    stat: "agi",
    description: "Calms the nerves, firms the footing — +Agility (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
  },
};

function unlockedApothecaryAbilities(state) {
  return Object.keys(APOTHECARY_ABILITIES).filter((id) => state.knowledge >= APOTHECARY_ABILITIES[id].knowledgeReq);
}
