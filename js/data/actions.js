/*
 * FRAGMENTA — Action definitions (Combat Rebuild Phase 1, step 1e
 * completion handoff, 9 Nov 2026).
 *
 * Every player action's actual BEHAVIOR (not its menu text/Knowledge
 * gate, which already lived in TACTICS/APOTHECARY_ABILITIES/
 * ELEMENT_ABILITIES) is declared here as data, under each entry's own
 * `action` block, plus PLAYER_ACTION_DEFS for the handful of actions
 * with no existing table (basic_attack, and test-only actions). The
 * five-step pipeline (js/engine/pipeline.js) and the generic resolver
 * (js/engine/resolver.js) read ONLY these declared fields and the named
 * hooks in PIPELINE_HOOKS below — never an action's own id. That's the
 * rule the new audit check P4 enforces: no `action.id ===`/`!==`/
 * `.includes(action.id)` anywhere in pipeline.js or PIPELINE_HOOKS.
 *
 * Field reference (a field absent from a definition uses the default
 * noted here):
 *   actorKinds            [] -- who may use this (only "player" exists
 *                             on this side of the resolver today)
 *   actionType             null -- "attack"|"tactic"|"elemental"|
 *                             "apothecary", fed to applyActionTypeTracking
 *                             (Momentum Unbound/Ever Forward)
 *   trackingKey            defaults to the action's own id -- the
 *                             granular key applyEndlessStudy/
 *                             applyWanderersReward/applyPerfectMemory key
 *                             off (Endless Study/Wanderer's Reward/Perfect
 *                             Memory)
 *   usesPerfectMemory      false -- Perfect Memory is scoped to Tactics/
 *                             Elemental Abilities only, never Attack or
 *                             Apothecary (its own header, combat.js)
 *   consumesTrailblazer    false -- true for every Tactic/Elemental
 *                             Ability (not the plain Attack)
 *   toHit                  "none" -- "roll" (goes through the five-step
 *                             pipeline) | "none" (a pure self/ally effect,
 *                             runs `effects` directly, no pipeline call)
 *   missLine(state,creature) -> string[]   -- only read when toHit:"roll"
 *   missProvokesRiposte    false -- only basic_attack is true
 *   excludesTargetFromRound false -- Decoy/Ambush: the targeted enemy is
 *                             excluded from this round's remaining
 *                             initiative (resolveRemainingInitiativeActions'
 *                             excludeIndex)
 *   formula                null -- name of a PIPELINE_FORMULAS entry
 *   picksElement            false -- only basic_attack calls pickElement()
 *                             itself (a mage's basic attack can land on
 *                             any of up to 3 known elements; every other
 *                             action never sets activeElement at all)
 *   openingReach            "none" -- "physicalGated" (basic_attack) |
 *                             "unconditional" (Decoy/Disarm) | "none"
 *   extraDamageMultiplierFn (state) => number, default () => 1 --
 *                             Ambush: ambushMultiplier; Disarm: () => 0.7
 *   usesOrchestratorDmgMult false -- true for every pipelined element
 *                             (dmgMult is computed once by the orchestrator
 *                             from synergy/Focus/Surge and carried on the
 *                             runtime action object, not from this static
 *                             definition)
 *   extraElementMultiplier  1 -- Transportation's own extra ×1.3, on top
 *                             of the orchestrator dmgMult
 *   borrowedSecondsBonusInDamage false -- true only for basic_attack/
 *                             ambush (no cooldown to refund, so Borrowed
 *                             Seconds grants +15% damage to the hit
 *                             instead -- every cooldown-bearing action
 *                             gets the refund in the generic resolver's
 *                             shared cooldown chain instead)
 *   consumesFeintBonus      false -- basic_attack only
 *   reportPhysical          "always" -- "coreBranch" (basic_attack: report
 *                             whichever branch the core formula actually
 *                             took) | "always" (Decoy/Ambush/Disarm always
 *                             report "physical" regardless of branch)
 *   elementOnHit            null -- name of a PIPELINE_HOOKS entry for an
 *                             element's own on-hit effect (burn/heal/
 *                             corrode/stun/evasion/Flurry's second roll).
 *                             When set, applyAndReactPlayerActor takes the
 *                             element shape entirely (lastDamageType =
 *                             this action's own id, no kill resolution --
 *                             the orchestrator resolves the kill itself,
 *                             after synergy/Spell Echo)
 *   flavorLine(state,creature,edmg,dmgInfo) -> string[] -- only read for
 *                             non-element actions
 *   onHitEffectsForm        "unconditional" -- "gated" (basic_attack:
 *                             isPhysical-gated) | "unconditional" (Decoy/
 *                             Ambush/Disarm)
 *   arenaRiposte            false -- basic_attack only
 *   evasiveReleaseCheck     false -- ambush only
 *   runsLowHealthChecks     false
 *   followupForm            "none" -- "gated" (playerAttack/Disarm/
 *                             elements' retaliation.damage===0 form) |
 *                             "unconditional" (Decoy/Ambush's own form --
 *                             see pipeline.js's own comment on why the
 *                             gated form is dead code for an
 *                             excludesTargetFromRound action) | "none"
 *
 * Buff/heal/cleanse-shaped actions (toHit:"none" -- Feint, every
 * Apothecary ability, test-only analogues) use a different, smaller set
 * of fields: see useAction's own "toHit === 'none'" branch in
 * js/engine/resolver.js.
 */

