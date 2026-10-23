/*
 * FRAGMENTA — Game State
 */

// v0.11 combat retune: base Attack 5 -> 12 and base Magic 3 -> 8 (both
// before PLAYER_STAT_SCALE, below). The codex creatures were measured
// ~2x too tough for a level 1-10 character and about right by level 15+:
// early-game damage is base-stat dominated while late-game damage is
// gear dominated, so raising the BASE lifts the early end of the curve
// far more than the late end, flattening the mismatch instead of
// shifting it.
const BASE_ATK = 12;
const BASE_DEF = 2;
const BASE_HEALTH = 20;
const BASE_MAGIC = 8; // v0.11 — see BASE_ATK above
const BASE_KNOWLEDGE = 3;
const BASE_SPEED = 5;
const BASE_ACCURACY = 5;
const BASE_AGILITY = 5;

// v0.11 combat retune: the player's combat-stat scale. Before this, a
// level-3 character had ~26 Health and hit for ~6, while the hand-
// authored Enemy Codex creatures at the same level carried 50-80 Health
// and 15+ Attack — the two sides were authored on different scales. 2x is
// the value at which the codex's own authored Health lands, on median,
// almost exactly in its Danger Class band (measured with tools/
// combatsim.js — see the v0.11 notes there). Rather
// than shrinking every codex creature down to the player's scale (which
// left early enemies at 1-20 Health, where a single crit or miss decides
// the whole fight and archetype identity has no room to show), the
// player's own Attack/Defense/Health/Magic come up to the codex's scale.
//
// Applied ONCE, at the stat-total level: everything summed into
// atk/def/maxHealth/magic in recomputeStats (base, Race, point-buy,
// growth, gear, set bonuses) and recomputeAllyStats is multiplied by it,
// and flat in-combat bonuses (Regalia stacks, potion/tactic buffs) go
// through flatStat(). Item and set data stay authored in "stat points";
// the tooltip shows the scaled value (formatItemBonuses) so what an item
// says it gives is what it actually gives. Speed/Accuracy/Agility/
// Knowledge are NOT scaled — they feed hit-chance/initiative thresholds
// and Knowledge gates, which are scale-free comparisons.
const PLAYER_STAT_SCALE = 2;
const SCALED_COMBAT_STATS = { atk: true, def: true, health: true, magic: true };
function scaledStat(statKey, value) {
  return SCALED_COMBAT_STATS[statKey] ? Math.round(value * PLAYER_STAT_SCALE) : value;
}
function flatStat(value) {
  return Math.round(value * PLAYER_STAT_SCALE);
}

// Fatigue: how many days without a full sleep before each debuff kicks
// in. Checked from most-severe down so the worst applicable tier wins.
// Player-only — allies don't track their own time independently.
const FATIGUE_TIERS = [
  { minDays: 3, id: "dead_man_walking", label: "Dead Man Walking", mult: 0.5 },
  { minDays: 2, id: "exhausted", label: "Exhausted", mult: 0.8 },
  { minDays: 1, id: "tired", label: "Tired", mult: 0.9 },
];

function fatigueTierForDays(daysSinceSleep) {
  return FATIGUE_TIERS.find((t) => daysSinceSleep >= t.minDays) || null;
}

function fatigueTier(state) {
  return fatigueTierForDays(state.day - state.lastSleptDay);
}

// Save format version, stamped into every save by toJSON. Bump it whenever
// the save shape changes in a way fromJSON needs to know about.
const SAVE_KEY = "fragmenta_save";
const SAVE_VERSION = 2;

// Renamed registry keys: { oldId: newId }. Whenever a LOCATIONS or
// ALLY_DEFS key is renamed (the sylmae/sylmere, orethmare/drathmere class
// of fix), add the old -> new pair here so existing saves follow the rename
// instead of pointing at an id that no longer exists (which crashes every
// command that reads currentLocation()).
const SAVE_KEY_MIGRATIONS = {
  locations: {},
  allies: {},
};

// Single source of truth for the nested state objects that used to be
// spelled out separately in the constructor, applyCreation, and fromJSON.
// fromJSON merges a save's copy over these, so a save written before a
// sub-field existed still gets that field's default instead of undefined.
function defaultArenaState() {
  return {
    participant: false, // gated by talking to the Game Master at Zuevaron's Grand Ovum
    reputation: 0,
    rank: "copper",
    streak: 0, // consecutive wins — resets to 0 on any loss
    championDefeated: false,
    championHintGiven: false, // gates the "you've earned a shot at the Champion" line to once
    tournamentRound: 0, // >0 while mid-tournament — 0 means no tournament in progress
    tournamentTotal: 0,
    tournamentPurseAccrued: 0, // gold banked so far this tournament, doubled on a full clear
  };
}

function defaultKabalRoute() {
  return {
    engagementCount: 0, // +1 per completed quest flagged Kabal-story (none exist yet)
    supportedKabal: false,
    attemptedConspirator: false,
    turnedCabalAgainstPrimus: false,
    killedPrimusInAmbush: false,
    civilWarWon: false,
    rallyShardsCollected: false,
    rallyShardsTurnedIn: false,
    activelyOpposedCabal: false,
    huntedCabalMembers: false,
    collectedAnyShards: false,
    shardsHandedOver: false,
    foughtBack: false,
    terminalReached: null, // set once, by either the Override or the one-time gate — see checkMajorisOverride/evaluateMainQuestGate
  };
}

