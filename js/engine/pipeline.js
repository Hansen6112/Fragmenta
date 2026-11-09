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
 * The player-attacking and ally-attacking paths are NOT symmetric today,
 * with every COMBAT_UNIFY switch below at its default of off. Step 1c
 * preserved every asymmetry found at the time exactly, rather than
 * "completing" them — see the per-step comments below for each one (the
 * short version: Reinforced/Timeless Guard/Guardian Spirit/Guided
 * Footsteps/Never Where Expected/Blessing or Avatar of Freedom/evasion
 * charges or windows/Marked Target/Flowing Discipline/Winter's Verdict/
 * Stonewarden's physical-branch reduction/Toxic Preparation only ever
 * applied when the player was the target; Hadrian's protection, the
 * generalized Ally Protection Reaction, companion damage mitigation, Last
 * Bastion retaliation, and a miss provoking Riposte only ever applied
 * when an ally was). Full list, with each one's disposition (kept,
 * switched behind a COMBAT_UNIFY flag, or fixed outright), tracked in
 * tools/combat_asymmetry_register.md rather than only here — four of
 * these (Marked Target, Flowing Discipline, Winter's Verdict, Toxic
 * Preparation) now have a U3 switch (off by default) that unifies them;
 * the rest don't yet, per that register's own kind split.
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

// Combat Rebuild Phase 1 handoff §2 (Tyler, 9 Nov 2026): unification
// switches. Every switch defaults OFF — with every switch off, this file
// behaves exactly as step 1c left it (every existing parity scenario
// keeps passing unchanged; see the on/off scenarios in
// phase1_step1c_ally_pipeline_parity.js tagged COMBAT_UNIFY). Turning a
// switch on is a real, disclosed behavior change, done one at a time,
// each its own commit, measured against the boss sweep and the
// Dregnar/Arbitarius legal-party cells (stop and tell Tyler if any
// boss's win rate moves more than 10 points). See
// tools/combat_asymmetry_register.md for what each one unifies and why;
// U3 only has entries for the register's kind-A rows that are actually
// built here — a row still marked "needs Tyler" in that register
// (Stonewarden 6pc, whether it's kind A or B) gets no switch yet.
const COMBAT_UNIFY = {
  // Allies take element/magic damage the same formula the player does,
  // instead of calculateDamage's ally branch always falling through to
  // the flat physical formula. The matchup multiplier is fixed at 1.0
  // (neutral) under this switch: allies have no elemental-affinity field
  // anywhere in the data model (no ally.primaryElement, no "this ally is
  // attuned to element X" concept in allies.js/companion.js) — Tyler's
  // call (9 Nov): ship U1 with a flat matchup rather than invent one, and
  // revisit if/when allies get a real elemental identity. Mirror Soul is
  // deliberately OUT of U1's scope — it's the player's own artifact,
  // already a separate, time-bounded step-1f fix (this file's departure
  // #1 above); U1 doesn't entangle a second open question with it.
  U1: false,
  // Dregnar's Unquenched Focus (dra_e07) applies on his first successful
  // elemental hit against an ally too, not just the player. Only
  // meaningful with U1 also on (there's no elemental hit on an ally for
  // it to trigger from otherwise) — gated on both flags at the call site,
  // not implied by U1 alone, so flipping U1 on by itself doesn't silently
  // also turn U2 on.
  U2: false,
  // Marked Target (sang_cu_ie002_marked_target): a successful hit marks
  // the TARGET (combat.exposedTarget), not just the player, and the
  // marked-target accuracy bonus is read/consumed on an ally-targeted
  // roll too.
  U3a: false,
  // Flowing Discipline (First Sword's Regalia 6pc): the banked +10%
  // physical-damage bonus fires on an ally-targeted hit too.
  U3b: false,
  // Winter's Verdict (First Sword's Regalia 8pc): fires when the ALLY
  // (not just the player) is Chilled — reads ally.statuses.chilled,
  // the same per-ally status bag Serrated Opening's bleed check already
  // reads in this file's ally branches.
  U3c: false,
  // Toxic Preparation (sang_iag_ie008): fires when the ALLY (not just
  // the player) carries the Sanguivorum poison status — reads
  // ally.statuses["sang_iag_poison"], same per-ally status bag as U3c.
  U3d: false,
  // Step 1e handoff §0 (9 Nov follow-up): three more kind-A rows added to
  // the register while reconciling Hadrian's attack against Kessa's —
  // all three are an ENEMY's own kit mitigating/countering damage, same
  // D2 principle as the rest of U3 ("an enemy's kit applies to whatever
  // it hits" extends to "and whatever hits it"), just never wired for
  // Hadrian's kit-bearing attack branch (action.kit in
  // calculateDamageAllyActor/rollToHitAllyActor/applyAndReactAllyActor).
  //
  // The enemy's banked Defense bonus (Brace/Guarded Strike/Sure
  // Foundation) protects it from a plain ally's hit but not Hadrian's.
  U3e: false,
  // Smuggler's Guard / Commander's Poise (sangCuDefenderMitigation): the
  // enemy's own flat damage-reduction item effects fire against a plain
  // ally's hit but not Hadrian's.
  U3f: false,
  // Riposte-on-miss: the enemy's own Riposte effect counters a plain
  // ally's miss (riposteCounterByEnemyOnAlly) but not Hadrian's.
  U3g: false,
};

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
  // Step 1d: an ally's turn. Whether to attack at all, which stance/kit
  // action to use, and who to target are ALL decided outside the
  // pipeline today (resolveOneAllyAction's stance dispatch, or
  // resolveCompanionAction's own AI tree for a kit-bearing ally) — same
  // shape as resolveEnemyAction deciding the enemy's ability/target
  // before ever calling the pipeline. No ally-side mechanic stops an
  // action once chosen (no ally stun exists), so this is always a plain
  // pass-through.
  if (actor.kind === "ally") return ctx.pendingAction;
  // Step 1e-i: the player's turn. Same shape as the ally branch above —
  // which action (basic attack today; tactics/elements/apothecary in
  // 1e-ii/iii/iv) and which target were already decided by the
  // orchestrator (playerAttack, combat.js) before the pipeline ever
  // runs, mirroring resolveEnemyAction/resolveOneAllyAction's own
  // convention. No mechanic stops a chosen player action once picked
  // (unlike a stunned enemy), so this is always a plain pass-through.
  if (actor.kind === "player") return ctx.pendingAction;
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
  // Step 1d: the ally's target was already picked outside the pipeline
  // (combat.activeIndex for a plain ally, pickHadrianTarget for a kit-
  // bearing one) — same no-op shape as the enemy branch above. Splash
  // damage to OTHER enemies (Groundbreaker) is NOT a second pipeline
  // target: it reuses the primary hit's own already-computed baseAtk
  // with no separate hit roll, so it's applied in a loop around this
  // single-target pipeline call instead — see resolveHadrianActiveDamage.
  if (actor.kind === "ally" && ctx.target && ctx.target.kind === "enemy") return [ctx.target];
  // Step 1e-i: the player's target (whichever enemy is currently active,
  // state.combat.activeIndex) was already picked outside the pipeline by
  // the orchestrator — same no-op shape as the ally branch above.
  if (actor.kind === "player" && ctx.target && ctx.target.kind === "enemy") return [ctx.target];
  throw new Error(`chooseTargets(): actor "${actor.kind}" -> target not migrated yet.`);
}

