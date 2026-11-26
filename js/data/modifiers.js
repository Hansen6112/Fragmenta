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
  "calculateDamage.tags", "calculateDamage.cap", "calculateDamage.baseRoll",
  // calculateDamage.enemyFlatReduction (2f, 25 Nov): Thick Hide and its
  // 10 siblings' own home. NOT "calculateDamage.incoming" -- that hook
  // is also fanned out by calculateEnemyIncomingMultiplier (the
  // Sanguivorum sangMit combinator's own flat/unrounded product, called
  // from combat.js:1991, pipeline.js:1651, actions.js:338/371/398) via
  // runHook(), which matches on entry.hook alone and does not care how
  // any OTHER caller chose to dispatch the same entry. Registering these
  // 11 entries under "calculateDamage.incoming" put them on BOTH that
  // fan-out AND applyEnemyFlatDamageReduction's own explicit by-key
  // dispatch (runHookEntryValue, which reads MODIFIERS[key] directly and
  // never consults entry.hook) -- a real double-application bug caught
  // by P1E-I-ENEMYPASSIVE-FLATREDUCTION-01 (45 expected, 41 produced: the
  // 10% ratio applied twice). This dedicated hook is never fanned out by
  // anything -- applyEnemyFlatDamageReduction's loop is these 11 entries'
  // only caller -- so by-key dispatch is now the only path to them.
  "calculateDamage.enemyFlatReduction",
  "applyAndReact.onHitDealt", "applyAndReact.onHitTaken", "applyAndReact.onMiss",
  "applyAndReact.onZeroDamage", "applyAndReact.onKill", "applyAndReact.onDowned",
  "applyAndReact.onStatusApplied", "applyAndReact.onActionUsed",
  // applyAndReact.onLowHealth (2e-1 close-out, 20 Nov, Tyler): LOW_HEALTH_REACTIONS'
  // own trigger (combat.js) -- a threshold crossing, checked once per
  // round alongside every other lowHealth reaction.
  "applyAndReact.onLowHealth",
  // applyAndReact.onFavorableRoll (2e-1 close-out, 20 Nov, Tyler): fires
  // whenever Regalia of the Laughing Gale's own randomness favors the
  // player (Loaded Dice's double-damage roll, Winds of Change's
  // per-round reroll, a miss triggering Unlikely Outcome) -- Twist of
  // Fate's own home.
  "applyAndReact.onFavorableRoll",
  // applyAndReact.onSummon (2e-2, 23 Nov, Tyler): fires for the summoner
  // right after a successful summon-creation (resolveEnemySummon,
  // combat.js), ctx.summons set to the new fighters' own summoned
  // records. Hunter's Call / Boarding Discipline's own home.
  "applyAndReact.onSummon",
  // applyAndReact.onTargeted (2e-2, 23 Nov, Tyler): fires for the
  // defender when a non-reaction attack is declared against it, hit or
  // miss (chooseAction, pipeline.js -- the same point today's inline
  // counter advances). Reinforced's own home.
  "applyAndReact.onTargeted",
  // applyAndReact.onKillLate (2e-2, 23 Nov): resolveKill's own LATE
  // position (after recomputeStats/the "enemy.killed" event, right
  // where applyPassingWhisper used to be called) -- a separate hook
  // from applyAndReact.onKill's own EARLY position (Blood Debt et al.,
  // right after the kill is confirmed) specifically so moving Passing
  // Whisper onto a registry entry can't also make Blood Debt/Blessing
  // of Valor/Keeper of History/Archive Eternal/Battle Scholar/Living
  // Legacy/Victor's Momentum double-fire by matching a second dispatch
  // of the SAME hook with no distinguishing ctx. Passing Whisper's own
  // home.
  "applyAndReact.onKillLate",
  // applyAndReact.onPhysicalHitLanded (2e-2, 23 Nov, Tyler): fires for
  // the PLAYER right when a landed, normal (non-reaction, non-ability)
  // physical hit is confirmed -- basic attack and the generic kit
  // resolver only, NOT Disarm (which checks Guarded Strike unconditionally,
  // a genuine pre-existing exception Tyler's own ruling kept untouched)
  // and not applyAndReact.onHitDealt (already taken by the lifesteal
  // sources, whose own `when` clauses would double-fire on a second
  // dispatch of that same hook at this new point). Guarded Strike's own
  // player-side home -- a direct, stateless value (grant and consume
  // happen in the same synchronous call, unlike the enemy/ally side's
  // real banked retaliationDef), so entries here return a plain number,
  // summed via sumNumeric, not a behavior.
  "applyAndReact.onPhysicalHitLanded",
  // applyAndReact.onEvade (2e-2 bug fix, 20 Nov, Tyler, approved):
  // fires whenever the player evades an attack, from any source of
  // evasion -- exactly the mechanics the game's own item text calls
  // "Evasion" (evasionCharges/evasionTurns' dedicated dodge roll, Avatar
  // of Freedom's own roll, Blessing of Freedom's own roll), not every
  // miss/negation in rollToHit.defender's broader "miss" phase chain.
  // Blessing of Freedom's own home.
  "applyAndReact.onEvade",
  // heal.incoming / heal.overflow (2e-1, 20 Nov): healFighter's own two
  // dispatch points -- see that function's header (combat.js) for the
  // full "one way in" shape (heal.incoming, applyHealing, heal.overflow).
  "heal.incoming", "heal.overflow",
  // heal.applied (2e-2, 23 Nov, Tyler): dispatched once, right after the
  // HP write (same point as heal.overflow, just unconditional -- fires
  // even when the actual amount healed is 0, e.g. already at full HP;
  // each member's own `when` reproduces whatever gate today's inline
  // code used). ctx.amountHealed carries the post-clamp amount. Living
  // Current, Compassion's Grace, Endless Current's own home.
  "heal.applied",
  "fight.start", "round.start", "turn.start", "fight.end",
  "cheatDeath",
  // cooldown.set (2e-3, 25 Nov, Tyler): the "resolve this cast's own
  // cooldown" moment -- useFeint/useDecoy/useDisarm/resolver.js's shared
  // Tactics sequence and useElementAbility's own mage-flavored sequence
  // (both pipeline.js/combat.js). Every member here is dispatched BY KEY,
  // at its own real, pre-existing position in one of those two already-
  // factored sequences (never hook fan-out -- several members share this
  // hook name purely for M1 bookkeeping while their real order/short-
  // circuit shape stays whatever the untouched surrounding code already
  // does). Covers the gate-bypass (Perfect Recall), the once-per-fight
  // free-cast sources (Perfect Timing, Hourglass Reserve, Swift Passage,
  // River's Favor/Novitiate:6), and the flat/probabilistic reducers
  // (Feinting Edge, Master Strategist/First Kingdom:6, Tactical Memory,
  // Conduit Mastery, Conduit Ease, Eureka, Universal Understanding).
  "cooldown.set",
  // statusTick.incoming (2d increment 3, Tyler 19 Nov, Bucket Review §3):
  // Ashward's own home -- a DoT-style status reduction read when a status
  // ticks, not a damage-roll multiplier, so it's its own hook rather than
  // calculateDamage.incoming. Reserved here; not dispatched yet.
  "statusTick.incoming",
  // applyAndReact.onSurvivedBelowPct (2f batch 2, 26 Nov): Veteran
  // Discipline/Last Stand/Resolute Command's own home (checkEnemyLowHealthTriggers,
  // combat.js) -- fires for the ENEMY the same round a hit against it
  // lands and it survives, checked immediately, not on a round cadence
  // like turn.start (tickEnemyPassives' own healthBelowPct/healthStagedBuff/
  // everyPctHealthLostStacking siblings just below, which ARE turn.start).
  // A deliberately separate hook from the player's own "applyAndReact.onLowHealth"
  // (checked once per round, not immediately after a hit) -- same
  // underlying idea, different cadence, so sharing one hook name would
  // misdescribe one side or the other even though by-key dispatch alone
  // would never actually collide.
  "applyAndReact.onSurvivedBelowPct",
  // calculateDamage.firstAttack (2f batch 4, 26 Nov): Ambush/Patient
  // Hunter/Prepared Opening and their siblings' own home
  // (firstAttackPassiveBonus, combat.js) -- NOT "calculateDamage.outgoing":
  // that hook's own early combinator (calculateOutgoingMultiplier) is
  // never called with holderRole "enemy", but its LATE sibling
  // (calculateLateOutgoingMultiplier) genuinely IS -- called with a
  // variable `role` from applyOpeningReachBonus's own "player/ally/enemy
  // alike" call site (combat.js:2296) -- so registering these 13 entries
  // under the shared hook name risked a real fan-out collision the
  // moment anyone added a future lateOutgoingPhase-filtered combinator
  // without that filter, the same shape batch 1's flatDamageReduction
  // bug took. By-key dispatch alone (firstAttackPassiveBonus never calls
  // runHook/modifiersForHook) already made this safe today, but a
  // dedicated hook removes the doubt for good rather than relying on
  // every future caller getting the filter right. `bucket: "conditional"`
  // on these entries is a LABEL only (M3 audit, avoiding the "no bucket"
  // warning) -- firstAttackPassiveBonus dispatches every entry by its own
  // explicit key, never through the bucket-summing combinator, same
  // precedent as calculateDamage.enemyFlatReduction's own bucket field.
  "calculateDamage.firstAttack",
  // calculateDamage.bonusVsHealthBelowPctAlways (2f batch 4, 26 Nov):
  // Apex Instinct's own home -- a flat multiplier the creature's own
  // Active-ability damage picks up unconditionally whenever its own
  // Health is below a threshold (resolveEnemyActiveAbility, combat.js),
  // distinct from every once-per-combat/threshold-crossing trigger
  // above (this one re-applies every time the Active fires, no
  // once-flag). Same by-key-only reasoning as calculateDamage.firstAttack
  // just above -- its own dedicated hook rather than calculateDamage.outgoing.
  // `bucket: "conditional"` is the same label-only convention as that
  // hook's own entries -- see its comment just above.
  "calculateDamage.bonusVsHealthBelowPctAlways",
  // applyAndReact.onHitTakenPassive (2f batch 4, 26 Nov): Barbed Hide/
  // Quills/Powdered Wings/Crystal Hide/Residual Memory/Countering Guard/
  // Arena Riposte/Arena Counter's own home -- deliberately NOT the
  // pre-existing "applyAndReact.onHitTaken" hook, even though every
  // call site this batch's own dispatch sites sit at (applyEnemyOnHitTakenPassives,
  // checkCounteringGuard, arenaRiposteCounterOnPlayer, all combat.js) is
  // by-key only. Caught during suite verification, not before: that
  // existing hook has a THIRD fan-out call site this batch's own research
  // missed entirely -- grantSureFoundationCharge (this file, above),
  // called with a variable holderRole that IS "enemy" in real play
  // (Sure Foundation's own holder, task 39) -- so these 8 entries'
  // holders:['enemy'] would have fanned out there too, with a ctx shape
  // (no ctx.creature) that crashed outright. The lesson restated: "both
  // fan-out call sites hardcode player" is only ever true of the call
  // sites actually found, and modifiers.js's OWN internal
  // runReactionHook/runHook callers are exactly as real a fan-out site
  // as anything in combat.js -- never just grep combat.js/pipeline.js
  // for a hook name and stop there.
  "applyAndReact.onHitTakenPassive",
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
// retaliationDef (2e-2, 23 Nov, Tyler): Guarded Strike's (enemy/ally),
// Brace's (player/enemy/ally), and Legion:6's (player) grant each still
// write their own FLAT field on the holder's own modifierStateHost
// (guardedStrikeBonusDef/braceBonusDef/legion6BonusDef) -- the exact
// same fields (two of the three) the real code has always used, not a
// new modifierState-backed representation. Deliberately NOT routed
// through modifierStateFor/sharedStateKey: several of this engagement's
// own frozen pipeline-parity fixtures simulate "a bonus already banked
// from a prior turn" by mutating creature.braceBonusDef/
// guardedStrikeBonusDef directly, bypassing any grant dispatch entirely
// -- moving the real storage into modifierState would silently stop
// honoring that (the fixture's own direct mutation would land somewhere
// this code never reads). Keeping the literal field names is also just
// correct: these three are read as a genuine three-way sum at a single
// point in time, never independently composed/overridden the way a
// real modifierState-backed entry's bucket math would need.
// peek (read only, for calculateDamage's own "what's the TARGET's
// banked bonus" look -- today's own `bankedDefBonus` at the defense-
// ignore step, PEEKED not consumed there) and consume (read AND zero,
// today's own exact read-then-clear pattern, at every clear point the
// real code has) are two different operations on the same fields, same
// split the real code already makes between calculateDamage's own peek
// and applyAndReact's own consume.
function peekRetaliationDefBonus(holder, holderRole) {
  const host = modifierStateHost(holder, holderRole);
  const legion6 = holderRole === "player" ? (host.legion6BonusDef || 0) : 0;
  return (host.guardedStrikeBonusDef || 0) + (host.braceBonusDef || 0) + legion6;
}
function consumeRetaliationDefBonus(holder, holderRole) {
  const host = modifierStateHost(holder, holderRole);
  const legion6 = holderRole === "player" ? (host.legion6BonusDef || 0) : 0;
  const total = (host.guardedStrikeBonusDef || 0) + (host.braceBonusDef || 0) + legion6;
  if (holderRole === "player") {
    // The player's own Brace/Legion:6 never had a persistent field at
    // all before today (always a local variable) -- only clear a field
    // that's actually nonzero, so a cast with neither effect active
    // doesn't stamp a brand-new, always-0 field onto combat.player that
    // never existed before (a real schema change, not a relocation).
    if (host.guardedStrikeBonusDef) host.guardedStrikeBonusDef = 0;
    if (host.braceBonusDef) host.braceBonusDef = 0;
    if (host.legion6BonusDef) host.legion6BonusDef = 0;
  } else {
    // Enemy/ally: today's own code unconditionally zeroes both fields
    // every time, regardless of whether anything was ever banked --
    // keeping that exactly (these two fields already always existed on
    // every creature/ally record after its first hit, win or lose).
    host.guardedStrikeBonusDef = 0;
    host.braceBonusDef = 0;
  }
  return total;
}
// Sure Foundation (DRA-E05, 2e-2, 23 Nov, Tyler) -- the same "peek-then-
// defer" shape as retaliationDef above, but its OWN holder state
// (sureFoundationBonusDef/sureFoundationBonusDefTurnsLeft), since it's
// never summed together with Guarded Strike/Brace/Legion:6 at any real
// read site (combat.js/pipeline.js add it as a separate term, not
// through peekRetaliationDefBonus). Today's only real holder is
// "enemy" (bestiary.js can equip a boss with Stillwater Sabatons the
// same way the player's own loot table does; no code path ever checks
// this effect against the PLAYER despite the item also existing in the
// player's loot table under "First Sword's Regalia" -- the catalogue's
// old "player" holders value was simply wrong, same correction Guarded
// Strike's row needed). Flat field, not modifierState-backed, for the
// same frozen-fixture-direct-mutation reason as retaliationDef (several
// pipeline-parity fixtures set creature.sureFoundationBonusDef directly
// to simulate "already banked"). The decay tick (combat.js, once per
// round, "expires after one full global turn if unused") stays
// untouched inline -- it's a passive timer on this same field, not a
// reaction to anything, so it doesn't fit any hook shape.
function grantSureFoundationCharge(holder, holderRole, ctx) {
  const host = modifierStateHost(holder, holderRole);
  host.sureFoundationBonusDef = 0;
  host.sureFoundationBonusDefTurnsLeft = 0;
  runReactionHook("applyAndReact.onHitTaken", holder, holderRole, ctx);
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
    .filter((e) => !e.upgrades && !e.lateOutgoingPhase && !e.elementCastPhase && !e.amplifies);
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

// calculateDamage.baseRoll (2e §3 follow-up, 20 Nov, Tyler's own
// ruling): a base-roll BEHAVIOUR, not a multiplier -- it runs BEFORE
// any calculateDamage.outgoing bucket even exists (Bucket Review Rule
// 3: class mechanics, same family as synergy/tags, stay outside the
// buckets). Returns the (possibly rerolled) base value directly, not a
// factor -- every entry here is `directApply`-shaped by construction
// (there is no "ratio" reading for "reroll and keep the higher of two
// rolls"), so this combinator takes the seed base from `ctx.base` and
// threads it through each matching entry's own replacement value, same
// one-behavior-today shape as the other single-member combinators
// (calculateStatusTickMultiplier, calculateEnemyIncomingMultiplier).
function calculateBaseRollAdvantage(holder, holderRole, ctx) {
  const entries = modifiersForHook(holder, holderRole, "calculateDamage.baseRoll", ctx);
  let base = ctx.base;
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, key, entry);
    ctx.base = base;
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "number") base = result;
  }
  return base;
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

// heal.incoming (2e-1, 20 Nov): the healing-RECEIVED chain healFighter
// (combat.js) runs before writing HP -- today's own applyHeal body,
// unchanged in order/rounding, just moved into registry entries:
// Flourishing Soul (1.5x), Blessing of Compassion/Eternal Heart:2
// (1.25x), Avatar of Devotion (2x, reads combat.player.avatarOfDevotionTurns),
// Avatar of Endurance (1.5x, reads combat.player.avatarOfEnduranceTurns),
// Mercy's Gift (1.5x below 50% HP), healingReceivedPct status total
// (Ashen Lungs and anything else in that family). Same sequential,
// per-step-rounding shape as calculateIncomingDamage -- reuses
// threadIncomingEntries directly, since "Math.round(amt * v)" each
// step is exactly today's own chain. `upgrades` entries are excluded
// the same way every other combinator already does.
function calculateHealIncoming(holder, holderRole, ctx, amount) {
  const entries = modifiersForHook(holder, holderRole, "heal.incoming", ctx).filter((e) => !e.upgrades);
  return threadIncomingEntries(entries, ctx, holder, holderRole, amount);
}

// heal.overflow (2e-1, 20 Nov): dispatched once, right after the HP
// write, with ctx.overflow set to the pre-clamp amount minus the
// actual amount healed. One member today, Regalia of the First
// Bloom:4 (Overflowing Life) -- returns an optional output line
// (string or string[]), not a number; nothing here feeds back into
// the heal amount itself, so this isn't threaded like heal.incoming.
function calculateHealOverflow(holder, holderRole, ctx) {
  const entries = modifiersForHook(holder, holderRole, "heal.overflow", ctx);
  const lines = [];
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, key, entry);
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "string") lines.push(result);
    else if (Array.isArray(result)) lines.push(...result);
  }
  return lines;
}

// heal.applied (2e-2, 23 Nov, Tyler): dispatched unconditionally right
// after the HP write (ctx.amountHealed already set by the caller) --
// same per-entry shape as heal.overflow above, just not gated on
// overflow>0. Members that only fire on a real heal reproduce that via
// their own `when: (ctx) => ctx.amountHealed > 0`, matching each one's
// original inline `if (healed > 0 && ...)` gate exactly.
function calculateHealApplied(holder, holderRole, ctx) {
  const entries = modifiersForHook(holder, holderRole, "heal.applied", ctx);
  const lines = [];
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, key, entry);
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "string") lines.push(result);
    else if (Array.isArray(result)) lines.push(...result);
  }
  return lines;
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

// Amendment 1 flagged this as superseded by runHook() for any new work
// where the registry entry's own behavior/value IS the real effect --
// a presence-only check can't carry that when R1/R2 widen holders,
// since there's nothing for the widened holder to actually receive.
// Revived for 2e-3 (25 Nov, Tyler) for the opposite, equally real case:
// a gate bypass, a once-only override, or a combined OR-presence check
// where the CALL SITE's own surrounding arithmetic already IS the
// complete effect (Perfect Recall's gate, Feinting Edge's override-to-1,
// Master Strategist/First Kingdom:6's shared flat -1, Hourglass
// Reserve/Swift Passage's seed checks) -- there, `value: true` is this
// entry's whole, correct "value" (M3 is satisfied), and no behavior
// could add anything a widened holder would actually use, because the
// call site itself stays scoped to whichever role it's literally
// written for. Still wrong for anything whose real value (a number, a
// line, a stateful flag) needs to travel with the holder -- those stay
// on runHook/runHookEntry/behaviors as before.
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
// Blessing of Freedom's own 15% roll (2e-2 bug fix, 20 Nov): the same
// blockFlatChance roll/shape, but this is one of the 3 mechanics the
// game's own item text calls "Evasion" (not just "miss"), so a success
// here ALSO dispatches applyAndReact.onEvade -- a dedicated behavior
// instead of the shared blockFlatChance, purely for that one extra
// dispatch. `ctx` here carries `state`/`holder`/`role` (added to the
// "miss" phase's own ctx construction, rollToHit, pipeline.js) so this
// can reach healFighter the same way every other applyAndReact entry
// does. Returns `miss` as an array (line + whatever onEvade's own
// entries produced) -- the "miss" phase's caller now accepts either a
// string or a string[] for this exact reason.
registerBehavior("blessingOfFreedomEvade", (ctx, entry) => {
  if (Math.random() >= entry.params.chance) return null;
  const evadeLines = runReactionHook("applyAndReact.onEvade", ctx.holder, ctx.role, ctx);
  return { stop: true, miss: [entry.params.line, ...evadeLines] };
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
// Excludes `statBonus`/`statMultiplier` entries (2e §3 follow-up, 20
// Nov) -- those share this same hook name but are dispatched by
// calculateStatBonus/calculateStatMultiplier below instead; this
// function is specifically for the "override/floor a reduction" shape
// Bedrock uses, not an additive term or a finishing multiplier.
function applyStatDefFloor(holder, holderRole, base, reduced) {
  const results = runHook(statHook("def"), holder, holderRole, { base, reduced });
  for (const r of results) if (!r.entry.statBonus && !r.entry.statMultiplier && typeof r.result === "number") return r.result;
  return reduced;
}

// calculateStatBonus (2e §3 follow-up, 20 Nov): a flat ADDITIVE term
// fed into a stat total -- Perfect Balance (+2 atk/def when they're
// within 2 of each other) and Expanding Mind (+1 Magic per 5 Knowledge
// above 50) are both "a live formula off other stats," not a stacking/
// triggered counter, so a plain `value` function (no behavior/state)
// suffices for both. `statBonus: true` on every entry here keeps
// applyStatDefFloor's own runHook dispatch (same "stat.def" hook name)
// from ever treating one of these as its own floor-override result.
function calculateStatBonus(holder, holderRole, key, ctx) {
  const entries = modifiersForHook(holder, holderRole, statHook(key), ctx).filter((e) => e.statBonus);
  let total = 0;
  for (const entry of entries) {
    const keyName = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, keyName, entry);
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "number") total += result;
  }
  return total;
}

// calculateStatMultiplier (2e §3 follow-up, 20 Nov): a finishing
// multiplier applied LAST, on top of a stat's already-fully-assembled
// value -- The Empty Hand (1.5x Attack/1.25x Defense with no Off-Hand
// equipped) is the only member today. Sequential rounding (matching
// Math.round(this.atk * 1.5) exactly for the one-entry case; threads
// through any future second entry the same way calculateOutgoingMultiplier's
// own product does, just rounded once per step instead of at the end,
// since recomputeStats's own call site only ever rounds once per stat
// today). `statMultiplier: true` keeps this out of applyStatDefFloor's
// own dispatch, same reasoning as `statBonus` above.
function calculateStatMultiplier(holder, holderRole, key, ctx, base) {
  const entries = modifiersForHook(holder, holderRole, statHook(key), ctx).filter((e) => e.statMultiplier);
  let value = base;
  for (const entry of entries) {
    const keyName = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, keyName, entry);
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "number") value = Math.round(value * result);
  }
  return value;
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
  hook: "rollToHit.defender", order: 50, bucket: null, value: null, behavior: "blessingOfFreedomEvade",
  params: { chance: 0.15, line: "Blessing of Freedom carries you clear of the blow." },
  when: (ctx) => ctx.phase === "miss", holders: ["player"], state: null,
  notes: "Blessing of Freedom's own 15% Evasion chance. 2e-2 bug fix (20 Nov): behavior changed from the shared blockFlatChance to blessingOfFreedomEvade (same roll/shape) so a success also dispatches applyAndReact.onEvade for the heal -- see set:Regalia of the Endless Horizon:2:blessing_of_freedom_heal, right below.",
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

