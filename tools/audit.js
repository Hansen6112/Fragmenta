#!/usr/bin/env node
/*
 * FRAGMENTA — Data & state integrity audit (dev tool, never loaded by the game)
 *
 *   node tools/audit.js            # human-readable report
 *   node tools/audit.js --strict   # also exit 1 on warnings
 *
 * Loads every <script> listed in index.html, in order, into one sandbox
 * with a stub DOM — exactly how the browser sees them — then checks the
 * cross-file contracts nothing at runtime enforces: registry ids that
 * point at nothing (the sylmae/sylmere class of bug), world edges with no
 * way back, creatures whose tags no spawn source emits, state fields that
 * never reach the save, and so on. ERRORS are things that are broken now;
 * WARNINGS are drift that will bite later. No dependencies beyond Node.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sources = Object.fromEntries(scripts.map((s) => [s, fs.readFileSync(path.join(ROOT, s), "utf8")]));

// ---- sandbox ----
function el() {
  const e = {
    style: {}, dataset: {}, children: [], hidden: true, value: "", textContent: "", innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { return c; }, append() {}, prepend() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return el(); }, querySelectorAll() { return []; }, focus() {},
    scrollIntoView() {}, replaceChildren() {}, closest() { return null; },
  };
  return e;
}
const store = {};
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, setTimeout: () => 0, clearTimeout() {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el() },
  addEventListener() {},
};
ctx.window = ctx;
vm.createContext(ctx);
for (const s of scripts) vm.runInContext(sources[s], ctx, { filename: s });
const G = (name) => vm.runInContext(name, ctx);

const errors = [];
const warnings = [];
const err = (cat, msg) => errors.push(`[${cat}] ${msg}`);
const warn = (cat, msg) => warnings.push(`[${cat}] ${msg}`);

const LOCATIONS = G("LOCATIONS"), NATIONS = G("NATIONS"), FACTIONS = G("FACTIONS"), ITEM_DEFS = G("ITEM_DEFS");
const BESTIARY = G("BESTIARY"), ENEMY_ABILITIES = G("ENEMY_ABILITIES"), STATUS_EFFECTS = G("STATUS_EFFECTS");
const EFFECT_DEFS = G("EFFECT_DEFS"), SETS = G("SETS"), ORIGINS = G("ORIGINS"), RACES = G("RACES"), CLASSES = G("CLASSES");
const TERRAIN_TAGS = G("TERRAIN_TAGS"), AREA_TYPES = G("AREA_TYPES"), ALLY_DEFS = G("ALLY_DEFS"), EQUIP_SLOTS = G("EQUIP_SLOTS");
const engineSrc = scripts.filter((s) => !s.startsWith("js/data/")).map((s) => sources[s]).join("\n");

// ---- duplicate top-level function declarations (the later one silently wins) ----
const fnSeen = {};
for (const s of scripts) {
  sources[s].split("\n").forEach((line, i) => {
    const m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (!m) return;
    if (fnSeen[m[1]]) err("dup-function", `${m[1]} declared at ${fnSeen[m[1]]} and ${s}:${i + 1}`);
    else fnSeen[m[1]] = `${s}:${i + 1}`;
  });
}

// ---- world graph ----
for (const [id, loc] of Object.entries(LOCATIONS)) {
  if (!NATIONS[loc.nation]) err("world", `${id}.nation "${loc.nation}" is not a NATIONS key`);
  if (!FACTIONS[loc.nation]) err("world", `${id}.nation "${loc.nation}" has no FACTIONS entry (reputation can't track it)`);
  if (loc.terrain && !TERRAIN_TAGS[loc.terrain]) err("world", `${id}.terrain "${loc.terrain}" is not a TERRAIN_TAGS key`);
  if (loc.type && !AREA_TYPES[loc.type]) warn("world", `${id}.type "${loc.type}" is not an AREA_TYPES key`);
  for (const c of loc.connections || []) {
    if (!LOCATIONS[c.to]) { err("world", `${id} -> "${c.to}": no such location`); continue; }
    const back = (LOCATIONS[c.to].connections || []).find((x) => x.to === id);
    if (!back) err("world", `${id} -> ${c.to} has no return edge`);
    else if (back.days !== c.days) warn("world", `${id} <-> ${c.to}: ${c.days} days one way, ${back.days} the other`);
  }
  for (const [sid, sub] of Object.entries(loc.sublocations || {})) {
    if (sub.type && !AREA_TYPES[sub.type]) err("world", `${id}.sublocations.${sid}.type "${sub.type}" is not an AREA_TYPES key`);
  }
}
const starts = new Set(Object.values(ORIGINS).map((o) => o.startLocation));
const reached = new Set();
const queue = [...starts].filter((s) => LOCATIONS[s]);
while (queue.length) {
  const id = queue.pop();
  if (reached.has(id)) continue;
  reached.add(id);
  for (const c of LOCATIONS[id].connections || []) if (LOCATIONS[c.to]) queue.push(c.to);
}
for (const id of Object.keys(LOCATIONS)) if (!reached.has(id)) err("world", `${id} is unreachable from every Origin's start`);

// ---- origins / races ----
const RACE_BUDGET = G("typeof RACE_BUDGET === 'undefined' ? null : RACE_BUDGET");
for (const [id, o] of Object.entries(ORIGINS)) {
  if (!LOCATIONS[o.startLocation]) err("origin", `${id}.startLocation "${o.startLocation}" missing`);
  if (o.raceKey !== null && !RACES[o.raceKey]) err("origin", `${id}.raceKey "${o.raceKey}" missing`);
  for (const f of Object.keys(o.reputation || {})) if (!FACTIONS[f]) err("origin", `${id}.reputation key "${f}" is not a faction`);
}
if (RACE_BUDGET != null) {
  const mods = ["atkMod", "defMod", "healthMod", "magicMod", "knowledgeMod", "speedMod", "accuracyMod", "agilityMod"];
  for (const [id, r] of Object.entries(RACES)) {
    const sum = mods.reduce((a, k) => a + (r[k] || 0), 0);
    if (sum !== RACE_BUDGET) warn("race", `${id} stat mods sum to ${sum}, RACE_BUDGET says ${RACE_BUDGET}`);
  }
}

// ---- bestiary ----
const emitted = new Set(Object.values(TERRAIN_TAGS).flat());
for (const loc of Object.values(LOCATIONS)) for (const sub of Object.values(loc.sublocations || {})) (sub.dangerTags || []).forEach((t) => emitted.add(t));
const directSpawns = new Set([...engineSrc.matchAll(/startCombat\(state,\s*"([^"]+)"/g)].map((m) => m[1]));
const handledTrigger = (t) => new RegExp(`["'\`]${t}["'\`]`).test(engineSrc);
for (const [id, c] of Object.entries(BESTIARY)) {
  for (const a of [...(c.actives || []), ...(c.passives || [])]) if (!ENEMY_ABILITIES[a]) err("bestiary", `${id} references unknown ability "${a}"`);
  for (const a of c.actives || []) if (ENEMY_ABILITIES[a] && ENEMY_ABILITIES[a].type !== "active") warn("bestiary", `${id}.actives has non-active "${a}"`);
  for (const a of c.passives || []) if (ENEMY_ABILITIES[a] && ENEMY_ABILITIES[a].type !== "passive") warn("bestiary", `${id}.passives has non-passive "${a}"`);
  for (const l of c.locations || []) if (!LOCATIONS[l]) err("bestiary", `${id}.locations "${l}" is not a location id`);
  for (const n of c.nations || []) if (!NATIONS[n]) err("bestiary", `${id}.nations "${n}" is not a nation`);
  if (!c.special && !directSpawns.has(id) && !(c.tags || []).some((t) => emitted.has(t))) {
    err("bestiary", `${id} can never spawn — none of its tags [${c.tags}] is emitted by any terrain/sublocation`);
  }
}
for (const [id, a] of Object.entries(ENEMY_ABILITIES)) {
  if (a.type === "passive" && a.trigger && !handledTrigger(a.trigger) && !handledTrigger(id)) {
    const users = Object.entries(BESTIARY).filter(([, c]) => (c.passives || []).includes(id)).length;
    if (users) warn("ability", `passive ${id} (trigger "${a.trigger}") is on ${users} creature(s) but no engine code handles that trigger — inert`);
  }
  const inflict = a.inflict && a.inflict.status;
  if (inflict && !STATUS_EFFECTS[inflict]) err("ability", `${id}.inflict.status "${inflict}" is not a STATUS_EFFECTS key`);
}

// ---- level caps (Phase 0: players cap at 25, enemies cap at 30) ----
for (const [id, c] of Object.entries(BESTIARY)) {
  if (c.levelRange && c.levelRange[1] > 30) err("level-cap", `${id}.levelRange max is ${c.levelRange[1]}, over the 30 cap`);
  if (typeof c.encounterLevel === "number" && c.encounterLevel > 30) err("level-cap", `${id}.encounterLevel is ${c.encounterLevel}, over the 30 cap`);
}

// ---- items / effects / sets ----
for (const [name, d] of Object.entries(ITEM_DEFS)) {
  for (const e of d.effects || []) if (!EFFECT_DEFS[e]) err("item", `"${name}" has unknown effect "${e}"`);
  if (d.set && !SETS[d.set]) err("item", `"${name}" belongs to unknown set "${d.set}"`);
}
for (const m of engineSrc.matchAll(/hasEffect\([^,]+,\s*"([^"]+)"\)/g)) if (!EFFECT_DEFS[m[1]]) err("effect", `hasEffect(..., "${m[1]}") — not an EFFECT_DEFS key`);
for (const m of engineSrc.matchAll(/(?:hasSetTier|setPieceCount)\([^,]+,\s*"([^"]+)"/g)) if (!SETS[m[1]]) err("set", `"${m[1]}" is not a SETS key`);
for (const [id, a] of Object.entries(ALLY_DEFS)) {
  for (const [slot, v] of Object.entries(a.startingEquipment || {})) for (const it of [].concat(v || [])) if (!ITEM_DEFS[it]) err("ally", `${id}.startingEquipment.${slot} "${it}" is not an item`);
}
// Item source audit (Loot Reachability Fixes v2, §4): classify every
// equippable item by whether a real delivery path reaches it. The pools
// below are the REAL ones — built from the same data structures the game
// itself reads at runtime, not a name search over the source text. A name
// search would count enemy-worn gear as "reachable" just because its own
// name appears once, in its own BESTIARY equipment field — exactly the
// false negative this replaces (the old `literalUses > 1` fallback below
// is gone for that reason).
//
// LIVE: real delivery code exists for this source. `world_boss` is the
// one exception handled per-item rather than per-source: live for a piece
// some creature actually wears (checked against the real worn-gear pool,
// built from BESTIARY below), reserved for one nothing wears yet.
const LIVE_ITEM_SOURCES = new Set(["starter", "shop", "monster", "enemy_gear", "world_boss", "job", "arena", "arena_champion", "crafted", "companion"]);
// RESERVED: tagged for a system that isn't built yet — never an R2 error
// on its own, just counted in the summary below.
const RESERVED_ITEM_SOURCES = new Set([
  "devotion_quest", "contract", "faction",
  "quest", "secret_quest", "hidden_quest", "legendary_quest",
  "exploration", "dungeon", "hidden_dungeon", "puzzle_dungeon",
  "ancient_vault", "hidden_vault", "hidden_temple", "ancient_temple",
  "ancient_titan", "forgotten_library", "lost_capital", "ancient_fortress",
  "hidden_river_shrine", "hidden_archive", "secret_encounter",
]);
// R1: source is neither live nor reserved — catches a new or misspelled source.
for (const [n, d] of Object.entries(ITEM_DEFS)) {
  if (!LIVE_ITEM_SOURCES.has(d.source) && !RESERVED_ITEM_SOURCES.has(d.source)) {
    err("item-source", `"${n}" has source "${d.source}" — not a recognized live or reserved source (R1)`);
  }
}
// The real worn-gear pool: every item any BESTIARY creature's own
// equipment/equipmentBands (every band resolved, not just the one a given
// fight happens to roll) actually lists — the delivery path for
// "enemy_gear" and "world_boss" (when worn).
const wornItems = new Set();
for (const c of Object.values(BESTIARY)) {
  const sets = c.equipmentBands ? c.equipmentBands.map((b) => b.equipment) : c.equipment ? [c.equipment] : [];
  for (const eq of sets) for (const v of Object.values(eq)) for (const it of [].concat(v || [])) wornItems.add(it);
}
const reachable = new Set();
const add = (x) => typeof x === "string" && reachable.add(x);
for (const t of [1, 2, 3, 4]) (G("COMBAT_LOOT_POOL")[t] || []).forEach(add);
for (const reg of Object.values(G("REGIONAL_LOOT_POOL"))) for (const t of [1, 2, 3, 4]) (reg[t] || []).forEach(add);
for (const reg of Object.values(G("REGIONAL_JOB_LOOT_POOL"))) Object.values(reg).flat().forEach(add);
G("ARENA_LOOT_POOL").forEach(add);
G("ARENA_CHAMPION_LOOT_POOL").forEach(add);
Object.values(G("LOOT_BY_TIER")).flat().forEach(add);
Object.values(ORIGINS).forEach((o) => (o.inventory || []).forEach(add));
Object.values(ALLY_DEFS).forEach((a) => Object.values(a.startingEquipment || {}).flat().forEach(add));
for (const t of ["RECIPES", "SCHEMATICS"]) Object.values(G(t)).forEach((r) => add(r.output));
for (const [n, d] of Object.entries(ITEM_DEFS)) if (d.source === "shop") add(n);
wornItems.forEach(add);
// R2 (a live-sourced item its own path doesn't reach) and R3 (a "monster"
// item above the kill-loot tier cap), plus the live/reserved summary.
let liveReachable = 0;
const reservedCounts = {};
const r2 = [];
for (const [n, d] of Object.entries(ITEM_DEFS)) {
  if (RESERVED_ITEM_SOURCES.has(d.source)) { reservedCounts[d.source] = (reservedCounts[d.source] || 0) + 1; continue; }
  if (!LIVE_ITEM_SOURCES.has(d.source)) continue; // already an R1 error above
  if (d.source === "world_boss" && !wornItems.has(n)) { reservedCounts["world_boss (unworn)"] = (reservedCounts["world_boss (unworn)"] || 0) + 1; continue; }
  if (d.source === "monster" && d.tier > 4) { err("item-source", `"${n}" is source "monster" at tier ${d.tier}, above the kill-loot tier cap (R3)`); continue; }
  if (!reachable.has(n)) { r2.push(`${n} (${d.source})`); continue; }
  liveReachable++;
}
if (r2.length) err("item-source", `R2: ${r2.length} item(s) with a live source nothing actually reaches: ${r2.join(", ")}`);
const reservedTotal = Object.values(reservedCounts).reduce((a, b) => a + b, 0);

// ---- save coverage ----
const fresh = G("new GameState()");
const saved = Object.keys(fresh.toJSON());
const transient = new Set(["combat", "loadWarnings"]);
for (const k of Object.keys(fresh)) if (!saved.includes(k) && !transient.has(k)) err("save", `GameState.${k} is never written by toJSON — it resets on every load`);

// ---- report ----
const print = (title, list) => {
  if (!list.length) return;
  process.stdout.write(`\n${title} (${list.length})\n`);
  for (const l of list) process.stdout.write(`  ${l}\n`);
};
print("ERRORS", errors);
print("WARNINGS", warnings);
process.stdout.write(`\n[items] live-reachable: ${liveReachable}/${Object.keys(ITEM_DEFS).length}; reserved: ${reservedTotal} (${JSON.stringify(reservedCounts)}); R2 violations: ${r2.length}\n`);
process.stdout.write(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${scripts.length} scripts.\n`);
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
