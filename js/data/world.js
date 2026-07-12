/*
 * FRAGMENTA — World Data
 * Reconciled from: hand-drawn world map, Continental Geography & Travel
 * Reference, and the Master World Reference. Where the map's spelling and
 * the geography doc's spelling differ (e.g. "Zuevaron" / "Zaeveon"), the
 * map's spelling is used as the canonical display name and the doc's
 * mechanical data (terrain, distance, danger) is attached to it.
 *
 * Travel time is stored in in-game "days" — a compressed abstraction of the
 * geography doc's mile/mi-per-day tables, tuned for pacing rather than
 * simulation accuracy.
 */

const NATIONS = {
  sanguivorum: {
    name: "Sanguivorum",
    title: "The Empire of the Meadows",
    blurb: "Twelve cities, twelve Legions, five hundred seventy years of open-meadow order under Imperator Civis Alastair. “A citizen is a tool that knows itself.” Ingenum-engineered roads make Sanguivorum the easiest nation on the continent to cross — and the easiest to be watched in.",
    terrainDefault: "plains",
  },
  vaeloris: {
    name: "Vaeloris",
    title: "The Ancient Forest & the Swamp Hegemony",
    blurb: "Elf, lizardfolk, and dragonborn share an uneasy triarchy beneath the endless canopy, centered on the Arbor — the largest tree in existence. The forest paths are old and deliberately non-intuitive; the swamp beyond the Confluence answers to no one but the lizardfolk who guide it.",
    terrainDefault: "forest",
  },
  sahrimor: {
    name: "Sahrimor",
    title: "The Desert Commercial Empire",
    blurb: "Built around the lake Eternatum, which should not exist where it does. Ruled by the Merchant King through water, trade law, and sanctioned violence. Nine cities, a hundred caravans, and the Black Sands swallowing every expedition that goes looking for what's buried there.",
    terrainDefault: "desert",
  },
  thraekor: {
    name: "Thraekor",
    title: "The Ash Confederation",
    blurb: "Dwarven clanholds dug into a live volcanic range, built on the bones of a dwarf-dragonborn empire that burned five hundred seventy-two years ago. “What remains after everything burns” is not a metaphor here — it's the only principle that's held.",
    terrainDefault: "volcanic",
  },
  norrvael: {
    name: "Norrvael",
    title: "The Isle of Silence and Drakes",
    blurb: "An island hidden behind a Mist that doesn't behave like weather, ruled three hundred years by House Dravenkov. Something old sleeps under the mountains here, and the drakes have started listening for it.",
    terrainDefault: "mountain",
  },
  kabal: {
    name: "The Golden Tear",
    title: "Sovereign Territory of the Gods' Hand Kabal",
    blurb: "A small neutral territory at the heart of the continent, bordered by Sanguivorum, Vaeloris, and Sahrimor, dominated by the thousand-foot obsidian Kabal Tower. No nation's law reaches here — only the Kabal's.",
    terrainDefault: "wasteland",
  },
};

// terrain -> base encounter danger tags used to pull bestiary entries
const TERRAIN_TAGS = {
  plains: ["plains", "continental"],
  forest: ["forest", "continental"],
  swamp: ["swamp", "continental"],
  river: ["river", "continental"],
  desert: ["desert", "continental"],
  canyon: ["desert", "canyon", "continental"],
  volcanic: ["volcanic", "cave", "continental"],
  mountain: ["mountain", "cave", "continental"],
  coast: ["coast", "sea", "continental"],
  sea: ["sea"],
  wasteland: ["ruin", "continental"],
  city: ["urban"],
  jungle: ["jungle", "forest", "continental"],
  tundra: ["tundra", "continental"],
  lake: ["lake", "river", "continental"],
};

