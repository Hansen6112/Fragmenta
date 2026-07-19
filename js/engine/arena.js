/*
 * FRAGMENTA — The Grand Ovum (Arena) engine
 * Duels for now (Phase 1) — Team/Beast/Death Match/Tournament build on
 * the same startArenaFight/concludeArenaFight pair in later phases.
 *
 * Non-lethal by design: every arena fight except a Death Match sets
 * state.combat.arenaLethal = false, which checkDeathPrevention (combat.js)
 * checks BEFORE any of the player's own cheat-death effects — a bout
 * that was never actually lethal shouldn't spend a Last Stand/Elder Bark
 * charge, and a loss just ends the match rather than the game (see
 * main.js's `state.health <= 0` game-over check, which never fires once
 * health has already been restored here).
 */

// Reputation gain per win — base scaled by fight-type weight, current
// win streak (capped so it can't compound forever), whether this
// opponent is a rank above the player's own current one ("harder
// fights"), and whether the fight was materially uneven (outnumbered,
// or a lone high-tier beast) — all four are the exact multipliers the
// user described, each additive-on-top rather than replacing the base.
const ARENA_FIGHT_TYPE_WEIGHT = { duel: 1.0, team: 1.3, beast: 1.5, deathmatch: 1.8, tournament: 1.5, champion: 2.0 };

// Accepts a few spellings ("death match", "death-match") for the same
// fight type — cmdArena below normalizes the raw arg's spaces/hyphens
// away before looking it up here. Tournament isn't listed yet — it needs
// its own multi-round/no-heal-between-rounds handling (Arena Phase 3),
// and startArenaFight below doesn't know how to run one on its own.
const ARENA_FIGHT_TYPE_ALIASES = {
  duel: "duel", duels: "duel",
  team: "team", teamfight: "team", teams: "team",
  beast: "beast", beastfight: "beast",
  deathmatch: "deathmatch", deathmatches: "deathmatch",
};
function arenaReputationGain(state, fightType, opponentTierIndex, uneven) {
  const rankInfo = arenaRankInfo(state);
  const base = 3;
  const typeMult = ARENA_FIGHT_TYPE_WEIGHT[fightType] || 1.0;
  const streak = state.arena.streak;
  const streakMult = 1 + Math.min(streak, 10) * 0.08;
  const harderMult = opponentTierIndex > rankInfo.tierIndex ? 1.5 : 1.0;
  const unevenMult = uneven ? 1.3 : 1.0;
  return Math.max(1, Math.round(base * typeMult * streakMult * harderMult * unevenMult));
}

// Gold purse — separate from resolveKill's own per-kill gold (which still
// applies normally, since arena opponents are ordinary combat kills under
// the hood) — this is the "prize" on top, paid once per MATCH rather than
// per enemy defeated, scaled by rank and fight type.
function arenaGoldPurse(state, fightType) {
  const rankInfo = arenaRankInfo(state);
  const typeMult = ARENA_FIGHT_TYPE_WEIGHT[fightType] || 1.0;
  return Math.round((10 + rankInfo.tierIndex * 12) * typeMult);
}

function arenaRankInfo(state) {
  return ARENA_RANKS.find((r) => r.id === state.arena.rank) || ARENA_RANKS[0];
}

// Difficulty multiplier for a freshly-generated opponent: rank baseline
// plus the current win streak (capped) — "the fights should increase in
// difficulty [with] more back to back wins." — plus, while a tournament is
// running, an extra per-round escalation on top of that (round 3 hits
// harder than round 1 even at the same rank/streak).
function arenaDifficultyMultiplier(state) {
  const rankInfo = arenaRankInfo(state);
  const streak = Math.min(state.arena.streak, 10);
  const tournamentRoundBonus = state.arena.tournamentRound > 0 ? (state.arena.tournamentRound - 1) * 0.12 : 0;
  return 1 + rankInfo.tierIndex * 0.15 + streak * 0.05 + tournamentRoundBonus;
}

