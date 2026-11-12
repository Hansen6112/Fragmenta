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
 * One deliberate, disclosed departure from a "pure" five-step split was
 * introduced in 1b and RESOLVED in step 1f-iii (reactions, §4):
 *
 *   1. Mirror Soul (Artifact), as of 1b, was a full short-circuit found
 *      INSIDE calculateDamage: the first hostile spell each combat was
 *      reflected onto the CASTER (not the original target), including
 *      that creature's own HP loss and kill resolution, resolved
 *      immediately and returned — an HP write inside step 4, not step 5,
 *      a real exception to the "HP changes only in applyAndReact" rule
 *      (spec section 3, hard rule), forced by Mirror Soul redirecting the
 *      hit onto a DIFFERENT combatant than the one steps 2-5 were
 *      resolving for.
 *
 *      As of 1f-iii, this exception is gone: calculateDamage still finds
 *      the trigger and computes the same reflected-damage number (same
 *      single randInt draw, same order), but now returns
 *      { shortCircuit: false, edmg, kind: "mirrorSoul" } instead of
 *      writing HP itself. applyAndReact dispatches on dmgInfo.kind to
 *      applyAndReactMirrorSoul, which performs the HP write and kill
 *      resolution in step 5, as a reaction against the attacker — see
 *      that function's own comment, below.
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
  // already handled as its own reaction by step 1f-iii (this file's
  // header departure note above); U1 doesn't entangle a second open
  // question with it.
  U1: true,
  // Dregnar's Unquenched Focus (dra_e07) applies on his first successful
  // elemental hit against an ally too, not just the player. Only
  // meaningful with U1 also on (there's no elemental hit on an ally for
  // it to trigger from otherwise) — gated on both flags at the call site,
  // not implied by U1 alone, so flipping U1 on by itself doesn't silently
  // also turn U2 on.
  U2: true,
  // Marked Target (sang_cu_ie002_marked_target): a successful hit marks
  // the TARGET (combat.player.exposedTarget), not just the player, and the
  // marked-target accuracy bonus is read/consumed on an ally-targeted
  // roll too.
  U3a: true,
  // Flowing Discipline (First Sword's Regalia 6pc): the banked +10%
  // physical-damage bonus fires on an ally-targeted hit too.
  U3b: true,
  // Winter's Verdict (First Sword's Regalia 8pc): fires when the ALLY
  // (not just the player) is Chilled — reads ally.statuses.chilled,
  // the same per-ally status bag Serrated Opening's bleed check already
  // reads in this file's ally branches.
  U3c: true,
  // Toxic Preparation (sang_iag_ie008): fires when the ALLY (not just
  // the player) carries the Sanguivorum poison status — reads
  // ally.statuses["sang_iag_poison"], same per-ally status bag as U3c.
  U3d: true,
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
  U3e: true,
  // Smuggler's Guard / Commander's Poise (sangCuDefenderMitigation): the
  // enemy's own flat damage-reduction item effects fire against a plain
  // ally's hit but not Hadrian's.
  U3f: true,
  // Riposte-on-miss: the enemy's own Riposte effect counters a plain
  // ally's miss (riposteCounterByEnemyOnAlly) but not Hadrian's.
  U3g: true,
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
    // Step 1f-iii §4: a reaction (riposteCounterOnPlayer/arenaRiposte
    // CounterOnPlayer) never advanced this counter either -- the original
    // functions never touched combat.reinforcedAttackCount at all.
    if (!ctx.pendingAction.isReaction && ctx.target && ctx.target.kind === "player") {
      const combat = ctx.state.combat;
      if (hasEffect(ctx.state, "reinforced")) {
        activeEnemySlot(combat).reinforcedAttackCount = (activeEnemySlot(combat).reinforcedAttackCount || 0) + 1;
        if (activeEnemySlot(combat).reinforcedAttackCount % 3 === 0 && (combat.player.reinforcedDefStacks || 0) < 20) {
          combat.player.reinforcedDefStacks = Math.min(20, (combat.player.reinforcedDefStacks || 0) + 2);
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
  // bearing one) — same no-op shape as the enemy branch above.
  if (actor.kind === "ally" && ctx.target && ctx.target.kind === "enemy") {
    // Step 1g-ii §2a: Groundbreaker's splash, generalized as a real
    // multi-target pick instead of useHadrianActive's own private loop.
    // The primary target is still [0]; every OTHER alive enemy in
    // ctx.allEnemies (the same already-alive-filtered list the caller
    // built) follows, in that same order — exactly who useHadrianActive's
    // old inline loop hit, just chosen here instead. Each splash target
    // still reuses the primary hit's own already-computed baseAtk (no
    // separate hit roll of its own) — see resolveHadrianActiveDamage,
    // which is the only caller that ever runs steps 4-5 against targets
    // [1..] from this list.
    if (action.targeting === "packSplash" && ctx.allEnemies) {
      const state = ctx.state;
      const splashTargets = ctx.allEnemies
        .filter((e) => e.alive && e !== ctx.target.store)
        .map((e) => makeEnemyCombatant(state, e, state.combat.enemies.indexOf(e)));
      return [ctx.target, ...splashTargets];
    }
    return [ctx.target];
  }
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
  // Step 1f-iii §4 (Spell Echo, found while scoping audit rule P1):
  // a reaction against an ENEMY with toHit: "none" must stay
  // unconditional -- the top-level dispatch below sends every OTHER
  // player-actor-vs-enemy-target case to rollToHitPlayerActor
  // UNCONDITIONALLY (it never reads action.toHit at all, since a normal
  // player attack always rolls), which would impose a real accuracy
  // check Spell Echo's own original code never had (it's just half of
  // damage ALREADY dealt by the first casting, never its own roll).
  if (action.isReaction && action.toHit === "none" && actor.kind === "player" && target.kind === "enemy") return { hit: true };
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

  // Step 1f-iii §4: a reaction declares its own, much simpler to-hit
  // shape -- "none" always lands (e.g. arenaRiposteCounterOnPlayer,
  // which never rolled a to-hit check); "simple" rolls a bare
  // acc-vs-agility check with none of the accuracy bonuses, evasion
  // consumption, or named-miss effects (Timeless Guard, Guardian
  // Spirit, ...) the normal enemy-vs-player roll below has -- riposte
  // CounterOnPlayerLegacy's own check never had any of those either.
  // `action.missLine` is a function (same declared-field convention as
  // flavorLine) for the distinct miss text. No existing caller declares
  // either toHit value, so both are pure additions -- zero effect on
  // any normal enemy attack.
  if (action.toHit === "none") return { hit: true };
  if (action.toHit === "simple") {
    return attackConnects(creature.acc, effectivePlayerAgility(state)) ? { hit: true } : miss(action.missLine(creature));
  }

  if (target.kind === "ally") {
    const ally = target.ref;
    // U3a (off by default): Marked Target's bonus reads/clears the same
    // fight-wide combat.player.exposedTarget the player branch below uses — it
    // was set by whichever enemy last landed a marking hit on EITHER
    // target kind (see the grant side in applyAndReact's ally branch),
    // so no ally-specific storage is needed here, same as the player
    // branch's own read.
    const markedTargetBonusAlly = COMBAT_UNIFY.U3a && combat.player.exposedTarget && combat.player.exposedTarget.by !== creature ? 8 : 0;
    if (markedTargetBonusAlly) combat.player.exposedTarget = null;
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
  if (combat.player.exposedTarget && combat.player.exposedTarget.by !== creature) {
    markedTargetBonus = 8;
    combat.player.exposedTarget = null;
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
  if (hasEffect(state, "guardian_spirit") && !combat.player.guardianSpiritUsed) {
    combat.player.guardianSpiritUsed = true;
    return miss(`Guardian Spirit turns the first blow aside completely.`);
  }
  if (hasEffect(state, "guided_footsteps") && !combat.player.guidedFootstepsUsed) {
    combat.player.guidedFootstepsUsed = true;
    if (Math.random() < 0.75) return miss(`Guided Footsteps — you're already a step from where it lands.`);
  }
  if (hasEffect(state, "never_where_expected") && Math.random() < 0.15) {
    return miss(`Never Where Expected — it swings, and finds nothing there.`);
  }
  if (hasSetTier(state, "Regalia of the Endless Horizon", 2) && Math.random() < 0.15) {
    return miss(`Blessing of Freedom carries you clear of the blow.`);
  }
  if (combat.player.avatarOfFreedomTurns > 0 && Math.random() < 0.5) {
    return miss(`Avatar of Freedom carries you beyond its reach entirely.`);
  }
  let evasionRolled = false;
  if (combat.player.evasionCharges > 0) {
    combat.player.evasionCharges -= 1;
    evasionRolled = Math.random() < 0.5;
  } else if (combat.player.evasionTurns > 0) {
    evasionRolled = Math.random() < 0.5;
  }
  if (evasionRolled) {
    if (hasEffect(state, "evasive_guard")) combat.player.evasiveGuardBonus = Math.min(3, combat.player.evasiveGuardBonus + 1);
    if (creature.element && hasSetTier(state, "River Warden", 6)) {
      combat.player.riverWardenMagicBonus = Math.min(8, combat.player.riverWardenMagicBonus + 2);
    }
    return miss(`You slip past ${withThe(creature.name, false)}'s counter entirely.`);
  }
  return { hit: true, accBonus, bankedPrepDmgMultBonus };
}

// ---- Step 4: calculate damage ----
// Returns { shortCircuit: true, result } in cases this file's header
// documents as departures, or { edmg, kind } to continue into
// applyAndReact — edmg is the fully-computed pre-mitigation damage.
// Mirror Soul's reflection no longer shortCircuits: it returns
// { shortCircuit: false, edmg, kind: "mirrorSoul" } so applyAndReact
// performs the HP write in step 5, as a reaction against the attacker.
function calculateDamage(actor, target, action, ctx, hitInfo) {
  // Step 1f-iv §5: a DOT tick (action.isTick) is self-contained -- actor
  // and target are the SAME combatant (whoever's carrying the status),
  // so it never fits the actor-kind-vs-target-kind dispatch below. Its
  // damage number is still resolved by formula name exactly like every
  // other action's (js/data/actions.js's PIPELINE_FORMULAS), just called
  // directly here instead of falling through to a kind-specific branch.
  if (action.isTick) return PIPELINE_FORMULAS[action.formula](actor, target, action, ctx, hitInfo);
  // Step 1f-iii §4: the PLAYER's own Riposte (maybeRiposte) landing on an
  // ENEMY is a reaction, not a normal player attack -- calculateDamagePlayerActor's
  // own body carries real basic-attack-only baggage a riposte never had
  // (Siege Corps atk-charge peek, openingReach, Lightning's second roll,
  // elementOnHit hooks, feint consumption), so it gets the formula table
  // directly instead, same reasoning as every other reaction in this step.
  if (action.isReaction && actor.kind === "player" && target.kind === "enemy") return PIPELINE_FORMULAS[action.formula](actor, target, action, ctx, hitInfo);
  if (actor.kind === "ally" && target.kind === "enemy") return calculateDamageAllyActor(actor, target, action, ctx, hitInfo);
  if (actor.kind === "player" && target.kind === "enemy") return calculateDamagePlayerActor(actor, target, action, ctx, hitInfo);
  if (!(actor.kind === "enemy" && (target.kind === "player" || target.kind === "ally"))) {
    throw new Error(`calculateDamage(): "${actor.kind}" -> "${target.kind}" not migrated yet.`);
  }
  const state = ctx.state;
  const combat = state.combat;
  const creature = actor.ref.creatureObj;

  // Mirror Soul (Artifact): a magical hit on the PLAYER can be reflected
  // back at the caster. Step 1f-iii §4: "the reflected damage becomes a
  // reaction against the attacker that goes through step 5. This
  // removes the step-4 HP-write exception from 1b." So the TRIGGER
  // check and the damage NUMBER (base/matchup/reflected -- the one
  // randInt draw) stay here, in step 4, exactly where they've always
  // been computed ("same number, same order of dice rolls" -- the
  // handoff's own words) -- but the HP write and kill resolution move
  // to applyAndReact (step 5), tagged via dmgInfo.kind === "mirrorSoul"
  // rather than this function doing them itself and shortCircuiting.
  // target.kind === "ally" never reaches this check (Mirror Soul only
  // ever answers a hit on the PLAYER), matching the original's own
  // structure exactly. action.isReaction never reaches it either --
  // every riposte formula is a flat physical counter (hardcoded
  // "physical" in its own formula), and Mirror Soul's reflection has
  // never triggered off one.
  if (!action.isReaction && target.kind === "player" && creature.element && hasEffect(state, "mirror_soul") && !combat.player.mirrorSoulUsed) {
    combat.player.mirrorSoulUsed = true;
    const matchup = elementMultiplier(null, creature.element, state.flags.isMage ? state.primaryElement : null);
    const base = randInt(creature.magic - 2, creature.magic + 2);
    const reflected = Math.max(0, Math.round(base * matchup));
    return { shortCircuit: false, edmg: reflected, kind: "mirrorSoul" };
  }
  // Step 1f-ii: everything else (both target kinds, the physical and
  // magic branches) now lives in the named formula table (js/data/
  // actions.js's PIPELINE_FORMULAS), resolved by NAME (action.formula) —
  // today's math only, moved verbatim, no new math.
  return PIPELINE_FORMULAS[action.formula](actor, target, action, ctx, hitInfo);
}

// ---- Step 5: apply and react ----
// dmgInfo: calculateDamage's { edmg, kind, elName? } for the non-short-
// circuit case. Everything here ran AFTER mitigateAndApplyHitOnPlayer in
// the original (so every mutation below reads the POST-mitigation edmg) —
// this is the only place state.health changes for this path.
function applyAndReact(actor, target, dmgInfo, ctx, action) {
  // Step 1f-iv §5: a DOT tick (action.isTick), same self-contained
  // actor-equals-target shape as calculateDamage's own guard above --
  // dispatched by TARGET kind (applyAndReactTick, below) to one of three
  // dedicated tails, each exactly what beginTurn/tickPlayerStatuses/
  // tickAllyStatuses's own inline "write the damage, maybe resolve a
  // kill/defeat" block already did for that kind.
  if (action.isTick) return applyAndReactTick(actor, target, dmgInfo, ctx, action);
  // Step 1f-iii §4: the PLAYER's own Riposte (maybeRiposte) landing on an
  // ENEMY -- its own dedicated tail (applyAndReactReactionOnEnemy, below),
  // NOT applyAndReactPlayerActor's body, which carries an UNCONDITIONAL
  // Siege Corps atk-charge consumption (gated on dmgInfo.isPhysical, not
  // on any action field a reaction could opt out of) plus Sure
  // Foundation re-granting and element-on-hit hooks -- none of which
  // maybeRiposte ever had.
  if (action.isReaction && actor.kind === "player" && target.kind === "enemy") return applyAndReactReactionOnEnemy(actor, target, dmgInfo, ctx, action);
  if (actor.kind === "ally" && target.kind === "enemy") return applyAndReactAllyActor(actor, target, dmgInfo, ctx, action);
  if (actor.kind === "player" && target.kind === "enemy") return applyAndReactPlayerActor(actor, target, dmgInfo, ctx, action);
  if (!(actor.kind === "enemy" && (target.kind === "player" || target.kind === "ally"))) {
    throw new Error(`applyAndReact(): "${actor.kind}" -> "${target.kind}" not migrated yet.`);
  }
  // Step 1f-iii §4: a reaction against the player (Riposte/Arena Riposte
  // for an enemy wearer) gets its OWN dedicated tail -- NOT the body
  // below, which carries real basic-attack-only side effects a reaction
  // never had (a Guarded Strike grant, Serrated Opening/Marked Target/
  // Duelist's Measure procs, Mercy of the Veil, the abilityCtx-driven
  // verb/inflict/healOnHitPct branches). See applyAndReactReactionOnPlayer's
  // own header for the full comparison against the original riposte
  // functions this replaces.
  if (action.isReaction && target.kind === "player") return applyAndReactReactionOnPlayer(actor, target, dmgInfo, ctx, action);
  // Same reasoning, for an enemy wearer's counter landing on an ALLY
  // (riposteCounterByEnemyOnAllyLegacy's own tail is just a flat 0 floor
  // + killAlly -- no ally protection interceptions, no Companion Ability
  // Engine mitigation, no Last Bastion retaliation chaining off of it,
  // none of which the ordinary ally-target body below skips).
  if (action.isReaction && target.kind === "ally") return applyAndReactReactionOnAlly(actor, target, dmgInfo, ctx, action);
  // Mirror Soul (step 1f-iii §4): calculateDamage tags its own reflected-
  // damage result this way instead of shortCircuiting -- the HP write
  // and kill resolution happen HERE (step 5), not in step 4, per the
  // handoff's own "removes the step-4 HP-write exception from 1b."
  if (dmgInfo.kind === "mirrorSoul") return applyAndReactMirrorSoul(actor, dmgInfo.edmg, ctx);
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
    if (COMBAT_UNIFY.U3a && edmg > 0 && !creature.markedTargetUsed && hasEffect(creature, "sang_cu_ie002_marked_target") && !combat.player.exposedTarget) {
      creature.markedTargetUsed = true;
      combat.player.exposedTarget = { by: creature };
    }
    if (edmg > 0 && hasEffect(creature, "sang_cu_ie007_duelists_measure") && (creature.duelistMeasureUsesThisCombat || 0) < 2) {
      creature.duelistMeasureUsesThisCombat = (creature.duelistMeasureUsesThisCombat || 0) + 1;
      creature.duelistMeasurePendingTarget = ally.name;
    }
    // Step 1f-iii §4: the generalized Ally Protection interceptions
    // (Legion's Memory/Brothers in Arms, then the plain Ally Protection
    // Reaction — order matters, see js/data/actions.js's own comment on
    // ON_INCOMING_DAMAGE_ALLY_HOOKS) now run by NAME, through that
    // declared list, instead of two calls hardcoded here. Companion
    // Ability Engine mitigation right after is its own separate, always-
    // on mechanic (not a reaction with a trigger/cap of its own), so it
    // stays a direct call — this path's equivalent of "shields and
    // temporary HP" (spec step 5), all ally-only mechanics with no
    // player-path counterpart.
    const protectionLines = [];
    for (const hookName of ON_INCOMING_DAMAGE_ALLY_HOOKS) {
      const result = PIPELINE_HOOKS[hookName]({ state, ally, edmg });
      edmg = result.dmg;
      protectionLines.push(...result.lines);
    }
    const mitigation = applyCompanionDamageTaken(ally, edmg);
    edmg = mitigation.dmg;
    const arenaFloor = combat && combat.isArenaFight && !combat.arenaLethal ? 1 : 0;
    ally.health = Math.max(arenaFloor, ally.health - edmg);
    const verb = abilityCtx ? `uses ${abilityCtx.name} on` : "strikes";
    const lines = [`${withThe(creature.name, true)} ${verb} ${ally.name} for ${edmg} damage.`, ...protectionLines, ...mitigation.lines, ...sangAllyLines];
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
    if (edmg > 0) combat.player.playerLastHitType = creature.element;
    const lines = [edmg > 0 ? `${withThe(creature.name, true)} answers with ${dmgInfo.elName} of its own, for ${edmg} damage.` : `Its ${dmgInfo.elName} washes over you harmlessly.`, ...absorbLines];
    if (state.health <= 0) {
      const defeatMsg = resolvePlayerDefeatOrDowned(state);
      if (defeatMsg) lines.push(defeatMsg);
    }
    return { lines, damage: edmg };
  }

  if (edmg > 0) combat.player.playerLastHitType = "physical";
  if (!abilityCtx && edmg > 0 && hasEffect(creature, "guarded_strike")) creature.guardedStrikeBonusDef = 2;
  const sangLines = [];
  if (edmg > 0 && !creature.serratedOpeningUsed && hasEffect(creature, "sang_cu_ie003_serrated_opening")) {
    creature.serratedOpeningUsed = true;
    if (!(combat.player.playerStatuses && combat.player.playerStatuses.bleed)) {
      sangLines.push(...applyAbilityInflict(state, { status: "bleed", chance: 1 }, creature.name));
    }
  }
  if (edmg > 0 && !creature.markedTargetUsed && hasEffect(creature, "sang_cu_ie002_marked_target") && !combat.player.exposedTarget) {
    creature.markedTargetUsed = true;
    combat.player.exposedTarget = { by: creature };
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
  const action = { atkSpread, extraDef, abilityCtx, basicFirstBonus, formula: (abilityCtx && abilityCtx.formula) || ENEMY_BASIC_ATTACK_DEF.formula };
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
  const action = { abilityCtx, basicFirstBonus, formula: (abilityCtx && abilityCtx.formula) || ENEMY_BASIC_ATTACK_DEF.formula };
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
// Step 1f-i: dispatches on action.formula (a declared string -- which
// damage formula this action uses), never on action.kit's own truthiness
// or any ally's identity. "allyPlain" is Kessa's shape today; any other
// formula name means a kit-bearing ally (Hadrian's basic swing or a
// named active) -- a FUTURE kit with its own different formula still
// reads this condition correctly without this function knowing which
// ally it is.
function rollToHitAllyActor(actor, target, action, ctx) {
  const state = ctx.state;
  const ally = actor.ref;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;

  // Step 1f-iii §4: a reaction declaring toHit:"none" always lands --
  // e.g. Last Bastion's retaliation (resolveCompanionRetaliation), which
  // never rolled a to-hit check in maybeCompanionRetaliateLegacy either.
  // No existing caller declares this field, so it's a pure addition —
  // zero effect on any normal ally attack.
  if (action.toHit === "none") return { hit: true };

  if (action.formula !== "allyPlain") {
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

// Step 1f-i: reads only action.formula (dispatched by NAME through
// PIPELINE_FORMULAS, js/data/actions.js) and action.hooks.onDamage
// (dispatched by NAME through PIPELINE_HOOKS) -- never action.kit's own
// truthiness, never a named-ally helper called directly. U3e/U3f's own
// peek-banked-Defense/Smuggler's-Guard-mitigation logic stays inline
// here since it's generic across EVERY kit-bearing ally (not Hadrian-
// specific), read by both kitAllyBasic/kitAllyAbility formulas via their
// own copy -- see js/data/actions.js's own header on why it's duplicated
// there rather than factored out further.
function calculateDamageAllyActor(actor, target, action, ctx, hitInfo) {
  const core = PIPELINE_FORMULAS[action.formula](actor, target, action, ctx, hitInfo);
  let edmg = core.edmg;
  for (const hookName of (action.hooks && action.hooks.onDamage) || []) {
    edmg = PIPELINE_HOOKS[hookName]({ state: ctx.state, actor, target, ally: actor.ref, creature: target.store.creatureObj, edmg, action, ctx });
  }
  return Object.assign({ shortCircuit: false, edmg, kind: "ally" }, core.extra);
}

// Step 1f-i: dispatches on action.formula, never action.kit's own
// truthiness. onHadrianKill is reached only through action.hooks.onKill
// (declared on the kit's own data) -- not called by name here.
function applyAndReactAllyActor(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const ally = actor.ref;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  let edmg = dmgInfo.edmg;

  if (action.formula !== "allyPlain") {
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
    // Step 1f-iii §4: a reaction declares its own flavorLine (a function,
    // same declared-field convention as Hadrian's own actives already
    // use) when neither of the two existing lines fits -- e.g. Last
    // Bastion's retaliation ("answers the blow..."), distinct from both
    // "lands <ability> on" and "strikes". No existing caller declares
    // this field, so it's a pure addition.
    const lines = action.flavorLine
      ? [action.flavorLine(ally, creature, edmg)]
      : action.ability
        ? [`${ally.name} lands ${action.ability.name} on ${withThe(creature.name, false)} for ${edmg} damage.`]
        : [`${ally.name} strikes ${withThe(creature.name, false)} for ${edmg} damage.`];
    let killed = false;
    if (enemySlot.hp <= 0 && enemySlot.alive) {
      lines.push(...killEnemyAsAlly(state, enemySlot));
      killed = true;
    }
    const runOnKillHooks = () => {
      for (const hookName of (action.hooks && action.hooks.onKill) || []) {
        PIPELINE_HOOKS[hookName]({ state, actor, target, ally, creature, action });
      }
    };
    if (!action.ability) {
      // basicCompanionAttackLegacy: the on-kill hook fires right away,
      // no splash to wait on.
      if (killed) runOnKillHooks();
      return { lines, damage: null };
    }
    // Crushing Blow/Groundbreaker: the on-kill hook fires once, AFTER
    // splash — resolveHadrianActiveDamage's caller (useHadrianActive)
    // collects "killed" across primary + splash and fires it there, not
    // here, same as the original's single killedAny flag. (useHadrianActive
    // itself still calls onHadrianKill directly today — see that
    // function's own comment on why splash isn't a second pipeline step.)
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
  const action = { kit: null, ability: null, formula: "allyPlain" };
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
  const action = { kit, ability: null, veteranPct: veteranBonusPct(ally, kit), formula: kit.action.formula, hooks: kit.action.hooks };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: one of Hadrian's direct-damage Actives (Crushing
// Blow/Groundbreaker). Called from useHadrianActive (companion.js) after
// its own hit-roll-independent setup (cooldowns, taunts, self-buffs —
// none of which reach here). `enemies` is the same already-alive-
// filtered list useHadrianActive's own caller built (resolveCompanionAction) —
// threaded through as ctx.allEnemies so chooseTargets (step 2) can pick
// Groundbreaker's splash targets from it.
//
// Step 1g-ii §2a: splash used to be useHadrianActive's own private loop,
// writing enemy HP directly outside applyAndReact entirely. Now
// chooseTargets returns [primary, ...splash] for a packSplash action
// (ability.targeting === "packSplash", Groundbreaker only today), the
// PRIMARY alone gets a real hit roll (step 3) exactly as before, and
// every splash target reuses that hit's own baseAtk/splashAtkMult with
// NO hit roll of its own — same as always — but now runs through steps
// 4-5 (calculateDamage/applyAndReact) like any other hit, instead of a
// direct `e.hp -=`. Same damage number, same dice-roll order (none extra
// for splash, matching before), same kill order (loop order unchanged).
function resolveHadrianActiveDamage(state, ally, kit, ability, targetSlot, veteranPct, ascended, enemies) {
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, targetSlot, state.combat.enemies.indexOf(targetSlot));
  const action = { kit, ability, veteranPct, ascended, formula: "kitAllyAbility", hooks: kit.action.hooks, targeting: ability.targeting };
  const ctx = { state, pendingAction: action, target, allEnemies: enemies };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return { lines: hitInfo.result.lines, hit: false };

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  const lines = [...result.lines];
  let killedAny = !!result.killedPrimary;
  for (const splashTarget of targets.slice(1)) {
    const splashAction = {
      kit, ability, baseAtk: result.baseAtk, splashAtkMult: result.splashAtkMult,
      formula: "kitAllyAbilitySplash", hooks: kit.action.hooks,
      flavorLine: (a, creature, edmg) => `The blow's shockwave catches ${withThe(creature.name, false)} for ${edmg} damage.`,
    };
    const splashDmgInfo = calculateDamage(actor, splashTarget, splashAction, ctx, null);
    // useHadrianActiveLegacy's own order, preserved exactly: the accuracy
    // debuff on a splash target is unconditional, applied BEFORE this
    // target's own hp<=0 kill check -- never gated on whether this hit is
    // about to kill it (unlike the PRIMARY's debuff, still gated on
    // survival below, in useHadrianActive itself). Doing it here, between
    // steps 4 and 5, keeps that ordering: applyAndReact (step 5) is what
    // may resolve the kill and, if this is the last enemy standing, end
    // the fight (state.combat -> null) -- which must happen AFTER, not
    // before, this debuff write.
    if (ability.accuracyDebuff) applyGroundbreakerAccuracyDebuff(state, splashTarget.store, ability.accuracyDebuff, ability.accuracyDebuffTurns);
    const splashResult = applyAndReact(actor, splashTarget, splashDmgInfo, ctx, splashAction);
    lines.push(...splashResult.lines);
    if (splashResult.killedPrimary) killedAny = true;
  }
  return { lines, hit: true, killedAny, baseAtk: result.baseAtk, splashAtkMult: result.splashAtkMult };
}

// ---- Orchestrator: Last Bastion's automatic retaliation (step 1f-iii
// §4) -- a kit-bearing ally striking back at whichever enemy just hit
// it, every time (no to-hit roll, action.toHit: "none", matching
// maybeCompanionRetaliateLegacy's own unconditional math exactly),
// through steps 2-5 with the target fixed to the attacker. Called from
// companion.js's own maybeCompanionRetaliate, which keeps "is this ally
// even eligible" and the attacker-to-enemy-slot lookup outside the
// pipeline -- the same shape every other ally orchestrator's own
// target/eligibility resolution already has (resolveCompanionAction's
// own AI tree, pickHadrianTarget, ...). `kit` is passed through on the
// action object as plain data (read by hadrianOnKill's own hook, never
// branched on) -- the same already-disclosed exception 1f-i's own
// applyAndReactAllyActor comment covers.
function resolveCompanionRetaliation(state, ally, kit, enemyIdx) {
  const record = state.combat.enemies[enemyIdx];
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, record, enemyIdx);
  const action = {
    kit, formula: "allyRetaliate", hooks: kit.action.hooks, veteranPct: veteranBonusPct(ally, kit),
    toHit: "none", isReaction: true,
    flavorLine: (a, c, edmg) => `${a.name} answers the blow, retaliating against ${withThe(c.name, false)} for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines; // dead code today (toHit: "none" always hits) -- kept for the same defensive-shape reason chooseAction's own null-return is.

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: Riposte, generalized for an ally wearer (step 1f-iii
// §4) -- a free 0.5x follow-up when the enemy that just attacked this
// ally missed, through steps 2-5 with the target fixed to the attacker.
// No to-hit roll (action.toHit: "none", matching riposteCounterByAlly
// OnEnemyLegacy's own unconditional math exactly). Called from combat.js's
// own riposteCounterByAllyOnEnemy, which keeps "does this ally even
// have Riposte, is it capped" eligibility outside the pipeline.
function resolveRiposteCounterByAllyOnEnemy(state, ally, enemySlot) {
  const idx = state.combat.enemies.indexOf(enemySlot);
  const actor = makeAllyCombatant(ally);
  const target = makeEnemyCombatant(state, enemySlot, idx);
  const action = {
    formula: "riposteCounterAlly",
    toHit: "none", isReaction: true,
    flavorLine: (a, c, edmg) => `${a.name} seizes the opening — a free riposte on ${withThe(c.name, false)} for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines; // dead code today (toHit: "none" always hits).

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Step 5, reaction tail: an enemy wearer's counter-attack landing
// on the PLAYER (Riposte/Arena Riposte, step 1f-iii §4). A dedicated
// function, not a few extra gates threaded into the body above, because
// that body carries real basic-attack-only side effects neither
// riposteCounterOnPlayerLegacy nor the original arenaRiposteCounterOnPlayer
// ever had: a Guarded Strike grant, Serrated Opening/Marked Target/
// Duelist's Measure procs, Mercy of the Veil, and the abilityCtx-driven
// verb/inflict/healOnHitPct branches. This tail is exactly those two
// originals' own shared remainder: mitigate, set playerLastHitType,
// build the one flavor line, check for defeat/downed -- nothing else.
function applyAndReactReactionOnPlayer(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const creature = actor.ref.creatureObj;
  const hitResult = mitigateAndApplyHitOnPlayer(state, dmgInfo.edmg, dmgInfo.kind);
  const edmg = hitResult.edmg;
  if (edmg > 0) state.combat.player.playerLastHitType = "physical"; // Injury System v0.2
  const lines = [action.flavorLine(creature, edmg), ...hitResult.absorbLines];
  if (state.health <= 0) {
    const defeatMsg = resolvePlayerDefeatOrDowned(state);
    if (defeatMsg) lines.push(defeatMsg);
  }
  return { lines, damage: edmg };
}

// ---- Step 5, reaction tail: an enemy wearer's counter-attack landing
// on an ALLY (riposteCounterByEnemyOnAlly, step 1f-iii §4). Dedicated,
// same reasoning as applyAndReactReactionOnPlayer just above --
// riposteCounterByEnemyOnAllyLegacy's own tail is a flat 0-floor
// subtraction + killAlly, nothing else: no ally protection
// interceptions, no Companion Ability Engine mitigation, no Last
// Bastion retaliation chaining off of it, all of which the ordinary
// ally-target body below has.
function applyAndReactReactionOnAlly(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const creature = actor.ref.creatureObj;
  const ally = target.ref;
  const edmg = dmgInfo.edmg;
  ally.health = Math.max(0, ally.health - edmg);
  const lines = [action.flavorLine(creature, ally, edmg)];
  if (ally.health <= 0) lines.push(...killAlly(state, ally));
  return { lines, damage: null };
}

// ---- Step 5, reaction tail: the PLAYER's own Riposte (maybeRiposte)
// landing on an ENEMY (step 1f-iii §4). The original's own tail, moved
// verbatim: write the damage, plain resolveKill if it's lethal -- no
// activeIndex dance (unlike a DOT tick, maybeRiposte's own `creature`
// argument is always whichever enemy is currently active, by
// construction of every one of its call sites, so there's never a
// "redirect back" to do).
// action.deferKillCheck (Spell Echo, found while scoping audit rule
// P1): useElementAbility is "the one player action shape where
// applyAndReact does not resolve the kill itself" (applyAndReactPlayerActor's
// own header) -- its own unconditional `if (state.combat.hp <= 0)`
// check, AFTER both the main cast and a possible echo, is the single
// place that covers either hit killing the creature. A reaction that
// resolved its own kill here too would call resolveKill a second time
// for the same death.
function applyAndReactReactionOnEnemy(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = target.ref.creatureObj;
  const edmg = dmgInfo.edmg;
  enemySlot.hp -= edmg;
  enemySlot.lastDamageType = dmgInfo.kind;
  const lines = [action.flavorLine(creature, edmg)];
  if (action.deferKillCheck) return { lines };
  if (enemySlot.hp <= 0 && enemySlot.alive) lines.push(...resolveKill(state, creature));
  return { lines };
}

// ---- Step 5, reaction tail: Mirror Soul's own reflection (step 1f-iii
// §4). calculateDamage already computed `reflected` (the one randInt
// draw, same order as before); this is exactly what used to run inline
// there under `shortCircuit: true`, just moved to step 5 so the HP
// write/kill resolution happens in the one place this pipeline makes
// that change, same as every other reaction.
function applyAndReactMirrorSoul(actor, reflected, ctx) {
  const state = ctx.state;
  const creature = actor.ref.creatureObj;
  if (reflected > 0) {
    // Mirror Soul's own HP write and kill resolution target the
    // ATTACKER (actor), not the player this pipeline call is otherwise
    // resolving for -- actor.store is this creature's own slot, so
    // writing through it is correct regardless of which enemy is
    // "active" right now.
    actor.store.hp -= reflected;
    actor.store.lastDamageType = creature.element;
    const lines = [`Mirror Soul turns ${withThe(creature.name, false)}'s spell back on it, for ${reflected} damage.`];
    if (actor.store.hp <= 0) lines.push(...resolveKill(state, creature));
    return { lines, damage: 0 };
  }
  return { lines: [`Mirror Soul readies itself, but there's nothing in the spell worth turning aside.`], damage: 0 };
}

// ---- Step 5, DOT tick dispatcher (step 1f-iv §5) -- a tick's actor and
// target are the same combatant (see calculateDamage's own isTick guard
// above), so the only real choice left is which kind of combatant is
// taking it; each tail below is exactly what that kind's own inline
// "write the damage, maybe resolve a kill/defeat" block already did.
function applyAndReactTick(actor, target, dmgInfo, ctx, action) {
  if (target.kind === "enemy") return applyAndReactTickOnEnemy(actor, target, dmgInfo, ctx, action);
  if (target.kind === "player") return applyAndReactTickOnPlayer(actor, target, dmgInfo, ctx, action);
  if (target.kind === "ally") return applyAndReactTickOnAlly(actor, target, dmgInfo, ctx, action);
  throw new Error(`applyAndReactTick(): target kind "${target.kind}" not supported.`);
}

// Moved verbatim out of beginTurn's own enemy burn/bleed blocks: write
// the damage, and if it drops this enemy's HP to 0 or below, resolve
// the kill with the exact same combat.activeIndex redirect those blocks
// already did (become the dying enemy so resolveKill's own flavor/loot
// resolves for the right creature, then redirect back to whichever
// enemy the player is actually fighting if a DIFFERENT one just died).
// `killed`/`comboEnded` let the caller replicate its own `continue` (burn
// only) and early `return lines` (both) exactly, since those live in
// beginTurn's loop, not here.
function applyAndReactTickOnEnemy(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const combat = state.combat;
  const enemySlot = target.store;
  const creature = target.ref.creatureObj;
  const i = target.index;
  const edmg = dmgInfo.edmg;
  enemySlot.hp -= edmg;
  enemySlot.lastDamageType = dmgInfo.kind;
  const lines = [action.flavorLine(creature, edmg)];
  let killed = false, comboEnded = false;
  if (enemySlot.hp <= 0 && enemySlot.alive) {
    combat.activeIndex = i;
    lines.push(...resolveKill(state, creature));
    killed = true;
    if (!state.combat) return { lines, killed, comboEnded: true };
    if (i !== action.playerTargetIndex && combat.enemies[action.playerTargetIndex] && combat.enemies[action.playerTargetIndex].alive) {
      combat.activeIndex = action.playerTargetIndex;
    }
  }
  return { lines, killed, comboEnded };
}

// Moved verbatim out of tickPlayerStatuses's own "if (dmg > 0)" block --
// applyPlayerDamage (not the full mitigateAndApplyHitOnPlayer pipeline a
// reaction uses: a status tick was never mitigated by Shield Wall/etc.,
// and never showed Temporary Health absorb lines either, both preserved
// here exactly), then the same resolvePlayerDefeatOrDowned call and
// dungeon-rescue-ends-combat check the original made.
function applyAndReactTickOnPlayer(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const combat = state.combat;
  const edmg = dmgInfo.edmg;
  applyPlayerDamage(state, edmg);
  combat.player.playerLastHitType = dmgInfo.kind;
  const lines = [action.flavorLine(edmg)];
  let comboEnded = false;
  if (state.health <= 0) {
    const dotDefeatMsg = resolvePlayerDefeatOrDowned(state);
    if (dotDefeatMsg) lines.push(dotDefeatMsg);
    if (!state.combat) comboEnded = true;
  }
  return { lines, comboEnded };
}

// Moved verbatim out of tickAllyStatuses's own "if (dmg > 0)" block --
// the same arena non-lethal floor a direct hit on an ally already
// respects, then killAlly if this tick was the kill.
function applyAndReactTickOnAlly(actor, target, dmgInfo, ctx, action) {
  const state = ctx.state;
  const ally = target.ref;
  const edmg = dmgInfo.edmg;
  const arenaFloor = state.combat && state.combat.isArenaFight && !state.combat.arenaLethal ? 1 : 0;
  ally.health = Math.max(arenaFloor, ally.health - edmg);
  const lines = [action.flavorLine(ally.name, edmg)];
  if (ally.health <= 0) lines.push(...killAlly(state, ally));
  return { lines };
}

// ---- Orchestrators: DOT ticks (step 1f-iv §5) -- "through steps 4-5"
// only, per the handoff's own wording: no chooseAction/chooseTargets/
// rollToHit call, since a tick is never chosen and never rolls to hit
// (toHit: "none" is this action's declared shape, for the same reason
// every other reaction declares one, even though nothing here actually
// calls rollToHit to read it). Each orchestrator's own caller
// (beginTurn/tickPlayerStatuses/tickAllyStatuses) keeps owning whether
// the tick runs at all, decrementing turnsLeft, and deleting an expired
// status -- exactly where those already lived.
function resolveEnemyDotTick(state, enemySlot, index, formula, flavorLine, playerTargetIndex, rawDmg) {
  const combatant = makeEnemyCombatant(state, enemySlot, index);
  const action = { isTick: true, toHit: "none", formula, flavorLine, playerTargetIndex, rawDmg };
  const ctx = { state };
  const dmgInfo = calculateDamage(combatant, combatant, action, ctx, null);
  return applyAndReact(combatant, combatant, dmgInfo, ctx, action);
}

function resolvePlayerDotTick(state, key, rawDmg, entryName) {
  const combatant = makePlayerCombatant(state);
  const action = { isTick: true, toHit: "none", formula: "tickStatusPlayer", key, rawDmg, flavorLine: (edmg) => `${entryName} saps ${edmg} health.` };
  const ctx = { state };
  const dmgInfo = calculateDamage(combatant, combatant, action, ctx, null);
  if (dmgInfo.edmg <= 0) return { lines: [], comboEnded: false };
  return applyAndReact(combatant, combatant, dmgInfo, ctx, action);
}

function resolveAllyDotTick(state, ally, key, rawDmg, entryName) {
  const combatant = makeAllyCombatant(ally);
  const action = { isTick: true, toHit: "none", formula: "tickStatusAlly", key, rawDmg, flavorLine: (allyName, edmg) => `${entryName} saps ${allyName}'s health for ${edmg}.` };
  const ctx = { state };
  const dmgInfo = calculateDamage(combatant, combatant, action, ctx, null);
  if (dmgInfo.edmg <= 0) return { lines: [] };
  return applyAndReact(combatant, combatant, dmgInfo, ctx, action);
}

// ---- Orchestrator: the PLAYER's own Riposte, landing on an ENEMY (step
// 1f-iii §4, completed after 1f-iv) -- a free riposteMultiplier-scaled
// (0.5x base, 0.75x White Watch 4pc, x1.5 Clash of Steel) follow-up
// whenever the ENEMY's own retaliation this round dealt zero damage.
// rollToHitPlayerActor is reused AS-IS here, through the top-level
// rollToHit dispatch -- its entire body is the one accuracy-vs-agility
// check maybeRiposteLegacy (the original, before this migration) always
// made, with no extra baggage to leak, unlike calculateDamagePlayerActor/
// applyAndReactPlayerActor (see calculateDamage/applyAndReact's own
// isReaction guards for actor.kind === "player" for why those two get
// a dedicated formula/tail instead). Called from combat.js's own
// maybeRiposte, which keeps "does the player even have Riposte, is the
// target already dead" eligibility outside the pipeline.
function resolveRiposteCounterPlayer(state, creature) {
  const actor = makePlayerCombatant(state);
  const target = findEnemyCombatant(state, creature);
  const action = {
    formula: "riposteCounterPlayer",
    toHit: "roll", isReaction: true,
    missLine: (state, creature) => [`You seize the opening, but the riposte doesn't land.`],
    flavorLine: (creature, edmg) => `You seize the opening — a free riposte for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: Spell Echo, landing on an ENEMY (found while
// scoping audit rule P1) -- a 0.2x/0.4x chance for a second casting at
// half the first casting's own already-mitigated damage, through steps
// 4-5 only (toHit: "none", via rollToHit's own isReaction/toHit==="none"
// guard, so no real accuracy check -- the original never had one).
// deferKillCheck: true, since useElementAbility's own unconditional
// "if (state.combat.hp <= 0)" check (right after this call, same as
// before) is still the one place that resolves either hit's kill --
// see applyAndReactReactionOnEnemy's own header for why. Called from
// useElementAbility, which keeps its own gate (hasEffect/chance roll)
// outside the pipeline.
function resolveSpellEchoOnEnemy(state, creature, castDamageDealt, elementKey) {
  const actor = makePlayerCombatant(state);
  const target = findEnemyCombatant(state, creature);
  const action = {
    formula: "spellEchoReaction",
    toHit: "none", isReaction: true, deferKillCheck: true,
    castDamageDealt, elementKey,
    flavorLine: (creature, edmg) => `The spell echoes — a second casting lands for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines; // dead code: toHit "none" always hits

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: Riposte, generalized for an enemy wearer (step
// 1f-iii §4) -- a free 0.5x follow-up when the PLAYER's own attack
// misses, through steps 2-5 with the target fixed to the player. A
// bare acc-vs-agility roll (action.toHit: "simple", added to rollToHit
// specifically for this -- no extra accuracy bonuses, no evasion/
// Guardian Spirit/Timeless Guard, matching riposteCounterOnPlayerLegacy's
// own check exactly). Called from combat.js's own riposteCounterOnPlayer,
// which keeps "does this creature even have Riposte, is it capped"
// eligibility outside the pipeline.
function resolveRiposteCounterOnPlayer(state, creature) {
  const actor = findEnemyCombatant(state, creature);
  const target = makePlayerCombatant(state);
  const action = {
    formula: "riposteCounterEnemy",
    toHit: "simple", isReaction: true,
    missLine: (c) => `${withThe(c.name, true)} seizes the opening, but the riposte doesn't land.`,
    flavorLine: (c, edmg) => `${withThe(c.name, true)} seizes the opening — a free riposte for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines;

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: Arena Riposte, for an enemy wearer with the
// counterOnSuccessfulHit passive (step 1f-iii §4) -- a counter-strike at
// the ability's own declared multiplier (default 0.8x) when the PLAYER's
// attack LANDS, through steps 2-5, target fixed to the player. No to-hit
// roll (action.toHit: "none", matching arenaRiposteCounterOnPlayerLegacy's
// own unconditional math). Called from combat.js's own
// arenaRiposteCounterOnPlayer, which keeps the passive lookup and its own
// cooldown/cap bookkeeping outside the pipeline.
function resolveArenaRiposteCounterOnPlayer(state, creature, mult) {
  const actor = findEnemyCombatant(state, creature);
  const target = makePlayerCombatant(state);
  const action = {
    formula: "arenaRiposteEnemy", mult,
    toHit: "none", isReaction: true,
    flavorLine: (c, edmg) => `${withThe(c.name, true)} turns the blow aside and answers with a counter for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines; // dead code today (toHit: "none" always hits).

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
}

// ---- Orchestrator: Riposte, generalized for an enemy wearer whose own
// retaliation the ALLY'S attack just missed (step 1f-iii §4) -- a free
// 0.5x follow-up against that ally, through steps 2-5, target fixed to
// the ally. No to-hit roll (action.toHit: "none", matching
// riposteCounterByEnemyOnAllyLegacy's own unconditional math). Called
// from combat.js's own riposteCounterByEnemyOnAlly, which keeps "does
// this enemy even have Riposte, is it capped" eligibility outside the
// pipeline.
function resolveRiposteCounterByEnemyOnAlly(state, enemySlot, ally) {
  const idx = state.combat.enemies.indexOf(enemySlot);
  const actor = makeEnemyCombatant(state, enemySlot, idx);
  const target = makeAllyCombatant(ally);
  const action = {
    formula: "riposteCounterEnemyOnAlly",
    toHit: "none", isReaction: true,
    flavorLine: (creature, a, edmg) => `${withThe(creature.name, true)} seizes the opening — a free riposte on ${a.name} for ${edmg} damage.`,
  };
  const ctx = { state, pendingAction: action, target };

  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) return hitInfo.result.lines; // dead code today (toHit: "none" always hits).

  const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
  const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
  return result.lines;
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
// Step 1e-ii (handoff §2's tactics row): Decoy/Ambush/Disarm share the
// SAME accuracy formula as the basic attack (attackConnects against
// effectivePlayerAccuracy/creature.agi, no action-specific modifier) --
// only the miss LINE differs per action, and only the basic attack's
// own miss provokes riposteCounterOnPlayer. Decoy/Ambush/Disarm never
// did (useDecoyLegacy/useAmbushLegacy/useDisarmLegacy's own miss
// branches never call it), preserved exactly, not "completed."
// Step 1e completion handoff (9 Nov 2026 follow-up): reads only the
// action definition's own declared `missLine` function -- never
// action.id. Every attack-shaped player action (basic_attack, the four
// Tactics, the seven pipelined elements) declares its own missLine in
// js/data/actions.js or js/data/tactics.js/elementabilities.js's own
// `action` block. missProvokesRiposte is true for basic_attack only (the
// only action whose miss line includes riposteCounterOnPlayer -- none of
// the others ever called it, confirmed by reading each Legacy function).
function rollToHitPlayerActor(actor, target, action, ctx) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  if (!attackConnects(effectivePlayerAccuracy(state), creature.agi)) {
    const lines = action.missLine(state, creature);
    return { hit: false, result: { lines, damage: null } };
  }
  return { hit: true };
}

// Step 1e-ii: Decoy/Ambush/Disarm share this EXACT core formula with the
// basic attack (rollPlayerDamage's own body, unchanged in substance,
// with the same two stat()-purity peek/defer splits from 1e-i) -- only
// each action's own POST-processing (below the core) and how it's
// reported externally differ, matching useDecoyLegacy/useAmbushLegacy/
// useDisarmLegacy exactly:
//   - None of the three ever pick a specific element the way the basic
//     attack does (pickElement, in playerAttack's own orchestrator) --
//     useDecoyLegacy/useAmbushLegacy/useDisarmLegacy all call
//     rollPlayerDamage(state, creature) with NO third argument, so
//     activeElement is always undefined for them, even for a mage.
//     (The internal isSpell branch still runs for a mage regardless --
//     that's state.flags.isMage/state.primaryElement, not activeElement
//     -- just with an undefined element fed into elementMultiplier,
//     exactly as before.)
//   - All three always report "physical" for lastDamageType/the
//     on-hit-effects gate, regardless of whether THIS hit's own
//     internal formula took the physical or the spell branch --
//     useDecoyLegacy/useAmbushLegacy/useDisarmLegacy hardcode
//     "physical" and call applyPhysicalOnHitEffects unconditionally,
//     unlike the basic attack's own isPhysical-gated versions of both.
//     A real, pre-existing asymmetry for a mage using a tactic,
//     preserved exactly, not "completed" to match the basic attack.
//   - Only the basic attack's own post-processing (applyOpeningReach,
//     Borrowed Seconds, Feint) applies; each tactic has its own, from
//     its own ORIGINAL code, applied in the same order: Decoy wraps the
//     core result in applyOpeningReach unconditionally (no isPhysical
//     gate — another instance of the same asymmetry above, since
//     applyOpeningReach's own state.combat.player.firstPhysicalAttackDone flag
//     gets consumed here regardless of branch); Ambush multiplies by
//     ambushMultiplier then Borrowed Seconds's flat +15% (no cooldown
//     to refund); Disarm multiplies by a flat 0.7 then applies Opening
//     Reach, same unconditional gate as Decoy.
// Siege Corps purity (isPhysical, internal) and the Sure Foundation
// peek/defer gate below are UNAFFECTED by any of this — they track the
// core formula's own true internal branch for all four actions, exactly
// as rollPlayerDamage's single shared implementation always has.
// The shared core formula (rollPlayerDamage's own body, combat.js),
// factored out so step 1e-iii's Lightning branch can run it TWICE,
// independently -- the original calls rollPlayerDamage(state, creature,
// "lightning") twice in a row (its own crit roll, its own
// Avatar-of-Creation stack bump, everything), not once with the result
// doubled. Every other action calls this exactly once. See
// calculateDamagePlayerActor's own header for the two stat()-purity
// peek/defer splits (banked Defense, the player's own Attack via
// stat()) that make this differ from rollPlayerDamage itself.
// `action` (added for Damage Types v2, step 2b): the ORIGINAL action
// object, used only to resolve a damageType when DAMAGE_TYPES_V2 is on —
// every existing caller either already had it (calculateDamagePlayerActor)
// or is updated to pass it through (lightningOnHit's second roll).
// Optional and unused when the switch is off, so a caller that still
// omits it (PIPELINE_FORMULAS.playerCore's own wrapper, never actually
// invoked for a real player attack — see calculateDamage's own dispatch
// order, which always routes actor.kind==="player" to
// calculateDamagePlayerActor directly) changes nothing.
function rollPlayerDamageCoreForPipeline(actor, target, ctx, activeElement, action) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;

  const defPenalty = (state.combat && activeEnemySlot(state.combat).enemyDefPenalty) || 0;
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
  const threadsMult = state.combat && state.combat.player.threadsOfConsequencePending ? 1.4 : 1;
  const stonesPatienceMult = state.combat && state.combat.enemyActedFirstThisRound && hasEffect(state, "stones_patience") ? 1.3 : 1;
  const worthyMult = worthyChallengeMultiplier(state);
  const valorMult = blessingOfValorMultiplier(state);
  const commandingDefMult = commandingPresenceDefMultiplier(state);
  const loadedDiceMult = loadedDiceMultiplier(state);
  const chaosMult = avatarOfChaosDamageMultiplier(state);
  const momentumUnboundMult = momentumUnboundMultiplier(state);
  const temperedSteelMult = temperedSteelMultiplier(state);
  const avatarOfTimeMult = state.combat && state.combat.player.avatarOfTimeTurns > 0 ? 1.25 : 1;
  let dmg;
  if (isSpell) {
    const magic = effectiveMagic(state);
    let base = randInt(magic - 2, magic + 2);
    if (hasEffect(state, "arcane_convergence")) base = Math.max(base, randInt(magic - 2, magic + 2));
    const multiplier = 1 + magic / 60;
    const matchup = avatarOfKnowledgeMatchupOverride(state, elementMultiplier(state, activeElement, creature.element));
    const effDef = Math.max(0, stat(state, target, "def") + bankedDefBonus - defPenalty) * foreseenDefMult * commandingDefMult * precisionFormulaMultiplier(state);
    // Damage Types v2 (off by default, spec §3 steps 2-3): resist-by-
    // family defense value in place of the flat effDef above, then the
    // enemy's own tag multiplier on the final number below.
    const spellDType = DAMAGE_TYPES_V2 ? resolveDamageType(action, equipmentWeaponDamageType(state), null) : null;
    const spellMitigateDef = DAMAGE_TYPES_V2 ? resistingDefenseValue(spellDType, effDef, creature.magic) : effDef;
    const overflowMult = arcaneOverflowMultiplier(state);
    const spellPower = base * multiplier;
    const preMitigation = Math.round(mitigate(spellPower, spellMitigateDef) * matchup * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * overflowMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * avatarOfTimeMult * stonesPatienceMult);
    dmg = Math.max(1, Math.round(preMitigation * (1 - (creature.dmgReduction || 0)) * sangMit));
    if (DAMAGE_TYPES_V2) dmg = Math.round(dmg * dmgTagMultiplier(creature, spellDType));
    if (state.combat.player.avatarOfCreationTurns > 0) {
      state.combat.player.avatarOfCreationMagicStacks = (state.combat.player.avatarOfCreationMagicStacks || 0) + 2;
    }
  } else {
    const armorCrack = armorCrackAmount(state);
    const effDef = Math.max(0, stat(state, target, "def") + bankedDefBonus + sureFoundationDef - defPenalty - armorCrack) * foreseenDefMult * commandingDefMult;
    // Damage Types v2 (off by default) — see the spell branch's own
    // comment, above, for the full reasoning. A basic/weapon attack's
    // damageType falls back to the player's own mainhand weapon (resolved
    // before any action-declared type, per resolveDamageType's priority).
    const weaponDType = DAMAGE_TYPES_V2 ? resolveDamageType(action, equipmentWeaponDamageType(state), null) : null;
    const weaponMitigateDef = DAMAGE_TYPES_V2 ? resistingDefenseValue(weaponDType, effDef, creature.magic) : effDef;
    // atk: peeked via stat() (pure) -- see this section's header on the
    // Siege Corps purity fix. Produces the identical number as
    // effectivePlayerAtk would have on this same single read.
    const atk = stat(state, actor, "atk");
    const crushBase = crushingImpactMultiplier(state);
    const crushMult = hasEffect(state, "crushing_impact") && effDef > atk ? crushBase : 1;
    const craftsmanMult = hasEffect(state, "master_craftsman") ? masterCraftsmanMultiplier(atk, creature) : 1;
    const base = mitigate(randInt(Math.max(1, atk - 2), atk + 2), weaponMitigateDef);
    state.combat.player.weaponAttackCounter = (state.combat.player.weaponAttackCounter || 0) + 1;
    const echoingArsenalMult = hasEffect(state, "echoing_arsenal") && state.combat.player.weaponAttackCounter % 5 === 0 ? 2 : 1;
    dmg = Math.max(1, Math.round(base * crushMult * execMult * dragonMult * bleedMult * kingMult * instinctMult * momentumMult * executionMult * echoMult * echoingArsenalMult * critMult * threadsMult * worthyMult * valorMult * loadedDiceMult * chaosMult * momentumUnboundMult * temperedSteelMult * craftsmanMult * avatarOfTimeMult * stonesPatienceMult * (1 - (creature.dmgReduction || 0)) * sangMit));
    if (DAMAGE_TYPES_V2) dmg = Math.round(dmg * dmgTagMultiplier(creature, weaponDType));
    if (state.combat.player.avatarOfCreationTurns > 0) {
      state.combat.player.avatarOfCreationAtkStacks = (state.combat.player.avatarOfCreationAtkStacks || 0) + 2;
    }
  }
  if (hasEffect(state, "tempered_steel")) {
    state.combat.player.temperedSteelStacks = Math.min(15, (state.combat.player.temperedSteelStacks || 0) + 1);
  }
  state.combat.player.threadsOfConsequencePending = false;
  state.combat.enemyActedFirstThisRound = false;
  if (hasEffect(state, "momentum")) {
    state.combat.player.momentumStacks = Math.min(5, (state.combat.player.momentumStacks || 0) + 1);
  }
  if (hasEffect(state, "worthy_challenge")) {
    state.combat.player.worthyChallengeStacks = Math.min(10, (state.combat.player.worthyChallengeStacks || 0) + 1);
  }
  if (critMult > 1) {
    if (hasSetTier(state, "Regalia of the Laughing Gale", 2)) {
      state.combat.player.blessingOfFortuneCritStacks = Math.min(5, (state.combat.player.blessingOfFortuneCritStacks || 0) + 1);
    }
    if (state.combat.player.avatarOfChaosTurns > 0) {
      const statName = ["Atk", "Def", "Magic", "Knowledge"][Math.floor(Math.random() * 4)];
      const field = "avatarOfChaos" + statName + "Bonus";
      state.combat.player[field] = Math.min(30, (state.combat.player[field] || 0) + 10);
    }
  }
  if (state.combat && state.combat.player.avatarOfWarTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.1));
  }
  if (hasEffect(state, "soul_leech") && state.health < state.maxHealth) {
    const leechPct = masterOfArmsDoubles(state, "soul_leech") ? 0.2 : 0.1;
    const leech = Math.round(dmg * leechPct);
    applyHeal(state, leech);
  }
  if (state.combat && state.combat.player.avatarOfPassingTurns > 0) {
    applyHeal(state, Math.round(dmg * 0.3));
  }
  if (state.combat && creature.passives && creature.passives.length) {
    dmg = applyEnemyFlatDamageReduction(dmg, creature);
    applyEnemyOnHitTakenPassives(state, creature, dmg);
  }
  if (state.combat) activeEnemySlot(state.combat).hitsTakenFromPlayer = (activeEnemySlot(state.combat).hitsTakenFromPlayer || 0) + 1;

  return { dmg, physicalBranch: !isSpell };
}

// Step 1e completion handoff: reads only the action definition's own
// declared fields (openingReach/extraDamageMultiplierFn/
// usesOrchestratorDmgMult/extraElementMultiplier/borrowedSecondsBonusInDamage/
// consumesFeintBonus/reportPhysical) -- never action.id. Each field's
// value, per action, is set in js/data/actions.js or js/data/tactics.js/
// elementabilities.js's own `action` block; see js/data/actions.js's own
// header for what each one means and which action used to need which
// `action.id === ...` branch for it (Flurry's own second-roll note
// below still applies unchanged -- it's about STEP ORDERING, not
// per-action identity).
function calculateDamagePlayerActor(actor, target, action, ctx, hitInfo) {
  const state = ctx.state;
  const enemySlot = target.store;
  const creature = enemySlot.creatureObj;
  const isElement = !!action.elementOnHit;
  const activeElement = isElement ? action.id : (action.picksElement ? action.activeElement : undefined);

  const core = rollPlayerDamageCoreForPipeline(actor, target, ctx, activeElement, action);
  let dmg = core.dmg;
  const physicalBranch = core.physicalBranch;

  // Disarm's own original order is multiply-by-0.7 THEN openingReach
  // (not the other way around) -- since Math.round happens at each step,
  // this order is NOT interchangeable with openingReach-then-multiply in
  // general (only basic_attack's own default multiplier of 1 makes the
  // two orders equivalent for it specifically), so extraDamageMultiplierFn
  // runs first, matching Disarm's original, for every action.
  dmg = Math.round(dmg * (action.extraDamageMultiplierFn ? action.extraDamageMultiplierFn(state) : 1));

  const openingReach = action.openingReach || "none";
  if (openingReach === "physicalGated" ? physicalBranch : openingReach === "unconditional") {
    dmg = applyOpeningReach(state, dmg);
  }

  // Lightning's second roll: only computed AT ALL if the first hit didn't
  // already kill -- see applyAndReactPlayerActor's lightningOnHit hook for
  // why this can't be precomputed here, before step 5 has even applied
  // the first hit (it would increment state.combat.hitsTakenFromPlayer an
  // extra, unused time whenever the first hit is lethal). Caught by this
  // step's own Layer 2 check originally, not Layer 1 -- see
  // lightningOnHit's own comment in js/data/actions.js.
  if (action.usesOrchestratorDmgMult) dmg = Math.round(dmg * (action.extraElementMultiplier || 1) * action.dmgMult);

  if (action.borrowedSecondsBonusInDamage && borrowedSecondsActive(state)) dmg = Math.round(dmg * 1.15);

  let feintBonusApplied = false;
  if (action.consumesFeintBonus && state.combat.player.nextAttackBonus) {
    const feintMult = hasEffect(state, "patient_aim") ? 1.75 : 1.6;
    dmg = Math.round(dmg * feintMult);
    state.combat.player.nextAttackBonus = false;
    feintBonusApplied = true;
  }

  const reportPhysical = action.reportPhysical === "coreBranch" ? physicalBranch : true;

  return { shortCircuit: false, edmg: dmg, kind: "enemy", isPhysical: physicalBranch, reportPhysical, feintBonusApplied, activeElement };
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

  // Step 1e completion handoff: dispatch reads only action.elementOnHit
  // (a hook NAME, declared per-element in js/data/elementabilities.js)
  // -- never action.id. An element's on-hit effect sets lastDamageType to
  // the ELEMENT ITSELF (never "physical", unlike every other player
  // action) and never calls applyPhysicalOnHitEffects. Kill resolution is
  // NOT done here: useElementAbilityLegacy's own kill check happens AFTER
  // synergy and Spell Echo, both OUTSIDE this function's shape -- the
  // orchestrator (useElementAbility) does it instead, once, after calling
  // this, using castDamageDealt below. This is the one player action
  // shape where applyAndReact does not resolve the kill itself.
  if (action.elementOnHit) {
    enemySlot.lastDamageType = action.id;
    enemySlot.hp -= edmg;
    const hookResult = PIPELINE_HOOKS[action.elementOnHit]({ state, actor, target, enemySlot, creature, edmg, action, dmgInfo, pipelineCtx: ctx });
    return { lines: hookResult.lines, damage: edmg, killed: false, isPhysicalHit: isPhysical, castDamageDealt: hookResult.castDamageDealt };
  }

  // reportPhysical: what gets REPORTED (lastDamageType, whether
  // on-hit-effects run) -- basic_attack reports the true internal
  // branch (action.reportPhysical === "coreBranch"); Decoy/Ambush/Disarm
  // always report "physical" regardless (action.reportPhysical ===
  // "always") -- see calculateDamagePlayerActor's own header on this
  // asymmetry.
  const reportPhysical = dmgInfo.reportPhysical;

  enemySlot.hp -= edmg;
  enemySlot.lastDamageType = reportPhysical ? "physical" : dmgInfo.activeElement;
  const lines = action.flavorLine(state, creature, edmg, dmgInfo);

  // No "&& enemySlot.alive" guard here, unlike the ally-actor branches
  // above -- playerAttackLegacy's own kill check is the bare
  // `state.combat.hp <= 0`, and enemySlot here is the stale-creature
  // shim built in the orchestrator (see playerAttack's own comment),
  // which has no independent .alive tracking of its own to check.
  if (enemySlot.hp <= 0) {
    lines.push(...resolveKill(state, creature));
    return { lines, damage: edmg, killed: true, isPhysicalHit: isPhysical };
  }
  if (action.onHitEffectsForm === "gated") {
    // basic_attack only: isPhysical-gated, plus Arena Riposte.
    if (isPhysical) lines.push(...applyPhysicalOnHitEffects(state, creature));
    if (edmg > 0 && action.arenaRiposte) lines.push(...arenaRiposteCounterOnPlayer(state, creature));
  } else {
    // Decoy/Ambush/Disarm (onHitEffectsForm: "unconditional"): no
    // isPhysical gate, and no Arena Riposte at all -- useDecoyLegacy/
    // useAmbushLegacy/useDisarmLegacy never call
    // arenaRiposteCounterOnPlayer, only playerAttackLegacy does.
    // Preserved exactly.
    lines.push(...applyPhysicalOnHitEffects(state, creature));
    if (action.evasiveReleaseCheck && hasEffect(state, "evasive_release")) {
      state.combat.player.evasionCharges += 1;
      lines.push(`You're already moving again — the next counter aimed at you will have to find you first.`);
    }
  }
  // Generic, chance-gated on-hit effect: declared as { chance, hookName }
  // on the definition (named hook resolved by NAME, never by action
  // identity), so a new skill with a genuinely new on-hit mechanic adds
  // one hook and this one field, nothing else. None of today's 11
  // real actions use this -- introduced for the step 1e completion
  // handoff's own test-strike proof.
  if (action.onHitChanceEffect && edmg > 0 && Math.random() < action.onHitChanceEffect.chance) {
    lines.push(...PIPELINE_HOOKS[action.onHitChanceEffect.hookName]({ state, actor, target, enemySlot, creature, edmg, action, dmgInfo, pipelineCtx: ctx }));
  }
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
  if (activeEnemySlot(state.combat).hp <= 0) {
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
    get hp() { return activeEnemySlot(state.combat).hp; },
    set hp(v) { activeEnemySlot(state.combat).hp = v; },
    get maxHp() { return activeEnemySlot(state.combat).maxHp; },
    get lastDamageType() { return activeEnemySlot(state.combat).lastDamageType; },
    set lastDamageType(v) { activeEnemySlot(state.combat).lastDamageType = v; },
  };
  const actor = makePlayerCombatant(state);
  const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
  const action = Object.assign({}, getActionDef("basic_attack"), { isPhysical, activeElement });
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
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

// ---- Orchestrators: Decoy/Ambush/Disarm (combat.js's "decoy"/"ambush"/
// "disarm" verbs, step 1e-ii). Feint (useFeint, combat.js) is NOT
// migrated: it never rolls to hit or deals damage at all (a pure
// self-buff + cooldown setup — nextAttackBonus/the "Your feint pays
// off" bonus it grants is consumed inside calculateDamagePlayerActor's
// basic_attack branch above, already wired in step 1e-i), so it has no
// five-step shape to move onto — same precedent as Hadrian's own
// non-damage Actives (Shielding Presence et al.) staying untouched in
// step 1d. Everything NOT part of the five-step pipeline itself (the
// tactic's own gating/cooldown/flavor setup, the rest of the round's
// initiative order, low-health/evasion/Riposte checks where each
// tactic's own original code has them) stays exactly where
// useDecoyLegacy/useAmbushLegacy/useDisarmLegacy had it.
function useDecoy(state) {
  if (!state.combat) return ["There's nothing here to use that on."];
  if (!classHasTactics(state)) return ["Decoys aren't how your training works. Try your class's own ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't attacking you. No need for a decoy.`];
  const t = TACTICS.decoy;
  if (state.knowledge < t.knowledgeReq && !activationRestrictionsBypassed(state)) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if ((state.combat.cooldowns.decoy || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Decoy is still recovering — ${state.combat.cooldowns.decoy} more turn(s).`];

  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat || state.health <= 0) return out;
  const decoyedIndex = state.combat.activeIndex;
  out.push(...applyEndlessStudy(state, "decoy"), ...applyWanderersReward(state, "decoy"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "decoy"));
  consumeTrailblazer(state);
  let decoyMemory;
  if (state.combat.player.avatarOfTimeTurns > 0) {
    decoyMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    decoyMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.swiftPassageReady) {
    state.combat.player.swiftPassageReady = false;
    decoyMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.hourglassReserveReady) {
    state.combat.player.hourglassReserveReady = false;
    decoyMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    decoyMemory = applyTacticalMemory(state, baseCooldown);
  }
  if (borrowedSecondsActive(state) && decoyMemory.cooldown > 0) {
    decoyMemory.cooldown = Math.round(decoyMemory.cooldown / 2);
  }
  state.combat.cooldowns.decoy = decoyMemory.cooldown;

  out.push(`You plant a decoy — ${withThe(creature.name, false)} takes the bait.`);
  if (decoyMemory.cooldown === 0 && !decoyMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (decoyMemory.fired) out.push(`Old instincts kick in — Decoy recovers faster this time.`);

  // Same stale-creature shim playerAttack's own comment explains --
  // see pipeline.js's step 1e-i header.
  const enemySlot = {
    creatureObj: creature,
    get hp() { return activeEnemySlot(state.combat).hp; },
    set hp(v) { activeEnemySlot(state.combat).hp = v; },
    get maxHp() { return activeEnemySlot(state.combat).maxHp; },
    get lastDamageType() { return activeEnemySlot(state.combat).lastDamageType; },
    set lastDamageType(v) { activeEnemySlot(state.combat).lastDamageType = v; },
  };
  const actor = makePlayerCombatant(state);
  const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
  const action = getActionDef("decoy");
  const ctx = { state, pendingAction: action, target };
  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) {
    out.push(...hitInfo.result.lines);
  } else {
    const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
    const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
    out.push(...result.lines);
    if (result.killed) {
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    }
  }

  const decoyedEnemy = state.combat.enemies[decoyedIndex];
  if (decoyedEnemy && decoyedEnemy.alive) {
    out.push(`${withThe(decoyedEnemy.creatureObj.name, true)} wastes its attack on the decoy — you take no damage this turn.`);
  }
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, 0, decoyedIndex);
  out.push(...retaliation.lines);
  // Step 1e §4 gap fix: useDecoyLegacy never called lowHealthTriggerChecks
  // at all -- every other migrated player action does (playerAttack/
  // useDisarm/useElementAbility all gate it on state.health > 0, right
  // here, before their own dodge/Riposte follow-ups). Decoy's own
  // unconditional dodge/Riposte follow-up call just below is untouched --
  // only the missing lowHealthTriggerChecks call is being added.
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  out.push(...maybeRiposte(state, creature), ...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

function useAmbush(state) {
  if (!state.combat) return ["There's nothing here to ambush."];
  if (!classHasTactics(state)) return ["Ambush isn't how your training works. Try your class's own ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} hasn't given you a reason to ambush it.`];
  const t = TACTICS.ambush;
  const ambushBypass = activationRestrictionsBypassed(state);
  if (state.knowledge < t.knowledgeReq && !ambushBypass) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (state.combat.turnTaken && !ambushBypass) return [`The moment's passed — ambush only works as your opening move.`];

  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat || state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "ambush"), ...applyWanderersReward(state, "ambush"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "ambush"));
  consumeTrailblazer(state);
  const ambushedIndex = state.combat.activeIndex;

  const enemySlot = {
    creatureObj: creature,
    get hp() { return activeEnemySlot(state.combat).hp; },
    set hp(v) { activeEnemySlot(state.combat).hp = v; },
    get maxHp() { return activeEnemySlot(state.combat).maxHp; },
    get lastDamageType() { return activeEnemySlot(state.combat).lastDamageType; },
    set lastDamageType(v) { activeEnemySlot(state.combat).lastDamageType = v; },
  };
  const actor = makePlayerCombatant(state);
  const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
  const action = getActionDef("ambush");
  const ctx = { state, pendingAction: action, target };
  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) {
    out.push(...hitInfo.result.lines);
  } else {
    const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
    const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
    out.push(...result.lines);
    if (result.killed) {
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    }
  }

  // Step 1e §4 gap fix: Ambush's own original never called
  // lowHealthTriggerChecks/applyDodgeBlockNegateBonuses/maybeRiposte/the
  // evasion-bonus trio at all -- now added. Using Decoy's own UNCONDITIONAL
  // form here, not playerAttack/useDisarm's gated
  // "retaliation.damage === 0" form: Ambush (like Decoy) passes
  // ambushedIndex as resolveRemainingInitiativeActions' excludeIndex, which
  // is ALWAYS the same enemy resolveRemainingInitiativeActions captured as
  // its own callerActiveIndex at entry (nothing moves activeIndex between
  // the two on a non-kill hit) -- so that enemy is excluded from acting
  // AND is the only one whose damage the function would ever attribute to
  // `retaliation.damage` (see its own `if (i === callerActiveIndex)
  // activeDamage = result.damage` line). retaliation.damage is therefore
  // always null, never 0, for an excludeIndex-shaped action -- the gated
  // form would be silent dead code here, confirmed by this step's own
  // P1E-II-A-DODGEBLOCK-FIX-01 test failing against it before this was
  // caught. playerAttack/useDisarm don't pass an excludeIndex, so the
  // gated form stays meaningful for them.
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, 0, ambushedIndex);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  out.push(...maybeRiposte(state, creature), ...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

function useDisarm(state) {
  if (!state.combat) return ["There's nothing here to disarm."];
  if (!classHasTactics(state)) return ["Disarm isn't how your training works. Try your class's own ability instead."];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't armed against you. Nothing to disarm.`];
  const t = TACTICS.disarm;
  const disarmBypass = activationRestrictionsBypassed(state);
  if (state.knowledge < t.knowledgeReq && !disarmBypass) return [`You don't know that tactic yet. (needs Knowledge ${t.knowledgeReq}+)`];
  if (activeEnemySlot(state.combat).disarmed && !disarmBypass) return [`It's already lost whatever you could have disarmed.`];
  if ((state.combat.cooldowns.disarm || 0) > 0 && !hasEffect(state, "perfect_recall")) return [`Disarm is still recovering — ${state.combat.cooldowns.disarm} more turn(s).`];

  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat || state.health <= 0) return out;
  out.push(...applyEndlessStudy(state, "disarm"), ...applyWanderersReward(state, "disarm"), ...applyActionTypeTracking(state, "tactic"), ...applyPerfectMemory(state, "disarm"));
  consumeTrailblazer(state);
  let disarmMemory;
  if (state.combat.player.avatarOfTimeTurns > 0) {
    disarmMemory = { cooldown: 0, fired: false };
  } else if (applyPerfectTiming(state)) {
    disarmMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.swiftPassageReady) {
    state.combat.player.swiftPassageReady = false;
    disarmMemory = { cooldown: 0, fired: false };
  } else if (state.combat.player.hourglassReserveReady) {
    state.combat.player.hourglassReserveReady = false;
    disarmMemory = { cooldown: 0, fired: false };
  } else {
    let baseCooldown = t.cooldown;
    if (hasSetTier(state, "First Kingdom", 6) || hasEffect(state, "master_strategist")) baseCooldown = applyFirstKingdomCooldown(baseCooldown);
    disarmMemory = applyTacticalMemory(state, baseCooldown);
  }
  if (borrowedSecondsActive(state) && disarmMemory.cooldown > 0) {
    disarmMemory.cooldown = Math.round(disarmMemory.cooldown / 2);
  }
  state.combat.cooldowns.disarm = disarmMemory.cooldown;
  activeEnemySlot(state.combat).disarmed = true;
  activeEnemySlot(state.combat).enemyAtkPenalty = (activeEnemySlot(state.combat).enemyAtkPenalty || 0) + 3;

  out.push(`You disarm ${withThe(creature.name, false)} — its attacks will be noticeably weaker for the rest of this fight.`);
  if (disarmMemory.cooldown === 0 && !disarmMemory.fired) out.push(`Perfect Timing — this move cost nothing.`);
  if (disarmMemory.fired) out.push(`Old instincts kick in — Disarm recovers faster this time.`);

  const enemySlot = {
    creatureObj: creature,
    get hp() { return activeEnemySlot(state.combat).hp; },
    set hp(v) { activeEnemySlot(state.combat).hp = v; },
    get maxHp() { return activeEnemySlot(state.combat).maxHp; },
    get lastDamageType() { return activeEnemySlot(state.combat).lastDamageType; },
    set lastDamageType(v) { activeEnemySlot(state.combat).lastDamageType = v; },
  };
  const actor = makePlayerCombatant(state);
  const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
  const action = getActionDef("disarm");
  const ctx = { state, pendingAction: action, target };
  const chosen = chooseAction(actor, ctx);
  const targets = chooseTargets(actor, chosen, ctx);
  const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
  if (!hitInfo.hit) {
    out.push(...hitInfo.result.lines);
  } else {
    const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
    const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
    out.push(...result.lines);
    if (result.killed) {
      if (!state.combat || state.health <= 0) return out;
      creature = getCombatCreature(state);
    }
  }

  // Unconditional on whether the follow-up hit landed -- useDisarmLegacy's
  // own guardBonus never gated on that either, unlike the basic attack's.
  const guardBonus = hasEffect(state, "guarded_strike") ? 2 : 0;
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, guardBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}

// ---- Orchestrator: element abilities (combat.js's "ignite"/"drench"/
// "stoneskin"/"shock"/"corrode"/"force"/"blink"/"windcut" verbs --
// elementKey "fire"/"water"/"earth"/"lightning"/"acid"/"force"/
// "transportation"/"air" -- step 1e-iii). Stoneskin (earth) is a no-
// target, no-damage self-buff -- same shape as Feint (step 1e-ii), so
// it never reaches the pipeline, handled inline below exactly as
// useElementAbilityLegacy's own switch branch. The other seven go
// through chooseAction -> chooseTargets -> rollToHit -> calculateDamage
// -> applyAndReact (rollToHitPlayerActor/calculateDamagePlayerActor/
// applyAndReactPlayerActor, above), dispatching on action.id === the
// elementKey.
//
// One real shape difference from every other migrated player action:
// useElementAbilityLegacy's own kill check happens AFTER its synergy
// bonus and Spell Echo, both of which sit OUTSIDE the switch — so
// applyAndReactPlayerActor's element branch does NOT resolve the kill
// itself (see that function's own comment); this orchestrator does,
// once, after synergy and Spell Echo have both run, exactly matching
// the original's own sequencing. A miss ALSO still runs synergy/Spell
// Echo/the kill check here (castDamageDealt stays 0, so Spell Echo and
// the post-kill-check checkCounteringGuard/checkEnemyLowHealthTriggers
// branch are no-ops on a miss) -- useElementAbilityLegacy's own
// `break` out of the switch on a miss falls through to that same
// unconditional tail, it doesn't return early the way every other
// action's own miss branch does.
function useElementAbility(state, elementKey) {
  const a = ELEMENT_ABILITIES[elementKey];
  if (!state.combat) return [`Nothing to ${a.name.toLowerCase()} outside a fight.`];
  let creature = getCombatCreature(state);
  if (creature.friendly) return [`${withThe(creature.name, true)} isn't fighting you. Save it.`];
  const worldWalkerBypass = elementKey === "transportation" && hasEffect(state, "world_walker");
  const elementalBypass = activationRestrictionsBypassed(state);
  if (!worldWalkerBypass && !elementalBypass && elementKey !== state.primaryElement && elementKey !== state.secondaryElement && elementKey !== state.tertiaryElement) {
    return [`You haven't opened yourself to ${ELEMENTS[elementKey].name}.`];
  }
  if (state.knowledge < a.knowledgeReq && !elementalBypass) return [`You don't have the Knowledge for that yet. (needs Knowledge ${a.knowledgeReq}+)`];
  if (elementKey === "acid" && activeEnemySlot(state.combat).corroded && !elementalBypass) return [`It's already lost whatever defenses you could corrode.`];
  if ((state.combat.cooldowns[elementKey] || 0) > 0) return [`${a.name} is still recovering — ${state.combat.cooldowns[elementKey]} more turn(s).`];

  const out = beginTurn(state);
  if (!state.combat) return out;
  state.combat.turnTaken = true;
  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  }
  out.push(...resolveSpeedInitiative(state, creature));
  if (!state.combat || state.health <= 0) return out;
  state.combat.player.spellCastCounter = (state.combat.player.spellCastCounter || 0) + 1;
  if (hasEffect(state, "seedbearer") && state.combat.player.spellCastCounter % 3 === 0) {
    const { healed, lines } = applyHeal(state, Math.ceil(state.maxHealth * 0.1));
    if (healed > 0) out.push(`Seedbearer blooms — you're mended for ${healed} health.`, ...lines);
  }
  out.push(...applyEndlessStudy(state, elementKey), ...applyWanderersReward(state, elementKey), ...applyActionTypeTracking(state, "elemental"), ...applyPerfectMemory(state, elementKey));
  consumeTrailblazer(state);
  let cooldown = a.cooldown;
  if (hasEffect(state, "conduit_mastery")) cooldown = Math.max(1, cooldown - 1);
  if ((hasSetTier(state, "Novitiate", 6) || hasEffect(state, "rivers_favor")) && !state.combat.player.noviceFreeCastUsed) {
    state.combat.player.noviceFreeCastUsed = true;
    cooldown = 0;
    out.push(`First casting's free — the conduit hasn't tired yet.`);
  } else if (hasEffect(state, "conduit_ease") && Math.random() < conduitEaseChance(state)) {
    cooldown = Math.max(1, cooldown - 1);
    out.push(`The conduit answers easier than expected — ${a.name} will recover faster this time.`);
  }
  if (hasEffect(state, "eureka") && state.combat.player.spellCastCounter % 4 === 0) {
    cooldown = 0;
    out.push(`Eureka — the insight arrives before the cost does.`);
  }
  if (state.combat.player.avatarOfKnowledgeTurns > 0) cooldown = 0;
  if (state.combat.player.avatarOfTimeTurns > 0) cooldown = 0;
  if (state.combat.player.swiftPassageReady) {
    state.combat.player.swiftPassageReady = false;
    cooldown = 0;
  }
  if (state.combat.player.hourglassReserveReady) {
    state.combat.player.hourglassReserveReady = false;
    cooldown = 0;
  }
  if (borrowedSecondsActive(state) && cooldown > 0) {
    cooldown = Math.round(cooldown / 2);
  }
  state.combat.cooldowns[elementKey] = cooldown;
  if (hasSetTier(state, "Regalia of the Endless Archive", 4)) {
    const otherKnown = [state.primaryElement, state.secondaryElement, state.tertiaryElement]
      .filter((el) => el && el !== elementKey && (state.combat.cooldowns[el] || 0) > 0);
    if (otherKnown.length) {
      const pick = otherKnown[Math.floor(Math.random() * otherKnown.length)];
      state.combat.cooldowns[pick] = Math.max(0, state.combat.cooldowns[pick] - 2);
      out.push(`Universal Understanding — the insight carries over; ${ELEMENT_ABILITIES[pick].name}'s cooldown eases.`);
    }
  }

  const synergy = getSynergy(state, elementKey);
  let dmgMult = synergy ? synergy.dmgMultiplier : 1;
  if (hasEffect(state, "twin_rivers") && state.combat.player.lastElementUsed) dmgMult *= 1.4;
  state.combat.player.lastElementUsed = elementKey;

  const focusActive = hasEffect(state, "elemental_focus");
  const focusMult = elementalFocusMultiplier(state);
  const surgeActive = hasEffect(state, "surging_conduit") && state.combat.player.surgingConduitUsesLeft > 0;
  if (surgeActive) state.combat.player.surgingConduitUsesLeft -= 1;
  let elementalDmgMult = dmgMult;
  if (focusActive) elementalDmgMult *= focusMult;
  if (surgeActive) elementalDmgMult *= 1.2;

  // useElementAbilityLegacy's own `state.combat.lastDamageType =
  // elementKey;` -- set UNCONDITIONALLY here, before spellHits is even
  // checked, for every element including Earth and a miss (Spell Echo
  // reduces combat.hp too, but never attributes a kill to it either
  // way, so setting this even for Earth/a miss is harmless -- same
  // comment the original carries). applyAndReactPlayerActor's own
  // element branch also sets it on a confirmed hit, to the same value,
  // so this line is the one that actually covers Earth and a miss.
  activeEnemySlot(state.combat).lastDamageType = elementKey;

  let castDamageDealt = 0;

  if (elementKey === "earth") {
    // Stoneskin: a pure self-buff, no target roll at all -- see this
    // function's own header.
    let defBonus = Math.max(flatStat(3), Math.round((state.magic / 3) * dmgMult));
    if (focusActive) defBonus += flatStat(1);
    if (surgeActive) defBonus += flatStat(3);
    state.combat.player.defBuffTurns = 3;
    state.combat.player.defBuffAmount = defBonus;
    out.push(`Your skin hardens to something between flesh and stone — your defenses surge for the next few turns.`);
    if (hasEffect(state, "brace") && hasSetTier(state, "Siege Corps", 6)) {
      state.combat.player.siegeCorpsAtkCharge = 2;
    }
  } else {
    const enemySlot = {
      creatureObj: creature,
      get hp() { return activeEnemySlot(state.combat).hp; },
      set hp(v) { activeEnemySlot(state.combat).hp = v; },
      get maxHp() { return activeEnemySlot(state.combat).maxHp; },
      get lastDamageType() { return activeEnemySlot(state.combat).lastDamageType; },
      set lastDamageType(v) { activeEnemySlot(state.combat).lastDamageType = v; },
    };
    const actor = makePlayerCombatant(state);
    const target = makeEnemyCombatant(state, enemySlot, state.combat.activeIndex);
    const action = Object.assign({}, getActionDef(elementKey), { dmgMult: elementalDmgMult });
    const ctx = { state, pendingAction: action, target };
    const chosen = chooseAction(actor, ctx);
    const targets = chooseTargets(actor, chosen, ctx);
    const hitInfo = rollToHit(actor, targets[0], chosen, ctx);
    if (!hitInfo.hit) {
      out.push(...hitInfo.result.lines);
    } else {
      const dmgInfo = calculateDamage(actor, targets[0], chosen, ctx, hitInfo);
      const result = applyAndReact(actor, targets[0], dmgInfo, ctx, chosen);
      out.push(...result.lines);
      castDamageDealt = result.castDamageDealt || 0;
    }
  }

  if (synergy) {
    if (synergy.extraEffect) synergy.extraEffect(state, creature);
    out.push(synergy.message(withThe(creature.name, false)));
  }

  const spellEchoChance = masterOfArmsDoubles(state, "spell_echo") ? 0.4 : 0.2;
  if (activeEnemySlot(state.combat).hp > 0 && castDamageDealt > 0 && hasEffect(state, "spell_echo") && Math.random() < spellEchoChance) {
    out.push(...resolveSpellEchoOnEnemy(state, creature, castDamageDealt, elementKey));
  }

  if (activeEnemySlot(state.combat).hp <= 0) {
    out.push(...resolveKill(state, creature));
    if (!state.combat || state.health <= 0) return out;
    creature = getCombatCreature(state);
  } else if (castDamageDealt > 0) {
    out.push(...checkCounteringGuard(state, creature));
    out.push(...checkEnemyLowHealthTriggers(state, creature));
  }

  let braceBonus = elementKey === "earth" && hasEffect(state, "brace") ? braceDefBonus(state) : 0;
  const retaliation = resolveRemainingInitiativeActions(state, creature, 2, braceBonus);
  out.push(...retaliation.lines);
  if (state.health > 0) out.push(...lowHealthTriggerChecks(state));
  if (retaliation.damage === 0 && state.combat) out.push(...applyDodgeBlockNegateBonuses(state), ...applyLaughingGaleMissBonuses(state), ...applyEndlessHorizonEvasionBonuses(state));
  if ((retaliation.damage === 0 || (state.combat && state.combat.player.avatarOfWarTurns > 0)) && state.combat) out.push(...maybeRiposte(state, creature));
  const tl = tacticsLine(state);
  if (tl) out.push(tl);
  return checkReflectDeath(state, out);
}
