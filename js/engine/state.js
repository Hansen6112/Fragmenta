/*
 * FRAGMENTA — Game State
 */

const BASE_ATK = 5;
const BASE_DEF = 2;
const BASE_HEALTH = 20;
const BASE_MAGIC = 3;
const BASE_KNOWLEDGE = 3;
const BASE_SPEED = 5;
const BASE_ACCURACY = 5;
const BASE_AGILITY = 5;

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

class GameState {
  constructor() {
    this.playerName = "Wanderer";
    this.background = null;
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
    this.combat = null; // { creatureId, hp, name } when engaged
    this.knownFragments = 0;
    this.reputation = initialReputation(); // factionId -> -100..100, all 0 until a background is applied
    this.activeJobs = [];
    this.boards = {}; // locationId -> { jobs: [...], lastRefresh: day }
    this.shops = {}; // locationId -> { stock: [...itemNames], lastRefresh: day } — see engine/shop.js
    this.party = []; // recruited allies — see recruitAlly/recomputeAllyStats below
    this.fallenAllies = []; // { defId, name, level, diedDay } — bodies sent to the Sanctuary, awaiting revival (see parser.js)
    this.divineFavor = 0; // standing with the Pantheon's god of Death and Renewal — one of three revival paths
    // The Grand Ovum (engine/arena.js) — Ovum Reputation ("Fame") is a
    // hidden 0-100 tracker, entirely separate from the nation `reputation`
    // above; only ever shown to the player through the rank it crosses
    // into, never as a raw number.
    this.arena = {
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

  // Adds a new party member from ALLY_DEFS, at the player's current level,
  // with empty gear and an aggressive default stance. Returns null (and
  // adds nothing) if that ally is already in the party or the id is
  // unknown — the caller (parser.js's cmdRecruit) is responsible for any
  // recruitment gating; this just does the actual joining.
  recruitAlly(defId) {
    if (!ALLY_DEFS[defId] || this.party.some((a) => a.defId === defId)) return null;
    const ally = {
      defId,
      name: ALLY_DEFS[defId].name,
      level: this.level,
      stance: "aggressive",
      equipment: emptyEquipment(),
      alive: true,
    };
    recomputeAllyStats(ally, this.level);
    ally.health = ally.maxHealth;
    this.party.push(ally);
    return ally;
  }

  // Applies a chosen background's stats, kit, location, and flags. Called
  // once at character creation (see main.js beginCharacter).
  applyBackground(bgKey) {
    const bg = BACKGROUNDS[bgKey];
    this.background = bgKey;
    this.level = 1;
    this.xp = 0;
    this.magicBoost = 0;
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
    this.arena = {
      participant: false, reputation: 0, rank: "copper", streak: 0, championDefeated: false,
      championHintGiven: false, tournamentRound: 0, tournamentTotal: 0, tournamentPurseAccrued: 0,
    };
    this.stealthMod = bg.stealthMod || 0;
    this.gold = bg.gold;
    this.inventory = [...bg.inventory];
    this.equipment = emptyEquipment();
    this.flags = { ...bg.flags };
    this.nation = bg.nation || this.deriveNationFromLocation(bg.startLocation);
    this.location = bg.startLocation;
    this.reputation = initialReputation(bg.reputation);
    this.recomputeStats(false); // false = full heal to new max, not a level-up top-up
  }

  // Recalculates atk/def/maxHealth/magic/knowledge from scratch (base +
  // background mod + Math.round(growth * (level-1)) + equipped gear's
  // bonuses) — always derived from current level/gear rather than
  // accumulated incrementally, so there's no rounding drift across many
  // level-ups, and equipping/unequipping is just another recompute rather
  // than a separate code path. `healOnGain` controls what happens to
  // current health when maxHealth changes: on level-up or a gear change,
  // the gained amount is added to current health (you feel stronger, not
  // proportionally weaker); at character creation, health is simply set
  // to the new max (full heal). Either way, health is clamped to the new
  // max afterward — unequipping a +Health item can lower the ceiling
  // below current health.
  recomputeStats(healOnGain) {
    const bg = BACKGROUNDS[this.background];
    if (!bg) return;
    const n = this.level - 1;
    const growth = bg.growth || {};
    const oldMaxHealth = this.maxHealth;
    this.atk = BASE_ATK + (bg.atkMod || 0) + Math.round((growth.atk || 0) * n) + equipmentBonus(this, "atk") + setStatBonus(this, "atk") + (this.flags.vanguardMomentumStacks || 0) + (this.flags.victorsMomentumStacks || 0);
    this.def = BASE_DEF + (bg.defMod || 0) + Math.round((growth.def || 0) * n) + equipmentBonus(this, "def") + setStatBonus(this, "def") + (this.soulLedgerDefBonus || 0);
    this.maxHealth = BASE_HEALTH + (bg.healthMod || 0) + Math.round((growth.health || 0) * n) + equipmentBonus(this, "health") + setStatBonus(this, "health") + (this.livingLegacyBonus || 0) + (this.soulLedgerHealthBonus || 0);
    this.magic = BASE_MAGIC + (bg.magicMod || 0) + Math.round((growth.magic || 0) * n) + (this.magicBoost || 0) + equipmentBonus(this, "magic") + setStatBonus(this, "magic") + (this.flags.passingWhisperStacks || 0) + (this.soulLedgerMagicBonus || 0);
    this.knowledge = BASE_KNOWLEDGE + (bg.knowledgeMod || 0) + Math.round((growth.knowledge || 0) * n) + equipmentBonus(this, "knowledge") + setStatBonus(this, "knowledge") + (this.battleScholarBonus || 0) + (this.archiveEternalKnowledgeBonus || 0);
    this.speed = BASE_SPEED + (bg.speedMod || 0) + Math.round((growth.speed || 0) * n) + equipmentBonus(this, "speed") + setStatBonus(this, "speed");
    this.accuracy = BASE_ACCURACY + (bg.accuracyMod || 0) + Math.round((growth.accuracy || 0) * n) + equipmentBonus(this, "accuracy") + setStatBonus(this, "accuracy");
    this.agility = BASE_AGILITY + (bg.agilityMod || 0) + Math.round((growth.agility || 0) * n) + equipmentBonus(this, "agility") + setStatBonus(this, "agility");
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
      playerName: this.playerName,
      background: this.background,
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
      knownFragments: this.knownFragments,
      reputation: this.reputation,
      activeJobs: this.activeJobs,
      boards: this.boards,
      shops: this.shops,
      party: this.party,
      fallenAllies: this.fallenAllies,
      divineFavor: this.divineFavor,
      arena: this.arena,
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
    s.arena = Object.assign({
      participant: false, reputation: 0, rank: "copper", streak: 0, championDefeated: false,
      championHintGiven: false, tournamentRound: 0, tournamentTotal: 0, tournamentPurseAccrued: 0,
    }, data.arena || {});
    // Normalizes away anything that can't be a valid current sublocation:
    // saves from before this existed (undefined), a city that's never had
    // sublocations, or a stale id left over from a since-changed city.
    const cityAtLoad = getLocation(s.location);
    if (!cityAtLoad || !cityAtLoad.sublocations || !cityAtLoad.sublocations[s.subLocation]) {
      s.subLocation = null;
    }
    s.visited = new Set(data.visited || []);
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

  save() {
    localStorage.setItem("fragmenta_save", JSON.stringify(this.toJSON()));
  }

  static load() {
    const raw = localStorage.getItem("fragmenta_save");
    if (!raw) return null;
    try {
      return GameState.fromJSON(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  static hasSave() {
    return !!localStorage.getItem("fragmenta_save");
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
  ally.atk = BASE_ATK + (def.atkMod || 0) + Math.round((g.atk || 0) * n) + equipmentBonus(ally, "atk");
  ally.def = BASE_DEF + (def.defMod || 0) + Math.round((g.def || 0) * n) + equipmentBonus(ally, "def");
  ally.maxHealth = BASE_HEALTH + (def.healthMod || 0) + Math.round((g.health || 0) * n) + equipmentBonus(ally, "health");
  ally.accuracy = BASE_ACCURACY + (def.accuracyMod || 0) + Math.round((g.accuracy || 0) * n) + equipmentBonus(ally, "accuracy");
  ally.agility = BASE_AGILITY + (def.agilityMod || 0) + Math.round((g.agility || 0) * n) + equipmentBonus(ally, "agility");
  ally.speed = BASE_SPEED + (def.speedMod || 0) + Math.round((g.speed || 0) * n) + equipmentBonus(ally, "speed");
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
