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
 *     HADRIAN.vulnerability) and its Iron Faith offset (below) map onto
 *     the `venom` status effect, but nothing in this engine currently
 *     inflicts a status effect on an ALLY (only on the player) — so
 *     neither multiplier has a live trigger today. Kept as data for
 *     whenever that changes.
 *   - Steadfast Gaze (Accuracy-reduction immunity) and Grounded Resolve
 *     (Initiative-reduction resistance), both from the Legendary
 *     ascension below — nothing currently reduces an ALLY's Accuracy or
 *     Speed either (only an enemy's, via the player's own Disarm/
 *     Groundbreaker), so both are declared and otherwise inert.
 *   - Groundbreaker's -10 Accuracy debuff on enemies IS wired (see
 *     applyGroundbreakerAccuracyDebuff/tickGroundbreakerDebuffs below).
 *
 * "Ally danger threshold" (used by both Target Switching and Ally
 * Protection in the source record, but never given an exact number
 * there) is this implementation's own choice: 40% of max Health.
 *
 * ---- Legendary ascension ("The Bloodbound Champion's Regalia") ----
 * Hadrian's Personal Quest reward (data/hadrianquest.js). Since the
 * ascension happens atomically — all six pieces swapped in at once on
 * quest completion, never gradually — there's no partial 2pc/4pc set
 * state to model; hasAscendedRegalia below is a single boolean standing
 * in for the whole ladder (2pc/4pc/6pc effects all apply together, or
 * none do). Legion's Memory's "+15% damage reduction for 2 turns" for
 * the OTHER (non-Hadrian, possibly non-kit-bearing) ally it protects has
 * no generic buff-duration hook to attach to for an ally like Kessa, who
 * carries no companion fields at all — so that half is applied as an
 * immediate flat discount on the single hit being redirected, rather
 * than a genuine 2-turn window. Hadrian's own share of that same buff
 * IS a real 2-turn window, since he already has the fields for it.
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
  // Legendary ascension (see file header) — permanent-for-this-fight
  // bonuses set once at combat start, plus the reactive/consumable
  // fields its Trinkets and set bonus use.
  ally.ascendedSetDefBonus = 0; // "2pc" flat +3 Def, always on while ascended
  ally.noNameForgottenDefBonus = 0; // Trinket I, set at combat start
  ally.paidInBloodStacks = 0; // Sash passive, +1 Atk per kill this combat
  ally.finalRespectPct = 0; // Trinket II, consumed by the next successful hit
  ally.reactiveDefBonus = 0; // Brothers in Arms / Honor Beyond Death
  ally.reactiveAtkBonus = 0;
  ally.reactiveBuffTurnsLeft = 0;
}

// combat.js's startCombat calls this once per alive kit-bearing ally
// when a new fight begins — cooldowns/once-per-combat flags/taunts don't
// carry over between fights, same as an enemy's own fresh record does.
function resetCompanionCombatState(state) {
  for (const ally of aliveAllies(state)) {
    if (!ALLY_DEFS[ally.defId] || !ALLY_DEFS[ally.defId].abilityKit) continue;
    ally._companionFieldsReady = false;
    ensureCompanionFields(ally);
    if (hasAscendedRegalia(ally)) {
      ally.ascendedSetDefBonus = 3; // "2pc" of "The Unbroken Champion"
      if (ally.equipment.trinkets.includes("The Roll of the Ferratum")) {
        // No Name Forgotten: Defense equal to the number of OTHER living
        // allies, capped at +4.
        const others = aliveAllies(state).filter((a) => a !== ally).length;
        ally.noNameForgottenDefBonus = Math.min(4, others);
      }
    }
  }
}

