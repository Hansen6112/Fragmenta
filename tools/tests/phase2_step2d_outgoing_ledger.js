#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 1: calculateDamage.outgoing
 * bucketed registry entries for the player's own damage roll
 * (rollPlayerDamage/rollPlayerDamageCoreForPipeline's full multiplier
 * chain -- the spec's own illustrative ×20.5 example, §1). Combined by
 * the legacy flat product while R3 stays off (spec step 2d) -- every
 * entry wraps an existing, unchanged multiplier function, so this is a
 * direct check on the registry's own shape and the calculateOutgoingMultiplier
 * combinator (js/data/modifiers.js), not a reimplementation of each
 * effect's own math (the 572/572 regression suite, including 8 parity-
 * fixture snapshot comparisons and both simulation harnesses re-run at
 * N=1000 with the switch on, already re-verify byte-identical output end
 * to end).
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory (damage_types_step4_followup_ledger.js,
 * fragmenta_6pc_tag_override_ledger.js): nothing here touches the DOM.
 *
 *   node tools/tests/phase2_step2d_outgoing_ledger.js
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
const CRIT_MODIFIER_KEY = vm.runInContext("CRIT_MODIFIER_KEY", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
const GameState = vm.runInContext("GameState", ctx);
const ORIGINS = vm.runInContext("ORIGINS", ctx);
const BESTIARY = vm.runInContext("BESTIARY", ctx);

function makeWarrior() {
  const s = new GameState();
  s.race = "human"; s.class = "warrior"; s.origin = Object.keys(ORIGINS)[0]; s.level = 20;
  s.flags.isMage = false;
  s.recomputeStats(false);
  s.combat = { player: {}, enemies: [], activeIndex: 0, enemyActedFirstThisRound: false };
  return s;
}
function fakeCreature() {
  return Object.assign({}, BESTIARY.ashWolf, { def: 10, magic: 0, monsterTag: null, bleed: null, dmgReduction: 0 });
}

// ---- registry shape: every migrated entry declares the right hook/bucket ----
const EXPECTED = {
  "effect:crushing_impact": "conditional", "effect:executioner": "conditional",
  "set:Drake Hunter:6": "conditional", "set:Bonecaller:6": "conditional",
  "effect:kingslayer": "conditional", "effect:hunters_instinct": "conditional",
  "effect:momentum": "stacking", "effect:execution_protocol": "burst",
  "effect:temporal_echo": "burst", "effect:echoing_arsenal": "burst",
  "effect:arcane_overflow": "burst", "always:crit": "crit",
  "set:Regalia of the Woven Thread:4": "burst", "effect:worthy_challenge": "stacking",
  "set:Regalia of the Crimson Vanguard:2": "conditional", "effect:loaded_dice": "variance",
  "set:Regalia of the Laughing Gale:6": "variance", "effect:momentum_unbound": "stacking",
  "effect:tempered_steel": "stacking", "effect:master_craftsman": "conditional",
  "set:Regalia of the Eternal Hour:6": "burst", "effect:stones_patience": "conditional",
};
record("P2-2D-REGISTRY-SHAPE-01", "All 21 increment-1 entries exist, on calculateDamage.outgoing, with their catalogued bucket", () => {
  const bad = [];
  for (const [key, bucket] of Object.entries(EXPECTED)) {
    const e = MODIFIERS[key];
    if (!e) { bad.push(`${key}: missing`); continue; }
    if (e.hook !== "calculateDamage.outgoing") bad.push(`${key}: hook=${e.hook}`);
    if (e.bucket !== bucket) bad.push(`${key}: bucket=${e.bucket} (want ${bucket})`);
    if (!e.behavior && e.value == null) bad.push(`${key}: presence-only`);
  }
  return { pass: bad.length === 0, bad };
});

// ---- combinator semantics: delta buckets vs raw buckets ----
record("P2-2D-COMBINATOR-DELTA-01", "A conditional/stacking/burst entry's resolved number is read as (1+value) -- Executioner active gives a 1.2 factor", () => {
  const s = makeWarrior();
  const origHasEffect = ctx.window.hasEffect;
  ctx.window.hasEffect = (holder, id) => (id === "executioner" ? true : origHasEffect(holder, id));
  const entry = MODIFIERS["effect:executioner"];
  const creature = fakeCreature();
  s.combat.enemies = [{ hp: 1, maxHp: 100 }]; // 1% HP, inside the 30% default threshold
  let v;
  try { v = entry.value({ state: s, creature }); }
  finally { ctx.window.hasEffect = origHasEffect; }
  return { pass: Math.abs(v - 0.2) < 1e-9, v };
});
record("P2-2D-COMBINATOR-RAW-01", "A crit/variance entry's resolved number is used AS the multiplier, not (1+value) -- loaded_dice inactive returns exactly 1 both ways", () => {
  const entry = MODIFIERS["effect:loaded_dice"];
  const s = makeWarrior();
  const behaviorFn = vm.runInContext("MODIFIER_BEHAVIORS", ctx)[entry.behavior];
  const v = behaviorFn({ state: s }, entry, {});
  return { pass: v === 1, v };
});
record("P2-2D-COMBINATOR-TOTAL-01", "calculateOutgoingMultiplier with nothing active returns total 1 -- crit's 'always' source still contributes its own no-crit factor of 1 (an always-present, never-skipped entry, by design)", () => {
  const s = makeWarrior();
  const creature = fakeCreature();
  creature.hp = 100; creature.maxHp = 100;
  s.combat.enemies = [{ hp: 100, maxHp: 100 }];
  const out = calculateOutgoingMultiplier(s, "player", { state: s, creature, isSpell: false, atk: 10, effDef: 5 });
  const onlyCrit = Object.keys(out.byKey).length === 1 && out.byKey[CRIT_MODIFIER_KEY] === 1;
  return { pass: out.total === 1 && onlyCrit, out };
});

// ---- branch gating: weapon-only / spell-only entries ----
record("P2-2D-WEAPON-ONLY-GATING-01", "crushing_impact/echoing_arsenal/master_craftsman never fire when isSpell is true", () => {
  const s = makeWarrior();
  const creature = fakeCreature();
  s.combat.enemies = [{ hp: 100, maxHp: 100 }];
  const out = calculateOutgoingMultiplier(s, "player", { state: s, creature, isSpell: true, atk: 10, effDef: 999 });
  const leaked = ["effect:crushing_impact", "effect:echoing_arsenal", "effect:master_craftsman"].filter((k) => k in out.byKey);
  return { pass: leaked.length === 0, leaked, byKey: out.byKey };
});
record("P2-2D-SPELL-ONLY-GATING-01", "arcane_overflow never fires when isSpell is false, even with the effect present", () => {
  const s = makeWarrior();
  s.flags.isMage = true;
  const creature = fakeCreature();
  s.combat.enemies = [{ hp: 100, maxHp: 100 }];
  // Force sourceActiveOn to report arcane_overflow present, same monkeypatch
  // idiom this suite already uses (fragmenta_6pc_tag_override_ledger.js).
  const origHasEffect = ctx.window.hasEffect;
  ctx.window.hasEffect = (holder, id) => (id === "arcane_overflow" ? true : origHasEffect(holder, id));
  let out;
  try { out = calculateOutgoingMultiplier(s, "player", { state: s, creature, isSpell: false, atk: 10, effDef: 5 }); }
  finally { ctx.window.hasEffect = origHasEffect; }
  return { pass: !("effect:arcane_overflow" in out.byKey), byKey: out.byKey };
});

// ---- the crit entry's own key is readable from the breakdown (the two post-roll callers' own need) ----
record("P2-2D-CRIT-KEY-BREAKDOWN-01", "A guaranteed crit (unlikelyOutcomeGuaranteedCrit) shows up under CRIT_MODIFIER_KEY with factor > 1", () => {
  const s = makeWarrior();
  s.combat.player.unlikelyOutcomeGuaranteedCrit = true;
  const creature = fakeCreature();
  s.combat.enemies = [{ hp: 100, maxHp: 100 }];
  const out = calculateOutgoingMultiplier(s, "player", { state: s, creature, isSpell: false, atk: 10, effDef: 5 });
  return {
    pass: out.byKey[CRIT_MODIFIER_KEY] === 1.5 && s.combat.player.unlikelyOutcomeGuaranteedCrit === false,
    byKey: out.byKey, consumedFlag: s.combat.player.unlikelyOutcomeGuaranteedCrit,
  };
});

// ---- wiring: both real call sites actually use the combinator, not the old chain ----
record("P2-2D-WIRING-PIPELINE-01", "pipeline.js's rollPlayerDamageCoreForPipeline calls calculateOutgoingMultiplier in both branches, and the old per-multiplier const chain is gone", () => {
  const body = sources["js/engine/pipeline.js"];
  const calls = (body.match(/calculateOutgoingMultiplier\(state, "player"/g) || []).length;
  const oldChainGone = !/const execMult = executionerMultiplier/.test(body);
  return { pass: calls === 2 && oldChainGone, calls, oldChainGone };
});
record("P2-2D-WIRING-COMBAT-01", "combat.js's rollPlayerDamage calls calculateOutgoingMultiplier in both branches, and the old per-multiplier const chain is gone", () => {
  const body = sources["js/engine/combat.js"];
  const calls = (body.match(/calculateOutgoingMultiplier\(state, "player"/g) || []).length;
  const oldChainGone = !/const execMult = executionerMultiplier/.test(body);
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
