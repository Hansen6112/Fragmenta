/*
 * FRAGMENTA — Job & Contract Runtime
 * State-mutating logic for accepting, tracking, and auto-resolving jobs.
 * Display/command handling (board, contracts, accept, sign) lives in
 * parser.js; this file is the plumbing those commands call into, plus the
 * two completion hooks wired from combat.js (kills) and parser.js (arrivals).
 */

const MAX_ACTIVE_JOBS = 4;
const BOARD_REFRESH_DAYS = 4;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getOrRefreshBoard(state, locId) {
  let board = state.boards[locId];
  if (!board || state.day - board.lastRefresh >= BOARD_REFRESH_DAYS) {
    board = { jobs: generateBoardJobs(locId), lastRefresh: state.day };
    state.boards[locId] = board;
  }
  return board;
}

function acceptBoardJob(state, locId, index) {
  const board = getOrRefreshBoard(state, locId);
  const job = board.jobs[index];
  if (!job) return { ok: false, message: "No job posted at that number." };
  if (job.taken) return { ok: false, message: "That job's already been taken." };
  if (state.activeJobs.length >= MAX_ACTIVE_JOBS) {
    return { ok: false, message: `You're already juggling ${MAX_ACTIVE_JOBS} jobs — finish one before taking another.` };
  }
  job.taken = true; // marked, not removed — keeps board numbering stable across multiple accepts
  state.activeJobs.push({ ...job });
  return { ok: true, job };
}

function signGuildContract(state, guildId, index) {
  const list = GUILD_CONTRACTS[guildId] || [];
  const template = list[index];
  if (!template) return { ok: false, message: "No contract posted at that number." };
  if (state.flags["completed_" + template.id]) return { ok: false, message: "You've already completed that contract." };
  if (state.activeJobs.some((j) => j.id === template.id)) return { ok: false, message: "You've already signed that contract." };
  if (state.activeJobs.length >= MAX_ACTIVE_JOBS) {
    return { ok: false, message: `You're already juggling ${MAX_ACTIVE_JOBS} jobs — finish one before taking another.` };
  }
  const accepted = { ...template, status: "active" };
  state.activeJobs.push(accepted);
  return { ok: true, job: accepted };
}

// Grants reward, removes the job, and — for the rare fragment-bearing
// guild contracts — has a chance to hand over an actual Fragmenta Motus
// shard instead of mundane loot, tying job-board work back to the
// overarching plot without requiring a full quest chain yet.
function resolveJob(state, job) {
  const lines = [];
  const kindLabel = job.kind === "guild" ? "Contract" : "Job";
  lines.push(`${kindLabel} complete: ${job.title}!`);

  // Several set bonuses boost job/contract gold — jobGoldMultiplier (data/
  // sets.js) is the single place that combines them (some apply to
  // everything, some only to guild contracts specifically).
  const goldReward = Math.round(job.rewardGold * jobGoldMultiplier(state, job));
  state.gold += goldReward;
  const repParts = [];
  for (const [fid, amt] of Object.entries(job.rewardRep || {})) {
    state.reputation[fid] = clamp((state.reputation[fid] || 0) + amt, -100, 100);
    repParts.push(`${FACTIONS[fid] ? FACTIONS[fid].name : fid} +${amt}`);
  }
  lines.push(`+${goldReward} gold${repParts.length ? " — " + repParts.join(", ") : ""}.`);
  lines.push(...state.gainXp(xpFromJob(job)));

  if (job.fragmentChance && Math.random() < job.fragmentChance && state.knownFragments < 3) {
    state.knownFragments += 1;
    state.flags.hasFragmentMotus = true;
    lines.push("Wrapped in with the payment is something else — a dull grey shard, warm to the touch. A Fragmenta Motus. You didn't expect that.");
  } else if (job.loot) {
    state.inventory.push(job.loot);
    lines.push(`You also receive ${job.loot}.`);
  }

  state.activeJobs = state.activeJobs.filter((j) => j.id !== job.id);
  if (job.kind === "guild") state.flags["completed_" + job.id] = true;
  return lines;
}

// Called from combat.js the moment a creature falls.
function checkJobProgressOnKill(state, creature) {
  const candidates = state.activeJobs.filter((j) => j.type === "bounty" && meetsBountyRequirement(creature, j.difficulty));
  if (!candidates.length) return [];
  candidates.sort((a, b) => b.difficulty - a.difficulty);
  return resolveJob(state, candidates[0]);
}

// Called from parser.js the moment travel ends at a new location.
function checkJobProgressOnArrive(state, locId) {
  const matches = state.activeJobs.filter((j) => j.type === "courier" && j.targetLocation === locId);
  const lines = [];
  for (const job of matches) lines.push(...resolveJob(state, job));
  return lines;
}
