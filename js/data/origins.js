/*
 * FRAGMENTA — Origins
 * Origin supplies everything the old Background bundle used to carry
 * *besides* flat stats and combat-kit/growth-shape (those are Race and
 * Class now, see data/races.js / data/classes.js): starting nation, start
 * location, starting gold/kit, a reputation seed, intro flavor text, and a
 * small secondary growth-multiplier nudge on top of Class's own (bigger)
 * one — same relationship data/creaturetags.js's Danger Class multiplier
 * has to Archetype: real, but never the dominant shape.
 *
 * Every regular Origin belongs to exactly one Race's list (raceKey) — per
 * design, this is about which stories read naturally for that Race, not a
 * mechanical restriction (a Race can still freely take any Class). Two
 * Origins are special and available to every Race, sharing one mechanical
 * template each (introByRace only changes the flavor text) — picking one
 * *forces* the matching Class rather than leaving Class to choose:
 * kabalRecruit -> Class "mage", norrvaelFled -> Class "bruise". This is
 * the direct continuation of the old `novitiate`/`bruise` Backgrounds,
 * which were both isMage:true and differed only in reputation/flags/start
 * location — same split, now framed as Origin-driven instead of a Class
 * that happened to override Origin.
 *
 * All start locations below are verified real ids in data/world.js,
 * cross-checked (v0.2 of the world-geography correction pass) against the
 * project's own master city-reference list by nation. Norrvael-fled uses
 * `drakenholm` (Norrvael's capital, seat of House Dravenkov).
 *
 * growthMult entries are optional per-stat multipliers (any of atk/def/
 * health/magic/knowledge/speed/accuracy/agility); anything not listed
 * defaults to 1 in engine/state.js's recomputeStats.
 */

