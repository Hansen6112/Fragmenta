/*
 * FRAGMENTA — Main Quest Routing Tree
 * Implements the routing logic from "Fragmenta Main Quest Routing Tree v2"
 * and its "Routing Tree Technical Schema" companion. Two independent
 * evaluation models, per those documents:
 *
 *  1. One-Time Gate (evaluateMainQuestGate): the full tree is meant to be
 *     read ONCE, at the moment the final act begins — a trigger owned by
 *     a world-clock system that doesn't exist in this codebase yet
 *     (external dependency, not built here). Nothing calls this function
 *     automatically; wire it to that system's trigger whenever it's
 *     built. Until then it's reachable for testing via the 'kabalroute'
 *     debug command (see parser.js). A snapshot read of state.kabalRoute
 *     at whatever instant it's called — not a running score.
 *
 *  2. Continuous Global Override (checkMajorisOverride): independent of
 *     Act state or the one-time gate, checked after every player
 *     equipment change (cmdEquip/cmdUnequip — "on inventory-close, not
 *     mid-drag/mid-edit" translated to this text game's real equivalent:
 *     once a single equip/unequip command has fully resolved). The
 *     instant 6 Fragmenta Majoris are equipped at once, it fires and
 *     permanently locks in TERMINAL_THIRTEENTH, superseding anything else
 *     — including a one-time gate result already reached.
 *
 * Naming: the routing documents this was built from spell the ruling
 * organization "Cabal" throughout; existing lore/factions/items spell it
 * "Kabal" (Primus, the Five Fingers, the Tower). Per Tyler, "Kabal" is
 * canonical — used here and is what this file's variable/terminal names
 * reflect, even where the source documents said "Cabal."
 *
 * Content dependency warning (carried from the schema doc, still true):
 * zero quests are flagged as Kabal-story content as of this writing, and
 * none of the 12 named Fragmenta Majoris exist as authored items. That
 * makes engagementCount/supportedKabal/activelyOpposedCabal/
 * huntedCabalMembers and majorisEquippedCount all genuinely inert right
 * now — not a bug, the expected state until that content is written.
 * This file is ONLY the routing/plumbing layer: no quest content, no
 * Majoris items, and no confrontation implementations (the 120-Veranthari
 * Gauntlet fight, Malformed Ritual boss, Civil War battle, ...) are built
 * here — those are separate, not-yet-scoped content work.
 */

const KABAL_STORY_QUEST_THRESHOLD = 3;

// Every terminal this tree can resolve to, plus GAUNTLET_PENDING — not a
// real terminal, just what evaluateMainQuestGate returns when the player
// is routed to the (not yet built) Gauntlet fight itself; that fight's
// own win/lose result is what actually resolves to GAUNTLET_WIN/LOSE (see
// resolveGauntletOutcome), since no persisted flag for it exists anywhere
// in the schema — it's a live combat outcome, not a quest flag.
const KABAL_ROUTE_TERMINALS = {
  NEGLECT_CONSUMED: "NEGLECT_CONSUMED",
  GAUNTLET_PENDING: "GAUNTLET_PENDING",
  GAUNTLET_WIN: "GAUNTLET_WIN",
  GAUNTLET_LOSE: "GAUNTLET_LOSE",
  CONSPIRATOR_SUCCESS: "CONSPIRATOR_SUCCESS",
  CIVIL_WAR_WIN: "CIVIL_WAR_WIN",
  CIVIL_WAR_LOSE: "CIVIL_WAR_LOSE",
  RALLY_FAILED_NO_SHARDS: "RALLY_FAILED_NO_SHARDS",
  RALLY_FAILED_SHARDS_TURNED_IN: "RALLY_FAILED_SHARDS_TURNED_IN",
  RALLY_FAILED_SHARDS_KEPT: "RALLY_FAILED_SHARDS_KEPT",
  OPPOSED_STRENGTHENED: "OPPOSED_STRENGTHENED",
  PASSIVE_NO_SHARDS: "PASSIVE_NO_SHARDS",
  PASSIVE_SHARDS_HANDED_OVER: "PASSIVE_SHARDS_HANDED_OVER",
  PASSIVE_SHARDS_KEPT_FOUGHT_BACK: "PASSIVE_SHARDS_KEPT_FOUGHT_BACK",
  PASSIVE_SHARDS_KEPT_SUBMITTED: "PASSIVE_SHARDS_KEPT_SUBMITTED",
  TERMINAL_THIRTEENTH: "TERMINAL_THIRTEENTH",
};

