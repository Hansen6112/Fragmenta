/*
 * FRAGMENTA — Schematics (any-Class crafting)
 * No Knowledge-automatic tier, unlike recipes.js — every entry requires an
 * acquired schematic document in state.knownSchematics (see
 * engine/crafting.js's findSchematic and the `learn` command in
 * engine/parser.js for how a document gets there).
 *
 * Test-sample entry only, to verify the craft/learn plumbing end to end —
 * real schematic authoring is a separate, parallel pass.
 */
const SCHEMATICS = {
  reinforced_field_kit: {
    name: "Reinforced Field Kit",
    requiresSchematic: "field_kit_schematic",
    materials: ["a fragment of refined ore", "a strip of salvaged binding"],
    output: "a reinforced field kit",
  },
};