// A dynamically-generated combatant, same shape as data/enemymages.js's
// generateEnemyMage (not routed through BESTIARY's level-roll/rarity
// system — it already carries its own .level/.dangerClass/.spawnRarity),
// so resolveKill's normal gold/XP/loot payout applies to it exactly like
// any other creature, without any special-casing there.
function generateGladiator(state, rankId) {
  const titles = GLADIATOR_TITLES[rankId] || GLADIATOR_TITLES.copper;
  const title = titles[Math.floor(Math.random() * titles.length)];
  const nation = ["sanguivorum", "vaeloris", "sahrimor", "thraekor", "norrvael"][Math.floor(Math.random() * 5)];
  const name = generateNameForNation(nation);
  const mult = arenaDifficultyMultiplier(state);
  const rankInfo = ARENA_RANKS.find((r) => r.id === rankId) || ARENA_RANKS[0];
  const level = Math.max(1, state.level);
  return {
    id: "gladiator_" + Math.random().toString(36).slice(2, 9),
    name: `${title} ${name}`,
    native: "Ovum-trained",
    level,
    hp: Math.max(6, Math.round((10 + level * 3) * mult)),
    atk: Math.max(1, Math.round((3 + level * 0.8) * mult)),
    def: Math.max(0, Math.round((2 + level * 0.5) * mult)),
    spd: Math.max(1, Math.round(4 + level * 0.2)),
    acc: Math.max(1, Math.round(4 + level * 0.15)),
    agi: Math.max(1, Math.round(3 + level * 0.15)),
    dangerClass: rankInfo.tierIndex >= 5 ? "elite" : "normal",
    spawnRarity: rankInfo.tierIndex >= 6 ? "rare" : rankInfo.tierIndex >= 3 ? "uncommon" : "common",
    description: "A trained arena combatant, sized up and paid to give you a real fight — not a killing one.",
    combatNotes: "The Game Master calls the bout the instant it's decided. No one dies in a billed non-lethal match.",
    friendly: false,
  };
}

// How many gladiators a Team/Death Match squad fields, by rank tierIndex
// (0-7) — a Copper squad is a pair, Champion-tier fields four.
const TEAM_SQUAD_SIZE_BY_TIER = [2, 2, 3, 3, 3, 4, 4, 4];

// Which BESTIARY Danger Classes are fair game for a Beast fight at a
// given rank tierIndex — "high level beast" scales the pool up with rank
// rather than pulling any wild creature regardless of how tame it is.
const BEAST_DANGER_BY_TIER = [
  ["normal"], ["normal", "elite"], ["elite"], ["elite", "boss"],
  ["boss"], ["boss", "world_boss"], ["world_boss"], ["world_boss"],
];

// Picks a real BESTIARY creature (faction "wild" only — an actual beast,
// not undead or a construct) for a Beast fight, scaled to a level a
// couple points past the player's own — "high level beast" is meant to
// read as genuinely dangerous, not a fair fight.
function pickArenaBeast(state) {
  const rankInfo = arenaRankInfo(state);
  const allowedDanger = BEAST_DANGER_BY_TIER[rankInfo.tierIndex] || ["normal"];
  const pool = Object.keys(BESTIARY).filter((id) => {
    const c = BESTIARY[id];
    return c.faction === "wild" && !c.special && allowedDanger.includes(c.dangerClass);
  });
  if (!pool.length) return null;
  const id = pool[Math.floor(Math.random() * pool.length)];
  const level = Math.max(1, state.level + 3);
  return { id, creature: buildFightCreature(BESTIARY[id], level, BESTIARY[id].dangerClass) };
}

// How many back-to-back rounds a Tournament runs — "multiple fights in a
// row... but no chance to heal in-between fights." Concretely enforced by
// concludeArenaFightWon below chaining straight into the next round
// itself, so the player never gets a turn between bouts to rest or use
// an item.
const TOURNAMENT_ROUNDS = 3;

