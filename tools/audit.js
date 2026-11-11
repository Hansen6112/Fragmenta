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
// Companion quest rewards: items a `companion`-sourced item's own path
// delivers OUTSIDE ally starting equipment — Hadrian's Personal Quest
// ascension (data/hadrianquest.js's HADRIAN_ASCENSION_MAP, swapped into
// his equipment on completion by engine/hadrianquest.js's
// ascendHadrianEquipment) and its two Companion Trinkets
// (HADRIAN_QUEST_TRINKETS, filled in the same way). Read from the actual
// grant data, not a text search, so a renamed or added reward is picked
// up automatically instead of silently going stale here.
Object.values(G("HADRIAN_ASCENSION_MAP")).forEach(add);
G("HADRIAN_QUEST_TRINKETS").forEach(add);
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

// ---- combat HP writes (Combat Rebuild Phase 1, step 1f §6 turned this
// on for decreases; step 1g-ii §2b extends it to increases: "writes to
// .hp/.health with +=, or = Math.min(max, ...), in the three combat
// files, outside applyHealing/applyAndReact (plus fighter creation,
// buildFightCreature/legacyScaledCreature)." ) ----
// P1: a combat creature's HP/Health may only be written inside
// applyAndReact's own call graph (its top-level dispatch, every tail it
// dispatches to, and applyPlayerDamage/checkDeathPrevention -- the
// shared primitives those tails call into, one level down), or, for
// healing specifically, inside applyHeal (the player-only original) or
// applyHealing (its step 1g-ii §2b generalization, now the one shared
// entry point for an ally/enemy heal too). Scoped to the three combat
// engine files; dungeon.js's trap damage is a structurally separate
// system (never touches state.combat) and is correctly outside this
// rule's reach by simply not being scanned. Healing OUTSIDE combat (inns,
// the healer, potions used outside a fight, injury cures) lives in other
// files entirely (parser.js, dungeon.js, ...), so it's naturally outside
// P1_FILES too -- confirmed by reading each, not assumed.
//
// Exemptions, each disclosed here rather than silently matched:
//   - Every *Legacy-named function (combat.js/companion.js): kept
//     oracles for Layer 1 forced-roll parity tests, confirmed to have
//     ZERO live callers anywhere outside tools/tests/ -- their own
//     direct writes (decreases AND increases -- e.g.
//     resolveEnemyAttackOnAllyLegacy's own healOnHitPct copy,
//     useHadrianActiveLegacy's own Unyielding Advance heal) are the
//     ORIGINAL code, deliberately preserved byte-for-byte, never
//     executed by an actual player.
//   - buildFightCreature/legacyScaledCreature (combat.js): creature
//     CONSTRUCTION (setting a freshly-built creature's starting/scaled
//     hp), not combat resolution.
//   - resolveEnemyRetaliation (combat.js): confirmed dead code (zero
//     callers anywhere, live or test) -- superseded by
//     resolveEnemyAttackOnPlayer when the enemy-to-player path was
//     migrated in step 1b, never deleted. Its own healOnHitPct copy is
//     dead for the same reason. A step 1h candidate ("delete old
//     per-pair paths"), not touched here.
//   - useHadrianActive: REMOVED in step 1g-ii §2a. Groundbreaker's splash
//     now runs through resolveHadrianActiveDamage's own packSplash
//     targeting (steps 2-5), same as any other hit, so this exemption no
//     longer matches anything -- settling the "not a migration gap, a
//     Phase 2 registry candidate" question the 1f-era comment here used
//     to raise.
//   - Dregnar: step 1g-i deleted the /^resolve[Dd]regnar/ and
//     /^dregnarResolve/ exemption the handoff carried over from 1f "until
//     1g" -- it matched ZERO lines even before deletion (Dregnar's own
//     damage already reaches resolveEnemyAttackOnPlayer/
//     resolveEnemyAttackOnAlly, shared with every other enemy since steps
//     1b/1c), and keeping a no-op exemption only invites future misuse.
const P1_FILES = ["js/engine/combat.js", "js/engine/pipeline.js", "js/engine/companion.js"];
// Step 1g-ii §2c: hardened beyond the plain `-=`/`+=`/`= Math.min(...)`
// forms to also catch the same decrease written as a self-assignment
// (`x.hp = x.hp - ...`, `x.health = x.health - ...` -- the `([\w.]+)...\1`/
// `\2` backreferences require the SAME expression on both sides of `=`)
// or as a zero-floored subtraction (`x.hp = Math.max(0, ... - ...)`).
// Confirmed by reading every match these two new forms produce today
// (3, all inside already-allowed functions -- riposteCounterByEnemyOnAllyLegacy,
// applyAndReactReactionOnAlly, maybeHadrianAllyProtection): zero new
// allowances needed, this is purely a hardening, not a new exemption.
const P1_PATTERN = /\.hp\s*-=|\.health\s*-=|\.hp\s*\+=|\.health\s*\+=|\.hp\s*=\s*Math\.min\(|\.health\s*=\s*Math\.min\(|([\w.]+)\.hp\s*=\s*\1\.hp\s*-|([\w.]+)\.health\s*=\s*\2\.health\s*-|\.hp\s*=\s*Math\.max\(\s*0\s*,|\.health\s*=\s*Math\.max\(\s*0\s*,/g;
const P1_ALLOWED_FNS = new Set([
  "applyAndReact", "applyAndReactPlayerActor", "applyAndReactAllyActor",
  "applyAndReactReactionOnPlayer", "applyAndReactReactionOnAlly", "applyAndReactReactionOnEnemy",
  "applyAndReactMirrorSoul", "applyAndReactTick", "applyAndReactTickOnEnemy",
  "applyAndReactTickOnPlayer", "applyAndReactTickOnAlly",
  "applyPlayerDamage", "checkDeathPrevention", "maybeHadrianAllyProtection",
  "buildFightCreature", "legacyScaledCreature", "resolveEnemyRetaliation",
  "applyHeal", "applyHealing",
]);
const P1_ALLOWED_PATTERNS = [/Legacy$/];
let p1Hits = 0;
for (const f of P1_FILES) {
  const src = sources[f];
  if (!src) continue;
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.split("//")[0]);
  let fn = "(top-level)";
  for (let i = 0; i < codeOnly.length; i++) {
    const m = codeOnly[i].match(/^function\s+([A-Za-z0-9_]+)\s*\(/);
    if (m) fn = m[1];
    if (!P1_PATTERN.test(codeOnly[i])) { P1_PATTERN.lastIndex = 0; continue; }
    P1_PATTERN.lastIndex = 0;
    const allowed = P1_ALLOWED_FNS.has(fn) || P1_ALLOWED_PATTERNS.some((p) => p.test(fn));
    if (!allowed) { err("hp-write", `${f}:${i + 1} (${fn}) writes combat HP outside applyAndReact's/applyHealing's own call graph -- "${codeOnly[i].trim()}" (P1)`); p1Hits++; }
  }
}

// ---- action definitions (Combat Rebuild Phase 1, step 1e completion
// handoff, 9 Nov 2026 follow-up: P2/P4) ----
// P2: every action definition (js/data/actions.js's PLAYER_ACTION_DEFS,
// plus TACTICS/APOTHECARY_ABILITIES/ELEMENT_ABILITIES' own `action`
// blocks) is complete -- targeting/toHit/actionType declared, damage (or
// null) consistent with toHit, and every formula/hook it names actually
// exists. test_strike is deliberately absent from this list: its own
// proof registers that definition at runtime, specifically so it never
// appears in the real game's data tables (and therefore never reaches
// this audit either).
const PIPELINE_HOOK_NAMES = new Set(Object.keys(G("PIPELINE_HOOKS")));
const PIPELINE_FORMULA_NAMES = new Set(Object.keys(G("PIPELINE_FORMULAS")));
const ACTION_TABLE_NAMES = ["PLAYER_ACTION_DEFS", "TACTICS", "APOTHECARY_ABILITIES", "ELEMENT_ABILITIES"];
for (const tableName of ACTION_TABLE_NAMES) {
  const table = G(tableName);
  for (const id of Object.keys(table)) {
    const def = G(`getActionDef(${JSON.stringify(id)})`);
    if (!def.targeting) { err("action-def", `"${id}" (${tableName}) has no \`targeting\` declared (P2)`); continue; }
    if (def.toHit !== "roll" && def.toHit !== "none") { err("action-def", `"${id}" (${tableName}) has toHit "${def.toHit}" -- must be "roll" or "none" (P2)`); continue; }
    if (!def.actionType) { err("action-def", `"${id}" (${tableName}) has no \`actionType\` declared (P2)`); continue; }
    if (def.toHit === "roll") {
      if (typeof def.formula !== "string" || !PIPELINE_FORMULA_NAMES.has(def.formula)) {
        err("action-def", `"${id}" (${tableName}) has toHit:"roll" but formula "${def.formula}" is not a PIPELINE_FORMULAS key (P2)`);
      }
      if (def.elementOnHit && !PIPELINE_HOOK_NAMES.has(def.elementOnHit)) {
        err("action-def", `"${id}" (${tableName}) names elementOnHit hook "${def.elementOnHit}", not a PIPELINE_HOOKS key (P2)`);
      }
    } else if (def.damage !== null) {
      err("action-def", `"${id}" (${tableName}) has toHit:"none" but damage is "${def.damage}", not declared null (P2)`);
    }
  }
}
// Step 1f-ii: P2, extended to ENEMY_ABILITIES (js/data/enemyabilities.js)
// -- "the same way 1e extended TACTICS" (the governing handoff's own
// words). Every ACTIVE entry (passives are untouched -- they're resolved
// by trigger, not through the attack pipeline, so targeting/toHit/
// formula don't apply to them) must declare targeting/toHit/actionType,
// and if toHit:"roll" (every active, always, per js/data/enemyabilities.
// js's own ENEMY_ACTIVE_ACTION_SHAPE), a formula that's really a
// PIPELINE_FORMULAS key. getEnemyAbility is the merge point (same
// flattening shape as getActionDef), so checking its OWN return value
// here is checking exactly what resolveEnemyActiveAbility (js/engine/
// combat.js) actually reads at runtime. ENEMY_BASIC_ATTACK_DEF (the "no
// active chosen" case's own definition) is checked directly, the same
// as PLAYER_ACTION_DEFS.basic_attack is checked above via its table.
const ENEMY_ABILITIES_TABLE = G("ENEMY_ABILITIES");
for (const id of Object.keys(ENEMY_ABILITIES_TABLE)) {
  if (ENEMY_ABILITIES_TABLE[id].type !== "active") continue;
  const def = G(`getEnemyAbility(${JSON.stringify(id)})`);
  if (!def.targeting) { err("action-def", `"${id}" (ENEMY_ABILITIES) has no \`targeting\` declared (P2)`); continue; }
  if (def.toHit !== "roll" && def.toHit !== "none") { err("action-def", `"${id}" (ENEMY_ABILITIES) has toHit "${def.toHit}" -- must be "roll" or "none" (P2)`); continue; }
  if (!def.actionType) { err("action-def", `"${id}" (ENEMY_ABILITIES) has no \`actionType\` declared (P2)`); continue; }
  if (def.toHit === "roll" && (typeof def.formula !== "string" || !PIPELINE_FORMULA_NAMES.has(def.formula))) {
    err("action-def", `"${id}" (ENEMY_ABILITIES) has toHit:"roll" but formula "${def.formula}" is not a PIPELINE_FORMULAS key (P2)`);
  }
}
{
  const basicDef = G("ENEMY_BASIC_ATTACK_DEF");
  if (!basicDef.targeting || !basicDef.actionType || !PIPELINE_FORMULA_NAMES.has(basicDef.formula)) {
    err("action-def", `ENEMY_BASIC_ATTACK_DEF is incomplete (P2)`);
  }
}
// P4: no checks on action identity in the step functions or hooks --
// `action.id ===`/`!==`, a `switch` on `action.id`, OR (broader than the
// handoff's own literal wording, since this audit's own research found
// it necessary) `.includes(action.id)`, which is functionally the same
// kind of identity check and would otherwise slip past a narrower regex.
// Scoped to js/engine/pipeline.js (the five step functions) and
// js/data/actions.js (where PIPELINE_HOOKS actually lives in this
// codebase) -- not the whole engine, since action.id is legitimately
// read (not branched on) by orchestrators building the runtime action
// object (e.g. `getActionDef(elementKey)`).
const P4_FILES = ["js/engine/pipeline.js", "js/data/actions.js"];
const P4_PATTERN = /action\.id\s*(?:===|!==)|\.includes\(\s*action\.id\s*\)|switch\s*\(\s*action\.id\s*\)/g;
// Step 1f-i §2 extension: the same no-identity-checks rule, for ALLY
// identity this time -- `action.kit` used as a branch condition (its own
// truthiness tested, not its fields read as data), `defId ===`/`id ===`
// against one specific ally, or a step function calling a named-ally
// helper (e.g. `hadrian*(`) directly instead of through PIPELINE_HOOKS.
// `action.kit` as a DATA field (assigned into an action object, or passed
// as an argument -- e.g. hadrianOnKill's own `h.action.kit`) is untouched;
// only a truthiness/equality test on it trips this.
const P4_KIT_COND_PATTERN = /\b(?:if|while)\s*\(\s*!?action\.kit\s*\)|action\.kit\s*(?:&&|\?|===|!==)|!action\.kit\b/g;
const P4_ALLY_ID_PATTERN = /\b(?:defId|id)\s*(?:===|!==)\s*["'`](?:hadrian|kessa)["'`]/g;
// Named-ally helpers live in companion.js (hadrianFlatAtkBonus,
// applyHadrianOutgoingDamageBonuses, onHadrianKill, ...) and may only be
// reached by NAME through PIPELINE_HOOKS -- so a direct call only trips
// this outside that table's own method bodies, which legitimately make
// the real call once, by design (js/data/actions.js's PIPELINE_HOOKS).
const P4_DIRECT_HELPER_PATTERN = /\bhadrian[A-Za-z]*\s*\(/g;
let p4Hits = 0;
for (const f of P4_FILES) {
  const src = sources[f];
  if (!src) continue;
  // Strip block comments, then line comments, before scanning -- this
  // audit's own prose (this very file's header, and js/data/actions.js's
  // schema doc) legitimately MENTIONS "action.id ===" as documentation;
  // only real code should trip P4. A line's own `//` is never inside a
  // string in this codebase's style, so a naive split is safe here.
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.split("//")[0]);
  // PIPELINE_HOOKS' own method bodies are the one place a named-ally
  // helper may be called directly (that's the whole point of the table);
  // track whether each line falls inside it so the direct-helper check
  // can skip just that span, in just this file.
  const hooksStart = codeOnly.findIndex((l) => /const\s+PIPELINE_HOOKS\s*=\s*\{/.test(l));
  let hooksEnd = -1;
  if (hooksStart !== -1) {
    let depth = 0;
    for (let i = hooksStart; i < codeOnly.length; i++) {
      for (const ch of codeOnly[i]) { if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { hooksEnd = i; break; } } }
      if (hooksEnd !== -1) break;
    }
  }
  for (let i = 0; i < codeOnly.length; i++) {
    if (P4_PATTERN.test(codeOnly[i])) { err("action-identity", `${f}:${i + 1} checks action identity directly -- "${codeOnly[i].trim()}" (P4)`); p4Hits++; }
    P4_PATTERN.lastIndex = 0;
    if (P4_KIT_COND_PATTERN.test(codeOnly[i])) { err("action-identity", `${f}:${i + 1} branches on action.kit's own truthiness -- "${codeOnly[i].trim()}" (P4)`); p4Hits++; }
    P4_KIT_COND_PATTERN.lastIndex = 0;
    if (P4_ALLY_ID_PATTERN.test(codeOnly[i])) { err("action-identity", `${f}:${i + 1} checks a specific ally's id/defId -- "${codeOnly[i].trim()}" (P4)`); p4Hits++; }
    P4_ALLY_ID_PATTERN.lastIndex = 0;
    const insideHooksTable = hooksStart !== -1 && i >= hooksStart && i <= hooksEnd;
    if (!insideHooksTable && P4_DIRECT_HELPER_PATTERN.test(codeOnly[i])) { err("action-identity", `${f}:${i + 1} calls a named-ally helper directly, outside PIPELINE_HOOKS -- "${codeOnly[i].trim()}" (P4)`); p4Hits++; }
    P4_DIRECT_HELPER_PATTERN.lastIndex = 0;
  }
}

// Step 1f-ii: the same no-identity-checks rule, for ENEMY ABILITY
// identity this time -- resolveEnemyActiveAbility/resolveEnemySummon/
// buildSummonedEnemyRecord (js/engine/combat.js, the three functions the
// governing handoff's own §1 table names for this sub-step) must read
// generic fields off whichever ability getEnemyAbility(abilityId) hands
// back, never branch on WHICH ability that is. Scoped to just these
// three functions' own bodies, not the whole of combat.js, deliberately:
// Dregnar's resolver (resolveDregnarAttempt's own `abilityId ===
// "dra_barrier"`) DOES check ability identity today, and that's correct
// for now -- Dregnar is explicitly 1g's job, not 1f's (handoff §1: "Not
// in 1f: Dregnar, which is 1g"), so scoping this narrowly avoids a false
// P4 failure on code this step was never asked to touch.
const P4_ENEMY_ABILITY_FNS = ["resolveEnemyActiveAbility", "resolveEnemySummon", "buildSummonedEnemyRecord"];
const P4_ENEMY_ABILITY_ID_PATTERN = /\babilityId\s*(?:===|!==)|\bability\.id\s*(?:===|!==)|switch\s*\(\s*abilityId\s*\)|\.includes\(\s*abilityId\s*\)/g;
{
  const src = sources["js/engine/combat.js"];
  if (src) {
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.split("//")[0]);
    for (const fnName of P4_ENEMY_ABILITY_FNS) {
      const startLine = codeOnly.findIndex((l) => new RegExp(`^function\\s+${fnName}\\s*\\(`).test(l));
      if (startLine === -1) continue;
      let depth = 0, endLine = -1;
      for (let i = startLine; i < codeOnly.length; i++) {
        for (const ch of codeOnly[i]) { if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) { endLine = i; break; } } }
        if (endLine !== -1) break;
      }
      for (let i = startLine; i <= endLine; i++) {
        if (P4_ENEMY_ABILITY_ID_PATTERN.test(codeOnly[i])) { err("action-identity", `js/engine/combat.js:${i + 1} (${fnName}) checks enemy ability identity directly -- "${codeOnly[i].trim()}" (P4)`); p4Hits++; }
        P4_ENEMY_ABILITY_ID_PATTERN.lastIndex = 0;
      }
    }
  }
}

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
process.stdout.write(`[actions] P4 action-identity checks found: ${p4Hits} (must be 0)\n`);
process.stdout.write(`[combat] P1 HP-writes-outside-applyAndReact found: ${p1Hits} (must be 0)\n`);
process.stdout.write(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${scripts.length} scripts.\n`);
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
