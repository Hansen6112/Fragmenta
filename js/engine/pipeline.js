/*
 * FRAGMENTA — Combat Rebuild Phase 1: the five-step pipeline skeleton
 * (step 1b), extended in step 1c with the enemy -> ally path.
 *
 * The five generic functions below (chooseAction/chooseTargets/rollToHit/
 * calculateDamage/applyAndReact) are the shared shape every actor/target
 * pair will eventually run through (spec section 3). Each dispatches on
 * `actor.kind`/`target.kind` to the real logic for a migrated path, or
 * throws a clear "not migrated yet" error for anything that isn't — same
 * convention js/engine/combatant.js's stat() already uses, so a bug reads
 * as a loud crash, never a silently wrong number.
 *
 * Step 1b's path: enemy attacking the player, moved here from
 * resolveEnemyRetaliation (combat.js) verbatim. Step 1c's path: enemy
 * attacking an ally, moved here from resolveEnemyAttackOnAllyLegacy
 * (combat.js, formerly just resolveEnemyAttackOnAlly — see that
 * function's own header). Same arithmetic, same effect order, same
 * early-return shape for every miss/evasion/negation in both — just
 * reorganized into the five named steps. Nothing about any mechanic's
 * numbers or triggers changes; see each step's own parity report for how
 * that's verified.
 *
 * The player-attacking and ally-attacking paths are NOT symmetric today.
 * Step 1c preserved every asymmetry found at the time exactly, rather
 * than "completing" them — see the per-step comments below for each one
 * (the short version: Reinforced/Timeless Guard/Guardian Spirit/Guided
 * Footsteps/Never Where Expected/Blessing or Avatar of Freedom/evasion
 * charges or windows/Marked Target/Flowing Discipline/Winter's Verdict/
 * Stonewarden's physical-branch reduction/Toxic Preparation only ever
 * applied when the player was the target; Hadrian's protection, the
 * generalized Ally Protection Reaction, companion damage mitigation, Last
 * Bastion retaliation, and a miss provoking Riposte only ever applied
 * when an ally was). Full list, with each one's disposition (kept,
 * switched behind a U3 unification flag, or fixed outright), now tracked
 * in tools/combat_asymmetry_register.md rather than only here.
 *
 * The stun gate was ALSO on that list through step 1c, but it was a
 * listed bug, not a balance asymmetry (Tyler, 9 Nov, decision D1): a
 * stunned enemy's whole action should be skipped regardless of what it
 * would have attacked, not just when it happened to roll the player as
 * its target. Fixed by moving the stun check out of chooseAction
 * entirely, up to resolveEnemyAction (combat.js), before any ability,
 * summon or target is chosen — see that function's own comment. The
 * ctx.target.kind === "player" guard that used to gate it here is gone;
 * chooseAction can no longer return null for an enemy actor.
 *
 * One deliberate, disclosed departure from a "pure" five-step split,
 * forced by preserving EXACT existing behavior rather than the cleanest
 * possible shape (balance-neutrality wins over tidiness in Phase 1 —
 * Phase 2's registry is where the shape itself can improve):
 *
 *   1. Mirror Soul (Artifact) is a full short-circuit found INSIDE
 *      calculateDamage: the first hostile spell each combat is reflected
 *      onto the CASTER (not the original target), including that
 *      creature's own HP loss and kill resolution, resolved immediately
 *      and returned. That's an HP write inside step 4, not step 5 — a
 *      real exception to the "HP changes only in applyAndReact" rule
 *      (spec section 3, hard rule), forced by Mirror Soul redirecting the
 *      hit onto a DIFFERENT combatant than the one steps 2-5 are resolving
 *      for.
 *
 *      TEMPORARY, KNOWN, TIME-BOUNDED (Tyler, 6 Nov) — not a permanent
 *      allow-list entry. Reflection is a REACTION, not part of calculating
 *      the original hit's damage, so it belongs in step 1f (reactions and
 *      ticks), as its own action against the attacker that runs through
 *      the real step 5 (applyAndReact) like everything else — that's what
 *      actually removes the exception, rather than codifying it as a
 *      permanent audit allow-list entry at step 1h. Tracked as part of
 *      1f's own scope (see that step's task description); left as-is here
 *      in 1b, since 1b's only job is this one path's control-flow shape,
 *      not fixing a cross-cutting reaction mechanic that belongs to a
 *      later step by the migration order's own rules.
 */

