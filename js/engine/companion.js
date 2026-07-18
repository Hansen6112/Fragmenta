/*
 * FRAGMENTA — Companion Ability Engine
 * Extends Ally System Core v1 (engine/combat.js's resolveAllyActions,
 * still exactly as it was for any ally with no abilityKit — Kessa is
 * entirely unaffected by this file) with individual per-ability
 * cooldowns, taunt/damage-reduction windows, and a stance-conditioned AI,
 * for allies whose ALLY_DEFS entry (data/allies.js) carries an
 * `abilityKit`. Hadrian Voric (data/hadrian.js) is the first and only
 * real user of it.
 *
 * Design honesty, matching this codebase's own convention (see
 * data/enemyabilities.js's header on inert-but-declared fields): a few
 * pieces of Hadrian's kit have no real mechanical hook to attach to yet
 * and are left as flavor/declared-but-inert rather than faked:
 *   - His Poison/Toxic/Decay vulnerability (data/hadrian.js's
 *     HADRIAN.vulnerability) maps onto the `venom` status effect, but
 *     nothing in this engine currently inflicts a status effect on an
 *     ALLY (only on the player) — so this multiplier has no live trigger
 *     today. Kept as data for whenever that changes.
 *   - Groundbreaker's -10 Accuracy debuff on enemies IS wired (see
 *     applyGroundbreakerAccuracyDebuff/tickGroundbreakerDebuffs below).
 *
 * "Ally danger threshold" (used by both Target Switching and Ally
 * Protection in the source record, but never given an exact number
 * there) is this implementation's own choice: 40% of max Health.
 */

// ---- Per-ally per-fight state ----
// Lazily attached the first time a kit-bearing ally acts in a fight, and
// reset at the start of every new fight (resetCompanionCombatState) —
// mirrors the enemy side's PER_ENEMY_FIELDS convention (combat.js), just
// living directly on the ally object since allies have no single-active-
// target proxy to piggyback on.
function ensureCompanionFields(ally) {
  if (ally._companionFieldsReady) return;
  ally._companionFieldsReady = true;
  ally.abilityCooldowns = {};
  ally.passiveOnceFlags = {};
  ally.tauntTurnsLeft = 0;
  ally.dmgReductionPct = 0;
  ally.dmgReductionTurnsLeft = 0;
  ally.bonusDefAmount = 0;
  ally.bonusDefTurnsLeft = 0;
  ally.empoweredStrikePct = 0;
  ally.empoweredStrikeTurnsLeft = 0;
  ally.retaliatePct = 0;
  ally.retaliateTurnsLeft = 0;
  ally.ultimateTurnsLeft = 0;
  ally.ultimateAtkPct = 0;
  ally.ultimateDefPct = 0;
  ally.combatStartHealth = ally.health;
  ally.healthLostPctThisCombat = 0;
  ally.roundsInCombat = 0;
}

// combat.js's startCombat calls this once per alive kit-bearing ally
// when a new fight begins — cooldowns/once-per-combat flags/taunts don't
// carry over between fights, same as an enemy's own fresh record does.
function resetCompanionCombatState(state) {
  for (const ally of aliveAllies(state)) {
    if (!ALLY_DEFS[ally.defId] || !ALLY_DEFS[ally.defId].abilityKit) continue;
    ally._companionFieldsReady = false;
    ensureCompanionFields(ally);
  }
}

