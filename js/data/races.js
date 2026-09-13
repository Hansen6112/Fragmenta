/*
 * FRAGMENTA — Races
 * Race replaces the flat-stats half of the old Background system (see
 * data/origins.js for the nation/kit/flavor half, and data/classes.js for
 * the combat-kit/growth half — character creation is now a Race -> Origin
 * -> Class sequence, not one fixed bundle). A Race is nothing but flat
 * starting stat modifiers on top of state.js's BASE_ATK/BASE_DEF/
 * BASE_HEALTH/BASE_MAGIC/BASE_KNOWLEDGE/BASE_SPEED/BASE_ACCURACY/
 * BASE_AGILITY — no growth-rate effect (growth is entirely Class/Origin
 * driven, see data/classes.js), and any Race can pick any Origin/Class.
 *
 * Every Race draws from the same fixed budget, spent at a flat 1 point per
 * stat point (2 HP per point, since health's base of 20 is much larger
 * than the ~5 base of everything else) — dumping a stat below 0 refunds 1
 * point per point dumped, spendable elsewhere. This keeps every Race an
 * equally-weighted trade-off rather than some Races just being strictly
 * more built-up than others.
 *
 * RACE_BUDGET is a first-pass number (scaled up from an initial, tighter
 * draft after checking real BESTIARY level-1 stats and finding common-tier
 * creatures already sit above the player's own accuracy/agility base) —
 * flagged as pending an actual playtest pass, same as the growth-model
 * constants in data/classes.js.
 */

const RACE_BUDGET = 9;

// Character-creation point-buy pool (main.js's ask_pointbuy boot stage /
// engine/state.js's applyCreation) — purely additive on top of Race
// values, capped at Race value + 4 per stat (health at Race value + 8,
// since it's bought at 2 HP per point instead of 1-for-1). First-pass
// number, same pending-playtest caveat as RACE_BUDGET above.
const POINT_BUY_POOL = 15;

const RACES = {
  human: {
    name: "Human",
    tagline: "No trick up the sleeve — steady, adaptable, at home anywhere.",
    atkMod: 1,
    defMod: 1,
    healthMod: 4,
    magicMod: 1,
    knowledgeMod: 2,
    speedMod: 0,
    accuracyMod: 2,
    agilityMod: 0,
    // spend 9 (atk1+def1+hp4/2=2+magic1+know2+acc2=9), refund 0 -> 9
  },
  dragonkin: {
    name: "DragonKin",
    tagline: "Part of the old triarchy blood — hot-tempered, hard-scaled, half a step from the old fire.",
    atkMod: 2,
    defMod: -1,
    healthMod: 4,
    magicMod: 3,
    knowledgeMod: 0,
    speedMod: 1,
    accuracyMod: 1,
    agilityMod: 1,
    // spend 10 (atk2+hp4/2=2+magic3+spd1+acc1+agi1=10), refund 1 (def) -> 9
  },
  lizardfolk: {
    name: "Lizardfolk",
    tagline: "Swamp-born strength — slow to think it through, impossible to put down.",
    atkMod: 3,
    defMod: 3,
    healthMod: 8,
    magicMod: -1,
    knowledgeMod: 0,
    speedMod: -1,
    accuracyMod: 2,
    agilityMod: -1,
    // spend 12 (atk3+def3+hp8/2=4+acc2=12), refund 3 (magic/spd/agi) -> 9
  },
  elf: {
    name: "Elf",
    tagline: "Precise, patient, and long past being impressed by anything that isn't.",
    atkMod: -1,
    defMod: -1,
    healthMod: 0,
    magicMod: 3,
    knowledgeMod: 3,
    speedMod: 2,
    accuracyMod: 2,
    agilityMod: 1,
    // spend 11 (magic3+know3+spd2+acc2+agi1=11), refund 2 (atk/def) -> 9
  },
  dwarf: {
    name: "Dwarf",
    tagline: "Built low, built heavy, built to still be standing when everything else has stopped.",
    atkMod: 2,
    defMod: 5,
    healthMod: 10,
    magicMod: -2,
    knowledgeMod: 2,
    speedMod: -2,
    accuracyMod: 0,
    agilityMod: -1,
    // spend 14 (atk2+def5+hp10/2=5+know2=14), refund 5 (magic/spd/agi) -> 9
  },
};
