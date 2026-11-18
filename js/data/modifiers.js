/*
 * FRAGMENTA — Combat Rebuild Phase 2: the Modifier Registry.
 * Spec: tools/combat_rebuild_phase2_spec.md. Amendment 1 (18 Nov):
 * tools/combat_rebuild_phase2_amendment1.md -- adds `behavior`/`params`/
 * `order` to the entry shape and `runHook()` dispatch, after step 2c
 * shipped entries that moved only a presence CHECK into the registry
 * while the actual behavior (the block, the miss chance, the stack
 * grant) stayed hardcoded to the player. That meant flipping R1 later
 * would do nothing for them, since the ally branch never asked. See
 * that file for the full rationale; this file implements it.
 * Catalogue of what migrates in here, step by step: tools/
 * modifier_catalogue.md.
 *
 * MODIFIERS entries migrate in, one pipeline step at a time, each
 * migration byte-identical to today's behavior (spec §5: "move first,
 * change later"). `holders` stays exactly what it is today for every
 * entry below -- R1/R2 (not any step so far) are what widen it.
 */

// The five pipeline steps (spec §3's own hook list), plus fight-lifecycle
// events. "stat.<key>" isn't listed literally — statHook(key) builds it
// per-stat, since there's one hook per stat key, not one "stat" hook.
const MOD_HOOKS = [
  "chooseAction", "chooseTargets",
  "rollToHit.attacker", "rollToHit.defender",
  "calculateDamage.outgoing", "calculateDamage.defenseIgnore", "calculateDamage.incoming",
  "applyAndReact.onHitDealt", "applyAndReact.onHitTaken", "applyAndReact.onMiss",
  "applyAndReact.onZeroDamage", "applyAndReact.onKill", "applyAndReact.onDowned",
  "applyAndReact.onStatusApplied",
  "fight.start", "round.start", "turn.start", "fight.end",
  "cheatDeath",
];
function statHook(key) { return `stat.${key}`; }
function isKnownHook(hook) { return MOD_HOOKS.includes(hook) || /^stat\.\w+$/.test(hook); }

// Spec §4's provisional buckets and caps. Values are PROVISIONAL — Phase
// 4 (budgets) tunes the actual numbers; Phase 2 only builds the
// mechanism. "crit" (always a single source — nothing to cap) and
// "variance" (swings both ways; capping only the top would make it a
// net loss) are deliberately uncapped, not missing.
const MOD_BUCKET_CAPS = {
  conditional: 1.00,
  stacking: 0.75,
  burst: 1.50,
  defenseIgnore: 1.00,
  incomingMitigation: 0.60,
};
const MOD_UNCAPPED_BUCKETS = new Set(["crit", "variance"]);
function isKnownBucket(bucket) { return bucket in MOD_BUCKET_CAPS || MOD_UNCAPPED_BUCKETS.has(bucket); }

// ---- behaviors (Amendment 1) ----
// A behavior is a named function in MODIFIER_BEHAVIORS (same pattern as
// Phase 1's PIPELINE_HOOKS: dispatched by NAME, never called directly).
// It receives (ctx, entry, holderState) and may read/write holderState
// freely (that's the one place an entry is allowed to mutate — `when`
// stays pure, same rule as before). A purely numeric entry (a flat
// stat/accuracy bonus, a multiplier) doesn't need a behavior at all —
// it keeps using `value`/`bucket`, and runHook treats a bare `value` as
// if it were a side-effect-free behavior that just returns that number.
const MODIFIER_BEHAVIORS = {};
function registerBehavior(name, fn) {
  if (MODIFIER_BEHAVIORS[name]) throw new Error(`modifiers.js: duplicate behavior "${name}"`);
  MODIFIER_BEHAVIORS[name] = fn;
}

