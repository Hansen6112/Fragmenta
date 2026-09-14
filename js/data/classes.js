/*
 * FRAGMENTA — Classes
 * Class supplies a character's combat kit (Tactics / Elemental abilities /
 * Apothecary buffs — see engine/combat.js's classHasTactics/classHasApothecary
 * and state.flags.isMage) and the *shape* of automatic per-level growth,
 * mirroring how data/creaturetags.js's ARCHETYPES shapes an enemy's growth
 * on top of its species base. Race (data/races.js) supplies only flat
 * starting stats with no growth effect; Origin (data/origins.js) layers a
 * second, smaller growth multiplier on top of Class's — Class is always
 * the dominant shape, Origin a secondary nudge.
 *
 * Mage and Bruise share the exact same toolkit (elemental abilities,
 * isMage: true) — see data/origins.js: picking either of the two special
 * Origins (Kabal-recruited / Norrvael-fled) *forces* the matching Class,
 * rather than Class being freely chosen for them. What differs between the
 * two is Origin (registration status, reputation, wanted flag), not Class.
 *
 * PLAYER_GROWTH_BASE / PLAYER_SECONDARY_GROWTH_RATE are a single shared
 * "average build" baseline (engine/state.js's recomputeStats multiplies
 * these by a Class's own table below, then by Origin's smaller one, then
 * by (level-1) — same multiplicative-stacking shape as
 * data/creaturetags.js's computeCreatureStats). Speed/accuracy/agility
 * deliberately share ONE flat rate for every Class — only ever scaled by a
 * multiplier, never given a faster base rate — for the same reason
 * creaturetags.js's own header comment gives: these three feed threshold-y
 * combat math (engine/combat.js's hitChance clamps at 10%/90%, Speed
 * decides turn order outright), where letting one Class's *base* rate run
 * away from another's reproduces the exact unwinnable-gap bug that system
 * already found and fixed for enemies. Accuracy/agility now go one step
 * further: every Class's multiplier on both is a flat 1.0 (only Speed
 * still varies by Class) — a headless playtest (v0.9) found hit-chance
 * parity against level-matched enemies decaying every level for 4 of 5
 * Classes, since enemy ARCHETYPES-weighted accuracy/agility growth
 * averaged above what those Classes' old multipliers (0.85-0.95) gave
 * back. Scout no longer gets a baseline edge on these two stats from its
 * Class alone — that identity now lives in its level-15 "Deepen" choice
 * (state.scoutDeepenBonus, engine/state.js's recomputeStats), a real
 * build decision rather than a free starting advantage every Scout had
 * regardless of choice. Deepen is a flat +2 added directly to each of
 * speed/accuracy/agility (v0.10 — originally a 15% multiplier on the
 * already-small growth term, which only produced a "+1 by level 20"
 * trickle; now mirrors Mage's own level-15 "boost" choice, a flat +6
 * magicBoost in one stat, just split three ways instead of one).
 *
 * All growth numbers here are a first-pass reverse-engineering of the old
 * Background growth tables' identity shapes (fighter outpaces mage on atk/
 * def/health and the reverse on magic, knowledge spread broadly) —
 * corrected twice already (v0.9/v0.10, above) after headless playtests,
 * and still flagged, same as data/races.js, as pending a further pass
 * rather than a locked balance.
 */

const PLAYER_GROWTH_BASE = { atk: 0.4, def: 0.35, health: 0.9, magic: 0.4, knowledge: 0.45 };
const PLAYER_SECONDARY_GROWTH_RATE = 0.4;

const CLASSES = {
  warrior: {
    name: "Warrior",
    tagline: "Hits hardest, stands longest — a straightforward answer to most problems.",
    usesTactics: true,
    usesApothecary: false,
    isMage: false,
    growthMult: { atk: 1.3, def: 1.25, health: 1.3, magic: 0.2, knowledge: 0.8 },
    secondaryMult: { speed: 0.9, accuracy: 1.0, agility: 1.0 },
  },
  scout: {
    name: "Scout",
    tagline: "Fast, precise, and gone before the fight settles into a fair one.",
    usesTactics: true,
    usesApothecary: false,
    isMage: false,
    growthMult: { atk: 0.9, def: 0.8, health: 0.85, magic: 0.3, knowledge: 1.1 },
    secondaryMult: { speed: 1.2, accuracy: 1.0, agility: 1.0 },
    // Migrated from the old Vaeloris Thornwatch Scout Background — a
    // Class trait now, not tied to any one Race/Origin. Nudges travel/
    // explore encounter chance and flee-success chance only (engine/
    // parser.js, engine/combat.js's attemptFlee) — see the Scout level-15
    // "Branch" choice for a real combat effect layered on top of this.
    stealthMod: 0.35,
  },
  apothecary: {
    name: "Apothecary",
    tagline: "Keeps a party standing and knows more than it hits for.",
    usesTactics: false,
    usesApothecary: true,
    isMage: false,
    growthMult: { atk: 0.65, def: 0.9, health: 1.0, magic: 0.7, knowledge: 1.3 },
    secondaryMult: { speed: 0.9, accuracy: 1.0, agility: 1.0 },
  },
  mage: {
    name: "Mage",
    tagline: "Tower-trained, registered, and drawing on a discipline most people never touch.",
    usesTactics: false,
    usesApothecary: false,
    isMage: true,
    growthMult: { atk: 0.4, def: 0.5, health: 0.8, magic: 1.2, knowledge: 1.2 },
    secondaryMult: { speed: 0.9, accuracy: 1.0, agility: 1.0 },
  },
  bruise: {
    name: "Bruise",
    tagline: "Self-taught, unregistered, and always ready to be somewhere else in a hurry.",
    usesTactics: false,
    usesApothecary: false,
    isMage: true,
    growthMult: { atk: 0.5, def: 0.4, health: 0.75, magic: 1.0, knowledge: 0.9 },
    secondaryMult: { speed: 1.15, accuracy: 1.0, agility: 1.0 },
  },
};
