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

// Earth's Stoneskin adds a temporary universal defense bonus, and Evasive
// Guard adds a permanent-for-the-fight bonus each time an evasion effect
// triggers (capped at +3) — everything that computes damage taken should
// go through this instead of state.def.
function effectivePlayerDef(state) {
  const buff = state.combat.defBuffTurns > 0 ? state.combat.defBuffAmount || 0 : 0;
  return state.def + buff + (state.combat.evasiveGuardBonus || 0) + (state.combat.forestGuardianBonus || 0);
}

// Legion's Shield Wall (4pc): a flat -10% on ALL incoming damage, applied
// last after every other reduction (Defense, Spell Ward, etc.) — used at
// every point the player actually takes damage (both branches of
// resolveEnemyRetaliation, and attemptFlee's failed-flee hit).
function applyShieldWall(state, dmg) {
  if (!hasSetTier(state, "Legion", 4)) return dmg;
  return Math.round(dmg * 0.9);
}

// Mages deal magic-driven damage instead of attack-driven: magic barely
// touches physical defense (def/10 vs. def/3 for a physical hit), a
// multiplier tied to the Magic stat itself makes a mage's damage compound
// as they grow rather than scale linearly like a fighter's, and Acid's
// Corrode applies a lasting defense penalty to the target on top of that.
// activeElement (the element flavoring THIS cast) also gets checked against
// the target's own element, if it has one (an enemy mage), via
// data/matchups.js — fighters and non-elemental creatures are untouched by
// this since one side is always missing an element.
// Executioner (finisher damage vs. a badly wounded target) is checked
// once here since it applies uniformly to physical and magic damage
// alike — everything else in this function is physical-only. Drake
// Hunter's 4pc set bonus widens the threshold from 30% to 40% HP.
function executionerMultiplier(state) {
  if (!hasEffect(state, "executioner")) return 1;
  const combat = state.combat;
  const threshold = hasSetTier(state, "Drake Hunter", 4) ? 0.4 : 0.3;
  return combat.hp <= combat.maxHp * threshold ? 1.2 : 1;
}

// Legion's Disciplined Formation (6pc) stacks +2 Attack per successful
// Feint for the rest of the fight — folded in here rather than into
// state.atk directly so it never survives past the current combat.
function effectiveAtk(state) {
  return state.atk + ((state.combat && state.combat.disciplinedFormationBonus) || 0);
}

// Dragonslayer (Drake Hunter 6pc): a final multiplier against creatures
// tagged draven (Drake, Dragon), "applied after all other damage
// calculations" per its own spec — so it's applied last, outside both
// branches below rather than folded into either one's own math.
function dragonslayerMultiplier(state, creature) {
  if (creature.monsterTag !== "draven") return 1;
  return hasSetTier(state, "Drake Hunter", 6) ? 1.2 : 1;
}

function rollPlayerDamage(state, creature, activeElement) {
  const defPenalty = (state.combat && state.combat.enemyDefPenalty) || 0;
  const execMult = executionerMultiplier(state);
  const dragonMult = dragonslayerMultiplier(state, creature);
  if (state.flags.isMage && state.primaryElement) {
    const base = randInt(state.magic - 2, state.magic + 2);
    const multiplier = 1 + state.magic / 40;
    const matchup = elementMultiplier(activeElement, creature.element);
    const effDef = Math.max(0, creature.def - defPenalty);
    return Math.max(1, Math.round(base * multiplier * matchup * execMult * dragonMult) - Math.floor(effDef / 10));
  }
  const armorCrack = hasEffect(state, "armor_crack") ? 2 : 0;
  const effDef = Math.max(0, creature.def - defPenalty - armorCrack);
  const atk = effectiveAtk(state);
  const crushBase = hasSetTier(state, "Thraekor", 6) ? 1.35 : 1.2;
  const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
  const base = randInt(atk - 2, atk + 2) - Math.floor(effDef / 3);
  return Math.max(1, Math.round(base * crushMult * execMult * dragonMult));
}

