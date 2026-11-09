/*
 * Combat Rebuild Phase 1: the field ledger (coder-review note 1, 6 Nov).
 *
 * Every `combat.<field>` reference in the engine is one of:
 *   - player-owned fight state, sitting flat on state.combat today because
 *     step 1a pointed the player combatant's store directly AT state.combat
 *     rather than giving the player its own nested sub-store (a known, called-
 *     out gap — see js/engine/combatant.js's header and the step 1a report).
 *   - enemy-owned, per-slot fight state, physically already living on each
 *     state.combat.enemies[i] slot — PER_ENEMY_FIELDS (combat.js) is a
 *     get/set proxy that makes `state.combat.<field>` transparently mean
 *     "whichever enemy is active," for old code that hasn't been migrated
 *     to read a specific enemy combatant's own store yet.
 *   - structural, fight-wide state with no single fighter owner (the enemy
 *     roster itself, whose target is active, arena/dungeon fight-type
 *     flags, ...). These are NOT moved into any combatant's store, ever —
 *     they stay on a fight-wide object. They're listed here for completeness
 *     only and don't count toward "the ledger is empty."
 *
 * "The ledger is empty" (the step 1h gate) means: every player-owned field
 * has been renamed off flat state.combat.<field> into the player
 * combatant's own sub-store, AND every PER_ENEMY_FIELDS entry has had its
 * last remaining call site migrated to read a specific enemy combatant's
 * store directly, so the PER_ENEMY_FIELDS proxy has no remaining caller and
 * can be deleted. Structural fields are explicitly exempt from this count.
 *
 * This file only REPORTS — it doesn't move anything. Rerun it after each
 * step lands (`node tools/combat_field_ledger.js`) and diff
 * tools/combat_field_ledger.md against the previous commit: each step
 * should remove that step's own tag from every field it actually finished
 * migrating. A field keeps a step's tag until that step's own work on that
 * field's call sites is done — "touched by" is the current, live picture
 * from the source, not a plan frozen at write time.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const FILES = ["js/engine/combat.js", "js/engine/combatant.js", "js/engine/pipeline.js", "js/engine/companion.js", "js/engine/dungeon.js", "js/engine/arena.js", "js/engine/parser.js"];

// Spec section 4's migration-order table, "Today's code" column — plus,
// from step 1b onward, the SHARED pipeline functions (js/engine/
// pipeline.js) that replace those per-pair functions as the real, live
// entry points. A value is an array because a shared function can belong
// to more than one step once a later step adds its own actor/target
// branch into the same function (e.g. rollToHit gains a step 1c branch
// when ally-targeting lands) — add that step's tag to the array AT THAT
// TIME, don't pre-guess it now.
//
// resolveEnemyRetaliation is deliberately ABSENT here as of step 1b: it's
// superseded, unchanged, kept only as the parity harness's oracle (see
// its own header comment in combat.js) — no longer a live step 1b entry
// point, so fields it still textually references don't count as "open"
// through it alone. The same removal happens for every other superseded
// per-pair function as its own step lands.
const FUNCTION_STEP = {
  chooseAction: ["1b", "1c", "1d"],
  chooseTargets: ["1b", "1c", "1d"],
  rollToHit: ["1b", "1c", "1d"],
  calculateDamage: ["1b", "1c", "1d"],
  applyAndReact: ["1b", "1c", "1d"],
  resolveEnemyAttackOnPlayer: ["1b"],
  resolveEnemyAttackOnAlly: ["1c"],
  resolveCompanionAction: ["1d"],
  basicCompanionAttack: ["1d"],
  useHadrianActive: ["1d"],
  killEnemyAsAlly: ["1d"],
  allyAggressiveAction: ["1d"],
  rollToHitAllyActor: ["1d"],
  calculateDamageAllyActor: ["1d"],
  applyAndReactAllyActor: ["1d"],
  resolveHadrianActiveDamage: ["1d"],
  playerAttack: ["1e"],
  rollPlayerDamage: ["1e"],
  useFeint: ["1e"],
  useDecoy: ["1e"],
  useAmbush: ["1e"],
  useDisarm: ["1e"],
  useElementAbility: ["1e"],
  maybeRiposte: ["1f"],
  checkReflectDeath: ["1f"],
  maybeCompanionRetaliate: ["1f"],
  maybeHadrianAllyProtection: ["1f"],
  beginTurn: ["1f"],
  tickPlayerStatuses: ["1f"],
  tickAllyStatuses: ["1f"],
  tickEnemyPassives: ["1f"],
  tickPlayerBuffs: ["1f"],
  tickAllyBuffs: ["1f"],
  resolveEnemyActiveAbility: ["1f"],
  resolveEnemySummon: ["1f"],
  dregnarResolveDamagingAttempt: ["1g"],
  resolveDregnarAction: ["1g"],
};
const STEP_ORDER = ["1b", "1c", "1d", "1e", "1f", "1g"];

const PER_ENEMY_FIELDS = [
  "creatureId", "creatureObj", "dynamicCreature", "name", "hp", "maxHp",
  "corroded", "disarmed", "enemyAtkPenalty", "enemyDefPenalty", "enemyStunCharges",
  "hamstringApplied", "burn", "bleed", "reinforcedAttackCount", "lastDamageType",
  "actedEarlyThisRound", "abilityCooldowns", "selfBuffs", "passiveOnceFlags",
  "firstActiveUsed", "healthLostStacks", "hitsTakenFromPlayer", "lastAttackTargetKind",
  "consecutiveTargetStacks", "summonSourceKey",
];
const STRUCTURAL = ["enemies", "activeIndex", "started", "turnTaken", "isArenaFight",
  "arenaFightType", "arenaLethal", "arenaOpponentTierIndex", "arenaUneven", "huntJobId",
  "isHadrianAmbush", "isHadrianQuestFinale", "downs", "cooldowns"];
const NOISE = ["js", "xxx"]; // regex false-positives (e.g. "combat.js" inside a comment)

function extractFunctions(text) {
  const lines = text.split("\n");
  const fns = [];
  let depth = 0, current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (depth === 0) {
      const m = line.match(/^function\s+(\w+)\s*\(/);
      if (m) current = { name: m[1], bodyLines: [] };
    }
    if (current) current.bodyLines.push(line);
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0 && current) { fns.push(current); current = null; }
      }
    }
  }
  return fns;
}

function build() {
  const allFns = {}; // name -> { body, fields: Set, callees: Set }
  for (const relPath of FILES) {
    const text = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    for (const fn of extractFunctions(text)) {
      if (!allFns[fn.name]) allFns[fn.name] = { body: "", fields: new Set(), callees: new Set() };
      allFns[fn.name].body += "\n" + fn.bodyLines.join("\n");
    }
  }
  const fnNames = Object.keys(allFns);
  for (const name of fnNames) {
    const entry = allFns[name];
    let m;
    const fieldRe = /\bcombat\.([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((m = fieldRe.exec(entry.body))) entry.fields.add(m[1]);
    for (const other of fnNames) {
      if (other === name) continue;
      if (new RegExp(`\\b${other}\\s*\\(`).test(entry.body)) entry.callees.add(other);
    }
  }

  const stepEntryFns = {};
  for (const [fn, steps] of Object.entries(FUNCTION_STEP)) {
    if (!allFns[fn]) continue;
    for (const step of steps) (stepEntryFns[step] = stepEntryFns[step] || []).push(fn);
  }
  const stepClosure = {};
  for (const [step, entries] of Object.entries(stepEntryFns)) {
    const seen = new Set();
    const stack = [...entries];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f) || !allFns[f]) continue;
      seen.add(f);
      for (const callee of allFns[f].callees) stack.push(callee);
    }
    stepClosure[step] = seen;
  }

  const allFields = new Set();
  for (const entry of Object.values(allFns)) for (const f of entry.fields) allFields.add(f);

  const rows = [];
  for (const field of Array.from(allFields).sort()) {
    if (NOISE.includes(field)) continue;
    const owningFns = fnNames.filter((n) => allFns[n].fields.has(field));
    const steps = STEP_ORDER.filter((s) => owningFns.some((fn) => stepClosure[s] && stepClosure[s].has(fn)));
    let owner = "player";
    let countsTowardLedger = true;
    if (PER_ENEMY_FIELDS.includes(field)) owner = "enemy (per-slot, via PER_ENEMY_FIELDS proxy)";
    else if (STRUCTURAL.includes(field)) { owner = "structural (fight-wide, no single fighter)"; countsTowardLedger = false; }
    rows.push({ field, owner, steps, countsTowardLedger, closesAfter: steps.length ? steps[steps.length - 1] : (owner === "player" ? "1a (already in player's store — see note)" : "1h") });
  }
  return rows;
}

function toMarkdown(rows) {
  const tracked = rows.filter((r) => r.countsTowardLedger);
  const structural = rows.filter((r) => !r.countsTowardLedger);
  const lines = [];
  lines.push("# Combat Rebuild Phase 1 — field ledger");
  lines.push("");
  lines.push(`Generated by \`tools/combat_field_ledger.js\`. Regenerate after each step lands; diff this file against the previous commit to see it shrink. ${tracked.length} fields tracked toward the step 1h gate; ${structural.length} structural fields listed for completeness only (never move, don't count).`);
  lines.push("");
  lines.push("## Tracked (must reach \"touched by\": none before step 1h)");
  lines.push("");
  lines.push("| Field | Owner | Touched by (current source) | Closes after |");
  lines.push("|---|---|---|---|");
  for (const r of tracked) {
    lines.push(`| \`${r.field}\` | ${r.owner} | ${r.steps.join(", ") || "(none mapped yet)"} | ${r.closesAfter} |`);
  }
  lines.push("");
  lines.push("## Structural (fight-wide, no fighter owner — never moved, excluded from the count above)");
  lines.push("");
  lines.push("| Field |");
  lines.push("|---|");
  for (const r of structural) lines.push(`| \`${r.field}\` |`);
  lines.push("");
  const remaining = tracked.filter((r) => r.steps.length > 0).length;
  lines.push(`**Remaining open (touched by at least one un-landed step): ${remaining}/${tracked.length}.**`);
  return lines.join("\n");
}

const rows = build();
const md = toMarkdown(rows);
fs.writeFileSync(path.join(ROOT, "tools/combat_field_ledger.md"), md + "\n");
const tracked = rows.filter((r) => r.countsTowardLedger);
console.log(`Tracked fields: ${tracked.length}`);
console.log(`Remaining open: ${tracked.filter((r) => r.steps.length > 0).length}`);
console.log(`Closed (no remaining un-landed step touches it): ${tracked.filter((r) => r.steps.length === 0).length}`);
console.log(`Wrote tools/combat_field_ledger.md`);