class GameState {
  constructor() {
    this.playerName = "Wanderer";
    this.race = null;
    this.origin = null;
    this.class = null;
    this.pointBuy = {}; // stat -> extra points allocated at creation, see applyCreation
    this.scoutDeepenBonus = 0; // Scout-only level-15 "Deepen" choice: flat permanent bonus added to speed/accuracy/agility (v0.10 — was a multiplier, matched to Mage's flat +6 magicBoost instead)
    this.nation = "sanguivorum";
    this.location = "zuevaron";
    this.level = 1;
    this.xp = 0;
    this.atk = BASE_ATK;
    this.def = BASE_DEF;
    this.maxHealth = BASE_HEALTH;
    this.health = BASE_HEALTH;
    this.magic = BASE_MAGIC;
    this.knowledge = BASE_KNOWLEDGE;
    this.speed = BASE_SPEED;
    this.accuracy = BASE_ACCURACY;
    this.agility = BASE_AGILITY;
    this.magicBoost = 0; // permanent bonus from the level-15 "deepen primary" choice
    this.primaryElement = null;
    this.secondaryElement = null;
    this.tertiaryElement = null; // Conduit Ascendant's (Artifact) additional element, beyond the normal two
    this.battleScholarBonus = 0; // Battle Scholar's (Artifact) permanent post-combat Knowledge, capped +50
    this.livingLegacyBonus = 0; // Living Legacy's (Artifact) permanent post-Elite-kill max Health, capped +100
    this.soulLedgerCount = 0; // Soul Ledger's (Divine Regalia) whole-game, uncapped kill counter
    this.soulLedgerHealthBonus = 0; // Soul Ledger's chosen permanent +Health, uncapped
    this.soulLedgerMagicBonus = 0; // Soul Ledger's chosen permanent +Magic, uncapped
    this.soulLedgerDefBonus = 0; // Soul Ledger's chosen permanent +Defense, uncapped
    this.archiveEternalSeen = []; // Archive Eternal's (Divine Regalia) whole-game list of recorded creature "species" keys
    this.archiveEternalKnowledgeBonus = 0; // Archive Eternal's permanent +1 Knowledge per new species, uncapped
    this.stealthMod = 0;
    this.gold = 25;
    this.inventory = ["a traveler's cloak", "a half-empty waterskin", "a few days' rations"];
    this.equipment = emptyEquipment();
    this.day = 1;
    this.hour = 8; // world clock — see engine/time.js's advanceTime/getDaypart
    this.minute = 0;
    this.lastSleptDay = 1; // last day a full 'sleep' was completed — see fatigueTier below
    this.subLocation = null; // key into the current city's `sublocations` (see world.js), null = the city's main square/gate
    this.flags = {};
    this.visited = new Set();
    // Bestiary ids the player has actually fought — powers the Lore tab's
    // Enemies category (engine/parser.js's buildLoreMenu), which only
    // lists a creature once you've encountered it. Populated in
    // combat.js's startCombat, one entry per distinct creature type
    // faced (a pack fight can add several at once).
    this.encounteredCreatures = new Set();
    // Apothecary crafting (data/recipes.js/schematics.js, engine/
    // crafting.js): document-gated unlocks a 'learn'ed item adds a key to
    // (see parser.js's cmdLearn) — knowledgeReq-gated recipes need no
    // entry here at all, just enough state.knowledge.
    this.knownRecipes = new Set();
    this.knownSchematics = new Set();
    this.combat = null; // { creatureId, hp, name } when engaged
    this.knownFragments = 0;
    this.reputation = initialReputation(); // factionId -> -100..100, all 0 until an Origin is applied
    this.activeJobs = [];
    // Hunt/Track (engine/parser.js's cmdHunt/cmdChoose, data/jobs.js's
    // trackSequence): { jobId, stepIndex } while mid-sequence, else null.
    // Not under `flags` (unlike the boolean pendingXChoice convention)
    // since it carries structured data — same reasoning as arena/party
    // below being their own top-level fields.
    this.activeTrack = null;
    // Dungeon Delve (data/dungeons.js, engine/dungeon.js): null outside a
    // run. Set at entry: { difficulty, entryLocation, floors, currentFloorIndex,
    // currentRoomIndex, torchHoursRemaining, floorsSinceRation, lootGainedThisRun,
    // goldGainedThisRun }. Plain nested object, not under `flags` — same
    // reasoning as activeTrack above (structured data, not a boolean).
    this.activeDungeon = null;
    // Main Quest Routing Tree (engine/kabalroute.js) — the flag/variable
    // schema the one-time gate-evaluation pass reads at the (not-yet-
    // built) world-clock's "final act begins" trigger, plus whatever the
    // Global Override (majorisEquippedCount, computed live from
    // state.equipment — see kabalroute.js) has already resolved. Kept as
    // one grouped object rather than loose top-level fields, same
    // reasoning as activeDungeon/activeTrack above. terminalReached is
    // null until either the Global Override fires (checked continuously,
    // can happen at any point in play) or the one-time gate is evaluated
    // — once set, it never changes.
    this.kabalRoute = defaultKabalRoute();
    // Investigate mini-game (engine/investigations.js). activeInvestigation
    // is structured data (not under flags — same reasoning as activeTrack/
    // activeDungeon/kabalRoute above), null outside a conversation:
    // { questId, targetId, nodeIndex, pointsSoFar }. investigationProgress
    // is durable and separate — { [questId]: { [targetId]: pointsEarned } }
    // — since a mission's several targets are each one-shot conversations
    // that need to accumulate toward one combined hunt bonus over time,
    // long after any single conversation has ended and activeInvestigation
    // has gone back to null.
    this.activeInvestigation = null;
    this.investigationProgress = {};
    this.boards = {}; // locationId -> { jobs: [...], lastRefresh: day }
    this.shops = {}; // locationId -> { stock: [...itemNames], lastRefresh: day } — see engine/shop.js
    this.party = []; // recruited allies — see recruitAlly/recomputeAllyStats below
    this.fallenAllies = []; // { defId, name, level, diedDay, relationship } — bodies sent to the Sanctuary, awaiting revival (see parser.js)
    // Append-only record of every death in this run — player and allies —
    // for anything that later needs to know what happened (the multi-ending
    // gate, companion epilogues). Entries: { id, kind: "player"|"ally",
    // defId?, name, day, location, cause, resolution? }. Never pruned:
    // reviving an ally adds a resolution, it doesn't erase the death.
    this.deathLog = [];
    // Stable identity for this character across saves/reloads, so the
    // separate death ledger (recordPlayerDeath) can be matched back to it.
    this.runId = null;
    this.divineFavor = 0; // standing with the Pantheon's god of Death and Renewal — one of three revival paths
    // The Grand Ovum (engine/arena.js) — Ovum Reputation ("Fame") is a
    // hidden 0-100 tracker, entirely separate from the nation `reputation`
    // above; only ever shown to the player through the rank it crosses
    // into, never as a raw number.
    this.arena = defaultArenaState();
  }

