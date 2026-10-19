/*
 * FRAGMENTA — Travel & Pathfinding
 * Dijkstra over the LOCATIONS graph, weighted by in-game days.
 */

// One Dijkstra, shared by both lookups below (they used to be two
// near-identical 25-line copies). Walks outward from fromId by travel days
// and stops at the first popped location for which shouldStop(id, loc)
// returns true. Returns { id, dist, prev } or null if nothing matched.
function dijkstraUntil(fromId, shouldStop) {
  const dist = {};
  const prev = {};
  const visited = new Set();
  Object.keys(LOCATIONS).forEach((id) => (dist[id] = Infinity));
  dist[fromId] = 0;
  while (true) {
    let current = null;
    let best = Infinity;
    for (const id of Object.keys(LOCATIONS)) {
      if (!visited.has(id) && dist[id] < best) {
        best = dist[id];
        current = id;
      }
    }
    if (current === null) return null;
    if (shouldStop(current, LOCATIONS[current])) return { id: current, dist, prev };
    visited.add(current);
    for (const conn of LOCATIONS[current].connections) {
      if (!(conn.to in dist)) continue; // dangling edge — tools/audit.js reports these
      const alt = dist[current] + conn.days;
      if (alt < dist[conn.to]) {
        dist[conn.to] = alt;
        prev[conn.to] = current;
      }
    }
  }
}

// Nearest location matching `predicate` (other than fromId itself, unless
// fromId already matches). Used for Dungeon Delve's rescue destination
// ("nearest inn" — engine/combat.js's dungeonRescue). Returns null if
// nothing in the whole graph matches.
function findNearestLocation(fromId, predicate) {
  if (predicate(fromId, LOCATIONS[fromId])) return { id: fromId, days: 0 };
  const hit = dijkstraUntil(fromId, (id, loc) => id !== fromId && predicate(id, loc));
  return hit ? { id: hit.id, days: hit.dist[hit.id] } : null;
}

function findPath(fromId, toId) {
  if (fromId === toId) return { path: [fromId], days: 0 };
  const hit = dijkstraUntil(fromId, (id) => id === toId);
  if (!hit) return null;
  const path = [toId];
  let cur = toId;
  while (hit.prev[cur] !== undefined) {
    cur = hit.prev[cur];
    path.unshift(cur);
  }
  return { path, days: hit.dist[toId] };
}

// Strip punctuation so "rivers gate" matches "River's Gate" and
// "khar veth" matches "Khar-Veth".
function normalizeName(s) {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findLocationByName(query) {
  const q = normalizeName(query);
  if (!q) return null;
  if (LOCATIONS[query.trim().toLowerCase()]) return query.trim().toLowerCase();
  let best = null;
  for (const [id, loc] of Object.entries(LOCATIONS)) {
    const name = normalizeName(loc.name);
    if (name === q) return id;
    if ((name.includes(q) || q.includes(name)) && !best) {
      best = id;
    }
  }
  return best;
}

function connectionMatchingName(fromId, query) {
  const loc = LOCATIONS[fromId];
  const q = normalizeName(query);
  for (const conn of loc.connections) {
    const target = normalizeName(LOCATIONS[conn.to].name);
    if (target.includes(q) || q.includes(target)) {
      return conn;
    }
  }
  return null;
}

// Matches "go <name>" against a city's own sublocations (see
// world.js — only a handful of hub cities have these so far), by either
// the place's display name or its raw data key ("tavern", "market", ...).
function findSublocationByName(loc, query) {
  if (!loc.sublocations) return null;
  const q = normalizeName(query);
  if (!q) return null;
  for (const [id, sub] of Object.entries(loc.sublocations)) {
    const name = normalizeName(sub.name);
    if (name === q || normalizeName(id) === q) return id;
  }
  // "go" strips a leading "the" off the player's own query (see
  // stripLeadingWords in parser.js), so a place literally named "The X"
  // can never win the tier-1 exact match above through ordinary typing —
  // check again with each candidate's own leading "the" stripped before
  // falling back to fuzzy substring matching, so "The Harbor Gate" still
  // resolves precisely against "harbor gate" even with a same-city
  // "Harbor Gates" (no "the") sitting right next to it.
  for (const [id, sub] of Object.entries(loc.sublocations)) {
    const name = normalizeName(sub.name).replace(/^the\s+/, "");
    if (name === q) return id;
  }
  // Among substring matches, prefer the closest name length rather than
  // simply the first one found in insertion order — otherwise a shorter
  // hub name that's a strict prefix of a longer building's name (e.g. "The
  // Sea Bastion" vs. "The Sea Bastion Forge") would always lose to
  // whichever entry happens to come first in the object.
  let best = null;
  let bestDiff = Infinity;
  for (const [id, sub] of Object.entries(loc.sublocations)) {
    const name = normalizeName(sub.name);
    if (name.includes(q) || q.includes(name)) {
      const diff = Math.abs(name.length - q.length);
      if (diff < bestDiff) {
        best = id;
        bestDiff = diff;
      }
    }
  }
  return best;
}

// "go back"/"go square"/"go <city's own name>" from inside one of a
// city's sublocations — heads back to the city's main square/gate
// (state.subLocation = null) rather than trying to travel elsewhere.
const RETURN_TO_SQUARE_WORDS = ["square", "town square", "gate", "gates", "outside", "back", "center", "centre"];
function isReturnToSquareQuery(loc, query) {
  const q = normalizeName(query);
  if (!q) return false;
  if (RETURN_TO_SQUARE_WORDS.includes(q)) return true;
  const cityName = normalizeName(loc.name);
  return cityName === q || cityName.includes(q) || q.includes(cityName);
}