// Starts a Duel/Team/Beast/Death Match/Tournament-round fight. Tournament
// rounds share this exact setup — only the escalating stat multiplier
// (arenaDifficultyMultiplier's tournamentRoundBonus) and the chained
// win-handling in concludeArenaFightWon make a Tournament round different
// from an ordinary duel.
function startArenaFight(state, fightType) {
  const rankInfo = arenaRankInfo(state);
  let lines;
  let opponentTierIndex = rankInfo.tierIndex;
  let uneven = false;
  if (fightType === "beast") {
    const beast = pickArenaBeast(state);
    if (!beast) return [`The Game Master shrugs. "Nothing worth billing as a beast fight right now. Try something else."`];
    const announce = BEAST_FIGHT_ANNOUNCE[Math.floor(Math.random() * BEAST_FIGHT_ANNOUNCE.length)];
    lines = [announce, ...startCombat(state, beast.id, beast.creature.level)];
    // A lone opponent that's disproportionately strong for its billing —
    // always "harder" and "uneven" by design, not by headcount.
    opponentTierIndex = rankInfo.tierIndex + 1;
    uneven = true;
  } else {
    const gladiator = generateGladiator(state, rankInfo.id);
    lines = startCombat(state, gladiator);
    if (fightType === "team" || fightType === "deathmatch") {
      const squadSize = TEAM_SQUAD_SIZE_BY_TIER[rankInfo.tierIndex] || 2;
      for (let i = 1; i < squadSize; i++) {
        const extra = generateGladiator(state, rankInfo.id);
        state.combat.enemies.push(buildSummonedEnemyRecord(extra.id, extra, "arena_squad", true));
      }
      const partySize = 1 + aliveAllies(state).length;
      uneven = squadSize > partySize;
      lines.push(`${squadSize} fighters enter together — this is a squad bout, not a duel.`);
    }
  }
  state.combat.isArenaFight = true;
  state.combat.arenaFightType = fightType;
  // Death Match is the one arena fight type that's genuinely lethal — see
  // maybeArenaNonLethalLoss below, which only intercepts the other three.
  state.combat.arenaLethal = fightType === "deathmatch";
  state.combat.arenaOpponentTierIndex = opponentTierIndex;
  state.combat.arenaUneven = uneven;
  return lines;
}

// The Champion's own combat stat block — a flat, hand-tuned boss
// encounter (not routed through buildFightCreature/computeCreatureStats,
// same as any other dynamic creature) rather than his post-recruitment
// ally stat block (data/hadrian.js's HADRIAN.startingStats, which is
// calibrated for the ally growth FORMULA, not a standalone fight). His
// name is withheld here — "The Champion" — since the source record's
// recruitment chain has him reveal it only after being defeated.
// Recruitment Level per the source record: begins at 10, or Player
// Level+2 once the player is already past 10 — the exact scale-up curve
// past that baseline (8% per level here) isn't specified, so this is
// this implementation's own reasonable choice, not a source number.
function buildHadrianDuelCreature(state) {
  const level = state.level > 10 ? state.level + 2 : 10;
  const mult = 1 + Math.max(0, level - 10) * 0.08;
  return {
    id: "hadrian",
    name: "The Champion",
    native: "Sanguivorum",
    level,
    hp: Math.round(70 * mult),
    atk: Math.round(16 * mult),
    def: Math.round(13 * mult),
    spd: Math.round(9 * mult),
    acc: Math.round(13 * mult),
    agi: Math.round(9 * mult),
    dangerClass: "world_boss",
    spawnRarity: "unique",
    description: "Undefeated in eleven years of bouts, and it shows in how little he wastes — no wasted motion, no wasted breath.",
    combatNotes: "Eleven years undefeated, and it shows in how little he wastes.",
    friendly: false,
  };
}

// The Champion bout — offered only once Crimson is reached (see
// cmdArena's gate). Still non-lethal like every arena fight except Death
// Match: beating him earns his respect and an offer to join you, not his
// life.
function startHadrianDuel(state) {
  const lines = startCombat(state, buildHadrianDuelCreature(state));
  state.combat.isArenaFight = true;
  state.combat.arenaFightType = "champion";
  state.combat.arenaLethal = false;
  state.combat.arenaOpponentTierIndex = ARENA_RANKS[ARENA_RANKS.length - 1].tierIndex;
  state.combat.arenaUneven = false;
  return [
    `The gate the Game Master normally reserves for beast fights opens instead on a man in scarred leather, already loosening his shoulders. The Champion doesn't posture — he just waits for you to be ready.`,
    ...lines,
  ];
}

