/*
 * FRAGMENTA — Creature Tags & Stat Generation
 * Replaces the old flat BESTIARY `tier` (0-5) danger number with four
 * independent tag axes, plus the formula that turns a species' hand-
 * authored base stats into the actual stats a specific encounter uses.
 *
 * - Habitat: where a creature can appear (multi-select; lives on each
 *   BESTIARY entry's existing `tags` array alongside the terrain ids
 *   TERRAIN_TAGS already produces — see data/world.js).
 * - Archetype: how it fights. Scales Health/Attack/Defense/Speed/
 *   Accuracy/Agility by a flat multiplier per role — a Tank and a
 *   Skirmisher of the same species, level, and rarity end up with very
 *   different stat shapes.
 * - Danger Class: Normal/Elite/Boss/World Boss. A coarse, preset "buffed
 *   state" bucket (the same shape as jobs.js's 1-5 skull difficulty —
 *   a small discrete category driving lookups, not a formula) layered on
 *   as one more multiplier.
 * - Spawn Rarity: Common/Uncommon/Rare/Epic/Unique. Replaces the old
 *   `rare`/`unique` booleans outright. Drives both the per-level stat
 *   growth rate (`rarity weight`, 1-5) and which level range a creature
 *   is even eligible to be encountered at (see isLevelEligibleForRarity).
 *
 * None of the 29 existing BESTIARY creatures have `archetype`/`dangerClass`
 * assigned yet — retrofitting real values onto each is a deliberate,
 * separate content pass. Until then every lookup below falls back to a
 * neutral default (Archetype: no multiplier at all; Danger Class: Normal;
 * Spawn Rarity: Common) so nothing crashes or behaves oddly in the
 * meantime — see DEFAULT_DANGER_CLASS/DEFAULT_SPAWN_RARITY and
 * archetypeMultiplier's fallback.
 */

// Reference vocabulary for the `tags` array already used on BESTIARY
// entries (data/bestiary.js) — not all of these have a matching location
// yet (Jungle/Tundra/Lake/etc. are being added to the world over time);
// this is the full agreed list, not a claim that every tag is reachable
// today.
const HABITAT_TAGS = [
  "forest", "jungle", "plains", "hills", "mountains", "desert", "swamp",
  "tundra", "arctic", "coast", "ocean", "river", "lake", "cave",
  "underground", "ruins", "urban", "dungeon", "volcanic", "wetlands", "sky",
];

// Archetype -> flat multiplier per stat. Applied to the WHOLE level-scaled
// result (see computeCreatureStats), so archetype identity gets more
// pronounced at higher levels, not just at the starting base.
const ARCHETYPES = {
  skirmisher: { health: 1.00, attack: 1.00, defense: 0.90, speed: 1.15, accuracy: 1.10, agility: 1.20 },
  bruiser: { health: 1.25, attack: 1.20, defense: 1.00, speed: 0.85, accuracy: 0.95, agility: 0.80 },
  tank: { health: 1.50, attack: 0.85, defense: 1.30, speed: 0.65, accuracy: 0.90, agility: 0.60 },
  assassin: { health: 0.80, attack: 1.35, defense: 0.75, speed: 1.30, accuracy: 1.25, agility: 1.40 },
  leader: { health: 1.20, attack: 1.10, defense: 1.10, speed: 1.00, accuracy: 1.05, agility: 1.00 },
  support: { health: 0.90, attack: 0.70, defense: 0.90, speed: 1.00, accuracy: 1.15, agility: 1.05 },
  controller: { health: 1.00, attack: 0.85, defense: 1.10, speed: 0.95, accuracy: 1.20, agility: 0.95 },
  artillery: { health: 0.85, attack: 1.40, defense: 0.70, speed: 0.90, accuracy: 1.30, agility: 0.75 },
  summoner: { health: 0.95, attack: 0.75, defense: 0.90, speed: 0.90, accuracy: 1.15, agility: 0.90 },
  juggernaut: { health: 1.75, attack: 1.30, defense: 1.40, speed: 0.50, accuracy: 0.85, agility: 0.50 },
  berserker: { health: 1.10, attack: 1.45, defense: 0.80, speed: 1.05, accuracy: 1.00, agility: 0.90 },
};

// Danger Class -> flat multiplier applied on top of everything else.
const DANGER_CLASSES = { normal: 1.0, elite: 1.5, boss: 2.5, world_boss: 4.0 };
const DANGER_CLASS_RANK = { normal: 0, elite: 1, boss: 2, world_boss: 3 };
const DEFAULT_DANGER_CLASS = "normal";

// Spawn Rarity -> { weight (per-level stat growth rate), levelMin/levelMax
// (the level band a creature of this rarity is eligible to appear in —
// inclusive at both ends; the small overlaps at 5/10/15 are intentional,
// a smooth handoff rather than a hard cliff between adjacent rarities).
// Unique has no ceiling (levelMax: Infinity) — nothing above it exists.
const SPAWN_RARITIES = {
  common: { weight: 1, levelMin: 1, levelMax: 5 },
  uncommon: { weight: 2, levelMin: 5, levelMax: 10 },
  rare: { weight: 3, levelMin: 10, levelMax: 15 },
  epic: { weight: 4, levelMin: 15, levelMax: 19 },
  unique: { weight: 5, levelMin: 20, levelMax: Infinity },
};
const SPAWN_RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, unique: 4 };
const DEFAULT_SPAWN_RARITY = "common";