// ---- Step 1: choose action ----
// actor: a combatant view (js/engine/combatant.js). ctx.pendingAction: the
// attack resolveEnemyAction already decided on (basic swing or a specific
// Active's abilityCtx) — 1b doesn't yet build real action DEFINITIONS
// (spec section 3.1); that catalog is step 1e's job, alongside the player
// skill resolver. Returns the chosen action, or null if the actor can't
// act this turn at all. No enemy case reaches that null today — a
// stunned enemy is stopped earlier, in resolveEnemyAction (combat.js,
// D1) — but the shape is kept for whatever later step needs it.
function chooseAction(actor, ctx) {
  if (actor.kind === "enemy") {
    // Reinforced: resolveEnemyAttackOnAllyLegacy never had this check —
    // it's specific to the player-targeted path in the original code
    // (resolveEnemyRetaliation). A pre-existing asymmetry (Reinforced's
    // counter only ever advances against the player), preserved here
    // exactly via the target-kind guard rather than corrected or extended
    // — see this file's header.
    //
    // The stun gate used to live here too (consumed via actor.store,
    // behind this same ctx.target.kind === "player" guard) — moved out,
    // listed change D1 (Tyler, 9 Nov): a stunned enemy's whole action is
    // now skipped before combat.js's resolveEnemyAction ever picks an
    // ability or a target, so by the time chooseAction runs for an
    // ordinary enemy, any stun charge has already been checked and
    // consumed (or there wasn't one). chooseAction can therefore never
    // return null for an enemy actor any more — see that function's own
    // comment, in combat.js, for where the check lives now.
    if (ctx.target && ctx.target.kind === "player") {
      const combat = ctx.state.combat;
      if (hasEffect(ctx.state, "reinforced")) {
        combat.reinforcedAttackCount = (combat.reinforcedAttackCount || 0) + 1;
        if (combat.reinforcedAttackCount % 3 === 0 && (combat.reinforcedDefStacks || 0) < 20) {
          combat.reinforcedDefStacks = Math.min(20, (combat.reinforcedDefStacks || 0) + 2);
        }
      }
    }
    return ctx.pendingAction;
  }
  throw new Error(`chooseAction(): actor kind "${actor.kind}" is not migrated into the pipeline yet.`);
}

// ---- Step 2: choose targets ----
// 1b's only real path never had a targeting choice (an enemy's basic
// attack/active always hits the player) — this step exists as a real,
// callable function with the right signature so later steps (which DO
// have real targeting: taunts, pack AoE, Hadrian's priority target) slot
// into the same shape, but it's a documented no-op here.
function chooseTargets(actor, action, ctx) {
  if (actor.kind === "enemy" && ctx.target && (ctx.target.kind === "player" || ctx.target.kind === "ally")) {
    return [ctx.target];
  }
  throw new Error(`chooseTargets(): actor "${actor.kind}" -> target not migrated yet.`);
}

