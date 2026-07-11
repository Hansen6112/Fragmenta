/*
 * FRAGMENTA — Starting Backgrounds
 * Who the player is before the story starts. Each background sets a
 * starting location/nation, a starting kit, starting stat modifiers
 * relative to the base stats (state.js BASE_ATK/BASE_DEF/BASE_HEALTH/
 * BASE_MAGIC/BASE_KNOWLEDGE/BASE_SPEED/BASE_ACCURACY/BASE_AGILITY), and a
 * `reputation` map — the qualitative *seed* for the numeric reputation
 * meter (see data/factions.js QUALITATIVE_TO_NUMERIC / state.reputation).
 * Faction ids used here must exist in FACTIONS (data/factions.js).
 *
 * `growth` is per-level stat gain (levels 1-25, see engine/leveling.js),
 * applied as Math.round(growth.stat * (level - 1)) on top of the starting
 * mod — this is what keeps a background's identity dominant all the way
 * to level 25 instead of every character converging toward the same
 * numbers: a fighter's atk/def/health growth vastly outpaces a mage's,
 * and vice versa for magic, while knowledge (tactical/spell options,
 * mechanically unused for now) is spread more broadly across archetypes.
 * speed (see engine/combat.js resolveSpeedInitiative) follows the identity
 * each background already has — Scout fastest, Clan Warrior slowest — and
 * decides turn order each combat round: whoever has the higher Speed acts
 * first (ties favor the player). accuracy/agility follow the same
 * identity-driven logic (Scout highest in both, Clan Warrior lowest in
 * agility) — see data/creaturetags.js for how they combine with Archetype
 * multipliers once the hit/miss mechanic that consumes them is built.
 *
 * reputation values: "friendly" | "neutral" | "cold" | "hostile"
 */

