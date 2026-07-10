/*
 * FRAGMENTA — Combat Resolution
 * A narrative encounter layer, not a full tactics simulator: plain
 * `fight`/`flee` plus a small Knowledge-gated actions layer (data/
 * tactics.js — Feint, Decoy, Ambush, Disarm). Creature `tier` (0-5)
 * drives how hard the fight is.
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Ages every active tactic cooldown by one turn. Called at the start of
// whichever combat action actually executes (not on rejected/invalid
// attempts, which don't consume a turn).
function tickCooldowns(combat) {
  for (const key of Object.keys(combat.cooldowns)) {
    if (combat.cooldowns[key] > 0) combat.cooldowns[key] -= 1;
  }
}

function tacticAvailable(state, tacticId) {
  if (!state.combat) return false;
  const t = TACTICS[tacticId];
  if (state.knowledge < t.knowledgeReq) return false;
  if (tacticId === "ambush") return !state.combat.turnTaken;
  if (tacticId === "disarm" && state.combat.disarmed) return false;
  return (state.combat.cooldowns[tacticId] || 0) <= 0;
}

// Reusable prompt suffix: "(fight / flee / feint / ambush)" etc, listing
// only tactics that are both unlocked and currently usable this turn.
function tacticsLine(state) {
  if (!state.combat) return null;
  const usable = unlockedTactics(state).filter((id) => tacticAvailable(state, id));
  if (!usable.length) return null;
  return `(fight / flee / ${usable.map((id) => TACTICS[id].name.toLowerCase()).join(" / ")})`;
}

function startCombat(state, creatureId) {
  const creature = BESTIARY[creatureId];
  state.combat = {
    creatureId,
    name: creature.name,
    hp: creature.hp,
    maxHp: creature.hp,
    turnTaken: false, // flips true after any action; gates Ambush
    disarmed: false, // whether Disarm has already landed on this target
    enemyAtkPenalty: 0, // lasting attack reduction from Disarm
    nextAttackBonus: false, // set by Feint, consumed by the next fight/tactic hit
    cooldowns: {},
  };
  const lines = [
    `${articled(creature.name)} blocks your path.`,
    creature.description,
  ];
  if (creature.friendly) {
    lines.push(`It does not seem hostile. (try: talk, examine, or leave)`);
  } else {
    lines.push(tacticsLine(state) || "(fight / flee)");
  }
  return lines;
}

// Shared victory handling — gold, XP, job progress, ending combat.
function resolveKill(state, creature) {
  const out = [`${withThe(creature.name, true)} falls. ${creature.combatNotes || ""}`.trim()];
  const bounty = state.flags.isMercenary ? 1.5 : 1;
  const goldFound = Math.round(randInt(1, 4) * (creature.tier + 1) * bounty);
  state.gold += goldFound;
  out.push(`You find ${goldFound} gold on/near the creature.`);
  state.combat = null;
  out.push(...state.gainXp(xpFromKill(creature)));
  out.push(...checkJobProgressOnKill(state, creature));
  return out;
}

function playerAttack(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  const creature = BESTIARY[state.combat.creatureId];

  if (creature.friendly) {
    return [`${withThe(creature.name, true)} has done you no harm. Attacking it seems both unwise and unkind.`];
  }

  tickCooldowns(state.combat);
  state.combat.turnTaken = true;

  const out = [];
  let dmg = Math.max(1, randInt(state.atk - 2, state.atk + 2) - Math.floor(creature.def / 3));
  if (state.combat.nextAttackBonus) {
    dmg = Math.round(dmg * 1.6);
    state.combat.nextAttackBonus = false;
    out.push("Your feint pays off —");
  }
  state.combat.hp -= dmg;
  out.push(`You strike ${withThe(creature.name, false)} for ${dmg} damage.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 2) - state.def);
  state.health -= edmg;
  out.push(edmg > 0 ? `${withThe(creature.name, true)} hits back for ${edmg} damage.` : `You take no damage from its counter.`);
  if (state.health <= 0) out.push(`Everything goes dark.`);

  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function attemptFlee(state) {
  if (!state.combat) return ["There's nothing to flee from."];
  const creature = BESTIARY[state.combat.creatureId];
  tickCooldowns(state.combat);

  const chance = 0.6 - creature.tier * 0.08 + (state.stealthMod || 0);
  if (Math.random() < chance) {
    state.combat = null;
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`];
  }

  state.combat.turnTaken = true;
  const edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 1) - state.def);
  state.health -= edmg;
  const out = [`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`];
  if (state.health <= 0) out.push(`Everything goes dark.`);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useFeint(state) {
  if (!state.combat) return ["There's nothing here to feint at."];
  const creature = BESTIARY[state.combat.creatureId];
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. A feint would be wasted.`];
  const t = TACTICS.feint;
  if (state.knowledge < t.knowledgeReq) return [`You don't know how to feint yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.feint || 0) > 0) return [`Feint is still recovering — ${state.combat.cooldowns.feint} more turn(s).`];

  tickCooldowns(state.combat);
  state.combat.turnTaken = true;
  state.combat.nextAttackBonus = true;
  state.combat.cooldowns.feint = t.cooldown;

  const out = [`You feint — ${withThe(creature.name, false)} doesn't bite, but your next strike will land hard.`];
  const edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 2) - state.def);
  state.health -= edmg;
  out.push(edmg > 0 ? `${withThe(creature.name, true)} hits you for ${edmg} damage while you're feinting.` : `${withThe(creature.name, true)} misses.`);
  if (state.health <= 0) out.push(`Everything goes dark.`);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}

function useDecoy(state) {
  if (!state.combat) return ["There's nothing here to use that on."];
  const creature = BESTIARY[state.combat.creatureId];
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't attacking you. No need for a decoy.`];
  const t = TACTICS.decoy;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.decoy || 0) > 0) return [`Decoy is still recovering — ${state.combat.cooldowns.decoy} more turn(s).`];

  tickCooldowns(state.combat);
  state.combat.turnTaken = true;
  state.combat.cooldowns.decoy = t.cooldown;

  const out = [`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`];
  const dmg = Math.max(1, randInt(state.atk - 2, state.atk + 2) - Math.floor(creature.def / 3));
  state.combat.hp -= dmg;
  out.push(`You strike ${withThe(creature.name, false)} for ${dmg} damage while it's distracted.`);

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
  const creature = BESTIARY[state.combat.creatureId];
  if (creature.friendly) return [`${withThe(creature.name, true)} hasn't given you a reason to ambush it.`];
  const t = TACTICS.ambush;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.turnTaken) return [`The moment's passed — ambush only works as your opening move.`];

  tickCooldowns(state.combat);
  state.combat.turnTaken = true;

  const dmg = Math.max(1, randInt(state.atk, state.atk + 4) - Math.floor(creature.def / 3));
  state.combat.hp -= dmg;
  const out = [`You strike first — ${withThe(creature.name, false)} never saw it coming. ${dmg} damage, no counter.`];

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
  const creature = BESTIARY[state.combat.creatureId];
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't armed against you. Nothing to disarm.`];
  const t = TACTICS.disarm;
  if (state.knowledge < t.knowledgeReq) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.disarmed) return [`It's already lost whatever you could have disarmed.`];
  if ((state.combat.cooldowns.disarm || 0) > 0) return [`Disarm is still recovering — ${state.combat.cooldowns.disarm} more turn(s).`];

  tickCooldowns(state.combat);
  state.combat.turnTaken = true;
  state.combat.cooldowns.disarm = t.cooldown;
  state.combat.disarmed = true;
  state.combat.enemyAtkPenalty = (state.combat.enemyAtkPenalty || 0) + 3;

  const out = [`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`];
  const dmg = Math.max(1, randInt(state.atk - 3, state.atk) - Math.floor(creature.def / 3));
  state.combat.hp -= dmg;
  out.push(`You still land a hit for ${dmg} damage.`);

  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    return out;
  }

  const edmg = Math.max(0, randInt(effectiveEnemyAtk(state, creature) - 1, effectiveEnemyAtk(state, creature) + 2) - state.def);
  state.health -= edmg;
  out.push(edmg > 0 ? `${withThe(creature.name, true)} hits back for ${edmg} damage — visibly weaker now.` : `You take no damage from its counter.`);
  if (state.health <= 0) out.push(`Everything goes dark.`);
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return out;
}
