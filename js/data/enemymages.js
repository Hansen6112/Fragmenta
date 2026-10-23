/*
 * FRAGMENTA — Enemy Mage Encounters
 * Unlike BESTIARY creatures, enemy mages are generated on the fly rather
 * than looked up by a fixed key — a new one is built each time the roll
 * calls for it, with its own element and stats scaled to danger tier.
 * They plug into the normal combat/startCombat path via a full object
 * (see engine/combat.js getCombatCreature/startCombat), not a BESTIARY id.
 *
 * No `atk` field: an enemy mage's retaliation always comes from its
 * `magic` stat and its `element`, resolved in
 * engine/combat.js resolveEnemyRetaliation, same as the player's own
 * elemental damage — so the strengths/weaknesses matrix
 * (data/matchups.js) applies to both sides of the fight symmetrically.
 */

const ENEMY_MAGE_TITLES = {
  sanguivorum: ["Ingenum Adept", "Legion Conduit-Sworn", "Meadow Battle-Mage"],
  vaeloris: ["Grove Warden", "Swamp-Called Shaman", "Canopy Adept"],
  sahrimor: ["Sand Oracle", "Eternatum Diviner", "Caravan-Sworn Conjurer"],
  thraekor: ["Ash Rune-Smith", "Clanhold Emberwright", "Volcanic Adept"],
  norrvael: ["Mist-Called Practitioner", "Drakekin Adept", "House Dravenkov Conduit"],
  kabal: ["Unregistered Adept", "Kabal Archivist-in-Training", "Tower-Trained Conduit"],
};

// Nations tend toward elements that fit their terrain/culture, but it's a
// weighting, not a hard restriction — any mage could in principle have
// wandered from anywhere.
const NATION_ELEMENT_WEIGHTS = {
  sanguivorum: ["force", "lightning", "air", "earth", "fire", "water", "acid", "transportation"],
  vaeloris: ["water", "earth", "acid", "air", "fire", "lightning", "force", "transportation"],
  sahrimor: ["fire", "earth", "transportation", "air", "water", "lightning", "acid", "force"],
  thraekor: ["fire", "earth", "force", "acid", "lightning", "air", "water", "transportation"],
  norrvael: ["water", "air", "lightning", "transportation", "acid", "fire", "earth", "force"],
  kabal: ["transportation", "force", "acid", "lightning", "fire", "water", "earth", "air"],
};

// Chance that any given random encounter roll (travel leg or explore) turns
// up an enemy mage instead of a normal BESTIARY creature.
const ENEMY_MAGE_CHANCE = 0.2;

function pickWeightedElement(nationId) {
  const weights = NATION_ELEMENT_WEIGHTS[nationId] || ELEMENT_CYCLE;
  // First three entries are 3x as likely to be picked as the rest.
  const pool = [...weights.slice(0, 3), ...weights.slice(0, 3), ...weights.slice(0, 3), ...weights];
  return pool[Math.floor(Math.random() * pool.length)];
}

// tier: 1-5, same danger scale as BESTIARY creatures.
// v0.11 combat retune: enemy mages used to be sized purely by the
// location's danger tier (magic 3+3t, hp 6+4t — capped at 18 magic/26 hp
// even when a level-25 player met one), so they fell off completely past
// the early game. They now scale like any other creature: a Species Base
// (below) run through computeCreatureStats at an encounter level rolled
// off the PLAYER's level, as an Artillery-archetype Normal. `magic` is
// carried through the attack slot of that formula. `tier` still picks
// nothing but flavor if `playerLevel` is supplied; callers that don't
// pass it fall back to the old tier*5 level.
const ENEMY_MAGE_BASE = { hp: 50, magic: 20, def: 2, spd: 6, acc: 6, agi: 5 }; // fitted (v0.11) to an Artillery Normal — glass cannon: ~2-3 rounds to kill, ~8-11 to die, levels 4-20
function enemyMageSpawnRarity(level) {
  if (level < 5) return "common";
  if (level < 10) return "uncommon";
  if (level < 15) return "rare";
  if (level < 20) return "epic";
  return "unique";
}

function generateEnemyMage(nationId, tier, playerLevel) {
  const t = Math.max(1, Math.min(5, tier || 1));
  const level = playerLevel != null ? rollEncounterLevel(playerLevel) : t * 5;
  const stats = computeCreatureStats(
    { hp: ENEMY_MAGE_BASE.hp, atk: ENEMY_MAGE_BASE.magic, def: ENEMY_MAGE_BASE.def, spd: ENEMY_MAGE_BASE.spd, acc: ENEMY_MAGE_BASE.acc, agi: ENEMY_MAGE_BASE.agi, archetype: "artillery", dangerClass: "normal", spawnRarity: enemyMageSpawnRarity(level) },
    level
  );
  const titles = ENEMY_MAGE_TITLES[nationId] || ENEMY_MAGE_TITLES.kabal;
  const title = titles[Math.floor(Math.random() * titles.length)];
  const flavorName = generateNameForNation(nationId);
  const element = pickWeightedElement(nationId);
  const nation = getNation(nationId);

  return {
    id: "enemy_mage_" + Math.random().toString(36).slice(2, 9),
    name: `${title} ${flavorName}`,
    native: nation ? nation.name : "Unknown",
    // Enemy mages aren't routed through the BESTIARY level-roll/rarity
    // system (see combat.js startCombat) — their own tier-based scaling
    // below is untouched, but the gold/XP/flee/kingslayer formulas that
    // used to read a flat `tier` now read a Level, so this is a simple
    // proportional stand-in (location danger 1-5 -> level 5-25) rather
    // than a real roll.
    level,
    element,
    magic: stats.atk,
    def: stats.def,
    hp: stats.hp,
    spd: stats.spd,
    acc: stats.acc,
    agi: stats.agi,
    description: `${ELEMENTS[element].description} A rival practitioner, and not a friendly one — ${ELEMENTS[element].name.toLowerCase()} already gathers at their fingertips.`,
    combatNotes: "An elemental combatant — its magic favors and disfavors specific elements just like yours does.",
    tags: ["mage_encounter"],
    statScaled: true, // already on the v0.11 scale via computeCreatureStats — see combat.js legacyScaledCreature
    friendly: false,
  };
}
