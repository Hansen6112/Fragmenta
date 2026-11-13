#!/usr/bin/env node
/*
 * Damage Types spec v1.0, "Content Load (Step 3 Data)" handoff: proof
 * for the two engine extensions (§2a creature "fromCreature" basic
 * attacks, §2b per-variant abilityOverrides/Heated Mist) and the §3
 * status work (Venom stacking, Poison's non-stacking debuff, Chilled ->
 * Frozen escalation) -- all off by default, same DAMAGE_TYPES_V2 gate
 * as everything else in this system.
 *
 * NOT a Playwright/browser ledger, same reason as the A1/A5 ledgers'
 * own header: DAMAGE_TYPES_V2 is a plain `const false`, not an object
 * like COMBAT_UNIFY, so there's no in-page way to flip it. Loads the
 * real game into a VM sandbox, once unpatched (switch off) and once
 * with that one line text-patched to true (switch on, in memory only).
 *
 *   node tools/tests/damage_types_content_load_ledger.js
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

// ---- §2a: creature attackType === "fromCreature" basic attacks ----
record("CL-2A-FROMCREATURE-01", "resolveDamageType: creatureAttackType 'fromCreature' resolves to creatureElementType", () => {
  const resolveDamageType = vm.runInContext("resolveDamageType", on);
  const got = resolveDamageType(null, null, "fromCreature", "fire");
  if (got !== "fire") throw new Error(`expected "fire", got ${JSON.stringify(got)}`);
  return { got };
});
record("CL-2A-FROMCREATURE-02", "resolveDamageType: an equipped weapon still wins over creatureAttackType 'fromCreature'", () => {
  const resolveDamageType = vm.runInContext("resolveDamageType", on);
  const got = resolveDamageType(null, "slashing", "fromCreature", "fire");
  if (got !== "slashing") throw new Error(`expected "slashing" (weapon wins), got ${JSON.stringify(got)}`);
  return { got };
});
record("CL-2A-FROMCREATURE-03", "resolveDamageType: an ability's own damageType still wins over creatureAttackType 'fromCreature'", () => {
  const resolveDamageType = vm.runInContext("resolveDamageType", on);
  const got = resolveDamageType({ damageType: "force" }, "slashing", "fromCreature", "fire");
  if (got !== "force") throw new Error(`expected "force" (ability wins), got ${JSON.stringify(got)}`);
  return { got };
});
record("CL-2A-FROMCREATURE-04", "resolveDamageType: 'fromCreature' with no creatureElementType falls back to blunt, not a crash", () => {
  const resolveDamageType = vm.runInContext("resolveDamageType", on);
  const got = resolveDamageType(null, null, "fromCreature", null);
  if (got !== "blunt") throw new Error(`expected "blunt", got ${JSON.stringify(got)}`);
  return { got };
});
record("CL-2A-ELEMENTAL-TEMPLATE-01", "BESTIARY.lesserElemental (and the other 3 generic Elementals) declare attackType: 'fromCreature'", () => {
  const BESTIARY = vm.runInContext("BESTIARY", on);
  const bad = ["lesserElemental", "elemental", "greaterElemental", "primalElemental"].filter((id) => BESTIARY[id].attackType !== "fromCreature");
  if (bad.length) throw new Error(`not set to "fromCreature": ${bad.join(", ")}`);
  return { ok: true };
});

// ---- §2b: per-variant abilityOverrides (Heated Mist) ----
function buildHeatedMistCreature(ctx) {
  const BESTIARY = vm.runInContext("BESTIARY", ctx);
  const buildFightCreature = vm.runInContext("buildFightCreature", ctx);
  const heatedMist = BESTIARY.youngSkrelDrak.elementVariants.find((v) => v.id === "heated_mist");
  if (!heatedMist) throw new Error("heated_mist variant not found on youngSkrelDrak.elementVariants");
  // Isolate the scenario from pickElementVariant's own randomness (A5,
  // already proven by its own ledger) -- a single-entry variant list and
  // a single-active roster make this a deterministic, forced-selection
  // test of the override mechanism alone, not of which variant/ability
  // gets picked.
  const template = Object.assign({}, BESTIARY.youngSkrelDrak, { elementVariants: [heatedMist], actives: ["inherited_breath"] });
  return buildFightCreature(template, 20, null, "test_heated_mist_skrel_drak", null);
}
record("CL-2B-ABILITYOVERRIDE-01", "A Heated Mist Skrel-Drak's inherited_breath resolves at 150% dmgMult and aoe:true, not its base 1.8x single-target", () => {
  const creature = buildHeatedMistCreature(on);
  if (creature.variantStatus !== "burning") throw new Error(`expected variant status "burning", got ${JSON.stringify(creature.variantStatus)}`);
  if (!creature.variantAbilityOverrides || !creature.variantAbilityOverrides.inherited_breath) {
    throw new Error(`creature.variantAbilityOverrides missing inherited_breath: ${JSON.stringify(creature.variantAbilityOverrides)}`);
  }
  const resolveEnemyActiveAbility = vm.runInContext("resolveEnemyActiveAbility", on);
  const state = { health: 100, maxHealth: 100, combat: { player: { playerStatuses: {} }, enemies: [{ alive: true, abilityCooldowns: {}, passiveOnceFlags: {}, priorAbilityUseFlags: {} }], activeIndex: 0 } };
  const result = resolveEnemyActiveAbility(state, creature);
  if (!result || result.id !== "inherited_breath") throw new Error(`expected inherited_breath to be selected (only active), got ${JSON.stringify(result && result.id)}`);
  if (result.dmgMult !== 1.5) throw new Error(`expected dmgMult 1.5, got ${result.dmgMult}`);
  if (result.aoe !== true) throw new Error(`expected aoe: true, got ${result.aoe}`);
  return { dmgMult: result.dmgMult, aoe: result.aoe };
});
record("CL-2B-ABILITYOVERRIDE-OFF-01", "Switch off: the same Heated Mist creature's inherited_breath keeps its base 1.8x single-target (no override, no variant pick at all)", () => {
  const creature = buildHeatedMistCreature(off);
  if (creature.variantStatus) throw new Error(`switch off should never pick a variant at all, got variantStatus ${JSON.stringify(creature.variantStatus)}`);
  const resolveEnemyActiveAbility = vm.runInContext("resolveEnemyActiveAbility", off);
  const state = { health: 100, maxHealth: 100, combat: { player: { playerStatuses: {} }, enemies: [{ alive: true, abilityCooldowns: {}, passiveOnceFlags: {}, priorAbilityUseFlags: {} }], activeIndex: 0 } };
  const result = resolveEnemyActiveAbility(state, creature);
  if (result.dmgMult !== 1.8) throw new Error(`expected base dmgMult 1.8, got ${result.dmgMult}`);
  if (result.aoe !== false) throw new Error(`expected aoe: false, got ${result.aoe}`);
  return { dmgMult: result.dmgMult, aoe: result.aoe };
});

// ---- §3: Venom stacking, Poison's debuff, Chilled -> Frozen ----
record("CL-3-VENOM-STACK-ON-01", "Switch on: Venom is stackable up to 3", () => {
  const getStatusEffect = vm.runInContext("getStatusEffect", on);
  const venom = getStatusEffect("venom");
  if (!venom.stackable || venom.maxStacks !== 3) throw new Error(`expected stackable/maxStacks:3, got ${JSON.stringify(venom)}`);
  return venom;
});
record("CL-3-VENOM-STACK-OFF-01", "Switch off: Venom stays non-stacking (today's behavior, unchanged)", () => {
  const getStatusEffect = vm.runInContext("getStatusEffect", off);
  const venom = getStatusEffect("venom");
  if (venom.stackable) throw new Error(`expected non-stacking with the switch off, got ${JSON.stringify(venom)}`);
  return venom;
});
record("CL-3-POISON-DEBUFF-ON-01", "Switch on: Poison (sang_iag_poison) gains the -10% Atk/Acc debuff, stays non-stacking", () => {
  const getStatusEffect = vm.runInContext("getStatusEffect", on);
  const poison = getStatusEffect("sang_iag_poison");
  if (poison.stackable) throw new Error(`expected non-stacking, got ${JSON.stringify(poison)}`);
  if (!poison.debuff || poison.debuff.atkPct !== -0.1) throw new Error(`expected debuff.atkPct -0.1, got ${JSON.stringify(poison.debuff)}`);
  return poison;
});
record("CL-3-POISON-DEBUFF-OFF-01", "Switch off: Poison (sang_iag_poison) keeps today's plain DOT, no debuff field", () => {
  const getStatusEffect = vm.runInContext("getStatusEffect", off);
  const poison = getStatusEffect("sang_iag_poison");
  if (poison.debuff) throw new Error(`expected no debuff field with the switch off, got ${JSON.stringify(poison.debuff)}`);
  return poison;
});
function tickChilledToExpiry(ctx) {
  const tickPlayerStatuses = vm.runInContext("tickPlayerStatuses", ctx);
  const state = { maxHealth: 100, health: 100, combat: { player: { playerStatuses: { chilled: { name: "Chilled", debuff: { agi: -10 }, turnsLeft: 1, stacks: 1 } } } } };
  tickPlayerStatuses(state);
  return state.combat.player.playerStatuses;
}
record("CL-3-CHILLED-EXPIRE-ON-01", "Switch on: a single Chilled, never reapplied, expires harmlessly (no on-expiry escalation)", () => {
  const statuses = tickChilledToExpiry(on);
  if (statuses.chilled) throw new Error(`expected chilled to be gone, got ${JSON.stringify(statuses.chilled)}`);
  if (statuses.frozen) throw new Error(`expected no escalation on plain expiry, got ${JSON.stringify(statuses)}`);
  return statuses;
});
record("CL-3-CHILLED-EXPIRE-OFF-01", "Switch off: a single Chilled expires harmlessly (today's behavior, unchanged)", () => {
  const statuses = tickChilledToExpiry(off);
  if (statuses.chilled) throw new Error(`expected chilled to be gone, got ${JSON.stringify(statuses.chilled)}`);
  if (statuses.frozen) throw new Error(`expected no escalation with the switch off, got ${JSON.stringify(statuses)}`);
  return statuses;
});
function secondFrostHitWhileChilled(ctx) {
  const applyPlayerStatus = vm.runInContext("applyPlayerStatus", ctx);
  const getStatusEffect = vm.runInContext("getStatusEffect", ctx);
  const state = { combat: { player: { playerStatuses: {} } } };
  const chilled = getStatusEffect("chilled");
  applyPlayerStatus(state, "chilled", chilled, "Frost Wolf");
  applyPlayerStatus(state, "chilled", chilled, "Frost Wolf");
  return state.combat.player.playerStatuses;
}
record("CL-3-CHILLED-REAPPLY-ON-01", "Switch on: a second frost hit while still Chilled gives Frozen (build-up on reapplication, not natural expiry)", () => {
  const statuses = secondFrostHitWhileChilled(on);
  if (statuses.chilled) throw new Error(`expected chilled to be replaced, got ${JSON.stringify(statuses.chilled)}`);
  if (!statuses.frozen) throw new Error(`expected frozen from the second hit, got ${JSON.stringify(statuses)}`);
  if (statuses.frozen.debuff.agi !== -10 || statuses.frozen.debuff.spd !== -10 || statuses.frozen.debuff.acc !== -5) throw new Error(`unexpected Frozen debuff: ${JSON.stringify(statuses.frozen.debuff)}`);
  return statuses;
});
record("CL-3-CHILLED-REAPPLY-OFF-01", "Switch off: a second frost hit while still Chilled just refreshes Chilled's own duration (today's behavior, unchanged)", () => {
  const statuses = secondFrostHitWhileChilled(off);
  if (!statuses.chilled) throw new Error(`expected chilled to still be the active status, got ${JSON.stringify(statuses)}`);
  if (statuses.frozen) throw new Error(`expected no escalation with the switch off, got ${JSON.stringify(statuses)}`);
  return statuses;
});
record("CL-3-DROWSY-REAPPLY-ON-01", "Switch on: a second Drowsy reapplication becomes Asleep, the same generic mechanism as Chilled -> Frozen", () => {
  const applyPlayerStatus = vm.runInContext("applyPlayerStatus", on);
  const getStatusEffect = vm.runInContext("getStatusEffect", on);
  const state = { combat: { player: { playerStatuses: {} } } };
  const drowsy = getStatusEffect("drowsy");
  applyPlayerStatus(state, "drowsy", drowsy, "Veilwing");
  applyPlayerStatus(state, "drowsy", drowsy, "Veilwing");
  const statuses = state.combat.player.playerStatuses;
  if (statuses.drowsy) throw new Error(`expected drowsy to be replaced, got ${JSON.stringify(statuses.drowsy)}`);
  if (!statuses.asleep) throw new Error(`expected asleep from the second application, got ${JSON.stringify(statuses)}`);
  return statuses;
});
record("CL-3-ASHEN-LUNGS-HEAL-01", "Switch on: Ashen Lungs' -25% healing received reduces a player heal via applyHeal", () => {
  const applyHeal = vm.runInContext("applyHeal", on);
  const state = { playerDowned: false, health: 50, maxHealth: 200, combat: { player: { playerStatuses: { ashen_lungs: { debuff: { acc: -5, healingReceivedPct: -0.25 }, stacks: 1 } } } } };
  const { healed } = applyHeal(state, 100);
  if (healed !== 75) throw new Error(`expected 75 (100 * 0.75), got ${healed}`);
  return { healed };
});
record("CL-3-ASHEN-LUNGS-HEAL-NONE-01", "No Ashen Lungs active: applyHeal is unaffected (control case)", () => {
  const applyHeal = vm.runInContext("applyHeal", on);
  const state = { playerDowned: false, health: 50, maxHealth: 200, combat: { player: { playerStatuses: {} } } };
  const { healed } = applyHeal(state, 100);
  if (healed !== 100) throw new Error(`expected 100 (unaffected), got ${healed}`);
  return { healed };
});

// ---- spot-check the bulk content load itself didn't silently miss a type ----
record("CL-LOAD-SPOTCHECK-01", "A few representative loaded fields, sampled directly off BESTIARY/ITEM_DEFS/ENEMY_ABILITIES", () => {
  const BESTIARY = vm.runInContext("BESTIARY", on);
  const ITEM_DEFS = vm.runInContext("ITEM_DEFS", on);
  const ENEMY_ABILITIES = vm.runInContext("ENEMY_ABILITIES", on);
  const checks = [
    [BESTIARY.frostWolf.dmgTags && BESTIARY.frostWolf.dmgTags.frost, "resist"],
    [BESTIARY.golem_stone.dmgTags && BESTIARY.golem_stone.dmgTags.poison, "immune"],
    [BESTIARY.golem_stone.statusImmune && BESTIARY.golem_stone.statusImmune.includes("bleed"), true],
    [ITEM_DEFS["a short sword"].damageType, "slashing"],
    [ITEM_DEFS["Widow's Lament"].damageType, undefined],
    [ENEMY_ABILITIES.gore.damageType, "piercing"],
    // Step 4 follow-up (D1 hardening, Tyler 13 Nov): pounce used to have
    // no damageType at all (silently inherits the wielder's own
    // attackType); it's "inherit" explicitly now, same meaning, so the
    // audit can tell "deliberately inherits" apart from "nobody's
    // checked this yet" again.
    [ENEMY_ABILITIES.pounce.damageType, "inherit"],
  ];
  const bad = checks.filter(([got, want]) => got !== want);
  if (bad.length) throw new Error(`mismatch(es): ${JSON.stringify(bad)}`);
  return { checked: checks.length };
});
record("CL-LOAD-MAINHAND-RULE-01", "Follow-up (13 Nov): the 6 corrected mainhand items (2 mis-tagged weapons, 4 mage foci) all have a real damageType now; every mainhand item in ITEM_DEFS has one except the 8 still-held weapons", () => {
  const ITEM_DEFS = vm.runInContext("ITEM_DEFS", on);
  const checks = [
    [ITEM_DEFS["a caravan guard saber"].damageType, "slashing"],
    [ITEM_DEFS["a red banner greatsword"].damageType, "slashing"],
    [ITEM_DEFS["a river focus staff"].damageType, "blunt"],
    [ITEM_DEFS["a crystal focus rod"].damageType, "blunt"],
    [ITEM_DEFS["Lantern of Quiet Passage"].damageType, "blunt"],
    [ITEM_DEFS["Codex of Infinite Horizons"].damageType, "blunt"],
  ];
  const bad = checks.filter(([got, want]) => got !== want);
  if (bad.length) throw new Error(`mismatch(es): ${JSON.stringify(bad)}`);
  const HELD = ["Widow's Lament", "Emberfall", "Black Horizon", "Oathbreaker", "Seven Sorrows", "Sovereign", "Night Requiem", "Galecaller"];
  const untyped = Object.entries(ITEM_DEFS).filter(([name, d]) => d.slot === "mainhand" && !d.damageType && !HELD.includes(name));
  if (untyped.length) throw new Error(`mainhand item(s) with no damageType, not in the held list: ${untyped.map(([n]) => n).join(", ")}`);
  return { checked: checks.length, untyped: untyped.length };
});

console.log(ledger.map((l) => `${l.passed ? "ok  " : "FAIL"} ${l.code}: ${l.description}`).join("\n"));
const passed = ledger.filter((l) => l.passed).length;
if (passed !== ledger.length) {
  console.log("\nFAILURES:");
  for (const l of ledger) if (!l.passed) console.log(`  ${l.code}: ${JSON.stringify(l.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
process.exit(passed === ledger.length ? 0 : 1);