// ---- Step 3: roll to hit ----
// Returns { hit: true, accBonus } to continue the pipeline, or
// { hit: false, result: {lines, damage} } to short-circuit with a final
// result (a miss, or one of the several named full-negation effects).
function rollToHit(actor, target, action, ctx) {
  if (actor.kind === "ally" && target.kind === "enemy") return rollToHitAllyActor(actor, target, action, ctx);
  if (actor.kind === "player" && target.kind === "enemy") return rollToHitPlayerActor(actor, target, action, ctx);
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
    // U3a (off by default): Marked Target's bonus reads/clears the same
    // fight-wide combat.exposedTarget the player branch below uses — it
    // was set by whichever enemy last landed a marking hit on EITHER
    // target kind (see the grant side in applyAndReact's ally branch),
    // so no ally-specific storage is needed here, same as the player
    // branch's own read.
    const markedTargetBonusAlly = COMBAT_UNIFY.U3a && combat.exposedTarget && combat.exposedTarget.by !== creature ? 8 : 0;
    if (markedTargetBonusAlly) combat.exposedTarget = null;
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
    const accBonus = baseAccBonus + markedTargetBonusAlly + (duelistPendingAlly ? 10 : 0) + calculatedAimBonusAlly + bankedPrepBonusAlly + measuredAimAccBonusAlly;
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
  if (actor.kind === "ally" && target.kind === "enemy") return calculateDamageAllyActor(actor, target, action, ctx, hitInfo);
  if (actor.kind === "player" && target.kind === "enemy") return calculateDamagePlayerActor(actor, target, action, ctx, hitInfo);
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

    // U1 (off by default): an enemy mage's hit on an ally uses the same
    // element/magic formula the player branch below does, instead of
    // always falling through to the flat physical formula — see
    // COMBAT_UNIFY's own header comment for the matchup-multiplier
    // caveat and why Mirror Soul is deliberately excluded. Adaptive
    // Ward/Spell Ward/Stormwatch 6pc/Stonewarden 6pc check the ALLY's
    // OWN gear (hasEffect/hasSetTier are wearer-neutral) and track their
    // once-per-combat flags on the ally object itself, not on the shared
    // combat object: combat.adaptiveWardElement/stormBarrierUsed/
    // firstHitTakenUsed are the PLAYER's own per-fight state (still flat
    // on state.combat — 1a's deferred field move), and sharing one flag
    // across the whole party would let one fighter's ward block
    // everyone else's. River Warden 6pc's bonus-on-a-successful-evasion
    // (riverWardenMagicBonus) is NOT granted here even if Spell Ward
    // procs — it feeds a player-only evasion-charge mechanic (rollToHit's
    // player branch, kind B in the asymmetry register) that has no ally
    // equivalent to receive it.
    if (COMBAT_UNIFY.U1 && creature.element) {
      const matchup = 1.0;
      const base = randInt(creature.magic - 2, creature.magic + 2);
      const coldBonus = creature.element === "water" && hasColdproof(ally) ? 2 : 0;
      const def = effectiveDef + coldBonus;
      let edmg = Math.max(1, Math.round(mitigate(Math.max(1, base), def) * matchup * executionerMultiplierFor(creature, ally.health, ally.maxHealth)));
      if (COMBAT_UNIFY.U2 && edmg > 0 && hasEffect(creature, "dra_e07_unquenched_focus") && !creature.unquenchedFocusUsed) {
        creature.unquenchedFocusUsed = true;
        edmg = Math.round(edmg * 1.10);
      }
      if (hasEffect(ally, "adaptive_ward")) {
        if (!ally.adaptiveWardElement) {
          ally.adaptiveWardElement = creature.element;
        } else if (creature.element === ally.adaptiveWardElement) {
          edmg = Math.round(edmg * 0.5);
        }
      }
      const swMult = spellWardMultiplier(ally);
      if (swMult < 1) edmg = Math.round(edmg * swMult);
      if (edmg > 0 && !ally.stormBarrierUsed) {
        ally.stormBarrierUsed = true;
        if (hasSetTier(ally, "Stormwatch", 6)) edmg = Math.round(edmg * 0.5);
      }
      if (edmg > 0 && !ally.firstHitTakenUsed) {
        ally.firstHitTakenUsed = true;
        if (hasSetTier(ally, "Stonewarden", 6)) edmg = Math.round(edmg * 0.75);
      }
      return { shortCircuit: false, edmg, kind: "magic", elName: ELEMENTS[creature.element].name.toLowerCase() };
    }

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
    // U3b (off by default): Flowing Discipline's banked +10% on an ally
    // target too, same bank/consume shape as the player branch's own.
    if (COMBAT_UNIFY.U3b && edmg > 0 && hasSetTier(creature, "First Sword's Regalia", 6) && creature.flowingDisciplinePending) {
      creature.flowingDisciplinePending = false;
      creature.flowingDisciplineTurnsLeft = 0;
      edmg = Math.round(edmg * 1.10);
    }
    // U3c (off by default): Winter's Verdict reads the ALLY's own Chilled
    // status (ally.statuses.chilled) rather than the player's
    // combat.playerStatuses.chilled.
    if (COMBAT_UNIFY.U3c && edmg > 0 && !creature.wintersVerdictUsed && hasSetTier(creature, "First Sword's Regalia", 8) && ally.statuses && ally.statuses.chilled) {
      creature.wintersVerdictUsed = true;
      edmg = Math.round(edmg * 1.15);
    }
    if (edmg > 0 && hasEffect(creature, "sang_mil_ie005_decisive_impact") && !creature.decisiveImpactUsed) {
      creature.decisiveImpactUsed = true;
      edmg = Math.round(edmg * 1.08);
    }
    // U3d (off by default): Toxic Preparation reads the ALLY's own
    // Sanguivorum-poison status (ally.statuses["sang_iag_poison"]) rather
    // than the player's combat.playerStatuses["sang_iag_poison"].
    if (COMBAT_UNIFY.U3d && edmg > 0 && hasEffect(creature, "sang_iag_ie008_toxic_preparation") && !creature.toxicPreparationUsed && ally.statuses && ally.statuses["sang_iag_poison"]) {
      creature.toxicPreparationUsed = true;
      edmg += Math.max(1, Math.floor(edmg * 0.05));
    }
    // Stonewarden 6pc's first-hit-taken reduction has no switch yet —
    // tools/combat_asymmetry_register.md flags it needs-Tyler (is it
    // kind A or kind B?) rather than guessing a U3 slot for it here.
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
  if (actor.kind === "ally" && target.kind === "enemy") return applyAndReactAllyActor(actor, target, dmgInfo, ctx, action);
  if (actor.kind === "player" && target.kind === "enemy") return applyAndReactPlayerActor(actor, target, dmgInfo, ctx, action);
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
    // U3a (off by default): grant side of Marked Target — see this
    // function's own read/consume in rollToHit's ally branch.
    if (COMBAT_UNIFY.U3a && edmg > 0 && !creature.markedTargetUsed && hasEffect(creature, "sang_cu_ie002_marked_target") && !combat.exposedTarget) {
      creature.markedTargetUsed = true;
      combat.exposedTarget = { by: creature };
    }
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

/*
 * ---- Step 1d: ally attacking an enemy ----
 *
 * Two structurally DIFFERENT shapes share the actor.kind === "ally"
 * dispatch below, distinguished by action.kit (null for a plain ally —
 * Kessa today — or the kit object for a kit-bearing one — Hadrian):
 *
 *   - Plain ally: allyAggressiveActionLegacy's (combat.js) own formula,
 *     moved here verbatim — banked enemy-Defense consumption (Brace/
 *     Guarded Strike/Sure Foundation), Opening Reach/Executioner
 *     multipliers, sangCuDefenderMitigation, and a miss provoking the
 *     enemy's own Riposte (riposteCounterByEnemyOnAlly).
 *   - Kit-bearing ally: basicCompanionAttackLegacy's fallback swing
 *     (action.ability === null) and useHadrianActive's Crushing Blow/
 *     Groundbreaker direct-damage branch (action.ability set), both
 *     moved here from companion.js. By default this path still has NONE
 *     of the five things the plain-ally path has above — not Opening
 *     Reach, not banked-Defense, not sangCuDefenderMitigation, not
 *     Riposte-on-miss. A real, pre-existing asymmetry between the two
 *     ally-attack shapes, preserved exactly by default rather than
 *     unified — see tools/combat_asymmetry_register.md.
 *
 *     Step 1e handoff §0 (9 Nov follow-up): three of those five are an
 *     ENEMY's own kit (banked Defense, Smuggler's Guard/Commander's
 *     Poise, Riposte), so each now has a U3 switch (U3e/U3f/U3g, off by
 *     default) that extends it to Hadrian's kit path too, same as the
 *     rest of U3. The other two — Opening Reach and the Executioner
 *     multiplier — are the ATTACKING ally's OWN gear bonus, not an enemy
 *     rule, so they don't fit U3's "enemy kind A" shape; the register
 *     tracks them as a new kind instead (kind D, "ally kit difference"),
 *     deferred to Phase 2 alongside kind B.
 *
 * Enemy Defense, stat()-purity (combatant.js's hard rule): stat(state,
 * target, "def") returns the PURE creature.def only. The plain-ally
 * path's banked bonus (Brace/Guarded Strike/Sure Foundation) is summed
 * in separately in calculateDamageAllyActor by PEEKING the three fields
 * (reading, not zeroing) — allyAggressiveActionLegacy used to zero them
 * (and immediately re-grant Sure Foundation if the enemy still wears it)
 * BEFORE computing damage; that one-shot consumption now happens once,
 * in applyAndReactAllyActor (step 5), after the damage number that used
 * the peeked value has already been computed. Nothing re-reads the
 * fields in between, so the computed number is identical either way —
 * only WHEN the mutation happens moved, not what it produces.
 *
 * Ally atk/acc, same purity rule: the plain-ally path's stat(state,
 * actor, "atk"/"acc") calls effectiveAllyAtk/effectiveAllyAcc
 * (companion.js) — pure extracts of allyAggressiveActionLegacy's own
 * inline calc, zero behavior change. The kit-bearing path's atk/acc
 * (ally.atk + hadrianFlatAtkBonus(ally); ally.accuracy, raw) is a
 * SEPARATE, kit-specific formula that never went through
 * allyBuffStatTotal/allyStatusStatTotal/atkPct at all — kept fully
 * inline here rather than routed through stat(), same reasoning as
 * effectiveAllyAtk's own header comment.
 */
function rollToHitAllyActor(actor, target, action, ctx) {
  const state = ctx.state;
  const ally = actor.ref;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;

  if (action.kit) {
    if (!attackConnects(ally.accuracy, creature.agi, action.veteranPct)) {
      // basicCompanionAttackLegacy's miss line (no ability) vs
      // useHadrianActive's (a named active) — genuinely different text.
      // U3g (off by default, handoff §0): with it on, a miss here also
      // provokes the enemy's own Riposte effect, same as the plain-ally
      // miss below.
      const missLine = action.ability
        ? `${ally.name} swings ${action.ability.name} and misses.`
        : `${ally.name} lunges at ${withThe(creature.name, false)} and misses.`;
      const riposteLines = COMBAT_UNIFY.U3g ? riposteCounterByEnemyOnAlly(state, enemySlot, ally) : [];
      return { hit: false, result: { lines: [missLine, ...riposteLines], damage: null } };
    }
    return { hit: true };
  }

  const allyAcc = stat(state, actor, "acc");
  if (!attackConnects(allyAcc, creature.agi)) {
    return { hit: false, result: { lines: [`${ally.name} lunges at ${withThe(creature.name, false)} and misses.`, ...riposteCounterByEnemyOnAlly(state, enemySlot, ally)], damage: null } };
  }
  return { hit: true };
}

function calculateDamageAllyActor(actor, target, action, ctx, hitInfo) {
  const state = ctx.state;
  const ally = actor.ref;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;

  if (action.kit) {
    // U3e (off by default, handoff §0): peek the enemy's banked Defense
    // bonus (Brace/Guarded Strike/Sure Foundation) the same way the
    // plain-ally path below does — PEEKED here, consumed in
    // applyAndReactAllyActor (step 5), same stat()-purity reasoning as
    // the plain-ally path's own header comment.
    const bankedDefKit = COMBAT_UNIFY.U3e
      ? (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0) + (creature.sureFoundationBonusDef || 0)
      : 0;
    // U3f (off by default, handoff §0): the enemy's own Smuggler's Guard/
    // Commander's Poise mitigation, same as the plain-ally path below.
    // sangCuDefenderMitigation has its own one-shot/cooldown consumption
    // built in (smugglersGuardCooldown, commandersPoiseUsed) — calling it
    // only when U3f is on keeps that consumption from ever firing while
    // the switch is off, matching every other U3's "off means untouched".
    const sangMitKit = COMBAT_UNIFY.U3f ? sangCuDefenderMitigation(creature) : 1;
    if (!action.ability) {
      // basicCompanionAttackLegacy.
      const atk = ally.atk + hadrianFlatAtkBonus(ally);
      let edmg = Math.max(1, Math.round(mitigate(randInt(Math.round(atk * 0.85), Math.round(atk * 1.15)), stat(state, target, "def") + bankedDefKit) * sangMitKit));
      edmg = applyHadrianOutgoingDamageBonuses(ally, edmg, creature);
      return { shortCircuit: false, edmg, kind: "ally", bankedDefKit };
    }
    // Crushing Blow / Groundbreaker — useHadrianActive's direct-damage
    // branch. Empowered Strike is a one-shot ATTACKER resource (not
    // enemy Defense), consumed here on a successful hit exactly where
    // the original consumed it — same convention 1b/1c already use for
    // e.g. Unbroken Grip/Decisive Impact's own "Used" flags.
    const ability = action.ability;
    const atkBonus = 1 + (ally.ultimateTurnsLeft > 0 ? ally.ultimateAtkPct : 0);
    const empowered = ability.consumesEmpoweredStrike && ally.empoweredStrikeTurnsLeft > 0;
    const empoweredMult = empowered ? 1 + ally.empoweredStrikePct : 1;
    if (empowered) { ally.empoweredStrikePct = 0; ally.empoweredStrikeTurnsLeft = 0; }
    const baseAtk = (ally.atk + hadrianFlatAtkBonus(ally)) * atkBonus * empoweredMult;
    // Unbroken Momentum (ascended Maul): Crushing Blow's Defense-ignore
    // rises from 20% to 30%; Groundbreaker's splash rises from 60% to 75%.
    const defIgnore = (ability.defIgnorePct || 0) + (action.ascended && ability.id === "crushing_blow" ? 0.1 : 0);
    const splashAtkMult = ability.splashAtkMult != null ? ability.splashAtkMult + (action.ascended ? 0.15 : 0) : 0;
    let edmg = Math.max(1, Math.round(mitigate(baseAtk * ability.atkMult, (stat(state, target, "def") + bankedDefKit) * (1 - defIgnore)) * sangMitKit));
    edmg = applyHadrianOutgoingDamageBonuses(ally, edmg, creature);
    // baseAtk/splashAtkMult ride along for resolveHadrianActiveDamage's
    // caller (useHadrianActive) to apply Groundbreaker's splash with —
    // see this file's header on why splash isn't a second pipeline target.
    return { shortCircuit: false, edmg, kind: "ally", baseAtk, splashAtkMult, bankedDefKit };
  }

  // Plain ally (no kit) — allyAggressiveActionLegacy.
  const allyAtk = stat(state, actor, "atk");
  const reduction = 1 - (creature.dmgReduction || 0);
  // Brace/Guarded Strike/Sure Foundation: PEEKED, not consumed — see
  // this file's header. The actual zero + Sure Foundation re-grant moved
  // to applyAndReactAllyActor (step 5).
  const bankedDef = (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0) + (creature.sureFoundationBonusDef || 0);
  const effectiveDef = stat(state, target, "def") + bankedDef;
  const sangMit = sangCuDefenderMitigation(creature);
  let edmg = Math.max(1, Math.round(mitigate(randInt(Math.round(allyAtk * 0.85), Math.round(allyAtk * 1.15)), effectiveDef) * reduction * sangMit)); // v0.11 shared ratio mitigation
  edmg = applyOpeningReachForActor(ally, edmg);
  edmg = Math.round(edmg * executionerMultiplierFor(ally, enemySlot.hp, enemySlot.maxHp));
  return { shortCircuit: false, edmg, kind: "ally" };
}

function applyAndReactAllyActor(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const ally = actor.ref;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  let edmg = dmgInfo.edmg;

  if (action.kit) {
    const kit = action.kit;
    // U3e (off by default, handoff §0): consume the peeked banked
    // Defense bonus the same way the plain-ally path below does, only
    // once a hit actually lands — same stat()-purity timing. Guarded on
    // the switch itself (not just on bankedDefKit being nonzero), so
    // with U3e off this block never runs at all — no zero, no Sure
    // Foundation re-grant — matching today's untouched behavior exactly.
    if (COMBAT_UNIFY.U3e) {
      creature.braceBonusDef = 0;
      creature.guardedStrikeBonusDef = 0;
      creature.sureFoundationBonusDef = 0;
      creature.sureFoundationBonusDefTurnsLeft = 0;
      if (hasEffect(creature, "dra_e05_sure_foundation")) {
        creature.sureFoundationBonusDef = 2;
        creature.sureFoundationBonusDefTurnsLeft = 2;
      }
    }
    enemySlot.hp -= edmg;
    enemySlot.lastDamageType = "physical";
    const lines = action.ability
      ? [`${ally.name} lands ${action.ability.name} on ${withThe(creature.name, false)} for ${edmg} damage.`]
      : [`${ally.name} strikes ${withThe(creature.name, false)} for ${edmg} damage.`];
    let killed = false;
    if (enemySlot.hp <= 0 && enemySlot.alive) {
      lines.push(...killEnemyAsAlly(state, enemySlot));
      killed = true;
    }
    if (!action.ability) {
      // basicCompanionAttackLegacy: onHadrianKill fires right away, no
      // splash to wait on.
      if (killed) onHadrianKill(state, ally, kit);
      return { lines, damage: null };
    }
    // Crushing Blow/Groundbreaker: onHadrianKill fires once, AFTER
    // splash — resolveHadrianActiveDamage's caller (useHadrianActive)
    // collects "killed" across primary + splash and fires it there, not
    // here, same as the original's single killedAny flag.
    return { lines, damage: null, killedPrimary: killed, baseAtk: dmgInfo.baseAtk, splashAtkMult: dmgInfo.splashAtkMult };
  }

  // Plain ally (no kit) — allyAggressiveActionLegacy.
  // Brace/Guarded Strike/Sure Foundation ON THE ENEMY: the one-shot
  // zero + Sure Foundation's immediate re-grant — see this file's header.
  creature.braceBonusDef = 0;
  creature.guardedStrikeBonusDef = 0;
  creature.sureFoundationBonusDef = 0;
  creature.sureFoundationBonusDefTurnsLeft = 0;
  if (hasEffect(creature, "dra_e05_sure_foundation")) {
    creature.sureFoundationBonusDef = 2;
    creature.sureFoundationBonusDefTurnsLeft = 2;
  }
  enemySlot.hp -= edmg;
  enemySlot.lastDamageType = "physical";
  const lines = [`${ally.name} strikes ${withThe(creature.name, false)} for ${edmg} damage.`];
  // Guarded Strike ON THE ALLY ITSELF: banks +2 Defense against whatever
  // hits this ally next — unconditional (no edmg > 0 guard in the
  // original, unlike the enemy/ally-as-target versions elsewhere in
  // this file).
  if (hasEffect(ally, "guarded_strike")) ally.guardedStrikeBonusDef = 2;
  if (enemySlot.hp <= 0 && enemySlot.alive) lines.push(...resolveKill(state, creature));
  return { lines, damage: null };
}

// ---- Orchestrator: a plain ally (no abilityKit — Kessa today)
// attacking the active enemy. Same signature/return shape as the old
// allyAggressiveAction (now allyAggressiveActionLegacy in combat.js), so
// the one real call site (resolveOneAllyAction, combat.js) keeps calling
// allyAggressiveAction(state, ally) by name, unchanged.
function allyAggressiveAction(state, ally) {
  const combat = state.combat;
  const enemySlot = combat.enemies[combat.activeIndex];
  if (!enemySlot || !enemySlot.alive) return [];
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, enemySlot, combat.activeIndex);
  const action = { kit: null, ability: null };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: a kit-bearing ally's (Hadrian's) fallback basic
