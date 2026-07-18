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
  buried: { name: "Buried", debuff: { acc: -20 }, stackable: false, turns: 1 },
  // Drowsy's own "becomes Asleep at the end of the 2nd turn" transform,
  // and Asleep's skip-your-turn/+crit-chance clauses, have no engine hook
  // (nothing currently reads a status's escalatesAt/escalatesTo outside of
  // Constrict's own declared-but-unwired fields above) — declared for
  // fidelity, not dispatched.
  drowsy: { name: "Drowsy", debuff: { spd: -10, acc: -5 }, stackable: false, turns: 2, escalatesAt: 2, escalatesTo: "asleep" },
  asleep: { name: "Asleep", debuff: {}, stackable: false, turns: 1 },
  disoriented: { name: "Disoriented", debuff: { acc: -10, spd: -5 }, stackable: false, turns: 2 },
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

  // The Master Enemy Codex references these four by name in a creature's
  // Active Abilities list but never gives them their own Appendix A entry
  // anywhere in the document — authored here to match the surrounding
  // magnitude conventions for their tier (Razorback/Uncommon, Lion/Epic,
  // Ancient Sabertooth/Unique, Gorilla/Rare), the same "fill the gap,
  // match the established pattern" approach used for the one other
  // placeholder this session hit (a canonical temple name).
  howl: { name: "Howl", type: "active", cooldown: 5, dmgMult: 0, packAuraBuff: { atkPct: 0.08, acc: 8, turns: 3 } },
  brush_stalk: { name: "Brush Stalk", type: "active", cooldown: 4, dmgMult: 0, selfBuff: { agi: 20, turns: 2 } },
  rallying_howl: { name: "Rallying Howl", type: "active", cooldown: 5, dmgMult: 0, packAuraBuff: { atkPct: 0.1, acc: 10, turns: 3 } },
  // Coordinated Strike's "marks one target; allied Lupines prioritize it"
  // and Call the Hunt's "summons additional Lupines" both need mechanics
  // this pass doesn't build (cross-creature target-forcing; mid-fight
  // summoning, same scope limit as Burrow Call) — registered so the name
  // resolves and nothing crashes, but they deal no damage and do nothing
  // else yet. Same honest "not yet wired" precedent as the rest of this
  // file's documented gaps.
  coordinated_strike: { name: "Coordinated Strike", type: "active", cooldown: 4, dmgMult: 0 },
  call_the_hunt: { name: "Call the Hunt", type: "active", cooldown: 8, dmgMult: 0 },
  kings_howl: { name: "King's Howl", type: "active", cooldown: 6, dmgMult: 0, packAuraBuff: { atkPct: 0.15, acc: 15, turns: 4 } },
  charge: { name: "Charge", type: "active", cooldown: 3, dmgMult: 1.5 },
  smash: { name: "Smash", type: "active", cooldown: 4, dmgMult: 1.6 },
  kings_maul: { name: "King's Maul", type: "active", cooldown: 5, dmgMult: 2.3 },
  rallying_roar: { name: "Rallying Roar", type: "active", cooldown: 5, dmgMult: 0, packAuraBuff: { atkPct: 0.1, acc: 10, turns: 3 } },

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

  // ---- Akharu / Dhulorvae (Wild Invertebrates) ----
  // Desert Predator's codex wording ("if the Akharu acts before its
  // target") is a per-round initiative check the engine has no hook for;
  // approximated as a first-active-use bonus like Ambush/Patient Hunter.
  desert_predator: { name: "Desert Predator", type: "passive", trigger: "firstAttack", dmgMultBonus: 1.1 },
  venomous_sting: { name: "Venomous Sting", type: "active", cooldown: 3, dmgMult: 1.5, inflict: { status: "venom", chance: 1 } },
  // Dhulorvae's own Venomous Sting is a separate, slightly weaker Appendix
  // A entry (145% vs Akharu's 150%) that "applies the regional venom
  // associated with the biome" — same Venom status mechanically either way.
  venomous_sting_dhulorvae: { name: "Venomous Sting", type: "active", cooldown: 3, dmgMult: 1.45, inflict: { status: "venom", chance: 1 } },
  pincer_slam: { name: "Pincer Slam", type: "active", cooldown: 3, dmgMult: 1.4 },
  hardened_exoskeleton: { name: "Hardened Exoskeleton", type: "passive", trigger: "flatDamageReduction", pct: 0.2 },
  pincer_crush: { name: "Pincer Crush", type: "active", cooldown: 4, dmgMult: 1.75, inflict: { custom: { def: -5, turns: 2 }, chance: 1 } },
  pincer_crush_dhulorvae: { name: "Pincer Crush", type: "active", cooldown: 4, dmgMult: 1.7, inflict: { custom: { def: -5, turns: 2 }, chance: 1 } },
  // Sand Burrow's full text (delayed +15 Acc/+20 Init next turn, then the
  // FOLLOWING attack at +30%) is simplified to an immediate self-buff plus
  // Buried on the target — the multi-turn delayed-attack-bonus clause has
  // no engine hook and is dropped rather than half-implemented.
  sand_burrow: { name: "Sand Burrow", type: "active", cooldown: 5, dmgMult: 0, inflict: { status: "buried", chance: 1 }, selfBuff: { acc: 15, spd: 20, turns: 1 } },
  // Not yet wired to a resolver (matches Crushing Jaws/Butcher's Instinct
  // above) — Titanic Momentum's "Buried OR Venom" condition also can't be
  // expressed by the single-status bonusVsStatus shape even once one is.
  titanic_momentum: { name: "Titanic Momentum", type: "passive", trigger: "bonusVsStatus", status: "venom", mult: 1.15 },
  impaling_strike: { name: "Impaling Strike", type: "active", cooldown: 5, dmgMult: 2.2, bonusVsStatus: { status: "buried", mult: 1.25 } },
  royal_instinct: { name: "Royal Instinct", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.25, selfBuff: { atk: 5, def: 5 } },
  cataclysmic_sting: { name: "Cataclysmic Sting", type: "active", cooldown: 6, dmgMult: 2.6, inflict: { status: "venom", chance: 1 } },
  // Burrow Ambush is Appendix-A-defined as a Passive (first-attack bonus)
  // even though Greater/Elder Dhulorvae's summary table lists it under
  // Active Abilities — same categorization slip as Elder Serpent's
  // Constrict in Wild Reptiles; the real spec wins, so it's wired here as
  // a passive on those two creatures rather than an active.
  burrow_ambush: { name: "Burrow Ambush", type: "passive", trigger: "firstAttack", dmgMultBonus: 1.2 },
  elder_carapace: { name: "Elder Carapace", type: "passive", trigger: "flatDamageReduction", pct: 0.2 },
  crushing_pincers: { name: "Crushing Pincers", type: "active", cooldown: 5, dmgMult: 1.9, bonusVsStatus: { status: "venom", mult: 1.25 } },

  // ---- Draven-Drak / Skrel-Drak (Magical Creatures A) ----
  // Draconic Presence is the one genuinely new mechanic this family needs
  // (a start-of-combat debuff on the player rather than a reaction to
  // something the player did) — wired directly in startCombat, since none
  // of the existing per-turn passive hooks fire before round 1.
  draconic_presence: { name: "Draconic Presence", type: "passive", trigger: "combatStartDebuff", debuff: { acc: -5, spd: -5 }, turns: 3 },
  dominance: { name: "Dominance", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.2, selfBuff: { atk: 3, acc: 2 } },
  // Not yet wired — reacts to Dominance itself gaining a stack, which has
  // no dispatch hook of its own (matches Crushing Jaws/Titanic Momentum
  // above).
  ancient_instinct: { name: "Ancient Instinct", type: "passive", trigger: "onAllyPassiveStack", watchFor: "dominance", cleanseOne: true, cooldownReduction: 1 },
  // Shield-on-trigger and cleanse-all are dropped (no engine hook, like
  // Shed Skin's own cleanseSelf above) — the Initiative burst is the part
  // that maps onto an existing trigger shape.
  ancient_majesty: { name: "Ancient Majesty", type: "passive", trigger: "healthBelowPct", threshold: 0.25, selfBuff: { spd: 10, turns: 2 }, oncePerCombat: true },
  claw_rend: { name: "Claw Rend", type: "active", cooldown: 2, dmgMult: 1.6, inflict: { status: "bleed", chance: 1 } },
  tail_sweep: { name: "Tail Sweep", type: "active", cooldown: 3, dmgMult: 1.4, aoe: true, inflict: { custom: { spd: -5, turns: 1 }, chance: 1 } },
  // "Applies the dragon's elemental effect" branches five ways in the
  // codex (Red/White/Green/Black/Blue) — Burn is used as the single
  // representative element, same simplification as Inherited Breath below.
  breath_weapon: { name: "Breath Weapon", type: "active", cooldown: 5, dmgMult: 2.1, inflict: { status: "burning", chance: 1 } },
  catastrophic_breath: { name: "Catastrophic Breath", type: "active", cooldown: 6, dmgMult: 2.6, aoe: true, inflict: { status: "burning", chance: 1 } },
  // Not yet wired — needs per-ability damage-history tracking the engine
  // doesn't keep (matches Ancient Instinct above).
  draconic_insight: { name: "Draconic Insight", type: "passive", trigger: "adaptToRepeatedAbility", reductionPct: 0.2 },
  ancient_draconic_insight: { name: "Ancient Draconic Insight", type: "passive", trigger: "adaptToRepeatedAbility", reductionPct: 0.2, selfBuff: { atk: 3, def: 3 }, maxStacks: 5 },
  territorial_apex: { name: "Territorial Apex", type: "passive", trigger: "healthBelowPct", threshold: 0.5, selfBuff: { atk: 10, acc: 10 }, oncePerCombat: true },
  // Not yet wired — triggers off the player being inflicted with an
  // elemental status, which has no dispatch hook here.
  sovereign_territory: { name: "Sovereign Territory", type: "passive", trigger: "onPlayerElementalStatusInflicted", healPctMaxHp: 0.03 },
  inherited_breath: { name: "Inherited Breath", type: "active", cooldown: 4, dmgMult: 1.8, inflict: { status: "burning", chance: 1 } },
  dragons_challenge: { name: "Dragon's Challenge", type: "active", cooldown: 6, dmgMult: 2.4, bonusVsStatus: { status: "burning", mult: 1.5 } },

  // ---- Valdrek-Keth / Voreth-Mauth / Voreth-Sael / Lorvaun-Nauri
  // (Magical Creatures B) ----
  adaptive_carapace: { name: "Adaptive Carapace", type: "passive", trigger: "everyPctHealthLostStacking", pct: 0.25, selfBuff: { spd: 5, acc: 5 } },
  skitter_assault: { name: "Skitter Assault", type: "active", cooldown: 2, dmgMult: 1.1, selfBuff: { spd: 10, turns: 1 } },
  crystal_bite: { name: "Crystal Bite", type: "active", cooldown: 3, dmgMult: 1.45, inflict: { custom: { def: -5, turns: 2 }, chance: 1 } },
  // Defense-ignore clauses (Piercing Tail/Crystal Ram/Crystal Impalement/
  // Somersault Charge below) have no engine hook — dropped, dmgMult-only.
  piercing_tail: { name: "Piercing Tail", type: "active", cooldown: 3, dmgMult: 1.6 },
  crystal_ram: { name: "Crystal Ram", type: "active", cooldown: 4, dmgMult: 1.8 },
  crystal_impalement: { name: "Crystal Impalement", type: "active", cooldown: 5, dmgMult: 2.2 },
  // Not yet wired — a periodic (every-3rd-turn) temporary shield has no
  // matching trigger shape (periodicRandomBuff is permanent-stat-only).
  diamond_shell: { name: "Diamond Shell", type: "passive", trigger: "periodicTemporaryShield", everyNTurns: 3, durationTurns: 2, dmgReductionPct: 0.35 },
  // Brood Call (mid-fight summoning) and Brood Sovereign (reacts only to
  // a summoned Larva dying) are both skipped outright rather than
  // declared inert — Brood Sovereign would have literally nothing to react
  // to without Brood Call, unlike every other "not yet wired" entry above,
  // which at least describes a real single-creature mechanic.
  powdered_wings: { name: "Powdered Wings", type: "passive", trigger: "onHitTaken", inflictStatusOnAttacker: "drowsy" },
  dust_cloud: { name: "Dust Cloud", type: "active", cooldown: 3, dmgMult: 0.8, inflict: { status: "drowsy", chance: 1 } },
  // Thick Dust's whole effect ("Dust Cloud hits everyone instead") is
  // represented by giving Elder Voreth-Mauth this AoE variant directly,
  // rather than a separate passive that does nothing on its own.
  dust_cloud_aoe: { name: "Dust Cloud", type: "active", cooldown: 3, dmgMult: 0.8, aoe: true, inflict: { status: "drowsy", chance: 1 } },
  startled_flight: { name: "Startled Flight", type: "active", cooldown: 4, dmgMult: 1.0, selfBuff: { agi: 20, spd: 10, turns: 1 } },
  dream_mist: { name: "Dream Mist", type: "active", cooldown: 5, dmgMult: 1.0, aoe: true, inflict: { status: "drowsy", chance: 1 } },
  // Not yet wired — an independent post-Accuracy-check miss chance has no
  // hook in the player's own attackConnects roll.
  mirror_scales: { name: "Mirror Scales", type: "passive", trigger: "independentMissChance", chance: 0.2 },
  // Reacts only to Mirror Scales actually triggering, so it's equally
  // unwired for the same reason.
  distorted_reality: { name: "Distorted Reality", type: "passive", trigger: "onMirrorScalesProc", selfBuff: { spd: 10, acc: 10, turns: 1 } },
  reflection_strike: { name: "Reflection Strike", type: "active", cooldown: 2, dmgMult: 1.45, inflict: { status: "disoriented", chance: 1 } },
  ripple_veil: { name: "Ripple Veil", type: "active", cooldown: 4, dmgMult: 0, selfBuff: { agi: 10, turns: 1 } },
  mirrored_assault: { name: "Mirrored Assault", type: "active", cooldown: 5, dmgMult: 1.8, bonusVsStatus: { status: "disoriented", mult: 1.25 } },
  // Not yet wired — no hook fires when a creature uses a specific active,
  // only firstAttack-style one-shot bonuses (see Ambush/Patient Hunter
  // above).
  crystal_momentum: { name: "Crystal Momentum", type: "passive", trigger: "onActiveUse", selfBuff: { atkPct: 0.1, spd: 5, turns: 2 } },
  crystal_gore: { name: "Crystal Gore", type: "active", cooldown: 3, dmgMult: 1.55 },
  crystal_hide: { name: "Crystal Hide", type: "passive", trigger: "flatDamageReduction", pct: 0.15 },
  crystal_hide_reflect: { name: "Crystal Hide", type: "passive", trigger: "onHitTaken", reflectPctOfAtk: 0.1 },
  somersault_charge: { name: "Somersault Charge", type: "active", cooldown: 5, dmgMult: 2.2 },
};

function getEnemyAbility(id) {
  return ENEMY_ABILITIES[id] || null;
}

function getStatusEffect(id) {
  return STATUS_EFFECTS[id] || null;
}