// ---- the registry itself ----
// Keyed "kind:id" ("effect:executioner", "set:Legion:6",
// "passive:cornered", "status:chilled", "item:hadrian_roll_of_the_ferratum").
// Entry shape (spec §3 + Amendment 1):
//   {
//     source: { kind: "effect"|"set"|"passive"|"status"|"item"|"skill", id, ... },
//     hook: "calculateDamage.outgoing" | statHook("atk") | ...,
//     order: number,            // NEW — run order within the hook; preserves today's sequence/Math.random() call order
//     bucket: "conditional" | "stacking" | "burst" | "crit" | "variance"
//             | "defenseIgnore" | "incomingMitigation" | null,  // for purely numeric damage/defense multipliers
//     value: number | (ctx) => number | null,    // pure; the whole point for a purely numeric entry
//     behavior: "<name in MODIFIER_BEHAVIORS>" | null,  // NEW — for anything with a block/chance/one-shot/stack-grant shape value/bucket can't express
//     params: { ... } | null,   // NEW — static data `behavior` reads (a line of text, a chance, a cap)
//     sharedStateKey: "string" | null,  // NEW — when two different ids are gated by ONE shared flag today (Calculated Aim/Concealed Edge); defaults to the entry's own registry key
//     when: null | (ctx) => boolean,    // pure, optional
//     holders: ["player"] | ["player","ally"] | ["player","ally","enemy"] | ["<specific id>"],
//     state: null | { ... },    // the INITIAL shape of this entry's per-fight state; the LIVE copy lives on the holder's own store (modifierStateFor), not here
//     notes: "string",
//   }
// Every entry needs EITHER `behavior` OR a non-null `value` — an entry
// with neither is "presence-only" (Amendment 1's own diagnosis of 2b/2c's
// first pass) and doesn't actually do anything when R1/R2 widen its
// holders. tools/audit.js's M3 flags that as a warning.
const MODIFIERS = {};

function registerModifier(key, entry) {
  if (MODIFIERS[key]) throw new Error(`modifiers.js: duplicate key "${key}"`);
  if (!entry.source || !entry.source.kind) throw new Error(`modifiers.js: "${key}" has no source.kind`);
  if (!isKnownHook(entry.hook)) throw new Error(`modifiers.js: "${key}" has an unknown hook "${entry.hook}"`);
  if (!Array.isArray(entry.holders) || !entry.holders.length) throw new Error(`modifiers.js: "${key}" has no holders`);
  if (entry.bucket != null && !isKnownBucket(entry.bucket)) throw new Error(`modifiers.js: "${key}" has an unknown bucket "${entry.bucket}"`);
  if (entry.behavior != null && !MODIFIER_BEHAVIORS[entry.behavior]) throw new Error(`modifiers.js: "${key}" names an unknown behavior "${entry.behavior}"`);
  MODIFIERS[key] = entry;
}

// ---- holder lookup ----
// `holder` is the real storage object hasEffect()/hasSetTier() already
// read today — `state` for the player, an ally record, or an enemy's
// creatureObj/slot — NEVER the combatant VIEW from combatant.js (Phase
// 1, step 1a; see its own file header). Reuses those two functions
// unchanged rather than re-walking equipment a second way.
function sourceActiveOn(holder, source) {
  switch (source.kind) {
    case "effect": return hasEffect(holder, source.id);
    case "set": return hasSetTier(holder, source.setName, source.tier);
    case "passive": return Array.isArray(holder.passives) && holder.passives.includes(source.id);
    case "status": return !!(holder.statuses && holder.statuses[source.id]);
    // Named-item/lore rules (kind D): holderId pins it to one character;
    // refined per-entry once 2b+ actually authors one (Hadrian's Roll of
    // the Ferratum, Astra Sa'Lahru's Broken Crest — see the catalogue).
    case "item": return holder.id === source.holderId;
    case "skill": return false; // reserved for Player Skills — nothing authored in Phase 2
    default: return false;
  }
}

// Every registered entry whose source is present on `holder` AND whose
// `holders` list includes `holderRole` ("player"/"ally"/"enemy") or
// `holder.id` (for a kind-D entry pinned to one specific character).
// `holders` is exactly what switches R1/R2 (spec §5) widen — reading it
// here instead of hardcoding "player" at each call site is the point.
function modifiersFor(holder, holderRole) {
  if (!holder) return [];
  return Object.values(MODIFIERS).filter((entry) => {
    if (!sourceActiveOn(holder, entry.source)) return false;
    return entry.holders.includes(holderRole) || entry.holders.includes(holder.id);
  });
}

