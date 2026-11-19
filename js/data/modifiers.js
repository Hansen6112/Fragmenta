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
  "calculateDamage.tags", "calculateDamage.cap",
  "applyAndReact.onHitDealt", "applyAndReact.onHitTaken", "applyAndReact.onMiss",
  "applyAndReact.onZeroDamage", "applyAndReact.onKill", "applyAndReact.onDowned",
  "applyAndReact.onStatusApplied",
  "fight.start", "round.start", "turn.start", "fight.end",
  "cheatDeath",
  // statusTick.incoming (2d increment 3, Tyler 19 Nov, Bucket Review §3):
  // Ashward's own home -- a DoT-style status reduction read when a status
  // ticks, not a damage-roll multiplier, so it's its own hook rather than
  // calculateDamage.incoming. Reserved here; not dispatched yet.
  "statusTick.incoming",
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
    // A mechanic that is its own composite gate across several pieces of
    // gear (2d: crit, which blends Regalia of the Woven Thread:2/Endless
    // Archive:2/Laughing Gale:2's own chances into ONE roll -- splitting
    // that into 3 separate entries, each with its OWN roll, would change
    // the odds, not just relocate the check) and has no single
    // hasEffect/hasSetTier presence of its own to test. The entry's own
    // behavior/value function does its own, already-correct gating
    // internally (by delegating to the unchanged original function), so
    // this is never false -- `holders` is still what scopes it to the
    // player today.
    case "always": return true;
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

// NOTE: sumBucket (above) is R3's own future tool -- it applies §4's
// caps unconditionally, which 2d must NOT do yet (spec step 2d:
// "combined by the legacy product while R3 is off"). The function below
// is the one 2d's own call sites actually use.
//
// calculateDamage.outgoing (2d): combines every active entry's own
// resolved number EXACTLY the way today's code does -- a flat product
// of independent factors, one per entry, in `order`. Buckets are
// recorded as data (future R3 reads them to sum-then-cap instead), but
// they don't change the COMBINATION yet. An entry in the "crit" or
// "variance" bucket contributes its own resolved number AS the factor
// itself (today's critMult/loadedDiceMult/chaosMult are already raw
// multipliers -- 1 when inactive); every other bucket contributes
// (1 + resolved number), matching today's "+20%"-style effects. An
// entry with `upgrades` set never contributes its own factor (Rule 1 --
// not used by any 2d entry yet, but kept consistent with the catalogue's
// own documented mechanism for when one is). Returns both the overall
// product and a per-key breakdown: a couple of callers (Blessing of
// Fortune/Avatar of Chaos's own crit-stacks, grown right after the roll)
// need to know whether THIS ONE entry's factor exceeded 1, not just the
// total.
const CRIT_MODIFIER_KEY = "always:crit";
function calculateOutgoingMultiplier(holder, holderRole, ctx) {
  // Filters BEFORE invoking any value/behavior, not after (unlike this
  // function's own pre-2d-close-out shape, which called runHook and
  // only skipped `lateOutgoingPhase`/`elementCastPhase` entries once
  // aggregating the total -- too late, since runHook had ALREADY run
  // every matching entry's behavior by then. A late-phase behavior like
  // Opening Reach's own one-shot flag consumption would otherwise fire
  // on EVERY player hit this function is dispatched for, not just the
  // one call site that's actually supposed to trigger it -- caught by
  // the regression suite (snapshot mismatches on plain hits with no
  // gear at all) during this migration's own development.
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.outgoing", ctx)
    .filter((e) => !e.upgrades && !e.lateOutgoingPhase && !e.elementCastPhase);
  let total = 1;
  const byKey = {};
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    let result;
    if (entry.behavior) {
      const holderState = modifierStateFor(holder, holderRole, key, entry);
      result = MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState);
    } else if (entry.value != null) {
      result = typeof entry.value === "function" ? entry.value(ctx) : entry.value;
    }
    const v = typeof result === "number" ? result : 0;
    const factor = entry.bucket === "crit" || entry.bucket === "variance" ? v : 1 + v;
    byKey[key] = factor;
    total *= factor;
  }
  return { total, byKey };
}

// calculateDamage.outgoing, LATE phase (2d close-out, 19 Nov): some
// outgoing-bucket members are read AFTER the main damage roll already
// produced a number -- Opening Reach (a final multiplier tacked onto
// whatever dmg resulted, player/ally/enemy alike), Clash of Steel
// (folded into Riposte's own single combined Math.round, so this is
// seeded with the UNROUNDED pre-product rather than an already-rounded
// edmg), and the enemy's own ice_forged_edge/unbroken_grip/
// executioners_seal/black_ice_reserve/unquenched_focus/Tyrant's Edge
// chain inside enemyCore (dispatched once per branch, same sequential
// per-step-rounding shape calculateIncomingDamage already uses -- not
// this hook's own early flat product). Reuses threadIncomingEntries
// (originally built for calculateDamage.incoming) since the walk itself
// is identical; only the hook name and the `lateOutgoingPhase` filter
// differ.
// `group` lets several call sites share this hook's late phase without
// double-firing each other -- Opening Reach/Clash of Steel/the enemy's
// own wearer chain each dispatch only their own group. The enemy chain
// itself needs TWO groups, not one: in enemyCore's player-target flat
// branch, Decisive Impact (untouched, still inline, not part of this
// migration) sits BETWEEN unbroken_grip and executioners_seal today --
// splitting the five dra_e0X/Tyrant's Edge entries into "enemyWearer1"
// (ice_forged_edge, unbroken_grip) and "enemyWearer2" (executioners_seal,
// black_ice_reserve, Tyrant's Edge) lets Decisive Impact's own untouched
// position stay exactly where it is, between the two dispatch calls,
// rather than forcing it to move.
function calculateLateOutgoingMultiplier(holder, holderRole, ctx, group) {
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.outgoing", ctx).filter((e) => e.lateOutgoingPhase === group);
  return threadIncomingEntries(entries, ctx, holder, holderRole, ctx.edmg);
}

// calculateDamage.outgoing, ELEMENT-CAST phase (2d close-out, 19 Nov):
// Elemental Focus/Surging Conduit/Twin Rivers fold into the element
// ability's own `dmgMult` BEFORE the five-step pipeline even runs
// (useElementAbilityLegacy, pipeline.js) -- a flat, UNROUNDED product
// (today's `elementalDmgMult *= X`, never rounded until deep inside the
// pipeline's own final damage roll), same shape as this hook's early
// dispatch, just at an earlier, separate call site. Twin Rivers
// specifically MUST stay dispatched exactly here: it reads
// combat.player.lastElementUsed BEFORE this same function overwrites it
// for the current cast, so it cannot be folded into
// calculateOutgoingMultiplier's own later dispatch (inside
// rollPlayerDamageCoreForPipeline) without reading the wrong value.
function calculateElementCastMultiplier(holder, holderRole, ctx) {
  // Filters BEFORE invoking any value/behavior, not after -- same
  // runHook-invokes-everything bug calculateOutgoingMultiplier had: a
  // runHook call here would also invoke every OTHER calculateDamage.outgoing
  // entry at this holder/role (early dispatch, lateOutgoingPhase) with
  // this call site's minimal ctx, firing side effects (e.g. Opening
  // Reach's one-shot flag) on every element-ability cast, not just real
  // physical/late dispatch -- caught by the regression suite the same way.
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.outgoing", ctx)
    .filter((e) => e.elementCastPhase);
  let total = 1;
  const byKey = {};
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    let result;
    if (entry.behavior) {
      const holderState = modifierStateFor(holder, holderRole, key, entry);
      result = MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState);
    } else if (entry.value != null) {
      result = typeof entry.value === "function" ? entry.value(ctx) : entry.value;
    }
    const v = typeof result === "number" ? result : 1;
    byKey[key] = v;
    total *= v;
  }
  return { total, byKey };
}

// calculateDamage.defenseIgnore (2d, increment 2): same flat-product
// convention as calculateOutgoingMultiplier, but each entry's resolved
// number is the FRACTION of the target's Defense it ignores (0.5 =
// ignores half, 1 = ignores all) rather than an additive delta -- so the
// running total is a product of (1 - value), not (1 + value). An entry
// declared `flatAmount: true` (Armor Crack: a flat Defense SUBTRACTION,
// never a percentage multiplier -- it was never part of this product to
// begin with) is excluded here entirely; its own call site still reads
// it directly (armorCrackAmount(state), unchanged), same as today --
// this registry entry exists purely so the catalogue/audit has one.
function calculateDefenseIgnoreMultiplier(holder, holderRole, ctx) {
  const results = runHook("calculateDamage.defenseIgnore", holder, holderRole, ctx);
  let total = 1;
  const byKey = {};
  for (const r of results) {
    if (r.entry.upgrades || r.entry.flatAmount) continue;
    const v = typeof r.result === "number" ? r.result : 0;
    const factor = 1 - v;
    byKey[r.key] = factor;
    total *= factor;
  }
  return { total, byKey };
}

// calculateDamage.incoming (2d increment 3, Tyler 19 Nov): unlike
// outgoing/defenseIgnore (a single flat product, rounded once at the
// end), today's mitigateAndApplyHitOnPlayer rounds edmg after EVERY
// step -- Tyler's own ruling: "Ordered entries, rounding after each, are
// fine for the legacy mode. R3 replaces that with sum, cap, round once."
// So this threads edmg through each active entry in `order`, one at a
// time, re-reading ctx.edmg as the RUNNING total (not the original hit)
// before calling each entry's own value/behavior -- Shared Burden's own
// magnitude gate (dmg > 30% max Health) genuinely depends on this, not
// just today's incidental rounding.
//
// Most entries resolve a plain RATIO, same convention as the other two
// combinators (the caller does Math.round(edmg * ratio)). A few wrap an
// existing "apply(state, dmg) -> dmg" function verbatim (Shield Wall/
// Master Duelist/Unbroken Line already do their own Math.round
// internally) rather than having this combinator re-derive their ratio
// inline -- `directApply: true` on those entries means the behavior's
// own return IS the new edmg, not a ratio to multiply by.
// Shared sequential-threading loop behind both calculateIncomingDamage
// and calculateAbilityIncomingMultiplier (2d increment 3c) -- `entries`
// is already filtered/sorted by the caller (modifiersForHook), this just
// walks it, threading `edmg` through one entry at a time.
function threadIncomingEntries(entries, ctx, holder, holderRole, edmg) {
  const byKey = {};
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    ctx.edmg = edmg;
    let result;
    if (entry.behavior) {
      const holderState = modifierStateFor(holder, holderRole, key, entry);
      result = MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState);
    } else if (entry.value != null) {
      result = typeof entry.value === "function" ? entry.value(ctx) : entry.value;
    }
    if (entry.directApply) {
      edmg = typeof result === "number" ? result : edmg;
    } else {
      const v = typeof result === "number" ? result : 1;
      edmg = Math.round(edmg * v);
    }
    byKey[key] = edmg;
  }
  return { edmg, byKey };
}
function calculateIncomingDamage(holder, holderRole, ctx) {
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.incoming", ctx)
    .filter((e) => !e.upgrades && !e.abilityPhase); // Rule 1 skip (Spell Ward's own upgrade entries share this hook); abilityPhase entries (2d increment 3c -- Spell Ward/Storm Barrier/Stonewarden 6pc) are dispatched separately, earlier in the pipeline, by calculateAbilityIncomingMultiplier -- see that function's own header on why one hook needs two dispatch points.
  return threadIncomingEntries(entries, ctx, holder, holderRole, ctx.edmg);
}