// combat.js's beginTurn calls this every round for every alive
// kit-bearing ally — decrements cooldowns and every buff-turn counter,
// clearing the buff's own numeric fields the instant its counter hits 0
// (same "field says 0 when inactive" contract the enemy side already
// uses for its own buff-turn fields).
function tickCompanionCombatTimers(state) {
  for (const ally of aliveAllies(state)) {
    if (!ALLY_DEFS[ally.defId] || !ALLY_DEFS[ally.defId].abilityKit) continue;
    ensureCompanionFields(ally);
    for (const id of Object.keys(ally.abilityCooldowns)) {
      if (ally.abilityCooldowns[id] > 0) ally.abilityCooldowns[id] -= 1;
    }
    if (ally.tauntTurnsLeft > 0) ally.tauntTurnsLeft -= 1;
    if (ally.dmgReductionTurnsLeft > 0) {
      ally.dmgReductionTurnsLeft -= 1;
      if (ally.dmgReductionTurnsLeft === 0) ally.dmgReductionPct = 0;
    }
    if (ally.bonusDefTurnsLeft > 0) {
      ally.bonusDefTurnsLeft -= 1;
      if (ally.bonusDefTurnsLeft === 0) ally.bonusDefAmount = 0;
    }
    if (ally.empoweredStrikeTurnsLeft > 0) {
      ally.empoweredStrikeTurnsLeft -= 1;
      if (ally.empoweredStrikeTurnsLeft === 0) ally.empoweredStrikePct = 0;
    }
    if (ally.retaliateTurnsLeft > 0) {
      ally.retaliateTurnsLeft -= 1;
      if (ally.retaliateTurnsLeft === 0) ally.retaliatePct = 0;
    }
    if (ally.ultimateTurnsLeft > 0) {
      ally.ultimateTurnsLeft -= 1;
      if (ally.ultimateTurnsLeft === 0) {
        ally.ultimateAtkPct = 0;
        ally.ultimateDefPct = 0;
      }
    }
  }
  tickGroundbreakerDebuffs(state);
}

// Groundbreaker's -10 Accuracy debuff lives on state.combat rather than
// on the shared enemy-record schema (touched by every creature in the
// game) — a small transient list of { enemy, amount, turnsLeft } that
// restores the Accuracy it took once its duration ends.
function applyGroundbreakerAccuracyDebuff(state, enemyRecord, amount, turns) {
  if (!state.combat.groundbreakerDebuffs) state.combat.groundbreakerDebuffs = [];
  enemyRecord.creatureObj.acc = Math.max(0, (enemyRecord.creatureObj.acc || 0) - amount);
  state.combat.groundbreakerDebuffs.push({ enemy: enemyRecord, amount, turnsLeft: turns });
}
function tickGroundbreakerDebuffs(state) {
  if (!state.combat || !state.combat.groundbreakerDebuffs) return;
  state.combat.groundbreakerDebuffs = state.combat.groundbreakerDebuffs.filter((d) => {
    d.turnsLeft -= 1;
    if (d.turnsLeft > 0) return true;
    if (d.enemy.alive) d.enemy.creatureObj.acc = (d.enemy.creatureObj.acc || 0) + d.amount;
    return false;
  });
}

// pickEnemyAttackTarget (combat.js) calls this FIRST — a taunt in effect
// (Shielding Presence/Champion's Challenge/Last Bastion, all sharing this
// one slot per the source record's own "shares a single taunt status"
// notes) forces every enemy target roll onto the tauntING ally instead of
// the usual random player/ally split, for as long as tauntTurnsLeft > 0.
function getForcedAllyTarget(state) {
  for (const ally of aliveAllies(state)) {
    if (ally.tauntTurnsLeft > 0) return ally;
  }
  return null;
}

// "Highest Danger Class tier present" — Target Switching's own source of
// truth, reused here for both target selection and the opener rule.
const DANGER_TIER_RANK = { normal: 0, elite: 1, boss: 2, world_boss: 3 };
function highestDangerTierRank(enemies) {
  return enemies.reduce((best, e) => Math.max(best, DANGER_TIER_RANK[e.creatureObj.dangerClass] ?? 0), 0);
}

// Target Switching (Section 8.6): always the highest-tier enemy present,
// ties broken toward whoever's closest to death.
function pickHadrianTarget(enemies) {
  let best = null;
  for (const e of enemies) {
    if (!best) { best = e; continue; }
    const tier = DANGER_TIER_RANK[e.creatureObj.dangerClass] ?? 0;
    const bestTier = DANGER_TIER_RANK[best.creatureObj.dangerClass] ?? 0;
    if (tier > bestTier || (tier === bestTier && e.hp < best.hp)) best = e;
  }
  return best;
}

