#!/usr/bin/env node
/*
 * FRAGMENTA -- boss_sweep.js's own worker_threads entry point.
 *
 * Takes its slice of cells via workerData ({ switchOn, seed, n, tasks }),
 * builds its OWN sandbox (buildSandbox makes a brand-new vm context and
 * copies Math fresh each call -- nothing shared across sandboxes, so
 * each worker having its own is just as isolated as two separate
 * process invocations would be), runs its assigned cells through the
 * same runCell sim_common.js exports, and posts the {key: result} map
 * back. boss_sweep.js's own main() is the only thing that knows the
 * ORIGINAL cell order -- this file never needs to, since cellSeed is a
 * pure function of (masterSeed, key), not of execution order.
 */
const { parentPort, workerData } = require("worker_threads");
const { buildSandbox, runCell } = require("./sim_common");

const { switchOn, seed, n, tasks } = workerData;
const sb = buildSandbox(switchOn);
const out = {};
for (const t of tasks) {
  const r = runCell(sb, t.cls, t.L, t.cellSpec, t.key, seed, n);
  r.L = t.L;
  if (t.tier != null) r.tier = t.tier;
  out[t.key] = r;
}
parentPort.postMessage(out);