// calculateDamage.incoming, ABILITY-PHASE variant (2d increment 3c,
// Tyler 19 Nov: "The ally-defender path dispatches too (Stonewarden 6pc
// and the other kind B effects)"). Spell Ward/Storm Barrier/Stonewarden
// 6pc live inside enemyCore itself (actions.js), computed BEFORE
// mitigateAndApplyHitOnPlayer's own chain ever runs on the resulting
// edmg (enemyCore's return value IS mitigateAndApplyHitOnPlayer's own
// `edmg` argument at its call sites) -- genuinely a separate, earlier
// dispatch point from calculateIncomingDamage's, not a different
// combinator shape (same sequential per-step rounding). `abilityPhase:
// true` on these three entries (and excluding them from
// calculateIncomingDamage, above) is what keeps the two dispatch points
// from double-firing each other's entries despite sharing one hook.
// `holders` includes BOTH "player" and "ally" -- enemyCore computes
// damage for either target with near-identical code, and Spell Ward/
// Storm Barrier/Stonewarden 6pc already applied to both before this
// migration (the ally-target branch is COMBAT_UNIFY.U1-gated, off by
// default, but the mechanism itself was never player-only).
function calculateAbilityIncomingMultiplier(holder, holderRole, ctx) {
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.incoming", ctx).filter((e) => e.abilityPhase);
  return threadIncomingEntries(entries, ctx, holder, holderRole, ctx.edmg);
}

// calculateDamage.cap (2d increment 3, Tyler 19 Nov): a damage-VALUE
// cap, not a percentage multiplier -- applied after every reduction AND
// the tag system (Rule 3: synergy/tags/caps sit outside the damage
// buckets, and are never themselves capped). "The first entry that
// actually caps wins" -- same first-stop shape as rollToHit.defender's
// miss chain -- since Unyielding Wall (player) and Perfect Fleshcraft
// (enemy) can never both be relevant to the same hit (different holder
// roles), but the shape generalizes if that ever changes. Every member
// is a `behavior` (not a bare value): both existing cap functions have a
// real state write (Unyielding Wall's cooldown) or read per-fight gear
// data (Perfect Fleshcraft's creature.passives), so there's no pure-math
// case for a plain value here yet.
function applyDamageCap(holder, holderRole, ctx) {
  const results = runHook("calculateDamage.cap", holder, holderRole, ctx);
  for (const r of results) if (typeof r.result === "number") return r.result;
  return ctx.edmg;
}

// statusTick.incoming (2d increment 3d, Tyler 19 Nov, Bucket Review §3):
// a DoT-tick damage reduction, read when a status tick resolves -- no
// attacker, no to-hit roll, so it's its own hook rather than reusing
// calculateDamage.incoming. Flat product (today's only member,
// Ashward, has no rounding of its own to preserve -- the one call site
// still does its own single Math.round, exactly as before). `holders`
// stays exactly what today's single call site already is -- per
// Tyler's own 19 Nov note, any WIDENING of who a migrated entry works
// for goes behind its own switch (R1/R2) and gets measured, never
// folded into a "pure move" migration; this one entry doesn't widen
// anything, so no switch is needed here.
function calculateStatusTickMultiplier(holder, holderRole, ctx) {
  const results = runHook("statusTick.incoming", holder, holderRole, ctx);
  let total = 1;
  for (const r of results) {
    if (r.entry.upgrades) continue;
    total *= typeof r.result === "number" ? r.result : 1;
  }
  return total;
}

// calculateDamage.incoming, ENEMY-as-defender variant (2d increment 3b,
// Tyler 19 Nov: "Sanguivorum -> the same calculateDamage.incoming hook,
// dispatched for any defender (player, ally, enemy), holders: ['enemy']").
// Same HOOK as the player's own chain, but a DIFFERENT combinator -- the
// legacy Sanguivorum mitigation (sangMit) is a flat, unrounded product of
// independent multipliers (today's code never rounds between them, only
// once, later, when sangMit is folded into the overall damage formula),
// not a sequential per-step-rounding chain -- same reasoning
// outgoing/defenseIgnore needed their own shape distinct from this
// hook's player-side combinator (calculateIncomingDamage). Returns the
// product directly (not {total, byKey}) since nothing downstream needs
// a per-key breakdown here, matching sangMit's own original shape.
function calculateEnemyIncomingMultiplier(holder, holderRole, ctx) {
  const results = runHook("calculateDamage.incoming", holder, holderRole, ctx);
  let total = 1;
  for (const r of results) {
    if (r.entry.upgrades) continue;
    total *= typeof r.result === "number" ? r.result : 1;
  }
  return total;
}

