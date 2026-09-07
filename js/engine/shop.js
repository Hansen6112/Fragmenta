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

// How many units of a stock item are actually available to buy — not
// given anywhere in the original design (buying never used to deplete
// stock at all), so this is this implementation's own reasonable call:
// gear is scarce (a shop only ever has a couple of any one weapon/armor
// piece), potions are plentiful (restocked constantly, not hand-crafted).
// Only meaningful now that menu-driven buying asks "how many?" — the
// typed 'buy <number>' path (cmdBuy) is capped by this exact same number.
function rollStockQty(itemName) {
  const def = getItemDef(itemName);
  if (def && def.slot === "consumable") return 5 + Math.floor(Math.random() * 6); // 5-10
  return 1 + Math.floor(Math.random() * 3); // 1-3
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
    const stock = [...consumables, ...gearStock];
    const qty = {};
    for (const name of stock) qty[name] = rollStockQty(name);
    shop = { stock, qty, lastRefresh: state.day };
    state.shops[key] = shop;
  } else if (!shop.qty) {
    // Backward compatibility: a save from before per-item quantity
    // existed has stock/lastRefresh but no qty map yet — backfill it
    // without discarding or force-refreshing the stock it already has.
    shop.qty = {};
    for (const name of shop.stock) shop.qty[name] = rollStockQty(name);
  }
  return shop;
}

function buyShopItem(state, locId, index, qty) {
  const shop = getOrRefreshShop(state, locId);
  const item = shop.stock[index];
  if (!item) return { ok: false, message: "Nothing at that number." };
  const wanted = Math.max(1, Math.floor(qty) || 1);
  const available = shop.qty[item] || 0;
  if (available <= 0) return { ok: false, message: `${formatItemLine(item)} is sold out. Check back after the next restock.` };
  if (wanted > available) {
    return { ok: false, message: `The shop only has ${available} of ${formatItemLine(item)} left.` };
  }
  const price = shopBuyPrice(item, state) * wanted;
  if (state.gold < price) {
    return { ok: false, message: `You can't afford ${wanted > 1 ? `${wanted}x ` : ""}${formatItemLine(item)} (${price} gold; you have ${state.gold}).` };
  }
  state.gold -= price;
  for (let i = 0; i < wanted; i++) state.inventory.push(item);
  shop.qty[item] = available - wanted;
  return { ok: true, item, price, qty: wanted, remaining: shop.qty[item] };
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

// Structured data for the shop menu (main.js renders one button per buy/
// sell option) — richer than combat's flat {label, command} pairs since
// a buy button needs its own index/remaining-quantity for the "how many?"
// follow-up prompt, and main.js calls buyShopItem/sellInventoryItem
// directly rather than round-tripping through a typed command string (the
// same direct-call pattern renderParty()'s stance buttons already use).
// Returns null wherever cmdShop itself would refuse (no shop, or closed).
function buildShopMenu(state) {
  const loc = state.currentPlace();
  if (!loc || !effectiveServices(loc).includes("shop")) return null;
  if (!isShopOpen(state)) return null;
  const shop = getOrRefreshShop(state, state.location);

  const buyOptions = shop.stock.map((item, index) => {
    const remaining = shop.qty[item] || 0;
    const price = shopBuyPrice(item, state);
    return {
      index,
      item,
      price,
      remaining,
      label: remaining > 0 ? `Buy: ${formatItemLine(item)} — ${price} gold (${remaining} left)` : `Buy: ${formatItemLine(item)} — sold out`,
    };
  });

  // One row per distinct item the player's carrying, same aggregation
  // renderItemList (main.js) already uses for the Inventory tab — a
  // ritual item (shopSellPrice returns null) just doesn't get a Sell row.
  const counts = new Map();
  for (const item of state.inventory) counts.set(item, (counts.get(item) || 0) + 1);
  const sellOptions = [];
  for (const [item, count] of counts) {
    const price = shopSellPrice(item, state);
    if (price == null) continue;
    sellOptions.push({
      item,
      price,
      owned: count,
      label: `Sell: ${formatItemLine(item)} — ${price} gold${count > 1 ? ` (own ${count})` : ""}`,
    });
  }

  return { locName: loc.name, gold: state.gold, buyOptions, sellOptions };
}
