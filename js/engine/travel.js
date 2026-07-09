/*
 * FRAGMENTA — Travel & Pathfinding
 * Dijkstra over the LOCATIONS graph, weighted by in-game days.
 */

function findPath(fromId, toId) {
  if (fromId === toId) return { path: [fromId], days: 0 };
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
    if (current === null) break;
    if (current === toId) break;
    visited.add(current);
    const loc = LOCATIONS[current];
    for (const conn of loc.connections) {
      const alt = dist[current] + conn.days;
      if (alt < dist[conn.to]) {
        dist[conn.to] = alt;
        prev[conn.to] = current;
      }
    }
  }

  if (dist[toId] === Infinity || dist[toId] === undefined) return null;

  const path = [toId];
  let cur = toId;
  while (prev[cur] !== undefined) {
    cur = prev[cur];
    path.unshift(cur);
  }
  return { path, days: dist[toId] };
}

// Strip punctuation so "rivers gate" matches "River's Gate" and
// "khaz vetha" matches "Khaz-Vetha".
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
