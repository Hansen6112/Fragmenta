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
 * nothing computes off it automatically). Slot placement is NOT restricted
 * by stat — a chest piece granting Magic (a mage's robe) or a ring
 * granting Knowledge (a signet) is deliberate, not a bug.
 *
 * `source` says where an item can be acquired, and gates which pool(s) it
 * shows up in — it's what keeps "a short sword" (a background's starting
 * kit) from raining out of a dead Stoneback Beetle, and keeps a guild's
 * capstone reward from also turning up as random loot:
 *   - "starter"  — background starting kits only, never dropped
 *   - "job"      — data/jobs.js LOOT_BY_TIER only, never dropped by combat
 *   - "contract" — a specific hand-authored guild contract, one-off
 *   - "monster"  — the general random combat-kill loot table (see
 *                  COMBAT_LOOT_POOL / rollCreatureLoot below)
 *
 * Tier 5 (Legendary, +8) is never in the "monster" or "job" pools — it's
 * reserved for two hand-authored guild-contract capstone rewards (the
 * difficulty-5 Mugamiir Safor and Magma-Hearth contracts), so it stays
 * rare and story-tied rather than a normal drop.
 *
 * An entry may also carry an `effects: [...]` array of ids from
 * data/effects.js — a separate, non-tier-scaled layer of fixed-magnitude
 * behavioral traits (see that file). None of the items below use it yet;
 * it's plumbed through equipmentBonus's sibling, hasEffect(), and ready
 * for whichever items get authored with one.
 */

const ITEM_RARITY_NAMES = { 1: "Common", 2: "Fine", 3: "Superior", 4: "Masterwork", 5: "Legendary" };
const ITEM_TIER_BONUS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 8 };
const STAT_LABELS = { atk: "Attack", def: "Defense", health: "Health", magic: "Magic", knowledge: "Knowledge" };

