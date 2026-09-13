/*
 * FRAGMENTA — Crafting
 * Wires up data/recipes.js (Apothecary-only, Knowledge-automatic or
 * document-gated) and data/schematics.js (any Class, document-gated only)
 * into an actual craft economy, mirroring engine/shop.js's own role as a
 * plain lookup/verb-support module for parser.js's commands (cmdCraft,
 * cmdLearn) rather than a command handler itself.
 */

// Case-insensitive substring match against a RECIPES entry's display name,
// same fuzzy-match convention as cmdEquip/cmdDrop/cmdDismantle — but
// unlike those, a match here still isn't returned unless its unlock
// condition is actually met, so an as-yet-unknown recipe never partially
// resolves just because its name happens to match.
function findRecipe(needle, state) {
  const key = Object.keys(RECIPES).find((k) =>
    RECIPES[k].name.toLowerCase().includes(needle.toLowerCase())
  );
  if (!key) return null;
  const r = RECIPES[key];
  const unlocked = r.knowledgeReq
    ? state.knowledge >= r.knowledgeReq
    : state.knownRecipes.has(r.requiresRecipe);
  return unlocked ? r : null;
}

// Same shape as findRecipe, but SCHEMATICS has no Knowledge-automatic
// tier — every entry requires state.knownSchematics regardless of stats.
function findSchematic(needle, state) {
  const key = Object.keys(SCHEMATICS).find((k) =>
    SCHEMATICS[k].name.toLowerCase().includes(needle.toLowerCase())
  );
  if (!key) return null;
  const s = SCHEMATICS[key];
  return state.knownSchematics.has(s.requiresSchematic) ? s : null;
}

// Which of a recipe/schematic's `materials` the player's inventory is
// missing — exact-string membership, not cmdDismantle's fuzzy .includes():
// these are the resolved material-name strings a recipe/schematic entry
// itself declares (e.g. dismantle-fallback output like "a handful of
// scrap components"), never raw player-typed text, so a specific string
// shouldn't loosely cross-match some unrelated future item that happens
// to share a word.
function missingMaterials(inventory, materials) {
  const pool = [...inventory];
  const missing = [];
  for (const mat of materials) {
    const idx = pool.findIndex((i) => i === mat);
    if (idx < 0) {
      missing.push(mat);
      continue;
    }
    pool.splice(idx, 1);
  }
  return missing;
}

function removeMaterials(inventory, materials) {
  for (const mat of materials) {
    const idx = inventory.findIndex((i) => i === mat);
    if (idx >= 0) inventory.splice(idx, 1);
  }
}

// Shared by cmdCraft's recipe and schematic branches — `verb` is just the
// flavor word ("brew" vs "craft") each branch already knows to use.
function craftFromEntry(state, entry, verb) {
  const missing = missingMaterials(state.inventory, entry.materials);
  if (missing.length) return [`You're missing: ${missing.join(", ")}.`];
  removeMaterials(state.inventory, entry.materials);
  state.inventory.push(entry.output);
  return [`You ${verb} ${formatItemLine(entry.output)}.`];
}

// A document item's ITEM_DEFS entry names the RECIPES/SCHEMATICS key it
// teaches via `teachesRecipe`/`teachesSchematic` (see data/items.js's "a
// reinforced tonic recipe"/"a field kit schematic") — this resolves a
// player-typed needle to that item, fuzzy-matched the same way cmdDrop/
// cmdDismantle match inventory by substring, since here the needle IS
// raw player-typed text naming an inventory item they're carrying.
function findLearnableDocument(needle, inventory) {
  const idx = inventory.findIndex((i) => {
    const def = getItemDef(i);
    return def && (def.teachesRecipe || def.teachesSchematic) && i.toLowerCase().includes(needle.toLowerCase());
  });
  if (idx < 0) return null;
  return { index: idx, item: inventory[idx], def: getItemDef(inventory[idx]) };
}
