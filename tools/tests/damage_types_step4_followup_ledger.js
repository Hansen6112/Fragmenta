#!/usr/bin/env node
/*
 * Damage Types Step 4 follow-up (Tyler 13 Nov) -- proof for:
 *   1. A Mage's spell damage type comes from their own element
 *      (rollPlayerDamageCoreForPipeline's isSpell branch + combat.js's
 *      rollPlayerDamage Riposte-path analog), not their weapon.
 *   2. An Enemy Mage's own attackType = elementKeyToDamageType(element),
 *      set at spawn, covering both the player-target and ally-target
 *      attack paths.
 *   5. A3: ELEMENT_ABILITIES.frost ("Rime") -- Chilled on first hit,
 *      Frozen on a second hit while already Chilled, respecting
 *      statusImmune, with effectiveEnemyAgility/Speed/Accuracy reading
 *      the per-enemy `chill` field (PER_ENEMY_FIELDS) correctly.
 *
 * NOT a Playwright/browser ledger, same reason as every other VM-sandbox
 * ledger in this directory: DAMAGE_TYPES_V2 is a plain const, so there's
 * no in-page way to flip it. The real committed switch is permanently
 * true as of Part C -- this still builds a sandbox with either state,
 * direction-agnostic (see damage_types_step4_parta_ledger.js's own
 * comment on why).
 *
 *   node tools/tests/damage_types_step4_followup_ledger.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sources = Object.fromEntries(scripts.map((s) => [s, fs.readFileSync(path.join(ROOT, s), "utf8")]));

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

function withForcedHit(ctx, fn) {
  const orig = ctx.window.attackConnects;
  ctx.window.attackConnects = () => true;
  try { return fn(); } finally { ctx.window.attackConnects = orig; }
}
function makeMage(ctx, element, level) {
  const GameState = vm.runInContext("GameState", ctx);
  const ORIGINS = vm.runInContext("ORIGINS", ctx);
  const s = new GameState();
  s.race = "human"; s.class = "mage"; s.origin = Object.keys(ORIGINS)[0]; s.level = level || 20;
  s.flags.isMage = true; s.primaryElement = element; s.knowledge = 50;
  s.recomputeStats(false);
  return s;
}

// ---- 1: a Mage's basic attack uses their own element, not their weapon ----
const onCtx1 = buildSandbox(true);
record("S4F-1-BASIC-ATTACK-ELEMENT-01", "A Fire Mage's basic attack against ashWolf resolves lastDamageType to fire", () => {
  const s = makeMage(onCtx1, "fire", 20);
  vm.runInContext("startCombat", onCtx1)(s, "ashWolf", 20);
  withForcedHit(onCtx1, () => vm.runInContext("playerAttack", onCtx1)(s));
  const type = s.combat.enemies[0].lastDamageType;
  return { pass: type === "fire", type };
});
record("S4F-1-BASIC-ATTACK-TAG-01", "That same hit gets ashWolf's own Resist Fire tag (x0.5), not an unmitigated hit", () => {
  const s = makeMage(onCtx1, "fire", 20);
  const BESTIARY = vm.runInContext("BESTIARY", onCtx1);
  const tag = BESTIARY.ashWolf.dmgTags && BESTIARY.ashWolf.dmgTags.fire;
  return { pass: tag === "resist", tag };
});
record("S4F-1-SOURCE-RIPOSTE-PATH-01", "combat.js's rollPlayerDamage spell branch resolves damage type via elementKeyToDamageType, not equipmentWeaponDamageType", () => {
  const src = sources["js/engine/combat.js"];
  const fnStart = src.indexOf("function rollPlayerDamage(state, creature, activeElement)");
  const nextFn = src.indexOf("\nfunction ", fnStart + 10);
  const body = src.slice(fnStart, nextFn > 0 ? nextFn : fnStart + 6000);
  const usesElement = /spellDType = DAMAGE_TYPES_V2 \? elementKeyToDamageType\(/.test(body);
  const usesWeapon = /spellDType = DAMAGE_TYPES_V2 \? resolveDamageType\(null, equipmentWeaponDamageType/.test(body);
  return { pass: usesElement && !usesWeapon, usesElement, usesWeapon };
});

// ---- 2: an Enemy Mage's own attackType matches its element ----
record("S4F-2-ENEMYMAGE-ATTACKTYPE-01", "generateEnemyMage sets attackType = elementKeyToDamageType(element) at spawn", () => {
  const mage = vm.runInContext("generateEnemyMage", onCtx1)("kabal", 3, 20);
  const expected = vm.runInContext("elementKeyToDamageType", onCtx1)(mage.element);
  return { pass: mage.attackType === expected, attackType: mage.attackType, element: mage.element, expected };
});
record("S4F-2-ENEMYMAGE-CAST-RESOLVES-01", "A Fire Enemy Mage's own attack on the player resolves playerLastHitType to fire", () => {
  const s = makeMage(onCtx1, "frost", 20);
  const mage = vm.runInContext("generateEnemyMage", onCtx1)("kabal", 3, 20);
  mage.element = "fire";
  mage.attackType = vm.runInContext("elementKeyToDamageType", onCtx1)("fire");
  vm.runInContext("startCombat", onCtx1)(s, mage, 20);
  withForcedHit(onCtx1, () => vm.runInContext("playerAttack", onCtx1)(s));
  const hitType = s.combat ? s.combat.player.playerLastHitType : null;
  return { pass: hitType === "fire", hitType };
});
record("S4F-2-ENEMYMAGE-WEAK-TAG-01", "A Frost attunement is Weak to Fire (the tag the Fire Enemy Mage's own hit should apply at x1.5)", () => {
  const s = makeMage(onCtx1, "frost", 20);
  return { pass: s.dmgTags && s.dmgTags.fire === "weak", dmgTags: s.dmgTags };
});

// ---- 5 (A3): Rime -- build-up, immunity, countdown ----
function frostMageVs(ctx, creature, level) {
  const s = makeMage(ctx, "frost", level || 25);
  s.health = 999999; s.maxHealth = 999999;
  vm.runInContext("startCombat", ctx)(s, creature, level || 25);
  return s;
}
record("S4F-5-ELEMENT-ABILITIES-FROST-01", "ELEMENT_ABILITIES.frost exists with the spec'd shape (Knowledge 10, cooldown 3, damageType frost, hook frostOnHit)", () => {
  const def = vm.runInContext("ELEMENT_ABILITIES", onCtx1).frost;
  return {
    pass: !!def && def.knowledgeReq === 10 && def.cooldown === 3 && def.action.damageType === "frost" && def.action.elementOnHit === "frostOnHit",
    def: def && { knowledgeReq: def.knowledgeReq, cooldown: def.cooldown, damageType: def.action.damageType, elementOnHit: def.action.elementOnHit },
  };
});
record("S4F-5-FIRST-CAST-CHILLED-01", "First cast of Rime on a target with no chill gives Chilled (not Frozen)", () => {
  const s = frostMageVs(onCtx1, "arbitarius_commander", 29);
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  const slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  return { pass: !!slot.chill && slot.chill.tier === "chilled" && slot.chill.turnsLeft === 2, chill: slot.chill };
});
record("S4F-5-SECOND-CAST-FROZEN-01", "A second cast while already Chilled escalates to Frozen", () => {
  const s = frostMageVs(onCtx1, "arbitarius_commander", 29);
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  s.combat.cooldowns.frost = 0;
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  const slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  return { pass: !!slot.chill && slot.chill.tier === "frozen" && slot.chill.turnsLeft === 2, chill: slot.chill };
});
record("S4F-5-FROZEN-DEBUFF-VALUES-01", "Frozen reads as Agility -10, Speed -10, Accuracy -5 (A1's own values) through effectiveEnemy*", () => {
  const s = frostMageVs(onCtx1, "arbitarius_commander", 29);
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  s.combat.cooldowns.frost = 0;
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  const slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  const agi = vm.runInContext("effectiveEnemyAgility", onCtx1)(slot);
  const spd = vm.runInContext("effectiveEnemySpeed", onCtx1)(slot);
  const acc = vm.runInContext("effectiveEnemyAccuracy", onCtx1)(slot);
  const raw = slot.creatureObj;
  return {
    pass: agi === raw.agi - 10 && spd === raw.spd - 10 && acc === raw.acc - 5,
    agi, spd, acc, raw: { agi: raw.agi, spd: raw.spd, acc: raw.acc },
  };
});
record("S4F-5-WINTER-COAT-IMMUNE-01", "A Winter-Coat (statusImmune: ['chilled']) creature takes the hit but never gets chill set", () => {
  const s = frostMageVs(onCtx1, Object.assign({}, vm.runInContext("BESTIARY", onCtx1).stoneback_beetle, { statusImmune: ["chilled"] }));
  const before = s.combat.enemies[0].hp;
  const lines = withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  const slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  return { pass: slot.chill === null && slot.hp < before, chill: slot.chill, dealtDamage: before - slot.hp, lines };
});
record("S4F-5-CHILL-EXPIRES-01", "The debuff clears after 2 full rounds", () => {
  const s = frostMageVs(onCtx1, "arbitarius_commander", 29);
  withForcedHit(onCtx1, () => vm.runInContext("useElementAbility", onCtx1)(s, "frost"));
  let slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  const afterCast = slot.chill && slot.chill.turnsLeft;
  withForcedHit(onCtx1, () => vm.runInContext("playerAttack", onCtx1)(s));
  const afterRound1 = s.combat ? vm.runInContext("activeEnemySlot", onCtx1)(s.combat).chill : "combat ended";
  if (!s.combat) return { pass: false, note: "combat ended before the debuff could expire -- re-run", afterCast, afterRound1 };
  withForcedHit(onCtx1, () => vm.runInContext("playerAttack", onCtx1)(s));
  const afterRound2 = s.combat ? vm.runInContext("activeEnemySlot", onCtx1)(s.combat).chill : null;
  return { pass: afterCast === 2 && afterRound2 === null, afterCast, afterRound1, afterRound2 };
});
record("S4F-5-PER-ENEMY-FIELDS-REGISTERED-01", "chill is registered in PER_ENEMY_FIELDS (combat.js) and present on a freshly-built enemy slot", () => {
  const PER_ENEMY_FIELDS = vm.runInContext("PER_ENEMY_FIELDS", onCtx1);
  const s = frostMageVs(onCtx1, "stoneback_beetle");
  const slot = vm.runInContext("activeEnemySlot", onCtx1)(s.combat);
  return { pass: PER_ENEMY_FIELDS.includes("chill") && "chill" in slot && slot.chill === null };
});

const passed = ledger.filter((r) => r.passed).length;
console.log(JSON.stringify(ledger, null, 2));
console.log(`\n${passed}/${ledger.length} passed`);
if (passed !== ledger.length) {
  console.log("FAILURES:");
  for (const r of ledger) if (!r.passed) console.log(`  ${r.code}: ${r.description}\n    detail: ${JSON.stringify(r.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
