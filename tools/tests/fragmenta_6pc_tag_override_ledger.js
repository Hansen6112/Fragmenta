#!/usr/bin/env node
/*
 * Fragmenta 6pc tag override (Tyler, 18 Nov, approved -- Phase 2 Bucket
 * Review §4, folded in separately from step 2d). The original 6pc bonus
 * (js/data/matchups.js's elementMultiplier, boosting the old element-vs-
 * element matchup cycle) only ever ran with DAMAGE_TYPES_V2 off, which
 * went dead the moment damage types went live (09d4131) -- the switch is
 * now permanently true (js/data/damagetypes.js), so six Fragmenta pieces
 * granted nothing. This is the replacement's own proof:
 *   - against the wearer's non-physical hits, Weak counts as x1.75
 *     (was x1.5) and Resist as x0.75 (was x0.5); Normal/Immune untouched;
 *   - with Avatar of Knowledge also active, its own tag-shift (Immune ->
 *     Resist, Resist -> Normal) runs FIRST, so Immune reads Fragmenta's
 *     Resist value (x0.75) and Resist reads Normal (x1);
 *   - physical hits are unaffected (nonPhysicalOnly), and so is a hit
 *     with no Fragmenta 6pc active at all;
 *   - the dead matchups.js branch is gone, and the registry entry is a
 *     real behavior/bucket-less (Rule 3) entry, not presence-only.
 *
 * Direct function-level checks on dmgTagMultiplierForAttacker (js/data/
 * damagetypes.js) plus source-text checks pinning both call sites
 * (combat.js's rollPlayerDamage, pipeline.js's rollPlayerDamageCoreForPipeline)
 * and the still-plain weapon-attack path -- same VM-sandbox approach as
 * damage_types_step4_followup_ledger.js, no Playwright needed since this
 * never touches the DOM.
 *
 *   node tools/tests/fragmenta_6pc_tag_override_ledger.js
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
const dmgTagMultiplierForAttacker = vm.runInContext("dmgTagMultiplierForAttacker", ctx);

// Flips sourceActiveOn's "set" case for Fragmenta:6 only, same monkeypatch
// idiom this suite already uses for attackConnects (damage_types_step4_followup_ledger.js's
// withForcedHit) -- real hasSetTier logic (setPieceCount, actual equipment)
// is 2d/content's own concern, not what this fix touches.
function withFragmentaActive(active, fn) {
  const orig = ctx.window.hasSetTier;
  ctx.window.hasSetTier = (holder, setName, tier) => (setName === "Fragmenta" && tier === 6 ? active : orig(holder, setName, tier));
  try { return fn(); } finally { ctx.window.hasSetTier = orig; }
}
function makeState() {
  const GameState = vm.runInContext("GameState", ctx);
  const s = new GameState();
  s.combat = { player: {} };
  return s;
}

// ---- without the 6pc: unchanged ----
record("FRAG6-OFF-RESIST-01", "No Fragmenta 6pc: Resist still reads x0.5", () => {
  const s = makeState();
  const m = withFragmentaActive(false, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "resist" } }, "fire"));
  return { pass: m === 0.5, m };
});
record("FRAG6-OFF-WEAK-01", "No Fragmenta 6pc: Weak still reads x1.5", () => {
  const s = makeState();
  const m = withFragmentaActive(false, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "weak" } }, "fire"));
  return { pass: m === 1.5, m };
});

// ---- with the 6pc, non-physical hits ----
record("FRAG6-ON-RESIST-01", "Fragmenta 6pc, Resist Fire target, Fire spell: x0.75 (not x0.5)", () => {
  const s = makeState();
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "resist" } }, "fire"));
  return { pass: m === 0.75, m };
});
record("FRAG6-ON-WEAK-01", "Fragmenta 6pc, Fire-weak target, Fire spell: x1.75", () => {
  const s = makeState();
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "weak" } }, "fire"));
  return { pass: m === 1.75, m };
});
record("FRAG6-ON-NORMAL-01", "Fragmenta 6pc, Normal tag: unaffected (x1)", () => {
  const s = makeState();
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "normal" } }, "fire"));
  return { pass: m === 1, m };
});
record("FRAG6-ON-IMMUNE-01", "Fragmenta 6pc, Immune tag (no Avatar of Knowledge): unaffected (x0)", () => {
  const s = makeState();
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "immune" } }, "fire"));
  return { pass: m === 0, m };
});

// ---- physical hits are unaffected (nonPhysicalOnly) ----
record("FRAG6-ON-PHYSICAL-UNAFFECTED-01", "Fragmenta 6pc, Resist tag but a physical damage type (slashing): stays x0.5", () => {
  const s = makeState();
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { slashing: "resist" } }, "slashing"));
  return { pass: m === 0.5, m };
});

// ---- combined with Avatar of Knowledge's own tag shift ----
function withAvatarOfKnowledge(s, active) { s.combat.player.avatarOfKnowledgeTurns = active ? 4 : 0; }
record("FRAG6-ON-AOK-RESIST-01", "Fragmenta 6pc + Avatar of Knowledge, Resist target: shifts to Normal first, reads x1", () => {
  const s = makeState();
  withAvatarOfKnowledge(s, true);
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "resist" } }, "fire"));
  return { pass: m === 1, m };
});
record("FRAG6-ON-AOK-IMMUNE-01", "Fragmenta 6pc + Avatar of Knowledge, Immune target: shifts to Resist first, reads Fragmenta's x0.75", () => {
  const s = makeState();
  withAvatarOfKnowledge(s, true);
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "immune" } }, "fire"));
  return { pass: m === 0.75, m };
});
record("FRAG6-ON-AOK-WEAK-01", "Fragmenta 6pc + Avatar of Knowledge, Weak target (untouched by the shift): still x1.75", () => {
  const s = makeState();
  withAvatarOfKnowledge(s, true);
  const m = withFragmentaActive(true, () => dmgTagMultiplierForAttacker(s, "player", { dmgTags: { fire: "weak" } }, "fire"));
  return { pass: m === 1.75, m };
});

// ---- registry shape (M3-style: a real behavior/bucket-less entry) ----
record("FRAG6-REGISTRY-SHAPE-01", "set:Fragmenta:6 is registered: hook calculateDamage.tags, behavior tagValueOverride, no bucket (Rule 3), holders includes player", () => {
  const MODIFIERS = vm.runInContext("MODIFIERS", ctx);
  const entry = MODIFIERS["set:Fragmenta:6"];
  return {
    pass: !!entry && entry.hook === "calculateDamage.tags" && entry.behavior === "tagValueOverride" && entry.bucket === null && entry.holders.includes("player"),
    entry: entry && { hook: entry.hook, behavior: entry.behavior, bucket: entry.bucket, holders: entry.holders, params: entry.params },
  };
});

// ---- both live spell call sites route through the attacker-aware function, with role "player" ----
record("FRAG6-WIRING-COMBAT-01", "combat.js's rollPlayerDamage spell branch calls dmgTagMultiplierForAttacker(state, \"player\", creature, spellDType)", () => {
  const body = sources["js/engine/combat.js"];
  return { pass: /dmgTagMultiplierForAttacker\(state, "player", creature, spellDType\)/.test(body) };
});
record("FRAG6-WIRING-PIPELINE-01", "pipeline.js's rollPlayerDamageCoreForPipeline spell branch calls dmgTagMultiplierForAttacker(state, \"player\", creature, spellDType)", () => {
  const body = sources["js/engine/pipeline.js"];
  return { pass: /dmgTagMultiplierForAttacker\(state, "player", creature, spellDType\)/.test(body) };
});
record("FRAG6-WIRING-WEAPON-UNAFFECTED-01", "pipeline.js's weapon-attack branch still calls the plain dmgTagMultiplier (not the attacker-aware one) -- Fragmenta 6pc never touches a physical weapon hit", () => {
  const body = sources["js/engine/pipeline.js"];
  return { pass: /dmg = Math\.round\(dmg \* dmgTagMultiplier\(creature, weaponDType\)\);/.test(body) };
});

// ---- the dead branch is actually gone ----
record("FRAG6-MATCHUPS-DEAD-BRANCH-REMOVED-01", "matchups.js's elementMultiplier no longer reads Fragmenta/hasSetTier at all", () => {
  const body = sources["js/data/matchups.js"];
  return { pass: !/hasSetTier/.test(body) && !/fragmentaActive/.test(body) };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
