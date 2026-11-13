/*
 * FRAGMENTA — Combat Rebuild Phase 2, Step 2a: the Modifier Registry.
 * Spec: tools/combat_rebuild_phase2_spec.md. Catalogue of what migrates
 * in here, step by step: tools/modifier_catalogue.md.
 *
 * This file is the skeleton only — MODIFIERS starts EMPTY. Steps 2b-2g
 * migrate entries in, one pipeline step at a time, each migration
 * byte-identical to today's behavior (spec §5: "move first, change
 * later"). Nothing in the engine calls modifiersFor()/modifiersForHook()
 * yet, so adding this script tag changes no runtime behavior — it's
 * pure, unused infrastructure until a later step wires it in.
 *
 * The point of the registry: every in-combat effect (gear, set bonus,
 * enemy passive, status stat penalty) becomes ONE data entry instead of
 * hand-placed code at its point of use (today: 194 hasEffect() calls +
 * 63 hasSetTier() calls across combat.js/pipeline.js/resolver.js, plus
 * 169 enemy passives already data-driven through 64 trigger types in
 * ENEMY_ABILITIES — see the catalogue for the full count). A rule
 * written once then works for the player, allies and enemies alike,
 * gated by `holders` rather than by which function happens to call it.
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

// ---- the registry itself ----
// Keyed "kind:id" ("effect:executioner", "set:Legion:6",
// "passive:cornered", "status:chilled", "item:hadrian_roll_of_the_ferratum").
// Entry shape (spec §3):
//   {
//     source: { kind: "effect"|"set"|"passive"|"status"|"item"|"skill", id, ... },
//     hook: "calculateDamage.outgoing" | statHook("atk") | ...,
//     bucket: "conditional" | "stacking" | "burst" | "crit" | "variance"
//             | "defenseIgnore" | "incomingMitigation" | null,  // required for damage/defense multipliers
//     value: number | (ctx) => number,                          // pure
//     when: null | (ctx) => boolean,                            // pure, optional
//     holders: ["player"] | ["player","ally"] | ["player","ally","enemy"] | ["<specific id>"],
//     state: null | { ... },   // per-fight state this entry owns, reset at fight start
//     notes: "string",
//   }
// Empty until 2b-2g. tools/audit.js's M1-M5 (added this step, as
// warnings) track migration coverage from here on.
const MODIFIERS = {};

function registerModifier(key, entry) {
  if (MODIFIERS[key]) throw new Error(`modifiers.js: duplicate key "${key}"`);
  if (!entry.source || !entry.source.kind) throw new Error(`modifiers.js: "${key}" has no source.kind`);
  if (!isKnownHook(entry.hook)) throw new Error(`modifiers.js: "${key}" has an unknown hook "${entry.hook}"`);
  if (!Array.isArray(entry.holders) || !entry.holders.length) throw new Error(`modifiers.js: "${key}" has no holders`);
  if (entry.bucket != null && !isKnownBucket(entry.bucket)) throw new Error(`modifiers.js: "${key}" has an unknown bucket "${entry.bucket}"`);
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
// each entry's own `when` (if any). This is the lookup steps 2b-2g wire
// into the pipeline's leaf functions in place of a fresh hasEffect()/
// hasSetTier() call at their point of use. Still unused as of 2a.
function modifiersForHook(holder, holderRole, hook, ctx) {
  return modifiersFor(holder, holderRole).filter((entry) => {
    if (entry.hook !== hook) return false;
    return typeof entry.when !== "function" || entry.when(ctx);
  });
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
