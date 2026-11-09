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
    // No target, no hit roll, no damage -- useFeint (combat.js) already
    // dispatches generically off this very table (knowledgeReq/cooldown),
    // with no action-identity branching to remove. This block declares
    // the shape for the audit (P2) and the coverage table; the mechanic
    // itself (sets state.combat.nextAttackBonus, consumed by
    // basic_attack's own consumesFeintBonus field) stays in useFeint.
    action: { actorKinds: ["player"], actionType: "tactic", targeting: "self", toHit: "none", damage: null },
  },
  decoy: {
    name: "Decoy",
    knowledgeReq: 12,
    cooldown: 3,
    description: "Draw the enemy's attack into a decoy — you take no retaliation this turn, and still attack normally.",
    action: {
      actorKinds: ["player"], actionType: "tactic", usesPerfectMemory: true, consumesTrailblazer: true,
      targeting: "singleEnemy", toHit: "roll", formula: "playerCore", excludesTargetFromRound: true,
      missLine: (state, creature) => [`Your own strike goes wide, even with ${withThe(creature.name, false)} distracted.`],
      openingReach: "unconditional", reportPhysical: "always",
      flavorLine: (state, creature, edmg) => [`${attackFlavorLine(state, creature, edmg)} (while it's distracted)`],
      onHitEffectsForm: "unconditional", runsLowHealthChecks: true, followupForm: "unconditional",
    },
  },
  ambush: {
    name: "Ambush",
    knowledgeReq: 12,
    cooldown: null, // limiter is "opening move only," not a cooldown
    description: "A free opening strike — usable only before you've taken any other action this fight. Bonus damage, no counter.",
    action: {
      actorKinds: ["player"], actionType: "tactic", usesPerfectMemory: true, consumesTrailblazer: true,
      targeting: "singleEnemy", toHit: "roll", formula: "playerCore", excludesTargetFromRound: true,
      missLine: (state, creature) => [`You strike first, but ${withThe(creature.name, false)} isn't where you aimed. No counter, but no damage either.`],
      extraDamageMultiplierFn: (state) => ambushMultiplier(state), borrowedSecondsBonusInDamage: true,
      reportPhysical: "always",
      flavorLine: (state, creature, edmg) => [`You strike first — ${withThe(creature.name, false)} never saw it coming. ${edmg} damage, no counter.`],
      onHitEffectsForm: "unconditional", evasiveReleaseCheck: true, runsLowHealthChecks: true, followupForm: "unconditional",
    },
  },
  disarm: {
    name: "Disarm",
    knowledgeReq: 18,
    cooldown: 2,
    description: "Knock the fight out of your opponent, reducing their attack for the rest of the encounter. Lands once per target, ever, in a fight.",
    action: {
      actorKinds: ["player"], actionType: "tactic", usesPerfectMemory: true, consumesTrailblazer: true,
      targeting: "singleEnemy", toHit: "roll", formula: "playerCore",
      missLine: () => [`The follow-up strike doesn't land, but the disarm holds.`],
      extraDamageMultiplierFn: () => 0.7, openingReach: "unconditional", reportPhysical: "always",
      flavorLine: (state, creature, edmg) => [`You still land a hit for ${edmg} damage.`],
      onHitEffectsForm: "unconditional", runsLowHealthChecks: true, followupForm: "gated",
    },
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
// Every Apothecary ability's own shape -- no target, no hit roll, no
// damage, castable on self or a living ally. useApothecaryAbility
// (combat.js) already dispatches generically off this very table
// (knowledgeReq/cooldown/stat/allyStat/cleanse), with no per-ability
// branching to remove -- this declares the shape for the audit (P2) and
// the coverage table.
const APOTHECARY_ACTION_SHAPE = { actorKinds: ["player"], actionType: "apothecary", targeting: "selfOrAlly", toHit: "none", damage: null };

const APOTHECARY_ABILITIES = {
  rousing_tonic: {
    name: "Rousing Tonic",
    knowledgeReq: 6,
    cooldown: 3,
    stat: "atk",
    description: "A bitter draught that quickens the blood — +Attack (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
    action: APOTHECARY_ACTION_SHAPE,
  },
  field_triage: {
    name: "Field Triage",
    knowledgeReq: 9,
    cooldown: 4,
    stat: null,
    cleanse: true,
    description: "Fast, practiced hands clear whatever's clinging to you or an ally, mid-fight — cleanses all active statuses on the target.",
    action: APOTHECARY_ACTION_SHAPE,
  },
  fortify: {
    name: "Fortify",
    knowledgeReq: 11,
    cooldown: 3,
    stat: "def",
    description: "Brace yourself or an ally with a surge of applied know-how — +Defense (scales with Knowledge) for 3 turns.",
    action: APOTHECARY_ACTION_SHAPE,
  },
  clear_focus: {
    name: "Clear Focus",
    knowledgeReq: 13,
    cooldown: 3,
    stat: "acc",
    description: "Steady the hands and sharpen the eye — +Accuracy (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
    action: APOTHECARY_ACTION_SHAPE,
  },
  fleet_step: {
    name: "Fleet Step",
    knowledgeReq: 16,
    cooldown: 3,
    stat: "spd",
    allyStat: "agi",
    description: "A tonic that lightens the feet — +Speed (scales with Knowledge) for 3 turns cast on yourself, or +Agility cast on an ally, who has no use for the former.",
    action: APOTHECARY_ACTION_SHAPE,
  },
  steady_grip: {
    name: "Steady Grip",
    knowledgeReq: 15,
    cooldown: 3,
    stat: "agi",
    description: "Calms the nerves, firms the footing — +Agility (scales with Knowledge) for 3 turns, cast on yourself or an ally.",
    action: APOTHECARY_ACTION_SHAPE,
  },
};

function unlockedApothecaryAbilities(state) {
  return Object.keys(APOTHECARY_ABILITIES).filter((id) => state.knowledge >= APOTHECARY_ABILITIES[id].knowledgeReq);
}