const ALLY_DANGER_THRESHOLD = 0.4; // see file header — not a source-specified number
function isAnyoneInDanger(state, protectingAlly) {
  if (state.health / state.maxHealth < ALLY_DANGER_THRESHOLD) return true;
  return aliveAllies(state).some((a) => a !== protectingAlly && a.health / a.maxHealth < ALLY_DANGER_THRESHOLD);
}
function isAnyoneInRealDanger(state, protectingAlly) {
  const t = 0.25;
  if (state.health / state.maxHealth < t) return true;
  return aliveAllies(state).some((a) => a !== protectingAlly && a.health / a.maxHealth < t);
}

function abilityReady(ally, ability) {
  return ally.level >= ability.level && !(ally.abilityCooldowns[ability.id] > 0);
}
function findReadyActive(ally, kit, id) {
  const a = kit.actives.find((x) => x.id === id);
  return a && abilityReady(ally, a) ? a : null;
}
function findReadyTaunt(ally, kit) {
  // Prefer Champion's Challenge (shorter cooldown, more reliable) once
  // unlocked, per Section 8.6's "the more reliable purpose-built taunt".
  return findReadyActive(ally, kit, "champions_challenge") || findReadyActive(ally, kit, "shielding_presence") || findReadyActive(ally, kit, "last_bastion");
}

// Veteran of a Hundred Battles (Section 8.4): +2% Accuracy/+2%
// retaliation damage per 10% max Health lost so far this combat, capped
// +20%/+20% — recalculated from ally.healthLostPctThisCombat, which
// applyCompanionDamageTaken keeps current.
function veteranBonusPct(ally, kit) {
  const passive = kit.passives.find((p) => p.id === "veteran_of_a_hundred_battles" && ally.level >= p.level);
  if (!passive) return 0;
  return Math.min(passive.capPct, Math.floor(ally.healthLostPctThisCombat / 0.1) * passive.pctPer10);
}

// The single entry point combat.js's resolveAllyActions calls for any
// ally whose ALLY_DEFS entry carries an abilityKit — one action per
// round, exactly like the generic 3-stance dispatch it replaces.
function resolveCompanionAction(state, ally) {
  ensureCompanionFields(ally);
  const kit = ALLY_DEFS[ally.defId].abilityKit;
  ally.roundsInCombat += 1;
  const enemies = state.combat.enemies.filter((e) => e.alive);
  if (!enemies.length) return [];

  const isOpener = ally.roundsInCombat === 1;
  const openerIsToughFight = highestDangerTierRank(enemies) > DANGER_TIER_RANK.normal;
  const readyTaunt = findReadyTaunt(ally, kit);

  // Ally Protection (proactive) / opener-vs-elite: fire the best taunt
  // available rather than waiting for a hit to land.
  if (readyTaunt && ally.tauntTurnsLeft <= 0 && ((isOpener && openerIsToughFight) || isAnyoneInDanger(state, ally))) {
    return useHadrianActive(state, ally, kit, readyTaunt, enemies);
  }

  if (isOpener) {
    const cb = findReadyActive(ally, kit, "crushing_blow");
    if (cb) return useHadrianActive(state, ally, kit, cb, enemies);
  }

  // Reserved for fights going long, or real danger to someone.
  const goingLong = ally.roundsInCombat >= 4;
  const realDanger = isAnyoneInRealDanger(state, ally);
  const lastBastion = findReadyActive(ally, kit, "last_bastion");
  if (lastBastion && (goingLong || realDanger)) return useHadrianActive(state, ally, kit, lastBastion, enemies);
  const arenaIncarnate = findReadyActive(ally, kit, "arena_incarnate");
  if (arenaIncarnate && (ally.roundsInCombat >= 5 || realDanger)) return useHadrianActive(state, ally, kit, arenaIncarnate, enemies);

  // Proactive self-sustain — used the moment Health drops meaningfully,
  // not held for a crisis (allies have no status-effect system to
  // cleanse yet, so the "a status effect lands" half of this trigger
  // never fires today — see file header).
  const unyieldingAdvance = findReadyActive(ally, kit, "unyielding_advance");
  if (unyieldingAdvance && ally.health / ally.maxHealth < 0.7) return useHadrianActive(state, ally, kit, unyieldingAdvance, enemies);

  // Arena Incarnate window: lean hard into Crushing Blow to chain its
  // cooldown-refresh-on-hit, overriding the stance default.
  if (ally.ultimateTurnsLeft > 0) {
    const cb = findReadyActive(ally, kit, "crushing_blow");
    if (cb) return useHadrianActive(state, ally, kit, cb, enemies);
  }

  if (ally.stance === "aggressive") {
    const groundbreaker = findReadyActive(ally, kit, "groundbreaker");
    if (groundbreaker && enemies.length > 1) return useHadrianActive(state, ally, kit, groundbreaker, enemies);
    const cb = findReadyActive(ally, kit, "crushing_blow");
    if (cb) return useHadrianActive(state, ally, kit, cb, enemies);
  } else {
    // Defensive (default) / Support: fill an otherwise-idle turn with
    // whatever's off cooldown rather than doing nothing.
    if (readyTaunt && ally.tauntTurnsLeft <= 0) return useHadrianActive(state, ally, kit, readyTaunt, enemies);
    const cb = findReadyActive(ally, kit, "crushing_blow");
    if (cb) return useHadrianActive(state, ally, kit, cb, enemies);
  }

  return basicCompanionAttack(state, ally, enemies);
}

