/*
 * FRAGMENTA — Combat Resolution
 * Deliberately simple: this is a narrative encounter layer, not a tactics
 * simulator. Creature `tier` (0-5) drives how hard the fight is.
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

function startCombat(state, creatureId) {
  const creature = BESTIARY[creatureId];
  state.combat = {
    creatureId,
    name: creature.name,
    hp: creature.hp,
    maxHp: creature.hp,
  };
  return [
    `${articled(creature.name)} blocks your path.`,
    creature.description,
    creature.friendly
      ? `It does not seem hostile. (try: talk, examine, or leave)`
      : `(fight / flee)`,
  ];
}

function playerAttack(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  const creature = BESTIARY[state.combat.creatureId];
  const out = [];

  if (creature.friendly) {
    return [`${withThe(creature.name, true)} has done you no harm. Attacking it seems both unwise and unkind.`];
  }

  const dmg = Math.max(1, randInt(state.atk - 2, state.atk + 2) - Math.floor(creature.def / 3));
  state.combat.hp -= dmg;
  out.push(`You strike ${withThe(creature.name, false)} for ${dmg} damage.`);

  if (state.combat.hp <= 0) {
    out.push(`${withThe(creature.name, true)} falls. ${creature.combatNotes || ""}`.trim());
    // Mercenaries work bounties for a living — a little extra coin for the kill.
    const bounty = state.flags.isMercenary ? 1.5 : 1;
    const goldFound = Math.round(randInt(1, 4) * (creature.tier + 1) * bounty);
    state.gold += goldFound;
    out.push(`You find ${goldFound} gold on/near the creature.`);
    state.combat = null;
    out.push(...checkJobProgressOnKill(state, creature));
    return out;
  }

  // enemy retaliates
  const edmg = Math.max(0, randInt(creature.atk - 1, creature.atk + 2) - state.def);
  state.health -= edmg;
  if (edmg > 0) {
    out.push(`${withThe(creature.name, true)} hits back for ${edmg} damage.`);
  } else {
    out.push(`You take no damage from its counter.`);
  }

  if (state.health <= 0) {
    out.push(`Everything goes dark.`);
  }

  return out;
}

function attemptFlee(state) {
  if (!state.combat) return ["There's nothing to flee from."];
  const creature = BESTIARY[state.combat.creatureId];
  const chance = 0.6 - creature.tier * 0.08 + (state.stealthMod || 0);
  if (Math.random() < chance) {
    state.combat = null;
    return [`You break away from ${withThe(creature.name, false)} and put distance between you.`];
  }
  const edmg = Math.max(0, randInt(creature.atk - 1, creature.atk + 1) - state.def);
  state.health -= edmg;
  return [`You fail to get clear. ${withThe(creature.name, true)} catches you for ${edmg} damage as you turn.`];
}