// modifiersFor's result narrowed to one hook, then further narrowed by
// each entry's own `when` (if any), sorted by `order`. The list form
// behind runHook() below.
function modifiersForHook(holder, holderRole, hook, ctx) {
  return modifiersFor(holder, holderRole)
    .filter((entry) => entry.hook === hook && (typeof entry.when !== "function" || entry.when(ctx)))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// ---- per-fight state (Amendment 1) ----
// An entry's live state lives on the HOLDER's own fight-scoped store,
// not in the registry (which is shared/static data, not per-fighter).
// For the player that's state.combat.player (the object Phase 1 step
// 1h-iii rebuilds fresh every fight — `holder` itself, `state`, persists
// ACROSS fights, since equipment/stats do); for an ally or enemy, their
// per-fight flags already live directly on their own record/creatureObj
// today, so that record IS both the equipment-holder and the fight-
// state host. Nothing needs to explicitly reset modifierState for the
// player or an enemy (both get a fresh container object each fight);
// an ally's modifierState would need an explicit per-fight clear once
// R1 actually widens holders to include "ally" for a stateful entry —
// not needed yet, since no entry's holders include "ally" today.
function modifierStateHost(holder, holderRole) {
  if (holderRole === "player" && holder && holder.combat) return holder.combat.player;
  return holder;
}
function modifierStateFor(holder, holderRole, key, entry) {
  const host = modifierStateHost(holder, holderRole);
  if (!host.modifierState) host.modifierState = {};
  const stateKey = entry.sharedStateKey || key;
  if (!(stateKey in host.modifierState)) {
    host.modifierState[stateKey] = entry.state ? JSON.parse(JSON.stringify(entry.state)) : {};
  }
  return host.modifierState[stateKey];
}
// For a behavior whose state includes a cooldown ticked once per round
// OUTSIDE rollToHit itself (Timeless Guard) — called from wherever that
// per-round tick already lives, in place of decrementing a bespoke
// combat.player.<field> directly.
function tickModifierCooldown(holder, holderRole, key) {
  const entry = MODIFIERS[key];
  const st = modifierStateFor(holder, holderRole, key, entry);
  if ((st.cooldown || 0) > 0) st.cooldown -= 1;
}

// ---- dispatch (Amendment 1): runHook, not a bespoke lookup per effect ----
// Calls every entry matching `hook` for `holder`-as-`holderRole`, in
// `order`, for the fighter ACTUALLY involved (the defender in
// rollToHit.defender, the attacker in rollToHit.attacker, ...). A bare
// `value` entry (no `behavior`) contributes that number with no state
// access. A `behavior` entry gets its own per-fight state resolved via
// modifierStateFor and may return anything the CALLER'S convention
// expects -- by shared convention in this codebase: a plain number
// (summed by callers that want a total bonus, e.g. rollToHit.attacker),
// or `{ stop: true, ... }` (the signal a "first one that fires wins,
// stop evaluating the rest" chain uses, e.g. rollToHit.defender's miss
// chain — matching today's sequential if/return structure AND its
// Math.random() call order, since a later entry is never even reached
// once an earlier one stops the chain).
function runHook(hook, holder, holderRole, ctx) {
  if (!holder) return [];
  const entries = modifiersForHook(holder, holderRole, hook, ctx);
  const results = [];
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    let result;
    if (entry.behavior) {
      const holderState = modifierStateFor(holder, holderRole, key, entry);
      result = MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState);
    } else if (entry.value != null) {
      result = typeof entry.value === "function" ? entry.value(ctx) : entry.value;
    }
    results.push({ key, entry, result });
    if (result && typeof result === "object" && result.stop) break;
  }
  return results;
}
// rollToHit.defender's own convention: the first result shaped
// { stop: true, miss: line }, or null if nothing fired.
function firstStop(results) {
  const hit = results.find((r) => r.result && typeof r.result === "object" && r.result.stop);
  return hit ? hit.result : null;
}
// rollToHit.attacker's own convention: sum every plain-number result.
function sumNumeric(results) {
  return results.reduce((sum, r) => sum + (typeof r.result === "number" ? r.result : 0), 0);
}