// ---- Rule 1 as data (Amendment 1 gap close, 19 Nov) ----
// A set tier that only RAISES another entry's own number (never adds a
// second, independent bonus) is an `upgrades` entry: its `upgrades`
// field names the tag it upgrades (by convention the base entry's own
// MODIFIERS key, e.g. "effect:crushing_impact" -- or, for a value that
// isn't itself a bucket-contributing number, like Executioner's HP%
// threshold, a virtual dotted tag with no entry of its own,
// "effect:executioner.threshold"). resolveUpgradedValue is the one place
// that folds every active upgrade for a tag into `base` -- Math.max for
// a multiplier/charge-count (bigger is stronger), Math.min for spell_ward
// (smaller is stronger: it's how much of the hit gets THROUGH). Never
// additive -- that's the whole point of Rule 1. `holders` on an upgrade
// entry is real and checked here (not a leftover) -- a set tier that's
// still player-only today (every one registered so far) simply won't
// match for an "ally"/"enemy" holderRole, same as any other entry.
function resolveUpgradedValue(tag, base, holder, holderRole, direction) {
  let best = base;
  for (const entry of Object.values(MODIFIERS)) {
    if (entry.upgrades !== tag) continue;
    if (!entry.holders.includes(holderRole) && !(holder && entry.holders.includes(holder.id))) continue;
    if (!sourceActiveOn(holder, entry.source)) continue;
    const v = typeof entry.value === "function" ? entry.value({ holder, role: holderRole }) : entry.value;
    best = direction === "min" ? Math.min(best, v) : Math.max(best, v);
  }
  return best;
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

// calculateDamage.tags: overrides the tag-driven multiplier dmgTagMultiplierForAttacker
// (js/data/damagetypes.js) would otherwise read off DAMAGE_TAG_MULTIPLIER,
// for a known ATTACKER's own hit (Fragmenta 6pc, approved 18 Nov --
// Phase 2 Bucket Review §4). Outside the damage buckets entirely (Rule
// 3, same as elemental synergy/damage-type tags generally), so this
// returns the final multiplier directly rather than contributing to a
// bucket sum -- no cap applies. ctx = { damageType, tag } (`tag`:
// already shifted by Avatar of Knowledge, if active, by the caller
// before this hook runs -- Fragmenta's override reads whatever tag
// comes out of that shift, exactly per the approved ruling's own
// worked example). Only `weak`/`resist` have a value to override;
// `normal`/`immune` fall through to null (the caller's own
// DAMAGE_TAG_MULTIPLIER fallback already gives the right 1/0).
// params: { weak, resist, nonPhysicalOnly }.
registerBehavior("tagValueOverride", (ctx, entry) => {
  if (entry.params.nonPhysicalOnly && damageFamily(ctx.damageType) === "physical") return null;
  if (ctx.tag === "weak" && entry.params.weak != null) return entry.params.weak;
  if (ctx.tag === "resist" && entry.params.resist != null) return entry.params.resist;
  return null;
});

// calculateDamage.outgoing (2d): the two outgoing entries that mutate
// state (critMultiplier/loadedDiceMultiplier both do, pre-existing,
// unrelated to this migration) delegate to their own unchanged function
// as a behavior rather than a bare value, since only a behavior is
// documented as allowed to write. Neither touches `holderState` --
// they write directly to ctx.state.combat.player, exactly as they
// always have.
registerBehavior("criticalHitRoll", (ctx) => critMultiplier(ctx.state, ctx.isSpell));
registerBehavior("loadedDiceRoll", (ctx) => loadedDiceMultiplier(ctx.state));

// calculateDamage.incoming (2d increment 3): Shield Wall/Master Duelist/
// Unbroken Line wrap their own existing "apply(holder, edmg) -> edmg"
// functions verbatim (directApply: true on their own entries -- see
// calculateIncomingDamage's own header) rather than having this
// combinator re-derive their ratio from scratch. Unbroken Line is the
// one with a real state write (hit counter / damage-reduction window
// grant); Shield Wall/Master Duelist reuse the same shape purely for
// consistency (their own math is a bare ratio, but wrapping the
// existing function is the same "move first" discipline every other
// entry in this file follows).
registerBehavior("shieldWallApply", (ctx) => applyShieldWall(ctx.holder, ctx.edmg));
registerBehavior("masterDuelistApply", (ctx) => applyMasterDuelist(ctx.holder, ctx.edmg));
registerBehavior("unbrokenLineApply", (ctx) => applyUnbrokenLine(ctx.holder, ctx.edmg));
// Prepared Response and Shared Burden both consume a one-shot per-fight
// flag (real, pre-existing state writes -- Shared Burden's is also
// gated on ctx.edmg, the RUNNING total at this point in the chain, not
// the original hit, which is exactly why calculateIncomingDamage
// re-reads ctx.edmg before calling each entry). Delegates to their own
// unchanged functions verbatim, same precedent as crit/loaded_dice.
registerBehavior("preparedResponseRatio", (ctx) => preparedResponseMultiplier(ctx.holder));
registerBehavior("sharedBurdenRatio", (ctx) => sharedBurdenMultiplier(ctx.holder, ctx.edmg));

// calculateDamage.cap: both members wrap their own existing unchanged
// cap function verbatim, same discipline as everything else in this
// file. Unyielding Wall's cooldown write and Perfect Fleshcraft's
// creature.passives read both stay exactly where they are.
registerBehavior("unyieldingWallCap", (ctx) => applyUnyieldingWall(ctx.holder, ctx.edmg));
registerBehavior("perfectFleshcraftCap", (ctx) => enemyDamageCapPctMaxHp(ctx.holder, ctx.edmg));

// calculateDamage.incoming, enemy-holder (2d increment 3b): each wraps
// its own existing unchanged function verbatim. `source: {kind:"always"}`
// (same composite-gate precedent as always:crit) because each one is
// already a shared mechanism across several item ids with no single
// hasEffect check of its own -- the behavior's own hasEffect/hasOneHit.../
// hasRepeatable... calls (inside the wrapped function) do the real
// gating. enemyAllyProtectionRatio is the one genuinely cross-creature
// member (a DIFFERENT enemy's own gear protects this one) -- it could
// never be expressed as "check source.id on the holder" at all, so
// `always` is the only fit, not just the simplest one.
registerBehavior("sangCuDefenderMitigationRatio", (ctx) => sangCuDefenderMitigation(ctx.holder));
registerBehavior("enemyOneHitMitigationRatio", (ctx) => enemyOneHitMitigationMultiplier(ctx.holder));
registerBehavior("enemyRepeatableMitigationRatio", (ctx) => enemyRepeatableMitigationMultiplier(ctx.holder));
registerBehavior("enemyAllyProtectionRatio", (ctx) => enemyAllyProtectionMultiplier(ctx.state, ctx.holder));

// calculateDamage.incoming, ability-phase (2d increment 3c): Storm
// Barrier/Stonewarden 6pc each consume a real one-shot per-fight flag
// that lives directly on the DEFENDER's own record today -- combat.player
// for the player, the ally record itself for an ally (never the
// registry's own modifierStateFor store, which isn't where these fields
// have ever lived) -- so each behavior resolves the right host by role
// rather than being handed it. `ctx.edmg <= 0` short-circuits WITHOUT
// consuming the flag, exactly matching today's `if (edmg > 0 && !...)`
// gate -- a zero-damage hit never spends the one-shot.
function abilityFlagHost(ctx) {
  return ctx.role === "player" ? ctx.holder.combat.player : ctx.holder;
}
registerBehavior("stormBarrierRatio", (ctx) => {
  const host = abilityFlagHost(ctx);
  if (ctx.edmg <= 0 || host.stormBarrierUsed) return 1;
  host.stormBarrierUsed = true;
  return hasSetTier(ctx.holder, "Stormwatch", 6) ? 0.5 : 1;
});
registerBehavior("firstHitTakenRatio", (ctx) => {
  const host = abilityFlagHost(ctx);
  if (ctx.edmg <= 0 || host.firstHitTakenUsed) return 1;
  host.firstHitTakenUsed = true;
  return hasSetTier(ctx.holder, "Stonewarden", 6) ? 0.75 : 1;
});
registerBehavior("spellWardRatio", (ctx) => spellWardMultiplier(ctx.holder, ctx.role));

// calculateDamage.outgoing, late phase (2d close-out): Opening Reach
// consumes a real one-shot per-fight flag (firstPhysicalAttackDone)
// regardless of whether the effect is equipped -- "a fact about the
// fight, not the gear," per applyOpeningReach's own original comment --
// so this is a behavior, not a bare value. `ctx.holder` is `state` for
// the player (whose own firstPhysicalAttackDone lives nested under
// state.combat.player, not on state itself) or the ally/enemy record
// directly for the generalized actor case -- same abilityFlagHost split
// stormBarrierRatio/firstHitTakenRatio already use, so no modifierStateFor
// is needed.
registerBehavior("openingReachRatio", (ctx) => {
  const host = abilityFlagHost(ctx);
  if (host.firstPhysicalAttackDone) return 1;
  host.firstPhysicalAttackDone = true;
  if (!hasEffect(ctx.holder, "opening_reach")) return 1;
  return ctx.role === "player" ? resolveUpgradedValue("effect:opening_reach", 1.15, ctx.holder, ctx.role, "max") : 1.15;
});
// calculateDamage.outgoing, late phase, enemy-holder (2d close-out): the
// dra_e0X/Tyrant's Edge chain inside enemyCore. Each wraps today's exact
// condition verbatim -- the state-mutating ones (unbroken_grip, Tyrant's
// Edge, unquenched_focus) consume their own one-shot/cooldown flags
// directly on `ctx.holder` (the enemy creature), exactly where they live
// today; none of this moves to modifierStateFor, since the field names
// (unbrokenGripUsed, tyrantsEdgeCooldown, ...) are read by other code
// too (tickEnemyPassives' own per-round cooldown decrement) and renaming
// them is out of scope for a "move the number" migration.
registerBehavior("unbrokenGripRatio", (ctx) => {
  if (ctx.edmg <= 0 || ctx.holder.unbrokenGripUsed) return 1;
  ctx.holder.unbrokenGripUsed = true;
  return 1.10;
});
registerBehavior("tyrantsEdgeRatio", (ctx) => {
  if (ctx.edmg <= 0) return 1;
  if (ctx.defenderHp > ctx.defenderMaxHp * 0.35) return 1;
  if (ctx.holder.tyrantsEdgeCooldown > 0 || (ctx.holder.tyrantsEdgeUses || 0) >= 2) return 1;
  ctx.holder.tyrantsEdgeCooldown = 3;
  ctx.holder.tyrantsEdgeUses = (ctx.holder.tyrantsEdgeUses || 0) + 1;
  return 1.10;
});
registerBehavior("unquenchedFocusRatio", (ctx) => {
  if (ctx.edmg <= 0 || ctx.holder.unquenchedFocusUsed) return 1;
  ctx.holder.unquenchedFocusUsed = true;
  return 1.10;
});
// calculateDamage.outgoing, element-cast phase (2d close-out): Surging
// Conduit consumes a per-fight charge count (combat.player.
// surgingConduitUsesLeft, initialized elsewhere at fight start -- out of
// this migration's scope) regardless of whether this specific cast
// would otherwise qualify; a behavior for the same reason as Opening
// Reach above.
registerBehavior("surgingConduitRatio", (ctx) => {
  if (!hasEffect(ctx.holder, "surging_conduit") || !(ctx.state.combat.player.surgingConduitUsesLeft > 0)) return 1;
  ctx.state.combat.player.surgingConduitUsesLeft -= 1;
  return 1.2;
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

// ---- Fragmenta 6pc tag override (approved fix, 18 Nov -- separate from
// step 2d). The original (js/data/matchups.js's elementMultiplier) only
// ever ran with DAMAGE_TYPES_V2 off, which the switch's own permanent
// `true` made dead the moment damage types went live (09d4131) -- this
// replacement is the tag-system equivalent the Bucket Review's §4
// approved: against the wearer's own non-physical hits, a target's Weak
// tag counts as 1.75x (was 1.5x) and Resist as 0.75x (was 0.5x). Read
// via dmgTagMultiplierForAttacker (js/data/damagetypes.js), which runs
// this hook for the attacker after resolving Avatar of Knowledge's own
// tag shift -- see that function's own header for the combined order.
registerModifier("set:Fragmenta:6", {
  source: { kind: "set", id: "Fragmenta:6", setName: "Fragmenta", tier: 6 },
  hook: "calculateDamage.tags", order: 10, bucket: null, value: null,
  behavior: "tagValueOverride", params: { weak: 1.75, resist: 0.75, nonPhysicalOnly: true },
  when: null, holders: ["player"], state: null,
  notes: "Fragmenta 6pc. Outside the buckets (Rule 3) -- see this file's own tagValueOverride behavior header. R1 widens holders later, like every other set bonus.",
});

// ---- 2d, increment 1: calculateDamage.outgoing -- the player's own
// rollPlayerDamage(combat.js)/rollPlayerDamageCoreForPipeline(pipeline.js)
// damage roll, the spec's own illustrative ×20.5 example (§1). Every
// entry below wraps an EXISTING, unchanged multiplier function (named or
// inline) verbatim -- this round changes WHERE each number comes from
// (the registry, via calculateOutgoingMultiplier), never HOW it's
// computed, so it's byte-identical by construction: same functions, same
// RNG call order (the `order` field matches today's left-to-right
// multiply chain exactly, both branches -- see that function's own
// header on why only relative order among entries that actually consume
// Math.random() matters). `ctx` at both call sites is
// { state, creature, isSpell, atk, effDef } -- `atk`/`effDef` only
// populated by the weapon branch, which is fine: every entry that reads
// them is itself `when`-gated to `!isSpell`, so it's never called
// without them.
//
// Scope: only the entries that were already PURE reads of existing,
// unchanged functions (or, for the two that aren't -- crit and loaded
// dice -- wrapped as a `behavior`, since behaviors may mutate state the
// same way their original functions already did). Set tiers that
// UPGRADE one of these (Thraekor:6, Vanguard:4/6, Ashforged:6, Kabal:4,
// Novitiate:4, Pre-Kabal:4, Scout Corps:6, ...) are deliberately NOT
// touched here -- crushing_impact's own value function below still
// calls crushingImpactMultiplier(state), which already folds those in
// via Math.max, so nothing about their behavior changes; they get their
// OWN registry entries (Rule 1's `upgrades` field) in a later increment,
// purely so M1 stops warning about them. defenseIgnore and incoming are
// later increments too.
registerModifier("effect:crushing_impact", {
  source: { kind: "effect", id: "crushing_impact" },
  hook: "calculateDamage.outgoing", order: 5, bucket: "conditional",
  value: (ctx) => crushingImpactMultiplier(ctx.holder, ctx.role) - 1, behavior: null,
  when: (ctx) => !ctx.isSpell && ctx.effDef > ctx.atk, holders: ["player"], state: null,
  notes: "Crushing Impact. Weapon-branch only (when: !isSpell && effDef > atk, today's exact gate). Value delegates to crushingImpactMultiplier(holder, role) -- Amendment 1 gap close (19 Nov): reads ctx.holder/ctx.role, not ctx.state, so a future widening of `holders` resolves correctly for whichever holder actually wears the gear; for today's player-only holders this is ctx.state under a different name, byte-identical. Thraekor:6/Regalia of the Crimson Vanguard:4/Ashforged:6's own upgrades are registered entries (Rule 1, tag effect:crushing_impact, below) instead of an inline Math.max; plain Vanguard:4 was missed until the 2d close-out M1 sweep (its own entry is below too) -- M1 no longer warns about any of them.",
});
registerModifier("effect:executioner", {
  source: { kind: "effect", id: "executioner" },
  hook: "calculateDamage.outgoing", order: 10, bucket: "conditional",
  value: (ctx) => {
    if (!hasEffect(ctx.holder, "executioner")) return 0;
    const threshold = executionerThreshold(ctx.holder, ctx.role);
    return ctx.defenderHp <= ctx.defenderMaxHp * threshold ? 0.2 : 0;
  },
  behavior: null, when: null, holders: ["player", "ally", "enemy"], state: null,
  notes: "Executioner. Amendment 1 gap close (19 Nov): unifies the player-only executionerMultiplier(state) (combat.js) and the already-generalized-but-separate executionerMultiplierFor(attacker, defenderHp, defenderMaxHp) (the same file -- used by the ally/enemy attack-roll formulas in actions.js, flat 30% threshold, no set-widening) into ONE entry, dispatched by calculateOutgoingMultiplier for every attacker role. `holders` widens to ally/enemy here specifically (not R1 -- this is correcting the entry to match what the code already did via that second function, not a new behavior) because executionerMultiplierFor already granted this to any attacker wearing the effect; executionerThreshold(holder, role)'s own upgrade entries (Drake Hunter:4/Vanguard:6/Contract Hunter:4) stay holders: ['player'], so an ally/enemy attacker still gets exactly the old flat 30% -- byte-identical in both directions. ctx.defenderHp/defenderMaxHp are populated generically by every call site (today: activeEnemySlot(combat) for the player, the explicit hp/maxHp or health/maxHealth args the old executionerMultiplierFor took, for ally/enemy).",
});
registerModifier("set:Drake Hunter:6", {
  source: { kind: "set", id: "Drake Hunter:6", setName: "Drake Hunter", tier: 6 },
  hook: "calculateDamage.outgoing", order: 20, bucket: "conditional",
  value: (ctx) => dragonslayerMultiplier(ctx.holder, ctx.creature) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Dragonslayer. Value delegates to dragonslayerMultiplier(holder, creature) -- reads ctx.holder, not ctx.state (Amendment 1 gap close); byte-identical for today's player-only holders.",
});
registerModifier("set:Bonecaller:6", {
  source: { kind: "set", id: "Bonecaller:6", setName: "Bonecaller", tier: 6 },
  hook: "calculateDamage.outgoing", order: 30, bucket: "conditional",
  value: (ctx) => bleedExploitationMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Bleed Exploitation. Value delegates to bleedExploitationMultiplier(state) unchanged.",
});
registerModifier("effect:kingslayer", {
  source: { kind: "effect", id: "kingslayer" },
  hook: "calculateDamage.outgoing", order: 40, bucket: "conditional",
  value: (ctx) => kingslayerMultiplier(ctx.holder, ctx.creature) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Kingslayer. Value delegates to kingslayerMultiplier(holder, creature) -- reads ctx.holder, not ctx.state (Amendment 1 gap close; Master of Arms' own doubling stays folded inside it, also holder-generic). Byte-identical for today's player-only holders.",
});
registerModifier("effect:hunters_instinct", {
  source: { kind: "effect", id: "hunters_instinct" },
  hook: "calculateDamage.outgoing", order: 50, bucket: "conditional",
  value: (ctx) => huntersInstinctMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Hunter's Instinct. Value delegates to huntersInstinctMultiplier(state) unchanged.",
});
registerModifier("effect:momentum", {
  source: { kind: "effect", id: "momentum" },
  hook: "calculateDamage.outgoing", order: 60, bucket: "stacking",
  value: (ctx) => momentumMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Momentum. Value delegates to momentumMultiplier(state) unchanged -- a pure read of combat.player.momentumStacks; the stack's own growth stays exactly where it is today (after the roll, in rollPlayerDamage/rollPlayerDamageCoreForPipeline's own tail), not moved into this entry's state yet (2e's job).",
});
registerModifier("effect:execution_protocol", {
  source: { kind: "effect", id: "execution_protocol" },
  hook: "calculateDamage.outgoing", order: 70, bucket: "burst",
  value: (ctx) => executionProtocolMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Execution Protocol. Value delegates to executionProtocolMultiplier(state) unchanged.",
});
registerModifier("effect:temporal_echo", {
  source: { kind: "effect", id: "temporal_echo" },
  hook: "calculateDamage.outgoing", order: 80, bucket: "burst",
  value: (ctx) => temporalEchoMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Temporal Echo. Value delegates to temporalEchoMultiplier(state) unchanged.",
});
registerModifier("effect:echoing_arsenal", {
  source: { kind: "effect", id: "echoing_arsenal" },
  hook: "calculateDamage.outgoing", order: 85, bucket: "burst",
  value: (ctx) => (ctx.state.combat.player.weaponAttackCounter % 5 === 0 ? 2 : 1) - 1, behavior: null,
  when: (ctx) => !ctx.isSpell, holders: ["player"], state: null,
  notes: "Echoing Arsenal. Weapon-branch only (when: !isSpell, today's exact gate -- this never applied to spells). Reads weaponAttackCounter, which the caller still increments at the exact same point it does today, right before this hook runs.",
});
registerModifier("effect:arcane_overflow", {
  source: { kind: "effect", id: "arcane_overflow" },
  hook: "calculateDamage.outgoing", order: 90, bucket: "burst",
  value: (ctx) => arcaneOverflowMultiplier(ctx.holder) - 1, behavior: null,
  when: (ctx) => !!ctx.isSpell, holders: ["player"], state: null,
  notes: "Arcane Overflow. Spell-branch only (when: isSpell, today's exact gate -- arcaneOverflowMultiplier itself has no isSpell check; today's code reproduces this by simply never including it in the weapon branch's own multiply chain). Reads ctx.holder, not ctx.state (Amendment 1 gap close) -- byte-identical for today's player-only holders.",
});
registerModifier("always:crit", {
  source: { kind: "always" },
  hook: "calculateDamage.outgoing", order: 100, bucket: "crit",
  value: null, behavior: "criticalHitRoll",
  when: null, holders: ["player"], state: null,
  notes: "The player's crit system (Blessing of Guidance/Blessing of Insight/Blessing of Fortune/Avatar of Fate -- see critMultiplier's own header). A behavior (not a bare value) because critMultiplier itself consumes combat.player.unlikelyOutcomeGuaranteedCrit -- a real pre-existing state write, carried over unchanged rather than restructured this round. One composite entry under an 'always' source (see sourceActiveOn's own note) rather than three, since the three sets' own chances already ADD before a single roll today -- splitting them into three independent rolls would change the odds. CRIT_MODIFIER_KEY names this entry's key for the two post-roll callers (Blessing of Fortune/Avatar of Chaos's own stack growth) that need to know whether THIS hit actually crit, not just the overall outgoing total.",
});
// Regalia of the Woven Thread:6 (Avatar of Fate) has two unrelated
// halves per the Bucket Review (18 Nov): the crit-damage double
// (1.5x -> 2.0x while avatarOfFateTurns > 0) is this bucket's concern;
// the separate once-during-the-window 1 HP save is cheatDeath, 2e-5
// territory, untouched here. The crit-damage half is already live
// inside critMultiplier's own `combat.player.avatarOfFateTurns > 0 ?
// 2.0 : 1.5` ternary above (not a resolveUpgradedValue chain -- a data-
// only M1 cleanup pass isn't the place to restructure that), and
// avatarOfFateTurns itself is set by a lowHealth reaction trigger
// (checkAvatarOfFate) that's 2e-4 lifecycle territory, not yet
// migrated. Placeholder only (see the matching set:Stormwatch:6/
// set:Stonewarden:6/set:Leviathan:4 entries below for the same shape).
// `when: () => false` keeps it out of every real dispatch path --
// bucket/value are set only to satisfy M3's own "no bucket"/"presence-
// only" heuristics, which can't see that `when` already makes this
// entry inert; the number itself is never read.
registerModifier("set:Regalia of the Woven Thread:6", {
  source: { kind: "set", id: "Regalia of the Woven Thread:6", setName: "Regalia of the Woven Thread", tier: 6 },
  hook: "calculateDamage.outgoing", order: 999, bucket: "crit", value: 1, behavior: null,
  when: () => false, holders: ["player"], state: null,
  notes: "M1 placeholder only -- the crit-damage double is already live inside critMultiplier's own ternary (always:crit above); the 1 HP save half is cheatDeath, 2e-5.",
});
registerModifier("set:Regalia of the Woven Thread:4", {
  source: { kind: "set", id: "Regalia of the Woven Thread:4", setName: "Regalia of the Woven Thread", tier: 4 },
  hook: "calculateDamage.outgoing", order: 110, bucket: "burst",
  value: (ctx) => (ctx.state.combat.player.threadsOfConsequencePending ? 1.4 : 1) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Threads of Consequence. Pure read of combat.player.threadsOfConsequencePending (set elsewhere, on an enemy miss) -- the flag's own reset-to-false stays exactly where it is today, in the caller's own tail, not moved into this entry's state yet.",
});
registerModifier("effect:worthy_challenge", {
  source: { kind: "effect", id: "worthy_challenge" },
  hook: "calculateDamage.outgoing", order: 120, bucket: "stacking",
  value: (ctx) => worthyChallengeMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Worthy Challenge. Value delegates to worthyChallengeMultiplier(state) unchanged.",
});
registerModifier("set:Regalia of the Crimson Vanguard:2", {
  source: { kind: "set", id: "Regalia of the Crimson Vanguard:2", setName: "Regalia of the Crimson Vanguard", tier: 2 },
  hook: "calculateDamage.outgoing", order: 130, bucket: "conditional",
  value: (ctx) => blessingOfValorMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Valor. Value delegates to blessingOfValorMultiplier(state) unchanged.",
});
registerModifier("effect:loaded_dice", {
  source: { kind: "effect", id: "loaded_dice" },
  hook: "calculateDamage.outgoing", order: 140, bucket: "variance",
  value: null, behavior: "loadedDiceRoll",
  when: null, holders: ["player"], state: null,
  notes: "Loaded Dice. A behavior (not a bare value) because loadedDiceMultiplier itself calls applyTwistOfFate(state) on its favorable roll -- a real pre-existing state write, carried over unchanged. 'variance' bucket -- its own resolved number IS the raw multiplier (0.5/1/2.0), not an additive delta, matching critMultiplier's own convention and spec §4's 'stays as a product' note.",
});
registerModifier("set:Regalia of the Laughing Gale:6", {
  source: { kind: "set", id: "Regalia of the Laughing Gale:6", setName: "Regalia of the Laughing Gale", tier: 6 },
  hook: "calculateDamage.outgoing", order: 150, bucket: "variance",
  value: (ctx) => avatarOfChaosDamageMultiplier(ctx.state), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Chaos's damage randomization. Value delegates to avatarOfChaosDamageMultiplier(state) unchanged -- a pure RNG read (0.75 + Math.random()), no state write. 'variance' bucket, raw multiplier (not a delta) -- see loaded_dice's own note.",
});
registerModifier("effect:momentum_unbound", {
  source: { kind: "effect", id: "momentum_unbound" },
  hook: "calculateDamage.outgoing", order: 160, bucket: "stacking",
  value: (ctx) => momentumUnboundMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Momentum Unbound. Value delegates to momentumUnboundMultiplier(state) unchanged.",
});
registerModifier("effect:tempered_steel", {
  source: { kind: "effect", id: "tempered_steel" },
  hook: "calculateDamage.outgoing", order: 170, bucket: "stacking",
  value: (ctx) => temperedSteelMultiplier(ctx.state) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Tempered Steel. Value delegates to temperedSteelMultiplier(state) unchanged.",
});
registerModifier("effect:master_craftsman", {
  source: { kind: "effect", id: "master_craftsman" },
  hook: "calculateDamage.outgoing", order: 175, bucket: "conditional",
  value: (ctx) => masterCraftsmanMultiplier(ctx.atk, ctx.creature) - 1, behavior: null,
  when: (ctx) => !ctx.isSpell, holders: ["player"], state: null,
  notes: "Master Craftsman. Weapon-branch only (when: !isSpell, today's exact gate -- an Attack-vs-Defense comparison has no spell equivalent). Value delegates to masterCraftsmanMultiplier(atk, creature) unchanged.",
});
registerModifier("set:Regalia of the Eternal Hour:6", {
  source: { kind: "set", id: "Regalia of the Eternal Hour:6", setName: "Regalia of the Eternal Hour", tier: 6 },
  hook: "calculateDamage.outgoing", order: 180, bucket: "burst",
  value: (ctx) => (ctx.state.combat.player.avatarOfTimeTurns > 0 ? 1.25 : 1) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Time's own +25% damage window. Pure read of combat.player.avatarOfTimeTurns.",
});
registerModifier("effect:stones_patience", {
  source: { kind: "effect", id: "stones_patience" },
  hook: "calculateDamage.outgoing", order: 190, bucket: "conditional",
  value: (ctx) => (ctx.state.combat.enemyActedFirstThisRound && hasEffect(ctx.state, "stones_patience") ? 1.3 : 1) - 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Stone's Patience. Pure read of combat.enemyActedFirstThisRound (the flag's own reset-to-false stays exactly where it is today, in the caller's own tail).",
});

// ---- 2d, increment 2: calculateDamage.defenseIgnore -- the same pair
// of player functions, their effDef computation. Every entry's value is
// framed as 1 - <existing multiplier function>(...), so multiplying
// (1 - value) back together reproduces EXACTLY today's
// foreseenDefMult * commandingDefMult * precisionFormulaMultiplier(state)
// product -- see calculateDefenseIgnoreMultiplier's own header.
registerModifier("effect:foreseen_strike", {
  source: { kind: "effect", id: "foreseen_strike" },
  hook: "calculateDamage.defenseIgnore", order: 10, bucket: "defenseIgnore",
  value: (ctx) => 1 - foreseenStrikeDefMultiplier(ctx.state), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Foreseen Strike. Value delegates to foreseenStrikeDefMultiplier(state) unchanged (every 3rd action, 50% Defense ignore).",
});
registerModifier("set:Regalia of the Crimson Vanguard:4", {
  source: { kind: "set", id: "Regalia of the Crimson Vanguard:4", setName: "Regalia of the Crimson Vanguard", tier: 4 },
  hook: "calculateDamage.defenseIgnore", order: 20, bucket: "defenseIgnore",
  value: (ctx) => 1 - commandingPresenceDefMultiplier(ctx.state), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Commanding Presence. Value delegates to commandingPresenceDefMultiplier(state) unchanged (every 3rd attack, full Defense ignore).",
});
registerModifier("effect:precision_formula", {
  source: { kind: "effect", id: "precision_formula" },
  hook: "calculateDamage.defenseIgnore", order: 30, bucket: "defenseIgnore",
  value: (ctx) => 1 - precisionFormulaMultiplier(ctx.holder), behavior: null,
  when: (ctx) => !!ctx.isSpell, holders: ["player"], state: null,
  notes: "Precision Formula. Spell-branch only (when: isSpell, today's exact gate -- precisionFormulaMultiplier itself has no isSpell check; today's code reproduces this by simply never including it in the weapon branch's own effDef product). Value delegates to precisionFormulaMultiplier(holder) -- reads ctx.holder, not ctx.state (Amendment 1 gap close), 30% Defense ignore, byte-identical for today's player-only holders.",
});
registerModifier("effect:armor_crack", {
  source: { kind: "effect", id: "armor_crack" },
  hook: "calculateDamage.defenseIgnore", order: 40, bucket: "defenseIgnore",
  value: (ctx) => armorCrackAmount(ctx.holder), behavior: null, flatAmount: true,
  when: (ctx) => !ctx.isSpell, holders: ["player"], state: null,
  notes: "Armor Crack. flatAmount: true -- this is a flat Defense SUBTRACTION (2, or 4 with Siege Corps 4pc's own upgrade), never a percentage, so it's excluded from calculateDefenseIgnoreMultiplier's product entirely; the call site still subtracts armorCrackAmount(state) directly, unchanged, before any percentage multiplier applies -- exactly today's order. Weapon-branch only (when: !isSpell, today's exact gate). Reads ctx.holder, not ctx.state (Amendment 1 gap close).",
});
// Siege Corps 4pc (2d close-out, M1 cleanup, Rule 1): pure documentation
// data -- armorCrackAmount(state) still does its own plain `hasSetTier(state,
// "Siege Corps", 4) ? 4 : 2` ternary, unchanged, not resolveUpgradedValue;
// this entry exists only so M1 stops warning about the set tier, same as
// any other `upgrades` entry whose base hasn't moved onto the shared
// resolver mechanism yet.
registerModifier("set:Siege Corps:4", {
  source: { kind: "set", id: "Siege Corps:4", setName: "Siege Corps", tier: 4 },
  upgrades: "effect:armor_crack",
  hook: "calculateDamage.defenseIgnore", order: 40, bucket: null, value: 4, behavior: null, flatAmount: true,
  when: null, holders: ["player"], state: null,
  notes: "Armor Crack upgrade: flat Defense ignore 2 -> 4 (siegecorps_armorcrack_4).",
});

// ---- Amendment 1 gap close (19 Nov): Rule 1 upgrade entries ----
// Every entry below has `upgrades` set, so it never contributes its own
// factor to a bucket sum (calculateOutgoingMultiplier/
// calculateDefenseIgnoreMultiplier both already special-case this -- see
// their own headers); it exists purely so resolveUpgradedValue (above)
// can find it and so M1 stops warning that this set tier's own number
// has no registry entry. `holders: ["player"]` on every one of these,
// matching today exactly -- none of these six set tiers' upgrades have
// ever applied to an ally or enemy attacker, so nothing widens here; the
// base entries they upgrade (effect:crushing_impact, effect:executioner)
// are the ones whose OWN holders reflect what already generalizes today
// (executioner only, per that entry's own note).
registerModifier("set:Thraekor:6", {
  source: { kind: "set", id: "Thraekor:6", setName: "Thraekor", tier: 6 },
  upgrades: "effect:crushing_impact",
  hook: "calculateDamage.outgoing", order: 5, bucket: null, value: 1.35, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Crushing Impact upgrade: 1.2x -> 1.35x. Read by crushingImpactMultiplier via resolveUpgradedValue, not dispatched for its own sake.",
});
registerModifier("set:Regalia of the Crimson Vanguard:4:crushing_impact", {
  source: { kind: "set", id: "Regalia of the Crimson Vanguard:4", setName: "Regalia of the Crimson Vanguard", tier: 4 },
  upgrades: "effect:crushing_impact",
  hook: "calculateDamage.outgoing", order: 5, bucket: null, value: 1.35, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Crushing Impact upgrade: 1.2x -> 1.35x. Keyed distinctly from set:Regalia of the Crimson Vanguard:4 (the Commanding Presence defenseIgnore entry) -- same set tier, two unrelated bonuses, so MODIFIERS needs two keys for it.",
});
registerModifier("set:Ashforged:6", {
  source: { kind: "set", id: "Ashforged:6", setName: "Ashforged", tier: 6 },
  upgrades: "effect:crushing_impact",
  hook: "calculateDamage.outgoing", order: 5, bucket: null, value: 1.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Crushing Impact upgrade: 1.2x -> 1.4x, the strongest of the three.",
});
// 2d close-out, M1 cleanup: plain "Vanguard" (sets.js:126) is a distinct
// set from "Regalia of the Crimson Vanguard" (sets.js:389) -- the
// header comment above crushingImpactMultiplier/executionerThreshold
// (naming "Thraekor:6/Vanguard:4/Ashforged:6") was wrong to claim this
// one was already covered; only Thraekor:6/Ashforged:6/the Crimson
// Vanguard tiers were ever actually registered. Genuinely missing, not
// a key-naming gap like opening_reach/spell_ward above.
registerModifier("set:Vanguard:4", {
  source: { kind: "set", id: "Vanguard:4", setName: "Vanguard", tier: 4 },
  upgrades: "effect:crushing_impact",
  hook: "calculateDamage.outgoing", order: 5, bucket: null, value: 1.35, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Crushing Impact upgrade: 1.2x -> 1.35x (vanguard_crushing_135).",
});
registerModifier("set:Drake Hunter:4", {
  source: { kind: "set", id: "Drake Hunter:4", setName: "Drake Hunter", tier: 4 },
  upgrades: "effect:executioner.threshold",
  hook: "calculateDamage.outgoing", order: 10, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Executioner threshold upgrade: 30% -> 40% HP. Virtual tag (not effect:executioner itself -- that entry's own value is the 1.2x damage number; this is the HP% gate read by executionerThreshold via resolveUpgradedValue).",
});
registerModifier("set:Regalia of the Crimson Vanguard:6", {
  source: { kind: "set", id: "Regalia of the Crimson Vanguard:6", setName: "Regalia of the Crimson Vanguard", tier: 6 },
  upgrades: "effect:executioner.threshold",
  hook: "calculateDamage.outgoing", order: 10, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Executioner threshold upgrade: 30% -> 40% HP.",
});
registerModifier("set:Contract Hunter:4", {
  source: { kind: "set", id: "Contract Hunter:4", setName: "Contract Hunter", tier: 4 },
  upgrades: "effect:executioner.threshold",
  hook: "calculateDamage.outgoing", order: 10, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Executioner threshold upgrade: 30% -> 40% HP.",
});
registerModifier("set:Vanguard:6", {
  source: { kind: "set", id: "Vanguard:6", setName: "Vanguard", tier: 6 },
  upgrades: "effect:executioner.threshold",
  hook: "calculateDamage.outgoing", order: 10, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Executioner threshold upgrade: 30% -> 40% HP (vanguard_executioner_40). Genuinely missing before 2d close-out, same as set:Vanguard:4 above -- see that entry's note.",
});
registerModifier("set:Scout Corps:6", {
  source: { kind: "set", id: "Scout Corps:6", setName: "Scout Corps", tier: 6 },
  upgrades: "effect:ambush",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 1.7, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Ambush upgrade: wins outright over both the 1.4x base and the 1.55x ambush_mastery tier (still true taking Math.max, since 1.7 beats both). Ambush itself is now dispatched through calculateDamage.outgoing (2d close-out: see 'effect:ambush_mastery' below, lateOutgoingPhase 'ambush') -- order 999 is still just a placeholder since resolveUpgradedValue's own Math.max resolution doesn't read it.",
});
registerModifier("set:Conduit Master:6", {
  source: { kind: "set", id: "Conduit Master:6", setName: "Conduit Master", tier: 6 },
  upgrades: "effect:surging_conduit_charges",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 2, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Surging Conduit charge-count upgrade: 1 -> 2 per fight. A charge COUNT, not a multiplier -- surgingConduitCharges itself isn't dispatched through any hook yet (Surging Conduit's own damage bonus is still unmigrated), so this is pure Rule 1 data ahead of that.",
});
registerModifier("set:Fragmenta:4", {
  source: { kind: "set", id: "Fragmenta:4", setName: "Fragmenta", tier: 4 },
  upgrades: "effect:surging_conduit_charges",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 2, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Surging Conduit charge-count upgrade: 1 -> 2 per fight (not 3, if somehow both this and Conduit Master:6 are active -- resolveUpgradedValue's Math.max already gives that, same as the old inline OR).",
});
registerModifier("set:Novitiate:4", {
  source: { kind: "set", id: "Novitiate:4", setName: "Novitiate", tier: 4 },
  upgrades: "effect:elemental_focus",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 1.12, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Elemental Focus upgrade: 1.08x -> 1.12x. elemental_focus itself isn't dispatched through calculateDamage.outgoing yet (the element-ability path's own migration is pending) -- pure Rule 1 data ahead of that.",
});
registerModifier("set:Kabal:4", {
  source: { kind: "set", id: "Kabal:4", setName: "Kabal", tier: 4 },
  upgrades: "effect:elemental_focus",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 1.15, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Elemental Focus upgrade: 1.08x -> 1.15x.",
});
registerModifier("set:Pre-Kabal:4", {
  source: { kind: "set", id: "Pre-Kabal:4", setName: "Pre-Kabal", tier: 4 },
  upgrades: "effect:elemental_focus",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 1.2, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Elemental Focus upgrade: 1.08x -> 1.2x, the strongest of the three.",
});
registerModifier("set:Examiner:4", {
  source: { kind: "set", id: "Examiner:4", setName: "Examiner", tier: 4 },
  upgrades: "effect:spell_ward",
  hook: "calculateDamage.incoming", order: 999, bucket: null, value: 0.8, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Spell Ward upgrade: 0.9x -> 0.8x (lower is stronger -- resolveUpgradedValue uses direction 'min' here, see spellWardMultiplier). calculateDamage.incoming is this entry's eventual real home (2d increment 3) -- staged as Rule 1 data now, ahead of that hook's own combinator.",
});
registerModifier("set:River Warden:4", {
  source: { kind: "set", id: "River Warden:4", setName: "River Warden", tier: 4 },
  upgrades: "effect:spell_ward",
  hook: "calculateDamage.incoming", order: 999, bucket: null, value: 0.8, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Spell Ward upgrade: 0.9x -> 0.8x.",
});
registerModifier("set:Stormwatch:4", {
  source: { kind: "set", id: "Stormwatch:4", setName: "Stormwatch", tier: 4 },
  upgrades: "effect:spell_ward",
  hook: "calculateDamage.incoming", order: 999, bucket: null, value: 0.8, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Spell Ward upgrade: 0.9x -> 0.8x.",
});

// ---- 2d, increment 3 (19 Nov): calculateDamage.incoming -- the
// player's own defender-side mitigation chain (mitigateAndApplyHitOnPlayer,
// combat.js), dispatched by calculateIncomingDamage (see that function's
// own header on the sequential-rounding combinator shape this hook needs,
// unlike outgoing/defenseIgnore's single end-of-chain product). Every
// entry wraps an existing, unchanged function verbatim, same discipline
// as every earlier increment. `order` matches today's exact chain
// position; `ctx` is { state, holder, role: "player", kind, edmg } where
// `edmg` is overwritten by calculateIncomingDamage before every entry so
// each one reads the RUNNING total, not the original hit.
registerModifier("set:Legion:4", {
  source: { kind: "set", id: "Legion:4", setName: "Legion", tier: 4 },
  hook: "calculateDamage.incoming", order: 10, bucket: "incomingMitigation", value: null,
  behavior: "shieldWallApply", directApply: true, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Shield Wall. directApply -- wraps applyShieldWall(holder, edmg) unchanged, which already does its own Math.round(dmg * 0.9).",
});
registerModifier("effect:master_duelist", {
  source: { kind: "effect", id: "master_duelist" },
  hook: "calculateDamage.incoming", order: 20, bucket: "incomingMitigation", value: null,
  behavior: "masterDuelistApply", directApply: true, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Master Duelist. directApply -- wraps applyMasterDuelist(holder, edmg) unchanged.",
});
registerModifier("effect:unbroken_line", {
  source: { kind: "effect", id: "unbroken_line" },
  hook: "calculateDamage.incoming", order: 30, bucket: "incomingMitigation", value: null,
  behavior: "unbrokenLineApply", directApply: true, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Unbroken Line. directApply -- wraps applyUnbrokenLine(holder, edmg) unchanged, including its hit-counter/damage-reduction-window state writes.",
});
registerModifier("effect:prepared_response", {
  source: { kind: "effect", id: "prepared_response" },
  hook: "calculateDamage.incoming", order: 40, bucket: "incomingMitigation", value: null,
  behavior: "preparedResponseRatio", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Prepared Response. A behavior (not a bare value) -- preparedResponseMultiplier itself consumes combat.player.preparedResponseWitnessed, a real pre-existing state write, carried over unchanged (same precedent as crit/loaded_dice in increment 1).",
});
registerModifier("effect:calming_presence", {
  source: { kind: "effect", id: "calming_presence" },
  hook: "calculateDamage.incoming", order: 50, bucket: "incomingMitigation",
  value: (ctx) => calmingPresenceMultiplier(ctx.holder), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Calming Presence. Pure read -- value delegates to calmingPresenceMultiplier(holder) unchanged.",
});
registerModifier("set:Regalia of the Eternal Heart:6", {
  source: { kind: "set", id: "Regalia of the Eternal Heart:6", setName: "Regalia of the Eternal Heart", tier: 6 },
  hook: "calculateDamage.incoming", order: 60, bucket: "incomingMitigation",
  value: (ctx) => avatarOfDevotionDamageMultiplier(ctx.holder), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Devotion. Pure read of combat.player.avatarOfDevotionTurns.",
});
registerModifier("set:Regalia of the Eternal Bastion:2", {
  source: { kind: "set", id: "Regalia of the Eternal Bastion:2", setName: "Regalia of the Eternal Bastion", tier: 2 },
  hook: "calculateDamage.incoming", order: 70, bucket: "incomingMitigation",
  value: (ctx) => blessingOfStoneMultiplier(ctx.holder), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Stone. Pure read of current Health vs. 50% max -- live, not a once-per-fight gate.",
});
registerModifier("set:Regalia of the Eternal Bastion:6", {
  source: { kind: "set", id: "Regalia of the Eternal Bastion:6", setName: "Regalia of the Eternal Bastion", tier: 6 },
  hook: "calculateDamage.incoming", order: 80, bucket: "incomingMitigation",
  value: (ctx) => avatarOfEnduranceDamageMultiplier(ctx.holder), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Endurance. Pure read of combat.player.avatarOfEnduranceTurns.",
});
registerModifier("set:Regalia of the Endless Tide:6", {
  source: { kind: "set", id: "Regalia of the Endless Tide:6", setName: "Regalia of the Endless Tide", tier: 6 },
  hook: "calculateDamage.incoming", order: 90, bucket: "incomingMitigation",
  value: (ctx) => avatarOfRenewalDamageMultiplier(ctx.holder), behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Renewal. Pure read of combat.player.avatarOfRenewalTurns.",
});
registerModifier("effect:adaptive_tide.physical", {
  source: { kind: "effect", id: "adaptive_tide" },
  hook: "calculateDamage.incoming", order: 100, bucket: "incomingMitigation",
  value: (ctx) => adaptiveTidePhysicalMultiplier(ctx.holder), behavior: null,
  when: (ctx) => ctx.kind !== "magic", holders: ["player"], state: null,
  notes: "Adaptive Tide, physical side. Keyed distinctly from the magic side below (same source.id -- two entries for one effect, kind-gated exactly like today's ternary) -- MODIFIERS needs two keys since both would otherwise collide. Pure read of combat.player.adaptiveTidePhysicalStacks; the stack's own growth stays exactly where it is today, in mitigateAndApplyHitOnPlayer's own tail, not moved into this entry's state yet.",
});
registerModifier("effect:adaptive_tide.magic", {
  source: { kind: "effect", id: "adaptive_tide" },
  hook: "calculateDamage.incoming", order: 100, bucket: "incomingMitigation",
  value: (ctx) => adaptiveTideMagicMultiplier(ctx.holder), behavior: null,
  when: (ctx) => ctx.kind === "magic", holders: ["player"], state: null,
  notes: "Adaptive Tide, magic side. See the physical side's own notes.",
});
registerModifier("effect:shared_burden", {
  source: { kind: "effect", id: "shared_burden" },
  hook: "calculateDamage.incoming", order: 110, bucket: "incomingMitigation", value: null,
  behavior: "sharedBurdenRatio", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Shared Burden. A behavior -- sharedBurdenMultiplier(holder, edmg) consumes combat.player.sharedBurdenUsed (a real state write) AND reads the RUNNING edmg for its magnitude gate (dmg > 30% max Health), which is exactly why calculateIncomingDamage re-reads ctx.edmg before every entry rather than passing the original hit throughout.",
});

// ---- 2d, increment 3: calculateDamage.cap -- a damage-VALUE cap,
// dispatched by applyDamageCap AFTER calculateIncomingDamage returns
// (Rule 3: outside the buckets, never itself capped). Unyielding Wall
// (player) and Perfect Fleshcraft (enemy) are the only two members --
// see applyDamageCap's own header on the "first one that caps wins"
// shape.
registerModifier("effect:unyielding_wall", {
  source: { kind: "effect", id: "unyielding_wall" },
  hook: "calculateDamage.cap", order: 10, bucket: null, value: null,
  behavior: "unyieldingWallCap", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Unyielding Wall. Wraps applyUnyieldingWall(holder, edmg) unchanged, including its own 3-round cooldown state write.",
});
registerModifier("passive:perfect_fleshcraft", {
  source: { kind: "passive", id: "perfect_fleshcraft" },
  hook: "calculateDamage.cap", order: 10, bucket: null, value: null,
  behavior: "perfectFleshcraftCap", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Perfect Fleshcraft (Grand Voran-Daun). Wraps enemyDamageCapPctMaxHp(holder, edmg) unchanged (extracted verbatim from applyEnemyFlatDamageReduction's own former inline loop). source.kind 'passive' reads creature.passives, exactly like today's getEnemyAbility(id).trigger==='damageCapPctMaxHp' scan.",
});

// ---- 2d, increment 3b (19 Nov): calculateDamage.incoming, enemy-holder
// (Sanguivorum). Dispatched by calculateEnemyIncomingMultiplier (see its
// own header on the flat-product combinator this hook needs for an
// enemy defender, unlike the player's own sequential chain). `holders:
// ["enemy"]` -- the wearer is always the CREATURE taking the hit, never
// the player/ally dealing it. Covers all 11 catalogue rows across 4
// shared mechanisms: Smuggler's Guard/Commander's Poise (Sanguivorum
// Criminal Underworld), the 4-id "one hit mitigation" mechanism
// (Hardened Formation/Officer's Bearing/Watchman's Resilience/
// Contractor's Endurance), the 2-id "repeatable mitigation" mechanism
// (Duelist's Bulwark/Champion's Poise), and the 3-id "ally protection"
// mechanism (Gatekeeper's Stand/Protective Intercession/Officer's
// Intercession -- a DIFFERENT enemy's own gear, not this one's).
//
// Dispatched now for every attacker (player, ally, kit-ally), not just
// the player -- previously only Smuggler's Guard/Commander's Poise
// applied to an ally's own hit (allyPlain's unconditional sangMit),
// while the other three mechanisms were player-only (rollPlayerDamage/
// rollPlayerDamageCoreForPipeline's own 4-factor sangMit). Tyler's own
// instruction ("dispatched for any defender") unifies this -- a real
// behavior change for an ally hitting a Sanguivorum-geared enemy that
// also carries one of the other three mechanisms (none did before);
// verified against both harnesses, see the catalogue's own note on
// which cells moved and why.
registerModifier("always:sang_cu_defender_mitigation", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 10, bucket: "incomingMitigation",
  value: null, behavior: "sangCuDefenderMitigationRatio", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Smuggler's Guard (sang_cu_ie006, CD4) / Commander's Poise (sang_cu_ie011, once/combat), Sanguivorum Criminal Underworld. Wraps sangCuDefenderMitigation(holder) unchanged -- both ids' own independent 0.9x branches already live inside that one function.",
});
registerModifier("always:sang_one_hit_mitigation", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 20, bucket: "incomingMitigation",
  value: null, behavior: "enemyOneHitMitigationRatio", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Hardened Formation (sang_mil_ie001) / Officer's Bearing (sang_mil_ie007) / Watchman's Resilience (sang_sec_ie004) / Contractor's Endurance (sang_iag_ie002) -- one shared once-per-combat 0.9x mechanism across four ids (ONE_HIT_MITIGATION_EFFECT_IDS, combat.js). Wraps enemyOneHitMitigationMultiplier(holder) unchanged.",
});
registerModifier("always:sang_repeatable_mitigation", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 30, bucket: "incomingMitigation",
  value: null, behavior: "enemyRepeatableMitigationRatio", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Duelist's Bulwark (sang_sec_ie007) / Champion's Poise (sang_iag_ie006) -- one shared CD4/max-2-uses 0.9x mechanism across two ids (REPEATABLE_MITIGATION_EFFECT_IDS, combat.js). Wraps enemyRepeatableMitigationMultiplier(holder) unchanged.",
});
registerModifier("always:sang_ally_protection", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 40, bucket: "incomingMitigation",
  value: null, behavior: "enemyAllyProtectionRatio", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Gatekeeper's Stand (sang_sec_ie005) / Protective Intercession (sang_sec_ie010) / Officer's Intercession (sang_cu_ie010) -- one shared CD5/max-2-uses 0.9x mechanism (ALLY_PROTECTION_EFFECT_IDS, combat.js), checked on a DIFFERENT living enemy than the one taking this hit, which is why `always` is the only fit (not just the simplest one) -- there's no single hasEffect(holder, id) that could gate it. Wraps enemyAllyProtectionMultiplier(state, holder) unchanged.",
});

