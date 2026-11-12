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
  const slot = activeEnemySlot(state.combat);
  return slot.creatureObj || BESTIARY[slot.creatureId];
}

// Multi-enemy support (pack/squad encounters): state.combat.enemies is an
// array, one entry per creature in the fight, each holding its own
// hp/maxHp/creatureObj plus every debuff that's genuinely inflicted ON a
// specific creature (Disarm, Corrode, Hamstring, burn/bleed, Reinforced's
// counter, the stun flag, its own last-damage-type). state.combat.activeIndex
// is whichever enemy the player is currently targeting. PER_ENEMY_FIELDS
// below is just the list of field names that live there, not on
// state.combat itself — activeEnemySlot(combat), right after it, is how
// every call site reaches them.
const PER_ENEMY_FIELDS = [
  "creatureId", "creatureObj", "dynamicCreature", "name",
  "hp", "maxHp",
  "corroded", "disarmed", "enemyAtkPenalty", "enemyDefPenalty", "enemyStunCharges",
  "hamstringApplied", "burn", "bleed", "reinforcedAttackCount", "lastDamageType",
  "actedEarlyThisRound",
  // Enemy Ability Engine (data/enemyabilities.js) — per-enemy so a pack of
  // several creatures each track their own cooldowns/stacks independently.
  "abilityCooldowns", "selfBuffs", "passiveOnceFlags", "firstActiveUsed",
  "healthLostStacks", "hitsTakenFromPlayer", "lastAttackTargetKind", "consecutiveTargetStacks",
  "summonSourceKey", // null for anything rolled into the fight normally; set to the summoning ability's own id for anything summoned mid-fight — see resolveEnemySummon
];

// Step 1h-iv: until this step, the ~50 existing damage/effect functions
// throughout this file read/wrote these fields as flat combat.<field>
// properties, transparently proxied (via wireActiveEnemyProxy, now
// deleted) to combat.enemies[combat.activeIndex][field]. Every call site
// now calls activeEnemySlot(combat) directly at each individual access
// point instead (rather than caching its return value across a span of
// code that might itself change activeIndex, e.g. resolveKill advancing
// to a survivor), which re-reads activeIndex fresh on every call exactly
// like the old proxy's own get/set did — unconditionally safe at any call
// depth, matching the deleted proxy's behavior exactly. Where a function
// already holds a stable local reference to the specific enemy record it
// means (one that provably doesn't change out from under it for the span
// it's used), that local is used directly instead, for both clarity and
// because it's often the record that call site needs regardless of
// whatever "active" currently means elsewhere.
function activeEnemySlot(combat) {
  return combat.enemies[combat.activeIndex];
}

// Step 1e §3.3: the 34 fields the handoff listed as player-owned turned out
// to include three already enemy-owned via PER_ENEMY_FIELDS above (burn,
// creatureObj, hamstringApplied — confirmed by cross-reference, not assumed)
// — this is the real remaining 31. Real storage moves into a private store
// closed over by the accessors below; combat.<field> stays a transparent
// alias (get/set) on top of it, same pattern as PER_ENEMY_FIELDS/
// wireActiveEnemyProxy just above, so every existing call site (migrated or
// not) keeps working unchanged until step 1h removes the alias. NOTE for
// the field ledger (tools/combat_field_ledger.js):
// that tool's "closed" count is a literal text-scan for the `combat.<field>`
// spelling inside step-tracked functions — exactly the same mechanism that
// already keeps PER_ENEMY_FIELDS entries open until their call sites stop
// spelling them that way. This alias makes the move real (confirmed via the
// full regression suite + Layer 2 exact-match, zero behavior change) but,
// like the enemy-field precedent, does NOT by itself move the ledger's
// count — most of these 31 fields are read/written by small shared helpers
// (applyEndlessStudy, the checkAvatarOfX family, applyOpeningReach, ...)
// called from several 1e-tagged orchestrators, so rewriting every one of
// those call sites off the alias spelling is a materially larger, separate
// pass better scoped with step 1h's cleanup (where the alias itself is
// removed) than bundled into this field-ownership move.
const PLAYER_FIELDS = [
  "actionTypeHistory", "avatarOfBloomUsed", "avatarOfChaosUsed", "avatarOfCreationUsed",
  "avatarOfDevotionUsed", "avatarOfEnduranceUsed", "avatarOfFateUsed", "avatarOfFreedomUsed",
  "avatarOfKnowledgeUsed", "avatarOfPassingUsed", "avatarOfRenewalUsed", "avatarOfTimeUsed",
  "avatarOfWarUsed", "endlessStudyKeys", "firstPhysicalAttackDone", "holdTheLineUsed",
  "hourglassReserveReady", "lastActionType", "lastElementUsed", "loveEnduresUsed",
  "nextAttackBonus", "noviceFreeCastUsed", "perfectMemoryKeys", "perfectTimingUsed",
  "rallyTheLineUsed", "recentActionKeys", "rootedResolveUsed", "spellCastCounter",
  "surgingConduitUsesLeft", "swiftPassageReady", "tacticalMemoryUsed",
  // Step 1g-iii: batch 1 of the 117-field move -- once-per-fight/cooldown
  // flags (19 fields), moved as-is, no redesign of their own stacking/
  // duration logic.
  "betweenWorldsUsed", "elderBarkSaveUsed", "firstHitTakenUsed", "guardianSpiritUsed",
  "guidedFootstepsUsed", "lastStandUsed", "mercyOfTheVeilUsed", "mirrorSoulUsed",
  "naturesPersistenceUsed", "preparedResponseWitnessed", "scoutStealthUsed", "sharedBurdenUsed",
  "stormBarrierUsed", "threadsOfConsequencePending", "timelessGuardCooldown", "trailblazerUsed",
  "unbreakableUsed", "unlikelyOutcomeGuaranteedCrit", "unyieldingWallCooldown",
  // Step 1g-iv: batch 2 of the 117-field move -- every remaining avatarOf*
  // field (the …Used flags moved already, in 1e). One family, read
  // together; no redesign of the stacking/duration logic itself.
  "avatarOfChaosAtkBonus", "avatarOfChaosDefBonus", "avatarOfChaosKnowledgeBonus",
  "avatarOfChaosMagicBonus", "avatarOfChaosTurns",
  "avatarOfCreationAtkStacks", "avatarOfCreationMagicStacks", "avatarOfCreationTurns",
  "avatarOfDevotionSaveUsed", "avatarOfDevotionTurns",
  "avatarOfEnduranceAtkBonus", "avatarOfEnduranceDefBonus", "avatarOfEnduranceTurns",
  "avatarOfFateSaveUsed", "avatarOfFateTurns",
  "avatarOfFreedomTurns", "avatarOfKnowledgeTurns", "avatarOfPassingTurns",
  "avatarOfRenewalTurns", "avatarOfTimeTurns", "avatarOfWarTurns",
  // Step 1g-v: batch 3 of the 117-field move -- set/gear stacks and
  // bonuses (37 fields; the handoff's own "about 41" was approximate,
  // per its own instruction that the ledger's grouping is the
  // authority). What Phase 2 will turn into modifier entries; moved
  // as-is here, no redesign.
  "adaptiveTideMagicStacks", "adaptiveTidePhysicalStacks", "adaptiveWardElement",
  "battleTemperedAtkStacks", "battleTemperedDefStacks", "blessingOfFortuneCritStacks",
  "calmWatersDefBonus", "calmWatersMagicBonus", "calmWatersTurns",
  "compassionsGraceDefStacks", "endlessCurrentStacks", "endlessStudyMagicBonus",
  "everyChoiceAtkStacks", "everyChoiceMagicStacks", "forestGuardianBonus",
  "groundbreakerDebuffs", "lastStandAtkBonus", "livingCurrentStacks", "livingSteelBonus",
  "orderedMindDefStacks", "perfectMemoryKnowledgeBonus", "queenCarapaceBonus",
  "reinforcedDefStacks", "riverWardenMagicBonus", "sovereigntyTurnsLeft", "temperedSteelStacks",
  "unbrokenLineHitCount", "unwaveringDevotionStacks", "wallsEndureDefStacks",
  "whiteWatchRiposteDefBonus", "windsOfChangeAtk", "windsOfChangeDef", "windsOfChangeKnowledge",
  "windsOfChangeMagic", "workRefinesAtkStacks", "workRefinesMagicStacks", "worthyChallengeStacks",
  // Step 1g-vi: batch 4 of the 117-field move -- core player combat
  // state. The handoff's own list named 24 fields and asked to check
  // whether summonLifetimeCounts/enemyActedFirstThisRound are really
  // fight-wide rather than player-owned: they are (summonLifetimeCounts
  // caps an enemy summon ability fight-wide, regardless of which pack
  // member casts it; enemyActedFirstThisRound describes this ROUND's
  // initiative order, not any one fighter's own state) -- both moved to
  // STRUCTURAL in tools/combat_field_ledger.js instead, leaving the
  // real 22 below.
  "atkBuffAmount", "atkBuffTurns", "defBuffAmount", "defBuffTurns",
  "magicBuffAmount", "magicBuffTurns", "knowledgeBuffAmount", "damageReductionTurns",
  "playerBuffs", "playerStatuses", "regen", "tempHealth",
  "evasionCharges", "evasionTurns", "evasiveGuardBonus", "exposedTarget",
  "playerLastHitType", "actionCounter", "weaponAttackCounter",
  "momentumStacks", "momentumUnboundStacks", "siegeCorpsAtkCharge",
];

// Step 1h-iii: the explicit player combat store. Captures each
// PLAYER_FIELDS entry's current value (set moments earlier by the big
// state.combat object literal in startCombat) into a real, inspectable
// object hanging off state.combat.player -- makePlayerCombatant's own
// `store` points here (combatant.js), the same shape every ally/enemy
// combatant view already has (store: ally / store: enemySlot) -- a
// tight, fighter-specific bag instead of the whole combat object.
//
// wirePlayerFieldsProxy (the backward-compatible combat.<field>/
// state.combat.<field> accessor layer this replaced -- step 1h-iii's own
// first commit built it on top of this same store, specifically so the
// alias and the real spelling could coexist with zero risk of drifting
// apart while every call site was rewritten one batch at a time) is
// deleted now that none exist anymore: a full-repo grep (every tracked
// .js/.html file) found zero remaining combat.<field>/state.combat.
// <field> occurrences for any of these 130 names before this deletion.
//
// Deletes each field off combat itself after copying its initial value
// (set moments earlier by the big state.combat object literal) into the
// store: wirePlayerFieldsProxy used to achieve the same end result by
// REDEFINING the property as an accessor, which has the same practical
// effect of removing the flat data property -- without an explicit
// delete here, that stale initial value would keep sitting on combat,
// untouched and disconnected from combat.player, forever (returning its
// frozen fight-start value to anything that reads it, not undefined --
// worse than a loud failure). The delete is what actually proves
// "accessing the old way returns undefined, nothing was missed" true.
function makePlayerCombatStore(combat) {
  const store = {};
  PLAYER_FIELDS.forEach((field) => {
    store[field] = combat[field];
    delete combat[field];
  });
  return store;
}

// Every enemy still standing, in roster order.
function aliveEnemies(state) {
  return state.combat ? state.combat.enemies.filter((e) => e.alive) : [];
}

// Shared loop-continuation predicate for the initiative pipeline
// (resolveSpeedInitiative/resolveRemainingInitiativeActions): a fight
// keeps resolving allies' and enemies' turns as long as there's still a
// fight (state.combat), someone left to fight it (aliveEnemies), and
// either the player is still standing OR the player is merely downed
// (state.playerDowned — see resolvePlayerDefeatOrDowned) rather than
// truly defeated. A downed player persistently sits at <=0 Health for
// the rest of the fight, so "state.health > 0" alone would stop these
// loops dead the instant they go down; playerDowned is what tells them
// to keep going without the player, exactly as if nothing happened.
function combatOngoing(state) {
  return !!state.combat && (state.health > 0 || state.playerDowned) && aliveEnemies(state).length > 0;
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
  // Enemy mages (data/enemymages.js) have `magic` and no `atk` at all —
  // reading creature.atk directly made every physical-path hit from one
  // (a failed flee, any swing at an ally) NaN, which then poisoned
  // state.health / ally.health permanently. Fall back to their magic.
  const base = creature.atk != null ? creature.atk : creature.magic != null ? creature.magic : 1;
  return Math.max(1, base - (activeEnemySlot(state.combat).enemyAtkPenalty || 0));
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

// ---- v0.11 combat retune: unified Defense mitigation ----
// Every damage path in the game (player physical, player spell, enemy
// physical, enemy ability, enemy mage, failed flee, allies/companions in
// both directions) used to carry its own Defense rule — subtract 100%,
// 50%, 33% or 10% of Defense, floor at 0 or 1. Subtractive Defense has a
// cliff at both ends: once Defense >= incoming power the hit does nothing
// (geared players became immune to Normal/Elite enemies by mid-game), and
// once power >> Defense the hit is effectively unmitigated (World Bosses
// one-shot). This replaces all of them with one RATIO rule:
//
//   damage = power^2 / (power + defense * DEF_WEIGHT)
//
// power == defense -> half damage; defense 3x power -> a quarter; defense
// never zeroes a hit and never stops mattering. Every connecting hit with
// any power behind it deals at least 1. Damage multipliers (crits, Feint,
// set bonuses, dmgReduction) apply AFTER mitigation, so a 1.5x crit is
// exactly 1.5x the damage, not 1.5x the pre-armor power (which the
// squared term would amplify to ~2x).
const DEF_WEIGHT = 1.0;
function mitigate(power, defense) {
  if (!(power > 0)) return 0;
  const d = Math.max(0, defense || 0) * DEF_WEIGHT;
  return (power * power) / (power + d);
}
// Random spread for an enemy ability hit — abilities used to be a fixed
// atk * dmgMult with no variance at all, unlike every ordinary swing.
function abilityPower(atk, dmgMult) {
  return atk * dmgMult * (0.9 + Math.random() * 0.2);
}

// Elemental Sovereignty (First Sword's Regalia 10pc, exclusive): +15% to
// Attack/Defense/Magic/Accuracy/Agility/Speed (not Health) for 2 global
// turns after a qualifying water-element cast, applied here at each of
// those stats' own single "effective" accessor — the same convention
// dungeonTorchRationMultiplier already uses — so it's computed off the
// already-scaled-and-equipped value, never recursively re-applied across
// a refresh (each call just re-reads the live base, it doesn't compound).
function sovereigntyMultiplier(state) {
  return state.combat && state.combat.player.sovereigntyTurnsLeft > 0 ? 1.15 : 1;
}

// Earth's Stoneskin adds a temporary universal defense bonus; Evasive
// Guard and Queen Carapace's carapace_adaptation each add a permanent-
// for-the-fight bonus (capped +3 and +9 respectively) whenever their
// trigger fires — everything that computes damage taken should go
// through this instead of state.def.
function effectivePlayerDef(state) {
  const combat = state.combat;
  const buff = combat.player.defBuffTurns > 0 ? combat.player.defBuffAmount || 0 : 0;
  // Ordered Mind (Regalia): +2 Defense (cap +12) every time a negative
  // status is resisted/ignored — see applyPlayerStatus. Calm Waters
  // (Regalia): a temporary Defense bonus whenever Cleansing Current clears
  // a status — see applyStatusCleanseOnHeal.
  const calmWatersDef = combat.player.calmWatersTurns > 0 ? combat.player.calmWatersDefBonus || 0 : 0;
  // v0.11: flat in-combat stacks scale through flatStat (PLAYER_STAT_SCALE);
  // `buff` and playerBuffs are already scaled where they're granted.
  const flatStacks = (combat.player.evasiveGuardBonus || 0) + (combat.player.forestGuardianBonus || 0) + (combat.player.queenCarapaceBonus || 0) + (combat.player.whiteWatchRiposteDefBonus || 0) + perfectBalanceBonus(state) + (combat.player.livingSteelBonus || 0) + (combat.player.battleTemperedDefStacks || 0) + (combat.player.compassionsGraceDefStacks || 0) * 2 + (combat.player.windsOfChangeDef || 0) + (combat.player.avatarOfChaosDefBonus || 0) + (combat.player.wallsEndureDefStacks || 0) + (combat.player.avatarOfEnduranceDefBonus || 0) + (combat.player.reinforcedDefStacks || 0) + (combat.player.orderedMindDefStacks || 0) + calmWatersDef;
  const base = state.def + buff + flatStat(flatStacks) + playerBuffStatTotal(state, "def");
  // Enemy Ability Engine (data/enemyabilities.js): a Defense-reducing
  // status an enemy's active ability just inflicted (Shield Crush, ...),
  // summed across whatever's currently active in combat.player.playerStatuses.
  // Already negative (a debuff's own `def` value IS the signed delta —
  // -10 means "10 less Defense"), so it's added, not subtracted.
  const penalty = playerStatusStatTotal(state, "def");
  // dungeonTorchRationMultiplier (engine/dungeon.js): Dungeon Delve's
  // rationless debuff, applied to the whole effective value (same
  // treatment as effectivePlayerAtk below) rather than just state.def —
  // a no-op (returns 1) outside an active dungeon run.
  const ratioMult = dungeonTorchRationMultiplier(state, "def") * sovereigntyMultiplier(state);
  if (penalty >= 0) return Math.round(base * ratioMult);
  // Bedrock (Regalia): Defense reductions can never push effective Defense
  // below 75% of its own unreduced base — floors the penalty rather than
  // negating it outright, unlike Unbreakable/Corrosionproof below (which
  // shrink or fully ignore the FIRST reduction at the moment it's applied).
  const reduced = base + penalty;
  const floored = hasEffect(state, "bedrock") ? Math.max(reduced, Math.round(base * 0.75)) : reduced;
  return Math.round(floored * ratioMult);
}

// ---- Enemy Ability Engine: player-facing status effects ----
// state.combat.player.playerStatuses is keyed by a status id (STATUS_EFFECTS'
// own keys for named statuses; "custom:<abilityId>:<stat>" for one-off
// magnitudes an ability defines inline via `inflict.custom` — namespaced
// per stat so, e.g., a Defense-reducing custom debuff and an
// Accuracy-reducing one from different abilities never collide or
// overwrite each other). Each entry: { name, debuff: {...}, dot: {...},
// turnsLeft, stacks }. Reapplying a non-stacking entry refreshes its
// duration in place, matching the codex's own repeated "does not stack;
// reapplication refreshes the duration" wording; Bleed/Constrict stack
// instead, up to their own cap.
// Crafted-potion buffs (data/items.js's useEffect.type "buff", see
// applyConsumableEffect below) — combat.player.playerBuffs is keyed by stat
// (abbreviated: def/agi/acc/spd, matching playerStatusStatTotal's own
// debuff keys below, not STAT_LABELS' full display names), one entry per
// stat rather than playerStatuses' per-source-id keying, since only one
// crafted buff can be active per stat at a time (drinking a second
// refreshes it, same non-stacking convention as a repeated status). A
// brand new system, deliberately NOT covered by Avatar of Time's
// buff-turn freeze (combat.js's beginTurn) — that freeze is narrowly
// scoped to the pre-existing defBuffTurns/atkBuffTurns/magicBuffTurns
// gear-set fields, not a general "every buff" rule.
function playerBuffStatTotal(state, statKey) {
  const buffs = (state.combat && state.combat.player.playerBuffs) || {};
  const entry = buffs[statKey];
  return entry ? entry.amount : 0;
}

// Ticks every active crafted-potion buff down by one turn, deleting it
// once its turns run out — mirrors tickPlayerStatuses exactly (including
// its silent-on-expiry convention, no "wears off" line), just for a
// positive effect instead of a negative one.
function tickPlayerBuffs(state) {
  const buffs = state.combat.player.playerBuffs;
  for (const key of Object.keys(buffs)) {
    buffs[key].turns -= 1;
    if (buffs[key].turns <= 0) delete buffs[key];
  }
}

function playerStatusStatTotal(state, statKey) {
  const statuses = (state.combat && state.combat.player.playerStatuses) || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    const stacks = entry.stacks || 1;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey] * stacks;
  }
  return total;
}
function playerStatusStatPctTotal(state, statKey) {
  const statuses = (state.combat && state.combat.player.playerStatuses) || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey];
  }
  return total;
}
function effectivePlayerAgility(state) {
  const pct = playerStatusStatPctTotal(state, "agiPct");
  const base = state.agility + playerStatusStatTotal(state, "agi") + playerBuffStatTotal(state, "agi");
  // dungeonTorchRationMultiplier (engine/dungeon.js): Dungeon Delve's
  // torchless debuff — a no-op (returns 1) outside an active dungeon run.
  return Math.max(0, Math.round(base * (1 + pct) * dungeonTorchRationMultiplier(state, "agility") * sovereigntyMultiplier(state)));
}
function effectivePlayerAccuracy(state) {
  const base = state.accuracy + playerStatusStatTotal(state, "acc") + playerBuffStatTotal(state, "acc");
  return Math.max(0, Math.round(base * dungeonTorchRationMultiplier(state, "accuracy") * sovereigntyMultiplier(state)));
}
// Shared core of effectivePlayerAtk/peekPlayerAtk below — every term
// except the Siege Corps charge, which the two callers supply differently
// (one consumes it, one peeks it). Splitting it out means the formula
// itself can never drift between the two — same reasoning combatant.js's
// stat()-purity rule exists for in the first place (step 1e handoff §3.2).
function computeEffectivePlayerAtk(state, siegeCorpsTerm) {
  const combat = state.combat;
  const atkBuff = combat.player.atkBuffTurns > 0 ? combat.player.atkBuffAmount || 0 : 0;
  const everyChoiceAtk = combat.player.everyChoiceAtkStacks || 0;
  const battleTemperedAtk = combat.player.battleTemperedAtkStacks || 0;
  // v0.11: every in-combat stack below is a flat "+N Attack" authored in
  // stat points, so the sum goes through flatStat (PLAYER_STAT_SCALE).
  // atkBuff and playerBuffs are already scaled where they're granted.
  const flatStacks =
    siegeCorpsTerm +
    perfectBalanceBonus(state) +
    (combat.player.lastStandAtkBonus || 0) +
    (combat.player.livingSteelBonus || 0) +
    everyChoiceAtk * 2 +
    battleTemperedAtk +
    (combat.player.windsOfChangeAtk || 0) +
    (combat.player.avatarOfChaosAtkBonus || 0) +
    (combat.player.avatarOfEnduranceAtkBonus || 0) +
    (combat.player.workRefinesAtkStacks || 0) +
    (combat.player.avatarOfCreationAtkStacks || 0);
  const atk = state.atk + flatStat(flatStacks) + atkBuff + playerBuffStatTotal(state, "atk");
  return Math.round(atk * dungeonTorchRationMultiplier(state, "atk") * sovereigntyMultiplier(state));
}
function effectivePlayerAtk(state) {
  // Same formula rollPlayerDamage's physical branch has always inlined —
  // pulled out here so Dungeon Delve's rationless debuff (and anything
  // else later) has one place to read/scale, rather than re-deriving it.
  // Calls consumeSiegeCorpsAtkCharge exactly once, same as before this
  // was extracted — its charge-consuming side effect must not fire twice
  // in the same damage roll (see rollPlayerDamage, which now calls this
  // once and reuses the result for crushMult/craftsmanMult too).
  //
  // UNCHANGED by the step 1e handoff §3.2 purity fix below — this is the
  // function every not-yet-migrated player action (rollPlayerDamage, and
  // everything that still calls it: Decoy/Ambush/Disarm/element abilities)
  // keeps calling directly, so its consuming behavior must stay exactly
  // as it's always been until each of those is migrated in turn.
  return computeEffectivePlayerAtk(state, consumeSiegeCorpsAtkCharge(state));
}
// Pure twin of effectivePlayerAtk, for the new pipeline's own stat()
// accessor (combatant.js) and the step 1e basic-attack path
// (pipeline.js's calculateDamagePlayerActor): PEEKS the Siege Corps
// charge instead of consuming it. Reading a stat must never mutate state
// (combatant.js's hard rule) — effectivePlayerAtk violated that the
// moment stat()'s "atk" case started calling it directly (unnoticed until
// now, since nothing had yet called stat(player, "atk") more than once
// per hit, or outside of resolving a hit at all). The pipeline's own
// applyAndReactPlayerActor (step 5) is what actually spends the charge
// now, once, after a physical hit resolves — see that function's own
// comment in pipeline.js. Produces the IDENTICAL number as
// effectivePlayerAtk on any single call (same formula, same charge value
// read either way) — only WHEN the charge is spent moved, never what the
// roll comes out to; phase1_step1a_combatant_ledger.js's PARITY-PLAYER-07
// proves both halves of that directly.
function peekPlayerAtk(state) {
  return computeEffectivePlayerAtk(state, peekSiegeCorpsAtkCharge(state));
}
function effectivePlayerSpeedForInitiative(state) {
  const pct = playerStatusStatPctTotal(state, "spdPct");
  const base = state.speed + playerStatusStatTotal(state, "spd") + playerBuffStatTotal(state, "spd");
  return Math.max(0, Math.round(base * (1 + pct) * sovereigntyMultiplier(state)));
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
    combat.player.orderedMindDefStacks = Math.min(12, (combat.player.orderedMindDefStacks || 0) + 2);
    return [`Fortune's Favor lets ${label} simply fail to take hold.`];
  }
  const isCrowdControl = !!spec.debuff && !spec.dot;
  if (isCrowdControl && hasEffect(state, "natures_persistence") && !combat.player.naturesPersistenceUsed) {
    combat.player.naturesPersistenceUsed = true;
    if (hasEffect(state, "ordered_mind")) combat.player.orderedMindDefStacks = Math.min(12, (combat.player.orderedMindDefStacks || 0) + 2);
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
    if (hasEffect(state, "unbreakable") && !combat.player.unbreakableUsed) {
      combat.player.unbreakableUsed = true;
      return [`Unbreakable ignores the Defense loss from ${label} entirely.`];
    }
    if (hasEffect(state, "corrosionproof")) {
      debuff = { ...debuff, def: Math.min(0, debuff.def + 2) };
    }
  }
  const existing = combat.player.playerStatuses[key];
  if (spec.stackable) {
    const stacks = Math.min(spec.maxStacks || 1, (existing ? existing.stacks : 0) + 1);
    combat.player.playerStatuses[key] = { name: label, debuff, dot: spec.dot, turnsLeft: turns, stacks };
  } else {
    combat.player.playerStatuses[key] = { name: label, debuff, dot: spec.dot, turnsLeft: turns, stacks: 1 };
  }
  return [`${sourceName ? withThe(sourceName, true) + " inflicts" : "You suffer"} ${label}.`];
}

// Rolls and applies whatever `inflict` an active ability specifies —
// either a named STATUS_EFFECTS entry (`{ status, chance }`) or a bespoke
// one-off magnitude (`{ custom: { ...debuff, turns }, chance }`) that
// doesn't match any named status. Called from resolveEnemyAttackOnPlayer
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

// ---- Enemy Ability Engine: ally-facing status effects ----
// An ally's own parallel to combat.player.playerStatuses — same STATUS_EFFECTS
// table, same { name, debuff, dot, turnsLeft, stacks } shape, keyed the
// same way (a named status's own id, or "custom:<source>:<stat,...>" for
// an ability's inline inflict.custom) — but stored on the ally itself
// (ally.statuses), not per-fight combat state, and with none of the
// player-only defensive interceptors applyPlayerStatus checks first
// (Immutable, Fortune's Favor, Nature's Persistence, Unbreakable/
// Corrosionproof, Blessing of Acceptance all key off the PLAYER's own
// equipped Divine Regalia/Legendary gear via hasEffect(state, ...) — no
// ally has an equivalent gear-immunity system today, so applying one of
// those checks to an ally would be inventing a mechanic, not wiring an
// existing one). Lazy-initialized like ally.buffs, so a save from before
// this field existed still works the first time something tries to use
// it on that ally.
function allyStatusStatTotal(ally, statKey) {
  const statuses = ally.statuses || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    const stacks = entry.stacks || 1;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey] * stacks;
  }
  return total;
}
function allyStatusStatPctTotal(ally, statKey) {
  const statuses = ally.statuses || {};
  let total = 0;
  for (const entry of Object.values(statuses)) {
    if (!entry.debuff) continue;
    if (typeof entry.debuff[statKey] === "number") total += entry.debuff[statKey];
  }
  return total;
}
function applyAllyStatus(ally, key, spec, sourceName) {
  if (!ally.statuses) ally.statuses = {};
  const label = spec.name || key;
  const turns = spec.turns != null ? spec.turns : 2;
  const existing = ally.statuses[key];
  if (spec.stackable) {
    const stacks = Math.min(spec.maxStacks || 1, (existing ? existing.stacks : 0) + 1);
    ally.statuses[key] = { name: label, debuff: spec.debuff, dot: spec.dot, turnsLeft: turns, stacks };
  } else {
    ally.statuses[key] = { name: label, debuff: spec.debuff, dot: spec.dot, turnsLeft: turns, stacks: 1 };
  }
  return [sourceName ? `${withThe(sourceName, true)} inflicts ${label} on ${ally.name}.` : `${ally.name} suffers ${label}.`];
}
// Ally-targeted sibling of applyAbilityInflict — same roll/shape, applied
// via applyAllyStatus instead of applyPlayerStatus. Called from
// resolveEnemyAttackOnAlly after a hit on an ally lands.
function applyAbilityInflictOnAlly(ally, inflict, sourceName) {
  if (!inflict || Math.random() >= (inflict.chance != null ? inflict.chance : 1)) return [];
  if (inflict.status) {
    const def = getStatusEffect(inflict.status);
    if (!def) return [];
    return applyAllyStatus(ally, inflict.status, def, sourceName);
  }
  if (inflict.custom) {
    const { turns, ...debuff } = inflict.custom;
    return applyAllyStatus(ally, "custom:" + sourceName + ":" + Object.keys(debuff).join(","), { debuff, turns, name: sourceName }, sourceName);
  }
  return [];
}
// Ticks every active ally status by one turn, same cadence/shape as
// tickPlayerStatuses — called from beginTurn for every living ally,
// right alongside tickAllyBuffs. Hadrian's Ankahru-wound vulnerability
// (data/hadrian.js's HADRIAN.vulnerability, read here via
// ALLY_DEFS[ally.defId].abilityKit) is the one ally-side status
// multiplier this engine defines — a no-op for any ally without one.
function tickAllyStatuses(state, ally) {
  const lines = [];
  const statuses = ally.statuses;
  if (!statuses) return lines;
  for (const [key, entry] of Object.entries(statuses)) {
    if (entry.dot && ally.alive) {
      // The ally-kit vulnerability multiplier and (further down, the
      // pipeline's own applyAndReactTickOnAlly) the arena non-lethal
      // floor are now tickStatusAlly's/that tail's own job -- step
      // 1f-iv §5. This loop still owns the raw pre-formula number
      // (maxHealth * pctMaxHp * stacks) and the per-tick resolver call.
      const stacks = entry.stacks || 1;
      const rawDmg = Math.max(0, Math.round(ally.maxHealth * entry.dot.pctMaxHp * stacks));
      const result = resolveAllyDotTick(state, ally, key, rawDmg, entry.name);
      lines.push(...result.lines);
    }
    entry.turnsLeft -= 1;
    if (entry.turnsLeft <= 0) delete statuses[key];
  }
  return lines;
}

// Injury System v0.2: maps a DOT status's own key (combat.player.playerStatuses,
// data/enemyabilities.js's STATUS_EFFECTS — the only ids ever authored
// with a `dot` field are bleed/venom/burning/blight/sang_iag_poison) to
// one of the 10 real hit-type keys (physical/bleed/an ELEMENTS key),
// for tickPlayerStatuses below to bank as the down's damage type if this
// tick is what takes the player to 0. Venom/blight/Poison have no
// damage-type flavor defined anywhere in this engine (ELEMENTS has no
// "poison" key) — judgment call, flagged in the implementation report:
// treated as Corrosion's "acid," the closest conceptual match, rather
// than silently lumping every DOT into "physical."
function statusDamageType(key) {
  if (key === "bleed") return "bleed";
  if (key === "burning") return "fire";
  if (key === "venom" || key === "blight" || key === "sang_iag_poison") return "acid";
  return "physical"; // any future/unknown DOT status
}

