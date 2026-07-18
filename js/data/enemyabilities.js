/*
 * FRAGMENTA — Enemy Abilities
 * From the Fragmenta Master Enemy Codex's per-family "Appendix A – Ability
 * Specifications": named Passive/Active abilities a BESTIARY creature can
 * carry via its own `passives`/`actives` arrays (ids into ENEMY_ABILITIES
 * below). Purely data + tiny pure helpers here — resolution lives in
 * engine/combat.js (resolveEnemyActiveAbility for actives; the passive
 * hooks threaded through resolveEnemyRetaliation/beginTurn/applyPlayerDamage
 * for the rest), the same data/engine split as data/tactics.js and
 * data/elementabilities.js on the player's own side.
 *
 * This is deliberately NOT a 1:1 transcription of every nuance in the
 * codex — leader-lives auras and pack-count bonuses key off actual alive
 * packmates (state.combat.enemies), which this engine already tracks, so
 * those ARE real; but a few codex mechanics (mid-fight summoning more
 * packmates, an instant-execute clause, "reforms on death") are authored
 * per-ability below only where a batch actually needs them, added
 * incrementally rather than pre-built speculatively.
 */

// ---- Player-facing status effects (an enemy's ability can apply these to
// the player; ticked in engine/combat.js's beginTurn alongside the
// existing enemy-side burn/bleed, and read by effectivePlayerAgility/
// effectivePlayerAccuracy/effectivePlayerInitiative below). `stackable`
// ones (Bleed, Constrict) add another stack up to `maxStacks`, refreshing
// every stack's own duration; everything else simply refreshes duration on
// reapplication, per the codex's own repeated "does not stack; reapplication
// refreshes the duration" wording.
const STATUS_EFFECTS = {
  bleed: { name: "Bleeding", dot: { pctMaxHp: 0.05 }, stackable: true, maxStacks: 3, turns: 2 },
  venom: { name: "Venomed", dot: { pctMaxHp: 0.02 }, stackable: false, turns: 3 },
  burning: { name: "Burning", dot: { pctMaxHp: 0.04 }, stackable: false, turns: 2 },
  chilled: { name: "Chilled", debuff: { agi: -10 }, stackable: false, turns: 2 },
  slowed: { name: "Slowed", debuff: { spdPct: -0.2, agiPct: -0.1 }, stackable: false, turns: 2 },
  constrict: { name: "Constricted", debuff: { agi: -5 }, stackable: true, maxStacks: 4, turns: 99, escalatesAt: 4, escalatesTo: "restrained" },
  restrained: { name: "Restrained", debuff: { agi: -20 }, stackable: false, turns: 2 },
  pinned: { name: "Pinned", debuff: { spd: -20, agi: -15, acc: -10 }, stackable: false, turns: 2 },
};

// Elemental-resistance flags a creature can carry (Winter Coat/Ash Hide-
// style) — a status in STATUS_EFFECTS this list names simply never applies
// to that creature's own immunity-holder (irrelevant to the player, since
// these are read the other direction: a passive on the CREATURE granting
// IT immunity would matter if the player could ever inflict Chilled/
// Burning on an enemy, which the player's own kit doesn't do — these exist
// on the data side for creatures that reference them in flavor/Appendix
// text; see Winter Coat/Ash Hide in enemyPassiveDefs for the honest
// "nothing yet applies these to a creature" framing, matching the
// project's existing inert-effect convention).

