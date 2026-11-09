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
};

// ---- formula table: today's formulas only, no new math. Resolved by
// NAME (a string on the definition), never by action identity. ----
const PIPELINE_FORMULAS = {
  // Every player action shares this one core (rollPlayerDamageCoreForPipeline,
  // pipeline.js) -- isSpell is decided internally by the formula itself
  // (state.flags.isMage && state.primaryElement), not per-action, so
  // there's only one real player-side formula today, not a physical/spell
  // pair at the action level.
  playerCore: (actor, target, ctx, activeElement) => rollPlayerDamageCoreForPipeline(actor, target, ctx, activeElement),
};