// Ticks every active player status by one turn: damage-over-time first
// (Heatproof halves Burning specifically, per its own wording), then
// duration. Called from beginTurn, the same place enemy-side burn/bleed
// already tick.
function tickPlayerStatuses(state) {
  const combat = state.combat;
  const lines = [];
  for (const [key, entry] of Object.entries(combat.player.playerStatuses)) {
    if (entry.dot) {
      // Heatproof's halving is now tickStatusPlayer's own job (step
      // 1f-iv §5) -- this loop still owns the raw pre-formula number and
      // the dungeon-rescue-ends-combat early break.
      const stacks = entry.stacks || 1;
      const rawDmg = Math.max(0, Math.round(state.maxHealth * entry.dot.pctMaxHp * stacks));
      const result = resolvePlayerDotTick(state, key, rawDmg, entry.name);
      lines.push(...result.lines);
      if (result.comboEnded) break;
    }
    entry.turnsLeft -= 1;
    if (entry.turnsLeft <= 0) delete combat.player.playerStatuses[key];
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
  if (!combat || !combat.player.playerStatuses) return [];
  const keys = Object.keys(combat.player.playerStatuses);
  if (!keys.length) return [];
  const key = keys[Math.floor(Math.random() * keys.length)];
  const cleared = combat.player.playerStatuses[key];
  delete combat.player.playerStatuses[key];
  const lines = [`Cleansing Current washes away ${cleared.name}.`];
  if (hasEffect(state, "calm_waters")) {
    combat.player.calmWatersDefBonus = Math.min(12, (combat.player.calmWatersDefBonus || 0) + 4);
    combat.player.calmWatersMagicBonus = Math.min(12, (combat.player.calmWatersMagicBonus || 0) + 4);
    combat.player.calmWatersTurns = 2;
    // v0.11 PLAYER_STAT_SCALE: calmWatersDefBonus/MagicBonus are raw stat
    // points, folded into effectivePlayerDef/effectiveMagic's flatStat()'d
    // total — the +4 actually granted here is PLAYER_STAT_SCALE x bigger
    // by the time it reaches those stats, so the line names the real
    // number, not the raw per-proc design value.
    lines.push(`Calm Waters settles over you — +${flatStat(4)} Defense, +${flatStat(4)} Magic for 2 rounds.`);
  }
  return lines;
}

// Mercy of the Veil (Regalia of the Final Veil 4pc): the first time each
// combat the player's Health drops below 40%, every active status is
// removed outright. Checked anywhere player Health just changed downward,
// the same reactive-safety-net pattern Hold the Line/Rooted Resolve use.
function checkMercyOfTheVeil(state) {
  const combat = state.combat;
  if (!combat || !hasEffect(state, "mercy_of_the_veil") || combat.player.mercyOfTheVeilUsed) return [];
  if (state.health > state.maxHealth * 0.4) return [];
  combat.player.mercyOfTheVeilUsed = true;
  const hadAny = Object.keys(combat.player.playerStatuses || {}).length > 0;
  combat.player.playerStatuses = {};
  return hadAny ? [`Mercy of the Veil strips away every affliction clinging to you.`] : [];
}

// Living Steel (Mythic): +1 Attack and +1 Defense every 3rd combat action,
// capped at +5/+5. Reuses combat.player.actionCounter (already incremented by
// applyHeartwoodVitality/beginTurn), so it fires on the exact same
// cadence Heartwood Vitality does. The Attack half is added directly in
// rollPlayerDamage's atk line; the Defense half lives in effectivePlayerDef.
function applyLivingSteel(state) {
  const combat = state.combat;
  if (!hasEffect(state, "living_steel") || combat.player.actionCounter % 3 !== 0 || combat.player.livingSteelBonus >= 5) return [];
  combat.player.livingSteelBonus += 1;
  // v0.11 PLAYER_STAT_SCALE: livingSteelBonus is a raw stat-point stack,
  // folded into effectivePlayerAtk/effectivePlayerDef's flatStat()'d
  // total — the real grant is PLAYER_STAT_SCALE x the raw +1/stack.
  return [`Living Steel hardens further — +${flatStat(1)} Attack, +${flatStat(1)} Defense (now +${flatStat(combat.player.livingSteelBonus)}/+${flatStat(combat.player.livingSteelBonus)}).`];
}

// Perfect Balance (Legendary): whenever base Attack and Defense are within
// 2 points of each other, +2 to both during combat. Checked against the
// character's raw stats, not already-boosted combat values, so the bonus
// can't recursively push itself in or out of range.
function perfectBalanceBonus(state) {
  if (!hasEffect(state, "perfect_balance")) return 0;
  return Math.abs(state.atk - state.def) <= flatStat(2) ? 2 : 0; // v0.11: threshold on scaled stats; the +2 itself is scaled by the caller's flatStat
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
// each fight. combat.player.actionCounter is incremented by beginTurn() before
// any damage roll happens, so a value of 1 here means "this is the first
// action that's executed this fight."
function huntersInstinctMultiplier(state) {
  if (!hasEffect(state, "hunters_instinct")) return 1;
  const bonus = masterOfArmsDoubles(state, "hunters_instinct") ? 1.6 : 1.3;
  return state.combat && state.combat.player.actionCounter === 1 ? bonus : 1;
}

// Momentum (Legendary): each of the player's own damage rolls this fight
// stacks +10% onto the next one, capped at +50% (5 stacks) — incremented
// once per rollPlayerDamage call, so normal attacks, Ambush, Disarm,
// elemental abilities, and Riposte all build the same stack. Reset by
// startCombat.
function momentumMultiplier(state) {
  if (!hasEffect(state, "momentum")) return 1;
  const stacks = (state.combat && state.combat.player.momentumStacks) || 0;
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
  return activeEnemySlot(state.combat).hp <= activeEnemySlot(state.combat).maxHp * 0.2 ? mult : 1;
}

// Temporal Echo (Mythic): every 5th combat action deals double damage.
// Reuses combat.player.actionCounter (already incremented once per action by
// beginTurn before any damage roll happens), so this folds into the same
// multiplication chain as Momentum/Hunter's Instinct rather than needing
// its own "replay the action" logic.
function temporalEchoMultiplier(state) {
  if (!hasEffect(state, "temporal_echo") || !state.combat) return 1;
  const mult = masterOfArmsDoubles(state, "temporal_echo") ? 3 : 2;
  return state.combat.player.actionCounter > 0 && state.combat.player.actionCounter % 5 === 0 ? mult : 1;
}

// River Warden's 6pc set bonus (+2 Magic per "resist," max +8) is a
// combat-scoped bonus to the Magic stat itself, so it needs its own
// accessor the same way Defense has effectivePlayerDef — only
// rollPlayerDamage's magic-branch math reads this, not burn/heal/
// Stoneskin amounts (a narrower scope than a real stat change, by design).
function effectiveMagic(state) {
  const combat = state.combat;
  const magicBuff = combat && combat.player.magicBuffTurns > 0 ? combat.player.magicBuffAmount || 0 : 0;
  const everyChoiceMagic = ((combat && combat.player.everyChoiceMagicStacks) || 0) * 2;
  const endlessStudyMagic = (combat && combat.player.endlessStudyMagicBonus) || 0;
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
  const effectiveKnowledgeForExpandingMind = state.knowledge + ((combat && combat.player.knowledgeBuffAmount) || 0) + ((combat && combat.player.windsOfChangeKnowledge) || 0) + ((combat && combat.player.avatarOfChaosKnowledgeBonus) || 0) + ((combat && combat.player.perfectMemoryKnowledgeBonus) || 0);
  const expandingMindMagic = hasEffect(state, "expanding_mind") ? Math.floor(Math.max(0, effectiveKnowledgeForExpandingMind - 50) / 5) : 0;
  const unwaveringDevotionMagic = ((combat && combat.player.unwaveringDevotionStacks) || 0) * 2;
  const windsOfChangeMagic = (combat && combat.player.windsOfChangeMagic) || 0;
  const avatarOfChaosMagic = (combat && combat.player.avatarOfChaosMagicBonus) || 0;
  const workRefinesMagic = (combat && combat.player.workRefinesMagicStacks) || 0;
  const avatarOfCreationMagic = (combat && combat.player.avatarOfCreationMagicStacks) || 0;
  // Calm Waters (Regalia): a temporary Magic bonus granted whenever
  // Cleansing Current clears a status — see applyStatusCleanseOnHeal.
  const calmWatersMagic = combat && combat.player.calmWatersTurns > 0 ? combat.player.calmWatersMagicBonus || 0 : 0;
  // v0.11: flat stacks scale through flatStat; magicBuff is scaled at grant.
  const total = state.magic + magicBuff + flatStat(((combat && combat.player.riverWardenMagicBonus) || 0) + ((combat && combat.player.livingCurrentStacks) || 0) * 2 + everyChoiceMagic + endlessStudyMagic + expandingMindMagic + unwaveringDevotionMagic + windsOfChangeMagic + avatarOfChaosMagic + workRefinesMagic + avatarOfCreationMagic + calmWatersMagic);
  return Math.round(total * sovereigntyMultiplier(state));
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
  // Injury System v0.2 §3: "Healing (potions, Apothecary abilities,
  // passive regeneration) does nothing to a downed fighter." A downed
  // player can't act, so a self-cast heal can never reach here anyway,
  // but several Divine Regalia/set-bonus effects heal the player
  // unconditionally every round from inside beginTurn (Endless Bloom,
  // Blessing of Renewal, Lasting Foundation, Flowing Waters, ...) — this
  // single choke point is what actually stops THOSE from quietly
  // reviving/topping-up a downed player before a real rally does. Only
  // applyRallyItemOnPlayer and the D6 fight-ends-still-down 25% revive
  // set state.health directly, bypassing this guard, exactly as they
  // should.
  if (state.playerDowned) return { healed: 0, lines: [] };
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
  if (combat && combat.player.avatarOfDevotionTurns > 0) amt = Math.round(amt * 2);
  // Avatar of Endurance (Regalia of the Eternal Bastion 6pc): +50% healing
  // received for its 4-round window, stacking multiplicatively on top of
  // everything above.
  if (combat && combat.player.avatarOfEnduranceTurns > 0) amt = Math.round(amt * 1.5);
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
    const beforeTemp = combat.player.tempHealth || 0;
    combat.player.tempHealth = Math.min(cap, beforeTemp + overflow);
    if (combat.player.tempHealth > beforeTemp) {
      lines.push(`Overflowing Life — the excess crystallizes into ${combat.player.tempHealth - beforeTemp} Temporary Health.`);
    }
  }
  if (healed > 0 && combat && hasEffect(state, "living_current")) {
    combat.player.livingCurrentStacks = Math.min(5, (combat.player.livingCurrentStacks || 0) + 1);
  }
  // Compassion's Grace (Divine Regalia — Roseheart Scepter): whenever you
  // restore Health, also gain +2 Defense, capped +10 (5 stacks). The
  // source text says "for 2 rounds," but this engine has no precedent for
  // independent per-stack expiry (every other stacking bonus here —
  // Living Steel, Every Choice Matters, Battle Tempered — is permanent
  // for the rest of the fight once gained), so it's approximated the same
  // way for consistency.
  if (healed > 0 && combat && hasEffect(state, "compassions_grace")) {
    combat.player.compassionsGraceDefStacks = Math.min(5, (combat.player.compassionsGraceDefStacks || 0) + 1);
  }
  // Endless Current (Regalia of the Endless Tide 4pc): whenever you
  // remove a negative effect (never happens — no such mechanic exists;
  // see Cleansing Current/Calm Waters) or restore Health, gain +2
  // Attack/+2 Defense/+2 Magic for 3 rounds, stacking up to +10 in each
  // (5 stacks) — its own dedicated stack counter (rather than a plain
  // "+2 flat" like Rally the Line) since this one genuinely stacks in
  // magnitude across repeated procs, not just refreshes duration.
  if (healed > 0 && combat && hasSetTier(state, "Regalia of the Endless Tide", 4)) {
    combat.player.endlessCurrentStacks = Math.min(5, (combat.player.endlessCurrentStacks || 0) + 1);
    const dur = applyBeneficialEffectBonuses(state, 3);
    const grant = applyBlessingOfCreationBonus(state, flatStat(combat.player.endlessCurrentStacks * 2)); // v0.11 PLAYER_STAT_SCALE
    combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
    combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, grant);
    combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
    combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, grant);
    combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
    combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, grant);
  }
  // Avatar of Devotion: whenever you restore Health during its window,
  // immediately gain +5 Attack/+5 Magic/+5 Defense for 2 rounds.
  if (healed > 0 && combat && combat.player.avatarOfDevotionTurns > 0) {
    combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, 2);
    combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(5)));
    combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, 2);
    combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(5)));
    combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, 2);
    combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, flatStat(5)));
  }
  // Cleansing Current / Calm Waters (Regalia): now genuinely live —
  // combat.player.playerStatuses (Enemy Ability Engine) means there's finally
  // something for a heal to cleanse. See applyStatusCleanseOnHeal.
  if (healed > 0 && combat) lines.push(...applyStatusCleanseOnHeal(state));
  return { healed, lines };
}

// Step 1g-ii §2b: the one shared healing primitive for ANY fighter in
// combat (player/ally/enemy), same role applyAndReact (pipeline.js)
// plays for damage. Today it's a pure pass-through -- every one of its
// six call sites' own existing clamping math (Math.min(max, current +
// amount)) is preserved exactly, just performed here instead of
// inline -- but it gives Phase 2's anti-heal/healing-boost modifiers
// exactly one place to hook into once they exist, instead of six.
// Deliberately NOT applyHeal's generalization: applyHeal carries real
// PLAYER-only baggage (Flourishing Soul, Blessing of Compassion,
// Avatar of Devotion/Endurance, Mercy's Gift, Overflowing Life, Living
// Current, Compassion's Grace, Endless Current, the cleanse-on-heal
// hook, the playerDowned guard) that none of this function's six
// callers ever had or need -- folding them in would be new behavior on
// an enemy/ally heal that today's game has never had.
// target: a combatant view (makePlayerCombatant/makeAllyCombatant/
// makeEnemyCombatant, combatant.js). amount: the caller's own, already-
// computed pre-clamp heal number (e.g. Math.max(1, Math.round(maxHp *
// pct)) -- that floor/rounding stays at the call site, unchanged).
// source: a short string naming what's healing (not yet read by
// anything here -- a Phase 2 registry hook, same spirit as
// calculateDamage's `kind`). ctx: {state, ...} where available; not yet
// read either. Returns the actual amount healed (post-clamp), matching
// applyHeal's own `healed` convention.
function applyHealing(target, amount, source, ctx) {
  if (!(amount > 0)) return 0;
  if (target.kind === "player") {
    const state = target.ref;
    const before = state.health;
    state.health = Math.min(state.maxHealth, state.health + amount);
    return state.health - before;
  }
  if (target.kind === "ally") {
    const ally = target.ref;
    const before = ally.health;
    ally.health = Math.min(ally.maxHealth, ally.health + amount);
    return ally.health - before;
  }
  if (target.kind === "enemy") {
    const enemySlot = target.store;
    const before = enemySlot.hp;
    enemySlot.hp = Math.min(enemySlot.maxHp, enemySlot.hp + amount);
    return enemySlot.hp - before;
  }
  throw new Error(`applyHealing(): unknown target kind "${target.kind}"`);
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
  // "use <item> on <ally>" — same "on"-split shape as cmdGive's own
  // " to <ally>" parsing. Kept out of combat entirely (see
  // useItemOnAlly) rather than threading ally-targeting through the
  // turn/retaliation pipeline below, which is built around the player
  // being the one healed.
  const onSplit = arg.split(/\s+on\s+/);
  if (onSplit.length > 1) return useItemOnAlly(state, onSplit[0].trim(), onSplit.slice(1).join(" on ").trim());

  const needle = arg.toLowerCase();
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(needle));
  if (idx < 0) return [`You aren't carrying "${arg}".`];
  const item = state.inventory[idx];

  // A ration pack is slot:"material" by design (matches every other
  // crafting material — not directly usable, only consumed by system
  // logic), but eating one is a real player action, not a crafting
  // ingredient. Special-cased here, ahead of the consumable check below,
  // rather than reclassifying the item and blurring a distinction that
  // matters everywhere else materials show up. This is the actual fix for
  // Dungeon Delve's rationless debuff: activeDungeon.rationSpentThisFloor
  // previously had no writer anywhere in the codebase, so floorsSinceRation
  // could only ever increase — see engine/dungeon.js's markRoomCleared.
  if (item === "a ration pack") {
    if (!state.activeDungeon) return ["No reason to eat that right now."];
    state.inventory.splice(idx, 1);
    state.activeDungeon.rationSpentThisFloor = true;
    return ["You eat, keeping the hunger at bay for now."];
  }

  const def = getItemDef(item);
  if (!def || def.slot !== "consumable") return [`${item} isn't something you can use like that.`];
  // A "buff" effect is a timed COMBAT bonus (turns = combat rounds,
  // ticked by tickPlayerBuffs) — unlike heal, it means nothing outside a
  // fight, so it's rejected here before the item is even touched, rather
  // than consumed for no effect.
  if (!state.combat && def.useEffect && def.useEffect.type === "buff") {
    return [`${item} is for the middle of a fight — save it for one.`];
  }
  // Injury System v0.2 §7: Apothecary field treatment (injuryDowngrade)
  // is the opposite restriction — "only works outside combat" — rejected
  // here, before the item is touched, same shape as the buff check above.
  // rallyFromDowned never reaches here at all: it's never self-used (see
  // resolveOneAllyAction/applyRallyItemOnPlayer), so useItem has no
  // branch for it either.
  if (state.combat && def.useEffect && def.useEffect.type === "injuryDowngrade") {
    return [`${item} needs a steady hand and a quiet moment — not the middle of a fight.`];
  }

  if (!state.combat) {
    const result = applyConsumableEffect(state, item, def.useEffect);
    if (result.consumed) state.inventory.splice(idx, 1);
    return result.lines;
  }

  let creature = getCombatCreature(state);
  const out = beginTurn(state);
  // beginTurn can itself end the fight — a burn/bleed tick on a non-active
  // pack member (or the active one) can finish it off before this action
  // even resolves.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  // !state.combat: a faster enemy's pre-emptive strike inside
  // resolveSpeedInitiative can trigger the dungeon rescue, which heals
  // the player back up and ends combat outright — checking health alone
  // would miss that and let this function keep going into further
  // combat-only logic (e.g. resolveRemainingInitiativeActions) with state.combat
  // already null.
  if (!state.combat || state.health <= 0) return out;

  const result = applyConsumableEffect(state, item, def.useEffect);
  if (result.consumed) state.inventory.splice(idx, 1);
  out.push(...result.lines);
  if (!state.combat || state.health <= 0) return out;

  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, 0);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

// Branches on useEffect.type — currently "heal" (through the shared
// applyHeal entry point, so Flourishing Soul/Avatar of Devotion/etc. all
// apply to a potion's heal exactly like any other heal source), "buff",
// "cleanse", and "injuryDowngrade" — with a harmless fallback for a
// consumable authored without one yet. Returns { lines, consumed }:
// `consumed` is false whenever the effect would genuinely do nothing
// (already full Health with no Overflowing-Life-style conversion, no
// status to clear, no injury a splint can touch), so the item stays in
// the player's pack instead of being spent for nothing — useItem (both
// the in- and out-of-combat call sites) only splices it out of
// state.inventory when this says to.
function applyConsumableEffect(state, item, effect) {
  if (!effect) return { lines: [`You use ${item}, but nothing happens.`], consumed: false };
  if (effect.type === "heal") {
    const amount = Math.ceil(state.maxHealth * effect.pct);
    const { healed, lines } = applyHeal(state, amount);
    // healed<=0 with no lines means applyHeal's own guards (playerDowned,
    // amount<=0) or a full-Health clamp left nothing to report — EXCEPT
    // Overflowing Life (Regalia of the First Bloom 4pc), which still
    // produces a real line (Temporary Health from the "wasted" healing)
    // even when healed itself is 0, so that case still consumes the item.
    if (healed <= 0 && !lines.length) {
      return { lines: [`You're already at full health — ${item} would do nothing right now.`], consumed: false };
    }
    return { lines: [`You drink ${item}, mending ${healed} health.`, ...lines], consumed: true };
  }
  // useItem's own guard above already rejects a "buff" effect outside
  // combat, so state.combat is always live here.
  if (effect.type === "buff") {
    const amount = scaledStat(effect.stat, effect.amount); // v0.11 PLAYER_STAT_SCALE (Attack/Defense/Magic only)
    state.combat.player.playerBuffs[effect.stat] = { amount, turns: effect.turns };
    return { lines: [`You drink ${item} — +${amount} ${STAT_LABELS[effect.stat] || effect.stat} for ${effect.turns} turns.`], consumed: true };
  }
  if (effect.type === "cleanse") {
    // Nothing to clear outside combat either — state.combat.player.playerStatuses
    // only ever exists mid-fight, and a cleanse potion used outside one
    // would otherwise crash reading it.
    if (!state.combat) {
      return { lines: [`There's nothing to clear right now — ${item} would do nothing.`], consumed: false };
    }
    const cleared = effect.all
      ? Object.keys(state.combat.player.playerStatuses)
      : effect.statuses.filter((s) => state.combat.player.playerStatuses[s]);
    if (!cleared.length) {
      return { lines: [`There's nothing to clear right now — ${item} would do nothing.`], consumed: false };
    }
    cleared.forEach((s) => delete state.combat.player.playerStatuses[s]);
    return { lines: [`You drink ${item}, clearing: ${cleared.join(", ")}.`], consumed: true };
  }
  // Apothecary field treatment (Injury System v0.2 §7): severe -> minor,
  // never removes an injury, and each injury can only be field-treated
  // once (fieldTreated) — otherwise splints would hand out unlimited
  // downs in the field, per the spec's own stated reason for the limit.
  // useItem's own gate above already keeps this out of combat entirely.
  if (effect.type === "injuryDowngrade") {
    const target = (state.injuries || []).find((inj) => inj.severity === "severe" && !inj.fieldTreated);
    if (!target) {
      return { lines: [`There's nothing a splint can help with right now.`], consumed: false };
    }
    target.severity = "minor";
    target.fieldTreated = true;
    state.recomputeStats(true);
    return { lines: [`You use ${item} on your ${injurySlotName(target.id).toLowerCase()} — still hurt, but no longer as bad.`], consumed: true };
  }
  return { lines: [`You use ${item}, but nothing happens.`], consumed: false };
}

// Out-of-combat only (mid-fight healing is still self-only via useItem's
// own turn/retaliation pipeline above — this doesn't thread an ally
// target through that, just the calmer non-combat path). findAlly is
// parser.js's, same fuzzy match cmdGive/cmdReclaim already use.
function useItemOnAlly(state, itemNeedle, allyNeedle) {
  if (state.combat) return ["You can only tend to allies outside of combat."];
  if (!state.party.length) return ["You have no allies to use anything on."];
  const ally = findAlly(state, allyNeedle);
  if (!ally) return [`No one in your party matches "${allyNeedle}".`];
  if (!ally.alive) return [`${ally.name} is down — try the Sanctuary instead.`];
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(itemNeedle.toLowerCase()));
  if (idx < 0) return [`You aren't carrying "${itemNeedle}".`];
  const item = state.inventory[idx];
  const def = getItemDef(item);
  if (!def || def.slot !== "consumable") return [`${item} isn't something you can use like that.`];
  state.inventory.splice(idx, 1);
  return applyConsumableEffectToAlly(item, ally, def.useEffect);
}

// Ally counterpart to applyConsumableEffect — deliberately simpler, with
// none of applyHeal's player-gear buff stacking (Flourishing Soul etc. are
// checked against the PLAYER's own effects/sets, not an ally's), matching
// how allies already heal themselves in companion.js.
function applyConsumableEffectToAlly(item, ally, effect) {
  if (!effect) return [`You use ${item} on ${ally.name}, but nothing happens.`];
  if (effect.type === "heal") {
    const amount = Math.ceil(ally.maxHealth * effect.pct);
    const healed = applyHealing(makeAllyCombatant(ally), amount, "consumable", null);
    return [`You give ${item} to ${ally.name}, mending ${healed} health.`];
  }
  // Unlike the player's combat.player.playerBuffs, an ally's buff lives directly
  // on the ally object (state.js's recruitAlly), not per-fight combat
  // state — useItemOnAlly only ever runs OUTSIDE combat (see its own
  // guard above), so a buff applied here has to survive until the next
  // fight actually starts ticking it down (companion.js's tickAllyBuffs,
  // called from combat.js's beginTurn).
  if (effect.type === "buff") {
    // Saves from before ally.buffs existed (state.js's recruitAlly) won't
    // have the field at all.
    if (!ally.buffs) ally.buffs = {};
    const amount = scaledStat(effect.stat, effect.amount); // v0.11 PLAYER_STAT_SCALE
    ally.buffs[effect.stat] = { amount, turns: effect.turns };
    return [`You give ${item} to ${ally.name} — +${amount} ${STAT_LABELS[effect.stat] || effect.stat} for their next ${effect.turns} rounds of combat.`];
  }
  // Same shape as the player's own cleanse branch above — ally.statuses
  // may still be carrying a status that hadn't finished ticking down when
  // the last fight ended (startCombat only resets it at the START of the
  // NEXT fight, so there's a real window between fights where this
  // matters), even though useItemOnAlly itself only ever runs outside
  // combat.
  if (effect.type === "cleanse") {
    if (!ally.statuses) ally.statuses = {};
    const cleared = effect.all
      ? Object.keys(ally.statuses)
      : effect.statuses.filter((s) => ally.statuses[s]);
    cleared.forEach((s) => delete ally.statuses[s]);
    return cleared.length
      ? [`You use ${item} on ${ally.name}, clearing: ${cleared.join(", ")}.`]
      : [`You use ${item} on ${ally.name}, but there's nothing clinging to them to clear.`];
  }
  return [`You use ${item} on ${ally.name}, but nothing happens.`];
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
// resolveEnemyAttackOnPlayer, and attemptFlee's failed-flee hit).
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
  return activeEnemySlot(combat).hp <= activeEnemySlot(combat).maxHp * executionerThreshold(state) ? 1.2 : 1;
}

// Generalized Executioner, for an enemy or ally attacker: any ATTACKER
// wearing it gets 1.2x vs a DEFENDER at or below 30% of its own max
// Health. A non-player attacker has no equivalent to the player's own
// set-tier threshold-widening (Drake Hunter 6pc etc. — a player-only
// Regalia system, out of scope here), so this always uses the flat 30%
// base rather than reading executionerThreshold.
function executionerMultiplierFor(attacker, defenderHp, defenderMaxHp) {
  if (!hasEffect(attacker, "executioner")) return 1;
  return defenderHp <= defenderMaxHp * 0.3 ? 1.2 : 1;
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
  if (!state.combat || !activeEnemySlot(state.combat).bleed) return 1;
  return hasSetTier(state, "Bonecaller", 6) ? 1.2 : 1;
}

// Siege Corps's 6pc set bonus grants a one-shot +2 Attack "next turn"
// whenever Brace fires (see useFeint/useElementAbility's earth case) —
// consumed by whichever physical damage roll comes next, wherever that is.
function consumeSiegeCorpsAtkCharge(state) {
  if (!state.combat || !state.combat.player.siegeCorpsAtkCharge) return 0;
  state.combat.player.siegeCorpsAtkCharge = 0;
  return 2;
}
// Pure read of the same charge, for peekPlayerAtk (step 1e handoff §3.2)
// — never zeroes it. The pipeline's applyAndReactPlayerActor calls
// consumeSiegeCorpsAtkCharge above directly when it actually needs to
// spend the charge; this one is for a stat() read that must not.
function peekSiegeCorpsAtkCharge(state) {
  return (state.combat && state.combat.player.siegeCorpsAtkCharge) ? 2 : 0;
}

// Foreseen Strike (Divine Regalia — Loom of Destinies): every 3rd action
// (any physical attack or elemental cast — shares combat.player.actionCounter,
// already incremented once per action by beginTurn) ignores 50% of the
// target's effective Defense. Its "cannot miss" clause is trivially
// already true — the player's own attacks in this engine always deal at
// least 1 damage, with no miss/failure state to bypass.
function foreseenStrikeDefMultiplier(state) {
  return hasEffect(state, "foreseen_strike") && state.combat && state.combat.player.actionCounter > 0 && state.combat.player.actionCounter % 3 === 0 ? 0.5 : 1;
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
  if (combat.player.unlikelyOutcomeGuaranteedCrit) {
    combat.player.unlikelyOutcomeGuaranteedCrit = false;
    return combat.player.avatarOfFateTurns > 0 ? 2.0 : 1.5;
  }
  let chance = 0;
  if (hasSetTier(state, "Regalia of the Woven Thread", 2) && combat.player.actionCounter === 1) chance += 0.25;
  if (isSpell && hasSetTier(state, "Regalia of the Endless Archive", 2)) chance += 0.2;
  // Blessing of Fortune (Regalia of the Laughing Gale 2pc): +5% Critical
  // Chance per successful crit this fight, capped at +25% (5 stacks) — the
  // stack itself grows in rollPlayerDamage, right after this function's
  // result is read for the current hit.
  if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) chance += Math.min(combat.player.blessingOfFortuneCritStacks || 0, 5) * 0.05;
  // Avatar of Chaos (Regalia of the Laughing Gale 6pc): doubles whatever
  // crit chance is on offer for its 4-round window.
  if (combat.player.avatarOfChaosTurns > 0) chance *= 2;
  if (chance <= 0 || Math.random() >= chance) return 1;
  return combat.player.avatarOfFateTurns > 0 ? 2.0 : 1.5;
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
  return state.combat && state.combat.player.avatarOfChaosTurns > 0 ? 0.75 + Math.random() : 1;
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
  if (!state.combat || !(state.combat.player.avatarOfKnowledgeTurns > 0)) return matchup;
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
  if (!combat.player.endlessStudyKeys) combat.player.endlessStudyKeys = [];
  if (combat.player.endlessStudyKeys.includes(actionKey) || (combat.player.endlessStudyMagicBonus || 0) >= 20) return [];
  combat.player.endlessStudyKeys.push(actionKey);
  combat.player.endlessStudyMagicBonus = Math.min(20, (combat.player.endlessStudyMagicBonus || 0) + 2);
  // v0.11 PLAYER_STAT_SCALE: endlessStudyMagicBonus is a raw stat-point
  // stack, folded into effectiveMagic's flatStat()'d total.
  return [`Endless Study — a new technique, understood; +${flatStat(2)} Magic (now +${flatStat(combat.player.endlessStudyMagicBonus)}).`];
}

// Prepared Response (Divine Regalia — Librarian's Ward): the enemy in
// this engine only ever has ONE retaliation "ability" (its fixed physical
// or elemental attack), so "an ability you've already witnessed" is
// trivially true from the SECOND enemy retaliation onward — reduces that
// and every later hit by 25%.
function preparedResponseMultiplier(state) {
  if (!hasEffect(state, "prepared_response") || !state.combat) return 1;
  const combat = state.combat;
  if (!combat.player.preparedResponseWitnessed) {
    combat.player.preparedResponseWitnessed = true;
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
  if (combat.player.sharedBurdenUsed || dmg <= state.maxHealth * 0.3) return 1;
  combat.player.sharedBurdenUsed = true;
  return 0.6;
}

// Calming Presence (Divine Regalia — Cloak of Gentle Light): enemies deal
// 10% less damage during the first three rounds of combat — reuses the
// shared combat.player.actionCounter (already incremented once per action).
function calmingPresenceMultiplier(state) {
  return hasEffect(state, "calming_presence") && state.combat && state.combat.player.actionCounter > 0 && state.combat.player.actionCounter <= 3 ? 0.9 : 1;
}

// Avatar of Devotion (Regalia of the Eternal Heart 6pc): a flat 35% cut
// to all incoming damage for its 4-round window, layered into the same
// chain as Shield Wall/Master Duelist/Unbroken Line/Prepared Response/
// Calming Presence above.
function avatarOfDevotionDamageMultiplier(state) {
  return state.combat && state.combat.player.avatarOfDevotionTurns > 0 ? 0.65 : 1;
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
  return state.combat && state.combat.player.avatarOfEnduranceTurns > 0 ? 0.5 : 1;
}

// Avatar of Renewal (Regalia of the Endless Tide 6pc): a flat 30% cut to
// all incoming damage for its 4-round window, layered into the same
// chain as the other "Avatar of X" damage-reduction effects.
function avatarOfRenewalDamageMultiplier(state) {
  return state.combat && state.combat.player.avatarOfRenewalTurns > 0 ? 0.7 : 1;
}

// Adaptive Tide (Divine Regalia — Vestments of the Endless Sea): -5% to a
// specific damage TYPE per stack, capped at 5 stacks (-25%), grown
// separately per type (physical vs magic — the only two incoming-damage
// types that actually reach the player in this engine; "Burn," cited as
// an example in the source text, is a DoT the player only ever inflicts
// on enemies, never receives, so there's a third bucket with nothing to
// ever grow it). Stacks grow in resolveEnemyAttackOnPlayer, right after each
// branch's damage is finalized.
function adaptiveTidePhysicalMultiplier(state) {
  if (!hasEffect(state, "adaptive_tide") || !state.combat) return 1;
  return 1 - Math.min(state.combat.player.adaptiveTidePhysicalStacks || 0, 5) * 0.05;
}
function adaptiveTideMagicMultiplier(state) {
  if (!hasEffect(state, "adaptive_tide") || !state.combat) return 1;
  return 1 - Math.min(state.combat.player.adaptiveTideMagicStacks || 0, 5) * 0.05;
}

// Unyielding Wall (Divine Regalia — Bulwark of Ages): the first hit that
// would exceed 25% of max Health instead deals exactly 25%, usable again
// every 3 rounds (unlike Shared Burden's once-per-fight gate) — a direct
// damage-value cap rather than a percentage multiplier, so it's applied
// as the very last step in the chain, on the fully-mitigated damage value.
function applyUnyieldingWall(state, dmg) {
  if (!hasEffect(state, "unyielding_wall") || !state.combat) return dmg;
  const combat = state.combat;
  if ((combat.player.unyieldingWallCooldown || 0) > 0) return dmg;
  const cap = Math.round(state.maxHealth * 0.25);
  if (dmg <= cap) return dmg;
  combat.player.unyieldingWallCooldown = 3;
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
  return 1 + Math.min(state.combat.player.momentumUnboundStacks || 0, 6) * 0.05;
}

// Tempered Steel (Divine Regalia — Forgefather's Hammer): +2% damage per
// successful attack (physical or spell — rollPlayerDamage is the single
// shared roll for both, and every existing per-hit stacking bonus here
// already treats "attack" uniformly across both branches), permanent for
// the rest of the fight, capped at +30% (15 stacks). Stacks grow after
// the roll, at the bottom of rollPlayerDamage.
function temperedSteelMultiplier(state) {
  if (!hasEffect(state, "tempered_steel") || !state.combat) return 1;
  return 1 + Math.min(state.combat.player.temperedSteelStacks || 0, 15) * 0.02;
}

// Master Craftsman (Divine Regalia — Smith's Grasp): +20% damage whenever
// the effective Attack used for THIS physical hit exceeds the enemy's
// (raw) Defense by 10 or more — a live, per-hit threshold check rather
// than a stacking bonus, scoped to the physical branch only (an
// Attack-vs-Defense comparison has no equivalent meaning for a Magic-vs-
// Defense spell roll).
function masterCraftsmanMultiplier(atk, creature) {
  return atk - creature.def >= flatStat(10) ? 1.2 : 1; // v0.11: margin on the PLAYER_STAT_SCALE'd scale
}

// Borrowed Seconds (Divine Regalia — Epochkeeper): every 4th action
// either refunds 50% of the cooldown it just set (Feint/Decoy/Disarm/an
// elemental cast) or, if the action has no cooldown at all (a plain
// Attack or Ambush), grants +15% damage to that same hit instead. A
// read-only check (no "used" flag) — "every 4th action" is naturally
// self-gating via the modulus, the same shape Calming Presence/Work
// Refines already use.
function borrowedSecondsActive(state) {
  return hasEffect(state, "borrowed_seconds") && state.combat && state.combat.player.actionCounter > 0 && state.combat.player.actionCounter % 4 === 0;
}

// Timeless Guard (Divine Regalia — Chronal Dial): the first incoming
// attack every 3 rounds deals 0 damage entirely — a full negation
// (unlike Unyielding Wall's damage CAP), on its own 3-round recharge
// (unlike Shared Burden's once-per-fight gate). Checked (and, on
// success, its own cooldown reset) at the very top of
// resolveEnemyAttackOnPlayer, before any of the other evasion/miss checks.
function applyTimelessGuard(state) {
  if (!hasEffect(state, "timeless_guard") || !state.combat) return false;
  const combat = state.combat;
  if ((combat.player.timelessGuardCooldown || 0) > 0) return false;
  combat.player.timelessGuardCooldown = 3;
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
  if (hasEffect(state, "momentum_unbound") && combat.player.lastActionType && combat.player.lastActionType !== actionType && (combat.player.momentumUnboundStacks || 0) < 6) {
    combat.player.momentumUnboundStacks = (combat.player.momentumUnboundStacks || 0) + 1;
    lines.push(`Momentum Unbound builds — the shift in rhythm adds +5% damage (now +${combat.player.momentumUnboundStacks * 5}%).`);
  }
  combat.player.lastActionType = actionType;
  combat.player.actionTypeHistory = [...(combat.player.actionTypeHistory || []), actionType].slice(-3);
  if (hasSetTier(state, "Regalia of the Endless Horizon", 4) && combat.player.actionTypeHistory.length === 3 && new Set(combat.player.actionTypeHistory).size === 3) {
    const dur = applyBeneficialEffectBonuses(state, 3);
    combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
    combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(10)));
    combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
    combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(10)));
    // v0.11 PLAYER_STAT_SCALE: the flatStat(10) above is the real grant;
    // the bare "10" is only the pre-scale design value.
    lines.push(`Ever Forward — three strides, three shapes; +${flatStat(10)} Attack, +${flatStat(10)} Magic for ${dur} rounds.`);
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
  const recent = combat.player.recentActionKeys || [];
  const lines = [];
  if (!recent.includes(actionKey)) {
    const dur = applyBeneficialEffectBonuses(state, 2);
    combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
    combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(4)));
    combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
    combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(4)));
    // v0.11 PLAYER_STAT_SCALE: see Ever Forward's own copy of this note.
    lines.push(`Wanderer's Reward — new ground, new strength; +${flatStat(4)} Attack, +${flatStat(4)} Magic for ${dur} rounds.`);
  }
  combat.player.recentActionKeys = [actionKey, ...recent].slice(0, 2);
  return lines;
}

// Perfect Memory (Divine Regalia — Robes of Endless Record): the first
// time each DISTINCT Tactic or Elemental Ability is used in a fight
// grants +2 Knowledge permanently for that combat, capped at +16 (8
// distinct actions) — Endless Study's exact shape, but scoped to
// Tactics/Elemental Abilities only (never plain Attack, unlike Endless
// Study/Wanderer's Reward's broader actionKey), so it uses its own
// separate tracking list rather than piggybacking on
// combat.player.endlessStudyKeys. Called only from the tactic/elemental-ability
// action functions, never from playerAttack.
function applyPerfectMemory(state, actionKey) {
  if (!hasEffect(state, "perfect_memory") || !state.combat) return [];
  const combat = state.combat;
  if (!combat.player.perfectMemoryKeys) combat.player.perfectMemoryKeys = [];
  if (combat.player.perfectMemoryKeys.includes(actionKey) || (combat.player.perfectMemoryKnowledgeBonus || 0) >= 16) return [];
  combat.player.perfectMemoryKeys.push(actionKey);
  combat.player.perfectMemoryKnowledgeBonus = Math.min(16, (combat.player.perfectMemoryKnowledgeBonus || 0) + 2);
  return [`Perfect Memory — a new technique, remembered; +2 Knowledge (now +${combat.player.perfectMemoryKnowledgeBonus}).`];
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
  if (combat.player.avatarOfFreedomTurns > 0) return true;
  return hasEffect(state, "trailblazer") && !combat.player.trailblazerUsed;
}

