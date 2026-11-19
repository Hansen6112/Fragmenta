#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 3 (Tyler, 19 Nov):
 * calculateDamage.incoming for the player's own defender-side
 * mitigation chain (mitigateAndApplyHitOnPlayer, combat.js) and the new
 * calculateDamage.cap hook (Unyielding Wall, player; Perfect Fleshcraft,
 * enemy). Combined by a SEQUENTIAL, per-step-rounding combinator
 * (calculateIncomingDamage, js/data/modifiers.js) -- Tyler's own ruling:
 * "Ordered entries, rounding after each, are fine for the legacy mode.
 * R3 replaces that with sum, cap, round once." -- unlike outgoing/
 * defenseIgnore's single end-of-chain product. Every entry wraps an
 * existing, unchanged function/value verbatim.
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_incoming_ledger.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sources = Object.fromEntries(scripts.map((s) => [s, fs.readFileSync(path.join(ROOT, s), "utf8")]));

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
function buildSandbox() {
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
  return ctx;
}

const ledger = [];
function record(code, description, fn) {
  let passed = false, detail = null;
  try { detail = fn(); passed = !!detail.pass; } catch (e) { detail = { error: e.message, stack: (e.stack || "").split("\n").slice(0, 4).join(" / ") }; }
  ledger.push({ code, description, passed, detail });
}

const ctx = buildSandbox();
const calculateIncomingDamage = vm.runInContext("calculateIncomingDamage", ctx);
const applyDamageCap = vm.runInContext("applyDamageCap", ctx);
const mitigateAndApplyHitOnPlayer = vm.runInContext("mitigateAndApplyHitOnPlayer", ctx);
const applyEnemyFlatDamageReduction = vm.runInContext("applyEnemyFlatDamageReduction", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
const GameState = vm.runInContext("GameState", ctx);
const ORIGINS = vm.runInContext("ORIGINS", ctx);

function makeWarrior() {
  const s = new GameState();
  s.race = "human"; s.class = "warrior"; s.origin = Object.keys(ORIGINS)[0]; s.level = 25;
  s.recomputeStats(false);
  s.maxHealth = 100;
  s.combat = { player: { actionCounter: 0 }, enemies: [{ hp: 100, maxHp: 100 }], activeIndex: 0 };
  return s;
}
function withHasEffect(holder, ids, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && ids.includes(id) ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}
function withHasSetTier(holder, pairs, fn) {
  const orig = ctx.window.hasSetTier;
  ctx.window.hasSetTier = (h, n, t) => (h === holder && pairs.some(([pn, pt]) => pn === n && pt === t) ? true : orig(h, n, t));
  try { return fn(); } finally { ctx.window.hasSetTier = orig; }
}

record("P2-2D-INC-REGISTRY-SHAPE-01", "All 12 calculateDamage.incoming entries exist on that hook, bucket incomingMitigation (reserved in MOD_BUCKET_CAPS since 2a, unused until this increment)", () => {
  const keys = [
    "set:Legion:4", "effect:master_duelist", "effect:unbroken_line", "effect:prepared_response",
    "effect:calming_presence", "set:Regalia of the Eternal Heart:6", "set:Regalia of the Eternal Bastion:2",
    "set:Regalia of the Eternal Bastion:6", "set:Regalia of the Endless Tide:6",
    "effect:adaptive_tide.physical", "effect:adaptive_tide.magic", "effect:shared_burden",
  ];
  const bad = keys.filter((k) => !MODIFIERS[k] || MODIFIERS[k].hook !== "calculateDamage.incoming" || MODIFIERS[k].bucket !== "incomingMitigation");
  return { pass: bad.length === 0, bad };
});
record("P2-2D-CAP-REGISTRY-SHAPE-01", "Both calculateDamage.cap entries exist, correct holders", () => {
  const wall = MODIFIERS["effect:unyielding_wall"];
  const flesh = MODIFIERS["passive:perfect_fleshcraft"];
  const bad = [];
  if (!wall || wall.hook !== "calculateDamage.cap" || !wall.holders.includes("player")) bad.push("unyielding_wall");
  if (!flesh || flesh.hook !== "calculateDamage.cap" || !flesh.holders.includes("enemy")) bad.push("perfect_fleshcraft");
  return { pass: bad.length === 0, bad };
});

record("P2-2D-INC-NOTHING-ACTIVE-01", "Nothing active: edmg passes through unchanged", () => {
  const s = makeWarrior();
  const out = calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 37 });
  return { pass: out.edmg === 37, out };
});

