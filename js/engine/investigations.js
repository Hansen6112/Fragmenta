/*
 * FRAGMENTA — Investigate mini-game
 * A reusable engine for a quest step where the player can talk to one or
 * more people/things before a Hunt/Track sequence, earning a success-
 * chance bonus on that hunt scaled by how well each conversation went.
 * Investigating is always optional — skipping it (or any individual
 * target) just leaves that target's contribution at 0, never a penalty.
 *
 * Per Tyler: each mission authors its own targets and conversation
 * shapes from scratch (different step counts, different branching,
 * different point values) — nothing here assumes a fixed shape like "5
 * steps" or "one fork." The only universal rules, enforced by this
 * engine rather than left to content:
 *   - a single target's own conversation can never contribute above 100
 *     points or below 0 (clamped defensively even though content is
 *     responsible for staying in range on its own),
 *   - each target has its own authored ceiling share (maxPercent) of the
 *     total bonus — not assumed to be an equal split across targets,
 *   - and each target's conversation is one-shot: once started, it runs
 *     to whatever ending the player's choices reach, and cannot be
 *     restarted for a better score.
 *
 * INVESTIGATION_QUESTS is intentionally empty — no mission has authored
 * real content yet (this is plumbing only, same boundary as the Kabal
 * routing tree and the 12 Fragmenta Majoris: build the engine now, wire
 * in real quest content once it's written). Shape of one entry:
 *
 *   mq_bruise_investigation: {
 *     huntJobType: "bruise_hunt",       // matches whatever job.type the
 *                                       // paired Hunt/Track job uses —
 *                                       // purely documentation here,
 *                                       // the actual link is job.investigateQuestId
 *                                       // (see engine/jobs.js's trackSuccessChance)
 *     isActive(state) {                 // is this quest's investigate
 *       return state.flags.someQuestFlag === true;  // step currently live at all?
 *     },
 *     targets: [
 *       {
 *         id: "witness_greta",
 *         location: "arethon", subLocation: "the_docks",
 *         maxPercent: 33.34,
 *         nodes: [
 *           { prompt: "...", options: [
 *             { label: "...", points: 20, next: 1 },
 *             { label: "...", points: 5,  next: 2 },
 *             { label: "...", points: 5,  next: 2 },
 *           ]},
 *           // node 1 = "good track" continuation, node 2 = "bad track" —
 *           // next is an explicit node index, so a mission can fork
 *           // once, fork every step, or never fork; the engine doesn't
 *           // assume anything about where nodes lead.
 *           { prompt: "...", options: [
 *             { label: "...", points: 20, next: null, resultLine: "..." }, // next: null ends the conversation
 *           ]},
 *         ],
 *       },
 *       // ...two more targets, same shape
 *     ],
 *   },
 */

const INVESTIGATION_QUESTS = {};

// ---- Progress storage ----
// state.investigationProgress: { [questId]: { [targetId]: pointsEarned } }
// Durable — survives after each target's one-shot conversation ends, since
// three separate conversations accumulate toward one combined bonus. Not
// under state.flags (structured data, not a boolean) — same reasoning as
// activeTrack/activeDungeon/kabalRoute.

function investigationPointsFor(state, questId, targetId) {
  const q = state.investigationProgress[questId];
  return q && typeof q[targetId] === "number" ? q[targetId] : 0;
}

function recordInvestigationPoints(state, questId, targetId, points) {
  if (!state.investigationProgress[questId]) state.investigationProgress[questId] = {};
  state.investigationProgress[questId][targetId] = Math.max(0, Math.min(100, points));
}

// Sums every target's contribution for a quest — min(100, earned)/100 ×
// that target's own maxPercent, added together. Called from
// trackSuccessChance (engine/jobs.js) via job.investigateQuestId. Returns
// 0 for a quest with no targets ever attempted, exactly matching "no
// investigate, no bonus."
function investigationBonusPercent(state, questId) {
  const def = INVESTIGATION_QUESTS[questId];
  if (!def) return 0;
  let total = 0;
  for (const target of def.targets) {
    const earned = investigationPointsFor(state, questId, target.id);
    total += (Math.max(0, Math.min(100, earned)) / 100) * target.maxPercent;
  }
  return total;
}

