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

// Faction -> which pool of creatures can spawn together (see
// poolmatesFor/rollEncounterGroup below). Mirrors the top level of the
// author's own Enemy Codex; `group` (a BESTIARY field, open vocabulary —
// "wolf", "mercenaries", etc., growing as more creatures are authored) is
// the narrower label under it. Both must match for two creatures to be
// poolable — same `group` alone isn't enough (a `wild`/wolf shouldn't pool
// with a `magical`/wolf-flavored construct just because they share the
// narrower label).
const CREATURE_FACTIONS = [
  "wild", "magical", "unnaturals", "kabal", "sanguivorum", "vaeloris",
  "thraekor", "norrvael", "sahrimor", "neutral",
];

// spawnGroup -> whether/how a creature groups at spawn time. Undefined
// defaults to "solitary" (every creature keeps spawning alone until
// explicitly retrofitted, the same safe-fallback precedent archetype/
// dangerClass/spawnRarity already established). "pack" (wild creatures)
// and "squad" (organized humanoids) are functionally identical — both just
// mean "eligible to pool with same-faction/same-group creatures" — the
// distinction is flavor-text only (see rollEncounterGroup's callers).
const SPAWN_GROUP_KINDS = ["solitary", "pack", "squad"];
const DEFAULT_SPAWN_GROUP = "solitary";

// Group size (including the anchor spawn itself), weighted toward small —
// a guaranteed-possible 5-wolf pack against a low-level player is rough
// without real tuning, so most encounters stay at 1-2 with the full 5 rare.
// Index 0 -> size 1, index 4 -> size 5.
const GROUP_SIZE_WEIGHTS = [45, 25, 15, 10, 5];

function rollGroupSize() {
  const total = GROUP_SIZE_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < GROUP_SIZE_WEIGHTS.length; i++) {
    roll -= GROUP_SIZE_WEIGHTS[i];
    if (roll < 0) return i + 1;
  }
  return GROUP_SIZE_WEIGHTS.length;
}

// Every non-special BESTIARY id sharing BOTH faction and group with the
// given template — the pool a pack/squad (or a Leader's underlings) draws
// from. Requires both fields to be actually set (an untagged creature
// never pools with another untagged one just because they're both
// undefined). Includes the template's own id, since duplicates are
// expected ("Wolf 1, Wolf 2, Ancient Wolf").
function poolmatesFor(template) {
  if (!template || !template.faction || !template.group) return [];
  return Object.keys(BESTIARY).filter((id) => {
    const c = BESTIARY[id];
    return c && !c.special && c.faction === template.faction && c.group === template.group;
  });
}

const DANGER_CLASS_BY_RANK_LIST = ["normal", "elite", "boss", "world_boss"];

