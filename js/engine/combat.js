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

// Earth's Stoneskin adds a temporary universal defense bonus; everything
// that computes damage taken should go through this instead of state.def.
function effectivePlayerDef(state) {
  const buff = state.combat.defBuffTurns > 0 ? state.combat.defBuffAmount || 0 : 0;
  return state.def + buff;
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
function rollPlayerDamage(state, creature, activeElement) {
  const defPenalty = (state.combat && state.combat.enemyDefPenalty) || 0;
  if (state.flags.isMage && state.primaryElement) {
    const base = randInt(state.magic - 2, state.magic + 2);
    const multiplier = 1 + state.magic / 40;
    const matchup = elementMultiplier(activeElement, creature.element);
    const effDef = Math.max(0, creature.def - defPenalty);
    return Math.max(1, Math.round(base * multiplier * matchup) - Math.floor(effDef / 10));
  }
  const effDef = Math.max(0, creature.def - defPenalty);
  return Math.max(1, randInt(state.atk - 2, state.atk + 2) - Math.floor(effDef / 3));
}

// Picks which element flavors this particular hit — alternates between
// primary/secondary once a second element is unlocked at level 15.
function pickElement(state) {
  if (state.secondaryElement && Math.random() < 0.5) return state.secondaryElement;
  return state.primaryElement;
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
// active burn damage (Fire's Ignite). Called at the start of whichever
// combat action actually executes (not on rejected/invalid attempts, which
// don't consume a turn). Returns lines for anything that happened (burn
// tick), and the caller must check state.combat.hp afterward — burn alone
// can finish a creature off before the player's own action resolves.
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
  return lines;
}

// Resolves the enemy's retaliation for this turn, respecting Force's stun
// and Air's evasion window, and Earth's defense buff. Shared by every
// action that lets the enemy hit back on a normal (non-fatal) turn.
// Enemy mages (creature.element set) counter with magic instead of a
// physical attack stat, and their element is checked against the player's
// own active element (if any) through the same matchup table used for the
// player's own casts — so the strengths/weaknesses run both directions.
function resolveEnemyRetaliation(state, creature, atkSpread) {
  const combat = state.combat;
  if (combat.enemyStunned) {
    combat.enemyStunned = false;
    return [`${withThe(creature.name, true)} is still reeling and doesn't attack.`];
  }
  if (combat.evasionTurns > 0 && Math.random() < 0.5) {
    return [`You slip past ${withThe(creature.name, false)}'s counter entirely.`];
  }
  if (creature.element) {
    const defenderElement = state.flags.isMage ? state.primaryElement : null;
    const matchup = elementMultiplier(creature.element, defenderElement);
    const base = randInt(creature.magic - 2, creature.magic + 2);
    const edmg = Math.max(0, Math.round(base * matchup) - Math.floor(effectivePlayerDef(state) / 10));
    state.health -= edmg;
    const elName = ELEMENTS[creature.element].name.toLowerCase();
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${elName} of its own, for ${edmg} damage.` : `Its ${elName} washes over you harmlessly.`];
    if (state.health <= 0) lines.push(`Everything goes dark.`);
    return lines;
  }
  const atk = effectiveEnemyAtk(state, creature);
  const edmg = Math.max(0, randInt(atk - 1, atk + (atkSpread || 2)) - effectivePlayerDef(state));
  state.health -= edmg;
  const lines = [edmg > 0 ? `${withThe(creature.name, true)} hits back for ${edmg} damage.` : `You take no damage from its counter.`];
  if (state.health <= 0) lines.push(`Everything goes dark.`);
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
    burn: null, // Ignite's damage-over-time: { turnsLeft, dmgPerTurn }
    lastElementUsed: null, // for elemental synergy — see data/synergy.js
    cooldowns: {},
  };
  const lines = [`${articled(creature.name)} blocks your path.`, creature.description];
  if (creature.friendly) {
    lines.push(`It does not seem hostile. (try: talk, examine, or leave)`);
  } else {
    lines.push(tacticsLine(state) || "(fight / flee)");
  }
  return lines;
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

  const activeElement = state.flags.isMage && state.primaryElement ? pickElement(state) : null;
  let dmg = rollPlayerDamage(state, creature, activeElement);
  if (state.combat.nextAttackBonus) {
    dmg = Math.round(dmg * 1.6);
    state.combat.nextAttackBonus = false;
    out.push("Your feint pays off —");
  }
  state.combat.hp -= dmg;
  out.push(attackFlavorLine(state, creature, dmg, activeElement));

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  out.push(...resolveEnemyRetaliation(state, creature, 2));
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
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`];
  }

  const out = beginTurn(state);
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 1) - effectivePlayerDef(state));
  state.health -= edmg;
  out.push(`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`);
  if (state.health <= 0) out.push(`Everything goes dark.`);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

