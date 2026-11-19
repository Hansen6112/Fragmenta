#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 3b (Tyler, 19 Nov):
 * calculateDamage.incoming, enemy-holder (Sanguivorum). Dispatched by
 * calculateEnemyIncomingMultiplier -- a flat, unrounded product (same
 * hook as the player's own sequential chain, different combinator,
 * since today's sangMit is itself a flat product with no intermediate
 * rounding). Covers all 11 catalogue rows across 4 shared mechanisms,
 * each wrapping its own existing unchanged function verbatim, dispatched
 * now for every attacker (player, ally, kit-ally), not just the player.
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_sanguivorum_ledger.js
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
const calculateEnemyIncomingMultiplier = vm.runInContext("calculateEnemyIncomingMultiplier", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);

function withHasEffect(holder, ids, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && ids.includes(id) ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}

record("P2-2D-SANG-REGISTRY-SHAPE-01", "All 4 Sanguivorum entries exist on calculateDamage.incoming, source 'always', holders enemy-only", () => {
  const keys = ["always:sang_cu_defender_mitigation", "always:sang_one_hit_mitigation", "always:sang_repeatable_mitigation", "always:sang_ally_protection"];
  const bad = keys.filter((k) => {
    const e = MODIFIERS[k];
    return !e || e.hook !== "calculateDamage.incoming" || e.source.kind !== "always" || e.holders.length !== 1 || e.holders[0] !== "enemy";
  });
  return { pass: bad.length === 0, bad };
});

record("P2-2D-SANG-NOTHING-ACTIVE-01", "Nothing active: product is 1", () => {
  const creature = { passives: [] };
  const total = calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" });
  return { pass: total === 1, total };
});