// ---- Finding an eligible target at the player's current location ----

// Scans every active investigate quest for a target matching exactly
// where the player is standing right now (plain location/subLocation
// equality — the same convention job.targetLocation/Kessa/Hadrian's
// Black Sands check already use; there's no separate location-tag
// vocabulary to plug into) that hasn't already been talked to. Returns
// { questId, target } or null. Targets are one-shot, so "already has a
// recorded point value" (including a deliberate 0 the player can't get
// otherwise, since a target with no progress entry at all also reads as
// 0 via investigationPointsFor) needs its OWN "attempted" marker,
// separate from points — see hasAttemptedInvestigation below.
function findInvestigationTarget(state) {
  for (const [questId, def] of Object.entries(INVESTIGATION_QUESTS)) {
    if (!def.isActive(state)) continue;
    for (const target of def.targets) {
      if (hasAttemptedInvestigation(state, questId, target.id)) continue;
      if (state.location !== target.location) continue;
      if ((state.subLocation || null) !== (target.subLocation || null)) continue;
      return { questId, target };
    }
  }
  return null;
}

function hasAttemptedInvestigation(state, questId, targetId) {
  const q = state.investigationProgress[questId];
  return !!(q && Object.prototype.hasOwnProperty.call(q, targetId));
}

// ---- The conversation itself ----

function currentInvestigationNode(state) {
  const inv = state.activeInvestigation;
  if (!inv) return null;
  const def = INVESTIGATION_QUESTS[inv.questId];
  const target = def && def.targets.find((t) => t.id === inv.targetId);
  return target ? target.nodes[inv.nodeIndex] : null;
}

// 'investigate' — starts a target's conversation if one is available
// here right now; otherwise a plain "nothing to investigate" line, same
// as any other context-conditional command that isn't currently valid.
function cmdInvestigate(state) {
  if (state.activeInvestigation) return ["You're already in the middle of a conversation."];
  const found = findInvestigationTarget(state);
  if (!found) return ["There's nothing here to investigate right now."];
  state.activeInvestigation = { questId: found.questId, targetId: found.target.id, nodeIndex: 0, pointsSoFar: 0 };
  const node = found.target.nodes[0];
  return [node.prompt];
}

// cmdChoose's "invN" branch (parser.js) — picks option N of the current
// node, banks its points, and either moves to `next` or ends the
// conversation (next null/undefined). One-shot: ending it records
// whatever pointsSoFar reached, permanently, via
// hasAttemptedInvestigation — this target can never be re-investigated
// for a better score, per Tyler.
function chooseInvestigationOption(state, optionIndex) {
  const inv = state.activeInvestigation;
  if (!inv) return ["There's nothing to choose right now."];
  const def = INVESTIGATION_QUESTS[inv.questId];
  const target = def && def.targets.find((t) => t.id === inv.targetId);
  if (!target) {
    // Defensive: content vanished out from under an active conversation —
    // shouldn't happen, mirrors activeTrack's own equivalent guard.
    state.activeInvestigation = null;
    return ["That conversation trails off — there's no one there anymore."];
  }
  const node = target.nodes[inv.nodeIndex];
  const option = node.options[optionIndex];
  if (!option) return ["Choose one of the listed options."];

  inv.pointsSoFar += option.points || 0;

  if (option.next == null) {
    recordInvestigationPoints(state, inv.questId, inv.targetId, inv.pointsSoFar);
    state.activeInvestigation = null;
    return [option.resultLine || "The conversation winds down — you've learned what you're going to learn here."];
  }

  inv.nodeIndex = option.next;
  const nextNode = target.nodes[inv.nodeIndex];
  return [nextNode.prompt];
}
