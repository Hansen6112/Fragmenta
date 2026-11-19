#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d -- Amendment 1 gap close (Tyler, 19
 * Nov): "Dispatch calculateDamage.outgoing and .defenseIgnore for every
 * attacker: the ally attack roll and the enemy attack roll, not just the
 * player's... Entries read the holder, not the player." This is the
 * test-strike proof that instruction itself calls for: "widen Executioner
 * and Crushing Impact to ally. An ally wearing them gets the bonus from
 * its own gear, and an ally without them doesn't."
 *
 * Executioner: already generalized in PRODUCTION (effect:executioner's
 * own `holders` includes "ally"/"enemy" today -- see that entry's own
 * notes in modifiers.js for why this unifies two previously-separate
 * code paths rather than widening anything new). This file dispatches it
 * for an ally holder directly, no override needed.
 *
 * Crushing Impact: NOT production-wired for ally (today's code has no
 * ally weapon-attack path that would ever call it -- `holders` correctly
 * stays ["player"]). To prove the underlying MECHANISM generalizes
 * correctly once a future increment does wire it up, this file
 * temporarily widens MODIFIERS["effect:crushing_impact"].holders to
 * include "ally" for the duration of one check, then restores it --
 * same "prove it, don't permanently change production scope" shape as
 * phase2_amendment1_test_strike_proof_ledger.js's own ally-widening
 * checks.
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_amendment1_gap_close_ledger.js
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
const calculateOutgoingMultiplier = vm.runInContext("calculateOutgoingMultiplier", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
const GameState = vm.runInContext("GameState", ctx);
const ORIGINS = vm.runInContext("ORIGINS", ctx);

function makeAlly(name) {
  return { defId: "kessa", name, level: 20, health: 100, maxHealth: 100, def: 10, agility: 10, atk: 10, accuracy: 10, magic: 0, knowledge: 0, alive: true, statuses: {}, equipment: {} };
}
// Per-holder gear forcing: hasEffect(holder, id) is overridden to return
// true ONLY for the holder object that's supposed to be "wearing" it
// (checked by reference), false for every other holder -- the point of
// this whole proof is that the bonus follows the WEARER, not the role.
function withGearOn(holder, effectId, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && id === effectId ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}

// ---- Executioner: already production-generalized (holders includes
// "ally"/"enemy" today) -- dispatched directly, no override needed. ----
record("P2-2D-A1-EXECUTIONER-ALLY-WEARING-01", "An ally WEARING Executioner gets 1.2x against a target at/below 30% HP, from its own gear", () => {
  const wearer = makeAlly("Wearer");
  const out = withGearOn(wearer, "executioner", () =>
    calculateOutgoingMultiplier(wearer, "ally", { holder: wearer, role: "ally", defenderHp: 25, defenderMaxHp: 100, isSpell: false }));
  return { pass: Math.abs(out.total - 1.2) < 1e-9, out };
});
record("P2-2D-A1-EXECUTIONER-ALLY-NOT-WEARING-01", "An ally NOT wearing Executioner gets no bonus, even against the same low-HP target", () => {
  const nonWearer = makeAlly("Non-wearer");
  const out = calculateOutgoingMultiplier(nonWearer, "ally", { holder: nonWearer, role: "ally", defenderHp: 25, defenderMaxHp: 100, isSpell: false });
  return { pass: out.total === 1, out };
});
record("P2-2D-A1-EXECUTIONER-TWO-ALLIES-INDEPENDENT-01", "Two allies in the same fight: only the one actually wearing Executioner gets it -- the bonus follows the holder passed in, not the role generically", () => {
  const wearer = makeAlly("Wearer");
  const nonWearer = makeAlly("Non-wearer");
  const outs = withGearOn(wearer, "executioner", () => ({
    wearer: calculateOutgoingMultiplier(wearer, "ally", { holder: wearer, role: "ally", defenderHp: 10, defenderMaxHp: 100, isSpell: false }),
    nonWearer: calculateOutgoingMultiplier(nonWearer, "ally", { holder: nonWearer, role: "ally", defenderHp: 10, defenderMaxHp: 100, isSpell: false }),
  }));
  return { pass: outs.wearer.total === 1.2 && outs.nonWearer.total === 1, outs };
});
record("P2-2D-A1-EXECUTIONER-ALLY-ENEMY-DEFAULT-THRESHOLD-01", "An ally attacker's own Executioner still uses the flat 30% threshold (no Drake Hunter/Vanguard/Contract Hunter widening) -- byte-identical to the old executionerMultiplierFor it replaces", () => {
  const wearer = makeAlly("Wearer");
  // 35% HP: inside the WIDENED 40% threshold, outside the flat 30% one.
  // If the ally's own Executioner incorrectly inherited the player's
  // set-tier widening, this would wrongly fire.
  const out = withGearOn(wearer, "executioner", () =>
    calculateOutgoingMultiplier(wearer, "ally", { holder: wearer, role: "ally", defenderHp: 35, defenderMaxHp: 100, isSpell: false }));
  return { pass: out.total === 1, out };
});

// ---- Crushing Impact: not production-wired for ally -- temporarily
// widen holders to prove the mechanism itself generalizes correctly. ----
record("P2-2D-A1-CRUSHING-IMPACT-ALLY-WEARING-01", "Widened to ally: an ally WEARING Crushing Impact in a weapon matchup (effDef > atk) gets 1.2x from its own gear", () => {
  const entry = MODIFIERS["effect:crushing_impact"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const wearer = makeAlly("Wearer");
    const out = withGearOn(wearer, "crushing_impact", () =>
      calculateOutgoingMultiplier(wearer, "ally", { holder: wearer, role: "ally", isSpell: false, atk: 10, effDef: 20 }));
    return { pass: Math.abs(out.total - 1.2) < 1e-9, out };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2D-A1-CRUSHING-IMPACT-ALLY-NOT-WEARING-01", "Widened to ally: an ally NOT wearing Crushing Impact gets no bonus in the same matchup", () => {
  const entry = MODIFIERS["effect:crushing_impact"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const nonWearer = makeAlly("Non-wearer");
    const out = calculateOutgoingMultiplier(nonWearer, "ally", { holder: nonWearer, role: "ally", isSpell: false, atk: 10, effDef: 20 });
    return { pass: out.total === 1, out };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2D-A1-CRUSHING-IMPACT-UNWIDENED-STAYS-PLAYER-ONLY-01", "Without widening (today's real production scope), an ally wearing Crushing Impact gets nothing -- holders really is still ['player']", () => {
  const wearer = makeAlly("Wearer");
  const out = withGearOn(wearer, "crushing_impact", () =>
    calculateOutgoingMultiplier(wearer, "ally", { holder: wearer, role: "ally", isSpell: false, atk: 10, effDef: 20 }));
  return { pass: out.total === 1 && MODIFIERS["effect:crushing_impact"].holders.length === 1 && MODIFIERS["effect:crushing_impact"].holders[0] === "player", out };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
