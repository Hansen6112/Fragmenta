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
const path = require("path");
const { buildSandbox } = require("./sim_common");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const SWITCH = argVal("--switch", "off");
const N = Number(argVal("--n", 200));
const OUT = argVal("--out", null);
const ROWS = argVal("--rows", "all"); // existing | new | all

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

function runCell(sb, cls, L, cellSpec) {
  let wins = 0, allyDeaths = 0, n = 0;
  const injuryTotals = {};
  for (let i = 0; i < N; i++) {
    let spawnArg = cellSpec.spawn;
    if (cellSpec.enemyMageElement) {
      spawnArg = sb.spawnEnemyMage("norrvael", L, cellSpec.enemyMageElement);
    }
    const r = sb.runFight({
      cls, L, spawn: spawnArg, party: cellSpec.party, spawnMode: cellSpec.spawnMode || "asSpawned",
      forceVariant: cellSpec.forceVariant || null,
    });
    if (!r) continue;
    n++;
    wins += r.won ? 1 : 0;
    allyDeaths += r.allyDeaths;
    for (const [g, c] of Object.entries(r.injuryGroups)) injuryTotals[g] = (injuryTotals[g] || 0) + c;
  }
  return { n, winRate: n ? wins / n : null, allyDeathsPerFight: n ? allyDeaths / n : null, injuryTotals };
}

function levelFor(sb, id) {
  const t = sb.BESTIARY[id];
  if (t.levelRange) return Math.round((t.levelRange[0] + t.levelRange[1]) / 2);
  const SPAWN_RARITIES = sb.G("SPAWN_RARITIES");
  const r = SPAWN_RARITIES[t.spawnRarity || "common"];
  return Math.round((r.levelMin + Math.min(r.levelMax, 25)) / 2);
}

function main() {
  const sb = buildSandbox(SWITCH === "on");
  const results = {};

  if (ROWS === "existing" || ROWS === "all") {
    for (const id of BOSS_ROSTER) {
      const L = levelFor(sb, id);
      for (const cls of sb.CLASS_IDS) {
        for (const mode of ["alone", "asSpawned"]) {
          const key = `boss:${id}:${mode}:${cls}`;
          results[key] = runCell(sb, cls, L, { spawn: id, party: true, spawnMode: mode });
          results[key].L = L;
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
        results[key] = runCell(sb, cls, L, { spawn: row.spawn, party, spawnMode: "alone", forceVariant: row.forceVariant });
        results[key].L = L;
        results[key].tier = row.tier;
      }
    }
    for (const el of ENEMY_MAGE_ELEMENTS) {
      // Frost has no ELEMENTS entry at all until the switch adds one
      // (js/data/damagetypes.js's own ELEMENTS.frost mutation) -- a
      // Frost Enemy Mage literally cannot be built pre-switch, so this
      // cell has no "before" by construction, not by omission. Matches
      // Part C item 3's own "new cells have no before" rule.
      if (el === "frost" && SWITCH !== "on") {
        for (const cls of sb.CLASS_IDS) results[`new:enemyMage_${el}:${cls}`] = { n: 0, winRate: null, allyDeathsPerFight: null, injuryTotals: {}, skipped: "frost requires the switch on (no ELEMENTS.frost pre-switch)" };
        continue;
      }
      const L = 20;
      for (const cls of sb.CLASS_IDS) {
        const key = `new:enemyMage_${el}:${cls}`;
        results[key] = runCell(sb, cls, L, { spawn: null, party: false, spawnMode: "alone", enemyMageElement: el });
        results[key].L = L;
        results[key].tier = "normal";
      }
    }
  }

  const payload = { generatedAt: new Date().toISOString(), switch: SWITCH, n: N, rows: ROWS, results };
  const text = JSON.stringify(payload, null, 2);
  if (OUT) { fs.writeFileSync(OUT, text); console.log(`wrote ${OUT} (${Object.keys(results).length} cells)`); }
  else console.log(text);
}

main();
