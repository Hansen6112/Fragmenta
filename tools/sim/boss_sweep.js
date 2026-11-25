#!/usr/bin/env node
/*
 * FRAGMENTA -- boss_sweep.js (Damage Types Step 4 reconstruction; see
 * sim_common.js's own header for why this file doesn't exist in git and
 * what "reconstruction" means here).
 *
 *   node boss_sweep.js --switch off|on --n 1000 --out <file.json> [--rows existing|new|all]
 *
 * Roster (the 16 Boss-class humanoid BESTIARY ids -- task #57's own
 * "16 Boss-class humanoids", matched here by filtering BESTIARY for
 * dangerClass:"boss" AND a named-commander/captain/warlord shape, which
 * lands on exactly 16 entries, cross-checked against the two specific
 * names tools/combat_unify_switch_rollout.md names directly, "Highway
 * Captain" and "Roadside Lookout" -- highway_captain is in this list):
 *   each fought ALONE and AS-SPAWNED (natural escort), across all 5
 *   classes, with the legal full party (player+Kessa+Hadrian+1 merc).
 *
 * Plus the Damage Types Step 4 Part B table's 17 new rows: Normal-tier
 * ones solo (no party), Elite/Boss/World-Boss ones with the same legal
 * full party -- matches the handoff's own "Normals go in the solo
 * cells; Elites and up go in the party cells, as each harness already
 * does." None of the 17 rows involve Dregnar/Arbitarius, so they go
 * here, not in plus3_run.js (which stays scoped to its own documented
 * purpose: Dregnar/Arbitarius x 3 gear tiers).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const { buildSandbox, pickSeed } = require("./sim_common");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const SWITCH = argVal("--switch", "off");
const N = Number(argVal("--n", 200));
const OUT = argVal("--out", null);
const ROWS = argVal("--rows", "all"); // existing | new | all
// One master seed for the whole run, printed/recorded so a rerun with
// the same --seed reproduces every cell's own sequence exactly (each
// cell still gets its OWN seed, derived from this one plus its own key
// -- see cellSeed in sim_common.js). --seed wins over TEST_SEED/random
// so a specific run can always be pinned down after the fact.
const SEED = argVal("--seed", null) != null ? Number(argVal("--seed", null)) >>> 0 : pickSeed();
console.error(`seed: ${SEED}`);

const BOSS_ROSTER = [
  "tribal_warleader", "mercenary_commander", "merchant_lord_guard_captain", "merchant_lord_shieldmaster",
  "amahri_field_commander", "sardarr_army_commander", "bandit_captain", "bandit_warlord",
  "highway_captain", "roadlord", "vigilis_unit_commander", "arbitarius_commander",
  "watch_captain", "free_company_captain", "ovum_champion", "militia_warleader",
];

// Part B's 17 rows. `tier` drives solo-vs-party per the handoff's own rule.
const NEW_ROWS = [
  { key: "fire_ashWolf", spawn: "ashWolf", tier: "normal" },
  { key: "frost_frostWolf", spawn: "frostWolf", tier: "normal" },
  { key: "water_lesserElemental_pinned", spawn: "lesserElemental", tier: "normal", forceVariant: "water" },
  { key: "lightning_youngSkrelDrak_pinned", spawn: "youngSkrelDrak", tier: "normal", forceVariant: "lightning" },
  { key: "acid_youngSkrelDrak_pinned", spawn: "youngSkrelDrak", tier: "normal", forceVariant: "acid" },
  { key: "earth_duneWolf", spawn: "duneWolf", tier: "normal" },
  { key: "poison_giantSerpent", spawn: "giantSerpent", tier: "normal" },
  { key: "force_homunculus", spawn: "homunculus", tier: "normal" },
  { key: "spatial_rauThaulnMaur", spawn: "rauThaulnMaur", tier: "normal" },
  { key: "spirit_restlessDead", spawn: "restlessDead", tier: "normal" },
  { key: "necrotic_bloatedSulDaun", spawn: "bloatedSulDaun", tier: "boss" },
  { key: "divine_elderThuelnMaur", spawn: "elderThuelnMaur", tier: "world_boss" },
  { key: "allresist_elderLorvaunNauri", spawn: "elderLorvaunNauri", tier: "elite" },
  { key: "variant_juvenileDravenDrak_white", spawn: "juvenileDravenDrak", tier: "boss", forceVariant: "white" },
  { key: "variant_ancientSkrelDrak_heatedmist", spawn: "ancientSkrelDrak", tier: "boss", forceVariant: "heated_mist" },
  { key: "variant_elemental_fire", spawn: "elemental", tier: "elite", forceVariant: "fire" },
];
// Enemy Mage, one cell per element including Frost -- Normal tier, solo,
// one row per PLAYER_ELEMENTS entry (8 original + frost). Nation choice
// doesn't matter since .element is overridden directly on the generated
// object rather than rolled, same technique the variant pin uses.
const ENEMY_MAGE_ELEMENTS = ["fire", "water", "earth", "lightning", "acid", "force", "transportation", "air", "frost"];

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; }

function levelFor(sb, id) {
  const t = sb.BESTIARY[id];
  if (t.levelRange) return Math.round((t.levelRange[0] + t.levelRange[1]) / 2);
  const SPAWN_RARITIES = sb.G("SPAWN_RARITIES");
  const r = SPAWN_RARITIES[t.spawnRarity || "common"];
  return Math.round((r.levelMin + Math.min(r.levelMax, 25)) / 2);
}

// Builds the SAME flat list of cells the old sequential main() visited,
// in the SAME order ("existing" rows, then "new" rows, then enemy-mage
// elements, each inner loop identical to the original nesting) -- the
// one thing every downstream step (chunking, worker dispatch, result
// reassembly) depends on to reproduce the original's exact `results`
// key order byte-for-byte, regardless of which worker computes which
// cell or which one finishes first. `sb` here is ONLY for the BESTIARY/
// SPAWN_RARITIES lookups levelFor needs to plan the list -- no fight is
// run against it; the real simulation sandboxes are each worker's own
// (sweep_worker.js's own buildSandbox call), never this one.
function buildTaskList(sb) {
  const tasks = [];
  if (ROWS === "existing" || ROWS === "all") {
    for (const id of BOSS_ROSTER) {
      const L = levelFor(sb, id);
      for (const cls of sb.CLASS_IDS) {
        for (const mode of ["alone", "asSpawned"]) {
          const key = `boss:${id}:${mode}:${cls}`;
          tasks.push({ key, kind: "run", cls, L, cellSpec: { spawn: id, party: true, spawnMode: mode } });
        }
      }
    }
  }
  if (ROWS === "new" || ROWS === "all") {
    for (const row of NEW_ROWS) {
      const L = levelFor(sb, row.spawn);
      const party = row.tier !== "normal";
      for (const cls of sb.CLASS_IDS) {
        const key = `new:${row.key}:${cls}`;
        tasks.push({ key, kind: "run", cls, L, tier: row.tier, cellSpec: { spawn: row.spawn, party, spawnMode: "alone", forceVariant: row.forceVariant } });
      }
    }
    for (const el of ENEMY_MAGE_ELEMENTS) {
      // Frost has no ELEMENTS entry at all until the switch adds one
      // (js/data/damagetypes.js's own ELEMENTS.frost mutation) -- a
      // Frost Enemy Mage literally cannot be built pre-switch, so this
      // cell has no "before" by construction, not by omission. Matches
      // Part C item 3's own "new cells have no before" rule. A "skip"
      // task never goes to a worker -- main() fills its synthetic
      // result in directly, same shape the sequential code always used.
      if (el === "frost" && SWITCH !== "on") {
        for (const cls of sb.CLASS_IDS) {
          tasks.push({ key: `new:enemyMage_${el}:${cls}`, kind: "skip", skipMsg: "frost requires the switch on (no ELEMENTS.frost pre-switch)" });
        }
        continue;
      }
      const L = 20;
      for (const cls of sb.CLASS_IDS) {
        const key = `new:enemyMage_${el}:${cls}`;
        tasks.push({ key, kind: "run", cls, L, tier: "normal", cellSpec: { spawn: null, party: false, spawnMode: "alone", enemyMageElement: el } });
      }
    }
  }
  return tasks;
}

function runWorker(chunk) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "sweep_worker.js"), {
      workerData: { switchOn: SWITCH === "on", seed: SEED, n: N, tasks: chunk },
    });
    worker.on("message", resolve);
    worker.on("error", reject);
  });
}

async function main() {
  const sbForPlanning = buildSandbox(SWITCH === "on");
  const tasks = buildTaskList(sbForPlanning);
  const runTasks = tasks.filter((t) => t.kind === "run");

  // One worker per core (capped to the number of cells there actually
  // are, so a tiny --n/--rows run doesn't spin up idle workers), each
  // given a contiguous slice -- which slice doesn't matter: cellSeed is
  // a pure function of (masterSeed, key), so every cell's own seed and
  // outcome is identical no matter which worker runs it or in what
  // order workers finish.
  const numWorkers = Math.max(1, Math.min(os.cpus().length, runTasks.length || 1));
  const chunks = Array.from({ length: numWorkers }, () => []);
  runTasks.forEach((t, i) => chunks[i % numWorkers].push(t));
  const nonEmptyChunks = chunks.filter((c) => c.length);

  const workerMaps = nonEmptyChunks.length ? await Promise.all(nonEmptyChunks.map(runWorker)) : [];
  const merged = Object.assign({}, ...workerMaps);

  // Reassemble `results` by walking `tasks` in its ORIGINAL order (not
  // completion order, not Object.keys(merged) order) -- this is what
  // actually guarantees the final JSON's key order matches the old
  // sequential version byte-for-byte, the same way the old code's own
  // nested for-loops determined it.
  const results = {};
  for (const t of tasks) {
    if (t.kind === "skip") {
      results[t.key] = { n: 0, winRate: null, allyDeathsPerFight: null, injuryTotals: {}, skipped: t.skipMsg };
    } else {
      results[t.key] = merged[t.key];
    }
  }

  const payload = { generatedAt: new Date().toISOString(), switch: SWITCH, n: N, rows: ROWS, seed: SEED, results };
  const text = JSON.stringify(payload, null, 2);
  if (OUT) { fs.writeFileSync(OUT, text); console.log(`wrote ${OUT} (${Object.keys(results).length} cells)`); }
  else console.log(text);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