// attack, when nothing in the kit is off cooldown. Same signature/return
// shape as the old basicCompanionAttack (now basicCompanionAttackLegacy
// in companion.js), so the one real call site (resolveCompanionAction)
// keeps calling basicCompanionAttack(state, ally, enemies) unchanged.
function basicCompanionAttack(state, ally, enemies) {
  const kit = ALLY_DEFS[ally.defId].abilityKit;
  const targetSlot = pickHadrianTarget(enemies);
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, targetSlot, state.combat.enemies.indexOf(targetSlot));
  const action = { kit, ability: null, veteranPct: veteranBonusPct(ally, kit) };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: the PRIMARY target only of one of Hadrian's direct-
// damage Actives (Crushing Blow/Groundbreaker). Called from
// useHadrianActive (companion.js) after its own hit-roll-independent
// setup (cooldowns, taunts, self-buffs — none of which reach here).
// Groundbreaker's splash damage to every OTHER alive enemy reuses this
// call's own baseAtk/splashAtkMult (no separate hit roll — see this
// file's chooseTargets comment), so useHadrianActive applies splash
// itself, in its own loop, using the values returned here, rather than
// this function looping over every enemy.
function resolveHadrianActiveDamage(state, ally, kit, ability, targetSlot, veteranPct, ascended) {
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, targetSlot, state.combat.enemies.indexOf(targetSlot));
  const action = { kit, ability, veteranPct, ascended };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return { lines: hitInfo.result.lines, hit: false };

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return { lines: result.lines, hit: true, killedPrimary: result.killedPrimary, baseAtk: result.baseAtk, splashAtkMult: result.splashAtkMult };
}