  // Adds a new party member from ALLY_DEFS, at the player's current level,
  // with empty gear and an aggressive default stance. Returns null (and
  // adds nothing) if that ally is already in the party or the id is
  // unknown — the caller (parser.js's cmdRecruit) is responsible for any
  // recruitment gating; this just does the actual joining.
  // `opts.revived`: a Sanctuary revival (parser.js's cmdRevive) — skips the
  // ally's starting gear (it already went back to the pack when they fell;
  // re-issuing it duplicated it on every death/revive cycle) and restores
  // the relationship value they had when they died.
  recruitAlly(defId, opts = {}) {
    if (!ALLY_DEFS[defId] || this.party.some((a) => a.defId === defId)) return null;
    const ally = {
      defId,
      name: ALLY_DEFS[defId].name,
      level: this.level,
      stance: "aggressive",
      equipment: emptyEquipment(),
      alive: true,
      // Hidden 0-100 relationship meter — never shown to the player as a
      // raw number, same design as Ovum Reputation (engine/arena.js).
      // Raised by shared experience (engine/jobs.js's job.completed
      // listener, for now); nothing currently reads it for a reveal —
      // that's future companion-quest work, not built yet.
      relationship: opts.relationship || 0,
      // Crafted-potion buffs used on this ally (see engine/combat.js's
      // applyConsumableEffectToAlly and companion.js's allyBuffStatTotal/
      // tickAllyBuffs) — keyed by stat, same { amount, turns } shape
      // as combat.playerBuffs. Lives on the ally itself, not per-fight
      // companion state, since 'use <item> on <ally>' only ever happens
      // OUT of combat (see useItemOnAlly) — a buff applied before a fight
      // needs to survive until that fight's own beginTurn starts ticking
      // it down.
      buffs: {},
    };
    // Some allies (Hadrian — data/hadrian.js) arrive already wearing
    // their own signature gear rather than starting empty-handed like
    // Kessa; recomputeAllyStats below picks its stat bonuses up normally
    // through the usual equipmentBonus() path.
    if (ALLY_DEFS[defId].startingEquipment && !opts.revived) {
      Object.assign(ally.equipment, ALLY_DEFS[defId].startingEquipment);
    }
    recomputeAllyStats(ally, this.level);
    ally.health = ally.maxHealth;
    this.party.push(ally);
    return ally;
  }