// Consumes Trailblazer's one-time bypass, unconditionally, the moment any
// Ability/Tactic actually resolves — whether or not the bypass was
// actually needed for that particular use, the same "first use, no matter
// what" consumption Perfect Timing (Mythic) already established.
function consumeTrailblazer(state) {
  if (state.combat && hasEffect(state, "trailblazer") && !state.combat.player.trailblazerUsed) {
    state.combat.player.trailblazerUsed = true;
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
  return 1 + Math.min(state.combat.player.worthyChallengeStacks || 0, 10) * 0.05;
}

// Blessing of Valor (Regalia of the Crimson Vanguard 2pc): the opening
// attack of the fight deals +30% damage — same actionCounter === 1 gate
// as Hunter's Instinct/critMultiplier. Its "restore 15% Health if it
// defeats the target" clause lives in resolveKill instead, since only
// resolveKill knows the hit was lethal.
function blessingOfValorMultiplier(state) {
  return hasSetTier(state, "Regalia of the Crimson Vanguard", 2) && state.combat && state.combat.player.actionCounter === 1 ? 1.3 : 1;
}

// Commanding Presence (Regalia of the Crimson Vanguard 4pc): every 3rd
// attack fully ignores the target's Defense (a stronger version of
// Foreseen Strike's 50% ignore — the two stack multiplicatively if a
// character somehow has both, which still just zeroes effective Defense
// either way). Its "cannot miss"/"cannot be blocked" clauses are
// trivially already true, the same reasoning as Foreseen Strike/Avatar of
// Fate's equivalent clauses.
function commandingPresenceDefMultiplier(state) {
  return hasSetTier(state, "Regalia of the Crimson Vanguard", 4) && state.combat && state.combat.player.actionCounter > 0 && state.combat.player.actionCounter % 3 === 0 ? 0 : 1;
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
    combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, d);
    combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, flatStat(2));
    combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, d);
    combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, flatStat(2));
    combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, d);
    combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, flatStat(2));
  }
  return d;
}

// Hardened Formation (MIL-IE001, Veteran Tower Shield V1-V3) / Officer's
// Bearing (MIL-IE007, Officer Signet V1-V2) — the codex's own "same
// mechanical pattern...not a second mechanical effect" merge note: two
// distinct effect ids (so each item declares its own) resolving through
// ONE shared, wearer-neutral mechanism. This generalizes the player-only
// Stonewarden 6pc precedent (combat.player.firstHitTakenUsed/hasSetTier(state,
// "Stonewarden", 6), resolveEnemyAttackOnPlayer/attemptFlee below) the same
// way Ally Protection Reaction was generalized from its own
// Hadrian-specific precedent — but mirrored to the other side of the
// exchange: this fires on the WEARER's first incoming hit from the
// PLAYER's own damage, not the player's first hit taken from any enemy,
// so the flag lives on the creature object itself
// (enemyFirstHitTakenUsed) rather than on combat. No explicit per-combat
// reset is needed: every enemy creature object is rebuilt fresh by
// buildFightCreature at the start of each fight (same reasoning as
// commandersPoiseUsed/serratedOpeningUsed/huntersCallUsed elsewhere in
// this file), so the flag simply starts undefined each time.
// Watchman's Resilience (SANG-SEC-IE004, Reinforced Watch Shield/Master
// Watch Shield, Sanguivorum Security and Enforcement): "first successful
// damaging attack received each combat, final damage x0.90, once/combat"
// — EXACTLY the Hardened Formation/Officer's Bearing mechanism above, a
// third effect id resolving through the same shared, wearer-neutral
// mechanism rather than a second one. Contractor's Endurance (SANG-IAG-IE002,
// Reinforced/Master Contract Shield, Sanguivorum Independent Armed Groups):
// identical wording ("first successful damaging hit taken each combat,
// final damage x0.90, once/combat") — a fourth id on the same mechanism.
const ONE_HIT_MITIGATION_EFFECT_IDS = ["sang_mil_ie001_hardened_formation", "sang_mil_ie007_officers_bearing", "sang_sec_ie004_watchmans_resilience", "sang_iag_ie002_contractors_endurance"];
function hasOneHitMitigationEffect(carrier) {
  return ONE_HIT_MITIGATION_EFFECT_IDS.some((id) => hasEffect(carrier, id));
}
function enemyOneHitMitigationMultiplier(creature) {
  if (!creature.enemyFirstHitTakenUsed && hasOneHitMitigationEffect(creature)) {
    creature.enemyFirstHitTakenUsed = true;
    return 0.9;
  }
  return 1;
}

// Duelist's Bulwark (SANG-SEC-IE007, Ovum Veteran Tower Shield,
// Sanguivorum Security and Enforcement) / Champion's Poise (SANG-IAG-IE006,
// Champion's Arena Shield, Sanguivorum Independent Armed Groups): "on
// successful damaging hit received, final damage x0.90; CD4 wearer turns;
// max twice/combat; no retaliation or reaction chain" — identical wording,
// two effect ids (so each item declares its own) resolving through ONE
// shared, repeatable mitigation mechanism, generalized the same way
// ONE_HIT_MITIGATION_EFFECT_IDS/hasOneHitMitigationEffect above share one
// mechanism across several once-per-combat ids. Unlike that flat
// once-per-combat flag, this one is REPEATABLE — gated by a cooldown and a
// 2-use cap instead, the same cooldown/cap bookkeeping shape as
// applyAllyProtectionReaction's own allyProtectionCooldown/
// allyProtectionUsesThisCombat (per-wearer fields living on the creature
// object itself, renamed from this mechanism's original duelistBulwark*
// naming to repeatableMitigation* now that a second, unrelated item shares
// them, ticked once per round in tickEnemyPassives below alongside
// smugglersGuardCooldown/tyrantsEdgeCooldown). "No retaliation or reaction
// chain" holds for free: this only ever scales the damage number
// rollPlayerDamage is already computing, the same as
// enemyOneHitMitigationMultiplier above — it never itself triggers any
// further action.
const REPEATABLE_MITIGATION_EFFECT_IDS = ["sang_sec_ie007_duelists_bulwark", "sang_iag_ie006_champions_poise"];
function hasRepeatableMitigationEffect(carrier) {
  return REPEATABLE_MITIGATION_EFFECT_IDS.some((id) => hasEffect(carrier, id));
}
function enemyRepeatableMitigationMultiplier(creature) {
  if (!hasRepeatableMitigationEffect(creature)) return 1;
  const cooldown = creature.repeatableMitigationCooldown || 0;
  const uses = creature.repeatableMitigationUsesThisCombat || 0;
  if (cooldown > 0 || uses >= 2) return 1;
  creature.repeatableMitigationCooldown = 4;
  creature.repeatableMitigationUsesThisCombat = uses + 1;
  return 0.9;
}