/*
 * ---- Step 1e-i: player attacking an enemy (the basic attack) ----
 *
 * The first of four sub-steps moving the player's own actions onto the
 * pipeline (spec §4's ordering: basic attack first, since every other
 * player action's damage math builds on rollPlayerDamage's own formula).
 * Only playerAttack (combat.js) is migrated here — Decoy/Ambush/Disarm/
 * element abilities/apothecary abilities (1e-ii/iii/iv) all still call
 * the ORIGINAL, untouched rollPlayerDamage/attackFlavorLine/
 * critMultiplier directly; this section does not touch any of those
 * three shared functions, and does not rename or alter them. playerAttack
 * itself is kept as playerAttackLegacy (combat.js, byte-identical, the
 * Layer 1 parity oracle) — the live call site (parser.js's "fight" verb)
 * now resolves to the pipeline-backed definition below.
 *
 * calculateDamagePlayerActor is its OWN copy of rollPlayerDamage's full
 * formula (both branches, every multiplier, in the same order, calling
 * the same helper functions) — NOT a call to the shared rollPlayerDamage,
 * because that function eagerly consumes two things this pipeline must
 * instead PEEK in step 4 and consume in step 5 (stat()-purity,
 * combatant.js's hard rule):
 *
 *   - The enemy's banked Brace/Guarded Strike/Sure Foundation Defense
 *     bonus — same split 1d already made for the ally-attack path on
 *     this exact creature object (see pipeline.js's step-1d header).
 *     Brace/Guarded Strike are peeked and added to the pure
 *     stat(state, target, "def") in step 4; zeroed in step 5,
 *     unconditionally (spell or physical), matching rollPlayerDamage's
 *     own original timing exactly. Sure Foundation is peeked the same
 *     way, added to effDef ONLY in the physical branch (it's physical-
 *     only, "magic bypasses it" — rollPlayerDamage's own comment), and
 *     its zero + immediate re-grant (if the enemy still wears
 *     dra_e05_sure_foundation) also moves to step 5, gated on the SAME
 *     physical-branch flag — a magic hit still never touches it, exactly
 *     as before.
 *   - The player's own Attack stat (step 1e handoff §3.2): rollPlayerDamage's
 *     physical branch reads it via effectivePlayerAtk(state), which
 *     consumes a Siege Corps one-shot +2 charge as a side effect of the
 *     read. combatant.js's stat() dispatcher for player "atk" already
 *     called effectivePlayerAtk directly (since step 1a) — an unnoticed
 *     stat()-purity violation, since nothing had yet called stat(player,
 *     "atk") more than once, or for anything but resolving one hit, until
 *     this step's own test (phase1_step1a_combatant_ledger.js's
 *     PARITY-PLAYER-07) went looking. Fixed at the root: stat()'s "atk"
 *     case now calls peekPlayerAtk (combat.js), a pure twin that PEEKS
 *     the charge via peekSiegeCorpsAtkCharge instead of consuming it.
 *     effectivePlayerAtk ITSELF is untouched — still consumes on every
 *     call, exactly as before — because every not-yet-migrated player
 *     action still calls it directly and must keep doing so unchanged.
 *     This pipeline's own calculateDamagePlayerActor reads
 *     stat(state, actor, "atk") (now pure); applyAndReactPlayerActor
 *     (step 5) calls consumeSiegeCorpsAtkCharge(state) directly, once,
 *     only when the physical branch actually ran — the SAME one-shot
 *     spend rollPlayerDamage's single effectivePlayerAtk call always
 *     produced, just moved one pipeline step later. Nothing re-reads the
 *     charge in between, so the roll's own number is provably identical
 *     either way — PARITY-PLAYER-07 checks exactly that.
 *
 * Every OTHER mutation inside rollPlayerDamage's body (Tempered Steel's
 * stack growth, Momentum/Worthy Challenge stacks, Blessing of Fortune's
 * crit-chance stacks, Avatar of Chaos's random stat bump, Avatar of
 * War/Passing's silent heals, Soul Leech's heal, the Enemy Ability
 * Engine's flat reduction + onHitTaken reflect/status/counter passives,
 * sangCuDefenderMitigation's own cooldown/used-flag consumption, the
 * per-enemy hitsTakenFromPlayer counter, Avatar of Creation's permanent
 * stat stacks) is copied into calculateDamagePlayerActor UNCHANGED, at
 * the exact same point, mutating the exact same fields — none of these
 * are read through stat() or have an existing peek/defer precedent (the
 * closest analog, sangCuDefenderMitigation, is ALREADY called eagerly
 * inline in calculateDamageAllyActor's own plain-ally branch, step 1d —
 * so leaving these inline here is consistent, not a shortcut). Moving
 * WHEN only the two items above happen is the full, deliberate scope of
 * this step's purity fix; nothing else about rollPlayerDamage's timing
 * changes.
 *
 * applyOpeningReach/borrowedSecondsActive/the Feint nextAttackBonus
 * check (playerAttack's own post-rollPlayerDamage modifiers, applied to
 * the returned dmg before the HP write) move into calculateDamagePlayerActor
 * too, in their original order, immediately after the rollPlayerDamage-
 * equivalent block — they're part of computing the FINAL damage number,
 * which step 4 owns. The Feint flag's own zeroing stays inline (not
 * deferred): it isn't Defense-shaped, and nothing establishes a
 * precedent for splitting it. Its "Your feint pays off —" line is
 * threaded through dmgInfo.feintBonusApplied for applyAndReactPlayerActor
 * to prepend, since calculateDamage doesn't build lines directly anywhere
 * in this file.
 */
