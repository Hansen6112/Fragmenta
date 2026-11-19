#!/usr/bin/env node
/*
 * Combat Rebuild Phase 2, step 2d, increment 3c (Tyler, 19 Nov):
 * calculateDamage.incoming, ability-phase (Spell Ward/Storm Barrier/
 * Stonewarden 6pc). These live inside enemyCore (actions.js) itself --
 * a genuinely earlier dispatch point than calculateIncomingDamage's own
 * (mitigateAndApplyHitOnPlayer), since enemyCore's return value IS that
 * function's `edmg` argument at its call sites -- so they share the
 * calculateDamage.incoming hook but are dispatched by a second
 * combinator, calculateAbilityIncomingMultiplier, filtered by
 * `abilityPhase: true` so the two dispatch points never double-fire
 * each other's entries.
 *
 * A real bug surfaced and was fixed during this increment's own
 * development: Storm Barrier/Stonewarden 6pc were first registered with
 * `source: {kind:"set", ...}`, which meant sourceActiveOn filtered the
 * entry out ENTIRELY for a wearer without the set -- but today's code
 * consumes the one-shot flag (stormBarrierUsed/firstHitTakenUsed) on
 * ANY qualifying hit regardless of whether the set is worn; only the
 * damage RATIO is set-gated, inside the behavior itself. Fixed by
 * switching both to `source: {kind:"always"}` (same pattern Spell Ward
 * already used correctly, and the same pattern always:crit/always:sang_*
 * use). Caught by the existing phase1_step1b/1e-i/1e-iii parity suites.
 *
 * VM-sandbox, no Playwright -- same reasoning as every other data-only
 * ledger in this directory.
 *
 *   node tools/tests/phase2_step2d_ability_incoming_ledger.js
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
const calculateAbilityIncomingMultiplier = vm.runInContext("calculateAbilityIncomingMultiplier", ctx);
const MODIFIERS = vm.runInContext("MODIFIERS", ctx);

function withHasSetTier(holder, pairs, fn) {
  const orig = ctx.window.hasSetTier;
  ctx.window.hasSetTier = (h, n, t) => (h === holder && pairs.some(([pn, pt]) => pn === n && pt === t) ? true : orig(h, n, t));
  try { return fn(); } finally { ctx.window.hasSetTier = orig; }
}
function withHasEffect(holder, ids, fn) {
  const orig = ctx.window.hasEffect;
  ctx.window.hasEffect = (h, id) => (h === holder && ids.includes(id) ? true : orig(h, id));
  try { return fn(); } finally { ctx.window.hasEffect = orig; }
}
function makePlayer() { return { combat: { player: {} } }; }
function makeAlly() { return {}; }

record("P2-2D-ABL-REGISTRY-SHAPE-01", "All 3 ability-phase entries exist, abilityPhase: true, source always (not set) for the two flag-consuming ones", () => {
  const sw = MODIFIERS["always:storm_barrier"];
  const sd = MODIFIERS["always:stonewarden_first_hit"];
  const spw = MODIFIERS["effect:spell_ward"];
  const bad = [];
  if (!sw || !sw.abilityPhase || sw.source.kind !== "always") bad.push("storm_barrier");
  if (!sd || !sd.abilityPhase || sd.source.kind !== "always") bad.push("stonewarden_first_hit");
  if (!spw || !spw.abilityPhase || spw.source.kind !== "always") bad.push("spell_ward");
  return { pass: bad.length === 0, bad };
});

record("P2-2D-ABL-STORMBARRIER-FLAG-CONSUMED-WITHOUT-GEAR-01", "Regression guard: Storm Barrier's one-shot flag is consumed on the first qualifying hit even WITHOUT Stormwatch 6pc equipped (today's own gate has no hasSetTier in the flag check itself, only in the ratio)", () => {
  const player = makePlayer();
  const out1 = calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "magic", edmg: 10 });
  const out2 = calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "magic", edmg: 10 });
  return { pass: player.combat.player.stormBarrierUsed === true && out1.edmg === 10 && out2.edmg === 10, out1, out2, stormBarrierUsed: player.combat.player.stormBarrierUsed };
});
record("P2-2D-ABL-STORMBARRIER-RATIO-WITH-GEAR-01", "With Stormwatch 6pc equipped, the first qualifying hit is halved and the flag is still consumed", () => {
  const player = makePlayer();
  const out = withHasSetTier(player, [["Stormwatch", 6]], () => calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "magic", edmg: 10 }));
  return { pass: out.edmg === 5 && player.combat.player.stormBarrierUsed === true, out };
});
record("P2-2D-ABL-STONEWARDEN-FLAG-CONSUMED-WITHOUT-GEAR-01", "Regression guard: Stonewarden 6pc's one-shot flag is consumed on the first qualifying hit even WITHOUT the set equipped", () => {
  const player = makePlayer();
  calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "physical", edmg: 10 });
  return { pass: player.combat.player.firstHitTakenUsed === true };
});
record("P2-2D-ABL-STONEWARDEN-APPLIES-TO-PHYSICAL-FOR-PLAYER-01", "Stonewarden 6pc applies to the player's physical hits too, not just magic", () => {
  const player = makePlayer();
  const out = withHasSetTier(player, [["Stonewarden", 6]], () => calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "physical", edmg: 100 }));
  return { pass: out.edmg === 75, out };
});
record("P2-2D-ABL-STONEWARDEN-ALLY-MAGIC-ONLY-01", "For an ally, Stonewarden 6pc only ever fires on the magic dispatch (kind physical is never even dispatched for an ally -- known gap, left untouched)", () => {
  const ally = makeAlly();
  const magicOut = withHasSetTier(ally, [["Stonewarden", 6]], () => calculateAbilityIncomingMultiplier(ally, "ally", { holder: ally, role: "ally", kind: "magic", edmg: 100 }));
  const resetAlly = makeAlly();
  const physicalOut = withHasSetTier(resetAlly, [["Stonewarden", 6]], () => calculateAbilityIncomingMultiplier(resetAlly, "ally", { holder: resetAlly, role: "ally", kind: "physical", edmg: 100 }));
  return { pass: magicOut.edmg === 75 && physicalOut.edmg === 100, magicOut, physicalOut };
});
record("P2-2D-ABL-SPELLWARD-MAGIC-ONLY-01", "Spell Ward never fires on a physical dispatch (when: kind === 'magic')", () => {
  const player = makePlayer();
  const out = withHasEffect(player, ["spell_ward"], () => calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "physical", edmg: 100 }));
  return { pass: out.edmg === 100, out };
});
record("P2-2D-ABL-SPELLWARD-LEVIATHAN-GRANT-01", "Spell Ward's base grant also comes from Leviathan 4pc outright (always-sourced, no single hasEffect/hasSetTier check could gate this at the registry level)", () => {
  const player = makePlayer();
  const out = withHasSetTier(player, [["Leviathan", 4]], () => calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "magic", edmg: 100 }));
  return { pass: out.edmg === 90, out };
});
record("P2-2D-ABL-COMPOUND-SEQUENTIAL-ROUNDING-01", "Spell Ward then Storm Barrier then Stonewarden apply IN ORDER with per-step rounding, matching today's exact chain", () => {
  const player = makePlayer();
  const out = withHasEffect(player, ["spell_ward"], () =>
    withHasSetTier(player, [["Stormwatch", 6], ["Stonewarden", 6]], () =>
      calculateAbilityIncomingMultiplier(player, "player", { holder: player, role: "player", kind: "magic", edmg: 11 })));
  // 11 * 0.9 = 9.9 -> round 10; 10 * 0.5 = 5 -> round 5; 5 * 0.75 = 3.75 -> round 4.
  return { pass: out.edmg === 4, out };
});

record("P2-2D-ABL-WIRING-ALLY-01", "The ally-target magic branch dispatches calculateAbilityIncomingMultiplier, old 3-block chain gone", () => {
  const body = sources["js/data/actions.js"];
  const allyMagicStart = body.indexOf('if (COMBAT_UNIFY.U1 && creature.element)');
  const allyMagicBody = body.slice(allyMagicStart, allyMagicStart + 2500);
  const hasNewCall = /calculateAbilityIncomingMultiplier\(ally, "ally"/.test(allyMagicBody);
  const oldChainGone = !/ally\.stormBarrierUsed = true;/.test(allyMagicBody);
  return { pass: hasNewCall && oldChainGone, hasNewCall, oldChainGone };
});
record("P2-2D-ABL-WIRING-PLAYER-MAGIC-01", "The player-target magic branch dispatches calculateAbilityIncomingMultiplier", () => {
  const body = sources["js/data/actions.js"];
  const count = (body.match(/calculateAbilityIncomingMultiplier\(state, "player"/g) || []).length;
  return { pass: count === 2, count }; // once in the magic branch, once in the flat branch
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
