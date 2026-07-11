/*
 * FRAGMENTA — Bestiary Data
 * Condensed from "A Naturalist's Compendium of Magical Creatures" (Ch. 13),
 * compiled in-world by Davin the Archivist DeVerre. `tags` (habitat) drive
 * random-encounter selection by terrain; `nations` restricts a creature to
 * specific nations/locations when given.
 *
 * hp/atk/def/spd here are each species' "Species Base" — the actual stats
 * used in a fight are computed per-encounter from these via
 * data/creaturetags.js's computeCreatureStats (level, Spawn Rarity,
 * Archetype, and Danger Class all scale from this base; see
 * engine/combat.js startCombat). `special: true` (e.g. kabal_enforcer)
 * marks a creature as quest/job-tied — exempt from that level roll/scaling
 * entirely, used exactly as authored below.
 *
 * `spawnRarity` (common/uncommon/rare/epic/unique, default common) governs
 * both stat growth rate and which levels a creature is even eligible to
 * appear at. Every creature here has an `archetype` and `dangerClass`
 * assigned except `special: true` ones (archetype/dangerClass would be
 * inert on those — see above). `flurry` is a separate, narrower flag —
 * see engine/combat.js resolveSpeedInitiative.
 *
 * No Epic-rarity creature exists yet (levels 15-19 sit between Rare's
 * ceiling and Unique's floor) — every creature strong enough to warrant
 * Boss/World Boss danger is also either a repeatable Rare (Dragon,
 * Diamond Tail, The Stitched) or a one-time-kill Unique (Druith, The
 * Ancient Flyer), not yet a distinct Epic tier. A future high-level
 * creature could fill that gap.
 */

