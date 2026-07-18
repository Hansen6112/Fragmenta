/*
 * FRAGMENTA — Combat Resolution
 * A narrative encounter layer, not a full tactics simulator: plain
 * `fight`/`flee` plus a small Knowledge-gated actions layer. Fighters get
 * the universal tactics (data/tactics.js — Feint, Decoy, Ambush, Disarm);
 * mages get their element's signature ability instead (data/
 * elementabilities.js), REPLACING the tactics menu entirely rather than
 * stacking on top of it. Creature `tier` (0-5) drives how hard the fight is.
 *
 * Mage-flagged characters (isMage, once they've picked an element) deal
 * damage through rollPlayerDamage/attackFlavorLine instead of the plain
 * attack-stat formula — magic-driven, elementally flavored, and scaled by
 * a multiplier tied to the Magic stat itself (see data/elements.js).
 *
 * Once a mage has two elements (level 15+), useElementAbility checks
 * data/synergy.js for a bonus each cast, keyed off which element was used
 * immediately before this one.
 *
 * A large layer of equipment-set bonuses (data/sets.js) hooks into nearly
 * every function below — where a set bonus is just "take the strongest
 * override of an existing number," the resolver lives in sets.js
 * (crushingImpactMultiplier, spellWardMultiplier, etc.) and this file
 * just calls it; where it's a genuinely new mechanic, it's implemented
 * inline here with a comment naming which set grants it.
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Combat targets are either a static BESTIARY entry (creatureId is a
// string key) or a dynamically generated one, like an enemy mage
// (creatureId is that object's own id, and the full object is stashed on
// state.combat.creatureObj since it isn't in BESTIARY to look up). Most
// ordinary BESTIARY encounters ALSO get a creatureObj now — a per-fight
// clone with a freshly rolled level and stats scaled from the species'
// base via data/creaturetags.js computeCreatureStats (see startCombat) —
// so the shared BESTIARY dict entry is never mutated. state.combat.dynamicCreature
// (not creatureObj's truthiness) is the real "is this an enemy mage, not
// a BESTIARY species" signal — see applyArchiveEternal.
function getCombatCreature(state) {
  if (!state.combat) return null;
  return state.combat.creatureObj || BESTIARY[state.combat.creatureId];
}

// Multi-enemy support (pack/squad encounters): state.combat.enemies is an
// array, one entry per creature in the fight, each holding its own
// hp/maxHp/creatureObj plus every debuff that's genuinely inflicted ON a
// specific creature (Disarm, Corrode, Hamstring, burn/bleed, Reinforced's
// counter, the stun flag, its own last-damage-type). state.combat.activeIndex
// is whichever enemy the player is currently targeting.
//
// Rather than rewrite the ~50 existing damage/effect functions throughout
// this file to thread an enemy index through everywhere, these dozen or so
// fields are defined as live getters/setters on state.combat itself,
// transparently proxying to state.combat.enemies[state.combat.activeIndex].
// Every existing line of code that reads or writes state.combat.hp,
// .creatureObj, .corroded, etc. keeps working completely unchanged — it
// always operates on "whichever enemy is currently active," and switching
// target (or resolveKill advancing past a dead one) just moves what that
// means. Everything else on state.combat (all the Divine Regalia/
// Legendary/Mythic stacking buffs, cooldowns, action counters) is genuinely
// player-side and fight-scoped, not tied to any one enemy, so it's
// untouched by this — a plain property on the shared object, same as before
// multi-enemy fights existed.
const PER_ENEMY_FIELDS = [
  "creatureId", "creatureObj", "dynamicCreature", "name",
  "hp", "maxHp",
  "corroded", "disarmed", "enemyAtkPenalty", "enemyDefPenalty", "enemyStunned",
  "hamstringApplied", "burn", "bleed", "reinforcedAttackCount", "lastDamageType",
  "skipNormalRetaliationThisRound",
  // Enemy Ability Engine (data/enemyabilities.js) — per-enemy so a pack of
  // several creatures each track their own cooldowns/stacks independently.
  "abilityCooldowns", "selfBuffs", "passiveOnceFlags", "firstActiveUsed",
  "healthLostStacks", "hitsTakenFromPlayer", "lastAttackTargetKind", "consecutiveTargetStacks",
  "summonSourceKey", // null for anything rolled into the fight normally; set to the summoning ability's own id for anything summoned mid-fight — see resolveEnemySummon
];

function wireActiveEnemyProxy(combat) {
  PER_ENEMY_FIELDS.forEach((field) => {
    Object.defineProperty(combat, field, {
      configurable: true,
      enumerable: true,
      get() { return combat.enemies[combat.activeIndex][field]; },
      set(v) { combat.enemies[combat.activeIndex][field] = v; },
    });
  });
}

// Every enemy still standing, in roster order.
function aliveEnemies(state) {
  return state.combat ? state.combat.enemies.filter((e) => e.alive) : [];
}

// Master of Arms (Artifact): whether the given effect id is specifically
// on the equipped Main Hand item (not just equipped somewhere), so its
// "doubles if applicable" clause can target only that source. hasEffect()
// itself is a pure presence check across all gear and can't answer this.
function mainhandGrants(state, effectId) {
  const item = state.equipment.mainhand;
  const def = item && ITEM_DEFS[item];
  return !!(def && def.effects && def.effects.includes(effectId));
}
function masterOfArmsDoubles(state, effectId) {
  return hasEffect(state, "master_of_arms") && mainhandGrants(state, effectId);
}

// Creature names that are already articled ("The Turned") or proper nouns
// ("Druith, the Ancient") shouldn't get a second "A"/"An"/"the" stuck in front.
function isSelfArticled(name) {
  return /^(the|a|an)\s/i.test(name) || name.includes(",");
}

function articled(name) {
  if (isSelfArticled(name)) return name;
  const vowel = /^[aeiou]/i.test(name);
  return `${vowel ? "An" : "A"} ${name}`;
}

// "the Stoneback Beetle" vs. "The Turned" / "Druith, the Ancient" as-is
function withThe(name, capitalize) {
  const out = isSelfArticled(name) ? name : `the ${name}`;
  return capitalize ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

// Disarm applies a lasting penalty to the creature's effective attack for
// the rest of the encounter; everything that computes enemy retaliation
// damage should go through this instead of reading creature.atk directly.
function effectiveEnemyAtk(state, creature) {
  return Math.max(1, creature.atk - (state.combat.enemyAtkPenalty || 0));
}

// Whether an attack connects at all, before any damage math or special
// miss/evasion effect runs — a contested Accuracy-vs-Agility roll, 50/50
// at equal stats, shifting 3% per point of difference either way and
// clamped to [10%, 90%] so neither side can ever guarantee a hit or a
// miss purely by stacking one stat. Both the player's own attacks
// (state.accuracy vs creature.agi) and enemy retaliation (creature.acc vs
// state.agility) go through this, in that same attacker/defender shape.
// extraChance: a direct hit-chance-percentage bonus/penalty (0.02 = +2
// percentage points), layered on top of the Accuracy/Agility formula
// rather than converted into "equivalent Accuracy points" — used by
// Veteran of a Hundred Battles (engine/companion.js), whose "+2%
// Accuracy" reads as a hit-chance bonus, not a stat increase.
function hitChance(attackerAccuracy, defenderAgility, extraChance) {
  return Math.max(0.10, Math.min(0.90, 0.5 + ((attackerAccuracy || 0) - (defenderAgility || 0)) * 0.03 + (extraChance || 0)));
}

function attackConnects(attackerAccuracy, defenderAgility, extraChance) {
  return Math.random() < hitChance(attackerAccuracy, defenderAgility, extraChance);
}

// Earth's Stoneskin adds a temporary universal defense bonus; Evasive
// Guard and Queen Carapace's carapace_adaptation each add a permanent-
// for-the-fight bonus (capped +3 and +9 respectively) whenever their
// trigger fires — everything that computes damage taken should go
// through this instead of state.def.
function effectivePlayerDef(state) {
  const combat = state.combat;
  const buff = combat.defBuffTurns > 0 ? combat.defBuffAmount || 0 : 0;
  // Ordered Mind (Regalia): +2 Defense (cap +12) every time a negative
  // status is resisted/ignored — see applyPlayerStatus. Calm Waters
  // (Regalia): a temporary Defense bonus whenever Cleansing Current clears
  // a status — see applyStatusCleanseOnHeal.
  const calmWatersDef = combat.calmWatersTurns > 0 ? combat.calmWatersDefBonus || 0 : 0;
  const base = state.def + buff + (combat.evasiveGuardBonus || 0) + (combat.forestGuardianBonus || 0) + (combat.queenCarapaceBonus || 0) + (combat.whiteWatchRiposteDefBonus || 0) + perfectBalanceBonus(state) + (combat.livingSteelBonus || 0) + (combat.battleTemperedDefStacks || 0) + (combat.compassionsGraceDefStacks || 0) * 2 + (combat.windsOfChangeDef || 0) + (combat.avatarOfChaosDefBonus || 0) + (combat.wallsEndureDefStacks || 0) + (combat.avatarOfEnduranceDefBonus || 0) + (combat.reinforcedDefStacks || 0) + (combat.orderedMindDefStacks || 0) + calmWatersDef;
  // Enemy Ability Engine (data/enemyabilities.js): a Defense-reducing
  // status an enemy's active ability just inflicted (Shield Crush, ...),
  // summed across whatever's currently active in combat.playerStatuses.
  // Already negative (a debuff's own `def` value IS the signed delta —
  // -10 means "10 less Defense"), so it's added, not subtracted.
  const penalty = playerStatusStatTotal(state, "def");
  if (penalty >= 0) return base;
  // Bedrock (Regalia): Defense reductions can never push effective Defense
  // below 75% of its own unreduced base — floors the penalty rather than
  // negating it outright, unlike Unbreakable/Corrosionproof below (which
  // shrink or fully ignore the FIRST reduction at the moment it's applied).
  const reduced = base + penalty;
  return hasEffect(state, "bedrock") ? Math.max(reduced, Math.round(base * 0.75)) : reduced;
}

// ---- Enemy Ability Engine: player-facing status effects ----
// state.combat.playerStatuses is keyed by a status id (STATUS_EFFECTS'
// own keys for named statuses; "custom:<abilityId>:<stat>" for one-off
// magnitudes an ability defines inline via `inflict.custom` — namespaced
// per stat so, e.g., a Defense-reducing custom debuff and an
// Accuracy-reducing one from different abilities never collide or
// overwrite each other). Each entry: { name, debuff: {...}, dot: {...},
// turnsLeft, stacks }. Reapplying a non-stacking entry refreshes its
// duration in place, matching the codex's own repeated "does not stack;
// reapplication refreshes the duration" wording; Bleed/Constrict stack
// instead, up to their own cap.
function playerStatusStatTotal(state, statKey) {
  const statuses = (state.combat && state.combat.playerStatuses) || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    const stacks = entry.stacks || 1;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey] * stacks;
  }
  return total;
}
function playerStatusStatPctTotal(state, statKey) {
  const statuses = (state.combat && state.combat.playerStatuses) || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey];
  }
  return total;
}
function effectivePlayerAgility(state) {
  const pct = playerStatusStatPctTotal(state, "agiPct");
  const base = state.agility + playerStatusStatTotal(state, "agi");
  return Math.max(0, Math.round(base * (1 + pct)));
}
function effectivePlayerAccuracy(state) {
  return Math.max(0, state.accuracy + playerStatusStatTotal(state, "acc"));
}
function effectivePlayerSpeedForInitiative(state) {
  const pct = playerStatusStatPctTotal(state, "spdPct");
  const base = state.speed + playerStatusStatTotal(state, "spd");
  return Math.max(0, Math.round(base * (1 + pct)));
}

// Applies (or refreshes/stacks) a status onto the player, after checking
// every defensive effect that can intercept it — Immutable (Artifact, full
// negation, always), Fortune's Favor (Regalia, 35% chance to fail), Nature's
// Persistence (Regalia, the first crowd-control-shaped status each combat —
// anything with a `debuff`, as opposed to a pure damage-over-time like
// Bleed/Venom/Burning — is ignored), and Unbreakable/Corrosionproof
// specifically softening a Defense reduction. `spec` is either a
// STATUS_EFFECTS entry (named) or a raw { debuff, dot, turns } shape for an
// ability's own `inflict.custom`. Returns any line worth printing, or [].
function applyPlayerStatus(state, key, spec, sourceName) {
  const combat = state.combat;
  if (!combat) return [];
  const label = spec.name || key;
  if (hasEffect(state, "immutable")) {
    return [`Immutable turns ${label} aside completely.`];
  }
  if (hasEffect(state, "fortunes_favor") && Math.random() < 0.35) {
    combat.orderedMindDefStacks = Math.min(12, (combat.orderedMindDefStacks || 0) + 2);
    return [`Fortune's Favor lets ${label} simply fail to take hold.`];
  }
  const isCrowdControl = !!spec.debuff && !spec.dot;
  if (isCrowdControl && hasEffect(state, "natures_persistence") && !combat.naturesPersistenceUsed) {
    combat.naturesPersistenceUsed = true;
    if (hasEffect(state, "ordered_mind")) combat.orderedMindDefStacks = Math.min(12, (combat.orderedMindDefStacks || 0) + 2);
    return [`Nature's Persistence shrugs off ${label} entirely.`];
  }
  let turns = spec.turns != null ? spec.turns : 2;
  // Blessing of Acceptance (Regalia of the Final Veil 2pc): every negative
  // status lands with 1 fewer round of duration (never below 1).
  if (hasEffect(state, "blessing_of_acceptance")) turns = Math.max(1, turns - 1);
  let debuff = spec.debuff;
  if (debuff && debuff.def && (hasEffect(state, "unbreakable") || hasEffect(state, "corrosionproof"))) {
    // Unbreakable (Legendary): the FIRST Defense reduction each fight is
    // ignored outright. Corrosionproof (defensive utility): every
    // Defense-reducing status lands 2 points softer, floored at 0.
    if (hasEffect(state, "unbreakable") && !combat.unbreakableUsed) {
      combat.unbreakableUsed = true;
      return [`Unbreakable ignores the Defense loss from ${label} entirely.`];
    }
    if (hasEffect(state, "corrosionproof")) {
      debuff = { ...debuff, def: Math.min(0, debuff.def + 2) };
    }
  }
  const existing = combat.playerStatuses[key];
  if (spec.stackable) {
    const stacks = Math.min(spec.maxStacks || 1, (existing ? existing.stacks : 0) + 1);
    combat.playerStatuses[key] = { name: label, debuff, dot: spec.dot, turnsLeft: turns, stacks };
  } else {
    combat.playerStatuses[key] = { name: label, debuff, dot: spec.dot, turnsLeft: turns, stacks: 1 };
  }
  return [`${sourceName ? withThe(sourceName, true) + " inflicts" : "You suffer"} ${label}.`];
}

// Rolls and applies whatever `inflict` an active ability specifies —
// either a named STATUS_EFFECTS entry (`{ status, chance }`) or a bespoke
// one-off magnitude (`{ custom: { ...debuff, turns }, chance }`) that
// doesn't match any named status. Called from resolveEnemyRetaliation
// after a hit lands.
function applyAbilityInflict(state, inflict, sourceName) {
  if (!inflict || Math.random() >= (inflict.chance != null ? inflict.chance : 1)) return [];
  if (inflict.status) {
    const def = getStatusEffect(inflict.status);
    if (!def) return [];
    return applyPlayerStatus(state, inflict.status, def, sourceName);
  }
  if (inflict.custom) {
    const { turns, ...debuff } = inflict.custom;
    return applyPlayerStatus(state, "custom:" + sourceName + ":" + Object.keys(debuff).join(","), { debuff, turns, name: sourceName }, sourceName);
  }
  return [];
}

// Ticks every active player status by one turn: damage-over-time first
// (Heatproof halves Burning specifically, per its own wording), then
// duration. Called from beginTurn, the same place enemy-side burn/bleed
// already tick.
function tickPlayerStatuses(state) {
  const combat = state.combat;
  const lines = [];
  for (const [key, entry] of Object.entries(combat.playerStatuses)) {
    if (entry.dot) {
      const stacks = entry.stacks || 1;
      let dmg = Math.max(0, Math.round(state.maxHealth * entry.dot.pctMaxHp * stacks));
      if (key === "burning" && hasEffect(state, "heatproof")) dmg = Math.floor(dmg / 2);
      if (dmg > 0) {
        applyPlayerDamage(state, dmg);
        lines.push(`${entry.name} saps ${dmg} health.`);
        if (state.health <= 0) lines.push(checkDeathPrevention(state) || `Everything goes dark.`);
      }
    }
    entry.turnsLeft -= 1;
    if (entry.turnsLeft <= 0) delete combat.playerStatuses[key];
  }
  return lines;
}

// Cleansing Current / Calm Waters (Regalia): whenever the player is
// healed, Cleansing Current clears one random active status, and if it
// actually cleared something, Calm Waters grants a temporary Defense/Magic
// bonus on top. Called from applyHeal.
function applyStatusCleanseOnHeal(state) {
  if (!hasEffect(state, "cleansing_current")) return [];
  const combat = state.combat;
  if (!combat || !combat.playerStatuses) return [];
  const keys = Object.keys(combat.playerStatuses);
  if (!keys.length) return [];
  const key = keys[Math.floor(Math.random() * keys.length)];
  const cleared = combat.playerStatuses[key];
  delete combat.playerStatuses[key];
  const lines = [`Cleansing Current washes away ${cleared.name}.`];
  if (hasEffect(state, "calm_waters")) {
    combat.calmWatersDefBonus = Math.min(12, (combat.calmWatersDefBonus || 0) + 4);
    combat.calmWatersMagicBonus = Math.min(12, (combat.calmWatersMagicBonus || 0) + 4);
    combat.calmWatersTurns = 2;
    lines.push(`Calm Waters settles over you — +4 Defense, +4 Magic for 2 rounds.`);
  }
  return lines;
}

// Mercy of the Veil (Regalia of the Final Veil 4pc): the first time each
// combat the player's Health drops below 40%, every active status is
// removed outright. Checked anywhere player Health just changed downward,
// the same reactive-safety-net pattern Hold the Line/Rooted Resolve use.
function checkMercyOfTheVeil(state) {
  const combat = state.combat;
  if (!combat || !hasEffect(state, "mercy_of_the_veil") || combat.mercyOfTheVeilUsed) return [];
  if (state.health > state.maxHealth * 0.4) return [];
  combat.mercyOfTheVeilUsed = true;
  const hadAny = Object.keys(combat.playerStatuses || {}).length > 0;
  combat.playerStatuses = {};
  return hadAny ? [`Mercy of the Veil strips away every affliction clinging to you.`] : [];
}

// Living Steel (Mythic): +1 Attack and +1 Defense every 3rd combat action,
// capped at +5/+5. Reuses combat.actionCounter (already incremented by
// applyHeartwoodVitality/beginTurn), so it fires on the exact same
// cadence Heartwood Vitality does. The Attack half is added directly in
// rollPlayerDamage's atk line; the Defense half lives in effectivePlayerDef.
function applyLivingSteel(state) {
  const combat = state.combat;
  if (!hasEffect(state, "living_steel") || combat.actionCounter % 3 !== 0 || combat.livingSteelBonus >= 5) return [];
  combat.livingSteelBonus += 1;
  return [`Living Steel hardens further — +1 Attack, +1 Defense (now +${combat.livingSteelBonus}/+${combat.livingSteelBonus}).`];
}

// Perfect Balance (Legendary): whenever base Attack and Defense are within
// 2 points of each other, +2 to both during combat. Checked against the
// character's raw stats, not already-boosted combat values, so the bonus
// can't recursively push itself in or out of range.
function perfectBalanceBonus(state) {
  if (!hasEffect(state, "perfect_balance")) return 0;
  return Math.abs(state.atk - state.def) <= 2 ? 2 : 0;
}

// Kingslayer (Legendary): +25% damage against Elite/Boss-equivalent
// creatures — now a direct read of the real Danger Class/Spawn Rarity
// tags (see data/creaturetags.js isNotableCreature) instead of the old
// tier>=4-or-unique proxy.
function kingslayerMultiplier(state, creature) {
  if (!hasEffect(state, "kingslayer")) return 1;
  const bonus = masterOfArmsDoubles(state, "kingslayer") ? 1.5 : 1.25;
  return isNotableCreature(creature) ? bonus : 1;
}

// Hunter's Instinct (Legendary): +30% damage on the very first action of
// each fight. combat.actionCounter is incremented by beginTurn() before
// any damage roll happens, so a value of 1 here means "this is the first
// action that's executed this fight."
function huntersInstinctMultiplier(state) {
  if (!hasEffect(state, "hunters_instinct")) return 1;
  const bonus = masterOfArmsDoubles(state, "hunters_instinct") ? 1.6 : 1.3;
  return state.combat && state.combat.actionCounter === 1 ? bonus : 1;
}

// Momentum (Legendary): each of the player's own damage rolls this fight
// stacks +10% onto the next one, capped at +50% (5 stacks) — incremented
// once per rollPlayerDamage call, so normal attacks, Ambush, Disarm,
// elemental abilities, and Riposte all build the same stack. Reset by
// startCombat.
function momentumMultiplier(state) {
  if (!hasEffect(state, "momentum")) return 1;
  const stacks = (state.combat && state.combat.momentumStacks) || 0;
  return 1 + Math.min(stacks, 5) * 0.1;
}

// Master Duelist (Legendary): enemy counterattacks (physical or
// elemental) deal 25% less damage — applied alongside Shield Wall at
// every point the player actually takes retaliation damage.
function applyMasterDuelist(state, dmg) {
  if (!hasEffect(state, "master_duelist")) return dmg;
  return Math.round(dmg * 0.75);
}

// Arcane Overflow (Mythic): elemental ability damage rolls get an
// additional flat 1.5x — mage-only, folded into rollPlayerDamage's magic
// branch alongside the other multipliers.
function arcaneOverflowMultiplier(state) {
  if (!hasEffect(state, "arcane_overflow")) return 1;
  return masterOfArmsDoubles(state, "arcane_overflow") ? 2.0 : 1.5;
}

// Execution Protocol (Mythic): a harsher, independent Executioner —
// 2x damage (not 1.2x) at 20% Health (not 30/40%). Stacks multiplicatively
// with Executioner if a character somehow has both.
function executionProtocolMultiplier(state) {
  if (!hasEffect(state, "execution_protocol") || !state.combat) return 1;
  const mult = masterOfArmsDoubles(state, "execution_protocol") ? 3 : 2;
  return state.combat.hp <= state.combat.maxHp * 0.2 ? mult : 1;
}

// Temporal Echo (Mythic): every 5th combat action deals double damage.
// Reuses combat.actionCounter (already incremented once per action by
// beginTurn before any damage roll happens), so this folds into the same
// multiplication chain as Momentum/Hunter's Instinct rather than needing
// its own "replay the action" logic.
function temporalEchoMultiplier(state) {
  if (!hasEffect(state, "temporal_echo") || !state.combat) return 1;
  const mult = masterOfArmsDoubles(state, "temporal_echo") ? 3 : 2;
  return state.combat.actionCounter > 0 && state.combat.actionCounter % 5 === 0 ? mult : 1;
}

// River Warden's 6pc set bonus (+2 Magic per "resist," max +8) is a
// combat-scoped bonus to the Magic stat itself, so it needs its own
// accessor the same way Defense has effectivePlayerDef — only
// rollPlayerDamage's magic-branch math reads this, not burn/heal/
// Stoneskin amounts (a narrower scope than a real stat change, by design).
function effectiveMagic(state) {
  const combat = state.combat;
  const magicBuff = combat && combat.magicBuffTurns > 0 ? combat.magicBuffAmount || 0 : 0;
  const everyChoiceMagic = ((combat && combat.everyChoiceMagicStacks) || 0) * 2;
  const endlessStudyMagic = (combat && combat.endlessStudyMagicBonus) || 0;
  // Expanding Mind (Divine Regalia — Vestments of the First Scholar): a
  // live formula off the CURRENT Knowledge stat (every 5 above 50 grants
  // +1 Magic), not a stacking/triggered bonus like the others here.
  // Avatar of Knowledge's (Endless Archive 6pc) "+25 Knowledge" feeds this
  // formula specifically, rather than being threaded through every
  // ability-unlock knowledgeReq check across the codebase for a single
  // 4-round buff — a deliberate scope limit.
  // Winds of Change (Divine Regalia — Garments of the Wandering Breeze) and
  // Avatar of Chaos (Regalia of the Laughing Gale 6pc) both also feed
  // Expanding Mind's Knowledge input, alongside Avatar of Knowledge above —
  // the same deliberate scope limit (this formula only, not every
  // knowledgeReq gate in the codebase).
  // Perfect Memory (Divine Regalia — Robes of Endless Record) also feeds
  // this same Knowledge input, the same deliberate scope limit as above.
  const effectiveKnowledgeForExpandingMind = state.knowledge + ((combat && combat.knowledgeBuffAmount) || 0) + ((combat && combat.windsOfChangeKnowledge) || 0) + ((combat && combat.avatarOfChaosKnowledgeBonus) || 0) + ((combat && combat.perfectMemoryKnowledgeBonus) || 0);
  const expandingMindMagic = hasEffect(state, "expanding_mind") ? Math.floor(Math.max(0, effectiveKnowledgeForExpandingMind - 50) / 5) : 0;
  const unwaveringDevotionMagic = ((combat && combat.unwaveringDevotionStacks) || 0) * 2;
  const windsOfChangeMagic = (combat && combat.windsOfChangeMagic) || 0;
  const avatarOfChaosMagic = (combat && combat.avatarOfChaosMagicBonus) || 0;
  const workRefinesMagic = (combat && combat.workRefinesMagicStacks) || 0;
  const avatarOfCreationMagic = (combat && combat.avatarOfCreationMagicStacks) || 0;
  // Calm Waters (Regalia): a temporary Magic bonus granted whenever
  // Cleansing Current clears a status — see applyStatusCleanseOnHeal.
  const calmWatersMagic = combat && combat.calmWatersTurns > 0 ? combat.calmWatersMagicBonus || 0 : 0;
  return state.magic + ((combat && combat.riverWardenMagicBonus) || 0) + ((combat && combat.livingCurrentStacks) || 0) * 2 + magicBuff + everyChoiceMagic + endlessStudyMagic + expandingMindMagic + unwaveringDevotionMagic + windsOfChangeMagic + avatarOfChaosMagic + workRefinesMagic + avatarOfCreationMagic + calmWatersMagic;
}

// Central heal entry point (Divine Regalia): every place that restores the
// player's Health — Regrowth, Blood Debt, Soul Leech, Heartwood Vitality,
// Water's self-heal, Endless Bloom, Blessing of Renewal, resting, and
// talking down a friendly creature — routes through here instead of
// touching state.health directly, so Flourishing Soul's +50% healing-
// received and Living Current's per-heal Magic stack apply uniformly
// everywhere, and Overflowing Life's overflow-to-Temporary-Health
// conversion lives in one place instead of being reimplemented at each
// call site. Does NOT cover the Elder Bark/Last Stand cheat-death resets
// (those set Health to 1 from a lethal hit — a survival mechanic, not a
// restorative heal, so they're deliberately left as direct assignments).
// Returns the actual amount healed (after Flourishing Soul, clamped to
// max) so the caller's own flavor line can report the real number, plus
// any extra lines (Overflowing Life's conversion message) to append.
function applyHeal(state, amount) {
  if (amount <= 0) return { healed: 0, lines: [] };
  let amt = amount;
  if (hasEffect(state, "flourishing_soul")) amt = Math.round(amt * 1.5);
  // Blessing of Compassion (Regalia of the Eternal Heart 2pc): +25%
  // healing received, stacking multiplicatively with Flourishing Soul if
  // a character somehow has both. Its "removes one minor negative status
  // effect" clause is a no-op — nothing in this engine ever applies a
  // negative status effect to the player (same reasoning as Immutable).
  if (hasSetTier(state, "Regalia of the Eternal Heart", 2)) amt = Math.round(amt * 1.25);
  const combat = state.combat;
  // Avatar of Devotion (Regalia of the Eternal Heart 6pc): all healing
  // doubled for its 4-round window, stacking multiplicatively on top of
  // Flourishing Soul/Blessing of Compassion above.
  if (combat && combat.avatarOfDevotionTurns > 0) amt = Math.round(amt * 2);
  // Avatar of Endurance (Regalia of the Eternal Bastion 6pc): +50% healing
  // received for its 4-round window, stacking multiplicatively on top of
  // everything above.
  if (combat && combat.avatarOfEnduranceTurns > 0) amt = Math.round(amt * 1.5);
  // Mercy's Gift (Divine Regalia — Ring of Gentle Rain): a live check
  // against CURRENT Health (not a triggered/stacking buff) — +50% healing
  // received for as long as Health is below 50% max, checked fresh on
  // every single heal rather than latched on until recovery.
  if (hasEffect(state, "mercys_gift") && state.health < state.maxHealth * 0.5) amt = Math.round(amt * 1.5);
  const before = state.health;
  state.health = Math.min(state.maxHealth, state.health + amt);
  const healed = state.health - before;
  const lines = [];
  const overflow = amt - healed;
  if (overflow > 0 && combat && hasSetTier(state, "Regalia of the First Bloom", 4)) {
    const cap = Math.round(state.maxHealth * 0.3);
    const beforeTemp = combat.tempHealth || 0;
    combat.tempHealth = Math.min(cap, beforeTemp + overflow);
    if (combat.tempHealth > beforeTemp) {
      lines.push(`Overflowing Life — the excess crystallizes into ${combat.tempHealth - beforeTemp} Temporary Health.`);
    }
  }
  if (healed > 0 && combat && hasEffect(state, "living_current")) {
    combat.livingCurrentStacks = Math.min(5, (combat.livingCurrentStacks || 0) + 1);
  }
  // Compassion's Grace (Divine Regalia — Roseheart Scepter): whenever you
  // restore Health, also gain +2 Defense, capped +10 (5 stacks). The
  // source text says "for 2 rounds," but this engine has no precedent for
  // independent per-stack expiry (every other stacking bonus here —
  // Living Steel, Every Choice Matters, Battle Tempered — is permanent
  // for the rest of the fight once gained), so it's approximated the same
  // way for consistency.
  if (healed > 0 && combat && hasEffect(state, "compassions_grace")) {
    combat.compassionsGraceDefStacks = Math.min(5, (combat.compassionsGraceDefStacks || 0) + 1);
  }
  // Endless Current (Regalia of the Endless Tide 4pc): whenever you
  // remove a negative effect (never happens — no such mechanic exists;
  // see Cleansing Current/Calm Waters) or restore Health, gain +2
  // Attack/+2 Defense/+2 Magic for 3 rounds, stacking up to +10 in each
  // (5 stacks) — its own dedicated stack counter (rather than a plain
  // "+2 flat" like Rally the Line) since this one genuinely stacks in
  // magnitude across repeated procs, not just refreshes duration.
  if (healed > 0 && combat && hasSetTier(state, "Regalia of the Endless Tide", 4)) {
    combat.endlessCurrentStacks = Math.min(5, (combat.endlessCurrentStacks || 0) + 1);
    const dur = applyBeneficialEffectBonuses(state, 3);
    const grant = applyBlessingOfCreationBonus(state, combat.endlessCurrentStacks * 2);
    combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
    combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, grant);
    combat.defBuffTurns = Math.max(combat.defBuffTurns, dur);
    combat.defBuffAmount = Math.max(combat.defBuffAmount, grant);
    combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
    combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, grant);
  }
  // Avatar of Devotion: whenever you restore Health during its window,
  // immediately gain +5 Attack/+5 Magic/+5 Defense for 2 rounds.
  if (healed > 0 && combat && combat.avatarOfDevotionTurns > 0) {
    combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, 2);
    combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, 5));
    combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, 2);
    combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, 5));
    combat.defBuffTurns = Math.max(combat.defBuffTurns, 2);
    combat.defBuffAmount = Math.max(combat.defBuffAmount, applyBlessingOfCreationBonus(state, 5));
  }
  // Cleansing Current / Calm Waters (Regalia): now genuinely live —
  // combat.playerStatuses (Enemy Ability Engine) means there's finally
  // something for a heal to cleanse. See applyStatusCleanseOnHeal.
  if (healed > 0 && combat) lines.push(...applyStatusCleanseOnHeal(state));
  return { healed, lines };
}

// Consumables (data/items.js's slot: "consumable"): usable in or out of
// combat. Outside a fight it's a free, instant action (nothing around to
// react to it). Mid-fight, using one is a full turn exactly like any Tactic or
// Elemental Ability — faster enemies still get their pre-emptive strike,
// and the whole pack still gets its normal retaliation afterward. Without
// this, a potion would be a risk-free way to heal that never lets the
// enemy respond, unlike literally every other action in this engine.
// arg is matched the same partial/case-insensitive way as cmdEquip/cmdDrop.
function useItem(state, arg) {
  if (!arg) return ["Use what?"];
  const needle = arg.toLowerCase();
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(needle));
  if (idx < 0) return [`You aren't carrying "${arg}".`];
  const item = state.inventory[idx];
  const def = getItemDef(item);
  if (!def || def.slot !== "consumable") return [`${item} isn't something you can use like that.`];

  if (!state.combat) {
    state.inventory.splice(idx, 1);
    return applyConsumableEffect(state, item, def.useEffect);
  }

  let creature = getCombatCreature(state);
  const out = beginTurn(state);
  // beginTurn can itself end the fight — a burn/bleed tick on a non-active
  // pack member (or the active one) can finish it off before this action
  // even resolves.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;

  state.inventory.splice(idx, 1);
  out.push(...applyConsumableEffect(state, item, def.useEffect));
  if (!state.combat || state.health <= 0) return out;

  const retaliation = resolveOrSkipRetaliation(state, creature, 2, 0);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// Branches on useEffect.type — currently just "heal" (through the shared
// applyHeal entry point, so Flourishing Soul/Avatar of Devotion/etc. all
// apply to a potion's heal exactly like any other heal source), with a
// harmless fallback for a consumable authored without one yet.
function applyConsumableEffect(state, item, effect) {
  if (!effect) return [`You use ${item}, but nothing happens.`];
  if (effect.type === "heal") {
    const amount = Math.ceil(state.maxHealth * effect.pct);
    const { healed, lines } = applyHeal(state, amount);
    return [`You drink ${item}, mending ${healed} health.`, ...lines];
  }
  return [`You use ${item}, but nothing happens.`];
}

// Whether the player is carrying at least one usable consumable — gates
// whether "use" is worth suggesting in the tactics/options hint lines.
function hasUsableConsumable(state) {
  return state.inventory.some((i) => {
    const def = getItemDef(i);
    return def && def.slot === "consumable";
  });
}

// Legion's Shield Wall (4pc): a flat -10% on ALL incoming damage, applied
// last after every other reduction (Defense, Spell Ward, etc.) — used at
// every point the player actually takes damage (both branches of
// resolveEnemyRetaliation, and attemptFlee's failed-flee hit).
function applyShieldWall(state, dmg) {
  if (!hasSetTier(state, "Legion", 4)) return dmg;
  return Math.round(dmg * 0.9);
}

// Executioner (finisher damage vs. a badly wounded target) is checked
// once here since it applies uniformly to physical and magic damage
// alike — everything else in rollPlayerDamage is physical-only.
// executionerThreshold (data/sets.js) resolves which sets widen it.
function executionerMultiplier(state) {
  if (!hasEffect(state, "executioner")) return 1;
  const combat = state.combat;
  return combat.hp <= combat.maxHp * executionerThreshold(state) ? 1.2 : 1;
}

// Dragonslayer (Drake Hunter 6pc): a final multiplier against creatures
// tagged draven (Drake, Dragon), "applied after all other damage
// calculations" per its own spec — so it's applied last, outside both
// branches below rather than folded into either one's own math.
function dragonslayerMultiplier(state, creature) {
  if (creature.monsterTag !== "draven") return 1;
  return hasSetTier(state, "Drake Hunter", 6) ? 1.2 : 1;
}

// Bleed Exploitation (Bonecaller 6pc): +20% damage while the TARGET is
// currently bleeding (state.combat.bleed is the Deep Cut DoT the player
// already inflicted on it).
function bleedExploitationMultiplier(state) {
  if (!state.combat || !state.combat.bleed) return 1;
  return hasSetTier(state, "Bonecaller", 6) ? 1.2 : 1;
}

// Siege Corps's 6pc set bonus grants a one-shot +2 Attack "next turn"
// whenever Brace fires (see useFeint/useElementAbility's earth case) —
// consumed by whichever physical damage roll comes next, wherever that is.
function consumeSiegeCorpsAtkCharge(state) {
  if (!state.combat || !state.combat.siegeCorpsAtkCharge) return 0;
  state.combat.siegeCorpsAtkCharge = 0;
  return 2;
}

// Foreseen Strike (Divine Regalia — Loom of Destinies): every 3rd action
// (any physical attack or elemental cast — shares combat.actionCounter,
// already incremented once per action by beginTurn) ignores 50% of the
// target's effective Defense. Its "cannot miss" clause is trivially
// already true — the player's own attacks in this engine always deal at
// least 1 damage, with no miss/failure state to bypass.
function foreseenStrikeDefMultiplier(state) {
  return hasEffect(state, "foreseen_strike") && state.combat && state.combat.actionCounter > 0 && state.combat.actionCounter % 3 === 0 ? 0.5 : 1;
}

// Minimal player-side critical hit system (Divine Regalia — Blessing of
// Guidance / Avatar of Fate / Blessing of Insight). Nothing in this
// engine crit before Veylana's set, so it's scoped to exactly what these
// effects need: Blessing of Guidance (Woven Thread 2pc) is a one-shot
// +25% on the very first action of the fight (mirrors Hunter's Instinct's
// actionCounter === 1 check); Blessing of Insight (Endless Archive 2pc)
// is an unconditional +20% on every SPELL cast specifically (isSpell
// param), stacking additively with Blessing of Guidance if a character
// somehow has both. Avatar of Fate never grants chance, only doubles the
// bonus (+50% -> +100%) if a crit happens to land during its own 4-round
// window elsewhere.
function critMultiplier(state, isSpell) {
  const combat = state.combat;
  if (!combat) return 1;
  // Unlikely Outcome (Divine Regalia — Ring of Lucky Misfortune): consumes
  // its guaranteed-crit flag (set by applyLaughingGaleMissBonuses, below)
  // ahead of every other chance-based source — a guarantee, not a chance.
  if (combat.unlikelyOutcomeGuaranteedCrit) {
    combat.unlikelyOutcomeGuaranteedCrit = false;
    return combat.avatarOfFateTurns > 0 ? 2.0 : 1.5;
  }
  let chance = 0;
  if (hasSetTier(state, "Regalia of the Woven Thread", 2) && combat.actionCounter === 1) chance += 0.25;
  if (isSpell && hasSetTier(state, "Regalia of the Endless Archive", 2)) chance += 0.2;
  // Blessing of Fortune (Regalia of the Laughing Gale 2pc): +5% Critical
  // Chance per successful crit this fight, capped at +25% (5 stacks) — the
  // stack itself grows in rollPlayerDamage, right after this function's
  // result is read for the current hit.
  if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) chance += Math.min(combat.blessingOfFortuneCritStacks || 0, 5) * 0.05;
  // Avatar of Chaos (Regalia of the Laughing Gale 6pc): doubles whatever
  // crit chance is on offer for its 4-round window.
  if (combat.avatarOfChaosTurns > 0) chance *= 2;
  if (chance <= 0 || Math.random() >= chance) return 1;
  return combat.avatarOfFateTurns > 0 ? 2.0 : 1.5;
}

// Loaded Dice (Divine Regalia — Trickster's Cane): a flat 20% chance per
// attack/spell to land on one of two equally-likely extremes — half
// damage or double damage — folded into rollPlayerDamage's multiplier
// chain like every other damage multiplier here. The favorable (double)
// outcome also counts as "a random effect favors you" for Twist of Fate
// (Regalia of the Laughing Gale 4pc); that follow-up fires and heals/eases
// a cooldown silently here, the same precedent Soul Leech/Avatar of War's
// leech already set for roll-time side effects with no narration channel
// of their own.
function loadedDiceMultiplier(state) {
  if (!hasEffect(state, "loaded_dice") || !state.combat) return 1;
  if (Math.random() >= 0.2) return 1;
  if (Math.random() < 0.5) {
    applyTwistOfFate(state);
    return 2.0;
  }
  return 0.5;
}

// Avatar of Chaos (Regalia of the Laughing Gale 6pc): for its 4-round
// window, every hit's damage is randomized between 75% and 175% —
// independent of, and stacking with, Loaded Dice's own occasional swing.
function avatarOfChaosDamageMultiplier(state) {
  return state.combat && state.combat.avatarOfChaosTurns > 0 ? 0.75 + Math.random() : 1;
}

// Precision Formula (Divine Regalia — Gloves of Careful Script): magic
// attacks ignore 30% of the target's effective Defense (this engine has
// no separate "Magic Resistance" stat — creature.def is the same field
// both branches of rollPlayerDamage already read).
function precisionFormulaMultiplier(state) {
  return hasEffect(state, "precision_formula") ? 0.7 : 1;
}

// Avatar of Knowledge (Regalia of the Endless Archive 6pc): for its
// 4-round window, elemental matchup penalties are ignored (floor to 1)
// and advantages are flattened to exactly 1.5x (overriding Fragmenta
// 6pc's own 1.5x the same way, and actually a slight boost over the
// normal 1.3x otherwise).
function avatarOfKnowledgeMatchupOverride(state, matchup) {
  if (!state.combat || !(state.combat.avatarOfKnowledgeTurns > 0)) return matchup;
  if (matchup < 1) return 1;
  if (matchup > 1) return 1.5;
  return matchup;
}

// Endless Study (Divine Regalia — Codex of Infinite Horizons): the FIRST
// time each DISTINCT ability/tactic is used in a fight grants +2 Magic
// permanently for that fight, capped at +20 (10 distinct actions) — more
// than any single character actually has access to (at most ~5 fighter
// tactics or ~4 mage elements), so the cap is generous headroom rather
// than a real constraint. Called from every action's entry point
// (playerAttack, useFeint/useDecoy/useAmbush/useDisarm, useElementAbility)
// with its own distinguishing key.
function applyEndlessStudy(state, actionKey) {
  if (!hasEffect(state, "endless_study") || !state.combat) return [];
  const combat = state.combat;
  if (!combat.endlessStudyKeys) combat.endlessStudyKeys = [];
  if (combat.endlessStudyKeys.includes(actionKey) || (combat.endlessStudyMagicBonus || 0) >= 20) return [];
  combat.endlessStudyKeys.push(actionKey);
  combat.endlessStudyMagicBonus = Math.min(20, (combat.endlessStudyMagicBonus || 0) + 2);
  return [`Endless Study — a new technique, understood; +2 Magic (now +${combat.endlessStudyMagicBonus}).`];
}

// Prepared Response (Divine Regalia — Librarian's Ward): the enemy in
// this engine only ever has ONE retaliation "ability" (its fixed physical
// or elemental attack), so "an ability you've already witnessed" is
// trivially true from the SECOND enemy retaliation onward — reduces that
// and every later hit by 25%.
function preparedResponseMultiplier(state) {
  if (!hasEffect(state, "prepared_response") || !state.combat) return 1;
  const combat = state.combat;
  if (!combat.preparedResponseWitnessed) {
    combat.preparedResponseWitnessed = true;
    return 1;
  }
  return 0.75;
}

// Shared Burden (Divine Regalia — Heartward Embrace): the first time each
// combat an incoming hit would exceed 30% of max Health, reduce that
// specific hit by 40%. A one-shot magnitude-triggered reduction, checked
// against the RAW incoming damage before this multiplier applies.
function sharedBurdenMultiplier(state, dmg) {
  if (!hasEffect(state, "shared_burden") || !state.combat) return 1;
  const combat = state.combat;
  if (combat.sharedBurdenUsed || dmg <= state.maxHealth * 0.3) return 1;
  combat.sharedBurdenUsed = true;
  return 0.6;
}

// Calming Presence (Divine Regalia — Cloak of Gentle Light): enemies deal
// 10% less damage during the first three rounds of combat — reuses the
// shared combat.actionCounter (already incremented once per action).
function calmingPresenceMultiplier(state) {
  return hasEffect(state, "calming_presence") && state.combat && state.combat.actionCounter > 0 && state.combat.actionCounter <= 3 ? 0.9 : 1;
}

// Avatar of Devotion (Regalia of the Eternal Heart 6pc): a flat 35% cut
// to all incoming damage for its 4-round window, layered into the same
// chain as Shield Wall/Master Duelist/Unbroken Line/Prepared Response/
// Calming Presence above.
function avatarOfDevotionDamageMultiplier(state) {
  return state.combat && state.combat.avatarOfDevotionTurns > 0 ? 0.65 : 1;
}

// Blessing of Stone (Regalia of the Eternal Bastion 2pc): 15% Damage
// Reduction whenever current Health is above 50% max — a live, unconditional
// check against the CURRENT Health at the moment the hit lands (not a
// once-per-fight or stacking effect), layered into the same chain as
// Avatar of Devotion above.
function blessingOfStoneMultiplier(state) {
  return hasSetTier(state, "Regalia of the Eternal Bastion", 2) && state.health > state.maxHealth * 0.5 ? 0.85 : 1;
}

// Avatar of Endurance (Regalia of the Eternal Bastion 6pc): a flat 50% cut
// to all incoming damage for its 4-round window — the strongest of the
// eight "Avatar of X" damage-reduction effects, fitting for the most
// defensively-themed god's own capstone.
function avatarOfEnduranceDamageMultiplier(state) {
  return state.combat && state.combat.avatarOfEnduranceTurns > 0 ? 0.5 : 1;
}

// Avatar of Renewal (Regalia of the Endless Tide 6pc): a flat 30% cut to
// all incoming damage for its 4-round window, layered into the same
// chain as the other "Avatar of X" damage-reduction effects.
function avatarOfRenewalDamageMultiplier(state) {
  return state.combat && state.combat.avatarOfRenewalTurns > 0 ? 0.7 : 1;
}

// Adaptive Tide (Divine Regalia — Vestments of the Endless Sea): -5% to a
// specific damage TYPE per stack, capped at 5 stacks (-25%), grown
// separately per type (physical vs magic — the only two incoming-damage
// types that actually reach the player in this engine; "Burn," cited as
// an example in the source text, is a DoT the player only ever inflicts
// on enemies, never receives, so there's a third bucket with nothing to
// ever grow it). Stacks grow in resolveEnemyRetaliation, right after each
// branch's damage is finalized.
function adaptiveTidePhysicalMultiplier(state) {
  if (!hasEffect(state, "adaptive_tide") || !state.combat) return 1;
  return 1 - Math.min(state.combat.adaptiveTidePhysicalStacks || 0, 5) * 0.05;
}
function adaptiveTideMagicMultiplier(state) {
  if (!hasEffect(state, "adaptive_tide") || !state.combat) return 1;
  return 1 - Math.min(state.combat.adaptiveTideMagicStacks || 0, 5) * 0.05;
}

// Unyielding Wall (Divine Regalia — Bulwark of Ages): the first hit that
// would exceed 25% of max Health instead deals exactly 25%, usable again
// every 3 rounds (unlike Shared Burden's once-per-fight gate) — a direct
// damage-value cap rather than a percentage multiplier, so it's applied
// as the very last step in the chain, on the fully-mitigated damage value.
function applyUnyieldingWall(state, dmg) {
  if (!hasEffect(state, "unyielding_wall") || !state.combat) return dmg;
  const combat = state.combat;
  if ((combat.unyieldingWallCooldown || 0) > 0) return dmg;
  const cap = Math.round(state.maxHealth * 0.25);
  if (dmg <= cap) return dmg;
  combat.unyieldingWallCooldown = 3;
  return cap;
}

// Momentum Unbound (Divine Regalia — Galecaller): +5% damage per stack,
// capped at +30% (6 stacks). The source text says each stack lasts "2
// rounds," but this engine has no precedent for independent per-stack
// expiry (every other stacking bonus here — Living Steel, Every Choice
// Matters, Battle Tempered, Compassion's Grace — is permanent for the
// rest of the fight once gained), so it's approximated the same way for
// consistency. Stacks are grown in applyActionTypeTracking below.
function momentumUnboundMultiplier(state) {
  if (!hasEffect(state, "momentum_unbound") || !state.combat) return 1;
  return 1 + Math.min(state.combat.momentumUnboundStacks || 0, 6) * 0.05;
}

// Tempered Steel (Divine Regalia — Forgefather's Hammer): +2% damage per
// successful attack (physical or spell — rollPlayerDamage is the single
// shared roll for both, and every existing per-hit stacking bonus here
// already treats "attack" uniformly across both branches), permanent for
// the rest of the fight, capped at +30% (15 stacks). Stacks grow after
// the roll, at the bottom of rollPlayerDamage.
function temperedSteelMultiplier(state) {
  if (!hasEffect(state, "tempered_steel") || !state.combat) return 1;
  return 1 + Math.min(state.combat.temperedSteelStacks || 0, 15) * 0.02;
}

// Master Craftsman (Divine Regalia — Smith's Grasp): +20% damage whenever
// the effective Attack used for THIS physical hit exceeds the enemy's
// (raw) Defense by 10 or more — a live, per-hit threshold check rather
// than a stacking bonus, scoped to the physical branch only (an
// Attack-vs-Defense comparison has no equivalent meaning for a Magic-vs-
// Defense spell roll).
function masterCraftsmanMultiplier(atk, creature) {
  return atk - creature.def >= 10 ? 1.2 : 1;
}

// Borrowed Seconds (Divine Regalia — Epochkeeper): every 4th action
// either refunds 50% of the cooldown it just set (Feint/Decoy/Disarm/an
// elemental cast) or, if the action has no cooldown at all (a plain
// Attack or Ambush), grants +15% damage to that same hit instead. A
// read-only check (no "used" flag) — "every 4th action" is naturally
// self-gating via the modulus, the same shape Calming Presence/Work
// Refines already use.
function borrowedSecondsActive(state) {
  return hasEffect(state, "borrowed_seconds") && state.combat && state.combat.actionCounter > 0 && state.combat.actionCounter % 4 === 0;
}

// Timeless Guard (Divine Regalia — Chronal Dial): the first incoming
// attack every 3 rounds deals 0 damage entirely — a full negation
// (unlike Unyielding Wall's damage CAP), on its own 3-round recharge
// (unlike Shared Burden's once-per-fight gate). Checked (and, on
// success, its own cooldown reset) at the very top of
// resolveEnemyRetaliation, before any of the other evasion/miss checks.
function applyTimelessGuard(state) {
  if (!hasEffect(state, "timeless_guard") || !state.combat) return false;
  const combat = state.combat;
  if ((combat.timelessGuardCooldown || 0) > 0) return false;
  combat.timelessGuardCooldown = 3;
  return true;
}

// Blessing of Creation (Regalia of the Eternal Forge 2pc): +25% to the
// MAGNITUDE of any temporary (duration-based) stat bonus granted —
// scoped specifically to the atk/magic/defBuffAmount-style buffs that
// already funnel through the shared Turns-based buff fields (Hold the
// Line, Rooted Resolve, Rally the Line, the various "Avatar of X"
// bursts, Wanderer's Reward, Ever Forward), NOT the separate permanent-
// for-the-fight stacking counters (Battle Tempered, Living Current,
// Every Choice Matters, Tempered Steel, Reinforced, Work Refines, etc.)
// — those are a different category ("permanent," not "temporary"),
// matching the source text's own word choice. Retrofitted into every
// existing call site that sets one of the shared buff-amount fields, the
// same "touch every enumerable call site" precedent
// applyBeneficialEffectBonuses already established for duration.
function applyBlessingOfCreationBonus(state, amount) {
  return hasSetTier(state, "Regalia of the Eternal Forge", 2) ? Math.round(amount * 1.25) : amount;
}

// Momentum Unbound (Divine Regalia — Galecaller) and Ever Forward
// (Regalia of the Endless Horizon 4pc) both track the same broad
// 3-category action-type signal ("attack", "tactic", or "elemental" —
// never a finer-grained key than that, unlike Wanderer's Reward/Endless
// Study below, which key off the SPECIFIC ability used instead of its
// category). Called at the same 6 action-entry points as
// applyEndlessStudy, right alongside it, with the same category string
// every one of those call sites already passes for that purpose.
function applyActionTypeTracking(state, actionType) {
  if (!state.combat) return [];
  const combat = state.combat;
  const lines = [];
  if (hasEffect(state, "momentum_unbound") && combat.lastActionType && combat.lastActionType !== actionType && (combat.momentumUnboundStacks || 0) < 6) {
    combat.momentumUnboundStacks = (combat.momentumUnboundStacks || 0) + 1;
    lines.push(`Momentum Unbound builds — the shift in rhythm adds +5% damage (now +${combat.momentumUnboundStacks * 5}%).`);
  }
  combat.lastActionType = actionType;
  combat.actionTypeHistory = [...(combat.actionTypeHistory || []), actionType].slice(-3);
  if (hasSetTier(state, "Regalia of the Endless Horizon", 4) && combat.actionTypeHistory.length === 3 && new Set(combat.actionTypeHistory).size === 3) {
    const dur = applyBeneficialEffectBonuses(state, 3);
    combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
    combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, 10));
    combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
    combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, 10));
    lines.push(`Ever Forward — three strides, three shapes; +10 Attack, +10 Magic for ${dur} rounds.`);
  }
  return lines;
}

// Wanderer's Reward (Divine Regalia — Ring of Far Horizons): whenever the
// SPECIFIC ability/tactic used (the same granular actionKey Endless Study
// already keys off, not the broad 3-category type applyActionTypeTracking
// above uses) hasn't been used in either of the previous two turns, gain
// +4 Attack/+4 Magic for 2 rounds. Reads the rolling window BEFORE this
// action joins it, so the current action never counts as its own
// "previous" use. "An ability" is read to include the plain Attack too —
// the same generic actionKey Endless Study already treats uniformly.
function applyWanderersReward(state, actionKey) {
  if (!hasEffect(state, "wanderers_reward") || !state.combat) return [];
  const combat = state.combat;
  const recent = combat.recentActionKeys || [];
  const lines = [];
  if (!recent.includes(actionKey)) {
    const dur = applyBeneficialEffectBonuses(state, 2);
    combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
    combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, 4));
    combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
    combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, 4));
    lines.push(`Wanderer's Reward — new ground, new strength; +4 Attack, +4 Magic for ${dur} rounds.`);
  }
  combat.recentActionKeys = [actionKey, ...recent].slice(0, 2);
  return lines;
}

// Perfect Memory (Divine Regalia — Robes of Endless Record): the first
// time each DISTINCT Tactic or Elemental Ability is used in a fight
// grants +2 Knowledge permanently for that combat, capped at +16 (8
// distinct actions) — Endless Study's exact shape, but scoped to
// Tactics/Elemental Abilities only (never plain Attack, unlike Endless
// Study/Wanderer's Reward's broader actionKey), so it uses its own
// separate tracking list rather than piggybacking on
// combat.endlessStudyKeys. Called only from the tactic/elemental-ability
// action functions, never from playerAttack.
function applyPerfectMemory(state, actionKey) {
  if (!hasEffect(state, "perfect_memory") || !state.combat) return [];
  const combat = state.combat;
  if (!combat.perfectMemoryKeys) combat.perfectMemoryKeys = [];
  if (combat.perfectMemoryKeys.includes(actionKey) || (combat.perfectMemoryKnowledgeBonus || 0) >= 16) return [];
  combat.perfectMemoryKeys.push(actionKey);
  combat.perfectMemoryKnowledgeBonus = Math.min(16, (combat.perfectMemoryKnowledgeBonus || 0) + 2);
  return [`Perfect Memory — a new technique, remembered; +2 Knowledge (now +${combat.perfectMemoryKnowledgeBonus}).`];
}

// Trailblazer (Divine Regalia — Feather of the First Wind) and Avatar of
// Freedom (Regalia of the Endless Horizon 6pc) share the same "ignore
// this action's non-cooldown activation restrictions" bypass — Avatar of
// Freedom grants it for its whole 4-round window, Trailblazer grants it
// once (consumed by consumeTrailblazer below, right after the first
// Ability/Tactic that actually goes on to resolve). Read at every
// restriction gate EXCEPT cooldowns, per both effects' own wording
// ("cooldowns still apply normally").
function activationRestrictionsBypassed(state) {
  const combat = state.combat;
  if (!combat) return false;
  if (combat.avatarOfFreedomTurns > 0) return true;
  return hasEffect(state, "trailblazer") && !combat.trailblazerUsed;
}

// Consumes Trailblazer's one-time bypass, unconditionally, the moment any
// Ability/Tactic actually resolves — whether or not the bypass was
// actually needed for that particular use, the same "first use, no matter
// what" consumption Perfect Timing (Mythic) already established.
function consumeTrailblazer(state) {
  if (state.combat && hasEffect(state, "trailblazer") && !state.combat.trailblazerUsed) {
    state.combat.trailblazerUsed = true;
  }
}

// Open Road (Divine Regalia — Wayfinder's Compass) and Blessing of
// Freedom's (Regalia of the Endless Horizon 2pc) heal-on-evade both key
// off the same "the enemy's retaliation this turn dealt zero damage"
// signal Every Choice Matters/Threads of Consequence/Unlikely Outcome
// already use — called at the same 5 call sites as
// applyDodgeBlockNegateBonuses. Unlike Twist of Fate (Regalia of the
// Laughing Gale), which was deliberately scoped to only that set's OWN
// randomness to avoid overtriggering off unrelated procs, Aethyra's whole
// theme IS broad evasion itself, so both of these fire off any dodge/
// miss/block/negate/evasion, regardless of which effect actually caused it.
function applyEndlessHorizonEvasionBonuses(state) {
  if (!state.combat) return [];
  const combat = state.combat;
  const lines = [];
  if (hasEffect(state, "open_road")) {
    let eased = false;
    for (const key of Object.keys(combat.cooldowns)) {
      if (combat.cooldowns[key] > 0) {
        combat.cooldowns[key] -= 1;
        eased = true;
      }
    }
    if (eased) lines.push(`Open Road — the path clears; every active cooldown eases by a turn.`);
  }
  if (hasSetTier(state, "Regalia of the Endless Horizon", 2)) {
    const heal = Math.ceil(state.maxHealth * 0.05);
    if (heal > 0) {
      const { healed, lines: healLines } = applyHeal(state, heal);
      if (healed > 0) lines.push(`Blessing of Freedom mends you for ${healed} health.`, ...healLines);
    }
  }
  return lines;
}

// Worthy Challenge (Divine Regalia — Warfather's Edge): "the enemy with
// the highest current Health" is trivially always THE enemy in this
// engine's single-target combat model, so this is unconditional — every
// attack stacks +5% permanent damage for the rest of the fight, capped at
// +50% (10 stacks). Reads the stack BEFORE this hit (Momentum's own
// pattern), incremented after the roll below.
function worthyChallengeMultiplier(state) {
  if (!hasEffect(state, "worthy_challenge") || !state.combat) return 1;
  return 1 + Math.min(state.combat.worthyChallengeStacks || 0, 10) * 0.05;
}

// Blessing of Valor (Regalia of the Crimson Vanguard 2pc): the opening
// attack of the fight deals +30% damage — same actionCounter === 1 gate
// as Hunter's Instinct/critMultiplier. Its "restore 15% Health if it
// defeats the target" clause lives in resolveKill instead, since only
// resolveKill knows the hit was lethal.
function blessingOfValorMultiplier(state) {
  return hasSetTier(state, "Regalia of the Crimson Vanguard", 2) && state.combat && state.combat.actionCounter === 1 ? 1.3 : 1;
}

// Commanding Presence (Regalia of the Crimson Vanguard 4pc): every 3rd
// attack fully ignores the target's Defense (a stronger version of
// Foreseen Strike's 50% ignore — the two stack multiplicatively if a
// character somehow has both, which still just zeroes effective Defense
// either way). Its "cannot miss"/"cannot be blocked" clauses are
// trivially already true, the same reasoning as Foreseen Strike/Avatar of
// Fate's equivalent clauses.
function commandingPresenceDefMultiplier(state) {
  return hasSetTier(state, "Regalia of the Crimson Vanguard", 4) && state.combat && state.combat.actionCounter > 0 && state.combat.actionCounter % 3 === 0 ? 0 : 1;
}

// Faithful Heart (Divine Regalia — Ring of Sacred Vows) and Heartward
// Bond (Regalia of the Eternal Heart 4pc) both hook into the same "a
// beneficial (buff) effect was just granted" moment: Faithful Heart
// extends its duration by 1 round, Heartward Bond piggybacks +2 Attack/
// +2 Magic/+2 Defense for that same duration (via the shared atk/magic/
// defBuffTurns/Amount fields, Math.max-composed the same way every other
// temporary buff here already is — so this doesn't stack additively with
// itself across multiple simultaneous buffs, the same simplification
// those other buffs already make). Called at every place a temporary
// combat buff duration is set (Hold the Line, Rooted Resolve, the Avatar
// of X effects, Rally the Line, Endless Bloom's regen, Unbroken Line's
// damage reduction), returning the possibly-extended duration for that
// call site's own field.
function applyBeneficialEffectBonuses(state, duration) {
  const combat = state.combat;
  const d = duration + (hasEffect(state, "faithful_heart") ? 1 : 0);
  if (hasSetTier(state, "Regalia of the Eternal Heart", 4)) {
    combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, d);
    combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, 2);
    combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, d);
    combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, 2);
    combat.defBuffTurns = Math.max(combat.defBuffTurns, d);
    combat.defBuffAmount = Math.max(combat.defBuffAmount, 2);
  }
  return d;
}

function rollPlayerDamage(state, creature, activeElement) {
  const defPenalty = (state.combat && state.combat.enemyDefPenalty) || 0;
  const execMult = executionerMultiplier(state);
  const dragonMult = dragonslayerMultiplier(state, creature);
  const bleedMult = bleedExploitationMultiplier(state);
  const kingMult = kingslayerMultiplier(state, creature);
  const instinctMult = huntersInstinctMultiplier(state);
  const momentumMult = momentumMultiplier(state);
  const executionMult = executionProtocolMultiplier(state);
  const echoMult = temporalEchoMultiplier(state);
  const foreseenDefMult = foreseenStrikeDefMultiplier(state);
  const isSpell = state.flags.isMage && state.primaryElement;
  const critMult = critMultiplier(state, isSpell);
  const threadsMult = state.combat && state.combat.threadsOfConsequencePending ? 1.4 : 1;
  // Stone's Patience (Divine Regalia — Foundation's Hammer): "whenever you
  // do not move first in a combat round, your next attack deals 30%
  // additional damage" — combat.enemyActedFirstThisRound is set by
  // resolveSpeedInitiative exactly when that happened, and consumed here
  // (reset below, alongside threadsOfConsequencePending) so it only ever
  // boosts the very next hit.
  const stonesPatienceMult = state.combat && state.combat.enemyActedFirstThisRound && hasEffect(state, "stones_patience") ? 1.3 : 1;
  const worthyMult = worthyChallengeMultiplier(state);
  const valorMult = blessingOfValorMultiplier(state);
  const commandingDefMult = commandingPresenceDefMultiplier(state);
  const loadedDiceMult = loadedDiceMultiplier(state);
  const chaosMult = avatarOfChaosDamageMultiplier(state);
  const momentumUnboundMult = momentumUnboundMultiplier(state);
  const temperedSteelMult = temperedSteelMultiplier(state);
  const avatarOfTimeMult = state.combat && state.combat.avatarOfTimeTurns > 0 ? 1.25 : 1;
  let dmg;
  if (isSpell) {
    const magic = effectiveMagic(state);
    // Arcane Convergence (Artifact): rolls the base damage twice and keeps
    // the higher result — an "advantage" reroll rather than a flat
    // multiplier, so it still respects the natural magic-2..magic+2 spread.
    let base = randInt(magic - 2, magic + 2);
    if (hasEffect(state, "arcane_convergence")) base = Math.max(base, randInt(magic - 2, magic + 2));
    const multiplier = 1 + magic / 40;
    const matchup = avatarOfKnowledgeMatchupOverride(state, elementMultiplier(state, activeElement, creature.element));
    const effDef = Math.max(0, creature.def - defPenalty) * foreseenDefMult * commandingDefMult * precisionFormulaMultiplier(state);
    const overflowMult = arcaneOverflowMultiplier(state);
    dmg = Math.max(1, Math.round(base * multiplier * matchup * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * overflowMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * avatarOfTimeMult * stonesPatienceMult) - Math.floor(effDef / 10));
    // Avatar of Creation (Regalia of the Eternal Forge 6pc): every spell
    // cast during its 4-round window PERMANENTLY increases Magic by +2 —
    // unlike Avatar of Chaos/Endurance's own window-scoped bonus fields,
    // this one deliberately does NOT reset when the window ends (matching
    // the source text's own "permanently," in contrast to the "for 4
    // rounds" +40% Magic buff granted alongside it).
    if (state.combat.avatarOfCreationTurns > 0) {
      state.combat.avatarOfCreationMagicStacks = (state.combat.avatarOfCreationMagicStacks || 0) + 2;
    }
  } else {
    const armorCrack = armorCrackAmount(state);
    const effDef = Math.max(0, creature.def - defPenalty - armorCrack) * foreseenDefMult * commandingDefMult;
    const atkBuff = state.combat.atkBuffTurns > 0 ? state.combat.atkBuffAmount || 0 : 0;
    const everyChoiceAtk = state.combat.everyChoiceAtkStacks || 0;
    const battleTemperedAtk = state.combat.battleTemperedAtkStacks || 0;
    const atk = state.atk + consumeSiegeCorpsAtkCharge(state) + perfectBalanceBonus(state) + (state.combat.lastStandAtkBonus || 0) + (state.combat.livingSteelBonus || 0) + atkBuff + everyChoiceAtk * 2 + battleTemperedAtk + (state.combat.windsOfChangeAtk || 0) + (state.combat.avatarOfChaosAtkBonus || 0) + (state.combat.avatarOfEnduranceAtkBonus || 0) + (state.combat.workRefinesAtkStacks || 0) + (state.combat.avatarOfCreationAtkStacks || 0);
    const crushBase = crushingImpactMultiplier(state);
    const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
    // Master Craftsman (Divine Regalia — Smith's Grasp): compares this
    // hit's own effective Attack (all the buffs/stacks above already
    // folded in) against the enemy's raw Defense.
    const craftsmanMult = hasEffect(state, "master_craftsman") ? masterCraftsmanMultiplier(atk, creature) : 1;
    const base = randInt(atk - 2, atk + 2) - Math.floor(effDef / 3);
    // Echoing Arsenal (Artifact): every 5th physical/weapon-attack roll
    // (playerAttack, Ambush, Decoy, Disarm — anything landing in this
    // "else" branch) deals double damage. Its own counter, separate from
    // combat.actionCounter, so mixing in elemental casts doesn't throw off
    // the count of actual weapon swings.
    state.combat.weaponAttackCounter = (state.combat.weaponAttackCounter || 0) + 1;
    const echoingArsenalMult = hasEffect(state, "echoing_arsenal") && state.combat.weaponAttackCounter % 5 === 0 ? 2 : 1;
    dmg = Math.max(1, Math.round(base * crushMult * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * echoingArsenalMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * craftsmanMult * avatarOfTimeMult * stonesPatienceMult));
    // Avatar of Creation (Regalia of the Eternal Forge 6pc): every
    // successful physical attack during its window PERMANENTLY increases
    // Attack by +2 — see the spell-branch comment above for why this
    // doesn't reset with the window.
    if (state.combat.avatarOfCreationTurns > 0) {
      state.combat.avatarOfCreationAtkStacks = (state.combat.avatarOfCreationAtkStacks || 0) + 2;
    }
  }
  // Tempered Steel (Divine Regalia — Forgefather's Hammer): every
  // successful attack (dmg is always >= 1 by this point) permanently
  // grows its own stack for the NEXT hit, capped at 15 (+30%) — the same
  // "read the stack before this roll, grow it after" ordering Momentum/
  // Worthy Challenge use above.
  if (hasEffect(state, "tempered_steel")) {
    state.combat.temperedSteelStacks = Math.min(15, (state.combat.temperedSteelStacks || 0) + 1);
  }
  state.combat.threadsOfConsequencePending = false;
  state.combat.enemyActedFirstThisRound = false;
  if (hasEffect(state, "momentum")) {
    state.combat.momentumStacks = Math.min(5, (state.combat.momentumStacks || 0) + 1);
  }
  if (hasEffect(state, "worthy_challenge")) {
    state.combat.worthyChallengeStacks = Math.min(10, (state.combat.worthyChallengeStacks || 0) + 1);
  }
  // Blessing of Fortune (Regalia of the Laughing Gale 2pc) and Avatar of
  // Chaos (6pc): both key off THIS hit having just critted (critMult > 1,
  // already read above) to grow their own effect for the NEXT hit — the
  // same "read the stack before this roll, grow it after" ordering
  // Momentum/Worthy Challenge use, and just as silent (no line) as those.
  if (critMult > 1) {
    if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) {
      state.combat.blessingOfFortuneCritStacks = Math.min(5, (state.combat.blessingOfFortuneCritStacks || 0) + 1);
    }
    if (state.combat.avatarOfChaosTurns > 0) {
      const stat = ["Atk", "Def", "Magic", "Knowledge"][Math.floor(Math.random() * 4)];
      const field = "avatarOfChaos" + stat + "Bonus";
      state.combat[field] = Math.min(30, (state.combat[field] || 0) + 10);
    }
  }
  // Avatar of War (Regalia of the Crimson Vanguard 6pc): for its 4-round
  // window, all damage dealt heals 10% — silent like Soul Leech/Avatar of
  // Passing above.
  if (state.combat && state.combat.avatarOfWarTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.1));
  }
  // Soul Leech (Mythic): heals 10% of every hit's damage (20% if Master of
  // Arms doubles it from the Main Hand item), silently (this function only
  // returns a number, no message line) — consistent with Momentum/
  // Kingslayer/Hunter's Instinct also affecting the roll without their own
  // narration.
  if (hasEffect(state, "soul_leech") && state.health < state.maxHealth) {
    const leechPct = masterOfArmsDoubles(state, "soul_leech") ? 0.2 : 0.1;
    const leech = Math.round(dmg * leechPct);
    applyHeal(state, leech);
  }
  // Avatar of Passing (Regalia of the Final Veil 6pc): for its 4-round
  // window, all damage dealt heals 30% — silent like Soul Leech above
  // (this function only returns a number, no message line to attach to).
  if (state.combat && state.combat.avatarOfPassingTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.3));
  }
  // Enemy Ability Engine (data/enemyabilities.js): flat damage reduction
  // (Thick Hide-style) and on-hit reflect (Barbed Hide/Quills-style)
  // passives, read off the target creature's own `passives` array. Silent
  // like Soul Leech/Avatar of War/Passing above — this function only
  // returns a number, no message line to attach to.
  if (state.combat && creature.passives && creature.passives.length) {
    dmg = applyEnemyFlatDamageReduction(dmg, creature);
    applyEnemyOnHitTakenPassives(state, creature, dmg);
  }
  if (state.combat) state.combat.hitsTakenFromPlayer = (state.combat.hitsTakenFromPlayer || 0) + 1;
  return dmg;
}

function applyEnemyFlatDamageReduction(dmg, creature) {
  let mult = 1;
  for (const id of creature.passives) {
    const ability = getEnemyAbility(id);
    if (ability && ability.trigger === "flatDamageReduction") mult *= (1 - ability.pct);
  }
  let result = mult === 1 ? dmg : Math.max(0, Math.round(dmg * mult));
  // Perfect Fleshcraft (Grand Voran-Daun): no single hit can exceed a
  // fixed fraction of this creature's own max Health, regardless of how
  // hard it landed. `creature.hp` is the species template's max — the
  // live remaining Health lives on the per-fight enemy record instead.
  for (const id of creature.passives) {
    const ability = getEnemyAbility(id);
    if (ability && ability.trigger === "damageCapPctMaxHp") {
      const cap = Math.round((creature.hp || 0) * ability.pct);
      if (cap > 0) result = Math.min(result, cap);
    }
  }
  return result;
}

function applyEnemyOnHitTakenPassives(state, creature, dmgDealt) {
  if (dmgDealt <= 0) return;
  for (const id of creature.passives) {
    const ability = getEnemyAbility(id);
    if (!ability || ability.trigger !== "onHitTaken") continue;
    if (ability.reflectPctOfAtk) {
      const reflect = Math.max(0, Math.round((creature.atk || 0) * ability.reflectPctOfAtk));
      if (reflect > 0) state.health = Math.max(0, state.health - reflect);
    }
    // Powdered Wings-style: the creature inflicts a status back on
    // whoever just struck it (silent, like the reflect above — this
    // function only returns a number, no message line to attach to).
    if (ability.inflictStatusOnAttacker && state.combat) {
      const spec = getStatusEffect(ability.inflictStatusOnAttacker);
      if (spec) applyPlayerStatus(state, ability.inflictStatusOnAttacker, spec);
    }
    // Residual Memory (Lesser Voran-Daun): a CHANCE-based counter, unlike
    // Barbed Hide's guaranteed reflect above — same silent damage-only
    // path, no message line.
    if (ability.counterChance && ability.counterPctOfAtk && Math.random() < ability.counterChance) {
      const counter = Math.max(0, Math.round((creature.atk || 0) * ability.counterPctOfAtk));
      if (counter > 0) state.health = Math.max(0, state.health - counter);
    }
  }
}

// Picks which element flavors this particular hit — alternates between
// primary/secondary once a second element is unlocked at level 15.
function pickElement(state) {
  const known = [state.primaryElement, state.secondaryElement, state.tertiaryElement].filter(Boolean);
  if (known.length <= 1) return state.primaryElement;
  return known[Math.floor(Math.random() * known.length)];
}

// Opening Reach: the FIRST normal physical attack of the fight hits
// harder. The flag is consumed by the first qualifying attack regardless
// of whether the effect is equipped (it's a fact about the fight, not the
// gear) — Ambush/Blink/elemental abilities never call this, so an opening
// Ambush doesn't burn the bonus before a later normal attack gets it.
function applyOpeningReach(state, dmg) {
  if (state.combat.firstPhysicalAttackDone) return dmg;
  state.combat.firstPhysicalAttackDone = true;
  if (!hasEffect(state, "opening_reach")) return dmg;
  const mult = hasSetTier(state, "Norrvael", 6) ? 1.3 : 1.15;
  return Math.round(dmg * mult);
}

// Deep Cut (Bleed) and Hamstring both roll off any successful physical
// hit — shared by playerAttack, Decoy, Ambush, and Disarm's normal-hit
// component (not elemental abilities, which aren't physical attacks).
// deepCutChance (data/sets.js) resolves Bonecaller's higher proc chance.
function applyPhysicalOnHitEffects(state, creature) {
  const lines = [];
  const combat = state.combat;
  if (hasEffect(state, "deep_cut") && Math.random() < deepCutChance(state)) {
    combat.bleed = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.atk / 6)) };
    lines.push(`${withThe(creature.name, true)} is left bleeding.`);
  }
  if (hasEffect(state, "hamstring") && !combat.hamstringApplied) {
    combat.hamstringApplied = true;
    combat.enemyAtkPenalty = (combat.enemyAtkPenalty || 0) + 1;
    lines.push(`Your strike catches the tendon — ${withThe(creature.name, false)}'s attacks are weaker for the rest of this fight.`);
  }
  return lines;
}

// activeElement must be the SAME value already passed to rollPlayerDamage
// for this hit — computing it independently here risked picking a different
// element for the flavor text than the one the damage roll (and any
// matchup multiplier) was actually based on.
function attackFlavorLine(state, creature, dmg, activeElement) {
  if (state.flags.isMage && state.primaryElement) {
    const el = ELEMENTS[activeElement || pickElement(state)];
    return `${el.verb(withThe(creature.name, false))} for ${dmg} damage.`;
  }
  return `You strike ${withThe(creature.name, false)} for ${dmg} damage.`;
}

// Heartwood Vitality (Heartwood 6pc): every third combat action the
// player takes, heal 2% max Health. Counts any action that reaches
// beginTurn (i.e. actually executes), not rejected/invalid attempts.
function applyHeartwoodVitality(state) {
  const combat = state.combat;
  combat.actionCounter += 1;
  if (!hasSetTier(state, "Heartwood", 6) || combat.actionCounter % 3 !== 0) return [];
  const heal = Math.ceil(state.maxHealth * 0.02);
  if (heal <= 0) return [];
  const { healed, lines } = applyHeal(state, heal);
  return [`Heartwood Vitality mends you for ${healed} health.`, ...lines];
}

// Speed (state.speed, data/backgrounds.js/bestiary.js/enemymages.js
// `spd`): how quickly an entity acts in combat. Turn order within a round
// is simply whoever has the higher Speed — deterministic, not a dice
// roll. Zero surprise for the common case: any creature at or below the
// player's own Speed still lets the player act first exactly as before
// this stat existed (ties favor the player, same default).
function enemyActsFirst(state, creature) {
  // Unhurried Step (Divine Regalia — Sandals of the Unbroken Path): "Enemy
  // Haste, Speed, or Turn-order manipulation has no effect on you" — a
  // flat, unconditional immunity to ever losing the initiative order.
  if (hasEffect(state, "unhurried_step")) return false;
  return (creature.spd || 0) > effectivePlayerSpeedForInitiative(state);
}

// Resolves this round's turn order and, if the enemy is faster, lets it
// strike before the player's chosen action gets a chance to resolve.
// Called once at the very top of every player action function,
// immediately after beginTurn(). Reuses resolveEnemyRetaliation for the
// actual damage/mitigation math (defined further below, but plain
// function declarations are hoisted) — using its default spread and no
// bonus Defense, since none of the action-specific defensive bonuses
// (Brace, Guarded Strike, ...) exist yet at this point in the round. That
// also means every "the enemy's first attack this fight" gate (Guardian
// Spirit, Guided Footsteps, Timeless Guard, Reinforced, ...) applies here
// exactly as it would to a normal retaliation, since a pre-emptive strike
// genuinely can be that first attack.
//
// This is turn ORDER, not an extra turn: acting first here normally means
// the enemy's usual end-of-action retaliation is skipped for this same
// round (see resolveOrSkipRetaliation) — one enemy action, just moved
// earlier. The exception is BESTIARY's `flurry` creatures (a handful of
// fast, dangerous, rare/unique monsters — Thunderbird, Drake, Dragon,
// Banshee): for those specifically, being faster is a genuine extra
// threat, so their normal retaliation still fires afterward too.
//
// combat.enemyActedFirstThisRound is left set for the rest of this action
// to read — Stone's Patience (Divine Regalia — Foundation's Hammer) keys
// directly off it in rollPlayerDamage.
// creature (the caller's captured active target) is only used as the
// legacy single-enemy early-return guard below — the real work loops
// every alive enemy in the roster, so a pack of 3 faster wolves each get
// their own pre-emptive strike, fastest first, not just the active one.
function resolveSpeedInitiative(state, creature) {
  const combat = state.combat;
  combat.enemyActedFirstThisRound = false;
  combat.enemies.forEach((e) => { e.skipNormalRetaliationThisRound = false; });
  if (!creature || creature.friendly) return [];
  const lines = [];
  const fasterAlive = combat.enemies
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.alive && e.creatureObj && !e.creatureObj.friendly && enemyActsFirst(state, e.creatureObj))
    .sort((a, b) => (b.e.creatureObj.spd || 0) - (a.e.creatureObj.spd || 0));
  for (const { e, i } of fasterAlive) {
    if (state.health <= 0) break;
    combat.enemyActedFirstThisRound = true;
    if (!e.creatureObj.flurry) e.skipNormalRetaliationThisRound = true;
    const prevActive = combat.activeIndex;
    combat.activeIndex = i;
    const result = resolveEnemyAction(state, e.creatureObj, 2, 0);
    combat.activeIndex = prevActive;
    lines.push(`${withThe(e.creatureObj.name, true)} is faster than you and acts first this round!`, ...result.lines);
  }
  return lines;
}

// Shared by both resolveSpeedInitiative and resolveOrSkipRetaliation: one
// enemy's whole action for the round — try an Active ability first
// (Enemy Ability Engine), and if it's an AoE one, resolve it against the
// player AND every alive ally instead of the usual single pickEnemyAttackTarget
// roll (an AoE active always hits the whole party, not a coin-flip subset
// of it). Otherwise falls straight through to the existing single-target
// player-or-ally roll, exactly as before this engine existed.
function resolveEnemyAction(state, creatureObj, atkSpread, extraDef) {
  const abilityCtx = resolveEnemyActiveAbility(state, creatureObj);
  // Summons (Burrow Call, Nest Call, Brood Call, Grave Bloom) are a pure
  // support action — nothing is attacked, so this returns before ever
  // reaching the aoe/single-target damage paths below.
  if (abilityCtx && abilityCtx.summon) {
    const lines = resolveEnemySummon(state, creatureObj.level, abilityCtx.summon, abilityCtx.id, creatureObj.name);
    return { lines, damage: null };
  }
  if (abilityCtx && abilityCtx.aoe) {
    const lines = [];
    const playerResult = resolveEnemyRetaliation(state, creatureObj, atkSpread, extraDef, abilityCtx);
    lines.push(...playerResult.lines);
    for (const ally of aliveAllies(state)) {
      if (!state.combat) break;
      const allyResult = resolveEnemyAttackOnAlly(state, creatureObj, ally, abilityCtx);
      lines.push(...allyResult.lines);
    }
    return { lines, damage: playerResult.damage };
  }
  const target = pickEnemyAttackTarget(state);
  return target.kind === "ally"
    ? resolveEnemyAttackOnAlly(state, creatureObj, target.ally, abilityCtx)
    : resolveEnemyRetaliation(state, creatureObj, atkSpread, extraDef, abilityCtx);
}

// Shared by every action that lets the enemy retaliate after the
// player's own move resolves. If a given enemy already acted first this
// round (resolveSpeedInitiative, above) and isn't a `flurry` creature, it
// doesn't get a second action — this just reports that, without touching
// `damage` in a way that could be confused for a miss (damage stays null,
// not 0, so downstream "retaliation.damage === 0" dodge/riposte bonuses
// correctly don't fire off of it). Loops every alive enemy (a pack fight
// means every surviving member gets its turn, not just the one the player
// is currently targeting) — `damage` on the returned object specifically
// reflects the CALLER'S active target (matching the original single-enemy
// contract exactly), so riposte/dodge bonuses stay scoped to "the thing
// you just traded blows with," not the whole pack.
//
// excludeIndex silently skips one specific enemy entirely (no line, no
// damage) — Decoy/Ambush's own "this one specifically doesn't act" case,
// which already gets its own dedicated flavor line at the call site and
// isn't a pre-emptive-strike situation, so it deliberately does NOT reuse
// skipNormalRetaliationThisRound's "already acted first" message.
function resolveOrSkipRetaliation(state, creature, atkSpread, extraDef, excludeIndex) {
  const combat = state.combat;
  const callerActiveIndex = combat.activeIndex;
  const lines = [];
  let activeDamage = null;
  for (let i = 0; i < combat.enemies.length; i++) {
    const e = combat.enemies[i];
    if (!e.alive || !e.creatureObj || e.creatureObj.friendly) continue;
    if (i === excludeIndex) continue;
    const prevActive = combat.activeIndex;
    combat.activeIndex = i;
    let result;
    if (e.skipNormalRetaliationThisRound) {
      e.skipNormalRetaliationThisRound = false;
      result = { lines: [`${withThe(e.creatureObj.name, true)} already acted first this round and doesn't get a follow-up strike.`], damage: null };
    } else {
      result = resolveEnemyAction(state, e.creatureObj, atkSpread, extraDef);
    }
    combat.activeIndex = prevActive;
    lines.push(...result.lines);
    if (i === callerActiveIndex) activeDamage = result.damage;
    if (state.health <= 0) break;
  }
  return { lines, damage: activeDamage };
}

// ---- Party / Allies ----
// Allies live on state.party (engine/state.js), persistent across fights —
// combat reads/writes an ally's .health directly rather than keeping a
// separate per-fight copy, so nothing needs to be synced back whenever a
// fight ends (win, flee, or otherwise). They act once per round as a
// group, all at once, right at the top of it (see beginTurn's own call
// below) rather than getting their own Speed-based slot in the initiative
// order — a deliberate simplification, unrelated to the death mechanic
// below. Death IS a real threat here, in every fight, not just Boss/World
// Boss ones: enemies split their retaliation between the player and any
// alive allies (pickEnemyAttackTarget), and an ally who's struck below 0
// health falls permanently (killAlly) — there's no in-fight "downed,
// recovers after combat" state. Reviving them is deliberately not easy;
// see parser.js's sanctuary/pray/rite/revive commands.
function aliveAllies(state) {
  return (state.party || []).filter((a) => a.alive);
}

// The player still draws the plurality of enemy attention (they're the
// one actually swinging a weapon at it, after all), but allies standing
// in a fight aren't safe just for existing — the remainder is split
// evenly across however many are currently alive.
const ENEMY_TARGETS_ALLY_SHARE = 0.4;
function pickEnemyAttackTarget(state) {
  // Companion Ability Engine (engine/companion.js): a taunt in effect
  // (Shielding Presence/Champion's Challenge/Last Bastion) overrides the
  // random split below entirely, for as long as it's active.
  const forcedAlly = getForcedAllyTarget(state);
  if (forcedAlly) return { kind: "ally", ally: forcedAlly };
  const allies = aliveAllies(state);
  if (!allies.length) return { kind: "player" };
  const roll = Math.random();
  const playerShare = 1 - ENEMY_TARGETS_ALLY_SHARE;
  if (roll < playerShare) return { kind: "player" };
  const perAlly = ENEMY_TARGETS_ALLY_SHARE / allies.length;
  const idx = Math.min(allies.length - 1, Math.floor((roll - playerShare) / perAlly));
  return { kind: "ally", ally: allies[idx] };
}

// Enemy Ability Engine (data/enemyabilities.js): picks one off-cooldown
// Active ability from this creature's own `actives` list, puts it on
// cooldown, resolves any conditional damage-multiplier bonuses (a
// first-attack bonus if this is its first active use this fight, bonus
// damage against a status the player/target is suffering, bonus damage
// against a Health threshold), and returns a context object
// resolveEnemyRetaliation/resolveEnemyAttackOnAlly read to replace their
// usual flat attack roll — or null, meaning this creature just makes a
// normal attack this turn (no eligible ability, or it has none at all —
// every BESTIARY creature without an `actives` array behaves exactly as
// it did before this engine existed).
function resolveEnemyActiveAbility(state, creature) {
  if (!creature.actives || !creature.actives.length) return null;
  const combat = state.combat;
  const enemy = combat.enemies[combat.activeIndex];
  const cooldowns = enemy.abilityCooldowns || (enemy.abilityCooldowns = {});
  const eligible = creature.actives.filter((id) => {
    const a = getEnemyAbility(id);
    if (!a || cooldowns[id] > 0) return false;
    // Nest Call-style: "may successfully summon only once per encounter" —
    // reuses passiveOnceFlags (already there for oncePerCombat passives)
    // rather than a separate field just for actives.
    if (a.oncePerCombat && enemy.passiveOnceFlags[id]) return false;
    // Nest Call's own "only if fewer than N allies remain" gate — checked
    // here so the creature simply doesn't pick this active at all when the
    // pack is still healthy, rather than picking it and no-oping.
    if (a.summon && a.summon.onlyIfAlliesBelow != null) {
      const allyCount = combat.enemies.filter((e) => e.alive).length;
      if (allyCount >= a.summon.onlyIfAlliesBelow) return false;
    }
    return true;
  });
  if (!eligible.length) return null;
  const abilityId = eligible[Math.floor(Math.random() * eligible.length)];
  const ability = getEnemyAbility(abilityId);
  if (ability.oncePerCombat) enemy.passiveOnceFlags[abilityId] = true;
  cooldowns[abilityId] = ability.cooldown;
  let dmgMult = ability.dmgMult;
  // First-attack bonuses (Ambush, Silent Hunter, Patient Hunter, Ambush
  // Predator) apply to whichever active this creature happens to use
  // first each fight, not to one specific ability by name.
  if (!enemy.firstActiveUsed) {
    for (const pid of creature.passives || []) {
      const p = getEnemyAbility(pid);
      if (p && p.trigger === "firstAttack" && p.dmgMultBonus) dmgMult *= p.dmgMultBonus;
    }
  }
  enemy.firstActiveUsed = true;
  if (ability.bonusVsStatus && combat.playerStatuses && combat.playerStatuses[ability.bonusVsStatus.status]) {
    dmgMult *= ability.bonusVsStatus.mult;
  }
  if (ability.bonusVsHealthBelowPct && state.health <= state.maxHealth * ability.bonusVsHealthBelowPct.pct) {
    dmgMult *= ability.bonusVsHealthBelowPct.mult;
  }
  if (ability.bonusVsHealthAbovePct && state.health >= state.maxHealth * ability.bonusVsHealthAbovePct.pct) {
    dmgMult *= ability.bonusVsHealthAbovePct.mult;
  }
  // Apex Instinct (Rau-Thauln): unlike the ability-specific bonuses above,
  // this applies to EVERY active the creature has, so it lives on the
  // passive itself rather than needing to be copy-pasted onto each one.
  for (const pid of creature.passives || []) {
    const p = getEnemyAbility(pid);
    if (p && p.trigger === "bonusVsHealthBelowPctAlways" && state.health <= state.maxHealth * p.pct) {
      dmgMult *= p.mult;
    }
  }
  return {
    id: abilityId,
    name: ability.name,
    dmgMult,
    aoe: !!ability.aoe,
    inflict: ability.inflict,
    selfDebuff: ability.selfDebuff,
    selfBuff: ability.selfBuff,
    healOnHitPct: ability.healOnHitPct,
    healSelfPct: ability.healSelfPct,
    packAuraBuff: ability.packAuraBuff,
    summon: ability.summon,
  };
}

// Builds one summoned enemy in the exact shape startCombat's own roster
// uses (see the `enemies` array built there) — a summon mid-fight is
// otherwise indistinguishable from a creature that was in the encounter
// from the start: it can be targeted, it acts on its own initiative, it
// pays out its own XP/gold/loot on death. `sourceKey` (the summoning
// ability's own id) is what resolveEnemySummon below counts against a
// spec's maxActive cap.
function buildSummonedEnemyRecord(id, creature, sourceKey, dynamicCreature) {
  return {
    creatureId: id,
    creatureObj: creature,
    dynamicCreature: !!dynamicCreature, // true for a fully dynamic creature (engine/arena.js's gladiators) rather than a real BESTIARY id — see applyArchiveEternal, which skips species-tracking for those exactly like generateEnemyMage's own encounters already do
    name: creature.name,
    hp: creature.hp,
    maxHp: creature.hp,
    alive: true,
    skipNormalRetaliationThisRound: false,
    disarmed: false,
    corroded: false,
    enemyAtkPenalty: 0,
    enemyDefPenalty: 0,
    enemyStunned: false,
    burn: null,
    bleed: null,
    lastDamageType: null,
    hamstringApplied: false,
    reinforcedAttackCount: 0,
    abilityCooldowns: {},
    selfBuffs: [],
    passiveOnceFlags: {},
    firstActiveUsed: false,
    healthLostStacks: 0,
    hitsTakenFromPlayer: 0,
    lastAttackTargetKind: null,
    consecutiveTargetStacks: 0,
    summonSourceKey: sourceKey,
  };
}

// Summoner archetype support (Burrow Call, Nest Call, Brood Call, Grave
// Bloom, Corrupted Grove): adds 1+ new enemies to the roster mid-fight.
// `spec` shape: { creatureId } or { pool: [ids] } picks what to summon
// (a fixed species or a random one per summon); `count`/`countMin`/
// `countMax` how many; `maxActive` caps how many summons FROM THIS SAME
// SPEC can be alive at once (already-summoned-and-killed ones don't
// count against it, matching the codex's own "no more than N active"
// wording, not "no more than N ever"). `sourceKey` is the summoning
// ability's own id, stamped onto every summoned record so this count is
// scoped to this one ability even if several abilities summon in the
// same fight. Caller decides the summoned creatures' level — always the
// summoner's own level, same as ordinary pack members share the anchor's.
function resolveEnemySummon(state, level, spec, sourceKey, summonerName) {
  const combat = state.combat;
  // `capKey` lets two different summoning abilities on the SAME creature
  // (Dreadroot's Grave Bloom active and Corrupted Grove passive both cap
  // at "4 summons" against one shared undead-army count, per the codex)
  // count against one shared pool instead of each getting its own 4.
  const key = spec.capKey || sourceKey;
  const maxActive = spec.maxActive;
  const alreadyActive = maxActive != null
    ? combat.enemies.filter((e) => e.alive && e.summonSourceKey === key).length
    : 0;
  const room = maxActive != null ? Math.max(0, maxActive - alreadyActive) : Infinity;
  let count = spec.count != null ? spec.count : randInt(spec.countMin, spec.countMax);
  count = Math.min(count, room);
  if (count <= 0) {
    return [`${withThe(summonerName, true)} tries to call for reinforcements, but none answer.`];
  }
  const summoned = [];
  for (let i = 0; i < count; i++) {
    const id = spec.creatureId || spec.pool[Math.floor(Math.random() * spec.pool.length)];
    const template = BESTIARY[id];
    if (!template) continue;
    const creature = buildFightCreature(template, level, template.dangerClass);
    combat.enemies.push(buildSummonedEnemyRecord(id, creature, key));
    summoned.push(creature.name);
  }
  if (!summoned.length) {
    return [`${withThe(summonerName, true)} tries to call for reinforcements, but none answer.`];
  }
  return [`${withThe(summonerName, true)} calls for reinforcements — ${summoned.join(", ")} ${summoned.length === 1 ? "joins" : "join"} the fight!`];
}

// Buffs every OTHER alive packmate sharing this creature's own `group`
// (Rallying Roar, Grave Formation, ...) — the same temporary, reversible
// shape as applyEnemySelfModifier, just fanned out across the roster
// instead of just the caster. Packmates with no shared `group` (a solitary
// creature, or one with no group tag at all) simply have no one to buff.
function applyPackAuraBuff(combat, creature, spec) {
  if (!creature.group) return;
  const turns = spec.turns || 1;
  for (const other of combat.enemies) {
    if (!other.alive || other.creatureObj === creature || other.creatureObj.group !== creature.group) continue;
    for (const [key, amount] of Object.entries(spec)) {
      if (key === "turns" || typeof amount !== "number") continue;
      // A "...Pct" key (Rallying Roar's atkPct) buffs a fraction of the
      // recipient's OWN current value — resolved to a flat delta here, at
      // application time, so the reversal in tickEnemyPassives can just
      // subtract the exact same number back off, same as every other
      // selfBuffs entry.
      const stat = key.endsWith("Pct") ? key.slice(0, -3) : key;
      const delta = key.endsWith("Pct") ? Math.round((other.creatureObj[stat] || 0) * amount) : amount;
      other.creatureObj[stat] = (other.creatureObj[stat] || 0) + delta;
      other.selfBuffs.push({ stat, amount: delta, turnsLeft: turns });
    }
  }
}

// An enemy attacking an ally instead of the player — its own smaller,
// ally-scoped sibling of resolveEnemyRetaliation, since that function's
// mitigation pipeline is threaded through with player-only Divine
// Regalia/Legendary/Mythic effects that have no bearing on an ally's own
// (shared-inventory) gear. `damage` on the returned object is always
// null, never 0 — this attack didn't target the player at all, so it
// must not read as "the player dodged" to the dodge/riposte bonuses that
// key off resolveOrSkipRetaliation's returned damage.
// abilityCtx (Enemy Ability Engine, data/enemyabilities.js): set only when
// this same action is an AoE active ability also striking every ally —
// the player-facing half already resolved the ability's own selection/
// cooldown/name/self-buff bookkeeping, so this just needs the resolved
// dmgMult to scale the hit the same way.
function resolveEnemyAttackOnAlly(state, creature, ally, abilityCtx) {
  if (!attackConnects(creature.acc, ally.agility)) {
    return { lines: [`${withThe(creature.name, true)} lunges at ${ally.name} and misses.`], damage: null };
  }
  const rawAtk = effectiveEnemyAtk(state, creature);
  // bonusDefAmount: Champion's Challenge's temporary +Def (engine/companion.js) — 0 for any ally without one.
  const effectiveDef = (ally.def || 0) + (ally.bonusDefAmount || 0);
  let dmg = abilityCtx
    ? Math.max(0, Math.round(rawAtk * abilityCtx.dmgMult) - Math.round(effectiveDef * 0.5))
    : Math.max(0, randInt(rawAtk - 1, rawAtk + 1) - Math.round(effectiveDef * 0.5));
  // Companion Ability Engine (engine/companion.js): taunt/Unbroken Will
  // damage reduction and Champion's Resolve's non-fatal floor for a kit-
  // bearing ally — a no-op for any ally without one (Kessa).
  const mitigation = applyCompanionDamageTaken(ally, dmg);
  dmg = mitigation.dmg;
  // The Grand Ovum (engine/arena.js): a non-lethal bout protects allies
  // exactly like it protects the player — nobody actually dies in a match
  // that was never billed as one, so their Health simply can't drop to 0
  // here, same floor-at-1 as the player's own non-lethal-loss save.
  const arenaFloor = state.combat && state.combat.isArenaFight && !state.combat.arenaLethal ? 1 : 0;
  ally.health = Math.max(arenaFloor, ally.health - dmg);
  const verb = abilityCtx ? `uses ${abilityCtx.name} on` : "strikes";
  const lines = [`${withThe(creature.name, true)} ${verb} ${ally.name} for ${dmg} damage.`, ...mitigation.lines];
  // Last Bastion's automatic retaliation (engine/companion.js) — a no-op
  // for any ally without one.
  lines.push(...maybeCompanionRetaliate(state, ally, creature));
  if (ally.health <= 0) {
    lines.push(...killAlly(state, ally));
    // Enemy Ability Engine: Predator's Momentum-style "after defeating an
    // enemy" passives — the only thing this engine's creatures can
    // actually defeat mid-fight is a party member, since the player's own
    // death simply ends the game rather than continuing the encounter.
    for (const pid of creature.passives || []) {
      const p = getEnemyAbility(pid);
      if (p && p.trigger === "onKill") applyEnemySelfModifier(state.combat, creature, p.selfBuff);
    }
  }
  return { lines, damage: null };
}

// Permanent, not "downed for this fight" — enemies inflicting genuine,
// lasting death is the whole point (see the file-header comment above).
// Their shared-inventory gear returns to the pack immediately (nothing
// about it requires the wearer to still be alive), leaving only their
// identity for the player to decide what becomes of, via parser.js's
// 'send <name> home'/'leave <name>' commands.
function killAlly(state, ally) {
  ally.alive = false;
  ally.pendingBodyChoice = true;
  Events.emit("ally.died", { ally, state });
  return [
    `${ally.name} falls.`,
    `You'll need to decide what becomes of them — 'send ${ally.name.split(" ")[0]} home' to carry the body to the Sanctuary, or 'leave ${ally.name.split(" ")[0]}' to let them go. Revival won't be easy, but it isn't impossible ('sanctuary' explains how).`,
  ];
}

// Listener: an ally's gear returns to the shared pack the instant they
// fall — nothing about it requires the wearer to still be alive, and it
// doesn't contribute anything to what's printed, so it's a clean first
// real listener rather than staying hardwired inside killAlly itself.
Events.on("ally.died", ({ ally, state }) => {
  for (const slot of EQUIP_SLOTS) {
    if (slot === "trinkets") {
      state.inventory.push(...ally.equipment.trinkets);
      ally.equipment.trinkets = [];
    } else if (ally.equipment[slot]) {
      state.inventory.push(ally.equipment[slot]);
      ally.equipment[slot] = null;
    }
  }
});

function resolveAllyActions(state) {
  if (!state.combat) return [];
  const creature = getCombatCreature(state);
  if (!creature || creature.friendly) return [];
  const lines = [];
  for (const ally of aliveAllies(state)) {
    if (!state.combat || !aliveEnemies(state).length) break;
    // Companion Ability Engine (engine/companion.js): an ally whose
    // ALLY_DEFS entry carries an abilityKit (Hadrian) runs its own real
    // kit instead of the generic 3-stance dispatch below — everyone else
    // (Kessa) is entirely unaffected.
    const def = ALLY_DEFS[ally.defId];
    if (def && def.abilityKit) {
      lines.push(...resolveCompanionAction(state, ally));
    } else if (ally.stance === "defensive") lines.push(...allyDefensiveAction(state, ally));
    else if (ally.stance === "support") lines.push(...allySupportAction(state, ally));
    else lines.push(...allyAggressiveAction(state, ally));
  }
  return lines;
}

// Aggressive stance: pile onto whichever enemy the player is currently
// targeting, using the same Accuracy-vs-Agility hit check as everything
// else, and a damage roll loosely scaled off the ally's own Attack — not
// routed through rollPlayerDamage, since that formula is threaded through
// with player-only Divine Regalia/Legendary/Mythic bonuses that have
// nothing to do with an ally's own gear.
function allyAggressiveAction(state, ally) {
  const combat = state.combat;
  const target = combat.enemies[combat.activeIndex];
  if (!target || !target.alive) return [];
  if (!attackConnects(ally.accuracy, target.creatureObj.agi)) {
    return [`${ally.name} lunges at ${withThe(target.creatureObj.name, false)} and misses.`];
  }
  const dmg = Math.max(1, randInt(Math.round(ally.atk * 0.85), Math.round(ally.atk * 1.15)) - Math.round((target.creatureObj.def || 0) * 0.5));
  target.hp -= dmg;
  target.lastDamageType = "physical";
  const lines = [`${ally.name} strikes ${withThe(target.creatureObj.name, false)} for ${dmg} damage.`];
  if (target.hp <= 0 && target.alive) lines.push(...resolveKill(state, target.creatureObj));
  return lines;
}

// Defensive stance: weaken the active enemy's attack rather than damage
// it — reuses Disarm's own enemyAtkPenalty field (a flat, lasting
// reduction to effectiveEnemyAtk), capped so a long fight can't let it
// stack into "the enemy can no longer hurt you at all."
function allyDefensiveAction(state, ally) {
  const combat = state.combat;
  const target = combat.enemies[combat.activeIndex];
  if (!target || !target.alive) return [];
  const cap = 6;
  if ((target.enemyAtkPenalty || 0) >= cap) {
    return [`${ally.name} keeps ${withThe(target.creatureObj.name, false)} off balance.`];
  }
  target.enemyAtkPenalty = (target.enemyAtkPenalty || 0) + 1;
  return [`${ally.name} disrupts ${withThe(target.creatureObj.name, false)}'s footing, weakening its attack.`];
}

// Support stance: mend whoever's lowest on health, player included — in
// Phase 1 that's almost always the player, since enemies can't hurt
// allies yet, but the comparison is written generally so it keeps working
// once Phase 2 lets allies take damage too.
function allySupportAction(state, ally) {
  const candidates = [{ isPlayer: true, hp: state.health, maxHp: state.maxHealth }].concat(
    aliveAllies(state)
      .filter((a) => a !== ally)
      .map((a) => ({ isPlayer: false, ref: a, hp: a.health, maxHp: a.maxHealth }))
  );
  candidates.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  const target = candidates[0];
  if (target.hp >= target.maxHp) return [`${ally.name} keeps watch — no one needs mending.`];
  const amount = Math.ceil(target.maxHp * 0.15);
  if (target.isPlayer) {
    const { healed, lines } = applyHeal(state, amount);
    return [`${ally.name} tends to your wounds, mending ${healed} health.`, ...lines];
  }
  const healed = Math.min(amount, target.maxHp - target.hp);
  target.ref.health += healed;
  return [`${ally.name} tends to ${target.ref.name}'s wounds, mending ${healed} health.`];
}

// Ages cooldowns and status-effect durations by one turn, and applies any
// active burn/bleed damage (Fire's Ignite; Deep Cut). Called at the start
// of whichever combat action actually executes (not on rejected/invalid
// attempts, which don't consume a turn). Returns lines for anything that
// happened, and the caller must check state.combat.hp afterward — burn or
// bleed alone can finish a creature off before the player's own action
// resolves. Burn and Bleed tick independently and don't interact.
function beginTurn(state) {
  const combat = state.combat;
  const lines = [];
  // Avatar of Freedom (Regalia of the Endless Horizon 6pc) and Avatar of
  // Creation (Regalia of the Eternal Forge 6pc): both speed up cooldown
  // recovery for their own 4-round windows — read BEFORE the decrement
  // below, so the window's final round still gets the faster recovery.
  // Blessing of the Hour (Regalia of the Eternal Hour 2pc): the same
  // extra-decrement bonus, but only every 4th round — combat.actionCounter
  // hasn't been incremented for THIS round yet (that happens further down,
  // via applyHeartwoodVitality), so "+1" here predicts what it's about to
  // become.
  const blessingOfTheHourRound = hasSetTier(state, "Regalia of the Eternal Hour", 2) && (combat.actionCounter + 1) % 4 === 0;
  const cooldownDecrement = combat.avatarOfFreedomTurns > 0 || combat.avatarOfCreationTurns > 0 || blessingOfTheHourRound ? 2 : 1;
  // Living Forge (Divine Regalia — Embercore): every cooldown that
  // actually reaches 0 THIS tick ("completes") restores 3% max Health —
  // its "3% Mana" half is a no-op, since this engine has no Mana resource
  // (the same standing limitation cited for every other Mana-flavored
  // clause so far).
  let livingForgeCompletions = 0;
  const livingForgeActive = hasEffect(state, "living_forge");
  for (const key of Object.keys(combat.cooldowns)) {
    const before = combat.cooldowns[key];
    if (before > 0) {
      combat.cooldowns[key] = Math.max(0, before - cooldownDecrement);
      if (livingForgeActive && combat.cooldowns[key] === 0) livingForgeCompletions += 1;
    }
  }
  if (livingForgeCompletions > 0) {
    const heal = Math.ceil(state.maxHealth * 0.03) * livingForgeCompletions;
    if (heal > 0) {
      const { healed, lines: healLines } = applyHeal(state, heal);
      if (healed > 0) lines.push(`Living Forge mends you for ${healed} health.`, ...healLines);
    }
  }
  // Avatar of Time (Regalia of the Eternal Hour 6pc): "buff durations no
  // longer decrease" for its window — scoped to these 3 shared buff-turn
  // fields, the same "temporary stat bonus" scope Blessing of Creation
  // already uses.
  const avatarOfTimeFreezesBuffs = combat.avatarOfTimeTurns > 0;
  if (combat.defBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.defBuffTurns -= 1;
  if (combat.atkBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.atkBuffTurns -= 1;
  if (combat.magicBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.magicBuffTurns -= 1;
  if (combat.avatarOfPassingTurns > 0) combat.avatarOfPassingTurns -= 1;
  if (combat.avatarOfFateTurns > 0) combat.avatarOfFateTurns -= 1;
  if (combat.avatarOfWarTurns > 0) combat.avatarOfWarTurns -= 1;
  if (combat.avatarOfKnowledgeTurns > 0) {
    combat.avatarOfKnowledgeTurns -= 1;
    if (combat.avatarOfKnowledgeTurns === 0) combat.knowledgeBuffAmount = 0;
  }
  if (combat.avatarOfDevotionTurns > 0) combat.avatarOfDevotionTurns -= 1;
  if (combat.avatarOfChaosTurns > 0) {
    combat.avatarOfChaosTurns -= 1;
    if (combat.avatarOfChaosTurns === 0) {
      combat.avatarOfChaosAtkBonus = 0;
      combat.avatarOfChaosDefBonus = 0;
      combat.avatarOfChaosMagicBonus = 0;
      combat.avatarOfChaosKnowledgeBonus = 0;
    }
  }
  if (combat.avatarOfEnduranceTurns > 0) {
    combat.avatarOfEnduranceTurns -= 1;
    if (combat.avatarOfEnduranceTurns === 0) {
      combat.avatarOfEnduranceAtkBonus = 0;
      combat.avatarOfEnduranceDefBonus = 0;
    }
  }
  if (combat.avatarOfFreedomTurns > 0) combat.avatarOfFreedomTurns -= 1;
  // Avatar of Creation (Regalia of the Eternal Forge 6pc): the +40%
  // Attack/Magic buff (via the shared atk/magicBuffTurns fields) expires
  // normally above, but the PERMANENT +2-per-attack/+2-per-spell stacks
  // it grows (see rollPlayerDamage) deliberately do NOT reset here when
  // the window ends — "permanently," per the source text.
  if (combat.avatarOfCreationTurns > 0) combat.avatarOfCreationTurns -= 1;
  if (combat.avatarOfRenewalTurns > 0) combat.avatarOfRenewalTurns -= 1;
  if (combat.unyieldingWallCooldown > 0) combat.unyieldingWallCooldown -= 1;
  if (combat.timelessGuardCooldown > 0) combat.timelessGuardCooldown -= 1;
  // Avatar of Time (Regalia of the Eternal Hour 6pc): "when the effect
  // ends, all cooldowns resume from whatever value they would have
  // naturally reached" is simplified here to "cooldowns simply remain at
  // 0" instead — reconstructing a parallel shadow-cooldown ledger just
  // to restore the exact natural value would be a bespoke, one-off
  // tracking system for a minor edge case; this is a deliberate,
  // documented simplification (slightly favors the player) rather than
  // that added complexity.
  if (combat.avatarOfTimeTurns > 0) combat.avatarOfTimeTurns -= 1;
  if (combat.damageReductionTurns > 0) combat.damageReductionTurns -= 1;
  if (combat.calmWatersTurns > 0) combat.calmWatersTurns -= 1;
  if (combat.evasionTurns > 0) combat.evasionTurns -= 1;
  // Battle Tempered (Divine Regalia — Armor of the First Legion): every
  // round spent in combat grants +1 Attack/+1 Defense, capped +10/+10.
  // Unconditional per-action, unlike Living Steel's every-3rd-action gate.
  if (hasEffect(state, "battle_tempered")) {
    if ((combat.battleTemperedAtkStacks || 0) < 10) combat.battleTemperedAtkStacks = (combat.battleTemperedAtkStacks || 0) + 1;
    if ((combat.battleTemperedDefStacks || 0) < 10) combat.battleTemperedDefStacks = (combat.battleTemperedDefStacks || 0) + 1;
  }
  // Unwavering Devotion (Divine Regalia — Vestments of Boundless
  // Devotion): every round survived grants +2 Magic, capped +20 (10
  // stacks) — Battle Tempered's exact shape, one stat instead of two.
  // "Losing combat resets the effect" is automatically true here: every
  // new fight starts this counter fresh at 0 regardless of how the last
  // one ended.
  if (hasEffect(state, "unwavering_devotion") && (combat.unwaveringDevotionStacks || 0) < 10) {
    combat.unwaveringDevotionStacks = (combat.unwaveringDevotionStacks || 0) + 1;
  }
  // Winds of Change (Divine Regalia — Garments of the Wandering Breeze): at
  // the start of every round, replace last round's random +6 stat bonus
  // with a freshly rolled one (Attack/Defense/Magic/Knowledge, equally
  // likely) — four mutually exclusive fields so exactly one is ever
  // nonzero at a time, rather than an independent per-stack timer. Its
  // re-roll always favors the player (there's no "no bonus" outcome), so
  // it also counts as "a random effect favors you" for Twist of Fate.
  if (hasEffect(state, "winds_of_change")) {
    combat.windsOfChangeAtk = 0;
    combat.windsOfChangeDef = 0;
    combat.windsOfChangeMagic = 0;
    combat.windsOfChangeKnowledge = 0;
    const roll = Math.floor(Math.random() * 4);
    const labels = ["Attack", "Defense", "Magic", "Knowledge"];
    if (roll === 0) combat.windsOfChangeAtk = 6;
    else if (roll === 1) combat.windsOfChangeDef = 6;
    else if (roll === 2) combat.windsOfChangeMagic = 6;
    else combat.windsOfChangeKnowledge = 6;
    lines.push(`Winds of Change shifts — +6 ${labels[roll]} this round.`);
    lines.push(...applyTwistOfFate(state));
  }
  // Burn/Bleed tick per-enemy, not just against whoever's currently
  // targeted — igniting one wolf and then switching to another shouldn't
  // silently freeze the first one's burn. playerTargetIndex is the enemy
  // the player is actually fighting (set before this loop runs); if some
  // OTHER, non-active enemy's DOT finishes it off mid-tick, resolveKill's
  // own "advance to a survivor" logic gets overridden back to
  // playerTargetIndex right after, since the player's real target is still
  // alive and shouldn't change just because an unrelated pack member died.
  const playerTargetIndex = combat.activeIndex;
  for (let i = 0; i < combat.enemies.length; i++) {
    const e = combat.enemies[i];
    if (!e.alive) continue;
    if (e.burn && e.burn.turnsLeft > 0) {
      e.hp -= e.burn.dmgPerTurn;
      e.lastDamageType = "fire";
      lines.push(`The flames still burn ${withThe(e.creatureObj.name, false)} for ${e.burn.dmgPerTurn} damage.`);
      e.burn.turnsLeft -= 1;
      if (e.burn.turnsLeft <= 0) e.burn = null;
      if (e.hp <= 0 && e.alive) {
        combat.activeIndex = i;
        lines.push(...resolveKill(state, e.creatureObj));
        if (!state.combat) return lines;
        if (i !== playerTargetIndex && combat.enemies[playerTargetIndex] && combat.enemies[playerTargetIndex].alive) {
          combat.activeIndex = playerTargetIndex;
        }
        continue;
      }
    }
    if (e.alive && e.bleed && e.bleed.turnsLeft > 0) {
      e.hp -= e.bleed.dmgPerTurn;
      e.lastDamageType = "bleed";
      lines.push(`${withThe(e.creatureObj.name, true)} is still bleeding for ${e.bleed.dmgPerTurn} damage.`);
      e.bleed.turnsLeft -= 1;
      if (e.bleed.turnsLeft <= 0) e.bleed = null;
      if (e.hp <= 0 && e.alive) {
        combat.activeIndex = i;
        lines.push(...resolveKill(state, e.creatureObj));
        if (!state.combat) return lines;
        if (i !== playerTargetIndex && combat.enemies[playerTargetIndex] && combat.enemies[playerTargetIndex].alive) {
          combat.activeIndex = playerTargetIndex;
        }
      }
    }
    // Enemy Ability Engine: this creature's own self-buff countdown and
    // recurring Health-based/regen passives — same per-enemy, every-round
    // cadence as burn/bleed above.
    lines.push(...tickEnemyPassives(state, e));
    if (e.hp <= 0 && e.alive) {
      combat.activeIndex = i;
      lines.push(...resolveKill(state, e.creatureObj));
      if (!state.combat) return lines;
      if (i !== playerTargetIndex && combat.enemies[playerTargetIndex] && combat.enemies[playerTargetIndex].alive) {
        combat.activeIndex = playerTargetIndex;
      }
    }
  }
  // Enemy Ability Engine: the player's own active statuses (Bleed, Venom,
  // Constrict, Pinned, ...) tick the same way, right after every enemy's
  // own burn/bleed/passive upkeep above. tickPlayerStatuses handles its
  // own death-check per DOT tick internally (mirroring the enemy-side
  // burn/bleed loop above), so nothing further is needed here.
  lines.push(...tickPlayerStatuses(state));
  if (state.health <= 0) return lines;
  // Endless Bloom (Divine Regalia — Seed of First Dawn): a 5-round
  // Regeneration HoT set up once at combat start (see startCombat),
  // ticked here identically in shape to burn/bleed but healing instead of
  // damaging — routed through applyHeal so Flourishing Soul/Overflowing
  // Life/Living Current all still apply to it.
  if (combat.regen && combat.regen.turnsLeft > 0) {
    const { healed, lines: healLines } = applyHeal(state, combat.regen.healPerTurn);
    if (healed > 0) lines.push(`Endless Bloom mends you for ${healed} health.`, ...healLines);
    combat.regen.turnsLeft -= 1;
    if (combat.regen.turnsLeft <= 0) combat.regen = null;
  }
  // Blessing of Renewal (Regalia of the First Bloom 2pc): an unconditional
  // 3% max Health heal at the start of every round, for as long as the set
  // bonus is active — no duration or once-per-fight gate, unlike Endless
  // Bloom above.
  if (hasSetTier(state, "Regalia of the First Bloom", 2)) {
    const heal = Math.ceil(state.maxHealth * 0.03);
    if (heal > 0) {
      const { healed, lines: healLines } = applyHeal(state, heal);
      if (healed > 0) lines.push(`Blessing of Renewal mends you for ${healed} health.`, ...healLines);
    }
  }
  lines.push(...applyHeartwoodVitality(state));
  lines.push(...applyLivingSteel(state));
  // Lasting Foundation (Divine Regalia — Keystone of Endurance): at the end
  // of every third combat round, restore 10% max Health — reuses the same
  // combat.actionCounter Heartwood Vitality/Calming Presence already read,
  // checked right after applyHeartwoodVitality has incremented it for
  // this round.
  if (hasEffect(state, "lasting_foundation") && combat.actionCounter % 3 === 0) {
    const lastingFoundationHeal = Math.ceil(state.maxHealth * 0.1);
    if (lastingFoundationHeal > 0) {
      const { healed, lines: healLines } = applyHeal(state, lastingFoundationHeal);
      if (healed > 0) lines.push(`Lasting Foundation mends you for ${healed} health.`, ...healLines);
    }
  }
  // Work Refines (Divine Regalia — Ring of Endless Labor): every third
  // action permanently grants +2 Attack/+2 Magic, capped at +20/+20 (10
  // triggers) — the same actionCounter cadence Lasting Foundation/
  // Heartwood Vitality already read.
  if (hasEffect(state, "work_refines") && combat.actionCounter % 3 === 0) {
    if ((combat.workRefinesAtkStacks || 0) < 20) combat.workRefinesAtkStacks = Math.min(20, (combat.workRefinesAtkStacks || 0) + 2);
    if ((combat.workRefinesMagicStacks || 0) < 20) combat.workRefinesMagicStacks = Math.min(20, (combat.workRefinesMagicStacks || 0) + 2);
  }
  // Flowing Waters (Divine Regalia — Tidecaller): restore 3% max Health at
  // the end of every round — its "3% Mana" half is a no-op, the same
  // standing limitation cited for every other Mana-flavored clause (this
  // engine has no Mana resource).
  if (hasEffect(state, "flowing_waters")) {
    const flowingWatersHeal = Math.ceil(state.maxHealth * 0.03);
    if (flowingWatersHeal > 0) {
      const { healed, lines: healLines } = applyHeal(state, flowingWatersHeal);
      if (healed > 0) lines.push(`Flowing Waters mends you for ${healed} health.`, ...healLines);
    }
  }
  // Patient Current (Divine Regalia — Sandals of the River): every
  // second round spent in combat, ease a random currently-cooling-down
  // Ability/Tactic by 1 turn — the same random-pick-and-ease pattern
  // Universal Understanding/Twist of Fate already established.
  if (hasEffect(state, "patient_current") && combat.actionCounter % 2 === 0) {
    const cooling = Object.keys(combat.cooldowns).filter((k) => combat.cooldowns[k] > 0);
    if (cooling.length) {
      const key = cooling[Math.floor(Math.random() * cooling.length)];
      combat.cooldowns[key] = Math.max(0, combat.cooldowns[key] - 1);
      lines.push(`Patient Current eases ${cooldownDisplayName(key)}'s recovery by a turn.`);
    }
  }
  // Avatar of Renewal (Regalia of the Endless Tide 6pc): restore 10% max
  // Health at the end of every round during its 4-round window. Its
  // "automatically cleanse one negative effect each round" clause is
  // inert — no negative-status mechanic exists on the player side — and
  // its "every healing effect also restores an equal amount of Mana"
  // clause is a no-op for the same Mana-resource reason as Flowing Waters.
  if (combat.avatarOfRenewalTurns > 0) {
    const avatarOfRenewalHeal = Math.ceil(state.maxHealth * 0.1);
    if (avatarOfRenewalHeal > 0) {
      const { healed, lines: healLines } = applyHeal(state, avatarOfRenewalHeal);
      if (healed > 0) lines.push(`Avatar of Renewal mends you for ${healed} health.`, ...healLines);
    }
  }
  // Allies act once per round, as a group, right here at the very end of
  // beginTurn — the one function every action (playerAttack, useFeint,
  // useDecoy, useAmbush, useDisarm, useElementAbility, useItem, a failed
  // attemptFlee) already calls first, so this is a single integration
  // point rather than touching each of those separately. Guarded the same
  // way the DOT tick above is: an ally landing the killing blow can end
  // the fight before the player's own action gets to run, and every call
  // site already checks `if (!state.combat) return ...` right after
  // beginTurn returns.
  if (state.combat) {
    tickCompanionCombatTimers(state);
    lines.push(...resolveAllyActions(state));
  }
  return lines;
}

// Elder Bark's plain 1-HP save prevents an otherwise-fatal hit, once per
// fight — checked wherever state.health has just dropped to 0 or below,
// in place of the usual "Everything goes dark" line.
function checkDeathPrevention(state) {
  if (state.health > 0) return null;
  const combat = state.combat;
  // The Grand Ovum (engine/arena.js): a non-lethal arena bout was never
  // going to kill anyone regardless — checked first, ahead of every real
  // cheat-death effect below, so a friendly match doesn't spend one of
  // those precious per-fight charges surviving something that was never
  // actually lethal.
  const arenaResult = maybeArenaNonLethalLoss(state);
  if (arenaResult) return arenaResult;
  let msg = null;
  if (hasSetTier(state, "Elder Bark", 6) && !combat.elderBarkSaveUsed) {
    combat.elderBarkSaveUsed = true;
    state.health = 1;
    msg = `The oldest wood remembers you yet — you survive this at 1 Health.`;
  } else if (hasEffect(state, "last_stand") && !combat.lastStandUsed) {
    combat.lastStandUsed = true;
    state.health = 1;
    combat.lastStandAtkBonus = (combat.lastStandAtkBonus || 0) + 5;
    msg = `Last Stand — you refuse to fall. 1 Health, and +5 Attack for what's left of this fight.`;
  } else if (hasEffect(state, "between_worlds") && !combat.betweenWorldsUsed) {
    // Between Worlds (Divine Regalia — Veil of the Ferryman): the same
    // "leaves you at 1 Health" cheat-death shape as Last Stand above, but
    // deliberately without its +5 Attack — a plain reprieve, nothing more.
    combat.betweenWorldsUsed = true;
    state.health = 1;
    msg = `Between Worlds — the Ferryman's veil catches you at the threshold. 1 Health, nothing more.`;
  } else if (hasSetTier(state, "Regalia of the Woven Thread", 6) && combat.avatarOfFateTurns > 0 && !combat.avatarOfFateSaveUsed) {
    // Avatar of Fate's (Regalia of the Woven Thread 6pc) "once during the
    // effect" 1-HP save — only available while its 4-round window is
    // active (see checkAvatarOfFate), on top of (not instead of) the
    // once-per-fight saves above.
    combat.avatarOfFateSaveUsed = true;
    state.health = 1;
    msg = `Avatar of Fate — fate itself refuses to let you fall. 1 Health.`;
  }
  // Avatar of Devotion (Regalia of the Eternal Heart 6pc): "if reduced to
  // 1 Health during the effect, immediately restore 20% max Health
  // (once)" — a follow-up to WHICHEVER cheat-death save above just fired,
  // not a save of its own. Checked once, regardless of which branch set
  // health to 1.
  if (msg && hasSetTier(state, "Regalia of the Eternal Heart", 6) && combat.avatarOfDevotionTurns > 0 && !combat.avatarOfDevotionSaveUsed) {
    combat.avatarOfDevotionSaveUsed = true;
    const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.2));
    if (healed > 0) msg += ` Avatar of Devotion answers in turn — mended for ${healed} health.${lines.length ? " " + lines.join(" ") : ""}`;
  }
  return msg;
}

// Resolves the enemy's retaliation for this turn, respecting Force's stun,
// Air's evasion window/Evasive Release's one-shot charges, and Earth's
// defense buff. Shared by every action that lets the enemy hit back on a
// normal (non-fatal) turn. Enemy mages (creature.element set) counter with
// magic instead of a physical attack stat, and their element is checked
// against the player's own active element (if any) through the same
// matchup table used for the player's own casts — so the strengths/
// weaknesses run both directions (state is deliberately NOT passed to
// elementMultiplier here, since the enemy is the attacker in this call —
// Fragmenta's set bonus only strengthens the PLAYER's own outgoing matchup
// advantage, never the enemy's).
//
// Returns { lines, damage } instead of just lines — callers use `damage`
// to check for Riposte (which fires on a zero-damage retaliation). `extraDef`
// is an optional one-shot Defense bonus for THIS call only (Guarded Strike,
// Brace) — it never persists beyond this single retaliation.
// Overflowing Life's (Regalia of the First Bloom 4pc) Temporary Health
// buffer absorbs incoming damage before real Health does — a shield-style
// layer, consumed here once rather than reimplemented at each of the 3
// places an enemy hit actually reduces the player's Health.
function applyPlayerDamage(state, dmg) {
  if (dmg <= 0) return [];
  const combat = state.combat;
  let remaining = dmg;
  const lines = [];
  if (combat && combat.tempHealth > 0) {
    const absorbed = Math.min(combat.tempHealth, remaining);
    combat.tempHealth -= absorbed;
    remaining -= absorbed;
    if (absorbed > 0) lines.push(`Your Temporary Health absorbs ${absorbed} of it.`);
  }
  state.health -= remaining;
  // Walls Endure (Regalia of the Eternal Bastion 4pc): +1 Defense every
  // time damage is actually taken (the raw pre-absorption amount, gated by
  // this function's own dmg > 0 check above — an attack connected, whether
  // or not Temporary Health cushioned the real Health loss), capped at
  // +20. "Resets after combat" is automatic — a fresh fight always starts
  // this at 0 via startCombat's initializer.
  if (combat && hasSetTier(state, "Regalia of the Eternal Bastion", 4)) {
    combat.wallsEndureDefStacks = Math.min(20, (combat.wallsEndureDefStacks || 0) + 1);
  }
  // Avatar of Endurance (Regalia of the Eternal Bastion 6pc): during its
  // 4-round window, every hit taken also grants +2 Attack/+2 Defense,
  // capped at +20/+20 for the window's duration — silent, the same
  // "roll/hit-time side effect with no narration channel" precedent Soul
  // Leech/Momentum/Blessing of Fortune's stack growth already established.
  if (combat && combat.avatarOfEnduranceTurns > 0) {
    combat.avatarOfEnduranceAtkBonus = Math.min(20, (combat.avatarOfEnduranceAtkBonus || 0) + 2);
    combat.avatarOfEnduranceDefBonus = Math.min(20, (combat.avatarOfEnduranceDefBonus || 0) + 2);
  }
  return lines;
}

// Unbroken Line (Divine Regalia — Bulwark of Champions): every 3rd
// instance of taking damage grants 25% Damage Reduction for the next 2
// rounds, then the counter resets — checked against the OLD reduction
// window (so the hit that trips the 3rd count isn't itself reduced by
// the window it just opened), then the counter advances/resets for next
// time. Called on the raw incoming damage, before applyPlayerDamage
// consumes Temporary Health, mirroring where Shield Wall/Master Duelist
// already sit in the existing damage-reduction chain.
function applyUnbrokenLine(state, dmg) {
  if (!state.combat || !hasEffect(state, "unbroken_line")) return dmg;
  const combat = state.combat;
  const reduced = combat.damageReductionTurns > 0 ? Math.round(dmg * 0.75) : dmg;
  if (dmg > 0) {
    combat.unbrokenLineHitCount = (combat.unbrokenLineHitCount || 0) + 1;
    if (combat.unbrokenLineHitCount >= 3) {
      combat.unbrokenLineHitCount = 0;
      combat.damageReductionTurns = applyBeneficialEffectBonuses(state, 2);
    }
  }
  return reduced;
}

// abilityCtx (Enemy Ability Engine, data/enemyabilities.js): when set,
// this creature is using a named Active ability instead of its plain
// retaliation — resolveEnemyActiveAbility (below) already resolved which
// one, its cooldown, and any conditional damage-multiplier bonuses, so
// this just needs to use the resolved dmgMult (a fixed % of Attack,
// deterministic rather than the usual randInt spread — the codex phrases
// every active as "Deal X% Attack," not a range) and, after the hit lands,
// roll any `inflict`/apply any `selfBuff`/`selfDebuff`/`healOnHitPct` it
// specifies. Elemental creatures (enemy mages) never carry `actives`, so
// abilityCtx only ever reaches the physical branch below.
function resolveEnemyRetaliation(state, creature, atkSpread, extraDef, abilityCtx) {
  const combat = state.combat;
  const bonusDef = extraDef || 0;
  // Reinforced (Divine Regalia — Forgeguard Buckler): every 3rd enemy
  // ATTACK against the player (counted here, unconditionally, before any
  // of the early-return misses/evasions below — an "attack" that gets
  // evaded still counts as an attack, unlike Walls Endure/Unbroken Line's
  // narrower "damage actually taken" counters) permanently grants +2
  // Defense, capped at +20 (10 triggers).
  if (hasEffect(state, "reinforced")) {
    combat.reinforcedAttackCount = (combat.reinforcedAttackCount || 0) + 1;
    if (combat.reinforcedAttackCount % 3 === 0 && (combat.reinforcedDefStacks || 0) < 20) {
      combat.reinforcedDefStacks = Math.min(20, (combat.reinforcedDefStacks || 0) + 2);
    }
  }
  // A stunned enemy simply doesn't act at all this turn — not a "miss," so
  // it's checked before the connects roll below, same as Reinforced above.
  if (combat.enemyStunned) {
    combat.enemyStunned = false;
    return { lines: [`${withThe(creature.name, true)} is still reeling and doesn't attack.`], damage: 0 };
  }
  // Accuracy vs Agility: does the attack even connect? Checked before every
  // special miss/evasion effect below, so none of those (Timeless Guard's
  // once-per-3-rounds negation, Guardian Spirit/Guided Footsteps' first-
  // attack charge, evasion charges, ...) ever get consumed on an attack
  // that was going to miss on its own merits anyway.
  if (!attackConnects(creature.acc, effectivePlayerAgility(state))) {
    return { lines: [`${withThe(creature.name, true)} attacks, but you're not where it expected you to be.`], damage: 0 };
  }
  // Timeless Guard (Divine Regalia — Chronal Dial): the first incoming
  // attack every 3 rounds deals 0 damage entirely, ahead of even
  // Guardian Spirit/Guided Footsteps — a full negation, not just a miss
  // chance, so it takes priority over the probabilistic checks below.
  if (applyTimelessGuard(state)) {
    return { lines: [`Timeless Guard — for a moment, time itself refuses to let the blow land.`], damage: 0 };
  }
  // Guardian Spirit (Mythic): the very first enemy attack each fight is a
  // guaranteed miss, checked before anything else (stun, evasion) since
  // it's a harder guarantee than either.
  if (hasEffect(state, "guardian_spirit") && !combat.guardianSpiritUsed) {
    combat.guardianSpiritUsed = true;
    return { lines: [`Guardian Spirit turns the first blow aside completely.`], damage: 0 };
  }
  // Guided Footsteps (Divine Regalia — Boots of the Hidden Path): a
  // softer, probabilistic Guardian Spirit — 75% instead of a guarantee,
  // same "first enemy attack only" gate.
  if (hasEffect(state, "guided_footsteps") && !combat.guidedFootstepsUsed) {
    combat.guidedFootstepsUsed = true;
    if (Math.random() < 0.75) {
      return { lines: [`Guided Footsteps — you're already a step from where it lands.`], damage: 0 };
    }
  }
  // Never Where Expected (Divine Regalia — Boots of the Wandering Wind): a
  // flat 15% miss chance on EVERY enemy attack (not just the first, unlike
  // Guardian Spirit/Guided Footsteps above), regardless of accuracy.
  if (hasEffect(state, "never_where_expected") && Math.random() < 0.15) {
    return { lines: [`Never Where Expected — it swings, and finds nothing there.`], damage: 0 };
  }
  // Blessing of Freedom (Regalia of the Endless Horizon 2pc): a flat 15%
  // evasion chance on every enemy attack — its own independent roll,
  // stacking with Never Where Expected/Guardian Spirit/Guided Footsteps if
  // a character somehow has several of these miss-chance sources at once.
  if (hasSetTier(state, "Regalia of the Endless Horizon", 2) && Math.random() < 0.15) {
    return { lines: [`Blessing of Freedom carries you clear of the blow.`], damage: 0 };
  }
  // Avatar of Freedom (Regalia of the Endless Horizon 6pc): an additional,
  // independent 50% evasion chance for its 4-round window — stacks with
  // Blessing of Freedom's 15% above rather than replacing it.
  if (combat.avatarOfFreedomTurns > 0 && Math.random() < 0.5) {
    return { lines: [`Avatar of Freedom carries you beyond its reach entirely.`], damage: 0 };
  }
  // Evasive Release's charges are a one-shot dodge chance, checked (and
  // consumed either way — "expires after triggering") before falling back
  // to Windcut/Blink's duration-based evasion window.
  let evasionRolled = false;
  if (combat.evasionCharges > 0) {
    combat.evasionCharges -= 1;
    evasionRolled = Math.random() < 0.5;
  } else if (combat.evasionTurns > 0) {
    evasionRolled = Math.random() < 0.5;
  }
  if (evasionRolled) {
    if (hasEffect(state, "evasive_guard")) combat.evasiveGuardBonus = Math.min(3, combat.evasiveGuardBonus + 1);
    if (creature.element && hasSetTier(state, "River Warden", 6)) {
      combat.riverWardenMagicBonus = Math.min(8, combat.riverWardenMagicBonus + 2);
    }
    return { lines: [`You slip past ${withThe(creature.name, false)}'s counter entirely.`], damage: 0 };
  }
  if (creature.element) {
    const matchup = elementMultiplier(null, creature.element, state.flags.isMage ? state.primaryElement : null);
    const base = randInt(creature.magic - 2, creature.magic + 2);
    // Mirror Soul (Artifact): the first hostile spell each combat is
    // reflected back at the caster wholesale — the raw, unmitigated roll,
    // before any of the player's own damage-reduction effects below apply
    // — instead of landing on the player at all. Safe to resolve a kill
    // from here if the reflection is lethal: every caller of
    // resolveEnemyRetaliation already null-guards on state.combat before
    // doing anything further with it.
    if (hasEffect(state, "mirror_soul") && !combat.mirrorSoulUsed) {
      combat.mirrorSoulUsed = true;
      const reflected = Math.max(0, Math.round(base * matchup));
      if (reflected > 0) {
        combat.hp -= reflected;
        combat.lastDamageType = creature.element;
        const lines = [`Mirror Soul turns ${withThe(creature.name, false)}'s spell back on it, for ${reflected} damage.`];
        if (combat.hp <= 0) lines.push(...resolveKill(state, creature));
        return { lines, damage: 0 };
      }
      return { lines: [`Mirror Soul readies itself, but there's nothing in the spell worth turning aside.`], damage: 0 };
    }
    const coldBonus = creature.element === "water" && hasColdproof(state) ? 2 : 0;
    const def = effectivePlayerDef(state) + bonusDef + coldBonus;
    let edmg = Math.max(0, Math.round(base * matchup) - Math.floor(def / 10));
    // Adaptive Ward (Mythic): the first elemental hit taken each fight
    // establishes resistance to that element for the rest of the fight;
    // this triggering hit isn't itself reduced, only subsequent hits of
    // the same element are (halved, stacking with Spell Ward and friends).
    if (hasEffect(state, "adaptive_ward")) {
      if (!combat.adaptiveWardElement) {
        combat.adaptiveWardElement = creature.element;
      } else if (creature.element === combat.adaptiveWardElement) {
        edmg = Math.round(edmg * 0.5);
      }
    }
    const swMult = spellWardMultiplier(state);
    if (swMult < 1) {
      edmg = Math.round(edmg * swMult);
      if (hasSetTier(state, "River Warden", 6)) combat.riverWardenMagicBonus = Math.min(8, combat.riverWardenMagicBonus + 2);
    }
    if (edmg > 0 && !combat.stormBarrierUsed) {
      combat.stormBarrierUsed = true;
      if (hasSetTier(state, "Stormwatch", 6)) edmg = Math.round(edmg * 0.5);
    }
    if (edmg > 0 && !combat.firstHitTakenUsed) {
      combat.firstHitTakenUsed = true;
      if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
    }
    edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
    edmg = applyUnbrokenLine(state, edmg);
    edmg = Math.round(edmg * preparedResponseMultiplier(state));
    edmg = Math.round(edmg * calmingPresenceMultiplier(state));
    edmg = Math.round(edmg * avatarOfDevotionDamageMultiplier(state));
    edmg = Math.round(edmg * blessingOfStoneMultiplier(state));
    edmg = Math.round(edmg * avatarOfEnduranceDamageMultiplier(state));
    edmg = Math.round(edmg * avatarOfRenewalDamageMultiplier(state));
    edmg = Math.round(edmg * adaptiveTideMagicMultiplier(state));
    edmg = Math.round(edmg * sharedBurdenMultiplier(state, edmg));
    edmg = applyUnyieldingWall(state, edmg);
    const absorbLines1 = applyPlayerDamage(state, edmg);
    if (edmg > 0 && hasEffect(state, "adaptive_tide")) {
      combat.adaptiveTideMagicStacks = Math.min(5, (combat.adaptiveTideMagicStacks || 0) + 1);
    }
    if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
    const elName = ELEMENTS[creature.element].name.toLowerCase();
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${elName} of its own, for ${edmg} damage.` : `Its ${elName} washes over you harmlessly.`, ...absorbLines1];
    if (state.health <= 0) lines.push(checkDeathPrevention(state) || `Everything goes dark.`);
    return { lines, damage: edmg };
  }
  const atk = effectiveEnemyAtk(state, creature);
  let edmg = abilityCtx
    ? Math.max(0, Math.round(atk * abilityCtx.dmgMult) - effectivePlayerDef(state) - bonusDef)
    : Math.max(0, randInt(atk - 1, atk + (atkSpread || 2)) - effectivePlayerDef(state) - bonusDef);
  if (edmg > 0 && !combat.firstHitTakenUsed) {
    combat.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
  edmg = applyUnbrokenLine(state, edmg);
  edmg = Math.round(edmg * preparedResponseMultiplier(state));
  edmg = Math.round(edmg * calmingPresenceMultiplier(state));
  edmg = Math.round(edmg * avatarOfDevotionDamageMultiplier(state));
  edmg = Math.round(edmg * blessingOfStoneMultiplier(state));
  edmg = Math.round(edmg * avatarOfEnduranceDamageMultiplier(state));
  edmg = Math.round(edmg * avatarOfRenewalDamageMultiplier(state));
  edmg = Math.round(edmg * adaptiveTidePhysicalMultiplier(state));
  edmg = Math.round(edmg * sharedBurdenMultiplier(state, edmg));
  edmg = applyUnyieldingWall(state, edmg);
  const absorbLines2 = applyPlayerDamage(state, edmg);
  if (edmg > 0 && hasEffect(state, "adaptive_tide")) {
    combat.adaptiveTidePhysicalStacks = Math.min(5, (combat.adaptiveTidePhysicalStacks || 0) + 1);
  }
  if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
  const verb = abilityCtx ? `uses ${abilityCtx.name} on you` : "hits back";
  const lines = [edmg > 0 ? `${withThe(creature.name, true)} ${verb} for ${edmg} damage.` : `You take no damage from its counter.`, ...absorbLines2];
  // Enemy Ability Engine: the ability's own consequences, resolved after
  // its damage has actually landed and been applied above — a status it
  // may inflict on the player, a self-buff/self-debuff on the creature
  // itself (both turn-limited, ticked in beginTurn), and healing the
  // creature for a fraction of the damage it just dealt.
  if (abilityCtx) {
    if (abilityCtx.inflict) lines.push(...applyAbilityInflict(state, abilityCtx.inflict, creature.name));
    if (abilityCtx.selfDebuff) applyEnemySelfModifier(combat, creature, abilityCtx.selfDebuff);
    if (abilityCtx.selfBuff) applyEnemySelfModifier(combat, creature, abilityCtx.selfBuff);
    if (abilityCtx.healOnHitPct && edmg > 0) {
      const heal = Math.round(edmg * abilityCtx.healOnHitPct);
      if (heal > 0) combat.hp = Math.min(combat.maxHp, combat.hp + heal);
    }
    // Flesh Reconstruction (Grand Voran-Daun): a flat self-heal off max
    // Health, independent of whether this particular use dealt damage —
    // unlike healOnHitPct above, which only ever pays out on a landed hit.
    if (abilityCtx.healSelfPct) {
      const heal = Math.round(combat.maxHp * abilityCtx.healSelfPct);
      if (heal > 0) combat.hp = Math.min(combat.maxHp, combat.hp + heal);
    }
    if (abilityCtx.packAuraBuff) applyPackAuraBuff(combat, creature, abilityCtx.packAuraBuff);
  }
  if (edmg > 0) lines.push(...checkMercyOfTheVeil(state));
  if (state.health <= 0) lines.push(checkDeathPrevention(state) || `Everything goes dark.`);
  return { lines, damage: edmg };
}

// Applies a temporary self-modifier from an active ability directly onto
// the ACTING creature's own (already-per-fight-cloned, so safe to mutate)
// stats — Reckless Charge's self-Defense-penalty, Savage Rush's self-Speed
// buff, and so on. `sign` is -1 for a selfDebuff, +1 for a selfBuff (both
// specs use the same shape: positive amounts meaning "grant this much",
// the sign here just decides whether that amount helps or hurts). Reversed
// exactly, turn for turn, in beginTurn's per-enemy loop below.
// spec's own values are already correctly signed (selfDebuff: { def: -10 },
// selfBuff: { spd: 15 }) — no sign flip needed here, just apply them.
function applyEnemySelfModifier(combat, creature, spec) {
  const enemy = combat.enemies[combat.activeIndex];
  const turns = spec.turns || 1;
  for (const [stat, amount] of Object.entries(spec)) {
    if (stat === "turns" || typeof amount !== "number") continue;
    creature[stat] = (creature[stat] || 0) + amount;
    enemy.selfBuffs.push({ stat, amount, turnsLeft: turns });
  }
}

// Adds a PERMANENT-for-the-fight self-buff directly onto a creature's own
// stats — used by the once-per-combat/staged/stacking Health-based
// passives below (Cornered, Unyielding, King's Fury, ...), which the
// codex phrases as "until the end of combat"/"for the encounter" rather
// than a plain few-turn window, so unlike applyEnemySelfModifier's
// selfBuffs bookkeeping, nothing here ever reverses it. `xPct` keys scale
// the stat's CURRENT value (Cornered's +20% Attack); plain keys add flat.
function applyPermanentSelfBuff(creature, buff) {
  if (!buff) return;
  for (const [stat, amount] of Object.entries(buff)) {
    if (stat === "turns" || typeof amount !== "number") continue;
    if (stat.endsWith("Pct")) {
      const baseStat = stat.slice(0, -3);
      creature[baseStat] = Math.round((creature[baseStat] || 0) * (1 + amount));
    } else {
      creature[stat] = (creature[stat] || 0) + amount;
    }
  }
}

// Enemy Ability Engine: per-round passive upkeep for one alive enemy —
// reversing any expired temporary self-buff/self-debuff from an Active
// (Reckless Charge's -Defense, Savage Rush's +Speed, ...), plus the
// recurring Health-based/regen passives that fire every round regardless
// of whether this creature's own action this round was an Active or a
// plain attack (resolveEnemyActiveAbility only ever resolves the reactive,
// "when I act" passives — firstAttack/bonusVsX — not these).
function tickEnemyPassives(state, e) {
  const lines = [];
  const creature = e.creatureObj;
  e.selfBuffs = (e.selfBuffs || []).filter((b) => {
    b.turnsLeft -= 1;
    if (b.turnsLeft > 0) return true;
    creature[b.stat] = (creature[b.stat] || 0) - b.amount;
    return false;
  });
  if (!e.alive || e.maxHp <= 0) return lines;
  for (const pid of creature.passives || []) {
    const p = getEnemyAbility(pid);
    if (!p) continue;
    if (p.trigger === "regenPerTurn" && e.hp > 0 && e.hp < e.maxHp) {
      const heal = Math.max(1, Math.round(e.maxHp * p.pct));
      const before = e.hp;
      e.hp = Math.min(e.maxHp, e.hp + heal);
      if (e.hp > before) lines.push(`${withThe(creature.name, true)} recovers ${e.hp - before} health.`);
    } else if (p.trigger === "healthBelowPct" && !e.passiveOnceFlags[pid] && e.hp / e.maxHp <= p.threshold) {
      e.passiveOnceFlags[pid] = true;
      applyPermanentSelfBuff(creature, p.selfBuff);
      lines.push(`${withThe(creature.name, true)} is hurt, and hits back harder for it.`);
    } else if (p.trigger === "healthStagedBuff") {
      const flagKey = pid + ":stage";
      const reached = (p.stages || []).filter((s) => e.hp / e.maxHp <= s).length;
      const already = e.passiveOnceFlags[flagKey] || 0;
      if (reached > already) {
        for (let n = already; n < reached; n++) applyPermanentSelfBuff(creature, p.selfBuff);
        e.passiveOnceFlags[flagKey] = reached;
        lines.push(`${withThe(creature.name, true)} grows steadier under punishment.`);
      }
    } else if (p.trigger === "everyPctHealthLostStacking") {
      const lostFraction = 1 - e.hp / e.maxHp;
      const stacks = Math.floor(lostFraction / p.pct);
      if (stacks > e.healthLostStacks) {
        for (let n = e.healthLostStacks; n < stacks; n++) applyPermanentSelfBuff(creature, p.selfBuff);
        e.healthLostStacks = stacks;
        lines.push(`${withThe(creature.name, true)} grows more dangerous as the fight wears on.`);
      }
    } else if (p.trigger === "periodicSummon") {
      // Corrupted Grove: "at the end of every third turn" — counted per
      // round here (this creature's own passive tick already only runs
      // once per round), reusing passiveOnceFlags as a plain counter the
      // same way healthStagedBuff's own flagKey does above.
      const counterKey = pid + ":turns";
      const turns = (e.passiveOnceFlags[counterKey] || 0) + 1;
      e.passiveOnceFlags[counterKey] = turns;
      if (turns % p.everyNTurns === 0) {
        const capKey = p.capKey || pid;
        const alreadyActive = state.combat.enemies.filter((x) => x.alive && x.summonSourceKey === capKey).length;
        if (p.maxActive != null && alreadyActive >= p.maxActive) {
          if (p.healPctIfMaxed) {
            const heal = Math.max(1, Math.round(e.maxHp * p.healPctIfMaxed));
            const before = e.hp;
            e.hp = Math.min(e.maxHp, e.hp + heal);
            if (e.hp > before) lines.push(`${withThe(creature.name, true)} recovers ${e.hp - before} health, its grove already at full strength.`);
          }
        } else {
          lines.push(...resolveEnemySummon(state, creature.level, p, pid, creature.name));
        }
      }
    }
  }
  return lines;
}

// Riposte: a free follow-up hit whenever the enemy's retaliation dealt
// zero damage (stunned, evaded, Decoy, or reduced to 0 by defense). Called
// by every action that either goes through resolveEnemyRetaliation (when
// its returned damage is 0) or otherwise guarantees a damage-free counter
// (Decoy, which doesn't call resolveEnemyRetaliation at all). White
// Watch's 4pc set bonus raises the multiplier from 0.5x to 0.75x; its 6pc
// grants a stacking +2 Defense for the rest of the fight each time this fires.
function maybeRiposte(state, creature) {
  if (!hasEffect(state, "riposte")) return [];
  if (!state.combat || state.combat.hp <= 0) return [];
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    return [`You seize the opening, but the riposte doesn't land.`];
  }
  // Clash of Steel (Divine Regalia — Gauntlets of the Unyielding): +50% to
  // Riposte's damage specifically — the only "counterattack" mechanic the
  // player has in this engine.
  const clashMult = hasEffect(state, "clash_of_steel") ? 1.5 : 1;
  const dmg = Math.round(rollPlayerDamage(state, creature) * riposteMultiplier(state) * clashMult);
  state.combat.hp -= dmg;
  state.combat.lastDamageType = "physical";
  const lines = [`You seize the opening — a free riposte for ${dmg} damage.`];
  if (hasSetTier(state, "White Watch", 6)) {
    state.combat.whiteWatchRiposteDefBonus = (state.combat.whiteWatchRiposteDefBonus || 0) + 2;
  }
  if (state.combat.hp <= 0) lines.push(...resolveKill(state, creature));
  return lines;
}

// Every Choice Matters (Divine Regalia — Ring of Unbroken Consequence)
// and Threads of Consequence (Regalia of the Woven Thread 4pc) both key
// off the same "the enemy's retaliation this turn dealt zero damage"
// signal Riposte already uses (dodge, stun, Decoy, or reduced to 0 by
// Defense) — called at the same 5 call sites as maybeRiposte.
function applyDodgeBlockNegateBonuses(state) {
  if (!state.combat) return [];
  const combat = state.combat;
  const lines = [];
  if (hasEffect(state, "every_choice_matters")) {
    const atkStacks = combat.everyChoiceAtkStacks || 0;
    if (atkStacks < 5) {
      combat.everyChoiceAtkStacks = atkStacks + 1;
      combat.everyChoiceMagicStacks = (combat.everyChoiceMagicStacks || 0) + 1;
      lines.push(`Every Choice Matters — the near miss sharpens you; +2 Attack, +2 Magic (now +${(atkStacks + 1) * 2}/+${(atkStacks + 1) * 2}).`);
    }
  }
  if (hasSetTier(state, "Regalia of the Woven Thread", 4) && !combat.threadsOfConsequencePending) {
    combat.threadsOfConsequencePending = true;
    lines.push(`Threads of Consequence — your next strike will land harder for it.`);
  }
  return lines;
}

// Resolves a cooldowns object key (a tactic id or an element id) to its
// display name — TACTICS and ELEMENT_ABILITIES are both keyed by id with
// their own .name, so this works for either a fighter's or a mage's
// currently-cooling-down technique.
function cooldownDisplayName(key) {
  if (TACTICS[key]) return TACTICS[key].name;
  if (ELEMENT_ABILITIES[key]) return ELEMENT_ABILITIES[key].name;
  return key;
}

// Twist of Fate (Regalia of the Laughing Gale 4pc): whenever one of this
// god's own random passives favors the player — Loaded Dice's double-
// damage roll, Winds of Change's per-round reroll, or a miss triggering
// Unlikely Outcome (see applyLaughingGaleMissBonuses below) — immediately
// restore 5% max Health and knock a turn off a random currently-cooling-
// down ability. Deliberately scoped to THIS set's own randomness rather
// than the pre-existing generic crit/dodge systems from other gods' sets,
// which would fire constantly and swamp the intended "chaos favors you"
// flavor with unrelated procs.
function applyTwistOfFate(state) {
  if (!state.combat || !hasSetTier(state, "Regalia of the Laughing Gale", 4)) return [];
  const combat = state.combat;
  const lines = [];
  const heal = Math.ceil(state.maxHealth * 0.05);
  if (heal > 0) {
    const { healed, lines: healLines } = applyHeal(state, heal);
    if (healed > 0) lines.push(`Twist of Fate mends you for ${healed} health.`, ...healLines);
  }
  const cooling = Object.keys(combat.cooldowns).filter((k) => combat.cooldowns[k] > 0);
  if (cooling.length) {
    const key = cooling[Math.floor(Math.random() * cooling.length)];
    combat.cooldowns[key] = Math.max(0, combat.cooldowns[key] - 1);
    lines.push(`Twist of Fate eases ${cooldownDisplayName(key)}'s recovery by a turn.`);
  }
  return lines;
}

// Unlikely Outcome (Divine Regalia — Ring of Lucky Misfortune): whenever
// an attack against the player fails to land — the same "retaliation
// dealt zero damage" signal Every Choice Matters/Threads of Consequence
// key off, above — the player's next attack is a guaranteed critical hit.
// Called at the same 5 call sites as applyDodgeBlockNegateBonuses.
function applyLaughingGaleMissBonuses(state) {
  if (!state.combat) return [];
  const combat = state.combat;
  const lines = [];
  if (hasEffect(state, "unlikely_outcome") && !combat.unlikelyOutcomeGuaranteedCrit) {
    combat.unlikelyOutcomeGuaranteedCrit = true;
    lines.push(`Unlikely Outcome — the miss steadies your hand; your next strike is a guaranteed critical hit.`);
  }
  lines.push(...applyTwistOfFate(state));
  return lines;
}

function availableActionNames(state) {
  if (!state.combat) return [];
  if (state.flags.isMage) {
    return [state.primaryElement, state.secondaryElement]
      .filter(Boolean)
      .filter((el) => elementAbilityAvailable(state, el))
      .map((el) => ELEMENT_ABILITIES[el].name.toLowerCase());
  }
  return unlockedTactics(state)
    .filter((id) => tacticAvailable(state, id))
    .map((id) => TACTICS[id].name.toLowerCase());
}

function tacticAvailable(state, tacticId) {
  if (!state.combat) return false;
  const t = TACTICS[tacticId];
  // Trailblazer (Divine Regalia) / Avatar of Freedom (Regalia of the
  // Endless Horizon 6pc): both bypass every gate here except cooldown —
  // kept consistent with the actual useX functions' own bypassed checks.
  const bypass = activationRestrictionsBypassed(state);
  if (state.knowledge < t.knowledgeReq && !bypass) return false;
  if (tacticId === "ambush") return bypass || !state.combat.turnTaken;
  if (tacticId === "disarm" && state.combat.disarmed && !bypass) return false;
  return (state.combat.cooldowns[tacticId] || 0) <= 0;
}

function elementAbilityAvailable(state, elementKey) {
  if (!state.combat) return false;
  const a = ELEMENT_ABILITIES[elementKey];
  const bypass = activationRestrictionsBypassed(state);
  if (state.knowledge < a.knowledgeReq && !bypass) return false;
  if (elementKey === "acid" && state.combat.corroded && !bypass) return false;
  return (state.combat.cooldowns[elementKey] || 0) <= 0;
}

// Reusable prompt suffix: "(fight / flee / feint / ambush)" or, for mages,
// "(fight / flee / ignite)" etc — listing only actions currently usable.
// "target" is appended whenever more than one enemy is still standing;
// "use" whenever the player is carrying at least one consumable.
function tacticsLine(state) {
  if (!state.combat) return null;
  const usable = availableActionNames(state);
  const targetOption = aliveEnemies(state).length > 1 ? ["target"] : [];
  const useOption = hasUsableConsumable(state) ? ["use"] : [];
  if (!usable.length && !targetOption.length && !useOption.length) return null;
  return `(fight / flee / ${[...usable, ...targetOption, ...useOption].join(" / ")})`;
}

// "target" (no argument): lists every living enemy with its current Health
// and whether it's the one currently being fought. "target <name>":
// switches the active enemy to the first living match — partial,
// case-insensitive, same matching leniency the rest of the parser uses
// elsewhere (see connectionMatchingName/findLocationByName).
function useTarget(state, arg) {
  if (!state.combat) return ["There's nothing here to fight."];
  const alive = state.combat.enemies.map((e, i) => ({ e, i })).filter(({ e }) => e.alive);
  if (alive.length <= 1) return ["There's only one thing to fight here."];
  if (!arg) {
    return alive.map(({ e, i }) => `${i === state.combat.activeIndex ? "-> " : "   "}${e.creatureObj.name} (${e.hp}/${e.maxHp} HP)`);
  }
  const needle = arg.toLowerCase();
  const match = alive.find(({ e }) => e.creatureObj.name.toLowerCase().includes(needle));
  if (!match) return [`Nothing here matches "${arg}".`];
  state.combat.activeIndex = match.i;
  return [`You turn your attention to ${withThe(match.e.creatureObj.name, false)}.`];
}

// creatureIdOrObject is either a BESTIARY key (string) or a dynamically
// generated combat target like an enemy mage (a full object, with its own
// .id) — see data/enemymages.js generateEnemyMage. `preRolledLevel` is
// optional — callers that already rolled a level to filter the encounter
// pool by (see data/bestiary.js creaturesEligibleAtLevel and its two
// parser.js call sites) pass it through so selection and scaling agree;
// omitted, a fresh level is rolled here exactly as before.
// Builds one per-fight enemy clone from a BESTIARY template at a given
// level — the same scaling startCombat has always done for a single
// creature (Object.assign the species base + computeCreatureStats), pulled
// out so it can also run once per member of a pack/squad roster.
// dangerClassOverride is set for packmates/underlings whose effective
// Danger Class was capped by rollEncounterGroup rather than their own
// natural one (never a higher tier than the encounter's anchor).
function buildFightCreature(template, level, dangerClassOverride) {
  const clampedLevel = clampLevelToRarityBand(level, template.spawnRarity);
  const effectiveTemplate = dangerClassOverride ? Object.assign({}, template, { dangerClass: dangerClassOverride }) : template;
  return Object.assign({}, effectiveTemplate, computeCreatureStats(effectiveTemplate, clampedLevel), { level: clampedLevel });
}

function startCombat(state, creatureIdOrObject, preRolledLevel) {
  const isDynamic = typeof creatureIdOrObject === "object";
  const template = isDynamic ? creatureIdOrObject : BESTIARY[creatureIdOrObject];
  // Quest/job-tied encounters (BESTIARY's `special` flag — e.g. Kabal
  // Enforcer patrols) and already-fully-generated dynamic creatures
  // (enemy mages) are exempt from the level roll and stat scaling below,
  // per the design's stated exception, AND from pack/squad grouping —
  // both spawn exactly one creature, same as before multi-enemy fights
  // existed. The clone means the shared BESTIARY dict entry itself is
  // never mutated between fights.
  let roster;
  if (isDynamic || template.special) {
    roster = [{ id: isDynamic ? creatureIdOrObject : creatureIdOrObject, creature: template, dynamicCreature: isDynamic }];
  } else {
    // Every packmate shares the anchor's rolled level (see
    // rollEncounterGroup) — buildFightCreature still clamps each one to
    // its OWN species' Spawn Rarity band, so a Common packmate spawning
    // alongside a Rare leader doesn't scale past what Common ever allows.
    const rolled = preRolledLevel != null ? preRolledLevel : rollEncounterLevel(state.level);
    roster = rollEncounterGroup(creatureIdOrObject).map((member) => ({
      id: member.id,
      creature: buildFightCreature(BESTIARY[member.id], rolled, member.dangerClass),
      dynamicCreature: false,
    }));
  }
  const enemies = roster.map(({ id, creature, dynamicCreature }) => ({
    creatureId: dynamicCreature ? creature.id : id,
    creatureObj: creature,
    dynamicCreature, // the real "is this an enemy mage, not a BESTIARY species" signal — see applyArchiveEternal
    name: creature.name,
    hp: creature.hp,
    maxHp: creature.hp,
    alive: true,
    skipNormalRetaliationThisRound: false, // set by resolveSpeedInitiative (unless the creature is `flurry`) so retaliation doesn't grant a second enemy action this round
    disarmed: false, // whether Disarm has already landed on this target
    corroded: false, // whether Corrode has already landed on this target
    enemyAtkPenalty: 0, // lasting attack reduction from Disarm
    enemyDefPenalty: 0, // lasting defense reduction from Corrode
    enemyStunned: false, // set by Concuss, consumed by this enemy's next turn
    burn: null, // Ignite's damage-over-time: { turnsLeft, dmgPerTurn }
    bleed: null, // Deep Cut's damage-over-time: { turnsLeft, dmgPerTurn }
    lastDamageType: null, // "physical"/"bleed"/an element key — whatever last hit this creature, for resolveKill's damage-type-flavored death line
    hamstringApplied: false, // gates Hamstring (once per target per fight)
    reinforcedAttackCount: 0, // Reinforced's (Divine Regalia) every-3rd-enemy-attack counter
    // Enemy Ability Engine (data/enemyabilities.js) — every field below is
    // scoped per-enemy so a pack of several creatures each track their own
    // cooldowns/stacks/history independently, same reasoning as everything
    // above.
    abilityCooldowns: {}, // abilityId -> turns remaining before reuse
    selfBuffs: [], // [{ stat, amount, pct, turns }] — this creature's own temporary self-modifiers from its actives/passives
    passiveOnceFlags: {}, // triggerId -> true, for oncePerCombat passives (Cornered, Apex Predator, Shed Skin, ...)
    firstActiveUsed: false, // gates firstAttack-triggered passives (Ambush, Silent Hunter, Patient Hunter, ...)
    healthLostStacks: 0, // King's Fury/Sky Sovereign/Ancient Predator's every-20%/25%-health-lost stack count
    hitsTakenFromPlayer: 0, // Adaptive Fighter's after-3-hits-from-the-same-target counter
    lastAttackTargetKind: null, // Relentless Pursuit's consecutive-same-target tracking: "player" or an ally's name
    consecutiveTargetStacks: 0,
    summonSourceKey: null, // this roster came from the normal pack/leader roll, not a mid-fight summon
  }));
  const creature = enemies[0].creatureObj;
  state.combat = {
    enemies,
    activeIndex: 0,
    turnTaken: false, // flips true after any action; gates Ambush
    enemyActedFirstThisRound: false, // set by resolveSpeedInitiative when Speed wins any enemy the first move this round; Stone's Patience's next-attack bonus
    nextAttackBonus: false, // set by Feint, consumed by the next hit
    defBuffTurns: 0, // Stoneskin duration remaining
    defBuffAmount: 0, // Stoneskin's defense bonus
    evasionTurns: 0, // Windcut duration remaining
    evasionCharges: 0, // Evasive Release's one-shot dodge charges
    evasiveGuardBonus: 0, // Evasive Guard's permanent-per-fight def, capped +3
    queenCarapaceBonus: 0, // Carapace Adaptation's stacking def, capped +9
    whiteWatchRiposteDefBonus: 0, // White Watch 6pc — stacking def per Riposte
    riverWardenMagicBonus: 0, // River Warden 6pc — stacking magic, capped +8
    siegeCorpsAtkCharge: 0, // Siege Corps 6pc — one-shot +2 atk after Brace
    lastElementUsed: null, // for elemental synergy — see data/synergy.js
    firstPhysicalAttackDone: false, // gates Opening Reach
    firstHitTakenUsed: false, // gates Stonewarden 6pc's first-hit reduction
    stormBarrierUsed: false, // gates Stormwatch 6pc's first-magical-hit reduction
    tacticalMemoryUsed: false, // gates Tactical Memory (once per fight)
    surgingConduitUsesLeft: surgingConduitCharges(state), // Surging Conduit's per-fight charges (1, or 2 with Conduit Master/Fragmenta)
    noviceFreeCastUsed: false, // gates Novitiate 6pc's free first elemental cast
    holdTheLineUsed: false, // gates Legion 8pc's below-30%-HP defense burst
    elderBarkSaveUsed: false, // gates Elder Bark 6pc's 1-HP cheat-death
    forestGuardianBonus: 0, // Vaeloris 6pc — consumed charge from a prior fight's Regrowth
    actionCounter: 0, // Heartwood Vitality's every-third-action counter
    lastStandUsed: false, // gates Last Stand's (Legendary) 1-HP cheat-death
    lastStandAtkBonus: 0, // Last Stand's +5 Attack, granted once triggered
    momentumStacks: 0, // Momentum's (Legendary) stacking damage bonus, capped at 5
    guardianSpiritUsed: false, // gates Guardian Spirit's (Mythic) auto-miss on the first enemy attack
    adaptiveWardElement: null, // Adaptive Ward's (Mythic) locked-in resisted element, once the first elemental hit lands
    perfectTimingUsed: false, // gates Perfect Timing's (Mythic) free first tactic
    livingSteelBonus: 0, // Living Steel's (Mythic) stacking atk/def bonus, capped at 5
    weaponAttackCounter: 0, // Echoing Arsenal's (Artifact) every-5th-physical-attack counter
    mirrorSoulUsed: false, // gates Mirror Soul's (Artifact) first-hostile-spell reflection
    rootedResolveUsed: false, // gates Rooted Resolve's (Divine Regalia) below-50%-HP defense burst
    avatarOfBloomUsed: false, // gates Avatar of Bloom's (Regalia of the First Bloom 6pc) below-25%-HP full burst
    atkBuffTurns: 0, // Avatar of Bloom's temporary +Attack duration remaining
    atkBuffAmount: 0,
    magicBuffTurns: 0, // Avatar of Bloom's temporary +Magic duration remaining
    magicBuffAmount: 0,
    livingCurrentStacks: 0, // Living Current's (Divine Regalia) stacking +2 Magic per heal, capped at +10 (5 stacks)
    tempHealth: 0, // Overflowing Life's (Regalia of the First Bloom 4pc) overflow-heal buffer, capped at 30% max Health
    spellCastCounter: 0, // Seedbearer's (Divine Regalia) every-3rd-cast counter
    regen: null, // Endless Bloom's (Divine Regalia) Regeneration HoT: { turnsLeft, healPerTurn }
    betweenWorldsUsed: false, // gates Between Worlds' (Divine Regalia) 1-HP cheat-death
    avatarOfPassingUsed: false, // gates Avatar of Passing's (Regalia of the Final Veil 6pc) below-25%-HP burst
    avatarOfPassingTurns: 0, // Avatar of Passing's temporary 30%-damage-dealt-as-healing duration remaining
    guidedFootstepsUsed: false, // gates Guided Footsteps' (Divine Regalia) 75%-chance first-attack miss
    everyChoiceAtkStacks: 0, // Every Choice Matters' (Divine Regalia) stacking +2 Attack per dodge/block/negate, capped at 5 (+10)
    everyChoiceMagicStacks: 0, // Every Choice Matters' stacking +2 Magic, capped at 5 (+10)
    threadsOfConsequencePending: false, // Threads of Consequence's (Regalia of the Woven Thread 4pc) next-attack +40% bonus
    avatarOfFateUsed: false, // gates Avatar of Fate's (Regalia of the Woven Thread 6pc) below-25%-HP burst
    avatarOfFateTurns: 0, // Avatar of Fate's temporary doubled-crit-bonus duration remaining
    avatarOfFateSaveUsed: false, // gates Avatar of Fate's once-during-the-effect 1-HP cheat-death
    worthyChallengeStacks: 0, // Worthy Challenge's (Divine Regalia) stacking +5% damage per attack, capped at 10 (+50%)
    unbrokenLineHitCount: 0, // Unbroken Line's (Divine Regalia) every-3rd-hit-taken counter
    damageReductionTurns: 0, // Unbroken Line's temporary 25% incoming-damage reduction duration remaining
    battleTemperedAtkStacks: 0, // Battle Tempered's (Divine Regalia) every-round +1 Attack, capped at 10
    battleTemperedDefStacks: 0, // Battle Tempered's every-round +1 Defense, capped at 10
    rallyTheLineUsed: false, // gates Rally the Line's (Divine Regalia) below-50%-HP +10/+10 burst
    avatarOfWarUsed: false, // gates Avatar of War's (Regalia of the Crimson Vanguard 6pc) below-25%-HP burst
    avatarOfWarTurns: 0, // Avatar of War's temporary lifesteal/expanded-Riposte duration remaining
    endlessStudyKeys: [], // Endless Study's (Divine Regalia) list of distinct abilities/tactics already used this fight
    endlessStudyMagicBonus: 0, // Endless Study's stacking +2 Magic per distinct action, capped at 20
    preparedResponseWitnessed: false, // gates Prepared Response's (Divine Regalia) from-the-2nd-hit-onward reduction
    avatarOfKnowledgeUsed: false, // gates Avatar of Knowledge's (Regalia of the Endless Archive 6pc) below-25%-HP burst
    avatarOfKnowledgeTurns: 0, // Avatar of Knowledge's temporary no-cooldown-spells/matchup-override duration remaining
    knowledgeBuffAmount: 0, // Avatar of Knowledge's +25 Knowledge, scoped to feed Expanding Mind's formula only
    compassionsGraceDefStacks: 0, // Compassion's Grace's (Divine Regalia) stacking +2 Defense per heal, capped at 5 (+10)
    sharedBurdenUsed: false, // gates Shared Burden's (Divine Regalia) once-per-fight big-hit reduction
    unwaveringDevotionStacks: 0, // Unwavering Devotion's (Divine Regalia) every-round +2 Magic, capped at 10
    loveEnduresUsed: false, // gates Love Endures' (Divine Regalia) below-20%-HP emergency heal
    avatarOfDevotionUsed: false, // gates Avatar of Devotion's (Regalia of the Eternal Heart 6pc) below-25%-HP burst
    avatarOfDevotionTurns: 0, // Avatar of Devotion's temporary doubled-healing/reduced-damage-taken duration remaining
    avatarOfDevotionSaveUsed: false, // gates Avatar of Devotion's once-during-the-effect post-cheat-death follow-up heal
    blessingOfFortuneCritStacks: 0, // Blessing of Fortune's (Divine Regalia) stacking +5% Critical Chance per crit, capped at 5 (+25%)
    unlikelyOutcomeGuaranteedCrit: false, // Unlikely Outcome's (Divine Regalia) next-attack guaranteed crit, set by a miss
    windsOfChangeAtk: 0, // Winds of Change's (Divine Regalia) current round's random +6 Attack, if that's the stat rolled
    windsOfChangeDef: 0, // Winds of Change's current round's random +6 Defense, if that's the stat rolled
    windsOfChangeMagic: 0, // Winds of Change's current round's random +6 Magic, if that's the stat rolled
    windsOfChangeKnowledge: 0, // Winds of Change's current round's random +6 Knowledge, if that's the stat rolled
    avatarOfChaosUsed: false, // gates Avatar of Chaos's (Regalia of the Laughing Gale 6pc) below-25%-HP burst
    avatarOfChaosTurns: 0, // Avatar of Chaos's temporary randomized-damage/doubled-crit-chance duration remaining
    avatarOfChaosAtkBonus: 0, // Avatar of Chaos's stacking random +10 Attack per crit during its window, capped at 30
    avatarOfChaosDefBonus: 0, // Avatar of Chaos's stacking random +10 Defense per crit during its window, capped at 30
    avatarOfChaosMagicBonus: 0, // Avatar of Chaos's stacking random +10 Magic per crit during its window, capped at 30
    avatarOfChaosKnowledgeBonus: 0, // Avatar of Chaos's stacking random +10 Knowledge per crit during its window, capped at 30
    unyieldingWallCooldown: 0, // Unyielding Wall's (Divine Regalia) once-every-3-rounds recharge, in rounds remaining
    wallsEndureDefStacks: 0, // Walls Endure's (Divine Regalia) stacking +1 Defense per hit taken, capped at 20
    avatarOfEnduranceUsed: false, // gates Avatar of Endurance's (Regalia of the Eternal Bastion 6pc) below-25%-HP burst
    avatarOfEnduranceTurns: 0, // Avatar of Endurance's temporary halved-damage-taken/boosted-healing duration remaining
    avatarOfEnduranceAtkBonus: 0, // Avatar of Endurance's stacking +2 Attack per hit taken during its window, capped at 20
    avatarOfEnduranceDefBonus: 0, // Avatar of Endurance's stacking +2 Defense per hit taken during its window, capped at 20
    momentumUnboundStacks: 0, // Momentum Unbound's (Divine Regalia) stacking +5% damage per action-type switch, capped at 6 (+30%)
    lastActionType: null, // Momentum Unbound's previous-turn action type ("attack"/"tactic"/"elemental"), for detecting a switch
    actionTypeHistory: [], // Ever Forward's (Regalia of the Endless Horizon 4pc) rolling window of the last 3 action types
    recentActionKeys: [], // Wanderer's Reward's (Divine Regalia) rolling window of the last 2 specific ability/tactic keys used
    trailblazerUsed: false, // gates Trailblazer's (Divine Regalia) first-Ability-or-Tactic activation-restriction bypass
    swiftPassageReady: false, // Swift Passage's (Divine Regalia) queued free-cooldown charge from the previous fight's kill
    avatarOfFreedomUsed: false, // gates Avatar of Freedom's (Regalia of the Endless Horizon 6pc) below-25%-HP burst
    avatarOfFreedomTurns: 0, // Avatar of Freedom's temporary evasion/cooldown-speed/restriction-bypass duration remaining
    temperedSteelStacks: 0, // Tempered Steel's (Divine Regalia) stacking +2% damage per successful attack, capped at 15 (+30%)
    reinforcedAttackCount: 0, // Reinforced's (Divine Regalia) every-3rd-enemy-attack counter
    reinforcedDefStacks: 0, // Reinforced's stacking +2 Defense per 3rd enemy attack, capped at 20
    workRefinesAtkStacks: 0, // Work Refines' (Divine Regalia) stacking +2 Attack per 3rd action, capped at 20
    workRefinesMagicStacks: 0, // Work Refines' stacking +2 Magic per 3rd action, capped at 20
    avatarOfCreationUsed: false, // gates Avatar of Creation's (Regalia of the Eternal Forge 6pc) below-25%-HP burst
    avatarOfCreationTurns: 0, // Avatar of Creation's temporary +40% Attack/Magic and doubled-cooldown-recovery duration remaining
    avatarOfCreationAtkStacks: 0, // Avatar of Creation's stacking PERMANENT +2 Attack per successful attack during its window (does not reset when the window ends)
    avatarOfCreationMagicStacks: 0, // Avatar of Creation's stacking PERMANENT +2 Magic per spell cast during its window (does not reset when the window ends)
    adaptiveTidePhysicalStacks: 0, // Adaptive Tide's (Divine Regalia) stacking -5% physical damage taken, capped at 5 (-25%)
    adaptiveTideMagicStacks: 0, // Adaptive Tide's stacking -5% magic damage taken, capped at 5 (-25%)
    endlessCurrentStacks: 0, // Endless Current's (Regalia of the Endless Tide 4pc) stacking +2/+2/+2 Attack/Defense/Magic per heal, capped at 5 (+10/+10/+10)
    avatarOfRenewalUsed: false, // gates Avatar of Renewal's (Regalia of the Endless Tide 6pc) below-25%-HP burst
    avatarOfRenewalTurns: 0, // Avatar of Renewal's temporary per-round-heal/reduced-damage-taken duration remaining
    timelessGuardCooldown: 0, // Timeless Guard's (Divine Regalia) once-every-3-rounds recharge, in rounds remaining
    perfectMemoryKeys: [], // Perfect Memory's (Divine Regalia) list of distinct Tactics/Elemental Abilities already used this fight
    perfectMemoryKnowledgeBonus: 0, // Perfect Memory's stacking +2 Knowledge per first-use, capped at 16 (8 distinct actions)
    hourglassReserveReady: hasEffect(state, "hourglass_reserve"), // Hourglass Reserve's (Divine Regalia) once-per-combat free-cooldown charge, available from combat start
    avatarOfTimeUsed: false, // gates Avatar of Time's (Regalia of the Eternal Hour 6pc) below-25%-HP burst
    avatarOfTimeTurns: 0, // Avatar of Time's temporary all-cooldowns-zeroed/frozen-buffs/+25%-damage duration remaining
    cooldowns: {},
    // Enemy Ability Engine (data/enemyabilities.js): the player's active
    // statuses (Bleed, Venom, Constrict, Pinned, ...) inflicted by enemy
    // Active abilities, keyed by status/custom-debuff id — see
    // applyPlayerStatus/tickPlayerStatuses.
    playerStatuses: {},
    naturesPersistenceUsed: false, // gates Nature's Persistence's (Regalia) first-crowd-control-free per fight
    unbreakableUsed: false, // gates Unbreakable's (Legendary) first-Defense-reduction-ignored per fight
    mercyOfTheVeilUsed: false, // gates Mercy of the Veil's (Regalia of the Final Veil 4pc) below-40%-HP cleanse-all
    orderedMindDefStacks: 0, // Ordered Mind's (Regalia) +2 Defense per resisted/ignored status, capped at 12
    calmWatersDefBonus: 0, // Calm Waters' (Regalia) +4 Defense per Cleansing Current proc, capped at 12
    calmWatersMagicBonus: 0, // Calm Waters' +4 Magic per Cleansing Current proc, capped at 12
    calmWatersTurns: 0, // Calm Waters' 2-round window remaining
  };
  wireActiveEnemyProxy(state.combat);
  // Companion Ability Engine (engine/companion.js): fresh cooldowns/taunt
  // state/once-per-combat flags for any kit-bearing ally, same "doesn't
  // carry over between fights" contract the enemy side already has.
  resetCompanionCombatState(state);
  const lines = [`${articled(creature.name)} blocks your path.`, creature.description];
  // A pack/squad roster: name every packmate up front so the player knows
  // what they're up against before the first "target" command.
  if (enemies.length > 1) {
    const others = enemies.slice(1).map((e) => e.creatureObj.name);
    lines.push(`It isn't alone — ${others.join(", ")} ${others.length === 1 ? "stands" : "stand"} with it.`);
  }
  // Enemy Ability Engine: Draconic Presence-style passives debuff the
  // player the instant combat starts, rather than reacting to a turn that
  // hasn't happened yet — so this runs once here instead of through the
  // normal per-turn passive dispatch.
  for (const e of enemies) {
    for (const pid of e.creatureObj.passives || []) {
      const p = getEnemyAbility(pid);
      if (p && p.trigger === "combatStartDebuff" && p.debuff) {
        lines.push(...applyPlayerStatus(state, pid, { debuff: p.debuff, turns: p.turns || 2 }, e.creatureObj.name));
      }
    }
  }
  // "combat.started" listeners handle every combat-start reaction that
  // doesn't itself produce a printed line (Endless Bloom's regen setup,
  // Forest Guardian/Swift Passage's charge transfers) — see below.
  Events.emit("combat.started", { creature, state });
  // Blessing of the Tide (Regalia of the Endless Tide 2pc): a one-time
  // 10% max Health heal at the moment any fight begins. Renamed from the
  // source text's own "Blessing of Renewal" — that exact name (and a
  // DIFFERENT mechanic, a per-round heal) is already taken by Regalia of
  // the First Bloom's own 2pc effect (js/data/effects.js,
  // blessing_of_renewal), so this needed its own distinct effect id and
  // display name. Its "10% Mana" half is a no-op — no Mana resource
  // exists in this engine.
  if (hasSetTier(state, "Regalia of the Endless Tide", 2)) {
    const heal = Math.ceil(state.maxHealth * 0.1);
    if (heal > 0) {
      const { healed, lines: healLines } = applyHeal(state, heal);
      if (healed > 0) lines.push(`Blessing of the Tide mends you for ${healed} health.`, ...healLines);
    }
  }
  // Weaver's Insight (Divine Regalia — Silver Thread of Veylana): reveal
  // the enemy's remaining Health, Defense, Attack, and any active status
  // at the start of combat. Its "future bosses reveal hidden phases one
  // turn earlier" clause is explicitly forward-looking (the user's own
  // wording) — nothing to build for that yet.
  if (hasEffect(state, "weavers_insight")) {
    const statusBits = [];
    if (creature.element) statusBits.push(`${ELEMENTS[creature.element].name} affinity`);
    if (creature.unique) statusBits.push("unique");
    lines.push(
      `Weaver's Insight unravels the moment: ${withThe(creature.name, false)} has ${creature.hp} Health, ${creature.def} Defense, ${creature.atk} Attack` +
        (statusBits.length ? ` (${statusBits.join(", ")})` : "") + "."
    );
  }
  // Blessing of Insight (Regalia of the Endless Archive 2pc): reveals
  // which elements the enemy is weak against, at the start of combat.
  // Only meaningful against elemental creatures — ELEMENT_MATCHUPS is a
  // strict cycle, so exactly 2 elements always counter any given one.
  if (hasSetTier(state, "Regalia of the Endless Archive", 2) && creature.element) {
    const counters = Object.entries(ELEMENT_MATCHUPS)
      .filter(([, m]) => m.strongVs.includes(creature.element))
      .map(([el]) => ELEMENTS[el].name);
    if (counters.length) {
      lines.push(`Blessing of Insight reveals a weakness: ${withThe(creature.name, false)} is exposed to ${counters.join(" and ")}.`);
    }
  }
  // Unsettling: a flat chance the enemy starts the fight already weakened,
  // rolled once here rather than in playerAttack/etc. since it's a
  // combat-start effect, not a per-action one.
  if (!creature.friendly && hasEffect(state, "unsettling") && Math.random() < 0.2) {
    state.combat.enemyAtkPenalty += 2;
    lines.push(`Something about you unsettles it before the fight even starts — its guard is already down.`);
  }
  if (creature.friendly) {
    lines.push(`It does not seem hostile. (try: talk, examine, or leave)`);
  } else {
    lines.push(tacticsLine(state) || "(fight / flee)");
  }
  return lines;
}

// "combat.started" listeners — every one of these is a hardwired, line-
// free reaction to a fight beginning that used to sit inline above.
Events.on("combat.started", ({ state }) => {
  // Endless Bloom (Divine Regalia — Seed of First Dawn): a 5-round
  // Regeneration HoT set up at the moment any fight begins, ticked in
  // beginTurn the same way burn/bleed are.
  if (hasEffect(state, "endless_bloom")) {
    const healPerTurn = Math.ceil(state.maxHealth * 0.05);
    if (healPerTurn > 0) state.combat.regen = { turnsLeft: applyBeneficialEffectBonuses(state, 5), healPerTurn };
  }
});
Events.on("combat.started", ({ state }) => {
  // Forest Guardian (Vaeloris 6pc): a Defense charge earned when Regrowth
  // activated after the PREVIOUS fight ended (Regrowth itself only ever
  // fires once combat is already over, so this is how its +2 Defense
  // actually reaches a fight).
  if (state.flags.forestGuardianCharge) {
    state.combat.forestGuardianBonus = 2;
    state.flags.forestGuardianCharge = false;
  }
});
Events.on("combat.started", ({ state }) => {
  // Swift Passage (Divine Regalia — Windstep Boots): transfers the charge
  // queued in resolveKill onto this fresh combat object — consumed by the
  // next Ability/Tactic's own cooldown assignment (Feint/Decoy/Disarm/
  // useElementAbility; Ambush has no cooldown to zero).
  if (state.flags.swiftPassageCharge) {
    state.combat.swiftPassageReady = true;
    state.flags.swiftPassageCharge = false;
  }
});

// Hold the Line (Legion 8pc): the first time the player's Health drops
// below 30% each fight, an immediate +6 Defense for 2 turns. Checked
// anywhere player Health just changed downward, since it's a reactive
// safety net rather than tied to a specific action.
function checkHoldTheLine(state) {
  const combat = state.combat;
  if (!combat || combat.holdTheLineUsed || !hasSetTier(state, "Legion", 8)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.3) return [];
  combat.holdTheLineUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 2);
  combat.defBuffTurns = Math.max(combat.defBuffTurns, dur);
  combat.defBuffAmount = Math.max(combat.defBuffAmount, applyBlessingOfCreationBonus(state, 6));
  return [`Hold the Line — your training snaps into place as your Health falls; +6 Defense for 2 turns.`];
}

// Rooted Resolve (Divine Regalia — Verdant Aegis): the first time the
// player's Health drops below 50% each fight, an immediate +8 Defense for
// 3 turns. Same shape as Hold the Line, just a different item-level
// effect instead of a set tier, and checked at the same call sites.
function checkRootedResolve(state) {
  const combat = state.combat;
  if (!combat || combat.rootedResolveUsed || !hasEffect(state, "rooted_resolve")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.5) return [];
  combat.rootedResolveUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.defBuffTurns = Math.max(combat.defBuffTurns, dur);
  combat.defBuffAmount = Math.max(combat.defBuffAmount, applyBlessingOfCreationBonus(state, 8));
  return [`Rooted Resolve — you plant yourself as your Health falls; +8 Defense for 3 turns.`];
}

// Love Endures (Divine Regalia — Bloom of Devotion): the first time each
// combat Health would fall below 20%, immediately restore 15% max
// Health. Checked at the same call sites as the other threshold buffs —
// all of which only ever run when state.health > 0, exactly matching the
// source text's "does not prevent death from the triggering hit" (a
// lethal hit is handled by checkDeathPrevention instead, and this never
// gets checked at all in that case).
function checkLoveEndures(state) {
  const combat = state.combat;
  if (!combat || combat.loveEnduresUsed || !hasEffect(state, "love_endures")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.2) return [];
  combat.loveEnduresUsed = true;
  const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.15));
  if (healed <= 0) return [];
  return [`Love Endures — even now, it holds you up; mended for ${healed} health.`, ...lines];
}

// Rally the Line (Divine Regalia — General's Standard): the same below-
// 50%-Health trigger as Rooted Resolve above, granting both a flat +10
// Attack and +10 Defense for 4 rounds — reuses the shared atkBuffTurns/
// atkBuffAmount and defBuffTurns/defBuffAmount fields via Math.max, the
// same composition Avatar of Bloom already uses.
function checkRallyTheLine(state) {
  const combat = state.combat;
  if (!combat || combat.rallyTheLineUsed || !hasEffect(state, "rally_the_line")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.5) return [];
  combat.rallyTheLineUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
  combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, 10));
  combat.defBuffTurns = Math.max(combat.defBuffTurns, dur);
  combat.defBuffAmount = Math.max(combat.defBuffAmount, applyBlessingOfCreationBonus(state, 10));
  return [`Rally the Line — your Health falls, and the line holds; +10 Attack, +10 Defense for 4 rounds.`];
}

// Avatar of Bloom (Regalia of the First Bloom 6pc): once per fight, the
// first time the player's Health drops below 25%, an instant 50% max
// Health heal (routed through applyHeal like every other heal, so
// Flourishing Soul/Overflowing Life/Living Current all still apply), a
// status cleanse (currently a no-op — nothing in this engine ever applies
// a negative status effect to the player; see Immutable/Nature's
// Persistence), and +25% Attack/Magic/Defense for 3 turns. Checked at the
// same call sites as Hold the Line/Rooted Resolve.
function checkAvatarOfBloom(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfBloomUsed || !hasSetTier(state, "Regalia of the First Bloom", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfBloomUsed = true;
  const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.5));
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
  combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.25)));
  combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
  combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.25)));
  combat.defBuffTurns = Math.max(combat.defBuffTurns, dur);
  combat.defBuffAmount = Math.max(combat.defBuffAmount, applyBlessingOfCreationBonus(state, Math.round(state.def * 0.25)));
  return [`Avatar of Bloom awakens — you're mended for ${healed} health, and bloom with +25% Attack/Magic/Defense for 3 turns.`, ...lines];
}

// Avatar of Passing (Regalia of the Final Veil 6pc): once per fight, the
// same below-25%-Health trigger as Avatar of Bloom above (no threshold of
// its own was specified, so this mirrors its sibling god's exact number
// for consistency), granting 4 rounds of "damage dealt heals 30%" (see the
// avatarOfPassingTurns check in rollPlayerDamage). Its other three stated
// clauses — ignoring enemy resurrection, an AoE soul-explosion on kill,
// and Fear/Death-magic immunity — are no-ops for now: this engine has no
// enemy resurrection mechanic, no multi-target combat for an AoE to hit
// (the user's own note: "future multi-target support"), and no Fear/Death
// magic that could ever target the player in the first place.
function checkAvatarOfPassing(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfPassingUsed || !hasSetTier(state, "Regalia of the Final Veil", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfPassingUsed = true;
  combat.avatarOfPassingTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Passing awakens — for 4 rounds, the damage you deal returns to you as life.`];
}

// Avatar of Fate (Regalia of the Woven Thread 6pc): same below-25%-Health
// trigger as its sibling "Avatar of X" 6pc abilities (no threshold of its
// own was given, so this mirrors theirs for consistency). Grants 4 rounds
// of doubled crit bonus (see critMultiplier) and a once-during-the-effect
// 1-HP save (see checkDeathPrevention). Its "every attack cannot miss"
// and "enemy dodge/block/evasion ignored" clauses are trivially already
// true — no miss state exists on the player's attacks, and nothing in
// this engine ever lets an enemy dodge/block the player's attack in the
// first place.
function checkAvatarOfFate(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfFateUsed || !hasSetTier(state, "Regalia of the Woven Thread", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfFateUsed = true;
  combat.avatarOfFateTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Fate awakens — for 4 rounds, fate bends further in your favor.`];
}

// Avatar of War (Regalia of the Crimson Vanguard 6pc): same below-25%-
// Health trigger as its sibling "Avatar of X" abilities. Grants 4 rounds
// of +50% Attack (approximated as a flat addend off base state.atk, the
// same technique Avatar of Bloom uses for its own +25%), a 10%-damage-
// dealt-as-healing lifesteal (see rollPlayerDamage), and widens Riposte's
// trigger to fire on every enemy hit rather than only a zero-damage one
// (see the resolveEnemyRetaliation call sites). Its "immune to Fear/Stun/
// Disarm" clause is trivially already true — none of those exist as
// player-targeting mechanics in this engine — and "defeating an enemy
// immediately grants another attack" is inert for the same reason Second
// Wind (Mythic) is: a kill always ends this engine's single-enemy fight,
// so there's no next enemy for the extra attack to land on.
function checkAvatarOfWar(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfWarUsed || !hasSetTier(state, "Regalia of the Crimson Vanguard", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfWarUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.avatarOfWarTurns = dur;
  combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
  combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.5)));
  return [`Avatar of War awakens — for 4 rounds, you fight like the battle itself.`];
}

// Avatar of Knowledge (Regalia of the Endless Archive 6pc): same below-
// 25%-Health trigger as its sibling "Avatar of X" abilities. For 4
// rounds: every spell costs no cooldown (see useElementAbility),
// +50% Magic (approximated as a flat addend off base state.magic, the
// same technique the other Avatars use), +25 Knowledge (scoped to feed
// Expanding Mind's formula only — see effectiveMagic), elemental matchup
// penalties ignored/advantages flattened to 1.5x (see
// avatarOfKnowledgeMatchupOverride). Its "all attacks reveal hidden enemy
// statistics" clause is folded into this same activation message, once,
// rather than repeated on every subsequent attack.
function checkAvatarOfKnowledge(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfKnowledgeUsed || !hasSetTier(state, "Regalia of the Endless Archive", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfKnowledgeUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.avatarOfKnowledgeTurns = dur;
  combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
  combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.5)));
  combat.knowledgeBuffAmount = applyBlessingOfCreationBonus(state, 25);
  const creature = getCombatCreature(state);
  return [`Avatar of Knowledge awakens — for 4 rounds, every secret of the fight lies open. ${withThe(creature.name, false)} has ${combat.hp} Health remaining, ${creature.def} Defense, ${creature.atk} Attack.`];
}

// Avatar of Devotion (Regalia of the Eternal Heart 6pc): same below-25%-
// Health trigger as its sibling "Avatar of X" abilities. For 4 rounds:
// healing doubled and damage taken cut 35% (see applyHeal/
// avatarOfDevotionDamageMultiplier), every heal grants a +5/+5/+5 burst
// (also in applyHeal), and a once-during-the-effect 20% heal if any
// cheat-death save brings Health to 1 (see checkDeathPrevention). Its
// "cannot be Charmed, Feared, or emotionally manipulated" clause is
// trivially already true — no such mechanics exist on the player side.
function checkAvatarOfDevotion(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfDevotionUsed || !hasSetTier(state, "Regalia of the Eternal Heart", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfDevotionUsed = true;
  combat.avatarOfDevotionTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Devotion awakens — for 4 rounds, your heart shields you as much as your steel does.`];
}

// Avatar of Chaos (Regalia of the Laughing Gale 6pc): the same below-25%-
// Health once-per-fight trigger as its five sibling "Avatar of X"
// abilities. For 4 rounds: every hit's damage swings 75%-175%
// (avatarOfChaosDamageMultiplier), critical chance is doubled
// (critMultiplier), and every crit grants a random +10 Attack/Defense/
// Magic/Knowledge bonus (rollPlayerDamage) that persists for the rest of
// the window rather than tracking each proc's own independent 2-round
// timer — capped at +30 per stat, the same "permanent for the bounded
// window, capped" simplification already used for Compassion's Grace/
// Battle Tempered/Living Steel, since nothing here tracks multiple
// simultaneous per-instance buff durations. Its "negative status effects
// have a 50% chance to fail" clause is inert — the same reason as
// Fortune's Favor (Divine Regalia — Coincatcher's Buckler): no negative-
// status mechanic exists on the player side yet.
function checkAvatarOfChaos(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfChaosUsed || !hasSetTier(state, "Regalia of the Laughing Gale", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfChaosUsed = true;
  combat.avatarOfChaosTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Chaos awakens — for 4 rounds, fortune bends entirely to your whims.`];
}

// Avatar of Endurance (Regalia of the Eternal Bastion 6pc): the same
// below-25%-Health once-per-fight trigger as its seven sibling "Avatar of
// X" abilities. For 4 rounds: damage taken is halved
// (avatarOfEnduranceDamageMultiplier) and healing received is +50%
// (applyHeal), and every hit taken during the window grants +2 Attack/+2
// Defense, capped at +20/+20 (applyPlayerDamage). Its "immune to Defense
// reduction" and "immune to forced movement/knockback/displacement"
// clauses are trivially already true — the same reason as Bedrock/
// Grounded below: no such mechanics exist on the player side yet.
function checkAvatarOfEndurance(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfEnduranceUsed || !hasSetTier(state, "Regalia of the Eternal Bastion", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfEnduranceUsed = true;
  combat.avatarOfEnduranceTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Endurance awakens — for 4 rounds, you become an unmoving wall.`];
}

// Avatar of Freedom (Regalia of the Endless Horizon 6pc): the ninth
// "Avatar of X" once-per-fight below-25%-Health trigger. For 4 rounds:
// cooldowns recover twice as fast (beginTurn) and every Ability/Tactic's
// non-cooldown activation restrictions can be ignored (see
// activationRestrictionsBypassed), plus its own independent 50% evasion
// roll (resolveEnemyRetaliation, stacking with Blessing of Freedom's 15%
// since both are separate rolls). Its "immune to all control effects"
// clause is inert — the same reason as every other CC-immunity effect so
// far (no enemy-applied control mechanic exists yet; deferred to the
// promised enemy rework). Its "first failed attack each round is
// automatically rerolled" clause is also a no-op — the player's own
// attacks in this engine always deal at least 1 damage, with no miss/
// failure state on the player's side for a reroll to ever have anything
// to act on.
function checkAvatarOfFreedom(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfFreedomUsed || !hasSetTier(state, "Regalia of the Endless Horizon", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfFreedomUsed = true;
  combat.avatarOfFreedomTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Freedom awakens — for 4 rounds, nothing can hold you.`];
}

// Avatar of Creation (Regalia of the Eternal Forge 6pc): the tenth
// "Avatar of X" once-per-fight below-25%-Health trigger. For 4 rounds:
// +40% Attack/+40% Magic (a temporary buff via the shared atk/
// magicBuffAmount fields, boosted by Blessing of Creation like every
// other such buff), cooldowns recover twice as fast (beginTurn), and
// every successful attack/spell cast during the window PERMANENTLY grows
// Attack/Magic by +2 (rollPlayerDamage — deliberately outlives the
// window itself, unlike the temporary +40% buff granted here). Its "all
// passive abilities activate at 150% effectiveness" clause is inert —
// the same reason as Crafted Perfection/Perfected Craft below: no
// generic "a passive just activated" event exists to hook a blanket
// effectiveness multiplier into, the identical limitation Threads
// Intertwined (Regalia of the Woven Thread) already established.
function checkAvatarOfCreation(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfCreationUsed || !hasSetTier(state, "Regalia of the Eternal Forge", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfCreationUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.avatarOfCreationTurns = dur;
  combat.atkBuffTurns = Math.max(combat.atkBuffTurns || 0, dur);
  combat.atkBuffAmount = Math.max(combat.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.4)));
  combat.magicBuffTurns = Math.max(combat.magicBuffTurns || 0, dur);
  combat.magicBuffAmount = Math.max(combat.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.4)));
  return [`Avatar of Creation awakens — for 4 rounds, every strike and every cast reforges you anew.`];
}

// Avatar of Renewal (Regalia of the Endless Tide 6pc): the eleventh
// "Avatar of X" once-per-fight below-25%-Health trigger. For 4 rounds:
// restores 10% max Health at the end of every round (beginTurn) and cuts
// incoming damage by 30% (avatarOfRenewalDamageMultiplier). Its
// "automatically cleanse one negative effect each round" clause is
// inert — no negative-status mechanic exists on the player side, the
// same standing reason as Cleansing Current/Calm Waters above. Its
// "healing cannot be reduced or prevented" clause is trivially already
// true — nothing in this engine has ever reduced or prevented the
// player's own healing, so there's nothing for this to protect against.
// Its "every healing effect also restores an equal amount of Mana"
// clause is a no-op — no Mana resource exists, the same limitation
// Flowing Waters/Blessing of the Tide/Living Forge already cite.
function checkAvatarOfRenewal(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfRenewalUsed || !hasSetTier(state, "Regalia of the Endless Tide", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfRenewalUsed = true;
  combat.avatarOfRenewalTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Renewal awakens — for 4 rounds, the tide itself mends you.`];
}

// Avatar of Time (Regalia of the Eternal Hour 6pc): the twelfth and
// final "Avatar of X" once-per-fight below-25%-Health trigger — the only
// one whose OWN source text gives an explicit duration other than 4
// rounds (3, here), so that's honored exactly rather than the 4-round
// convention used everywhere a duration wasn't specified. On activation,
// every current cooldown is zeroed immediately; for the window's 3
// rounds, every attack deals +25% damage (rollPlayerDamage), buff
// durations don't decay (beginTurn), and new Ability/Tactic cooldowns
// cost 0 (see the cooldown-assignment sites in useFeint/useDecoy/
// useDisarm/useElementAbility). Its "debuff durations on you decrease
// twice as fast" clause is inert — no debuffs exist on the player side —
// and "you cannot be Stunned" is trivially already true — there's no
// player-stun mechanic to begin with (only enemies can be stunned, via
// Concuss). Its "cooldowns resume from whatever they'd have naturally
// reached" clause is simplified — see the avatarOfTimeTurns decrement in
// beginTurn for why.
function checkAvatarOfTime(state) {
  const combat = state.combat;
  if (!combat || combat.avatarOfTimeUsed || !hasSetTier(state, "Regalia of the Eternal Hour", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.avatarOfTimeUsed = true;
  combat.avatarOfTimeTurns = applyBeneficialEffectBonuses(state, 3);
  for (const key of Object.keys(combat.cooldowns)) combat.cooldowns[key] = 0;
  return [`Avatar of Time awakens — for 3 rounds, every clock in the world bends to yours.`];
}

// Regrowth: a flat post-combat heal, whether combat ended by winning or by
// fleeing successfully — presence-only (hasEffect), so multiple copies
// don't stack per the effect's own description. regrowthHealPct (data/
// sets.js) resolves which sets raise it from 5% to 10%. Vaeloris's 6pc
// (Forest Guardian) queues a Defense charge for the player's NEXT fight,
// since Regrowth only ever fires after combat has already ended.
function applyRegrowth(state) {
  if (!hasEffect(state, "regrowth")) return [];
  const heal = Math.ceil(state.maxHealth * regrowthHealPct(state));
  if (heal <= 0) return [];
  const { healed, lines } = applyHeal(state, heal);
  if (hasSetTier(state, "Vaeloris", 6)) state.flags.forestGuardianCharge = true;
  return [`Regrowth mends you for ${healed} health.`, ...lines];
}

// Vanguard Momentum (Contract Hunter 6pc): +1 Attack per kill, stacking
// to +5. Since every BESTIARY encounter is its own fully separate fight
// in this engine (no back-to-back multi-wave combat exists), "for the
// remainder of combat" is approximated as a charge that persists across
// fights until the player rests (see parser.js cmdRest) rather than
// resetting the instant this kill's combat object is torn down.
function applyVanguardMomentum(state) {
  if (!hasSetTier(state, "Contract Hunter", 6)) return [];
  const before = state.flags.vanguardMomentumStacks || 0;
  if (before >= 5) return [];
  state.flags.vanguardMomentumStacks = before + 1;
  state.recomputeStats(true);
  return [`Vanguard Momentum — the fight sharpens you; +1 Attack (${before + 1}/5 this streak).`];
}

// Passing Whisper (Divine Regalia — Ring of Last Breath): +1 Magic per
// kill, capped +15. Same "persists across fights, decays on rest" shape as
// Vanguard Momentum above, approximating "until combat ends" the same
// way — every encounter here is its own fully separate fight, with no
// back-to-back multi-kill combat for the bonus to have a real "until this
// same fight ends" boundary.
function applyPassingWhisper(state) {
  if (!hasEffect(state, "passing_whisper")) return [];
  const before = state.flags.passingWhisperStacks || 0;
  if (before >= 15) return [];
  state.flags.passingWhisperStacks = before + 1;
  state.recomputeStats(true);
  return [`Passing Whisper — a departing breath lends you strength; +1 Magic (${before + 1}/15 this streak).`];
}

// Soul Ledger (Divine Regalia — Coin of the Ferryman): a permanent,
// uncapped, whole-game kill counter (not reset by rest or a new fight,
// unlike Vanguard Momentum/Passing Whisper above). Every 100th kill offers
// a one-time permanent +1 Health/Magic/Defense choice — see cmdChoose in
// engine/parser.js for the "choose health/magic/defense" resolution.
function applySoulLedger(state, creature) {
  if (!hasEffect(state, "soul_ledger")) return [];
  state.soulLedgerCount = (state.soulLedgerCount || 0) + 1;
  if (state.soulLedgerCount % 100 === 0) {
    state.flags.pendingSoulLedgerChoice = true;
    return [`Soul Ledger — the 100th soul is recorded. Choose a permanent gift: 'choose health', 'choose magic', or 'choose defense'.`];
  }
  return [];
}

// Archive Eternal (Divine Regalia — Scholar's Seal): the first time each
// creature "species" is recorded, permanently grants +1 Knowledge —
// whole-game, uncapped (naturally bounded by however many distinct
// species/types actually exist). BESTIARY creatures use their stable
// bestiary key (state.combat.creatureId) as the species identifier;
// dynamically-generated creatures (enemy mages, whose own id/name is
// randomized per instance) are bucketed by element instead — the closest
// thing they have to a repeatable "type" — so this can't be farmed
// infinitely by just fighting more enemy mages.
function applyArchiveEternal(state, creature) {
  if (!hasEffect(state, "archive_eternal") || !state.combat) return [];
  const combat = state.combat;
  const speciesKey = combat.dynamicCreature ? "enemy_mage_" + (creature.element || "unknown") : combat.creatureId;
  if (!state.archiveEternalSeen) state.archiveEternalSeen = [];
  if (state.archiveEternalSeen.includes(speciesKey)) return [];
  state.archiveEternalSeen.push(speciesKey);
  state.archiveEternalKnowledgeBonus = (state.archiveEternalKnowledgeBonus || 0) + 1;
  return [`Archive Eternal — a new species recorded; +1 permanent Knowledge.`];
}

// Death line per damage type — keyed by state.combat.lastDamageType, set at
// every site that reduces combat.hp (burn/bleed DOTs, Mirror Soul's
// reflected spell, Riposte, the basic Attack, Decoy/Ambush/Disarm, and
// useElementAbility's casts). Falls back to the generic "falls" line for
// an untracked/missing type (e.g. resolveEnemyRetaliation's non-mage
// branch never sets it, since the ENEMY hitting itself isn't a kill path).
const DEATH_FLAVOR_BY_DAMAGE_TYPE = {
  physical: (name) => `${name} falls, its wounds finally too much to survive.`,
  bleed: (name) => `${name} finally bleeds out.`,
  fire: (name) => `${name} collapses, still smoldering.`,
  water: (name) => `${name} goes still, waterlogged and broken.`,
  earth: (name) => `${name} falls, crushed by stone.`,
  lightning: (name) => `${name} collapses, still twitching from the current.`,
  acid: (name) => `${name} dissolves where it falls.`,
  force: (name) => `${name} is thrown backward and doesn't rise again.`,
  transportation: (name) => `${name} doesn't fully reappear before it stops moving.`,
  air: (name) => `${name} crumples as the gust passes through it.`,
};

function deathFlavorLine(creature, damageType) {
  const name = withThe(creature.name, true);
  const flavor = DEATH_FLAVOR_BY_DAMAGE_TYPE[damageType];
  return flavor ? flavor(name) : `${name} falls.`;
}

// Shared victory handling — gold, loot, XP, job progress, ending combat.
function resolveKill(state, creature) {
  // The enemy that died is always whichever one is currently "active" —
  // every call site either has it as the caller's own target already, or
  // (beginTurn's DOT tick, for a non-active pack member) explicitly points
  // activeIndex at it first. Captured now, before anything below could
  // move it.
  const diedIndex = state.combat.activeIndex;
  const out = [`${deathFlavorLine(creature, state.combat && state.combat.lastDamageType)} ${creature.combatNotes || ""}`.trim()];
  const bounty = state.flags.isMercenary ? 1.5 : 1;
  // Scales off the creature's own encounter level (falling back to the
  // player's level for quest/job-tied creatures that skip the level roll
  // — see startCombat) and its Danger Class multiplier, replacing the old
  // flat tier-based formula.
  const rewardLevel = creature.level || state.level;
  const goldFound = Math.round(randInt(1, 4) * Math.ceil(rewardLevel / 5) * dangerClassMultiplier(creature.dangerClass) * bounty);
  state.gold += goldFound;
  out.push(`You find ${goldFound} gold on/near the creature.`);
  const loot = rollCreatureLoot(state, creature);
  if (loot) {
    state.inventory.push(loot);
    out.push(`It was also carrying ${formatItemLine(loot)}.`);
  }
  if (hasEffect(state, "blood_debt")) {
    const healPct = masterOfArmsDoubles(state, "blood_debt") ? 0.4 : 0.2;
    const heal = Math.ceil(state.maxHealth * healPct);
    if (heal > 0 && state.health < state.maxHealth) {
      const { healed, lines } = applyHeal(state, heal);
      out.push(`Blood Debt repaid — you're mended for ${healed} health.`, ...lines);
    }
  }
  // Blessing of Valor (Regalia of the Crimson Vanguard 2pc): if the
  // opening attack of the fight is what landed this kill, restore 15% max
  // Health — checked here (before state.combat is nulled below) since
  // only resolveKill knows the kill actually happened.
  if (hasSetTier(state, "Regalia of the Crimson Vanguard", 2) && state.combat && state.combat.actionCounter === 1) {
    const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.15));
    if (healed > 0) out.push(`Blessing of Valor — a killing opening blow steadies you; mended for ${healed} health.`, ...lines);
  }
  // Keeper of History (Regalia of the Eternal Hour 4pc): restore 10%
  // Health on a kill. Its "10% Mana" half is a no-op (no Mana resource),
  // and its "remove one cooldown from a random ability" half is
  // effectively a no-op too — a kill always ends this engine's single-
  // enemy fight, and the about-to-be-discarded combat object's cooldowns
  // have no bearing on the next one (unlike Swift Passage's explicitly
  // "next Ability or Tactic" wording, which this clause doesn't share).
  if (hasSetTier(state, "Regalia of the Eternal Hour", 4)) {
    const heal = Math.ceil(state.maxHealth * 0.1);
    if (heal > 0 && state.health < state.maxHealth) {
      const { healed, lines } = applyHeal(state, heal);
      if (healed > 0) out.push(`Keeper of History mends you for ${healed} health.`, ...lines);
    }
  }
  out.push(...applyArchiveEternal(state, creature));
  // Only end the whole encounter once no roster member is left standing —
  // a pack fight continues with whoever's left. applyArchiveEternal above
  // still needed activeIndex pointing at the creature that just died (it
  // reads combat.dynamicCreature), so this is deliberately the last thing
  // that happens before the roster bookkeeping.
  state.combat.enemies[diedIndex].alive = false;
  const survivorIndex = state.combat.enemies.findIndex((e) => e.alive);
  if (survivorIndex === -1) {
    // The Grand Ovum (engine/arena.js): read while state.combat still
    // exists, same reasoning as Blessing of Valor/Keeper of History above
    // — a won arena match's reputation/streak/prize payout on top of the
    // ordinary gold/XP/loot this kill already produced. A won Tournament
    // round chains straight into the next round's startArenaFight from
    // inside concludeArenaFightWon, replacing state.combat with a fresh
    // fight rather than leaving it null — only null out the ORIGINAL
    // combat object, so that replacement survives.
    const combatBeforeConclusion = state.combat;
    if (state.combat.isArenaFight) out.push(...concludeArenaFightWon(state));
    // Thalvora ambush (engine/arena.js, Hadrian's alternate recruitment
    // path) — the same "last enemy of five falls" moment as any other
    // fight, just with its own recruitment-offer follow-up.
    if (state.combat.isHadrianAmbush) out.push(...concludeHadrianAmbush(state));
    if (state.combat === combatBeforeConclusion) state.combat = null;
    // The fight is genuinely over (last enemy down) — charge its time
    // cost once here, not per-kill within a pack.
    out.push(...advanceTime(state, randInt(10, 30), "combat"));
  } else {
    state.combat.activeIndex = survivorIndex;
    const remaining = state.combat.enemies.filter((e) => e.alive).length;
    out.push(`${remaining} more ${remaining === 1 ? "enemy stands" : "enemies stand"} against you.`);
  }
  // Every pure side-effect fragment that used to be hardwired inline here
  // (Kessa's quest-ready flag, Battle Scholar, Living Legacy, Victor's
  // Momentum, Swift Passage — none of them ever produced a printed line)
  // now lives as an "enemy.killed" listener instead. Emitted here,
  // deliberately before recomputeStats below, since Battle Scholar/Living
  // Legacy/Victor's Momentum all feed stats it recomputes.
  Events.emit("enemy.killed", { creature, state });
  state.recomputeStats(true);
  out.push(...applyRegrowth(state));
  out.push(...applyVanguardMomentum(state));
  out.push(...applyPassingWhisper(state));
  out.push(...applySoulLedger(state, creature));
  out.push(...state.gainXp(xpFromKill(state, creature)));
  out.push(...checkJobProgressOnKill(state, creature));
  return out;
}

// "enemy.killed" listeners — every one of these used to be a hardwired,
// line-free fragment inline in resolveKill above. Split into separate
// listeners (rather than one handler doing all five) so each stays as
// easy to find/reason about as it was as its own commented block.
Events.on("enemy.killed", ({ state }) => {
  // Kessa's recruitment quest (parser.js's maybeTalkToKessa): "clear one
  // real fight" just means winning any combat encounter after she's made
  // the offer — a light, tutorial-weight bar, not a specific bounty.
  if (state.flags.kessaQuestOffered && !state.flags.kessaQuestReady) {
    state.flags.kessaQuestReady = true;
  }
});
Events.on("enemy.killed", ({ state }) => {
  // Battle Scholar (Artifact): +1 Knowledge, permanently, after every
  // kill — capped at +50 total.
  if (hasEffect(state, "battle_scholar") && state.battleScholarBonus < 50) {
    state.battleScholarBonus += 1;
  }
});
Events.on("enemy.killed", ({ creature, state }) => {
  // Living Legacy (Artifact): +1 permanent max Health after an Elite-or-
  // stronger kill, capped +100 — same isNotableCreature check Kingslayer uses.
  if (hasEffect(state, "living_legacy") && isNotableCreature(creature) && state.livingLegacyBonus < 100) {
    state.livingLegacyBonus += 1;
  }
});
Events.on("enemy.killed", ({ state }) => {
  // Victor's Momentum (Divine Regalia — Ring of Conquest): +3 Attack per
  // kill, persisting across fights and decaying on rest — the same
  // approximation Vanguard Momentum/Passing Whisper use for "for the
  // remainder of combat" in an engine where a kill always ends the fight.
  // No cap was given for this one (unlike Passing Whisper's explicit +15),
  // so it's left uncapped, relying on the same rest-decay safety valve.
  if (hasEffect(state, "victors_momentum")) {
    state.flags.victorsMomentumStacks = (state.flags.victorsMomentumStacks || 0) + 3;
  }
});
Events.on("enemy.killed", ({ state }) => {
  // Swift Passage (Divine Regalia — Windstep Boots): defeating an enemy
  // queues a charge that grants the next Ability or Tactic used a free
  // cooldown — since a kill always ends this engine's single-enemy fight,
  // that "next" use only ever happens in the PLAYER's next fight, the same
  // "queue a charge for the next fight" pattern Forest Guardian (Vaeloris
  // 6pc) already established (see startCombat, where the charge is
  // transferred onto the fresh combat object).
  if (hasEffect(state, "swift_passage")) {
    state.flags.swiftPassageCharge = true;
  }
});

function playerAttack(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  let creature = getCombatCreature(state);
  if (creature.friendly) {
    return [`${withThe(creature.name, true)} has done you no harm. Attacking it seems both unwise and unkind.`];
  }

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    // Already dead from a DOT tick this same beginTurn — kill it, and if
    // the fight goes on, re-target the survivor resolveKill just made
    // active and keep this action going against it, rather than ending
    // the round here.
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "attack"), ...applyWanderersReward(state, "attack"), ...applyActionTypeTracking(state, "attack"));

  // "Physical" here mirrors rollPlayerDamage's own branch check — a mage
  // with a primary element deals magic damage instead, so Opening
  // Reach/Deep Cut/Hamstring/Guarded Strike (all physical-attack effects)
  // don't apply to that basic attack.
  const isPhysical = !(state.flags.isMage && state.primaryElement);
  const activeElement = isPhysical ? null : pickElement(state);
  let isPhysicalHit = false;
  // Accuracy vs Agility: does this attack even connect? A miss here
  // doesn't consume Feint's nextAttackBonus (it's preserved for the next
  // real attempt) or any of the on-hit-only effects below.
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    out.push(`Your attack goes wide — ${withThe(creature.name, false)} isn't where you expected.`);
  } else {
    let dmg = rollPlayerDamage(state, creature, activeElement);
    if (isPhysical) dmg = applyOpeningReach(state, dmg);
    // Borrowed Seconds (Divine Regalia — Epochkeeper): a plain Attack has
    // no cooldown to refund, so its every-4th-action trigger grants +15%
    // damage to this hit instead.
    if (borrowedSecondsActive(state)) dmg = Math.round(dmg * 1.15);
    if (state.combat.nextAttackBonus) {
      const feintMult = hasEffect(state, "patient_aim") ? 1.75 : 1.6;
      dmg = Math.round(dmg * feintMult);
      state.combat.nextAttackBonus = false;
      out.push("Your feint pays off —");
    }
    state.combat.hp -= dmg;
    state.combat.lastDamageType = isPhysical ? "physical" : activeElement;
    out.push(attackFlavorLine(state, creature, dmg, activeElement));
    isPhysicalHit = isPhysical;

    if (state.combat.hp <= 0) {
      // Killing your target doesn't end the round — the rest of the
      // pack (and, if it was the last one standing, nothing) still gets
      // to act below. Re-target the survivor before anything downstream
      // (retaliation's own bookkeeping, Riposte) reads `creature` again.
      out.push(...resolveKill(state, creature));
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    } else if (isPhysical) {
      out.push(...applyPhysicalOnHitEffects(state, creature));
    }
  }

  const guardBonus = isPhysicalHit && hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function attemptFlee(state) {
  if (!state.combat) return ["There's nothing to flee from."];
  let creature = getCombatCreature(state);

  // Replaces the old flat tier-based penalty: harder to escape something
  // above your own level, and harder still against a Boss/World Boss,
  // regardless of level — clamped so neither factor alone can make
  // fleeing a certain success or a certain failure.
  const levelGap = (creature.level || state.level) - state.level;
  const dangerPenalty = (dangerClassMultiplier(creature.dangerClass) - 1) * 0.1;
  const chance = Math.max(0.05, Math.min(0.9, 0.6 - levelGap * 0.03 - dangerPenalty + (state.stealthMod || 0)));
  if (Math.random() < chance) {
    // Thalvora ambush (engine/arena.js): fleeing this specific fight
    // costs Hadrian his life, permanently, per Section 6's failure
    // condition — checked and reported BEFORE state.combat is nulled.
    const ambushLoss = state.combat.isHadrianAmbush ? markHadrianLostInAmbush(state) : [];
    state.combat = null;
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`, ...ambushLoss, ...applyRegrowth(state), ...advanceTime(state, randInt(10, 30), "combat")];
  }

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }

  const combat = state.combat;
  // A failed flee still only ever gives the current active enemy one
  // swing (this has never looped the whole pack), but that swing can now
  // land on an ally instead of the player — the same split
  // pickEnemyAttackTarget uses everywhere else, rather than the full
  // player-mitigation pipeline below (which is all player-only gear
  // effects with no bearing on an ally).
  const fleeTarget = pickEnemyAttackTarget(state);
  if (fleeTarget.kind === "ally") {
    const result = resolveEnemyAttackOnAlly(state, creature, fleeTarget.ally);
    out.push(`You fail to get clear —`, ...result.lines);
    const tl = tacticsLine(state);
    if (tl) out.push(tl);
    return out;
  }
  let edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 1) - effectivePlayerDef(state));
  if (edmg > 0 && !combat.firstHitTakenUsed) {
    combat.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
  edmg = applyUnbrokenLine(state, edmg);
  edmg = Math.round(edmg * preparedResponseMultiplier(state));
  edmg = Math.round(edmg * calmingPresenceMultiplier(state));
  edmg = Math.round(edmg * avatarOfDevotionDamageMultiplier(state));
  edmg = Math.round(edmg * blessingOfStoneMultiplier(state));
  edmg = Math.round(edmg * avatarOfEnduranceDamageMultiplier(state));
  edmg = Math.round(edmg * avatarOfRenewalDamageMultiplier(state));
  edmg = Math.round(edmg * adaptiveTidePhysicalMultiplier(state));
  edmg = Math.round(edmg * sharedBurdenMultiplier(state, edmg));
  edmg = applyUnyieldingWall(state, edmg);
  const absorbLines = applyPlayerDamage(state, edmg);
  if (edmg > 0 && hasEffect(state, "adaptive_tide")) {
    combat.adaptiveTidePhysicalStacks = Math.min(5, (combat.adaptiveTidePhysicalStacks || 0) + 1);
  }
  if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
  out.push(`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`, ...absorbLines);
  if (state.health <= 0) {
    out.push(checkDeathPrevention(state) || `Everything goes dark.`);
  } else {
    out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  }
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// ---- Fighter tactics (non-mage only — mages use useElementAbility) ----

// Tactical Memory: once per fight, the first tactic-cooldown assignment
// that rolls successfully (tacticalMemoryChance — 20% base, 50% with
// Examiner 6pc/First Kingdom 4pc — re-rolled on each qualifying use until
// one hits) gets cut by 1 turn (minimum 1). Shared by Feint, Decoy, and
// Disarm — Ambush has no cooldown to shorten.
function applyTacticalMemory(state, cooldown) {
  if (!cooldown || state.combat.tacticalMemoryUsed || !hasEffect(state, "tactical_memory")) {
    return { cooldown, fired: false };
  }
  if (Math.random() < tacticalMemoryChance(state)) {
    state.combat.tacticalMemoryUsed = true;
    return { cooldown: Math.max(1, cooldown - 1), fired: true };
  }
  return { cooldown, fired: false };
}

// Perfect Timing (Mythic): the first tactic used each fight ignores its
// cooldown entirely — takes priority over First Kingdom/Master
// Strategist's flat reduction and Tactical Memory's probabilistic one,
// both moot once the cooldown is already 0.
function applyPerfectTiming(state) {
  if (!hasEffect(state, "perfect_timing") || state.combat.perfectTimingUsed) return false;
  state.combat.perfectTimingUsed = true;
  return true;
}

// First Kingdom's 6pc set bonus and Master Strategist (Mythic) are both a
// flat, unconditional -1 to every tactic's cooldown, applied before
// Tactical Memory's probabilistic reduction (both can apply to the same
// cast) — every call site checks either source before calling this.
function applyFirstKingdomCooldown(cooldown) {
  return Math.max(1, cooldown - 1);
}

function useFeint(state) {
  if (!state.combat) return ["There's nothing here to feint at."];
  if (state.flags.isMage) return ["Feinting isn't how your magic works. Try your element's ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
  if (state.combat.nextAttackBonus) return [`You're already coiled for a strike — feint again once you've used it.`];
  const t = TACTICS.feint;
  if (state.knowledge < t.knowledgeReq && !activationRestrictionsBypassed(state)) return [`You don't know how to feint yet. (needs Knowledge ${t.knowledgeReq}+)`];
  // Perfect Recall (Artifact): the gate itself is skipped entirely, rather
  // than zeroing state.combat.cooldowns.feint — cooldowns still accrue
  // normally underneath (so losing the effect mid-fight falls back to
  // whatever's actually stored), they just never block the next use.
  if ((state.combat.cooldowns.feint || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Feint is still recovering — ${state.combat.cooldowns.feint} more turn(s).`];

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "feint"), ...applyWanderersReward(state, "feint"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "feint"));
  consumeTrailblazer(state);
  state.combat.nextAttackBonus = true;
  let feintMemory;
  if (state.combat.avatarOfTimeTurns > 0) {
    feintMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    feintMemory = { cooldown: 0, fired: false };
  } else if (state.combat.swiftPassageReady) {
    state.combat.swiftPassageReady = false;
    feintMemory = { cooldown: 0, fired: false };
  } else if (state.combat.hourglassReserveReady) {
    state.combat.hourglassReserveReady = false;
    feintMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = hasEffect(state, "feinting_edge") ? 1 : t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    feintMemory = applyTacticalMemory(state, baseCooldown);
  }
  // Borrowed Seconds (Divine Regalia — Epochkeeper): refunds 50% of
  // whatever cooldown was just computed above (a no-op if it's already 0
  // from one of the free-cast sources above).
  if (borrowedSecondsActive(state) && feintMemory.cooldown > 0) {
    feintMemory.cooldown = Math.round(feintMemory.cooldown / 2);
  }
  state.combat.cooldowns.feint = feintMemory.cooldown;

  out.push(`You feint — ${withThe(creature.name, false)} doesn't bite, but your next strike will land hard.`);
  if (feintMemory.cooldown === 0 && !feintMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (feintMemory.fired) out.push(`Old instincts kick in — Feint recovers faster this time.`);
  // Legion's Disciplined Formation (6pc, redefined): a one-shot +3
  // Defense against THIS same retaliation, functionally identical to
  // Brace — the two stack if somehow both are active.
  let braceBonus = 0;
  if (hasEffect(state, "brace")) braceBonus += braceDefBonus(state);
  if (hasSetTier(state, "Legion", 6)) {
    braceBonus += 3;
    out.push(`Disciplined Formation — your training holds; +3 Defense against the counter.`);
  }
  if (hasEffect(state, "brace") && hasSetTier(state, "Siege Corps", 6)) {
    state.combat.siegeCorpsAtkCharge = 2;
  }
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useDecoy(state) {
  if (!state.combat) return ["There's nothing here to use that on."];
  if (state.flags.isMage) return ["Decoys aren't how your magic works. Try your element's ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't attacking you. No need for a decoy.`];
  const t = TACTICS.decoy;
  if (state.knowledge < t.knowledgeReq && !activationRestrictionsBypassed(state)) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.decoy || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Decoy is still recovering — ${state.combat.cooldowns.decoy} more turn(s).`];

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  // Captured now, before the player's own strike (below) has any chance to
  // kill this specific enemy — this is who's actually being decoyed, for
  // the skipNormalRetaliationThisRound flag further down.
  const decoyedIndex = state.combat.activeIndex;
  out.push(...applyEndlessStudy(state, "decoy"), ...applyWanderersReward(state, "decoy"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "decoy"));
  consumeTrailblazer(state);
  let decoyMemory;
  if (state.combat.avatarOfTimeTurns > 0) {
    decoyMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    decoyMemory = { cooldown: 0, fired: false };
  } else if (state.combat.swiftPassageReady) {
    state.combat.swiftPassageReady = false;
    decoyMemory = { cooldown: 0, fired: false };
  } else if (state.combat.hourglassReserveReady) {
    state.combat.hourglassReserveReady = false;
    decoyMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    decoyMemory = applyTacticalMemory(state, baseCooldown);
  }
  if (borrowedSecondsActive(state) && decoyMemory.cooldown > 0) {
    decoyMemory.cooldown = Math.round(decoyMemory.cooldown / 2);
  }
  state.combat.cooldowns.decoy = decoyMemory.cooldown;

  out.push(`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`);
  if (decoyMemory.cooldown === 0 && !decoyMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (decoyMemory.fired) out.push(`Old instincts kick in — Decoy recovers faster this time.`);
  // Accuracy vs Agility gates the player's own strike while the creature is
  // distracted — it still wastes its attack on the decoy either way (that
  // part isn't about whether YOUR hit landed).
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    out.push(`Your own strike goes wide, even with ${withThe(creature.name, false)} distracted.`);
  } else {
    let dmg = applyOpeningReach(state, rollPlayerDamage(state, creature));
    state.combat.hp -= dmg;
    state.combat.lastDamageType = "physical";
    out.push(attackFlavorLine(state, creature, dmg) + " (while it's distracted)");

    if (state.combat.hp <= 0) {
      out.push(...resolveKill(state, creature));
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    } else {
      out.push(...applyPhysicalOnHitEffects(state, creature));
    }
  }

  // Decoy only fools the one creature it's aimed at — if it's still alive,
  // it specifically sits this round out; anyone ELSE still standing in a
  // pack fight isn't distracted and acts normally.
  const decoyedEnemy = state.combat.enemies[decoyedIndex];
  if (decoyedEnemy && decoyedEnemy.alive) {
    out.push(`${withThe(decoyedEnemy.creatureObj.name, true)} wastes its attack on the decoy — you take no damage this turn.`);
  }
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, 0, decoyedIndex);
  out.push(...retaliation.lines);
  // Decoy always guarantees the decoyed enemy itself dealt no damage, so
  // Riposte/dodge bonuses fire unconditionally (matching the original
  // solo-fight behavior) rather than being gated on the whole pack's
  // aggregate retaliation.
  out.push(...maybeRiposte(state, creature), ...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useAmbush(state) {
  if (!state.combat) return ["There's nothing here to ambush."];
  if (state.flags.isMage) return ["Ambush isn't how your magic works. Try your element's ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} hasn't given you a reason to ambush it.`];
  const t = TACTICS.ambush;
  const ambushBypass = activationRestrictionsBypassed(state);
  if (state.knowledge < t.knowledgeReq && !ambushBypass) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.turnTaken && !ambushBypass) return [`The moment's passed — ambush only works as your opening move.`];

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "ambush"), ...applyWanderersReward(state, "ambush"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "ambush"));
  consumeTrailblazer(state);
  // Captured now, before the strike below has any chance to kill this
  // specific enemy — this is who's actually being ambushed, for the
  // skipNormalRetaliationThisRound flag further down.
  const ambushedIndex = state.combat.activeIndex;

  // Even an ambush can go wide — Accuracy vs Agility still decides it,
  // just with no counter either way since the creature never saw it coming.
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    out.push(`You strike first, but ${withThe(creature.name, false)} isn't where you aimed. No counter, but no damage either.`);
  } else {
    let dmg = Math.round(rollPlayerDamage(state, creature) * ambushMultiplier(state));
    // Borrowed Seconds (Divine Regalia — Epochkeeper): Ambush has no
    // cooldown to refund (per its own established "no cooldown to shorten"
    // design), so its every-4th-action trigger grants +15% damage instead.
    if (borrowedSecondsActive(state)) dmg = Math.round(dmg * 1.15);
    state.combat.hp -= dmg;
    state.combat.lastDamageType = "physical";
    out.push(`You strike first — ${withThe(creature.name, false)} never saw it coming. ${dmg} damage, no counter.`);

    if (state.combat.hp <= 0) {
      out.push(...resolveKill(state, creature));
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    } else {
      out.push(...applyPhysicalOnHitEffects(state, creature));
      if (hasEffect(state, "evasive_release")) {
        state.combat.evasionCharges += 1;
        out.push(`You're already moving again — the next counter aimed at you will have to find you first.`);
      }
    }
  }

  // Ambush only surprises the one creature it's aimed at — anyone else
  // still standing in a pack fight wasn't caught off guard and retaliates
  // normally, same as Decoy.
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, 0, ambushedIndex);
  out.push(...retaliation.lines);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useDisarm(state) {
  if (!state.combat) return ["There's nothing here to disarm."];
  if (state.flags.isMage) return ["Disarm isn't how your magic works. Try your element's ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't armed against you. Nothing to disarm.`];
  const t = TACTICS.disarm;
  const disarmBypass = activationRestrictionsBypassed(state);
  if (state.knowledge < t.knowledgeReq && !disarmBypass) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.disarmed && !disarmBypass) return [`It's already lost whatever you could have disarmed.`];
  if ((state.combat.cooldowns.disarm || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Disarm is still recovering — ${state.combat.cooldowns.disarm} more turn(s).`];

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "disarm"), ...applyWanderersReward(state, "disarm"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "disarm"));
  consumeTrailblazer(state);
  let disarmMemory;
  if (state.combat.avatarOfTimeTurns > 0) {
    disarmMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    disarmMemory = { cooldown: 0, fired: false };
  } else if (state.combat.swiftPassageReady) {
    state.combat.swiftPassageReady = false;
    disarmMemory = { cooldown: 0, fired: false };
  } else if (state.combat.hourglassReserveReady) {
    state.combat.hourglassReserveReady = false;
    disarmMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    disarmMemory = applyTacticalMemory(state, baseCooldown);
  }
  if (borrowedSecondsActive(state) && disarmMemory.cooldown > 0) {
    disarmMemory.cooldown = Math.round(disarmMemory.cooldown / 2);
  }
  state.combat.cooldowns.disarm = disarmMemory.cooldown;
  state.combat.disarmed = true;
  state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3;

  out.push(`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`);
  if (disarmMemory.cooldown === 0 && !disarmMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (disarmMemory.fired) out.push(`Old instincts kick in — Disarm recovers faster this time.`);
  // The disarm itself always lands (it's a grapple/tactic, not a strike) —
  // only the follow-up hit is gated on Accuracy vs Agility.
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    out.push(`The follow-up strike doesn't land, but the disarm holds.`);
  } else {
    let dmg = applyOpeningReach(state, Math.round(rollPlayerDamage(state, creature) * 0.7));
    state.combat.hp -= dmg;
    state.combat.lastDamageType = "physical";
    out.push(`You still land a hit for ${dmg} damage.`);

    if (state.combat.hp <= 0) {
      out.push(...resolveKill(state, creature));
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    } else {
      out.push(...applyPhysicalOnHitEffects(state, creature));
    }
  }

  const guardBonus = hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// ---- Elemental abilities (mage only — one per element, replaces tactics) ----

function useElementAbility(state, elementKey) {
  const a = ELEMENT_ABILITIES[elementKey];
  if (!state.combat) return [`Nothing to ${a.name.toLowerCase()} outside a fight.`];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. Save it.`];
  // World Walker (Artifact): Blink specifically ignores the known-element
  // gate entirely — usable by any class, mage or not, regardless of which
  // elements (if any) are actually known.
  const worldWalkerBypass = elementKey === "transportation" && hasEffect(state, "world_walker");
  // Trailblazer (Divine Regalia — Feather of the First Wind) and Avatar of
  // Freedom (Regalia of the Endless Horizon 6pc): "Blink ignores
  // conditional requirements" is one of the item's own stated examples,
  // generalized here to the known-element gate for ANY element, not just
  // the transportation element World Walker already special-cases above.
  const elementalBypass = activationRestrictionsBypassed(state);
  if (!worldWalkerBypass && !elementalBypass && elementKey !== state.primaryElement && elementKey !== state.secondaryElement && elementKey !== state.tertiaryElement) {
    return [`You haven't opened yourself to ${ELEMENTS[elementKey].name}.`];
  }
  if (state.knowledge < a.knowledgeReq && !elementalBypass) return [`You don't have the Knowledge for that yet. (needs Knowledge ${a.knowledgeReq}+)`];
  if (elementKey === "acid" && state.combat.corroded && !elementalBypass) return [`It's already lost whatever defenses you could corrode.`];
  if ((state.combat.cooldowns[elementKey] || 0) > 0) return [`${a.name} is still recovering — ${state.combat.cooldowns[elementKey]} more turn(s).`];

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (state.health <= 0) return out;
  // combat.spellCastCounter: an unconditional per-cast counter (every
  // elemental ability, regardless of what's equipped), shared by
  // Seedbearer (every 3rd) and Eureka (every 4th) below — the same
  // "shared counter, independent consumers" pattern as combat.actionCounter.
  state.combat.spellCastCounter = (state.combat.spellCastCounter || 0) + 1;
  // Seedbearer (Divine Regalia — Ring of Verdant Promise): every 3rd
  // elemental cast this fight restores 10% max Health, routed through
  // applyHeal like every other heal.
  if (hasEffect(state, "seedbearer") && state.combat.spellCastCounter % 3 === 0) {
    const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.1));
    if (healed > 0) out.push(`Seedbearer blooms — you're mended for ${healed} health.`, ...lines);
  }
  out.push(...applyEndlessStudy(state, elementKey), ...applyWanderersReward(state, elementKey), ...applyActionTypeTracking(state, "elemental"), ...applyPerfectMemory(state, elementKey));
  consumeTrailblazer(state);
  // Conduit Mastery (Mythic): a flat, unconditional -1 to every elemental
  // cooldown, applied to the base cooldown before Novitiate/River's
  // Favor's free-cast check (which would otherwise get pushed back up
  // from 0) and before Conduit Ease's probabilistic reduction.
  let cooldown = a.cooldown;
  if (hasEffect(state, "conduit_mastery")) cooldown = Math.max(1, cooldown - 1);
  // Novitiate's 6pc set bonus: the first elemental cast of the fight
  // costs no cooldown at all, taking priority over Conduit Ease's
  // probabilistic reduction (which only matters once this charge is spent).
  if ((hasSetTier(state, "Novitiate", 6) || hasEffect(state, "rivers_favor")) && !state.combat.noviceFreeCastUsed) {
    state.combat.noviceFreeCastUsed = true;
    cooldown = 0;
    out.push(`First casting's free — the conduit hasn't tired yet.`);
  } else if (hasEffect(state, "conduit_ease") && Math.random() < conduitEaseChance(state)) {
    cooldown = Math.max(1, cooldown - 1);
    out.push(`The conduit answers easier than expected — ${a.name} will recover faster this time.`);
  }
  // Eureka (Divine Regalia — Ring of Boundless Inquiry): every 4th spell
  // cast has no cooldown after resolving, overriding whatever was just
  // computed above.
  if (hasEffect(state, "eureka") && state.combat.spellCastCounter % 4 === 0) {
    cooldown = 0;
    out.push(`Eureka — the insight arrives before the cost does.`);
  }
  // Avatar of Knowledge (Regalia of the Endless Archive 6pc): for its
  // 4-round window, every spell costs no cooldown at all.
  if (state.combat.avatarOfKnowledgeTurns > 0) cooldown = 0;
  // Avatar of Time (Regalia of the Eternal Hour 6pc): same "every cast
  // costs no cooldown" window, its own separate source.
  if (state.combat.avatarOfTimeTurns > 0) cooldown = 0;
  // Swift Passage (Divine Regalia — Windstep Boots): the queued charge
  // from a prior fight's kill (see resolveKill/startCombat) overrides
  // whatever was just computed above, one time.
  if (state.combat.swiftPassageReady) {
    state.combat.swiftPassageReady = false;
    cooldown = 0;
  }
  // Hourglass Reserve (Divine Regalia — Sands of the Last Hour): a once-
  // per-combat charge, available from the moment combat starts, that
  // resets the first Ability/Tactic's own cooldown back to 0 immediately
  // after it's set — functionally identical to Swift Passage's override
  // above, just combat-scoped instead of queued across fights.
  if (state.combat.hourglassReserveReady) {
    state.combat.hourglassReserveReady = false;
    cooldown = 0;
  }
  // Borrowed Seconds (Divine Regalia — Epochkeeper): refunds 50% of
  // whatever cooldown was just computed above (a no-op if it's already 0
  // from one of the free-cast sources above).
  if (borrowedSecondsActive(state) && cooldown > 0) {
    cooldown = Math.round(cooldown / 2);
  }
  state.combat.cooldowns[elementKey] = cooldown;
  // Universal Understanding (Regalia of the Endless Archive 4pc): every
  // elemental cast randomly reduces the cooldown of another known,
  // currently-cooling-down element by 2 (floor 0).
  if (hasSetTier(state, "Regalia of the Endless Archive", 4)) {
    const otherKnown = [state.primaryElement, state.secondaryElement, state.tertiaryElement]
      .filter((el) => el && el !== elementKey && (state.combat.cooldowns[el] || 0) > 0);
    if (otherKnown.length) {
      const pick = otherKnown[Math.floor(Math.random() * otherKnown.length)];
      state.combat.cooldowns[pick] = Math.max(0, state.combat.cooldowns[pick] - 2);
      out.push(`Universal Understanding — the insight carries over; ${ELEMENT_ABILITIES[pick].name}'s cooldown eases.`);
    }
  }

  // Elemental synergy: casting the mage's OTHER known element right before
  // this one boosts this cast. Checked before lastElementUsed is updated,
  // since the check is "what came before this."
  const synergy = getSynergy(state, elementKey);
  let dmgMult = synergy ? synergy.dmgMultiplier : 1;
  // Twin Rivers (Mythic): unlike curated synergy pairs, this rewards ANY
  // back-to-back elemental cast this fight, stacking with a real synergy
  // bonus if one also applies. Checked before lastElementUsed updates,
  // same "what came before this" ordering as the synergy check above.
  if (hasEffect(state, "twin_rivers") && state.combat.lastElementUsed) dmgMult *= 1.4;
  state.combat.lastElementUsed = elementKey;

  // Elemental Focus and Surging Conduit (now potentially 2 charges a
  // fight, via Conduit Master 6pc/Fragmenta 4pc) layer on top of synergy
  // as a separate multiplier — kept apart from dmgMult because Stoneskin
  // (earth) deals no damage and gets flat Defense instead of either bonus.
  const focusActive = hasEffect(state, "elemental_focus");
  const focusMult = elementalFocusMultiplier(state);
  const surgeActive = hasEffect(state, "surging_conduit") && state.combat.surgingConduitUsesLeft > 0;
  if (surgeActive) state.combat.surgingConduitUsesLeft -= 1;
  let elementalDmgMult = dmgMult;
  if (focusActive) elementalDmgMult *= focusMult;
  if (surgeActive) elementalDmgMult *= 1.2;

  // Spell Echo (Legendary) totals whatever damage this cast actually dealt
  // (0 for Stoneskin, which deals none) so it has something to repeat at
  // half power after the switch below.
  let castDamageDealt = 0;
  // Every non-Stoneskin case below deals damage — Stoneskin (earth) never
  // reduces combat.hp, so this being set even for it is harmless (no kill
  // can ever be attributed to it).
  state.combat.lastDamageType = elementKey;
  // Accuracy vs Agility: does the cast even connect? Stoneskin (earth) is a
  // self-buff with no target, so it's exempt — everything else (including
  // its on-hit side effects: Ignite's burn, Corrode's defense penalty,
  // the Force stun, Windcut's evasion window) only happens if this hits.
  const spellHits = elementKey === "earth" || attackConnects(effectivePlayerAccuracy(state), creature.agi);
  switch (elementKey) {
    case "fire": {
      if (!spellHits) { out.push(`${ELEMENTS.fire.name}'s lance goes wide, the flame guttering out short of ${withThe(creature.name, false)}.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      out.push(`${ELEMENTS.fire.verb(withThe(creature.name, false))} for ${dmg} damage, and the flame catches.`);
      state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.magic / 4)) };
      break;
    }
    case "water": {
      if (!spellHits) { out.push(`The wave crashes past ${withThe(creature.name, false)}, missing entirely.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      const heal = Math.round(dmg * waterHealPct(state));
      const { healed, lines: healLines } = applyHeal(state, heal);
      out.push(`${ELEMENTS.water.verb(withThe(creature.name, false))} for ${dmg} damage, and the backwash mends you for ${healed}.`, ...healLines);
      break;
    }
    case "earth": {
      let defBonus = Math.max(3, Math.round((state.magic / 3) * dmgMult));
      if (focusActive) defBonus += 1;
      if (surgeActive) defBonus += 3;
      state.combat.defBuffTurns = 3;
      state.combat.defBuffAmount = defBonus;
      out.push(`Your skin hardens to something between flesh and stone — your defenses surge for the next few turns.`);
      // Brace's bonuses (Stonewarden's +5 instead of +3, Siege Corps's
      // next-turn +2 Attack) apply here too, since Stoneskin is the
      // mage's own "no-damage action."
      if (hasEffect(state, "brace") && hasSetTier(state, "Siege Corps", 6)) {
        state.combat.siegeCorpsAtkCharge = 2;
      }
      break;
    }
    case "lightning": {
      if (!spellHits) { out.push(`The bolt arcs past ${withThe(creature.name, false)} without connecting.`); break; }
      const dmg1 = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg1;
      castDamageDealt += dmg1;
      out.push(`${ELEMENTS.lightning.verb(withThe(creature.name, false))} for ${dmg1} damage —`);
      if (state.combat.hp > 0) {
        const dmg2 = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
        state.combat.hp -= dmg2;
        castDamageDealt += dmg2;
        out.push(`— and again, for ${dmg2} more before it can react.`);
      }
      break;
    }
    case "acid": {
      if (!spellHits) { out.push(`The acid splashes wide, missing ${withThe(creature.name, false)} entirely.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      state.combat.corroded = true;
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 4;
      out.push(`${ELEMENTS.acid.verb(withThe(creature.name, false))} for ${dmg} damage — its defenses will be weaker against you for the rest of this fight.`);
      break;
    }
    case "force": {
      if (!spellHits) { out.push(`The wall of force passes ${withThe(creature.name, false)} by.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      state.combat.enemyStunned = true;
      out.push(`${ELEMENTS.force.verb(withThe(creature.name, false))} for ${dmg} damage — it reels, stunned.`);
      break;
    }
    case "transportation": {
      if (!spellHits) { out.push(`You reappear a beat too far from ${withThe(creature.name, false)} to land the strike.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * 1.3 * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      out.push(`${ELEMENTS.transportation.verb(withThe(creature.name, false))} for ${dmg} damage before it can track where you went.`);
      break;
    }
    case "air": {
      if (!spellHits) { out.push(`The gust tears past ${withThe(creature.name, false)}, missing.`); break; }
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      state.combat.evasionTurns = 2;
      out.push(`${ELEMENTS.air.verb(withThe(creature.name, false))} for ${dmg} damage, leaving you lighter on your feet.`);
      break;
    }
  }

  if (synergy) {
    if (synergy.extraEffect) synergy.extraEffect(state, creature);
    out.push(synergy.message(withThe(creature.name, false)));
  }

  // Spell Echo (Legendary): a flat 20% chance for this cast's damage to
  // immediately repeat at half power, checked once per cast regardless of
  // how many hits it already landed (so Lightning's double-strike doesn't
  // get two independent rolls). Master of Arms (Artifact) doubles that
  // chance to 40% when Spell Echo is specifically the Main Hand item's own
  // effect — "triggers twice" read as "triggers twice as often" for a
  // proc-chance passive, rather than doubling the echo's own damage.
  const spellEchoChance = masterOfArmsDoubles(state, "spell_echo") ? 0.4 : 0.2;
  if (state.combat.hp > 0 && castDamageDealt > 0 && hasEffect(state, "spell_echo") && Math.random() < spellEchoChance) {
    const echoDmg = Math.max(1, Math.round(castDamageDealt * 0.5));
    state.combat.hp -= echoDmg;
    out.push(`The spell echoes — a second casting lands for ${echoDmg} damage.`);
  }

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }

  let braceBonus = elementKey === "earth" && hasEffect(state, "brace") ? braceDefBonus(state) : 0;
  const retaliation = resolveOrSkipRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state), ...checkRootedResolve(state), ...checkAvatarOfBloom(state), ...checkAvatarOfPassing(state), ...checkAvatarOfFate(state), ...checkRallyTheLine(state), ...checkAvatarOfWar(state), ...checkAvatarOfKnowledge(state), ...checkLoveEndures(state), ...checkAvatarOfDevotion(state), ...checkAvatarOfChaos(state), ...checkAvatarOfEndurance(state), ...checkAvatarOfFreedom(state), ...checkAvatarOfCreation(state), ...checkAvatarOfRenewal(state), ...checkAvatarOfTime(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}
