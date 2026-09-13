/*
 * FRAGMENTA — Recipes (Apothecary crafting)
 * Two unlock shapes: `knowledgeReq` (automatic once state.knowledge crosses
 * it) or `requiresRecipe` (a document-item key that must be in
 * state.knownRecipes — see engine/crafting.js's findRecipe and the
 * `learn` command in engine/parser.js for how a document gets there).
 * Apothecary-only, gated in parser.js's cmdCraft, not here — findRecipe
 * itself only checks the unlock condition, not the player's Class.
 *
 * Test-sample entries only, to verify the craft/learn plumbing end to
 * end — real recipe authoring (materials sourced from actual gathering/
 * dismantle output, balanced Knowledge thresholds) is a separate,
 * parallel pass.
 */
const RECIPES = {
  minor_fortifying_draught: {
    name: "Minor Fortifying Draught",
    knowledgeReq: 6,
    materials: ["a handful of scrap components", "a sprig of swamp nightroot"],
    output: "a minor fortifying draught",
  },
  reinforced_tonic: {
    name: "Reinforced Tonic",
    requiresRecipe: "reinforced_tonic_recipe",
    materials: ["a fragment of refined ore", "a jar of preserved swamp herbs"],
    output: "a reinforced tonic",
  },
};