// ---- 2d, increment 3c (19 Nov): calculateDamage.incoming, ability-
// phase (Spell Ward/Storm Barrier/Stonewarden 6pc). Dispatched by
// calculateAbilityIncomingMultiplier, inside enemyCore (actions.js)
// itself -- a genuinely earlier point in the pipeline than
// calculateIncomingDamage's own dispatch (mitigateAndApplyHitOnPlayer),
// since enemyCore's own return value IS that function's `edmg` argument
// at its call sites. `abilityPhase: true` is what keeps the two
// dispatch points (sharing one hook) from double-firing each other's
// entries -- see calculateAbilityIncomingMultiplier's own header.
// Keyed "effect:spell_ward" (2d close-out, M1 cleanup) even though
// source.kind stays "always" -- same exception opening_reach uses:
// Leviathan:4 also grants Spell Ward outright (see spellWardMultiplier's
// own hasBase gate), so no single hasEffect/hasSetTier check covers both
// grant paths at once, but EFFECT_DEFS.spell_ward still needs this exact
// key to satisfy M1's per-id lookup.
registerModifier("effect:spell_ward", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 5, bucket: "incomingMitigation", abilityPhase: true,
  value: null, behavior: "spellWardRatio", params: null,
  when: (ctx) => ctx.kind === "magic", holders: ["player", "ally"], state: null,
  notes: "Spell Ward (also granted outright by Leviathan:4). Magic-only (today's own code only ever reads it inside the creature.element/U1-gated branches). Upgrade entries (Examiner:4/River Warden:4/Stormwatch:4) already staged, Amendment 1 gap close.",
});
registerModifier("always:storm_barrier", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 6, bucket: "incomingMitigation", abilityPhase: true,
  value: null, behavior: "stormBarrierRatio", params: null,
  when: (ctx) => ctx.kind === "magic", holders: ["player", "ally"], state: null,
  notes: "Storm Barrier (Stormwatch 6pc). `always`-sourced, not `set:Stormwatch:6` -- the flag (stormBarrierUsed, living on combat.player for the player or the ally record itself) is consumed on ANY qualifying hit regardless of whether Stormwatch is actually equipped (today's own `if (edmg > 0 && !...Used)` gate has no hasSetTier in it at all -- only the DAMAGE RATIO inside is set-gated). A `source: {kind:'set'}` entry would only fire -- and only consume the flag -- when the set is worn, which is wrong; caught the same way the Amendment 1 gap close's own bugs were, by the parity suite (phase1_step1b/1e-i/1e-iii all regressed on this exact mistake during development). Magic-only, same gate as Spell Ward above.",
});
registerModifier("always:stonewarden_first_hit", {
  source: { kind: "always" },
  hook: "calculateDamage.incoming", order: 7, bucket: "incomingMitigation", abilityPhase: true,
  value: null, behavior: "firstHitTakenRatio", params: null,
  when: (ctx) => ctx.role === "player" || ctx.kind === "magic", holders: ["player", "ally"], state: null,
  notes: "Stonewarden 6pc. `always`-sourced for the same reason as Storm Barrier above -- the firstHitTakenUsed flag is consumed on any qualifying hit whether or not Stonewarden is worn; only the ratio itself is set-gated, inside firstHitTakenRatio. Unlike Spell Ward/Storm Barrier, this one already applies to BOTH the player's magic AND physical branches today (one shared combat.player.firstHitTakenUsed flag across both) -- `when` reflects that asymmetry exactly: always eligible for the player, magic-only for an ally (the ally's own flat/physical branch has no Stonewarden check at all -- a known, separate gap the asymmetry register already flags as needs-Tyler, left untouched here).",
});
// M1's SET TIER check (`set:${setName}:${tier}`) is separate from its
// EFFECT_DEFS check and doesn't know "always:storm_barrier"/
// "always:stonewarden_first_hit" above already cover Stormwatch 6pc/
// Stonewarden 6pc (neither is gated on a hasSetTier at the FLAG level,
// per those entries' own notes, which is exactly why they're keyed
// `always:` and not `set:...` to begin with). These three are
// placeholders ONLY, to satisfy that separate check. `when: () => false`
// (not `upgrades`) keeps them out of every real dispatch path: modifiersForHook
// itself drops a `when`-false entry before any hook-level filter even
// runs, so there's no risk of colliding with resolveUpgradedValue the
// way an `upgrades`-tagged placeholder with a null value would (caught
// by the regression suite -- P2-2D-ABL-SPELLWARD-LEVIATHAN-GRANT-01
// regressed to edmg 0 during this entry's own development, Math.min(0.9,
// null) coercing null to 0). bucket/value are set only to satisfy M3's
// own "no bucket"/"presence-only" heuristics (which can't see that
// `when` already makes the entry inert) -- the number is never read.
registerModifier("set:Stormwatch:6", {
  source: { kind: "set", id: "Stormwatch:6", setName: "Stormwatch", tier: 6 },
  hook: "calculateDamage.incoming", order: 999, bucket: "incomingMitigation", value: 1, behavior: null,
  when: () => false, holders: ["player", "ally"], state: null,
  notes: "M1 placeholder only -- Storm Barrier's real entry is 'always:storm_barrier' above (see that entry's own note for why it can't be keyed 'set:Stormwatch:6' directly: the flag consumes regardless of whether the set is worn).",
});
registerModifier("set:Stonewarden:6", {
  source: { kind: "set", id: "Stonewarden:6", setName: "Stonewarden", tier: 6 },
  hook: "calculateDamage.incoming", order: 999, bucket: "incomingMitigation", value: 1, behavior: null,
  when: () => false, holders: ["player", "ally"], state: null,
  notes: "M1 placeholder only -- Stonewarden 6pc's real entry is 'always:stonewarden_first_hit' above, for the same reason as set:Stormwatch:6 above.",
});
// Leviathan:4 grants Spell Ward's BASE outright (spellWardMultiplier's
// own hasBase gate, already handled -- see 'effect:spell_ward' above)
// and Coldproof's BASE outright (hasColdproof, js/data/sets.js) -- the
// Coldproof half is a flat stat.def grant, never a bucket entry at all
// (Bucket Review, 18 Nov), so this placeholder covers the Spell Ward
// half only, same shape as the two above.
registerModifier("set:Leviathan:4", {
  source: { kind: "set", id: "Leviathan:4", setName: "Leviathan", tier: 4 },
  hook: "calculateDamage.incoming", order: 999, bucket: "incomingMitigation", value: 1, behavior: null,
  when: () => false, holders: ["player"], state: null,
  notes: "M1 placeholder only -- grants Spell Ward's base outright (spellWardMultiplier's own hasBase check already covers this); the Coldproof half of this tier is an unrelated flat stat.def grant, outside calculateDamage entirely.",
});

