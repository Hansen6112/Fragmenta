#!/usr/bin/env node
/*
 * FRAGMENTA — freeze Legacy-oracle fixtures (Combat Rebuild step 1h-i)
 *
 *   node tools/tests/freeze_legacy_oracles.js
 *
 * Step 1h deletes the 15 `*Legacy` / dead functions kept around only as
 * Layer-1 forced-roll parity oracles. Six parity ledgers still call one of
 * those oracles directly inside their `checkParity` comparison. Before any
 * of the 15 functions are deleted, this script runs each of those six
 * ledgers once with FREEZE_LEGACY_ORACLES=1 set, which makes the ledger
 * call its own oracle function (using the exact same runOne()/scenario
 * code the live comparison already uses — no reimplementation, no
 * transcription risk) and write what it got into a JSON fixture under
 * tools/tests/fixtures/. Once frozen, the same ledgers rewire their
 * comparison to read the fixture instead of calling the oracle, so the
 * oracle function can be deleted with no parity-signal loss.
 *
 * THIS SCRIPT ONLY WORKS WHILE THE 15 LEGACY FUNCTIONS STILL EXIST. Once
 * step 1h-ii deletes them, re-running this script will fail (the oracle
 * functions it calls will be undefined) — that's expected and fine; the
 * fixtures it already wrote are the permanent record from this point on.
 * Do not re-run it after 1h-ii.
 *
 * This is NOT part of run_all.js's regular suite (it mutates fixtures on
 * disk rather than asserting pass/fail) — run it by hand, once, as step
 * 1h-i's own setup action, before the 15 functions are deleted.
 */
const { spawnSync, spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const PORT = 8949;

// The six ledgers that call a *Legacy oracle directly inside checkParity
// and therefore need a frozen fixture before 1h-ii deletes that oracle.
// (ally_protection_ledger.js's AP-04 also called a doomed function --
// resolveEnemyRetaliation -- but only as a convenience stand-in for "the
// player gets hit", not as a Legacy-vs-new comparison; it was redirected
// to resolveEnemyAttackOnPlayer, its same-signature live replacement,
// instead of frozen, so it is not in this list.)
const LEDGERS = [
  "phase1_step1b_pipeline_parity.js",
  "phase1_step1c_ally_pipeline_parity.js",
  "phase1_step1d_ally_attack_pipeline_parity.js",
  "phase1_step1e_i_player_attack_pipeline_parity.js",
  "phase1_step1e_ii_tactics_pipeline_parity.js",
  "phase1_step1e_iii_elements_pipeline_parity.js",
];

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on("error", () => {
          if (Date.now() > deadline) return reject(new Error(`server never came up at ${url}`));
          setTimeout(attempt, 100);
        });
    }
    attempt();
  });
}

async function main() {
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--directory", ROOT], { stdio: "ignore" });

  try {
    await waitForServer(`http://localhost:${PORT}/index.html`, 10000);
  } catch (e) {
    console.error(`Could not start the local server: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  for (const file of LEDGERS) {
    const filePath = path.join(__dirname, file);
    const result = spawnSync("node", [filePath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, FREEZE_LEGACY_ORACLES: "1" },
    });
    const ok = result.status === 0;
    const froze = (result.stdout || "").trim().split("\n").filter((l) => /^Froze /.test(l)).pop() || "(no 'Froze N scenario(s)' line found)";
    rows.push({ file, ok, froze });
    console.log(`${ok ? "ok  " : "FAIL"}  ${file.padEnd(48)} ${froze}`);
    if (!ok) {
      console.error((result.stdout || "") + "\n" + (result.stderr || ""));
    }
  }

  server.kill();

  const failed = !rows.every((r) => r.ok);
  if (failed) {
    console.error("\nOne or more ledgers failed to freeze. Nothing should be deleted until all six succeed.");
  } else {
    console.log(`\nAll ${rows.length} ledgers froze their fixtures successfully.`);
  }
  process.exitCode = failed ? 1 : 0;
}

main();