// Legendary/Mythic Arena rewards (data/items.js's ARENA_LOOT_POOL/
// ARENA_CHAMPION_LOOT_POOL) — reserved for the Grand Ovum specifically,
// entirely separate from rollCreatureLoot's tier-1-4 monster pool, which
// never rolls Legendary+ (see that file's own header comment on why).
function maybeArenaLootDrop(state, fightType) {
  if (fightType === "champion") {
    if (!ARENA_CHAMPION_LOOT_POOL.length) return [];
    const item = ARENA_CHAMPION_LOOT_POOL[Math.floor(Math.random() * ARENA_CHAMPION_LOOT_POOL.length)];
    state.inventory.push(item);
    return [`He offers something from his own kit, too: ${formatItemLine(item)}.`];
  }
  const chance = 0.05 + arenaRankInfo(state).tierIndex * 0.015;
  if (Math.random() >= chance || !ARENA_LOOT_POOL.length) return [];
  const item = ARENA_LOOT_POOL[Math.floor(Math.random() * ARENA_LOOT_POOL.length)];
  state.inventory.push(item);
  return [`The Game Master tosses in something extra from the vault: ${formatItemLine(item)}.`];
}

// Called from resolveKill (combat.js), just before state.combat is
// nulled on the final kill of a fully-won arena match. Not called at all
// for a loss — see maybeArenaNonLethalLoss below, which handles that
// through checkDeathPrevention instead, since a loss is detected by the
// player's OWN health reaching 0, not by an enemy dying.
function concludeArenaFightWon(state) {
  const combat = state.combat;
  const fightType = combat.arenaFightType;
  const lines = [];
  state.arena.streak += 1;
  const gain = arenaReputationGain(state, fightType, combat.arenaOpponentTierIndex, combat.arenaUneven);
  state.arena.reputation = Math.min(100, state.arena.reputation + gain);

  if (fightType === "champion") {
    state.arena.championDefeated = true;
    state.arena.rank = "champion";
    const purse = arenaGoldPurse(state, fightType);
    state.gold += purse;
    lines.push(`The Game Master doesn't bother hiding her smile. "Champion rank. About time someone actually earned it." She presses ${purse} gold into your hand.`);
    lines.push(...maybeArenaLootDrop(state, fightType));
    // Recruitment offer — only once, and only if this hasn't already been
    // resolved (accepted, declined here, or resolved via the Thalvora
    // alt-path in Sahrimor). engine/parser.js's cmdRecruit/'decline'
    // handling resolves state.flags.hadrianOfferPending afterward.
    if (!hadrianFullyResolved(state) && !state.flags.hadrianOfferPending) {
      state.flags.hadrianOfferPending = true;
      lines.push(`The Champion lowers his weapon, breathing hard but steady. "Hadrian," he says. "Hadrian Voric. It felt wrong, letting you beat a man with no name."`);
      lines.push(HADRIAN.recruitment.offer);
      lines.push(`Say 'recruit hadrian' to accept, or 'decline hadrian' to part ways.`);
    }
    return lines;
  }

  if (fightType === "tournament") {
    const purse = arenaGoldPurse(state, fightType);
    state.gold += purse;
    state.arena.tournamentPurseAccrued += purse;
    lines.push(`Round ${state.arena.tournamentRound} of ${state.arena.tournamentTotal} won — ${purse} gold banked.`);
    lines.push(...maybeArenaLootDrop(state, fightType));
    if (state.arena.tournamentRound < state.arena.tournamentTotal) {
      state.arena.tournamentRound += 1;
      lines.push(...maybeArenaRankUp(state));
      lines.push(`No time to catch your breath — round ${state.arena.tournamentRound} of ${state.arena.tournamentTotal} starts now.`);
      lines.push(...startArenaFight(state, "tournament"));
      return lines;
    }
    const bonus = state.arena.tournamentPurseAccrued;
    state.gold += bonus;
    lines.push(`You've swept all ${state.arena.tournamentTotal} rounds! The Game Master doubles the purse: another ${bonus} gold.`);
    state.arena.tournamentRound = 0;
    state.arena.tournamentTotal = 0;
    state.arena.tournamentPurseAccrued = 0;
    lines.push(...maybeArenaRankUp(state));
    return lines;
  }

  const purse = arenaGoldPurse(state, fightType);
  state.gold += purse;
  lines.push(`The crowd roars. The Game Master tosses you ${purse} gold from the prize purse.`);
  lines.push(...maybeArenaLootDrop(state, fightType));
  lines.push(...maybeArenaRankUp(state));
  return lines;
}