  // Applies a chosen Race + Origin + Class's stats, kit, location, and
  // flags. Called once at character creation (see main.js beginCharacter).
  // pointBuy is a plain {stat: extraPoints} map from the boot-time
  // allocation step (main.js's ask_pointbuy stage / parser.js's 'add'/
  // 'sub' commands) — additive only, on top of Race's own values.
  applyCreation(raceKey, originKey, classKey, pointBuy) {
    const origin = ORIGINS[originKey];
    const cls = CLASSES[classKey];
    this.race = raceKey;
    this.origin = originKey;
    this.class = classKey;
    this.pointBuy = pointBuy || {};
    this.level = 1;
    this.xp = 0;
    this.magicBoost = 0;
    this.scoutDeepenBonus = 0;
    this.primaryElement = null;
    this.secondaryElement = null;
    this.tertiaryElement = null;
    this.battleScholarBonus = 0;
    this.livingLegacyBonus = 0;
    this.soulLedgerCount = 0;
    this.soulLedgerHealthBonus = 0;
    this.soulLedgerMagicBonus = 0;
    this.soulLedgerDefBonus = 0;
    this.archiveEternalSeen = [];
    this.archiveEternalKnowledgeBonus = 0;
    this.arena = defaultArenaState();
    this.runId = "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    this.deathLog = [];
    this.stealthMod = cls.stealthMod || 0;
    this.gold = origin.gold;
    this.inventory = [...origin.inventory];
    this.equipment = emptyEquipment();
    this.flags = { ...(origin.flags || {}) };
    // isMage is kept as a derived flag (not a free-standing choice) so the
    // many existing call sites that already gate on state.flags.isMage
    // (crit flavor, elemental attack resolution, cmdSkills/cmdStatus,
    // the mage level-15 choice) keep working unchanged — only Class
    // decides it now, via Mage/Bruise's forced-Class special Origins.
    this.flags.isMage = !!cls.isMage;
    // Bruise/Novitiate (mage) are their own derived flags too — parser.js
    // already reads state.flags.isBruise/isNovitiate (Kabal/Sanguivorum
    // location flavor gating) from before the Race/Class/Origin migration,
    // but nothing has set them since; both branches have been dead code
    // ever since. Class alone decides them now, same as isMage above.
    this.flags.isBruise = this.class === "bruise";
    this.flags.isNovitiate = this.class === "mage";
    this.nation = origin.nation || this.deriveNationFromLocation(origin.startLocation);
    this.location = origin.startLocation;
    this.reputation = initialReputation(origin.reputation);
    this.recomputeStats(false); // false = full heal to new max, not a level-up top-up
  }

  // Recalculates atk/def/maxHealth/magic/knowledge/speed/accuracy/agility
  // from scratch (base + Race mod + point-buy + growth + equipped gear's
  // bonuses) — always derived from current level/gear rather than
  // accumulated incrementally, so there's no rounding drift across many
  // level-ups, and equipping/unequipping is just another recompute rather
  // than a separate code path. Growth itself is Class-shaped (the bigger
  // multiplier) and Origin-nudged (the smaller one) on top of a single
  // shared PLAYER_GROWTH_BASE/PLAYER_SECONDARY_GROWTH_RATE (data/
  // classes.js) — atk/def/health/magic/knowledge scale freely per Class,
  // while speed/accuracy/agility deliberately share ONE flat base rate for
  // every Class (only ever scaled by a multiplier, never a faster base),
  // mirroring data/creaturetags.js's computeCreatureStats split for the
  // exact same reason: those three feed threshold-y combat math (hitChance
  // clamps, turn order) where a runaway *base* rate reproduces the
  // unwinnable-gap bug that system already found and fixed for enemies.
  // `healOnGain` controls what happens to current health when maxHealth
  // changes: on level-up or a gear change, the gained amount is added to
  // current health (you feel stronger, not proportionally weaker); at
  // character creation, health is simply set to the new max (full heal).
  // Either way, health is clamped to the new max afterward — unequipping a
  // +Health item can lower the ceiling below current health.
  recomputeStats(healOnGain) {
    const race = RACES[this.race];
    const cls = CLASSES[this.class];
    if (!race || !cls) return;
    const origin = ORIGINS[this.origin] || {};
    const originMult = origin.growthMult || {};
    const om = (stat) => (originMult[stat] != null ? originMult[stat] : 1);
    const pb = this.pointBuy || {};
    const n = this.level - 1;
    const oldMaxHealth = this.maxHealth;
    this.atk = scaledStat("atk", BASE_ATK + (race.atkMod || 0) + (pb.atk || 0) + Math.round(PLAYER_GROWTH_BASE.atk * cls.growthMult.atk * om("atk") * n) + equipmentBonus(this, "atk") + setStatBonus(this, "atk") + (this.flags.vanguardMomentumStacks || 0) + (this.flags.victorsMomentumStacks || 0));
    this.def = scaledStat("def", BASE_DEF + (race.defMod || 0) + (pb.def || 0) + Math.round(PLAYER_GROWTH_BASE.def * cls.growthMult.def * om("def") * n) + equipmentBonus(this, "def") + setStatBonus(this, "def") + (this.soulLedgerDefBonus || 0));
    this.maxHealth = scaledStat("health", BASE_HEALTH + (race.healthMod || 0) + (pb.health || 0) + Math.round(PLAYER_GROWTH_BASE.health * cls.growthMult.health * om("health") * n) + equipmentBonus(this, "health") + setStatBonus(this, "health") + (this.livingLegacyBonus || 0) + (this.soulLedgerHealthBonus || 0));
    this.magic = scaledStat("magic", BASE_MAGIC + (race.magicMod || 0) + (pb.magic || 0) + Math.round(PLAYER_GROWTH_BASE.magic * cls.growthMult.magic * om("magic") * n) + (this.magicBoost || 0) + equipmentBonus(this, "magic") + setStatBonus(this, "magic") + (this.flags.passingWhisperStacks || 0) + (this.soulLedgerMagicBonus || 0));
    this.knowledge = BASE_KNOWLEDGE + (race.knowledgeMod || 0) + (pb.knowledge || 0) + Math.round(PLAYER_GROWTH_BASE.knowledge * cls.growthMult.knowledge * om("knowledge") * n) + equipmentBonus(this, "knowledge") + setStatBonus(this, "knowledge") + (this.battleScholarBonus || 0) + (this.archiveEternalKnowledgeBonus || 0);
    this.speed = BASE_SPEED + (race.speedMod || 0) + (pb.speed || 0) + Math.round(PLAYER_SECONDARY_GROWTH_RATE * cls.secondaryMult.speed * om("speed") * n) + (this.scoutDeepenBonus || 0) + equipmentBonus(this, "speed") + setStatBonus(this, "speed");
    this.accuracy = BASE_ACCURACY + (race.accuracyMod || 0) + (pb.accuracy || 0) + Math.round(PLAYER_SECONDARY_GROWTH_RATE * cls.secondaryMult.accuracy * om("accuracy") * n) + (this.scoutDeepenBonus || 0) + equipmentBonus(this, "accuracy") + setStatBonus(this, "accuracy");
    this.agility = BASE_AGILITY + (race.agilityMod || 0) + (pb.agility || 0) + Math.round(PLAYER_SECONDARY_GROWTH_RATE * cls.secondaryMult.agility * om("agility") * n) + (this.scoutDeepenBonus || 0) + equipmentBonus(this, "agility") + setStatBonus(this, "agility");
    // The Empty Hand (Artifact): fighting with no Off-Hand equipped is a
    // flat +50%/+25% multiplier, applied last on top of every other atk/
    // def source above (growth, gear, sets).
    if (hasEffect(this, "empty_hand") && !this.equipment.offhand) {
      this.atk = Math.round(this.atk * 1.5);
      this.def = Math.round(this.def * 1.25);
    }
    // Fatigue: going too long without a full sleep saps every combat/
    // utility stat (not max Health — this shouldn't put you at death's
    // door on its own, just make you worse at everything). Cleared by
    // cmdSleep updating lastSleptDay; see engine/time.js for the daily
    // narration and FATIGUE_TIERS below for the thresholds.
    const fatigue = fatigueTier(this);
    if (fatigue) {
      this.atk = Math.round(this.atk * fatigue.mult);
      this.def = Math.round(this.def * fatigue.mult);
      this.magic = Math.round(this.magic * fatigue.mult);
      this.knowledge = Math.round(this.knowledge * fatigue.mult);
      this.speed = Math.round(this.speed * fatigue.mult);
      this.accuracy = Math.round(this.accuracy * fatigue.mult);
      this.agility = Math.round(this.agility * fatigue.mult);
    }
    if (healOnGain) {
      this.health += Math.max(0, this.maxHealth - oldMaxHealth);
    } else {
      this.health = this.maxHealth;
    }
    this.health = Math.min(this.health, this.maxHealth);
    // Conduit Ascendant (Artifact): offers a one-time third-element choice
    // the instant a mage who already knows both elements gains this effect
    // (surfaced by the caller — see parser.js's cmdEquip); withdrawn if the
    // granting item is unequipped again before the choice is made.
    if (hasEffect(this, "conduit_ascendant") && this.primaryElement && this.secondaryElement && !this.tertiaryElement) {
      this.flags.pendingConduitAscendantChoice = true;
    } else if (!hasEffect(this, "conduit_ascendant")) {
      this.flags.pendingConduitAscendantChoice = false;
    }
  }

