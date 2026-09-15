/*
 * FRAGMENTA — Dungeon Delve (run state machine)
 * Wires up data/dungeons.js's tables/generation into an actual run:
 * entering, resolving each room type, retreating, resting. Mirrors
 * engine/jobs.js's own role relative to data/jobs.js — a plain function
 * layer parser.js's commands (enter, search, retreat, rest) call into,
 * not a command handler itself.
 */

// Whether a stat is currently debuffed by torch/ration exhaustion — a
// no-op (returns 1) outside an active dungeon run, so every
// effectivePlayer* accessor in combat.js can call this unconditionally.
// Torch tiers gate accuracy/agility (can't see well enough to fight
// sharp); ration tiers gate atk/def (too hungry to hit hard or hold a
// guard) — see data/dungeons.js's TORCHLESS_TIERS/RATIONLESS_TIERS for
// why these are milder than FATIGUE_TIERS, not the same severity.
function dungeonTorchRationMultiplier(state, statKey) {
  const d = state.activeDungeon;
  if (!d) return 1;
  let mult = 1;
  if (statKey === "accuracy" || statKey === "agility") {
    const hoursWithout = d.torchHoursRemaining < 0 ? -d.torchHoursRemaining : 0;
    const tier = TORCHLESS_TIERS.find((t) => hoursWithout >= t.minHoursWithout);
    if (tier) mult *= tier.mult[statKey] ?? 1;
  }
  if (statKey === "atk" || statKey === "def") {
    const tier = RATIONLESS_TIERS.find((t) => d.floorsSinceRation >= t.minFloorsWithout);
    if (tier) mult *= tier.mult[statKey] ?? 1;
  }
  return mult;
}

// +1 effective difficulty per active debuff tier (torchless and
// rationless independently, so both at once is +2), capped at 5 — not
// given by the spec beyond "escalates," first-pass, flagged (data/
// dungeons.js's DUNGEON_ESCALATION_CAP).
function dungeonEscalatedDifficulty(state) {
  const d = state.activeDungeon;
  let escalation = 0;
  if (dungeonTorchRationMultiplier(state, "accuracy") < 1) escalation += 1;
  if (dungeonTorchRationMultiplier(state, "atk") < 1) escalation += 1;
  return Math.min(DUNGEON_ESCALATION_CAP, d.difficulty + escalation);
}

// Called from combat.js's resolveKill for every individual kill (a pack
// fight can have several before the room actually clears) — gold/loot
// gained from Combat-room kills count toward the run total the Mugamiir
// Safor strips on a rescue, same as a Loot room's own gains, not just
// whichever kill happened to end the fight.
function trackDungeonKillRewards(state, goldFound, lootItem) {
  if (!state.activeDungeon) return;
  state.activeDungeon.goldGainedThisRun += goldFound;
  if (lootItem) state.activeDungeon.lootGainedThisRun.push(lootItem);
}

// Called from resolveKill once the whole encounter is over (state.combat
// null — the same "no roster member left standing" moment
// checkJobProgressOnKill already keys off). A pack fight's earlier kills
// don't clear the room; only the one that ends the fight does.
function checkDungeonRoomClearOnKill(state) {
  if (!state.activeDungeon || state.combat) return;
  const room = currentDungeonRoom(state);
  if (room && room.type === "combat" && !room.cleared) markRoomCleared(state);
}

function currentDungeonRoom(state) {
  const d = state.activeDungeon;
  if (!d) return null;
  const floor = d.floors[d.currentFloorIndex];
  return floor ? floor.rooms[d.currentRoomIndex] : null;
}