// ---- Fighter tactics (non-mage only — mages use useElementAbility) ----

function useFeint(state) {
  if (!state.combat) return ["There's nothing here to feint at."];
  if (state.flags.isMage) return ["Feinting isn't how your magic works. Try your element's ability instead."];
  const creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
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
  state.combat.cooldowns.feint = t.cooldown;

  out.push(`You feint — ${withThe(creature.name, false)} doesn't bite, but your next strike will land hard.`);
  out.push(...resolveEnemyRetaliation(state, creature, 2));
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
  state.combat.cooldowns.decoy = t.cooldown;

  out.push(`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`);
  const dmg = rollPlayerDamage(state, creature);
  state.combat.hp -= dmg;
  out.push(attackFlavorLine(state, creature, dmg) + " (while it's distracted)");

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  out.push(`${withThe(creature.name, true)} wastes its attack on the decoy — you take no damage this turn.`);
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

  const dmg = Math.round(rollPlayerDamage(state, creature) * 1.4);
  state.combat.hp -= dmg;
  out.push(`You strike first — ${withThe(creature.name, false)} never saw it coming. ${dmg} damage, no counter.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
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
  state.combat.cooldowns.disarm = t.cooldown;
  state.combat.disarmed = true;
  state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3;

  out.push(`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`);
  const dmg = Math.round(rollPlayerDamage(state, creature) * 0.7);
  state.combat.hp -= dmg;
  out.push(`You still land a hit for ${dmg} damage.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  out.push(...resolveEnemyRetaliation(state, creature, 2));
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
  state.combat.cooldowns[elementKey] = a.cooldown;

  // Elemental synergy: casting the mage's OTHER known element right before
  // this one boosts this cast. Checked before lastElementUsed is updated,
  // since the check is "what came before this."
  const synergy = getSynergy(state, elementKey);
  const dmgMult = synergy ? synergy.dmgMultiplier : 1;
  state.combat.lastElementUsed = elementKey;

  switch (elementKey) {
    case "fire": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
      state.combat.hp -= dmg;
      out.push(`${ELEMENTS.fire.verb(withThe(creature.name, false))} for ${dmg} damage, and the flame catches.`);
      state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(state.magic / 4)) };
      break;
    }
    case "water": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
      state.combat.hp -= dmg;
      const heal = Math.round(dmg * 0.5);
      state.health = Math.min(state.maxHealth, state.health + heal);
      out.push(`${ELEMENTS.water.verb(withThe(creature.name, false))} for ${dmg} damage, and the backwash mends you for ${heal}.`);
      break;
    }
    case "earth": {
      state.combat.defBuffTurns = 3;
      state.combat.defBuffAmount = Math.max(3, Math.round((state.magic / 3) * dmgMult));
      out.push(`Your skin hardens to something between flesh and stone — your defenses surge for the next few turns.`);
      break;
    }
    case "lightning": {
      const dmg1 = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
      state.combat.hp -= dmg1;
      out.push(`${ELEMENTS.lightning.verb(withThe(creature.name, false))} for ${dmg1} damage —`);
      if (state.combat.hp > 0) {
        const dmg2 = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
        state.combat.hp -= dmg2;
        out.push(`— and again, for ${dmg2} more before it can react.`);
      }
      break;
    }
    case "acid": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
      state.combat.hp -= dmg;
      state.combat.corroded = true;
      state.combat.enemyDefPenalty = (state.combat.enemyDefPenalty || 0) + 4;
      out.push(`${ELEMENTS.acid.verb(withThe(creature.name, false))} for ${dmg} damage — its defenses will be weaker against you for the rest of this fight.`);
      break;
    }
    case "force": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
      state.combat.hp -= dmg;
      state.combat.enemyStunned = true;
      out.push(`${ELEMENTS.force.verb(withThe(creature.name, false))} for ${dmg} damage — it reels, stunned.`);
      break;
    }
    case "transportation": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * 1.3 * dmgMult);
      state.combat.hp -= dmg;
      out.push(`${ELEMENTS.transportation.verb(withThe(creature.name, false))} for ${dmg} damage before it can track where you went.`);
      break;
    }
    case "air": {
      const dmg = Math.round(rollPlayerDamage(state, creature, elementKey) * dmgMult);
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

  out.push(...resolveEnemyRetaliation(state, creature, 2));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}
