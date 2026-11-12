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

// §7.1: the system lives behind this switch, off by default. With it
// off, every formula keeps today's math (attacker-power-vs-flat-Defense,
// the element cycle via js/data/matchups.js) exactly — see each call
// site's own "DAMAGE_TYPES_V2 ?" branch, added in the steps after this
// one. Turning it on is the spec's own §7 step 3; content passes (§5)
// land first, while it's still off. Declared FIRST in this file (not
// last) — the Frost-element addition near the bottom checks it at load
// time, not just inside a function, so the const must already exist by
// then (a `const` isn't hoisted with its value the way a function
// declaration is).
const DAMAGE_TYPES_V2 = false;

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

// Bridge (step 2b) for the 5 statuses js/engine/combat.js's own
// statusDamageType already mapped under the OLD roster, translated onto
// the new 16-type one, for use until content (§5) puts a real damageType
// field directly on each STATUS_EFFECTS entry (which then takes priority
// below). bleed -> slashing (a cut, not a type of its own in the new
// roster); venom/blight/sang_iag_poison -> poison (T7: both Venom and
// Poison are Poison-type damage, whatever their stacking/status
// differences); burning -> fire (unchanged).
const LEGACY_STATUS_DAMAGE_TYPE_V2 = {
  bleed: "slashing",
  burning: "fire",
  venom: "poison",
  blight: "poison",
  sang_iag_poison: "poison",
};
// A DOT tick's damage type: the status's own declared damageType once
// content exists, else the legacy bridge above, else Blunt (the same
// resolveDamageType fallback every other hit uses).
function resolveStatusDamageType(statusKey, statusDef) {
  if (statusDef && statusDef.damageType) return statusDef.damageType;
  return LEGACY_STATUS_DAMAGE_TYPE_V2[statusKey] || "blunt";
}

// Damage Types spec v1.0, step 2 follow-ups, A1 (Tyler's Reference
// document, 12 Nov 2026): the new 12-group injury table, replacing the
// old 6-group INJURY_GROUPS (js/engine/state.js) once DAMAGE_TYPES_V2
// is on -- js/engine/combat.js's applyInjuriesFromDowns/
// applyOneInjuryToGroup pick between the two tables by the switch.
// `slots` holds full injury ids here (not bare suffixes the way the
// old table's groups do, since those get `group + "_"` prepended at
// roll time) -- that's what lets Frostbite keep its legacy id
// (exposure_frostbite, js/engine/state.js's INJURY_SLOT_DEFS) while
// moving into this table's own "frost" group. firstRiver deliberately
// has no entry (T9: no injury, never displayed) -- applyInjuriesFromDowns
// skips it outright rather than falling through to any group.
const INJURY_GROUPS_V2 = {
  trauma: { damageTypes: ["blunt", "earth", "force"], slots: ["trauma_fractured_arm", "trauma_cracked_ribs", "trauma_broken_leg"] },
  laceration: { damageTypes: ["slashing"], slots: ["laceration_deep_gash", "laceration_torn_tendon", "laceration_severed_grip"] },
  puncture: { damageTypes: ["piercing"], slots: ["puncture_pierced_shoulder", "puncture_punctured_lung", "puncture_lodged_arrowhead"] },
  burns: { damageTypes: ["fire"], slots: ["burns_burned_hands", "burns_seared_skin", "burns_smoke_scarred_lungs"] },
  shock: { damageTypes: ["lightning"], slots: ["shock_nerve_tremor", "shock_scrambled_reflexes", "shock_arrhythmia"] },
  frost: { damageTypes: ["frost"], slots: ["exposure_frostbite", "frost_numbed_fingers", "frost_brittle_bones"] },
  exposure: { damageTypes: ["water", "air"], slots: ["exposure_fluid_filled_lungs", "exposure_burst_eardrum", "exposure_waterlogged_wounds"] },
  corrosion: { damageTypes: ["acid"], slots: ["corrosion_acid_eaten_flesh", "corrosion_damaged_eyes", "corrosion_dissolved_grip"] },
  toxin: { damageTypes: ["poison"], slots: ["toxin_lingering_venom", "toxin_nerve_damage", "toxin_weakened_blood"] },
  rot: { damageTypes: ["necrotic"], slots: ["rot_necrotic_wound", "rot_withered_limb", "rot_grave_chill"] },
  displacement: { damageTypes: ["spatial"], slots: ["displacement_dislocation_sickness", "displacement_fractured_mind", "displacement_unanchored"] },
  soul: { damageTypes: ["spirit", "divine"], slots: ["soul_hollowed_soul", "soul_spirit_scar", "soul_haunted"] },
};
const DAMAGE_TYPE_TO_INJURY_GROUP_V2 = {};
for (const [groupId, groupDef] of Object.entries(INJURY_GROUPS_V2)) {
  for (const dt of groupDef.damageTypes) DAMAGE_TYPE_TO_INJURY_GROUP_V2[dt] = groupId;
}

// A1/A2 (Tyler, 12 Nov 2026, approved) -- Character Creation spec v1.0,
// Amendment 1: each attunement carries one Resist and one Weak (T4),
// and Frost joins as a 9th starting choice. Spirit/Necrotic/Divine are
// deliberately absent -- A2: not starting choices, reserved for Player
// Skills and story paths. The "transportation" key is kept (Character
// Creation's own ELEMENTS id, and every existing save's stored choice)
// -- only its damage-type-facing name changes to Spatial (T1).
const ATTUNEMENT_TAG_PAIRS = {
  fire: { resist: "fire", weak: "water" },
  water: { resist: "water", weak: "lightning" },
  lightning: { resist: "lightning", weak: "earth" },
  earth: { resist: "earth", weak: "air" },
  air: { resist: "air", weak: "frost" },
  frost: { resist: "frost", weak: "fire" },
  acid: { resist: "acid", weak: "water" },
  force: { resist: "force", weak: "spatial" },
  transportation: { resist: "spatial", weak: "force" },
};
// The player's own dmgTags, derived from their primary attunement --
// called by GameState's own dmgTags getter (js/engine/state.js), never
// stored as a field (see that getter's own comment for why).
function playerAttunementDmgTags(state) {
  const pair = state && state.primaryElement && ATTUNEMENT_TAG_PAIRS[state.primaryElement];
  if (!pair) return null;
  return { [pair.resist]: "resist", [pair.weak]: "weak" };
}
// A2: Frost as a 9th starting choice -- added to ELEMENTS (js/data/
// elements.js, already loaded by this point in index.html's script
// order) only once here, under the switch, rather than unconditionally
// in that file itself: elementList()/the element-keyword matcher both
// already iterate Object.keys(ELEMENTS) generically (no hardcoded
// 8-element list anywhere), so adding the key is the ONLY change needed
// to make Frost selectable everywhere an element can be chosen -- and
// gating it here, not there, keeps it unavailable while the switch is
// off, exactly like every other new-roster-only addition in this file.
if (DAMAGE_TYPES_V2 && typeof ELEMENTS !== "undefined" && !ELEMENTS.frost) {
  ELEMENTS.frost = {
    name: "Frost",
    description: "Cold given a cutting edge -- the stillness before something breaks.",
    verb: (target) => `You drive a shard of killing frost into ${target}`,
  };
}