const ORIGINS = {
  // ---------------------------------------------------------------- Human
  human_legionary: {
    name: "Sanguivorum Legionary",
    raceKey: "human",
    tagline: "A soldier of the Empire of the Meadows, off the leash for the first time in years.",
    nation: "sanguivorum",
    startLocation: "arethon",
    gold: 15,
    inventory: ["a short sword", "a legion-issue shield", "a few days' rations"],
    reputation: { sanguivorum: "friendly", vaeloris: "cold", sahrimor: "hostile" },
    growthMult: { atk: 1.1 },
    intro:
      "Twelve years drilled into the same maxim as every other Legionary: a citizen is a tool that knows itself. You know exactly what tool you are. Lately you've started wondering if that's a problem.",
  },
  human_mercenary: {
    name: "Sahrimor Mercenary",
    raceKey: "human",
    tagline: "A hired blade out of the Mugamiir Safor, between contracts.",
    nation: "sahrimor",
    startLocation: "sahurim",
    gold: 40,
    inventory: ["a curved desert blade", "a waterskin", "a contract chit from the Mugamiir Safor"],
    reputation: { sahrimor: "friendly", sanguivorum: "hostile", mugamiir_safor: "friendly", magma_hearth: "cold" },
    growthMult: { speed: 1.1 },
    intro:
      "You've made a living the Sahrimori way: for the right price, through the right guild. The Mugamiir Safor took its cut and pointed you at whatever paid. This time you're between contracts, and your coin purse is doing the talking.",
  },
  human_ashfeld_settler: {
    name: "Thraekor Ashfeld Settler",
    raceKey: "human",
    tagline: "One of the few humans the Ash Confederation let put down roots.",
    nation: "thraekor",
    startLocation: "khar_athel",
    gold: 12,
    inventory: ["a worn traveler's pack", "a letter of introduction to the Stillwarden's court", "a firestarting kit"],
    reputation: { thraekor: "friendly" },
    growthMult: { def: 1.1 },
    intro:
      "You came to Khar-Athel as a trader's apprentice and never quite left. Thraekor doesn't naturalize outsiders easily, but endurance is the one virtue it actually respects, and you had enough of it to be let stay.",
  },

  // ------------------------------------------------------------ DragonKin
  dragonkin_triarchy_voice: {
    name: "Vaeloris Triarchy Voice",
    raceKey: "dragonkin",
    tagline: "A seated voice in the Arbor's triarchy of elves, lizardfolk, and dragonborn.",
    nation: "vaeloris",
    startLocation: "the_arbor",
    gold: 15,
    inventory: ["a triarchy voice-token", "a woven cloak in Vaeloris green", "a small carved figure of Sylvorn Vaelithar"],
    reputation: { vaeloris: "friendly" },
    growthMult: { magic: 1.12 },
    intro:
      "You grew up in the Arbor's upper branches, one of the DragonKin voices Sylvorn Vaelithar's triarchy is built on. The Witnessed have watched you your whole life. You've started to feel watched back.",
  },
  dragonkin_emberkin: {
    name: "Thraekor Emberkin",
    raceKey: "dragonkin",
    tagline: "A DragonKin who found Thraekor's ash and fire more like home than the Arbor's canopy.",
    nation: "thraekor",
    startLocation: "khar_athel",
    gold: 12,
    inventory: ["an ash-tempered hand-axe", "a heat-cured hide vest", "a clan token"],
    reputation: { thraekor: "friendly", sanguivorum: "cold" },
    growthMult: { atk: 1.12 },
    intro:
      "Khar-Athel's volcano never bothered you the way it bothers most visitors — if anything, the heat felt like something you recognized. The Stillwarden's clan took that as a sign worth trusting.",
  },
  dragonkin_wanderer: {
    name: "Sanguivorum Wanderer",
    raceKey: "dragonkin",
    tagline: "A DragonKin who did a stint in the Empire's Legions and kept walking after.",
    nation: "sanguivorum",
    startLocation: "arethon",
    gold: 15,
    inventory: ["a short sword", "a legionary's discharge papers", "a few days' rations"],
    reputation: { sanguivorum: "friendly" },
    growthMult: { knowledge: 1.1 },
    intro:
      "The Legion took you the way it takes anyone useful, DragonKin or not, and taught you its maxims along with everyone else. You served your term, took your discharge, and never quite stopped moving.",
  },

  // ----------------------------------------------------------- Lizardfolk
  lizardfolk_hegemony: {
    name: "Swamp Hegemony Enclave",
    raceKey: "lizardfolk",
    tagline: "Born in Drath Vorrumbruk, the deep swamp heart of the Lizardfolk-held Hegemony.",
    nation: "vaeloris",
    startLocation: "drath_vorrumbruk",
    gold: 8,
    inventory: ["a reed-woven satchel", "a bone-hooked fishing spear", "a jar of preserved swamp herbs"],
    reputation: { vaeloris: "friendly" },
    growthMult: { def: 1.12 },
    intro:
      "Drath Vorrumbruk doesn't show itself to outsiders — you never needed it to. You grew up in the true swamp heart of the Hegemony, where Druith the Ancient still sleeps and the Great Lizard is said to speak in a tongue older than any nation's, guiding it the way every Lizardfolk child eventually learns to.",
  },
  lizardfolk_triarchy: {
    name: "Arbor Triarchy",
    raceKey: "lizardfolk",
    tagline: "A seated voice in the Arbor's triarchy, same standing as its elves and dragonborn.",
    nation: "vaeloris",
    startLocation: "the_arbor",
    gold: 15,
    inventory: ["a triarchy voice-token", "a woven cloak in Vaeloris green", "a horn of hardened resin"],
    reputation: { vaeloris: "friendly" },
    growthMult: { atk: 1.1 },
    intro:
      "You hold a seat in the same triarchy the elves and dragonborn do, under Sylvorn Vaelithar's rule from the Arbor's branches. Fewer of your own kind visit the canopy than the swamp, but the standing is real.",
  },
  lizardfolk_diaspora: {
    name: "Sahrimor Desert Diaspora",
    raceKey: "lizardfolk",
    tagline: "Swamp-born, desert-hardened — one of the few Lizardfolk the Mugamiir Safor bothers to hire.",
    nation: "sahrimor",
    startLocation: "sahurim",
    gold: 20,
    inventory: ["a curved desert blade", "a waterskin", "a contract chit from the Mugamiir Safor"],
    reputation: { sahrimor: "friendly", vaeloris: "cold" },
    growthMult: { accuracy: 1.1 },
    intro:
      "You left the swamp for the desert on a bet with yourself, and the Mugamiir Safor turned out to pay better than anything back home. Sahurim's heat is nothing next to the Hegemony's damp.",
  },

  // ------------------------------------------------------------------ Elf
  elf_thornwatch: {
    name: "Vaeloris Thornwatch",
    raceKey: "elf",
    tagline: "A forest ranger of the Rooted Legion, more at home in the canopy than the court.",
    nation: "vaeloris",
    startLocation: "the_arbor",
    gold: 12,
    inventory: ["a hunting bow", "a quiver of arrows", "forest-worn boots"],
    reputation: { vaeloris: "friendly", sanguivorum: "cold" },
    growthMult: { accuracy: 1.12 },
    intro:
      "You've spent more nights under the Arbor's canopy than under any roof. The Thornwatch trained you to move where the forest doesn't want to be moved through, and to notice things the oracles never bother looking down to see.",
  },
  elf_scholar: {
    name: "Sanguivorum Scholar",
    raceKey: "elf",
    tagline: "An elf who traded the Arbor's canopy for the Empire's archives.",
    nation: "sanguivorum",
    startLocation: "arethon",
    gold: 15,
    inventory: ["a scholar's satchel", "a letter of introduction to Arethon's registry", "a few days' rations"],
    reputation: { sanguivorum: "friendly" },
    growthMult: { knowledge: 1.1 },
    intro:
      "The Empire's archives don't care much what species catalogs them, and you found you had a talent for it the Arbor never gave you much use for. Arethon's registry has been your whole world for years now.",
  },
  elf_wanderer: {
    name: "Sahrimor Wanderer",
    raceKey: "elf",
    tagline: "An elf who took the Mugamiir Safor's coin and never went back to the canopy.",
    nation: "sahrimor",
    startLocation: "sahurim",
    gold: 18,
    inventory: ["a curved desert blade", "a waterskin", "a contract chit from the Mugamiir Safor"],
    reputation: { sahrimor: "friendly" },
    growthMult: { magic: 1.1 },
    intro:
      "Sahurim's caravan roads suited you better than the Arbor's stillness ever did. The Mugamiir Safor doesn't ask where a contractor is from, only whether the work gets done.",
  },

  // ---------------------------------------------------------------- Dwarf
  dwarf_clanwarrior: {
    name: "Thraekor Clan Warrior",
    raceKey: "dwarf",
    tagline: "A dwarf of the Ash Confederation, raised on the principle that endurance is the only virtue that counts.",
    nation: "thraekor",
    startLocation: "khar_athel",
    gold: 10,
    inventory: ["a dwarven hand-axe", "ash-worn leathers", "a clan token"],
    reputation: { thraekor: "friendly" },
    growthMult: { def: 1.12 },
    intro:
      "What remains after everything burns — you were raised on the Ash Principle the way other children are raised on lullabies. Thraekor doesn't produce many people who flinch. You were never given the option to be one of them.",
  },
  dwarf_emigrant: {
    name: "Sanguivorum Emigrant",
    raceKey: "dwarf",
    tagline: "A dwarf who left Thraekor's ash for the Empire's roads and never looked back.",
    nation: "sanguivorum",
    startLocation: "arethon",
    gold: 15,
    inventory: ["a short sword", "a legion-issue shield", "a few days' rations"],
    reputation: { sanguivorum: "friendly" },
    growthMult: { health: 1.1 },
    intro:
      "Thraekor's Ash Principle never sat right with you — you wanted something that lasted for a reason, not just out of stubbornness. The Empire's roads offered steadier ground, and you took it.",
  },
  dwarf_guildwright: {
    name: "Sahrimor Guildwright",
    raceKey: "dwarf",
    tagline: "A dwarf who put Thraekor's craftsmanship to work for the Mugamiir Safor instead.",
    nation: "sahrimor",
    startLocation: "sahurim",
    gold: 20,
    inventory: ["a set of guild-stamped tools", "a waterskin", "a contract chit from the Mugamiir Safor"],
    reputation: { sahrimor: "friendly" },
    growthMult: { knowledge: 1.1 },
    intro:
      "You learned your trade in Thraekor's forges, then sold it to whoever the Mugamiir Safor pointed you at. Sahurim's guilds pay better for good work than Khar-Athel ever did.",
  },

  // ---------------------------------------------------- Special: any Race
  kabal_recruit: {
    name: "Kabal Recruit",
    raceKey: null,
    tagline: "A mage-in-training, registered, tithed, and watched — Class is set to Mage.",
    forcedClass: "mage",
    nation: "kabal",
    startLocation: "kabal_tower",
    gold: 10,
    inventory: ["a novitiate's plain robe", "a Kabal registration token", "an unbonded conduit stone"],
    reputation: { kabal: "friendly" },
    introByRace: {
      human: "You are registered, tithed, and still years from a real Path. The Kabal Tower has been the whole of your world since you were found to have an affinity for a river you can't yet properly touch.",
      dragonkin: "The Kabal doesn't much care that your blood runs hotter than a human novitiate's — an affinity is an affinity. You are registered, tithed, and still years from a real Path, same as everyone else in the Tower.",
      lizardfolk: "Few of your kind ever leave the swamp for the Tower, which made the Kabal's interest in you feel less like an honor and more like a specimen jar. You are registered and tithed regardless.",
      elf: "You'd expected the Arbor's oracles to notice your affinity before the Kabal ever did. They didn't. The Tower did, and now you are registered, tithed, and still years from a real Path.",
      dwarf: "Thraekor doesn't send many of its own to the Kabal Tower, and the ones who go rarely come back. You are registered, tithed, and trying not to think about which one you'll turn out to be.",
    },
  },
  norrvael_fled: {
    name: "Fled to Norrvael",
    raceKey: null,
    tagline: "An unregistered mage, hunted on sight, gone to ground on the Isle of Silence and Drakes — Class is set to Bruise.",
    forcedClass: "bruise",
    nation: null,
    startLocation: "drakenholm",
    gold: 5,
    inventory: ["a stolen, half-bonded conduit", "a hooded traveler's cloak", "half a loaf of stale bread"],
    reputation: { kabal: "hostile", sanguivorum: "hostile" },
    flags: { wanted: true },
    introByRace: {
      human: "The Kabal has a word for what you are: Bruise. Unregistered, untithed, unsanctioned — killable on sight by anyone who can prove it. You ran until you ran out of mainland to run on, and Norrvael's mist took you in without asking questions.",
      dragonkin: "The Kabal has a word for what you are: Bruise, same as any unregistered mage, DragonKin blood or not. You ran until you ran out of mainland, and Norrvael's mist — and its own dragons — took you in without asking questions.",
      lizardfolk: "The Kabal has a word for what you are: Bruise. Unregistered, untithed, unsanctioned. The swamp couldn't hide you from a Tower that wanted to look hard enough, so you crossed the water instead, to Norrvael's mist.",
      elf: "The Kabal has a word for what you are: Bruise. The Arbor's oracles could have vouched for you and didn't. You ran until you ran out of mainland to run on, and Norrvael's mist took you in without asking questions.",
      dwarf: "The Kabal has a word for what you are: Bruise. Thraekor's clans don't shelter unregistered mages any better than anyone else does. You ran until you ran out of mainland to run on, and Norrvael's mist took you in without asking questions.",
    },
  },
};