// Whether every one of Hadrian's six starting pieces has been swapped
// for its ascended replacement (data/hadrianquest.js's
// HADRIAN_ASCENSION_MAP) — see file header on why this is a single
// boolean, not a partial-tier count.
function hasAscendedRegalia(ally) {
  return Object.entries(HADRIAN_ASCENSION_MAP).every(([slot, name]) => ally.equipment[slot] === name);
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
    // Brothers in Arms / Honor Beyond Death (Legendary ascension) share
    // this one reactive-buff timer — see maybeHadrianAllyProtection and
    // applyCompanionDamageTaken for why additive stacking (rather than
    // one clobbering the other) is the right call here.
    if (ally.reactiveBuffTurnsLeft > 0) {
      ally.reactiveBuffTurnsLeft -= 1;
      if (ally.reactiveBuffTurnsLeft === 0) {
        ally.reactiveDefBonus = 0;
        ally.reactiveAtkBonus = 0;
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

// Flat Attack bonus from Brothers in Arms/Honor Beyond Death's reactive
// buff plus Paid in Blood's per-kill stacking (Legendary ascension,
// Sash passive) — added to ally.atk before any ability's own multiplier.
function hadrianFlatAtkBonus(ally) {
  return (ally.reactiveAtkBonus || 0) + (hasAscendedRegalia(ally) ? ally.paidInBloodStacks || 0 : 0);
}

// Total Defense an ascended-or-not Hadrian brings to a hit taken:
// his own stat, Champion's Challenge's timed bonus, the reactive buff
// (Brothers in Arms/Honor Beyond Death), the "2pc" ascension flat bonus,
// and No Name Forgotten's per-fight bonus. combat.js's
// resolveEnemyAttackOnAlly calls this instead of reading ally.def
// directly for ANY ally (not just Hadrian) — it's all zeroes for a
// non-kit-bearing ally like Kessa, so this is a safe drop-in there too.
function effectiveAllyDef(ally) {
  return (
    (ally.def || 0) +
    (ally.bonusDefAmount || 0) +
    (ally.reactiveDefBonus || 0) +
    (ally.ascendedSetDefBonus || 0) +
    (ally.noNameForgottenDefBonus || 0)
  );
}

// Worthy Foe (Trinket II — bonus vs Elite/Boss/World Boss) and Final
// Respect (Trinket II — +50% on the next successful hit after Honor
// Beyond Death triggers, then consumed) — applied to a FINAL damage
// number right before it's subtracted from an enemy's hp, at every one
// of Hadrian's damage-dealing call sites (active abilities, his basic
// fallback attack, and Last Bastion's retaliation).
const WORTHY_FOE_BONUS_BY_TIER = { elite: 0.1, boss: 0.15, world_boss: 0.2 };
function applyHadrianOutgoingDamageBonuses(ally, dmg, targetCreature) {
  let d = dmg;
  if (ally.equipment.trinkets.includes("Astra Sa'Lahru's Broken Crest")) {
    const tierBonus = WORTHY_FOE_BONUS_BY_TIER[targetCreature.dangerClass] || 0;
    if (tierBonus) d = Math.round(d * (1 + tierBonus));
  }
  if (ally.finalRespectPct > 0) {
    d = Math.round(d * (1 + ally.finalRespectPct));
    ally.finalRespectPct = 0;
  }
  return d;
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
  const kit = ALLY_DEFS[ally.defId].abilityKit;
  const target = pickHadrianTarget(enemies);
  if (!attackConnects(ally.accuracy, target.creatureObj.agi, veteranBonusPct(ally, kit))) {
    return [`${ally.name} lunges at ${withThe(target.creatureObj.name, false)} and misses.`];
  }
  const atk = ally.atk + hadrianFlatAtkBonus(ally);
  let dmg = Math.max(1, randInt(Math.round(atk * 0.85), Math.round(atk * 1.15)) - Math.round((target.creatureObj.def || 0) * 0.5));
  dmg = applyHadrianOutgoingDamageBonuses(ally, dmg, target.creatureObj);
  target.hp -= dmg;
  target.lastDamageType = "physical";
  const lines = [`${ally.name} strikes ${withThe(target.creatureObj.name, false)} for ${dmg} damage.`];
  if (target.hp <= 0 && target.alive) {
    lines.push(...killEnemyAsAlly(state, target));
    onHadrianKill(state, ally, kit);
  }
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
  // "The Unbroken Champion" 4pc: abilities used while Defensive or
  // Support have their cooldown reduced by 1 turn.
  const cdrActive = hasAscendedRegalia(ally) && (ally.stance === "defensive" || ally.stance === "support");
  ally.abilityCooldowns[ability.id] = Math.max(0, ability.cooldown - (cdrActive ? 1 : 0));
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
    // "Removes all negative status effects" is a no-op here — no ally
    // status system exists yet (see file header) — deliberately NOT
    // clearing ally.passiveOnceFlags, which gates once-per-combat safety
    // nets (Champion's Resolve, Honor Beyond Death, ...) rather than
    // anything resembling a negative status; clearing it would let
    // those re-trigger mid-fight, which isn't the intent.
    // Champion's Grip (ascended Gauntlets): Empowered Strike's bonus
    // rises from +30% to +45%.
    ally.empoweredStrikePct = hasAscendedRegalia(ally) ? ability.empoweredStrikePct + 0.15 : ability.empoweredStrikePct;
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
  const ascended = hasAscendedRegalia(ally);
  const target = pickHadrianTarget(enemies);
  const atkBonus = 1 + (ally.ultimateTurnsLeft > 0 ? ally.ultimateAtkPct : 0);
  if (!attackConnects(ally.accuracy, target.creatureObj.agi, veteranPct)) {
    lines.push(`${ally.name} swings ${ability.name} and misses.`);
    return lines;
  }
  const empowered = ability.consumesEmpoweredStrike && ally.empoweredStrikeTurnsLeft > 0;
  const empoweredMult = empowered ? 1 + ally.empoweredStrikePct : 1;
  if (empowered) { ally.empoweredStrikePct = 0; ally.empoweredStrikeTurnsLeft = 0; }
  const baseAtk = (ally.atk + hadrianFlatAtkBonus(ally)) * atkBonus * empoweredMult;
  // Unbroken Momentum (ascended Maul): Crushing Blow's Defense-ignore
  // rises from 20% to 30%; Groundbreaker's splash rises from 60% to 75%.
  const defIgnore = (ability.defIgnorePct || 0) + (ascended && ability.id === "crushing_blow" ? 0.1 : 0);
  const splashAtkMult = ability.splashAtkMult != null ? ability.splashAtkMult + (ascended ? 0.15 : 0) : 0;
  let primaryDmg = Math.max(1, Math.round(baseAtk * ability.atkMult) - Math.round((target.creatureObj.def || 0) * (1 - defIgnore) * 0.5));
  primaryDmg = applyHadrianOutgoingDamageBonuses(ally, primaryDmg, target.creatureObj);
  target.hp -= primaryDmg;
  target.lastDamageType = "physical";
  lines.push(`${ally.name} lands ${ability.name} on ${withThe(target.creatureObj.name, false)} for ${primaryDmg} damage.`);
  let killedAny = target.hp <= 0 && target.alive;
  if (killedAny) lines.push(...killEnemyAsAlly(state, target));

  if (ability.splashAll) {
    for (const e of enemies) {
      if (e === target || !e.alive) continue;
      let splashDmg = Math.max(1, Math.round(baseAtk * splashAtkMult) - Math.round((e.creatureObj.def || 0) * 0.5));
      splashDmg = applyHadrianOutgoingDamageBonuses(ally, splashDmg, e.creatureObj);
      e.hp -= splashDmg;
      e.lastDamageType = "physical";
      lines.push(`The blow's shockwave catches ${withThe(e.creatureObj.name, false)} for ${splashDmg} damage.`);
      if (ability.accuracyDebuff) applyGroundbreakerAccuracyDebuff(state, e, ability.accuracyDebuff, ability.accuracyDebuffTurns);
      if (e.hp <= 0 && e.alive) { lines.push(...killEnemyAsAlly(state, e)); killedAny = true; }
    }
    if (ability.accuracyDebuff && target.alive) applyGroundbreakerAccuracyDebuff(state, target, ability.accuracyDebuff, ability.accuracyDebuffTurns);
  }

  if (killedAny) onHadrianKill(state, ally, kit);
  return lines;
}

// On any kill Hadrian lands, by any means (an Active, his basic fallback
// attack, or Last Bastion's retaliation): Bloodbound Paragon (Section
// 8.4) as before, plus Paid in Blood (ascended Sash passive) — +1 Attack
// for the rest of THIS combat, stacking indefinitely, reset at the next
// combat's start (resetCompanionCombatState).
function onHadrianKill(state, ally, kit) {
  maybeTriggerBloodboundParagon(state, ally, kit);
  if (hasAscendedRegalia(ally)) ally.paidInBloodStacks = (ally.paidInBloodStacks || 0) + 1;
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

  // Honor Beyond Death (Trinket II, Legendary ascension): takes priority
  // over Champion's Resolve on any hit that would be FATAL — checked
  // first, and explicitly, per the source record's own dev note that
  // this overkill interaction needed a real priority check rather than
  // whichever effect happened to run first in code. Champion's Resolve
  // below only ever considers non-fatal hits (projected > 0), so the two
  // are naturally mutually exclusive by hit severity, not by ordering
  // alone — but Honor Beyond Death is still checked first to make that
  // priority explicit rather than incidental.
  const projectedFatal = ally.health - dmg;
  if (
    ally.equipment.trinkets.includes("Astra Sa'Lahru's Broken Crest") &&
    !ally.passiveOnceFlags.honor_beyond_death &&
    projectedFatal <= 0
  ) {
    ally.passiveOnceFlags.honor_beyond_death = true;
    dmg = Math.max(0, ally.health - 1);
    ally.reactiveDefBonus = (ally.reactiveDefBonus || 0) + 5;
    ally.reactiveAtkBonus = (ally.reactiveAtkBonus || 0) + 5;
    ally.reactiveBuffTurnsLeft = Math.max(ally.reactiveBuffTurnsLeft || 0, 3);
    ally.finalRespectPct = 0.5;
    lines.push(`${ally.name} refuses the killing blow outright — Honor Beyond Death holds him at the very edge, and he comes back swinging harder for it.`);
    ally.healthLostPctThisCombat = Math.min(1, Math.max(ally.healthLostPctThisCombat, (ally.combatStartHealth - (ally.health - dmg)) / ally.maxHealth));
    return { dmg, lines };
  }

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

// Legion's Memory (6pc ascended set bonus) and Brothers in Arms (Trinket
// I) both react to a DIFFERENT ally crossing the 30% Health threshold —
// checked from combat.js's resolveEnemyAttackOnAlly BEFORE the target's
// own mitigation (applyCompanionDamageTaken above), since Legion's
// Memory redirects part of the incoming hit rather than just buffing
// Hadrian afterward. Both can fire independently on the same hit — the
// source record never states they're exclusive. No-ops if Hadrian isn't
// in the party, isn't the one being hit, or the target isn't actually
// about to cross that threshold.
function maybeHadrianAllyProtection(state, targetAlly, dmg) {
  const hadrian = aliveAllies(state).find((a) => a.defId === "hadrian" && a !== targetAlly);
  if (!hadrian) return { dmg, lines: [] };
  ensureCompanionFields(hadrian);
  if ((targetAlly.health - dmg) / targetAlly.maxHealth >= 0.3) return { dmg, lines: [] };
  const lines = [];
  let remaining = dmg;

  if (hasAscendedRegalia(hadrian) && !hadrian.passiveOnceFlags.legions_memory) {
    hadrian.passiveOnceFlags.legions_memory = true;
    // "+15% damage reduction for 2 turns" for the protected ally has no
    // generic buff-duration hook for a non-kit-bearing ally (Kessa) —
    // applied here as a flat 15% discount on this one hit instead (see
    // file header). Hadrian's own share is a real 2-turn window, since
    // he already has the fields for it.
    remaining = Math.round(remaining * 0.85);
    const redirected = Math.round(remaining * 0.5);
    remaining -= redirected;
    hadrian.health = Math.max(0, hadrian.health - redirected);
    hadrian.dmgReductionPct = Math.max(hadrian.dmgReductionPct || 0, 0.15);
    hadrian.dmgReductionTurnsLeft = Math.max(hadrian.dmgReductionTurnsLeft || 0, 2);
    lines.push(`${hadrian.name} steps into it before it fully lands — "Not her. Me." — taking ${redirected} of the blow himself.`);
  }

  if (hadrian.equipment.trinkets.includes("The Roll of the Ferratum") && !hadrian.passiveOnceFlags.brothers_in_arms) {
    hadrian.passiveOnceFlags.brothers_in_arms = true;
    hadrian.reactiveDefBonus = (hadrian.reactiveDefBonus || 0) + 4;
    hadrian.reactiveAtkBonus = (hadrian.reactiveAtkBonus || 0) + 2;
    hadrian.reactiveBuffTurnsLeft = Math.max(hadrian.reactiveBuffTurnsLeft || 0, 2);
    lines.push(`${hadrian.name}'s grip tightens on his maul. "Not while I'm standing."`);
  }

  return { dmg: remaining, lines };
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
  const kit = def.abilityKit;
  const veteranPct = veteranBonusPct(ally, kit);
  const atk = ally.atk + hadrianFlatAtkBonus(ally);
  let dmg = Math.max(1, Math.round(atk * (ally.retaliatePct + veteranPct)) - Math.round((record.creatureObj.def || 0) * 0.5));
  dmg = applyHadrianOutgoingDamageBonuses(ally, dmg, record.creatureObj);
  record.hp -= dmg;
  record.lastDamageType = "physical";
  const lines = [`${ally.name} answers the blow, retaliating against ${withThe(creatureThatAttacked.name, false)} for ${dmg} damage.`];
  if (record.hp <= 0 && record.alive) {
    lines.push(...killEnemyAsAlly(state, record));
    onHadrianKill(state, ally, kit);
  }
  return lines;
}
