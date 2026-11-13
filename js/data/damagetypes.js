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

// Step 4, A4: "transportation" is the OLD ELEMENTS key for the type the
// new roster calls Spatial (T1) -- it's never itself migrated (Character
// Creation's own stored choice, every existing save, ATTUNEMENT_TAG_PAIRS'
// own key), so any code that reads creature.element/state.primaryElement
// directly and feeds it into a damage-type-keyed lookup (dmgTagMultiplier,
// resistingDefenseValue, an injury-group table, ...) needs this
// translation first, same as ATTUNEMENT_TAG_PAIRS.transportation already
// gets it right. Everything else passes through unchanged.
function elementKeyToDamageType(key) {
  return key === "transportation" ? "spatial" : key;
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

// Decisions Addendum (Tyler, 12 Nov 2026, approved), A3: while Avatar of
// Knowledge is active, the target's tag counts one step better for the
// attacker -- Immune -> Resist, Resist -> Normal. Normal and Weak are
// untouched (Weak keeps its own 1.5x, the same cap the old matchup
// override's strong side had). A separate function from dmgTagMultiplier
// (not a flag on it) since this only ever applies to the PLAYER's own
// attack (Avatar of Knowledge is a player buff) -- every other caller
// keeps calling the plain version unchanged.
const AVATAR_OF_KNOWLEDGE_SHIFT = { immune: "resist", resist: "normal" };
function dmgTagMultiplierForAttacker(holder, damageType, avatarOfKnowledgeActive) {
  if (damageType === FIRST_RIVER) return 1;
  let tag = (holder && holder.dmgTags && holder.dmgTags[damageType]) || "normal";
  if (avatarOfKnowledgeActive && AVATAR_OF_KNOWLEDGE_SHIFT[tag]) tag = AVATAR_OF_KNOWLEDGE_SHIFT[tag];
  return DAMAGE_TAG_MULTIPLIER[tag] != null ? DAMAGE_TAG_MULTIPLIER[tag] : 1;
}

// T3: status immunity is a separate flag from damage tags (Ash Hide:
// Resist Fire *and* immune to Burning) — holder.statusImmune is a plain
// array of status keys, same holders as dmgTags above.
// Step 4, A2 (Tyler, 12 Nov, approved): Frozen is a deeper Chilled, not
// a different condition, so immunity to Chilled blocks Frozen too.
// Nothing inflicts Frozen directly today (it only ever arrives through
// Chilled's own build-up escalation, which already can't start on a
// Chilled-immune holder), but this stops a future direct-Frozen ability
// from bypassing Winter Coat.
const STATUS_IMMUNITY_FAMILY = { frozen: "chilled" };
function isStatusImmune(holder, statusKey) {
  if (!holder || !holder.statusImmune) return false;
  if (holder.statusImmune.includes(statusKey)) return true;
  const family = STATUS_IMMUNITY_FAMILY[statusKey];
  return !!(family && holder.statusImmune.includes(family));
}

// Step 4, A2 (off by default everywhere upstream of this function --
// this check itself needs no gate of its own: "frozen" can only ever
// appear once DAMAGE_TYPES_V2 lets Chilled's own build-up escalation
// run, so with the switch off this is identical to checking chilled
// alone). True if either half of the Chilled/Frozen family is present
// on a status bag -- combat.player.playerStatuses, or an ally's own
// .statuses -- for callers (Winter's Verdict) that treat the two as one
// condition rather than checking chilled specifically.
function isChillFamily(statuses) {
  return !!(statuses && (statuses.chilled || statuses.frozen));
}

// §2: resolve the damage type for a hit. Priority: "fromCreature" (step
// 2 follow-ups, A5 -- the ability uses whichever creature elementType
// the acting creature's own randomly-picked elementVariant set, e.g.
// Breath Weapon on a White Draven-Drak) -> the action's own declared
// damageType (a spell/ability/status tick) -> the attacker's equipped
// weapon's damageType (a basic attack, or a basic-attack-shaped ability
// with none of its own) -> the attacker creature's attackType (no
// weapon — BESTIARY claw/bite/slam) -> Blunt, the explicit spec
// fallback ("If missing, Blunt, which reproduces today's Trauma
// injuries"). Callers resolve weaponDamageType/creatureAttackType/
// creatureElementType themselves (equipment lookup differs by actor
// kind, and only an enemy actor ever has an elementType) and pass them
// in — this function only picks among them.
//
// Content Load handoff §2a (off by default): creatureAttackType can
// ALSO be "fromCreature" -- a generic Elemental's own BASIC attack (no
// weapon, no ability override) uses its spawned variant's element too
// (a Fire Elemental's fist is Fire), the same elementType A5 already
// set at build time for abilities. Checked after weaponDamageType
// (equipped gear still wins over a bare-fisted creature's own element)
// but before the plain creatureAttackType fallback, which "fromCreature"
// itself would never usefully match as a literal damage type.
function resolveDamageType(action, weaponDamageType, creatureAttackType, creatureElementType) {
  if (action && action.damageType === "fromCreature") return creatureElementType || "blunt";
  if (action && action.damageType) return action.damageType;
  if (weaponDamageType) return weaponDamageType;
  if (creatureAttackType === "fromCreature") return creatureElementType || "blunt";
  if (creatureAttackType) return creatureAttackType;
  return "blunt";
}

// Damage Types spec v1.0, step 2 follow-ups, A5 (off by default): the
// Codex makes dragons and Elementals "come in elemental variants" --
// one is picked, weighted, when a creature carrying `elementVariants`
// (a list of { id, damageType, status, displayName, weight,
// preferredTags }) spawns (js/engine/combat.js's buildFightCreature).
// Weight defaults to 1 for a variant that omits it, matching how every
// other weighted-pick table in this codebase treats a missing weight.
//
// Decisions Addendum §2 (Tyler, 12 Nov, approved): `locationTags` (the
// current encounter location's own resolved terrain tags, js/engine/
// combat.js's startCombat) biases the pick -- a variant whose own
// preferredTags overlaps locationTags gets its weight x4; every other
// variant keeps its plain weight. This is a BIAS, not a filter (a
// strict match would mean a variant whose preferred habitat a species
// never actually spawns in -- Green/Black dragons' forest/swamp against
// dragons' own mountain/volcanic spawn tags -- could never appear at
// all): with no overlap for any variant (no locationTags passed, e.g. a
// summon, or none of them match), it falls back to the plain uniform
// weighted pick.
function pickElementVariant(variants, locationTags) {
  if (!variants || !variants.length) return null;
  const tags = locationTags || [];
  const weights = variants.map((v) => (v.weight || 1) * (v.preferredTags && v.preferredTags.some((t) => tags.includes(t)) ? 4 : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < variants.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return variants[i];
  }
  return variants[variants.length - 1];
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
// Step 4, A4: display-only rename, same mutation shape as the Frost
// addition just above. The stored key stays "transportation" (Character
// Creation, every existing save, ATTUNEMENT_TAG_PAIRS) -- only the name
// every UI/combat-line/death-log read of ELEMENTS[key].name shows
// changes, since every one of those call sites already reads the name
// generically rather than hardcoding the word "Transportation".
if (DAMAGE_TYPES_V2 && typeof ELEMENTS !== "undefined" && ELEMENTS.transportation) {
  ELEMENTS.transportation.name = "Spatial";
}
