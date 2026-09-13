/*
 * FRAGMENTA — Schematics (any-Class crafting)
 * No Knowledge-automatic tier, unlike recipes.js — every entry requires an
 * acquired schematic document in state.knownSchematics (see
 * engine/crafting.js's findSchematic and the `learn` command in
 * engine/parser.js for how a document gets there).
 *
 * Test-sample entries only — real schematic authoring is a separate,
 * parallel pass. Two entries specifically to prove the Class gate is
 * per-registry, not global: SCHEMATICS carries no Class restriction at
 * all (unlike RECIPES, Apothecary-gated in parser.js's cmdCraft), so any
 * class should be able to craft either one once learned.
 */
const SCHEMATICS = {
  reinforced_field_kit: {
    name: "Reinforced Field Kit",
    requiresSchematic: "field_kit_schematic",
    materials: ["a fragment of refined ore", "a strip of salvaged binding"],
    output: "a reinforced field kit",
  },

  sharpened_trail_kit: {
    name: "Sharpened Trail Kit",
    requiresSchematic: "trail_kit_schematic",
    materials: ["a handful of scrap components", "a sprig of swamp nightroot"],
    output: "a sharpened trail kit",
  },
};
