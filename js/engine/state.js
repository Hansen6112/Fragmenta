/*
 * FRAGMENTA — Game State
 */

const BASE_ATK = 5;
const BASE_DEF = 2;
const BASE_HEALTH = 20;

class GameState {
  constructor() {
    this.playerName = "Wanderer";
    this.background = null;
    this.nation = "sanguivorum";
    this.location = "zuevaron";
    this.atk = BASE_ATK;
    this.def = BASE_DEF;
    this.maxHealth = BASE_HEALTH;
    this.health = BASE_HEALTH;
    this.stealthMod = 0;
    this.gold = 25;
    this.inventory = ["a traveler's cloak", "a half-empty waterskin", "a few days' rations"];
    this.day = 1;
    this.flags = {};
    this.visited = new Set();
    this.combat = null; // { creatureId, hp, name } when engaged
    this.knownFragments = 0;
    this.reputation = initialReputation(); // factionId -> -100..100, all 0 until a background is applied
  }

  // Applies a chosen background's stats, kit, location, and flags. Called
  // once at character creation (see main.js beginCharacter).
  applyBackground(bgKey) {
    const bg = BACKGROUNDS[bgKey];
    this.background = bgKey;
    this.atk = BASE_ATK + (bg.atkMod || 0);
    this.def = BASE_DEF + (bg.defMod || 0);
    this.maxHealth = BASE_HEALTH + (bg.healthMod || 0);
    this.health = this.maxHealth;
    this.stealthMod = bg.stealthMod || 0;
    this.gold = bg.gold;
    this.inventory = [...bg.inventory];
    this.flags = { ...bg.flags };
    this.nation = bg.nation || this.deriveNationFromLocation(bg.startLocation);
    this.location = bg.startLocation;
    this.reputation = initialReputation(bg.reputation);
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
      atk: this.atk,
      def: this.def,
      health: this.health,
      maxHealth: this.maxHealth,
      stealthMod: this.stealthMod,
      gold: this.gold,
      inventory: this.inventory,
      day: this.day,
      flags: this.flags,
      visited: Array.from(this.visited),
      knownFragments: this.knownFragments,
      reputation: this.reputation,
    };
  }

  static fromJSON(data) {
    const s = new GameState();
    Object.assign(s, data);
    s.visited = new Set(data.visited || []);
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