// Entry: converts carried torches/rations into the run's own counters
// (count × 6 hours per torch, one ration per pack), removing them from
// inventory — same "materials become a run resource, not a spent item"
// treatment gathering materials get when consumed by a recipe.
function enterDungeon(state, locId) {
  const loc = LOCATIONS[locId];
  if (!loc || !loc.isDungeon) return [`There's no dungeon to enter here.`];
  if (state.activeDungeon) return [`You're already inside ${LOCATIONS[state.activeDungeon.entryLocation].name}. Finish or retreat from that first.`];
  const torchCount = state.inventory.filter((i) => i === "a torch").length;
  const rationCount = state.inventory.filter((i) => i === "a ration pack").length;
  state.inventory = state.inventory.filter((i) => i !== "a torch" && i !== "a ration pack");

  const difficulty = loc.dungeonDifficulty;
  const tags = TERRAIN_TAGS[loc.terrain] || ["continental"];
  const floors = generateDungeon(difficulty, tags, loc.nation);
  state.activeDungeon = {
    difficulty,
    entryLocation: locId,
    tags,
    floors,
    currentFloorIndex: 0,
    currentRoomIndex: 0,
    torchHoursRemaining: torchCount * 6,
    rationsRemaining: rationCount,
    floorsSinceRation: 0,
    rationSpentThisFloor: false,
    lootGainedThisRun: [],
    goldGainedThisRun: 0,
  };
  const recs = recommendedSupplies(difficulty);
  const lines = [
    `You descend into ${loc.name}. Difficulty ${difficulty} — ${floors.length} floors ahead.`,
    `Carrying ${torchCount} torch(es) (${state.activeDungeon.torchHoursRemaining}h) and ${rationCount} ration pack(s). Recommended for a run this size: ${recs.torches} torches, ${recs.rations} rations.`,
    `'search' to press on, 'retreat' to head back the way you came.`,
  ];
  return lines;
}

// Charges the standard 30-minute room cost and burns torch-hours for it
// — called by every room resolution path, including a Rest room's own
// (longer) time cost, so torches burn continuously whenever dungeon time
// passes, not just while actively fighting/searching. Not specified
// explicitly by the spec; proposing this as the consistent reading
// rather than carving out a Rest-specific exception.
function burnDungeonTime(state, minutes) {
  const d = state.activeDungeon;
  d.torchHoursRemaining -= minutes / 60;
}

function markRoomCleared(state) {
  const d = state.activeDungeon;
  currentDungeonRoom(state).cleared = true;
  d.currentRoomIndex += 1;
  const floor = d.floors[d.currentFloorIndex];
  if (d.currentRoomIndex >= floor.rooms.length) {
    d.currentFloorIndex += 1;
    d.currentRoomIndex = 0;
    if (d.rationSpentThisFloor) d.floorsSinceRation = 0;
    else d.floorsSinceRation += 1;
    d.rationSpentThisFloor = false;
  }
}

function resolveCombatRoom(state, room) {
  const lines = [`Something's waiting for you.`];
  // null preRolledLevel — same as hunt/track's own startCombat call
  // (engine/parser.js's cmdChoose): let the engine roll a level relative
  // to the player's own, rather than inventing a separate level formula
  // here. The escalated difficulty ceiling already governs which SPECIES
  // got picked (data/dungeons.js's pickDungeonCombatTarget); level
  // scaling is a different axis, handled the same way it always is.
  lines.push(...startCombat(state, room.creatureId, null));
  return lines;
}

// Trap failure can deal real damage AND/OR apply a status, but not
// necessarily both (per Tyler) — TRAP_TYPES' failDamagePct/failStatus
// spread that across the three types rather than every trap doing the
// same thing. checkTrapDeathPrevention (combat.js) is the safety net —
// traps resolve outside state.combat, so the ordinary checkDeathPrevention
// can't run here.
function resolveTrapRoom(state, room) {
  const trap = TRAP_TYPES[room.trapType];
  const chance = trapSuccessChance(room.trapType, state.activeDungeon.difficulty, state);
  const lines = [];
  if (Math.random() < chance) {
    lines.push(`You spot the ${room.trapType} trap and get past it clean.`);
    markRoomCleared(state);
    return lines;
  }
  lines.push(`The ${room.trapType} trap catches you.`);
  if (trap.failDamagePct > 0) {
    const dmg = Math.max(1, Math.round(state.maxHealth * trap.failDamagePct));
    state.health -= dmg;
    lines.push(`You take ${dmg} damage.`);
  }
  if (trap.failStatus) lines.push(`You're left ${trap.failStatus}.`);
  if (state.health <= 0) {
    lines.push(checkTrapDeathPrevention(state) || `Everything goes dark.`);
    return lines;
  }
  markRoomCleared(state);
  return lines;
}