// Fallback when nothing is off cooldown — the same plain-attack formula
// allyAggressiveAction already uses for Kessa, targeting the same
// highest-tier/closest-to-death enemy Hadrian's kit always prefers.
function basicCompanionAttack(state, ally, enemies) {
  const target = pickHadrianTarget(enemies);
  if (!attackConnects(ally.accuracy, target.creatureObj.agi, veteranBonusPct(ally, ALLY_DEFS[ally.defId].abilityKit))) {
    return [`${ally.name} lunges at ${withThe(target.creatureObj.name, false)} and misses.`];
  }
  const dmg = Math.max(1, randInt(Math.round(ally.atk * 0.85), Math.round(ally.atk * 1.15)) - Math.round((target.creatureObj.def || 0) * 0.5));
  target.hp -= dmg;
  target.lastDamageType = "physical";
  const lines = [`${ally.name} strikes ${withThe(target.creatureObj.name, false)} for ${dmg} damage.`];
  if (target.hp <= 0 && target.alive) lines.push(...killEnemyAsAlly(state, target));
  return lines;
}

// Kills an enemy record on an ally's behalf — resolveKill (combat.js)
// reads state.combat.activeIndex to know which record died, so this
// briefly points it at the target (same dance resolveOrSkipRetaliation
// already does for a non-active pack member), rather than requiring the
// ally to be attacking whichever enemy the PLAYER currently has active.
function killEnemyAsAlly(state, target) {
  const idx = state.combat.enemies.indexOf(target);
  const prevActive = state.combat.activeIndex;
  state.combat.activeIndex = idx;
  const lines = resolveKill(state, target.creatureObj);
  if (state.combat) state.combat.activeIndex = Math.min(prevActive, state.combat.enemies.length - 1);
  return lines;
}