// ---- Step 3: roll to hit ----
// Returns { hit: true, accBonus } to continue the pipeline, or
// { hit: false, result: {lines, damage} } to short-circuit with a final
// result (a miss, or one of the several named full-negation effects).
function rollToHit(actor, target, action, ctx) {
  if (!(actor.kind === "enemy" && (target.kind === "player" || target.kind === "ally"))) {
    throw new Error(`rollToHit(): "${actor.kind}" -> "${target.kind}" not migrated yet.`);
  }
  const state = ctx.state;
  const combat = state.combat;
  const creature = actor.ref.creatureObj;
  const { abilityCtx, basicFirstBonus } = action;
  const miss = (line) => ({ hit: false, result: { lines: [line], damage: 0 } });
  const baseAccBonus = (abilityCtx && abilityCtx.accBonus) || (basicFirstBonus && basicFirstBonus.accBonus) || 0;

  if (target.kind === "ally") {
    const ally = target.ref;
    // Marked Target is absent here on purpose — it's a player-only
    // mechanic in the original (resolveEnemyAttackOnAllyLegacy never
    // reads or clears combat.exposedTarget). See this file's header.
    const duelistPendingAlly = hasEffect(creature, "sang_cu_ie007_duelists_measure") && creature.duelistMeasurePendingTarget === ally.name;
    let calculatedAimBonusAlly = 0;
    if (!creature.calculatedAimUsed && (hasEffect(creature, "sang_mil_ie003_calculated_aim") || hasEffect(creature, "sang_iag_ie007_concealed_edge"))) {
      creature.calculatedAimUsed = true;
      calculatedAimBonusAlly = 8;
    }
    const bankedPrepBonusAlly = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 ? (creature.bankedAttackAccBonus || 0) : 0;
    const bankedPrepDmgMultBonusAlly = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 ? (creature.bankedAttackDmgMultBonus || 0) : 0;
    const measuredAimAccBonusAlly = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 && hasEffect(creature, "sang_iag_ie003_measured_aim") ? 8 : 0;
    creature.bankedAttackAccBonus = 0;
    creature.bankedAttackAccBonusTurnsLeft = 0;
    creature.bankedAttackDmgMultBonus = 0;
    const accBonus = baseAccBonus + (duelistPendingAlly ? 10 : 0) + calculatedAimBonusAlly + bankedPrepBonusAlly + measuredAimAccBonusAlly;
    creature.duelistMeasurePendingTarget = null;
    if (!attackConnects(creature.acc + accBonus, stat(state, target, "agi"))) {
      // Riposte, generalized: a miss on an ally provokes a counter FROM
      // the ally onto the attacker — the player-targeted path has no
      // equivalent (a miss there is just a miss). See this file's header.
      const enemySlot = actor.store;
      return { hit: false, result: { lines: [`${withThe(creature.name, true)} lunges at ${ally.name} and misses.`, ...riposteCounterByAllyOnEnemy(state, ally, enemySlot)], damage: null } };
    }
    return { hit: true, accBonus, bankedPrepDmgMultBonus: bankedPrepDmgMultBonusAlly };
  }

  let markedTargetBonus = 0;
  if (combat.exposedTarget && combat.exposedTarget.by !== creature) {
    markedTargetBonus = 8;
    combat.exposedTarget = null;
  }
  const duelistPending = hasEffect(creature, "sang_cu_ie007_duelists_measure") && creature.duelistMeasurePendingTarget === "player";
  const duelistBonus = duelistPending ? 10 : 0;
  creature.duelistMeasurePendingTarget = null;
  let calculatedAimBonus = 0;
  if (!creature.calculatedAimUsed && (hasEffect(creature, "sang_mil_ie003_calculated_aim") || hasEffect(creature, "sang_iag_ie007_concealed_edge"))) {
    creature.calculatedAimUsed = true;
    calculatedAimBonus = 8;
  }
  const bankedPrepBonus = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 ? (creature.bankedAttackAccBonus || 0) : 0;
  const bankedPrepDmgMultBonus = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 ? (creature.bankedAttackDmgMultBonus || 0) : 0;
  const measuredAimAccBonus = (creature.bankedAttackAccBonusTurnsLeft || 0) > 0 && hasEffect(creature, "sang_iag_ie003_measured_aim") ? 8 : 0;
  creature.bankedAttackAccBonus = 0;
  creature.bankedAttackAccBonusTurnsLeft = 0;
  creature.bankedAttackDmgMultBonus = 0;
  const accBonus = baseAccBonus + markedTargetBonus + duelistBonus + calculatedAimBonus + bankedPrepBonus + measuredAimAccBonus;

  if (!attackConnects(creature.acc + accBonus, effectivePlayerAgility(state) + scoutStealthOpeningBonus(state, combat))) {
    return miss(`${withThe(creature.name, true)} attacks, but you're not where it expected you to be.`);
  }
  if (applyTimelessGuard(state)) {
    return miss(`Timeless Guard — for a moment, time itself refuses to let the blow land.`);
  }
  if (hasEffect(state, "guardian_spirit") && !combat.guardianSpiritUsed) {
    combat.guardianSpiritUsed = true;
    return miss(`Guardian Spirit turns the first blow aside completely.`);
  }
  if (hasEffect(state, "guided_footsteps") && !combat.guidedFootstepsUsed) {
    combat.guidedFootstepsUsed = true;
    if (Math.random() < 0.75) return miss(`Guided Footsteps — you're already a step from where it lands.`);
  }
  if (hasEffect(state, "never_where_expected") && Math.random() < 0.15) {
    return miss(`Never Where Expected — it swings, and finds nothing there.`);
  }
  if (hasSetTier(state, "Regalia of the Endless Horizon", 2) && Math.random() < 0.15) {
    return miss(`Blessing of Freedom carries you clear of the blow.`);
  }
  if (combat.avatarOfFreedomTurns > 0 && Math.random() < 0.5) {
    return miss(`Avatar of Freedom carries you beyond its reach entirely.`);
  }
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
    return miss(`You slip past ${withThe(creature.name, false)}'s counter entirely.`);
  }
  return { hit: true, accBonus, bankedPrepDmgMultBonus };
}