function rollToHitPlayerActor(actor, target, action, ctx) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    return {
      hit: false,
      result: {
        lines: [`Your attack goes wide — ${withThe(creature.name, false)} isn't where you expected.`, ...riposteCounterOnPlayer(state, creature)],
        damage: null,
      },
    };
  }
  return { hit: true };
}

function calculateDamagePlayerActor(actor, target, action, ctx, hitInfo) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  const { isPhysical, activeElement } = action;

  // ---- rollPlayerDamage's own body (combat.js), copied -- see this
  // section's header for exactly what moved and what didn't. ----
  const defPenalty = (state.combat && state.combat.enemyDefPenalty) || 0;
  const sangMit = sangCuDefenderMitigation(creature) * enemyOneHitMitigationMultiplier(creature) * enemyRepeatableMitigationMultiplier(creature) * enemyAllyProtectionMultiplier(state, creature);
  // Brace/Guarded Strike/Sure Foundation: PEEKED, not consumed -- see
  // this section's header. Consumption moves to applyAndReactPlayerActor
  // (step 5).
  const bankedDefBonus = (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0);
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
  const isSpell = !!(state.flags.isMage && state.primaryElement);
  const critMult = critMultiplier(state, isSpell);
  const threadsMult = state.combat && state.combat.threadsOfConsequencePending ? 1.4 : 1;
  const stonesPatienceMult = state.combat && state.combat.enemyActedFirstThisRound && hasEffect(state, "stones_patience") ? 1.3 : 1;
  const worthyMult = worthyChallengeMultiplier(state);
  const valorMult = blessingOfValorMultiplier(state);
  const commandingDefMult = commandingPresenceDefMultiplier(state);
  const loadedDiceMult = loadedDiceMultiplier(state);
  const chaosMult = avatarOfChaosDamageMultiplier(state);
  const momentumUnboundMult = momentumUnboundMultiplier(state);
  const temperedSteelMult = temperedSteelMultiplier(state);
  const avatarOfTimeMult = state.combat && state.combat.avatarOfTimeTurns > 0 ? 1.25 : 1;
  let dmg;
  if (isSpell) {
    const magic = effectiveMagic(state);
    let base = randInt(magic - 2, magic + 2);
    if (hasEffect(state, "arcane_convergence")) base = Math.max(base, randInt(magic - 2, magic + 2));
    const multiplier = 1 + magic / 60;
    const matchup = avatarOfKnowledgeMatchupOverride(state, elementMultiplier(state, activeElement, creature.element));
    const effDef = Math.max(0, stat(state, target, "def") + bankedDefBonus - defPenalty) * foreseenDefMult * commandingDefMult * precisionFormulaMultiplier(state);
    const overflowMult = arcaneOverflowMultiplier(state);
    const spellPower = base * multiplier;
    const preMitigation = Math.round(mitigate(spellPower, effDef) * matchup * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * overflowMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * avatarOfTimeMult * stonesPatienceMult);
    dmg = Math.max(1, Math.round(preMitigation * (1 - (creature.dmgReduction || 0)) * sangMit));
    if (state.combat.avatarOfCreationTurns > 0) {
      state.combat.avatarOfCreationMagicStacks = (state.combat.avatarOfCreationMagicStacks || 0) + 2;
    }
  } else {
    const armorCrack = armorCrackAmount(state);
    const effDef = Math.max(0, stat(state, target, "def") + bankedDefBonus + sureFoundationDef - defPenalty - armorCrack) * foreseenDefMult * commandingDefMult;
    // atk: peeked via stat() (pure) -- see this section's header on the
    // Siege Corps purity fix. Produces the identical number as
    // effectivePlayerAtk would have on this same single read.
    const atk = stat(state, actor, "atk");
    const crushBase = crushingImpactMultiplier(state);
    const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
    const craftsmanMult = hasEffect(state, "master_craftsman") ? masterCraftsmanMultiplier(atk, creature) : 1;
    const base = mitigate(randInt(Math.max(1, atk - 2), atk + 2), effDef);
    state.combat.weaponAttackCounter = (state.combat.weaponAttackCounter || 0) + 1;
    const echoingArsenalMult = hasEffect(state, "echoing_arsenal") && state.combat.weaponAttackCounter % 5 === 0 ? 2 : 1;
    dmg = Math.max(1, Math.round(base * crushMult * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * echoingArsenalMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * craftsmanMult * avatarOfTimeMult * stonesPatienceMult * (1 - (creature.dmgReduction || 0)) * sangMit));
    if (state.combat.avatarOfCreationTurns > 0) {
      state.combat.avatarOfCreationAtkStacks = (state.combat.avatarOfCreationAtkStacks || 0) + 2;
    }
  }
  if (hasEffect(state, "tempered_steel")) {
    state.combat.temperedSteelStacks = Math.min(15, (state.combat.temperedSteelStacks || 0) + 1);
  }
  state.combat.threadsOfConsequencePending = false;
  state.combat.enemyActedFirstThisRound = false;
  if (hasEffect(state, "momentum")) {
    state.combat.momentumStacks = Math.min(5, (state.combat.momentumStacks || 0) + 1);
  }
  if (hasEffect(state, "worthy_challenge")) {
    state.combat.worthyChallengeStacks = Math.min(10, (state.combat.worthyChallengeStacks || 0) + 1);
  }
  if (critMult > 1) {
    if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) {
      state.combat.blessingOfFortuneCritStacks = Math.min(5, (state.combat.blessingOfFortuneCritStacks || 0) + 1);
    }
    if (state.combat.avatarOfChaosTurns > 0) {
      const statName = ["Atk", "Def", "Magic", "Knowledge"][Math.floor(Math.random() * 4)];
      const field = "avatarOfChaos" + statName + "Bonus";
      state.combat[field] = Math.min(30, (state.combat[field] || 0) + 10);
    }
  }
  if (state.combat && state.combat.avatarOfWarTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.1));
  }
  if (hasEffect(state, "soul_leech") && state.health < state.maxHealth) {
    const leechPct = masterOfArmsDoubles(state, "soul_leech") ? 0.2 : 0.1;
    const leech = Math.round(dmg * leechPct);
    applyHeal(state, leech);
  }
  if (state.combat && state.combat.avatarOfPassingTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.3));
  }
  if (state.combat && creature.passives && creature.passives.length) {
    dmg = applyEnemyFlatDamageReduction(dmg, creature);
    applyEnemyOnHitTakenPassives(state, creature, dmg);
  }
  if (state.combat) state.combat.hitsTakenFromPlayer = (state.combat.hitsTakenFromPlayer || 0) + 1;

  // ---- playerAttack's own post-rollPlayerDamage modifiers (combat.js) ----
  if (isPhysical) dmg = applyOpeningReach(state, dmg);
  if (borrowedSecondsActive(state)) dmg = Math.round(dmg * 1.15);
  let feintBonusApplied = false;
  if (state.combat.nextAttackBonus) {
    const feintMult = hasEffect(state, "patient_aim") ? 1.75 : 1.6;
    dmg = Math.round(dmg * feintMult);
    state.combat.nextAttackBonus = false;
    feintBonusApplied = true;
  }

  return { shortCircuit: false, edmg: dmg, kind: "enemy", isPhysical, feintBonusApplied };
}