const BESTIARY = {
  stoneback_beetle: {
    name: "Stoneback Beetle",
    native: "Keth-Rhovael",
    tags: ["urban", "forest", "desert", "cave", "continental"],
    hp: 6, atk: 2, def: 1, spd: 3, acc: 4, agi: 3,
    description: "A fist-sized, dark-shelled beetle, faintly luminescent at the abdomen. Rarely a threat alone — but corner a nest and hundreds of simultaneous defensive bites can kill an unprepared traveler.",
    combatNotes: "Swarms when threatened. Smoke is the best deterrent.",
    archetype: "skirmisher",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  mirrorfish: {
    name: "Mirrorfish",
    native: "Voreth-Sael",
    tags: ["river"],
    hp: 2, atk: 0, def: 0, spd: 4, acc: 2, agi: 5,
    description: "An ordinary-looking silver fish whose scales reflect magical workings back at whoever cast them. Not dangerous — the river it swims in might be.",
    combatNotes: "Not a combat creature.",
    archetype: "support",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  gloomhawk: {
    name: "Gloomhawk",
    native: "Rau-Nolveth",
    tags: ["mountain", "continental"],
    hp: 10, atk: 4, def: 2, spd: 9, acc: 7, agi: 7,
    description: "An eagle-sized raptor that dampens magic in a radius around itself and remembers every face that's wronged it — sometimes for days, sometimes across a continent.",
    combatNotes: "Suppresses magic nearby. Holds grudges; avoid provoking it twice.",
    archetype: "controller",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  cave_scorpion: {
    name: "Cave Scorpion",
    native: "Dhulorvae",
    tags: ["cave", "volcanic", "desert"],
    hp: 5, atk: 3, def: 2, spd: 7, acc: 6, agi: 6,
    description: "No longer than a forearm, but the venom is the danger, not the creature — effects vary sharply by region, from Sanguivorum's numbing-paralysis progression to Norrvael's blood-freezing sting.",
    combatNotes: "Venom effect varies by region. Treat promptly.",
    archetype: "assassin",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  ridgeback_boar: {
    name: "Ridgeback Boar",
    native: "Lorvaun-Nauri",
    tags: ["forest", "plains", "continental"],
    hp: 14, atk: 5, def: 3, spd: 6, acc: 5, agi: 4,
    description: "An ordinary boar with a crystalline ridge running spine to tusk. Elders learn the Somersault Charge — rolling the ridge in as a piercing weapon that goes through armor.",
    combatNotes: "Scarred adults may Somersault Charge — do not stand in a straight line with one.",
    archetype: "bruiser",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  thornhide: {
    name: "Thornhide",
    native: "Skrevak",
    tags: ["desert", "volcanic", "swamp"],
    hp: 18, atk: 5, def: 5, spd: 4, acc: 4, agi: 3,
    description: "A lizard that grows very large and armors itself with age. The bite carries a bacterial load that kills through infection faster than through damage.",
    combatNotes: "Clean any bite wound immediately and completely.",
    archetype: "tank",
    dangerClass: "normal",
    spawnRarity: "uncommon",
  },
  veilwing: {
    name: "Veilwing",
    native: "Voreth-Mauth",
    tags: ["mountain", "continental"],
    hp: 4, atk: 1, def: 1, spd: 6, acc: 5, agi: 7,
    description: "A large cold-loving moth whose wing-dust is a dose-response sedative. It will not chase you — it will put you to sleep where you stand if you give it reason to.",
    combatNotes: "Heavy exposure to wing dust causes fatal sleep. Fight from distance or not at all.",
    archetype: "controller",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  ashwyrm: {
    name: "Ashwyrm",
    native: "Velthrak",
    tags: ["volcanic", "desert"],
    hp: 6, atk: 8, def: 2, spd: 11, acc: 9, agi: 9,
    description: "A small slate-grey serpent with six retractable fangs, each carrying a distinct venom — combined, they convert blood to ash. Considered the deadliest small creature on the continent.",
    combatNotes: "A complete bite is fatal within minutes without antivenom. Avoid engagement entirely if possible.",
    archetype: "assassin",
    dangerClass: "elite",
    spawnRarity: "rare",
  },
  plainswolf: {
    name: "Plainswolf",
    native: "Kaeven-Thauln",
    tags: ["plains", "mountain"],
    hp: 8, atk: 4, def: 2, spd: 9, acc: 7, agi: 7,
    description: "Larger than an ordinary wolf, hunting in near-silent, well-coordinated packs of up to ten under a single alpha.",
    combatNotes: "Pack tactics — isolating one from the pack is dangerous.",
    archetype: "skirmisher",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  river_serpent: {
    name: "River Serpent",
    native: "Kaluath",
    tags: ["river", "swamp", "lake"],
    hp: 16, atk: 6, def: 3, spd: 7, acc: 7, agi: 6,
    description: "An 18-22 foot aquatic constrictor whose shimmering scales exert a subtle compulsion, drawing onlookers toward the water without their noticing.",
    combatNotes: "Discharges an electrical shock at close range before striking. Don't linger at the water's edge distracted.",
    archetype: "assassin",
    dangerClass: "normal",
    spawnRarity: "uncommon",
  },
  thunderbird: {
    name: "Thunderbird",
    native: "Rhovael-Rau",
    tags: ["coast", "sea"],
    hp: 20, atk: 7, def: 4, spd: 10, acc: 8, agi: 8,
    description: "A massive storm-grey raptor that generates its own localized, self-sustaining thunderstorm and can direct lightning at specific targets when threatened.",
    combatNotes: "Never approach during an active or building storm.",
    archetype: "artillery",
    dangerClass: "elite",
    spawnRarity: "rare",
    flurry: true, // rare + high Speed: keeps its normal retaliation even in a round it already acted first in (see engine/combat.js resolveSpeedInitiative)
  },
  drake: {
    name: "Drake",
    native: "Skrel-Drak",
    tags: ["mountain", "coast", "continental"],
    hp: 26, atk: 9, def: 6, spd: 9, acc: 8, agi: 7,
    description: "Diminished dragon-kin, reasoning and individual, common only in Norrvael. Breath type — fire, ice, acid, lightning, or scalding mist — is tied to parentage, not color.",
    combatNotes: "Genuinely intelligent; may be reasoned with, tested, or bonded rather than fought.",
    archetype: "bruiser",
    dangerClass: "elite",
    spawnRarity: "rare",
    flurry: true, // rare + high Speed: keeps its normal retaliation even in a round it already acted first in (see engine/combat.js resolveSpeedInitiative)
    monsterTag: "draven", // dragon-kin — see data/sets.js Drake Hunter set (Dragonslayer)
  },
  dragon: {
    name: "Dragon",
    native: "Draven-Drak",
    tags: ["mountain", "volcanic", "coast"],
    hp: 60, atk: 14, def: 10, spd: 8, acc: 10, agi: 5,
    description: "Vast, ancient, and only four credible successful combat engagements ever recorded. Withdrawal is the recommended encounter protocol, not engagement.",
    combatNotes: "Extreme danger. Fewer than a handful of parties have ever survived a fight with one.",
    archetype: "juggernaut",
    dangerClass: "world_boss",
    spawnRarity: "rare",
    flurry: true, // rare + high Speed: keeps its normal retaliation even in a round it already acted first in (see engine/combat.js resolveSpeedInitiative)
    monsterTag: "draven", // dragon-kin — see data/sets.js Drake Hunter set (Dragonslayer)
  },
  vampire_turned: {
    name: "The Turned",
    native: "Sul-Voran",
    tags: ["forest", "cave", "urban"],
    hp: 9, atk: 4, def: 2, spd: 5, acc: 4, agi: 4,
    description: "The first stage of the vampiric condition — still human in mind, growing irritable and blood-aware. Treatable within 48 hours of infection.",
    combatNotes: "Treat quickly: sunlight, blessed water, or Faith-path healing before the window closes.",
    archetype: "skirmisher",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  vampire_lesser: {
    name: "A Lesser",
    native: "Sul-Voran",
    tags: ["forest", "cave"],
    hp: 14, atk: 6, def: 3, spd: 8, acc: 6, agi: 6,
    description: "Feral and tactically dangerous, drawn to its own kind, subordinate to any Full-Blood nearby.",
    combatNotes: "Never engage alone. Eliminate flight capability first.",
    archetype: "bruiser",
    dangerClass: "normal",
    spawnRarity: "uncommon",
  },
  skeleton: {
    name: "Skeleton",
    native: "Sul-Keth",
    tags: ["ruin", "swamp", "cave"],
    hp: 8, atk: 3, def: 3, spd: 4, acc: 5, agi: 3,
    description: "Reanimated bone, silent and mechanical in its violence. A carved sigil bone anchors the animation.",
    combatNotes: "Target the sigil bone at the center of mass, or eliminate the necromancer maintaining it.",
    archetype: "bruiser",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  zombie: {
    name: "Zombie",
    native: "Sul-Daun",
    tags: ["ruin", "swamp"],
    hp: 12, atk: 3, def: 1, spd: 1, acc: 2, agi: 1,
    description: "Slow, aggressive, and dangerous mainly in numbers — fragments of undifferentiated spirit-material forced into dead flesh.",
    combatNotes: "Decapitation is the most reliable kill.",
    archetype: "bruiser",
    dangerClass: "normal",
    spawnRarity: "common",
  },
  animated_armor: {
    name: "Animated Armour",
    native: "Skarr-Daun",
    tags: ["ruin", "urban"],
    hp: 16, atk: 6, def: 6, spd: 3, acc: 5, agi: 2,
    description: "Worked metal given motion by enchantment carved directly into the plate. Higher tiers can adapt tactics mid-fight.",
    combatNotes: "Fire is the universal answer — enough heat distorts the metal and fails the enchantment.",
    archetype: "tank",
    dangerClass: "normal",
    spawnRarity: "uncommon",
  },
  golem_stone: {
    name: "Stone Golem",
    native: "Thueln-Maur",
    tags: ["ruin", "mountain"],
    hp: 24, atk: 6, def: 8, spd: 2, acc: 4, agi: 1,
    description: "A construct of animated stone, the most durable of the golem-kinds, requiring no maintenance if undamaged.",
    combatNotes: "Slow but relentless. No reasoning with it — check control status before engaging.",
    archetype: "tank",
    dangerClass: "normal",
    spawnRarity: "uncommon",
  },
  elemental_fire: {
    name: "Fire Elemental",
    native: "Soru-Daun Nori",
    tags: ["volcanic", "desert"],
    hp: 22, atk: 9, def: 4, spd: 8, acc: 7, agi: 6,
    description: "A spontaneous coalescence of magical saturation given flame and humanoid form. Fights with weapon and spell simultaneously.",
    combatNotes: "Must go fully physical to heal — force the choice between fighting and reconstituting.",
    archetype: "bruiser",
    dangerClass: "elite",
    spawnRarity: "rare",
  },
  elemental_ice: {
    name: "Ice Elemental",
    native: "Soru-Daun Kaul",
    tags: ["mountain", "continental", "tundra"],
    hp: 22, atk: 8, def: 5, spd: 5, acc: 6, agi: 4,
    description: "A coalescence of cold and magical density given shape. Proximity alone is hazardous.",
    combatNotes: "Fire and sustained heat are the effective counters.",
    archetype: "controller",
    dangerClass: "elite",
    spawnRarity: "rare",
  },
  banshee: {
    name: "Banshee",
    native: "Orvuin",
    tags: ["ruin"],
    hp: 10, atk: 10, def: 2, spd: 9, acc: 9, agi: 8,
    description: "Not a creature so much as a calcified stone holding the compressed dead of an unburied battlefield, projecting a spirit-form drawn from their memory.",
    combatNotes: "Conventional combat is nearly useless. Destroy the stone at range with magic, or don't engage.",
    archetype: "assassin",
    dangerClass: "elite",
    spawnRarity: "rare",
    flurry: true, // rare + high Speed: keeps its normal retaliation even in a round it already acted first in (see engine/combat.js resolveSpeedInitiative)
  },
  wraith: {
    name: "Wraith",
    native: "Mauven-Sulei",
    tags: ["ruin", "swamp"],
    hp: 14, atk: 8, def: 3, spd: 8, acc: 8, agi: 7,
    description: "A spirit that refused to cross the river at death, both hands permanently over its ruined face, hunting the places it remembers from life.",
    combatNotes: "Burn its physical remains before engaging if you can find them. Never fight one alone.",
    archetype: "assassin",
    dangerClass: "elite",
    spawnRarity: "rare",
  },
  stitched: {
    name: "The Stitched",
    native: "Voran-Daun",
    tags: ["ruin"],
    hp: 40, atk: 10, def: 6, spd: 3, acc: 6, agi: 2,
    description: "A body assembled from many bodies by an outlawed Bruised mage, driven by one or more carved hearts. Feels no pain.",
    combatNotes: "Every heart must be destroyed. Fire, shock, and cutting alone do nothing to stop it.",
    archetype: "juggernaut",
    dangerClass: "boss",
    spawnRarity: "rare",
  },
  diamond_tail: {
    name: "Diamond Tail",
    native: "Valdrek-Keth",
    tags: ["volcanic"],
    hp: 50, atk: 12, def: 12, spd: 2, acc: 6, agi: 1,
    description: "A living geological formation of fused rock and flesh, the size of a house, tipped in a tail it deliberately wields as a weapon.",
    combatNotes: "Not recommended without coordinated military and mage support. Territorial, not a hunter.",
    archetype: "tank",
    dangerClass: "boss",
    spawnRarity: "rare",
  },
  druith: {
    name: "Druith, the Ancient",
    native: "Druith",
    tags: ["swamp"],
    nations: ["vaeloris"],
    locations: ["drath_vorrumborrar", "the_swamps_near"],
    hp: 45, atk: 11, def: 14, spd: 1, acc: 7, agi: 1,
    description: "An impossibly old crocodile that declined to stop growing and has, so far, declined to die. Scales harder than worked metal. Protected fiercely by the lizardfolk — never approach without their escort.",
    combatNotes: "Nearly immobile on land unless truly provoked. Never enter the water near it unescorted.",
    archetype: "tank",
    dangerClass: "world_boss",
    spawnRarity: "unique",
  },
  maur_rau: {
    name: "The Ancient Flyer",
    native: "Maur-Rau",
    tags: ["mountain", "coast"],
    hp: 35, atk: 10, def: 9, spd: 6, acc: 8, agi: 4,
    description: "The largest known flying creature, armored in relics of a forgotten civilization, circumnavigating the continent on a slow, mappable circuit. Ignores everything beneath it except when feeding.",
    combatNotes: "Not hunting people. Move laterally if it's descending near you; it will not alter course.",
    archetype: "juggernaut",
    dangerClass: "boss",
    spawnRarity: "unique",
  },
  vaelorn: {
    name: "Vaelorn, a Grove Warden",
    native: "Vaelorn",
    tags: ["forest"],
    nations: ["vaeloris"],
    hp: 30, atk: 0, def: 20, spd: 1, acc: 1, agi: 1,
    description: "In stillness, an ancient tree. In motion, a tall bark-covered figure that has never been documented to harm a person, and often heals them unasked.",
    combatNotes: "Not a combat encounter. If a corrupted grove is ever found, its undead should never be approached alone.",
    archetype: "tank",
    dangerClass: "normal",
    friendly: true,
    spawnRarity: "unique",
  },
  kabal_enforcer: {
    name: "A Kabal Enforcer Patrol",
    native: "n/a — Kabal Martialum",
    // Deliberately NOT a terrain tag used by TERRAIN_TAGS — this creature
    // never enters the normal random-encounter pool. It's only ever spawned
    // by the Bruise-hunted mechanic in parser.js (checkKabalHunt).
    tags: ["kabal_hunt"],
    hp: 20, atk: 6, def: 5, spd: 6, acc: 6, agi: 5,
    description: "Kabal-trained enforcers, sent to bring in an unregistered practitioner — you — dead or restrained, whichever comes first.",
    combatNotes: "Winning doesn't clear your name. It just buys you time before the next patrol.",
    special: true,
  },
};

function creaturesForTags(tagList, nation) {
  return Object.entries(BESTIARY)
    .filter(([id, c]) => {
      if (c.nations && !c.nations.includes(nation)) return false;
      return c.tags.some((t) => tagList.includes(t));
    })
    .map(([id]) => id);
}

// Re-filters an already habitat/nation-matched creature id pool (from
// creaturesForTags) down to the ones whose Spawn Rarity band actually
// covers `level` (see data/creaturetags.js isLevelEligibleForRarity) —
// this is what makes the encounter pool skew toward rarer creatures as
// the player levels up. A PREFERENCE, not a hard requirement: if nothing
// in the pool is in-band at this level (e.g. no Epic-rarity creature
// exists yet, so levels 16-19 have a gap), falls back to the full
// unfiltered pool rather than silently producing zero encounters —
// whatever gets picked still gets its level clamped to its own band in
// startCombat, so it stays balanced either way.
function creaturesEligibleAtLevel(pool, level) {
  const eligible = pool.filter((id) => isLevelEligibleForRarity(level, BESTIARY[id].spawnRarity));
  return eligible.length ? eligible : pool;
}