// §4: sums one bucket's entries (already narrowed to one hook/target)
// and applies its cap, if any. Returns the bucket's own ADDITIVE total
// (e.g. a "conditional" bucket summing to 0.45 means that bucket
// contributes ×1.45) — multiplying bucket totals together is the
// caller's job (calculateDamage.outgoing's own leaf function, 2d).
function sumBucket(entries, bucketName, ctx) {
  const inBucket = entries.filter((e) => e.bucket === bucketName);
  let sum = 0;
  for (const e of inBucket) sum += typeof e.value === "function" ? e.value(ctx) : e.value;
  if (!MOD_UNCAPPED_BUCKETS.has(bucketName) && bucketName in MOD_BUCKET_CAPS) {
    sum = Math.min(sum, MOD_BUCKET_CAPS[bucketName]);
  }
  return sum;
}

// Deprecated (Amendment 1): a presence-only check with a hard-coded
// role, the shape 2b/2c's first pass used before this amendment. Kept
// defined (nothing calls it as of this rework) but superseded by
// runHook() for any new work -- a presence-only entry can't do anything
// when R1/R2 widen its holders, since there's no behavior/value for the
// widened holder to actually receive.
function hasModifier(holder, holderRole, key) {
  const entry = MODIFIERS[key];
  if (!entry || !holder) return false;
  if (!sourceActiveOn(holder, entry.source)) return false;
  return entry.holders.includes(holderRole) || entry.holders.includes(holder.id);
}

// ================= Behaviors =================

// stat.def (2b, reworked under Amendment 1): floors a Defense REDUCTION
// at some percentage of the unreduced base. ctx = { base, reduced }.
registerBehavior("defenseReductionFloor", (ctx, entry) => Math.max(ctx.reduced, Math.round(ctx.base * entry.params.floorPct)));

// rollToHit.defender, "miss" phase: blocks the hit outright, once per
// fight, no roll. params: { line }.
registerBehavior("blockFirstHitOncePerFight", (ctx, entry, state) => {
  if (state.used) return null;
  state.used = true;
  return { stop: true, miss: entry.params.line };
});
// Same, but the one-shot is a CHANCE, not a guarantee -- the "used" flag
// is still consumed on the attempt even when the roll fails (matches
// Guided Footsteps' own original ordering exactly). params: { chance, line }.
registerBehavior("blockChanceOncePerFight", (ctx, entry, state) => {
  if (state.used) return null;
  state.used = true;
  if (Math.random() < entry.params.chance) return { stop: true, miss: entry.params.line };
  return null;
});
// A flat chance, every hit, no one-shot gate at all. params: { chance, line }.
registerBehavior("blockFlatChance", (ctx, entry) => {
  if (Math.random() < entry.params.chance) return { stop: true, miss: entry.params.line };
  return null;
});
// Same block-outright shape as blockFirstHitOncePerFight, but gated by
// a cooldown (ticked externally via tickModifierCooldown) instead of a
// single per-fight use. params: { cooldown, line }.
registerBehavior("cooldownGatedBlock", (ctx, entry, state) => {
  if ((state.cooldown || 0) > 0) return null;
  state.cooldown = entry.params.cooldown;
  return { stop: true, miss: entry.params.line };
});
// rollToHit.defender, "evasion" phase: a successful evasion (decided
// independently, outside this entry) grants a capped stat stack. No
// stop -- this never decides the miss itself, it only reacts to one
// already having happened. params: { statKey, amount, max }.
registerBehavior("grantStatStackOnEvasion", (ctx, entry, state) => {
  state.stacks = Math.min(entry.params.max, (state.stacks || 0) + entry.params.amount);
  return null;
});

// rollToHit.attacker: a flat accuracy bonus, once per fight, shared
// across every entry that points at the same sharedStateKey (Calculated
// Aim / Concealed Edge gate ONE shared flag today, not one each).
// params: { bonus }.
registerBehavior("oncePerFightFlatBonus", (ctx, entry, state) => {
  if (state.used) return 0;
  state.used = true;
  return entry.params.bonus;
});

// ================= Entries =================

