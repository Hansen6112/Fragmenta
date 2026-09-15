/*
 * FRAGMENTA — Dungeon Delve
 * Difficulty tables, trap types, and procedural floor/room generation.
 * State-machine logic (entering, resolving a room, retreating, resting)
 * lives in engine/dungeon.js — this file is pure data + generation, same
 * split as data/jobs.js (tables + pickHuntTarget) vs engine/jobs.js.
 *
 * Structural questions are all resolved (spec v0.6); several NUMBERS
 * below are first-pass judgment calls, not given by the spec, called out
 * inline where they are. Expect a follow-up balance pass once this has
 * been played, same as Fortify's own scaling formula, the crafting
 * recipes' materials, and everything else that's gone through more than
 * one round in this project.
 */

const DUNGEON_FLOORS_BY_DIFFICULTY = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 }; // difficulty + 1

const DUNGEON_ROOM_BRACKET = {
  1: { min: 3, max: 5 },
  2: { min: 4, max: 8 },
  3: { min: 5, max: 11 },
  4: { min: 6, max: 14 },
  5: { min: 7, max: 17 },
};

// Mirrors FATIGUE_TIERS' 3-tier shape (engine/state.js) exactly — same
// most-severe-first ordering, same {minX, mult} shape — but deliberately
// milder at every step (FATIGUE_TIERS: 0.9/0.8/0.5 at 1/2/3 days without
// sleep) since a dungeon debuff stacks ON TOP of any real-world fatigue
// already active, rather than replacing it; hitting a character with two
// full-strength penalties for the same underlying "you're worn out" idea
// would compound harder than either was designed for on its own.
//
// Torches burn continuously (torchHoursRemaining ticks down every room/
// rest, regardless of room type — see engine/dungeon.js) — tiers key off
// hours spent AFTER torches ran out, same small-integer shape as
// FATIGUE_TIERS' day count, just in the unit this resource actually
// tracks. Hits Accuracy/Agility (can't see well enough to fight sharp).
const TORCHLESS_TIERS = [
  { minHoursWithout: 3, id: "pitch_dark", label: "Pitch Dark", mult: { accuracy: 0.75, agility: 0.75 } },
  { minHoursWithout: 2, id: "poor_visibility", label: "Poor Visibility", mult: { accuracy: 0.85, agility: 0.85 } },
  { minHoursWithout: 1, id: "dim", label: "Dim", mult: { accuracy: 0.95, agility: 0.95 } },
];

// Rations are tracked in FLOORS, not hours (a floor without a ration
// spent increments state.activeDungeon.floorsSinceRation — see engine/
// dungeon.js) — a coarser unit than torch-hours, but the right one for
// what rations actually measure, and it resolves the floors-vs-hours
// naming mismatch flagged during the handoff review. Hits Attack/Defense
// (too hungry to hit hard or hold a guard).
const RATIONLESS_TIERS = [
  { minFloorsWithout: 3, id: "starving", label: "Starving", mult: { atk: 0.7, def: 0.7 } },
  { minFloorsWithout: 2, id: "hungry", label: "Hungry", mult: { atk: 0.85, def: 0.85 } },
  { minFloorsWithout: 1, id: "peckish", label: "Peckish", mult: { atk: 0.95, def: 0.95 } },
];

// difficulty -> how far a dungeon's danger ceiling escalates while a
// torch/ration debuff is active — proposed as +1 effective difficulty
// per active debuff tier (torchless and rationless independently, so
// both at once is +2), capped so it can never exceed 5. Not given by the
// spec beyond "escalates" — first-pass, flagged, same as everything else
// in this section.
const DUNGEON_ESCALATION_CAP = 5;

// stat/failDamagePct/failStatus are all first-pass content, not given by
// the spec beyond "a stat roll" and "failStatus values are TBD" — a
// deliberate spread rather than every type doing the same thing: physical
// traps hurt you outright, puzzle traps waste your time/composure but
// never draw blood, environmental traps do a little of both. failStatus
// is left as flavor text only in this pass (no mechanical hook into
// combat.playerStatuses) — wiring a trap's status into whatever fight
// comes next is exactly the "trap flavor/status content" the handoff
// scoped out of this build.
const TRAP_TYPES = {
  physical: { stat: "agility", failDamagePct: 0.15, failStatus: null },
  puzzle: { stat: "knowledge", failDamagePct: 0, failStatus: "shaken confidence" },
  environmental: { stat: "def", failDamagePct: 0.1, failStatus: "coughing fit" },
};

