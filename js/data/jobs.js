/*
 * FRAGMENTA — Jobs & Guild Contracts
 *
 * Two tiers of work:
 *  - City job boards: procedurally generated, 1-5 skull difficulty,
 *    refresh over time, modest pay/rep/loot. Available at any isCity
 *    location via the `board` command.
 *  - Guild contracts: hand-authored, only at a guild's home city, bigger
 *    stakes, tied to that guild's actual lore. Available via `contracts`.
 *
 * Both job types resolve through mechanics that already exist rather than
 * inventing new ones:
 *  - "bounty" completes the instant you win a fight against a creature
 *    that meets the job's Danger Class/Spawn Rarity requirement for its
 *    difficulty (meetsBountyRequirement, below; checked in engine/jobs.js
 *    checkJobProgressOnKill) — anywhere, not location-locked, so the open
 *    world stays open.
 *  - "courier" completes the instant you arrive at the target location
 *    (see checkJobProgressOnArrive).
 * Completion is immediate and automatic — no return trip to "turn in."
 */

const GUILD_HQ = {
  nocturne: "mugamiir_safor",
  vorseth: "magma_hearth",
};

// Replaces the old flat tier-number gate (BOUNTY_TIER_THRESHOLD) — each
// skull difficulty now requires a Danger Class/Spawn Rarity floor instead
// (see data/creaturetags.js for the rank scales), checked in
// engine/jobs.js checkJobProgressOnKill.
function meetsBountyRequirement(creature, difficulty) {
  const dRank = dangerClassRank(creature);
  const rRank = spawnRarityRank(creature);
  switch (difficulty) {
    case 1:
      return true;
    case 2:
      return rRank >= SPAWN_RARITY_RANK.uncommon;
    case 3:
      return dRank >= DANGER_CLASS_RANK.elite || rRank >= SPAWN_RARITY_RANK.rare;
    case 4:
      return dRank >= DANGER_CLASS_RANK.elite && rRank >= SPAWN_RARITY_RANK.epic;
    case 5:
      return dRank >= DANGER_CLASS_RANK.boss || rRank >= SPAWN_RARITY_RANK.unique;
    default:
      return true;
  }
}

const COURIER_DAY_BUCKETS = {
  1: [1, 3],
  2: [4, 8],
  3: [9, 15],
  4: [16, 25],
  5: [26, 999],
};

function skullString(difficulty) {
  return "☠".repeat(difficulty) + "·".repeat(5 - difficulty);
}

// Rough weighting so boards skew toward easier work with the occasional
// dangerous posting, rather than a flat 1-5 distribution.
const DIFFICULTY_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

function rollDifficulty() {
  return DIFFICULTY_POOL[Math.floor(Math.random() * DIFFICULTY_POOL.length)];
}

const BOUNTY_FLAVOR = {
  1: [
    "Something's been getting into the grain stores. Probably nothing dangerous. Probably.",
    "A few travelers have complained about being harassed on the road. Look into it.",
    "Livestock keep going missing at the edge of town. Handle it.",
  ],
  2: [
    "A pack has been spotted closer to the walls than anyone's comfortable with.",
    "Merchants are refusing to use the eastern road until something out there is dealt with.",
    "A local hunter went out and hasn't come back with a good explanation for what scared them off.",
  ],
  3: [
    "Something's killed livestock in a way that doesn't match anything mundane. Needs a capable hand.",
    "A caravan was attacked and the survivors describe something bigger than they expected.",
    "The local watch is refusing to go back out there without backup. Be the backup.",
  ],
  4: [
    "Whatever's out there has already turned back one armed patrol. Don't underestimate it.",
    "A creature matching no common description has been sighted twice, and believed both times.",
    "This one's above the watch's pay grade — officially and unofficially.",
  ],
  5: [
    "Do not take this without preparation. Two experienced hunters have already failed to come back.",
    "Whatever this is, it's old, it's strong, and it's someone else's problem until you make it yours.",
    "This posting has been up for weeks. No one local will touch it. That should tell you something.",
  ],
};

const COURIER_FLAVOR = {
  1: [
    "carry a sealed letter to",
    "deliver a small parcel to",
    "pass along a message to",
  ],
  2: [
    "escort a modest shipment of trade goods to",
    "deliver a locked strongbox (don't ask) to",
    "carry a set of contracts to",
  ],
  3: [
    "deliver a well-guarded package to",
    "carry something the sender was visibly nervous about, to",
    "transport a sealed diplomatic pouch to",
  ],
  4: [
    "carry something valuable enough that they hired you instead of a courier service, to",
    "deliver an item nobody would explain the purpose of, to",
    "transport a shipment worth protecting with your life, to",
  ],
  5: [
    "carry something that made the sender's hands shake when they handed it over, to",
    "deliver a sealed item under armed guard, to",
    "transport cargo that three other couriers have already refused, to",
  ],
};

