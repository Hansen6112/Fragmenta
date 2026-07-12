/*
 * FRAGMENTA — Area Types
 * The shared vocabulary for "what kind of place is this," usable at two
 * levels: a top-level LOCATIONS entry (a city's own square/gate, or a
 * standalone non-city spot like a ruin or wilderness stretch) AND a
 * city's own `sublocations` entries (see world.js). One registry, same
 * tags, both levels — a city interior and a stretch of wilderness are
 * both just "areas."
 *
 * `services` is the mechanical default (rest/shop/guild — what actually
 * gates cmdRest/cmdShop/cmdContracts via state.currentPlace()). A place
 * can still set its own `services` array to override this default; that
 * always wins over the type's.
 *
 * `commands` is advisory only — printed by cmdLook as a hint, never
 * enforced. Every verb keeps working exactly where it already does
 * regardless of what's listed here.
 *
 * `safe` is a flavor/documentation flag, not a mechanic — encounter
 * chance is still driven entirely by a location's own `danger` field
 * (see travel.js's executeTravel). It's here so a future encounter-
 * flavor pass has somewhere to read "is this the kind of place that
 * should feel unsafe" without re-deriving it from terrain or danger.
 */
const AREA_TYPES = {
  gate: { services: [], commands: ["look", "places", "go"], safe: true },
  street: { services: [], commands: ["look", "places", "talk"], safe: true },
  market: { services: ["shop"], commands: ["shop", "buy", "sell", "talk"], safe: true },
  inn: { services: ["rest"], commands: ["rest", "sleep", "talk"], safe: true },
  shop: { services: ["shop"], commands: ["shop", "buy", "sell"], safe: true },
  temple: { services: [], commands: ["talk"], safe: true },
  barracks: { services: [], commands: ["talk"], safe: true },
  guildhall: { services: ["guild"], commands: ["contracts", "sign"], safe: true },
  board: { services: [], commands: ["board", "talk"], safe: true },
  residential: { services: [], commands: ["talk"], safe: true },
  docks: { services: [], commands: ["talk", "go"], safe: true },
  ruins: { services: [], commands: ["explore", "search"], safe: false },
  wilderness: { services: [], commands: ["explore", "search", "flee"], safe: false },
  landmark: { services: [], commands: ["look", "examine"], safe: true },
};

// A place's actual services: whatever it declares itself, else its
// type's default, else nothing. Read by state.js's currentPlace-driven
// service gates and by cmdLook's "Services available" line.
function effectiveServices(place) {
  if (!place) return [];
  if (place.services) return place.services;
  const type = AREA_TYPES[place.type];
  return (type && type.services) || [];
}

// Advisory-only hint list for cmdLook — never gates anything.
function effectiveCommands(place) {
  if (!place) return [];
  if (place.commands) return place.commands;
  const type = AREA_TYPES[place.type];
  return (type && type.commands) || [];
}
