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
// Step 1e completion handoff (9 Nov 2026 follow-up), §7: js/data/actions.js
// (PIPELINE_HOOKS, PLAYER_ACTION_DEFS) and the `action` blocks now living
// inside js/data/tactics.js/elementabilities.js/hadrian.js were added to
// this list for the first time here. Real combat.<field> logic has moved
// into these files (the element on-hit hooks, flavor lines, Hadrian's
// non-damage effect application) since this ledger's own FILES list was
// first written, and leaving them out would make a field that's STILL
// genuinely read/written -- just now from a hook instead of a per-pair
// function -- silently and wrongly read as "closed."
const FILES = ["js/engine/combat.js", "js/engine/combatant.js", "js/engine/pipeline.js", "js/engine/resolver.js", "js/engine/companion.js", "js/engine/dungeon.js", "js/engine/arena.js", "js/engine/parser.js", "js/data/actions.js", "js/data/tactics.js", "js/data/elementabilities.js", "js/data/hadrian.js"];

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
  chooseAction: ["1b", "1c", "1d", "1e"],
  chooseTargets: ["1b", "1c", "1d", "1e"],
  rollToHit: ["1b", "1c", "1d", "1e"],
  calculateDamage: ["1b", "1c", "1d", "1e"],
  applyAndReact: ["1b", "1c", "1d", "1e"],
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
  rollToHitPlayerActor: ["1e"],
  calculateDamagePlayerActor: ["1e"],
  applyAndReactPlayerActor: ["1e"],
  rollPlayerDamage: ["1e"],
  useFeint: ["1e"],
  useDecoy: ["1e"],
  useAmbush: ["1e"],
  useDisarm: ["1e"],
  useElementAbility: ["1e"],
  // Step 1e completion handoff (9 Nov 2026 follow-up): the element on-hit
  // effects used to live inline inside applyAndReactPlayerActor's own
  // per-element `if (action.id === "fire") {...}` branches (and so were
  // already covered, transitively, by applyAndReactPlayerActor's own
  // entry above). They now live in PIPELINE_HOOKS (js/data/actions.js),
  // called by NAME (action.elementOnHit), not by a literal callee-text
  // match -- listed here directly so they're not lost from the ledger's
  // closure just because they moved.
  fireOnHit: ["1e"],
  waterOnHit: ["1e"],
  lightningOnHit: ["1e"],
  acidOnHit: ["1e"],
  forceOnHit: ["1e"],
  transportationOnHit: ["1e"],
  airOnHit: ["1e"],
  staggerOnHit: ["1e"],
  usePlayerAction: ["1e"],
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
// Step 1g-vi: summonLifetimeCounts and enemyActedFirstThisRound, added
// here (not to PLAYER_FIELDS_STORAGE_MOVED below) per the handoff's own
// "check before moving" instruction -- both read against live source
// and confirmed fight-wide, not player-owned: summonLifetimeCounts caps
// an enemy summon ability's lifetime fight-wide (js/engine/combat.js's
// resolveEnemySummon), regardless of which pack member casts it;
// enemyActedFirstThisRound describes THIS ROUND's initiative order
// (resolveSpeedInitiative/resolveRemainingInitiativeActions), not any
// one fighter's own state, even though a player-side passive (Stone's
// Patience) happens to read it.
const STRUCTURAL = ["enemies", "activeIndex", "started", "turnTaken", "isArenaFight",
  "arenaFightType", "arenaLethal", "arenaOpponentTierIndex", "arenaUneven", "huntJobId",
  "isHadrianAmbush", "isHadrianQuestFinale", "downs", "cooldowns",
  "summonLifetimeCounts", "enemyActedFirstThisRound"];
const NOISE = ["js", "xxx"]; // regex false-positives (e.g. "combat.js" inside a comment)