// Executes one of Hadrian's Active abilities — damage math, cooldowns,
// and the handful of stateful side effects (taunt windows, Empowered
// Strike, self-heal/cleanse) his kit actually needs.
function useHadrianActive(state, ally, kit, ability, enemies) {
  ally.abilityCooldowns[ability.id] = ability.cooldown;
  const lines = [];
  const veteranPct = veteranBonusPct(ally, kit);

  if (ability.id === "shielding_presence" || ability.id === "champions_challenge" || ability.id === "last_bastion") {
    ally.tauntTurnsLeft = ability.tauntTurns;
    if (ability.dmgReductionPct) { ally.dmgReductionPct = ability.dmgReductionPct; ally.dmgReductionTurnsLeft = ability.dmgReductionTurns; }
    if (ability.bonusDef) { ally.bonusDefAmount = ability.bonusDef; ally.bonusDefTurnsLeft = ability.bonusDefTurns; }
    if (ability.retaliatePct) { ally.retaliatePct = ability.retaliatePct; ally.retaliateTurnsLeft = ability.retaliateTurns; }
    lines.push(`${ally.name} plants himself between the party and the fight, daring every enemy present to come through him instead.`);
    return lines;
  }

  if (ability.id === "unyielding_advance") {
    const healAmount = Math.round(ally.maxHealth * ability.healPct);
    ally.health = Math.min(ally.maxHealth, ally.health + healAmount);
    ally.passiveOnceFlags = {}; // "removes all negative status effects" — no ally status system exists yet (see file header), so this just clears his own once-per-combat gates as the nearest equivalent of a fresh start
    ally.empoweredStrikePct = ability.empoweredStrikePct;
    ally.empoweredStrikeTurnsLeft = ability.empoweredStrikeTurns;
    lines.push(`${ally.name} plants his maul and steadies himself, mending for ${healAmount} health.`);
    return lines;
  }

  if (ability.id === "arena_incarnate") {
    ally.ultimateTurnsLeft = ability.ultimateTurns;
    ally.ultimateAtkPct = ability.ultimateAtkPct;
    ally.ultimateDefPct = ability.ultimateDefPct;
    lines.push(`${ally.name} plants his feet — for a moment he fights like the Ovum's undefeated Champion all over again.`);
    return lines;
  }

  // Crushing Blow / Groundbreaker — direct damage.
  const target = pickHadrianTarget(enemies);
  const atkBonus = 1 + (ally.ultimateTurnsLeft > 0 ? ally.ultimateAtkPct : 0);
  if (!attackConnects(ally.accuracy, target.creatureObj.agi, veteranPct)) {
    lines.push(`${ally.name} swings ${ability.name} and misses.`);
    return lines;
  }
  const empowered = ability.consumesEmpoweredStrike && ally.empoweredStrikeTurnsLeft > 0;
  const empoweredMult = empowered ? 1 + ally.empoweredStrikePct : 1;
  if (empowered) { ally.empoweredStrikePct = 0; ally.empoweredStrikeTurnsLeft = 0; }
  const baseAtk = ally.atk * atkBonus * empoweredMult;
  const defIgnore = ability.defIgnorePct || 0;
  const primaryDmg = Math.max(1, Math.round(baseAtk * ability.atkMult) - Math.round((target.creatureObj.def || 0) * (1 - defIgnore) * 0.5));
  target.hp -= primaryDmg;
  target.lastDamageType = "physical";
  lines.push(`${ally.name} lands ${ability.name} on ${withThe(target.creatureObj.name, false)} for ${primaryDmg} damage.`);
  let killedAny = target.hp <= 0 && target.alive;
  if (killedAny) lines.push(...killEnemyAsAlly(state, target));

  if (ability.splashAll) {
    for (const e of enemies) {
      if (e === target || !e.alive) continue;
      const splashDmg = Math.max(1, Math.round(baseAtk * ability.splashAtkMult) - Math.round((e.creatureObj.def || 0) * 0.5));
      e.hp -= splashDmg;
      e.lastDamageType = "physical";
      lines.push(`The blow's shockwave catches ${withThe(e.creatureObj.name, false)} for ${splashDmg} damage.`);
      if (ability.accuracyDebuff) applyGroundbreakerAccuracyDebuff(state, e, ability.accuracyDebuff, ability.accuracyDebuffTurns);
      if (e.hp <= 0 && e.alive) { lines.push(...killEnemyAsAlly(state, e)); killedAny = true; }
    }
    if (ability.accuracyDebuff && target.alive) applyGroundbreakerAccuracyDebuff(state, target, ability.accuracyDebuff, ability.accuracyDebuffTurns);
  }

  if (killedAny) maybeTriggerBloodboundParagon(state, ally, kit);
  return lines;
}