// ---- basic_attack: the one player action with no existing data table ----
const PLAYER_ACTION_DEFS = {
  basic_attack: {
    name: "Attack",
    actorKinds: ["player"],
    actionType: "attack",
    targeting: "singleEnemy",
    toHit: "roll",
    missLine: (state, creature) => [`Your attack goes wide — ${withThe(creature.name, false)} isn't where you expected.`, ...riposteCounterOnPlayer(state, creature)],
    missProvokesRiposte: true,
    formula: "playerCore",
    picksElement: true,
    openingReach: "physicalGated",
    borrowedSecondsBonusInDamage: true,
    consumesFeintBonus: true,
    reportPhysical: "coreBranch",
    flavorLine: (state, creature, edmg, dmgInfo) => {
      const lines = [];
      if (dmgInfo.feintBonusApplied) lines.push("Your feint pays off —");
      lines.push(attackFlavorLine(state, creature, edmg, dmgInfo.activeElement));
      return lines;
    },
    onHitEffectsForm: "gated",
    arenaRiposte: true,
    runsLowHealthChecks: true,
    followupForm: "gated",
  },
};

function getActionDef(id) {
  const outer = PLAYER_ACTION_DEFS[id] || TACTICS[id] || APOTHECARY_ABILITIES[id] || ELEMENT_ABILITIES[id];
  if (!outer) return null;
  return Object.assign({ id, cooldownKey: outer.cooldown != null ? id : null }, outer, outer.action || {});
}

