/*
 * FRAGMENTA — Elemental Abilities
 * One signature Knowledge-gated ability per element — the mage parallel
 * to the fighter's Feint/Decoy/Ambush/Disarm, and REPLACES that tactics
 * menu entirely for mage-flagged characters rather than stacking on top
 * of it (a mage's toolkit is built around their element, not a generic
 * skillset). At level 15, opening a second element (see engine/state.js
 * gainXp) unlocks that element's ability too, not just attack flavor.
 *
 * This is still v1 scope: one ability each, single Knowledge threshold,
 * no elemental synergy (planned for later once this has been played).
 * Resolution logic lives in engine/combat.js (useElementAbility).
 */

// A pipelined element's own miss line, one-line each -- the shared
// factory just saves repeating actorKinds/actionType/toHit/etc across
// all 7 (earth/Stoneskin has none of this: it's a no-target, no-damage
// self-buff, same shape as Feint -- its own `action` block, added
// separately below, is the smaller buff-shaped kind, not this one).
// damageType is this element's own fixed hit type (D1): without it,
// resolveDamageType (js/data/damagetypes.js) falls through past the
// absent `action.damageType` straight to the caster's own equipped
// weapon type -- meaning Ignite would deal whatever damage type your
// sword happens to be instead of Fire. "transportation" (the table's
// own stable key -- A4, never renamed for storage) maps to the
// roster's actual member, "spatial" (DAMAGE_TYPES_FAMILIES), via
// elementKeyToDamageType.
function pipelinedElementAction(missLine, elementOnHit, extra, damageType) {
  return Object.assign({
    actorKinds: ["player"], actionType: "elemental", usesPerfectMemory: true, consumesTrailblazer: true,
    targeting: "singleEnemy", toHit: "roll", formula: "playerCore", usesOrchestratorDmgMult: true, reportPhysical: "always",
    missLine: (state, creature) => [missLine(creature)],
    elementOnHit, damageType,
  }, extra || {});
}

const ELEMENT_ABILITIES = {
  fire: {
    name: "Ignite",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A burning strike that keeps dealing damage for several turns after.",
    action: pipelinedElementAction((creature) => `${ELEMENTS.fire.name}'s lance goes wide, the flame guttering out short of ${withThe(creature.name, false)}.`, "fireOnHit", null, "fire"),
  },
  water: {
    name: "Torrent",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A crushing strike of compressed water that also mends your wounds.",
    action: pipelinedElementAction((creature) => `The wave crashes past ${withThe(creature.name, false)}, missing entirely.`, "waterOnHit", null, "water"),
  },
  earth: {
    name: "Stoneskin",
    knowledgeReq: 10,
    cooldown: 4,
    description: "Harden your body against all harm, magical or physical, for several turns.",
    // No-target, no-damage self-buff -- see useElementAbility's own
    // header. Handled by the "toHit: none" buff-shaped resolver branch,
    // not the pipelinedElementAction shape above.
    action: { actorKinds: ["player"], actionType: "elemental", targeting: "self", usesPerfectMemory: true, consumesTrailblazer: true, toHit: "none", damage: null },
  },
  lightning: {
    name: "Flurry",
    knowledgeReq: 10,
    cooldown: 3,
    description: "Two strikes faster than the eye can follow.",
    action: pipelinedElementAction((creature) => `The bolt arcs past ${withThe(creature.name, false)} without connecting.`, "lightningOnHit", null, "lightning"),
  },
  acid: {
    name: "Corrode",
    knowledgeReq: 10,
    cooldown: 2,
    description: "Dissolve your target's defenses permanently — once per target, per fight.",
    action: pipelinedElementAction((creature) => `The acid splashes wide, missing ${withThe(creature.name, false)} entirely.`, "acidOnHit", null, "acid"),
  },
  force: {
    name: "Concuss",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A blow that knocks the fight out of them — they lose their next action.",
    action: pipelinedElementAction((creature) => `The wall of force passes ${withThe(creature.name, false)} by.`, "forceOnHit", null, "force"),
  },
  transportation: {
    name: "Blink",
    knowledgeReq: 10,
    cooldown: 2,
    description: "Teleport in for a free strike, no opening required, no cooldown-limited window.",
    action: pipelinedElementAction((creature) => `You reappear a beat too far from ${withThe(creature.name, false)} to land the strike.`, "transportationOnHit", { extraElementMultiplier: 1.3 }, "spatial"),
  },
  air: {
    name: "Windcut",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A cutting blade of compressed air that leaves you harder to hit for a few turns.",
    action: pipelinedElementAction((creature) => `The gust tears past ${withThe(creature.name, false)}, missing.`, "airOnHit", null, "air"),
  },
  // A3 (Tyler 13 Nov, approved): Frost's own signature -- "Rime" is a
  // working name, Narrative owns the real one. Same build-up rule
  // enemies already use on the player (Chilled -> Frozen on a second
  // application while already Chilled): frostOnHit (js/data/actions.js's
  // PIPELINE_HOOKS) does the actual escalation.
  frost: {
    name: "Rime",
    knowledgeReq: 10,
    cooldown: 3,
    description: "A lance of killing cold that locks up whatever it hits -- cast it again on a target that's already Chilled, and it freezes solid.",
    action: pipelinedElementAction((creature) => `The frost shatters short of ${withThe(creature.name, false)}, missing.`, "frostOnHit", null, "frost"),
  },
};

// Verb names mapped back to element ids, for command routing.
const ELEMENT_VERB_TO_KEY = Object.fromEntries(
  Object.entries(ELEMENT_ABILITIES).map(([key, a]) => [a.name.toLowerCase(), key])
);