const ENEMY_ABILITIES = {
  // ================= ACTIVE ABILITIES =================
  // Shape: cooldown (turns before reuse), dmgMult (fraction of this
  // creature's own Attack, replacing the flat retaliation roll entirely
  // when the ability fires), optional aoe (also rolls against every alive
  // ally, not just the player), optional inflict ({status, chance} into
  // STATUS_EFFECTS, or {custom: {...debuff, turns}, chance} for a one-off
  // magnitude that doesn't match a named status), optional selfDebuff/
  // selfBuff (a temporary stat modifier on the ACTING creature itself).
  reckless_charge: { name: "Reckless Charge", type: "active", cooldown: 4, dmgMult: 1.8, selfDebuff: { def: -10, turns: 2 } },
  gore: { name: "Gore", type: "active", cooldown: 3, dmgMult: 1.4, inflict: { status: "bleed", chance: 0.4 } },
  dominant_charge: { name: "Dominant Charge", type: "active", cooldown: 5, dmgMult: 2.0, inflict: { custom: { spd: -25, turns: 2 }, chance: 1 } },
  overrun: { name: "Overrun", type: "active", cooldown: 4, dmgMult: 1.5, inflict: { custom: { spd: -20, turns: 2 }, chance: 1 } },
  earthshaker: { name: "Earthshaker", type: "active", cooldown: 5, dmgMult: 1.8, aoe: true, inflict: { custom: { spd: -15, turns: 1 }, chance: 1 } },
  bite: { name: "Bite", type: "active", cooldown: 0, dmgMult: 1.0, inflict: { status: "bleed", chance: 0.2 } },
  pounce: { name: "Pounce", type: "active", cooldown: 3, dmgMult: 1.4 },
  hamstring_bite: { name: "Hamstring", type: "active", cooldown: 4, dmgMult: 0.8, inflict: { status: "slowed", chance: 1 } },
  maul: { name: "Maul", type: "active", cooldown: 4, dmgMult: 1.6 },
  shadow_pounce: { name: "Shadow Pounce", type: "active", cooldown: 4, dmgMult: 1.5 },
  frost_bite: { name: "Frost Bite", type: "active", cooldown: 2, dmgMult: 1.1, inflict: { status: "chilled", chance: 0.3 } },
  searing_bite: { name: "Searing Bite", type: "active", cooldown: 2, dmgMult: 1.1, inflict: { status: "burning", chance: 0.3 } },
  sand_rush: { name: "Sand Rush", type: "active", cooldown: 3, dmgMult: 1.3 },
  rend: { name: "Rend", type: "active", cooldown: 3, dmgMult: 1.4, bonusVsStatus: { status: "bleed", mult: 1.3 } },
  savage_maul: { name: "Savage Maul", type: "active", cooldown: 5, dmgMult: 2.2 },
  execution_bite: { name: "Execution Bite", type: "active", cooldown: 4, dmgMult: 1.8, bonusVsHealthBelowPct: { pct: 0.3, mult: 1.5 } },
  gnaw: { name: "Gnaw", type: "active", cooldown: 0, dmgMult: 1.0, inflict: { custom: { def: -2, turns: 2 }, chance: 0.2 } },
  leap: { name: "Leap", type: "active", cooldown: 3, dmgMult: 1.3 },
  crushing_bite: { name: "Crushing Bite", type: "active", cooldown: 3, dmgMult: 1.5 },
  quill_burst: { name: "Quill Burst", type: "active", cooldown: 5, dmgMult: 1.2, aoe: true },
  earth_tunnel: { name: "Earth Tunnel", type: "active", cooldown: 5, dmgMult: 0, selfHealPct: 0.08, selfBuff: { agi: 10, turns: 2 } },
  stone_throw: { name: "Stone Throw", type: "active", cooldown: 2, dmgMult: 0.9 },
  disarm_swipe: { name: "Disarm", type: "active", cooldown: 3, dmgMult: 1.1, inflict: { custom: { atk: -10, turns: 2, pctOfSelf: true }, chance: 1 } },
  ground_slam: { name: "Ground Slam", type: "active", cooldown: 4, dmgMult: 1.4, aoe: true, inflict: { custom: { spd: -10, turns: 1 }, chance: 1 } },
  crushing_grab: { name: "Crushing Grab", type: "active", cooldown: 4, dmgMult: 1.7, inflict: { custom: { agi: -10, turns: 2 }, chance: 1 } },
  crushing_swing: { name: "Crushing Swing", type: "active", cooldown: 4, dmgMult: 2.2 },
  sweeping_blow: { name: "Sweeping Blow", type: "active", cooldown: 5, dmgMult: 1.4, aoe: true },
  rending_peck: { name: "Rending Peck", type: "active", cooldown: 3, dmgMult: 1.4, inflict: { status: "bleed", chance: 0.35 } },
  talon_rush: { name: "Talon Rush", type: "active", cooldown: 4, dmgMult: 1.7 },
  dive_strike: { name: "Dive Strike", type: "active", cooldown: 4, dmgMult: 1.8 },
  screech: { name: "Screech", type: "active", cooldown: 5, dmgMult: 0, aoe: true, inflict: { custom: { acc: -10, turns: 2 }, chance: 1 } },
  impale: { name: "Impale", type: "active", cooldown: 4, dmgMult: 1.6, inflict: { status: "bleed", chance: 1 } },
  wing_buffet: { name: "Wing Buffet", type: "active", cooldown: 4, dmgMult: 1.3, aoe: true, inflict: { custom: { spd: -10, turns: 1 }, chance: 1 } },
  crushing_talons: { name: "Crushing Talons", type: "active", cooldown: 5, dmgMult: 2.0 },
  devastating_dive: { name: "Devastating Dive", type: "active", cooldown: 5, dmgMult: 2.2 },
  tempest_wings: { name: "Tempest Wings", type: "active", cooldown: 6, dmgMult: 1.5, aoe: true, inflict: { custom: { spd: -15, turns: 1 }, chance: 1 } },
  tail_whip: { name: "Tail Whip", type: "active", cooldown: 4, dmgMult: 1.2, inflict: { custom: { spd: -10, turns: 1 }, chance: 1 } },
  death_roll: { name: "Death Roll", type: "active", cooldown: 5, dmgMult: 1.8, inflict: { status: "bleed", chance: 1 } },
  tail_slam: { name: "Tail Slam", type: "active", cooldown: 4, dmgMult: 1.4, aoe: true },
  savage_rush: { name: "Savage Rush", type: "active", cooldown: 4, dmgMult: 1.7, selfBuff: { spd: 15, turns: 1 } },
  rending_bite: { name: "Rending Bite", type: "active", cooldown: 3, dmgMult: 1.5, inflict: { status: "bleed", chance: 0.4 } },
  cataclysmic_bite: { name: "Cataclysmic Bite", type: "active", cooldown: 5, dmgMult: 2.3 },
  venom_strike: { name: "Venom Strike", type: "active", cooldown: 3, dmgMult: 1.4, inflict: { status: "venom", chance: 1 } },
  quick_coil: { name: "Quick Coil", type: "active", cooldown: 3, dmgMult: 1.2, inflict: { status: "constrict", chance: 1 } },
  crushing_coil: { name: "Crushing Coil", type: "active", cooldown: 4, dmgMult: 1.7, bonusVsStatus: { status: "restrained", mult: 1.3 } },
  devour: { name: "Devour", type: "active", cooldown: 5, dmgMult: 2.1, executeBelowPct: 0.2 },
  cataclysmic_coil: { name: "Cataclysmic Coil", type: "active", cooldown: 6, dmgMult: 2.4, healOnHitPct: 0.1, bonusVsStatus: { status: "restrained", mult: 1.0 } },
  chitin_charge: { name: "Chitin Charge", type: "active", cooldown: 3, dmgMult: 1.5, selfBuffOnKill: { spd: 10, turns: 1 } },
  crushing_mandibles: { name: "Crushing Mandibles", type: "active", cooldown: 4, dmgMult: 1.9, bonusVsHealthBelowPct: { pct: 0.5, mult: 1.25 } },
  bone_slash: { name: "Bone Slash", type: "active", cooldown: 3, dmgMult: 1.45, bonusVsHealthBelowPct: { pct: 0.5, mult: 1.15 } },
  bone_volley: { name: "Bone Volley", type: "active", cooldown: 4, dmgMult: 1.3, aoe: true },
  shield_crush: { name: "Shield Crush", type: "active", cooldown: 4, dmgMult: 1.5, inflict: { custom: { def: -10, turns: 2 }, chance: 1 } },
  crushing_bones: { name: "Crushing Bones", type: "active", cooldown: 4, dmgMult: 1.8, bonusVsStatus: { status: "pinned", mult: 1.4 } },
  bone_prison: { name: "Bone Prison", type: "active", cooldown: 5, dmgMult: 1.5, inflict: { status: "pinned", chance: 1 } },
  bone_storm: { name: "Bone Storm", type: "active", cooldown: 6, dmgMult: 1.7, aoe: true, bonusVsStatus: { status: "pinned", mult: 1.0 }, inflict: { custom: { acc: -10, turns: 2, onlyIfStatus: "pinned" }, chance: 1 } },
  grave_formation: { name: "Grave Formation", type: "active", cooldown: 5, dmgMult: 0, packAuraBuff: { def: 15, acc: 15, turns: 3 } },

  // ================= PASSIVE ABILITIES =================
  // trigger vocabulary: "healthBelowPct" (one-shot per combat once HP first
  // drops under threshold), "everyPctHealthLostStacking" (repeatable, each
  // fresh 20%-of-max-HP lost grants another stack), "onHitTaken" (fires
  // whenever the player successfully damages this creature — reflect or a
  // stacking counter), "flatDamageReduction" (a flat % off any damage this
  // creature takes), "firstAttack" (bonus applied only to this creature's
  // first active-ability use each fight), "regenPerTurn" (heals a flat %
  // max HP at the top of every round it's alive), "packCount" (scales with
  // how many OTHER alive packmates share this creature's `group`),
  // "leaderAura" (buffs every alive packmate sharing `group` while this
  // specific creature is alive — used on the leader itself), "onKill"
  // (bonus the instant this creature defeats the player or an ally — no
  // such outcome exists in this engine, so these stay flavor-only), "onAllyDeath".
  cornered: { name: "Cornered", type: "passive", trigger: "healthBelowPct", threshold: 0.5, selfBuff: { atkPct: 0.2 }, oncePerCombat: true },
  barbed_hide: { name: "Barbed Hide", type: "passive", trigger: "onHitTaken", reflectPctOfAtk: 0.1 },
  iron_tusks: { name: "Iron Tusks", type: "passive", trigger: "critAlwaysBleeds" },
  kings_fury: { name: "King's Fury", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.2, selfBuff: { atk: 5, acc: 2 } },
  thick_hide: { name: "Thick Hide", type: "passive", trigger: "flatDamageReduction", pct: 0.1 },
  thick_hide_2: { name: "Thick Hide II", type: "passive", trigger: "flatDamageReduction", pct: 0.2 },
  unyielding: { name: "Unyielding", type: "passive", trigger: "healthStagedBuff", stages: [0.75, 0.5, 0.25], selfBuff: { def: 5 } },
  predators_momentum: { name: "Predator's Momentum", type: "passive", trigger: "onKill", selfBuff: { atkPct: 0.15, turns: 3 } },
  ancient_resilience: { name: "Ancient Resilience", type: "passive", trigger: "regenPerTurn", pct: 0.03 },
  keen_senses: { name: "Keen Senses", type: "passive", trigger: "ignoresAmbush" },
  pack_hunter: { name: "Pack Hunter", type: "passive", trigger: "packCount", perAlly: { atkPct: 0.02, acc: 2 }, maxStacks: 5 },
  crushing_jaws: { name: "Crushing Jaws", type: "passive", trigger: "bonusVsStatus", status: "bleed", mult: 1.2 },
  ambush_bonus: { name: "Ambush", type: "passive", trigger: "firstAttack", critChanceBonus: 0.25 },
  winter_coat: { name: "Winter Coat", type: "passive", trigger: "elementalResist", immuneTo: "chilled", elementDmgPct: { water: 0.5 } },
  ash_hide: { name: "Ash Hide", type: "passive", trigger: "elementalResist", immuneTo: "burning", elementDmgPct: { fire: 0.5 } },
  forest_camouflage: { name: "Forest Camouflage", type: "passive", trigger: "firstAttack", opponentAccPenalty: -15 },
  relentless_pursuit: { name: "Relentless Pursuit", type: "passive", trigger: "consecutiveSameTarget", perHit: { atkPct: 0.03 }, maxPct: 0.15 },
  blood_frenzy: { name: "Blood Frenzy", type: "passive", trigger: "onOpponentStatusStart", status: "bleed", selfBuff: { atk: 3, turns: 3 } },
  alphas_command: { name: "Alpha's Command", type: "passive", trigger: "leaderAura", buff: { atkPct: 0.1, acc: 10, spd: 5 } },
  lord_of_the_pack: { name: "Lord of the Pack", type: "passive", trigger: "leaderAura", buff: { atkPct: 0.15, acc: 15, agi: 10 } },
  swarm: { name: "Swarm", type: "passive", trigger: "packCount", perAlly: { acc: 2 }, maxStacks: 5 },
  tunnel_fighter: { name: "Tunnel Fighter", type: "passive", trigger: "combatStartBuff", turns: 2, buff: { agi: 10 } },
  powerful_bite: { name: "Powerful Bite", type: "passive", trigger: "critInflictsCustom", custom: { def: -5, turns: 2 } },
  quills: { name: "Quills", type: "passive", trigger: "onHitTaken", reflectPctOfAtk: 0.15 },
  endless_swarm: { name: "Endless Swarm", type: "passive", trigger: "onAllyDeath", selfBuff: { atk: 3, acc: 3 } },
  opportunist: { name: "Opportunist", type: "passive", trigger: "bonusVsAnyStatus", mult: 1.15 },
  patient_hunter: { name: "Patient Hunter", type: "passive", trigger: "firstAttack", dmgMultBonus: 1.2, accBonus: 10 },
  killer_instinct: { name: "Killer Instinct", type: "passive", trigger: "bonusVsHealthAbovePct", pct: 0.75, mult: 1.2 },
  pride_leader: { name: "Pride Leader", type: "passive", trigger: "leaderAura", buff: { atkPct: 0.08, acc: 5, spd: 5 } },
  apex_predator: { name: "Apex Predator", type: "passive", trigger: "healthBelowPct", threshold: 0.5, selfBuff: { atkPct: 0.15, acc: 10, agi: 10 }, oncePerCombat: true },
  mob_confidence: { name: "Mob Confidence", type: "passive", trigger: "packCount", perAlly: { acc: 5 }, maxStacks: 3 },
  intimidating_presence: { name: "Intimidating Presence", type: "passive", trigger: "leaderAura", buff: { def: 5 }, opponentPenalty: { acc: -5 } },
  adaptive_fighter: { name: "Adaptive Fighter", type: "passive", trigger: "afterNHitsFromSameTarget", n: 3, selfBuff: { def: 10, acc: 10 } },
  tool_mastery: { name: "Tool Mastery", type: "passive", trigger: "flatDamageBonus", dmgMultBonus: 1.2, accBonus: 10 },
  relentless_chase: { name: "Relentless Chase", type: "passive", trigger: "onHitLanded", selfBuff: { spd: 2 }, maxStacks: 5 },
  silent_hunter: { name: "Silent Hunter", type: "passive", trigger: "firstAttack", accBonus: 15, critChanceBonus: 0.25 },
  butchers_instinct: { name: "Butcher's Instinct", type: "passive", trigger: "bonusVsStatus", status: "bleed", mult: 1.2 },
  wing_guard: { name: "Wing Guard", type: "passive", trigger: "flatDamageReduction", pct: 0.2, rangedOnly: true },
  sky_sovereign: { name: "Sky Sovereign", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.25, selfBuff: { acc: 5, agi: 5 } },
  ambush_predator: { name: "Ambush Predator", type: "passive", trigger: "firstAttack", dmgMultBonus: 1.2 },
  thick_scales: { name: "Thick Scales", type: "passive", trigger: "flatDamageReduction", pct: 0.15 },
  primal_adaptation: { name: "Primal Adaptation", type: "passive", trigger: "periodicRandomBuff", everyNTurns: 3, options: [{ atk: 5 }, { def: 5 }, { acc: 5 }] },
  ancient_apex: { name: "Ancient Apex", type: "passive", trigger: "healthBelowPct", threshold: 0.5, selfBuff: { atkPct: 0.2, def: 10 }, oncePerCombat: true },
  shed_skin: { name: "Shed Skin", type: "passive", trigger: "healthBelowPct", threshold: 0.3, cleanseSelf: true, selfBuff: { agi: 10, turns: 2 }, oncePerCombat: true },
  ancient_predator: { name: "Ancient Predator", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.25, selfBuff: { atk: 5, acc: 5 } },
  swarm_instinct: { name: "Swarm Instinct", type: "passive", trigger: "packCount", perAlly: { atk: 2 }, maxStacks: 5 },
  hardened_carapace: { name: "Hardened Carapace", type: "passive", trigger: "flatDamageReduction", pct: 0.15 },
  defensive_formation: { name: "Defensive Formation", type: "passive", trigger: "packCount", perAlly: { def: 5 }, maxStacks: 1 },
  royal_pheromones: { name: "Royal Pheromones", type: "passive", trigger: "leaderAura", buff: { atkPct: 0.1, acc: 10 } },
  hollow_frame: { name: "Hollow Frame", type: "passive", trigger: "elementalResist", immuneTo: ["bleed"], piercingDmgPct: 0.8 },
  reinforced_bones: { name: "Reinforced Bones", type: "passive", trigger: "healthAboveBuff", threshold: 0.5, selfBuff: { def: 15 } },
  reassemble: { name: "Reassemble", type: "passive", trigger: "reformOnDeath", pctMaxHp: 0.2, exceptDamageType: "blunt", oncePerCombat: true },
  runic_bones: { name: "Runic Bones", type: "passive", trigger: "defensePenetration", pct: 0.2, defenseReductionImmune: true },
  ossified_commander: { name: "Ossified Commander", type: "passive", trigger: "leaderAura", buff: { acc: 10, spd: 10 } },
};

function getEnemyAbility(id) {
  return ENEMY_ABILITIES[id] || null;
}

function getStatusEffect(id) {
  return STATUS_EFFECTS[id] || null;
}
