/*
 * FRAGMENTA — Damage Types System, Spec v1.0 (Tyler, 12 Nov 2026, approved).
 * Companion to "Fragmenta Damage Types Reference" (Tyler, 12 Nov), which
 * owns the roster, tag tables and injury groups — this file is the
 * engine's own copy of the locked roster (T1) and the generic math every
 * formula needs (T2/T4/T5/T6/T9), none of it wired into a live damage
 * path yet. Replaces Enemy Elemental Damage spec v0.1's element mapping.
 *
 * Order of work (spec §8): this is step 2, "the system... behind the
 * switch" — the content passes (weapon/creature/ability/status
 * damageType and tag data, step 3) and turning DAMAGE_TYPES_V2 on (step
 * 4) are later, separate steps. With the switch at its default of off,
 * nothing here changes any existing formula's output.
 */

// T1: the locked 16-type roster, grouped by family, plus First River
// (T9: story only, never shown to the player, no family of its own).
// Spatial is the renamed Transportation (js/data/matchups.js's
// ELEMENT_CYCLE); Frost, Acid, Poison are new — matching the Reference's
// roster exactly. Canonical keys are lowercase, matching every other
// damage-type-shaped key already in this codebase (ELEMENTS, old
// INJURY_GROUPS.damageTypes).
const DAMAGE_TYPE_FAMILIES = {
  physical: ["slashing", "piercing", "blunt"],
  elemental: ["fire", "frost", "water", "air", "lightning", "earth"],
  corrosive: ["acid", "poison"],
  metaphysical: ["force", "spatial", "spirit", "necrotic", "divine"],
};
const DAMAGE_TYPES = Object.values(DAMAGE_TYPE_FAMILIES).flat();
const DAMAGE_TYPE_FAMILY = {};
for (const [family, types] of Object.entries(DAMAGE_TYPE_FAMILIES)) {
  for (const t of types) DAMAGE_TYPE_FAMILY[t] = family;
}
const FIRST_RIVER = "firstRiver"; // T9 — not in DAMAGE_TYPES, has no family

// Family of `damageType`, or "physical" for First River and anything
// unrecognized (a safe, conservative default: physical-family damage is
// reduced by Defense alone, the simplest possible rule, and never NaNs
// out on a magic-less creature).
function damageFamily(damageType) {
  return DAMAGE_TYPE_FAMILY[damageType] || "physical";
}

// T2: the four tag values and their multipliers (starting values — tuned
// in Phase 4, per T2's own note).
const DAMAGE_TAG_MULTIPLIER = { immune: 0, resist: 0.5, normal: 1, weak: 1.5 };

// T5/T6: the resisting stat value for a hit of `damageType`. `defValue` is
// the target's ALREADY-fully-resolved effective Defense for this hit —
// every call site keeps owning its own banked-bonus/buff additions to
// Defense exactly as it does today; this function only decides how much
// of a role Magic plays alongside that number. `magicValue` is the
// target's raw Magic stat, or null/undefined if it has none (the common
// case for most creatures) — T6's "defaults to Defense" fallback is
// applied HERE, not on the data, so nothing needs a magic:0 field added
// to every creature that doesn't cast spells.
function resistingDefenseValue(damageType, defValue, magicValue) {
  if (damageFamily(damageType) === "physical" || damageType === FIRST_RIVER) return defValue;
  const magic = magicValue != null ? magicValue : defValue;
  return (2 * magic + defValue) / 3;
}

// T2/T4/T9: the tag-driven multiplier for `holder` (anything carrying a
// `dmgTags` map: player state, an ally, a BESTIARY creature, a mercenary
// template) against `damageType`. Named `dmgTags`, deliberately NOT
// `tags` — BESTIARY/ally creatures already have an unrelated `tags` array
// (habitat/faction categorization, e.g. dregnar_ashvein's
// tags: ["dregnar_scripted"], js/data/bestiary.js, 233+ entries) and
// reusing that name would silently collide with every one of them.
// Missing/unknown tag reads as Normal (1x, T2's own default). First River
// ignores every tag unconditionally (T9).
function dmgTagMultiplier(holder, damageType) {
  if (damageType === FIRST_RIVER) return 1;
  const tag = holder && holder.dmgTags && holder.dmgTags[damageType];
  return DAMAGE_TAG_MULTIPLIER[tag] != null ? DAMAGE_TAG_MULTIPLIER[tag] : 1;
}

// T3: status immunity is a separate flag from damage tags (Ash Hide:
// Resist Fire *and* immune to Burning) — holder.statusImmune is a plain
// array of status keys, same holders as dmgTags above.
function isStatusImmune(holder, statusKey) {
  return !!(holder && holder.statusImmune && holder.statusImmune.includes(statusKey));
}

// §2: resolve the damage type for a hit. Priority: the action's own
// declared damageType (a spell/ability/status tick) -> the attacker's
// equipped weapon's damageType (a basic attack, or a basic-attack-shaped
// ability with none of its own) -> the attacker creature's attackType
// (no weapon — BESTIARY claw/bite/slam) -> Blunt, the explicit spec
// fallback ("If missing, Blunt, which reproduces today's Trauma
// injuries"). Callers resolve weaponDamageType/creatureAttackType
// themselves (equipment lookup differs by actor kind) and pass them in —
// this function only picks among them.
function resolveDamageType(action, weaponDamageType, creatureAttackType) {
  if (action && action.damageType) return action.damageType;
  if (weaponDamageType) return weaponDamageType;
  if (creatureAttackType) return creatureAttackType;
  return "blunt";
}

// §7.1: the system lives behind this switch, off by default. With it
// off, every formula keeps today's math (attacker-power-vs-flat-Defense,
// the element cycle via js/data/matchups.js) exactly — see each call
// site's own "DAMAGE_TYPES_V2 ?" branch, added in the steps after this
// one. Turning it on is the spec's own §7 step 3; content passes (§5)
// land first, while it's still off.
const DAMAGE_TYPES_V2 = false;
