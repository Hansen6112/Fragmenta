/*
 * FRAGMENTA — Hadrian Voric's Personal Quest: "History's Sting"
 * Runtime logic for the quest data in data/hadrianquest.js. Three call
 * sites elsewhere in the engine:
 *   - engine/jobs.js's resolveJob calls maybeAdvanceHadrianQuest right
 *     after the relationship-meter bump, since crossing a threshold is
 *     itself a job-completion-triggered event and (unlike the meter's
 *     own silent listener) needs its dialogue to actually reach the
 *     player's screen.
 *   - engine/parser.js's executeTravel calls checkBlackSandsConfrontation
 *     on a guaranteed first arrival at the Black Sands, mirroring
 *     engine/arena.js's checkHadrianAmbush.
 *   - engine/combat.js's resolveKill calls concludeHadrianQuestFinale
 *     when the last of the two bosses falls, mirroring
 *     concludeArenaFightWon/concludeHadrianAmbush.
 */

// Crossing 25/50 relationship — checked every time relationship changes,
// each gated to fire exactly once via its own flag.
function maybeAdvanceHadrianQuest(state) {
  const hadrian = state.party.find((p) => p.defId === "hadrian" && p.alive);
  if (!hadrian) return [];
  const lines = [];
  if (!state.flags.hadrianLetter25Shown && hadrian.relationship >= 25) {
    state.flags.hadrianLetter25Shown = true;
    lines.push(...HADRIAN_QUEST.letter25);
  }
  if (!state.flags.hadrianQuestUnlocked && hadrian.relationship >= 50) {
    state.flags.hadrianQuestUnlocked = true;
    lines.push(...HADRIAN_QUEST.letter50Unlock);
  }
  return lines;
}

// The condensed "investigation" — see data/hadrianquest.js's header on
// why this is a single travel step rather than a multi-stage clue chain.
// Mirrors checkHadrianAmbush's "guaranteed, preempts the random-encounter
// roll" shape exactly.
function checkBlackSandsConfrontation(state, locId) {
  if (locId !== "black_sands") return null;
  if (!state.flags.hadrianQuestUnlocked || state.flags.hadrianQuestCompleted) return null;
  const hadrian = state.party.find((p) => p.defId === "hadrian" && p.alive);
  if (!hadrian) return null; // his own quest's climax needs him along
  const lines = [...HADRIAN_QUEST.confrontationIntro];
  lines.push(...startCombat(state, ASTRA_SALAHRU_REVENANT));
  state.combat.enemies.push(buildSummonedEnemyRecord(BRUISED_MAGE.id, BRUISED_MAGE, "hadrian_quest", true));
  state.combat.isHadrianQuestFinale = true;
  return lines;
}

// combat.js's resolveKill calls this when the last of the two bosses
// falls — completion narrative, world-state flags, reputation, and the
// Legendary equipment ascension (Section 11.4) + trinkets (11.5).
function concludeHadrianQuestFinale(state) {
  state.flags.hadrianQuestCompleted = true;
  state.flags.astraSaLahruFreed = true;
  state.flags.bruisedMageDefeated = true;
  state.flags.hadrianLegionResolved = true;
  const lines = [...HADRIAN_QUEST.completion];

  // Modest reputation increase with both nations — Sanguivorum for
  // helping a nationally known figure resolve a personal crisis,
  // Sahrimor for removing a threat that was operating within its own
  // borders — independent of, and not a reversal of, Hadrian's older
  // Sahrimor-military dislike from Astra Sa'Lahru's original death.
  const repGain = 5;
  state.reputation.sanguivorum = Math.max(-100, Math.min(100, (state.reputation.sanguivorum || 0) + repGain));
  state.reputation.sahrimor = Math.max(-100, Math.min(100, (state.reputation.sahrimor || 0) + repGain));
  lines.push(`Sanguivorum +${repGain}, Sahrimor +${repGain} reputation.`);

  const hadrian = state.party.find((p) => p.defId === "hadrian");
  if (hadrian) {
    ascendHadrianEquipment(hadrian);
    lines.push(...HADRIAN_QUEST.ascensionFlavor);
  }
  return lines;
}

// Swaps Hadrian's six starting pieces for their ascended replacements
// and fills both Trinket slots for the first time — see data/items.js's
// header comment on why this is a wholesale swap, not an in-place mutation.
function ascendHadrianEquipment(hadrian) {
  for (const [slot, ascendedName] of Object.entries(HADRIAN_ASCENSION_MAP)) {
    hadrian.equipment[slot] = ascendedName;
  }
  hadrian.equipment.trinkets = HADRIAN_QUEST_TRINKETS.slice();
  recomputeAllyStats(hadrian, hadrian.level);
}
