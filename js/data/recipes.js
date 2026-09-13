/*
 * FRAGMENTA — Recipes (Apothecary crafting)
 * Two unlock shapes: `knowledgeReq` (automatic once state.knowledge crosses
 * it) or `requiresRecipe` (a document-item key that must be in
 * state.knownRecipes — see engine/crafting.js's findRecipe and the
 * `learn` command in engine/parser.js for how a document gets there).
 * Apothecary-only, gated in parser.js's cmdCraft, not here — findRecipe
 * itself only checks the unlock condition, not the player's Class.
 *
 * Test-sample entries only, deliberately varied to exercise both unlock
 * paths and a second Knowledge tier — real recipe authoring (materials
 * sourced from actual gathering/dismantle output, balanced Knowledge
 * thresholds) is a separate, parallel pass.
 */
const RECIPES = {
  // Knowledge-gated, automatic — the low-threshold, always-reachable path
  minor_fortifying_draught: {
    name: "Minor Fortifying Draught",
    knowledgeReq: 6,
    materials: ["a handful of scrap components", "a sprig of swamp nightroot"],
    output: "a minor fortifying draught",
  },

  // Knowledge-gated, automatic — a second rung, proves the tiering works
  clearwater_tonic: {
    name: "Clearwater Tonic",
    knowledgeReq: 12,
    materials: ["a vial of distilled ashroot", "a handful of scrap components"],
    output: "a clearwater tonic",
  },

  // Document-gated — proves the requiresRecipe path end to end (see "a
  // stained page of Kabal apothecary notes" in data/items.js, learned via
  // the 'learn' command)
  kabal_ward_elixir: {
    name: "Kabal-Ward Elixir",
    requiresRecipe: "kabal_ward_recipe",
    materials: ["a fragment of refined ore", "a sprig of swamp nightroot", "a vial of distilled ashroot"],
    output: "a kabal-ward elixir",
  },
};
