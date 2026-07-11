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
function generateEnemyMage(nationId, tier) {
  const t = Math.max(1, Math.min(5, tier || 1));
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
    level: t * 5,
    element,
    magic: 3 + t * 3,
    def: 1 + t,
    hp: 6 + t * 4,
    spd: 4 + t,
    acc: 4 + t,
    agi: 3 + t,
    description: `${ELEMENTS[element].description} A rival practitioner, and not a friendly one — ${ELEMENTS[element].name.toLowerCase()} already gathers at their fingertips.`,
    combatNotes: "An elemental combatant — its magic favors and disfavors specific elements just like yours does.",
    tags: ["mage_encounter"],
    friendly: false,
  };
}
