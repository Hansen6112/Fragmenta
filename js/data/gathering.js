/*
 * FRAGMENTA — Gathering
 * Terrain-keyed raw materials the 'gather' command (engine/parser.js's
 * cmdGather) can turn up at the player's current location — a crafting-
 * materials counterpart to world.js's TERRAIN_TAGS (same terrain keys,
 * different purpose: encounter flavor there, craftable loot here).
 *
 * Each entry is a list, not a single item, so a terrain with more than
 * one option picks randomly among them — only "swamp" is populated for
 * now (test-sample content, not the full terrain roster); an empty/
 * missing terrain just means nothing to gather there yet.
 */
const GATHERABLE_BY_TERRAIN = {
  swamp: ["a sprig of swamp nightroot"],
};
