#!/usr/bin/env node
/*
 * Damage Types spec v1.0, Decisions Addendum §2: proof for
 * pickElementVariant's location-weighted pick (js/data/damagetypes.js) --
 * "over 1,000 spawns per location tag, the matching variants dominate,
 * and every variant still appears at least once across all tags."
 *
 * NOT a Playwright/browser ledger, same reason as
 * damage_types_a1_injury_v2_ledger.js's own header: DAMAGE_TYPES_V2 is a
 * plain `const false`, not an object like COMBAT_UNIFY, so there's no
 * in-page way to flip it. Loads the real game into a VM sandbox with
 * that one line text-patched to true, in memory only.
 *
 *   node tools/tests/damage_types_a5_variant_weighting_ledger.js
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
  for (const s of scripts) {
    const src = s === "js/data/damagetypes.js" ? sources[s].replace(SWITCH_LINE_RE, "const DAMAGE_TYPES_V2 = true;") : sources[s];
    vm.runInContext(src, ctx, { filename: s });
  }
  return ctx;
}

const ledger = [];
function record(code, description, fn) {
  let passed = false, detail = null;
  try { detail = fn(); passed = true; } catch (e) { detail = { error: e.message }; }
  ledger.push({ code, description, passed, detail });
}

const ctx = buildSandbox();
const pickElementVariant = vm.runInContext("pickElementVariant", ctx);

// Every family's own variant list, and every location tag the Addendum's
// own table names for it -- the tags this test checks "dominate" against.
const FAMILIES = [
  { name: "DRAVEN_DRAK_VARIANTS", tags: ["volcanic", "desert", "tundra", "mountain", "coast", "plains", "swamp", "forest", "jungle"] },
  { name: "SKREL_DRAK_VARIANTS", tags: ["volcanic", "desert", "tundra", "mountain", "coast", "plains", "swamp", "lake", "river"] },
  { name: "ELEMENTAL_VARIANTS", tags: ["volcanic", "desert", "mountain", "cave", "forest", "jungle", "coast", "lake", "river", "sea", "swamp", "tundra"] },
];

const N = 1000;
for (const family of FAMILIES) {
  const variants = vm.runInContext(family.name, ctx);
  const seenAcrossAllTags = new Set();

  for (const tag of family.tags) {
    const counts = {};
    for (const v of variants) counts[v.id] = 0;
    for (let i = 0; i < N; i++) {
      const picked = pickElementVariant(variants, [tag]);
      counts[picked.id]++;
      seenAcrossAllTags.add(picked.id);
    }
    const matching = variants.filter((v) => v.preferredTags && v.preferredTags.includes(tag));
    if (!matching.length) continue; // this tag isn't any variant's preference -- a plain uniform draw, nothing to assert "dominates"
    const matchingCount = matching.reduce((sum, v) => sum + counts[v.id], 0);
    const matchingShare = matchingCount / N;
    // With k variants and m of them matching (weight x4 each, the rest
    // weight 1), the EXPECTED matching share is 4m / (4m + (k-m)) -- NOT
    // a flat 50%: for Elementals (k=7), a single matching variant only
    // expects 40%, well under half, even though that's still a real 2.8x
    // lift over the plain uniform baseline (1/7 = 14.3%). So "dominates"
    // is checked two ways: (1) strictly above the UNBIASED baseline m/k
    // (any real bias at all must clear this, by construction), and (2)
    // reasonably close to the analytically expected share (±15 points,
    // catches a broken weighting formula outright, not just "biased in
    // the right direction").
    const baselineShare = matching.length / variants.length;
    const expectedShare = (4 * matching.length) / (4 * matching.length + (variants.length - matching.length));
    record(`A5-WEIGHT-${family.name}-${tag}`, `${family.name}: a "${tag}" location's own preferred variant(s) (${matching.map((v) => v.id).join(",")}) dominate over ${N} draws`, () => {
      if (matchingShare <= baselineShare) throw new Error(`expected above the unbiased baseline (${(baselineShare * 100).toFixed(1)}%) for "${tag}", got ${(matchingShare * 100).toFixed(1)}% (counts: ${JSON.stringify(counts)})`);
      if (Math.abs(matchingShare - expectedShare) > 0.15) throw new Error(`expected close to the analytically expected share (${(expectedShare * 100).toFixed(1)}%) for "${tag}", got ${(matchingShare * 100).toFixed(1)}% -- off by more than 15 points (counts: ${JSON.stringify(counts)})`);
      return { tag, matchingShare, expectedShare, baselineShare, counts };
    });
  }

  record(`A5-WEIGHT-${family.name}-COVERAGE`, `${family.name}: every variant appeared at least once across all tested tags`, () => {
    const allIds = variants.map((v) => v.id);
    const missing = allIds.filter((id) => !seenAcrossAllTags.has(id));
    if (missing.length) throw new Error(`never picked: ${missing.join(", ")}`);
    return { allIds, seenCount: seenAcrossAllTags.size };
  });

  record(`A5-WEIGHT-${family.name}-NOLOCATION`, `${family.name}: with no location tags at all, every variant is still reachable (plain uniform pick)`, () => {
    const counts = {};
    for (const v of variants) counts[v.id] = 0;
    for (let i = 0; i < N; i++) counts[pickElementVariant(variants, null).id]++;
    const missing = variants.map((v) => v.id).filter((id) => counts[id] === 0);
    if (missing.length) throw new Error(`never picked with no location bias: ${missing.join(", ")} (counts: ${JSON.stringify(counts)})`);
    return counts;
  });
}

console.log(ledger.map((l) => `${l.passed ? "ok  " : "FAIL"} ${l.code}: ${l.description}`).join("\n"));
const passed = ledger.filter((l) => l.passed).length;
if (passed !== ledger.length) {
  console.log("\nFAILURES:");
  for (const l of ledger) if (!l.passed) console.log(`  ${l.code}: ${JSON.stringify(l.detail)}`);
}
console.log(`RESULT: ${passed}/${ledger.length}`);
process.exit(passed === ledger.length ? 0 : 1);