// ---- Step 4: calculate damage ----
// Returns { shortCircuit: true, result } for Mirror Soul's reflection
// (see this file's header, departure #2), or { edmg, kind } to continue
// into applyAndReact — edmg is the fully-computed pre-mitigation damage,
// matching exactly where resolveEnemyRetaliation called
// mitigateAndApplyHitOnPlayer in the original.
function calculateDamage(actor, target, action, ctx, hitInfo) {
  if (!(actor.kind === "enemy" && (target.kind === "player" || target.kind === "ally"))) {
    throw new Error(`calculateDamage(): "${actor.kind}" -> "${target.kind}" not migrated yet.`);
  }
  const state = ctx.state;
  const combat = state.combat;
  const creature = actor.ref.creatureObj;
  const { atkSpread, extraDef, abilityCtx, basicFirstBonus } = action;
  const bonusDef = extraDef || 0;

  if (target.kind === "ally") {
    const ally = target.ref;
    // Brace/Guarded Strike, generalized: the ally's own banked bonus
    // against its next incoming hit, consumed here (read then zeroed) —
    // same side-effecting-at-the-usage-site shape as the enemy-def banked
    // bonuses elsewhere in this file, never folded into stat() itself
    // (the stat()-purity rule, js/engine/combatant.js's header).
    const bankedDef = (ally.braceBonusDef || 0) + (ally.guardedStrikeBonusDef || 0);
    ally.braceBonusDef = 0;
    ally.guardedStrikeBonusDef = 0;
    const effectiveDef = stat(state, target, "def") + bankedDef;
    // No elemental branch here on purpose — resolveEnemyAttackOnAllyLegacy
    // never had one; an enemy mage attacking an ally always uses the
    // physical formula below (effectiveEnemyAtk's own magic-fallback
    // makes rawAtk sane regardless). See this file's header.
    const rawAtk = effectiveEnemyAtk(state, creature);
    let edmg = abilityCtx
      ? (abilityCtx.dmgMult > 0 ? Math.max(1, Math.round(mitigate(abilityPower(rawAtk, abilityCtx.dmgMult), effectiveDef))) : 0)
      : (creature.atk !== 0 ? Math.max(1, Math.round(mitigate(randInt(Math.max(1, rawAtk - 1), rawAtk + 1), effectiveDef) * (basicFirstBonus ? basicFirstBonus.dmgMultBonus : 1))) : 0);
    if (!abilityCtx) edmg = applyOpeningReachForActor(creature, edmg);
    edmg = Math.round(edmg * executionerMultiplierFor(creature, ally.health, ally.maxHealth));
    if (hitInfo.bankedPrepDmgMultBonus > 0) edmg = Math.round(edmg * hitInfo.bankedPrepDmgMultBonus);
    if (hasEffect(creature, "dra_e01_ice_forged_edge")) edmg = Math.round(edmg * 1.10);
    if (edmg > 0 && hasEffect(creature, "dra_e04_unbroken_grip") && !creature.unbrokenGripUsed) {
      creature.unbrokenGripUsed = true;
      edmg = Math.round(edmg * 1.10);
    }
    // Executioner's Seal/Tyrant's Edge: checked against the ALLY's own
    // HP% here (the actual target of this hit), not the player's.
    if (hasEffect(creature, "dra_e06_executioners_seal") && ally.health <= ally.maxHealth * 0.3) edmg = Math.round(edmg * 1.20);
    if (edmg > 0 && hasEffect(creature, "dra_e09_black_ice_reserve") && creature.blackIceReservePending) edmg = Math.round(edmg * 1.10);
    if (edmg > 0 && hasEffect(creature, "sang_cu_ie012_tyrants_edge") && ally.health <= ally.maxHealth * 0.35 && !(creature.tyrantsEdgeCooldown > 0) && (creature.tyrantsEdgeUses || 0) < 2) {
      creature.tyrantsEdgeCooldown = 3;
      creature.tyrantsEdgeUses = (creature.tyrantsEdgeUses || 0) + 1;
      edmg = Math.round(edmg * 1.10);
    }
    if (edmg > 0 && hasEffect(creature, "sang_mil_ie005_decisive_impact") && !creature.decisiveImpactUsed) {
      creature.decisiveImpactUsed = true;
      edmg = Math.round(edmg * 1.08);
    }
    // No Flowing Discipline/Winter's Verdict/Stonewarden/Toxic Preparation
    // here — all four are absent from resolveEnemyAttackOnAllyLegacy too.
    // See this file's header.
    return { shortCircuit: false, edmg, kind: "ally" };
  }

  if (creature.element) {
    const matchup = elementMultiplier(null, creature.element, state.flags.isMage ? state.primaryElement : null);
    const base = randInt(creature.magic - 2, creature.magic + 2);
    if (hasEffect(state, "mirror_soul") && !combat.mirrorSoulUsed) {
      combat.mirrorSoulUsed = true;
      const reflected = Math.max(0, Math.round(base * matchup));
      if (reflected > 0) {
        // Departure #2: Mirror Soul's own HP write and kill resolution
        // target the ATTACKER (actor), not the player this pipeline call
        // is otherwise resolving for — actor.store is this creature's own
        // slot, so writing through it is correct regardless of which
        // enemy is "active" right now (unlike the old combat.hp proxy,
        // which happened to be safe here only because Mirror Soul always
        // fires on the currently-acting creature).
        actor.store.hp -= reflected;
        actor.store.lastDamageType = creature.element;
        const lines = [`Mirror Soul turns ${withThe(creature.name, false)}'s spell back on it, for ${reflected} damage.`];
        if (actor.store.hp <= 0) lines.push(...resolveKill(state, creature));
        return { shortCircuit: true, result: { lines, damage: 0 } };
      }
      return { shortCircuit: true, result: { lines: [`Mirror Soul readies itself, but there's nothing in the spell worth turning aside.`], damage: 0 } };
    }
    const coldBonus = creature.element === "water" && hasColdproof(state) ? 2 : 0;
    const def = effectivePlayerDef(state) + bonusDef + coldBonus;
    let edmg = Math.max(1, Math.round(mitigate(Math.max(1, base), def) * matchup * executionerMultiplierFor(creature, state.health, state.maxHealth)));
    if (edmg > 0 && hasEffect(creature, "dra_e07_unquenched_focus") && !creature.unquenchedFocusUsed) {
      creature.unquenchedFocusUsed = true;
      edmg = Math.round(edmg * 1.10);
    }
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
    return { shortCircuit: false, edmg, kind: "magic", elName: ELEMENTS[creature.element].name.toLowerCase() };
  }

  const atk = effectiveEnemyAtk(state, creature);
  const playerDef = effectivePlayerDef(state) + bonusDef;
  let edmg = abilityCtx
    ? (abilityCtx.dmgMult > 0 ? Math.max(1, Math.round(mitigate(abilityPower(atk, abilityCtx.dmgMult), playerDef))) : 0)
    : (creature.atk !== 0 ? Math.max(1, Math.round(mitigate(randInt(Math.max(1, atk - 1), atk + (atkSpread || 2)), playerDef) * (basicFirstBonus ? basicFirstBonus.dmgMultBonus : 1))) : 0);
  if (!abilityCtx) edmg = applyOpeningReachForActor(creature, edmg);
  edmg = Math.round(edmg * executionerMultiplierFor(creature, state.health, state.maxHealth));
  if (hitInfo.bankedPrepDmgMultBonus > 0) edmg = Math.round(edmg * hitInfo.bankedPrepDmgMultBonus);
  if (hasEffect(creature, "dra_e01_ice_forged_edge")) edmg = Math.round(edmg * 1.10);
  if (edmg > 0 && hasEffect(creature, "dra_e04_unbroken_grip") && !creature.unbrokenGripUsed) {
    creature.unbrokenGripUsed = true;
    edmg = Math.round(edmg * 1.10);
  }
  if (edmg > 0 && hasEffect(creature, "sang_mil_ie005_decisive_impact") && !creature.decisiveImpactUsed) {
    creature.decisiveImpactUsed = true;
    edmg = Math.round(edmg * 1.08);
  }
  if (hasEffect(creature, "dra_e06_executioners_seal") && state.health <= state.maxHealth * 0.3) edmg = Math.round(edmg * 1.20);
  if (edmg > 0 && hasEffect(creature, "dra_e09_black_ice_reserve") && creature.blackIceReservePending) edmg = Math.round(edmg * 1.10);
  if (edmg > 0 && hasEffect(creature, "sang_cu_ie012_tyrants_edge") && state.health <= state.maxHealth * 0.35 && !(creature.tyrantsEdgeCooldown > 0) && (creature.tyrantsEdgeUses || 0) < 2) {
    creature.tyrantsEdgeCooldown = 3;
    creature.tyrantsEdgeUses = (creature.tyrantsEdgeUses || 0) + 1;
    edmg = Math.round(edmg * 1.10);
  }
  if (edmg > 0 && hasSetTier(creature, "First Sword's Regalia", 6) && creature.flowingDisciplinePending) {
    creature.flowingDisciplinePending = false;
    creature.flowingDisciplineTurnsLeft = 0;
    edmg = Math.round(edmg * 1.10);
  }
  if (edmg > 0 && !creature.wintersVerdictUsed && hasSetTier(creature, "First Sword's Regalia", 8) && combat.playerStatuses && combat.playerStatuses.chilled) {
    creature.wintersVerdictUsed = true;
    edmg = Math.round(edmg * 1.15);
  }
  if (edmg > 0 && !combat.firstHitTakenUsed) {
    combat.firstHitTakenUsed = true;
    if (hasSetTier(state, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
  }
  if (edmg > 0 && hasEffect(creature, "sang_iag_ie008_toxic_preparation") && !creature.toxicPreparationUsed && combat.playerStatuses && combat.playerStatuses["sang_iag_poison"]) {
    creature.toxicPreparationUsed = true;
    edmg += Math.max(1, Math.floor(edmg * 0.05));
  }
  return { shortCircuit: false, edmg, kind: "physical" };
}

// ---- Step 5: apply and react ----
// dmgInfo: calculateDamage's { edmg, kind, elName? } for the non-short-
// circuit case. Everything here ran AFTER mitigateAndApplyHitOnPlayer in
// the original (so every mutation below reads the POST-mitigation edmg) —
// this is the only place state.health changes for this path.
function applyAndReact(actor, target, dmgInfo, ctx, action) {
  if (!(actor.kind === "enemy" && (target.kind === "player" || target.kind === "ally"))) {
    throw new Error(`applyAndReact(): "${actor.kind}" -> "${target.kind}" not migrated yet.`);
  }
  const state = ctx.state;
  const combat = state.combat;
  const creature = actor.ref.creatureObj;
  const { abilityCtx } = action;
  let edmg = dmgInfo.edmg;

  if (target.kind === "ally") {
    const ally = target.ref;
    if (!abilityCtx && edmg > 0 && hasEffect(creature, "guarded_strike")) creature.guardedStrikeBonusDef = 2;
    const sangAllyLines = [];
    if (edmg > 0 && !creature.serratedOpeningUsed && hasEffect(creature, "sang_cu_ie003_serrated_opening")) {
      creature.serratedOpeningUsed = true;
      if (!(ally.statuses && ally.statuses.bleed)) {
        sangAllyLines.push(...applyAbilityInflictOnAlly(ally, { status: "bleed", chance: 1 }, creature.name));
      }
    }
    // No Marked Target grant here — see this file's header.
    if (edmg > 0 && hasEffect(creature, "sang_cu_ie007_duelists_measure") && (creature.duelistMeasureUsesThisCombat || 0) < 2) {
      creature.duelistMeasureUsesThisCombat = (creature.duelistMeasureUsesThisCombat || 0) + 1;
      creature.duelistMeasurePendingTarget = ally.name;
    }
    // Legion's Memory/Brothers in Arms, then the generalized Ally
    // Protection Reaction, then Companion Ability Engine mitigation —
    // this path's equivalent of "shields and temporary HP" (spec step 5),
    // all ally-only mechanics with no player-path counterpart.
    const protection = maybeHadrianAllyProtection(state, ally, edmg);
    edmg = protection.dmg;
    const allyProtectionReaction = applyAllyProtectionReaction(state, ally, edmg);
    edmg = allyProtectionReaction.dmg;
    const mitigation = applyCompanionDamageTaken(ally, edmg);
    edmg = mitigation.dmg;
    const arenaFloor = combat && combat.isArenaFight && !combat.arenaLethal ? 1 : 0;
    ally.health = Math.max(arenaFloor, ally.health - edmg);
    const verb = abilityCtx ? `uses ${abilityCtx.name} on` : "strikes";
    const lines = [`${withThe(creature.name, true)} ${verb} ${ally.name} for ${edmg} damage.`, ...protection.lines, ...allyProtectionReaction.lines, ...mitigation.lines, ...sangAllyLines];
    if (abilityCtx && abilityCtx.inflict) {
      const inflictLinesAlly = applyAbilityInflictOnAlly(ally, abilityCtx.inflict, creature.name);
      lines.push(...inflictLinesAlly);
      if (inflictLinesAlly.length && abilityCtx.inflict.status === "chilled" && hasEffect(creature, "dra_e09_black_ice_reserve")) {
        creature.blackIceReservePending = true;
        creature.blackIceReserveTurnsLeft = 2;
      }
    }
    if (abilityCtx && abilityCtx.healOnHitPct && edmg > 0) {
      const heal = Math.round(edmg * abilityCtx.healOnHitPct);
      if (heal > 0) actor.store.hp = Math.min(actor.store.maxHp, actor.store.hp + heal);
    }
    lines.push(...maybeCompanionRetaliate(state, ally, creature));
    if (ally.health <= 0) {
      lines.push(...killAlly(state, ally));
      // killAlly's own party-wipe branch (the player already downed, and
      // this the last living ally) can null state.combat — see combat.js's
      // own comment on this same guard in the pre-pipeline function.
      if (!state.combat) return { lines, damage: null };
      for (const pid of creature.passives || []) {
        const p = getEnemyAbility(pid);
        if (!p || p.trigger !== "onKill") continue;
        if (p.oncePerCombat) {
          creature.onKillUsed = creature.onKillUsed || {};
          if (creature.onKillUsed[pid]) continue;
          creature.onKillUsed[pid] = true;
        }
        applyEnemySelfModifier(state.combat, creature, p.selfBuff);
      }
    }
    return { lines, damage: null };
  }

  const hitResult = mitigateAndApplyHitOnPlayer(state, edmg, dmgInfo.kind);
  edmg = hitResult.edmg;
  const absorbLines = hitResult.absorbLines;

  if (dmgInfo.kind === "magic") {
    if (edmg > 0) combat.playerLastHitType = creature.element;
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${dmgInfo.elName} of its own, for ${edmg} damage.` : `Its ${dmgInfo.elName} washes over you harmlessly.`, ...absorbLines];
    if (state.health <= 0) {
      const defeatMsg = resolvePlayerDefeatOrDowned(state);
      if (defeatMsg) lines.push(defeatMsg);
    }
    return { lines, damage: edmg };
  }

  if (edmg > 0) combat.playerLastHitType = "physical";
  if (!abilityCtx && edmg > 0 && hasEffect(creature, "guarded_strike")) creature.guardedStrikeBonusDef = 2;
  const sangLines = [];
  if (edmg > 0 && !creature.serratedOpeningUsed && hasEffect(creature, "sang_cu_ie003_serrated_opening")) {
    creature.serratedOpeningUsed = true;
    if (!(combat.playerStatuses && combat.playerStatuses.bleed)) {
      sangLines.push(...applyAbilityInflict(state, { status: "bleed", chance: 1 }, creature.name));
    }
  }
  if (edmg > 0 && !creature.markedTargetUsed && hasEffect(creature, "sang_cu_ie002_marked_target") && !combat.exposedTarget) {
    creature.markedTargetUsed = true;
    combat.exposedTarget = { by: creature };
  }
  if (edmg > 0 && hasEffect(creature, "sang_cu_ie007_duelists_measure") && (creature.duelistMeasureUsesThisCombat || 0) < 2) {
    creature.duelistMeasureUsesThisCombat = (creature.duelistMeasureUsesThisCombat || 0) + 1;
    creature.duelistMeasurePendingTarget = "player";
  }
  const verb = abilityCtx ? `uses ${abilityCtx.name} on you` : "hits back";
  const lines = [edmg > 0 ? `${withThe(creature.name, true)} ${verb} for ${edmg} damage.` : `You take no damage from its counter.`, ...absorbLines, ...sangLines];
  if (abilityCtx) {
    if (abilityCtx.inflict) {
      const inflictLines = applyAbilityInflict(state, abilityCtx.inflict, creature.name);
      if (inflictLines.length && abilityCtx.inflict.status === "chilled" && hasEffect(creature, "dra_e09_black_ice_reserve")) {
        creature.blackIceReservePending = true;
        creature.blackIceReserveTurnsLeft = 2;
      }
      lines.push(...inflictLines);
    }
    if (abilityCtx.healOnHitPct && edmg > 0) {
      const heal = Math.round(edmg * abilityCtx.healOnHitPct);
      if (heal > 0) actor.store.hp = Math.min(actor.store.maxHp, actor.store.hp + heal);
    }
  }
  if (edmg > 0) lines.push(...checkMercyOfTheVeil(state));
  if (state.health <= 0) {
    const defeatMsg = resolvePlayerDefeatOrDowned(state);
    if (defeatMsg) lines.push(defeatMsg);
  }
  return { lines, damage: edmg };
}

// ---- Orchestrator: same signature/return shape as the old
// resolveEnemyRetaliation, so every existing call site redirects here
// unchanged. Kept as its own small function (not inlined into
// resolveEnemyRetaliation's old body) so the parity harness can call the
// pipeline and the pre-migration snapshot side by side under forced RNG.
function resolveEnemyAttackOnPlayer(state, creature, atkSpread, extraDef, abilityCtx, basicFirstBonus) {
  const actor = findEnemyCombatant(state, creature);
  const target = makePlayerCombatant(state);
  const action = { atkSpread, extraDef, abilityCtx, basicFirstBonus };
  const ctx = { state, pendingAction: action, target };

  // chooseAction never actually returns null for an enemy actor any more
  // (the stun check that used to live there moved out to
  // resolveEnemyAction, combat.js, per D1 — see chooseAction's own
  // comment) — this guard is kept as defensive dead code, in case a later
  // step gives chooseAction a real reason to decline an action again.
  const chosen = chooseAction(actor, ctx);
  if (!chosen) return { lines: [`${withThe(creature.name, true)} is still reeling and doesn't attack.`], damage: 0 };

  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  if (dmgInfo.shortCircuit) return dmgInfo.result;

  return applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
}

// ---- Orchestrator: same signature/return shape as the old
// resolveEnemyAttackOnAlly (now resolveEnemyAttackOnAllyLegacy in
// combat.js), so every existing call site keeps working unchanged —
// nothing needed to change there, since this function keeps the name
// every call site already uses; only the OLD definition had to be
// renamed so both can exist side by side for the parity harness.
function resolveEnemyAttackOnAlly(state, creature, ally, abilityCtx, basicFirstBonus) {
  const actor = findEnemyCombatant(state, creature);
  const target = makeAllyCombatant(ally);
  const action = { abilityCtx, basicFirstBonus };
  const ctx = { state, pendingAction: action, target };

  // Same dead-code note as resolveEnemyAttackOnPlayer above: chooseAction
  // can't return null for an enemy actor since the stun gate moved out.
  const chosen = chooseAction(actor, ctx);
  if (!chosen) return { lines: [`${withThe(creature.name, true)} is still reeling and doesn't attack.`], damage: 0 };

  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  if (dmgInfo.shortCircuit) return dmgInfo.result;

  return applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
}
