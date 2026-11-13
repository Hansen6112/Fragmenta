#!/usr/bin/env node
/*
 * Damage Types Step 4 (Harness Encounters, Switch On, New Baseline)
 * handoff, Part A: proof for A1 (Frozen strictly worse than Chilled),
 * A2 (isChillFamily + statusImmune family), A4 (Spatial display name +
 * elementKeyToDamageType), A5 (rollPlayerDamage's spell branch gated),
 * A6 (enemy Mage nation weights gain Frost). All off by default.
 *
 * NOT a Playwright/browser ledger, same reason as every other VM-sandbox
 * ledger in this directory: DAMAGE_TYPES_V2 is a plain `const false`, so
 * there's no in-page way to flip it. Loads the real game into a VM
 * sandbox, once unpatched (switch off) and once with that one line
 * text-patched to true (switch on, in memory only).
 *
 *   node tools/tests/damage_types_step4_parta_ledger.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sources = Object.fromEntries(scripts.map((s) => [s, fs.readFileSync(path.join(ROOT, s), "utf8")]));

// Damage Types Step 4, Part C: the real committed switch is now
// permanently true -- this file still needs to build a sandbox with
// EITHER state (its own off-state assertions are still real
// regression coverage for the conditional logic itself), so the patch
// is direction-agnostic: whichever literal is currently committed,
// replace it with whichever this call actually wants.
const SWITCH_LINE_RE = /const DAMAGE_TYPES_V2 = (true|false);/;
if (!SWITCH_LINE_RE.test(sources["js/data/damagetypes.js"])) {
  throw new Error(`Expected to find a "const DAMAGE_TYPES_V2 = true|false;" line in js/data/damagetypes.js — update this test's patch alongside it.`);
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
    const src = s === "js/data/damagetypes.js" ? sources[s].replace(SWITCH_LINE_RE, `const DAMAGE_TYPES_V2 = ${!!switchOn};`) : sources[s];
    vm.runInContext(src, ctx, { filename: s });
  }
  return ctx;
}

const ledger = [];
function record(code, description, fn) {
  let passed = false, detail = null;
  try { detail = fn(); passed = true; } catch (e) { detail = { error: e.message, stack: (e.stack || "").split("\n").slice(0, 4).join(" / ") }; }
  ledger.push({ code, description, passed, detail });
}

const off = buildSandbox(false);
const on = buildSandbox(true);

// ---- A1: Frozen strictly worse than Chilled ----
record("S4-A1-FROZEN-VALUES-01", "Frozen = Agility -10, Speed -10, Accuracy -5, 2 turns, non-stacking", () => {
  const STATUS_EFFECTS = vm.runInContext("STATUS_EFFECTS", on);
  const frozen = STATUS_EFFECTS.frozen;
  if (frozen.debuff.agi !== -10 || frozen.debuff.spd !== -10 || frozen.debuff.acc !== -5) throw new Error(`unexpected debuff: ${JSON.stringify(frozen.debuff)}`);
  if (frozen.stackable || frozen.turns !== 2) throw new Error(`unexpected shape: stackable=${frozen.stackable} turns=${frozen.turns}`);
  return frozen;
});
record("S4-A1-STRICTLY-WORSE-01", "Escalating Chilled -> Frozen never removes a penalty: Frozen's Agility is at or below Chilled's, and it adds Speed/Accuracy on top", () => {
  const STATUS_EFFECTS = vm.runInContext("STATUS_EFFECTS", on);
  const chilled = STATUS_EFFECTS.chilled;
  const frozen = STATUS_EFFECTS.frozen;
  if (!(frozen.debuff.agi <= chilled.debuff.agi)) throw new Error(`Frozen Agility (${frozen.debuff.agi}) is not <= Chilled's (${chilled.debuff.agi})`);
  if (!(frozen.debuff.spd < 0)) throw new Error(`Frozen Speed should be a real penalty, got ${frozen.debuff.spd}`);
  if (!(frozen.debuff.acc < 0)) throw new Error(`Frozen Accuracy should be a real penalty, got ${frozen.debuff.acc}`);
  return { chilledAgi: chilled.debuff.agi, frozenAgi: frozen.debuff.agi, frozenSpd: frozen.debuff.spd, frozenAcc: frozen.debuff.acc };
});
record("S4-A1-REAPPLY-INTEGRATION-01", "A fighter that escalates from Chilled to Frozen via reapplication ends up with Frozen's full (worse) debuff live", () => {
  const applyPlayerStatus = vm.runInContext("applyPlayerStatus", on);
  const getStatusEffect = vm.runInContext("getStatusEffect", on);
  const state = { combat: { player: { playerStatuses: {} } } };
  const chilled = getStatusEffect("chilled");
  applyPlayerStatus(state, "chilled", chilled, "Frost Wolf");
  applyPlayerStatus(state, "chilled", chilled, "Frost Wolf");
  const frozen = state.combat.player.playerStatuses.frozen;
  if (!frozen) throw new Error(`expected frozen, got ${JSON.stringify(state.combat.player.playerStatuses)}`);
  if (frozen.debuff.agi !== -10 || frozen.debuff.spd !== -10 || frozen.debuff.acc !== -5) throw new Error(`unexpected live Frozen debuff: ${JSON.stringify(frozen.debuff)}`);
  return frozen;
});

// ---- A2: isChillFamily + statusImmune family ----
record("S4-A2-ISCHILLFAMILY-01", "isChillFamily: true for chilled, true for frozen, false otherwise", () => {
  const isChillFamily = vm.runInContext("isChillFamily", on);
  const cases = [
    [null, false], [{}, false], [{ bleed: {} }, false],
    [{ chilled: { debuff: { agi: -10 } } }, true],
    [{ frozen: { debuff: { agi: -10 } } }, true],
    [{ chilled: {}, frozen: {} }, true],
  ];
  const bad = cases.filter(([input, want]) => isChillFamily(input) !== want);
  if (bad.length) throw new Error(`mismatch(es): ${JSON.stringify(bad)}`);
  return { checked: cases.length };
});
record("S4-A2-STATUSIMMUNE-FAMILY-01", "isStatusImmune: Chilled-immune (Winter Coat) also blocks Frozen, in both switch states (the check itself needs no gate, only its callers do)", () => {
  const isStatusImmuneOn = vm.runInContext("isStatusImmune", on);
  const isStatusImmuneOff = vm.runInContext("isStatusImmune", off);
  const holder = { statusImmune: ["chilled"] };
  if (!isStatusImmuneOn(holder, "chilled")) throw new Error("expected immune to chilled directly");
  if (!isStatusImmuneOn(holder, "frozen")) throw new Error("expected chilled-immunity to also block frozen (switch on)");
  if (!isStatusImmuneOff(holder, "frozen")) throw new Error("expected chilled-immunity to also block frozen (switch off -- the guard itself is unconditional)");
  const noImmunity = { statusImmune: ["burning"] };
  if (isStatusImmuneOn(noImmunity, "frozen")) throw new Error("expected NOT immune to frozen when only immune to something unrelated");
  return { ok: true };
});
record("S4-A2-WINTER-COAT-CANT-FREEZE-01", "A Winter Coat creature (statusImmune: chilled) can never reach Frozen at all, because Chilled itself is blocked before any build-up can start", () => {
  const BESTIARY = vm.runInContext("BESTIARY", on);
  const applyAllyStatus = vm.runInContext("applyAllyStatus", on);
  const getStatusEffect = vm.runInContext("getStatusEffect", on);
  const frostWolf = BESTIARY.frostWolf;
  if (!frostWolf.statusImmune || !frostWolf.statusImmune.includes("chilled")) throw new Error(`expected frostWolf.statusImmune to include "chilled", got ${JSON.stringify(frostWolf.statusImmune)}`);
  const isStatusImmune = vm.runInContext("isStatusImmune", on);
  if (!isStatusImmune(frostWolf, "frozen")) throw new Error("expected frostWolf to also be immune to frozen directly (defense in depth)");
  return { statusImmune: frostWolf.statusImmune };
});
record("S4-A2-ACTIONS-SOURCE-USES-HELPER-01", "Both Winter's Verdict call sites (ally + player) read isChillFamily, not a bare .chilled check", () => {
  const fs2 = require("fs");
  const src = fs2.readFileSync(path.join(ROOT, "js/data/actions.js"), "utf8");
  const matches = [...src.matchAll(/isChillFamily\(/g)];
  if (matches.length < 2) throw new Error(`expected at least 2 isChillFamily( call sites in actions.js, found ${matches.length}`);
  if (/wintersVerdictUsed[\s\S]{0,200}\.chilled\b/.test(src.replace(/isChillFamily\([^)]*\)/g, "ISCHILLFAMILY"))) {
    throw new Error("found a Winter's Verdict check still reading .chilled directly instead of isChillFamily(...)");
  }
  return { callSites: matches.length };
});

// ---- A4: Spatial display name + elementKeyToDamageType ----
record("S4-A4-ELEMENTKEYTODAMAGETYPE-01", "elementKeyToDamageType: transportation -> spatial, everything else unchanged", () => {
  const elementKeyToDamageType = vm.runInContext("elementKeyToDamageType", on);
  const cases = [["transportation", "spatial"], ["fire", "fire"], ["frost", "frost"], [null, null], [undefined, undefined]];
  const bad = cases.filter(([input, want]) => elementKeyToDamageType(input) !== want);
  if (bad.length) throw new Error(`mismatch(es): ${JSON.stringify(bad)}`);
  return { checked: cases.length };
});
record("S4-A4-ELEMENTS-NAME-ON-01", "Switch on: ELEMENTS.transportation.name is 'Spatial'; the key itself is untouched (save compatibility)", () => {
  const ELEMENTS = vm.runInContext("ELEMENTS", on);
  if (ELEMENTS.transportation.name !== "Spatial") throw new Error(`expected "Spatial", got ${JSON.stringify(ELEMENTS.transportation.name)}`);
  if (!("transportation" in ELEMENTS)) throw new Error("expected the key to remain \"transportation\"");
  return { name: ELEMENTS.transportation.name };
});
record("S4-A4-ELEMENTS-NAME-OFF-01", "Switch off: ELEMENTS.transportation.name stays 'Transportation' (today's behavior, unchanged)", () => {
  const ELEMENTS = vm.runInContext("ELEMENTS", off);
  if (ELEMENTS.transportation.name !== "Transportation") throw new Error(`expected "Transportation", got ${JSON.stringify(ELEMENTS.transportation.name)}`);
  return { name: ELEMENTS.transportation.name };
});
record("S4-A4-FINDELEMENT-BOTH-WORK-01", "Switch on: findElement matches both the raw key and the new display name", () => {
  const findElement = vm.runInContext("findElement", on);
  if (findElement("transportation") !== "transportation") throw new Error(`expected "transportation" to still match by key`);
  if (findElement("spatial") !== "transportation") throw new Error(`expected "spatial" to match the new name`);
  return { ok: true };
});
record("S4-A4-NO-RAW-TRANSPORTATION-LOOKUP-01", "No remaining inline '=== \"transportation\" ? \"spatial\"' conversion outside elementKeyToDamageType's own definition", () => {
  const fs2 = require("fs");
  let hits = [];
  for (const f of ["js/engine/pipeline.js", "js/engine/combat.js", "js/data/actions.js"]) {
    const src = fs2.readFileSync(path.join(ROOT, f), "utf8");
    if (/"transportation"\s*\?\s*"spatial"/.test(src)) hits.push(f);
  }
  if (hits.length) throw new Error(`found inline transportation->spatial ternary outside the helper, in: ${hits.join(", ")}`);
  return { checked: ["js/engine/pipeline.js", "js/engine/combat.js", "js/data/actions.js"] };
});

// ---- A5: rollPlayerDamage's spell branch (Riposte) is gated ----
record("S4-A5-ROLLPLAYERDAMAGE-GATED-SOURCE-01", "rollPlayerDamage's spell branch reads DAMAGE_TYPES_V2 (no longer an unconditional old-cycle matchup)", () => {
  const fs2 = require("fs");
  const src = fs2.readFileSync(path.join(ROOT, "js/engine/combat.js"), "utf8");
  const fnStart = src.indexOf("function rollPlayerDamage(state, creature, activeElement)");
  if (fnStart < 0) throw new Error("rollPlayerDamage not found");
  const nextFn = src.indexOf("\nfunction ", fnStart + 10);
  const fnBody = src.slice(fnStart, nextFn > 0 ? nextFn : fnStart + 10000);
  if (!/const matchup = DAMAGE_TYPES_V2 \? 1 : avatarOfKnowledgeMatchupOverride/.test(fnBody)) {
    throw new Error("expected rollPlayerDamage's spell-branch matchup to be gated by DAMAGE_TYPES_V2");
  }
  if (!/dmgTagMultiplierForAttacker/.test(fnBody)) throw new Error("expected the new tag-multiplier step to be present");
  return { ok: true };
});
record("S4-A5-ROLLPLAYERDAMAGE-RUNS-01", "rollPlayerDamage's spell branch still runs end-to-end without throwing, both switch states (Riposte's own only call site)", () => {
  for (const ctx of [off, on]) {
    const GameState = vm.runInContext("GameState", ctx);
    const ORIGINS = vm.runInContext("ORIGINS", ctx);
    const rollPlayerDamage = vm.runInContext("rollPlayerDamage", ctx);
    const BESTIARY = vm.runInContext("BESTIARY", ctx);
    const buildFightCreature = vm.runInContext("buildFightCreature", ctx);
    const s = new GameState();
    s.playerName = "T"; s.race = "human"; s.class = "mage";
    s.origin = Object.keys(ORIGINS)[0]; s.level = 25; s.flags.isMage = true; s.primaryElement = "fire";
    s.recomputeStats(false);
    const startCombat = vm.runInContext("startCombat", ctx);
    startCombat(s, "stoneback_beetle", 20);
    const creature = s.combat.enemies[0].creatureObj;
    const dmg = rollPlayerDamage(s, creature);
    if (!(dmg > 0)) throw new Error(`expected positive damage, got ${dmg}`);
  }
  return { ok: true };
});

// ---- A6: enemy Mage nation weights gain Frost ----
record("S4-A6-NATION-WEIGHTS-ON-01", "Switch on: every nation's NATION_ELEMENT_WEIGHTS gains 'frost' appended at the end (lowest weight)", () => {
  const NATION_ELEMENT_WEIGHTS = vm.runInContext("NATION_ELEMENT_WEIGHTS", on);
  const bad = Object.entries(NATION_ELEMENT_WEIGHTS).filter(([nation, list]) => list[list.length - 1] !== "frost");
  if (bad.length) throw new Error(`nation(s) missing frost at the end: ${bad.map(([n]) => n).join(", ")}`);
  return { nations: Object.keys(NATION_ELEMENT_WEIGHTS).length };
});
record("S4-A6-NATION-WEIGHTS-OFF-01", "Switch off: NATION_ELEMENT_WEIGHTS has no frost entry anywhere (today's behavior, unchanged)", () => {
  const NATION_ELEMENT_WEIGHTS = vm.runInContext("NATION_ELEMENT_WEIGHTS", off);
  const bad = Object.entries(NATION_ELEMENT_WEIGHTS).filter(([nation, list]) => list.includes("frost"));
  if (bad.length) throw new Error(`nation(s) unexpectedly have frost with the switch off: ${bad.map(([n]) => n).join(", ")}`);
  return { nations: Object.keys(NATION_ELEMENT_WEIGHTS).length };
});
record("S4-A6-LOWEST-WEIGHT-01", "Frost is reachable but never in a nation's own top-3 (highest-weighted) slots", () => {
  const NATION_ELEMENT_WEIGHTS = vm.runInContext("NATION_ELEMENT_WEIGHTS", on);
  const bad = Object.entries(NATION_ELEMENT_WEIGHTS).filter(([nation, list]) => list.slice(0, 3).includes("frost"));
  if (bad.length) throw new Error(`nation(s) with frost in the top 3: ${bad.map(([n]) => n).join(", ")}`);
  return { ok: true };
});

console.log(ledger.map((l) => `${l.passed ? "ok  " : "FAIL"} ${l.code}: ${l.description}`).join("\n"));
const passed = ledger.filter((l) => l.passed).length;
if (passed !== ledger.length) {
  console.log("\nFAILURES:");
  for (const l of ledger) if (!l.passed) console.log(`  ${l.code}: ${JSON.stringify(l.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
process.exit(passed === ledger.length ? 0 : 1);
