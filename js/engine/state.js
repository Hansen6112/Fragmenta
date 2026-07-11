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
    this.flags = {};
    this.visited = new Set();
    this.combat = null; // { creatureId, hp, name } when engaged
    this.knownFragments = 0;
    this.reputation = initialReputation(); // factionId -> -100..100, all 0 until a background is applied
    this.activeJobs = [];
    this.boards = {}; // locationId -> { jobs: [...], lastRefresh: day }
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
      flags: this.flags,
      visited: Array.from(this.visited),
      knownFragments: this.knownFragments,
      reputation: this.reputation,
      activeJobs: this.activeJobs,
      boards: this.boards,
    };
  }

  static fromJSON(data) {
    const s = new GameState();
    Object.assign(s, data);
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