// ---- named hooks: behavior too bespoke to flatten into a flag, never
// keyed off action.id (keyed off the HOOK's own name, declared per-action
// via a field like `elementOnHit`) ----
const PIPELINE_HOOKS = {
  fireOnHit(h) {
    h.state.combat.burn = { turnsLeft: 3, dmgPerTurn: Math.max(1, Math.round(h.state.magic / 4)) };
    return { lines: [`${ELEMENTS.fire.verb(withThe(h.creature.name, false))} for ${h.edmg} damage, and the flame catches.`], castDamageDealt: h.edmg };
  },
  waterOnHit(h) {
    const heal = Math.round(h.edmg * waterHealPct(h.state));
    const { healed, lines: healLines } = applyHeal(h.state, heal);
    if (hasSetTier(h.state, "First Sword's Regalia", 10)) h.state.combat.sovereigntyTurnsLeft = 2;
    return { lines: [`${ELEMENTS.water.verb(withThe(h.creature.name, false))} for ${h.edmg} damage, and the backwash mends you for ${healed}.`, ...healLines], castDamageDealt: h.edmg };
  },
  lightningOnHit(h) {
    const lines = [`${ELEMENTS.lightning.verb(withThe(h.creature.name, false))} for ${h.edmg} damage —`];
    let castDamageDealt = h.edmg;
    // The second roll: only computed AT ALL if the first hit didn't
    // already kill -- see rollPlayerDamageCoreForPipeline's own note on
    // why this can't be precomputed in step 4 (it would increment
    // state.combat.hitsTakenFromPlayer an extra, unused time whenever the
    // first hit is lethal).
    if (h.enemySlot.hp > 0) {
      const core2 = rollPlayerDamageCoreForPipeline(h.actor, h.target, h.pipelineCtx, h.dmgInfo.activeElement);
      const secondHitDmg = Math.round(core2.dmg * h.action.dmgMult);
      h.enemySlot.hp -= secondHitDmg;
      castDamageDealt += secondHitDmg;
      lines.push(`— and again, for ${secondHitDmg} more before it can react.`);
    }
    return { lines, castDamageDealt };
  },
  acidOnHit(h) {
    h.state.combat.corroded = true;
    h.state.combat.enemyDefPenalty = (h.state.combat.enemyDefPenalty || 0) + 4;
    return { lines: [`${ELEMENTS.acid.verb(withThe(h.creature.name, false))} for ${h.edmg} damage — its defenses will be weaker against you for the rest of this fight.`], castDamageDealt: h.edmg };
  },
  forceOnHit(h) {
    return { lines: [`${ELEMENTS.force.verb(withThe(h.creature.name, false))} for ${h.edmg} damage — it reels, stunned.`, ...tryApplyEnemyStun(h.state, h.creature)], castDamageDealt: h.edmg };
  },
  transportationOnHit(h) {
    return { lines: [`${ELEMENTS.transportation.verb(withThe(h.creature.name, false))} for ${h.edmg} damage before it can track where you went.`], castDamageDealt: h.edmg };
  },
  airOnHit(h) {
    h.state.combat.evasionTurns = 2;
    return { lines: [`${ELEMENTS.air.verb(withThe(h.creature.name, false))} for ${h.edmg} damage, leaving you lighter on your feet.`], castDamageDealt: h.edmg };
  },
  // "Stagger": this engine has no generic "named status, arbitrary
  // chance" system for a player-on-enemy effect -- Force/Acid/Fire's own
  // on-hit effects are each a dedicated per-enemy field/function, not a
  // shared status bag the way combat.playerStatuses is for the player
  // (confirmed by reading PER_ENEMY_FIELDS, combat.js). Building a real
  // new status from scratch is out of scope for a test-only action, so
  // this reuses the existing stun mechanism (tryApplyEnemyStun) under
  // the test's own name -- disclosed here rather than silently treated
  // as a genuinely new mechanic.
  staggerOnHit(h) {
    return tryApplyEnemyStun(h.state, h.creature);
  },
  // Step 1f-i: named-ally helpers, reached ONLY through this table --
  // never called directly from a step function (pipeline.js). The
  // helpers themselves (companion.js) are unchanged; only how they're
  // reached moved.
  hadrianFlatAtkBonus(h) {
    return hadrianFlatAtkBonus(h.ally);
  },
  hadrianOutgoingBonuses(h) {
    return applyHadrianOutgoingDamageBonuses(h.ally, h.edmg, h.creature);
  },
  hadrianOnKill(h) {
    onHadrianKill(h.state, h.ally, h.action.kit);
  },
  // Step 1f-iii §4: "Interceptions ... become onIncomingDamage hooks on
  // the defender or protector, running inside step 5 before HP changes."
  // maybeHadrianAllyProtection/applyAllyProtectionReaction (companion.js/
  // combat.js) are UNCHANGED -- including maybeHadrianAllyProtection's
  // own "is Hadrian in the party" check, which is Hadrian's own
  // legitimately-unique mechanic, not the kind of step-function ally-
  // identity dispatch P4 forbids (that rule is about pipeline.js/
  // PIPELINE_HOOKS never branching on identity, not about every helper
  // anywhere in the engine). Only HOW they're reached from step 5
  // changes: by NAME, through ON_INCOMING_DAMAGE_ALLY_HOOKS below,
  // instead of two calls hardcoded directly into applyAndReact's own
  // source. "Only their shape changes" (handoff's own words) -- behavior
  // is identical either way.
  hadrianAllyProtection(h) {
    return maybeHadrianAllyProtection(h.state, h.ally, h.edmg);
  },
  allyProtectionReaction(h) {
    return applyAllyProtectionReaction(h.state, h.ally, h.edmg);
  },
};

// Step 1f-iii §4: the declared, ordered list of onIncomingDamage hooks
// step 5 (applyAndReact's ally-target branch, pipeline.js) runs before
// writing ally.health -- same order as today's two hardcoded calls
// (Legion's Memory/Brothers in Arms first, then the generalized Ally
// Protection Reaction, matching this file's own companion.js comment on
// why that order matters: Legion's Memory REDIRECTS part of the hit
// before the generic 0.9x reduction would otherwise apply to the full
// amount). A future protector reaction is added here, by name, with no
// pipeline.js change.
const ON_INCOMING_DAMAGE_ALLY_HOOKS = ["hadrianAllyProtection", "allyProtectionReaction"];

