#!/usr/bin/env node
/*
 * FRAGMENTA -- D1 hardening script (Damage Types Step 4 follow-up,
 * Tyler 13 Nov): "Make 'use the weapon or creature type' an explicit
 * value, damageType: 'inherit', on the 142 entries that rely on it."
 *
 * Enumerates every ENEMY_ABILITIES active with toHit:"roll" and no
 * damageType (the same live engine, same test the audit itself runs --
 * not a hand-maintained id list that could drift from it), and inserts
 * `damageType: "inherit", ` into that entry's own single-line object
 * literal in js/data/enemyabilities.js. PLAYER_ACTION_DEFS.basic_attack,
 * TACTICS.decoy/ambush/disarm, and ENEMY_BASIC_ATTACK_DEF got the same
 * field by hand (5 entries, each multi-line or composed via
 * Object.assign -- not worth a general-purpose rewriter for 5 call
 * sites) and are NOT touched by this script; it only confirms they
 * already have it before exiting, so a stale run doesn't silently
 * regress them.
 *
 *   node tools/harden_inherited_damagetype.js            # apply
 *   node tools/harden_inherited_damagetype.js --check    # verify only, no write
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CHECK_ONLY = process.argv.includes("--check");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
function el() {
  return {
    style: {}, dataset: {}, children: [], hidden: true, value: "", textContent: "", innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { return c; }, append() {}, prepend() {}, remove() {}, addEventListener() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return el(); }, querySelectorAll() { return []; }, focus() {},
    scrollIntoView() {}, replaceChildren() {}, closest() { return null; },
  };
}
const store = {};
const ctx = {
  console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, setTimeout: () => 0, clearTimeout() {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  document: { getElementById: () => el(), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el() },
  addEventListener() {},
};
ctx.window = ctx;
vm.createContext(ctx);
for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(ROOT, s), "utf8"), ctx, { filename: s });
const G = (name) => vm.runInContext(name, ctx);

const ENEMY_ABILITIES = G("ENEMY_ABILITIES");
const getEnemyAbility = G("getEnemyAbility");

const needsInherit = [];
for (const id of Object.keys(ENEMY_ABILITIES)) {
  if (ENEMY_ABILITIES[id].type !== "active") continue;
  const def = getEnemyAbility(id);
  if (def.toHit !== "roll") continue;
  if (def.damageType != null) continue; // already has something (a real type, or "fromCreature")
  needsInherit.push(id);
}
console.log(`${needsInherit.length} ENEMY_ABILITIES entries need damageType: "inherit"`);

const filePath = path.join(ROOT, "js", "data", "enemyabilities.js");
let src = fs.readFileSync(filePath, "utf8");
const lines = src.split("\n");
let changed = 0;
const missing = [];
for (const id of needsInherit) {
  const re = new RegExp(`^(  ${id}: \\{ )(?!damageType:)`);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      lines[i] = lines[i].replace(re, `$1damageType: "inherit", `);
      found = true;
      changed++;
      break;
    }
  }
  if (!found) missing.push(id);
}
if (missing.length) {
  console.error(`Could not find/patch a single-line entry for: ${missing.join(", ")} -- check enemyabilities.js's own shape hasn't changed.`);
  process.exit(1);
}
console.log(`patched ${changed} entries`);

if (!CHECK_ONLY) {
  fs.writeFileSync(filePath, lines.join("\n"));
  console.log(`wrote ${filePath}`);
}

// The 5 hand-patched entries (not this script's job) -- just confirm
// they're already in place.
const handPatched = [
  ["js/data/actions.js", "PLAYER_ACTION_DEFS.basic_attack"],
  ["js/data/tactics.js", "TACTICS.decoy"],
  ["js/data/tactics.js", "TACTICS.ambush"],
  ["js/data/tactics.js", "TACTICS.disarm"],
  ["js/data/enemyabilities.js", "ENEMY_BASIC_ATTACK_DEF"],
];
const basicAttackDType = vm.runInContext("getActionDef('basic_attack')", ctx).damageType;
const decoyDType = vm.runInContext("TACTICS.decoy.action.damageType", ctx);
const ambushDType = vm.runInContext("TACTICS.ambush.action.damageType", ctx);
const disarmDType = vm.runInContext("TACTICS.disarm.action.damageType", ctx);
const enemyBasicDType = vm.runInContext("ENEMY_BASIC_ATTACK_DEF.damageType", ctx);
const handOk = [basicAttackDType, decoyDType, ambushDType, disarmDType, enemyBasicDType].every((v) => v === "inherit");
console.log(`hand-patched 5 entries already in place: ${handOk}`, { basicAttackDType, decoyDType, ambushDType, disarmDType, enemyBasicDType });
if (!handOk) process.exit(1);