// ---- applyAndReact.onSummon (2e-2, 23 Nov, Tyler): Hunter's Call /
// Boarding Discipline, dispatched from resolveEnemySummon (combat.js)
// right after a successful summon-creation. ctx.summons holds the
// summoned records from THIS cast; the behavior picks one at random and
// grants it +5 Accuracy for 2 of its own turns, once per fight -- same
// shared-flag precedent as Calculated Aim/Concealed Edge above (today's
// code gates both ids behind one creature.huntersCallUsed flag).
registerBehavior("huntersCallBuffSummon", (ctx, entry, holderState) => {
  if (holderState.used) return undefined;
  holderState.used = true;
  const summons = ctx.summons;
  if (!summons || !summons.length) return undefined;
  const chosen = summons[Math.floor(Math.random() * summons.length)];
  applyEnemySelfModifier(ctx.combat, chosen.creatureObj, { acc: 5, turns: 2 });
  return undefined;
});
registerModifier("effect:sang_cu_ie009_hunters_call", {
  source: { kind: "effect", id: "sang_cu_ie009_hunters_call" },
  hook: "applyAndReact.onSummon", order: 10, bucket: null, value: null, behavior: "huntersCallBuffSummon", params: null,
  sharedStateKey: "enemy:huntersCallSummonBuff", when: null, holders: ["enemy"], state: { used: false },
  notes: "Hunter's Call. Shares its once-per-fight 'used' flag with Boarding Discipline via sharedStateKey -- today's code gates both ids behind ONE creature.huntersCallUsed flag, picking a random new summon from this cast and granting +5 Accuracy for 2 turns.",
});
registerModifier("effect:sang_mil_ie006_boarding_discipline", {
  source: { kind: "effect", id: "sang_mil_ie006_boarding_discipline" },
  hook: "applyAndReact.onSummon", order: 11, bucket: null, value: null, behavior: "huntersCallBuffSummon", params: null,
  sharedStateKey: "enemy:huntersCallSummonBuff", when: null, holders: ["enemy"], state: { used: false },
  notes: "Boarding Discipline. Same shared flag and mechanism as Hunter's Call (its own wording asks for the first-spawned summon deterministically, but reusing the identical random-pick path was the explicit original-implementation ask, per the catalogue's own note) -- see that entry's notes.",
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
  notes: "Loaded Dice. A behavior (not a bare value) because loadedDiceMultiplier itself dispatches applyAndReact.onFavorableRoll (Twist of Fate) on its favorable roll -- a real pre-existing state write, carried over unchanged. 'variance' bucket -- its own resolved number IS the raw multiplier (0.5/1/2.0), not an additive delta, matching critMultiplier's own convention and spec §4's 'stays as a product' note.",
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
// Leviathan:6: a Rule 1 upgrade of Water's own base self-heal % (2e-2,
// 22 Nov, Tyler) -- 50% -> 75%, same shape as Patient Aim's own upgrade
// of Feint. "action:water" is a pure virtual tag (no base registry
// entry; Water's self-heal is the element action's own behavior, not an
// EFFECT_DEFS/SETS bonus, same reasoning as "effect:feint") -- only
// waterHealPct's own resolveUpgradedValue call (js/data/sets.js) reads
// it. `hook`/`bucket: null` are required fields, never consulted for an
// `upgrades` entry (M3 exempts them); `calculateDamage.outgoing` here is
// nominal, matching the family this upgrade conceptually belongs to.
registerModifier("set:Leviathan:6", {
  source: { kind: "set", id: "Leviathan:6", setName: "Leviathan", tier: 6 },
  upgrades: "action:water",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 0.75, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Water self-heal upgrade: 50% -> 75%.",
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

// ---- 2e §3 follow-up (20 Nov, Tyler's rulings on the redirected rows) ----
// calculateDamage.baseRoll: Arcane Convergence (Artifact). Rolls the
// base spell damage twice and keeps the higher result -- an "advantage"
// reroll, not a flat multiplier, so it respects the natural
// magic-2..magic+2 spread rather than compressing it. `rerollAdvantage:
// true` is this entry's Phase-4 tag (Tyler's own ruling): a reroll
// changes the roll's EV in a way Phase 4's pricing pass needs to know
// about by name, the same reason a heal entry will declare `heal: true`
// -- Phase 2 only tags it, Phase 4 prices it. `ctx.base`/`ctx.magic` are
// populated by this entry's two call sites (rollPlayerDamage, combat.js;
// rollPlayerDamageCoreForPipeline, pipeline.js -- Riposte's own spell
// branch is still the one live caller of the former) with the exact
// values the inline code already computed (the first roll, and the
// magic stat it was rolled from) -- reads
// `ctx.holder`/`ctx.role`, not `ctx.state`, consistent with every other
// entry migrated this engagement.
registerModifier("effect:arcane_convergence", {
  source: { kind: "effect", id: "arcane_convergence" },
  hook: "calculateDamage.baseRoll", order: 10, bucket: null, value: (ctx) => Math.max(ctx.base, randInt(ctx.magic - 2, ctx.magic + 2)), behavior: null, params: null,
  when: null, holders: ["player"], state: null, rerollAdvantage: true,
  notes: "Arcane Convergence: rolls magic-2..magic+2 a second time and keeps the higher of the two, exactly matching today's `base = Math.max(base, randInt(magic - 2, magic + 2))`. Isolated to the player (today's own scope -- enemy elemental attacks use a different, non-quadratic formula; companions have their own separate damage path).",
});
// Patient Aim: a Rule 1 upgrade of Feint's own bonus (1.6x -> 1.75x),
// per Tyler's own ruling -- "also outside the buckets" like Arcane
// Convergence above, since Feint's bonus itself is Rule-3 territory
// (an action's own bonus multiplier, never dispatched through
// calculateDamage.outgoing). `upgrades: "effect:feint"` is a pure
// virtual tag (no base "effect:feint" registry entry exists, same as
// "effect:ambush"/"effect:executioner.threshold" before them) -- only
// feintMultiplier's own resolveUpgradedValue call ever reads it. `hook`/
// `bucket: null` are required fields on every entry but never consulted
// for an `upgrades` entry (M3 exempts them, same as every other Rule 1
// entry); `calculateDamage.outgoing` here is nominal, matching the
// family this upgrade conceptually belongs to.
registerModifier("effect:patient_aim", {
  source: { kind: "effect", id: "patient_aim" },
  upgrades: "effect:feint",
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: 1.75, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Feint bonus upgrade: 1.6x -> 1.75x.",
});
// Decisive Impact (sang_mil_ie005): once-per-fight +8%, enemy-holder,
// a real calculateDamage.outgoing bucket entry per Tyler's own ruling
// (Bucket Review Rule 2 -- a once-per-fight flag is "burst": primed/
// limited-use). Its OWN lateOutgoingPhase group (not folded into
// enemyWearer1/enemyWearer2) because its position relative to those two
// groups differs by branch: interleaved BETWEEN them in the player-
// target flat branch, but AFTER both of them (and after Flowing
// Discipline/Winter's Verdict) in the ally-target flat branch -- each
// branch's own call site dispatches this group exactly where the inline
// check used to sit, so the relative order is preserved exactly either
// way.
registerBehavior("decisiveImpactRatio", (ctx) => {
  if (ctx.edmg <= 0 || ctx.holder.decisiveImpactUsed) return 1;
  ctx.holder.decisiveImpactUsed = true;
  return 1.08;
});
registerModifier("effect:sang_mil_ie005_decisive_impact", {
  source: { kind: "effect", id: "sang_mil_ie005_decisive_impact" },
  hook: "calculateDamage.outgoing", order: 226, bucket: "burst", lateOutgoingPhase: "decisiveImpact",
  value: null, behavior: "decisiveImpactRatio", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Decisive Impact. Unconditional on a landed hit (edmg > 0), regardless of defender role -- today's own exact gate has no targetRole/COMBAT_UNIFY check at all, unlike Toxic Preparation below.",
});
// Toxic Preparation (sang_iag_ie008): once-per-fight, poison-gated, and
// ADDITIVE rather than multiplicative (`edmg += Math.max(1, Math.floor(
// edmg * 0.05))`) -- a real bucket entry (Rule 2, burst) but
// `directApply: true` since there's no ratio reading for "add a flat
// 5%-of-current-damage bonus, floored, minimum 1". `ctx.targetRole`
// carries the SAME asymmetry Unquenched Focus (dra_e07) already uses:
// unconditional for the player-target branch, gated behind
// COMBAT_UNIFY.U3d (off by default) for the ally-target branch, exactly
// matching today's own asymmetry (the ally branch reads the ally's own
// poison status and is U3d-gated; the player branch reads the player's
// own poison status and always fires). `ctx.targetPoisoned` is computed
// at each call site from the actual defender's own statuses, since
// "poisoned" means a different object's `.statuses`/`.playerStatuses`
// depending which branch dispatches this.
registerBehavior("toxicPreparationDirectApply", (ctx) => {
  if (ctx.edmg <= 0 || ctx.holder.toxicPreparationUsed || !ctx.targetPoisoned) return ctx.edmg;
  ctx.holder.toxicPreparationUsed = true;
  return ctx.edmg + Math.max(1, Math.floor(ctx.edmg * 0.05));
});
registerModifier("effect:sang_iag_ie008_toxic_preparation", {
  source: { kind: "effect", id: "sang_iag_ie008_toxic_preparation" },
  hook: "calculateDamage.outgoing", order: 227, bucket: "burst", lateOutgoingPhase: "toxicPreparation", directApply: true,
  value: null, behavior: "toxicPreparationDirectApply", params: null,
  when: (ctx) => ctx.targetRole === "player" || COMBAT_UNIFY.U3d, holders: ["enemy"], state: null,
  notes: "Toxic Preparation. Additive, not multiplicative -- directApply. Unconditional for the player-target branch; gated by COMBAT_UNIFY.U3d (off by default) for the ally-target branch, matching today's exact asymmetry.",
});
// Adaptive Ward (Mythic): calculateDamage.incoming, defender-side
// (confirmed distinct from adaptive_tide -- a different mechanic, own
// state fields, already its own registered entry above). Locks in the
// FIRST elemental damage type to land on the wearer this fight; a
// repeat hit of that SAME element takes 0.5x. `abilityPhase: true`,
// same reason Spell Ward/Storm Barrier/Stonewarden 6pc needed it (2d
// increment 3c): this check lives inside enemyCore itself, an earlier
// dispatch point than calculateIncomingDamage's own mitigateAndApplyHitOnPlayer
// call. `order: 1` (less than Spell Ward's 5) reproduces today's exact
// sequence -- Adaptive Ward ran BEFORE Spell Ward inline, and
// threadIncomingEntries' own per-step rounding makes "two entries in
// one dispatch, ascending order" and "two separate dispatches in
// sequence" produce an identical rounding sequence, so no new call
// site is needed: both existing calculateAbilityIncomingMultiplier
// calls (ally and player branches) already run right after this
// entry's own old inline position and now just pick it up too, as long
// as `creature` is added to their own ctx (needed to read the
// attacking enemy's own element) -- see those two call sites.
// abilityFlagHost(ctx) resolves the right storage object for the state
// (adaptiveWardElement lives on `ally` directly for role "ally", or on
// `state.combat.player` for role "player" -- same split
// stormBarrierRatio/firstHitTakenRatio/openingReachRatio already use).
registerBehavior("adaptiveWardRatio", (ctx) => {
  const host = abilityFlagHost(ctx);
  if (!host.adaptiveWardElement) {
    host.adaptiveWardElement = ctx.creature.element;
    return 1;
  }
  return ctx.creature.element === host.adaptiveWardElement ? 0.5 : 1;
});
// Perfect Balance (Divine Regalia): +2 to BOTH Attack and Defense when
// they're within 2 of each other (checked against raw, unboosted
// stats -- perfectBalanceBonus's own comment). Two entries, one per
// stat, since one registry entry can only declare one hook; both call
// the SAME unchanged perfectBalanceBonus(holder) function, so there's
// no risk of the two halves drifting out of sync with each other.
// `statBonus: true` on each -- see calculateStatBonus's own header.
registerModifier("effect:perfect_balance", {
  source: { kind: "effect", id: "perfect_balance" },
  hook: statHook("atk"), order: 20, bucket: null, value: (ctx) => perfectBalanceBonus(ctx.holder), behavior: null, params: null,
  when: null, holders: ["player"], state: null, statBonus: true,
  notes: "Perfect Balance, Attack half.",
});
registerModifier("effect:perfect_balance.def", {
  source: { kind: "effect", id: "perfect_balance" },
  hook: statHook("def"), order: 20, bucket: null, value: (ctx) => perfectBalanceBonus(ctx.holder), behavior: null, params: null,
  when: null, holders: ["player"], state: null, statBonus: true,
  notes: "Perfect Balance, Defense half. Compound key (not the bare 'effect:perfect_balance' M1 needs) since the Attack half above already claims that key for the same effect id -- same convention as effect:adaptive_tide.physical/.magic.",
});
// Expanding Mind (Divine Regalia): +1 Magic per 5 effective Knowledge
// above 50, read live every recompute -- expandingMindMagicBonus
// (combat.js) is the exact formula effectiveMagic used inline before
// this migration.
registerModifier("effect:expanding_mind", {
  source: { kind: "effect", id: "expanding_mind" },
  hook: statHook("magic"), order: 20, bucket: null, value: (ctx) => expandingMindMagicBonus(ctx.holder), behavior: null, params: null,
  when: null, holders: ["player"], state: null, statBonus: true,
  notes: "Expanding Mind.",
});
// The Empty Hand (Artifact): +50% Attack/+25% Defense with no Off-Hand
// equipped, applied LAST on top of every other atk/def source --
// `statMultiplier: true` (see calculateStatMultiplier's own header),
// two entries (one per stat) for the same reason Perfect Balance needed
// two. `when` carries the !equipment.offhand half of today's gate;
// `source.kind: "effect"` carries the hasEffect half.
registerModifier("effect:empty_hand", {
  source: { kind: "effect", id: "empty_hand" },
  hook: statHook("atk"), order: 900, bucket: null, value: 1.5, behavior: null, params: null,
  when: (ctx) => !ctx.holder.equipment.offhand, holders: ["player"], state: null, statMultiplier: true,
  notes: "The Empty Hand, Attack half.",
});
registerModifier("effect:empty_hand.def", {
  source: { kind: "effect", id: "empty_hand" },
  hook: statHook("def"), order: 900, bucket: null, value: 1.25, behavior: null, params: null,
  when: (ctx) => !ctx.holder.equipment.offhand, holders: ["player"], state: null, statMultiplier: true,
  notes: "The Empty Hand, Defense half. Compound key, same reasoning as effect:perfect_balance.def above.",
});
// Master of Arms (Artifact): a cross-cutting amplifier, not a damage
// multiplier of its own -- 2e §3 ruling (Tyler, 20 Nov). `amplifies`
// lists every effect key it doubles (EFFECT_DEFS.master_of_arms's own
// description: "only for passives with a well-defined 'doubled'
// meaning" -- each one's own specific doubled value, not a generic x2,
// since Kingslayer's 1.25x->1.5x and Execution Protocol's 2->3 are
// each their own number). `hook`/`holders` are nominal (never dispatched
// -- calculateOutgoingMultiplier's own filter excludes `amplifies`
// entries explicitly, same as `upgrades`), since masterOfArmsDoubles
// (combat.js) is the real consumer: every one of its 9 call sites now
// reads THIS entry's own `amplifies` array as the source of truth,
// instead of an implicit, undocumented list. 5 of the 8 keys already
// have their own calculateDamage.outgoing entries (kingslayer,
// hunters_instinct, arcane_overflow, execution_protocol, temporal_echo);
// soul_leech/blood_debt/spell_echo don't yet (2e-1/2e-2 territory) --
// masterOfArmsDoubles already works correctly for all 8 regardless,
// since it only ever reads this array and mainhandGrants, neither of
// which cares whether the AMPLIFIED effect itself has its own entry yet.
registerModifier("effect:master_of_arms", {
  source: { kind: "effect", id: "master_of_arms" },
  hook: "calculateDamage.outgoing", order: 999, bucket: null, value: null, behavior: null,
  when: null, holders: ["player"], state: null,
  amplifies: ["kingslayer", "hunters_instinct", "arcane_overflow", "execution_protocol", "temporal_echo", "soul_leech", "blood_debt", "spell_echo"],
  notes: "Master of Arms. Main-hand weapon passives trigger twice if applicable -- see masterOfArmsDoubles (combat.js) for the actual gate (hasEffect + mainhandGrants(effectId)), now reading this entry's own amplifies array.",
});
// applyAndReact.onActionUsed (2e §3 follow-up, 20 Nov, Tyler's own
// ruling): the first applyAndReact.* hook this registry actually
// dispatches (2e-1 through 2e-5 build out the rest, onHitDealt/onKill/
// etc). Fires whenever a TAGGED action resolves, hit or miss -- entries
// match via `when` reading ctx.actionTags (the acting action's own
// static `tags` array: ELEMENT_ABILITIES.*.action.tags/TACTICS.feint.action.tags),
// not a per-action id check, so dispatch stays generic even though
// only two call sites exist today (useElementAbility, useFeint). Lines
// are optional per entry (most behaviors here return nothing); returns
// the concatenation of whatever every matching entry's own behavior
// produced, pushed by the caller the same way applyEndlessStudy/
// applyWanderersReward already are.
function runOnActionUsed(holder, holderRole, ctx) {
  const results = runHook("applyAndReact.onActionUsed", holder, holderRole, ctx);
  const lines = [];
  for (const r of results) {
    if (typeof r.result === "string") lines.push(r.result);
    else if (Array.isArray(r.result)) lines.push(...r.result);
  }
  return lines;
}
// Generic applyAndReact.*/lifecycle reaction dispatcher (2e-1, 20 Nov):
// same "run every matching entry, collect whatever optional line(s) it
// returns" shape as runOnActionUsed above, generalized to any hook name
// -- reused for every heal SOURCE's own real trigger (onHitDealt, onKill,
// round.start, turn.start, fight.start, fight.end, onZeroDamage) instead
// of writing one near-identical wrapper per hook. runOnActionUsed itself
// is left exactly as-is (already shipped/tested); this is the general
// form it could have been built from.
function runReactionHook(hook, holder, holderRole, ctx) {
  const results = runHook(hook, holder, holderRole, ctx);
  const lines = [];
  for (const r of results) {
    if (typeof r.result === "string") lines.push(r.result);
    else if (Array.isArray(r.result)) lines.push(...r.result);
  }
  return lines;
}
// Dispatches exactly ONE named registry entry, not every entry sharing
// its hook (2e-1, 20 Nov) -- needed where several turn.start heals sit
// INTERLEAVED with non-heal inline code at their own distinct original
// call-site positions (beginTurn, combat.js: Living Steel between
// Heartwood Vitality and Lasting Foundation, Work Refines/Patient
// Current between Lasting Foundation and Flowing Waters/Avatar of
// Renewal). Batching them into one runReactionHook call at a single
// point would reorder their own output lines relative to that
// interleaved code, breaking byte-identical output whenever more than
// one fires in the same round. `entry.hook` still names "turn.start"
// (matching the catalogue's own documented hook assignment); dispatch
// here is by registry KEY, at the entry's own real call-site position,
// not hook-driven fan-out.
function runHookEntry(key, holder, holderRole, ctx) {
  const entry = MODIFIERS[key];
  if (!entry || !holder) return [];
  if (!sourceActiveOn(holder, entry.source)) return [];
  if (!(entry.holders.includes(holderRole) || entry.holders.includes(holder.id))) return [];
  if (typeof entry.when === "function" && !entry.when(ctx)) return [];
  const holderState = modifierStateFor(holder, holderRole, key, entry);
  const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
  if (typeof result === "string") return [result];
  if (Array.isArray(result)) return result;
  return [];
}
// Same by-key convention as runHookEntry just above, but for a hook
// whose own call-site convention isn't lines -- a caller-owned local
// value (a boolean, a computed {cooldown, fired}) the caller threads
// back into its own variable, instead of log text to concatenate (2e-3,
// 25 Nov: Perfect Timing/Tactical Memory's own preserved-signature
// wrapper functions, combat.js). Returns the behavior's raw result
// UNWRAPPED -- `undefined` if the entry isn't active at all (absent,
// holders mismatch, when-gate fails), so "not active" stays
// distinguishable from "active but returned a falsy value."
function runHookEntryValue(key, holder, holderRole, ctx) {
  const entry = MODIFIERS[key];
  if (!entry || !holder) return undefined;
  if (!sourceActiveOn(holder, entry.source)) return undefined;
  if (!(entry.holders.includes(holderRole) || entry.holders.includes(holder.id))) return undefined;
  if (typeof entry.when === "function" && !entry.when(ctx)) return undefined;
  const holderState = modifierStateFor(holder, holderRole, key, entry);
  return entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
}
// applyAndReact.onStatusApplied, self-granted shape (2e-2, 23 Nov,
// Tyler): applyBeneficialEffectBonuses's (combat.js) own call site --
// "a beneficial effect was just granted" to the SAME holder that
// granted it (source === target), so only the receiver side ever
// fires here. THREADED, not lines-collecting (unlike every other
// applyAndReact.* hook): Faithful Heart (order 10) returns the
// duration extended by 1, which Heartward Bond (order 20) then reads
// via ctx.duration to size its own buff grant -- today's exact order.
// A member that doesn't change the duration (Heartward Bond) just
// returns undefined and the running value passes through unchanged,
// same convention calculateIncomingDamage's own multiplier chain uses
// for a no-op step.
function threadStatusAppliedDuration(holder, holderRole, baseCtx, duration) {
  const ctx = { ...baseCtx, side: "receiver", source: holder, target: holder, holder, role: holderRole, duration };
  const entries = modifiersForHook(holder, holderRole, "applyAndReact.onStatusApplied", ctx);
  let d = duration;
  for (const entry of entries) {
    const key = Object.keys(MODIFIERS).find((k) => MODIFIERS[k] === entry);
    const holderState = modifierStateFor(holder, holderRole, key, entry);
    ctx.duration = d;
    const result = entry.behavior ? MODIFIER_BEHAVIORS[entry.behavior](ctx, entry, holderState) : (typeof entry.value === "function" ? entry.value(ctx) : entry.value);
    if (typeof result === "number") d = result;
  }
  return d;
}

// ---- applyAndReact.onStatusApplied (2e-2, 23 Nov, Tyler) ----
// Faithful Heart (Divine Regalia -- Ring of Sacred Vows) / Heartward
// Bond (Regalia of the Eternal Heart 4pc): applyBeneficialEffectBonuses's
// own self-granted pair -- see threadStatusAppliedDuration above.
registerBehavior("faithfulHeartExtendDuration", (ctx) => ctx.duration + 1);
registerModifier("effect:faithful_heart", {
  source: { kind: "effect", id: "faithful_heart" },
  hook: "applyAndReact.onStatusApplied", order: 10, bucket: null, value: null, behavior: "faithfulHeartExtendDuration", params: null,
  when: (ctx) => ctx.side === "receiver", holders: ["player"], state: null,
  notes: "Faithful Heart: extends any temporary combat buff's own granted duration by 1 round. Returns the extended duration -- threadStatusAppliedDuration folds it into the running value Heartward Bond (order 20) then reads via ctx.duration.",
});
registerBehavior("heartwardBondGrant", (ctx) => {
  const combat = ctx.holder.combat;
  const d = ctx.duration;
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, d);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, flatStat(2));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, d);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, flatStat(2));
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, d);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, flatStat(2));
  return undefined;
});
registerModifier("set:Regalia of the Eternal Heart:4", {
  source: { kind: "set", id: "Regalia of the Eternal Heart:4", setName: "Regalia of the Eternal Heart", tier: 4 },
  hook: "applyAndReact.onStatusApplied", order: 20, bucket: null, value: null, behavior: "heartwardBondGrant", params: null,
  when: (ctx) => ctx.side === "receiver", holders: ["player"], state: null,
  notes: "Heartward Bond: +2 Attack/Magic/Defense for the SAME (possibly Faithful-Heart-extended) duration order 10 above already threaded through ctx.duration.",
});

// Imperial Authority (MIL-IE008) / Company Standard (SANG-IAG-IE004) /
// Rallying Standard (SANG-IAG-IE010): applyPackAuraBuff's (combat.js)
// own granter-side reactions -- each fires at most once per combat, the
// first time the wearer's own ally-buff cast actually lands on at least
// one living packmate (ctx.target is the full recipients array for this
// one cast; each entry picks its own target from within it). Dispatched
// only on the GRANTER side (ctx.side === "granter") -- nothing reacts on
// the receiver side at this call site today.
registerBehavior("imperialAuthorityOnGrant", (ctx, entry, holderState) => {
  if (holderState.used) return undefined;
  const recipients = ctx.target;
  if (!recipients || !recipients.length) return undefined;
  holderState.used = true;
  applyEnemySelfModifier(ctx.combat, recipients[0].creatureObj, { def: 5, turns: 2 });
  return undefined;
});
registerModifier("effect:sang_mil_ie008_imperial_authority", {
  source: { kind: "effect", id: "sang_mil_ie008_imperial_authority" },
  hook: "applyAndReact.onStatusApplied", order: 30, bucket: null, value: null, behavior: "imperialAuthorityOnGrant", params: null,
  when: (ctx) => ctx.side === "granter", holders: ["enemy"], state: { used: false },
  notes: "Imperial Authority: the first recipient in resolution order (recipients[0]) additionally gets +5 Defense for 2 turns.",
});
registerBehavior("companyStandardOnGrant", (ctx, entry, holderState) => {
  if (holderState.used) return undefined;
  const recipients = ctx.target;
  if (!recipients || !recipients.length) return undefined;
  holderState.used = true;
  applyEnemySelfModifier(ctx.combat, pickLowestHpRecipient(recipients).creatureObj, { def: 5, turns: 2 });
  return undefined;
});
registerModifier("effect:sang_iag_ie004_company_standard", {
  source: { kind: "effect", id: "sang_iag_ie004_company_standard" },
  hook: "applyAndReact.onStatusApplied", order: 31, bucket: null, value: null, behavior: "companyStandardOnGrant", params: null,
  when: (ctx) => ctx.side === "granter", holders: ["enemy"], state: { used: false },
  notes: "Company Standard: the recipient at LOWEST current HP% additionally gets +5 Defense for 2 turns.",
});
registerBehavior("rallyingStandardOnGrant", (ctx, entry, holderState) => {
  if (holderState.used) return undefined;
  const recipients = ctx.target;
  if (!recipients || !recipients.length) return undefined;
  holderState.used = true;
  applyEnemySelfModifier(ctx.combat, pickLowestAtkRecipient(recipients).creatureObj, { atk: 5, turns: 2 });
  return undefined;
});
registerModifier("effect:sang_iag_ie010_rallying_standard", {
  source: { kind: "effect", id: "sang_iag_ie010_rallying_standard" },
  hook: "applyAndReact.onStatusApplied", order: 32, bucket: null, value: null, behavior: "rallyingStandardOnGrant", params: null,
  when: (ctx) => ctx.side === "granter", holders: ["enemy"], state: { used: false },
  notes: "Rallying Standard: the recipient at LOWEST current Attack additionally gets +5 Attack for 2 turns.",
});

// Reinforced (Divine Regalia): applyAndReact.onTargeted (2e-2, 23 Nov,
// Tyler) -- every 3rd non-reaction enemy attack declared against the
// player, hit or miss, grants +2 Defense (capped +20, 10 stacks). The
// counter itself stays exactly where it was (activeEnemySlot(combat)
// .reinforcedAttackCount, per attacking enemy) -- NOT moved into this
// entry's own state, same "don't relocate a counter something else
// might read" discipline as Seedbearer's spellCastCounter just below.
registerBehavior("reinforcedOnTargeted", (ctx) => {
  const combat = ctx.state.combat;
  const slot = activeEnemySlot(combat);
  slot.reinforcedAttackCount = (slot.reinforcedAttackCount || 0) + 1;
  if (slot.reinforcedAttackCount % 3 === 0 && (combat.player.reinforcedDefStacks || 0) < 20) {
    combat.player.reinforcedDefStacks = Math.min(20, (combat.player.reinforcedDefStacks || 0) + 2);
  }
  return undefined;
});
registerModifier("effect:reinforced", {
  source: { kind: "effect", id: "reinforced" },
  hook: "applyAndReact.onTargeted", order: 10, bucket: null, value: null, behavior: "reinforcedOnTargeted", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Reinforced. Dispatch site's own gate (chooseAction, pipeline.js) already matches today's exact scope (non-reaction, target.kind === 'player') -- this entry's own `when` is null, same as Seedbearer's own presence-only gating.",
});