const BACKGROUNDS = {
  legionary: {
    name: "Sanguivorum Legionary",
    tagline: "A soldier of the Empire of the Meadows, off the leash for the first time in years.",
    nation: "sanguivorum",
    startLocation: "arethon",
    atkMod: 2,
    defMod: 1,
    healthMod: 4,
    magicMod: -2,
    knowledgeMod: 1,
    speedMod: 0,
    accuracyMod: 1,
    agilityMod: 0,
    growth: { atk: 0.6, def: 0.4, health: 1.2, magic: 0.05, knowledge: 0.4, speed: 0.3, accuracy: 0.35, agility: 0.25 },
    gold: 15,
    inventory: ["a short sword", "a legion-issue shield", "a few days' rations"],
    flags: { isLegionary: true },
    reputation: { sanguivorum: "friendly", vaeloris: "cold", sahrimor: "hostile" },
    intro:
      "You were a Legionary of Sanguivorum, twelve years drilled into the same maxim as everyone else: a citizen is a tool that knows itself. You know exactly what tool you are. Lately you've started wondering if that's a problem.",
  },
  mercenary: {
    name: "Sahrimor Mercenary",
    tagline: "A hired blade out of the Mugamiir Safor, between contracts.",
    nation: "sahrimor",
    startLocation: "sahurim",
    atkMod: 1,
    defMod: 0,
    healthMod: 0,
    magicMod: -1,
    knowledgeMod: 2,
    speedMod: 2,
    accuracyMod: 2,
    agilityMod: 2,
    growth: { atk: 0.5, def: 0.25, health: 0.8, magic: 0.05, knowledge: 0.5, speed: 0.45, accuracy: 0.45, agility: 0.4 },
    gold: 40,
    inventory: ["a curved desert blade", "a waterskin", "a contract chit from the Mugamiir Safor"],
    flags: { isMercenary: true },
    reputation: { sahrimor: "friendly", sanguivorum: "hostile", mugamiir_safor: "friendly", magma_hearth: "cold" },
    intro:
      "You've made a living the Sahrimori way: for the right price, and through the right guild. The Mugamiir Safor took its cut and pointed you at whatever paid — ruins, escorts, things people wanted found or wanted gone. This time you're between contracts, and your coin purse is doing the talking.",
  },
  novitiate: {
    name: "Kabal Arcani Novitiate",
    tagline: "A mage-in-training, registered, tithed, and watched.",
    nation: "kabal",
    startLocation: "kabal_tower",
    atkMod: -1,
    defMod: 0,
    healthMod: -2,
    magicMod: 4,
    knowledgeMod: 3,
    speedMod: 0,
    accuracyMod: 1,
    agilityMod: 0,
    growth: { atk: 0.15, def: 0.15, health: 0.6, magic: 0.8, knowledge: 0.6, speed: 0.25, accuracy: 0.3, agility: 0.2 },
    gold: 10,
    inventory: ["a novitiate's plain robe", "a Kabal registration token", "an unbonded conduit stone"],
    flags: { isMage: true, isNovitiate: true },
    reputation: { kabal: "friendly" },
    intro:
      "You are registered, tithed, and still years from a real Path. The Kabal Tower has been the whole of your world since you were found to have an affinity for a river you can't yet properly touch. You've heard the senior mages talk, when they think novitiates aren't listening. You've started listening more carefully.",
  },
  bruise: {
    name: "A Bruise",
    tagline: "An unregistered mage, hunted on sight, hiding at the world's edges.",
    nation: null,
    startLocation: "the_reednold",
    atkMod: 1,
    defMod: -1,
    healthMod: -2,
    magicMod: 3,
    knowledgeMod: 0,
    speedMod: 2,
    accuracyMod: 0,
    agilityMod: 2,
    growth: { atk: 0.3, def: 0.1, health: 0.6, magic: 0.75, knowledge: 0.4, speed: 0.4, accuracy: 0.3, agility: 0.4 },
    gold: 5,
    inventory: ["a stolen, half-bonded conduit", "a hooded traveler's cloak", "half a loaf of stale bread"],
    flags: { isMage: true, isBruise: true, wanted: true },
    reputation: { kabal: "hostile", sanguivorum: "hostile" },
    intro:
      "The Kabal has a word for what you are: Bruise. Unregistered, untithed, unsanctioned — killable on sight by anyone who can prove it. You didn't ask for the affinity any more than a novitiate does. You just didn't hand yourself in when you found it. Every city gate is a small bet against being recognized.",
  },
  scout: {
    name: "Vaeloris Thornwatch Scout",
    tagline: "A forest ranger of the Rooted Legion, more at home in the canopy than the court.",
    nation: "vaeloris",
    startLocation: "the_arbor",
    atkMod: 0,
    defMod: 1,
    healthMod: 2,
    magicMod: 0,
    knowledgeMod: 2,
    speedMod: 4,
    accuracyMod: 4,
    agilityMod: 3,
    growth: { atk: 0.4, def: 0.45, health: 0.8, magic: 0.15, knowledge: 0.65, speed: 0.6, accuracy: 0.6, agility: 0.55 },
    stealthMod: 0.35,
    gold: 12,
    inventory: ["a hunting bow", "a quiver of arrows", "forest-worn boots"],
    flags: { isScout: true },
    reputation: { vaeloris: "friendly", sanguivorum: "cold" },
    intro:
      "You've spent more nights under the Arbor's canopy than under any roof. The Thornwatch trained you to move where the forest doesn't want to be moved through, and to notice things the elves' oracles never bother looking down to see.",
  },
  clanwarrior: {
    name: "Thraekor Clan Warrior",
    tagline: "A dwarf of the Ash Confederation, raised on the principle that endurance is the only virtue that counts.",
    nation: "thraekor",
    startLocation: "khar_vantr",
    atkMod: 1,
    defMod: 2,
    healthMod: 4,
    magicMod: -1,
    knowledgeMod: 1,
    speedMod: -2,
    accuracyMod: 0,
    agilityMod: -2,
    growth: { atk: 0.5, def: 0.55, health: 1.3, magic: 0.05, knowledge: 0.35, speed: 0.2, accuracy: 0.25, agility: 0.2 },
    gold: 10,
    inventory: ["a dwarven hand-axe", "ash-worn leathers", "a clan token"],
    flags: { isClanWarrior: true },
    reputation: { thraekor: "friendly" },
    intro:
      "What remains after everything burns — you were raised on the Ash Principle the way other children are raised on lullabies. Thraekor doesn't produce many people who flinch. You were never given the option to be one of them.",
  },
};
