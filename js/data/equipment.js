/*
 * FRAGMENTA — Equipment Slots
 * Items are plain descriptive strings (see data/backgrounds.js, data/jobs.js
 * loot) with no structured "type" field, so which slot an item belongs to
 * is inferred from keywords in its name (inferEquipSlot) rather than looked
 * up. Items that match no slot's keywords (rations, a waterskin, a field
 * journal, a raw ingot...) simply aren't equippable — they stay
 * inventory-only, which is intentional: not everything you carry is gear.
 */

const EQUIP_SLOTS = ["mainhand", "offhand", "helmet", "chest", "gloves", "boots", "rings", "necklace", "cloak", "trinkets"];

const EQUIP_SLOT_LABELS = {
  mainhand: "Main Hand",
  offhand: "Off Hand",
  helmet: "Helmet",
  chest: "Chest",
  gloves: "Gloves",
  boots: "Boots",
  rings: "Rings",
  necklace: "Necklace",
  cloak: "Cloak",
  trinkets: "Trinkets",
};

// Every slot holds exactly one item except Trinkets, which holds two.
const EQUIP_SLOT_CAPACITY = {
  mainhand: 1, offhand: 1, helmet: 1, chest: 1, gloves: 1,
  boots: 1, rings: 1, necklace: 1, cloak: 1, trinkets: 2,
};

const EQUIP_SLOT_KEYWORDS = {
  mainhand: ["sword", "blade", "axe", "bow", "dagger", "staff", "wand", "spear", "mace", "hammer"],
  offhand: ["shield", "quiver", "buckler"],
  helmet: ["helm", "helmet", "hood", "circlet", "crown"],
  chest: ["robe", "leathers", "armor", "breastplate", "chestplate", "tunic", "vest"],
  gloves: ["gloves", "gauntlets", "bracers"],
  boots: ["boots", "greaves", "sandals"],
  rings: ["ring", "band"],
  necklace: ["necklace", "amulet", "pendant"],
  cloak: ["cloak", "cape", "mantle"],
  trinkets: ["token", "stone", "conduit", "chit", "seal", "shard", "charm", "trinket", "relic", "gem", "diamond", "coin"],
};

// Returns which slot `itemName` belongs in, or null if it isn't equippable
// gear at all (food, quest items, crafting materials...). Whole-word
// matching so "hooded ... cloak" matches cloak's "cloak" keyword and not
// helmet's "hood" (word boundaries don't fire inside "hooded").
function inferEquipSlot(itemName) {
  const name = itemName.toLowerCase();
  for (const slot of EQUIP_SLOTS) {
    const keywords = EQUIP_SLOT_KEYWORDS[slot];
    if (keywords.some((k) => new RegExp(`\\b${k}\\b`, "i").test(name))) return slot;
  }
  return null;
}

function emptyEquipment() {
  const eq = {};
  for (const slot of EQUIP_SLOTS) eq[slot] = slot === "trinkets" ? [] : null;
  return eq;
}
