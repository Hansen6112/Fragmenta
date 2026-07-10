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
// state.combat.creatureObj since it isn't in BESTIARY to look up).
function getCombatCreature(state) {
  if (!state.combat) return null;
  return state.combat.creatureObj || BESTIARY[state.combat.creatureId];
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

// Earth's Stoneskin adds a temporary universal defense bonus; Evasive
// Guard and Queen Carapace's carapace_adaptation each add a permanent-
// for-the-fight bonus (capped +3 and +9 respectively) whenever their
// trigger fires — everything that computes damage taken should go
// through this instead of state.def.
function effectivePlayerDef(state) {
  const combat = state.combat;
  const buff = combat.defBuffTurns > 0 ? combat.defBuffAmount || 0 : 0;
  return state.def + buff + (combat.evasiveGuardBonus || 0) + (combat.forestGuardianBonus || 0) + (combat.queenCarapaceBonus || 0) + (combat.whiteWatchRiposteDefBonus || 0) + perfectBalanceBonus(state) + (combat.livingSteelBonus || 0);
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
// creatures. The bestiary has no formal Elite/Boss field, so this uses
// the closest existing proxy: tier 4+ (Extreme/Catastrophic threat) or a
// unique/named creature.
function kingslayerMultiplier(state, creature) {
  if (!hasEffect(state, "kingslayer")) return 1;
  const bonus = masterOfArmsDoubles(state, "kingslayer") ? 1.5 : 1.25;
  return (creature.tier || 0) >= 4 || creature.unique ? bonus : 1;
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
  return state.magic + ((state.combat && state.combat.riverWardenMagicBonus) || 0);
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
  let dmg;
  if (state.flags.isMage && state.primaryElement) {
    const magic = effectiveMagic(state);
    // Arcane Convergence (Artifact): rolls the base damage twice and keeps
    // the higher result — an "advantage" reroll rather than a flat
    // multiplier, so it still respects the natural magic-2..magic+2 spread.
    let base = randInt(magic - 2, magic + 2);
    if (hasEffect(state, "arcane_convergence")) base = Math.max(base, randInt(magic - 2, magic + 2));
    const multiplier = 1 + magic / 40;
    const matchup = elementMultiplier(state, activeElement, creature.element);
    const effDef = Math.max(0, creature.def - defPenalty);
    const overflowMult = arcaneOverflowMultiplier(state);
    dmg = Math.max(1, Math.round(base * multiplier * matchup * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * overflowMult) - Math.floor(effDef / 10));
  } else {
    const armorCrack = armorCrackAmount(state);
    const effDef = Math.max(0, creature.def - defPenalty - armorCrack);
    const atk = state.atk + consumeSiegeCorpsAtkCharge(state) + perfectBalanceBonus(state) + (state.combat.lastStandAtkBonus || 0) + (state.combat.livingSteelBonus || 0);
    const crushBase = crushingImpactMultiplier(state);
    const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
    const base = randInt(atk - 2, atk + 2) - Math.floor(effDef / 3);
    // Echoing Arsenal (Artifact): every 5th physical/weapon-attack roll
    // (playerAttack, Ambush, Decoy, Disarm — anything landing in this
    // "else" branch) deals double damage. Its own counter, separate from
    // combat.actionCounter, so mixing in elemental casts doesn't throw off
    // the count of actual weapon swings.
    state.combat.weaponAttackCounter = (state.combat.weaponAttackCounter || 0) + 1;
    const echoingArsenalMult = hasEffect(state, "echoing_arsenal") && state.combat.weaponAttackCounter % 5 === 0 ? 2 : 1;
    dmg = Math.max(1, Math.round(base * crushMult * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * echoingArsenalMult));
  }
  if (hasEffect(state, "momentum")) {
    state.combat.momentumStacks = Math.min(5, (state.combat.momentumStacks || 0) + 1);
  }
  // Soul Leech (Mythic): heals 10% of every hit's damage (20% if Master of
  // Arms doubles it from the Main Hand item), silently (this function only
  // returns a number, no message line) — consistent with Momentum/
  // Kingslayer/Hunter's Instinct also affecting the roll without their own
  // narration.
  if (hasEffect(state, "soul_leech") && state.health < state.maxHealth) {
    const leechPct = masterOfArmsDoubles(state, "soul_leech") ? 0.2 : 0.1;
    const leech = Math.round(dmg * leechPct);
    if (leech > 0) state.health = Math.min(state.maxHealth, state.health + leech);
  }
  return dmg;
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
  state.health = Math.min(state.maxHealth, state.health + heal);
  return [`Heartwood Vitality mends you for ${heal} health.`];
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
  for (const key of Object.keys(combat.cooldowns)) {
    if (combat.cooldowns[key] > 0) combat.cooldowns[key] -= 1;
  }
  if (combat.defBuffTurns > 0) combat.defBuffTurns -= 1;
  if (combat.evasionTurns > 0) combat.evasionTurns -= 1;
  if (combat.burn && combat.burn.turnsLeft > 0) {
    const creature = getCombatCreature(state);
    combat.hp -= combat.burn.dmgPerTurn;
    lines.push(`The flames still burn ${withThe(creature.name, false)} for ${combat.burn.dmgPerTurn} damage.`);
    combat.burn.turnsLeft -= 1;
    if (combat.burn.turnsLeft <= 0) combat.burn = null;
  }
  if (combat.bleed && combat.bleed.turnsLeft > 0) {
    const creature = getCombatCreature(state);
    combat.hp -= combat.bleed.dmgPerTurn;
    lines.push(`${withThe(creature.name, true)} is still bleeding for ${combat.bleed.dmgPerTurn} damage.`);
    combat.bleed.turnsLeft -= 1;
    if (combat.bleed.turnsLeft <= 0) combat.bleed = null;
  }
  lines.push(...applyHeartwoodVitality(state));
  lines.push(...applyLivingSteel(state));
  return lines;
}

// Elder Bark's plain 1-HP save prevents an otherwise-fatal hit, once per
// fight — checked wherever state.health has just dropped to 0 or below,
// in place of the usual "Everything goes dark" line.
function checkDeathPrevention(state) {
  if (state.health > 0) return null;
  const combat = state.combat;
  if (hasSetTier(state, "Elder Bark", 6) && !combat.elderBarkSaveUsed) {
    combat.elderBarkSaveUsed = true;
    state.health = 1;
    return `The oldest wood remembers you yet — you survive this at 1 Health.`;
  }
  if (hasEffect(state, "last_stand") && !combat.lastStandUsed) {
    combat.lastStandUsed = true;
    state.health = 1;
    combat.lastStandAtkBonus = (combat.lastStandAtkBonus || 0) + 5;
    return `Last Stand — you refuse to fall. 1 Health, and +5 Attack for what's left of this fight.`;
  }
  return null;
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
function resolveEnemyRetaliation(state, creature, atkSpread, extraDef) {
  const combat = state.combat;
  const bonusDef = extraDef || 0;
  // Guardian Spirit (Mythic): the very first enemy attack each fight is a
  // guaranteed miss, checked before anything else (stun, evasion) since
  // it's a harder guarantee than either.
  if (hasEffect(state, "guardian_spirit") && !combat.guardianSpiritUsed) {
    combat.guardianSpiritUsed = true;
    return { lines: [`Guardian Spirit turns the first blow aside completely.`], damage: 0 };
  }
  if (combat.enemyStunned) {
    combat.enemyStunned = false;
    return { lines: [`${withThe(creature.name, true)} is still reeling and doesn't attack.`], damage: 0 };
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
    state.health -= edmg;
    if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
    const elName = ELEMENTS[creature.element].name.toLowerCase();
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${elName} of its own, for ${edmg} damage.` : `Its ${elName} washes over you harmlessly.`];
    if (state.health <= 0) lines.push(checkDeathPrevention(state) || `Everything goes dark.`);
    return { lines, damage: edmg };
  }
  const atk = effectiveEnemyAtk(state, creature);
  let edmg = Math.max(0, randInt(atk - 1, atk + (atkSpread || 2)) - effectivePlayerDef(state) - bonusDef);
  if (edmg > 0 && !combat.firstHitTakenUsed) {
    combat.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
  state.health -= edmg;
  if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
  const lines = [edmg > 0 ? `${withThe(creature.name, true)} hits back for ${edmg} damage.` : `You take no damage from its counter.`];
  if (state.health <= 0) lines.push(checkDeathPrevention(state) || `Everything goes dark.`);
  return { lines, damage: edmg };
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
  const dmg = Math.round(rollPlayerDamage(state, creature) * riposteMultiplier(state));
  state.combat.hp -= dmg;
  const lines = [`You seize the opening — a free riposte for ${dmg} damage.`];
  if (hasSetTier(state, "White Watch", 6)) {
    state.combat.whiteWatchRiposteDefBonus = (state.combat.whiteWatchRiposteDefBonus || 0) + 2;
  }
  if (state.combat.hp <= 0) lines.push(...resolveKill(state, creature));
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
  if (state.knowledge < t.knowledgeReq) return false;
  if (tacticId === "ambush") return !state.combat.turnTaken;
  if (tacticId === "disarm" && state.combat.disarmed) return false;
  return (state.combat.cooldowns[tacticId] || 0) <= 0;
}

function elementAbilityAvailable(state, elementKey) {
  if (!state.combat) return false;
  const a = ELEMENT_ABILITIES[elementKey];
  if (state.knowledge < a.knowledgeReq) return false;
  if (elementKey === "acid" && state.combat.corroded) return false;
  return (state.combat.cooldowns[elementKey] || 0) <= 0;
}

// Reusable prompt suffix: "(fight / flee / feint / ambush)" or, for mages,
// "(fight / flee / ignite)" etc — listing only actions currently usable.
function tacticsLine(state) {
  if (!state.combat) return null;
  const usable = availableActionNames(state);
  if (!usable.length) return null;
  return `(fight / flee / ${usable.join(" / ")})`;
}

// creatureIdOrObject is either a BESTIARY key (string) or a dynamically
// generated combat target like an enemy mage (a full object, with its own
// .id) — see data/enemymages.js generateEnemyMage.
function startCombat(state, creatureIdOrObject) {
  const isDynamic = typeof creatureIdOrObject === "object";
  const creature = isDynamic ? creatureIdOrObject : BESTIARY[creatureIdOrObject];
  state.combat = {
    creatureId: isDynamic ? creature.id : creatureIdOrObject,
    creatureObj: isDynamic ? creature : null,
    name: creature.name,
    hp: creature.hp,
    maxHp: creature.hp,
    turnTaken: false, // flips true after any action; gates Ambush
    disarmed: false, // whether Disarm has already landed on this target
    corroded: false, // whether Corrode has already landed on this target
    enemyAtkPenalty: 0, // lasting attack reduction from Disarm
    enemyDefPenalty: 0, // lasting defense reduction from Corrode
    nextAttackBonus: false, // set by Feint, consumed by the next hit
    enemyStunned: false, // set by Concuss, consumed by the next enemy turn
    defBuffTurns: 0, // Stoneskin duration remaining
    defBuffAmount: 0, // Stoneskin's defense bonus
    evasionTurns: 0, // Windcut duration remaining
    evasionCharges: 0, // Evasive Release's one-shot dodge charges
    evasiveGuardBonus: 0, // Evasive Guard's permanent-per-fight def, capped +3
    queenCarapaceBonus: 0, // Carapace Adaptation's stacking def, capped +9
    whiteWatchRiposteDefBonus: 0, // White Watch 6pc — stacking def per Riposte
    riverWardenMagicBonus: 0, // River Warden 6pc — stacking magic, capped +8
    siegeCorpsAtkCharge: 0, // Siege Corps 6pc — one-shot +2 atk after Brace
    burn: null, // Ignite's damage-over-time: { turnsLeft, dmgPerTurn }
    bleed: null, // Deep Cut's damage-over-time: { turnsLeft, dmgPerTurn }
    lastElementUsed: null, // for elemental synergy — see data/synergy.js
    firstPhysicalAttackDone: false, // gates Opening Reach
    firstHitTakenUsed: false, // gates Stonewarden 6pc's first-hit reduction
    stormBarrierUsed: false, // gates Stormwatch 6pc's first-magical-hit reduction
    hamstringApplied: false, // gates Hamstring (once per target per fight)
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
    cooldowns: {},
  };
  const lines = [`${articled(creature.name)} blocks your path.`, creature.description];
  // Forest Guardian (Vaeloris 6pc): a Defense charge earned when Regrowth
  // activated after the PREVIOUS fight ended (Regrowth itself only ever
  // fires once combat is already over, so this is how its +2 Defense
  // actually reaches a fight).
  if (state.flags.forestGuardianCharge) {
    state.combat.forestGuardianBonus = 2;
    state.flags.forestGuardianCharge = false;
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

// Hold the Line (Legion 8pc): the first time the player's Health drops
// below 30% each fight, an immediate +6 Defense for 2 turns. Checked
// anywhere player Health just changed downward, since it's a reactive
// safety net rather than tied to a specific action.
function checkHoldTheLine(state) {
  const combat = state.combat;
  if (!combat || combat.holdTheLineUsed || !hasSetTier(state, "Legion", 8)) return [];
  if (state.health <= 0 || state.health >= state.maxHealth * 0.3) return [];
  combat.holdTheLineUsed = true;
  combat.defBuffTurns = Math.max(combat.defBuffTurns, 2);
  combat.defBuffAmount = Math.max(combat.defBuffAmount, 6);
  return [`Hold the Line — your training snaps into place as your Health falls; +6 Defense for 2 turns.`];
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
  state.health = Math.min(state.maxHealth, state.health + heal);
  if (hasSetTier(state, "Vaeloris", 6)) state.flags.forestGuardianCharge = true;
  return [`Regrowth mends you for ${heal} health.`];
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

// Shared victory handling — gold, loot, XP, job progress, ending combat.
function resolveKill(state, creature) {
  const out = [`${withThe(creature.name, true)} falls. ${creature.combatNotes || ""}`.trim()];
  const bounty = state.flags.isMercenary ? 1.5 : 1;
  const goldFound = Math.round(randInt(1, 4) * (creature.tier + 1) * bounty);
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
      state.health = Math.min(state.maxHealth, state.health + heal);
      out.push(`Blood Debt repaid — you're mended for ${heal} health.`);
    }
  }
  // Battle Scholar (Artifact): +1 Knowledge, permanently, after every kill —
  // capped at +50 total. Applied to the tracked bonus before recomputeStats
  // re-derives state.knowledge from scratch (bg mod + growth + gear + this).
  if (hasEffect(state, "battle_scholar") && state.battleScholarBonus < 50) {
    state.battleScholarBonus += 1;
  }
  // Living Legacy (Artifact): +1 permanent max Health after an Elite-or-
  // stronger kill, capped +100 — same tier4/unique proxy Kingslayer uses
  // for "Elite/Boss," since the bestiary has no formal field for it.
  if (hasEffect(state, "living_legacy") && ((creature.tier || 0) >= 4 || creature.unique) && state.livingLegacyBonus < 100) {
    state.livingLegacyBonus += 1;
  }
  state.combat = null;
  state.recomputeStats(true);
  out.push(...applyRegrowth(state));
  out.push(...applyVanguardMomentum(state));
  out.push(...state.gainXp(xpFromKill(creature)));
  out.push(...checkJobProgressOnKill(state, creature));
  return out;
}

function playerAttack(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  const creature = getCombatCreature(state);
  if (creature.friendly) {
    return [`${withThe(creature.name, true)} has done you no harm. Attacking it seems both unwise and unkind.`];
  }

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  // "Physical" here mirrors rollPlayerDamage's own branch check — a mage
  // with a primary element deals magic damage instead, so Opening
  // Reach/Deep Cut/Hamstring/Guarded Strike (all physical-attack effects)
  // don't apply to that basic attack.
  const isPhysical = !(state.flags.isMage && state.primaryElement);
  const activeElement = isPhysical ? null : pickElement(state);
  let dmg = rollPlayerDamage(state, creature, activeElement);
  if (isPhysical) dmg = applyOpeningReach(state, dmg);
  if (state.combat.nextAttackBonus) {
    const feintMult = hasEffect(state, "patient_aim") ? 1.75 : 1.6;
    dmg = Math.round(dmg * feintMult);
    state.combat.nextAttackBonus = false;
    out.push("Your feint pays off —");
  }
  state.combat.hp -= dmg;
  out.push(attackFlavorLine(state, creature, dmg, activeElement));

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  if (isPhysical) out.push(...applyPhysicalOnHitEffects(state, creature));

  const guardBonus = isPhysical && hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveEnemyRetaliation(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state));
  if (retaliation.damage === 0 && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function attemptFlee(state) {
  if (!state.combat) return ["There's nothing to flee from."];
  const creature = getCombatCreature(state);

  const chance = 0.6 - creature.tier * 0.08 + (state.stealthMod || 0);
  if (Math.random() < chance) {
    state.combat = null;
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`, ...applyRegrowth(state)];
  }

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const combat = state.combat;
  let edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 1) - effectivePlayerDef(state));
  if (edmg > 0 && !combat.firstHitTakenUsed) {
    combat.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  edmg = applyShieldWall(state, edmg);
  edmg = applyMasterDuelist(state, edmg);
  state.health -= edmg;
  if (edmg > 0 && hasSetTier(state, "Queen Carapace", 6)) combat.queenCarapaceBonus = Math.min(9, combat.queenCarapaceBonus + 3);
  out.push(`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`);
  if (state.health <= 0) {
    out.push(checkDeathPrevention(state) || `Everything goes dark.`);
  } else {
    out.push(...checkHoldTheLine(state));
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
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
  if (state.combat.nextAttackBonus) return [`You're already coiled for a strike — feint again once you've used it.`];
  const t = TACTICS.feint;
  if (state.knowledge < t.knowledgeReq) return [`You don't know how to feint yet. (needs Knowledge ${t.knowledgeReq}+)`];
  // Perfect Recall (Artifact): the gate itself is skipped entirely, rather
  // than zeroing state.combat.cooldowns.feint — cooldowns still accrue
  // normally underneath (so losing the effect mid-fight falls back to
  // whatever's actually stored), they just never block the next use.
  if ((state.combat.cooldowns.feint || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Feint is still recovering — ${state.combat.cooldowns.feint} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  state.combat.nextAttackBonus = true;
  let feintMemory;
  if (applyPerfectTiming(state)) {
    feintMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = hasEffect(state, "feinting_edge") ? 1 : t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    feintMemory = applyTacticalMemory(state, baseCooldown);
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
  const retaliation = resolveEnemyRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state));
  if (retaliation.damage === 0 && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useDecoy(state) {
  if (!state.combat) return ["There's nothing here to use that on."];
  if (state.flags.isMage) return ["Decoys aren't how your magic works. Try your element's ability instead."];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't attacking you. No need for a decoy.`];
  const t = TACTICS.decoy;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.decoy || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Decoy is still recovering — ${state.combat.cooldowns.decoy} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  let decoyMemory;
  if (applyPerfectTiming(state)) {
    decoyMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    decoyMemory = applyTacticalMemory(state, baseCooldown);
  }
  state.combat.cooldowns.decoy = decoyMemory.cooldown;

  out.push(`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`);
  if (decoyMemory.cooldown === 0 && !decoyMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (decoyMemory.fired) out.push(`Old instincts kick in — Decoy recovers faster this time.`);
  let dmg = applyOpeningReach(state, rollPlayerDamage(state, creature));
  state.combat.hp -= dmg;
  out.push(attackFlavorLine(state, creature, dmg) + " (while it's distracted)");

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  out.push(...applyPhysicalOnHitEffects(state, creature));

  out.push(`${withThe(creature.name, true)} wastes its attack on the decoy — you take no damage this turn.`);
  out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useAmbush(state) {
  if (!state.combat) return ["There's nothing here to ambush."];
  if (state.flags.isMage) return ["Ambush isn't how your magic works. Try your element's ability instead."];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} hasn't given you a reason to ambush it.`];
  const t = TACTICS.ambush;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.turnTaken) return [`The moment's passed — ambush only works as your opening move.`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const dmg = Math.round(rollPlayerDamage(state, creature) * ambushMultiplier(state));
  state.combat.hp -= dmg;
  out.push(`You strike first — ${withThe(creature.name, false)} never saw it coming. ${dmg} damage, no counter.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  out.push(...applyPhysicalOnHitEffects(state, creature));
  if (hasEffect(state, "evasive_release")) {
    state.combat.evasionCharges += 1;
    out.push(`You're already moving again — the next counter aimed at you will have to find you first.`);
  }

  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useDisarm(state) {
  if (!state.combat) return ["There's nothing here to disarm."];
  if (state.flags.isMage) return ["Disarm isn't how your magic works. Try your element's ability instead."];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't armed against you. Nothing to disarm.`];
  const t = TACTICS.disarm;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.disarmed) return [`It's already lost whatever you could have disarmed.`];
  if ((state.combat.cooldowns.disarm || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Disarm is still recovering — ${state.combat.cooldowns.disarm} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  let disarmMemory;
  if (applyPerfectTiming(state)) {
    disarmMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    disarmMemory = applyTacticalMemory(state, baseCooldown);
  }
  state.combat.cooldowns.disarm = disarmMemory.cooldown;
  state.combat.disarmed = true;
  state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3;

  out.push(`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`);
  if (disarmMemory.cooldown === 0 && !disarmMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (disarmMemory.fired) out.push(`Old instincts kick in — Disarm recovers faster this time.`);
  let dmg = applyOpeningReach(state, Math.round(rollPlayerDamage(state, creature) * 0.7));
  state.combat.hp -= dmg;
  out.push(`You still land a hit for ${dmg} damage.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  out.push(...applyPhysicalOnHitEffects(state, creature));

  const guardBonus = hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveEnemyRetaliation(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state));
  if (retaliation.damage === 0 && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// ---- Elemental abilities (mage only — one per element, replaces tactics) ----

function useElementAbility(state, elementKey) {
  const a = ELEMENT_ABILITIES[elementKey];
  if (!state.combat) return [`Nothing to ${a.name.toLowerCase()} outside a fight.`];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. Save it.`];
  // World Walker (Artifact): Blink specifically ignores the known-element
  // gate entirely — usable by any class, mage or not, regardless of which
  // elements (if any) are actually known.
  const worldWalkerBypass = elementKey === "transportation" && hasEffect(state, "world_walker");
  if (!worldWalkerBypass && elementKey !== state.primaryElement && elementKey !== state.secondaryElement && elementKey !== state.tertiaryElement) {
    return [`You haven't opened yourself to ${ELEMENTS[elementKey].name}.`];
  }
  if (state.knowledge < a.knowledgeReq) return [`You don't have the Knowledge for that yet. (needs Knowledge ${a.knowledgeReq}+)`];
  if (elementKey === "acid" && state.combat.corroded) return [`It's already lost whatever defenses you could corrode.`];
  if ((state.combat.cooldowns[elementKey] || 0) > 0) return [`${a.name} is still recovering — ${state.combat.cooldowns[elementKey]} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
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
  state.combat.cooldowns[elementKey] = cooldown;

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
  switch (elementKey) {
    case "fire": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      out.push(`${ELEMENTS.fire.verb(withThe(creature.name, false))} for ${dmg} damage, and the flame catches.`);
      state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.magic / 4)) };
      break;
    }
    case "water": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      const heal = Math.round(dmg * waterHealPct(state));
      state.health = Math.min(state.maxHealth, state.health + heal);
      out.push(`${ELEMENTS.water.verb(withThe(creature.name, false))} for ${dmg} damage, and the backwash mends you for ${heal}.`);
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
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      state.combat.corroded = true;
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 4;
      out.push(`${ELEMENTS.acid.verb(withThe(creature.name, false))} for ${dmg} damage — its defenses will be weaker against you for the rest of this fight.`);
      break;
    }
    case "force": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      state.combat.enemyStunned = true;
      out.push(`${ELEMENTS.force.verb(withThe(creature.name, false))} for ${dmg} damage — it reels, stunned.`);
      break;
    }
    case "transportation": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * 1.3 * elementalDmgMult);
      state.combat.hp -= dmg;
      castDamageDealt += dmg;
      out.push(`${ELEMENTS.transportation.verb(withThe(creature.name, false))} for ${dmg} damage before it can track where you went.`);
      break;
    }
    case "air": {
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
    return out;
  }

  let braceBonus = elementKey === "earth" && hasEffect(state, "brace") ? braceDefBonus(state) : 0;
  const retaliation = resolveEnemyRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...checkHoldTheLine(state));
  if (retaliation.damage === 0 && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}