// Rolls the full spawn group for an encounter anchored on `anchorId`
// (the creature the game already decided should appear, e.g. via
// creaturesForTags). Returns an array of { id, dangerClass } — combat.js's
// startCombat still does the actual per-member level clamp/stat-scaling
// (clampLevelToRarityBand/computeCreatureStats), same as it already does
// for a single creature.
//
// Two independent, additive rules:
// - Pack/Squad: only if the anchor itself is tagged spawnGroup "pack" or
//   "squad" AND a pool exists. Rolls a weighted group size (1-5,
//   GROUP_SIZE_WEIGHTS), filling any additional slots with random picks
//   from the pool — each capped to the anchor's own Danger Class rank
//   (never a higher tier than the encounter's own anchor) and left at the
//   anchor's level (same level band, per design).
// - Leader underlings: ANY archetype "leader" creature (regardless of its
//   own spawnGroup tag) always brings up to 2 underlings from the same
//   pool, hard-capped to Normal Danger Class regardless of the leader's
//   own class — added on top of whatever the pack/squad roll already
//   produced, capped at 5 total.
function rollEncounterGroup(anchorId) {
  const template = BESTIARY[anchorId];
  const anchorDangerClass = (template && template.dangerClass) || DEFAULT_DANGER_CLASS;
  const members = [{ id: anchorId, dangerClass: anchorDangerClass }];
  if (!template || template.special) return members;
  const pool = poolmatesFor(template);
  if (!pool.length) return members;
  const ceilingRank = dangerClassRank(template);
  const pickCapped = () => {
    const pickId = pool[Math.floor(Math.random() * pool.length)];
    const pickRank = Math.min(dangerClassRank(BESTIARY[pickId]), ceilingRank);
    return { id: pickId, dangerClass: DANGER_CLASS_BY_RANK_LIST[pickRank] };
  };
  if (template.spawnGroup === "pack" || template.spawnGroup === "squad") {
    const size = rollGroupSize();
    while (members.length < size) members.push(pickCapped());
  }
  if (template.archetype === "leader") {
    for (let i = 0; i < 2 && members.length < 5; i++) {
      const pickId = pool[Math.floor(Math.random() * pool.length)];
      members.push({ id: pickId, dangerClass: "normal" });
    }
  }
  return members;
}

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
// archetyped, danger-classed encounter uses. Health/Attack/Defense:
//   Final = (Species Base + (Level-1) * Rarity Weight * CREATURE_GROWTH_SCALE) * Archetype Mult * Danger Class Mult
// Speed/Accuracy/Agility (see SECONDARY_STAT_GROWTH_PER_LEVEL below):
//   Final = (Species Base + (Level-1) * SECONDARY_STAT_GROWTH_PER_LEVEL) * Archetype Mult
// Health is floored at 1 (a creature can't exist at 0 Health); every other
// stat floors at 0 rather than 1, since some creatures are intentionally
// harmless or immobile (e.g. Vaelorn's atk: 0).
//
// Both constants were tuned against actual simulated fights (not picked on
// paper) — the original formula applied the SAME per-level growth and
// Danger Class multiplier to every one of the six stats, and a level-10
// Uncommon/Normal creature came out with ~28 Accuracy/~30 Agility against a
// same-level player's own ~9/~7 (an unwinnable gap even before Attack/
// Defense/Health entered into it), while a level-25 Unique/Normal creature
// still ran away with the fight on Attack/Defense alone even after Speed/
// Accuracy/Agility were fixed. CREATURE_GROWTH_SCALE reins in Health/
// Attack/Defense's growth to be in the same ballpark as a player's own
// per-level growth (background growth rates are ~0.2-0.8 per stat per
// level; RarityWeight alone was 1-5 per level, before this).
const CREATURE_GROWTH_SCALE = 0.2;
// Accuracy/Agility/Speed deliberately DON'T scale off RarityWeight or
// Danger Class at all — they feed threshold-y, near-binary combat math
// (hit chance clamps at 10%/90%; Speed decides who acts first outright)
// where a modest numeric edge swings outcomes far more than the same-sized
// edge in Health/Attack/Defense, which just shifts damage/HP pools
// smoothly. A Unique World Boss should hit far harder and tank far more
// than a Common Normal creature — but not ALSO be several times more
// accurate/evasive/fast, or it becomes nearly unhittable and always acts
// first regardless of the player's own level. Instead they grow at a flat
// per-level rate (SECONDARY_STAT_GROWTH_PER_LEVEL) calibrated to roughly
// match a player's own average Accuracy/Agility/Speed growth (background
// growth rates are ~0.2-0.6 per stat per level) — Archetype is what
// differentiates them instead (a Skirmisher IS supposed to be quicker and
// more evasive than a Tank, at any rarity or danger class).
const SECONDARY_STAT_GROWTH_PER_LEVEL = 0.4;
function computeCreatureStats(creature, level) {
  const rarityWeight = spawnRarityWeight(creature.spawnRarity);
  const dangerMult = dangerClassMultiplier(creature.dangerClass);
  const levels = Math.max(0, level - 1);
  const growth = levels * rarityWeight * CREATURE_GROWTH_SCALE;
  const secondaryGrowth = levels * SECONDARY_STAT_GROWTH_PER_LEVEL;
  const scale = (base, statKey, floor, secondary) => {
    const g = secondary ? secondaryGrowth : growth;
    const d = secondary ? 1 : dangerMult;
    return Math.max(floor, Math.round((((base || 0) + g) * archetypeMultiplier(statKey, creature.archetype)) * d));
  };
  return {
    hp: scale(creature.hp, "health", 1, false),
    atk: scale(creature.atk, "attack", 0, false),
    def: scale(creature.def, "defense", 0, false),
    spd: scale(creature.spd, "speed", 0, true),
    acc: scale(creature.acc, "accuracy", 0, true),
    agi: scale(creature.agi, "agility", 0, true),
  };
}