function resolveLootRoom(state) {
  const d = state.activeDungeon;
  const lines = [];
  const gold = d.difficulty * (10 + Math.floor(Math.random() * 8));
  state.gold += gold;
  d.goldGainedThisRun += gold;
  lines.push(`You find ${gold} gold.`);
  if (Math.random() < 0.5) {
    const pool = LOOT_BY_TIER[Math.min(5, d.difficulty)] || LOOT_BY_TIER[1];
    const item = pool[Math.floor(Math.random() * pool.length)];
    state.inventory.push(item);
    d.lootGainedThisRun.push(item);
    lines.push(`Also: ${formatItemLine(item)}.`);
  }
  markRoomCleared(state);
  return lines;
}

// Player + every alive ally — the one genuinely new piece of engineering
// here, since performRest (engine/parser.js's cmdRest/cmdSleep) has
// never touched state.party. Heal % is a first-pass extension of the
// existing two-tier shape (rest 12%, sleep 100%) into three — not given
// by the spec. "Partial" fatigue relief nudges lastSleptDay halfway
// rather than fully resetting it, matching quick/medium's own partial
// heal treatment; full does the same full reset cmdSleep does.
const DUNGEON_REST_TIERS = {
  quick: { hours: 2, healPct: 0.12, fatigueRelief: "none" },
  medium: { hours: 4, healPct: 0.5, fatigueRelief: "partial" },
  full: { hours: 8, healPct: 1.0, fatigueRelief: "full" },
};

function resolveRestRoom(state, tier) {
  const d = state.activeDungeon;
  const spec = DUNGEON_REST_TIERS[tier];
  if (!spec) return [`Rest how — quick, medium, or full?`];
  const lines = [];
  const playerHeal = Math.ceil(state.maxHealth * spec.healPct);
  const { healed } = applyHeal(state, playerHeal);
  lines.push(`You rest (${tier}) — mended for ${healed} health.`);
  for (const ally of aliveAllies(state)) {
    const allyHealAmt = Math.min(Math.ceil(ally.maxHealth * spec.healPct), ally.maxHealth - ally.health);
    ally.health += allyHealAmt;
    if (allyHealAmt > 0) lines.push(`${ally.name} rests too — mended for ${allyHealAmt} health.`);
  }
  if (spec.fatigueRelief === "full") {
    state.lastSleptDay = state.day;
  } else if (spec.fatigueRelief === "partial") {
    state.lastSleptDay = Math.floor((state.lastSleptDay + state.day) / 2);
  }
  burnDungeonTime(state, spec.hours * 60);
  markRoomCleared(state);
  return lines;
}

function resolveExitRoom(state) {
  const d = state.activeDungeon;
  const entry = d.entryLocation;
  state.location = entry;
  state.subLocation = null;
  const lines = [`You find the way back up — ${LOCATIONS[entry].name} again, ${d.goldGainedThisRun} gold and ${d.lootGainedThisRun.length} item(s) richer for the trip.`];
  state.activeDungeon = null;
  return lines;
}

// 'search'/'continue' — resolves the current room, costing 30 minutes
// (advanceTime) and that much torchlight, same as every other room
// resolution path. A Rest room refuses here on purpose — resting needs
// an explicit tier (parser.js's cmdDungeonRest), since "which tier" isn't
// something a bare 'search' can answer.
function cmdDungeonSearch(state) {
  const d = state.activeDungeon;
  if (!d) return [`You aren't in a dungeon.`];
  const room = currentDungeonRoom(state);
  if (!room) return [`There's nowhere further to search.`];
  if (room.type === "rest" && !room.cleared) {
    return [`You find a defensible nook to rest in — 'rest quick', 'rest medium', or 'rest full'.`];
  }
  if (room.type === "exit") {
    burnDungeonTime(state, 30);
    // generateDungeon gives every floor its own exit-type room, not just
    // the last one — on an earlier floor this is stairs down, not the way
    // out. Only the FINAL floor's exit room actually ends the run;
    // markRoomCleared's own overflow check (currentRoomIndex running past
    // this floor's last room) is exactly the existing floor-advance path,
    // so reuse it here instead of a separate transition mechanism.
    if (d.currentFloorIndex >= d.floors.length - 1) {
      return [...resolveExitRoom(state), ...advanceTime(state, 30, "dungeon")];
    }
    markRoomCleared(state);
    return [`You find the stairs down to the next floor.`, ...advanceTime(state, 30, "dungeon")];
  }
  burnDungeonTime(state, 30);
  const lines = [];
  if (room.type === "combat") lines.push(...resolveCombatRoom(state, room));
  else if (room.type === "trap") lines.push(...resolveTrapRoom(state, room));
  else if (room.type === "loot") lines.push(...resolveLootRoom(state));
  lines.push(...advanceTime(state, 30, "dungeon"));
  return lines;
}