// ---- 2b: stat() internals ----
// Dispatched via applyStatDefFloor (below) for whichever fighter's
// Defense is being read -- effectivePlayerDef (combat.js),
// effectiveAllyDef (companion.js), and stat()'s enemy "def" case
// (combatant.js) all call it. `holders` stays ["player"] today, so only
// effectivePlayerDef's call ever actually matches; the other two are
// wired for R1/R2, not yet live. Corrected 16 Nov: EFFECT_DEFS.bedrock's
// own description used to call this "Currently inert" -- wrong, several
// enemy abilities/statuses do reduce the player's effective Defense
// (Shield Crush, Spatial Fracture, Off Balance, ...), so it's live.
registerModifier("effect:bedrock", {
  source: { kind: "effect", id: "bedrock" },
  hook: statHook("def"), order: 10, bucket: null, value: null,
  behavior: "defenseReductionFloor", params: { floorPct: 0.75 },
  when: null, holders: ["player"], state: null,
  notes: "Bedrock (Regalia). Floors a Defense reduction at 75% of unreduced base.",
});

// Shared by every stat.def caller (combat.js/companion.js/combatant.js):
// runs the hook for whichever holder/role is reading Defense, and
// returns either the first behavior's floored value or the unfloored
// `reduced` unchanged if nothing matched (today's exact fallback).
function applyStatDefFloor(holder, holderRole, base, reduced) {
  const results = runHook(statHook("def"), holder, holderRole, { base, reduced });
  for (const r of results) if (typeof r.result === "number") return r.result;
  return reduced;
}