function archetypeMultiplier(statKey, archetypeId) {
  const row = ARCHETYPES[archetypeId];
  return row && typeof row[statKey] === "number" ? row[statKey] : 1;
}

function dangerClassMultiplier(dangerClassId) {
  return DANGER_CLASSES[dangerClassId] ?? DANGER_CLASSES[DEFAULT_DANGER_CLASS];
}

function dangerClassRank(creature) {
  return DANGER_CLASS_RANK[creature.dangerClass || DEFAULT_DANGER_CLASS] ?? 0;
}

function spawnRarityWeight(spawnRarityId) {
  const row = SPAWN_RARITIES[spawnRarityId];
  return row ? row.weight : SPAWN_RARITIES[DEFAULT_SPAWN_RARITY].weight;
}

function spawnRarityRank(creature) {
  return SPAWN_RARITY_RANK[creature.spawnRarity || DEFAULT_SPAWN_RARITY] ?? 0;
}

// Whether `level` falls within the level band a creature of this Spawn
// Rarity is eligible to be encountered at. Not yet consulted by encounter
// SELECTION (data/bestiary.js creaturesForTags doesn't filter by player
// level at all today) — that's follow-up work for once the full bestiary
// retrofit gives every creature a real spawnRarity across the whole 1-25
// range. clampLevelToRarityBand (below) is what's actually wired into
// startCombat right now, and covers the important case on its own: a
// creature can't be scaled to a level its own rarity doesn't support.
function isLevelEligibleForRarity(level, spawnRarityId) {
  const row = SPAWN_RARITIES[spawnRarityId] || SPAWN_RARITIES[DEFAULT_SPAWN_RARITY];
  return level >= row.levelMin && level <= row.levelMax;
}

// Clamps a rolled encounter level into the creature's own Spawn Rarity
// band. Without this, a high-level player would scale even a Common
// creature's Attack/Defense up to their own level via computeCreatureStats
// (since no creature has an Archetype/Danger Class to temper that yet) —
// a level-1-5-band "trash" creature staying weak forever, regardless of
// the player's level, is exactly the point of the level band; only Rare/
// Epic/Unique creatures should ever scale toward a high-level player.
function clampLevelToRarityBand(level, spawnRarityId) {
  const row = SPAWN_RARITIES[spawnRarityId] || SPAWN_RARITIES[DEFAULT_SPAWN_RARITY];
  return Math.max(row.levelMin, Math.min(row.levelMax, level));
}

// A "big kill" check shared by Kingslayer/Living Legacy and similar
// effects — Boss/World Boss danger class OR Epic/Unique rarity counts,
// regardless of the other axis (a Boss-tagged common critter is still a
// big kill; so is a plain Unique).
function isNotableCreature(creature) {
  return dangerClassRank(creature) >= DANGER_CLASS_RANK.boss || spawnRarityRank(creature) >= SPAWN_RARITY_RANK.epic;
}

// Rolls the level a spawned creature encounter uses: the player's own
// level, plus or minus up to 3, floored at 1 (nothing can be level 0).
// Quest/job-tied creatures (BESTIARY's `special` flag, or any dynamically
// generated creature a job/quest builds directly) are exempt from this —
// callers simply don't route those through this function.
function rollEncounterLevel(playerLevel) {
  return Math.max(1, (playerLevel || 1) + randInt(-3, 3));
}

// Turns a species' hand-authored hp/atk/def/spd/acc/agi (the "Species
// Base") into the actual stats a specific leveled, rarity-weighted,
// archetyped, danger-classed encounter uses:
//   Final = (Species Base + (Level-1) * Rarity Weight) * Archetype Mult * Danger Class Mult
// Health is floored at 1 (a creature can't exist at 0 Health); every other
// stat floors at 0 rather than 1, since some creatures are intentionally
// harmless or immobile (e.g. Vaelorn's atk: 0).
function computeCreatureStats(creature, level) {
  const rarityWeight = spawnRarityWeight(creature.spawnRarity);
  const dangerMult = dangerClassMultiplier(creature.dangerClass);
  const growth = Math.max(0, level - 1) * rarityWeight;
  const scale = (base, statKey, floor) => Math.max(floor, Math.round((((base || 0) + growth) * archetypeMultiplier(statKey, creature.archetype)) * dangerMult));
  return {
    hp: scale(creature.hp, "health", 1),
    atk: scale(creature.atk, "attack", 0),
    def: scale(creature.def, "defense", 0),
    spd: scale(creature.spd, "speed", 0),
    acc: scale(creature.acc, "accuracy", 0),
    agi: scale(creature.agi, "agility", 0),
  };
}