// One reference line of prose per terminal, for the debug command and for
// whatever future ending-dispatch code hooks each terminal up to its real
// confrontation/epilogue content — none of which exists yet, so this is
// documentation, not the actual presented ending text.
const KABAL_ROUTE_TERMINAL_INFO = {
  NEGLECT_CONSUMED:
    "Neglect — the Kabal alone never gathers enough shards for a true ritual; malformed fusion, only the Kabal itself is consumed. Twofold ending: the player's own chosen ending (e.g. a nation arc) resolves in full first, then an epilogue reveals this. Unlocks NG+ War Campaign. NOTE: the 'resolve the player's chosen ending first' system this depends on doesn't exist yet — for now this just returns the terminal ID; whatever prints the epilogue should fire unconditionally until that dependency is built.",
  GAUNTLET_PENDING:
    "Routes to the Gauntlet — full ritual, full 120-Veranthari sequential fight. That fight doesn't exist yet; call resolveGauntletOutcome(state, won) once it does to finalize GAUNTLET_WIN or GAUNTLET_LOSE.",
  GAUNTLET_WIN: "Gauntlet, Won — Primus Dead. Best possible ending.",
  GAUNTLET_LOSE: "Gauntlet, Lost — World-Consumed. Hard terminal: no NG+, no continuation.",
  CONSPIRATOR_SUCCESS: "Successful Conspirator — Primus Dead via inside betrayal, Kabal intact/strengthened, player left Influential within it.",
  CIVIL_WAR_WIN: "Weakened Cabal ending — Primus Dead, the Kabal itself left weakened.",
  CIVIL_WAR_LOSE: "Malformed Ritual, Weakened Cabal — the Civil War thinned the institution's ranks regardless of who won it.",
  RALLY_FAILED_NO_SHARDS: "Malformed Ritual, Weakened Cabal — failed rally attempt, no shards collected during it.",
  RALLY_FAILED_SHARDS_TURNED_IN: "Completed Ritual, Weakened Cabal Gauntlet — full ritual fires despite the failed rally, against an already-broken Kabal. Distinct from the main Gauntlet.",
  RALLY_FAILED_SHARDS_KEPT: "Malformed Ritual, Weakened Cabal — failed rally, shards collected but not turned in.",
  OPPOSED_STRENGTHENED: "Malformed Ritual, Strengthened Cabal — actively opposed the Kabal, but never took missions hunting its members specifically.",
  PASSIVE_NO_SHARDS: "Malformed Ritual, Moderate Cabal — never engaged either way, collected no shards.",
  PASSIVE_SHARDS_HANDED_OVER: "Malformed Ritual, Strengthened Cabal — collected shards, handed them over willingly.",
  PASSIVE_SHARDS_KEPT_FOUGHT_BACK: "Malformed Ritual, Weakened Cabal — targeted by the Kabal for keeping shards, fought back.",
  PASSIVE_SHARDS_KEPT_SUBMITTED: "Malformed Ritual, Strengthened Cabal — targeted by the Kabal for keeping shards, didn't fight back.",
  TERMINAL_THIRTEENTH: "TERMINAL: Player Becomes the Thirteenth — Global Override, 6 Majoris equipped at once. No fight. Straight to epilogue.",
};

// ---- Global Override (continuous) ----

// Whether an equipped item name is one of the 12 Fragmenta Majoris — reads
// an `isMajoris` flag on the item's own data/items.js entry. None of the
// 12 exist as authored items yet (see file header); this returns false
// for everything until they do.
function isMajorisItem(itemName) {
  const def = getItemDef(itemName);
  return !!(def && def.isMajoris);
}

// Counts every currently-equipped Majoris item across all real physical
// slots — the 9 single-item slots plus however many trinket slots are
// actually in use (2 normally, 3 with Dual Focus). Per Tyler: a flat count
// of individual equipped items, not "how many slot-categories touched" —
// 3 Majoris trinkets worn at once count as 3, not 1, and the denominator
// (11 slots normally, 12 with Dual Focus) is allowed to float; only the
// count of 6 itself is fixed.
function majorisEquippedCount(state) {
  let count = 0;
  for (const slot of EQUIP_SLOTS) {
    if (slot === "trinkets") {
      for (const item of state.equipment.trinkets) {
        if (isMajorisItem(item)) count += 1;
      }
    } else if (state.equipment[slot] && isMajorisItem(state.equipment[slot])) {
      count += 1;
    }
  }
  return count;
}