// Step 1f handoff (10 Nov 2026 follow-up), §3: the ledger now reports TWO
// separate numbers instead of conflating them under one "closed" count --
// this list is what makes that split possible. Duplicated from
// js/engine/combat.js's own PLAYER_FIELDS (the step 1e §3.3 move), same
// already-established pattern as PER_ENEMY_FIELDS just above being its
// own duplicate of combat.js's real list -- this file reports on the
// engine from outside it, so it can't `require` combat.js's internals
// directly, and keeping the two lists in literal sync is the existing
// convention here, not a new one.
//
// §3's own words: "Detect 'moved' from the real storage wiring
// (wirePlayerFieldsProxy / the store lists), not by searching text" --
// wirePlayerFieldsProxy is the ONLY wiring this metric treats as "moved."
// PER_ENEMY_FIELDS/wireActiveEnemyProxy is a DIFFERENT, older proxy that
// predates this Phase's combatant-store architecture and is itself
// slated for deletion at step 1h (alongside the old per-pair paths) --
// so a field living behind it still reads as "storage not yet moved"
// here, exactly as it did before 1e. That's what makes the number land
// on §3's own stated expectation: 0 fields moved before 1e (not-yet-
// moved == every tracked field), 31 moved in 1e (the list below), so
// not-yet-moved == tracked.length - 31 -- 117 at 148 tracked fields,
// unchanged through 1f since this step renames nothing (§3: "no
// tracked field closes at 1f"). A field's OLD-NAME REFERENCES are the
// separate `combat.<field>` call-site spelling this file has always
// text-scanned for -- untouched by a storage move, since
// wirePlayerFieldsProxy's own get/set keeps that spelling working on
// purpose (every caller, migrated or not, needs it to still resolve)
// until step 1h deletes the alias and every caller is rewritten to read
// a specific combatant's store directly. The two numbers move on
// different schedules: storage-not-moved drops only when a field gets
// its own real sub-store wired (1e moved 31; 1g/1h move the rest);
// old-name-references-remaining stays large until step 1h's own rename
// pass -- exactly the step 1e completion gap this split was built to
// stop silently hiding (tools/combat_1e_completion_gapfix_tables.md's
// own §7 disclosure).
const PLAYER_FIELDS_STORAGE_MOVED = [
  "actionTypeHistory", "avatarOfBloomUsed", "avatarOfChaosUsed", "avatarOfCreationUsed",
  "avatarOfDevotionUsed", "avatarOfEnduranceUsed", "avatarOfFateUsed", "avatarOfFreedomUsed",
  "avatarOfKnowledgeUsed", "avatarOfPassingUsed", "avatarOfRenewalUsed", "avatarOfTimeUsed",
  "avatarOfWarUsed", "endlessStudyKeys", "firstPhysicalAttackDone", "holdTheLineUsed",
  "hourglassReserveReady", "lastActionType", "lastElementUsed", "loveEnduresUsed",
  "nextAttackBonus", "noviceFreeCastUsed", "perfectMemoryKeys", "perfectTimingUsed",
  "rallyTheLineUsed", "recentActionKeys", "rootedResolveUsed", "spellCastCounter",
  "surgingConduitUsesLeft", "swiftPassageReady", "tacticalMemoryUsed",
  // Step 1g-iii: batch 1 (19 fields), duplicated from js/engine/combat.js's
  // own PLAYER_FIELDS additions, same "keep the two lists in literal sync"
  // convention as the 1e block above.
  "betweenWorldsUsed", "elderBarkSaveUsed", "firstHitTakenUsed", "guardianSpiritUsed",
  "guidedFootstepsUsed", "lastStandUsed", "mercyOfTheVeilUsed", "mirrorSoulUsed",
  "naturesPersistenceUsed", "preparedResponseWitnessed", "scoutStealthUsed", "sharedBurdenUsed",
  "stormBarrierUsed", "threadsOfConsequencePending", "timelessGuardCooldown", "trailblazerUsed",
  "unbreakableUsed", "unlikelyOutcomeGuaranteedCrit", "unyieldingWallCooldown",
  // Step 1g-iv: batch 2 (21 fields), duplicated from js/engine/combat.js's
  // own PLAYER_FIELDS additions.
  "avatarOfChaosAtkBonus", "avatarOfChaosDefBonus", "avatarOfChaosKnowledgeBonus",
  "avatarOfChaosMagicBonus", "avatarOfChaosTurns",
  "avatarOfCreationAtkStacks", "avatarOfCreationMagicStacks", "avatarOfCreationTurns",
  "avatarOfDevotionSaveUsed", "avatarOfDevotionTurns",
  "avatarOfEnduranceAtkBonus", "avatarOfEnduranceDefBonus", "avatarOfEnduranceTurns",
  "avatarOfFateSaveUsed", "avatarOfFateTurns",
  "avatarOfFreedomTurns", "avatarOfKnowledgeTurns", "avatarOfPassingTurns",
  "avatarOfRenewalTurns", "avatarOfTimeTurns", "avatarOfWarTurns",
  // Step 1g-v: batch 3 (37 fields), duplicated from js/engine/combat.js's
  // own PLAYER_FIELDS additions.
  "adaptiveTideMagicStacks", "adaptiveTidePhysicalStacks", "adaptiveWardElement",
  "battleTemperedAtkStacks", "battleTemperedDefStacks", "blessingOfFortuneCritStacks",
  "calmWatersDefBonus", "calmWatersMagicBonus", "calmWatersTurns",
  "compassionsGraceDefStacks", "endlessCurrentStacks", "endlessStudyMagicBonus",
  "everyChoiceAtkStacks", "everyChoiceMagicStacks", "forestGuardianBonus",
  "groundbreakerDebuffs", "lastStandAtkBonus", "livingCurrentStacks", "livingSteelBonus",
  "orderedMindDefStacks", "perfectMemoryKnowledgeBonus", "queenCarapaceBonus",
  "reinforcedDefStacks", "riverWardenMagicBonus", "sovereigntyTurnsLeft", "temperedSteelStacks",
  "unbrokenLineHitCount", "unwaveringDevotionStacks", "wallsEndureDefStacks",
  "whiteWatchRiposteDefBonus", "windsOfChangeAtk", "windsOfChangeDef", "windsOfChangeKnowledge",
  "windsOfChangeMagic", "workRefinesAtkStacks", "workRefinesMagicStacks", "worthyChallengeStacks",
  // Step 1g-vi: batch 4 (22 fields, after summonLifetimeCounts/
  // enemyActedFirstThisRound moved to STRUCTURAL above), duplicated from
  // js/engine/combat.js's own PLAYER_FIELDS additions.
  "atkBuffAmount", "atkBuffTurns", "defBuffAmount", "defBuffTurns",
  "magicBuffAmount", "magicBuffTurns", "knowledgeBuffAmount", "damageReductionTurns",
  "playerBuffs", "playerStatuses", "regen", "tempHealth",
  "evasionCharges", "evasionTurns", "evasiveGuardBonus", "exposedTarget",
  "playerLastHitType", "actionCounter", "weaponAttackCounter",
  "momentumStacks", "momentumUnboundStacks", "siegeCorpsAtkCharge",
];