function rollPlayerDamage(state, creature, activeElement) {
  const defPenalty = (state.combat && activeEnemySlot(state.combat).enemyDefPenalty) || 0;
  // Smuggler's Guard / Commander's Poise (Sanguivorum Criminal
  // Underworld) and Hardened Formation / Officer's Bearing (Sanguivorum
  // Imperial Military, above) — all consumed once here regardless of
  // which branch (spell or physical) below ends up computing this hit's
  // damage.
  const sangMit = sangCuDefenderMitigation(creature) * enemyOneHitMitigationMultiplier(creature) * enemyRepeatableMitigationMultiplier(creature) * enemyAllyProtectionMultiplier(state, creature);
  // Brace/Guarded Strike, generalized: this creature may have banked a
  // Defense bonus against its next incoming hit (resolveEnemyAction's own
  // non-damaging-action branch, or its own landed basic attack — see
  // resolveEnemyAttackOnPlayer/resolveEnemyAttackOnAlly) — consumed here, the
  // one place the player's own damage against any creature is computed.
  const bankedDefBonus = (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0);
  creature.braceBonusDef = 0;
  creature.guardedStrikeBonusDef = 0;
  // Sure Foundation (DRA-E05): physical-only, so kept out of
  // bankedDefBonus above (which Brace/Guarded Strike apply to both the
  // magic and physical branches below) — only peeked here; the physical
  // branch itself decides whether to consume it, since "magic bypasses"
  // means a magic hit in between shouldn't spend the pending charge.
  const sureFoundationDef = creature.sureFoundationBonusDef || 0;
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
  const threadsMult = state.combat && state.combat.player.threadsOfConsequencePending ? 1.4 : 1;
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
  const avatarOfTimeMult = state.combat && state.combat.player.avatarOfTimeTurns > 0 ? 1.25 : 1;
  let dmg;
  if (isSpell) {
    const magic = effectiveMagic(state);
    // Arcane Convergence (Artifact): rolls the base damage twice and keeps
    // the higher result — an "advantage" reroll rather than a flat
    // multiplier, so it still respects the natural magic-2..magic+2 spread.
    let base = randInt(magic - 2, magic + 2);
    if (hasEffect(state, "arcane_convergence")) base = Math.max(base, randInt(magic - 2, magic + 2));
    // v0.9 playtest fix: was /40 — quadratic in magic, and combined with
    // Mage's old 1.6x growth multiplier (see data/classes.js), an unspent
    // Mage was one-shotting elite-tier enemies by level 20-25. Splitting
    // the fix across both this slope and the growth multiplier (rather
    // than cutting the multiplier alone to ~0.6, which would gut the
    // class's identity below Warrior's own atk growth) moves each lever
    // less. Isolated to the player — enemy elemental attacks
    // (resolveEnemyAttackOnPlayer) use a different, non-quadratic formula,
    // and companions have their own separate damage path that doesn't
    // reference this constant.
    const multiplier = 1 + magic / 60;
    const matchup = avatarOfKnowledgeMatchupOverride(state, elementMultiplier(state, activeElement, creature.element));
    const effDef = Math.max(0, creature.def + bankedDefBonus - defPenalty) * foreseenDefMult * commandingDefMult * precisionFormulaMultiplier(state);
    const overflowMult = arcaneOverflowMultiplier(state);
    // v0.11: spell power is mitigated by the target's FULL Defense through
    // the shared ratio rule (was a near-irrelevant flat -Defense/10), then
    // every multiplier applies to the post-armor result. Precision
    // Formula's 30% Defense-ignore (already folded into effDef above) is
    // now the spell-side armor-penetration tool rather than a rounding
    // error.
    const spellPower = base * multiplier;
    const preMitigation = Math.round(mitigate(spellPower, effDef) * matchup * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * overflowMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * avatarOfTimeMult * stonesPatienceMult);
    // dmgReduction (Enemy Ability Engine — Guarded Stance/
    // Protective Cover/Last Stand, Gate 5B.8 skills codex): a flat final
    // percentage shave off whatever damage already made it through every
    // other multiplier and the Defense subtraction above — applied last,
    // same as a shield would be, not folded into the multiplier chain.
    dmg = Math.max(1, Math.round(preMitigation * (1 - (creature.dmgReduction || 0)) * sangMit));
    // Avatar of Creation (Regalia of the Eternal Forge 6pc): every spell
    // cast during its 4-round window PERMANENTLY increases Magic by +2 —
    // unlike Avatar of Chaos/Endurance's own window-scoped bonus fields,
    // this one deliberately does NOT reset when the window ends (matching
    // the source text's own "permanently," in contrast to the "for 4
    // rounds" +40% Magic buff granted alongside it).
    if (state.combat.player.avatarOfCreationTurns > 0) {
      state.combat.player.avatarOfCreationMagicStacks = (state.combat.player.avatarOfCreationMagicStacks || 0) + 2;
    }
  } else {
    const armorCrack = armorCrackAmount(state);
    const effDef = Math.max(0, creature.def + bankedDefBonus + sureFoundationDef - defPenalty - armorCrack) * foreseenDefMult * commandingDefMult;
    // effectivePlayerAtk (above): the same formula this line used to
    // compute inline, now shared with anything else that needs the
    // player's effective Attack (Dungeon Delve's rationless debuff).
    // Called exactly once per damage roll, same as before extraction —
    // it consumes Siege Corps' one-shot Attack charge internally.
    const atk = effectivePlayerAtk(state);
    const crushBase = crushingImpactMultiplier(state);
    const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
    // Master Craftsman (Divine Regalia — Smith's Grasp): compares this
    // hit's own effective Attack (all the buffs/stacks above already
    // folded in) against the enemy's raw Defense.
    const craftsmanMult = hasEffect(state, "master_craftsman") ? masterCraftsmanMultiplier(atk, creature) : 1;
    // v0.11: shared ratio mitigation (was a flat -Defense/3 before the
    // multiplier chain) — see mitigate() near the top of this file.
    const base = mitigate(randInt(Math.max(1, atk - 2), atk + 2), effDef);
    // Echoing Arsenal (Artifact): every 5th physical/weapon-attack roll
    // (playerAttack, Ambush, Decoy, Disarm — anything landing in this
    // "else" branch) deals double damage. Its own counter, separate from
    // combat.player.actionCounter, so mixing in elemental casts doesn't throw off
    // the count of actual weapon swings.
    state.combat.player.weaponAttackCounter = (state.combat.player.weaponAttackCounter || 0) + 1;
    const echoingArsenalMult = hasEffect(state, "echoing_arsenal") && state.combat.player.weaponAttackCounter % 5 === 0 ? 2 : 1;
    // dmgReduction: see the magic branch above for why this is
    // the last step, after every other multiplier.
    dmg = Math.max(1, Math.round(base * crushMult * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * echoingArsenalMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * craftsmanMult * avatarOfTimeMult * stonesPatienceMult * (1 - (creature.dmgReduction || 0)) * sangMit));
    // Sure Foundation (DRA-E05): this physical hit just landed (dmg is
    // always >= 1 by this point — a miss never reaches rollPlayerDamage
    // at all) — so any pending charge is now spent (whether or not this
    // creature even carries the effect, consuming is unconditional on a
    // landed physical hit), and a fresh one is banked for the creature's
    // NEXT incoming physical hit if it still carries the effect.
    creature.sureFoundationBonusDef = 0;
    creature.sureFoundationBonusDefTurnsLeft = 0;
    if (hasEffect(creature, "dra_e05_sure_foundation")) {
      creature.sureFoundationBonusDef = 2;
      creature.sureFoundationBonusDefTurnsLeft = 2;
    }
    // Avatar of Creation (Regalia of the Eternal Forge 6pc): every
    // successful physical attack during its window PERMANENTLY increases
    // Attack by +2 — see the spell-branch comment above for why this
    // doesn't reset with the window.
    if (state.combat.player.avatarOfCreationTurns > 0) {
      state.combat.player.avatarOfCreationAtkStacks = (state.combat.player.avatarOfCreationAtkStacks || 0) + 2;
    }
  }
  // Tempered Steel (Divine Regalia — Forgefather's Hammer): every
  // successful attack (dmg is always >= 1 by this point) permanently
  // grows its own stack for the NEXT hit, capped at 15 (+30%) — the same
  // "read the stack before this roll, grow it after" ordering Momentum/
  // Worthy Challenge use above.
  if (hasEffect(state, "tempered_steel")) {
    state.combat.player.temperedSteelStacks = Math.min(15, (state.combat.player.temperedSteelStacks || 0) + 1);
  }
  state.combat.player.threadsOfConsequencePending = false;
  state.combat.enemyActedFirstThisRound = false;
  if (hasEffect(state, "momentum")) {
    state.combat.player.momentumStacks = Math.min(5, (state.combat.player.momentumStacks || 0) + 1);
  }
  if (hasEffect(state, "worthy_challenge")) {
    state.combat.player.worthyChallengeStacks = Math.min(10, (state.combat.player.worthyChallengeStacks || 0) + 1);
  }
  // Blessing of Fortune (Regalia of the Laughing Gale 2pc) and Avatar of
  // Chaos (6pc): both key off THIS hit having just critted (critMult > 1,
  // already read above) to grow their own effect for the NEXT hit — the
  // same "read the stack before this roll, grow it after" ordering
  // Momentum/Worthy Challenge use, and just as silent (no line) as those.
  if (critMult > 1) {
    if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) {
      state.combat.player.blessingOfFortuneCritStacks = Math.min(5, (state.combat.player.blessingOfFortuneCritStacks || 0) + 1);
    }
    if (state.combat.player.avatarOfChaosTurns > 0) {
      const stat = ["Atk", "Def", "Magic", "Knowledge"][Math.floor(Math.random() * 4)];
      const field = "avatarOfChaos" + stat + "Bonus";
      state.combat.player[field] = Math.min(30, (state.combat.player[field] || 0) + 10);
    }
  }
  // Avatar of War (Regalia of the Crimson Vanguard 6pc): for its 4-round
  // window, all damage dealt heals 10% — silent like Soul Leech/Avatar of
  // Passing above.
  if (state.combat && state.combat.player.avatarOfWarTurns > 0) {
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
  if (state.combat && state.combat.player.avatarOfPassingTurns > 0) {
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
  if (state.combat) activeEnemySlot(state.combat).hitsTakenFromPlayer = (activeEnemySlot(state.combat).hitsTakenFromPlayer || 0) + 1;
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

// Step 1f-iii §4: "on-hit-taken triggers... become reactions with those
// triggers." Already satisfied by this function's own shape, unchanged
// here: it never names a specific ability, only ever dispatches by its
// declared trigger === "onHitTaken" plus its own declared fields
// (reflectPctOfAtk, inflictStatusOnAttacker, counterChance/counterPctOfAtk)
// read generically off each entry in creature.passives.
function applyEnemyOnHitTakenPassives(state, creature, dmgDealt) {
  if (dmgDealt <= 0) return;
  for (const id of creature.passives) {
    const ability = getEnemyAbility(id);
    if (!ability || ability.trigger !== "onHitTaken") continue;
    if (ability.reflectPctOfAtk) {
      const reflect = Math.max(0, Math.round((creature.atk || 0) * ability.reflectPctOfAtk));
      // v0.11: routed through applyPlayerDamage (Temporary Health, NaN
      // guard, on-damage-taken stacks) instead of writing state.health
      // directly. Still silent — no message channel here.
      if (reflect > 0) {
        applyPlayerDamage(state, reflect);
        // Injury System v0.2: no element info reaches this silent reflect
        // — default to "physical" (judgment call per the implementation
        // notes, consistent with every other no-element-available hit in
        // this file, e.g. riposteCounterOnPlayer below).
        if (state.combat) state.combat.player.playerLastHitType = "physical";
      }
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
      if (counter > 0) {
        applyPlayerDamage(state, counter); // v0.11: see reflect above
        if (state.combat) state.combat.player.playerLastHitType = "physical"; // Injury System v0.2: see reflect above
      }
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
  if (state.combat.player.firstPhysicalAttackDone) return dmg;
  state.combat.player.firstPhysicalAttackDone = true;
  if (!hasEffect(state, "opening_reach")) return dmg;
  const mult = hasSetTier(state, "Norrvael", 6) ? 1.3 : 1.15;
  return Math.round(dmg * mult);
}

// Generalized Opening Reach, for an enemy or ally attacker: the same
// "first ordinary physical attack this fight deals 1.15x" rule as
// applyOpeningReach above, tracked per-combatant instead of on the
// player's own state.combat flag. Only ever called from a plain
// basic-attack branch (never an Active cast), mirroring applyOpeningReach's
// own scope exactly — no Norrvael 6pc widening, that's a player-only set.
function applyOpeningReachForActor(actor, dmg) {
  if (actor.firstPhysicalAttackDone) return dmg;
  actor.firstPhysicalAttackDone = true;
  if (!hasEffect(actor, "opening_reach")) return dmg;
  return Math.round(dmg * 1.15);
}

// Deep Cut (Bleed) and Hamstring both roll off any successful physical
// hit — shared by playerAttack, Decoy, Ambush, and Disarm's normal-hit
// component (not elemental abilities, which aren't physical attacks).
// deepCutChance (data/sets.js) resolves Bonecaller's higher proc chance.
function applyPhysicalOnHitEffects(state, creature) {
  const lines = [];
  const combat = state.combat;
  if (hasEffect(state, "deep_cut") && Math.random() < deepCutChance(state)) {
    activeEnemySlot(combat).bleed = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.atk / 6)) };
    lines.push(`${withThe(creature.name, true)} is left bleeding.`);
  }
  if (hasEffect(state, "hamstring") && !activeEnemySlot(combat).hamstringApplied) {
    activeEnemySlot(combat).hamstringApplied = true;
    activeEnemySlot(combat).enemyAtkPenalty = (activeEnemySlot(combat).enemyAtkPenalty || 0) + 1;
    lines.push(`Your strike catches the tendon — ${withThe(creature.name, false)}'s attacks are weaker for the rest of this fight.`);
  }
  lines.push(...checkCounteringGuard(state, creature));
  lines.push(...checkEnemyLowHealthTriggers(state, creature));
  return lines;
}

// H06 Countering Guard (Security and Enforcement/Sahrimor Military
// codices, Gate 5B.8): "an explicit out-of-turn reaction dealing 40%
// Attack damage. Maximum once per round; cannot trigger recursively."
// Checked at the same chokepoint as checkEnemyLowHealthTriggers, right
// after the player's own hit against the active creature lands and it
// survives — a genuine extra action outside the creature's normal
// initiative slot (the other deliberate exception to "every combatant
// acts exactly once a round," alongside flurry's guaranteed extra swing;
// flurry is keyed off Speed, this is keyed off being hit). Reuses
// resolveEnemyAttackOnPlayer for the actual attack roll/damage/mitigation —
// the same Accuracy-vs-Agility check, Guardian Spirit/evasion/Timeless
// Guard interactions, and "uses <name> on you" flavor line any other
// named attack already gets — passing a minimal synthetic abilityCtx
// shaped just like resolveEnemyActiveAbility's own return value.
// counterGuardUsedThisRound (reset in resolveSpeedInitiative alongside
// actedEarlyThisRound) caps this at once per creature per round; "cannot
// trigger recursively" holds by construction, since this counter-attack
// is resolved directly here, never routed back through the player's own
// on-hit pipeline that could re-enter this same check.
function checkCounteringGuard(state, creature) {
  const combat = state.combat;
  const enemy = combat.enemies[combat.activeIndex];
  if (!enemy || !enemy.alive || enemy.hp <= 0 || enemy.counterGuardUsedThisRound) return [];
  const passive = (creature.passives || []).map(getEnemyAbility).find((p) => p && p.trigger === "counterOnHit");
  if (!passive) return [];
  enemy.counterGuardUsedThisRound = true;
  const result = resolveEnemyAttackOnPlayer(state, creature, 2, 0, { name: passive.name, dmgMult: passive.dmgMult });
  return [`${withThe(creature.name, true)} reacts with a counter —`, ...result.lines];
}

// Enemy-side counterpart to the player's own lowHealthTriggerChecks — runs
// right after a hit against the active creature lands and it survives,
// checking its own "survivedBelowPct" passives (Veteran Discipline/
// Resolute Command/Last Stand, Gate 5B.8 skills codex) against its current
// Health fraction. Distinct from tickEnemyPassives' round-tick
// "healthBelowPct" trigger (checked once at the top of the NEXT round, and
// a PERMANENT buff via applyPermanentSelfBuff) — this fires immediately,
// the same round the hit landed, and grants an ordinary timed selfBuff/
// packAuraBuff that expires and reverses like any other. Called from
// applyPhysicalOnHitEffects (playerAttack/Decoy/Ambush/Disarm) and
// directly from useElementAbility, after its damage switch — the only two
// places a hit against the active creature can land.
// Step 1f-iii §4: "low-health... triggers... become reactions with those
// triggers." Already satisfied by this function's own shape, unchanged
// here: it never names a specific passive, only ever dispatches by its
// declared trigger === "survivedBelowPct" plus its own declared fields
// (pct, oncePerCombat, selfBuff, packAuraBuff) read generically off each
// entry in creature.passives — the same shape lowHealthTriggerChecks
// (combat.js, LOW_HEALTH_REACTIONS table) now also uses on the player side.
function checkEnemyLowHealthTriggers(state, creature) {
  const combat = state.combat;
  const enemy = combat.enemies[combat.activeIndex];
  if (!enemy || !enemy.alive || enemy.hp <= 0) return [];
  const lines = [];
  for (const pid of creature.passives || []) {
    const p = getEnemyAbility(pid);
    if (!p || p.trigger !== "survivedBelowPct") continue;
    if (p.oncePerCombat && enemy.passiveOnceFlags[pid]) continue;
    if (enemy.hp > enemy.maxHp * p.pct) continue;
    if (p.oncePerCombat) enemy.passiveOnceFlags[pid] = true;
    if (p.selfBuff) applyEnemySelfModifier(combat, creature, p.selfBuff);
    if (p.packAuraBuff) applyPackAuraBuff(combat, creature, p.packAuraBuff);
    lines.push(`${withThe(creature.name, true)} grits through the pain — ${p.name} takes hold.`);
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
  combat.player.actionCounter += 1;
  if (!hasSetTier(state, "Heartwood", 6) || combat.player.actionCounter % 3 !== 0) return [];
  const heal = Math.ceil(state.maxHealth * 0.02);
  if (heal <= 0) return [];
  const { healed, lines } = applyHeal(state, heal);
  return [`Heartwood Vitality mends you for ${healed} health.`, ...lines];
}

// Speed (state.speed, data/races.js/classes.js/bestiary.js/enemymages.js
// `spd`; an ally's own `speed` field — engine/state.js's recalcAllyStats):
// how quickly a combatant acts in combat. Every alive combatant — the
// player, every alive ally, every alive non-friendly enemy — gets exactly
// one slot in a single round-wide order, fastest first; ties favor the
// player/allies over enemies (the same default this engine has always
// used, back when it only ever compared the player to one enemy).
//
// `actsFirst` outranks Speed entirely when set, breaking ties among
// several actsFirst entries by Speed same as normal — a generic hook
// (creature.actsFirst for an enemy, ally.actsFirst for an ally) that
// nothing currently grants, ready for a future passive/effect to flip.
// Unhurried Step (Divine Regalia — Sandals of the Unbroken Path) grants
// the PLAYER this same actsFirst status unconditionally — "Enemy Haste,
// Speed, or Turn-order manipulation has no effect on you."
function effectiveAllySpeed(ally) {
  // allyStatusStatTotal/allyStatusStatPctTotal: Slowed/Stagger/Pinned/...
  // lowering this ally's own Speed, same flat-then-pct shape
  // effectivePlayerSpeedForInitiative already uses for the player.
  const base = (ally.speed || 0) + allyBuffStatTotal(ally, "spd") + allyStatusStatTotal(ally, "spd");
  return Math.max(0, Math.round(base * (1 + allyStatusStatPctTotal(ally, "spdPct"))));
}
function buildInitiativeOrder(state) {
  const combat = state.combat;
  const entries = [];
  for (const ally of aliveAllies(state)) {
    entries.push({ kind: "ally", ref: ally, group: 0, speed: effectiveAllySpeed(ally), actsFirst: !!ally.actsFirst });
  }
  entries.push({ kind: "player", group: 0, speed: effectivePlayerSpeedForInitiative(state), actsFirst: hasEffect(state, "unhurried_step") });
  combat.enemies.forEach((e, i) => {
    if (!e.alive || !e.creatureObj || e.creatureObj.friendly) return;
    entries.push({ kind: "enemy", ref: e, index: i, group: 1, speed: e.creatureObj.spd || 0, actsFirst: !!e.creatureObj.actsFirst });
  });
  entries.sort((a, b) => {
    if (a.actsFirst !== b.actsFirst) return a.actsFirst ? -1 : 1;
    if (b.speed !== a.speed) return b.speed - a.speed;
    return a.group - b.group;
  });
  return entries;
}

// Resolves this round's turn order for whoever's initiative slot
// (buildInitiativeOrder, above) comes BEFORE the player's own — anyone,
// ally or enemy, fast enough to act before the player's chosen action
// gets a chance to resolve. Called once at the very top of every player
// action function, immediately after beginTurn(). Its counterpart,
// resolveRemainingInitiativeActions (below), resolves everyone whose slot
// comes after — together the two cover the whole round exactly once per
// combatant (a `flurry` creature's own deliberate extra swing aside — see
// resolveEnemyActionWithFlurry).
//
// Reuses resolveEnemyAttackOnPlayer for the actual damage/mitigation math
// (defined further below, but plain function declarations are hoisted) —
// using its default spread and no bonus Defense, since none of the
// action-specific defensive bonuses (Brace, Guarded Strike, ...) exist yet
// at this point in the round. That also means every "the enemy's first
// attack this fight" gate (Guardian Spirit, Guided Footsteps, Timeless
// Guard, Reinforced, ...) applies here exactly as it would to a later hit,
// since an early strike genuinely can be that first attack.
//
// combat.enemyActedFirstThisRound is left set for the rest of this action
// to read — Stone's Patience (Divine Regalia — Foundation's Hammer) keys
// directly off it in rollPlayerDamage.
// creature (the caller's captured active target) is only used as the
// legacy single-enemy early-return guard below — the real work walks the
// whole initiative order, so a pack of 3 faster wolves each get their own
// early strike, fastest first, not just the active one.
function resolveSpeedInitiative(state, creature) {
  const combat = state.combat;
  combat.enemyActedFirstThisRound = false;
  combat.enemies.forEach((e) => { e.actedEarlyThisRound = false; e.counterGuardUsedThisRound = false; e.creatureObj.riposteUsedThisRound = false; });
  aliveAllies(state).forEach((a) => { a.actedEarlyThisRound = false; a.riposteUsedThisRound = false; });
  if (!creature || creature.friendly) return [];
  const lines = [];
  const order = buildInitiativeOrder(state);
  const playerPos = order.findIndex((entry) => entry.kind === "player");
  for (let pos = 0; pos < playerPos; pos++) {
    // combatOngoing: an early strike from an earlier entry in this same
    // loop can be lethal, triggering the dungeon rescue (which heals the
    // player back up and ends combat outright) or a kill that empties the
    // enemy roster — without this check, the loop would keep handing out
    // free actions a resolved fight can't answer. A player knocked down
    // (not dead — see resolvePlayerDefeatOrDowned) doesn't stop the loop;
    // their allies and the enemy keep right on going without them.
    if (!combatOngoing(state)) break;
    const entry = order[pos];
    if (entry.kind === "ally") {
      if (!entry.ref.alive) continue;
      entry.ref.actedEarlyThisRound = true;
      lines.push(...resolveOneAllyAction(state, entry.ref));
      continue;
    }
    const e = combat.enemies[entry.index];
    if (!e.alive) continue;
    combat.enemyActedFirstThisRound = true;
    e.actedEarlyThisRound = true;
    const prevActive = combat.activeIndex;
    combat.activeIndex = entry.index;
    const result = resolveEnemyActionWithFlurry(state, e.creatureObj, 2, 0);
    combat.activeIndex = prevActive;
    lines.push(`${withThe(e.creatureObj.name, true)} is faster than you and acts first this round!`, ...result.lines);
  }
  return lines;
}

// One ally's single action for the round — the same stance/kit dispatch
// that used to run for the whole party as a block (the old
// resolveAllyActions) — factored out so each ally takes their own slot in
// the Speed-ordered round instead of every ally always acting together,
// unconditional of Speed, before anyone else.
// Injury System v0.2 §3: an ally rallies the player — spends the item,
// gets the player up at ceil(injured maxHealth * effect.pct) (the
// spec's own default, 0.25), and clears playerDowned. The rally item is
// consumed from state.inventory (the PLAYER's own pack, shared loot —
// not the ally's own equipment), since v1 ships no ally-held item slot
// for this. `state.maxHealth` is already the fatigue/injury-adjusted
// value here (recomputeStats applies both in the same step, well before
// combat), so this needs no separate injury lookup of its own.
function applyRallyItemOnPlayer(state, ally, item) {
  const idx = state.inventory.indexOf(item);
  if (idx >= 0) state.inventory.splice(idx, 1);
  const def = getItemDef(item);
  const pct = (def && def.useEffect && def.useEffect.pct) || 0.25;
  state.playerDowned = false;
  state.health = Math.max(1, Math.ceil(state.maxHealth * pct));
  return [`${ally.name} breaks off to kneel at your side, breaking ${item} under your nose — the world snaps back into focus and you're back on your feet at ${state.health} Health.`];
}

function resolveOneAllyAction(state, ally) {
  // Injury System v0.2 §3: once the player is downed, the FIRST ally to
  // act each round checks the PLAYER's own inventory (not the ally's)
  // for a rally item (useEffect.type "rallyFromDowned" — v1 ships
  // exactly one, the spec's own placeholder "smelling salts") and spends
  // their WHOLE action on it instead of their normal turn. Checked before
  // the Companion Ability Engine dispatch below, so it preempts even a
  // kit-bearing ally's (Hadrian's) own turn. Because this function runs
  // once per living ally per round, in initiative order, whichever
  // ally's call clears state.playerDowned first makes every LATER ally
  // this same round simply fall through to its own normal action below
  // — "the first ally to act" falls out for free, no extra bookkeeping.
  // No rally item in the player's pack: allies fight on as normal (D10 —
  // nothing brings a downed player back without one).
  if (state.playerDowned) {
    const rallyItem = state.inventory.find((i) => {
      const d = getItemDef(i);
      return d && d.useEffect && d.useEffect.type === "rallyFromDowned";
    });
    if (rallyItem) return applyRallyItemOnPlayer(state, ally, rallyItem);
  }
  // Companion Ability Engine (engine/companion.js): an ally whose
  // ALLY_DEFS entry carries an abilityKit (Hadrian) runs its own real
  // kit instead of the generic 3-stance dispatch below — everyone else
  // (Kessa) is entirely unaffected.
  const def = ALLY_DEFS[ally.defId];
  if (def && def.abilityKit) return resolveCompanionAction(state, ally);
  if (ally.stance === "defensive") return allyDefensiveAction(state, ally);
  if (ally.stance === "support") return allySupportAction(state, ally);
  return allyAggressiveAction(state, ally);
}

// Shared by both resolveSpeedInitiative and
// resolveRemainingInitiativeActions: one enemy's whole action for the
// round — try an Active ability first
// (Enemy Ability Engine), and if it's an AoE one, resolve it against the
// player AND every alive ally instead of the usual single pickEnemyAttackTarget
// roll (an AoE active always hits the whole party, not a coin-flip subset
// of it). Otherwise falls straight through to the existing single-target
// player-or-ally roll, exactly as before this engine existed.
function resolveEnemyAction(state, creatureObj, atkSpread, extraDef) {
  // Dregnar Ashvein (World Boss, Step 4 Stage A): a bespoke, stateful
  // turn — two states, a conditional bonus action, a telegraphed two-phase
  // ability — nothing the shared random-eligible-pick system below
  // (resolveEnemyActiveAbility) can express. Dispatched here, first, so
  // the other 40+ creatures' shared path is completely untouched.
  if (creatureObj.bossKit === "dregnar_ashvein") return resolveDregnarAction(state, creatureObj, atkSpread, extraDef);
  // Stun, listed change D1 (Tyler, 9 Nov): consumed per ACTION SLOT,
  // before an ability/summon/target is ever chosen — a stunned enemy's
  // whole action is skipped, whatever it would have attacked. This used
  // to be checked only deep inside the player-targeted branch of pipeline
  // chooseAction (js/engine/pipeline.js), so a stunned enemy that happened
  // to roll an ally as its target, or that used an active ability or a
  // summon, acted anyway and kept the charge until it eventually targeted
  // the player. Moved up here, mirroring resolveDregnarAction's own
  // per-action-slot stun check exactly (see that function's comments,
  // ~line 2572) — Dregnar's bespoke resolver already did this correctly
  // and is untouched. Looked up by creatureObj rather than
  // combat.activeIndex for the same reason findEnemyCombatant is
  // (combatant.js): whoever happens to be "active" isn't guaranteed to be
  // the one acting (matches the existing applyEnemySelfModifier
  // convention). resolveEnemyActionWithFlurry calls this function twice
  // for a Flurry creature's second action, so each action slot re-checks
  // and consumes its own charge independently, same as Dregnar's normal
  // vs. bonus action.
  // damage: 0, not null, deliberately -- matches exactly what this same
  // skip returned before D1 for the player-targeted case (chooseAction
  // returning null used to bubble up to the pipeline orchestrator's own
  // `{damage: 0}` fallback). That 0 is load-bearing several call sites up
  // (resolveRemainingInitiativeActions -> its own callers' own
  // `retaliation.damage === 0` checks gate applyDodgeBlockNegateBonuses/
  // maybeRiposte): a stun-skip has always counted as "no damage landed"
  // for granting the player's own dodge/Riposte bonuses, same as a flat
  // miss. Deliberately NOT matching Dregnar's own stunned-skip, which
  // already returns damage: null and therefore does NOT grant those same
  // bonuses -- a pre-existing Dregnar/ordinary-enemy inconsistency this
  // fix doesn't touch either way (out of scope for D1; flagged in the
  // asymmetry register as its own row).
  const stunSlot = state.combat.enemies.find((slot) => slot.creatureObj === creatureObj);
  if (stunSlot && (stunSlot.enemyStunCharges || 0) > 0) {
    stunSlot.enemyStunCharges -= 1;
    return { lines: [`${withThe(creatureObj.name, true)} is still reeling and doesn't attack.`], damage: 0 };
  }
  const abilityCtx = resolveEnemyActiveAbility(state, creatureObj);
  // packAuraBuff/selfBuff/selfDebuff/healSelfPct (Guarded Stance, Committed
  // Assault, Heavy Commitment, Focused Rally, Defensive Command, Resolute
  // Command, Adaptive Orders, Breakthrough Order, ...): the cost or
  // side-effect of USING the ability — "wearer suffers -5 Defense,"
  // "grant allies +5 Accuracy" — not an on-hit consequence of whichever
  // target the roll below happens to land on (or miss). Resolved once
  // here, unconditionally, before any hit/miss or player-vs-ally
  // branching. Applying them deeper in the single-target paths instead
  // (as all four used to) silently dropped them on a miss, and never
  // applied them at all when pickEnemyAttackTarget rolled an ally
  // (resolveEnemyAttackOnAlly has no hook for any of these). inflict and
  // healOnHitPct stay genuinely on-hit, resolved further down.
  if (abilityCtx) {
    if (abilityCtx.packAuraBuff) applyPackAuraBuff(state.combat, creatureObj, abilityCtx.packAuraBuff);
    if (abilityCtx.selfDebuff) applyEnemySelfModifier(state.combat, creatureObj, abilityCtx.selfDebuff);
    if (abilityCtx.selfBuff) applyEnemySelfModifier(state.combat, creatureObj, abilityCtx.selfBuff);
    if (abilityCtx.healSelfPct) {
      const heal = Math.round(activeEnemySlot(state.combat).maxHp * abilityCtx.healSelfPct);
      if (heal > 0) applyHealing(makeEnemyCombatant(state, state.combat.enemies[state.combat.activeIndex], state.combat.activeIndex), heal, "enemy_self_heal", { state });
    }
    // Prepare Ballista (Ingenum Ballistarius, Sanguivorum Imperial
    // Military): banks the prepared state on the enemy RECORD (this
    // function already has it at hand via combat.activeIndex), consumed
    // by Ballista Discharge/Scattershot's own requiresPreparedState gate
    // above, ticked down in tickEnemyPassives.
    if (abilityCtx.grantsPreparedState) {
      const enemySlot = state.combat.enemies[state.combat.activeIndex];
      enemySlot.ballistaPreparedTurnsLeft = abilityCtx.grantsPreparedState.turns || 2;
    }
    // Calculated Preparation (Ingenum Field Engineer, Sanguivorum Imperial
    // Military): banks a flat ACC bonus for the wearer's own next damaging
    // attack attempt (resolveEnemyAttackOnPlayer/resolveEnemyAttackOnAlly
    // consume it), unlike grantsPreparedState above this lives on the
    // creature object itself (same convention as sureFoundationBonusDef).
    if (abilityCtx.banksNextAttackAccBonus) {
      creatureObj.bankedAttackAccBonus = abilityCtx.banksNextAttackAccBonus.amount;
      creatureObj.bankedAttackAccBonusTurnsLeft = abilityCtx.banksNextAttackAccBonus.turns;
      // Silent Preparation (Veiled Executor, Sanguivorum Independent Armed
      // Groups): banksNextAttackAccBonus's new optional dmgMultBonus field
      // — carried on the SAME banked charge as the ACC bonus above (not a
      // separate turns-countdown or consumption hook), so both the ACC
      // bump and the damage bump land on the same next attack and expire
      // together. 0 (not undefined) when the ability carries no damage
      // component (Take Aim), so this field always reads as a safe no-op.
      creatureObj.bankedAttackDmgMultBonus = abilityCtx.banksNextAttackAccBonus.dmgMultBonus || 0;
    }
  }
  // Brace, generalized: the player's own version fires on a specific
  // no-damage Tactic/spell (Feint, Stoneskin, the Earth no-damage cast —
  // see resolveFeint/useApothecaryAbility/useElementAbility); an enemy has
  // no equivalent named action, so the closest honest analog is "this
  // creature's own chosen action this round deals no damage at all" — a
  // pure summon, or any dmgMult: 0 active (Protective Cover/Focused Rally/
  // Defensive Command — Guarded Stance etc. still roll an attack, just at
  // reduced power, so they don't qualify). Banked once, consumed by
  // whichever hit lands on this creature next (rollPlayerDamage,
  // resolveEnemyAttackOnAlly's target — wait, this creature IS the
  // attacker there — so really: rollPlayerDamage and allyAggressiveAction,
  // the two places something else's damage against THIS creature is
  // computed) — not scoped to "the very next action" the way the player's
  // own compound retaliation call is, since enemies have no symmetric
  // compound structure to hook into; an honest, slightly looser version of
  // the same idea.
  if (abilityCtx && (abilityCtx.summon || abilityCtx.dmgMult === 0) && hasEffect(creatureObj, "brace")) {
    creatureObj.braceBonusDef = 3;
  }
  // Summons (Burrow Call, Nest Call, Brood Call, Grave Bloom) are a pure
  // support action — nothing is attacked, so this returns before ever
  // reaching the aoe/single-target damage paths below.
  if (abilityCtx && abilityCtx.summon) {
    const lines = resolveEnemySummon(state, creatureObj.level, abilityCtx.summon, abilityCtx.id, creatureObj.name, creatureObj);
    return { lines, damage: null };
  }
  if (abilityCtx && abilityCtx.aoe) {
    const lines = [];
    const playerResult = resolveEnemyAttackOnPlayer(state, creatureObj, atkSpread, extraDef, abilityCtx);
    lines.push(...playerResult.lines);
    // H16 Calculated Volley ("no more than 3 distinct targets"): the
    // player always counts as the first target, so aoeMaxTargets - 1 is
    // how many allies still get struck. Abilities with no aoeMaxTargets
    // (every other aoe active — Earthshaker, Ground Slam, Bone Storm,
    // ...) keep hitting every alive ally, unchanged.
    const allies = aliveAllies(state);
    const aoeAllies = abilityCtx.aoeMaxTargets != null ? allies.slice(0, Math.max(0, abilityCtx.aoeMaxTargets - 1)) : allies;
    for (const ally of aoeAllies) {
      if (!state.combat) break;
      const allyResult = resolveEnemyAttackOnAlly(state, creatureObj, ally, abilityCtx);
      lines.push(...allyResult.lines);
    }
    return { lines, damage: playerResult.damage };
  }
  // H08 Prepared Opening et al: an active cast already folded its
  // firstAttack bonus into abilityCtx (resolveEnemyActiveAbility); a plain
  // basic attack (abilityCtx null) never ran that check at all, so it's
  // applied here instead — exactly once per action either way, since
  // firstAttackPassiveBonus always consumes the flag when called.
  const basicFirstBonus = abilityCtx ? null : firstAttackPassiveBonus(state, creatureObj);
  return resolveEnemySingleTargetAttempt(state, creatureObj, atkSpread, extraDef, abilityCtx, basicFirstBonus);
}

// Step 1g-i: the single shared "roll a target, then dispatch to whichever
// per-target-kind pipeline orchestrator applies" step every single-target
// enemy damaging attempt goes through pipeline chooseTargets — extracted so
// Dregnar's own damaging attempts (dregnarResolveDamagingAttempt) and the
// ordinary case above call the exact same function instead of each keeping
// its own private copy of the pickEnemyAttackTarget + dispatch logic.
// resolveEnemyAttackOnPlayer/resolveEnemyAttackOnAlly (pipeline.js) each
// call chooseTargets internally once ctx.target is set, so routing every
// caller through here is routing every caller through that one shared step.
function resolveEnemySingleTargetAttempt(state, creatureObj, atkSpread, extraDef, abilityCtx, basicFirstBonus) {
  const target = pickEnemyAttackTarget(state);
  return target.kind === "ally"
    ? resolveEnemyAttackOnAlly(state, creatureObj, target.ally, abilityCtx, basicFirstBonus)
    : resolveEnemyAttackOnPlayer(state, creatureObj, atkSpread, extraDef, abilityCtx, basicFirstBonus);
}

// Wraps resolveEnemyAction with the BESTIARY `flurry` flag (a handful of
// fast, dangerous, rare/unique monsters — Thunderbird, Drake, Dragon,
// Banshee, +4 others): a genuine second action, back-to-back, wherever
// this creature's own initiative slot falls — the one deliberate
// exception the initiative system allows to "every combatant acts exactly
// once a round." Unlike the old pre-emptive-strike/retaliation split, this
// no longer depends on which phase of the round the creature landed in —
// it always gets its extra swing immediately after its first one.
function resolveEnemyActionWithFlurry(state, creatureObj, atkSpread, extraDef) {
  const first = resolveEnemyAction(state, creatureObj, atkSpread, extraDef);
  if (!creatureObj.flurry || !combatOngoing(state)) return first;
  const second = resolveEnemyAction(state, creatureObj, atkSpread, extraDef);
  return {
    lines: [...first.lines, `${withThe(creatureObj.name, true)} is fast enough to strike again!`, ...second.lines],
    damage: second.damage,
  };
}

// ---- Dregnar Ashvein (World Boss, Step 4 Stage A) ----
// Bespoke state machine, dispatched from resolveEnemyAction above instead
// of going through the shared actives/passives arrays (he carries neither).
// All per-fight state lives on the enemy SLOT (e = combat.enemies[...]),
// lazily initialized below, same convention as braceBonusDef/
// riposteUsedThisRound elsewhere in this file — never added to the giant
// enemies-array literal in startCombat since it's unique to one creature.
//
// Water Guard: 1 normal action/turn, 2-turn cadence. Ashquench Unbound: 1
// normal + 1 genuine bonus action/turn, same 2-turn cadence, extended to a
// 3rd (hard cap, never a 4th) only to let a pending Ashquench Judgment
// resolve before the state flips back.
const DRA_WATER_GUARD_PRIORITY = ["dra_barrier", "dra_hammerfall", "dra_frostbite_brand"];
const DRA_UNBOUND_NORMAL_PRIORITY = ["dra_judgment", "dra_cleave", "dra_hammerfall", "dra_frostbite_brand"];
const DRA_UNBOUND_BONUS_PRIORITY = ["dra_cleave", "dra_hammerfall", "dra_frostbite_brand"]; // Judgment never resolves/winds up from the bonus slot

function dregnarAbilityEligible(e, id) {
  if (((e.abilityCooldowns || {})[id] || 0) > 0) return false;
  if (id === "dra_judgment" && e.draJudgmentPending) return false; // can't stack a second wind-up
  return true;
}

// One damaging attempt (active or basic) against the player — brackets
// DRA-P03's temporary +3 Attack (if charges remain) around the real
// resolveEnemyAttackOnPlayer call, and applies/consumes the DRA-P01/P02
// shared pending-Accuracy bonus. Barrier never reaches here (see
// resolveDregnarAction's own branch for it) since it isn't a damaging
// attempt at all.
function dregnarResolveDamagingAttempt(state, e, creatureObj, abilityCtx, atkSpread, extraDef) {
  const accBonus = e.draPendingAcc || 0;
  e.draPendingAcc = 0;
  e.draPendingAccTurnsLeft = 0;
  let p03Active = false;
  if ((e.draP03Charges || 0) > 0) {
    creatureObj.atk += 3;
    p03Active = true;
    e.draP03Charges -= 1;
  }
  // First Sword's Legacy (First Sword's Regalia 10pc, exclusive): a
  // SEPARATE +3 Attack source from DRA-P03 above, stored on the wearer
  // (creatureObj, matching every other item/set-effect field) rather than
  // the slot (e, matching every other intrinsic-passive field) — the two
  // are deliberately independent and meant to stack additively (owner
  // decision: up to +6 total when both are simultaneously active).
  let legacyActive = false;
  if ((creatureObj.legacyCharges || 0) > 0) {
    creatureObj.atk += 3;
    legacyActive = true;
    creatureObj.legacyCharges -= 1;
  }
  // Black-Ice Reserve (DRA-E09): captured BEFORE the call below, not
  // after — this attempt's own resolveEnemyAttackOnPlayer call can ITSELF
  // freshly grant a pending charge (via a successful Chilled application,
  // handled inside that function), and consuming unconditionally after
  // the call would immediately wipe out that same fresh grant before any
  // LATER attempt ever got to use it. Only a charge that was already
  // pending BEFORE this attempt started gets consumed here — "on the
  // attempt, even a miss" per its own rule, enforced here since
  // resolveEnemyAttackOnPlayer only ever peeks/applies the damage multiplier
  // when the attack actually landed.
  const hadBlackIceReservePending = !!creatureObj.blackIceReservePending;
  const ctx = abilityCtx ? { ...abilityCtx, accBonus: (abilityCtx.accBonus || 0) + accBonus } : null;
  const basicFirstBonus = abilityCtx ? null : { accBonus, dmgMultBonus: 1 };
  // Phase 0 hotfix: Dregnar used to call resolveEnemyAttackOnPlayer (the
  // player-only damage path) unconditionally, so he could never damage an
  // ally and kept hitting an already-downed player. Step 1g-i: now calls
  // the exact same shared resolveEnemySingleTargetAttempt every other
  // creature's single-target damaging attempt goes through, rather than
  // keeping its own private copy of the pick-target-and-dispatch logic.
  const result = resolveEnemySingleTargetAttempt(state, creatureObj, atkSpread, extraDef, ctx, basicFirstBonus);
  if (p03Active) creatureObj.atk -= 3;
  if (legacyActive) creatureObj.atk -= 3;
  if (hadBlackIceReservePending) {
    creatureObj.blackIceReservePending = false;
    creatureObj.blackIceReserveTurnsLeft = 0;
  }
  // DRA-P02 Martial Precision: a landed plain basic attack (not an active)
  // banks the same +5 Accuracy Guarded Concentration grants for Barrier —
  // the two never stack, so this simply (re)sets the one shared slot.
  if (!abilityCtx && result.damage > 0) {
    e.draPendingAcc = 5;
    e.draPendingAccTurnsLeft = 2;
  }
  return result;
}

// Resolves one named active by id — Barrier is a pure self-buff branch
// (never calls resolveEnemyAttackOnPlayer at all, so it can't be a "damaging
// attempt" for P03's purposes); every other active is a real attack.
function resolveDregnarAttempt(state, e, creatureObj, abilityId, atkSpread, extraDef) {
  const ability = getEnemyAbility(abilityId);
  e.abilityCooldowns[abilityId] = ability.cooldown;
  if (abilityId === "dra_barrier") {
    applyEnemySelfModifier(state.combat, creatureObj, { dmgReduction: 0.25, turns: 1 });
    // DRA-P01 Guarded Concentration: casting Barrier always "succeeds" (no
    // roll) and immediately banks +5 Accuracy for Dregnar's next attempt.
    e.draPendingAcc = 5;
    e.draPendingAccTurnsLeft = 2;
    // Flowing Discipline (First Sword's Regalia 6pc, exclusive): Barrier
    // is Dregnar's only "no-damage defensive action" in Stage A, so this
    // is the one real trigger — kept generic (hasSetTier on the wearer,
    // not hardcoded to Dregnar) so a future defensive-action source on
    // another wearer would grant it the same way.
    if (hasSetTier(creatureObj, "First Sword's Regalia", 6)) {
      creatureObj.flowingDisciplinePending = true;
      creatureObj.flowingDisciplineTurnsLeft = 2;
    }
    return { lines: [`${withThe(creatureObj.name, true)} raises a shifting water barrier, turning aside the next blow aimed at it.`], damage: null };
  }
  const abilityCtx = { id: abilityId, name: ability.name, dmgMult: ability.dmgMult, inflict: ability.inflict };
  return dregnarResolveDamagingAttempt(state, e, creatureObj, abilityCtx, atkSpread, extraDef);
}

function resolveDregnarAction(state, creatureObj, atkSpread, extraDef) {
  const combat = state.combat;
  const e = combat.enemies[combat.activeIndex];
  if (e.draState == null) {
    e.draState = "water_guard";
    e.draStateTurns = 0;
    e.draAnnouncePending = false;
    e.draPendingAcc = 0;
    e.draPendingAccTurnsLeft = 0;
    e.draP03Used = false;
    e.draP03Charges = 0;
    e.draP03TurnsLeft = 0;
    e.draJudgmentPending = false;
  }
  const lines = [];
  // A transition decided at the END of the previous turn takes effect, and
  // is announced, at the START of this one — never retroactively affecting
  // the turn whose own end-of-turn bookkeeping decided it.
  if (e.draAnnouncePending) {
    e.draAnnouncePending = false;
    lines.push(
      e.draState === "ashquench_unbound"
        ? `${withThe(creatureObj.name, true)}'s water barrier shatters — Ashquench flares black-ice cold as it closes the distance!`
        : `${withThe(creatureObj.name, true)} falls back into a guarded stance, a shifting water barrier forming around it.`
    );
  }
  const stateThisTurn = e.draState; // captured before any transition decided THIS turn can affect it
  e.draStateTurns = (e.draStateTurns || 0) + 1;

  // DRA-P03 First Sword's Resolve: once per combat, the first time HP is
  // observed at or below 40% at the top of a normal action.
  if (!e.draP03Used && e.maxHp > 0 && e.hp / e.maxHp <= 0.4) {
    e.draP03Used = true;
    e.draP03Charges = 2;
    e.draP03TurnsLeft = 3;
    lines.push(`${withThe(creatureObj.name, true)} grits its teeth, First Sword's Resolve steadying its grip.`);
  }
  // First Sword's Legacy (First Sword's Regalia 10pc, exclusive): the
  // same ≤40% HP breakpoint as DRA-P03 above, but its own independent
  // once-per-combat gate and charge/turn fields (stored on the wearer,
  // not the slot — see dregnarResolveDamagingAttempt) so the two can be
  // simultaneously active without interfering with each other.
  if (!creatureObj.legacyUsed && e.maxHp > 0 && e.hp / e.maxHp <= 0.4 && hasSetTier(creatureObj, "First Sword's Regalia", 10)) {
    creatureObj.legacyUsed = true;
    creatureObj.legacyCharges = 2;
    creatureObj.legacyTurnsLeft = 3;
    lines.push(`First Sword's Legacy answers in kind — the Regalia itself steadies ${withThe(creatureObj.name, false)}'s grip.`);
  }

  // --- Normal action ---
  // Stun (Stage B): consumed per ACTION SLOT, not per turn — e is the
  // exact enemy slot combat.enemyStunCharges transparently proxies to
  // (combat.activeIndex doesn't change mid-turn here), so this is the
  // same counter resolveEnemyAttackOnPlayer reads. Checked BEFORE priority-
  // list selection so it also covers Barrier's self-buff branch and
  // Judgment's wind-up/resolution — neither ever calls
  // resolveEnemyAttackOnPlayer, so that shared check alone would miss them.
  // If this slot would have resolved a pending Judgment, that's an
  // explicit cancellation (the doc's own rule), not left pending.
  let normalResult;
  let normalStunned = false;
  if ((e.enemyStunCharges || 0) > 0) {
    e.enemyStunCharges -= 1;
    normalStunned = true;
    if (stateThisTurn === "ashquench_unbound" && e.draJudgmentPending) {
      lines.push(`${withThe(creatureObj.name, true)} is still reeling — the overhead strike never comes. Ashquench Judgment is denied.`);
      e.draJudgmentPending = false;
      e.abilityCooldowns.dra_judgment = getEnemyAbility("dra_judgment").cooldown;
    } else {
      lines.push(`${withThe(creatureObj.name, true)} is still reeling and doesn't act.`);
    }
  }
  if (normalStunned) {
    normalResult = { lines: [], damage: null };
  } else if (stateThisTurn === "ashquench_unbound" && e.draJudgmentPending) {
    // Resolution is checked before any priority-list selection — the very
    // next normal action after the wind-up always resolves it.
    lines.push(`Ashquench Judgment falls!`);
    normalResult = resolveDregnarAttempt(state, e, creatureObj, "dra_judgment", atkSpread, extraDef);
    e.draJudgmentPending = false;
    lines.push(...normalResult.lines);
  } else {
    const priority = stateThisTurn === "ashquench_unbound" ? DRA_UNBOUND_NORMAL_PRIORITY : DRA_WATER_GUARD_PRIORITY;
    const chosen = priority.find((id) => dregnarAbilityEligible(e, id));
    if (chosen === "dra_judgment") {
      // Wind-up: consumes the normal action, deals no damage, and does NOT
      // set its own cooldown yet — only resolution/force-cancellation does.
      e.draJudgmentPending = true;
      lines.push(`${withThe(creatureObj.name, true)} raises Ashquench overhead, black ice crawling up the haft — Ashquench Judgment, incoming!`);
      normalResult = { lines: [], damage: null };
    } else if (chosen) {
      normalResult = resolveDregnarAttempt(state, e, creatureObj, chosen, atkSpread, extraDef);
      lines.push(...normalResult.lines);
    } else {
      normalResult = dregnarResolveDamagingAttempt(state, e, creatureObj, null, atkSpread, extraDef);
      lines.push(...normalResult.lines);
    }
  }

  // Bookkeeping that ticks once per NORMAL action only (never a bonus one).
  if (e.draPendingAccTurnsLeft > 0 && --e.draPendingAccTurnsLeft <= 0) e.draPendingAcc = 0;
  if (e.draP03Charges > 0 && e.draP03TurnsLeft > 0 && --e.draP03TurnsLeft <= 0) e.draP03Charges = 0;
  if (creatureObj.legacyCharges > 0 && creatureObj.legacyTurnsLeft > 0 && --creatureObj.legacyTurnsLeft <= 0) creatureObj.legacyCharges = 0;
  if (creatureObj.flowingDisciplinePending && creatureObj.flowingDisciplineTurnsLeft > 0 && --creatureObj.flowingDisciplineTurnsLeft <= 0) creatureObj.flowingDisciplinePending = false;
  if (creatureObj.blackIceReservePending && creatureObj.blackIceReserveTurnsLeft > 0 && --creatureObj.blackIceReserveTurnsLeft <= 0) creatureObj.blackIceReservePending = false;

  let damage = normalResult.damage;

  // --- Bonus action (Ashquench Unbound only) ---
  // state.playerDowned: a downed (not dead) player doesn't stop Dregnar's
  // own two-action economy any more than it stops anyone else's turn —
  // see combatOngoing's comment.
  if (stateThisTurn === "ashquench_unbound" && state.combat && (state.health > 0 || state.playerDowned)) {
    if ((e.enemyStunCharges || 0) > 0) {
      e.enemyStunCharges -= 1;
      lines.push(`${withThe(creatureObj.name, true)} tries to move again, but the stun holds it fast.`);
    } else {
      const bonusChosen = DRA_UNBOUND_BONUS_PRIORITY.find((id) => dregnarAbilityEligible(e, id));
      const bonusResult = bonusChosen
        ? resolveDregnarAttempt(state, e, creatureObj, bonusChosen, atkSpread, extraDef)
        : dregnarResolveDamagingAttempt(state, e, creatureObj, null, atkSpread, extraDef);
      lines.push(`${withThe(creatureObj.name, true)} moves again, fast as the ice-bound water itself!`, ...bonusResult.lines);
      if (bonusResult.damage != null) damage = bonusResult.damage;
    }
  }

  // --- End-of-turn state transition ---
  if (state.combat) {
    if (e.draStateTurns >= 3) {
      // Hard cap: never a 4th turn in one state. Judgment can only still be
      // pending here if resolution was somehow skipped above, since the
      // extension to a 3rd turn below only ever happens while it's
      // pending, and the very next normal action always resolves it first
      // — kept as a direct safety net for the doc's own explicit rule.
      if (e.draJudgmentPending) {
        e.draJudgmentPending = false;
        e.abilityCooldowns.dra_judgment = getEnemyAbility("dra_judgment").cooldown;
      }
      e.draState = stateThisTurn === "water_guard" ? "ashquench_unbound" : "water_guard";
      e.draStateTurns = 0;
      e.draAnnouncePending = true;
    } else if (e.draStateTurns >= 2 && !e.draJudgmentPending) {
      e.draState = stateThisTurn === "water_guard" ? "ashquench_unbound" : "water_guard";
      e.draStateTurns = 0;
      e.draAnnouncePending = true;
    }
    // else: at the 2-turn mark with Judgment still pending, extend to a 3rd turn instead of transitioning.
  }

  return { lines, damage };
}

// Resolves this round's turn order for whoever's initiative slot comes
// AFTER the player's own chosen action has already resolved — the
// counterpart to resolveSpeedInitiative above. Anyone (ally or enemy) who
// already took their slot earlier this round (actedEarlyThisRound, set by
// resolveSpeedInitiative) is skipped here, without touching `damage` in a
// way that could be confused for a miss (damage stays null, not 0, so
// downstream "retaliation.damage === 0" dodge/riposte bonuses correctly
// don't fire off of it) — this just picks up wherever that phase left
// off, in the same Speed order, so nobody acts twice except a `flurry`
// creature's own deliberate extra swing (resolveEnemyActionWithFlurry).
//
// `damage` on the returned object specifically reflects the CALLER'S
// active target (matching the original single-enemy contract exactly), so
// riposte/dodge bonuses stay scoped to "the thing you just traded blows
// with," not the whole pack.
//
// excludeIndex silently skips one specific enemy entirely (no line, no
// damage) — Decoy/Ambush's own "this one specifically doesn't act" case,
// which already gets its own dedicated flavor line at the call site and
// isn't an early-strike situation, so it deliberately does NOT reuse
// actedEarlyThisRound's "already acted first" message.
function resolveRemainingInitiativeActions(state, creature, atkSpread, extraDef, excludeIndex) {
  const combat = state.combat;
  const callerActiveIndex = combat.activeIndex;
  const lines = [];
  let activeDamage = null;
  const order = buildInitiativeOrder(state);
  for (const entry of order) {
    // combatOngoing: the dungeon rescue, or a kill that empties the enemy
    // roster, can fire mid-loop — without this check, the next entry in
    // this same loop would still get its own action, with no rescue left
    // to answer it. A knocked-down (not dead) player doesn't stop this
    // either — see combatOngoing's own comment.
    if (!combatOngoing(state)) break;
    if (entry.kind === "player") continue;
    if (entry.kind === "ally") {
      if (!entry.ref.alive || entry.ref.actedEarlyThisRound) continue;
      lines.push(...resolveOneAllyAction(state, entry.ref));
      continue;
    }
    const i = entry.index;
    const e = combat.enemies[i];
    if (!e.alive) continue;
    if (i === excludeIndex) continue;
    const prevActive = combat.activeIndex;
    combat.activeIndex = i;
    let result;
    if (e.actedEarlyThisRound) {
      e.actedEarlyThisRound = false;
      result = { lines: [`${withThe(e.creatureObj.name, true)} already acted first this round and doesn't get a follow-up strike.`], damage: null };
    } else {
      result = resolveEnemyActionWithFlurry(state, e.creatureObj, atkSpread, extraDef);
    }
    combat.activeIndex = prevActive;
    lines.push(...result.lines);
    if (i === callerActiveIndex) activeDamage = result.damage;
  }
  return { lines, damage: activeDamage };
}

// ---- Party / Allies ----
// Allies live on state.party (engine/state.js), persistent across fights —
// combat reads/writes an ally's .health directly rather than keeping a
// separate per-fight copy, so nothing needs to be synced back whenever a
// fight ends (win, flee, or otherwise). Each alive ally gets their own
// Speed-based slot in the round's initiative order (buildInitiativeOrder,
// resolveSpeedInitiative/resolveRemainingInitiativeActions above) — not a
// group acting together regardless of Speed. Death IS a real threat here,
// in every fight, not just Boss/World Boss ones: enemies split their
// attacks between the player and any alive allies (pickEnemyAttackTarget),
// and an ally who's struck below 0 health falls permanently (killAlly) —
// there's no in-fight "downed, recovers after combat" state. Reviving them
// is deliberately not easy; see parser.js's sanctuary/pray/rite/revive
// commands.
function aliveAllies(state) {
  return (state.party || []).filter((a) => a.alive);
}

// The player still draws the plurality of enemy attention (they're the
// one actually swinging a weapon at it, after all), but allies standing
// in a fight aren't safe just for existing — the remainder is split
// evenly across however many are currently alive.
//
// v0.11d: the player's share now shrinks with party size instead of a
// flat 60% — 70% with one ally, ~47% with two, 35% with a full party of
// four (PLAYER_TARGET_SHARE_WEIGHT / party size, never below the floor).
// A flat 60% meant a full party barely protected the player, whose death
// ends the run, so ally quality hardly moved outcomes: a measured party of
// three independent mercenaries and one of three company mercenaries won
// at the same rate. Scaled this way allies genuinely take hits (and,
// with permadeath, can be lost to them), and better allies win more.
const PLAYER_TARGET_SHARE_WEIGHT = 1.4;
const PLAYER_TARGET_SHARE_FLOOR = 0.35;
function playerTargetShare(aliveAllyCount) {
  if (aliveAllyCount <= 0) return 1;
  return Math.min(1, Math.max(PLAYER_TARGET_SHARE_FLOOR, PLAYER_TARGET_SHARE_WEIGHT / (aliveAllyCount + 1)));
}
function pickEnemyAttackTarget(state) {
  // Companion Ability Engine (engine/companion.js): a taunt in effect
  // (Shielding Presence/Champion's Challenge/Last Bastion) overrides the
  // random split below entirely, for as long as it's active.
  const forcedAlly = getForcedAllyTarget(state);
  if (forcedAlly) return { kind: "ally", ally: forcedAlly };
  const allies = aliveAllies(state);
  // A downed player (state.playerDowned — resolvePlayerDefeatOrDowned) is
  // out of the fight entirely, same as a dead ally: never a valid target.
  // By construction this function is never reached with the player
  // downed AND zero allies left (killAlly ends the fight the instant the
  // last ally falls while the player is down) — but written defensively
  // regardless, falling back to the player rather than crashing if that
  // invariant is ever broken.
  if (state.playerDowned) {
    if (!allies.length) return { kind: "player" };
    const idx = Math.floor(Math.random() * allies.length);
    return { kind: "ally", ally: allies[idx] };
  }
  if (!allies.length) return { kind: "player" };
  const roll = Math.random();
  const playerShare = playerTargetShare(allies.length);
  if (roll < playerShare) return { kind: "player" };
  const perAlly = (1 - playerShare) / allies.length;
  const idx = Math.min(allies.length - 1, Math.floor((roll - playerShare) / perAlly));
  return { kind: "ally", ally: allies[idx] };
}

// H08 Prepared Opening ("First damaging attack attempt gains +10 Accuracy
// and x1.20 damage... consumed even on a miss") and the Ambush/Silent
// Hunter/Patient Hunter/Ambush Predator family: these firstAttack-trigger
// passives apply to whichever ATTACK this creature happens to make first
// each fight — a basic attack if it has no eligible active that turn, an
// active cast otherwise, per the codex's own "whether basic or active"
// wording. Extracted so both paths consume the SAME flag exactly once:
// resolveEnemyActiveAbility calls this when an active is selected;
// resolveEnemyAction calls it directly for a plain basic attack when
// resolveEnemyActiveAbility returns null. enemy.firstActiveUsed is set
// unconditionally, before any hit/miss roll happens elsewhere, so
// "consumed even on a miss" holds for both paths.
function firstAttackPassiveBonus(state, creature) {
  const enemy = state.combat.enemies[state.combat.activeIndex];
  let dmgMultBonus = 1;
  let accBonus = 0;
  if (!enemy.firstActiveUsed) {
    for (const pid of creature.passives || []) {
      const p = getEnemyAbility(pid);
      if (p && p.trigger === "firstAttack" && p.dmgMultBonus) dmgMultBonus *= p.dmgMultBonus;
      if (p && p.trigger === "firstAttack" && p.accBonus) accBonus += p.accBonus;
    }
  }
  enemy.firstActiveUsed = true;
  return { dmgMultBonus, accBonus };
}

// Enemy Ability Engine (data/enemyabilities.js): picks one off-cooldown
// Active ability from this creature's own `actives` list, puts it on
// cooldown, resolves any conditional damage-multiplier bonuses (a
// first-attack bonus if this is its first active use this fight, bonus
// damage against a status the player/target is suffering, bonus damage
// against a Health threshold), and returns a context object
// resolveEnemyAttackOnPlayer/resolveEnemyAttackOnAlly read to replace their
// usual flat attack roll — or null, meaning this creature just makes a
// normal attack this turn (no eligible ability, or it has none at all —
// every BESTIARY creature without an `actives` array behaves exactly as
// it did before this engine existed). resolveEnemyAction applies
// firstAttackPassiveBonus itself when this returns null, so a plain
// basic attack isn't left out of H08's own "whether basic or active" rule.
// Press the Advantage (Sanguivorum Criminal Underworld, IA-28): true if
// any currently-active combat.player.playerStatuses entry carries a negative
// `acc` or `spd` debuff — covers both a named status (chilled's own agi
// debuff doesn't count; this is scoped to acc/spd specifically, matching
// the codex's own wording) and an ability's inline "custom:..." inflict
// (feinting_slash's -8 Accuracy, shield_bash's -15 Speed, ...).
function playerHasAccOrSpdDebuff(state) {
  const statuses = (state.combat && state.combat.player.playerStatuses) || {};
  return Object.values(statuses).some((entry) => entry.debuff && ((entry.debuff.acc || 0) < 0 || (entry.debuff.spd || 0) < 0));
}
// Trident Combination (Ovum Prizefighter, Sanguivorum Independent Armed
// Groups): "1.5x, or 1.7x if target has reduced ACC OR ATK" — the same
// playerHasAccOrSpdDebuff shape just above, but checking acc/atk instead
// of acc/spd (its own narrower pair, per the codex's own wording).
function playerHasAccOrAtkDebuff(state) {
  const statuses = (state.combat && state.combat.player.playerStatuses) || {};
  return Object.values(statuses).some((entry) => entry.debuff && ((entry.debuff.acc || 0) < 0 || (entry.debuff.atk || 0) < 0));
}
// Opportunistic Strike (Contract Blade, Sanguivorum Independent Armed
// Groups): "1.6x, or 1.8x vs a target with ANY negative combat status" —
// broader than playerHasAccOrSpdDebuff/playerHasAccOrAtkDebuff above (not
// scoped to any particular stat pair): true iff any currently-active
// combat.player.playerStatuses entry's debuff object has ANY negative-value stat
// field at all.
function playerHasAnyNegativeStatus(state) {
  const statuses = (state.combat && state.combat.player.playerStatuses) || {};
  return Object.values(statuses).some((entry) => entry.debuff && Object.values(entry.debuff).some((v) => typeof v === "number" && v < 0));
}
// Disciplined Riposte/Measured Counteroffensive (Sanguivorum Imperial
// Military): "has an active defensive effect" = this creature's own
// enemy record carries a live (turnsLeft > 0) selfBuffs entry with
// stat === "def" — the same bookkeeping applyEnemySelfModifier (below)
// pushes an entry onto and tickEnemyPassives counts down. Finds the
// enemy record the same way applyEnemySelfModifier does.
function hasActiveDefBuff(combat, creature) {
  const enemy = combat.enemies.find((e) => e.creatureObj === creature);
  return !!(enemy && (enemy.selfBuffs || []).some((b) => b.stat === "def" && b.turnsLeft > 0));
}
function resolveEnemyActiveAbility(state, creature) {
  if (!creature.actives || !creature.actives.length) return null;
  const combat = state.combat;
  const enemy = combat.enemies[combat.activeIndex];
  const cooldowns = enemy.abilityCooldowns || (enemy.abilityCooldowns = {});
  // Final Exchange (Ovum Champion, Sanguivorum Independent Armed Groups):
  // "requires Champion's Guard used since previous Final Exchange" — a
  // new, generically-reusable eligibility gate. priorAbilityUseFlags is a
  // small, generic bookkeeping object keyed by ability id, set to true
  // below whenever ANY active is successfully selected (not specific to
  // Champion's Guard), and cleared by consumesPriorAbilityUse (below) —
  // the same lazy-init-on-the-enemy-record shape as abilityCooldowns just
  // above.
  const priorFlags = enemy.priorAbilityUseFlags || (enemy.priorAbilityUseFlags = {});
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
    // Final Directive (Arbitarius Commander, Sanguivorum Imperial
    // Military): a new eligibility gate — "only usable at wearer HP<=40%"
    // — checked here against the enemy record's own e.hp/e.maxHp, same
    // placement as onlyIfAlliesBelow just above; the creature simply never
    // picks this active above the threshold rather than picking it and
    // no-oping.
    if (a.selfHealthBelowPct != null && enemy.hp / enemy.maxHp > a.selfHealthBelowPct) return false;
    // Ballista Discharge/Scattershot (Ingenum Ballistarius, Sanguivorum
    // Imperial Military): require Prepare Ballista's own banked state
    // (enemy.ballistaPreparedTurnsLeft, set in resolveEnemyAction below,
    // ticked down in tickEnemyPassives) — the same banked-charge shape as
    // Brace/Guarded Strike/Sure Foundation elsewhere in this file,
    // generalized to a SEPARATE ability consuming a DIFFERENT ability's
    // charge instead of the same one that granted it.
    if (a.requiresPreparedState && !(enemy.ballistaPreparedTurnsLeft > 0)) return false;
    // Final Exchange's own gate — see priorFlags comment above.
    if (a.requiresPriorAbilityUse && !priorFlags[a.requiresPriorAbilityUse]) return false;
    return true;
  });
  if (!eligible.length) return null;
  const abilityId = eligible[Math.floor(Math.random() * eligible.length)];
  const ability = getEnemyAbility(abilityId);
  if (ability.oncePerCombat) enemy.passiveOnceFlags[abilityId] = true;
  // Feinting Edge/Tactical Memory, generalized: both are written against
  // the player's own named Tactics (Feint's cooldown specifically;
  // Feint/Decoy/Disarm's cooldowns generally) that an enemy has no
  // equivalent of, so the closest honest analog is this creature's own
  // Active cooldown — a proportional -1 rather than Feinting Edge's flat
  // override-to-1 (which would be a wildly bigger effect on an active with
  // a 5-7 round cooldown than Feint's own 2-round one).
  let setCooldown = ability.cooldown;
  if (setCooldown && hasEffect(creature, "feinting_edge")) setCooldown = Math.max(1, setCooldown - 1);
  if (setCooldown && !enemy.tacticalMemoryUsed && hasEffect(creature, "tactical_memory") && Math.random() < 0.2) {
    enemy.tacticalMemoryUsed = true;
    setCooldown = Math.max(1, setCooldown - 1);
  }
  cooldowns[abilityId] = setCooldown;
  // Final Exchange's own generic bookkeeping half — see priorFlags comment
  // above the eligible filter. Set for EVERY ability selected here (not
  // just Champion's Guard), so any future requiresPriorAbilityUse gate can
  // read it.
  priorFlags[abilityId] = true;
  // Ballista Discharge/Scattershot: "requires AND consumes" Prepare
  // Ballista's prepared state — consumed here, on selection, the same
  // instant-on-activation timing Duelist's Measure's own pending-target
  // field is cleared at.
  if (ability.consumesPreparedState) enemy.ballistaPreparedTurnsLeft = 0;
  // Final Exchange's own consuming half: clears Champion's Guard's own
  // flag so the NEXT Final Exchange again requires a fresh Champion's
  // Guard use in between — mirrors consumesPreparedState's exact shape.
  if (ability.consumesPriorAbilityUse) priorFlags[ability.consumesPriorAbilityUse] = false;
  let dmgMult = ability.dmgMult;
  // First-attack bonuses (Ambush, Silent Hunter, Patient Hunter, Ambush
  // Predator, Prepared Opening/H08) — see firstAttackPassiveBonus above.
  const firstBonus = firstAttackPassiveBonus(state, creature);
  dmgMult *= firstBonus.dmgMultBonus;
  const firstAttackAccBonus = firstBonus.accBonus;
  if (ability.bonusVsStatus && combat.player.playerStatuses && combat.player.playerStatuses[ability.bonusVsStatus.status]) {
    dmgMult *= ability.bonusVsStatus.mult;
  }
  if (ability.bonusVsHealthBelowPct && state.health <= state.maxHealth * ability.bonusVsHealthBelowPct.pct) {
    dmgMult *= ability.bonusVsHealthBelowPct.mult;
  }
  if (ability.bonusVsHealthAbovePct && state.health >= state.maxHealth * ability.bonusVsHealthAbovePct.pct) {
    dmgMult *= ability.bonusVsHealthAbovePct.mult;
  }
  // Press the Advantage (Sanguivorum Criminal Underworld, IA-28): "1.6x,
  // or 1.85x if the target currently carries an Accuracy or Speed debuff"
  // — reads the player's own combat.player.playerStatuses (named AND custom
  // inflicts both land there — see applyAbilityInflict), same table
  // bonusVsStatus above already reads, just checking any entry's debuff
  // shape instead of one specific status id.
  if (ability.bonusVsAccOrSpdDebuff && playerHasAccOrSpdDebuff(state)) {
    dmgMult *= ability.bonusVsAccOrSpdDebuff.mult;
  }
  // Trident Combination (Ovum Prizefighter, Sanguivorum Independent Armed
  // Groups): the narrower acc/atk sibling of bonusVsAccOrSpdDebuff above.
  if (ability.bonusVsAccOrAtkDebuff && playerHasAccOrAtkDebuff(state)) {
    dmgMult *= ability.bonusVsAccOrAtkDebuff.mult;
  }
  // Opportunistic Strike (Contract Blade, Sanguivorum Independent Armed
  // Groups): "1.6x, or 1.8x vs a target with ANY negative combat status" —
  // the broadest of the three, checking playerHasAnyNegativeStatus instead
  // of one specific stat pair.
  if (ability.bonusVsAnyNegativeStatus && playerHasAnyNegativeStatus(state)) {
    dmgMult *= ability.bonusVsAnyNegativeStatus.mult;
  }
  // H11 Coordinated Assault ("increased to 145% when another human ally
  // is alive", Gate 5B.8 skills codex): any other alive, non-friendly
  // packmate in this same fight counts — these creatures are always
  // fought alongside their own kind (escorts, squads, guard details),
  // not literally gated on a "human" species tag no other ability here
  // checks either.
  if (ability.bonusVsAllyAlive && combat.enemies.some((e) => e.alive && e.creatureObj !== creature && !e.creatureObj.friendly)) {
    dmgMult *= ability.bonusVsAllyAlive.mult;
  }
  // Coordinated Strike (Aqualis Marine, Sanguivorum Imperial Military):
  // the same bonusVsAllyAlive shape just above, but scoped to a specific
  // `family` instead of "any other non-friendly enemy" — "1.4x, or 1.65x
  // if another allied Aqualis unit alive."
  if (ability.bonusVsFamilyAllyAlive && combat.enemies.some((e) => e.alive && e.creatureObj !== creature && e.creatureObj.family === ability.bonusVsFamilyAllyAlive.family)) {
    dmgMult *= ability.bonusVsFamilyAllyAlive.mult;
  }
  // Measured Counteroffensive (Vigilis Unit Commander, Sanguivorum
  // Imperial Military): 1.65x, or 1.85x "when wearer has an active
  // defensive buff" — hasActiveDefBuff (below) looks up this creature's
  // own enemy record's selfBuffs for a live stat:"def" entry.
  if (ability.bonusIfOwnDefBuffActive && hasActiveDefBuff(combat, creature)) {
    dmgMult *= ability.bonusIfOwnDefBuffActive.mult;
  }
  // Contract Bolt (Contract Marksman, Sanguivorum Independent Armed
  // Groups): "+10% final damage if Take Aim active, consuming it" — Take
  // Aim's own banksNextAttackAccBonus already banked the state on
  // creature.bankedAttackAccBonusTurnsLeft; checked here (read-only) and
  // consumed, as always, by this very attack's own normal
  // resolveEnemyAttackOnPlayer/resolveEnemyAttackOnAlly consumption below —
  // this check never itself touches/clears the banked state.
  if (ability.bonusIfPreparedState && creature.bankedAttackAccBonusTurnsLeft > 0) {
    dmgMult *= ability.bonusIfPreparedState.mult;
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
  // H18 Adaptive Orders ("grant up to 3 other allies either +5 Defense or
  // +5 Accuracy... selected deterministically using the commander's 50%
  // Health threshold"): the codex doesn't say which side of the
  // threshold maps to which bonus, so this is an inferred default —
  // healthy (above the threshold) presses the advantage with Accuracy;
  // hurt (at or below) calls for a defensive order instead. Resolved
  // once here, at cast time, into the same packAuraBuff shape every
  // other pack-buffing active already uses — applyPackAuraBuff itself
  // needs no changes.
  let packAuraBuff = ability.packAuraBuff;
  if (ability.conditionalPackAuraBuff) {
    const c = ability.conditionalPackAuraBuff;
    // "The commander's" own Health threshold — combat.hp/maxHp (the
    // PER_ENEMY_FIELDS proxy) already reads whichever enemy is active,
    // which is this same casting creature, not the player.
    packAuraBuff = activeEnemySlot(combat).hp > activeEnemySlot(combat).maxHp * c.pct ? c.abovePct : c.atOrBelowPct;
  }
  // Disciplined Riposte/Shielded Thrust (Sanguivorum Imperial Military):
  // "+5 ACC when a defensive effect is active" — same hasActiveDefBuff
  // check as Measured Counteroffensive's conditional dmgMult above, folded
  // as an additive ACC bonus instead.
  const condAccBonus = ability.accBonusIfOwnDefBuffActive && hasActiveDefBuff(combat, creature) ? ability.accBonusIfOwnDefBuffActive : 0;
  // Veiled Precision (Veiled Executor, Sanguivorum Independent Armed
  // Groups): "1.65x ATK; IF prepared, on hit -10 target ACC" — a plain
  // existing-pattern conditional inflict, not a new mechanism: just read
  // the same banked-state flag Contract Bolt's bonusIfPreparedState above
  // reads, BEFORE this attack's own normal consumption clears it, and omit
  // the inflict entirely when it isn't set.
  const inflict = ability.inflictRequiresPreparedState && !(creature.bankedAttackAccBonusTurnsLeft > 0) ? undefined : ability.inflict;
  return {
    id: abilityId,
    name: ability.name,
    // Step 1f-ii: read off the ability's own merged definition
    // (getEnemyAbility's ENEMY_ACTIVE_ACTION_SHAPE merge, js/data/
    // enemyabilities.js) rather than a hardcoded constant in the
    // pipeline orchestrator -- every active shares the same value today
    // (enemyCore), but this is the ability's own declared field, read
    // generically, the same as a player action's own `formula` is read
    // off getActionDef(id), never assumed by the caller.
    formula: ability.formula,
    dmgMult,
    accBonus: (ability.accBonus || 0) + firstAttackAccBonus + condAccBonus || undefined,
    aoe: !!ability.aoe,
    aoeMaxTargets: ability.aoeMaxTargets,
    inflict,
    selfDebuff: ability.selfDebuff,
    selfBuff: ability.selfBuff,
    healOnHitPct: ability.healOnHitPct,
    healSelfPct: ability.healSelfPct,
    packAuraBuff,
    summon: ability.summon,
    // Prepare Ballista / Calculated Preparation (Sanguivorum Imperial
    // Military): dispatched in resolveEnemyAction alongside selfBuff/
    // packAuraBuff — see the comments there.
    grantsPreparedState: ability.grantsPreparedState,
    banksNextAttackAccBonus: ability.banksNextAttackAccBonus,
  };
}

// Builds one summoned enemy in the exact shape startCombat's own roster
// uses (see the `enemies` array built there) — a summon mid-fight is
// otherwise indistinguishable from a creature that was in the encounter
// from the start: it can be targeted, it acts on its own initiative, it
// pays out its own XP/gold/loot on death. `sourceKey` (the summoning
// ability's own id) is what resolveEnemySummon below counts against a
// spec's maxActive cap.
// arrivalHpPct (H22 Call the Crew/H23 Guard Reinforcements, Gate 5B.8
// skills codex — "arrives at 60% of its normal maximum Health"): scales
// the summon's starting hp down from its freshly rolled max, same as any
// other wounded-on-arrival summon would. noArrivalAttack ("no
// arrival-round attack") sets actedEarlyThisRound true instead of false —
// the initiative system (buildInitiativeOrder/resolveSpeedInitiative/
// resolveRemainingInitiativeActions) already treats that as "already took
// its slot this round," so the summon simply sits out combat until next
// round with no new mechanism needed; the very next round's
// resolveSpeedInitiative resets the flag to false like it does for
// everyone else.
function buildSummonedEnemyRecord(id, creature, sourceKey, dynamicCreature, arrivalHpPct, noArrivalAttack) {
  const maxHp = creature.hp;
  return {
    creatureId: id,
    creatureObj: creature,
    dynamicCreature: !!dynamicCreature, // true for a fully dynamic creature (engine/arena.js's gladiators) rather than a real BESTIARY id — see applyArchiveEternal, which skips species-tracking for those exactly like generateEnemyMage's own encounters already do
    name: creature.name,
    hp: arrivalHpPct != null ? Math.max(1, Math.round(maxHp * arrivalHpPct)) : maxHp,
    maxHp,
    alive: true,
    actedEarlyThisRound: !!noArrivalAttack,
    counterGuardUsedThisRound: false,
    disarmed: false,
    corroded: false,
    enemyAtkPenalty: 0,
    enemyDefPenalty: 0,
    enemyStunCharges: 0,
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
function resolveEnemySummon(state, level, spec, sourceKey, summonerName, summonerCreature) {
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
  let room = maxActive != null ? Math.max(0, maxActive - alreadyActive) : Infinity;
  // maxLifetime (Call Outlaw Hounds, Sanguivorum Criminal Underworld
  // division): a SECOND, independent cap on top of maxActive — "max 3
  // active AND 6 lifetime summons per combat" — every other summon spec
  // in this file only ever caps currently-active count, so this is a
  // separate running total per key, not a reinterpretation of maxActive.
  if (spec.maxLifetime != null) {
    combat.summonLifetimeCounts = combat.summonLifetimeCounts || {};
    const usedLifetime = combat.summonLifetimeCounts[key] || 0;
    room = Math.min(room, Math.max(0, spec.maxLifetime - usedLifetime));
  }
  let count = spec.count != null ? spec.count : randInt(spec.countMin, spec.countMax);
  count = Math.min(count, room);
  if (count <= 0) {
    return [`${withThe(summonerName, true)} tries to call for reinforcements, but none answer.`];
  }
  const summoned = [];
  const summonedRecords = [];
  for (let i = 0; i < count; i++) {
    const id = spec.creatureId || spec.pool[Math.floor(Math.random() * spec.pool.length)];
    const template = BESTIARY[id];
    if (!template) continue;
    const creature = buildFightCreature(template, level, template.dangerClass, id);
    // groupOverride (Call Outlaw Hounds): retags this specific summoned
    // instance's `group` so applyPackAuraBuff's existing group-match (Pack
    // Signal) treats it as the handler's own packmate — the summoned
    // creature's BESTIARY template (timberWolf/duskWolf's own `group:
    // "wolf"`) is never mutated, only this one fight-cloned copy.
    if (spec.groupOverride) creature.group = spec.groupOverride;
    const record = buildSummonedEnemyRecord(id, creature, key, false, spec.arrivalHpPct, spec.noArrivalAttack);
    combat.enemies.push(record);
    summonedRecords.push(record);
    summoned.push(creature.name);
  }
  if (spec.maxLifetime != null) combat.summonLifetimeCounts[key] = (combat.summonLifetimeCounts[key] || 0) + summoned.length;
  if (!summoned.length) {
    return [`${withThe(summonerName, true)} tries to call for reinforcements, but none answer.`];
  }
  // Hunter's Call (SANG-CU-IE009, Packmaster's Whistle, Criminal
  // Underworld) / Boarding Discipline (MIL-IE006, Boarding Command
  // Whistle V1-V2, Sanguivorum Imperial Military): the summoner's OWN
  // first successful summon-creation each combat grants one NEW summon
  // +5 Accuracy for 2 of its own turns — generalized onto this one shared
  // code path per this division's own explicit instruction, rather than
  // duplicating it under a second id. Boarding Discipline's own wording
  // asks for the first-spawned summon deterministically rather than
  // Hunter's Call's random pick; reusing the identical path (including
  // the random pick) was the explicit ask, so both resolve the same way —
  // a documented, intentional simplification for Boarding Discipline.
  const BOARDING_SUMMON_BUFF_EFFECT_IDS = ["sang_cu_ie009_hunters_call", "sang_mil_ie006_boarding_discipline"];
  if (summonerCreature && !summonerCreature.huntersCallUsed && BOARDING_SUMMON_BUFF_EFFECT_IDS.some((id) => hasEffect(summonerCreature, id))) {
    summonerCreature.huntersCallUsed = true;
    const chosen = summonedRecords[Math.floor(Math.random() * summonedRecords.length)];
    applyEnemySelfModifier(combat, chosen.creatureObj, { acc: 5, turns: 2 });
  }
  return [`${withThe(summonerName, true)} calls for reinforcements — ${summoned.join(", ")} ${summoned.length === 1 ? "joins" : "join"} the fight!`];
}

// Buffs every OTHER alive packmate sharing this creature's own `group`
// (Rallying Roar, Grave Formation, ...) — the same temporary, reversible
// shape as applyEnemySelfModifier, just fanned out across the roster
// instead of just the caster. Packmates with no shared `group` (a solitary
// creature, or one with no group tag at all) simply have no one to buff.
// spec.maxTargets (Focused Rally/Defensive Command/Resolute Command/
// Adaptive Orders: "up to 2/3 other allies") caps the recipients to the
// first N found in roster order; omitted entirely for the older,
// uncapped pack-buffs (Rallying Roar, Grave Formation, ...), which keep
// buffing the whole group as before.
// spec.groupKey (Pack Coordination, Sanguivorum Imperial Military — Legion
// Houndmaster): an override group to match recipients against, instead of
// the caster's own `creature.group` — lets one creature's actives target
// two DIFFERENT pack scopes (Legion Houndmaster's own shared
// "sang_mil_imperial_military" group for receiving commander buffs, vs.
// its own hounds' narrower "sang_mil_legion_hounds" group, which
// groupKey reaches here without touching the caster's own `group` tag).
// Every pre-existing call omits groupKey, so `creature.group` remains the
// default, unchanged.
// Company Standard/Rallying Standard (Sanguivorum Independent Armed
// Groups, below): pick the recipient at lowest current HP%/ATK among the
// `recipients` array applyPackAuraBuff just buffed — the opposite of
// Imperial Authority's own `recipients[0]` ("first in resolution order")
// rule. `other` is an enemy record (combat.enemies entry): HP lives on
// the record itself (other.hp/other.maxHp, same field pair
// resolveEnemyActiveAbility's own e.hp/e.maxHp eligibility checks read),
// while ATK lives on other.creatureObj (the live, equipment-and-buff-
// inclusive stat every other read in this file uses).
function pickLowestHpRecipient(recipients) {
  return recipients.reduce((lowest, r) => (lowest == null || r.hp / r.maxHp < lowest.hp / lowest.maxHp ? r : lowest), null);
}
function pickLowestAtkRecipient(recipients) {
  return recipients.reduce((lowest, r) => (lowest == null || r.creatureObj.atk < lowest.creatureObj.atk ? r : lowest), null);
}
function applyPackAuraBuff(combat, creature, spec) {
  const groupKey = spec.groupKey || creature.group;
  if (!groupKey) return;
  const turns = spec.turns || 1;
  let recipients = combat.enemies.filter((other) => other.alive && other.creatureObj !== creature && other.creatureObj.group === groupKey);
  if (spec.maxTargets != null) recipients = recipients.slice(0, spec.maxTargets);
  for (const other of recipients) {
    for (const [key, amount] of Object.entries(spec)) {
      if (key === "turns" || key === "maxTargets" || key === "groupKey" || typeof amount !== "number") continue;
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
  // Imperial Authority (MIL-IE008, Arbitarius Insignia, Sanguivorum
  // Imperial Military): the first time each combat the wearer successfully
  // grants an active beneficial buff to one or more allies, the first
  // recipient (in resolution order) additionally gets +5 Defense for 2 of
  // its own turns. applyPackAuraBuff is only ever called for an
  // ally-targeted packAuraBuff spec (never a self-only selfBuff/
  // selfDebuff, which route through applyEnemySelfModifier directly), so
  // "not triggered by a self-only buff" holds for free from this
  // placement; `recipients` is already empty whenever nothing was
  // actually buffed (no group, or no living packmate to find).
  if (recipients.length && !creature.imperialAuthorityUsed && hasEffect(creature, "sang_mil_ie008_imperial_authority")) {
    creature.imperialAuthorityUsed = true;
    applyEnemySelfModifier(combat, recipients[0].creatureObj, { def: 5, turns: 2 });
  }
  // Company Standard (SANG-IAG-IE004, Free Company Standard, Sanguivorum
  // Independent Armed Groups): the first successful wearer-originated
  // Attack buff to allies each combat grants the recipient at LOWEST
  // current HP% an additional +5 Defense for 2 of its own turns — same
  // once-per-combat shape as Imperial Authority above, just a different
  // recipient-selection rule (pickLowestHpRecipient instead of
  // recipients[0]). Kept as its own independent if-block (not a shared
  // dispatcher), so a creature carrying more than one of these three
  // effects could fire all of them off the same call.
  if (recipients.length && !creature.companyStandardUsed && hasEffect(creature, "sang_iag_ie004_company_standard")) {
    creature.companyStandardUsed = true;
    applyEnemySelfModifier(combat, pickLowestHpRecipient(recipients).creatureObj, { def: 5, turns: 2 });
  }
  // Rallying Standard (SANG-IAG-IE010, Militia Rallying Standard,
  // Sanguivorum Independent Armed Groups): same shape as Company Standard
  // just above, but selects the recipient at LOWEST current ATK and grants
  // +5 ATK for 2 turns instead.
  if (recipients.length && !creature.rallyingStandardUsed && hasEffect(creature, "sang_iag_ie010_rallying_standard")) {
    creature.rallyingStandardUsed = true;
    applyEnemySelfModifier(combat, pickLowestAtkRecipient(recipients).creatureObj, { atk: 5, turns: 2 });
  }
}

// An enemy attacking an ally instead of the player — its own smaller,
// ally-scoped sibling of resolveEnemyAttackOnPlayer, since that function's
// mitigation pipeline is threaded through with player-only Divine
// Regalia/Legendary/Mythic effects that have no bearing on an ally's own
// (shared-inventory) gear. `damage` on the returned object is always
// null, never 0 — this attack didn't target the player at all, so it
// must not read as "the player dodged" to the dodge/riposte bonuses that
// key off resolveRemainingInitiativeActions's returned damage.
// abilityCtx (Enemy Ability Engine, data/enemyabilities.js): set only when
// this same action is an AoE active ability also striking every ally —
// the player-facing half already resolved the ability's own selection/
// cooldown/name/self-buff bookkeeping, so this just needs the resolved
// dmgMult to scale the hit the same way.
// Ally Protection Reaction (Sanguivorum Gatekeeper's Stand / Protective
// Intercession / Officer's Intercession — three flavor names across two
// divisions for one mechanically identical effect, per the owner's own
// "build once" decision): any OTHER living ally, or the player, wearing
// one of these three carries a reaction that shaves 10% off final damage
// the next time a DIFFERENT ally gets hit — CD5 wearer turns, max twice
// per combat, no stacking. Entirely independent of (and checked
// alongside, not instead of) maybeHadrianAllyProtection below — both can
// fire on the same hit. Applied AFTER Hadrian's own redirect/discount
// resolves, so this shaves 10% off whatever damage is actually left once
// his own protection (if any) has already been taken into account —
// an arbitrary but documented order, since the two mechanisms are
// independent flat/ratio adjustments to the same number either way.
//
// Per-wearer state (allyProtectionCooldown/allyProtectionUsesThisCombat)
// lives on the wearer object itself — state for the player, the ally
// object for an ally — same convention as braceBonusDef/
// riposteUsesThisCombat/unshakenCommandCharges elsewhere in this file.
// Reset at combat start in startCombat.
//
// Only the FIRST eligible protector found applies — the source catalog's
// own "one intercession per hit; no double mitigation" rule holds across
// the whole party, not just within one wearer: even if two different
// party members each wear a copy of one of these three items with a
// charge available, only one fires, and only that one consumes a charge.
const ALLY_PROTECTION_EFFECT_IDS = ["sang_sec_ie005_gatekeepers_stand", "sang_sec_ie010_protective_intercession", "sang_cu_ie010_officers_intercession"];
function hasAllyProtectionEffect(carrier) {
  return ALLY_PROTECTION_EFFECT_IDS.some((id) => hasEffect(carrier, id));
}
// Enemy-side mirror of the reaction above: the player-side version only
// ever fires from resolveEnemyAttackOnAlly (an ENEMY hitting a PLAYER
// ally) — there was no symmetric path for an enemy protecting a FELLOW
// enemy from the PLAYER's own attack, which is exactly how Frontier
// Gatekeeper/Watch Captain are meant to use Gatekeeper's Stand/Protective
// Intercession when fighting alongside squadmates (Sanguivorum Security
// and Enforcement). Reuses the same ALLY_PROTECTION_EFFECT_IDS/
// hasAllyProtectionEffect check and the same allyProtectionCooldown/
// allyProtectionUsesThisCombat field convention — just scoped to
// state.combat.enemies instead of aliveAllies(state), and living on the
// enemy's own creatureObj (ticked in tickEnemyPassives below, reset for
// free each combat since every enemy creature object is rebuilt fresh by
// buildFightCreature). Folded silently into rollPlayerDamage's sangMit
// chain, consistent with every other mitigation multiplier already
// composed there (enemyOneHitMitigationMultiplier, enemyRepeatable
// MitigationMultiplier) — none of them emit a line; the player just sees
// the smaller final number.
function enemyAllyProtectionMultiplier(state, targetCreature) {
  if (!state.combat) return 1;
  for (const other of state.combat.enemies) {
    if (!other.alive || other.creatureObj === targetCreature) continue;
    const carrier = other.creatureObj;
    if (!hasAllyProtectionEffect(carrier)) continue;
    const cooldown = carrier.allyProtectionCooldown || 0;
    const uses = carrier.allyProtectionUsesThisCombat || 0;
    if (cooldown > 0 || uses >= 2) continue;
    carrier.allyProtectionCooldown = 5;
    carrier.allyProtectionUsesThisCombat = uses + 1;
    return 0.9;
  }
  return 1;
}
function applyAllyProtectionReaction(state, targetAlly, dmg) {
  // A downed (not dead) player has no agency left this fight (see
  // resolvePlayerDefeatOrDowned) — excluded as a candidate protector, same
  // as they're already excluded from enemy targeting.
  const candidates = [];
  if (!state.playerDowned) candidates.push(state);
  candidates.push(...aliveAllies(state).filter((a) => a !== targetAlly));
  for (const carrier of candidates) {
    if (!hasAllyProtectionEffect(carrier)) continue;
    const cooldown = carrier.allyProtectionCooldown || 0;
    const uses = carrier.allyProtectionUsesThisCombat || 0;
    if (cooldown > 0 || uses >= 2) continue;
    carrier.allyProtectionCooldown = 5;
    carrier.allyProtectionUsesThisCombat = uses + 1;
    const reduced = Math.round(dmg * 0.9);
    const protectorLine = carrier === state ? `You step in to take the edge off the blow aimed at ${targetAlly.name}.` : `${carrier.name} steps in to take the edge off the blow aimed at ${targetAlly.name}.`;
    return { dmg: reduced, lines: [protectorLine] };
  }
  return { dmg, lines: [] };
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
  // The last ally falling while the player is downed (resolvePlayerDefeatOrDowned)
  // is the true, final end of the fight — the player has no one left to
  // carry them, and there's no one left standing to decide what becomes
  // of the dead. Ends combat right here, with its own flavor line, and
  // clears playerDowned so main.js's own end-of-command check (which now
  // reads `state.health <= 0 && !state.playerDowned`) correctly fires the
  // permanent game-over on this same command, same as it always has for
  // a true solo defeat.
  if (state.playerDowned && state.combat && aliveAllies(state).length === 0) {
    const combat = state.combat;
    state.playerDowned = false;
    // Injury System v0.2 D12/O1: the last ally falling is this engine's
    // OTHER party-wipe trigger (the first being a fresh lethal hit with
    // no ally left, handled in resolvePlayerDefeatOrDowned) — inside a
    // dungeon it's the Mugamiir rescue, with the same injuries a win
    // would have cost for every down already banked this fight, applied
    // before dungeonRescue nulls state.combat (it reads combat.downs
    // first). dungeonRescue clears state.combat itself — don't also null
    // it here, or the second clear is a silent no-op at best.
    if (state.activeDungeon) {
      const injuryLines = applyInjuriesFromDowns(state, combat.downs);
      const rescueMsg = dungeonRescue(state);
      return [`${ally.name} falls.`, ...injuryLines, rescueMsg];
    }
    state.flags.pendingDeathCause = "combat";
    state.combat = null;
    return [
      `${ally.name} falls.`,
      `Through the haze, you watch the last of them go down. There's no one left to carry you out of this, and nothing left in you to carry yourself.`,
    ];
  }
  return [
    `${ally.name} falls.`,
    `You'll need to decide what becomes of them — 'send ${ally.name.split(" ")[0]} home' to carry the body to the Sanctuary, or 'leave ${ally.name.split(" ")[0]}' to let them go. Revival won't be easy, but it isn't impossible ('sanctuary' explains how).`,
  ];
}

// Listener: an ally's gear returns to the shared pack the instant they
// fall — nothing about it requires the wearer to still be alive, and it
// doesn't contribute anything to what's printed, so it's a clean first
// real listener rather than staying hardwired inside killAlly itself.
// Listener: every ally death goes on the run's permanent deathLog
// (engine/state.js) — including ones later left behind, which otherwise
// left no trace anywhere once the body was dealt with.
Events.on("ally.died", ({ ally, state }) => {
  recordDeath(state, { kind: "ally", defId: ally.defId, name: ally.name, relationship: ally.relationship || 0 });
});

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

// Aggressive stance: pile onto whichever enemy the player is currently
// targeting, using the same Accuracy-vs-Agility hit check as everything
// else, and a damage roll loosely scaled off the ally's own Attack — not
// routed through rollPlayerDamage, since that formula is threaded through
// with player-only Divine Regalia/Legendary/Mythic bonuses that have
// nothing to do with an ally's own gear.
// Smuggler's Guard (SANG-CU-IE006, Smuggler's Guard Buckler) / Commander's
// Poise (SANG-CU-IE011, Commander's Insignia): both react to a damaging
// hit landing on the WEARER by shaving 10% off that same hit's final
// damage — Smuggler's Guard is a repeatable cooldown-gated reaction (CD4
// wearer turns, ticked in tickEnemyPassives); Commander's Poise is a
// single once-per-combat consumption. Multiplicative with each other on
// the rare creature wearing both (not a codex-stated interaction either
// way). Shared by rollPlayerDamage and allyAggressiveAction — the two
// places something else's damage against an enemy creature is computed.
function sangCuDefenderMitigation(creature) {
  let mult = 1;
  if (hasEffect(creature, "sang_cu_ie006_smugglers_guard") && !(creature.smugglersGuardCooldown > 0)) {
    creature.smugglersGuardCooldown = 4;
    mult *= 0.9;
  }
  if (hasEffect(creature, "sang_cu_ie011_commanders_poise") && !creature.commandersPoiseUsed) {
    creature.commandersPoiseUsed = true;
    mult *= 0.9;
  }
  return mult;
}

// Defensive stance: weaken the active enemy's attack rather than damage
// it — reuses Disarm's own enemyAtkPenalty field (a flat, lasting
// reduction to effectiveEnemyAtk), capped so a long fight can't let it
// stack into "the enemy can no longer hurt you at all."
function allyDefensiveAction(state, ally) {
  const combat = state.combat;
  const target = combat.enemies[combat.activeIndex];
  if (!target || !target.alive) return [];
  // Brace, generalized: Defensive stance deals no damage at all — the
  // ally's own "no-damage action" equivalent to the player's Feint/
  // Stoneskin, same as a dmgMult: 0 enemy active. Banked against whatever
  // hits this ally next (see allyAggressiveAction/resolveEnemyAttackOnAlly).
  if (hasEffect(ally, "brace")) ally.braceBonusDef = 3;
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
  // Brace, generalized — see allyDefensiveAction's own copy of this
  // comment; Support stance is this ally's other no-damage action.
  if (hasEffect(ally, "brace")) ally.braceBonusDef = 3;
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
  const healed = applyHealing(makeAllyCombatant(target.ref), amount, "ally_support", { state });
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
  // extra-decrement bonus, but only every 4th round — combat.player.actionCounter
  // hasn't been incremented for THIS round yet (that happens further down,
  // via applyHeartwoodVitality), so "+1" here predicts what it's about to
  // become.
  const blessingOfTheHourRound = hasSetTier(state, "Regalia of the Eternal Hour", 2) && (combat.player.actionCounter + 1) % 4 === 0;
  const cooldownDecrement = combat.player.avatarOfFreedomTurns > 0 || combat.player.avatarOfCreationTurns > 0 || blessingOfTheHourRound ? 2 : 1;
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
  const avatarOfTimeFreezesBuffs = combat.player.avatarOfTimeTurns > 0;
  if (combat.player.defBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.player.defBuffTurns -= 1;
  if (combat.player.atkBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.player.atkBuffTurns -= 1;
  if (combat.player.magicBuffTurns > 0 && !avatarOfTimeFreezesBuffs) combat.player.magicBuffTurns -= 1;
  if (combat.player.avatarOfPassingTurns > 0) combat.player.avatarOfPassingTurns -= 1;
  if (combat.player.avatarOfFateTurns > 0) combat.player.avatarOfFateTurns -= 1;
  if (combat.player.avatarOfWarTurns > 0) combat.player.avatarOfWarTurns -= 1;
  if (combat.player.avatarOfKnowledgeTurns > 0) {
    combat.player.avatarOfKnowledgeTurns -= 1;
    if (combat.player.avatarOfKnowledgeTurns === 0) combat.player.knowledgeBuffAmount = 0;
  }
  if (combat.player.avatarOfDevotionTurns > 0) combat.player.avatarOfDevotionTurns -= 1;
  if (combat.player.avatarOfChaosTurns > 0) {
    combat.player.avatarOfChaosTurns -= 1;
    if (combat.player.avatarOfChaosTurns === 0) {
      combat.player.avatarOfChaosAtkBonus = 0;
      combat.player.avatarOfChaosDefBonus = 0;
      combat.player.avatarOfChaosMagicBonus = 0;
      combat.player.avatarOfChaosKnowledgeBonus = 0;
    }
  }
  if (combat.player.avatarOfEnduranceTurns > 0) {
    combat.player.avatarOfEnduranceTurns -= 1;
    if (combat.player.avatarOfEnduranceTurns === 0) {
      combat.player.avatarOfEnduranceAtkBonus = 0;
      combat.player.avatarOfEnduranceDefBonus = 0;
    }
  }
  if (combat.player.avatarOfFreedomTurns > 0) combat.player.avatarOfFreedomTurns -= 1;
  // Elemental Sovereignty (First Sword's Regalia 10pc, exclusive):
  // refresh-only, no stack — granted/refreshed in useElementAbility's
  // water case, decayed here at the same once-per-round cadence every
  // other player-side "Turns" buff above already uses.
  if (combat.player.sovereigntyTurnsLeft > 0) combat.player.sovereigntyTurnsLeft -= 1;
  // Avatar of Creation (Regalia of the Eternal Forge 6pc): the +40%
  // Attack/Magic buff (via the shared atk/magicBuffTurns fields) expires
  // normally above, but the PERMANENT +2-per-attack/+2-per-spell stacks
  // it grows (see rollPlayerDamage) deliberately do NOT reset here when
  // the window ends — "permanently," per the source text.
  if (combat.player.avatarOfCreationTurns > 0) combat.player.avatarOfCreationTurns -= 1;
  if (combat.player.avatarOfRenewalTurns > 0) combat.player.avatarOfRenewalTurns -= 1;
  if (combat.player.unyieldingWallCooldown > 0) combat.player.unyieldingWallCooldown -= 1;
  if (combat.player.timelessGuardCooldown > 0) combat.player.timelessGuardCooldown -= 1;
  // Avatar of Time (Regalia of the Eternal Hour 6pc): "when the effect
  // ends, all cooldowns resume from whatever value they would have
  // naturally reached" is simplified here to "cooldowns simply remain at
  // 0" instead — reconstructing a parallel shadow-cooldown ledger just
  // to restore the exact natural value would be a bespoke, one-off
  // tracking system for a minor edge case; this is a deliberate,
  // documented simplification (slightly favors the player) rather than
  // that added complexity.
  if (combat.player.avatarOfTimeTurns > 0) combat.player.avatarOfTimeTurns -= 1;
  if (combat.player.damageReductionTurns > 0) combat.player.damageReductionTurns -= 1;
  if (combat.player.calmWatersTurns > 0) combat.player.calmWatersTurns -= 1;
  if (combat.player.evasionTurns > 0) combat.player.evasionTurns -= 1;
  // Battle Tempered (Divine Regalia — Armor of the First Legion): every
  // round spent in combat grants +1 Attack/+1 Defense, capped +10/+10.
  // Unconditional per-action, unlike Living Steel's every-3rd-action gate.
  if (hasEffect(state, "battle_tempered")) {
    if ((combat.player.battleTemperedAtkStacks || 0) < 10) combat.player.battleTemperedAtkStacks = (combat.player.battleTemperedAtkStacks || 0) + 1;
    if ((combat.player.battleTemperedDefStacks || 0) < 10) combat.player.battleTemperedDefStacks = (combat.player.battleTemperedDefStacks || 0) + 1;
  }
  // Unwavering Devotion (Divine Regalia — Vestments of Boundless
  // Devotion): every round survived grants +2 Magic, capped +20 (10
  // stacks) — Battle Tempered's exact shape, one stat instead of two.
  // "Losing combat resets the effect" is automatically true here: every
  // new fight starts this counter fresh at 0 regardless of how the last
  // one ended.
  if (hasEffect(state, "unwavering_devotion") && (combat.player.unwaveringDevotionStacks || 0) < 10) {
    combat.player.unwaveringDevotionStacks = (combat.player.unwaveringDevotionStacks || 0) + 1;
  }
  // Winds of Change (Divine Regalia — Garments of the Wandering Breeze): at
  // the start of every round, replace last round's random +6 stat bonus
  // with a freshly rolled one (Attack/Defense/Magic/Knowledge, equally
  // likely) — four mutually exclusive fields so exactly one is ever
  // nonzero at a time, rather than an independent per-stack timer. Its
  // re-roll always favors the player (there's no "no bonus" outcome), so
  // it also counts as "a random effect favors you" for Twist of Fate.
  if (hasEffect(state, "winds_of_change")) {
    combat.player.windsOfChangeAtk = 0;
    combat.player.windsOfChangeDef = 0;
    combat.player.windsOfChangeMagic = 0;
    combat.player.windsOfChangeKnowledge = 0;
    const roll = Math.floor(Math.random() * 4);
    const labels = ["Attack", "Defense", "Magic", "Knowledge"];
    if (roll === 0) combat.player.windsOfChangeAtk = 6;
    else if (roll === 1) combat.player.windsOfChangeDef = 6;
    else if (roll === 2) combat.player.windsOfChangeMagic = 6;
    else combat.player.windsOfChangeKnowledge = 6;
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
      // Ashward (DRA-E08): every eligible Burning tick against the wearer
      // deals 0.75x — Burning still applies/expires on its own schedule
      // otherwise, only the per-tick damage is reduced (now the
      // tickBurnEnemy formula's own job, step 1f-iv §5).
      const burnResult = resolveEnemyDotTick(state, e, i, "tickBurnEnemy", (creature, edmg) => `The flames still burn ${withThe(creature.name, false)} for ${edmg} damage.`, playerTargetIndex, e.burn.dmgPerTurn);
      lines.push(...burnResult.lines);
      e.burn.turnsLeft -= 1;
      if (e.burn.turnsLeft <= 0) e.burn = null;
      if (burnResult.comboEnded) return lines;
      if (burnResult.killed) continue;
    }
    if (e.alive && e.bleed && e.bleed.turnsLeft > 0) {
      const bleedResult = resolveEnemyDotTick(state, e, i, "tickBleedEnemy", (creature, edmg) => `${withThe(creature.name, true)} is still bleeding for ${edmg} damage.`, playerTargetIndex, e.bleed.dmgPerTurn);
      lines.push(...bleedResult.lines);
      e.bleed.turnsLeft -= 1;
      if (e.bleed.turnsLeft <= 0) e.bleed = null;
      if (bleedResult.comboEnded) return lines;
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
  // combatOngoing, not a bare health check: a downed (not dead) player
  // must not freeze everything below for the rest of the fight — ally
  // buff/status ticks and combat.player.actionCounter (several cadence-based
  // effects read it) need to keep advancing exactly as if the player
  // were still standing, even though the player themselves isn't acting.
  if (!combatOngoing(state)) return lines;
  // Crafted-potion buffs (playerBuffs) and any ally's own (companion.js's
  // tickAllyBuffs) age down the same way, once per round.
  tickPlayerBuffs(state);
  // Ally Protection Reaction's own CD5 cooldown — ticks here, the one
  // per-round point that runs unconditionally for the player and every
  // living ally regardless of kit (tickCompanionCombatTimers below only
  // ever runs for a kit-bearing ally, i.e. Hadrian, which this effect is
  // explicitly NOT restricted to).
  if ((state.allyProtectionCooldown || 0) > 0) state.allyProtectionCooldown -= 1;
  aliveAllies(state).forEach((ally) => {
    tickAllyBuffs(ally);
    if ((ally.allyProtectionCooldown || 0) > 0) ally.allyProtectionCooldown -= 1;
    lines.push(...tickAllyStatuses(state, ally));
  });
  // tickAllyStatuses' own DOT tick can call killAlly, whose party-wipe
  // branch (the player already downed, and this the last living ally)
  // nulls state.combat — same "a kill mid-loop can end the fight" case
  // the enemy-DOT loop above already guards for (combat.enemies' own
  // "if (!state.combat) return lines;"), just reached from the ally side
  // instead. Everything below this point reads combat.player.actionCounter
  // (applyHeartwoodVitality re-reads state.combat itself, fresh, so the
  // `combat` local captured at the top of this function going stale
  // doesn't save it) and crashes without this same early-return.
  if (!combatOngoing(state)) return lines;
  // Endless Bloom (Divine Regalia — Seed of First Dawn): a 5-round
  // Regeneration HoT set up once at combat start (see startCombat),
  // ticked here identically in shape to burn/bleed but healing instead of
  // damaging — routed through applyHeal so Flourishing Soul/Overflowing
  // Life/Living Current all still apply to it.
  if (combat.player.regen && combat.player.regen.turnsLeft > 0) {
    const { healed, lines: healLines } = applyHeal(state, combat.player.regen.healPerTurn);
    if (healed > 0) lines.push(`Endless Bloom mends you for ${healed} health.`, ...healLines);
    combat.player.regen.turnsLeft -= 1;
    if (combat.player.regen.turnsLeft <= 0) combat.player.regen = null;
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
  // combat.player.actionCounter Heartwood Vitality/Calming Presence already read,
  // checked right after applyHeartwoodVitality has incremented it for
  // this round.
  if (hasEffect(state, "lasting_foundation") && combat.player.actionCounter % 3 === 0) {
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
  if (hasEffect(state, "work_refines") && combat.player.actionCounter % 3 === 0) {
    if ((combat.player.workRefinesAtkStacks || 0) < 20) combat.player.workRefinesAtkStacks = Math.min(20, (combat.player.workRefinesAtkStacks || 0) + 2);
    if ((combat.player.workRefinesMagicStacks || 0) < 20) combat.player.workRefinesMagicStacks = Math.min(20, (combat.player.workRefinesMagicStacks || 0) + 2);
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
  if (hasEffect(state, "patient_current") && combat.player.actionCounter % 2 === 0) {
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
  if (combat.player.avatarOfRenewalTurns > 0) {
    const avatarOfRenewalHeal = Math.ceil(state.maxHealth * 0.1);
    if (avatarOfRenewalHeal > 0) {
      const { healed, lines: healLines } = applyHeal(state, avatarOfRenewalHeal);
      if (healed > 0) lines.push(`Avatar of Renewal mends you for ${healed} health.`, ...healLines);
    }
  }
  // Companion cooldown/buff-turn bookkeeping ages down every round
  // regardless of whether (or when) an ally's own action actually lands —
  // allies now take their action as part of the Speed-ordered initiative
  // split (resolveSpeedInitiative/resolveRemainingInitiativeActions, both
  // called by every action function right after this one returns), not
  // here.
  if (state.combat) tickCompanionCombatTimers(state);
  return lines;
}

// ---- Injury System v0.2, §4/§5: applying the downs a survived fight
// leaves behind ----
//
// Called exactly once per fight, from every "the player survived this"
// exit point (resolveKill's victory branch, attemptFlee's successful
// flee, and — O1 — the Mugamiir dungeon rescue fired from either
// resolvePlayerDefeatOrDowned's or killAlly's own party-wipe branch,
// treated as a survived fight for injury purposes even though it's also
// a rescue) — NEVER from a true, un-rescued defeat (D11: injuries only
// apply if you survive). `downs` is state.combat.downs, read by the
// caller before state.combat is nulled (dungeonRescue nulls it itself).
function applyInjuriesFromDowns(state, downs) {
  const lines = [];
  for (const damageType of downs || []) {
    // Judgment call: every real call site always sets playerLastHitType
    // to one of the 10 known keys (physical/bleed/the 8 ELEMENTS keys)
    // before a down can be pushed, so this fallback is only a defensive
    // guard against a stale/unmapped value, never expected to fire.
    const group = DAMAGE_TYPE_TO_INJURY_GROUP[damageType] || "trauma";
    lines.push(...applyOneInjuryToGroup(state, group));
  }
  return lines;
}

function applyOneInjuryToGroup(state, group) {
  const groupDef = INJURY_GROUPS[group];
  const groupSlotIds = groupDef.slots.map((s) => group + "_" + s);
  // Rule 2: already have a minor injury in this group -> upgrade it.
  const minorInGroup = state.injuries.find((inj) => groupSlotIds.includes(inj.id) && inj.severity === "minor");
  if (minorInGroup) {
    minorInGroup.severity = "severe";
    return [`Your ${injurySlotName(minorInGroup.id).toLowerCase()} worsens — it's severe now.`];
  }
  // Rule 3: fewer than 3 injuries held -> add a new minor from this
  // group, skipping any slot you already hold (a severe one in this
  // same group that rule 2 didn't match, i.e. no minor sibling to
  // upgrade).
  if (state.injuries.length < INJURY_MAX_SLOTS) {
    const available = groupSlotIds.filter((id) => !state.injuries.some((inj) => inj.id === id));
    if (available.length) {
      const id = available[Math.floor(Math.random() * available.length)];
      state.injuries.push({ id, group, severity: "minor", acquiredDay: state.day, sourceDamageType: null, fieldTreated: false });
      return [`You come away with a new injury: ${injurySlotName(id)} (minor).`];
    }
    // Edge case the spec's own rule 3 doesn't literally cover: fewer than
    // 3 injuries held overall, but EVERY slot in this specific group is
    // already taken (and, since rule 2 above already failed, all of them
    // are severe — a 2-slot group can reach this with just 2 total
    // injuries). Judgment call: fall through to rule 4's upgrade
    // behavior rather than silently dropping the down.
  }
  // Rule 4: upgrade a minor injury to severe — same group if possible,
  // otherwise a random one elsewhere. (Reachable both "normally," with 3
  // injuries already held, and via the rule-3 fallback just above.)
  const sameGroupMinor = state.injuries.find((inj) => groupSlotIds.includes(inj.id) && inj.severity === "minor");
  const anyMinor = sameGroupMinor || state.injuries.filter((inj) => inj.severity === "minor");
  const target = sameGroupMinor || (Array.isArray(anyMinor) && anyMinor.length ? anyMinor[Math.floor(Math.random() * anyMinor.length)] : null);
  if (target) {
    target.severity = "severe";
    return [`Your ${injurySlotName(target.id).toLowerCase()} worsens — it's severe now.`];
  }
  // No minor injury exists anywhere to upgrade (every held injury is
  // already severe). Per the real-time 7th-fall check in
  // resolvePlayerDefeatOrDowned, injuryLoad can never reach 6 without
  // that check killing the player first, so this should be unreachable —
  // defensive no-op rather than a crash if it's somehow hit.
  return [];
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
  if (hasSetTier(state, "Elder Bark", 6) && !combat.player.elderBarkSaveUsed) {
    combat.player.elderBarkSaveUsed = true;
    state.health = 1;
    msg = `The oldest wood remembers you yet — you survive this at 1 Health.`;
  } else if (hasEffect(state, "last_stand") && !combat.player.lastStandUsed) {
    combat.player.lastStandUsed = true;
    state.health = 1;
    combat.player.lastStandAtkBonus = (combat.player.lastStandAtkBonus || 0) + 5;
    // v0.11 PLAYER_STAT_SCALE: lastStandAtkBonus is a raw stat-point
    // grant, folded into effectivePlayerAtk's flatStat()'d total.
    msg = `Last Stand — you refuse to fall. 1 Health, and +${flatStat(5)} Attack for what's left of this fight.`;
  } else if (hasEffect(state, "between_worlds") && !combat.player.betweenWorldsUsed) {
    // Between Worlds (Divine Regalia — Veil of the Ferryman): the same
    // "leaves you at 1 Health" cheat-death shape as Last Stand above, but
    // deliberately without its +5 Attack — a plain reprieve, nothing more.
    combat.player.betweenWorldsUsed = true;
    state.health = 1;
    msg = `Between Worlds — the Ferryman's veil catches you at the threshold. 1 Health, nothing more.`;
  } else if (hasSetTier(state, "Regalia of the Woven Thread", 6) && combat.player.avatarOfFateTurns > 0 && !combat.player.avatarOfFateSaveUsed) {
    // Avatar of Fate's (Regalia of the Woven Thread 6pc) "once during the
    // effect" 1-HP save — only available while its 4-round window is
    // active (see checkAvatarOfFate), on top of (not instead of) the
    // once-per-fight saves above.
    combat.player.avatarOfFateSaveUsed = true;
    state.health = 1;
    msg = `Avatar of Fate — fate itself refuses to let you fall. 1 Health.`;
  }
  // Avatar of Devotion (Regalia of the Eternal Heart 6pc): "if reduced to
  // 1 Health during the effect, immediately restore 20% max Health
  // (once)" — a follow-up to WHICHEVER cheat-death save above just fired,
  // not a save of its own. Checked once, regardless of which branch set
  // health to 1.
  if (msg && hasSetTier(state, "Regalia of the Eternal Heart", 6) && combat.player.avatarOfDevotionTurns > 0 && !combat.player.avatarOfDevotionSaveUsed) {
    combat.player.avatarOfDevotionSaveUsed = true;
    const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.2));
    if (healed > 0) msg += ` Avatar of Devotion answers in turn — mended for ${healed} health.${lines.length ? " " + lines.join(" ") : ""}`;
  }
  // The Mugamiir Safor's dungeon rescue USED to have its own unconditional
  // fallback branch right here, firing the instant a lethal hit landed
  // inside a dungeon — before resolvePlayerDefeatOrDowned (below) ever
  // got a chance to check whether an ally could carry the fight instead.
  // That's exactly the bug Injury System v0.2 D12 calls out: a party
  // inside a dungeon could never go down at all, and any lethal hit on
  // the player ended the run outright. The rescue's real trigger is now
  // "the whole party has wiped" (no living ally AND the player has just
  // taken a lethal hit), which only resolvePlayerDefeatOrDowned's own
  // party-wipe branch (and killAlly's matching one) can actually
  // determine — so it moved there, and nothing here calls dungeonRescue
  // for a lethal-hit-triggered rescue anymore. checkTrapDeathPrevention's
  // OWN direct dungeonRescue call (for a Trap room failure, outside
  // combat/this function entirely) is unrelated and unchanged.
  return msg;
}

// The single entry point every lethal-hit-on-the-player call site uses in
// place of the old `checkDeathPrevention(state) || "Everything goes
// dark."` idiom. Gear-based cheat-death (checkDeathPrevention, above)
// still gets first refusal, completely unchanged. Once that's exhausted,
// Injury System v0.2 §2 runs, in order: the 7th-fall injury death, then
// knocked down (if at least one ally is still standing to carry the
// fight), then the party-wipe branch (dungeon rescue, or real defeat).
//
// `state.playerDowned` itself is the single flag that keeps the fight
// going without the player afterward (see combatOngoing, pickEnemyAttackTarget,
// resolveDownedRound, killAlly, resolveKill, and main.js's own end-of-
// command check) — set once here, the moment it happens, never touched
// by this function again. A null return means "nothing new to print" —
// either an already-downed player's Health sitting at <=0 is being
// rechecked incidentally by some other code path (DOT ticks, a reflect
// passive, ...) with no fresh thing to announce, or a true solo defeat
// already got its one line from a different branch below.
function resolvePlayerDefeatOrDowned(state) {
  const saved = checkDeathPrevention(state);
  if (saved) return saved;
  if (state.health > 0) return null; // the gear check itself only ever acts on a lethal hit; nothing lethal happened here after all
  if (state.playerDowned) return null; // already knocked down earlier this same fight — don't re-trigger or re-print
  const combat = state.combat;
  const pendingDowns = combat && combat.downs ? combat.downs.length : 0;
  // §2 step 2: the 7th fall. injuryLoad (persistent, from past fights) +
  // pendingDowns (this fight's own downs, not yet turned into injuries)
  // reaching 6 means this lethal hit would be a 7th survivable down — it
  // isn't survivable. Final, even inside a dungeon (D3): this is the
  // player's own death from accumulated injuries, not a party wipe, so
  // the Mugamiir rescue never gets a say. (>= rather than spec's literal
  // == as a defensive margin — injuryLoad+pendingDowns should never
  // legitimately exceed 6, since this same check already gates every
  // down that could have pushed it past that.)
  if (injuryLoad(state) + pendingDowns >= INJURY_MAX_LOAD) {
    state.flags.pendingDeathCause = "injuries";
    return `This fall isn't like the others. Everything you've already survived catches up with you at once, and this time your own body is what gives out — not the fight.`;
  }
  // §2 step 3: down, if at least one ally can carry the fight. The
  // down's own damage type (playerLastHitType, set at whichever call
  // site actually landed this hit) is banked now, for applyInjuriesFromDowns
  // to turn into a real injury IF this fight is ultimately survived (D11)
  // — never applied here, never applied at all if the run ends in a true
  // defeat instead.
  if (aliveAllies(state).length > 0) {
    state.playerDowned = true;
    if (combat) {
      combat.downs = combat.downs || [];
      combat.downs.push(combat.player.playerLastHitType || "physical");
    }
    return `The hit takes everything out of you — you go down hard, the world swimming, and there's nothing left in you to answer it with. Your allies close ranks and keep fighting; whatever happens next isn't yours to decide.`;
  }
  // §2 step 4: party wipe — no living ally left to carry the fight,
  // whether solo from the start or because every ally has since fallen.
  // D12/O1: inside a dungeon this is the Mugamiir rescue, and the rescue
  // costs the SAME injuries a win would have for every down already
  // banked this fight (applied before dungeonRescue nulls state.combat,
  // since that's what holds the downs list) — on top of the rescue's own
  // loot/gold cost, never instead of it. Anywhere else, it's the real,
  // permanent end — no survival, so D11 means no injuries either.
  // D14: the wipe-causing hit itself — the one that just landed with no
  // ally left to catch it — counts as a down too, same as any other;
  // it was never pushed onto combat.downs (step 3 above is the only
  // place that happens, and it didn't run this time), so it's appended
  // here instead of being silently dropped. The step-2 check already
  // guaranteed injuryLoad+pendingDowns < INJURY_MAX_LOAD before this
  // point, so adding exactly one more down here can't push the result
  // past INJURY_MAX_LOAD (6) — the cap D14 asks for falls out for free.
  if (state.activeDungeon) {
    const downsIncludingWipeHit = (combat && combat.downs ? combat.downs : []).concat([combat.player.playerLastHitType || "physical"]);
    const injuryLines = applyInjuriesFromDowns(state, downsIncludingWipeHit);
    const rescueMsg = dungeonRescue(state);
    return [...injuryLines, rescueMsg].join(" ");
  }
  state.flags.pendingDeathCause = "combat";
  return `Everything goes dark.`;
}

// Counterpart to checkDeathPrevention, for a lethal Trap room failure —
// traps resolve outside state.combat entirely (engine/dungeon.js), and
// every branch above unconditionally reads combat.xxx for its own
// per-fight "used" flag, so calling checkDeathPrevention there would
// throw. This only ever checks the one save that doesn't need a fight in
// progress: the Mugamiir Safor's dungeon rescue. Equipment/Regalia
// cheat-deaths (Elder Bark, Last Stand, ...) don't apply here — they're
// framed as combat saves, and have nowhere safe to store their per-fight
// flag without one.
function checkTrapDeathPrevention(state) {
  if (state.health > 0) return null;
  if (state.activeDungeon) return dungeonRescue(state);
  return null;
}

// Some enemy on-hit-taken passives (Quills-style reflect, Residual
// Memory-style counter — applyEnemyOnHitTakenPassives, called from deep
// inside rollPlayerDamage) deal damage straight to state.health with no
// checkDeathPrevention call of their own: rollPlayerDamage only ever
// returns a number, and every other silent side effect threaded through
// it (Soul Leech, Avatar of War's lifesteal, ...) only ever heals, so
// nothing there has ever needed one before. If that reflect alone was
// lethal, and the round's own retaliation afterward happens to miss or
// get evaded (every one of those branches returns out of
// resolveEnemyAttackOnPlayer before it ever reaches its own
// state.health <= 0 check), nothing else catches it — the fight would
// otherwise sit at 0 Health with combat still active, forever. Every
// action that can deal damage to an enemy (and so risk triggering one of
// these passives) calls this once, right before its own final return, as
// a last-resort net alongside the checks that already run inline
// wherever a hit is applied directly.
function checkReflectDeath(state, out) {
  if (state.health > 0) return out;
  // In combat, this now goes through resolvePlayerDefeatOrDowned (same as
  // every other lethal-hit call site) rather than checkDeathPrevention
  // directly, so a reflect/counter passive that lands the killing blow
  // can also knock the player down instead of ending the run outright —
  // and, if the player went down earlier THIS SAME action from a
  // different hit, correctly prints nothing a second time rather than a
  // redundant "Everything goes dark." Outside combat (a trap's own reflect-
  // style failure), there are no allies to fall back on, so
  // checkTrapDeathPrevention's plain solo handling is unchanged.
  const msg = state.combat ? resolvePlayerDefeatOrDowned(state) : (checkTrapDeathPrevention(state) || `Everything goes dark.`);
  if (msg) out.push(msg);
  return out;
}

// The Mugamiir Safor's guaranteed rescue (per Tyler): strips only what
// was gained THIS run (existing belongings are untouched), charges the
// guild's own fee on top, and wakes the player at an inn in the nearest
// city offering rest service — a real Dijkstra walk of the connections
// graph (engine/travel.js's findNearestLocation), not an assumption that
// every dungeon sits next to one. "Awaken" is read as a real night's
// rest, not a bare 1-HP cheat-death: free lodging, a full heal, and the
// same 8-hour time cost (and fatigue-clearing) as a normal night's sleep
// — the Safor's own fee is what's actually charged, not the room.
function dungeonRescue(state) {
  const dungeon = state.activeDungeon;
  for (const item of dungeon.lootGainedThisRun) {
    const idx = state.inventory.indexOf(item);
    if (idx >= 0) state.inventory.splice(idx, 1);
  }
  state.gold = Math.max(0, state.gold - dungeon.goldGainedThisRun);
  // First-pass, flagged as unverified during the handoff review — expect
  // a follow-up balance pass once this has actually been played.
  const fee = dungeon.difficulty * 50;
  state.gold = Math.max(0, state.gold - fee);
  const nearest = findNearestLocation(dungeon.entryLocation, (id, loc) => loc.isCity && effectiveServices(loc).includes("rest"));
  state.activeDungeon = null;
  // The player has just been physically pulled out of the dungeon, so
  // whatever fight was in progress ends here too — otherwise a second
  // pack member's retaliation later in this same round would find the
  // rescue already spent and the player un-saveable a second time. Every
  // loop that iterates multiple enemies/DOT ticks within one player action
  // already checks `!state.combat` as its stop condition for exactly this
  // reason (see resolveRemainingInitiativeActions, resolveSpeedInitiative,
  // tickPlayerStatuses, beginTurn).
  state.combat = null;
  state.health = state.maxHealth;
  advanceTime(state, 480, "dungeon rescue");
  state.lastSleptDay = state.day;
  if (nearest) {
    state.location = nearest.id;
    state.subLocation = null;
  }
  const townName = nearest ? LOCATIONS[nearest.id].name : "the nearest town";
  return `The Mugamiir Safor pull you from the dark, ${fee} gold poorer for it — you wake at an inn in ${townName}, everything you found down there left behind.`;
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
  // NaN <= 0 is false, so a NaN used to fall straight through to
  // `state.health -= NaN`. Refuse it loudly instead of corrupting the save.
  if (!Number.isFinite(dmg)) {
    console.error("Fragmenta: non-finite damage to player ignored", dmg);
    return [];
  }
  if (dmg <= 0) return [];
  const combat = state.combat;
  let remaining = dmg;
  const lines = [];
  if (combat && combat.player.tempHealth > 0) {
    const absorbed = Math.min(combat.player.tempHealth, remaining);
    combat.player.tempHealth -= absorbed;
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
    combat.player.wallsEndureDefStacks = Math.min(20, (combat.player.wallsEndureDefStacks || 0) + 1);
  }
  // Avatar of Endurance (Regalia of the Eternal Bastion 6pc): during its
  // 4-round window, every hit taken also grants +2 Attack/+2 Defense,
  // capped at +20/+20 for the window's duration — silent, the same
  // "roll/hit-time side effect with no narration channel" precedent Soul
  // Leech/Momentum/Blessing of Fortune's stack growth already established.
  if (combat && combat.player.avatarOfEnduranceTurns > 0) {
    combat.player.avatarOfEnduranceAtkBonus = Math.min(20, (combat.player.avatarOfEnduranceAtkBonus || 0) + 2);
    combat.player.avatarOfEnduranceDefBonus = Math.min(20, (combat.player.avatarOfEnduranceDefBonus || 0) + 2);
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
  const reduced = combat.player.damageReductionTurns > 0 ? Math.round(dmg * 0.75) : dmg;
  if (dmg > 0) {
    combat.player.unbrokenLineHitCount = (combat.player.unbrokenLineHitCount || 0) + 1;
    if (combat.player.unbrokenLineHitCount >= 3) {
      combat.player.unbrokenLineHitCount = 0;
      combat.player.damageReductionTurns = applyBeneficialEffectBonuses(state, 2);
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
// Scout level-15 "Branch" choice (engine/parser.js's cmdChoose sets
// state.flags.scoutStealthBranchUnlocked) — same "first enemy attack this
// fight only" shape as Guardian Spirit/Guided Footsteps just below, but a
// stat bonus rather than a miss override: the enemy's accuracy roll against
// the player is computed as if the player's Agility were temporarily +8,
// for that one roll only. Mutates combat.player.scoutStealthUsed as a side effect
// (mirrors combat.player.guardianSpiritUsed's check-and-consume pattern) so this
// is safe to call unconditionally at every resolveEnemyAttackOnPlayer call.
function scoutStealthOpeningBonus(state, combat) {
  if (!state.flags.scoutStealthBranchUnlocked || combat.player.scoutStealthUsed) return 0;
  combat.player.scoutStealthUsed = true;
  return 8;
}

// A Stun application against an enemy either lands (incrementing the
// shared per-enemy charge counter resolveEnemyAttackOnPlayer/
// resolveDregnarAction consume from, one at a time, per eligible action)
// or is negated by Unshaken Command (Dregnar Ashvein's First Sword's
// Regalia, DRA-E02) — two charges per combat, reset at combat start (see
// startCombat), stored on the CREATURE object itself (hasEffect's own
// wearer-neutral convention — any future wearer, not just Dregnar, gets
// this for free), not the enemy slot. Every Stun-inflicting source should
// route through this instead of writing combat.enemyStunCharges directly
// — today that's only the Force element ability, but a later source gets
// the same negation check with no extra wiring.
function tryApplyEnemyStun(state, creature) {
  // Lazy 2-charge default (undefined/null == "fresh, hasn't used any
  // charges this combat yet") rather than requiring an explicit reset
  // everywhere a wearer could come from: a BESTIARY enemy's creatureObj
  // is already rebuilt fresh every fight (so undefined correctly means
  // "2 available" each new combat with no extra wiring); startCombat's
  // existing per-combat ally/player reset block additionally clears this
  // back to null for the one kind of wearer that DOES persist across
  // fights, so a future ally/player wearer gets the same fresh-2 start.
  if (hasEffect(creature, "dra_e02_unshaken_command")) {
    const charges = creature.unshakenCommandCharges != null ? creature.unshakenCommandCharges : 2;
    if (charges > 0) {
      creature.unshakenCommandCharges = charges - 1;
      return [`Unshaken Command turns the Stun aside.`];
    }
  }
  activeEnemySlot(state.combat).enemyStunCharges = (activeEnemySlot(state.combat).enemyStunCharges || 0) + 1;
  return [];
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
  // Book the reversal on the record that actually owns `creature`, not
  // whoever happens to be active — the onKill path (an enemy finishing an
  // ally) isn't guaranteed to be the active enemy.
  const enemy = combat.enemies.find((e) => e.creatureObj === creature) || combat.enemies[combat.activeIndex];
  const turns = spec.turns || 1;
  for (const [key, raw] of Object.entries(spec)) {
    if (key === "turns" || typeof raw !== "number") continue;
    // `xPct` keys (Predator's Momentum, Endless Pursuit, Overclock, the
    // onActiveUse family) used to be added verbatim as a junk `atkPct`
    // field — the Attack bonus never happened. Convert to a flat amount of
    // the stat's current value, same convention as applyPermanentSelfBuff.
    const isPct = key.endsWith("Pct");
    const stat = isPct ? key.slice(0, -3) : key;
    const amount = isPct ? Math.round((creature[stat] || 0) * raw) : raw;
    if (!amount) continue;
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
  // abilityCooldowns was set (resolveEnemyActiveAbility) and read (its own
  // eligibility filter) but never counted back down anywhere — an active
  // ability, once used, stayed locked out for the rest of the fight
  // instead of recovering after its own authored cooldown. One tick per
  // round here, the same cadence selfBuffs above already ticks at.
  for (const id of Object.keys(e.abilityCooldowns || {})) {
    if (e.abilityCooldowns[id] > 0) e.abilityCooldowns[id] -= 1;
  }
  // Sure Foundation (DRA-E05): "expires after one full global turn if
  // unused" — ticked here, the same once-per-round cadence selfBuffs/
  // abilityCooldowns above already use, since the charge is granted by
  // whoever ATTACKS this creature (rollPlayerDamage), not by anything on
  // this creature's own turn, so it has no other natural tick point.
  if (creature.sureFoundationBonusDef && creature.sureFoundationBonusDefTurnsLeft > 0 && --creature.sureFoundationBonusDefTurnsLeft <= 0) {
    creature.sureFoundationBonusDef = 0;
  }
  if (!e.alive || e.maxHp <= 0) return lines;
  for (const pid of creature.passives || []) {
    const p = getEnemyAbility(pid);
    if (!p) continue;
    if (p.trigger === "regenPerTurn" && e.hp > 0 && e.hp < e.maxHp) {
      const heal = Math.max(1, Math.round(e.maxHp * p.pct));
      const healed = applyHealing(makeEnemyCombatant(state, e, state.combat.enemies.indexOf(e)), heal, "enemy_regen", { state });
      if (healed > 0) lines.push(`${withThe(creature.name, true)} recovers ${healed} health.`);
    } else if (p.trigger === "healthBelowPct" && !e.passiveOnceFlags[pid] && e.hp / e.maxHp <= p.threshold) {
      e.passiveOnceFlags[pid] = true;
      // Arena Ferocity/Veteran's Guard (Sanguivorum Criminal Underworld):
      // phrase their selfBuff as "for 2 turns" rather than the permanent
      // "for the encounter" every PRE-EXISTING healthBelowPct entry
      // (Cornered, Apex Predator, ...) uses — those omit `turns` entirely,
      // so they still resolve through applyPermanentSelfBuff exactly as
      // before; only a selfBuff carrying its own `turns` routes through
      // the reversible bookkeeping instead.
      if (p.selfBuff && p.selfBuff.turns) applyEnemySelfModifier(state.combat, creature, p.selfBuff);
      else applyPermanentSelfBuff(creature, p.selfBuff);
      lines.push(`${withThe(creature.name, true)} is hurt, and hits back harder for it.`);
    } else if (p.trigger === "whileAllyAlive") {
      // Pack Discipline/Criminal Command/Ruthless Authority (Sanguivorum
      // Criminal Underworld): a continuous, reversible conditional self-buff
      // — "while a summon/ally lives" toggles cleanly on and off as that
      // condition changes, unlike every other once-per-combat trigger
      // above. scope "summon" checks a specific summonKey (Pack
      // Discipline's own handler-summon-only condition); the default scope
      // reuses H11's bonusVsAllyAlive precedent — "any other alive,
      // non-friendly enemy counts as an ally," no species/group tag check.
      // Section Discipline/Command Discipline (Sanguivorum Imperial
      // Military, scope "division") / Marine Discipline (scope "family"):
      // two new scope values — "division" matches iff any OTHER alive
      // enemy shares this creature's own `division` BESTIARY tag
      // ("imperial_military"); "family" matches iff any other alive enemy
      // shares its own narrower `family` tag ("aqualis", ...). Same
      // reversible toggle-via-applyPermanentSelfBuff/negation shape as the
      // "summon"/default scopes above — just a different match condition.
      const flagKey = pid + ":active";
      const matches = p.scope === "summon"
        ? state.combat.enemies.some((x) => x.alive && x !== e && x.summonSourceKey === (p.summonKey || pid))
        : p.scope === "division"
        ? state.combat.enemies.some((x) => x.alive && x !== e && creature.division && x.creatureObj.division === creature.division)
        : p.scope === "family"
        ? state.combat.enemies.some((x) => x.alive && x !== e && creature.family && x.creatureObj.family === creature.family)
        : state.combat.enemies.some((x) => x.alive && x !== e && !x.creatureObj.friendly);
      const wasActive = !!e.passiveOnceFlags[flagKey];
      if (matches && !wasActive) {
        e.passiveOnceFlags[flagKey] = true;
        applyPermanentSelfBuff(creature, p.selfBuff);
      } else if (!matches && wasActive) {
        e.passiveOnceFlags[flagKey] = false;
        const negated = {};
        for (const [stat, amount] of Object.entries(p.selfBuff)) negated[stat] = -amount;
        applyPermanentSelfBuff(creature, negated);
      }
    } else if (p.trigger === "whileAlliesDiverse") {
      // Combined-Arms Authority (Arbitarius Commander, Sanguivorum
      // Imperial Military): a genuinely new passive trigger — matches iff
      // at least `minDistinct` DISTINCT `family` values are alive among
      // this creature's own `division` (counting the creature's own
      // family as one of them). Same reversible toggle shape as
      // whileAllyAlive just above, placed as a sibling branch in the same
      // per-round passive-upkeep loop.
      const flagKey = pid + ":active";
      const distinctFamilies = new Set(
        state.combat.enemies.filter((x) => x.alive && x.creatureObj.division === creature.division).map((x) => x.creatureObj.family)
      );
      const matches = distinctFamilies.size >= (p.minDistinct || 2);
      const wasActive = !!e.passiveOnceFlags[flagKey];
      if (matches && !wasActive) {
        e.passiveOnceFlags[flagKey] = true;
        applyPermanentSelfBuff(creature, p.selfBuff);
      } else if (!matches && wasActive) {
        e.passiveOnceFlags[flagKey] = false;
        const negated = {};
        for (const [stat, amount] of Object.entries(p.selfBuff)) negated[stat] = -amount;
        applyPermanentSelfBuff(creature, negated);
      }
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
            const healed = applyHealing(makeEnemyCombatant(state, e, state.combat.enemies.indexOf(e)), heal, "enemy_regen", { state });
            if (healed > 0) lines.push(`${withThe(creature.name, true)} recovers ${healed} health, its grove already at full strength.`);
          }
        } else {
          lines.push(...resolveEnemySummon(state, creature.level, p, pid, creature.name, creature));
        }
      }
    }
  }
  // ---- Sanguivorum Criminal Underworld item effects: per-round cooldown
  // ticks and HP-threshold reactions. Unlike the passives loop above,
  // these key off hasEffect(creature, ...) directly (an equipped item, not
  // a creature.passives entry) — same wearer-neutral convention as
  // guarded_strike/brace already use elsewhere in this file.
  if (creature.smugglersGuardCooldown > 0) creature.smugglersGuardCooldown -= 1;
  if (creature.tyrantsEdgeCooldown > 0) creature.tyrantsEdgeCooldown -= 1;
  // Duelist's Bulwark/Champion's Poise (shared repeatableMitigation*
  // fields, Sanguivorum Security and Enforcement / Independent Armed
  // Groups) / Arena Riposte (intrinsic, Security and Enforcement) / Arena
  // Counter (intrinsic, Independent Armed Groups — shares Arena Riposte's
  // own arenaRiposteCooldown/arenaRiposteUsesThisCombat field pair, a
  // per-creature-instance mechanism, never cross-contaminating a
  // DIFFERENT creature that also happens to carry a counterOnSuccessfulHit
  // passive) — all their own CD4 cooldowns, same once-per-round tick as
  // the two lines above.
  if (creature.repeatableMitigationCooldown > 0) creature.repeatableMitigationCooldown -= 1;
  if (creature.arenaRiposteCooldown > 0) creature.arenaRiposteCooldown -= 1;
  // Enemy-side Ally Protection Reaction mirror (enemyAllyProtectionMultiplier
  // above) — same CD5 tick cadence as the player-side version's own
  // allyProtectionCooldown decrement (resolveSpeedInitiative/beginTurn).
  if (creature.allyProtectionCooldown > 0) creature.allyProtectionCooldown -= 1;
  // Prepare Ballista's banked state (lives on the enemy RECORD, `e` —
  // see resolveEnemyAction/resolveEnemyActiveAbility) and Calculated
  // Preparation's banked ACC bonus (lives on `creature`, same convention
  // as sureFoundationBonusDef above) — both Sanguivorum Imperial
  // Military — decay by one of the wearer's own rounds per tick, same
  // once-per-round cadence as every other countdown in this function.
  if (e.ballistaPreparedTurnsLeft > 0) e.ballistaPreparedTurnsLeft -= 1;
  if (creature.bankedAttackAccBonusTurnsLeft > 0 && --creature.bankedAttackAccBonusTurnsLeft <= 0) {
    creature.bankedAttackAccBonus = 0;
    // Silent Preparation's dmgMultBonus (Sanguivorum Independent Armed
    // Groups) decays alongside the ACC bonus it was banked with — same
    // single countdown, not a separate one.
    creature.bankedAttackDmgMultBonus = 0;
  }
  if (hasEffect(creature, "sang_cu_ie008_handlers_resilience") && !creature.handlersResilienceUsed && e.hp / e.maxHp <= 0.5) {
    creature.handlersResilienceUsed = true;
    applyEnemySelfModifier(state.combat, creature, { def: 5, turns: 2 });
    lines.push(`${withThe(creature.name, true)} grits through the pain, armor tightening.`);
  }
  if (hasEffect(creature, "sang_cu_ie013_conquerors_resolve") && !creature.conquerorsResolveUsed && e.hp / e.maxHp <= 0.35) {
    creature.conquerorsResolveUsed = true;
    applyEnemySelfModifier(state.combat, creature, { atkPct: 0.10, turns: 2 });
    lines.push(`${withThe(creature.name, true)} fights on, all the harder for the wound.`);
  }
  return lines;
}

// Riposte: a free follow-up hit whenever the enemy's retaliation dealt
// zero damage (stunned, evaded, Decoy, or reduced to 0 by defense). Called
// by every action that either goes through resolveEnemyAttackOnPlayer (when
// its returned damage is 0) or otherwise guarantees a damage-free counter
// (Decoy, which doesn't call resolveEnemyAttackOnPlayer at all). White
// Watch's 4pc set bonus raises the multiplier from 0.5x to 0.75x; its 6pc
// grants a stacking +2 Defense for the rest of the fight each time this fires.
// Step 1f-iii §4 (found while scoping audit rule P1, after 1f-iv): this
// is the "maybeRiposte" the handoff's own reaction list names alongside
// riposteCounterOnPlayer/riposteCounterByAllyOnEnemy/riposteCounterByEnemyOnAlly/
// arenaRiposteCounterOnPlayer -- the PLAYER's own Riposte gear, countering
// the ENEMY, the one direction the rest of 1f-iii's work never touched.
// Eligibility ("does the player even have Riposte, is the target already
// dead") stays outside the pipeline, same as every other reaction's own
// wrapper; the actual roll/damage/kill now runs through
// resolveRiposteCounterPlayer, steps 2-5.
function maybeRiposte(state, creature) {
  if (!hasEffect(state, "riposte")) return [];
  if (!state.combat || activeEnemySlot(state.combat).hp <= 0) return [];
  return resolveRiposteCounterPlayer(state, creature);
}

// Generalized Riposte, for an enemy or ally wearer: the same "a free 0.5x
// follow-up when the incoming hit deals zero damage" idea as maybeRiposte
// above, mirrored at the three places a non-player wearer's own attacker
// can land a zero-damage hit (a miss) on it — called right at each of
// those miss branches rather than through a shared "retaliation dealt 0"
// signal, since enemies/allies have no equivalent compound retaliation
// call for that signal to live in. No Clash of Steel/White Watch
// widening — both are player-only Regalia systems.
//
// Non-player trigger cap (G5B8-EQ-REG-01 follow-up, Enemy-Design-approved
// Option C): a floor party generates far more miss-events per fight than
// a single attacker does, so an uncapped non-player Riposte scales with
// party size rather than fight length — confirmed severe on at least one
// natural carrier (Naqari Section Leader). Capped at once per round
// (riposteUsedThisRound, reset in resolveSpeedInitiative alongside
// counterGuardUsedThisRound/actedEarlyThisRound) AND twice total per
// combat (riposteUsesThisCombat, never reset mid-fight — a fresh
// creature/ally record every combat already gives it a clean slate).
// The damage formula and eligible triggers below are byte-for-byte
// unchanged from before this cap existed; this only gates whether a
// non-player wearer's reaction fires THIS instance. The player's own
// Riposte (maybeRiposte above) is untouched — uncapped, as before.
function nonPlayerRiposteCapAllows(wearer) {
  if (!wearer) return false;
  if (wearer.riposteUsedThisRound) return false;
  if ((wearer.riposteUsesThisCombat || 0) >= 2) return false;
  return true;
}
function markNonPlayerRiposteFired(wearer) {
  wearer.riposteUsedThisRound = true;
  wearer.riposteUsesThisCombat = (wearer.riposteUsesThisCombat || 0) + 1;
}
// Riposte, generalized, for the enemy wearer whose own retaliation the
// PLAYER'S attack just missed -- reached today from basic_attack's own
// declared missLine (js/data/actions.js's PLAYER_ACTION_DEFS.basic_
// attack), never hardcoded into rollToHitPlayerActor itself. Step 1f-iii
// §4: the actual counter-strike now runs through steps 2-5, target
// fixed to the attacker (the player) -- resolveRiposteCounterOnPlayer,
// pipeline.js. Eligibility/cap bookkeeping stays here, outside the
// pipeline, matching every other reaction's own pre-check.
function riposteCounterOnPlayer(state, creature) {
  if (!hasEffect(creature, "riposte") || !state.combat || activeEnemySlot(state.combat).hp <= 0) return [];
  if (!nonPlayerRiposteCapAllows(creature)) return [];
  markNonPlayerRiposteFired(creature);
  return resolveRiposteCounterOnPlayer(state, creature);
}
// Arena Riposte (Ovum Veteran Guard, Sanguivorum Security and
// Enforcement) — a genuinely new mechanism, the OPPOSITE trigger
// condition of riposteCounterOnPlayer just above (which fires on a MISS):
// "on a damaging hit landed against the wearer BY THE PLAYER, 0.8x the
// wearer's own Attack as a counter-strike back at the player; CD4 wearer
// turns, max twice per combat; no recursive reactions." Modeled closely
// on riposteCounterOnPlayer — same effectiveEnemyAtk/effectivePlayerDef/
// mitigate/mitigateAndApplyHitOnPlayer/resolvePlayerDefeatOrDowned helper
// calls, and the same randInt(atk-1, atk+2) damage-roll shape — but
// hooked into playerAttack's SUCCESSFUL-hit branch instead of the miss
// branch, and gated by its OWN independent cooldown/cap pair
// (arenaRiposteCooldown/arenaRiposteUsesThisCombat) rather than
// riposteUsedThisRound/riposteUsesThisCombat, which belong to the
// unrelated miss-triggered Riposte mechanic above — reusing those would
// double-gate (or cross-contaminate caps) for a creature that somehow had
// both. Arena Riposte is an INTRINSIC ability (creature.passives), not an
// item effect, so it's gated the same way checkCounteringGuard's own
// "counterOnHit" passive lookup is (creature.passives.map(getEnemyAbility)
// .find(...)), NOT via hasEffect() (which only ever reads *equipped item*
// effects — see hasEffect's own definition in data/effects.js). "No
// recursive reactions" holds for free from where this is called
// (playerAttack's own successful-hit branch, never re-entered by anything
// this function itself does): the counter-strike below only ever calls
// mitigateAndApplyHitOnPlayer/resolvePlayerDefeatOrDowned against the
// PLAYER, nothing that could trigger Arena Riposte again.
function hasArenaRiposteAbility(creature) {
  return (creature.passives || []).some((pid) => {
    const p = getEnemyAbility(pid);
    return p && p.trigger === "counterOnSuccessfulHit";
  });
}
// Step 1f-iii §4: the actual counter-strike now runs through steps 2-5,
// target fixed to the player -- resolveArenaRiposteCounterOnPlayer
// (pipeline.js). Eligibility/cooldown/cap bookkeeping, and the passive's
// own declared multiplier, stay here, outside the pipeline.
function arenaRiposteCounterOnPlayer(state, creature) {
  if (!hasArenaRiposteAbility(creature)) return [];
  if (!state.combat || activeEnemySlot(state.combat).hp <= 0) return [];
  const cooldown = creature.arenaRiposteCooldown || 0;
  const uses = creature.arenaRiposteUsesThisCombat || 0;
  if (cooldown > 0 || uses >= 2) return [];
  creature.arenaRiposteCooldown = 4;
  creature.arenaRiposteUsesThisCombat = uses + 1;
  const passive = (creature.passives || []).map(getEnemyAbility).find((p) => p && p.trigger === "counterOnSuccessfulHit");
  return resolveArenaRiposteCounterOnPlayer(state, creature, passive.mult || 0.8);
}
// Wearer = the ENEMY an ally's attack just missed (target, not the ally) —
// the enemy counters the ally. Called from rollToHitAllyActor's own miss
// branches (step 1f-iii §4: through steps 2-5, target fixed to the
// ally -- resolveRiposteCounterByEnemyOnAlly, pipeline.js). Eligibility/
// cap bookkeeping stays here, outside the pipeline.
function riposteCounterByEnemyOnAlly(state, target, ally) {
  if (!target || !target.alive || !hasEffect(target.creatureObj, "riposte")) return [];
  if (!nonPlayerRiposteCapAllows(target.creatureObj)) return [];
  markNonPlayerRiposteFired(target.creatureObj);
  return resolveRiposteCounterByEnemyOnAlly(state, target, ally);
}
// Wearer = the ALLY an enemy's attack just missed — the ally counters the
// enemy. Called from rollToHitAllyActor's own miss branch (step 1f-iii
// §4: through steps 2-5, target fixed to the attacker --
// resolveRiposteCounterByAllyOnEnemy, pipeline.js). Eligibility/cap
// bookkeeping stays here, outside the pipeline, matching every other
// reaction's own pre-check (maybeCompanionRetaliate's own shape).
function riposteCounterByAllyOnEnemy(state, ally, enemySlot) {
  if (!enemySlot || !enemySlot.alive || !hasEffect(ally, "riposte")) return [];
  if (!nonPlayerRiposteCapAllows(ally)) return [];
  markNonPlayerRiposteFired(ally);
  return resolveRiposteCounterByAllyOnEnemy(state, ally, enemySlot);
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
    const atkStacks = combat.player.everyChoiceAtkStacks || 0;
    if (atkStacks < 5) {
      combat.player.everyChoiceAtkStacks = atkStacks + 1;
      combat.player.everyChoiceMagicStacks = (combat.player.everyChoiceMagicStacks || 0) + 1;
      // v0.11 PLAYER_STAT_SCALE: each stack is worth 2 Attack/Magic by
      // design (the *2 below, unchanged) — that design total is then
      // itself folded into effectivePlayerAtk/effectiveMagic's own
      // flatStat()'d sum, so the real grant is PLAYER_STAT_SCALE x bigger
      // again on top of the per-stack "2."
      lines.push(`Every Choice Matters — the near miss sharpens you; +${flatStat(2)} Attack, +${flatStat(2)} Magic (now +${flatStat((atkStacks + 1) * 2)}/+${flatStat((atkStacks + 1) * 2)}).`);
    }
  }
  if (hasSetTier(state, "Regalia of the Woven Thread", 4) && !combat.player.threadsOfConsequencePending) {
    combat.player.threadsOfConsequencePending = true;
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
  if (APOTHECARY_ABILITIES[key]) return APOTHECARY_ABILITIES[key].name;
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
  if (hasEffect(state, "unlikely_outcome") && !combat.player.unlikelyOutcomeGuaranteedCrit) {
    combat.player.unlikelyOutcomeGuaranteedCrit = true;
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
  if (classHasApothecary(state)) {
    return unlockedApothecaryAbilities(state)
      .filter((id) => apothecaryAbilityAvailable(state, id))
      .map((id) => APOTHECARY_ABILITIES[id].name.toLowerCase());
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
  if (tacticId === "disarm" && activeEnemySlot(state.combat).disarmed && !bypass) return false;
  return (state.combat.cooldowns[tacticId] || 0) <= 0;
}

function apothecaryAbilityAvailable(state, key) {
  if (!state.combat) return false;
  const a = APOTHECARY_ABILITIES[key];
  const bypass = activationRestrictionsBypassed(state);
  if (state.knowledge < a.knowledgeReq && !bypass) return false;
  return (state.combat.cooldowns[key] || 0) <= 0;
}

// Attendant's Instinct / Self-Reliant (level-15 Apothecary branch,
// parser.js's cmdChoose "pendingApothecaryLevel15Choice" resolution):
// a flat +20% multiplier on the amount a stat-buff ability grants — mutual
// opposites, each scoped to the target the other one excludes. Attendant's
// Instinct only when cast on an ally (never self); Self-Reliant only when
// self-cast (never an ally). Never both — cmdChoose only ever sets one flag.
function apothecaryPotencyMultiplier(state, isSelfCast) {
  if (state.flags.apothecaryAttendantInstinct && !isSelfCast) return 1.2;
  if (state.flags.apothecarySelfReliant && isSelfCast) return 1.2;
  return 1;
}

function elementAbilityAvailable(state, elementKey) {
  if (!state.combat) return false;
  const a = ELEMENT_ABILITIES[elementKey];
  const bypass = activationRestrictionsBypassed(state);
  if (state.knowledge < a.knowledgeReq && !bypass) return false;
  if (elementKey === "acid" && activeEnemySlot(state.combat).corroded && !bypass) return false;
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

// Structured {label, command} pairs for the combat menu (main.js renders
// one button per entry) — command is the exact same string handleInput()
// already accepts from typed input, so no parser/combat/state changes are
// needed here at all. Mirrors tacticsLine()'s own availability logic
// exactly, just returned as data instead of joined into a hint string.
//
// Drilled down across stages rather than one flat list — main.js tracks
// which stage the player is currently browsing (combatStage) and passes it
// in; combat.js only ever needs to know WHAT belongs in each stage, not how
// the player got there or navigates back (main.js's own "Back" button is
// pure UI, not a real command, so it's added there instead of here — same
// split shop.js/main.js already use for the buy-quantity Cancel button).
// A returned option with no `command` (only `nextStage`) is a pure UI
// transition; one with a `command` and no explicit `nextStage` resolves a
// real round and returns to "top" for the next one (main.js's default).
function buildCombatMenu(state, stage) {
  if (!state.combat) return [];

  const creature = getCombatCreature(state);
  const options = [];

  // A pending one-time choice (parser.js's buildChoiceMenu — e.g.
  // leveling to 15 off the kill that started this very fight) is
  // prepended rather than replacing the fight's own options: "choose" is
  // explicitly allowed mid-combat (handleInput's own combat-priority
  // whitelist), and nothing about it forces resolution before the next
  // attack — so don't strand the player behind a hidden input with no
  // way to answer it, but don't block Fight/Flee on it either. Prepended
  // regardless of stage, for the same reason.
  const pendingChoice = buildChoiceMenu(state);
  if (pendingChoice) options.push(...pendingChoice);

  // Friendly (non-hostile) encounters get their own two-option menu —
  // same branch handleInput() already special-cases. No staging here;
  // there's nothing to drill into.
  if (creature.friendly) {
    options.push({ label: "Talk", command: "talk" });
    options.push({ label: "Leave", command: "leave" });
    return options;
  }

  // "target <name>" only actually offers a choice with more than one
  // enemy still up — with just one, Fight skips straight to picking an
  // attack instead of making the player confirm a target of one.
  const hasChoiceOfTarget = aliveEnemies(state).length > 1;

  if (stage === "target") {
    aliveEnemies(state).forEach((e) => {
      options.push({
        label: `${e.creatureObj.name} (${e.hp}/${e.maxHp} HP)`,
        command: `target ${e.creatureObj.name}`,
        nextStage: "attack",
      });
    });
    return options;
  }

  if (stage === "attack") {
    options.push({ label: "Attack", command: "fight" });
    // Tactics / element abilities — identical source list and identical
    // availability check as availableActionNames()/tacticAvailable(). The
    // typed verb for a mage ability is the ability's own NAME (handleInput
    // resolves it through ELEMENT_VERB_TO_KEY), not the element key itself.
    if (state.flags.isMage) {
      [state.primaryElement, state.secondaryElement]
        .filter(Boolean)
        .filter((el) => elementAbilityAvailable(state, el))
        .forEach((el) => {
          const ability = ELEMENT_ABILITIES[el];
          options.push({ label: ability.name, command: ability.name.toLowerCase() });
        });
    } else if (classHasApothecary(state)) {
      // Self-only when the fight has no living ally (skips the target
      // picker entirely, same one-click flow Fortify always had); with an
      // ally up, the button navigates to "apothecary_target:<key>" instead
      // of running a command directly.
      const hasAllies = aliveAllies(state).length > 0;
      unlockedApothecaryAbilities(state)
        .filter((id) => apothecaryAbilityAvailable(state, id))
        .forEach((id) => {
          const a = APOTHECARY_ABILITIES[id];
          if (hasAllies) options.push({ label: a.name, nextStage: `apothecary_target:${id}` });
          else options.push({ label: a.name, command: a.name.toLowerCase() });
        });
    } else {
      unlockedTactics(state)
        .filter((id) => tacticAvailable(state, id))
        .forEach((id) => {
          options.push({ label: TACTICS[id].name, command: id });
        });
    }
    return options;
  }

  if (stage === "item") {
    // One button per distinct usable consumable, since bare "use" with no
    // argument just answers "Use what?" (useItem's own first check)
    // rather than doing anything on its own.
    const usableCounts = new Map();
    for (const item of state.inventory) {
      const def = getItemDef(item);
      if (def && def.slot === "consumable") usableCounts.set(item, (usableCounts.get(item) || 0) + 1);
    }
    for (const [item, count] of usableCounts) {
      options.push({
        label: count > 1 ? `${item} (x${count})` : item,
        command: `use ${item}`,
      });
    }
    return options;
  }

  // Apothecary ability target picker — only reached when the "attack"
  // stage found a living ally to offer (otherwise the ability button runs
  // self-cast directly, no sub-stage at all). "Back" from here returns to
  // "attack" (see main.js's renderCombatMenu), not the top level.
  if (stage.startsWith("apothecary_target:")) {
    const a = APOTHECARY_ABILITIES[stage.slice("apothecary_target:".length)];
    if (!a) return [];
    options.push({ label: "Yourself", command: a.name.toLowerCase() });
    aliveAllies(state).forEach((ally) => {
      options.push({ label: ally.name, command: `${a.name.toLowerCase()} on ${ally.name}` });
    });
    return options;
  }

  // Top level: just the three-way decision the player actually has to
  // make each round. Fight/Use Item are pure navigation (no command —
  // main.js just switches stage); Flee resolves immediately, same as ever.
  options.push({ label: "Fight", nextStage: hasChoiceOfTarget ? "target" : "attack" });
  options.push({ label: "Use Item", nextStage: "item", disabled: !hasUsableConsumable(state) });
  options.push({ label: "Flee", command: "flee" });

  return options;
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
// bestiaryId (optional) stamps the resulting creature with its own real
// BESTIARY key as `bestiaryKey` — the template/computeCreatureStats
// spread below carries no species identity of its own (BESTIARY entries
// have no `id` field; that's purely the object key), so this is the one
// place a kill-resolution check (engine/jobs.js's checkJobProgressOnKill,
// for Hunt/Track bounties) can reliably learn "which species was this."
// Enemy equipment (BESTIARY `equipment` — a flat { slot: itemName } map,
// same shape as the player's own state.equipment) or `equipmentBands`
// (Criminal Underworld/Independent Armed Groups codices, Gate 5B.8 — a
// single identity whose gear changes at specific level thresholds, e.g.
// Bandit Cutthroat/Caravan Sellsword's V1/V2/V3, each entry's `maxLevel`
// the top of its band): resolved once per fight-build, below, into a flat
// per-stat bonus added on top of the level-scaled "unequipped" stats
// computeCreatureStats already produced — mirrors items.js's own
// equipmentBonus() for the player, just reading a creature's own gear
// instead of state.equipment. Knowledge bonuses are summed and stored
// (creatureObj.equipmentKnowledge) but never added to any live stat —
// these creatures have no Knowledge stat in this engine at all (the
// codices' own "tracked separately" caveat). Named/triggered wearer
// effects (Brace, Riposte, Feinting Edge, Heatproof, Stalwart,
// Surefooted, Guarded Strike, Opening Reach, Merchant's Eye, Tactical
// Memory, Executioner, ...) are NOT applied — every one of those effects
// is currently checked via hasEffect(state, id) against the PLAYER's own
// equipment only; there's no engine hook for an enemy to carry one. Left
// declared-but-inert, consistent with this codebase's existing
// inert-effect convention, pending that future engine work.
function resolveEnemyEquipment(template, level) {
  if (template.equipmentBands) {
    const band = template.equipmentBands.find((b) => level <= b.maxLevel) || template.equipmentBands[template.equipmentBands.length - 1];
    return band.equipment;
  }
  return template.equipment || null;
}
function enemyEquipmentBonus(equipment, statKey) {
  if (!equipment) return 0;
  let total = 0;
  for (const value of Object.values(equipment)) {
    for (const item of [].concat(value || [])) {
      const def = ITEM_DEFS[item];
      if (def && def.bonuses && def.bonuses[statKey]) total += def.bonuses[statKey];
    }
  }
  return total;
}
function buildFightCreature(template, level, dangerClassOverride, bestiaryId) {
  const clampedLevel = clampLevelToRarityBand(level, template.spawnRarity, template.levelBandExempt);
  const effectiveTemplate = dangerClassOverride ? Object.assign({}, template, { dangerClass: dangerClassOverride }) : template;
  const scaled = computeCreatureStats(effectiveTemplate, clampedLevel);
  const equipment = resolveEnemyEquipment(effectiveTemplate, clampedLevel);
  if (equipment) {
    // v0.11: enemy gear goes through the same PLAYER_STAT_SCALE a player
    // wearing that item gets — the item is worth the same either way.
    scaled.hp += scaledStat("health", enemyEquipmentBonus(equipment, "health"));
    scaled.atk += scaledStat("atk", enemyEquipmentBonus(equipment, "atk"));
    scaled.def += scaledStat("def", enemyEquipmentBonus(equipment, "def"));
    // Sanguivorum Criminal Underworld: the first enemy-equipment batch to
    // actually carry Accuracy/Agility bonuses (Softstep Boots +2 AGI,
    // Spotter's Lens +2 ACC, ...) — every prior division's enemy gear only
    // ever granted health/atk/def (+ the always-inert knowledge below), so
    // this was never wired. Bonus KEY is "accuracy"/"agility" (full word)
    // — the same key items.js's equipmentBonus() reads for the player's
    // and allies' own accuracy/agility (state.js) — even though the
    // computed creature stat it feeds lands in the abbreviated scaled.acc/
    // scaled.agi fields below, matching computeCreatureStats' own naming.
    // scaledStat leaves both unscaled (SCALED_COMBAT_STATS doesn't list
    // them), so this is a pure additive extension — any existing
    // creature's equipment with no accuracy/agility bonus field
    // contributes 0 here, unchanged.
    scaled.acc += scaledStat("acc", enemyEquipmentBonus(equipment, "accuracy"));
    scaled.agi += scaledStat("agi", enemyEquipmentBonus(equipment, "agility"));
  }
  const creature = Object.assign({}, effectiveTemplate, scaled, { level: clampedLevel, bestiaryKey: bestiaryId });
  if (equipment) {
    creature.equipment = equipment;
    creature.equipmentKnowledge = enemyEquipmentBonus(equipment, "knowledge");
  }
  // Veteran Discipline (Ferratum Veteran, Sanguivorum Imperial Military):
  // "constant +5 Defense while alive — no trigger, cooldown, or expiry."
  // No existing convention in this file expresses a flat, untriggered
  // passive stat bonus (every other passives entry is read either
  // per-action via firstAttackPassiveBonus/resolveEnemyActiveAbility, or
  // per-round via tickEnemyPassives) — this adds one, a minimal
  // `flatStatBonus` trigger applied once right here at creature-build
  // time, the same place equipment bonuses are folded in just above, so
  // it is never re-applied or double-counted.
  for (const pid of creature.passives || []) {
    const p = getEnemyAbility(pid);
    if (p && p.trigger === "flatStatBonus" && p.stat) {
      creature[p.stat] = (creature[p.stat] || 0) + (p.amount || 0);
    }
  }
  return creature;
}

// v0.11: hand-built creatures that skip computeCreatureStats (arena
// gladiators, the Champion, quest bosses like the Salahru Revenant, the
// Kabal Enforcer patrol) were all authored against the OLD player stat
// scale — bring their Health/Attack/Defense/Magic up by the same
// PLAYER_STAT_SCALE the player got, so they stay the fight they were
// written to be. A creature built through computeCreatureStats already
// lives on the new scale and sets `statScaled: true` (generateEnemyMage).
function legacyScaledCreature(creature) {
  if (!creature || creature.statScaled) return creature;
  const out = Object.assign({}, creature, { statScaled: true });
  // Equipment bonuses (Dregnar Ashvein Stage B): ordinary creatures get
  // this through buildFightCreature's own resolveEnemyEquipment/
  // enemyEquipmentBonus call below; this path (special:true/dynamic
  // creatures) never has before, since no existing special:true creature
  // carries an `equipment` field — gated purely on its presence, so every
  // other creature through this path (Kabal Enforcer, Vaelorn, any
  // dynamic creature) is unaffected. Resolved and folded in BEFORE the
  // flat x2 scale below, same order buildFightCreature already uses, and
  // extended to magic/accuracy/agility too — buildFightCreature only ever
  // sums health/atk/def, since no ordinary creature's gear has ever
  // carried a magic/accuracy/agility bonus; Dregnar's own items are the
  // first to, so this is additive, not a behavior change for anyone else.
  const equipment = creature.equipment || null;
  if (equipment) {
    out.hp = (out.hp || 0) + enemyEquipmentBonus(equipment, "health");
    out.atk = (out.atk || 0) + enemyEquipmentBonus(equipment, "atk");
    out.def = (out.def || 0) + enemyEquipmentBonus(equipment, "def");
    out.magic = (out.magic || 0) + enemyEquipmentBonus(equipment, "magic");
    out.acc = (out.acc || 0) + enemyEquipmentBonus(equipment, "accuracy");
    out.agi = (out.agi || 0) + enemyEquipmentBonus(equipment, "agility");
  }
  for (const key of ["hp", "atk", "def", "magic"]) {
    if (typeof out[key] === "number") out[key] = Math.round(out[key] * PLAYER_STAT_SCALE);
  }
  // Phase 0 hotfix: a special:true creature's own level/Danger Class were
  // previously absent entirely, so flee chance/XP/loot/notable-kill effects
  // all silently fell back to "a Normal at the player's own level" against
  // it. encounterLevel is purely a metadata field read by those consumers —
  // this path still skips computeCreatureStats, so the flat x2 scale above
  // stays exactly as it was; dangerClass is likewise never routed into
  // stats here, only read downstream by the consumers it was missing from.
  if (typeof creature.encounterLevel === "number") out.level = creature.encounterLevel;
  return out;
}

function startCombat(state, creatureIdOrObject, preRolledLevel) {
  // Per-combat ally flags: allies live on state.party, persistent across
  // fights (unlike an enemy's creatureObj, rebuilt fresh every encounter
  // below) — anything meant to gate "once per fight" on an ally has to be
  // explicitly reset here, or it silently becomes "once ever" instead.
  // riposteUsedThisRound/riposteUsesThisCombat (generalized Riposte's
  // non-player trigger cap) are new; tacticalMemoryUsed (companion.js's
  // Hadrian-kit cooldown hook) already existed and had exactly this gap —
  // fixed here too, since it's the identical bug, not a separate one.
  (state.party || []).forEach((a) => { a.riposteUsedThisRound = false; a.riposteUsesThisCombat = 0; a.tacticalMemoryUsed = false; a.unshakenCommandCharges = null; a.allyProtectionCooldown = 0; a.allyProtectionUsesThisCombat = 0; });
  state.unshakenCommandCharges = null; // Unshaken Command (DRA-E02): a future player wearer gets the same fresh-2-per-combat reset an enemy's freshly-built creatureObj gets implicitly
  state.allyProtectionCooldown = 0; // Ally Protection Reaction (Sanguivorum Gatekeeper's Stand/Protective Intercession/Officer's Intercession): same fresh-combat reset for a future player wearer
  state.allyProtectionUsesThisCombat = 0;
  state.playerDowned = false; // resolvePlayerDefeatOrDowned's own flag — every new fight starts with the player able to act, same as every other per-combat flag here
  const isDynamic = typeof creatureIdOrObject === "object";
  if (isDynamic) creatureIdOrObject = legacyScaledCreature(creatureIdOrObject);
  const template = isDynamic ? creatureIdOrObject : BESTIARY[creatureIdOrObject].special ? legacyScaledCreature(BESTIARY[creatureIdOrObject]) : BESTIARY[creatureIdOrObject];
  // Quest/job-tied encounters (BESTIARY's `special` flag — e.g. Kabal
  // Enforcer patrols) and already-fully-generated dynamic creatures
  // (enemy mages) are exempt from the level roll and stat scaling below,
  // per the design's stated exception, AND from pack/squad grouping —
  // both spawn exactly one creature, same as before multi-enemy fights
  // existed. The clone means the shared BESTIARY dict entry itself is
  // never mutated between fights.
  // Loot Reachability Fixes v2.1: a `special` creature (Dregnar Ashvein,
  // the Kabal Enforcer patrol, ...) skips buildFightCreature entirely —
  // the one place that normally stamps `bestiaryKey` — so it never
  // carried one at all. Stamped here instead, straight onto this fresh
  // legacyScaledCreature() instance (never the shared BESTIARY entry),
  // so the "enemy.killed" defeated-flag listener (and checkJobProgressOnKill,
  // which reads the same field for Hunt/Track bounties) can actually see
  // which species this was, same as every non-special creature already can.
  if (!isDynamic && template.special) template.bestiaryKey = creatureIdOrObject;
  let roster;
  if (isDynamic || template.special) {
    roster = [{ id: isDynamic ? creatureIdOrObject : creatureIdOrObject, creature: template, dynamicCreature: isDynamic }];
  } else {
    // Every packmate shares the anchor's rolled level (see
    // rollEncounterGroup) — buildFightCreature still clamps each one to
    // its OWN species' Spawn Rarity band, so a Common packmate spawning
    // alongside a Rare leader doesn't scale past what Common ever allows.
    const rolled = preRolledLevel != null ? preRolledLevel : rollEncounterLevel(state.level);
    roster = rollEncounterGroup(creatureIdOrObject, rolled, state.level).map((member) => ({ // v0.11c: group size capped by player level band
      id: member.id,
      creature: buildFightCreature(BESTIARY[member.id], rolled, member.dangerClass, member.id),
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
    actedEarlyThisRound: false, // set by resolveSpeedInitiative; cleared (and read) by resolveRemainingInitiativeActions so this creature doesn't get a second slot this round
    counterGuardUsedThisRound: false, // H06 Countering Guard's own once-per-round gate — see checkCounteringGuard
    disarmed: false, // whether Disarm has already landed on this target
    corroded: false, // whether Corrode has already landed on this target
    enemyAtkPenalty: 0, // lasting attack reduction from Disarm
    enemyDefPenalty: 0, // lasting defense reduction from Corrode
    enemyStunCharges: 0, // set (incremented) by Concuss, consumed one at a time per eligible action — see resolveEnemyAttackOnPlayer and resolveDregnarAction
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
    // Crafted-potion buffs (data/recipes.js/schematics.js output items'
    // useEffect.type "buff") — see playerBuffStatTotal/tickPlayerBuffs
    // above. Keyed by stat, one entry per stat.
    playerBuffs: {},
    naturesPersistenceUsed: false, // gates Nature's Persistence's (Regalia) first-crowd-control-free per fight
    unbreakableUsed: false, // gates Unbreakable's (Legendary) first-Defense-reduction-ignored per fight
    mercyOfTheVeilUsed: false, // gates Mercy of the Veil's (Regalia of the Final Veil 4pc) below-40%-HP cleanse-all
    orderedMindDefStacks: 0, // Ordered Mind's (Regalia) +2 Defense per resisted/ignored status, capped at 12
    calmWatersDefBonus: 0, // Calm Waters' (Regalia) +4 Defense per Cleansing Current proc, capped at 12
    calmWatersMagicBonus: 0, // Calm Waters' +4 Magic per Cleansing Current proc, capped at 12
    calmWatersTurns: 0, // Calm Waters' 2-round window remaining
    // Injury System v0.2: every down the PLAYER survives this fight,
    // in order — one entry (a damage type string) per down, consumed by
    // applyInjuriesFromDowns at whichever "the player survived this
    // fight" exit point actually ends it (resolveKill's victory branch,
    // attemptFlee's success branch, or — O1 — a Mugamiir dungeon rescue
    // from either resolvePlayerDefeatOrDowned's or killAlly's own party-
    // wipe branch). Its own .length IS "pendingDowns" from the spec —
    // there's no separate counter to keep in sync.
    downs: [],
    // Whatever last actually dealt damage to the PLAYER this fight —
    // "physical"/"bleed"/a real ELEMENTS key — set at every call site
    // that lands a hit on the player (mirrors combat.lastDamageType just
    // above, which tracks the opposite direction). Read by
    // resolvePlayerDefeatOrDowned the moment a hit downs the player, to
    // pick the down's injury group (§5).
    playerLastHitType: null,
  };
  // Step 1h-iii: the player's own combat state, same shape as every
  // other state.combat key (enemies, activeIndex, ...) now that nothing
  // reads any of the 130 PLAYER_FIELDS entries off the flat
  // combat.<field> spelling anymore -- the backward-compatible proxy
  // that briefly made both spellings work (wirePlayerFieldsProxy,
  // deleted this commit) only existed to bridge the multi-batch call-
  // site rewrite; nothing needs it now.
  state.combat.player = makePlayerCombatStore(state.combat);
  // Lore tab's Enemies category (parser.js's buildLoreMenu) only lists a
  // creature once actually fought — dynamic creatures (enemy mages) have
  // no fixed BESTIARY id/species to log, so they're excluded; every real
  // roster member (including a pack's) counts the moment the fight
  // starts, win, lose, or flee.
  enemies.forEach((e) => {
    if (!e.dynamicCreature) state.encounteredCreatures.add(e.creatureId);
  });
  // Enemy-inflicted ally statuses (ally.statuses — Bleed, Venom, Pinned,
  // ...; see tickAllyStatuses) are combat-scoped like the player's own
  // combat.player.playerStatuses, unlike ally.buffs (a deliberately-given potion
  // buff, which IS meant to survive into the next fight) — reset here so
  // a status that never finished ticking down before this fight started
  // doesn't silently resume dealing damage in an unrelated one.
  (state.party || []).forEach((ally) => { ally.statuses = {}; });
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
      // Smuggler's Caution (Sanguivorum Criminal Underworld, IA-13): the
      // self-buff sibling of Draconic Presence's own self-debuff-on-player
      // shape above — "own" trigger name (combatStartSelfBuff), not the
      // existing-but-never-wired combatStartBuff (tunnel_fighter/
      // draconic_presence's unrelated pair), so no other creature's
      // behavior changes. state.combat already exists by this point in
      // startCombat (assigned above), so applyEnemySelfModifier's own
      // combat.enemies lookup resolves correctly.
      if (p && p.trigger === "combatStartSelfBuff" && p.selfBuff) {
        applyEnemySelfModifier(state.combat, e.creatureObj, p.selfBuff);
      }
      // Prepared Warhound (Legion Houndmaster, Sanguivorum Imperial
      // Military): "start combat with 1 approved Legion Hound already
      // active; counts toward active and lifetime caps; no automatic
      // respawn" — a one-time pre-combat summon via the SAME
      // resolveEnemySummon() path Deploy Legion Hounds' own active uses
      // (shared capKey, so this starting hound occupies one of the same
      // maxActive/maxLifetime slots), resolved once here rather than
      // through tickEnemyPassives' per-round loop. state.combat already
      // exists by this point (assigned above), so resolveEnemySummon's
      // own combat.enemies bookkeeping resolves correctly.
      if (p && p.trigger === "combatStartSummon" && p.summon) {
        lines.push(...resolveEnemySummon(state, e.creatureObj.level, p.summon, pid, e.creatureObj.name, e.creatureObj));
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
    if (creature.spawnRarity === "unique") statusBits.push("unique"); // was creature.unique — a field nothing ever sets
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
    activeEnemySlot(state.combat).enemyAtkPenalty += 2;
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
    if (healPerTurn > 0) state.combat.player.regen = { turnsLeft: applyBeneficialEffectBonuses(state, 5), healPerTurn };
  }
});
Events.on("combat.started", ({ state }) => {
  // Forest Guardian (Vaeloris 6pc): a Defense charge earned when Regrowth
  // activated after the PREVIOUS fight ended (Regrowth itself only ever
  // fires once combat is already over, so this is how its +2 Defense
  // actually reaches a fight).
  if (state.flags.forestGuardianCharge) {
    state.combat.player.forestGuardianBonus = 2;
    state.flags.forestGuardianCharge = false;
  }
});
Events.on("combat.started", ({ state }) => {
  // Swift Passage (Divine Regalia — Windstep Boots): transfers the charge
  // queued in resolveKill onto this fresh combat object — consumed by the
  // next Ability/Tactic's own cooldown assignment (Feint/Decoy/Disarm/
  // useElementAbility; Ambush has no cooldown to zero).
  if (state.flags.swiftPassageCharge) {
    state.combat.player.swiftPassageReady = true;
    state.flags.swiftPassageCharge = false;
  }
});

// Hold the Line (Legion 8pc): the first time the player's Health drops
// below 30% each fight, an immediate +6 Defense for 2 turns. Checked
// anywhere player Health just changed downward, since it's a reactive
// safety net rather than tied to a specific action.
// Step 1f-iii §4: "low-health... triggers (lowHealthTriggerChecks...)
// become reactions with those triggers." Each entry below keeps its own
// function body completely unchanged (own threshold, own oncePerFight
// flag, own effect) -- only the dispatch shape changes, from a hardcoded
// spread list to a declared table tagged trigger: "lowHealth", read
// generically by the loop below rather than naming each check inline.
// This list used to be pasted verbatim into seven separate action
// handlers — a new Avatar/threshold effect added to six of them and missed
// in the seventh would silently never fire on that action. Add new
// low-Health triggers HERE, once, as a new entry in this table.
const LOW_HEALTH_REACTIONS = [
  { id: "hold_the_line", trigger: "lowHealth", resolve: checkHoldTheLine },
  { id: "rooted_resolve", trigger: "lowHealth", resolve: checkRootedResolve },
  { id: "avatar_of_bloom", trigger: "lowHealth", resolve: checkAvatarOfBloom },
  { id: "avatar_of_passing", trigger: "lowHealth", resolve: checkAvatarOfPassing },
  { id: "avatar_of_fate", trigger: "lowHealth", resolve: checkAvatarOfFate },
  { id: "rally_the_line", trigger: "lowHealth", resolve: checkRallyTheLine },
  { id: "avatar_of_war", trigger: "lowHealth", resolve: checkAvatarOfWar },
  { id: "avatar_of_knowledge", trigger: "lowHealth", resolve: checkAvatarOfKnowledge },
  { id: "love_endures", trigger: "lowHealth", resolve: checkLoveEndures },
  { id: "avatar_of_devotion", trigger: "lowHealth", resolve: checkAvatarOfDevotion },
  { id: "avatar_of_chaos", trigger: "lowHealth", resolve: checkAvatarOfChaos },
  { id: "avatar_of_endurance", trigger: "lowHealth", resolve: checkAvatarOfEndurance },
  { id: "avatar_of_freedom", trigger: "lowHealth", resolve: checkAvatarOfFreedom },
  { id: "avatar_of_creation", trigger: "lowHealth", resolve: checkAvatarOfCreation },
  { id: "avatar_of_renewal", trigger: "lowHealth", resolve: checkAvatarOfRenewal },
  { id: "avatar_of_time", trigger: "lowHealth", resolve: checkAvatarOfTime },
];
function lowHealthTriggerChecks(state) {
  const lines = [];
  for (const reaction of LOW_HEALTH_REACTIONS) lines.push(...reaction.resolve(state));
  return lines;
}

// The incoming-damage mitigation pipeline for a hit on the PLAYER, shared
// by all three places that used to carry their own copy (enemy-mage
// counter, physical counter, failed flee). `kind` picks the Adaptive Tide
// half ("magic" | "physical"). Returns { edmg, absorbLines } — edmg after
// mitigation, absorbLines from applyPlayerDamage's Temporary Health.
function mitigateAndApplyHitOnPlayer(state, edmg, kind) {
  const combat = state.combat;
  edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
  edmg = applyUnbrokenLine(state, edmg);
  edmg = Math.round(edmg * preparedResponseMultiplier(state));
  edmg = Math.round(edmg * calmingPresenceMultiplier(state));
  edmg = Math.round(edmg * avatarOfDevotionDamageMultiplier(state));
  edmg = Math.round(edmg * blessingOfStoneMultiplier(state));
  edmg = Math.round(edmg * avatarOfEnduranceDamageMultiplier(state));
  edmg = Math.round(edmg * avatarOfRenewalDamageMultiplier(state));
  edmg = Math.round(edmg * (kind === "magic" ? adaptiveTideMagicMultiplier(state) : adaptiveTidePhysicalMultiplier(state)));
  edmg = Math.round(edmg * sharedBurdenMultiplier(state, edmg));
  edmg = applyUnyieldingWall(state, edmg);
  const absorbLines = applyPlayerDamage(state, edmg);
  if (edmg > 0 && hasEffect(state, "adaptive_tide")) {
    const key = kind === "magic" ? "adaptiveTideMagicStacks" : "adaptiveTidePhysicalStacks";
    combat[key] = Math.min(5, (combat[key] || 0) + 1);
  }
  if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.player.queenCarapaceBonus = Math.min(9, combat.player.queenCarapaceBonus + 3);
  return { edmg, absorbLines };
}

function checkHoldTheLine(state) {
  const combat = state.combat;
  if (!combat || combat.player.holdTheLineUsed || !hasSetTier(state, "Legion", 8)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.3) return [];
  combat.player.holdTheLineUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 2);
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, flatStat(6)));
  return [`Hold the Line — your training snaps into place as your Health falls; +${flatStat(6)} Defense for 2 turns.`];
}

// Rooted Resolve (Divine Regalia — Verdant Aegis): the first time the
// player's Health drops below 50% each fight, an immediate +8 Defense for
// 3 turns. Same shape as Hold the Line, just a different item-level
// effect instead of a set tier, and checked at the same call sites.
function checkRootedResolve(state) {
  const combat = state.combat;
  if (!combat || combat.player.rootedResolveUsed || !hasEffect(state, "rooted_resolve")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.5) return [];
  combat.player.rootedResolveUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, flatStat(8)));
  return [`Rooted Resolve — you plant yourself as your Health falls; +${flatStat(8)} Defense for 3 turns.`];
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
  if (!combat || combat.player.loveEnduresUsed || !hasEffect(state, "love_endures")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.2) return [];
  combat.player.loveEnduresUsed = true;
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
  if (!combat || combat.player.rallyTheLineUsed || !hasEffect(state, "rally_the_line")) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.5) return [];
  combat.player.rallyTheLineUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(10)));
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, flatStat(10)));
  return [`Rally the Line — your Health falls, and the line holds; +${flatStat(10)} Attack, +${flatStat(10)} Defense for 4 rounds.`];
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
  if (!combat || combat.player.avatarOfBloomUsed || !hasSetTier(state, "Regalia of the First Bloom", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfBloomUsed = true;
  const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.5));
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.25)));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.25)));
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, Math.round(state.def * 0.25)));
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
  if (!combat || combat.player.avatarOfPassingUsed || !hasSetTier(state, "Regalia of the Final Veil", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfPassingUsed = true;
  combat.player.avatarOfPassingTurns = applyBeneficialEffectBonuses(state, 4);
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
  if (!combat || combat.player.avatarOfFateUsed || !hasSetTier(state, "Regalia of the Woven Thread", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfFateUsed = true;
  combat.player.avatarOfFateTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Fate awakens — for 4 rounds, fate bends further in your favor.`];
}

// Avatar of War (Regalia of the Crimson Vanguard 6pc): same below-25%-
// Health trigger as its sibling "Avatar of X" abilities. Grants 4 rounds
// of +50% Attack (approximated as a flat addend off base state.atk, the
// same technique Avatar of Bloom uses for its own +25%), a 10%-damage-
// dealt-as-healing lifesteal (see rollPlayerDamage), and widens Riposte's
// trigger to fire on every enemy hit rather than only a zero-damage one
// (see the resolveEnemyAttackOnPlayer call sites). Its "immune to Fear/Stun/
// Disarm" clause is trivially already true — none of those exist as
// player-targeting mechanics in this engine — and "defeating an enemy
// immediately grants another attack" is inert for the same reason Second
// Wind (Mythic) is: a kill always ends this engine's single-enemy fight,
// so there's no next enemy for the extra attack to land on.
function checkAvatarOfWar(state) {
  const combat = state.combat;
  if (!combat || combat.player.avatarOfWarUsed || !hasSetTier(state, "Regalia of the Crimson Vanguard", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfWarUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.player.avatarOfWarTurns = dur;
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.5)));
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
  if (!combat || combat.player.avatarOfKnowledgeUsed || !hasSetTier(state, "Regalia of the Endless Archive", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfKnowledgeUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.player.avatarOfKnowledgeTurns = dur;
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.5)));
  combat.player.knowledgeBuffAmount = applyBlessingOfCreationBonus(state, flatStat(25));
  const creature = getCombatCreature(state);
  return [`Avatar of Knowledge awakens — for 4 rounds, every secret of the fight lies open. ${withThe(creature.name, false)} has ${activeEnemySlot(combat).hp} Health remaining, ${creature.def} Defense, ${creature.atk} Attack.`];
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
  if (!combat || combat.player.avatarOfDevotionUsed || !hasSetTier(state, "Regalia of the Eternal Heart", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfDevotionUsed = true;
  combat.player.avatarOfDevotionTurns = applyBeneficialEffectBonuses(state, 4);
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
  if (!combat || combat.player.avatarOfChaosUsed || !hasSetTier(state, "Regalia of the Laughing Gale", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfChaosUsed = true;
  combat.player.avatarOfChaosTurns = applyBeneficialEffectBonuses(state, 4);
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
  if (!combat || combat.player.avatarOfEnduranceUsed || !hasSetTier(state, "Regalia of the Eternal Bastion", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfEnduranceUsed = true;
  combat.player.avatarOfEnduranceTurns = applyBeneficialEffectBonuses(state, 4);
  return [`Avatar of Endurance awakens — for 4 rounds, you become an unmoving wall.`];
}

// Avatar of Freedom (Regalia of the Endless Horizon 6pc): the ninth
// "Avatar of X" once-per-fight below-25%-Health trigger. For 4 rounds:
// cooldowns recover twice as fast (beginTurn) and every Ability/Tactic's
// non-cooldown activation restrictions can be ignored (see
// activationRestrictionsBypassed), plus its own independent 50% evasion
// roll (resolveEnemyAttackOnPlayer, stacking with Blessing of Freedom's 15%
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
  if (!combat || combat.player.avatarOfFreedomUsed || !hasSetTier(state, "Regalia of the Endless Horizon", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfFreedomUsed = true;
  combat.player.avatarOfFreedomTurns = applyBeneficialEffectBonuses(state, 4);
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
  if (!combat || combat.player.avatarOfCreationUsed || !hasSetTier(state, "Regalia of the Eternal Forge", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfCreationUsed = true;
  const dur = applyBeneficialEffectBonuses(state, 4);
  combat.player.avatarOfCreationTurns = dur;
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.4)));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.4)));
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
  if (!combat || combat.player.avatarOfRenewalUsed || !hasSetTier(state, "Regalia of the Endless Tide", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfRenewalUsed = true;
  combat.player.avatarOfRenewalTurns = applyBeneficialEffectBonuses(state, 4);
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
  if (!combat || combat.player.avatarOfTimeUsed || !hasSetTier(state, "Regalia of the Eternal Hour", 6)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.25) return [];
  combat.player.avatarOfTimeUsed = true;
  combat.player.avatarOfTimeTurns = applyBeneficialEffectBonuses(state, 3);
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
  // v0.11 PLAYER_STAT_SCALE: vanguardMomentumStacks is a raw stat-point
  // stack, summed into recomputeStats' own scaledStat()'d atk total.
  return [`Vanguard Momentum — the fight sharpens you; +${flatStat(1)} Attack (${before + 1}/5 this streak).`];
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
  // v0.11 PLAYER_STAT_SCALE: see Vanguard Momentum's own copy of this note.
  return [`Passing Whisper — a departing breath lends you strength; +${flatStat(1)} Magic (${before + 1}/15 this streak).`];
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
  const speciesKey = activeEnemySlot(combat).dynamicCreature ? "enemy_mage_" + (creature.element || "unknown") : activeEnemySlot(combat).creatureId;
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
// an untracked/missing type (e.g. resolveEnemyAttackOnPlayer's non-mage
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
  // Hunt/Track bounties (engine/jobs.js's checkJobProgressOnKill): which
  // job (if any) this combat instance is the tracked encounter for —
  // captured now, before the end-of-fight cleanup further down can null
  // state.combat out from under it.
  const huntJobId = state.combat && state.combat.huntJobId;
  const out = [`${deathFlavorLine(creature, state.combat && activeEnemySlot(state.combat).lastDamageType)} ${creature.combatNotes || ""}`.trim()];
  // Summoned enemies (summonSourceKey set — resolveEnemySummon) are
  // reward-ineligible: no gold, no loot. Stated as an already-agreed rule
  // in the Criminal Underworld equipment codex (Gate 5B.8) for its own
  // H22/H23 summons, but applied uniformly here since nothing previously
  // enforced it — every existing summoner ability (Burrow Call, Nest Call,
  // Brood Call, Grave Bloom/Corrupted Grove) was paying out normally.
  const isSummoned = !!state.combat.enemies[diedIndex].summonSourceKey;
  // isMercenary retired — no Origin under the Race/Class/Origin system
  // maps to the old Mercenary background's bounty bonus. Revisit if a
  // future Origin should carry it forward.
  const bounty = 1;
  let goldFound = 0;
  let loot = null;
  if (!isSummoned) {
    // Scales off the creature's own encounter level (falling back to the
    // player's level for quest/job-tied creatures that skip the level roll
    // — see startCombat) and its Danger Class multiplier, replacing the old
    // flat tier-based formula.
    const rewardLevel = creature.level || state.level;
    goldFound = Math.round(randInt(1, 4) * Math.ceil(rewardLevel / 5) * dangerClassMultiplier(creature.dangerClass) * bounty);
    state.gold += goldFound;
    out.push(`You find ${goldFound} gold on/near the creature.`);
    loot = rollCreatureLoot(state, creature);
    if (loot) {
      // Loot Reachability Fixes v2.1: a `dropsAllWorn` creature (Dregnar
      // Ashvein) hands rollCreatureLoot back its whole worn-gear array,
      // guaranteed, instead of the usual single item name — everything
      // below (and trackDungeonKillRewards/dungeon.js's run tally) takes
      // either shape uniformly.
      const lootItems = Array.isArray(loot) ? loot : [loot];
      for (const item of lootItems) state.inventory.push(item);
      out.push(
        lootItems.length > 1
          ? `It was carrying: ${lootItems.map((i) => formatItemLine(i)).join(", ")}.`
          : `It was also carrying ${formatItemLine(lootItems[0])}.`
      );
    }
  }
  // Dungeon Delve (engine/dungeon.js): every kill's own gold/loot counts
  // toward this run's total, not just whichever kill happens to end the
  // fight — a no-op outside an active dungeon (and, now, for a
  // reward-ineligible summon, since goldFound/loot are 0/null above).
  trackDungeonKillRewards(state, goldFound, loot);
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
  if (hasSetTier(state, "Regalia of the Crimson Vanguard", 2) && state.combat && state.combat.player.actionCounter === 1) {
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
    // Hadrian's Personal Quest finale (engine/hadrianquest.js) — the
    // Bruised Mage and Astra Sa'Lahru's Revenant fall together as one
    // encounter's last-enemy-standing moment.
    if (state.combat.isHadrianQuestFinale) out.push(...concludeHadrianQuestFinale(state));
    if (state.combat === combatBeforeConclusion) state.combat = null;
    // Allies carrying a downed player (resolvePlayerDefeatOrDowned) to an
    // actual win: revive at a flat 25% max Health (owner's explicit
    // figure — not 1 Health, not a full heal) and clear the flag, same
    // "last thing before this fight's own bookkeeping wraps up" spot the
    // other on-kill effects above use.
    if (state.playerDowned) {
      state.playerDowned = false;
      state.health = Math.ceil(state.maxHealth * 0.25);
      out.push(`You come to as the last of them falls — your allies carried this one. Bruised and unsteady, but back on your feet at ${state.health} Health.`);
    }
    // Injury System v0.2 §4: a won fight is a survived fight (D11) —
    // every down banked this fight (combatBeforeConclusion.downs, read
    // now since state.combat is already null above) becomes a real
    // injury, win or no-revive-needed alike (this runs whether or not the
    // playerDowned branch just above fired — a player who went down and
    // got RALLIED back up earlier in this same fight still banked that
    // down, even though they're not still down at the moment of victory).
    out.push(...applyInjuriesFromDowns(state, combatBeforeConclusion.downs));
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
  // Reward-ineligible summons (isSummoned, above) skip XP too — "no
  // rewards from the summon" means gold, loot, AND XP.
  if (!isSummoned) out.push(...state.gainXp(xpFromKill(state, creature)));
  out.push(...checkJobProgressOnKill(state, creature, huntJobId));
  // Dungeon Delve (engine/dungeon.js): only clears the room once the
  // whole encounter is over (state.combat null here means no survivors
  // left — same moment checkJobProgressOnKill above keys off), not on
  // an earlier kill within a pack fight.
  checkDungeonRoomClearOnKill(state);
  return out;
}

// "enemy.killed" listeners — every one of these used to be a hardwired,
// line-free fragment inline in resolveKill above. Split into separate
// listeners (rather than one handler doing all five) so each stays as
// easy to find/reason about as it was as its own commented block.

// Unique creatures: parser.js's travel/explore spawn pools already skip any
// unique whose "defeated_<bestiaryKey>" flag is set — but nothing ever set
// it, so every unique boss respawned forever and that filter was dead code.
// (bestiaryKey is only stamped on BESTIARY-built fights, so the arena's
// inline Champion — also spawnRarity "unique" — is correctly skipped.)
// Loot Reachability Fixes v2.1: also set for any `dropsAllWorn` creature
// (Dregnar Ashvein, special with no spawnRarity of his own) — otherwise
// his guaranteed full-kit drop would be farmable the moment something
// actually starts his fight (nothing does yet).
Events.on("enemy.killed", ({ creature, state }) => {
  if (creature && (creature.spawnRarity === "unique" || creature.dropsAllWorn) && creature.bestiaryKey) {
    state.flags["defeated_" + creature.bestiaryKey] = true;
  }
});

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



// The player's own round when downed (resolvePlayerDefeatOrDowned) — no
// player action at all, just the same beginTurn/resolveKill bookkeeping
// every other action function runs, then the FULL initiative order for
// allies and enemies: resolveSpeedInitiative followed immediately by
// resolveRemainingInitiativeActions, with no player action resolved in
// between. resolveRemainingInitiativeActions already explicitly skips
// `entry.kind === "player"` entries, so together these two calls cover
// every ally and enemy slot exactly once — the same guarantee any other
// action function gets, just without a player turn splitting them.
// Dispatched from parser.js's handleInput in place of whatever combat
// verb was actually typed, for as long as state.playerDowned is true.
function resolveDownedRound(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  let creature = getCombatCreature(state);
  const out = [`You can only watch — the fight isn't yours to finish anymore.`];
  out.push(...beginTurn(state));
  if (!state.combat) return out;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat) return out;
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, 0);
  out.push(...retaliation.lines);
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
    // Injury System v0.2 §4: a successful flee is a survived fight too
    // (D11, spec's own wording: "victory, or a successful flee by the
    // party") — read combat.downs before nulling state.combat below.
    const injuryLines = applyInjuriesFromDowns(state, state.combat.downs);
    state.combat = null;
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`, ...ambushLoss, ...injuryLines, ...applyRegrowth(state), ...advanceTime(state, randInt(10, 30), "combat")];
  }

  const out = beginTurn(state);
  // beginTurn can itself end the fight now — a burn/bleed tick on a
  // non-active pack member can finish it off (and, if it was the last one
  // standing, the whole encounter) before the player's own action runs.
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  // Flee isn't part of the Speed-ordered initiative split (it's always
  // just one swing from the current active enemy, win or lose — see
  // below), but allies still act every round regardless, same as any
  // other action — just unconditionally here rather than slotted by
  // their own Speed, since there's no "the player's own action" moment
  // in a failed flee for an initiative order to be built around.
  for (const ally of aliveAllies(state)) {
    if (!state.combat || !aliveEnemies(state).length) break;
    out.push(...resolveOneAllyAction(state, ally));
  }
  if (!state.combat || state.health <= 0) return out;
  creature = getCombatCreature(state);

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
  // v0.11: shared ratio mitigation — see mitigate().
  const fleeAtk = effectiveEnemyAtk(state, creature);
  let edmg = creature.atk === 0 ? 0 : Math.max(1, Math.round(mitigate(randInt(Math.max(1, fleeAtk - 1), fleeAtk + 1), effectivePlayerDef(state))));
  if (edmg > 0 && !combat.player.firstHitTakenUsed) {
    combat.player.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  const fleeHit = mitigateAndApplyHitOnPlayer(state, edmg, "physical");
  edmg = fleeHit.edmg;
  const absorbLines = fleeHit.absorbLines;
  if (edmg > 0) combat.player.playerLastHitType = "physical"; // Injury System v0.2
  out.push(`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`, ...absorbLines);
  if (state.health <= 0) {
    const defeatMsg = resolvePlayerDefeatOrDowned(state);
    if (defeatMsg) out.push(defeatMsg);
  } else {
    out.push(...lowHealthTriggerChecks(state));
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
  if (!cooldown || state.combat.player.tacticalMemoryUsed || !hasEffect(state, "tactical_memory")) {
    return { cooldown, fired: false };
  }
  if (Math.random() < tacticalMemoryChance(state)) {
    state.combat.player.tacticalMemoryUsed = true;
    return { cooldown: Math.max(1, cooldown - 1), fired: true };
  }
  return { cooldown, fired: false };
}

// Perfect Timing (Mythic): the first tactic used each fight ignores its
// cooldown entirely — takes priority over First Kingdom/Master
// Strategist's flat reduction and Tactical Memory's probabilistic one,
// both moot once the cooldown is already 0.
function applyPerfectTiming(state) {
  if (!hasEffect(state, "perfect_timing") || state.combat.player.perfectTimingUsed) return false;
  state.combat.player.perfectTimingUsed = true;
  return true;
}

// First Kingdom's 6pc set bonus and Master Strategist (Mythic) are both a
// flat, unconditional -1 to every tactic's cooldown, applied before
// Tactical Memory's probabilistic reduction (both can apply to the same
// cast) — every call site checks either source before calling this.
function applyFirstKingdomCooldown(cooldown) {
  return Math.max(1, cooldown - 1);
}

// Whether the player's Class grants Tactics (Feint/Decoy/Ambush/Disarm) —
// true only for Warrior/Scout. Widened from the old `state.flags.isMage`
// check (which only ever ruled OUT Mage/Bruise) since Apothecary is a
// third non-Tactics Class: its own ability lives entirely separate from
// this, gated by classHasApothecary below instead.
function classHasTactics(state) {
  const cls = CLASSES[state.class];
  return !!cls && !!cls.usesTactics;
}

function classHasApothecary(state) {
  const cls = CLASSES[state.class];
  return !!cls && !!cls.usesApothecary;
}

function useFeint(state) {
  if (!state.combat) return ["There's nothing here to feint at."];
  if (!classHasTactics(state)) return ["Feinting isn't how your training works. Try your class's own ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
  if (state.combat.player.nextAttackBonus) return [`You're already coiled for a strike — feint again once you've used it.`];
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
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  // !state.combat: a faster enemy's pre-emptive strike inside
  // resolveSpeedInitiative can trigger the dungeon rescue, which heals
  // the player back up and ends combat outright — checking health alone
  // would miss that and let this function keep going into further
  // combat-only logic (e.g. resolveRemainingInitiativeActions) with state.combat
  // already null.
  if (!state.combat || state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "feint"), ...applyWanderersReward(state, "feint"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "feint"));
  consumeTrailblazer(state);
  state.combat.player.nextAttackBonus = true;
  let feintMemory;
  if (state.combat.player.avatarOfTimeTurns > 0) {
    feintMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    feintMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.swiftPassageReady) {
    state.combat.player.swiftPassageReady = false;
    feintMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.hourglassReserveReady) {
    state.combat.player.hourglassReserveReady = false;
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
    state.combat.player.siegeCorpsAtkCharge = 2;
  }
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}




// Apothecary's kit (data/tactics.js's APOTHECARY_ABILITIES) — a
// deliberately simpler cousin of Feint/Decoy/Ambush/Disarm above: same
// Knowledge gate + cooldown + turn/retaliation shape, without the Perfect
// Timing/Tactical Memory/Borrowed Seconds/First Kingdom cooldown-
// reduction stack Tactics get, since none of that itemization is written
// with a support buff in mind. `targetArg` is whatever followed the
// ability's own name in the typed/menu command — empty for self, or
// "on <ally>" (matchApothecaryAbilityVerb/the combat-menu's own target
// sub-stage both produce this same shape) for an ally cast. Self-cast
// Defense/Attack reuse combat.player.defBuffTurns/atkBuffTurns — the same
// Math.max-composed buffs Stoneskin and several Divine Regalia effects
// already share — while Accuracy/Speed/Agility go through the generic
// combat.player.playerBuffs map crafted potions already use, since those three
// stats never got their own dedicated fields. Ally-cast always goes
// through ally.buffs (companion.js's tickAllyBuffs already ages it down),
// the same storage crafted-potion-on-ally already uses out of combat.
function useApothecaryAbility(state, key, targetArg) {
  const a = APOTHECARY_ABILITIES[key];
  if (!state.combat) return [`Nothing to ${a.name.toLowerCase()} outside a fight. Try 'explore' if you're looking for one.`];
  if (!classHasApothecary(state)) return [`${a.name} isn't something your training covers. Try your class's own ability instead.`];
  if (state.knowledge < a.knowledgeReq && !activationRestrictionsBypassed(state)) return [`You don't know that yet. (needs Knowledge ${a.knowledgeReq}+)`];
  if ((state.combat.cooldowns[key] || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`${a.name} is still recovering — ${state.combat.cooldowns[key]} more turn(s).`];

  const onMatch = (targetArg || "").trim().match(/^on\s+(.+)$/i);
  let ally = null;
  if (onMatch) {
    ally = findAlly(state, onMatch[1]);
    if (!ally) return [`No one in your party matches "${onMatch[1]}".`];
  }

  let creature = getCombatCreature(state);
  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  // !state.combat: a faster enemy's pre-emptive strike inside
  // resolveSpeedInitiative can trigger the dungeon rescue, which heals
  // the player back up and ends combat outright — checking health alone
  // would miss that and let this function keep going into further
  // combat-only logic (e.g. resolveRemainingInitiativeActions) with state.combat
  // already null.
  if (!state.combat || state.health <= 0) return out;
  // Step 1e §4 gap fix: useApothecaryAbility never called applyEndlessStudy/
  // applyWanderersReward/applyActionTypeTracking at all, unlike every other
  // player action (playerAttack/useDecoy/useAmbush/useDisarm/
  // useElementAbility all call this same trio right here, before
  // consumeTrailblazer). applyPerfectMemory is deliberately NOT added --
  // its own header scopes it to Tactics/Elemental Abilities only, never
  // Attack, and by that same exclusion, never Apothecary either.
  // applyActionTypeTracking's own 3rd argument is documented as one of
  // exactly "attack"/"tactic"/"elemental" -- apothecary abilities don't fit
  // any of those, so this introduces a 4th category, "apothecary", which
  // now feeds Momentum Unbound's rhythm-shift check and Ever Forward's
  // 3-distinct-types window as its own distinct signal. That's an
  // interpretation call (the alternative would be folding it into
  // "tactic"), flagged here rather than guessed silently.
  out.push(...applyEndlessStudy(state, key), ...applyWanderersReward(state, key), ...applyActionTypeTracking(state, "apothecary"));
  consumeTrailblazer(state);
  state.combat.cooldowns[key] = a.cooldown;
  out.push(...applyApothecaryAbilityEffect(state, a, ally));

  if (!state.combat || state.health <= 0) return out;
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, 0);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

// v0.9 follow-up (Fortify, back when it was the only entry): was a
// hardcoded flat +3, never scaling — confirmed during a playtest pass to
// compound Apothecary's already-regressing physical damage output, since
// average enemy Attack climbs from ~4 (level 1) to ~10 (level 25). Scales
// gently with the same stat that gates every ability here, and applies to
// all five stat buffs the same way.
function applyApothecaryAbilityEffect(state, a, ally) {
  const isSelf = !ally;
  if (a.cleanse) {
    if (isSelf) {
      const cleared = Object.keys(state.combat.player.playerStatuses);
      cleared.forEach((s) => delete state.combat.player.playerStatuses[s]);
      return cleared.length ? [`${a.name} clears you: ${cleared.join(", ")}.`] : [`${a.name}, but nothing needed clearing.`];
    }
    // No status has ever been able to land on an ally in this engine (see
    // companion.js's own file-header caveat) — declared-but-inert rather
    // than faked, same convention applyConsumableEffectToAlly's cleanse
    // branch already uses for the out-of-combat item version.
    return [`You use ${a.name} on ${ally.name}, but there's nothing clinging to them to clear.`];
  }

  const rawAmount = Math.round((3 + Math.floor(state.knowledge / 4)) * apothecaryPotencyMultiplier(state, isSelf));
  // v0.11: Attack/Defense/Magic buffs land on the PLAYER_STAT_SCALE'd stat
  // they're added to; Accuracy/Agility/Speed ones stay as-is.
  const amount = scaledStat(isSelf ? a.stat : a.allyStat || a.stat, rawAmount);
  if (isSelf) {
    if (a.stat === "def") {
      state.combat.player.defBuffTurns = Math.max(state.combat.player.defBuffTurns, 3);
      state.combat.player.defBuffAmount = Math.max(state.combat.player.defBuffAmount, amount);
    } else if (a.stat === "atk") {
      state.combat.player.atkBuffTurns = Math.max(state.combat.player.atkBuffTurns, 3);
      state.combat.player.atkBuffAmount = Math.max(state.combat.player.atkBuffAmount, amount);
    } else {
      state.combat.player.playerBuffs[a.stat] = { amount, turns: 3 };
    }
    return [`You use ${a.name} on yourself — +${amount} ${STAT_LABELS[a.stat] || a.stat} for 3 turns.`];
  }

  const allyStat = a.allyStat || a.stat;
  if (!ally.buffs) ally.buffs = {};
  ally.buffs[allyStat] = { amount, turns: 3 };
  return [`You use ${a.name} on ${ally.name} — +${amount} ${STAT_LABELS[allyStat] || allyStat} for their next 3 rounds of combat.`];
}
