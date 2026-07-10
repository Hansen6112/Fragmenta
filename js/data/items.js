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
 *   - "shop"     — reserved for a future shop/buy-sell system. Tagged for
 *                  when that exists; not obtainable today.
 *   - "faction"  — reserved for a future reputation/faction-reward system.
 *                  Tagged for when that exists; not obtainable today.
 * "contract" items beyond the two Legendary capstones below are similarly
 * reserved (tagged for a future hand-authored contract) rather than
 * auto-attached to one of the existing six guild contracts, which already
 * have their own loot assigned.
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

const ITEM_RARITY_NAMES = { 1: "Common", 2: "Fine", 3: "Superior", 4: "Masterwork", 5: "Legendary", 6: "Mythic", 7: "Artifact", 8: "Divine Regalia" };
const ITEM_TIER_BONUS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 8, 6: 10, 7: 12, 8: 14 };
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
  "legion march boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "monster", set: "Legion", region: "sanguivorum" },
  "dwarven ironclad boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "canopy-runner boots, silent on any leaf": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, source: "monster" },
  "ash-forged greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "mist-step boots, quiet as fog": { slot: "boots", tier: 4, bonuses: { def: 4 }, source: "monster" },

  // Rings
  "a plain copper band": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a chipped clay signet": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a merchant's brass seal-ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a legion officer's ring": { slot: "rings", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
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
  "a legion field cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
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

  // ---- batch 2: weapons/armor with effects, across all slots and sources ----
  // Common-tier entries here carry no effect (flavor-only bonus, same as
  // batch 1) — effects start appearing at Fine and up.

  // Main Hand
  "a plainsman's utility blade": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a Sanguivorum infantry spear": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a Vaeloris hunting knife": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a Sahrimori caravan saber": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop", set: "Sahrimor" },
  "a Thraekor splitting axe": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a Norrvael boarding sword": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster", set: "Norrvael" },
  "a legion arming spear, weighted for formation fighting": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "job" },
  "an elven thornwood bow": { slot: "mainhand", tier: 2, bonuses: { atk: 1, knowledge: 1 }, effects: ["patient_aim"], source: "monster" },
  "a Kharzun canyon pick": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["armor_crack"], source: "contract" },
  "a desert duelist's shamshir": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "job" },
  "a Norrvael watchman's poleaxe": { slot: "mainhand", tier: 2, bonuses: { atk: 1, def: 1 }, effects: ["guarded_strike"], source: "monster" },
  "a lizardfolk marsh-hunting spear": { slot: "mainhand", tier: 2, bonuses: { atk: 1, knowledge: 1 }, effects: ["opening_reach"], source: "monster" },
  "a legion veteran's gladius": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "contract", set: "Legion" },
  "a Vaeloris heartwood longbow": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["patient_aim"], source: "job", set: "Vaeloris" },
  "an ash-weighted dwarven maul": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "monster" },
  "a Sahrimori serpent-blade": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "contract" },
  "a Norrvael storm-rider lance": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job" },
  "a swamp-forged bone billhook": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["hamstring"], source: "monster" },
  "a legion commander's spatha": { slot: "mainhand", tier: 4, bonuses: { atk: 3, knowledge: 1 }, effects: ["tactical_memory"], source: "contract" },
  "a black-ash executioner's axe": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "monster" },
  "a mistwood recurve bow strung with silver sinew": { slot: "mainhand", tier: 4, bonuses: { atk: 3, magic: 1 }, effects: ["patient_aim", "evasive_release"], source: "contract" },
  "a Kabal dueling focus shaped as a narrow blade": { slot: "mainhand", tier: 4, bonuses: { magic: 3, atk: 1 }, effects: ["conduit_ease"], source: "faction", set: "Kabal" },
  "a Thraekor forge-hammer bearing an intact clan mark": { slot: "mainhand", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["crushing_impact", "stalwart"], source: "contract", set: "Thraekor" },
  "a glass-edged saber from the Black Sands": { slot: "mainhand", tier: 4, bonuses: { atk: 3, magic: 1 }, effects: ["deep_cut", "unsettling"], source: "monster" },
  // Completes the Drake Hunter set (data/sets.js) — its other pieces
  // (cuirass/shield/necklace/cloak) are all flat-stat, no-effect
  // Masterwork drake gear too, so this matches that pattern.
  "a drakebone hunting bow, fletched with shed scale": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, source: "monster" },

  // Off Hand
  "a hide-covered round shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a legion recruit's rectangular shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a bundle of roughly fletched hunting arrows": { slot: "offhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a Sahrimori parrying dagger": { slot: "offhand", tier: 2, bonuses: { atk: 1, def: 1 }, effects: ["riposte"], source: "job" },
  "a Vaeloris woven-root buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "monster" },
  "a Norrvael steel-rimmed shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "monster", set: "Norrvael" },
  "a legion tower shield scarred by siege stones": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "contract" },
  "a blackwood quiver of broadhead arrows": { slot: "offhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster" },
  "a dwarven furnace shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "job", set: "Thraekor" },
  "a mist-lacquered Norrvael targe": { slot: "offhand", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["evasive_guard"], source: "monster" },
  "a Vaeloris living-root greatshield": { slot: "offhand", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "contract", set: "Vaeloris" },
  "a legion command scutum with a preserved standard-hook": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace", "tactical_memory"], source: "contract" },
  "a quiver of drakebone armor-piercing arrows": { slot: "offhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "monster" },
  "a Kabal ward-disc inscribed on both faces": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "faction", set: "Kabal" },

  // Helmet
  "a quilted travel coif": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a broad desert headwrap": { slot: "helmet", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a legion auxiliary helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "monster" },
  "a Vaeloris pathfinder's hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job", set: "Vaeloris" },
  "a dwarven quarry helm with cheek guards": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["concussion_guard"], source: "monster" },
  "a Norrvael mist-watch visor": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "contract", set: "Norrvael" },
  "a Sahrimori caravan master's veil": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", set: "Sahrimor" },
  "an ashglass-faced war helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", set: "Thraekor" },
  "a Kabal examiner's silver circlet": { slot: "helmet", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["conduit_ease"], source: "faction", set: "Kabal" },
  "a legion strategist's crested helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract" },
  "a Norrvael stormglass helm": { slot: "helmet", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "monster" },
  "a queen-carapace helm, faintly luminous": { slot: "helmet", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["corrosionproof"], source: "contract" },

  // Chest
  "a quilted legion gambeson": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a Vaeloris reed-woven vest": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a Sahrimori caravan coat": { slot: "chest", tier: 1, bonuses: { knowledge: 1 }, source: "shop", set: "Sahrimor" },
  "a lizardfolk scale jerkin": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["corrosionproof"], source: "monster" },
  "a legion officer's mail coat": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "job" },
  "a dwarven forge apron lined with rings": { slot: "chest", tier: 2, bonuses: { atk: 1, def: 1 }, effects: ["heatproof"], source: "monster" },
  "a Vaeloris ranger's leafweave coat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "contract", set: "Vaeloris" },
  "a Norrvael cliff-guard cuirass": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster", set: "Norrvael" },
  "a Sahrimori night-traveler's layered robe": { slot: "chest", tier: 3, bonuses: { knowledge: 2, def: 1 }, effects: ["surefooted"], source: "job" },
  "a Kabal field-investigator's coat": { slot: "chest", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "faction" },
  "a black-iron Thraekor lamellar coat": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["heatproof", "stalwart"], source: "contract", set: "Thraekor" },
  "a Vaeloris elderbark breastplate": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "monster" },
  "a Norrvael storm-rider harness": { slot: "chest", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["evasive_guard"], source: "contract" },
  "a Kabal river-thread vestment": { slot: "chest", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Kabal" },
  "a luminous queen-carapace cuirass": { slot: "chest", tier: 4, bonuses: { def: 3, magic: 1 }, effects: ["corrosionproof", "spell_ward"], source: "contract" },

  // Gloves
  "fingerless bowman's gloves": { slot: "gloves", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "padded laborer's gauntlets": { slot: "gloves", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion swordsman's bracers": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "job" },
  "a Sahrimori negotiator's silk gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job" },
  "Vaeloris climbing wraps": { slot: "gloves", tier: 2, bonuses: { def: 1, knowledge: 1 }, effects: ["surefooted"], source: "monster" },
  "Norrvael chain-backed gloves": { slot: "gloves", tier: 3, bonuses: { def: 2, atk: 1 }, effects: ["riposte"], source: "monster" },
  "Thraekor hammer-gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", set: "Thraekor" },
  "acid-cured lizardfolk handguards": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["corrosionproof"], source: "monster" },
  "Kabal gesture-thread gloves": { slot: "gloves", tier: 4, bonuses: { magic: 3, knowledge: 1 }, effects: ["conduit_ease"], source: "faction", set: "Kabal" },
  "legion duelist's articulated gauntlet": { slot: "gloves", tier: 4, bonuses: { atk: 3, def: 1 }, effects: ["riposte", "feinting_edge"], source: "contract" },
  "living-vine gloves that tighten over wounds": { slot: "gloves", tier: 4, bonuses: { def: 2, health: 2 }, effects: ["regrowth"], source: "monster", set: "Vaeloris" },
  "black-glass forge mitts": { slot: "gloves", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["heatproof", "crushing_impact"], source: "contract" },

  // Boots
  "hobnailed road boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "swamp-wrapped footguards": { slot: "boots", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "Sanguivorum courier boots": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job" },
  "Vaeloris root-grip boots": { slot: "boots", tier: 2, bonuses: { def: 1, knowledge: 1 }, effects: ["surefooted"], source: "monster" },
  "Sahrimori night-walking sandals": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["heatproof"], source: "shop", set: "Sahrimor" },
  "Norrvael cliff boots with iron toes": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster" },
  "Thraekor ash-strider greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "contract", set: "Thraekor" },
  "marsh-stalker's silent boots": { slot: "boots", tier: 3, bonuses: { knowledge: 2, atk: 1 }, effects: ["ambush_mastery"], source: "monster" },
  "legion relay boots bearing official seals": { slot: "boots", tier: 4, bonuses: { knowledge: 4 }, effects: ["trailwise", "ambush_sense"], source: "contract" },
  "Vaeloris shadowleaf boots": { slot: "boots", tier: 4, bonuses: { knowledge: 3, def: 1 }, effects: ["ambush_mastery"], source: "monster", set: "Vaeloris" },
  "Norrvael mist-crossing greaves": { slot: "boots", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["evasive_guard"], source: "contract", set: "Norrvael" },
  "boots made from pale drake hide": { slot: "boots", tier: 4, bonuses: { def: 3, atk: 1 }, effects: ["coldproof", "surefooted"], source: "monster" },

  // Rings
  "a stamped iron service ring": { slot: "rings", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a tiny bone ring carved with route marks": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a guild appraiser's brass loop": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job", set: "Sahrimor" },
  "a legion dueling ring": { slot: "rings", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "job" },
  "a Vaeloris seed-ring": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", set: "Vaeloris" },
  "a Thraekor oath-ring of black iron": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "contract", set: "Thraekor" },
  "a Norrvael stormglass ring": { slot: "rings", tier: 3, bonuses: { magic: 2, def: 1 }, effects: ["spell_ward"], source: "monster", set: "Norrvael" },
  "a Kabal tactical signet": { slot: "rings", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "faction" },
  "an acid-clouded ring cut from monster shell": { slot: "rings", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["corrosionproof"], source: "monster" },
  "a rotating Sahrimori contract-ring": { slot: "rings", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye", "trailwise"], source: "contract" },
  "a Kabal river-calibration ring": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "Kabal" },
  "a blood-dark legion champion's ring": { slot: "rings", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "monster" },

  // Necklace
  "an iron soldier's identification chain": { slot: "necklace", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a string of polished route stones": { slot: "necklace", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a Vaeloris herbalist's seed cord": { slot: "necklace", tier: 2, bonuses: { health: 1, knowledge: 1 }, effects: ["regrowth"], source: "job" },
  "a Sahrimori water-counter's pendant": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "contract", set: "Sahrimor" },
  "a dwarven forge-chain bearing a cooling rune": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", set: "Thraekor" },
  "a legion victory torc": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract" },
  "a Norrvael mist-pearl necklace": { slot: "necklace", tier: 3, bonuses: { magic: 2, def: 1 }, effects: ["evasive_guard"], source: "monster" },
  "a Kabal elemental calibration pendant": { slot: "necklace", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction" },
  "a living-heartwood torque": { slot: "necklace", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster", set: "Vaeloris" },
  "a storm-rider's drakebone gorget": { slot: "necklace", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["stalwart", "coldproof"], source: "contract" },
  "an eight-stone Kabal river necklace": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "Kabal" },
  "a black-glass execution chain": { slot: "necklace", tier: 4, bonuses: { atk: 3, magic: 1 }, effects: ["executioner", "unsettling"], source: "monster" },

  // Cloak
  "a waxed rain cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a reversible hunter's mantle": { slot: "cloak", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a legion scout's grey cloak": { slot: "cloak", tier: 2, bonuses: { def: 1, knowledge: 1 }, effects: ["ambush_sense"], source: "job" },
  "a Sahrimori sand-shedding mantle": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["heatproof"], source: "shop", set: "Sahrimor" },
  "a Vaeloris moss-lined cape": { slot: "cloak", tier: 2, bonuses: { health: 1, def: 1 }, effects: ["regrowth"], source: "monster" },
  "a Norrvael cliff-watch cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["coldproof"], source: "contract" },
  "a Thraekor ashfall mantle": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster" },
  "a swamp guide's insect-oiled cloak": { slot: "cloak", tier: 3, bonuses: { knowledge: 2, def: 1 }, effects: ["corrosionproof"], source: "job" },
  "a legion infiltrator's dark field cloak": { slot: "cloak", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["ambush_mastery"], source: "contract" },
  "a Vaeloris shifting-canopy mantle": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, magic: 1 }, effects: ["evasive_guard", "trailwise"], source: "monster" },
  "a Norrvael storm-cloak sewn with drake sinew": { slot: "cloak", tier: 4, bonuses: { def: 3, atk: 1 }, effects: ["coldproof", "stalwart"], source: "contract", set: "Norrvael" },
  "a Kabal veil-agent's warded cloak": { slot: "cloak", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["spell_ward", "ambush_sense"], source: "faction", set: "Kabal" },

  // Trinkets
  "a bent legion ration token": { slot: "trinkets", tier: 1, bonuses: { health: 1 }, source: "monster" },
  "a small pouch of marked trail pebbles": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a chipped dwarven hammer charm": { slot: "trinkets", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a vial of harmless luminous beetle fluid": { slot: "trinkets", tier: 1, bonuses: { magic: 1 }, source: "monster" },
  "a Sahrimori water-route tablet": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job" },
  "a Vaeloris pressed healing leaf": { slot: "trinkets", tier: 2, bonuses: { health: 2 }, effects: ["regrowth"], source: "monster" },
  "a legion officer's broken command whistle": { slot: "trinkets", tier: 2, bonuses: { atk: 1, knowledge: 1 }, effects: ["tactical_memory"], source: "monster" },
  "a Kabal elemental notation card": { slot: "trinkets", tier: 2, bonuses: { magic: 2 }, effects: ["elemental_focus"], source: "faction" },
  "a Thraekor cooling stone": { slot: "trinkets", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "contract" },
  "a Norrvael storm-rider's saddle charm": { slot: "trinkets", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["stalwart"], source: "job" },
  "a lizardfolk venom-testing needle": { slot: "trinkets", tier: 3, bonuses: { knowledge: 2, def: 1 }, effects: ["corrosionproof"], source: "monster" },
  "a sealed vial of elemental residue": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "monster" },
  "a Mugamiir Safor master appraiser's lens": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye", "ambush_sense"], source: "contract" },
  "a legionary's last battlefield standard-knot": { slot: "trinkets", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["stalwart", "executioner"], source: "job" },
  "a fragment of living bark that closes around cuts": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster" },
  "a perfectly measured capsule of elemental dust": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "contract" },
  "an intact construct-control seal with no registered owner": { slot: "trinkets", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["unsettling", "tactical_memory"], source: "monster" },
  "a drake's shed eye-scale, polished into a lens": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["ambush_sense", "patient_aim"], source: "monster" },

  // ---- Siege Corps set (14 items) ----
  "a siege engineer's war pick": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["armor_crack"], source: "contract", set: "Siege Corps" },
  "a stonebreaker hammer": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "contract", set: "Siege Corps" },
  "a reinforced mantlet shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Siege Corps" },
  "an engineer's riveted helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "monster", set: "Siege Corps" },
  "a siege foreman's helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "contract", set: "Siege Corps" },
  "a reinforced siege harness": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", set: "Siege Corps" },
  "demolition gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", set: "Siege Corps" },
  "foundation boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "job", set: "Siege Corps" },
  "a mason's iron ring": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["armor_crack"], source: "monster", set: "Siege Corps" },
  "a stonewright torque": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Siege Corps" },
  "a dustproof work mantle": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", set: "Siege Corps" },
  "a surveyor's transit": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "contract", set: "Siege Corps" },
  "an iron measuring rod": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job", set: "Siege Corps" },
  "a demolition charge satchel": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["armor_crack"], source: "contract", set: "Siege Corps" },

  // ---- Novitiate set (14 items) ----
  "a novitiate conduit rod": { slot: "mainhand", tier: 2, bonuses: { magic: 2 }, effects: ["elemental_focus"], source: "faction", set: "Novitiate" },
  "an apprentice ward disk": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["spell_ward"], source: "faction", set: "Novitiate" },
  "a novitiate circlet": { slot: "helmet", tier: 3, bonuses: { magic: 3 }, effects: ["conduit_ease"], source: "faction", set: "Novitiate" },
  "novitiate robes": { slot: "chest", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Novitiate" },
  "lesson gloves": { slot: "gloves", tier: 2, bonuses: { magic: 2 }, effects: ["conduit_ease"], source: "faction", set: "Novitiate" },
  "study hall sandals": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "faction", set: "Novitiate" },
  "an apprentice signet": { slot: "rings", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Novitiate" },
  "a lesson pendant": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "faction", set: "Novitiate" },
  "a lecture cloak": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "faction", set: "Novitiate" },
  "river theory notes": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "faction", set: "Novitiate" },
  "a calibrated focus crystal": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["conduit_ease"], source: "faction", set: "Novitiate" },
  "a conduit practice band": { slot: "rings", tier: 2, bonuses: { magic: 2 }, effects: ["spell_ward"], source: "faction", set: "Novitiate" },
  "scripted casting wraps": { slot: "gloves", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Novitiate" },
  "a student's hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["ambush_sense"], source: "faction", set: "Novitiate" },

  // ---- Examiner set (12 items) ----
  "an examiner's focus blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Examiner" },
  "an inspection ward": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "faction", set: "Examiner" },
  "an examiner hood": { slot: "helmet", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "faction", set: "Examiner" },
  "an investigator's coat": { slot: "chest", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["spell_ward"], source: "faction", set: "Examiner" },
  "evidence gloves": { slot: "gloves", tier: 3, bonuses: { magic: 3 }, effects: ["conduit_ease"], source: "faction", set: "Examiner" },
  "silent investigation boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "faction", set: "Examiner" },
  "an examiner seal": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["spell_ward"], source: "faction", set: "Examiner" },
  "a chain of office": { slot: "necklace", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "faction", set: "Examiner" },
  "a grey examination cloak": { slot: "cloak", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "faction", set: "Examiner" },
  "a sealed investigation file": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["tactical_memory"], source: "faction", set: "Examiner" },
  "an arcane detection lens": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Examiner" },
  "a river authorization ring": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "faction", set: "Examiner" },

  // ---- River Warden set (12 items) ----
  "a river warden staff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "River Warden" },
  "an eightfold ward shield": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "faction", set: "River Warden" },
  "a river warden circlet": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "River Warden" },
  "warden vestments": { slot: "chest", tier: 4, bonuses: { magic: 4 }, effects: ["spell_ward"], source: "faction", set: "River Warden" },
  "river binding gloves": { slot: "gloves", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "River Warden" },
  "riverwalk greaves": { slot: "boots", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["spell_ward"], source: "faction", set: "River Warden" },
  "a warden seal": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "River Warden" },
  "an eight river torque": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "faction", set: "River Warden" },
  "a riverwarden mantle": { slot: "cloak", tier: 4, bonuses: { magic: 2, def: 2 }, effects: ["spell_ward"], source: "faction", set: "River Warden" },
  "a river compass": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["conduit_ease"], source: "faction", set: "River Warden" },
  "a stabilized river fragment": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "faction", set: "River Warden" },
  "a ritual hood": { slot: "helmet", tier: 3, bonuses: { magic: 3 }, effects: ["spell_ward"], source: "faction", set: "River Warden" },

  // ---- Legion set expansion (18 new items; "a legion veteran's gladius"
  // and "legion march boots" already existed and were reused/updated in
  // place rather than duplicated) ----
  "a legion recruit's gladius": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", set: "Legion" },
  "a legion centurion's spatha": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["guarded_strike"], source: "contract", set: "Legion" },
  "a legion formation spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Legion" },
  "a legion recruit shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", set: "Legion" },
  "a legion command scutum": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "Legion" },
  "a legion infantry helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "job", set: "Legion" },
  "a legion strategist's helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "Legion" },
  "a legion scale harness": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "job", set: "Legion" },
  "a legion officer's cuirass": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "contract", set: "Legion" },
  "legion duelist's gauntlets": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "monster", set: "Legion" },
  "legion shieldbearer's gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "job", set: "Legion" },
  "legion relay boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["trailwise"], source: "job", set: "Legion" },
  "a legion veteran's band": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "monster", set: "Legion" },
  "a legion command signet": { slot: "rings", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "contract", set: "Legion" },
  "a legion honor chain": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", set: "Legion" },
  "a legion field command cloak": { slot: "cloak", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "job", set: "Legion" },
  "a legion campaign medal": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "contract", set: "Legion" },
  "a legion battle standard tassel": { slot: "trinkets", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["stalwart"], source: "monster", set: "Legion" },

  // ---- Vanguard set (20 items) ----
  "a vanguard breaching axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "contract", set: "Vanguard" },
  "a vanguard great hammer": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "contract", set: "Vanguard" },
  "a vanguard execution blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "monster", set: "Vanguard" },
  "a vanguard war maul": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["armor_crack"], source: "job", set: "Vanguard" },
  "a vanguard tower shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Vanguard" },
  "a reinforced assault shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", set: "Vanguard" },
  "a vanguard great helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", set: "Vanguard" },
  "an assault visor": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "Vanguard" },
  "a vanguard plate harness": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", set: "Vanguard" },
  "a breacher's plate": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Vanguard" },
  "reinforced assault gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", set: "Vanguard" },
  "iron grip gauntlets": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["armor_crack"], source: "shop", set: "Vanguard" },
  "iron march greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "job", set: "Vanguard" },
  "breacher's boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "shop", set: "Vanguard" },
  "a vanguard oath ring": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "job", set: "Vanguard" },
  "an assault command ring": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", set: "Vanguard" },
  "a breacher's chain": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", set: "Vanguard" },
  "a crimson assault cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Vanguard" },
  "a ramhead insignia": { slot: "trinkets", tier: 3, bonuses: { atk: 3 }, effects: ["armor_crack"], source: "monster", set: "Vanguard" },
  "a vanguard banner fragment": { slot: "trinkets", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["brace"], source: "monster", set: "Vanguard" },

  // ---- Scout Corps set (20 items) ----
  "a scout corps recurve": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["opening_reach"], source: "job", set: "Scout Corps" },
  "a long patrol bow": { slot: "mainhand", tier: 4, bonuses: { atk: 3, knowledge: 1 }, effects: ["patient_aim"], source: "contract", set: "Scout Corps" },
  "a border scout spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Scout Corps" },
  "a silent hunting knife": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["deep_cut"], source: "shop", set: "Scout Corps" },
  "a scout buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Scout Corps" },
  "a trail warden's targe": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "job", set: "Scout Corps" },
  "a scout hood": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", set: "Scout Corps" },
  "a long watch hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", set: "Scout Corps" },
  "scout leather": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Scout Corps" },
  "a ranger jerkin": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["ambush_sense"], source: "shop", set: "Scout Corps" },
  "archer's gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "shop", set: "Scout Corps" },
  "pathfinder wraps": { slot: "gloves", tier: 3, bonuses: { knowledge: 2, atk: 1 }, effects: ["trailwise"], source: "job", set: "Scout Corps" },
  "silent trail boots": { slot: "boots", tier: 4, bonuses: { knowledge: 4 }, effects: ["trailwise"], source: "contract", set: "Scout Corps" },
  "ranger boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Scout Corps" },
  "a pathfinder ring": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract", set: "Scout Corps" },
  "a long watch band": { slot: "rings", tier: 3, bonuses: { knowledge: 2, atk: 1 }, effects: ["ambush_sense"], source: "job", set: "Scout Corps" },
  "a raven whistle": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["ambush_sense"], source: "monster", set: "Scout Corps" },
  "a shadow scout cloak": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, def: 1 }, effects: ["ambush_mastery"], source: "contract", set: "Scout Corps" },
  "a route map cylinder": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "contract", set: "Scout Corps" },
  "a scout signal mirror": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "monster", set: "Scout Corps" },

  // ---- Ashforged set (20 items) ----
  "an ashforged war axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "contract", set: "Ashforged" },
  "a forge master's hammer": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "contract", set: "Ashforged" },
  "a black iron longsword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "monster", set: "Ashforged" },
  "an ember pike": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Ashforged" },
  "a furnace bulwark": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "job", set: "Ashforged" },
  "a black iron tower shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "Ashforged" },
  "a forge master's helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "contract", set: "Ashforged" },
  "an ashguard helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "job", set: "Ashforged" },
  "ashforged plate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["heatproof"], source: "contract", set: "Ashforged" },
  "a forge harness": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", set: "Ashforged" },
  "forge gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", set: "Ashforged" },
  "blacksmith's grips": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["heatproof"], source: "shop", set: "Ashforged" },
  "molten greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", set: "Ashforged" },
  "furnace boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["surefooted"], source: "shop", set: "Ashforged" },
  "a black iron oath ring": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "contract", set: "Ashforged" },
  "a smith's seal": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", set: "Ashforged" },
  "a forge master's torque": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "contract", set: "Ashforged" },
  "an ashfall mantle": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "job", set: "Ashforged" },
  "an everwarm forge stone": { slot: "trinkets", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", set: "Ashforged" },
  "a clan forge emblem": { slot: "trinkets", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["stalwart"], source: "monster", set: "Ashforged" },

  // ---- Heartwood set (20 items) ----
  "a heartwood longbow": { slot: "mainhand", tier: 4, bonuses: { atk: 3, knowledge: 1 }, effects: ["patient_aim"], source: "contract", set: "Heartwood" },
  "a thornwoven bow": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["opening_reach"], source: "job", set: "Heartwood" },
  "an elder branch staff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["regrowth"], source: "contract", set: "Heartwood" },
  "a willow spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Heartwood" },
  "a living root shield": { slot: "offhand", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "contract", set: "Heartwood" },
  "a woven bark shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["regrowth"], source: "job", set: "Heartwood" },
  "an elderleaf hood": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Heartwood" },
  "a canopy circlet": { slot: "helmet", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["regrowth"], source: "monster", set: "Heartwood" },
  "a heartwood cuirass": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "contract", set: "Heartwood" },
  "a barkweave vest": { slot: "chest", tier: 3, bonuses: { def: 2, health: 1 }, effects: ["regrowth"], source: "job", set: "Heartwood" },
  "living vine gloves": { slot: "gloves", tier: 4, bonuses: { def: 2, health: 2 }, effects: ["regrowth"], source: "contract", set: "Heartwood" },
  "grovekeeper wraps": { slot: "gloves", tier: 3, bonuses: { knowledge: 2, def: 1 }, effects: ["trailwise"], source: "job", set: "Heartwood" },
  "rootwalker boots": { slot: "boots", tier: 4, bonuses: { knowledge: 3, def: 1 }, effects: ["trailwise"], source: "contract", set: "Heartwood" },
  "mossrunner boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Heartwood", region: "vaeloris" },
  "a seed ring": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", set: "Heartwood" },
  "a grovekeeper band": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", set: "Heartwood" },
  "a living heart torque": { slot: "necklace", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "contract", set: "Heartwood" },
  "a canopy mantle": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, magic: 1 }, effects: ["trailwise"], source: "contract", set: "Heartwood" },
  "an elder bark seed": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster", set: "Heartwood" },
  "an ancient acorn charm": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, effects: ["regrowth"], source: "monster", set: "Heartwood" },

  // ---- Conduit Master set (20 items) ----
  "a grand conduit blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Conduit Master" },
  "a river focus staff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "an eightfold wand": { slot: "mainhand", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "a crystal focus rod": { slot: "mainhand", tier: 3, bonuses: { magic: 3 }, effects: ["conduit_ease"], source: "faction", set: "Conduit Master" },
  "a river focus disc": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "an eightfold ward": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "faction", set: "Conduit Master" },
  "a river crown": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Conduit Master" },
  "an archmage circlet": { slot: "helmet", tier: 3, bonuses: { magic: 3 }, effects: ["spell_ward"], source: "faction", set: "Conduit Master" },
  "a river thread vestment": { slot: "chest", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "grand ritual robes": { slot: "chest", tier: 3, bonuses: { magic: 3 }, effects: ["spell_ward"], source: "faction", set: "Conduit Master" },
  "gesture thread gloves": { slot: "gloves", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Conduit Master" },
  "ritual casting gloves": { slot: "gloves", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "riverwalk boots": { slot: "boots", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "faction", set: "Conduit Master" },
  "arcane sandals": { slot: "boots", tier: 3, bonuses: { magic: 3 }, effects: ["trailwise"], source: "faction", set: "Conduit Master" },
  "a calibration ring": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "faction", set: "Conduit Master" },
  "a grand conduit ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "an eight river pendant": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "faction", set: "Conduit Master" },
  "a veil of the eight rivers": { slot: "cloak", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["spell_ward"], source: "faction", set: "Conduit Master" },
  "a perfect conduit crystal": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "faction", set: "Conduit Master" },
  "a river calibration prism": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["surging_conduit"], source: "faction", set: "Conduit Master" },

  // ---- Mugamiir Safor set (20 items) ----
  "a guild enforcer's arming sword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "contract", set: "Mugamiir Safor" },
  "a guild caravan spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Mugamiir Safor" },
  "a safor trade saber": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["feinting_edge"], source: "contract", set: "Mugamiir Safor" },
  "a guild marshal's mace": { slot: "mainhand", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["crushing_impact"], source: "contract", set: "Mugamiir Safor" },
  "a guild escort shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Mugamiir Safor" },
  "a safor caravan buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Mugamiir Safor" },
  "a guild officer's hat": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", set: "Mugamiir Safor" },
  "a waymaster's helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Mugamiir Safor" },
  "a guild courier's coat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Mugamiir Safor" },
  "a safor marshal's coat": { slot: "chest", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "Mugamiir Safor" },
  "merchant's gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", set: "Mugamiir Safor" },
  "contract keeper's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "contract", set: "Mugamiir Safor" },
  "guild road boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Mugamiir Safor" },
  "caravan marshal's boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["surefooted"], source: "contract", set: "Mugamiir Safor" },
  "a safor guild seal": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "contract", set: "Mugamiir Safor" },
  "a route master's ring": { slot: "rings", tier: 4, bonuses: { knowledge: 2, def: 2 }, effects: ["trailwise"], source: "contract", set: "Mugamiir Safor" },
  "a guildmaster's chain": { slot: "necklace", tier: 3, bonuses: { knowledge: 2, def: 1 }, effects: ["tactical_memory"], source: "contract", set: "Mugamiir Safor" },
  "a guild dispatch cloak": { slot: "cloak", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", set: "Mugamiir Safor" },
  "a guild charter seal": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye"], source: "contract", set: "Mugamiir Safor" },
  "a safor route ledger": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "monster", set: "Mugamiir Safor" },

  // ---- Courier set (20 items) ----
  "a courier's short sword": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", set: "Courier" },
  "a dispatch dagger": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "job", set: "Courier" },
  "a roadwarden spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Courier" },
  "a messenger's hatchet": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "shop", set: "Courier" },
  "a dispatch buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Courier" },
  "a courier's kite shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Courier" },
  "a dispatch hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["ambush_sense"], source: "shop", set: "Courier" },
  "a roadwarden helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Courier" },
  "a courier's jacket": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Courier" },
  "a long road coat": { slot: "chest", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["surefooted"], source: "contract", set: "Courier" },
  "rider's gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", set: "Courier" },
  "dispatch wraps": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job", set: "Courier" },
  "swiftstride boots": { slot: "boots", tier: 4, bonuses: { knowledge: 4 }, effects: ["trailwise"], source: "contract", set: "Courier" },
  "messenger's riding boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Courier" },
  "a courier's band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Courier" },
  "a dispatch signet": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "contract", set: "Courier" },
  "a waystone pendant": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", set: "Courier" },
  "a windrunner cloak": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, def: 1 }, effects: ["ambush_sense"], source: "contract", set: "Courier" },
  "a dispatch satchel": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "job", set: "Courier" },
  "a route marker kit": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", set: "Courier" },

  // ---- Contract Hunter set (20 items) ----
  "a hunter's longsword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", set: "Contract Hunter" },
  "a beastslayer spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Contract Hunter" },
  "a trophy axe": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "contract", set: "Contract Hunter" },
  "a monster cleaver": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "monster", set: "Contract Hunter" },
  "a hunter's buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Contract Hunter" },
  "a beast ward shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Contract Hunter" },
  "a hunter's hood": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", set: "Contract Hunter" },
  "a tracker's helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Contract Hunter" },
  "a monster hide harness": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", set: "Contract Hunter" },
  "a veteran hunter's coat": { slot: "chest", tier: 4, bonuses: { def: 2, atk: 2 }, effects: ["executioner"], source: "contract", set: "Contract Hunter" },
  "trophy skinner's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Contract Hunter" },
  "quarry grips": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "shop", set: "Contract Hunter" },
  "tracker's boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Contract Hunter" },
  "beast pursuer's boots": { slot: "boots", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["surefooted"], source: "contract", set: "Contract Hunter" },
  "a hunter's band": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", set: "Contract Hunter" },
  "a quarry ring": { slot: "rings", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "monster", set: "Contract Hunter" },
  "a trophy tooth necklace": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", set: "Contract Hunter" },
  "a beast hunter's cloak": { slot: "cloak", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["ambush_mastery"], source: "contract", set: "Contract Hunter" },
  "a monster trophy kit": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "monster", set: "Contract Hunter" },
  "a blood tracking compass": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "contract", set: "Contract Hunter" },

  // ---- Master Appraiser set (20 items) ----
  "an appraiser's walking staff": { slot: "mainhand", tier: 2, bonuses: { knowledge: 2 }, effects: ["tactical_memory"], source: "shop", set: "Master Appraiser" },
  "a gem inspector's hammer": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["armor_crack"], source: "job", set: "Master Appraiser" },
  "a precision chisel": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", set: "Master Appraiser" },
  "a valuation blade": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["feinting_edge"], source: "contract", set: "Master Appraiser" },
  "a ledger shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Master Appraiser" },
  "an inspector's buckler": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", set: "Master Appraiser" },
  "a surveyor's hat": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", set: "Master Appraiser" },
  "a master inspector's hood": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "contract", set: "Master Appraiser" },
  "an appraiser's coat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", set: "Master Appraiser" },
  "a senior assessor's robe": { slot: "chest", tier: 4, bonuses: { knowledge: 2, def: 2 }, effects: ["tactical_memory"], source: "contract", set: "Master Appraiser" },
  "delicate handling gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", set: "Master Appraiser" },
  "precision grips": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job", set: "Master Appraiser" },
  "inspector's boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Master Appraiser" },
  "surveyor's road boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["surefooted"], source: "contract", set: "Master Appraiser" },
  "an assessor's seal": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "contract", set: "Master Appraiser" },
  "a guild auditor's ring": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "Master Appraiser" },
  "a gemmaster's pendant": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "monster", set: "Master Appraiser" },
  "a surveyor's cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "job", set: "Master Appraiser" },
  "a precision lens": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye"], source: "contract", set: "Master Appraiser" },
  "a certified valuation ledger": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "contract", set: "Master Appraiser" },

  // ---- Stonewarden set (20 items) ----
  "a stonewarden warhammer": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "contract", set: "Stonewarden" },
  "a granite cleaver": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "contract", set: "Stonewarden" },
  "a bastion axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "job", set: "Stonewarden" },
  "a citadel spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Stonewarden" },
  "a stonewarden bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "Stonewarden" },
  "a quarry shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", set: "Stonewarden" },
  "a granite helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", set: "Stonewarden" },
  "a bastion helm": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "Stonewarden" },
  "fortress plate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", set: "Stonewarden" },
  "mountain mail": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "job", set: "Stonewarden" },
  "mason's gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", set: "Stonewarden" },
  "stonegrip gloves": { slot: "gloves", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Stonewarden" },
  "deepdelver greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "job", set: "Stonewarden" },
  "fortress boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "shop", set: "Stonewarden" },
  "a stonewarden oath ring": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "contract", set: "Stonewarden" },
  "a clan mason ring": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", set: "Stonewarden" },
  "a citadel torque": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "contract", set: "Stonewarden" },
  "a dustcloak of the deep roads": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Stonewarden" },
  "a runed keystone": { slot: "trinkets", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster", set: "Stonewarden" },
  "a fortress builder's chisel": { slot: "trinkets", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["armor_crack"], source: "monster", set: "Stonewarden" },

  // ---- Canopy Ranger set (20 items) ----
  "a canopy longbow": { slot: "mainhand", tier: 4, bonuses: { atk: 3, knowledge: 1 }, effects: ["patient_aim"], source: "contract", set: "Canopy Ranger" },
  "a thornrunner bow": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["opening_reach"], source: "job", set: "Canopy Ranger" },
  "a branchguard spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Canopy Ranger" },
  "a vineknife": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Canopy Ranger" },
  "a living bark buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["regrowth"], source: "job", set: "Canopy Ranger" },
  "a canopy guard shield": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Canopy Ranger" },
  "a leafwatch hood": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", set: "Canopy Ranger" },
  "a ranger circlet": { slot: "helmet", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["regrowth"], source: "monster", set: "Canopy Ranger" },
  "a canopy vest": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Canopy Ranger" },
  "living branch armor": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "contract", set: "Canopy Ranger" },
  "vine archer gloves": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["patient_aim"], source: "job", set: "Canopy Ranger" },
  "barkwoven wraps": { slot: "gloves", tier: 3, bonuses: { def: 2, health: 1 }, effects: ["regrowth"], source: "job", set: "Canopy Ranger" },
  "branchrunner boots": { slot: "boots", tier: 4, bonuses: { knowledge: 4 }, effects: ["trailwise"], source: "contract", set: "Canopy Ranger" },
  "mossstep boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Canopy Ranger" },
  "a ranger's leaf ring": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Canopy Ranger" },
  "an emerald canopy band": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", set: "Canopy Ranger" },
  "a forest warden pendant": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "contract", set: "Canopy Ranger" },
  "a living leaf cloak": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, magic: 1 }, effects: ["ambush_mastery"], source: "contract", set: "Canopy Ranger" },
  "a songbird whistle": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "monster", set: "Canopy Ranger" },
  "an ancient seed pod": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster", set: "Canopy Ranger", region: "vaeloris" },

  // ---- Sandstrider set (20 items) ----
  "a sandstrider saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "contract", set: "Sandstrider" },
  "a dune spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Sandstrider" },
  "a caravan defender blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["guarded_strike"], source: "contract", set: "Sandstrider" },
  "a curved dust knife": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Sandstrider" },
  "a sunshield buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Sandstrider" },
  "a caravan escort shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", set: "Sandstrider" },
  "a desert veil": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["heatproof"], source: "job", set: "Sandstrider" },
  "a sandwarden helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Sandstrider" },
  "desert traveler's robes": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["heatproof"], source: "shop", set: "Sandstrider" },
  "a caravan captain's coat": { slot: "chest", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract", set: "Sandstrider" },
  "sandwalker wraps": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", set: "Sandstrider" },
  "caravan guard gloves": { slot: "gloves", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["guarded_strike"], source: "job", set: "Sandstrider" },
  "dunewalker boots": { slot: "boots", tier: 4, bonuses: { knowledge: 4 }, effects: ["surefooted"], source: "contract", set: "Sandstrider" },
  "oasis boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["heatproof"], source: "job", set: "Sandstrider" },
  "a caravan master's ring": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "contract", set: "Sandstrider" },
  "a desert route band": { slot: "rings", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Sandstrider" },
  "a sun compass pendant": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", set: "Sandstrider" },
  "a desert wind cloak": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, def: 1 }, effects: ["ambush_sense"], source: "contract", set: "Sandstrider" },
  "a water counter": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "shop", set: "Sandstrider" },
  "a caravan route tablet": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye"], source: "contract", set: "Sandstrider" },

  // ---- Tide Merchant set (20 items) ----
  "a tide captain's saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "contract", set: "Tide Merchant" },
  "a boarding pike": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Tide Merchant" },
  "a merchant prince's blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["feinting_edge"], source: "contract", set: "Tide Merchant" },
  "a harbor cutlass": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster", set: "Tide Merchant" },
  "a harbor shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Tide Merchant" },
  "a captain's buckler": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["guarded_strike"], source: "job", set: "Tide Merchant" },
  "a navigator's hat": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", set: "Tide Merchant" },
  "a tide captain's helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "contract", set: "Tide Merchant" },
  "a merchant captain's coat": { slot: "chest", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract", set: "Tide Merchant" },
  "a harbor officer's jacket": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", set: "Tide Merchant" },
  "navigator's gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", set: "Tide Merchant" },
  "helmsman's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job", set: "Tide Merchant" },
  "deckrunner boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Tide Merchant" },
  "tide boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract", set: "Tide Merchant" },
  "a merchant prince's ring": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract", set: "Tide Merchant" },
  "a navigator's band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Tide Merchant" },
  "a captain's compass": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "monster", set: "Tide Merchant" },
  "a sea wind cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "job", set: "Tide Merchant" },
  "tide charts": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "shop", set: "Tide Merchant" },
  "a harbor ledger": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye"], source: "contract", set: "Tide Merchant" },

  // ---- Stormwatch set (20 items) ----
  "a stormwatch longsword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "contract", set: "Stormwatch" },
  "a tempest spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "Stormwatch" },
  "a cliffwarden axe": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "contract", set: "Stormwatch" },
  "a storm cutlass": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster", set: "Stormwatch" },
  "a stormwall shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["spell_ward"], source: "contract", set: "Stormwatch" },
  "a coastguard buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", set: "Stormwatch" },
  "a storm helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["spell_ward"], source: "job", set: "Stormwatch" },
  "a watch captain's helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "Stormwatch" },
  "stormwatch armor": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["spell_ward"], source: "contract", set: "Stormwatch" },
  "coastwarden mail": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", set: "Stormwatch" },
  "tempest gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "job", set: "Stormwatch" },
  "tide guard gloves": { slot: "gloves", tier: 2, bonuses: { def: 2 }, effects: ["spell_ward"], source: "shop", set: "Stormwatch" },
  "cliffrunner greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "job", set: "Stormwatch", region: "norrvael" },
  "storm boots": { slot: "boots", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "contract", set: "Stormwatch" },
  "a stormwatch seal": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["spell_ward"], source: "contract", set: "Stormwatch" },
  "a coastal oath ring": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "shop", set: "Stormwatch" },
  "a tempest torque": { slot: "necklace", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["spell_ward"], source: "job", set: "Stormwatch" },
  "a stormcloak": { slot: "cloak", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "contract", set: "Stormwatch" },
  "a lighthouse beacon charm": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "monster", set: "Stormwatch" },
  "a stormglass compass": { slot: "trinkets", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["spell_ward"], source: "monster", set: "Stormwatch" },

  // ---- White Watch set (20 items) ----
  "a white watch blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "contract", set: "White Watch" },
  "a noble duelist's saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "contract", set: "White Watch" },
  "a silent pike": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", set: "White Watch" },
  "a white watch dagger": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "White Watch" },
  "a white watch buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "job", set: "White Watch" },
  "a silver ward shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", set: "White Watch" },
  "a white visor": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["ambush_sense"], source: "job", set: "White Watch" },
  "a royal guard helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "White Watch" },
  "a white watch cuirass": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", set: "White Watch" },
  "royal escort mail": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "job", set: "White Watch" },
  "duelist's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "contract", set: "White Watch" },
  "silent guard wraps": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "shop", set: "White Watch" },
  "white march boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "job", set: "White Watch" },
  "silent patrol boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "contract", set: "White Watch" },
  "a white watch signet": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "contract", set: "White Watch" },
  "a royal seal ring": { slot: "rings", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", set: "White Watch" },
  "a chain of vigilance": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["ambush_sense"], source: "monster", set: "White Watch" },
  "a white mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["ambush_mastery"], source: "contract", set: "White Watch" },
  "a watch captain's badge": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "monster", set: "White Watch" },
  "a silver whistle": { slot: "trinkets", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "monster", set: "White Watch" },

  // ---- Lizardfolk set (16 items; the earlier 6 monster-drop Lizardfolk
  // items predating this table were untagged back to ordinary loot rather
  // than left as excess duplicates, matching the Legion precedent) ----
  "a bone fang spear": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["opening_reach"], source: "monster", set: "Lizardfolk" },
  "a marsh cleaver": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Lizardfolk" },
  "a spine club": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "monster", set: "Lizardfolk" },
  "a scale buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
  "a bone guard shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "monster", set: "Lizardfolk" },
  "a crest helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
  "a marsh scale harness": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
  "clawguard gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Lizardfolk" },
  "marsh stalker boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "monster", set: "Lizardfolk" },
  "a bone totem ring": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
  "a swamp hunter band": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Lizardfolk" },
  "a fang trophy necklace": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", set: "Lizardfolk" },
  "a marshhide cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "monster", set: "Lizardfolk" },
  "a preserved venom sac": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "monster", set: "Lizardfolk" },
  "a carved totem charm": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
  "an ancient marsh idol": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "monster", set: "Lizardfolk" },

  // ---- Drake Hunter set (16 items; the earlier 7 monster-drop Drake
  // Hunter items predating this table were untagged back to ordinary loot,
  // same reasoning as Lizardfolk above) ----
  "a drakebone greatsword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "monster", set: "Drake Hunter" },
  "a drakefang spear": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["opening_reach"], source: "monster", set: "Drake Hunter" },
  "a scale cleaver": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "monster", set: "Drake Hunter" },
  "a drake scale shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },
  "a drakehide buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", set: "Drake Hunter" },
  "a drake skull helm": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },
  "a drake scale cuirass": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },
  "talon gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "monster", set: "Drake Hunter" },
  "drakehide boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", set: "Drake Hunter" },
  "a scale band": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },
  "a hunter's trophy ring": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", set: "Drake Hunter" },
  "a drake tooth necklace": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", set: "Drake Hunter" },
  "a drakehide mantle": { slot: "cloak", tier: 4, bonuses: { def: 3, atk: 1 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },
  "a polished drake fang": { slot: "trinkets", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "monster", set: "Drake Hunter" },
  "a drake eye lens": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "monster", set: "Drake Hunter" },
  "a hardened heart scale": { slot: "trinkets", tier: 4, bonuses: { def: 2, health: 2 }, effects: ["heatproof"], source: "monster", set: "Drake Hunter" },

  // ---- Queen Carapace set (16 items) ----
  "a serrated carapace blade": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Queen Carapace" },
  "a queen spine lance": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "monster", set: "Queen Carapace" },
  "a chitin crusher": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "monster", set: "Queen Carapace" },
  "a layered carapace shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "a hive guard buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster", set: "Queen Carapace" },
  "a queen carapace helm": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "layered carapace armor": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "chitin claw gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Queen Carapace" },
  "hive walker boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", set: "Queen Carapace" },
  "a resin band": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "a hive queen ring": { slot: "rings", tier: 3, bonuses: { def: 2, health: 1 }, effects: ["stalwart"], source: "monster", set: "Queen Carapace" },
  "a queen mandible pendant": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "a carapace mantle": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", set: "Queen Carapace" },
  "a royal resin core": { slot: "trinkets", tier: 4, bonuses: { def: 4 }, effects: ["corrosionproof"], source: "monster", set: "Queen Carapace" },
  "a hardened egg fragment": { slot: "trinkets", tier: 4, bonuses: { def: 2, health: 2 }, effects: ["regrowth"], source: "monster", set: "Queen Carapace" },
  "a luminous carapace shard": { slot: "trinkets", tier: 4, bonuses: { magic: 2, def: 2 }, effects: ["spell_ward"], source: "monster", set: "Queen Carapace" },

  // ---- Elder Bark set (16 items) ----
  "an elder bark staff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["regrowth"], source: "job", set: "Elder Bark" },
  "a living branch spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, magic: 1 }, effects: ["opening_reach"], source: "job", set: "Elder Bark" },
  "a grovekeeper bow": { slot: "mainhand", tier: 4, bonuses: { atk: 3, knowledge: 1 }, effects: ["patient_aim"], source: "job", set: "Elder Bark" },
  "a living bark shield": { slot: "offhand", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "a rootwoven guard": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "an elder crown": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "living bark plate": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "rootwoven gloves": { slot: "gloves", tier: 3, bonuses: { def: 2, health: 1 }, effects: ["regrowth"], source: "monster", set: "Elder Bark", region: "vaeloris" },
  "ancient root boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Elder Bark" },
  "a living seed ring": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "an elderwood band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", set: "Elder Bark" },
  "a warden vine pendant": { slot: "necklace", tier: 3, bonuses: { health: 2, def: 1 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "an elder canopy cloak": { slot: "cloak", tier: 4, bonuses: { knowledge: 3, magic: 1 }, effects: ["ambush_sense"], source: "job", set: "Elder Bark" },
  "an ancient seed": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "a heartwood core": { slot: "trinkets", tier: 4, bonuses: { health: 4 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },
  "a living sap crystal": { slot: "trinkets", tier: 4, bonuses: { magic: 2, health: 2 }, effects: ["regrowth"], source: "monster", set: "Elder Bark" },

  // ---- Bonecaller set (12 items) ----
  "a bonecaller's scythe": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["deep_cut"], source: "monster", set: "Bonecaller" },
  "an ossuary spear": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "monster", set: "Bonecaller" },
  "a ribcage bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "monster", set: "Bonecaller" },
  "a skull crown": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["unsettling"], source: "monster", set: "Bonecaller" },
  "ossified plate": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["corrosionproof"], source: "monster", set: "Bonecaller" },
  "marrow grips": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "monster", set: "Bonecaller" },
  "gravewalk boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", set: "Bonecaller" },
  "a fingerbone ring": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["unsettling"], source: "monster", set: "Bonecaller" },
  "a spine totem": { slot: "necklace", tier: 4, bonuses: { atk: 2, magic: 2 }, effects: ["elemental_focus"], source: "monster", set: "Bonecaller" },
  "a bonewoven shroud": { slot: "cloak", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "monster", set: "Bonecaller" },
  "a polished skull fragment": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["unsettling"], source: "monster", set: "Bonecaller" },
  "a preserved marrow core": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "monster", set: "Bonecaller" },

  // ---- Leviathan set (12 items) ----
  "a leviathan harpoon": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "monster", set: "Leviathan" },
  "a tidebreaker blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "monster", set: "Leviathan" },
  "a leviathan scale shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["spell_ward"], source: "monster", set: "Leviathan" },
  "a deepwater helm": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["coldproof"], source: "monster", set: "Leviathan" },
  "abyssal scale mail": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["coldproof"], source: "monster", set: "Leviathan" },
  "tidegrip gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "monster", set: "Leviathan" },
  "abysswalker boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", set: "Leviathan" },
  "an ocean king's ring": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["spell_ward"], source: "monster", set: "Leviathan" },
  "a leviathan tooth torque": { slot: "necklace", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["coldproof"], source: "monster", set: "Leviathan" },
  "a deep tide mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "monster", set: "Leviathan" },
  "an abyssal pearl": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Leviathan" },
  "a leviathan heartstone": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "monster", set: "Leviathan" },

  // ---- First Kingdom set (12 items) ----
  "a king's longsword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["tactical_memory"], source: "monster", set: "First Kingdom" },
  "a royal war spear": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "monster", set: "First Kingdom" },
  "a king's guard shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "monster", set: "First Kingdom" },
  "a crown guard helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "monster", set: "First Kingdom" },
  "royal legion plate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "monster", set: "First Kingdom" },
  "royal duelist gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "monster", set: "First Kingdom" },
  "king's march greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["trailwise"], source: "monster", set: "First Kingdom" },
  "a signet of the first crown": { slot: "rings", tier: 4, bonuses: { knowledge: 4 }, effects: ["tactical_memory"], source: "monster", set: "First Kingdom" },
  "a chain of sovereignty": { slot: "necklace", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "monster", set: "First Kingdom" },
  "an imperial mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["ambush_sense"], source: "monster", set: "First Kingdom" },
  "a royal standard fragment": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["tactical_memory"], source: "monster", set: "First Kingdom" },
  "an ancient imperial seal": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "monster", set: "First Kingdom" },

  // ---- Pre-Kabal set (12 items) ----
  "a riverbranch staff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "monster", set: "Pre-Kabal" },
  "a primordial focus blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "monster", set: "Pre-Kabal" },
  "an eightfold warding disc": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "monster", set: "Pre-Kabal" },
  "a river sage circlet": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "monster", set: "Pre-Kabal" },
  "ancient conduit robes": { slot: "chest", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "monster", set: "Pre-Kabal" },
  "river thread gloves": { slot: "gloves", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "monster", set: "Pre-Kabal" },
  "pilgrim sandals": { slot: "boots", tier: 3, bonuses: { magic: 3 }, effects: ["trailwise"], source: "monster", set: "Pre-Kabal" },
  "an ancient river band": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "monster", set: "Pre-Kabal" },
  "a conduit stone necklace": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Pre-Kabal" },
  "a river sage mantle": { slot: "cloak", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["spell_ward"], source: "monster", set: "Pre-Kabal" },
  "a cracked river focus": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Pre-Kabal" },
  "an ancient conduit crystal": { slot: "trinkets", tier: 4, bonuses: { magic: 2, health: 2 }, effects: ["regrowth"], source: "monster", set: "Pre-Kabal" },

  // ---- Fragmenta set (12 items) ----
  "a fragmenta blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Fragmenta" },
  "a fragmenta lance": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "monster", set: "Fragmenta" },
  "a fragmenta ward": { slot: "offhand", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "monster", set: "Fragmenta" },
  "a fragmenta crown": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["conduit_ease"], source: "monster", set: "Fragmenta" },
  "a fragmenta carapace": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["spell_ward"], source: "monster", set: "Fragmenta" },
  "fragmenta grips": { slot: "gloves", tier: 4, bonuses: { atk: 2, magic: 2 }, effects: ["elemental_focus"], source: "monster", set: "Fragmenta" },
  "fragmenta greaves": { slot: "boots", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["surefooted"], source: "monster", set: "Fragmenta" },
  "a fragmenta band": { slot: "rings", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "monster", set: "Fragmenta" },
  "a fragmenta heart": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Fragmenta" },
  "a fragmenta shroud": { slot: "cloak", tier: 4, bonuses: { magic: 2, def: 2 }, effects: ["spell_ward"], source: "monster", set: "Fragmenta" },
  "a fragmenta majoris shard": { slot: "trinkets", tier: 4, bonuses: { magic: 4 }, effects: ["surging_conduit"], source: "monster", set: "Fragmenta" },
  "a fragmenta minoris fragment": { slot: "trinkets", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "monster", set: "Fragmenta" },

  // ---- Generic regional items (no set) ----
  // Main Hand
  "a village blacksmith's sword": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a hunter's skinning knife": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a river ferryman's polearm": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, effects: ["opening_reach"], source: "monster" },
  "an orchard billhook": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a woodsman's hatchet": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a marsh reed spear": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "monster" },
  "a caravan guard saber": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "job" },
  "an iron-banded mace": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["crushing_impact"], source: "shop" },
  "a falconer's hunting spear": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "job" },
  "a border militia sword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster" },
  "a cliff watch axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["armor_crack"], source: "monster" },
  "a noble duelist's rapier": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "job" },
  "a river warden pike": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "contract" },
  "a veteran huntsman's bow": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["patient_aim"], source: "contract" },
  "a high magistrate's ceremonial blade": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Off Hand
  "an oak buckler": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a leather round shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a reed-woven shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "an iron-rim buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop" },
  "a caravan escort's shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "job" },
  "a river patrol shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "contract" },
  "a hardened kite shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster" },
  "a veteran's tower shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract" },

  // Helmets
  "a boiled leather cap": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a plain hunter's hood": { slot: "helmet", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a fur-lined helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["coldproof"], source: "shop" },
  "a chain coif": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "monster" },
  "a border watch helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["ambush_sense"], source: "monster" },
  "a noble riding helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job" },
  "a silvered tournament helm": { slot: "helmet", tier: 4, bonuses: { def: 4 }, effects: ["riposte"], source: "contract" },

  // Chest
  "a quilted gambeson": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a hunter's leather coat": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a traveler's layered vest": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "shop" },
  "a riveted mail shirt": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "monster" },
  "a caravan captain's vest": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job" },
  "reinforced brigandine": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster" },
  "a noble breastplate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["guarded_strike"], source: "contract" },

  // Gloves
  "workman's gloves": { slot: "gloves", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "archer's finger wraps": { slot: "gloves", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "falconer's gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "job" },
  "reinforced leather gloves": { slot: "gloves", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop" },
  "veteran's gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster" },
  "mason's stone gloves": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["crushing_impact"], source: "job" },
  "duel master's gloves": { slot: "gloves", tier: 4, bonuses: { atk: 4 }, effects: ["feinting_edge"], source: "job", region: "sanguivorum" },

  // Boots
  "farmer's boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "traveler's sandals": { slot: "boots", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "riding boots": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop" },
  "reinforced march boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["surefooted"], source: "monster" },
  "ranger's trail boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract" },
  "cliff climber's boots": { slot: "boots", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["surefooted"], source: "monster" },
  "expedition boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract" },

  // Rings
  "a brass family ring": { slot: "rings", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "an iron promise band": { slot: "rings", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a merchant's ledger ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job" },
  "an archer's silver band": { slot: "rings", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "monster" },
  "a noble signet ring": { slot: "rings", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job" },
  "a veteran's campaign ring": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract" },
  "a magistrate's seal ring": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract" },

  // Necklaces
  "bone prayer beads": { slot: "necklace", tier: 1, bonuses: { magic: 1 }, source: "shop" },
  "a hunter's tooth necklace": { slot: "necklace", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a traveler's compass pendant": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop" },
  "a river stone charm": { slot: "necklace", tier: 2, bonuses: { magic: 2 }, effects: ["elemental_focus"], source: "monster" },
  "a veteran's honor medal": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract" },
  "a noble house chain": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job" },
  "a royal audience medallion": { slot: "necklace", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract" },

  // Cloaks
  "a wool traveler's cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a hunter's hide cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a rainproof oilskin cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "shop" },
  "a scout's weather cloak": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["ambush_sense"], source: "monster" },
  "a long road mantle": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "contract" },
  "a fur-lined expedition cloak": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["coldproof"], source: "monster" },
  "an embroidered noble cloak": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Trinkets
  "a lucky copper coin": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a rabbit's foot charm": { slot: "trinkets", tier: 1, bonuses: { health: 1 }, source: "monster" },
  "a worn prayer token": { slot: "trinkets", tier: 1, bonuses: { magic: 1 }, source: "shop" },
  "a carved antler charm": { slot: "trinkets", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a merchant's wax seal": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job" },
  "a hunter's trophy fang": { slot: "trinkets", tier: 2, bonuses: { atk: 2 }, effects: ["executioner"], source: "monster" },
  "a stone mason's measuring line": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop" },
  "a roadwarden's map scroll": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract" },
  "a captain's signal whistle": { slot: "trinkets", tier: 3, bonuses: { atk: 3 }, effects: ["tactical_memory"], source: "job" },
  "a silver compass": { slot: "trinkets", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "shop" },
  "a blessed hearth icon": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "contract" },
  "a master smith's hammer charm": { slot: "trinkets", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["crushing_impact"], source: "job" },

  // ---- Generic regional items, second batch (no set) ----
  // Main Hand
  "a tanner's skinning blade": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a cooper's mallet": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a forester's hatchet": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "a fisherman's gaff": { slot: "mainhand", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a boar hunter's spear": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "monster" },
  "a militia sergeant's sword": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "job" },
  "a stone quarry pick": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["armor_crack"], source: "shop" },
  "a falcon knight's saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "contract" },
  "a highland claymore": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "monster" },
  "a noble huntsman's longbow": { slot: "mainhand", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["patient_aim"], source: "job" },
  "an ironwood war club": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "monster" },
  "a magistrate's execution sword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "contract" },
  "a veteran pathfinder's spear": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["opening_reach"], source: "contract" },
  "a silver court rapier": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["feinting_edge"], source: "job" },

  // Off Hand
  "a willow round shield": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a dockworker's buckler": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a reinforced hide shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "monster" },
  "an ironbound targe": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop" },
  "a watchtower shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster" },
  "a merchant guard tower shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "contract" },
  "an oak fortress shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract" },
  "a silver parade shield": { slot: "offhand", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Helmets
  "a felt travel hat": { slot: "helmet", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "an iron skullcap": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a woodsman's hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "monster" },
  "a huntsman's helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["ambush_sense"], source: "job" },
  "a frontier helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster" },
  "a tournament helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["riposte"], source: "contract" },
  "a noble officer's helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Chest
  "a thick wool doublet": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a rancher's leather vest": { slot: "chest", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a mail-reinforced jacket": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop" },
  "a frontier coat": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "monster" },
  "veteran brigandine": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster" },
  "a heavy scout harness": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "contract" },
  "a knight-captain's breastplate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract" },

  // Gloves
  "stablehand's gloves": { slot: "gloves", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "leather archer's mitts": { slot: "gloves", tier: 1, bonuses: { atk: 1 }, source: "shop" },
  "butcher's gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["deep_cut"], source: "monster" },
  "cartwright's gloves": { slot: "gloves", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop" },
  "veteran archer's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["patient_aim"], source: "contract" },
  "iron rivet gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster" },
  "champion's duel gloves": { slot: "gloves", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "job" },

  // Boots
  "cobbled work boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "marsh sandals": { slot: "boots", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "courier's riding boots": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job" },
  "hunter's trail boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["surefooted"], source: "monster" },
  "cliff walker boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract" },
  "iron trail greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster" },
  "expedition greaves": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract" },

  // Rings
  "a copper wedding band": { slot: "rings", tier: 1, bonuses: { health: 1 }, source: "shop" },
  "a blacksmith's ring": { slot: "rings", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a guild craftsman's ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job" },
  "a silver archer's band": { slot: "rings", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "monster" },
  "a watch captain's ring": { slot: "rings", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "contract" },
  "a veteran soldier's ring": { slot: "rings", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster" },
  "a chancellor's signet": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Necklaces
  "a woodcarved prayer charm": { slot: "necklace", tier: 1, bonuses: { magic: 1 }, source: "shop" },
  "a bear tooth necklace": { slot: "necklace", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a pilgrim's medallion": { slot: "necklace", tier: 2, bonuses: { magic: 2 }, effects: ["elemental_focus"], source: "shop" },
  "a bronze compass pendant": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "job" },
  "a frontier marshal's medal": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract" },
  "a family crest chain": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job" },
  "a king's audience seal": { slot: "necklace", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract" },

  // Cloaks
  "a linen traveler's cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "shop" },
  "a fur hunter's cape": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a stormproof mantle": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["coldproof"], source: "shop" },
  "a ranger's cloak": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["ambush_sense"], source: "contract" },
  "a frontier command cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster" },
  "a great bear cloak": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster" },
  "an embroidered magistrate's mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job" },

  // Trinkets
  "a brass pocket compass": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "shop" },
  "a carved wolf fang": { slot: "trinkets", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "a weathered lucky charm": { slot: "trinkets", tier: 1, bonuses: { health: 1 }, source: "shop" },
  "a small river shell": { slot: "trinkets", tier: 1, bonuses: { magic: 1 }, source: "monster" },
  "craftsman's calipers": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "job" },
  "a hunter's antler token": { slot: "trinkets", tier: 2, bonuses: { atk: 2 }, effects: ["executioner"], source: "monster" },
  "a mason's chalk line": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop" },
  "an explorer's journal": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract" },
  "a battle horn": { slot: "trinkets", tier: 3, bonuses: { atk: 3 }, effects: ["tactical_memory"], source: "monster" },
  "a surveyor's compass": { slot: "trinkets", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job" },
  "a shrine keeper's icon": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "contract" },
  "a master fletcher's marking knife": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["patient_aim"], source: "job" },

  // ---- Regional nation items (no set; `region` ties them to jobs/quests/
  // enemies of that nation — see rollCreatureLoot in data/items.js and
  // rewardForDifficulty in data/jobs.js for how `region` is consulted) ----
  // Main Hand
  "a sanguivorum legionary's side sword": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "a vaeloris ashwood hunting bow": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "monster", region: "vaeloris" },
  "a thraekor black-iron cleaver": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "shop", region: "thraekor" },
  "a norrvael icewind saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster", region: "norrvael" },
  "a sahrimor caravan scimitar": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "job", region: "sahrimor" },
  "a sanguivorum border pike": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "contract", region: "sanguivorum" },
  "a vaeloris thornblade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["deep_cut"], source: "contract", region: "vaeloris" },
  "a thraekor forge pike": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "contract", region: "thraekor" },
  "a norrvael stormsteel longsword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "contract", region: "norrvael" },
  "a sahrimor dune falcon spear": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["opening_reach"], source: "contract", region: "sahrimor" },

  // Off Hand
  "a sanguivorum infantry shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", region: "sanguivorum" },
  "a vaeloris bark buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a thraekor forge shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a norrvael coastguard shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a sahrimor sun shield": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", region: "sahrimor" },
  "an ironbound fortress shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract" },

  // Helmets
  "a sanguivorum war helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "shop", region: "sanguivorum" },
  "a vaeloris canopy hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "monster", region: "vaeloris" },
  "a thraekor furnace helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a norrvael watch helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["ambush_sense"], source: "monster", region: "norrvael" },
  "a sahrimor veiled helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a silver laurel helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "sanguivorum" },

  // Chest
  "a sanguivorum mail shirt": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "a vaeloris leafwoven vest": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a thraekor forge plate": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a norrvael stormcoat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a sahrimor caravan coat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", region: "sahrimor" },
  "a noble war harness": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", region: "sanguivorum" },

  // Gloves
  "legion sword gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "thorn archer gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "monster", region: "vaeloris" },
  "forge grip gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "shop", region: "thraekor" },
  "storm sail gloves": { slot: "gloves", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "desert rider gloves": { slot: "gloves", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", region: "sahrimor" },
  "master's iron gauntlets": { slot: "gloves", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "contract" },

  // Boots ("Legion March Boots" already existed pre-batch and was updated
  // in place above with a region tag, rather than duplicated here)
  "canopy walker boots": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "vaeloris" },
  "forge walker greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "cliff patrol boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "monster", region: "norrvael" },
  "caravan rider boots": { slot: "boots", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["surefooted"], source: "job", region: "sahrimor" },
  "king's expedition boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract", region: "sanguivorum" },

  // Rings ("a legion officer's ring" already existed pre-batch and was
  // updated in place above rather than duplicated here)
  "a living vine ring": { slot: "rings", tier: 2, bonuses: { magic: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a forge master's band": { slot: "rings", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", region: "thraekor" },
  "a stormglass ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a merchant prince's band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a royal chancellor's signet": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract" },

  // Necklaces
  "a legion medal of service": { slot: "necklace", tier: 2, bonuses: { atk: 2 }, effects: ["executioner"], source: "shop", region: "sanguivorum" },
  "elderwood prayer beads": { slot: "necklace", tier: 2, bonuses: { magic: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a forgemaster's chain": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a navigator's compass chain": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", region: "norrvael" },
  "a sun merchant pendant": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a silver court medallion": { slot: "necklace", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract" },

  // Cloaks ("a legion field cloak" already existed pre-batch and was
  // updated in place above rather than duplicated here)
  "a mossweave cloak": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "monster", region: "vaeloris" },
  "an ashfall traveler's mantle": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a stormwatch cape": { slot: "cloak", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a desert silk cloak": { slot: "cloak", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a noble court mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "sanguivorum" },

  // Trinkets
  "a legion campaign token": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["tactical_memory"], source: "shop", region: "sanguivorum" },
  "a canopy seed charm": { slot: "trinkets", tier: 2, bonuses: { health: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a forgestone charm": { slot: "trinkets", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a stormglass hand compass": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a merchant contract scroll": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a desert sun coin": { slot: "trinkets", tier: 3, bonuses: { atk: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "sahrimor" },
  "a river ferry bell": { slot: "trinkets", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["elemental_focus"], source: "shop" },
  "a black iron smith's mark": { slot: "trinkets", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["crushing_impact"], source: "contract", region: "thraekor" },
  "a noble family seal": { slot: "trinkets", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "sanguivorum" },
  "an ancient trade ledger": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["merchants_eye"], source: "contract", region: "sahrimor" },

  // ---- Sanguivorum regional items (nation explicitly specified this
  // batch, to avoid any misattribution) ----
  "a crimson border sword": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "an iron drill pike": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "job", region: "sanguivorum" },
  "a highland war axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "monster", region: "sanguivorum" },
  "a blood oak longbow": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["patient_aim"], source: "contract", region: "sanguivorum" },
  "a magistrate's ceremonial sword": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "sanguivorum" },
  "a red banner greatsword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "contract", region: "sanguivorum" },

  "a blood oak shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", region: "sanguivorum" },
  "an iron-rim kite shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", region: "sanguivorum" },
  "a crimson guard bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", region: "sanguivorum" },

  "a crimson war helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["stalwart"], source: "shop", region: "sanguivorum" },
  "a border captain's helm": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "job", region: "sanguivorum" },

  "blood oak brigandine": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "a highland breastplate": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "monster", region: "sanguivorum" },

  "crimson sword gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "border rider gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "monster", region: "sanguivorum" },

  "highland march boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "shop", region: "sanguivorum" },
  "border patrol greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", region: "sanguivorum" },

  "a magistrate's signet": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "sanguivorum" },
  "a crimson noble ring": { slot: "rings", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "shop", region: "sanguivorum" },
  "a royal chancellor's seal": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "sanguivorum" },

  "a medal of civic honor": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "sanguivorum" },
  "a blood oak pendant": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", region: "sanguivorum" },
  "a royal court medallion": { slot: "necklace", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract", region: "sanguivorum" },

  "a crimson traveler's cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["guarded_strike"], source: "shop", region: "sanguivorum" },
  "a highland hunter's mantle": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "sanguivorum" },

  "a blood oak charm": { slot: "trinkets", tier: 2, bonuses: { health: 2 }, effects: ["regrowth"], source: "monster", region: "sanguivorum" },
  "a border survey map": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "contract", region: "sanguivorum" },
  "a crimson trade writ": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "shop", region: "sanguivorum" },

  // ---- Vaeloris regional items ----
  // "Living Root Shield" and "Branchrunner Boots" collided with existing
  // Heartwood/Canopy Ranger set items of the same name but different
  // stats, so those two are renamed below; "a living vine ring", "a
  // mossweave cloak", and "a canopy seed charm" already existed from the
  // prior regional batch with matching tier/bonus/effect (only source
  // trivially differed) and were left as-is rather than re-added.
  "an ashwood hunting bow": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "shop", region: "vaeloris" },
  "a thornwood spear": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "monster", region: "vaeloris" },
  "a briar fang knife": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["deep_cut"], source: "shop", region: "vaeloris" },
  "a willowbranch staff": { slot: "mainhand", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "job", region: "vaeloris" },
  "a living vine whip": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "monster", region: "vaeloris" },
  "an elderwood longbow": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["patient_aim"], source: "contract", region: "vaeloris" },
  "a rootbound glaive": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "monster", region: "vaeloris" },
  "a grovekeeper's blade": { slot: "mainhand", tier: 4, bonuses: { atk: 2, magic: 2 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },
  "a moonbark spear": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["opening_reach"], source: "contract", region: "vaeloris" },
  "a heartwood warstaff": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, effects: ["elemental_focus"], source: "job", region: "vaeloris" },

  "a barkwoven buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["regrowth"], source: "shop", region: "vaeloris" },
  "a living root buckler": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a vinebound guard": { slot: "offhand", tier: 3, bonuses: { def: 2, magic: 1 }, effects: ["spell_ward"], source: "job", region: "vaeloris" },
  "an elder bark bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },

  "a canopy hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "vaeloris" },
  "a mosswoven cowl": { slot: "helmet", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "monster", region: "vaeloris" },
  "a branch circlet": { slot: "helmet", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["regrowth"], source: "job", region: "vaeloris" },
  "an elderleaf crown": { slot: "helmet", tier: 4, bonuses: { magic: 4 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },

  "a leafwoven vest": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "shop", region: "vaeloris" },
  "a vinebound jerkin": { slot: "chest", tier: 3, bonuses: { def: 2, health: 1 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a living bark armor": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },
  "an ancient grove harness": { slot: "chest", tier: 4, bonuses: { def: 3, health: 1 }, effects: ["regrowth"], source: "job", region: "vaeloris" },

  "archer's vine wraps": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["patient_aim"], source: "shop", region: "vaeloris" },
  "thorngrip gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "job", region: "vaeloris" },
  "grovekeeper's hands": { slot: "gloves", tier: 4, bonuses: { magic: 2, health: 2 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },

  "branchrunner's trail boots": { slot: "boots", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", region: "vaeloris" },
  "ancient root sandals": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["surefooted"], source: "contract", region: "vaeloris" },

  "a seedkeeper's band": { slot: "rings", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "an emerald grove ring": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", region: "vaeloris" },
  "an elderwood signet": { slot: "rings", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["regrowth"], source: "contract", region: "vaeloris" },

  "prayer seeds": { slot: "necklace", tier: 2, bonuses: { magic: 2 }, effects: ["regrowth"], source: "shop", region: "vaeloris" },
  "a woven vine pendant": { slot: "necklace", tier: 3, bonuses: { health: 2, magic: 1 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a canopy warden charm": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", region: "vaeloris" },
  "a heartwood pendant": { slot: "necklace", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["elemental_focus"], source: "contract", region: "vaeloris" },

  "a leaffall mantle": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["ambush_sense"], source: "monster", region: "vaeloris" },
  "a whisperleaf cloak": { slot: "cloak", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["regrowth"], source: "job", region: "vaeloris" },
  "an emerald canopy mantle": { slot: "cloak", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["ambush_mastery"], source: "contract", region: "vaeloris" },

  "a living acorn": { slot: "trinkets", tier: 2, bonuses: { magic: 2 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "a grovekeeper's whistle": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["ambush_sense"], source: "job", region: "vaeloris" },
  "preserved heartwood sap": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, effects: ["regrowth"], source: "monster", region: "vaeloris" },
  "an elder bloom": { slot: "trinkets", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["elemental_focus"], source: "contract", region: "vaeloris" },
  "a spirit vine cutting": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "job", region: "vaeloris" },
  "a worldroot sprout": { slot: "trinkets", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["elemental_focus"], source: "contract", region: "vaeloris" },

  // ---- Thraekor regional items ----
  "a black-iron hatchet": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["crushing_impact"], source: "shop", region: "thraekor" },
  "a basalt war pick": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["armor_crack"], source: "monster", region: "thraekor" },
  "a forge clan axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "shop", region: "thraekor" },
  "an embersteel longsword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "job", region: "thraekor" },
  "a furnace hammer": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "monster", region: "thraekor" },
  "an obsidian cleaver": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "contract", region: "thraekor" },
  "a runic forge spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "contract", region: "thraekor" },
  "a molten edge greatsword": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["armor_crack"], source: "contract", region: "thraekor" },
  "an ashen king's hammer": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["crushing_impact"], source: "job", region: "thraekor" },
  "a hearthfire war axe": { slot: "mainhand", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["guarded_strike"], source: "contract", region: "thraekor" },

  "a forge buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", region: "thraekor" },
  "a basalt shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", region: "thraekor" },
  "an iron hearth shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", region: "thraekor" },
  "a runebound bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", region: "thraekor" },

  "a forge helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a clan iron helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", region: "thraekor" },
  "a basalt faceguard": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", region: "thraekor" },
  "a runesmith's crown": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "thraekor" },

  "forge apron mail": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "an iron clan hauberk": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", region: "thraekor" },
  "basalt plate": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", region: "thraekor" },
  "an embersteel harness": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["heatproof"], source: "contract", region: "thraekor" },

  "smith's hammer gloves": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, effects: ["crushing_impact"], source: "shop", region: "thraekor" },
  "riveted gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", region: "thraekor" },
  "furnace grip gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["armor_crack"], source: "job", region: "thraekor" },
  "master smith's hands": { slot: "gloves", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["crushing_impact"], source: "contract", region: "thraekor" },

  "iron forge boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "deep mine boots": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["surefooted"], source: "monster", region: "thraekor" },
  "basalt walker greaves": { slot: "boots", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", region: "thraekor" },
  "magma trail greaves": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["heatproof"], source: "contract", region: "thraekor" },

  "an iron clan ring": { slot: "rings", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a runesmith's ring": { slot: "rings", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["elemental_focus"], source: "monster", region: "thraekor" },
  "an emberstone signet": { slot: "rings", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["tactical_memory"], source: "contract", region: "thraekor" },

  "a hammer pendant": { slot: "necklace", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a forge chain": { slot: "necklace", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", region: "thraekor" },
  "a clan ancestor torque": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "monster", region: "thraekor" },
  "a molten core pendant": { slot: "necklace", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["heatproof"], source: "contract", region: "thraekor" },

  "an ashwoven mantle": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a sootcloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "thraekor" },
  "a furnace traveler's cloak": { slot: "cloak", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", region: "thraekor" },
  "a runesmith's mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "thraekor" },

  "a forge ember charm": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "thraekor" },
  "a basalt totem": { slot: "trinkets", tier: 2, bonuses: { atk: 2 }, effects: ["crushing_impact"], source: "monster", region: "thraekor" },
  "an iron clan token": { slot: "trinkets", tier: 3, bonuses: { def: 3 }, effects: ["brace"], source: "job", region: "thraekor" },
  "a runesmith's chisel": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "monster", region: "thraekor" },
  "an embersteel ingot": { slot: "trinkets", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["armor_crack"], source: "contract", region: "thraekor" },
  "a hearthstone": { slot: "trinkets", tier: 4, bonuses: { health: 2, def: 2 }, effects: ["regrowth"], source: "job", region: "thraekor" },
  "a living coal": { slot: "trinkets", tier: 4, bonuses: { magic: 2, def: 2 }, effects: ["elemental_focus"], source: "contract", region: "thraekor" },
  "an ancient forge rune": { slot: "trinkets", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "thraekor" },

  // ---- Norrvael regional items ----
  // "Duelist's Gloves" collided with an existing White Watch set item of
  // the same name but different effect/source, so it's renamed below.
  // "Stormglass Ring" already existed from the prior regional batch with
  // matching tier/bonus/effect/source and needed no change.
  "a white ash saber": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["riposte"], source: "shop", region: "norrvael" },
  "an icebreaker axe": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["crushing_impact"], source: "monster", region: "norrvael" },
  "a coastwarden spear": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "job", region: "norrvael" },
  "a stormglass rapier": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "shop", region: "norrvael" },
  "a froststeel longsword": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "monster", region: "norrvael" },
  "a harbor defender mace": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["crushing_impact"], source: "job", region: "norrvael" },
  "a whalebone harpoon": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "contract", region: "norrvael" },
  "a navigator's boarding blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "contract", region: "norrvael" },
  "a tempest pike": { slot: "mainhand", tier: 4, bonuses: { atk: 2, def: 2 }, effects: ["opening_reach"], source: "contract", region: "norrvael" },
  "a silversteel officer's sword": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "norrvael" },

  "a harbor buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", region: "norrvael" },
  "a stormglass shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "an icebound kite shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "job", region: "norrvael" },
  "a silversteel bulwark": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", region: "norrvael" },

  "a coastwatch helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, effects: ["ambush_sense"], source: "shop", region: "norrvael" },
  "a fur-lined officer's helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["coldproof"], source: "monster", region: "norrvael" },
  "a navigator's hood": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "job", region: "norrvael" },
  "a storm captain's helm": { slot: "helmet", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "norrvael" },

  "a sealskin coat": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["coldproof"], source: "shop", region: "norrvael" },
  "harbor guard mail": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "monster", region: "norrvael" },
  "storm sail brigandine": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["spell_ward"], source: "job", region: "norrvael" },
  "a silversteel breastplate": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", region: "norrvael" },

  "sailmaster's gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "norrvael" },
  "harbor grip gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "monster", region: "norrvael" },
  "storm duelist's gloves": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["feinting_edge"], source: "job", region: "norrvael" },
  "stormglass gauntlets": { slot: "gloves", tier: 4, bonuses: { def: 2, magic: 2 }, effects: ["spell_ward"], source: "contract", region: "norrvael" },

  "icepath boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["surefooted"], source: "shop", region: "norrvael" },
  "harbor walker boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", region: "norrvael" },
  "deepwater boots": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract", region: "norrvael" },

  "a navigator's ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "norrvael" },
  "a harbor master's band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", region: "norrvael" },
  "an admiralty signet": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "norrvael" },

  "a compass pendant": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "norrvael" },
  "a whalebone charm": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, effects: ["executioner"], source: "monster", region: "norrvael" },
  "a captain's chain": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "job", region: "norrvael" },
  "a stormglass medallion": { slot: "necklace", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["spell_ward"], source: "contract", region: "norrvael" },

  "a white fur mantle": { slot: "cloak", tier: 2, bonuses: { def: 2 }, effects: ["coldproof"], source: "shop", region: "norrvael" },
  "a harbor cloak": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "norrvael" },
  "a storm sail cloak": { slot: "cloak", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["spell_ward"], source: "job", region: "norrvael" },
  "an admiral's mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "norrvael" },

  "a sailor's knot charm": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "norrvael" },
  "a lighthouse beacon": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "harbor navigation charts": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["merchants_eye"], source: "job", region: "norrvael" },
  "a stormglass shard": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["spell_ward"], source: "monster", region: "norrvael" },
  "a whale ivory carving": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, effects: ["regrowth"], source: "contract", region: "norrvael" },
  "an officer's logbook": { slot: "trinkets", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "job", region: "norrvael" },
  "a frozen tide pearl": { slot: "trinkets", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["elemental_focus"], source: "contract", region: "norrvael" },
  "a northern star compass": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["trailwise"], source: "contract", region: "norrvael" },

  // ---- Sahrimor regional items ----
  // "Desert Silk Cloak" collided with an existing region:sahrimor item of
  // the same name but a meaningfully different tier/bonus/effect/source,
  // so it's renamed below rather than silently downgrading that item.
  // "Caravan Rider Boots" matched an existing item's tier/bonus/source
  // exactly (only effect differed) and was updated in place instead.
  "a river merchant's scimitar": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["feinting_edge"], source: "shop", region: "sahrimor" },
  "an oasis guard spear": { slot: "mainhand", tier: 2, bonuses: { atk: 2 }, effects: ["opening_reach"], source: "monster", region: "sahrimor" },
  "a brass-edged khopesh": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["deep_cut"], source: "job", region: "sahrimor" },
  "a caravan master's saber": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["riposte"], source: "shop", region: "sahrimor" },
  "a sunsteel falchion": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "monster", region: "sahrimor" },
  "a dune rider lance": { slot: "mainhand", tier: 3, bonuses: { atk: 2, def: 1 }, effects: ["opening_reach"], source: "contract", region: "sahrimor" },
  "an ivory-hilt rapier": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["feinting_edge"], source: "job", region: "sahrimor" },
  "a golden crescent blade": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["riposte"], source: "contract", region: "sahrimor" },
  "a sapphire caravan pike": { slot: "mainhand", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["opening_reach"], source: "contract", region: "sahrimor" },
  "a sunfire war scimitar": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, effects: ["executioner"], source: "contract", region: "sahrimor" },

  "a brass round shield": { slot: "offhand", tier: 2, bonuses: { def: 2 }, effects: ["brace"], source: "shop", region: "sahrimor" },
  "an oasis defender shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, effects: ["stalwart"], source: "monster", region: "sahrimor" },
  "a silk-wrapped buckler": { slot: "offhand", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a gilded caravan shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, effects: ["brace"], source: "contract", region: "sahrimor" },

  "a desert veil hood": { slot: "helmet", tier: 2, bonuses: { knowledge: 2 }, effects: ["heatproof"], source: "shop", region: "sahrimor" },
  "a brass desert helm": { slot: "helmet", tier: 3, bonuses: { def: 3 }, effects: ["heatproof"], source: "monster", region: "sahrimor" },
  "a caravan captain's turban": { slot: "helmet", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a sunlord's circlet": { slot: "helmet", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "sahrimor" },

  "layered desert robes": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["heatproof"], source: "shop", region: "sahrimor" },
  "a merchant guard coat": { slot: "chest", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "sahrimor" },
  "sunwoven brigandine": { slot: "chest", tier: 3, bonuses: { def: 3 }, effects: ["guarded_strike"], source: "job", region: "sahrimor" },
  "a golden caravan harness": { slot: "chest", tier: 4, bonuses: { def: 4 }, effects: ["stalwart"], source: "contract", region: "sahrimor" },

  "silk riding gloves": { slot: "gloves", tier: 2, bonuses: { knowledge: 2 }, effects: ["trailwise"], source: "shop", region: "sahrimor" },
  "caravan guard gauntlets": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, effects: ["guarded_strike"], source: "monster", region: "sahrimor" },
  "jewelcrafter's gloves": { slot: "gloves", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["elemental_focus"], source: "job", region: "sahrimor" },
  "golden duelist gloves": { slot: "gloves", tier: 4, bonuses: { atk: 4 }, effects: ["feinting_edge"], source: "contract", region: "sahrimor" },

  "sandwalker sandals": { slot: "boots", tier: 2, bonuses: { knowledge: 2 }, effects: ["heatproof"], source: "shop", region: "sahrimor" },
  "oasis traveler boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", region: "sahrimor" },
  "dunestrider greaves": { slot: "boots", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["trailwise"], source: "contract", region: "sahrimor" },

  "a brass merchant's ring": { slot: "rings", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", region: "sahrimor" },
  "a sapphire trade band": { slot: "rings", tier: 3, bonuses: { knowledge: 3 }, effects: ["tactical_memory"], source: "job", region: "sahrimor" },
  "a desert ruby ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "monster", region: "sahrimor" },
  "a sultan's signet": { slot: "rings", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["merchants_eye"], source: "contract", region: "sahrimor" },

  "a brass sun pendant": { slot: "necklace", tier: 2, bonuses: { magic: 2 }, effects: ["elemental_focus"], source: "shop", region: "sahrimor" },
  "a caravan compass": { slot: "necklace", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "monster", region: "sahrimor" },
  "a merchant prince's chain": { slot: "necklace", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a sapphire sun medallion": { slot: "necklace", tier: 4, bonuses: { magic: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "sahrimor" },

  "a desert silk shawl": { slot: "cloak", tier: 2, bonuses: { knowledge: 2 }, effects: ["heatproof"], source: "shop", region: "sahrimor" },
  "a caravan mantle": { slot: "cloak", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["trailwise"], source: "monster", region: "sahrimor" },
  "a golden oasis cloak": { slot: "cloak", tier: 3, bonuses: { magic: 2, knowledge: 1 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a sunwoven royal mantle": { slot: "cloak", tier: 4, bonuses: { def: 2, knowledge: 2 }, effects: ["tactical_memory"], source: "contract", region: "sahrimor" },

  "a caravan coin": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, effects: ["merchants_eye"], source: "shop", region: "sahrimor" },
  "an oasis water charm": { slot: "trinkets", tier: 2, bonuses: { health: 2 }, effects: ["regrowth"], source: "monster", region: "sahrimor" },
  "a brass astrolabe": { slot: "trinkets", tier: 3, bonuses: { knowledge: 3 }, effects: ["trailwise"], source: "job", region: "sahrimor" },
  "a desert sunstone": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, effects: ["elemental_focus"], source: "monster", region: "sahrimor" },
  "a merchant's ledger seal": { slot: "trinkets", tier: 3, bonuses: { def: 2, knowledge: 1 }, effects: ["tactical_memory"], source: "contract", region: "sahrimor" },
  "jeweled trade weights": { slot: "trinkets", tier: 4, bonuses: { knowledge: 2, magic: 2 }, effects: ["merchants_eye"], source: "job", region: "sahrimor" },
  "a golden scarab": { slot: "trinkets", tier: 4, bonuses: { health: 2, magic: 2 }, effects: ["regrowth"], source: "contract", region: "sahrimor" },
  "a royal trade charter": { slot: "trinkets", tier: 4, bonuses: { knowledge: 4 }, effects: ["tactical_memory"], source: "contract", region: "sahrimor" },

  // ---- Legendary (tier 5) items ----
  // Legendary names are kept in their given Title Case (unlike every
  // lower-tier item's lowercase-with-article convention) since each is a
  // singular, famous artifact rather than a generic described-in-passing
  // piece of gear — a deliberate departure to make them read distinctly
  // in inventory/loot lines.
  //
  // Source labels here are new narrative categories (world_boss, dungeon,
  // quest, arena, exploration, ancient_vault, secret_quest) rather than
  // the usual shop/monster/job/contract/faction/starter enum — none of
  // these have a matching game system yet (no dungeons, arena, or
  // exploration-find mechanic exist), consistent with how "contract"
  // beyond the two hand-authored capstones was already documented as
  // reserved for future specific quests, not auto-obtainable. This is
  // safe: COMBAT_LOOT_POOL, REGIONAL_LOOT_POOL, and LOOT_BY_TIER all clamp
  // their lookup to tiers 1-4, so a tier-5 item is never pulled into a
  // generic drop regardless of what its `source` string says.
  "Widow's Lament": { slot: "mainhand", tier: 5, bonuses: { atk: 8 }, effects: ["kingslayer"], source: "world_boss" },
  Emberfall: { slot: "mainhand", tier: 5, bonuses: { atk: 8 }, effects: ["momentum"], source: "contract" },
  "Black Horizon": { slot: "mainhand", tier: 5, bonuses: { atk: 6, magic: 2 }, effects: ["spell_echo"], source: "hidden_dungeon" },
  Dawnpiercer: { slot: "mainhand", tier: 5, bonuses: { atk: 7 }, effects: ["hunters_instinct"], source: "quest" },
  Oathbreaker: { slot: "mainhand", tier: 5, bonuses: { atk: 8 }, effects: ["last_stand"], source: "arena" },
  "Winter's Bite": { slot: "mainhand", tier: 5, bonuses: { atk: 7 }, effects: ["iron_will"], source: "world_boss" },
  "Seven Sorrows": { slot: "mainhand", tier: 5, bonuses: { atk: 6, knowledge: 2 }, effects: ["perfect_balance"], source: "exploration" },
  "Leviathan's Folly": { slot: "mainhand", tier: 5, bonuses: { atk: 8 }, effects: ["blood_debt"], source: "world_boss" },
  Crownsplitter: { slot: "mainhand", tier: 5, bonuses: { atk: 8 }, effects: ["overwhelming_force"], source: "ancient_vault" },
  "Whisper of Ash": { slot: "mainhand", tier: 5, bonuses: { atk: 6, magic: 2 }, effects: ["rivers_favor"], source: "secret_quest" },

  "Bulwark of Ages": { slot: "offhand", tier: 5, bonuses: { def: 8 }, effects: ["unbreakable"], source: "world_boss" },
  "Eclipse Guard": { slot: "offhand", tier: 5, bonuses: { def: 6, magic: 2 }, effects: ["spell_echo"], source: "dungeon" },
  "Last Bastion": { slot: "offhand", tier: 5, bonuses: { def: 8 }, effects: ["last_stand"], source: "quest" },
  "Iron Promise": { slot: "offhand", tier: 5, bonuses: { def: 7 }, effects: ["perfect_balance"], source: "contract" },
  "King's Wall": { slot: "offhand", tier: 5, bonuses: { def: 8 }, effects: ["kingslayer"], source: "exploration" },

  "Crown of Embers": { slot: "helmet", tier: 5, bonuses: { magic: 8 }, effects: ["rivers_favor"], source: "quest" },
  "Helm of Silent Stars": { slot: "helmet", tier: 5, bonuses: { def: 8 }, effects: ["iron_will"], source: "dungeon" },
  "Warden's Vigil": { slot: "helmet", tier: 5, bonuses: { def: 6, knowledge: 2 }, effects: ["hunters_instinct"], source: "contract" },
  "Ashen Halo": { slot: "helmet", tier: 5, bonuses: { magic: 8 }, effects: ["spell_echo"], source: "world_boss" },
  "The Empty Crown": { slot: "helmet", tier: 5, bonuses: { def: 7 }, effects: ["last_stand"], source: "exploration" },

  "Heartforge Plate": { slot: "chest", tier: 5, bonuses: { def: 8 }, effects: ["unbreakable"], source: "dungeon" },
  "Mantle of the Last King": { slot: "chest", tier: 5, bonuses: { def: 6, knowledge: 2 }, effects: ["perfect_balance"], source: "quest" },
  "Ashwalker Harness": { slot: "chest", tier: 5, bonuses: { def: 8 }, effects: ["blood_debt"], source: "contract" },
  "Starwoven Vestments": { slot: "chest", tier: 5, bonuses: { magic: 8 }, effects: ["spell_echo"], source: "world_boss" },
  "Bastion Eternal": { slot: "chest", tier: 5, bonuses: { def: 8 }, effects: ["last_stand"], source: "ancient_vault" },

  // ---- Legendary Gloves ----
  "Bloodbound Grips": { slot: "gloves", tier: 5, bonuses: { atk: 8 }, effects: ["blood_debt"], source: "world_boss" },
  "Hands of the Seventh Duel": { slot: "gloves", tier: 5, bonuses: { atk: 6, knowledge: 2 }, effects: ["master_duelist"], source: "arena" },
  "Emberfist Gauntlets": { slot: "gloves", tier: 5, bonuses: { atk: 8 }, effects: ["momentum"], source: "ancient_vault" },
  "Winter's Grasp": { slot: "gloves", tier: 5, bonuses: { def: 8 }, effects: ["iron_will"], source: "dungeon" },
  "Riverwoven Handwraps": { slot: "gloves", tier: 5, bonuses: { magic: 6, def: 2 }, effects: ["rivers_favor"], source: "hidden_quest" },

  // ---- Legendary Boots ----
  "Horizon Walkers": { slot: "boots", tier: 5, bonuses: { def: 8 }, effects: ["hunters_instinct"], source: "exploration" },
  "King's Last March": { slot: "boots", tier: 5, bonuses: { def: 6, knowledge: 2 }, effects: ["last_stand"], source: "quest" },
  "Silent Crossing": { slot: "boots", tier: 5, bonuses: { knowledge: 8 }, effects: ["perfect_balance"], source: "hidden_dungeon" },
  Stormstriders: { slot: "boots", tier: 5, bonuses: { def: 6, magic: 2 }, effects: ["iron_will"], source: "world_boss" },
  "Ashen Footfalls": { slot: "boots", tier: 5, bonuses: { def: 8 }, effects: ["momentum"], source: "contract" },

  // ---- Legendary Rings ----
  "Ring of Endless Resolve": { slot: "rings", tier: 5, bonuses: { def: 8 }, effects: ["unbreakable"], source: "ancient_vault" },
  "Sovereign's Accord": { slot: "rings", tier: 5, bonuses: { knowledge: 6, def: 2 }, effects: ["perfect_balance"], source: "quest" },
  "Crimson Covenant": { slot: "rings", tier: 5, bonuses: { atk: 8 }, effects: ["blood_debt"], source: "world_boss" },
  "Whispering Circle": { slot: "rings", tier: 5, bonuses: { magic: 8 }, effects: ["spell_echo"], source: "exploration" },
  "The Ninth Seal": { slot: "rings", tier: 5, bonuses: { magic: 6, knowledge: 2 }, effects: ["rivers_favor"], source: "secret_quest" },

  // ---- Legendary Necklaces ----
  "Chain of Forgotten Kings": { slot: "necklace", tier: 5, bonuses: { def: 6, knowledge: 2 }, effects: ["kingslayer"], source: "ancient_vault" },
  "Heart of the Phoenix": { slot: "necklace", tier: 5, bonuses: { magic: 8 }, effects: ["last_stand"], source: "world_boss" },
  "Pendant of Silent Waters": { slot: "necklace", tier: 5, bonuses: { magic: 8 }, effects: ["rivers_favor"], source: "hidden_quest" },
  "Warlord's Medal": { slot: "necklace", tier: 5, bonuses: { atk: 8 }, effects: ["hunters_instinct"], source: "arena" },
  "The Broken Compass": { slot: "necklace", tier: 5, bonuses: { knowledge: 8 }, effects: ["perfect_balance"], source: "exploration" },

  // ---- Legendary Cloaks ----
  "Nightfall Mantle": { slot: "cloak", tier: 5, bonuses: { def: 6, magic: 2 }, effects: ["spell_echo"], source: "dungeon" },
  "Cloak of the First Hunt": { slot: "cloak", tier: 5, bonuses: { knowledge: 8 }, effects: ["hunters_instinct"], source: "exploration" },
  "Banner of No Kingdom": { slot: "cloak", tier: 5, bonuses: { def: 8 }, effects: ["last_stand"], source: "quest" },
  "Veil of Falling Stars": { slot: "cloak", tier: 5, bonuses: { magic: 8 }, effects: ["rivers_favor"], source: "world_boss" },
  "The Wanderer's Horizon": { slot: "cloak", tier: 5, bonuses: { def: 6, knowledge: 2 }, effects: ["momentum"], source: "hidden_dungeon" },

  // ---- Legendary Trinkets ----
  "Coin of the Last Emperor": { slot: "trinkets", tier: 5, bonuses: { knowledge: 8 }, effects: ["perfect_balance"], source: "ancient_vault" },
  "The Black Feather": { slot: "trinkets", tier: 5, bonuses: { atk: 6, knowledge: 2 }, effects: ["hunters_instinct"], source: "exploration" },
  "Everburning Ember": { slot: "trinkets", tier: 5, bonuses: { magic: 8 }, effects: ["spell_echo"], source: "world_boss" },
  "Oathstone Fragment": { slot: "trinkets", tier: 5, bonuses: { def: 6, magic: 2 }, effects: ["unbreakable"], source: "hidden_quest" },
  "Echo of the First Bell": { slot: "trinkets", tier: 5, bonuses: { magic: 8 }, effects: ["rivers_favor"], source: "ancient_vault" },
  "Soldier's Final Letter": { slot: "trinkets", tier: 5, bonuses: { atk: 8 }, effects: ["last_stand"], source: "quest" },
  "Glass Eye of the Watcher": { slot: "trinkets", tier: 5, bonuses: { magic: 6, knowledge: 2 }, effects: ["kingslayer"], source: "dungeon" },
  "Ashes of Victory": { slot: "trinkets", tier: 5, bonuses: { atk: 8 }, effects: ["blood_debt"], source: "arena" },

  // ---- Mythic (tier 6) items ----
  // Same Title Case / no-article naming departure as Legendary, one step
  // further up. "hidden_temple" joins the Legendary batch's narrative
  // source labels (world_boss, dungeon, quest, ancient_vault, secret_quest)
  // — still safe, since COMBAT_LOOT_POOL/REGIONAL_LOOT_POOL/LOOT_BY_TIER
  // all clamp their lookups to tiers 1-4, so tier 6 is exactly as inert to
  // the generic loot systems as tier 5 already is.
  Eclipse: { slot: "mainhand", tier: 6, bonuses: { atk: 10 }, effects: ["execution_protocol"], source: "world_boss" },
  "River's End": { slot: "mainhand", tier: 6, bonuses: { magic: 8, knowledge: 2 }, effects: ["twin_rivers"], source: "hidden_temple" },
  Sovereign: { slot: "mainhand", tier: 6, bonuses: { atk: 9 }, effects: ["living_steel"], source: "ancient_vault" },
  "Night Requiem": { slot: "mainhand", tier: 6, bonuses: { atk: 8, magic: 2 }, effects: ["temporal_echo"], source: "secret_quest" },
  Ashmaker: { slot: "mainhand", tier: 6, bonuses: { atk: 10 }, effects: ["second_wind"], source: "world_boss" },

  "Aegis Eternal": { slot: "offhand", tier: 6, bonuses: { def: 10 }, effects: ["guardian_spirit"], source: "ancient_vault" },
  "Mirror of Rivers": { slot: "offhand", tier: 6, bonuses: { def: 8, magic: 2 }, effects: ["adaptive_ward"], source: "hidden_temple" },
  "Bastion Prime": { slot: "offhand", tier: 6, bonuses: { def: 9 }, effects: ["living_steel"], source: "quest" },

  "Crown of Horizons": { slot: "helmet", tier: 6, bonuses: { knowledge: 10 }, effects: ["master_strategist"], source: "quest" },
  "Mindfire Circlet": { slot: "helmet", tier: 6, bonuses: { magic: 10 }, effects: ["arcane_overflow"], source: "world_boss" },
  "Helm of Endless Resolve": { slot: "helmet", tier: 6, bonuses: { def: 9 }, effects: ["guardian_spirit"], source: "ancient_vault" },

  "Eternity Plate": { slot: "chest", tier: 6, bonuses: { def: 10 }, effects: ["living_steel"], source: "dungeon" },
  "Vestments of the River Sage": { slot: "chest", tier: 6, bonuses: { magic: 10 }, effects: ["conduit_mastery"], source: "hidden_temple" },
  "Mantle of the Unyielding": { slot: "chest", tier: 6, bonuses: { def: 8, health: 2 }, effects: ["soul_leech"], source: "quest" },

  // ---- Mythic Gloves ----
  // Two more narrative source labels join this batch ("arena_champion",
  // distinct from Legendary's plain "arena"; "ancient_temple", distinct
  // from "ancient_vault") — still inert to the generic loot pools for the
  // same tier-clamp reason noted above.
  "Hands of the First Duelist": { slot: "gloves", tier: 6, bonuses: { atk: 10 }, effects: ["perfect_timing"], source: "arena_champion" },
  "Lifebinder Grips": { slot: "gloves", tier: 6, bonuses: { atk: 8, health: 2 }, effects: ["soul_leech"], source: "ancient_vault" },
  "Voidwoven Gloves": { slot: "gloves", tier: 6, bonuses: { magic: 10 }, effects: ["temporal_echo"], source: "hidden_temple" },

  // ---- Mythic Boots ----
  "Horizon Tread": { slot: "boots", tier: 6, bonuses: { knowledge: 10 }, effects: ["master_strategist"], source: "exploration" },
  "Riverstep Sandals": { slot: "boots", tier: 6, bonuses: { magic: 8, def: 2 }, effects: ["conduit_mastery"], source: "secret_quest" },
  "Boots of the Unbroken Path": { slot: "boots", tier: 6, bonuses: { def: 10 }, effects: ["guardian_spirit"], source: "world_boss" },

  // ---- Mythic Rings ----
  "Ouroboros Band": { slot: "rings", tier: 6, bonuses: { magic: 10 }, effects: ["twin_rivers"], source: "ancient_temple" },
  "Ring of the Final Victor": { slot: "rings", tier: 6, bonuses: { atk: 10 }, effects: ["execution_protocol"], source: "arena_champion" },
  "Infinite Sigil": { slot: "rings", tier: 6, bonuses: { knowledge: 8, def: 2 }, effects: ["living_steel"], source: "ancient_vault" },

  // ---- Mythic Necklaces ----
  "Worldheart Pendant": { slot: "necklace", tier: 6, bonuses: { health: 10 }, effects: ["soul_leech"], source: "hidden_temple" },
  "Chain of Endless Dawn": { slot: "necklace", tier: 6, bonuses: { magic: 8, knowledge: 2 }, effects: ["arcane_overflow"], source: "world_boss" },

  // ---- Mythic Cloaks ----
  "Veil of Forgotten Skies": { slot: "cloak", tier: 6, bonuses: { def: 8, magic: 2 }, effects: ["adaptive_ward"], source: "ancient_vault" },
  "Mantle of the Last Horizon": { slot: "cloak", tier: 6, bonuses: { knowledge: 10 }, effects: ["master_strategist"], source: "exploration" },

  // ---- Mythic Trinkets ----
  "Hourglass of the Wanderer": { slot: "trinkets", tier: 6, bonuses: { knowledge: 10 }, effects: ["temporal_echo"], source: "hidden_temple" },
  "Heart of the Worldforge": { slot: "trinkets", tier: 6, bonuses: { def: 8, magic: 2 }, effects: ["living_steel"], source: "world_boss" },
  "The Thirteenth Coin": { slot: "trinkets", tier: 6, bonuses: { magic: 10 }, effects: ["perfect_timing"], source: "secret_quest" },

  // ---- Artifact (tier 7) items ----
  // One tier above Mythic — the source table gave every row's Stats
  // column as "Variable" rather than a fixed number, so the bonus splits
  // below are a judgment call: ITEM_TIER_BONUS[7] (12) as a single stat
  // where the passive doesn't obviously favor a secondary stat, or a
  // 10/2-style split leaning toward whichever stat the passive plays into
  // (e.g. magic for the two mage-flavored passives). Same Title Case /
  // no-article naming as Legendary and Mythic, and a new round of
  // narrative source labels (hidden_vault, ancient_titan, forgotten_library,
  // lost_capital, ancient_fortress, hidden_river_shrine, legendary_quest,
  // puzzle_dungeon, hidden_archive, secret_encounter) — still functionally
  // inert to the generic loot systems, same tier-1-4 clamp as every prior
  // tier above Masterwork. All 15 Artifact effects are represented here,
  // including the 3 that are currently inert in combat (Immutable,
  // Fatewoven, Titan's Endurance) — consistent with how inert Legendary/
  // Mythic effects (Iron Will, Unbreakable, Overwhelming Force, Second
  // Wind) were still given real items to carry them.
  "The Hollow Blade": { slot: "mainhand", tier: 7, bonuses: { atk: 12 }, effects: ["echoing_arsenal"], source: "hidden_vault" },
  Worldrender: { slot: "mainhand", tier: 7, bonuses: { atk: 12 }, effects: ["master_of_arms"], source: "ancient_titan" },
  "The Nameless Staff": { slot: "mainhand", tier: 7, bonuses: { magic: 10, knowledge: 2 }, effects: ["arcane_convergence"], source: "forgotten_library" },

  "Aegis of the Last Wall": { slot: "offhand", tier: 7, bonuses: { def: 12 }, effects: ["mirror_soul"], source: "world_boss" },

  "The Crown Without a King": { slot: "helmet", tier: 7, bonuses: { knowledge: 12 }, effects: ["battle_scholar"], source: "lost_capital" },

  "Armor of the First Sentinel": { slot: "chest", tier: 7, bonuses: { def: 12 }, effects: ["titans_endurance"], source: "ancient_fortress" },

  "Gloves of the Empty Throne": { slot: "gloves", tier: 7, bonuses: { atk: 10, def: 2 }, effects: ["fatewoven"], source: "secret_quest" },

  "Steps Between Worlds": { slot: "boots", tier: 7, bonuses: { def: 10, knowledge: 2 }, effects: ["world_walker"], source: "ancient_temple" },

  "Ring of Endless Rivers": { slot: "rings", tier: 7, bonuses: { magic: 12 }, effects: ["conduit_ascendant"], source: "hidden_river_shrine" },
  "The Ouroboros Loop": { slot: "rings", tier: 7, bonuses: { magic: 10, knowledge: 2 }, effects: ["river_harmony"], source: "world_boss" },

  "Chain of the Unforgotten": { slot: "necklace", tier: 7, bonuses: { health: 12 }, effects: ["living_legacy"], source: "legendary_quest" },

  "Mantle of Immutable Night": { slot: "cloak", tier: 7, bonuses: { def: 12 }, effects: ["immutable"], source: "ancient_vault" },

  "Pocket of Holding": { slot: "trinkets", tier: 7, bonuses: { knowledge: 12 }, effects: ["dual_focus"], source: "puzzle_dungeon" },
  "Chronicle of Every Victory": { slot: "trinkets", tier: 7, bonuses: { atk: 8, def: 4 }, effects: ["perfect_recall"], source: "hidden_archive" },
  "The Empty Palm": { slot: "trinkets", tier: 7, bonuses: { atk: 12 }, effects: ["empty_hand"], source: "secret_encounter" },

  // ---- Divine Regalia (tier 8) — Regalia of the First Bloom (Aelthyr) ----
  // A new tier above Artifact: one full 6-piece set per god, each piece a
  // named artifact with its own item-level passive on top of the set's
  // shared 2/4/6pc bonuses (SETS["Regalia of the First Bloom"] in
  // data/sets.js). Still functionally inert to the generic loot systems,
  // same tier-1-4 clamp as every other tier above Masterwork. Source isn't
  // broken out per-piece the way Legendary/Mythic/Artifact items were —
  // these are presented as a cohesive drop set, so "monster" (the same
  // convention every earlier gear SET used) covers all six.
  "Dawnbloom Branch": { slot: "mainhand", tier: 8, bonuses: { magic: 10, health: 6 }, effects: ["living_current"], source: "monster", set: "Regalia of the First Bloom" },
  "Verdant Aegis": { slot: "offhand", tier: 8, bonuses: { def: 10, health: 6 }, effects: ["rooted_resolve"], source: "monster", set: "Regalia of the First Bloom" },
  "Raiment of Endless Spring": { slot: "chest", tier: 8, bonuses: { health: 12, magic: 4 }, effects: ["flourishing_soul"], source: "monster", set: "Regalia of the First Bloom" },
  "Ring of Verdant Promise": { slot: "rings", tier: 8, bonuses: { magic: 8, health: 8 }, effects: ["seedbearer"], source: "monster", set: "Regalia of the First Bloom" },
  "Sandals of Living Roots": { slot: "boots", tier: 8, bonuses: { def: 8, health: 8 }, effects: ["natures_persistence"], source: "monster", set: "Regalia of the First Bloom" },
  "Seed of First Dawn": { slot: "trinkets", tier: 8, bonuses: { health: 10, magic: 6 }, effects: ["endless_bloom"], source: "monster", set: "Regalia of the First Bloom" },

  // ---- Divine Regalia (tier 8) — Regalia of the Final Veil (Mortasha) ----
  "Lantern of Quiet Passage": { slot: "mainhand", tier: 8, bonuses: { magic: 10, knowledge: 6 }, effects: ["gentle_crossing"], source: "monster", set: "Regalia of the Final Veil" },
  "Veil of the Ferryman": { slot: "offhand", tier: 8, bonuses: { def: 10, magic: 6 }, effects: ["between_worlds"], source: "monster", set: "Regalia of the Final Veil" },
  "Vestments of Silent Repose": { slot: "chest", tier: 8, bonuses: { def: 12, magic: 4 }, effects: ["rest_eternal"], source: "monster", set: "Regalia of the Final Veil" },
  "Ring of Last Breath": { slot: "rings", tier: 8, bonuses: { magic: 8, knowledge: 8 }, effects: ["passing_whisper"], source: "monster", set: "Regalia of the Final Veil" },
  "Gravewalker's Sandals": { slot: "boots", tier: 8, bonuses: { def: 8, knowledge: 8 }, effects: ["calm_beyond_fear"], source: "monster", set: "Regalia of the Final Veil" },
  "Coin of the Ferryman": { slot: "trinkets", tier: 8, bonuses: { knowledge: 10, magic: 6 }, effects: ["soul_ledger"], source: "monster", set: "Regalia of the Final Veil" },

  // ---- Divine Regalia (tier 8) — Regalia of the Woven Thread (Veylana) ----
  "Loom of Destinies": { slot: "mainhand", tier: 8, bonuses: { magic: 10, knowledge: 6 }, effects: ["foreseen_strike"], source: "monster", set: "Regalia of the Woven Thread" },
  "Threadkeeper's Spindle": { slot: "offhand", tier: 8, bonuses: { def: 10, magic: 6 }, effects: ["redirected_fate"], source: "monster", set: "Regalia of the Woven Thread" },
  "Robes of the Infinite Tapestry": { slot: "chest", tier: 8, bonuses: { knowledge: 10, def: 6 }, effects: ["threads_intertwined"], source: "monster", set: "Regalia of the Woven Thread" },
  "Ring of Unbroken Consequence": { slot: "rings", tier: 8, bonuses: { knowledge: 8, magic: 8 }, effects: ["every_choice_matters"], source: "monster", set: "Regalia of the Woven Thread" },
  "Boots of the Hidden Path": { slot: "boots", tier: 8, bonuses: { def: 8, knowledge: 8 }, effects: ["guided_footsteps"], source: "monster", set: "Regalia of the Woven Thread" },
  "Silver Thread of Veylana": { slot: "trinkets", tier: 8, bonuses: { knowledge: 10, magic: 6 }, effects: ["weavers_insight"], source: "monster", set: "Regalia of the Woven Thread" },

  // ---- Divine Regalia (tier 8) — Regalia of the Crimson Vanguard (Kar'Mhal) ----
  "Warfather's Edge": { slot: "mainhand", tier: 8, bonuses: { atk: 12, def: 4 }, effects: ["worthy_challenge"], source: "monster", set: "Regalia of the Crimson Vanguard" },
  "Bulwark of Champions": { slot: "offhand", tier: 8, bonuses: { def: 12, atk: 4 }, effects: ["unbroken_line"], source: "monster", set: "Regalia of the Crimson Vanguard" },
  "Armor of the First Legion": { slot: "chest", tier: 8, bonuses: { def: 12, health: 4 }, effects: ["battle_tempered"], source: "monster", set: "Regalia of the Crimson Vanguard" },
  "Ring of Conquest": { slot: "rings", tier: 8, bonuses: { atk: 10, knowledge: 6 }, effects: ["victors_momentum"], source: "monster", set: "Regalia of the Crimson Vanguard" },
  "Gauntlets of the Unyielding": { slot: "gloves", tier: 8, bonuses: { atk: 10, def: 6 }, effects: ["clash_of_steel"], source: "monster", set: "Regalia of the Crimson Vanguard" },
  "General's Standard": { slot: "trinkets", tier: 8, bonuses: { atk: 8, def: 8 }, effects: ["rally_the_line"], source: "monster", set: "Regalia of the Crimson Vanguard" },

  // ---- Divine Regalia (tier 8) — Regalia of the Endless Archive (Ithrien) ----
  "Codex of Infinite Horizons": { slot: "mainhand", tier: 8, bonuses: { magic: 12, knowledge: 4 }, effects: ["endless_study"], source: "monster", set: "Regalia of the Endless Archive" },
  "Librarian's Ward": { slot: "offhand", tier: 8, bonuses: { def: 10, knowledge: 6 }, effects: ["prepared_response"], source: "monster", set: "Regalia of the Endless Archive" },
  "Vestments of the First Scholar": { slot: "chest", tier: 8, bonuses: { magic: 10, knowledge: 6 }, effects: ["expanding_mind"], source: "monster", set: "Regalia of the Endless Archive" },
  "Ring of Boundless Inquiry": { slot: "rings", tier: 8, bonuses: { knowledge: 8, magic: 8 }, effects: ["eureka"], source: "monster", set: "Regalia of the Endless Archive" },
  "Gloves of Careful Script": { slot: "gloves", tier: 8, bonuses: { knowledge: 8, def: 8 }, effects: ["precision_formula"], source: "monster", set: "Regalia of the Endless Archive" },
  "Scholar's Seal": { slot: "trinkets", tier: 8, bonuses: { knowledge: 10, magic: 6 }, effects: ["archive_eternal"], source: "monster", set: "Regalia of the Endless Archive" },

  // ---- Divine Regalia (tier 8) — Regalia of the Eternal Heart (Seressa) ----
  "Roseheart Scepter": { slot: "mainhand", tier: 8, bonuses: { magic: 10, health: 6 }, effects: ["compassions_grace"], source: "monster", set: "Regalia of the Eternal Heart" },
  "Heartward Embrace": { slot: "offhand", tier: 8, bonuses: { def: 10, magic: 6 }, effects: ["shared_burden"], source: "monster", set: "Regalia of the Eternal Heart" },
  "Vestments of Boundless Devotion": { slot: "chest", tier: 8, bonuses: { health: 12, magic: 4 }, effects: ["unwavering_devotion"], source: "monster", set: "Regalia of the Eternal Heart" },
  "Ring of Sacred Vows": { slot: "rings", tier: 8, bonuses: { health: 8, magic: 8 }, effects: ["faithful_heart"], source: "monster", set: "Regalia of the Eternal Heart" },
  "Cloak of Gentle Light": { slot: "cloak", tier: 8, bonuses: { def: 8, knowledge: 8 }, effects: ["calming_presence"], source: "monster", set: "Regalia of the Eternal Heart" },
  "Bloom of Devotion": { slot: "trinkets", tier: 8, bonuses: { health: 10, knowledge: 6 }, effects: ["love_endures"], source: "monster", set: "Regalia of the Eternal Heart" },

  // ---- Divine Regalia (tier 8) — Regalia of the Laughing Gale (Nystros) ----
  "Trickster's Cane": { slot: "mainhand", tier: 8, bonuses: { magic: 10, knowledge: 6 }, effects: ["loaded_dice"], source: "monster", set: "Regalia of the Laughing Gale" },
  "Coincatcher's Buckler": { slot: "offhand", tier: 8, bonuses: { def: 10, magic: 6 }, effects: ["fortunes_favor"], source: "monster", set: "Regalia of the Laughing Gale" },
  "Garments of the Wandering Breeze": { slot: "chest", tier: 8, bonuses: { def: 10, knowledge: 6 }, effects: ["winds_of_change"], source: "monster", set: "Regalia of the Laughing Gale" },
  "Ring of Lucky Misfortune": { slot: "rings", tier: 8, bonuses: { magic: 8, knowledge: 8 }, effects: ["unlikely_outcome"], source: "monster", set: "Regalia of the Laughing Gale" },
  "Boots of the Wandering Wind": { slot: "boots", tier: 8, bonuses: { def: 8, knowledge: 8 }, effects: ["never_where_expected"], source: "monster", set: "Regalia of the Laughing Gale" },
  "Gambler's Coin": { slot: "trinkets", tier: 8, bonuses: { knowledge: 10, magic: 6 }, effects: ["double_or_nothing"], source: "monster", set: "Regalia of the Laughing Gale" },

  // ---- Divine Regalia (tier 8) — Regalia of the Eternal Bastion (Xalaxar) ----
  // "Ageless Bulwark" replaces the source text's "Bulwark of Ages" — that
  // exact name is already taken by an existing Legendary-tier offhand item
  // (js/data/items.js, tier 5, "unbreakable"), and ITEM_DEFS keys must be
  // unique.
  "Foundation's Hammer": { slot: "mainhand", tier: 8, bonuses: { atk: 10, def: 6 }, effects: ["stones_patience"], source: "monster", set: "Regalia of the Eternal Bastion" },
  "Ageless Bulwark": { slot: "offhand", tier: 8, bonuses: { def: 12, health: 4 }, effects: ["unyielding_wall"], source: "monster", set: "Regalia of the Eternal Bastion" },
  "Stonewarden Plate": { slot: "chest", tier: 8, bonuses: { def: 12, health: 4 }, effects: ["bedrock"], source: "monster", set: "Regalia of the Eternal Bastion" },
  "Ring of Immutable Law": { slot: "rings", tier: 8, bonuses: { def: 10, knowledge: 6 }, effects: ["ordered_mind"], source: "monster", set: "Regalia of the Eternal Bastion" },
  "Stillwarden Greaves": { slot: "boots", tier: 8, bonuses: { def: 10, health: 6 }, effects: ["grounded"], source: "monster", set: "Regalia of the Eternal Bastion" },
  "Keystone of Endurance": { slot: "trinkets", tier: 8, bonuses: { def: 8, health: 8 }, effects: ["lasting_foundation"], source: "monster", set: "Regalia of the Eternal Bastion" },

  // ---- Divine Regalia (tier 8) — Regalia of the Endless Horizon (Aethyra) ----
  "Galecaller": { slot: "mainhand", tier: 8, bonuses: { atk: 10, magic: 6 }, effects: ["momentum_unbound"], source: "monster", set: "Regalia of the Endless Horizon" },
  "Wayfinder's Compass": { slot: "offhand", tier: 8, bonuses: { def: 10, knowledge: 6 }, effects: ["open_road"], source: "monster", set: "Regalia of the Endless Horizon" },
  "Mantle of Wandering Skies": { slot: "chest", tier: 8, bonuses: { def: 10, magic: 6 }, effects: ["unbound_spirit"], source: "monster", set: "Regalia of the Endless Horizon" },
  "Ring of Far Horizons": { slot: "rings", tier: 8, bonuses: { knowledge: 8, magic: 8 }, effects: ["wanderers_reward"], source: "monster", set: "Regalia of the Endless Horizon" },
  "Windstep Boots": { slot: "boots", tier: 8, bonuses: { def: 10, knowledge: 6 }, effects: ["swift_passage"], source: "monster", set: "Regalia of the Endless Horizon" },
  "Feather of the First Wind": { slot: "trinkets", tier: 8, bonuses: { knowledge: 10, magic: 6 }, effects: ["trailblazer"], source: "monster", set: "Regalia of the Endless Horizon" },
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

// Derived at load time: every "monster"-sourced item that also carries a
// `region` (nation) tag, grouped by [region][tier] — the regional sibling
// of COMBAT_LOOT_POOL, consulted by rollCreatureLoot when the defeated
// creature is itself nation-locked (BESTIARY's optional `nations` field).
const REGIONAL_LOOT_POOL = {};
for (const [name, def] of Object.entries(ITEM_DEFS)) {
  if (def.source !== "monster" || !def.region) continue;
  if (!REGIONAL_LOOT_POOL[def.region]) REGIONAL_LOOT_POOL[def.region] = {};
  if (!REGIONAL_LOOT_POOL[def.region][def.tier]) REGIONAL_LOOT_POOL[def.region][def.tier] = [];
  REGIONAL_LOOT_POOL[def.region][def.tier].push(name);
}

// Derived at load time: every "job"-sourced item that also carries a
// `region` tag, grouped by [region][tier] — consulted by data/jobs.js's
// rewardForDifficulty so a job posted on a given nation's board can hand
// out that nation's own gear instead of only the generic LOOT_BY_TIER
// list. Defined here (not in jobs.js, which loads first) since ITEM_DEFS
// only exists once this file has parsed; jobs.js reads this global at
// call time, well after both files have loaded.
const REGIONAL_JOB_LOOT_POOL = {};
for (const [name, def] of Object.entries(ITEM_DEFS)) {
  if (def.source !== "job" || !def.region) continue;
  if (!REGIONAL_JOB_LOOT_POOL[def.region]) REGIONAL_JOB_LOOT_POOL[def.region] = {};
  if (!REGIONAL_JOB_LOOT_POOL[def.region][def.tier]) REGIONAL_JOB_LOOT_POOL[def.region][def.tier] = [];
  REGIONAL_JOB_LOOT_POOL[def.region][def.tier].push(name);
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
// danger: 16% at tier 1 up to 40% at tier 4. Master Appraiser's 6pc set
// bonus raises that chance by 20% (relative). Nation-locked creatures
// (BESTIARY's optional `nations` field) have a 50% chance to draw from
// that nation's REGIONAL_LOOT_POOL instead of the generic pool, when one
// exists at this tier — everything else (most creatures have no `nations`
// restriction) behaves exactly as before.
function rollCreatureLoot(state, creature) {
  const tier = Math.max(1, Math.min(4, creature.tier || 1));
  let dropChance = 0.08 + tier * 0.08;
  if (hasSetTier(state, "Master Appraiser", 6)) dropChance *= 1.2;
  if (Math.random() >= dropChance) return null;
  if (creature.nations && creature.nations.length) {
    const nation = creature.nations[Math.floor(Math.random() * creature.nations.length)];
    const regionalPool = REGIONAL_LOOT_POOL[nation] && REGIONAL_LOOT_POOL[nation][tier];
    if (regionalPool && regionalPool.length && Math.random() < 0.5) {
      return regionalPool[Math.floor(Math.random() * regionalPool.length)];
    }
  }
  const pool = COMBAT_LOOT_POOL[tier];
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