// Seedbearer (Divine Regalia): heals 10% max HP every 3rd element-ability
// cast, hit or miss. combat.player.spellCastCounter itself stays a
// shared, unconditional, inline increment (useElementAbility) -- NOT
// moved into this entry's own state, since Eureka (not yet migrated)
// reads the exact same running counter (`% 4 === 0`); moving it here
// would desync Eureka's own future trigger from it. `ctx.spellCastCounter`
// carries the CURRENT count (read after the shared increment, same
// value the old inline check read). No state of its own is needed --
// there's nothing effect-specific to track beyond the shared count.
registerBehavior("seedbearerHeal", (ctx) => {
  if (ctx.spellCastCounter % 3 !== 0) return undefined;
  const { healed, lines } = applyHeal(ctx.holder, Math.ceil(ctx.holder.maxHealth * 0.1));
  return healed > 0 ? [`Seedbearer blooms — you're mended for ${healed} health.`, ...lines] : undefined;
});
registerModifier("effect:seedbearer", {
  source: { kind: "effect", id: "seedbearer" },
  hook: "applyAndReact.onActionUsed", order: 10, bucket: null, value: null, behavior: "seedbearerHeal", params: null,
  when: (ctx) => ctx.actionTags.includes("elementAbility"), holders: ["player"], state: null,
  notes: "Seedbearer. Matches every element cast via the 'elementAbility' tag, hit or miss -- today's own exact scope (the inline check ran unconditionally on cast, before the hit roll).",
});
// Siege Corps:6 (set bonus): banks a one-shot +2 Attack "next turn"
// whenever Brace's own gear bonus fires during Feint's or Earth's
// retaliation-defense step. Unlike Seedbearer's counter, nothing else
// reads this charge, so it moves fully into this entry's own state
// (`charge`), per Tyler's own ruling -- consumeSiegeCorpsAtkCharge/
// peekSiegeCorpsAtkCharge (combat.js) now read/clear it there instead
// of combat.player.siegeCorpsAtkCharge (retired, including its
// PLAYER_FIELDS/init-default entries).
registerBehavior("siegeCorpsChargeGrant", (ctx, entry, holderState) => {
  if (!hasEffect(ctx.holder, "brace")) return undefined;
  holderState.charge = 2;
  return undefined;
});
registerModifier("set:Siege Corps:6", {
  source: { kind: "set", id: "Siege Corps:6", setName: "Siege Corps", tier: 6 },
  hook: "applyAndReact.onActionUsed", order: 11, bucket: null, value: null, behavior: "siegeCorpsChargeGrant", params: null,
  when: (ctx) => ctx.actionTags.includes("appliesBraceDefense"), holders: ["player"], state: { charge: 0 },
  notes: "Siege Corps 6pc. Matches Feint and Earth (the only two actions whose retaliation-defense step includes Brace's own bonus) via the 'appliesBraceDefense' tag; still gated on hasEffect(holder, 'brace') inside the behavior itself, exactly matching today's `hasEffect(state,'brace') && hasSetTier(state,'Siege Corps',6)` pair.",
});

// ---- Guarded Strike / Brace / Legion:6 / Stonewarden:4 (2e-2, 23 Nov,
// Tyler) -- the retaliationDef unit. Every grant below writes the SAME
// flat field the real code has always used (guardedStrikeBonusDef/
// braceBonusDef/legion6BonusDef, on modifierStateHost -- the creature/
// ally object itself, or combat.player for the player), not a
// modifierState-backed entry -- see peekRetaliationDefBonus/
// consumeRetaliationDefBonus's own header above for why. The player's
// own Guarded Strike grant lives on a SEPARATE hook entirely (below) --
// grant and consume are already synchronous for the player there, and
// onHitDealt is already spoken for by the lifesteal sources.
registerBehavior("guardedStrikeGrant", (ctx) => {
  modifierStateHost(ctx.holder, ctx.role).guardedStrikeBonusDef = 2;
  return undefined;
});
registerModifier("effect:guarded_strike", {
  source: { kind: "effect", id: "guarded_strike" },
  hook: "applyAndReact.onHitDealt", order: 5, bucket: null, value: null, behavior: "guardedStrikeGrant", params: null,
  when: null, holders: ["enemy", "ally"], state: null,
  notes: "Guarded Strike (enemy/ally). Banks +2 Defense against this same target's immediate retaliation. Dispatch sites keep today's own exact gates inline (enemy: !abilityCtx && edmg>0, pipeline.js's applyAndReact enemy branches; ally plain-attack: unconditional, pipeline.js:930) rather than folding them into `when` -- a real, pre-existing asymmetry between the two paths, not something to unify. Never dispatched for the player at this hook (see effect:guarded_strike:player_retaliation, applyAndReact.onPhysicalHitLanded, below) -- onHitDealt is already the lifesteal sources' home for the player, and a second player-side dispatch here would double-fire them.",
});
registerModifier("effect:guarded_strike:player_retaliation", {
  source: { kind: "effect", id: "guarded_strike" },
  hook: "applyAndReact.onPhysicalHitLanded", order: 10, bucket: null, value: 2, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Guarded Strike (player). Stateless -- grant and consume happen in the same synchronous call (basic attack, resolver.js's generic kit path), so this is a plain summed value, not banked state. Disarm's own retaliation-defense check stays its own untouched inline `hasEffect(state,'guarded_strike')` read (Tyler's own ruling, 23 Nov) -- genuinely unconditional even on a miss, unlike this hook's own isPhysicalHit gate, which the two real dispatch sites keep inline rather than folding into `when`.",
});
registerBehavior("braceGrant", (ctx) => {
  modifierStateHost(ctx.holder, ctx.role).braceBonusDef = ctx.role === "player" ? resolveUpgradedValue("effect:brace", 3, ctx.state, "player", "max") : 3;
  return undefined;
});
registerModifier("effect:brace", {
  source: { kind: "effect", id: "brace" },
  hook: "applyAndReact.onActionUsed", order: 10, bucket: null, value: null, behavior: "braceGrant", params: null,
  when: (ctx) => ctx.actionTags.includes("appliesBraceDefense"), holders: ["player", "enemy", "ally"], state: null,
  notes: "Brace. Banks Defense (3; 5 for the player with Stonewarden:4, Rule 1 upgrade below) against this same target's immediate retaliation. Player: Feint's/Earth's own cast, the existing onActionUsed dispatch (pipeline.js:2483, combat.js's useFeint). Enemy: a pure summon or any dmgMult:0 active (combat.js, 'Brace, generalized' -- no equivalent named action, so this dispatch is added at that same real trigger). Ally: Defensive/Support stance (combat.js's allyDefensiveAction/allySupportAction, same addition).",
});
registerModifier("set:Stonewarden:4", {
  source: { kind: "set", id: "Stonewarden:4", setName: "Stonewarden", tier: 4 },
  upgrades: "effect:brace",
  hook: "applyAndReact.onActionUsed", order: 999, bucket: null, value: 5, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Stonewarden 4pc. Rule 1 upgrade of Brace's own base value (3 -> 5), player only -- matches js/data/sets.js's old braceDefBonus(state) exactly (that function is now dead code, deleted; braceGrant's own behavior, modifiers.js, calls resolveUpgradedValue directly); never applied to the enemy's or an ally's own flat-3 Brace grant, same as today (hasSetTier always reads the PLAYER's own gear).",
});
registerBehavior("legion6Grant", (ctx) => {
  modifierStateHost(ctx.holder, ctx.role).legion6BonusDef = 3;
  return `Disciplined Formation — your training holds; +3 Defense against the counter.`;
});
registerModifier("set:Legion:6", {
  source: { kind: "set", id: "Legion:6", setName: "Legion", tier: 6 },
  hook: "applyAndReact.onActionUsed", order: 1, bucket: null, value: null, behavior: "legion6Grant", params: null,
  when: (ctx) => ctx.actionId === "feint", holders: ["player"], state: null,
  notes: "Legion 6pc (Disciplined Formation): a flat, ADDITIVE +3 Defense against Feint's own retaliation -- functionally identical to Brace, and stacks with it if somehow both are active (combat.js's own comment), NOT a magnitude upgrade of Brace's value (unlike Stonewarden:4, which genuinely is one). Feint-only, unlike Brace (which also applies to Earth) -- `actionId` is a new ctx field only Feint's own dispatch call sets, added specifically so this entry doesn't also fire on Earth's cast (Earth passes the same bare ['appliesBraceDefense'] actionTags array Feint does, so actionTags alone can't tell them apart). order:1 so its own flavor line keeps printing before Siege Corps:6's own (silent) effect, matching today's exact output order (Legion:6's own check ran before the original runOnActionUsed call existed at all).",
});
registerBehavior("sureFoundationGrant", (ctx) => {
  const host = modifierStateHost(ctx.holder, ctx.role);
  host.sureFoundationBonusDef = 2;
  host.sureFoundationBonusDefTurnsLeft = 2;
  return undefined;
});
registerModifier("effect:dra_e05_sure_foundation", {
  source: { kind: "effect", id: "dra_e05_sure_foundation" },
  hook: "applyAndReact.onHitTaken", order: 10, bucket: null, value: null, behavior: "sureFoundationGrant", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Sure Foundation (DRA-E05, boots -- Stillwater Sabatons/First Sword's Regalia). Banks +2 effective Defense (2-round expiry) against this same creature's NEXT incoming physical hit, after this creature's own physical hit just landed. Dispatch sites keep today's own exact gates inline (grantSureFoundationCharge, modifiers.js -- the unconditional-clear-then-conditional-regrant pair, called at the SAME 4 real sites Guarded Strike/Brace already clear/grant at: combat.js's rollPlayerDamage physical branch, unconditional; pipeline.js's applyAndReactAllyActor kit-ally branch, U3e-gated; pipeline.js's plain-ally branch, unconditional; pipeline.js's applyAndReactPlayerActor, isPhysical-gated) rather than folding them into `when`. Holders corrected to 'enemy' only -- no code path ever checks this effect against the player's own equipment, despite the item existing in the player's loot table; the catalogue's old 'player' value was stale. The peek (combat.js:2034, pipeline.js:1666 -- `creature.sureFoundationBonusDef || 0`, added to effDef only in the physical branch) and the decay tick (combat.js, once per round) stay untouched inline -- a single-source field never needs peekRetaliationDefBonus-style summing, and the decay is a passive timer, not a reaction.",
});
registerModifier("effect:adaptive_ward", {
  source: { kind: "effect", id: "adaptive_ward" },
  hook: "calculateDamage.incoming", order: 1, bucket: "incomingMitigation", abilityPhase: true,
  value: null, behavior: "adaptiveWardRatio", params: null,
  when: (ctx) => ctx.kind === "magic", holders: ["player", "ally"], state: null,
  notes: "Adaptive Ward. Magic-only (today's own code only ever reads it inside the creature.element-gated magic branches).",
});

// ================= task 40 (24 Nov): remaining REVIEW rows needing no
// new hook -- each attaches onto a hook already wired/dispatched
// elsewhere in this engagement. =================
registerBehavior("windsOfChangeGrant", (ctx) => {
  const combat = ctx.holder.combat;
  combat.player.windsOfChangeAtk = 0;
  combat.player.windsOfChangeDef = 0;
  combat.player.windsOfChangeMagic = 0;
  combat.player.windsOfChangeKnowledge = 0;
  const roll = Math.floor(Math.random() * 4);
  const labels = ["Attack", "Defense", "Magic", "Knowledge"];
  if (roll === 0) combat.player.windsOfChangeAtk = 6;
  else if (roll === 1) combat.player.windsOfChangeDef = 6;
  else if (roll === 2) combat.player.windsOfChangeMagic = 6;
  else combat.player.windsOfChangeKnowledge = 6;
  return `Winds of Change shifts — +6 ${labels[roll]} this round.`;
});
registerModifier("effect:winds_of_change", {
  source: { kind: "effect", id: "winds_of_change" },
  hook: "turn.start", order: 100, bucket: null, value: null, behavior: "windsOfChangeGrant", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Winds of Change: at the start of every round, re-roll a fresh +6 Attack/Defense/Magic/Knowledge bonus (four mutually exclusive fields, always exactly one nonzero). Dispatched by key at its own real beginTurn call site, inside the SAME `if (hasEffect(state,'winds_of_change'))` block the already-wired applyAndReact.onFavorableRoll dispatch sits in (added when Twist of Fate was migrated, task 26) -- that block's wrapper and the onFavorableRoll call both stay untouched; only the bonus-rolling body moves here.",
});

// ================= 2e-1: healFighter's heal.incoming chain =================
// Today's own applyHeal order, unchanged: Flourishing Soul -> Blessing
// of Compassion (Eternal Heart:2) -> Avatar of Devotion -> Avatar of
// Endurance -> Mercy's Gift -> healingReceivedPct status total. Every
// one is a plain ratio (no behavior/state needed -- none of these
// consume anything; they're live reads, re-evaluated on every heal).
registerModifier("effect:flourishing_soul", {
  source: { kind: "effect", id: "flourishing_soul" },
  hook: "heal.incoming", order: 10, bucket: null, value: 1.5, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Flourishing Soul: +50% healing received.",
});
registerModifier("set:Regalia of the Eternal Heart:2", {
  source: { kind: "set", id: "Regalia of the Eternal Heart:2", setName: "Regalia of the Eternal Heart", tier: 2 },
  hook: "heal.incoming", order: 20, bucket: null, value: 1.25, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Compassion: +25% healing received, stacking multiplicatively with Flourishing Soul. The 'removes one minor negative status effect' clause is a pre-existing no-op (nothing in this engine inflicts one on the player) -- untouched, not this entry's concern.",
});
// Avatar of Devotion/Avatar of Endurance: both read a turn-counter
// window (avatarOfDevotionTurns/avatarOfEnduranceTurns) GRANTED by the
// LOW_HEALTH_REACTIONS table's own checkAvatarOfDevotion/
// checkAvatarOfEndurance (combat.js) -- that grant mechanic itself is
// reaction-stat territory (a buff-window trigger, not a heal), out of
// 2e-1's own scope; this entry only reads the window the same way
// applyHeal always did. `source: {kind:"always"}` since the window
// check has no hasSetTier of its own at this exact read site (today's
// code only tests the turn counter).
registerModifier("always:avatar_of_devotion_heal", {
  source: { kind: "always" },
  hook: "heal.incoming", order: 30, bucket: null, value: (ctx) => (ctx.holder.combat && abilityFlagHost(ctx).avatarOfDevotionTurns > 0) ? 2 : 1, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Devotion: healing doubled for its 4-round window. `ctx.holder.combat` guard -- applyHeal is also called outside combat (resting/arena/dungeon), where the original inline code's own `combat &&` check already made this a no-op; abilityFlagHost assumes combat exists.",
});
registerModifier("always:avatar_of_endurance_heal", {
  source: { kind: "always" },
  hook: "heal.incoming", order: 40, bucket: null, value: (ctx) => (ctx.holder.combat && abilityFlagHost(ctx).avatarOfEnduranceTurns > 0) ? 1.5 : 1, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Endurance: +50% healing received for its 4-round window. Same combat guard as Avatar of Devotion above.",
});
registerModifier("effect:mercys_gift", {
  source: { kind: "effect", id: "mercys_gift" },
  hook: "heal.incoming", order: 50, bucket: null, value: (ctx) => ctx.holder.health < ctx.holder.maxHealth * 0.5 ? 1.5 : 1, behavior: null, params: null,
  when: null, holders: ["player"], state: null,
  notes: "Mercy's Gift: +50% healing received while below 50% max Health, checked fresh on every heal (not latched). Proof test (2e-1): widened to ally -- an ally wearing it below 50% HP gets the bonus, one without the gear doesn't.",
});
// healingReceivedPct (Ashen Lungs and anything else in that status
// family): the one entry in this chain that's a genuine widening on an
// ally, per Tyler's own ruling -- `holders` includes "ally" structurally
// (the dispatch is wired) but the `when` gate keeps it inert for an
// ally until R1 is on, matching "holders stay as today" exactly (an
// ally's own heals read nothing from this today).
registerModifier("always:healing_received_pct_status", {
  source: { kind: "always" },
  hook: "heal.incoming", order: 60, bucket: null, value: (ctx) => {
    const pct = statusStatPctTotalFor(ctx.holder, ctx.role, "healingReceivedPct");
    return pct ? 1 + pct : 1;
  }, behavior: null, params: null,
  when: (ctx) => ctx.role === "player" || COMBAT_UNIFY.R1, holders: ["player", "ally"], state: null,
  notes: "healingReceivedPct status total (Ashen Lungs, off by default -- only ever inflicted when DAMAGE_TYPES_V2 is on). Widening to ally is real (Tyler's own ruling, 2e-1): ally heals read nothing from this today -- gated behind R1, off by default, same discipline as every other staged widening this engagement.",
});

// heal.overflow: Regalia of the First Bloom:4 (Overflowing Life).
// Converts unhealed overflow into capped Temporary Health. `ctx.overflow`
// is populated by healFighter itself, right after the HP write.
registerBehavior("overflowingLifeConvert", (ctx) => {
  if (!ctx.holder.combat) return undefined;
  const host = abilityFlagHost(ctx);
  const cap = Math.round(ctx.holder.maxHealth * 0.3);
  const beforeTemp = host.tempHealth || 0;
  host.tempHealth = Math.min(cap, beforeTemp + ctx.overflow);
  return host.tempHealth > beforeTemp ? `Overflowing Life — the excess crystallizes into ${host.tempHealth - beforeTemp} Temporary Health.` : undefined;
});
registerModifier("set:Regalia of the First Bloom:4", {
  source: { kind: "set", id: "Regalia of the First Bloom:4", setName: "Regalia of the First Bloom", tier: 4 },
  hook: "heal.overflow", order: 10, bucket: null, value: null, behavior: "overflowingLifeConvert", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Overflowing Life: unhealed overflow converts to Temporary Health, capped at 30% max Health.",
});

// ================= 2e-2 (23 Nov, Tyler): heal.applied =================
// Living Current, Compassion's Grace, Endless Current all used to live
// as inline blocks in applyHeal (combat.js), each gated on the same
// `healed > 0 && hasEffect/hasSetTier(...)` shape that still-fires
// `when` reproduces below. Moved onto heal.applied verbatim; applyHeal
// no longer touches any of their state directly.
registerBehavior("livingCurrentOnHeal", (ctx) => {
  const combat = ctx.holder.combat;
  combat.player.livingCurrentStacks = Math.min(5, (combat.player.livingCurrentStacks || 0) + 1);
  return undefined;
});
registerModifier("effect:living_current", {
  source: { kind: "effect", id: "living_current" },
  hook: "heal.applied", order: 10, bucket: null, value: null, behavior: "livingCurrentOnHeal", params: null,
  when: (ctx) => ctx.amountHealed > 0, holders: ["player"], state: null,
  notes: "Living Current: whenever you restore Health, gain a Magic stack (+2 Magic, 5 stacks max) -- read by effectiveMagic's own livingCurrentStacks term.",
});
registerBehavior("compassionsGraceOnHeal", (ctx) => {
  const combat = ctx.holder.combat;
  combat.player.compassionsGraceDefStacks = Math.min(5, (combat.player.compassionsGraceDefStacks || 0) + 1);
  return undefined;
});
registerModifier("effect:compassions_grace", {
  source: { kind: "effect", id: "compassions_grace" },
  hook: "heal.applied", order: 20, bucket: null, value: null, behavior: "compassionsGraceOnHeal", params: null,
  when: (ctx) => ctx.amountHealed > 0, holders: ["player"], state: null,
  notes: "Compassion's Grace: whenever you restore Health, gain a Defense stack (+2 Defense, 5 stacks max, approximated as permanent-for-the-fight same as Living Steel/Every Choice Matters/Battle Tempered).",
});
registerBehavior("endlessCurrentOnHeal", (ctx) => {
  const state = ctx.holder;
  const combat = state.combat;
  combat.player.endlessCurrentStacks = Math.min(5, (combat.player.endlessCurrentStacks || 0) + 1);
  const dur = applyBeneficialEffectBonuses(state, 3);
  const grant = applyBlessingOfCreationBonus(state, flatStat(combat.player.endlessCurrentStacks * 2));
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, grant);
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, grant);
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, grant);
  return undefined;
});
registerModifier("set:Regalia of the Endless Tide:4", {
  source: { kind: "set", id: "Regalia of the Endless Tide:4", setName: "Regalia of the Endless Tide", tier: 4 },
  hook: "heal.applied", order: 30, bucket: null, value: null, behavior: "endlessCurrentOnHeal", params: null,
  when: (ctx) => ctx.amountHealed > 0, holders: ["player"], state: null,
  notes: "Endless Current: whenever you restore Health, +2 Attack/Defense/Magic for 3 rounds, stacking to +10 (5 stacks) -- own dedicated stack counter (genuinely stacks in magnitude, not just refreshes duration like Rally the Line).",
});

// ================= 2e-1: heal SOURCES (healOnEvent) =================
// The shared behavior for most heal sources below, each hooked on its
// own REAL trigger (applyAndReact.onHitDealt/.onKill, round.start,
// turn.start, fight.start, fight.end, applyAndReact.onZeroDamage --
// dispatched via runReactionHook, above, at that trigger's own real call
// site). entry.params: { basis: "maxHp"|"damageDealt"|"flat", pct, flat,
// round: "round"|"ceil"|"floor" (default "round"), min (an optional
// floor), target: "self" (heals ctx.holder; reserved for a future
// non-self heal per Tyler's own "target: 'self' | …"), message:
// (healed, ctx) => string | undefined (this source's own flavor line).
// `round`/`min` aren't in Tyler's own named vocabulary (basis/pct/flat/
// target) -- added because each source's EXISTING code rounds
// differently (Math.round/ceil/floor, several with no minimum, a couple
// with Math.max(1, ...)) and byte-identical output means preserving each
// one's own real rounding, not guessing a single rule for all 34.
// Precondition gating (e.g. soul_leech's own `state.health <
// state.maxHealth` skip) lives in each entry's own `when`, NOT here --
// skipping the heal.overflow dispatch when a source's own precondition
// would have skipped the heal entirely is the whole reason this can't
// just rely on healFighter's healed<=0 short-circuit (overflow can still
// be positive at exactly full HP, which would wrongly fire Overflowing
// Life on a hit that today's code never even attempts a heal for).
// Calls healFighter (combat.js) -- the SAME heal.incoming/applyHealing/
// heal.overflow chain any other heal goes through, so a heal source
// still stacks with every heal-received modifier exactly like
// applyHeal's own callers always did.
function resolveHealParam(v, ctx) { return typeof v === "function" ? v(ctx) : v; }
registerBehavior("healOnEvent", (ctx, entry) => {
  const p = entry.params;
  let raw;
  if (p.basis === "maxHp") raw = ctx.holder.maxHealth * resolveHealParam(p.pct, ctx);
  else if (p.basis === "damageDealt") raw = ctx.edmg * resolveHealParam(p.pct, ctx);
  else raw = resolveHealParam(p.flat, ctx);
  let amount = p.round === "ceil" ? Math.ceil(raw) : p.round === "floor" ? Math.floor(raw) : Math.round(raw);
  if (p.min != null) amount = Math.max(p.min, amount);
  const { healed, lines: overflowLines } = healFighter(ctx.holder, ctx.role, amount, "healOnEvent", ctx);
  // unconditionalMessage: a couple of sources (Blood Debt, Regrowth) push
  // their own flavor line regardless of whether `healed` actually came
  // back positive -- today's own code, preserved exactly, not this
  // behavior's default (every other source's line IS healed>0-gated).
  if (healed <= 0 && !p.unconditionalMessage) return overflowLines.length ? overflowLines : undefined;
  const line = p.message ? p.message(healed, ctx) : undefined;
  return line ? [line, ...overflowLines] : (overflowLines.length ? overflowLines : undefined);
});

// ---- applyAndReact.onHitDealt (2e-1): three lifesteal sources, same
// order as today's own back-to-back inline chain (rollPlayerDamage,
// combat.js, and rollPlayerDamageCoreForPipeline, pipeline.js -- two
// byte-identical call sites, both replaced by one runReactionHook call
// whose return is discarded, exactly like today's own
// `applyHeal(state, ...)` calls with no destructure). All three are
// genuinely silent today (the caller never read applyHeal's return at
// either site) -- no `message` needed; discarding runReactionHook's
// return at the call site reproduces that silence, overflow lines
// included. ctx.edmg carries this hit's own resolved `dmg`.
registerModifier("always:avatar_of_war_lifesteal", {
  source: { kind: "always" },
  hook: "applyAndReact.onHitDealt", order: 10, bucket: null, value: null, behavior: "healOnEvent",
  params: { basis: "damageDealt", pct: 0.1, round: "round", target: "self" },
  when: (ctx) => ctx.holder.combat && ctx.holder.combat.player.avatarOfWarTurns > 0, holders: ["player"], state: null,
  notes: "Avatar of War: all damage dealt heals 10% of it for its 4-round window. Silent (today's caller discards applyHeal's return at both call sites).",
});
registerModifier("effect:soul_leech", {
  source: { kind: "effect", id: "soul_leech" },
  hook: "applyAndReact.onHitDealt", order: 20, bucket: null, value: null, behavior: "healOnEvent",
  params: { basis: "damageDealt", pct: (ctx) => (masterOfArmsDoubles(ctx.holder, "soul_leech") ? 0.2 : 0.1), round: "round", target: "self" },
  when: (ctx) => ctx.holder.health < ctx.holder.maxHealth, holders: ["player"], state: null,
  notes: "Soul Leech (Mythic): heals 10% of every hit's damage (20% doubled by Master of Arms). Silent, same as Avatar of War/Passing. `when` reproduces today's own `state.health < state.maxHealth` skip exactly (not just relying on healFighter's own healed<=0 no-op) -- at exactly full HP, today's code never even attempts the heal, so heal.overflow must never fire either.",
});
registerModifier("always:avatar_of_passing_lifesteal", {
  source: { kind: "always" },
  hook: "applyAndReact.onHitDealt", order: 30, bucket: null, value: null, behavior: "healOnEvent",
  params: { basis: "damageDealt", pct: 0.3, round: "round", target: "self" },
  when: (ctx) => ctx.holder.combat && ctx.holder.combat.player.avatarOfPassingTurns > 0, holders: ["player"], state: null,
  notes: "Avatar of Passing: all damage dealt heals 30% of it for its 4-round window. Silent, same as Avatar of War/Soul Leech.",
});

