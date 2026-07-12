/*
 * FRAGMENTA — Shop
 * Wires up data/items.js's source:"shop" catalog (188 items, including
 * three always-in-stock travel potions) into an actual buy/sell economy,
 * mirroring engine/jobs.js's board pattern: state.shops[locId] = { stock,
 * lastRefresh }, regenerated from a per-location eligible pool once
 * SHOP_REFRESH_DAYS have passed.
 *
 * Stock eligibility:
 *   - No `region` and no guild-gated `set` (see SET_TO_GUILD below): a
 *     generic item, available at any location with the "shop" service.
 *   - `region: <nation>`: only at a shop-service location IN that nation.
 *   - `set` naming a real, purchasable guild (currently just Mugamiir
 *     Safor — see data/jobs.js's GUILD_HQ): only at that guild's HQ.
 * Every OTHER `set` name among shop items (Legion, Vanguard, Scout Corps,
 * Stonewarden, Sandstrider, ...) is a flavor/archetype label, not an
 * actual purchasable guild membership — GUILD_HQ has no entry for them,
 * so there's no real location to gate them to. They stay in the generic
 * bucket rather than inventing a location tie that doesn't exist yet.
 */

const SHOP_REFRESH_DAYS = 4;
const SHOP_STOCK_SIZE = 8;
const SET_TO_GUILD = { "Mugamiir Safor": "mugamiir_safor", "Magma-Hearth": "magma_hearth" };

// A sublocation's optional `shopCategory` (see world.js) narrows its stock
// to matching equipment slots — Legion's Arms sells weapons, not potions.
// Undefined (every shop so far) means no filtering at all, the original
// generic-goods behavior.
const SHOP_CATEGORY_SLOTS = {
  weapons: ["mainhand"],
  armor: ["offhand", "helmet", "chest", "gloves", "boots", "cloak"],
  potions: ["consumable"],
  jewelry: ["rings", "necklace", "trinkets"],
};

// Shops keep ordinary daylight hours — open through the morning and
// afternoon, closed by evening. Checked separately from stock
// eligibility/refresh above; a shop can exist at a location and simply
// not be open right now.
function isShopOpen(state) {
  const part = getDaypart(state.hour);
  return part === "morning" || part === "afternoon";
}

function eligibleShopItems(locId, category) {
  const loc = LOCATIONS[locId];
  if (!loc) return [];
  const allowedSlots = category && SHOP_CATEGORY_SLOTS[category];
  const out = [];
  for (const [name, def] of Object.entries(ITEM_DEFS)) {
    if (def.source !== "shop") continue;
    if (def.region && def.region !== loc.nation) continue;
    const guild = def.set && SET_TO_GUILD[def.set];
    if (guild && GUILD_HQ[locId] !== guild) continue;
    if (allowedSlots && !allowedSlots.includes(def.slot)) continue;
    out.push(name);
  }
  return out;
}

// A specialized shop's stock lives independently of both the city's
// general stock and every other specialized shop in the same city — keyed
// by city:sublocation rather than just the city id. Every shop so far has
// no shopCategory, so this resolves to the plain city id exactly as
// before; only a real shopCategory on the CURRENT sublocation changes it.
function shopKeyAndCategory(state, locId) {
  const place = state.location === locId ? state.currentSublocation() : null;
  const category = place && place.shopCategory;
  const key = category ? `${locId}:${state.subLocation}` : locId;
  return { key, category };
}

// Fisher-Yates, capped to however many items actually exist for a spot.
function sampleItems(pool, n) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Potions are always in stock (subject to the same region/guild gating
// as everything else) rather than part of the random gear roll — a shop
// running out of basic healing draughts on an unlucky refresh would be a
// worse experience than "gear varies, but you can always restock
// potions." Everything else still rotates.
function getOrRefreshShop(state, locId) {
  const { key, category } = shopKeyAndCategory(state, locId);
  let shop = state.shops[key];
  if (!shop || state.day - shop.lastRefresh >= SHOP_REFRESH_DAYS) {
    const pool = eligibleShopItems(locId, category);
    // A category other than "potions" excludes consumables entirely
    // (a weaponsmith doesn't stock healing draughts); no category, or
    // category "potions" itself, keeps the always-in-stock behavior.
    const consumables = category && category !== "potions" ? [] : pool.filter((name) => ITEM_DEFS[name].slot === "consumable");
    const gear = pool.filter((name) => ITEM_DEFS[name].slot !== "consumable");
    const gearStock = sampleItems(gear, Math.min(SHOP_STOCK_SIZE, gear.length));
    shop = { stock: [...consumables, ...gearStock], lastRefresh: state.day };
    state.shops[key] = shop;
  }
  return shop;
}

function buyShopItem(state, locId, index) {
  const shop = getOrRefreshShop(state, locId);
  const item = shop.stock[index];
  if (!item) return { ok: false, message: "Nothing at that number." };
  const price = shopBuyPrice(item, state);
  if (state.gold < price) {
    return { ok: false, message: `You can't afford ${formatItemLine(item)} (${price} gold; you have ${state.gold}).` };
  }
  state.gold -= price;
  state.inventory.push(item);
  return { ok: true, item, price };
}

// Only ever searches state.inventory, not equipped gear or an ally's own
// equipment — sell what's actually in the shared pack; unequip/reclaim
// first if it's worn.
function sellInventoryItem(state, needle) {
  const idx = state.inventory.findIndex((i) => i.toLowerCase().includes(needle));
  if (idx < 0) return { ok: false, message: `You aren't carrying "${needle}".` };
  const item = state.inventory[idx];
  const price = shopSellPrice(item, state);
  if (price == null) return { ok: false, message: `No shop will buy ${item}.` };
  state.inventory.splice(idx, 1);
  state.gold += price;
  return { ok: true, item, price };
}