record("P2-2D-SANG-SMUGGLERS-GUARD-01", "Smuggler's Guard: 0.9x, CD4 -- immediately re-blocked on the same creature with no round tick", () => {
  const creature = { passives: [] };
  const first = withHasEffect(creature, ["sang_cu_ie006_smugglers_guard"], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  const second = withHasEffect(creature, ["sang_cu_ie006_smugglers_guard"], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  return { pass: first === 0.9 && second === 1, first, second };
});
record("P2-2D-SANG-COMMANDERS-POISE-01", "Commander's Poise: 0.9x once per combat, then 1 forever", () => {
  const creature = { passives: [] };
  const first = withHasEffect(creature, ["sang_cu_ie011_commanders_poise"], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  const second = withHasEffect(creature, ["sang_cu_ie011_commanders_poise"], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  return { pass: first === 0.9 && second === 1, first, second };
});
record("P2-2D-SANG-ONEHIT-SHARED-ACROSS-4-IDS-01", "One-hit mitigation: any of the 4 ids fires the SAME shared once-per-combat flag (enemyFirstHitTakenUsed)", () => {
  const results = ["sang_mil_ie001_hardened_formation", "sang_mil_ie007_officers_bearing", "sang_sec_ie004_watchmans_resilience", "sang_iag_ie002_contractors_endurance"].map((id) => {
    const creature = { passives: [] };
    return withHasEffect(creature, [id], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  });
  return { pass: results.every((r) => r === 0.9), results };
});
record("P2-2D-SANG-REPEATABLE-SHARED-ACROSS-2-IDS-01", "Repeatable mitigation: both ids fire the same shared CD4/max-2 mechanism, 0.9x on the first use", () => {
  const results = ["sang_sec_ie007_duelists_bulwark", "sang_iag_ie006_champions_poise"].map((id) => {
    const creature = { passives: [] };
    return withHasEffect(creature, [id], () => calculateEnemyIncomingMultiplier(creature, "enemy", { state: {}, holder: creature, role: "enemy" }));
  });
  return { pass: results.every((r) => r === 0.9), results };
});
record("P2-2D-SANG-ALLY-PROTECTION-CROSS-CREATURE-01", "Ally protection: a DIFFERENT living enemy's own gear protects this one -- the protected creature's own gear is irrelevant", () => {
  const protectedCreature = { passives: [] };
  const protector = { passives: [], allyProtectionCooldown: 0, allyProtectionUsesThisCombat: 0 };
  const deadProtector = { passives: [], allyProtectionCooldown: 0, allyProtectionUsesThisCombat: 0 };
  const state = { combat: { enemies: [
    { alive: true, creatureObj: protectedCreature },
    { alive: false, creatureObj: deadProtector },
    { alive: true, creatureObj: protector },
  ] } };
  const total = withHasEffect(protector, ["sang_sec_ie005_gatekeepers_stand"], () =>
    withHasEffect(deadProtector, ["sang_sec_ie005_gatekeepers_stand"], () =>
      calculateEnemyIncomingMultiplier(protectedCreature, "enemy", { state, holder: protectedCreature, role: "enemy" })));
  return { pass: total === 0.9, total };
});
record("P2-2D-SANG-ALLY-PROTECTION-SELF-EXCLUDED-01", "Ally protection never protects the wearer from its own hit -- the loop excludes other.creatureObj === targetCreature", () => {
  const creature = { passives: [], allyProtectionCooldown: 0, allyProtectionUsesThisCombat: 0 };
  const state = { combat: { enemies: [{ alive: true, creatureObj: creature }] } };
  const total = withHasEffect(creature, ["sang_sec_ie005_gatekeepers_stand"], () =>
    calculateEnemyIncomingMultiplier(creature, "enemy", { state, holder: creature, role: "enemy" }));
  return { pass: total === 1, total };
});
record("P2-2D-SANG-COMPOUND-01", "All four mechanisms active at once multiply together: 0.9^4, not just the strongest one", () => {
  const creature = { passives: [], allyProtectionCooldown: 0, allyProtectionUsesThisCombat: 0 };
  const protector = { passives: [], allyProtectionCooldown: 0, allyProtectionUsesThisCombat: 0 };
  const state = { combat: { enemies: [{ alive: true, creatureObj: creature }, { alive: true, creatureObj: protector }] } };
  const total = withHasEffect(creature, ["sang_cu_ie006_smugglers_guard", "sang_mil_ie001_hardened_formation", "sang_sec_ie007_duelists_bulwark"], () =>
    withHasEffect(protector, ["sang_sec_ie005_gatekeepers_stand"], () =>
      calculateEnemyIncomingMultiplier(creature, "enemy", { state, holder: creature, role: "enemy" })));
  return { pass: Math.abs(total - Math.pow(0.9, 4)) < 1e-9, total };
});

record("P2-2D-SANG-WIRING-01", "rollPlayerDamage/rollPlayerDamageCoreForPipeline dispatch calculateEnemyIncomingMultiplier for sangMit, old 4-function chain gone", () => {
  for (const file of ["js/engine/combat.js", "js/engine/pipeline.js"]) {
    const body = sources[file];
    if (!/sangMit = calculateEnemyIncomingMultiplier\(creature, "enemy"/.test(body)) return { pass: false, file, reason: "new call missing" };
    if (/sangCuDefenderMitigation\(creature\) \* enemyOneHitMitigationMultiplier/.test(body)) return { pass: false, file, reason: "old chain still present" };
  }
  return { pass: true };
});
record("P2-2D-SANG-WIRING-ALLY-01", "allyPlain dispatches the FULL calculateEnemyIncomingMultiplier, not just sangCuDefenderMitigation alone", () => {
  const body = sources["js/data/actions.js"];
  const allyPlainBody = body.slice(body.indexOf("allyPlain(actor"), body.indexOf("allyPlain(actor") + 2000);
  const hasFullDispatch = /sangMit = calculateEnemyIncomingMultiplier\(creature, "enemy"/.test(allyPlainBody);
  const oldNarrowCallGone = !/const sangMit = sangCuDefenderMitigation\(creature\);/.test(allyPlainBody);
  return { pass: hasFullDispatch && oldNarrowCallGone, hasFullDispatch, oldNarrowCallGone };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