function cmdDungeonRest(state, tier) {
  if (!state.activeDungeon) return [`You aren't in a dungeon.`];
  const room = currentDungeonRoom(state);
  if (!room || room.type !== "rest" || room.cleared) return [`There's nowhere to rest here.`];
  const spec = DUNGEON_REST_TIERS[tier];
  if (!spec) return [`Rest how — quick, medium, or full?`];
  const lines = resolveRestRoom(state, tier);
  lines.push(...advanceTime(state, spec.hours * 60, "dungeon rest"));
  return lines;
}

// 'retreat' — reports the cost (rooms/time/torches) and requires
// explicit confirmation before it actually executes (state.flags.
// pendingDungeonRetreat, resolved by parser.js's cmdChoose — same
// pending-decision shape as every other one-time choice in this engine).
// If torches ran out, cleared rooms along the path repopulate at the
// escalated ceiling instead of passing through free.
function dungeonRetreatReport(state) {
  const d = state.activeDungeon;
  let roomsBack = d.currentRoomIndex;
  for (let f = 0; f < d.currentFloorIndex; f++) roomsBack += d.floors[f].rooms.length;
  const minutes = roomsBack * 30;
  const torchesNeeded = Math.ceil(minutes / 60 / 6);
  const willRepopulate = d.torchHoursRemaining <= 0;
  return { roomsBack, minutes, torchesNeeded, willRepopulate };
}

function executeDungeonRetreat(state) {
  const d = state.activeDungeon;
  const report = dungeonRetreatReport(state);
  const lines = [`You retreat back through ${report.roomsBack} room(s).`];
  if (report.willRepopulate) {
    // Repopulate every cleared Combat room between here and the entrance
    // at the escalated ceiling, rather than letting them all pass free —
    // spec §3's "no free ride once the torches are gone."
    const escalated = dungeonEscalatedDifficulty(state);
    for (let f = 0; f <= d.currentFloorIndex; f++) {
      const roomLimit = f === d.currentFloorIndex ? d.currentRoomIndex : d.floors[f].rooms.length;
      for (let r = 0; r < roomLimit; r++) {
        const room = d.floors[f].rooms[r];
        if (room.type === "combat" && room.cleared) {
          room.creatureId = pickDungeonCombatTarget(d.tags, LOCATIONS[d.entryLocation].nation, escalated);
          room.cleared = false;
        }
      }
    }
    lines.push(`With no light left, whatever you already cleared has had time to creep back in.`);
  }
  burnDungeonTime(state, report.minutes);
  d.currentFloorIndex = 0;
  d.currentRoomIndex = 0;
  state.location = d.entryLocation;
  state.subLocation = null;
  lines.push(`Back at ${LOCATIONS[d.entryLocation].name}, ${d.goldGainedThisRun} gold and ${d.lootGainedThisRun.length} item(s) richer for the trip so far.`);
  state.activeDungeon = null;
  lines.push(...advanceTime(state, report.minutes, "dungeon retreat"));
  return lines;
}

function cmdDungeonRetreat(state) {
  if (!state.activeDungeon) return [`You aren't in a dungeon.`];
  const report = dungeonRetreatReport(state);
  state.flags.pendingDungeonRetreat = true;
  const lines = [
    `Retreating through ${report.roomsBack} room(s) — ${report.minutes} minutes, requires ${report.torchesNeeded} torch-hour(s) worth of light you may not have.`,
  ];
  if (report.willRepopulate) lines.push(`Your torches are already out — anything you've cleared on the way back will have to be fought through again.`);
  lines.push(`'choose retreat' to confirm, or keep exploring instead.`);
  return lines;
}