function applyAndReactPlayerActor(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  const edmg = dmgInfo.edmg;
  const isPhysical = dmgInfo.isPhysical;

  // Siege Corps atk charge (step 1e handoff §3.2 purity fix): peeked in
  // step 4 via stat(state, actor, "atk") -- consumed here, once, only
  // when the physical branch actually read it (effectivePlayerAtk, which
  // this charge used to ride through, is only ever called from the
  // physical branch — see this section's own header).
  if (isPhysical) consumeSiegeCorpsAtkCharge(state);

  // Brace/Guarded Strike/Sure Foundation: consumed here -- see this
  // section's own header for why (stat()-purity, same split 1d made for
  // the ally-attack path on this exact creature object).
  creature.braceBonusDef = 0;
  creature.guardedStrikeBonusDef = 0;
  if (isPhysical) {
    creature.sureFoundationBonusDef = 0;
    creature.sureFoundationBonusDefTurnsLeft = 0;
    if (hasEffect(creature, "dra_e05_sure_foundation")) {
      creature.sureFoundationBonusDef = 2;
      creature.sureFoundationBonusDefTurnsLeft = 2;
    }
  }

  enemySlot.hp -= edmg;
  enemySlot.lastDamageType = isPhysical ? "physical" : action.activeElement;
  const lines = [];
  if (dmgInfo.feintBonusApplied) lines.push("Your feint pays off —");
  lines.push(attackFlavorLine(state, creature, edmg, action.activeElement));

  // No "&& enemySlot.alive" guard here, unlike the ally-actor branches
  // above -- playerAttackLegacy's own kill check is the bare
  // `state.combat.hp <= 0`, and enemySlot here is the stale-creature
  // shim built in the orchestrator (see playerAttack's own comment),
  // which has no independent .alive tracking of its own to check.
  if (enemySlot.hp <= 0) {
    lines.push(...resolveKill(state, creature));
    return { lines, damage: edmg, killed: true, isPhysicalHit: isPhysical };
  }
  if (isPhysical) lines.push(...applyPhysicalOnHitEffects(state, creature));
  if (edmg > 0) lines.push(...arenaRiposteCounterOnPlayer(state, creature));
  return { lines, damage: edmg, killed: false, isPhysicalHit: isPhysical };
}