// A few of these are registered in data/items.js with an equip slot and a
// stat bonus (a "well-oiled dagger", a "finely made traveler's cloak"...);
// the rest (rations, coins, an unassembled weapon component...) are
// deliberately flavor-only. Note this tier-5 pool's registered bonuses cap
// at Masterwork (+4), not Legendary — see data/items.js for why. Tier 5
// also has a small chance to grant an actual Fragmenta Motus shard
// instead — see engine/jobs.js resolveJob.
const LOOT_BY_TIER = {
  1: ["a handful of copper coins tied in cloth", "a decent whetstone", "a spare bootlace, oddly well-made"],
  2: [
    "a well-oiled dagger", "a pouch of dried rations", "a small vial of minor healing draught",
    "a legion arming spear, weighted for formation fighting", "a desert duelist's shamshir",
    "a Sahrimori parrying dagger", "a Vaeloris pathfinder's hood", "a legion officer's mail coat",
    "a legion swordsman's bracers", "a Sahrimori negotiator's silk gloves", "Sanguivorum courier boots",
    "a guild appraiser's brass loop", "a legion dueling ring", "a Vaeloris herbalist's seed cord",
    "a legion scout's grey cloak", "a Sahrimori water-route tablet",
  ],
  3: [
    "a finely made traveler's cloak", "a small pouch of uncut gemstones", "a well-balanced hand-axe",
    "a Vaeloris heartwood longbow", "a Norrvael storm-rider lance", "a dwarven furnace shield",
    "a Sahrimori caravan master's veil", "a Sahrimori night-traveler's layered robe",
    "Thraekor hammer-gauntlets", "a swamp guide's insect-oiled cloak", "a Norrvael storm-rider's saddle charm",
  ],
  4: [
    "a masterwork weapon component, unassembled", "a vial of something faintly luminous", "an engraved signet of no house you recognize",
    "a legionary's last battlefield standard-knot",
  ],
  5: ["a relic fragment of uncertain origin", "an item that hums faintly and makes you uneasy to carry", "a shard of something that was clearly never meant to be found"],
};

// When a loot roll succeeds and the board's own nation has region-tagged
// "job"-sourced gear at this difficulty (REGIONAL_JOB_LOOT_POOL, data/
// items.js), a job has a 50% chance to hand out that nation's own item
// instead of the generic LOOT_BY_TIER list — everything else (no
// boardNation, or that nation has nothing at this tier) is unchanged.
function rewardForDifficulty(difficulty, boardNation) {
  const gold = difficulty * (12 + Math.floor(Math.random() * 9)); // d*[12-20]
  const repAmount = difficulty * (2 + Math.floor(Math.random() * 3)); // d*[2-4]
  const rep = {};
  if (boardNation) rep[boardNation] = repAmount;
  const lootChance = 0.15 * difficulty;
  let loot = null;
  if (Math.random() < lootChance) {
    const regionalPool = boardNation && REGIONAL_JOB_LOOT_POOL[boardNation] && REGIONAL_JOB_LOOT_POOL[boardNation][difficulty];
    if (regionalPool && regionalPool.length && Math.random() < 0.5) {
      loot = regionalPool[Math.floor(Math.random() * regionalPool.length)];
    } else {
      loot = LOOT_BY_TIER[difficulty][Math.floor(Math.random() * LOOT_BY_TIER[difficulty].length)];
    }
  }
  return { gold, rep, loot };
}

function generateBoardJobs(locId) {
  const loc = LOCATIONS[locId];
  const jobs = [];
  const typeOrder = Math.random() < 0.5 ? ["bounty", "courier", "bounty"] : ["courier", "bounty", "courier"];
  for (const type of typeOrder) {
    const difficulty = rollDifficulty();
    if (type === "bounty") {
      jobs.push(makeBountyJob(locId, difficulty));
    } else {
      jobs.push(makeCourierJob(locId, difficulty));
    }
  }
  return jobs;
}

let _jobIdCounter = 1;

function makeBountyJob(boardLocationId, difficulty) {
  const loc = LOCATIONS[boardLocationId];
  const flavor = BOUNTY_FLAVOR[difficulty][Math.floor(Math.random() * BOUNTY_FLAVOR[difficulty].length)];
  const reward = rewardForDifficulty(difficulty, loc.nation);
  return {
    id: `job_${_jobIdCounter++}`,
    kind: "board",
    type: "bounty",
    difficulty,
    title: `Bounty: trouble near ${loc.name}`,
    description: flavor,
    boardLocation: boardLocationId,
    rewardGold: reward.gold,
    rewardRep: reward.rep,
    loot: reward.loot,
    status: "active",
  };
}

function makeCourierJob(boardLocationId, difficulty) {
  const loc = LOCATIONS[boardLocationId];
  const targetId = pickCourierTarget(boardLocationId, difficulty);
  if (!targetId) return makeBountyJob(boardLocationId, difficulty); // fallback if no valid target found
  const targetLoc = LOCATIONS[targetId];
  const verbPhrase = COURIER_FLAVOR[difficulty][Math.floor(Math.random() * COURIER_FLAVOR[difficulty].length)];
  const reward = rewardForDifficulty(difficulty, loc.nation);
  return {
    id: `job_${_jobIdCounter++}`,
    kind: "board",
    type: "courier",
    difficulty,
    title: `Courier: ${targetLoc.name}`,
    description: `Someone needs you to ${verbPhrase} ${targetLoc.name}.`,
    boardLocation: boardLocationId,
    targetLocation: targetId,
    rewardGold: reward.gold,
    rewardRep: reward.rep,
    loot: reward.loot,
    status: "active",
  };
}

