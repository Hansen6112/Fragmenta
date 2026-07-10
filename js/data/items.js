/*
 * FRAGMENTA — Item Definitions
 * Items stay plain description strings everywhere (inventory, equipment,
 * background kits, job loot) — this is a lookup table layered on top,
 * keyed by that same string, giving a subset of them a slot + stat
 * bonuses. Anything not listed here (rations, a waterskin, a field
 * journal, a raw ingot...) simply isn't gear: cmdEquip falls back to
 * data/equipment.js's keyword-based inferEquipSlot for anything unlisted,
 * and equipmentBonus() only ever sums bonuses for items that ARE listed,
 * so an unregistered item can still occupy a slot (via inference) but
 * contributes nothing mechanically until it's added here.
 *
 * tier (1-5) sets both the flavor rarity name and the bonus magnitude
 * (ITEM_TIER_BONUS is a reference table for authoring new items by hand —
 * nothing computes off it automatically, since a couple of items below
 * intentionally split a tier's budget across two stats). Slot placement
 * is NOT restricted by stat — a chest piece granting Magic (a mage's
 * robe) or a ring granting Knowledge (a signet) is deliberate, not a bug.
 *
 * Tier 5 (Legendary, +8) is never handed out by the random job-board loot
 * tables (data/jobs.js LOOT_BY_TIER caps its actual registered bonus at
 * Masterwork even for its "tier 5" flavor-text pool) — it's reserved for
 * two hand-authored guild-contract capstone rewards (the difficulty-5
 * Mugamiir Safor and Magma-Hearth contracts), so it stays rare and
 * story-tied rather than a normal drop.
 */

const ITEM_RARITY_NAMES = { 1: "Common", 2: "Fine", 3: "Superior", 4: "Masterwork", 5: "Legendary" };
const ITEM_TIER_BONUS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 8 };
const STAT_LABELS = { atk: "Attack", def: "Defense", health: "Health", magic: "Magic", knowledge: "Knowledge" };

const ITEM_DEFS = {
  // ---- starting kits (data/backgrounds.js) ----
  "a short sword": { slot: "mainhand", tier: 1, bonuses: { atk: 1 } },
  "a legion-issue shield": { slot: "offhand", tier: 1, bonuses: { def: 1 } },
  "a curved desert blade": { slot: "mainhand", tier: 1, bonuses: { atk: 1 } },
  "a contract chit from the Mugamiir Safor": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 } },
  "a novitiate's plain robe": { slot: "chest", tier: 1, bonuses: { magic: 1 } },
  "a Kabal registration token": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 } },
  "an unbonded conduit stone": { slot: "trinkets", tier: 1, bonuses: { magic: 1 } },
  "a stolen, half-bonded conduit": { slot: "trinkets", tier: 1, bonuses: { magic: 1 } },
  "a hooded traveler's cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 } },
  "a hunting bow": { slot: "mainhand", tier: 1, bonuses: { atk: 1 } },
  "a quiver of arrows": { slot: "offhand", tier: 1, bonuses: { atk: 1 } },
  "forest-worn boots": { slot: "boots", tier: 1, bonuses: { def: 1 } },
  "a dwarven hand-axe": { slot: "mainhand", tier: 1, bonuses: { atk: 1 } },
  "ash-worn leathers": { slot: "chest", tier: 1, bonuses: { def: 1 } },
  "a clan token": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 } },

  // ---- job board random loot (data/jobs.js LOOT_BY_TIER) ----
  "a well-oiled dagger": { slot: "mainhand", tier: 2, bonuses: { atk: 2 } },
  "a finely made traveler's cloak": { slot: "cloak", tier: 3, bonuses: { def: 3 } },
  "a well-balanced hand-axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 } },
  "an engraved signet of no house you recognize": { slot: "rings", tier: 4, bonuses: { knowledge: 4 } },
  "a relic fragment of uncertain origin": { slot: "trinkets", tier: 4, bonuses: { magic: 4 } },
  "an item that hums faintly and makes you uneasy to carry": { slot: "trinkets", tier: 4, bonuses: { magic: 4 } },
  "a shard of something that was clearly never meant to be found": { slot: "trinkets", tier: 4, bonuses: { magic: 4 } },

  // ---- guild contract rewards (data/jobs.js GUILD_CONTRACTS) ----
  "a guild courier's seal — recognized at any Mugamiir Safor waypoint": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 } },
  "a guild token stamped with the Magma-Hearth sigil": { slot: "trinkets", tier: 3, bonuses: { atk: 3 } },
  // Legendary capstones — the only tier-5 items in the game, each tied to
  // that guild's hardest (difficulty 5) contract.
  "a shard of hardened amethyst, warm to the touch for reasons no one at the guild will discuss": { slot: "trinkets", tier: 5, bonuses: { magic: 8 } },
  "an uncut diamond, still rough from the tail plating": { slot: "trinkets", tier: 5, bonuses: { health: 8 } },
};

function getItemDef(itemName) {
  return ITEM_DEFS[itemName] || null;
}

function itemRarityName(tier) {
  return ITEM_RARITY_NAMES[tier] || "Common";
}

// e.g. "Common, +1 Attack" — used to annotate equip/unequip messages and
// the equipment tab; "" for anything with no registry entry (equippable
// via inference alone, but mechanically inert until authored here).
function formatItemBonuses(item) {
  const def = getItemDef(item);
  if (!def) return "";
  const parts = Object.entries(def.bonuses).map(([k, v]) => `+${v} ${STAT_LABELS[k] || k}`);
  return parts.length ? `${itemRarityName(def.tier)}, ${parts.join(", ")}` : itemRarityName(def.tier);
}

function formatItemLine(item) {
  const bonusText = formatItemBonuses(item);
  return bonusText ? `${item} (${bonusText})` : item;
}

// Sums every equipped item's bonus to a given stat (atk/def/health/magic/
// knowledge). Unlisted items contribute 0 — see file header.
function equipmentBonus(state, statKey) {
  let total = 0;
  for (const slot of EQUIP_SLOTS) {
    const items = slot === "trinkets" ? state.equipment.trinkets : (state.equipment[slot] ? [state.equipment[slot]] : []);
    for (const item of items) {
      const def = ITEM_DEFS[item];
      if (def && def.bonuses && def.bonuses[statKey]) total += def.bonuses[statKey];
    }
  }
  return total;
}