// Bloodbound Paragon (Section 8.4, level 25): on a killing blow, cleanse
// self + the lowest-Health living ally and grant that ally +10% damage
// reduction — reuses the same "no ally status system yet" caveat as
// Unyielding Advance's cleanse.
function maybeTriggerBloodboundParagon(state, ally, kit) {
  const passive = kit.passives.find((p) => p.id === "bloodbound_paragon" && ally.level >= p.level);
  if (!passive) return;
  const others = aliveAllies(state).filter((a) => a !== ally);
  if (!others.length) return;
  const lowest = others.reduce((a, b) => (a.health / a.maxHealth <= b.health / b.maxHealth ? a : b));
  lowest.dmgReductionPct = Math.max(lowest.dmgReductionPct || 0, passive.allyDmgReductionPct);
  lowest.dmgReductionTurnsLeft = passive.allyBuffTurns;
  ensureCompanionFields(lowest);
}

// combat.js's resolveEnemyAttackOnAlly calls this right after computing
// raw damage and before applying it to ally.health — folds in every
// kit-bearing ally's damage mitigation (taunt/Unbroken Will/Arena
// Incarnate reductions, Champion's Resolve's non-fatal floor) and keeps
// Veteran of a Hundred Battles' running "% Health lost this combat"
// tally current. No-ops entirely for an ally with no abilityKit.
function applyCompanionDamageTaken(ally, rawDmg) {
  const def = ALLY_DEFS[ally.defId];
  if (!def || !def.abilityKit) return { dmg: rawDmg, lines: [] };
  ensureCompanionFields(ally);
  const kit = def.abilityKit;
  const lines = [];
  let dmg = rawDmg;

  let reductionPct = ally.dmgReductionTurnsLeft > 0 ? ally.dmgReductionPct : 0;
  const unbrokenWill = kit.passives.find((p) => p.id === "unbroken_will" && ally.level >= p.level);
  if (unbrokenWill && ally.health / ally.maxHealth < unbrokenWill.threshold) reductionPct += unbrokenWill.dmgReductionPct;
  dmg = Math.max(0, Math.round(dmg * (1 - Math.min(0.9, reductionPct))));

  const resolve = kit.passives.find((p) => p.id === "champions_resolve" && ally.level >= p.level);
  const projected = ally.health - dmg;
  if (resolve && !ally.passiveOnceFlags.champions_resolve && projected > 0 && projected < ally.maxHealth * resolve.floorPct) {
    ally.passiveOnceFlags.champions_resolve = true;
    dmg = Math.max(0, ally.health - Math.ceil(ally.maxHealth * resolve.floorPct));
    lines.push(`${ally.name} refuses to go down that easily — Champion's Resolve holds the line.`);
  }

  ally.healthLostPctThisCombat = Math.min(1, Math.max(ally.healthLostPctThisCombat, (ally.combatStartHealth - (ally.health - dmg)) / ally.maxHealth));
  return { dmg, lines };
}

// combat.js's resolveEnemyAttackOnAlly calls this right after applying
// damage — Last Bastion's automatic retaliation against whichever enemy
// just struck him, boosted by Veteran of a Hundred Battles' scaling
// retaliation-damage bonus.
function maybeCompanionRetaliate(state, ally, creatureThatAttacked) {
  const def = ALLY_DEFS[ally.defId];
  if (!def || !def.abilityKit || ally.retaliateTurnsLeft <= 0) return [];
  const idx = state.combat.enemies.findIndex((e) => e.creatureObj === creatureThatAttacked);
  if (idx === -1 || !state.combat.enemies[idx].alive) return [];
  const record = state.combat.enemies[idx];
  const veteranPct = veteranBonusPct(ally, def.abilityKit);
  const dmg = Math.max(1, Math.round(ally.atk * (ally.retaliatePct + veteranPct)) - Math.round((record.creatureObj.def || 0) * 0.5));
  record.hp -= dmg;
  record.lastDamageType = "physical";
  const lines = [`${ally.name} answers the blow, retaliating against ${withThe(creatureThatAttacked.name, false)} for ${dmg} damage.`];
  if (record.hp <= 0 && record.alive) lines.push(...killEnemyAsAlly(state, record));
  return lines;
}