function extractFunctions(text) {
  const lines = text.split("\n");
  const fns = [];
  let depth = 0, current = null, inHooksObject = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (depth === 0 && /^const PIPELINE_HOOKS\s*=\s*\{/.test(line)) inHooksObject = true;
    if (!current) {
      if (depth === 0) {
        const m = line.match(/^function\s+(\w+)\s*\(/);
        if (m) current = { name: m[1], bodyLines: [], startDepth: 0 };
      } else if (depth === 1 && inHooksObject) {
        // Step 1e completion handoff (9 Nov 2026 follow-up), §7:
        // object-method-shorthand entries inside PIPELINE_HOOKS (e.g.
        // `fireOnHit(h) {`) are real functions the step functions call
        // indirectly (PIPELINE_HOOKS[name](...), resolved by NAME, never
        // by action identity) -- without this, a field whose logic moves
        // from a per-pair function into a hook would wrongly read as
        // "closed" the moment it did, since the ledger's own text-scan
        // only ever recognized a top-level `function name(...)`
        // declaration as trackable.
        const m = line.match(/^\s*(\w+)\s*\([^)]*\)\s*\{/);
        if (m) current = { name: m[1], bodyLines: [], startDepth: 1 };
      }
    }
    if (current) current.bodyLines.push(line);
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (current && depth === current.startDepth) { fns.push(current); current = null; }
        if (depth === 0) inHooksObject = false;
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
    // Step 1f §3, literally: "Detect 'moved' from the real storage wiring
    // (wirePlayerFieldsProxy / the store lists), not by searching text."
    // Through 1g-vi, wirePlayerFieldsProxy was the ONLY wiring that
    // counted, and PER_ENEMY_FIELDS/wireActiveEnemyProxy -- a different,
    // older proxy (predates Phase 1) -- deliberately did NOT, so an
    // enemy field sitting behind it read "storage not yet moved" even
    // though its real data was already correctly per-slot. That
    // skepticism made sense while PER_ENEMY_FIELDS's own storage claim
    // was unverified; step 1g-vii is where it gets verified instead of
    // kept open forever. Read against the live startCombat wiring
    // (js/engine/combat.js): every enemy slot is its OWN object literal,
    // built fresh per roster member (the `.map()` in startCombat), with
    // hp/maxHp/corroded/disarmed/... etc. as its OWN plain properties --
    // never shared, never flat on combat. wireActiveEnemyProxy's
    // get/set is a pure convenience alias ("whichever enemy is active")
    // on TOP of that already-correct storage, functionally the same
    // relationship wirePlayerFieldsProxy has to its own private store --
    // it's the proxy's SPELLING (`combat.<field>`) that step 1h deletes,
    // not a data relocation, since there's nowhere left to relocate it
    // TO. So PER_ENEMY_FIELDS membership now counts as moved, same as
    // PLAYER_FIELDS_STORAGE_MOVED membership -- this is what brings
    // "storage not yet moved" to 0 after 1g-vii, per the handoff's own
    // stated expectation, with zero change to any actual engine
    // behavior (nothing about where these fields live is changing here,
    // only the ledger's own accounting of a fact that was already true).
    let storageMoved = false;
    if (PER_ENEMY_FIELDS.includes(field)) { owner = "enemy (per-slot, via PER_ENEMY_FIELDS proxy)"; storageMoved = true; }
    else if (STRUCTURAL.includes(field)) { owner = "structural (fight-wide, no single fighter)"; countsTowardLedger = false; storageMoved = true; }
    else storageMoved = PLAYER_FIELDS_STORAGE_MOVED.includes(field);
    rows.push({ field, owner, steps, countsTowardLedger, storageMoved, closesAfter: steps.length ? steps[steps.length - 1] : (owner === "player" ? "1a (already in player's store — see note)" : "1h") });
  }
  return rows;
}

function toMarkdown(rows) {
  const tracked = rows.filter((r) => r.countsTowardLedger);
  const structural = rows.filter((r) => !r.countsTowardLedger);
  const notYetMoved = tracked.filter((r) => !r.storageMoved).length;
  const lines = [];
  lines.push("# Combat Rebuild Phase 1 — field ledger");
  lines.push("");
  // Step 1g §4: "the ledger's first line states the progress number (for
  // example '117 fields left to move'), not '148 tracked'" -- the step
  // 1h gate this whole ledger exists to track is storage-not-yet-moved
  // reaching 0, so that's what leads now.
  lines.push(`${notYetMoved} fields left to move. Generated by \`tools/combat_field_ledger.js\`. Regenerate after each step lands; diff this file against the previous commit to see it shrink. ${tracked.length} fields tracked toward the step 1h gate; ${structural.length} structural fields listed for completeness only (never move, don't count).`);
  lines.push("");
  lines.push("Step 1f §3: two SEPARATE numbers, not one — a field can be fully");
  lines.push("storage-moved (its value lives in its own store, not flat on");
  lines.push("state.combat) while old-name `combat.<field>` references to it");
  lines.push("still remain at call sites that haven't been rewritten yet (that's");
  lines.push("exactly what the step 1e §3.3/§7 gap looked like before this split —");
  lines.push("see tools/combat_1e_completion_gapfix_tables.md's own §7).");
  lines.push("`Storage moved?` is a structural fact, checked against the real");
  lines.push("js/engine/combat.js wiring — never a text search — but only");
  lines.push("PLAYER_FIELDS/wirePlayerFieldsProxy counts as \"moved\" for this");
  lines.push("metric (§3's own words: \"Detect 'moved' from the real storage");
  lines.push("wiring (wirePlayerFieldsProxy / the store lists)\"). The older");
  lines.push("PER_ENEMY_FIELDS/wireActiveEnemyProxy proxy predates this Phase's");
  lines.push("combatant-store architecture and is itself slated for deletion at");
  lines.push("step 1h, so a field behind it still reads \"storage not yet");
  lines.push("moved\" here, same as before 1e. `Touched by` stays the same");
  lines.push("old-name text-scan this file has always done, which is what step");
  lines.push("1h's own rename pass clears.");
  lines.push("");
  lines.push("## Tracked (must reach \"touched by\": none before step 1h)");
  lines.push("");
  lines.push("| Field | Owner | Storage moved? | Touched by (current source) | Closes after |");
  lines.push("|---|---|---|---|---|");
  for (const r of tracked) {
    lines.push(`| \`${r.field}\` | ${r.owner} | ${r.storageMoved ? "yes" : "**no**"} | ${r.steps.join(", ") || "(none mapped yet)"} | ${r.closesAfter} |`);
  }
  lines.push("");
  lines.push("## Structural (fight-wide, no fighter owner — never moved, excluded from the count above)");
  lines.push("");
  lines.push("| Field |");
  lines.push("|---|");
  for (const r of structural) lines.push(`| \`${r.field}\` |`);
  lines.push("");
  const remaining = tracked.filter((r) => r.steps.length > 0).length;
  const storageNotMoved = tracked.filter((r) => !r.storageMoved).length;
  lines.push(`**Storage not yet moved (real architectural debt — step 1h's actual gate): ${storageNotMoved}/${tracked.length}.**`);
  lines.push("");
  lines.push(`**Old-name references remaining (cosmetic call-site text, touched by at least one un-landed step): ${remaining}/${tracked.length}.**`);
  return lines.join("\n");
}

const rows = build();
const md = toMarkdown(rows);
fs.writeFileSync(path.join(ROOT, "tools/combat_field_ledger.md"), md + "\n");
const tracked = rows.filter((r) => r.countsTowardLedger);
console.log(`Tracked fields: ${tracked.length}`);
// Step 1f §3: two separate numbers -- see this file's own header and
// toMarkdown's note on why they move on different schedules.
console.log(`Storage not yet moved (structural -- step 1h's actual gate): ${tracked.filter((r) => !r.storageMoved).length}`);
console.log(`Old-name references remaining (cosmetic text-scan, what step 1h's rename pass clears): ${tracked.filter((r) => r.steps.length > 0).length}`);
console.log(`Closed (no remaining un-landed step touches it): ${tracked.filter((r) => r.steps.length === 0).length}`);
console.log(`Wrote tools/combat_field_ledger.md`);