// First-pass formula, not specified in the spec beyond "a stat roll" —
// mirrors trackSuccessChance's shape from hunt/track (data/jobs.js): a
// base chance that gets harder with dungeon difficulty, nudged by a
// relevant stat, clamped so nothing is ever a lock or a lost cause.
function trapSuccessChance(trapType, difficulty, state) {
  const baseChance = 0.6 - (difficulty - 1) * 0.05;
  const statValue = state[TRAP_TYPES[trapType].stat] ?? 0;
  const statBonus = statValue * 0.01;
  return Math.max(0.15, Math.min(0.9, baseChance + statBonus));
}

// Mirrors pickHuntTarget(tags, nation, difficulty) in data/jobs.js
// exactly — same ceiling table, same fallback chain. A dungeon Combat
// room just calls this instead of inventing separate creature-selection
// logic. effectiveDifficulty is the dungeon's base difficulty plus any
// escalation from torch/ration debuffs — this function doesn't know the
// difference between a fresh room and a repopulated one; the caller
// (engine/dungeon.js) passes whatever difficulty number is correct.
function pickDungeonCombatTarget(tags, nation, effectiveDifficulty) {
  const base = creaturesForTags(tags, nation);
  const ceiling = HUNT_TARGET_DANGER_CEILING[effectiveDifficulty] ?? DANGER_CLASS_RANK.world_boss;
  const byDifficulty = base.filter(
    (id) => meetsBountyRequirement(BESTIARY[id], effectiveDifficulty) && dangerClassRank(BESTIARY[id]) <= ceiling
  );
  let pool = byDifficulty.length ? byDifficulty : base;
  if (!pool.length) pool = creaturesForTags(["continental"], nation);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Reusable by both the entry-disclosure text and (later, deferred)
// job-board listings — a torch lasts 6 hours, a room/rest tick costs 30
// minutes at worst case (the bracket's own max room count), so this is
// "how many torches to clear the whole floor without ever going dark."
function recommendedSupplies(difficulty) {
  const floors = DUNGEON_FLOORS_BY_DIFFICULTY[difficulty];
  const bracket = DUNGEON_ROOM_BRACKET[difficulty];
  const worstCaseMinutes = floors * bracket.max * 30;
  return {
    torches: Math.ceil(worstCaseMinutes / 60 / 6),
    rations: floors,
  };
}

// Room-type weighting isn't specified anywhere in the spec — first-pass,
// flagged: a roughly even split between Combat/Trap/Loot, Rest
// deliberately rarer so it stays a genuine breather rather than a
// coinflip you might never see.
const ROOM_TYPE_WEIGHTS = { combat: 0.38, trap: 0.28, loot: 0.24, rest: 0.1 };

function rollRoomType() {
  const roll = Math.random();
  let acc = 0;
  for (const [type, weight] of Object.entries(ROOM_TYPE_WEIGHTS)) {
    acc += weight;
    if (roll < acc) return type;
  }
  return "loot";
}

// Builds one room of the rolled type, filling in whatever that type
// needs to resolve later (engine/dungeon.js's resolveCurrentRoom) —
// Combat picks its target now (same moment pickHuntTarget's callers
// already commit to a creature) rather than at resolution time, so
// "what's in this room" is fixed the instant it's generated, not
// re-rolled if the player leaves and comes back.
function rollRoom(difficulty, tags, nation) {
  const type = rollRoomType();
  const room = { type, cleared: false };
  if (type === "combat") room.creatureId = pickDungeonCombatTarget(tags, nation, difficulty);
  if (type === "trap") room.trapType = Object.keys(TRAP_TYPES)[Math.floor(Math.random() * Object.keys(TRAP_TYPES).length)];
  return room;
}

// Generation, at entry. Guarantees at least one Rest room in the back
// half of any floor with 6+ rooms (ROOM_TYPE_WEIGHTS' 10% alone could
// otherwise leave a long floor with zero of them by bad luck) — first-
// pass judgment call, not specified by the spec, flagged same as the
// weights themselves.
function generateDungeon(difficulty, tags, nation) {
  const floorCount = DUNGEON_FLOORS_BY_DIFFICULTY[difficulty];
  const bracket = DUNGEON_ROOM_BRACKET[difficulty];
  const floors = [];
  for (let f = 0; f < floorCount; f++) {
    const roomCount = bracket.min + Math.floor(Math.random() * (bracket.max - bracket.min + 1));
    const rooms = [];
    for (let r = 0; r < roomCount - 1; r++) {
      rooms.push(rollRoom(difficulty, tags, nation));
    }
    if (roomCount >= 6 && !rooms.some((room) => room.type === "rest")) {
      const backHalfStart = Math.floor(rooms.length / 2);
      const idx = backHalfStart + Math.floor(Math.random() * (rooms.length - backHalfStart));
      rooms[idx] = { type: "rest", cleared: false };
    }
    rooms.push({ type: "exit", cleared: false });
    floors.push({ rooms });
  }
  return floors;
}