// Picks which element flavors this particular hit — alternates between
// primary/secondary once a second element is unlocked at level 15.
function pickElement(state) {
  if (state.secondaryElement && Math.random() < 0.5) return state.secondaryElement;
  return state.primaryElement;
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
function applyPhysicalOnHitEffects(state, creature) {
  const lines = [];
  const combat = state.combat;
  if (hasEffect(state, "deep_cut") && Math.random() < 0.2) {
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
  return lines;
}

// Resolves the enemy's retaliation for this turn, respecting Force's stun,
// Air's evasion window/Evasive Release's one-shot charges, and Earth's
// defense buff. Shared by every action that lets the enemy hit back on a
// normal (non-fatal) turn. Enemy mages (creature.element set) counter with
// magic instead of a physical attack stat, and their element is checked
// against the player's own active element (if any) through the same
// matchup table used for the player's own casts — so the strengths/
// weaknesses run both directions.
//
// Returns { lines, damage } instead of just lines — callers use `damage`
// to check for Riposte (which fires on a zero-damage retaliation). `extraDef`
// is an optional one-shot Defense bonus for THIS call only (Guarded Strike,
// Brace) — it never persists beyond this single retaliation.
function resolveEnemyRetaliation(state, creature, atkSpread, extraDef) {
  const combat = state.combat;
  const bonusDef = extraDef || 0;
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
    return { lines: [`You slip past ${withThe(creature.name, false)}'s counter entirely.`], damage: 0 };
  }
  if (creature.element) {
    const defenderElement = state.flags.isMage ? state.primaryElement : null;
    const matchup = elementMultiplier(creature.element, defenderElement);
    const base = randInt(creature.magic - 2, creature.magic + 2);
    const coldBonus = creature.element === "water" && hasEffect(state, "coldproof") ? 2 : 0;
    const def = effectivePlayerDef(state) + bonusDef + coldBonus;
    let edmg = Math.max(0, Math.round(base * matchup) - Math.floor(def / 10));
    if (hasEffect(state, "spell_ward")) edmg = Math.round(edmg * 0.9);
    edmg = applyShieldWall(state, edmg);
    state.health -= edmg;
    const elName = ELEMENTS[creature.element].name.toLowerCase();
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${elName} of its own, for ${edmg} damage.` : `Its ${elName} washes over you harmlessly.`];
    if (state.health <= 0) lines.push(`Everything goes dark.`);
    return { lines, damage: edmg };
  }
  const atk = effectiveEnemyAtk(state, creature);
  const edmg = applyShieldWall(state, Math.max(0, randInt(atk - 1, atk + (atkSpread || 2)) - effectivePlayerDef(state) - bonusDef));
  state.health -= edmg;
  const lines = [edmg > 0 ? `${withThe(creature.name, true)} hits back for ${edmg} damage.` : `You take no damage from its counter.`];
  if (state.health <= 0) lines.push(`Everything goes dark.`);
  return { lines, damage: edmg };
}

// Riposte: a free follow-up hit whenever the enemy's retaliation dealt
// zero damage (stunned, evaded, Decoy, or reduced to 0 by defense). Called
// by every action that either goes through resolveEnemyRetaliation (when
// its returned damage is 0) or otherwise guarantees a damage-free counter
// (Decoy, which doesn't call resolveEnemyRetaliation at all).
function maybeRiposte(state, creature) {
  if (!hasEffect(state, "riposte")) return [];
  if (!state.combat || state.combat.hp <= 0) return [];
  const dmg = Math.round(rollPlayerDamage(state, creature) * 0.5);
  state.combat.hp -= dmg;
  const lines = [`You seize the opening — a free riposte for ${dmg} damage.`];
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
    burn: null, // Ignite's damage-over-time: { turnsLeft, dmgPerTurn }
    bleed: null, // Deep Cut's damage-over-time: { turnsLeft, dmgPerTurn }
    lastElementUsed: null, // for elemental synergy — see data/synergy.js
    firstPhysicalAttackDone: false, // gates Opening Reach
    hamstringApplied: false, // gates Hamstring (once per target per fight)
    tacticalMemoryUsed: false, // gates Tactical Memory (once per fight)
    surgingConduitUsed: false, // gates Surging Conduit (once per fight)
    disciplinedFormationBonus: 0, // Legion 6pc — stacking +2 atk per successful Feint
    forestGuardianBonus: 0, // Vaeloris 6pc — consumed charge from a prior fight's Regrowth
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

// Regrowth: a flat post-combat heal, whether combat ended by winning or by
// fleeing successfully — presence-only (hasEffect), so multiple copies
// don't stack per the effect's own description.
// Vaeloris's 4pc (Nature's Grace, 5%->10% heal) and 6pc (Forest Guardian)
// both key off Regrowth actually activating. Forest Guardian's +2 Defense
// can't apply to "the current fight" since Regrowth only ever fires after
// combat has already ended (a kill or a successful flee) — so it's
// queued as a one-shot charge consumed at the start of the player's next
// fight instead (see startCombat).
function applyRegrowth(state) {
  if (!hasEffect(state, "regrowth")) return [];
  const pct = hasSetTier(state, "Vaeloris", 4) ? 0.1 : 0.05;
  const heal = Math.ceil(state.maxHealth * pct);
  if (heal <= 0) return [];
  state.health = Math.min(state.maxHealth, state.health + heal);
  if (hasSetTier(state, "Vaeloris", 6)) state.flags.forestGuardianCharge = true;
  return [`Regrowth mends you for ${heal} health.`];
}

// Shared victory handling — gold, loot, XP, job progress, ending combat.
function resolveKill(state, creature) {
  const out = [`${withThe(creature.name, true)} falls. ${creature.combatNotes || ""}`.trim()];
  const bounty = state.flags.isMercenary ? 1.5 : 1;
  const goldFound = Math.round(randInt(1, 4) * (creature.tier + 1) * bounty);
  state.gold += goldFound;
  out.push(`You find ${goldFound} gold on/near the creature.`);
  const loot = rollCreatureLoot(creature);
  if (loot) {
    state.inventory.push(loot);
    out.push(`It was also carrying ${formatItemLine(loot)}.`);
  }
  state.combat = null;
  out.push(...applyRegrowth(state));
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

  const edmg = applyShieldWall(state, Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 1) - effectivePlayerDef(state)));
  state.health -= edmg;
  out.push(`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`);
  if (state.health <= 0) out.push(`Everything goes dark.`);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// ---- Fighter tactics (non-mage only — mages use useElementAbility) ----

// Tactical Memory: once per fight, the first tactic-cooldown assignment
// that rolls successfully (20% chance, re-rolled on each qualifying use
// until one hits) gets cut by 1 turn (minimum 1). Shared by Feint, Decoy,
// and Disarm — Ambush has no cooldown to shorten.
function applyTacticalMemory(state, cooldown) {
  if (!cooldown || state.combat.tacticalMemoryUsed || !hasEffect(state, "tactical_memory")) {
    return { cooldown, fired: false };
  }
  if (Math.random() < 0.2) {
    state.combat.tacticalMemoryUsed = true;
    return { cooldown: Math.max(1, cooldown - 1), fired: true };
  }
  return { cooldown, fired: false };
}

function useFeint(state) {
  if (!state.combat) return ["There's nothing here to feint at."];
  if (state.flags.isMage) return ["Feinting isn't how your magic works. Try your element's ability instead."];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
  if (state.combat.nextAttackBonus) return [`You're already coiled for a strike — feint again once you've used it.`];
  const t = TACTICS.feint;
  if (state.knowledge < t.knowledgeReq) return [`You don't know how to feint yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.feint || 0) > 0) return [`Feint is still recovering — ${state.combat.cooldowns.feint} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  state.combat.nextAttackBonus = true;
  const baseCooldown = hasEffect(state, "feinting_edge") ? 1 : t.cooldown;
  const memory = applyTacticalMemory(state, baseCooldown);
  state.combat.cooldowns.feint = memory.cooldown;

  out.push(`You feint — ${withThe(creature.name, false)} doesn't bite, but your next strike will land hard.`);
  if (memory.fired) out.push(`Old instincts kick in — Feint recovers faster this time.`);
  if (hasSetTier(state, "Legion", 6)) {
    state.combat.disciplinedFormationBonus += 2;
    out.push(`Disciplined Formation — your training holds; +2 Attack for the rest of this fight.`);
  }
  const braceBonus = hasEffect(state, "brace") ? 3 : 0;
  const retaliation = resolveEnemyRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
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
  if ((state.combat.cooldowns.decoy || 0) > 0) return [`Decoy is still recovering — ${state.combat.cooldowns.decoy} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  const memory = applyTacticalMemory(state, t.cooldown);
  state.combat.cooldowns.decoy = memory.cooldown;

  out.push(`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`);
  if (memory.fired) out.push(`Old instincts kick in — Decoy recovers faster this time.`);
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

  const ambushMult = hasEffect(state, "ambush_mastery") ? 1.55 : 1.4;
  const dmg = Math.round(rollPlayerDamage(state, creature) * ambushMult);
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
  if ((state.combat.cooldowns.disarm || 0) > 0) return [`Disarm is still recovering — ${state.combat.cooldowns.disarm} more turn(s).`];

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }
  const memory = applyTacticalMemory(state, t.cooldown);
  state.combat.cooldowns.disarm = memory.cooldown;
  state.combat.disarmed = true;
  state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3;

  out.push(`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`);
  if (memory.fired) out.push(`Old instincts kick in — Disarm recovers faster this time.`);
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
  if (elementKey !== state.primaryElement && elementKey !== state.secondaryElement) {
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
  // Conduit Ease rolls fresh on every cast (unlike Tactical Memory's
  // once-per-fight tactic equivalent). Kabal's 6pc set (River Mastery)
  // doubles the chance from 20% to 40%.
  let cooldown = a.cooldown;
  const conduitEaseChance = hasSetTier(state, "Kabal", 6) ? 0.4 : 0.2;
  if (hasEffect(state, "conduit_ease") && Math.random() < conduitEaseChance) {
    cooldown = Math.max(1, cooldown - 1);
    out.push(`The conduit answers easier than expected — ${a.name} will recover faster this time.`);
  }
  state.combat.cooldowns[elementKey] = cooldown;

  // Elemental synergy: casting the mage's OTHER known element right before
  // this one boosts this cast. Checked before lastElementUsed is updated,
  // since the check is "what came before this."
  const synergy = getSynergy(state, elementKey);
  const dmgMult = synergy ? synergy.dmgMultiplier : 1;
  state.combat.lastElementUsed = elementKey;

  // Elemental Focus (every cast, boosted from 1.08x to 1.15x by Kabal's
  // 4pc set) and Surging Conduit (first cast of the fight only) layer on
  // top of synergy as a separate multiplier — kept apart from dmgMult
  // because Stoneskin (earth) deals no damage and gets flat Defense
  // instead of either bonus.
  const focusActive = hasEffect(state, "elemental_focus");
  const focusMult = hasSetTier(state, "Kabal", 4) ? 1.15 : 1.08;
  const surgeActive = hasEffect(state, "surging_conduit") && !state.combat.surgingConduitUsed;
  if (surgeActive) state.combat.surgingConduitUsed = true;
  let elementalDmgMult = dmgMult;
  if (focusActive) elementalDmgMult *= focusMult;
  if (surgeActive) elementalDmgMult *= 1.2;

  switch (elementKey) {
    case "fire": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      out.push(`${ELEMENTS.fire.verb(withThe(creature.name, false))} for ${dmg} damage, and the flame catches.`);
      state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.magic / 4)) };
      break;
    }
    case "water": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      const heal = Math.round(dmg * 0.5);
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
      break;
    }
    case "lightning": {
      const dmg1 = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg1;
      out.push(`${ELEMENTS.lightning.verb(withThe(creature.name, false))} for ${dmg1} damage —`);
      if (state.combat.hp > 0) {
        const dmg2 = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
        state.combat.hp -= dmg2;
        out.push(`— and again, for ${dmg2} more before it can react.`);
      }
      break;
    }
    case "acid": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      state.combat.corroded = true;
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 4;
      out.push(`${ELEMENTS.acid.verb(withThe(creature.name, false))} for ${dmg} damage — its defenses will be weaker against you for the rest of this fight.`);
      break;
    }
    case "force": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      state.combat.enemyStunned = true;
      out.push(`${ELEMENTS.force.verb(withThe(creature.name, false))} for ${dmg} damage — it reels, stunned.`);
      break;
    }
    case "transportation": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * 1.3 * elementalDmgMult);
      state.combat.hp -= dmg;
      out.push(`${ELEMENTS.transportation.verb(withThe(creature.name, false))} for ${dmg} damage before it can track where you went.`);
      break;
    }
    case "air": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * elementalDmgMult);
      state.combat.hp -= dmg;
      state.combat.evasionTurns = 2;
      out.push(`${ELEMENTS.air.verb(withThe(creature.name, false))} for ${dmg} damage, leaving you lighter on your feet.`);
      break;
    }
  }

  if (synergy) {
    if (synergy.extraEffect) synergy.extraEffect(state, creature);
    out.push(synergy.message(withThe(creature.name, false)));
  }

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const braceBonus = elementKey === "earth" && hasEffect(state, "brace") ? 3 : 0;
  const retaliation = resolveEnemyRetaliation(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (retaliation.damage === 0 && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}