  // Adds XP and levels up as many times as the total earns (capped at
  // LEVEL_CAP), returning any level-up announcement lines for the caller
  // to print. A no-op once the level cap is reached.
  gainXp(amount) {
    const lines = [];
    if (this.level >= LEVEL_CAP || amount <= 0) return lines;
    this.xp += amount;
    lines.push(`(+${amount} XP)`);
    while (this.level < LEVEL_CAP && this.xp >= xpToNextLevel(this.level)) {
      this.xp -= xpToNextLevel(this.level);
      this.level += 1;
      this.recomputeStats(true);
      Events.emit("player.leveledUp", { newLevel: this.level, state: this });
      lines.push(`*** Level up! You are now level ${this.level}. ***`);
      if (this.level === 15 && this.flags.isMage && this.primaryElement && !this.flags.level15ChoiceMade) {
        this.flags.pendingLevel15Choice = true;
        lines.push(
          `You've reached a threshold few mages ever feel coming. Deepen your mastery of ${ELEMENTS[this.primaryElement].name} ` +
            `(type 'choose boost'), or open yourself to a second element (type 'choose <element>': ${elementList().join(", ")}).`
        );
      }
      if (this.level === 15 && this.class === "scout" && !this.flags.scoutLevel15ChoiceMade) {
        this.flags.pendingScoutLevel15Choice = true;
        lines.push(
          `You've reached a threshold few scouts ever feel coming. Deepen your instincts permanently (type 'choose deepen'), ` +
            `or learn to vanish at the first sign of a fight (type 'choose branch').`
        );
      }
      if (this.level === 15 && this.class === "apothecary" && !this.flags.apothecaryLevel15ChoiceMade) {
        this.flags.pendingApothecaryLevel15Choice = true;
        lines.push(
          `You've reached a threshold few apothecaries ever feel coming. Open your hands wider, so your care lands hardest on whoever ` +
            `else needs it (type 'choose attendant'), or turn your craft inward, where it counts most (type 'choose self reliant').`
        );
      }
    }
    return lines;
  }

