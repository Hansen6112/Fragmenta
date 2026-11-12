#!/usr/bin/env node
/*
 * Damage Types spec v1.0, step 2 follow-ups, A1: proof for the new
 * 12-group/36-injury table (js/data/damagetypes.js's INJURY_GROUPS_V2/
 * DAMAGE_TYPE_TO_INJURY_GROUP_V2) and its save-compatibility guarantee
 * (js/engine/state.js's INJURY_SLOT_DEFS).
 *
 * NOT a Playwright/browser ledger like every other file in this
 * directory, by necessity: DAMAGE_TYPES_V2 is a plain `const false`
 * (js/data/damagetypes.js), not an object like COMBAT_UNIFY, so there's
 * no runtime mutation that can flip it from inside a loaded page the
 * way combat_unify_switches_ledger.js flips COMBAT_UNIFY.U1 — only a
 * fresh load with different source text can. This loads the real game
 * into a VM sandbox twice (the same technique tools/audit.js already
 * uses), once unpatched (switch off, real shipped behavior) and once
 * with that one line text-patched to true (switch on, in-memory only —
 * the real file on disk is never touched), and asserts against both.
 *
 *   node tools/tests/damage_types_a1_injury_v2_ledger.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sources = Object.fromEntries(scripts.map((s) => [s, fs.readFileSync(path.join(ROOT, s), "utf8")]));

const SWITCH_LINE = "const DAMAGE_TYPES_V2 = false;";
if (!sources["js/data/damagetypes.js"].includes(SWITCH_LINE)) {
  throw new Error(`Expected to find "${SWITCH_LINE}" in js/data/damagetypes.js — update this test's patch alongside it.`);
}

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
function buildSandbox(switchOn) {
  const store = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el() },
    addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of scripts) {
    const src = s === "js/data/damagetypes.js" && switchOn ? sources[s].replace(SWITCH_LINE, "const DAMAGE_TYPES_V2 = true;") : sources[s];
    vm.runInContext(src, ctx, { filename: s });
  }
  return ctx;
}

const ledger = [];
function record(code, description, fn) {
  let passed = false, detail = null;
  try { detail = fn(); passed = true; } catch (e) { detail = { error: e.message }; }
  ledger.push({ code, description, passed, detail });
}

function makeWarrior(ctx) {
  const GameState = vm.runInContext("GameState", ctx);
  const ORIGINS = vm.runInContext("ORIGINS", ctx);
  const s = new GameState();
  s.playerName = "T"; s.race = "human"; s.class = "warrior";
  s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
  s.injuries = [];
  s.recomputeStats(false);
  return s;
}

// ---- Part 1: save compatibility, both switch states — recomputeStats
// keys injury stat-docking purely off INJURY_SLOT_DEFS[inj.id].stat, not
// off the injury record's own .group or the switch, so a save written
// before this change (holding Frostbite under its old group) must dock
// the same stat either way. ----
for (const switchOn of [false, true]) {
  const ctx = buildSandbox(switchOn);
  const label = switchOn ? "switch on" : "switch off";
  record(`A1-SAVE-FROSTBITE-${switchOn}`, `Save-compat (${label}): a pre-existing exposure_frostbite injury still docks Speed and resolves its name`, () => {
    const s = makeWarrior(ctx);
    const baseSpeed = s.speed;
    s.injuries = [{ id: "exposure_frostbite", group: "exposure", severity: "minor", acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
    s.recomputeStats(false);
    const injurySlotName = vm.runInContext("injurySlotName", ctx);
    const name = injurySlotName("exposure_frostbite");
    if (name !== "Frostbite") throw new Error(`expected name "Frostbite", got "${name}"`);
    const expected = Math.round(baseSpeed * 0.9);
    if (s.speed !== expected) throw new Error(`expected speed ${expected} (10% off ${baseSpeed}), got ${s.speed}`);
    return { baseSpeed, docked: s.speed, name };
  });
  record(`A1-SAVE-BURNEDHANDS-${switchOn}`, `Save-compat (${label}): a pre-existing burns_burned_hands injury still docks Accuracy and resolves its name`, () => {
    const s = makeWarrior(ctx);
    const baseAcc = s.accuracy;
    s.injuries = [{ id: "burns_burned_hands", group: "burns", severity: "minor", acquiredDay: 1, sourceDamageType: null, fieldTreated: false }];
    s.recomputeStats(false);
    const injurySlotName = vm.runInContext("injurySlotName", ctx);
    const name = injurySlotName("burns_burned_hands");
    if (name !== "Burned Hands") throw new Error(`expected name "Burned Hands", got "${name}"`);
    const expected = Math.round(baseAcc * 0.9);
    if (s.accuracy !== expected) throw new Error(`expected accuracy ${expected} (10% off ${baseAcc}), got ${s.accuracy}`);
    return { baseAcc, docked: s.accuracy, name };
  });
}

// ---- Part 2: the new roll path, switch on only ----
{
  const ctx = buildSandbox(true);
  const applyInjuriesFromDowns = vm.runInContext("applyInjuriesFromDowns", ctx);

  record("A1-ROLL-FROST", "Switch on: a Frost down rolls into the new frost group (one of its 3 slots, Frostbite included)", () => {
    const s = makeWarrior(ctx);
    applyInjuriesFromDowns(s, ["frost"]);
    const id = s.injuries[0] && s.injuries[0].id;
    const valid = ["exposure_frostbite", "frost_numbed_fingers", "frost_brittle_bones"];
    if (!valid.includes(id)) throw new Error(`expected one of ${JSON.stringify(valid)}, got "${id}"`);
    return { id };
  });

  record("A1-ROLL-SOUL-SPIRIT", "Switch on: a Spirit down rolls into the soul group", () => {
    const s = makeWarrior(ctx);
    applyInjuriesFromDowns(s, ["spirit"]);
    const id = s.injuries[0] && s.injuries[0].id;
    const valid = ["soul_hollowed_soul", "soul_spirit_scar", "soul_haunted"];
    if (!valid.includes(id)) throw new Error(`expected one of ${JSON.stringify(valid)}, got "${id}"`);
    return { id };
  });

  record("A1-ROLL-SOUL-DIVINE", "Switch on: a Divine down also rolls into the soul group (shared with Spirit, per Tyler's table)", () => {
    const s = makeWarrior(ctx);
    applyInjuriesFromDowns(s, ["divine"]);
    const id = s.injuries[0] && s.injuries[0].id;
    const valid = ["soul_hollowed_soul", "soul_spirit_scar", "soul_haunted"];
    if (!valid.includes(id)) throw new Error(`expected one of ${JSON.stringify(valid)}, got "${id}"`);
    return { id };
  });

  record("A1-FIRSTRIVER-NO-INJURY", "Switch on: a firstRiver down causes no injury at all (T9)", () => {
    const s = makeWarrior(ctx);
    applyInjuriesFromDowns(s, ["firstRiver"]);
    if (s.injuries.length !== 0) throw new Error(`expected 0 injuries, got ${s.injuries.length}: ${JSON.stringify(s.injuries)}`);
    return { injuries: s.injuries.length };
  });

  record("A1-GROUPS-V2-SHAPE", "INJURY_GROUPS_V2 has exactly 12 groups and 36 total slots, every slot id resolves in INJURY_SLOT_DEFS", () => {
    const groups = vm.runInContext("INJURY_GROUPS_V2", ctx);
    const defs = vm.runInContext("INJURY_SLOT_DEFS", ctx);
    const groupCount = Object.keys(groups).length;
    if (groupCount !== 12) throw new Error(`expected 12 groups, got ${groupCount}`);
    let total = 0;
    const missing = [];
    for (const gd of Object.values(groups)) {
      total += gd.slots.length;
      for (const id of gd.slots) if (!defs[id]) missing.push(id);
    }
    if (total !== 36) throw new Error(`expected 36 total slots, got ${total}`);
    if (missing.length) throw new Error(`missing INJURY_SLOT_DEFS entries: ${missing.join(", ")}`);
    return { groupCount, total };
  });
}

console.log(ledger.map((l) => `${l.passed ? "ok  " : "FAIL"} ${l.code}: ${l.description}`).join("\n"));
const passed = ledger.filter((l) => l.passed).length;
if (passed !== ledger.length) {
  console.log("\nFAILURES:");
  for (const l of ledger) if (!l.passed) console.log(`  ${l.code}: ${JSON.stringify(l.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
process.exit(passed === ledger.length ? 0 : 1);
