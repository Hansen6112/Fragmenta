#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2e-1 (Tyler, 20 Nov): "Proof test: widen
 * one on-hit heal and Mercy's Gift to ally. An ally wearing the heal
 * item heals itself, and an ally wearing Mercy's Gift below 50% HP gets
 * +50% on heals it receives. Neither applies to an ally without the
 * gear."
 *
 * Soul Leech is the "one on-hit heal" (applyAndReact.onHitDealt, the
 * cleanest real heal source on that hook). Mercy's Gift is heal.incoming
 * (healFighter's own healing-RECEIVED chain). Both are production-scoped
 * `holders: ["player"]` today -- this file temporarily widens each one's
 * own MODIFIERS entry to include "ally", proving the underlying
 * dispatch mechanism generalizes correctly, then restores it. Same
 * "prove it, don't permanently change production scope" shape as
 * phase2_step2d_amendment1_gap_close_ledger.js's own ally-widening
 * checks (Crushing Impact).
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2e1_heal_ally_proof_ledger.js
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
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
const runReactionHook = vm.runInContext("runReactionHook", ctx);
const healFighter = vm.runInContext("healFighter", ctx);

function makeAlly(name, overrides) {
  return Object.assign(
    { defId: "kessa", name, level: 20, health: 100, maxHealth: 100, def: 10, agility: 10, atk: 10, accuracy: 10, magic: 0, knowledge: 0, alive: true, statuses: {}, equipment: {} },
    overrides
  );
}
// Per-holder gear forcing -- same technique as phase2_step2d_amendment1_gap_close_ledger.js's own withGearOn.
function withGearOn(holder, effectId, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && id === effectId ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}

// ---- Soul Leech: not production-wired for ally -- temporarily widen
// holders to prove the onHitDealt heal mechanism itself generalizes. ----
record("P2-2E1-SOULLEECH-ALLY-WEARING-01", "Widened to ally: an ally WEARING Soul Leech heals itself for 10% of a hit's damage, dispatched through applyAndReact.onHitDealt", () => {
  const entry = MODIFIERS["effect:soul_leech"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const wearer = makeAlly("Wearer", { health: 50, maxHealth: 100 });
    withGearOn(wearer, "soul_leech", () =>
      runReactionHook("applyAndReact.onHitDealt", wearer, "ally", { holder: wearer, role: "ally", edmg: 20 }));
    // Math.round(20 * 0.1) = 2
    return { pass: wearer.health === 52, health: wearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-SOULLEECH-ALLY-NOT-WEARING-01", "Widened to ally: an ally NOT wearing Soul Leech gets no heal from the same hit", () => {
  const entry = MODIFIERS["effect:soul_leech"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const nonWearer = makeAlly("Non-wearer", { health: 50, maxHealth: 100 });
    runReactionHook("applyAndReact.onHitDealt", nonWearer, "ally", { holder: nonWearer, role: "ally", edmg: 20 });
    return { pass: nonWearer.health === 50, health: nonWearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-SOULLEECH-TWO-ALLIES-INDEPENDENT-01", "Two allies in the same fight: only the one actually wearing Soul Leech gets it -- the heal follows the holder passed in, not the role generically", () => {
  const entry = MODIFIERS["effect:soul_leech"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const wearer = makeAlly("Wearer", { health: 50, maxHealth: 100 });
    const nonWearer = makeAlly("Non-wearer", { health: 50, maxHealth: 100 });
    withGearOn(wearer, "soul_leech", () => {
      runReactionHook("applyAndReact.onHitDealt", wearer, "ally", { holder: wearer, role: "ally", edmg: 20 });
      runReactionHook("applyAndReact.onHitDealt", nonWearer, "ally", { holder: nonWearer, role: "ally", edmg: 20 });
    });
    return { pass: wearer.health === 52 && nonWearer.health === 50, wearerHealth: wearer.health, nonWearerHealth: nonWearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-SOULLEECH-UNWIDENED-STAYS-PLAYER-ONLY-01", "Without widening (today's real production scope), Soul Leech's own holders really is still ['player']", () => {
  return { pass: MODIFIERS["effect:soul_leech"].holders.length === 1 && MODIFIERS["effect:soul_leech"].holders[0] === "player", holders: MODIFIERS["effect:soul_leech"].holders };
});

// ---- Mercy's Gift: not production-wired for ally -- temporarily widen
// holders to prove heal.incoming (healFighter's own chain) generalizes. ----
record("P2-2E1-MERCYSGIFT-ALLY-WEARING-01", "Widened to ally: an ally WEARING Mercy's Gift below 50% HP gets +50% on a heal it receives, through healFighter's own heal.incoming chain", () => {
  const entry = MODIFIERS["effect:mercys_gift"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const wearer = makeAlly("Wearer", { health: 30, maxHealth: 100 });
    const result = withGearOn(wearer, "mercys_gift", () => healFighter(wearer, "ally", 10, "test", {}));
    // Math.round(10 * 1.5) = 15
    return { pass: result.healed === 15 && wearer.health === 45, result, health: wearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-MERCYSGIFT-ALLY-NOT-WEARING-01", "Widened to ally: an ally NOT wearing Mercy's Gift, below 50% HP, gets the base heal with no bonus", () => {
  const entry = MODIFIERS["effect:mercys_gift"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const nonWearer = makeAlly("Non-wearer", { health: 30, maxHealth: 100 });
    const result = healFighter(nonWearer, "ally", 10, "test", {});
    return { pass: result.healed === 10 && nonWearer.health === 40, result, health: nonWearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-MERCYSGIFT-ALLY-ABOVE-HALF-NO-BONUS-01", "Widened to ally: an ally WEARING Mercy's Gift but ABOVE 50% HP gets no bonus (the live check, not a latched buff)", () => {
  const entry = MODIFIERS["effect:mercys_gift"];
  const origHolders = entry.holders;
  entry.holders = [...origHolders, "ally"];
  try {
    const wearer = makeAlly("Wearer", { health: 80, maxHealth: 100 });
    const result = withGearOn(wearer, "mercys_gift", () => healFighter(wearer, "ally", 10, "test", {}));
    return { pass: result.healed === 10 && wearer.health === 90, result, health: wearer.health };
  } finally {
    entry.holders = origHolders;
  }
});
record("P2-2E1-MERCYSGIFT-UNWIDENED-STAYS-PLAYER-ONLY-01", "Without widening (today's real production scope), Mercy's Gift's own holders really is still ['player']", () => {
  return { pass: MODIFIERS["effect:mercys_gift"].holders.length === 1 && MODIFIERS["effect:mercys_gift"].holders[0] === "player", holders: MODIFIERS["effect:mercys_gift"].holders };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