// ---- formula table: today's formulas only, no new math. Resolved by
// NAME (a string on the definition), never by action identity. ----
const PIPELINE_FORMULAS = {
  // Every player action shares this one core (rollPlayerDamageCoreForPipeline,
  // pipeline.js) -- isSpell is decided internally by the formula itself
  // (state.flags.isMage && state.primaryElement), not per-action, so
  // there's only one real player-side formula today, not a physical/spell
  // pair at the action level.
  playerCore: (actor, target, ctx, activeElement) => rollPlayerDamageCoreForPipeline(actor, target, ctx, activeElement),

  // Step 1f-i: the three ally-side damage formulas, factored out of
  // calculateDamageAllyActor's own former `if (action.kit)` branch so
  // that function can dispatch on action.formula (a declared string)
  // instead of action.kit's own truthiness. Signature matches
  // calculateDamageAllyActor's own call: (actor, target, action, ctx,
  // hitInfo) -> { edmg, extra } -- extra is merged onto calculateDamage's
  // returned dmgInfo (baseAtk/splashAtkMult/bankedDefKit, used by
  // Groundbreaker's splash loop and applyAndReactAllyActor's own banked-
  // Defense consumption).

  // Kessa today -- allyAggressiveActionLegacy's own formula.
  allyPlain(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const ally = actor.ref;
    const enemySlot = target.store;
    const creature = enemySlot.creatureObj;
    const allyAtk = stat(state, actor, "atk");
    const reduction = 1 - (creature.dmgReduction || 0);
    // Brace/Guarded Strike/Sure Foundation: PEEKED, not consumed -- see
    // pipeline.js's own step 1d header. The actual zero + Sure Foundation
    // re-grant happens in applyAndReactAllyActor (step 5).
    const bankedDef = (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0) + (creature.sureFoundationBonusDef || 0);
    const effectiveDef = stat(state, target, "def") + bankedDef;
    const sangMit = sangCuDefenderMitigation(creature);
    let edmg = Math.max(1, Math.round(mitigate(randInt(Math.round(allyAtk * 0.85), Math.round(allyAtk * 1.15)), effectiveDef) * reduction * sangMit));
    edmg = applyOpeningReachForActor(ally, edmg);
    edmg = Math.round(edmg * executionerMultiplierFor(ally, enemySlot.hp, enemySlot.maxHp));
    return { edmg, extra: {} };
  },

  // A kit-bearing ally's fallback basic swing (Hadrian's today) --
  // basicCompanionAttackLegacy's own formula. The attack-bonus hook
  // (action.hooks.atkBonus) and the outgoing-damage hook
  // (action.hooks.onDamage) are both declared on the kit's own data
  // (js/data/hadrian.js today), read here generically -- this formula
  // itself names no ally.
  kitAllyBasic(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const ally = actor.ref;
    const enemySlot = target.store;
    const creature = enemySlot.creatureObj;
    const bankedDefKit = COMBAT_UNIFY.U3e
      ? (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0) + (creature.sureFoundationBonusDef || 0)
      : 0;
    const sangMitKit = COMBAT_UNIFY.U3f ? sangCuDefenderMitigation(creature) : 1;
    const atkBonusHook = action.hooks && action.hooks.atkBonus;
    const atkBonus = atkBonusHook ? PIPELINE_HOOKS[atkBonusHook]({ state, actor, target, ally, creature, action }) : 0;
    const atk = ally.atk + atkBonus;
    let edmg = Math.max(1, Math.round(mitigate(randInt(Math.round(atk * 0.85), Math.round(atk * 1.15)), stat(state, target, "def") + bankedDefKit) * sangMitKit));
    return { edmg, extra: { bankedDefKit } };
  },

  // A kit-bearing ally's named active, direct-damage branch (Crushing
  // Blow/Groundbreaker today) -- useHadrianActive's own direct-damage
  // formula, moved via resolveHadrianActiveDamage (pipeline.js). Every
  // per-ability number (atkMult/defIgnorePct/consumesEmpoweredStrike/
  // splashAtkMult/ascended bonuses) already lives on the ability's own
  // data (js/data/hadrian.js), so this ONE formula is already generic
  // across any kit-bearing ally's named actives, not just Hadrian's.
  kitAllyAbility(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const ally = actor.ref;
    const enemySlot = target.store;
    const creature = enemySlot.creatureObj;
    const bankedDefKit = COMBAT_UNIFY.U3e
      ? (creature.braceBonusDef || 0) + (creature.guardedStrikeBonusDef || 0) + (creature.sureFoundationBonusDef || 0)
      : 0;
    const sangMitKit = COMBAT_UNIFY.U3f ? sangCuDefenderMitigation(creature) : 1;
    const ability = action.ability;
    const atkBonusHook = action.hooks && action.hooks.atkBonus;
    const atkBonus = atkBonusHook ? PIPELINE_HOOKS[atkBonusHook]({ state, actor, target, ally, creature, action }) : 0;
    const atkBonusPct = 1 + (ally.ultimateTurnsLeft > 0 ? ally.ultimateAtkPct : 0);
    const empowered = ability.consumesEmpoweredStrike && ally.empoweredStrikeTurnsLeft > 0;
    const empoweredMult = empowered ? 1 + ally.empoweredStrikePct : 1;
    if (empowered) { ally.empoweredStrikePct = 0; ally.empoweredStrikeTurnsLeft = 0; }
    const baseAtk = (ally.atk + atkBonus) * atkBonusPct * empoweredMult;
    const defIgnore = (ability.defIgnorePct || 0) + (action.ascended ? (ability.ascendedDefIgnoreBonus || 0) : 0);
    const splashAtkMult = ability.splashAtkMult != null ? ability.splashAtkMult + (action.ascended ? 0.15 : 0) : 0;
    let edmg = Math.max(1, Math.round(mitigate(baseAtk * ability.atkMult, (stat(state, target, "def") + bankedDefKit) * (1 - defIgnore)) * sangMitKit));
    return { edmg, extra: { baseAtk, splashAtkMult, bankedDefKit } };
  },

  // Step 1f-iii §4: Last Bastion's own automatic-retaliation formula --
  // today's exact math (atk * (retaliatePct + veteranPct), mitigate, no
  // crit/random band unlike kitAllyBasic/kitAllyAbility's own rolls),
  // moved verbatim out of companion.js's maybeCompanionRetaliate. The
  // atkBonus hook (action.hooks.atkBonus) is the same hadrianFlatAtkBonus
  // hook kitAllyBasic/kitAllyAbility already read, declared on the same
  // kit.action.hooks data -- a retaliation reuses it, not a second copy.
  allyRetaliate(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const ally = actor.ref;
    const enemySlot = target.store;
    const creature = enemySlot.creatureObj;
    const atkBonusHook = action.hooks && action.hooks.atkBonus;
    const atkBonus = atkBonusHook ? PIPELINE_HOOKS[atkBonusHook]({ state, actor, target, ally, creature, action }) : 0;
    const atk = ally.atk + atkBonus;
    const edmg = Math.max(1, Math.round(mitigate(atk * (ally.retaliatePct + action.veteranPct), creature.def)));
    return { edmg, extra: {} };
  },

  // Step 1f-iii §4: Riposte, generalized for an ally wearer -- a free
  // 0.5x follow-up on a miss. Today's exact math (the same randInt band
  // around 85%-115% of atk as allyPlain's own basic swing, times 0.5),
  // moved verbatim out of combat.js's riposteCounterByAllyOnEnemy.
  riposteCounterAlly(actor, target, action, ctx, hitInfo) {
    const ally = actor.ref;
    const enemySlot = target.store;
    const creature = enemySlot.creatureObj;
    const edmg = Math.max(1, Math.round(mitigate(randInt(Math.max(1, Math.round(ally.atk * 0.85)), Math.round(ally.atk * 1.15)), creature.def) * 0.5));
    return { edmg, extra: {} };
  },

  // Step 1f-ii: the enemy-actor damage formula -- shared by EVERY enemy
  // active ability AND the basic attack (abilityCtx null), the same "one
  // formula, read generically off declared fields, never by ability
  // identity" shape as playerCore above. Moved verbatim out of
  // calculateDamage's own enemy branch (js/engine/pipeline.js) -- today's
  // math only, no new math, same order of every Math.round call. Returns
  // the full { shortCircuit: false, edmg, kind, elName? } shape directly
  // (unlike allyPlain/kitAllyBasic/kitAllyAbility's own {edmg, extra}),
  // since calculateDamage's enemy branch now just returns this call's
  // result as-is, with nothing left to wrap.
  //
  // Mirror Soul's own shortCircuit reflection check stays in
  // calculateDamage, immediately BEFORE this formula is ever called (see
  // that function's own comment) -- step 1f-iii (handoff §4) turns it
  // into a real reaction through step 5; step 1f-ii does not touch it.
  // By the time this formula runs, it's already been ruled out for this
  // hit (not equipped, already used this fight, or the target isn't the
  // player), so the magic branch below never needs to re-check it.
  enemyCore(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const combat = state.combat;
    const creature = actor.ref.creatureObj;
    const { atkSpread, extraDef, abilityCtx, basicFirstBonus } = action;
    const bonusDef = extraDef || 0;

    if (target.kind === "ally") {
      const ally = target.ref;
      // Brace/Guarded Strike, generalized: the ally's own banked bonus
      // against its next incoming hit, consumed here (read then zeroed)
      // -- same side-effecting-at-the-usage-site shape as the enemy-def
      // banked bonuses elsewhere in this formula, never folded into
      // stat() itself (the stat()-purity rule, js/engine/combatant.js's
      // header).
      const bankedDef = (ally.braceBonusDef || 0) + (ally.guardedStrikeBonusDef || 0);
      ally.braceBonusDef = 0;
      ally.guardedStrikeBonusDef = 0;
      const effectiveDef = stat(state, target, "def") + bankedDef;

      // U1 (off by default): an enemy mage's hit on an ally uses the
      // same element/magic formula the player branch below does,
      // instead of always falling through to the flat physical formula
      // -- see COMBAT_UNIFY's own header comment for the matchup-
      // multiplier caveat and why Mirror Soul is deliberately excluded.
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
      // U3b (off by default): Flowing Discipline's banked +10% on an
      // ally target too, same bank/consume shape as the player branch's
      // own.
      if (COMBAT_UNIFY.U3b && edmg > 0 && hasSetTier(creature, "First Sword's Regalia", 6) && creature.flowingDisciplinePending) {
        creature.flowingDisciplinePending = false;
        creature.flowingDisciplineTurnsLeft = 0;
        edmg = Math.round(edmg * 1.10);
      }
      // U3c (off by default): Winter's Verdict reads the ALLY's own
      // Chilled status (ally.statuses.chilled) rather than the player's
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
      // Sanguivorum-poison status (ally.statuses["sang_iag_poison"])
      // rather than the player's combat.playerStatuses["sang_iag_poison"].
      if (COMBAT_UNIFY.U3d && edmg > 0 && hasEffect(creature, "sang_iag_ie008_toxic_preparation") && !creature.toxicPreparationUsed && ally.statuses && ally.statuses["sang_iag_poison"]) {
        creature.toxicPreparationUsed = true;
        edmg += Math.max(1, Math.floor(edmg * 0.05));
      }
      // Stonewarden 6pc's first-hit-taken reduction has no switch yet --
      // tools/combat_asymmetry_register.md flags it needs-Tyler (is it
      // kind A or kind B?) rather than guessing a U3 slot for it here.
      return { shortCircuit: false, edmg, kind: "ally" };
    }

    if (creature.element) {
      const matchup = elementMultiplier(null, creature.element, state.flags.isMage ? state.primaryElement : null);
      const base = randInt(creature.magic - 2, creature.magic + 2);
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
  },

  // Step 1f-iii §4: Riposte, generalized for an enemy wearer -- a free
  // 0.5x follow-up on a miss by the player. Deliberately NOT enemyCore:
  // riposteCounterOnPlayerLegacy's own math never applied Opening Reach
  // or any of enemyCore's wearer-effect chain (ice_forged_edge,
  // unbroken_grip, executioners_seal, ...) -- today's exact math, moved
  // verbatim, nothing added.
  riposteCounterEnemy(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const creature = actor.ref.creatureObj;
    const atk = effectiveEnemyAtk(state, creature);
    const playerDef = effectivePlayerDef(state);
    const edmg = Math.max(1, Math.round(mitigate(randInt(Math.max(1, atk - 1), atk + 2), playerDef) * 0.5));
    return { shortCircuit: false, edmg, kind: "physical" };
  },

  // Arena Riposte (step 1f-iii §4): the same shape as riposteCounterEnemy
  // just above, but with the ability's OWN declared multiplier
  // (ability.mult, default 0.8) in place of the flat 0.5x -- moved
  // verbatim out of combat.js's arenaRiposteCounterOnPlayer.
  arenaRiposteEnemy(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const creature = actor.ref.creatureObj;
    const atk = effectiveEnemyAtk(state, creature);
    const playerDef = effectivePlayerDef(state);
    const edmg = Math.max(1, Math.round(mitigate(randInt(Math.max(1, atk - 1), atk + 2), playerDef) * (action.mult || 0.8)));
    return { shortCircuit: false, edmg, kind: "physical" };
  },

  // Step 1f-iii §4: Riposte, generalized for an enemy wearer whose own
  // retaliation an ALLY's attack just missed -- the ally-target twin of
  // riposteCounterEnemy above (same flat 0.5x, no Opening Reach, no
  // wearer-effect chain), moved verbatim out of combat.js's
  // riposteCounterByEnemyOnAlly. effectiveAllyDef, not effectivePlayerDef
  // -- this hits an ally, not the player.
  riposteCounterEnemyOnAlly(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    const creature = actor.ref.creatureObj;
    const ally = target.ref;
    const atk = effectiveEnemyAtk(state, creature);
    const effectiveDef = effectiveAllyDef(ally);
    const edmg = Math.max(1, Math.round(mitigate(randInt(Math.max(1, atk - 1), atk + 2), effectiveDef) * 0.5));
    return { shortCircuit: false, edmg, kind: "physical" };
  },

  // Step 1f-iv §5: every DOT tick's own "final number" adjustment, moved
  // verbatim out of beginTurn/tickAllyStatuses/tickPlayerStatuses. Each
  // formula reads action.rawDmg -- the amount the caller already computed
  // from the tick's own fields (burn/bleed's dmgPerTurn, a status's
  // maxHealth * pctMaxHp * stacks) -- and applies exactly the one
  // reduction/multiplier the original inline code applied at this same
  // point, nothing more. The caller still owns everything else: whether
  // this tick even runs (turnsLeft > 0), decrementing turnsLeft/deleting
  // an expired status, and the per-kind "skip entirely if the final
  // number is <= 0" gate (enemy ticks never had that gate; player/ally
  // ticks did, checked AFTER their own reduction below -- so the gate
  // moved to read dmgInfo.edmg, post-formula, not the pre-formula raw
  // value, to match exactly).
  tickBurnEnemy(actor, target, action, ctx, hitInfo) {
    const creature = target.ref.creatureObj;
    const edmg = hasEffect(creature, "dra_e08_ashward") ? Math.round(action.rawDmg * 0.75) : action.rawDmg;
    return { shortCircuit: false, edmg, kind: "fire" };
  },
  tickBleedEnemy(actor, target, action, ctx, hitInfo) {
    return { shortCircuit: false, edmg: action.rawDmg, kind: "bleed" };
  },
  // Heatproof (halves Burning specifically) is the player-side status
  // tick's only final-number adjustment, moved verbatim out of
  // tickPlayerStatuses -- statusDamageType (combat.js) picks the
  // Injury System v0.2 hit-type key from the status's own id, same as
  // the original's own call.
  tickStatusPlayer(actor, target, action, ctx, hitInfo) {
    const state = ctx.state;
    let edmg = action.rawDmg;
    if (action.key === "burning" && hasEffect(state, "heatproof")) edmg = Math.floor(edmg / 2);
    return { shortCircuit: false, edmg, kind: statusDamageType(action.key) };
  },
  // The ally-kit vulnerability multiplier (e.g. a kit whose own weakness
  // table marks a status as extra-dangerous) is the ally-side status
  // tick's only final-number adjustment, moved verbatim out of
  // tickAllyStatuses.
  tickStatusAlly(actor, target, action, ctx, hitInfo) {
    const ally = target.ref;
    const def = ALLY_DEFS[ally.defId];
    const vulnerability = def && def.abilityKit && def.abilityKit.vulnerability;
    let edmg = action.rawDmg;
    if (vulnerability && vulnerability.statuses.includes(action.key)) edmg = Math.round(edmg * vulnerability.multiplier);
    return { shortCircuit: false, edmg, kind: "physical" };
  },
};