// ---- 2c: rollToHit (defender side), reworked under Amendment 1 ----
// All 7 "miss chain" / evasion-reaction entries below are dispatched
// from pipeline.js's rollToHit for BOTH the enemy-attacking-player and
// enemy-attacking-ally branches (ctx.phase picks which sub-chain an
// entry belongs to -- "miss" runs BEFORE evasion-charge consumption,
// "evasion" runs only once an evasion has already succeeded, matching
// today's exact sequencing and Math.random() call order). `holders`
// stays ["player"] for all 7, matching today exactly (asymmetry
// register, kind B) -- the ally branch's call finds no match today, so
// nothing changes for allies yet; R1 is what would widen holders.
registerModifier("effect:timeless_guard", {
  source: { kind: "effect", id: "timeless_guard" }, hook: "rollToHit.defender", order: 10,
  bucket: null, value: null, behavior: "cooldownGatedBlock",
  params: { cooldown: 3, line: "Timeless Guard — for a moment, time itself refuses to let the blow land." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: { cooldown: 0 },
  notes: "Timeless Guard. Cooldown ticked by tickModifierCooldown, called from the same per-round tick site the old combat.player.timelessGuardCooldown field used.",
});
registerModifier("effect:guardian_spirit", {
  source: { kind: "effect", id: "guardian_spirit" }, hook: "rollToHit.defender", order: 20,
  bucket: null, value: null, behavior: "blockFirstHitOncePerFight",
  params: { line: "Guardian Spirit turns the first blow aside completely." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: { used: false },
  notes: "Guardian Spirit.",
});
registerModifier("effect:guided_footsteps", {
  source: { kind: "effect", id: "guided_footsteps" }, hook: "rollToHit.defender", order: 30,
  bucket: null, value: null, behavior: "blockChanceOncePerFight",
  params: { chance: 0.75, line: "Guided Footsteps — you're already a step from where it lands." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: { used: false },
  notes: "Guided Footsteps.",
});
registerModifier("effect:never_where_expected", {
  source: { kind: "effect", id: "never_where_expected" }, hook: "rollToHit.defender", order: 40,
  bucket: null, value: null, behavior: "blockFlatChance",
  params: { chance: 0.15, line: "Never Where Expected — it swings, and finds nothing there." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: null,
  notes: "Never Where Expected. Flat chance every hit, no once-per-fight gate. Corrected in the 2a catalogue's REVIEW pass: previously miscatalogued as rollToHit.attacker.",
});
registerModifier("set:Regalia of the Endless Horizon:2", {
  source: { kind: "set", id: "Regalia of the Endless Horizon:2", setName: "Regalia of the Endless Horizon", tier: 2 },
  hook: "rollToHit.defender", order: 50, bucket: null, value: null, behavior: "blockFlatChance",
  params: { chance: 0.15, line: "Blessing of Freedom carries you clear of the blow." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: null,
  notes: "Blessing of Freedom. Same behavior as Never Where Expected, reused rather than redefined.",
});
registerModifier("effect:evasive_guard", {
  source: { kind: "effect", id: "evasive_guard" }, hook: "rollToHit.defender", order: 60,
  bucket: null, value: null, behavior: "grantStatStackOnEvasion",
  params: { statKey: "def", amount: 1, max: 3 },
  when: (ctx) => ctx.phase === "evasion", holders: ["player"], state: { stacks: 0 },
  notes: "Evasive Guard (kind B, asymmetry register). Fires only once an evasion has already succeeded; grants +1 Defense per success, capped +3. effectivePlayerDef reads this entry's own state.stacks instead of the old combat.player.evasiveGuardBonus field.",
});
registerModifier("set:River Warden:6", {
  source: { kind: "set", id: "River Warden:6", setName: "River Warden", tier: 6 },
  hook: "rollToHit.defender", order: 70, bucket: null, value: null, behavior: "grantStatStackOnEvasion",
  params: { statKey: "magic", amount: 2, max: 8 },
  when: (ctx) => ctx.phase === "evasion" && !!(ctx.creature && ctx.creature.element), holders: ["player"], state: { stacks: 0 },
  notes: "River Warden 6pc. Same behavior as Evasive Guard, gated additionally on the incoming hit being magical. Grants +2 Magic per success, capped +8. The player's own Magic total reads this entry's own state.stacks instead of the old combat.player.riverWardenMagicBonus field.",
});

// ---- 2c (missed in the first pass): rollToHit (attacker side), enemy-
// as-attacker accuracy gear. All 4 dispatched from the SAME rollToHit
// for both the enemy-attacking-player and enemy-attacking-ally
// branches. `holders: ["enemy"]` matches today exactly -- only an enemy
// creature's own gear grants these, never the player's.
registerModifier("effect:sang_cu_ie007_duelists_measure", {
  source: { kind: "effect", id: "sang_cu_ie007_duelists_measure" }, hook: "rollToHit.attacker", order: 10,
  bucket: null, value: 10, behavior: null,
  when: (ctx) => ctx.creature.duelistMeasurePendingTarget === ctx.targetName,
  holders: ["enemy"], state: null,
  notes: "Duelist's Measure. Pure value+when -- the unconditional creature.duelistMeasurePendingTarget=null reset stays inline in rollToHit regardless of whether this fires (today's code clears it even for a creature that doesn't wear this at all).",
});
registerModifier("effect:sang_mil_ie003_calculated_aim", {
  source: { kind: "effect", id: "sang_mil_ie003_calculated_aim" }, hook: "rollToHit.attacker", order: 20,
  bucket: null, value: null, behavior: "oncePerFightFlatBonus", params: { bonus: 8 },
  sharedStateKey: "enemy:calculatedAim", when: null, holders: ["enemy"], state: { used: false },
  notes: "Calculated Aim. Shares its once-per-fight 'used' flag with Concealed Edge (sang_iag_ie007_concealed_edge) via sharedStateKey -- today's code gates both ids behind ONE creature.calculatedAimUsed flag, so a creature wearing both doesn't double-fire.",
});
registerModifier("effect:sang_iag_ie007_concealed_edge", {
  source: { kind: "effect", id: "sang_iag_ie007_concealed_edge" }, hook: "rollToHit.attacker", order: 21,
  bucket: null, value: null, behavior: "oncePerFightFlatBonus", params: { bonus: 8 },
  sharedStateKey: "enemy:calculatedAim", when: null, holders: ["enemy"], state: { used: false },
  notes: "Concealed Edge. Same shared flag as Calculated Aim -- see that entry's notes.",
});
registerModifier("effect:sang_iag_ie003_measured_aim", {
  source: { kind: "effect", id: "sang_iag_ie003_measured_aim" }, hook: "rollToHit.attacker", order: 30,
  bucket: null, value: 8, behavior: null,
  when: (ctx) => (ctx.creature.bankedAttackAccBonusTurnsLeft || 0) > 0,
  holders: ["enemy"], state: null,
  notes: "Measured Aim. Pure value+when -- the unconditional bankedAttackAccBonus*/TurnsLeft zeroing (a DIFFERENT, unrelated 'prepared state' mechanic) stays inline in rollToHit regardless of whether this fires.",
});