  deriveNationFromLocation(locId) {
    const loc = getLocation(locId);
    return loc ? loc.nation : "sanguivorum";
  }

  currentLocation() {
    return getLocation(this.location);
  }

  // The specific place you've wandered into within the current city (see
  // world.js's `sublocations`), or null if you're at its main square/gate
  // — every city that hasn't been broken up into sublocations yet just
  // stays null forever.
  currentSublocation() {
    const loc = this.currentLocation();
    return loc && loc.sublocations && this.subLocation ? loc.sublocations[this.subLocation] || null : null;
  }

  // Whichever place actually gates rest/shop/guild access right now: the
  // specific sublocation if you're standing in one, otherwise the city
  // itself — unchanged behavior for every city without sublocations. Once
  // a city HAS been broken into sublocations, though, its own square no
  // longer inherits the city's flat services list — that's the whole
  // point of tying rest/shop/guild to specific buildings — so standing at
  // the square of a broken-up city offers nothing until you walk to the
  // right place.
  currentPlace() {
    const sub = this.currentSublocation();
    if (sub) return sub;
    const loc = this.currentLocation();
    if (loc && loc.sublocations) return { ...loc, services: [] };
    return loc;
  }

  visit(id) {
    this.visited.add(id);
  }

  toJSON() {
    return {
      saveVersion: SAVE_VERSION,
      playerName: this.playerName,
      race: this.race,
      origin: this.origin,
      class: this.class,
      pointBuy: this.pointBuy,
      scoutDeepenBonus: this.scoutDeepenBonus,
      nation: this.nation,
      location: this.location,
      level: this.level,
      xp: this.xp,
      atk: this.atk,
      def: this.def,
      health: this.health,
      maxHealth: this.maxHealth,
      magic: this.magic,
      knowledge: this.knowledge,
      speed: this.speed,
      accuracy: this.accuracy,
      agility: this.agility,
      magicBoost: this.magicBoost,
      primaryElement: this.primaryElement,
      secondaryElement: this.secondaryElement,
      tertiaryElement: this.tertiaryElement,
      // Permanent Artifact/Divine Regalia progression — recomputeStats folds
      // these into atk/def/maxHealth/magic/knowledge, so leaving them out of
      // the save wiped them on the first recompute after every load.
      battleScholarBonus: this.battleScholarBonus,
      livingLegacyBonus: this.livingLegacyBonus,
      soulLedgerCount: this.soulLedgerCount,
      soulLedgerHealthBonus: this.soulLedgerHealthBonus,
      soulLedgerMagicBonus: this.soulLedgerMagicBonus,
      soulLedgerDefBonus: this.soulLedgerDefBonus,
      archiveEternalSeen: this.archiveEternalSeen,
      archiveEternalKnowledgeBonus: this.archiveEternalKnowledgeBonus,
      stealthMod: this.stealthMod,
      gold: this.gold,
      inventory: this.inventory,
      equipment: this.equipment,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      lastSleptDay: this.lastSleptDay,
      subLocation: this.subLocation,
      flags: this.flags,
      visited: Array.from(this.visited),
      encounteredCreatures: Array.from(this.encounteredCreatures),
      knownRecipes: Array.from(this.knownRecipes),
      knownSchematics: Array.from(this.knownSchematics),
      knownFragments: this.knownFragments,
      reputation: this.reputation,
      activeJobs: this.activeJobs,
      activeTrack: this.activeTrack,
      activeDungeon: this.activeDungeon,
      kabalRoute: this.kabalRoute,
      activeInvestigation: this.activeInvestigation,
      investigationProgress: this.investigationProgress,
      boards: this.boards,
      shops: this.shops,
      party: this.party,
      fallenAllies: this.fallenAllies,
      divineFavor: this.divineFavor,
      arena: this.arena,
      runId: this.runId,
      deathLog: this.deathLog,
    };
  }

