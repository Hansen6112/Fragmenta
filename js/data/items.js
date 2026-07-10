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
  "a lizardfolk bone-spear": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, source: "monster", set: "Lizardfolk" },
  "an ash-tempered war-axe": { slot: "mainhand", tier: 3, bonuses: { atk: 3 }, source: "monster" },
  "a Kabal-forged conduit blade": { slot: "mainhand", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Off Hand
  "a battered wooden buckler": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a cracked leather targe": { slot: "offhand", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a reinforced legion scutum": { slot: "offhand", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a dwarven ironclad buckler": { slot: "offhand", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Vaeloris bark-shield, still faintly alive": { slot: "offhand", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a sahrimori sun-round shield": { slot: "offhand", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "a drake-scale kite shield": { slot: "offhand", tier: 4, bonuses: { def: 4 }, source: "monster", set: "Drake Hunter" },

  // Helmet
  "a dented iron skullcap": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a woven desert shemagh": { slot: "helmet", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion centurion's helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a lizardfolk bone-crest helm": { slot: "helmet", tier: 2, bonuses: { def: 2 }, source: "monster", set: "Lizardfolk" },
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
  "a drake-scale cuirass": { slot: "chest", tier: 4, bonuses: { def: 4 }, source: "monster", set: "Drake Hunter" },

  // Gloves
  "worn leather gloves": { slot: "gloves", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a pair of desert wrap-cloths": { slot: "gloves", tier: 1, bonuses: { atk: 1 }, source: "monster" },
  "reinforced legion vambraces": { slot: "gloves", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "dwarven forge-gauntlets": { slot: "gloves", tier: 2, bonuses: { atk: 2 }, source: "monster" },
  "lizardfolk claw-guards": { slot: "gloves", tier: 3, bonuses: { atk: 3 }, source: "monster", set: "Lizardfolk" },
  "ash-runed gauntlets": { slot: "gloves", tier: 3, bonuses: { def: 3 }, source: "monster" },
  "conduit-threaded gloves, warm to the touch": { slot: "gloves", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Boots
  "worn traveler's boots": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "sand-worn desert sandals": { slot: "boots", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "legion march boots": { slot: "boots", tier: 2, bonuses: { def: 2 }, effects: ["trailwise"], source: "monster", set: "Legion" },
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
  "a lizardfolk bone ring": { slot: "rings", tier: 3, bonuses: { magic: 3 }, source: "monster", set: "Lizardfolk" },
  "a conduit-set ring, faintly humming": { slot: "rings", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Necklace
  "a simple beaded necklace": { slot: "necklace", tier: 1, bonuses: { magic: 1 }, source: "monster" },
  "a strung-shell choker": { slot: "necklace", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a merchant's coin necklace": { slot: "necklace", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a dwarven clan-chain": { slot: "necklace", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Kabal novitiate's warded pendant": { slot: "necklace", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a drake-tooth necklace": { slot: "necklace", tier: 3, bonuses: { atk: 3 }, source: "monster", set: "Drake Hunter" },
  "an amethyst conduit pendant": { slot: "necklace", tier: 4, bonuses: { magic: 4 }, source: "monster" },

  // Cloak
  "a patched wool cloak": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a sun-faded desert mantle": { slot: "cloak", tier: 1, bonuses: { def: 1 }, source: "monster" },
  "a legion field cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a dwarven ash-cloak": { slot: "cloak", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Vaeloris leaf-cloak, near invisible in the canopy": { slot: "cloak", tier: 3, bonuses: { knowledge: 3 }, source: "monster" },
  "a mist-touched traveling cloak": { slot: "cloak", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a drakeskin cloak, warm against any cold": { slot: "cloak", tier: 4, bonuses: { def: 4 }, source: "monster", set: "Drake Hunter" },

  // Trinkets
  "a lucky river stone": { slot: "trinkets", tier: 1, bonuses: { knowledge: 1 }, source: "monster" },
  "a carved wooden charm": { slot: "trinkets", tier: 1, bonuses: { health: 1 }, source: "monster" },
  "a merchant's lucky coin": { slot: "trinkets", tier: 2, bonuses: { knowledge: 2 }, source: "monster" },
  "a dwarven luck-rune": { slot: "trinkets", tier: 2, bonuses: { def: 2 }, source: "monster" },
  "a Kabal-blessed focus stone": { slot: "trinkets", tier: 3, bonuses: { magic: 3 }, source: "monster" },
  "a lizardfolk totem charm": { slot: "trinkets", tier: 3, bonuses: { health: 3 }, source: "monster", set: "Lizardfolk" },
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
  "a drakebone hunting bow, fletched with shed scale": { slot: "mainhand", tier: 4, bonuses: { atk: 4 }, source: "monster", set: "Drake Hunter" },

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
  "a lizardfolk scale jerkin": { slot: "chest", tier: 2, bonuses: { def: 2 }, effects: ["corrosionproof"], source: "monster", set: "Lizardfolk" },
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
  "boots made from pale drake hide": { slot: "boots", tier: 4, bonuses: { def: 3, atk: 1 }, effects: ["coldproof", "surefooted"], source: "monster", set: "Drake Hunter" },

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
  "a drake's shed eye-scale, polished into a lens": { slot: "trinkets", tier: 4, bonuses: { atk: 2, knowledge: 2 }, effects: ["ambush_sense", "patient_aim"], source: "monster", set: "Drake Hunter" },

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
  "mossrunner boots": { slot: "boots", tier: 3, bonuses: { knowledge: 3 }, effects: ["surefooted"], source: "job", set: "Heartwood" },
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
// danger: 16% at tier 1 up to 40% at tier 4. Master Appraiser's 6pc set
// bonus raises that chance by 20% (relative).
function rollCreatureLoot(state, creature) {
  const tier = Math.max(1, Math.min(4, creature.tier || 1));
  const pool = COMBAT_LOOT_POOL[tier];
  if (!pool || !pool.length) return null;
  let dropChance = 0.08 + tier * 0.08;
  if (hasSetTier(state, "Master Appraiser", 6)) dropChance *= 1.2;
  if (Math.random() >= dropChance) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