function pickCourierTarget(boardLocationId, difficulty) {
  const [lo, hi] = COURIER_DAY_BUCKETS[difficulty];
  const candidates = [];
  let fallback = null;
  let fallbackDiff = Infinity;
  for (const [id, loc] of Object.entries(LOCATIONS)) {
    if (id === boardLocationId || !loc.isCity) continue;
    const result = findPath(boardLocationId, id);
    if (!result) continue;
    if (result.days >= lo && result.days <= hi) {
      candidates.push(id);
    } else {
      const diff = Math.min(Math.abs(result.days - lo), Math.abs(result.days - hi));
      if (diff < fallbackDiff) {
        fallbackDiff = diff;
        fallback = id;
      }
    }
  }
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  return fallback;
}

// ---- Guild contracts: hand-authored, bigger stakes, richer flavor ----

const GUILD_CONTRACTS = {
  mugamiir_safor: [
    {
      id: "contract_mugamiir_1",
      kind: "guild",
      guild: "mugamiir_safor",
      type: "bounty",
      difficulty: 3,
      title: "A Debt to the Sands",
      description:
        "An expedition team limped back from the Black Sands three days ago — short two members, and certain something followed them out. The guild wants it confirmed dead before it finds its way to a populated road.",
      rewardGold: 220,
      rewardRep: { mugamiir_safor: 18, sahrimor: 8 },
      loot: "a Black Sands survivor's field journal, half its pages still blank",
    },
    {
      id: "contract_mugamiir_2",
      kind: "guild",
      guild: "mugamiir_safor",
      type: "courier",
      difficulty: 4,
      title: "The Second Axe",
      description:
        "The guild's founding relic — the amethyst-headed, star-metal-hafted axe — has a twin, or so a very old ledger claims. A scholar at Guild Historia in Apollyon wants to examine a fragment recovered from the Sands. The guild wants it delivered by someone who won't lose it, sell it, or ask too many questions.",
      targetLocation: "apollyon",
      rewardGold: 260,
      rewardRep: { mugamiir_safor: 20, sanguivorum: 6 },
      loot: "a guild courier's seal — recognized at any Mugamiir Safor waypoint",
    },
    {
      id: "contract_mugamiir_3",
      kind: "guild",
      guild: "mugamiir_safor",
      type: "bounty",
      difficulty: 5,
      title: "What the Sands Don't Give Back",
      description:
        "Every returned expedition member is changed, not injured. Something usually explains itself eventually. This one hasn't, and it's gotten worse instead of better. The guild isn't calling it a mercy killing out loud, but that's what this contract is.",
      rewardGold: 400,
      rewardRep: { mugamiir_safor: 28, sahrimor: 10 },
      loot: "a shard of hardened amethyst, warm to the touch for reasons no one at the guild will discuss",
      fragmentChance: 0.35,
    },
  ],
  magma_hearth: [
    {
      id: "contract_magma_1",
      kind: "guild",
      guild: "magma_hearth",
      type: "courier",
      difficulty: 3,
      title: "Rivalry Work",
      description:
        "The guild wants a bid delivered directly into Mugamiir Safor territory before their rivals hear about the contract through the usual channels. Petty institutional pride, technically, but it pays like it isn't.",
      targetLocation: "nocturne",
      rewardGold: 210,
      rewardRep: { magma_hearth: 18, thraekor: 6 },
      loot: "a guild token stamped with the Magma-Hearth sigil",
    },
    {
      id: "contract_magma_2",
      kind: "guild",
      guild: "magma_hearth",
      type: "bounty",
      difficulty: 4,
      title: "Ash and Iron",
      description:
        "A mining operation feeding the Deepfire Order's forges has lost two shifts of workers to something in the tunnels below. The guild doesn't do rescue work, officially. Unofficially, the ore doesn't stop needing to come out.",
      rewardGold: 320,
      rewardRep: { magma_hearth: 22, thraekor: 10 },
      loot: "a caldera-quality ingot, still faintly warm",
    },
    {
      id: "contract_magma_3",
      kind: "guild",
      guild: "magma_hearth",
      type: "bounty",
      difficulty: 5,
      title: "The Confederation's Due",
      description:
        "Thraekor's mining authorities keep an active search for Stage 3 Valdrek-Keth — Diamond Tails — before their digging breaks into a magma chamber under a city that can't survive the event. This contract exists because one has been found, and no clan wants to be the one that waited too long.",
      rewardGold: 450,
      rewardRep: { magma_hearth: 28, thraekor: 12 },
      loot: "an uncut diamond, still rough from the tail plating",
      fragmentChance: 0.35,
    },
  ],
};