// ---- applyAndReact.onKill (2e-1): three sources, same order as
// resolveKill's own back-to-back inline chain (combat.js). Unlike
// onHitDealt, these all push a real output line (resolveKill's own
// `out` array is read by the caller) -- Blood Debt's own line is
// UNCONDITIONAL once its gate passes (today's code pushes it regardless
// of `healed`), Blessing of Valor/Keeper of History are both
// healed>0-gated, matching each one's own real `if (healed > 0)` today.
registerModifier("effect:blood_debt", {
  source: { kind: "effect", id: "blood_debt" },
  hook: "applyAndReact.onKill", order: 10, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: (ctx) => (masterOfArmsDoubles(ctx.holder, "blood_debt") ? 0.4 : 0.2), round: "ceil",
    target: "self", unconditionalMessage: true,
    message: (healed) => `Blood Debt repaid — you're mended for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.health < ctx.holder.maxHealth, holders: ["player"], state: null,
  notes: "Blood Debt: heals 20% max Health on a kill (40% doubled by Master of Arms). Flavor line is unconditional once the gate passes (today's own `out.push(flavor, ...lines)` isn't healed>0-gated, unlike every sibling onKill entry) -- preserved via unconditionalMessage.",
});
registerModifier("set:Regalia of the Crimson Vanguard:2:blessing_of_valor_heal", {
  source: { kind: "set", id: "Regalia of the Crimson Vanguard:2", setName: "Regalia of the Crimson Vanguard", tier: 2 },
  hook: "applyAndReact.onKill", order: 20, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.15, round: "ceil", target: "self",
    message: (healed) => `Blessing of Valor — a killing opening blow steadies you; mended for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.combat && ctx.holder.combat.player.actionCounter === 1,
  holders: ["player"], state: null,
  notes: "Blessing of Valor's own heal-on-kill clause -- missing from the original 34-row catalogue entirely (that catalogue only ever listed this set's opening-attack damage multiplier, already migrated as calculateDamage.outgoing). Gated on the shared combat.player.actionCounter === 1 (same counter Heartwood Vitality/Lasting Foundation/Hunter's Instinct read) -- read only, never owned by this entry.",
});
registerModifier("set:Regalia of the Eternal Hour:4", {
  source: { kind: "set", id: "Regalia of the Eternal Hour:4", setName: "Regalia of the Eternal Hour", tier: 4 },
  hook: "applyAndReact.onKill", order: 30, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.1, round: "ceil", target: "self",
    message: (healed) => `Keeper of History mends you for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.health < ctx.holder.maxHealth, holders: ["player"], state: null,
  notes: "Keeper of History: heals 10% max Health on a kill. `when` reproduces today's own `heal > 0 && state.health < state.maxHealth` skip (heal is always >0 here, so only the health check matters) -- same reasoning as Soul Leech/Blood Debt's own `when`.",
});
// Archive Eternal / Battle Scholar / Living Legacy / Victor's Momentum
// (2e-2, 23 Nov): catalogue-overstated rows -- the hook column already
// read "onKill" from the 19 Nov pass, but none of the four had any real
// registry code; Archive Eternal was still a direct inline call
// (resolveKill, right next to this same dispatch), the other three were
// separate Events.on("enemy.killed") listeners, firing slightly later
// (after survivor bookkeeping) but reading/writing nothing that changes
// in between and producing no output line -- moving them onto this
// SAME early dispatch, right where Archive Eternal's own call already
// was, is behavior-invisible. ctx.creature (new field on this hook's
// ctx) carries the just-killed creature, same param resolveKill's own
// Archive Eternal call already had.
registerBehavior("archiveEternalOnKill", (ctx) => {
  const state = ctx.holder;
  if (!state.combat) return undefined;
  const combat = state.combat;
  const creature = ctx.creature;
  const speciesKey = activeEnemySlot(combat).dynamicCreature ? "enemy_mage_" + (creature.element || "unknown") : activeEnemySlot(combat).creatureId;
  if (!state.archiveEternalSeen) state.archiveEternalSeen = [];
  if (state.archiveEternalSeen.includes(speciesKey)) return undefined;
  state.archiveEternalSeen.push(speciesKey);
  state.archiveEternalKnowledgeBonus = (state.archiveEternalKnowledgeBonus || 0) + 1;
  return `Archive Eternal — a new species recorded; +1 permanent Knowledge.`;
});
registerModifier("effect:archive_eternal", {
  source: { kind: "effect", id: "archive_eternal" },
  hook: "applyAndReact.onKill", order: 40, bucket: null, value: null, behavior: "archiveEternalOnKill", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Archive Eternal: the first time each creature species is recorded, +1 permanent Knowledge. Moved off its own direct applyArchiveEternal(state, creature) call, same position.",
});
registerBehavior("battleScholarOnKill", (ctx) => {
  const state = ctx.holder;
  if (state.battleScholarBonus < 50) state.battleScholarBonus += 1;
  return undefined;
});
registerModifier("effect:battle_scholar", {
  source: { kind: "effect", id: "battle_scholar" },
  hook: "applyAndReact.onKill", order: 50, bucket: null, value: null, behavior: "battleScholarOnKill", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Battle Scholar: +1 Knowledge, permanently, after every kill, capped +50. Moved off its own Events.on('enemy.killed') listener onto this hook -- silent, so the small timing shift (now fires right after the kill is confirmed, rather than after survivor bookkeeping) is behavior-invisible.",
});
registerBehavior("livingLegacyOnKill", (ctx) => {
  const state = ctx.holder;
  if (isNotableCreature(ctx.creature) && state.livingLegacyBonus < 100) state.livingLegacyBonus += 1;
  return undefined;
});
registerModifier("effect:living_legacy", {
  source: { kind: "effect", id: "living_legacy" },
  hook: "applyAndReact.onKill", order: 60, bucket: null, value: null, behavior: "livingLegacyOnKill", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Living Legacy: +1 permanent max Health after an Elite-or-stronger kill (isNotableCreature, same check Kingslayer uses), capped +100. Moved off its own Events.on('enemy.killed') listener, same reasoning as Battle Scholar.",
});
registerBehavior("victorsMomentumOnKill", (ctx) => {
  ctx.holder.flags.victorsMomentumStacks = (ctx.holder.flags.victorsMomentumStacks || 0) + 3;
  return undefined;
});
registerModifier("effect:victors_momentum", {
  source: { kind: "effect", id: "victors_momentum" },
  hook: "applyAndReact.onKill", order: 70, bucket: null, value: null, behavior: "victorsMomentumOnKill", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Victor's Momentum: +3 Attack per kill, persisting across fights, uncapped. Moved off its own Events.on('enemy.killed') listener, same reasoning as Battle Scholar/Living Legacy.",
});
// Passing Whisper (2e-2, 23 Nov): the one onKill source that genuinely
// cannot share the early dispatch above -- today's own applyPassingWhisper
// call sits well AFTER recomputeStats/the "enemy.killed" event (resolveKill),
// printing its own flavor line after "N more enemies stand against you"/
// the fight-end lines. Folding it onto applyAndReact.onKill's own early
// dispatch would reorder that line ahead of them, a real behavior change --
// applyAndReact.onKillLate is its own dedicated hook, dispatched only from
// that same later position, so nothing above can accidentally double-fire
// by matching a second dispatch of the same hook.
registerBehavior("passingWhisperOnKill", (ctx) => {
  const state = ctx.holder;
  const before = state.flags.passingWhisperStacks || 0;
  if (before >= 15) return undefined;
  state.flags.passingWhisperStacks = before + 1;
  state.recomputeStats(true);
  return `Passing Whisper — a departing breath lends you strength; +${flatStat(1)} Magic (${before + 1}/15 this streak).`;
});
registerBehavior("vanguardMomentumGrant", (ctx) => {
  const state = ctx.state;
  const before = state.flags.vanguardMomentumStacks || 0;
  if (before >= 5) return undefined;
  state.flags.vanguardMomentumStacks = before + 1;
  state.recomputeStats(true);
  return `Vanguard Momentum — the fight sharpens you; +${flatStat(1)} Attack (${before + 1}/5 this streak).`;
});
registerModifier("set:Contract Hunter:6", {
  source: { kind: "set", id: "Contract Hunter:6", setName: "Contract Hunter", tier: 6 },
  hook: "applyAndReact.onKillLate", order: 5, bucket: null, value: null, behavior: "vanguardMomentumGrant", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Vanguard Momentum (Contract Hunter 6pc, task 40, 24 Nov): +1 Attack per kill (stacks to +5), persisting across fights until rest (parser.js cmdRest), not reset per-combat. Moved onto the SAME applyAndReact.onKillLate dispatch Passing Whisper already uses (task 38) -- order:5, before Passing Whisper's own order:10, preserving today's exact output order (applyVanguardMomentum's own call sat directly before applyPassingWhisper's in resolveKill's victory tail).",
});
registerBehavior("queenCarapaceGrant", (ctx) => {
  const combat = ctx.state.combat;
  combat.player.queenCarapaceBonus = Math.min(9, combat.player.queenCarapaceBonus + 3);
  return undefined;
});
registerModifier("set:Queen Carapace:6", {
  source: { kind: "set", id: "Queen Carapace:6", setName: "Queen Carapace", tier: 6 },
  hook: "applyAndReact.onHitTaken", order: 10, bucket: null, value: null, behavior: "queenCarapaceGrant", params: null,
  when: (ctx) => ctx.site === "mitigateAndApplyHitOnPlayer" && ctx.edmg > 0, holders: ["player"], state: null,
  notes: "Carapace Adaptation (Queen Carapace 6pc, task 40, 24 Nov): +3 permanent Defense per hit taken (post-mitigation damage > 0), capped +9. First role:'player' dispatch on applyAndReact.onHitTaken -- task 39 wired it for role:'enemy' only (Sure Foundation); this is a separate holder, no collision. Dispatch added at mitigateAndApplyHitOnPlayer's own real site, right after applyPlayerDamage/adaptive_tide's own stack growth (left untouched, out of scope per an existing ruling). `when` checks ctx.site === 'mitigateAndApplyHitOnPlayer' -- applyPlayerDamage's own, separate onHitTaken dispatch (set:Regalia of the Eternal Bastion:4, below) fires from INSIDE mitigateAndApplyHitOnPlayer's own call to applyPlayerDamage too, so without this site check this entry would double-fire on every normal hit (once from each nested dispatch) while ALSO incorrectly widening to reflect/counter damage, which today's code never touches. Read site (combat.player.queenCarapaceBonus, effectivePlayerDef) stays untouched.",
});
registerBehavior("wallsEndureGrant", (ctx) => {
  const combat = ctx.state.combat;
  combat.player.wallsEndureDefStacks = Math.min(20, (combat.player.wallsEndureDefStacks || 0) + 1);
  return undefined;
});
registerModifier("set:Regalia of the Eternal Bastion:4", {
  source: { kind: "set", id: "Regalia of the Eternal Bastion:4", setName: "Regalia of the Eternal Bastion", tier: 4 },
  hook: "applyAndReact.onHitTaken", order: 20, bucket: null, value: null, behavior: "wallsEndureGrant", params: null,
  when: (ctx) => ctx.site === "applyPlayerDamage", holders: ["player"], state: null,
  notes: "Walls Endure (Regalia of the Eternal Bastion 4pc, task 40, 24 Nov): +1 Defense every time damage is actually taken (raw pre-absorption amount, capped +20). Dispatched at applyPlayerDamage's own site (combat.js), NOT Queen Carapace's narrower mitigateAndApplyHitOnPlayer one -- applyPlayerDamage has 4 real callers (reflect/counter/mitigateAndApplyHitOnPlayer/pipeline.js's enemy-attack path), so this fires on ANY damage the player takes, a genuinely broader surface. `when` checks ctx.site === 'applyPlayerDamage' so this never also matches Queen Carapace's own dispatch (same hook, same role, nested call path -- see that entry's own note for the double-fire risk this avoids). Avatar of Endurance (6pc, same function) stays untouched inline, out of scope.",
});
registerBehavior("firstSwordsLegacyGrant", (ctx) => {
  const creatureObj = ctx.holder;
  creatureObj.legacyUsed = true;
  creatureObj.legacyCharges = 2;
  creatureObj.legacyTurnsLeft = 3;
  return `First Sword's Legacy answers in kind — the Regalia itself steadies ${withThe(creatureObj.name, false)}'s grip.`;
});
registerModifier("set:First Sword's Regalia:10:legacy", {
  source: { kind: "set", id: "First Sword's Regalia:10", setName: "First Sword's Regalia", tier: 10 },
  hook: "applyAndReact.onLowHealth", order: 10, bucket: null, value: null, behavior: "firstSwordsLegacyGrant", params: null,
  when: (ctx) => !ctx.holder.legacyUsed && ctx.e.maxHp > 0 && ctx.e.hp / ctx.e.maxHp <= 0.4,
  holders: ["enemy"], state: null,
  notes: "First Sword's Legacy (First Sword's Regalia 10pc, task 40, 24 Nov): once per combat, the first time HP is observed at or below 40% at the top of a normal action -- a Dregnar-boss-specific mirror of DRA-P03 First Sword's Resolve (dregnarResolveDamagingAttempt, combat.js, left untouched, its own independent once-per-combat gate/fields), holders corrected to 'enemy' only -- `hasSetTier(creatureObj, ...)` there always checked the ENEMY/boss's own equipment, never the player; the catalogue's old blank/unclear holder column is finalized here. First role:'enemy' dispatch on applyAndReact.onLowHealth -- every existing entry on this hook is role:'player' only (Love Endures/Avatar of Bloom/etc., tasks 25/2e-1), so this is purely additive, no collision. `ctx.e` (the enemy slot, for hp/maxHp) is passed alongside `ctx.holder` (creatureObj, for the flat legacyUsed/legacyCharges/legacyTurnsLeft fields) at this one dispatch call site.",
});
registerBehavior("markedTargetGrant", (ctx) => {
  ctx.holder.markedTargetUsed = true;
  ctx.state.combat.player.exposedTarget = { by: ctx.holder };
  return undefined;
});
registerModifier("effect:sang_cu_ie002_marked_target", {
  source: { kind: "effect", id: "sang_cu_ie002_marked_target" },
  hook: "applyAndReact.onHitDealt", order: 10, bucket: null, value: null, behavior: "markedTargetGrant", params: null,
  when: (ctx) => ctx.edmg > 0 && !ctx.holder.markedTargetUsed && !ctx.state.combat.player.exposedTarget && (ctx.targetKind === "player" || COMBAT_UNIFY.U3a),
  holders: ["enemy"], state: null,
  notes: "Marked Target (task 40, 24 Nov): once per combat, the first landed hit against the player marks them (combat.player.exposedTarget), granting a +8 accuracy bonus to the next qualifying ally attack (U3a, off by default -- widens it so an ally's own landed hit can ALSO set the mark) or player attack (unconditional, no switch). Holders corrected to 'enemy' -- the catalogue's old 'player' value was stale, this is a Sanguivorum creature effect. Dispatched by KEY (runHookEntry), not fan-out, at its own two real sites (applyAndReactReactionOnAlly/applyAndReactReactionOnPlayer, pipeline.js) -- NOT folded into the already-dispatched applyAndReact.onHitDealt fan-out call sitting right above each site, because that call is gated `!abilityCtx` (Guarded Strike's own real gate) while Marked Target's own gate has never checked abilityCtx at all -- it also fires on an ABILITY-based counter (e.g. Arena Riposte), a genuinely broader trigger surface. Fan-out dispatch would have either double-fired Guarded Strike et al. (if unconditional) or silently narrowed Marked Target to plain counters only (if reusing the existing gate) -- by-key dispatch avoids both. `ctx.targetKind` ('ally'/'player') lets one entry serve both real call sites with their different U3a gating. The read/consume side (combat.player.exposedTarget, pipeline.js's rollToHit ally/player branches) stays untouched.",
});
registerBehavior("everyChoiceMattersGrant", (ctx) => {
  const combat = ctx.holder.combat;
  const atkStacks = combat.player.everyChoiceAtkStacks || 0;
  if (atkStacks >= 5) return undefined;
  combat.player.everyChoiceAtkStacks = atkStacks + 1;
  combat.player.everyChoiceMagicStacks = (combat.player.everyChoiceMagicStacks || 0) + 1;
  return `Every Choice Matters — the near miss sharpens you; +${flatStat(2)} Attack, +${flatStat(2)} Magic (now +${flatStat((atkStacks + 1) * 2)}/+${flatStat((atkStacks + 1) * 2)}).`;
});
registerModifier("effect:every_choice_matters", {
  source: { kind: "effect", id: "every_choice_matters" },
  hook: "applyAndReact.onZeroDamage", order: 10, bucket: null, value: null, behavior: "everyChoiceMattersGrant", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Every Choice Matters (Divine Regalia, task 40, 24 Nov): +2 Attack/+2 Magic stacking per 'zero damage retaliation' (dodge/stun/Decoy/reduced-to-0), capped at 5 stacks. First real dispatch of applyAndReact.onZeroDamage (declared in MOD_HOOKS, never dispatched before this task) -- dispatched via fan-out (runReactionHook) INSIDE applyDodgeBlockNegateBonuses's own body (combat.js), the single shared function already called at all 9 real zero-damage call sites (same ones maybeRiposte uses) -- no per-call-site edits needed. Threads of Consequence (Regalia of the Woven Thread 4pc) shares this same function but is a genuinely independent if-block (own gate, own effect, no shared state) -- left untouched inline, not part of this task's scope.",
});
// Open Road (Divine Regalia -- Wayfinder's Compass, 2e-3, 25 Nov): the
// same "this turn's retaliation dealt zero damage" signal Every Choice
// Matters above already uses -- but dispatched BY KEY at its OWN real
// call site (applyEndlessHorizonEvasionBonuses, combat.js), not folded
// into Every Choice Matters' own fan-out at applyDodgeBlockNegateBonuses's
// EARLIER call site. Both functions run at the same 5 real locations,
// back to back, with Laughing Gale's own bonuses in between -- letting
// runReactionHook's fan-out here catch Open Road too would print its
// line before Laughing Gale's, not after, breaking byte-identical
// output. hook name shared purely for M1 bookkeeping.
registerBehavior("openRoadEaseAll", (ctx) => {
  const cooldowns = ctx.holder.combat.cooldowns;
  let eased = false;
  for (const key of Object.keys(cooldowns)) {
    if (cooldowns[key] > 0) {
      cooldowns[key] -= 1;
      eased = true;
    }
  }
  return eased ? `Open Road — the path clears; every active cooldown eases by a turn.` : undefined;
});
registerModifier("effect:open_road", {
  source: { kind: "effect", id: "open_road" },
  hook: "applyAndReact.onZeroDamage", order: 20, bucket: null, value: null, behavior: "openRoadEaseAll", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Open Road: eases EVERY active cooldown by 1, on the same zero-damage-retaliation signal Every Choice Matters uses -- see the comment just above for why this dispatches by key at its own position instead of fan-out.",
});
registerBehavior("endlessStudyGrant", (ctx) => {
  const combat = ctx.holder.combat;
  combat.player.endlessStudyKeys.push(ctx.actionKey);
  combat.player.endlessStudyMagicBonus = Math.min(20, (combat.player.endlessStudyMagicBonus || 0) + 2);
  return `Endless Study — a new technique, understood; +${flatStat(2)} Magic (now +${flatStat(combat.player.endlessStudyMagicBonus)}).`;
});
registerModifier("effect:endless_study", {
  source: { kind: "effect", id: "endless_study" },
  hook: "applyAndReact.onActionUsed", order: 10, bucket: null, value: null, behavior: "endlessStudyGrant", params: null,
  when: (ctx) => !ctx.holder.combat.player.endlessStudyKeys.includes(ctx.actionKey) && (ctx.holder.combat.player.endlessStudyMagicBonus || 0) < 20,
  holders: ["player"], state: null,
  notes: "Endless Study (task 40, 24 Nov): first use of each distinct ability/tactic/plain-attack this fight grants +2 Magic permanently, capped +20. Hook stays `applyAndReact.onActionUsed` (Tyler's own 24 Nov ruling on this cluster), but dispatch is BY KEY (runHookEntry), not fan-out -- same convention as Living Steel/Winds of Change/Marked Target -- at applyEndlessStudy's own 8 real call sites (combat.js's Feint/apothecary, pipeline.js's basic attack/Decoy/Ambush/Disarm/element cast, resolver.js's generic kit path), chosen specifically so this can never also match Brace/Legion:6's own existing FAN-OUT entries on this same hook name at THEIR real sites (Feint's retaliation-step/Earth's cast/2 enemy/2 ally sites) -- zero collision risk, no ctx-scoping field needed; by-key dispatch never iterates other registered entries at all.",
});
registerBehavior("wanderersRewardGrant", (ctx) => {
  const state = ctx.state;
  const combat = state.combat;
  const dur = applyBeneficialEffectBonuses(state, 2);
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(4)));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(4)));
  return `Wanderer's Reward — new ground, new strength; +${flatStat(4)} Attack, +${flatStat(4)} Magic for ${dur} rounds.`;
});
registerModifier("effect:wanderers_reward", {
  source: { kind: "effect", id: "wanderers_reward" },
  hook: "applyAndReact.onActionUsed", order: 10, bucket: null, value: null, behavior: "wanderersRewardGrant", params: null,
  when: (ctx) => !(ctx.holder.combat.player.recentActionKeys || []).includes(ctx.actionKey),
  holders: ["player"], state: null,
  notes: "Wanderer's Reward (task 40, 24 Nov): whenever the specific ability/tactic used hasn't been used in either of the previous two turns, +4 Attack/+4 Magic for applyBeneficialEffectBonuses's own threaded duration (2 base). Same by-key dispatch choice/reasoning as effect:endless_study above -- see its notes. `recentActionKeys` is read here (before this action joins it) and updated by the caller (applyWanderersReward, combat.js) right after, same order as before.",
});
registerBehavior("perfectMemoryGrant", (ctx) => {
  const combat = ctx.holder.combat;
  combat.player.perfectMemoryKeys.push(ctx.actionKey);
  combat.player.perfectMemoryKnowledgeBonus = Math.min(16, (combat.player.perfectMemoryKnowledgeBonus || 0) + 2);
  return `Perfect Memory — a new technique, remembered; +2 Knowledge (now +${combat.player.perfectMemoryKnowledgeBonus}).`;
});
registerModifier("effect:perfect_memory", {
  source: { kind: "effect", id: "perfect_memory" },
  hook: "applyAndReact.onActionUsed", order: 10, bucket: null, value: null, behavior: "perfectMemoryGrant", params: null,
  when: (ctx) => !ctx.holder.combat.player.perfectMemoryKeys.includes(ctx.actionKey) && (ctx.holder.combat.player.perfectMemoryKnowledgeBonus || 0) < 16,
  holders: ["player"], state: null,
  notes: "Perfect Memory (task 40, 24 Nov): first use of each distinct Tactic/Elemental Ability this fight grants +2 Knowledge permanently, capped +16 -- never plain Attack (unlike Endless Study/Wanderer's Reward), its own separate tracking list. No flatStat() wrapping on the Knowledge grant -- matches today's own code exactly (Knowledge isn't PLAYER_STAT_SCALE'd the way Magic/Attack are). Same by-key dispatch choice/reasoning as effect:endless_study above -- see its notes. Dispatched at only 5 of the 8 real sites (Feint/Decoy/Ambush/Disarm/element cast, plus resolver.js's generic kit path conditionally on def.usesPerfectMemory) -- basic attack/apothecary never call applyPerfectMemory at all, unchanged.",
});
registerBehavior("everForwardGrant", (ctx) => {
  const state = ctx.state;
  const combat = state.combat;
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(10)));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, flatStat(10)));
  return `Ever Forward — three strides, three shapes; +${flatStat(10)} Attack, +${flatStat(10)} Magic for ${dur} rounds.`;
});
registerModifier("set:Regalia of the Endless Horizon:4", {
  source: { kind: "set", id: "Regalia of the Endless Horizon:4", setName: "Regalia of the Endless Horizon", tier: 4 },
  hook: "applyAndReact.onActionUsed", order: 20, bucket: null, value: null, behavior: "everForwardGrant", params: null,
  when: (ctx) => ctx.holder.combat.player.actionTypeHistory.length === 3 && new Set(ctx.holder.combat.player.actionTypeHistory).size === 3,
  holders: ["player"], state: null,
  notes: "Ever Forward (task 40, 24 Nov): whenever the last 3 actions' broad category (attack/tactic/elemental) are all 3 distinct, +10 Attack/+10 Magic for applyBeneficialEffectBonuses's own threaded duration (3 base). Dispatched BY KEY inside applyActionTypeTracking's own body (combat.js), the single shared function already called at the SAME 8 real sites Endless Study uses -- Momentum Unbound, the OTHER effect in that function, is a genuinely independent block (own gate, own stacking field) left untouched inline, not part of this task's scope. The `actionTypeHistory` bookkeeping (push + slice(-3)) stays inline, shared with Momentum Unbound's own read of `lastActionType`. Same by-key dispatch choice/reasoning as effect:endless_study above -- see its notes.",
});
registerModifier("effect:passing_whisper", {
  source: { kind: "effect", id: "passing_whisper" },
  hook: "applyAndReact.onKillLate", order: 10, bucket: null, value: null, behavior: "passingWhisperOnKill", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Passing Whisper: +1 Magic per kill, capped +15. Moved off its own direct applyPassingWhisper(state) call, same late position (after recomputeStats/the enemy.killed event), via its own dedicated hook.",
});

// ---- fight.start (2e-1): Blessing of the Tide, dispatched at startCombat's
// own call site, right after Events.emit("combat.started", ...). Fits
// healOnEvent's plain maxHp*pct shape exactly.
registerModifier("set:Regalia of the Endless Tide:2", {
  source: { kind: "set", id: "Regalia of the Endless Tide:2", setName: "Regalia of the Endless Tide", tier: 2 },
  hook: "fight.start", order: 10, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.1, round: "ceil", target: "self",
    message: (healed) => `Blessing of the Tide mends you for ${healed} health.`,
  },
  when: null, holders: ["player"], state: null,
  notes: "Blessing of the Tide: a one-time 10% max Health heal the moment any fight begins. Renamed from the source text's own 'Blessing of Renewal' -- that name (and a different, per-round, mechanic) is already Regalia of the First Bloom's own 2pc effect, below.",
});

// ---- fight.end (2e-1): Regrowth, a flat post-combat heal (5%/10% via
// regrowthHealPct, data/sets.js) whether combat ended by winning or by
// fleeing -- presence-only (hasEffect), so multiple copies don't stack.
// Vaeloris:6 queues a Defense charge for the player's NEXT fight -- a
// side effect unrelated to the heal amount itself, and its own flavor
// line is unconditional once heal > 0 (unlike most onKill sources, which
// gate on healed > 0) -- both are why this gets its own small behavior
// rather than the shared healOnEvent.
registerBehavior("regrowthHeal", (ctx) => {
  const heal = Math.ceil(ctx.holder.maxHealth * regrowthHealPct(ctx.holder));
  if (heal <= 0) return undefined;
  const { healed, lines } = healFighter(ctx.holder, ctx.role, heal, "regrowthHeal", ctx);
  if (hasSetTier(ctx.holder, "Vaeloris", 6)) ctx.holder.flags.forestGuardianCharge = true;
  return [`Regrowth mends you for ${healed} health.`, ...lines];
});
registerModifier("effect:regrowth", {
  source: { kind: "effect", id: "regrowth" },
  hook: "fight.end", order: 10, bucket: null, value: null, behavior: "regrowthHeal",
  params: null, when: null, holders: ["player"], state: null,
  notes: "Regrowth: flat post-combat heal, whether combat ended by winning or by fleeing successfully.",
});

