#!/usr/bin/env node
/*
 * FRAGMENTA -- plus3_run.js (Damage Types Step 4 reconstruction; see
 * sim_common.js's own header). Dregnar Ashvein + Arbitarius Commander,
 * 5 classes, 3 gear tiers, legal full party (player+Kessa+Hadrian+1
 * merc) -- task #56's own documented roster/party.
 *
 * Dregnar is fought via startCombat(state, "dregnar_ashvein", 30) per
 * his own BESTIARY entry's testing-note comment (no levelRange of his
 * own -- special:true, scripted). Arbitarius Commander's levelRange is
 * [28,30], center 29.
 *
 * "3 gear tiers": undocumented beyond the name in every surviving doc
 * (see sim_common.js's gearForTierOffset comment) -- reconstructed as
 * one level-band below / at-level / one level-band above the target's
 * own gear tier. Flagged as a reconstruction judgment call, not an
 * assertion of the original's own tier definitions.
 *
 *   node plus3_run.js --switch off|on --n 1000 --out <file.json>
 */
const fs = require("fs");
const { buildSandbox } = require("./sim_common");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const SWITCH = argVal("--switch", "off");
const N = Number(argVal("--n", 200));
const OUT = argVal("--out", null);

const TARGETS = [
  { key: "dregnar_ashvein", spawn: "dregnar_ashvein", L: 30 },
  { key: "arbitarius_commander", spawn: "arbitarius_commander", L: 29 },
];
const GEAR_TIERS = [
  { key: "undergeared", offset: -1 },
  { key: "normal", offset: 0 },
  { key: "overgeared", offset: 1 },
];

function runCell(sb, cls, L, spawn, gearFn) {
  let wins = 0, allyDeaths = 0, n = 0;
  const injuryTotals = {};
  for (let i = 0; i < N; i++) {
    const r = sb.runFight({ cls, L, spawn, party: true, spawnMode: "alone", gearFn });
    if (!r) continue;
    n++;
    wins += r.won ? 1 : 0;
    allyDeaths += r.allyDeaths;
    for (const [g, c] of Object.entries(r.injuryGroups)) injuryTotals[g] = (injuryTotals[g] || 0) + c;
  }
  return { n, winRate: n ? wins / n : null, allyDeathsPerFight: n ? allyDeaths / n : null, injuryTotals };
}

function main() {
  const sb = buildSandbox(SWITCH === "on");
  const results = {};
  for (const t of TARGETS) {
    for (const tier of GEAR_TIERS) {
      const gearFn = (L, primary) => sb.gearForTierOffset(L, primary, tier.offset);
      for (const cls of sb.CLASS_IDS) {
        const key = `${t.key}:${tier.key}:${cls}`;
        results[key] = runCell(sb, cls, t.L, t.spawn, gearFn);
        results[key].L = t.L;
      }
    }
  }
  const payload = { generatedAt: new Date().toISOString(), switch: SWITCH, n: N, results };
  const text = JSON.stringify(payload, null, 2);
  if (OUT) { fs.writeFileSync(OUT, text); console.log(`wrote ${OUT} (${Object.keys(results).length} cells)`); }
  else console.log(text);
}

main();