function maybeArenaRankUp(state) {
  const lines = [];
  const current = arenaRankInfo(state);
  const next = ARENA_RANKS[ARENA_RANKS.indexOf(current) + 1];
  // Champion is never reached by reputation alone — see ARENA_RANKS above.
  if (next && next.id !== "champion" && state.arena.reputation >= next.repThreshold) {
    state.arena.rank = next.id;
    lines.push(`Word travels fast in the Ovum — you've been moved up to ${next.name} rank.`);
  } else if (next && next.id === "champion" && current.id === "crimson" && state.arena.reputation >= current.repThreshold && !state.arena.championHintGiven) {
    state.arena.championHintGiven = true;
    lines.push(HADRIAN.recruitment.summons);
  }
  return lines;
}

// checkDeathPrevention (combat.js) calls this FIRST, before any of the
// player's own cheat-death effects — an arena bout that's flagged
// non-lethal was never going to kill anyone regardless, so it shouldn't
// consume a Last Stand/Elder Bark/Between Worlds charge to survive it.
// Returns a message string (ending the match as a loss) or null (not an
// arena fight, or a Death Match, which IS real) — combat.js only falls
// through to its own cheat-death checks on null.
function maybeArenaNonLethalLoss(state) {
  const combat = state.combat;
  if (!combat || !combat.isArenaFight || combat.arenaLethal) return null;
  state.arena.streak = 0;
  const wasTournament = combat.arenaFightType === "tournament" && state.arena.tournamentRound > 0;
  if (wasTournament) {
    state.arena.tournamentRound = 0;
    state.arena.tournamentTotal = 0;
    state.arena.tournamentPurseAccrued = 0;
  }
  const wasChampion = combat.arenaFightType === "champion";
  const { healed } = applyHeal(state, state.maxHealth);
  state.combat = null;
  // The Champion speaks for himself on a loss (Section 6's "Failure /
  // Postponement" line) rather than the Game Master's usual generic one
  // — the challenge stays permanently available either way.
  if (wasChampion) {
    return `${HADRIAN.recruitment.loss} You're carried out and patched up${healed > 0 ? ` (fully healed)` : ""} — no rank lost, but the streak's broken.`;
  }
  const tournamentNote = wasTournament ? " The tournament ends here — whatever you'd already banked stays banked." : "";
  return `The Game Master calls it before it goes any further. You're carried out, patched up, and back on your feet${healed > 0 ? ` (fully healed)` : ""} — no rank lost, but the streak's broken.${tournamentNote} "Everyone loses one eventually," she says. "Come back when you're ready."`;
}

function cmdArena(arg, state) {
  if (state.combat) return ["You're a little busy for that right now."];
  const a = (arg || "").trim().toLowerCase().replace(/[\s-]+/g, "");
  if (!state.arena.participant) {
    return ["You're not signed on as a Grand Ovum participant. Find the Game Master there and say the word."];
  }
  const championResolved = hadrianFullyResolved(state);
  if (!a) {
    const rankInfo = arenaRankInfo(state);
    const streakLine = state.arena.streak > 0 ? ` Riding a ${state.arena.streak}-win streak.` : "";
    const championLine = !championResolved && (rankInfo.id === "crimson" || state.arena.championDefeated) ? ` 'fight champion' is on the table.` : "";
    return [
      `Ovum rank: ${rankInfo.name}.${streakLine}${championLine}`,
      `Fight types available: 'fight duel', 'fight team', 'fight beast', 'fight deathmatch', 'fight tournament'.`,
    ];
  }
  const isKnownType = a === "champion" || a === "tournament" || a === "tournaments" || !!ARENA_FIGHT_TYPE_ALIASES[a];
  if (!isKnownType) {
    return [`No fight type called "${a}". Try 'fight duel', 'fight team', 'fight beast', 'fight deathmatch', or 'fight tournament'.`];
  }
  if (state.location !== "zuevaron" || state.subLocation !== "grandOvum") {
    return ["You need to be in the Grand Ovum itself to answer a bout."];
  }
  if (a === "champion") {
    if (championResolved) return [`There's no Champion left to answer that summons — that chapter's closed.`];
    if (state.flags.hadrianOfferPending) return [`He's waiting on your answer before anything else. 'recruit hadrian', or 'decline hadrian'.`];
    const rankInfo = arenaRankInfo(state);
    if (rankInfo.id !== "crimson" && !state.arena.championDefeated) return [GAME_MASTER.championLocked];
    return startHadrianDuel(state);
  }
  if (a === "tournament" || a === "tournaments") {
    state.arena.tournamentRound = 1;
    state.arena.tournamentTotal = TOURNAMENT_ROUNDS;
    state.arena.tournamentPurseAccrued = 0;
    return [
      `The Game Master grins. "Tournament rules: ${TOURNAMENT_ROUNDS} bouts, back to back, no patching up between them. Win them all and the purse doubles. Lose one and you keep whatever you've already banked." Round 1 begins.`,
      ...startArenaFight(state, "tournament"),
    ];
  }
  return startArenaFight(state, ARENA_FIGHT_TYPE_ALIASES[a]);
}