// ---- turn.start (2e-1): six sources, each dispatched via runHookEntry
// at its own original call-site position inside beginTurn (combat.js) --
// see runHookEntry's own header for why these can't be batched through
// one runReactionHook call despite sharing the "turn.start" hook name.
registerBehavior("endlessBloomTick", (ctx) => {
  const combat = ctx.holder.combat;
  const regen = combat && combat.player.regen;
  if (!regen || regen.turnsLeft <= 0) return undefined;
  const { healed, lines } = healFighter(ctx.holder, ctx.role, regen.healPerTurn, "endlessBloomTick", ctx);
  regen.turnsLeft -= 1;
  if (regen.turnsLeft <= 0) combat.player.regen = null;
  return healed > 0 ? [`Endless Bloom mends you for ${healed} health.`, ...lines] : undefined;
});
registerModifier("always:endless_bloom_tick", {
  source: { kind: "always" },
  hook: "turn.start", order: 10, bucket: null, value: null, behavior: "endlessBloomTick",
  params: null, when: null, holders: ["player"], state: null,
  notes: "Endless Bloom: a 5-round Regeneration HoT set up once at combat start (startCombat's own combat.player.regen), ticked here identically in shape to burn/bleed but healing instead. source:'always' since presence is driven by combat.player.regen (set elsewhere), not a hasEffect/hasSetTier check at this read site -- the behavior's own regen/turnsLeft check reproduces today's exact guard.",
});
registerModifier("set:Regalia of the First Bloom:2", {
  source: { kind: "set", id: "Regalia of the First Bloom:2", setName: "Regalia of the First Bloom", tier: 2 },
  hook: "turn.start", order: 20, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.03, round: "ceil", target: "self",
    message: (healed) => `Blessing of Renewal mends you for ${healed} health.`,
  },
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Renewal: an unconditional 3% max Health heal at the start of every round, for as long as the set bonus is active -- no duration or once-per-fight gate, unlike Endless Bloom.",
});
registerModifier("set:Heartwood:6", {
  source: { kind: "set", id: "Heartwood:6", setName: "Heartwood", tier: 6 },
  hook: "turn.start", order: 30, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.02, round: "ceil", target: "self", unconditionalMessage: true,
    message: (healed) => `Heartwood Vitality mends you for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.combat.player.actionCounter % 3 === 0, holders: ["player"], state: null,
  notes: "Heartwood Vitality: every third combat round, restore 2% max Health. combat.player.actionCounter's own UNCONDITIONAL increment stays inline (applyHeartwoodVitality, combat.js) -- shared with Work Refines/Lasting Foundation/Patient Current/Blessing of Valor/Hunter's Instinct/Temporal Echo and others, per Tyler's own established ruling on the identical spellCastCounter/Seedbearer conflict -- only the %3 check + heal move here. Flavor line is unconditional once dispatched (today's own code has no healed>0 gate here, unlike every sibling in this block) -- preserved via unconditionalMessage.",
});
// ================= 2e-3 (25 Nov): cooldown reactions, plus Living Forge =================
// Blessing of the Hour (Regalia of the Eternal Hour 2pc): feeds
// beginTurn's own cooldownDecrement formula (every 4th round, every
// cooldown ticks by 2 instead of 1) -- read BEFORE the decrement loop
// (combat.js), alongside Avatar of Freedom/Avatar of Creation's own
// flag reads (untouched: those are turns-remaining flags, not
// hasEffect/hasSetTier calls). Presence-only is correct (`value: true`
// satisfies M3) -- the modulus condition itself stays inline at its own
// real read site; nothing here needs to travel with a widened holder,
// since beginTurn's cooldown loop is -- and stays -- player-only.
registerModifier("set:Regalia of the Eternal Hour:2", {
  source: { kind: "set", id: "Regalia of the Eternal Hour:2", setName: "Regalia of the Eternal Hour", tier: 2 },
  hook: "turn.start", order: 2, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of the Hour: every 4th round, beginTurn's own cooldownDecrement doubles (2 instead of 1). hasModifier-read at its own real site (combat.js); the (actionCounter+1)%4===0 condition stays inline there, unchanged.",
});
// Living Forge (Divine Regalia -- Embercore): deferred from 2e-1 (20
// Nov, Tyler) because its heal scales by a cooldown-completion COUNT
// computed inside the same loop that drives Blessing of the Hour's own
// decrement rate -- no clean extraction boundary until that loop's own
// two hasEffect/hasSetTier reads (this entry and the one just above)
// were ready to move. Dispatched BY KEY right after the loop finishes
// counting completions into ctx.livingForgeCompletions (not a generic
// turn.start fan-out -- this must run exactly once, reading a count
// nothing else produces). The loop's own gate (whether to count
// completions at all) reads this same key's presence via hasModifier,
// at its own real site inside the loop (combat.js).
registerBehavior("livingForgeHeal", (ctx) => {
  if (!ctx.livingForgeCompletions) return undefined;
  const heal = Math.ceil(ctx.holder.maxHealth * 0.03) * ctx.livingForgeCompletions;
  if (heal <= 0) return undefined;
  const { healed, lines } = healFighter(ctx.holder, ctx.role, heal, "livingForgeHeal", ctx);
  if (healed <= 0) return undefined;
  return [`Living Forge mends you for ${healed} health.`, ...lines];
});
registerModifier("effect:living_forge", {
  source: { kind: "effect", id: "living_forge" },
  hook: "turn.start", order: 5, bucket: null, value: null, behavior: "livingForgeHeal", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Living Forge: every cooldown that reaches 0 THIS tick ('completes') restores 3% max Health. Math.ceil(maxHealth*0.03)*completions preserved exactly (NOT Math.ceil(maxHealth*0.03*completions) -- the two differ whenever maxHealth*0.03 isn't already an integer, e.g. maxHealth=101, completions=2: 4*2=8 vs ceil(6.06)=7). Its '3% Mana' half is a no-op (no Mana resource). Only pushes its line when healed>0 -- matches today's own exact gate (no separate overflow-only path, unlike healOnEvent's default convention).",
});
registerBehavior("livingSteelGrant", (ctx) => {
  const combat = ctx.holder.combat;
  if (combat.player.livingSteelBonus >= 5) return undefined;
  combat.player.livingSteelBonus += 1;
  return `Living Steel hardens further — +${flatStat(1)} Attack, +${flatStat(1)} Defense (now +${flatStat(combat.player.livingSteelBonus)}/+${flatStat(combat.player.livingSteelBonus)}).`;
});
registerModifier("effect:living_steel", {
  source: { kind: "effect", id: "living_steel" },
  hook: "turn.start", order: 35, bucket: null, value: null, behavior: "livingSteelGrant", params: null,
  when: (ctx) => ctx.holder.combat.player.actionCounter % 3 === 0, holders: ["player"], state: null,
  notes: "Living Steel (Mythic, task 40, 24 Nov): +1 Attack/+1 Defense every 3rd combat action, capped at +5/+5 (checked inside the behavior itself, not `when` -- matches today's own single combined if). Same shared actionCounter cadence as Heartwood Vitality/Lasting Foundation/Work Refines/Patient Current (dispatched by KEY at its own real beginTurn position, combat.js, between those two -- not hook fan-out, same convention as every other turn.start-by-key entry in this block). The Attack half is folded into effectivePlayerAtk, the Defense half into effectivePlayerDef -- both untouched, they already just read combat.player.livingSteelBonus.",
});
registerModifier("effect:lasting_foundation", {
  source: { kind: "effect", id: "lasting_foundation" },
  hook: "turn.start", order: 40, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.1, round: "ceil", target: "self",
    message: (healed) => `Lasting Foundation mends you for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.combat.player.actionCounter % 3 === 0, holders: ["player"], state: null,
  notes: "Lasting Foundation: at the end of every third combat round, restore 10% max Health -- reuses the same shared actionCounter Heartwood Vitality/Work Refines/Patient Current read, checked right after applyHeartwoodVitality's own inline increment for this round.",
});
registerModifier("effect:flowing_waters", {
  source: { kind: "effect", id: "flowing_waters" },
  hook: "turn.start", order: 50, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.03, round: "ceil", target: "self",
    message: (healed) => `Flowing Waters mends you for ${healed} health.`,
  },
  when: null, holders: ["player"], state: null,
  notes: "Flowing Waters: restore 3% max Health at the end of every round. Its '3% Mana' half is a no-op (no Mana resource in this engine).",
});
registerBehavior("patientCurrentEase", (ctx) => {
  const cooldowns = ctx.holder.combat.cooldowns;
  const cooling = Object.keys(cooldowns).filter((k) => cooldowns[k] > 0);
  if (!cooling.length) return undefined;
  const key = cooling[Math.floor(Math.random() * cooling.length)];
  cooldowns[key] = Math.max(0, cooldowns[key] - 1);
  return `Patient Current eases ${cooldownDisplayName(key)}'s recovery by a turn.`;
});
registerModifier("effect:patient_current", {
  source: { kind: "effect", id: "patient_current" },
  hook: "turn.start", order: 55, bucket: null, value: null, behavior: "patientCurrentEase", params: null,
  when: (ctx) => ctx.holder.combat.player.actionCounter % 2 === 0, holders: ["player"], state: null,
  notes: "Patient Current (Divine Regalia -- Sandals of the River): every second round spent in combat, ease a random currently-cooling-down Ability/Tactic by 1 turn -- the same random-pick-and-ease pattern Universal Understanding/Twist of Fate already established. Dispatched by KEY at its own real beginTurn position (combat.js, right after Flowing Waters), not hook fan-out -- same convention as Living Steel/Lasting Foundation beside it. cooldownDisplayName is combat.js's own shared helper (global scope).",
});
registerModifier("always:avatar_of_renewal_heal", {
  source: { kind: "always" },
  hook: "turn.start", order: 60, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.1, round: "ceil", target: "self",
    message: (healed) => `Avatar of Renewal mends you for ${healed} health.`,
  },
  when: (ctx) => ctx.holder.combat.player.avatarOfRenewalTurns > 0, holders: ["player"], state: null,
  notes: "Avatar of Renewal (Regalia of the Endless Tide 6pc): restore 10% max Health at the end of every round during its 4-round window. source:'always' -- no hasSetTier re-check at this read site, same precedent as Avatar of Devotion/Endurance's own heal.incoming entries (the window itself could only ever be granted by that set bonus elsewhere). Found during 2e-1's own re-verification: this is a REAL, direct heal, not buff-grant-only like its sibling Avatars -- the initial research pass miscatalogued it; confirmed directly against beginTurn's own code before writing this entry.",
});

// Blessing of Freedom's heal half (2e-2 bug fix, 20 Nov, Tyler, approved):
// "Whenever you evade an attack (from any source), restore 5% max
// Health." This was already implemented, inline, broadly gated on ANY
// zero-damage retaliation (applyEndlessHorizonEvasionBonuses, combat.js --
// Timeless Guard's own "negation" and Guardian Spirit's own block both
// satisfied that gate too, not just a genuine evasion); that inline
// clause is retired, replaced by this entry, narrowly gated on
// applyAndReact.onEvade -- fired only from the 3 mechanics the item text
// itself calls "Evasion" (this set's own 15% roll, rollToHit.defender
// above, Avatar of Freedom's own roll, evasionCharges/evasionTurns'
// dedicated dodge roll). No switch: restores a bonus the item already
// promises, like Fragmenta 6pc -- not a widening of who/what this
// reaches.
// Blessing of Creation (Regalia of the Eternal Forge 2pc, 2e-4, 25 Nov):
// a Rule 1 upgrade of a pure virtual tag ("always:buff_magnitude" -- no
// base registry entry, same shape as Leviathan:6/"action:water") -- base
// 1 (no change), this set tier overrides to 1.25. applyBlessingOfCreationBonus
// (combat.js) stays the untouched pure helper at every one of its many
// call sites; only its internal hasSetTier check moved to resolveUpgradedValue.
registerModifier("set:Regalia of the Eternal Forge:2", {
  source: { kind: "set", id: "Regalia of the Eternal Forge:2", setName: "Regalia of the Eternal Forge", tier: 2 },
  upgrades: "always:buff_magnitude",
  hook: "applyAndReact.onStatusApplied", order: 999, bucket: null, value: 1.25, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Creation: +25% to the MAGNITUDE of any temporary (duration-based) stat bonus granted -- scoped to the atk/magic/defBuffAmount-style buffs that funnel through the shared Turns-based buff fields (Hold the Line, Rooted Resolve, Rally the Line, the Avatar-of-X bursts, Wanderer's Reward, Ever Forward), NOT the separate permanent-for-the-fight stacking counters (Battle Tempered, Living Current, Every Choice Matters, Tempered Steel, Reinforced, Work Refines) -- a different category per the source text's own word choice. `hook`/`bucket: null` required but never consulted for an `upgrades` entry (M3 exempts them), same as every other Rule 1 upgrade.",
});
registerModifier("set:Regalia of the Endless Horizon:2:blessing_of_freedom_heal", {
  source: { kind: "set", id: "Regalia of the Endless Horizon:2", setName: "Regalia of the Endless Horizon", tier: 2 },
  hook: "applyAndReact.onEvade", order: 10, bucket: null, value: null, behavior: "healOnEvent",
  params: {
    basis: "maxHp", pct: 0.05, round: "ceil", target: "self", heal: true, maxPerTrigger: 0.05,
    message: (healed) => `Blessing of Freedom mends you for ${healed} health.`,
  },
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Freedom: restore 5% max Health whenever you evade an attack, from any source.",
});

// ================= 2e-1 close-out: applyAndReact.onLowHealth =================
// LOW_HEALTH_REACTIONS (combat.js) moved onto this hook wholesale -- all
// 16 members, not just the 2 heal rows. 14 of them are buff-window-grant
// triggers only (no direct heal), each wrapped VERBATIM via the shared
// lowHealthReactionWrap behavior below (params.checkFn is the exact,
// unchanged existing function -- own hasEffect/hasSetTier presence
// check, own health-threshold check, own once-per-fight flag, own buff
// grant, all untouched); `source: {kind:"always"}` on every wrapped
// entry since each checkX function already does its own presence test
// internally (same precedent as Siege Corps/Seedbearer's own
// applyAndReact.onActionUsed entries, which also re-check their own
// gate inside the behavior rather than relying on sourceActiveOn).
// `order` matches each one's position in the original array exactly,
// so lowHealthTriggerChecks's own line-order (and therefore which
// once-per-fight flags can observe which other flags already being set,
// though none of these 16 ever read another's flag) is unchanged.
// Love Endures and Avatar of Bloom (the 2 real heals) get their OWN
// dedicated behaviors instead, routing their heal through healFighter
// (the same heal.incoming/applyHealing/heal.overflow chain every other
// 2e-1 heal goes through) -- everything else in each (the once-per-fight
// flag, the buff grant) stays exactly as today, inline.
registerBehavior("lowHealthReactionWrap", (ctx, entry) => {
  const lines = entry.params.checkFn(ctx.holder);
  return lines && lines.length ? lines : undefined;
});
registerBehavior("loveEnduresHeal", (ctx) => {
  const state = ctx.holder;
  state.combat.player.loveEnduresUsed = true;
  const { healed, lines } = healFighter(state, ctx.role, Math.ceil(state.maxHealth * 0.15), "loveEnduresHeal", ctx);
  if (healed <= 0) return undefined;
  return [`Love Endures — even now, it holds you up; mended for ${healed} health.`, ...lines];
});
registerBehavior("avatarOfBloomHeal", (ctx) => {
  const state = ctx.holder;
  const combat = state.combat;
  combat.player.avatarOfBloomUsed = true;
  const { healed, lines } = healFighter(state, ctx.role, Math.ceil(state.maxHealth * 0.5), "avatarOfBloomHeal", ctx);
  const dur = applyBeneficialEffectBonuses(state, 3);
  combat.player.atkBuffTurns = Math.max(combat.player.atkBuffTurns || 0, dur);
  combat.player.atkBuffAmount = Math.max(combat.player.atkBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.atk * 0.25)));
  combat.player.magicBuffTurns = Math.max(combat.player.magicBuffTurns || 0, dur);
  combat.player.magicBuffAmount = Math.max(combat.player.magicBuffAmount || 0, applyBlessingOfCreationBonus(state, Math.round(state.magic * 0.25)));
  combat.player.defBuffTurns = Math.max(combat.player.defBuffTurns, dur);
  combat.player.defBuffAmount = Math.max(combat.player.defBuffAmount, applyBlessingOfCreationBonus(state, Math.round(state.def * 0.25)));
  return [`Avatar of Bloom awakens — you're mended for ${healed} health, and bloom with +25% Attack/Magic/Defense for 3 turns.`, ...lines];
});
registerModifier("set:Legion:8", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 10, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkHoldTheLine(state) },
  when: null, holders: ["player"], state: null,
  notes: "Hold the Line: buff-only (checkHoldTheLine grants +6 Defense for 2 turns below 30% HP, no heal) -- 2e-2 territory for any further generalization; this entry only relocates its dispatch.",
});
registerModifier("effect:rooted_resolve", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 20, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkRootedResolve(state) },
  when: null, holders: ["player"], state: null,
  notes: "Rooted Resolve: buff-only (checkRootedResolve grants +8 Defense for 3 turns below 50% HP, no heal, combat.js:6141) -- 2e-2 territory.",
});
registerModifier("set:Regalia of the First Bloom:6", {
  source: { kind: "set", id: "Regalia of the First Bloom:6", setName: "Regalia of the First Bloom", tier: 6 },
  hook: "applyAndReact.onLowHealth", order: 30, bucket: null, value: null, behavior: "avatarOfBloomHeal",
  params: null,
  when: (ctx) => ctx.holder.combat && !ctx.holder.combat.player.avatarOfBloomUsed && ctx.holder.health > 0 && ctx.holder.health < ctx.holder.maxHealth * 0.25,
  holders: ["player"], state: null,
  notes: "Avatar of Bloom: once per fight, the first time Health drops below 25%, a 50% max Health heal plus +25% Attack/Magic/Defense for 3 turns -- the heal now routes through healFighter; avatarOfBloomUsed stays the existing flat combat.player field.",
});
registerModifier("set:Regalia of the Final Veil:6", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 40, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfPassing(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Passing's own window-GRANT trigger: buff-only (grants avatarOfPassingTurns, no heal of its own -- the REAL heal is its onHitDealt lifesteal entry, already migrated above). This entry only relocates the grant's dispatch.",
});
registerModifier("set:Regalia of the Woven Thread:6:avatar_of_fate_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 50, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfFate(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Fate: buff-only (crit doubling + a cheatDeath save, no heal, combat.js:6239) -- 2e-2/2e-5 territory. Keyed distinctly from set:Regalia of the Woven Thread:6 (the M1 crit-damage placeholder) -- same set tier, unrelated mechanic, same precedent as Crushing Impact's own disambiguated key.",
});
registerModifier("set:Regalia of the Crimson Vanguard:6:avatar_of_war_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 70, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfWar(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of War's own window-GRANT trigger: buff-only (grants avatarOfWarTurns, no heal of its own -- the REAL heal is its onHitDealt lifesteal entry, already migrated above). Keyed distinctly from set:Regalia of the Crimson Vanguard:6 (the Executioner-threshold upgrade entry) -- same set tier, unrelated mechanic.",
});
registerModifier("set:Regalia of the Endless Archive:6", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 80, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfKnowledge(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Knowledge: buff-only (Magic/Knowledge buffs, free spell casts, matchup overrides, no heal, combat.js:6282) -- 2e-2 territory.",
});
registerModifier("effect:love_endures", {
  source: { kind: "effect", id: "love_endures" },
  hook: "applyAndReact.onLowHealth", order: 90, bucket: null, value: null, behavior: "loveEnduresHeal",
  params: null,
  when: (ctx) => ctx.holder.combat && !ctx.holder.combat.player.loveEnduresUsed && ctx.holder.health > 0 && ctx.holder.health < ctx.holder.maxHealth * 0.2,
  holders: ["player"], state: null,
  notes: "Love Endures: the first time Health would fall below 20% each fight, restore 15% max Health -- now routes through healFighter; loveEnduresUsed stays the existing flat combat.player field.",
});
registerModifier("set:Regalia of the Eternal Heart:6:avatar_of_devotion_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 100, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfDevotion(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Devotion's own window-GRANT trigger: buff-only (grants avatarOfDevotionTurns, no heal of its own -- its real effect is doubled healing RECEIVED, already a heal.incoming entry above). Keyed distinctly from set:Regalia of the Eternal Heart:6 (the calculateDamage.incoming doubler) -- same set tier, unrelated dispatch point.",
});
registerModifier("set:Regalia of the Laughing Gale:6:avatar_of_chaos_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 110, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfChaos(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Chaos: buff-only (damage swing + doubled crit chance + per-crit stat grants, no heal, combat.js:6327) -- 2e-2 territory. Keyed distinctly from set:Regalia of the Laughing Gale:6 (the calculateDamage.outgoing variance entry) -- same set tier, unrelated mechanic.",
});
registerModifier("set:Regalia of the Eternal Bastion:6:avatar_of_endurance_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 120, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfEndurance(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Endurance's own window-GRANT trigger: buff-only (grants avatarOfEnduranceTurns, no heal of its own -- its real effect is +50% healing RECEIVED, already a heal.incoming entry above). Keyed distinctly from set:Regalia of the Eternal Bastion:6 (the calculateDamage.incoming doubler) -- same set tier, unrelated dispatch point.",
});
registerModifier("set:Regalia of the Endless Horizon:6", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 130, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfFreedom(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Freedom: buff-only (faster cooldowns, bypassed restrictions, its own evasion roll, no heal, combat.js:6368) -- 2e-2 territory.",
});
registerModifier("set:Regalia of the Eternal Forge:6", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 140, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfCreation(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Creation: buff-only (Attack/Magic buffs, faster cooldowns, permanent per-hit growth, no heal, combat.js:6390) -- 2e-2 territory.",
});
registerModifier("set:Regalia of the Endless Tide:6:avatar_of_renewal_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 150, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfRenewal(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Renewal's own window-GRANT trigger: buff-only (grants avatarOfRenewalTurns, no heal of its own -- its real per-round heal is already a turn.start entry above, and its incoming-damage cut is already a calculateDamage.incoming entry). Keyed distinctly from set:Regalia of the Endless Tide:6 -- same set tier, unrelated dispatch point.",
});
registerModifier("effect:rally_the_line", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 60, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkRallyTheLine(state) },
  when: null, holders: ["player"], state: null,
  notes: "Rally the Line: buff-only (+10 Attack/+10 Defense for 4 rounds below 50% HP, no heal, combat.js:6174) -- 2e-2 territory.",
});
registerModifier("set:Regalia of the Eternal Hour:6:avatar_of_time_trigger", {
  source: { kind: "always" },
  hook: "applyAndReact.onLowHealth", order: 160, bucket: null, value: null, behavior: "lowHealthReactionWrap",
  params: { checkFn: (state) => checkAvatarOfTime(state) },
  when: null, holders: ["player"], state: null,
  notes: "Avatar of Time: buff-only (zeroes cooldowns, +25% damage window, frozen buff durations, no heal, combat.js:6442) -- 2e-2 territory. Keyed distinctly from set:Regalia of the Eternal Hour:6 (the calculateDamage.outgoing burst entry) -- same set tier, unrelated mechanic.",
});

// ================= 2e-1 close-out: applyAndReact.onFavorableRoll =================
// Twist of Fate (Regalia of the Laughing Gale 4pc): fires whenever this
// god's own randomness favors the player -- Loaded Dice's double-damage
// roll, Winds of Change's per-round reroll, or a miss triggering Unlikely
// Outcome. Both halves (the heal AND the cooldown ease) migrate together:
// the cooldown ease isn't entangled with anything unmigrated -- a plain
// inline mutation reading combat.cooldowns directly, no registry
// dependency -- so there's no reason to split it into a later increment.
registerBehavior("twistOfFateReaction", (ctx) => {
  const state = ctx.holder;
  const combat = state.combat;
  const lines = [];
  const heal = Math.ceil(state.maxHealth * 0.05);
  if (heal > 0) {
    const { healed, lines: healLines } = healFighter(state, ctx.role, heal, "twistOfFateReaction", ctx);
    if (healed > 0) lines.push(`Twist of Fate mends you for ${healed} health.`, ...healLines);
  }
  const cooling = Object.keys(combat.cooldowns).filter((k) => combat.cooldowns[k] > 0);
  if (cooling.length) {
    const key = cooling[Math.floor(Math.random() * cooling.length)];
    combat.cooldowns[key] = Math.max(0, combat.cooldowns[key] - 1);
    lines.push(`Twist of Fate eases ${cooldownDisplayName(key)}'s recovery by a turn.`);
  }
  return lines.length ? lines : undefined;
});
registerModifier("set:Regalia of the Laughing Gale:4", {
  source: { kind: "set", id: "Regalia of the Laughing Gale:4", setName: "Regalia of the Laughing Gale", tier: 4 },
  hook: "applyAndReact.onFavorableRoll", order: 10, bucket: null, value: null, behavior: "twistOfFateReaction",
  params: null, when: (ctx) => !!ctx.holder.combat, holders: ["player"], state: null,
  notes: "Twist of Fate: restores 5% max Health and eases a random cooling-down ability by a turn, whenever Loaded Dice/Winds of Change/Unlikely Outcome's own randomness favors the player.",
});

// ================= 2e-3 (25 Nov): the cooldown-reaction cluster =================
// Recon (fork, 25 Nov) confirmed the catalogue's "applyAndReact.* /
// chooseAction -- REVIEW" guess was simply wrong for every row below --
// none of these touch chooseAction. The real dispatch points are
// useFeint/useDecoy/useDisarm (Group A, an already-factored, IDENTICAL
// sequence duplicated at 3 call sites, plus resolver.js's generic
// usePlayerAction as a 4th) and useElementAbility (Group B, a parallel
// but structurally DIFFERENT mage-flavored sequence -- independent `if`
// statements, not one if/else-if chain). Every entry here is dispatched
// either via the pre-existing named helper functions (applyPerfectTiming/
// applyTacticalMemory, combat.js, kept at their exact original call
// sites and signatures) or via hasModifier at the exact site the raw
// hasEffect/hasSetTier call used to sit -- never a new generic fan-out,
// since each real site's own surrounding arithmetic/short-circuit shape
// is the actual effect and must stay byte-identical.

// ---- Group C: once-per-combat free-cooldown charges, seeded outside
// any cast's own resolution ----
registerModifier("effect:hourglass_reserve", {
  source: { kind: "effect", id: "hourglass_reserve" },
  hook: "cooldown.set", order: 1, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Hourglass Reserve (Divine Regalia): once-per-combat free-cooldown charge, seeded into combat.player.hourglassReserveReady at combat-object creation (combat.js) -- hasModifier-read there; consumed inline at every cooldown call site (a flag READ, not a hasEffect call, left untouched).",
});
registerModifier("effect:swift_passage", {
  source: { kind: "effect", id: "swift_passage" },
  hook: "cooldown.set", order: 1, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Swift Passage (Divine Regalia -- Windstep Boots): defeating an enemy queues a free-cooldown charge for the player's NEXT fight, via the pre-existing Events.on('enemy.killed'/'combat.started') pub/sub bus (combat.js) -- kept as-is per Tyler's 25 Nov ruling (same parallel-dispatch-system acceptance LOW_HEALTH_REACTIONS got before 2e-1); only this entry's own hasEffect check (inside the 'enemy.killed' handler) moved to hasModifier. Consumed inline at every cooldown call site (combat.player.swiftPassageReady, a flag READ, not a hasEffect call, left untouched).",
});