const ITEM_DEFS = {
  // ---- starting kits (data/backgrounds.js) ----
  "a short sword": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "starter" },
  "a legion-issue shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "starter" },
  "a curved desert blade": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "starter" },
  "a contract chit from the Mugamiir Safor": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "starter" },
  "a novitiate's plain robe": { slot: "chest", tier: 1, bonuses: { magic: 1 }, source: "starter" },
  "a Kabal registration token": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "starter" },
  "an unbonded conduit stone": { slot: "trinkets", tier: 1, bonuses: { magic: 1 }, source: "starter" },
  "a stolen, half-bonded conduit": { slot: "trinkets", tier: 1, bonuses: { magic: 1 }, source: "starter" },
  "a hooded traveler's cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "starter" },
  "a hunting bow": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "starter" },
  "a quiver of arrows": { slot: "offhand", tier: 1, bonuses: { atk: 1 }, source: "starter" },
  "forest-worn boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "starter" },
  "a dwarven hand-axe": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "starter" },
  "ash-worn leathers": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "starter" },
  "a clan token": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "starter" },

  // ---- job board random loot (data/jobs.js LOOT_BY_TIER) ----
  "a well-oiled dagger": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, source: "job" },
  "a finely made traveler's cloak": { slot: "cloak", tier: 3, bonuses: { def: 3 }, source: "job" },
  "a well-balanced hand-axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, source: "job" },
  "an engraved signet of no house you recognize": { slot: "rings", tier: 4, bonuses: { knowledge: 4 }, source: "job" },
  "a relic fragment of uncertain origin": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, source: "job" },
  "an item that hums faintly and makes you uneasy to carry": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, source: "job" },
  "a shard of something that was clearly never meant to be found": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, source: "job" },

  // ---- guild contract rewards (data/jobs.js GUILD_CONTRACTS) ----
  "a guild courier's seal — recognized at any Mugamiir Safor waypoint": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, source: "contract" },
  "a guild token stamped with the Magma-Hearth sigil": { slot: "trinkets", tier: 3, bonuses: { atk: 3 }, source: "contract" },
  // Legendary capstones — the only tier-5 items in the game, each tied to
  // that guild's hardest (difficulty 5) contract.
  "a shard of hardened amethyst, warm to the touch for reasons no one at the guild will discuss": { slot: "trinkets", tier: 5, bonuses: { magic: 8 }, source: "contract" },
  "an uncut diamond, still rough from the tail plating": { slot: "trinkets", tier: 5, bonuses: { health: 8 }, source: "contract" },

  // ---- general combat loot (source: "monster") ----
  // Tiers 1-4 only (Common through Masterwork) — drawn from creature
  // kills via rollCreatureLoot, scaled to the creature's own tier. Flavor
  // draws loosely on the nation whose territory/culture the item fits,
  // but nothing here is nation-locked; any of it can turn up anywhere.

  // Main Hand
  "a nicked legion gladius": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a sahrimor trade dagger": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a well-balanced arming sword": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, source: "monster" },
  "a dwarven mining pick, honed for war": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, source: "monster" },
  "a lizardfolk bone-spear": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, source: "monster" },
  "an ash-tempered war-axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, source: "monster" },
  "a Kabal-forged conduit blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Off Hand
  "a battered wooden buckler": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a cracked leather targe": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a reinforced legion scutum": { slot: "offhand", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a dwarven ironclad buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Vaeloris bark-shield, still faintly alive": { slot: "offhand", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a sahrimori sun-round shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a drake-scale kite shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, source: "monster" },

  // Helmet
  "a dented iron skullcap": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a woven desert shemagh": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion centurion's helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a lizardfolk bone-crest helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "an ash-forged war helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a mist-silver circlet": { slot: "helmet", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a Kabal conduit-crowned helm": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Chest
  "a patchwork leather vest": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a sun-bleached desert wrap": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion breastplate, dented but sound": { slot: "chest", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a scaled lizardfolk hide vest": { slot: "chest", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "an ash-tempered chestplate": { slot: "chest", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a mist-veil robe, cool to the touch": { slot: "chest", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a drake-scale cuirass": { slot: "chest", tier: 4, bonuses: { def: 4 }, source: "monster" },

  // Gloves
  "worn leather gloves": { slot: "gloves", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a pair of desert wrap-cloths": { slot: "gloves", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "reinforced legion vambraces": { slot: "gloves", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "dwarven forge-gauntlets": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, source: "monster" },
  "lizardfolk claw-guards": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, source: "monster" },
  "ash-runed gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "conduit-threaded gloves, warm to the touch": { slot: "gloves", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Boots
  "worn traveler's boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "sand-worn desert sandals": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "legion march boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "dwarven ironclad boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "canopy-runner boots, silent on any leaf": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, source: "monster" },
  "ash-forged greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "mist-step boots, quiet as fog": { slot: "boots", tier: 4, bonuses: { def: 4 }, source: "monster" },

  // Rings
  "a plain copper band": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a chipped clay signet": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a merchant's brass seal-ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a legion officer's ring": { slot: "rings", tier: 2, bonuses: { atk: 2 }, source: "monster" },
  "a Kabal apprentice's warded ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a lizardfolk bone ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a conduit-set ring, faintly humming": { slot: "rings", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Necklace
  "a simple beaded necklace": { slot: "necklace", tier: 1, bonuses: { magic: 1 }, source: "monster" },
  "a strung-shell choker": { slot: "necklace", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a merchant's coin necklace": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a dwarven clan-chain": { slot: "necklace", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Kabal novitiate's warded pendant": { slot: "necklace", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a drake-tooth necklace": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, source: "monster" },
  "an amethyst conduit pendant": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Cloak
  "a patched wool cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a sun-faded desert mantle": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion field cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a dwarven ash-cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Vaeloris leaf-cloak, near invisible in the canopy": { slot: "cloak", tier: 3, bonuses: { knowledge: 3 }, source: "monster" },
  "a mist-touched traveling cloak": { slot: "cloak", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a drakeskin cloak, warm against any cold": { slot: "cloak", tier: 4, bonuses: { def: 4 }, source: "monster" },

  // Trinkets
  "a lucky river stone": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a carved wooden charm": { slot: "trinkets", tier: 1, bonuses: { health: 1 }, source: "monster" },
  "a merchant's lucky coin": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a dwarven luck-rune": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Kabal-blessed focus stone": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a lizardfolk totem charm": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, source: "monster" },
  "a fragment of warded glass, humming faintly": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, source: "monster" },
};

// Derived at load time: every "monster"-sourced item, grouped by tier, for
// rollCreatureLoot to draw from. Only tiers 1-4 exist here — see file
// header on why Legendary never enters this pool.
const COMBAT_LOOT_POOL = {};
for (const [name, def] of Object.entries(ITEM_DEFS)) {
  if (def.source !== "monster") continue;
  if (!COMBAT_LOOT_POOL[def.tier]) COMBAT_LOOT_POOL[def.tier] = [];
  COMBAT_LOOT_POOL[def.tier].push(name);
}

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

// Whether/what a defeated creature drops, scaled to its own tier (bestiary
// tiers run 0-5; clamped to 1-4 so nothing above Masterwork ever drops
// from a normal kill — see file header on Legendary). Chance climbs with
// danger: 16% at tier 1 up to 40% at tier 4.
function rollCreatureLoot(creature) {
  const tier = Math.max(1, Math.min(4, creature.tier || 1));
  const pool = COMBAT_LOOT_POOL[tier];
  if (!pool || !pool.length) return null;
  const dropChance = 0.08 + tier * 0.08;
  if (Math.random() >= dropChance) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