// engine/parser.js's cmdTalk gate, following maybeTalkToKessa's exact
// shape: returns null (falls through to the generic talk handler) unless
// the player is actually at the Grand Ovum. Unlike Kessa (one NPC among
// many at a shared tavern), the Game Master is the only person worth
// talking to here, so a bare "talk" with no name resolves to her too —
// otherwise a first-time visitor has no way to discover the sign-on
// phrase short of guessing her title verbatim.
function maybeTalkToGameMaster(arg, state) {
  const a = (arg || "").toLowerCase();
  if (a && !a.includes("game master") && !a.includes("gamemaster") && !a.includes("master")) return null;
  if (state.location !== "zuevaron" || state.subLocation !== "grandOvum") return null;
  const lines = [];
  if (!state.arena.participant) {
    state.arena.participant = true;
    lines.push(GAME_MASTER.greetingFirstTime);
    lines.push(`You're signed on. Say 'fight duel' whenever you want to step into the ring.`);
  } else if (state.flags.hadrianOfferPending) {
    lines.push(`"Well?" the Game Master says, arms crossed. "He's waiting on you, not me. 'recruit hadrian' or 'decline hadrian.'"`);
  } else if (state.party.some((p) => p.defId === "hadrian")) {
    lines.push(GAME_MASTER.championRecruited);
  } else if (state.flags.hadrianDeclinedPermanently) {
    lines.push(GAME_MASTER.championGone);
  } else if (arenaRankInfo(state).id === "crimson") {
    lines.push(GAME_MASTER.championUnlocked);
  } else {
    lines.push(GAME_MASTER.greetingReturning);
  }
  return lines;
}

// Whether Hadrian's story is fully closed off, one way or another —
// recruited (through either path), or permanently lost (declined at the
// Grand Ovum, declined a second time at Thalvora, or killed there by a
// flee). Also true while either offer is still awaiting an answer, since
// he can't simultaneously be standing in the Grand Ovum ring.
function hadrianFullyResolved(state) {
  return (
    state.party.some((p) => p.defId === "hadrian") ||
    !!state.flags.hadrianDeclinedPermanently ||
    !!state.flags.hadrianDeadInAmbush ||
    !!state.flags.hadrianThalvoraDeclined ||
    !!state.flags.hadrianThalvoraOfferPending
  );
}

// engine/parser.js's cmdRecruit calls this first — resolves whichever of
// the two recruitment offers (Grand Ovum duel or Thalvora ambush) is
// currently pending, or returns null (falls through to cmdRecruit's own
// generic refusal) if neither is.
function acceptHadrianOffer(state) {
  if (state.flags.hadrianOfferPending) {
    state.flags.hadrianOfferPending = false;
  } else if (state.flags.hadrianThalvoraOfferPending) {
    state.flags.hadrianThalvoraOfferPending = false;
  } else {
    return null;
  }
  const recruited = state.recruitAlly("hadrian");
  if (!recruited) return [`Something's already claimed that spot in your party.`];
  return [HADRIAN.recruitment.accept, `${recruited.name} joins your party. Set a stance with 'stance hadrian aggressive|defensive|support'.`];
}