  static fromJSON(data) {
    const s = new GameState();
    Object.assign(s, data);
    // Saves from before fatigue existed have no lastSleptDay — treat them
    // as just having slept, rather than retroactively penalizing whatever
    // day count they'd already reached.
    if (data.lastSleptDay == null) s.lastSleptDay = s.day;
    // Saves from before the Grand Ovum existed have no `arena` at all —
    // the constructor's own default already covers that (Object.assign
    // above never touched it). A save mid-arena-development missing just
    // one newer sub-field still gets that field's default filled in.
    s.arena = Object.assign(defaultArenaState(), data.arena || {});
    // Same treatment for the routing-tree flags and faction meters: a save
    // from before a flag/faction existed gets its default, never undefined
    // (undefined + 1 is NaN, and a NaN engagementCount can never reach
    // KABAL_STORY_QUEST_THRESHOLD).
    s.kabalRoute = Object.assign(defaultKabalRoute(), data.kabalRoute || {});
    s.reputation = Object.assign(initialReputation(), data.reputation || {});
    for (const id of Object.keys(s.reputation)) {
      const v = Number(s.reputation[id]);
      s.reputation[id] = Number.isFinite(v) ? Math.max(-100, Math.min(100, v)) : 0;
    }
    // Non-fatal problems found while loading, for main.js to print once.
    s.loadWarnings = [];
    // Renamed location/ally keys (SAVE_KEY_MIGRATIONS above), then a hard
    // fallback if the location still doesn't exist — otherwise every
    // command that reads currentLocation() throws.
    const locMap = SAVE_KEY_MIGRATIONS.locations;
    if (locMap[s.location]) s.location = locMap[s.location];
    if (!getLocation(s.location)) {
      const origin = ORIGINS[s.origin];
      const fallback = origin && getLocation(origin.startLocation) ? origin.startLocation : "zuevaron";
      s.loadWarnings.push(`Your saved location ("${s.location}") no longer exists; you've been moved to ${getLocation(fallback).name}.`);
      s.location = fallback;
      s.subLocation = null;
    }
    const allyMap = SAVE_KEY_MIGRATIONS.allies;
    s.party = (data.party || []).map((a) => (allyMap[a.defId] ? { ...a, defId: allyMap[a.defId] } : a)).filter((a) => {
      if (ALLY_DEFS[a.defId]) return true;
      s.loadWarnings.push(`A companion in this save ("${a.name || a.defId}") no longer exists and was removed from the party.`);
      return false;
    });
    s.fallenAllies = (data.fallenAllies || []).map((f) => (allyMap[f.defId] ? { ...f, defId: allyMap[f.defId] } : f));
    // A NaN anywhere in a stat serializes as null — never let that load
    // back in as a 0-Health or null-Health character.
    if (!Number.isFinite(s.health)) s.health = Number.isFinite(s.maxHealth) ? s.maxHealth : BASE_HEALTH;
    s.party.forEach((a) => {
      if (!Number.isFinite(a.health)) a.health = Number.isFinite(a.maxHealth) ? a.maxHealth : BASE_HEALTH;
    });
    // data/jobs.js's id counter is module state, not saved state — on a
    // fresh page load it restarts at 1 and would mint ids that collide with
    // jobs already in this save (the job.completed listener filters by id,
    // so completing one would silently delete the other).
    reseedJobIdCounter(s);
    // Player deaths are never in the save itself (the game stops before
    // another save can happen) — pull them back in from the durable ledger
    // so reloading an earlier save doesn't erase that the death happened.
    if (!Array.isArray(s.deathLog)) s.deathLog = [];
    if (!s.runId) s.runId = "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); // pre-ledger save
    const known = new Set(s.deathLog.map((d) => d.id));
    for (const entry of readDeathLedger()) {
      if (entry.runId === s.runId && !known.has(entry.id)) s.deathLog.push({ ...entry, reloadedFromEarlierSave: true });
    }
    // Normalizes away anything that can't be a valid current sublocation:
    // saves from before this existed (undefined), a city that's never had
    // sublocations, or a stale id left over from a since-changed city.
    const cityAtLoad = getLocation(s.location);
    if (!cityAtLoad || !cityAtLoad.sublocations || !cityAtLoad.sublocations[s.subLocation]) {
      s.subLocation = null;
    }
    s.visited = new Set((data.visited || []).map((id) => locMap[id] || id));
    // Saves from before the Lore tab's Enemies category existed have no
    // encounteredCreatures at all — defaults to empty, same as a fresh
    // game (they just won't see past fights retroactively added).
    s.encounteredCreatures = new Set(data.encounteredCreatures || []);
    // Saves from before crafting existed have neither at all — same
    // empty-default treatment as encounteredCreatures above.
    s.knownRecipes = new Set(data.knownRecipes || []);
    s.knownSchematics = new Set(data.knownSchematics || []);
    if (Array.isArray(data.equipment)) {
      // Pre-slot save format: return those items to inventory rather than
      // losing them, and start with fresh (empty) slots.
      s.inventory = [...(data.inventory || []), ...data.equipment];
      s.equipment = emptyEquipment();
    } else {
      s.equipment = Object.assign(emptyEquipment(), data.equipment || {});
      if (!Array.isArray(s.equipment.trinkets)) s.equipment.trinkets = [];
    }
    s.combat = null;
    return s;
  }

  // Returns true on success. Keeps the previous save under a backup key so
  // one bad write (or a corrupt save) never costs the whole journey.
  save() {
    try {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_KEY + "_backup", previous);
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON()));
      return true;
    } catch (e) {
      console.error("Fragmenta: save failed", e);
      return false;
    }
  }

  static load() {
    for (const key of [SAVE_KEY, SAVE_KEY + "_backup"]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        // Pre-Race/Origin/Class saves (the old single `background` field)
        // are an intentional breaking change, not a migration target — see
        // data/origins.js's header. Treat one as if no save exists at all
        // rather than let fromJSON's blanket Object.assign hand back a
        // GameState with no race/class and crash the first time
        // recomputeStats runs.
        if (!data.race || !data.class) return null;
        const s = GameState.fromJSON(data);
        if (key !== SAVE_KEY) s.loadWarnings.push("Your main save was unreadable; the previous save was loaded instead.");
        return s;
      } catch (e) {
        console.error(`Fragmenta: could not load ${key}`, e);
      }
    }
    return null;
  }

  static hasSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      return !!(data.race && data.class);
    } catch (e) {
      return false;
    }
  }
}