// ---- Group A: Feint/Decoy/Disarm/resolver.js's shared Tactic cooldown
// sequence (useFeint combat.js; useDecoy/useDisarm pipeline.js;
// usePlayerAction resolver.js) ----
registerModifier("effect:perfect_recall", {
  source: { kind: "effect", id: "perfect_recall" },
  hook: "cooldown.set", order: 1, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Perfect Recall (Artifact): skips the 'still recovering' gate entirely for Feint/Decoy/Disarm/resolver.js's generic Tactic path (NOT useElementAbility, which has no such check -- confirmed directly against its real code) -- cooldowns still accrue normally underneath. Presence-only is correct: the call site's own early-return IS the complete behavior.",
});
registerModifier("effect:feinting_edge", {
  source: { kind: "effect", id: "feinting_edge" },
  hook: "cooldown.set", order: 10, bucket: null, value: true, behavior: null,
  when: null, holders: ["player", "enemy", "ally"], state: null,
  notes: "Feinting Edge: Feint-only override to a flat 1-round cooldown (player, useFeint, combat.js -- Decoy/Disarm/resolver.js's generic path have no such override, confirmed directly: they start from t.cooldown/def.cooldown plain). Generalized for enemy (resolveEnemyActiveAbility, combat.js) and ally (useHadrianActive, companion.js) as a proportional flat -1 instead (a flat override-to-1 would be a wildly bigger effect on a 5-7 round enemy Active than Feint's own 2-round one) -- holders widened to match code that already existed before this task (a catalogue correction, not R1/R2). Every site keeps its own inline arithmetic; this entry is presence-only (hasModifier) at all three.",
});
registerModifier("effect:master_strategist", {
  source: { kind: "effect", id: "master_strategist" },
  hook: "cooldown.set", order: 20, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Master Strategist (Mythic) and First Kingdom:6 (set:First Kingdom:6, below) are both a flat, unconditional -1 to every Tactic's cooldown, OR-gated (either or both present still only -1 once) -- applyFirstKingdomCooldown (combat.js) stays the untouched pure helper; only the two hasModifier presence reads feeding its call move here.",
});
registerModifier("set:First Kingdom:6", {
  source: { kind: "set", id: "First Kingdom:6", setName: "First Kingdom", tier: 6 },
  hook: "cooldown.set", order: 20, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "See effect:master_strategist's own note just above -- same shared flat -1, independent source.",
});
registerBehavior("perfectTimingFire", (ctx) => {
  const player = ctx.holder.combat.player;
  if (player.perfectTimingUsed) return false;
  player.perfectTimingUsed = true;
  return true;
});
registerModifier("effect:perfect_timing", {
  source: { kind: "effect", id: "perfect_timing" },
  hook: "cooldown.set", order: 30, bucket: null, value: null, behavior: "perfectTimingFire", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Perfect Timing (Mythic): the first Tactic/Ability used each fight ignores its cooldown entirely -- once-per-fight, combat.player.perfectTimingUsed kept as the literal flat field name (frozen-fixture-safe, same precedent as Sure Foundation/retaliationDef). Dispatched through applyPerfectTiming(state) -- combat.js, SAME name/signature/call sites as before this task, only its internal body now reads runHookEntryValue instead of raw hasEffect+flag. Takes priority over First Kingdom/Master Strategist's flat reduction and Tactical Memory's probabilistic one (both moot once cooldown is already 0) -- today's own if/else-if chain position, unchanged; this entry's own job is only the presence+once-per-fight check.",
});
registerBehavior("tacticalMemoryFire", (ctx) => {
  const host = modifierStateHost(ctx.holder, ctx.role);
  if (!ctx.cooldown || host.tacticalMemoryUsed) return { cooldown: ctx.cooldown, fired: false };
  const rate = ctx.role === "player" ? tacticalMemoryChance(ctx.holder) : 0.2;
  if (Math.random() < rate) {
    host.tacticalMemoryUsed = true;
    return { cooldown: Math.max(1, ctx.cooldown - 1), fired: true };
  }
  return { cooldown: ctx.cooldown, fired: false };
});
registerModifier("effect:tactical_memory", {
  source: { kind: "effect", id: "tactical_memory" },
  hook: "cooldown.set", order: 40, bucket: null, value: null, behavior: "tacticalMemoryFire", params: null,
  when: null, holders: ["player", "enemy", "ally"], state: null,
  notes: "Tactical Memory: probabilistic -1 to the Tactic/Active just resolved, once per fight, rate from tacticalMemoryChance (player only -- Examiner:6/First Kingdom:4 push 20%->50%, Rule 1) or a fixed 20% (enemy/ally, no upgrade source exists for either -- confirmed directly). holders widened to enemy/ally to match code that already existed before this task (catalogue correction, same as Feinting Edge above). For the PLAYER, dispatched through applyTacticalMemory(state, cooldown) -- combat.js, SAME name/signature/call sites as before, only its internal body changed. For enemy/ally, dispatched inline at resolveEnemyActiveAbility (combat.js)/useHadrianActive (companion.js) -- NOT through this same behavior path: those two sites store the once-per-fight flag on the per-fight enemy SLOT record (combat.enemies[i]), a DIFFERENT object from the equipment-bearing creatureObj that hasEffect/sourceActiveOn must read (confirmed directly: resolveEnemyActiveAbility's own `enemy` and `creature` params are genuinely different objects; `hasEffect(enemy,...)` would silently return false, no .equipment on the slot). Routing the real state write through modifierStateHost(holder,'enemy') would therefore need `holder` to BE the slot, which breaks the presence check -- so enemy/ally keep their own original inline flag+roll+math, with only the raw hasEffect call swapped for hasModifier(creature,'enemy',...). This entry's own `tacticalMemoryFire` behavior is reached ONLY via the player-side wrapper functions.",
});
registerModifier("set:Examiner:6", {
  source: { kind: "set", id: "Examiner:6", setName: "Examiner", tier: 6 },
  upgrades: "effect:tactical_memory",
  hook: "cooldown.set", order: 999, bucket: null, value: 0.5, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Tactical Memory's proc rate, 20% -> 50% (Rule 1 upgrade, same shape as Patient Aim/Feint, Leviathan:6/Water). Math.max in resolveUpgradedValue means either (or both) this and set:First Kingdom:4 present still yields 50%, matching today's hasSetTier(...,'Examiner',6)||hasSetTier(...,'First Kingdom',4) OR-check in tacticalMemoryChance (js/data/sets.js) exactly.",
});
registerModifier("set:First Kingdom:4", {
  source: { kind: "set", id: "First Kingdom:4", setName: "First Kingdom", tier: 4 },
  upgrades: "effect:tactical_memory",
  hook: "cooldown.set", order: 999, bucket: null, value: 0.5, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Tactical Memory's proc rate, 20% -> 50% -- see set:Examiner:6's own note just above (same upgrade, independent source).",
});

// ---- Group B: useElementAbility's own cooldown sequence (pipeline.js)
// -- independent `if` statements, NOT an if/else-if chain (confirmed
// directly: Conduit Mastery's flat -1 always applies when present, even
// if a later free-cast source also zeroes the cooldown out) ----
registerModifier("effect:conduit_mastery", {
  source: { kind: "effect", id: "conduit_mastery" },
  hook: "cooldown.set", order: 50, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Conduit Mastery (mage equivalent of Master Strategist/First Kingdom:6): flat, unconditional -1 to the just-cast element's own cooldown. Bare hasModifier swap -- the Math.max(1, cooldown-1) math stays inline at its own real site (useElementAbility, pipeline.js), unconditional on whatever a LATER free-cast source does to the same local variable (confirmed: today's own code applies this BEFORE the Novitiate/Conduit Ease/Eureka checks, not gated by them).",
});
registerBehavior("noviceFreeCastFire", (ctx) => {
  const player = ctx.holder.combat.player;
  if (player.noviceFreeCastUsed) return false;
  player.noviceFreeCastUsed = true;
  return true;
});
registerModifier("effect:rivers_favor", {
  source: { kind: "effect", id: "rivers_favor" },
  hook: "cooldown.set", order: 60, bucket: null, value: null, behavior: "noviceFreeCastFire", params: null,
  when: null, holders: ["player"], state: null,
  notes: "River's Favor and Novitiate:6 (set:Novitiate:6, below) share ONE check today (hasSetTier(...,'Novitiate',6)||hasEffect(...,'rivers_favor')), gating the SAME once-per-fight free-first-cast charge (combat.player.noviceFreeCastUsed, kept as the literal flat field name). Both keys share this one behavior; the call site (useElementAbility, pipeline.js) checks hasModifier against EITHER key first (matching today's OR exactly), then dispatches runHookEntryValue against whichever one is actually present -- the behavior itself doesn't care which key invoked it, since both read/write the same flat field.",
});
registerModifier("set:Novitiate:6", {
  source: { kind: "set", id: "Novitiate:6", setName: "Novitiate", tier: 6 },
  hook: "cooldown.set", order: 60, bucket: null, value: null, behavior: "noviceFreeCastFire", params: null,
  when: null, holders: ["player"], state: null,
  notes: "See effect:rivers_favor's own note just above -- same shared once-per-fight charge.",
});
registerModifier("effect:conduit_ease", {
  source: { kind: "effect", id: "conduit_ease" },
  hook: "cooldown.set", order: 70, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Conduit Ease (mage equivalent of Tactical Memory): probabilistic -1 to the just-cast element's own cooldown, rate from conduitEaseChance (Kabal:6/Conduit Master:4 push 20%->40%, Rule 1) -- NO once-per-fight flag (unlike Tactical Memory: confirmed directly, this can fire every single cast). Bare hasModifier swap at its own real else-if site (useElementAbility, pipeline.js) -- the Math.random()<conduitEaseChance(state) roll and the flavor line stay inline exactly as today.",
});
registerModifier("set:Kabal:6", {
  source: { kind: "set", id: "Kabal:6", setName: "Kabal", tier: 6 },
  upgrades: "effect:conduit_ease",
  hook: "cooldown.set", order: 999, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Conduit Ease's proc rate, 20% -> 40% (Rule 1 upgrade). Math.max in resolveUpgradedValue means either (or both) this and set:Conduit Master:4 present still yields 40%, matching today's hasSetTier(...,'Kabal',6)||hasSetTier(...,'Conduit Master',4) OR-check in conduitEaseChance (js/data/sets.js) exactly.",
});
registerModifier("set:Conduit Master:4", {
  source: { kind: "set", id: "Conduit Master:4", setName: "Conduit Master", tier: 4 },
  upgrades: "effect:conduit_ease",
  hook: "cooldown.set", order: 999, bucket: null, value: 0.4, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Conduit Ease's proc rate, 20% -> 40% -- see set:Kabal:6's own note just above (same upgrade, independent source).",
});
registerModifier("effect:eureka", {
  source: { kind: "effect", id: "eureka" },
  hook: "cooldown.set", order: 80, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Eureka: every 4th spell cast (combat.player.spellCastCounter % 4 === 0) is free -- bare hasModifier swap, the modulus check and cooldown=0/flavor-line stay inline at their own real site (useElementAbility, pipeline.js). No once-per-fight flag, no randomness -- can fire repeatedly, every 4th cast, all fight.",
});
registerBehavior("universalUnderstandingEase", (ctx) => {
  const holder = ctx.holder;
  const combat = holder.combat;
  const otherKnown = [holder.primaryElement, holder.secondaryElement, holder.tertiaryElement]
    .filter((el) => el && el !== ctx.elementKey && (combat.cooldowns[el] || 0) > 0);
  if (!otherKnown.length) return undefined;
  const pick = otherKnown[Math.floor(Math.random() * otherKnown.length)];
  combat.cooldowns[pick] = Math.max(0, combat.cooldowns[pick] - 2);
  return `Universal Understanding — the insight carries over; ${ELEMENT_ABILITIES[pick].name}'s cooldown eases.`;
});
registerModifier("set:Regalia of the Endless Archive:4", {
  source: { kind: "set", id: "Regalia of the Endless Archive:4", setName: "Regalia of the Endless Archive", tier: 4 },
  hook: "cooldown.set", order: 90, bucket: null, value: null, behavior: "universalUnderstandingEase", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Universal Understanding: right after THIS cast's own cooldown is set, eases a DIFFERENT known element's cooldown by 2 (random pick among the ones currently cooling) -- dispatched by key right after state.combat.cooldowns[elementKey]=cooldown (useElementAbility, pipeline.js), via the plain lines convention (runHookEntry, not runHookEntryValue) since nothing here feeds back into the caller's own local cooldown variable, unlike every cooldown.set entry above it.",
});

// ================= 2e-4 (25 Nov): lifecycle =================
// The 8 rows the 19 Nov §3 review already confirmed as "lifecycle" (kind
// + hook assigned) but never migrated into real registry entries, plus
// one catalogue gap found while reading this batch's own real code
// (Regalia of the Endless Archive:2's fight.start reveal half, bundled
// onto the same set tier as its already-separately-catalogued
// stat.critChance half -- that half stays out of scope here, 2b/stat
// territory, not lifecycle).

// ---- turn.start: Battle Tempered / Unwavering Devotion / Work Refines
// -- all three are SILENT (confirmed directly: no lines.push anywhere
// in their real code), capped per-round stat-stack grants inside
// beginTurn (combat.js) ----
registerBehavior("battleTemperedGrant", (ctx) => {
  const player = ctx.holder.combat.player;
  if ((player.battleTemperedAtkStacks || 0) < 10) player.battleTemperedAtkStacks = (player.battleTemperedAtkStacks || 0) + 1;
  if ((player.battleTemperedDefStacks || 0) < 10) player.battleTemperedDefStacks = (player.battleTemperedDefStacks || 0) + 1;
  return undefined;
});
registerModifier("effect:battle_tempered", {
  source: { kind: "effect", id: "battle_tempered" },
  hook: "turn.start", order: 15, bucket: null, value: null, behavior: "battleTemperedGrant", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Battle Tempered (Divine Regalia -- Armor of the First Legion): every round spent in combat grants +1 Attack/+1 Defense, capped +10/+10 each independently -- unconditional per-action (confirmed directly), unlike Living Steel's every-3rd-action gate. Silent: no flavor line in today's own code.",
});
registerBehavior("unwaveringDevotionGrant", (ctx) => {
  const player = ctx.holder.combat.player;
  if ((player.unwaveringDevotionStacks || 0) < 10) player.unwaveringDevotionStacks = (player.unwaveringDevotionStacks || 0) + 1;
  return undefined;
});
registerModifier("effect:unwavering_devotion", {
  source: { kind: "effect", id: "unwavering_devotion" },
  hook: "turn.start", order: 16, bucket: null, value: null, behavior: "unwaveringDevotionGrant", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Unwavering Devotion (Divine Regalia -- Vestments of Boundless Devotion): every round survived grants +2 Magic, capped +20 (10 stacks) -- Battle Tempered's exact shape, one stat instead of two. Silent: no flavor line.",
});
registerBehavior("workRefinesGrant", (ctx) => {
  const player = ctx.holder.combat.player;
  if ((player.workRefinesAtkStacks || 0) < 20) player.workRefinesAtkStacks = Math.min(20, (player.workRefinesAtkStacks || 0) + 2);
  if ((player.workRefinesMagicStacks || 0) < 20) player.workRefinesMagicStacks = Math.min(20, (player.workRefinesMagicStacks || 0) + 2);
  return undefined;
});
registerModifier("effect:work_refines", {
  source: { kind: "effect", id: "work_refines" },
  hook: "turn.start", order: 17, bucket: null, value: null, behavior: "workRefinesGrant", params: null,
  when: (ctx) => ctx.holder.combat.player.actionCounter % 3 === 0, holders: ["player"], state: null,
  notes: "Work Refines (Divine Regalia -- Ring of Endless Labor): every 3rd action, +2 Attack/+2 Magic, capped +20/+20 (10 triggers) -- the modulus is this entry's own condition (same shared actionCounter cadence as Heartwood Vitality/Lasting Foundation/Patient Current, per Tyler's own established ruling on the identical conflict). Silent: no flavor line.",
});

// ---- round.start: Unhurried Step -- an ordering effect (actsFirst),
// not a stat/buff grant or a heal. Tyler's own flagged question (19
// Nov §3 review) was whether round.start's registry shape needs a new
// "ordering" variant for this -- resolved without one: the real site
// (buildInitiativeOrder, combat.js) reads a single boolean straight into
// a sort-key field, with no portable value/line a widened holder could
// receive anyway, so this is the same "call site's own logic IS the
// complete behavior" shape Perfect Recall/Feinting Edge used in 2e-3 --
// presence-only (hasModifier) is correct, no behavior needed. ----
registerModifier("effect:unhurried_step", {
  source: { kind: "effect", id: "unhurried_step" },
  hook: "round.start", order: 1, bucket: null, value: true, behavior: null,
  when: null, holders: ["player"], state: null,
  notes: "Unhurried Step (Divine Regalia -- Sandals of the Unbroken Path): grants the player the same actsFirst status enemies/allies can already carry on their own creatureObj/ally record -- read directly into buildInitiativeOrder's own entries.push (combat.js), via hasModifier, in place of the raw hasEffect call. No new round.start 'ordering' variant needed -- see note above.",
});

// ---- applyAndReact.onStatusApplied (negation variant): Unshaken
// Command. Dispatched BY KEY at tryApplyEnemyStun's own real position
// (combat.js) -- a standalone, already-isolated function, NOT a fan-out
// off an actual onStatusApplied event (it runs BEFORE a stun would be
// applied, to negate it, not after a beneficial effect was granted).
// hook name shared with Faithful Heart/Heartward Bond/Imperial
// Authority purely for M1 bookkeeping -- Tyler's own flagged note (19
// Nov §3 review) asked this be noted precisely in the entry itself.
// Today's only real call site (js/data/actions.js, the Force element
// ability, both branches) always passes the ENEMY creatureObj as
// `creature` -- the function's own "wearer-neutral" framing is
// forward-looking (no player/ally call site exists today), so holders
// stays ["enemy"], matching what's actually reachable now. ----
registerBehavior("unshakenCommandNegate", (ctx) => {
  const holder = ctx.holder;
  const charges = holder.unshakenCommandCharges != null ? holder.unshakenCommandCharges : 2;
  if (charges <= 0) return undefined;
  holder.unshakenCommandCharges = charges - 1;
  return `Unshaken Command turns the Stun aside.`;
});
registerModifier("effect:dra_e02_unshaken_command", {
  source: { kind: "effect", id: "dra_e02_unshaken_command" },
  hook: "applyAndReact.onStatusApplied", order: 1, bucket: null, value: null, behavior: "unshakenCommandNegate", params: null,
  when: null, holders: ["enemy"], state: null,
  notes: "Unshaken Command (DRA-E02): a 2-charge-per-combat pool that blocks a Stun from landing on its wearer -- negates rather than reacts to a grant, the opposite direction of Faithful Heart/Heartward Bond on this same hook name. Dispatched by key at tryApplyEnemyStun's own body (combat.js), which already wraps this as a standalone, wearer-neutral function; holders scoped to today's only real call site (enemy).",
});

// ---- fight.start: Weaver's Insight, Unsettling, and Regalia of the
// Endless Archive:2's own fight.start reveal half (Blessing of
// Insight -- its SEPARATE stat.critChance half, already catalogued
// under the bare "set:Regalia of the Endless Archive:2" key, is 2b/stat
// territory, out of scope here). All three dispatched BY KEY at their
// own exact startCombat positions (combat.js), in original order,
// alongside Blessing of the Tide's existing fan-out (runReactionHook)
// on the same hook name -- by-key dispatch means no double-fire risk
// regardless of how many other entries share "fight.start". ----
registerBehavior("weaversInsightReveal", (ctx) => {
  const creature = ctx.creature;
  const statusBits = [];
  if (creature.element) statusBits.push(`${ELEMENTS[creature.element].name} affinity`);
  if (creature.spawnRarity === "unique") statusBits.push("unique");
  return `Weaver's Insight unravels the moment: ${withThe(creature.name, false)} has ${creature.hp} Health, ${creature.def} Defense, ${creature.atk} Attack` +
    (statusBits.length ? ` (${statusBits.join(", ")})` : "") + ".";
});
registerModifier("effect:weavers_insight", {
  source: { kind: "effect", id: "weavers_insight" },
  hook: "fight.start", order: 20, bucket: null, value: null, behavior: "weaversInsightReveal", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Weaver's Insight (Divine Regalia -- Silver Thread of Veylana): reveals the enemy's remaining Health, Defense, Attack, and any active status at the start of combat. Its 'future bosses reveal hidden phases one turn earlier' clause is explicitly forward-looking -- nothing to build for that yet.",
});
registerBehavior("insightRevealWeakness", (ctx) => {
  const creature = ctx.creature;
  if (!creature.element) return undefined;
  const counters = Object.entries(ELEMENT_MATCHUPS).filter(([, m]) => m.strongVs.includes(creature.element)).map(([el]) => ELEMENTS[el].name);
  if (!counters.length) return undefined;
  return `Blessing of Insight reveals a weakness: ${withThe(creature.name, false)} is exposed to ${counters.join(" and ")}.`;
});
registerModifier("set:Regalia of the Endless Archive:2:insight_reveal", {
  source: { kind: "set", id: "Regalia of the Endless Archive:2", setName: "Regalia of the Endless Archive", tier: 2 },
  hook: "fight.start", order: 25, bucket: null, value: null, behavior: "insightRevealWeakness", params: null,
  when: null, holders: ["player"], state: null,
  notes: "Blessing of Insight's fight.start half: reveals which elements the enemy is weak against, at the start of combat -- only meaningful against elemental creatures. This set tier's OTHER half (a +20% crit spell chance) is a separate, already-catalogued stat.critChance concern under the bare 'set:Regalia of the Endless Archive:2' key -- found while reading this batch's own real code (startCombat, combat.js), not previously flagged as its own row. Compound key, same convention as First Sword's Regalia:10:legacy.",
});
registerBehavior("unsettlingDebuff", (ctx) => {
  if (Math.random() >= 0.2) return undefined;
  activeEnemySlot(ctx.holder.combat).enemyAtkPenalty += 2;
  return `Something about you unsettles it before the fight even starts — its guard is already down.`;
});
registerModifier("effect:unsettling", {
  source: { kind: "effect", id: "unsettling" },
  hook: "fight.start", order: 30, bucket: null, value: null, behavior: "unsettlingDebuff", params: null,
  when: (ctx) => !ctx.creature.friendly, holders: ["player"], state: null,
  notes: "Unsettling: a flat 20% chance the enemy starts the fight already weakened (+2 enemyAtkPenalty) -- rolled once at combat start rather than in playerAttack/etc, since it's a combat-start effect, not a per-action one.",
});

// ================= 2e-5 (25 Nov): saves (cheatDeath) + Riposte =================
// cheatDeath is the first real dispatch of this hook (declared in
// MOD_HOOKS, never dispatched before this task). checkDeathPrevention
// (combat.js) is a strict if/else-if chain sharing ONE `msg` variable
// and ONE "set health to 1" side effect -- the exact "first one that
// fires wins, stop evaluating the rest" shape rollToHit.defender's own
// miss chain already established (firstStop, below). Tyler's 24 Nov
// ruling left last_stand alone specifically because migrating ONE
// branch of this shared chain alone would risk the real mutual-
// exclusivity ordering -- resolved now by migrating the WHOLE chain
// together, in its own real order (Elder Bark:6 -> Last Stand ->
// Between Worlds -> Avatar of Fate).
registerBehavior("elderBarkSave", (ctx) => {
  ctx.holder.combat.player.elderBarkSaveUsed = true;
  ctx.holder.health = 1;
  return { stop: true, msg: `The oldest wood remembers you yet — you survive this at 1 Health.` };
});
registerModifier("set:Elder Bark:6", {
  source: { kind: "set", id: "Elder Bark:6", setName: "Elder Bark", tier: 6 },
  hook: "cheatDeath", order: 10, bucket: null, value: null, behavior: "elderBarkSave", params: null,
  when: (ctx) => !ctx.holder.combat.player.elderBarkSaveUsed, holders: ["player"], state: null,
  notes: "Elder Bark:6: once per fight, a lethal hit instead leaves the player at 1 Health. First (highest-priority) branch of checkDeathPrevention's own if/else-if chain -- dispatched via runHook('cheatDeath',...)+firstStop, in order, so a later branch is never even evaluated once an earlier one fires (matching today's exact short-circuit).",
});
registerBehavior("lastStandSave", (ctx) => {
  const player = ctx.holder.combat.player;
  player.lastStandUsed = true;
  ctx.holder.health = 1;
  player.lastStandAtkBonus = (player.lastStandAtkBonus || 0) + 5;
  return { stop: true, msg: `Last Stand — you refuse to fall. 1 Health, and +${flatStat(5)} Attack for what's left of this fight.` };
});
registerModifier("effect:last_stand", {
  source: { kind: "effect", id: "last_stand" },
  hook: "cheatDeath", order: 20, bucket: null, value: null, behavior: "lastStandSave", params: null,
  when: (ctx) => !ctx.holder.combat.player.lastStandUsed, holders: ["player"], state: null,
  notes: "Last Stand (Mythic): migrated (2e-5, 25 Nov) -- second branch of the same chain as Elder Bark:6 above; see that entry's own note for why the whole chain moved together. lastStandAtkBonus is a raw stat-point grant (v0.11 PLAYER_STAT_SCALE), folded into effectivePlayerAtk's own flatStat()'d total, untouched.",
});
registerBehavior("betweenWorldsSave", (ctx) => {
  ctx.holder.combat.player.betweenWorldsUsed = true;
  ctx.holder.health = 1;
  return { stop: true, msg: `Between Worlds — the Ferryman's veil catches you at the threshold. 1 Health, nothing more.` };
});
registerModifier("effect:between_worlds", {
  source: { kind: "effect", id: "between_worlds" },
  hook: "cheatDeath", order: 30, bucket: null, value: null, behavior: "betweenWorldsSave", params: null,
  when: (ctx) => !ctx.holder.combat.player.betweenWorldsUsed, holders: ["player"], state: null,
  notes: "Between Worlds (Divine Regalia -- Veil of the Ferryman): the same 1-Health cheat-death shape as Last Stand, deliberately without its +5 Attack -- a plain reprieve. Third branch of the same chain.",
});
registerBehavior("avatarOfFateSave", (ctx) => {
  ctx.holder.combat.player.avatarOfFateSaveUsed = true;
  ctx.holder.health = 1;
  return { stop: true, msg: `Avatar of Fate — fate itself refuses to let you fall. 1 Health.` };
});
registerModifier("set:Regalia of the Woven Thread:6:avatar_of_fate_save", {
  source: { kind: "set", id: "Regalia of the Woven Thread:6", setName: "Regalia of the Woven Thread", tier: 6 },
  hook: "cheatDeath", order: 40, bucket: null, value: null, behavior: "avatarOfFateSave", params: null,
  when: (ctx) => ctx.holder.combat.player.avatarOfFateTurns > 0 && !ctx.holder.combat.player.avatarOfFateSaveUsed, holders: ["player"], state: null,
  notes: "Avatar of Fate's 1-HP save half: only available while its own 4-round window is active (avatarOfFateTurns, granted by set:Regalia of the Woven Thread:6:avatar_of_fate_trigger's own onLowHealth entry), on top of (not instead of) the three once-per-fight saves above -- last branch of the chain. Keyed distinctly from both set:Regalia of the Woven Thread:6 (the crit-damage M1 placeholder) and :avatar_of_fate_trigger (the window-grant entry) -- same set tier, three unrelated dispatch points.",
});
// Avatar of Devotion's own FOLLOW-UP: not a branch of the chain itself
// (it never sets health to 1 on its own) -- a reaction to WHICHEVER
// save above just fired, dispatched separately, after firstStop, only
// when one actually did. Checked once regardless of which branch fired.
registerBehavior("avatarOfDevotionFollowup", (ctx) => {
  const player = ctx.holder.combat.player;
  player.avatarOfDevotionSaveUsed = true;
  const { healed, lines } = applyHeal(ctx.holder, Math.ceil(ctx.holder.maxHealth * 0.2));
  if (healed <= 0) return undefined;
  return `Avatar of Devotion answers in turn — mended for ${healed} health.${lines.length ? " " + lines.join(" ") : ""}`;
});
registerModifier("set:Regalia of the Eternal Heart:6:avatar_of_devotion_followup", {
  source: { kind: "set", id: "Regalia of the Eternal Heart:6", setName: "Regalia of the Eternal Heart", tier: 6 },
  hook: "cheatDeath", order: 999, bucket: null, value: null, behavior: "avatarOfDevotionFollowup", params: null,
  when: (ctx) => ctx.holder.combat.player.avatarOfDevotionTurns > 0 && !ctx.holder.combat.player.avatarOfDevotionSaveUsed, holders: ["player"], state: null,
  notes: "Avatar of Devotion's follow-up heal half: 'if reduced to 1 Health during the effect, immediately restore 20% max Health (once)' -- a follow-up to whichever cheatDeath save fired above, not a save of its own. Dispatched by key, separately, only when checkDeathPrevention's own firstStop call actually returned a hit. Keyed distinctly from set:Regalia of the Eternal Heart:6 (the calculateDamage.incoming doubler) and :avatar_of_devotion_trigger (the window-grant entry) -- same set tier, three unrelated dispatch points.",
});

