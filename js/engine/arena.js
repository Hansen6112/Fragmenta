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
const ARENA_FIGHT_TYPE_WEIGHT = { duel: 1.0, team: 1.3, beast: 1.5, deathmatch: 1.8 };
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
// difficulty [with] more back to back wins."
function arenaDifficultyMultiplier(state) {
  const rankInfo = arenaRankInfo(state);
  const streak = Math.min(state.arena.streak, 10);
  return 1 + rankInfo.tierIndex * 0.15 + streak * 0.05;
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

// Starts a Duel (Phase 1's only fight type) — a single generated
// gladiator at the player's current rank/streak-scaled difficulty.
function startArenaDuel(state) {
  const gladiator = generateGladiator(state, state.arena.rank);
  const lines = startCombat(state, gladiator);
  state.combat.isArenaFight = true;
  state.combat.arenaFightType = "duel";
  state.combat.arenaLethal = false;
  state.combat.arenaOpponentTierIndex = ARENA_RANKS.find((r) => r.id === state.arena.rank).tierIndex;
  state.combat.arenaUneven = false;
  return lines;
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
  const purse = arenaGoldPurse(state, fightType);
  state.gold += purse;
  lines.push(`The crowd roars. The Game Master tosses you ${purse} gold from the prize purse.`);
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
  } else if (next && next.id === "champion" && current.id === "crimson" && state.arena.reputation >= current.repThreshold) {
    lines.push(`The Game Master watches you a moment longer than usual. You've earned a shot at the Champion — talk to her about it.`);
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
  const { healed } = applyHeal(state, state.maxHealth);
  state.combat = null;
  return `The Game Master calls it before it goes any further. You're carried out, patched up, and back on your feet${healed > 0 ? ` (fully healed)` : ""} — no rank lost, but the streak's broken. "Everyone loses one eventually," she says. "Come back when you're ready."`;
}

function cmdArena(arg, state) {
  if (state.combat) return ["You're a little busy for that right now."];
  const a = (arg || "").trim().toLowerCase();
  if (!state.arena.participant) {
    return ["You're not signed on as a Grand Ovum participant. Find the Game Master there and say the word."];
  }
  if (!a) {
    const rankInfo = arenaRankInfo(state);
    const streakLine = state.arena.streak > 0 ? ` Riding a ${state.arena.streak}-win streak.` : "";
    return [
      `Ovum rank: ${rankInfo.name}.${streakLine}`,
      `Fight types available: 'fight duel'.`,
    ];
  }
  if (a === "duel") {
    if (state.location !== "zuevaron" || state.subLocation !== "grandOvum") {
      return ["You need to be in the Grand Ovum itself to answer a bout."];
    }
    return startArenaDuel(state);
  }
  return [`No fight type called "${a}". Try 'fight duel'.`];
}

// engine/parser.js's cmdTalk gate, following maybeTalkToKessa's exact
// shape: returns null (falls through to the generic talk handler) unless
// the player is actually at the Grand Ovum addressing her by name/title.
function maybeTalkToGameMaster(arg, state) {
  const a = (arg || "").toLowerCase();
  if (!a.includes("game master") && !a.includes("gamemaster") && !a.includes("master")) return null;
  if (state.location !== "zuevaron" || state.subLocation !== "grandOvum") return null;
  const lines = [];
  if (!state.arena.participant) {
    state.arena.participant = true;
    lines.push(GAME_MASTER.greetingFirstTime);
    lines.push(`You're signed on. Say 'fight duel' whenever you want to step into the ring.`);
  } else {
    lines.push(GAME_MASTER.greetingReturning);
  }
  return lines;
}
