/*
 * FRAGMENTA — Game State
 */

class GameState {
  constructor() {
    this.playerName = "Wanderer";
    this.nation = "sanguivorum";
    this.location = "zuevaron";
    this.health = 20;
    this.maxHealth = 20;
    this.gold = 25;
    this.inventory = ["a traveler's cloak", "a half-empty waterskin", "a few days' rations"];
    this.day = 1;
    this.flags = {};
    this.visited = new Set();
    this.combat = null; // { creatureId, hp, name } when engaged
    this.knownFragments = 0;
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
      nation: this.nation,
      location: this.location,
      health: this.health,
      maxHealth: this.maxHealth,
      gold: this.gold,
      inventory: this.inventory,
      day: this.day,
      flags: this.flags,
      visited: Array.from(this.visited),
      knownFragments: this.knownFragments,
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