// ---- Riposte: 4 structurally-identical real call sites (player
// wearer uncapped counters the enemy; enemy/ally wearer, each capped
// via nonPlayerRiposteCapAllows/markNonPlayerRiposteFired, counters
// whoever just missed them) -- all four are already clean, isolated,
// single-hasEffect-check functions (combat.js: maybeRiposte,
// riposteCounterOnPlayer, riposteCounterByEnemyOnAlly,
// riposteCounterByAllyOnEnemy), with the real counter-strike execution
// (resolveRiposteCounterPlayer/OnPlayer/ByEnemyOnAlly/ByAllyOnEnemy,
// pipeline.js) staying completely untouched -- a multi-step action
// resolution, not a grant/heal/stat shape any behavior would fit.
// Presence-only (hasModifier) at all four, same "call site's own logic
// IS the complete behavior" shape as Feinting Edge (2e-3). holders
// widened to enemy/ally to match code that already exists today (a
// catalogue correction, not R1/R2) -- the catalogue's own cited lines
// (combat.js:5006/5052/5109) were simply stale/wrong.
registerModifier("effect:riposte", {
  source: { kind: "effect", id: "riposte" },
  hook: "applyAndReact.onZeroDamage", order: 1, bucket: null, value: true, behavior: null,
  when: null, holders: ["player", "enemy", "ally"], state: null,
  notes: "Riposte: a free counter-strike when the wearer's own attacker misses them. Player (maybeRiposte) is uncapped; enemy/ally (riposteCounterOnPlayer/riposteCounterByEnemyOnAlly/riposteCounterByAllyOnEnemy) are capped via nonPlayerRiposteCapAllows (once/round, twice/combat) -- that cap logic is untouched, same as the resolve*/pipeline.js execution. hook name corrected from the catalogue's stale 'rollToHit.defender' guess -- the real signal is the same zero-damage-retaliation moment Every Choice Matters/Open Road already use (though dispatched by key here, not fan-out, since each of the 4 real call sites has its own cap/target wiring the shared hook name doesn't drive).",
});

