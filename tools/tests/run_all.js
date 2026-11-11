#!/usr/bin/env node
/*
 * FRAGMENTA — regression suite runner
 *
 *   node tools/tests/run_all.js
 *
 * Starts a local static server over the repo, runs every ledger in this
 * directory against it (each is a standalone Playwright script driving
 * the real engine, same convention the whole Combat Rebuild engagement
 * has used), and prints one aggregate "suite: X/X" line. Every ledger
 * ends with exactly one `RESULT: <passed>/<total>` line on stdout (added
 * when these were committed here) — that's the only thing this runner
 * depends on each file to print; everything else in a ledger's own
 * output is free-form and just passed through for a human to read on
 * failure.
 *
 * Requires `playwright` resolvable from this directory and a Chromium
 * binary at /opt/pw-browsers/chromium (this engagement's sandboxed dev
 * environment provides both; there's no package.json in this repo, so
 * an ordinary checkout needs its own Playwright install + that path, or
 * PLAYWRIGHT_CHROMIUM_PATH-style adjustment to each ledger's launch call).
 *
 * This does NOT include tools/audit.js or tools/combatsim.js — neither
 * is a pass/fail ledger (audit reports a warning/error count against no
 * fixed expectation; combatsim is an informational balance report with
 * no asserted "correct" values) — but audit.js is cheap and genuinely a
 * regression signal (0 errors expected), so it's run as a clearly
 * separate, second line, not folded into the suite count. Run
 * combatsim.js by hand when a change could plausibly shift balance.
 */
const { spawnSync, spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const PORT = 8949;

const LEDGERS = [
  "injury_ledger.js",
  "downed_ledger.js",
  "ally_protection_ledger.js",
  "dregnar_stage_a_ledger.js",
  "dregnar_stage_b_ledger.js",
  "party_cap_ledger.js",
  "consumable_noop_ledger.js",
  "injury_items_ledger.js",
  "phase1_step1a_combatant_ledger.js",
  "phase1_step1b_pipeline_parity.js",
  "phase1_step1c_ally_pipeline_parity.js",
  "d1_stun_fix_ledger.js",
  "combat_unify_switches_ledger.js",
  "phase1_step1d_ally_attack_pipeline_parity.js",
  "phase1_step1e_i_player_attack_pipeline_parity.js",
  "phase1_step1e_ii_tactics_pipeline_parity.js",
  "phase1_step1e_iii_elements_pipeline_parity.js",
  "phase1_step1f_iv_ticks_pipeline_parity.js",
  "apothecary_action_tracking_ledger.js",
  "test_strike_proof_ledger.js",
  "test_ally_proof_ledger.js",
  "test_reaction_proof_ledger.js",
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
  let serverExited = false;
  server.on("exit", () => { serverExited = true; });

  try {
    await waitForServer(`http://localhost:${PORT}/index.html`, 10000);
  } catch (e) {
    console.error(`Could not start the local server: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  let anyParseFailure = false;
  for (const file of LEDGERS) {
    const filePath = path.join(__dirname, file);
    const t0 = Date.now();
    const result = spawnSync("node", [filePath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const elapsed = Date.now() - t0;
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const matches = [...stdout.matchAll(/RESULT:\s*(\d+)\/(\d+)/g)];
    if (!matches.length) {
      anyParseFailure = true;
      rows.push({ file, ok: false, passed: 0, total: 0, note: "no RESULT: line found", elapsed });
      console.error(`\n--- ${file}: FAILED TO PARSE ---`);
      console.error(`exit code: ${result.status}`);
      console.error((stdout + "\n" + stderr).split("\n").slice(-40).join("\n"));
      continue;
    }
    const last = matches[matches.length - 1];
    const passed = Number(last[1]);
    const total = Number(last[2]);
    const exitOk = result.status === 0;
    const ok = passed === total && exitOk;
    rows.push({ file, ok, passed, total, elapsed, exitCode: result.status });
    if (!ok) {
      console.error(`\n--- ${file}: ${passed}/${total} (exit ${result.status}) ---`);
      console.error((stdout + "\n" + stderr).split("\n").filter((l) => /FAIL/i.test(l)).join("\n"));
    }
  }

  server.kill();

  console.log("");
  for (const r of rows) {
    const tag = r.ok ? "ok  " : "FAIL";
    console.log(`${tag}  ${r.file.padEnd(36)} ${r.passed}/${r.total}  (${r.elapsed}ms)`);
  }

  const totalPassed = rows.reduce((a, r) => a + r.passed, 0);
  const totalAll = rows.reduce((a, r) => a + r.total, 0);
  console.log(`\nsuite: ${totalPassed}/${totalAll}`);

  const audit = spawnSync("node", [path.join(ROOT, "tools", "audit.js")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const auditLine = (audit.stdout || "").trim().split("\n").filter((l) => /error\(s\)/.test(l)).pop() || "(audit.js produced no summary line)";
  console.log(`audit: ${auditLine}`);

  const failed = anyParseFailure || totalPassed !== totalAll || !rows.every((r) => r.ok);
  process.exitCode = failed ? 1 : 0;
}

main();
