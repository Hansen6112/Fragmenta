/*
 * FRAGMENTA — the generic player skill resolver (Combat Rebuild Phase 1,
 * step 1e completion handoff, 9 Nov 2026 follow-up).
 *
 * usePlayerAction(state, actionId) runs any "standard-shaped" player
 * action definition (js/data/actions.js's getActionDef) through the same
 * sequence every existing orchestrator (playerAttack/useDecoy/useAmbush/
 * useDisarm/useElementAbility) already follows by hand: gate checks,
 * beginTurn/kill-check/resolveSpeedInitiative, the tracking trio(+quad),
 * the shared cooldown chain, the five-step pipeline, then the standard
 * tail (retaliation, low-health checks, the follow-up block, the tactics
 * line, Reflect Death).
 *
 * This does NOT replace those five functions -- each still has its own
 * small, already-verified body, including shape quirks this generic
 * version deliberately doesn't attempt to cover: excludeIndex exclusion
 * (Decoy/Ambush), Earth's no-pipeline self-buff, the elements' own kill-
 * after-synergy-and-Spell-Echo ordering. It exists so a BRAND NEW action
 * with the standard shape (no quirks) can be driven end to end without
 * writing a new orchestrator function at all -- which is what the step
 * 1e completion handoff's own test-strike proof (§4) needs to
 * demonstrate: registering a definition is enough, on its own, to make
 * a new skill playable.
 */
function usePlayerAction(state, actionId) {
  const def = getActionDef(actionId);
  if (!state.combat) return ["There's nothing here to do that."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} has done you no harm.`];
  if (def.cooldownKey && (state.combat.cooldowns[def.cooldownKey] || 0) > 0 && !hasEffect(state, "perfect_recall")) {
    return [`${def.name} is still recovering — ${state.combat.cooldowns[def.cooldownKey]} more turn(s).`];
  }

  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (state.combat.hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat || state.health <= 0) return out;

  const trackingKey = def.trackingKey || actionId;
  out.push(...applyEndlessStudy(state, trackingKey), ...applyWanderersReward(state, trackingKey), ...applyActionTypeTracking(state, def.actionType));
  if (def.usesPerfectMemory) out.push(...applyPerfectMemory(state, trackingKey));
  if (def.consumesTrailblazer) consumeTrailblazer(state);

  if (def.cooldownKey) {
    let cooldown;
    if (state.combat.player.avatarOfTimeTurns > 0) {
      cooldown = 0;
    } else if (applyPerfectTiming(state)) {
      cooldown = 0;
    } else if (state.combat.player.swiftPassageReady) {
      state.combat.player.swiftPassageReady = false;
      cooldown = 0;
    } else if (state.combat.player.hourglassReserveReady) {
      state.combat.player.hourglassReserveReady = false;
      cooldown = 0;
    } else {
      let baseCooldown = def.cooldown;
      if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
      const memory = applyTacticalMemory(state, baseCooldown);
      cooldown = memory.cooldown;
      if (memory.fired) out.push(`Old instincts kick in — ${def.name} recovers faster this time.`);
    }
    if (borrowedSecondsActive(state) && cooldown > 0) cooldown = Math.round(cooldown / 2);
    state.combat.cooldowns[def.cooldownKey] = cooldown;
    if (cooldown === 0) out.push(`Perfect Timing — this move cost nothing.`);
  }

  const enemySlot = {
    creatureObj: creature,
    get hp() { return state.combat.hp; },
    set hp(v) { state.combat.hp = v; },
    get maxHp() { return state.combat.maxHp; },
    get lastDamageType() { return state.combat.lastDamageType; },
    set lastDamageType(v) { state.combat.lastDamageType = v; },
  };
  const actor = makePlayerCombatant(state);
  const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
  const ctx = { state, pendingAction: def, target };
  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);

  let isPhysicalHit = false;
  if (!hitInfo.hit) {
    out.push(...hitInfo.result.lines);
  } else {
    const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
    const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
    out.push(...result.lines);
    isPhysicalHit = result.isPhysicalHit;
    if (result.killed) {
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    }
  }

  const guardBonus = isPhysicalHit && hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (def.runsLowHealthChecks && state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (def.followupForm === "gated") {
    if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
    if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  } else if (def.followupForm === "unconditional") {
    out.push(...maybeRiposte(state, creature), ...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  }
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}