// ---- 2d, increment 3d (19 Nov): statusTick.incoming (Ashward). The
// only member of this hook -- holders stays ["enemy"], matching
// tickBurnEnemy's own single existing call site exactly (hasEffect(creature,
// "dra_e08_ashward"), creature being the enemy wearer). No widening: this
// is a pure "move the number into the registry" migration, same
// discipline as every other 2d entry, not an R1/R2 question (per
// Tyler's own 19 Nov note on increment 3b -- a widening would need its
// own switch and measurement, but this entry doesn't widen anything).
registerModifier("effect:dra_e08_ashward", {
  source: { kind: "effect", id: "dra_e08_ashward" },
  hook: "statusTick.incoming", order: 10, bucket: null, value: 0.75, behavior: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Ashward (First Sword's Regalia, Mantle of the Tower -- DRA-I08). Incoming Burning DoT ticks deal 0.75x. Plain numeric value (0.75), no behavior -- a pure hasEffect read, no state.",
});

// ---- 2d close-out (19 Nov, Tyler): the outgoing multipliers dispatched
// outside the two core player functions. Each wraps today's exact
// condition verbatim, in a real bucket (R3 needs every damage
// multiplier in one, per the 2e handoff's own line). `holders` stays
// exactly what today's own call sites already are -- NO widening here
// (per cd15573's own rule): Opening Reach unifies two pre-existing code
// paths (applyOpeningReach + applyOpeningReachForActor) that ALREADY
// covered player/ally/enemy between them, same precedent as
// Executioner's own Amendment 1 gap close; nothing else below reaches
// any holder it didn't already reach today.
registerModifier("effect:opening_reach", {
  source: { kind: "always" },
  hook: "calculateDamage.outgoing", order: 200, bucket: "conditional", lateOutgoingPhase: "openingReach",
  value: null, behavior: "openingReachRatio", params: null,
  when: null, holders: ["player", "ally", "enemy"], state: null,
  notes: "Opening Reach. Keyed effect:opening_reach (M1 matches EFFECT_DEFS ids by this exact key) even though `source.kind` is 'always', not 'effect' -- firstPhysicalAttackDone is consumed on the first qualifying hit regardless of gear, same reasoning as Storm Barrier/Stonewarden (increment 3c), so the SOURCE can't be a plain hasEffect gate; the key still names which EFFECT_DEFS id this is. Norrvael 6pc's upgrade (1.15x -> 1.3x) applies to the player only, via resolveUpgradedValue; ally/enemy stay flat 1.15x, matching applyOpeningReachForActor's own comment ('no Norrvael 6pc widening, that's a player-only set') exactly.",
});
registerModifier("set:Norrvael:6", {
  source: { kind: "set", id: "Norrvael:6", setName: "Norrvael", tier: 6 },
  upgrades: "effect:opening_reach",
  hook: "calculateDamage.outgoing", order: 200, bucket: null, value: 1.3, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Opening Reach upgrade: 1.15x -> 1.3x, player only.",
});
registerModifier("effect:clash_of_steel", {
  source: { kind: "effect", id: "clash_of_steel" },
  hook: "calculateDamage.outgoing", order: 210, bucket: "conditional", lateOutgoingPhase: "clashOfSteel",
  value: (ctx) => hasEffect(ctx.holder, "clash_of_steel") ? 1.5 : 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Clash of Steel: Riposte's counter-damage gets 50% additional. Riposte itself is player-only today and widening it to ally is explicitly P2-5/2e's own job (see the 2e handoff) -- this entry's holders stay player-only to match, not because of any new decision here.",
});
registerModifier("effect:dra_e01_ice_forged_edge", {
  source: { kind: "effect", id: "dra_e01_ice_forged_edge" },
  hook: "calculateDamage.outgoing", order: 220, bucket: "conditional", lateOutgoingPhase: "enemyWearer1",
  value: (ctx) => hasEffect(ctx.holder, "dra_e01_ice_forged_edge") ? 1.10 : 1, behavior: null,
  when: (ctx) => ctx.kind === "flat", holders: ["enemy"], state: null,
  notes: "Ice Forged Edge (DRA-E01). Flat/physical branches only -- today's own code never checks it in either magic branch. No edmg>0 gate, matching today's exact condition.",
});
registerModifier("effect:dra_e04_unbroken_grip", {
  source: { kind: "effect", id: "dra_e04_unbroken_grip" },
  hook: "calculateDamage.outgoing", order: 221, bucket: "conditional", lateOutgoingPhase: "enemyWearer1",
  value: null, behavior: "unbrokenGripRatio", params: null,
  when: (ctx) => ctx.kind === "flat", holders: ["enemy"], state: null,
  notes: "Unbroken Grip (DRA-E04). A behavior -- consumes creature.unbrokenGripUsed, a real once-per-fight flag. Unlike Opening Reach/Storm Barrier, this flag is only ever touched when the effect is actually present -- matching today's own `hasEffect(...) && !creature.unbrokenGripUsed` condition, both checked together, not split.",
});
registerModifier("effect:dra_e06_executioners_seal", {
  source: { kind: "effect", id: "dra_e06_executioners_seal" },
  hook: "calculateDamage.outgoing", order: 222, bucket: "conditional", lateOutgoingPhase: "enemyWearer2",
  value: (ctx) => hasEffect(ctx.holder, "dra_e06_executioners_seal") && ctx.defenderHp <= ctx.defenderMaxHp * 0.3 ? 1.20 : 1, behavior: null,
  when: (ctx) => ctx.kind === "flat", holders: ["enemy"], state: null,
  notes: "Executioner's Seal (DRA-E06). Reads the DEFENDER's own HP% (ctx.defenderHp/defenderMaxHp, already populated at every enemyCore dispatch point) -- the ally or the player, whichever this creature is actually attacking, not the enemy's own HP.",
});
registerModifier("effect:dra_e09_black_ice_reserve", {
  source: { kind: "effect", id: "dra_e09_black_ice_reserve" },
  hook: "calculateDamage.outgoing", order: 223, bucket: "conditional", lateOutgoingPhase: "enemyWearer2",
  value: (ctx) => ctx.edmg > 0 && hasEffect(ctx.holder, "dra_e09_black_ice_reserve") && ctx.holder.blackIceReservePending ? 1.10 : 1, behavior: null,
  when: (ctx) => ctx.kind === "flat", holders: ["enemy"], state: null,
  notes: "Black Ice Reserve (DRA-E09). A pure read of creature.blackIceReservePending -- whatever sets/clears that flag is a different mechanic, out of this migration's scope; this entry only moves the READ, unchanged.",
});
registerModifier("effect:sang_cu_ie012_tyrants_edge", {
  source: { kind: "effect", id: "sang_cu_ie012_tyrants_edge" },
  hook: "calculateDamage.outgoing", order: 224, bucket: "conditional", lateOutgoingPhase: "enemyWearer2",
  value: null, behavior: "tyrantsEdgeRatio", params: null,
  when: (ctx) => ctx.kind === "flat", holders: ["enemy"], state: null,
  notes: "Tyrant's Edge (Sanguivorum Criminal Underworld). A behavior -- cooldown (3 rounds) + a 2-uses-per-combat cap, both real state on creature. Reads the defender's own HP% (<=35%), same ctx fields as Executioner's Seal.",
});
registerModifier("effect:dra_e07_unquenched_focus", {
  source: { kind: "effect", id: "dra_e07_unquenched_focus" },
  hook: "calculateDamage.outgoing", order: 225, bucket: "conditional", lateOutgoingPhase: "enemyWearerMagic",
  value: null, behavior: "unquenchedFocusRatio", params: null,
  when: (ctx) => ctx.kind === "magic" && (ctx.targetRole === "player" || COMBAT_UNIFY.U2), holders: ["enemy"], state: null,
  notes: "Unquenched Focus (DRA-E07). Magic branches only. Unconditional for the player-target branch; gated by COMBAT_UNIFY.U2 (off by default) for the ally-target branch, matching today's exact asymmetry -- see enemyCore's own U2 comment. `ctx.targetRole` (the DEFENDER's role -- 'player' or 'ally') is distinct from `ctx.role`, which is always 'enemy' here (the dispatch HOLDER's own role).",
});
registerModifier("effect:elemental_focus", {
  source: { kind: "effect", id: "elemental_focus" },
  hook: "calculateDamage.outgoing", order: 230, bucket: "conditional", elementCastPhase: true,
  value: (ctx) => hasEffect(ctx.holder, "elemental_focus") ? elementalFocusMultiplier(ctx.holder, ctx.role) : 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Elemental Focus. elementalFocusMultiplier(holder, role) itself is unconditional (always >=1.08) -- the hasEffect gate lives at this call site, exactly matching today's separate `focusActive` check. Novitiate:4/Kabal:4/Pre-Kabal:4 upgrades already staged, Amendment 1 gap close.",
});
registerModifier("effect:surging_conduit", {
  source: { kind: "effect", id: "surging_conduit" },
  hook: "calculateDamage.outgoing", order: 231, bucket: "burst", elementCastPhase: true,
  value: null, behavior: "surgingConduitRatio", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Surging Conduit. Burst bucket (primed/limited-use, matching Bucket Review Rule 2 exactly -- a per-fight charge count). A behavior -- consumes combat.player.surgingConduitUsesLeft, initialized elsewhere at fight start (out of this migration's scope).",
});
registerModifier("effect:twin_rivers", {
  source: { kind: "effect", id: "twin_rivers" },
  hook: "calculateDamage.outgoing", order: 232, bucket: "conditional", elementCastPhase: true,
  value: (ctx) => hasEffect(ctx.holder, "twin_rivers") && ctx.state.combat.player.lastElementUsed ? 1.4 : 1, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Twin Rivers: 1.4x when this isn't the fight's first elemental cast. MUST be dispatched exactly where it is today (calculateElementCastMultiplier, called before lastElementUsed is overwritten for the current cast) -- see that function's own header.",
});
// calculateDamage.outgoing, late phase (2d close-out, M1 cleanup):
// Ambush's own multiplier. `source: {kind: "always"}` -- the base 1.4x
// applies to every Ambush regardless of gear; EFFECT_DEFS.ambush_mastery
// only conditionally RAISES it (1.4x -> 1.55x), so gating the whole
// entry on `hasEffect(holder, "ambush_mastery")` would wrongly drop the
// base multiplier for a player without the item. Keyed "effect:ambush_mastery"
// to satisfy M1's exact per-id lookup anyway, same exception opening_reach
// already uses. `ambushMultiplier(holder, role)` is reused unchanged --
// it still does its own hasEffect check for the 1.55x bump and its own
// resolveUpgradedValue("effect:ambush", ...) call for Scout Corps:6's
// 1.7x override (already staged, set:Scout Corps:6 above) -- only the
// DISPATCH POINT (tactics.js's own extraDamageMultiplierFn call) moves,
// not the value logic itself.
registerModifier("effect:ambush_mastery", {
  source: { kind: "always" },
  hook: "calculateDamage.outgoing", order: 240, bucket: "conditional", lateOutgoingPhase: "ambush",
  value: (ctx) => ambushMultiplier(ctx.holder, ctx.role), behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Ambush's own damage multiplier (base 1.4x; 1.55x with ambush_mastery; 1.7x with Scout Corps:6, via the existing resolveUpgradedValue chain on 'effect:ambush'). Dispatched only when the Ambush action itself runs (tactics.js's lateOutgoingGroup field) -- Ambush is a chosen tactic, not a passive, so there's no per-hit `when` gate beyond that.",
});
// calculateDamage.outgoing, late phase (2d close-out, M1 cleanup):
// Borrowed Seconds's damage-bonus branch only (the cooldown-refund
// branches -- Decoy/Disarm/elemental casts -- are reaction-cooldown,
// 2e-3 territory, untouched). `source: {kind: "effect"}` here (unlike
// Ambush above) because the ENTIRE +15% bonus, not just a bump on top
// of some baseline, requires the item: without it, sourceActiveOn
// filters this entry out of modifiersForHook entirely and the dispatch
// below is a true no-op (edmg unchanged), matching today's
// `action.borrowedSecondsBonusInDamage && borrowedSecondsActive(state)`
// gate exactly. borrowedSecondsActive(holder) is reused unchanged --
// a pure read (actionCounter % 4), no state mutation, so no behavior
// is needed.
registerModifier("effect:borrowed_seconds", {
  source: { kind: "effect", id: "borrowed_seconds" },
  hook: "calculateDamage.outgoing", order: 241, bucket: "burst", lateOutgoingPhase: "borrowedSeconds",
  value: (ctx) => borrowedSecondsActive(ctx.holder) ? 1.15 : 1, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Borrowed Seconds's damage-bonus branch (basic_attack/ambush only, per action.borrowedSecondsBonusInDamage -- every cooldown-bearing action gets the refund branch instead, untouched/2e-3). Burst bucket: every-4th-action is a primed/limited-use trigger, Bucket Review Rule 2.",
});