// ---- Death tracking ----

const DEATH_LEDGER_KEY = "fragmenta_death_ledger";

function readDeathLedger() {
  try {
    const raw = localStorage.getItem(DEATH_LEDGER_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function recordDeath(state, entry) {
  const full = {
    id: "death_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    day: state.day,
    location: state.location,
    cause: state.combat ? state.combat.name || null : null,
    ...entry,
  };
  state.deathLog.push(full);
  return full;
}

// Called by main.js the moment the player's Health hits 0. Writes to the
// run's deathLog AND to a separate append-only localStorage ledger keyed
// by runId — so the death survives "refresh and load the last save"
// without this function deciding the permadeath question (it never
// touches the save slot itself).
function recordPlayerDeath(state) {
  const entry = recordDeath(state, { kind: "player", name: state.playerName });
  try {
    const ledger = readDeathLedger();
    ledger.push({ runId: state.runId, ...entry });
    localStorage.setItem(DEATH_LEDGER_KEY, JSON.stringify(ledger));
  } catch (e) {
    console.error("Fragmenta: could not write death ledger", e);
  }
  return entry;
}

function playerDeathCount(state) {
  return state.deathLog.filter((d) => d.kind === "player").length;
}

// Marks the most recent unresolved death of this ally with what the player
// chose ("sanctuary" | "left") or what happened later ("revived").
function resolveAllyDeath(state, defId, resolution) {
  for (let i = state.deathLog.length - 1; i >= 0; i--) {
    const d = state.deathLog[i];
    if (d.kind === "ally" && d.defId === defId && (!d.resolution || resolution === "revived")) {
      d.resolution = resolution;
      return;
    }
  }
}

// Recalculates an ally's atk/def/maxHealth/accuracy/agility/speed from
// scratch — ALLY_DEFS's flat mod + Math.round(growth * (level-1)), on top
// of the same BASE_* constants the player uses, plus whatever's in the
// ally's own equipment (equipmentBonus only ever reads its argument's
// .equipment field, so passing the ally object directly works exactly
// like passing `state` does for the player). Called on recruit, on every
// player level-up (allies share the player's level, at least until they
// have their own XP/quest-driven growth), and after any gear change.
// Mirrors GameState.recomputeStats's healOnGain behavior: gained max
// Health is added to current health, not just reset to full.
function recomputeAllyStats(ally, level) {
  const def = ALLY_DEFS[ally.defId];
  if (!def) return;
  const n = level - 1;
  const g = def.growth || {};
  const oldMaxHealth = ally.maxHealth || 0;
  ally.level = level;
  ally.atk = scaledStat("atk", BASE_ATK + (def.atkMod || 0) + Math.round((g.atk || 0) * n) + equipmentBonus(ally, "atk")); // v0.11 PLAYER_STAT_SCALE
  ally.def = scaledStat("def", BASE_DEF + (def.defMod || 0) + Math.round((g.def || 0) * n) + equipmentBonus(ally, "def")); // v0.11 PLAYER_STAT_SCALE
  ally.maxHealth = scaledStat("health", BASE_HEALTH + (def.healthMod || 0) + Math.round((g.health || 0) * n) + equipmentBonus(ally, "health")); // v0.11 PLAYER_STAT_SCALE
  ally.accuracy = BASE_ACCURACY + (def.accuracyMod || 0) + Math.round((g.accuracy || 0) * n) + equipmentBonus(ally, "accuracy");
  ally.agility = BASE_AGILITY + (def.agilityMod || 0) + Math.round((g.agility || 0) * n) + equipmentBonus(ally, "agility");
  ally.speed = BASE_SPEED + (def.speedMod || 0) + Math.round((g.speed || 0) * n) + equipmentBonus(ally, "speed");
  // Magic/Knowledge: unused by Kessa (no def.magicMod/knowledgeMod, so
  // both stay at BASE_* for her, same no-op as before this existed) but
  // needed for Hadrian's stat sheet (data/hadrian.js) — nothing in
  // combat reads an ally's Magic/Knowledge today, so these are inert
  // numbers for now, kept accurate for anything that reads them later.
  ally.magic = scaledStat("magic", BASE_MAGIC + (def.magicMod || 0) + Math.round((g.magic || 0) * n) + equipmentBonus(ally, "magic")); // v0.11 PLAYER_STAT_SCALE
  ally.knowledge = BASE_KNOWLEDGE + (def.knowledgeMod || 0) + Math.round((g.knowledge || 0) * n) + equipmentBonus(ally, "knowledge");
  if (ally.health == null) {
    ally.health = ally.maxHealth;
  } else {
    ally.health = Math.min(ally.health + Math.max(0, ally.maxHealth - oldMaxHealth), ally.maxHealth);
  }
}

// Listener: allies share the player's level, so every level-up recomputes
// each party member's stats too — a pure side effect with nothing to
// print, so it's a listener rather than an inline call inside gainXp.
Events.on("player.leveledUp", ({ newLevel, state }) => {
  state.party.forEach((ally) => recomputeAllyStats(ally, newLevel));
});