// Call after any player equipment change (cmdEquip/cmdUnequip in
// parser.js). A flat count of 6 equipped at once — not a ratio, doesn't
// scale with how many physical slots are currently available — per Tyler.
// Once terminalReached is set (by this or the one-time gate), it never
// changes; this is checked first everywhere it's wired in, so the Global
// Override always wins a race against the one-time gate.
function checkMajorisOverride(state) {
  if (state.kabalRoute.terminalReached) return [];
  if (majorisEquippedCount(state) >= 6) {
    state.kabalRoute.terminalReached = KABAL_ROUTE_TERMINALS.TERMINAL_THIRTEENTH;
    return [
      "Something in you answers all six at once — not a spell, not a voice. Just recognition.",
      "The Thirteenth remembers itself, one piece closer to whole. You are the piece it was missing.",
    ];
  }
  return [];
}

// ---- One-Time Gate (the main tree) ----

// Future quest content's hook for cabal_engagement_count — call once per
// completed quest actually flagged as Kabal-story content. No such quest
// exists yet (see file header), so nothing calls this today.
function markKabalStoryQuestCompleted(state) {
  state.kabalRoute.engagementCount += 1;
}

// Finalizes the Gauntlet's real outcome once that fight exists and
// resolves — GAUNTLET_PENDING (from evaluateMainQuestGate) isn't itself
// persisted to terminalReached, since it's a routing destination, not a
// final result; this is what actually sets the permanent terminal.
function resolveGauntletOutcome(state, won) {
  state.kabalRoute.terminalReached = won ? KABAL_ROUTE_TERMINALS.GAUNTLET_WIN : KABAL_ROUTE_TERMINALS.GAUNTLET_LOSE;
}

// The full tree, evaluated once at whatever instant this is called — see
// the file header for who's supposed to call it (nobody, yet). Doesn't
// itself check the Global Override — checkMajorisOverride runs
// continuously and independently, and a terminal it already set always
// takes priority (guard below).
function evaluateMainQuestGate(state) {
  if (state.kabalRoute.terminalReached) return state.kabalRoute.terminalReached;

  const r = state.kabalRoute;
  const cabalStoryEngaged = r.engagementCount >= KABAL_STORY_QUEST_THRESHOLD;
  let terminal;

  if (!cabalStoryEngaged) {
    terminal = KABAL_ROUTE_TERMINALS.NEGLECT_CONSUMED;
  } else if (r.supportedKabal) {
    const isMageOrBruise = !!(state.flags.isMage || state.flags.isBruise);
    if (!(isMageOrBruise && r.attemptedConspirator)) {
      // GAUNTLET_PENDING: not persisted to terminalReached — see
      // resolveGauntletOutcome. Returned directly so a caller knows to
      // route to that fight without the gate locking in an assumed result.
      return KABAL_ROUTE_TERMINALS.GAUNTLET_PENDING;
    } else if (r.turnedCabalAgainstPrimus) {
      if (r.killedPrimusInAmbush) {
        terminal = KABAL_ROUTE_TERMINALS.CONSPIRATOR_SUCCESS;
      } else {
        // Cabal Civil War
        terminal = r.civilWarWon ? KABAL_ROUTE_TERMINALS.CIVIL_WAR_WIN : KABAL_ROUTE_TERMINALS.CIVIL_WAR_LOSE;
      }
    } else if (!r.rallyShardsCollected) {
      // Failed rally attempt
      terminal = KABAL_ROUTE_TERMINALS.RALLY_FAILED_NO_SHARDS;
    } else if (r.rallyShardsTurnedIn) {
      terminal = KABAL_ROUTE_TERMINALS.RALLY_FAILED_SHARDS_TURNED_IN;
    } else {
      terminal = KABAL_ROUTE_TERMINALS.RALLY_FAILED_SHARDS_KEPT;
    }
  } else if (r.activelyOpposedCabal) {
    // Per Tyler: hunting Kabal members specifically, under sustained
    // active opposition, reaches the same Primus-Dead terminal as a won
    // Civil War — resolving the routing document's own cross-reference
    // ("same resolution as sustained active opposition") against its
    // literally-drawn branches, which otherwise never reached it.
    terminal = r.huntedCabalMembers ? KABAL_ROUTE_TERMINALS.CIVIL_WAR_WIN : KABAL_ROUTE_TERMINALS.OPPOSED_STRENGTHENED;
  } else if (!r.collectedAnyShards) {
    terminal = KABAL_ROUTE_TERMINALS.PASSIVE_NO_SHARDS;
  } else if (r.shardsHandedOver) {
    terminal = KABAL_ROUTE_TERMINALS.PASSIVE_SHARDS_HANDED_OVER;
  } else {
    terminal = r.foughtBack
      ? KABAL_ROUTE_TERMINALS.PASSIVE_SHARDS_KEPT_FOUGHT_BACK
      : KABAL_ROUTE_TERMINALS.PASSIVE_SHARDS_KEPT_SUBMITTED;
  }

  r.terminalReached = terminal;
  return terminal;
}