record("P2-2D-INC-SHIELDWALL-DIRECTAPPLY-01", "Shield Wall (Legion:4): directApply wraps applyShieldWall unchanged -- 0.9x", () => {
  const s = makeWarrior();
  const out = withHasSetTier(s, [["Legion", 4]], () =>
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 10 }));
  return { pass: out.edmg === 9, out };
});
record("P2-2D-INC-UNBROKENLINE-SEQUENCE-01", "Unbroken Line: every 3rd hit grants a 2-round reduction window, read BEFORE this hit's own counter update -- sequential state, not a pure ratio", () => {
  const s = makeWarrior();
  const results = withHasEffect(s, ["unbroken_line"], () => [
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 10 }).edmg,
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 10 }).edmg,
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 10 }).edmg,
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 10 }).edmg,
  ]);
  return { pass: JSON.stringify(results) === JSON.stringify([10, 10, 10, 8]), results };
});
record("P2-2D-INC-SHAREDBURDEN-MAGNITUDE-GATE-01", "Shared Burden only triggers once edmg (the RUNNING total at this point, not the original hit) exceeds 30% max Health, then only once per fight", () => {
  const s = makeWarrior();
  const results = withHasEffect(s, ["shared_burden"], () => [
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 20 }).edmg, // <=30
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 40 }).edmg, // >30, fires: round(40*0.6)=24
    calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 40 }).edmg, // used already
  ]);
  return { pass: JSON.stringify(results) === JSON.stringify([20, 24, 40]), results };
});
record("P2-2D-INC-ADAPTIVETIDE-KIND-GATE-01", "Adaptive Tide: physical/magic entries are mutually exclusive by ctx.kind, same as today's ternary", () => {
  const s = makeWarrior();
  s.combat.player.adaptiveTidePhysicalStacks = 2; // -10%
  s.combat.player.adaptiveTideMagicStacks = 4; // -20%
  const results = withHasEffect(s, ["adaptive_tide"], () => ({
    physical: calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "physical", edmg: 100 }).edmg,
    magic: calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "magic", edmg: 100 }).edmg,
  }));
  return { pass: results.physical === 90 && results.magic === 80, results };
});
record("P2-2D-INC-UPGRADES-EXCLUDED-01", "Regression guard: Spell Ward's own upgrade entries (River Warden:4/Examiner:4/Stormwatch:4) share this hook but must NOT be treated as real chain members -- caught a real bug (5 -> wrongly 4) during this increment's own development", () => {
  const s = makeWarrior();
  const out = withHasEffect(s, ["spell_ward"], () =>
    withHasSetTier(s, [["River Warden", 4], ["River Warden", 6]], () =>
      calculateIncomingDamage(s, "player", { state: s, holder: s, role: "player", kind: "magic", edmg: 5 })));
  return { pass: out.edmg === 5, out };
});

record("P2-2D-CAP-UNYIELDINGWALL-01", "Unyielding Wall caps a hit exceeding 25% max Health at exactly 25%, with its own 3-round cooldown", () => {
  const s = makeWarrior();
  const capped = withHasEffect(s, ["unyielding_wall"], () => applyDamageCap(s, "player", { state: s, holder: s, role: "player", edmg: 50 }));
  const cooldownBlocked = withHasEffect(s, ["unyielding_wall"], () => applyDamageCap(s, "player", { state: s, holder: s, role: "player", edmg: 50 }));
  return { pass: capped === 25 && cooldownBlocked === 50, capped, cooldownBlocked };
});
record("P2-2D-CAP-PERFECTFLESHCRAFT-01", "Perfect Fleshcraft caps a hit at a fixed % of the creature's own max HP, dispatched through calculateDamage.cap", () => {
  const creature = { passives: ["perfect_fleshcraft"], hp: 100 };
  const result = applyEnemyFlatDamageReduction(50, creature);
  return { pass: result === 20, result };
});
record("P2-2D-CAP-NOTHING-ACTIVE-01", "calculateDamage.cap with nothing active returns edmg unchanged", () => {
  const s = makeWarrior();
  const out = applyDamageCap(s, "player", { state: s, holder: s, role: "player", edmg: 42 });
  return { pass: out === 42, out };
});

record("P2-2D-INC-WIRING-01", "mitigateAndApplyHitOnPlayer dispatches calculateIncomingDamage and applyDamageCap, old 12-step inline chain gone", () => {
  const body = sources["js/engine/combat.js"];
  const hasNewCalls = /calculateIncomingDamage\(state, "player"/.test(body) && /applyDamageCap\(state, "player"/.test(body);
  const oldChainGone = !/edmg = applyShieldWall\(state, edmg\);/.test(body) && !/edmg = Math\.round\(edmg \* preparedResponseMultiplier\(state\)\);/.test(body);
  return { pass: hasNewCalls && oldChainGone, hasNewCalls, oldChainGone };
});
record("P2-2D-CAP-WIRING-ENEMY-01", "applyEnemyFlatDamageReduction dispatches applyDamageCap for Perfect Fleshcraft, old inline damageCapPctMaxHp loop gone from that function", () => {
  const body = sources["js/engine/combat.js"];
  const fnBody = body.slice(body.indexOf("function applyEnemyFlatDamageReduction"), body.indexOf("function applyEnemyFlatDamageReduction") + 800);
  const hasNewCall = /applyDamageCap\(creature, "enemy"/.test(fnBody);
  const oldLoopGone = !/damageCapPctMaxHp/.test(fnBody);
  return { pass: hasNewCall && oldLoopGone, hasNewCall, oldLoopGone };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