// ================= 2f (25 Nov): enemy passives, batch 1 =================
// flatDamageReduction (11 ids) and regenPerTurn (5 ids) -- the simplest/
// safest trigger shapes per the recon's own sequencing. Both read off
// `creature.passives` (the equipment/ability-list holder, confirmed
// directly: hasRealEffect-equivalent for passives is
// sourceActiveOn's "passive" case, Array.isArray(holder.passives) &&
// holder.passives.includes(id)) but their REAL per-fight state
// (e.hp/e.maxHp for regenPerTurn) lives on the per-fight enemy SLOT
// record, a DIFFERENT object from creatureObj -- the identical split
// 2e-3 found for tactical_memory. Every entry here is dispatched BY
// KEY, never fan-out: calculateDamage.incoming/calculateEnemyIncomingMultiplier
// is ALREADY called from 4 other real sites (combat.js:1991,
// pipeline.js:1651, actions.js:338/371/398) for the unrelated sangMit
// (Sanguivorum) chain -- registering flatDamageReduction on that hook
// with generic fan-out would leak Thick Hide-style reduction into all
// four of those sites too, a real behavioral widening, not a
// relocation. By-key dispatch (same precedent as 2e-3's cooldown
// cluster) avoids this entirely: each "passive:<id>" key only ever
// fires when explicitly dispatched by that exact key, never through
// hook-driven fan-out.
registerBehavior("flatDamageReductionRatio", (ctx, entry) => entry.params.ratio);
registerModifier("passive:thick_hide", {
  source: { kind: "passive", id: "thick_hide" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.9 }, when: null, holders: ["enemy"], state: null,
  notes: "Thick Hide: -10% incoming damage. Dispatched by key from applyEnemyFlatDamageReduction's own loop (combat.js) -- see this batch's own header comment for why not hook fan-out.",
});
registerModifier("passive:thick_hide_2", {
  source: { kind: "passive", id: "thick_hide_2" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.8 }, when: null, holders: ["enemy"], state: null,
  notes: "Thick Hide II: -20% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:wing_guard", {
  source: { kind: "passive", id: "wing_guard" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.8 }, when: null, holders: ["enemy"], state: null,
  notes: "Wing Guard: -20% incoming damage. Its own `rangedOnly: true` field (enemyabilities.js) is declared but never read anywhere in the engine -- confirmed directly (no other reference exists) -- so this applies unconditionally today, same as every other flatDamageReduction entry; not implementing a ranged-only gate that doesn't exist yet. See passive:thick_hide's own note.",
});
registerModifier("passive:thick_scales", {
  source: { kind: "passive", id: "thick_scales" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.85 }, when: null, holders: ["enemy"], state: null,
  notes: "Thick Scales: -15% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:hardened_carapace", {
  source: { kind: "passive", id: "hardened_carapace" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.85 }, when: null, holders: ["enemy"], state: null,
  notes: "Hardened Carapace: -15% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:hardened_exoskeleton", {
  source: { kind: "passive", id: "hardened_exoskeleton" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.8 }, when: null, holders: ["enemy"], state: null,
  notes: "Hardened Exoskeleton: -20% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:elder_carapace", {
  source: { kind: "passive", id: "elder_carapace" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.8 }, when: null, holders: ["enemy"], state: null,
  notes: "Elder Carapace: -20% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:crystal_hide", {
  source: { kind: "passive", id: "crystal_hide" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.85 }, when: null, holders: ["enemy"], state: null,
  notes: "Crystal Hide: -15% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:ancient_preservation", {
  source: { kind: "passive", id: "ancient_preservation" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.9 }, when: null, holders: ["enemy"], state: null,
  notes: "Ancient Preservation: -10% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:reinforced_frame", {
  source: { kind: "passive", id: "reinforced_frame" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.85 }, when: null, holders: ["enemy"], state: null,
  notes: "Reinforced Frame: -15% incoming damage. See passive:thick_hide's own note.",
});
registerModifier("passive:earthen_form", {
  source: { kind: "passive", id: "earthen_form" },
  hook: "calculateDamage.enemyFlatReduction", order: 1, bucket: "incomingMitigation", value: null, behavior: "flatDamageReductionRatio",
  params: { ratio: 0.9 }, when: null, holders: ["enemy"], state: null,
  notes: "Earthen Form: -10% incoming damage. See passive:thick_hide's own note.",
});

// regenPerTurn (5 ids): a flat %-max-HP heal every round while
// 0 &lt; hp &lt; maxHp, dispatched by key from tickEnemyPassives' own
// per-passive-id loop (combat.js) -- NOT the generic turn.start fan-out
// used for player-side heals (healOnEvent assumes player-shaped
// maxHealth/health fields; the enemy slot's own hp/maxHp fields are a
// different shape, so this gets its own small behavior rather than
// risk a field-naming mismatch). State lives on the per-fight enemy
// slot (ctx.enemySlot), passed explicitly since the presence check's
// own holder (creature, for sourceActiveOn's "passive" case) is a
// different object. applyHealing/makeEnemyCombatant stay the exact
// unchanged pathway already used for every other enemy heal.
registerBehavior("enemyRegenPerTurnHeal", (ctx, entry) => {
  const e = ctx.enemySlot;
  if (!(e.hp > 0 && e.hp < e.maxHp)) return undefined;
  const heal = Math.max(1, Math.round(e.maxHp * entry.params.pct));
  const healed = applyHealing(makeEnemyCombatant(ctx.state, e, ctx.state.combat.enemies.indexOf(e)), heal, "enemy_regen", { state: ctx.state });
  if (healed <= 0) return undefined;
  return `${withThe(ctx.creature.name, true)} recovers ${healed} health.`;
});
registerModifier("passive:ancient_resilience", {
  source: { kind: "passive", id: "ancient_resilience" },
  hook: "turn.start", order: 2, bucket: null, value: null, behavior: "enemyRegenPerTurnHeal",
  params: { pct: 0.03 }, when: null, holders: ["enemy"], state: null,
  notes: "Ancient Resilience: regenerates 3% max Health per round while alive and not at full Health. Dispatched by key from tickEnemyPassives's own loop (combat.js) -- see this batch's own header comment.",
});
registerModifier("passive:rootbound", {
  source: { kind: "passive", id: "rootbound" },
  hook: "turn.start", order: 2, bucket: null, value: null, behavior: "enemyRegenPerTurnHeal",
  params: { pct: 0.03 }, when: null, holders: ["enemy"], state: null,
  notes: "Rootbound: regenerates 3% max Health per round. See passive:ancient_resilience's own note.",
});
registerModifier("passive:black_ichor", {
  source: { kind: "passive", id: "black_ichor" },
  hook: "turn.start", order: 2, bucket: null, value: null, behavior: "enemyRegenPerTurnHeal",
  params: { pct: 0.05 }, when: null, holders: ["enemy"], state: null,
  notes: "Black Ichor: regenerates 5% max Health per round. See passive:ancient_resilience's own note.",
});
registerModifier("passive:living_heart", {
  source: { kind: "passive", id: "living_heart" },
  hook: "turn.start", order: 2, bucket: null, value: null, behavior: "enemyRegenPerTurnHeal",
  params: { pct: 0.04 }, when: null, holders: ["enemy"], state: null,
  notes: "Living Heart: regenerates 4% max Health per round. See passive:ancient_resilience's own note.",
});
registerModifier("passive:living_timber", {
  source: { kind: "passive", id: "living_timber" },
  hook: "turn.start", order: 2, bucket: null, value: null, behavior: "enemyRegenPerTurnHeal",
  params: { pct: 0.03 }, when: null, holders: ["enemy"], state: null,
  notes: "Living Timber: regenerates 3% max Health per round. See passive:ancient_resilience's own note.",
});

// ================= 2f (26 Nov): enemy passives, batch 2 =================
// healthBelowPct (18 ids), healthStagedBuff (1: Unyielding),
// everyPctHealthLostStacking (7 ids): all three dispatched by key from
// tickEnemyPassives' own per-passive-id loop (combat.js), same hook
// ("turn.start") and same shape regenPerTurn's own batch-1 entries
// already used there -- the threshold/stage/stack-count GATE (whether
// this id fires at all, and how many times) stays in that loop exactly
// as before; only the "what happens when it fires" (apply the self-buff)
// moves into a dispatched behavior. survivedBelowPct (3 ids) is
// dispatched by key from a DIFFERENT function, checkEnemyLowHealthTriggers
// (combat.js) -- its own dedicated hook, applyAndReact.onSurvivedBelowPct
// (added just above), since it fires immediately after a hit lands, not
// on tickEnemyPassives' round cadence. Every id's threshold/pct/stages/
// selfBuff/packAuraBuff value below is read directly from its own
// enemyabilities.js entry, not from a recon summary -- Shed Skin's own
// `cleanseSelf: true` field is deliberately NOT implemented here: grepped
// combat.js directly and confirmed it is read nowhere, exactly like
// Ancient Instinct's own cleanseOne/shield-on-trigger fields the data
// file's own comment already documents as dropped ("no engine hook").
registerBehavior("healthBelowPctSelfBuff", (ctx, entry) => {
  const selfBuff = entry.params.selfBuff;
  if (selfBuff && selfBuff.turns) applyEnemySelfModifier(ctx.combat, ctx.creature, selfBuff);
  else applyPermanentSelfBuff(ctx.creature, selfBuff);
});
registerModifier("passive:cornered", {
  source: { kind: "passive", id: "cornered" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Cornered: once per combat, at/below 50% Health, permanently +20% Attack for the fight. Gate (threshold/oncePerCombat) and the generic \"is hurt, and hits back harder for it\" line both stay in tickEnemyPassives (combat.js) -- dispatched by key for the self-buff application only.",
});
registerModifier("passive:apex_predator", {
  source: { kind: "passive", id: "apex_predator" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.15, acc: 10, agi: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Apex Predator: once per combat, at/below 50% Health, +15% Attack/+10 Accuracy/+10 Agility for the fight. See passive:cornered's own note.",
});
registerModifier("passive:ancient_apex", {
  source: { kind: "passive", id: "ancient_apex" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.2, def: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Ancient Apex: once per combat, at/below 50% Health, +20% Attack/+10 Defense for the fight. See passive:cornered's own note.",
});
registerModifier("passive:shed_skin", {
  source: { kind: "passive", id: "shed_skin" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { agi: 10, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Shed Skin: once per combat, at/below 30% Health, +10 Agility for 2 turns (via applyEnemySelfModifier, since its own selfBuff carries `turns`). Its own `cleanseSelf: true` field is confirmed dead code (grepped combat.js: read nowhere) -- not implemented, same as the original inline code never implemented it. See passive:cornered's own note.",
});
registerModifier("passive:ancient_majesty", {
  source: { kind: "passive", id: "ancient_majesty" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { spd: 10, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Ancient Majesty: once per combat, at/below 25% Health, +10 Speed for 2 turns. See passive:cornered's own note.",
});
registerModifier("passive:territorial_apex", {
  source: { kind: "passive", id: "territorial_apex" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atk: 10, acc: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Territorial Apex: once per combat, at/below 50% Health, +10 Attack/+10 Accuracy for the fight. See passive:cornered's own note.",
});
registerModifier("passive:rage_unbound", {
  source: { kind: "passive", id: "rage_unbound" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atk: 20, spd: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Rage Unbound: once per combat, at/below 50% Health, +20 Attack/+10 Speed for the fight. See passive:cornered's own note.",
});
registerModifier("passive:endless_mourning", {
  source: { kind: "passive", id: "endless_mourning" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { acc: 15, agi: 15 } }, when: null, holders: ["enemy"], state: null,
  notes: "Endless Mourning: once per combat, at/below 50% Health, +15 Accuracy/+15 Agility for the fight. See passive:cornered's own note.",
});
registerModifier("passive:runic_core", {
  source: { kind: "passive", id: "runic_core" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.15, acc: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Runic Core: once per combat, at/below 50% Health, +15% Attack/+10 Accuracy for the fight. See passive:cornered's own note.",
});
registerModifier("passive:perfect_construction", {
  source: { kind: "passive", id: "perfect_construction" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atk: 10, def: 10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Perfect Construction: once per combat, at/below 50% Health, +10 Attack/+10 Defense for the fight. See passive:cornered's own note.",
});
registerModifier("passive:arena_ferocity", {
  source: { kind: "passive", id: "arena_ferocity" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.1, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Arena Ferocity (IA-17): once per combat, at/below 50% Health, +10% Attack for 2 turns. See passive:shed_skin's own note on the `turns`-carrying selfBuff routing through applyEnemySelfModifier.",
});
registerModifier("passive:veterans_guard", {
  source: { kind: "passive", id: "veterans_guard" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { def: 8, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Veteran's Guard (IA-25): once per combat, at/below 50% Health, +8 Defense for 2 turns. See passive:shed_skin's own note.",
});
registerModifier("passive:battle_hardened", {
  source: { kind: "passive", id: "battle_hardened" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { def: 8, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Battle-Hardened: once per combat, at/below 50% Health, +8 Defense for 2 turns. See passive:shed_skin's own note.",
});
registerModifier("passive:commanders_resolve", {
  source: { kind: "passive", id: "commanders_resolve" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Commander's Resolve: once per combat, at/below 40% Health, +10% Attack for the fight. See passive:cornered's own note.",
});
registerModifier("passive:sang_sec_veteran_enforcement", {
  source: { kind: "passive", id: "sang_sec_veteran_enforcement" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { def: 8, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Veteran Enforcement (Sanguivorum Security): once per combat, at/below 50% Health, +8 Defense for 2 turns. See passive:shed_skin's own note.",
});
registerModifier("passive:sang_iag_battle_tested", {
  source: { kind: "passive", id: "sang_iag_battle_tested" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { def: 8, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Battle-Tested (Sanguivorum IAG): once per combat, at/below 50% Health, +8 Defense for 2 turns. See passive:shed_skin's own note.",
});
registerModifier("passive:sang_iag_arena_resolve", {
  source: { kind: "passive", id: "sang_iag_arena_resolve" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Arena Resolve (Sanguivorum IAG): once per combat, at/below 40% Health, +10% Attack for the fight. See passive:cornered's own note.",
});
registerModifier("passive:sang_iag_warleaders_resolve", {
  source: { kind: "passive", id: "sang_iag_warleaders_resolve" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "healthBelowPctSelfBuff",
  params: { selfBuff: { atkPct: 0.10 } }, when: null, holders: ["enemy"], state: null,
  notes: "Warleader's Resolve (Sanguivorum IAG): once per combat, at/below 40% Health, +10% Attack for the fight. See passive:cornered's own note.",
});

// healthStagedBuff -- a single id (Unyielding); `stagesToApply` (how many
// NEW stages were just crossed this tick) is computed by the surrounding
// gate in tickEnemyPassives and passed in ctx, same division of labor as
// every entry above.
registerBehavior("unyieldingStagedBuff", (ctx, entry) => {
  for (let n = 0; n < ctx.stagesToApply; n++) applyPermanentSelfBuff(ctx.creature, entry.params.selfBuff);
});
registerModifier("passive:unyielding", {
  source: { kind: "passive", id: "unyielding" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "unyieldingStagedBuff",
  params: { selfBuff: { def: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Unyielding: permanently +5 Defense for each of 3 Health stages (75%/50%/25%) crossed, applied once per stage. Stage-crossing count (stagesToApply) and the generic \"grows steadier under punishment\" line both stay in tickEnemyPassives (combat.js).",
});

// everyPctHealthLostStacking (7 ids): `stacksToApply` (how many NEW
// stacks were just crossed this tick) is computed by the surrounding
// gate in tickEnemyPassives and passed in ctx -- e.healthLostStacks is a
// single counter on the per-fight enemy SLOT (not keyed by passive id),
// unchanged from the original inline code.
registerBehavior("everyPctHealthLostStackingApply", (ctx, entry) => {
  for (let n = 0; n < ctx.stacksToApply; n++) applyPermanentSelfBuff(ctx.creature, entry.params.selfBuff);
});
registerModifier("passive:kings_fury", {
  source: { kind: "passive", id: "kings_fury" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { atk: 5, acc: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "King's Fury: permanently +5 Attack/+2 Accuracy for every 20% of max Health lost, stacking. Stack-count gate and the generic \"grows more dangerous as the fight wears on\" line both stay in tickEnemyPassives (combat.js).",
});
registerModifier("passive:sky_sovereign", {
  source: { kind: "passive", id: "sky_sovereign" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { acc: 5, agi: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Sky Sovereign: permanently +5 Accuracy/+5 Agility for every 25% of max Health lost, stacking. See passive:kings_fury's own note.",
});
registerModifier("passive:ancient_predator", {
  source: { kind: "passive", id: "ancient_predator" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { atk: 5, acc: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Ancient Predator: permanently +5 Attack/+5 Accuracy for every 25% of max Health lost, stacking. See passive:kings_fury's own note.",
});
registerModifier("passive:royal_instinct", {
  source: { kind: "passive", id: "royal_instinct" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { atk: 5, def: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Royal Instinct: permanently +5 Attack/+5 Defense for every 25% of max Health lost, stacking. See passive:kings_fury's own note.",
});
registerModifier("passive:dominance", {
  source: { kind: "passive", id: "dominance" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { atk: 3, acc: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Dominance: permanently +3 Attack/+2 Accuracy for every 20% of max Health lost, stacking. See passive:kings_fury's own note. (Ancient Instinct's own watchFor:\"dominance\" reaction to this id gaining a stack has no engine hook of its own -- enemyabilities.js's own comment already documents it as unwired; untouched here.)",
});
registerModifier("passive:adaptive_carapace", {
  source: { kind: "passive", id: "adaptive_carapace" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { spd: 5, acc: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Adaptive Carapace: permanently +5 Speed/+5 Accuracy for every 25% of max Health lost, stacking. See passive:kings_fury's own note.",
});
registerModifier("passive:primal_core", {
  source: { kind: "passive", id: "primal_core" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "everyPctHealthLostStackingApply",
  params: { selfBuff: { atk: 5, def: 5 } }, when: null, holders: ["enemy"], state: null,
  notes: "Primal Core: permanently +5 Attack/+5 Defense for every 25% of max Health lost, stacking. See passive:kings_fury's own note.",
});

// survivedBelowPct (3 ids): dispatched from checkEnemyLowHealthTriggers
// (combat.js), NOT tickEnemyPassives -- fires immediately after a hit
// against this creature lands and it survives. oncePerCombat/pct gate
// and the generic "grits through the pain -- <name> takes hold" line
// (which reads p.name directly, not from the registry) both stay there;
// only the self-buff/pack-aura-buff application moves here.
registerBehavior("survivedBelowPctBuff", (ctx, entry) => {
  if (entry.params.selfBuff) applyEnemySelfModifier(ctx.combat, ctx.creature, entry.params.selfBuff);
  if (entry.params.packAuraBuff) applyPackAuraBuff(ctx.combat, ctx.creature, entry.params.packAuraBuff);
});
registerModifier("passive:veteran_discipline", {
  source: { kind: "passive", id: "veteran_discipline" },
  hook: "applyAndReact.onSurvivedBelowPct", order: 1, bucket: null, value: null, behavior: "survivedBelowPctBuff",
  params: { selfBuff: { def: 5, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Veteran Discipline (H07): once per combat, survives a hit at/below 50% Health, +5 Defense for 2 turns.",
});
registerModifier("passive:last_stand", {
  source: { kind: "passive", id: "last_stand" },
  hook: "applyAndReact.onSurvivedBelowPct", order: 1, bucket: null, value: null, behavior: "survivedBelowPctBuff",
  params: { selfBuff: { dmgReduction: 0.15, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Last Stand (H20, enemy passive): once per combat, survives a hit at/below 25% Health, +15% damage reduction for 2 turns. Registry key is \"passive:last_stand\" -- a different namespace from the player's own \"effect:last_stand\" (2e-5), no collision.",
});
registerModifier("passive:resolute_command", {
  source: { kind: "passive", id: "resolute_command" },
  hook: "applyAndReact.onSurvivedBelowPct", order: 1, bucket: null, value: null, behavior: "survivedBelowPctBuff",
  params: { packAuraBuff: { acc: 5, turns: 2, maxTargets: 3 } }, when: null, holders: ["enemy"], state: null,
  notes: "Resolute Command (H15): once per combat, survives a hit at/below 50% Health, grants nearby same-group allies (up to 3) +5 Accuracy for 2 turns via applyPackAuraBuff. No selfBuff of its own -- packAuraBuff only, matching the original code's independent if-checks.",
});

// ================= 2f (26 Nov): enemy passives, batch 3 =================
// combatStartDebuff (3), combatStartSelfBuff (3), combatStartSummon (1):
// all three dispatched by key from startCombat's own per-enemy loop
// (combat.js) -- fires exactly once, the instant combat begins, for
// EVERY enemy present (not just the active one), rather than through
// tickEnemyPassives' per-round dispatch. Reused the existing "fight.start"
// hook purely for documentation -- it's never fanned out for holderRole
// "enemy" (runReactionHook("fight.start", ...) has exactly one call site,
// combat.js, always with holder=state/holderRole="player"; modifiersForHook
// filters by holders before an entry is ever reached), so there is no
// shared-combinator risk the way calculateDamage.incoming had in batch 1.
// periodicSummon (1, Corrupted Grove) is dispatched from tickEnemyPassives
// instead (hook: turn.start, same as batch 1/2's other tickEnemyPassives
// entries) -- its own timing gate (every Nth round) stays in that loop;
// the maxActive-vs-heal branching moves into the behavior below since
// nothing else shares it.
registerBehavior("combatStartDebuffApply", (ctx, entry) => applyPlayerStatus(ctx.state, ctx.statusId, { debuff: entry.params.debuff, turns: entry.params.turns }, ctx.creature.name));
registerModifier("passive:draconic_presence", {
  source: { kind: "passive", id: "draconic_presence" },
  hook: "fight.start", order: 1, bucket: null, value: null, behavior: "combatStartDebuffApply",
  params: { debuff: { acc: -5, spd: -5 }, turns: 3 }, when: null, holders: ["enemy"], state: null,
  notes: "Draconic Presence: at combat start, debuffs the player -5 Accuracy/-5 Speed for 3 turns. Dispatched once per enemy present from startCombat's own loop (combat.js), not tickEnemyPassives.",
});
registerModifier("passive:predators_presence", {
  source: { kind: "passive", id: "predators_presence" },
  hook: "fight.start", order: 1, bucket: null, value: null, behavior: "combatStartDebuffApply",
  params: { debuff: { atkPct: -0.1, acc: -8, spd: -5 }, turns: 2 }, when: null, holders: ["enemy"], state: null,
  notes: "Predator's Presence: at combat start, debuffs the player -10% Attack/-8 Accuracy/-5 Speed for 2 turns. See passive:draconic_presence's own note.",
});
registerModifier("passive:haunting_presence", {
  source: { kind: "passive", id: "haunting_presence" },
  hook: "fight.start", order: 1, bucket: null, value: null, behavior: "combatStartDebuffApply",
  params: { debuff: { acc: -5 }, turns: 3 }, when: null, holders: ["enemy"], state: null,
  notes: "Haunting Presence: at combat start, debuffs the player -5 Accuracy for 3 turns. See passive:draconic_presence's own note.",
});

registerBehavior("combatStartSelfBuffApply", (ctx, entry) => { applyEnemySelfModifier(ctx.combat, ctx.creature, entry.params.selfBuff); });
registerModifier("passive:smugglers_caution", {
  source: { kind: "passive", id: "smugglers_caution" },
  hook: "fight.start", order: 2, bucket: null, value: null, behavior: "combatStartSelfBuffApply",
  params: { selfBuff: { def: 5, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Smuggler's Caution (IA-13): at combat start, +5 Defense for 2 turns, silently (no printed line, matching the original code's bare applyEnemySelfModifier call with no lines.push). Dispatched once per enemy present from startCombat's own loop.",
});
registerModifier("passive:rapid_reconnaissance", {
  source: { kind: "passive", id: "rapid_reconnaissance" },
  hook: "fight.start", order: 2, bucket: null, value: null, behavior: "combatStartSelfBuffApply",
  params: { selfBuff: { spd: 8, turns: 1 } }, when: null, holders: ["enemy"], state: null,
  notes: "Rapid Reconnaissance: at combat start, +8 Speed for 1 turn, silently. See passive:smugglers_caution's own note.",
});
registerModifier("passive:sang_iag_watchful_approach", {
  source: { kind: "passive", id: "sang_iag_watchful_approach" },
  hook: "fight.start", order: 2, bucket: null, value: null, behavior: "combatStartSelfBuffApply",
  params: { selfBuff: { spd: 8, turns: 1 } }, when: null, holders: ["enemy"], state: null,
  notes: "Watchful Approach (Sanguivorum IAG): at combat start, +8 Speed for 1 turn, silently. See passive:smugglers_caution's own note.",
});

registerBehavior("preparedWarhoundSummon", (ctx, entry) => resolveEnemySummon(ctx.state, ctx.creature.level, entry.params.summon, "prepared_warhound", ctx.creature.name, ctx.creature));
registerModifier("passive:prepared_warhound", {
  source: { kind: "passive", id: "prepared_warhound" },
  hook: "fight.start", order: 3, bucket: null, value: null, behavior: "preparedWarhoundSummon",
  params: { summon: { pool: ["legion_hound"], count: 1, capKey: "deploy_legion_hounds", maxActive: 3, maxLifetime: 5, noArrivalAttack: true, groupOverride: "sang_mil_legion_hounds" } },
  when: null, holders: ["enemy"], state: null,
  notes: "Prepared Warhound (Legion Houndmaster): starts combat with 1 Legion Hound already active, sharing Deploy Legion Hounds' own capKey/maxActive/maxLifetime pool. Dispatched once per enemy present from startCombat's own loop, via the same resolveEnemySummon path tickEnemyPassives' periodicSummon entries use.",
});

registerBehavior("corruptedGroveTick", (ctx, entry) => {
  const e = ctx.enemySlot, creature = ctx.creature;
  const capKey = entry.params.capKey;
  const alreadyActive = ctx.state.combat.enemies.filter((x) => x.alive && x.summonSourceKey === capKey).length;
  if (entry.params.maxActive != null && alreadyActive >= entry.params.maxActive) {
    if (!entry.params.healPctIfMaxed) return undefined;
    const heal = Math.max(1, Math.round(e.maxHp * entry.params.healPctIfMaxed));
    const healed = applyHealing(makeEnemyCombatant(ctx.state, e, ctx.state.combat.enemies.indexOf(e)), heal, "enemy_regen", { state: ctx.state });
    if (healed <= 0) return undefined;
    return `${withThe(creature.name, true)} recovers ${healed} health, its grove already at full strength.`;
  }
  return resolveEnemySummon(ctx.state, creature.level, entry.params, "corrupted_grove", creature.name, creature);
});
registerModifier("passive:corrupted_grove", {
  source: { kind: "passive", id: "corrupted_grove" },
  hook: "turn.start", order: 3, bucket: null, value: null, behavior: "corruptedGroveTick",
  params: { pool: ["zombie", "skeleton"], count: 1, maxActive: 4, healPctIfMaxed: 0.05, capKey: "dreadroot_undead" },
  when: null, holders: ["enemy"], state: null,
  notes: "Corrupted Grove: every 3rd round, summons 1 zombie/skeleton against the shared dreadroot_undead cap (capped at 4 active, shared with Dreadroot's own Grave Bloom active), or heals 5% max HP if already at the cap. The every-3rd-round timing gate stays in tickEnemyPassives (combat.js); the maxActive-vs-heal branching moves here since nothing else shares it.",
});

// 2f batch 4 (26 Nov): firstAttack (13), onHitTaken (5), counterOnHit (1),
// counterOnSuccessfulHit (2), bonusVsHealthBelowPctAlways (1), onKill (2
// enemy-side) = 24 ids. Every outer GATE (firstActiveUsed consumption,
// dmgDealt<=0 guard, counterGuardUsedThisRound, cooldown/uses caps, the
// Health-threshold check, oncePerCombat/onKillUsed) stays exactly where
// it already lived (combat.js/pipeline.js) -- only the "what happens"
// moves here, same discipline as every earlier 2f batch.
//
// firstAttack: dead fields confirmed by direct grep (critChanceBonus,
// opponentAccPenalty -- zero reads anywhere outside enemyabilities.js
// itself) and deliberately NOT implemented; only dmgMultBonus/accBonus,
// exactly what firstAttackPassiveBonus (combat.js) has ever read.
registerBehavior("firstAttackBonusValue", (ctx, entry) => entry.params);
registerModifier("passive:ambush_bonus", {
  source: { kind: "passive", id: "ambush_bonus" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: {}, when: null, holders: ["enemy"], state: null,
  notes: "Ambush: its only real field is critChanceBonus, a dead field (confirmed, zero reads anywhere outside enemyabilities.js) -- no dmgMultBonus/accBonus, so this contributes nothing today. Registered anyway for catalogue completeness/parity with its siblings.",
});
registerModifier("passive:forest_camouflage", {
  source: { kind: "passive", id: "forest_camouflage" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: {}, when: null, holders: ["enemy"], state: null,
  notes: "Forest Camouflage: its only real field is opponentAccPenalty, a dead field (confirmed, zero reads anywhere outside enemyabilities.js) -- no dmgMultBonus/accBonus, so this contributes nothing today. See passive:ambush_bonus's own note.",
});
registerModifier("passive:patient_hunter", {
  source: { kind: "passive", id: "patient_hunter" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.2, accBonus: 10 }, when: null, holders: ["enemy"], state: null,
  notes: "Patient Hunter: first attack this fight, +20% damage, +10 Accuracy.",
});
registerModifier("passive:silent_hunter", {
  source: { kind: "passive", id: "silent_hunter" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { accBonus: 15 }, when: null, holders: ["enemy"], state: null,
  notes: "Silent Hunter: first attack this fight, +15 Accuracy. Its own critChanceBonus is a dead field -- see passive:ambush_bonus's own note.",
});
registerModifier("passive:ambush_predator", {
  source: { kind: "passive", id: "ambush_predator" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.2 }, when: null, holders: ["enemy"], state: null,
  notes: "Ambush Predator: first attack this fight, +20% damage.",
});
registerModifier("passive:desert_predator", {
  source: { kind: "passive", id: "desert_predator" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.1 }, when: null, holders: ["enemy"], state: null,
  notes: "Desert Predator: first attack this fight, +10% damage.",
});
registerModifier("passive:burrow_ambush", {
  source: { kind: "passive", id: "burrow_ambush" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.2 }, when: null, holders: ["enemy"], state: null,
  notes: "Burrow Ambush: first attack this fight, +20% damage.",
});
registerModifier("passive:canopy_hunter", {
  source: { kind: "passive", id: "canopy_hunter" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.15 }, when: null, holders: ["enemy"], state: null,
  notes: "Canopy Hunter: first attack this fight, +15% damage. Its own critChanceBonus is a dead field -- see passive:ambush_bonus's own note.",
});
registerModifier("passive:prepared_opening", {
  source: { kind: "passive", id: "prepared_opening" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.20, accBonus: 10 }, when: null, holders: ["enemy"], state: null,
  notes: "Prepared Opening (H08): first attack this fight, +20% damage, +10 Accuracy.",
});
registerModifier("passive:range_calculation", {
  source: { kind: "passive", id: "range_calculation" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { accBonus: 10 }, when: null, holders: ["enemy"], state: null,
  notes: "Range Calculation: first attack this fight, +10 Accuracy, no damage bonus.",
});
registerModifier("passive:impact_discipline", {
  source: { kind: "passive", id: "impact_discipline" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { dmgMultBonus: 1.15 }, when: null, holders: ["enemy"], state: null,
  notes: "Impact Discipline: first attack this fight, +15% damage.",
});
registerModifier("passive:field_experience", {
  source: { kind: "passive", id: "field_experience" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { accBonus: 5 }, when: null, holders: ["enemy"], state: null,
  notes: "Field Experience: first attack this fight, +5 Accuracy, no damage bonus.",
});
registerModifier("passive:sang_iag_executioners_patience", {
  source: { kind: "passive", id: "sang_iag_executioners_patience" },
  hook: "calculateDamage.firstAttack", order: 1, bucket: "conditional", value: null, behavior: "firstAttackBonusValue",
  params: { accBonus: 10 }, when: null, holders: ["enemy"], state: null,
  notes: "Executioner's Patience (Sanguivorum IAG): first attack this fight, +10 Accuracy, no damage bonus.",
});

// onHitTaken: 3 independent effects per entry (reflectPctOfAtk,
// inflictStatusOnAttacker, counterChance+counterPctOfAtk), replicated
// exactly as applyEnemyOnHitTakenPassives's own former inline loop body
// -- a silent side-effecting behavior (no message lines), dispatched via
// runHookEntry (discarded return) from that same loop, now gated on
// `ability.trigger === "onHitTaken"` same as before, by key per id.
registerBehavior("onHitTakenApply", (ctx, entry) => {
  const { state, creature } = ctx;
  const p = entry.params;
  if (p.reflectPctOfAtk) {
    const reflect = Math.max(0, Math.round((creature.atk || 0) * p.reflectPctOfAtk));
    if (reflect > 0) {
      applyPlayerDamage(state, reflect);
      if (state.combat) state.combat.player.playerLastHitType = "physical";
    }
  }
  if (p.inflictStatusOnAttacker && state.combat) {
    const spec = getStatusEffect(p.inflictStatusOnAttacker);
    if (spec) applyPlayerStatus(state, p.inflictStatusOnAttacker, spec);
  }
  if (p.counterChance && p.counterPctOfAtk && Math.random() < p.counterChance) {
    const counter = Math.max(0, Math.round((creature.atk || 0) * p.counterPctOfAtk));
    if (counter > 0) {
      applyPlayerDamage(state, counter);
      if (state.combat) state.combat.player.playerLastHitType = "physical";
    }
  }
});
registerModifier("passive:barbed_hide", {
  source: { kind: "passive", id: "barbed_hide" },
  hook: "applyAndReact.onHitTakenPassive", order: 1, bucket: null, value: null, behavior: "onHitTakenApply",
  params: { reflectPctOfAtk: 0.1 }, when: null, holders: ["enemy"], state: null,
  notes: "Barbed Hide: reflects 10% of this creature's own Attack back at the player, silently, on every hit taken. Dispatched by key from applyEnemyOnHitTakenPassives's own loop (combat.js) -- a DEDICATED hook, not the pre-existing applyAndReact.onHitTaken (see this hook's own MOD_HOOKS comment for the real fan-out collision that forced this).",
});
registerModifier("passive:quills", {
  source: { kind: "passive", id: "quills" },
  hook: "applyAndReact.onHitTakenPassive", order: 1, bucket: null, value: null, behavior: "onHitTakenApply",
  params: { reflectPctOfAtk: 0.15 }, when: null, holders: ["enemy"], state: null,
  notes: "Quills: reflects 15% of this creature's own Attack back at the player, silently, on every hit taken. See passive:barbed_hide's own note.",
});
registerModifier("passive:powdered_wings", {
  source: { kind: "passive", id: "powdered_wings" },
  hook: "applyAndReact.onHitTakenPassive", order: 1, bucket: null, value: null, behavior: "onHitTakenApply",
  params: { inflictStatusOnAttacker: "drowsy" }, when: null, holders: ["enemy"], state: null,
  notes: "Powdered Wings: inflicts Drowsy on the player, silently, on every hit taken. See passive:barbed_hide's own note.",
});
registerModifier("passive:crystal_hide_reflect", {
  source: { kind: "passive", id: "crystal_hide_reflect" },
  hook: "applyAndReact.onHitTakenPassive", order: 1, bucket: null, value: null, behavior: "onHitTakenApply",
  params: { reflectPctOfAtk: 0.1 }, when: null, holders: ["enemy"], state: null,
  notes: "Crystal Hide (reflect variant): reflects 10% of this creature's own Attack back at the player, silently, on every hit taken. See passive:barbed_hide's own note.",
});
registerModifier("passive:residual_memory", {
  source: { kind: "passive", id: "residual_memory" },
  hook: "applyAndReact.onHitTakenPassive", order: 1, bucket: null, value: null, behavior: "onHitTakenApply",
  params: { counterChance: 0.25, counterPctOfAtk: 1.0 }, when: null, holders: ["enemy"], state: null,
  notes: "Residual Memory (Lesser Voran-Daun): 25% chance on every hit taken to counter for 100% of this creature's own Attack, silently. See passive:barbed_hide's own note.",
});

// counterOnHit (countering_guard, H06): checkCounteringGuard (combat.js)
// used to find the ABILITY directly (.map(getEnemyAbility).find(...)),
// losing the id; now finds the id first, dispatches by key for the
// static {name, dmgMult} data checkCounteringGuard's own
// resolveEnemyAttackOnPlayer call still consumes exactly as before.
registerModifier("passive:countering_guard", {
  source: { kind: "passive", id: "countering_guard" },
  hook: "applyAndReact.onHitTakenPassive", order: 2, bucket: null, value: { name: "Countering Guard", dmgMult: 0.4 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Countering Guard (H06): static {name, dmgMult} checkCounteringGuard (combat.js) reads by key and passes straight into its own unchanged resolveEnemyAttackOnPlayer call. Shares applyAndReact.onHitTakenPassive's hook name with the reflect/status cluster above (a different dispatch SITE, checkCounteringGuard, not applyEnemyOnHitTakenPassives) -- by-key only either way.",
});

// counterOnSuccessfulHit (Arena Riposte / Arena Counter): same
// id-losing-.find() shape as Countering Guard above, fixed the same
// way. hasArenaRiposteAbility (combat.js) stays untouched -- it's a
// pure presence check (any passive with this trigger), not a
// per-id data read, and has exactly one call site.
registerModifier("passive:sang_sec_arena_riposte", {
  source: { kind: "passive", id: "sang_sec_arena_riposte" },
  hook: "applyAndReact.onHitTakenPassive", order: 3, bucket: null, value: 0.8, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Riposte (Sanguivorum Security): static mult, read by key from arenaRiposteCounterOnPlayer (combat.js) in place of its own former passive.mult lookup. Shares applyAndReact.onHitTakenPassive's hook name -- same by-key-only safety as passive:countering_guard's own note just above.",
});
registerModifier("passive:sang_iag_arena_counter", {
  source: { kind: "passive", id: "sang_iag_arena_counter" },
  hook: "applyAndReact.onHitTakenPassive", order: 3, bucket: null, value: 0.7, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Counter (Sanguivorum IAG): static mult, read by key from arenaRiposteCounterOnPlayer (combat.js). See passive:sang_sec_arena_riposte's own note.",
});

// bonusVsHealthBelowPctAlways (Apex Instinct): the Health-threshold GATE
// (state.health <= state.maxHealth * p.pct) stays inline in
// resolveEnemyActiveAbility (combat.js); only the flat multiplier moves.
registerModifier("passive:apex_instinct", {
  source: { kind: "passive", id: "apex_instinct" },
  hook: "calculateDamage.bonusVsHealthBelowPctAlways", order: 1, bucket: "conditional", value: 1.15, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Apex Instinct (Rau-Thauln): while below 50% Health, this creature's own Active-ability damage is always x1.15, re-checked on every Active use (no once-per-combat flag). The 50% threshold gate stays in resolveEnemyActiveAbility (combat.js); only the x1.15 moves here.",
});

// onKill (enemy-side, Predator's/Roadlord's Momentum): the
// oncePerCombat+onKillUsed[pid] gate stays in pipeline.js's own
// killAlly branch; only the selfBuff grant moves.
registerBehavior("onKillSelfBuff", (ctx, entry) => applyEnemySelfModifier(ctx.combat, ctx.creature, entry.params.selfBuff));
registerModifier("passive:predators_momentum", {
  source: { kind: "passive", id: "predators_momentum" },
  hook: "applyAndReact.onKill", order: 1, bucket: null, value: null, behavior: "onKillSelfBuff",
  params: { selfBuff: { atkPct: 0.15, turns: 3 } }, when: null, holders: ["enemy"], state: null,
  notes: "Predator's Momentum: on killing an ally, +15% Attack for 3 turns, no once-per-combat cap. Dispatched by key from pipeline.js's own killAlly branch (the exact site the earlier onKill family -- task 38 -- already uses this same hook name from, holderRole 'enemy' there too; by-key dispatch, no fan-out collision).",
});
registerModifier("passive:roadlords_momentum", {
  source: { kind: "passive", id: "roadlords_momentum" },
  hook: "applyAndReact.onKill", order: 1, bucket: null, value: null, behavior: "onKillSelfBuff",
  params: { selfBuff: { atkPct: 0.15, turns: 2 } }, when: null, holders: ["enemy"], state: null,
  notes: "Roadlord's Momentum (IA-30): on killing an ally, +15% Attack for 2 turns, once per combat (gate stays in pipeline.js). See passive:predators_momentum's own note.",
});

// flatStatBonus (2f, 26 Nov): 10 ids, each a constant stat bonus applied
// ONCE at creature-build time (buildFightCreature, combat.js), the same
// place equipment bonuses are folded in -- never re-applied or double-
// counted, no trigger/cooldown/expiry of any kind. The outer `p.stat`
// read (which FIELD to add to) stays in combat.js, same routing-vs-value
// split as every other 2f entry; only the flat `amount` moves here.
// Reusing "fight.start" rather than any stat.<key> hook -- stat.<key>'s
// OWN fan-out (applyStatDefFloor, this file, runHook(statHook("def"), ...))
// is called with holderRole "enemy" for real (combatant.js:206, stat()'s
// own enemy "def" case) and does not filter by statBonus/statMultiplier
// until AFTER collecting results -- registering these as plain-number
// entries there would have been silently returned as an override of the
// enemy's ENTIRE effective Defense on every stat() read, not added to
// it. "fight.start" has exactly one fan-out call site (combat.js:5754,
// runReactionHook, hardcoded holderRole "player") -- same by-key safety
// already established for combatStartDebuff/combatStartSelfBuff/
// prepared_warhound (2f batch 3) on this same hook name.
registerModifier("passive:mil_veteran_discipline", {
  source: { kind: "passive", id: "mil_veteran_discipline" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Veteran Discipline (Ferratum Veteran, Sanguivorum Imperial Military): constant +5 Defense while alive, applied once at creature-build time.",
});
registerModifier("passive:sang_sec_veteran_watch_discipline", {
  source: { kind: "passive", id: "sang_sec_veteran_watch_discipline" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Veteran Watch Discipline (Sanguivorum Security): constant +5 Defense. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_sec_gatekeepers_discipline", {
  source: { kind: "passive", id: "sang_sec_gatekeepers_discipline" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Gatekeeper's Discipline (Sanguivorum Security): constant +5 Defense. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_sec_analytical_discipline", {
  source: { kind: "passive", id: "sang_sec_analytical_discipline" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Analytical Discipline (Sanguivorum Security): constant +5 Accuracy. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_sec_arena_veterans_discipline_acc", {
  source: { kind: "passive", id: "sang_sec_arena_veterans_discipline_acc" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Veteran's Discipline (Sanguivorum Security, Accuracy variant): constant +5 Accuracy. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_sec_arena_veterans_discipline_def", {
  source: { kind: "passive", id: "sang_sec_arena_veterans_discipline_def" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Veteran's Discipline (Sanguivorum Security, Defense variant): constant +5 Defense. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_iag_rough_fighter", {
  source: { kind: "passive", id: "sang_iag_rough_fighter" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Rough Fighter (Sanguivorum IAG): constant +5 Attack. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_iag_professional_guard", {
  source: { kind: "passive", id: "sang_iag_professional_guard" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Professional Guard (Sanguivorum IAG): constant +5 Defense. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_iag_arena_training", {
  source: { kind: "passive", id: "sang_iag_arena_training" },
  hook: "fight.start", order: 1, bucket: null, value: 5, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Training (Sanguivorum IAG): constant +5 Accuracy. See passive:mil_veteran_discipline's own note.",
});
registerModifier("passive:sang_iag_champions_discipline", {
  source: { kind: "passive", id: "sang_iag_champions_discipline" },
  hook: "fight.start", order: 1, bucket: null, value: 8, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Champion's Discipline (Sanguivorum IAG): constant +8 Accuracy. See passive:mil_veteran_discipline's own note.",
});

// whileAllyAlive (11) / whileAlliesDiverse (1) (2f, 26 Nov): a
// continuous, reversible conditional self-buff, toggled on/off each
// round as its own live condition (an ally/summon alive, or a
// division's family diversity) changes -- unlike every once-per-combat
// trigger elsewhere in this file. The scope match itself (p.scope/
// p.summonKey/p.minDistinct, the division/family alive-check) stays
// read directly off the data in tickEnemyPassives (combat.js) -- a
// routing/gate concern, same split as p.stat for flatStatBonus just
// above; only the `selfBuff` object being applied/negated moves here,
// as a static value, dispatched by key exactly once per round when the
// toggle state actually flips (not on every tick -- `matches !==
// wasActive` now gates the dispatch itself, logically identical to the
// original `(matches && !wasActive) || (!matches && wasActive)` pair of
// conditions, just restructured to avoid a pointless lookup on the
// steady-state round). Reuses "turn.start" -- the same hook batch 1/2's
// regenPerTurn/healthBelowPct entries already use safely for
// holders:['enemy'] by-key dispatch from this exact function.
registerModifier("passive:pack_discipline", {
  source: { kind: "passive", id: "pack_discipline" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Pack Discipline (IA-20): +5 Defense while the Call Outlaw Hounds summon is alive (scope 'summon', summonKey 'call_outlaw_hounds' -- gate stays in combat.js).",
});
registerModifier("passive:criminal_command", {
  source: { kind: "passive", id: "criminal_command" },
  hook: "turn.start", order: 2, bucket: null, value: { acc: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Criminal Command (IA-24): +5 Accuracy while any other alive, non-friendly enemy lives (default scope -- gate stays in combat.js).",
});
registerModifier("passive:ruthless_authority", {
  source: { kind: "passive", id: "ruthless_authority" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Ruthless Authority (IA-29): +5 Defense while any other alive, non-friendly enemy lives (default scope). See passive:criminal_command's own note.",
});
registerModifier("passive:marine_discipline", {
  source: { kind: "passive", id: "marine_discipline" },
  hook: "turn.start", order: 2, bucket: null, value: { acc: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Marine Discipline: +5 Accuracy while another alive enemy shares this creature's own `family` tag (scope 'family' -- gate stays in combat.js).",
});
registerModifier("passive:section_discipline", {
  source: { kind: "passive", id: "section_discipline" },
  hook: "turn.start", order: 2, bucket: null, value: { acc: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Section Discipline: +5 Accuracy while another alive enemy shares this creature's own `division` tag (scope 'division' -- gate stays in combat.js).",
});
registerModifier("passive:command_discipline", {
  source: { kind: "passive", id: "command_discipline" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Command Discipline: +5 Defense while another alive enemy shares this creature's own `division` tag (scope 'division'). See passive:section_discipline's own note.",
});
registerModifier("passive:combined_arms_authority", {
  source: { kind: "passive", id: "combined_arms_authority" },
  hook: "turn.start", order: 3, bucket: null, value: { acc: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Combined-Arms Authority (Arbitarius Commander): +5 Accuracy while at least `minDistinct` (2) distinct `family` values are alive within this creature's own `division` (whileAlliesDiverse, the only id with this trigger) -- gate stays in combat.js.",
});
registerModifier("passive:handlers_discipline", {
  source: { kind: "passive", id: "handlers_discipline" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Handler's Discipline: +5 Defense while the Deploy Legion Hounds summon is alive (scope 'summon', summonKey 'deploy_legion_hounds'). See passive:pack_discipline's own note.",
});
registerModifier("passive:sang_sec_captains_authority", {
  source: { kind: "passive", id: "sang_sec_captains_authority" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Captain's Authority (Sanguivorum Security): +5 Defense while another alive enemy shares this creature's own `division` tag (scope 'division'). See passive:section_discipline's own note.",
});
registerModifier("passive:sang_iag_mercenary_authority", {
  source: { kind: "passive", id: "sang_iag_mercenary_authority" },
  hook: "turn.start", order: 2, bucket: null, value: { acc: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Mercenary Authority (Sanguivorum IAG): +5 Accuracy while another alive enemy shares this creature's own `family` tag (scope 'family'). See passive:marine_discipline's own note.",
});
registerModifier("passive:sang_iag_arena_handler", {
  source: { kind: "passive", id: "sang_iag_arena_handler" },
  hook: "turn.start", order: 2, bucket: null, value: { def: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Arena Handler (Sanguivorum IAG): +5 Defense while the Release the Beasts summon is alive (scope 'summon', summonKey 'sang_iag_release_the_beasts'). See passive:pack_discipline's own note.",
});
registerModifier("passive:sang_iag_militia_authority", {
  source: { kind: "passive", id: "sang_iag_militia_authority" },
  hook: "turn.start", order: 2, bucket: null, value: { atk: 5 }, behavior: null,
  params: null, when: null, holders: ["enemy"], state: null,
  notes: "Militia Authority (Sanguivorum IAG): +5 Attack while another alive enemy shares this creature's own `family` tag (scope 'family'). See passive:marine_discipline's own note.",
});