const LOCATIONS = {
  // ---------------------------------------------------------------- KABAL
  kabal_tower: {
    name: "Kabal Tower",
    nation: "kabal",
    terrain: "wasteland",
    isCity: true,
    type: "landmark",
    danger: 5,
    services: ["guild"],
    description:
      "A thousand feet of obsidian rising from the fork of two rivers, exactly where they meet. The tower does not echo, does not cast a shadow the way it should, and is never fully silent. Somewhere beneath it, in a chamber called the Sepulcher, something with thirteen horns is not gone. Just waiting.",
    connections: [
      { to: "arethon", days: 4, mode: "road", desc: "the Sanguivorum road north" },
      { to: "the_arbor", days: 5, mode: "river", desc: "downriver into Vaeloris" },
      { to: "sahurim", days: 6, mode: "road", desc: "the desert road east" },
    ],
  },

  // ------------------------------------------------------------ SANGUIVORUM
  zuevaron: {
    name: "Zuevaron",
    title: "The Heart of the Empire",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "healer"],
    description:
      "Built where the great rivers converge beneath the shadow of the Kabal Bridge, Zuevaron is the political, military, and cultural capital of Sanguivorum. Every imperial road eventually leads here. Senators shape the future of the Empire, generals receive their commands, and citizens from every nation walk its streets.",
    connections: [
      { to: "kabal_tower", days: 4, mode: "road" },
      { to: "arethon", days: 3, mode: "road" },
      { to: "apollyon", days: 2, mode: "road" },
      { to: "aphroneth", days: 4, mode: "road", desc: "west to the coast" },
    ],
    // Zuevaron's real district layout, built quarter by quarter (same
    // workflow as Arethon) — the Civic Quarter (The Imperial Forum) is
    // the first. Every place carries a `district` tag for grouping in
    // cmdLook/cmdPlaces; the Imperial Forum itself is the district's own
    // walkable hub, so it doesn't need one.
    sublocations: {
      imperialForum: {
        name: "The Imperial Forum",
        type: "street",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "Zuevaron's civic core, where the machinery of governing an empire is visible at street level — petitioners waiting outside marble halls, couriers cutting between offices, citizens debating half-heard Senate business before it's even been voted on. Every imperial road empties into it eventually, whether you meant to arrive here or not.",
      },
      imperatorsGate: {
        name: "The Imperator's Gate",
        type: "gate",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "The grand western entrance to the capital, where triumphal processions, ambassadors, and imperial guests first enter the city.",
      },
      hallOfSenate: {
        name: "The Hall of the Senate",
        type: "landmark",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "The seat of the Imperial Senate where the laws of Sanguivorum are debated and enacted.",
      },
      palaceOfAscendus: {
        name: "The Palace of the Ascendus",
        type: "landmark",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "Residence and administrative offices of the Imperator.",
      },
      forumMagnus: {
        name: "The Forum Magnus",
        type: "street",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "The largest public square in the Empire. Political speeches, celebrations, executions, and festivals are all held here.",
      },
      imperialLedger: {
        name: "The Imperial Ledger",
        type: "board",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "Official civic postings ranging from courier work to imperial contracts.",
      },
      citizensQuarter: {
        name: "The Citizen's Quarter",
        type: "residential",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "Home to government officials, merchants, scholars, and long-established families.",
      },
      officeOfCivicOrder: {
        name: "The Office of Civic Order",
        type: "barracks",
        district: "Civic Quarter (The Imperial Forum)",
        description:
          "The administrative headquarters of the Capital Watch.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      imperialExchange: {
        name: "The Imperial Exchange",
        type: "street",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "The capital's commercial heart, where goods, currency, and rumor move faster than almost anywhere else in Sanguivorum. Every specialist shop here answers to the Mercantile Concord, but none of them pool their stock with it or with each other.",
      },
      goldenScales: {
        name: "The Golden Scales",
        type: "market",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "The largest general merchant in the Empire, stocking goods from every nation.",
      },
      forgeImperialis: {
        name: "The Forge Imperialis",
        type: "shop",
        district: "Commercial Quarter (The Imperial Exchange)",
        shopCategory: "weapons",
        description:
          "Master smiths forge ceremonial weapons beside equipment destined for the Imperial Legions.",
      },
      gildedBulwark: {
        name: "The Gilded Bulwark",
        type: "shop",
        district: "Commercial Quarter (The Imperial Exchange)",
        shopCategory: "armor",
        description:
          "Renowned for producing armor for senators, officers, and the Imperial Guard.",
      },
      imperialApothecary: {
        name: "The Imperial Apothecary",
        type: "shop",
        district: "Commercial Quarter (The Imperial Exchange)",
        shopCategory: "potions",
        description:
          "An enormous licensed alchemical house supplying everything from healing potions to rare reagents.",
      },
      crownStables: {
        name: "The Crown Stables",
        type: "landmark",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "Maintains the finest horses available within Sanguivorum.",
      },
      emperorsRest: {
        name: "The Emperor's Rest",
        type: "inn",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "The capital's premier inn, hosting diplomats, nobles, and wealthy merchants.",
      },
      mintExchange: {
        name: "The Mint Exchange",
        type: "landmark",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "Converts currencies from across Fragmenta while safeguarding wealth for merchants and senators.",
      },
      mercantileConcord: {
        name: "The Mercantile Concord",
        type: "guildhall",
        district: "Commercial Quarter (The Imperial Exchange)",
        description:
          "The governing body of commerce within the capital.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      firstCitadel: {
        name: "The First Citadel",
        type: "barracks",
        district: "Military Quarter (The First Citadel)",
        description:
          "The capital's own fortress-district, walled and garrisoned separately from the rest of Zuevaron even though it hasn't faced a siege in living memory. Legion columns drill here on a schedule as fixed as the Senate's own calendar.",
      },
      imperialCitadel: {
        name: "The Imperial Citadel",
        type: "landmark",
        district: "Military Quarter (The First Citadel)",
        description:
          "Headquarters of the Imperial Legion and supreme military command of Sanguivorum.",
      },
      hallOfVictories: {
        name: "The Hall of Victories",
        type: "landmark",
        district: "Military Quarter (The First Citadel)",
        description:
          "Campaign maps, captured standards, and the military history of the Empire fill this grand hall.",
      },
      crimsonBarracks: {
        name: "The Crimson Barracks",
        type: "barracks",
        district: "Military Quarter (The First Citadel)",
        description:
          "Housing for the elite Legion units assigned to protect the capital.",
      },
      fieldOfEagles: {
        name: "The Field of Eagles",
        type: "barracks",
        district: "Military Quarter (The First Citadel)",
        description:
          "The Empire's largest military training grounds.",
      },
      imperialArsenal: {
        name: "The Imperial Arsenal",
        type: "landmark",
        district: "Military Quarter (The First Citadel)",
        description:
          "The most heavily guarded weapons repository in Sanguivorum.",
      },
      engineersHall: {
        name: "The Engineers' Hall",
        type: "landmark",
        district: "Military Quarter (The First Citadel)",
        description:
          "Home of Ingenum's greatest military engineers.",
      },
      quartermasterGeneral: {
        name: "The Quartermaster General",
        type: "landmark",
        district: "Military Quarter (The First Citadel)",
        description:
          "Coordinates supplies for every Legion throughout the Empire.",
      },
      houseOfRecovery: {
        name: "The House of Recovery",
        type: "healer",
        district: "Military Quarter (The First Citadel)",
        description:
          "The finest military hospital in Sanguivorum.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // Patron deity Aethyra (leadership, travel, communication, unity) —
      // domains that map directly onto the capital's own role as the place
      // every road, messenger, and nation converges.
      crownOfTwelve: {
        name: "The Crown of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Crown of the Twelve)",
        description:
          "Zuevaron's devotional quarter, built around the belief that a capital answering to every nation of the Empire should also answer to every god of the Pantheon. Incense, bells, and processions share the streets with off-duty clergy from a dozen different orders.",
      },
      grandBasilicaOfAethyra: {
        name: "The Grand Basilica of Aethyra",
        type: "temple",
        district: "Religious Quarter (The Crown of the Twelve)",
        gods: ["Aethyra"],
        description:
          "The largest temple to Aethyra in Sanguivorum and one of the holiest sites outside the Kabal.",
      },
      hallOfTwelve: {
        name: "The Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Crown of the Twelve)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Magnificent shrines dedicated to every member of the Fragmenta pantheon.",
      },
      pilgrimsHall: {
        name: "The Pilgrim's Hall",
        type: "inn",
        district: "Religious Quarter (The Crown of the Twelve)",
        description:
          "Hosts thousands of travelers and pilgrims each year.",
      },
      gardenOfConcord: {
        name: "The Garden of Concord",
        type: "temple",
        district: "Religious Quarter (The Crown of the Twelve)",
        gods: ["Aethyra"],
        description:
          "A peaceful sanctuary dedicated to unity between the peoples of the Empire.",
      },
      houseOfTwelveVoices: {
        name: "The House of Twelve Voices",
        type: "landmark",
        district: "Religious Quarter (The Crown of the Twelve)",
        description:
          "Residence of the High Clergy.",
      },
      sacredArchive: {
        name: "The Sacred Archive",
        type: "landmark",
        district: "Religious Quarter (The Crown of the Twelve)",
        description:
          "Contains centuries of religious writings and temple records.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      grandConclave: {
        name: "The Grand Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "The Kabal's largest presence outside the Tower itself, and the most closely watched quarter in the capital for it. Registered mages come and go under escort; unregistered ones don't come here at all if they know what's good for them.",
      },
      grandConclaveHall: {
        name: "The Grand Conclave Hall",
        type: "guildhall",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "The Kabal's principal administrative center outside the Tower itself.",
      },
      registryOfRivers: {
        name: "The Registry of Rivers",
        type: "landmark",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "Registers every legally recognized mage entering the capital.",
      },
      hallOfConduits: {
        name: "The Hall of Conduits",
        type: "landmark",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "Conducts magical evaluations and advanced conduit examinations.",
      },
      imperialRepository: {
        name: "The Imperial Repository",
        type: "landmark",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "One of the greatest magical libraries on the continent.",
      },
      magesResidence: {
        name: "The Mage's Residence",
        type: "residential",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "Housing for senior Kabal officials and visiting mages.",
      },
      circleChamber: {
        name: "The Circle Chamber",
        type: "landmark",
        district: "Arcane Quarter (The Grand Conclave)",
        description:
          "Reserved for sanctioned long-distance magical transportation. The chamber stands ready; the network it's meant to connect to doesn't yet.",
      },
      // ---------------------------------------------------- TRADE QUARTER
      riverExchange: {
        name: "The River Exchange",
        type: "street",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Where the capital's river trade actually gets processed — less ceremony than the Imperial Exchange, more shouting, and considerably more mud. Every cargo bound anywhere in the Empire passes through here first.",
      },
      riverGates: {
        name: "The River Gates",
        type: "gate",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Massive river checkpoints regulating traffic entering the capital.",
      },
      customsHall: {
        name: "The Customs Hall",
        type: "landmark",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Every shipment entering Zuevaron is documented here.",
      },
      grandWarehouses: {
        name: "The Grand Warehouses",
        type: "landmark",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Gigantic storage halls supplying the Empire.",
      },
      merchantDocks: {
        name: "The Merchant Docks",
        type: "docks",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Bustling river docks filled with vessels from every nation.",
      },
      guildOfCaravans: {
        name: "The Guild of Caravans",
        type: "guildhall",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Coordinates the Empire's overland trade routes.",
      },
      hallOfCommerce: {
        name: "The Hall of Commerce",
        type: "landmark",
        district: "Trade Quarter (The River Exchange)",
        description:
          "Economic policy for the Empire begins here.",
      },
      // ------------------------------------------------- ARTISAN QUARTER
      foundryWard: {
        name: "The Foundry Ward",
        type: "street",
        district: "Artisan Quarter (The Foundry Ward)",
        description:
          "The capital's working quarter, where furnace-heat and stone dust replace the polish of the Imperial Forum. Every master craftsman in Sanguivorum wants a workshop here eventually, whether or not the Empire ever commissions them.",
      },
      masterForge: {
        name: "The Master Forge",
        type: "landmark",
        district: "Artisan Quarter (The Foundry Ward)",
        description:
          "Produces masterpieces for emperors and heroes alike.",
      },
      marbleWorks: {
        name: "The Marble Works",
        type: "landmark",
        district: "Artisan Quarter (The Foundry Ward)",
        description:
          "Responsible for many of the capital's monumental buildings.",
      },
      weaversHall: {
        name: "The Weaver's Hall",
        type: "landmark",
        district: "Artisan Quarter (The Foundry Ward)",
        description:
          "Produces everything from Legion uniforms to senatorial robes.",
      },
      hallOfGems: {
        name: "The Hall of Gems",
        type: "shop",
        district: "Artisan Quarter (The Foundry Ward)",
        shopCategory: "jewelry",
        description:
          "The Empire's finest jewelers and seal engravers.",
      },
      inventorsCourt: {
        name: "The Inventor's Court",
        type: "landmark",
        district: "Artisan Quarter (The Foundry Ward)",
        description:
          "A gathering place for master craftsmen and engineers.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      goldenHeights: {
        name: "The Golden Heights",
        type: "residential",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "Terraced above the rest of the capital, close enough to smell the river and far enough not to hear it. Senators, generals, and foreign dignitaries all keep an address here, whether or not they ever sleep in it.",
      },
      senatorialEstates: {
        name: "The Senatorial Estates",
        type: "residential",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "Residences of the Empire's most influential families.",
      },
      embassyRow: {
        name: "The Embassy Row",
        type: "residential",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "Foreign embassies from every major nation.",
      },
      imperialGardens: {
        name: "The Imperial Gardens",
        type: "landmark",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "Meticulously maintained gardens reserved for official ceremonies.",
      },
      hallOfHonors: {
        name: "The Hall of Honors",
        type: "landmark",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "Where imperial awards and noble titles are bestowed.",
      },
      nobleClub: {
        name: "The Noble Club",
        type: "landmark",
        district: "Noble Quarter (The Golden Heights)",
        description:
          "A private gathering place for senators, generals, and wealthy patrons.",
      },
      // ------------------------------------------------ IMPERIAL LANDMARKS
      grandOvum: {
        name: "The Grand Ovum",
        type: "landmark",
        district: "Imperial Landmarks",
        description:
          "The greatest arena in Fragmenta. Champions, beasts, tournaments, and imperial spectacles are held within its colossal walls.",
      },
      kabalBridge: {
        name: "The Kabal Bridge",
        type: "landmark",
        district: "Imperial Landmarks",
        description:
          "The monumental bridge leading toward the Kabal Tower, symbolizing the alliance between imperial authority and magical oversight.",
      },
      imperialPalace: {
        name: "The Imperial Palace",
        type: "landmark",
        district: "Imperial Landmarks",
        description:
          "The official residence of the Imperator and the symbolic heart of Sanguivorum.",
      },
      eternalFlame: {
        name: "The Eternal Flame",
        type: "landmark",
        district: "Imperial Landmarks",
        description:
          "A perpetual flame honoring those who gave their lives in service to the Empire.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as Arethon's own Exploration
      // Locations batch — no wrapping hub, shared district string for
      // grouping, `dangerTags` swapping the encounter pool via
      // exploreOutcome (see engine/parser.js). The dungeon, undercity
      // tunnels, and senate ruins get "ruin" for skeleton/zombie/animated
      // armor alongside the bandit/hired-blade "urban" pool; the night
      // market, riverside promenade, and observation tower stay purely
      // human-threat "urban".
      forgottenVaults: {
        name: "The Forgotten Vaults",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Ancient storage chambers beneath the oldest districts of the capital.",
      },
      undercity: {
        name: "The Undercity",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "A sprawling network of tunnels, forgotten foundations, and hidden passages beneath Zuevaron.",
      },
      whisperMarket: {
        name: "The Whisper Market",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "An unofficial night market where rare goods and whispered information change hands.",
      },
      oldSenateRuins: {
        name: "The Old Senate Ruins",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The remnants of the senate hall that stood before the current imperial capital was expanded.",
      },
      riverWalk: {
        name: "The River Walk",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A scenic promenade along the riverbanks that often hosts festivals, entertainers, and traveling merchants.",
      },
      watchCrown: {
        name: "The Watch Crown",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The highest observation tower in Zuevaron, offering a view across the capital and surrounding countryside.",
      },
    },
  },
  aphroneth: {
    name: "Aphroneth",
    title: "The Jewel of the Western Sea",
    nation: "sanguivorum",
    terrain: "coast",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "healer"],
    description:
      "The premier commercial port of Sanguivorum, Aphroneth is the Empire's window to the world. Merchant fleets arrive daily carrying goods, cultures, and ideas from every nation. More foreign tongues are spoken here than anywhere else in Sanguivorum, and fortunes are won with a single successful voyage. As the Empire's most cosmopolitan city, Aphroneth balances imperial order with the constant rhythm of international commerce.",
    connections: [
      { to: "zuevaron", days: 4, mode: "road", desc: "east to the capital" },
      { to: "arnoneth", days: 3, mode: "road", desc: "up the coast" },
      { to: "tritonath", days: 4, mode: "road", desc: "north along the fjord coast" },
    ],
    // Aphroneth's real district layout, built quarter by quarter (same
    // workflow as Arethon and Zuevaron) — the Civic Quarter (The Harbor
    // Forum) is the first. Every place carries a `district` tag for
    // grouping in cmdLook/cmdPlaces; the Harbor Forum itself is the
    // district's own walkable hub, so it doesn't need one.
    sublocations: {
      harborForum: {
        name: "The Harbor Forum",
        type: "street",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "The administrative heart of Aphroneth, where maritime law, commerce, and imperial governance intersect.",
      },
      harborGate: {
        name: "The Harbor Gate",
        type: "gate",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "The monumental entrance connecting the bustling docks to the city beyond. Nearly every foreign traveler begins their journey through Aphroneth here.",
      },
      hallOfTideSenate: {
        name: "The Hall of the Tide Senate",
        type: "landmark",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "The seat of the city's Ascendus senator. Trade law, harbor policy, and civic administration are directed from these chambers.",
      },
      harborSquare: {
        name: "Harbor Square",
        type: "street",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "The city's central plaza where merchants negotiate contracts, musicians entertain travelers, and public ceremonies celebrate successful expeditions.",
      },
      marinersLedger: {
        name: "The Mariner's Ledger",
        type: "board",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "Requests for escorts, shipping contracts, monster hunts, courier work, and merchant commissions fill its notice boards daily.",
      },
      sailorsWard: {
        name: "Sailor's Ward",
        type: "residential",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "Home to generations of sailors, dockworkers, merchants, and fishing families whose livelihoods depend upon the harbor.",
      },
      harborWatchHeadquarters: {
        name: "Harbor Watch Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Harbor Forum)",
        description:
          "The city's lawkeepers specialize in smuggling investigations, customs enforcement, and keeping order along the waterfront.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      sapphireBazaar: {
        name: "The Sapphire Bazaar",
        type: "street",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "The wealthiest marketplace in eastern Sanguivorum, famous for imported goods rarely found elsewhere in the Empire.",
      },
      tideMarket: {
        name: "The Tide Market",
        type: "market",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "Carries everything from common travel supplies to exotic imports from every corner of Fragmenta.",
      },
      ironAnchor: {
        name: "The Iron Anchor",
        type: "shop",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        shopCategory: "weapons",
        description:
          "Produces dependable weapons alongside anchors, chains, harpoons, and heavy ship fittings designed to endure decades at sea.",
      },
      seaBastionForge: {
        name: "The Sea Bastion Forge",
        type: "shop",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        shopCategory: "armor",
        description:
          "Known for corrosion-resistant armor favored by marines, captains, and professional adventurers.",
      },
      coralApothecary: {
        name: "The Coral Apothecary",
        type: "shop",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        shopCategory: "potions",
        description:
          "Specializes in healing tonics, antidotes, diving elixirs, and remedies derived from rare marine plants and creatures.",
      },
      navigatorsRein: {
        name: "The Navigator's Rein",
        type: "landmark",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "Maintains horses and pack animals for merchants continuing inland after arriving by sea.",
      },
      bilgeAndBarrel: {
        name: "The Bilge & Barrel",
        type: "inn",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "A legendary waterfront tavern where explorers, sailors, adventurers, and merchants exchange stories over strong drink.",
      },
      harborExchange: {
        name: "The Harbor Exchange",
        type: "landmark",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "Converts foreign currency, stores merchant wealth, and issues letters of credit recognized throughout the Empire.",
      },
      merchantsConcord: {
        name: "The Merchant's Concord",
        type: "guildhall",
        district: "Commercial Quarter (The Sapphire Bazaar)",
        description:
          "Guild headquarters where trade disputes are settled and commercial ventures are negotiated.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      // The source list names the district's hub and its central fortress
      // both "The Sea Bastion" — one entry here rather than two identically
      // named places, folding the district overview and the fortress's own
      // role into a single authored description.
      seaBastion: {
        name: "The Sea Bastion",
        type: "barracks",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "A heavily fortified district responsible for defending Sanguivorum's busiest harbor — the fortress overlooking Aphroneth's harbor entrance, coordinating all coastal defenses.",
      },
      hallOfAdmirals: {
        name: "Hall of Admirals",
        type: "landmark",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Command center for the city's naval officers and harbor defense fleet.",
      },
      marineBarracks: {
        name: "Marine Barracks",
        type: "barracks",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Home to elite marines charged with defending the docks and escorting important vessels.",
      },
      breakwaterGrounds: {
        name: "Breakwater Grounds",
        type: "barracks",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Training yards where marines practice boarding actions, shield formations, and coastal warfare.",
      },
      navalArsenal: {
        name: "Naval Arsenal",
        type: "landmark",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "A secure armory storing weapons, armor, siege engines, and naval equipment.",
      },
      signalTower: {
        name: "Signal Tower",
        type: "landmark",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Beacon fires, signal flags, and mirrors coordinate ships approaching the harbor from leagues away.",
      },
      quartermastersDock: {
        name: "Quartermaster's Dock",
        type: "landmark",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Supplies military vessels and oversees logistics for coastal patrols.",
      },
      houseOfCalmWaters: {
        name: "House of Calm Waters",
        type: "healer",
        district: "Military Quarter (The Sea Bastion)",
        description:
          "Treats injured sailors, marines, and dockworkers returning from dangerous voyages.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // Patron deity Seressa and her faith, the Heartward Communion
      // (compassion, fellowship, genuine human connection) — the Grand
      // Heartward Shrine and Chamber of Reflection default prayer to her;
      // Garden Sanctuary is explicitly Religion-tagged and about seeking
      // peace through love's unpredictability, so it gets the same
      // treatment. Pilgrim's Rest, House of the Amorites, Fountain of
      // Bonds, and Hall of Devotion stay flavor-only — lodging, clergy
      // residence, a ceremony venue, and a lore hall, none of them framed
      // as a place to actually pray.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The spiritual heart of Aphroneth, devoted to Seressa and her faith, the Heartward Communion, whose teachings of compassion, fellowship, and genuine human connection have made the city renowned for its hospitality. Candlelight and soft music carry from every open shrine door.",
      },
      grandHeartwardShrine: {
        name: "The Grand Heartward Shrine",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Seressa"],
        description:
          "The greatest Heartward Shrine in Sanguivorum. Weddings are celebrated beside the Fountain of Bonds while sailors departing on long voyages seek blessings for safe return and joyful reunion.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "A circular sanctuary containing twelve equal chapels honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Welcomes pilgrims, travelers, and those with nowhere else to stay, regardless of wealth or homeland.",
      },
      houseOfAmorites: {
        name: "House of the Amorites",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Aphroneth's clergy. The Amorites serve as counselors, matchmakers, wedding officiants, and mediators for broken relationships.",
      },
      chamberOfReflection: {
        name: "Chamber of Reflection",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Seressa"],
        description:
          "A quiet sanctuary where the heartbroken seek guidance and clarity beneath soft candlelight.",
      },
      fountainOfBonds: {
        name: "Fountain of Bonds",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The most famous wedding site in the city, where countless vows have been exchanged beneath blooming roses.",
      },
      hallOfDevotion: {
        name: "Hall of Devotion",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Filled with murals depicting legendary romances, acts of sacrifice, and lifelong friendships remembered by the Communion.",
      },
      gardenSanctuary: {
        name: "Garden Sanctuary",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Seressa"],
        description:
          "A peaceful garden representing both the beauty and unpredictability of love through carefully cultivated wild growth.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      tideConclave: {
        name: "The Tide Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "The Kabal's maritime branch, overseeing navigation magic, magical weather observation, and arcane threats emerging from the sea.",
      },
      tideConclaveHall: {
        name: "Tide Conclave Hall",
        type: "guildhall",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "The official Kabal headquarters within Aphroneth.",
      },
      registryOfNavigators: {
        name: "Registry of Navigators",
        type: "landmark",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "Registers licensed mages serving aboard merchant and naval vessels.",
      },
      chamberOfCurrents: {
        name: "Chamber of Currents",
        type: "landmark",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "Studies navigation magic, hydromancy, and weather manipulation.",
      },
      oceanicRepository: {
        name: "Oceanic Repository",
        type: "landmark",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "Archives magical research concerning sea monsters, storms, ocean currents, and maritime expeditions.",
      },
      magesAnchorage: {
        name: "Mage's Anchorage",
        type: "residential",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "Housing for Conclave personnel stationed in Aphroneth.",
      },
      beaconCircle: {
        name: "Beacon Circle",
        type: "landmark",
        district: "Arcane Quarter (The Tide Conclave)",
        description:
          "Reserved for sanctioned magical transportation. Like the Circle Chamber at Zuevaron, it stands ready for a network that doesn't yet exist.",
      },
      // ---------------------------------------------------- TRADE QUARTER
      grandDocks: {
        name: "The Grand Docks",
        type: "docks",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "The busiest harbor in Sanguivorum and among the largest commercial ports on the continent.",
      },
      harborGates: {
        name: "Harbor Gates",
        type: "gate",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Primary arrival point for vessels entering Aphroneth.",
      },
      customsHall: {
        name: "Customs Hall",
        type: "landmark",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Every cargo entering the Empire is inspected, documented, and taxed here.",
      },
      longWharves: {
        name: "Long Wharves",
        type: "docks",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Miles of stone docks capable of servicing merchant fleets from every nation.",
      },
      merchantWarehouses: {
        name: "Merchant Warehouses",
        type: "landmark",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Secure storage halls protecting valuable imports awaiting distribution.",
      },
      guildOfCaravans: {
        name: "Guild of Caravans",
        type: "guildhall",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Coordinates overland transport throughout Sanguivorum.",
      },
      harborMastersOffice: {
        name: "Harbor Master's Office",
        type: "landmark",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Directs harbor traffic, docking assignments, and maritime safety.",
      },
      fishermansLanding: {
        name: "Fisherman's Landing",
        type: "docks",
        district: "Trade Quarter (The Grand Docks)",
        description:
          "Home to Aphroneth's fishing fleet and the city's bustling morning fish market.",
      },
      // ------------------------------------------------- ARTISAN QUARTER
      // No jewelry shop this time (unlike Arethon's/Zuevaron's artisan
      // quarters) — Aphroneth's is entirely shipbuilding-focused, and none
      // of its named workshops sell goods matching an existing shop
      // category (weapons/armor/potions/jewelry), so the whole district
      // stays flavor-only, same principle as Master Forge/Marble Works in
      // Zuevaron's Foundry Ward.
      shipwrightsWard: {
        name: "The Shipwright's Ward",
        type: "street",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "The industrial district where vessels destined to cross the seas are designed, built, and repaired.",
      },
      ironKeel: {
        name: "Iron Keel",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Produces anchors, chains, reinforced hull fittings, and heavy naval hardware.",
      },
      sailmakersLoft: {
        name: "Sailmaker's Loft",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Crafts sails, banners, expedition tents, and maritime canvas.",
      },
      brassSextant: {
        name: "Brass Sextant",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Offers navigation instruments, maps, compasses, and surveying equipment.",
      },
      ropewalk: {
        name: "Ropewalk",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Produces rope, rigging, and heavy cable for fleets across the Empire.",
      },
      drydockWorks: {
        name: "Drydock Works",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Constructs and repairs everything from fishing boats to imperial warships.",
      },
      carpentersWharf: {
        name: "Carpenter's Wharf",
        type: "landmark",
        district: "Artisan Quarter (The Shipwright's Ward)",
        description:
          "Builds masts, docks, wagons, and structural timbers for maritime construction.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      pearlHeights: {
        name: "The Pearl Heights",
        type: "residential",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Perched above the harbor, this district houses Aphroneth's wealthiest merchant dynasties and foreign dignitaries.",
      },
      houseOfHarborLord: {
        name: "House of the Harbor Lord",
        type: "landmark",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Residence of the city's Ascendus senator.",
      },
      merchantEstates: {
        name: "Merchant Estates",
        type: "residential",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Elegant villas belonging to Aphroneth's influential merchant families.",
      },
      embassyRow: {
        name: "Embassy Row",
        type: "residential",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Diplomatic residences representing nations across Fragmenta.",
      },
      pearlGardens: {
        name: "Pearl Gardens",
        type: "landmark",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Terraced gardens overlooking the sea, often used for formal receptions and diplomatic negotiations.",
      },
      hallOfMaritimeHonors: {
        name: "Hall of Maritime Honors",
        type: "landmark",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "Recognizes extraordinary achievements in commerce, exploration, and naval service.",
      },
      captainsClub: {
        name: "Captain's Club",
        type: "landmark",
        district: "Noble Quarter (The Pearl Heights)",
        description:
          "An exclusive gathering place for admirals, renowned captains, and merchant princes.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      lighthouseOfAphroneth: {
        name: "Lighthouse of Aphroneth",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A towering beacon guiding ships safely into the Empire's greatest harbor.",
      },
      seaKingsArch: {
        name: "Sea King's Arch",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A monumental stone arch spanning the inner harbor, symbolizing Sanguivorum's prosperity through trade.",
      },
      harborBell: {
        name: "Harbor Bell",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A colossal bronze bell announcing fleet arrivals, emergencies, and imperial proclamations.",
      },
      promenadeOfSails: {
        name: "Promenade of Sails",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A lively waterfront lined with markets, performers, restaurants, and merchant stalls overlooking the sea.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other two cities'
      // Exploration Locations batches — the salt tunnels and forgotten
      // breakwater get "ruin" for skeleton/zombie/animated-armor
      // encounters alongside the bandit/hired-blade "urban" pool; the
      // rest stay purely human-threat "urban". Tide Pools deliberately
      // does NOT get a "coast" dangerTag despite its marine setting — the
      // only coast-tagged bestiary entries (Thunderbird, Drake, Dragon)
      // are all rare/elite/world-boss tier, which would make this one
      // exploration spot wildly more dangerous than its peers rather than
      // adding flavor.
      saltTunnels: {
        name: "Salt Tunnels",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Ancient tunnels beneath the docks once used by smugglers and now inhabited by far more dangerous things.",
      },
      whisperDocks: {
        name: "Whisper Docks",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "An abandoned section of harbor where illicit trade flourishes after sunset.",
      },
      tidePools: {
        name: "Tide Pools",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "Rocky coves rich in rare marine life and valuable alchemical ingredients.",
      },
      forgottenBreakwater: {
        name: "Forgotten Breakwater",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The crumbling remains of Aphroneth's original harbor defenses.",
      },
      deepAnchorage: {
        name: "Deep Anchorage",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A secluded harbor where expeditions into dangerous or unknown waters are organized.",
      },
      gullsWatch: {
        name: "Gull's Watch",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A cliffside overlook offering breathtaking views of Aphroneth, the harbor, and the endless western sea.",
      },
    },
  },
  arethon: {
    name: "Arethon",
    title: "The Eastern Bastion",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    type: "gate",
    danger: 2,
    services: ["rest", "shop", "healer", "guild"],
    description:
      "A former commercial gateway transformed by war into Sanguivorum's principal eastern fortress. Arethon still carries the bones of a trade city, but nearly every street now serves the frontier: soldiers drill beside caravan yards, merchants bargain beneath watchtowers, and memorials stand where warehouses once did.",
    connections: [
      { to: "zuevaron", days: 3, mode: "road" },
      { to: "apollyon", days: 2, mode: "road" },
      { to: "kabal_tower", days: 4, mode: "road" },
      { to: "the_rivers_gate", days: 9, mode: "road", desc: "south toward the Vaeloris border" },
      { to: "sahurim", days: 13, mode: "road", desc: "the bridge road, through the Desert War front" },
    ],
    // Arethon's real district layout, built quarter by quarter (see the
    // workflow this was planned under) — the Civic Quarter (The Forum) is
    // the first. Every place carries a `district` tag for grouping in
    // cmdLook/cmdPlaces; The Forum itself is the district's own walkable
    // hub, so it doesn't need one.
    sublocations: {
      forum: {
        name: "The Forum",
        type: "street",
        district: "Civic Quarter (The Forum)", // same district value as its own buildings — see the grouping helper in parser.js
        description:
          "Arethon's civic heart, where the business of actually running a fortress city gets done — petitions, measures, notices, and the watch that keeps it all from fraying at the edges. The roads through here are cut wide enough for a Legion column, on the rare day one needs to pass through the Forum rather than around it.",
      },
      aretineGate: {
        name: "The Aretine Gate",
        type: "gate",
        district: "Civic Quarter (The Forum)",
        description:
          "Arethon's primary western entrance and the roadward face of the city. Travelers entering from the Sanguivorum interior pass beneath bronze reliefs depicting the city before and after its militarization.",
      },
      hallOfAscendus: {
        name: "The Hall of the Ascendus",
        type: "landmark",
        district: "Civic Quarter (The Forum)",
        description:
          "The administrative seat of Arethon's ruling senator. Petitions, legal disputes, taxation matters, and official appointments are handled within its severe marble chambers.",
      },
      chamberOfMeasures: {
        name: "The Chamber of Measures",
        type: "landmark",
        district: "Civic Quarter (The Forum)",
        description:
          "A smaller civic hall where city officials record supply levels, population movement, commercial output, and military readiness. Arethon measures itself constantly.",
      },
      squareOfFirstStandard: {
        name: "The Square of the First Standard",
        type: "street",
        district: "Civic Quarter (The Forum)",
        description:
          "The central public plaza, named for the first Legion standard raised when Arethon became a fortress city. Public announcements, civic ceremonies, and military departures begin here.",
      },
      bronzeLedger: {
        name: "The Bronze Ledger",
        type: "board",
        district: "Civic Quarter (The Forum)",
        description:
          "Arethon's public notice board, framed in bronze and guarded against tampering. Jobs, decrees, missing-person notices, military requisitions, and public judgments are posted here.",
      },
      citizensSteps: {
        name: "The Citizens' Steps",
        type: "residential",
        district: "Civic Quarter (The Forum)",
        description:
          "A broad residential ward built along rising stone terraces. Veterans, civic officials, artisans, and long-established families occupy the tightly ordered streets.",
      },
      vigilOffice: {
        name: "The Vigil Office",
        type: "barracks",
        district: "Civic Quarter (The Forum)",
        description:
          "Headquarters of the city watch. Less prestigious than the Legion, but far more involved in theft, unrest, smuggling, and ordinary city crime.",
      },
      // ---------------------------------------------- COMMERCIAL QUARTER
      marchesMarket: {
        name: "The Marches Market",
        type: "street",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "Arethon's trading heart, still busy in the old commercial-gateway way even with half the city rebuilt around a garrison. Five specialist shops ring the square, each keeping its own stock rather than pooling it with the rest.",
      },
      frontierProvisioner: {
        name: "The Frontier Provisioner",
        type: "market",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "A general merchant specializing in travel goods, preserved food, rope, waterskins, lanterns, and basic adventuring supplies. Its stock reflects Arethon's position between meadow and desert.",
      },
      legionsArms: {
        name: "The Legion's Arms",
        type: "shop",
        shopCategory: "weapons",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "A respected blacksmith whose weapons are made to Legion measurements even when sold to civilians. Plain, durable, and rarely decorative.",
      },
      redShield: {
        name: "The Red Shield",
        type: "shop",
        shopCategory: "armor",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "Arethon's principal armorer. The shop is known for reinforced shields, layered frontier armor, and repairs performed quickly enough for soldiers returning to duty.",
      },
      potionarium: {
        name: "The Potionarium",
        type: "shop",
        shopCategory: "potions",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "A licensed alchemical dispensary marked by blue-glass windows and the sharp smell of medicinal herbs. It sells healing draughts, tonics, antitoxins, and approved battlefield mixtures.",
      },
      goldenRein: {
        name: "The Golden Rein",
        type: "landmark",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "A stable and animal yard serving couriers, caravan masters, officers, and travelers. Sanguivorum horses occupy the front stalls; desert mounts and pack animals are kept farther back.",
      },
      marchingMug: {
        name: "The Marching Mug",
        type: "inn",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "A broad, noisy inn favored by soldiers, caravan guards, and low-ranking officers. The walls are covered in retired shields, old route maps, and names carved by departing Legionnaires.",
      },
      easternScale: {
        name: "The Eastern Scale",
        type: "landmark",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "The licensed money changer and appraisal house. Foreign coin, trade bars, gemstones, and sealed merchant credit are converted under civic supervision.",
      },
      concordOffice: {
        name: "The Concord Office",
        type: "guildhall",
        district: "Commercial Quarter (The Marches Market)",
        description:
          "The local merchant association hall. Trade disputes, caravan partnerships, shipping claims, and commercial licenses are negotiated here.",
      },
      // ---------------------------------------------------- MILITARY QUARTER
      // Mostly off-limits, administrative, or ceremonial spaces rather than
      // player-usable services — "landmark" (flavor, no mechanical hooks)
      // covers most of it honestly. The Red Arsenal and Quartermaster's
      // Ledger both read like shops at a glance, but the text is explicit
      // that neither is open to civilians, so neither gets a shopCategory.
      // The House of Returning is a natural home for a real "healer"
      // mechanic if one gets built later — "healer" has sat unused in
      // every city's top-level services list since it was first written.
      easternCitadel: {
        name: "The Eastern Citadel",
        type: "barracks",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "The fortress-within-the-fortress, walled off even from the rest of Arethon. Everything here runs on Legion time and Legion authorization — checkpoints at every approach, and no one wanders in by accident.",
      },
      bastionOfEasternWatch: {
        name: "The Bastion of the Eastern Watch",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "Arethon's defining structure and the headquarters of its Legion command. It overlooks the border approaches and dominates the skyline with layered walls, signal towers, and artillery platforms.",
      },
      hallOfStandards: {
        name: "The Hall of Standards",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "The formal Legion headquarters within the citadel. Unit standards, campaign records, casualty rolls, and commendations are preserved beneath guarded arches.",
      },
      stoneCohorts: {
        name: "The Stone Cohorts",
        type: "barracks",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "The principal barracks complex. Its long buildings house rotating Legion units, frontier scouts, engineers, and reserve formations.",
      },
      fieldOfIron: {
        name: "The Field of Iron",
        type: "barracks",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "Arethon's primary training ground. Soldiers drill in formation, test weapons, conduct mock breaches, and train for desert and river combat.",
      },
      redArsenal: {
        name: "The Red Arsenal",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "The secured weapon and armor storehouse supplying the city's garrison. Civilian access is forbidden without military authorization.",
      },
      enginesYard: {
        name: "The Engines' Yard",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "A fortified open yard filled with ballistae, mobile towers, rams, and siege mechanisms. Ingenum engineers constantly test and modify equipment here.",
      },
      quartermastersLedger: {
        name: "The Quartermaster's Ledger",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "The distribution office for military equipment, rations, uniforms, and replacement gear. Nothing leaves without a signature, seal, and recorded destination.",
      },
      houseOfReturning: {
        name: "The House of Returning",
        type: "healer",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "Arethon's military hospital. Wounded soldiers arrive here directly from the gates, docks, and frontier posts.",
      },
      officersColonnade: {
        name: "The Officers' Colonnade",
        type: "landmark",
        district: "Military Quarter (The Eastern Citadel)",
        description:
          "A restrained assembly hall where commanders meet, dine, plan operations, and receive official visitors.",
      },
      // ---------------------------------------------------- RELIGIOUS QUARTER
      // `gods` (see engine/parser.js cmdPray) is the mechanical hook: praying
      // at a place with exactly one god defaults to it; the Hall of the
      // Twelve (all twelve) and the jointly-tended Garden of Final Honor
      // (two) require naming one. Every other place here is administrative
      // or archival rather than a place of active worship, so it stays
      // flavor-only, same as most of the Military Quarter.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Arethon's devotional heart, quieter than the rest of the city even at midday. Incense and old stone rather than oiled leather and orders — the one quarter where the war doesn't quite reach.",
      },
      grandBasilica: {
        name: "The Grand Basilica of Kar'Mhal",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Kar'Mhal"],
        description:
          "Arethon's principal temple and the spiritual heart of the city. Legionnaires seek courage before battle, commanders offer trophies after victory, and families pray for those posted beyond the walls.",
      },
      hallOfTwelve: {
        name: "The Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "A circular sanctuary containing twelve equal chapels, one for each deity of Fragmenta. Kar'Mhal's chapel is the most heavily attended, but none are treated as lesser.",
      },
      houseOfFirstStep: {
        name: "The House of the First Step",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aethyra"],
        description:
          "Aethyra's local pilgrim house. Travelers, messengers, caravan guards, and soldiers departing on long campaigns receive route blessings here.",
      },
      gardenOfFinalHonor: {
        name: "The Garden of Final Honor",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Kar'Mhal", "Mortasha"],
        description:
          "A quiet memorial garden jointly tended by the clergy of Kar'Mhal and Mortasha. The dead are remembered not only for how they died, but for what their lives accomplished.",
      },
      wallOfEasternWatch: {
        name: "The Wall of the Eastern Watch",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "A long black-stone memorial engraved with the names of those who died defending Arethon and the eastern frontier.",
      },
      pilgrimsMeasure: {
        name: "The Pilgrim's Measure",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "A modest hostel for religious travelers, military families, and those visiting the memorials. Payment is accepted, but no pilgrim is turned away for lacking coin.",
      },
      houseOfTwelveVoices: {
        name: "The House of Twelve Voices",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The residence and meeting place of Arethon's clergy. Priests debate doctrine, coordinate festivals, and organize charitable work from here.",
      },
      sacredRecord: {
        name: "The Sacred Record",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "A temple archive containing burial rolls, campaign blessings, oaths, marriages, pilgrim accounts, and records of religious service.",
      },
      // ------------------------------------------------------- ARCANE QUARTER
      // Flavor-only, same as most of the Military Quarter — the Conclave is
      // Kabal administration (mage registration, aptitude testing, artifact
      // custody), not the Mugamiir Safor/Magma-Hearth kind of guild
      // GUILD_HQ/contracts gates to, so "guildhall" here is thematic only.
      theConclave: {
        name: "The Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Conclave)",
        description:
          "Arethon's smallest quarter and its most watched. Kabal robes move differently through a crowd than anyone else's — not hurried, never quite idle either — and every door here has a reason to be locked.",
      },
      conclaveHallOfArethon: {
        name: "The Conclave Hall of Arethon",
        type: "guildhall",
        district: "Arcane Quarter (The Conclave)",
        description:
          "The official Kabal presence in the city. Registered mages, civic authorities, and Legion officers meet here when magical matters affect the frontier.",
      },
      registryOfConduits: {
        name: "The Registry of Conduits",
        type: "landmark",
        district: "Arcane Quarter (The Conclave)",
        description:
          "The office responsible for recording mages, conduits, magical affiliations, and authorized practice. Its records are precise and closely guarded.",
      },
      chamberOfRecognition: {
        name: "The Chamber of Recognition",
        type: "landmark",
        district: "Arcane Quarter (The Conclave)",
        description:
          "A controlled examination room used to identify magical aptitude and assess unstable or newly awakened practitioners.",
      },
      easternRepository: {
        name: "The Eastern Repository",
        type: "landmark",
        district: "Arcane Quarter (The Conclave)",
        description:
          "A compact arcane archive containing regional magical reports, approved texts, creature records, and classified frontier observations.",
      },
      veiledDormitory: {
        name: "The Veiled Dormitory",
        type: "residential",
        district: "Arcane Quarter (The Conclave)",
        description:
          "Housing for Conclave personnel, visiting mages, apprentices, and Kabal functionaries posted temporarily to Arethon.",
      },
      sealedCourt: {
        name: "The Sealed Court",
        type: "landmark",
        district: "Arcane Quarter (The Conclave)",
        description:
          "A secure chamber for dangerous artifacts, confiscated magical objects, and evidence awaiting transfer to the Kabal Tower.",
      },
      // -------------------------------------------------------- TRADE QUARTER
      // Customs, logistics, and wholesale — distinct from the Marches
      // Market's retail shops. Nothing here is a consumer storefront (the
      // Long Warehouse holds bonded goods, not stock for sale), so nothing
      // gets a shopCategory despite some of these reading shop-adjacent.
      caravanExchange: {
        name: "The Caravan Exchange",
        type: "street",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "The working end of Arethon's commerce — less browsing, more paperwork. Wagon wheels and ledger stamps instead of the Marches Market's haggling, and everyone here has somewhere to be.",
      },
      gateOfWeights: {
        name: "The Gate of Weights",
        type: "gate",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "The controlled eastern entrance used by caravans arriving from Sahrimor. Every wagon, seal, manifest, and water allotment is inspected here.",
      },
      officeOfSeals: {
        name: "The Office of Seals",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Arethon's customs house. Trade permissions, caravan licenses, tariffs, and border documentation are issued and reviewed within.",
      },
      nineRoadsYard: {
        name: "The Nine Roads Yard",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "A sprawling caravan staging ground divided by route, destination, and cargo type. The name refers to the old belief that every road worth traveling eventually passed through Arethon.",
      },
      longWarehouse: {
        name: "The Long Warehouse",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "The largest bonded warehouse in the city. Foreign goods remain here until inspected, taxed, released, or confiscated.",
      },
      easternFreightHall: {
        name: "The Eastern Freight Hall",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "A commercial dispatch office connecting merchants with wagons, guards, couriers, pack animals, and river transport.",
      },
      riverTeeth: {
        name: "The River Teeth",
        type: "docks",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "Arethon's fortified docks, named for the angled stone piers that break the current. Military ferries, merchant barges, and patrol boats share the riverfront.",
      },
      caravanMastersHouse: {
        name: "The Caravan Masters' House",
        type: "guildhall",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "A private but influential meeting hall used by major trade companies, route planners, and licensed convoy leaders.",
      },
      dustCourt: {
        name: "The Dust Court",
        type: "landmark",
        district: "Trade Quarter (The Caravan Exchange)",
        description:
          "An open inspection yard for desert caravans. Sand is swept from cargo, animals are checked, and suspicious shipments are isolated before entering the city.",
      },
      // -------------------------------------------------------- CRAFT QUARTER
      // Working production and repair shops, not retail — carts and
      // scaffolding and masonry repairs aren't purchasable inventory items.
      // The Twelve Facets is the one real exception: a jeweler is exactly
      // what the existing (until now unused) "jewelry" shopCategory was
      // built for, so it gets a real, independently-stocked shop.
      artisansWard: {
        name: "The Artisan's Ward",
        type: "street",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "The hammer-and-forge counterpart to the Marches Market — less about buying and selling, more about the things Arethon actually needs made or fixed. The air smells like sawdust, hot iron, and tanned hide in roughly equal measure.",
      },
      timberLine: {
        name: "The Timber Line",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A carpentry and wagonmaking district producing carts, siege frames, storage chests, scaffolding, and military transport equipment.",
      },
      whiteHammer: {
        name: "The White Hammer",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A masonry workshop known for frontier fortification work, reinforced foundations, and rapid wall repair.",
      },
      hideAndRivet: {
        name: "The Hide and Rivet",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A leatherworker supplying harnesses, boots, straps, armor backing, saddles, and shield grips.",
      },
      crimsonThread: {
        name: "The Crimson Thread",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A tailor serving both soldiers and civilians. It produces uniforms, officer cloaks, travel clothes, and formal civic dress.",
      },
      twelveFacets: {
        name: "The Twelve Facets",
        type: "shop",
        shopCategory: "jewelry",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A jeweler and seal-cutter specializing in signet rings, military honors, temple offerings, and merchant marks.",
      },
      makersCourt: {
        name: "The Makers' Court",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A shared workshop complex where smaller craftspeople rent space, tools, and furnace time.",
      },
      brokenWheel: {
        name: "The Broken Wheel",
        type: "landmark",
        district: "Craft Quarter (The Artisan's Ward)",
        description:
          "A repair yard infamous for never closing. Wagons damaged on the frontier often arrive here before their owners find lodging.",
      },
      // ------------------------------------------- NOBLE AND DIPLOMATIC WARD
      // Residences and ceremonial spaces — no shops or rest services
      // implied by any of these; the quarter's business is standing, not
      // commerce.
      highWard: {
        name: "The High Ward",
        type: "residential",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "Arethon's quietest streets, in the specific way that comes from everyone in them being careful. Wide avenues, high walls, and the sense that every conversation here is also, somehow, a negotiation.",
      },
      houseOfEasternSeat: {
        name: "The House of the Eastern Seat",
        type: "landmark",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "The official residence of Arethon's Ascendus senator. Less a palace than a fortified administrative estate.",
      },
      laurelTerraces: {
        name: "The Laurel Terraces",
        type: "residential",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "A collection of villas occupied by senior officers, wealthy merchants, established civic families, and retired senators.",
      },
      houseOfSandAndBronze: {
        name: "The House of Sand and Bronze",
        type: "residential",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "The formal residence assigned to Sahrimori envoys and trade representatives. Its guards are watched nearly as closely as its guests.",
      },
      quietEmbassy: {
        name: "The Quiet Embassy",
        type: "residential",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "A neutral residence used by delegations from nations other than Sahrimor. Its name reflects the expectation that foreign visitors speak carefully in Arethon.",
      },
      governorsGarden: {
        name: "The Governor's Garden",
        type: "landmark",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "A walled ceremonial garden used for private meetings, honors, negotiations, and carefully staged public receptions.",
      },
      hallOfProvenMerit: {
        name: "The Hall of Proven Merit",
        type: "landmark",
        district: "Noble and Diplomatic Quarter (The High Ward)",
        description:
          "A banquet and civic reception hall where promotions, awards, military appointments, and commercial recognitions are announced.",
      },
      // ----------------------------------------------------- CITY LANDMARKS
      // Standalone, not part of any of the 8 districts — no wrapping hub
      // place either, since the source list doesn't describe one. Shared
      // "City Landmarks" district string just so they group together in
      // the places/look listing instead of falling into a generic bucket.
      easternWall: {
        name: "The Eastern Wall",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The immense defensive barrier facing the frontier. Its towers are never unmanned, and its signal fires can summon the garrison before the city bells begin.",
      },
      veteransSquare: {
        name: "Veterans' Square",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A memorial plaza surrounded by statues of soldiers, engineers, healers, scouts, and civilians who preserved the city during past crises.",
      },
      oldBridgeArch: {
        name: "The Old Bridge Arch",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The surviving stone arch from Arethon's earlier life as a trade hub. The original bridge is gone, but the arch remains as a reminder that commerce existed before the fortress.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same as City Landmarks structurally (no
      // wrapping hub, shared district string for grouping) but tagged
      // `dangerTags` — real combat via exploreOutcome's urban-danger branch
      // (see engine/parser.js), reusing the bandit/mercenary/hostile-guard
      // creatures added earlier plus "ruin"-tagged undead (skeleton/zombie/
      // animated armor) at the cemetery, shrine, sewer, and ruined granary.
      oldTradeRoad: {
        name: "The Old Trade Road",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A partially abandoned street from Arethon's mercantile era. Closed shops, neglected courtyards, and forgotten storage cellars make it useful to smugglers and quest-givers.",
      },
      theUnderflow: {
        name: "The Underflow",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Arethon's sewer and drainage system. Old brick channels intersect with newer military tunnels, and not every passage appears on civic maps.",
      },
      shrineWithoutName: {
        name: "The Shrine Without a Name",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "A small pre-imperial shrine buried beneath later construction. Its original deity and purpose have been forgotten.",
      },
      fieldOfEmptyHelms: {
        name: "The Field of Empty Helms",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Arethon's eastern cemetery, named for the helmets placed atop the graves of soldiers whose bodies were never recovered.",
      },
      hollowMile: {
        name: "The Hollow Mile",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A suspected smuggling passage connecting old warehouses to the riverbank. City officials deny that it exists.",
      },
      lastWatch: {
        name: "The Last Watch",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A distant wall tower used for solitary observation, disciplinary postings, and sightings too uncertain to place in official reports.",
      },
      fallenGranary: {
        name: "The Fallen Granary",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "An abandoned warehouse damaged during an old siege. Parts of the interior remain unstable and officially closed.",
      },
      redbank: {
        name: "The Redbank",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A stretch of river outside the fortified docks where fishermen, scavengers, ferrymen, and illicit traders gather.",
      },
      walkOfStandards: {
        name: "The Walk of Standards",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A patrol route along the upper city walls. Retired campaign standards are displayed at intervals beneath protective stone canopies.",
      },
    },
  },
  apollyon: {
    name: "Apollyon",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "guild"],
    description:
      "The knowledge city. Guild Historia keeps its archive here, floor after floor of Sanguivorum's official memory — and, if the rumors that never quite die are true, a rather different memory kept somewhere the guild doesn't advertise.",
    connections: [
      { to: "arethon", days: 2, mode: "road" },
      { to: "zuevaron", days: 2, mode: "road" },
      { to: "vulcaron", days: 3, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
      { to: "daedaron", days: 3, mode: "road" },
    ],
    // A generic 3-place stub, same shape as Zuevaron's old placeholder —
    // used as scratch space by the engine-mechanism tests (sublocations,
    // area types, shop) now that Zuevaron's own sublocations are being
    // replaced by its real district layout batch by batch.
    sublocations: {
      tavern: {
        name: "The Scrivener's Rest",
        type: "inn",
        description:
          "A quiet inn favored by visiting scholars and guild couriers, its common room lined with retired shelving from the Archive's last renovation.",
      },
      market: {
        name: "The Archivist's Concourse",
        type: "market",
        description:
          "A small market catering to the Archive's constant foot traffic — copyists, couriers, and researchers passing through, more paper and ink for sale here than anywhere else in the Empire.",
      },
      readingSteps: {
        name: "The Reading Steps",
        type: "landmark",
        description:
          "Wide stone steps outside the Archive's main entrance, worn smooth by generations of scholars sitting to read newly copied pages in the sun.",
      },
    },
  },
  tritonath: {
    name: "Tritonath",
    title: "The Gate of the Western Fjords",
    nation: "sanguivorum",
    terrain: "coast",
    isCity: true,
    type: "gate",
    danger: 2,
    services: ["rest", "shop", "healer"],
    description:
      "Built around an ancient lighthouse that predates the Great Mage War, the Kabal, and even the oldest known civilizations, Tritonath exists for a single purpose: to deny passage through the Empire's most strategically important fjord. The city is smaller than Aphroneth or Netturon, but every cliff, wall, and tower has been built with defense in mind. The fjord itself forms a natural kill zone where enemy fleets are trapped beneath the guns, ballistae, and mages stationed high above. The ancient lighthouse remains one of Fragmenta's greatest mysteries — it still burns without fuel, keeper, or known mechanism.",
    connections: [
      { to: "aphroneth", days: 4, mode: "road", desc: "south along the fjord coast" },
      { to: "netturon", days: 2, mode: "road", desc: "along the fjord" },
    ],
    // Tritonath's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, and Aphroneth) — the Civic Quarter
    // (The Fjord Forum) is the first. Every place carries a `district` tag
    // for grouping in cmdLook/cmdPlaces; the Fjord Forum itself is the
    // district's own walkable hub, so it doesn't need one.
    sublocations: {
      fjordForum: {
        name: "The Fjord Forum",
        type: "street",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "The city's administrative district overlooks the narrow waterway that gives Tritonath its purpose.",
      },
      westernGate: {
        name: "The Western Gate",
        type: "gate",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "The heavily fortified land entrance into Tritonath.",
      },
      hallOfFjordCouncil: {
        name: "Hall of the Fjord Council",
        type: "landmark",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "Seat of the city's Ascendus senator and administrative center for the western coast.",
      },
      sentinelSquare: {
        name: "Sentinel Square",
        type: "street",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "A disciplined public square where military announcements, civic ceremonies, and fleet celebrations are held.",
      },
      coastalLedger: {
        name: "The Coastal Ledger",
        type: "board",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "Requests for coastal patrols, monster hunts, reconnaissance, and military contracts are posted here.",
      },
      watchmansWard: {
        name: "Watchman's Ward",
        type: "residential",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "Housing for soldiers, lighthouse attendants, and generations of families who have defended the fjord.",
      },
      vigilisHeadquarters: {
        name: "Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Fjord Forum)",
        description:
          "Coordinates law enforcement and security throughout the city.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      breakwaterMarket: {
        name: "Breakwater Market",
        type: "street",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "A practical marketplace serving soldiers, sailors, and travelers rather than wealthy merchants.",
      },
      fjordExchange: {
        name: "The Fjord Exchange",
        type: "market",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "Stocks expedition supplies, preserved food, climbing equipment, and travel necessities.",
      },
      stonewakeForge: {
        name: "Stonewake Forge",
        type: "shop",
        district: "Commercial Quarter (Breakwater Market)",
        shopCategory: "weapons",
        description:
          "Produces dependable military weapons, siege hardware, anchors, and coastal defenses.",
      },
      bastionArmory: {
        name: "Bastion Armory",
        type: "shop",
        district: "Commercial Quarter (Breakwater Market)",
        shopCategory: "armor",
        description:
          "Crafts armor designed for harsh coastal weather and prolonged military campaigns.",
      },
      tideglassApothecary: {
        name: "Tideglass Apothecary",
        type: "shop",
        district: "Commercial Quarter (Breakwater Market)",
        shopCategory: "potions",
        description:
          "Specializes in cold-weather medicines, healing tonics, antidotes, and remedies for long sea voyages.",
      },
      cliffStables: {
        name: "Cliff Stables",
        type: "landmark",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "Maintains horses used by military couriers traveling inland.",
      },
      beaconsRest: {
        name: "The Beacon's Rest",
        type: "inn",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "A respected inn where sailors, scouts, and officers gather after long patrols.",
      },
      coastTreasury: {
        name: "Coast Treasury",
        type: "landmark",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "Provides secure financial services for merchants, officers, and visiting travelers.",
      },
      harborProvisioners: {
        name: "Harbor Provisioners",
        type: "landmark",
        district: "Commercial Quarter (Breakwater Market)",
        description:
          "Coordinates civilian supplies entering the fortress city.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      fjordBastion: {
        name: "The Fjord Bastion",
        type: "barracks",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "The largest district in Tritonath and the reason the city exists.",
      },
      grandBastion: {
        name: "The Grand Bastion",
        type: "landmark",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "The primary fortress commanding both sides of the fjord entrance.",
      },
      hallOfDefenders: {
        name: "Hall of Defenders",
        type: "landmark",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Strategic command center responsible for all western coastal defenses.",
      },
      legionBarracks: {
        name: "Legion Barracks",
        type: "barracks",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Housing for the permanent Legion garrison assigned to Tritonath.",
      },
      siegeGrounds: {
        name: "Siege Grounds",
        type: "barracks",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Training fields for engineers, ballista crews, and coastal artillery.",
      },
      westernArsenal: {
        name: "Western Arsenal",
        type: "landmark",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Stores weapons, siege engines, ammunition, and defensive equipment.",
      },
      quartermasterFortress: {
        name: "Quartermaster Fortress",
        type: "landmark",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Coordinates military logistics throughout the western coastline.",
      },
      houseOfRestoration: {
        name: "House of Restoration",
        type: "healer",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Treats wounded soldiers and sailors returning from patrol.",
      },
      cliffSignalTower: {
        name: "Cliff Signal Tower",
        type: "landmark",
        district: "Military Quarter (The Fjord Bastion)",
        description:
          "Communicates with nearby forts using magical beacons and signal fires.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // Patron deity Aqualis, the sea itself as protector and executioner
      // — the Grand Temple and Garden of Reflection default prayer to her;
      // Pilgrim's Rest, House of the Faithful, and Sacred Archives stay
      // flavor-only, same treatment as their counterparts in the other
      // cities' Sacred/Crown Precincts.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "The sea is both protector and executioner. The faithful of Aqualis believe those who respect the waters may safely cross them, while those who underestimate them will inevitably be claimed.",
      },
      grandTempleOfAqualis: {
        name: "The Grand Temple of Aqualis",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aqualis"],
        description:
          "The foremost temple of Aqualis in western Sanguivorum. Sailors, fishermen, and naval officers seek blessings before venturing onto the sea, while survivors return in gratitude for safe passage.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Contains twelve shrines honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Shelters pilgrims, sailors, and travelers making the coastal pilgrimage.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Tritonath's clergy and caretakers of the city's sacred traditions.",
      },
      gardenOfReflection: {
        name: "Garden of Reflection",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aqualis"],
        description:
          "A cliffside sanctuary where visitors contemplate the endless sea below.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves centuries of maritime history, miracles, and religious records.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      // The source names both the district hub and its Conclave HQ
      // "Lighthouse Conclave" — same situation as Aphroneth's Sea Bastion,
      // merged into one sublocation rather than two identically-named
      // places.
      lighthouseConclave: {
        name: "Lighthouse Conclave",
        type: "guildhall",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "The Kabal maintains a permanent presence in Tritonath to study the ancient lighthouse and defend the western coast — the official headquarters of the city's Conclave mages.",
      },
      registryOfMariners: {
        name: "Registry of Mariners",
        type: "landmark",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "Registers licensed maritime mages and magical navigators.",
      },
      chamberOfTides: {
        name: "Chamber of Tides",
        type: "landmark",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "Researches hydromancy, coastal weather, and defensive spellcraft.",
      },
      archiveOfBeacon: {
        name: "Archive of the Beacon",
        type: "landmark",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "Contains classified research concerning the ancient lighthouse and its unknown origins.",
      },
      mageQuarters: {
        name: "Mage Quarters",
        type: "residential",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "Housing for Conclave scholars assigned to Tritonath.",
      },
      beaconCircle: {
        name: "Beacon Circle",
        type: "landmark",
        district: "Arcane Quarter (Lighthouse Conclave)",
        description:
          "Reserved for sanctioned magical transportation. Like its counterparts at Zuevaron and Aphroneth, it stands ready for a network that doesn't yet exist.",
      },
      // ---------------------------------------------------- TRADE QUARTER
      harborDefenses: {
        name: "Harbor Defenses",
        type: "docks",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Unlike other ports, Tritonath's harbor exists primarily to support the military.",
      },
      fortressHarbor: {
        name: "Fortress Harbor",
        type: "docks",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Sheltered docks reserved for military vessels and authorized traffic.",
      },
      customsHall: {
        name: "Customs Hall",
        type: "landmark",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Inspects every ship entering the fjord.",
      },
      militaryWarehouses: {
        name: "Military Warehouses",
        type: "landmark",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Stores food, weapons, construction materials, and emergency provisions.",
      },
      harborMastersOffice: {
        name: "Harbor Master's Office",
        type: "landmark",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Coordinates all harbor operations.",
      },
      fleetSupplyDepot: {
        name: "Fleet Supply Depot",
        type: "landmark",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "Maintains supplies for patrol fleets operating along the western coast.",
      },
      fishermansPier: {
        name: "Fisherman's Pier",
        type: "docks",
        district: "Trade Quarter (Harbor Defenses)",
        description:
          "A modest civilian fishing harbor supporting the city's population.",
      },
      // ------------------------------------------------- ARTISAN QUARTER
      // Entirely flavor-only, same principle as the other cities' military-
      // industrial artisan quarters — none of these workshops sell goods
      // matching an existing shop category (weapons/armor/potions/jewelry).
      stonewrightDistrict: {
        name: "Stonewright District",
        type: "street",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "The craftsmen of Tritonath build fortifications meant to withstand centuries.",
      },
      ironBreaker: {
        name: "The Iron Breaker",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Produces siege hardware, chains, anchors, and heavy military equipment.",
      },
      masonsCrown: {
        name: "Mason's Crown",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Constructs the immense stone walls and towers that define Tritonath.",
      },
      sailRopeHall: {
        name: "Sail & Rope Hall",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Produces sails, rigging, banners, and expedition equipment.",
      },
      beaconWorkshop: {
        name: "Beacon Workshop",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Crafts navigation tools, lenses, maps, and signal equipment.",
      },
      fortressWorks: {
        name: "Fortress Works",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Maintains the city's defensive infrastructure.",
      },
      timberHall: {
        name: "Timber Hall",
        type: "landmark",
        district: "Artisan Quarter (Stonewright District)",
        description:
          "Produces siege timbers, dock structures, and military engineering supplies.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      commandHeights: {
        name: "Command Heights",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Perched atop the cliffs overlooking the fjord, this district houses Tritonath's senior leadership.",
      },
      houseOfCoastalWarden: {
        name: "House of the Coastal Warden",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "Residence of Tritonath's Ascendus senator.",
      },
      admiralsEstates: {
        name: "Admiral's Estates",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Homes of retired admirals, commanders, and distinguished officers.",
      },
      embassyHouse: {
        name: "Embassy House",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Limited diplomatic residences for foreign representatives.",
      },
      defendersGarden: {
        name: "Defender's Garden",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "A quiet memorial garden honoring those who died protecting the western coast.",
      },
      hallOfCoastalHonor: {
        name: "Hall of Coastal Honor",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "Recognizes extraordinary acts of service in defense of the Empire.",
      },
      watchmansTable: {
        name: "The Watchman's Table",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "A gathering place for senior officers, scholars, and respected captains.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      ancientLighthouse: {
        name: "The Ancient Lighthouse",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The oldest known structure on Sanguivorum's western coast. Older than the Great Mage War, older than the Kabal, and still burning without fuel or keeper. Its true origin remains unknown, and the Conclave's findings are classified.",
      },
      twinCliffs: {
        name: "The Twin Cliffs",
        type: "landmark",
        district: "City Landmarks",
        description:
          "Towering stone walls that transform the fjord into one of the most defensible waterways in the world.",
      },
      defendersWall: {
        name: "Defender's Wall",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A colossal coastal wall connecting the city's primary fortifications.",
      },
      westernBeacon: {
        name: "The Western Beacon",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A military signal tower used to coordinate defenses along the coastline.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the lighthouse depths, smuggler's caverns, and forgotten battery
      // get "ruin" for skeleton/zombie/animated-armor encounters alongside
      // the bandit/hired-blade "urban" pool; the rest stay purely
      // human-threat "urban".
      lighthouseDepths: {
        name: "The Lighthouse Depths",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Hidden passages beneath the ancient lighthouse whose deepest chambers remain sealed by the Kabal.",
      },
      smugglersCaverns: {
        name: "Smuggler's Caverns",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Sea caves carved beneath the cliffs, once used by smugglers and now inhabited by dangerous creatures.",
      },
      forgottenBattery: {
        name: "The Forgotten Battery",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Ruined coastal fortifications abandoned generations ago.",
      },
      echoCliffs: {
        name: "Echo Cliffs",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "Wind-carved cliffs where strange sounds and unexplained echoes have inspired countless local legends.",
      },
      watchersPath: {
        name: "The Watcher's Path",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A cliffside patrol route frequently used for scouting missions and monster investigations.",
      },
      fjordOverlook: {
        name: "Fjord Overlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The highest accessible point in Tritonath, offering an unobstructed view of the ancient lighthouse, the narrow fjord, and the western sea.",
      },
    },
  },
  vulcaron: {
    name: "Vulcaron",
    title: "The Ember Crown",
    nation: "sanguivorum",
    terrain: "mountain",
    isCity: true,
    type: "gate",
    danger: 2,
    services: ["rest", "shop", "healer"],
    description:
      "Carved directly into the volcanic slopes of the Ashpeak Mountains, Vulcaron is the industrial heart of Sanguivorum. Every hammer strike echoes through its cavernous halls as smiths, miners, and engineers labor day and night. The Empire's finest steel, armor, siege engines, and masterwork weapons all begin their lives in Vulcaron's furnaces. Smoke, molten stone, and the glow of great forges have become as much a part of the city as its people.",
    connections: [
      { to: "silvanor", days: 2, mode: "road" },
      { to: "apollyon", days: 3, mode: "road" },
      { to: "daedaron", days: 2, mode: "road", desc: "along the mountain road" },
    ],
    // Vulcaron's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, and Tritonath) — the
    // Civic Quarter (The Ember Forum) is the first. Every place carries a
    // `district` tag for grouping in cmdLook/cmdPlaces; the Ember Forum
    // itself is the district's own walkable hub, so it doesn't need one.
    sublocations: {
      emberForum: {
        name: "The Ember Forum",
        type: "street",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "The administrative center overseeing the Empire's mining and industrial output.",
      },
      ironGate: {
        name: "The Iron Gate",
        type: "gate",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "Massive reinforced gates built to withstand both invasion and volcanic tremors.",
      },
      hallOfForgeSenate: {
        name: "Hall of the Forge Senate",
        type: "landmark",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "Seat of Vulcaron's Ascendus senator, where production quotas, mining rights, and civic law are administered.",
      },
      emberSquare: {
        name: "Ember Square",
        type: "street",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "A broad plaza illuminated by ever-burning braziers where civic announcements and festivals are held.",
      },
      foundryLedger: {
        name: "The Foundry Ledger",
        type: "board",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "Mining contracts, monster extermination, ore deliveries, and engineering commissions are posted daily.",
      },
      minersWard: {
        name: "Miner's Ward",
        type: "residential",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "Home to generations of miners, smelters, and forge workers.",
      },
      forgeVigilisHeadquarters: {
        name: "Forge Vigilis Headquarters",
        type: "barracks",
        district: "Civic Quarter (The Ember Forum)",
        description:
          "Maintains order throughout the city's industrial districts.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      moltenMarket: {
        name: "The Molten Market",
        type: "street",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "A marketplace built around craftsmanship rather than luxury.",
      },
      ironExchange: {
        name: "The Iron Exchange",
        type: "market",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "Stocks mining equipment, travel supplies, tools, and everyday necessities.",
      },
      emberheartForge: {
        name: "Emberheart Forge",
        type: "shop",
        district: "Commercial Quarter (The Molten Market)",
        shopCategory: "weapons",
        description:
          "Renowned throughout Fragmenta for producing exceptional weapons forged from the finest Vulcaron steel.",
      },
      bastionPlateworks: {
        name: "Bastion Plateworks",
        type: "shop",
        district: "Commercial Quarter (The Molten Market)",
        shopCategory: "armor",
        description:
          "Creates heavy armor trusted by Legion veterans across the Empire.",
      },
      ashenCrucible: {
        name: "Ashen Crucible",
        type: "shop",
        district: "Commercial Quarter (The Molten Market)",
        shopCategory: "potions",
        description:
          "Specializes in fire-resistant salves, explosive compounds, mineral reagents, and industrial chemicals.",
      },
      packmasterStables: {
        name: "Packmaster Stables",
        type: "landmark",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "Maintains mules and pack animals used throughout the surrounding mines.",
      },
      smolderingTankard: {
        name: "The Smoldering Tankard",
        type: "inn",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "A favorite gathering place for miners, engineers, and visiting adventurers.",
      },
      ironReserve: {
        name: "Iron Reserve",
        type: "landmark",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "Stores merchant wealth and finances mining operations.",
      },
      guildOfSmiths: {
        name: "Guild of Smiths",
        type: "guildhall",
        district: "Commercial Quarter (The Molten Market)",
        description:
          "Headquarters of Sanguivorum's most influential smithing guild.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      // The source names both the district hub and the Legion's central
      // production complex "The Great Foundry" — same situation as
      // Aphroneth's Sea Bastion and Tritonath's Lighthouse Conclave,
      // merged into one sublocation.
      greatFoundry: {
        name: "The Great Foundry",
        type: "barracks",
        district: "Military Quarter (The Great Foundry)",
        description:
          "The military-industrial heart of the Empire — a massive complex producing weapons, armor, siege engines, and military equipment for every Legion.",
      },
      hallOfEngineers: {
        name: "Hall of Engineers",
        type: "landmark",
        district: "Military Quarter (The Great Foundry)",
        description:
          "The headquarters of Ingenum's greatest military engineers.",
      },
      legionBarracks: {
        name: "Legion Barracks",
        type: "barracks",
        district: "Military Quarter (The Great Foundry)",
        description:
          "Home to soldiers assigned to defend Vulcaron's vital industries.",
      },
      testingGrounds: {
        name: "The Testing Grounds",
        type: "barracks",
        district: "Military Quarter (The Great Foundry)",
        description:
          "Experimental siege weapons and military equipment are tested here before deployment.",
      },
      imperialArsenal: {
        name: "Imperial Arsenal",
        type: "landmark",
        district: "Military Quarter (The Great Foundry)",
        description:
          "The Empire's largest secure weapons repository.",
      },
      quartermasterDepot: {
        name: "Quartermaster Depot",
        type: "landmark",
        district: "Military Quarter (The Great Foundry)",
        description:
          "Coordinates military production and distribution across Sanguivorum.",
      },
      houseOfRecovery: {
        name: "House of Recovery",
        type: "healer",
        district: "Military Quarter (The Great Foundry)",
        description:
          "Treats industrial injuries, burns, and wounded soldiers.",
      },
      furnaceBastion: {
        name: "Furnace Bastion",
        type: "landmark",
        district: "Military Quarter (The Great Foundry)",
        description:
          "A towering fortress overlooking the city and its volcanic approaches.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // Patron deity Pyreith, the refining flame — the Grand Temple and
      // Garden of Embers both default prayer to him; Pilgrim's Rest,
      // House of the Faithful, and Sacred Archives stay flavor-only.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Fire is both creator and destroyer. The faithful of Pyreith believe that only through trial, sacrifice, and the refining flame can greatness be achieved.",
      },
      grandTempleOfPyreith: {
        name: "The Grand Temple of Pyreith",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Pyreith"],
        description:
          "The greatest temple to Pyreith in Sanguivorum, where smiths bless newly forged masterpieces and craftsmen offer thanks for successful works.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Twelve shrines honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Shelters craftsmen, pilgrims, and travelers seeking Pyreith's blessing.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Vulcaron's clergy.",
      },
      gardenOfEmbers: {
        name: "Garden of Embers",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Pyreith"],
        description:
          "A contemplative courtyard where eternal braziers symbolize renewal through fire.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Records miracles, masterworks, and centuries of the city's religious history.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      emberConclave: {
        name: "The Ember Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "The Kabal's center for studying fire magic, metallurgy, and volcanic phenomena.",
      },
      emberConclaveHall: {
        name: "Ember Conclave Hall",
        type: "guildhall",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Official headquarters of the Kabal within Vulcaron.",
      },
      registryOfArtificers: {
        name: "Registry of Artificers",
        type: "landmark",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Registers licensed magical craftsmen and smith-mages.",
      },
      chamberOfFlame: {
        name: "Chamber of Flame",
        type: "landmark",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Advanced instruction in fire magic and magical metallurgy.",
      },
      archiveOfEmbers: {
        name: "Archive of Embers",
        type: "landmark",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Contains research concerning volcanic activity, magical alloys, and elemental phenomena.",
      },
      mageQuarters: {
        name: "Mage Quarters",
        type: "residential",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Housing for resident Conclave scholars.",
      },
      forgeCircle: {
        name: "Forge Circle",
        type: "landmark",
        district: "Arcane Quarter (The Ember Conclave)",
        description:
          "Reserved for sanctioned magical transportation. Like its counterparts elsewhere in the Empire, it stands ready for a network that doesn't yet exist.",
      },
      // ---------------------------------------------------- TRADE QUARTER
      oreExchange: {
        name: "The Ore Exchange",
        type: "street",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Raw materials flow through this district before becoming the Empire's greatest weapons.",
      },
      oreGate: {
        name: "Ore Gate",
        type: "gate",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Primary entrance for mining caravans arriving from the surrounding mountains.",
      },
      customsHall: {
        name: "Customs Hall",
        type: "landmark",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Inspects incoming ore shipments and commercial goods.",
      },
      greatSmelters: {
        name: "The Great Smelters",
        type: "landmark",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Massive furnaces refining ore from across Sanguivorum.",
      },
      oreWarehouses: {
        name: "Ore Warehouses",
        type: "landmark",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Secure storage for precious metals and refined materials.",
      },
      minersGuildHall: {
        name: "Miner's Guild Hall",
        type: "guildhall",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Coordinates mining operations throughout the region.",
      },
      freightOffice: {
        name: "Freight Office",
        type: "landmark",
        district: "Trade Quarter (The Ore Exchange)",
        description:
          "Organizes industrial transport across the Empire.",
      },
      // ------------------------------------------------- ARTISAN QUARTER
      hammerWard: {
        name: "Hammer Ward",
        type: "street",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "No district in Fragmenta rivals the concentration of master craftsmen found here.",
      },
      kingsHammer: {
        name: "King's Hammer",
        type: "landmark",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "Produces legendary weapons commissioned by nobles and heroes alike.",
      },
      stonecuttersHall: {
        name: "Stonecutter's Hall",
        type: "landmark",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "Responsible for Vulcaron's monumental architecture.",
      },
      emberStitch: {
        name: "Ember Stitch",
        type: "landmark",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "Crafts protective garments, forge aprons, and expedition equipment.",
      },
      gemfireJewelers: {
        name: "Gemfire Jewelers",
        type: "shop",
        district: "Artisan Quarter (Hammer Ward)",
        shopCategory: "jewelry",
        description:
          "Works precious gems recovered from the volcanic depths.",
      },
      mastersWorkshop: {
        name: "Master's Workshop",
        type: "landmark",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "Shared workshops where master craftsmen collaborate on extraordinary commissions.",
      },
      timberAndTongs: {
        name: "Timber & Tongs",
        type: "landmark",
        district: "Artisan Quarter (Hammer Ward)",
        description:
          "Produces mining supports, wagons, and industrial frameworks.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      ashenHeights: {
        name: "Ashen Heights",
        type: "residential",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Home to Vulcaron's wealthiest industrial families and senior engineers.",
      },
      houseOfForgeLord: {
        name: "House of the Forge Lord",
        type: "landmark",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Residence of Vulcaron's Ascendus senator.",
      },
      foundersEstates: {
        name: "Founder's Estates",
        type: "residential",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Homes of influential mining dynasties and master smiths.",
      },
      embassyCourt: {
        name: "Embassy Court",
        type: "residential",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Hosts foreign representatives seeking trade agreements.",
      },
      emberGardens: {
        name: "Ember Gardens",
        type: "landmark",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Terraced gardens warmed year-round by geothermal vents.",
      },
      hallOfMasterworks: {
        name: "Hall of Masterworks",
        type: "landmark",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "Displays history's greatest creations forged within Vulcaron.",
      },
      crucibleClub: {
        name: "The Crucible Club",
        type: "landmark",
        district: "Noble Quarter (Ashen Heights)",
        description:
          "An exclusive gathering place for master craftsmen, engineers, and industrial leaders.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      worldForge: {
        name: "The World Forge",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The largest forge in Fragmenta, its colossal furnaces burn continuously and supply the Empire with its greatest works.",
      },
      greatLift: {
        name: "The Great Lift",
        type: "landmark",
        district: "City Landmarks",
        description:
          "An enormous mechanical elevator carrying miners and cargo between the city and the volcanic depths.",
      },
      ashCrown: {
        name: "The Ash Crown",
        type: "landmark",
        district: "City Landmarks",
        description:
          "The ring of towering smokestacks and chimneys that crowns Vulcaron and can be seen for miles.",
      },
      riverOfFire: {
        name: "River of Fire",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A controlled channel of molten rock flowing through the industrial district, powering foundries and smelters.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the deep mines, abandoned shaft, and forgotten forge get "ruin"
      // for skeleton/zombie/animated-armor encounters alongside the
      // bandit/hired-blade "urban" pool. The Magma Caverns instead get
      // "volcanic" (not "urban") — unlike "coast" (checked and rejected
      // for Aphroneth's Tide Pools, where the only tagged creatures were
      // rare/elite/world-boss), "volcanic" has genuine common/uncommon
      // wildlife (Cave Scorpion, Thornhide) alongside rarer threats
      // (Ashwyrm, Dragon), so it adds real variety without the balance
      // risk "coast" would have.
      deepMines: {
        name: "The Deep Mines",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "An immense network of mining tunnels descending deep beneath the mountains, where ancient creatures and forgotten ruins await discovery.",
      },
      abandonedShaft: {
        name: "The Abandoned Shaft",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "A collapsed mine officially sealed after unexplained disappearances.",
      },
      magmaCaverns: {
        name: "The Magma Caverns",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["volcanic"],
        description:
          "Natural volcanic chambers filled with rare minerals, lava flows, and dangerous wildlife.",
      },
      forgottenForge: {
        name: "The Forgotten Forge",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The ruins of one of Vulcaron's earliest smithies, abandoned long before the Empire's rise.",
      },
      engineersDescent: {
        name: "Engineer's Descent",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A staging area for expeditions investigating newly discovered tunnels and unstable mine workings.",
      },
      ashOverlook: {
        name: "The Ash Overlook",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A high volcanic ridge offering breathtaking views of Vulcaron, its furnaces, and the surrounding mountain range.",
      },
    },
  },
  daedaron: {
    name: "Daedaron",
    title: "The City of Endless Innovation",
    nation: "sanguivorum",
    terrain: "mountain",
    isCity: true,
    type: "gate",
    danger: 1,
    services: ["rest", "shop", "healer"],
    description:
      "If Vulcaron provides the Empire with raw strength, Daedaron transforms that strength into progress. Every street echoes with invention as engineers, architects, artisans, and scholars continually refine the tools that shape Sanguivorum. New cranes rise beside experimental mills, aqueducts feed ingenious waterworks, and workshops compete to produce the next breakthrough. The city never truly sleeps — somewhere, another prototype is always being built.",
    connections: [
      { to: "vulcaron", days: 2, mode: "road", desc: "along the mountain road" },
      { to: "apollyon", days: 3, mode: "road" },
    ],
    // Daedaron's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, and Vulcaron)
    // — the Civic Quarter (The Inventor's Forum) is the first. Every
    // place carries a `district` tag for grouping in cmdLook/cmdPlaces;
    // the Inventor's Forum itself is the district's own walkable hub, so
    // it doesn't need one.
    sublocations: {
      inventorsForum: {
        name: "The Inventor's Forum",
        type: "street",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "The administrative center responsible for regulating innovation, patents, and public works.",
      },
      innovatorsGate: {
        name: "The Innovator's Gate",
        type: "gate",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "A monumental entrance displaying the greatest engineering achievements of Daedaron.",
      },
      hallOfCivicWorks: {
        name: "Hall of Civic Works",
        type: "landmark",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "The city's Ascendus senator oversees public construction, infrastructure, and engineering initiatives.",
      },
      foundersSquare: {
        name: "Founder's Square",
        type: "street",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "Public demonstrations of new inventions frequently take place in the city's central plaza.",
      },
      buildersLedger: {
        name: "The Builder's Ledger",
        type: "board",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "Construction contracts, engineering commissions, surveying work, and prototype testing requests are posted daily.",
      },
      scholarsWard: {
        name: "Scholar's Ward",
        type: "residential",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "Home to engineers, architects, inventors, and their families.",
      },
      civicEngineeringOffice: {
        name: "Civic Engineering Office",
        type: "landmark",
        district: "Civic Quarter (The Inventor's Forum)",
        description:
          "Coordinates roads, bridges, aqueducts, and public infrastructure.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      innovatorsExchange: {
        name: "The Innovator's Exchange",
        type: "street",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "Every merchant sells something designed to make life easier.",
      },
      utilityHouse: {
        name: "The Utility House",
        type: "market",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "Carries practical equipment, tools, travel gear, and specialized instruments.",
      },
      precisionForge: {
        name: "Precision Forge",
        type: "shop",
        district: "Commercial Quarter (The Innovator's Exchange)",
        shopCategory: "weapons",
        description:
          "Produces finely machined weapons, tools, gears, and mechanical components.",
      },
      reinforcedPlate: {
        name: "Reinforced Plate",
        type: "shop",
        district: "Commercial Quarter (The Innovator's Exchange)",
        shopCategory: "armor",
        description:
          "Specializes in expertly balanced armor favored by engineers and officers.",
      },
      catalystLaboratory: {
        name: "Catalyst Laboratory",
        type: "shop",
        district: "Commercial Quarter (The Innovator's Exchange)",
        shopCategory: "potions",
        description:
          "Produces industrial chemicals, solvents, adhesives, and advanced alchemical mixtures.",
      },
      buildersStable: {
        name: "Builder's Stable",
        type: "landmark",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "Maintains draft animals used for heavy construction projects.",
      },
      blueprintTavern: {
        name: "The Blueprint Tavern",
        type: "inn",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "A gathering place where inventors exchange ideas late into the night.",
      },
      engineersReserve: {
        name: "Engineer's Reserve",
        type: "landmark",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "Finances ambitious construction projects and commercial innovation.",
      },
      guildOfMakers: {
        name: "Guild of Makers",
        type: "guildhall",
        district: "Commercial Quarter (The Innovator's Exchange)",
        description:
          "Represents Daedaron's engineers, builders, and craftsmen.",
      },
      // -------------------------------------------------- MILITARY QUARTER
      // The source names both the district hub and its central production
      // complex "The Engine Bastion" — same situation as the other
      // cities' Sea Bastion/Great Foundry/Lighthouse Conclave, merged
      // into one sublocation.
      engineBastion: {
        name: "The Engine Bastion",
        type: "barracks",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Engineering is as vital to war as swords — this fortress protects Daedaron's workshops and experimental facilities.",
      },
      hallOfIngenum: {
        name: "Hall of Ingenum",
        type: "landmark",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "The principal headquarters of the Empire's engineering corps.",
      },
      legionBarracks: {
        name: "Legion Barracks",
        type: "barracks",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Permanent garrison assigned to defend the city's strategic industries.",
      },
      provingGrounds: {
        name: "Proving Grounds",
        type: "barracks",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Experimental siege engines, fortifications, and battlefield innovations are tested here.",
      },
      engineeringArsenal: {
        name: "Engineering Arsenal",
        type: "landmark",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Stores prototypes, military equipment, and siege machinery.",
      },
      logisticsCommand: {
        name: "Logistics Command",
        type: "landmark",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Coordinates engineering support for every Legion.",
      },
      houseOfRestoration: {
        name: "House of Restoration",
        type: "healer",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Treats injuries common among engineers, laborers, and soldiers.",
      },
      observationTower: {
        name: "The Observation Tower",
        type: "landmark",
        district: "Military Quarter (The Engine Bastion)",
        description:
          "Used to oversee construction throughout the expanding city.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      // Patron deity Nystros, embracing calculated risk, creativity, and
      // the unpredictable nature of progress — the Grand Temple and
      // Garden of Possibility both default prayer to him; Pilgrim's Rest,
      // House of the Faithful, and Sacred Archives stay flavor-only.
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Innovation requires uncertainty. Every discovery begins by stepping beyond what is known. For this reason Daedaron honors Nystros, embracing calculated risk, creativity, and the unpredictable nature of progress.",
      },
      grandTempleOfNystros: {
        name: "The Grand Temple of Nystros",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Nystros"],
        description:
          "The greatest sanctuary dedicated to Nystros in Sanguivorum, where inventors seek inspiration before beginning ambitious projects and craftsmen offer thanks when experiments succeed.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Contains twelve shrines honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Welcomes pilgrims, scholars, and travelers alike.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Daedaron's clergy.",
      },
      gardenOfPossibility: {
        name: "Garden of Possibility",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Nystros"],
        description:
          "A constantly changing garden whose design is intentionally altered throughout the year to symbolize continual change.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves scripture, notable inventions dedicated to Nystros, and the city's religious history.",
      },
      // ---------------------------------------------------- ARCANE QUARTER
      // The source names the district hub "The Inventor's Conclave" and
      // its Kabal headquarters building just "Inventor's Conclave" — an
      // even subtler version of the Sea Bastion/Great Foundry/Engine
      // Bastion collision, since "go" always strips a leading "the" off
      // the player's query. Merged into one sublocation rather than
      // leaving the hub unreachable.
      inventorsConclave: {
        name: "The Inventor's Conclave",
        type: "guildhall",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "The Kabal's foremost center for magical engineering and arcane experimentation — the official headquarters of the Kabal within Daedaron.",
      },
      registryOfInnovators: {
        name: "Registry of Innovators",
        type: "landmark",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "Registers magical engineers, artificers, and experimental researchers.",
      },
      chamberOfInnovation: {
        name: "Chamber of Innovation",
        type: "landmark",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "Studies the interaction between magic and engineering.",
      },
      archiveOfMechanisms: {
        name: "Archive of Mechanisms",
        type: "landmark",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "Contains research on magical devices, constructs, and experimental technologies.",
      },
      mageWorkshops: {
        name: "Mage Workshops",
        type: "residential",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "Housing and laboratories for resident Conclave researchers.",
      },
      innovationCircle: {
        name: "Innovation Circle",
        type: "landmark",
        district: "Arcane Quarter (The Inventor's Conclave)",
        description:
          "Reserved for sanctioned magical transportation. Like its counterparts elsewhere in the Empire, it stands ready for a network that doesn't yet exist.",
      },
      // ---------------------------------------------------- TRADE QUARTER
      buildersExchange: {
        name: "The Builder's Exchange",
        type: "street",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Every major construction project in Sanguivorum begins here.",
      },
      buildersGate: {
        name: "Builder's Gate",
        type: "gate",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Primary entrance for construction caravans and heavy freight.",
      },
      materialsOffice: {
        name: "Materials Office",
        type: "landmark",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Records incoming timber, stone, iron, and industrial supplies.",
      },
      grandStorehouses: {
        name: "Grand Storehouses",
        type: "landmark",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Warehouses holding construction materials awaiting distribution.",
      },
      surveyorsHall: {
        name: "Surveyor's Hall",
        type: "guildhall",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Coordinates public works and infrastructure across the Empire.",
      },
      freightBureau: {
        name: "Freight Bureau",
        type: "landmark",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Schedules transportation for large engineering projects.",
      },
      craneYard: {
        name: "Crane Yard",
        type: "landmark",
        district: "Trade Quarter (The Builder's Exchange)",
        description:
          "Massive lifting equipment operates continuously to load and unload heavy cargo.",
      },
      // ------------------------------------------------- ARTISAN QUARTER
      workshopDistrict: {
        name: "Workshop District",
        type: "street",
        district: "Artisan Quarter (Workshop District)",
        description:
          "The most technologically advanced district in Sanguivorum.",
      },
      masterworkForge: {
        name: "Masterwork Forge",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "Produces precision-crafted tools, instruments, and custom commissions.",
      },
      stonewrightHall: {
        name: "Stonewright Hall",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "Designs monumental architecture and advanced structural systems.",
      },
      weaversMeasure: {
        name: "Weaver's Measure",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "Produces specialized work clothing, uniforms, and expedition equipment.",
      },
      clockmakersGuild: {
        name: "Clockmaker's Guild",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "Builds precision instruments, measuring devices, and intricate mechanical works.",
      },
      prototypeHall: {
        name: "Prototype Hall",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "A communal workshop where inventors test and refine new creations.",
      },
      timberworks: {
        name: "Timberworks",
        type: "landmark",
        district: "Artisan Quarter (Workshop District)",
        description:
          "Produces structural beams, bridges, wagons, and machinery frames.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      foundersHeights: {
        name: "Founder's Heights",
        type: "residential",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "Home to Daedaron's greatest inventors, engineers, and industrial patrons.",
      },
      houseOfMasterBuilder: {
        name: "House of the Master Builder",
        type: "landmark",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "Residence of Daedaron's Ascendus senator.",
      },
      inventorsEstates: {
        name: "Inventor's Estates",
        type: "residential",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "Homes belonging to celebrated engineers and wealthy industrialists.",
      },
      embassyCourt: {
        name: "Embassy Court",
        type: "residential",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "Hosts foreign delegations seeking Daedaron's expertise.",
      },
      innovationGardens: {
        name: "Innovation Gardens",
        type: "landmark",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "An elegant public garden showcasing fountains, sculptures, and ingenious mechanical displays.",
      },
      hallOfGreatWorks: {
        name: "Hall of Great Works",
        type: "landmark",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "Honors the inventions and infrastructure that transformed Sanguivorum.",
      },
      architectsCircle: {
        name: "The Architect's Circle",
        type: "landmark",
        district: "Noble Quarter (Founder's Heights)",
        description:
          "A private gathering place where the Empire's foremost builders and engineers exchange ideas.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      grandAqueduct: {
        name: "The Grand Aqueduct",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A marvel of engineering supplying fresh water throughout the city and serving as a testament to Daedaron's ingenuity.",
      },
      colossusCrane: {
        name: "The Colossus Crane",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A gigantic lifting machine capable of moving enormous stone blocks and ship components, visible from nearly every district.",
      },
      hallOfIngenuity: {
        name: "The Hall of Ingenuity",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A museum and exhibition hall displaying the greatest inventions ever produced within the Empire.",
      },
      thousandGears: {
        name: "The Thousand Gears",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A monumental mechanical clock whose moving gears have become the symbol of Daedaron.",
      },
      // ------------------------------------------------- EXPLORATION LOCATIONS
      // Standalone and unsafe, same structure as the other cities' batches
      // — the abandoned laboratories, waterworks, founder's workshop, and
      // broken engine get "ruin" for skeleton/zombie/animated-armor
      // encounters alongside the bandit/hired-blade "urban" pool. Surveyor's
      // Camp and the High Observatory are active, still-used sites (a
      // staging area and a working watchtower, not abandoned ruins), so
      // they stay "urban" only.
      prototypeVaults: {
        name: "The Prototype Vaults",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "Abandoned laboratories containing unstable inventions, forgotten experiments, and dangerous constructs.",
      },
      oldWaterworks: {
        name: "The Old Waterworks",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "An obsolete aqueduct system now serving as hidden tunnels beneath the city.",
      },
      foundersWorkshop: {
        name: "The Founder's Workshop",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The preserved workshop of Daedaron's legendary founder, left largely untouched for generations.",
      },
      brokenEngine: {
        name: "The Broken Engine",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban", "ruin"],
        description:
          "The remains of an enormous experimental machine whose original purpose has been lost to history.",
      },
      surveyorsCamp: {
        name: "Surveyor's Camp",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "A staging area where expeditions depart to design roads, bridges, and settlements across the Empire.",
      },
      highObservatory: {
        name: "The High Observatory",
        type: "ruins",
        district: "Exploration Locations",
        dangerTags: ["urban"],
        description:
          "The tallest tower in Daedaron, offering sweeping views of the city's countless workshops, cranes, and engineering marvels.",
      },
    },
  },
  silvanor: {
    name: "Silvanor",
    nation: "sanguivorum",
    terrain: "mountain",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description:
      "A quiet mountain town beneath the northern range, known mostly for the trees that cluster oddly close around it — no one has ever quite explained why nothing is logged within a mile of the walls.",
    connections: [
      { to: "vulcaron", days: 2, mode: "road" },
      { to: "netturon", days: 3, mode: "road" },
    ],
  },
  netturon: {
    name: "Netturon",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 1,
    services: ["rest", "shop"],
    description: "A western meadow town near the fjord coast, where the Legionus Aqualis keeps a permanent garrison and no one fishes without a permit.",
    connections: [
      { to: "silvanor", days: 3, mode: "road" },
      { to: "arnoneth", days: 3, mode: "road" },
      { to: "tritonath", days: 2, mode: "road", desc: "along the fjord" },
    ],
  },
  arnoneth: {
    name: "Arnoneth",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 1,
    services: ["rest"],
    description: "A fjord-adjacent town whose harbor is entirely the Legionus Aqualis's to permit or deny.",
    connections: [
      { to: "netturon", days: 3, mode: "road" },
      { to: "decearon", days: 2, mode: "road" },
      { to: "aphroneth", days: 3, mode: "road", desc: "down the coast" },
    ],
  },
  decearon: {
    name: "Decearon",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 1,
    services: ["rest", "shop"],
    description: "A market town on the meadow's western edge, its granaries older than the current Senate.",
    connections: [
      { to: "arnoneth", days: 2, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
      { to: "marsatum", days: 4, mode: "road" },
    ],
  },
  minervon: {
    name: "Minervon",
    title: "The Crucible of Command",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 1,
    services: ["rest", "shop"],
    description:
      "No city has produced more generals, strategists, or military scholars than Minervon. Here, battles are fought long before armies ever march. Every street reflects discipline and preparation, from the orderly parade grounds to the lecture halls where tomorrow's commanders study the victories and failures of centuries past. While Arethon creates soldiers, Minervon creates leaders.",
    connections: [
      { to: "apollyon", days: 3, mode: "road" },
      { to: "decearon", days: 3, mode: "road" },
      { to: "victolath", days: 3, mode: "road" },
    ],
    // Minervon's real district layout, built quarter by quarter (same
    // workflow as Arethon, Zuevaron, Aphroneth, Tritonath, Vulcaron, and
    // Daedaron) — the Civic Quarter (The Scholar's Forum) is the first.
    // Every place carries a `district` tag for grouping in
    // cmdLook/cmdPlaces; the Scholar's Forum itself is the district's own
    // walkable hub, so it doesn't need one. Minervon is an existing stub
    // (exact name match, no rename needed like Vulcaron) — its prior
    // one-line stub description and services/connections are preserved,
    // with title and full sublocations layered on top.
    sublocations: {
      scholarsForum: {
        name: "The Scholar's Forum",
        type: "street",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "The administrative heart of Minervon, where military education and civic governance are held in equal esteem.",
      },
      commandGate: {
        name: "The Command Gate",
        type: "gate",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "The principal entrance to the city, flanked by statues of legendary commanders.",
      },
      hallOfCommand: {
        name: "Hall of Command",
        type: "landmark",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "The seat of Minervon's Ascendus senator and the administrative center for the city's military institutions.",
      },
      victorySquare: {
        name: "Victory Square",
        type: "street",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "A ceremonial plaza where cadets graduate, officers are commissioned, and military victories are celebrated.",
      },
      strategistsLedger: {
        name: "The Strategist's Ledger",
        type: "board",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "Posts tactical exercises, courier assignments, officer requests, reconnaissance missions, and academic commissions.",
      },
      scholarsWard: {
        name: "Scholar's Ward",
        type: "residential",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "Home to professors, retired officers, tacticians, and generations of military families.",
      },
      civicAdministration: {
        name: "Civic Administration",
        type: "landmark",
        district: "Civic Quarter (The Scholar's Forum)",
        description:
          "Coordinates education, public works, and civic affairs throughout the city.",
      },
      // ------------------------------------------------ COMMERCIAL QUARTER
      officersExchange: {
        name: "Officer's Exchange",
        type: "street",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "Every merchant serves those preparing for campaign.",
      },
      quartermastersSupply: {
        name: "The Quartermaster's Supply",
        type: "market",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "Carries expedition gear, field equipment, maps, and military supplies.",
      },
      commandForge: {
        name: "Command Forge",
        type: "shop",
        district: "Commercial Quarter (Officer's Exchange)",
        shopCategory: "weapons",
        description:
          "Produces officer weapons, ceremonial blades, and finely balanced military arms.",
      },
      legionPlate: {
        name: "Legion Plate",
        type: "shop",
        district: "Commercial Quarter (Officer's Exchange)",
        shopCategory: "armor",
        description:
          "Specializes in officer armor, command insignia, and decorated military equipment.",
      },
      scholarsElixirs: {
        name: "Scholar's Elixirs",
        type: "shop",
        district: "Commercial Quarter (Officer's Exchange)",
        shopCategory: "potions",
        description:
          "Produces battlefield medicines, stimulants, memory tonics, and tactical supplies.",
      },
      courierStables: {
        name: "Courier Stables",
        type: "landmark",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "Maintains swift horses for messengers and military officers.",
      },
      generalsTable: {
        name: "The General's Table",
        type: "inn",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "A respected inn where officers, instructors, and distinguished visitors gather to discuss campaigns over dinner.",
      },
      officersTreasury: {
        name: "Officer's Treasury",
        type: "landmark",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "Provides financial services for officers, scholars, and military institutions.",
      },
      militarySuppliersGuild: {
        name: "Military Supplier's Guild",
        type: "guildhall",
        district: "Commercial Quarter (Officer's Exchange)",
        description:
          "Coordinates contracts supporting the Empire's officer corps.",
      },
      // ------------------------------------------------- MILITARY QUARTER
      // Source names both the district hub and its central command
      // fortress "The Command Citadel" — merged into one sublocation, same
      // as the other cities' Sea Bastion/Great Foundry/Engine Bastion.
      commandCitadel: {
        name: "The Command Citadel",
        type: "barracks",
        district: "Military Quarter (The Command Citadel)",
        description:
          "The intellectual heart of Sanguivorum's military — the fortress overseeing Minervon's military academies and officer corps.",
      },
      hallOfGenerals: {
        name: "Hall of Generals",
        type: "landmark",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Preserves campaign records while serving as the city's operational command center.",
      },
      officerBarracks: {
        name: "Officer Barracks",
        type: "barracks",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Housing for instructors, cadets, and visiting commanders.",
      },
      fieldAcademy: {
        name: "Field Academy",
        type: "barracks",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Large tactical training grounds where cadets command simulated battles.",
      },
      imperialArsenal: {
        name: "Imperial Arsenal",
        type: "landmark",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Stores training equipment, weapons, banners, and ceremonial arms.",
      },
      strategicCommand: {
        name: "Strategic Command",
        type: "landmark",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Coordinates officer assignments throughout the Empire.",
      },
      houseOfRecovery: {
        name: "House of Recovery",
        type: "healer",
        district: "Military Quarter (The Command Citadel)",
        description:
          "Treats cadets and soldiers injured during training.",
      },
      victoryTower: {
        name: "Victory Tower",
        type: "landmark",
        district: "Military Quarter (The Command Citadel)",
        description:
          "A tall observation tower overlooking every academy and training field.",
      },
      // ------------------------------------------------- RELIGIOUS QUARTER
      sacredPrecinct: {
        name: "The Sacred Precinct",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Knowledge is the foundation of victory. The faithful of Ithrien believe wisdom earned through study is the greatest weapon any leader can possess.",
      },
      grandTempleOfIthrien: {
        name: "The Grand Temple of Ithrien",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Ithrien"],
        description:
          "The greatest sanctuary dedicated to Ithrien in Sanguivorum. Officers, scholars, judges, and students seek guidance here before making decisions that may shape the future of thousands.",
      },
      hallOfTwelve: {
        name: "Hall of the Twelve",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Aelthyr", "Mortasha", "Veylana", "Kar'Mhal", "Ithrien", "Seressa", "Nystros", "Xalaxar", "Aethyra", "Pyreith", "Aqualis", "Chronaeus"],
        description:
          "Contains twelve shrines honoring every deity of Fragmenta.",
      },
      pilgrimsRest: {
        name: "Pilgrim's Rest",
        type: "inn",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Welcomes scholars, clergy, military pilgrims, and travelers.",
      },
      houseOfFaithful: {
        name: "House of the Faithful",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Residence of Minervon's clergy and teachers of the faith.",
      },
      gardenOfContemplation: {
        name: "Garden of Contemplation",
        type: "temple",
        district: "Religious Quarter (The Sacred Precinct)",
        gods: ["Ithrien"],
        description:
          "A silent courtyard designed for reflection, meditation, and careful thought.",
      },
      sacredArchives: {
        name: "Sacred Archives",
        type: "landmark",
        district: "Religious Quarter (The Sacred Precinct)",
        description:
          "Preserves scripture, philosophical works, and centuries of theological scholarship.",
      },
      // ----------------------------------------------------- ARCANE QUARTER
      // Source lists "The School of Manipulum Eruditetus" as both this
      // quarter's hub AND, later, as a standalone entry under "City
      // Landmarks" — the same flagship-building-shares-the-quarter-name
      // pattern seen elsewhere this session (Sea Bastion, Great Foundry,
      // Engine Bastion, Command Citadel), just spanning two sections of the
      // source document instead of one. Merged into a single sublocation
      // here (combining both blurbs) so the City Landmarks batch doesn't
      // recreate an identically-named, permanently-unreachable duplicate.
      schoolOfManipulumEruditetus: {
        name: "The School of Manipulum Eruditetus",
        type: "guildhall",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "The Empire's foremost institution for military magic and advanced strategic education. Many of Sanguivorum's greatest battle mages receive their education here before serving alongside the Legions — the most prestigious military academy in Fragmenta, producing the Empire's greatest commanders, strategists, and battle mages.",
      },
      grandLectureHall: {
        name: "Grand Lecture Hall",
        type: "landmark",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "The central academy where military strategy and magical theory are taught.",
      },
      registryOfScholars: {
        name: "Registry of Scholars",
        type: "landmark",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "Registers battle mages, instructors, and advanced magical researchers.",
      },
      chamberOfTheory: {
        name: "Chamber of Theory",
        type: "landmark",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "Dedicated to tactical spellcraft, magical logistics, and battlefield coordination.",
      },
      grandRepository: {
        name: "Grand Repository",
        type: "landmark",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "One of the greatest libraries in the Empire, containing military history, magical research, and strategic doctrine.",
      },
      scholarsResidence: {
        name: "Scholar's Residence",
        type: "residential",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "Housing for professors, students, and visiting scholars.",
      },
      eruditusCircle: {
        name: "Eruditus Circle",
        type: "landmark",
        district: "Arcane Quarter (The School of Manipulum Eruditetus)",
        description:
          "Reserved for sanctioned magical transportation.",
      },
      // ------------------------------------------------------ TRADE QUARTER
      logisticsQuarter: {
        name: "The Logistics Quarter",
        type: "street",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "An organized district ensuring every Legion receives what it needs.",
      },
      supplyGate: {
        name: "Supply Gate",
        type: "gate",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Primary entrance for military caravans.",
      },
      militaryCustoms: {
        name: "Military Customs",
        type: "landmark",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Inspects supplies destined for imperial forces.",
      },
      grandStorehouses: {
        name: "Grand Storehouses",
        type: "landmark",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Warehouses filled with uniforms, provisions, weapons, and equipment.",
      },
      logisticsBureau: {
        name: "Logistics Bureau",
        type: "landmark",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Coordinates military supply distribution across Sanguivorum.",
      },
      messengerHall: {
        name: "Messenger Hall",
        type: "landmark",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Dispatches official military communications throughout the Empire.",
      },
      wagonYard: {
        name: "Wagon Yard",
        type: "landmark",
        district: "Trade Quarter (The Logistics Quarter)",
        description:
          "Maintains the vast transport wagons serving the Legions.",
      },
      // ----------------------------------------------------- ARTISAN QUARTER
      academyWard: {
        name: "Academy Ward",
        type: "street",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Every craftsman here serves education and war.",
      },
      officersForge: {
        name: "Officer's Forge",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Produces ceremonial weapons, medals, and presentation arms.",
      },
      stonewrightAcademy: {
        name: "Stonewright Academy",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Constructs fortifications, monuments, and military architecture.",
      },
      standardWeaver: {
        name: "Standard Weaver",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Creates uniforms, banners, officer cloaks, and academy robes.",
      },
      cartographersHall: {
        name: "Cartographer's Hall",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Produces maps, surveying equipment, navigation charts, and military atlases.",
      },
      tacticalWorkshop: {
        name: "Tactical Workshop",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Builds training equipment, siege models, and educational tools.",
      },
      timberCorps: {
        name: "Timber Corps",
        type: "landmark",
        district: "Artisan Quarter (Academy Ward)",
        description:
          "Constructs wagons, bridges, siege frames, and academy facilities.",
      },
      // --------------------------------------------------- NOBLE QUARTER
      commandHeights: {
        name: "Command Heights",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Home to the Empire's greatest military minds.",
      },
      houseOfFirstStrategist: {
        name: "House of the First Strategist",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "Residence of Minervon's Ascendus senator.",
      },
      generalsEstates: {
        name: "General's Estates",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Homes of retired generals, academy masters, and distinguished commanders.",
      },
      embassyHall: {
        name: "Embassy Hall",
        type: "residential",
        district: "Noble Quarter (Command Heights)",
        description:
          "Hosts foreign observers studying Sanguivorum's military institutions.",
      },
      gardenOfVictory: {
        name: "Garden of Victory",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "A peaceful memorial dedicated to those whose leadership preserved the Empire.",
      },
      hallOfTriumphs: {
        name: "Hall of Triumphs",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "Recognizes extraordinary military leadership and scholarly achievement.",
      },
      strategistsCircle: {
        name: "Strategist's Circle",
        type: "landmark",
        district: "Noble Quarter (Command Heights)",
        description:
          "A private gathering place where generals, scholars, and instructors debate doctrine and history.",
      },
      // ------------------------------------------------ CITY LANDMARKS
      // Source repeats "The School of Manipulum Eruditetus" here as a City
      // Landmarks entry — already merged into the Arcane Quarter hub above,
      // so it's not recreated as a duplicate. Only the other three City
      // Landmarks entries are new.
      wallOfCampaigns: {
        name: "The Wall of Campaigns",
        type: "landmark",
        district: "City Landmarks",
        description:
          "An immense stone wall engraved with every major military campaign fought by Sanguivorum.",
      },
      fieldOfStandards: {
        name: "The Field of Standards",
        type: "landmark",
        district: "City Landmarks",
        description:
          "Hundreds of retired Legion standards stand in solemn remembrance of the armies that carried them.",
      },
      grandWarLibrary: {
        name: "The Grand War Library",
        type: "landmark",
        district: "City Landmarks",
        description:
          "A monumental archive preserving military doctrine, historical campaigns, maps, and tactical treatises.",
      },
    },
  },
  marsatum: {
    name: "Marsatum",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description:
      "A tense frontier city facing the generations-long cold war with Vaeloris across the treeline. Soldiers here talk about The Stump the way people elsewhere talk about weather — constantly, and never quite honestly.",
    connections: [
      { to: "decearon", days: 4, mode: "road" },
      { to: "victolath", days: 2, mode: "road" },
    ],
  },
  victolath: {
    name: "Victolath",
    nation: "sanguivorum",
    terrain: "plains",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description:
      "Sits near the burned clearing everyone calls The Stump, the scar left by the Reclamation War fifty-some years back. The border with Vaeloris is close enough here that the forest is visible from the wall.",
    connections: [
      { to: "marsatum", days: 2, mode: "road" },
      { to: "minervon", days: 3, mode: "road" },
      { to: "the_rivers_gate", days: 5, mode: "road", desc: "into the treeline" },
    ],
  },

  // --------------------------------------------------------------- VAELORIS
  the_rivers_gate: {
    name: "The River's Gate",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "The northern threshold of Vaeloris, where the Sylvara river begins its run south and the Kabal keeps a sovereign bridge that answers to neither nation on its banks. Ask no questions about what crosses at night.",
    connections: [
      { to: "victolath", days: 5, mode: "road" },
      { to: "arethon", days: 9, mode: "road" },
      { to: "sylmae", days: 6, mode: "river", desc: "downriver, 6 days by boat, 28 by foot" },
    ],
  },
  sylmae: {
    name: "Sylmae",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description: "A river town on the Sylvara, its docks built to elven proportions that make everyone else feel slightly too large for their boots.",
    connections: [
      { to: "the_rivers_gate", days: 6, mode: "river" },
      { to: "the_arbor", days: 4, mode: "river" },
    ],
  },
  the_arbor: {
    name: "The Arbor",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    type: "gate",
    danger: 2,
    services: ["rest", "shop", "healer", "guild"],
    description:
      "The largest tree in existence, and the seat of Sylvorn Vaelithar's rule over the triarchy of elves, lizardfolk, and dragonborn. The Witnessed watch from somewhere in its upper branches, and if you stand still long enough you start to feel watched back — not unkindly.",
    connections: [
      { to: "sylmae", days: 4, mode: "river" },
      { to: "kabal_tower", days: 5, mode: "river" },
      { to: "the_meadows_sentinel", days: 3, mode: "forest path" },
      { to: "orethmare", days: 4, mode: "forest path" },
      { to: "the_red_hold", days: 4, mode: "forest path", desc: "continuous dense forest, no shortcut" },
    ],
    sublocations: {
      hollow: {
        name: "The Root Hollow",
        type: "inn",
        description:
          "A rest-house grown into the Arbor's own roots rather than built beside them — elven carpenters shaped the wood centuries ago and it's simply kept growing since. Sleep here and you half-dream of rings countable in the walls.",
      },
      market: {
        name: "The Canopy Market",
        type: "market",
        description:
          "Stalls strung between lower branches and reached by rope bridge, trading in elven, lizardfolk, and dragonborn goods side by side — the one place in the triarchy where all three actually barter face to face.",
      },
      boughs: {
        name: "The Witnessed Boughs",
        type: "guildhall",
        description:
          "Climb high enough and the upper branches go quiet in a way that isn't natural silence. The Witnessed are said to keep council somewhere up here; you never quite see them, but standing still long enough, you feel seen back.",
      },
    },
  },
  the_meadows_sentinel: {
    name: "The Meadow's Sentinel",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description: "A watch-town at the forest's northeastern edge, named for the standing stone said to mark where the meadows end and the elves' authority begins.",
    connections: [
      { to: "the_arbor", days: 3, mode: "forest path" },
      { to: "orethmare", days: 3, mode: "forest path" },
    ],
  },
  orethmare: {
    name: "Orethmare",
    nation: "vaeloris",
    terrain: "swamp",
    isCity: true,
    danger: 3,
    services: ["rest"],
    description: "A wetland-edge settlement where the forest starts giving way to swamp, and wagons stop being useful.",
    connections: [
      { to: "the_arbor", days: 4, mode: "forest path" },
      { to: "the_confluence", days: 3, mode: "river" },
      { to: "the_swamps_near", days: 2, mode: "swamp" },
    ],
  },
  the_confluence: {
    name: "The Confluence",
    nation: "vaeloris",
    terrain: "swamp",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description:
      "A floating lizardfolk city where the Sylvara's manageable stretch ends and the deep wetland begins. Below here, the terrain stops caring what you brought a map for.",
    connections: [
      { to: "orethmare", days: 3, mode: "river" },
      { to: "drath_vorrumborrar", days: 5, mode: "swamp", desc: "guide required beyond this point" },
      { to: "dunmar", days: 4, mode: "road" },
    ],
  },
  drath_vorrumborrar: {
    name: "Drath Vorrumborrar",
    nation: "vaeloris",
    terrain: "swamp",
    isCity: false,
    type: "wilderness",
    danger: 5,
    services: [],
    description:
      "The deep swamp. Lizardfolk call it home and guide it; no one else finds their way through without one. Somewhere in its heart lives Druith — the Ancient — a crocodile that declined to stop growing and has thus far declined to die. The Great Lizard is said to speak here in a language older than the nations.",
    connections: [
      { to: "the_confluence", days: 5, mode: "swamp" },
      { to: "the_swamps_near", days: 2, mode: "swamp" },
    ],
  },
  the_swamps_near: {
    name: "The Swamp's Heart",
    nation: "vaeloris",
    terrain: "swamp",
    isCity: true,
    danger: 4,
    services: ["rest"],
    description: "A hidden lizardfolk settlement built around what the outside world isn't told is a hatchery. Outsiders who find it are usually meant to.",
    connections: [
      { to: "orethmare", days: 2, mode: "swamp" },
      { to: "drath_vorrumborrar", days: 2, mode: "swamp" },
      { to: "the_repose", days: 3, mode: "forest path" },
    ],
  },
  the_repose: {
    name: "The Repose",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description: "A quiet clearing town, popular with elven pilgrims for reasons no one explains to outsiders and outsiders have learned not to ask about twice.",
    connections: [
      { to: "the_swamps_near", days: 3, mode: "forest path" },
      { to: "the_reednold", days: 2, mode: "forest path" },
      { to: "dunmar", days: 3, mode: "road" },
    ],
  },
  the_reednold: {
    name: "The Reednold",
    nation: "vaeloris",
    terrain: "swamp",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description: "A reed-thatched trading post on the swamp's dry edge, the last place upriver where a non-lizardfolk trader can still do business without a guide.",
    connections: [
      { to: "the_repose", days: 2, mode: "forest path" },
      { to: "dunmar", days: 2, mode: "road" },
    ],
  },
  the_red_hold: {
    name: "The Red Hold",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description: "An undefeated fortress deep in Vaeloris forest, garrisoned by the Rooted Legion. No army has ever taken it and, by the look of the walls, none ever will.",
    connections: [
      { to: "the_arbor", days: 4, mode: "forest path" },
      { to: "dunmar", days: 6, mode: "forest path", desc: "continuous forest, no terrain relief" },
      { to: "kaelthir_reach", days: 3, mode: "forest path", desc: "the canopy thickens the whole way" },
    ],
  },
  kaelthir_reach: {
    name: "Kaelthir Reach",
    nation: "vaeloris",
    terrain: "jungle",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description:
      "Where the ancient forest thickens into true jungle and the canopy triples in height — dragonborn territory, the triarchy's least-visited third. The elves administer the treaties and the lizardfolk keep the swamp's secrets; here, the dragonborn keep their own council and rarely explain it to anyone who isn't one.",
    connections: [{ to: "the_red_hold", days: 3, mode: "forest path" }],
  },
  dunmar: {
    name: "Dunmar",
    nation: "vaeloris",
    terrain: "forest",
    isCity: true,
    danger: 3,
    services: ["rest", "shop", "guild"],
    description:
      "The official border crossing into Thraekor, controlled by the Keth-Orn clan on the dwarven side. Terms of passage have changed three times in the last decade — check before you commit to a route.",
    connections: [
      { to: "the_red_hold", days: 6, mode: "forest path" },
      { to: "the_confluence", days: 4, mode: "road" },
      { to: "the_repose", days: 3, mode: "road" },
      { to: "the_reednold", days: 2, mode: "road" },
      { to: "khaz_vetha", days: 3, mode: "road", desc: "terrain opens toward the volcanic transition" },
    ],
  },

  // --------------------------------------------------------------- SAHRIMOR
  sahurim: {
    name: "Sahurim",
    nation: "sahrimor",
    terrain: "desert",
    isCity: true,
    type: "gate",
    danger: 3,
    services: ["rest", "shop", "healer", "guild"],
    description:
      "A major desert hub built on caravan roads and the certainty that water is worth more than gold. The bridge road to Arethon runs straight through the Desert War's stalemated front.",
    connections: [
      { to: "kabal_tower", days: 6, mode: "road" },
      { to: "myssara", days: 17, mode: "road", desc: "guide and water essential" },
      { to: "nocturne", days: 15, mode: "road", desc: "elevation gain in the final stretch" },
      { to: "khaerun", days: 12, mode: "road", desc: "canyon terrain, pack animals only" },
      { to: "zyphera", days: 8, mode: "road" },
      { to: "eternatum_shore", days: 2, mode: "road" },
    ],
    sublocations: {
      tavern: {
        name: "The Waterworth Rest",
        type: "inn",
        description:
          "A rest-house that charges for its water before it charges for the room, per Sahrimor custom — pay it without complaint and the innkeeper warms up considerably. Caravan guards trade war-front rumors over lukewarm tea.",
      },
      market: {
        name: "The Caravan Bazaar",
        type: "market",
        description:
          "A sprawl of stalls that never fully closes, restocked by whichever caravan rolled in most recently. Everything's priced in water-equivalents first, gold second — a habit that confuses outsiders and no one bothers explaining.",
      },
      cistern: {
        name: "The Cistern Court",
        type: "landmark",
        description:
          "The public cistern and the law court that governs it share the same courtyard, deliberately — water disputes here get settled in view of the water itself. The Merchant King's seal is stamped on every rationing notice.",
      },
    },
  },
  eternatum_shore: {
    name: "Eternatum's Shore",
    nation: "sahrimor",
    terrain: "lake",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "The lake that should not exist here, ringed by a settlement that has never had to worry about water the way the rest of Sahrimor does. No one has ever found where it's fed from, and the Merchant King's surveyors have stopped trying.",
    connections: [{ to: "sahurim", days: 2, mode: "road" }],
  },
  myssara: {
    name: "Myssara",
    nation: "sahrimor",
    terrain: "desert",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "House Massa runs the commercial infrastructure here, at the terminus of the short bridge crossing to Kolven on Norrvael. Water guides for hire, if you can afford their rates.",
    connections: [
      { to: "sahurim", days: 17, mode: "road" },
      { to: "kolven", days: 1, mode: "bridge", desc: "toll and inspection, no bypass" },
    ],
  },
  nocturne: {
    name: "Nocturne",
    nation: "sahrimor",
    terrain: "mountain",
    isCity: true,
    danger: 3,
    services: ["rest", "guild"],
    description:
      "An isolated mountain-mass city at Sahrimor's far northern reach, cold in a way the rest of the nation refuses to believe. It's also headquarters to the Mugamiir Safor — the largest adventuring guild on the continent, founded a hundred thirty years ago by the survivors of the first serious Black Sands expedition. They predate Sahrimor as a formal nation, and act like it.",
    connections: [{ to: "sahurim", days: 15, mode: "road" }, { to: "iskarr", days: 3, mode: "road" }],
  },
  iskarr: {
    name: "Iskarr",
    nation: "sahrimor",
    terrain: "mountain",
    isCity: true,
    danger: 3,
    services: ["rest"],
    description: "A cold frontier town past Nocturne, the last waypoint before the continent's northern edge stops being mapped in any useful detail.",
    connections: [{ to: "nocturne", days: 3, mode: "road" }],
  },
  khaerun: {
    name: "Khaerun",
    nation: "sahrimor",
    terrain: "canyon",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description:
      "A canyon city built vertically into the rock, its switchback approach impassable to anything with wheels. Camels only, and a head for heights.",
    connections: [{ to: "sahurim", days: 12, mode: "road" }, { to: "escyndor", days: 4, mode: "road" }],
  },
  escyndor: {
    name: "Escyndor",
    nation: "sahrimor",
    terrain: "desert",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description: "A desert waypoint east of Khaerun, quiet except when the caravan season peaks.",
    connections: [{ to: "khaerun", days: 4, mode: "road" }, { to: "netivon", days: 3, mode: "road" }],
  },
  netivon: {
    name: "Netivon",
    nation: "sahrimor",
    terrain: "desert",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description: "A small trade town near Sahrimor's eastern edge.",
    connections: [{ to: "escyndor", days: 3, mode: "road" }],
  },
  zyphera: {
    name: "Zyphera",
    nation: "sahrimor",
    terrain: "desert",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description: "A desert market town near the southern trade roads, close enough to Myssara that the two cities' gossip arrives a day apart.",
    connections: [{ to: "sahurim", days: 8, mode: "road" }, { to: "myssara", days: 6, mode: "road" }],
  },

  // --------------------------------------------------------------- THRAEKOR
  khaz_vetha: {
    name: "Khaz-Vetha",
    nation: "thraekor",
    terrain: "mountain",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description: "A clan territory at the transitional edge where Vaeloris forest gives way to Thraekor stone. Pace improves noticeably heading south from here.",
    connections: [
      { to: "dunmar", days: 3, mode: "road" },
      { to: "trutek", days: 4, mode: "road" },
      { to: "velm", days: 5, mode: "road" },
    ],
  },
  trutek: {
    name: "Trutek",
    nation: "thraekor",
    terrain: "volcanic",
    isCity: true,
    danger: 3,
    services: ["rest", "shop"],
    description: "A transitional waypoint city, still solid ground, the volcanic interior's danger a rumor here rather than a daily fact.",
    connections: [{ to: "khaz_vetha", days: 4, mode: "road" }, { to: "vorseth", days: 5, mode: "road" }],
  },
  velm: {
    name: "Velm",
    nation: "thraekor",
    terrain: "volcanic",
    isCity: true,
    danger: 4,
    services: ["rest"],
    description: "A dwarven town on the edge of the true volcanic interior, where every local knows exactly which ground is safe and shares that knowledge with almost no one.",
    connections: [{ to: "khaz_vetha", days: 5, mode: "road" }, { to: "khar_adrel", days: 6, mode: "volcanic", desc: "guide required" }],
  },
  vorseth: {
    name: "Vorseth",
    altName: "Vorreth",
    nation: "thraekor",
    terrain: "volcanic",
    isCity: true,
    type: "gate",
    danger: 4,
    services: ["rest", "shop", "guild"],
    description:
      "A hold town deep enough in the ash fields that visitors are quietly counted on the way in and on the way out. Also home to the Magma-Hearth Guild — Thraekor's mercenary institution, formally independent of the clans, expected to support confederation wars at discount rather than for free. Its heavy infantry and siege specialists are the guild's calling card, and its long-running rivalry with Sahrimor's Mugamiir Safor is commercial, not personal — though both sides watch the other closely.",
    connections: [{ to: "trutek", days: 5, mode: "road" }, { to: "khar_vantr", days: 5, mode: "volcanic", desc: "guide required" }],
    sublocations: {
      tavern: {
        name: "The Ash-Counted Hearth",
        type: "inn",
        description:
          "Named half for the volcanic hearth-fires and half for the count kept on everyone who passes through — visitors are logged coming in and logged again going out, and the innkeeper does both without seeming to look up.",
      },
      market: {
        name: "The Cinder Market",
        type: "market",
        description:
          "Stalls set back from the ash-fall line, trading in what the mercenary trade actually needs: rations, rope, and gear that can survive a march through live volcanic ground.",
      },
      guildhall: {
        name: "The Magma-Hearth Guildhall",
        type: "guildhall",
        description:
          "Seat of the Magma-Hearth Guild — Thraekor's mercenary institution, heavy infantry and siege specialists first, everything else second. Contract boards line the entry hall, updated the moment a confederation war needs bodies.",
      },
    },
  },
  khar_adrel: {
    name: "Khar-Adrel",
    nation: "thraekor",
    terrain: "volcanic",
    isCity: true,
    danger: 5,
    services: ["rest", "guild"],
    description: "A stronghold clanhold near the volcano's shoulder, close enough to the lava fields that ashfall is just weather here.",
    connections: [
      { to: "velm", days: 6, mode: "volcanic" },
      { to: "khar_vantr", days: 3, mode: "volcanic" },
      { to: "keth_our", days: 4, mode: "road", desc: "sea exit often faster than continuing overland" },
    ],
  },
  khar_vantr: {
    name: "Khar-Vantr",
    nation: "thraekor",
    terrain: "volcanic",
    isCity: true,
    danger: 5,
    services: ["rest", "guild"],
    description:
      "The Stillwarden's seat, built against the shoulder of the active volcano the whole Confederation is named for its ashes. The Ash Principle is carved somewhere in every wall here — what remains after everything burns.",
    connections: [
      { to: "vorseth", days: 5, mode: "volcanic" },
      { to: "khar_adrel", days: 3, mode: "volcanic" },
      { to: "ashvel", days: 6, mode: "road" },
    ],
  },
  ashvel: {
    name: "Ashvel",
    nation: "thraekor",
    terrain: "coast",
    isCity: true,
    danger: 2,
    services: ["rest", "shop", "guild"],
    description: "A Low Hold coastal city, one of only two points where Thraekor trades by sea. A two-day coastal hop reaches Keth-Our.",
    connections: [
      { to: "khar_vantr", days: 6, mode: "road" },
      { to: "keth_our", days: 2, mode: "sea" },
    ],
  },
  keth_our: {
    name: "Keth-Our",
    nation: "thraekor",
    terrain: "coast",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description: "Thraekor's other primary sea-trade point, and the most-used dwarf-to-island crossing on the continent — a short strait run to the Skulvest bridge on Norrvael.",
    connections: [
      { to: "ashvel", days: 2, mode: "sea" },
      { to: "khar_adrel", days: 4, mode: "road" },
      { to: "skulvest", days: 3, mode: "sea", desc: "strait crossing to Norrvael" },
    ],
  },

  // --------------------------------------------------------------- NORRVAEL
  kolven: {
    name: "Kolven",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description:
      "Norrvael's northern bridgehead, terminus of the short crossing from Myssara. Everything that passes here is logged; the garrison commander's word on what's permitted is final and not up for debate.",
    connections: [
      { to: "myssara", days: 1, mode: "bridge" },
      { to: "dragenholm", days: 9, mode: "road", desc: "the island's commercial spine" },
    ],
  },
  dragenholm: {
    name: "Dragenholm",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    type: "gate",
    danger: 3,
    services: ["rest", "shop", "healer", "guild"],
    description:
      "Seat of House Dravenkov, and — if the oldest stories are true — named for a dragon that still sleeps somewhere beneath the mountains here, slowly waking. Empress Violetta Dravenkov rules from the cliff-hall above the canyon road.",
    connections: [
      { to: "kolven", days: 9, mode: "road" },
      { to: "runholm", days: 7, mode: "road" },
      { to: "askvele", days: 4, mode: "forest path" },
      { to: "isthvar", days: 6, mode: "mountain", desc: "deliberately hard to reach" },
    ],
    sublocations: {
      tavern: {
        name: "The Sleeping Wyrm",
        type: "inn",
        description:
          "Named for the dragon the old stories say sleeps under the mountains here, slowly waking. Regulars swear the floor hums some nights. The innkeeper swears it's just the cellar, and pours another round before anyone can ask twice.",
      },
      market: {
        name: "The Canyon Road Bazaar",
        type: "market",
        description:
          "Stalls lining the switchback where the canyon road opens into the city proper — the island's commercial spine ends here, so whatever Norrvael trades in eventually passes through this market.",
      },
      cliffhall: {
        name: "The Cliff-Hall",
        type: "guildhall",
        description:
          "Empress Violetta Dravenkov's seat, built into the cliff face above the canyon road so the whole city has to look up to see it. House Dravenkov business is conducted here, and very little of it is explained to outsiders.",
      },
    },
  },
  runholm: {
    name: "Runholm",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description: "A well-maintained canyon-road town, comfortably the easiest place on the island to just be a traveler for a while.",
    connections: [{ to: "dragenholm", days: 7, mode: "road" }, { to: "vorrikee", days: 5, mode: "mountain" }],
  },
  askvele: {
    name: "Askvele",
    nation: "norrvael",
    terrain: "forest",
    isCity: true,
    danger: 2,
    services: ["rest"],
    description: "A managed-forest region on Norrvael's canyon-road network, its timber carefully rationed by House Dravenkov decree.",
    connections: [{ to: "dragenholm", days: 4, mode: "forest path" }, { to: "vorrikee", days: 4, mode: "forest path" }],
  },
  isthvar: {
    name: "Isthvar",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    danger: 4,
    services: ["rest"],
    description: "A high plateau built to be difficult to reach, and successful at it. Whatever's up here chose the isolation on purpose.",
    connections: [
      { to: "dragenholm", days: 6, mode: "mountain" },
      { to: "vintherim", days: 4, mode: "tundra", desc: "the plateau's frozen approach" },
    ],
  },
  vintherim: {
    name: "Vintherim",
    nation: "norrvael",
    terrain: "tundra",
    isCity: true,
    danger: 3,
    services: ["rest"],
    description:
      "Where Norrvael's mountains give up and the permafrost takes over — the island's coldest inhabited edge, held by a clan that answers to House Dravenkov in name more than in practice.",
    connections: [{ to: "isthvar", days: 4, mode: "tundra" }],
  },
  vorrikee: {
    name: "Vorrikee",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    danger: 4,
    services: ["rest"],
    description: "A southwestern settlement, deliberately hard to reach, same as Isthvar — Norrvael seems to prefer it that way.",
    connections: [
      { to: "runholm", days: 5, mode: "mountain" },
      { to: "askvele", days: 4, mode: "forest path" },
      { to: "fielvern", days: 2, mode: "mountain" },
      { to: "skulvest", days: 3, mode: "mountain" },
    ],
  },
  fielvern: {
    name: "Fielvern",
    nation: "norrvael",
    terrain: "mountain",
    isCity: true,
    danger: 3,
    services: ["rest"],
    description: "A small hold near the island's southeastern coast, quiet and rarely visited by anyone not already Norrvael-born.",
    connections: [{ to: "vorrikee", days: 2, mode: "mountain" }],
  },
  skulvest: {
    name: "Skulvest",
    nation: "norrvael",
    terrain: "coast",
    isCity: true,
    danger: 2,
    services: ["rest", "shop"],
    description: "The western bridge terminus, facing the strait crossing back to Keth-Our on the Thraekor coast.",
    connections: [
      { to: "keth_our", days: 3, mode: "sea" },
      { to: "vorrikee", days: 3, mode: "mountain" },
    ],
  },
};

// Attach reverse lookup + validate on load
function getLocation(id) {
  return LOCATIONS[id];
}

function getNation(id) {
  return NATIONS[id];
}