// engine/parser.js's 'leave'/'decline' case calls this first — same
// pending-offer resolution as acceptHadrianOffer, but the permanent-miss
// branch: declining at the Grand Ovum still leaves the Thalvora path
// open (his own decline line sends him toward Sahrimor); declining a
// second time at Thalvora is final.
function declineHadrianOffer(state) {
  if (state.flags.hadrianOfferPending) {
    state.flags.hadrianOfferPending = false;
    state.flags.hadrianDeclinedPermanently = true;
    return [HADRIAN.recruitment.decline];
  }
  if (state.flags.hadrianThalvoraOfferPending) {
    state.flags.hadrianThalvoraOfferPending = false;
    state.flags.hadrianThalvoraDeclined = true;
    return [HADRIAN.recruitment.thalvoraDecline];
  }
  return null;
}

// Alternate recruitment path (Section 6): reaching Thalvora (Sahrimor,
// data/world.js) for the first time, before Hadrian's story is otherwise
// resolved, triggers a guaranteed ambush — five enemies, one an Akharu,
// already fighting him when the player arrives. Called from
// engine/parser.js's executeTravel right after a first arrival there.
function checkHadrianAmbush(state, locId) {
  if (locId !== "thalvora" || state.visited.has("thalvora")) return null;
  const thalvoraAlreadyResolved =
    state.party.some((p) => p.defId === "hadrian") || state.flags.hadrianDeadInAmbush || state.flags.hadrianThalvoraDeclined;
  if (thalvoraAlreadyResolved) return null;
  const lines = [
    `Thalvora is quiet in the way a well-run city usually is — right up until the horse paddocks outside the wall erupt into shouting. Five fighters have someone backed against the fence rail — a big man with a two-handed maul, bleeding from more than one place, still on his feet.`,
    `One of the five is Akharu, chitin catching the light between the others' blades. This wasn't a fair fight before you arrived, and it's yours now too.`,
  ];
  lines.push(...startCombat(state, "akharu"));
  const squadTitles = ["Sahrimor Blade-for-Hire", "Sahrimor Blade-for-Hire", "Sahrimor Blade-for-Hire", "Sahrimor Enforcer"];
  for (const title of squadTitles) {
    const extra = {
      id: "thalvora_ambusher_" + Math.random().toString(36).slice(2, 9),
      name: `${title} ${generateNameForNation("sahrimor")}`,
      native: "Sahrimor",
      level: Math.max(1, state.level + 2),
      hp: Math.round(14 + state.level * 2.5),
      atk: Math.round(6 + state.level * 1.1),
      def: Math.round(4 + state.level * 0.6),
      spd: Math.round(5 + state.level * 0.2),
      acc: Math.round(6 + state.level * 0.2),
      agi: Math.round(5 + state.level * 0.2),
      dangerClass: "elite",
      spawnRarity: "rare",
      description: "One of five who cornered a lone fighter and liked their odds.",
      combatNotes: "",
      friendly: false,
    };
    state.combat.enemies.push(buildSummonedEnemyRecord(extra.id, extra, "thalvora_ambush", true));
  }
  state.combat.isHadrianAmbush = true;
  return lines;
}

// combat.js's resolveKill calls this (mirroring concludeArenaFightWon)
// when the last of the five ambushers falls.
function concludeHadrianAmbush(state) {
  state.flags.hadrianThalvoraOfferPending = true;
  return [
    `The last of them falls. Silence, then the scrape of a maul being planted point-down in the dirt to lean on.`,
    HADRIAN.recruitment.thalvoraOffer,
    `Say 'recruit hadrian' to accept, or 'decline hadrian' to part ways for good.`,
  ];
}

// combat.js's attemptFlee calls this if the player breaks off from a
// still-active Hadrian ambush — per Section 6's failure condition, he's
// marked dead and permanently removed from the recruitable pool.
function markHadrianLostInAmbush(state) {
  state.flags.hadrianDeadInAmbush = true;
  return [`By the time you're clear of it, so is he. Whatever chance he had to make it out of Thalvora, it wasn't in the direction you ran.`];
}
