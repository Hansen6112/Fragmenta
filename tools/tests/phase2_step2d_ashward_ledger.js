#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 3d (Tyler, 19 Nov):
 * statusTick.incoming (Ashward). A DoT-tick damage reduction, read when
 * a status tick resolves -- no attacker, no to-hit roll, so its own
 * hook rather than calculateDamage.incoming. Dispatched by a new flat-
 * product combinator, calculateStatusTickMultiplier. The only member
 * today is Ashward (holders: ["enemy"], matching tickBurnEnemy's own
 * single existing call site exactly) -- a pure "move the number into
 * the registry" migration, not a widening, so no R1/R2 switch is
 * needed (per Tyler's own 19 Nov note on increment 3b: a widening of
 * who an entry works for needs its own switch and measurement; this
 * entry doesn't widen anything).
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_ashward_ledger.js
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
const calculateStatusTickMultiplier = vm.runInContext("calculateStatusTickMultiplier", ctx);
const PIPELINE_FORMULAS = vm.runInContext("PIPELINE_FORMULAS", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);

function withHasEffect(holder, ids, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && ids.includes(id) ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}

record("P2-2D-ASH-REGISTRY-SHAPE-01", "effect:dra_e08_ashward exists on statusTick.incoming, holders enemy-only, no widening", () => {
  const e = MODIFIERS["effect:dra_e08_ashward"];
  return { pass: !!e && e.hook === "statusTick.incoming" && e.value === 0.75 && e.holders.length === 1 && e.holders[0] === "enemy", e };
});
record("P2-2D-ASH-NOTHING-ACTIVE-01", "Without Ashward, the multiplier is 1", () => {
  const creature = { passives: [] };
  const total = calculateStatusTickMultiplier(creature, "enemy", { holder: creature, role: "enemy" });
  return { pass: total === 1, total };
});
record("P2-2D-ASH-ACTIVE-01", "With Ashward, the multiplier is 0.75", () => {
  const creature = { passives: [] };
  const total = withHasEffect(creature, ["dra_e08_ashward"], () => calculateStatusTickMultiplier(creature, "enemy", { holder: creature, role: "enemy" }));
  return { pass: total === 0.75, total };
});
record("P2-2D-ASH-TICKBURNENEMY-NO-GEAR-01", "tickBurnEnemy with no gear: the raw tick amount passes through unrounded-vs-reduced, matching today's exact ternary (no Math.round at all when inactive)", () => {
  const creature = { passives: [] };
  const result = PIPELINE_FORMULAS.tickBurnEnemy({}, { ref: { creatureObj: creature } }, { rawDmg: 11 }, {}, {});
  return { pass: result.edmg === 11, result };
});
record("P2-2D-ASH-TICKBURNENEMY-WITH-GEAR-01", "tickBurnEnemy with Ashward: 0.75x, rounded", () => {
  const creature = { passives: [] };
  const result = withHasEffect(creature, ["dra_e08_ashward"], () => PIPELINE_FORMULAS.tickBurnEnemy({}, { ref: { creatureObj: creature } }, { rawDmg: 10 }, {}, {}));
  return { pass: result.edmg === 8, result }; // round(10 * 0.75) = round(7.5) = 8
});
record("P2-2D-ASH-WIRING-01", "tickBurnEnemy dispatches calculateStatusTickMultiplier, old hasEffect ternary gone", () => {
  const body = sources["js/data/actions.js"];
  const fnBody = body.slice(body.indexOf("tickBurnEnemy(actor"), body.indexOf("tickBurnEnemy(actor") + 700);
  const hasNewCall = /calculateStatusTickMultiplier\(creature, "enemy"/.test(fnBody);
  const oldGone = !/hasEffect\(creature, "dra_e08_ashward"\) \? Math\.round/.test(fnBody);
  return { pass: hasNewCall && oldGone, hasNewCall, oldGone };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
