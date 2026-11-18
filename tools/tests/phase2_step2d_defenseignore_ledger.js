#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 2: calculateDamage.defenseIgnore
 * bucketed registry entries for the player's own damage roll (same pair
 * of functions as increment 1 -- rollPlayerDamage/rollPlayerDamageCoreForPipeline's
 * effDef computation). Combined by the legacy flat product while R3
 * stays off: calculateDefenseIgnoreMultiplier (js/data/modifiers.js)
 * multiplies (1 - value) for each active entry, which is mathematically
 * identical to multiplying the original multiplier functions together
 * (1 - (1 - m) === m) -- see that function's own header. Every entry
 * wraps an existing, unchanged multiplier function; Armor Crack (a flat
 * Defense subtraction, never a percentage) is excluded from the product
 * entirely and stays a direct call at the site, unchanged.
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_defenseignore_ledger.js
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
const calculateDefenseIgnoreMultiplier = vm.runInContext("calculateDefenseIgnoreMultiplier", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
const GameState = vm.runInContext("GameState", ctx);
const ORIGINS = vm.runInContext("ORIGINS", ctx);

function makeWarrior() {
  const s = new GameState();
  s.race = "human"; s.class = "warrior"; s.origin = Object.keys(ORIGINS)[0]; s.level = 20;
  s.flags.isMage = false;
  s.recomputeStats(false);
  s.combat = { player: { actionCounter: 0 }, enemies: [{ hp: 100, maxHp: 100 }], activeIndex: 0, enemyActedFirstThisRound: false };
  return s;
}
function withHasEffect(ids, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (holder, id) => (ids.includes(id) ? true : orig(holder, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}

record("P2-2D-DI-REGISTRY-SHAPE-01", "All 4 increment-2 entries exist, on calculateDamage.defenseIgnore, bucket defenseIgnore", () => {
  const keys = ["effect:foreseen_strike", "set:Regalia of the Crimson Vanguard:4", "effect:precision_formula", "effect:armor_crack"];
  const bad = keys.filter((k) => !MODIFIERS[k] || MODIFIERS[k].hook !== "calculateDamage.defenseIgnore" || MODIFIERS[k].bucket !== "defenseIgnore");
  return { pass: bad.length === 0, bad };
});

record("P2-2D-DI-NOTHING-ACTIVE-01", "Nothing active: total is 1", () => {
  const s = makeWarrior();
  const out = calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: false });
  return { pass: out.total === 1, out };
});

record("P2-2D-DI-FORESEEN-STRIKE-01", "Foreseen Strike active on the 3rd action: factor 0.5, both branches", () => {
  const s = makeWarrior();
  s.combat.player.actionCounter = 3;
  const out = withHasEffect(["foreseen_strike"], () => calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: false }));
  return { pass: Math.abs(out.total - 0.5) < 1e-9, out };
});

record("P2-2D-DI-PRECISION-FORMULA-SPELL-ONLY-01", "Precision Formula only applies when isSpell: true (0.7 factor); never when isSpell: false", () => {
  const s = makeWarrior();
  const spellOut = withHasEffect(["precision_formula"], () => calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: true }));
  const weaponOut = withHasEffect(["precision_formula"], () => calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: false }));
  return {
    pass: Math.abs(spellOut.total - 0.7) < 1e-9 && weaponOut.total === 1,
    spellOut, weaponOut,
  };
});

record("P2-2D-DI-ARMOR-CRACK-EXCLUDED-01", "Armor Crack (flatAmount) never contributes to the product, even when active", () => {
  const s = makeWarrior();
  const out = withHasEffect(["armor_crack"], () => calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: false }));
  return { pass: out.total === 1 && !("effect:armor_crack" in out.byKey), out };
});

record("P2-2D-DI-COMMANDING-PRESENCE-STACKS-01", "Commanding Presence on the 3rd attack gives a full-ignore factor of 0 (equivalent to the old x0 multiplier)", () => {
  const s = makeWarrior();
  s.combat.player.actionCounter = 3;
  const orig = ctx.window.hasSetTier;
  ctx.window.hasSetTier = (holder, setName, tier) => (setName === "Regalia of the Crimson Vanguard" && tier === 4 ? true : orig(holder, setName, tier));
  let out;
  try { out = calculateDefenseIgnoreMultiplier(s, "player", { state: s, creature: s.combat.enemies[0], isSpell: false }); }
  finally { ctx.window.hasSetTier = orig; }
  return { pass: out.total === 0, out };
});

record("P2-2D-DI-WIRING-PIPELINE-01", "pipeline.js computes effDef via defIgnore.total in both branches, old chain gone", () => {
  const body = sources["js/engine/pipeline.js"];
  const calls = (body.match(/\* defIgnore\.total/g) || []).length;
  const oldChainGone = !/foreseenDefMult \* commandingDefMult/.test(body.replace(/\/\/.*$/gm, ""));
  return { pass: calls === 2 && oldChainGone, calls, oldChainGone };
});
record("P2-2D-DI-WIRING-COMBAT-01", "combat.js computes effDef via defIgnore.total in both branches, old chain gone", () => {
  const body = sources["js/engine/combat.js"];
  const calls = (body.match(/\* defIgnore\.total/g) || []).length;
  const oldChainGone = !/foreseenDefMult \* commandingDefMult/.test(body.replace(/\/\/.*$/gm, ""));
  return { pass: calls === 2 && oldChainGone, calls, oldChainGone };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