// ---- Orchestrator: the player's basic attack (combat.js's "fight" verb,
// step 1e-i). Everything NOT part of the five-step pipeline itself (turn
// bookkeeping, speed initiative, action-type tracking, the rest of the
// round's initiative order, low-health/evasion/Riposte checks, the
// tactics line, Reflect Death) stays exactly where playerAttackLegacy had
// it — only the attack roll/damage/application in the middle is now
// pipeline-driven. See this file's own step 1e-i header, above, for what
// moved into calculateDamagePlayerActor and why.
function playerAttack(state) {
  if (!state.combat) return ["There's nothing here to fight."];
  let creature = getCombatCreature(state);
  if (creature.friendly) {
    return [`${withThe(creature.name, true)} has done you no harm. Attacking it seems both unwise and unkind.`];
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
  out.push(...applyEndlessStudy(state, "attack"), ...applyWanderersReward(state, "attack"), ...applyActionTypeTracking(state, "attack"));

  const isPhysical = !(state.flags.isMage && state.primaryElement);
  const activeElement = isPhysical ? null : pickElement(state);

  // `creature` is deliberately NOT re-fetched here, even though
  // resolveSpeedInitiative just above can itself kill the active enemy
  // (a faster enemy's pre-emptive strike provoking a companion's own
  // retaliation, say) and move state.combat.activeIndex on —
  // playerAttackLegacy's own behavior, exactly: every stat read below
  // (Agility, Defense, dmgReduction, banked Defense bonuses, passives,
  // element) reads off THIS creature reference, while the HP write and
  // resolveKill (inside applyAndReactPlayerActor) go through
  // state.combat's own live proxy, which always means "whichever enemy
  // is active right now" — so a kill during the pre-emptive phase can
  // make this attack's own damage math read one creature's defenses
  // while the hit actually lands on a different one. A real, narrow,
  // pre-existing engine quirk, confirmed by diffing a Layer 2 sweep cell
  // against step 1d's own baseline during this step's own verification
  // — not something this step's pure restructure is allowed to fix
  // (that would be a real behavior change, not a restructure); flagged
  // here and in the step's own report instead of silently corrected.
  // enemySlot below is a thin shim, NOT a real per-fight record: its
  // creatureObj is fixed to this same stale `creature`, while its
  // mutable fields (hp/maxHp/lastDamageType) forward to state.combat's
  // own proxy, reproducing exactly which parts of the original read
  // stale and which stay live.
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
  const action = { id: "basic_attack", isPhysical, activeElement };
  const ctx = { state, pendingAction: action, target };
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
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}
